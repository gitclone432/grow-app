import mongoose from 'mongoose';

export const RETURN_ISSUE_OPTION_TYPES = ['accountable', 'product'];

const ReturnIssueOptionSchema = new mongoose.Schema(
    {
        type: { type: String, required: true, enum: RETURN_ISSUE_OPTION_TYPES },
        name: { type: String, required: true, trim: true }
    },
    { timestamps: true }
);

ReturnIssueOptionSchema.index({ type: 1, name: 1 }, { unique: true });

export default mongoose.model('ReturnIssueOption', ReturnIssueOptionSchema);
