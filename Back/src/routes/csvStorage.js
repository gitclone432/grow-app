import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import CsvStorage from '../models/CsvStorage.js';
import FeedUpload from '../models/FeedUpload.js';
import ListingTemplate from '../models/ListingTemplate.js';
import TemplateListing from '../models/TemplateListing.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { buildDraftListingsCsv } from '../utils/ebayDraftListingCsv.js';
import { joinItemPhotoUrls } from '../utils/itemPhotoUrls.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function getOrderedUniqueCustomColumns(customColumns = []) {
    const seen = new Set();
    return (Array.isArray(customColumns) ? customColumns : [])
        .slice()
        .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
        .filter((col) => {
            const name = String(col?.name || '').trim();
            if (!name) return false;
            const normalized = name.toLowerCase();
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
}

function sanitizeCustomCsvValueByHeader(header, value) {
    const headerName = String(header || '').trim().toLowerCase();
    const raw = value == null ? '' : String(value);
    if (headerName === 'c:feature' && raw.length > 65) return raw.slice(0, 65);
    return raw;
}

/**
 * Rebuild draft CSV from TemplateListing rows (C: item specifics + all photos).
 * Old CSV Storage blobs were saved before those fields were included.
 */
async function regenerateDraftCsvBuffer(record) {
    if (record.listingStatus !== 'draft' || !record.templateId || !record.seller) {
        return null;
    }

    const sellerId = record.seller._id || record.seller;
    const nameBlob = `${record.name || ''} ${record.fileName || ''}`;
    const batchMatch = nameBlob.match(/draft_batch_(\d+)/i);

    const filter = {
        templateId: record.templateId,
        sellerId,
        status: 'draft',
        downloadBatchId: { $ne: null },
    };
    if (batchMatch) {
        filter.downloadBatchNumber = parseInt(batchMatch[1], 10);
    }

    let listings = await TemplateListing.find(filter).sort({ createdAt: -1 });

    // Filename without batch #: pick the downloaded draft batch matching listingCount
    if (!listings.length && !batchMatch && record.listingCount) {
        const batches = await TemplateListing.aggregate([
            {
                $match: {
                    templateId: new mongoose.Types.ObjectId(String(record.templateId)),
                    sellerId: new mongoose.Types.ObjectId(String(sellerId)),
                    status: 'draft',
                    downloadBatchId: { $ne: null },
                },
            },
            {
                $group: {
                    _id: '$downloadBatchId',
                    downloadBatchNumber: { $first: '$downloadBatchNumber' },
                    count: { $sum: 1 },
                    downloadedAt: { $first: '$downloadedAt' },
                },
            },
            { $match: { count: Number(record.listingCount) } },
            { $sort: { downloadedAt: -1 } },
            { $limit: 1 },
        ]);
        if (batches[0]?._id) {
            listings = await TemplateListing.find({
                templateId: record.templateId,
                sellerId,
                status: 'draft',
                downloadBatchId: batches[0]._id,
            }).sort({ createdAt: -1 });
        }
    }

    if (!listings.length) return null;

    const template = await getEffectiveTemplate(record.templateId, sellerId);
    if (!template) return null;

    const customColumns = getOrderedUniqueCustomColumns(template.customColumns || []);
    const csvContent = buildDraftListingsCsv(listings, { joinItemPhotoUrls }, record.country || 'US', {
        customColumns,
        sanitizeCustomValue: sanitizeCustomCsvValueByHeader,
    });
    return Buffer.from(csvContent, 'utf8');
}

/** Fill missing createdBy from linked ListingTemplate creator (legacy rows). */
async function enrichCreatedByFromTemplates(records) {
    const missing = records.filter((r) => !r.createdBy && r.templateId);
    if (!missing.length) return records;

    const templateIds = [...new Set(missing.map((r) => String(r.templateId)))];
    const templates = await ListingTemplate.find({ _id: { $in: templateIds } })
        .select('createdBy')
        .populate('createdBy', 'username')
        .lean();
    const byTemplateId = new Map(
        templates.map((t) => [String(t._id), t.createdBy || null])
    );

    return records.map((r) => {
        if (r.createdBy || !r.templateId) return r;
        const fallback = byTemplateId.get(String(r.templateId));
        if (!fallback) return r;
        const plain = typeof r.toObject === 'function' ? r.toObject() : { ...r };
        plain.createdBy = fallback;
        return plain;
    });
}

// ============================================
// GET /csv-storage — Paginated list with filters
// ============================================
router.get('/', requireAuth, async (req, res) => {
    try {
        const {
            sellerId,
            userId,
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
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            filter.createdBy = new mongoose.Types.ObjectId(userId);
        }
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
            .populate('createdBy', 'username')
            .populate('feedUploadId', 'status uploadSummary taskId')
            .populate('scheduledSellerId', 'storeName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const total = await CsvStorage.countDocuments(filter);
        const enriched = await enrichCreatedByFromTemplates(records);

        res.json({ records: enriched, total });
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
            source,
            listingStatus,
            country
        } = req.body;

        if (!sellerId) {
            return res.status(400).json({ error: 'Missing sellerId' });
        }

        const normalizedListingStatus =
            listingStatus === 'draft' || listingStatus === 'active' ? listingStatus : null;
        const normalizedCountry =
            ['US', 'UK', 'AU', 'Canada'].includes(country) ? country : null;

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
            listingStatus: normalizedListingStatus,
            country: normalizedCountry,
            createdBy: req.user?.userId || req.user?._id || null
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

        let payload = record.csvData;
        let filename = record.fileName;

        // Draft blobs saved before C:/multi-image fix — rebuild from listings when possible
        try {
            const regenerated = await regenerateDraftCsvBuffer(record);
            if (regenerated && regenerated.length > 0) {
                payload = regenerated;
                await CsvStorage.updateOne(
                    { _id: record._id },
                    { $set: { csvData: regenerated, mimeType: 'text/csv' } }
                );
                console.log(
                    `[CSV Storage] Regenerated draft CSV ${record._id} (${regenerated.length} bytes)`
                );
            }
        } catch (regenErr) {
            console.warn(
                `[CSV Storage] Draft regenerate failed for ${record._id}, serving stored blob:`,
                regenErr.message
            );
        }

        res.setHeader('Content-Type', record.mimeType || 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(payload);
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
        const { scheduledAt, sellerId, country, categoryId, rangeId, productId } = req.body;
        if (!scheduledAt) return res.status(400).json({ error: 'Missing scheduledAt' });
        if (!sellerId) return res.status(400).json({ error: 'Missing sellerId' });

        const scheduledDate = new Date(scheduledAt);
        if (isNaN(scheduledDate.getTime())) return res.status(400).json({ error: 'Invalid scheduledAt date' });
        if (scheduledDate <= new Date()) return res.status(400).json({ error: 'Scheduled time must be in the future' });

        const updateFields = {
            scheduledUploadAt: scheduledDate,
            scheduledSellerId: sellerId,
            scheduledUploadStatus: 'pending'
        };
        // Persist optional metadata so the cron job can forward them to FeedUpload
        if (country) updateFields.country = country;
        if (categoryId) updateFields.categoryId = categoryId;
        if (rangeId) updateFields.rangeId = rangeId;
        if (productId) updateFields.productId = productId;

        const record = await CsvStorage.findByIdAndUpdate(
            req.params.id,
            updateFields,
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
