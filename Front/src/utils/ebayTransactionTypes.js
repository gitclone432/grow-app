/** eBay Finances API TransactionTypeEnum — https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum */

export const TRANSACTION_TYPE_DOCS =
  'https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum';

export const TRANSACTION_STATUS_DOCS =
  'https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionStatusEnum';

/** @type {{ value: string, label: string, description: string, bookingEntry?: 'CREDIT' | 'DEBIT' }[]} */
export const TRANSACTION_TYPE_OPTIONS = [
  { value: '', label: 'All Types', description: 'No transactionType filter — credits include sales + seller credits.' },
  {
    value: 'SALE',
    label: 'Sale',
    description: 'Buyer payment for a completed order.',
    bookingEntry: 'CREDIT',
  },
  {
    value: 'REFUND',
    label: 'Refund',
    description: 'Refund to the buyer after a return or cancellation.',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'CREDIT',
    label: 'Credit',
    description: 'Credit issued by eBay to the seller account.',
    bookingEntry: 'CREDIT',
  },
  {
    value: 'DISPUTE',
    label: 'Dispute',
    description: 'Buyer-initiated payment dispute.',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'NON_SALE_CHARGE',
    label: 'Non-Sale Charge',
    description: 'Fees billed outside the order payout (subscriptions, promoted listings, fee credits, etc.).',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'SHIPPING_LABEL',
    label: 'Shipping Label',
    description: 'Purchase or adjustment for an eBay shipping label.',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'TRANSFER',
    label: 'Transfer',
    description: 'Seller reimbursement to eBay (e.g. buyer refund recovery).',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'WITHDRAWAL',
    label: 'Withdrawal',
    description: 'On-demand payout to the seller (not available on daily payout schedules).',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'PURCHASE',
    label: 'Purchase',
    description: 'Seller purchase charged through eBay.',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'LOAN_REPAYMENT',
    label: 'Loan Repayment',
    description: 'Seller Capital / loan repayment debit.',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'ADJUSTMENT',
    label: 'Adjustment',
    description: 'Manual or system account adjustment.',
  },
  {
    value: 'BALANCE_TRANSFER',
    label: 'Balance Transfer',
    description: 'Transfer between eBay balance accounts.',
  },
];

/** @type {{ value: string, label: string, description: string }[]} */
export const TRANSACTION_STATUS_OPTIONS = [
  {
    value: 'FUNDS_AVAILABLE_FOR_PAYOUT',
    label: 'Funds available for payout',
    description: 'Proceeds are available for payout but processing has not started.',
  },
  {
    value: 'FUNDS_PROCESSING',
    label: 'Funds processing',
    description: 'Proceeds are currently being processed.',
  },
  {
    value: 'FUNDS_ON_HOLD',
    label: 'Funds on hold',
    description: 'Proceeds are held by eBay and not yet available.',
  },
  {
    value: 'PAYOUT',
    label: 'Payout',
    description: 'Proceeds have been paid out to the seller bank account.',
  },
  {
    value: 'COMPLETED',
    label: 'Completed (transfer)',
    description: 'Transfer reimbursement completed — funds received by eBay.',
  },
  {
    value: 'FAILED',
    label: 'Failed (transfer)',
    description: 'Transfer reimbursement failed.',
  },
];

export function transactionTypeLabel(value) {
  if (!value) return 'All Types';
  return TRANSACTION_TYPE_OPTIONS.find((o) => o.value === value)?.label || value;
}

export function transactionTypeDescription(value) {
  if (!value) return '';
  return TRANSACTION_TYPE_OPTIONS.find((o) => o.value === value)?.description || '';
}

export function transactionStatusLabel(value) {
  return TRANSACTION_STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
}

export function transactionStatusDescription(value) {
  return TRANSACTION_STATUS_OPTIONS.find((o) => o.value === value)?.description || '';
}

export const FEE_TYPE_DOCS =
  'https://developer.ebay.com/api-docs/sell/finances/types/api:FeeTypeEnum';

/** Common FeeTypeEnum values — eBay has no getTransactions filter for feeType. */
export const FEE_TYPE_FILTER_ALIASES = {
  STORE_SUBSCRIPTION: ['OTHER_FEES', 'STORE_SUBSCRIPTION_FEE'],
};

