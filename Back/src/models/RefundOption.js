import mongoose from 'mongoose';

export const REFUND_OPTION_TYPES = ['status'];

const RefundOptionSchema = new mongoose.Schema(
    {
        type: { type: String, required: true, enum: REFUND_OPTION_TYPES },
        name: { type: String, required: true, trim: true }
    },
    { timestamps: true }
);

RefundOptionSchema.index({ type: 1, name: 1 }, { unique: true });

export default mongoose.model('RefundOption', RefundOptionSchema);
