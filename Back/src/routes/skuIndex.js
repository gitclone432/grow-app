import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { requireAuth } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import SkuIndexSyncRun from '../models/SkuIndexSyncRun.js';
import { ensureValidToken } from './ebay.js';
import {
  skuSyncStatus,
  skuSyncDismissed,
  getSkuSyncStatusSnapshot,
  runSkuIndexSync,
  getActiveRunMeta,
  dismissSellerSync,
  requestCronStop,
} from '../lib/skuIndexSync.js';

const router = express.Router();

// GET /ebay/sync-sku-index/stream?sellerId=...  — SSE: streams progress then done
router.get('/sync-sku-index/stream', requireAuth, async (req, res) => {
  const { sellerId } = req.query;
  if (!sellerId) return res.status(400).json({ error: 'sellerId is required' });

  const current = skuSyncStatus.get(sellerId);
  if (current?.status === 'running' || current?.status === 'queued') {
    return res.status(409).json({ error: 'Sync already in progress for this seller' });
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const seller = await Seller.findById(sellerId).populate('user', 'username');
    if (!seller) { send({ type: 'error', error: 'Seller not found' }); return res.end(); }

    const startedAt = new Date();
    skuSyncDismissed.delete(String(sellerId));
    skuSyncStatus.set(sellerId, { status: 'running', startedAt, totalCount: 0 });

    const { totalCount, syncedAt } = await runSkuIndexSync(seller, send);

    skuSyncStatus.set(sellerId, { status: 'completed', startedAt, totalCount, lastSyncAt: syncedAt });
    send({ type: 'done', totalCount, syncedAt });
  } catch (err) {
    console.error('[sync-sku-index/stream] Error:', err.message);
    const status = skuSyncDismissed.has(String(sellerId)) ? 'dismissed' : 'failed';
    skuSyncStatus.set(sellerId, { status, error: err.message });
    send({ type: 'error', error: err.message, status });
  } finally {
    res.end();
  }
});

// GET /ebay/sync-sku-index/status/:sellerId  — current sync state + DB count + syncedAt
router.get('/sync-sku-index/status/:sellerId', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.params;
    let mem = getSkuSyncStatusSnapshot(sellerId);
    const latestRun = await SkuIndexSyncRun.findOne({ 'sellers.seller': sellerId })
      .sort({ startedAt: -1 })
      .select('status runnerId source sellers startedAt completedAt stoppedAt interruptedAt requestedStop')
      .lean();
    const latestRunSeller = latestRun?.sellers?.find(s => String(s.seller) === String(sellerId));
    const shouldUseLatestRunStatus = latestRunSeller
      && ['queued', 'running', 'dismissed', 'interrupted', 'failed'].includes(latestRunSeller.status)
      && !(latestRunSeller.status === 'failed' && mem.status === 'completed');

    if (shouldUseLatestRunStatus) {
      mem = {
        ...mem,
        status: latestRunSeller.status,
        totalCount: latestRunSeller.totalCount || mem.totalCount || 0,
        error: latestRunSeller.error || mem.error || null,
        progress: latestRunSeller.status === 'running' && latestRunSeller.currentPage > 0
          ? {
              page: latestRunSeller.currentPage,
              totalPages: latestRunSeller.totalPages,
              totalEntries: latestRunSeller.totalEntries,
              count: latestRunSeller.totalCount || mem.totalCount || 0,
            }
          : mem.progress || null,
        source: latestRun.source,
        runnerId: latestRun.runnerId,
        runId: latestRun._id,
      };
    }
    const dbCount = await SellerSkuIndex.countDocuments({ seller: sellerId });
    // Get the syncedAt from the most recent record for this seller
    const latest = await SellerSkuIndex.findOne({ seller: sellerId }).sort({ syncedAt: -1 }).select('syncedAt').lean();
    return res.json({
      ...mem,
      dbCount,
      syncedAt: latest?.syncedAt || null,
      completedAt: latestRunSeller?.completedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync status', details: error.message });
  }
});

