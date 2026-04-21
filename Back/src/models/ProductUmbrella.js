import mongoose from 'mongoose';

const customColumnConfigSchema = new mongoose.Schema({
  columnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomColumn',
    required: true
  },
  prompt: {
    type: String,
    required: true
  }
}, { _id: false });

const productUmbrellaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  customColumns: [customColumnConfigSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

productUmbrellaSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('ProductUmbrella', productUmbrellaSchema);
