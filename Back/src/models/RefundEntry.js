import mongoose from 'mongoose';

export const REFUND_TYPES = ['return', 'inr'];

const RefundEntrySchema = new mongoose.Schema(
    {
        type: { type: String, required: true, enum: REFUND_TYPES },
        // Date sold, marketplace and Amazon account are read live from the order so later edits show up here.
        order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
        orderId: { type: String, default: '', trim: true },
        seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
        // 'manual' = added with the Refund button; 'auto' = added by the refunded-orders auto-assign job.
        source: { type: String, enum: ['manual', 'auto'], default: 'manual' },

        // eBay side (filled in by the user). Category (order remark) and Reason (issue reason) are read from the order.
        refundDate: { type: Date, default: null },
        refundAmount: { type: Number, default: null },
        // True when refundAmount came from the order's Refunds column. The sync always re-applies it
        // (and Status), so a user edit only lasts until the next sync when the order has refund data.
        refundAmountAuto: { type: Boolean, default: false },
        status: { type: String, default: '' },
        notes: { type: String, default: '' },

        // Amazon side (filled in by the user)
        amazonRefundAmount: { type: Number, default: null },
        amazonNotes: { type: String, default: '' }
    },
    { timestamps: true }
);

RefundEntrySchema.index({ order: 1, type: 1 }, { unique: true });
RefundEntrySchema.index({ type: 1, createdAt: -1 });
RefundEntrySchema.index({ type: 1, seller: 1, createdAt: -1 });

export default mongoose.model('RefundEntry', RefundEntrySchema);
