import express from 'express';
import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import CronJobConfig from '../models/CronJobConfig.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { CRON_JOB_DEFINITIONS, ensureCronConfigDefaults, reloadScheduledJobs } from '../scheduledJobs.js';

const router = express.Router();

router.get('/', requireAuth, requirePageAccess('CronJobs'), async (req, res) => {
  try {
    await ensureCronConfigDefaults();
    const rows = await CronJobConfig.find().sort({ label: 1 }).lean();
    const withNextRun = rows.map((row) => {
      let nextRunAt = null;
      let nextRunError = '';
      try {
        if (row.enabled && row.cronExpr && cron.validate(row.cronExpr)) {
          const interval = CronExpressionParser.parse(row.cronExpr, {
            tz: row.timezone || undefined,
          });
          nextRunAt = interval.next().toDate().toISOString();
        }
      } catch (err) {
        nextRunError = err?.message || 'Failed to calculate next run';
      }
      return {
        ...row,
        nextRunAt,
        nextRunError,
      };
    });
    res.json(withNextRun);
  } catch (err) {
    console.error('[CronJobs] list:', err.message);
    res.status(500).json({ error: 'Failed to load cron jobs' });
  }
});

router.put('/:jobKey', requireAuth, requirePageAccess('CronJobs'), async (req, res) => {
  try {
    await ensureCronConfigDefaults();
    const jobKey = String(req.params.jobKey || '').trim();
    const definition = CRON_JOB_DEFINITIONS.find((x) => x.jobKey === jobKey);
    if (!definition) return res.status(404).json({ error: 'Unknown cron job key' });

    const cronExpr = String(req.body?.cronExpr || '').trim();
    const timezone = String(req.body?.timezone || definition.timezone || '').trim();
    const enabled = Boolean(req.body?.enabled);

    if (!cronExpr) return res.status(400).json({ error: 'cronExpr is required' });
    if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' });

    const doc = await CronJobConfig.findOneAndUpdate(
      { jobKey },
      {
        $set: {
          cronExpr,
          timezone,
          enabled,
          label: definition.label,
          description: definition.description,
        },
      },
      { new: true, upsert: true }
    ).lean();

    await reloadScheduledJobs();
    res.json(doc);
  } catch (err) {
    console.error('[CronJobs] update:', err.message);
    res.status(500).json({ error: 'Failed to update cron job' });
  }
});

export default router;
