import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import ListingTemplate from '../models/ListingTemplate.js';
import TemplateOverride from '../models/TemplateOverride.js';
import { mergeDefaultCoreFieldDefaults } from '../constants/defaultDescriptionTemplate.js';

const router = express.Router();

// Get custom Action field for template
router.get('/action-field/:templateId', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId } = req.query;
    
    // Check for seller override first
    if (sellerId) {
      const override = await TemplateOverride.findOne({
        baseTemplateId: templateId,
        sellerId: sellerId
      });
      
      if (override?.overrides.customActionField && override.customActionField) {
        return res.json({
          actionField: override.customActionField,
          source: 'seller-override'
        });
      }
    }
    
    // Fallback to base template
    const template = await ListingTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ 
      actionField: template.customActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
      source: 'template'
    });
  } catch (error) {
    console.error('Error fetching action field:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update custom Action field for template
router.put('/action-field/:templateId', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { actionField, sellerId } = req.body;
    
    // Basic validation - just check it's not empty
    if (!actionField || !actionField.trim()) {
      return res.status(400).json({ error: 'Action field cannot be empty' });
    }
    
    // If no sellerId provided, update base template (admin action)
    if (!sellerId) {
      const template = await ListingTemplate.findByIdAndUpdate(
        templateId,
        { 
          customActionField: actionField.trim(),
          updatedAt: Date.now()
        },
        { new: true }
      );
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      return res.json({ 
        actionField: template.customActionField,
        source: 'template'
      });
    }
    
    // Create/update seller override
    const override = await TemplateOverride.findOneAndUpdate(
      { baseTemplateId: templateId, sellerId: sellerId },
      {
        $set: {
          'overrides.customActionField': true,
          customActionField: actionField.trim(),
          updatedAt: Date.now()
        }
      },
      { new: true, upsert: true }
    );
    
    res.json({
      actionField: override.customActionField,
      source: 'seller-override'
    });
  } catch (error) {
    console.error('Error updating action field:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk reset overrides for a template (apply base template to all sellers)
router.delete('/:id/bulk-reset-overrides', requireAuth, async (req, res) => {
  try {
    const { id: templateId } = req.params;
    
    // Verify template exists
    const template = await ListingTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Get affected sellers before deletion for logging
    const affectedOverrides = await TemplateOverride.find({ 
      baseTemplateId: templateId 
    }).select('sellerId');
    
    const affectedSellerIds = affectedOverrides.map(o => o.sellerId);
    
    // Perform bulk deletion
    const result = await TemplateOverride.deleteMany({ 
      baseTemplateId: templateId 
    });
    
    console.log(`[BULK RESET] Template "${template.name}" (${templateId}): Deleted ${result.deletedCount} overrides for sellers:`, affectedSellerIds);
    
    res.json({ 
      success: true,
      deletedCount: result.deletedCount,
      affectedSellers: affectedSellerIds,
      templateName: template.name,
      message: `Successfully reset ${result.deletedCount} seller customizations. All sellers will now use the base template.`
    });
  } catch (error) {
    console.error('Error in bulk reset overrides:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all templates
router.get('/', requireAuth, async (req, res) => {
  try {
    const { listProductId, rangeId } = req.query;
    const filter = {};
    if (rangeId) filter.rangeId = rangeId;
    if (listProductId) filter.listProductId = listProductId;
    const templates = await ListingTemplate.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const normalizedTemplates = templates.map((template) => {
      const normalized = template.toObject();
      normalized.asinAutomation = {
        enabled: true,
        fieldConfigs: Array.isArray(normalized?.asinAutomation?.fieldConfigs)
          ? normalized.asinAutomation.fieldConfigs
          : []
      };
      normalized.coreFieldDefaults = mergeDefaultCoreFieldDefaults(normalized.coreFieldDefaults || {});
      return normalized;
    });

    res.json(normalizedTemplates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single template by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const template = await ListingTemplate.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const normalizedTemplate = template.toObject();
    normalizedTemplate.asinAutomation = {
      enabled: true,
      fieldConfigs: Array.isArray(normalizedTemplate?.asinAutomation?.fieldConfigs)
        ? normalizedTemplate.asinAutomation.fieldConfigs
        : []
    };
    normalizedTemplate.coreFieldDefaults = mergeDefaultCoreFieldDefaults(normalizedTemplate.coreFieldDefaults || {});

    res.json(normalizedTemplate);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new template
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description, category, ebayCategory, customColumns, asinAutomation, pricingConfig, coreFieldDefaults, rangeId, listProductId } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    const templateData = {
      name,
      description,
      category,
      ebayCategory,
      customColumns: customColumns || [],
      asinAutomation: asinAutomation || { enabled: true, fieldConfigs: [] },
      pricingConfig: pricingConfig || { enabled: false },
      createdBy: req.user.userId
    };
    
    // Add coreFieldDefaults if provided
    if (coreFieldDefaults !== undefined) {
      templateData.coreFieldDefaults = mergeDefaultCoreFieldDefaults(coreFieldDefaults);
    } else {
      templateData.coreFieldDefaults = mergeDefaultCoreFieldDefaults({});
    }

    // Add hierarchy assignment if provided
    if (rangeId) templateData.rangeId = rangeId;
    if (listProductId) templateData.listProductId = listProductId;
    
    const template = new ListingTemplate(templateData);
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Duplicate template
router.post('/:id/duplicate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the source template
    const sourceTemplate = await ListingTemplate.findById(id);
    
    if (!sourceTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Generate unique name with (Copy) suffix
    let duplicateName = `${sourceTemplate.name} (Copy)`;
    let copyNumber = 2;
    
    // Check if name already exists and increment counter
    while (await ListingTemplate.findOne({ name: duplicateName })) {
      duplicateName = `${sourceTemplate.name} (Copy ${copyNumber})`;
      copyNumber++;
    }
    
    // Create duplicate with all configurations
    const duplicateData = {
      name: duplicateName,
      description: sourceTemplate.description,
      category: sourceTemplate.category,
      ebayCategory: sourceTemplate.ebayCategory,
      customColumns: sourceTemplate.customColumns ? JSON.parse(JSON.stringify(sourceTemplate.customColumns)) : [],
      asinAutomation: sourceTemplate.asinAutomation ? {
        enabled: true,
        fieldConfigs: sourceTemplate.asinAutomation.fieldConfigs ? 
          JSON.parse(JSON.stringify(sourceTemplate.asinAutomation.fieldConfigs)) : []
      } : { enabled: true, fieldConfigs: [] },
      pricingConfig: sourceTemplate.pricingConfig ? {
        enabled: sourceTemplate.pricingConfig.enabled,
        spentRate: sourceTemplate.pricingConfig.spentRate,
        payoutRate: sourceTemplate.pricingConfig.payoutRate,
        desiredProfit: sourceTemplate.pricingConfig.desiredProfit,
        fixedFee: sourceTemplate.pricingConfig.fixedFee,
        saleTax: sourceTemplate.pricingConfig.saleTax,
        ebayFee: sourceTemplate.pricingConfig.ebayFee,
        adsFee: sourceTemplate.pricingConfig.adsFee,
        tdsFee: sourceTemplate.pricingConfig.tdsFee,
        shippingCost: sourceTemplate.pricingConfig.shippingCost,
        taxRate: sourceTemplate.pricingConfig.taxRate,
        profitTiers: sourceTemplate.pricingConfig.profitTiers ? {
          enabled: sourceTemplate.pricingConfig.profitTiers.enabled,
          tiers: sourceTemplate.pricingConfig.profitTiers.tiers ? 
            JSON.parse(JSON.stringify(sourceTemplate.pricingConfig.profitTiers.tiers)) : []
        } : { enabled: false, tiers: [] }
      } : { enabled: false },
      coreFieldDefaults: sourceTemplate.coreFieldDefaults ? 
        JSON.parse(JSON.stringify(sourceTemplate.coreFieldDefaults)) : {},
      customActionField: sourceTemplate.customActionField,
      createdBy: req.user.userId
    };
    
    const duplicateTemplate = new ListingTemplate(duplicateData);
    await duplicateTemplate.save();
    await duplicateTemplate.populate('createdBy', 'name email');
    
    res.status(201).json(duplicateTemplate);
  } catch (error) {
    console.error('Error duplicating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, category, ebayCategory, customColumns, asinAutomation, pricingConfig, coreFieldDefaults, customActionField, rangeId, listProductId } = req.body;
    
    const updateData = { 
      name, 
      description,
      category,
      ebayCategory,
      customColumns: customColumns || [],
      asinAutomation: asinAutomation || { enabled: true, fieldConfigs: [] },
      pricingConfig: pricingConfig || { enabled: false },
      updatedAt: Date.now()
    };
    
    // Add coreFieldDefaults if provided
    if (coreFieldDefaults !== undefined) {
      updateData.coreFieldDefaults = mergeDefaultCoreFieldDefaults(coreFieldDefaults);
    }

    // Add customActionField if provided
    if (customActionField !== undefined) {
      updateData.customActionField = customActionField;
    }

    // Add hierarchy assignment (allow explicit null to clear)
    if (rangeId !== undefined) updateData.rangeId = rangeId || null;
    if (listProductId !== undefined) updateData.listProductId = listProductId || null;
    
    const template = await ListingTemplate.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const template = await ListingTemplate.findByIdAndDelete(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Note: You might want to also delete associated listings
    // await TemplateListing.deleteMany({ templateId: req.params.id });
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add custom column to template
router.post('/:id/columns', requireAuth, async (req, res) => {
  try {
    const { name, displayName, dataType, defaultValue, isRequired, placeholder } = req.body;
    
    if (!name || !displayName) {
      return res.status(400).json({ error: 'Column name and display name are required' });
    }
    
    const template = await ListingTemplate.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Calculate next order number
    const maxOrder = template.customColumns.length > 0 
      ? Math.max(...template.customColumns.map(col => col.order))
      : 38;
    
    template.customColumns.push({
      name,
      displayName,
      dataType: dataType || 'text',
      defaultValue: defaultValue || '',
      isRequired: isRequired || false,
      order: maxOrder + 1,
      placeholder: placeholder || ''
    });
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.json(template);
  } catch (error) {
    console.error('Error adding column:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update custom column
router.put('/:id/columns/:columnName', requireAuth, async (req, res) => {
  try {
    const { displayName, dataType, defaultValue, isRequired, placeholder } = req.body;
    
    const template = await ListingTemplate.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const columnIndex = template.customColumns.findIndex(
      col => col.name === req.params.columnName
    );
    
    if (columnIndex === -1) {
      return res.status(404).json({ error: 'Column not found' });
    }
    
    if (displayName) template.customColumns[columnIndex].displayName = displayName;
    if (dataType) template.customColumns[columnIndex].dataType = dataType;
    if (defaultValue !== undefined) template.customColumns[columnIndex].defaultValue = defaultValue;
    if (isRequired !== undefined) template.customColumns[columnIndex].isRequired = isRequired;
    if (placeholder !== undefined) template.customColumns[columnIndex].placeholder = placeholder;
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.json(template);
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete custom column
router.delete('/:id/columns/:columnName', requireAuth, async (req, res) => {
  try {
    const template = await ListingTemplate.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    template.customColumns = template.customColumns.filter(
      col => col.name !== req.params.columnName
    );
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.json(template);
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder custom columns
router.post('/:id/columns/reorder', requireAuth, async (req, res) => {
  try {
    const { columnOrders } = req.body; // Array of { name, order }
    
    const template = await ListingTemplate.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    columnOrders.forEach(({ name, order }) => {
      const column = template.customColumns.find(col => col.name === name);
      if (column) {
        column.order = order;
      }
    });
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.json(template);
  } catch (error) {
    console.error('Error reordering columns:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
