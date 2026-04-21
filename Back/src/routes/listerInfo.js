// routes/listerInfo.js
import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Assignment from '../models/Assignment.js';

const router = express.Router();

// Get aggregated lister-wise task summary
router.get('/summary', requireAuth, requirePageAccess('ListerInfo'), async (req, res) => {
  try {
    const aggregation = await Assignment.aggregate([
      {
        $match: {
          lister: { $ne: null } // Only assignments with a lister
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'lister',
          foreignField: '_id',
          as: 'listerData'
        }
      },
      { $unwind: '$listerData' },
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
            lister: '$lister',
            listerName: '$listerData.username',
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
          assignmentCount: { $sum: 1 },
          stores: { $addToSet: { storeId: '$store', storeName: '$storeData.name' } }
        }
      },
      {
        $project: {
          _id: 0,
          listerId: '$_id.lister',
          listerName: '$_id.listerName',
          date: '$_id.date',
          totalQuantity: 1,
          completedQuantity: 1,
          pendingQuantity: { $subtract: ['$totalQuantity', '$completedQuantity'] },
          assignmentCount: 1,
          stores: 1,
          storeCount: { $size: '$stores' }
        }
      },
      { $sort: { date: -1, listerName: 1 } }
    ]);

    res.json(aggregation);
  } catch (e) {
    console.error('Failed to fetch lister-wise summary:', e);
    res.status(500).json({ message: 'Failed to fetch lister-wise summary.' });
  }
});

// Get detailed assignments for a specific lister and date
router.get('/details', requireAuth, requirePageAccess('ListerInfo'), async (req, res) => {
  try {
    const { listerId, date, page, limit } = req.query;
    
    if (!listerId || !date) {
      return res.status(400).json({ message: 'listerId and date are required' });
    }

    // Parse the date and create a range for the entire day in IST
    const startDate = new Date(date + 'T00:00:00+05:30');
    const endDate = new Date(date + 'T23:59:59+05:30');

    const query = {
      lister: listerId,
      scheduledDate: { $gte: startDate, $lte: endDate }
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);

    const items = await Assignment.find(query)
      .populate([
        { path: 'task', populate: [{ path: 'sourcePlatform createdBy category subcategory range', select: 'name username' }] },
        { path: 'lister', select: 'username email' },
        { path: 'listingPlatform', select: 'name' },
        { path: 'store', select: 'name' },
        { path: 'createdBy', select: 'username' },
        { path: 'rangeQuantities.range', select: 'name' }
      ])
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const totalCount = await Assignment.countDocuments(query);

    res.json({
      items,
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(totalCount / limitNum)
    });
  } catch (e) {
    console.error('Failed to fetch lister details:', e);
    res.status(500).json({ message: 'Failed to fetch lister details.' });
  }
});

export default router;
