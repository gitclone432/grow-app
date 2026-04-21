import mongoose from 'mongoose';

const ChatTemplateSchema = new mongoose.Schema(
  {
    category: { 
      type: String, 
      required: true,
      trim: true
    },
    label: { 
      type: String, 
      required: true,
      trim: true
    },
    text: { 
      type: String, 
      required: true 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    sortOrder: { 
      type: Number, 
      default: 0 
    }
  },
  { timestamps: true }
);

// Compound index for efficient queries
ChatTemplateSchema.index({ category: 1, sortOrder: 1 });
ChatTemplateSchema.index({ isActive: 1, category: 1 });

export default mongoose.model('ChatTemplate', ChatTemplateSchema);
