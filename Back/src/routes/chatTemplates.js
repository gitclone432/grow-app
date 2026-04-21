 import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createChatTemplateSchema } from '../schemas/index.js';
import ChatTemplate from '../models/ChatTemplate.js';

const router = Router();

// Default templates to seed (imported from original constants)
const DEFAULT_TEMPLATES = [
  {
    category: 'ORDER / INVENTORY ISSUES',
    items: [
      { label: 'Out of Stock', text: "Hi, during our final quality check, we found the item did not meet our standards and it was the last one in stock. Please cancel the order so we can issue a full refund immediately." },
      { label: 'Quality Check Failed', text: "Hi, during our quality inspection, the item did not pass our standards. We won't ship it in this condition. We can offer an alternative or a full refund—please confirm your preference." },
      { label: 'Alternative Offered', text: "Hi, we have an updated/new design available. We can ship it at no extra cost. Please confirm if you'd like to proceed with the alternative." },
      { label: 'Wrong Item Sent', text: "Hi, we're sorry for the mix-up. We can send the correct item or issue a refund. Please confirm your preferred option." },
      { label: 'Defective Item', text: "Hi, we're sorry the item arrived defective. We can offer a replacement or a full refund. Please let us know how you'd like to proceed." },
      { label: 'Missing Item', text: "Hi, we're sorry an item was missing from your order. We can send a replacement or process a refund—please confirm your preference." },
      { label: 'Damaged in Transit', text: "Hi, our shipping partner informed us your item was damaged in transit. We can issue a full refund or send a replacement. Please confirm your choice." }
    ]
  },
  {
    category: 'SHIPPING & DELIVERY PROBLEMS',
    items: [
      { label: 'Lost in Transit', text: "Hi, our shipping partner confirmed your package was lost in transit. We can offer a full refund or a replacement. Please confirm your preference." },
      { label: 'Fake Tracking Issue', text: "Hi, our shipping partner accidentally provided an incorrect tracking ID. Your item is still in transit and we will provide the correct tracking shortly." },
      { label: 'Wrong Tracking ID', text: "Hi, the tracking ID uploaded earlier was incorrect due to a system error. We will share the correct tracking details shortly." },
      { label: 'Late Delivery', text: "Hi, we apologize for the delay due to carrier or weather issues. Your order is in transit and will arrive soon. Thank you for your patience." },
      { label: 'Delivery Proof Available', text: "Hi, according to our shipping partner, your package was delivered. We have proof of delivery. Please check nearby areas or neighbors and let us know." },
      { label: 'Delivered to Neighbor', text: "Hi, sometimes packages are delivered to neighbors, mailrooms, or reception areas. Please check those places and update us." },
      { label: 'Carrier Delay', text: "Hi, there is an operational delay with the carrier hub. Your order is still on the way and we are monitoring it closely." }
    ]
  },
  {
    category: 'CANCELLATION & CHANGES',
    items: [
      { label: 'Cancel Requested', text: "Hi, we received your cancellation request. We'll check with the shipping partner and update you shortly." },
      { label: 'Cancel Declined (Shipped)', text: "Hi, the order has already shipped and cannot be canceled. You can return it after delivery for a refund." },
      { label: 'Cancel Accepted', text: "Hi, your cancellation request has been accepted. Your refund will be processed shortly." },
      { label: 'Order Change Request', text: "Hi, your order has already shipped and changes are not possible. We can assist with return or replacement after delivery." }
    ]
  },
  {
    category: 'RETURNS & REPLACEMENTS',
    items: [
      { label: 'Return Case Opened', text: "Hi, we're sorry for the issue. We can offer a refund or replacement. Please confirm your preferred resolution." },
      { label: 'Return Label Sent', text: "Hi, please package the item and drop it off using the prepaid return label. Once shipped, we will process your refund or replacement." },
      { label: 'Replacement Offered', text: "Hi, we can send a replacement item at no extra cost. Please confirm if you'd like to proceed." },
      { label: 'Replacement Shipped', text: "Hi, your replacement item has been shipped. We will update you with tracking details shortly." },
      { label: 'Return Case Close Request', text: "Hi, kindly close the return case so we can process your refund/replacement immediately. Open cases affect our seller rating." }
    ]
  },
  {
    category: 'REFUND HANDLING',
    items: [
      { label: 'Full Refund Offered', text: "Hi, we can issue a full refund immediately. Please confirm so we can proceed." },
      { label: 'Partial Refund Offered', text: "Hi, we can offer a partial refund if you'd like to keep the item. Please confirm your preference." },
      { label: 'Refund Processed', text: "Hi, your refund has been processed and should reflect in your account shortly." },
      { label: 'Refund Pending', text: "Hi, your refund is pending and will be processed as soon as the return is confirmed or the case is closed." }
    ]
  },
  {
    category: 'BUYER COMPLAINT CASES',
    items: [
      { label: 'Item Not Received (INR)', text: "Hi, according to our shipping partner, the package was delivered. Please check nearby areas and neighbors. Kindly close the INR case so we can proceed with a refund or replacement." },
      { label: 'Return Case Open', text: "Hi, we request you to close the return case so we can process your refund or replacement without delay." },
      { label: 'Negative Feedback Request', text: "Hi, we kindly request you to revise or remove negative feedback as we are ready to resolve this issue for you." },
      { label: 'Feedback Revision Request', text: "Hi, we appreciate your feedback. If we resolved your issue, kindly revise your feedback—it really helps our store." }
    ]
  },
  {
    category: 'COMMUNICATION / ADMIN',
    items: [
      { label: 'Welcome Message', text: "Hi, thank you for shopping with us! Your order is being processed and we'll update you with tracking soon." },
      { label: 'Awareness Message', text: "Hi, your order is currently being processed/in transit. Thank you for your patience and support." },
      { label: 'Wrong Message Sent', text: "Hi, we apologize for the incorrect message sent earlier. Please ignore it—your order is being handled correctly." },
      { label: 'System Error Message', text: "Hi, due to a system error, some details were updated incorrectly. We are correcting this and will update you shortly." },
      { label: 'Amazon Packaging Explanation', text: "Hi, we use Amazon shipping services, which is why the item may arrive in Amazon packaging. The product was shipped from our warehouse." }
    ]
  }
];

