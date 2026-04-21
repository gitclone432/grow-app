import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import ProductUmbrella from '../models/ProductUmbrella.js';

const router = express.Router();

// Get all product umbrellas
router.get('/', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.query;
    const filter = sellerId ? { sellerId } : {};
    
    const umbrellas = await ProductUmbrella.find(filter)
      .populate('customColumns.columnId', 'name prompt dataType')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(umbrellas);
  } catch (error) {
    console.error('Error fetching product umbrellas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single product umbrella by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const umbrella = await ProductUmbrella.findById(req.params.id)
      .populate('customColumns.columnId', 'name prompt dataType')
      .populate('createdBy', 'name email');
    
    if (!umbrella) {
      return res.status(404).json({ error: 'Product umbrella not found' });
    }
    
    res.json(umbrella);
  } catch (error) {
    console.error('Error fetching product umbrella:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new product umbrella
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, customColumns } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const umbrella = new ProductUmbrella({
      name,
      customColumns: customColumns || [],
      createdBy: req.user.userId
    });
    
    await umbrella.save();
    await umbrella.populate('customColumns.columnId', 'name prompt dataType');
    await umbrella.populate('createdBy', 'name email');
    
    res.status(201).json(umbrella);
  } catch (error) {
    console.error('Error creating product umbrella:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update product umbrella
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, customColumns } = req.body;
    
    const umbrella = await ProductUmbrella.findByIdAndUpdate(
      req.params.id,
      { 
        name, 
        customColumns: customColumns || [],
        updatedAt: Date.now() 
      },
      { new: true, runValidators: true }
    )
      .populate('customColumns.columnId', 'name prompt dataType')
      .populate('createdBy', 'name email');
    
    if (!umbrella) {
      return res.status(404).json({ error: 'Product umbrella not found' });
    }
    
    res.json(umbrella);
  } catch (error) {
    console.error('Error updating product umbrella:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete product umbrella
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const umbrella = await ProductUmbrella.findByIdAndDelete(req.params.id);
    
    if (!umbrella) {
      return res.status(404).json({ error: 'Product umbrella not found' });
    }
    
    res.json({ message: 'Product umbrella deleted successfully' });
  } catch (error) {
    console.error('Error deleting product umbrella:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
