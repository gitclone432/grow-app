import express from 'express';
import AsinListCategory from '../models/AsinListCategory.js';
import AsinListRange from '../models/AsinListRange.js';
import AsinListProduct from '../models/AsinListProduct.js';
import AsinDirectory from '../models/AsinDirectory.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all categories
router.get('/', requireAuth, async (req, res) => {
  try {
    const categories = await AsinListCategory.find().sort({ name: 1 }).lean();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching asin list categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create a new category
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const category = await AsinListCategory.create({ name: name.trim() });
    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Category already exists' });
    }
    console.error('Error creating asin list category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Delete a category and cascade-delete its ranges, products, and orphan assigned ASINs
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Find all ranges under this category
    const ranges = await AsinListRange.find({ categoryId: id }, '_id').lean();
    const rangeIds = ranges.map(r => r._id);

    if (rangeIds.length > 0) {
      // Find all products under those ranges
      const products = await AsinListProduct.find({ rangeId: { $in: rangeIds } }, '_id').lean();
      const productIds = products.map(p => p._id);

      if (productIds.length > 0) {
        // Orphan any ASINs assigned to those products
        await AsinDirectory.updateMany(
          { listProductId: { $in: productIds } },
          { $unset: { listProductId: '' } }
        );
        await AsinListProduct.deleteMany({ _id: { $in: productIds } });
      }

      await AsinListRange.deleteMany({ _id: { $in: rangeIds } });
    }

    await AsinListCategory.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asin list category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
