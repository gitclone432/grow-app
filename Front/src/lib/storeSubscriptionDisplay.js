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

  if (key.includes('premium') || key.includes('featured')) {
    if (months === 1) return '$74.95';
    if (months === 12) return '$59.95 / mo';
  }
  if (key.includes('anchor')) {
    if (months === 1) return '$349.95';
    if (months === 12) return '$299.95 / mo';
  }
  return '—';
}

export function freeListingsAllowanceNumber(level) {
  const key = String(level || '').trim().toLowerCase();
  if (key.includes('premium') || key.includes('featured')) return 10000;
  if (key.includes('anchor')) return 25000;
  return null;
}

export function formatFreeListings(level) {
  const n = freeListingsAllowanceNumber(level);
  if (n == null) return '—';
  return `${n.toLocaleString()} / mo`;
}

export function priceSortValue(level, termValue, termUnit) {
  const months = termInMonths(termValue, termUnit);
  const key = String(level || '').trim().toLowerCase();
  if (key.includes('premium') || key.includes('featured')) {
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
  return freeListingsAllowanceNumber(level) ?? -1;
}

/** Listing readiness from remaining selling + free-listing headroom. */
export function listingCapacityStatus(row) {
  if (row.notConnected) {
    return { id: 'disconnected', label: 'Not connected', color: 'warning', severity: 1 };
  }
  if (row.privilegeError || row.subscriptionError) {
    return {
      id: 'error',
      label: row.needsReconnect ? 'Reconnect OAuth' : 'Error',
      color: 'error',
      severity: 0,
    };
  }
  if (row.sellingBlocked) {
    return { id: 'blocked', label: 'Blocked — selling limit', color: 'error', severity: 0 };
  }
  if (row.freeListingsExhausted) {
    return { id: 'fee_risk', label: 'Fee risk — free listings used', color: 'warning', severity: 2 };
  }
  const freeRem = row.freeListingsRemainingEst;
  const qtyRem = row.quantityLimitRemaining != null ? Number(row.quantityLimitRemaining) : null;
  const amtRem = row.amountLimitRemaining != null ? Number(row.amountLimitRemaining) : null;
  const freeLow = freeRem != null && freeRem <= Math.max(50, Math.round((row.freeListingsAllowance || 0) * 0.05));
  const qtyLow = qtyRem != null && row.accountLimitQuantity
    ? qtyRem <= Math.max(10, Math.round(Number(row.accountLimitQuantity) * 0.05))
    : qtyRem != null && qtyRem <= 20;
  const amtLow = amtRem != null && row.accountLimitAmount
    ? amtRem <= Math.max(100, Number(row.accountLimitAmount) * 0.05)
    : false;
  if (freeLow || qtyLow || amtLow) {
    return { id: 'low', label: 'Low remaining', color: 'warning', severity: 3 };
  }
  if (row.noPlan) {
    return { id: 'no_plan', label: 'No store plan', color: 'default', severity: 2 };
  }
  return { id: 'ok', label: 'OK to list', color: 'success', severity: 4 };
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
