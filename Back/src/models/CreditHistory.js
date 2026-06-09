import mongoose from 'mongoose';

const CreditHistorySchema = new mongoose.Schema(
    {
        // Type of transaction: 'CREDIT_ADDED' or 'CREDIT_USED'
        type: { 
            type: String, 
            enum: ['CREDIT_ADDED', 'CREDIT_USED'], 
            required: true 
        },
        // Amount added or deducted
        amount: { type: Number, required: true },
        // Date when credit was added/used
        date: { type: Date, required: true },
        // Name of person who gave the credit (only for CREDIT_ADDED)
        creditGivenBy: { type: String, trim: true, default: '' },
        // Reference to the ExtraExpense (only for CREDIT_USED)
        expenseId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'ExtraExpense', 
            default: null 
        },
        // Remarks or notes
        remarks: { type: String, trim: true, default: '' },
        // Balance after this transaction
        balanceAfter: { type: Number, required: true },
    },
    { timestamps: true }
);

CreditHistorySchema.index({ date: -1 });
CreditHistorySchema.index({ type: 1 });
CreditHistorySchema.index({ createdAt: -1 });

export default mongoose.model('CreditHistory', CreditHistorySchema);
