import mongoose from 'mongoose';

const BankAccountSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true }, // e.g., "HDFC Bank"
        accountNumber: { type: String },
        ifscCode: { type: String },
        sellers: { type: String } // free text, e.g. seller names (entered manually)
    },
    { timestamps: true }
);

export default mongoose.model('BankAccount', BankAccountSchema);
