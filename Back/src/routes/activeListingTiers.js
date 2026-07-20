import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { requireAuth } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import { ensureValidToken } from './ebay.js';

const router = express.Router();

// Why EndTime window instead of GetMyeBaySelling:
//   - GetMyeBaySelling is capped at 25,000 listings by eBay.
//   - GetSellerList has no such cap, but requires a time range ≤121 days.
//   - GTC listings auto-renew every 30 days → EndTime is always ≤30 days from now.
//   - All other listing durations are ≤30 days as well.
//   - Therefore EndTimeFrom=now / EndTimeTo=now+32days captures 100% of active listings.
const CURRENCY_TO_MARKETPLACE = {
  USD: { label: 'eBay US', flag: '🇺🇸' },
  AUD: { label: 'eBay Australia', flag: '🇦🇺' },
  CAD: { label: 'eBay Canada', flag: '🇨🇦' },
  GBP: { label: 'eBay UK', flag: '🇬🇧' },
  EUR: { label: 'eBay Europe', flag: '🇪🇺' },
};

/**
 * @swagger
 * /ebay/active-listings/live-tiers:
 *   get:
 *     summary: Stream live pricing tier data for active listings via SSE
 *     tags: [eBay Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Server-Sent Events stream of listing tier data
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Missing sellerId
 */
router.get('/active-listings/live-tiers', requireAuth, async (req, res) => {
  const { sellerId } = req.query;
  if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

  // ── SSE setup ───────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const seller = await Seller.findById(sellerId).populate('user', 'username');
    if (!seller) { send({ type: 'error', error: 'Seller not found' }); return res.end(); }

    // 32-day window starting now — covers all active GTC and fixed-duration listings
    const endTimeFrom = new Date().toISOString();
    const endTimeTo = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

    let page = 1;
    let totalPages = 1;
    const tiers = { low: 0, mid: 0, high: 0, extra_high: 0, total: 0 };
    const marketplaceData = {}; // currency → { low, mid, high, extra_high, total }

    do {
      // Re-check token on every page — covers multi-minute crawls where token may expire mid-loop
      const token = await ensureValidToken(seller);

      const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <GranularityLevel>Coarse</GranularityLevel>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
</GetSellerListRequest>`;

      const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
        headers: {
          'X-EBAY-API-CALL-NAME': 'GetSellerList',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1271',
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

      for (const item of items) {
        // ── USD price for tier bucketing ──
        const rawConverted = item.SellingStatus?.ConvertedCurrentPrice;
        const priceUSD = parseFloat(
          typeof rawConverted === 'object' ? (rawConverted?._ ?? '0') : (rawConverted ?? '0')
        );

        // ── Native currency for marketplace detection ──
        const rawNative = item.SellingStatus?.CurrentPrice;
        const currency = (
          typeof rawNative === 'object'
            ? rawNative?.$?.currencyID
            : undefined
        ) || 'USD';

        // Ensure marketplace bucket exists
        if (!marketplaceData[currency]) {
          marketplaceData[currency] = { low: 0, mid: 0, high: 0, extra_high: 0, total: 0 };
        }

        // Tally tiers (global + per-marketplace)
        tiers.total += 1;
        marketplaceData[currency].total += 1;
        if (priceUSD < 30) {
          tiers.low += 1;
          marketplaceData[currency].low += 1;
        } else if (priceUSD < 60) {
          tiers.mid += 1;
          marketplaceData[currency].mid += 1;
        } else if (priceUSD < 100) {
          tiers.high += 1;
          marketplaceData[currency].high += 1;
        } else {
          tiers.extra_high += 1;
          marketplaceData[currency].extra_high += 1;
        }
      }

      // ── Per-page progress ────────────────────────────────────────────────────
      console.log(`[Live Tiers] ${seller.user?.username || sellerId} — page ${page}/${totalPages} (${tiers.total} listings so far)`);
      send({ type: 'progress', page, totalPages, count: tiers.total });

      page++;
    } while (page <= totalPages);

    // Shape marketplace data for the frontend (includes per-marketplace tier breakdown)
    const marketplaceBreakdown = Object.entries(marketplaceData)
      .map(([currency, mpTiers]) => ({
        currency,
        label: CURRENCY_TO_MARKETPLACE[currency]?.label || `eBay (${currency})`,
        flag: CURRENCY_TO_MARKETPLACE[currency]?.flag || '🌐',
        total: mpTiers.total,
        tiers: { low: mpTiers.low, mid: mpTiers.mid, high: mpTiers.high, extra_high: mpTiers.extra_high },
      }))
      .sort((a, b) => b.total - a.total);

    console.log(`[Live Tiers] ${seller.user?.username || sellerId} — done. ${tiers.total} total listings across ${page - 1} pages.`);
    send({
      type: 'done',
      success: true,
      sellerName: seller.user?.username || sellerId,
      tiers,
      marketplaceBreakdown,
      pagesFetched: page - 1,
    });
    res.end();
  } catch (err) {
    console.error('[Live Tiers] Error:', err.message);
    send({ type: 'error', error: err.message });
    res.end();
  }
});

export default router;
