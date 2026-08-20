/**
 * Best Offers routes — eBay Trading + Negotiation APIs
 *
 * GET  /api/ebay/best-offers            — GetBestOffers (single store)
 * POST /api/ebay/best-offers/respond    — RespondToBestOffer
 * GET  /api/ebay/eligible-offers        — find_eligible_items (single store)
 * POST /api/ebay/eligible-offers/send   — send_offer_to_interested_buyers
 * GET  /api/ebay/metadata/negotiated-price-policies — getNegotiatedPricePolicies
 */

import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import ActiveListing from '../models/ActiveListing.js';
import { ensureValidToken, getEbayClientCredentialsToken } from './ebay.js';
import {
  activeListingStatusFilter,
  getSellersForStoreListings,
  sellerIdsInMatch,
} from '../utils/storeListingsQuery.js';

const router = express.Router();
const offerPageAccess = requirePageAccess(['StoreListings', 'SendOfferEligible']);

const EBAY_TRADING_URL = 'https://api.ebay.com/ws/api.dll';

const MARKETPLACE_SITEID = {
  EBAY_US: '0',
  EBAY_MOTORS_US: '100',
  EBAY_GB: '3',
  EBAY_DE: '77',
  EBAY_AU: '15',
  EBAY_CA: '2',
  EBAY_FR: '71',
  EBAY_IT: '101',
  EBAY_ES: '186',
};
const getSiteId = (seller) => MARKETPLACE_SITEID[seller.ebayMarketplaces?.[0]] ?? '0';

const tradingHeaders = (callName, siteId = '0') => ({
  'X-EBAY-API-SITEID': siteId,
  'X-EBAY-API-COMPATIBILITY-LEVEL': '1453',
  'X-EBAY-API-CALL-NAME': callName,
  'Content-Type': 'text/xml',
});

const escapeXml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

async function fetchItemSku(token, siteId, itemId) {
  try {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <IncludeItemSpecifics>false</IncludeItemSpecifics>
</GetItemRequest>`;
    const resp = await axios.post(EBAY_TRADING_URL, xml, {
      headers: tradingHeaders('GetItem', siteId),
      timeout: 45000,
    });
    const parsed = await parseStringPromise(resp.data, { explicitArray: false });
    return parsed?.GetItemResponse?.Item?.SKU ?? '';
  } catch {
    return '';
  }
}

function parseOffer(item, offer) {
  const listPrice = item.BuyItNowPrice?._ ?? item.BuyItNowPrice ?? null;
  const listCurrency = item.BuyItNowPrice?.['$']?.currencyID ?? item.Currency ?? 'USD';

  return {
    sku: item.SKU ?? '',
    bestOfferId: offer.BestOfferID,
    itemId: item.ItemID,
    title: item.Title ?? `Item ${item.ItemID}`,
    listingPrice: listPrice,
    listingCurrency: listCurrency,
    listingEndTime: item.ListingDetails?.EndTime ?? null,
    offerPrice: offer.Price?._ ?? offer.Price ?? null,
    offerCurrency: offer.Price?.['$']?.currencyID ?? 'USD',
    quantity: offer.Quantity ?? 1,
    status: offer.Status,
    buyerMessage: offer.BuyerMessage ?? '',
    sellerMessage: offer.SellerMessage ?? '',
    expirationTime: offer.ExpirationTime ?? null,
    offerType: offer.BestOfferCodeType ?? 'BuyerBestOffer',
    buyerId: offer.Buyer?.UserID ?? '',
    buyerFeedbackScore: offer.Buyer?.FeedbackScore ?? 0,
    buyerEmail: offer.Buyer?.Email ?? '',
  };
}

router.get('/best-offers', requireAuth, offerPageAccess, async (req, res) => {
  try {
    const { sellerId, status = 'Active' } = req.query;

    if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const token = await ensureValidToken(seller);
    const siteId = getSiteId(seller);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetBestOffersRequest>`;

    const response = await axios.post(EBAY_TRADING_URL, xml, {
      headers: tradingHeaders('GetBestOffers', siteId),
      timeout: 45000,
    });

    const parsed = await parseStringPromise(response.data, { explicitArray: false });
    const root = parsed?.GetBestOffersResponse;

    if (root?.Ack === 'Failure') {
      const errs = toArray(root?.Errors);
      return res.status(400).json({
        error: 'eBay API error',
        details: errs.map((e) => e.LongMessage).join('; '),
      });
    }

    const offers = [];
    for (const entry of toArray(root?.ItemBestOffersArray?.ItemBestOffers)) {
      const item = entry?.Item ?? {};
      for (const offer of toArray(entry?.BestOfferArray?.BestOffer)) {
        offers.push(parseOffer(item, offer));
      }
    }

    if (offers.length > 0) {
      const uniqueItemIds = [...new Set(offers.map((o) => o.itemId).filter(Boolean))];
      const skuResults = await Promise.all(
        uniqueItemIds.map((id) => fetchItemSku(token, siteId, id).then((sku) => [id, sku]))
      );
      const skuMap = Object.fromEntries(skuResults);
      for (const offer of offers) {
        if (skuMap[offer.itemId]) offer.sku = skuMap[offer.itemId];
      }
    }

    console.log(`[BestOffers] fetched ${offers.length} offer(s) for seller ${sellerId} (status query: ${status})`);

    const pagination = root?.PaginationResult ?? {};
    return res.json({
      success: true,
      offers,
      totalEntries: parseInt(pagination.TotalNumberOfEntries, 10) || offers.length,
      totalPages: parseInt(pagination.TotalNumberOfPages, 10) || 1,
      currentPage: 1,
    });
  } catch (err) {
    console.error('[BestOffers] error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch best offers', details: err.message });
  }
});

