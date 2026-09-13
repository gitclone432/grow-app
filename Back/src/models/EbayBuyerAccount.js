import mongoose from 'mongoose';

const EbayBuyerAccountSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    name: { type: String, default: '', trim: true },
    active: { type: Boolean, default: false, index: true },
    ebayUserId: { type: String, default: '' },
    ebayUsername: { type: String, default: '' },
    deviceId: { type: String, default: '' },
    tokens: {
      access_token: String,
      refresh_token: String,
      expires_in: Number,
      refresh_token_expires_in: Number,
      token_type: String,
      scope: String,
      fetchedAt: Date,
    },
    shipping: {
      recipient: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      city: { type: String, default: '' },
      stateOrProvince: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'US' },
      phoneNumber: { type: String, default: '' },
      contactEmail: { type: String, default: '' },
    },
    marketplace: { type: String, default: 'EBAY_US' },
    connectedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('EbayBuyerAccount', EbayBuyerAccountSchema);
