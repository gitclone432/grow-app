import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import TemplateListing from '../models/TemplateListing.js';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import User from '../models/User.js';

const router = express.Router();

const EXCLUDED_CLIENT_USERNAME = 'Vergo';

async function getExcludedClientSellerIds() {
  const excludedUsers = await User.find({
    username: { $regex: new RegExp(`^${EXCLUDED_CLIENT_USERNAME}$`, 'i') },
  })
    .select('_id')
    .lean();

  if (excludedUsers.length === 0) return [];

  return Seller.find({
    user: { $in: excludedUsers.map(user => user._id) },
  }).distinct('_id');
}

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function normalizeMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function getPTDayBoundsUTC(dateStr) {
  function getPTHour(d) {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        hour12: false,
        hourCycle: 'h23',
      }).format(d),
      10,
    );
  }

  function getPTDateStr(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  function findMidnightUTC(ds) {
    const pst = new Date(`${ds}T08:00:00.000Z`);
    if (getPTDateStr(pst) === ds && getPTHour(pst) === 0) return pst;
    const pdt = new Date(`${ds}T07:00:00.000Z`);
    if (getPTDateStr(pdt) === ds && getPTHour(pdt) === 0) return pdt;
    return pst;
  }

  const start = findMidnightUTC(dateStr);
  const tmp = new Date(`${dateStr}T12:00:00.000Z`);
  tmp.setUTCDate(tmp.getUTCDate() + 1);
  const nextStart = findMidnightUTC(tmp.toISOString().split('T')[0]);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

router.get('/sku-seller-order-profit', requireAuth, requirePageAccess('SkuSellerOrderProfit'), async (req, res) => {
  try {
    const {
      search = '',
      sellerId = '',
      page = 1,
      limit = 50,
      orderFrom = '',
      orderTo = '',
      createdFrom = '',
      createdTo = '',
      marketplace = '',
      searchMarketplace = '',
      excludeClient = '',
      excludeLowValue = '',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const sellerObjectId = sellerId && sellerId !== 'all' ? toObjectId(sellerId) : null;
    const trimmedSearch = String(search || '').trim();
    const fromValue = orderFrom || createdFrom;
    const toValue = orderTo || createdTo;
    const marketplaceValue = marketplace || searchMarketplace;

    if (sellerId && sellerId !== 'all' && !sellerObjectId) {
      return res.status(400).json({ error: 'Invalid sellerId' });
    }
    if (!fromValue || !toValue) {
      return res.status(400).json({ error: 'Order From and Order To are required.' });
    }

    const { start: fromDate } = getPTDayBoundsUTC(fromValue);
    const { end: toDate } = getPTDayBoundsUTC(toValue);
    if (Number.isNaN(fromDate.getTime())) return res.status(400).json({ error: 'Invalid orderFrom date' });
    if (Number.isNaN(toDate.getTime())) return res.status(400).json({ error: 'Invalid orderTo date' });
    if (fromDate > toDate) return res.status(400).json({ error: 'Order From must be before Order To' });

    const orderMatch = {
      dateSold: { $gte: fromDate, $lte: toDate },
    };
    if (sellerObjectId) orderMatch.seller = sellerObjectId;
    if (marketplaceValue) {
      orderMatch.purchaseMarketplaceId = marketplaceValue === 'EBAY_ENCA' ? 'EBAY_CA' : marketplaceValue;
    }
    const orderAndConditions = [];
    if (excludeClient === 'true') {
      const excludedSellerIds = await getExcludedClientSellerIds();
      if (excludedSellerIds.length > 0) {
        orderAndConditions.push({ seller: { $nin: excludedSellerIds } });
      }
    }
    if (excludeLowValue === 'true') {
      orderAndConditions.push({
        $or: [
          { subtotalUSD: { $gte: 3 } },
          { subtotal: { $gte: 3 } },
        ],
      });
    }
    if (orderAndConditions.length > 0) {
      orderMatch.$and = orderAndConditions;
    }

    const skuSetExpression = {
      $setUnion: [
        {
          $cond: [
            { $and: [{ $ne: ['$sku', null] }, { $ne: ['$sku', ''] }] },
            [{ $toString: '$sku' }],
            [],
          ],
        },
        {
          $map: {
            input: { $ifNull: ['$lineItems', []] },
            as: 'item',
            in: {
              $toString: {
                $ifNull: [
                  '$$item.sku',
                  { $ifNull: ['$$item.SKU', { $ifNull: ['$$item.sellerSku', ''] }] },
                ],
              },
            },
          },
        },
      ],
    };

    const orderPipeline = [
      { $match: orderMatch },
      {
        $project: {
          orderId: 1,
          seller: 1,
          dateSold: 1,
          creationDate: 1,
          purchaseMarketplaceId: 1,
          productName: 1,
          subtotal: 1,
          subtotalUSD: 1,
          profit: 1,
          quantity: 1,
          skuCandidates: skuSetExpression,
        },
      },
      { $unwind: '$skuCandidates' },
      { $set: { sku: { $trim: { input: { $toString: { $ifNull: ['$skuCandidates', ''] } } } } } },
      { $match: { sku: { $regex: /\S/ } } },
      { $match: { sku: { $nin: ['null', 'undefined'] } } },
    ];

    if (trimmedSearch) {
      const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      orderPipeline.push({
        $match: {
          $or: [
            { sku: searchRegex },
            { productName: searchRegex },
            { orderId: searchRegex },
          ],
        },
      });
    }

    const groupedOrderStages = [
      { $sort: { dateSold: -1, creationDate: -1, _id: -1 } },
      {
        $group: {
          _id: '$sku',
          orderCount: { $sum: 1 },
          totalSubtotal: { $sum: { $ifNull: ['$subtotal', 0] } },
          totalProfit: { $sum: { $ifNull: ['$profit', 0] } },
          lastOrderDate: { $max: '$dateSold' },
          orders: {
            $push: {
              orderId: '$orderId',
              sku: '$sku',
              seller: '$seller',
              dateSold: '$dateSold',
              creationDate: '$creationDate',
              purchaseMarketplaceId: '$purchaseMarketplaceId',
              productName: '$productName',
              subtotal: '$subtotal',
              subtotalUSD: '$subtotalUSD',
              profit: '$profit',
              quantity: '$quantity',
            },
          },
        },
      },
    ];

    const [aggregationResult = {}] = await Order.aggregate([
      { $match: orderMatch },
      {
        $facet: {
          rawSummary: [
            { $count: 'totalFilteredOrders' },
          ],
          rows: [
            ...orderPipeline.slice(1),
            ...groupedOrderStages,
            { $sort: { lastOrderDate: -1, _id: 1 } },
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum },
            {
              $project: {
                orderCount: 1,
                totalSubtotal: 1,
                totalProfit: 1,
                lastOrderDate: 1,
                orders: 1,
              },
            },
          ],
          summary: [
            ...orderPipeline.slice(1),
            ...groupedOrderStages,
            {
              $group: {
                _id: null,
                totalSkus: { $sum: 1 },
                totalOrders: { $sum: '$orderCount' },
              },
            },
          ],
        },
      },
    ])
      .option({ allowDiskUse: true, maxTimeMS: 60000 });

    const pageOrderRows = aggregationResult.rows || [];
    const summary = aggregationResult.summary?.[0] || {};
    const rawSummary = aggregationResult.rawSummary?.[0] || {};
    const total = summary.totalSkus || 0;
    const totalOrders = summary.totalOrders || 0;
    const totalFilteredOrders = rawSummary.totalFilteredOrders || 0;
    const pages = total > 0 ? Math.ceil(total / limitNum) : 0;
    const hasNextPage = pageNum < pages;
    const skus = pageOrderRows.map(row => row._id).filter(Boolean);

    const listings = skus.length > 0
      ? await TemplateListing.find({
          deletedAt: null,
          customLabel: { $in: skus },
        })
          .select('_id customLabel sellerId templateId title startPrice createdAt amazonLink +_asinReference')
          .sort({ customLabel: 1, sellerId: 1, _id: 1 })
          .lean()
      : [];

    const listingsBySku = new Map();
    const skuIndexPairs = [];
    listings.forEach((listing) => {
      const sku = String(listing.customLabel || '').trim();
      if (!sku) return;
      if (!listingsBySku.has(sku)) listingsBySku.set(sku, []);
      listingsBySku.get(sku).push(listing);
      if (listing.sellerId) {
        skuIndexPairs.push({
          seller: listing.sellerId,
          sku,
        });
      }
    });

    const skuIndexOr = skuIndexPairs
      .filter(pair => pair.seller && pair.sku)
      .map(pair => ({
        seller: pair.seller,
        sku: pair.sku,
      }));
    const skuIndexRecords = skuIndexOr.length > 0
      ? await SellerSkuIndex.find({ $or: skuIndexOr })
          .select('seller baseSku sku itemId syncedAt title')
          .lean()
      : [];
    const skuIndexBySellerAndSku = new Map();
    const skuIndexBySku = new Map();
    skuIndexRecords.forEach((record) => {
      const value = String(record.sku || '').trim();
      if (!value) return;
      const key = `${String(record.seller)}::${value}`;
      if (!skuIndexBySellerAndSku.has(key)) skuIndexBySellerAndSku.set(key, []);
      skuIndexBySellerAndSku.get(key).push(record);
    });
    const skuLookupValues = [...new Set(skus.map(sku => String(sku || '').trim()).filter(Boolean))];
    const allSkuIndexRecords = skuLookupValues.length > 0
      ? await SellerSkuIndex.find({
          sku: { $in: skuLookupValues },
        })
          .select('seller baseSku sku itemId syncedAt title')
          .lean()
      : [];
    allSkuIndexRecords.forEach((record) => {
      const value = String(record.sku || '').trim();
      if (!value) return;
      if (!skuIndexBySku.has(value)) skuIndexBySku.set(value, []);
      skuIndexBySku.get(value).push(record);
    });

    const sellerIdsFromListings = [
      ...new Set(listings.map(listing => String(listing.sellerId)).filter(Boolean)),
    ];
    const sellerIdsFromOrders = [
      ...new Set(pageOrderRows.flatMap(row => (row.orders || []).map(order => String(order.seller)).filter(Boolean))),
    ];
    const sellerIdsFromSkuIndex = [
      ...new Set(allSkuIndexRecords.map(record => String(record.seller)).filter(Boolean)),
    ];
    const allSellerIds = [...new Set([...sellerIdsFromListings, ...sellerIdsFromOrders, ...sellerIdsFromSkuIndex])];
    const sellerDocs = allSellerIds.length > 0
      ? await Seller.find({ _id: { $in: allSellerIds } }).populate('user', 'username email').lean()
      : [];
    const sellerNameById = new Map(sellerDocs.map(seller => [
      String(seller._id),
      seller.user?.username || seller.user?.email || String(seller._id),
    ]));

    const templateIds = [
      ...new Set(listings.map(listing => String(listing.templateId)).filter(Boolean)),
    ];
    const templateDocs = templateIds.length > 0
      ? await ListingTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
      : [];
    const templateNameById = new Map(templateDocs.map(template => [String(template._id), template.name || 'Template']));

    const formattedRows = pageOrderRows.map((orderRow) => {
      const rowListings = listingsBySku.get(orderRow._id) || [];
      const sellerIds = new Set(rowListings.map(listing => String(listing.sellerId)).filter(Boolean));
      const skuIndexRows = skuIndexBySku.get(String(orderRow._id || '').trim()) || [];
      const skuIndexSellerIds = new Set(skuIndexRows.map(record => String(record.seller)).filter(Boolean));
      let minTemplatePrice = null;
      let maxTemplatePrice = null;
      let priceTotal = 0;
      let priceCount = 0;

      rowListings.forEach((listing) => {
        const price = Number(listing.startPrice);
        if (Number.isFinite(price)) {
          minTemplatePrice = minTemplatePrice == null ? price : Math.min(minTemplatePrice, price);
          maxTemplatePrice = maxTemplatePrice == null ? price : Math.max(maxTemplatePrice, price);
          priceTotal += price;
          priceCount += 1;
        }
      });

      return {
        sku: orderRow._id,
        listingCount: rowListings.length,
        sellerCount: sellerIds.size,
        skuIndexCount: skuIndexRows.length,
        skuIndexSellerCount: skuIndexSellerIds.size,
        minTemplatePrice: normalizeMoney(minTemplatePrice),
        maxTemplatePrice: normalizeMoney(maxTemplatePrice),
        avgTemplatePrice: normalizeMoney(priceCount > 0 ? priceTotal / priceCount : null),
        orderCount: orderRow.orderCount || 0,
        totalSubtotal: normalizeMoney(orderRow.totalSubtotal || 0),
        totalProfit: normalizeMoney(orderRow.totalProfit || 0),
        listings: rowListings.map(listing => ({
          id: listing._id,
          sellerId: listing.sellerId,
          sellerName: sellerNameById.get(String(listing.sellerId)) || String(listing.sellerId || ''),
          templateId: listing.templateId,
          templateName: templateNameById.get(String(listing.templateId)) || 'Template',
          title: listing.title || '',
          startPrice: normalizeMoney(listing.startPrice),
          createdAt: listing.createdAt,
          asin: listing._asinReference || '',
          amazonLink: listing.amazonLink || (listing._asinReference ? `https://www.amazon.com/dp/${listing._asinReference}` : ''),
          skuSyncIndex: (() => {
            const records = skuIndexBySellerAndSku.get(`${String(listing.sellerId)}::${String(listing.customLabel || '').trim()}`) || [];
            return {
              present: records.length > 0,
              count: records.length,
              itemIds: records.map(record => record.itemId).filter(Boolean),
              syncedAt: records[0]?.syncedAt || null,
            };
          })(),
        })).sort((a, b) => a.sellerName.localeCompare(b.sellerName)),
        orders: (orderRow.orders || []).map(order => ({
          orderId: order.orderId,
          sku: order.sku || orderRow._id,
          sellerName: sellerNameById.get(String(order.seller)) || String(order.seller || ''),
          marketplace: order.purchaseMarketplaceId || '',
          dateSold: order.dateSold || order.creationDate || null,
          productName: order.productName || '',
          subtotal: normalizeMoney(order.subtotal),
          subtotalUSD: normalizeMoney(order.subtotalUSD),
          profit: normalizeMoney(order.profit),
          quantity: order.quantity || 0,
        })),
        syncRecords: skuIndexRows
          .map(record => ({
            id: record._id,
            sellerId: record.seller,
            sellerName: sellerNameById.get(String(record.seller)) || String(record.seller || ''),
            itemId: record.itemId || '',
            sku: record.sku || '',
            baseSku: record.baseSku || '',
            syncedAt: record.syncedAt || null,
            title: record.title || '',
          }))
          .sort((a, b) => a.sellerName.localeCompare(b.sellerName) || String(a.itemId).localeCompare(String(b.itemId))),
      };
    });

    return res.json({
      rows: formattedRows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        totalOrders,
        totalFilteredOrders,
        ordersWithoutUsableSku: Math.max(0, totalFilteredOrders - totalOrders),
        hasNextPage,
        scannedListings: null,
        source: 'orders',
      },
    });
  } catch (err) {
    console.error('[SKU Seller Order Profit] Error:', err);
    res.status(500).json({ error: 'Failed to fetch SKU seller order profit report' });
  }
});

