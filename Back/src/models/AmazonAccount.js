// models/AmazonAccount.js
import mongoose from 'mongoose';

const AmazonAccountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    // Address Information
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('AmazonAccount', AmazonAccountSchema);