export function resolveFeeTypeFilterValues(feeType) {
  const key = String(feeType || '').trim().toUpperCase();
  if (!key) return [];
  if (FEE_TYPE_FILTER_ALIASES[key]) return FEE_TYPE_FILTER_ALIASES[key];
  if (key === 'OTHER_FEES' || key === 'STORE_SUBSCRIPTION_FEE') {
    return FEE_TYPE_FILTER_ALIASES.STORE_SUBSCRIPTION;
  }
  return [key];
}

export function isStoreSubscriptionFeeFilter(feeType) {
  const key = String(feeType || '').trim().toUpperCase();
  return key === 'STORE_SUBSCRIPTION'
    || key === 'OTHER_FEES'
    || key === 'STORE_SUBSCRIPTION_FEE';
}

export const FEE_TYPE_LABELS = {
  STORE_SUBSCRIPTION: 'Store Subscription Fee',
  AD_FEE: 'Promoted Listings',
  FINAL_VALUE_FEE: 'Final Value Fee',
  FINAL_VALUE_FEE_FIXED_PER_ORDER: 'Final Value Fee (Per Order)',
  INTERNATIONAL_FEE: 'International Fee',
  PAYMENT_PROCESSING_FEE: 'Payment Processing Fee',
  BELOW_STANDARD_FEE: 'Below Standard Fee',
  BELOW_STANDARD_SHIPPING_FEE: 'Below Standard Shipping Fee',
  HIGH_ITEM_NOT_AS_DESCRIBED_FEE: 'High INAD Fee',
  HIGH_ITEM_NOT_AS_DESCRIBED_SHIPPING_FEE: 'High INAD Shipping Fee',
  INSERTION_FEE: 'Insertion Fee',
  SUBTITLE_FEE: 'Subtitle Fee',
  BOLD_FEE: 'Bold Fee',
  STORE_SUBSCRIPTION_FEE: 'Store Subscription Fee',
  OTHER_FEES: 'Store Subscription Fee',
  PREMIUM_AD_FEES: 'Premium Ad Fees',
  REGULATORY_OPERATING_FEE: 'Regulatory Operating Fee',
  FEE_CREDIT: 'Fee Credit',
  TAX_DEDUCTION_AT_SOURCE: 'Tax Deduction at Source',
};

export const FEE_TYPE_OPTIONS = [
  { value: '', label: 'All Fee Types' },
  { value: 'STORE_SUBSCRIPTION', label: 'Store Subscription Fee' },
  { value: 'AD_FEE', label: 'Promoted Listings' },
  { value: 'FINAL_VALUE_FEE', label: 'Final Value Fee' },
  { value: 'FINAL_VALUE_FEE_FIXED_PER_ORDER', label: 'Final Value Fee (Per Order)' },
  { value: 'INTERNATIONAL_FEE', label: 'International Fee' },
  { value: 'PAYMENT_PROCESSING_FEE', label: 'Payment Processing Fee' },
  { value: 'BELOW_STANDARD_FEE', label: 'Below Standard Fee' },
  { value: 'BELOW_STANDARD_SHIPPING_FEE', label: 'Below Standard Shipping Fee' },
  { value: 'HIGH_ITEM_NOT_AS_DESCRIBED_FEE', label: 'High INAD Fee' },
  { value: 'HIGH_ITEM_NOT_AS_DESCRIBED_SHIPPING_FEE', label: 'High INAD Shipping Fee' },
  { value: 'INSERTION_FEE', label: 'Insertion Fee' },
  { value: 'SUBTITLE_FEE', label: 'Subtitle Fee' },
  { value: 'BOLD_FEE', label: 'Bold Fee' },
  { value: 'PREMIUM_AD_FEES', label: 'Premium Ad Fees' },
  { value: 'REGULATORY_OPERATING_FEE', label: 'Regulatory Operating Fee' },
  { value: 'FEE_CREDIT', label: 'Fee Credit' },
  { value: 'TAX_DEDUCTION_AT_SOURCE', label: 'Tax Deduction at Source' },
];

export function feeTypeLabel(value) {
  if (!value) return 'All Fee Types';
  const key = String(value).trim().toUpperCase();
  return FEE_TYPE_LABELS[key] || FEE_TYPE_OPTIONS.find((o) => o.value === key)?.label || value;
}

export function formatFeeTypeDisplay(value) {
  const key = String(value || '').trim().toUpperCase();
  if (!key) return '—';
  const label = feeTypeLabel(key);
  return label === key ? key : label;
}
