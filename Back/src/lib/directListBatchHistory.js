import mongoose from 'mongoose';
import DirectListJob from '../models/DirectListJob.js';
import TemplateListing from '../models/TemplateListing.js';
import Seller from '../models/Seller.js';
import ListingTemplate from '../models/ListingTemplate.js';
import User from '../models/User.js';
import { chunkDirectListAsins } from './directListJobRunner.js';
import { DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE } from '../models/DirectListJob.js';

function mapRowToResult(row = {}) {
  const rawStatus = String(row.status || 'error');
  let status = 'error';
  if (rawStatus === 'ready') status = 'ready';
  else if (rawStatus === 'success') status = 'success';

  return {
    asin: String(row.asin || '').trim().toUpperCase(),
    status,
    sku: row.sku || row.listing?.customLabel || '',
    itemId: row.itemId != null ? String(row.itemId) : '',
    listingUrl: row.listingUrl || '',
    error: row.error || '',
  };
}

/**
 * Persist an immediate Direct List batch (prepare/publish/verify) for history UI.
 */
export async function recordDirectListBatchHistory({
  sellerId,
  templateId,
  region = 'US',
  runType = 'publish',
  asins = [],
  results = [],
  createdBy = null,
}) {
  const cleanedAsins = [...new Set(
    (asins || [])
      .map((value) => String(value || '').trim().toUpperCase())
      .filter(Boolean)
  )];
  const mapped = (results || []).map(mapRowToResult).filter((row) => row.asin);
  const asinList = cleanedAsins.length
    ? cleanedAsins
    : mapped.map((row) => row.asin);
  const ok = mapped.filter((row) => row.status === 'success' || row.status === 'ready').length;
  const failed = mapped.length - ok;
  const now = new Date();

  return DirectListJob.create({
    sellerId,
    templateId,
    region,
    asins: asinList,
    scheduledAt: now,
    status: mapped.length > 0 && failed === mapped.length ? 'failed' : 'done',
    runType,
    execution: 'sync',
    batchSize: Math.max(asinList.length, 1),
    currentBatchIndex: 1,
    results: mapped,
    successfulCount: ok,
    failedCount: failed,
    createdBy: createdBy || null,
    startedAt: now,
    completedAt: now,
  });
}

export function encodeDerivedBatchId(parts) {
  return `derived:${Buffer.from(JSON.stringify(parts)).toString('base64url')}`;
}

