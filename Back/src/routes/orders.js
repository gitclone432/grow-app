import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import Return from '../models/Return.js';
import Case from '../models/Case.js';
import Cancellation from '../models/Cancellation.js';
import PaymentDispute from '../models/PaymentDispute.js';
import Message from '../models/Message.js';
import MarketMetric from '../models/MarketMetric.js';
import TemplateListing from '../models/TemplateListing.js';
import ConversationMeta from '../models/ConversationMeta.js';
import OrderActivityLog from '../models/OrderActivityLog.js';
import User from '../models/User.js';

const router = Router();
const EXCLUDED_CLIENT_USERNAME = 'Vergo';
const FINAL_CANCELLED_STATES = ['CANCELED', 'CANCELLED'];

async function enrichOrdersWithConversationMeta(orders = []) {
  const orderIds = [...new Set(
    orders
      .map((order) => order?.orderId || order?.legacyOrderId || order?.originalOrderId || order?.caseOrderId)
      .filter(Boolean)
      .map(String)
  )];

  if (orderIds.length === 0) return orders;

  const metas = await ConversationMeta.find(
    { orderId: { $in: orderIds } },
    { orderId: 1, category: 1, caseStatus: 1, status: 1, pickedUpBy: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .lean();

  const metaByOrderId = new Map();
  metas.forEach((meta) => {
    if (meta.orderId && !metaByOrderId.has(meta.orderId)) {
      metaByOrderId.set(meta.orderId, meta);
    }
  });

  return orders.map((order) => {
    const meta = metaByOrderId.get(String(order?.orderId || '')) ||
      metaByOrderId.get(String(order?.legacyOrderId || '')) ||
      metaByOrderId.get(String(order?.originalOrderId || '')) ||
      metaByOrderId.get(String(order?.caseOrderId || ''));

    if (!meta) return order;

    return {
      ...order,
      pickedUpBy: meta.pickedUpBy || order.pickedUpBy || null,
      conversationInfo: {
        ...(order.conversationInfo || {}),
        category: order.conversationInfo?.category || meta.category,
        caseStatus: order.conversationInfo?.caseStatus || meta.caseStatus,
        status: order.conversationInfo?.status || meta.status,
        pickedUpBy: meta.pickedUpBy || order.conversationInfo?.pickedUpBy || null,
        updatedAt: order.conversationInfo?.updatedAt || meta.updatedAt,
      },
    };
  });
}

const PT_TIMEZONE = 'America/Los_Angeles';
const SNAD_RETURN_REASONS = [
  'NOT_AS_DESCRIBED',
  'DEFECTIVE_ITEM',
  'WRONG_ITEM',
  'MISSING_PARTS',
  'ARRIVED_DAMAGED',
  'DOESNT_MATCH',
  'NOT_AUTHENTIC',
  'DOES_NOT_FIT'
];

function getPtDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function getPtDayRange(dateStr) {
  return getPTDayBoundsUTC(dateStr);
}

// DST-aware: resolves midnight PT for any date string (handles PST=UTC-8 and PDT=UTC-7)
function getPTDayBoundsUTC(dateStr) {
  function findMidnightUTC(ds) {
    const pdt = new Date(`${ds}T07:00:00.000Z`);
    const ptStr = new Intl.DateTimeFormat('en-CA', { timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(pdt);
    const ptHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: PT_TIMEZONE, hour: 'numeric', hour12: false, hourCycle: 'h23' }).format(pdt), 10);
    if (ptStr === ds && ptHour === 0) return pdt;
    return new Date(`${ds}T08:00:00.000Z`); // fallback to PST
  }
  const start = findMidnightUTC(dateStr);
  const tmp = new Date(`${dateStr}T12:00:00.000Z`);
  tmp.setUTCDate(tmp.getUTCDate() + 1);
  const nextDateStr = tmp.toISOString().split('T')[0];
  const end = new Date(findMidnightUTC(nextDateStr).getTime() - 1);
  return { start, end };
}

function getMonthUtcRange(monthStr) {
  const [yearText, monthText] = String(monthStr).split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function getPreviousMonth(monthStr) {
  const [yearText, monthText] = String(monthStr).split('-');
  const d = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getCurrentAccountHealthWindow() {
  const now = new Date();
  const currentWindowEnd = new Date(now);
  const dayOfWeek = currentWindowEnd.getDay();
  if (dayOfWeek !== 0) {
    currentWindowEnd.setDate(currentWindowEnd.getDate() - dayOfWeek);
  }
  currentWindowEnd.setHours(23, 59, 59, 999);

  const calculationEnd = new Date(currentWindowEnd);
  calculationEnd.setDate(calculationEnd.getDate() - 1);
  calculationEnd.setHours(23, 59, 59, 999);

  const windowStart = new Date(calculationEnd);
  windowStart.setDate(windowStart.getDate() - 83);
  windowStart.setHours(0, 0, 0, 0);

  return { windowStart, calculationEnd };
}

function normalizeObjectIdOrNull(value, fieldName) {
  if (value == null || value === '' || value === 'null') {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }

  return new mongoose.Types.ObjectId(value);
}

async function getExcludedClientSellerIds() {
  const sellers = await Seller.find({})
    .populate('user', 'username')
    .select('_id user')
    .lean();

  return sellers
    .filter((seller) => seller.user?.username?.toLowerCase() === EXCLUDED_CLIENT_USERNAME)
    .map((seller) => seller._id);
}

async function applyExcludedClientFilter(match, sellerField, excludeClient) {
  if (excludeClient !== 'true') {
    return;
  }

  const excludedSellerIds = await getExcludedClientSellerIds();
  if (excludedSellerIds.length === 0) {
    return;
  }

  match[sellerField] = match[sellerField]
    ? { $in: [match[sellerField]].filter((sellerObjectId) => !excludedSellerIds.some((excludedId) => excludedId.equals(sellerObjectId))) }
    : { $nin: excludedSellerIds };
}

function applyOrderMarketplaceFilter(match, marketplace) {
  if (!marketplace) {
    return;
  }

  if (marketplace === 'EBAY_CA' || marketplace === 'EBAY_ENCA') {
    match.purchaseMarketplaceId = { $in: ['EBAY_CA', 'EBAY_ENCA'] };
    return;
  }

  if (marketplace === 'GB' || marketplace === 'EBAY_GB') {
    match.purchaseMarketplaceId = { $in: ['GB', 'EBAY_GB'] };
    return;
  }

  match.purchaseMarketplaceId = marketplace;
}

async function buildOrdersCrpMatch({ startDate, endDate, sellerId, marketplace, excludeClient, excludeLowValue }) {
  const match = {};

  if (startDate || endDate) {
    match.dateSold = {};
    if (startDate) match.dateSold.$gte = getPTDayBoundsUTC(startDate).start;
    if (endDate) match.dateSold.$lte = getPTDayBoundsUTC(endDate).end;
  }

  const sellerObjectId = normalizeObjectIdOrNull(sellerId, 'sellerId');
  if (sellerObjectId) {
    match.seller = sellerObjectId;
  }

  await applyExcludedClientFilter(match, 'seller', excludeClient);
  applyOrderMarketplaceFilter(match, marketplace);

  if (excludeLowValue === 'true') {
    match.$or = [{ subtotalUSD: { $gte: 3 } }, { subtotal: { $gte: 3 } }];
  }

  return match;
}

async function buildListingsCrpMatch({ startDate, endDate, sellerId, excludeClient }) {
  const match = { deletedAt: null };

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = getPTDayBoundsUTC(startDate).start;
    if (endDate) match.createdAt.$lte = getPTDayBoundsUTC(endDate).end;
  }

  const sellerObjectId = normalizeObjectIdOrNull(sellerId, 'sellerId');
  if (sellerObjectId) {
    match.sellerId = sellerObjectId;
  }

  await applyExcludedClientFilter(match, 'sellerId', excludeClient);

  return match;
}

function stringifyObjectId(value) {
  return value ? String(value) : null;
}

function buildCrpKey(categoryId, rangeId, productId) {
  return [categoryId || 'null', rangeId || 'null', productId || 'null'].join('::');
}

function normalizeComparisonRow(row, side) {
  const categoryId = stringifyObjectId(row.categoryId);
  const rangeId = stringifyObjectId(row.rangeId);
  const productId = stringifyObjectId(row.productId);

  return {
    key: buildCrpKey(categoryId, rangeId, productId),
    categoryId,
    rangeId,
    productId,
    categoryName: row.categoryName || 'Unassigned',
    rangeName: row.rangeName || null,
    productName: row.productName || null,
    [side]: {
      count: row.count || 0,
      previews: row.previews || [],
    },
  };
}

function mergeComparisonRows(listingRows, orderRows) {
  const merged = new Map();

  const upsert = (row, side) => {
    const normalized = normalizeComparisonRow(row, side);
    const existing = merged.get(normalized.key) || {
      key: normalized.key,
      categoryId: normalized.categoryId,
      rangeId: normalized.rangeId,
      productId: normalized.productId,
      categoryName: normalized.categoryName,
      rangeName: normalized.rangeName,
      productName: normalized.productName,
      listings: { count: 0, previews: [] },
      orders: { count: 0, previews: [] },
    };

    existing.categoryName = existing.categoryName || normalized.categoryName;
    existing.rangeName = existing.rangeName || normalized.rangeName;
    existing.productName = existing.productName || normalized.productName;
    existing[side] = normalized[side];

    merged.set(normalized.key, existing);
  };

  listingRows.forEach((row) => upsert(row, 'listings'));
  orderRows.forEach((row) => upsert(row, 'orders'));

  return Array.from(merged.values())
    .map((row) => ({
      ...row,
      gap: row.orders.count - row.listings.count,
      absGap: Math.abs(row.orders.count - row.listings.count),
    }))
    .sort((left, right) => {
      if (right.absGap !== left.absGap) return right.absGap - left.absGap;
      const rightTotal = right.orders.count + right.listings.count;
      const leftTotal = left.orders.count + left.listings.count;
      if (rightTotal !== leftTotal) return rightTotal - leftTotal;
      return `${left.categoryName}|${left.rangeName || ''}|${left.productName || ''}`
        .localeCompare(`${right.categoryName}|${right.rangeName || ''}|${right.productName || ''}`);
    });
}

function getChartBucket(row, level) {
  if (level === 'range') {
    return {
      id: row.rangeId || `range:${row.categoryId || 'null'}:unassigned`,
      name: row.rangeName || `Unassigned (${row.categoryName || 'No Category'})`,
    };
  }

  if (level === 'product') {
    return {
      id: row.productId || `product:${row.rangeId || row.categoryId || 'null'}:unassigned`,
      name: row.productName || `Unassigned (${row.rangeName || row.categoryName || 'No CRP'})`,
    };
  }

  return {
    id: row.categoryId || 'category:unassigned',
    name: row.categoryName || 'Unassigned',
  };
}

function buildChartData(rows, side, level) {
  const buckets = new Map();

  rows.forEach((row) => {
    const count = row[side]?.count || 0;
    if (!count) return;

    const bucket = getChartBucket(row, level);
    const key = `${level}:${bucket.id}`;
    const current = buckets.get(key) || { id: bucket.id, name: bucket.name, count: 0 };
    current.count += count;
    buckets.set(key, current);
  });

  return Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, 12);
}

async function getOrderComparisonRows(match) {
  return Order.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'asinlistcategories',
        localField: 'orderCategoryId',
        foreignField: '_id',
        as: 'categoryDoc'
      }
    },
    {
      $lookup: {
        from: 'asinlistranges',
        localField: 'orderRangeId',
        foreignField: '_id',
        as: 'rangeDoc'
      }
    },
    {
      $lookup: {
        from: 'asinlistproducts',
        localField: 'orderProductId',
        foreignField: '_id',
        as: 'productDoc'
      }
    },
    { $sort: { dateSold: -1 } },
    {
      $group: {
        _id: {
          categoryId: { $ifNull: ['$orderCategoryId', null] },
          rangeId: { $ifNull: ['$orderRangeId', null] },
          productId: { $ifNull: ['$orderProductId', null] },
        },
        categoryName: {
          $first: {
            $cond: [
              { $eq: ['$orderCategoryId', null] },
              'Unassigned',
              { $ifNull: [{ $arrayElemAt: ['$categoryDoc.name', 0] }, 'Unassigned'] }
            ]
          }
        },
        rangeName: { $first: { $ifNull: [{ $arrayElemAt: ['$rangeDoc.name', 0] }, null] } },
        productName: { $first: { $ifNull: [{ $arrayElemAt: ['$productDoc.name', 0] }, null] } },
        count: { $sum: 1 },
        previews: {
          $push: {
            id: '$_id',
            orderId: '$orderId',
            dateSold: '$dateSold',
            productName: '$productName',
            amount: { $ifNull: ['$subtotalUSD', '$subtotal'] }
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        categoryId: '$_id.categoryId',
        rangeId: '$_id.rangeId',
        productId: '$_id.productId',
        categoryName: 1,
        rangeName: 1,
        productName: 1,
        count: 1,
        previews: { $slice: ['$previews', 3] }
      }
    },
    { $sort: { count: -1, categoryName: 1, rangeName: 1, productName: 1 } }
  ]);
}

async function getListingComparisonRows(match) {
  return TemplateListing.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'listingtemplates',
        localField: 'templateId',
        foreignField: '_id',
        as: 'templateDoc'
      }
    },
    { $unwind: { path: '$templateDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'asinlistproducts',
        localField: 'templateDoc.listProductId',
        foreignField: '_id',
        as: 'productDoc'
      }
    },
    {
      $addFields: {
        productDocObj: { $arrayElemAt: ['$productDoc', 0] },
        derivedProductId: { $ifNull: ['$templateDoc.listProductId', null] }
      }
    },
    {
      $addFields: {
        derivedRangeId: { $ifNull: ['$productDocObj.rangeId', '$templateDoc.rangeId'] }
      }
    },
    {
      $lookup: {
        from: 'asinlistranges',
        localField: 'derivedRangeId',
        foreignField: '_id',
        as: 'rangeDoc'
      }
    },
    {
      $addFields: {
        rangeDocObj: { $arrayElemAt: ['$rangeDoc', 0] },
        derivedCategoryId: {
          $ifNull: ['$productDocObj.categoryId', { $arrayElemAt: ['$rangeDoc.categoryId', 0] }]
        }
      }
    },
    {
      $lookup: {
        from: 'asinlistcategories',
        localField: 'derivedCategoryId',
        foreignField: '_id',
        as: 'categoryDoc'
      }
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          categoryId: { $ifNull: ['$derivedCategoryId', null] },
          rangeId: { $ifNull: ['$derivedRangeId', null] },
          productId: { $ifNull: ['$derivedProductId', null] },
        },
        categoryName: {
          $first: {
            $cond: [
              { $eq: ['$derivedCategoryId', null] },
              'Unassigned',
              { $ifNull: [{ $arrayElemAt: ['$categoryDoc.name', 0] }, 'Unassigned'] }
            ]
          }
        },
        rangeName: { $first: { $ifNull: ['$rangeDocObj.name', null] } },
        productName: { $first: { $ifNull: ['$productDocObj.name', null] } },
        count: { $sum: 1 },
        previews: {
          $push: {
            id: '$_id',
            customLabel: '$customLabel',
            asin: '$_asinReference',
            title: '$title',
            createdAt: '$createdAt',
            status: '$status'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        categoryId: '$_id.categoryId',
        rangeId: '$_id.rangeId',
        productId: '$_id.productId',
        categoryName: 1,
        rangeName: 1,
        productName: 1,
        count: 1,
        previews: { $slice: ['$previews', 3] }
      }
    },
    { $sort: { count: -1, categoryName: 1, rangeName: 1, productName: 1 } }
  ]);
}

async function getCurrentNonCompliantSellerSet(optionalSellerId) {
  const { windowStart, calculationEnd } = getCurrentAccountHealthWindow();
  const sellerMatch = optionalSellerId ? { seller: new mongoose.Types.ObjectId(optionalSellerId) } : {};

  const [latestMarketMetric, salesBySeller, snadCasesBySeller, snadReturnsBySeller] = await Promise.all([
    MarketMetric.findOne({
      type: 'bbe_market_avg',
      $or: [{ seller: { $exists: false } }, { seller: null }]
    }).sort({ effectiveDate: -1 }).lean(),
    Order.aggregate([
      { $match: { ...sellerMatch, dateSold: { $gte: windowStart, $lte: calculationEnd } } },
      { $group: { _id: '$seller', totalSales: { $sum: 1 } } }
    ]),
    Case.aggregate([
      { $match: { ...sellerMatch, caseType: 'SNAD', creationDate: { $gte: windowStart, $lte: calculationEnd } } },
      { $group: { _id: '$seller', snadCases: { $sum: 1 } } }
    ]),
    Return.aggregate([
      {
        $match: {
          ...sellerMatch,
          returnReason: { $in: SNAD_RETURN_REASONS },
          creationDate: { $gte: windowStart, $lte: calculationEnd }
        }
      },
      { $group: { _id: '$seller', snadReturns: { $sum: 1 } } }
    ])
  ]);

  const marketAvg = Number(latestMarketMetric?.value) || 1.1;
  const map = new Map();

  salesBySeller.forEach((row) => {
    map.set(String(row._id), {
      sellerId: String(row._id),
      totalSales: row.totalSales || 0,
      snadCount: 0
    });
  });
  snadCasesBySeller.forEach((row) => {
    const key = String(row._id);
    const current = map.get(key) || { sellerId: key, totalSales: 0, snadCount: 0 };
    current.snadCount += row.snadCases || 0;
    map.set(key, current);
  });
  snadReturnsBySeller.forEach((row) => {
    const key = String(row._id);
    const current = map.get(key) || { sellerId: key, totalSales: 0, snadCount: 0 };
    current.snadCount += row.snadReturns || 0;
    map.set(key, current);
  });

  const nonCompliant = new Map();
  for (const entry of map.values()) {
    const bbeRate = entry.totalSales > 0 ? (entry.snadCount / entry.totalSales) * 100 : 0;
    if (bbeRate > marketAvg) {
      nonCompliant.set(entry.sellerId, {
        ...entry,
        bbeRate: Number(bbeRate.toFixed(2)),
        marketAvg: Number(marketAvg.toFixed(2))
      });
    }
  }

  return nonCompliant;
}

router.get('/dashboard/monthly-delta', requireAuth, requirePageAccess('OrdersDashboard'), async (req, res) => {
  try {
    const month = req.query.month || getPtDateString(new Date()).slice(0, 7);
    const previousMonth = getPreviousMonth(month);
    const { sellerId, marketplace } = req.query;

    const currentRange = getMonthUtcRange(month);
    const previousRange = getMonthUtcRange(previousMonth);

    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};
    const baseMatch = req.query.excludeLowValue === 'true'
      ? {
        ...sellerMatch,
        $or: [{ subtotalUSD: { $gte: 3 } }, { subtotal: { $gte: 3 } }]
      }
      : sellerMatch;
    applyOrderMarketplaceFilter(baseMatch, marketplace);

    const [currentRows, previousRows, sellers] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            ...baseMatch,
            dateSold: { $gte: currentRange.start, $lte: currentRange.end }
          }
        },
        { $group: { _id: '$seller', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        {
          $match: {
            ...baseMatch,
            dateSold: { $gte: previousRange.start, $lte: previousRange.end }
          }
        },
        { $group: { _id: '$seller', count: { $sum: 1 } } }
      ]),
      Seller.find(sellerId ? { _id: new mongoose.Types.ObjectId(sellerId) } : {})
        .populate('user', 'username email')
        .lean()
    ]);

    const sellerNameMap = new Map(
      sellers.map((s) => [String(s._id), s.user?.username || s.user?.email || 'Unknown'])
    );
    const currentMap = new Map(currentRows.map((r) => [String(r._id), r.count || 0]));
    const previousMap = new Map(previousRows.map((r) => [String(r._id), r.count || 0]));
    const sellerIds = new Set([...currentMap.keys(), ...previousMap.keys()]);

    const rows = Array.from(sellerIds).map((id) => {
      const currentMonthOrders = currentMap.get(id) || 0;
      const previousMonthOrders = previousMap.get(id) || 0;
      const delta = currentMonthOrders - previousMonthOrders;
      const deltaPct = previousMonthOrders > 0 ? (delta / previousMonthOrders) * 100 : (currentMonthOrders > 0 ? 100 : 0);
      return {
        sellerId: id,
        sellerName: sellerNameMap.get(id) || 'Unknown',
        currentMonthOrders,
        previousMonthOrders,
        delta,
        deltaPct: Number(deltaPct.toFixed(2))
      };
    }).sort((a, b) => b.currentMonthOrders - a.currentMonthOrders);

    return res.json({ month, previousMonth, rows });
  } catch (error) {
    console.error('Error fetching monthly delta dashboard data:', error);
    return res.status(500).json({ error: 'Failed to fetch monthly delta data' });
  }
});

