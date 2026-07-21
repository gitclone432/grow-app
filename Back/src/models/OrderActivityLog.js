import mongoose from 'mongoose';

const orderActivityLogSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderObjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    action: {
      type: String,
      enum: [
        'status_changed',
        'board_moved',
        'category_assigned',
        'note_added',
        'remark_added',
        'tracking_number_added',
        'created',
        'other',
      ],
      required: true,
    },
    board: {
      type: String,
      enum: [
        'order_fulfillment',
        'order_communication',
        'issue_hub',
        'return_refund',
        'cancellation',
        'inr',
      ],
      default: null,
    },
    fromStatus: {
      type: String,
      default: null,
    },
    toStatus: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: null,
    },
    changedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      username: String,
      email: String,
      isAdmin: {
        type: Boolean,
        default: false,
      },
    },
    details: {
      type: String,
      default: '',
    },
    noteContent: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for common queries
orderActivityLogSchema.index({ orderId: 1, timestamp: -1 });
orderActivityLogSchema.index({ orderObjectId: 1, timestamp: -1 });

export default mongoose.model('OrderActivityLog', orderActivityLogSchema);