router.post('/best-offers/respond', requireAuth, offerPageAccess, async (req, res) => {
  try {
    const {
      sellerId,
      itemId,
      bestOfferId,
      action,
      counterPrice,
      counterQuantity,
      sellerResponse,
    } = req.body;

    if (!sellerId || !itemId || !bestOfferId || !action) {
      return res.status(400).json({
        error: 'Missing required fields: sellerId, itemId, bestOfferId, action',
      });
    }

    const VALID_ACTIONS = ['Accept', 'Decline', 'Counter'];
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
      });
    }

    if (action === 'Counter' && !counterPrice) {
      return res.status(400).json({ error: 'counterPrice is required when action is Counter' });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const token = await ensureValidToken(seller);
    const siteId = getSiteId(seller);

    const counterBlock =
      action === 'Counter'
        ? `<CounterOfferPrice currencyID="USD">${parseFloat(counterPrice).toFixed(2)}</CounterOfferPrice>
         <CounterOfferQuantity>${parseInt(counterQuantity, 10) || 1}</CounterOfferQuantity>`
        : '';

    const sellerResponseBlock = sellerResponse
      ? `<SellerResponse>${escapeXml(sellerResponse)}</SellerResponse>`
      : '';

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<RespondToBestOfferRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <BestOfferID>${escapeXml(bestOfferId)}</BestOfferID>
  <Action>${escapeXml(action)}</Action>
  ${counterBlock}
  ${sellerResponseBlock}
</RespondToBestOfferRequest>`;

    const response = await axios.post(EBAY_TRADING_URL, xmlRequest, {
      headers: tradingHeaders('RespondToBestOffer', siteId),
      timeout: 45000,
    });

    const parsed = await parseStringPromise(response.data, { explicitArray: false });
    const root = parsed.RespondToBestOfferResponse;
    const ack = root?.Ack;

    if (ack === 'Failure') {
      const errors = toArray(root?.Errors);
      return res.status(400).json({
        error: 'eBay API error',
        details: errors.map((e) => e.LongMessage).join('; '),
      });
    }

    return res.json({
      success: true,
      ack,
      message: `Offer ${action.toLowerCase()}ed successfully`,
    });
  } catch (err) {
    console.error('[BestOffers] RespondToBestOffer error:', err.message);
    return res.status(500).json({ error: 'Failed to respond to offer', details: err.message });
  }
});

router.get('/eligible-offers', requireAuth, offerPageAccess, async (req, res) => {
  try {
    const { sellerId } = req.query;
    if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const token = await ensureValidToken(seller);
    const marketplaceId = seller.ebayMarketplaces?.[0] ?? 'EBAY_US';

    const response = await axios.get(
      'https://api.ebay.com/sell/negotiation/v1/find_eligible_items',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
          'Content-Type': 'application/json',
        },
        params: { limit: 200, offset: 0 },
        timeout: 45000,
      }
    );

    const items = (response.data.eligibleItems ?? []).map((i) => ({
      listingId: i.listingId,
      itemId: i.itemId,
      title: i.listingTitle ?? i.listingId,
      listingStatus: i.listingStatus ?? 'ACTIVE',
      minimumOfferPrice: i.minimumOfferPrice?.value ?? null,
      minimumOfferCurrency: i.minimumOfferPrice?.currency ?? 'USD',
      interestedBuyers: i.eligibleCounterPartiesCount ?? 0,
    }));

    return res.json({ success: true, items, total: response.data.total ?? items.length });
  } catch (err) {
    const ebayError = err.response?.data?.errors?.[0]?.message ?? err.message;
    console.error('[BestOffers] find_eligible_items error:', err.response?.data ?? err.message);
    return res.status(err.response?.status ?? 500).json({ error: 'Failed to fetch eligible items', details: ebayError });
  }
});

function isTrueFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function ebayErrorText(err) {
  const errors = err?.response?.data?.errors;
  return String(errors?.[0]?.longMessage || errors?.[0]?.message || err?.message || '');
}

function allowCounterOfferRejected(err) {
  return /allowCounterOffer cannot be true/i.test(ebayErrorText(err));
}

function parseTradingAck(parsed, responseKey) {
  const root = parsed?.[responseKey] || {};
  const ack = String(root?.Ack || '');
  const errors = toArray(root?.Errors);
  const failed = ack === 'Failure' || (ack === 'PartialFailure' && errors.some((e) => String(e?.SeverityCode) === 'Error'));
  return {
    ack,
    failed,
    message: errors.map((e) => e.LongMessage || e.ShortMessage).filter(Boolean).join('; '),
    bestOfferEnabled: isTrueFlag(
      root?.Item?.BestOfferDetails?.BestOfferEnabled ?? root?.Item?.BestOfferEnabled
    ),
  };
}

async function getListingBestOfferEnabled(token, siteId, listingId) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ItemID>${escapeXml(listingId)}</ItemID>
  <IncludeItemSpecifics>false</IncludeItemSpecifics>
</GetItemRequest>`;
  const resp = await axios.post(EBAY_TRADING_URL, xml, {
    headers: tradingHeaders('GetItem', siteId),
    timeout: 45000,
  });
  const parsed = await parseStringPromise(resp.data, { explicitArray: false });
  const item = parsed?.GetItemResponse?.Item || {};
  return isTrueFlag(item?.BestOfferDetails?.BestOfferEnabled ?? item?.BestOfferEnabled);
}

