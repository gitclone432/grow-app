import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import Seller from '../models/Seller.js';
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import SkuIndexSyncRun from '../models/SkuIndexSyncRun.js';
import { ensureValidToken } from '../routes/ebay.js';

export const RUNNER_ID = process.env.RUNNER_ID || 'local';

// SKU INDEX — FAST DB-BACKED ACTIVE CHECK
// ============================================
const MARKETPLACE_SITE_IDS = {
  EBAY_US: '0', EBAY_AU: '15', EBAY_GB: '3', EBAY_CA: '2',
  EBAY_DE: '77', EBAY_FR: '71', EBAY_IT: '101', EBAY_ES: '186',
};

// Strip a trailing -<number> suffix from a SKU (e.g. GRW25N4VFV-1 → GRW25N4VFV)
export function extractBaseSku(sku) {
  if (!sku) return '';
  const parts = sku.split('-');
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join('-');
  }
  return sku;
}

// In-memory tracking: sellerId (string) → { status, startedAt, totalCount, lastSyncAt, error }
export const skuSyncStatus = new Map();
export const skuSyncDismissed = new Set();
export const SKU_SYNC_CONCURRENCY = 3;
const SKU_SYNC_PAGE_RETRY_DELAYS_MS = [60_000, 180_000, 300_000];
let activeSkuSyncRunId = null;
let skuSyncStopRequested = false;

export function getActiveRunMeta() {
  return {
    activeRunId: activeSkuSyncRunId,
    stopRequested: skuSyncStopRequested,
  };
}

export function getActiveSkuSyncRunId() {
  return activeSkuSyncRunId;
}

export function setActiveSkuSyncRunId(id) {
  activeSkuSyncRunId = id;
}

export function isSkuSyncStopRequested() {
  return skuSyncStopRequested;
}

export function setSkuSyncStopRequested(value) {
  skuSyncStopRequested = Boolean(value);
}

export function getSkuSyncStatusSnapshot(sellerId) {
  const key = String(sellerId);
  const mem = skuSyncStatus.get(key) || { status: 'idle' };
  return { ...mem, dismissed: skuSyncDismissed.has(key) };
}

