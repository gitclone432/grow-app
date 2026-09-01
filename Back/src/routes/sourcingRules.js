import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import SourcingRule from '../models/SourcingRule.js';
import AsinSourcingBatch from '../models/AsinSourcingBatch.js';
import SourcingRuleRun from '../models/SourcingRuleRun.js';
import { enqueueRun } from '../lib/sourcingRuleRunQueue.js';

const router = express.Router();

const FILTER_FIELDS = ['minRating', 'deliveryWithinDays', 'stock', 'active'];

function sanitizeExcludeKeywords(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(
    list.map((k) => String(k || '').trim()).filter(Boolean)
  )].slice(0, 50);
}

function sanitizeFilters(input = {}) {
  const out = {};
  FILTER_FIELDS.forEach((key) => {
    if (input[key] !== undefined) out[key] = input[key];
  });
  if (input.excludeKeywords !== undefined) out.excludeKeywords = sanitizeExcludeKeywords(input.excludeKeywords);
  return out;
}

/** GET / — list rules, newest first, with template/seller names populated. */
router.get('/', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const rules = await SourcingRule.find()
      .sort({ createdAt: -1 })
      .populate('template', 'name')
      .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
      .lean();

    // Attach each rule's current queued/processing run (if any), so the
    // Rules table can show live stage/status without a separate round-trip
    // per row, and so that status survives a page refresh (it's server
    // state, not local React state left behind by whichever tab clicked
    // "Run Now").
    const activeRuns = await SourcingRuleRun.find({
      rule: { $in: rules.map((r) => r._id) },
      status: { $in: ['queued', 'processing'] },
    }).sort({ queuedAt: 1 }).lean();
    const activeRunByRule = new Map(activeRuns.map((r) => [String(r.rule), r]));

    const withActiveRun = rules.map((rule) => ({
      ...rule,
      activeRun: activeRunByRule.get(String(rule._id)) || null,
    }));

    res.json(withActiveRun);
  } catch (err) {
    console.error('[SourcingRules] list:', err.message);
    res.status(500).json({ error: 'Failed to load sourcing rules' });
  }
});

/** POST / — create a rule. */
router.post('/', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const { templateId, sellerId, searchKeyword, priceMin, priceMax, region, targetAsinCount, filters, enabled, autoGenerateAndSave } = req.body || {};

    if (!templateId || !sellerId) {
      return res.status(400).json({ error: 'Template and seller are required' });
    }
    if (!searchKeyword || !String(searchKeyword).trim()) {
      return res.status(400).json({ error: 'Search keyword is required' });
    }
    if (!Number.isFinite(Number(targetAsinCount)) || Number(targetAsinCount) < 1) {
      return res.status(400).json({ error: 'A valid target ASIN count is required' });
    }

    const rule = await SourcingRule.create({
      template: templateId,
      seller: sellerId,
      searchKeyword: String(searchKeyword).trim(),
      priceMin: priceMin === '' || priceMin == null ? null : Number(priceMin),
      priceMax: priceMax === '' || priceMax == null ? null : Number(priceMax),
      region: ['US', 'UK', 'CA', 'AU'].includes(region) ? region : 'US',
      targetAsinCount: Number(targetAsinCount),
      filters: sanitizeFilters(filters),
      createdBy: req.user.userId,
      autoGenerateAndSave: Boolean(autoGenerateAndSave),
      enabled: enabled !== false,
    });

    res.status(201).json(rule);
  } catch (err) {
    console.error('[SourcingRules] create:', err.message);
    res.status(500).json({ error: 'Failed to create sourcing rule' });
  }
});

/** PATCH /:id — update a rule's config/enabled state. */
router.patch('/:id', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const { templateId, sellerId, searchKeyword, priceMin, priceMax, region, targetAsinCount, filters, enabled, autoGenerateAndSave } = req.body || {};
    const update = {};

    if (templateId !== undefined) update.template = templateId;
    if (sellerId !== undefined) update.seller = sellerId;
    if (searchKeyword !== undefined) update.searchKeyword = String(searchKeyword).trim();
    if (priceMin !== undefined) update.priceMin = priceMin === '' || priceMin == null ? null : Number(priceMin);
    if (priceMax !== undefined) update.priceMax = priceMax === '' || priceMax == null ? null : Number(priceMax);
    if (region !== undefined) update.region = ['US', 'UK', 'CA', 'AU'].includes(region) ? region : 'US';
    if (targetAsinCount !== undefined) {
      if (!Number.isFinite(Number(targetAsinCount)) || Number(targetAsinCount) < 1) {
        return res.status(400).json({ error: 'A valid target ASIN count is required' });
      }
      update.targetAsinCount = Number(targetAsinCount);
    }
    if (filters !== undefined) {
      const sanitized = sanitizeFilters(filters);
      Object.keys(sanitized).forEach((key) => {
        update[`filters.${key}`] = sanitized[key];
      });
    }
    if (enabled !== undefined) update.enabled = Boolean(enabled);
    if (autoGenerateAndSave !== undefined) update.autoGenerateAndSave = Boolean(autoGenerateAndSave);
    // createdBy is never accepted from the client — it's the identity used to
    // sign internal API calls (see lib/asinSourcingAutomation.js). Rules
    // created before this field existed have none; backfill it here from
    // whoever edits the rule next, so re-saving from the UI is enough to fix
    // "autoGenerateAndSave is on but the rule has no createdBy" runs.
    const existing = await SourcingRule.findById(req.params.id).select('createdBy');
    if (!existing) return res.status(404).json({ error: 'Sourcing rule not found' });
    if (!existing.createdBy) update.createdBy = req.user.userId;

    const rule = await SourcingRule.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!rule) return res.status(404).json({ error: 'Sourcing rule not found' });
    res.json(rule);
  } catch (err) {
    console.error('[SourcingRules] update:', err.message);
    res.status(500).json({ error: 'Failed to update sourcing rule' });
  }
});

