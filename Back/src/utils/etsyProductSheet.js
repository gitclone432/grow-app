export const ETSY_PRODUCT_SHEET_SKU_PREFIX = 'UKVLAU';
export const ETSY_PRODUCT_SHEET_FIELDS = ['date', 'productLink', 'sku', 'amazonPrice', 'etsyPrice', 'altLink'];

const SKU_PATTERN = new RegExp(`^${ETSY_PRODUCT_SHEET_SKU_PREFIX}(\\d+)$`, 'i');
const SKU_MIN_DIGITS = 3;

const ASIN_PATH_PATTERN = /\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing|product|asin|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})(?=[/?#&]|$)/i;
const ASIN_QUERY_PATTERN = /[?&](?:asin|pd_rd_i)=([A-Z0-9]{10})(?=[&#]|$)/i;
const BARE_ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const FIELD_MAX_LENGTH = { productLink: 2000, altLink: 2000 };
const DEFAULT_MAX_LENGTH = 200;

export function parseSheetSkuNumber(sku) {
  const match = String(sku ?? '').trim().match(SKU_PATTERN);
  return match ? Number(match[1]) : 0;
}

export function formatSheetSku(number) {
  return `${ETSY_PRODUCT_SHEET_SKU_PREFIX}${String(number).padStart(SKU_MIN_DIGITS, '0')}`;
}

/** Next number in the UKVLAU001, UKVLAU002, ... sequence given the SKUs already in the sheet. */
export function getNextSheetSkuNumber(skus = []) {
  let max = 0;
  for (const sku of skus) {
    max = Math.max(max, parseSheetSkuNumber(sku));
  }
  return max + 1;
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function extractAsinFromProductLink(link) {
  const text = String(link ?? '').trim();
  if (!text) return '';

  // Sponsored links carry the product path url-encoded (…&url=%2Fdp%2FB0…).
  const candidates = /%2f/i.test(text) ? [text, safeDecode(text)] : [text];

  for (const candidate of candidates) {
    const pathMatch = candidate.match(ASIN_PATH_PATTERN);
    if (pathMatch) return pathMatch[1].toUpperCase();
  }
  for (const candidate of candidates) {
    const queryMatch = candidate.match(ASIN_QUERY_PATTERN);
    if (queryMatch) return queryMatch[1].toUpperCase();
  }

  // A bare ASIN always contains a digit; this keeps 10-letter words from matching.
  if (BARE_ASIN_PATTERN.test(text) && /\d/.test(text)) return text.toUpperCase();

  return '';
}

/**
 * Identity of a product link for duplicate detection: the ASIN when the link has one,
 * otherwise the link itself with protocol / www / trailing slash removed.
 */
export function getProductLinkKey(link) {
  const text = String(link ?? '').trim();
  if (!text) return '';

  const asin = extractAsinFromProductLink(text);
  if (asin) return `asin:${asin}`;

  const normalized = text
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '');
  const slash = normalized.indexOf('/');
  const host = slash === -1 ? normalized : normalized.slice(0, slash);
  const rest = slash === -1 ? '' : normalized.slice(slash);

  return `url:${host.toLowerCase()}${rest}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

function expandYear(text) {
  return text.length === 2 ? 2000 + Number(text) : Number(text);
}

/**
 * Normalizes typed / pasted dates to YYYY-MM-DD. Numeric dates are read day-first
 * (DD-MM-YYYY) unless only month-first is possible. Unrecognized text is kept as typed.
 */
export function normalizeSheetDate(value, { today = new Date() } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])) || text;
  }

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    return toIsoDate(expandYear(match[3]), month, day) || text;
  }

  match = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([A-Za-z]{3,9})\.?(?:[-/.,\s]+(\d{2}|\d{4}))?$/);
  if (match) {
    const month = MONTH_INDEX[match[2].slice(0, 3).toLowerCase()];
    const year = match[3] ? expandYear(match[3]) : today.getFullYear();
    return (month && toIsoDate(year, month, Number(match[1]))) || text;
  }

  match = text.match(/^([A-Za-z]{3,9})\.?[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?(?:[-/.,\s]+(\d{4}))?$/);
  if (match) {
    const month = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
    const year = match[3] ? Number(match[3]) : today.getFullYear();
    return (month && toIsoDate(year, month, Number(match[2]))) || text;
  }

  return text;
}

/** Strips currency symbols / thousands separators; non-numeric text is kept as typed. */
export function normalizeSheetPrice(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  let cleaned = text.replace(/[$£€₹\s]/g, '');
  if (/^-?\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return text;
  return String(Number(cleaned));
}

export function normalizeSheetCellValue(field, value) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  const limited = text.slice(0, FIELD_MAX_LENGTH[field] || DEFAULT_MAX_LENGTH);

  if (field === 'date') return normalizeSheetDate(limited);
  if (field === 'amazonPrice' || field === 'etsyPrice') return normalizeSheetPrice(limited);
  return limited;
}
