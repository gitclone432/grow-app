import mongoose from 'mongoose';

const CardFundRequestSchema = new mongoose.Schema(
  {
    card: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditCard',
      required: true
    },
    requestedAmount: {
      type: Number,
      required: true
    }, // Amount in INR
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING'
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    requestDate: {
      type: Date,
      default: Date.now
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewDate: {
      type: Date
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

CardFundRequestSchema.index({ card: 1, status: 1 });
CardFundRequestSchema.index({ requestedBy: 1 });
CardFundRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('CardFundRequest', CardFundRequestSchema);
