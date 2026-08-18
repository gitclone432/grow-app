import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyDailyOrder from '../models/EtsyDailyOrder.js';
import EtsyStore from '../models/EtsyStore.js';

const router = Router();

/**
 * GET /etsy/daily-orders
 * Fetch daily orders for Etsy accounts
 * Query params:
 *   - date: YYYY-MM-DD format (optional)
 *   - storeId: MongoDB ObjectId (optional)
 */
router.get('/daily-orders', requireAuth, requirePageAccess('EtsyDailyOrders'), async (req, res) => {
  try {
    const { date, storeId } = req.query;

    const query = {};
    if (date) {
      query.date = date;
    }
    if (storeId) {
      query.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const orders = await EtsyDailyOrder.find(query)
      .populate('storeId', 'name')
      .sort({ date: -1, storeId: 1 })
      .lean();

    res.json({ orders });
  } catch (error) {
    console.error('Error fetching daily orders:', error);
    res.status(500).json({ error: 'Failed to fetch daily orders' });
  }
});

/**
 * POST /etsy/daily-orders
 * Add a new daily order entry
 * Body:
 *   - date: YYYY-MM-DD format
 *   - storeId: MongoDB ObjectId
 *   - orderCount: number
 *   - notes: string (optional)
 */
router.post('/daily-orders', requireAuth, requirePageAccess('EtsyDailyOrders'), async (req, res) => {
  try {
    const { date, storeId, orderCount, notes } = req.body;

    if (!date || !storeId || orderCount === undefined) {
      return res.status(400).json({ error: 'Missing required fields: date, storeId, orderCount' });
    }

    // Validate store exists
    const store = await EtsyStore.findById(storeId);
    if (!store) {
      return res.status(404).json({ error: 'Etsy store not found' });
    }

    // Check if entry already exists
    const existing = await EtsyDailyOrder.findOne({ date, storeId });
    if (existing) {
      return res.status(409).json({ error: 'Entry already exists for this date and store' });
    }

    const order = new EtsyDailyOrder({
      date,
      storeId,
      orderCount: Math.max(0, Math.floor(orderCount)),
      notes: notes || '',
    });

    await order.save();
    await order.populate('storeId', 'shopName');

    res.status(201).json({ order: order.toObject() });
  } catch (error) {
    console.error('Error creating daily order:', error);
    res.status(500).json({ error: 'Failed to create daily order' });
  }
});

/**
 * PATCH /etsy/daily-orders/:id
 * Update a daily order entry
 * Body:
 *   - date: YYYY-MM-DD format (optional)
 *   - storeId: MongoDB ObjectId (optional)
 *   - orderCount: number (optional)
 *   - notes: string (optional)
 */
router.patch('/daily-orders/:id', requireAuth, requirePageAccess('EtsyDailyOrders'), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, storeId, orderCount, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const updateData = {};
    if (date !== undefined) updateData.date = date;
    if (storeId !== undefined) {
      // Validate store exists
      const store = await EtsyStore.findById(storeId);
      if (!store) {
        return res.status(404).json({ error: 'Etsy store not found' });
      }
      updateData.storeId = storeId;
    }
    if (orderCount !== undefined) {
      updateData.orderCount = Math.max(0, Math.floor(orderCount));
    }
    if (notes !== undefined) updateData.notes = notes;

    // Check for duplicate entry if date or storeId is being changed
    if (date || storeId) {
      const existingOrder = await EtsyDailyOrder.findOne({ _id: { $ne: id } });
      if (existingOrder && existingOrder.date === (date || existingOrder.date) &&
          existingOrder.storeId.toString() === (storeId || existingOrder.storeId)) {
        return res.status(409).json({ error: 'Another entry exists for this date and store' });
      }
    }

    const order = await EtsyDailyOrder.findByIdAndUpdate(id, updateData, { new: true })
      .populate('storeId', 'shopName');

    if (!order) {
      return res.status(404).json({ error: 'Daily order not found' });
    }

    res.json({ order: order.toObject() });
  } catch (error) {
    console.error('Error updating daily order:', error);
    res.status(500).json({ error: 'Failed to update daily order' });
  }
});

/**
 * DELETE /etsy/daily-orders/:id
 * Delete a daily order entry
 */
router.delete('/daily-orders/:id', requireAuth, requirePageAccess('EtsyDailyOrders'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const order = await EtsyDailyOrder.findByIdAndDelete(id);

    if (!order) {
      return res.status(404).json({ error: 'Daily order not found' });
    }

    res.json({ message: 'Daily order deleted successfully' });
  } catch (error) {
    console.error('Error deleting daily order:', error);
    res.status(500).json({ error: 'Failed to delete daily order' });
  }
});

export default router;
