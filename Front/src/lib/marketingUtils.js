import {
  ADVERTISING_INELIGIBLE_REASON_LABELS,
  ADVERTISING_PROGRAM_LABELS,
  FUNDING_MODEL_LABELS,
  LISTING_RECOMMENDATION_PROMOTE_LABELS,
  PROMOTION_TYPE_LABELS,
} from './marketingConstants.js';

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

export function formatDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPromotionTypeLabel(value) {
  const key = String(value || '').trim();
  if (!key) return '—';
  return PROMOTION_TYPE_LABELS[key] || key;
}

export function formatFundingModelLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  if (!key) return '—';
  return FUNDING_MODEL_LABELS[key] || key;
}

export function formatAdvertisingProgramLabel(value) {
  const key = String(value || '').trim();
  if (!key) return '—';
  return ADVERTISING_PROGRAM_LABELS[key] || key.replace(/_/g, ' ');
}

export function formatAdvertisingIneligibleReason(value) {
  const key = String(value || '').trim();
  if (!key) return '—';
  return ADVERTISING_INELIGIBLE_REASON_LABELS[key] || key.replace(/_/g, ' ').toLowerCase();
}

export function formatListingRecommendationPromoteLabel(value) {
  const key = String(value || '').trim();
  if (!key) return '—';
  return LISTING_RECOMMENDATION_PROMOTE_LABELS[key] || key.replace(/_/g, ' ');
}

export function compareAdvertisingEligibilityRows(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'desc' ? -1 : 1;
  const getters = {
    sellerName: (row) => String(row.sellerName || '').toLowerCase(),
    marketplaceId: (row) => String(row.marketplaceId || '').toLowerCase(),
    programType: (row) => String(row.programType || '').toLowerCase(),
    status: (row) => String(row.status || '').toLowerCase(),
    reason: (row) => String(row.reason || row.errorMessage || '').toLowerCase(),
  };
  const getter = getters[sortBy] || getters.programType;
  const av = getter(a);
  const bv = getter(b);
  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return 0;
}

export function compareListingRecommendationRows(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'desc' ? -1 : 1;
  const getters = {
    sellerName: (row) => String(row.sellerName || '').toLowerCase(),
    marketplaceId: (row) => String(row.marketplaceId || '').toLowerCase(),
    listingId: (row) => String(row.listingId || '').toLowerCase(),
    promoteWithAd: (row) => String(row.promoteWithAd || '').toLowerCase(),
    trendingBidPercent: (row) => Number(row.trendingBidPercent) || 0,
    message: (row) => String(row.message || row.errorMessage || '').toLowerCase(),
  };
  const getter = getters[sortBy] || getters.listingId;
  const av = getter(a);
  const bv = getter(b);
  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return 0;
}

export function filterAdvertisingEligibilityRows(rows, filters = {}) {
  const status = String(filters.status || '').trim();
  const programType = String(filters.programType || '').trim();
  const reason = String(filters.reason || '').trim();
  const storeSearch = String(filters.storeSearch || '').trim().toLowerCase();
  const marketplaceFilter = String(filters.marketplaceFilter || '').trim();

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (status) {
      const rowStatus = row.error ? 'ERROR' : String(row.status || '').trim();
      if (rowStatus !== status) return false;
    }
    if (programType && String(row.programType || '').trim() !== programType) return false;
    if (reason && String(row.reason || '').trim() !== reason) return false;
    if (marketplaceFilter && String(row.marketplaceId || '').trim() !== marketplaceFilter) return false;
    if (storeSearch) {
      const haystack = String(row.sellerName || '').toLowerCase();
      if (!haystack.includes(storeSearch)) return false;
    }
    return true;
  });
}

