/** eBay Finances API TransactionTypeEnum — https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum */

export const TRANSACTION_TYPE_DOCS =
  'https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum';

export const TRANSACTION_STATUS_DOCS =
  'https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionStatusEnum';

/** @type {{ value: string, label: string, description: string, bookingEntry?: 'CREDIT' | 'DEBIT' }[]} */
export const TRANSACTION_TYPE_OPTIONS = [
  { value: '', label: 'All types', description: 'No transactionType filter — credits include sales + seller credits.' },
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
    label: 'Non-sale charge',
    description: 'Fees billed outside the order payout (subscriptions, promoted listings, fee credits, etc.).',
    bookingEntry: 'DEBIT',
  },
  {
    value: 'SHIPPING_LABEL',
    label: 'Shipping label',
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
    label: 'Loan repayment',
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
    label: 'Balance transfer',
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
  if (!value) return 'All types';
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
