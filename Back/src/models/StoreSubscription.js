import mongoose from 'mongoose';

// Tracks seller store subscription records on a monthly basis.
const StoreSubscriptionSchema = new mongoose.Schema(
    {
        month: { type: String, required: true }, // stored as 'YYYY-MM'
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
        sellerName: { type: String, required: true },
        billingCycle: {
            type: String,
            enum: ['monthly', 'yearly'],
            required: true,
            default: 'monthly',
        },
        amount: { type: Number, required: true, default: 0 }, // USD
        notes: { type: String, default: '' },
        // Legacy mirror fields kept so the existing collection/indexes continue to work safely.
        date: { type: String, required: true }, // first day of month: 'YYYY-MM-01'
        accountName: { type: String, required: true }, // `${sellerId}:${billingCycle}`
        availableBalance: { type: Number, default: 0 },
        balanceAdded: { type: Number, default: 0 },
        totalBalance: { type: Number, default: 0 },
        cardNo: { type: String, default: '' },
        expenses: { type: Number, default: 0 },
        marketplace: {
            type: String,
            enum: ['US', 'AU', 'UK', 'CA'],
            default: 'US'
        },
        remarks: { type: String, default: '' },
    },
    { timestamps: true }
);

StoreSubscriptionSchema.index({ month: -1 });
StoreSubscriptionSchema.index({ sellerId: 1, month: -1 });
StoreSubscriptionSchema.index({ month: 1, sellerId: 1, billingCycle: 1 }, { unique: true });

export default mongoose.model('StoreSubscription', StoreSubscriptionSchema, 'affiliatebalances');