export function decodeDerivedBatchId(id) {
  const raw = String(id || '');
  if (!raw.startsWith('derived:')) return null;
  try {
    return JSON.parse(Buffer.from(raw.slice('derived:'.length), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function enrichJobRow(job) {
  return {
    ...job,
    _id: String(job._id),
    source: 'job',
    runType: job.runType || 'publish',
    execution: job.execution || 'queued',
    templateName: job.templateId?.name || job.templateName || '—',
    sellerName: job.sellerId?.user?.username || job.sellerId?.user?.email || job.sellerName || '—',
    createdByName: job.createdBy?.username || job.createdBy?.email || job.createdByName || '—',
    totalAsins: job.asins?.length || job.totalAsins || 0,
    batchCount: chunkDirectListAsins(
      job.asins || [],
      job.batchSize || DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE
    ).length,
    processedAsins: Math.min(
      (job.currentBatchIndex || 0) * (job.batchSize || DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE),
      job.asins?.length || 0
    ),
  };
}

async function loadNameMaps(sellerIds, templateIds, userIds) {
  const [sellers, templates, users] = await Promise.all([
    Seller.find({ _id: { $in: sellerIds } })
      .populate('user', 'username email')
      .select('user')
      .lean(),
    ListingTemplate.find({ _id: { $in: templateIds } }).select('name').lean(),
    User.find({ _id: { $in: userIds } }).select('username email').lean(),
  ]);

  const sellerNameById = Object.fromEntries(
    sellers.map((s) => [String(s._id), s.user?.username || s.user?.email || '—'])
  );
  const templateNameById = Object.fromEntries(
    templates.map((t) => [String(t._id), t.name || '—'])
  );
  const userNameById = Object.fromEntries(
    users.map((u) => [String(u._id), u.username || u.email || '—'])
  );
  return { sellerNameById, templateNameById, userNameById };
}

/**
 * History built from TemplateListing rows created via Direct List
 * (covers prepares/publishes from before job history existed).
 */
export async function listDerivedDirectListBatches({
  sellerId = null,
  limit = 100,
} = {}) {
  const match = {
    deletedAt: null,
    listingOrigin: 'direct_list',
  };
  if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
    match.sellerId = new mongoose.Types.ObjectId(sellerId);
  }

  const groups = await TemplateListing.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'Asia/Kolkata',
            },
          },
          sellerId: '$sellerId',
          templateId: '$templateId',
          status: '$status',
          createdBy: '$createdBy',
        },
        count: { $sum: 1 },
        firstAt: { $min: '$createdAt' },
        lastAt: { $max: '$createdAt' },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: Math.min(Math.max(limit, 1), 300) },
  ]);

  const sellerIds = [...new Set(groups.map((g) => String(g._id.sellerId || '')).filter(Boolean))];
  const templateIds = [...new Set(groups.map((g) => String(g._id.templateId || '')).filter(Boolean))];
  const userIds = [...new Set(groups.map((g) => String(g._id.createdBy || '')).filter(Boolean))];
  const { sellerNameById, templateNameById, userNameById } = await loadNameMaps(
    sellerIds,
    templateIds,
    userIds
  );

  return groups.map((g) => {
    const status = g._id.status || 'draft';
    const runType = status === 'active' ? 'publish' : status === 'draft' ? 'draft' : 'publish';
    const parts = {
      day: g._id.day,
      sellerId: g._id.sellerId ? String(g._id.sellerId) : null,
      templateId: g._id.templateId ? String(g._id.templateId) : null,
      status,
      createdBy: g._id.createdBy ? String(g._id.createdBy) : null,
    };
    return {
      _id: encodeDerivedBatchId(parts),
      source: 'listings',
      derived: true,
      runType,
      execution: 'sync',
      status: 'done',
      sellerId: parts.sellerId,
      templateId: parts.templateId,
      createdBy: parts.createdBy,
      sellerName: sellerNameById[parts.sellerId] || '—',
      templateName: templateNameById[parts.templateId] || '—',
      createdByName: parts.createdBy ? (userNameById[parts.createdBy] || '—') : '—',
      region: '—',
      totalAsins: g.count || 0,
      successfulCount: runType === 'publish' ? (g.count || 0) : (runType === 'draft' ? g.count || 0 : 0),
      failedCount: 0,
      batchCount: 1,
      createdAt: g.lastAt || g.firstAt,
      completedAt: g.lastAt || g.firstAt,
      scheduledAt: g.firstAt,
      day: parts.day,
    };
  });
}

