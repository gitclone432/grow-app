/**
 * Debug actus corp profit: compare row enrichment vs sumLiveFinancialsForOrders vs stored DB.
 * Usage: node tools/debugActusProfit.js [startDate] [endDate]
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Seller from '../src/models/Seller.js';
import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
import {
  enrichOrderLikeAllOrdersSheet,
  prefetchExchangeRatesForOrders,
  sumLiveFinancialsForOrders,
  computeLiveOrderProfit,
} from '../src/utils/allOrdersSheetEnrichment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  let seller = await Seller.findById('69f186242b96e9155d7b8b85')
    .populate('user', 'username')
    .lean();
  if (!seller) {
    const user = await User.findOne({ username: /actus/i }).lean();
    if (!user) {
      console.error('No actus seller found');
      process.exit(1);
    }
    seller = await Seller.findOne({ user: user._id }).populate('user', 'username').lean();
    if (!seller) {
      console.error('No actus seller found');
      process.exit(1);
    }
  }
  console.log('Seller:', seller.user?.username, seller._id.toString());

  const startDate = process.argv[2] || '2026-07-01';
  const endDate = process.argv[3] || '2026-07-31';

  const query = { seller: seller._id };
  if (startDate || endDate) {
    query.dateSold = {};
    if (startDate) query.dateSold.$gte = new Date(`${startDate}T07:00:00.000Z`);
    if (endDate) query.dateSold.$lte = new Date(`${endDate}T06:59:59.999Z`);
  }

  const orderIdFilter = process.argv[4];
  if (orderIdFilter === 'screenshot7') {
    query.orderId = {
      $in: [
        '07-14961-60532', '07-14953-51778', '07-14924-63257', '07-14952-25078',
        '07-14946-13102', '07-14959-32622', '07-14943-65061',
      ],
    };
  }

  const orders = await Order.find(query)
    .select('orderId amazonAccount subtotal discount transactionFees adFeeGeneral shipping purchaseMarketplaceId orderPaymentStatus paymentSummary totalDueSellerUSD preRefundOrderEarnings preRefundAdFeeGeneral preRefundTransactionFees refunds lineItems tds tdsSource tid ebayExchangeRate amazonExchangeRate dateSold creationDate beforeTax estimatedTax amazonTotal amazonTotalINR marketplaceFee igst totalCC profit pBalanceINR net orderEarnings cancelState cancelStatus')
    .sort({ dateSold: 1 })
    .lean();

  console.log(`Orders found: ${orders.length} (${startDate} to ${endDate})\n`);

  const rateCache = await prefetchExchangeRatesForOrders(orders);
  const { totals: liveTotals } = await sumLiveFinancialsForOrders(orders);

  let enrichedProfitSum = 0;
  let storedProfitSum = 0;
  let livePathProfitSum = 0;
  let mismatchCount = 0;

  console.log('orderId | amazonAcc | storedProfit | enrichedProfit | livePathProfit | diff(enriched-livePath) | storedTDS | enrichedTDS');
  console.log('-'.repeat(120));

  for (const order of orders) {
    const orderObj = { ...order };
    enrichOrderLikeAllOrdersSheet(orderObj, rateCache);

    const ebayRate = orderObj.ebayExchangeRate;
    const livePath = computeLiveOrderProfit(order, ebayRate);

    const storedProfit = parseFloat(order.profit) || 0;
    const enrichedProfit = parseFloat(orderObj.profit) || 0;
    const liveProfit = parseFloat(livePath.profit) || 0;
    const diff = parseFloat((enrichedProfit - liveProfit).toFixed(2));

    enrichedProfitSum += enrichedProfit;
    storedProfitSum += storedProfit;
    livePathProfitSum += liveProfit;

    if (Math.abs(diff) > 0.01) mismatchCount++;

    console.log([
      order.orderId?.slice(-12) || '-',
      (order.amazonAccount || '-').slice(0, 12),
      storedProfit.toFixed(2),
      enrichedProfit.toFixed(2),
      liveProfit.toFixed(2),
      diff.toFixed(2),
      order.tds ?? 'null',
      orderObj.tds ?? 'null',
    ].join(' | '));
  }

  console.log('\n--- TOTALS ---');
  console.log('Stored DB profit sum:     ', storedProfitSum.toFixed(2));
  console.log('Enriched row profit sum:  ', enrichedProfitSum.toFixed(2));
  console.log('computeLiveOrderProfit:   ', livePathProfitSum.toFixed(2));
  console.log('sumLiveFinancials (KPI):  ', liveTotals.profit.toFixed(2));
  console.log('Mismatches enriched vs livePath:', mismatchCount);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
