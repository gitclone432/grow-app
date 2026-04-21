import express from 'express';
import ItemCategoryMap from '../models/ItemCategoryMap.js';
import Order from '../models/Order.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

// Get all mappings (for bulk lookup during page load)
router.get('/', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const mappings = await ItemCategoryMap.find()
      .populate('categoryId', 'name')
      .populate('rangeId', 'name')
      .populate('productId', 'name')
      .lean();
    res.json(mappings);
  } catch (error) {
    console.error('Error fetching item category mappings:', error);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// Get mappings for specific item numbers (batch lookup)
router.post('/lookup', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const { itemNumbers } = req.body;
    if (!itemNumbers || !Array.isArray(itemNumbers)) {
      return res.status(400).json({ error: 'itemNumbers array is required' });
    }

    const mappings = await ItemCategoryMap.find({ itemNumber: { $in: itemNumbers } })
      .populate('categoryId', 'name')
      .populate('rangeId', 'name')
      .populate('productId', 'name')
      .lean();

    // Return as a map for easy lookup: { itemNumber: mapping }
    const mappingIndex = {};
    mappings.forEach(m => {
      mappingIndex[m.itemNumber] = m;
    });
    res.json(mappingIndex);
  } catch (error) {
    console.error('Error looking up item category mappings:', error);
    res.status(500).json({ error: 'Failed to lookup mappings' });
  }
});

// Set/update CRP for an item (and propagate to all orders with that itemNumber)
router.put('/:itemNumber', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const { itemNumber } = req.params;
    const { categoryId, rangeId, productId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    // Upsert the mapping
    const mapping = await ItemCategoryMap.findOneAndUpdate(
      { itemNumber },
      {
        categoryId,
        rangeId: rangeId || null,
        productId: productId || null,
        assignedBy: req.user.userId
      },
      { upsert: true, new: true }
    )
      .populate('categoryId', 'name')
      .populate('rangeId', 'name')
      .populate('productId', 'name');

    // Propagate to all orders with this itemNumber
    const orderUpdate = {
      orderCategoryId: categoryId,
      orderRangeId: rangeId || null,
      orderProductId: productId || null
    };
    const updateResult = await Order.updateMany({ itemNumber }, orderUpdate);

    res.json({
      mapping,
      ordersUpdated: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Error setting item category mapping:', error);
    res.status(500).json({ error: 'Failed to set mapping' });
  }
});

// Remove CRP from an item (and clear from all orders)
router.delete('/:itemNumber', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
  try {
    const { itemNumber } = req.params;

    await ItemCategoryMap.deleteOne({ itemNumber });

    // Clear CRP from all orders with this itemNumber
    await Order.updateMany({ itemNumber }, {
      orderCategoryId: null,
      orderRangeId: null,
      orderProductId: null
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing item category mapping:', error);
    res.status(500).json({ error: 'Failed to remove mapping' });
  }
});

export default router;
