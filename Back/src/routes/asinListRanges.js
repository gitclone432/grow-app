import express from 'express';
import AsinListRange from '../models/AsinListRange.js';
import AsinListProduct from '../models/AsinListProduct.js';
import AsinDirectory from '../models/AsinDirectory.js';
import AsinListCategory from '../models/AsinListCategory.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get ranges — filtered by categoryId, or all ranges when ?all=true
router.get('/', requireAuth, async (req, res) => {
  try {
    const { categoryId, all } = req.query;

    if (all === 'true') {
      // Return all ranges across all categories, with categoryName attached
      const [ranges, categories] = await Promise.all([
        AsinListRange.find({}).sort({ name: 1 }).lean(),
        AsinListCategory.find({}, '_id name').lean()
      ]);
      const catMap = Object.fromEntries(categories.map(c => [c._id.toString(), c.name]));
      const enriched = ranges.map(r => ({
        ...r,
        categoryName: catMap[r.categoryId?.toString()] || ''
      }));
      return res.json(enriched);
    }

    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId query param is required' });
    }

    const ranges = await AsinListRange.find({ categoryId }).sort({ name: 1 }).lean();
    res.json(ranges);
  } catch (error) {
    console.error('Error fetching asin list ranges:', error);
    res.status(500).json({ error: 'Failed to fetch ranges' });
  }
});

// Create a new range under a category
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Range name is required' });
    }
    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    const range = await AsinListRange.create({ name: name.trim(), categoryId });
    res.status(201).json(range);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Range already exists in this category' });
    }
    console.error('Error creating asin list range:', error);
    res.status(500).json({ error: 'Failed to create range' });
  }
});

// Rename a range
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Range name is required' });
    }
    const range = await AsinListRange.findByIdAndUpdate(
      id,
      { name: name.trim() },
      { new: true, runValidators: true }
    );
    if (!range) return res.status(404).json({ error: 'Range not found' });
    res.json(range);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Range already exists in this category' });
    }
    console.error('Error renaming asin list range:', error);
    res.status(500).json({ error: 'Failed to rename range' });
  }
});

// Shallow duplicate a range (same category, no products copied)
router.post('/duplicate', requireAuth, async (req, res) => {
  try {
    const { sourceRangeId, name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Range name is required' });
    }
    if (!sourceRangeId) {
      return res.status(400).json({ error: 'sourceRangeId is required' });
    }
    const source = await AsinListRange.findById(sourceRangeId).lean();
    if (!source) return res.status(404).json({ error: 'Source range not found' });
    const range = await AsinListRange.create({ name: name.trim(), categoryId: source.categoryId });
    res.status(201).json(range);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Range already exists in this category' });
    }
    console.error('Error duplicating asin list range:', error);
    res.status(500).json({ error: 'Failed to duplicate range' });
  }
});

// Delete a range and cascade-delete its products and orphan assigned ASINs
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const products = await AsinListProduct.find({ rangeId: id }, '_id').lean();
    const productIds = products.map(p => p._id);

    if (productIds.length > 0) {
      await AsinDirectory.updateMany(
        { listProductId: { $in: productIds } },
        { $unset: { listProductId: '' } }
      );
      await AsinListProduct.deleteMany({ _id: { $in: productIds } });
    }

    await AsinListRange.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asin list range:', error);
    res.status(500).json({ error: 'Failed to delete range' });
  }
});

export default router;
