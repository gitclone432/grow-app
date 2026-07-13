export function formatCompactCurrency(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
}

export function formatFullCurrency(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(num);
}

export function formatCompactNumber(num) {
  if (num === undefined || num === null || num === '') return '—';
  const n = parseInt(num, 10);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatFullNumber(num) {
  if (num === undefined || num === null || num === '') return '—';
  const n = parseInt(num, 10);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString();
}

export function formatTotalLimit(row, {
  qtyField = 'limitQuantity',
  amtField = 'limitAmount',
  currencyField = 'limitCurrency',
} = {}) {
  const qty = formatCompactNumber(row[qtyField]);
  const amt = formatCompactCurrency(row[amtField], row[currencyField]);
  if (qty === '—' && amt === '—') return '—';
  if (qty === '—') return `— / ${amt}`;
  if (amt === '—') return `${qty} / —`;
  return `${qty} / ${amt}`;
}

export function formatTotalLimitFull(row, {
  qtyField = 'limitQuantity',
  amtField = 'limitAmount',
  currencyField = 'limitCurrency',
} = {}) {
  const qty = formatFullNumber(row[qtyField]);
  const amt = formatFullCurrency(row[amtField], row[currencyField]);
  if (qty === '—' && amt === '—') return '—';
  return `${qty} / ${amt}`;
}

export function sortableTotalLimitValue(row, field, isMissing = () => false) {
  if (isMissing(row)) return null;
  const val = Number(row[field]);
  return Number.isFinite(val) ? val : null;
}

export function compareNullableNumeric(a, b, dir) {
  const aMissing = a === null;
  const bMissing = b === null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return dir * (a - b);
}

export function compareTotalLimitRows(a, b, dir, {
  qtyField = 'limitQuantity',
  amtField = 'limitAmount',
  isMissing = () => false,
} = {}) {
  const qtyA = sortableTotalLimitValue(a, qtyField, isMissing);
  const qtyB = sortableTotalLimitValue(b, qtyField, isMissing);
  const amtA = sortableTotalLimitValue(a, amtField, isMissing);
  const amtB = sortableTotalLimitValue(b, amtField, isMissing);

  let cmp = compareNullableNumeric(qtyA, qtyB, dir);
  if (cmp === 0 && qtyA !== null) {
    cmp = compareNullableNumeric(amtA, amtB, dir);
  }
  return cmp;
}
