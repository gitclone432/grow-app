export const PAGE_SIZES = [25, 50, 100, 200];

export const FEEDBACK_DOCS = {
  awaiting:
    'https://developer.ebay.com/develop/api/sell/feedback_api#sell-feedback_api-awaiting_feedback-getitemsawaitingfeedback',
  list:
    'https://developer.ebay.com/develop/api/sell/feedback_api#sell-feedback_api-feedback-getfeedback',
  summary:
    'https://developer.ebay.com/develop/api/sell/feedback_api#sell-feedback_api-feedback_rating_summary-getfeedbackratingsummary',
};

export function formatMoney(price) {
  if (!price) return '—';
  const value = price.value ?? price.amount ?? price;
  const currency = price.currency || price.currencyId || 'USD';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPercent(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${n.toFixed(2)}%`;
}

export function formatAverage(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2);
}

export function formatPeriodLabel(period) {
  if (!period) return '—';
  const map = {
    ThirtyDays: '30 days',
    FiftyTwoWeeks: '52 weeks',
  };
  return map[period] || String(period).replace(/([A-Z])/g, ' $1').trim();
}

export function formatRatingType(value) {
  if (!value) return '—';
  return String(value).replace(/([A-Z])/g, ' $1').trim();
}

export function ebayListingUrl(listingId) {
  if (!listingId) return null;
  return `https://www.ebay.com/itm/${listingId}`;
}

export function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

export function sourceLabel(source) {
  return source === 'trading' ? 'Trading API' : 'Feedback API';
}

export function pickPartner(item) {
  return (
    item.userName
    || item.partnerUserName
    || item.transactionPartner?.userName
    || item.buyer?.userName
    || item.seller?.userName
    || item.orderPartner?.userName
    || '—'
  );
}

export function pickListingId(item) {
  return item.listingId || item.itemId || item.item?.itemId || '';
}

export function pickTitle(item) {
  return item.title || item.item?.title || item.listingTitle || '—';
}

export function pickOrderLineItemId(item) {
  return item.orderLineItemId || item.lineItemId || item.transactionId || '—';
}

export function pickEndDate(item) {
  return item.endDate
    || item.transactionEndDate
    || item.listingEndDate
    || item.item?.listingDetails?.endTime
    || item.transactionDate
    || null;
}

export function pickRole(item) {
  return item.role || item.userRole || item.transactionRole || '—';
}
