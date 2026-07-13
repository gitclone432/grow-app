import CronJobConfig from '../models/CronJobConfig.js';

export const ORDER_LISTING_QTY_JOB_KEY = 'orderListingQtyUpdate';

/** Whether auto set-quantity-to-1 on new orders is enabled (Cron Jobs page). */
export async function isOrderListingQtyUpdateEnabled() {
  const doc = await CronJobConfig.findOne({ jobKey: ORDER_LISTING_QTY_JOB_KEY }).lean();
  if (!doc) return false;
  return doc.enabled !== false;
}

/** Run pending listing qty updates only when the cron job is enabled. */
export async function processPendingListingQtyUpdatesIfEnabled(processFn, limit = 50) {
  if (!(await isOrderListingQtyUpdateEnabled())) {
    return { processed: 0, updated: 0, failed: 0, skipped: true };
  }
  return processFn(limit);
}
