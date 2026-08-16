/**
 * Best Offers routes — eBay Trading + Negotiation APIs
 *
 * GET  /api/ebay/best-offers            — GetBestOffers (single store)
 * POST /api/ebay/best-offers/respond    — RespondToBestOffer
 * GET  /api/ebay/eligible-offers        — find_eligible_items (single store)
 * POST /api/ebay/eligible-offers/send   — send_offer_to_interested_buyers
 */

import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import { ensureValidToken } from './ebay.js';

const router = express.Router();
const offerPageAccess = requirePageAccess(['StoreListings', 'SendOfferEligible']);

const EBAY_TRADING_URL = 'https://api.ebay.com/ws/api.dll';

const MARKETPLACE_SITEID = {
  EBAY_US: '0',
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
    const payload = {
      allowCounterOffer: Boolean(allowCounter),
      message: typeof message === 'string' && message.trim() ? message.trim() : undefined,
      offeredItems: [offeredItem],
    };
    if (Number.isFinite(durationDays) && durationDays > 0) {
      payload.offerDuration = { unit: 'DAY', value: durationDays };
    }

    const response = await axios.post(
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

    return res.json({
      success: true,
      message: 'Offer sent to interested buyers',
      offers: response.data?.offers || response.data,
    });
  } catch (err) {
    const errors = err.response?.data?.errors;
    const ebayError = errors?.[0]?.longMessage || errors?.[0]?.message || err.message;
    console.error('[BestOffers] send_offer_to_interested_buyers error:', err.response?.data ?? err.message);
    return res.status(err.response?.status ?? 500).json({ error: 'Failed to send offer', details: ebayError });
  }
});

export default router;