router.get('/dashboard/overview', requireAuth, requirePageAccess('OrdersDashboard'), async (req, res) => {
  try {
    const date = req.query.date || getPtDateString(new Date());
    const { sellerId, marketplace } = req.query;
    const { start, end } = getPtDayRange(date);
    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};
    const marketplaceClause = {};
    applyOrderMarketplaceFilter(marketplaceClause, marketplace);
    const lowValueClause = req.query.excludeLowValue === 'true'
      ? { $or: [{ subtotalUSD: { $gte: 3 } }, { subtotal: { $gte: 3 } }] }
      : {};
    const maybeAnd = (...parts) => {
      const active = parts.filter((p) => p && Object.keys(p).length > 0);
      if (active.length === 0) return {};
      if (active.length === 1) return active[0];
      return { $and: active };
    };

    const todayOrdersMatch = maybeAnd(
      sellerMatch,
      marketplaceClause,
      { dateSold: { $gte: start, $lte: end } },
      lowValueClause
    );

    const awaitingMatch = maybeAnd(
      sellerMatch,
      marketplaceClause,
      {
        shipByDate: { $gte: start, $lte: end },
        cancelState: { $in: ['NONE_REQUESTED', 'IN_PROGRESS', null, ''] }
      },
      { $or: [{ trackingNumber: { $exists: false } }, { trackingNumber: null }, { trackingNumber: '' }] },
      lowValueClause
    );

    const arrivalsMatch = maybeAnd(
      sellerMatch,
      marketplaceClause,
      { arrivingDate: date },
      lowValueClause
    );

    const [todayOrdersCount, awaitingCount, arrivalsCount, unreadMessagesCount, todayOrdersTable, topSellersRaw, awaitingBySellerRaw, arrivalsBySellerRaw, unreadBySellerRaw, nonCompliantSet] = await Promise.all([
      Order.countDocuments(todayOrdersMatch),
      Order.countDocuments(awaitingMatch),
      Order.countDocuments(arrivalsMatch),
      Message.countDocuments({
        ...sellerMatch,
        sender: 'BUYER',
        read: false,
        messageDate: { $gte: start, $lte: end }
      }),
      Order.find(todayOrdersMatch)
        .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
        .sort({ dateSold: -1 })
        .limit(25)
        .lean(),
      Order.aggregate([
        { $match: todayOrdersMatch },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Order.aggregate([
        { $match: awaitingMatch },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Order.aggregate([
        { $match: arrivalsMatch },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Message.aggregate([
        {
          $match: {
            ...sellerMatch,
            sender: 'BUYER',
            read: false,
            messageDate: { $gte: start, $lte: end }
          }
        },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      getCurrentNonCompliantSellerSet(sellerId)
    ]);

    const allSellerIds = new Set([
      ...topSellersRaw.map((r) => String(r._id)),
      ...awaitingBySellerRaw.map((r) => String(r._id)),
      ...arrivalsBySellerRaw.map((r) => String(r._id)),
      ...unreadBySellerRaw.map((r) => String(r._id)),
      ...Array.from(nonCompliantSet.keys())
    ]);

    const sellerDocs = await Seller.find({ _id: { $in: Array.from(allSellerIds).map((id) => new mongoose.Types.ObjectId(id)) } })
      .populate('user', 'username email')
      .lean();
    const sellerNameMap = new Map(
      sellerDocs.map((s) => [String(s._id), s.user?.username || s.user?.email || 'Unknown'])
    );

    const toSellerRows = (rows) =>
      rows.map((row) => ({
        sellerId: String(row._id),
        sellerName: sellerNameMap.get(String(row._id)) || 'Unknown',
        count: row.count || 0
      }));

    const nonCompliantSellerList = Array.from(nonCompliantSet.values()).map((row) => ({
      sellerId: row.sellerId,
      sellerName: sellerNameMap.get(row.sellerId) || 'Unknown',
      bbeRate: row.bbeRate,
      marketAvg: row.marketAvg
    })).sort((a, b) => b.bbeRate - a.bbeRate);

    const awaitingRows = toSellerRows(awaitingBySellerRaw);
    const unreadRows = toSellerRows(unreadBySellerRaw);
    const topBlockerMap = new Map();
    awaitingRows.forEach((r) => {
      topBlockerMap.set(r.sellerId, { sellerId: r.sellerId, sellerName: r.sellerName, awaiting: r.count, unread: 0 });
    });
    unreadRows.forEach((r) => {
      const current = topBlockerMap.get(r.sellerId) || { sellerId: r.sellerId, sellerName: r.sellerName, awaiting: 0, unread: 0 };
      current.unread = r.count;
      topBlockerMap.set(r.sellerId, current);
    });
    const topBlockers = Array.from(topBlockerMap.values())
      .sort((a, b) => (b.awaiting + b.unread) - (a.awaiting + a.unread))
      .slice(0, 5);

    const month = date.slice(0, 7);
    const previousMonth = getPreviousMonth(month);
    const currentRange = getMonthUtcRange(month);
    const previousRange = getMonthUtcRange(previousMonth);
    const [currentMonthCount, previousMonthCount] = await Promise.all([
      Order.countDocuments(maybeAnd(sellerMatch, marketplaceClause, { dateSold: { $gte: currentRange.start, $lte: currentRange.end } }, lowValueClause)),
      Order.countDocuments(maybeAnd(sellerMatch, marketplaceClause, { dateSold: { $gte: previousRange.start, $lte: previousRange.end } }, lowValueClause))
    ]);

    res.json({
      date,
      timezone: PT_TIMEZONE,
      kpis: {
        todayOrders: todayOrdersCount,
        monthlyDeltaNet: currentMonthCount - previousMonthCount,
        awaitingToday: awaitingCount,
        arrivalsToday: arrivalsCount,
        unreadBuyerMessagesToday: unreadMessagesCount,
        nonCompliantAccounts: nonCompliantSet.size
      },
      topSellers: toSellerRows(topSellersRaw),
      todayOrdersTable: todayOrdersTable.map((o) => ({
        id: o._id,
        sellerId: o.seller?._id ? String(o.seller._id) : String(o.seller),
        sellerName: o.seller?.user?.username || o.seller?.user?.email || 'Unknown',
        orderId: o.orderId,
        dateSold: o.dateSold,
        purchaseMarketplaceId: o.purchaseMarketplaceId,
        shipByDate: o.shipByDate,
        trackingNumber: o.trackingNumber || o.manualTrackingNumber || ''
      })),
      riskQueues: {
        nonCompliantSellerList,
        unreadBySeller: toSellerRows(unreadBySellerRaw),
        awaitingBySeller: awaitingRows,
        arrivalsBySeller: toSellerRows(arrivalsBySellerRaw),
        topBlockers
      },
      quickLinksMeta: {
        fulfillment: '/admin/fulfillment',
        awaitingSheet: `/admin/awaiting-sheet?date=${date}`,
        amazonArrivals: `/admin/amazon-arrivals?arrivalDateFrom=${date}&arrivalDateTo=${date}`,
        accountHealth: '/admin/account-health',
        buyerMessages: '/admin/message-received'
      }
    });
  } catch (error) {
    console.error('Error fetching orders dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

// Get daily order statistics for all sellers
router.get('/daily-statistics', requireAuth, requirePageAccess('OrderAnalytics'), async (req, res) => {
  try {
    const { startDate, endDate, sellerId, marketplace, excludeClient } = req.query;

    // Build the query - NO CANCELSTATE FILTER (matches FulfillmentDashboard)
    const query = {};

    // Add date filter if provided
    // Use the SAME timezone logic as FulfillmentDashboard (PST/PDT aware)
    if (startDate || endDate) {
      query.dateSold = {}; // Use dateSold field, not creationDate

      if (startDate) {
        query.dateSold.$gte = getPTDayBoundsUTC(startDate).start;
      }

      if (endDate) {
        query.dateSold.$lte = getPTDayBoundsUTC(endDate).end;
      }
    }

    // Add seller filter if provided
    if (sellerId) {
      query.seller = new mongoose.Types.ObjectId(sellerId);
    }

    if (excludeClient === 'true') {
      const excludedSellerIds = await getExcludedClientSellerIds();
      if (excludedSellerIds.length > 0) {
        query.seller = query.seller
          ? { $in: [query.seller].filter((sellerObjectId) => !excludedSellerIds.some((excludedId) => excludedId.equals(sellerObjectId))) }
          : { $nin: excludedSellerIds };
      }
    }

    if (marketplace) {
      if (marketplace === 'EBAY_CA') {
        query.purchaseMarketplaceId = { $in: ['EBAY_CA', 'EBAY_ENCA'] };
      } else if (marketplace === 'GB' || marketplace === 'EBAY_GB') {
        query.purchaseMarketplaceId = { $in: ['GB', 'EBAY_GB'] };
      } else {
        query.purchaseMarketplaceId = marketplace;
      }
    }

    // Filter out low value orders if requested (< $3)
    if (req.query.excludeLowValue === 'true') {
      query.subtotalUSD = { $gte: 3 };
    }

    // Aggregate orders by seller, date, and marketplace
    const statistics = await Order.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'sellers',
          localField: 'seller',
          foreignField: '_id',
          as: 'sellerInfo'
        }
      },
      { $unwind: '$sellerInfo' },
      {
        $lookup: {
          from: 'users',
          localField: 'sellerInfo.user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          seller: '$seller',
          sellerUsername: '$userInfo.username',
          orderDate: {
            // Convert UTC date to PST date string (matching FulfillmentDashboard)
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$dateSold', // Use dateSold field
              timezone: 'America/Los_Angeles' // PST/PDT timezone
            }
          },
          marketplace: { $ifNull: ['$purchaseMarketplaceId', 'Unknown'] }
        }
      },
      {
        $group: {
          _id: {
            seller: '$seller',
            sellerUsername: '$sellerUsername',
            date: '$orderDate',
            marketplace: '$marketplace'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: {
            seller: '$_id.seller',
            sellerUsername: '$_id.sellerUsername',
            date: '$_id.date'
          },
          totalOrders: { $sum: '$count' },
          marketplaceBreakdown: {
            $push: {
              marketplace: '$_id.marketplace',
              count: '$count'
            }
          }
        }
      },
      {
        $sort: { '_id.date': -1, '_id.sellerUsername': 1 }
      }
    ]);

    // Transform the data for easier consumption on the frontend
    const formattedStatistics = statistics.map(stat => ({
      seller: {
        id: stat._id.seller,
        username: stat._id.sellerUsername
      },
      date: stat._id.date,
      totalOrders: stat.totalOrders,
      marketplaceBreakdown: stat.marketplaceBreakdown
    }));

    res.json(formattedStatistics);
  } catch (error) {
    console.error('Error fetching daily order statistics:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

const CRP_GROUP_FIELD_MAP = {
  category: { field: 'orderCategoryId', from: 'asinlistcategories' },
  range: { field: 'orderRangeId', from: 'asinlistranges' },
  product: { field: 'orderProductId', from: 'asinlistproducts' },
};

const CRP_VALUE_BAND_SWITCH = {
  $switch: {
    branches: [
      { case: { $lt: ['$amount', 30] }, then: 'low' },
      { case: { $lt: ['$amount', 60] }, then: 'mid' },
      { case: { $lt: ['$amount', 100] }, then: 'high' },
    ],
    default: 'extraHigh',
  },
};

function mapCrpCategoryRows(rows = []) {
  return rows.map((r) => ({
    id: r._id ? r._id.toString() : null,
    name: r.name || 'Unassigned',
    count: r.count,
  }));
}

function mapCrpValueBandRows(rows = []) {
  const bands = { low: 0, mid: 0, high: 0, extraHigh: 0 };
  rows.forEach((row) => {
    if (row._id && Object.prototype.hasOwnProperty.call(bands, row._id)) {
      bands[row._id] = row.count;
    }
  });
  return bands;
}

function buildCrpCategoryFacetStages(field, from) {
  return [
    {
      $group: {
        _id: { $ifNull: [`$${field}`, null] },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from,
        localField: '_id',
        foreignField: '_id',
        as: 'taxDoc',
      },
    },
    {
      $project: {
        _id: 1,
        count: 1,
        name: {
          $cond: {
            if: { $eq: ['$_id', null] },
            then: 'Unassigned',
            else: { $arrayElemAt: ['$taxDoc.name', 0] },
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// CRP Analytics  GET /orders/crp-analytics
// Returns category/range/product distribution plus order value bands.
// Query params: startDate, endDate, sellerId, marketplace, groupBy (category|range|product),
//               excludeClient, excludeLowValue (true/false)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/crp-analytics', requireAuth, requirePageAccess('CRPAnalytics'), async (req, res) => {
  try {
    const { startDate, endDate, sellerId, marketplace, groupBy = 'category', excludeClient, excludeLowValue } = req.query;

    const match = await buildOrdersCrpMatch({
      startDate,
      endDate,
      sellerId,
      marketplace,
      excludeClient,
      excludeLowValue,
    });

    const { field, from } = CRP_GROUP_FIELD_MAP[groupBy] || CRP_GROUP_FIELD_MAP.category;

    const [result] = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          categories: buildCrpCategoryFacetStages(field, from),
          valueBands: [
            {
              $addFields: {
                amount: { $ifNull: ['$subtotalUSD', { $ifNull: ['$subtotal', 0] }] },
              },
            },
            {
              $group: {
                _id: CRP_VALUE_BAND_SWITCH,
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    res.json({
      categories: mapCrpCategoryRows(result?.categories || []),
      valueBands: mapCrpValueBandRows(result?.valueBands || []),
    });
  } catch (error) {
    console.error('Error fetching CRP analytics:', error);
    res.status(500).json({ error: 'Failed to fetch CRP analytics' });
  }
});

// CRP Analytics drill-down for a single category/range/product bucket
router.get('/crp-analytics/details', requireAuth, requirePageAccess('CRPAnalytics'), async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      sellerId,
      marketplace,
      groupBy = 'category',
      excludeClient,
      excludeLowValue,
      categoryId,
      rangeId,
      productId,
      page = 1,
      limit = 10,
    } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const match = await buildOrdersCrpMatch({
      startDate,
      endDate,
      sellerId,
      marketplace,
      excludeClient,
      excludeLowValue,
    });

    const groupFieldMap = {
      category: 'orderCategoryId',
      range: 'orderRangeId',
      product: 'orderProductId',
    };
    const idField = groupFieldMap[groupBy] || groupFieldMap.category;
    const idParamMap = {
      orderCategoryId: categoryId,
      orderRangeId: rangeId,
      orderProductId: productId,
    };
    match[idField] = normalizeObjectIdOrNull(idParamMap[idField], idField);

    const result = await Order.aggregate([
      { $match: match },
      { $sort: { dateSold: -1 } },
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: safeLimit },
            {
              $project: {
                _id: 1,
                orderId: 1,
                dateSold: 1,
                productName: 1,
                amount: { $ifNull: ['$subtotalUSD', '$subtotal'] },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const payload = result[0] || { items: [], total: [] };
    const total = payload.total[0]?.count || 0;

    res.json({
      items: payload.items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error('Error fetching CRP analytics details:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch CRP analytics details' });
  }
});

// CRP comparison summary for listings vs orders
router.get('/crp-comparison', requireAuth, requirePageAccess('CRPComparison'), async (req, res) => {
  try {
    const {
      sellerId,
      ordersStartDate,
      ordersEndDate,
      listingsStartDate,
      listingsEndDate,
      excludeClient,
      excludeLowValue,
      chartLevel = 'category'
    } = req.query;

    const safeChartLevel = ['category', 'range', 'product'].includes(chartLevel)
      ? chartLevel
      : 'category';

    const orderMatch = await buildOrdersCrpMatch({
      startDate: ordersStartDate,
      endDate: ordersEndDate,
      sellerId,
      excludeClient,
      excludeLowValue,
    });

    const listingMatch = await buildListingsCrpMatch({
      startDate: listingsStartDate,
      endDate: listingsEndDate,
      sellerId,
      excludeClient,
    });

    const [listingRows, orderRows] = await Promise.all([
      getListingComparisonRows(listingMatch),
      getOrderComparisonRows(orderMatch),
    ]);

    const rows = mergeComparisonRows(listingRows, orderRows);
    const listingCrps = rows.filter((row) => row.listings.count > 0).length;
    const orderCrps = rows.filter((row) => row.orders.count > 0).length;
    const matchedCrps = rows.filter((row) => row.listings.count > 0 && row.orders.count > 0).length;
    const listingOnlyCrps = rows.filter((row) => row.listings.count > 0 && row.orders.count === 0).length;
    const orderOnlyCrps = rows.filter((row) => row.orders.count > 0 && row.listings.count === 0).length;
    const largestGapRow = rows[0] || null;

    res.json({
      summary: {
        listingsTotal: rows.reduce((sum, row) => sum + row.listings.count, 0),
        ordersTotal: rows.reduce((sum, row) => sum + row.orders.count, 0),
        listingCrps,
        orderCrps,
        matchedCrps,
        listingOnlyCrps,
        orderOnlyCrps,
        largestGap: largestGapRow
          ? {
              count: largestGapRow.absGap,
              categoryName: largestGapRow.categoryName,
              rangeName: largestGapRow.rangeName,
              productName: largestGapRow.productName,
            }
          : null,
      },
      rows,
      chartLevel: safeChartLevel,
      listingsChart: buildChartData(rows, 'listings', safeChartLevel),
      ordersChart: buildChartData(rows, 'orders', safeChartLevel),
    });
  } catch (error) {
    console.error('Error fetching CRP comparison summary:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch CRP comparison summary' });
  }
});

// CRP comparison detail drill-down for one side and one CRP path
router.get('/crp-comparison-details', requireAuth, requirePageAccess('CRPComparison'), async (req, res) => {
  try {
    const {
      side,
      sellerId,
      ordersStartDate,
      ordersEndDate,
      listingsStartDate,
      listingsEndDate,
      excludeClient,
      excludeLowValue,
      categoryId,
      rangeId,
      productId,
      page = 1,
      limit = 10,
    } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const pathMatch = {
      categoryId: normalizeObjectIdOrNull(categoryId, 'categoryId'),
      rangeId: normalizeObjectIdOrNull(rangeId, 'rangeId'),
      productId: normalizeObjectIdOrNull(productId, 'productId'),
    };

    if (side === 'orders') {
      const match = await buildOrdersCrpMatch({
        startDate: ordersStartDate,
        endDate: ordersEndDate,
        sellerId,
        excludeClient,
        excludeLowValue,
      });

      match.orderCategoryId = pathMatch.categoryId;
      match.orderRangeId = pathMatch.rangeId;
      match.orderProductId = pathMatch.productId;

      const result = await Order.aggregate([
        { $match: match },
        { $sort: { dateSold: -1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: safeLimit },
              {
                $project: {
                  _id: 1,
                  orderId: 1,
                  dateSold: 1,
                  productName: 1,
                  amount: { $ifNull: ['$subtotalUSD', '$subtotal'] }
                }
              }
            ],
            total: [{ $count: 'count' }]
          }
        }
      ]);

      const payload = result[0] || { items: [], total: [] };
      const total = payload.total[0]?.count || 0;

      return res.json({
        side,
        items: payload.items,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit)
        }
      });
    }

    if (side === 'listings') {
      const match = await buildListingsCrpMatch({
        startDate: listingsStartDate,
        endDate: listingsEndDate,
        sellerId,
        excludeClient,
      });

      const result = await TemplateListing.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'listingtemplates',
            localField: 'templateId',
            foreignField: '_id',
            as: 'templateDoc'
          }
        },
        { $unwind: { path: '$templateDoc', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'asinlistproducts',
            localField: 'templateDoc.listProductId',
            foreignField: '_id',
            as: 'productDoc'
          }
        },
        {
          $addFields: {
            productDocObj: { $arrayElemAt: ['$productDoc', 0] },
            derivedProductId: { $ifNull: ['$templateDoc.listProductId', null] }
          }
        },
        {
          $addFields: {
            derivedRangeId: { $ifNull: ['$productDocObj.rangeId', '$templateDoc.rangeId'] }
          }
        },
        {
          $lookup: {
            from: 'asinlistranges',
            localField: 'derivedRangeId',
            foreignField: '_id',
            as: 'rangeDoc'
          }
        },
        {
          $addFields: {
            rangeDocObj: { $arrayElemAt: ['$rangeDoc', 0] },
            derivedCategoryId: {
              $ifNull: ['$productDocObj.categoryId', { $arrayElemAt: ['$rangeDoc.categoryId', 0] }]
            }
          }
        },
        {
          $match: {
            derivedCategoryId: pathMatch.categoryId,
            derivedRangeId: pathMatch.rangeId,
            derivedProductId: pathMatch.productId,
          }
        },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: safeLimit },
              {
                $project: {
                  _id: 1,
                  customLabel: 1,
                  asin: '$_asinReference',
                  title: 1,
                  createdAt: 1,
                  status: 1,
                }
              }
            ],
            total: [{ $count: 'count' }]
          }
        }
      ]);

      const payload = result[0] || { items: [], total: [] };
      const total = payload.total[0]?.count || 0;

      return res.json({
        side,
        items: payload.items,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit)
        }
      });
    }

    return res.status(400).json({ error: 'side must be either orders or listings' });
  } catch (error) {
    console.error('Error fetching CRP comparison details:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch CRP comparison details' });
  }
});

// Get worksheet statistics for cancellations, returns, INR/disputes, and inquiries
router.get('/worksheet-statistics', requireAuth, requirePageAccess('OrderAnalytics'), async (req, res) => {
  try {
    const { startDate, endDate, sellerId } = req.query;

    // Build seller filter if sellerId is provided
    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};

    // Use Pacific Time boundaries for filtering (PST/PDT)
    const buildDateRangeMatch = (field) => {
      if (!startDate && !endDate) return {};
      const range = {};
      if (startDate) {
        const { start } = getPtDayRange(startDate);
        range.$gte = start;
      }
      if (endDate) {
        const { end } = getPtDayRange(endDate);
        range.$lte = end;
      }
      return { [field]: range };
    };

    // Project date in Pacific Time for grouping
    const ptDateProjection = (field) => ({
      $dateToString: {
        format: '%Y-%m-%d',
        date: field,
        timezone: PT_TIMEZONE
      }
    });

    const cancellationStates = ['CANCEL_REQUESTED', 'IN_PROGRESS', 'CANCELED', 'CANCELLED'];
    const cancellationPipeline = [
      { $addFields: { worksheetDate: { $ifNull: ['$dateSold', '$creationDate'] } } },
      {
        $match: {
          ...sellerMatch,
          cancelState: { $in: cancellationStates },
          ...buildDateRangeMatch('worksheetDate')
        }
      },
      {
        $project: {
          worksheetStatus: { $ifNull: ['$worksheetStatus', 'open'] },
          date: ptDateProjection('$worksheetDate')
        }
      },
      {
        $group: {
          _id: { date: '$date', status: '$worksheetStatus' },
          count: { $sum: 1 }
        }
      }
    ];

    const returnsPipeline = [
      { $match: { ...sellerMatch, ...buildDateRangeMatch('creationDate') } },
      {
        $project: {
          worksheetStatus: { $ifNull: ['$worksheetStatus', 'open'] },
          date: ptDateProjection('$creationDate')
        }
      },
      {
        $group: {
          _id: { date: '$date', status: '$worksheetStatus' },
          count: { $sum: 1 }
        }
      }
    ];

    const casesPipeline = [
      { $match: { ...sellerMatch, ...buildDateRangeMatch('creationDate') } },
      {
        $project: {
          status: '$status',
          date: ptDateProjection('$creationDate')
        }
      },
      {
        $group: {
          _id: { date: '$date', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ];

    const disputesPipeline = [
      { $addFields: { worksheetDate: { $ifNull: ['$openDate', '$createdAt'] } } },
      { $match: { ...sellerMatch, ...buildDateRangeMatch('worksheetDate') } },
      {
        $project: {
          status: '$paymentDisputeStatus',
          date: ptDateProjection('$worksheetDate')
        }
      },
      {
        $group: {
          _id: { date: '$date', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ];

    // Inquiries: count buyer inquiry messages per day
    // messageType != 'ORDER' AND no orderId (matches chat INQUIRY filter)
    const inquiriesPipeline = [
      {
        $match: {
          ...sellerMatch,
          sender: 'BUYER',
          messageType: { $ne: 'ORDER' },
          $or: [{ orderId: null }, { orderId: { $exists: false } }, { orderId: '' }],
          ...buildDateRangeMatch('messageDate')
        }
      },
      {
        $project: {
          date: ptDateProjection('$messageDate')
        }
      },
      {
        $group: {
          _id: { date: '$date' },
          count: { $sum: 1 }
        }
      }
    ];

    const [
      cancellationStats,
      returnStats,
      caseStats,
      disputeStats,
      inquiryStats
    ] = await Promise.all([
      Order.aggregate(cancellationPipeline),
      Return.aggregate(returnsPipeline),
      Case.aggregate(casesPipeline),
      PaymentDispute.aggregate(disputesPipeline),
      Message.aggregate(inquiriesPipeline)
    ]);

    const dateMap = new Map();
    const ensureDate = (date) => {
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          date,
          pstDate: date,
          cancellations: { open: 0, attended: 0, resolved: 0 },
          returns: { open: 0, attended: 0, resolved: 0 },
          inrDisputes: { open: 0, attended: 0, resolved: 0 },
          inquiries: { total: 0 }
        });
      }
      return dateMap.get(date);
    };

    const addCount = (date, category, bucket, count) => {
      const entry = ensureDate(date);
      entry[category][bucket] += count;
    };

    const caseOpen = new Set(['OPEN', 'WAITING_SELLER_RESPONSE', 'WAITING_FOR_SELLER']);
    const caseAttended = new Set(['ON_HOLD', 'WAITING_BUYER_RESPONSE', 'WAITING_FOR_BUYER']);
    const caseResolved = new Set(['CLOSED', 'RESOLVED']);

    const disputeOpen = new Set(['OPEN', 'WAITING_FOR_SELLER_RESPONSE']);
    const disputeAttended = new Set(['UNDER_REVIEW']);
    const disputeResolved = new Set(['RESOLVED_BUYER_FAVOUR', 'RESOLVED_SELLER_FAVOUR', 'CLOSED']);

    // Cancellations use manual worksheetStatus
    cancellationStats.forEach((stat) => {
      const { date, status } = stat._id;
      addCount(date, 'cancellations', status, stat.count);
    });

    // Returns use manual worksheetStatus
    returnStats.forEach((stat) => {
      const { date, status } = stat._id;
      addCount(date, 'returns', status, stat.count);
    });

    // Cases use automatic status logic
    caseStats.forEach((stat) => {
      const { date, status } = stat._id;
      if (caseOpen.has(status)) {
        addCount(date, 'inrDisputes', 'open', stat.count);
      } else if (caseAttended.has(status)) {
        addCount(date, 'inrDisputes', 'attended', stat.count);
      } else if (caseResolved.has(status)) {
        addCount(date, 'inrDisputes', 'resolved', stat.count);
      } else {
        addCount(date, 'inrDisputes', 'attended', stat.count);
      }
    });

    // Disputes use automatic status logic
    disputeStats.forEach((stat) => {
      const { date, status } = stat._id;
      if (disputeOpen.has(status)) {
        addCount(date, 'inrDisputes', 'open', stat.count);
      } else if (disputeAttended.has(status)) {
        addCount(date, 'inrDisputes', 'attended', stat.count);
      } else if (disputeResolved.has(status)) {
        addCount(date, 'inrDisputes', 'resolved', stat.count);
      } else {
        addCount(date, 'inrDisputes', 'attended', stat.count);
      }
    });

    inquiryStats.forEach((stat) => {
      const date = stat._id.date;
      const entry = ensureDate(date);
      entry.inquiries.total += stat.count;
    });

    const worksheetStats = Array.from(dateMap.values()).sort((a, b) =>
      a.date < b.date ? 1 : -1
    );

    res.json(worksheetStats);
  } catch (error) {
    console.error('Error fetching worksheet statistics:', error);
    res.status(500).json({ error: 'Failed to fetch worksheet statistics' });
  }
});

// Worksheet summary for cards (totals + open counts + totalOrders) based on the same filter as worksheet-statistics
router.get('/worksheet-summary', requireAuth, requirePageAccess('OrderAnalytics'), async (req, res) => {
  try {
    const { startDate, endDate, sellerId } = req.query;

    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};

    // Use Pacific Time boundaries for filtering (PST/PDT)
    const buildDateRangeMatch = (field) => {
      if (!startDate && !endDate) return {};
      const range = {};
      if (startDate) {
        const { start } = getPtDayRange(startDate);
        range.$gte = start;
      }
      if (endDate) {
        const { end } = getPtDayRange(endDate);
        range.$lte = end;
      }
      return { [field]: range };
    };

    // Total orders denominator (uses dateSold like order analytics)
    const totalOrdersQuery = {
      ...sellerMatch,
      ...buildDateRangeMatch('dateSold')
    };

    // Define status mappings first (needed for overall open counts)
    const caseOpen = new Set(['OPEN', 'WAITING_SELLER_RESPONSE', 'WAITING_FOR_SELLER']);
    const caseAttended = new Set(['ON_HOLD', 'WAITING_BUYER_RESPONSE', 'WAITING_FOR_BUYER']);
    const caseResolved = new Set(['CLOSED', 'RESOLVED']);

    const disputeOpen = new Set(['OPEN', 'WAITING_FOR_SELLER_RESPONSE']);
    const disputeAttended = new Set(['UNDER_REVIEW']);
    const disputeResolved = new Set(['RESOLVED_BUYER_FAVOUR', 'RESOLVED_SELLER_FAVOUR', 'CLOSED']);

    // Cancellations: orders with cancelState in list, date is worksheetDate (dateSold || creationDate)
    const cancellationStates = ['CANCEL_REQUESTED', 'IN_PROGRESS', 'CANCELED', 'CANCELLED'];
    const cancellationsMatchStage = {
      $match: {
        ...sellerMatch,
        cancelState: { $in: cancellationStates }
      }
    };

    const cancellationsPipeline = [
      { $addFields: { worksheetDate: { $ifNull: ['$dateSold', '$creationDate'] } } },
      cancellationsMatchStage,
      ...(startDate || endDate ? [{ $match: buildDateRangeMatch('worksheetDate') }] : []),
      {
        $project: {
          worksheetStatus: { $ifNull: ['$worksheetStatus', 'open'] }
        }
      },
      {
        $group: {
          _id: '$worksheetStatus',
          count: { $sum: 1 }
        }
      }
    ];

    // Returns: Return.creationDate, manual worksheetStatus default open
    const returnsPipeline = [
      {
        $match: {
          ...sellerMatch,
          ...(startDate || endDate ? buildDateRangeMatch('creationDate') : {})
        }
      },
      {
        $project: {
          worksheetStatus: { $ifNull: ['$worksheetStatus', 'open'] }
        }
      },
      {
        $group: {
          _id: '$worksheetStatus',
          count: { $sum: 1 }
        }
      }
    ];

    // INR: Case.creationDate, automatic status based on Case.status (same mapping as worksheet table)
    const inrPipeline = [
      {
        $match: {
          ...sellerMatch,
          ...(startDate || endDate ? buildDateRangeMatch('creationDate') : {})
        }
      },
      {
        $project: {
          status: '$status'
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ];

    // Disputes: PaymentDispute.openDate || createdAt, automatic status based on paymentDisputeStatus (same mapping as worksheet table)
    const disputesPipeline = [
      { $addFields: { worksheetDate: { $ifNull: ['$openDate', '$createdAt'] } } },
      {
        $match: {
          ...sellerMatch,
          ...(startDate || endDate ? buildDateRangeMatch('worksheetDate') : {})
        }
      },
      {
        $project: {
          status: '$paymentDisputeStatus'
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ];

    const [totalOrders, cancellationsByStatus, returnsByStatus, inrByStatus, disputesByStatus, cancellationsOpenOverall, returnsOpenOverall, inrOpenOverall, disputesOpenOverall] = await Promise.all([
      Order.countDocuments(totalOrdersQuery),
      Order.aggregate(cancellationsPipeline),
      Return.aggregate(returnsPipeline),
      Case.aggregate(inrPipeline),
      PaymentDispute.aggregate(disputesPipeline),
      Order.countDocuments({
        cancelState: { $in: cancellationStates },
        $or: [{ worksheetStatus: 'open' }, { worksheetStatus: { $exists: false } }, { worksheetStatus: null }]
      }),
      Return.countDocuments({
        $or: [{ worksheetStatus: 'open' }, { worksheetStatus: { $exists: false } }, { worksheetStatus: null }]
      }),
      Case.countDocuments({ status: { $in: Array.from(caseOpen) } }),
      PaymentDispute.countDocuments({ paymentDisputeStatus: { $in: Array.from(disputeOpen) } })
    ]);

    const toWorksheetBuckets = (rows) => {
      const base = { open: 0, attended: 0, resolved: 0, total: 0 };
      rows.forEach((r) => {
        const key = r._id;
        const count = r.count || 0;
        if (key === 'open' || key === 'attended' || key === 'resolved') {
          base[key] += count;
          base.total += count;
        }
      });
      return base;
    };

    const cancellations = toWorksheetBuckets(cancellationsByStatus);
    const returns = toWorksheetBuckets(returnsByStatus);
    // Keep left card values static (overall open counts), independent of filters.
    cancellations.open = cancellationsOpenOverall || 0;
    returns.open = returnsOpenOverall || 0;

    const inr = { open: 0, attended: 0, resolved: 0, total: 0 };
    inrByStatus.forEach((r) => {
      const status = r._id;
      const count = r.count || 0;
      if (caseOpen.has(status)) inr.open += count;
      else if (caseResolved.has(status)) inr.resolved += count;
      else if (caseAttended.has(status)) inr.attended += count;
      else inr.attended += count;
      inr.total += count;
    });
    inr.open = inrOpenOverall || 0;
    const disputes = { open: 0, attended: 0, resolved: 0, total: 0 };
    disputesByStatus.forEach((r) => {
      const status = r._id;
      const count = r.count || 0;
      if (disputeOpen.has(status)) disputes.open += count;
      else if (disputeAttended.has(status)) disputes.attended += count;
      else if (disputeResolved.has(status)) disputes.resolved += count;
      else disputes.attended += count;
      disputes.total += count;
    });
    disputes.open = disputesOpenOverall || 0;
    res.json({
      totalOrders,
      cancellations,
      returns,
      inr,
      disputes
    });
  } catch (error) {
    console.error('Error fetching worksheet summary:', error);
    res.status(500).json({ error: 'Failed to fetch worksheet summary' });
  }
});

// COMPLIANCE BOARD ENDPOINTS

/**
 * GET /orders/compliance-board
 * Fetch orders for the compliance board kanban view
 * Query params: category, startDate, endDate, page, limit
 */
router.get('/compliance-board', requireAuth, requirePageAccess('ComplianceBoard'), async (req, res) => {
  try {
    const {
      category,
      startDate,
      endDate,
      page = 1,
      limit = 500,
      excludeCancelled = 'false',
      sellerId = '',
      searchOrderId = '',
      searchBuyerName = '',
      excludeClient = 'false',
      excludeLowValue = 'false',
      statusFilter = '',
      overdueAlert = ''
    } = req.query;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    // Minimum date for compliance boards
    // order_fulfillment: August 1, 2026 | others: July 19, 2026
    const COMPLIANCE_BOARD_MIN_DATE = category === 'order_fulfillment' 
      ? new Date('2026-08-01T00:00:00Z') 
      : new Date('2026-07-19T00:00:00Z');
    const categoriesWithMinDate = ['order_fulfillment', 'order_communication', 'issue_hub', 'cancellation', 'inr', 'return_refund'];

    // Build date filter using timezone-aware PT logic (same as All Orders page)
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.dateSold = {};
      if (startDate) {
        const { start } = getPTDayBoundsUTC(startDate);
        dateFilter.dateSold.$gte = start;
      } else if (categoriesWithMinDate.includes(category)) {
        // No startDate provided but category requires minimum date
        dateFilter.dateSold.$gte = COMPLIANCE_BOARD_MIN_DATE;
      }
      if (endDate) {
        const { end } = getPTDayBoundsUTC(endDate);
        dateFilter.dateSold.$lte = end;
      }
    } else if (categoriesWithMinDate.includes(category)) {
      // No date filters provided but category requires minimum date
      dateFilter.dateSold = { $gte: COMPLIANCE_BOARD_MIN_DATE };
    }

    const orderIdRegex = searchOrderId?.trim() ? new RegExp(searchOrderId.trim(), 'i') : null;
    const buyerNameRegex = searchBuyerName?.trim() ? new RegExp(searchBuyerName.trim(), 'i') : null;
    const sellerObjectId = sellerId && mongoose.Types.ObjectId.isValid(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : null;
    const excludeClientEnabled = excludeClient === 'true' || excludeClient === true;
    const excludeLowValueEnabled = excludeLowValue === 'true' || excludeLowValue === true;
    const excludedSellerIds = excludeClientEnabled ? await getExcludedClientSellerIds() : [];
    const isExcludedSeller = (seller) => {
      const sellerIdValue = seller?._id || seller;
      return excludedSellerIds.some((excludedId) => String(excludedId) === String(sellerIdValue));
    };
    const isLowValueOrder = (order) => {
      const amount = Number(order?.subtotalUSD ?? order?.subtotal ?? 0);
      return Number.isFinite(amount) && amount < 3;
    };
    const overdueCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    if (category === 'return_refund') {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 500));
      const skip = (pageNum - 1) * limitNum;

      // Minimum date for compliance boards: July 19, 2026
      const COMPLIANCE_BOARD_MIN_DATE = new Date('2026-07-19T00:00:00Z');

      const returnQuery = {
        creationDate: { $gte: COMPLIANCE_BOARD_MIN_DATE }
      };
      const conversationQuery = {
        category: { $in: ['Return', 'Refund', 'Replace'] },
        updatedAt: { $gte: COMPLIANCE_BOARD_MIN_DATE }
      };
      if (startDate || endDate) {
        if (startDate) {
          returnQuery.creationDate.$gte = getPTDayBoundsUTC(startDate).start;
          conversationQuery.updatedAt.$gte = getPTDayBoundsUTC(startDate).start;
        }
        if (endDate) {
          returnQuery.creationDate.$lte = getPTDayBoundsUTC(endDate).end;
          conversationQuery.updatedAt.$lte = getPTDayBoundsUTC(endDate).end;
        }
      }

      const [returnRequests, returnConversations, assignedOrders] = await Promise.all([
        Return.find(returnQuery)
            .select({
              rawData: 0,
              rawDetail: 0,
              rawTracking: 0,
              files: 0,
              trackingInfo: 0,
              trackingScanHistory: 0,
            })
          .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
          .sort({ updatedAt: -1, creationDate: -1 })
          .limit(1000) // Limit to most recent 1000 Returns to avoid memory issues
          .lean(),
        ConversationMeta.find(conversationQuery)
            .select('orderId itemId buyerUsername buyerName seller itemTitle productName category caseStatus status pickedUpBy updatedAt createdAt')
          .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
          .sort({ updatedAt: -1 })
          .lean(),
        Order.find({
          $and: [
            {
              $or: [
                { complianceBoardCategories: category },
                { complianceBoardCategory: category }
              ]
            },
            // For specialized boards (return_refund, cancellation, inr), don't exclude by other categories
            // An order can be in multiple categories legitimately
            // Only for order_fulfillment, exclude orders in specialized categories
            ...(category === 'order_fulfillment' ? [
              {
                $and: [
                  { complianceBoardCategories: { $ne: 'return_refund' } },
                  { complianceBoardCategories: { $ne: 'cancellation' } },
                  { complianceBoardCategories: { $ne: 'inr' } }
                ]
              }
            ] : [])
          ],
          ...dateFilter
        })
          .select('orderId dateSold buyer subtotal subtotalUSD orderFulfillmentStatus complianceBoardStatus complianceBoardTracking complianceBoardCategory complianceBoardCategories complianceBoardSource outOfStockAssignedAt cancellationAssignedAt addressIssueAssignedAt returnCaseNotOpenedAssignedAt returnItemDeliveredAssignedAt cancellationCaseNotOpenedAssignedAt inrCaseNotOpenedAssignedAt updatedAt purchaseMarketplaceId remark seller itemNumber lineItems productName trackingNumber manualTrackingNumber cancelState amazonAccount arrivingDate beforeTax estimatedTax azOrderId')
          .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
          .sort({ dateSold: -1 })
          .lean()
      ]);
      
      // Log assigned orders fetch for diagnostics
      console.log(`[BOARD-GET] Fetched ${returnRequests.length} Return documents`);
      console.log(`[BOARD-GET] Fetched ${assignedOrders.length} assignedOrders with category='${category}'`);
      if (assignedOrders.length > 0) {
        const samples = assignedOrders.slice(0, 3).map(o => ({
          orderId: o.orderId,
          status: o.complianceBoardStatus,
          categories: o.complianceBoardCategories,
          category: o.complianceBoardCategory
        }));
        console.log(`[BOARD-GET] Sample assignedOrders:`, samples);
      }

      const sourceOrderIds = [
        ...returnRequests.map((ret) => ret.orderId),
        ...returnConversations.map((meta) => meta.orderId),
        ...returnConversations.map((meta) => meta.orderId ? null : meta.itemId),
      ].filter(Boolean);

      const sourceOrders = await Order.find({
        $or: [
          { orderId: { $in: sourceOrderIds } },
          { itemNumber: { $in: sourceOrderIds } },
          { 'lineItems.legacyItemId': { $in: sourceOrderIds } },
        ]
      })
        .select('orderId dateSold buyer subtotal subtotalUSD orderFulfillmentStatus complianceBoardStatus complianceBoardTracking complianceBoardCategory complianceBoardCategories complianceBoardSource outOfStockAssignedAt cancellationAssignedAt addressIssueAssignedAt returnCaseNotOpenedAssignedAt returnItemDeliveredAssignedAt cancellationCaseNotOpenedAssignedAt inrCaseNotOpenedAssignedAt updatedAt purchaseMarketplaceId remark seller itemNumber lineItems productName trackingNumber manualTrackingNumber cancelState amazonAccount arrivingDate beforeTax estimatedTax azOrderId')
        .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
        .lean();

      const orderByOrderId = new Map(sourceOrders.map((order) => [order.orderId, order]));
      const orderByItemId = new Map();
      sourceOrders.forEach((order) => {
        if (order.itemNumber) orderByItemId.set(order.itemNumber, order);
        (order.lineItems || []).forEach((item) => {
          if (item.legacyItemId) orderByItemId.set(item.legacyItemId, order);
        });
      });

      const normalizeCategories = (order) => {
        if (Array.isArray(order?.complianceBoardCategories) && order.complianceBoardCategories.length > 0) {
          return order.complianceBoardCategories;
        }
        if (order?.complianceBoardCategory) return [order.complianceBoardCategory];
        return [category];
      };

      const makeOrderCard = (baseOrder, fallback, status, sourceType) => ({
        ...(baseOrder || {}),
        _id: sourceType === 'return_request'
          ? `return:${fallback.returnId || fallback._id}`
          : (baseOrder?._id || fallback._id),
        orderObjectId: baseOrder?._id || null,
        orderId: baseOrder?.orderId || fallback.orderId || fallback.returnId || fallback.itemId,
        dateSold: baseOrder?.dateSold || baseOrder?.creationDate || fallback.creationDate || fallback.updatedAt,
        buyer: baseOrder?.buyer || {
          username: fallback.buyerUsername,
          buyerRegistrationAddress: {
            fullName: fallback.buyerName || fallback.buyerUsername
          }
        },
        seller: baseOrder?.seller || fallback.seller,
        itemNumber: baseOrder?.itemNumber || fallback.itemId,
        lineItems: baseOrder?.lineItems?.length ? baseOrder.lineItems : [{
          legacyItemId: fallback.itemId,
          title: fallback.itemTitle || fallback.productName || 'Item'
        }],
        productName: baseOrder?.productName || fallback.itemTitle || fallback.productName || 'Item',
        subtotal: baseOrder?.subtotal,
        subtotalUSD: baseOrder?.subtotalUSD,
        remark: baseOrder?.remark || fallback.buyerComments || fallback.notes || '',
        complianceBoardStatus: status,
        // Only include tracking for conversation-based cards, not for Return Request cards
        ...(sourceType === 'conversation' && { complianceBoardTracking: baseOrder?.complianceBoardTracking || '' }),
        complianceBoardCategories: normalizeCategories(baseOrder),
        outOfStockAssignedAt: baseOrder?.outOfStockAssignedAt || null,
        cancellationAssignedAt: baseOrder?.cancellationAssignedAt || null,
        addressIssueAssignedAt: baseOrder?.addressIssueAssignedAt || null,
        returnCaseNotOpenedAssignedAt: baseOrder?.returnCaseNotOpenedAssignedAt || null,
        returnItemDeliveredAssignedAt: baseOrder?.returnItemDeliveredAssignedAt || null,
        updatedAt: baseOrder?.updatedAt || null,
        returnBoardSource: sourceType,
        returnInfo: sourceType === 'return_request' ? {
          returnId: fallback.returnId,
          returnStatus: fallback.returnStatus,
          returnReason: fallback.returnReason,
          createdDate: fallback.creationDate,
          responseDate: fallback.responseDate,
        } : undefined,
        conversationInfo: sourceType === 'conversation' ? {
          category: fallback.category,
          caseStatus: fallback.caseStatus,
          status: fallback.status,
          pickedUpBy: fallback.pickedUpBy,
          updatedAt: fallback.updatedAt,
        } : undefined,
      });

      const returnRequestCards = [];
      const cardsById = new Map();

      const returnOrderIds = new Set();
      console.log(`[BOARD-GET] ===== LOADING RETURNS FOR BOARD =====`);
      console.log(`[BOARD-GET] Total returns fetched: ${returnRequests.length}`);
      
      // Deduplicate returns by orderId, keeping only the most recent one for each
      const deduplicatedReturns = new Map();
      const returnStatusMap = {}; // Map of orderId -> Return's complianceBoardStatus
      
      returnRequests.forEach((ret) => {
        const key = ret.orderId;
        if (!key) return; // Skip if no orderId
        
        const existing = deduplicatedReturns.get(key);
        // Keep the newest Return by creationDate, or if creationDate is equal, by updatedAt
        const existingTime = existing 
          ? new Date(existing.updatedAt || existing.creationDate || 0).getTime()
          : 0;
        const currentTime = new Date(ret.updatedAt || ret.creationDate || 0).getTime();
        
        if (!existing || currentTime > existingTime) {
          deduplicatedReturns.set(key, ret);
          returnStatusMap[key] = ret.complianceBoardStatus || 'case_opened';
          console.log(`[BOARD-GET] [DEDUP] For orderId ${key}: keeping Return with status='${ret.complianceBoardStatus}' (updated: ${ret.updatedAt || ret.creationDate})`);
        }
      });

      const placeholderReturnOrderIds = [...new Set([
        ...assignedOrders.map((order) => order.orderId),
        ...returnConversations.map((meta) => meta.orderId),
      ].filter(Boolean).map(String))];

      const [inrCasesForReturnBoard, inrDisputesForReturnBoard] = placeholderReturnOrderIds.length
        ? await Promise.all([
            Case.find(
              { orderId: { $in: placeholderReturnOrderIds } },
              { orderId: 1, caseType: 1, _id: 0 }
            ).lean(),
            PaymentDispute.find(
              { orderId: { $in: placeholderReturnOrderIds } },
              { orderId: 1, _id: 0 }
            ).lean(),
          ])
        : [[], []];

      const inrOwnedOrderIds = new Set([
        ...inrCasesForReturnBoard
          .filter((item) => String(item?.caseType || 'INR').toUpperCase() === 'INR')
          .map((item) => String(item.orderId)),
        ...inrDisputesForReturnBoard
          .map((item) => String(item.orderId)),
      ]);

      if (inrOwnedOrderIds.size > 0) {
        console.log(`[BOARD-GET] Excluding ${inrOwnedOrderIds.size} return placeholders because INR now owns those orders: ${Array.from(inrOwnedOrderIds).join(', ')}`);
      }
      
      const uniqueReturnRequests = Array.from(deduplicatedReturns.values());
      console.log(`[BOARD-GET] After deduplication: ${uniqueReturnRequests.length} unique returns (was ${returnRequests.length})`);
      
      uniqueReturnRequests.forEach((ret) => {
        if (ret.orderId) returnOrderIds.add(ret.orderId);
        const order = orderByOrderId.get(ret.orderId);
        // Use the Return's complianceBoardStatus if it exists, otherwise default to 'case_opened'
        const status = ret.complianceBoardStatus || 'case_opened';
        console.log(`[BOARD-GET] Return ${ret.returnId || ret._id.toString().substring(0,8)}: status='${status}' (db_stored='${ret.complianceBoardStatus}'), orderId=${ret.orderId}`);
        const card = makeOrderCard(order, ret, status, 'return_request');
        returnRequestCards.push(card);
      });

      assignedOrders.forEach((order) => {
        if (returnOrderIds.has(order.orderId)) return;
        if (inrOwnedOrderIds.has(String(order.orderId || ''))) return;

        const status = order.complianceBoardStatus || 'case_not_opened';
        if (status === 'case_opened') return;

        returnOrderIds.add(order.orderId); // Track this orderId to prevent duplicates in returnConversations

        cardsById.set(String(order._id), {
          ...order,
          complianceBoardCategories: normalizeCategories(order),
          complianceBoardStatus: status,
          returnBoardSource: 'conversation', // Mark as conversation/assigned order from Order Communication
          conversationInfo: {
            category: 'Return', // Default category for assigned orders
            caseStatus: status,
            status: 'Open',
            pickedUpBy: order.pickedUpBy || null,
            updatedAt: order.updatedAt,
          }
        });
      });

      returnConversations.forEach((meta) => {
        if (meta.orderId && returnOrderIds.has(meta.orderId)) return;
        if (meta.orderId && inrOwnedOrderIds.has(String(meta.orderId))) return;
        const order = meta.orderId ? orderByOrderId.get(meta.orderId) : orderByItemId.get(meta.itemId);
        
        // Determine the status to use: prioritize Order's complianceBoardStatus if it's set to an action status
        // Otherwise, use 'case_opened' or 'case_not_opened' based on the ConversationMeta's caseStatus
        let status = 'case_not_opened';
        const actionStatuses = ['provide_return_label', 'return_follow_up', 'buyer_drop_off', 'item_delivered', 'partial_refund', 'full_refund', 'replacement'];
        if (order?.complianceBoardStatus && actionStatuses.includes(order.complianceBoardStatus)) {
          // Order has been moved to an action status, use that
          status = order.complianceBoardStatus;
          console.log(`[BOARD-GET] [CONVERSATION-STATUS] For orderId ${order.orderId}: using Order status '${status}' instead of 'case_not_opened'`);
        } else if (meta.caseStatus === 'Case Opened') {
          // ConversationMeta indicates case is opened
          status = 'case_opened';
        }
        
        const key = order?._id ? `order:${order._id}:conversation:${meta._id}` : `conversation:${meta._id}`;
        cardsById.set(key, makeOrderCard(order, meta, status, 'conversation'));
      });

      let returnBoardOrders = await enrichOrdersWithConversationMeta([
        ...returnRequestCards,
        ...Array.from(cardsById.values())
      ]);
      
      // Final deduplication by orderId to prevent showing same order twice
      // Keep the one with the most recent updatedAt/dateSold, prioritizing return_request source
      const orderDedupeMap = new Map();
      returnBoardOrders.forEach((order) => {
        const key = order.orderId || order.caseOrderId;
        if (!key) return;
        
        const existing = orderDedupeMap.get(key);
        if (!existing) {
          orderDedupeMap.set(key, order);
          return;
        }
        
        // Prioritize return_request over conversation
        if (order.returnBoardSource === 'return_request' && existing.returnBoardSource !== 'return_request') {
          orderDedupeMap.set(key, order);
          console.log(`[BOARD-GET] [FINAL-DEDUP] For orderId ${key}: replacing conversation source with return_request`);
          return;
        }
        
        // If same source type, keep the more recent one
        const existingTime = new Date(existing.updatedAt || existing.dateSold || 0).getTime();
        const currentTime = new Date(order.updatedAt || order.dateSold || 0).getTime();
        if (currentTime > existingTime) {
          orderDedupeMap.set(key, order);
          console.log(`[BOARD-GET] [FINAL-DEDUP] For orderId ${key}: replacing with more recent order (${new Date(currentTime)} > ${new Date(existingTime)})`);
        }
      });
      
      returnBoardOrders = Array.from(orderDedupeMap.values());
      
      if (dateFilter.dateSold) {
        returnBoardOrders = returnBoardOrders.filter((order) => {
          if (order.returnBoardSource === 'return_request') return true;
          if (!order.dateSold) return true;
          const sold = new Date(order.dateSold);
          if (dateFilter.dateSold.$gte && sold < dateFilter.dateSold.$gte) return false;
          if (dateFilter.dateSold.$lte && sold > dateFilter.dateSold.$lte) return false;
          return true;
        });
      }

      if (sellerObjectId) {
        returnBoardOrders = returnBoardOrders.filter((order) => String(order.seller?._id || order.seller) === String(sellerObjectId));
      }
      if (excludedSellerIds.length > 0) {
        returnBoardOrders = returnBoardOrders.filter((order) => !isExcludedSeller(order.seller));
      }
      if (excludeLowValueEnabled) {
        returnBoardOrders = returnBoardOrders.filter((order) => !isLowValueOrder(order));
      }
      if (orderIdRegex) {
        returnBoardOrders = returnBoardOrders.filter((order) => orderIdRegex.test(order.orderId || ''));
      }
      if (buyerNameRegex) {
        returnBoardOrders = returnBoardOrders.filter((order) => {
          const buyerName = order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username || '';
          return buyerNameRegex.test(buyerName);
        });
      }
      if (statusFilter) {
        returnBoardOrders = returnBoardOrders.filter((order) => (order.complianceBoardStatus || 'todo') === statusFilter);
      }

      // Sort the mixed Return board feed by the freshest activity so recently
      // dragged conversation items are visible on the first page as well.
      returnBoardOrders.sort((a, b) => {
        const getSortTime = (order) => {
          const rawValue = order.returnBoardSource === 'conversation'
            ? (order.conversationInfo?.updatedAt || order.dateSold)
            : (order.returnInfo?.responseDate || order.dateSold);
          const time = rawValue ? new Date(rawValue).getTime() : 0;
          return Number.isFinite(time) ? time : 0;
        };

        return getSortTime(b) - getSortTime(a);
      });

      const statusCounts = returnBoardOrders.reduce((acc, order) => {
        const status = order.complianceBoardStatus || 'todo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const isReturnLabelOverdue = (order) => {
        if (order.complianceBoardStatus === 'case_opened') {
          const startedAt = order.returnInfo?.createdDate || order.dateSold || null;
          return Boolean(startedAt && new Date(startedAt) <= overdueCutoff);
        }
        if (order.complianceBoardStatus === 'case_not_opened') {
          const startedAt = order.returnCaseNotOpenedAssignedAt || order.conversationInfo?.updatedAt || null;
          return Boolean(startedAt && new Date(startedAt) <= overdueCutoff);
        }
        return false;
      };
      const isPaymentStatusOverdue = (order) => {
        if (order.complianceBoardStatus !== 'item_delivered') return false;
        const startedAt = order.returnItemDeliveredAssignedAt || null;
        return Boolean(startedAt && new Date(startedAt) <= overdueCutoff);
      };
      const overdueCounts = returnBoardOrders.reduce((acc, order) => {
        if (isReturnLabelOverdue(order)) acc.return_label_overdue = (acc.return_label_overdue || 0) + 1;
        if (isPaymentStatusOverdue(order)) acc.payment_status_overdue = (acc.payment_status_overdue || 0) + 1;
        return acc;
      }, {});
      let detailOrders = returnBoardOrders;
      if (overdueAlert === 'return_label_overdue') {
        detailOrders = detailOrders.filter(isReturnLabelOverdue);
      } else if (overdueAlert === 'payment_status_overdue') {
        detailOrders = detailOrders.filter(isPaymentStatusOverdue);
      }
      const total = detailOrders.length;
      const pagedOrders = detailOrders.slice(skip, skip + limitNum);

      return res.json({
        orders: pagedOrders,
        statusCounts,
        overdueCounts,
        sourceCounts: {
          caseOpenedReturnRequests: uniqueReturnRequests.length
        },
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.max(1, Math.ceil(total / limitNum))
        }
      });
    }

    // Build the query
    // For Order Fulfillment & Order Communication: show ALL orders (assigned or unassigned)
    // For INR, Cancellation, Return/Refund: show ONLY orders with that specific category (no unassigned)
    // This prevents unassigned orders from filling up the results and pushing categorized orders beyond pagination limit
    let query;
    
    if (category === 'order_fulfillment' || category === 'order_communication') {
      // Order Fulfillment & Order Communication show all unassigned + all assigned orders
      query = {
        $or: [
          // Unassigned orders (new format - empty array)
          { complianceBoardCategories: [] },
          // Unassigned orders (old format - null)
          { complianceBoardCategory: null },
          // Assigned orders (new format - array with elements)
          { complianceBoardCategories: { $elemMatch: {} } },
          // Assigned orders (old format - has a value)
          { complianceBoardCategory: { $ne: null, $exists: true } }
        ],
        ...dateFilter
      };
    } else if (category === 'inr' || category === 'cancellation' || category === 'return_refund') {
      // INR, Cancellation, Return/Refund: ONLY show orders with that specific category
      // Don't include unassigned orders - they should stay in Order Communication
      query = {
        $and: [
          {
            $or: [
              // Has this category (new format)
              { complianceBoardCategories: category },
              // Has this category (old format)
              { complianceBoardCategory: category }
            ]
          },
          // Exclude orders that belong to other specialized categories
          {
            $and: [
              // If looking for return_refund, exclude cancellation and inr
              ...(category === 'return_refund' ? [
                { complianceBoardCategories: { $ne: 'cancellation' } },
                { complianceBoardCategories: { $ne: 'inr' } }
              ] : []),
              // If looking for cancellation, exclude return_refund and inr
              ...(category === 'cancellation' ? [
                { complianceBoardCategories: { $ne: 'return_refund' } },
                { complianceBoardCategories: { $ne: 'inr' } }
              ] : []),
              // If looking for inr, exclude return_refund and cancellation
              ...(category === 'inr' ? [
                { complianceBoardCategories: { $ne: 'return_refund' } },
                { complianceBoardCategories: { $ne: 'cancellation' } }
              ] : [])
            ]
          }
        ],
        ...dateFilter
      };
    } else {
      // Other categories: show unassigned + that specific category
      query = {
        $or: [
          // Unassigned (new format - empty array)
          { complianceBoardCategories: [] },
          // Unassigned (old format - null)
          { complianceBoardCategory: null },
          // Has this category (new format)
          { complianceBoardCategories: category },
          // Has this category (old format)
          { complianceBoardCategory: category }
        ],
        ...dateFilter
      };
    }

    // Exclude cancelled orders if requested (same logic as All Orders)
    if (excludeCancelled === 'true' || excludeCancelled === true) {
      query.$and = query.$and || [];
      query.$and.push(
        {
          $or: [
            { cancelState: { $exists: false } },
            { cancelState: null },
            { cancelState: { $nin: ['CANCELED', 'CANCELLED'] } }
          ]
        },
        {
          $or: [
            { 'cancelStatus.cancelState': { $exists: false } },
            { 'cancelStatus.cancelState': null },
            { 'cancelStatus.cancelState': { $nin: ['CANCELED', 'CANCELLED'] } }
          ]
        }
      );
    }

    if (sellerObjectId) {
      query.seller = sellerObjectId;
    }

    if (excludedSellerIds.length > 0) {
      query.$and = query.$and || [];
      query.$and.push({ seller: { $nin: excludedSellerIds } });
    }

    if (excludeLowValueEnabled) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { subtotalUSD: { $gte: 3 } },
          { subtotal: { $gte: 3 } }
        ]
      });
    }

    if (orderIdRegex) {
      query.orderId = orderIdRegex;
    }

    if (buyerNameRegex) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { 'buyer.buyerRegistrationAddress.fullName': buyerNameRegex },
          { 'buyer.username': buyerNameRegex }
        ]
      });
    }

    if (statusFilter) {
      query.$and = query.$and || [];
      if (statusFilter === 'todo') {
        query.$and.push({
          $or: [
            { complianceBoardStatus: { $exists: false } },
            { complianceBoardStatus: null },
            { complianceBoardStatus: 'todo' }
          ]
        });
      } else {
        query.$and.push({ complianceBoardStatus: statusFilter });
      }
    }

    // Count total for pagination and sidebar stats across the full filtered result.
    const timedStatusQuery = (baseQuery, status, assignedAtField) => ({
      $and: [
        baseQuery,
        { complianceBoardStatus: status },
        {
          $or: [
            { [assignedAtField]: { $lte: overdueCutoff } },
            {
              $and: [
                { [assignedAtField]: { $in: [null, ''] } },
                { updatedAt: { $lte: overdueCutoff } }
              ]
            }
          ]
        }
      ]
    });
    let detailQuery = query;
    if (overdueAlert === 'fulfillment_out_of_stock_overdue') {
      detailQuery = timedStatusQuery(query, 'out_of_stock', 'outOfStockAssignedAt');
    } else if (overdueAlert === 'fulfillment_cancellation_overdue') {
      detailQuery = timedStatusQuery(query, 'cancellation', 'cancellationAssignedAt');
    } else if (overdueAlert === 'fulfillment_address_issue_overdue') {
      detailQuery = timedStatusQuery(query, 'address_issue', 'addressIssueAssignedAt');
    }

    // For cancellation board, fetch counts from BOTH Order and Cancellation collections
    // to ensure stats accurately reflect all displayed items
    const isCancellationBoard = category === 'cancellation';
    
    let cancellationStatusCountRows = [];
    let cancellationTotal = 0;
    
    if (isCancellationBoard) {
      // Build cancellation collection query with same date filters
      const cancellationQuery = {
        ...dateFilter
      };
      
      if (sellerObjectId) {
        cancellationQuery.seller = sellerObjectId;
      } else if (excludedSellerIds.length > 0) {
        // Note: Cancellation model doesn't have seller field, skip this filter for cancellations
      }
      
      if (orderIdRegex) {
        cancellationQuery.$or = cancellationQuery.$or || [];
        cancellationQuery.$or.push(
          { orderId: orderIdRegex },
          { legacyOrderId: orderIdRegex },
          { cancelId: orderIdRegex }
        );
      }
      
      if (buyerNameRegex) {
        cancellationQuery.$or = cancellationQuery.$or || [];
        cancellationQuery.$or.push(
          { buyerName: buyerNameRegex },
          { buyerUsername: buyerNameRegex }
        );
      }
      
      // Fetch cancellation status counts
      const [cancellationCount, cancellationStatusRows] = await Promise.all([
        Cancellation.countDocuments(cancellationQuery),
        Cancellation.aggregate([
          { $match: cancellationQuery },
          {
            $group: {
              _id: { $ifNull: ['$complianceBoardStatus', 'cancellation_request'] },
              count: { $sum: 1 }
            }
          }
        ])
      ]);
      
      cancellationTotal = cancellationCount;
      cancellationStatusCountRows = cancellationStatusRows || [];
    }

    const [
      total,
      statusCountRows,
      overdueOutOfStockCount,
      overdueCancellationCount,
      overdueAddressIssueCount
    ] = await Promise.all([
      isCancellationBoard 
        ? Promise.resolve(0)  // Don't count Order collection for cancellation board
        : Order.countDocuments(detailQuery),
      Order.aggregate([
        { $match: detailQuery },
        {
          $group: {
            _id: { $ifNull: ['$complianceBoardStatus', 'todo'] },
            count: { $sum: 1 }
          }
        }
      ]),
      Order.countDocuments(timedStatusQuery(query, 'out_of_stock', 'outOfStockAssignedAt')),
      Order.countDocuments(timedStatusQuery(query, 'cancellation', 'cancellationAssignedAt')),
      Order.countDocuments(timedStatusQuery(query, 'address_issue', 'addressIssueAssignedAt'))
    ]);
    
    // Merge status counts from Order and Cancellation collections
    const statusCounts = {};
    
    // Add Order status counts
    statusCountRows.forEach((row) => {
      const status = row._id || 'todo';
      statusCounts[status] = (statusCounts[status] || 0) + row.count;
    });
    
    // Add Cancellation status counts (overwrite/merge for cancellation board)
    if (isCancellationBoard) {
      cancellationStatusCountRows.forEach((row) => {
        const status = row._id || 'cancellation_request';
        statusCounts[status] = (statusCounts[status] || 0) + row.count;
      });
    }
    
    // For cancellation board, use combined total
    const combinedTotal = isCancellationBoard 
      ? (total + cancellationTotal)
      : total;
    const overdueCounts = {
      fulfillment_out_of_stock_overdue: overdueOutOfStockCount,
      fulfillment_cancellation_overdue: overdueCancellationCount,
      fulfillment_address_issue_overdue: overdueAddressIssueCount
    };

    // Fetch orders with pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 500));
    const skip = (pageNum - 1) * limitNum;

    let orders = await Order.find(detailQuery)
      .select('orderId dateSold buyer subtotal subtotalUSD orderFulfillmentStatus complianceBoardStatus complianceBoardCategory complianceBoardCategories complianceBoardSource outOfStockAssignedAt cancellationAssignedAt addressIssueAssignedAt returnCaseNotOpenedAssignedAt returnItemDeliveredAssignedAt cancellationCaseNotOpenedAssignedAt inrCaseNotOpenedAssignedAt updatedAt purchaseMarketplaceId remark seller itemNumber lineItems productName trackingNumber manualTrackingNumber cancelState amazonAccount arrivingDate beforeTax estimatedTax azOrderId')
      .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
      .sort({ dateSold: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // For cancellation board, also fetch Cancellation records and merge with Order records
    if (isCancellationBoard) {
      const cancellationQuery = {
        ...dateFilter
      };
      
      if (sellerObjectId) {
        cancellationQuery.seller = sellerObjectId;
      }
      
      if (orderIdRegex) {
        cancellationQuery.$or = cancellationQuery.$or || [];
        cancellationQuery.$or.push(
          { orderId: orderIdRegex },
          { legacyOrderId: orderIdRegex },
          { cancelId: orderIdRegex }
        );
      }
      
      if (buyerNameRegex) {
        cancellationQuery.$or = cancellationQuery.$or || [];
        cancellationQuery.$or.push(
          { buyerUsername: buyerNameRegex }
        );
      }

      // Apply status filter to cancellation records
      // Map frontend status names to Cancellation model's enum values
      if (statusFilter) {
        const statusMap = {
          'case_not_opened': 'cancellation_request',  // Maps frontend status to Cancellation model status
          'accepted': 'accepted',
          'declined': 'declined'
        };
        const cancellationStatus = statusMap[statusFilter] || statusFilter;
        cancellationQuery.complianceBoardStatus = cancellationStatus;
      }

      // Fetch cancellation records
      let cancellations = await Cancellation.find(cancellationQuery)
        .select('cancelId orderId legacyOrderId cancelState cancelStatus cancelReason buyerUsername complianceBoardStatus dateSold remark seller itemId itemTitle updatedAt')
        .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
        .sort({ dateSold: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Enrich cancellations with related Order data
      const ordersByOrderId = new Map();
      orders.forEach(order => {
        ordersByOrderId.set(order.orderId, order);
      });

      // Map Cancellation model's status to frontend status names
      const cancellationStatusToFrontend = (status) => {
        const map = {
          'cancellation_request': 'case_not_opened',
          'accepted': 'accepted',
          'declined': 'declined'
        };
        return map[status] || status;
      };

      const enrichedCancellations = cancellations.map(cancellation => {
        const relatedOrder = ordersByOrderId.get(cancellation.orderId);
        return {
          ...cancellation,
          _id: cancellation._id || `cancel:${cancellation.cancelId}`,
          orderId: cancellation.orderId || cancellation.legacyOrderId,
          dateSold: cancellation.dateSold,
          buyer: relatedOrder?.buyer || { username: cancellation.buyerUsername },
          subtotal: relatedOrder?.subtotal,
          subtotalUSD: relatedOrder?.subtotalUSD,
          productName: relatedOrder?.productName || cancellation.itemTitle || 'Item',
          amazonAccount: relatedOrder?.amazonAccount || '',
          azOrderId: relatedOrder?.azOrderId || '',
          complianceBoardStatus: cancellationStatusToFrontend(cancellation.complianceBoardStatus || 'cancellation_request'),
          complianceBoardCategory: 'cancellation',
          complianceBoardCategories: ['cancellation'],
          complianceBoardSource: 'cancellation_collection'
        };
      });

      // Merge orders and cancellations, maintaining order by dateSold
      const orderCount = orders.length;
      const cancellationCount = enrichedCancellations.length;
      orders = [...orders, ...enrichedCancellations].sort((a, b) => {
        const aDate = new Date(a.dateSold || 0).getTime();
        const bDate = new Date(b.dateSold || 0).getTime();
        return bDate - aDate;
      });

      console.log(`[BOARD-CANCELLATION] Fetched ${orderCount} Order records + ${cancellationCount} Cancellation records = ${orders.length} total for this page`);
    }

    // Deduplicate orders by orderId - keep the one with the latest updatedAt
    // This prevents duplicate orders from appearing in multiple columns
    const deduped = {};
    let duplicateCount = 0;
    orders.forEach(order => {
      const key = order.orderId;
      if (!deduped[key]) {
        deduped[key] = order;
      } else {
        duplicateCount++;
        // Keep the one with latest updatedAt
        const existing = deduped[key];
        const existingTime = new Date(existing.updatedAt || existing.dateSold || 0).getTime();
        const newTime = new Date(order.updatedAt || order.dateSold || 0).getTime();
        if (newTime > existingTime) {
          console.warn(`[DEDUPE] Found duplicate for orderId ${key}: replacing old (_id: ${existing._id}, status: ${existing.complianceBoardStatus}) with new (_id: ${order._id}, status: ${order.complianceBoardStatus})`);
          deduped[key] = order;
        } else {
          console.warn(`[DEDUPE] Found duplicate for orderId ${key}: keeping old (_id: ${existing._id}, status: ${existing.complianceBoardStatus}), discarding new (_id: ${order._id}, status: ${order.complianceBoardStatus})`);
        }
      }
    });
    if (duplicateCount > 0) {
      console.warn(`[DEDUPE] Found ${duplicateCount} duplicate orders, deduped to ${Object.keys(deduped).length} unique orders`);
    }
    orders = Object.values(deduped);

    // Log order statuses for debugging
    if (searchOrderId && orders.length > 0) {
      console.log(`[BOARD-FETCH] Fetched ${orders.length} orders for search "${searchOrderId}":`);
      orders.forEach(order => {
        console.log(`  - orderId: ${order.orderId}, _id: ${order._id}, status: ${order.complianceBoardStatus || 'todo'}, updatedAt: ${order.updatedAt}`);
      });
    }

    // Update orders without any category (both new and old formats) to add the current category
    // Only auto-assign for Order Fulfillment and Order Communication boards
    // INR, Cancellation, Return boards don't auto-assign - orders must be explicitly moved there
    const shouldAutoAssign = (category === 'order_fulfillment' || category === 'order_communication');
    
    if (shouldAutoAssign) {
      const orderIdsToUpdate = orders
        .filter(o => {
          // New format: empty array or doesn't exist
          if (!o.complianceBoardCategories || o.complianceBoardCategories.length === 0) {
            return true;
          }
          // Old format: null or doesn't exist
          if (!o.complianceBoardCategory) {
            return true;
          }
          return false;
        })
        .map(o => o._id);

      if (orderIdsToUpdate.length > 0) {
        await Order.updateMany(
          { _id: { $in: orderIdsToUpdate } },
          { $push: { complianceBoardCategories: category } }
        );
      }
    }

    // Log the API call
    const BOARD_DEBUG = req.query.category === 'order_fulfillment' && (req.query.startDate === '2026-08-02');
    if (BOARD_DEBUG) {
      console.log(`[BOARD-ENDPOINT] Called with startDate: ${req.query.startDate}, endDate: ${req.query.endDate}`);
    }

    // Return orders with updated categories (convert old format to new for consistency)
    // Create a map of original _ids before enrichment
    const orderIdMap = new Map(orders.map(o => [String(o._id), o._id]));
    
    const updatedOrders = (await enrichOrdersWithConversationMeta(orders.map(o => {
      let categories = [];
      if (o.complianceBoardCategories && Array.isArray(o.complianceBoardCategories) && o.complianceBoardCategories.length > 0) {
        // Deduplicate categories array (remove duplicates that may have accumulated)
        categories = [...new Set(o.complianceBoardCategories)];
      } else if (o.complianceBoardCategory) {
        categories = [o.complianceBoardCategory];
      } else if (shouldAutoAssign) {
        categories = [category]; // Newly assigned (only for Order Fulfillment/Communication)
      }
      return {
        ...o,
        orderObjectId: o._id,  // Include original MongoDB _id for frontend drag-drop updates
        complianceBoardCategories: categories,
        complianceBoardStatus: o.complianceBoardStatus || 'todo'
      };
    }))).map(o => ({
      ...o,
      // Ensure orderObjectId is always present (in case enrichment stripped it)
      orderObjectId: o.orderObjectId || o._id || (o.orderId ? orderIdMap.get(o.orderId) : undefined)
    }));

    // Log for debugging
    if (BOARD_DEBUG) {
      const ordersByStatus = {};
      updatedOrders.forEach(o => {
        const status = o.complianceBoardStatus || 'todo';
        ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
      });
      console.log(`[BOARD-ENDPOINT-DEBUG] Returned ${updatedOrders.length} orders with status distribution:`, ordersByStatus);
      updatedOrders.slice(0, 5).forEach(o => {
        console.log(`  - orderId: ${o.orderId}, status: ${o.complianceBoardStatus || 'todo'}`);
      });
    }

    res.json({
      orders: updatedOrders,
      statusCounts,
      overdueCounts,
      pagination: {
        total: isCancellationBoard ? combinedTotal : total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching compliance board orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch compliance board orders' });
  }
});

const COMPLIANCE_MONITORING_BOARDS = [
  {
    id: 'order_fulfillment',
    label: 'Order Fulfillment',
    statuses: ['todo', 'out_of_stock', 'cancellation', 'address_issue', 'not_fulfilled', 'fulfilled', 'buyer_confirmation'],
    includeAllOrders: true
  },
  {
    id: 'cancellation',
    label: 'Cancellation',
    statuses: ['cancellation_request', 'case_not_opened', 'accepted', 'declined']
  },
  {
    id: 'inr',
    label: 'INR',
    statuses: ['inr_case_opened', 'case_not_opened', 'inr_follow_up', 'inr_tracking_id_upload', 'inr_case_open_ebay_step_in', 'inr_fully_refunded', 'inr_partial_refund', 'inr_not_refunded_resolved']
  },
  {
    id: 'return_refund',
    label: 'Return / Refund / Replace',
    statuses: ['case_opened', 'case_not_opened', 'provide_return_label', 'buyer_drop_off', 'item_delivered', 'partial_refund', 'full_refund', 'replacement']
  }
];

const COMPLIANCE_STATUS_LABELS = {
  todo: 'To Do',
  out_of_stock: 'Out of Stock',
  cancellation: 'Cancellation',
  address_issue: 'Address Issue',
  not_fulfilled: 'Not Fulfilled',
  fulfilled: 'Fulfilled',
  buyer_confirmation: 'Buyer Confirmation',
  cancellation_request: 'Cancellation Request',
  accepted: 'Accepted',
  declined: 'Declined',
  case_opened: 'Case Opened',
  case_not_opened: 'Case Not Opened',
  inr_case_opened: 'INR Case Opened',
  inr_follow_up: 'INR Follow Up',
  inr_tracking_id_upload: 'Tracking ID Upload',
  inr_case_open_ebay_step_in: 'Case Open Ebay Step In',
  inr_fully_refunded: 'Fully Refunded',
  inr_partial_refund: 'Partial Refund',
  inr_not_refunded_resolved: 'Not Refunded / Resolved',
  provide_return_label: 'Provide Return Label',
  buyer_drop_off: 'Buyer Drop Off',
  item_delivered: 'Item Delivered',
  partial_refund: 'Partial Refund',
  full_refund: 'Full Refund',
  replacement: 'Replacement'
};

function getComplianceMonitoringDateRange({ dateMode, dateSingle, dateFrom, dateTo }) {
  if (dateMode === 'single' && dateSingle) {
    return { startDate: dateSingle, endDate: dateSingle };
  }

  if (dateMode === 'range') {
    return {
      startDate: dateFrom || null,
      endDate: dateTo || null
    };
  }

  return { startDate: null, endDate: null };
}

function buildDateFieldMatch(fieldName, startDate, endDate) {
  if (!startDate && !endDate) return null;

  const range = {};
  if (startDate) range.$gte = getPTDayBoundsUTC(startDate).start;
  if (endDate) range.$lte = getPTDayBoundsUTC(endDate).end;
  return { [fieldName]: range };
}

function buildComplianceMonitoringOrderMatch({
  boardId,
  includeAllOrders,
  sellerObjectId,
  excludedSellerIds,
  excludeLowValueEnabled,
  marketplace,
  startDate,
  endDate
}) {
  const match = {};

  if (!includeAllOrders) {
    match.$or = [
      { complianceBoardCategories: boardId },
      { complianceBoardCategory: boardId }
    ];
  }

  match.$and = match.$and || [];
  match.$and.push(
    {
      $or: [
        { cancelState: { $exists: false } },
        { cancelState: null },
        { cancelState: { $nin: FINAL_CANCELLED_STATES } }
      ]
    },
    {
      $or: [
        { 'cancelStatus.cancelState': { $exists: false } },
        { 'cancelStatus.cancelState': null },
        { 'cancelStatus.cancelState': { $nin: FINAL_CANCELLED_STATES } }
      ]
    }
  );

  if (sellerObjectId) {
    match.seller = sellerObjectId;
  }

  if (excludedSellerIds.length > 0) {
    match.$and.push({ seller: { $nin: excludedSellerIds } });
  }

  if (excludeLowValueEnabled) {
    match.$and.push({
      $or: [
        { subtotalUSD: { $gte: 3 } },
        { subtotal: { $gte: 3 } }
      ]
    });
  }

  applyOrderMarketplaceFilter(match, marketplace);

  const dateMatch = buildDateFieldMatch('dateSold', startDate, endDate);
  if (dateMatch) {
    Object.assign(match, dateMatch);
  }

  return match;
}

/**
 * GET /orders/compliance-monitoring/overview
 * Cross-board compliance overview for monitoring dashboards.
 */
router.get('/compliance-monitoring/overview', requireAuth, requirePageAccess('ComplianceMonitoring'), async (req, res) => {
  try {
    const {
      sellerId = '',
      marketplace = '',
      dateMode = 'none',
      dateSingle = '',
      dateFrom = '',
      dateTo = '',
      excludeClient = 'true',
      excludeLowValue = 'true'
    } = req.query;

    const sellerObjectId = sellerId && mongoose.Types.ObjectId.isValid(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : null;
    const excludeClientEnabled = excludeClient === 'true' || excludeClient === true;
    const excludeLowValueEnabled = excludeLowValue === 'true' || excludeLowValue === true;
    const excludedSellerIds = excludeClientEnabled ? await getExcludedClientSellerIds() : [];
    const { startDate, endDate } = getComplianceMonitoringDateRange({ dateMode, dateSingle, dateFrom, dateTo });

    const orderBoardResults = await Promise.all(
      COMPLIANCE_MONITORING_BOARDS.map(async (board) => {
        const match = buildComplianceMonitoringOrderMatch({
          boardId: board.id,
          includeAllOrders: board.includeAllOrders,
          sellerObjectId,
          excludedSellerIds,
          excludeLowValueEnabled,
          marketplace,
          startDate,
          endDate
        });

        const rows = await Order.aggregate([
          { $match: match },
          {
            $group: {
              _id: { $ifNull: ['$complianceBoardStatus', 'todo'] },
              count: { $sum: 1 }
            }
          }
        ]);

        const counts = rows.reduce((acc, row) => {
          const status = row._id || 'todo';
          acc[status] = row.count || 0;
          return acc;
        }, {});

        const items = board.statuses.map((status) => ({
          id: status,
          label: COMPLIANCE_STATUS_LABELS[status] || status,
          count: counts[status] || 0
        }));

        return {
          id: board.id,
          label: board.label,
          total: items.reduce((sum, item) => sum + item.count, 0),
          items
        };
      })
    );

    const conversationMatch = {
      category: { $in: ['On Hold', 'INR', 'Cancellation', 'Return', 'Refund', 'Replace', 'Out of Stock', 'Issue with Product', 'Inquiry'] }
    };
    if (sellerObjectId) {
      conversationMatch.seller = sellerObjectId;
    }
    if (excludedSellerIds.length > 0) {
      conversationMatch.seller = conversationMatch.seller
        ? conversationMatch.seller
        : { $nin: excludedSellerIds };
    }

    const conversationPipeline = [
      { $match: conversationMatch },
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'orderInfo'
        }
      }
    ];

    if (marketplace) {
      const marketplaceMatch = {};
      applyOrderMarketplaceFilter(marketplaceMatch, marketplace);
      if (marketplaceMatch.purchaseMarketplaceId) {
        conversationPipeline.push({
          $match: {
            'orderInfo.purchaseMarketplaceId': marketplaceMatch.purchaseMarketplaceId
          }
        });
      }
    }

    const orderDateMatch = buildDateFieldMatch('orderInfo.dateSold', startDate, endDate);
    const conversationCreatedDateMatch = buildDateFieldMatch('createdAt', startDate, endDate);
    if (orderDateMatch && conversationCreatedDateMatch) {
      conversationPipeline.push({
        $match: {
          $or: [
            orderDateMatch,
            {
              orderInfo: { $size: 0 },
              ...conversationCreatedDateMatch
            }
          ]
        }
      });
    }

    if (excludeLowValueEnabled) {
      conversationPipeline.push({
        $match: {
          $or: [
            { orderId: { $in: [null, ''] } },
            { orderInfo: { $size: 0 } },
            { 'orderInfo.subtotalUSD': { $gte: 3 } },
            { 'orderInfo.subtotal': { $gte: 3 } }
          ]
        }
      });
    }

    conversationPipeline.push({
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    });

    const conversationRows = await ConversationMeta.aggregate(conversationPipeline);
    const conversationCounts = conversationRows.reduce((acc, row) => {
      const category = row._id || 'Unassigned';
      acc[category] = row.count || 0;
      return acc;
    }, {});
    const conversationItems = [
      { id: 'On Hold', label: 'On Hold', count: conversationCounts['On Hold'] || 0 },
      { id: 'INR', label: 'INR', count: conversationCounts.INR || 0 },
      { id: 'Cancellation', label: 'Cancellation', count: conversationCounts.Cancellation || 0 },
      {
        id: 'Return',
        label: 'Return / Refund / Replace',
        count: (conversationCounts.Return || 0) + (conversationCounts.Refund || 0) + (conversationCounts.Replace || 0)
      },
      { id: 'Out of Stock', label: 'Out of Stock', count: conversationCounts['Out of Stock'] || 0 },
      { id: 'Issue with Product', label: 'Issue with Product', count: conversationCounts['Issue with Product'] || 0 },
      { id: 'Inquiry', label: 'Inquiry', count: conversationCounts.Inquiry || 0 }
    ];

    const orderTotal = orderBoardResults.reduce((sum, board) => sum + board.total, 0);
    const communicationTotal = conversationItems.reduce((sum, item) => sum + item.count, 0);

    res.json({
      generatedAt: new Date().toISOString(),
      filters: {
        sellerId: sellerId || null,
        marketplace: marketplace || null,
        dateMode,
        dateSingle: dateSingle || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        excludeClient: excludeClientEnabled,
        excludeLowValue: excludeLowValueEnabled
      },
      totals: {
        allTracked: orderTotal + communicationTotal,
        orderBoards: orderTotal,
        orderCommunication: communicationTotal
      },
      boards: [
        ...orderBoardResults,
        {
          id: 'order_communication',
          label: 'Order Communication',
          total: communicationTotal,
          items: conversationItems
        }
      ]
    });
  } catch (error) {
    console.error('Error fetching compliance monitoring overview:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch compliance monitoring overview' });
  }
});

/**
 * PATCH /orders/:orderId/compliance-status
 * Update the compliance board status of an order
 * Body: { complianceBoardStatus, complianceBoardCategory, complianceBoardSource }
 */
router.patch('/:orderId/compliance-status', requireAuth, requirePageAccess('ComplianceBoard'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { complianceBoardStatus, complianceBoardCategory, complianceBoardSource, clearCategory } = req.body;

    console.log(`\n[PATCH-COMPLIANCE] ===== START COMPLIANCE STATUS UPDATE =====`);
    console.log(`[PATCH-COMPLIANCE] orderId: ${orderId}`);
    console.log(`[PATCH-COMPLIANCE] complianceBoardStatus: ${complianceBoardStatus}`);
    console.log(`[PATCH-COMPLIANCE] complianceBoardCategory: ${complianceBoardCategory}`);

    if (!complianceBoardStatus) {
      console.error(`[PATCH-COMPLIANCE] ERROR: complianceBoardStatus is required`);
      return res.status(400).json({ error: 'complianceBoardStatus is required' });
    }

    const validStatuses = [
      'todo', 'out_of_stock', 'cancellation', 'address_issue', 'late_delivery', 'not_fulfilled', 'fulfilled', 'buyer_confirmation',
      // Return/Refund statuses
      'case_opened', 'case_not_opened', 'provide_return_label', 'return_follow_up', 'buyer_drop_off', 'item_delivered', 'partial_refund', 'full_refund', 'replacement',
      // Cancellation statuses
      'cancellation_request', 'accepted', 'declined',
      // INR statuses
      'inr_case_opened', 'inr_follow_up', 'inr_tracking_id_upload', 'inr_case_open_ebay_step_in',
      'inr_fully_refunded', 'inr_partial_refund', 'inr_not_refunded_resolved', 'inr_case_closed'
    ];
    if (!validStatuses.includes(complianceBoardStatus)) {
      console.error(`[PATCH-COMPLIANCE] ERROR: Invalid status: ${complianceBoardStatus}`);
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Check if this is a Conversation document (ID starts with 'conversation:')
    if (String(orderId).startsWith('conversation:')) {
      console.log(`[PATCH-COMPLIANCE] [DETECTED] 'conversation:' prefix format`);
      
      // Extract metaId from 'conversation:metaId' format
      const metaId = String(orderId).replace(/^conversation:/, '');
      console.log(`[PATCH-COMPLIANCE] [EXTRACTED] metaId: ${metaId}`);
      
      // Try to match MongoDB _id
      if (!mongoose.Types.ObjectId.isValid(metaId)) {
        console.error(`[PATCH-COMPLIANCE] ERROR: Invalid conversation meta ID format: ${metaId}`);
        return res.status(400).json({ error: 'Invalid conversation meta ID format' });
      }
      
      // Find the ConversationMeta document to get the orderId
      const ConversationMeta = mongoose.model('ConversationMeta');
      const conversationDoc = await ConversationMeta.findById(metaId);

      if (!conversationDoc) {
        console.warn(`[PATCH-COMPLIANCE] [ERROR] ConversationMeta not found with ID: ${metaId}`);
        return res.status(404).json({ error: 'Conversation not found' });
      }

      console.log(`[PATCH-COMPLIANCE] [FOUND-CONVERSATION] metaId: ${conversationDoc._id}, orderId: ${conversationDoc.orderId}, current caseStatus: ${conversationDoc.caseStatus}`);

      // Update the associated Order by orderId with the new complianceBoardStatus
      if (conversationDoc.orderId) {
        console.log(`[PATCH-COMPLIANCE] [UPDATING-ORDER] Updating Order: ${conversationDoc.orderId} with status: ${complianceBoardStatus}`);
        const orderUpdate = await Order.findOneAndUpdate(
          { orderId: conversationDoc.orderId },
          { 
            $set: { complianceBoardStatus },
            // Also ensure this order is categorized as return_refund
            $addToSet: { complianceBoardCategories: 'return_refund' }
          },
          { new: true }
        );
        
        if (orderUpdate) {
          console.log(`[PATCH-COMPLIANCE] [SUCCESS] Updated Order ${conversationDoc.orderId} to status ${complianceBoardStatus}`);
          
          // Update ConversationMeta caseStatus to 'Case Opened' if moving to any action status
          // Statuses like provide_return_label, buyer_drop_off, etc. indicate case is being worked on
          const actionStatuses = ['provide_return_label', 'return_follow_up', 'buyer_drop_off', 'item_delivered', 'partial_refund', 'full_refund', 'replacement'];
          if (actionStatuses.includes(complianceBoardStatus)) {
            const conversationUpdate = await ConversationMeta.findByIdAndUpdate(
              metaId,
              { $set: { caseStatus: 'Case Opened' } },
              { new: true }
            );
            console.log(`[PATCH-COMPLIANCE] [SYNC-CONVERSATION] Updated ConversationMeta caseStatus to 'Case Opened' for action status: ${complianceBoardStatus}`);
          }
          
          return res.json({ success: true, order: orderUpdate });
        } else {
          console.error(`[PATCH-COMPLIANCE] [WARN] Order not found with orderId: ${conversationDoc.orderId}`);
          // Still return success for the conversation, as the Order might not exist yet
          return res.json({ success: true, conversation: conversationDoc, message: 'Conversation updated but Order not found' });
        }
      } else {
        console.error(`[PATCH-COMPLIANCE] [ERROR] ConversationMeta has no orderId, cannot update Order`);
        return res.status(400).json({ error: 'Conversation has no associated order' });
      }
    }

    // Check if this is a Return document (ID starts with 'return:')
    if (String(orderId).startsWith('return:')) {
      console.log(`[PATCH-COMPLIANCE] [DETECTED] 'return:' prefix format`);
      const Return = mongoose.model('Return');
      
      // Extract returnId from 'return:returnId' format
      const returnId = String(orderId).replace(/^return:/, '');
      console.log(`[PATCH-COMPLIANCE] [EXTRACTED] returnId: ${returnId}`);
      
      // Try to match both MongoDB _id and eBay returnId
      const query = mongoose.Types.ObjectId.isValid(returnId)
        ? { $or: [{ _id: returnId }, { returnId: returnId }] }
        : { returnId: returnId };
      
      console.log(`[PATCH-COMPLIANCE] [QUERY] Return query:`, JSON.stringify(query));
      
      let returnDoc = await Return.findOneAndUpdate(
        query,
        { $set: { complianceBoardStatus } },
        { new: true }
      );

      // If not found by returnId/ObjectId, try searching by orderId from the prefix
      if (!returnDoc) {
        console.warn(`[PATCH-COMPLIANCE] [FALLBACK] Return not found by returnId: ${returnId}, trying by other methods...`);
        
        // Try to find any Return with this returnId to verify it exists
        const existingReturn = await Return.findOne({ returnId: returnId }).lean();
        if (existingReturn) {
          console.log(`[PATCH-COMPLIANCE] [FOUND] Return exists but update failed: ${returnId}, _id: ${existingReturn._id}`);
        } else {
          console.warn(`[PATCH-COMPLIANCE] [NOT-FOUND] Return does not exist with returnId: ${returnId}`);
          
          // List all Returns to help debug
          const returnCount = await Return.countDocuments({});
          const sampleReturns = await Return.find({}).select('returnId orderId creationDate').limit(3).lean();
          console.warn(`[PATCH-COMPLIANCE] [DEBUG] Total Returns in DB: ${returnCount}`);
          console.warn(`[PATCH-COMPLIANCE] [DEBUG] Sample Returns:`, sampleReturns.map(r => ({ 
            returnId: r.returnId, 
            orderId: r.orderId, 
            createdDate: r.creationDate 
          })));
        }
        
        return res.status(404).json({ 
          error: 'Return not found', 
          details: {
            searchedReturnId: returnId,
            searchFormat: 'return:...'
          }
        });
      }

      console.log(`[PATCH-COMPLIANCE] [SUCCESS] Updated Return, new complianceBoardStatus: ${returnDoc.complianceBoardStatus}`);
      console.log(`[PATCH-COMPLIANCE] [VERIFY] returnId: ${returnDoc.returnId}, _id: ${returnDoc._id}, orderId: ${returnDoc.orderId}`);
      return res.json({ success: true, return: returnDoc });
    }

    // Check if this is a Cancellation document (ID starts with 'cancelled:')
    if (String(orderId).startsWith('cancelled:')) {
      console.log(`[PATCH-COMPLIANCE] [DETECTED] 'cancelled:' prefix format`);
      
      // Extract cancelId from 'cancelled:cancelId' format
      const cancelId = String(orderId).replace(/^cancelled:/, '');
      console.log(`[PATCH-COMPLIANCE] [EXTRACTED] cancelId: ${cancelId}`);
      
      // Try to match both MongoDB _id and eBay cancelId
      const query = mongoose.Types.ObjectId.isValid(cancelId)
        ? { $or: [{ _id: cancelId }, { cancelId: cancelId }] }
        : { cancelId: cancelId };
      
      console.log(`[PATCH-COMPLIANCE] [QUERY] Cancellation query:`, JSON.stringify(query));
      
      // For Cancellation, also fetch current document to check AssignedAt
      const currentCancellation = await Cancellation.findOne(query).select('cancellationCaseNotOpenedAssignedAt');
      
      const cancellationSetObj = { complianceBoardStatus };
      
      // Add "first changed" date logic for Cancellation
      if (complianceBoardStatus === 'case_not_opened' && complianceBoardCategory === 'cancellation') {
        if (!currentCancellation?.cancellationCaseNotOpenedAssignedAt) {
          cancellationSetObj.cancellationCaseNotOpenedAssignedAt = new Date().toISOString();
        }
      } else if (complianceBoardStatus !== 'case_not_opened' && complianceBoardCategory === 'cancellation') {
        cancellationSetObj.cancellationCaseNotOpenedAssignedAt = null;
      }
      
      const cancellationDoc = await Cancellation.findOneAndUpdate(
        query,
        { $set: cancellationSetObj },
        { new: true }
      );

      if (!cancellationDoc) {
        console.warn(`[PATCH-COMPLIANCE] [ERROR] Cancellation not found with ID: ${cancelId}`);
        return res.status(404).json({ error: 'Cancellation not found' });
      }

      console.log(`[PATCH-COMPLIANCE] [SUCCESS] Updated Cancellation, new complianceBoardStatus: ${cancellationDoc.complianceBoardStatus}`);
      console.log(`[PATCH-COMPLIANCE] [VERIFY] cancelId: ${cancellationDoc.cancelId}, _id: ${cancellationDoc._id}, orderId: ${cancellationDoc.orderId}`);
      
      // Also sync to associated Order if it has the cancellation category
      if (cancellationDoc.orderId) {
        console.log(`[PATCH-COMPLIANCE] [SYNC] Updating associated Order: ${cancellationDoc.orderId}`);
        const orderUpdate = await Order.findOneAndUpdate(
          { orderId: cancellationDoc.orderId },
          { $set: { complianceBoardStatus } },
          { new: true }
        );
        if (orderUpdate) {
          console.log(`[PATCH-COMPLIANCE] [SYNC-SUCCESS] Updated Order ${cancellationDoc.orderId} to status ${complianceBoardStatus}`);
        } else {
          console.log(`[PATCH-COMPLIANCE] [SYNC-WARN] Order ${cancellationDoc.orderId} not found for sync update`);
        }
      }
      
      return res.json({ success: true, cancellation: cancellationDoc });
    }

    // Check if this is a Dispute document (ID starts with 'dispute:')
    if (String(orderId).startsWith('dispute:')) {
      console.log(`[PATCH-COMPLIANCE] [DETECTED] 'dispute:' prefix format`);
      
      // Extract disputeId from 'dispute:disputeId' format
      const disputeId = String(orderId).replace(/^dispute:/, '');
      console.log(`[PATCH-COMPLIANCE] [EXTRACTED] disputeId: ${disputeId}`);
      
      // Try to match both MongoDB _id and PaymentDispute ID
      const query = mongoose.Types.ObjectId.isValid(disputeId)
        ? { $or: [{ _id: disputeId }, { paymentDisputeId: disputeId }] }
        : { paymentDisputeId: disputeId };
      
      console.log(`[PATCH-COMPLIANCE] [QUERY] Dispute query:`, JSON.stringify(query));
      
      const disputeDoc = await PaymentDispute.findOneAndUpdate(
        query,
        { $set: { complianceBoardStatus } },
        { new: true }
      );

      if (!disputeDoc) {
        console.warn(`[PATCH-COMPLIANCE] [ERROR] Dispute not found with ID: ${disputeId}`);
        return res.status(404).json({ error: 'Payment dispute not found' });
      }

      console.log(`[PATCH-COMPLIANCE] [SUCCESS] Updated Dispute, new complianceBoardStatus: ${disputeDoc.complianceBoardStatus}`);
      console.log(`[PATCH-COMPLIANCE] [VERIFY] disputeId: ${disputeDoc.paymentDisputeId}, _id: ${disputeDoc._id}, orderId: ${disputeDoc.orderId}`);
      
      return res.json({ success: true, dispute: disputeDoc });
    }

    // Check if this is an INR document (ID starts with 'inr:')
    if (String(orderId).startsWith('inr:')) {
      console.log(`[PATCH-COMPLIANCE] [DETECTED] 'inr:' prefix format`);
      
      // Extract inrId from 'inr:inrId' format
      const inrId = String(orderId).replace(/^inr:/, '');
      console.log(`[PATCH-COMPLIANCE] [EXTRACTED] inrId: ${inrId}`);
      
      // Try to match both MongoDB _id and case ID
      const query = mongoose.Types.ObjectId.isValid(inrId)
        ? { $or: [{ _id: inrId }, { caseId: inrId }] }
        : { caseId: inrId };
      
      console.log(`[PATCH-COMPLIANCE] [QUERY] INR query:`, JSON.stringify(query));
      
      // For INR, also fetch current document to check AssignedAt
      const currentInr = await Case.findOne(query).select('inrCaseNotOpenedAssignedAt');
      
      const inrSetObj = { complianceBoardStatus };
      
      // Add "first changed" date logic for INR
      if (complianceBoardStatus === 'case_not_opened' && complianceBoardCategory === 'inr') {
        if (!currentInr?.inrCaseNotOpenedAssignedAt) {
          inrSetObj.inrCaseNotOpenedAssignedAt = new Date().toISOString();
        }
      } else if (complianceBoardStatus !== 'case_not_opened' && complianceBoardCategory === 'inr') {
        inrSetObj.inrCaseNotOpenedAssignedAt = null;
      }
      
      const inrDoc = await Case.findOneAndUpdate(
        query,
        { $set: inrSetObj },
        { new: true }
      );

      if (!inrDoc) {
        console.warn(`[PATCH-COMPLIANCE] [ERROR] INR case not found with ID: ${inrId}`);
        return res.status(404).json({ error: 'INR case not found' });
      }

      console.log(`[PATCH-COMPLIANCE] [SUCCESS] Updated INR case, new complianceBoardStatus: ${inrDoc.complianceBoardStatus}`);
      console.log(`[PATCH-COMPLIANCE] [VERIFY] caseId: ${inrDoc.caseId}, _id: ${inrDoc._id}, orderId: ${inrDoc.orderId}`);
      
      // Also sync to associated Order if it has the inr category
      if (inrDoc.orderId) {
        console.log(`[PATCH-COMPLIANCE] [SYNC] Updating associated Order: ${inrDoc.orderId}`);
        const orderUpdate = await Order.findOneAndUpdate(
          { orderId: inrDoc.orderId },
          { $set: { complianceBoardStatus } },
          { new: true }
        );
        if (orderUpdate) {
          console.log(`[PATCH-COMPLIANCE] [SYNC-SUCCESS] Updated Order ${inrDoc.orderId} to status ${complianceBoardStatus}`);
        } else {
          console.log(`[PATCH-COMPLIANCE] [SYNC-WARN] Order ${inrDoc.orderId} not found for sync update`);
        }
      }
      
      return res.json({ success: true, inrCase: inrDoc });
    }

    // PRIORITY: Try Return FIRST (before Order) because for compliance board, Returns need special handling
    console.log(`[PATCH-COMPLIANCE] [PRIORITY] Checking Return collection FIRST (before Order)`);
    
    const Return = mongoose.model('Return');
    
    // For Returns, the orderId might be:
    // 1. The eBay returnId (e.g., 5326877216)
    // 2. The MongoDB _id of the Return document
    // Try both to be safe
    const returnQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { returnId: orderId }] }
      : { returnId: orderId };
    
    console.log(`[PATCH-COMPLIANCE] [QUERY] Searching Return by returnId='${orderId}'`);
    
    // For Return, also fetch current document to check AssignedAt
    const currentReturn = await Return.findOne(returnQuery).select('returnCaseNotOpenedAssignedAt');
    
    const returnSetObj = { complianceBoardStatus };
    
    // Add "first changed" date logic for Returns
    if (complianceBoardStatus === 'case_not_opened' && complianceBoardCategory === 'return_refund') {
      if (!currentReturn?.returnCaseNotOpenedAssignedAt) {
        returnSetObj.returnCaseNotOpenedAssignedAt = new Date().toISOString();
      }
    } else if (complianceBoardStatus !== 'case_not_opened' && complianceBoardCategory === 'return_refund') {
      returnSetObj.returnCaseNotOpenedAssignedAt = null;
    }
    
    let returnDoc = await Return.findOneAndUpdate(
      returnQuery,
      { $set: returnSetObj },
      { new: true }
    );

    if (returnDoc) {
      console.log(`[PATCH-COMPLIANCE] [SUCCESS] Found and updated as Return`);
      console.log(`[PATCH-COMPLIANCE] [VERIFY] returnId: ${returnDoc.returnId}, _id: ${returnDoc._id}, status: ${returnDoc.complianceBoardStatus}`);
      
      // IMPORTANT: Also update the associated Order document so both are in sync
      if (returnDoc.orderId) {
        console.log(`[PATCH-COMPLIANCE] [SYNC] Updating associated Order: ${returnDoc.orderId}`);
        const orderUpdate = await Order.findOneAndUpdate(
          { orderId: returnDoc.orderId },
          { $set: { complianceBoardStatus } },
          { new: true }
        );
        if (orderUpdate) {
          console.log(`[PATCH-COMPLIANCE] [SYNC-SUCCESS] Updated Order ${returnDoc.orderId} to status ${complianceBoardStatus}`);
        } else {
          console.log(`[PATCH-COMPLIANCE] [SYNC-WARN] Order ${returnDoc.orderId} not found for sync update`);
        }
      }
      
      return res.json({ success: true, return: returnDoc });
    }

    console.log(`[PATCH-COMPLIANCE] [FALLBACK] Return not found with returnId='${orderId}', falling back to Order...`);

    // Fallback: Try to find as Order
    // Build the update object properly:
    // - complianceBoardStatus: always set it
    // - complianceBoardCategories: add to array (plural, not singular)
    // - complianceBoardSource: set if provided (marks where the assignment came from)
    const setObj = { complianceBoardStatus };
    
    // Add complianceBoardSource if provided
    if (complianceBoardSource) {
      setObj.complianceBoardSource = complianceBoardSource;
    }
    
    // Add "first changed" date for Case Not Opened status
    // This tracks when the item was FIRST moved to Case Not Opened (only set once, never updated)
    const now = new Date().toISOString();
    
    // First, fetch the current document to check if AssignedAt field already exists
    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { $or: [{ _id: orderId }, { orderId: orderId }] }
      : { orderId: orderId };
    
    const currentOrder = await Order.findOne(orderQuery).select('returnCaseNotOpenedAssignedAt cancellationCaseNotOpenedAssignedAt inrCaseNotOpenedAssignedAt');
    
    if (complianceBoardStatus === 'case_not_opened') {
      // Only set the AssignedAt if it doesn't already exist (first time only)
      if (complianceBoardCategory === 'return_refund') {
        if (!currentOrder?.returnCaseNotOpenedAssignedAt) {
          setObj.returnCaseNotOpenedAssignedAt = now;
        }
      } else if (complianceBoardCategory === 'cancellation') {
        if (!currentOrder?.cancellationCaseNotOpenedAssignedAt) {
          setObj.cancellationCaseNotOpenedAssignedAt = now;
        }
      } else if (complianceBoardCategory === 'inr') {
        if (!currentOrder?.inrCaseNotOpenedAssignedAt) {
          setObj.inrCaseNotOpenedAssignedAt = now;
        }
      }
    } else {
      // Clear the AssignedAt fields if moving away from Case Not Opened status
      if (complianceBoardCategory === 'return_refund') {
        setObj.returnCaseNotOpenedAssignedAt = null;
      } else if (complianceBoardCategory === 'cancellation') {
        setObj.cancellationCaseNotOpenedAssignedAt = null;
      } else if (complianceBoardCategory === 'inr') {
        setObj.inrCaseNotOpenedAssignedAt = null;
      }
    }
    
    const updateObj = {
      $set: setObj
    };
    
    // Use $addToSet to add category to the array without duplicates
    if (complianceBoardCategory) {
      updateObj.$addToSet = { complianceBoardCategories: complianceBoardCategory };
    }
    
    console.log(`[PATCH-COMPLIANCE] [QUERY] Order query:`, JSON.stringify(orderQuery));
    
    const order = await Order.findOneAndUpdate(
      orderQuery,
      updateObj,
      { new: true }
    );

    if (order) {
      console.log(`[PATCH-COMPLIANCE] [SUCCESS] Found and updated as Order, new status: ${order.complianceBoardStatus}`);
      console.log(`[PATCH-COMPLIANCE] [VERIFY-ORDER] orderId: ${order.orderId}, _id: ${order._id}, complianceBoardStatus: ${order.complianceBoardStatus}, complianceBoardCategory: ${order.complianceBoardCategory}, complianceBoardCategories: ${JSON.stringify(order.complianceBoardCategories)}`);
      
      // IMPORTANT: Also try to sync to Return document by orderId
      // This handles the case where there's both an Order and Return for the same orderId
      if (order.orderId) {
        console.log(`[PATCH-COMPLIANCE] [SYNC-FROM-ORDER] Attempting to sync status to Return documents with orderId: ${order.orderId}`);
        
        try {
          // Find Return documents by orderId and update them too
          const returnSyncResult = await Return.updateMany(
            { orderId: order.orderId },
            { $set: { complianceBoardStatus } }
          );
          
          if (returnSyncResult.modifiedCount > 0) {
            console.log(`[PATCH-COMPLIANCE] [SYNC-SUCCESS] Synced status to ${returnSyncResult.modifiedCount} Return document(s) with orderId: ${order.orderId}`);
          } else if (returnSyncResult.matchedCount > 0) {
            console.log(`[PATCH-COMPLIANCE] [SYNC-NO-CHANGE] Found ${returnSyncResult.matchedCount} Return(s) but no update needed (already has status: ${complianceBoardStatus})`);
          } else {
            console.log(`[PATCH-COMPLIANCE] [SYNC-NOT-FOUND] No Return documents found with orderId: ${order.orderId}`);
          }
        } catch (syncErr) {
          console.warn(`[PATCH-COMPLIANCE] [SYNC-ERROR] Failed to sync Return: ${syncErr.message}`);
          // Don't throw - the Order was updated successfully, which is the main goal
        }
      }
      
      return res.json({ success: true, order });
    }

    // Not found as Return or Order
    console.warn(`[PATCH-COMPLIANCE] [FATAL] Not found as Return or Order: ${orderId}`);
    return res.status(404).json({ error: 'Order or Return not found' });
  } catch (err) {
    console.error('[PATCH-COMPLIANCE] [EXCEPTION]:', err.message);
    console.error('[PATCH-COMPLIANCE] [STACK]:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /orders/:orderId/activity-logs
 * Get activity logs for a specific order
 */
router.get('/:orderId/activity-logs', requireAuth, requirePageAccess('ComplianceBoard'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Find logs by either orderId string or orderObjectId
    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { orderObjectId: orderId }
      : { orderId };

    const logs = await OrderActivityLog.find(orderQuery)
      .sort({ timestamp: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .select('action board fromStatus toStatus category changedBy details noteContent timestamp')
      .lean();

    const total = await OrderActivityLog.countDocuments(orderQuery);

    res.json({
      logs,
      total,
      page: Math.floor(parseInt(skip) / parseInt(limit)) + 1,
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch activity logs' });
  }
});

/**
 * POST /orders/:orderId/add-note
 * Add a note/remark to an order's activity log
 */
router.post('/:orderId/add-note', requireAuth, requirePageAccess('ComplianceBoard'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { noteContent } = req.body;

    if (!noteContent || noteContent.trim() === '') {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const orderQuery = mongoose.Types.ObjectId.isValid(orderId)
      ? { _id: orderId }
      : { orderId };

    const order = await Order.findOne(orderQuery);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch user details from database to get username and email
    const user = await User.findById(req.user?.userId).select('username email role').lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Determine if user is admin (check if they have admin role)
    const isAdmin = req.user?.role === 'superadmin' || req.user?.role === 'admin' || req.user?.role?.includes('admin');

    // Create activity log entry for the note
    const activityLog = await OrderActivityLog.create({
      orderId: order.orderId,
      orderObjectId: order._id,
      action: 'note_added',
      board: null,
      fromStatus: null,
      toStatus: null,
      category: null,
      noteContent: noteContent.trim(),
      changedBy: {
        userId: req.user?.userId,
        username: user.username,
        email: user.email,
        isAdmin,
      },
      details: `Note added by ${user.username}`,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      log: activityLog,
      message: 'Note added successfully',
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: error.message || 'Failed to add note' });
  }
});

/**
 * @swagger
 * /orders/legacy-item-seller-summary:
 *   get:
 *     tags: [Orders]
 *     summary: Per-seller summary for legacy item orders
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Aggregates order counts and issue flags per seller for the LegacyItemAnalytics page.
 *       **Requires LegacyItemAnalytics page access.**
 *     parameters:
 *       - { in: query, name: startDate, schema: { type: string, format: date } }
 *       - { in: query, name: endDate, schema: { type: string, format: date } }
 *       - { in: query, name: sellerId, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Array of per-seller summary objects
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get('/legacy-item-seller-summary', requireAuth, requirePageAccess('LegacyItemAnalytics'), async (req, res) => {
  try {
    const {
      legacyItemId,
      startDate,
      endDate,
      sellerId,
      paymentStatus,
      cancelledFilter,
      ebayMotors = 'false',
      excludeClient = 'true',
      excludeLowValue = 'false'
    } = req.query;

    if (!startDate && !endDate) {
      return res.status(400).json({ error: 'Select a single date or a date range first' });
    }

    const normalizedLegacyItemId = String(legacyItemId || '').trim();
    const match = await buildOrdersCrpMatch({
      startDate,
      endDate,
      sellerId,
      excludeClient,
      excludeLowValue
    });

    if (paymentStatus) {
      match.orderPaymentStatus = paymentStatus;
    }

    if (cancelledFilter === 'cancelled') {
      match.$and = match.$and || [];
      match.$and.push({
        $or: [
          { cancelState: { $in: FINAL_CANCELLED_STATES } },
          { 'cancelStatus.cancelState': { $in: FINAL_CANCELLED_STATES } }
        ]
      });
    } else if (cancelledFilter === 'not_cancelled') {
      match.$and = match.$and || [];
      match.$and.push(
        {
          $or: [
            { cancelState: { $exists: false } },
            { cancelState: null },
            { cancelState: { $nin: FINAL_CANCELLED_STATES } }
          ]
        },
        {
          $or: [
            { 'cancelStatus.cancelState': { $exists: false } },
            { 'cancelStatus.cancelState': null },
            { 'cancelStatus.cancelState': { $nin: FINAL_CANCELLED_STATES } }
          ]
        }
      );
    }

    const itemMatch = {
      'lineItems.legacyItemId': { $nin: [null, ''] }
    };

    if (normalizedLegacyItemId) {
      itemMatch['lineItems.legacyItemId'] = normalizedLegacyItemId;
    }

    if (ebayMotors === 'true') {
      itemMatch['lineItems.listingMarketplaceId'] = 'EBAY_MOTORS_US';
    }

    const [groupedRows, overallOrderCounts] = await Promise.all([
      Order.aggregate([
        { $match: match },
        { $unwind: '$lineItems' },
        { $match: itemMatch },
        {
          $lookup: {
            from: 'sellers',
            localField: 'seller',
            foreignField: '_id',
            as: 'sellerInfo'
          }
        },
        {
          $unwind: {
            path: '$sellerInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'sellerInfo.user',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: {
            path: '$userInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            orderId: '$orderId',
            legacyItemId: '$lineItems.legacyItemId',
            productTitle: { $ifNull: ['$lineItems.title', '$productName'] },
            sellerId: '$seller',
            sellerUsername: { $ifNull: ['$userInfo.username', 'Unknown Seller'] },
            isCancelled: {
              $or: [
                { $in: ['$cancelState', FINAL_CANCELLED_STATES] },
                { $in: ['$cancelStatus.cancelState', FINAL_CANCELLED_STATES] }
              ]
            },
            isPartiallyRefunded: { $eq: ['$orderPaymentStatus', 'PARTIALLY_REFUNDED'] },
            isFullyRefunded: { $eq: ['$orderPaymentStatus', 'FULLY_REFUNDED'] }
          }
        },
        {
          $group: {
            _id: {
              orderId: '$orderId',
              legacyItemId: '$legacyItemId',
              sellerId: '$sellerId',
              sellerUsername: '$sellerUsername'
            },
            productTitle: {
              $first: '$productTitle'
            },
            isCancelled: {
              $max: { $cond: ['$isCancelled', 1, 0] }
            },
            isPartiallyRefunded: {
              $max: { $cond: ['$isPartiallyRefunded', 1, 0] }
            },
            isFullyRefunded: {
              $max: { $cond: ['$isFullyRefunded', 1, 0] }
            }
          }
        },
        {
          $group: {
            _id: {
              legacyItemId: '$_id.legacyItemId',
              sellerId: '$_id.sellerId',
              sellerUsername: '$_id.sellerUsername'
            },
            totalOrders: { $sum: 1 },
            cancelledOrders: { $sum: '$isCancelled' },
            partiallyRefundedOrders: { $sum: '$isPartiallyRefunded' },
            fullyRefundedOrders: { $sum: '$isFullyRefunded' },
            productTitles: { $push: '$productTitle' }
          }
        },
        {
          $project: {
            _id: 0,
            legacyItemId: '$_id.legacyItemId',
            sellerId: '$_id.sellerId',
            sellerUsername: '$_id.sellerUsername',
            totalOrders: 1,
            cancelledOrders: 1,
            partiallyRefundedOrders: 1,
            fullyRefundedOrders: 1,
            productTitle: {
              $let: {
                vars: {
                  titles: {
                    $filter: {
                      input: '$productTitles',
                      as: 'title',
                      cond: {
                        $and: [
                          { $ne: ['$$title', null] },
                          { $ne: ['$$title', ''] }
                        ]
                      }
                    }
                  }
                },
                in: {
                  $ifNull: [
                    { $arrayElemAt: ['$$titles', 0] },
                    ''
                  ]
                }
              }
            }
          }
        },
        {
          $sort: {
            legacyItemId: 1,
            totalOrders: -1,
            sellerUsername: 1
          }
        }
      ]),
      Order.aggregate([
        { $match: match },
        { $unwind: '$lineItems' },
        { $match: itemMatch },
        {
          $group: {
            _id: '$orderId'
          }
        },
        {
          $count: 'totalOrders'
        }
      ])
    ]);

    const itemMap = new Map();
    const overallTotals = {
      totalOrders: overallOrderCounts[0]?.totalOrders || 0,
      cancelledOrders: 0,
      partiallyRefundedOrders: 0,
      fullyRefundedOrders: 0,
    };

    groupedRows.forEach((row) => {
      overallTotals.cancelledOrders += row.cancelledOrders || 0;
      overallTotals.partiallyRefundedOrders += row.partiallyRefundedOrders || 0;
      overallTotals.fullyRefundedOrders += row.fullyRefundedOrders || 0;

      const existingItem = itemMap.get(row.legacyItemId) || {
        legacyItemId: row.legacyItemId,
        productTitle: row.productTitle || '',
        totalOrders: 0,
        cancelledOrders: 0,
        partiallyRefundedOrders: 0,
        fullyRefundedOrders: 0,
        sellerCount: 0,
        sellers: []
      };

      existingItem.totalOrders += row.totalOrders || 0;
      existingItem.cancelledOrders += row.cancelledOrders || 0;
      existingItem.partiallyRefundedOrders += row.partiallyRefundedOrders || 0;
      existingItem.fullyRefundedOrders += row.fullyRefundedOrders || 0;
      if (!existingItem.productTitle && row.productTitle) {
        existingItem.productTitle = row.productTitle;
      }
      existingItem.sellers.push(row);
      existingItem.sellerCount = existingItem.sellers.length;

      itemMap.set(row.legacyItemId, existingItem);
    });

    const items = Array.from(itemMap.values()).sort((left, right) => {
      if (right.totalOrders !== left.totalOrders) {
        return right.totalOrders - left.totalOrders;
      }

      return left.legacyItemId.localeCompare(right.legacyItemId);
    });

    res.json({
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        sellerId: sellerId || null,
        legacyItemId: normalizedLegacyItemId || null,
        paymentStatus: paymentStatus || null,
        cancelledFilter: cancelledFilter || null,
        ebayMotors: ebayMotors === 'true',
      },
      itemCount: items.length,
      ...overallTotals,
      items
    });
  } catch (error) {
    console.error('Error fetching legacy item seller summary:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch legacy item seller summary' });
  }
});

/**
 * @swagger
 * /orders/legacy-item-orders:
 *   get:
 *     tags: [Orders]
 *     summary: Legacy item order drill-down
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Returns individual orders for a specific `legacyItemId`, enriched with
 *       conversation category, case status, and issue flags (cancelled, refunded, etc.).
 *       **Requires LegacyItemAnalytics page access.**
 *     parameters:
 *       - { in: query, name: legacyItemId, required: true, schema: { type: string } }
 *       - { in: query, name: sellerId, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string, enum: [all, cancelled, partiallyRefunded, fullyRefunded], default: all } }
 *       - { in: query, name: startDate, schema: { type: string, format: date } }
 *       - { in: query, name: endDate, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Array of enriched order records
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get('/legacy-item-orders', requireAuth, requirePageAccess('LegacyItemAnalytics'), async (req, res) => {
  try {
    const {
      legacyItemId,
      sellerId,
      type = 'all',
      startDate,
      endDate,
      ebayMotors = 'false',
      excludeClient = 'true',
      excludeLowValue = 'false',
    } = req.query;

    if (!legacyItemId) {
      return res.status(400).json({ error: 'legacyItemId is required' });
    }

    const match = await buildOrdersCrpMatch({ startDate, endDate, sellerId, excludeClient, excludeLowValue });

    if (type === 'cancelled') {
      match.$and = match.$and || [];
      match.$and.push({
        $or: [
          { cancelState: { $in: FINAL_CANCELLED_STATES } },
          { 'cancelStatus.cancelState': { $in: FINAL_CANCELLED_STATES } },
        ],
      });
    } else if (type === 'partiallyRefunded') {
      match.orderPaymentStatus = 'PARTIALLY_REFUNDED';
    } else if (type === 'fullyRefunded') {
      match.orderPaymentStatus = 'FULLY_REFUNDED';
    }

    const itemMatch = { 'lineItems.legacyItemId': legacyItemId };
    if (ebayMotors === 'true') {
      itemMatch['lineItems.listingMarketplaceId'] = 'EBAY_MOTORS_US';
    }

    const orders = await Order.aggregate([
      { $match: match },
      { $unwind: '$lineItems' },
      { $match: itemMatch },
      {
        $group: {
          _id: '$orderId',
          buyerUsername: { $first: '$buyer.username' },
          buyerName: { $first: '$buyer.buyerRegistrationAddress.fullName' },
          shippingFullName: { $first: '$shippingFullName' },
          legacyItemId: { $first: '$lineItems.legacyItemId' },
          fulfillmentNotes: { $first: '$fulfillmentNotes' },
          remark: { $first: '$remark' },
          isCancelled: {
            $max: {
              $cond: [
                {
                  $or: [
                    { $in: ['$cancelState', FINAL_CANCELLED_STATES] },
                    { $in: ['$cancelStatus.cancelState', FINAL_CANCELLED_STATES] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          isPartiallyRefunded: { $max: { $cond: [{ $eq: ['$orderPaymentStatus', 'PARTIALLY_REFUNDED'] }, 1, 0] } },
          isFullyRefunded: { $max: { $cond: [{ $eq: ['$orderPaymentStatus', 'FULLY_REFUNDED'] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          orderId: '$_id',
          buyerUsername: 1,
          buyerName: 1,
          shippingFullName: 1,
          legacyItemId: 1,
          fulfillmentNotes: 1,
          remark: 1,
          isCancelled: 1,
          isPartiallyRefunded: 1,
          isFullyRefunded: 1,
        },
      },
      { $sort: { orderId: 1 } },
    ]);

    const orderIds = orders.map((o) => o.orderId).filter(Boolean);

    const [convMetas, cases, returns, disputes] = await Promise.all([
      ConversationMeta.find({ orderId: { $in: orderIds } }, { orderId: 1, category: 1, caseStatus: 1, _id: 0 }).lean(),
      Case.find({ orderId: { $in: orderIds } }, { orderId: 1, caseType: 1, status: 1, _id: 0 }).lean(),
      Return.find({ orderId: { $in: orderIds } }, { orderId: 1, returnStatus: 1, _id: 0 }).lean(),
      PaymentDispute.find({ orderId: { $in: orderIds } }, { orderId: 1, paymentDisputeStatus: 1, reason: 1, _id: 0 }).lean(),
    ]);

    const convoMetaMap = new Map(convMetas.map((m) => [m.orderId, m]));

    const issuesMap = {};
    cases.forEach((c) => {
      if (!c.orderId) return;
      issuesMap[c.orderId] = issuesMap[c.orderId] || [];
      issuesMap[c.orderId].push({ type: c.caseType || 'INR', status: c.status });
    });
    returns.forEach((r) => {
      if (!r.orderId) return;
      issuesMap[r.orderId] = issuesMap[r.orderId] || [];
      issuesMap[r.orderId].push({ type: 'Return', status: r.returnStatus });
    });
    disputes.forEach((d) => {
      if (!d.orderId) return;
      issuesMap[d.orderId] = issuesMap[d.orderId] || [];
      issuesMap[d.orderId].push({ type: 'Dispute', status: d.paymentDisputeStatus, reason: d.reason });
    });

    const enriched = orders.map((order) => {
      const convoMeta = convoMetaMap.get(order.orderId);
      const rawIssues = issuesMap[order.orderId] || [];
      const convoCaseStatus = convoMeta?.caseStatus || null;
      return {
        ...order,
        convoCategory: convoMeta?.category || null,
        convoCaseStatus,
        issues: rawIssues.map((i) => ({ ...i, caseStatus: convoCaseStatus || 'Case Not Opened' })),
      };
    });

    res.json({ orders: enriched, total: enriched.length });
  } catch (error) {
    console.error('Error fetching legacy item orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch legacy item orders' });
  }
});

// Get stats for order fulfillment statuses - count by complianceBoardStatus field (same as board)
router.get('/stats', requireAuth, requirePageAccess('ComplianceBoard'), async (req, res) => {
  try {
    const {
      category = 'order_fulfillment',
      startDate,
      endDate,
      sellerId = '',
      excludeClient = 'false',
      excludeLowValue = 'false'
    } = req.query;

    // Minimum date for compliance boards
    // order_fulfillment: August 1, 2026 | others: July 19, 2026
    const COMPLIANCE_BOARD_MIN_DATE = category === 'order_fulfillment'
      ? new Date('2026-08-01T00:00:00Z')
      : new Date('2026-07-19T00:00:00Z');

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.dateSold = {};
      if (startDate) {
        const { start } = getPTDayBoundsUTC(startDate);
        dateFilter.dateSold.$gte = start;
      } else {
        dateFilter.dateSold.$gte = COMPLIANCE_BOARD_MIN_DATE;
      }
      if (endDate) {
        const { end } = getPTDayBoundsUTC(endDate);
        dateFilter.dateSold.$lte = end;
      }
    } else {
      dateFilter.dateSold = { $gte: COMPLIANCE_BOARD_MIN_DATE };
    }

    const sellerObjectId = sellerId && mongoose.Types.ObjectId.isValid(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : null;
    const excludeClientEnabled = excludeClient === 'true' || excludeClient === true;
    const excludeLowValueEnabled = excludeLowValue === 'true' || excludeLowValue === true;
    const excludedSellerIds = excludeClientEnabled ? await getExcludedClientSellerIds() : [];

    const baseQuery = { ...dateFilter };
    
    // CRITICAL: Use the same category filtering logic as the board endpoint
    // For order_fulfillment and order_communication, include unassigned + assigned orders
    const categoryFilters = [];
    if (category === 'order_fulfillment' || category === 'order_communication') {
      categoryFilters.push(
        { complianceBoardCategories: [] },
        { complianceBoardCategory: null },
        { complianceBoardCategories: { $elemMatch: {} } },
        { complianceBoardCategory: { $ne: null, $exists: true } }
      );
    } else if (category === 'inr' || category === 'cancellation' || category === 'return_refund') {
      categoryFilters.push(
        { complianceBoardCategories: category },
        { complianceBoardCategory: category }
      );
    } else {
      categoryFilters.push(
        { complianceBoardCategories: [] },
        { complianceBoardCategory: null },
        { complianceBoardCategories: category },
        { complianceBoardCategory: category }
      );
    }
    baseQuery.$or = categoryFilters;
    
    if (sellerObjectId) {
      baseQuery.seller = sellerObjectId;
    } else if (excludedSellerIds.length > 0) {
      baseQuery.seller = { $nin: excludedSellerIds };
    }

    // Add low value filter if enabled
    if (excludeLowValueEnabled) {
      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({
        $or: [
          { subtotalUSD: { $gte: 3 } },
          { subtotal: { $gte: 3 } }
        ]
      });
    }

    // Use aggregation to count and deduplicate by orderId at the same time
    // This prevents duplicate orders from being counted multiple times
    const statusCounts = await Order.aggregate([
      { $match: baseQuery },
      // Sort by updatedAt desc to prefer the most recent version of each order
      { $sort: { orderId: 1, updatedAt: -1 } },
      // Group by orderId to get only the most recent version
      {
        $group: {
          _id: { orderId: '$orderId', status: { $ifNull: ['$complianceBoardStatus', 'todo'] } },
          _firstId: { $first: '$_id' },
          updatedAt: { $first: '$updatedAt' }
        }
      },
      // Now group by status to count unique orders per status
      {
        $group: {
          _id: '$_id.status',
          count: { $sum: 1 }
        }
      }
    ]);

    const counts = statusCounts.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    // Debug logging
    if (startDate === '2026-08-02') {
      console.log(`[STATS-ENDPOINT-DEBUG] For date 2026-08-02, counted:`, counts);
    }

    res.json({
      todo: counts.todo || 0,
      outOfStock: counts.out_of_stock || 0,
      cancellation: counts.cancellation || 0,
      addressIssue: counts.address_issue || 0,
      lateDelivery: counts.late_delivery || 0,
      notFulfilled: counts.not_fulfilled || 0,
      fulfilled: counts.fulfilled || 0,
      buyerConfirmation: counts.buyer_confirmation || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stats' });
  }
});

// Get detailed orders for a specific status - filter by complianceBoardStatus (same as board)
router.get('/stats-details', requireAuth, requirePageAccess('ComplianceBoard'), async (req, res) => {
  try {
    const {
      status,
      category = 'order_fulfillment',
      startDate,
      endDate,
      sellerId = '',
      excludeClient = 'false',
      excludeLowValue = 'false'
    } = req.query;

    console.log(`[STATS-DETAILS] Request: status=${status}, category=${category}`);

    // Minimum date for compliance boards
    // order_fulfillment: August 1, 2026 | others: July 19, 2026
    const COMPLIANCE_BOARD_MIN_DATE = category === 'order_fulfillment'
      ? new Date('2026-08-01T00:00:00Z')
      : new Date('2026-07-19T00:00:00Z');

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.dateSold = {};
      if (startDate) {
        const { start } = getPTDayBoundsUTC(startDate);
        dateFilter.dateSold.$gte = start;
      } else {
        dateFilter.dateSold.$gte = COMPLIANCE_BOARD_MIN_DATE;
      }
      if (endDate) {
        const { end } = getPTDayBoundsUTC(endDate);
        dateFilter.dateSold.$lte = end;
      }
    } else {
      dateFilter.dateSold = { $gte: COMPLIANCE_BOARD_MIN_DATE };
    }

    // Special handling for INR Case Opened status
    if (status === 'inr_case_opened') {
      try {
        // Query INR Cases (Inquiries)
        const cases = await Case.find({
          caseType: { $in: ['INR', 'SNAD', 'OTHER'] },
          orderId: { $exists: true, $ne: null }
        }).select('caseId orderId creationDate notes remark').lean().limit(100);
        
        // Query Payment Disputes
        const disputes = await PaymentDispute.find({
          orderId: { $exists: true, $ne: null }
        }).select('paymentDisputeId orderId creationDate notes remark').lean().limit(100);
        
        // Get order details for enrichment
        const allOrderIds = [
          ...cases.map(c => String(c.orderId).trim()),
          ...disputes.map(d => String(d.orderId).trim())
        ];
        
        const uniqueOrderIds = [...new Set(allOrderIds)].filter(Boolean);
        
        if (uniqueOrderIds.length === 0) {
          return res.json({ items: [] });
        }
        
        const orders = await Order.find({ orderId: { $in: uniqueOrderIds } })
          .select('orderId buyer productName lineItems subtotalUSD seller')
          .populate({ path: 'seller', select: 'user', populate: { path: 'user', select: 'username' } })
          .lean();
        
        const orderMap = Object.fromEntries(orders.map(o => [String(o.orderId).trim(), o]));
        
        // Enrich cases with order details
        const enrichedCases = cases.map(c => {
          const normalizedOrderId = String(c.orderId).trim();
          const order = orderMap[normalizedOrderId];
          return {
            orderId: c.orderId,
            orderObjectId: order?._id,
            itemTitle: order?.productName || (order?.lineItems?.[0]?.title || 'Item'),
            buyerName: order?.buyer?.buyerRegistrationAddress?.fullName || order?.buyer?.username || 'Unknown',
            sellerName: order?.seller?.user?.username || 'Unknown',
            price: order?.subtotalUSD || 0,
            creationDate: c.creationDate,
            issueId: c.caseId,
            status: status
          };
        });
        
        // Enrich disputes with order details
        const enrichedDisputes = disputes.map(d => {
          const normalizedOrderId = String(d.orderId).trim();
          const order = orderMap[normalizedOrderId];
          return {
            orderId: d.orderId,
            orderObjectId: order?._id,
            itemTitle: order?.productName || (order?.lineItems?.[0]?.title || 'Item'),
            buyerName: order?.buyer?.buyerRegistrationAddress?.fullName || order?.buyer?.username || 'Unknown',
            sellerName: order?.seller?.user?.username || 'Unknown',
            price: order?.subtotalUSD || 0,
            creationDate: d.creationDate,
            issueId: d.paymentDisputeId,
            status: status
          };
        });
        
        return res.json({ items: [...enrichedCases, ...enrichedDisputes].slice(0, 100) });
      } catch (err) {
        console.error('[STATS-DETAILS] Error fetching INR case details:', err);
        return res.status(500).json({ error: err.message, items: [] });
      }
    }

    // Special handling for Return Case Opened status
    if (status === 'case_opened') {
      try {
        const returns = await Return.find({ orderId: { $exists: true, $ne: null } })
          .select('returnId orderId createdAt creationDate').lean().limit(100);
        
        const allOrderIds = returns.map(r => String(r.orderId).trim());
        const uniqueOrderIds = [...new Set(allOrderIds)].filter(Boolean);
        
        if (uniqueOrderIds.length === 0) {
          return res.json({ items: [] });
        }
        
        const orders = await Order.find({ orderId: { $in: uniqueOrderIds } })
          .select('orderId buyer productName lineItems subtotalUSD seller')
          .populate({ path: 'seller', select: 'user', populate: { path: 'user', select: 'username' } })
          .lean();
        
        const orderMap = Object.fromEntries(orders.map(o => [String(o.orderId).trim(), o]));
        
        const enrichedReturns = returns.map(r => {
          const normalizedOrderId = String(r.orderId).trim();
          const order = orderMap[normalizedOrderId];
          return {
            orderId: r.orderId,
            orderObjectId: order?._id,
            itemTitle: order?.productName || (order?.lineItems?.[0]?.title || 'Item'),
            buyerName: order?.buyer?.buyerRegistrationAddress?.fullName || order?.buyer?.username || 'Unknown',
            sellerName: order?.seller?.user?.username || 'Unknown',
            price: order?.subtotalUSD || 0,
            creationDate: r.createdAt || r.creationDate,
            issueId: r.returnId,
            status: status
          };
        });
        
        return res.json({ items: enrichedReturns });
      } catch (err) {
        console.error('[STATS-DETAILS] Error fetching Return case details:', err);
        return res.status(500).json({ error: err.message, items: [] });
      }
    }

    // Special handling for Cancellation board statuses (cancellation_request, accepted, declined)
    // These need to combine both Order records and Cancellation records
    if (['cancellation_request', 'accepted', 'declined'].includes(status)) {
      try {
        console.log(`[STATS-DETAILS] Handling Cancellation board status: ${status}`);
        
        // Query Order records with this status
        const orderQuery = { ...dateFilter };
        orderQuery.$and = [
          { $or: [
            { complianceBoardCategories: 'cancellation' },
            { complianceBoardCategory: 'cancellation' }
          ]},
          { $or: [
            { complianceBoardStatus: status }
          ]}
        ];
        
        const orders = await Order.find(orderQuery)
          .select('orderId dateSold buyer itemNumber lineItems productName subtotalUSD seller')
          .populate({ path: 'seller', select: 'user', populate: { path: 'user', select: 'username' } })
          .lean()
          .limit(100);
        
        console.log(`[STATS-DETAILS] Found ${orders.length} Order records with status=${status}`);
        
        // Query Cancellation records with this status (separate date filtering)
        const cancellationQuery = {
          complianceBoardStatus: status
        };
        
        if (startDate || endDate) {
          cancellationQuery.cancelRequestDate = {};
          if (startDate) {
            const { start } = getPTDayBoundsUTC(startDate);
            cancellationQuery.cancelRequestDate.$gte = start;
          }
          if (endDate) {
            const { end } = getPTDayBoundsUTC(endDate);
            cancellationQuery.cancelRequestDate.$lte = end;
          }
        } else {
          // Default: use minimum date
          cancellationQuery.cancelRequestDate = { $gte: new Date('2026-07-19T00:00:00Z') };
        }
        
        const cancellations = await Cancellation.find(cancellationQuery)
          .select('cancelId orderId dateSold buyer lineItems productName subtotalUSD seller cancelRequestDate createdAt')
          .populate({ path: 'seller', select: 'user', populate: { path: 'user', select: 'username' } })
          .lean()
          .limit(100);
        
        console.log(`[STATS-DETAILS] Found ${cancellations.length} Cancellation records with status=${status}`);
        
        // Combine and deduplicate by orderId
        const deduped = {};
        
        // Add Order records
        orders.forEach(order => {
          if (!deduped[order.orderId]) {
            deduped[order.orderId] = {
              orderId: order.orderId,
              orderObjectId: order._id,
              itemTitle: order.productName || (order.lineItems?.[0]?.title || 'Item'),
              buyerName: order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username || 'Unknown',
              sellerName: order.seller?.user?.username || 'Unknown',
              price: order.subtotalUSD || 0,
              creationDate: order.dateSold,
              source: 'order',
              status: status
            };
          }
        });
        
        // Add Cancellation records (if not already present from Order)
        cancellations.forEach(cancellation => {
          if (!deduped[cancellation.orderId]) {
            deduped[cancellation.orderId] = {
              orderId: cancellation.orderId,
              orderObjectId: cancellation._id,
              itemTitle: cancellation.productName || 'Cancellation',
              buyerName: cancellation.buyer?.buyerRegistrationAddress?.fullName || cancellation.buyer?.username || 'Unknown',
              sellerName: cancellation.seller?.user?.username || 'Unknown',
              price: cancellation.subtotalUSD || 0,
              creationDate: cancellation.cancelRequestDate || cancellation.createdAt,
              source: 'cancellation',
              issueId: cancellation.cancelId,
              status: status
            };
          }
        });
        
        const uniqueItems = Object.values(deduped).slice(0, 100);
        console.log(`[STATS-DETAILS] Returning ${uniqueItems.length} combined items (Order + Cancellation) for status=${status}`);
        
        return res.json({ items: uniqueItems });
      } catch (err) {
        console.error('[STATS-DETAILS] Error fetching Cancellation board status details:', err);
        return res.status(500).json({ error: err.message, items: [] });
      }
    }

    // Regular flow for other statuses
    const sellerObjectId = sellerId && mongoose.Types.ObjectId.isValid(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : null;
    const excludeClientEnabled = excludeClient === 'true' || excludeClient === true;
    const excludeLowValueEnabled = excludeLowValue === 'true' || excludeLowValue === true;
    const excludedSellerIds = excludeClientEnabled ? await getExcludedClientSellerIds() : [];

    // Build query with proper $and/$or logic
    let query = { ...dateFilter };
    
    // CRITICAL: Use the same category filtering logic as the board endpoint
    // For order_fulfillment and order_communication, include unassigned + assigned orders
    const categoryFilters = [];
    if (category === 'order_fulfillment' || category === 'order_communication') {
      categoryFilters.push(
        { complianceBoardCategories: [] },
        { complianceBoardCategory: null },
        { complianceBoardCategories: { $elemMatch: {} } },
        { complianceBoardCategory: { $ne: null, $exists: true } }
      );
    } else if (category === 'inr' || category === 'cancellation' || category === 'return_refund') {
      categoryFilters.push(
        { complianceBoardCategories: category },
        { complianceBoardCategory: category }
      );
    } else {
      categoryFilters.push(
        { complianceBoardCategories: [] },
        { complianceBoardCategory: null },
        { complianceBoardCategories: category },
        { complianceBoardCategory: category }
      );
    }
    query.$and = query.$and || [];
    query.$and.push({ $or: categoryFilters });
    
    // Match by complianceBoardStatus (handle 'todo' as missing/null status)
    const statusCriteria = [];
    if (status === 'todo') {
      statusCriteria.push(
        { complianceBoardStatus: { $exists: false } },
        { complianceBoardStatus: null },
        { complianceBoardStatus: 'todo' }
      );
    } else {
      statusCriteria.push({ complianceBoardStatus: status });
    }
    
    query.$and.push({ $or: statusCriteria });

    if (sellerObjectId) {
      query.$and.push({ seller: sellerObjectId });
    } else if (excludedSellerIds.length > 0) {
      query.$and.push({ seller: { $nin: excludedSellerIds } });
    }

    // Add low value filter if enabled
    if (excludeLowValueEnabled) {
      query.$and.push({
        $or: [
          { subtotalUSD: { $gte: 3 } },
          { subtotal: { $gte: 3 } }
        ]
      });
    }

    // Fetch orders for this status
    let orders = await Order.find(query)
      .select('orderId dateSold buyer itemNumber lineItems productName subtotalUSD subtotal')
      .populate({ path: 'seller', select: 'user', populate: { path: 'user', select: 'username' } })
      .sort({ dateSold: -1, updatedAt: -1 })
      .lean();

    // Deduplicate by orderId
    const deduped = {};
    orders.forEach(order => {
      if (!deduped[order.orderId]) {
        deduped[order.orderId] = order;
      }
    });
    
    const uniqueOrders = Object.values(deduped).slice(0, 100);

    const enriched = uniqueOrders.map((order) => ({
      orderId: order.orderId,
      orderObjectId: order._id,
      itemTitle: order.productName || (order.lineItems?.[0]?.title || 'Item'),
      buyerName: order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username || 'Unknown',
      sellerName: order.seller?.user?.username || 'Unknown',
      price: order.subtotalUSD || 0,
      creationDate: order.dateSold,
      status: status
    }));

    res.json({ items: enriched });
  } catch (error) {
    console.error('Error fetching stats details:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stats details' });
  }
});

/**
 * Update compliance board tracking ID for an Order (Follow Up column in Return board)
 * POST /:orderId/compliance-board-tracking
 * Body: { complianceBoardTracking: string }
 */
router.post('/:orderId/compliance-board-tracking', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { complianceBoardTracking } = req.body;

    console.log(`[COMPLIANCE-BOARD-TRACKING] Received request for orderId=${orderId}, tracking=${complianceBoardTracking}`);

    if (!complianceBoardTracking || !complianceBoardTracking.trim()) {
      console.log(`[COMPLIANCE-BOARD-TRACKING] Error: Tracking ID is empty or missing`);
      return res.status(400).json({ error: 'Tracking ID is required' });
    }

    // Debug: Check if order exists
    const existingOrder = await Order.findOne({ orderId: orderId }).select('_id orderId complianceBoardTracking').lean();
    console.log(`[COMPLIANCE-BOARD-TRACKING] Found order:`, existingOrder ? `Yes (${existingOrder._id})` : 'No');

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: orderId },
      { complianceBoardTracking: complianceBoardTracking.trim() },
      { new: true, runValidators: false }
    ).lean();

    if (!updatedOrder) {
      console.log(`[COMPLIANCE-BOARD-TRACKING] Error: Order not found with orderId=${orderId}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`[COMPLIANCE-BOARD-TRACKING] ✅ Successfully updated orderId=${orderId} with tracking=${complianceBoardTracking.trim()}`);

    res.json({
      success: true,
      orderId: updatedOrder.orderId,
      complianceBoardTracking: updatedOrder.complianceBoardTracking
    });
  } catch (err) {
    console.error('[COMPLIANCE-BOARD-TRACKING] ❌ Error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update compliance board tracking ID' });
  }
});

/**
 * Update compliance board tracking ID for a Return record (Follow Up column)
 * POST /returns/:returnId/compliance-board-tracking
 * Body: { complianceBoardTracking: string }
 */
router.post('/returns/:returnId/compliance-board-tracking', requireAuth, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { complianceBoardTracking } = req.body;

    if (!complianceBoardTracking || !complianceBoardTracking.trim()) {
      return res.status(400).json({ error: 'Tracking ID is required' });
    }

    const updatedReturn = await Return.findOneAndUpdate(
      { returnId: returnId },
      { complianceBoardTracking: complianceBoardTracking.trim() },
      { new: true, runValidators: false }
    ).lean();

    if (!updatedReturn) {
      return res.status(404).json({ error: 'Return not found' });
    }

    console.log(`[COMPLIANCE-BOARD-TRACKING] Updated returnId=${returnId} with tracking=${complianceBoardTracking.trim()}`);

    res.json({
      success: true,
      returnId: updatedReturn.returnId,
      complianceBoardTracking: updatedReturn.complianceBoardTracking
    });
  } catch (err) {
    console.error('[COMPLIANCE-BOARD-TRACKING] Error updating tracking ID:', err);
    res.status(500).json({ error: err.message || 'Failed to update compliance board tracking ID' });
  }
});

/**
 * Get all issues/cases associated with an order (Returns, INR Cases, Cancellations)
 * Used to show a badge in Buyer Messages indicating if order has open cases
 */
router.get('/order-issues/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    // Search for issues in parallel
    const [returns, inrCases, cancellations] = await Promise.all([
      Return.findOne({ orderId: String(orderId) })
        .select('returnId returnStatus')
        .lean(),
      Case.findOne({ orderId: String(orderId) })
        .select('caseId status caseType')
        .lean(),
      Cancellation.findOne({ orderId: String(orderId) })
        .select('cancelId cancelStatus cancelState')
        .lean()
    ]);

    // Compile issues - prioritize by severity
    const issues = [];

    if (inrCases) {
      const caseType = inrCases.caseType || 'INR';
      const status = inrCases.status || 'Unknown';
      const isClosed = String(status).toUpperCase() === 'CLOSED' || String(status).includes('CLOSED');
      issues.push({
        type: caseType,
        status: status,
        id: inrCases.caseId,
        isClosed: isClosed,
        severity: 'high'
      });
    }

    if (returns) {
      const status = returns.returnStatus || 'Unknown';
      const isClosed = String(status).toUpperCase() === 'CLOSED';
      issues.push({
        type: 'Return',
        status: status,
        id: returns.returnId,
        isClosed: isClosed,
        severity: 'high'
      });
    }

    if (cancellations) {
      const status = cancellations.cancelStatus || 'Unknown';
      const isClosed = String(status).toUpperCase().includes('CLOSED');
      issues.push({
        type: 'Cancellation',
        status: status,
        id: cancellations.cancelId,
        isClosed: isClosed,
        severity: 'medium'
      });
    }

    // Sort by severity
    issues.sort((a, b) => {
      const severityMap = { high: 0, medium: 1, low: 2 };
      return (severityMap[a.severity] || 3) - (severityMap[b.severity] || 3);
    });

    res.json({
      orderId: String(orderId),
      hasIssues: issues.length > 0,
      issues: issues,
      primaryIssue: issues.length > 0 ? issues[0] : null
    });
  } catch (error) {
    console.error('Error fetching order issues:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch order issues' });
  }
});

export default router;
