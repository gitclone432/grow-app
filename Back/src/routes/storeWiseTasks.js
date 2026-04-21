// routes/storeWiseTasks.js
import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Assignment from '../models/Assignment.js';

const router = express.Router();

// Get aggregated store-wise task summary
router.get('/summary', requireAuth, requirePageAccess('StoreWiseTasks'), async (req, res) => {
  try {
    // Admins see ALL tasks regardless of scheduled date
    const aggregation = await Assignment.aggregate([
      {
        $lookup: {
          from: 'stores',
          localField: 'store',
          foreignField: '_id',
          as: 'storeData'
        }
      },
      { $unwind: '$storeData' },
      {
        $group: {
          _id: {
            store: '$store',
            storeName: '$storeData.name',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$scheduledDate',
                timezone: '+05:30' // IST timezone
              }
            }
          },
          totalQuantity: { $sum: '$quantity' },
          completedQuantity: { $sum: '$completedQuantity' },
          assignmentCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          storeId: '$_id.store',
          storeName: '$_id.storeName',
          date: '$_id.date',
          totalQuantity: 1,
          completedQuantity: 1,
          pendingQuantity: { $subtract: ['$totalQuantity', '$completedQuantity'] },
          assignmentCount: 1
        }
      },
      { $sort: { date: -1, storeName: 1 } }
    ]);

    res.json(aggregation);
  } catch (e) {
    console.error('Failed to fetch store-wise summary:', e);
    res.status(500).json({ message: 'Failed to fetch store-wise summary.' });
  }
});

// Get detailed assignments for a specific store and date
router.get('/details', requireAuth, requirePageAccess('StoreWiseTasks'), async (req, res) => {
  try {
    const { 
      storeId, date, page, limit,
      // Filter parameters
      productTitle, sourcePlatform, category, subcategory,
      createdByTask, marketplace, listerUsername, sharedBy
    } = req.query;
    
    if (!storeId || !date) {
      return res.status(400).json({ message: 'storeId and date are required' });
    }

    // Parse the date and create a range for the entire day in IST
    const startDate = new Date(date + 'T00:00:00+05:30');
    const endDate = new Date(date + 'T23:59:59+05:30');

    const query = {
      store: storeId,
      scheduledDate: { $gte: startDate, $lte: endDate }
    };

    if (marketplace) {
      query.marketplace = marketplace;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);

    // Fetch all matching items with filters
    let items = await Assignment.find(query)
      .populate([
        { path: 'task', populate: [{ path: 'sourcePlatform createdBy category subcategory range', select: 'name username' }] },
        { path: 'lister', select: 'username email' },
        { path: 'listingPlatform', select: 'name' },
        { path: 'store', select: 'name' },
        { path: 'createdBy', select: 'username' },
        { path: 'rangeQuantities.range', select: 'name' },
      ])
      .sort({ createdAt: -1 });

    // Apply filters that require populated data
    if (sourcePlatform) {
      const platforms = sourcePlatform.split(',');
      items = items.filter(item => platforms.includes(item.task?.sourcePlatform?.name));
    }
    if (category) {
      const categories = category.split(',');
      items = items.filter(item => categories.includes(item.task?.category?.name));
    }
    if (subcategory) {
      const subcategories = subcategory.split(',');
      items = items.filter(item => subcategories.includes(item.task?.subcategory?.name));
    }
    if (createdByTask) {
      const creators = createdByTask.split(',');
      items = items.filter(item => creators.includes(item.task?.createdBy?.username));
    }
    if (listerUsername) {
      const listers = listerUsername.split(',');
      items = items.filter(item => listers.includes(item.lister?.username));
    }
    if (sharedBy) {
      const sharers = sharedBy.split(',');
      items = items.filter(item => sharers.includes(item.createdBy?.username));
    }
    if (productTitle) {
      const titleLower = productTitle.toLowerCase();
      items = items.filter(item => 
        item.task?.productTitle?.toLowerCase().includes(titleLower)
      );
    }

    const total = items.length;
    const paginatedItems = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({ items: paginatedItems, total, page: pageNum, limit: limitNum });
  } catch (e) {
    console.error('Failed to fetch store-date details:', e);
    res.status(500).json({ message: 'Failed to fetch store-date details.' });
  }
});

export default router;