/**
 * GET /chat-templates
 * Get all active templates grouped by category
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const templates = await ChatTemplate.find({ isActive: true })
      .sort({ category: 1, sortOrder: 1, createdAt: 1 })
      .lean();

    // Group by category for frontend consumption
    const grouped = templates.reduce((acc, template) => {
      const existing = acc.find(g => g.category === template.category);
      if (existing) {
        existing.items.push({
          _id: template._id,
          label: template.label,
          text: template.text,
          sortOrder: template.sortOrder
        });
      } else {
        acc.push({
          category: template.category,
          items: [{
            _id: template._id,
            label: template.label,
            text: template.text,
            sortOrder: template.sortOrder
          }]
        });
      }
      return acc;
    }, []);

    res.json({ templates: grouped });
  } catch (error) {
    console.error('Error fetching chat templates:', error);
    res.status(500).json({ error: 'Failed to fetch chat templates' });
  }
});

/**
 * GET /chat-templates/all
 * Get all templates (including inactive) for management
 */
router.get('/all', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const templates = await ChatTemplate.find()
      .sort({ category: 1, sortOrder: 1, createdAt: 1 })
      .lean();

    res.json({ templates });
  } catch (error) {
    console.error('Error fetching all chat templates:', error);
    res.status(500).json({ error: 'Failed to fetch chat templates' });
  }
});

/**
 * POST /chat-templates
 * Create a new template
 */
router.post('/', requireAuth, requirePageAccess('BuyerMessages'), validate(createChatTemplateSchema), async (req, res) => {
  try {
    const { category, label, text } = req.body;

    if (!category || !label || !text) {
      return res.status(400).json({ error: 'Category, label, and text are required' });
    }

    // Get max sortOrder for this category
    const maxSort = await ChatTemplate.findOne({ category })
      .sort({ sortOrder: -1 })
      .select('sortOrder')
      .lean();

    const template = new ChatTemplate({
      category: category.trim(),
      label: label.trim(),
      text: text.trim(),
      sortOrder: (maxSort?.sortOrder ?? -1) + 1
    });

    await template.save();
    res.status(201).json({ success: true, template });
  } catch (error) {
    console.error('Error creating chat template:', error);
    res.status(500).json({ error: 'Failed to create chat template' });
  }
});

/**
 * PATCH /chat-templates/:id
 * Update a template
 */
router.patch('/:id', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const { id } = req.params;
    const { category, label, text, isActive, sortOrder } = req.body;

    const updates = {};
    if (category !== undefined) updates.category = category.trim();
    if (label !== undefined) updates.label = label.trim();
    if (text !== undefined) updates.text = text.trim();
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const template = await ChatTemplate.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true, template });
  } catch (error) {
    console.error('Error updating chat template:', error);
    res.status(500).json({ error: 'Failed to update chat template' });
  }
});

/**
 * DELETE /chat-templates/:id
 * Soft delete a template (set isActive to false)
 */
router.delete('/:id', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const { id } = req.params;
    const { hard } = req.query; // ?hard=true for permanent delete

    if (hard === 'true') {
      await ChatTemplate.findByIdAndDelete(id);
    } else {
      await ChatTemplate.findByIdAndUpdate(id, { isActive: false });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat template:', error);
    res.status(500).json({ error: 'Failed to delete chat template' });
  }
});

/**
 * POST /chat-templates/seed
 * Seed database with default templates (only if empty)
 */
router.post('/seed', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const existingCount = await ChatTemplate.countDocuments();
    
    if (existingCount > 0) {
      return res.json({ 
        success: false, 
        message: `Database already has ${existingCount} templates. Use ?force=true to overwrite.`,
        existingCount 
      });
    }

    // Flatten and insert all templates
    const toInsert = [];
    DEFAULT_TEMPLATES.forEach((group, catIndex) => {
      group.items.forEach((item, itemIndex) => {
        toInsert.push({
          category: group.category,
          label: item.label,
          text: item.text,
          sortOrder: itemIndex,
          isActive: true
        });
      });
    });

    await ChatTemplate.insertMany(toInsert);
    
    res.json({ 
      success: true, 
      message: `Seeded ${toInsert.length} templates`,
      count: toInsert.length 
    });
  } catch (error) {
    console.error('Error seeding chat templates:', error);
    res.status(500).json({ error: 'Failed to seed chat templates' });
  }
});

/**
 * PATCH /chat-templates/reorder
 * Reorder templates within a category
 */
router.patch('/reorder', requireAuth, requirePageAccess('BuyerMessages'), async (req, res) => {
  try {
    const { orderedIds } = req.body; // Array of template IDs in new order

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    // Update each template's sortOrder
    const updates = orderedIds.map((id, index) => 
      ChatTemplate.findByIdAndUpdate(id, { sortOrder: index })
    );

    await Promise.all(updates);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering chat templates:', error);
    res.status(500).json({ error: 'Failed to reorder templates' });
  }
});

export default router;
