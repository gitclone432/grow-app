import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import Return from '../models/Return.js';
import Case from '../models/Case.js';
import PaymentDispute from '../models/PaymentDispute.js';
import Message from '../models/Message.js';
import MarketMetric from '../models/MarketMetric.js';
import TemplateListing from '../models/TemplateListing.js';

const router = Router();
const EXCLUDED_CLIENT_USERNAME = 'Vergo';

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
    const { sellerId } = req.query;

    const currentRange = getMonthUtcRange(month);
    const previousRange = getMonthUtcRange(previousMonth);

    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};
    const baseMatch = req.query.excludeLowValue === 'true'
      ? {
        ...sellerMatch,
        $or: [{ subtotalUSD: { $gte: 3 } }, { subtotal: { $gte: 3 } }]
      }
      : sellerMatch;

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
    const { sellerId } = req.query;
    const { start, end } = getPtDayRange(date);
    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};
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
      { dateSold: { $gte: start, $lte: end } },
      lowValueClause
    );

    const awaitingMatch = maybeAnd(
      sellerMatch,
      {
        shipByDate: { $gte: start, $lte: end },
        cancelState: { $in: ['NONE_REQUESTED', 'IN_PROGRESS', null, ''] }
      },
      { $or: [{ trackingNumber: { $exists: false } }, { trackingNumber: null }, { trackingNumber: '' }] },
      lowValueClause
    );

    const arrivalsMatch = maybeAnd(
      sellerMatch,
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
      Order.countDocuments(maybeAnd(sellerMatch, { dateSold: { $gte: currentRange.start, $lte: currentRange.end } }, lowValueClause)),
      Order.countDocuments(maybeAnd(sellerMatch, { dateSold: { $gte: previousRange.start, $lte: previousRange.end } }, lowValueClause))
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

// ─────────────────────────────────────────────────────────────────────────────
// CRP Analytics  GET /orders/crp-analytics
// Groups orders by Category, Range, or Product and returns counts.
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

    // Determine which field and lookup collection to use
    const groupFieldMap = {
      category: { field: 'orderCategoryId', from: 'asinlistcategories' },
      range: { field: 'orderRangeId', from: 'asinlistranges' },
      product: { field: 'orderProductId', from: 'asinlistproducts' },
    };
    const { field, from } = groupFieldMap[groupBy] || groupFieldMap.category;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $ifNull: [`$${field}`, null] },
          count: { $sum: 1 },
        }
      },
      {
        $lookup: {
          from,
          localField: '_id',
          foreignField: '_id',
          as: 'taxDoc'
        }
      },
      {
        $project: {
          _id: 1,
          count: 1,
          name: {
            $cond: {
              if: { $eq: ['$_id', null] },
              then: 'Unassigned',
              else: { $arrayElemAt: ['$taxDoc.name', 0] }
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ];

    const results = await Order.aggregate(pipeline);

    res.json(results.map(r => ({
      id: r._id ? r._id.toString() : null,
      name: r.name || 'Unassigned',
      count: r.count,
    })));
  } catch (error) {
    console.error('Error fetching CRP analytics:', error);
    res.status(500).json({ error: 'Failed to fetch CRP analytics' });
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

export default router;
