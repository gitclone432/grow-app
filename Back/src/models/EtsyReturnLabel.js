import mongoose from 'mongoose';
import { createEtsyOrderSheetSchema } from './etsyOrderSheetSchema.js';

const schema = createEtsyOrderSheetSchema();
// The Order Fulfilment row this return label was created from.
schema.add({
  sourceOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'EtsyOrderFulfilment', index: true, default: null },
});

export default mongoose.model('EtsyReturnLabel', schema);
