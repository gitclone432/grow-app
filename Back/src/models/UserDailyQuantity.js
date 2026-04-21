import mongoose from 'mongoose';

const UserDailyQuantitySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
        dateString: { type: String, required: true }, // Store as YYYY-MM-DD for local time
        quantity: { type: Number, default: 0 },
        targetQuantity: { type: Number, default: 0 }, // Effective daily target including carry-forwards
        remarks: {
            type: String,
            enum: ['Good', 'Average', 'Need for improvement', ''],
            default: ''
        }
    },
    { timestamps: true }
);

// Compound index to ensure one record per user per seller per day
UserDailyQuantitySchema.index({ user: 1, seller: 1, dateString: 1 }, { unique: true });

export default mongoose.model('UserDailyQuantity', UserDailyQuantitySchema);
