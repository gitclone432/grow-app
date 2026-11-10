import mongoose from 'mongoose';

const IssueReasonOptionSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true }
    },
    { timestamps: true }
);

export default mongoose.model('IssueReasonOption', IssueReasonOptionSchema);
