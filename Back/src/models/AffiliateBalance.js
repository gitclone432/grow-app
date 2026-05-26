import mongoose from 'mongoose';

// Tracks daily affiliate account balance information
const AffiliateBalanceSchema = new mongoose.Schema(
    {
        date: { type: String, required: true }, // stored as 'YYYY-MM-DD'
        accountName: { type: String, required: true },
        availableBalance: { type: Number, default: 0 }, // USD
        balanceAdded: { type: Number, default: 0 }, // USD
        totalBalance: { type: Number, default: 0 }, // USD (calculated as availableBalance + balanceAdded)
        cardNo: { type: String, default: '' },
        expenses: { type: Number, default: 0 }, // USD
        marketplace: { 
            type: String, 
            enum: ['US', 'AU', 'UK', 'CA'], 
            default: 'US' 
        },
        remarks: { type: String, default: '' }, // Payment Revision
        notes: { type: String, default: '' },
    },
    { timestamps: true }
);

// Unique per account per day
AffiliateBalanceSchema.index({ date: 1, accountName: 1 }, { unique: true });
AffiliateBalanceSchema.index({ date: -1 });
AffiliateBalanceSchema.index({ accountName: 1 });

export default mongoose.model('AffiliateBalance', AffiliateBalanceSchema);
