import mongoose from 'mongoose';

const etsyDailyOrderSchema = new mongoose.Schema(
  {
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EtsyStore',
      required: true,
    },
    orderCount: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: one entry per store per date
etsyDailyOrderSchema.index({ date: 1, storeId: 1 }, { unique: true });

const EtsyDailyOrder = mongoose.model('EtsyDailyOrder', etsyDailyOrderSchema);

export default EtsyDailyOrder;
