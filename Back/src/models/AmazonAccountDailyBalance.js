import mongoose from 'mongoose';

// Tracks per-account per-day gift card balance info for the Affiliate Orders page
const AmazonAccountDailyBalanceSchema = new mongoose.Schema(
    {
        amazonAccountName: { type: String, required: true },
        date: { type: String, required: true }, // stored as 'YYYY-MM-DD'
        availableBalance: { type: Number, default: 0 },
        addedBalance: { type: Number, default: 0 },
        giftCardStatus: { type: Boolean, default: false },
        note: { type: String, default: '' },
    },
    { timestamps: true }
);

// Unique per account per day
AmazonAccountDailyBalanceSchema.index({ amazonAccountName: 1, date: 1 }, { unique: true });

export default mongoose.model('AmazonAccountDailyBalance', AmazonAccountDailyBalanceSchema);