async function enableListingBestOffer(token, siteId, listingId) {
  const alreadyOn = await getListingBestOfferEnabled(token, siteId, listingId).catch(() => false);
  if (alreadyOn) return { enabled: true, already: true };

  const itemXml = `<Item>
    <ItemID>${escapeXml(listingId)}</ItemID>
    <BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>
  </Item>`;

  const tryRevise = async (callName) => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  ${itemXml}
</${callName}Request>`;
    const resp = await axios.post(EBAY_TRADING_URL, xml, {
      headers: tradingHeaders(callName, siteId),
      timeout: 45000,
    });
    const parsed = await parseStringPromise(resp.data, { explicitArray: false });
    return parseTradingAck(parsed, `${callName}Response`);
  };

  let result = await tryRevise('ReviseFixedPriceItem');
  if (result.failed) result = await tryRevise('ReviseItem');
  if (result.failed) {
    const err = new Error(result.message || 'Failed to enable Best Offer on listing');
    err.code = 'BEST_OFFER_ENABLE_FAILED';
    throw err;
  }
  return { enabled: true, already: false };
}

async function postSendOfferToInterestedBuyers(token, marketplaceId, payload) {
  return axios.post(
    'https://api.ebay.com/sell/negotiation/v1/send_offer_to_interested_buyers',
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
        'Content-Type': 'application/json',
      },
      timeout: 45000,
    }
  );
}

router.post('/eligible-offers/send', requireAuth, offerPageAccess, async (req, res) => {
  try {
    const {
      sellerId,
      listingId,
      price,
      currency,
      quantity,
      message,
      allowCounter = true,
      discountPercentage,
      offerDurationDays,
    } = req.body;

    if (!sellerId || !listingId) {
      return res.status(400).json({ error: 'Missing required fields: sellerId, listingId' });
    }

    const percentRaw = discountPercentage != null && discountPercentage !== ''
      ? parseFloat(discountPercentage)
      : null;
    const hasPercent = Number.isFinite(percentRaw) && percentRaw > 0;
    const priceRaw = price != null && price !== '' ? parseFloat(price) : null;
    const hasPrice = Number.isFinite(priceRaw) && priceRaw > 0;

    if (!hasPercent && !hasPrice) {
      return res.status(400).json({
        error: 'Provide a percent off (min 5) or an offer price',
      });
    }
    if (hasPercent && hasPrice) {
      return res.status(400).json({
        error: 'Send either discountPercentage or price, not both',
      });
    }
    if (hasPercent && (percentRaw < 5 || percentRaw > 99)) {
      return res.status(400).json({ error: 'Percent off must be between 5 and 99' });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const token = await ensureValidToken(seller);
    const marketplaceId = seller.ebayMarketplaces?.[0] ?? 'EBAY_US';
    const siteId = getSiteId(seller);

    const offeredItem = {
      listingId: String(listingId),
      quantity: parseInt(quantity, 10) || 1,
    };
    if (hasPercent) {
      offeredItem.discountPercentage = String(Math.round(percentRaw * 100) / 100);
    } else {
      offeredItem.price = {
        currency: currency || 'USD',
        value: priceRaw.toFixed(2),
      };
    }

    const durationDays = parseInt(offerDurationDays, 10);
    const wantCounter = isTrueFlag(allowCounter);
    const payload = {
      allowCounterOffer: wantCounter,
      message: typeof message === 'string' && message.trim() ? message.trim() : undefined,
      offeredItems: [offeredItem],
    };
    if (Number.isFinite(durationDays) && durationDays > 0) {
      payload.offerDuration = { unit: 'DAY', value: durationDays };
    }

    let listingBestOfferEnabled = false;
    let listingBestOfferWarning = null;
    if (wantCounter) {
      try {
        const bo = await enableListingBestOffer(token, siteId, String(listingId));
        listingBestOfferEnabled = Boolean(bo.enabled);
      } catch (boErr) {
        listingBestOfferWarning = boErr.message;
        console.warn('[BestOffers] enable Best Offer failed:', boErr.message);
      }
    }

    let response;
    let counterOfferOnOffer = wantCounter;
    let counterOfferWarning = null;
    try {
      response = await postSendOfferToInterestedBuyers(token, marketplaceId, payload);
    } catch (sendErr) {
      if (wantCounter && allowCounterOfferRejected(sendErr)) {
        // Public Negotiation API still rejects true. Send the offer anyway, and
        // leave listing Best Offer on so buyers can still negotiate.
        payload.allowCounterOffer = false;
        counterOfferOnOffer = false;
        counterOfferWarning =
          'eBay’s send-offer API will not attach a counter to this offer. ' +
          (listingBestOfferEnabled
            ? 'Best Offer is on for the listing, so interested buyers can still make or counter an offer from the item page.'
            : listingBestOfferWarning
              ? `Could not enable listing Best Offer: ${listingBestOfferWarning}`
              : 'Buyers can only accept or decline this offer.');
        response = await postSendOfferToInterestedBuyers(token, marketplaceId, payload);
      } else {
        throw sendErr;
      }
    }

    const warning = [counterOfferWarning, !listingBestOfferEnabled ? listingBestOfferWarning : null]
      .filter(Boolean)
      .join(' ');

    return res.json({
      success: true,
      message: warning || 'Offer sent to interested buyers',
      warning: warning || undefined,
      counterOfferOnOffer,
      listingBestOfferEnabled,
      offers: response.data?.offers || response.data,
    });
  } catch (err) {
    const ebayError = ebayErrorText(err);
    console.error('[BestOffers] send_offer_to_interested_buyers error:', err.response?.data ?? err.message);
    return res.status(err.response?.status ?? 500).json({ error: 'Failed to send offer', details: ebayError });
  }
});

const NEGOTIATED_PRICE_MARKETPLACES = [
  'EBAY_US', 'EBAY_MOTORS_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA',
  'EBAY_DE', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES', 'EBAY_AT',
  'EBAY_BE', 'EBAY_CH', 'EBAY_IE', 'EBAY_NL', 'EBAY_PL',
];
const negotiatedPriceCache = new Map();
const NEGOTIATED_PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseCategoryIds(raw, { max = 50 } = {}) {
  const ids = [...new Set(
    String(raw || '')
      .split(/[\s,|;]+/)
      .map((id) => id.trim())
      .filter(Boolean)
  )];
  return max ? ids.slice(0, max) : ids;
}

function normalizeNegotiatedPolicy(row = {}) {
  return {
    categoryId: String(row.categoryId ?? row.category_id ?? ''),
    categoryTreeId: String(row.categoryTreeId ?? row.category_tree_id ?? ''),
    bestOfferAutoAcceptEnabled: Boolean(row.bestOfferAutoAcceptEnabled ?? row.best_offer_auto_accept_enabled),
    bestOfferAutoDeclineEnabled: Boolean(row.bestOfferAutoDeclineEnabled ?? row.best_offer_auto_decline_enabled),
    bestOfferCounterEnabled: Boolean(row.bestOfferCounterEnabled ?? row.best_offer_counter_enabled),
  };
}

function sellerDisplayName(seller) {
  return seller?.user?.username || seller?.user?.email || seller?.username || String(seller?._id || '');
}

async function fetchItemPrimaryCategory(token, siteId, itemId) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <IncludeItemSpecifics>false</IncludeItemSpecifics>
</GetItemRequest>`;
  const resp = await axios.post(EBAY_TRADING_URL, xml, {
    headers: tradingHeaders('GetItem', siteId),
    timeout: 45000,
  });
  const parsed = await parseStringPromise(resp.data, { explicitArray: false });
  const cat = parsed?.GetItemResponse?.Item?.PrimaryCategory || {};
  return {
    categoryId: String(cat.CategoryID || '').trim(),
    categoryName: String(cat.CategoryName || '').trim(),
  };
}