router.get('/sku-seller-order-profit-listing-driven', requireAuth, requirePageAccess('SkuSellerOrderProfit'), async (req, res) => {
  try {
    const {
      search = '',
      sellerId = '',
      page = 1,
      limit = 25,
      ordersPerSku = 5,
      createdFrom = '',
      createdTo = '',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const ordersLimit = Math.min(25, Math.max(1, parseInt(ordersPerSku, 10) || 5));
    const sellerObjectId = sellerId && sellerId !== 'all' ? toObjectId(sellerId) : null;
    const trimmedSearch = String(search || '').trim();
    const createdAtRange = {};
    if (createdFrom) {
      const fromDate = new Date(`${createdFrom}T00:00:00.000Z`);
      if (Number.isNaN(fromDate.getTime())) return res.status(400).json({ error: 'Invalid createdFrom date' });
      createdAtRange.$gte = fromDate;
    }
    if (createdTo) {
      const toDate = new Date(`${createdTo}T23:59:59.999Z`);
      if (Number.isNaN(toDate.getTime())) return res.status(400).json({ error: 'Invalid createdTo date' });
      createdAtRange.$lte = toDate;
    }
    if (createdAtRange.$gte && createdAtRange.$lte && createdAtRange.$gte > createdAtRange.$lte) {
      return res.status(400).json({ error: 'Created From must be before Created To' });
    }

    if (sellerId && sellerId !== 'all' && !sellerObjectId) {
      return res.status(400).json({ error: 'Invalid sellerId' });
    }

    const listingQuery = {
      deletedAt: null,
      customLabel: { $nin: [null, ''] },
    };
    if (Object.keys(createdAtRange).length > 0) {
      listingQuery.createdAt = createdAtRange;
    }
    if (trimmedSearch) {
      listingQuery.$or = [
        { customLabel: { $regex: trimmedSearch, $options: 'i' } },
        { title: { $regex: trimmedSearch, $options: 'i' } },
      ];
    }

    const targetCount = pageNum * limitNum + 1;
    const groupedRows = [];
    let currentSku = null;
    let currentGroup = null;
    let scannedListings = 0;

    const pushGroupIfMatch = (group) => {
      if (!group) return;
      const sellerIds = [...group.sellerIds];
      if (sellerIds.length <= 1) return;
      if (sellerObjectId && !group.sellerIds.has(String(sellerObjectId))) return;
      groupedRows.push({
        sku: group.sku,
        listingCount: group.listingCount,
        sellerIds,
        minTemplatePrice: group.minTemplatePrice,
        maxTemplatePrice: group.maxTemplatePrice,
        avgTemplatePrice: group.priceCount > 0 ? group.priceTotal / group.priceCount : null,
        listings: group.listings,
      });
    };

    if (sellerObjectId) {
      const neededRows = pageNum * limitNum + 1;
      const pageRows = [];
      const candidateBatch = [];
      const seenCandidateSkus = new Set();
      let skippedMatches = 0;
      let scannedListings = 0;
      let lastSellerSku = null;
      let hasNextPage = false;

      const buildGroupFromListings = (sku, listings) => {
        const sellerIds = new Set();
        let minTemplatePrice = null;
        let maxTemplatePrice = null;
        let priceTotal = 0;
        let priceCount = 0;

        listings.forEach((listing) => {
          if (listing.sellerId) sellerIds.add(String(listing.sellerId));
          const price = Number(listing.startPrice);
          if (Number.isFinite(price)) {
            minTemplatePrice = minTemplatePrice == null ? price : Math.min(minTemplatePrice, price);
            maxTemplatePrice = maxTemplatePrice == null ? price : Math.max(maxTemplatePrice, price);
            priceTotal += price;
            priceCount += 1;
          }
        });

        return {
          sku,
          listingCount: listings.length,
          sellerIds: [...sellerIds],
          minTemplatePrice,
          maxTemplatePrice,
          avgTemplatePrice: priceCount > 0 ? priceTotal / priceCount : null,
          listings: listings.map(listing => ({
            id: listing._id,
            sellerId: listing.sellerId,
            templateId: listing.templateId,
            title: listing.title,
            startPrice: listing.startPrice,
            status: listing.status,
            createdAt: listing.createdAt,
          })),
        };
      };

      const flushCandidates = async () => {
        if (candidateBatch.length === 0 || pageRows.length >= neededRows) return;
        const skusToCheck = candidateBatch.splice(0, candidateBatch.length);
        const listings = await TemplateListing.find({
          deletedAt: null,
          customLabel: { $in: skusToCheck },
          ...(Object.keys(createdAtRange).length > 0 ? { createdAt: createdAtRange } : {}),
        })
          .select('_id customLabel sellerId templateId title startPrice status createdAt')
          .sort({ customLabel: 1, sellerId: 1, _id: 1 })
          .lean();

        const bySku = new Map();
        listings.forEach((listing) => {
          const sku = String(listing.customLabel || '').trim();
          if (!sku) return;
          if (!bySku.has(sku)) bySku.set(sku, []);
          bySku.get(sku).push(listing);
        });

        for (const sku of skusToCheck) {
          const groupListings = bySku.get(sku) || [];
          const sellerIds = new Set(groupListings.map(listing => String(listing.sellerId)).filter(Boolean));
          if (sellerIds.size <= 1 || !sellerIds.has(String(sellerObjectId))) continue;

          if (skippedMatches < (pageNum - 1) * limitNum) {
            skippedMatches += 1;
            continue;
          }

          pageRows.push(buildGroupFromListings(sku, groupListings));
          if (pageRows.length >= neededRows) {
            hasNextPage = true;
            break;
          }
        }
      };

      const sellerCursor = TemplateListing.find({
        ...listingQuery,
        sellerId: sellerObjectId,
      })
        .select('customLabel')
        .sort({ customLabel: 1, _id: 1 })
        .lean()
        .cursor({ batchSize: 1000 });

      try {
        for await (const listing of sellerCursor) {
          scannedListings += 1;
          const sku = String(listing.customLabel || '').trim();
          if (!sku || sku === lastSellerSku || seenCandidateSkus.has(sku)) continue;
          lastSellerSku = sku;
          seenCandidateSkus.add(sku);
          candidateBatch.push(sku);

          if (candidateBatch.length >= 100) {
            await flushCandidates();
            if (pageRows.length >= neededRows) break;
          }
        }
        await flushCandidates();
      } finally {
        await sellerCursor.close();
      }

      const responseRows = pageRows.slice(0, limitNum);
      const skus = responseRows.map(row => row.sku);
      const orderRows = skus.length > 0
        ? await Order.aggregate([
            {
              $match: {
                $or: [
                  { sku: { $in: skus } },
                  { 'lineItems.sku': { $in: skus } },
                  { 'lineItems.SKU': { $in: skus } },
                  { 'lineItems.sellerSku': { $in: skus } },
                ],
              },
            },
            {
              $addFields: {
                matchedSku: {
                  $let: {
                    vars: {
                      matchedLineItem: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $ifNull: ['$lineItems', []] },
                              as: 'item',
                              cond: {
                                $in: [
                                  { $ifNull: ['$$item.sku', { $ifNull: ['$$item.SKU', '$$item.sellerSku'] }] },
                                  skus,
                                ],
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      $ifNull: [
                        '$sku',
                        { $ifNull: ['$$matchedLineItem.sku', { $ifNull: ['$$matchedLineItem.SKU', '$$matchedLineItem.sellerSku'] }] },
                      ],
                    },
                  },
                },
              },
            },
            { $match: { matchedSku: { $in: skus } } },
            { $sort: { dateSold: -1, creationDate: -1, createdAt: -1 } },
            {
              $group: {
                _id: '$matchedSku',
                orderCount: { $sum: 1 },
                totalSubtotal: { $sum: { $ifNull: ['$subtotal', 0] } },
                totalProfit: { $sum: { $ifNull: ['$profit', 0] } },
                orders: {
                  $push: {
                    orderId: '$orderId',
                    seller: '$seller',
                    dateSold: '$dateSold',
                    creationDate: '$creationDate',
                    productName: '$productName',
                    subtotal: '$subtotal',
                    subtotalUSD: '$subtotalUSD',
                    profit: '$profit',
                    quantity: '$quantity',
                  },
                },
              },
            },
            { $project: { orderCount: 1, totalSubtotal: 1, totalProfit: 1, orders: { $slice: ['$orders', ordersLimit] } } },
          ]).allowDiskUse(true)
        : [];

      const sellerIdsFromListings = [
        ...new Set(responseRows.flatMap(row => row.sellerIds).filter(Boolean)),
      ];
      const sellerIdsFromOrders = [
        ...new Set(orderRows.flatMap(row => (row.orders || []).map(order => String(order.seller)).filter(Boolean))),
      ];
      const allSellerIds = [...new Set([...sellerIdsFromListings, ...sellerIdsFromOrders])];
      const sellerDocs = allSellerIds.length > 0
        ? await Seller.find({ _id: { $in: allSellerIds } }).populate('user', 'username email').lean()
        : [];
      const sellerNameById = new Map(sellerDocs.map(seller => [
        String(seller._id),
        seller.user?.username || seller.user?.email || String(seller._id),
      ]));

      const templateIds = [
        ...new Set(responseRows.flatMap(row => row.listings.map(listing => String(listing.templateId)).filter(Boolean))),
      ];
      const templateDocs = templateIds.length > 0
        ? await ListingTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
        : [];
      const templateNameById = new Map(templateDocs.map(template => [String(template._id), template.name || 'Template']));
      const ordersBySku = new Map(orderRows.map(row => [row._id, row]));

      const formattedRows = responseRows.map((row) => {
        const orderSummary = ordersBySku.get(row.sku) || {};
        return {
          sku: row.sku,
          listingCount: row.listingCount,
          sellerCount: row.sellerIds.length,
          minTemplatePrice: normalizeMoney(row.minTemplatePrice),
          maxTemplatePrice: normalizeMoney(row.maxTemplatePrice),
          avgTemplatePrice: normalizeMoney(row.avgTemplatePrice),
          orderCount: orderSummary.orderCount || 0,
          totalSubtotal: normalizeMoney(orderSummary.totalSubtotal || 0),
          totalProfit: normalizeMoney(orderSummary.totalProfit || 0),
          listings: (row.listings || []).map(listing => ({
            id: listing.id,
            sellerId: listing.sellerId,
            sellerName: sellerNameById.get(String(listing.sellerId)) || String(listing.sellerId),
            templateId: listing.templateId,
            templateName: templateNameById.get(String(listing.templateId)) || 'Template',
            title: listing.title || '',
            startPrice: normalizeMoney(listing.startPrice),
            status: listing.status || '',
            createdAt: listing.createdAt,
          })).sort((a, b) => a.sellerName.localeCompare(b.sellerName)),
          orders: (orderSummary.orders || []).map(order => ({
            orderId: order.orderId,
            sellerName: sellerNameById.get(String(order.seller)) || String(order.seller || ''),
            dateSold: order.dateSold || order.creationDate || null,
            productName: order.productName || '',
            subtotal: normalizeMoney(order.subtotal),
            subtotalUSD: normalizeMoney(order.subtotalUSD),
            profit: normalizeMoney(order.profit),
            quantity: order.quantity || 0,
          })),
        };
      });

      return res.json({
        rows: formattedRows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: null,
          pages: null,
          hasNextPage,
          scannedListings,
        },
      });
    }

    if (Object.keys(createdAtRange).length > 0) {
      const aggregateRows = await TemplateListing.aggregate([
        { $match: listingQuery },
        {
          $group: {
            _id: '$customLabel',
            listingCount: { $sum: 1 },
            sellerIds: { $addToSet: '$sellerId' },
            minTemplatePrice: { $min: '$startPrice' },
            maxTemplatePrice: { $max: '$startPrice' },
            avgTemplatePrice: { $avg: '$startPrice' },
            listings: {
              $push: {
                id: '$_id',
                sellerId: '$sellerId',
                templateId: '$templateId',
                title: '$title',
                startPrice: '$startPrice',
                status: '$status',
                createdAt: '$createdAt',
              },
            },
          },
        },
        { $match: { $expr: { $gt: [{ $size: '$sellerIds' }, 1] } } },
        { $sort: { _id: 1 } },
        { $limit: targetCount },
      ])
        .option({
          allowDiskUse: true,
          maxTimeMS: 60000,
          hint: { deletedAt: 1, createdAt: -1, customLabel: 1, sellerId: 1 },
        });

      aggregateRows.forEach((row) => {
        groupedRows.push({
          sku: row._id,
          listingCount: row.listingCount,
          sellerIds: (row.sellerIds || []).map(id => String(id)),
          minTemplatePrice: row.minTemplatePrice,
          maxTemplatePrice: row.maxTemplatePrice,
          avgTemplatePrice: row.avgTemplatePrice,
          listings: row.listings || [],
        });
      });
      scannedListings = null;
    } else {
      const cursor = TemplateListing.find(listingQuery)
        .select('_id customLabel sellerId templateId title startPrice status createdAt')
        .sort({ customLabel: 1, sellerId: 1, _id: 1 })
        .lean()
        .cursor({ batchSize: 1000 });

      try {
        for await (const listing of cursor) {
          scannedListings += 1;
          const sku = String(listing.customLabel || '').trim();
          if (!sku) continue;

          if (currentSku !== sku) {
            pushGroupIfMatch(currentGroup);
            if (groupedRows.length >= targetCount) break;
            currentSku = sku;
            currentGroup = {
              sku,
              listingCount: 0,
              sellerIds: new Set(),
              minTemplatePrice: null,
              maxTemplatePrice: null,
              priceTotal: 0,
              priceCount: 0,
              listings: [],
            };
          }

          currentGroup.listingCount += 1;
          if (listing.sellerId) currentGroup.sellerIds.add(String(listing.sellerId));

          const price = Number(listing.startPrice);
          if (Number.isFinite(price)) {
            currentGroup.minTemplatePrice = currentGroup.minTemplatePrice == null ? price : Math.min(currentGroup.minTemplatePrice, price);
            currentGroup.maxTemplatePrice = currentGroup.maxTemplatePrice == null ? price : Math.max(currentGroup.maxTemplatePrice, price);
            currentGroup.priceTotal += price;
            currentGroup.priceCount += 1;
          }

          currentGroup.listings.push({
            id: listing._id,
            sellerId: listing.sellerId,
            templateId: listing.templateId,
            title: listing.title,
            startPrice: listing.startPrice,
            status: listing.status,
            createdAt: listing.createdAt,
          });
        }

        if (groupedRows.length < targetCount) {
          pushGroupIfMatch(currentGroup);
        }
      } finally {
        await cursor.close();
      }
    }

    const start = (pageNum - 1) * limitNum;
    const pageRows = groupedRows.slice(start, start + limitNum);
    const hasNextPage = groupedRows.length > start + limitNum;
    const skus = pageRows.map(row => row.sku);

    const orderRows = skus.length > 0
      ? await Order.aggregate([
          {
            $match: {
              $or: [
                { sku: { $in: skus } },
                { 'lineItems.sku': { $in: skus } },
                { 'lineItems.SKU': { $in: skus } },
                { 'lineItems.sellerSku': { $in: skus } },
              ],
            },
          },
          {
            $addFields: {
              matchedSku: {
                $let: {
                  vars: {
                    matchedLineItem: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ['$lineItems', []] },
                            as: 'item',
                            cond: {
                              $in: [
                                { $ifNull: ['$$item.sku', { $ifNull: ['$$item.SKU', '$$item.sellerSku'] }] },
                                skus,
                              ],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    $ifNull: [
                      '$sku',
                      { $ifNull: ['$$matchedLineItem.sku', { $ifNull: ['$$matchedLineItem.SKU', '$$matchedLineItem.sellerSku'] }] },
                    ],
                  },
                },
              },
            },
          },
          { $match: { matchedSku: { $in: skus } } },
          { $sort: { dateSold: -1, creationDate: -1, createdAt: -1 } },
          {
            $group: {
              _id: '$matchedSku',
              orderCount: { $sum: 1 },
              totalSubtotal: { $sum: { $ifNull: ['$subtotal', 0] } },
              totalProfit: { $sum: { $ifNull: ['$profit', 0] } },
              orders: {
                $push: {
                  orderId: '$orderId',
                  seller: '$seller',
                  dateSold: '$dateSold',
                  creationDate: '$creationDate',
                  productName: '$productName',
                  subtotal: '$subtotal',
                  subtotalUSD: '$subtotalUSD',
                  profit: '$profit',
                  quantity: '$quantity',
                },
              },
            },
          },
          { $project: { orderCount: 1, totalSubtotal: 1, totalProfit: 1, orders: { $slice: ['$orders', ordersLimit] } } },
        ]).allowDiskUse(true)
      : [];

    const sellerIdsFromListings = [
      ...new Set(pageRows.flatMap(row => row.sellerIds).filter(Boolean)),
    ];
    const sellerIdsFromOrders = [
      ...new Set(orderRows.flatMap(row => (row.orders || []).map(order => String(order.seller)).filter(Boolean))),
    ];
    const allSellerIds = [...new Set([...sellerIdsFromListings, ...sellerIdsFromOrders])];
    const sellerDocs = allSellerIds.length > 0
      ? await Seller.find({ _id: { $in: allSellerIds } }).populate('user', 'username email').lean()
      : [];
    const sellerNameById = new Map(sellerDocs.map(seller => [
      String(seller._id),
      seller.user?.username || seller.user?.email || String(seller._id),
    ]));

    const templateIds = [
      ...new Set(pageRows.flatMap(row => row.listings.map(listing => String(listing.templateId)).filter(Boolean))),
    ];
    const templateDocs = templateIds.length > 0
      ? await ListingTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
      : [];
    const templateNameById = new Map(templateDocs.map(template => [String(template._id), template.name || 'Template']));
    const ordersBySku = new Map(orderRows.map(row => [row._id, row]));

    const formattedRows = pageRows.map((row) => {
      const orderSummary = ordersBySku.get(row.sku) || {};

      return {
        sku: row.sku,
        listingCount: row.listingCount,
        sellerCount: row.sellerIds.length,
        minTemplatePrice: normalizeMoney(row.minTemplatePrice),
        maxTemplatePrice: normalizeMoney(row.maxTemplatePrice),
        avgTemplatePrice: normalizeMoney(row.avgTemplatePrice),
        orderCount: orderSummary.orderCount || 0,
        totalSubtotal: normalizeMoney(orderSummary.totalSubtotal || 0),
        totalProfit: normalizeMoney(orderSummary.totalProfit || 0),
        listings: (row.listings || []).map(listing => ({
          id: listing.id,
          sellerId: listing.sellerId,
          sellerName: sellerNameById.get(String(listing.sellerId)) || String(listing.sellerId),
          templateId: listing.templateId,
          templateName: templateNameById.get(String(listing.templateId)) || 'Template',
          title: listing.title || '',
          startPrice: normalizeMoney(listing.startPrice),
          status: listing.status || '',
          createdAt: listing.createdAt,
        })).sort((a, b) => a.sellerName.localeCompare(b.sellerName)),
        orders: (orderSummary.orders || []).map(order => ({
          orderId: order.orderId,
          sellerName: sellerNameById.get(String(order.seller)) || String(order.seller || ''),
          dateSold: order.dateSold || order.creationDate || null,
          productName: order.productName || '',
          subtotal: normalizeMoney(order.subtotal),
          subtotalUSD: normalizeMoney(order.subtotalUSD),
          profit: normalizeMoney(order.profit),
          quantity: order.quantity || 0,
        })),
      };
    });

    res.json({
      rows: formattedRows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: null,
        pages: null,
        hasNextPage,
        scannedListings,
      },
    });
  } catch (err) {
    console.error('[SKU Seller Order Profit] Error:', err);
    res.status(500).json({ error: 'Failed to fetch SKU seller order profit report' });
  }
});