function throwIfSkuSyncDismissed(sellerId) {
  if (skuSyncDismissed.has(String(sellerId))) {
    throw new Error('SKU index sync dismissed');
  }
  if (skuSyncStopRequested) {
    throw new Error('SKU index sync stopped');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientSkuSyncError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const status = error?.response?.status;

  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(code)) return true;
  if (status === 408 || status === 429 || (status >= 500 && status < 600)) return true;
  return (
    message.includes('system error') ||
    message.includes('try again later') ||
    message.includes('temporarily unavailable') ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
}

async function withSkuSyncPageRetry({ sellerId, page, action }) {
  for (let attempt = 0; attempt <= SKU_SYNC_PAGE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await action();
    } catch (error) {
      const canRetry = attempt < SKU_SYNC_PAGE_RETRY_DELAYS_MS.length && isTransientSkuSyncError(error);
      if (!canRetry) throw error;

      const delayMs = SKU_SYNC_PAGE_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[sync-sku-index] seller=${sellerId} page=${page} transient error: ${error.message}. ` +
        `Retrying in ${Math.round(delayMs / 1000)}s (${attempt + 1}/${SKU_SYNC_PAGE_RETRY_DELAYS_MS.length})`
      );
      await sleep(delayMs);
      throwIfSkuSyncDismissed(sellerId);
    }
  }
}

export async function updateSkuIndexRunSeller(runId, sellerId, patch = {}) {
  if (!runId) return;
  await SkuIndexSyncRun.updateOne(
    { _id: runId, 'sellers.seller': sellerId },
    { $set: Object.fromEntries(Object.entries(patch).map(([key, value]) => [`sellers.$.${key}`, value])) }
  );
}

async function markInterruptedSkuIndexRuns() {
  const now = new Date();
  await SkuIndexSyncRun.updateMany(
    { status: { $in: ['queued', 'running', 'stopping'] } },
    {
      $set: {
        status: 'interrupted',
        interruptedAt: now,
        completedAt: now,
        error: 'Server restarted before this SKU index sync run finished.',
      },
    }
  );
  await SkuIndexSyncRun.updateMany(
    {
      status: 'interrupted',
      'sellers.status': { $in: ['queued', 'running'] },
    },
    {
      $set: {
        'sellers.$[seller].status': 'interrupted',
        'sellers.$[seller].completedAt': now,
        'sellers.$[seller].error': 'Server restarted before this seller sync finished.',
      },
    },
    { arrayFilters: [{ 'seller.status': { $in: ['queued', 'running'] } }] }
  );
}

// Background sync — paginates GetSellerList to rebuild the SellerSkuIndex collection.
// send(obj) is an optional SSE callback for live progress; omit for fire-and-forget.
export function getSkuSyncWindow(syncStart = new Date()) {
  return {
    syncStart,
    endTimeFrom: syncStart,
    endTimeTo: new Date(syncStart.getTime() + 120 * 24 * 60 * 60 * 1000),
  };
}

export async function runSkuIndexSync(seller, send = null, options = {}) {
  const syncStart = options.syncStart ? new Date(options.syncStart) : new Date();
  const sellerId = seller._id.toString();
  throwIfSkuSyncDismissed(sellerId);

  // Mirror the live-tiers approach: EndTimeFrom=now covers all currently active listings
  // (their end time is in the future). Use 120 days to catch long fixed-duration listings.
  // SITEID=0 is used unconditionally (same as live-tiers) so USD price fields always resolve.
  const endTimeFrom = (options.endTimeFrom ? new Date(options.endTimeFrom) : syncStart).toISOString();
  const endTimeTo = (options.endTimeTo ? new Date(options.endTimeTo) : new Date(syncStart.getTime() + 120 * 24 * 60 * 60 * 1000)).toISOString();

  let page = Math.max(1, Number(options.startPage || 1));
  let totalPages = Math.max(1, Number(options.totalPages || 1));
  let totalCount = Math.max(0, Number(options.initialCount || 0));
  const seenItemIds = new Set(options.seenItemIds || []);
  let duplicateItemCount = 0;
  // Cache once — set by the SSE endpoint before invoking this function
  const startedAt = skuSyncStatus.get(sellerId)?.startedAt ?? syncStart;

  while (page <= totalPages) {
    throwIfSkuSyncDismissed(sellerId);
    // Re-check token on every page — covers multi-minute crawls where token may expire mid-loop
    const token = await ensureValidToken(seller);

    console.log(`[sync-sku-index] seller=${sellerId} page=${page}/${totalPages}`);

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ItemReturnDescription</DetailLevel>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
  <OutputSelector>ItemArray.Item.ItemID</OutputSelector>
  <OutputSelector>ItemArray.Item.SKU</OutputSelector>
  <OutputSelector>ItemArray.Item.Title</OutputSelector>
  <OutputSelector>ItemArray.Item.SellingStatus.CurrentPrice</OutputSelector>
  <OutputSelector>PaginationResult</OutputSelector>
</GetSellerListRequest>`;

    const resp = await withSkuSyncPageRetry({
      sellerId,
      page,
      action: async () => {
        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
          headers: {
            'X-EBAY-API-CALL-NAME': 'GetSellerList',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
            'Content-Type': 'text/xml',
          },
        });

        const result = await parseStringPromise(response.data);
        const parsedResp = result.GetSellerListResponse;

        if (parsedResp?.Ack?.[0] === 'Failure') {
          const errMsg = parsedResp.Errors?.[0]?.LongMessage?.[0] || parsedResp.Errors?.[0]?.ShortMessage?.[0] || 'eBay API failure';
          console.error(`[sync-sku-index] eBay Failure on page ${page}:`, JSON.stringify(parsedResp.Errors));
          throw new Error(`eBay error on page ${page}: ${errMsg}`);
        }

        return parsedResp;
      },
    });

    const pagination = resp?.PaginationResult?.[0];
    totalPages = parseInt(pagination?.TotalNumberOfPages?.[0] || '1', 10);
    const totalEntries = parseInt(pagination?.TotalNumberOfEntries?.[0] || '0', 10);
    const items = resp?.ItemArray?.[0]?.Item || [];

    const ops = [];
    let skuBlankCount = 0;
    let skuPresentCount = 0;
    for (const item of items) {
      const itemId = item.ItemID?.[0];
      if (!itemId) continue;
      if (seenItemIds.has(itemId)) {
        duplicateItemCount++;
      } else {
        seenItemIds.add(itemId);
      }
      const sku = item.SKU?.[0] || '';
      const currentPrice = item.SellingStatus?.[0]?.CurrentPrice?.[0];
      const price = currentPrice?._ != null ? Number.parseFloat(currentPrice._) : null;
      const currency = currentPrice?.$?.currencyID || '';
      if (sku) skuPresentCount++; else skuBlankCount++;
      ops.push({
        updateOne: {
          filter: { seller: seller._id, itemId },
          update: { $set: { sku, baseSku: extractBaseSku(sku), title: item.Title?.[0] || '', price, currency, syncedAt: syncStart } },
          upsert: true,
        },
      });
    }
    console.log(`[sync-sku-index] page=${page}/${totalPages} totalEntries=${totalEntries} inPage=${items.length} skuPresent=${skuPresentCount} skuBlank=${skuBlankCount}`);

    if (ops.length > 0) {
      await SellerSkuIndex.bulkWrite(ops);
      totalCount += ops.length;
    }

    const progress = { page, totalPages, totalEntries, count: totalCount };
    const previousStatus = skuSyncStatus.get(sellerId) || {};
    skuSyncStatus.set(sellerId, {
      ...previousStatus,
      status: 'running',
      startedAt,
      totalCount,
      progress,
    });
    if (options.onProgress) await options.onProgress(progress);
    if (send) send({ type: 'progress', ...progress });

    page++;
  }

  throwIfSkuSyncDismissed(sellerId);
  // Remove stale records — only runs if ALL pages completed without error (any throw above skips this)
  const cleanup = await SellerSkuIndex.deleteMany({ seller: seller._id, syncedAt: { $lt: syncStart } });
  const finalDbCount = await SellerSkuIndex.countDocuments({ seller: seller._id });

  console.log(
    `[sync-sku-index] seller=${sellerId} DONE - processed=${totalCount} uniqueItemIds=${seenItemIds.size} ` +
    `duplicates=${duplicateItemCount} cleanupDeleted=${cleanup.deletedCount || 0} finalDbCount=${finalDbCount}`
  );
  return {
    totalCount: finalDbCount,
    processedCount: totalCount,
    uniqueItemCount: seenItemIds.size,
    duplicateItemCount,
    cleanupDeleted: cleanup.deletedCount || 0,
    syncedAt: syncStart,
  };
}