async function backfillListingCategoryIds(usageRows) {
  const missing = usageRows.filter((row) => !String(row._id.categoryId || '').trim() && row.sampleItemId);
  if (!missing.length) return { filled: 0, attempted: 0 };

  const batch = missing.slice(0, 40);
  const tokenSellers = await Seller.find({
    _id: { $in: batch.map((row) => row._id.seller) },
  }).select('ebayTokens ebayMarketplaces');
  const sellerById = new Map(tokenSellers.map((s) => [String(s._id), s]));
  const tokenBySeller = new Map();
  let filled = 0;

  for (const row of batch) {
    const seller = sellerById.get(String(row._id.seller));
    if (!seller?.ebayTokens?.refresh_token && !seller?.ebayTokens?.access_token) continue;
    try {
      let token = tokenBySeller.get(String(seller._id));
      if (!token) {
        token = await ensureValidToken(seller);
        tokenBySeller.set(String(seller._id), token);
      }
      const siteId = getSiteId(seller);
      let cat = await fetchItemPrimaryCategory(token, siteId, row.sampleItemId);
      if (!cat.categoryId && siteId !== '100') {
        cat = await fetchItemPrimaryCategory(token, '100', row.sampleItemId);
      }
      if (!cat.categoryId) continue;

      const name = String(row._id.categoryName || '').trim();
      const match = {
        seller: row._id.seller,
        $and: [
          activeListingStatusFilter(),
          { $or: [{ categoryId: { $exists: false } }, { categoryId: null }, { categoryId: '' }] },
        ],
      };
      if (name) match.categoryName = name;
      await ActiveListing.updateMany(match, { $set: { categoryId: cat.categoryId } });
      filled += 1;
    } catch (err) {
      console.warn('[Metadata] categoryId backfill failed:', row.sampleItemId, err.message);
    }
  }

  return { filled, attempted: batch.length };
}

