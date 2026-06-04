import mongoose from 'mongoose';

const CashCreditSchema = new mongoose.Schema(
    {
        // Current credit balance (updated when credit is added or expense deducted)
        totalCredit: { type: Number, default: 0 },
        // Total amount that has been used/deducted from credit
        totalUsed: { type: Number, default: 0 },
        // Remaining available credit
        remainingCredit: { type: Number, default: 0 },
        // Last updated timestamp
        lastUpdated: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model('CashCredit', CashCreditSchema);
