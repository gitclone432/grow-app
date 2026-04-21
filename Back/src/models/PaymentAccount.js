import mongoose from 'mongoose';

const PaymentAccountSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true },
        bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true }
    },
    { timestamps: true }
);

export default mongoose.model('PaymentAccount', PaymentAccountSchema);
