import cron from 'node-cron';
import Attendance from './models/Attendance.js';
import CronJobConfig from './models/CronJobConfig.js';
import { runScheduledUploads } from './lib/ebayFeedUpload.js';
import {
  scheduledSyncAllSellers,
  scheduledRunAutoCompatForDate,
  scheduledPollNewOrders,
  refreshPayoneerFeedCache,
  processPendingPolicyMessages,
  processPendingListingQtyUpdates,
} from './routes/ebay.js';
import { importTransactionsFromGmail } from './utils/gmailTransactionImporter.js';
import { runScheduledDirectListJobs } from './lib/directListJobRunner.js';

const scheduledTaskMap = new Map();

const gmailImportEnabled = String(process.env.GMAIL_IMPORT_ENABLED || '').toLowerCase() === 'true';

export const CRON_JOB_DEFINITIONS = [
  {
    jobKey: 'dailyTimerAutoStop',
    label: 'Daily timer auto-stop',
    description: 'Auto-stop active attendance timers and mark records completed.',
    cronExpr: '0 2 * * *',
    timezone: 'Asia/Kolkata',
    enabled: true,
  },
  {
    jobKey: 'csvAutoUpload',
    label: 'Auto-upload CSV',
    description: 'Run scheduled CSV uploads.',
    cronExpr: '* * * * *',
    timezone: '',
    enabled: true,
  },
  {
    jobKey: 'directListBulkJobs',
    label: 'Scheduled bulk Direct List',
    description: 'Process queued bulk Direct List jobs (batches of ASINs to eBay).',
    cronExpr: '* * * * *',
    timezone: '',
    enabled: true,
  },
  {
    jobKey: 'pollAllSellers',
    label: 'Poll all sellers',
    description: 'Sync all sellers listings from eBay.',
    cronExpr: '0 1 * * *',
    timezone: 'Asia/Kolkata',
    enabled: true,
  },
  {
    jobKey: 'pollNewOrders',
    label: 'Poll new orders',
    description: 'Fetch and import new eBay orders for all connected sellers.',
    cronExpr: '*/10 * * * *',
    timezone: 'Asia/Kolkata',
    enabled: false,
  },
  {
    jobKey: 'orderListingQtyUpdate',
    label: 'Set listing qty to 1 on new order',
    description: 'After a new order is imported, set each line item listing quantity to 1 via eBay Trading API (ReviseInventoryStatus). Respects Exclude Order Qty Skips. When disabled, no qty updates run (including after order polls).',
    cronExpr: '*/5 * * * *',
    timezone: 'Asia/Kolkata',
    enabled: false,
  },
  {
    jobKey: 'policyMessages',
    label: 'Order policy messages',
    description: 'Send buyer policy messages for eligible eBay orders (~20 min after order). When disabled, automatic sends after order polls are also skipped.',
    cronExpr: '*/5 * * * *',
    timezone: 'Asia/Kolkata',
    enabled: true,
  },
  {
    jobKey: 'autoCompatRunForDate',
    label: 'Auto-compat run-for-date',
    description: 'Run auto-compat for previous IST day.',
    cronExpr: '35 1 * * *',
    timezone: 'Asia/Kolkata',
    enabled: true,
  },
  {
    jobKey: 'gmailImport',
    label: 'Gmail transactions import',
    description: 'Import transactions from Gmail into database.',
    cronExpr: String(process.env.GMAIL_IMPORT_CRON || '*/5 * * * *').trim(),
    timezone: '',
    enabled: gmailImportEnabled,
  },
  {
    jobKey: 'payoneerFeedRefresh',
    label: 'Payoneer eBay payout cache',
    description: 'Fetch SUCCEEDED payouts from eBay and save to MongoDB for Payoneer sheet.',
    cronExpr: '30 2 * * *',
    timezone: 'Asia/Kolkata',
    enabled: true,
  },
];

function stopAllScheduledTasks() {
  for (const [, task] of scheduledTaskMap.entries()) {
    try {
      task.stop();
      task.destroy();
    } catch {
      // ignore
    }
  }
  scheduledTaskMap.clear();
}

export async function ensureCronConfigDefaults() {
  for (const def of CRON_JOB_DEFINITIONS) {
    await CronJobConfig.updateOne(
      { jobKey: def.jobKey },
      { $setOnInsert: def },
      { upsert: true }
    );
  }
}

