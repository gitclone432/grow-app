import express from 'express';
const router = express.Router();
import { requireAuth } from '../middleware/auth.js';
import TemplateOverride from '../models/TemplateOverride.js';
import ListingTemplate from '../models/ListingTemplate.js';
import { 
  getEffectiveTemplate, 
  mergeTemplate, 
  hasOverride,
  getOverrideCount,
  getOverriddenSellers 
} from '../utils/templateMerger.js';

/**
 * Get count of sellers who have overridden a template
 * GET /api/template-overrides/:templateId/count
 */
router.get('/:templateId/count', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const count = await TemplateOverride.countDocuments({
      baseTemplateId: templateId
    });
    
    res.json({ count, templateId });
  } catch (error) {
    console.error('Error counting overrides:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get effective template for seller (base + overrides merged)
 * GET /api/template-overrides/:templateId/effective?sellerId=xxx
 */
router.get('/:templateId/effective', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId } = req.query;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    const effectiveTemplate = await getEffectiveTemplate(templateId, sellerId);
    res.json(effectiveTemplate);
  } catch (error) {
    console.error('Error getting effective template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get seller's override for a template (if exists)
 * GET /api/template-overrides/:templateId/override?sellerId=xxx
 */
router.get('/:templateId/override', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId } = req.query;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    const override = await TemplateOverride.findOne({
      baseTemplateId: templateId,
      sellerId: sellerId
    });
    
    res.json(override || null);
  } catch (error) {
    console.error('Error getting override:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check if seller has override for template
 * GET /api/template-overrides/:templateId/has-override?sellerId=xxx
 */
router.get('/:templateId/has-override', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId } = req.query;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    const exists = await hasOverride(templateId, sellerId);
    res.json({ hasOverride: exists });
  } catch (error) {
    console.error('Error checking override:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get override count for template (how many sellers customized it)
 * GET /api/template-overrides/:templateId/count
 */
router.get('/:templateId/count', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const count = await getOverrideCount(templateId);
    res.json({ count });
  } catch (error) {
    console.error('Error getting override count:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create or update seller's override (full replacement)
 * PUT /api/template-overrides/:templateId/override
 */
router.put('/:templateId/override', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId, overrides, ...overrideData } = req.body;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    if (!overrides) {
      return res.status(400).json({ error: 'overrides object is required' });
    }
    
    // Verify base template exists
    const baseTemplate = await ListingTemplate.findById(templateId);
    if (!baseTemplate) {
      return res.status(404).json({ error: 'Base template not found' });
    }
    
    // Upsert override
    const override = await TemplateOverride.findOneAndUpdate(
      { baseTemplateId: templateId, sellerId: sellerId },
      { 
        $set: {
          overrides,
          ...overrideData,
          updatedAt: Date.now()
        }
      },
      { new: true, upsert: true }
    );
    
    console.log(`Template override saved for seller ${sellerId} on template ${templateId}`);
    res.json(override);
  } catch (error) {
    console.error('Error saving override:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Partially update specific override section
 * PATCH /api/template-overrides/:templateId/override/:section
 */
router.patch('/:templateId/override/:section', requireAuth, async (req, res) => {
  try {
    const { templateId, section } = req.params;
    const { sellerId, data } = req.body;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    // Validate section
    const validSections = ['customColumns', 'asinAutomation', 'pricingConfig', 'coreFieldDefaults', 'customActionField'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ error: `Invalid section. Must be one of: ${validSections.join(', ')}` });
    }
    
    // Verify base template exists
    const baseTemplate = await ListingTemplate.findById(templateId);
    if (!baseTemplate) {
      return res.status(404).json({ error: 'Base template not found' });
    }
    
    const update = {
      [`overrides.${section}`]: true,
      [section]: data,
      updatedAt: Date.now()
    };
    
    const override = await TemplateOverride.findOneAndUpdate(
      { baseTemplateId: templateId, sellerId: sellerId },
      { $set: update },
      { new: true, upsert: true }
    );
    
    console.log(`Template override section '${section}' updated for seller ${sellerId} on template ${templateId}`);
    res.json(override);
  } catch (error) {
    console.error('Error updating override section:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset seller's override (revert to base template)
 * DELETE /api/template-overrides/:templateId/override?sellerId=xxx
 */
router.delete('/:templateId/override', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId } = req.query;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    const result = await TemplateOverride.deleteOne({
      baseTemplateId: templateId,
      sellerId: sellerId
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Override not found' });
    }
    
    console.log(`Template override deleted for seller ${sellerId} on template ${templateId}`);
    res.json({ message: 'Override deleted, reverted to base template' });
  } catch (error) {
    console.error('Error deleting override:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset specific section of override (revert section to base template)
 * DELETE /api/template-overrides/:templateId/override/:section?sellerId=xxx
 */
router.delete('/:templateId/override/:section', requireAuth, async (req, res) => {
  try {
    const { templateId, section } = req.params;
    const { sellerId } = req.query;
    
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    
    // Validate section
    const validSections = ['customColumns', 'asinAutomation', 'pricingConfig', 'coreFieldDefaults', 'customActionField'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ error: `Invalid section. Must be one of: ${validSections.join(', ')}` });
    }
    
    const update = {
      [`overrides.${section}`]: false,
      [section]: undefined
    };
    
    const override = await TemplateOverride.findOneAndUpdate(
      { baseTemplateId: templateId, sellerId: sellerId },
      { $set: update },
      { new: true }
    );
    
    if (!override) {
      return res.status(404).json({ error: 'Override not found' });
    }
    
    // If all sections are now false, delete the override document
    const hasAnyOverride = Object.values(override.overrides).some(v => v === true);
    if (!hasAnyOverride) {
      await TemplateOverride.deleteOne({ _id: override._id });
      console.log(`All overrides cleared for seller ${sellerId} on template ${templateId}, document deleted`);
      return res.json({ message: 'All overrides cleared, override document deleted' });
    }
    
    console.log(`Template override section '${section}' cleared for seller ${sellerId} on template ${templateId}`);
    res.json(override);
  } catch (error) {
    console.error('Error clearing override section:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
