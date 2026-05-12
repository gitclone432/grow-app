import mongoose from 'mongoose';

const BankAccountSchema = new mongoose.Schema(
    {
        // Not unique: multiple physical accounts may share a display name (e.g. same bank brand).
        name: { type: String, required: true },
        accountNumber: { type: String },
        ifscCode: { type: String },
        sellers: { type: String } // free text, e.g. seller names (entered manually)
    },
    { timestamps: true }
);

export default mongoose.model('BankAccount', BankAccountSchema);