async function runDailyTimerAutoStop() {
  console.log('[CRON] Running daily timer auto-stop...');
  const activeRecords = await Attendance.find({ status: 'active' });
  let stoppedCount = 0;
  for (const attendance of activeRecords) {
    if (attendance.sessions.length > 0) {
      const lastSession = attendance.sessions[attendance.sessions.length - 1];
      if (!lastSession.endTime) lastSession.endTime = new Date();
    }
    attendance.status = 'completed';
    attendance.calculateTotalWorkTime();
    await attendance.save();
    stoppedCount += 1;
  }
  console.log(`[CRON] Auto-stopped ${stoppedCount} active timer(s)`);
}

async function runCsvAutoUpload() {
  await runScheduledUploads();
}

async function runDirectListBulkJobs() {
  await runScheduledDirectListJobs();
}

async function runPollAllSellers() {
  console.log('[CRON] Scheduled Poll All Sellers starting...');
  await scheduledSyncAllSellers();
}

async function runPollNewOrders() {
  console.log('[CRON] Scheduled Poll New Orders starting...');
  await scheduledPollNewOrders();
}

async function runOrderListingQtyUpdate() {
  console.log('[CRON] Listing qty update starting…');
  const result = await processPendingListingQtyUpdates(50);
  console.log(`[CRON] Listing qty update: processed=${result.processed}, updated=${result.updated}, failed=${result.failed}`);
}

async function runPolicyMessages() {
  console.log('[CRON] Policy messages starting...');
  const result = await processPendingPolicyMessages(50);
  console.log(`[CRON] Policy messages: processed=${result.processed}, sent=${result.sent}, failed=${result.failed}`);
}

async function runAutoCompatForDate() {
  const now = new Date();
  const istNow = new Date(now.getTime() + (330 * 60 * 1000));
  const yesterdayIST = new Date(istNow.getTime() - (24 * 60 * 60 * 1000));
  const targetDate = yesterdayIST.toISOString().slice(0, 10);
  console.log(`[CRON] Scheduled Auto-Compat for ${targetDate} starting...`);
  await scheduledRunAutoCompatForDate(targetDate);
}

async function runGmailImport() {
  const report = await importTransactionsFromGmail({
    limit: Math.max(1, Math.min(100, Number(process.env.GMAIL_IMPORT_LIMIT || 25))),
  });
  console.log(`[CRON] Gmail import scanned=${report.scanned} imported=${report.imported} skipped=${report.skipped}`);
}

async function runPayoneerFeedRefresh() {
  console.log('[CRON] Payoneer eBay payout cache refresh starting…');
  const result = await refreshPayoneerFeedCache();
  console.log(`[CRON] Payoneer feed cache saved ${result?.total ?? 0} row(s)`);
}

const CRON_JOB_HANDLERS = {
  dailyTimerAutoStop: runDailyTimerAutoStop,
  csvAutoUpload: runCsvAutoUpload,
  directListBulkJobs: runDirectListBulkJobs,
  pollAllSellers: runPollAllSellers,
  pollNewOrders: runPollNewOrders,
  orderListingQtyUpdate: runOrderListingQtyUpdate,
  policyMessages: runPolicyMessages,
  autoCompatRunForDate: runAutoCompatForDate,
  gmailImport: runGmailImport,
  payoneerFeedRefresh: runPayoneerFeedRefresh,
};

function scheduleJob(config) {
  const { jobKey, cronExpr, timezone, enabled } = config;
  if (!enabled) {
    console.log(`[CRON] Skipped disabled job: ${jobKey}`);
    return;
  }
  if (!cron.validate(cronExpr)) {
    console.error(`[CRON] Invalid expression for ${jobKey}: ${cronExpr}`);
    return;
  }
  const handler = CRON_JOB_HANDLERS[jobKey];
  if (!handler) return;
  const options = timezone ? { timezone } : undefined;
  const task = cron.schedule(cronExpr, async () => {
    try {
      await handler();
    } catch (err) {
      console.error(`[CRON] Error in ${jobKey}:`, err.message || err);
    }
  }, options);
  scheduledTaskMap.set(jobKey, task);
  console.log(`[CRON] Scheduled job initialized: ${jobKey} (${cronExpr}${timezone ? `, ${timezone}` : ''})`);
}

export async function reloadScheduledJobs() {
  stopAllScheduledTasks();
  const configs = await CronJobConfig.find().lean();
  for (const config of configs) {
    scheduleJob(config);
  }
}

export async function initializeScheduledJobs() {
  await ensureCronConfigDefaults();
  await reloadScheduledJobs();
}
