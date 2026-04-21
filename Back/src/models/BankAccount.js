import mongoose from 'mongoose';

const BankAccountSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true }, // e.g., "HDFC Bank"
        accountNumber: { type: String },
        ifscCode: { type: String }
    },
    { timestamps: true }
);

export default mongoose.model('BankAccount', BankAccountSchema);
