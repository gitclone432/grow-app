import mongoose from 'mongoose';

const IdeaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['issue', 'idea', 'feature', 'bug'], 
      default: 'idea',
      required: true 
    },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high'], 
      default: 'medium',
      required: true 
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'completed', 'rejected'],
      default: 'open'
    },
    createdBy: { type: String, required: true }, // Name of the person
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional: if logged in
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional: assign to someone
    pickedUpBy: { 
      type: String, 
      enum: ['aaryan', 'rajarshi', 'prassanna'], 
      required: false 
    },
    notes: { type: String, default: '' }, // Progress notes for person working on the issue
    comments: [
      {
        text: String,
        commentedBy: String,
        commentedAt: { type: Date, default: Date.now }
      }
    ],
    resolvedAt: Date,
    resolvedBy: String,
    completeByDate: { type: Date, required: false } // New field for target completion date
  },
  { timestamps: true }
);

// Index for faster queries
IdeaSchema.index({ createdAt: -1 });
IdeaSchema.index({ status: 1, createdAt: -1 });
IdeaSchema.index({ priority: 1, createdAt: -1 });

export default mongoose.model('Idea', IdeaSchema);
