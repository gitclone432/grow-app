import mongoose from 'mongoose';

const aiListingRunSchema = new mongoose.Schema({
  aiRunId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListingTemplate',
    required: true,
    index: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lastSavedFromReviewAt: {
    type: Date,
    default: Date.now
  },
  savedFromReviewCount: {
    type: Number,
    default: 0
  },
  updateableDuplicateCount: {
    type: Number,
    default: 0
  },
  dismissedFromReviewCount: {
    type: Number,
    default: 0
  },
  dismissedNewAsinCount: {
    type: Number,
    default: 0
  },
  dismissedUpdateableDuplicateCount: {
    type: Number,
    default: 0
  },
  reviewSaveAttempts: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const AiListingRun = mongoose.model('AiListingRun', aiListingRunSchema);

export default AiListingRun;
