export function formatTerm(value, unit) {
  if (value == null || !unit) return '—';
  const label = String(unit).toLowerCase();
  return `${value} ${label}${Number(value) === 1 ? '' : 's'}`;
}

export function termInMonths(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(unit || 'MONTH').toUpperCase();
  if (u === 'YEAR') return n * 12;
  if (u === 'MONTH') return n;
  return null;
}

export function formatStoreSubscriptionPrice(level, termValue, termUnit) {
  const months = termInMonths(termValue, termUnit);
  const key = String(level || '').trim().toLowerCase();
  if (months == null || !key) return '—';

  if (key.includes('featured')) {
    if (months === 1) return '$74.95';
    if (months === 12) return '$59.95 per month';
  }
  if (key.includes('anchor')) {
    if (months === 1) return '$349.95';
    if (months === 12) return '$299.95 per month';
  }
  return '—';
}

export function formatFreeListings(level) {
  const key = String(level || '').trim().toLowerCase();
  if (key.includes('featured')) return '10,000/month';
  if (key.includes('anchor')) return '25,000/month';
  return '—';
}

export function priceSortValue(level, termValue, termUnit) {
  const months = termInMonths(termValue, termUnit);
  const key = String(level || '').trim().toLowerCase();
  if (key.includes('featured')) {
    if (months === 1) return 74.95;
    if (months === 12) return 59.95;
  }
  if (key.includes('anchor')) {
    if (months === 1) return 349.95;
    if (months === 12) return 299.95;
  }
  return -1;
}

export function freeListingsSortValue(level) {
  const key = String(level || '').trim().toLowerCase();
  if (key.includes('featured')) return 10000;
  if (key.includes('anchor')) return 25000;
  return -1;
}

export function levelSortValue(level) {
  const key = String(level || '').trim().toLowerCase();
  if (!key) return -1;
  if (key.includes('enterprise')) return 5;
  if (key.includes('anchor')) return 4;
  if (key.includes('featured') || key.includes('premium')) return 3;
  if (key.includes('basic')) return 2;
  if (key.includes('starter')) return 1;
  return 0;
}

export function levelChipColor(level) {
  const key = String(level || '').toLowerCase();
  if (key.includes('enterprise') || key.includes('anchor')) return 'secondary';
  if (key.includes('featured') || key.includes('premium')) return 'primary';
  if (key.includes('basic') || key.includes('starter')) return 'default';
  return 'info';
}

export function monthlyStorePriceAmount(level, termValue, termUnit) {
  const months = termInMonths(termValue, termUnit);
  const key = String(level || '').trim().toLowerCase();
  if (!key) return null;

  if (key.includes('featured')) {
    if (months === 1) return 74.95;
    if (months === 12) return 59.95;
    return 59.95;
  }
  if (key.includes('anchor')) {
    if (months === 1) return 349.95;
    if (months === 12) return 299.95;
    return 299.95;
  }
  return null;
}

export function mergedStatusLabel(row) {
  if (row.notConnected) return 'Not connected';
  if (row.privilegeError || row.subscriptionError) {
    return row.needsReconnect ? 'Reconnect OAuth' : 'Error';
  }
  if (row.noPlan) return 'No store plan';
  if (row.subscriptionLevel) return 'Active';
  return 'Active';
}

export function mergedStatusSortValue(row) {
  if (row.notConnected) return 1;
  if (row.privilegeError || row.subscriptionError) return 0;
  if (row.noPlan) return 2;
  if (row.subscriptionLevel) return 3;
  return 2;
}
