import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import SellerPricingConfig from '../models/SellerPricingConfig.js';
import ListingTemplate from '../models/ListingTemplate.js';
import { validateProfitTiers } from '../utils/pricingCalculator.js';

const router = express.Router();

// Get pricing config for specific seller+template
router.get('/', requireAuth, async (req, res) => {
  try {
    const { sellerId, templateId } = req.query;

    if (!sellerId || !templateId) {
      return res.status(400).json({ 
        error: 'sellerId and templateId are required' 
      });
    }

    // Try to find seller-specific config
    const sellerConfig = await SellerPricingConfig.findOne({ 
      sellerId, 
      templateId 
    });

    if (sellerConfig) {
      return res.json({
        pricingConfig: sellerConfig.pricingConfig,
        isCustom: true
      });
    }

    // Fallback to template's default config
    const template = await ListingTemplate.findById(templateId);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      pricingConfig: template.pricingConfig || {
        enabled: false,
        spentRate: null,
        payoutRate: null,
        desiredProfit: null,
        fixedFee: 0,
        saleTax: 0,
        ebayFee: 12.9,
        adsFee: 3,
        tdsFee: 1,
        shippingCost: 0,
        taxRate: 10
      },
      isCustom: false
    });
  } catch (error) {
    console.error('Error fetching pricing config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update pricing config for seller+template
router.post('/', requireAuth, async (req, res) => {
  try {
    const { sellerId, templateId, pricingConfig } = req.body;

    if (!sellerId || !templateId) {
      return res.status(400).json({ 
        error: 'sellerId and templateId are required' 
      });
    }

    if (!pricingConfig) {
      return res.status(400).json({ 
        error: 'pricingConfig is required' 
      });
    }

    // Validate profit tiers if enabled
    if (pricingConfig.profitTiers?.enabled) {
      try {
        validateProfitTiers(pricingConfig.profitTiers.tiers);
      } catch (validationError) {
        return res.status(400).json({ 
          error: `Invalid profit tiers: ${validationError.message}` 
        });
      }
    }

    // Upsert: create if not exists, update if exists
    const config = await SellerPricingConfig.findOneAndUpdate(
      { sellerId, templateId },
      { 
        pricingConfig,
        createdBy: req.user.userId
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error saving pricing config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete pricing config (revert to template default)
router.delete('/', requireAuth, async (req, res) => {
  try {
    const { sellerId, templateId } = req.query;

    if (!sellerId || !templateId) {
      return res.status(400).json({ 
        error: 'sellerId and templateId are required' 
      });
    }

    await SellerPricingConfig.findOneAndDelete({ 
      sellerId, 
      templateId 
    });

    res.json({
      success: true,
      message: 'Pricing config deleted, reverted to template default'
    });
  } catch (error) {
    console.error('Error deleting pricing config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