/** DELETE /:id */
router.delete('/:id', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const rule = await SourcingRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Sourcing rule not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[SourcingRules] delete:', err.message);
    res.status(500).json({ error: 'Failed to delete sourcing rule' });
  }
});

/**
 * POST /:id/run-now — queues a run for this rule (does not wait for it to
 * finish). See lib/sourcingRuleRunQueue.js: at most SOURCING_MAX_CONCURRENT_RUNS
 * (default 2) execute at once across all rules; extras wait their turn.
 * Poll GET /:id/runs or watch the rule's `activeRun` (from GET /) for
 * progress — the response here is just "queued", not the outcome.
 */
router.post('/:id/run-now', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const rule = await SourcingRule.findById(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Sourcing rule not found' });

    // Backfill createdBy for legacy rules (predate this field) — needed so
    // autoGenerateAndSave can sign internal API calls. See PATCH / above.
    if (!rule.createdBy) {
      rule.createdBy = req.user.userId;
      await rule.save();
    }

    const run = await enqueueRun(rule._id, { trigger: 'manual', createdBy: req.user.userId });
    res.json({ success: true, runId: run._id, status: run.status });
  } catch (err) {
    console.error('[SourcingRules] run-now:', err.message);
    res.status(500).json({ error: err.message || 'Failed to queue sourcing run' });
  }
});

/** GET /:id/runs — a rule's run history, newest first. */
router.get('/:id/runs', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const runs = await SourcingRuleRun.find({ rule: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'username email')
      .lean();
    const total = await SourcingRuleRun.countDocuments({ rule: req.params.id });
    res.json({ runs, total });
  } catch (err) {
    console.error('[SourcingRules] list runs:', err.message);
    res.status(500).json({ error: 'Failed to load run history' });
  }
});

/** GET /runs/:runId — one run's full detail, for a live-polling detail view. */
router.get('/runs/:runId', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const run = await SourcingRuleRun.findById(req.params.runId)
      .populate('createdBy', 'username email')
      .populate('batch')
      .lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (err) {
    console.error('[SourcingRules] get run:', err.message);
    res.status(500).json({ error: 'Failed to load run' });
  }
});

/** GET /batches — recent batches for the dashboard panel. */
router.get('/batches', requireAuth, requirePageAccess('SourcingRules'), async (req, res) => {
  try {
    const batches = await AsinSourcingBatch.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('template', 'name')
      .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
      .lean();
    res.json(batches);
  } catch (err) {
    console.error('[SourcingRules] list batches:', err.message);
    res.status(500).json({ error: 'Failed to load sourcing batches' });
  }
});

/** GET /batches/:id — one batch's ASINs, for the Lab page handoff. */
router.get('/batches/:id', requireAuth, async (req, res) => {
  try {
    const batch = await AsinSourcingBatch.findById(req.params.id).lean();
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    console.error('[SourcingRules] get batch:', err.message);
    res.status(500).json({ error: 'Failed to load sourcing batch' });
  }
});

/** POST /batches/:id/consume — mark a batch consumed once opened in the Lab page. */
router.post('/batches/:id/consume', requireAuth, async (req, res) => {
  try {
    const batch = await AsinSourcingBatch.findOneAndUpdate(
      { _id: req.params.id, status: 'ready' },
      { $set: { status: 'consumed', consumedAt: new Date() } },
      { new: true }
    );
    if (!batch) return res.status(404).json({ error: 'Batch not found or already consumed' });
    res.json(batch);
  } catch (err) {
    console.error('[SourcingRules] consume batch:', err.message);
    res.status(500).json({ error: 'Failed to consume sourcing batch' });
  }
});

export default router;