async function fetchPoliciesForCategoryIds(marketplaceId, categoryIds, { forceRefresh = false } = {}) {
  if (!categoryIds.length) return { policies: [], warnings: [], cached: true };
  const primary = await fetchNegotiatedPoliciesFromEbay(marketplaceId, categoryIds, { forceRefresh });
  const found = new Set(primary.policies.map((row) => row.categoryId));
  const missing = categoryIds.filter((id) => !found.has(id));
  const fallbackMarketplace = marketplaceId === 'EBAY_US' ? 'EBAY_MOTORS_US'
    : marketplaceId === 'EBAY_MOTORS_US' ? 'EBAY_US'
      : null;
  if (!fallbackMarketplace || !missing.length) return primary;

  const extra = await fetchNegotiatedPoliciesFromEbay(fallbackMarketplace, missing, { forceRefresh });
  const byId = new Map(primary.policies.map((row) => [row.categoryId, row]));
  for (const row of extra.policies) {
    if (!byId.has(row.categoryId)) byId.set(row.categoryId, row);
  }
  return {
    policies: [...byId.values()],
    warnings: [...(primary.warnings || []), ...(extra.warnings || [])],
    cached: Boolean(primary.cached && extra.cached),
  };
}

async function fetchNegotiatedPoliciesFromEbay(marketplaceId, categoryIds = [], { forceRefresh = false } = {}) {
  const chunks = categoryIds.length
    ? Array.from({ length: Math.ceil(categoryIds.length / 50) }, (_, i) => categoryIds.slice(i * 50, i * 50 + 50))
    : [null];

  const byId = new Map();
  const warnings = [];
  let cached = true;
  let token = null;

  for (const chunk of chunks) {
    const filter = chunk?.length ? `categoryIds:{${chunk.join('|')}}` : undefined;
    const cacheKey = `${marketplaceId}|${filter || '*'}`;
    const hit = negotiatedPriceCache.get(cacheKey);
    if (!forceRefresh && hit && (Date.now() - hit.fetchedAt) < NEGOTIATED_PRICE_CACHE_TTL_MS) {
      for (const row of hit.payload.policies || []) byId.set(row.categoryId, row);
      warnings.push(...(hit.payload.warnings || []));
      continue;
    }

    cached = false;
    if (!token) token = await getEbayClientCredentialsToken('https://api.ebay.com/oauth/api_scope');
    const response = await axios.get(
      `https://api.ebay.com/sell/metadata/v1/marketplace/${encodeURIComponent(marketplaceId)}/get_negotiated_price_policies`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
        },
        params: filter ? { filter } : {},
        timeout: 120000,
        maxContentLength: 80 * 1024 * 1024,
      }
    );
    const policies = (response.data?.negotiatedPricePolicies || response.data?.negotiated_price_policies || [])
      .map(normalizeNegotiatedPolicy)
      .filter((row) => row.categoryId);
    const chunkWarnings = response.data?.warnings || [];
    negotiatedPriceCache.set(cacheKey, {
      fetchedAt: Date.now(),
      payload: { policies, warnings: chunkWarnings },
    });
    for (const row of policies) byId.set(row.categoryId, row);
    warnings.push(...chunkWarnings);
  }

  return { policies: [...byId.values()], warnings, cached };
}

