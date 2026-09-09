import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import TemplateListing from '../models/TemplateListing.js';
import { searchAmazonProducts } from '../utils/scrapingdogSearch.js';

const router = express.Router();

router.post('/', requireAuth, requirePageAccess('AmazonSearch'), async (req, res) => {
  try {
    const {
      query,
      region,
      pages,
      excludeSponsored = true,
      maxAsins,
      sellerId
    } = req.body || {};

    const result = await searchAmazonProducts({
      query,
      region,
      pages,
      excludeSponsored,
      maxAsins
    });

    let alreadyListed = new Set();
    if (sellerId && mongoose.Types.ObjectId.isValid(String(sellerId)) && result.asins.length) {
      const existing = await TemplateListing.find({
        sellerId,
        _asinReference: { $in: result.asins },
        status: { $in: ['active', 'draft'] }
      }).select('+_asinReference').lean();
      alreadyListed = new Set(
        existing.map((row) => String(row._asinReference || '').trim().toUpperCase()).filter(Boolean)
      );
    }

    const products = result.products.map((product) => ({
      ...product,
      alreadyListed: alreadyListed.has(product.asin)
    }));

    return res.json({
      ...result,
      products,
      alreadyListedCount: alreadyListed.size
    });
  } catch (err) {
    const message = err?.message || 'Amazon search failed';
    const status = /not configured|must be at least/i.test(message) ? 400 : 502;
    console.error('[AmazonSearch]', message);
    return res.status(status).json({ error: message });
  }
});

export default router;