export async function dismissSellerSync(sellerId) {
  const key = String(sellerId);
  const current = skuSyncStatus.get(key);
  skuSyncDismissed.add(key);
  skuSyncStatus.set(key, {
    ...current,
    status: 'dismissed',
    dismissedAt: new Date(),
    error: null,
  });
  if (activeSkuSyncRunId) {
    await updateSkuIndexRunSeller(activeSkuSyncRunId, sellerId, {
      status: 'dismissed',
      dismissedAt: new Date(),
      completedAt: new Date(),
      error: null,
    });
  }
  return { success: true, status: 'dismissed' };
}

export async function requestCronStop() {
  const activeRun = activeSkuSyncRunId
    ? await SkuIndexSyncRun.findById(activeSkuSyncRunId).select('_id').lean()
    : await SkuIndexSyncRun.findOne({ status: { $in: ['queued', 'running', 'stopping'] } }).sort({ startedAt: -1 }).select('_id').lean();

  if (!activeRun) {
    return { ok: false, statusCode: 409, body: { success: false, message: 'No active SKU index cron sync is running.' } };
  }

  const now = new Date();
  skuSyncStopRequested = true;
  activeSkuSyncRunId = activeRun._id;

  for (const [sellerId, state] of skuSyncStatus.entries()) {
    if (state?.source === 'cron' && state.status === 'queued') {
      skuSyncDismissed.add(String(sellerId));
      skuSyncStatus.set(String(sellerId), { ...state, status: 'dismissed', dismissedAt: now });
    }
  }

  await SkuIndexSyncRun.updateOne(
    { _id: activeRun._id },
    {
      $set: {
        status: 'stopping',
        requestedStop: true,
        stopRequestedAt: now,
      },
    }
  );
  await SkuIndexSyncRun.updateOne(
    { _id: activeRun._id },
    {
      $set: {
        'sellers.$[seller].status': 'dismissed',
        'sellers.$[seller].dismissedAt': now,
        'sellers.$[seller].completedAt': now,
      },
    },
    { arrayFilters: [{ 'seller.status': 'queued' }] }
  );

  return { ok: true, statusCode: 200, body: { success: true, status: 'stopping', runId: activeRun._id } };
}