router.get(
  '/metadata/negotiated-price-policies',
  requireAuth,
  requirePageAccess(['StoreListings', 'NegotiatedPricePolicies']),
  async (req, res) => {
    const marketplaceId = String(req.query.marketplace || req.query.marketplaceId || 'EBAY_US').trim().toUpperCase();
    if (!NEGOTIATED_PRICE_MARKETPLACES.includes(marketplaceId)) {
      return res.status(400).json({
        error: `Unsupported marketplace. Use one of: ${NEGOTIATED_PRICE_MARKETPLACES.join(', ')}`,
      });
    }

    const view = String(req.query.view || 'stores').toLowerCase() === 'marketplace' ? 'marketplace' : 'stores';
    const sellerId = String(req.query.sellerId || '').trim();
    const manualCategoryIds = parseCategoryIds(req.query.categoryIds || req.query.filter, { max: 50 });
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';

    try {
      if (view === 'marketplace') {
        const { policies, warnings, cached } = await fetchNegotiatedPoliciesFromEbay(
          marketplaceId,
          manualCategoryIds,
          { forceRefresh }
        );
        return res.json({
          success: true,
          view,
          marketplaceId,
          filter: manualCategoryIds.length ? `categoryIds:{${manualCategoryIds.join('|')}}` : null,
          categoryIds: manualCategoryIds,
          total: policies.length,
          policies: policies.map((row) => ({
            ...row,
            sellerName: 'All eBay (marketplace rule)',
            sellerId: null,
            listingCount: null,
            categoryName: '',
            policyFound: true,
          })),
          warnings,
          fetchedAt: new Date().toISOString(),
          cached,
        });
      }

      const scopedSellers = await getSellersForStoreListings(req);
      const scopedIds = scopedSellers.map((s) => s._id);
      const sellerFilterIds = sellerId
        ? scopedIds.filter((id) => String(id) === sellerId)
        : scopedIds;
      if (sellerId && !sellerFilterIds.length) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      const sellerById = new Map(scopedSellers.map((s) => [String(s._id), s]));
      const listingMatch = {
        ...activeListingStatusFilter(),
        seller: sellerIdsInMatch(sellerFilterIds),
      };
      const loadUsage = () => ActiveListing.aggregate([
        { $match: listingMatch },
        {
          $group: {
            _id: {
              seller: '$seller',
              categoryId: { $ifNull: ['$categoryId', ''] },
              categoryName: { $ifNull: ['$categoryName', ''] },
            },
            listingCount: { $sum: 1 },
            sampleItemId: { $first: '$itemId' },
          },
        },
      ]);

      let usage = await loadUsage();
      const backfill = await backfillListingCategoryIds(usage);
      if (backfill.filled > 0) usage = await loadUsage();

      const categoryIds = [...new Set(
        usage.map((row) => String(row._id.categoryId || '').trim()).filter(Boolean)
      )];
      const lookupIds = manualCategoryIds.length ? manualCategoryIds : categoryIds;
      const { policies, warnings, cached } = lookupIds.length
        ? await fetchPoliciesForCategoryIds(marketplaceId, lookupIds, { forceRefresh })
        : { policies: [], warnings: [], cached: true };
      const policyById = new Map(policies.map((row) => [row.categoryId, row]));

      const rows = usage.map((row) => {
        const catId = String(row._id.categoryId || '').trim();
        const policy = catId ? (policyById.get(catId) || null) : null;
        const seller = sellerById.get(String(row._id.seller));
        const unknownReason = policy ? null
          : (catId ? 'not_in_marketplace' : 'no_category_id');
        return {
          sellerId: String(row._id.seller),
          sellerName: sellerDisplayName(seller),
          categoryId: catId,
          categoryName: row._id.categoryName || '',
          listingCount: row.listingCount || 0,
          categoryTreeId: policy?.categoryTreeId || '',
          bestOfferAutoAcceptEnabled: policy ? policy.bestOfferAutoAcceptEnabled : null,
          bestOfferAutoDeclineEnabled: policy ? policy.bestOfferAutoDeclineEnabled : null,
          bestOfferCounterEnabled: policy ? policy.bestOfferCounterEnabled : null,
          policyFound: Boolean(policy),
          unknownReason,
        };
      }).filter((row) => (
        !manualCategoryIds.length || manualCategoryIds.includes(row.categoryId)
      ));

      return res.json({
        success: true,
        view,
        marketplaceId,
        sellerId: sellerId || null,
        total: rows.length,
        policies: rows,
        missingCategoryIds: usage.filter((row) => !String(row._id.categoryId || '').trim()).length,
        categoryIdsBackfilled: backfill.filled,
        warnings,
        fetchedAt: new Date().toISOString(),
        cached,
      });
    } catch (err) {
      const ebayError = ebayErrorText(err);
      console.error('[Metadata] getNegotiatedPricePolicies error:', err.response?.data ?? err.message);
      return res.status(err.response?.status ?? 500).json({
        error: 'Failed to fetch negotiated price policies',
        details: ebayError,
      });
    }
  }
);

export default router;
