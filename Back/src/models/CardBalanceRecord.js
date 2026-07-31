import mongoose from 'mongoose';

const CardBalanceRecordSchema = new mongoose.Schema(
  {
    card: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditCard',
      required: true
    },
    amazonAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AmazonAccount',
      required: true
    },
    // Original amount in USD
    balanceAmountUSD: {
      type: Number,
      required: true
    },
    // Calculation components (all in USD)
    markupFeeUSD: {
      type: Number,
      required: true
    }, // 3.5% of balanceAmountUSD
    gstOnMarkupUSD: {
      type: Number,
      required: true
    }, // 18% of markupFeeUSD
    totalAmountUSD: {
      type: Number,
      required: true
    }, // balanceAmountUSD + markupFeeUSD + gstOnMarkupUSD
    
    // Exchange rate used for this transaction
    exchangeRate: {
      type: Number,
      required: true
    },
    
    // Final amount in INR (totalAmountUSD * exchangeRate)
    totalAmountINR: {
      type: Number,
      required: true
    },
    
    // Metadata
    date: {
      type: Date,
      default: Date.now,
      required: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    
    // Balance tracking - what was the card balance before and after this transaction
    cardBalanceBefore: {
      type: Number,
      required: true
    },
    cardBalanceAfter: {
      type: Number,
      required: true
    }
  },
  { timestamps: true }
);

CardBalanceRecordSchema.index({ card: 1, date: -1 });
CardBalanceRecordSchema.index({ amazonAccount: 1, date: -1 });
CardBalanceRecordSchema.index({ date: -1 });

export default mongoose.model('CardBalanceRecord', CardBalanceRecordSchema);
