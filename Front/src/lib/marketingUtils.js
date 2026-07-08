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

export function formatBudget(value, currency) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(num);
  } catch {
    return `${num} ${cur}`;
  }
}

export function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

export function resolveSellerName(sellers, sellerId, isAllStores) {
  if (isAllStores) return 'All Stores';
  return sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '';
}

const kpiCache = new Map();
const KPI_CACHE_TTL_MS = 2 * 60_000;

export function getMarketingKpiCache(key) {
  const entry = kpiCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    kpiCache.delete(key);
    return null;
  }
  return entry.rows;
}

export function setMarketingKpiCache(key, rows) {
  kpiCache.set(key, {
    rows: Array.isArray(rows) ? rows : [],
    expiresAt: Date.now() + KPI_CACHE_TTL_MS,
  });
}

export function invalidateMarketingKpiCache(prefix = '') {
  if (!prefix) {
    kpiCache.clear();
    return;
  }
  for (const key of kpiCache.keys()) {
    if (key.startsWith(prefix)) kpiCache.delete(key);
  }
}

export function buildMarketingKpiCacheKey(kind, sellerId, marketplace) {
  return `${kind}:${sellerId}:${marketplace}`;
}

const ENDING_SOON_DAYS = 5;

export function getDaysUntilEnd(endDate) {
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function isEndingWithinDays(endDate, days = ENDING_SOON_DAYS) {
  const daysUntil = getDaysUntilEnd(endDate);
  if (daysUntil == null) return false;
  return daysUntil >= 0 && daysUntil <= days;
}

const ENDING_SOON_TYPE_LABELS = {
  CODED_COUPON: 'Coupon',
  MARKDOWN_SALE: 'Markdown',
  COST_PER_SALE: 'CPS campaign',
};

export function labelEndingSoonType(kind, typeKey) {
  return ENDING_SOON_TYPE_LABELS[typeKey] || typeKey || kind;
}

export function buildEndingSoonItems({ promotions = [], campaigns = [], days = ENDING_SOON_DAYS } = {}) {
  const items = [];

  for (const row of promotions) {
    if (String(row?.promotionStatus || '').toUpperCase() !== 'RUNNING') continue;
    const type = String(row?.promotionType || '').toUpperCase();
    if (!['CODED_COUPON', 'MARKDOWN_SALE'].includes(type)) continue;
    if (!isEndingWithinDays(row?.endDate, days)) continue;
    items.push({
      id: `promo-${row.sellerId || 'one'}-${row.promotionId}`,
      kind: 'promotion',
      typeKey: type,
      typeLabel: labelEndingSoonType('promotion', type),
      name: row.promotionName || row.promotionId || 'Promotion',
      endDate: row.endDate,
      daysLeft: getDaysUntilEnd(row.endDate),
      sellerName: row.sellerName || '',
      marketplaceId: row.marketplaceId || '',
      couponCode: row.couponCode || '',
    });
  }

  for (const row of campaigns) {
    if (String(row?.campaignStatus || '').toUpperCase() !== 'RUNNING') continue;
    if (String(row?.fundingModel || '').toUpperCase() !== 'COST_PER_SALE') continue;
    if (!isEndingWithinDays(row?.endDate, days)) continue;
    items.push({
      id: `campaign-${row.sellerId || 'one'}-${row.campaignId}`,
      kind: 'campaign',
      typeKey: 'COST_PER_SALE',
      typeLabel: labelEndingSoonType('campaign', 'COST_PER_SALE'),
      name: row.campaignName || row.campaignId || 'Campaign',
      endDate: row.endDate,
      daysLeft: getDaysUntilEnd(row.endDate),
      sellerName: row.sellerName || '',
      marketplaceId: row.marketplaceId || '',
      couponCode: '',
    });
  }

  return items.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
}

const endingSoonCache = new Map();
const ENDING_SOON_CACHE_TTL_MS = 2 * 60_000;

export function getEndingSoonCache(key) {
  const entry = endingSoonCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    endingSoonCache.delete(key);
    return null;
  }
  return entry.items;
}

export function setEndingSoonCache(key, items) {
  endingSoonCache.set(key, {
    items: Array.isArray(items) ? items : [],
    expiresAt: Date.now() + ENDING_SOON_CACHE_TTL_MS,
  });
}

export function invalidateEndingSoonCache(prefix = '') {
  if (!prefix) {
    endingSoonCache.clear();
    return;
  }
  for (const key of endingSoonCache.keys()) {
    if (key.startsWith(prefix)) endingSoonCache.delete(key);
  }
}

export function buildEndingSoonCacheKey(sellerId, marketplace) {
  return `endingSoon:${sellerId}:${marketplace}`;
}
