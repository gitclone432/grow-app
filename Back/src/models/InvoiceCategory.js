import mongoose from 'mongoose';

const invoiceCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceCategorySchema.index({ name: 1 });

export default mongoose.model('InvoiceCategory', invoiceCategorySchema);
