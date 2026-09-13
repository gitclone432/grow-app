/** Pricing formulas for Etsy Order Fulfilment */

export const ETSY_COMPUTED_FIELDS = ['tId', 'relistFee', 'additionalFees', 'net'];

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

export const AMAZON_USD_INPUT_FIELDS = new Set(['itemCost', 'shipCost', 'amazonTax']);

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

/** Show blank ("-") instead of ₹ 0.00. The fee sum still treats these as 0. */
export const ETSY_ZERO_AS_EMPTY_FIELDS = new Set(['coupons', 'shipCost']);

/** @deprecated Use ETSY_RUPEE_INPUT_FIELDS for manual entry; computed fields are derived. */
export const ETSY_RUPEE_FIELDS = new Set([
  ...ETSY_RUPEE_INPUT_FIELDS,
  ...ETSY_COMPUTED_FIELDS,
]);

const MARKUP_RATE = 0.035;
const IGST_RATE = 0.18;
const ETSY_T_ID_AMOUNT = 25;
const ETSY_RELIST_FEE_PER_UNIT = 19;
export const ETSY_DEFAULT_EX_RATE = 90;

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

/** Exchange rate is stored/displayed in rupees (₹ per USD). Blank/zero defaults to 90. */
export function formatExRate(value) {
  const amount = parseMoney(value);
  return formatRs(amount > 0 ? amount : ETSY_DEFAULT_EX_RATE);
}

export function formatRupeeField(value, { zeroAsEmpty = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-') return '';
  const amount = parseMoney(raw);
  if (zeroAsEmpty && amount === 0) return '';
  return formatRs(amount);
}

export function formatEtsyRupeeInputFields(row = {}) {
  const formatted = {};
  const keys = new Set([...ETSY_RUPEE_INPUT_FIELDS, ...ETSY_ZERO_AS_EMPTY_FIELDS]);
  for (const key of keys) {
    const raw = row[key];
    const zeroAsEmpty = ETSY_ZERO_AS_EMPTY_FIELDS.has(key);
    if (raw == null || !String(raw).trim()) {
      if (zeroAsEmpty) formatted[key] = '';
      continue;
    }
    if (zeroAsEmpty && parseMoney(raw) === 0) {
      formatted[key] = '';
      continue;
    }
    if (!ETSY_RUPEE_INPUT_FIELDS.has(key)) continue;
    const next = formatRupeeField(raw, { zeroAsEmpty });
    if (next) formatted[key] = next;
    else if (zeroAsEmpty) formatted[key] = '';
  }
  return formatted;
}

/** @deprecated Use formatEtsyRupeeInputFields */
export function formatEtsyRupeeFields(row = {}) {
  return formatEtsyRupeeInputFields(row);
}

export function formatAmazonUsdInputFields(row = {}) {
  const formatted = {};
  for (const key of AMAZON_USD_INPUT_FIELDS) {
    const raw = row[key];
    if (raw == null || !String(raw).trim()) {
      formatted[key] = '';
      continue;
    }
    const amount = parseMoney(raw);
    if (ETSY_ZERO_AS_EMPTY_FIELDS.has(key) && amount === 0) {
      formatted[key] = '';
      continue;
    }
    formatted[key] = formatUsd(amount);
  }
  return formatted;
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
    return { tId: '', relistFee: '', additionalFees: '', net: '' };
  }

  const additionalFeesAmount = round2(
    tax
    + etsyFee
    + processingFee
    + regulatoryOperatingFee
    + tds
    + tcs
    + offsiteAds
    + coupons
    + relistFeeAmount
    + tIdAmount
  );
  const netAmount = round2(total - additionalFeesAmount);

  return {
    tId: formatRs(tIdAmount),
    relistFee: qty > 0 ? formatRs(relistFeeAmount) : formatRs(0),
    additionalFees: formatRs(additionalFeesAmount),
    net: formatRs(netAmount),
  };
}

export function computeAmazonDerivedFields(row = {}) {
  const itemCost = parseMoney(row.itemCost);
  const shipCost = parseMoney(row.shipCost);
  const amazonTax = parseMoney(row.amazonTax);
  const parsedExRate = parseMoney(row.exRate);
  const exRate = parsedExRate > 0 ? parsedExRate : ETSY_DEFAULT_EX_RATE;
  const net = parseMoney(row.net);

  const hasAmazonCostInputs = itemCost !== 0 || shipCost !== 0 || amazonTax !== 0;

  // Total (USD) = Item Cost + Ship Cost + Tax
  const totalInUsd = round2(itemCost + shipCost + amazonTax);
  const totalInRs = exRate > 0 ? round2(totalInUsd * exRate) : 0;
  // MarkUp Fee = 3.5% of in (Rs)
  const markUpFee = totalInRs > 0 ? round2(totalInRs * MARKUP_RATE) : 0;
  // IGST = 18% of MarkUp Fee
  const igst = markUpFee > 0 ? round2(markUpFee * IGST_RATE) : 0;
  // Amazon Total = MarkUp Fee + IGST
  const amazonTotal = round2(markUpFee + igst);
  // In Hand = Net - in (Rs) - Amazon Total
  const inHand = round2(net - totalInRs - amazonTotal);

  if (!hasAmazonCostInputs) {
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
    totalInUsd: formatUsd(totalInUsd),
    totalInRs: formatRs(totalInRs),
    markUpFee: formatRs(markUpFee),
    igst: formatRs(igst),
    amazonTotal: formatRs(amazonTotal),
    inHand: formatRs(inHand),
  };
}

import { applyAddressDerivedFields } from './etsyAddressZip.js';

export function enrichOrderWithAmazonPricing(order = {}) {
  const withInputs = {
    ...order,
    ...formatEtsyRupeeInputFields(order),
    ...formatAmazonUsdInputFields(order),
    exRate: formatExRate(order.exRate),
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
