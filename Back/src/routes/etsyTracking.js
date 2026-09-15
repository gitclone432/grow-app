import EtsyOrderFulfilment from '../models/EtsyOrderFulfilment.js';
import { createEtsyOrderSheetRouter } from './etsyOrderSheetRouter.js';

export default createEtsyOrderSheetRouter({
  Model: EtsyOrderFulfilment,
  pages: 'EtsyTracking',
  logLabel: 'Etsy Tracking',
});