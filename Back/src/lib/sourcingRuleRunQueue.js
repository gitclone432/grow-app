import SourcingRule from '../models/SourcingRule.js';
import SourcingRuleRun from '../models/SourcingRuleRun.js';
import { runSourcingRule } from './asinSourcingAutomation.js';

/**
 * In-process concurrency-limited queue for SourcingRule executions
 * ("Run Now" clicks and cron ticks alike). This app is single-process, so
 * an in-memory counter is enough to cap concurrency — same style as
 * withEbayPollRun in routes/ebay.js. State that must survive a page refresh
 * or a server restart (queued/processing/done, current stage, history) lives
 * on the SourcingRuleRun documents themselves, not in memory.
 */
const MAX_CONCURRENT_SOURCING_RUNS = parseInt(process.env.SOURCING_MAX_CONCURRENT_RUNS, 10) || 2;
let activeRunCount = 0;

/**
 * Creates a queued run for `ruleId`, unless one is already queued/processing
 * for that same rule (returns the existing one instead — repeated "Run Now"
 * clicks on one rule don't pile up duplicate queue entries; different rules
 * queue independently). Kicks the queue so a free slot picks it up right away.
 */
export async function enqueueRun(ruleId, { trigger, createdBy = null } = {}) {
  const existing = await SourcingRuleRun.findOne({
    rule: ruleId,
    status: { $in: ['queued', 'processing'] },
  }).sort({ queuedAt: -1 });
  if (existing) return existing;

  const run = await SourcingRuleRun.create({
    rule: ruleId,
    trigger,
    createdBy,
    status: 'queued',
  });

  processQueue().catch((err) => console.error('[Sourcing Queue] processQueue error:', err.message));
  return run;
}

/** Executes one queued run, updating its status/summary/error on completion. */
async function executeQueuedRun(runDoc) {
  try {
    const rule = await SourcingRule.findById(runDoc.rule);
    if (!rule) {
      await SourcingRuleRun.updateOne(
        { _id: runDoc._id },
        { $set: { status: 'failed', error: 'Sourcing rule no longer exists', completedAt: new Date() } }
      );
      return;
    }

    const result = await runSourcingRule(rule, runDoc);
    await SourcingRuleRun.updateOne(
      { _id: runDoc._id },
      {
        $set: {
          status: 'done',
          summary: result.summary,
          shortfall: result.shortfall,
          completedAt: new Date(),
        },
      }
    );
  } catch (error) {
    console.error(`[Sourcing Queue] Run ${runDoc._id} (rule ${runDoc.rule}) failed:`, error.message);
    await SourcingRuleRun.updateOne(
      { _id: runDoc._id },
      { $set: { status: 'failed', error: error.message || 'Sourcing run failed', completedAt: new Date() } }
    );
  } finally {
    activeRunCount = Math.max(0, activeRunCount - 1);
    // Self-draining chain: a finished slot immediately tries to pick up the
    // next queued run, so nothing waits on the next cron tick or click.
    processQueue().catch((err) => console.error('[Sourcing Queue] processQueue error:', err.message));
  }
}

/**
 * Fills any free execution slots (up to MAX_CONCURRENT_SOURCING_RUNS) with
 * the oldest queued runs, across all rules. Safe to call repeatedly/from
 * multiple places (enqueue, completion, the periodic cron tick) — it only
 * acts while slots are actually free.
 */
export async function processQueue() {
  while (activeRunCount < MAX_CONCURRENT_SOURCING_RUNS) {
    const nextRun = await SourcingRuleRun.findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'processing', startedAt: new Date() } },
      { sort: { queuedAt: 1 }, new: true }
    );
    if (!nextRun) break;

    activeRunCount += 1;
    executeQueuedRun(nextRun); // not awaited — runs concurrently with the loop
  }
}

/**
 * Called once at server boot (see scheduledJobs.js's initializeScheduledJobs)
 * — any run left 'processing' from before a crash/restart can never
 * complete on its own (the in-memory activeRunCount reset to 0), so it would
 * silently block that rule's queue slot forever. Fail it instead.
 */
/**
 * Cron entry point (see scheduledJobs.js's asinSourcingAutomation job):
 * enqueues a run for every enabled rule, then lets the queue's own
 * self-draining chain execute them (capped at MAX_CONCURRENT_SOURCING_RUNS).
 * enqueueRun's own per-rule dedup means a rule still mid-run from a prior
 * tick is skipped here, not double-queued.
 */
export async function runAllDueSourcingRules() {
  const rules = await SourcingRule.find({ enabled: true }).select('_id').lean();
  const runs = [];
  for (const rule of rules) {
    try {
      const run = await enqueueRun(rule._id, { trigger: 'cron' });
      runs.push({ ruleId: rule._id, ok: true, runId: run._id, status: run.status });
    } catch (error) {
      runs.push({ ruleId: rule._id, ok: false, error: error.message });
    }
  }
  return runs;
}

export async function resetStuckSourcingRuns() {
  const result = await SourcingRuleRun.updateMany(
    { status: 'processing' },
    { $set: { status: 'failed', error: 'Interrupted by server restart', completedAt: new Date() } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[Sourcing Queue] Reset ${result.modifiedCount} stuck run(s) from a previous server session.`);
  }
}
