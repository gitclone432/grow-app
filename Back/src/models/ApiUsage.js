import mongoose from 'mongoose';

const apiUsageSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    enum: ['ScraperAPI', 'PAAPI', 'Gemini'],
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

const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);

export default ApiUsage;