router.get('/sync-sku-index/run-status', requireAuth, async (req, res) => {
  try {
    const { activeRunId, stopRequested } = getActiveRunMeta();
    const run = await SkuIndexSyncRun.findOne({})
      .sort({ startedAt: -1 })
      .populate('sellers.seller', 'user')
      .lean();
    return res.json({
      activeRunId,
      stopRequested,
      run,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch SKU index sync run status', details: error.message });
  }
});

router.post('/sync-sku-index/dismiss/:sellerId', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const result = await dismissSellerSync(sellerId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to dismiss SKU index sync', details: error.message });
  }
});

router.post('/sync-sku-index/cron/stop', requireAuth, async (req, res) => {
  try {
    const result = await requestCronStop();
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to stop SKU index cron sync', details: error.message });
  }
});

router.get('/check-sku-active', requireAuth, async (req, res) => {
  try {
    const { sku, sellerId } = req.query;
    if (!sku || !sellerId) {
      return res.status(400).json({ error: 'sku and sellerId are required' });
    }

    // Query the locally synced SellerSkuIndex collection.
    // We match on baseSku so that GRW25N4VFV finds listings stored as GRW25N4VFV-1, -2, etc.
    // The index also stores exact-SKU listings (baseSku === sku when there's no suffix).
    const currentSellerRecords = await SellerSkuIndex.find({
      seller: sellerId,
      baseSku: sku
    })
      .select('seller sku baseSku itemId title price currency syncedAt')
      .sort({ syncedAt: -1 })
      .limit(50)
      .lean();
    const active = currentSellerRecords.length > 0;

    // Count all listings for this baseSku (there may be multiple lines with different itemIds)
    const count = active
      ? await SellerSkuIndex.countDocuments({ seller: sellerId, baseSku: sku })
      : 0;

    const otherSellerRecords = await SellerSkuIndex.find({
      seller: { $ne: sellerId },
      baseSku: sku
    })
      .select('seller sku baseSku itemId title price currency syncedAt')
      .sort({ syncedAt: -1 })
      .limit(50)
      .lean();

    const sellerIds = [
      ...new Set(
        [...currentSellerRecords, ...otherSellerRecords]
          .map(record => String(record.seller))
          .filter(Boolean)
      )
    ];
    const sellerDocs = sellerIds.length > 0
      ? await Seller.find({ _id: { $in: sellerIds } })
          .populate('user', 'username email')
          .select('name user')
          .lean()
      : [];
    const sellerNameById = new Map(sellerDocs.map(seller => [
      String(seller._id),
      seller.user?.username || seller.user?.email || seller.name || 'Unknown Seller'
    ]));

    const mapSkuRecord = (record, scope) => ({
      sellerId: String(record.seller),
      sellerName: sellerNameById.get(String(record.seller)) || 'Unknown Seller',
      scope,
      sku: record.sku || '',
      baseSku: record.baseSku || '',
      itemId: record.itemId || '',
      title: record.title || '',
      price: record.price,
      currency: record.currency || '',
      syncedAt: record.syncedAt
    });

    const currentSellerMatches = currentSellerRecords.map(record => mapSkuRecord(record, 'current'));
    const otherSellerMatches = otherSellerRecords.map(record => mapSkuRecord(record, 'other'));

    return res.json({
      active,
      currentSellerMatches,
      currentSellerCount: currentSellerMatches.length,
      otherSellerMatches,
      otherSellerCount: otherSellerMatches.length,
      _debug: { sku, source: 'db', found: active, count }
    });
  } catch (error) {
    console.error('[check-sku-active] Error:', error.message);
    res.status(500).json({ error: 'Failed to check SKU status', details: error.message });
  }
});

// GET /ebay/item-end-times?sellerId=xxx&itemIds=id1,id2,...
// Fetches EndTime for each itemId via parallel GetItem calls (batched 10 at a time).
// Returns { [itemId]: "ISO-date-string" }
router.get('/item-end-times', requireAuth, async (req, res) => {
  const { sellerId, itemIds } = req.query;
  if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

  const ids = (itemIds || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 300);
  if (!ids.length) return res.json({});

  const seller = await Seller.findById(sellerId);
  if (!seller) return res.status(404).json({ error: 'Seller not found' });

  const token = await ensureValidToken(seller);
  const endTimeMap = {};
  const BATCH = 10;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await Promise.all(batch.map(async (itemId) => {
      try {
        const xmlReq = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ItemID>${itemId}</ItemID>
</GetItemRequest>`;
        const resp = await axios.post('https://api.ebay.com/ws/api.dll', xmlReq, {
          headers: {
            'X-EBAY-API-CALL-NAME': 'GetItem',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
            'Content-Type': 'text/xml',
          },
        });
        const parsed = await parseStringPromise(resp.data, { explicitArray: false });
        const ack = parsed?.GetItemResponse?.Ack;
        const item = parsed?.GetItemResponse?.Item;
        const endTime = item?.EndTime || item?.ListingDetails?.EndTime;
        if (endTime) {
          endTimeMap[itemId] = endTime;
        } else if (ack === 'Failure') {
          const errMsg = parsed?.GetItemResponse?.Errors?.LongMessage || parsed?.GetItemResponse?.Errors?.ShortMessage || 'unknown';
          console.warn(`[item-end-times] GetItem Failure for ${itemId}: ${errMsg}`);
        }
      } catch (err) {
        console.warn(`[item-end-times] GetItem threw for ${itemId}:`, err?.message || err);
      }
    }));
  }

  res.json(endTimeMap);
});

export default router;
