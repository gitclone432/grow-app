import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    productTitle: { type: String, required: true },
    supplierLink: { type: String, required: true },
    sourcePrice: { type: Number },
    sellingPrice: { type: Number},
    quantity: { type: Number },
    completedQuantity: { type: Number, default: 0 },
    sourcePlatform: { type: mongoose.Schema.Types.ObjectId, ref: 'Platform', required: true },
    marketplace: { type: String, enum: ['EBAY_US', 'EBAY_AUS', 'EBAY_CANADA'], required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', required: true },
    range: { type: mongoose.Schema.Types.ObjectId, ref: 'Range' },
    listingPlatform: { type: mongoose.Schema.Types.ObjectId, ref: 'Platform' },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    assignedLister: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['draft', 'assigned', 'completed'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

TaskSchema.index({ date: 1 });
TaskSchema.index({ listingPlatform: 1, store: 1 });
TaskSchema.index({ assignedLister: 1, status: 1, date: 1 });

export default mongoose.model('Task', TaskSchema);


