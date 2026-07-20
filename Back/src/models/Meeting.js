import mongoose from 'mongoose';

const MeetingActionItemSchema = new mongoose.Schema(
    {
        text: { type: String, required: true, trim: true },
        assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
        dueDate: { type: Date, required: false },
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'done'],
            default: 'pending'
        }
    },
    { _id: true }
);

const MeetingSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        scheduledFor: { type: Date, required: true },
        organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
        status: {
            type: String,
            enum: ['planned', 'in-progress', 'completed', 'cancelled'],
            default: 'planned',
            index: true,
        },
        location: { type: String, default: '', trim: true },
        agenda: { type: String, default: '', trim: true },
        discussionSummary: { type: String, default: '', trim: true },
        decisions: { type: String, default: '', trim: true },
        futureScope: { type: String, default: '', trim: true },
        actionItems: [MeetingActionItemSchema],
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

MeetingSchema.index({ scheduledFor: -1, updatedAt: -1 });
MeetingSchema.index({ attendees: 1, scheduledFor: -1 });

export default mongoose.model('Meeting', MeetingSchema);
