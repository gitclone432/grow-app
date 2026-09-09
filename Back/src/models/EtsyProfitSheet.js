import mongoose from 'mongoose';
import { createEtsyOrderSheetSchema } from './etsyOrderSheetSchema.js';

export default mongoose.model('EtsyProfitSheet', createEtsyOrderSheetSchema());
