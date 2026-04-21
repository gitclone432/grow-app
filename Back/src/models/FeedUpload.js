import mongoose from 'mongoose';

const feedUploadSchema = new mongoose.Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true
    },
    taskId: {
        type: String,
        required: true,
        unique: true
    },
    fileName: {
        type: String,
        required: true
    },
    feedType: {
        type: String,
        default: 'FX_LISTING'
    },
    country: {
        type: String,
        enum: ['US', 'UK', 'AU', 'Canada'],
        default: 'US',
        required: true
    },
    schemaVersion: {
        type: String,
        default: '1.0'
    },
    status: {
        type: String,
        default: 'CREATED' // CREATED, PROCESSING, COMPLETED, COMPLETED_WITH_ERROR, FAILURE
    },
    uploadSummary: {
        successCount: Number,
        failureCount: Number
    },
    creationDate: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const FeedUpload = mongoose.model('FeedUpload', feedUploadSchema);

export default FeedUpload;
