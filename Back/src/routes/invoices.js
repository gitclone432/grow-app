import express from 'express';
import multer from 'multer';
import Invoice from '../models/Invoice.js';
import InvoiceCategory from '../models/InvoiceCategory.js';
import { requireAuth, requireAuthFile, requirePageAccess } from '../middleware/auth.js';
import mongoose from 'mongoose';
import { uploadToGridFS, streamFromGridFS, deleteFromGridFS } from '../lib/gridfs.js';

const router = express.Router();

// Configure multer to store files in memory (not disk)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for invoices
  fileFilter: (req, file, cb) => {
    // Allow PDFs, images, and documents
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and documents are allowed.'));
    }
  }
});

// Default invoice categories
const DEFAULT_CATEGORIES = [
  'OpenAI',
  'Proxy',
  'Claude',
  'GetIn',
  'Render',
  'MongoDB',
  'ScarperAPI',
  'Codex'
];

// Get all unique categories from database
router.get('/categories', requireAuth, async (req, res) => {
  try {
    // Initialize default categories if they don't exist
    const existingCount = await InvoiceCategory.countDocuments();
    if (existingCount === 0) {
      const defaultCats = DEFAULT_CATEGORIES.map(cat => ({
        name: cat,
        isDefault: true,
        createdBy: req.user._id
      }));
      await InvoiceCategory.insertMany(defaultCats);
    }
    
    // Fetch all categories from InvoiceCategory collection
    const dbCategories = await InvoiceCategory.find().sort({ name: 1 });
    const categoryNames = dbCategories.map(cat => cat.name);
    
    // Combine with any categories found in invoices (for backward compatibility)
    const invoiceCategories = await Invoice.distinct('category');
    const allCategories = [...new Set([...categoryNames, ...invoiceCategories])].sort();
    
    res.json({ categories: allCategories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Add new category (validates and stores in database)
router.post('/categories', requireAuth, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json({ error: 'Invalid category name' });
    }
    
    const trimmedCategory = category.trim();
    
    // Check if category already exists
    const existing = await InvoiceCategory.findOne({ name: trimmedCategory });
    if (existing) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    // Create new category
    const newCategory = new InvoiceCategory({
      name: trimmedCategory,
      isDefault: false,
      createdBy: req.user._id
    });
    
    await newCategory.save();
    
    res.json({ category: trimmedCategory, message: 'Category created successfully' });
  } catch (error) {
    console.error('Error adding category:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// List invoices with filtering
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) {
        filter.invoiceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the entire end date
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        filter.invoiceDate.$lt = end;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'firstName lastName email'),
      Invoice.countDocuments(filter)
    ]);
    
    res.json({
      invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get single invoice
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    const invoice = await Invoice.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email');
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Upload invoice
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { category, invoiceDate, notes } = req.body;
    
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    if (!invoiceDate) {
      return res.status(400).json({ error: 'Invoice date is required' });
    }
    
    // Upload file to GridFS
    const { fileId, filename } = await uploadToGridFS(
      req.file.buffer,
      req.file.originalname,
      {
        category: category.trim(),
        mimeType: req.file.mimetype,
        originalName: req.file.originalname
      }
    );
    
    const invoice = new Invoice({
      category: category.trim(),
      invoiceDate: new Date(invoiceDate),
      fileName: req.file.originalname,
      gridFsFileId: fileId,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      notes: notes || '',
      createdBy: req.user._id
    });
    
    await invoice.save();
    
    const populatedInvoice = await invoice.populate('createdBy', 'firstName lastName email');
    
    res.status(201).json(populatedInvoice);
  } catch (error) {
    console.error('Error uploading invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to upload invoice' });
  }
});

// Delete invoice
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    const invoice = await Invoice.findById(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Delete file from GridFS
    if (invoice.gridFsFileId) {
      try {
        await deleteFromGridFS(invoice.gridFsFileId);
      } catch (err) {
        console.error('Error deleting file from GridFS:', err);
        // Continue with invoice deletion even if file deletion fails
      }
    }
    
    await Invoice.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// Download/Stream invoice file from GridFS
router.get('/:id/file', requireAuthFile, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    const invoice = await Invoice.findById(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    if (!invoice.gridFsFileId) {
      return res.status(404).json({ error: 'Invoice file not found' });
    }
    
    // Set appropriate headers
    res.set('Content-Type', invoice.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${invoice.fileName}"`);
    
    // Stream file from GridFS
    const downloadStream = streamFromGridFS(invoice.gridFsFileId);
    
    downloadStream.on('error', (error) => {
      console.error('Error streaming file from GridFS:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to retrieve file' });
      }
    });
    
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download invoice' });
    }
  }
});

export default router;
