/** Pricing formulas for Etsy Order Fulfilment */

export const ETSY_COMPUTED_FIELDS = ['tId', 'relistFee', 'net'];

export const ETSY_PRICING_TRIGGER_FIELDS = new Set([
  'qty',
  'total',
  'tax',
  'etsyFee',
  'processingFee',
  'regulatoryOperatingFee',
  'tds',
  'tcs',
  'offsiteAds',
  'coupons',
]);

export const AMAZON_PRICING_TRIGGER_FIELDS = new Set([
  'itemCost',
  'shipCost',
  'amazonTax',
  'exRate',
  ...ETSY_PRICING_TRIGGER_FIELDS,
]);

export const AMAZON_PRICING_COMPUTED_FIELDS = [
  'totalInUsd',
  'totalInRs',
  'markUpFee',
  'igst',
  'amazonTotal',
  'inHand',
];

/** Etsy fee/amount columns entered manually (₹). */
export const ETSY_RUPEE_INPUT_FIELDS = new Set([
  'tax',
  'total',
  'etsyFee',
  'processingFee',
  'regulatoryOperatingFee',
  'tds',
  'tcs',
  'offsiteAds',
  'coupons',
]);

/** @deprecated Use ETSY_RUPEE_INPUT_FIELDS for manual entry; computed fields are derived. */
export const ETSY_RUPEE_FIELDS = new Set([
  ...ETSY_RUPEE_INPUT_FIELDS,
  ...ETSY_COMPUTED_FIELDS,
]);

const MARKUP_RATE = 0.035;
const IGST_RATE = 0.18;
const ETSY_T_ID_AMOUNT = 25;
const ETSY_RELIST_FEE_PER_UNIT = 19;

export function parseMoney(value) {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseQty(value) {
  const num = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function formatUsd(value) {
  const amount = round2(value);
  if (!amount && amount !== 0) return '';
  return `$${amount.toFixed(2)}`;
}

export function formatRs(value) {
  const amount = round2(value);
  if (!amount && amount !== 0) return '';
  return `₹ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Exchange rate is stored/displayed in rupees (₹ per USD). */
export function formatExRate(value) {
  return formatRupeeField(value);
}

export function formatRupeeField(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-') return '';
  return formatRs(parseMoney(raw));
}

export function formatEtsyRupeeInputFields(row = {}) {
  const formatted = {};
  for (const key of ETSY_RUPEE_INPUT_FIELDS) {
    if (row[key] == null || !String(row[key]).trim()) continue;
    const next = formatRupeeField(row[key]);
    if (next) formatted[key] = next;
  }
  return formatted;
}

/** @deprecated Use formatEtsyRupeeInputFields */
export function formatEtsyRupeeFields(row = {}) {
  return formatEtsyRupeeInputFields(row);
}

export function computeEtsyDerivedFields(row = {}) {
  const qty = parseQty(row.qty);
  const total = parseMoney(row.total);
  const tax = parseMoney(row.tax);
  const etsyFee = parseMoney(row.etsyFee);
  const processingFee = parseMoney(row.processingFee);
  const regulatoryOperatingFee = parseMoney(row.regulatoryOperatingFee);
  const tds = parseMoney(row.tds);
  const tcs = parseMoney(row.tcs);
  const offsiteAds = parseMoney(row.offsiteAds);
  const coupons = parseMoney(row.coupons);

  const tIdAmount = ETSY_T_ID_AMOUNT;
  const relistFeeAmount = round2(qty * ETSY_RELIST_FEE_PER_UNIT);

  const hasOrderData = qty > 0
    || total !== 0
    || tax !== 0
    || etsyFee !== 0
    || processingFee !== 0
    || regulatoryOperatingFee !== 0
    || tds !== 0
    || tcs !== 0
    || offsiteAds !== 0
    || coupons !== 0;

  if (!hasOrderData) {
    return { tId: '', relistFee: '', net: '' };
  }

  const netAmount = round2(
    total
    - tax
    - etsyFee
    - processingFee
    - regulatoryOperatingFee
    - tds
    - tcs
    - offsiteAds
    - coupons
    - relistFeeAmount
    - tIdAmount
  );

  return {
    tId: formatRs(tIdAmount),
    relistFee: qty > 0 ? formatRs(relistFeeAmount) : formatRs(0),
    net: formatRs(netAmount),
  };
}

export function computeAmazonDerivedFields(row = {}) {
  const itemCost = parseMoney(row.itemCost);
  const shipCost = parseMoney(row.shipCost);
  const amazonTax = parseMoney(row.amazonTax);
  const exRate = parseMoney(row.exRate);
  const net = parseMoney(row.net);

  const hasAmazonCostInputs = itemCost !== 0 || shipCost !== 0 || amazonTax !== 0;

  const totalInUsd = round2(itemCost + shipCost + amazonTax);
  const totalInRs = exRate > 0 ? round2(totalInUsd * exRate) : 0;
  const markUpFee = totalInRs > 0 ? round2(totalInRs * MARKUP_RATE) : 0;
  const igst = markUpFee > 0 ? round2(markUpFee * IGST_RATE) : 0;
  const amazonTotal = round2(markUpFee + igst);
  const inHand = round2(net - totalInRs - amazonTotal);

  if (!hasAmazonCostInputs && exRate <= 0 && net === 0) {
    return {
      totalInUsd: '',
      totalInRs: '',
      markUpFee: '',
      igst: '',
      amazonTotal: '',
      inHand: '',
    };
  }

  return {
    totalInUsd: hasAmazonCostInputs || totalInUsd > 0 ? formatUsd(totalInUsd) : '',
    totalInRs: exRate > 0 && (hasAmazonCostInputs || totalInUsd > 0) ? formatRs(totalInRs) : '',
    markUpFee: exRate > 0 && totalInRs > 0 ? formatRs(markUpFee) : '',
    igst: exRate > 0 && markUpFee > 0 ? formatRs(igst) : '',
    amazonTotal: exRate > 0 && amazonTotal > 0 ? formatRs(amazonTotal) : '',
    inHand: net !== 0 || totalInRs > 0 || amazonTotal > 0 ? formatRs(inHand) : '',
  };
}

import { applyAddressDerivedFields } from './etsyAddressZip.js';

export function enrichOrderWithAmazonPricing(order = {}) {
  const withInputs = {
    ...order,
    ...formatEtsyRupeeInputFields(order),
    ...(formatExRate(order.exRate) ? { exRate: formatExRate(order.exRate) } : {}),
    ...computeEtsyDerivedFields({
      ...order,
      ...formatEtsyRupeeInputFields(order),
    }),
    ...applyAddressDerivedFields(order),
  };

  return {
    ...withInputs,
    ...computeAmazonDerivedFields(withInputs),
  };
}

export function pickAmazonComputedPatch(row = {}) {
  return computeAmazonDerivedFields(row);
}

export function pickEtsyComputedPatch(row = {}) {
  return computeEtsyDerivedFields(row);
}

export function pickOrderComputedPatch(row = {}) {
  const enriched = enrichOrderWithAmazonPricing(row);
  return Object.fromEntries(
    [...ETSY_COMPUTED_FIELDS, ...AMAZON_PRICING_COMPUTED_FIELDS].map((key) => [key, enriched[key]])
  );
}
