import mongoose from 'mongoose';

const DailyCardExpenseSchema = new mongoose.Schema(
  {
    card: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'CreditCard', 
      required: true 
    },
    cardLast4: { 
      type: String, 
      required: true 
    }, // Last 4 digits of card for quick display
    amazonAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AmazonAccount'
    }, // Associated Amazon account
    date: { 
      type: Date, 
      required: true 
    }, // Date of the transaction
    balanceAdded: { 
      type: Number, 
      default: 0 
    }, // Amount added to card balance today
    availableBalance: {
      type: Number,
      default: 0
    }, // Available balance (previously carryover, now editable and auto-updated)
    expense: { 
      type: Number, 
      default: 0 
    }, // Amount spent from card today (auto-calculated from orders if amazon account is set)
    notes: { 
      type: String, 
      trim: true 
    }, // Optional notes about transaction
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    updatedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
  },
  { timestamps: true }
);

// Index for fast lookups
DailyCardExpenseSchema.index({ card: 1, date: 1 });
DailyCardExpenseSchema.index({ date: 1 });
DailyCardExpenseSchema.index({ amazonAccount: 1, date: 1 });

export default mongoose.model('DailyCardExpense', DailyCardExpenseSchema);
