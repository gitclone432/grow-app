import mongoose from 'mongoose';

const ExtraExpenseSchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        name: { type: String, required: true, trim: true },
        amount: { type: Number, required: true },
        paidBy: { type: String, required: true, trim: true }
    },
    { timestamps: true }
);

export default mongoose.model('ExtraExpense', ExtraExpenseSchema);