router.get('/sku-seller-order-profit-full-scan', requireAuth, requirePageAccess('SkuSellerOrderProfit'), async (req, res) => {
  try {
    const {
      search = '',
      sellerId = '',
      page = 1,
      limit = 25,
      ordersPerSku = 5,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const ordersLimit = Math.min(25, Math.max(1, parseInt(ordersPerSku, 10) || 5));
    const sellerObjectId = sellerId && sellerId !== 'all' ? toObjectId(sellerId) : null;
    const trimmedSearch = String(search || '').trim();

    if (sellerId && sellerId !== 'all' && !sellerObjectId) {
      return res.status(400).json({ error: 'Invalid sellerId' });
    }

    const matchStage = {
      deletedAt: null,
      customLabel: { $nin: [null, ''] },
    };
    if (trimmedSearch) {
      matchStage.$or = [
        { customLabel: { $regex: trimmedSearch, $options: 'i' } },
        { title: { $regex: trimmedSearch, $options: 'i' } },
      ];
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$customLabel',
          listingCount: { $sum: 1 },
          sellerIds: { $addToSet: '$sellerId' },
          minTemplatePrice: { $min: '$startPrice' },
          maxTemplatePrice: { $max: '$startPrice' },
          avgTemplatePrice: { $avg: '$startPrice' },
          listings: {
            $push: {
              id: '$_id',
              sellerId: '$sellerId',
              templateId: '$templateId',
              title: '$title',
              startPrice: '$startPrice',
              status: '$status',
              createdAt: '$createdAt',
            },
          },
        },
      },
      {
        $match: {
          $expr: { $gt: [{ $size: '$sellerIds' }, 1] },
          ...(sellerObjectId ? { sellerIds: sellerObjectId } : {}),
        },
      },
      { $sort: { listingCount: -1, _id: 1 } },
      {
        $facet: {
          rows: [
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum },
            {
              $lookup: {
                from: 'sellers',
                localField: 'sellerIds',
                foreignField: '_id',
                as: 'sellerDocs',
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: 'sellerDocs.user',
                foreignField: '_id',
                as: 'sellerUsers',
              },
            },
            {
              $lookup: {
                from: 'listingtemplates',
                localField: 'listings.templateId',
                foreignField: '_id',
                as: 'templateDocs',
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await TemplateListing.aggregate(pipeline).allowDiskUse(true);
    const rows = result?.rows || [];
    const total = result?.total?.[0]?.count || 0;
    const skus = rows.map(row => row._id);

    const orderRows = skus.length > 0
      ? await Order.aggregate([
          {
            $match: {
              $or: [
                { sku: { $in: skus } },
                { 'lineItems.sku': { $in: skus } },
                { 'lineItems.SKU': { $in: skus } },
                { 'lineItems.sellerSku': { $in: skus } },
              ],
            },
          },
          {
            $addFields: {
              matchedSku: {
                $let: {
                  vars: {
                    matchedLineItem: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ['$lineItems', []] },
                            as: 'item',
                            cond: {
                              $in: [
                                { $ifNull: ['$$item.sku', { $ifNull: ['$$item.SKU', '$$item.sellerSku'] }] },
                                skus,
                              ],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    $ifNull: [
                      '$sku',
                      { $ifNull: ['$$matchedLineItem.sku', { $ifNull: ['$$matchedLineItem.SKU', '$$matchedLineItem.sellerSku'] }] },
                    ],
                  },
                },
              },
            },
          },
          { $match: { matchedSku: { $in: skus } } },
          { $sort: { dateSold: -1, creationDate: -1, createdAt: -1 } },
          {
            $group: {
              _id: '$matchedSku',
              orderCount: { $sum: 1 },
              totalSubtotal: { $sum: { $ifNull: ['$subtotal', 0] } },
              totalProfit: { $sum: { $ifNull: ['$profit', 0] } },
              orders: {
                $push: {
                  orderId: '$orderId',
                  seller: '$seller',
                  dateSold: '$dateSold',
                  creationDate: '$creationDate',
                  productName: '$productName',
                  subtotal: '$subtotal',
                  subtotalUSD: '$subtotalUSD',
                  profit: '$profit',
                  quantity: '$quantity',
                },
              },
            },
          },
          { $project: { orderCount: 1, totalSubtotal: 1, totalProfit: 1, orders: { $slice: ['$orders', ordersLimit] } } },
        ]).allowDiskUse(true)
      : [];

    const sellerIdsFromOrders = [
      ...new Set(orderRows.flatMap(row => (row.orders || []).map(order => String(order.seller)).filter(Boolean))),
    ];
    const orderSellers = sellerIdsFromOrders.length > 0
      ? await Seller.find({ _id: { $in: sellerIdsFromOrders } }).populate('user', 'username email').lean()
      : [];
    const orderSellerNameById = new Map(orderSellers.map(seller => [
      String(seller._id),
      seller.user?.username || seller.user?.email || String(seller._id),
    ]));
    const ordersBySku = new Map(orderRows.map(row => [row._id, row]));

    const formattedRows = rows.map((row) => {
      const sellerUserById = new Map((row.sellerUsers || []).map(user => [String(user._id), user]));
      const sellerNameById = new Map((row.sellerDocs || []).map((seller) => {
        const user = sellerUserById.get(String(seller.user));
        return [String(seller._id), user?.username || user?.email || String(seller._id)];
      }));
      const templateNameById = new Map((row.templateDocs || []).map(template => [String(template._id), template.name || 'Template']));
      const orderSummary = ordersBySku.get(row._id) || {};

      return {
        sku: row._id,
        listingCount: row.listingCount,
        sellerCount: row.sellerIds.length,
        minTemplatePrice: normalizeMoney(row.minTemplatePrice),
        maxTemplatePrice: normalizeMoney(row.maxTemplatePrice),
        avgTemplatePrice: normalizeMoney(row.avgTemplatePrice),
        orderCount: orderSummary.orderCount || 0,
        totalSubtotal: normalizeMoney(orderSummary.totalSubtotal || 0),
        totalProfit: normalizeMoney(orderSummary.totalProfit || 0),
        listings: (row.listings || []).map(listing => ({
          id: listing.id,
          sellerId: listing.sellerId,
          sellerName: sellerNameById.get(String(listing.sellerId)) || String(listing.sellerId),
          templateId: listing.templateId,
          templateName: templateNameById.get(String(listing.templateId)) || 'Template',
          title: listing.title || '',
          startPrice: normalizeMoney(listing.startPrice),
          status: listing.status || '',
          createdAt: listing.createdAt,
        })).sort((a, b) => a.sellerName.localeCompare(b.sellerName)),
        orders: (orderSummary.orders || []).map(order => ({
          orderId: order.orderId,
          sellerName: orderSellerNameById.get(String(order.seller)) || String(order.seller || ''),
          dateSold: order.dateSold || order.creationDate || null,
          productName: order.productName || '',
          subtotal: normalizeMoney(order.subtotal),
          subtotalUSD: normalizeMoney(order.subtotalUSD),
          profit: normalizeMoney(order.profit),
          quantity: order.quantity || 0,
        })),
      };
    });

    res.json({
      rows: formattedRows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[SKU Seller Order Profit] Error:', err);
    res.status(500).json({ error: 'Failed to fetch SKU seller order profit report' });
  }
});

export default router;
