import CronJobConfig from '../models/CronJobConfig.js';

export const POLICY_MESSAGES_JOB_KEY = 'policyMessages';

/** Whether automatic policy messages are enabled (Cron Jobs → Order policy messages). */
export async function isPolicyMessagesEnabled() {
  const doc = await CronJobConfig.findOne({ jobKey: POLICY_MESSAGES_JOB_KEY }).lean();
  if (!doc) return true;
  return doc.enabled !== false;
}

/**
 * Run pending policy messages only when the cron job is enabled.
 * Manual sends (Fulfillment button) should call processPendingPolicyMessages directly.
 */
export async function processPendingPolicyMessagesIfEnabled(processFn, limit = 50) {
  if (!(await isPolicyMessagesEnabled())) {
    return { processed: 0, sent: 0, failed: 0, skipped: true };
  }
  return processFn(limit);
}
