import mongoose from 'mongoose';

const listerSettingsSchema = new mongoose.Schema({
  defaultCountry: { type: String, default: 'US', trim: true },
  defaultPostalCode: { type: String, default: '', trim: true },
  defaultLocation: { type: String, default: '', trim: true },
  paymentProfileName: { type: String, default: 'Payment Policy', trim: true },
  shippingProfileName: { type: String, default: 'Shipping Policy', trim: true },
  returnProfileName: { type: String, default: 'Return Policy', trim: true },
  brandMode: {
    type: String,
    enum: ['does_not_apply', 'from_scraper'],
    default: 'from_scraper',
  },
}, { _id: false });

const generalSettingsSchema = new mongoose.Schema({
  descriptionTemplateId: { type: String, default: '', trim: true },
}, { _id: false });

const automaticMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: false },
  body: { type: String, default: '', trim: true },
}, { _id: false });

const ordersSettingsSchema = new mongoose.Schema({
  defaultAmazonAccount: { type: String, default: '', trim: true },
  autoAssignAmazonAccount: { type: Boolean, default: true },
  policyMessagesEnabled: { type: Boolean, default: true },
  fulfillmentNotesPrefix: { type: String, default: '', trim: true },
  automaticMessages: { type: [automaticMessageSchema], default: undefined },
}, { _id: false });

const ebayStoreListerSettingsSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true,
  },
  supplier: { type: String, default: 'amazon', trim: true },
  region: { type: String, enum: ['US', 'UK', 'AU'], default: 'US' },
  lister: { type: listerSettingsSchema, default: () => ({}) },
  orders: { type: ordersSettingsSchema, default: () => ({}) },
  general: { type: generalSettingsSchema, default: () => ({}) },
}, { timestamps: true });

ebayStoreListerSettingsSchema.index({ sellerId: 1, supplier: 1, region: 1 }, { unique: true });

export default mongoose.model('EbayStoreListerSettings', ebayStoreListerSettingsSchema);

export const DEFAULT_LISTER_SETTINGS = {
  defaultCountry: 'US',
  defaultPostalCode: '',
  defaultLocation: '',
  paymentProfileName: 'Payment Policy',
  shippingProfileName: 'Shipping Policy',
  returnProfileName: 'Return Policy',
  brandMode: 'from_scraper',
};

export const DEFAULT_ORDER_SETTINGS = {
  defaultAmazonAccount: '',
  autoAssignAmazonAccount: true,
  policyMessagesEnabled: true,
  fulfillmentNotesPrefix: '',
};
