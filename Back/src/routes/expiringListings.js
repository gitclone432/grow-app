import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { requireAuth } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import { ensureValidToken } from './ebay.js';

const router = express.Router();
router.get('/expiring-low-activity-listings', requireAuth, async (req, res) => {
  const { sellerId } = req.query;
  if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

  // â”€â”€ SSE setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  const send = (obj) => {
    if (!aborted) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) { send({ type: 'error', error: 'Seller not found' }); return res.end(); }

    const now = new Date();
    const allowedHours = [24, 48, 72, 96];
    const hoursParam = parseInt(req.query.hours || '24', 10);
    const hours = allowedHours.includes(hoursParam) ? hoursParam : 24;
    const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const endTimeFrom = now.toISOString();
    const endTimeTo = cutoff.toISOString();

    const maxWatchersParam = parseInt(req.query.maxWatchers ?? '5', 10);
    const maxViewsParam = parseInt(req.query.maxViews ?? '5', 10);
    const maxWatchers = Number.isFinite(maxWatchersParam) ? Math.max(0, maxWatchersParam) : 5;
    const maxViews = Number.isFinite(maxViewsParam) ? Math.max(0, maxViewsParam) : 5;

    let page = 1;
    let totalPages = 1;
    const filteredListings = [];

    do {
      if (aborted) break;

      const token = await ensureValidToken(seller);

      const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <IncludeWatchCount>true</IncludeWatchCount>
  <GranularityLevel>Fine</GranularityLevel>
  <Pagination>
    <EntriesPerPage>100</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
</GetSellerListRequest>`;

      const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
        headers: {
          'X-EBAY-API-CALL-NAME': 'GetSellerList',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
          'Content-Type': 'text/xml',
        },
      });

      const result = await parseStringPromise(response.data, { explicitArray: false });
      const resp = result.GetSellerListResponse;

      if (resp.Ack === 'Failure') {
        const errors = resp.Errors;
        const msg = Array.isArray(errors) ? errors[0].LongMessage : errors?.LongMessage;
        throw new Error(msg || 'eBay API error');
      }

      const pagination = resp.PaginationResult;
      if (!pagination) break;
      totalPages = parseInt(pagination.TotalNumberOfPages || '1', 10);

      const rawItems = resp.ItemArray?.Item;
      const items = rawItems
        ? Array.isArray(rawItems) ? rawItems : [rawItems]
        : [];

      let pageHasBeyondCutoff = false;

      for (const item of items) {
        const listingStatus = item.SellingStatus?.ListingStatus;
        if (listingStatus !== 'Active') continue;

        const endTime = item.ListingDetails?.EndTime;

        // Safety guard: if this item ends beyond the cutoff, skip it (eBay filter already
        // handles this, but guard against clock drift / edge cases).
        if (endTime && new Date(endTime) > cutoff) {
          pageHasBeyondCutoff = true;
          continue;
        }

        const watchCount = parseInt(item.WatchCount || '0', 10);
        const hitCount = parseInt(item.HitCount || '0', 10);
        const quantitySold = parseInt(item.SellingStatus?.QuantitySold || '0', 10);

        if (watchCount > maxWatchers) continue;
        if (quantitySold > 0) continue;

        const timeLeftMs = endTime ? new Date(endTime).getTime() - now.getTime() : 0;
        const hoursLeft = Math.max(0, Math.floor(timeLeftMs / (1000 * 60 * 60)));
        const minutesLeft = Math.max(0, Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60)));

        const rawNative = item.SellingStatus?.CurrentPrice;
        const rawConverted = item.SellingStatus?.ConvertedCurrentPrice;
        const currentPrice = parseFloat(
          typeof rawNative === 'object' ? (rawNative?._ ?? '0') : (rawNative ?? '0')
        );
        const currentPriceUSD = parseFloat(
          typeof rawConverted === 'object' ? (rawConverted?._ ?? '0') : (rawConverted ?? currentPrice ?? '0')
        );
        const currency = (
          typeof rawNative === 'object' ? rawNative?.$?.currencyID : undefined
        ) || 'USD';

        const rawPic = item.PictureDetails?.PictureURL;
        const mainImageUrl = Array.isArray(rawPic) ? rawPic[0] : (rawPic || '');

        // Map item.Site to eBay marketplace ID for Analytics API
        const SITE_TO_MARKETPLACE = {
          'US':           'EBAY_US',
          'eBayMotors':   'EBAY_MOTORS',
          'Canada':       'EBAY_CA',
          'CanadaFrench': 'EBAY_CA_FR',
          'UK':           'EBAY_GB',
          'Australia':    'EBAY_AU',
          'Germany':      'EBAY_DE',
          'France':       'EBAY_FR',
          'Italy':        'EBAY_IT',
          'Spain':        'EBAY_ES',
          'Netherlands':  'EBAY_NL',
        };
        const marketplaceId = SITE_TO_MARKETPLACE[item.Site] || 'EBAY_US';

        filteredListings.push({
          itemId: item.ItemID,
          title: item.Title,
          sku: item.SKU || '',
          currentPrice,
          currentPriceUSD,
          currency,
          marketplaceId,
          endTime,
          hoursLeft,
          minutesLeft,
          watchCount,
          hitCount,
          quantitySold,
          mainImageUrl,
          categoryName: item.PrimaryCategory?.CategoryName || '',
          quantity: parseInt(item.Quantity || '1', 10),
        });
      }

      // Stream progress to client
      send({ type: 'progress', page, totalPages, count: filteredListings.length });

      // Stop early if all items on this page are already beyond the 24-hour window
      // (eBay has finished returning relevant results)
      if (pageHasBeyondCutoff && items.every(item => {
        const et = item.ListingDetails?.EndTime;
        return et && new Date(et) > cutoff;
      })) {
        break;
      }

      page++;
    } while (page <= totalPages);

    // â”€â”€ Enrich with real views from eBay Analytics API (HitCount is deprecated) â”€â”€â”€â”€â”€
    if (filteredListings.length > 0 && !aborted) {
      send({ type: 'progress', page: totalPages, totalPages, count: filteredListings.length, phase: 'analytics' });

      // Subtract 2 days (48 hours) from current time to guarantee the end date is in the past across all time zones and finalized on eBay.
      const analyticsEnd   = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const analyticsStart = new Date(analyticsEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fromStr = analyticsStart.toISOString().slice(0, 10).replace(/-/g, '');
      const toStr   = analyticsEnd.toISOString().slice(0, 10).replace(/-/g, '');

      // Group listing IDs by marketplace using item.Site-derived marketplaceId
      const byMarketplace = {};
      for (const l of filteredListings) {
        (byMarketplace[l.marketplaceId] = byMarketplace[l.marketplaceId] || []).push(l.itemId);
      }

      const viewsMap = new Map();
      const unavailableViewIds = new Set();
      const accessToken = await ensureValidToken(seller);
      const ANALYTICS_BATCH = 200;
      const EXPIRING_LISTINGS_ANALYTICS_REQUEST_DELAY_MS = 2500;
      let analyticsRequestCount = 0;
      let analyticsViewsUnavailable = false;

      for (const [marketplaceId, ids] of Object.entries(byMarketplace)) {
        if (aborted) break;
        for (let i = 0; i < ids.length; i += ANALYTICS_BATCH) {
          if (aborted) break;
          const batch  = ids.slice(i, i + ANALYTICS_BATCH);
          const filter = `marketplace_ids:{${marketplaceId}},date_range:[${fromStr}..${toStr}],listing_ids:{${batch.join('|')}}`;
          try {
            if (analyticsRequestCount > 0) {
              await new Promise(resolve => setTimeout(resolve, EXPIRING_LISTINGS_ANALYTICS_REQUEST_DELAY_MS));
            }
            analyticsRequestCount++;
            const analyticsRes = await axios.get(
              'https://api.ebay.com/sell/analytics/v1/traffic_report',
              {
                params: { dimension: 'LISTING', metric: 'LISTING_VIEWS_TOTAL', filter },
                headers: { Authorization: `Bearer ${accessToken}`, 'X-EBAY-C-MARKETPLACE-ID': marketplaceId },
              }
            );
            for (const id of batch) viewsMap.set(String(id), 0);
            for (const rec of (analyticsRes.data?.records || [])) {
              const id    = rec.dimensionValues?.[0]?.value;
              const views = rec.metricValues?.[0]?.value ?? 0;
              if (id) viewsMap.set(String(id), views);
            }
          } catch (analyticsErr) {
            console.warn(`[Expiring Listings] Analytics API error for ${marketplaceId}:`, analyticsErr.response?.data || analyticsErr.message);
            analyticsViewsUnavailable = true;
            for (const id of batch) unavailableViewIds.add(String(id));
          }
        }
      }

      if (analyticsViewsUnavailable) {
        send({
          type: 'warning',
          warning: 'eBay Analytics rate limit was reached; listings with unknown views were excluded. Try again after the quota resets.'
        });
      }

      // Update hitCount with real analytics value, then apply views filter.
      // Listings whose Analytics request failed are excluded instead of falling back to Trading API HitCount.
      for (const l of filteredListings) {
        l.viewsUnavailable = unavailableViewIds.has(String(l.itemId));
        l.hitCount = viewsMap.get(String(l.itemId)) ?? null;
      }
      const finalListings = filteredListings.filter(l =>
        !l.viewsUnavailable &&
        l.hitCount !== null &&
        l.hitCount <= maxViews
      );

      send({ type: 'done', count: finalListings.length, listings: finalListings });
    } else {
      send({ type: 'done', count: filteredListings.length, listings: filteredListings });
    }

  } catch (err) {
    console.error('[Expiring Low Activity Listings] Error:', err.message);
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});


export default router;

