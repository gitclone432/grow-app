import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import CsvStorage from '../models/CsvStorage.js';
import FeedUpload from '../models/FeedUpload.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// GET /csv-storage — Paginated list with filters
// ============================================
router.get('/', requireAuth, async (req, res) => {
    try {
        const {
            sellerId,
            keyword,
            dateFrom,
            dateTo,
            categoryId,
            rangeId,
            productId,
            limit = 10,
            offset = 0
        } = req.query;

        const filter = {};

        if (sellerId) filter.seller = sellerId;
        if (categoryId) filter.categoryId = categoryId;
        if (rangeId) filter.rangeId = rangeId;
        if (productId) filter.productId = productId;

        if (keyword) {
            filter.name = { $regex: keyword, $options: 'i' };
        }

        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const skip = parseInt(offset) || 0;
        const limitNum = parseInt(limit) || 10;

        const records = await CsvStorage.find(filter)
            .select('-csvData') // Exclude binary data from list response
            .populate({ path: 'seller', select: 'storeName user', populate: { path: 'user', select: 'username' } })
            .populate('feedUploadId', 'status uploadSummary taskId')
            .populate('scheduledSellerId', 'storeName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const total = await CsvStorage.countDocuments(filter);

        res.json({ records, total });
    } catch (err) {
        console.error('[CSV Storage] GET Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch CSV records', details: err.message });
    }
});

// ============================================
// POST /csv-storage — Save a new CSV record
// ============================================
router.post('/', requireAuth, upload.single('csvFile'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }

        const {
            sellerId,
            templateId,
            listingCount,
            categoryId,
            categoryName,
            rangeId,
            rangeName,
            productId,
            productName,
            source
        } = req.body;

        if (!sellerId) {
            return res.status(400).json({ error: 'Missing sellerId' });
        }

        const name = file.originalname.replace(/\.csv$/i, '');

        const record = await CsvStorage.create({
            name,
            fileName: file.originalname,
            csvData: file.buffer,
            mimeType: file.mimetype || 'text/csv',
            seller: sellerId,
            templateId: templateId || null,
            listingCount: parseInt(listingCount) || 0,
            categoryId: categoryId || null,
            categoryName: categoryName || '',
            rangeId: rangeId || null,
            rangeName: rangeName || '',
            productId: productId || null,
            productName: productName || '',
            source: source || null,
            createdBy: req.user?._id || null
        });

        res.json({ _id: record._id, name: record.name, fileName: record.fileName });
    } catch (err) {
        console.error('[CSV Storage] POST Error:', err.message);
        res.status(500).json({ error: 'Failed to save CSV record', details: err.message });
    }
});

// ============================================
// PATCH /csv-storage/:id/link-upload — Link FeedUpload by taskId
// ============================================
router.patch('/:id/link-upload', requireAuth, async (req, res) => {
    try {
        const { taskId } = req.body;
        if (!taskId) {
            return res.status(400).json({ error: 'Missing taskId' });
        }

        const feedUpload = await FeedUpload.findOne({ taskId });
        if (!feedUpload) {
            return res.status(404).json({ error: 'FeedUpload record not found for this taskId' });
        }

        const record = await CsvStorage.findByIdAndUpdate(
            req.params.id,
            { feedUploadId: feedUpload._id },
            { new: true }
        ).select('-csvData');

        if (!record) {
            return res.status(404).json({ error: 'CSV Storage record not found' });
        }

        res.json({ success: true, record });
    } catch (err) {
        console.error('[CSV Storage] PATCH link-upload Error:', err.message);
        res.status(500).json({ error: 'Failed to link upload', details: err.message });
    }
});

// ============================================
// GET /csv-storage/:id/download — Stream CSV from DB
// ============================================
router.get('/:id/download', requireAuth, async (req, res) => {
    try {
        const record = await CsvStorage.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ error: 'CSV record not found' });
        }

        res.setHeader('Content-Type', record.mimeType || 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${record.fileName}"`);
        res.send(record.csvData);
    } catch (err) {
        console.error('[CSV Storage] Download Error:', err.message);
        res.status(500).json({ error: 'Failed to download CSV', details: err.message });
    }
});

// ============================================
// POST /csv-storage/:id/schedule-upload — Set or update scheduled auto-upload
// ============================================
router.post('/:id/schedule-upload', requireAuth, async (req, res) => {
    try {
        const { scheduledAt, sellerId } = req.body;
        if (!scheduledAt) return res.status(400).json({ error: 'Missing scheduledAt' });
        if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

        const scheduledDate = new Date(scheduledAt);
        if (isNaN(scheduledDate.getTime())) return res.status(400).json({ error: 'Invalid scheduledAt date' });
        if (scheduledDate <= new Date()) return res.status(400).json({ error: 'Scheduled time must be in the future' });

        const record = await CsvStorage.findByIdAndUpdate(
            req.params.id,
            { scheduledUploadAt: scheduledDate, scheduledSellerId: sellerId, scheduledUploadStatus: 'pending' },
            { new: true }
        ).select('-csvData').populate('seller', 'storeName').populate('feedUploadId', 'status uploadSummary taskId');

        if (!record) return res.status(404).json({ error: 'CSV record not found' });
        res.json({ success: true, record });
    } catch (err) {
        console.error('[CSV Storage] schedule-upload Error:', err.message);
        res.status(500).json({ error: 'Failed to schedule upload', details: err.message });
    }
});

// ============================================
// DELETE /csv-storage/:id/schedule-upload — Cancel scheduled auto-upload
// ============================================
router.delete('/:id/schedule-upload', requireAuth, async (req, res) => {
    try {
        const existing = await CsvStorage.findById(req.params.id).select('scheduledUploadStatus');
        if (!existing) return res.status(404).json({ error: 'CSV record not found' });
        if (existing.scheduledUploadStatus === 'processing') {
            return res.status(400).json({ error: 'Cannot cancel — upload is already processing' });
        }

        const record = await CsvStorage.findByIdAndUpdate(
            req.params.id,
            { scheduledUploadAt: null, scheduledSellerId: null, scheduledUploadStatus: null },
            { new: true }
        ).select('-csvData').populate('seller', 'storeName').populate('feedUploadId', 'status uploadSummary taskId');

        res.json({ success: true, record });
    } catch (err) {
        console.error('[CSV Storage] cancel schedule-upload Error:', err.message);
        res.status(500).json({ error: 'Failed to cancel scheduled upload', details: err.message });
    }
});

// ============================================
// DELETE /csv-storage/:id — Remove record
// ============================================
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const record = await CsvStorage.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(404).json({ error: 'CSV record not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[CSV Storage] DELETE Error:', err.message);
        res.status(500).json({ error: 'Failed to delete CSV record', details: err.message });
    }
});

export default router;
