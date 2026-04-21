import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Assignment from '../models/Assignment.js';
import CompatibilityAssignment from '../models/CompatibilityAssignment.js';
import Range from '../models/Range.js';

const router = Router();

// Get eligible completed listing assignments for compatibility admin
// Conditions: Category = "Ebay Motors" AND Pending Quantity = 0 (completedQuantity >= quantity)
router.get('/eligible', requireAuth, requirePageAccess('CompatibilityTasks'), async (req, res) => {
  try {
    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    
    // Base query: completed assignments with Ebay Motors category
    const baseQuery = {
      $expr: { $gte: ['$completedQuantity', '$quantity'] }, // completedQuantity >= quantity
      quantity: { $gt: 0 }
    };
    
    // Build filter conditions
    const filters = { ...baseQuery };
    
    // Date filters
    if (req.query.dateMode === 'single' && req.query.dateSingle) {
      const d = new Date(req.query.dateSingle);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      filters.createdAt = { $gte: d, $lt: next };
    } else if (req.query.dateMode === 'range') {
      const dateFilter = {};
      if (req.query.dateFrom) dateFilter.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) {
        const toDate = new Date(req.query.dateTo);
        toDate.setDate(toDate.getDate() + 1);
        dateFilter.$lt = toDate;
      }
      if (Object.keys(dateFilter).length > 0) filters.createdAt = dateFilter;
    }
    
    // Direct ObjectId filters
    if (req.query.listingPlatform) filters.listingPlatform = req.query.listingPlatform;
    if (req.query.store) filters.store = req.query.store;
    if (req.query.marketplace) filters.marketplace = req.query.marketplace;
    
    // Fetch assignments
    const assignments = await Assignment.find(filters)
      .populate([
        { path: 'task', populate: [{ path: 'sourcePlatform category subcategory', select: 'name' }] },
        { path: 'listingPlatform store', select: 'name' },
        { path: 'lister', select: 'username' },
        { path: 'createdBy', select: 'username' },
        { path: 'rangeQuantities.range', select: 'name' }
      ])
      .select('+marketplace')
      .sort({ createdAt: -1 })
      .lean();

    // Filter for "Ebay Motors" category and subcategory if provided
    let filtered = assignments.filter(a => a.task?.category?.name === 'Ebay Motors');
    
    if (req.query.subcategory) {
      filtered = filtered.filter(a => a.task?.subcategory?._id?.toString() === req.query.subcategory);
    }
    
    // Check shared status if filter is applied
    let sharedMap = {};
    if (req.query.sharedStatus) {
      const compatAssignments = await CompatibilityAssignment.find({}).select('sourceAssignment').lean();
      sharedMap = {};
      compatAssignments.forEach(ca => {
        if (ca.sourceAssignment) sharedMap[ca.sourceAssignment.toString()] = true;
      });
      
      if (req.query.sharedStatus === 'shared') {
        filtered = filtered.filter(a => sharedMap[a._id.toString()]);
      } else if (req.query.sharedStatus === 'notShared') {
        filtered = filtered.filter(a => !sharedMap[a._id.toString()]);
      }
    } else {
      // Always fetch shared status for display
      const compatAssignments = await CompatibilityAssignment.find({}).select('sourceAssignment').lean();
      compatAssignments.forEach(ca => {
        if (ca.sourceAssignment) sharedMap[ca.sourceAssignment.toString()] = true;
      });
    }
    
    const totalItems = filtered.length;
    const paginatedItems = filtered.slice(skip, skip + limit);
    
    res.json({
      items: paginatedItems,
      sharedStatus: sharedMap,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      itemsPerPage: limit
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch eligible compatibility items.' });
  }
});

// Create a compatibility assignment for an editor
router.post('/assign', requireAuth, requirePageAccess('CompatibilityTasks'), async (req, res) => {
  try {
    const { sourceAssignmentId, editorId, rangeQuantities, notes } = req.body || {};
    if (!sourceAssignmentId || !editorId || !rangeQuantities || !Array.isArray(rangeQuantities) || rangeQuantities.length === 0) {
      return res.status(400).json({ message: 'sourceAssignmentId, editorId and rangeQuantities array are required' });
    }

    const source = await Assignment.findById(sourceAssignmentId).populate('task');
    if (!source) return res.status(404).json({ message: 'Source assignment not found' });

    const creatorId = req.user?.userId || req.user?.id;

    // Calculate total quantity from rangeQuantities
    const totalQuantity = rangeQuantities.reduce((sum, rq) => sum + (rq.quantity || 0), 0);

    const doc = await CompatibilityAssignment.create({
      sourceAssignment: source._id,
      task: source.task?._id || source.task,
      admin: creatorId,
      editor: editorId,
      quantity: totalQuantity,
      assignedRangeQuantities: rangeQuantities.map(rq => ({ range: rq.rangeId, quantity: rq.quantity })),
      completedRangeQuantities: [], // Empty initially
      notes: notes || '',
      createdBy: creatorId,
    });

    const populated = await doc.populate([
      { path: 'task', populate: [{ path: 'sourcePlatform category subcategory', select: 'name' }] },
      { path: 'admin', select: 'username' },
      { path: 'editor', select: 'username' },
      { path: 'assignedRangeQuantities.range', select: 'name' },
    ]);

    res.status(201).json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to create compatibility assignment.' });
  }
});

// Get progress of compatibility assignments (for admin tracking)
router.get('/progress', requireAuth, requirePageAccess('CompatibilityProgress'), async (req, res) => {
  try {
    const me = req.user?.userId || req.user?.id;
    
    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    
    // Base query - superadmin sees all, compatibility admin sees only their assignments
    const baseQuery = req.user?.role === 'superadmin' ? {} : { admin: me };
    
    // Build filter conditions from query params
    const filters = { ...baseQuery };
    
    // Date filters (single or range)
    if (req.query.dateMode === 'single' && req.query.dateSingle) {
      const d = new Date(req.query.dateSingle);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      filters.createdAt = { $gte: d, $lt: next };
    } else if (req.query.dateMode === 'range') {
      const dateFilter = {};
      if (req.query.dateFrom) dateFilter.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) {
        const toDate = new Date(req.query.dateTo);
        toDate.setDate(toDate.getDate() + 1);
        dateFilter.$lt = toDate;
      }
      if (Object.keys(dateFilter).length > 0) filters.createdAt = dateFilter;
    }
    
    // Editor filter
    if (req.query.editor) {
      filters.editor = req.query.editor;
    }
    
    // First get matching IDs, then do filtering that requires populated data
    let query = CompatibilityAssignment.find(filters);
    
    // Populate for filtering and display
    const items = await query
      .populate([
        { path: 'task', populate: [{ path: 'sourcePlatform category subcategory', select: 'name' }] },
        { path: 'sourceAssignment', select: 'listingPlatform store marketplace', populate: [{ path: 'listingPlatform store', select: 'name' }] },
        { path: 'editor', select: 'username' },
        { path: 'admin', select: 'username' },
        { path: 'assignedRangeQuantities.range', select: 'name' },
        { path: 'completedRangeQuantities.range', select: 'name' },
      ])
      .sort({ createdAt: -1 })
      .lean();
    
    // Apply filters that require populated data (client-side style but on server)
    let filtered = items;
    
    if (req.query.subcategory) {
      filtered = filtered.filter(item => item.task?.subcategory?._id?.toString() === req.query.subcategory);
    }
    if (req.query.listingPlatform) {
      filtered = filtered.filter(item => item.sourceAssignment?.listingPlatform?._id?.toString() === req.query.listingPlatform);
    }
    if (req.query.store) {
      filtered = filtered.filter(item => item.sourceAssignment?.store?._id?.toString() === req.query.store);
    }
    if (req.query.marketplace) {
      filtered = filtered.filter(item => item.sourceAssignment?.marketplace === req.query.marketplace);
    }
    
    // Pending quantity filter
    if (req.query.pendingMode && req.query.pendingMode !== 'none' && req.query.pendingValue) {
      const pendingValue = parseInt(req.query.pendingValue, 10);
      filtered = filtered.filter(item => {
        const pending = Math.max(0, (item.quantity || 0) - (item.completedQuantity || 0));
        if (req.query.pendingMode === 'equal') return pending === pendingValue;
        if (req.query.pendingMode === 'greater') return pending > pendingValue;
        if (req.query.pendingMode === 'less') return pending < pendingValue;
        return true;
      });
    }
    
    // Get total count after filtering
    const totalItems = filtered.length;
    
    // Apply pagination
    const paginatedItems = filtered.slice(skip, skip + limit);
    
    res.json({
      items: paginatedItems,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      itemsPerPage: limit
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch compatibility progress.' });
  }
});

// Get filter options for eligible assignments (AdminTaskList)
router.get('/eligible-filter-options', requireAuth, requirePageAccess('CompatibilityTasks'), async (req, res) => {
  try {
    const [subcategories, listingPlatforms, stores] = await Promise.all([
      // Get all subcategories from database
      mongoose.model('Subcategory').find({}).select('name').lean(),
      // Get all listing platforms from database
      mongoose.model('Platform').find({}).select('name').lean(),
      // Get all stores from database
      mongoose.model('Store').find({}).select('name').lean()
    ]);
    
    // Get unique marketplaces from completed Ebay Motors assignments
    const assignments = await Assignment.find({
      $expr: { $gte: ['$completedQuantity', '$quantity'] },
      quantity: { $gt: 0 }
    }).populate('task', 'category').select('marketplace').lean();
    
    const ebayMotorsAssignments = assignments.filter(a => a.task?.category?.name === 'Ebay Motors');
    const marketplaces = [...new Set(ebayMotorsAssignments.map(a => a.marketplace).filter(Boolean))];
    
    res.json({
      subcategories,
      listingPlatforms,
      stores,
      marketplaces
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch filter options.' });
  }
});

// Get filter options for compatibility progress page
router.get('/filter-options', requireAuth, requirePageAccess('CompatibilityProgress'), async (req, res) => {
  try {
    const [subcategories, listingPlatforms, stores, editors] = await Promise.all([
      // Get all subcategories from database
      mongoose.model('Subcategory').find({}).select('name').lean(),
      // Get all listing platforms from database
      mongoose.model('Platform').find({}).select('name').lean(),
      // Get all stores from database
      mongoose.model('Store').find({}).select('name').lean(),
      // Get all compatibility editors
      mongoose.model('User').find({ role: 'compatibilityeditor' }).select('username').lean()
    ]);
    
    // Get unique marketplaces from compatibility assignments
    const marketplaces = await CompatibilityAssignment.distinct('sourceAssignment').then(async ids => {
      const assignments = await Assignment.find({ _id: { $in: ids } }).select('marketplace').lean();
      return [...new Set(assignments.map(a => a.marketplace).filter(Boolean))];
    });
    
    res.json({
      subcategories,
      listingPlatforms,
      stores,
      marketplaces,
      editors
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch filter options.' });
  }
});

// Editor: list my compatibility assignments
router.get('/mine', requireAuth, requirePageAccess('CompatibilityEditor'), async (req, res) => {
  try {
    const me = req.user?.userId || req.user?.id;
    const items = await CompatibilityAssignment.find({ editor: me })
      .populate([
        { path: 'task', populate: [{ path: 'category subcategory', select: 'name' }] },
        { path: 'sourceAssignment', select: 'listingPlatform store marketplace rangeQuantities quantity', populate: [{ path: 'listingPlatform store', select: 'name' }, { path: 'rangeQuantities.range', select: 'name' }] },
        { path: 'assignedRangeQuantities.range', select: 'name' },
        { path: 'completedRangeQuantities.range', select: 'name' },
      ])
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch my compatibility assignments.' });
  }
});

// Editor: add/update range quantity for compatibility work
router.post('/:id/complete-range', requireAuth, requirePageAccess('CompatibilityEditor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rangeId, quantity } = req.body || {};
    if (!rangeId || quantity == null || quantity < 0) {
      return res.status(400).json({ message: 'rangeId and quantity (>= 0) required' });
    }

    const doc = await CompatibilityAssignment.findById(id).populate('task', 'category subcategory');
    if (!doc) return res.status(404).json({ message: 'Compatibility assignment not found' });

    // validate range belongs to the task.category (ranges now per-category)
    const range = await Range.findById(rangeId).populate('category');
    if (!range) return res.status(404).json({ message: 'Range not found' });
    if (String(range.category?._id) !== String(doc.task.category)) {
      return res.status(400).json({ message: 'Range does not belong to task category' });
    }

    const idx = (doc.completedRangeQuantities || []).findIndex(rq => String(rq.range) === String(rangeId));
    if (idx >= 0) doc.completedRangeQuantities[idx].quantity = quantity; else doc.completedRangeQuantities.push({ range: rangeId, quantity });

    const total = (doc.completedRangeQuantities || []).reduce((s, rq) => s + (rq.quantity || 0), 0);
    doc.completedQuantity = Math.min(total, doc.quantity);
    if (total >= doc.quantity && !doc.completedAt) doc.completedAt = new Date();

    await doc.save();

    const populated = await doc.populate([{ path: 'completedRangeQuantities.range', select: 'name' }]);
    res.json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update range quantity.' });
  }
});

export default router;
