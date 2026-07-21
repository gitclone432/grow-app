import mongoose from 'mongoose';

const csvStorageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    csvData: {
        type: Buffer,
        required: true
    },
    mimeType: {
        type: String,
        default: 'text/csv'
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true
    },
    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TemplateListing',
        default: null
    },
    listingCount: {
        type: Number,
        default: 0
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AsinListCategory',
        default: null
    },
    categoryName: {
        type: String,
        default: ''
    },
    rangeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AsinListRange',
        default: null
    },
    rangeName: {
        type: String,
        default: ''
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AsinListProduct',
        default: null
    },
    productName: {
        type: String,
        default: ''
    },
    feedUploadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FeedUpload',
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    scheduledUploadAt: {
        type: Date,
        default: null
    },
    scheduledSellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        default: null
    },
    scheduledUploadStatus: {
        type: String,
        enum: ['pending', 'processing', 'done', 'failed', 'limit_blocked', null],
        default: null
    },
    source: {
        type: String,
        enum: ['manual', 'asin_list', 'download', null],
        default: null
    },
    listingStatus: {
        type: String,
        enum: ['active', 'draft', null],
        default: null
    },
    country: {
        type: String,
        enum: ['US', 'UK', 'AU', 'Canada', null],
        default: null
    }
});

// Sparse compound index so the every-minute cron query
// ({ scheduledUploadStatus: 'pending', scheduledUploadAt: { $lte: now } })
// is an instant index seek instead of a full collection scan.
// sparse: true excludes documents where both fields are null (the majority).
csvStorageSchema.index(
    { scheduledUploadStatus: 1, scheduledUploadAt: 1 },
    { sparse: true }
);

const CsvStorage = mongoose.model('CsvStorage', csvStorageSchema);

export default CsvStorage;
