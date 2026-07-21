import mongoose from 'mongoose';

const apiUsageSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    // Keep GIT ScrapingDog casing; add OpenAI for precheck / AI tracking
    enum: ['ScraperAPI', 'ScrapingDog', 'PAAPI', 'Gemini', 'OpenAI'],
    index: true
  },
  asin: {
    type: String,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  creditsUsed: {
    type: Number,
    default: 1
  },
  success: {
    type: Boolean,
    default: true,
    index: true
  },
  errorMessage: String,
  responseTime: Number, // milliseconds
  extractedFields: [String], // ['title', 'price', 'brand', 'description', 'images']

  // AI usage metadata. Optional so existing ScraperAPI/PAAPI records stay unchanged.
  model: String,
  promptTokens: Number,
  completionTokens: Number,
  totalTokens: Number,
  fieldName: {
    type: String,
    index: true
  },
  fieldType: String,
  aiRunId: {
    type: String,
    index: true
  },
  aiRunStartedAt: {
    type: Date,
    index: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListingTemplate',
    index: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  ipAddress: {
    type: String,
    index: true
  },
  ipSource: String,
  forwardedFor: String,
  userAgent: String,
  promptChars: Number,
  completionChars: Number,
  
  // Pre-calculated for aggregation
  year: {
    type: Number,
    index: true
  },
  month: {
    type: Number,
    index: true
  },
  day: {
    type: Number,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
apiUsageSchema.index({ service: 1, year: 1, month: 1 });
apiUsageSchema.index({ service: 1, success: 1, timestamp: -1 });
apiUsageSchema.index({ asin: 1, timestamp: -1 });
apiUsageSchema.index({ service: 1, fieldName: 1, year: 1, month: 1 });
apiUsageSchema.index({ service: 1, templateId: 1, fieldName: 1, year: 1, month: 1 });
apiUsageSchema.index({ service: 1, userId: 1, sellerId: 1, templateId: 1, year: 1, month: 1 });
apiUsageSchema.index({ service: 1, aiRunId: 1, timestamp: -1 });

const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);

export default ApiUsage;
