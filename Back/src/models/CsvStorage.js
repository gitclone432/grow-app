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
        enum: ['pending', 'processing', 'done', 'failed', null],
        default: null
    },
    source: {
        type: String,
        enum: ['manual', 'asin_list', null],
        default: null
    }
});

const CsvStorage = mongoose.model('CsvStorage', csvStorageSchema);

export default CsvStorage;
