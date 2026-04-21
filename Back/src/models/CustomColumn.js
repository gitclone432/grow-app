import mongoose from 'mongoose';

const customColumnSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  prompt: {
    type: String,
    required: true
  },
  dataType: {
    type: String,
    enum: ['text', 'number', 'url'],
    default: 'text'
  },
  description: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

customColumnSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('CustomColumn', customColumnSchema);
