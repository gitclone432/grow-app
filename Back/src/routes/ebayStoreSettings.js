import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import EbayStoreListerSettings, { DEFAULT_LISTER_SETTINGS, DEFAULT_ORDER_SETTINGS } from '../models/EbayStoreListerSettings.js';
import { patchDescriptionTemplateStoreMap } from '../utils/descriptionTemplateGalleryStore.js';
import { mergeOrderSettings } from '../utils/ebayStoreOrderSettings.js';
import { normalizeStoreLocationForEbay } from '../utils/ebayTradingLocation.js';
const router = express.Router();

const VALID_REGIONS = new Set(['US', 'UK', 'AU']);

function normalizeRegion(value) {
  const region = String(value || 'US').trim().toUpperCase();
  return VALID_REGIONS.has(region) ? region : 'US';
}

function mergeListerSettings(input = {}) {
  const allowed = { ...DEFAULT_LISTER_SETTINGS };
  for (const key of Object.keys(allowed)) {
    if (input?.[key] == null) continue;
    if (key === 'defaultLocation' || key === 'defaultPostalCode') {
      allowed[key] = String(input[key]).trim();
      continue;
    }
    if (key === 'brandMode') {
      allowed.brandMode = String(input[key]).trim() === 'does_not_apply'
        ? 'does_not_apply'
        : 'from_scraper';
      continue;
    }
    if (String(input[key]).trim() !== '') {
      allowed[key] = input[key];
    } else if (input[key] === '') {
      allowed[key] = DEFAULT_LISTER_SETTINGS[key];
    }
  }

  const normalizedLocation = normalizeStoreLocationForEbay({
    location: allowed.defaultLocation,
    country: allowed.defaultCountry,
    postalCode: allowed.defaultPostalCode,
  });
  allowed.defaultLocation = normalizedLocation.location;
  allowed.defaultCountry = normalizedLocation.country;
  allowed.defaultPostalCode = normalizedLocation.postalCode;

  return allowed;
}

router.get('/', requireAuth, requirePageAccess('StoresPage'), async (req, res) => {
  try {
    const sellerId = String(req.query.sellerId || '').trim();
    const region = normalizeRegion(req.query.region);

    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ error: 'Valid sellerId is required' });
    }

    const seller = await Seller.findById(sellerId).populate('user', 'username email active');
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    let settings = await EbayStoreListerSettings.findOne({
      sellerId,
      supplier: 'amazon',
      region,
    }).lean();

    if (!settings) {
      settings = {
        sellerId,
        supplier: 'amazon',
        region,
        lister: { ...DEFAULT_LISTER_SETTINGS },
        orders: { ...DEFAULT_ORDER_SETTINGS },
        general: { descriptionTemplateId: '', ebayUserId: '' },
      };
    }

    res.json({
      seller: {
        id: seller._id,
        username: seller.user?.username || '',
        email: seller.user?.email || '',
        isStoreActive: seller.isStoreActive !== false,
        ebayMarketplaces: seller.ebayMarketplaces || [],
        ebayUserId: seller.ebayUserId || '',
      },
      settings: {
        sellerId,
        supplier: 'amazon',
        region,
        lister: mergeListerSettings(settings.lister),
        orders: mergeOrderSettings(settings.orders),
        general: {
          descriptionTemplateId: settings.general?.descriptionTemplateId || '',
          // Prefer Seller.ebayUserId (Buyer Messages source of truth)
          ebayUserId: String(seller.ebayUserId || settings.general?.ebayUserId || '').trim(),
        },
      },
    });
  } catch (error) {
    console.error('[eBay Store Settings] GET failed:', error);
    res.status(500).json({ error: error.message || 'Failed to load store settings' });
  }
});

router.put('/', requireAuth, requirePageAccess('StoresPage'), async (req, res) => {
  try {
    const {
      sellerId,
      region: rawRegion,
      lister,
      orders,
      general,
    } = req.body || {};

    const region = normalizeRegion(rawRegion);
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ error: 'Valid sellerId is required' });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    const existingSettings = await EbayStoreListerSettings.findOne({
      sellerId,
      supplier: 'amazon',
      region,
    }).lean();

    const update = {};
    if (lister && typeof lister === 'object') {
      update.lister = mergeListerSettings(lister);
    }
    if (orders && typeof orders === 'object') {
      update.orders = mergeOrderSettings({
        ...(existingSettings?.orders || {}),
        ...orders,
      });
    }
    if (general && typeof general === 'object') {
      const ebayUserId = String(general.ebayUserId || '').trim();
      update.general = {
        descriptionTemplateId: String(general.descriptionTemplateId || '').trim(),
        ebayUserId,
      };
      // Keep Seller.ebayUserId in sync — Buyer Messages uses this to identify seller vs buyer
      seller.ebayUserId = ebayUserId || null;
      await seller.save();
    }

    const saved = await EbayStoreListerSettings.findOneAndUpdate(
      { sellerId, supplier: 'amazon', region },
      {
        $set: {
          sellerId,
          supplier: 'amazon',
          region,
          ...update,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (update.general?.descriptionTemplateId != null) {
      try {
        await patchDescriptionTemplateStoreMap({
          [String(sellerId)]: update.general.descriptionTemplateId,
        });
      } catch (galleryErr) {
        console.warn('[eBay Store Settings] description template map sync failed:', galleryErr.message);
      }
    }

    const refreshedSeller = await Seller.findById(sellerId).select('ebayUserId').lean();

    res.json({
      success: true,
      settings: {
        sellerId,
        supplier: 'amazon',
        region,
        lister: mergeListerSettings(saved.lister),
        orders: mergeOrderSettings(saved.orders),
        general: {
          descriptionTemplateId: saved.general?.descriptionTemplateId || '',
          ebayUserId: String(refreshedSeller?.ebayUserId || saved.general?.ebayUserId || '').trim(),
        },
      },
    });
  } catch (error) {
    console.error('[eBay Store Settings] PUT failed:', error);
    res.status(500).json({ error: error.message || 'Failed to save store settings' });
  }
});

export default router;
