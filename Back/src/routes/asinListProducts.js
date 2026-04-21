import express from 'express';
import AsinListProduct from '../models/AsinListProduct.js';
import AsinDirectory from '../models/AsinDirectory.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all products under a range (or all products when ?all=true)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rangeId, all } = req.query;

    if (all === 'true') {
      const products = await AsinListProduct.find({}).sort({ name: 1 }).lean();
      return res.json(products);
    }

    if (!rangeId) {
      return res.status(400).json({ error: 'rangeId query param is required' });
    }

    const products = await AsinListProduct.find({ rangeId }).sort({ name: 1 }).lean();
    res.json(products);
  } catch (error) {
    console.error('Error fetching asin list products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create a new product under a range
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, rangeId, categoryId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    if (!rangeId) {
      return res.status(400).json({ error: 'rangeId is required' });
    }
    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    const product = await AsinListProduct.create({ name: name.trim(), rangeId, categoryId });
    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Product already exists in this range' });
    }
    console.error('Error creating asin list product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Move selected ASINs to a product list
router.post('/move', requireAuth, async (req, res) => {
  try {
    const { asinIds, productId } = req.body;

    if (!asinIds || !Array.isArray(asinIds) || asinIds.length === 0) {
      return res.status(400).json({ error: 'asinIds array is required' });
    }
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    // Verify product exists
    const product = await AsinListProduct.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const result = await AsinDirectory.updateMany(
      { _id: { $in: asinIds } },
      { listProductId: productId, movedAt: new Date() }
    );

    console.log(`✅ Moved ${result.modifiedCount} ASINs to product ${product.name} (${productId})`);

    res.json({
      movedCount: result.modifiedCount,
      productId,
      productName: product.name
    });
  } catch (error) {
    console.error('Error moving ASINs to product list:', error);
    res.status(500).json({ error: 'Failed to move ASINs' });
  }
});

// Rename a product
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    const updated = await AsinListProduct.findByIdAndUpdate(
      id,
      { name: name.trim() },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A product with that name already exists in this range' });
    }
    console.error('Error renaming product:', error);
    res.status(500).json({ error: 'Failed to rename product' });
  }
});

// Copy selected products (by id) into a target range
router.post('/copy-to-range', requireAuth, async (req, res) => {
  try {
    const { productIds, targetRangeId, targetRangeIds } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds array is required' });
    }

    // Support both singular (legacy) and plural form
    const rangeIds = targetRangeIds && targetRangeIds.length > 0
      ? targetRangeIds
      : targetRangeId ? [targetRangeId] : [];
    if (rangeIds.length === 0) {
      return res.status(400).json({ error: 'targetRangeId or targetRangeIds is required' });
    }

    const AsinListRange = (await import('../models/AsinListRange.js')).default;
    const sourceProducts = await AsinListProduct.find({ _id: { $in: productIds } }).lean();

    let copied = 0;
    const skippedNames = [];

    for (const rangeId of rangeIds) {
      const targetRange = await AsinListRange.findById(rangeId).lean();
      if (!targetRange) continue;

      for (const src of sourceProducts) {
        try {
          await AsinListProduct.create({
            name: src.name,
            rangeId,
            categoryId: targetRange.categoryId
          });
          copied++;
        } catch (err) {
          if (err.code === 11000) {
            skippedNames.push(src.name);
          } else {
            throw err;
          }
        }
      }
    }

    res.json({ copied, skipped: skippedNames.length, skippedNames, rangesProcessed: rangeIds.length });
  } catch (error) {
    console.error('Error copying products to range:', error);
    res.status(500).json({ error: 'Failed to copy products' });
  }
});

// Delete a product and orphan its assigned ASINs
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    await AsinDirectory.updateMany(
      { listProductId: id },
      { $unset: { listProductId: '' } }
    );

    await AsinListProduct.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asin list product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