async function resumeSkuIndexSyncRun(runId) {
  if (activeSkuSyncRunId) {
    console.log(`[SKU Index Resume] Another SKU run is already active (${activeSkuSyncRunId}), skipping resume for ${runId}.`);
    return [];
  }

  const run = await SkuIndexSyncRun.findById(runId).lean();
  if (!run || run.requestedStop || !run.syncStartedAt || !run.endTimeFrom || !run.endTimeTo) return [];

  const pendingRunSellers = (run.sellers || []).filter(s => ['queued', 'running'].includes(s.status));
  if (pendingRunSellers.length === 0) {
    await SkuIndexSyncRun.updateOne(
      { _id: run._id },
      { $set: { status: 'completed', completedAt: new Date() } }
    );
    return [];
  }

  const sellerDocs = await Seller.find({ _id: { $in: pendingRunSellers.map(s => s.seller) } })
    .populate('user', 'username email');
  const sellerMap = new Map(sellerDocs.map(seller => [seller._id.toString(), seller]));
  const workItems = pendingRunSellers
    .map(runSeller => ({ runSeller, seller: sellerMap.get(String(runSeller.seller)) }))
    .filter(item => item.seller);

  activeSkuSyncRunId = run._id;
  skuSyncStopRequested = false;
  skuSyncDismissed.clear();

  await SkuIndexSyncRun.updateOne(
    { _id: run._id },
    { $set: { status: 'running', error: null } }
  );

  for (const { runSeller, seller } of workItems) {
    skuSyncStatus.set(String(seller._id), {
      status: runSeller.status === 'running' ? 'running' : 'queued',
      startedAt: runSeller.startedAt || new Date(),
      totalCount: runSeller.totalCount || 0,
      source: 'cron',
      runnerId: RUNNER_ID,
      progress: runSeller.currentPage > 0
        ? {
            page: runSeller.currentPage,
            totalPages: runSeller.totalPages,
            totalEntries: runSeller.totalEntries,
            count: runSeller.totalCount || 0,
          }
        : null,
    });
  }

  console.log(`[SKU Index Resume] Resuming run ${run._id} with ${workItems.length} seller(s).`);
  let nextIndex = 0;
  const results = [];

  const worker = async () => {
    while (nextIndex < workItems.length) {
      const freshRun = await SkuIndexSyncRun.findById(run._id).select('requestedStop').lean();
      if (skuSyncStopRequested || freshRun?.requestedStop) {
        skuSyncStopRequested = true;
        break;
      }

      const { runSeller, seller } = workItems[nextIndex++];
      const sellerId = seller._id.toString();
      const sellerName = seller.user?.username || seller.user?.email || sellerId;
      const sellerStartedAt = runSeller.startedAt || new Date();

      try {
        skuSyncStatus.set(sellerId, {
          status: 'running',
          startedAt: sellerStartedAt,
          totalCount: runSeller.totalCount || 0,
          source: 'cron',
          runnerId: RUNNER_ID,
          progress: null,
        });
        await updateSkuIndexRunSeller(run._id, seller._id, { status: 'running', startedAt: sellerStartedAt, error: null });

        const startPage = (runSeller.currentPage || 0) + 1;
        console.log(`[SKU Index Resume] Resuming seller ${sellerName} at page ${startPage}`);
        const { totalCount, syncedAt } = await runSkuIndexSync(seller, null, {
          syncStart: run.syncStartedAt,
          endTimeFrom: run.endTimeFrom,
          endTimeTo: run.endTimeTo,
          startPage,
          totalPages: runSeller.totalPages || 1,
          initialCount: runSeller.totalCount || 0,
          onProgress: async (progress) => {
            await updateSkuIndexRunSeller(run._id, seller._id, {
              currentPage: progress.page,
              totalPages: progress.totalPages,
              totalEntries: progress.totalEntries,
              totalCount: progress.count,
            });
          },
        });

        skuSyncStatus.set(sellerId, {
          status: 'completed',
          startedAt: sellerStartedAt,
          totalCount,
          lastSyncAt: syncedAt,
          source: 'cron',
          runnerId: RUNNER_ID,
          progress: null,
        });
        await updateSkuIndexRunSeller(run._id, seller._id, { status: 'completed', totalCount, completedAt: new Date(), error: null });
        await SkuIndexSyncRun.updateOne({ _id: run._id }, { $inc: { sellersComplete: 1 } });
        results.push({ sellerId, sellerName, status: 'completed', totalCount });
      } catch (err) {
        const status = skuSyncDismissed.has(sellerId) || skuSyncStopRequested ? 'dismissed' : 'failed';
        skuSyncStatus.set(sellerId, { status, error: status === 'dismissed' ? null : err.message, source: 'cron', runnerId: RUNNER_ID });
        await updateSkuIndexRunSeller(run._id, seller._id, {
          status,
          error: status === 'dismissed' ? null : err.message,
          dismissedAt: status === 'dismissed' ? new Date() : null,
          completedAt: new Date(),
        });
        await SkuIndexSyncRun.updateOne({ _id: run._id }, { $inc: { sellersComplete: 1 } });
        results.push({ sellerId, sellerName, status, error: err.message });
      }
    }
  };

  try {
    const workerCount = Math.min(SKU_SYNC_CONCURRENCY, workItems.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const finalRun = await SkuIndexSyncRun.findById(run._id).select('requestedStop').lean();
    const now = new Date();
    if (skuSyncStopRequested || finalRun?.requestedStop) {
      await SkuIndexSyncRun.updateOne(
        { _id: run._id },
        { $set: { status: 'stopped', requestedStop: true, stoppedAt: now, completedAt: now } }
      );
    } else {
      const latestRun = await SkuIndexSyncRun.findById(run._id).select('sellers').lean();
      const failedCount = (latestRun?.sellers || []).filter(s => s.status === 'failed').length;
      await SkuIndexSyncRun.updateOne(
        { _id: run._id },
        { $set: { status: failedCount > 0 ? 'failed' : 'completed', completedAt: now } }
      );
    }

    return results;
  } finally {
    activeSkuSyncRunId = null;
    skuSyncStopRequested = false;
  }
}

export async function initializeSkuIndexSyncState() {
  try {
    const resumableRuns = await SkuIndexSyncRun.find({
      status: { $in: ['queued', 'running', 'stopping'] },
      requestedStop: { $ne: true },
      runnerId: RUNNER_ID,
      syncStartedAt: { $ne: null },
      endTimeFrom: { $ne: null },
      endTimeTo: { $ne: null },
    }).sort({ startedAt: 1 }).lean();

    const resumableRunIds = new Set(resumableRuns.map(run => String(run._id)));
    await SkuIndexSyncRun.updateMany(
      {
        status: { $in: ['queued', 'running', 'stopping'] },
        _id: { $nin: [...resumableRunIds] },
      },
      {
        $set: {
          status: 'interrupted',
          interruptedAt: new Date(),
          completedAt: new Date(),
          error: 'Server restarted before this SKU index sync run finished and this run cannot be resumed safely.',
        },
      }
    );
    await SkuIndexSyncRun.updateMany(
      {
        status: 'interrupted',
        _id: { $nin: [...resumableRunIds] },
        'sellers.status': { $in: ['queued', 'running'] },
      },
      {
        $set: {
          'sellers.$[seller].status': 'interrupted',
          'sellers.$[seller].completedAt': new Date(),
          'sellers.$[seller].error': 'Server restarted before this seller sync finished and this run cannot be resumed safely.',
        },
      },
      { arrayFilters: [{ 'seller.status': { $in: ['queued', 'running'] } }] }
    );

    activeSkuSyncRunId = null;
    skuSyncStopRequested = false;
    skuSyncDismissed.clear();
    for (const run of resumableRuns) {
      try {
        await resumeSkuIndexSyncRun(run._id);
      } catch (err) {
        console.error(`[SKU Index Sync] Failed to resume run ${run._id}:`, err.message);
      }
    }
    console.log(`[SKU Index Sync] Startup state initialized. Resuming ${resumableRuns.length} SKU run(s).`);
  } catch (err) {
    console.error('[SKU Index Sync] Failed to initialize startup state:', err.message);
  }
}

export async function scheduledSkuIndexSyncAllSellers() {
  if (activeSkuSyncRunId) {
    console.log(`[SKU Index Cron] Run ${activeSkuSyncRunId} already active, skipping.`);
    return [];
  }

  const allSellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } })
    .populate('user', 'username email');

  const sellers = allSellers.filter(seller => {
    const sellerId = seller._id.toString();
    return skuSyncStatus.get(sellerId)?.status !== 'running';
  });

  if (sellers.length === 0) {
    console.log('[SKU Index Cron] No eligible sellers to sync.');
    return [];
  }

  const startedAt = new Date();
  const syncWindow = getSkuSyncWindow(startedAt);
  const run = await SkuIndexSyncRun.create({
    source: 'cron',
    runnerId: RUNNER_ID,
    status: 'running',
    requestedStop: false,
    concurrency: SKU_SYNC_CONCURRENCY,
    sellersTotal: sellers.length,
    sellersComplete: 0,
    syncStartedAt: syncWindow.syncStart,
    endTimeFrom: syncWindow.endTimeFrom,
    endTimeTo: syncWindow.endTimeTo,
    startedAt,
    sellers: sellers.map(seller => ({
      seller: seller._id,
      sellerName: seller.user?.username || seller.user?.email || seller._id.toString(),
      status: 'queued',
    })),
  });

  activeSkuSyncRunId = run._id;
  skuSyncStopRequested = false;
  skuSyncDismissed.clear();
  sellers.forEach(seller => {
    skuSyncStatus.set(seller._id.toString(), {
      status: 'queued',
      startedAt,
      totalCount: 0,
      source: 'cron',
      runnerId: RUNNER_ID,
    });
  });

  console.log(`[SKU Index Cron] Starting SKU index sync for ${sellers.length} seller(s), max ${SKU_SYNC_CONCURRENCY} at a time.`);
  let nextIndex = 0;
  const results = [];

  const worker = async () => {
    while (nextIndex < sellers.length) {
      const freshRun = await SkuIndexSyncRun.findById(run._id).select('requestedStop').lean();
      if (skuSyncStopRequested || freshRun?.requestedStop) {
        skuSyncStopRequested = true;
        break;
      }

      const seller = sellers[nextIndex++];
      const sellerId = seller._id.toString();
      const sellerName = seller.user?.username || seller.user?.email || sellerId;

      if (skuSyncDismissed.has(sellerId)) {
        skuSyncStatus.set(sellerId, { status: 'dismissed', source: 'cron', runnerId: RUNNER_ID, dismissedAt: new Date() });
        await updateSkuIndexRunSeller(run._id, seller._id, { status: 'dismissed', dismissedAt: new Date(), completedAt: new Date() });
        await SkuIndexSyncRun.updateOne({ _id: run._id }, { $inc: { sellersComplete: 1 } });
        results.push({ sellerId, sellerName, status: 'dismissed' });
        continue;
      }

      try {
        const sellerStartedAt = new Date();
        skuSyncStatus.set(sellerId, { status: 'running', startedAt: sellerStartedAt, totalCount: 0, source: 'cron', runnerId: RUNNER_ID });
        await updateSkuIndexRunSeller(run._id, seller._id, { status: 'running', startedAt: sellerStartedAt, error: null });
        console.log(`[SKU Index Cron] Starting seller ${sellerName}`);
        const { totalCount, syncedAt } = await runSkuIndexSync(seller, null, {
          syncStart: run.syncStartedAt || run.startedAt,
          endTimeFrom: run.endTimeFrom,
          endTimeTo: run.endTimeTo,
          onProgress: async (progress) => {
            await updateSkuIndexRunSeller(run._id, seller._id, {
              currentPage: progress.page,
              totalPages: progress.totalPages,
              totalEntries: progress.totalEntries,
              totalCount: progress.count,
            });
          },
        });
        skuSyncStatus.set(sellerId, {
          status: 'completed',
          startedAt: sellerStartedAt,
          totalCount,
          lastSyncAt: syncedAt,
          source: 'cron',
          runnerId: RUNNER_ID,
          progress: null,
        });
        await updateSkuIndexRunSeller(run._id, seller._id, { status: 'completed', totalCount, completedAt: new Date(), error: null });
        await SkuIndexSyncRun.updateOne({ _id: run._id }, { $inc: { sellersComplete: 1 } });
        results.push({ sellerId, sellerName, status: 'completed', totalCount });
      } catch (err) {
        const status = skuSyncDismissed.has(sellerId) || skuSyncStopRequested ? 'dismissed' : 'failed';
        skuSyncStatus.set(sellerId, { status, error: status === 'dismissed' ? null : err.message, source: 'cron', runnerId: RUNNER_ID });
        await updateSkuIndexRunSeller(run._id, seller._id, {
          status,
          error: status === 'dismissed' ? null : err.message,
          dismissedAt: status === 'dismissed' ? new Date() : null,
          completedAt: new Date(),
        });
        await SkuIndexSyncRun.updateOne({ _id: run._id }, { $inc: { sellersComplete: 1 } });
        results.push({ sellerId, sellerName, status, error: err.message });
        console.error(`[SKU Index Cron] ${sellerName} ${status}:`, err.message);
      }
    }
  };

  try {
    const workerCount = Math.min(SKU_SYNC_CONCURRENCY, sellers.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const finalRun = await SkuIndexSyncRun.findById(run._id).select('requestedStop sellersComplete').lean();
    const now = new Date();
    if (skuSyncStopRequested || finalRun?.requestedStop) {
      await SkuIndexSyncRun.updateOne(
        { _id: run._id },
        {
          $set: {
            status: 'stopped',
            requestedStop: true,
            stoppedAt: now,
            completedAt: now,
          },
        }
      );
      await SkuIndexSyncRun.updateOne(
        { _id: run._id },
        {
          $set: {
            'sellers.$[seller].status': 'dismissed',
            'sellers.$[seller].dismissedAt': now,
            'sellers.$[seller].completedAt': now,
          },
        },
        { arrayFilters: [{ 'seller.status': 'queued' }] }
      );
    } else {
      const failedCount = results.filter(r => r.status === 'failed').length;
      await SkuIndexSyncRun.updateOne(
        { _id: run._id },
        { $set: { status: failedCount > 0 ? 'failed' : 'completed', completedAt: now } }
      );
    }

    console.log(`[SKU Index Cron] Finished ${results.length} seller sync(s).`);
    return results;
  } finally {
    activeSkuSyncRunId = null;
    skuSyncStopRequested = false;
  }
}
