import EtsyProfitSheet from '../models/EtsyProfitSheet.js';
import { createEtsyOrderSheetRouter } from './etsyOrderSheetRouter.js';

export default createEtsyOrderSheetRouter({
  Model: EtsyProfitSheet,
  pages: 'EtsyProfitSheet',
  logLabel: 'Etsy Profit Sheet',
});
