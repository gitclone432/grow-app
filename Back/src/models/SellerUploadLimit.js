import mongoose from 'mongoose';

const sellerUploadLimitSchema = new mongoose.Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true
    },
    country: {
        type: String,
        enum: ['US', 'UK', 'AU', 'Canada'],
        required: true
    },
    // Daily cap: counts successful uploads since 12:00 AM IST today, resets at midnight IST.
    limit: {
        type: Number,
        required: true,
        min: 1
    }
}, { timestamps: true });

// One limit config per seller + country pair
sellerUploadLimitSchema.index({ seller: 1, country: 1 }, { unique: true });

const SellerUploadLimit = mongoose.model('SellerUploadLimit', sellerUploadLimitSchema);

export default SellerUploadLimit;
