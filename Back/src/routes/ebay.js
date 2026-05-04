import express from 'express';
import axios from 'axios';
import qs from 'qs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import moment from 'moment-timezone';
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import sharp from 'sharp';
import FormData from 'form-data';
import { requireAuth, requirePageAccess, requireRole } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import BankAccount from '../models/BankAccount.js';
import Order from '../models/Order.js';
import Return from '../models/Return.js';
import Case from '../models/Case.js';
import PaymentDispute from '../models/PaymentDispute.js';
import Message from '../models/Message.js';
import Listing from '../models/Listing.js';
import ActiveListing from '../models/ActiveListing.js';
import FitmentCache from '../models/FitmentCache.js';
import ConversationMeta from '../models/ConversationMeta.js';
import ChatAgent from '../models/ChatAgent.js';
import { parseStringPromise } from 'xml2js';
import imageCache from '../lib/imageCache.js';
import multer from 'multer';
import FeedUpload from '../models/FeedUpload.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import UserDailyQuantity from '../models/UserDailyQuantity.js';
import CompatibilityBatchLog from '../models/CompatibilityBatchLog.js';
import User from '../models/User.js';
import ItemCategoryMap from '../models/ItemCategoryMap.js';
import AutoCompatibilityBatch from '../models/AutoCompatibilityBatch.js';
import AutoCompatibilityBatchItem from '../models/AutoCompatibilityBatchItem.js';
import AsinListCategory from '../models/AsinListCategory.js';
import AsinListRange from '../models/AsinListRange.js';
import AsinListProduct from '../models/AsinListProduct.js';
import PriceChangeLog from '../models/PriceChangeLog.js';
import OpenAI from 'openai';
import {
  calculateOrderAmazonFinancials,
  calculateOrderEbayFinancials,
  getExchangeRateDefaultValue,
  getExchangeRateMarketplace,
  getExchangeRateRecordForDate,
  getOrderTotalAmount
} from '../utils/exchangeRateUtils.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
const activeAutoCompatBatchRuns = new Set();

function normalizeOAuthStateToken(state) {
  if (!state) return '';
  let token = String(state);
  // eBay may URL-encode the state; Express already decodes once, but some flows double-encode.
  for (let i = 0; i < 3; i++) {
    const next = decodeURIComponent(token);
    if (next === token) break;
    token = next;
  }
  return token;
}

let ebayRedirectUriHintLogged = false;

function getEbayOAuthRedirectUri() {
  const override = (process.env.EBAY_OAUTH_REDIRECT_URI || '').trim();
  const ru = (process.env.EBAY_RU_NAME || '').trim();

  // eBay expects the OAuth query/body parameter `redirect_uri` to be the RuName string from
  // developer.ebay.com → Keys → User Tokens (not your http(s) callback URL). The RuName’s
  // “Your auth accepted URL” in the portal is where the browser is sent; token exchange still
  // uses the RuName. Sending http://localhost/... here causes invalid_request on /oauth2/token.
  if (ru && !/^https?:\/\//i.test(ru)) return ru;

  if (/^https?:\/\//i.test(ru)) return ru;

  if (/^https?:\/\//i.test(override)) {
    if (!ebayRedirectUriHintLogged) {
      ebayRedirectUriHintLogged = true;
      console.warn(
        '[eBay OAuth] Using EBAY_OAUTH_REDIRECT_URI as redirect_uri. If token exchange fails with invalid_request,',
        'remove it and set EBAY_RU_NAME to your RuName from eBay User Tokens instead.'
      );
    }
    return override;
  }

  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    const host = (process.env.PUBLIC_API_HOST || 'localhost').replace(/\/$/, '');
    const derived = `http://${host}:${port}/api/ebay/callback`;
    if (!ebayRedirectUriHintLogged) {
      ebayRedirectUriHintLogged = true;
      console.warn(
        '[eBay OAuth] No EBAY_RU_NAME set; using dev redirect_uri:',
        derived,
        '\n  Prefer EBAY_RU_NAME=<RuName> from eBay → User Tokens (see eBay OAuth docs).'
      );
    }
    return derived;
  }

  return ru || override;
}

function normalizeEbayOAuthCode(code) {
  let c = String(code || '').trim();
  if (!c) return '';
  // If the user pasted a URL-encoded code, normalize it once.
  if (c.includes('%')) {
    try {
      const decoded = decodeURIComponent(c);
      if (decoded) c = decoded;
    } catch {
      // ignore
    }
  }
  return c;
}

// Identifies which server instance owns/resumes batches.
// Set RUNNER_ID=render in Render's env vars, leave unset (defaults to 'local') locally.
const RUNNER_ID = process.env.RUNNER_ID || 'local';

const EBAY_MAX_GET_SELLER_LIST_RANGE_DAYS = 120;
/** Fulfillment getOrders: practical backfill window for first sync (days). */
const EBAY_ORDER_INITIAL_LOOKBACK_DAYS = (() => {
  const n = parseInt(process.env.EBAY_ORDER_INITIAL_LOOKBACK_DAYS || '90', 10);
  if (!Number.isFinite(n)) return 90;
  return Math.min(90, Math.max(1, n));
})();

function getDefaultNewSellerSyncStart() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - EBAY_MAX_GET_SELLER_LIST_RANGE_DAYS);
  return d;
}

function getEffectiveInitialSyncDate(initialSyncDate) {
  const rollingDefault = getDefaultNewSellerSyncStart();
  if (!initialSyncDate) return rollingDefault;

  const configuredStart = new Date(initialSyncDate);
  if (Number.isNaN(configuredStart.getTime())) return rollingDefault;
  // Respect seller-configured backfill; range is still clamped to eBay max (120d) per request.
  return configuredStart;
}

function getClampedSellerListStart(startTimeFrom, startTimeTo) {
  const requestedStart = new Date(startTimeFrom);
  const maxRangeStart = new Date(startTimeTo);
  maxRangeStart.setUTCDate(maxRangeStart.getUTCDate() - EBAY_MAX_GET_SELLER_LIST_RANGE_DAYS);

  return requestedStart < maxRangeStart ? maxRangeStart : requestedStart;
}

const EXCLUDED_CLIENT_USERNAME = 'Vergo';

async function getExcludedClientSellerIds() {
  const excludedUsers = await User.find({
    username: { $regex: new RegExp(`^${EXCLUDED_CLIENT_USERNAME}$`, 'i') }
  })
    .select('_id')
    .lean();

  if (excludedUsers.length === 0) {
    return [];
  }

  return Seller.find({
    user: { $in: excludedUsers.map((user) => user._id) }
  }).distinct('_id');
}

async function getActiveSellerIds() {
  const activeUserIds = await User.find({ active: true }).distinct('_id');
  if (!activeUserIds.length) return [];
  return Seller.find({ user: { $in: activeUserIds }, isStoreActive: { $ne: false } }).distinct('_id');
}

async function applyActiveSellerScope(query, requestedSellerId) {
  const activeSellerIds = await getActiveSellerIds();
  if (activeSellerIds.length === 0) {
    query.seller = { $in: [] };
    return;
  }

  if (requestedSellerId) {
    if (!mongoose.Types.ObjectId.isValid(requestedSellerId)) {
      query.seller = { $in: [] };
      return;
    }
    const requestedObjectId = new mongoose.Types.ObjectId(requestedSellerId);
    const isAllowed = activeSellerIds.some((id) => id.equals(requestedObjectId));
    query.seller = isAllowed ? requestedObjectId : { $in: [] };
    return;
  }

  query.$and = query.$and || [];
  query.$and.push({ seller: { $in: activeSellerIds } });
}

function getInternalApiBaseUrl(req) {
  if (process.env.INTERNAL_API_BASE_URL) return process.env.INTERNAL_API_BASE_URL;
  const port = process.env.PORT || 5000;
  const protocol = req.protocol || 'http';
  return `${protocol}://127.0.0.1:${port}`;
}

async function runInternalBackfillStep({ req, name, path, body = {} }) {
  const startedAt = new Date();
  try {
    const baseUrl = getInternalApiBaseUrl(req);
    const response = await axios.post(`${baseUrl}${path}`, body, {
      headers: {
        Authorization: req.headers.authorization || '',
        Cookie: req.headers.cookie || '',
        'Content-Type': 'application/json',
      },
      timeout: 10 * 60 * 1000, // 10 minutes per step
      validateStatus: () => true,
    });

    const completedAt = new Date();
    const ok = response.status >= 200 && response.status < 300;
    return {
      name,
      path,
      ok,
      status: response.status,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      result: response.data,
    };
  } catch (error) {
    const completedAt = new Date();
    return {
      name,
      path,
      ok: false,
      status: 500,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      error: error.message || 'Unknown error',
    };
  }
}

function summarizeAutoCompatItems(items = []) {
  return items.reduce((acc, item) => {
    acc.processedCount += 1;
    if (item.status === 'success') acc.successCount += 1;
    else if (item.status === 'warning') acc.warningCount += 1;
    else if (item.status === 'needs_manual') acc.needsManualCount += 1;
    else if (item.status === 'ebay_error') acc.ebayErrorCount += 1;
    else if (item.status === 'ai_failed') acc.aiFailedCount += 1;
    return acc;
  }, {
    processedCount: 0,
    successCount: 0,
    warningCount: 0,
    needsManualCount: 0,
    ebayErrorCount: 0,
    aiFailedCount: 0,
  });
}

async function getAutoCompatibilitySourceListings(batch) {
  if (Array.isArray(batch.sourceItemIds) && batch.sourceItemIds.length > 0) {
    const listings = await Listing.find({
      seller: batch.seller,
      itemId: { $in: batch.sourceItemIds }
    }).lean();
    const byItemId = new Map(listings.map(listing => [listing.itemId, listing]));
    return batch.sourceItemIds.map(itemId => byItemId.get(itemId)).filter(Boolean);
  }

  // targetDate is in IST (YYYY-MM-DD). Convert IST midnight/end-of-day to UTC for the query.
  const dayStart = new Date(batch.targetDate + 'T00:00:00+05:30');
  const dayEnd = new Date(batch.targetDate + 'T23:59:59.999+05:30');
  const query = {
    seller: batch.seller,
    listingStatus: 'Active',
    startTime: { $gte: dayStart, $lte: dayEnd },
    $or: [
      { compatibility: { $exists: false } },
      { compatibility: { $size: 0 } },
      { compatibility: null }
    ]
  };

  let listings = await Listing.find(query).sort({ startTime: 1 }).lean();
  if (batch.itemLimit > 0) listings = listings.slice(0, batch.itemLimit);
  return listings;
}

export async function processAutoCompatibilityBatch(batchId) {
  const batchKey = String(batchId);
  if (activeAutoCompatBatchRuns.has(batchKey)) return;

  // Atomically claim the batch — only proceed if this instance owns it or it is unclaimed.
  // This prevents a local dev server from stealing a batch that Render is running, and vice versa.
  const claimed = await AutoCompatibilityBatch.findOneAndUpdate(
    {
      _id: batchId,
      status: 'running',
      $or: [
        { runnerId: null },
        { runnerId: { $exists: false } },
        { runnerId: RUNNER_ID },
      ],
    },
    { $set: { runnerId: RUNNER_ID, lastHeartbeatAt: new Date() } }
  );

  if (!claimed) {
    const current = await AutoCompatibilityBatch.findById(batchId).select('status runnerId').lean();
    if (current?.status === 'running' && current.runnerId && current.runnerId !== RUNNER_ID) {
      console.log(`[AutoCompat] Batch ${batchId} is owned by runner '${current.runnerId}', skipping on '${RUNNER_ID}'`);
    }
    return;
  }

  activeAutoCompatBatchRuns.add(batchKey);

  // Keep lastHeartbeatAt fresh so a stale-batch detector can see this runner is alive
  const heartbeatTimer = setInterval(async () => {
    try { await AutoCompatibilityBatch.findByIdAndUpdate(batchId, { lastHeartbeatAt: new Date() }); } catch { /* ignore */ }
  }, 30_000);

  try {
    const batch = await AutoCompatibilityBatch.findById(batchId).lean();
    if (!batch || batch.status === 'completed') return;

    const seller = await Seller.findById(batch.seller);
    if (!seller) {
      await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
        status: 'failed',
        completedAt: new Date(),
        currentStep: 'failed: seller not found'
      });
      return;
    }

    const allListings = await getAutoCompatibilitySourceListings(batch);
    const existingItems = await AutoCompatibilityBatchItem.find({ batchId }).select('itemId status').lean();
    const processedItemIds = new Set(existingItems.map(item => item.itemId));
    const pendingListings = allListings.filter(listing => !processedItemIds.has(listing.itemId));
    const counts = summarizeAutoCompatItems(existingItems);

    await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
      status: 'running',
      completedAt: null,
      processedCount: counts.processedCount,
      successCount: counts.successCount,
      warningCount: counts.warningCount,
      needsManualCount: counts.needsManualCount,
      ebayErrorCount: counts.ebayErrorCount,
      aiFailedCount: counts.aiFailedCount,
      currentItemTitle: pendingListings[0]?.title || '',
      currentStep: pendingListings.length > 0 ? 'resuming' : 'done'
    });

    if (pendingListings.length === 0) {
      await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
        status: 'completed',
        completedAt: batch.completedAt || new Date(),
        currentItemTitle: '',
        currentStep: 'done'
      });
      return;
    }

    let token = await ensureValidToken(seller);

    for (const listing of pendingListings) {
      const itemResult = {
        itemId: listing.itemId,
        title: listing.title,
        sku: listing.sku || '',
        status: 'ai_failed',
        aiSuggestion: null,
        resolvedMake: null,
        resolvedModel: null,
        failureReason: null,
        compatibilityList: [],
        ebayWarning: null,
        ebayError: null,
        strippedCount: 0
      };

      await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
        processedCount: counts.processedCount,
        currentItemTitle: listing.title || listing.itemId,
        currentStep: 'ai_suggest'
      });

      try {
        const aiData = await aiSuggestFitment(listing.title, listing.descriptionPreview);
        itemResult.aiSuggestion = aiData;

        if (!aiData.make) {
          itemResult.status = 'ai_failed';
          itemResult.failureReason = 'AI could not extract fitment info from this listing';
          counts.aiFailedCount += 1;
          counts.processedCount += 1;
          await AutoCompatibilityBatchItem.create({ batchId, ...itemResult });
          await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
            aiFailedCount: counts.aiFailedCount,
            processedCount: counts.processedCount
          });
          continue;
        }

        const resolvedMake = resolveMake(aiData.make);
        const resolvedModelStep1 = resolveModel(resolvedMake, aiData.model);
        const resolvedModelInput = resolveModelWithYear(resolvedMake, resolvedModelStep1, aiData.startYear, aiData.endYear);
        itemResult.resolvedMake = resolvedMake;

        await AutoCompatibilityBatch.findByIdAndUpdate(batchId, { currentStep: 'fetching_models' });

        const modelOpts = await fetchCompatValues(token, 'Model', [{ name: 'Make', value: resolvedMake }]);
        const canonicalModel = fuzzyMatchModel(resolvedModelInput, modelOpts);

        if (!canonicalModel) {
          itemResult.status = 'needs_manual';
          itemResult.resolvedModel = resolvedModelInput;
          itemResult.failureReason = `Model "${aiData.model}" (resolved: "${resolvedModelInput}") not found in eBay DB for ${resolvedMake}`;
          counts.needsManualCount += 1;
          counts.processedCount += 1;
          await AutoCompatibilityBatchItem.create({ batchId, ...itemResult });
          await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
            needsManualCount: counts.needsManualCount,
            processedCount: counts.processedCount
          });
          continue;
        }
        itemResult.resolvedModel = canonicalModel;

        await AutoCompatibilityBatch.findByIdAndUpdate(batchId, { currentStep: 'fetching_years' });

        const yearOpts = (await fetchCompatValues(token, 'Year', [
          { name: 'Make', value: resolvedMake },
          { name: 'Model', value: canonicalModel }
        ])).map(y => String(y)).sort((a, b) => Number(b) - Number(a));

        let resolvedYears = [];
        if (aiData.startYear && aiData.endYear) {
          const clamped = clampYearRange(resolvedMake, canonicalModel, aiData.startYear, aiData.endYear);
          const min = Math.min(Number(clamped.startYear), Number(clamped.endYear));
          const max = Math.max(Number(clamped.startYear), Number(clamped.endYear));
          resolvedYears = yearOpts.filter(y => Number(y) >= min && Number(y) <= max);
        }

        if (resolvedYears.length === 0) {
          itemResult.status = 'needs_manual';
          itemResult.failureReason = `Years ${aiData.startYear}-${aiData.endYear} not found in eBay DB for ${resolvedMake} ${canonicalModel}`;
          counts.needsManualCount += 1;
          counts.processedCount += 1;
          await AutoCompatibilityBatchItem.create({ batchId, ...itemResult });
          await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
            needsManualCount: counts.needsManualCount,
            processedCount: counts.processedCount
          });
          continue;
        }

        await AutoCompatibilityBatch.findByIdAndUpdate(batchId, { currentStep: 'fetching_trims' });

        const compatibilityList = [];
        for (const year of resolvedYears) {
          const trims = await fetchCompatValues(token, 'Trim', [
            { name: 'Make', value: resolvedMake },
            { name: 'Model', value: canonicalModel },
            { name: 'Year', value: year }
          ]);

          if (trims.length === 0) {
            compatibilityList.push({
              notes: '',
              nameValueList: [
                { name: 'Year', value: year },
                { name: 'Make', value: resolvedMake },
                { name: 'Model', value: canonicalModel }
              ]
            });
          } else {
            for (const trim of trims) {
              const engines = await fetchCompatValues(token, 'Engine', [
                { name: 'Make', value: resolvedMake },
                { name: 'Model', value: canonicalModel },
                { name: 'Year', value: year },
                { name: 'Trim', value: trim }
              ]);

              if (engines.length === 0) {
                compatibilityList.push({
                  notes: '',
                  nameValueList: [
                    { name: 'Year', value: year },
                    { name: 'Make', value: resolvedMake },
                    { name: 'Model', value: canonicalModel },
                    { name: 'Trim', value: trim }
                  ]
                });
              } else {
                for (const engine of engines) {
                  compatibilityList.push({
                    notes: '',
                    nameValueList: [
                      { name: 'Year', value: year },
                      { name: 'Make', value: resolvedMake },
                      { name: 'Model', value: canonicalModel },
                      { name: 'Trim', value: trim },
                      { name: 'Engine', value: engine }
                    ]
                  });
                }
              }
            }
          }
        }

        itemResult.compatibilityList = compatibilityList;

        await AutoCompatibilityBatch.findByIdAndUpdate(batchId, { currentStep: 'sending_to_ebay' });

        const sanitized = sanitizeCompatibilityList(compatibilityList);
        const compatXml = buildCompatXml(sanitized);
        const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
              <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
                <ErrorLanguage>en_US</ErrorLanguage>
                <WarningLevel>High</WarningLevel>
                <Item><ItemID>${listing.itemId}</ItemID>${compatXml}</Item>
              </ReviseFixedPriceItemRequest>`;

        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
          headers: { 'X-EBAY-API-SITEID': '100', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'Content-Type': 'text/xml' }
        });
        const result = await parseStringPromise(response.data);
        const ack = result.ReviseFixedPriceItemResponse.Ack[0];

        if (ack === 'Failure') {
          const errors = result.ReviseFixedPriceItemResponse.Errors || [];
          const errorMessage = errors.map(e => e.LongMessage[0]).join('; ');

          // 931 = hard expired (refresh token dead), 932 = soft expired (access token expired mid-batch)
          const isTokenExpired = errors.some(e =>
            (e.ErrorCode?.[0] === '931') ||
            (e.ErrorCode?.[0] === '932') ||
            (e.LongMessage?.[0] || '').toLowerCase().includes('hard expired') ||
            (e.LongMessage?.[0] || '').toLowerCase().includes('soft expired') ||
            (e.LongMessage?.[0] || '').toLowerCase().includes('token is expired') ||
            (e.LongMessage?.[0] || '').toLowerCase().includes('invalid access token')
          );

          if (isTokenExpired) {
            // Force-refresh the token (ignore local cache) and retry the ReviseFixedPriceItem call once
            console.log(`[AutoCompat] Token expired (mid-batch) for seller ${seller._id}, force-refreshing...`);
            seller.ebayTokens.fetchedAt = new Date(0);
            token = await ensureValidToken(seller);
            const retryXml = `<?xml version="1.0" encoding="utf-8"?>
              <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
                <ErrorLanguage>en_US</ErrorLanguage>
                <WarningLevel>High</WarningLevel>
                <Item><ItemID>${listing.itemId}</ItemID>${compatXml}</Item>
              </ReviseFixedPriceItemRequest>`;
            const retryResp = await axios.post('https://api.ebay.com/ws/api.dll', retryXml, {
              headers: { 'X-EBAY-API-SITEID': '100', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'Content-Type': 'text/xml' }
            });
            const retryResult = await parseStringPromise(retryResp.data);
            const retryAck = retryResult.ReviseFixedPriceItemResponse.Ack[0];
            if (retryAck === 'Failure') {
              const retryErrors = retryResult.ReviseFixedPriceItemResponse.Errors || [];
              itemResult.status = 'ebay_error';
              itemResult.ebayError = parseInvalidCombos(retryErrors.map(e => e.LongMessage[0]).join('; '));
              counts.ebayErrorCount += 1;
            } else {
              let savedList = sanitized;
              if (retryAck === 'Warning') {
                const meaningful = (retryResult.ReviseFixedPriceItemResponse.Errors || []).filter(e => {
                  const msg = e.LongMessage[0];
                  return !msg.includes('Best Offer') && !msg.includes('Funds from your sales');
                });
                if (meaningful.length > 0) {
                  const rawWarning = meaningful.map(e => e.LongMessage[0]).join('; ');
                  itemResult.ebayWarning = meaningful.map(e => parseInvalidCombos(e.LongMessage[0])).join('; ');
                  savedList = filterOutInvalidCombos(sanitized, rawWarning);
                  itemResult.strippedCount = sanitized.length - savedList.length;
                  purgeInvalidFromCache(rawWarning).catch(() => {});
                }
              }
              itemResult.status = 'success';
              itemResult.compatibilityList = savedList;
              counts.successCount += 1;
              await Listing.findOneAndUpdate({ itemId: listing.itemId }, { compatibility: savedList });
            }
          } else if (isDuplicateListingError(errorMessage)) {
            try {
              const { newPrice, newTitle, warning: retryWarning } = await retryCompatWithTitleDiff(token, listing.itemId, sanitized);
              await Listing.findOneAndUpdate({ itemId: listing.itemId }, { compatibility: sanitized, currentPrice: newPrice, title: newTitle });
              itemResult.status = 'success';
              itemResult.ebayWarning = retryWarning || `Title updated to "${newTitle}" (duplicate listing resolved)`;
              counts.successCount += 1;
            } catch (retryErr) {
              itemResult.status = 'ebay_error';
              itemResult.ebayError = `Duplicate listing — retry failed: ${retryErr.message}`;
              counts.ebayErrorCount += 1;
            }
          } else {
            itemResult.status = 'ebay_error';
            itemResult.ebayError = parseInvalidCombos(errorMessage);
            counts.ebayErrorCount += 1;
            purgeInvalidFromCache(errorMessage).catch(() => {});
          }
        } else {
          let savedList = sanitized;
          if (ack === 'Warning') {
            const warnings = result.ReviseFixedPriceItemResponse.Errors || [];
            const meaningful = warnings.filter(err => {
              const msg = err.LongMessage[0];
              return !msg.includes('Best Offer') && !msg.includes('Funds from your sales');
            });
            if (meaningful.length > 0) {
              const rawWarning = meaningful.map(e => e.LongMessage[0]).join('; ');
              itemResult.ebayWarning = meaningful.map(e => parseInvalidCombos(e.LongMessage[0])).join('; ');
              savedList = filterOutInvalidCombos(sanitized, rawWarning);
              itemResult.strippedCount = sanitized.length - savedList.length;
              purgeInvalidFromCache(rawWarning).catch(() => {});
            }
            // eBay Warning == still sent successfully; treat as success
            itemResult.status = 'success';
            counts.successCount += 1;
          } else {
            itemResult.status = 'success';
            counts.successCount += 1;
          }
          itemResult.compatibilityList = savedList;
          await Listing.findOneAndUpdate({ itemId: listing.itemId }, { compatibility: savedList });
        }
      } catch (itemErr) {
        itemResult.status = 'ebay_error';
        itemResult.ebayError = itemErr.message;
        counts.ebayErrorCount += 1;
      }

      counts.processedCount += 1;
      await AutoCompatibilityBatchItem.create({ batchId, ...itemResult });
      await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
        processedCount: counts.processedCount,
        successCount: counts.successCount,
        warningCount: counts.warningCount,
        needsManualCount: counts.needsManualCount,
        ebayErrorCount: counts.ebayErrorCount,
        aiFailedCount: counts.aiFailedCount
      });
    }

    await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
      status: 'completed',
      completedAt: new Date(),
      currentItemTitle: '',
      currentStep: 'done'
    });
    console.log(`[AutoCompat] Batch ${batchId} completed: ${counts.successCount} success (incl. w/ notes), ${counts.needsManualCount} manual, ${counts.ebayErrorCount} error, ${counts.aiFailedCount} ai_failed`);
  } catch (batchErr) {
    console.error(`[AutoCompat] Batch ${batchId} failed:`, batchErr.message);
    await AutoCompatibilityBatch.findByIdAndUpdate(batchId, {
      status: 'failed',
      completedAt: new Date(),
      currentStep: 'failed: ' + batchErr.message
    });
  } finally {
    clearInterval(heartbeatTimer);
    activeAutoCompatBatchRuns.delete(batchKey);
  }
}

export async function resumeRunningAutoCompatibilityBatches() {
  // Only resume batches that belong to THIS runner instance (or legacy unclaimed ones).
  // This prevents the local dev server from resuming Render's batches and vice versa.
  const runningBatches = await AutoCompatibilityBatch.find({
    status: 'running',
    $or: [
      { runnerId: null },
      { runnerId: { $exists: false } },
      { runnerId: RUNNER_ID },
    ],
  }).select('_id runnerId').lean();
  if (runningBatches.length === 0) return 0;

  // Process sequentially (same as cron path) to avoid overwhelming eBay API / AI
  (async () => {
    for (const batch of runningBatches) {
      try {
        await processAutoCompatibilityBatch(batch._id);
      } catch (err) {
        console.error(`[AutoCompat] Failed to resume batch ${batch._id}:`, err.message);
      }
    }
  })();

  return runningBatches.length;
}

// ============================================
// UPLOAD FEED TO EBAY
// ============================================
router.post('/feed/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { sellerId, feedType = 'FX_LISTING', schemaVersion = '1.0', country = 'US' } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!sellerId) {
      return res.status(400).json({ error: 'Missing sellerId' });
    }

    console.log(`[Feed Upload] Starting upload for seller ${sellerId}, feedType=${feedType}`);

    // 1. Get Seller & Token
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    const accessToken = await ensureValidToken(seller);

    // 2. Create Task
    // POST https://api.ebay.com/sell/feed/v1/task
    console.log(`[Feed Upload] Creating task...`);
    const createTaskRes = await axios.post(
      'https://api.ebay.com/sell/feed/v1/task',
      {
        feedType: feedType,
        schemaVersion: schemaVersion
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' // Default to US, make configurable if needed
        }
      }
    );

    // Task location is in "location" header, but ID is usually part of the URL
    // The response body is empty for 202, but some docs say it returns ID in location header
    // The documentation says: "The location response header contains the URL to the newly created task. The URL includes the eBay-assigned task ID"
    const locationHeader = createTaskRes.headers.location;
    if (!locationHeader) {
      throw new Error('Failed to get task location from eBay');
    }

    const taskId = locationHeader.split('/').pop();
    console.log(`[Feed Upload] Task created with ID: ${taskId}`);

    // 3. Upload File
    // POST https://api.ebay.com/sell/feed/v1/task/{task_id}/upload_file
    console.log(`[Feed Upload] Uploading file to task ${taskId}...`);

    const formData = new FormData();
    // 'file' is the required key name for the file content
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    // 'fileName', 'name', 'type' might be required as extra fields based on some examples,
    // but the official docs say: "This call does not have a JSON Request payload but uploads the file as form-data."
    // and "key-value pair name: 'file'".
    // The user's example showed payload = {"fileName": ..., "name": "file", "type": "form-data"}
    // valid form-data keys: fileName, name, type.
    formData.append('fileName', file.originalname);
    formData.append('name', 'file');
    formData.append('type', 'form-data');


    const uploadRes = await axios.post(
      `https://api.ebay.com/sell/feed/v1/task/${taskId}/upload_file`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...formData.getHeaders()
        }
      }
    );

    console.log(`[Feed Upload] File uploaded successfully. Status: ${uploadRes.status}`);

    // Create local record
    await FeedUpload.create({
      seller: seller._id,
      taskId: taskId,
      fileName: file.originalname,
      feedType: feedType,
      country: country,
      schemaVersion: schemaVersion,
      status: 'CREATED' // Initial status
    });

    res.json({
      success: true,
      taskId: taskId,
      message: 'File uploaded and processing started',
      uploadStatus: uploadRes.status
    });

  } catch (error) {
    console.error('[Feed Upload] Error:', error.message);
    if (error.response) {
      console.error('[Feed Upload] eBay Response:', error.response.data);
      console.error('[Feed Upload] eBay Status:', error.response.status);
    }
    res.status(500).json({
      error: 'Failed to upload feed',
      details: error.response?.data || error.message
    });
  }
});

// ============================================
// GET FEED TASKS STATUS
// ============================================
router.get('/feed/tasks', requireAuth, async (req, res) => {
  try {
    const { sellerId, limit = 10, offset = 0 } = req.query;

    if (!sellerId) {
      return res.status(400).json({ error: 'Missing sellerId' });
    }

    // 1. Get Seller & Token
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    const accessToken = await ensureValidToken(seller);

    // 2. Fetch Tasks from eBay
    // GET https://api.ebay.com/sell/feed/v1/task
    // 2. Fetch Tasks from Local DB
    console.log(`[Feed Tasks] Fetching tasks for seller ${sellerId} from DB...`);

    // Calculate skip based on offset/limit
    const skip = parseInt(offset) || 0;
    const limitNum = parseInt(limit) || 10;

    const dbTasks = await FeedUpload.find({ seller: sellerId })
      .sort({ creationDate: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await FeedUpload.countDocuments({ seller: sellerId });

    // 3. Sync Status with eBay for Incomplete Tasks
    // We only need to check status if it's not COMPLETED or FAILURE
    const tasksToSync = dbTasks.filter(t =>
      t.status !== 'COMPLETED' &&
      t.status !== 'COMPLETED_WITH_ERROR' &&
      t.status !== 'FAILURE'
    );

    if (tasksToSync.length > 0) {
      console.log(`[Feed Tasks] Syncing ${tasksToSync.length} tasks with eBay...`);

      for (const task of tasksToSync) {
        try {
          // GET https://api.ebay.com/sell/feed/v1/task/{task_id}
          const taskRes = await axios.get(
            `https://api.ebay.com/sell/feed/v1/task/${task.taskId}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
              }
            }
          );

          const ebayTask = taskRes.data;

          // Update local DB if status changed
          if (ebayTask.status !== task.status || ebayTask.uploadSummary) {
            const oldStatus = task.status;
            task.status = ebayTask.status;
            let newlyCompletedSuccessCount = 0;

            if (ebayTask.uploadSummary) {
              const previousSuccess = task.uploadSummary?.successCount || 0;
              task.uploadSummary = {
                successCount: ebayTask.uploadSummary.successCount,
                failureCount: ebayTask.uploadSummary.failureCount
              };

              // Calculate any newly added successful uploads if task was already somewhat processed
              // Or if status changed to COMPLETED/COMPLETED_WITH_ERROR, process the new count
              if ((ebayTask.status === 'COMPLETED' || ebayTask.status === 'COMPLETED_WITH_ERROR') &&
                oldStatus !== 'COMPLETED' && oldStatus !== 'COMPLETED_WITH_ERROR') {
                newlyCompletedSuccessCount = ebayTask.uploadSummary.successCount;
              }   
            }
            task.lastUpdated = new Date();
            await task.save();

            // Track user performance based on Feed Upload
            if (newlyCompletedSuccessCount > 0) {
              try {
                const assignment = await UserSellerAssignment.findOne({ seller: sellerId });
                if (assignment) {
                  const dateString = moment().format('YYYY-MM-DD'); // Local time
                  await UserDailyQuantity.findOneAndUpdate(
                    { user: assignment.user, seller: sellerId, dateString },
                    { $inc: { quantity: newlyCompletedSuccessCount } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                  );
                  console.log(`[User Performance] Added ${newlyCompletedSuccessCount} to user ${assignment.user} for seller ${sellerId} on ${dateString}`);
                } else {
                  console.log(`[User Performance] No user assigned to seller ${sellerId}, skipping quantity update`);
                }
              } catch (perfErr) {
                console.error('[User Performance] Error updating daily quantity:', perfErr.message);
              }
            }
          }
        } catch (err) {
          console.error(`[Feed Tasks] Failed to sync task ${task.taskId}:`, err.message);
        }
      }
    }

    res.json({
      success: true,
      tasks: dbTasks,
      total: total
    });

  } catch (error) {
    console.error('[Feed Tasks] Error:', error.message);
    if (error.response) {
      console.error('[Feed Tasks] eBay Response:', error.response.data);
    }
    res.status(500).json({
      error: 'Failed to fetch feed tasks',
      details: error.response?.data || error.message
    });
  }
});

// ============================================
// DOWNLOAD FEED RESULT FILE (Error Details)
// ============================================
router.get('/feed/result/:taskId', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { sellerId } = req.query;

    if (!sellerId) {
      return res.status(400).json({ error: 'Missing sellerId' });
    }

    // 1. Get Seller & Token
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    const accessToken = await ensureValidToken(seller);

    // 2. Check task exists and is in a completed state
    const feedUpload = await FeedUpload.findOne({ taskId, seller: sellerId });
    if (!feedUpload) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (feedUpload.status !== 'COMPLETED' && feedUpload.status !== 'COMPLETED_WITH_ERROR') {
      return res.status(400).json({ error: 'Result file is only available for completed tasks' });
    }

    console.log(`[Feed Result] Downloading result file for task ${taskId}...`);

    // 3. Download result file from eBay
    // GET https://api.ebay.com/sell/feed/v1/task/{task_id}/download_result_file
    const resultRes = await axios.get(
      `https://api.ebay.com/sell/feed/v1/task/${taskId}/download_result_file`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'Accept': 'application/octet-stream'
        },
        responseType: 'arraybuffer'
      }
    );

    console.log(`[Feed Result] Received response, size: ${resultRes.data.length} bytes`);

    // 4. Decompress if gzipped, otherwise use raw data
    let fileContent;
    try {
      fileContent = zlib.gunzipSync(Buffer.from(resultRes.data));
    } catch (e) {
      // Not gzipped, use raw data
      fileContent = Buffer.from(resultRes.data);
    }

    // 5. Send as downloadable CSV
    const fileName = `errors_${feedUpload.fileName || taskId}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileContent);

  } catch (error) {
    console.error('[Feed Result] Error:', error.message);
    if (error.response) {
      console.error('[Feed Result] eBay Status:', error.response.status);
    }

    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Result file not available yet. Task may still be processing.' });
    }

    res.status(500).json({
      error: 'Failed to download result file',
      details: error.response?.data?.toString?.() || error.message
    });
  }
});

// ============================================
// EBAY OAUTH SCOPES - Single source of truth
// Used in both initial authorization AND token refresh
// ============================================
const EBAY_OAUTH_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.reputation',
  'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.stores',
  'https://api.ebay.com/oauth/api_scope/sell.stores.readonly',
  'https://api.ebay.com/oauth/scope/sell.edelivery',
  'https://api.ebay.com/oauth/api_scope/commerce.vero',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.mapping',
  'https://api.ebay.com/oauth/api_scope/commerce.message',
  'https://api.ebay.com/oauth/api_scope/commerce.feedback',
  'https://api.ebay.com/oauth/api_scope/commerce.shipping'
].join(' ');

// ============================================
// IMAGE CACHE INITIALIZATION
// ============================================
// Start automatic cleanup of expired cache entries (runs every 10 minutes)
imageCache.startAutoCleanup();

// ============================================
// HELPER: Pacific Time Day Bounds (DST-accurate)
// ============================================
/**
 * Returns the exact UTC start/end for a calendar date in America/Los_Angeles.
 * Uses Node's built-in Intl API instead of an approximated month/day DST check,
 * which correctly handles transition days like March 8 (DST starts at 2 AM, not midnight).
 *
 * Example for March 8 2026 (DST transition day):
 *   Midnight PST  = 08:00 UTC  (correct start - first 2 hrs are still PST)
 *   23:59:59 PDT  = 06:59:59 UTC next day (correct end - rest of day is PDT)
 *
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {{ start: Date, end: Date }}
 */
function getPTDayBoundsUTC(dateStr) {
  function getPTHour(d) {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        hour12: false,
        hourCycle: 'h23'
      }).format(d),
      10
    );
  }
  function getPTDateStr(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }

  // Find which UTC hour (7 or 8) is midnight in PT for this date
  // PST = UTC-8 → midnight = T08:00Z; PDT = UTC-7 → midnight = T07:00Z
  function findMidnightUTC(ds) {
    const pst = new Date(`${ds}T08:00:00.000Z`);
    if (getPTDateStr(pst) === ds && getPTHour(pst) === 0) return pst;
    const pdt = new Date(`${ds}T07:00:00.000Z`);
    if (getPTDateStr(pdt) === ds && getPTHour(pdt) === 0) return pdt;
    return pst; // fallback to PST
  }

  const start = findMidnightUTC(dateStr);

  // End = 1ms before midnight of the next day in PT
  const tmp = new Date(`${dateStr}T12:00:00.000Z`);
  tmp.setUTCDate(tmp.getUTCDate() + 1);
  const nextDateStr = tmp.toISOString().split('T')[0];
  const nextStart = findMidnightUTC(nextDateStr);
  const end = new Date(nextStart.getTime() - 1); // 23:59:59.999 PT

  return { start, end };
}

// ============================================
// HELPER: Recalculate USD Fields
// ============================================
function recalculateUSDFields(order) {
  // Get conversion rate (default to 1 for US orders)
  let conversionRate = 1;

  if (order.purchaseMarketplaceId !== 'EBAY_US') {
    const totalDueSeller = order.paymentSummary?.totalDueSeller;
    if (totalDueSeller?.value && totalDueSeller?.convertedFromValue) {
      const usdValue = parseFloat(totalDueSeller.value);
      const originalValue = parseFloat(totalDueSeller.convertedFromValue);
      if (usdValue > 0 && originalValue > 0) {
        conversionRate = usdValue / originalValue;
      }
    }
  }

  // Recalculate all USD fields
  const updates = {
    conversionRate: parseFloat(conversionRate.toFixed(5))
  };

  // Convert monetary fields
  const monetaryFields = [
    'subtotal', 'shipping', 'salesTax', 'discount',
    'transactionFees', 'beforeTax', 'estimatedTax'
  ];

  monetaryFields.forEach(field => {
    if (order[field] !== undefined && order[field] !== null && order[field] !== '') {
      const value = parseFloat(order[field]);
      if (!isNaN(value)) {
        updates[`${field}USD`] = parseFloat((value * conversionRate).toFixed(2));
      }
    } else {
      // If field is null/empty, clear the USD field
      updates[`${field}USD`] = null;
    }
  });

  // Calculate refunds
  if (order.refunds && Array.isArray(order.refunds)) {
    const totalRefund = order.refunds.reduce((sum, r) => {
      const amt = parseFloat(r.amount?.value || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
    updates.refundTotalUSD = parseFloat((totalRefund * conversionRate).toFixed(2));
  } else if (order.paymentSummary?.refunds && Array.isArray(order.paymentSummary.refunds)) {
    const totalRefund = order.paymentSummary.refunds.reduce((sum, r) => {
      const amt = parseFloat(r.amount?.value || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
    updates.refundTotalUSD = parseFloat((totalRefund * conversionRate).toFixed(2));
  }

  return updates;
}

// ============================================
// HELPER: Calculate Financial Fields (All Orders Sheet)
// ============================================
// Calculates TDS, TID, NET, and P.Balance INR based on orderEarnings
async function calculateFinancials(order, marketplace = 'EBAY') {
  return calculateOrderEbayFinancials(order);
}

// Calculate Amazon-side financial fields
async function calculateAmazonFinancials(order) {
  return calculateOrderAmazonFinancials(order);
}

// HELPER: Ensure Seller Token is Valid (Refreshes if < 2 mins left)
async function ensureValidToken(seller, retries = 3) {
  const now = Date.now();
  const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
  const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
  const bufferTime = 2 * 60 * 1000; // 2 minutes buffer

  // If token is valid, return it
  if (fetchedAt && (now - fetchedAt < expiresInMs - bufferTime)) {
    return seller.ebayTokens.access_token;
  }

  console.log(`[Token Refresh] Refreshing token for ${seller.user?.username || seller._id}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const refreshRes = await axios.post(
        'https://api.ebay.com/identity/v1/oauth2/token',
        qs.stringify({
          grant_type: 'refresh_token',
          refresh_token: seller.ebayTokens.refresh_token,
          scope: EBAY_OAUTH_SCOPES // Using centralized scopes constant
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
          },
          timeout: 10000 // 10 second timeout
        }
      );

      // Update Seller
      seller.ebayTokens.access_token = refreshRes.data.access_token;
      seller.ebayTokens.expires_in = refreshRes.data.expires_in;
      seller.ebayTokens.fetchedAt = new Date();
      await seller.save();

      if (attempt > 1) {
        console.log(`[Token Refresh] ✅ Succeeded on attempt ${attempt} for ${seller.user?.username || seller._id}`);
      }

      return refreshRes.data.access_token;
    } catch (err) {
      const status = err.response?.status;
      const isRetryable = status === 503 || status === 429 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

      if (isRetryable && attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff: 1s, 2s, 4s (max 5s)
        console.log(`[Token Refresh] ⚠️ Attempt ${attempt} failed with ${status || err.code}, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      console.error(`[Token Refresh] ❌ Failed for ${seller._id} after ${attempt} attempts:`, err.message);
      throw new Error(`Failed to refresh eBay token: ${err.response?.status || err.message}`);
    }
  }
}

// ============================================
// HELPER: Finances API marketplace header (US / GB / AU / CA / …)
// ============================================
const VALID_FINANCES_MARKETPLACE_IDS = new Set([
  'EBAY_US',
  'EBAY_ENCA',
  'EBAY_CA',
  'EBAY_GB',
  'EBAY_UK',
  'EBAY_AU',
  'EBAY_DE',
  'EBAY_FR',
  'EBAY_IT',
  'EBAY_ES'
]);

function normalizeFinancesMarketplaceId(raw) {
  if (raw == null) return 'EBAY_US';
  const s = String(raw).trim();
  if (!s) return 'EBAY_US';
  const upper = s.toUpperCase();
  if (upper === 'UK') return 'EBAY_GB';
  if (upper === 'GB') return 'EBAY_GB';
  if (upper === 'AU' || upper === 'AUS' || upper === 'AUSTRALIA') return 'EBAY_AU';
  if (upper === 'CA' || upper === 'CAN' || upper === 'CANADA') return 'EBAY_CA';
  if (upper.startsWith('EBAY_')) {
    if (upper === 'EBAY_UK') return 'EBAY_GB';
    if (upper === 'EBAY_ENCA') return 'EBAY_CA';
    return VALID_FINANCES_MARKETPLACE_IDS.has(upper) ? upper : 'EBAY_US';
  }
  return 'EBAY_US';
}

function resolveFinancesMarketplaceIds(seller, queryMarketplace) {
  const fromQuery = normalizeFinancesMarketplaceId(queryMarketplace);
  if (queryMarketplace != null && String(queryMarketplace).trim() !== '') {
    return [fromQuery];
  }
  const regions = Array.isArray(seller?.ebayMarketplaces) ? seller.ebayMarketplaces : [];
  const mapped = regions.map((r) => normalizeFinancesMarketplaceId(r)).filter(Boolean);
  const uniq = [...new Set(mapped)];
  return uniq.length ? uniq : ['EBAY_US'];
}

function resolvePrimaryFinancesMarketplaceId(seller, queryMarketplace) {
  return resolveFinancesMarketplaceIds(seller, queryMarketplace)[0];
}

function purchaseMarketplaceToFinancesId(purchaseMarketplaceId) {
  return normalizeFinancesMarketplaceId(purchaseMarketplaceId);
}

function financesApiHeaders(accessToken, marketplaceId) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': normalizeFinancesMarketplaceId(marketplaceId)
  };
}

function moneyFromNumber(value, currency = 'USD') {
  const v = Number.isFinite(value) ? value : 0;
  return { value: v.toFixed(2), currency: currency || 'USD' };
}

/** Paginate GET /sell/finances/v1/transaction with a single filter (e.g. transactionStatus:{FUNDS_PROCESSING}). */
async function fetchFinancesTransactionsAllPages(accessToken, marketplaceId, filter) {
  const all = [];
  let offset = 0;
  const limit = 200;
  let hasMore = true;
  const mp = normalizeFinancesMarketplaceId(marketplaceId);

  while (hasMore) {
    const response = await axios.get('https://apiz.ebay.com/sell/finances/v1/transaction', {
      headers: financesApiHeaders(accessToken, mp),
      params: { filter, limit, offset }
    });
    const batch = response.data?.transactions || [];
    all.push(...batch);
    if (batch.length < limit) hasMore = false;
    else offset += limit;
  }
  return all;
}

/**
 * Same order-level merge as /processing-transactions and /onhold-transactions:
 * one row per order (or transaction id fallback), amount = sum of txn.amount.
 */
function mergeFinancesTransactionsByOrder(transactions) {
  const orderMap = new Map();
  for (const txn of transactions) {
    const orderId = txn.orderId || null;
    const orderRef = txn.references?.find(r => r.referenceType === 'ORDER_ID');
    const effectiveOrderId = orderId || orderRef?.referenceId || txn.transactionId;

    if (!orderMap.has(effectiveOrderId)) {
      orderMap.set(effectiveOrderId, {
        orderId: effectiveOrderId,
        amount: parseFloat(txn.amount?.value || 0),
        currency: txn.amount?.currency || 'USD',
        transactionDate: txn.transactionDate
      });
    } else {
      const existing = orderMap.get(effectiveOrderId);
      existing.amount += parseFloat(txn.amount?.value || 0);
    }
  }
  return orderMap;
}

function sumOrderMapAmounts(orderMap) {
  let sum = 0;
  let currency = 'USD';
  for (const row of orderMap.values()) {
    sum += row.amount;
    if (row.currency) currency = row.currency;
  }
  return { sum: parseFloat(sum.toFixed(2)), currency };
}

/**
 * Merge NON_SALE_CHARGE pages into adFeeMap for one marketplace.
 */
async function fetchNonSaleChargesIntoMap(accessToken, marketplaceId, adFeeMap) {
  let offset = 0;
  const limit = 200;
  let hasMore = true;
  const mp = normalizeFinancesMarketplaceId(marketplaceId);

  while (hasMore) {
    const baseUrl = 'https://apiz.ebay.com/sell/finances/v1/transaction';
    const filterValue = 'transactionType:{NON_SALE_CHARGE}';

    const response = await axios.get(baseUrl, {
      headers: financesApiHeaders(accessToken, mp),
      params: {
        filter: filterValue,
        limit,
        offset
      }
    });

    const transactions = response.data?.transactions || [];

    for (const txn of transactions) {
      if (txn.feeType === 'AD_FEE' && txn.references) {
        const orderRef = txn.references.find(ref => ref.referenceType === 'ORDER_ID');

        if (orderRef) {
          const orderId = orderRef.referenceId;
          const feeAmount = Math.abs(parseFloat(txn.amount?.value || 0));

          const existingFee = adFeeMap.get(orderId) || 0;
          if (txn.bookingEntry === 'CREDIT') {
            adFeeMap.set(orderId, existingFee - feeAmount);
          } else {
            adFeeMap.set(orderId, existingFee + feeAmount);
          }
        }
      }
    }

    if (transactions.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
      if (offset >= 10000) {
        console.log(`[Finances API] Reached safety limit at offset ${offset} (marketplace ${mp})`);
        hasMore = false;
      }
    }
  }
}

// ============================================
// HELPER: Fetch ALL Ad Fees from Finances API
// ============================================
// Returns a Map of orderId -> adFee amount
// This is more efficient than fetching per-order
async function fetchAllAdFees(accessToken, marketplaceIds = ['EBAY_US'], sinceDate = null) {
  const adFeeMap = new Map();

  void sinceDate; // reserved for future date filtering

  const ids = (Array.isArray(marketplaceIds) && marketplaceIds.length
    ? [...new Set(marketplaceIds.map(normalizeFinancesMarketplaceId))]
    : ['EBAY_US']);

  console.log(`[Finances API] Fetching all AD_FEE transactions for marketplaces: ${ids.join(', ')}...`);

  try {
    for (const mp of ids) {
      await fetchNonSaleChargesIntoMap(accessToken, mp, adFeeMap);
    }

    console.log(`[Finances API] Built ad fee map with ${adFeeMap.size} orders`);
    return { success: true, adFeeMap };

  } catch (error) {
    if (error.response?.status === 403) {
      console.log(`[Finances API] Missing sell.finances scope`);
      return { success: false, error: 'missing_scope', adFeeMap: new Map() };
    }
    // Log detailed error info for debugging
    console.error(`[Finances API] Error fetching ad fees:`, error.message);
    console.error(`[Finances API] Status:`, error.response?.status);
    console.error(`[Finances API] Response:`, JSON.stringify(error.response?.data, null, 2));
    return { success: false, error: error.message, adFeeMap: new Map() };
  }
}

// Single order lookup (used when ad fee map is not available)
async function fetchOrderAdFee(accessToken, orderId, adFeeMap = null, marketplaceId = 'EBAY_US') {
  // If we have a pre-built map, use it
  if (adFeeMap) {
    const adFee = adFeeMap.get(orderId) || 0;
    return { success: true, adFeeGeneral: adFee };
  }

  // Otherwise, we need to search through transactions
  // This is less efficient but works for single lookups
  try {
    const mp = normalizeFinancesMarketplaceId(marketplaceId);
    const response = await axios.get(
      `https://apiz.ebay.com/sell/finances/v1/transaction`,
      {
        headers: financesApiHeaders(accessToken, mp),
        params: {
          filter: `transactionType:{NON_SALE_CHARGE}`,
          limit: 200
        }
      }
    );

    const transactions = response.data?.transactions || [];
    let adFeeTotal = 0;

    for (const txn of transactions) {
      if (txn.feeType === 'AD_FEE' && txn.references) {
        const matchingRef = txn.references.find(
          ref => ref.referenceType === 'ORDER_ID' && ref.referenceId === orderId
        );

        if (matchingRef) {
          const feeAmount = Math.abs(parseFloat(txn.amount?.value || 0));
          if (txn.bookingEntry === 'CREDIT') {
            adFeeTotal -= feeAmount;
          } else {
            adFeeTotal += feeAmount;
          }
        }
      }
    }

    return { success: true, adFeeGeneral: Math.max(0, adFeeTotal) };
  } catch (error) {
    if (error.response?.status === 403) {
      return { success: false, error: 'missing_scope', adFeeGeneral: null };
    }
    console.error(`[Finances API] Error fetching ad fee for ${orderId}:`, error.message);
    return { success: false, error: error.message, adFeeGeneral: null };
  }
}

// ============================================
// HELPER: Handle Order Payment Status Change
// ============================================
/**
 * Handles refund processing when orderPaymentStatus changes
 * FULLY_REFUNDED: Set earnings to $0
 * PARTIALLY_REFUNDED: Set earnings to $0
 * @param {Object} existingOrder - The order document from DB
 * @param {String} newPaymentStatus - The new payment status from eBay
 * @param {String} accessToken - Valid eBay access token
 * @param {ObjectId} sellerId - The seller ID
 * @returns {Object} - Updated order data or null if no action needed
 */
async function handleOrderPaymentStatusChange(existingOrder, newPaymentStatus, accessToken, sellerId) {
  const oldStatus = existingOrder.orderPaymentStatus;

  // Only process if status actually changed
  if (oldStatus === newPaymentStatus) {
    return null;
  }

  console.log(`[Refund Handler] Status change detected for ${existingOrder.orderId}: ${oldStatus} → ${newPaymentStatus}`);

  if (newPaymentStatus === 'FULLY_REFUNDED') {
    // ========== FULLY REFUNDED: Set earnings to $0 ==========
    console.log(`[Refund Handler] FULLY_REFUNDED: Setting earnings to $0 for ${existingOrder.orderId}`);

    // Calculate financial fields with $0 earnings
    const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
      existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
    const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);

    return {
      subtotal: 0,
      subtotalUSD: 0,
      shipping: 0,
      shippingUSD: 0,
      salesTax: 0,
      salesTaxUSD: 0,
      discount: 0,
      discountUSD: 0,
      transactionFees: 0,
      transactionFeesUSD: 0,
      adFeeGeneral: 0,
      orderEarnings: 0,
      ...financials
    };

  } else if (newPaymentStatus === 'PARTIALLY_REFUNDED') {
    // ========== PARTIALLY REFUNDED: Set earnings to $0 ==========
    console.log(`[Refund Handler] PARTIALLY_REFUNDED: Setting earnings to $0 for ${existingOrder.orderId}`);

    try {
      // Fetch updated ad fee from Finances API
      const financesMp = purchaseMarketplaceToFinancesId(existingOrder.purchaseMarketplaceId);
      const adFeeResult = await fetchOrderAdFee(accessToken, existingOrder.orderId, null, financesMp);
      const adFeeGeneral = adFeeResult.success ? adFeeResult.adFeeGeneral : existingOrder.adFeeGeneral;

      // Calculate financial fields with $0 earnings while preserving order total for TDS
      const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
        existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
      const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);

      return {
        adFeeGeneral,
        orderEarnings: 0,
        ...financials
      };

    } catch (error) {
      console.error(`[Refund Handler] Error fetching ad fee for ${existingOrder.orderId}:`, error.message);

      // Calculate financial fields with $0 earnings while preserving order total for TDS
      const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
        existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
      const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);

      return {
        orderEarnings: 0,
        ...financials
      };
    }
  }

  // No action needed for other statuses
  return null;
}

// ============================================
// HELPER: Calculate Order Earnings (Not needed anymore - kept for compatibility)
// ============================================
/**
 * Simple function that returns $0 for FULLY_REFUNDED orders
 * Not actively used - earnings are calculated in buildOrderData() for PAID orders
 * @returns {Object} - { orderEarnings: 0 }
 */
function calculateOrderEarnings() {
  // FULLY_REFUNDED orders always show $0 earnings
  return {
    orderEarnings: 0
  };
}


// --- NEW CONFIG: AUTOMATED WELCOME MESSAGE ---
// Keep disabled by default to avoid backfill/polling sending messages to older orders.
const ENABLE_AUTO_WELCOME = process.env.ENABLE_AUTO_WELCOME === 'true';
const AUTO_WELCOME_MAX_ORDER_AGE_HOURS = Math.max(
  1,
  parseInt(process.env.AUTO_WELCOME_MAX_ORDER_AGE_HOURS || '24', 10) || 24
);
const WELCOME_TEMPLATE = `Hello {BUYER_NAME},

Thank you for your recent purchase!

Orders are typically shipped within 12–24 hours. We will keep you updated, and once your order is shipped, the tracking details will be available on your eBay order page.

If you need any assistance, please feel free to message us at any time. Wishing you a wonderful day!`;

// --- HELPER: Send Auto Welcome Message ---
async function sendAutoWelcomeMessage(seller, order) {
  if (!ENABLE_AUTO_WELCOME) return;

  try {
    // Never auto-message orders that are already fulfilled/refunded/cancelled.
    if (order?.orderFulfillmentStatus === 'FULFILLED') return;
    if (order?.orderPaymentStatus === 'FULLY_REFUNDED' || order?.orderPaymentStatus === 'PARTIALLY_REFUNDED') return;
    if (order?.cancelStatus?.cancelState && order.cancelStatus.cancelState !== 'NONE_REQUESTED') return;

    // Guard against backfilled/older orders during polling sync runs.
    const orderCreatedAt = order?.creationDate ? new Date(order.creationDate) : null;
    if (orderCreatedAt && !Number.isNaN(orderCreatedAt.getTime())) {
      const ageMs = Date.now() - orderCreatedAt.getTime();
      if (ageMs > AUTO_WELCOME_MAX_ORDER_AGE_HOURS * 60 * 60 * 1000) return;
    }

    // Prevent duplicate auto-welcome messages for the same order.
    const existingAutoWelcome = await Message.exists({
      seller: seller._id,
      orderId: order.orderId,
      sender: 'SELLER',
      subject: { $regex: /^Thanks for your order!/i }
    });
    if (existingAutoWelcome) return;

    const buyerUsername = order.buyer?.username;
    const buyerName = order.buyer?.buyerRegistrationAddress?.fullName || buyerUsername;

    // 1. Get First Item Details
    const lineItem = order.lineItems?.[0];
    const itemId = lineItem?.legacyItemId;
    let itemTitle = lineItem?.title;

    // 2. CHECK FOR MULTIPLE ITEMS
    const itemCount = order.lineItems?.length || 0;
    if (itemCount > 1) {
      // Append count to title: "iPad Case (+ 1 other)"
      itemTitle = `${itemTitle} (+ ${itemCount - 1} other${itemCount - 1 > 1 ? 's' : ''})`;
    }

    if (!buyerUsername || !itemId) return;

    // 1. Prepare the Message Body
    const sellerName = seller.user?.username || "The Team";
    const body = WELCOME_TEMPLATE
      .replace('{BUYER_NAME}', buyerName.split(' ')[0]) // Use First Name only for a personal touch
      .replace('{SELLER_NAME}', sellerName);

    // 2. Get Token
    const token = await ensureValidToken(seller);

    // 3. XML Request (Same as your send-message route)
    const xmlRequest = `
      <?xml version="1.0" encoding="utf-8"?>
      <AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
        <ItemID>${itemId}</ItemID>
        <MemberMessage>
          <Body>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Body>
          <Subject>Thanks for your order! #${order.orderId}</Subject>
          <QuestionType>General</QuestionType>
          <RecipientID>${buyerUsername}</RecipientID>
        </MemberMessage>
      </AddMemberMessageAAQToPartnerRequest>
    `;

    // 4. Send to eBay
    await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': 'AddMemberMessageAAQToPartner',
        'Content-Type': 'text/xml'
      }
    });

    console.log(`[Auto-Welcome] Sent to ${buyerUsername} for Order ${order.orderId}`);

    // 5. Save to DB so it shows in your chat window immediately
    await Message.create({
      seller: seller._id,
      orderId: order.orderId,
      itemId: itemId,
      itemTitle: itemTitle,
      buyerUsername: buyerUsername,
      sender: 'SELLER',
      subject: `Thanks for your order! #${order.orderId}`,
      body: body,
      read: true,
      messageType: 'ORDER',
      messageDate: new Date()
    });

  } catch (err) {
    console.error(`[Auto-Welcome] Failed for ${order.orderId}:`, err.message);
    // Don't throw error here, so we don't stop the polling process
  }
}

// HELPER: Extract clean text from HTML email bodies
function extractTextFromHtml(html) {
  if (!html) return '';

  // Check if it's actually HTML (contains tags)
  if (!/<[^>]+>/.test(html)) {
    return html.trim();
  }

  let cleanText = '';

  // Strategy 1: Try to extract from UserInputtedText div (buyer's actual message)
  const userInputMatch = html.match(/<div\s+id=["']UserInputtedText["'][^>]*>(.*?)<\/div>/is);
  if (userInputMatch && userInputMatch[1]) {
    cleanText = userInputMatch[1];
  } else {
    // Strategy 2: Try to extract from V4PrimaryMessage hidden div
    const v4Match = html.match(/<div\s+id=["']V4PrimaryMessage["'][^>]*>.*?<strong>Dear[^<]*<\/strong>\s*(?:<br\s*\/?>)*\s*(.*?)\s*(?:<br\s*\/?>)*\s*<\/font>/is);
    if (v4Match && v4Match[1]) {
      cleanText = v4Match[1];
    } else {
      // Strategy 3: Strip all HTML tags
      cleanText = html;
    }
  }

  // Remove all HTML tags
  cleanText = cleanText.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  cleanText = cleanText
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Clean up whitespace
  cleanText = cleanText
    .replace(/\s+/g, ' ')  // Multiple spaces to single space
    .replace(/\n\s*\n/g, '\n')  // Multiple newlines to single
    .trim();

  return cleanText;
}

// HELPER: Process a single eBay XML Message and save to DB
async function processEbayMessage(msg, seller) {
  try {
    const question = msg.Question?.[0];
    if (!question) return false;

    const msgID = question.MessageID?.[0];
    const senderID = question.SenderID?.[0];
    const senderEmail = question.SenderEmail?.[0];
    const rawBody = question.Body?.[0];
    const body = extractTextFromHtml(rawBody); // Clean HTML if present
    const subject = question.Subject?.[0];
    const itemID = msg.Item?.[0]?.ItemID?.[0];
    const itemTitle = msg.Item?.[0]?.Title?.[0];

    // --- EXTRACT IMAGES (NEW) ---
    const mediaUrls = [];
    // Check if MessageMedia exists and is an array
    if (msg.MessageMedia && Array.isArray(msg.MessageMedia)) {
      msg.MessageMedia.forEach(media => {
        if (media.MediaURL && media.MediaURL[0]) {
          mediaUrls.push(media.MediaURL[0]);
        }
      });
    }
    // Sometimes it's inside the Question tag as well
    if (question.MessageMedia && Array.isArray(question.MessageMedia)) {
      question.MessageMedia.forEach(media => {
        if (media.MediaURL && media.MediaURL[0]) {
          mediaUrls.push(media.MediaURL[0]);
        }
      });
    }
    // ----------------------------

    // --- DATE PARSING ---
    const rawDate = question.CreationDate?.[0];
    let messageDate = new Date();
    if (rawDate) {
      const parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) messageDate = parsedDate;
    }

    // 1. Prevent Duplicates
    const exists = await Message.findOne({ externalMessageId: msgID });
    if (exists) return false;

    // 2. Determine Message Type (ORDER, INQUIRY, or DIRECT)
    let orderId = null;
    let messageType = 'INQUIRY'; // Default
    let finalItemId = itemID;
    let finalItemTitle = itemTitle;

    if (itemID && senderID) {
      // HAS ITEM: Check if it's an order or inquiry
      const order = await Order.findOne({
        'lineItems.legacyItemId': itemID,
        'buyer.username': senderID
      });
      if (order) {
        orderId = order.orderId;
        messageType = 'ORDER';
        console.log(`[Message] ORDER message for item ${itemID} from ${senderID}`);
      } else {
        messageType = 'INQUIRY';
        console.log(`[Message] INQUIRY about item ${itemID} from ${senderID}`);
      }
    } else if (!itemID && senderID) {
      // NO ITEM: Direct message to seller account
      messageType = 'DIRECT';
      finalItemId = 'DIRECT_MESSAGE';
      finalItemTitle = 'Direct Message (No Item)';
      console.log(`[Message] DIRECT message from ${senderID}: ${subject}`);
    }

    // 3. Save to DB
    await Message.create({
      seller: seller._id,
      orderId,
      itemId: finalItemId,
      itemTitle: finalItemTitle,
      buyerUsername: senderID,
      externalMessageId: msgID,
      sender: 'BUYER',
      subject: subject,
      body: body,
      mediaUrls: mediaUrls,
      read: false,
      messageType,
      messageDate: messageDate
    });

    return true;
  } catch (err) {
    console.error('Error processing message:', err.message);
    return false;
  }
}


// Helper function to extract tracking number from fulfillmentHrefs
async function extractTrackingNumber(fulfillmentHrefs, accessToken) {
  if (!fulfillmentHrefs || fulfillmentHrefs.length === 0) return null;
  try {
    // fulfillmentHrefs contains URLs to fulfillment details
    // Example: "https://api.ebay.com/sell/fulfillment/v1/order/00-00000-00000/fulfillment/00000000000000"
    const fulfillmentUrl = fulfillmentHrefs[0];
    const response = await axios.get(fulfillmentUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    // Extract tracking number from the fulfillment response
    // Check multiple possible locations in the response
    const trackingNumber = response.data?.shipmentTrackingNumber ||
      response.data?.lineItems?.[0]?.shipmentTrackingNumber ||
      response.data?.shippingCarrierCode && response.data?.trackingNumber ||
      null;

    if (!trackingNumber) {
      console.log(`  ⚠️ Fulfillment response has no tracking. Keys: ${Object.keys(response.data || {}).join(', ')}`);
    }
    return trackingNumber;
  } catch (err) {
    console.error(`  ❌ Failed to extract tracking number: ${err.message} (status: ${err.response?.status})`);
    return null;
  }
}

async function connectSellerToEbayOAuthCode({ userId, code }) {
  const normalizedCode = normalizeEbayOAuthCode(code);
  if (!normalizedCode) {
    const err = new Error('Missing authorization code');
    err.statusCode = 400;
    throw err;
  }

  const redirectUri = getEbayOAuthRedirectUri();
  if (!redirectUri) {
    const err = new Error('Missing EBAY_RU_NAME / EBAY_OAUTH_REDIRECT_URI');
    err.statusCode = 500;
    throw err;
  }

  let tokenRes;
  try {
    tokenRes = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code: normalizedCode,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
        },
      }
    );
  } catch (e) {
    const ebay = e.response?.data;
    console.error('[eBay OAuth] Token exchange failed:', ebay || e.message);
    const msg =
      ebay?.error_description ||
      ebay?.error ||
      e.response?.statusText ||
      e.message ||
      'Failed to exchange authorization code';
    const err = new Error(msg);
    err.statusCode = e.response?.status || 502;
    err.details = ebay;
    throw err;
  }

  const seller = await Seller.findOne({ user: userId });
  if (!seller) {
    const err = new Error('Seller not found');
    err.statusCode = 404;
    throw err;
  }

  console.log(`[eBay OAuth] Full token response keys:`, Object.keys(tokenRes.data));
  console.log(`[eBay OAuth] Seller connected. Scope granted by eBay: ${tokenRes.data.scope}`);

  const grantedScope = tokenRes.data.scope || '';
  if (!grantedScope.includes('sell.payment.dispute')) {
    console.warn(`[eBay OAuth] WARNING: sell.payment.dispute scope NOT granted! Seller will not be able to fetch payment disputes.`);
    console.warn(`[eBay OAuth] Make sure the scope is enabled in your eBay Developer Portal app settings.`);
    console.warn(`[eBay OAuth] Granted scopes were: ${grantedScope || 'NONE'}`);
  } else {
    console.log(`[eBay OAuth] SUCCESS: sell.payment.dispute scope was granted!`);
  }

  seller.ebayTokens = {
    access_token: tokenRes.data.access_token,
    refresh_token: tokenRes.data.refresh_token,
    expires_in: tokenRes.data.expires_in,
    refresh_token_expires_in: tokenRes.data.refresh_token_expires_in,
    token_type: tokenRes.data.token_type,
    scope: tokenRes.data.scope,
    fetchedAt: new Date()
  };
  seller.isStoreActive = true;
  seller.lastConnectedAt = new Date();
  seller.reconnectedAt = new Date();
  seller.disconnectedAt = null;
  await seller.save();

  // Fetch first 15 orders for new seller (best-effort)
  try {
    const ordersRes = await axios.get('https://api.ebay.com/sell/fulfillment/v1/order', {
      headers: {
        Authorization: `Bearer ${tokenRes.data.access_token}`,
        'Content-Type': 'application/json',
      },
      params: {
        limit: 15
      },
    });

    const ebayOrders = ordersRes.data.orders || [];

    for (const order of ebayOrders) {
      const lineItem = order.lineItems?.[0] || {};
      const fulfillmentInstr = order.fulfillmentStartInstructions?.[0] || {};
      const shipTo = fulfillmentInstr.shippingStep?.shipTo || {};
      const buyerAddr = `${shipTo.contactAddress?.addressLine1 || ''}, ${shipTo.contactAddress?.city || ''}, ${shipTo.contactAddress?.stateOrProvince || ''}, ${shipTo.contactAddress?.postalCode || ''}, ${shipTo.contactAddress?.countryCode || ''}`.trim();

      const trackingNumber = await extractTrackingNumber(order.fulfillmentHrefs, tokenRes.data.access_token);
      const purchaseMarketplaceId = lineItem.purchaseMarketplaceId || '';

      await Order.findOneAndUpdate(
        { orderId: order.orderId },
        {
          seller: seller._id,
          orderId: order.orderId,
          legacyOrderId: order.legacyOrderId,
          creationDate: order.creationDate,
          lastModifiedDate: order.lastModifiedDate,
          orderFulfillmentStatus: order.orderFulfillmentStatus,
          orderPaymentStatus: order.orderPaymentStatus,
          sellerId: order.sellerId,
          buyer: order.buyer,
          buyerCheckoutNotes: order.buyerCheckoutNotes,
          pricingSummary: order.pricingSummary,
          cancelStatus: order.cancelStatus,
          paymentSummary: order.paymentSummary,
          fulfillmentStartInstructions: order.fulfillmentStartInstructions,
          lineItems: order.lineItems,
          ebayCollectAndRemitTax: order.ebayCollectAndRemitTax,
          salesRecordReference: order.salesRecordReference,
          totalFeeBasisAmount: order.totalFeeBasisAmount,
          totalMarketplaceFee: order.totalMarketplaceFee,
          dateSold: order.creationDate,
          shipByDate: lineItem.lineItemFulfillmentInstructions?.shipByDate,
          estimatedDelivery: lineItem.lineItemFulfillmentInstructions?.maxEstimatedDeliveryDate,
          productName: lineItem.title,
          itemNumber: lineItem.legacyItemId,
          buyerAddress: buyerAddr,
          shippingFullName: shipTo.fullName || '',
          shippingAddressLine1: shipTo.contactAddress?.addressLine1 || '',
          shippingAddressLine2: shipTo.contactAddress?.addressLine2 || '',
          shippingCity: shipTo.contactAddress?.city || '',
          shippingState: shipTo.contactAddress?.stateOrProvince || '',
          shippingPostalCode: shipTo.contactAddress?.postalCode || '',
          shippingCountry: shipTo.contactAddress?.countryCode || '',
          shippingPhone: '0000000000',
          quantity: lineItem.quantity,
          subtotal: parseFloat(order.pricingSummary?.priceSubtotal?.value || 0),
          salesTax: parseFloat(lineItem.ebayCollectAndRemitTaxes?.[0]?.amount?.value || 0),
          discount: parseFloat(order.pricingSummary?.priceDiscount?.value || 0),
          shipping: parseFloat(order.pricingSummary?.deliveryCost?.value || 0),
          transactionFees: parseFloat(order.totalMarketplaceFee?.value || 0),
          adFee: parseFloat(lineItem.appliedPromotions?.[0]?.discountAmount?.value || 0),
          cancelState: order.cancelStatus?.cancelState || 'NONE_REQUESTED',
          refunds: order.paymentSummary?.refunds || [],
          trackingNumber: trackingNumber,
          purchaseMarketplaceId: purchaseMarketplaceId
        },
        { upsert: true, new: true }
      );
    }
  } catch (orderErr) {
    console.error('Failed to fetch initial orders:', orderErr.message);
  }

  return { sellerId: seller._id };
}

// 1. Start OAuth: Redirect to eBay
router.get('/connect', (req, res) => {
  console.log('========================================');
  console.log('[eBay OAuth] /connect endpoint HIT!');
  console.log('========================================');

  const { token } = req.query; // Get JWT from query param
  if (!token) return res.status(400).send('Missing authentication token');

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = getEbayOAuthRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({
      error: 'eBay OAuth is not configured',
      missing: {
        EBAY_CLIENT_ID: !clientId,
        EBAY_CLIENT_SECRET: !clientSecret,
        RESOLVED_REDIRECT_URI: !redirectUri,
      },
    });
  }

  // Pass the user's JWT as state parameter so we can identify them in callback.
  // IMPORTANT: do not URL-encode the JWT here — encodeURIComponent() below already encodes `state`.
  const state = token;
  const redirectUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(EBAY_OAUTH_SCOPES)}&state=${encodeURIComponent(state)}`;

  console.log('[eBay OAuth] Scopes requested:', EBAY_OAUTH_SCOPES);
  console.log('[eBay OAuth] Full redirect URL:', redirectUrl);
  res.redirect(redirectUrl);
});

// 2. OAuth Callback: Exchange code for tokens and save to seller
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  if (!state) return res.status(400).send('Missing state parameter');
  if (!getEbayOAuthRedirectUri()) return res.status(500).send('Missing EBAY_RU_NAME / EBAY_OAUTH_REDIRECT_URI');

  try {
    const token = normalizeOAuthStateToken(state);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    await connectSellerToEbayOAuthCode({ userId, code });

    // Redirect back to seller profile with success message
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    res.redirect(`${clientOrigin}/seller-ebay?connected=true`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual OAuth completion (when eBay ends on an interstitial page and doesn't redirect to /callback)
router.post('/oauth/complete', requireAuth, requireRole('seller'), async (req, res) => {
  try {
    const { code, state } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Missing code' });
    if (!state) return res.status(400).json({ error: 'Missing state' });
    if (!getEbayOAuthRedirectUri()) return res.status(500).json({ error: 'Missing EBAY_RU_NAME / EBAY_OAUTH_REDIRECT_URI' });

    const stateToken = normalizeOAuthStateToken(state);
    const decoded = jwt.verify(stateToken, process.env.JWT_SECRET);

    if (String(decoded.userId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'State does not match logged-in user' });
    }

    await connectSellerToEbayOAuthCode({ userId: decoded.userId, code });
    return res.json({ success: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || 'Failed to complete OAuth',
      details: err.details || null,
    });
  }
});

// 3. Fetch Orders (for polling) by sellerId, region(s), with token refresh
router.get('/orders', async (req, res) => {
  const { sellerId, region } = req.query;
  if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });
  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.ebayTokens || !seller.ebayTokens.access_token) {
      return res.status(400).json({ error: 'Seller does not have a connected eBay account' });
    }
    // Check token expiry (expires_in is in seconds, fetchedAt is Date)
    const now = Date.now();
    const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
    const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
    // Refresh if less than 2 minutes left
    let accessToken = seller.ebayTokens.access_token;
    if (fetchedAt && (now - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
      // Refresh token
      try {
        const refreshRes = await axios.post(
          'https://api.ebay.com/identity/v1/oauth2/token',
          qs.stringify({
            grant_type: 'refresh_token',
            refresh_token: seller.ebayTokens.refresh_token,
            scope: EBAY_OAUTH_SCOPES, // Using centralized scopes constant
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
            },
          }
        );
        seller.ebayTokens.access_token = refreshRes.data.access_token;
        seller.ebayTokens.expires_in = refreshRes.data.expires_in;
        seller.ebayTokens.fetchedAt = new Date();
        await seller.save();
        accessToken = refreshRes.data.access_token;
      } catch (refreshErr) {
        return res.status(401).json({ error: 'Failed to refresh eBay token', details: refreshErr.message });
      }
    }

    // Get the last modified date from our database to fetch only new/updated orders
    const orderCount = await Order.countDocuments({ seller: seller._id });
    const lastOrder = await Order.findOne({ seller: seller._id }).sort({ lastModifiedDate: -1 });
    const lastModifiedDate = lastOrder ? lastOrder.lastModifiedDate : null;

    const toDate = new Date();
    let filter;
    if (orderCount === 0 || !lastModifiedDate) {
      const fromDate = new Date(Date.now() - EBAY_ORDER_INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      filter = `creationdate:[${fromDate.toISOString()}..${toDate.toISOString()}]`;
    } else {
      filter = `lastmodifieddate:[${new Date(lastModifiedDate).toISOString()}..${toDate.toISOString()}]`;
    }

    const ebayOrders = await fetchAllOrdersWithPagination(
      accessToken,
      filter,
      `seller-${sellerId}`
    );

    // Save/update orders in database
    for (const order of ebayOrders) {
      const lineItem = order.lineItems?.[0] || {};
      const fulfillmentInstr = order.fulfillmentStartInstructions?.[0] || {};
      const shipTo = fulfillmentInstr.shippingStep?.shipTo || {};
      const buyerAddr = `${shipTo.contactAddress?.addressLine1 || ''}, ${shipTo.contactAddress?.city || ''}, ${shipTo.contactAddress?.stateOrProvince || ''}, ${shipTo.contactAddress?.postalCode || ''}, ${shipTo.contactAddress?.countryCode || ''}`.trim();

      // Extract tracking number if fulfillmentHrefs exists
      const trackingNumber = await extractTrackingNumber(order.fulfillmentHrefs, accessToken);

      // Extract purchaseMarketplaceId from lineItems
      const purchaseMarketplaceId = lineItem.purchaseMarketplaceId || '';

      await Order.findOneAndUpdate(
        { orderId: order.orderId },
        {
          seller: seller._id,
          orderId: order.orderId,
          legacyOrderId: order.legacyOrderId,
          creationDate: order.creationDate,
          lastModifiedDate: order.lastModifiedDate,
          orderFulfillmentStatus: order.orderFulfillmentStatus,
          orderPaymentStatus: order.orderPaymentStatus,
          sellerId: order.sellerId,
          buyer: order.buyer,
          buyerCheckoutNotes: order.buyerCheckoutNotes,
          pricingSummary: order.pricingSummary,
          cancelStatus: order.cancelStatus,
          paymentSummary: order.paymentSummary,
          fulfillmentStartInstructions: order.fulfillmentStartInstructions,
          lineItems: order.lineItems,
          ebayCollectAndRemitTax: order.ebayCollectAndRemitTax,
          salesRecordReference: order.salesRecordReference,
          totalFeeBasisAmount: order.totalFeeBasisAmount,
          totalMarketplaceFee: order.totalMarketplaceFee,
          // Denormalized fields
          dateSold: order.creationDate,
          shipByDate: lineItem.lineItemFulfillmentInstructions?.shipByDate,
          estimatedDelivery: lineItem.lineItemFulfillmentInstructions?.maxEstimatedDeliveryDate,
          productName: lineItem.title,
          itemNumber: lineItem.legacyItemId,
          buyerAddress: buyerAddr,
          shippingFullName: shipTo.fullName || '',
          shippingAddressLine1: shipTo.contactAddress?.addressLine1 || '',
          shippingAddressLine2: shipTo.contactAddress?.addressLine2 || '',
          shippingCity: shipTo.contactAddress?.city || '',
          shippingState: shipTo.contactAddress?.stateOrProvince || '',
          shippingPostalCode: shipTo.contactAddress?.postalCode || '',
          shippingCountry: shipTo.contactAddress?.countryCode || '',
          shippingPhone: '0000000000',
          quantity: lineItem.quantity,
          subtotal: parseFloat(order.pricingSummary?.priceSubtotal?.value || 0),
          salesTax: parseFloat(lineItem.ebayCollectAndRemitTaxes?.[0]?.amount?.value || 0),
          discount: parseFloat(order.pricingSummary?.priceDiscount?.value || 0),
          shipping: parseFloat(order.pricingSummary?.deliveryCost?.value || 0),
          transactionFees: parseFloat(order.totalMarketplaceFee?.value || 0),
          adFee: parseFloat(lineItem.appliedPromotions?.[0]?.discountAmount?.value || 0),
          cancelState: order.cancelStatus?.cancelState || 'NONE_REQUESTED',
          refunds: order.paymentSummary?.refunds || [],
          trackingNumber: trackingNumber,
          purchaseMarketplaceId: purchaseMarketplaceId
        },
        { upsert: true, new: true }
      );
    }

    // Return orders from database
    const dbOrders = await Order.find({ seller: seller._id }).sort({ creationDate: -1 }).limit(200);
    res.json({ orders: dbOrders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// New endpoint: Get orders with any cancellation status
router.get('/cancelled-orders', async (req, res) => {
  try {
    const { startDate, endDate, sellerId, marketplace, page = 1, limit = 50 } = req.query;

    console.log(`[Cancelled Orders] Fetching all cancellation orders`);

    // Build query for cancellation states
    const query = {
      cancelState: { $in: ['CANCEL_REQUESTED', 'IN_PROGRESS', 'CANCELED', 'CANCELLED'] }
    };

    // Add filters
    if (sellerId) {
      query.seller = sellerId;
    }

    if (marketplace) {
      // Handle the Canada edge case if consistent with other endpoints, otherwise exact match
      query.purchaseMarketplaceId = marketplace;
    }

    // Add date filter if provided (using PST timezone logic like other endpoints)
    if (startDate || endDate) {
      query.dateSold = {};
      const PST_OFFSET_HOURS = 8;

      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(PST_OFFSET_HOURS, 0, 0, 0);
        query.dateSold.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        end.setUTCHours(PST_OFFSET_HOURS - 1, 59, 59, 999);
        query.dateSold.$lte = end;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalCount = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    const cancelledOrders = await Order.find(query)
      .populate({
        path: 'seller',
        populate: {
          path: 'user',
          select: 'username email'
        }
      })
      .sort({ creationDate: -1 })
      .skip(skip)
      .limit(limitNum);

    console.log(`[Cancelled Orders] Found ${cancelledOrders.length} cancellation orders (page ${pageNum}/${totalPages})`);

    res.json({
      orders: cancelledOrders,
      totalOrders: totalCount,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalOrders: totalCount,
        limit: limitNum
      }
    });
  } catch (err) {
    console.error('[Cancelled Orders] Error:', err);
    res.status(500).json({ error: err.message });
  }
});




// Get a single order by orderId
router.get('/order/:orderId', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findOne({ orderId })
      .populate({
        path: 'seller',
        populate: {
          path: 'user',
          select: 'username email'
        }
      });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    console.error('[Get Order] Error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Get stored orders from database with pagination support
router.get('/stored-orders', async (req, res) => {
  const { sellerId, page = 1, limit = 50, searchOrderId, searchAzOrderId, searchBuyerName, searchItemId, searchMarketplace, paymentStatus, startDate, endDate, awaitingShipment, hasFulfillmentNotes, amazonArriving, arrivalSort, amazonAccount, arrivalStartDate, arrivalEndDate, arrivalDateFrom, arrivalDateTo, productName, excludeClient } = req.query;

  try {
    let query = {};
    await applyActiveSellerScope(query, sellerId);

    if (excludeClient === 'true') {
      const excludedSellerIds = await getExcludedClientSellerIds();
      if (excludedSellerIds.length > 0) {
        query.$and = query.$and || [];
        query.$and.push({ seller: { $nin: excludedSellerIds } });
      }
    }

    // --- Awaiting Shipment Filter ---
    if (awaitingShipment === 'true') {
      // Condition 1: Must NOT have a tracking number
      query.$or = [
        { trackingNumber: { $exists: false } },
        { trackingNumber: null },
        { trackingNumber: '' }
      ];

      // Condition 2: Include orders with no cancellation OR with IN_PROGRESS cancellation
      // IN_PROGRESS means buyer requested cancel but seller hasn't responded yet
      // These still need attention (either ship or cancel)
      query.cancelState = { $in: ['NONE_REQUESTED', 'IN_PROGRESS', null, ''] };
    }

    // --- Has Fulfillment Notes Filter ---
    if (hasFulfillmentNotes === 'true') {
      query.fulfillmentNotes = { $exists: true, $nin: ['', null] };
    }

    const arrivalRangeStart = arrivalDateFrom || arrivalStartDate;
    const arrivalRangeEnd = arrivalDateTo || arrivalEndDate;

    // --- Amazon Arrivals Filter ---
    if (amazonArriving === 'true') {
      // Only show orders with arrivingDate in ISO format (YYYY-MM-DD)
      query.arrivingDate = {
        $exists: true,
        $ne: null,
        $ne: '',
        $regex: /^\d{4}-\d{2}-\d{2}/ // Only ISO formatted dates
      };

      // Exclude orders marked as Delivered
      query.remark = { $ne: 'Delivered' };

      // Optional arrival date range filter (string compare is safe for YYYY-MM-DD)
      if (arrivalRangeStart || arrivalRangeEnd) {
        if (arrivalRangeStart) query.arrivingDate.$gte = arrivalRangeStart;
        if (arrivalRangeEnd) query.arrivingDate.$lte = arrivalRangeEnd;
      }
    } else if (arrivalRangeStart || arrivalRangeEnd) {
      // Arrival date range filter for non-Amazon-Arrivals views (e.g. Awaiting Shipment)
      query.arrivingDate = {
        ...(arrivalRangeStart ? { $gte: arrivalRangeStart } : {}),
        ...(arrivalRangeEnd ? { $lte: arrivalRangeEnd } : {})
      };
    }

    // Amazon Account Filter
    if (amazonAccount && amazonAccount !== '') {
      query.amazonAccount = amazonAccount;
    }

    // Apply search filters
    if (searchOrderId) {
      // Strict Order ID search (ignores legacyOrderId)
      query.orderId = { $regex: searchOrderId, $options: 'i' };
    }

    if (searchAzOrderId) {
      query.azOrderId = { $regex: searchAzOrderId, $options: 'i' };
    }

    if (searchBuyerName) {
      const buyerClause = {
        $or: [
          { 'buyer.buyerRegistrationAddress.fullName': { $regex: searchBuyerName, $options: 'i' } },
          { 'buyer.username': { $regex: searchBuyerName, $options: 'i' } }
        ]
      };

      if (query.$or) {
        if (!query.$and) query.$and = [];
        query.$and.push({ $or: query.$or });
        delete query.$or;
        query.$and.push(buyerClause);
      } else if (query.$and) {
        query.$and.push(buyerClause);
      } else {
        query.$or = buyerClause.$or;
      }
    }

    // Item ID search (searches both lineItems.legacyItemId and itemNumber)
    if (searchItemId) {
      const itemClause = {
        $or: [
          { 'lineItems.legacyItemId': { $regex: searchItemId, $options: 'i' } },
          { itemNumber: { $regex: searchItemId, $options: 'i' } }
        ]
      };

      if (query.$or) {
        if (!query.$and) query.$and = [];
        query.$and.push({ $or: query.$or });
        delete query.$or;
        query.$and.push(itemClause);
      } else if (query.$and) {
        query.$and.push(itemClause);
      } else {
        query.$or = itemClause.$or;
      }
    }

    if (productName) {
      const normalizedTokens = String(productName)
        .trim()
        .split(/\s+/)
        .map(token => '\\b' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .filter(Boolean);

      const productNamePattern = normalizedTokens.length > 0
        ? normalizedTokens.join('.*')
        : '\\b' + String(productName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const productClause = {
        $or: [
          { productName: { $regex: productNamePattern, $options: 'i' } },
          { 'lineItems.title': { $regex: productNamePattern, $options: 'i' } }
        ]
      };

      if (query.$or) {
        if (!query.$and) query.$and = [];
        query.$and.push({ $or: query.$or });
        delete query.$or;
        query.$and.push(productClause);
      } else if (query.$and) {
        query.$and.push(productClause);
      } else {
        query.$or = productClause.$or;
      }
    }

    // Timezone-Aware Date Range Logic (Pacific Time - exact DST handling via Intl)
    if (startDate || endDate) {
      query.dateSold = {};

      if (startDate) {
        const { start } = getPTDayBoundsUTC(startDate);
        query.dateSold.$gte = start;
      }

      if (endDate) {
        const { end } = getPTDayBoundsUTC(endDate);
        query.dateSold.$lte = end;
      }
    }

    if (searchMarketplace && searchMarketplace !== '') {
      query.purchaseMarketplaceId = searchMarketplace === 'EBAY_ENCA' ? 'EBAY_CA' : searchMarketplace;
    }

    // Payment Status Filter
    if (paymentStatus && paymentStatus !== '') {
      query.orderPaymentStatus = paymentStatus;
    }

    // Ship By Date Filter (Pacific Time - handles DST)
    if (req.query.shipByDate) {
      const shipByDate = req.query.shipByDate;

      const refDate = new Date(shipByDate + 'T12:00:00Z');
      const month = refDate.getUTCMonth();
      const day = refDate.getUTCDate();
      const usePDT = (month > 2 && month < 10) || (month === 2 && day >= 8) || (month === 10 && day < 2);

      // Start of ship-by date in PT (midnight)
      const startOfDay = new Date(shipByDate + 'T00:00:00Z');
      startOfDay.setUTCHours(usePDT ? 7 : 8, 0, 0, 0);

      // End of ship-by date in PT (23:59:59.999)
      const endOfDay = new Date(shipByDate + 'T00:00:00Z');
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
      endOfDay.setUTCHours(usePDT ? 6 : 7, 59, 59, 999);

      query.shipByDate = { $gte: startOfDay, $lte: endOfDay };
    }

    // Date Sold Specific Day Filter (req.query.dateSold) - Pacific Time
    // This is different from startDate/endDate range, it targets a single specific day
    if (req.query.dateSold) {
      const dateSold = req.query.dateSold;

      const refDate = new Date(dateSold + 'T12:00:00Z');
      const month = refDate.getUTCMonth();
      const day = refDate.getUTCDate();
      const usePDT = (month > 2 && month < 10) || (month === 2 && day >= 8) || (month === 10 && day < 2);

      // Start of sold date in PT (midnight)
      const startOfDay = new Date(dateSold + 'T00:00:00Z');
      startOfDay.setUTCHours(usePDT ? 7 : 8, 0, 0, 0);

      // End of sold date in PT (23:59:59.999)
      const endOfDay = new Date(dateSold + 'T00:00:00Z');
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
      endOfDay.setUTCHours(usePDT ? 6 : 7, 59, 59, 999);

      // If startDate/endDate were already set, this specific date filter overrides or intersects
      // For simplicity in this specific "Awaiting Shipment" context, we'll let this take precedence if set
      query.dateSold = { $gte: startOfDay, $lte: endOfDay };
    }

    // Exclude Low Value Orders (less than $3)
    if (req.query.excludeLowValue === 'true') {
      // Filter orders where subtotal or subtotalUSD is >= 3
      // Check both fields since some orders may have one or the other
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { subtotalUSD: { $gte: 3 } },
          { subtotal: { $gte: 3 } }
        ]
      });
    }

    // Filter to only show orders that do not have an Amazon Account added yet
    if (req.query.missingAmazonAccount === 'true') {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { amazonAccount: { $exists: false } },
          { amazonAccount: null },
          { amazonAccount: '' }
        ]
      });
      // Exclude cancelled orders when this filter is active
      query.$and.push({
        $or: [
          { cancelState: { $exists: false } },
          { cancelState: null },
          { cancelState: { $nin: ['CANCELED', 'CANCELLED'] } }
        ]
      });
      query.$and.push({
        $or: [
          { 'cancelStatus.cancelState': { $exists: false } },
          { 'cancelStatus.cancelState': null },
          { 'cancelStatus.cancelState': { $nin: ['CANCELED', 'CANCELLED'] } }
        ]
      });
      // Exclude orders with refunds when this filter is active
      query.$and.push({
        $or: [
          { refunds: { $exists: false } },
          { refunds: { $size: 0 } },
          { refunds: null }
        ]
      });
    }

    // Calculate pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limitNum);

    const orders = await Order.find(query)
      .populate({
        path: 'seller',
        populate: {
          path: 'user',
          select: 'username email'
        }
      })
      .populate('orderCategoryId', 'name')
      .populate('orderRangeId', 'name')
      .populate('orderProductId', 'name')
      // Sorting: ShipBy Date for awaiting (Oldest First), Arriving Date for Amazon Arrivals, Creation Date otherwise (Newest First)
      .sort(
        awaitingShipment === 'true'
          ? { shipByDate: 1 }
          : amazonArriving === 'true'
            ? { arrivingDate: arrivalSort === 'desc' ? -1 : 1 }
            : { creationDate: -1 }
      )
      .skip(skip)
      .limit(limitNum);

    // Lookup ConversationMeta for each order to get category (Case) and caseStatus
    const orderIds = orders.map(order => order.orderId).filter(Boolean);
    const conversationMetas = await ConversationMeta.find({
      orderId: { $in: orderIds }
    }).select('orderId category caseStatus').lean();

    // Create a map for quick lookup
    const conversationMetaMap = new Map();
    conversationMetas.forEach(meta => {
      conversationMetaMap.set(meta.orderId, {
        category: meta.category,
        caseStatus: meta.caseStatus
      });
    });

    // Add fromConvoManagement fields to each order
    const ordersWithConvoData = orders.map(order => {
      const orderObj = order.toObject();
      const convoData = conversationMetaMap.get(order.orderId);
      orderObj.convoCategory = convoData?.category || null;
      orderObj.convoCaseStatus = convoData?.caseStatus || null;
      return orderObj;
    });

    console.log(`[Stored Orders] Query: ${JSON.stringify(query)}, Page: ${pageNum}/${totalPages}, Found ${orders.length}/${totalOrders} orders`);

    res.json({
      orders: ordersWithConvoData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalOrders,
        ordersPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// HELPER: Get Exchange Rate for Date
// ============================================
async function getExchangeRateForDate(date, marketplace = 'EBAY') {
  try {
    const rate = await getExchangeRateRecordForDate(date, marketplace);
    return rate ? rate.rate : getExchangeRateDefaultValue(marketplace);
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
    return getExchangeRateDefaultValue(marketplace);
  }
}

// NEW ENDPOINT: All Orders with USD conversion
router.get('/all-orders-usd', async (req, res) => {
  const { sellerId, page = 1, limit = 50, searchOrderId, searchBuyerName, searchItemNumber, productName, searchMarketplace, startDate, endDate, excludeCancelled, excludeLowValue, excludeNoAmazonAccount, minProfit, maxProfit, minSubtotal, maxSubtotal } = req.query;

  try {
    const computedProfitExpression = {
      $subtract: [
        {
          $subtract: [
            { $ifNull: ['$pBalanceINR', 0] },
            { $ifNull: ['$amazonTotalINR', 0] }
          ]
        },
        { $ifNull: ['$totalCC', 0] }
      ]
    };

    let query = {};
    await applyActiveSellerScope(query, sellerId);

    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { orderPaymentStatus: { $exists: false } },
        { orderPaymentStatus: null },
        { orderPaymentStatus: { $nin: ['FULLY_REFUNDED', 'PARTIALLY_REFUNDED'] } }
      ]
    });

    // Exclude cancelled orders if requested
    if (excludeCancelled === 'true') {
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

    // Apply search filters
    if (searchOrderId) {
      query.orderId = { $regex: searchOrderId, $options: 'i' };
    }

    if (searchBuyerName) {
      const buyerClause = {
        $or: [
          { 'buyer.buyerRegistrationAddress.fullName': { $regex: searchBuyerName, $options: 'i' } },
          { 'buyer.username': { $regex: searchBuyerName, $options: 'i' } }
        ]
      };

      if (query.$or) {
        if (!query.$and) query.$and = [];
        query.$and.push({ $or: query.$or });
        delete query.$or;
        query.$and.push(buyerClause);
      } else if (query.$and) {
        query.$and.push(buyerClause);
      } else {
        query.$or = buyerClause.$or;
      }
    }

    // Search by item number (legacy item ID in lineItems)
    if (searchItemNumber) {
      const itemClause = {
        'lineItems.legacyItemId': { $regex: searchItemNumber, $options: 'i' }
      };

      if (query.$and) {
        query.$and.push(itemClause);
      } else {
        Object.assign(query, itemClause);
      }
    }

    if (productName) {
      const normalizedTokens = String(productName)
        .trim()
        .split(/\s+/)
        .map(token => '\\b' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .filter(Boolean);

      const productNamePattern = normalizedTokens.length > 0
        ? normalizedTokens.join('.*')
        : '\\b' + String(productName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const productClause = {
        $or: [
          { productName: { $regex: productNamePattern, $options: 'i' } },
          { 'lineItems.title': { $regex: productNamePattern, $options: 'i' } }
        ]
      };

      if (query.$or) {
        if (!query.$and) query.$and = [];
        query.$and.push({ $or: query.$or });
        delete query.$or;
        query.$and.push(productClause);
      } else if (query.$and) {
        query.$and.push(productClause);
      } else {
        query.$or = productClause.$or;
      }
    }

    // Timezone-Aware Date Range Logic (Pacific Time - exact DST handling via Intl)
    if (startDate || endDate) {
      query.dateSold = {};

      if (startDate) {
        const { start } = getPTDayBoundsUTC(startDate);
        query.dateSold.$gte = start;
      }

      if (endDate) {
        const { end } = getPTDayBoundsUTC(endDate);
        query.dateSold.$lte = end;
      }
    }

    if (searchMarketplace && searchMarketplace !== '') {
      query.purchaseMarketplaceId = searchMarketplace === 'EBAY_ENCA' ? 'EBAY_CA' : searchMarketplace;
    }

    // Exclude Low Value Orders (less than $3)
    if (excludeLowValue === 'true') {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { subtotalUSD: { $gte: 3 } },
          { subtotal: { $gte: 3 } }
        ]
      });
    }

    // Filter to only show orders that do not have an Amazon Account added yet
    if (req.query.missingAmazonAccount === 'true') {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { amazonAccount: { $exists: false } },
          { amazonAccount: null },
          { amazonAccount: '' }
        ]
      });
      // Exclude cancelled orders when this filter is active
      query.$and.push({
        $or: [
          { cancelState: { $exists: false } },
          { cancelState: null },
          { cancelState: { $nin: ['CANCELED', 'CANCELLED'] } }
        ]
      });
      query.$and.push({
        $or: [
          { 'cancelStatus.cancelState': { $exists: false } },
          { 'cancelStatus.cancelState': null },
          { 'cancelStatus.cancelState': { $nin: ['CANCELED', 'CANCELLED'] } }
        ]
      });
      // Exclude orders with refunds when this filter is active
      query.$and.push({
        $or: [
          { refunds: { $exists: false } },
          { refunds: { $size: 0 } },
          { refunds: null }
        ]
      });
    }

    // Exclude orders without Amazon Account
    if (excludeNoAmazonAccount === 'true') {
      query.$and = query.$and || [];
      query.$and.push({
        amazonAccount: { $exists: true, $ne: null, $ne: '' }
      });
    }

    // Filter by live-computed profit so stale stored profit values don't leak into the results.
    if (minProfit !== undefined || maxProfit !== undefined) {
      query.$and = query.$and || [];
      const profitConditions = [];
      
      if (minProfit !== undefined && minProfit !== '') {
        profitConditions.push({
          $gte: [computedProfitExpression, parseFloat(minProfit)]
        });
      }
      
      if (maxProfit !== undefined && maxProfit !== '') {
        profitConditions.push({
          $lte: [computedProfitExpression, parseFloat(maxProfit)]
        });
      }
      
      if (profitConditions.length === 1) {
        query.$and.push({ $expr: profitConditions[0] });
      } else if (profitConditions.length > 1) {
        query.$and.push({ $expr: { $and: profitConditions } });
      }
    }

    // Filter by subtotal range
    if (minSubtotal !== undefined || maxSubtotal !== undefined) {
      query.$and = query.$and || [];
      const subtotalCondition = {};
      
      if (minSubtotal !== undefined && minSubtotal !== '') {
        subtotalCondition.$gte = parseFloat(minSubtotal);
      }
      
      if (maxSubtotal !== undefined && maxSubtotal !== '') {
        subtotalCondition.$lte = parseFloat(maxSubtotal);
      }
      
      if (Object.keys(subtotalCondition).length > 0) {
        query.$and.push({ subtotal: subtotalCondition });
      }
    }

    // Calculate pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limitNum);

    const orders = await Order.find(query)
      .populate({
        path: 'seller',
        populate: {
          path: 'user',
          select: 'username email'
        }
      })
      .sort({ creationDate: -1 })
      .skip(skip)
      .limit(limitNum);

    // Fallback: Calculate USD values on-the-fly if missing, and add exchange rate + P.Balance
    const ordersWithUSD = await Promise.all(orders.map(async order => {
      const orderObj = order.toObject();

      // If USD values don't exist, calculate them
      if (orderObj.subtotalUSD === undefined || orderObj.subtotalUSD === null) {
        const marketplace = orderObj.purchaseMarketplaceId;

        if (marketplace === 'EBAY_US') {
          // US orders - already in USD
          orderObj.subtotalUSD = orderObj.subtotal || 0;
          orderObj.shippingUSD = orderObj.shipping || 0;
          orderObj.salesTaxUSD = orderObj.salesTax || 0;
          orderObj.discountUSD = orderObj.discount || 0;
          orderObj.transactionFeesUSD = orderObj.transactionFees || 0;
          orderObj.conversionRate = 1;
        } else {
          // Non-US orders - calculate from paymentSummary
          let conversionRate = 0;

          if (orderObj.paymentSummary?.totalDueSeller?.convertedFromValue &&
            orderObj.paymentSummary?.totalDueSeller?.value) {
            const originalValue = parseFloat(orderObj.paymentSummary.totalDueSeller.convertedFromValue);
            const usdValue = parseFloat(orderObj.paymentSummary.totalDueSeller.value);
            if (originalValue > 0) {
              conversionRate = usdValue / originalValue;
            }
          }

          // Apply conversion with proper rounding (2 decimal places)
          orderObj.subtotalUSD = conversionRate ? parseFloat(((orderObj.subtotal || 0) * conversionRate).toFixed(2)) : 0;
          orderObj.shippingUSD = conversionRate ? parseFloat(((orderObj.shipping || 0) * conversionRate).toFixed(2)) : 0;
          orderObj.salesTaxUSD = conversionRate ? parseFloat(((orderObj.salesTax || 0) * conversionRate).toFixed(2)) : 0;
          orderObj.discountUSD = conversionRate ? parseFloat(((orderObj.discount || 0) * conversionRate).toFixed(2)) : 0;
          orderObj.transactionFeesUSD = conversionRate ? parseFloat(((orderObj.transactionFees || 0) * conversionRate).toFixed(2)) : 0;
          orderObj.conversionRate = parseFloat(conversionRate.toFixed(5));
        }
      }

      // ALWAYS recalculate refunds from paymentSummary.refunds (in case refunds were added after initial sync)
      let refundTotal = 0;
      if (orderObj.paymentSummary?.refunds && Array.isArray(orderObj.paymentSummary.refunds)) {
        refundTotal = orderObj.paymentSummary.refunds.reduce((sum, refund) => {
          return sum + parseFloat(refund.amount?.value || 0);
        }, 0);
      }
      const conversionRate = orderObj.conversionRate || 1;
      orderObj.refundTotalUSD = parseFloat((refundTotal * conversionRate).toFixed(2));

      // Get exchange rates for order's date (USD to INR)
      const ebayMarketplace = getExchangeRateMarketplace('EBAY', orderObj.purchaseMarketplaceId);
      const amazonMarketplace = getExchangeRateMarketplace('AMAZON', orderObj.purchaseMarketplaceId);
      const ebayExchangeRate = orderObj.ebayExchangeRate ?? await getExchangeRateForDate(orderObj.dateSold || orderObj.creationDate, ebayMarketplace);
      const amazonExchangeRate = orderObj.amazonExchangeRate ?? await getExchangeRateForDate(orderObj.dateSold || orderObj.creationDate, amazonMarketplace);
      orderObj.exchangeRate = ebayExchangeRate;
      orderObj.ebayExchangeRate = ebayExchangeRate;
      orderObj.amazonExchangeRate = amazonExchangeRate;

      // Calculate NET and P.Balance using non-USD financial fields
      const total = getOrderTotalAmount(orderObj);
      const tds = total * 0.01; // 1% of (pricingSummary.total.value + salesTax)
      const tid = 0.24;
      const net = (parseFloat(orderObj.orderEarnings) || 0) - tds - tid;

      orderObj.pBalance = parseFloat((net * orderObj.exchangeRate).toFixed(2));
      orderObj.profit = parseFloat((((orderObj.pBalanceINR || 0) - (orderObj.amazonTotalINR || 0) - (orderObj.totalCC || 0)).toFixed(2)));

      return orderObj;
    }));

    // Calculate counts for categories, ranges, and products based on current filters
    // Use the same query object for aggregation since seller is already ObjectId
    const categoryData = await Order.aggregate([
      { $match: query },
      { $group: { _id: '$orderCategoryId', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } }
    ]);
    const categoryIds = categoryData.map(c => c._id);
    const categories = await AsinListCategory.find({ _id: { $in: categoryIds } }).select('name');
    const categoriesWithCounts = categoryData.map(cd => {
      const category = categories.find(c => c._id.toString() === cd._id.toString());
      return { name: category?.name || 'Unknown', count: cd.count };
    });

    // Get unique range IDs and populate with names
    const rangeData = await Order.aggregate([
      { $match: query },
      { $group: { _id: '$orderRangeId', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } }
    ]);
    const rangeIds = rangeData.map(r => r._id);
    const ranges = await AsinListRange.find({ _id: { $in: rangeIds } }).select('name');
    const rangesWithCounts = rangeData.map(rd => {
      const range = ranges.find(r => r._id.toString() === rd._id.toString());
      return { name: range?.name || 'Unknown', count: rd.count };
    });

    // Get unique product IDs and populate with names
    const productData = await Order.aggregate([
      { $match: query },
      { $group: { _id: '$orderProductId', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } }
    ]);
    const productIds = productData.map(p => p._id);
    const products = await AsinListProduct.find({ _id: { $in: productIds } }).select('name');
    const productsWithCounts = productData.map(pd => {
      const product = products.find(p => p._id.toString() === pd._id.toString());
      return { name: product?.name || 'Unknown', count: pd.count };
    });

    console.log(`[All Orders USD] Query: ${JSON.stringify(query)}, Page: ${pageNum}/${totalPages}, Found ${orders.length}/${totalOrders} orders`);

    res.json({
      orders: ordersWithUSD,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalOrders,
        ordersPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      counts: {
        uniqueCategories: categories.length,
        uniqueRanges: ranges.length,
        uniqueProducts: products.length,
        categoryData: categoriesWithCounts,
        rangeData: rangesWithCounts,
        productData: productsWithCounts
      }
    });
  } catch (err) {
    console.error('[All Orders USD] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test endpoint to check Finances API basic connectivity (no filter)
router.get('/test-finances-basic', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  const { sellerId } = req.query;

  if (!sellerId) {
    return res.status(400).json({ error: 'sellerId query param is required' });
  }

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller || !seller.ebayTokens?.access_token) {
      return res.status(400).json({ error: 'Seller not found or not connected to eBay' });
    }

    const accessToken = await ensureValidToken(seller);
    const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);

    console.log(`[Test Finances Basic] Testing API without filter...`);

    // Try WITHOUT any filter first
    const response = await axios.get(
      `https://apiz.ebay.com/sell/finances/v1/transaction`,
      {
        headers: financesApiHeaders(accessToken, marketplaceId),
        params: {
          limit: 10
        }
      }
    );

    console.log(`[Test Finances Basic] Success! Found ${response.data?.transactions?.length || 0} transactions`);

    // Show first transaction for debugging
    const firstTxn = response.data?.transactions?.[0];

    res.json({
      success: true,
      total: response.data?.total || 0,
      transactionCount: response.data?.transactions?.length || 0,
      firstTransaction: firstTxn,
      allTransactionTypes: [...new Set((response.data?.transactions || []).map(t => t.transactionType))]
    });

  } catch (error) {
    console.error(`[Test Finances Basic] Error:`, error.response?.data || error.message);
    console.error(`[Test Finances Basic] Status:`, error.response?.status);
    res.status(error.response?.status || 500).json({
      error: error.message,
      ebayError: error.response?.data,
      status: error.response?.status
    });
  }
});

// Test endpoint to check Finances API for a single order
router.get('/test-finances/:orderId', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  const { orderId } = req.params;
  const { sellerId } = req.query;

  if (!sellerId) {
    return res.status(400).json({ error: 'sellerId query param is required' });
  }

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller || !seller.ebayTokens?.access_token) {
      return res.status(400).json({ error: 'Seller not found or not connected to eBay' });
    }

    const accessToken = await ensureValidToken(seller);
    const order = await Order.findOne({ orderId }).select('purchaseMarketplaceId').lean();
    const marketplaceId = order?.purchaseMarketplaceId
      ? purchaseMarketplaceToFinancesId(order.purchaseMarketplaceId)
      : resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);

    // Make direct API call to see raw response
    const filterValue = `orderId:{${orderId}}`;
    console.log(`[Test Finances] Testing order: ${orderId}`);
    console.log(`[Test Finances] Filter: ${filterValue}`);

    const response = await axios.get(
      `https://apiz.ebay.com/sell/finances/v1/transaction`,
      {
        headers: financesApiHeaders(accessToken, marketplaceId),
        params: {
          filter: filterValue,
          limit: 50
        }
      }
    );

    console.log(`[Test Finances] Full response:`, JSON.stringify(response.data, null, 2));

    res.json({
      orderId,
      filter: filterValue,
      rawResponse: response.data,
      transactionCount: response.data?.transactions?.length || 0
    });

  } catch (error) {
    console.error(`[Test Finances] Error:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      ebayError: error.response?.data,
      status: error.response?.status
    });
  }
});

// Update ad fee general for an order
router.patch('/orders/:orderId/ad-fee-general', async (req, res) => {
  const { orderId } = req.params;
  const { adFeeGeneral } = req.body;

  if (adFeeGeneral === undefined || adFeeGeneral === null) {
    return res.status(400).json({ error: 'Missing adFeeGeneral value' });
  }

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update ad fee
    order.adFeeGeneral = parseFloat(adFeeGeneral);

    // Recalculate earnings only for non-refunded orders
    const paymentStatus = order.paymentSummary?.payments?.[0]?.paymentStatus;
    if (paymentStatus !== 'FULLY_REFUNDED' && paymentStatus !== 'PARTIALLY_REFUNDED') {
      // Recalculate earnings: totalDueSeller.value - adFeeGeneral
      const totalDueSeller = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
      const adFee = parseFloat(adFeeGeneral) || 0;

      order.orderEarnings = parseFloat((totalDueSeller - adFee).toFixed(2));

      // Recalculate financial fields based on new earnings
      const marketplace = order.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
        order.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
      const financials = await calculateFinancials(order, marketplace);

      // Update financial fields
      Object.assign(order, financials);
    }

    // Recalculate Amazon financials
    const amazonFinancials = await calculateAmazonFinancials(order);
    Object.assign(order, amazonFinancials);

    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders/:orderId/fetch-ad-fee-general', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const seller = await Seller.findById(order.seller);
    if (!seller?.ebayTokens?.refresh_token) {
      return res.status(400).json({ error: 'Seller does not have valid eBay tokens' });
    }

    const accessToken = await ensureValidToken(seller);
    const financesMp = purchaseMarketplaceToFinancesId(order.purchaseMarketplaceId);
    const adFeeResult = await fetchOrderAdFee(accessToken, order.orderId, null, financesMp);

    if (!adFeeResult.success) {
      return res.status(400).json({ error: adFeeResult.error || 'Failed to fetch ad fee from eBay' });
    }

    order.adFeeGeneral = parseFloat(adFeeResult.adFeeGeneral || 0);

    if (order.orderPaymentStatus === 'FULLY_REFUNDED') {
      order.orderEarnings = 0;
    } else if (order.orderPaymentStatus === 'PARTIALLY_REFUNDED') {
      order.orderEarnings = 0;
    } else {
      const totalDueSeller = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
      order.orderEarnings = parseFloat((totalDueSeller - order.adFeeGeneral).toFixed(2));
    }

    const financials = await calculateFinancials(order);
    Object.assign(order, financials);

    const amazonFinancials = await calculateAmazonFinancials(order);
    Object.assign(order, amazonFinancials);

    await order.save();

    res.json({
      success: true,
      adFeeGeneral: order.adFeeGeneral,
      order: order.toObject()
    });
  } catch (err) {
    console.error('Error fetching ad fee general for order:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get count of orders needing ad fee backfill
router.get('/backfill-ad-fees/count', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  const { sellerId, sinceDate, allSellers } = req.query;

  if (!sellerId && allSellers !== 'true') {
    return res.status(400).json({ error: 'sellerId or allSellers=true is required' });
  }

  try {
    let query = {};
    if (sellerId) {
      query.seller = sellerId;
    }

    if (sinceDate) {
      query.creationDate = { $gte: new Date(sinceDate) };
    }

    // Count orders without adFeeGeneral
    const needsBackfill = await Order.countDocuments({
      ...query,
      $or: [
        { adFeeGeneral: { $exists: false } },
        { adFeeGeneral: null },
        { adFeeGeneral: 0 }
      ]
    });

    const totalOrders = await Order.countDocuments(query);
    const alreadyHasAdFee = totalOrders - needsBackfill;

    res.json({
      totalOrders,
      needsBackfill,
      alreadyHasAdFee
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order earnings (user-entered from Fulfillment Dashboard)
router.post('/orders/:orderId/update-earnings', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderEarnings } = req.body;

    if (orderEarnings === undefined || orderEarnings === null) {
      return res.status(400).json({ error: 'orderEarnings is required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update order earnings with the user-provided value
    order.orderEarnings = parseFloat(orderEarnings);

    // Recalculate all downstream financial fields (TDS, TID, NET, P.Balance INR, Profit)
    // Pass the full order object so profit uses correct amazonTotalINR and totalCC from DB
    const marketplace = order.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
      order.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
    const financials = await calculateFinancials(order, marketplace);

    // Apply all recalculated fields
    order.tds = financials.tds;
    order.tid = financials.tid;
    order.net = financials.net;
    order.pBalanceINR = financials.pBalanceINR;
    order.ebayExchangeRate = financials.ebayExchangeRate;
    order.profit = financials.profit;

    await order.save();

    res.json({
      success: true,
      orderId,
      orderEarnings: order.orderEarnings,
      tds: order.tds,
      tid: order.tid,
      net: order.net,
      pBalanceINR: order.pBalanceINR,
      ebayExchangeRate: order.ebayExchangeRate,
      profit: order.profit
    });
  } catch (err) {
    console.error('Error updating order earnings:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/orders/:orderId/order-total', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderTotal } = req.body;

    if (orderTotal === undefined || orderTotal === null || Number.isNaN(parseFloat(orderTotal))) {
      return res.status(400).json({ error: 'Valid orderTotal is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.pricingSummary || typeof order.pricingSummary !== 'object') {
      order.pricingSummary = {};
    }

    if (!order.pricingSummary.total || typeof order.pricingSummary.total !== 'object') {
      order.pricingSummary.total = {};
    }

    order.orderTotal = parseFloat(orderTotal);

    const financials = await calculateFinancials(order);
    order.tds = financials.tds;
    order.tid = financials.tid;
    order.net = financials.net;
    order.pBalanceINR = financials.pBalanceINR;
    order.ebayExchangeRate = financials.ebayExchangeRate;
    order.profit = financials.profit;

    await order.save();

    await order.populate({
      path: 'seller',
      populate: {
        path: 'user',
        select: 'username email'
      }
    });

    res.json({
      success: true,
      order
    });
  } catch (err) {
    console.error('Error updating order total:', err);
    res.status(500).json({ error: err.message });
  }
});

// Handle Amazon refund received - zero out Amazon costs
router.post('/orders/:orderId/amazon-refund-received', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Zero out Amazon costs
    order.beforeTaxUSD = 0;
    order.estimatedTaxUSD = 0;

    // Recalculate Amazon financial fields (will all become 0)
    const amazonFinancials = await calculateAmazonFinancials(order);
    order.amazonTotal = amazonFinancials.amazonTotal;
    order.amazonTotalINR = amazonFinancials.amazonTotalINR;
    order.marketplaceFee = amazonFinancials.marketplaceFee;
    order.igst = amazonFinancials.igst;
    order.totalCC = amazonFinancials.totalCC;
    order.amazonExchangeRate = amazonFinancials.amazonExchangeRate;

    await order.save();

    res.json({
      success: true,
      orderId,
      beforeTaxUSD: order.beforeTaxUSD,
      estimatedTaxUSD: order.estimatedTaxUSD,
      amazonTotal: order.amazonTotal,
      amazonTotalINR: order.amazonTotalINR,
      marketplaceFee: order.marketplaceFee,
      igst: order.igst,
      totalCC: order.totalCC,
      amazonExchangeRate: order.amazonExchangeRate
    });
  } catch (err) {
    console.error('Error handling Amazon refund received:', err);
    res.status(500).json({ error: err.message });
  }
});

// Backfill ad fees from eBay Finances API for orders since a given date
// Supports single seller (sellerId) or all sellers (allSellers: true)
router.post('/backfill-ad-fees', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  const { sellerId, sinceDate, skipAlreadySet = true, allSellers } = req.body;

  if (!sellerId && !allSellers) {
    return res.status(400).json({ error: 'sellerId or allSellers:true is required' });
  }

  try {
    // Resolve sellers to process
    let sellersToProcess;
    if (allSellers) {
      sellersToProcess = await Seller.find({
        'ebayTokens.access_token': { $exists: true, $ne: null }
      });
      console.log(`[Backfill Ad Fees] All-sellers mode: ${sellersToProcess.length} sellers with eBay tokens`);
    } else {
      const seller = await Seller.findById(sellerId);
      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }
      if (!seller.ebayTokens || !seller.ebayTokens.access_token) {
        return res.status(400).json({ error: 'Seller not connected to eBay' });
      }
      sellersToProcess = [seller];
    }

    const effectiveSinceDate = sinceDate ? new Date(sinceDate) : new Date('2025-11-01');
    const totals = { total: 0, success: 0, failed: 0, skipped: 0, sellerErrors: [], errors: [] };

    for (const seller of sellersToProcess) {
      try {
        // Ensure we have a valid token
        const accessToken = await ensureValidToken(seller);

        // Build query for orders
        let query = { seller: seller._id };
        query.creationDate = { $gte: effectiveSinceDate };

        // Optionally skip orders that already have adFeeGeneral set
        if (skipAlreadySet) {
          query.$or = [
            { adFeeGeneral: { $exists: false } },
            { adFeeGeneral: null },
            { adFeeGeneral: 0 }
          ];
        }

        // Get ALL orders to process (no limit)
        const orders = await Order.find(query).sort({ creationDate: -1 });

        console.log(`[Backfill Ad Fees] Found ${orders.length} orders to process for seller ${seller.username || seller._id}`);

        if (orders.length === 0) {
          continue;
        }

        // STEP 1: Fetch ALL ad fees from eBay in one batch
        console.log(`[Backfill Ad Fees] Fetching all ad fees since ${effectiveSinceDate.toISOString()} for ${seller.username || seller._id}...`);
        const distinctMp = await Order.distinct('purchaseMarketplaceId', {
          seller: seller._id,
          creationDate: { $gte: effectiveSinceDate }
        });
        const fromOrders = distinctMp.map((id) => normalizeFinancesMarketplaceId(id)).filter(Boolean);
        const financeMarketplaceIds = [...new Set([
          ...resolveFinancesMarketplaceIds(seller),
          ...fromOrders
        ])];
        const adFeeResult = await fetchAllAdFees(accessToken, financeMarketplaceIds, effectiveSinceDate);

        if (!adFeeResult.success) {
          totals.sellerErrors.push({ seller: seller.username || seller._id.toString(), error: adFeeResult.error });
          console.error(`[Backfill Ad Fees] Failed to fetch ad fees for ${seller.username || seller._id}: ${adFeeResult.error}`);
          continue;
        }

        const adFeeMap = adFeeResult.adFeeMap;
        console.log(`[Backfill Ad Fees] Found ${adFeeMap.size} ad fee transactions from eBay for ${seller.username || seller._id}`);

        totals.total += orders.length;

        // STEP 2: Match orders to ad fees and update
        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];
          try {
            const adFee = adFeeMap.get(order.orderId);

            if (adFee && adFee > 0) {
              // Update ad fee and recalculate earnings if it's a PAID order
              const updates = { adFeeGeneral: adFee };

              if (order.orderPaymentStatus === 'PAID') {
                // Recalculate earnings: totalDueSeller.value - adFeeGeneral
                const totalDueSeller = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
                const newEarnings = parseFloat((totalDueSeller - adFee).toFixed(2));
                updates.orderEarnings = newEarnings;

                // Recalculate financial fields — pass full order so profit uses correct amazonTotalINR/totalCC
                const marketplace = order.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                  order.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                const financials = await calculateFinancials({ ...order.toObject(), orderEarnings: newEarnings }, marketplace);
                Object.assign(updates, financials);
              }

              await Order.findByIdAndUpdate(order._id, updates);
              totals.success++;
              console.log(`[Backfill ${i + 1}/${orders.length}] Order ${order.orderId}: Ad Fee = $${adFee}`);
            } else {
              totals.skipped++;
            }
          } catch (orderErr) {
            totals.failed++;
            if (totals.errors.length < 20) {
              totals.errors.push({ orderId: order.orderId, error: orderErr.message });
            }
          }
        }
      } catch (sellerErr) {
        totals.sellerErrors.push({ seller: seller.username || seller._id.toString(), error: sellerErr.message });
        console.error(`[Backfill Ad Fees] Seller ${seller.username || seller._id} error: ${sellerErr.message}`);
      }
    }

    res.json({
      message: `Backfill complete across ${sellersToProcess.length} seller(s): ${totals.success} updated, ${totals.skipped} no ad fee, ${totals.failed} failed`,
      results: totals
    });

  } catch (err) {
    console.error('[Backfill Ad Fees] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Backfill / recalculate orderEarnings for existing orders using totalDueSeller.value - adFeeGeneral
// Supports single seller (sellerId) or all sellers (allSellers: true)
router.post('/backfill-earnings', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  const { sellerId, sinceDate, allSellers } = req.body;

  if (!sellerId && !allSellers) {
    return res.status(400).json({ error: 'sellerId or allSellers:true is required' });
  }

  try {
    // Resolve seller IDs to process
    let sellerIds;
    if (allSellers) {
      const allSellerDocs = await Seller.find({}, '_id').lean();
      sellerIds = allSellerDocs.map(s => s._id);
      console.log(`[Backfill Earnings] All-sellers mode: ${sellerIds.length} sellers`);
    } else {
      sellerIds = [sellerId];
    }

    const totals = { total: 0, success: 0, failed: 0, errors: [] };

    for (const sid of sellerIds) {
      let query = { seller: sid };
      if (sinceDate) {
        query.creationDate = { $gte: new Date(sinceDate) };
      }
      const orders = await Order.find(query).sort({ creationDate: -1 });
      console.log(`[Backfill Earnings] Seller ${sid}: ${orders.length} orders`);
      totals.total += orders.length;

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        try {
          if (order.orderPaymentStatus === 'FULLY_REFUNDED' || order.orderPaymentStatus === 'PARTIALLY_REFUNDED') {
            const financials = await calculateFinancials({ ...order.toObject(), orderEarnings: 0 });
            await Order.findByIdAndUpdate(order._id, { orderEarnings: 0, ...financials });
            totals.success++;
          } else {
            const totalDueSeller = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
            const adFee = parseFloat(order.adFeeGeneral || 0);
            const newEarnings = parseFloat((totalDueSeller - adFee).toFixed(2));

            const marketplace = order.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
              order.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
            const financials = await calculateFinancials({ ...order.toObject(), orderEarnings: newEarnings }, marketplace);

            await Order.findByIdAndUpdate(order._id, { orderEarnings: newEarnings, ...financials });
            totals.success++;

            if ((i + 1) % 50 === 0) {
              console.log(`[Backfill Earnings] Seller ${sid} progress: ${i + 1}/${orders.length}`);
            }
          }
        } catch (orderErr) {
          totals.failed++;
          if (totals.errors.length < 20) {
            totals.errors.push({ orderId: order.orderId, error: orderErr.message });
          }
        }
      }
    }

    res.json({
      message: `Earnings recalculated across ${sellerIds.length} seller(s): ${totals.success} updated, ${totals.failed} failed`,
      results: totals
    });

  } catch (err) {
    console.error('[Backfill Earnings] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Backfill Amazon financials (amazonTotal, amazonTotalINR, marketplaceFee, igst, totalCC, profit) from raw beforeTax / estimatedTax
router.post('/backfill-amazon-financials', requireAuth, requirePageAccess('AllOrdersSheet'), async (req, res) => {
  const { sellerId, sinceDate, allSellers } = req.body;

  if (!sellerId && !allSellers) {
    return res.status(400).json({ error: 'sellerId or allSellers:true is required' });
  }

  try {
    let sellerIds;
    if (allSellers) {
      const allSellerDocs = await Seller.find({}, '_id').lean();
      sellerIds = allSellerDocs.map(s => s._id);
      console.log(`[Backfill Amazon] All-sellers mode: ${sellerIds.length} sellers`);
    } else {
      sellerIds = [sellerId];
    }

    const totals = { total: 0, success: 0, failed: 0, errors: [] };

    for (const sid of sellerIds) {
      const query = { seller: sid };
      if (sinceDate) {
        query.creationDate = { $gte: new Date(sinceDate) };
      }

      const orders = await Order.find(query).sort({ creationDate: -1 });
      console.log(`[Backfill Amazon] Seller ${sid}: ${orders.length} orders`);
      totals.total += orders.length;

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        try {
          const amazonFinancials = await calculateAmazonFinancials(order);
          await Order.findByIdAndUpdate(order._id, amazonFinancials);
          totals.success++;

          if ((i + 1) % 50 === 0) {
            console.log(`[Backfill Amazon] Seller ${sid} progress: ${i + 1}/${orders.length}`);
          }
        } catch (orderErr) {
          totals.failed++;
          if (totals.errors.length < 20) {
            totals.errors.push({ orderId: order.orderId, error: orderErr.message });
          }
        }
      }
    }

    res.json({
      message: `Amazon financials recalculated across ${sellerIds.length} seller(s): ${totals.success} updated, ${totals.failed} failed`,
      results: totals
    });

  } catch (err) {
    console.error('[Backfill Amazon] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update manual tracking number for an order (does NOT affect fulfillment tracking)
router.patch('/orders/:orderId/manual-tracking', async (req, res) => {
  const { orderId } = req.params;
  const { manualTrackingNumber } = req.body;

  if (manualTrackingNumber === undefined || manualTrackingNumber === null) {
    return res.status(400).json({ error: 'Missing manualTrackingNumber value' });
  }

  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { manualTrackingNumber: String(manualTrackingNumber) },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload tracking number to eBay and mark order as shipped
router.post('/orders/:orderId/upload-tracking', async (req, res) => {
  const { orderId } = req.params;
  const { trackingNumber, shippingCarrier = 'USPS' } = req.body;

  if (!trackingNumber || !trackingNumber.trim()) {
    return res.status(400).json({ error: 'Missing tracking number' });
  }

  try {
    // Find the order in our database
    const order = await Order.findById(orderId).populate('seller');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.seller) {
      return res.status(400).json({ error: 'Seller not found for this order' });
    }

    // Ensure seller has valid eBay token
    await ensureValidToken(order.seller);

    if (!order.seller.ebayTokens?.access_token) {
      return res.status(400).json({ error: 'Seller does not have valid eBay access token' });
    }

    // Get the eBay orderId (not our MongoDB _id)
    const ebayOrderId = order.orderId || order.legacyOrderId;
    if (!ebayOrderId) {
      return res.status(400).json({ error: 'Order missing eBay order ID' });
    }

    // Get the line item ID (eBay requires this for fulfillment)
    const lineItemId = order.lineItems?.[0]?.lineItemId;
    if (!lineItemId) {
      return res.status(400).json({ error: 'Order missing line item ID' });
    }

    // Prepare the fulfillment payload
    const fulfillmentPayload = {
      lineItems: [
        {
          lineItemId: lineItemId,
          quantity: order.lineItems[0].quantity || 1
        }
      ],
      shippedDate: new Date().toISOString(),
      shippingCarrierCode: shippingCarrier.toUpperCase(),
      trackingNumber: trackingNumber.trim()
    };

    console.log(`[Upload Tracking] Uploading tracking for order ${ebayOrderId}:`, fulfillmentPayload);

    // Upload tracking to eBay Fulfillment API
    const fulfillmentResponse = await axios.post(
      `https://api.ebay.com/sell/fulfillment/v1/order/${ebayOrderId}/shipping_fulfillment`,
      fulfillmentPayload,
      {
        headers: {
          'Authorization': `Bearer ${order.seller.ebayTokens.access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log(`[Upload Tracking] ✅ eBay API accepted tracking upload:`, fulfillmentResponse.data);

    // 4. CHECK FOR WARNINGS (Early Detection)
    if (fulfillmentResponse.data?.warnings?.length > 0) {
      console.warn(`[Upload Tracking] ⚠️ eBay returned warnings:`, JSON.stringify(fulfillmentResponse.data.warnings));
      // If warning indicates a problem (but not an error), we should proceed with verification CAREFULLY
    }

    // 5. SMART POLLING VERIFICATION (Speed Upgrade)
    // Instead of waiting 7 seconds blindly, we check immediately and then retry a few times.
    console.log(`[Upload Tracking] Verifying tracking was applied (Smart Polling)...`);

    let isVerified = false;
    let verifiedOrder = null;

    // Polling Schedule: 0s, 1s, 2s, 4s, 7s (Total ~7-8s max wait, but usually instant)
    const delays = [100, 1000, 1000, 2000, 3000];

    for (const delay of delays) {
      if (delay > 100) await new Promise(r => setTimeout(r, delay));

      try {
        const verifyRes = await axios.get(
          `https://api.ebay.com/sell/fulfillment/v1/order/${ebayOrderId}`,
          {
            headers: {
              'Authorization': `Bearer ${order.seller.ebayTokens.access_token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );

        const data = verifyRes.data;
        const hasFulfillmentHrefs = data.fulfillmentHrefs && data.fulfillmentHrefs.length > 0;
        const isFulfilled = data.orderFulfillmentStatus === 'FULFILLED';

        // Check specifically if OUR tracking number is present
        // (Sometimes order is fulfilled but with an old tracking number)
        // We verify if fulfillmentHrefs are present, which implies SOME tracking exists.
        // Deep verification of the exact number is hard without following the hrefs, 
        // but status=FULFILLED + hasHrefs is usually strong enough.

        if (isFulfilled && hasFulfillmentHrefs) {
          verifiedOrder = data;
          isVerified = true;
          console.log(`[Upload Tracking] ✅ Verified successfully after ~${delay}ms`);
          break; // Exit loop immediately on success
        }
      } catch (err) {
        console.warn(`[Upload Tracking] Verification attempt failed: ${err.message}`);
      }
    }

    // STRICT VALIDATION: Only save to DB if eBay confirmed tracking was applied
    if (!isVerified || !verifiedOrder) {
      console.error(`[Upload Tracking] ⚠️ Tracking NOT applied after polling attempts!`);

      // REJECT - Do NOT update database
      return res.status(400).json({
        error: 'Tracking number was rejected by eBay (Verification Failed). This tracking number may already be in use for another order.',
        errorType: 'TRACKING_NOT_APPLIED',
        details: {
          suggestion: 'Please verify the tracking number is correct and not a duplicate.'
        }
      });
    }

    console.log(`[Upload Tracking] ✅ VERIFIED: Tracking successfully applied to eBay order`);

    // UPDATE DATABASE: Only save when eBay confirms success
    order.trackingNumber = trackingNumber.trim();
    order.manualTrackingNumber = trackingNumber.trim();
    order.orderFulfillmentStatus = 'FULFILLED';

    await order.save();

    console.log(`[Upload Tracking] 💾 Database updated successfully for order ${ebayOrderId}`);

    res.json({
      success: true,
      message: `Tracking uploaded to eBay via ${shippingCarrier}! Order marked as shipped.`,
      order,
      ebayResponse: fulfillmentResponse.data
    });

  } catch (err) {
    console.error('[Upload Tracking] ❌ Error:', err.response?.data || err.message);

    // Provide detailed error message with specific handling for common issues
    let errorMessage = 'Failed to upload tracking to eBay';
    let errorType = 'UPLOAD_ERROR';

    if (err.response?.data?.errors) {
      const errors = err.response.data.errors;
      errorMessage = errors.map(e => e.message).join(', ');

      // Check for specific error types
      const errorString = JSON.stringify(errors).toLowerCase();
      if (errorString.includes('tracking') || errorString.includes('invalid')) {
        errorType = 'INVALID_TRACKING';
        errorMessage = '❌ ' + errorMessage + '\n\nPlease verify:\n- Tracking number format is correct\n- Carrier selection matches the tracking number\n- Tracking number is not already used for another order';
      } else if (errorString.includes('already') || errorString.includes('fulfilled')) {
        errorType = 'ALREADY_FULFILLED';
        errorMessage = 'This order is already marked as fulfilled on eBay';
      } else if (errorString.includes('authorization') || errorString.includes('token')) {
        errorType = 'AUTH_ERROR';
        errorMessage = 'eBay authorization error. Please reconnect your eBay account';
      }
    } else if (err.response?.data?.message) {
      errorMessage = err.response.data.message;
    } else if (err.message) {
      errorMessage = err.message;
    }

    // Log detailed error for debugging
    console.error('[Upload Tracking] Error Details:', {
      errorType,
      errorMessage,
      ebayResponse: err.response?.data,
      statusCode: err.response?.status
    });

    res.status(err.response?.status || 500).json({
      error: errorMessage,
      errorType,
      details: err.response?.data || err.message,
      statusCode: err.response?.status
    });
  }
});

// Upload multiple tracking numbers to eBay (for orders with multiple different items)
router.post('/orders/:orderId/upload-tracking-multiple', async (req, res) => {
  const { orderId } = req.params;
  const { trackingData, shippingCarrier = 'USPS' } = req.body;
  // trackingData format: [{ itemId: '12345', trackingNumber: 'ABC123', carrier: 'USPS' }, ...]

  if (!trackingData || !Array.isArray(trackingData) || trackingData.length === 0) {
    return res.status(400).json({ error: 'Missing tracking data array' });
  }

  // Validate all tracking numbers are provided
  const missingTracking = trackingData.some(item => !item.trackingNumber?.trim());
  if (missingTracking) {
    return res.status(400).json({ error: 'All items must have tracking numbers' });
  }

  try {
    // Find the order in our database
    const order = await Order.findById(orderId).populate('seller');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.seller) {
      return res.status(400).json({ error: 'Seller not found for this order' });
    }

    // Ensure seller has valid eBay token
    await ensureValidToken(order.seller);

    if (!order.seller.ebayTokens?.access_token) {
      return res.status(400).json({ error: 'Seller does not have valid eBay access token' });
    }

    // Get the eBay orderId
    const ebayOrderId = order.orderId || order.legacyOrderId;
    if (!ebayOrderId) {
      return res.status(400).json({ error: 'Order missing eBay order ID' });
    }

    console.log(`[Upload Multiple Tracking] Processing ${trackingData.length} tracking numbers for order ${ebayOrderId}`);

    // Group line items by tracking number
    // eBay allows one fulfillment per tracking number, so we create separate fulfillments
    const fulfillmentResults = [];
    const errors = [];

    for (let i = 0; i < trackingData.length; i++) {
      const { itemId, trackingNumber, carrier } = trackingData[i];

      // Find matching line item(s) with this itemId
      const matchingLineItems = order.lineItems.filter(li => li.legacyItemId === itemId);

      if (matchingLineItems.length === 0) {
        errors.push(`Item ${itemId} not found in order`);
        continue;
      }

      // Create fulfillment payload for this tracking number
      const fulfillmentPayload = {
        lineItems: matchingLineItems.map(li => ({
          lineItemId: li.lineItemId,
          quantity: li.quantity || 1
        })),
        shippedDate: new Date().toISOString(),
        shippingCarrierCode: (carrier || shippingCarrier).toUpperCase(),
        trackingNumber: trackingNumber.trim()
      };

      console.log(`[Upload Multiple Tracking] Uploading tracking #${i + 1}:`, fulfillmentPayload);

      try {
        // Upload to eBay
        const fulfillmentResponse = await axios.post(
          `https://api.ebay.com/sell/fulfillment/v1/order/${ebayOrderId}/shipping_fulfillment`,
          fulfillmentPayload,
          {
            headers: {
              'Authorization': `Bearer ${order.seller.ebayTokens.access_token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );

        console.log(`[Upload Multiple Tracking] ✅ Tracking #${i + 1} accepted by eBay`);
        fulfillmentResults.push({
          itemId,
          trackingNumber: trackingNumber.trim(),
          status: 'success',
          response: fulfillmentResponse.data
        });

      } catch (err) {
        console.error(`[Upload Multiple Tracking] ❌ Error uploading tracking #${i + 1}:`, err.response?.data || err.message);

        const errorMsg = err.response?.data?.errors?.map(e => e.message).join(', ') || err.message;
        errors.push(`Item ${itemId}: ${errorMsg}`);

        fulfillmentResults.push({
          itemId,
          trackingNumber: trackingNumber.trim(),
          status: 'error',
          error: errorMsg
        });
      }
    }

    // If ALL uploads failed, return error
    if (errors.length === trackingData.length) {
      return res.status(400).json({
        error: 'All tracking uploads failed',
        details: errors,
        results: fulfillmentResults
      });
    }

    // Verify fulfillment status after uploads
    console.log(`[Upload Multiple Tracking] Verifying order status...`);
    await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds for eBay to process

    try {
      const verifyRes = await axios.get(
        `https://api.ebay.com/sell/fulfillment/v1/order/${ebayOrderId}`,
        {
          headers: {
            'Authorization': `Bearer ${order.seller.ebayTokens.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      const verifiedOrder = verifyRes.data;
      const isFulfilled = verifiedOrder.orderFulfillmentStatus === 'FULFILLED';

      // Update database with first tracking number (for display purposes)
      // Store all tracking numbers in a comma-separated format or JSON
      const allTrackingNumbers = trackingData.map(t => t.trackingNumber.trim()).join(', ');

      order.trackingNumber = allTrackingNumbers;
      order.manualTrackingNumber = allTrackingNumbers;
      order.orderFulfillmentStatus = isFulfilled ? 'FULFILLED' : order.orderFulfillmentStatus;

      await order.save();

      console.log(`[Upload Multiple Tracking] 💾 Database updated with ${trackingData.length} tracking numbers`);

      res.json({
        success: true,
        message: `${fulfillmentResults.filter(r => r.status === 'success').length} tracking numbers uploaded successfully`,
        partialSuccess: errors.length > 0,
        results: fulfillmentResults,
        errors: errors.length > 0 ? errors : undefined,
        order
      });

    } catch (verifyErr) {
      console.warn(`[Upload Multiple Tracking] ⚠️ Verification failed:`, verifyErr.message);

      // Still update DB even if verification fails (tracking was uploaded)
      const allTrackingNumbers = trackingData.map(t => t.trackingNumber.trim()).join(', ');
      order.trackingNumber = allTrackingNumbers;
      order.manualTrackingNumber = allTrackingNumbers;
      await order.save();

      res.json({
        success: true,
        message: `${fulfillmentResults.filter(r => r.status === 'success').length} tracking numbers uploaded (verification pending)`,
        partialSuccess: errors.length > 0,
        results: fulfillmentResults,
        errors: errors.length > 0 ? errors : undefined,
        verificationWarning: 'Could not verify order status immediately',
        order
      });
    }

  } catch (err) {
    console.error('[Upload Multiple Tracking] ❌ Fatal Error:', err.response?.data || err.message);

    res.status(err.response?.status || 500).json({
      error: 'Failed to upload tracking numbers',
      details: err.response?.data || err.message,
      statusCode: err.response?.status
    });
  }
});

// Poll all sellers for new/updated orders with smart detection (PARALLEL + UTC-based)
router.post('/poll-all-sellers', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    // Helper function to normalize dates for comparison (ignore milliseconds/format)
    function normalizeDateForComparison(date) {
      if (!date) return null;
      if (date instanceof Date) {
        return Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
      }
      if (typeof date === 'string') {
        return Math.floor(new Date(date).getTime() / 1000);
      }
      return null;
    }

    // Helper function to check if field actually changed
    function hasFieldChanged(oldValue, newValue, fieldName) {
      // Skip system fields
      const systemFields = ['_id', '__v', 'seller', 'updatedAt', 'createdAt'];
      if (systemFields.includes(fieldName)) return false;

      // Date fields - compare Unix timestamps (ignore milliseconds)
      const dateFields = ['creationDate', 'lastModifiedDate', 'dateSold', 'shipByDate', 'estimatedDelivery'];
      if (dateFields.includes(fieldName)) {
        const oldTime = normalizeDateForComparison(oldValue);
        const newTime = normalizeDateForComparison(newValue);
        return oldTime !== newTime;
      }

      // Null/undefined checks
      if (oldValue === null || oldValue === undefined) {
        return newValue !== null && newValue !== undefined;
      }

      // Objects/Arrays - deep comparison
      if (typeof newValue === 'object' && newValue !== null) {
        return JSON.stringify(oldValue) !== JSON.stringify(newValue);
      }

      // Primitives - direct comparison
      return oldValue !== newValue;
    }

    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true, $ne: null } })
      .populate('user', 'username email');

    if (sellers.length === 0) {
      return res.json({
        message: 'No sellers with connected eBay accounts found',
        pollResults: [],
        totalPolled: 0,
        totalNewOrders: 0,
        totalUpdatedOrders: 0
      });
    }

    // Calculate 30 days ago in UTC
    const nowUTC = Date.now();
    const thirtyDaysAgoMs = 30 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = new Date(nowUTC - thirtyDaysAgoMs);

    console.log(`\n========== POLLING ${sellers.length} SELLERS IN PARALLEL ==========`);
    console.log(`UTC Time: ${new Date(nowUTC).toISOString()}`);
    console.log(`30-day window starts: ${thirtyDaysAgo.toISOString()}`);

    // Process all sellers in parallel using Promise.allSettled
    const pollingPromises = sellers.map(async (seller) => {
      const sellerName = seller.user?.username || seller.user?.email || seller._id.toString();

      try {
        console.log(`\n[${sellerName}] Starting poll...`);

        // ========== TOKEN REFRESH CHECK ==========
        const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
        const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
        let accessToken = seller.ebayTokens.access_token;

        if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
          console.log(`[${sellerName}] Token expired, refreshing...`);
          try {
            const refreshRes = await axios.post(
              'https://api.ebay.com/identity/v1/oauth2/token',
              qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: seller.ebayTokens.refresh_token,
                scope: EBAY_OAUTH_SCOPES, // Using centralized scopes constant
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
                },
              }
            );
            seller.ebayTokens.access_token = refreshRes.data.access_token;
            seller.ebayTokens.expires_in = refreshRes.data.expires_in;
            seller.ebayTokens.fetchedAt = new Date(nowUTC);
            await seller.save();
            accessToken = refreshRes.data.access_token;
            console.log(`[${sellerName}] Token refreshed`);
          } catch (refreshErr) {
            console.error(`[${sellerName}] Token refresh failed:`, refreshErr.message);
            return {
              sellerId: seller._id,
              sellerName,
              success: false,
              error: 'Failed to refresh token'
            };
          }
        }

        // ========== DETERMINE POLLING STRATEGY ==========
        const orderCount = await Order.countDocuments({ seller: seller._id });
        const latestOrder = await Order.findOne({ seller: seller._id }).sort({ creationDate: -1 });
        const latestCreationDate = latestOrder ? latestOrder.creationDate : null;
        const lastPolledAt = seller.lastPolledAt || null;
        // Default initial sync date: Mar 1, 2026 00:00:00 UTC
        const initialSyncDate = getEffectiveInitialSyncDate(seller.initialSyncDate);

        console.log(`[${sellerName}] Orders in DB: ${orderCount}, Latest: ${latestCreationDate?.toISOString() || 'NONE'}, LastPolled: ${lastPolledAt?.toISOString() || 'NEVER'}`);

        const newOrders = [];
        const updatedOrders = [];
        // Use 5-second buffer for clock skew (UTC-based)
        const currentTimeUTC = new Date(nowUTC - 5000);

        // ========== PHASE 1: FETCH NEW ORDERS ==========
        let newOrdersFilter = null;
        let newOrdersLimit = 15;

        if (orderCount === 0) {
          // First sync: get orders from Oct 17, 2025 onwards (UTC)
          newOrdersFilter = `creationdate:[${initialSyncDate.toISOString()}..${currentTimeUTC.toISOString()}]`;
          newOrdersLimit = 200;
          console.log(`[${sellerName}] PHASE 1: Initial sync from ${initialSyncDate.toISOString()}`);
        } else if (latestCreationDate) {
          // Subsequent syncs: fetch orders created after our latest order
          const afterLatestMs = new Date(latestCreationDate).getTime() + 1000; // +1 sec
          const afterLatest = new Date(afterLatestMs);
          const timeDiffMinutes = (currentTimeUTC.getTime() - afterLatestMs) / (1000 * 60);

          if (timeDiffMinutes >= 1) {
            newOrdersFilter = `creationdate:[${afterLatest.toISOString()}..${currentTimeUTC.toISOString()}]`;
            newOrdersLimit = 200;
            console.log(`[${sellerName}] PHASE 1: New orders after ${afterLatest.toISOString()}`);
          } else {
            console.log(`[${sellerName}] PHASE 1: Skipped (too recent: ${timeDiffMinutes.toFixed(2)} min)`);
          }
        }

        // Fetch new orders if filter is set
        if (newOrdersFilter) {
          try {
            // Use pagination to fetch ALL orders (handles >200 orders)
            const ebayNewOrders = await fetchAllOrdersWithPagination(accessToken, newOrdersFilter, sellerName);
            console.log(`[${sellerName}] PHASE 1: Got ${ebayNewOrders.length} new orders from eBay`);

            // Insert new orders
            for (const ebayOrder of ebayNewOrders) {
              const existingOrder = await Order.findOne({ orderId: ebayOrder.orderId });

              if (!existingOrder) {
                const orderData = await buildOrderData(ebayOrder, seller._id, accessToken);
                const policyEligibleAt = getPolicyEligibilityDate(orderData.creationDate);
                if (policyEligibleAt) {
                  orderData.policyMessageEligibleAt = policyEligibleAt;
                }
                const newOrder = await Order.create(orderData);
                newOrders.push(newOrder);
                console.log(`  🆕 NEW: ${ebayOrder.orderId}`);
                await sendAutoWelcomeMessage(seller, newOrder);

                // Fire-and-forget: Update listing quantity to 1
                updateListingQuantityOnOrder(ebayOrder, accessToken, sellerName)
                  .catch(err => console.error(`[Quantity Update] Background error for ${ebayOrder.orderId}:`, err.message));
              } else {
                // Order exists, check if needs update
                const ebayModTime = new Date(ebayOrder.lastModifiedDate).getTime();
                const dbModTime = new Date(existingOrder.lastModifiedDate).getTime();

                if (ebayModTime > dbModTime) {
                  let orderData = await buildOrderData(ebayOrder, seller._id, accessToken);

                  // ========== HANDLE REFUND STATUS CHANGES ==========
                  const refundData = await handleOrderPaymentStatusChange(
                    existingOrder,
                    ebayOrder.orderPaymentStatus,
                    accessToken,
                    seller._id
                  );

                  // If refund handling returned data, merge it
                  if (refundData) {
                    orderData = { ...orderData, ...refundData };
                  }

                  Object.assign(existingOrder, orderData);
                  await existingOrder.save();
                  updatedOrders.push(existingOrder);
                  console.log(`  🔄 UPDATED: ${ebayOrder.orderId}`);
                }
              }
            }
          } catch (phase1Err) {
            console.error(`[${sellerName}] PHASE 1 error:`, phase1Err.message);
          }
        }

        // ========== PHASE 2: CHECK FOR UPDATES ON RECENT ORDERS ==========
        console.log(`[${sellerName}] PHASE 2: Checking orders < 30 days old`);

        const recentOrders = await Order.find({
          seller: seller._id,
          creationDate: { $gte: thirtyDaysAgo }
        }).select('orderId lastModifiedDate creationDate');

        console.log(`[${sellerName}] PHASE 2: ${recentOrders.length} orders < 30 days old`);

        if (recentOrders.length > 0) {
          const checkFromDate = lastPolledAt || thirtyDaysAgo;
          const modifiedFilter = `lastmodifieddate:[${checkFromDate.toISOString()}..${currentTimeUTC.toISOString()}]`;

          console.log(`[${sellerName}] PHASE 2: Checking mods since ${checkFromDate.toISOString()}`);

          let offset = 0;
          const batchSize = 100;
          let hasMore = true;
          const recentOrderIdSet = new Set(recentOrders.map(o => o.orderId));

          while (hasMore) {
            try {
              const phase2Res = await axios.get('https://api.ebay.com/sell/fulfillment/v1/order', {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                params: {
                  filter: modifiedFilter,
                  limit: batchSize,
                  offset: offset > 0 ? offset : undefined
                }
              });

              const batchOrders = phase2Res.data.orders || [];
              console.log(`[${sellerName}] PHASE 2: Got ${batchOrders.length} orders at offset ${offset}`);

              const relevantOrders = batchOrders.filter(o => recentOrderIdSet.has(o.orderId));
              console.log(`[${sellerName}] PHASE 2: ${relevantOrders.length} relevant`);

              for (const ebayOrder of relevantOrders) {
                const existingOrder = await Order.findOne({
                  orderId: ebayOrder.orderId,
                  seller: seller._id
                });

                if (existingOrder) {
                  const ebayModTime = new Date(ebayOrder.lastModifiedDate).getTime();
                  const dbModTime = new Date(existingOrder.lastModifiedDate).getTime();

                  // OPTIMIZATION: Skip if not actually modified
                  if (ebayModTime <= dbModTime) {
                    continue; // No changes, skip this order
                  }

                  // ONLY NOW fetch full order data (includes expensive tracking lookup)
                  let orderData = await buildOrderData(ebayOrder, seller._id, accessToken);

                  // ========== HANDLE REFUND STATUS CHANGES ==========
                  // Check if payment status changed to FULLY_REFUNDED or PARTIALLY_REFUNDED
                  const refundData = await handleOrderPaymentStatusChange(
                    existingOrder,
                    ebayOrder.orderPaymentStatus,
                    accessToken,
                    seller._id
                  );

                  // If refund handling returned data, merge it with orderData
                  if (refundData) {
                    orderData = { ...orderData, ...refundData };
                  }

                  // Define fields that should trigger notifications
                  const notifiableFields = [
                    'cancelState',
                    'orderPaymentStatus',
                    'refunds',
                    'orderFulfillmentStatus',
                    'trackingNumber',
                    'shippingFullName',
                    'shippingAddressLine1',
                    'shippingAddressLine2',
                    'shippingCity',
                    'shippingState',
                    'shippingPostalCode',
                    'shippingCountry'
                    // NOTE: buyerCheckoutNotes is NOT included - updates DB silently
                  ];

                  // Detect changed fields with smart comparison
                  const changedFields = [];
                  for (const key of Object.keys(orderData)) {
                    if (hasFieldChanged(existingOrder[key], orderData[key], key)) {
                      changedFields.push(key);
                    }
                  }

                  // Filter to only notifiable fields (exclude lastModifiedDate)
                  const notifiableChanges = changedFields.filter(f =>
                    notifiableFields.includes(f) && f !== 'lastModifiedDate'
                  );

                  // Always save ALL changes to DB (even non-notifiable)
                  Object.assign(existingOrder, orderData);
                  await existingOrder.save();

                  // Only add to notification list if there are notifiable changes
                  if (notifiableChanges.length > 0) {
                    // Check if shipping address changed
                    const shippingFields = ['shippingFullName', 'shippingAddressLine1', 'shippingCity', 'shippingState', 'shippingPostalCode'];
                    const shippingChanged = notifiableChanges.some(f => shippingFields.includes(f));

                    if (shippingChanged) {
                      console.log(`  🏠 SHIPPING ADDRESS CHANGED: ${ebayOrder.orderId}`);
                    }

                    updatedOrders.push({
                      orderId: existingOrder.orderId,
                      changedFields: notifiableChanges
                    });
                    console.log(`  🔔 NOTIFY: ${ebayOrder.orderId} - ${notifiableChanges.join(', ')}`);
                  } else {
                    // Changes were made but not notifiable (e.g., buyerCheckoutNotes, dates, etc.)
                    console.log(`  ✅ UPDATED (silent): ${ebayOrder.orderId} - ${changedFields.join(', ')}`);
                  }
                }
              }

              // EARLY EXIT
              if (batchOrders.length < batchSize) {
                hasMore = false;
                console.log(`[${sellerName}] PHASE 2: Early exit`);
              } else {
                offset += batchSize;
              }
            } catch (phase2Err) {
              console.error(`[${sellerName}] PHASE 2 error:`, phase2Err.message);
              hasMore = false;
            }
          }
        }

        // ========== UPDATE SELLER METADATA ==========
        seller.lastPolledAt = new Date(nowUTC);
        await seller.save();
        console.log(`[${sellerName}] ✅ Complete: ${newOrders.length} new, ${updatedOrders.length} updated`);

        return {
          sellerId: seller._id,
          sellerName,
          success: true,
          newOrders: newOrders.map(o => o.orderId),
          updatedOrders, // Now contains { orderId, changedFields }
          totalNew: newOrders.length,
          totalUpdated: updatedOrders.length
        };

      } catch (sellerErr) {
        console.error(`[${sellerName}] ❌ Error:`, sellerErr.message);
        return {
          sellerId: seller._id,
          sellerName,
          success: false,
          error: sellerErr.message
        };
      }
    });

    // Wait for all sellers to complete (parallel execution)
    const results = await Promise.allSettled(pollingPromises);

    // Process results
    const pollResults = results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason?.message || 'Unknown error'
        };
      }
    });

    const totalNewOrders = pollResults.reduce((sum, r) => sum + (r.totalNew || 0), 0);
    const totalUpdatedOrders = pollResults.reduce((sum, r) => sum + (r.totalUpdated || 0), 0);

    res.json({
      message: 'Polling complete',
      pollResults,
      totalPolled: sellers.length,
      totalNewOrders,
      totalUpdatedOrders
    });

    // Trigger delayed policy messaging in background after polling
    processPendingPolicyMessages(50)
      .then((r) => {
        if (r.processed > 0) {
          console.log(`[PolicyMessage] Background run: processed=${r.processed}, sent=${r.sent}, failed=${r.failed}`);
        }
      })
      .catch((e) => console.error('[PolicyMessage] Background run failed:', e.message));

    console.log('\n========== POLLING SUMMARY ==========');
    console.log(`Total sellers polled: ${sellers.length}`);
    console.log(`Total new orders: ${totalNewOrders}`);
    console.log(`Total updated orders: ${totalUpdatedOrders}`);

  } catch (err) {
    console.error('Error polling all sellers:', err);
    res.status(500).json({ error: err.message });
  }
});

// Poll all sellers for NEW ORDERS ONLY (Phase 1)
router.post('/poll-new-orders', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true, $ne: null } })
      .populate('user', 'username email');

    if (sellers.length === 0) {
      return res.json({
        message: 'No sellers with connected eBay accounts found',
        pollResults: [],
        totalPolled: 0,
        totalNewOrders: 0
      });
    }

    const nowUTC = Date.now();
    console.log(`\n========== POLLING NEW ORDERS FOR ${sellers.length} SELLERS ==========`);
    console.log(`UTC Time: ${new Date(nowUTC).toISOString()}`);

    const pollingPromises = sellers.map(async (seller) => {
      const sellerName = seller.user?.username || seller.user?.email || seller._id.toString();

      try {
        console.log(`\n[${sellerName}] Checking for new orders...`);

        // Token refresh
        const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
        const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
        let accessToken = seller.ebayTokens.access_token;

        if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
          console.log(`[${sellerName}] Refreshing token...`);
          const refreshRes = await axios.post(
            'https://api.ebay.com/identity/v1/oauth2/token',
            qs.stringify({
              grant_type: 'refresh_token',
              refresh_token: seller.ebayTokens.refresh_token,
              scope: EBAY_OAUTH_SCOPES, // Using centralized scopes constant
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
              },
            }
          );
          seller.ebayTokens.access_token = refreshRes.data.access_token;
          seller.ebayTokens.expires_in = refreshRes.data.expires_in;
          seller.ebayTokens.fetchedAt = new Date(nowUTC);
          await seller.save();
          accessToken = refreshRes.data.access_token;
        }

        const orderCount = await Order.countDocuments({ seller: seller._id });
        const latestOrder = await Order.findOne({ seller: seller._id }).sort({ creationDate: -1 });
        const latestCreationDate = latestOrder ? latestOrder.creationDate : null;
        // Default initial sync date: Mar 1, 2026 00:00:00 UTC
        const initialSyncDate = getEffectiveInitialSyncDate(seller.initialSyncDate);
        // Use current time without buffer - Render's servers have accurate NTP sync
        const currentTimeUTC = new Date(nowUTC);

        const newOrders = [];
        let newOrdersFilter = null;
        let newOrdersLimit = 15;

        if (orderCount === 0) {
          newOrdersFilter = `creationdate:[${initialSyncDate.toISOString()}..${currentTimeUTC.toISOString()}]`;
          newOrdersLimit = 200;
          console.log(`[${sellerName}] Initial sync from ${initialSyncDate.toISOString()}`);
        } else if (latestCreationDate) {
          const afterLatestMs = new Date(latestCreationDate).getTime() + 1000;
          const afterLatest = new Date(afterLatestMs);
          const timeDiffMinutes = (currentTimeUTC.getTime() - afterLatestMs) / (1000 * 60);

          if (timeDiffMinutes >= 1) {
            newOrdersFilter = `creationdate:[${afterLatest.toISOString()}..${currentTimeUTC.toISOString()}]`;
            newOrdersLimit = 200;
            console.log(`[${sellerName}] Checking new orders after ${afterLatest.toISOString()}`);
          } else {
            console.log(`[${sellerName}] Skipped (too recent: ${timeDiffMinutes.toFixed(2)} min)`);
          }
        }

        if (newOrdersFilter) {
          // Use pagination to fetch ALL orders (handles >200 orders)
          const ebayNewOrders = await fetchAllOrdersWithPagination(accessToken, newOrdersFilter, sellerName);
          console.log(`[${sellerName}] Found ${ebayNewOrders.length} new orders`);

          for (const ebayOrder of ebayNewOrders) {
            const existingOrder = await Order.findOne({ orderId: ebayOrder.orderId });

            if (!existingOrder) {
              const orderData = await buildOrderData(ebayOrder, seller._id, accessToken);
              const policyEligibleAt = getPolicyEligibilityDate(orderData.creationDate);
              if (policyEligibleAt) {
                orderData.policyMessageEligibleAt = policyEligibleAt;
              }
              const newOrder = await Order.create(orderData);
              newOrders.push(newOrder);
              console.log(`  🆕 NEW: ${ebayOrder.orderId}`);
              await sendAutoWelcomeMessage(seller, newOrder);

              // Fire-and-forget: Update listing quantity to 1
              updateListingQuantityOnOrder(ebayOrder, accessToken, sellerName)
                .catch(err => console.error(`[Quantity Update] Background error for ${ebayOrder.orderId}:`, err.message));

              // Fetch ad fee from eBay Finances API
              try {
                const financesMp = purchaseMarketplaceToFinancesId(newOrder.purchaseMarketplaceId);
                const adFeeResult = await fetchOrderAdFee(accessToken, ebayOrder.orderId, null, financesMp);
                if (adFeeResult.success && adFeeResult.adFeeGeneral > 0) {
                  newOrder.adFeeGeneral = adFeeResult.adFeeGeneral;
                  newOrder.adFeeGeneralUSD = parseFloat((adFeeResult.adFeeGeneral * (newOrder.conversionRate || 1)).toFixed(2));

                  // Recalculate orderEarnings if this is a PAID order
                  if (newOrder.orderPaymentStatus === 'PAID') {
                    const totalDueSeller = parseFloat(newOrder.paymentSummary?.totalDueSeller?.value || 0);
                    const adFeeVal = parseFloat(newOrder.adFeeGeneral || 0);
                    newOrder.orderEarnings = parseFloat((totalDueSeller - adFeeVal).toFixed(2));

                    // Recalculate financial fields (TDS, TID, NET, P.Balance INR, Profit)
                    const marketplace = newOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                      newOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                    const financials = await calculateFinancials({ ...newOrder.toObject(), orderEarnings: newOrder.orderEarnings }, marketplace);
                    newOrder.tds = financials.tds;
                    newOrder.tid = financials.tid;
                    newOrder.net = financials.net;
                    newOrder.pBalanceINR = financials.pBalanceINR;
                    newOrder.ebayExchangeRate = financials.ebayExchangeRate;
                    newOrder.profit = financials.profit;

                    console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - Calculated earnings: $${newOrder.orderEarnings}`);
                  } else {
                    console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} for ${ebayOrder.orderId}`);
                  }

                  await newOrder.save();
                }
              } catch (adFeeErr) {
                console.log(`  ⚠️ Ad fee fetch failed for ${ebayOrder.orderId}: ${adFeeErr.message}`);
              }
            }
          }
        }

        console.log(`[${sellerName}] ✅ Complete: ${newOrders.length} new orders`);

        return {
          sellerId: seller._id,
          sellerName,
          success: true,
          newOrders: newOrders.map(o => o.orderId),
          totalNew: newOrders.length
        };

      } catch (sellerErr) {
        console.error(`[${sellerName}] ❌ Error:`, sellerErr.message);
        return {
          sellerId: seller._id,
          sellerName,
          success: false,
          error: sellerErr.message
        };
      }
    });

    const results = await Promise.allSettled(pollingPromises);
    const pollResults = results.map(result => result.status === 'fulfilled' ? result.value : { success: false, error: result.reason?.message || 'Unknown error' });
    const totalNewOrders = pollResults.reduce((sum, r) => sum + (r.totalNew || 0), 0);

    res.json({
      message: 'New orders polling complete',
      pollResults,
      totalPolled: sellers.length,
      totalNewOrders
    });

    // Trigger delayed policy messaging in background after polling
    processPendingPolicyMessages(50)
      .then((r) => {
        if (r.processed > 0) {
          console.log(`[PolicyMessage] Background run: processed=${r.processed}, sent=${r.sent}, failed=${r.failed}`);
        }
      })
      .catch((e) => console.error('[PolicyMessage] Background run failed:', e.message));

    console.log(`\n========== NEW ORDERS SUMMARY ==========`);
    console.log(`Total new orders: ${totalNewOrders}`);

  } catch (err) {
    console.error('Error polling new orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// ONE-TIME RESYNC: Re-fetch orders from Dec 1, 2025 8AM UTC with USD conversion
router.post('/resync-from-dec1', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true, $ne: null } })
      .populate('user', 'username email');

    if (!sellers || sellers.length === 0) {
      return res.status(404).json({ error: 'No sellers found with eBay tokens' });
    }

    console.log(`\n========== RESYNC FROM DEC 1, 2025 FOR ${sellers.length} SELLERS ==========`);

    const resyncStartDate = new Date('2025-12-01T08:00:00.000Z');
    const currentTimeUTC = new Date();

    const results = {
      totalOrders: 0,
      newOrders: 0,
      updatedOrders: 0,
      errors: [],
      sellerResults: []
    };

    for (const seller of sellers) {
      const sellerName = seller.user?.username || seller.businessName || seller._id;

      try {
        console.log(`\n[${sellerName}] Starting resync from Dec 1, 2025...`);

        const accessToken = await ensureValidToken(seller);

        // Fetch orders from Dec 1, 2025 8AM UTC to now
        const filter = `creationdate:[${resyncStartDate.toISOString()}..${currentTimeUTC.toISOString()}]`;
        console.log(`[${sellerName}] Filter: ${filter}`);

        const ebayOrders = await fetchAllOrdersWithPagination(accessToken, filter, sellerName);
        console.log(`[${sellerName}] Fetched ${ebayOrders.length} orders from eBay`);

        let newCount = 0;
        let updateCount = 0;

        for (const ebayOrder of ebayOrders) {
          try {
            // Build order data with USD conversion
            const orderData = await buildOrderData(ebayOrder, seller._id, accessToken);

            // Check if order exists in DB
            const existingOrder = await Order.findOne({ orderId: ebayOrder.orderId });

            if (existingOrder) {
              // Update existing order, preserve Amazon details
              await Order.updateOne(
                { orderId: ebayOrder.orderId },
                {
                  $set: {
                    // Update eBay data
                    lastModifiedDate: orderData.lastModifiedDate,
                    orderFulfillmentStatus: orderData.orderFulfillmentStatus,
                    orderPaymentStatus: orderData.orderPaymentStatus,
                    pricingSummary: orderData.pricingSummary,
                    cancelStatus: orderData.cancelStatus,
                    paymentSummary: orderData.paymentSummary,
                    lineItems: orderData.lineItems,
                    fulfillmentHrefs: orderData.fulfillmentHrefs,
                    // Update USD fields
                    subtotalUSD: orderData.subtotalUSD,
                    salesTaxUSD: orderData.salesTaxUSD,
                    discountUSD: orderData.discountUSD,
                    shippingUSD: orderData.shippingUSD,
                    transactionFeesUSD: orderData.transactionFeesUSD,
                    refundTotalUSD: orderData.refundTotalUSD,
                    // Update denormalized fields
                    subtotal: orderData.subtotal,
                    salesTax: orderData.salesTax,
                    orderTotal: orderData.orderTotal,
                    discount: orderData.discount,
                    shipping: orderData.shipping,
                    transactionFees: orderData.transactionFees,
                    cancelState: orderData.cancelState,
                    refunds: orderData.refunds,
                    trackingNumber: orderData.trackingNumber || existingOrder.trackingNumber
                    // Amazon fields NOT updated (amazonAccount, beforeTax, etc.)
                  }
                }
              );
              updateCount++;
            } else {
              // Create new order
              await Order.create(orderData);
              newCount++;
            }
          } catch (err) {
            console.error(`[${sellerName}] Error processing order ${ebayOrder.orderId}:`, err.message);
            results.errors.push({ seller: sellerName, orderId: ebayOrder.orderId, error: err.message });
          }
        }

        console.log(`[${sellerName}] ✅ New: ${newCount}, Updated: ${updateCount}`);

        results.totalOrders += ebayOrders.length;
        results.newOrders += newCount;
        results.updatedOrders += updateCount;
        results.sellerResults.push({
          seller: sellerName,
          total: ebayOrders.length,
          new: newCount,
          updated: updateCount
        });

      } catch (err) {
        console.error(`[${sellerName}] ❌ Error:`, err.message);
        results.errors.push({ seller: sellerName, error: err.message });
      }
    }

    console.log('\n========== RESYNC COMPLETE ==========');
    console.log(`Total Orders Processed: ${results.totalOrders}`);
    console.log(`New Orders: ${results.newOrders}`);
    console.log(`Updated Orders: ${results.updatedOrders}`);
    console.log(`Errors: ${results.errors.length}`);

    res.json({
      success: true,
      message: 'Resync from Dec 1, 2025 completed',
      results
    });

  } catch (err) {
    console.error('Error in resync:', err);
    res.status(500).json({ error: err.message });
  }
});

// Poll all sellers for ORDER UPDATES ONLY (Phase 2)
router.post('/poll-order-updates', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    // Helper function to normalize dates for comparison (ignore milliseconds/format)
    function normalizeDateForComparison(date) {
      if (!date) return null;
      if (date instanceof Date) {
        return Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
      }
      if (typeof date === 'string') {
        return Math.floor(new Date(date).getTime() / 1000);
      }
      return null;
    }

    // Helper function to check if field actually changed
    function hasFieldChanged(oldValue, newValue, fieldName) {
      // Skip system fields
      const systemFields = ['_id', '__v', 'seller', 'updatedAt', 'createdAt'];
      if (systemFields.includes(fieldName)) return false;

      // Date fields - compare Unix timestamps (ignore milliseconds)
      const dateFields = ['creationDate', 'lastModifiedDate', 'dateSold', 'shipByDate', 'estimatedDelivery'];
      if (dateFields.includes(fieldName)) {
        const oldTime = normalizeDateForComparison(oldValue);
        const newTime = normalizeDateForComparison(newValue);
        return oldTime !== newTime;
      }

      // Null/undefined checks
      if (oldValue === null || oldValue === undefined) {
        return newValue !== null && newValue !== undefined;
      }

      // Objects/Arrays - deep comparison
      if (typeof newValue === 'object' && newValue !== null) {
        return JSON.stringify(oldValue) !== JSON.stringify(newValue);
      }

      // Primitives - direct comparison
      return oldValue !== newValue;
    }

    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true, $ne: null } })
      .populate('user', 'username email');

    if (sellers.length === 0) {
      return res.json({
        message: 'No sellers with connected eBay accounts found',
        pollResults: [],
        totalPolled: 0,
        totalUpdatedOrders: 0
      });
    }

    const nowUTC = Date.now();
    const orderPollLookbackDays = Math.min(90, parseInt(process.env.EBAY_ORDER_POLL_LOOKBACK_DAYS || '90', 10) || 90);
    const lookbackMs = orderPollLookbackDays * 24 * 60 * 60 * 1000;
    const lookbackFloor = new Date(nowUTC - lookbackMs);

    console.log(`\n========== POLLING ORDER UPDATES FOR ${sellers.length} SELLERS ==========`);
    console.log(`UTC Time: ${new Date(nowUTC).toISOString()}`);
    console.log(`Checking orders from: ${lookbackFloor.toISOString()} (${orderPollLookbackDays}d floor)`);

    const pollingPromises = sellers.map(async (seller) => {
      const sellerName = seller.user?.username || seller.user?.email || seller._id.toString();

      try {
        console.log(`\n[${sellerName}] Checking for order updates...`);

        // ✅ STEP 1: Find latest lastModifiedDate from DB for THIS SELLER
        const latestOrder = await Order.findOne({
          seller: seller._id,
          lastModifiedDate: { $exists: true, $ne: null }
        })
          .sort({ lastModifiedDate: -1 })
          .select('lastModifiedDate orderId')
          .lean();

        let sinceDate;

        if (latestOrder && latestOrder.lastModifiedDate) {
          // Use latest lastModifiedDate from DB
          sinceDate = new Date(latestOrder.lastModifiedDate);
          console.log(`[${sellerName}] Latest order: ${latestOrder.orderId}`);
          console.log(`[${sellerName}] Latest lastModifiedDate: ${sinceDate.toISOString()}`);
        } else {
          // No orders yet - use initialSyncDate or lookback floor
          sinceDate = seller.initialSyncDate || lookbackFloor;
          console.log(`[${sellerName}] No existing orders - using: ${sinceDate.toISOString()}`);
        }

        // Fulfillment filter is effectively limited to recent history; keep a configurable floor.
        if (sinceDate < lookbackFloor) {
          sinceDate = lookbackFloor;
          console.log(`[${sellerName}] Capped to ${orderPollLookbackDays}-day lookback floor`);
        }

        // Token refresh
        const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
        const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
        let accessToken = seller.ebayTokens.access_token;

        if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
          console.log(`[${sellerName}] Refreshing token...`);
          const refreshRes = await axios.post(
            'https://api.ebay.com/identity/v1/oauth2/token',
            qs.stringify({
              grant_type: 'refresh_token',
              refresh_token: seller.ebayTokens.refresh_token,
              scope: EBAY_OAUTH_SCOPES, // Using centralized scopes constant
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
              },
            }
          );
          seller.ebayTokens.access_token = refreshRes.data.access_token;
          seller.ebayTokens.expires_in = refreshRes.data.expires_in;
          seller.ebayTokens.fetchedAt = new Date(nowUTC);
          await seller.save();
          accessToken = refreshRes.data.access_token;
        }

        // ✅ STEP 2: Fetch orders from eBay with lastModifiedDate >= sinceDate
        const toDate = new Date(nowUTC);
        const modifiedFilter = `lastmodifieddate:[${sinceDate.toISOString()}..${toDate.toISOString()}]`;

        console.log(`[${sellerName}] Filter: ${modifiedFilter}`);
        const updatedOrders = [];

        const recentOrders = await Order.find({
          seller: seller._id,
          creationDate: { $gte: lookbackFloor }
        }).select('orderId lastModifiedDate creationDate');

        console.log(`[${sellerName}] ${recentOrders.length} orders within lookback window`);

        if (recentOrders.length > 0) {

          let offset = 0;
          const batchSize = 100;
          let hasMore = true;
          const recentOrderIdSet = new Set(recentOrders.map(o => o.orderId));

          while (hasMore) {
            const phase2Res = await axios.get('https://api.ebay.com/sell/fulfillment/v1/order', {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              params: {
                filter: modifiedFilter,
                limit: batchSize,
                offset: offset > 0 ? offset : undefined
              }
            });

            const batchOrders = phase2Res.data.orders || [];
            console.log(`[${sellerName}] Got ${batchOrders.length} orders at offset ${offset}`);

            const relevantOrders = batchOrders.filter(o => recentOrderIdSet.has(o.orderId));

            for (const ebayOrder of relevantOrders) {
              const existingOrder = await Order.findOne({
                orderId: ebayOrder.orderId,
                seller: seller._id
              });

              if (existingOrder) {
                const ebayModTime = new Date(ebayOrder.lastModifiedDate).getTime();
                const dbModTime = new Date(existingOrder.lastModifiedDate).getTime();

                // OPTIMIZATION: Skip if not actually modified
                if (ebayModTime <= dbModTime) {
                  continue; // No changes, skip this order
                }

                // ONLY NOW fetch full order data (includes expensive tracking lookup)
                const orderData = await buildOrderData(ebayOrder, seller._id, accessToken);



                // Detect changed fields with smart comparison
                const changedFields = [];
                for (const key of Object.keys(orderData)) {
                  if (hasFieldChanged(existingOrder[key], orderData[key], key)) {
                    changedFields.push(key);
                  }
                }



                // Always save ALL changes to DB (even non-notifiable)
                Object.assign(existingOrder, orderData);

                // Check if order became FULLY_REFUNDED and set earnings to $0
                if (existingOrder.orderPaymentStatus === 'FULLY_REFUNDED') {
                  existingOrder.orderEarnings = 0;

                  // Recalculate financial fields with $0 earnings
                  const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                    existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                  const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);
                  existingOrder.tds = financials.tds;
                  existingOrder.tid = financials.tid;
                  existingOrder.net = financials.net;
                  existingOrder.pBalanceINR = financials.pBalanceINR;
                  existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                  existingOrder.profit = financials.profit;

                  console.log(`  ❌ FULLY_REFUNDED: ${ebayOrder.orderId} - Earnings set to $0`);
                } else if (existingOrder.orderPaymentStatus === 'PARTIALLY_REFUNDED') {
                  // For PARTIALLY_REFUNDED: earnings = $0
                  existingOrder.orderEarnings = 0;

                  // Recalculate financial fields
                  const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                    existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                  const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: existingOrder.orderEarnings }, marketplace);
                  existingOrder.tds = financials.tds;
                  existingOrder.tid = financials.tid;
                  existingOrder.net = financials.net;
                  existingOrder.pBalanceINR = financials.pBalanceINR;
                  existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                  existingOrder.profit = financials.profit;

                  console.log(`  ⚠️ PARTIALLY_REFUNDED: ${ebayOrder.orderId} - Earnings set to $0`);
                }

                await existingOrder.save();

                // Fetch ad fee if not already set
                if (!existingOrder.adFeeGeneral || existingOrder.adFeeGeneral === 0) {
                  try {
                    const financesMp = purchaseMarketplaceToFinancesId(existingOrder.purchaseMarketplaceId);
                    const adFeeResult = await fetchOrderAdFee(accessToken, ebayOrder.orderId, null, financesMp);
                    if (adFeeResult.success && adFeeResult.adFeeGeneral > 0) {
                      existingOrder.adFeeGeneral = adFeeResult.adFeeGeneral;
                      existingOrder.adFeeGeneralUSD = parseFloat((adFeeResult.adFeeGeneral * (existingOrder.conversionRate || 1)).toFixed(2));

                      // Recalculate orderEarnings based on payment status
                      if (existingOrder.orderPaymentStatus === 'PAID') {
                        const totalDueSeller = parseFloat(existingOrder.paymentSummary?.totalDueSeller?.value || 0);
                        const adFeeVal = parseFloat(existingOrder.adFeeGeneral || 0);
                        existingOrder.orderEarnings = parseFloat((totalDueSeller - adFeeVal).toFixed(2));

                        // Recalculate financial fields (TDS, TID, NET, P.Balance INR, Profit)
                        const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                          existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                        const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: existingOrder.orderEarnings }, marketplace);
                        existingOrder.tds = financials.tds;
                        existingOrder.tid = financials.tid;
                        existingOrder.net = financials.net;
                        existingOrder.pBalanceINR = financials.pBalanceINR;
                        existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                        existingOrder.profit = financials.profit;

                        console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - Recalculated earnings: $${existingOrder.orderEarnings}`);
                      } else if (existingOrder.orderPaymentStatus === 'PARTIALLY_REFUNDED') {
                        // For PARTIALLY_REFUNDED: earnings remain $0
                        existingOrder.orderEarnings = 0;

                        // Recalculate financial fields (TDS, TID, NET, P.Balance INR, Profit)
                        const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                          existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                        const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: existingOrder.orderEarnings }, marketplace);
                        existingOrder.tds = financials.tds;
                        existingOrder.tid = financials.tid;
                        existingOrder.net = financials.net;
                        existingOrder.pBalanceINR = financials.pBalanceINR;
                        existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                        existingOrder.profit = financials.profit;

                        console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - PARTIALLY_REFUNDED earnings remain $0`);
                      } else if (existingOrder.orderPaymentStatus === 'FULLY_REFUNDED') {
                        // For FULLY_REFUNDED: earnings = $0 (ad fee stored but not used in calculation)
                        existingOrder.orderEarnings = 0;

                        // Recalculate financial fields with $0
                        const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                          existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                        const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);
                        existingOrder.tds = financials.tds;
                        existingOrder.tid = financials.tid;
                        existingOrder.net = financials.net;
                        existingOrder.pBalanceINR = financials.pBalanceINR;
                        existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                        existingOrder.profit = financials.profit;

                        console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - FULLY_REFUNDED earnings: $0`);
                      } else {
                        console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} for ${ebayOrder.orderId}`);
                      }

                      await existingOrder.save();
                    }
                  } catch (adFeeErr) {
                    console.log(`  ⚠️ Ad fee fetch failed for ${ebayOrder.orderId}: ${adFeeErr.message}`);
                  }
                }

                // Add to list if there are ANY changes
                if (changedFields.length > 0) {
                  // Check if shipping address changed
                  const shippingFields = ['shippingFullName', 'shippingAddressLine1', 'shippingCity', 'shippingState', 'shippingPostalCode'];
                  const shippingChanged = changedFields.some(f => shippingFields.includes(f));

                  if (shippingChanged) {
                    console.log(`  🏠 SHIPPING ADDRESS CHANGED: ${ebayOrder.orderId}`);
                  }

                  updatedOrders.push({
                    orderId: existingOrder.orderId,
                    changedFields: changedFields
                  });
                  console.log(`  🔔 NOTIFY: ${ebayOrder.orderId} - ${changedFields.join(', ')}`);
                }
              }
            }

            if (batchOrders.length < batchSize) {
              hasMore = false;
            } else {
              offset += batchSize;
            }
          }
        }

        console.log(`[${sellerName}] ✅ Complete: ${updatedOrders.length} updated`);

        return {
          sellerId: seller._id,
          sellerName,
          success: true,
          updatedOrders, // Now contains { orderId, changedFields }
          totalUpdated: updatedOrders.length
        };

      } catch (sellerErr) {
        console.error(`[${sellerName}] ❌ Error:`, sellerErr.message);
        return {
          sellerId: seller._id,
          sellerName,
          success: false,
          error: sellerErr.message
        };
      }
    });

    const results = await Promise.allSettled(pollingPromises);
    const pollResults = results.map(result => result.status === 'fulfilled' ? result.value : { success: false, error: result.reason?.message || 'Unknown error' });
    const totalUpdatedOrders = pollResults.reduce((sum, r) => sum + (r.totalUpdated || 0), 0);

    res.json({
      message: 'Order updates polling complete',
      pollResults,
      totalPolled: sellers.length,
      totalUpdatedOrders
    });

    console.log(`\n========== ORDER UPDATES SUMMARY ==========`);
    console.log(`Total updated orders: ${totalUpdatedOrders}`);

  } catch (err) {
    console.error('Error polling order updates:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resync recent orders (last 10 days) - catches silent eBay changes where lastModifiedDate wasn't updated
router.post('/resync-recent', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    // Fields that should NOT be overwritten (manually set by team)
    const MANUAL_FIELDS = new Set([
      'amazonAccount', 'beforeTax', 'estimatedTax', 'beforeTaxUSD', 'estimatedTaxUSD',
      'amazonTotal', 'amazonTotalINR', 'marketplaceFee', 'igst', 'totalCC', 'amazonExchangeRate',
      'fulfillmentNotes', 'remark', 'messagingStatus', 'itemStatus', 'resolvedFrom',
      'arrivingDate',
      '_id', '__v', 'createdAt', 'updatedAt'
    ]);

    // Helper to normalize dates for comparison (ignore milliseconds)
    function normalizeDateForComparison(date) {
      if (!date) return null;
      return Math.floor(new Date(date).getTime() / 1000);
    }

    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true, $ne: null } })
      .populate('user', 'username email');

    if (sellers.length === 0) {
      return res.json({
        message: 'No sellers with connected eBay accounts found',
        pollResults: [],
        totalPolled: 0,
        totalUpdated: 0,
        totalNew: 0
      });
    }

    const nowUTC = Date.now();
    const days = Math.min(Math.max(parseInt(req.body.days) || 10, 1), 90); // Default 10, max 90
    const sinceDate = new Date(nowUTC - days * 24 * 60 * 60 * 1000);

    console.log(`\n========== RESYNC RECENT ORDERS (${days} DAYS) FOR ${sellers.length} SELLERS ==========`);
    console.log(`UTC Time: ${new Date(nowUTC).toISOString()}`);
    console.log(`Checking orders created since: ${sinceDate.toISOString()}`);

    const pollingPromises = sellers.map(async (seller) => {
      const sellerName = seller.user?.username || seller.user?.email || seller._id.toString();

      try {
        console.log(`\n[${sellerName}] Starting resync...`);

        // Token refresh
        const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
        const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
        let accessToken = seller.ebayTokens.access_token;

        if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
          console.log(`[${sellerName}] Refreshing token...`);
          const refreshRes = await axios.post(
            'https://api.ebay.com/identity/v1/oauth2/token',
            qs.stringify({
              grant_type: 'refresh_token',
              refresh_token: seller.ebayTokens.refresh_token,
              scope: EBAY_OAUTH_SCOPES,
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
              },
            }
          );
          seller.ebayTokens.access_token = refreshRes.data.access_token;
          seller.ebayTokens.expires_in = refreshRes.data.expires_in;
          seller.ebayTokens.fetchedAt = new Date(nowUTC);
          await seller.save();
          accessToken = refreshRes.data.access_token;
        }

        // Fetch all orders created in last 10 days
        const currentTimeUTC = new Date(nowUTC);
        const filter = `creationdate:[${sinceDate.toISOString()}..${currentTimeUTC.toISOString()}]`;
        console.log(`[${sellerName}] Filter: ${filter}`);

        const ebayOrders = await fetchAllOrdersWithPagination(accessToken, filter, sellerName);
        console.log(`[${sellerName}] Fetched ${ebayOrders.length} orders from eBay`);

        const updatedOrders = [];
        const newOrders = [];

        for (const ebayOrder of ebayOrders) {
          const existingOrder = await Order.findOne({
            orderId: ebayOrder.orderId,
            seller: seller._id
          });

          if (existingOrder) {
            // Build fresh order data from eBay
            const orderData = await buildOrderData(ebayOrder, seller._id, accessToken);

            // Only apply eBay-sourced fields (skip manual fields)
            let hasChanges = false;
            const changedFields = [];

            for (const [key, value] of Object.entries(orderData)) {
              if (MANUAL_FIELDS.has(key)) continue;
              if (key === 'seller') continue;

              // Compare values
              const oldVal = existingOrder[key];
              const newVal = value;
              let changed = false;

              if (oldVal === null || oldVal === undefined) {
                changed = newVal !== null && newVal !== undefined;
              } else if (key === 'creationDate' || key === 'lastModifiedDate' || key === 'dateSold' || key === 'shipByDate' || key === 'estimatedDelivery') {
                // Date comparison - normalize to seconds
                changed = normalizeDateForComparison(oldVal) !== normalizeDateForComparison(newVal);
              } else if (typeof newVal === 'object' && newVal !== null) {
                changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
              } else {
                changed = oldVal !== newVal;
              }

              if (changed) {
                existingOrder[key] = value;
                hasChanges = true;
                changedFields.push(key);
              }
            }

            if (hasChanges) {
              // Check if order became FULLY_REFUNDED and set earnings to $0
              if (existingOrder.orderPaymentStatus === 'FULLY_REFUNDED') {
                existingOrder.orderEarnings = 0;

                // Recalculate financial fields with $0 earnings
                const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                  existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);
                existingOrder.tds = financials.tds;
                existingOrder.tid = financials.tid;
                existingOrder.net = financials.net;
                existingOrder.pBalanceINR = financials.pBalanceINR;
                existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                existingOrder.profit = financials.profit;

                console.log(`  ❌ FULLY_REFUNDED: ${ebayOrder.orderId} - Earnings set to $0`);
              } else if (existingOrder.orderPaymentStatus === 'PARTIALLY_REFUNDED') {
                // For PARTIALLY_REFUNDED: earnings = $0
                existingOrder.orderEarnings = 0;

                // Recalculate financial fields
                const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                  existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: existingOrder.orderEarnings }, marketplace);
                existingOrder.tds = financials.tds;
                existingOrder.tid = financials.tid;
                existingOrder.net = financials.net;
                existingOrder.pBalanceINR = financials.pBalanceINR;
                existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                existingOrder.profit = financials.profit;

                console.log(`  ⚠️ PARTIALLY_REFUNDED: ${ebayOrder.orderId} - Earnings set to $0`);
              }

              await existingOrder.save();
              updatedOrders.push({
                orderId: existingOrder.orderId,
                changedFields
              });
              console.log(`  🔄 RESYNCED: ${ebayOrder.orderId} - ${changedFields.join(', ')}`);
            }

            // Fetch ad fee if not already set or is $0
            if (!existingOrder.adFeeGeneral || existingOrder.adFeeGeneral === 0) {
              try {
                const financesMp = purchaseMarketplaceToFinancesId(existingOrder.purchaseMarketplaceId);
                const adFeeResult = await fetchOrderAdFee(accessToken, ebayOrder.orderId, null, financesMp);
                if (adFeeResult.success && adFeeResult.adFeeGeneral > 0) {
                  existingOrder.adFeeGeneral = adFeeResult.adFeeGeneral;
                  existingOrder.adFeeGeneralUSD = parseFloat((adFeeResult.adFeeGeneral * (existingOrder.conversionRate || 1)).toFixed(2));

                  // Recalculate orderEarnings based on payment status
                  if (existingOrder.orderPaymentStatus === 'PAID') {
                    const totalDueSeller = parseFloat(existingOrder.paymentSummary?.totalDueSeller?.value || 0);
                    const adFeeVal = parseFloat(existingOrder.adFeeGeneral || 0);
                    existingOrder.orderEarnings = parseFloat((totalDueSeller - adFeeVal).toFixed(2));

                    // Recalculate financial fields (TDS, TID, NET, P.Balance INR, Profit)
                    const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                      existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                    const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: existingOrder.orderEarnings }, marketplace);
                    existingOrder.tds = financials.tds;
                    existingOrder.tid = financials.tid;
                    existingOrder.net = financials.net;
                    existingOrder.pBalanceINR = financials.pBalanceINR;
                    existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                    existingOrder.profit = financials.profit;

                    console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - Recalculated earnings: $${existingOrder.orderEarnings}`);
                  } else if (existingOrder.orderPaymentStatus === 'PARTIALLY_REFUNDED') {
                    // For PARTIALLY_REFUNDED: earnings remain $0
                    existingOrder.orderEarnings = 0;

                    // Recalculate financial fields (TDS, TID, NET, P.Balance INR, Profit)
                    const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                      existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                    const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: existingOrder.orderEarnings }, marketplace);
                    existingOrder.tds = financials.tds;
                    existingOrder.tid = financials.tid;
                    existingOrder.net = financials.net;
                    existingOrder.pBalanceINR = financials.pBalanceINR;
                    existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                    existingOrder.profit = financials.profit;

                    console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - PARTIALLY_REFUNDED earnings remain $0`);
                  } else if (existingOrder.orderPaymentStatus === 'FULLY_REFUNDED') {
                    // For FULLY_REFUNDED: earnings = $0 (ad fee stored but not used in calculation)
                    existingOrder.orderEarnings = 0;

                    // Recalculate financial fields with $0
                    const marketplace = existingOrder.purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
                      existingOrder.purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
                    const financials = await calculateFinancials({ ...existingOrder.toObject(), orderEarnings: 0 }, marketplace);
                    existingOrder.tds = financials.tds;
                    existingOrder.tid = financials.tid;
                    existingOrder.net = financials.net;
                    existingOrder.pBalanceINR = financials.pBalanceINR;
                    existingOrder.ebayExchangeRate = financials.ebayExchangeRate;
                    existingOrder.profit = financials.profit;

                    console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} - FULLY_REFUNDED earnings: $0`);
                  } else {
                    console.log(`  💰 Ad Fee: $${adFeeResult.adFeeGeneral} for ${ebayOrder.orderId}`);
                  }

                  await existingOrder.save();
                }
              } catch (adFeeErr) {
                console.log(`  ⚠️ Ad fee fetch failed for ${ebayOrder.orderId}: ${adFeeErr.message}`);
              }
            }
          } else {
            // New order not in DB - ignore it.
            // As per user request, new orders should ONLY be fetched via the "Poll New Orders" button.
            // The resync button is strictly for updating existing orders.
            console.log(`  ⏭️ NEW (resync): ${ebayOrder.orderId} - Ignored. Not in DB.`);
          }
        }

        console.log(`[${sellerName}] ✅ Resync complete: ${updatedOrders.length} updated, ${newOrders.length} new`);

        return {
          sellerId: seller._id,
          sellerName,
          success: true,
          totalFetched: ebayOrders.length,
          updatedOrders,
          newOrders,
          totalUpdated: updatedOrders.length,
          totalNew: newOrders.length
        };

      } catch (sellerErr) {
        console.error(`[${sellerName}] ❌ Resync error:`, sellerErr.message);
        return {
          sellerId: seller._id,
          sellerName,
          success: false,
          error: sellerErr.message
        };
      }
    });

    const results = await Promise.allSettled(pollingPromises);
    const pollResults = results.map(result =>
      result.status === 'fulfilled' ? result.value : { success: false, error: result.reason?.message || 'Unknown error' }
    );

    const totalUpdated = pollResults.reduce((sum, r) => sum + (r.totalUpdated || 0), 0);
    const totalNew = pollResults.reduce((sum, r) => sum + (r.totalNew || 0), 0);

    res.json({
      message: 'Resync complete',
      pollResults,
      totalPolled: sellers.length,
      totalUpdated,
      totalNew
    });

    console.log('\n========== RESYNC SUMMARY ==========');
    console.log(`Total sellers: ${sellers.length}`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Total new: ${totalNew}`);

  } catch (err) {
    console.error('Error in resync:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Helper function to fetch ALL orders with pagination
// ============================================
// This fetches orders in batches of 200 (eBay max) until all orders are retrieved
async function fetchAllOrdersWithPagination(accessToken, filter, sellerName) {
  const allOrders = [];
  let offset = 0;
  const limit = 200; // eBay max per request
  let hasMore = true;
  let totalOrders = 0;

  console.log(`[${sellerName}] Starting paginated fetch...`);

  while (hasMore) {
    let attempt = 1;
    const maxRetries = 3;
    let success = false;

    while (attempt <= maxRetries && !success) {
      try {
        const params = {
          filter: filter,
          limit: limit
        };

        // Only add offset if it's greater than 0
        if (offset > 0) {
          params.offset = offset;
        }

        const response = await axios.get('https://api.ebay.com/sell/fulfillment/v1/order', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params,
          timeout: 15000 // 15 second timeout
        });

        const orders = response.data.orders || [];
        totalOrders = response.data.total || orders.length;

        allOrders.push(...orders);

        console.log(`[${sellerName}] Fetched ${orders.length} orders at offset ${offset} (total so far: ${allOrders.length}/${totalOrders})`);

        // Check if there are more orders to fetch
        if (allOrders.length >= totalOrders || orders.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        success = true; // Mark as successful
      } catch (err) {
        const status = err.response?.status;
        const isRetryable = status === 503 || status === 429 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

        if (isRetryable && attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s (max 5s)
          console.log(`[${sellerName}] ⚠️ Pagination attempt ${attempt} at offset ${offset} failed with ${status || err.code}, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          attempt++;
        } else {
          console.error(`[${sellerName}] ❌ Pagination error at offset ${offset} after ${attempt} attempts:`, err.message);
          hasMore = false; // Stop on error after retries exhausted
          success = true; // Exit retry loop
        }
      }
    }
  }

  console.log(`[${sellerName}] ✅ Pagination complete: ${allOrders.length} orders`);
  return allOrders;
}

// ─── Auto-Compatibility: sellers excluded from "Run All Sellers" ──────────────
// Add exact (case-sensitive) username/email substrings here to permanently exclude a seller.
// Any seller whose username or email *contains* one of these strings is skipped.
const AUTO_COMPAT_EXCLUDED_USERNAMES = [
  'Vergo',   // Vergo seller — managed separately, exclude from bulk runs
];
// ─────────────────────────────────────────────────────────────────────────────

// Item IDs that should NOT have their quantity updated when ordered
const QUANTITY_UPDATE_EXCLUDED_ITEMS = new Set([
  '127311585410',
  '127311587672',
  '127311588411',
  '127311588863',
  '127311596014',
  '389381058706',
  '389381053145',
  '389381049342',
  '389381045467',
  '389381039761',
  '317649392161',
  '317649397683',
  '317649395742',
  '317649399983',
  '317649401541',
  '127632524706',
  '127632525908',
  '127632527199',
  '127632535240',
  '127632517576',
  '397653418688',
  '397653430223',
  '397653431626',
  '397653432958',
  '397653434997',
  '389697500304',
  '389697505524',
  '389697519189',
  '389697527530',
  '389697527648',
  '389707394803',
  '389707398007',
  '389707398167',
  '406742433098',
  '406742435500',
  '406742435984',
  '177927320888',
  '177927336580',
  '177927336724',
  '389707470348',
  '389707471563',
  '389707471798',
  '177933876674',
  '177933879168',
  '177933879217',
  '389711830316',
  '389711827996',
  '389711828096',
  '389707470348',
  '389707471563',
  '389707471798',
  '389719944291',
  '389719946273',
  '389719946325',
  '236712714683',
  '236712734790',
  '236712734883',
  '236712734944',
  '236712735005',
  '389798717090',
  '389798767664',
  '389798767905',
  '389798768087',
  '389798768257',
  '137166531019',
  '137166559893',
  '137166559917',
  '137166559933',
  '137166559948',
  '389798718204',
  '389798770343',
  '389798770391',
  '389798770430',
  '389798770555',
  '397760832934',
  '397760867895',
  '397760867926',
  '397760867950',
  '397760868001',
  '397760910024',
  '397760915006',
  '397760913732',
  '397760913792',
  '397760912460',
    '318135906852',
    '318135906854',
    '318135906872',
    '318135906878',
    '318135906890',
    '389876300253',
    '389876300254',
    '389876300263',
    '389876300264',
    '389876300271',
    '397828455740',
    '397828455742',
    '397828455743',
    '397828455744',
    '397828455749',
    '397828455873',
    '397828455874',
    '397828455876',
    '397828455877',
    '397828455878',
    '389905142747',
    '389905161240',
    '389905163638',
    '389905163695',
    '389905163516',




]);

// ============================================
// HELPER: Update Listing Quantity to 1 on New Order
// ============================================
// When a new order arrives, set quantity to 1 for each line item's listing.
// Uses Trading API (ReviseInventoryStatus) which works for ALL listing types.
async function updateListingQuantityOnOrder(ebayOrder, accessToken, sellerName) {
  const lineItems = ebayOrder.lineItems || [];
  if (lineItems.length === 0) return;

  const orderId = ebayOrder.orderId;
  console.log(`[Quantity Update] Processing ${lineItems.length} line item(s) for order ${orderId}`);

  for (const lineItem of lineItems) {
    const legacyItemId = lineItem.legacyItemId;
    const title = lineItem.title || 'Unknown';

    if (!legacyItemId) {
      console.log(`[Quantity Update] ⚠️ Line item has no ItemID, skipping: ${title}`);
      continue;
    }

    if (QUANTITY_UPDATE_EXCLUDED_ITEMS.has(legacyItemId)) {
      console.log(`[Quantity Update] ⏭️ Excluded ItemID: ${legacyItemId} (${title}), skipping`);
      continue;
    }

    try {
      console.log(`[Quantity Update] Setting quantity to 1 for ItemID: ${legacyItemId} (${title})`);

      const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <InventoryStatus>
    <ItemID>${legacyItemId}</ItemID>
    <Quantity>1</Quantity>
  </InventoryStatus>
</ReviseInventoryStatusRequest>`;

      const tradingRes = await axios.post(
        'https://api.ebay.com/ws/api.dll',
        xmlRequest,
        {
          headers: {
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1271',
            'X-EBAY-API-CALL-NAME': 'ReviseInventoryStatus',
            'X-EBAY-API-IAF-TOKEN': accessToken,
            'Content-Type': 'text/xml'
          }
        }
      );

      // Parse XML response to check for errors
      const parsed = await parseStringPromise(tradingRes.data, { explicitArray: false });
      const ack = parsed?.ReviseInventoryStatusResponse?.Ack;

      if (ack === 'Success' || ack === 'Warning') {
        console.log(`[Quantity Update] ✅ Set quantity to 1 for ItemID: ${legacyItemId}`);
      } else {
        const errorMsg = parsed?.ReviseInventoryStatusResponse?.Errors?.ShortMessage || 'Unknown error';
        console.error(`[Quantity Update] ❌ Trading API error for ItemID ${legacyItemId}: ${errorMsg}`);
      }
    } catch (err) {
      console.error(`[Quantity Update] ❌ Error updating quantity for ItemID ${legacyItemId}:`, err.response?.data || err.message);
    }
  }
}

// Helper function to build order data object for insert/update
async function buildOrderData(ebayOrder, sellerId, accessToken) {
  const lineItem = ebayOrder.lineItems?.[0] || {};
  const fulfillmentInstr = ebayOrder.fulfillmentStartInstructions?.[0] || {};
  const shipTo = fulfillmentInstr.shippingStep?.shipTo || {};
  const buyerAddr = `${shipTo.contactAddress?.addressLine1 || ''}, ${shipTo.contactAddress?.city || ''}, ${shipTo.contactAddress?.stateOrProvince || ''}, ${shipTo.contactAddress?.postalCode || ''}, ${shipTo.contactAddress?.countryCode || ''}`.trim();

  const trackingNumber = await extractTrackingNumber(ebayOrder.fulfillmentHrefs, accessToken);
  const purchaseMarketplaceId = lineItem.purchaseMarketplaceId || '';

  // Build base order data
  const orderData = {
    seller: sellerId,
    orderId: ebayOrder.orderId,
    legacyOrderId: ebayOrder.legacyOrderId,
    creationDate: ebayOrder.creationDate,
    lastModifiedDate: ebayOrder.lastModifiedDate,
    orderFulfillmentStatus: ebayOrder.orderFulfillmentStatus,
    orderPaymentStatus: ebayOrder.orderPaymentStatus,
    sellerId: ebayOrder.sellerId,
    buyer: ebayOrder.buyer,
    buyerCheckoutNotes: ebayOrder.buyerCheckoutNotes,
    pricingSummary: ebayOrder.pricingSummary,
    cancelStatus: ebayOrder.cancelStatus,
    paymentSummary: ebayOrder.paymentSummary,
    fulfillmentStartInstructions: ebayOrder.fulfillmentStartInstructions,
    lineItems: ebayOrder.lineItems,
    ebayCollectAndRemitTax: ebayOrder.ebayCollectAndRemitTax,
    salesRecordReference: ebayOrder.salesRecordReference,
    totalFeeBasisAmount: ebayOrder.totalFeeBasisAmount,
    totalMarketplaceFee: ebayOrder.totalMarketplaceFee,
    fulfillmentHrefs: ebayOrder.fulfillmentHrefs,
    // Denormalized fields
    dateSold: ebayOrder.creationDate,
    shipByDate: lineItem.lineItemFulfillmentInstructions?.shipByDate,
    estimatedDelivery: lineItem.lineItemFulfillmentInstructions?.maxEstimatedDeliveryDate,
    productName: lineItem.title,
    itemNumber: lineItem.legacyItemId,
    buyerAddress: buyerAddr,
    shippingFullName: shipTo.fullName || '',
    shippingAddressLine1: shipTo.contactAddress?.addressLine1 || '',
    shippingAddressLine2: shipTo.contactAddress?.addressLine2 || '',
    shippingCity: shipTo.contactAddress?.city || '',
    shippingState: shipTo.contactAddress?.stateOrProvince || '',
    shippingPostalCode: shipTo.contactAddress?.postalCode || '',
    shippingCountry: shipTo.contactAddress?.countryCode || '',
    shippingPhone: shipTo.primaryPhone?.phoneNumber || '0000000000',
    quantity: lineItem.quantity,
    subtotal: parseFloat(ebayOrder.pricingSummary?.priceSubtotal?.value || 0),
    salesTax: parseFloat(lineItem.ebayCollectAndRemitTaxes?.[0]?.amount?.value || 0),
    discount: parseFloat(ebayOrder.pricingSummary?.priceDiscount?.value || 0),
    shipping: parseFloat(ebayOrder.pricingSummary?.deliveryCost?.value || 0),
    transactionFees: parseFloat(ebayOrder.totalMarketplaceFee?.value || 0),
    adFee: parseFloat(lineItem.appliedPromotions?.[0]?.discountAmount?.value || 0),
    refunds: ebayOrder.paymentSummary?.refunds || [],
    trackingNumber,
    purchaseMarketplaceId
  };

  orderData.orderTotal = parseFloat(((parseFloat(ebayOrder.pricingSummary?.total?.value || 0)) + orderData.salesTax).toFixed(2));

  // Enhanced cancel state extraction with multiple fallbacks
  let cancelState = 'NONE_REQUESTED';
  if (ebayOrder.cancelStatus) {
    // Try different possible property names from eBay API
    cancelState = ebayOrder.cancelStatus.cancelState ||
      ebayOrder.cancelStatus.state ||
      ebayOrder.cancelStatus.status ||
      (ebayOrder.cancelStatus.cancelled ? 'CANCELED' : 'NONE_REQUESTED');
  }
  orderData.cancelState = cancelState;

  // Calculate total refunds
  let refundTotal = 0;
  if (ebayOrder.paymentSummary?.refunds && Array.isArray(ebayOrder.paymentSummary.refunds)) {
    refundTotal = ebayOrder.paymentSummary.refunds.reduce((sum, refund) => {
      return sum + parseFloat(refund.amount?.value || 0);
    }, 0);
  }

  // Calculate and add USD conversion fields
  if (purchaseMarketplaceId === 'EBAY_US') {
    // US orders are already in USD
    orderData.subtotalUSD = orderData.subtotal;
    orderData.shippingUSD = orderData.shipping;
    orderData.salesTaxUSD = orderData.salesTax;
    orderData.discountUSD = orderData.discount;
    orderData.transactionFeesUSD = orderData.transactionFees;
    orderData.refundTotalUSD = refundTotal;
    // Only set USD values for beforeTax/estimatedTax if they exist (manual fields)
    if (orderData.beforeTax !== undefined && orderData.beforeTax !== null) {
      orderData.beforeTaxUSD = orderData.beforeTax;
    }
    if (orderData.estimatedTax !== undefined && orderData.estimatedTax !== null) {
      orderData.estimatedTaxUSD = orderData.estimatedTax;
    }
    orderData.conversionRate = 1;
  } else {
    // For non-US orders, calculate conversion rate from paymentSummary
    let conversionRate = 0;

    if (ebayOrder.paymentSummary?.totalDueSeller?.convertedFromValue &&
      ebayOrder.paymentSummary?.totalDueSeller?.value) {
      const originalValue = parseFloat(ebayOrder.paymentSummary.totalDueSeller.convertedFromValue);
      const usdValue = parseFloat(ebayOrder.paymentSummary.totalDueSeller.value);
      if (originalValue > 0) {
        conversionRate = usdValue / originalValue;
      }
    }

    // Apply conversion rate to all monetary fields with proper rounding (2 decimal places)
    orderData.subtotalUSD = conversionRate ? parseFloat((orderData.subtotal * conversionRate).toFixed(2)) : 0;
    orderData.shippingUSD = conversionRate ? parseFloat((orderData.shipping * conversionRate).toFixed(2)) : 0;
    orderData.salesTaxUSD = conversionRate ? parseFloat((orderData.salesTax * conversionRate).toFixed(2)) : 0;
    orderData.discountUSD = conversionRate ? parseFloat((orderData.discount * conversionRate).toFixed(2)) : 0;
    orderData.transactionFeesUSD = conversionRate ? parseFloat((orderData.transactionFees * conversionRate).toFixed(2)) : 0;
    orderData.refundTotalUSD = conversionRate ? parseFloat((refundTotal * conversionRate).toFixed(2)) : 0;
    orderData.beforeTaxUSD = conversionRate ? parseFloat(((orderData.beforeTax || 0) * conversionRate).toFixed(2)) : 0;
    orderData.estimatedTaxUSD = conversionRate ? parseFloat(((orderData.estimatedTax || 0) * conversionRate).toFixed(2)) : 0;
    orderData.conversionRate = parseFloat(conversionRate.toFixed(5)); // Store rate with 5 decimal precision
  }

  // Auto-calculate orderEarnings for PAID orders: totalDueSeller.value - adFeeGeneral
  // If adFeeGeneral is not yet available, it defaults to 0
  if (orderData.orderPaymentStatus === 'PAID') {
    const totalDueSeller = parseFloat(ebayOrder.paymentSummary?.totalDueSeller?.value || 0);
    const adFee = parseFloat(orderData.adFeeGeneral || 0);
    orderData.orderEarnings = parseFloat((totalDueSeller - adFee).toFixed(2));

    // Calculate downstream financial fields
    const marketplace = purchaseMarketplaceId === 'EBAY_ENCA' ? 'EBAY_CA' :
      purchaseMarketplaceId === 'EBAY_AU' ? 'EBAY_AU' : 'EBAY';
    const financials = await calculateFinancials({ ...orderData }, marketplace);
    Object.assign(orderData, financials);
  }

  // Auto-populate CRP if this item has been classified
  if (orderData.itemNumber) {
    const mapping = await ItemCategoryMap.findOne({ itemNumber: orderData.itemNumber }).lean();
    if (mapping) {
      orderData.orderCategoryId = mapping.categoryId;
      orderData.orderRangeId = mapping.rangeId || null;
      orderData.orderProductId = mapping.productId || null;
    }
  }

  return orderData;
}

// Update messaging status for an order
router.patch('/orders/:orderId/messaging-status', async (req, res) => {
  const { orderId } = req.params;
  const { messagingStatus } = req.body;

  if (!messagingStatus) {
    return res.status(400).json({ error: 'Missing messagingStatus value' });
  }

  // Validate enum values
  const validStatuses = ['Not Yet Started', 'Ongoing Conversation', 'Resolved'];
  if (!validStatuses.includes(messagingStatus)) {
    return res.status(400).json({ error: 'Invalid messagingStatus value' });
  }

  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { messagingStatus },
      { new: true }
    ).populate({
      path: 'seller',
      populate: {
        path: 'user',
        select: 'username email'
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update item status for an order
router.patch('/orders/:orderId/item-status', async (req, res) => {
  const { orderId } = req.params;
  const { itemStatus, resolvedFrom } = req.body;

  if (!itemStatus) return res.status(400).json({ error: 'Missing itemStatus' });

  const validStatuses = ['None', 'Out of Stock', 'Delayed Delivery', 'Label Created', 'Other'];

  // Validate enum values
  if (!validStatuses.includes(itemStatus)) {
    return res.status(400).json({ error: 'Invalid itemStatus value' });
  }

  try {
    const updateData = { itemStatus };

    // If resolving, save the resolvedFrom field
    if (itemStatus === 'Resolved' && resolvedFrom) {
      updateData.resolvedFrom = resolvedFrom;
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true }
    ).populate({
      path: 'seller',
      populate: {
        path: 'user',
        select: 'username email'
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update notes for an order from awaiting shipment page 
router.patch('/orders/:orderId/notes', async (req, res) => {
  const { orderId } = req.params;
  const { notes } = req.body;

  if (notes === undefined || notes === null) {
    return res.status(400).json({ error: 'Missing notes value' });
  }

  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { notes: String(notes) },
      { new: true }
    ).populate({
      path: 'seller',
      populate: {
        path: 'user',
        select: 'username email'
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW ROUTE: Update Fulfillment Notes ---
router.patch('/orders/:orderId/fulfillment-notes', async (req, res) => {
  const { orderId } = req.params;
  const { fulfillmentNotes } = req.body;

  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { fulfillmentNotes: String(fulfillmentNotes || '') }, // Update the new field
      { new: true }
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dismiss order from Amazon Arrivals (soft delete - clears arrivingDate)
router.patch('/orders/:orderId/dismiss-arrival', requireAuth, async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Clear the arriving date (soft delete)
    order.arrivingDate = null;
    await order.save();

    // Populate seller info for response
    await order.populate({
      path: 'seller',
      populate: {
        path: 'user',
        select: 'username email'
      }
    });

    res.json({
      success: true,
      message: 'Order dismissed from Amazon Arrivals',
      order
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== RETURN REQUESTS ENDPOINTS =====

// Fetch return requests from eBay Post-Order API and store in DB

// Fetch return requests from eBay Post-Order API and store in DB
router.post('/fetch-returns', requireAuth, requirePageAccess('Disputes'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } })
      .populate('user', 'username');

    if (sellers.length === 0) {
      return res.json({ message: 'No sellers with eBay tokens found', totalReturns: 0 });
    }

    let totalNewReturns = 0;
    let totalUpdatedReturns = 0;
    const errors = [];

    console.log(`[Fetch Returns] Starting for ${sellers.length} sellers`);

    const results = await Promise.allSettled(
      sellers.map(async (seller) => {
        const sellerName = seller.user?.username || 'Unknown Seller';

        try {
          // Token refresh logic (Standard)
          const nowUTC = Date.now();
          const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
          const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
          let accessToken = seller.ebayTokens.access_token;

          if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
            console.log(`[Fetch Returns] Refreshing token for seller ${sellerName}`);
            const refreshRes = await axios.post(
              'https://api.ebay.com/identity/v1/oauth2/token',
              qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: seller.ebayTokens.refresh_token,
                scope: EBAY_OAUTH_SCOPES // Using centralized scopes constant
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
                },
              }
            );
            accessToken = refreshRes.data.access_token;
            seller.ebayTokens.access_token = accessToken;
            seller.ebayTokens.expires_in = refreshRes.data.expires_in;
            seller.ebayTokens.fetchedAt = new Date(nowUTC);
            await seller.save();
          }

          // Fetch return requests
          const returnUrl = 'https://api.ebay.com/post-order/v2/return/search';
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

          const returnRes = await axios.get(returnUrl, {
            headers: {
              'Authorization': `IAF ${accessToken}`,
              'Content-Type': 'application/json',
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            },
            params: {
              'creation_date_range_from': thirtyDaysAgo,
              'limit': 200
            }
          });

          const returns = returnRes.data.members || [];
          console.log(`[Fetch Returns] Seller ${sellerName}: Found ${returns.length} returns`);

          let newReturns = 0;
          let updatedReturns = 0;
          let updateDetails = []; // Track updates for frontend snackbar

          for (const ebayReturn of returns) {
            // 1. Safe Extraction
            const creationInfo = ebayReturn.creationInfo || {};
            const itemInfo = creationInfo.item || {};
            const sellerRefund = ebayReturn.sellerTotalRefund?.estimatedRefundAmount || {};

            // 2. Build Data Object (CASTING TO MATCH SCHEMA)
            const returnData = {
              seller: seller._id,
              returnId: ebayReturn.returnId,
              orderId: ebayReturn.orderId || ebayReturn.orderNumber,
              legacyOrderId: ebayReturn.legacyOrderId,
              buyerUsername: ebayReturn.buyerLoginName,
              returnReason: creationInfo.reason,
              returnStatus: ebayReturn.state || ebayReturn.status,
              returnType: creationInfo.type,
              itemId: itemInfo.itemId,
              itemTitle: itemInfo.title || itemInfo.itemId,
              returnQuantity: itemInfo.returnQuantity,
              refundAmount: {
                // FIX 1: Force String to match Mongoose Schema "String"
                value: String(sellerRefund.value || 0),
                currency: sellerRefund.currency
              },
              creationDate: creationInfo.creationDate?.value ? new Date(creationInfo.creationDate.value) : null,
              responseDate: ebayReturn.sellerResponseDue?.respondByDate?.value ? new Date(ebayReturn.sellerResponseDue.respondByDate.value) : null,
              rmaNumber: ebayReturn.RMANumber,
              buyerComments: creationInfo.comments?.content,
              rawData: ebayReturn
            };

            const existing = await Return.findOne({ returnId: ebayReturn.returnId });

            if (existing) {
              // --- HELPER FUNCTIONS FOR COMPARISON ---
              // Convert to seconds (ignore milliseconds)
              const getUnix = (d) => d ? Math.floor(new Date(d).getTime() / 1000) : 0;
              // Convert to string to handle "63.95" vs 63.95 mismatch
              const safeStr = (v) => (v === undefined || v === null) ? '' : String(v);

              // --- COMPARISON LOGIC ---
              const statusChanged = existing.returnStatus !== returnData.returnStatus;

              // FIX 2: Compare as Strings
              const refundChanged = safeStr(existing.refundAmount?.value) !== safeStr(returnData.refundAmount?.value);

              // FIX 3: Compare as Unix Timestamps (seconds)
              const responseDateChanged = getUnix(existing.responseDate) !== getUnix(returnData.responseDate);
              const creationDateChanged = getUnix(existing.creationDate) !== getUnix(returnData.creationDate);

              if (statusChanged || refundChanged || responseDateChanged || creationDateChanged) {

                // DIAGNOSTIC LOG: This will show you exactly what changed in your terminal
                console.log(`[Update Triggered] Return ${ebayReturn.returnId}:`);
                if (statusChanged) console.log(`   - Status: ${existing.returnStatus} -> ${returnData.returnStatus}`);
                if (refundChanged) console.log(`   - Refund: ${existing.refundAmount?.value} -> ${returnData.refundAmount?.value}`);
                if (responseDateChanged) console.log(`   - RespDate: ${existing.responseDate} -> ${returnData.responseDate}`);
                if (creationDateChanged) console.log(`   - CreateDate: ${existing.creationDate} -> ${returnData.creationDate}`);

                // Use .set() to update fields
                existing.set(returnData);
                await existing.save();
                updatedReturns++;

                // Track update details for frontend snackbar
                if (!updateDetails) updateDetails = [];
                updateDetails.push({
                  returnId: ebayReturn.returnId,
                  orderId: returnData.orderId,
                  changes: {
                    ...(statusChanged && { status: { from: existing.returnStatus, to: returnData.returnStatus } }),
                    ...(refundChanged && { refund: { from: existing.refundAmount?.value, to: returnData.refundAmount?.value } })
                  }
                });
              }
            } else {
              await Return.create(returnData);
              newReturns++;
            }
          }

          return {
            sellerName: sellerName,
            newReturns,
            updatedReturns,
            updateDetails, // Include update details for frontend snackbar
            totalReturns: returns.length
          };

        } catch (err) {
          console.error(`[Fetch Returns] Error for seller ${sellerName}:`, err.message);
          throw new Error(`${sellerName}: ${err.message}`);
        }
      })
    );

    const successResults = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successResults.push(result.value);
        totalNewReturns += result.value.newReturns;
        totalUpdatedReturns += result.value.updatedReturns;
      } else {
        errors.push(result.reason.message);
      }
    });

    res.json({
      message: `Fetched returns for ${successResults.length} sellers`,
      totalNewReturns,
      totalUpdatedReturns,
      results: successResults,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('[Fetch Returns] Error:', err);
    res.status(500).json({ error: err.message });
  }
});
// Get stored returns from database

router.get('/stored-returns', async (req, res) => {
  const { sellerId, status, reason, startDate, endDate, urgentOnly, page = 1, limit = 50 } = req.query;

  try {
    let query = {};
    if (sellerId) query.seller = sellerId;
    if (status) query.returnStatus = status;
    // Support multiple reasons (comma-separated) with OR logic using $in
    if (reason) {
      const reasons = reason.split(',').map(r => r.trim()).filter(r => r);
      if (reasons.length === 1) {
        query.returnReason = reasons[0];
      } else if (reasons.length > 1) {
        query.returnReason = { $in: reasons };
      }
    }

    // Date range filter on creationDate
    if (startDate || endDate) {
      query.creationDate = {};
      if (startDate) query.creationDate.$gte = new Date(startDate);
      if (endDate) {
        // Include the entire end date (end of day)
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.creationDate.$lte = endOfDay;
      }
    }

    // Urgent filter - response due within next 2 days (48 hours) to match the URGENT chip
    if (urgentOnly === 'true') {
      const now = new Date();
      // Calculate 48 hours (2 days) from now - matches isResponseUrgent in frontend
      const in48Hours = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      // Show entries where response is due between now and 48 hours from now
      // Also include entries that are already overdue (responseDate < now)
      query.responseDate = {
        $lte: in48Hours
      };
      // Exclude CLOSED returns since they don't show URGENT chip
      query.returnStatus = { $ne: 'CLOSED' };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const returns = await Return.find(query)
      .populate({
        path: 'seller',
        select: 'user', // Select the 'user' field from Seller.js
        populate: {
          path: 'user', // Follow the link to User.js
          select: 'username' // Get the 'username' from User.js
        }
      })
      .sort({ creationDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(); // Use lean for faster queries and to allow modification

    // Lookup product names and order dates from Orders collection
    const orderIds = returns.map(r => r.orderId).filter(Boolean);
    const orders = await Order.find({ orderId: { $in: orderIds } }, { orderId: 1, productName: 1, creationDate: 1 }).lean();
    const orderMap = {};
    orders.forEach(o => {
      orderMap[o.orderId] = {
        productName: o.productName,
        dateSold: o.creationDate
      };
    });

    // Attach productName and dateSold to each return
    const returnsWithOrderData = returns.map(r => ({
      ...r,
      productName: orderMap[r.orderId]?.productName || null,
      dateSold: orderMap[r.orderId]?.dateSold || null
    }));

    // Get total count for the query
    const totalCount = await Return.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      returns: returnsWithOrderData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalReturns: totalCount,
        limit: limitNum
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===== INR CASES ENDPOINTS =====

// Fetch INR cases from eBay Post-Order API and store in DB
router.post('/fetch-inr-cases', requireAuth, requirePageAccess('Disputes'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } })
      .populate('user', 'username');

    if (sellers.length === 0) {
      return res.json({ message: 'No sellers with eBay tokens found', totalCases: 0 });
    }

    let totalNewCases = 0;
    let totalUpdatedCases = 0;
    const errors = [];

    console.log(`[Fetch INR Cases] Starting for ${sellers.length} sellers`);

    const results = await Promise.allSettled(
      sellers.map(async (seller) => {
        const sellerName = seller.user?.username || 'Unknown Seller';

        try {
          // Token refresh logic
          const nowUTC = Date.now();
          const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
          const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
          let accessToken = seller.ebayTokens.access_token;

          if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
            console.log(`[Fetch INR Cases] Refreshing token for seller ${sellerName}`);
            const refreshRes = await axios.post(
              'https://api.ebay.com/identity/v1/oauth2/token',
              qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: seller.ebayTokens.refresh_token,
                scope: EBAY_OAUTH_SCOPES // Using centralized scopes constant
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
                },
              }
            );
            accessToken = refreshRes.data.access_token;
            seller.ebayTokens.access_token = accessToken;
            seller.ebayTokens.expires_in = refreshRes.data.expires_in;
            seller.ebayTokens.fetchedAt = new Date(nowUTC);
            await seller.save();
          }

          // Fetch INR cases from Post-Order API
          const inquiryUrl = 'https://api.ebay.com/post-order/v2/inquiry/search';
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

          const inquiryRes = await axios.get(inquiryUrl, {
            headers: {
              'Authorization': `IAF ${accessToken}`,
              'Content-Type': 'application/json',
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            },
            params: {
              'creation_date_range_from': thirtyDaysAgo,
              'limit': 200
            }
          });

          const cases = inquiryRes.data.members || [];
          console.log(`[Fetch INR Cases] Seller ${sellerName}: Found ${cases.length} INR cases`);

          let newCases = 0;
          let updatedCases = 0;
          let updateDetails = [];

          for (const ebayCase of cases) {
            // Determine case type
            const inquiryType = ebayCase.inquiryType || 'INR';
            let caseType = 'INR';
            if (inquiryType === 'SNAD' || inquiryType === 'SIGNIFICANTLY_NOT_AS_DESCRIBED') {
              caseType = 'SNAD';
            } else if (inquiryType !== 'INR' && inquiryType !== 'ITEM_NOT_RECEIVED') {
              caseType = 'OTHER';
            }

            // Try to get orderId from eBay response, or look it up in Order collection
            let orderId = ebayCase.orderId || ebayCase.orderNumber;

            // If no orderId from eBay, try to find it using lineItemId or transactionId
            if (!orderId && (ebayCase.lineItemId || ebayCase.transactionId || ebayCase.itemId)) {
              try {
                // Try to find order with matching lineItem
                const orderQuery = {};
                if (ebayCase.lineItemId) {
                  orderQuery['lineItems.lineItemId'] = ebayCase.lineItemId;
                } else if (ebayCase.transactionId) {
                  orderQuery['lineItems.legacyItemId'] = ebayCase.itemId;
                }

                if (Object.keys(orderQuery).length > 0) {
                  orderQuery.seller = seller._id;
                  const matchingOrder = await Order.findOne(orderQuery).select('orderId');
                  if (matchingOrder) {
                    orderId = matchingOrder.orderId;
                    console.log(`[Fetch INR Cases] Found orderId ${orderId} for case ${ebayCase.inquiryId}`);
                  }
                }
              } catch (lookupErr) {
                console.log(`[Fetch INR Cases] Could not lookup orderId for case ${ebayCase.inquiryId}:`, lookupErr.message);
              }
            }

            const caseData = {
              seller: seller._id,
              caseId: ebayCase.inquiryId,
              caseType,
              orderId: orderId,
              buyerUsername: ebayCase.buyer || ebayCase.buyerLoginName,
              // FIX: eBay returns 'inquiryStatusEnum' not 'state' or 'status'
              status: ebayCase.inquiryStatusEnum || ebayCase.state || ebayCase.status || 'OPEN',

              // Dates
              creationDate: ebayCase.creationDate?.value ? new Date(ebayCase.creationDate.value) : null,
              // FIX: eBay returns 'respondByDate' directly, not nested under 'sellerResponseDue'
              sellerResponseDueDate: ebayCase.respondByDate?.value
                ? new Date(ebayCase.respondByDate.value)
                : (ebayCase.sellerResponseDue?.respondByDate?.value ? new Date(ebayCase.sellerResponseDue.respondByDate.value) : null),
              escalationDate: ebayCase.escalationDate?.value ? new Date(ebayCase.escalationDate.value) : null,
              closedDate: ebayCase.closedDate?.value ? new Date(ebayCase.closedDate.value) : null,
              // FIX: Also store lastModifiedDate from eBay
              lastModifiedDate: ebayCase.lastModifiedDate?.value ? new Date(ebayCase.lastModifiedDate.value) : null,

              // Item Info
              itemId: ebayCase.itemId,
              itemTitle: ebayCase.itemTitle,

              // Amount
              claimAmount: {
                value: String(ebayCase.claimAmount?.value || 0),
                currency: ebayCase.claimAmount?.currency || 'USD'
              },

              // Resolution
              resolution: ebayCase.resolution || null,
              sellerResponse: ebayCase.sellerResponse || null,

              rawData: ebayCase
            };

            const existing = await Case.findOne({ caseId: ebayCase.inquiryId });

            if (existing) {
              // Compare for changes
              const statusChanged = existing.status !== caseData.status;
              const dueDateChanged = (existing.sellerResponseDueDate?.getTime() || 0) !==
                (caseData.sellerResponseDueDate?.getTime() || 0);

              if (statusChanged || dueDateChanged) {
                console.log(`[Update] Case ${ebayCase.inquiryId}: Status ${existing.status} -> ${caseData.status}`);
                existing.set(caseData);
                await existing.save();
                updatedCases++;

                updateDetails.push({
                  caseId: ebayCase.inquiryId,
                  orderId: caseData.orderId,
                  changes: {
                    ...(statusChanged && { status: { from: existing.status, to: caseData.status } })
                  }
                });
              }
            } else {
              await Case.create(caseData);
              newCases++;
            }
          }

          return {
            sellerName: sellerName,
            newCases,
            updatedCases,
            updateDetails,
            totalCases: cases.length
          };

        } catch (err) {
          console.error(`[Fetch INR Cases] Error for seller ${sellerName}:`, err.message);
          throw new Error(`${sellerName}: ${err.message}`);
        }
      })
    );

    const successResults = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successResults.push(result.value);
        totalNewCases += result.value.newCases;
        totalUpdatedCases += result.value.updatedCases;
      } else {
        errors.push(result.reason.message);
      }
    });

    res.json({
      message: `Fetched INR cases for ${successResults.length} sellers`,
      totalNewCases,
      totalUpdatedCases,
      results: successResults,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('[Fetch INR Cases] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get stored INR cases from database
router.get('/stored-inr-cases', async (req, res) => {
  const { sellerId, status, caseType, limit = 200 } = req.query;

  try {
    let query = {};
    if (sellerId) query.seller = sellerId;
    if (status) query.status = status;
    if (caseType) query.caseType = caseType;

    const cases = await Case.find(query)
      .populate({
        path: 'seller',
        select: 'user',
        populate: {
          path: 'user',
          select: 'username'
        }
      })
      .sort({ creationDate: -1 })
      .limit(parseInt(limit));

    const totalCount = await Case.countDocuments(query);

    res.json({ cases, totalCases: cases.length, totalCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===== PAYMENT DISPUTES ENDPOINTS =====

// Fetch Payment Disputes from eBay Fulfillment API and store in DB
router.post('/fetch-payment-disputes', requireAuth, requirePageAccess('Disputes'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } })
      .populate('user', 'username');

    if (sellers.length === 0) {
      return res.json({ message: 'No sellers with eBay tokens found', totalDisputes: 0 });
    }

    let totalNewDisputes = 0;
    let totalUpdatedDisputes = 0;
    const errors = [];

    console.log(`[Fetch Payment Disputes] Starting for ${sellers.length} sellers`);

    const results = await Promise.allSettled(
      sellers.map(async (seller) => {
        const sellerName = seller.user?.username || 'Unknown Seller';

        try {
          // Token refresh logic
          const nowUTC = Date.now();
          const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
          const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
          let accessToken = seller.ebayTokens.access_token;

          if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
            console.log(`[Fetch Payment Disputes] Refreshing token for seller ${sellerName}`);
            const refreshRes = await axios.post(
              'https://api.ebay.com/identity/v1/oauth2/token',
              qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: seller.ebayTokens.refresh_token,
                scope: EBAY_OAUTH_SCOPES // Using centralized scopes constant
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
                },
              }
            );
            accessToken = refreshRes.data.access_token;
            seller.ebayTokens.access_token = accessToken;
            seller.ebayTokens.expires_in = refreshRes.data.expires_in;
            seller.ebayTokens.fetchedAt = new Date(nowUTC);
            await seller.save();
          }

          // Fetch Payment Disputes from Fulfillment API
          // Uses Bearer token and the payment_dispute_summary endpoint
          // IMPORTANT: Requires sell.payment.dispute scope (different from sell.fulfillment)
          // Docs: https://developer.ebay.com/api-docs/sell/fulfillment/resources/payment_dispute/methods/getPaymentDisputeSummaries
          const disputeUrl = 'https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute_summary';

          let disputes = [];
          try {
            const disputeRes = await axios.get(disputeUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              params: {
                'limit': 200
              }
            });
            disputes = disputeRes.data.paymentDisputeSummaries || [];
            console.log(`[Fetch Payment Disputes] Seller ${sellerName}: Found ${disputes.length} disputes`);
          } catch (apiErr) {
            // Log the actual error for debugging
            const errMsg = apiErr.response?.data?.errors?.[0]?.message || apiErr.message;
            const errCode = apiErr.response?.status;
            console.log(`[Fetch Payment Disputes] Seller ${sellerName}: API Error - ${errCode} ${errMsg}`);

            // 404 might mean no disputes, 403 means missing scope
            if (errCode === 404) {
              disputes = [];
            } else if (errCode === 403) {
              // Missing sell.payment.dispute scope - seller needs to re-authorize
              console.log(`[Fetch Payment Disputes] Seller ${sellerName}: Missing sell.payment.dispute scope - needs re-authorization`);
              throw new Error(`Missing payment dispute scope - seller needs to re-connect eBay account`);
            } else {
              // Re-throw other errors
              throw apiErr;
            }
          }

          let newDisputes = 0;
          let updatedDisputes = 0;
          let updateDetails = [];

          for (const ebayDispute of disputes) {
            const disputeData = {
              seller: seller._id,
              paymentDisputeId: ebayDispute.paymentDisputeId,
              orderId: ebayDispute.orderId,
              buyerUsername: ebayDispute.buyerUsername,

              // Status & Reason
              paymentDisputeStatus: ebayDispute.paymentDisputeStatus,
              reason: ebayDispute.reason,

              // Dates
              openDate: ebayDispute.openDate ? new Date(ebayDispute.openDate) : null,
              respondByDate: ebayDispute.respondByDate ? new Date(ebayDispute.respondByDate) : null,
              closedDate: ebayDispute.closedDate ? new Date(ebayDispute.closedDate) : null,

              // Amounts
              amount: {
                value: String(ebayDispute.amount?.value || 0),
                currency: ebayDispute.amount?.currency || 'USD'
              },

              // Resolution
              sellerProtectionDecision: ebayDispute.sellerResponse?.sellerProtectionDecision || null,
              resolution: ebayDispute.resolution?.resolutionType || null,

              // Evidence
              evidenceDeadline: ebayDispute.evidenceDeadline ? new Date(ebayDispute.evidenceDeadline) : null,

              rawData: ebayDispute
            };

            const existing = await PaymentDispute.findOne({ paymentDisputeId: ebayDispute.paymentDisputeId });

            if (existing) {
              // Compare for changes
              const statusChanged = existing.paymentDisputeStatus !== disputeData.paymentDisputeStatus;
              const dueDateChanged = (existing.respondByDate?.getTime() || 0) !==
                (disputeData.respondByDate?.getTime() || 0);

              if (statusChanged || dueDateChanged) {
                console.log(`[Update] Dispute ${ebayDispute.paymentDisputeId}: Status ${existing.paymentDisputeStatus} -> ${disputeData.paymentDisputeStatus}`);
                existing.set(disputeData);
                await existing.save();
                updatedDisputes++;

                updateDetails.push({
                  paymentDisputeId: ebayDispute.paymentDisputeId,
                  orderId: disputeData.orderId,
                  changes: {
                    ...(statusChanged && { status: { from: existing.paymentDisputeStatus, to: disputeData.paymentDisputeStatus } })
                  }
                });
              }
            } else {
              await PaymentDispute.create(disputeData);
              newDisputes++;
            }
          }

          return {
            sellerName: sellerName,
            newDisputes,
            updatedDisputes,
            updateDetails,
            totalDisputes: disputes.length
          };

        } catch (err) {
          console.error(`[Fetch Payment Disputes] Error for seller ${sellerName}:`, err.message);
          throw new Error(`${sellerName}: ${err.message}`);
        }
      })
    );

    const successResults = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successResults.push(result.value);
        totalNewDisputes += result.value.newDisputes;
        totalUpdatedDisputes += result.value.updatedDisputes;
      } else {
        errors.push(result.reason.message);
      }
    });

    res.json({
      message: `Fetched payment disputes for ${successResults.length} sellers`,
      totalNewDisputes,
      totalUpdatedDisputes,
      results: successResults,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('[Fetch Payment Disputes] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get stored Payment Disputes from database
router.get('/stored-payment-disputes', async (req, res) => {
  const { sellerId, status, reason, limit = 200 } = req.query;

  try {
    let query = {};
    if (sellerId) query.seller = sellerId;
    if (status) query.paymentDisputeStatus = status;
    if (reason) query.reason = reason;

    const disputes = await PaymentDispute.find(query)
      .populate({
        path: 'seller',
        select: 'user',
        populate: {
          path: 'user',
          select: 'username'
        }
      })
      .sort({ openDate: -1 })
      .limit(parseInt(limit));

    const totalCount = await PaymentDispute.countDocuments(query);

    res.json({ disputes, totalDisputes: disputes.length, totalCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get a lightweight index of all issues (INR/SNAD cases, returns, disputes) keyed by orderId
// Used by Fulfillment Dashboard to show an "Issues" column
router.get('/issues-by-order', requireAuth, async (req, res) => {
  try {
    const [cases, returns, disputes, conversationMeta] = await Promise.all([
      Case.find({}, { orderId: 1, caseType: 1, status: 1, _id: 0 }).lean(),
      Return.find({}, { orderId: 1, returnStatus: 1, _id: 0 }).lean(),
      PaymentDispute.find({}, { orderId: 1, paymentDisputeStatus: 1, reason: 1, _id: 0 }).lean(),
      ConversationMeta.find({}, { orderId: 1, caseStatus: 1, _id: 0 }).lean()
    ]);

    // Build index: orderId -> array of issue objects
    const index = {};
    const caseStatusByOrderId = new Map(
      conversationMeta
        .filter(meta => meta.orderId)
        .map(meta => [meta.orderId, meta.caseStatus || 'Case Not Opened'])
    );

    const addIssue = (orderId, issue) => {
      if (!orderId) return;
      if (!index[orderId]) index[orderId] = [];
      index[orderId].push({
        ...issue,
        caseStatus: caseStatusByOrderId.get(orderId) || 'Case Not Opened'
      });
    };

    cases.forEach(c => {
      addIssue(c.orderId, { type: c.caseType || 'INR', status: c.status });
    });

    returns.forEach(r => {
      addIssue(r.orderId, { type: 'Return', status: r.returnStatus });
    });

    disputes.forEach(d => {
      addIssue(d.orderId, { type: 'Dispute', status: d.paymentDisputeStatus, reason: d.reason });
    });

    res.json({ index });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 1. HEAVY SYNC: Fetch Inbox (Manual Trigger)
// 1. HEAVY SYNC: Fetch Inbox (Smart Polling)
router.post('/sync-inbox', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    console.log('[Sync Inbox] Starting smart message sync...');
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } }).populate('user', 'username email');
    let totalNew = 0;
    const syncResults = []; // Track per-seller results

    for (const seller of sellers) {
      const sellerName = seller.user?.username || seller.user?.email || seller._id;
      try {
        // 1. Ensure Token is Valid
        const token = await ensureValidToken(seller);

        // 2. Determine Time Window (Smart Polling)
        const now = new Date();
        let startTime;

        if (seller.lastMessagePolledAt) {
          // INCREMENTAL SYNC: Fetch from last poll time
          // We subtract 15 minutes overlap to ensure no messages are missed due to server latency
          startTime = new Date(new Date(seller.lastMessagePolledAt).getTime() - 15 * 60 * 1000);
          console.log(`[${sellerName}] Incremental sync from: ${startTime.toISOString()}`);
        } else {
          // INITIAL SYNC: Fetch last 12 Days
          startTime = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
          console.log(`[${sellerName}] First-time sync from: ${startTime.toISOString()} (Last 10 Days)`);
        }

        const startTimeStr = startTime.toISOString();
        const endTimeStr = now.toISOString();

        // 3. XML Request
        const xmlRequest = `
          <?xml version="1.0" encoding="utf-8"?>
          <GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
            
            <MailMessageType>All</MailMessageType>
            
            <StartCreationTime>${startTimeStr}</StartCreationTime>
            <EndCreationTime>${endTimeStr}</EndCreationTime>
            
            <Pagination>
              <EntriesPerPage>200</EntriesPerPage>
              <PageNumber>1</PageNumber>
            </Pagination>
          </GetMemberMessagesRequest>
        `;

        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
          headers: {
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
            'X-EBAY-API-CALL-NAME': 'GetMemberMessages',
            'Content-Type': 'text/xml'
          }
        });

        const result = await parseStringPromise(response.data);

        if (result.GetMemberMessagesResponse.Ack[0] === 'Failure') {
          const error = result.GetMemberMessagesResponse.Errors?.[0]?.LongMessage?.[0];
          console.error(`eBay API Failure for seller ${seller._id}:`, error);
          syncResults.push({ sellerName, newMessages: 0, error: error });
          continue;
        }

        const messages = result.GetMemberMessagesResponse.MemberMessage?.[0]?.MemberMessageExchange || [];

        // 4. Process Messages
        let newForThisSeller = 0;
        for (const msg of messages) {
          const isNew = await processEbayMessage(msg, seller);
          if (isNew) {
            newForThisSeller++;
            totalNew++;
          }
        }

        console.log(`[Sync Inbox] Seller ${sellerName}: Fetched ${messages.length}. Saved ${newForThisSeller} new.`);
        syncResults.push({ sellerName, newMessages: newForThisSeller, fetched: messages.length });

        // 5. Update Polling Timestamp (Only on success)
        seller.lastMessagePolledAt = now;
        await seller.save();

      } catch (err) {
        console.error(`Sync error for seller ${seller._id}:`, err.message);
        syncResults.push({ sellerName, newMessages: 0, error: err.message });
      }
    }

    res.json({ success: true, totalNewMessages: totalNew, syncResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




//LIGHT SYNC: Active Thread Poll (Auto Interval)
// Filters by SenderID to be lightweight
// 2. LIGHT SYNC: Active Thread Poll
router.post('/sync-thread', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  const { sellerId, buyerUsername, itemId } = req.body;

  if (!sellerId || !buyerUsername) return res.status(400).json({ error: 'Missing identifiers' });

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // 1. Ensure Token is Valid
    const token = await ensureValidToken(seller);

    // 2. Time Filters
    const now = new Date();
    const startTime = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = now.toISOString();

    const xmlRequest = `
      <?xml version="1.0" encoding="utf-8"?>
      <GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
        
        <MailMessageType>All</MailMessageType>
        
        <SenderID>${buyerUsername}</SenderID>
        
        <StartCreationTime>${startTime}</StartCreationTime>
        <EndCreationTime>${endTime}</EndCreationTime>
        
        ${itemId ? `<ItemID>${itemId}</ItemID>` : ''}
        
        <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
      </GetMemberMessagesRequest>
    `;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': 'GetMemberMessages',
        'Content-Type': 'text/xml'
      }
    });

    const result = await parseStringPromise(response.data);
    const messages = result.GetMemberMessagesResponse.MemberMessage?.[0]?.MemberMessageExchange || [];

    let hasNew = false;
    for (const msg of messages) {
      const isNew = await processEbayMessage(msg, seller);
      if (isNew) hasNew = true;
    }

    res.json({ success: true, newMessagesFound: hasNew });
  } catch (err) {
    console.error('Thread sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Helper: Upload Image to eBay Picture Services (EPS)
// Buyers use the exact same process - they upload via eBay's UI which calls UploadSiteHostedPictures
// The MediaURL we receive from buyers is also from i.ebayimg.com domain
async function uploadImageToEbay(token, filePath) {
  try {
    console.log('[eBay Upload] Processing image:', filePath);

    // Step 1: Process image with Sharp
    const metadata = await sharp(filePath).metadata();
    console.log('[eBay Upload] Original format:', metadata.format, `${metadata.width}x${metadata.height}`);

    // Step 2: Convert to JPEG with optimal settings for eBay
    let processedBuffer = await sharp(filePath)
      .rotate() // Auto-rotate based on EXIF
      .resize(1600, 1600, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // Remove transparency
      .jpeg({
        quality: 95,
        chromaSubsampling: '4:4:4', // No chroma subsampling for better quality
        force: true
      })
      .toBuffer();

    // Check file size
    let fileSizeMB = processedBuffer.length / (1024 * 1024);
    if (fileSizeMB > 7) {
      console.log('[eBay Upload] Image too large, recompressing...');
      processedBuffer = await sharp(processedBuffer)
        .jpeg({ quality: 85 })
        .toBuffer();
      fileSizeMB = processedBuffer.length / (1024 * 1024);
    }

    console.log(`[eBay Upload] Processed: ${fileSizeMB.toFixed(2)}MB JPEG`);

    const fileName = path.basename(filePath).replace(/\.[^/.]+$/, '.jpg');

    // Step 3: Use multipart/form-data (eBay's recommended method)
    const form = new FormData();

    // Add XML payload as first part
    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <PictureName>${fileName}</PictureName>
  <PictureSet>Standard</PictureSet>
</UploadSiteHostedPicturesRequest>`;

    form.append('XML Payload', xmlPayload, {
      contentType: 'text/xml; charset=utf-8'
    });

    // Add binary image as second part
    form.append(fileName, processedBuffer, {
      filename: fileName,
      contentType: 'image/jpeg'
    });

    // Step 4: Upload to eBay Picture Services
    const response = await axios.post('https://api.ebay.com/ws/api.dll', form, {
      headers: {
        ...form.getHeaders(),
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures'
      },
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    const result = await parseStringPromise(response.data);
    const ack = result.UploadSiteHostedPicturesResponse.Ack[0];

    if (ack === 'Success' || ack === 'Warning') {
      const fullUrl = result.UploadSiteHostedPicturesResponse.SiteHostedPictureDetails[0].FullURL[0];
      console.log('[eBay Upload] ✅ Success:', fullUrl);
      return fullUrl;
    } else {
      const errors = result.UploadSiteHostedPicturesResponse.Errors;
      const errorMsg = errors[0].LongMessage[0];
      const errorCode = errors[0].ErrorCode?.[0];
      console.error('[eBay Upload] ❌ Failed:', errorCode, errorMsg);
      throw new Error(`eBay Upload Failed: ${errorMsg}`);
    }
  } catch (error) {
    console.error('[eBay Upload] Error:', error.message);
    if (error.response?.data) {
      console.error('[eBay Upload] Response:', error.response.data.substring(0, 500));
    }
    throw error;
  }
}

// 3. SEND MESSAGE (Chat Window)
router.post('/send-message', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  const { orderId, buyerUsername, itemId, body, subject, mediaUrls } = req.body;

  try {
    let seller = null;
    let finalItemId = itemId;
    let finalBuyer = buyerUsername;
    let isTransaction = false;
    let isDirect = false;
    let parentMessageId = null;

    // Check if this is a DIRECT message (no item)
    if (itemId === 'DIRECT_MESSAGE' || !itemId) {
      isDirect = true;
    }

    // Determine if this is a transaction (ORDER), inquiry (INQUIRY), or direct (DIRECT)
    if (orderId) {
      const order = await Order.findOne({ orderId }).populate('seller');
      if (!order) return res.status(404).json({ error: 'Order not found' });
      seller = order.seller;
      finalItemId = order.lineItems?.[0]?.legacyItemId;
      finalBuyer = order.buyer.username;
      isTransaction = true; // This is a real transaction
    } else {
      // Get the most recent message from this buyer
      const query = isDirect
        ? { buyerUsername, itemId: 'DIRECT_MESSAGE', sender: 'BUYER' }
        : { buyerUsername, itemId, sender: 'BUYER' };

      const prevMsg = await Message.findOne(query)
        .sort({ messageDate: -1 })
        .populate('seller');

      if (prevMsg) {
        seller = prevMsg.seller;
        parentMessageId = prevMsg.externalMessageId; // eBay's message ID

        // Check if this inquiry is related to an order
        if (prevMsg.orderId) {
          isTransaction = true;
        } else if (prevMsg.messageType === 'DIRECT') {
          isDirect = true;
        } else {
          isTransaction = false; // Pre-sale inquiry
        }
      }
    }

    if (!seller) return res.status(400).json({ error: 'Could not determine seller context' });

    // DIRECT messages: Cannot reply via API (eBay limitation)
    if (isDirect) {
      return res.status(400).json({
        error: 'Cannot reply to direct messages via API. These are account-level messages that must be replied to through eBay\'s messaging center.',
        hint: 'Direct messages (without item context) cannot be replied to programmatically.'
      });
    }

    if (!finalItemId || finalItemId === 'DIRECT_MESSAGE') {
      return res.status(400).json({ error: 'ItemID required to send message' });
    }

    // For inquiries (RTQ), we need the parent message ID
    if (!isTransaction && !parentMessageId) {
      return res.status(400).json({ error: 'Cannot reply to inquiry: Original message ID not found' });
    }

    // Ensure Token is Valid
    const token = await ensureValidToken(seller);

    let xmlRequest;
    let callName;

    // Construct Media XML if images are present
    let finalMediaUrls = [];
    if (mediaUrls && mediaUrls.length > 0) {
      console.log(`[Send Message] Processing ${mediaUrls.length} images...`);

      // Convert local URLs to file paths and upload to eBay
      for (const url of mediaUrls) {
        try {
          // Extract filename from URL (e.g., http://localhost:5000/uploads/123.jpg -> 123.jpg)
          const filename = url.split('/').pop();
          const filePath = path.join(process.cwd(), 'public/uploads', filename);

          if (fs.existsSync(filePath)) {
            console.log(`[Send Message] Uploading ${filename} to eBay...`);
            const ebayUrl = await uploadImageToEbay(token, filePath);
            console.log(`[Send Message] Uploaded: ${ebayUrl}`);
            finalMediaUrls.push(ebayUrl);
          } else {
            console.warn(`[Send Message] File not found: ${filePath}`);
          }
        } catch (err) {
          console.error(`[Send Message] Failed to upload image: ${err.message}`);
          // Continue with other images if one fails
        }
      }
    }

    // Prepare message body with image URLs (eBay APIs don't support MessageMedia for sending)
    // Always escape the original message body first
    let finalBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (finalMediaUrls.length > 0) {
      // Format image URLs as clickable links
      // Try multiple formats to ensure maximum compatibility:
      // 1. Plain URL (eBay should auto-detect)
      // 2. With descriptive text
      const imageLinks = finalMediaUrls.map((url, index) => {
        return `Image ${index + 1}: ${url}`;
      }).join('\n');

      finalBody += '\n\n---\nAttached Image(s):\n' + imageLinks;
      console.log('[Send Message] ⚠️ eBay APIs do not support MessageMedia for outgoing messages. Added URLs to message body.');
    }

    // CASE 1: Transaction Message (Use AddMemberMessageAAQToPartner)
    if (isTransaction) {
      callName = 'AddMemberMessageAAQToPartner';

      xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
          <ItemID>${finalItemId}</ItemID>
          <MemberMessage>
            <Body>${finalBody}</Body>
            <Subject>${subject || 'Regarding your order'}</Subject>
            <QuestionType>General</QuestionType>
            <RecipientID>${finalBuyer}</RecipientID>
          </MemberMessage>
        </AddMemberMessageAAQToPartnerRequest>
      `;
    }
    // CASE 2: Inquiry Message (Use AddMemberMessageRTQ - Respond To Question)
    else {
      callName = 'AddMemberMessageRTQ';

      xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <AddMemberMessageRTQRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
          <ItemID>${finalItemId}</ItemID>
          <MemberMessage>
            <Body>${finalBody}</Body>
            <ParentMessageID>${parentMessageId}</ParentMessageID>
            <RecipientID>${finalBuyer}</RecipientID>
          </MemberMessage>
        </AddMemberMessageRTQRequest>
      `;
    }

    console.log(`[Send Message] Using ${callName} for ${isTransaction ? 'transaction' : 'inquiry'} (Item: ${finalItemId}, Buyer: ${finalBuyer})`);

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': callName,
        'Content-Type': 'text/xml'
      }
    });

    const result = await parseStringPromise(response.data);
    const responseKey = `${callName}Response`;
    const ack = result[responseKey].Ack[0];

    if (ack === 'Success' || ack === 'Warning') {
      // Save to database
      const newMsg = await Message.create({
        seller: seller._id,
        orderId: orderId || null,
        itemId: finalItemId,
        buyerUsername: finalBuyer,
        sender: 'SELLER',
        subject: subject || 'Reply',
        body: body,
        mediaUrls: finalMediaUrls || [],
        read: true,
        messageType: isTransaction ? 'ORDER' : 'INQUIRY',
        messageDate: new Date()
      });

      console.log(`[Send Message] ✅ Message sent successfully using ${callName}`);
      return res.json({ success: true, message: newMsg });
    } else {
      const errMsg = result[responseKey].Errors?.[0]?.LongMessage?.[0] || 'eBay API Error';
      throw new Error(errMsg);
    }

  } catch (err) {
    console.error('Send Message Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. GET THREADS (Sidebar List)

// 4. GET THREADS (With Pagination & Search)
router.get('/chat/threads', requireAuth, async (req, res) => {
  try {
    const { sellerId, page = 1, limit = 20, search = '', filterType = 'ALL', filterMarketplace = '', showUnreadOnly = 'false' } = req.query;


    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build the aggregation pipeline
    const pipeline = [];

    // 0. ALWAYS limit to recent messages to prevent sort memory overflow
    //    (MongoDB free-tier has a 32MB sort limit and no allowDiskUse)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 45);
    pipeline.push({ $match: { messageDate: { $gte: cutoffDate } } });

    // 1. FILTER BY SELLER
    if (sellerId) {
      pipeline.push({
        $match: { seller: new mongoose.Types.ObjectId(sellerId) }
      });
    }

    // 2. Sort by date (Process latest messages first)
    pipeline.push({ $sort: { messageDate: -1 } });

    // 3. Group by conversation
    pipeline.push({
      $group: {
        _id: {
          orderId: "$orderId",
          buyer: "$buyerUsername",
          item: "$itemId"
        },
        sellerId: { $first: "$seller" },
        lastMessage: { $first: "$body" },
        lastDate: { $first: "$messageDate" },
        sender: { $first: "$sender" },
        itemTitle: { $first: "$itemTitle" },
        messageType: { $first: "$messageType" },
        unreadCount: {
          $sum: { $cond: [{ $and: [{ $eq: ["$read", false] }, { $eq: ["$sender", "BUYER"] }] }, 1, 0] }
        }
      }
    });

    // 4. LOOKUP ORDER DETAILS (For Buyer Name)
    pipeline.push({
      $lookup: {
        from: 'orders',
        localField: '_id.orderId',
        foreignField: 'orderId',
        as: 'orderDetails'
      }
    });

    // 5. FLATTEN & FORMAT
    pipeline.push({
      $project: {
        orderId: "$_id.orderId",
        buyerUsername: "$_id.buyer",
        itemId: "$_id.item",
        sellerId: 1,
        lastMessage: 1,
        lastDate: 1,
        sender: 1,
        itemTitle: 1,
        messageType: 1,
        unreadCount: 1,
        buyerName: { $arrayElemAt: ["$orderDetails.buyer.buyerRegistrationAddress.fullName", 0] },
        // NEW: Get Marketplace ID from Order
        orderMarketplaceId: { $arrayElemAt: ["$orderDetails.purchaseMarketplaceId", 0] },
        // Extract image URL from order lineItems as fallback
        orderImageUrl: {
          $let: {
            vars: {
              lineItems: { $arrayElemAt: ["$orderDetails.lineItems", 0] },
              currentItemId: "$_id.item"
            },
            in: {
              $let: {
                vars: {
                  matchedItem: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ["$$lineItems", []] },
                          as: "item",
                          cond: { $eq: ["$$item.legacyItemId", "$$currentItemId"] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: { $ifNull: ["$$matchedItem.imageUrl", null] }
              }
            }
          }
        }
      }
    });

    // 5.0 LOOKUP LISTING DETAILS (For Currency -> Marketplace fallback AND Product Image)
    pipeline.push({
      $lookup: {
        from: 'listings',
        localField: 'itemId',
        foreignField: 'itemId',
        as: 'listingDetails'
      }
    });

    // 5.1 COMPUTE MARKETPLACE ID & EXTRACT IMAGE URL & FIX MESSAGE TYPE
    pipeline.push({
      $addFields: {
        listingCurrency: { $arrayElemAt: ["$listingDetails.currency", 0] },
        // Extract product thumbnail for display (try listing first, then order lineItem as fallback)
        productImageUrl: {
          $ifNull: [
            { $arrayElemAt: ["$listingDetails.mainImageUrl", 0] },
            "$orderImageUrl"
          ]
        },
        // Compute actual message type based on current order existence (fixes mismatches)
        // Logic: ORDER if orderId exists, DIRECT if no itemId, INQUIRY if itemId exists without order
        actualMessageType: {
          $cond: {
            if: { $ne: ["$orderId", null] },
            then: "ORDER",
            else: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$itemId", "DIRECT_MESSAGE"] },
                    { $eq: ["$itemId", null] },
                    { $eq: ["$itemId", ""] }
                  ]
                },
                then: "DIRECT",
                else: "INQUIRY"
              }
            }
          }
        }
      }
    });

    pipeline.push({
      $addFields: {
        computedMarketplaceId: {
          $switch: {
            branches: [
              // Case 1: Order exists
              {
                case: { $ifNull: ["$orderMarketplaceId", false] },
                then: "$orderMarketplaceId"
              },
              // Case 2: Listing Currency Map
              { case: { $eq: ["$listingCurrency", "USD"] }, then: "EBAY_US" },
              { case: { $eq: ["$listingCurrency", "CAD"] }, then: "EBAY_CA" },
              { case: { $eq: ["$listingCurrency", "AUD"] }, then: "EBAY_AU" },
              { case: { $eq: ["$listingCurrency", "GBP"] }, then: "EBAY_GB" },
              { case: { $eq: ["$listingCurrency", "EUR"] }, then: "EBAY_DE" },
              // Case 3: Inferred from Item ItemID (basic assumption, can be refined)
              // If we really wanted to we could check site ID here but currency is best proxy
            ],
            default: "Unknown"
          }
        }
      }
    });

    // 5.2. FILTER BY TYPE
    if (filterType === 'ORDER') {
      pipeline.push({
        $match: {
          $or: [
            { messageType: 'ORDER' },
            { orderId: { $ne: null } }
          ]
        }
      });
    } else if (filterType === 'INQUIRY') {
      pipeline.push({
        $match: {
          $and: [
            { messageType: { $ne: 'ORDER' } },
            { orderId: null }
          ]
        }
      });
    }

    // 5.3 FILTER BY MARKETPLACE (NEW)
    if (filterMarketplace && filterMarketplace !== '') {
      // If filtering by specific marketplace
      pipeline.push({
        $match: { computedMarketplaceId: filterMarketplace }
      });
    }

    // 5.4 FILTER BY UNREAD STATUS (NEW)
    if (showUnreadOnly === 'true') {
      pipeline.push({
        $match: { unreadCount: { $gt: 0 } }
      });
    }

    // 5.5 FILTER OUT RESOLVED CONVERSATIONS (Lookup ConversationMeta)
    pipeline.push({
      $lookup: {
        from: 'conversationmetas',
        let: {
          orderId: '$orderId',
          buyerUsername: '$buyerUsername',
          itemId: '$itemId',
          sellerId: '$sellerId'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$seller', '$$sellerId'] },
                  {
                    $or: [
                      // Order conversation: matched by orderId
                      {
                        $and: [
                          { $ne: ['$$orderId', null] },
                          { $eq: ['$orderId', '$$orderId'] }
                        ]
                      },
                      // Inquiry: matched by buyerUsername + itemId + orderId is null
                      {
                        $and: [
                          { $eq: ['$$orderId', null] },
                          { $eq: ['$orderId', null] },
                          { $eq: ['$buyerUsername', '$$buyerUsername'] },
                          { $eq: ['$itemId', '$$itemId'] }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          }
        ],
        as: 'conversationMeta'
      }
    });

    // Exclude threads where ConversationMeta exists and status is 'Resolved'
    pipeline.push({
      $match: {
        $or: [
          { 'conversationMeta': { $size: 0 } },          // No meta record → not resolved
          { 'conversationMeta.0.status': { $ne: 'Resolved' } } // Meta exists but not resolved
        ]
      }
    });

    // 6. SEARCH FILTER (Applied AFTER grouping so we search distinct threads)
    if (search && search.trim() !== '') {
      const regex = new RegExp(search.trim(), 'i'); // Case-insensitive
      pipeline.push({
        $match: {
          $or: [
            { orderId: regex },
            { buyerUsername: regex },
            { buyerName: regex },
            { itemId: regex }
          ]
        }
      });
    }

    // 7. FINAL SORT & PAGINATION
    pipeline.push({ $sort: { lastDate: -1 } });

    // Get Total Count (for frontend to know when to stop loading)
    // We use $facet to get both data and count in one query
    const facetedPipeline = [
      ...pipeline,
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limitNum }]
        }
      }
    ];

    const result = await Message.aggregate(facetedPipeline).allowDiskUse(true);

    let threads = result[0].data;
    let total = result[0].metadata[0] ? result[0].metadata[0].total : 0;

    // --- ORDER FALLBACK SEARCH ---
    // If a search term is provided, also look up matching Orders directly.
    // This handles the case where an order exists but has never had a message synced.
    if (search && search.trim() !== '') {
      const searchTrim = search.trim();
      const regex = new RegExp(searchTrim, 'i');

      // Build order query
      const orderQuery = {
        $or: [
          { orderId: regex },
          { legacyOrderId: regex },
          { 'buyer.username': regex },
          { 'buyer.buyerRegistrationAddress.fullName': regex }
        ]
      };
      if (sellerId) {
        orderQuery.seller = new mongoose.Types.ObjectId(sellerId);
      }

      const matchingOrders = await Order.find(orderQuery).limit(20).lean();

      // Get the set of orderIds already in message threads
      const existingOrderIds = new Set(threads.map(t => t.orderId).filter(Boolean));

      // For each matching order not already in threads, create a synthetic thread
      for (const order of matchingOrders) {
        if (!existingOrderIds.has(order.orderId)) {
          const itemId = order.lineItems?.[0]?.legacyItemId || null;

          // Look up product image for this item (try listing first, then order lineItem)
          let productImageUrl = null;
          if (itemId) {
            const listing = await Listing.findOne({ itemId }).select('mainImageUrl').lean();
            productImageUrl = listing?.mainImageUrl || null;

            // Fallback: Check if order lineItem has imageUrl
            if (!productImageUrl && order.lineItems?.[0]?.imageUrl) {
              productImageUrl = order.lineItems[0].imageUrl;
            }
          }

          threads.push({
            orderId: order.orderId,
            buyerUsername: order.buyer?.username || '',
            buyerName: order.buyer?.buyerRegistrationAddress?.fullName || '',
            itemId: itemId,
            itemTitle: order.lineItems?.[0]?.title || order.productName || '',
            lastMessage: '(No messages yet)',
            lastDate: order.lastModifiedDate || order.creationDate,
            sender: null,
            unreadCount: 0,
            sellerId: order.seller,
            orderMarketplaceId: order.purchaseMarketplaceId,
            computedMarketplaceId: order.purchaseMarketplaceId || 'Unknown',
            productImageUrl: productImageUrl, // Add product image
            actualMessageType: 'ORDER', // Synthetic threads are always orders
            _isSyntheticOrder: true
          });
          total += 1;
        }
      }
    }


    // --- NEW: MARKETPLACE RESOLUTION LOGIC ---
    // Process threads to add 'marketplaceId'
    // 1. Order -> purchaseMarketplaceId
    // 2. Listing currency -> Inferred Marketplace
    // 3. API -> GetItem -> Site -> Marketplace

    // Currency Map
    const currencyToMarketplace = {
      'USD': 'EBAY_US',
      'CAD': 'EBAY_CA',
      'AUD': 'EBAY_AU',
      'GBP': 'EBAY_GB',
      'EUR': 'EBAY_DE' // Defaulting EUR to DE as it's most common, but could be others. 
      // Ideally we want specific site ID from API if inconsistent.
    };

    // Helper to get Site ID from API
    async function fetchItemSiteFromApi(itemId, sellerId) {
      try {
        const seller = await Seller.findById(sellerId);
        if (!seller) return null;

        const token = await ensureValidToken(seller);

        const xmlRequest = `
          <?xml version="1.0" encoding="utf-8"?>
          <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
            <ErrorLanguage>en_US</ErrorLanguage>
            <WarningLevel>High</WarningLevel>
            <ItemID>${itemId}</ItemID>
            <DetailLevel>ItemReturnDescription</DetailLevel>
            <IncludeItemSpecifics>false</IncludeItemSpecifics>
          </GetItemRequest>
        `;

        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
          headers: {
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
            'X-EBAY-API-CALL-NAME': 'GetItem',
            'Content-Type': 'text/xml'
          }
        });

        const result = await parseStringPromise(response.data);
        if (result.GetItemResponse.Ack[0] === 'Failure') return null;

        const item = result.GetItemResponse.Item[0];
        const site = item.Site[0]; // e.g. "US", "Canada", "Australia"
        const currency = item.Currency[0]; // e.g., "USD"

        // Map Site to ID
        const siteMap = {
          'US': 'EBAY_US',
          'Canada': 'EBAY_CA',
          'Australia': 'EBAY_AU',
          'UK': 'EBAY_GB',
          'Germany': 'EBAY_DE',
          'France': 'EBAY_FR',
          'Italy': 'EBAY_IT',
          'Spain': 'EBAY_ES'
        };

        return {
          marketplaceId: siteMap[site] || 'EBAY_US', // Default to US if unknown
          currency: currency
        };

      } catch (err) {
        console.error(`[Fetch Item Site] Failed for ${itemId}:`, err.message);
        return null;
      }
    }

    // Process in parallel
    await Promise.all(threads.map(async (thread) => {
      // Use computed value from aggregation if available and valid
      if (thread.computedMarketplaceId && thread.computedMarketplaceId !== 'Unknown') {
        thread.marketplaceId = thread.computedMarketplaceId;
        return;
      }

      // Fallback: Check if we have valid IDs to check API (Only if computed was Unknown)
      if (thread.itemId && thread.itemId !== 'DIRECT_MESSAGE') {
        const apiResult = await fetchItemSiteFromApi(thread.itemId, thread.sellerId);
        if (apiResult) {
          thread.marketplaceId = apiResult.marketplaceId;

          // Save to Listing DB so next time it's fast
          try {
            await Listing.findOneAndUpdate(
              { itemId: thread.itemId },
              {
                seller: thread.sellerId,
                itemId: thread.itemId,
                currency: apiResult.currency,
              },
              { upsert: true, setDefaultsOnInsert: true }
            );
          } catch (e) {
            console.error('Failed to cache listing marketplace', e);
          }
        } else {
          thread.marketplaceId = 'Unknown';
        }
      } else {
        thread.marketplaceId = 'System'; // Direct messages
      }
    }));

    res.json({ threads, total, page: pageNum, pages: Math.ceil(total / limitNum) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});




// 5. GET MESSAGES (Chat Window)
router.get('/chat/messages', requireAuth, async (req, res) => {
  const { orderId, buyerUsername, itemId } = req.query;

  try {
    let query = {};
    if (orderId) {
      query.orderId = orderId;
    } else if (buyerUsername && itemId) {
      query.buyerUsername = buyerUsername;
      query.itemId = itemId;
    } else {
      return res.status(400).json({ error: 'Invalid query params' });
    }

    const messages = await Message.find(query).sort({ messageDate: 1 });

    // Mark as read
    await Message.updateMany(
      { ...query, sender: 'BUYER', read: false },
      { read: true }
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. SEARCH ORDER FOR NEW CHAT

router.get('/chat/search-order', requireAuth, async (req, res) => {
  const { orderId } = req.query;
  try {
    const order = await Order.findOne({ orderId }).populate('seller');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Get Full Name
    const fullName = order.shippingFullName || order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username;

    const threadData = {
      orderId: order.orderId,
      buyerUsername: order.buyer.username,
      buyerName: fullName,
      itemId: order.lineItems?.[0]?.legacyItemId,
      itemTitle: order.productName,
      sellerId: order.seller._id,
      lastMessage: 'Start a new conversation...',
      lastDate: new Date(),
      sender: 'SYSTEM',
      unreadCount: 0,
      messageType: 'ORDER',
      isNew: true
    };

    res.json(threadData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. MARK CONVERSATION AS UNREAD
router.post('/chat/mark-unread', requireAuth, async (req, res) => {
  const { orderId, buyerUsername, itemId } = req.body;

  try {
    let query = {};
    if (orderId) {
      query.orderId = orderId;
    } else if (buyerUsername && itemId) {
      query.buyerUsername = buyerUsername;
      query.itemId = itemId;
    } else {
      return res.status(400).json({ error: 'Invalid query params' });
    }

    // Mark buyer messages as unread
    const result = await Message.updateMany(
      { ...query, sender: 'BUYER' },
      { read: false }
    );

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BUYER MESSAGES ENDPOINTS =====

// Fetch buyer messages/inquiries from eBay Post-Order API and store in DB
// Fetch buyer messages/inquiries from eBay Post-Order API and store in DB
router.post('/fetch-messages', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const sellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } })
      .populate('user', 'username');

    if (sellers.length === 0) {
      return res.json({ message: 'No sellers with eBay tokens found', totalMessages: 0 });
    }

    let totalNewMessages = 0;
    let totalUpdatedMessages = 0;
    const errors = [];

    console.log(`[Fetch Messages] Starting for ${sellers.length} sellers`);

    const results = await Promise.allSettled(
      sellers.map(async (seller) => {
        const sellerName = seller.user?.username || 'Unknown Seller';

        try {
          // Token refresh logic
          const nowUTC = Date.now();
          const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
          const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
          let accessToken = seller.ebayTokens.access_token;

          if (fetchedAt && (nowUTC - fetchedAt > expiresInMs - 2 * 60 * 1000)) {
            console.log(`[Fetch Messages] Refreshing token for seller ${sellerName}`);
            const refreshRes = await axios.post(
              'https://api.ebay.com/identity/v1/oauth2/token',
              qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: seller.ebayTokens.refresh_token,
                scope: EBAY_OAUTH_SCOPES // Using centralized scopes constant
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
                },
              }
            );
            accessToken = refreshRes.data.access_token;
            seller.ebayTokens.access_token = accessToken;
            seller.ebayTokens.expires_in = refreshRes.data.expires_in;
            seller.ebayTokens.fetchedAt = new Date(nowUTC);
            await seller.save();
          }

          // Fetch inquiries
          const inquiryUrl = 'https://api.ebay.com/post-order/v2/inquiry/search';
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

          const inquiryRes = await axios.get(inquiryUrl, {
            headers: {
              'Authorization': `IAF ${accessToken}`,
              'Content-Type': 'application/json',
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            },
            params: {
              'creation_date_range_from': ninetyDaysAgo,
              'limit': 200
            }
          });

          const inquiries = inquiryRes.data.members || [];
          console.log(`[Fetch Messages] Seller ${sellerName}: Found ${inquiries.length} inquiries`);

          let newMessages = 0;
          let updatedMessages = 0;

          for (const inquiry of inquiries) {
            // FIX: Access nested .value for dates and use correct field names
            const messageData = {
              seller: seller._id,
              messageId: inquiry.inquiryId,
              orderId: inquiry.orderId || inquiry.orderNumber,
              legacyOrderId: inquiry.legacyOrderId,
              buyerUsername: inquiry.buyerLoginName, // Fixed field name
              subject: inquiry.inquirySubject,
              messageText: inquiry.initialInquiryText || inquiry.message, // Check both
              messageType: 'INQUIRY',
              inquiryStatus: inquiry.state || inquiry.status, // API uses 'state' usually
              itemId: inquiry.itemId,
              itemTitle: inquiry.itemTitle,
              isResolved: ['CLOSED', 'SELLER_CLOSED'].includes(inquiry.state),
              // FIX: Dates are objects { value: "..." }
              creationDate: inquiry.creationDate?.value ? new Date(inquiry.creationDate.value) : null,
              responseDate: inquiry.sellerResponseDue?.respondByDate?.value ? new Date(inquiry.sellerResponseDue.respondByDate.value) : null,
              lastMessageDate: inquiry.lastMessageDate?.value ? new Date(inquiry.lastMessageDate.value) : null,
              rawData: inquiry
            };

            const existing = await Message.findOne({ messageId: inquiry.inquiryId });
            if (existing) {
              Object.assign(existing, messageData);
              await existing.save();
              updatedMessages++;
            } else {
              await Message.create(messageData);
              newMessages++;
            }
          }

          return {
            sellerName: sellerName,
            newMessages,
            updatedMessages,
            totalMessages: inquiries.length
          };

        } catch (err) {
          console.error(`[Fetch Messages] Error for seller ${sellerName}:`, err.message);
          throw new Error(`${sellerName}: ${err.message}`);
        }
      })
    );

    const successResults = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successResults.push(result.value);
        totalNewMessages += result.value.newMessages;
        totalUpdatedMessages += result.value.updatedMessages;
      } else {
        errors.push(result.reason.message);
      }
    });

    res.json({
      message: `Fetched messages for ${successResults.length} sellers`,
      totalNewMessages,
      totalUpdatedMessages,
      results: successResults,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('[Fetch Messages] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get stored messages from database
router.get('/stored-messages', async (req, res) => {
  const { sellerId, isResolved, limit = 100 } = req.query;

  try {
    let query = {};
    if (sellerId) {
      query.seller = sellerId;
    }
    if (isResolved !== undefined && isResolved !== '') {
      query.isResolved = isResolved === 'true';
    }

    const messages = await Message.find(query)
      .populate('seller', 'username ebayUserId')
      .sort({ creationDate: -1 })
      .limit(parseInt(limit));

    res.json({
      messages,
      totalMessages: messages.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Mark message as resolved
router.patch('/messages/:messageId/resolve', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  const { messageId } = req.params;
  const { isResolved } = req.body;

  if (isResolved === undefined || isResolved === null) {
    return res.status(400).json({ error: 'isResolved field is required' });
  }

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.isResolved = isResolved;
    if (isResolved) {
      message.resolvedAt = new Date();
      message.resolvedBy = req.user?.username || 'admin';
    } else {
      message.resolvedAt = null;
      message.resolvedBy = null;
    }

    await message.save();

    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- HELPER: Robust Description Extractor ---
function extractCleanDescription(fullHtml) {
  if (!fullHtml || typeof fullHtml !== 'string') return '';

  // 1. Perfect Match (Title H3 + Description Div)
  const perfectMatch = fullHtml.match(/(<h3[^>]*>[\s\S]*?<\/h3>[\s\S]*?<div class="product-description">[\s\S]*?<\/div>)/i);
  if (perfectMatch && perfectMatch[0]) return perfectMatch[0];

  // 2. Just the Description Div
  const divMatch = fullHtml.match(/(<div class="product-description">[\s\S]*?<\/div>)/i);
  if (divMatch && divMatch[0]) return divMatch[0];

  // 3. Fallback: Return Full HTML (This ensures you see SOMETHING)
  return fullHtml;
}

// 1. POLL ACTIVE LISTINGS (With Pagination Loop)
router.post('/sync-listings', requireAuth, async (req, res) => {
  const { sellerId } = req.body;

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: "Seller not found" });

    const token = await ensureValidToken(seller);

    // --- DATE LOGIC ---
    const listingCount = await Listing.countDocuments({ seller: sellerId, listingStatus: 'Active' });
    const orderCount = await Order.countDocuments({ seller: sellerId });
    const defaultStartDate = getEffectiveInitialSyncDate(seller.initialSyncDate);
    const startTimeTo = new Date();

    let startTimeFrom;

    if (listingCount === 0 && orderCount === 0) {
      console.log(`[Sync Listings] New seller detected (0 listings, 0 orders). Starting sync from ${defaultStartDate.toISOString()}.`);
      startTimeFrom = defaultStartDate;
    } else {
      startTimeFrom = seller.lastListingPolledAt || defaultStartDate;
    }
    startTimeFrom = getClampedSellerListStart(startTimeFrom, startTimeTo);
    let page = 1;
    let totalPages = 1;
    let processedCount = 0;
    let skippedCount = 0;

    const VALID_MOTORS_CATEGORIES = ["eBay Motors", "Parts & Accessories", "Automotive Tools", "Tools & Supplies"];

    do {
      console.log(`Fetching Page ${page} (Filter: Motors Only)...`);

      const xmlRequest = `
          <?xml version="1.0" encoding="utf-8"?>
          <GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
            <ErrorLanguage>en_US</ErrorLanguage>
            <WarningLevel>High</WarningLevel>
            <DetailLevel>ItemReturnDescription</DetailLevel> 
            <StartTimeFrom>${new Date(startTimeFrom).toISOString()}</StartTimeFrom>
            <StartTimeTo>${startTimeTo.toISOString()}</StartTimeTo>
            <IncludeWatchCount>true</IncludeWatchCount>
            <Pagination>
              <EntriesPerPage>100</EntriesPerPage>
              <PageNumber>${page}</PageNumber>
            </Pagination>
            <OutputSelector>ItemArray.Item.ItemID</OutputSelector>
            <OutputSelector>ItemArray.Item.Title</OutputSelector>
            <OutputSelector>ItemArray.Item.SKU</OutputSelector>
            <OutputSelector>ItemArray.Item.SellingStatus</OutputSelector>
            <OutputSelector>ItemArray.Item.ListingStatus</OutputSelector>
            <OutputSelector>ItemArray.Item.Description</OutputSelector>
            <OutputSelector>ItemArray.Item.PictureDetails</OutputSelector>
            <OutputSelector>ItemArray.Item.ItemCompatibilityList</OutputSelector>
            <OutputSelector>ItemArray.Item.PrimaryCategory</OutputSelector> 
            <OutputSelector>ItemArray.Item.ListingDetails</OutputSelector>
            <OutputSelector>PaginationResult</OutputSelector>
          </GetSellerListRequest>
        `;

      const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
        headers: {
          'X-EBAY-API-SITEID': '100',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
          'X-EBAY-API-CALL-NAME': 'GetSellerList',
          'Content-Type': 'text/xml'
        }
      });

      const result = await parseStringPromise(response.data);
      if (result.GetSellerListResponse.Ack[0] === 'Failure') {
        throw new Error(result.GetSellerListResponse.Errors[0].LongMessage[0]);
      }

      const pagination = result.GetSellerListResponse.PaginationResult[0];
      totalPages = parseInt(pagination.TotalNumberOfPages[0]);
      const items = result.GetSellerListResponse.ItemArray?.[0]?.Item || [];

      for (const item of items) {
        const status = item.SellingStatus?.[0]?.ListingStatus?.[0];
        if (status !== 'Active') continue;

        // Filter by Category
        const categoryName = item.PrimaryCategory?.[0]?.CategoryName?.[0] || '';
        const isMotorsItem = VALID_MOTORS_CATEGORIES.some(keyword => categoryName.includes(keyword));
        if (!isMotorsItem) {
          skippedCount++;
          continue;
        }

        const rawHtml = item.Description ? item.Description[0] : '';
        const cleanHtml = extractCleanDescription(rawHtml);

        // Extract EXISTING Compatibility from eBay
        let parsedCompatibility = [];
        if (item.ItemCompatibilityList && item.ItemCompatibilityList[0].Compatibility) {
          parsedCompatibility = item.ItemCompatibilityList[0].Compatibility.map(comp => ({
            notes: comp.CompatibilityNotes ? comp.CompatibilityNotes[0] : '',
            nameValueList: comp.NameValueList.map(nv => ({
              name: nv.Name[0],
              value: nv.Value[0]
            }))
          }));
        }

        // Upsert to DB (Updates existing if found, Creates new if not)
        await Listing.findOneAndUpdate(
          { itemId: item.ItemID[0] },
          {
            seller: seller._id,
            title: item.Title[0],
            sku: item.SKU ? item.SKU[0] : '',
            currentPrice: parseFloat(item.SellingStatus[0].CurrentPrice[0]._),
            currency: item.SellingStatus[0].CurrentPrice[0].$.currencyID,
            listingStatus: status,
            mainImageUrl: item.PictureDetails?.[0]?.PictureURL?.[0] || '',
            categoryName: categoryName, // Store category for filtering
            descriptionPreview: cleanHtml,
            compatibility: parsedCompatibility,
            // Save the START TIME for sorting
            startTime: item.ListingDetails?.[0]?.StartTime?.[0]
          },
          { upsert: true }
        );
        processedCount++;
      }
      page++;
    } while (page <= totalPages);

    seller.lastListingPolledAt = startTimeTo;
    await seller.save();

    res.json({
      success: true,
      message: `Synced ${processedCount} Motors listings. (Skipped ${skippedCount} others).`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1B. POLL ALL SELLERS — Background sync with status tracking
// In-memory status object (resets on server restart, which is fine for this use case)
let syncAllStatus = {
  running: false,
  sellersTotal: 0,
  sellersComplete: 0,
  currentSeller: '',
  currentPage: 0,
  currentTotalPages: 0,
  results: [],
  errors: [],
  totalProcessed: 0,
  totalSkipped: 0,
  startedAt: null,
  completedAt: null
};

router.post('/sync-all-sellers-listings', requireAuth, async (req, res) => {
  if (syncAllStatus.running) {
    return res.status(409).json({
      success: false,
      message: `Sync already in progress — currently on seller "${syncAllStatus.currentSeller}" (${syncAllStatus.sellersComplete}/${syncAllStatus.sellersTotal})`,
    });
  }
  try {
    // Peek at seller count so we can include it in the immediate response,
    // then hand off all real work to the shared cron function.
    const sellersTotal = await Seller.countDocuments({ 'ebayTokens.access_token': { $exists: true } });
    if (sellersTotal === 0) {
      return res.json({ success: true, message: 'No sellers with eBay tokens found', results: [] });
    }
    res.json({
      success: true,
      message: `Sync started for ${sellersTotal} seller(s). Poll GET /ebay/sync-all-sellers-status for progress.`,
      sellersTotal,
    });
    // Fire-and-forget — all logic lives in the shared function
    scheduledSyncAllSellers();
  } catch (err) {
    console.error('[Sync All] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 1C. STATUS ENDPOINT for Poll All Sellers
router.get('/sync-all-sellers-status', requireAuth, async (req, res) => {
  res.json(syncAllStatus);
});

// 2. GET LISTINGS (With Search & Sort) - For Compatibility Dashboard (Uses Listing collection)
router.get('/listings', requireAuth, async (req, res) => {
  const { sellerId, page = 1, limit = 50, search, listedFrom, listedTo } = req.query;
  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Base Query
    let query = { seller: sellerId, listingStatus: 'Active' };

    // --- DATE FILTER (IST-aware) ---
    if (listedFrom || listedTo) {
      query.startTime = {};
      if (listedFrom) query.startTime.$gte = new Date(listedFrom + 'T00:00:00+05:30');
      if (listedTo)   query.startTime.$lte = new Date(listedTo   + 'T23:59:59.999+05:30');
    }

    // --- SEARCH LOGIC ---
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      query.$or = [
        { title: searchRegex },
        { sku: searchRegex },
        { itemId: searchRegex }
      ];
    }

    const totalDocs = await Listing.countDocuments(query);

    const listings = await Listing.find(query)
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      listings,
      pagination: {
        total: totalDocs,
        page: pageNum,
        pages: Math.ceil(totalDocs / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. REFRESH SINGLE ITEM (GetItem)
router.post('/refresh-item', requireAuth, async (req, res) => {
  const { sellerId, itemId } = req.body;

  try {
    const seller = await Seller.findById(sellerId);
    const token = await ensureValidToken(seller);

    const xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
          <ErrorLanguage>en_US</ErrorLanguage>
          <WarningLevel>High</WarningLevel>
          <ItemID>${itemId}</ItemID>
          <DetailLevel>ItemReturnDescription</DetailLevel>
          <IncludeItemSpecifics>true</IncludeItemSpecifics>
        </GetItemRequest>
      `;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '100',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'Content-Type': 'text/xml'
      }
    });

    const result = await parseStringPromise(response.data);
    const item = result.GetItemResponse.Item[0];

    const rawHtml = item.Description ? item.Description[0] : '';
    const cleanHtml = extractCleanDescription(rawHtml);

    let parsedCompatibility = [];
    if (item.ItemCompatibilityList && item.ItemCompatibilityList[0].Compatibility) {
      parsedCompatibility = item.ItemCompatibilityList[0].Compatibility.map(comp => ({
        notes: comp.CompatibilityNotes ? comp.CompatibilityNotes[0] : '',
        nameValueList: comp.NameValueList.map(nv => ({
          name: nv.Name[0],
          value: nv.Value[0]
        }))
      }));
    }

    const updatedListing = await Listing.findOneAndUpdate(
      { itemId: itemId },
      {
        seller: seller._id,
        title: item.Title[0],
        sku: item.SKU ? item.SKU[0] : '',
        descriptionPreview: cleanHtml,
        compatibility: parsedCompatibility,
        mainImageUrl: item.PictureDetails?.[0]?.PictureURL?.[0] || '',
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, listing: updatedListing });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to clean text for XML (turns "&" into "&amp;")
const escapeXml = (unsafe) => {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
};

// Helper: Create price change log entry
async function createPriceChangeLog({ userId, sellerId, orderObjectId, itemId, orderId, productTitle, originalPrice, newPrice, success, errorMessage, ip, userAgent }) {
  await PriceChangeLog.create({
    user: userId,
    seller: sellerId,
    order: orderObjectId,
    legacyItemId: itemId,
    orderId: orderId || null,
    productTitle: productTitle || null,
    originalPrice,
    newPrice,
    priceDifference: newPrice - originalPrice,
    changeSource: 'all_orders_sheet',
    success,
    errorMessage: errorMessage || undefined,
    ipAddress: ip,
    userAgent
  });
}

// ============================================
// API USAGE STATS CACHE (5-minute TTL)
// ============================================
const apiUsageCache = new Map();

// Helper: Fetch eBay API usage stats using modern Analytics API (REST/JSON)
async function fetchApiUsageStats(token) {
  try {
    // Use the modern Analytics API (REST-based, JSON response)
    const response = await axios.get(
      'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          api_name: 'TradingAPI',
          api_context: 'TradingAPI'
        }
      }
    );

    const rateLimits = response.data?.rateLimits || [];

    // Find the TradingAPI context
    const tradingAPI = rateLimits.find(
      api => api.apiContext === 'TradingAPI' || api.apiName === 'TradingAPI'
    );

    if (!tradingAPI || !tradingAPI.resources) {
      // Return default if no data found
      return {
        success: true,
        used: 0,
        limit: 5000,
        remaining: 5000,
        resetTime: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
        hoursUntilReset: 24
      };
    }

    // Find ReviseFixedPriceItem resource
    const reviseResource = tradingAPI.resources.find(
      r => r.name === 'ReviseFixedPriceItem'
    );

    if (!reviseResource || !reviseResource.rates || reviseResource.rates.length === 0) {
      // Return default if specific resource not found
      return {
        success: true,
        used: 0,
        limit: 5000,
        remaining: 5000,
        resetTime: new Date(Date.now() + 86400000).toISOString(),
        hoursUntilReset: 24
      };
    }

    // Get the daily rate limit (timeWindow = 86400 seconds = 1 day)
    const dailyRate = reviseResource.rates.find(r => r.timeWindow === 86400) || reviseResource.rates[0];

    const used = dailyRate.count || 0;
    const limit = dailyRate.limit || 5000;
    const remaining = dailyRate.remaining || (limit - used);
    const resetTime = dailyRate.reset || new Date(Date.now() + 86400000).toISOString();

    // Calculate hours until reset
    const resetDate = new Date(resetTime);
    const now = new Date();
    const diffMs = resetDate - now;
    const hoursUntilReset = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

    return {
      success: true,
      used: used,
      limit: limit,
      remaining: remaining,
      resetTime: resetTime,
      hoursUntilReset: hoursUntilReset
    };
  } catch (err) {
    console.error('Error fetching API usage stats:', err.message);

    // If error response contains rate limit data, try to parse it
    if (err.response?.data) {
      console.error('API Response:', JSON.stringify(err.response.data, null, 2));
    }

    throw err;
  }
}

// Helper: Get cached or fresh usage stats
async function getCachedUsageStats(sellerId, token) {
  const cacheKey = `usage_${sellerId}`;
  const cached = apiUsageCache.get(cacheKey);

  // Return cached if less than 5 minutes old
  if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
    return cached.data;
  }

  // Fetch fresh data
  const freshData = await fetchApiUsageStats(token);
  apiUsageCache.set(cacheKey, {
    data: freshData,
    timestamp: Date.now()
  });

  return freshData;
}

// 4. UPDATE COMPATIBILITY (Using ReplaceAll Strategy)
// Helper: sanitize compatibility entries before sending to eBay
// - Removes entries with '--' as engine value
// - Strips empty engine NameValueList entries
const sanitizeCompatibilityList = (list) => {
  if (!list || list.length === 0) return list;
  return list.map(c => ({
    ...c,
    nameValueList: c.nameValueList.filter(nv => {
      // Remove Engine entries with '--' or empty/whitespace-only values
      if (nv.name === 'Engine' && (!nv.value || nv.value.trim() === '' || nv.value.trim() === '--')) {
        return false;
      }
      return true;
    })
  }));
};

// Helper: parse eBay's <Invalid> tags into human-readable messages
// Supports both 4-element [Year][Make][Model][Trim] and 5-element [Year][Make][Model][Trim][Engine]
const parseInvalidCombos = (errorMessage) => {
  const invalidMatches = errorMessage.match(/<Invalid>\[[^\]]*\](\[[^\]]*\]){2,4}<\/Invalid>/g);
  if (!invalidMatches || invalidMatches.length === 0) return errorMessage;
  const parsed = invalidMatches.map(m => {
    const parts = m.match(/\[([^\]]*)\]/g)?.map(p => p.slice(1, -1)) || [];
    if (parts.length >= 5) {
      return `${parts[0]} ${parts[1]} ${parts[2]} — Trim: "${parts[3]}" Engine: "${parts[4]}"`;
    }
    return `${parts[0]} ${parts[1]} ${parts[2]} — Trim: "${parts[3] || ''}"`;
  });
  return `${parsed.length} invalid combo(s) rejected by eBay:\n${parsed.join('\n')}`;
};

// Helper: extract structured invalid combo data from eBay error message
// Returns array of { year, make, model, trim, engine? }
const extractInvalidCombos = (errorMessage) => {
  const invalidMatches = errorMessage.match(/<Invalid>\[[^\]]*\](\[[^\]]*\]){2,4}<\/Invalid>/g);
  if (!invalidMatches || invalidMatches.length === 0) return [];
  return invalidMatches.map(m => {
    const parts = m.match(/\[([^\]]*)\]/g)?.map(p => p.slice(1, -1)) || [];
    return { year: parts[0], make: parts[1], model: parts[2], trim: parts[3] || null, engine: parts[4] || null };
  });
};

// Helper: remove entries that eBay flagged as invalid from a compatibility list
// This keeps the local DB in sync with what eBay actually accepted
const filterOutInvalidCombos = (compatibilityList, errorMessage) => {
  const invalids = extractInvalidCombos(errorMessage);
  if (invalids.length === 0) return compatibilityList;
  return compatibilityList.filter(c => {
    const nvMap = {};
    c.nameValueList.forEach(nv => { nvMap[nv.name] = nv.value; });
    return !invalids.some(inv =>
      inv.year === nvMap.Year && inv.make === nvMap.Make && inv.model === nvMap.Model &&
      (!inv.trim || inv.trim === nvMap.Trim) &&
      (!inv.engine || inv.engine === nvMap.Engine)
    );
  });
};

// Helper: purge rejected trim/engine values from FitmentCache
// so they no longer appear in the frontend dropdowns
const purgeInvalidFromCache = async (errorMessage) => {
  const invalids = extractInvalidCombos(errorMessage);
  if (invalids.length === 0) return;

  // Group by (make, model, year) → set of rejected trims
  // Group by (make, model, trim, year) → set of rejected engines
  const trimRejections = {};  // cacheKey → Set of trim values
  const engineRejections = {}; // cacheKey → Set of engine values

  for (const inv of invalids) {
    if (inv.trim) {
      const trimKey = `Trim_Make_${inv.make}_Model_${inv.model}_Year_${inv.year}`;
      if (!trimRejections[trimKey]) trimRejections[trimKey] = new Set();
      trimRejections[trimKey].add(inv.trim);
    }
    if (inv.engine) {
      const engineKey = `Engine_Make_${inv.make}_Model_${inv.model}_Trim_${inv.trim}_Year_${inv.year}`;
      if (!engineRejections[engineKey]) engineRejections[engineKey] = new Set();
      engineRejections[engineKey].add(inv.engine);
    }
  }

  // Pull rejected values from cached arrays
  const ops = [];
  for (const [cacheKey, rejectedSet] of Object.entries(trimRejections)) {
    ops.push(FitmentCache.updateOne(
      { cacheKey },
      { $pull: { values: { $in: [...rejectedSet] } } }
    ));
  }
  for (const [cacheKey, rejectedSet] of Object.entries(engineRejections)) {
    ops.push(FitmentCache.updateOne(
      { cacheKey },
      { $pull: { values: { $in: [...rejectedSet] } } }
    ));
  }

  if (ops.length > 0) {
    await Promise.all(ops);
    console.log(`[FitmentCache] Purged rejected values from ${ops.length} cache entries`);
  }
};

// Helper: detect eBay's duplicate-listing error
const isDuplicateListingError = (msg) =>
  msg.includes('already have on eBay') ||
  msg.includes('identical items') ||
  msg.includes('duplicate listing') ||
  msg.includes('DuplicateItem');

// Helper: build the ItemCompatibilityList XML block (reused across retry calls)
const buildCompatXml = (compatibilityList) => {
  if (!compatibilityList || compatibilityList.length === 0) {
    return '<ItemCompatibilityList><ReplaceAll>true</ReplaceAll></ItemCompatibilityList>';
  }
  let xml = '<ItemCompatibilityList><ReplaceAll>true</ReplaceAll>';
  compatibilityList.forEach(c => {
    xml += '<Compatibility>';
    if (c.notes) xml += `<CompatibilityNotes>${escapeXml(c.notes)}</CompatibilityNotes>`;
    c.nameValueList.forEach(nv => {
      xml += `<NameValueList><Name>${escapeXml(nv.name)}</Name><Value>${escapeXml(nv.value)}</Value></NameValueList>`;
    });
    xml += '</Compatibility>';
  });
  xml += '</ItemCompatibilityList>';
  return xml;
};

// Helper: retry by differentiating the title with a period suffix + minor price bump.
// Each attempt adds one more period to the title and $0.01 to the price.
// Up to 5 attempts — if eBay keeps rejecting as duplicate on each attempt, we keep retrying.
const retryCompatWithTitleDiff = async (token, itemId, compatibilityList) => {
  const listing = await Listing.findOne({ itemId }).select('title currentPrice').lean();
  if (!listing) throw new Error('Listing not found in DB for title-diff retry');

  const dbPrice = parseFloat(listing.currentPrice);
  if (!listing.currentPrice || isNaN(dbPrice)) {
    throw new Error('Could not read current price from DB for title-diff retry');
  }

  const originalTitle = (listing.title || '').trim();
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const newPrice = (dbPrice + attempt * 0.01).toFixed(2);
    // Each attempt appends one more period — ensuring every attempt produces a unique title
    const suffix = '.'.repeat(attempt);
    const newTitle = originalTitle.slice(0, 80 - suffix.length) + suffix;

    const itemInnerContent = `<ItemID>${itemId}</ItemID><StartPrice>${newPrice}</StartPrice><Title>${escapeXml(newTitle)}</Title>${buildCompatXml(compatibilityList)}`;
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
      <ErrorLanguage>en_US</ErrorLanguage>
      <WarningLevel>High</WarningLevel>
      <Item>${itemInnerContent}</Item>
    </ReviseFixedPriceItemRequest>`;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-SITEID': '100', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'Content-Type': 'text/xml' }
    });
    const result = await parseStringPromise(response.data);
    const ack = result.ReviseFixedPriceItemResponse.Ack[0];

    if (ack === 'Failure') {
      const errors = result.ReviseFixedPriceItemResponse.Errors || [];
      const errMsg = errors.map(e => e.LongMessage[0]).join('; ');
      if (isDuplicateListingError(errMsg) && attempt < maxRetries) {
        console.log(`[Compat] Duplicate still detected on attempt ${attempt} for item ${itemId}. Retrying with ${attempt + 1} period(s) and +$${(attempt + 1) * 0.01} price...`);
        lastError = new Error(errMsg);
        continue;
      }
      throw new Error(errMsg);
    }

    const warnings = (result.ReviseFixedPriceItemResponse.Errors || [])
      .filter(e => !e.LongMessage[0].includes('Best Offer') && !e.LongMessage[0].includes('Funds from your sales'))
      .map(e => e.LongMessage[0]).join('; ');
    return { newPrice: parseFloat(newPrice), newTitle, warning: warnings || null };
  }

  throw lastError || new Error('Max duplicate-listing retries exceeded');
};

router.post('/update-compatibility', requireAuth, async (req, res) => {
  const { sellerId, itemId, sku, compatibilityList: rawCompatibilityList, batchId } = req.body;
  try {
    const seller = await Seller.findById(sellerId);
    const token = await ensureValidToken(seller);
    const compatibilityList = sanitizeCompatibilityList(rawCompatibilityList);

    let itemInnerContent = `<ItemID>${itemId}</ItemID>`;

    // CASE 1: Clearing all vehicles (Send Empty List with ReplaceAll)
    if (!compatibilityList || compatibilityList.length === 0) {
      // This tells eBay: "Here is the list. It is empty. Replace everything with this empty list."
      itemInnerContent += `
                <ItemCompatibilityList>
                    <ReplaceAll>true</ReplaceAll>
                </ItemCompatibilityList>
            `;
    }
    // CASE 2: Sending a specific list (Overwrite old list)
    else {
      let compatXml = '<ItemCompatibilityList>';

      // --- THE FIX: This magic tag forces eBay to wipe old data first ---
      compatXml += '<ReplaceAll>true</ReplaceAll>';
      // -----------------------------------------------------------------

      compatibilityList.forEach(c => {
        compatXml += '<Compatibility>';
        // Escape Notes (Fixes "&" error)
        if (c.notes) compatXml += `<CompatibilityNotes>${escapeXml(c.notes)}</CompatibilityNotes>`;

        c.nameValueList.forEach(nv => {
          // Escape Name and Value (Fixes "Town & Country" error)
          compatXml += `<NameValueList><Name>${escapeXml(nv.name)}</Name><Value>${escapeXml(nv.value)}</Value></NameValueList>`;
        });
        compatXml += '</Compatibility>';
      });
      compatXml += '</ItemCompatibilityList>';

      itemInnerContent += compatXml;
    }

    const xmlRequest = `
            <?xml version="1.0" encoding="utf-8"?>
            <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
                <ErrorLanguage>en_US</ErrorLanguage>
                <WarningLevel>High</WarningLevel>
                
                <Item>
                    ${itemInnerContent}
                </Item>

            </ReviseFixedPriceItemRequest>
        `;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: { 'X-EBAY-API-SITEID': '100', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'Content-Type': 'text/xml' }
    });

    const result = await parseStringPromise(response.data);
    const ack = result.ReviseFixedPriceItemResponse.Ack[0];

    // 1. Handle Failures
    if (ack === 'Failure') {
      const errors = result.ReviseFixedPriceItemResponse.Errors || [];
      const errorMessage = errors.map(e => e.LongMessage[0]).join('; ');

      // Check if it's a rate limit error
      const isRateLimitError = errorMessage.includes('exceeded usage limit') ||
        errorMessage.includes('call limit') ||
        errorMessage.includes('Developer Analytics API');

      if (isRateLimitError) {
        try {
          // Fetch usage stats
          const usageStats = await getCachedUsageStats(sellerId, token);
          return res.status(429).json({
            error: errorMessage,
            rateLimitInfo: {
              used: usageStats.used,
              limit: usageStats.limit,
              remaining: usageStats.remaining,
              resetTime: usageStats.resetTime,
              hoursUntilReset: usageStats.hoursUntilReset
            }
          });
        } catch (statsError) {
          // If stats fetch fails, still return rate limit error
          console.error('Failed to fetch usage stats:', statsError.message);
          return res.status(429).json({ error: errorMessage });
        }
      }

      // --- Duplicate listing: differentiate title with fitment suffix + minor price bump, retry with compat ---
      if (isDuplicateListingError(errorMessage)) {
        try {
          console.log(`[Compat] Duplicate listing blocked item ${itemId}. Retrying with title+fitment differentiation...`);
          const { newPrice, newTitle, warning: retryWarning } = await retryCompatWithTitleDiff(token, itemId, compatibilityList);
          await Listing.findOneAndUpdate({ itemId }, { compatibility: compatibilityList, currentPrice: newPrice, title: newTitle });
          console.log(`[Compat] Title-diff retry succeeded for item ${itemId}. New title: "${newTitle}"`);
          return res.json({
            success: true,
            warning: retryWarning || `Title updated to "${newTitle}" and compatibility applied (duplicate listing resolved).`
          });
        } catch (retryErr) {
          console.error(`[Compat] Title-diff retry failed for item ${itemId}:`, retryErr.message);
          throw new Error(`eBay blocked as duplicate listing. Title-differentiation retry also failed: ${retryErr.message}`);
        }
      }
      // --- End duplicate listing fallback ---

      // Also purge rejected trims/engines from cache on full failure
      purgeInvalidFromCache(errorMessage).catch(e => console.error('[FitmentCache] Purge error:', e.message));
      throw new Error(parseInvalidCombos(errorMessage));
    }

    // 2. Handle Warnings
    let warningMessage = null;
    let filteredCompatibilityList = compatibilityList;
    if (ack === 'Warning') {
      const warnings = result.ReviseFixedPriceItemResponse.Errors || [];

      const meaningfulWarnings = warnings.filter(err => {
        const msg = err.LongMessage[0];
        if (msg.includes("If this item sells by a Best Offer")) return false;
        if (msg.includes("Funds from your sales may be unavailable")) return false;
        return true;
      });

      if (meaningfulWarnings.length > 0) {
        const rawWarning = meaningfulWarnings.map(e => e.LongMessage[0]).join('; ');
        warningMessage = meaningfulWarnings.map(e => parseInvalidCombos(e.LongMessage[0])).join('; ');
        console.warn(`eBay Update Warning: ${warningMessage}`);
        // Strip entries that eBay rejected so local DB matches what eBay actually accepted
        filteredCompatibilityList = filterOutInvalidCombos(compatibilityList, rawWarning);
        // Also remove rejected trims/engines from FitmentCache so they don't show in dropdowns
        purgeInvalidFromCache(rawWarning).catch(e => console.error('[FitmentCache] Purge error:', e.message));
      }
    }

    // 3. Update DB (only save entries eBay actually accepted)
    await Listing.findOneAndUpdate(
      { itemId: itemId },
      { compatibility: filteredCompatibilityList }
    );

    // 4. Also sync the batch item so re-opening the review modal shows fresh data
    if (batchId) {
      await AutoCompatibilityBatchItem.findOneAndUpdate(
        { batchId, itemId },
        { $set: { compatibilityList: filteredCompatibilityList } }
      );
    }

    const strippedCount = (compatibilityList?.length || 0) - (filteredCompatibilityList?.length || 0);
    res.json({ success: true, warning: warningMessage, strippedCount });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// BULK UPDATE COMPATIBILITY (Batch Send)
// POST /api/ebay/bulk-update-compatibility
// Body: { sellerId, items: [{ itemId, title, sku, compatibilityList }] }
// Processes items sequentially to avoid rate limits.
// Returns per-item results and creates a CompatibilityBatchLog.
// ============================================
router.post('/bulk-update-compatibility', requireAuth, async (req, res) => {
  const { sellerId, items, totalItems: clientTotalItems, skippedCount: clientSkippedCount } = req.body;
  if (!sellerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'sellerId and non-empty items array required' });
  }

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    const token = await ensureValidToken(seller);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process items sequentially to respect eBay rate limits
    for (const entry of items) {
      const { itemId, title, sku, compatibilityList: rawCompatList } = entry;
      const compatibilityList = sanitizeCompatibilityList(rawCompatList);
      try {
        let itemInnerContent = `<ItemID>${itemId}</ItemID>`;

        if (!compatibilityList || compatibilityList.length === 0) {
          itemInnerContent += `<ItemCompatibilityList><ReplaceAll>true</ReplaceAll></ItemCompatibilityList>`;
        } else {
          let compatXml = '<ItemCompatibilityList><ReplaceAll>true</ReplaceAll>';
          compatibilityList.forEach(c => {
            compatXml += '<Compatibility>';
            if (c.notes) compatXml += `<CompatibilityNotes>${escapeXml(c.notes)}</CompatibilityNotes>`;
            c.nameValueList.forEach(nv => {
              compatXml += `<NameValueList><Name>${escapeXml(nv.name)}</Name><Value>${escapeXml(nv.value)}</Value></NameValueList>`;
            });
            compatXml += '</Compatibility>';
          });
          compatXml += '</ItemCompatibilityList>';
          itemInnerContent += compatXml;
        }

        const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
          <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
            <ErrorLanguage>en_US</ErrorLanguage>
            <WarningLevel>High</WarningLevel>
            <Item>${itemInnerContent}</Item>
          </ReviseFixedPriceItemRequest>`;

        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
          headers: { 'X-EBAY-API-SITEID': '100', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'Content-Type': 'text/xml' }
        });

        const result = await parseStringPromise(response.data);
        const ack = result.ReviseFixedPriceItemResponse.Ack[0];

        if (ack === 'Failure') {
          const errors = result.ReviseFixedPriceItemResponse.Errors || [];
          const errorMessage = errors.map(e => e.LongMessage[0]).join('; ');

          // If rate limited, stop processing remaining items
          const isRateLimitError = errorMessage.includes('exceeded usage limit') || errorMessage.includes('call limit');
          if (isRateLimitError) {
            results.push({ itemId, title, sku, status: 'failure', error: 'Rate limit reached', compatibilityCount: compatibilityList?.length || 0 });
            failureCount++;
            // Mark all remaining items as failed due to rate limit
            const currentIdx = items.indexOf(entry);
            for (let i = currentIdx + 1; i < items.length; i++) {
              results.push({ itemId: items[i].itemId, title: items[i].title, sku: items[i].sku, status: 'failure', error: 'Skipped - rate limit reached on earlier item', compatibilityCount: items[i].compatibilityList?.length || 0 });
              failureCount++;
            }
            break;
          }

          // --- Duplicate listing: differentiate title with fitment suffix + minor price bump, retry with compat ---
          if (isDuplicateListingError(errorMessage)) {
            try {
              console.log(`[BulkCompat] Duplicate listing blocked item ${itemId}. Retrying with title+fitment differentiation...`);
              const { newPrice, newTitle, warning: retryWarning } = await retryCompatWithTitleDiff(token, itemId, compatibilityList);
              await Listing.findOneAndUpdate({ itemId }, { compatibility: compatibilityList, currentPrice: newPrice, title: newTitle });
              console.log(`[BulkCompat] Title-diff retry succeeded for item ${itemId}. New title: "${newTitle}"`);
              results.push({ itemId, title: newTitle, sku, status: 'success', error: retryWarning || `Title updated to differentiate (duplicate listing)`, compatibilityCount: compatibilityList?.length || 0, strippedCount: 0 });
              successCount++;
            } catch (retryErr) {
              console.error(`[BulkCompat] Title-diff retry failed for item ${itemId}:`, retryErr.message);
              results.push({ itemId, title, sku, status: 'failure', error: `Duplicate listing — title-diff retry failed: ${retryErr.message}`, compatibilityCount: compatibilityList?.length || 0 });
              failureCount++;
            }
          } else {
            results.push({ itemId, title, sku, status: 'failure', error: parseInvalidCombos(errorMessage), compatibilityCount: compatibilityList?.length || 0 });
            failureCount++;
            // Purge rejected trims/engines from cache
            purgeInvalidFromCache(errorMessage).catch(e => console.error('[FitmentCache] Purge error:', e.message));
          }
          // --- End duplicate listing fallback ---
        } else {
          // Success or Warning — update local DB
          let savedList = compatibilityList;
          let warning = null;
          if (ack === 'Warning') {
            const warnings = result.ReviseFixedPriceItemResponse.Errors || [];
            const meaningful = warnings.filter(err => {
              const msg = err.LongMessage[0];
              return !msg.includes("If this item sells by a Best Offer") && !msg.includes("Funds from your sales may be unavailable");
            });
            if (meaningful.length > 0) {
              const rawWarning = meaningful.map(e => e.LongMessage[0]).join('; ');
              warning = meaningful.map(e => parseInvalidCombos(e.LongMessage[0])).join('; ');
              // Strip entries that eBay rejected so local DB matches what eBay actually accepted
              savedList = filterOutInvalidCombos(compatibilityList, rawWarning);
              // Also remove rejected trims/engines from FitmentCache so they don't show in dropdowns
              purgeInvalidFromCache(rawWarning).catch(e => console.error('[FitmentCache] Purge error:', e.message));
            }
          }
          await Listing.findOneAndUpdate({ itemId }, { compatibility: savedList });
          const strippedCount = (compatibilityList?.length || 0) - (savedList?.length || 0);
          results.push({ itemId, title, sku, status: 'success', error: warning || null, compatibilityCount: savedList?.length || 0, strippedCount });
          successCount++;
        }
      } catch (itemErr) {
        results.push({ itemId, title, sku, status: 'failure', error: itemErr.message, compatibilityCount: compatibilityList?.length || 0 });
        failureCount++;
      }
    }

    // Save batch log
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const batchLog = await CompatibilityBatchLog.create({
      user: req.user.userId,
      seller: sellerId,
      totalItems: clientTotalItems || items.length,
      correctCount: items.length,
      skippedCount: clientSkippedCount || 0,
      successCount,
      failureCount,
      status: 'completed',
      items: results,
      date: dateStr,
    });

    res.json({ success: true, batchLogId: batchLog._id, successCount, failureCount, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// COMPATIBILITY BATCH HISTORY
// GET /api/ebay/compatibility-batch-history
// Query: ?sellerId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&page=1&limit=20
// ============================================
router.get('/compatibility-batch-history', requireAuth, async (req, res) => {
  try {
    const { sellerId, userId, date, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (sellerId) filter.seller = sellerId;
    if (userId) filter.user = userId;
    if (date) {
      // Single date filter: convert selected IST date to UTC timestamp range
      // IST is UTC+5:30, so midnight IST = previous day 18:30 UTC
      const dayStart = new Date(date + 'T00:00:00+05:30'); // midnight IST
      const dayEnd = new Date(date + 'T23:59:59.999+05:30'); // end of day IST
      filter.createdAt = { $gte: dayStart, $lte: dayEnd };
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const total = await CompatibilityBatchLog.countDocuments(filter);
    const logs = await CompatibilityBatchLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('user', 'username name')
      .populate('seller')
      .lean();

    // Populate seller username via seller.user
    const sellerUserIds = logs.filter(l => l.seller?.user).map(l => l.seller.user);
    let sellerUserMap = {};
    if (sellerUserIds.length > 0) {
      const User = mongoose.model('User');
      const users = await User.find({ _id: { $in: sellerUserIds } }, { username: 1 }).lean();
      users.forEach(u => { sellerUserMap[u._id.toString()] = u.username; });
    }

    const enriched = logs.map(log => ({
      ...log,
      sellerUsername: log.seller?.user ? (sellerUserMap[log.seller.user.toString()] || 'Unknown') : 'Unknown',
    }));

    res.json({ logs: enriched, total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// EDIT ACTIVE LISTINGS - SYNC ALL LISTINGS
// ============================================
// Syncs ALL active listings (not just Motors) for editing title/description/price
router.post('/sync-all-listings', requireAuth, async (req, res) => {
  const { sellerId } = req.body;

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: "Seller not found" });

    const token = await ensureValidToken(seller);

    const startTimeTo = new Date();
    let startTimeFrom = seller.lastAllListingsPolledAt || getEffectiveInitialSyncDate(seller.initialSyncDate);
    startTimeFrom = getClampedSellerListStart(startTimeFrom, startTimeTo);

    let page = 1;
    let totalPages = 1;
    let processedCount = 0;

    do {
      console.log(`[Sync All Listings] Fetching Page ${page}...`);

      const xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
          <ErrorLanguage>en_US</ErrorLanguage>
          <WarningLevel>High</WarningLevel>
          <DetailLevel>ItemReturnDescription</DetailLevel>
          <StartTimeFrom>${new Date(startTimeFrom).toISOString()}</StartTimeFrom>
          <StartTimeTo>${startTimeTo.toISOString()}</StartTimeTo>
          <IncludeWatchCount>true</IncludeWatchCount>
          <Pagination>
            <EntriesPerPage>100</EntriesPerPage>
            <PageNumber>${page}</PageNumber>
          </Pagination>
          <OutputSelector>ItemArray.Item.ItemID</OutputSelector>
          <OutputSelector>ItemArray.Item.Title</OutputSelector>
          <OutputSelector>ItemArray.Item.SKU</OutputSelector>
          <OutputSelector>ItemArray.Item.SellingStatus</OutputSelector>
          <OutputSelector>ItemArray.Item.ListingStatus</OutputSelector>
          <OutputSelector>ItemArray.Item.Description</OutputSelector>
          <OutputSelector>ItemArray.Item.PictureDetails</OutputSelector>
          <OutputSelector>ItemArray.Item.PrimaryCategory</OutputSelector>
          <OutputSelector>ItemArray.Item.ListingDetails</OutputSelector>
          <OutputSelector>PaginationResult</OutputSelector>
        </GetSellerListRequest>
      `;

      const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
        headers: {
          'X-EBAY-API-SITEID': '0', // Use SiteID 0 for all listings (not just Motors)
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
          'X-EBAY-API-CALL-NAME': 'GetSellerList',
          'Content-Type': 'text/xml'
        }
      });

      const result = await parseStringPromise(response.data);
      if (result.GetSellerListResponse.Ack[0] === 'Failure') {
        throw new Error(result.GetSellerListResponse.Errors[0].LongMessage[0]);
      }

      const pagination = result.GetSellerListResponse.PaginationResult[0];
      totalPages = parseInt(pagination.TotalNumberOfPages[0]);
      const items = result.GetSellerListResponse.ItemArray?.[0]?.Item || [];

      for (const item of items) {
        const status = item.SellingStatus?.[0]?.ListingStatus?.[0];
        if (status !== 'Active') continue;

        const categoryName = item.PrimaryCategory?.[0]?.CategoryName?.[0] || '';
        const rawHtml = item.Description ? item.Description[0] : '';
        const cleanHtml = extractCleanDescription(rawHtml);

        // Upsert to ActiveListing collection (separate from Motors Listing collection)
        await ActiveListing.findOneAndUpdate(
          { itemId: item.ItemID[0] },
          {
            seller: seller._id,
            title: item.Title[0],
            sku: item.SKU ? item.SKU[0] : '',
            currentPrice: parseFloat(item.SellingStatus[0].CurrentPrice[0]._),
            currency: item.SellingStatus[0].CurrentPrice[0].$.currencyID,
            listingStatus: status,
            mainImageUrl: item.PictureDetails?.[0]?.PictureURL?.[0] || '',
            categoryName: categoryName,
            descriptionPreview: cleanHtml,
            startTime: item.ListingDetails?.[0]?.StartTime?.[0]
          },
          { upsert: true }
        );
        processedCount++;
      }
      page++;
    } while (page <= totalPages);

    // Update last polled timestamp
    seller.lastAllListingsPolledAt = startTimeTo;
    await seller.save();

    res.json({
      success: true,
      message: `Synced ${processedCount} active listings.`
    });

  } catch (err) {
    console.error('[Sync All Listings] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// One-click all-store historical backfill orchestrator.
// Runs module sync steps sequentially and returns per-step status.
router.post('/backfill-everything-all-stores', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const {
      continueOnError = true,
      modules = ['orders', 'messages', 'listings', 'returns', 'inrCases', 'paymentDisputes'],
    } = req.body || {};

    const moduleSet = new Set(Array.isArray(modules) ? modules : []);
    const steps = [];
    if (moduleSet.has('orders')) {
      steps.push({ name: 'orders', path: '/api/ebay/poll-order-updates' });
    }
    if (moduleSet.has('messages')) {
      steps.push({ name: 'messages', path: '/api/ebay/sync-inbox' });
    }
    if (moduleSet.has('listings')) {
      steps.push({ name: 'listings', path: '/api/ebay/sync-all-sellers-listings' });
    }
    if (moduleSet.has('returns')) {
      steps.push({ name: 'returns', path: '/api/ebay/fetch-returns' });
    }
    if (moduleSet.has('inrCases')) {
      steps.push({ name: 'inrCases', path: '/api/ebay/fetch-inr-cases' });
    }
    if (moduleSet.has('paymentDisputes')) {
      steps.push({ name: 'paymentDisputes', path: '/api/ebay/fetch-payment-disputes' });
    }

    if (steps.length === 0) {
      return res.status(400).json({
        error: 'No valid modules selected',
        validModules: ['orders', 'messages', 'listings', 'returns', 'inrCases', 'paymentDisputes'],
      });
    }

    const runStartedAt = new Date();
    const results = [];

    for (const step of steps) {
      const result = await runInternalBackfillStep({ req, ...step });
      results.push(result);
      if (!result.ok && !continueOnError) break;
    }

    const runCompletedAt = new Date();
    const failedSteps = results.filter((r) => !r.ok);
    const successfulSteps = results.filter((r) => r.ok);

    return res.json({
      message: failedSteps.length
        ? 'Backfill completed with some step failures'
        : 'Backfill completed successfully',
      startedAt: runStartedAt,
      completedAt: runCompletedAt,
      durationMs: runCompletedAt.getTime() - runStartedAt.getTime(),
      requestedModules: Array.from(moduleSet),
      successfulSteps: successfulSteps.length,
      failedSteps: failedSteps.length,
      results,
    });
  } catch (err) {
    console.error('[Backfill Everything] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to run full backfill' });
  }
});

// GET ALL LISTINGS (Without Motors filter)
router.get('/all-listings', requireAuth, async (req, res) => {
  const { sellerId, page = 1, limit = 50, search } = req.query;
  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Base Query - no category filter
    let query = { seller: sellerId, listingStatus: 'Active' };

    // Search Logic
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      query.$or = [
        { title: searchRegex },
        { sku: searchRegex },
        { itemId: searchRegex }
      ];
    }

    const totalDocs = await ActiveListing.countDocuments(query);
    const listings = await ActiveListing.find(query)
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      listings,
      pagination: {
        total: totalDocs,
        page: pageNum,
        pages: Math.ceil(totalDocs / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE LISTING (Title, Description, Price)
router.post('/update-listing', requireAuth, async (req, res) => {
  const { sellerId, itemId, title, description, price, orderId, productTitle } = req.body;

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const token = await ensureValidToken(seller);

    // Get original price from order subtotal for price change tracking
    let originalPrice = null;
    let orderObjectId = null;
    if (price !== undefined && price !== null && orderId) {
      const order = await Order.findOne({ orderId });
      originalPrice = order?.subtotal ? parseFloat(order.subtotal) : null;
      orderObjectId = order?._id || null;
    }

    // Build Item XML content
    let itemContent = `<ItemID>${itemId}</ItemID>`;

    if (title) {
      itemContent += `<Title>${escapeXml(title)}</Title>`;
    }

    if (description !== undefined) {
      // Wrap description in CDATA to preserve HTML
      itemContent += `<Description><![CDATA[${description}]]></Description>`;
    }

    if (price !== undefined && price !== null) {
      itemContent += `<StartPrice>${parseFloat(price).toFixed(2)}</StartPrice>`;
    }

    const xmlRequest = `
      <?xml version="1.0" encoding="utf-8"?>
      <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
        <ErrorLanguage>en_US</ErrorLanguage>
        <WarningLevel>Low</WarningLevel>
        <Item>
          ${itemContent}
        </Item>
      </ReviseFixedPriceItemRequest>
    `;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
        'Content-Type': 'text/xml'
      }
    });

    const result = await parseStringPromise(response.data);
    const ack = result.ReviseFixedPriceItemResponse.Ack[0];

    // Handle Failures - show all errors to user
    if (ack === 'Failure') {
      const errors = result.ReviseFixedPriceItemResponse.Errors || [];
      const errorMessage = errors.map(e => e.LongMessage?.[0]).join('; ');
      
      // Log failed price change attempt
      if (price !== undefined && price !== null && originalPrice !== null) {
        await createPriceChangeLog({
          userId: req.user.userId,
          sellerId,
          orderObjectId,
          itemId,
          orderId,
          productTitle,
          originalPrice,
          newPrice: parseFloat(price),
          success: false,
          errorMessage,
          ip: req.ip,
          userAgent: req.get('user-agent')
        });
      }
      
      throw new Error(`eBay Error: ${errorMessage}`);
    }

    // Handle Warnings - show all warnings to user
    let warningMessage = null;
    if (ack === 'Warning') {
      const warnings = result.ReviseFixedPriceItemResponse.Errors || [];
      warningMessage = warnings.map(e => e.LongMessage?.[0]).join('; ');
    }

    console.log(`[Update Listing] Success! ItemID: ${result.ReviseFixedPriceItemResponse.ItemID?.[0]}`);

    // Log successful price change
    if (price !== undefined && price !== null && originalPrice !== null) {
      await createPriceChangeLog({
        userId: req.user.userId,
        sellerId,
        orderObjectId,
        itemId,
        orderId,
        productTitle,
        originalPrice,
        newPrice: parseFloat(price),
        success: true,
        errorMessage: null,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      // Mark ALL orders with this legacy item ID as having price updated
      // This matches all orders where any lineItem has this legacyItemId
      const updateResult = await Order.updateMany(
        { 'lineItems.legacyItemId': itemId },
        {
          priceUpdatedViaSheet: true,
          lastPriceUpdateDate: new Date()
        }
      );
      console.log(`[Price Update] Marked ${updateResult.modifiedCount} orders with itemId ${itemId} as price-updated`);
    }

    res.json({ success: true, warning: warningMessage });

  } catch (err) {
    console.error('[Update Listing] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ============================================
// HELPER: Fetch eBay Developer Analytics Rate Limits
// Cached for 5 minutes to avoid inflating the developer API usage counter.
// eBay rate limits are APP-LEVEL (per Client ID), not per-seller.
// All sellers share the same pool — fetching with any seller token gives the same result.
// ============================================
let _rateLimitCache = null;
let _rateLimitCacheTime = 0;
const RATE_LIMIT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchEbayRateLimits(accessToken, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _rateLimitCache && (now - _rateLimitCacheTime) < RATE_LIMIT_CACHE_TTL_MS) {
    console.log('[Rate Limits] Returning cached result');
    return _rateLimitCache;
  }

  try {
    const response = await axios.get(
      'https://api.ebay.com/developer/analytics/v1_beta/rate_limit',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );

    const rateLimitData = response.data?.rateLimits || [];

    // Build per-context entries, each with their individual resources listed.
    // Note: eBay uses a SHARED pool per context — all resources draw from the same bucket.
    // The used/limit/remaining is the same for every resource in a context.
    const contexts = [];
    for (const api of rateLimitData) {
      const ctx = api.apiContext || 'Other';
      const firstResource = api.resources?.[0];
      const firstRate = firstResource?.rates?.[0];
      if (!firstRate) continue;

      const used = (firstRate.limit || 0) - (firstRate.remaining || 0);
      const usagePercent = firstRate.limit > 0
        ? Math.round((used / firstRate.limit) * 100)
        : 0;

      // Collect all resource names
      const resources = (api.resources || []).map(r => r.name).filter(Boolean);

      contexts.push({
        apiContext: ctx,
        apiName: api.apiName,
        apiVersion: api.apiVersion,
        limit: firstRate.limit,
        remaining: firstRate.remaining,
        reset: firstRate.reset,
        used,
        usagePercent,
        resources  // individual resource names that share this pool
      });
    }

    const result = { success: true, rateLimits: contexts, fetchedAt: new Date().toISOString() };
    _rateLimitCache = result;
    _rateLimitCacheTime = now;
    return result;
  } catch (err) {
    console.error('[Rate Limits] Error fetching from eBay:', err.message);
    return { success: false, error: err.message, rateLimits: [] };
  }
}

// 4.5. GET EBAY API USAGE STATS (single seller — for compatibility dashboard badge)
router.get('/api-usage-stats', requireAuth, async (req, res) => {
  const { sellerId } = req.query;

  if (!sellerId) {
    return res.status(400).json({ error: 'sellerId is required' });
  }

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    const token = await ensureValidToken(seller);
    const stats = await fetchEbayRateLimits(token);

    // Compute a simple summary for the compatibility dashboard badge
    let used = 0, limit = 1, remaining = 0, hoursUntilReset = 24;
    if (stats.rateLimits.length > 0) {
      const mostUsed = stats.rateLimits.reduce((a, b) => (a.usagePercent > b.usagePercent ? a : b));
      used = mostUsed.used;
      limit = mostUsed.limit;
      remaining = mostUsed.remaining;
      if (mostUsed.reset) {
        const resetTime = new Date(mostUsed.reset);
        hoursUntilReset = Math.max(0, Math.ceil((resetTime - Date.now()) / (1000 * 60 * 60)));
      }
    }

    res.json({ success: stats.success, used, limit, remaining, hoursUntilReset, rateLimits: stats.rateLimits });
  } catch (err) {
    console.error('Error fetching API usage stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch API usage stats', success: false });
  }
});

// 4.6. GET EBAY API USAGE STATS (app-level — same for all sellers)
// Calls eBay ONCE (not once per seller) since limits are app-level.
// Uses a 5-minute cache to avoid inflating developer API usage.
router.get('/api-usage-stats/all', requireAuth, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';

    // Get any one seller to use their token — result is the same for all
    const sellers = await Seller.find({}).populate('user');
    if (sellers.length === 0) {
      return res.json({ success: true, rateLimits: [], sellers: [], fetchedAt: null });
    }

    // Try each seller until we get a valid token
    let stats = null;
    for (const seller of sellers) {
      try {
        const token = await ensureValidToken(seller);
        stats = await fetchEbayRateLimits(token, forceRefresh);
        if (stats.success) break;
      } catch (err) {
        console.warn(`[API Usage] Skipping seller ${seller._id}: ${err.message}`);
      }
    }

    if (!stats) stats = { success: false, error: 'No valid seller token found', rateLimits: [] };

    res.json({
      success: stats.success,
      rateLimits: stats.rateLimits,
      fetchedAt: stats.fetchedAt || null,
      cached: !forceRefresh,
      sellers: sellers.map(s => ({
        _id: s._id,
        name: s.user?.username || s.user?.email || 'Unknown'
      }))
    });
  } catch (err) {
    console.error('[API Usage All] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. GET COMPATIBILITY METADATA (REST API Version)
router.post('/compatibility/values', requireAuth, async (req, res) => {
  const { sellerId, propertyName, constraints } = req.body;

  try {
    // 1. GENERATE CACHE KEY
    // Unique key based on all constraints (e.g. "Year_Make_Nissan_Model_370Z")
    let cacheKey = propertyName;
    if (constraints && constraints.length > 0) {
      const sortedParams = constraints
        .map(c => `${c.name}_${c.value}`)
        .sort()
        .join('_');
      cacheKey = `${propertyName}_${sortedParams}`;
    }

    // 2. CHECK DB CACHE (TTL-managed — expired docs are auto-deleted by MongoDB)
    const cachedData = await FitmentCache.findOne({ cacheKey });
    if (cachedData) {
      return res.json({ values: cachedData.values });
    }

    // 3. FETCH FROM EBAY (REST Taxonomy API)
    const seller = await Seller.findById(sellerId);
    const token = await ensureValidToken(seller);

    // Build Filter String for REST API
    // FIX: Process ALL constraints, not just the first one.
    // Format: "Make:Nissan,Model:370Z"
    let filterParam = '';
    if (constraints && constraints.length > 0) {
      const filters = constraints.map(c => {
        // Remove quotes and escape commas within the value itself
        const cleanValue = String(c.value).replace(/,/g, '\\,');
        return `${c.name}:${cleanValue}`;
      });
      filterParam = filters.join(',');
    }

    console.log(`[Fitment] Fetching ${propertyName} from eBay (Cat: 33559)... Filter: ${filterParam}`);

    const response = await axios.get(
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/100/get_compatibility_property_values`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        },
        params: {
          category_id: '33559',
          compatibility_property: propertyName,
          filter: filterParam || undefined
        }
      }
    );

    // Extract Values
    const rawValues = response.data.compatibilityPropertyValues || [];
    const values = rawValues.map(item => item.value);

    // 4. SAVE TO DB — Make/Model/Year cached 30 days, Trim/Engine cached 7 days
    if (values.length > 0) {
      const isLongLived = ['Make', 'Model', 'Year'].includes(propertyName);
      const ttlMs = isLongLived ? 60 * 24 * 60 * 60 * 1000 : 10 * 24 * 60 * 60 * 1000;
      const expireAt = new Date(Date.now() + ttlMs);
      await FitmentCache.findOneAndUpdate(
        { cacheKey },
        { cacheKey, values, lastUpdated: new Date(), expireAt },
        { upsert: true }
      );
    }
    res.json({ values });

  } catch (err) {
    console.error("Metadata Fetch Error:", JSON.stringify(err.response?.data || err.message, null, 2));
    res.json({ values: [] });
  }
});



// --- NEW ROUTE 1: UPSERT CONVERSATION TAGS (Called from BuyerChatPage) ---
// 
router.post('/conversation-meta', requireAuth, async (req, res) => {
  const { sellerId, buyerUsername, orderId, itemId, category, caseStatus, status, pickedUpBy } = req.body;

  if (!caseStatus) {
    return res.status(400).json({ error: 'Case Status is required' });
  }

  try {
    let query = { seller: sellerId };

    if (orderId) {
      query.orderId = orderId;
    } else {
      query.buyerUsername = buyerUsername;
      query.itemId = itemId;
      query.orderId = null;
    }

    const updateData = {
      seller: sellerId,
      buyerUsername,
      orderId: orderId || null,
      itemId,
      category,
      caseStatus,
      // Use provided status if given; otherwise default to 'Open'
      status: status || 'Open',
      resolvedAt: null,
      resolvedBy: null
    };
    if (pickedUpBy !== undefined) updateData.pickedUpBy = pickedUpBy;

    const meta = await ConversationMeta.findOneAndUpdate(
      query,
      updateData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, meta });
  } catch (err) {
    console.error('Meta Save Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- NEW ROUTE 2: FETCH TAGS FOR THREAD (Called from BuyerChatPage) ---
router.get('/conversation-meta/single', requireAuth, async (req, res) => {
  const { sellerId, buyerUsername, orderId, itemId } = req.query;

  try {
    let query = { seller: sellerId };
    if (orderId) {
      query.orderId = orderId;
    } else {
      query.buyerUsername = buyerUsername;
      query.itemId = itemId;
      query.orderId = null;
    }

    const meta = await ConversationMeta.findOne(query);
    res.json(meta || {}); // Return empty object if not found (cleaner for frontend)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW ROUTE 3: GET MANAGEMENT LIST (Called from ConversationManagementPage) ---
// 
router.get('/conversation-management/list', requireAuth, async (req, res) => {
  const { status } = req.query;

  try {
    let query = {};
    if (status) {
      const statuses = String(status)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) query.status = statuses[0];
      else if (statuses.length > 1) query.status = { $in: statuses };
    }

    const list = await ConversationMeta.aggregate([
      { $match: query },
      { $sort: { updatedAt: -1 } },

      // 1. LOOKUP SELLER (ConversationMeta -> Seller)
      {
        $lookup: {
          from: 'sellers',
          localField: 'seller',
          foreignField: '_id',
          as: 'sellerDoc'
        }
      },
      // Unwind allows us to access the fields inside sellerDoc directly
      { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },

      // 2. LOOKUP USER (Seller -> User) - THIS WAS MISSING
      {
        $lookup: {
          from: 'users', // The collection name for 'User' model is usually lowercase plural 'users'
          localField: 'sellerDoc.user',
          foreignField: '_id',
          as: 'userDoc'
        }
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },

      // 3. LOOKUP ORDER (To get Buyer Real Name)
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'orderInfo'
        }
      },

      // 4. PROJECT FINAL SHAPE
      {
        $project: {
          _id: 1,
          sellerId: '$sellerDoc._id',
          // NOW WE PULL USERNAME FROM THE USER DOC
          sellerName: { $ifNull: ['$userDoc.username', 'Unknown'] },
          buyerUsername: 1,
          orderId: 1,
          itemId: 1,
          category: 1,
          caseStatus: 1,
          status: 1,
          notes: 1,
          pickedUpBy: 1,
          updatedAt: 1,
          buyerName: {
            $ifNull: [
              { $arrayElemAt: ["$orderInfo.buyer.buyerRegistrationAddress.fullName", 0] },
              "$buyerUsername"
            ]
          }
        }
      },

      // 5. LOOKUP MESSAGE TIMESTAMPS FOR SLA / REPLY TIMERS
      {
        $lookup: {
          from: 'messages',
          let: {
            sellerId: '$sellerId',
            metaOrderId: '$orderId',
            metaBuyerUsername: '$buyerUsername',
            metaItemId: '$itemId'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$seller', '$$sellerId'] },
                    {
                      $cond: [
                        { $ne: ['$$metaOrderId', null] },
                        { $eq: ['$orderId', '$$metaOrderId'] },
                        {
                          $and: [
                            { $eq: ['$buyerUsername', '$$metaBuyerUsername'] },
                            { $eq: ['$itemId', '$$metaItemId'] },
                            { $eq: [{ $ifNull: ['$orderId', null] }, null] }
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                lastBuyerMessageAt: {
                  $max: {
                    $cond: [{ $eq: ['$sender', 'BUYER'] }, '$messageDate', null]
                  }
                },
                lastSellerMessageAt: {
                  $max: {
                    $cond: [{ $eq: ['$sender', 'SELLER'] }, '$messageDate', null]
                  }
                }
              }
            },
            {
              $project: {
                _id: 0,
                lastBuyerMessageAt: 1,
                lastSellerMessageAt: 1
              }
            }
          ],
          as: 'messageTimes'
        }
      },
      {
        $unwind: {
          path: '$messageTimes',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          lastBuyerMessageAt: '$messageTimes.lastBuyerMessageAt',
          lastSellerMessageAt: '$messageTimes.lastSellerMessageAt'
        }
      },
      {
        $project: {
          messageTimes: 0
        }
      }
    ]);

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- NEW ROUTE 4: RESOLVE CONVERSATION (Called from Management Modal) ---
router.patch('/conversation-management/:id/resolve', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes, status, pickedUpBy } = req.body;

  try {
    const updateData = {
      notes,
      status,
      resolvedAt: status === 'Resolved' ? new Date() : null,
      resolvedBy: req.user.username
    };
    if (pickedUpBy !== undefined) updateData.pickedUpBy = pickedUpBy;

    const meta = await ConversationMeta.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    res.json({ success: true, meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// --- PATCH PICKED UP BY only ---
router.patch('/conversation-management/:id/pick-up', requireAuth, async (req, res) => {
  const { pickedUpBy } = req.body;
  try {
    const meta = await ConversationMeta.findByIdAndUpdate(
      req.params.id,
      { pickedUpBy: pickedUpBy || null },
      { new: true }
    );
    res.json({ success: true, meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CHAT AGENTS CRUD (for "Picked Up By" dropdown) ---
router.get('/chat-agents', requireAuth, async (req, res) => {
  try {
    const agents = await ChatAgent.find().sort({ name: 1 });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chat-agents', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const agent = await ChatAgent.create({ name: name.trim() });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/chat-agents/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const agent = await ChatAgent.findByIdAndUpdate(req.params.id, { name: name.trim() }, { new: true });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/chat-agents/:id', requireAuth, async (req, res) => {
  try {
    await ChatAgent.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Manual fields to upadte for amazon 
router.patch('/orders/:orderId/manual-fields', requireAuth, async (req, res) => {
  const { orderId } = req.params;
  const updates = req.body;

  const allowedFields = ['amazonAccount', 'arrivingDate', 'beforeTax', 'estimatedTax', 'azOrderId', 'amazonRefund', 'cardName', 'resolution', 'remark', 'alreadyInUse', 'remarkMessageSent'];
  const updateData = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      if (key === 'remark') {
        const rawRemark = updates[key];
        if (
          rawRemark === null ||
          rawRemark === undefined ||
          String(rawRemark).trim() === '' ||
          String(rawRemark).trim().toLowerCase() === 'select'
        ) {
          updateData[key] = null;
        } else {
          updateData[key] = String(rawRemark).trim();
        }
      } else {
        updateData[key] = updates[key];
      }
    }
  });

  try {
    // Find the order first to get full data for USD recalculation
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const previousAmazonAccount = order.amazonAccount;
    const previousAmazonAccountAssignmentSource = order.amazonAccountAssignmentSource;

    // Apply manual updates to order object
    Object.keys(updateData).forEach(key => {
      order[key] = updateData[key];
    });

    if (Object.prototype.hasOwnProperty.call(updateData, 'amazonAccount')) {
      if (updateData.amazonAccount) {
        order.amazonAccountAssignmentSource = 'fulfillment';

        if (order.sourcingStatus !== 'Done') {
          order.sourcingStatus = 'Done';
        }

        if (!order.sourcingCompletedAt) {
          order.sourcingCompletedAt = new Date();
        }
      } else if (previousAmazonAccount && previousAmazonAccountAssignmentSource === 'fulfillment') {
        order.amazonAccountAssignmentSource = null;

        if (order.sourcingStatus === 'Done') {
          order.sourcingStatus = 'Not Yet';
          order.sourcingCompletedAt = null;
        }
      }
    }

    // Check if any monetary fields were updated
    const monetaryFields = ['beforeTax', 'estimatedTax', 'amazonRefund'];
    const updatedMonetaryField = Object.keys(updates).some(key => monetaryFields.includes(key));

    // Recalculate USD values if monetary fields were updated
    if (updatedMonetaryField) {
      const usdUpdates = recalculateUSDFields(order);
      Object.keys(usdUpdates).forEach(key => {
        order[key] = usdUpdates[key];
      });

      // If beforeTaxUSD or estimatedTaxUSD changed, recalculate Amazon financials
      if (updates.beforeTax !== undefined || updates.estimatedTax !== undefined) {
        const amazonFinancials = await calculateAmazonFinancials(order);
        Object.keys(amazonFinancials).forEach(key => {
          order[key] = amazonFinancials[key];
        });
      }
    }

    // Save the updated order
    await order.save();

    // Populate seller info for response
    await order.populate({
      path: 'seller',
      populate: {
        path: 'user',
        select: 'username email'
      }
    });

    res.json({
      success: true,
      order,
      recalculated: updatedMonetaryField ? 'USD values recalculated' : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get item images from eBay Trading API (with caching)
router.get('/item-images/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sellerId, thumbnail } = req.query; // Add thumbnail parameter

    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }

    // ============================================
    // STEP 1: CREATE CACHE KEY
    // ============================================
    const cacheKey = `${itemId}_${sellerId}_${thumbnail || 'full'}`;

    // ============================================
    // STEP 2: CHECK CACHE FIRST
    // ============================================
    const cachedData = imageCache.get(cacheKey);
    if (cachedData) {
      console.log(`[ImageCache] ✅ HIT: ${cacheKey}`);
      res.set({
        'X-Cache': 'HIT',
        'Cache-Control': 'public, max-age=3600' // Browser cache: 1 hour
      });
      return res.json(cachedData);
    }

    console.log(`[ImageCache] ❌ MISS: ${cacheKey} - Fetching from eBay...`);

    // ============================================
    // STEP 3: CACHE MISS - FETCH FROM EBAY
    // ============================================
    // Get seller with valid token
    const seller = await Seller.findById(sellerId).populate('user');
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    await ensureValidToken(seller);

    // Use Trading API to get item details (GetItem call)
    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${seller.ebayTokens.access_token}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

    const response = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-SITEID': '0',
        'Content-Type': 'text/xml'
      },
      body: xmlBody
    });

    const xmlText = await response.text();

    // Parse XML to extract image URLs
    const pictureURLRegex = /<PictureURL>(.*?)<\/PictureURL>/g;
    const images = [];
    let match;

    while ((match = pictureURLRegex.exec(xmlText)) !== null) {
      images.push(match[1]);
    }

    if (images.length === 0) {
      // Try to get gallery URL as fallback
      const galleryMatch = xmlText.match(/<GalleryURL>(.*?)<\/GalleryURL>/);
      if (galleryMatch) {
        images.push(galleryMatch[1]);
      }
    }

    // ============================================
    // STEP 4: PREPARE RESPONSE DATA
    // ============================================
    const responseData = thumbnail === 'true' && images.length > 0
      ? { images: [images[0]], total: images.length }
      : { images, total: images.length };

    // ============================================
    // STEP 5: STORE IN CACHE (1 hour TTL)
    // ============================================
    imageCache.set(cacheKey, responseData);
    console.log(`[ImageCache] 💾 STORED: ${cacheKey} (${images.length} images)`);

    // ============================================
    // STEP 6: SET HTTP CACHE HEADERS
    // ============================================
    res.set({
      'X-Cache': 'MISS',
      'Cache-Control': 'public, max-age=3600' // Browser cache: 1 hour
    });

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching item images:', error);
    res.status(500).json({ error: 'Failed to fetch item images' });
  }
});

// ============================================
// CACHE MANAGEMENT ENDPOINTS
// ============================================

// Get cache statistics (Admin only)
router.get('/cache/stats', requireAuth, requirePageAccess('SellerFunds'), (req, res) => {
  try {
    const stats = imageCache.getStats();
    const sizeInfo = imageCache.getSizeInfo();

    res.json({
      ...stats,
      storage: sizeInfo,
      message: 'Cache statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

// Clear cache (Admin only)
router.post('/cache/clear', requireAuth, requirePageAccess('SellerFunds'), (req, res) => {
  try {
    imageCache.clear();
    res.json({
      success: true,
      message: 'Image cache cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Seller Analytics - Aggregated data by day/week/month
router.get('/seller-analytics', requireAuth, requirePageAccess('SellerAnalytics'), async (req, res) => {
  try {
    const { sellerId, groupBy = 'day', startDate, endDate, marketplace } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Build match query with timezone-aware date filtering (same as stored-orders)
    const matchQuery = {
      // Exclude cancelled orders
      $and: [
        {
          $or: [
            { orderPaymentStatus: { $exists: false } },
            { orderPaymentStatus: null },
            { orderPaymentStatus: { $nin: ['FULLY_REFUNDED', 'PARTIALLY_REFUNDED'] } }
          ]
        },
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
      ]
    };

    // Timezone-Aware Date Range Logic (Pacific Time - exact DST handling via Intl)
    matchQuery.dateSold = {};

    const { start } = getPTDayBoundsUTC(startDate);
    matchQuery.dateSold.$gte = start;

    const { end } = getPTDayBoundsUTC(endDate);
    matchQuery.dateSold.$lte = end;

    if (sellerId) {
      matchQuery.seller = new mongoose.Types.ObjectId(sellerId);
    }

    if (marketplace) {
      // Handle Canada marketplace mapping: EBAY_ENCA → EBAY_CA
      const marketplaceId = marketplace === 'EBAY_ENCA' ? 'EBAY_CA' : marketplace;
      matchQuery.purchaseMarketplaceId = marketplaceId;
    }

    // Always exclude low-value orders (subtotal < $3) from analytics
    matchQuery.$and = matchQuery.$and || [];
    matchQuery.$and.push({
      $or: [
        { subtotal: { $gte: 3 } },
        { subtotalUSD: { $gte: 3 } }
      ]
    });

    // Exclude orders without amazonAccount assigned
    matchQuery.$and.push({
      amazonAccount: { $exists: true, $ne: null, $ne: '' }
    });

    // Determine grouping format with PST timezone
    let dateGroupFormat;
    if (groupBy === 'day') {
      dateGroupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$dateSold', timezone: 'America/Los_Angeles' } };
    } else if (groupBy === 'week') {
      dateGroupFormat = { $dateToString: { format: '%Y-W%V', date: '$dateSold', timezone: 'America/Los_Angeles' } };
    } else if (groupBy === 'month') {
      dateGroupFormat = { $dateToString: { format: '%Y-%m', date: '$dateSold', timezone: 'America/Los_Angeles' } };
    } else {
      return res.status(400).json({ error: 'Invalid groupBy parameter. Use day, week, or month.' });
    }

    // Aggregation pipeline
    const analytics = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: dateGroupFormat,
          totalOrders: { $sum: 1 },
          totalSubtotal: { $sum: { $ifNull: ['$subtotal', 0] } },
          totalShipping: { $sum: { $ifNull: ['$shipping', 0] } },
          totalSalesTax: { $sum: { $ifNull: ['$salesTax', 0] } },
          totalDiscount: { $sum: { $ifNull: ['$discount', 0] } },
          totalTransactionFees: { $sum: { $ifNull: ['$transactionFees', 0] } },
          totalAdFees: { $sum: { $ifNull: ['$adFeeGeneral', 0] } },
          totalEarnings: { $sum: { $ifNull: ['$orderEarnings', 0] } },
          totalPBalanceINR: { $sum: { $ifNull: ['$pBalanceINR', 0] } },
          totalAmazonCosts: { $sum: { $ifNull: ['$amazonTotalINR', 0] } },
          totalCreditCardFees: { $sum: { $ifNull: ['$totalCC', 0] } },
          // Compute profit on-the-fly so stale stored values don't affect results
          totalProfit: {
            $sum: {
              $subtract: [
                { $subtract: [{ $ifNull: ['$pBalanceINR', 0] }, { $ifNull: ['$amazonTotalINR', 0] }] },
                { $ifNull: ['$totalCC', 0] }
              ]
            }
          }
        }
      },
      {
        $project: {
          period: '$_id',
          totalOrders: 1,
          totalSubtotal: { $round: ['$totalSubtotal', 2] },
          totalShipping: { $round: ['$totalShipping', 2] },
          totalSalesTax: { $round: ['$totalSalesTax', 2] },
          totalDiscount: { $round: ['$totalDiscount', 2] },
          totalTransactionFees: { $round: ['$totalTransactionFees', 2] },
          totalAdFees: { $round: ['$totalAdFees', 2] },
          totalEarnings: { $round: ['$totalEarnings', 2] },
          totalPBalanceINR: { $round: ['$totalPBalanceINR', 2] },
          totalAmazonCosts: { $round: ['$totalAmazonCosts', 2] },
          totalCreditCardFees: { $round: ['$totalCreditCardFees', 2] },
          totalProfit: { $round: ['$totalProfit', 2] },
          _id: 0
        }
      },
      { $sort: { period: 1 } }
    ]);

    // Calculate overall summary
    const summary = analytics.reduce((acc, row) => {
      acc.totalOrders += row.totalOrders;
      acc.totalEarnings += row.totalEarnings;
      acc.totalProfit += row.totalProfit;
      return acc;
    }, { totalOrders: 0, totalEarnings: 0, totalProfit: 0 });

    summary.avgOrderValue = summary.totalOrders > 0
      ? parseFloat((summary.totalEarnings / summary.totalOrders).toFixed(2))
      : 0;

    res.json({ analytics, summary });
  } catch (err) {
    console.error('Error fetching seller analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update worksheet status for an order (cancellation)
router.patch('/orders/:orderId/worksheet-status', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { worksheetStatus } = req.body;

    if (!['open', 'attended', 'resolved'].includes(worksheetStatus)) {
      return res.status(400).json({ error: 'Invalid worksheet status' });
    }

    const order = await Order.findOneAndUpdate(
      { orderId },
      { worksheetStatus },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error updating order worksheet status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update worksheet status for a return
router.patch('/returns/:returnId/worksheet-status', requireAuth, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { worksheetStatus } = req.body;

    if (!['open', 'attended', 'resolved'].includes(worksheetStatus)) {
      return res.status(400).json({ error: 'Invalid worksheet status' });
    }

    const returnDoc = await Return.findOneAndUpdate(
      { returnId },
      { worksheetStatus },
      { new: true }
    );

    if (!returnDoc) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    console.error('Error updating return worksheet status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update manual eBay/Amazon statuses for a return
router.patch('/returns/:returnId/marketplace-statuses', requireAuth, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { ebayStatus, amazonStatus } = req.body;

    const allowedEbayStatuses = [
      '',
      'Fully Refunded',
      'Partially Refunded',
      'To be returned',
      'Received Item',
      'Awaiting Return Shipment'
    ];

    const allowedAmazonStatuses = [
      '',
      'Received',
      'Refund Issued',
      'Replacement Delivered',
      'Dropped Off'
    ];

    if (typeof ebayStatus !== 'string' || !allowedEbayStatuses.includes(ebayStatus)) {
      return res.status(400).json({ error: 'Invalid eBay status' });
    }

    if (typeof amazonStatus !== 'string' || !allowedAmazonStatuses.includes(amazonStatus)) {
      return res.status(400).json({ error: 'Invalid Amazon status' });
    }

    const returnDoc = await Return.findOneAndUpdate(
      { returnId },
      { ebayStatus, amazonStatus },
      { new: true }
    );

    if (!returnDoc) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    console.error('Error updating return marketplace statuses:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update worksheet status for a case (INR)
router.patch('/cases/:caseId/worksheet-status', requireAuth, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { worksheetStatus } = req.body;

    if (!['open', 'attended', 'resolved'].includes(worksheetStatus)) {
      return res.status(400).json({ error: 'Invalid worksheet status' });
    }

    const caseDoc = await Case.findOneAndUpdate(
      { caseId },
      { worksheetStatus },
      { new: true }
    );

    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json({ success: true, case: caseDoc });
  } catch (err) {
    console.error('Error updating case worksheet status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update logs for a case (INR)
router.patch('/cases/:caseId/logs', requireAuth, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { logs } = req.body;

    const caseDoc = await Case.findOneAndUpdate(
      { caseId },
      { logs: logs || '' },
      { new: true }
    );

    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json({ success: true, case: caseDoc });
  } catch (err) {
    console.error('Error updating case logs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update logs for a return
router.patch('/returns/:returnId/logs', requireAuth, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { logs } = req.body;

    const returnDoc = await Return.findOneAndUpdate(
      { returnId },
      { logs: logs || '' },
      { new: true }
    );

    if (!returnDoc) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    console.error('Error updating return logs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark / unmark a return as SNAD (manual BBE override)
router.patch('/returns/:returnId/mark-snad', requireAuth, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { markedAsSNAD } = req.body;

    if (typeof markedAsSNAD !== 'boolean') {
      return res.status(400).json({ error: 'markedAsSNAD must be a boolean' });
    }

    const returnDoc = await Return.findOneAndUpdate(
      { returnId },
      { markedAsSNAD },
      { new: true }
    );

    if (!returnDoc) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    console.error('Error updating return SNAD status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update logs for an order (Cancellation)
router.patch('/orders/:orderId/logs', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { logs } = req.body;

    const order = await Order.findOneAndUpdate(
      { orderId },
      { logs: logs || '' },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error updating order logs:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// POLICY MESSAGE FEATURE (20-minute follow-up message)
// =====================================================

const POLICY_MESSAGE_TEMPLATE = `If you have any questions or concerns, please contact us directly through eBay messages. We’re always happy to help and resolve issues quickly.

Please note that once an order is processed, cancellation may not be possible. Also, before opening any cases such as INR, returns, or payment disputes, we kindly request you to message us first. We genuinely want to assist you and make things right.

As a small business, your support means a lot to us. Thank you for your understanding!`;

const POLICY_MESSAGE_DELAY_MS = 20 * 60 * 1000; // 20 minutes

function getPolicyEligibilityDate(creationDate) {
  const createdAt = creationDate ? new Date(creationDate) : new Date();
  const now = Date.now();
  // If order is already older than 20 minutes when ingested, skip scheduling.
  if (now - createdAt.getTime() > POLICY_MESSAGE_DELAY_MS) {
    return null;
  }
  return new Date(createdAt.getTime() + POLICY_MESSAGE_DELAY_MS);
}

function getPolicyMessageQuery(now = new Date()) {
  return {
    policyMessageEligibleAt: { $lte: now, $exists: true },
    policyMessageSent: { $ne: true },
    policyMessageDisabled: { $ne: true },
    // keep behavior aligned with prior delayed-message logic
    orderFulfillmentStatus: { $ne: 'FULFILLED' },
    $or: [
      { cancelState: { $exists: false } },
      { cancelState: null },
      { cancelState: { $nin: ['CANCELED', 'CANCELLED'] } }
    ]
  };
}

// Compatibility endpoint kept for existing UI wiring
router.patch('/orders/:orderId/auto-message-toggle', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { disabled } = req.body;

    const order = await Order.findOneAndUpdate(
      { orderId },
      { policyMessageDisabled: disabled },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error toggling policy message:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch ship-by date for a single order from eBay and store it (without touching lastModifiedDate)
router.post('/orders/:orderId/fetch-ship-by-date', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params; // MongoDB _id

    const order = await Order.findById(orderId).populate('seller');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const seller = order.seller;
    if (!seller?.ebayTokens?.access_token) {
      return res.status(400).json({ error: 'Seller does not have a connected eBay account' });
    }

    const accessToken = await ensureValidToken(seller);

    // Fetch the single order from eBay Fulfillment API
    const ebayRes = await axios.get(
      `https://api.ebay.com/sell/fulfillment/v1/order/${encodeURIComponent(order.orderId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const ebayOrder = ebayRes.data;
    const shipByDate = ebayOrder?.lineItems?.[0]?.lineItemFulfillmentInstructions?.shipByDate;

    if (!shipByDate) {
      return res.status(404).json({ error: 'Ship by date not available on eBay for this order' });
    }

    // Update ONLY shipByDate — explicitly exclude lastModifiedDate from the update
    await Order.findByIdAndUpdate(
      orderId,
      { $set: { shipByDate: new Date(shipByDate) } },
      { timestamps: false }
    );

    res.json({ success: true, shipByDate });
  } catch (err) {
    console.error('[FetchShipByDate] Error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Order not found on eBay' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Compatibility endpoint kept for existing UI wiring
router.get('/orders/auto-message-stats', requireAuth, async (req, res) => {
  try {
    const pending = await Order.countDocuments(getPolicyMessageQuery(new Date()));
    const sent = await Order.countDocuments({ policyMessageSent: true });
    const disabled = await Order.countDocuments({ policyMessageDisabled: true });

    res.json({ pending, sent, disabled });
  } catch (err) {
    console.error('Error getting policy message stats:', err);
    res.status(500).json({ error: err.message });
  }
});

async function sendPolicyMessage(order, seller) {
  const token = await ensureValidToken(seller);
  const itemId = order.lineItems?.[0]?.legacyItemId || order.itemNumber;
  const itemTitle = order.lineItems?.[0]?.title || order.productName;
  const buyerUsername = order.buyer?.username;

  if (!itemId || !buyerUsername) {
    console.log(`[PolicyMessage] Skip order ${order.orderId}: Missing itemId or buyerUsername`);
    return { success: false, reason: 'Missing itemId or buyerUsername' };
  }

  const escapedBody = POLICY_MESSAGE_TEMPLATE
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
    <AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
      <ItemID>${itemId}</ItemID>
      <MemberMessage>
        <Subject>Order Policy - #${order.orderId}</Subject>
        <Body>${escapedBody}</Body>
        <QuestionType>General</QuestionType>
        <RecipientID>${buyerUsername}</RecipientID>
      </MemberMessage>
    </AddMemberMessageAAQToPartnerRequest>`;

  try {
    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'AddMemberMessageAAQToPartner',
        'X-EBAY-API-SITEID': '0',
        'Content-Type': 'text/xml'
      }
    });

    if (response.data.includes('<Ack>Success</Ack>') || response.data.includes('<Ack>Warning</Ack>')) {
      await Order.findByIdAndUpdate(order._id, {
        policyMessageSent: true,
        policyMessageSentAt: new Date()
      });

      await Message.create({
        seller: seller._id,
        orderId: order.orderId,
        itemId,
        itemTitle,
        buyerUsername,
        sender: 'SELLER',
        subject: `Order Policy - #${order.orderId}`,
        body: POLICY_MESSAGE_TEMPLATE,
        read: true,
        messageType: 'ORDER',
        messageDate: new Date()
      });

      console.log(`[PolicyMessage] Success: Order ${order.orderId}`);
      return { success: true };
    }

    console.error(`[PolicyMessage] Failed: Order ${order.orderId}`, response.data);
    return { success: false, reason: 'eBay returned error' };
  } catch (err) {
    console.error(`[PolicyMessage] Error: Order ${order.orderId}`, err.message);
    return { success: false, reason: err.message };
  }
}

async function processPendingPolicyMessages(limit = 50) {
  const orders = await Order.find(getPolicyMessageQuery(new Date()))
    .populate({
      path: 'seller',
      populate: { path: 'user' }
    })
    .limit(limit);

  let successCount = 0;
  let failCount = 0;

  for (const order of orders) {
    if (!order.seller) {
      failCount++;
      continue;
    }

    const result = await sendPolicyMessage(order, order.seller);
    if (result.success) successCount++;
    else failCount++;

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { processed: orders.length, sent: successCount, failed: failCount };
}

// Compatibility endpoint path kept to avoid breaking existing UI button
router.post('/orders/send-auto-messages', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const result = await processPendingPolicyMessages(50);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Error sending policy messages:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// AWAITING SHEET SUMMARY - Order counts by seller (no tracking)
// =====================================================
router.get('/awaiting-sheet-summary', requireAuth, requirePageAccess('AwaitingSheet'), async (req, res) => {
  try {
    const { date, marketplace, excludeClient } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date is required (YYYY-MM-DD format)' });
    }

    // Build date range for the selected day (PST timezone like other endpoints)
    const PST_OFFSET_HOURS = 8;
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(PST_OFFSET_HOURS, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setUTCHours(PST_OFFSET_HOURS - 1, 59, 59, 999);

    // Base match conditions for the date and cancel state
    const baseMatch = {
      shipByDate: { $gte: startOfDay, $lte: endOfDay },
      cancelState: { $in: ['NONE_REQUESTED', 'IN_PROGRESS', null, ''] }
    };

    // Add marketplace filter if provided
    if (marketplace && marketplace !== '') {
      baseMatch.purchaseMarketplaceId = marketplace === 'EBAY_CA' ? { $in: ['EBAY_CA', 'EBAY_ENCA'] } : marketplace;
    }

    if (excludeClient === 'true') {
      const excludedSellerIds = await getExcludedClientSellerIds();
      if (excludedSellerIds.length > 0) {
        baseMatch.seller = { $nin: excludedSellerIds };
      }
    }

    // Aggregation pipeline - group by seller with conditional counts
    const summary = await Order.aggregate([
      {
        $match: baseMatch
      },
      // Group by seller with conditional counts
      {
        $group: {
          _id: '$seller',
          // Count orders without tracking number
          trackingIdCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $ifNull: ['$trackingNumber', ''] }, ''] },
                    { $eq: ['$trackingNumber', null] }
                  ]
                },
                1,
                0
              ]
            }
          },
          // Count orders with remark = 'Delivered'
          deliveredCount: {
            $sum: {
              $cond: [{ $eq: ['$remark', 'Delivered'] }, 1, 0]
            }
          },
          // Count orders with remark = 'In-transit'
          inTransitCount: {
            $sum: {
              $cond: [{ $eq: ['$remark', 'In-transit'] }, 1, 0]
            }
          },
          // Count orders with remark = 'Not yet shipped' and no tracking number
          notYetShippedCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$remark', 'Not yet shipped'] },
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$trackingNumber', ''] }, ''] },
                        { $eq: ['$trackingNumber', null] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          // Total orders count (for Upload Tracking column)
          uploadTrackingCount: { $sum: 1 },
          // Count orders with alreadyInUse = 'Yes' and no tracking number
          alreadyInUseCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$alreadyInUse', 'Yes'] },
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$trackingNumber', ''] }, ''] },
                        { $eq: ['$trackingNumber', null] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          // Count orders where notes contains 'amazon' (case insensitive) and no tracking
          amazonCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$trackingNumber', ''] }, ''] },
                        { $eq: ['$trackingNumber', null] }
                      ]
                    },
                    {
                      $regexMatch: { input: { $ifNull: ['$notes', ''] }, regex: /amazon/i }
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          // Count orders where notes starts with '1z' or '9' and no tracking
          upsUspsCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$trackingNumber', ''] }, ''] },
                        { $eq: ['$trackingNumber', null] }
                      ]
                    },
                    {
                      $or: [
                        { $regexMatch: { input: { $ifNull: ['$notes', ''] }, regex: /^1z/i } },
                        { $regexMatch: { input: { $ifNull: ['$notes', ''] }, regex: /^9/ } }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          // Count orders where notes is blank/null and no tracking
          blankCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$trackingNumber', ''] }, ''] },
                        { $eq: ['$trackingNumber', null] }
                      ]
                    },
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$notes', ''] }, ''] },
                        { $eq: ['$notes', null] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      // Lookup seller info
      {
        $lookup: {
          from: 'sellers',
          localField: '_id',
          foreignField: '_id',
          as: 'sellerDoc'
        }
      },
      { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
      // Lookup user for username
      {
        $lookup: {
          from: 'users',
          localField: 'sellerDoc.user',
          foreignField: '_id',
          as: 'userDoc'
        }
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          sellerId: '$_id',
          sellerName: { $ifNull: ['$userDoc.username', '$userDoc.email', 'Unknown'] },
          trackingIdCount: 1,
          deliveredCount: 1,
          inTransitCount: 1,
          uploadTrackingCount: 1,
          alreadyInUseCount: 1,
          amazonCount: 1,
          upsUspsCount: 1,
          blankCount: 1,
          notYetShippedCount: 1,
          _id: 0
        }
      },
      { $sort: { trackingIdCount: -1 } } // Sort by tracking ID count descending
    ]);

    // Calculate totals
    const totals = summary.reduce((acc, item) => ({
      trackingId: acc.trackingId + item.trackingIdCount,
      delivered: acc.delivered + item.deliveredCount,
      inTransit: acc.inTransit + item.inTransitCount,
      notYetShipped: acc.notYetShipped + item.notYetShippedCount,
      uploadTracking: acc.uploadTracking + item.uploadTrackingCount,
      alreadyInUse: acc.alreadyInUse + item.alreadyInUseCount,
      amazon: acc.amazon + item.amazonCount,
      upsUsps: acc.upsUsps + item.upsUspsCount,
      blank: acc.blank + item.blankCount
    }), { trackingId: 0, delivered: 0, inTransit: 0, notYetShipped: 0, uploadTracking: 0, alreadyInUse: 0, amazon: 0, upsUsps: 0, blank: 0 });

    res.json({
      date,
      summary,
      totals,
      totalSellers: summary.length
    });
  } catch (err) {
    console.error('Error fetching awaiting sheet summary:', err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================
// GET ALL SELLING PRIVILEGES (BULK)
// ============================================
router.get('/selling/summary/all', requireAuth, async (req, res) => {
  try {
    const sellers = await Seller.find({}).populate('user');
    console.log(`[Selling Limits] Fetching limits for ${sellers.length} sellers...`);

    const results = await Promise.all(sellers.map(async (seller) => {
      try {
        if (!seller.ebayTokens?.access_token || !seller.ebayTokens?.refresh_token) {
          return {
            sellerId: seller._id,
            sellerName: seller.user?.username || seller.sellerId || 'Unknown',
            notConnected: true,
          };
        }

        const accessToken = await ensureValidToken(seller);

        const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <SellingSummary>
    <Include>true</Include>
  </SellingSummary>
  <DetailLevel>ReturnAll</DetailLevel>
  <Version>1173</Version>
</GetMyeBaySellingRequest>`;

        const response = await axios.post(
          'https://api.ebay.com/ws/api.dll',
          xmlRequest,
          {
            headers: {
              'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
              'X-EBAY-API-SITEID': '0',
              'X-EBAY-API-COMPATIBILITY-LEVEL': '1173',
              'Content-Type': 'text/xml'
            }
          }
        );

        const result = await parseStringPromise(response.data, { explicitArray: false });

        if (result.GetMyeBaySellingResponse.Ack === 'Failure') {
          return {
            sellerId: seller._id,
            sellerName: seller.user?.username || seller.sellerId || 'Unknown',
            error: result.GetMyeBaySellingResponse.Errors?.LongMessage || 'eBay API Error'
          };
        }

        const summary = result.GetMyeBaySellingResponse.Summary;

        return {
          sellerId: seller._id,
          sellerName: seller.user?.username || seller.sellerId || 'Unknown',
          quantityLimitRemaining: summary?.QuantityLimitRemaining,
          amountLimitRemaining: summary?.AmountLimitRemaining?._,
          amountLimitCurrency: summary?.AmountLimitRemaining?.$?.currencyID,
          activeAuctionCount: summary?.ActiveAuctionCount,
          auctionSellingCount: summary?.AuctionSellingCount,
          totalSoldCount: summary?.TotalSoldCount,
          totalSoldValue: summary?.TotalSoldValue?._,
          totalSoldValueCurrency: summary?.TotalSoldValue?.$?.currencyID,
        };

      } catch (err) {
        console.error(`[Selling Limits] Failed for seller ${seller._id}:`, err.message);
        return {
          sellerId: seller._id,
          sellerName: seller.user?.username || seller.sellerId || 'Unknown',
          error: err.message
        };
      }
    }));

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('[Selling Summary All] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET SELLING PRIVILEGES / LIMITS
// ============================================
router.get('/selling/summary', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.query;

    if (!sellerId) {
      return res.status(400).json({ error: 'Missing sellerId' });
    }

    // 1. Get Seller & Token
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    if (!seller.ebayTokens?.access_token || !seller.ebayTokens?.refresh_token) {
      return res.status(400).json({ error: 'Seller not connected to eBay' });
    }

    const accessToken = await ensureValidToken(seller);

    // 2. Prepare Trading API Request
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <SellingSummary>
    <Include>true</Include>
  </SellingSummary>
  <DetailLevel>ReturnAll</DetailLevel>
  <Version>1173</Version>
</GetMyeBaySellingRequest>`;

    // 3. Call eBay Trading API
    const response = await axios.post(
      'https://api.ebay.com/ws/api.dll',
      xmlRequest,
      {
        headers: {
          'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1173',
          'Content-Type': 'text/xml'
        }
      }
    );

    // 4. Parse XML Response
    const result = await parseStringPromise(response.data, { explicitArray: false });

    if (result.GetMyeBaySellingResponse.Ack === 'Failure') {
      const errors = result.GetMyeBaySellingResponse.Errors;
      const errorMsg = Array.isArray(errors) ? errors[0].LongMessage : errors.LongMessage;
      throw new Error(`eBay API Error: ${errorMsg}`);
    }

    const summary = result.GetMyeBaySellingResponse.Summary;

    // Extract Relevant Limits
    const limits = {
      quantityLimitRemaining: summary?.QuantityLimitRemaining,
      amountLimitRemaining: summary?.AmountLimitRemaining?._, // currencyID is in attribute
      amountLimitCurrency: summary?.AmountLimitRemaining?.$?.currencyID,
      activeAuctionCount: summary?.ActiveAuctionCount,
      auctionSellingCount: summary?.AuctionSellingCount,
      totalSoldCount: summary?.TotalSoldCount,
      totalSoldValue: summary?.TotalSoldValue?._,
      totalSoldValueCurrency: summary?.TotalSoldValue?.$?.currencyID,
    };

    res.json({
      success: true,
      sellerId,
      limits,
      rawSummary: summary
    });

  } catch (error) {
    console.error('[Selling Summary] Error:', error.message);
    if (error.response) {
      console.error('[Selling Summary] eBay Response:', error.response.data);
    }
    res.status(500).json({
      error: 'Failed to fetch selling limits',
      details: error.response?.data || error.message
    });
  }
});

// ============================================
// END ITEM
// ============================================
router.post('/end-item', requireAuth, async (req, res) => {
  try {
    const { sellerId, itemId, endingReason = 'NotAvailable' } = req.body;

    if (!sellerId || !itemId) {
      return res.status(400).json({ error: 'Missing sellerId or itemId' });
    }

    // 1. Get Seller & Token
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    const accessToken = await ensureValidToken(seller);

    // 2. Prepare Trading API Request
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <EndingReason>${endingReason}</EndingReason>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</EndItemRequest>`;

    // 3. Call eBay Trading API
    const response = await axios.post(
      'https://api.ebay.com/ws/api.dll',
      xmlRequest,
      {
        headers: {
          'X-EBAY-API-CALL-NAME': 'EndItem',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1173',
          'Content-Type': 'text/xml'
        }
      }
    );

    // 4. Parse XML Response
    const result = await parseStringPromise(response.data, { explicitArray: false });

    if (result.EndItemResponse.Ack === 'Failure') {
      const errors = result.EndItemResponse.Errors;
      const errorMsg = Array.isArray(errors) ? errors[0].LongMessage : errors.LongMessage;
      throw new Error(`eBay API Error: ${errorMsg}`);
    }

    res.json({
      success: true,
      endTime: result.EndItemResponse.EndTime
    });

  } catch (error) {
    console.error('[End Item] Error:', error.message);
    if (error.response) {
      console.error('[End Item] eBay Response:', error.response.data);
    }
    res.status(500).json({
      error: 'Failed to end item',
      details: error.response?.data || error.message
    });
  }
});

// Export for optional external schedulers
export { sendPolicyMessage, processPendingPolicyMessages, getPolicyEligibilityDate };

// ============================================
// FEED UPLOAD SUCCESS STATS (aggregated day-wise by seller)
// GET /api/ebay/feed/upload-stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&sellerId=...
// ============================================
router.get('/feed/upload-stats', requireAuth, requirePageAccess('FeedUploadStats'), async (req, res) => {
  try {
    const { startDate, endDate, sellerId, country } = req.query;

    const matchStage = {
      status: { $in: ['COMPLETED', 'COMPLETED_WITH_ERROR'] },
      'uploadSummary.successCount': { $gt: 0 }
    };
    if (sellerId) matchStage.seller = new mongoose.Types.ObjectId(sellerId);
    
    // Handle country filtering: if US, include records without country field (old data)
    if (country) {
      if (country === 'US') {
        matchStage.$or = [
          { country: 'US' },
          { country: null },
          { country: { $exists: false } }
        ];
      } else {
        matchStage.country = country;
      }
    }
    
    if (startDate || endDate) {
      matchStage.creationDate = {};
      if (startDate) {
        // Convert IST date to UTC: subtract 5 hours 30 minutes (19800000 ms)
        // Parse as UTC to avoid local timezone interpretation
        const start = new Date(startDate + 'T00:00:00Z');
        matchStage.creationDate.$gte = new Date(start.getTime() - (5.5 * 60 * 60 * 1000));
      }
      if (endDate) {
        // Convert IST date to UTC: subtract 5 hours 30 minutes from end of day
        const end = new Date(endDate + 'T23:59:59.999Z');
        matchStage.creationDate.$lte = new Date(end.getTime() - (5.5 * 60 * 60 * 1000));
      }
    }

    const rows = await FeedUpload.aggregate([
      { $match: matchStage },
      // Add computed country field before grouping to handle null/missing
      {
        $addFields: {
          normalizedCountry: { $ifNull: ['$country', 'US'] }
        }
      },
      // Lookup seller to get username for grouping
      {
        $lookup: {
          from: 'sellers',
          localField: 'seller',
          foreignField: '_id',
          as: 'sellerDoc'
        }
      },
      { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'users',
          localField: 'sellerDoc.user',
          foreignField: '_id',
          as: 'userDoc'
        }
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: {
            sellerName: '$userDoc.username',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$creationDate', timezone: 'Asia/Kolkata' } },
            country: '$normalizedCountry'
          },
          sellerId: { $first: '$seller' },
          totalSuccess: { $sum: '$uploadSummary.successCount' },
          totalFailure: { $sum: { $ifNull: ['$uploadSummary.failureCount', 0] } },
          taskCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': -1, '_id.sellerName': 1 } }
    ]);

    const result = rows.map(r => ({
      sellerId: r.sellerId,
      sellerName: r._id.sellerName,
      date: r._id.date,
      country: r._id.country || 'US',
      totalSuccess: r.totalSuccess,
      totalFailure: r.totalFailure,
      taskCount: r.taskCount
    }));

    res.json(result);
  } catch (err) {
    console.error('[Feed Upload Stats] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch feed upload stats' });
  }
});
// ============================================
// SELLER FUNDS SUMMARY (All connected sellers)
// ============================================
router.get('/seller-funds-summary', requireAuth, requirePageAccess('SellerFunds'), async (req, res) => {
  try {
    // Get all sellers with eBay tokens
    const sellers = await Seller.find({
      'ebayTokens.access_token': { $exists: true, $ne: null },
      'ebayTokens.refresh_token': { $exists: true, $ne: null }
    }).populate('user', 'username email');

    const results = [];

    for (const seller of sellers) {
      const sellerName = seller.user?.username || seller._id.toString();
      try {
        const accessToken = await ensureValidToken(seller);
        const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller);

        // Optional eBay wallet snapshot (used only for fallback / currency hints)
        let ebaySnapshot = null;
        try {
          const summaryRes = await axios.get('https://apiz.ebay.com/sell/finances/v1/seller_funds_summary', {
            headers: financesApiHeaders(accessToken, marketplaceId)
          });
          ebaySnapshot = summaryRes.data || null;
        } catch (sumErr) {
          if (sumErr.response?.status !== 204) {
            throw sumErr;
          }
        }

        const [procTx, holdTx] = await Promise.all([
          fetchFinancesTransactionsAllPages(accessToken, marketplaceId, 'transactionStatus:{FUNDS_PROCESSING}'),
          fetchFinancesTransactionsAllPages(accessToken, marketplaceId, 'transactionStatus:{FUNDS_ON_HOLD}')
        ]);

        const procAgg = sumOrderMapAmounts(mergeFinancesTransactionsByOrder(procTx));
        const holdAgg = sumOrderMapAmounts(mergeFinancesTransactionsByOrder(holdTx));

        let availAgg = { sum: 0, currency: procAgg.currency || holdAgg.currency || 'USD' };
        let availableSource = 'transactions';
        try {
          const availTx = await fetchFinancesTransactionsAllPages(
            accessToken,
            marketplaceId,
            'transactionStatus:{FUNDS_AVAILABLE}'
          );
          availAgg = sumOrderMapAmounts(mergeFinancesTransactionsByOrder(availTx));
        } catch {
          availableSource = 'ebay_summary';
          const a = ebaySnapshot?.availableFunds;
          availAgg = {
            sum: parseFloat(a?.value || 0) || 0,
            currency: a?.currency || procAgg.currency || holdAgg.currency || 'USD'
          };
        }

        const cur = availAgg.currency || procAgg.currency || holdAgg.currency || 'USD';
        const availNum = parseFloat(availAgg.sum) || 0;
        const procNum = parseFloat(procAgg.sum) || 0;
        const holdNum = parseFloat(holdAgg.sum) || 0;
        const totalNum = parseFloat((availNum + procNum + holdNum).toFixed(2));

        results.push({
          sellerId: seller._id,
          sellerName,
          financesMarketplaceId: marketplaceId,
          totalFunds: moneyFromNumber(totalNum, cur),
          availableFunds: moneyFromNumber(availNum, cur),
          processingFunds: moneyFromNumber(procNum, cur),
          fundsOnHold: moneyFromNumber(holdNum, cur),
          fundsAlignment: {
            availableSource,
            processingSource: 'transactions',
            onHoldSource: 'transactions',
            totalSource: 'sum_of_buckets'
          },
          error: null
        });
      } catch (err) {
        console.error(`[Seller Funds] Error for ${sellerName}:`, err.response?.data || err.message);
        results.push({
          sellerId: seller._id,
          sellerName,
          financesMarketplaceId: resolvePrimaryFinancesMarketplaceId(seller),
          totalFunds: null,
          availableFunds: null,
          processingFunds: null,
          fundsOnHold: null,
          error: err.response?.data?.errors?.[0]?.message || err.message
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('[Seller Funds Summary] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch seller funds summary' });
  }
});

// ============================================
// PROCESSING TRANSACTIONS for a specific seller
// ============================================
router.get('/processing-transactions/:sellerId', requireAuth, requirePageAccess('SellerFunds'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId).populate('user', 'username');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.ebayTokens?.access_token) return res.status(400).json({ error: 'Seller not connected to eBay' });

    const accessToken = await ensureValidToken(seller);
    const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);
    const sellerName = (seller.user?.username || '').toLowerCase();

    // Available date rules per seller
    // 'txn+Xd' = X days after transaction date
    // 'delivery+Xd' = X days after delivery date (from local order)
    const availableDateRules = {
      'actus_corp': { base: 'txn', days: 1 },
      'truxi': { base: 'txn', days: 12 },
      'raveoli_cart': { base: 'txn', days: 1 },
      'phoenix': { base: 'delivery', days: 1 },
      'rolexstore': { base: 'txn', days: 1 },
      'mindverge': { base: 'txn', days: 1 },
      'dominex': { base: 'txn', days: 2 },
      'brightvision': { base: 'txn', days: 1 },
      'elevate': { base: 'txn', days: 1 },
      'techmania': { base: 'txn', days: 2 },
      'mind_matrix': { base: 'txn', days: 15 },
      'capitalcrest': { base: 'txn', days: 1 },
      'ultimate': { base: 'txn', days: 15 },
      'valueventure': { base: 'delivery', days: 3 },
      'techvista': { base: 'txn', days: 15 },
      'edgevolution': { base: 'delivery', days: 1 },
      'sanddbro': { base: 'delivery', days: 1 },
    };

    const rule = availableDateRules[sellerName] || { base: 'txn', days: 1 }; // default 24hrs after txn

    let allTransactions = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get('https://apiz.ebay.com/sell/finances/v1/transaction', {
        headers: financesApiHeaders(accessToken, marketplaceId),
        params: {
          filter: 'transactionStatus:{FUNDS_PROCESSING}',
          limit,
          offset
        }
      });

      const transactions = response.data?.transactions || [];
      allTransactions = allTransactions.concat(transactions);

      if (transactions.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    // Extract order-level info
    const orderMap = new Map();
    for (const txn of allTransactions) {
      const orderId = txn.orderId || null;
      const orderRef = txn.references?.find(r => r.referenceType === 'ORDER_ID');
      const effectiveOrderId = orderId || orderRef?.referenceId || txn.transactionId;

      if (!orderMap.has(effectiveOrderId)) {
        orderMap.set(effectiveOrderId, {
          orderId: effectiveOrderId,
          amount: parseFloat(txn.amount?.value || 0),
          currency: txn.amount?.currency || 'USD',
          transactionDate: txn.transactionDate,
          transactionType: txn.transactionType,
          transactionStatus: txn.transactionStatus,
          buyer: txn.buyer?.username || 'N/A',
          payoutId: txn.payoutId || null
        });
      } else {
        const existing = orderMap.get(effectiveOrderId);
        existing.amount += parseFloat(txn.amount?.value || 0);
      }
    }

    // Get local orders for delivery dates (needed for delivery-based rules)
    const orderIds = [...orderMap.keys()];
    const localOrders = await Order.find({ orderId: { $in: orderIds }, seller: seller._id })
      .select('orderId estimatedDelivery')
      .lean();

    const localOrderMap = {};
    for (const lo of localOrders) {
      localOrderMap[lo.orderId] = lo;
    }

    // Calculate available date based on seller rule
    const calcAvailableDate = (txnDate, orderId) => {
      let baseDate;
      if (rule.base === 'delivery') {
        const local = localOrderMap[orderId];
        if (local?.estimatedDelivery) {
          baseDate = new Date(local.estimatedDelivery);
        } else {
          // Fallback to transaction date if no delivery date found
          baseDate = txnDate ? new Date(txnDate) : null;
        }
      } else {
        baseDate = txnDate ? new Date(txnDate) : null;
      }
      if (!baseDate) return null;
      const result = new Date(baseDate);
      result.setDate(result.getDate() + rule.days);
      return result.toISOString();
    };

    const result = [...orderMap.values()].map(o => {
      const local = localOrderMap[o.orderId];
      return {
        ...o,
        amount: parseFloat(o.amount.toFixed(2)),
        availableDate: calcAvailableDate(o.transactionDate, o.orderId),
        deliveryDate: local?.estimatedDelivery || null
      };
    });

    // Sort by transaction date descending
    result.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

    res.json({
      sellerId: seller._id,
      sellerName: seller.user?.username || seller._id.toString(),
      financesMarketplaceId: marketplaceId,
      availableDateRule: rule,
      totalProcessingTransactions: result.length,
      transactions: result
    });
  } catch (err) {
    console.error('[Processing Transactions] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch processing transactions' });
  }
});

// ============================================
// AVAILABLE TRANSACTIONS for a specific seller
// ============================================
router.get('/available-transactions/:sellerId', requireAuth, requirePageAccess('SellerFunds'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId).populate('user', 'username');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.ebayTokens?.access_token) return res.status(400).json({ error: 'Seller not connected to eBay' });

    const accessToken = await ensureValidToken(seller);
    const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);

    const lookbackDays = Math.max(1, Math.min(90, parseInt(req.query.lookbackDays || '30', 10) || 30));
    const now = new Date();
    const fromDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const fromIso = fromDate.toISOString();
    const nowIso = now.toISOString();

    let allTransactions = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;

    const requestPage = async (withStatusFilter, currentOffset) => {
      const params = { limit, offset: currentOffset };
      if (withStatusFilter) {
        params.filter = `transactionStatus:{FUNDS_AVAILABLE},transactionDate:[${fromIso}..${nowIso}]`;
      } else {
        params.filter = `transactionDate:[${fromIso}..${nowIso}]`;
      }
      const response = await axios.get('https://apiz.ebay.com/sell/finances/v1/transaction', {
        headers: financesApiHeaders(accessToken, marketplaceId),
        params
      });
      return response.data?.transactions || [];
    };

    let useStatusFilter = true;
    try {
      while (hasMore) {
        const transactions = await requestPage(useStatusFilter, offset);
        allTransactions = allTransactions.concat(transactions);

        if (transactions.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
    } catch (err) {
      // Some eBay accounts reject FUNDS_AVAILABLE status filter.
      // Fallback: fetch without status filter and filter rows in-memory.
      const firstError = err?.response?.data || err?.message;
      console.warn('[Available Transactions] Status-filter request failed; retrying without filter:', firstError);
      allTransactions = [];
      offset = 0;
      hasMore = true;
      useStatusFilter = false;

      while (hasMore) {
        const transactions = await requestPage(useStatusFilter, offset);
        allTransactions = allTransactions.concat(transactions);

        if (transactions.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
    }

    if (!useStatusFilter) {
      // Broad fallback when eBay doesn't accept FUNDS_AVAILABLE filter:
      // remove obvious non-available buckets and keep completed/settled style rows.
      allTransactions = allTransactions.filter((txn) => {
        const status = String(txn?.transactionStatus || '').toUpperCase();
        if (!status) return false;
        if (status.includes('ON_HOLD')) return false;
        if (status.includes('PROCESSING')) return false;
        return true;
      });
    }

    // If status filter returned zero rows but seller has available balance,
    // retry with broad fallback to avoid empty-table false negatives.
    if (useStatusFilter && allTransactions.length === 0) {
      let retryRows = [];
      let retryOffset = 0;
      let retryHasMore = true;
      while (retryHasMore) {
        const rows = await requestPage(false, retryOffset);
        retryRows = retryRows.concat(rows);
        if (rows.length < limit) retryHasMore = false;
        else retryOffset += limit;
      }
      allTransactions = retryRows.filter((txn) => {
        const status = String(txn?.transactionStatus || '').toUpperCase();
        if (!status) return false;
        if (status.includes('ON_HOLD')) return false;
        if (status.includes('PROCESSING')) return false;
        return true;
      });
    }

    // Hard date clamp in case API returns rows outside requested window.
    allTransactions = allTransactions.filter((txn) => {
      if (!txn?.transactionDate) return false;
      const t = new Date(txn.transactionDate).getTime();
      return t >= fromDate.getTime() && t <= now.getTime();
    });

    const normalizeSignedNet = (txn) => {
      const amount = Number(txn?.amount?.value);
      const fee = Number(
        txn?.totalFeeBasisAmount?.value ??
        txn?.feeAmount?.value ??
        txn?.fee?.value ??
        0
      );
      const fundsImpact = Number(
        txn?.totalFundsImpact?.value ??
        txn?.fundsImpact?.value ??
        txn?.netAmount?.value
      );

      let net = Number.isFinite(fundsImpact)
        ? fundsImpact
        : (Number.isFinite(amount) ? amount : 0) + (Number.isFinite(fee) ? fee : 0);

      const type = String(txn?.transactionType || '').toLowerCase();
      const memo = String(txn?.transactionMemo || '').toLowerCase();
      const status = String(txn?.transactionStatus || '').toLowerCase();
      const isPromoted = type.includes('promoted') || memo.includes('promoted listing');
      const isRefund = type.includes('refund') || memo.includes('refund') || status.includes('refunded');

      // eBay available page shows promoted/refund effects as negative net.
      if ((isPromoted || isRefund) && net > 0) {
        net = -net;
      }
      if (isPromoted && net === 0 && Number.isFinite(fee) && fee !== 0) {
        net = fee; // fee-only promoted lines
      }

      return parseFloat(net.toFixed(2));
    };

    // Keep line-level rows (like eBay UI) so fee/refund entries remain visible.
    const result = allTransactions.map((txn) => {
      const orderRef = txn.references?.find(r => r.referenceType === 'ORDER_ID');
      const effectiveOrderId = txn.orderId || orderRef?.referenceId || txn.transactionId;
      const net = normalizeSignedNet(txn);
      const currency = txn.amount?.currency || 'USD';
      return {
        orderId: effectiveOrderId,
        net,
        currency,
        transactionDate: txn.transactionDate,
        buyer: txn.buyer?.username || 'N/A',
        transactionMemo: txn.transactionMemo || null,
        transactionStatus: txn.transactionStatus || null,
        transactionType: txn.transactionType || null,
      };
    });

    result.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

    res.json({
      sellerId: seller._id,
      sellerName: seller.user?.username || seller._id.toString(),
      financesMarketplaceId: marketplaceId,
      lookbackDays,
      totalAvailableTransactions: result.length,
      transactions: result
    });
  } catch (err) {
    console.error('[Available Transactions] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch available transactions' });
  }
});

// ============================================
// UPCOMING PAYOUTS for a specific seller
// ============================================
router.get('/upcoming-payouts/:sellerId', requireAuth, requirePageAccess('SellerFunds'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId).populate('user', 'username');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.ebayTokens?.access_token) return res.status(400).json({ error: 'Seller not connected to eBay' });

    const accessToken = await ensureValidToken(seller);
    const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);

    // Fetch upcoming and recent payouts
    const payoutsRes = await axios.get('https://apiz.ebay.com/sell/finances/v1/payout', {
      headers: financesApiHeaders(accessToken, marketplaceId),
      params: {
        sort: '-payoutDate',
        limit: 50
      }
    });

    const allPayouts = payoutsRes.data?.payouts || [];

    // Filter for upcoming and recent payouts (INITIATED, or recent SUCCEEDED within 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const payouts = allPayouts
      .filter(p => {
        if (p.payoutStatus === 'INITIATED') return true;
        if (p.payoutStatus === 'SUCCEEDED' && p.payoutDate) {
          const payoutDate = new Date(p.payoutDate);
          return payoutDate >= thirtyDaysAgo;
        }
        return false;
      })
      .map(p => ({
        payoutId: p.payoutId,
        payoutDate: p.payoutDate,
        payoutStatus: p.payoutStatus,
        amount: p.amount || { value: '0.00', currency: 'USD' },
        lastAttemptedPayoutDate: p.lastAttemptedPayoutDate,
        payoutInstrument: p.payoutInstrument
      }))
      .sort((a, b) => new Date(b.payoutDate) - new Date(a.payoutDate));

    res.json({
      sellerId: seller._id,
      sellerName: seller.user?.username || seller._id.toString(),
      financesMarketplaceId: marketplaceId,
      totalPayouts: payouts.length,
      payouts
    });
  } catch (err) {
    console.error('[Upcoming Payouts] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch upcoming payouts' });
  }
});

/**
 * Aggregated SUCCEEDED payouts (last 30 days) for Payoneer sheet — same Finances API + window as
 * Seller Funds → "Recently Completed Payouts", across all token-connected sellers.
 */
router.get('/payoneer-recent-completed-feed', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
  try {
    const bankAccounts = await BankAccount.find().lean();
    const sellers = await Seller.find({
      'ebayTokens.access_token': { $exists: true, $ne: null },
      'ebayTokens.refresh_token': { $exists: true, $ne: null }
    }).populate('user', 'username email');

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const bankForSeller = (seller) => {
      const username = (seller.user?.username || seller.user?.email || '').toLowerCase();
      if (!username) return { bankId: null, bankName: null };
      for (const b of bankAccounts) {
        if (!b.sellers?.trim()) continue;
        const tokens = b.sellers.split(/[,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
        if (tokens.some((t) => username === t || username.includes(t))) {
          return { bankId: b._id, bankName: b.name };
        }
      }
      return { bankId: null, bankName: null };
    };

    const rows = [];

    for (const seller of sellers) {
      try {
        const accessToken = await ensureValidToken(seller);
        const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller);
        const payoutsRes = await axios.get('https://apiz.ebay.com/sell/finances/v1/payout', {
          headers: financesApiHeaders(accessToken, marketplaceId),
          params: { sort: '-payoutDate', limit: 50 }
        });
        const allPayouts = payoutsRes.data?.payouts || [];

        for (const p of allPayouts) {
          if (p.payoutStatus !== 'SUCCEEDED' || !p.payoutDate) continue;
          const payoutDate = new Date(p.payoutDate);
          if (payoutDate < thirtyDaysAgo) continue;

          const { bankId, bankName } = bankForSeller(seller);
          rows.push({
            payoutId: p.payoutId,
            payoutDate: p.payoutDate,
            payoutStatus: p.payoutStatus,
            amount: parseFloat(p.amount?.value || 0),
            currency: p.amount?.currency || 'USD',
            sellerId: seller._id,
            sellerName: seller.user?.username || seller.user?.email || seller._id.toString(),
            suggestedBankAccountId: bankId,
            suggestedBankName: bankName,
            financesMarketplaceId: marketplaceId
          });
        }
      } catch (e) {
        console.warn('[payoneer-recent-completed-feed] seller', seller._id, e.response?.data || e.message);
      }
    }

    rows.sort((a, b) => new Date(b.payoutDate) - new Date(a.payoutDate));

    res.json({ rows, total: rows.length });
  } catch (err) {
    console.error('[payoneer-recent-completed-feed]', err);
    res.status(500).json({ error: err.message || 'Failed to load recent payouts' });
  }
});

// ============================================
// PAYOUT TRANSACTIONS for a specific payout
// ============================================
router.get('/payout-transactions/:sellerId/:payoutId', requireAuth, requirePageAccess('SellerFunds'), async (req, res) => {
  try {
    const { sellerId, payoutId } = req.params;
    const seller = await Seller.findById(sellerId).populate('user', 'username');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.ebayTokens?.access_token) return res.status(400).json({ error: 'Seller not connected to eBay' });
    if (!payoutId) return res.status(400).json({ error: 'Missing payoutId' });

    const accessToken = await ensureValidToken(seller);
    const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);

    let allTransactions = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get('https://apiz.ebay.com/sell/finances/v1/transaction', {
        headers: financesApiHeaders(accessToken, marketplaceId),
        params: {
          filter: `payoutId:{${payoutId}}`,
          limit,
          offset
        }
      });

      const rows = response.data?.transactions || [];
      allTransactions = allTransactions.concat(rows);
      if (rows.length < limit) hasMore = false;
      else offset += limit;
    }

    const normalizeNet = (txn) => {
      const amount = Number(txn?.amount?.value);
      const fee = Number(
        txn?.totalFeeBasisAmount?.value ??
        txn?.feeAmount?.value ??
        txn?.fee?.value ??
        0
      );
      const fundsImpact = Number(
        txn?.totalFundsImpact?.value ??
        txn?.fundsImpact?.value ??
        txn?.netAmount?.value
      );
      let net = Number.isFinite(fundsImpact)
        ? fundsImpact
        : (Number.isFinite(amount) ? amount : 0) + (Number.isFinite(fee) ? fee : 0);

      const memo = String(txn?.transactionMemo || '').toLowerCase();
      const type = String(txn?.transactionType || '').toLowerCase();
      if ((memo.includes('promoted listing') || type.includes('promoted') || type.includes('refund')) && net > 0) {
        net = -net;
      }
      return parseFloat(net.toFixed(2));
    };

    const transactions = allTransactions.map((txn) => {
      const orderRef = txn.references?.find(r => r.referenceType === 'ORDER_ID');
      const effectiveOrderId = txn.orderId || orderRef?.referenceId || txn.transactionId;
      return {
        orderId: effectiveOrderId,
        net: normalizeNet(txn),
        currency: txn.amount?.currency || 'USD',
        buyer: txn.buyer?.username || 'N/A',
        transactionDate: txn.transactionDate,
        transactionMemo: txn.transactionMemo || null,
      };
    }).sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

    return res.json({
      sellerId: seller._id,
      sellerName: seller.user?.username || seller._id.toString(),
      financesMarketplaceId: marketplaceId,
      payoutId,
      totalTransactions: transactions.length,
      transactions
    });
  } catch (err) {
    console.error('[Payout Transactions] Error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to fetch payout transactions' });
  }
});

// ============================================
// ON HOLD TRANSACTIONS for a specific seller
// ============================================
router.get('/onhold-transactions/:sellerId', requireAuth, requirePageAccess('SellerFunds'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId).populate('user', 'username');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.ebayTokens?.access_token) return res.status(400).json({ error: 'Seller not connected to eBay' });

    const accessToken = await ensureValidToken(seller);
    const marketplaceId = resolvePrimaryFinancesMarketplaceId(seller, req.query.marketplace);

    let allTransactions = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get('https://apiz.ebay.com/sell/finances/v1/transaction', {
        headers: financesApiHeaders(accessToken, marketplaceId),
        params: {
          filter: 'transactionStatus:{FUNDS_ON_HOLD}',
          limit,
          offset
        }
      });

      const transactions = response.data?.transactions || [];
      allTransactions = allTransactions.concat(transactions);

      if (transactions.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    // Extract order-level info
    const orderMap = new Map();
    for (const txn of allTransactions) {
      const orderId = txn.orderId || null;
      const orderRef = txn.references?.find(r => r.referenceType === 'ORDER_ID');
      const effectiveOrderId = orderId || orderRef?.referenceId || txn.transactionId;

      if (!orderMap.has(effectiveOrderId)) {
        orderMap.set(effectiveOrderId, {
          orderId: effectiveOrderId,
          amount: parseFloat(txn.amount?.value || 0),
          currency: txn.amount?.currency || 'USD',
          transactionDate: txn.transactionDate,
          buyer: txn.buyer?.username || 'N/A',
          transactionMemo: txn.transactionMemo || null
        });
      } else {
        const existing = orderMap.get(effectiveOrderId);
        existing.amount += parseFloat(txn.amount?.value || 0);
      }
    }

    const result = [...orderMap.values()].map(o => ({
      ...o,
      amount: parseFloat(o.amount.toFixed(2))
    }));

    result.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

    res.json({
      sellerId: seller._id,
      sellerName: seller.user?.username || seller._id.toString(),
      financesMarketplaceId: marketplaceId,
      totalOnHoldTransactions: result.length,
      transactions: result
    });
  } catch (err) {
    console.error('[On Hold Transactions] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch on hold transactions' });
  }
});

// ============================================
// AUTO-COMPATIBILITY — Fully automated fitment
// ============================================

// --- Server-side helpers (mirrored from client CompatibilityDashboard.jsx) ---
const MAKE_ALIASES = {
  'chevy': 'Chevrolet', 'chev': 'Chevrolet', 'vw': 'Volkswagen',
  'volkswagon': 'Volkswagen', 'merc': 'Mercury', 'benz': 'Mercedes-Benz',
  'mercedes': 'Mercedes-Benz', 'alfa': 'Alfa Romeo', 'land rover': 'Land Rover',
  'landrover': 'Land Rover', 'range rover': 'Land Rover',
};
const resolveMake = (aiMake) => {
  if (!aiMake) return aiMake;
  return MAKE_ALIASES[aiMake.trim().toLowerCase()] || aiMake;
};
const resolveModel = (aiMake, aiModel) => {
  if (!aiModel) return aiModel;
  const makeLower = (aiMake || '').toLowerCase();
  const modelLower = aiModel.toLowerCase();
  if (makeLower === 'honda' && modelLower.includes('prologue')) return 'Prologue';
  if (makeLower === 'honda' && modelLower.includes('fit')) return 'Fit';
  if (makeLower === 'ram' && modelLower.includes('classic')) return 'Classic';
  if (makeLower === 'tesla') {
    if (/model\s*3/i.test(aiModel)) return '3';
    if (/model\s*y/i.test(aiModel)) return 'Y';
  }
  if (makeLower === 'jeep' && /wrangler\s+j[a-z]/i.test(aiModel)) return 'Wrangler';
  if (makeLower === 'toyota' && modelLower.includes('land cruiser')) return 'Land Cruiser';
  if (modelLower.includes('silverado') && !/\d{4}/.test(modelLower)) return 'Silverado 1500';
  if (makeLower === 'bmw' && modelLower.includes('3 series')) return '330i';
  return aiModel;
};
const resolveModelWithYear = (make, model, startYear, endYear) => {
  const makeLower = (make || '').toLowerCase();
  const modelNorm = (model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (makeLower === 'ford' && modelNorm === 'f250') {
    return Number(endYear) && Number(endYear) < 1999 ? 'F-250' : 'F-250 Super Duty';
  }
  return model;
};
const clampYearRange = (make, model, startYear, endYear) => {
  if (!startYear || !endYear) return { startYear, endYear };
  const makeLower = (make || '').toLowerCase();
  let start = Number(startYear), end = Number(endYear);
  if (makeLower === 'dodge' && /ram\s*1500/i.test(model)) {
    if (start < 1994) start = 1994;
    if (end > 2014) end = 2014;
    return { startYear: String(start), endYear: String(end) };
  }
  if (makeLower === 'ram') {
    const numMatch = model.match(/(\d{4})/);
    if (numMatch && Number(numMatch[1]) >= 1500) {
      if (start < 2011) start = 2011;
      if (end > 2026) end = 2026;
      return { startYear: String(start), endYear: String(end) };
    }
  }
  return { startYear, endYear };
};
const normModel = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fuzzyMatchModel = (aiModel, options) => {
  if (!aiModel || !options?.length) return null;
  if (options.includes(aiModel)) return aiModel;
  const normAi = normModel(aiModel);
  return options.find(opt => normModel(opt) === normAi) || null;
};

// Lazy OpenAI singleton for auto-compat (reuses the fitment key)
let _autoOpenai = null;
function getAutoOpenAI() {
  if (!_autoOpenai) {
    _autoOpenai = new OpenAI({ apiKey: process.env.OPENAI_FITMENT_API_KEY });
  }
  return _autoOpenai;
}

// Helper: call OpenAI to extract fitment (same prompt as ai.js)
async function aiSuggestFitment(title, description) {
  const BOILERPLATE_SIGNALS = [
    'Top Seller', 'Fast, Reliable Shipping', 'Always Free', '1-Day Processing',
    'Questions?', "We're Happy to Help", 'Buy with Confidence',
    'Ship from USA', 'Free & Fast Shipping', '30 Days Return',
    'PLEASE VISIT OUR STORE', 'Thank you for shopping',
    'All communication is handled', 'eBay\'s messaging platform',
    'Orders ship within', 'carefully inspected before shipping',
  ];
  let rawText = (description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  let cutAt = rawText.length;
  for (const signal of BOILERPLATE_SIGNALS) {
    const idx = rawText.indexOf(signal);
    if (idx !== -1 && idx < cutAt) cutAt = idx;
  }
  const cleanDescription = rawText.slice(0, cutAt).trim().slice(0, 500);

  const prompt = `You are an automotive parts expert. Extract all vehicle fitments from this eBay listing.

IMPORTANT: Focus PRIMARILY on the Description for extracting fitment data. The Title may contain SEO keywords that are not actual fitment info. Use the Title only as supplementary context when the Description lacks detail.

Description: ${cleanDescription}
Title: ${title || ''}

Return ONLY a valid JSON array (no markdown, no explanation) where each object has:
- "make": string (e.g. "Toyota")
- "model": string (e.g. "Camry")
- "startYear": string or null (e.g. "2010")
- "endYear": string or null (same as startYear if only one year)

Rules:
- If a year range is EXPLICITLY stated like "2008-2013", use startYear="2008" endYear="2013"
- If a single year is EXPLICITLY stated like "2005", use startYear="2005" endYear="2005"
- CRITICAL: If NO year is explicitly mentioned in the description or title for a fitment, you MUST set startYear and endYear to null. Do NOT guess, infer, or assume years based on the vehicle generation or your knowledge.
- Only include make and model entries where you are confident based on the text
- Do not invent or assume any data not explicitly present in the description or title
- Use the most specific model name mentioned (e.g. "F-150" not just "F-Series")
- If the description lists a compatibility/fitment table, extract all entries from it

Example output: [{"make":"Lexus","model":"IS F","startYear":"2008","endYear":"2013"},{"make":"Toyota","model":"Camry","startYear":null,"endYear":null}]`;

  const completion = await getAutoOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 500
  });
  const raw = completion.choices[0]?.message?.content?.trim() || '[]';
  const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  let allFitments = [];
  try {
    allFitments = JSON.parse(cleaned);
    if (!Array.isArray(allFitments)) allFitments = [];
  } catch { allFitments = []; }

  if (allFitments.length === 0) return { make: null, model: null, startYear: null, endYear: null, allFitments: [] };
  const best = allFitments.reduce((prev, curr) => {
    const prevGap = Number(prev.endYear) - Number(prev.startYear);
    const currGap = Number(curr.endYear) - Number(curr.startYear);
    return currGap > prevGap ? curr : prev;
  });
  return { make: best.make, model: best.model, startYear: best.startYear, endYear: best.endYear, allFitments };
}

// Helper: fetch eBay compatibility property values (reuses the /compatibility/values logic)
async function fetchCompatValues(token, propertyName, constraints) {
  let filterParam = '';
  if (constraints && constraints.length > 0) {
    filterParam = constraints.map(c => `${c.name}:${String(c.value).replace(/,/g, '\\,')}`).join(',');
  }
  const cacheKey = propertyName + (constraints?.length ? '_' + constraints.map(c => `${c.name}_${c.value}`).sort().join('_') : '');
  const cachedData = await FitmentCache.findOne({ cacheKey });
  if (cachedData) return cachedData.values;

  const response = await axios.get(
    'https://api.ebay.com/commerce/taxonomy/v1/category_tree/100/get_compatibility_property_values',
    {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
      params: { category_id: '33559', compatibility_property: propertyName, filter: filterParam || undefined }
    }
  );
  const values = (response.data.compatibilityPropertyValues || []).map(item => item.value);
  if (values.length > 0) {
    const isLongLived = ['Make', 'Model', 'Year'].includes(propertyName);
    const ttlMs = isLongLived ? 60 * 24 * 60 * 60 * 1000 : 10 * 24 * 60 * 60 * 1000;
    await FitmentCache.findOneAndUpdate({ cacheKey }, { cacheKey, values, lastUpdated: new Date(), expireAt: new Date(Date.now() + ttlMs) }, { upsert: true });
  }
  return values;
}

// POST /api/ebay/auto-compatibility
// Body: { sellerId, targetDate (YYYY-MM-DD), itemLimit (0 = no limit) }
router.post('/auto-compatibility', requireAuth, async (req, res) => {
  const { sellerId, targetDate, itemLimit = 0 } = req.body;
  if (!sellerId || !targetDate) {
    return res.status(400).json({ error: 'sellerId and targetDate are required' });
  }

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // Find listings for this seller on the target date that have NO compatibility data
    const dayStart = new Date(targetDate + 'T00:00:00Z');
    const dayEnd = new Date(targetDate + 'T23:59:59.999Z');
    const query = {
      seller: sellerId,
      listingStatus: 'Active',
      startTime: { $gte: dayStart, $lte: dayEnd },
      $or: [
        { compatibility: { $exists: false } },
        { compatibility: { $size: 0 } },
        { compatibility: null }
      ]
    };

    let listings = await Listing.find(query).sort({ startTime: 1 }).lean();
    if (itemLimit > 0) listings = listings.slice(0, itemLimit);

    if (listings.length === 0) {
      return res.json({ success: true, message: 'No listings without compatibility found for this date.', batchId: null });
    }

    // Create batch document
    const batch = await AutoCompatibilityBatch.create({
      seller: sellerId,
      triggeredBy: req.user.userId,
      targetDate,
      itemLimit: itemLimit || 0,
      sourceItemIds: listings.map(listing => listing.itemId),
      totalListings: listings.length,
      runnerId: RUNNER_ID,
      status: 'running',
      startedAt: new Date()
    });

    // Respond immediately with batchId
    res.json({ success: true, batchId: batch._id, totalListings: listings.length });

    processAutoCompatibilityBatch(batch._id).catch(err => {
      console.error(`[AutoCompat] Failed to start background processing for batch ${batch._id}:`, err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ebay/auto-compatibility-status/bulk — lightweight bulk status for All-Sellers dashboard
// Returns only the fields needed for the cards (no items array)
router.post('/auto-compatibility-status/bulk', requireAuth, async (req, res) => {
  try {
    const { batchIds } = req.body;
    if (!Array.isArray(batchIds) || batchIds.length === 0) return res.json({ batches: {} });
    const docs = await AutoCompatibilityBatch.find({ _id: { $in: batchIds } })
      .select('status totalListings processedCount needsManualCount successCount warningCount ebayErrorCount aiFailedCount manualReviewDone currentItemTitle')
      .lean();
    const batches = {};
    docs.forEach(b => { batches[String(b._id)] = b; });
    res.json({ batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/auto-compatibility-status/:batchId
router.get('/auto-compatibility-status/:batchId', requireAuth, async (req, res) => {
  try {
    const batch = await AutoCompatibilityBatch.findById(req.params.batchId)
      .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
      .lean();
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // Skip fetching items while the batch is still running — the live progress UI only needs
    // counts/currentStep. Items are fetched once the batch completes (avoids growing payload each poll).
    let items = [];
    if (batch.status !== 'running') {
      const newItems = await AutoCompatibilityBatchItem.find({ batchId: req.params.batchId })
        .select('-compatibilityList')
        .lean();
      // Backward compat: old batches stored items[] embedded in the batch document
      items = newItems.length > 0 ? newItems : (batch.items || []).map(({ compatibilityList, ...rest }) => rest);
    }
    res.json({ ...batch, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/auto-compatibility-batch/:batchId — Full batch with compat lists (for manual review)
router.get('/auto-compatibility-batch/:batchId', requireAuth, async (req, res) => {
  try {
    const [batch, newItems] = await Promise.all([
      AutoCompatibilityBatch.findById(req.params.batchId)
        .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
        .lean(),
      AutoCompatibilityBatchItem.find({ batchId: req.params.batchId }).lean(),
    ]);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    // Backward compat: old batches stored items[] embedded in the batch document
    const items = newItems.length > 0 ? newItems : (batch.items || []);
    res.json({ ...batch, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/auto-compatibility-batches — History of auto-compat batches
router.get('/auto-compatibility-batches', requireAuth, async (req, res) => {
  try {
    const { sellerId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (sellerId) filter.seller = sellerId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.manualReviewDone === 'true') filter.manualReviewDone = true;
    if (req.query.triggeredBy) filter.triggeredBy = req.query.triggeredBy;
    if (req.query.reviewedBy) filter.reviewedBy = req.query.reviewedBy;
    if (req.query.listingDate) {
      // Exact listing date match (overrides dateFrom/dateTo)
      filter.targetDate = req.query.listingDate;
    } else if (req.query.dateFrom || req.query.dateTo) {
      filter.targetDate = {};
      if (req.query.dateFrom) filter.targetDate.$gte = req.query.dateFrom;
      if (req.query.dateTo) filter.targetDate.$lte = req.query.dateTo;
    }
    // Run On (createdAt) filter — IST-aware: IST = UTC+5:30
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    if (req.query.runOnDate) {
      const d = new Date(req.query.runOnDate + 'T00:00:00.000Z');
      filter.createdAt = {
        $gte: new Date(d.getTime() - IST_OFFSET_MS),
        $lt: new Date(d.getTime() - IST_OFFSET_MS + 86400000),
      };
    } else if (req.query.runOnFrom || req.query.runOnTo) {
      filter.createdAt = {};
      if (req.query.runOnFrom) {
        const d = new Date(req.query.runOnFrom + 'T00:00:00.000Z');
        filter.createdAt.$gte = new Date(d.getTime() - IST_OFFSET_MS);
      }
      if (req.query.runOnTo) {
        const d = new Date(req.query.runOnTo + 'T00:00:00.000Z');
        filter.createdAt.$lt = new Date(d.getTime() - IST_OFFSET_MS + 86400000);
      }
    }
    const total = await AutoCompatibilityBatch.countDocuments(filter);
    const batches = await AutoCompatibilityBatch.find(filter)
      .select('-items')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('triggeredBy', 'username')
      .populate('reviewedBy', 'username')
      .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
      .lean();
    res.json({ batches, total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ebay/auto-compatibility-batch/:batchId/review-summary — Save manual review action counts
router.patch('/auto-compatibility-batch/:batchId/review-summary', requireAuth, async (req, res) => {
  try {
    const { correctCount, skippedCount, endedCount } = req.body;
    const batch = await AutoCompatibilityBatch.findByIdAndUpdate(
      req.params.batchId,
      {
        $inc: {
          manualCorrectCount: correctCount || 0,
          manualSkippedCount: skippedCount || 0,
          manualEndedCount: endedCount || 0,
        },
        $set: {
          manualReviewDone: true,
          reviewedBy: req.user.userId,
          reviewedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/listing/:itemId — Get full listing details for review
router.get('/listing/:itemId', requireAuth, async (req, res) => {
  try {
    const listing = await Listing.findOne({ itemId: req.params.itemId }).lean();
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ebay/auto-compatibility/run-for-date
// Body: { targetDate, itemLimit?, excludeSellerIds? }
// Creates batches for every seller (except those in AUTO_COMPAT_EXCLUDED_USERNAMES) and processes them sequentially.
router.post('/auto-compatibility/run-for-date', requireAuth, async (req, res) => {
  const { targetDate, itemLimit = 0, excludeSellerIds = [] } = req.body;
  if (!targetDate) {
    return res.status(400).json({ error: 'targetDate is required' });
  }
  try {
    // Hand off all logic to the shared function; pass the logged-in user as triggeredBy.
    const batches = await scheduledRunAutoCompatForDate(targetDate, {
      triggeredBy: req.user.userId,
      itemLimit,
      excludeSellerIds,
    });
    res.json({ success: true, batches });
  } catch (err) {
    console.error('[AutoCompat] run-for-date error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/auto-compatibility-batches-for-date?targetDate=YYYY-MM-DD
// Returns all batches for a given date (all sellers), used by the "Run All" dashboard.
router.get('/auto-compatibility-batches-for-date', requireAuth, async (req, res) => {
  try {
    const { targetDate } = req.query;
    if (!targetDate) return res.status(400).json({ error: 'targetDate is required' });

    const batches = await AutoCompatibilityBatch.find({ targetDate })
      .select('-items')
      .sort({ createdAt: 1 })
      .populate('triggeredBy', 'username')
      .populate('reviewedBy', 'username')
      .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
      .lean();

    res.json({ batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SHARED FUNCTIONS: Called by both the HTTP routes above and by scheduledJobs.js.
// The routes are thin wrappers around these — no logic is duplicated.
// Set RUNNER_ID=render in Render's env vars.
// ============================================

// Core logic for "Poll All Sellers".
// Called by: POST /sync-all-sellers-listings (button) and the 1:00 AM IST cron job.
export async function scheduledSyncAllSellers() {
  if (syncAllStatus.running) {
    console.log('[Sync All] Already in progress, skipping.');
    return;
  }
  const allSellers = await Seller.find({ 'ebayTokens.access_token': { $exists: true } })
    .populate('user', 'username email');
  if (allSellers.length === 0) {
    console.log('[Sync All] No sellers with eBay tokens found.');
    return;
  }
  syncAllStatus = {
    running: true,
    sellersTotal: allSellers.length,
    sellersComplete: 0,
    currentSeller: '',
    currentPage: 0,
    currentTotalPages: 0,
    results: [],
    errors: [],
    totalProcessed: 0,
    totalSkipped: 0,
    startedAt: new Date().toISOString(),
    completedAt: null
  };
  console.log(`[Sync All] Started for ${allSellers.length} seller(s).`);
  const VALID_MOTORS_CATEGORIES = ["eBay Motors", "Parts & Accessories", "Automotive Tools", "Tools & Supplies"];
  (async () => {
    for (const seller of allSellers) {
      const sellerName = seller.user?.username || seller.user?.email || seller._id;
      syncAllStatus.currentSeller = sellerName;
      syncAllStatus.currentPage = 0;
      syncAllStatus.currentTotalPages = 0;
      console.log(`[Sync All] Starting sync for seller: ${sellerName}`);
      try {
        const token = await ensureValidToken(seller);
        const listingCount = await Listing.countDocuments({ seller: seller._id, listingStatus: 'Active' });
        const orderCount = await Order.countDocuments({ seller: seller._id });
        const defaultStartDate = getEffectiveInitialSyncDate(seller.initialSyncDate);
        const startTimeTo = new Date();
        let startTimeFrom;
        if (listingCount === 0 && orderCount === 0) {
          startTimeFrom = defaultStartDate;
        } else {
          startTimeFrom = seller.lastListingPolledAt || defaultStartDate;
        }
        startTimeFrom = getClampedSellerListStart(startTimeFrom, startTimeTo);
        let page = 1;
        let totalPages = 1;
        let processedCount = 0;
        let skippedCount = 0;
        do {
          syncAllStatus.currentPage = page;
          console.log(`[Sync All] ${sellerName} — Fetching Page ${page}...`);
          const xmlRequest = `
              <?xml version="1.0" encoding="utf-8"?>
              <GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
                <ErrorLanguage>en_US</ErrorLanguage>
                <WarningLevel>High</WarningLevel>
                <DetailLevel>ItemReturnDescription</DetailLevel>
                <StartTimeFrom>${new Date(startTimeFrom).toISOString()}</StartTimeFrom>
                <StartTimeTo>${startTimeTo.toISOString()}</StartTimeTo>
                <IncludeWatchCount>true</IncludeWatchCount>
                <Pagination>
                  <EntriesPerPage>100</EntriesPerPage>
                  <PageNumber>${page}</PageNumber>
                </Pagination>
                <OutputSelector>ItemArray.Item.ItemID</OutputSelector>
                <OutputSelector>ItemArray.Item.Title</OutputSelector>
                <OutputSelector>ItemArray.Item.SKU</OutputSelector>
                <OutputSelector>ItemArray.Item.SellingStatus</OutputSelector>
                <OutputSelector>ItemArray.Item.ListingStatus</OutputSelector>
                <OutputSelector>ItemArray.Item.Description</OutputSelector>
                <OutputSelector>ItemArray.Item.PictureDetails</OutputSelector>
                <OutputSelector>ItemArray.Item.ItemCompatibilityList</OutputSelector>
                <OutputSelector>ItemArray.Item.PrimaryCategory</OutputSelector>
                <OutputSelector>ItemArray.Item.ListingDetails</OutputSelector>
                <OutputSelector>PaginationResult</OutputSelector>
              </GetSellerListRequest>
            `;
          const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
            headers: {
              'X-EBAY-API-SITEID': '100',
              'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
              'X-EBAY-API-CALL-NAME': 'GetSellerList',
              'Content-Type': 'text/xml'
            }
          });
          const result = await parseStringPromise(response.data);
          if (result.GetSellerListResponse.Ack[0] === 'Failure') {
            throw new Error(result.GetSellerListResponse.Errors[0].LongMessage[0]);
          }
          const pagination = result.GetSellerListResponse.PaginationResult[0];
          totalPages = parseInt(pagination.TotalNumberOfPages[0]);
          syncAllStatus.currentTotalPages = totalPages;
          const items = result.GetSellerListResponse.ItemArray?.[0]?.Item || [];
          for (const item of items) {
            const status = item.SellingStatus?.[0]?.ListingStatus?.[0];
            if (status !== 'Active') continue;
            const categoryName = item.PrimaryCategory?.[0]?.CategoryName?.[0] || '';
            const isMotorsItem = VALID_MOTORS_CATEGORIES.some(keyword => categoryName.includes(keyword));
            if (!isMotorsItem) { skippedCount++; continue; }
            const rawHtml = item.Description ? item.Description[0] : '';
            const cleanHtml = extractCleanDescription(rawHtml);
            let parsedCompatibility = [];
            if (item.ItemCompatibilityList && item.ItemCompatibilityList[0].Compatibility) {
              parsedCompatibility = item.ItemCompatibilityList[0].Compatibility.map(comp => ({
                notes: comp.CompatibilityNotes ? comp.CompatibilityNotes[0] : '',
                nameValueList: comp.NameValueList.map(nv => ({
                  name: nv.Name[0],
                  value: nv.Value[0]
                }))
              }));
            }
            await Listing.findOneAndUpdate(
              { itemId: item.ItemID[0] },
              {
                seller: seller._id,
                title: item.Title[0],
                sku: item.SKU ? item.SKU[0] : '',
                currentPrice: parseFloat(item.SellingStatus[0].CurrentPrice[0]._),
                currency: item.SellingStatus[0].CurrentPrice[0].$.currencyID,
                listingStatus: status,
                mainImageUrl: item.PictureDetails?.[0]?.PictureURL?.[0] || '',
                categoryName: categoryName,
                descriptionPreview: cleanHtml,
                compatibility: parsedCompatibility,
                startTime: item.ListingDetails?.[0]?.StartTime?.[0]
              },
              { upsert: true }
            );
            processedCount++;
          }
          page++;
        } while (page <= totalPages);
        seller.lastListingPolledAt = startTimeTo;
        await seller.save();
        console.log(`[Sync All] ${sellerName} — Done: ${processedCount} processed, ${skippedCount} skipped`);
        syncAllStatus.results.push({ sellerName, processedCount, skippedCount });
        syncAllStatus.totalProcessed += processedCount;
        syncAllStatus.totalSkipped += skippedCount;
      } catch (sellerErr) {
        console.error(`[Sync All] Error for seller ${sellerName}:`, sellerErr.message);
        syncAllStatus.errors.push(`${sellerName}: ${sellerErr.message}`);
        syncAllStatus.results.push({ sellerName, processedCount: 0, skippedCount: 0, error: sellerErr.message });
      }
      syncAllStatus.sellersComplete++;
    }
    syncAllStatus.running = false;
    syncAllStatus.currentSeller = '';
    syncAllStatus.completedAt = new Date().toISOString();
    console.log(`[Sync All] Done: ${syncAllStatus.totalProcessed} processed, ${syncAllStatus.totalSkipped} skipped, ${syncAllStatus.errors.length} errors`);
  })();
}

// Core logic for "Run All Sellers for Date".
// Called by: POST /auto-compatibility/run-for-date (button) and the 3:00 AM IST cron job.
// triggeredBy: user ObjectId when called from the button; null when called from cron.
export async function scheduledRunAutoCompatForDate(targetDate, { triggeredBy = null, itemLimit = 0, excludeSellerIds = [] } = {}) {
  console.log(`[AutoCompat] run-for-date: starting for ${targetDate}...`);
  const allSellers = await Seller.find({}).populate('user', 'username email').lean();
  const eligible = allSellers.filter(s => {
    if (excludeSellerIds.includes(String(s._id))) return false;
    const identifier = (s.user?.username || s.user?.email || '');
    return !AUTO_COMPAT_EXCLUDED_USERNAMES.some(excl => identifier.includes(excl));
  });
  if (eligible.length === 0) {
    console.log('[AutoCompat] run-for-date: no eligible sellers found.');
    return [];
  }
  const dayStart = new Date(targetDate + 'T00:00:00Z');
  const dayEnd   = new Date(targetDate + 'T23:59:59.999Z');
  const result   = [];
  for (const seller of eligible) {
    const existing = await AutoCompatibilityBatch.findOne({
      seller: seller._id,
      targetDate,
      status: { $in: ['running', 'completed'] },
    }).select('_id status totalListings').lean();
    if (existing) {
      result.push({
        sellerId: seller._id,
        username: seller.user?.username || seller.user?.email,
        batchId: existing._id,
        status: existing.status,
        totalListings: existing.totalListings,
        reused: true,
      });
      continue;
    }
    const baseQuery = {
      seller: seller._id,
      listingStatus: 'Active',
      startTime: { $gte: dayStart, $lte: dayEnd },
      $or: [{ compatibility: { $exists: false } }, { compatibility: { $size: 0 } }, { compatibility: null }],
    };
    let listings = await Listing.find(baseQuery).sort({ startTime: 1 }).select('itemId').lean();
    if (itemLimit > 0) listings = listings.slice(0, itemLimit);
    if (listings.length === 0) {
      result.push({
        sellerId: seller._id,
        username: seller.user?.username || seller.user?.email,
        batchId: null,
        status: 'skipped',
        reason: 'no_listings',
      });
      continue;
    }
    const batch = await AutoCompatibilityBatch.create({
      seller: seller._id,
      triggeredBy,
      targetDate,
      itemLimit: itemLimit || 0,
      sourceItemIds: listings.map(l => l.itemId),
      totalListings: listings.length,
      runnerId: RUNNER_ID,
      status: 'running',
      startedAt: new Date(),
    });
    result.push({
      sellerId: seller._id,
      username: seller.user?.username || seller.user?.email,
      batchId: batch._id,
      status: 'running',
      totalListings: listings.length,
      reused: false,
    });
  }
  const newBatchIds = result.filter(r => !r.reused && r.status === 'running').map(r => r.batchId);
  console.log(`[AutoCompat] run-for-date ${targetDate}: ${newBatchIds.length} new batch(es), ${result.filter(r => r.reused).length} reused, ${result.filter(r => r.status === 'skipped').length} skipped.`);
  // Process new batches sequentially in the background; caller gets the result array immediately.
  (async () => {
    for (const bid of newBatchIds) {
      try {
        await processAutoCompatibilityBatch(bid);
      } catch (err) {
        console.error(`[AutoCompat] run-for-date: batch ${bid} failed:`, err.message);
      }
    }
    console.log(`[AutoCompat] run-for-date ${targetDate}: all ${newBatchIds.length} new batch(es) finished.`);
  })();
  return result;
}

export default router;