export function filterListingRecommendationRows(rows, filters = {}) {
  const promoteWithAd = String(filters.promoteWithAd || '').trim();
  const listingIdSearch = String(filters.listingIdSearch || '').trim();
  const storeSearch = String(filters.storeSearch || '').trim().toLowerCase();
  const marketplaceFilter = String(filters.marketplaceFilter || '').trim();

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row.error) return true;
    if (promoteWithAd && String(row.promoteWithAd || '').trim() !== promoteWithAd) return false;
    if (listingIdSearch) {
      const listingId = String(row.listingId || '').trim();
      if (!listingId.includes(listingIdSearch)) return false;
    }
    if (marketplaceFilter && String(row.marketplaceId || '').trim() !== marketplaceFilter) return false;
    if (storeSearch) {
      const haystack = String(row.sellerName || '').toLowerCase();
      if (!haystack.includes(storeSearch)) return false;
    }
    return true;
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

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getDaysUntilEnd(endDate) {
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const endDay = startOfLocalDay(end);
  const today = startOfLocalDay(now);
  const diffDays = Math.round((endDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0 && end.getTime() < now.getTime()) return -1;
  return diffDays;
}

export function isEndingWithinDays(endDate, days = ENDING_SOON_DAYS) {
  const daysUntil = getDaysUntilEnd(endDate);
  if (daysUntil == null || daysUntil < 0) return false;
  return daysUntil <= days;
}

export function formatEndingSoonBanner(items, days = ENDING_SOON_DAYS) {
  const list = Array.isArray(items) ? items : [];
  const count = list.length;
  if (count === 0) return '';

  if (count === 1) {
    const daysLeft = list[0]?.daysLeft;
    if (daysLeft === 0) return '1 ending today';
    if (daysLeft === 1) return '1 ending tomorrow';
    if (daysLeft != null && daysLeft > 1) return `1 ending in ${daysLeft} days`;
    return '1 ending soon';
  }

  const dayValues = list
    .map((item) => item.daysLeft)
    .filter((value) => value != null && value >= 0);
  if (dayValues.length === 0) return `${count} ending soon`;

  const minDays = Math.min(...dayValues);
  const maxDays = Math.max(...dayValues);
  if (minDays === maxDays) {
    if (minDays === 0) return `${count} ending today`;
    if (minDays === 1) return `${count} ending tomorrow`;
    return `${count} ending in ${minDays} days`;
  }
  if (maxDays <= days) return `${count} ending within ${maxDays} days`;
  return `${count} ending within ${days} days`;
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

function compareStringField(a, b, field, dir) {
  return dir * String(a[field] || '').localeCompare(
    String(b[field] || ''),
    undefined,
    { sensitivity: 'base', numeric: true },
  );
}

function compareDateField(a, b, field, dir) {
  const timeA = new Date(a[field] || 0).getTime();
  const timeB = new Date(b[field] || 0).getTime();
  const validA = Number.isFinite(timeA);
  const validB = Number.isFinite(timeB);
  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;
  return dir * (timeA - timeB);
}

function compareNumericField(a, b, field, dir) {
  const valA = Number(a[field]);
  const valB = Number(b[field]);
  const validA = Number.isFinite(valA);
  const validB = Number.isFinite(valB);
  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;
  return dir * (valA - valB);
}

function promotionTieBreak(a, b) {
  return String(a.sellerName || '').localeCompare(
    String(b.sellerName || ''),
    undefined,
    { sensitivity: 'base' },
  ) || String(a.promotionId || '').localeCompare(String(b.promotionId || ''));
}

const PROMOTION_API_SORT_COLUMNS = new Set(['promotionName', 'startDate', 'endDate']);

export function isPromotionApiSortable(sortBy) {
  return PROMOTION_API_SORT_COLUMNS.has(sortBy);
}

export function promotionSortToApiParam(sortBy, sortOrder) {
  const map = {
    promotionName: 'PROMOTION_NAME',
    startDate: 'START_DATE',
    endDate: 'END_DATE',
  };
  const field = map[sortBy];
  if (!field) return undefined;
  return sortOrder === 'desc' ? `-${field}` : field;
}

export function comparePromotionRows(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  let cmp = 0;

  switch (sortBy) {
    case 'sellerName':
      cmp = compareStringField(a, b, 'sellerName', 1);
      break;
    case 'promotionName':
      cmp = compareStringField(a, b, 'promotionName', 1);
      break;
    case 'promotionStatus':
      cmp = compareStringField(a, b, 'promotionStatus', 1);
      break;
    case 'promotionType':
      cmp = compareStringField(a, b, 'promotionType', 1);
      break;
    case 'startDate':
      cmp = compareDateField(a, b, 'startDate', 1);
      break;
    case 'endDate':
      cmp = compareDateField(a, b, 'endDate', 1);
      break;
    case 'couponCode':
      cmp = compareStringField(a, b, 'couponCode', 1);
      break;
    case 'marketplaceId':
      cmp = compareStringField(a, b, 'marketplaceId', 1);
      break;
    default:
      cmp = 0;
  }

  if (cmp === 0) return promotionTieBreak(a, b);
  return dir * cmp;
}

function campaignTieBreak(a, b) {
  return String(a.sellerName || '').localeCompare(
    String(b.sellerName || ''),
    undefined,
    { sensitivity: 'base' },
  ) || String(a.campaignId || '').localeCompare(String(b.campaignId || ''));
}

export function compareCampaignRows(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  let cmp = 0;

  switch (sortBy) {
    case 'sellerName':
      cmp = compareStringField(a, b, 'sellerName', 1);
      break;
    case 'campaignName':
      cmp = compareStringField(a, b, 'campaignName', 1);
      break;
    case 'campaignStatus':
      cmp = compareStringField(a, b, 'campaignStatus', 1);
      break;
    case 'startDate':
      cmp = compareDateField(a, b, 'startDate', 1);
      break;
    case 'endDate':
      cmp = compareDateField(a, b, 'endDate', 1);
      break;
    case 'fundingModel':
      cmp = compareStringField(a, b, 'fundingModel', 1);
      break;
    case 'bidPercentage':
      cmp = compareNumericField(a, b, 'bidPercentage', 1);
      break;
    case 'dailyBudgetValue':
      cmp = compareNumericField(a, b, 'dailyBudgetValue', 1);
      if (cmp === 0) {
        cmp = compareStringField(a, b, 'dailyBudgetCurrency', 1);
      }
      break;
    case 'campaignTargetingType':
      cmp = compareStringField(a, b, 'campaignTargetingType', 1);
      break;
    case 'channels': {
      const channelsA = Array.isArray(a.channels) ? a.channels.join(', ') : '';
      const channelsB = Array.isArray(b.channels) ? b.channels.join(', ') : '';
      cmp = channelsA.localeCompare(channelsB, undefined, { sensitivity: 'base' });
      break;
    }
    case 'marketplaceId':
      cmp = compareStringField(a, b, 'marketplaceId', 1);
      break;
    default:
      cmp = 0;
  }

  if (cmp === 0) return campaignTieBreak(a, b);
  return dir * cmp;
}
