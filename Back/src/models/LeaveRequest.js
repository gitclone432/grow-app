import mongoose from 'mongoose';

const LeaveRequestSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reason: { type: String, trim: true, required: true },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            required: true
        },
        rejectionReason: { type: String, trim: true },
        // Store the number of days for easy querying
        numberOfDays: { type: Number, required: true }
    },
    { timestamps: true }
);

// Add indexes for efficient querying
LeaveRequestSchema.index({ user: 1, startDate: 1 });
LeaveRequestSchema.index({ status: 1 });

export default mongoose.model('LeaveRequest', LeaveRequestSchema);
