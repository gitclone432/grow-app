/**
 * Flatten Amazon structured `product_information` into path → string rows.
 * Nested objects become dotted paths; arrays become "a | b" (string leaves).
 */

export function getByPath(obj, path) {
  if (obj == null || path == null || path === '') return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

export function productInfoLeafToString(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((x) => (x != null && typeof x === 'object' ? JSON.stringify(x) : String(x)))
      .join(' | ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function walkProductInformation(pi, visitor, prefix = '') {
  if (pi == null) return;
  if (typeof pi !== 'object' || Array.isArray(pi)) {
    visitor(prefix, pi);
    return;
  }
  const keys = Object.keys(pi);
  if (keys.length === 0) return;
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = pi[k];
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      walkProductInformation(v, visitor, path);
    } else {
      visitor(path, v);
    }
  }
}

function canonicalProductInformationPath(jsonPath) {
  return String(jsonPath || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/\./g, '__')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isSnakeCasePath(path) {
  return /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(String(path || ''));
}

/** Collapse Title Case + snake_case alias pairs from normalizeProductInformationKeys. */
export function dedupeProductInformationRows(rows) {
  const byCanonical = new Map();
  for (const row of rows) {
    const canon = canonicalProductInformationPath(row.jsonPath);
    const prev = byCanonical.get(canon);
    if (!prev) {
      byCanonical.set(canon, row);
      continue;
    }
    const aSnake = isSnakeCasePath(prev.jsonPath);
    const bSnake = isSnakeCasePath(row.jsonPath);
    if (aSnake && !bSnake) continue;
    if (bSnake && !aSnake) {
      byCanonical.set(canon, row);
      continue;
    }
    if (row.jsonPath.length < prev.jsonPath.length) {
      byCanonical.set(canon, row);
    }
  }
  return Array.from(byCanonical.values());
}

/**
 * @returns {{ jsonPath: string, value: string }[]}
 */
export function flattenProductInformationRows(pi, { dedupe = true } = {}) {
  const rows = [];
  if (pi == null || typeof pi !== 'object' || Array.isArray(pi)) return rows;
  walkProductInformation(pi, (jsonPath, raw) => {
    if (isExcludedProductInformationPath(jsonPath)) return;
    rows.push({ jsonPath, value: productInfoLeafToString(raw) });
  });
  return dedupe ? dedupeProductInformationRows(rows) : rows;
}

export function jsonPathToAmazonFieldKey(jsonPath) {
  const safe = String(jsonPath || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/\./g, '__');
  return `amazon_pi_${safe || 'unknown'}`;
}

/** Flat Title Case keys → snake_case for Mongo / getByPath (nested paths keep dots). */
export function resolveStorageJsonPath(jsonPath) {
  const trimmed = String(jsonPath || '').trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(trimmed)) return trimmed;
  if (trimmed.includes('.')) return trimmed;
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const EXCLUDED_PI_STORAGE_PATHS = new Set([
  'asin',
  'best_sellers_rank',
  'customer_reviews.ratings_count',
  'customer_reviews.stars',
]);

/** Keys for excluded paths — used to filter saved catalog / template dropdown options. */
export const EXCLUDED_AMAZON_PI_KEYS = new Set([
  'amazon_pi_asin',
  'amazon_pi_best_sellers_rank',
  'amazon_pi_customer_reviews__ratings_count',
  'amazon_pi_customer_reviews__stars',
]);

export function isExcludedProductInformationPath(jsonPath) {
  if (EXCLUDED_AMAZON_PI_KEYS.has(jsonPathToAmazonFieldKey(jsonPath))) return true;
  const normalized = normalizePathForExclusion(jsonPath);
  return EXCLUDED_PI_STORAGE_PATHS.has(normalized);
}

/** Normalize each dotted segment so "Customer Reviews.ratings_count" → customer_reviews.ratings_count */
function normalizePathForExclusion(jsonPath) {
  return String(jsonPath || '')
    .trim()
    .split('.')
    .map((segment) => resolveStorageJsonPath(segment))
    .filter(Boolean)
    .join('.');
}

export function filterAmazonPiCatalogColumns(columns = []) {
  return columns.filter(
    (col) => !EXCLUDED_AMAZON_PI_KEYS.has(col.key) && !isExcludedProductInformationPath(col.jsonPath)
  );
}

const AMAZON_PI_KEY_RE = /^amazon_pi_[a-z0-9_]+$/;
const MAX_KEY_LEN = 120;
const MAX_LABEL_LEN = 200;
const MAX_JSON_PATH_LEN = 300;

export function buildAmazonPiCatalogEntry(row = {}) {
  const rawPath = String(row.jsonPath || '').trim();
  if (!rawPath) return null;

  const jsonPath = resolveStorageJsonPath(rawPath).slice(0, MAX_JSON_PATH_LEN);
  if (!jsonPath || isExcludedProductInformationPath(jsonPath)) return null;

  const key = jsonPathToAmazonFieldKey(jsonPath);
  if (!AMAZON_PI_KEY_RE.test(key) || key.length > MAX_KEY_LEN) return null;

  const label = (
    String(row.label || '').trim() || jsonPathToDefaultLabel(jsonPath)
  ).slice(0, MAX_LABEL_LEN);

  return {
    key,
    label,
    jsonPath,
    lastSampleValue: String(row.value ?? row.sampleValue ?? '').slice(0, 2000),
  };
}

export function jsonPathToDefaultLabel(jsonPath) {
  return `PI: ${String(jsonPath || '').replace(/\./g, ' › ')}`;
}

/**
 * Merge saved PI column values onto a copy of amazonData for mapping / placeholders.
 */
export function augmentAmazonDataWithPiColumns(amazonData, columns) {
  const merged = { ...amazonData };
  const pi = merged.productInformation;
  if (!pi || typeof pi !== 'object') return merged;
  for (const col of columns) {
    const raw = getByPath(pi, col.jsonPath);
    merged[col.key] = productInfoLeafToString(raw);
  }
  return merged;
}
