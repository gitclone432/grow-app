import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
        transactionType: { type: String, enum: ['Credit', 'Debit'], required: true },
        amount: { type: Number, required: true },
        remark: { type: String },
        source: { type: String, enum: ['MANUAL', 'PAYONEER'], default: 'MANUAL' },
        sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayoneerRecord' }, // Link to source record
        creditCardName: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCardName' } // NEW: For Debit transactions to a card
    },
    { timestamps: true }
);

export default mongoose.model('Transaction', TransactionSchema);
