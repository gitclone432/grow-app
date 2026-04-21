import mongoose from 'mongoose';

const itemCategoryMapSchema = new mongoose.Schema({
  itemNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListCategory',
    required: true
  },
  rangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListRange',
    default: null
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListProduct',
    default: null
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

export default mongoose.model('ItemCategoryMap', itemCategoryMapSchema);
