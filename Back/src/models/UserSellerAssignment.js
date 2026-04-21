import mongoose from 'mongoose';

const UserSellerAssignmentSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true }, // Many-to-many: one seller can be assigned to multiple users
        dailyTarget: { type: Number, default: 0 } // Daily target set by HR/Superadmin
    },
    { timestamps: true }
);

// Compound unique index: prevent the same user-seller pair from being assigned twice
UserSellerAssignmentSchema.index({ user: 1, seller: 1 }, { unique: true });

export default mongoose.model('UserSellerAssignment', UserSellerAssignmentSchema);
