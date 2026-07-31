import mongoose from 'mongoose';

const CreditCardSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true
    },
    last4digits: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}$/,
    },
    balance: {
      type: Number,
      default: 0
    }, // Available balance in INR
  },
  { timestamps: true }
);

export default mongoose.model('CreditCard', CreditCardSchema);
