import mongoose from 'mongoose';

const RemarkTemplateSchema = new mongoose.Schema(
  {
    name: {
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

RemarkTemplateSchema.index({ isActive: 1, sortOrder: 1, createdAt: 1 });

export default mongoose.model('RemarkTemplate', RemarkTemplateSchema);