export async function getDerivedDirectListBatchDetail(encodedId) {
  const parts = decodeDerivedBatchId(encodedId);
  if (!parts?.day || !parts.sellerId || !parts.templateId) {
    return null;
  }

  const dayStart = new Date(`${parts.day}T00:00:00.000+05:30`);
  const dayEnd = new Date(`${parts.day}T23:59:59.999+05:30`);
  const match = {
    deletedAt: null,
    listingOrigin: 'direct_list',
    sellerId: new mongoose.Types.ObjectId(parts.sellerId),
    templateId: new mongoose.Types.ObjectId(parts.templateId),
    status: parts.status || 'draft',
    createdAt: { $gte: dayStart, $lte: dayEnd },
  };
  if (parts.createdBy && mongoose.Types.ObjectId.isValid(parts.createdBy)) {
    match.createdBy = new mongoose.Types.ObjectId(parts.createdBy);
  } else {
    match.$or = [{ createdBy: null }, { createdBy: { $exists: false } }];
  }

  const listings = await TemplateListing.find(match)
    .select('+_asinReference customLabel status ebayItemId ebayListingUrl title startPrice quantity amazonScrapedPrice amazonLink categoryId categoryName itemPhotoUrl description customFields conditionId upc epid location format duration shippingProfileName returnProfileName paymentProfileName createdAt')
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  const { sellerNameById, templateNameById, userNameById } = await loadNameMaps(
    [parts.sellerId],
    [parts.templateId],
    parts.createdBy ? [parts.createdBy] : []
  );

  const runType = parts.status === 'active' ? 'publish' : 'draft';
  const asins = listings.map((l) => l._asinReference).filter(Boolean);
  const results = listings.map((l) => {
    let specs = {};
    if (l.customFields instanceof Map) {
      specs = Object.fromEntries(l.customFields.entries());
    } else if (l.customFields && typeof l.customFields === 'object') {
      specs = { ...l.customFields };
    }
    const photoUrls = String(l.itemPhotoUrl || '')
      .split(/\s*\|\s*|\s*,\s*|\n+/)
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 12);

    return {
      asin: l._asinReference || '—',
      status: l.status === 'active' ? 'success' : 'ready',
      listingStatus: l.status || 'draft',
      sku: l.customLabel || '',
      title: l.title || '',
      startPrice: l.startPrice ?? '',
      quantity: l.quantity ?? '',
      amazonPrice: l.amazonScrapedPrice ?? '',
      amazonLink: l.amazonLink || '',
      categoryId: l.categoryId ?? '',
      categoryName: l.categoryName || '',
      conditionId: l.conditionId || '',
      upc: l.upc || '',
      epid: l.epid || '',
      location: l.location || '',
      format: l.format || '',
      duration: l.duration || '',
      shippingProfileName: l.shippingProfileName || '',
      returnProfileName: l.returnProfileName || '',
      paymentProfileName: l.paymentProfileName || '',
      description: l.description || '',
      itemPhotoUrl: l.itemPhotoUrl || '',
      photoUrls,
      specs,
      itemId: l.ebayItemId ? String(l.ebayItemId) : '',
      listingUrl: l.ebayListingUrl || '',
      error: '',
      createdAt: l.createdAt || null,
    };
  });

  return {
    _id: encodedId,
    source: 'listings',
    derived: true,
    runType,
    execution: 'sync',
    status: 'done',
    sellerId: parts.sellerId,
    templateId: parts.templateId,
    createdBy: parts.createdBy,
    sellerName: sellerNameById[parts.sellerId] || '—',
    templateName: templateNameById[parts.templateId] || '—',
    createdByName: parts.createdBy ? (userNameById[parts.createdBy] || '—') : '—',
    region: '—',
    day: parts.day,
    asins,
    results,
    totalAsins: asins.length,
    successfulCount: results.filter((r) => r.status === 'success' || r.status === 'ready').length,
    failedCount: 0,
    batchCount: 1,
    createdAt: listings[0]?.createdAt || null,
    completedAt: listings[0]?.createdAt || null,
    scheduledAt: listings[listings.length - 1]?.createdAt || null,
  };
}

export async function listDirectListBatchHistory({
  sellerId = null,
  limit = 100,
} = {}) {
  const jobFilter = {};
  if (sellerId) jobFilter.sellerId = sellerId;

  const [jobs, derived] = await Promise.all([
    DirectListJob.find(jobFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .select('-results')
      .populate('templateId', 'name')
      .populate({
        path: 'sellerId',
        select: 'user',
        populate: { path: 'user', select: 'username email' },
      })
      .populate('createdBy', 'username email')
      .lean(),
    listDerivedDirectListBatches({ sellerId, limit }),
  ]);

  const jobRows = jobs.map(enrichJobRow);
  // Prefer real job rows when both exist for same day/store/template; keep both otherwise.
  const merged = [...jobRows, ...derived].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return merged.slice(0, Math.min(Math.max(limit, 1), 300));
}
