import { parseCsvText } from './fulfillmentCsvImport.js';
import { normalizeEtsyRegion } from './etsyAddressZip.js';
import { ETSY_PRODUCT_COLUMNS, normalizeListingStatus } from '../pages/admin/etsy/etsyProductColumns.js';

const COLUMN_ALIASES = {
  '': null,
  num: null,
  no: null,
  hash: null,
  rownum: null,
  slno: null,
  sl: null,

  listeddate: 'listedDate',
  date: 'listedDate',
  listingdate: 'listedDate',

  links: 'links',
  link: 'links',
  url: 'links',
  amazonlink: 'links',
  supplierlink: 'links',

  sku: 'sku',
  itemnumber: 'sku',
  asin: 'sku',

  supplier: 'supplierPrice',
  supplierprice: 'supplierPrice',
  cost: 'supplierPrice',

  listed: 'listedPrice',
  listedprice: 'listedPrice',
  price: 'listedPrice',
  sellingprice: 'listedPrice',

  region: 'region',
  marketplace: 'region',
  country: 'region',

  listingstatus: 'listingStatus',
  status: 'listingStatus',
};

const IMPORT_COLUMNS = ETSY_PRODUCT_COLUMNS.filter(
  (col) => !['rowNum', 'timeLeft', 'store'].includes(col.key)
);

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day) return '';
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseMonthToken(token) {
  return MONTHS[String(token || '').trim().toLowerCase()] || 0;
}

function normalizeDate(value, defaultYear = new Date().getFullYear()) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let [, partA, partB, yearPart] = slashMatch;
    let year = parseInt(yearPart, 10);
    if (yearPart.length === 2) year += 2000;
    let month = parseInt(partA, 10);
    let day = parseInt(partB, 10);
    if (month > 12) {
      day = month;
      month = parseInt(partB, 10);
    }
    return toIsoDate(year, month, day) || raw;
  }

  const dayMonthMatch = raw.match(/^(\d{1,2})[-/.]([A-Za-z]{3,9})(?:[-/.](\d{2,4}))?$/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const month = parseMonthToken(dayMonthMatch[2]);
    let year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : defaultYear;
    if (dayMonthMatch[3] && dayMonthMatch[3].length === 2) year += 2000;
    const iso = toIsoDate(year, month, day);
    if (iso) return iso;
  }

  const monthDayMatch = raw.match(/^([A-Za-z]{3,9})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (monthDayMatch) {
    const month = parseMonthToken(monthDayMatch[1]);
    const day = parseInt(monthDayMatch[2], 10);
    let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : defaultYear;
    if (monthDayMatch[3] && monthDayMatch[3].length === 2) year += 2000;
    const iso = toIsoDate(year, month, day);
    if (iso) return iso;
  }

  return raw;
}

function normalizePrice(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-') return '';
  const cleaned = raw.replace(/[$₹,\s]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? String(num) : raw;
}

function coerceValue(fieldKey, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value || value === '-') return '';

  if (fieldKey === 'listedDate') return normalizeDate(value);
  if (fieldKey === 'region') return normalizeEtsyRegion(value);
  if (fieldKey === 'listingStatus') return normalizeListingStatus(value);
  if (fieldKey === 'supplierPrice' || fieldKey === 'listedPrice') return normalizePrice(value);

  return value;
}

export function buildEtsyProductHeaderIndexMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const fieldKey = COLUMN_ALIASES[normalizeHeader(header)];
    if (fieldKey && map[fieldKey] === undefined) {
      map[fieldKey] = index;
    }
  });
  return map;
}

function findHeaderRowIndex(matrix) {
  const maxScan = Math.min(12, matrix.length);
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < maxScan; i += 1) {
    const score = Object.keys(buildEtsyProductHeaderIndexMap(matrix[i] || [])).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function parseEtsyProductMatrix(matrix, options = {}) {
  const defaultYear = Number.isFinite(options.defaultYear)
    ? options.defaultYear
    : new Date().getFullYear();

  if (!matrix?.length) {
    return { rows: [], errors: [{ row: 0, reason: 'Spreadsheet is empty' }], headerMap: {}, headers: [] };
  }

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headers = matrix[headerRowIndex] || [];
  const headerMap = buildEtsyProductHeaderIndexMap(headers);
  const matchedFields = IMPORT_COLUMNS.filter((col) => headerMap[col.key] !== undefined);

  if (matchedFields.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, reason: 'No recognizable columns found. Use headers like "Listed Date", "SKU", "Supplier", "Listed", "Region", "Links".' }],
      headerMap,
      headers,
    };
  }

  const rows = [];
  const errors = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    const row = {};

    for (const column of IMPORT_COLUMNS) {
      if (headerMap[column.key] === undefined) continue;
      row[column.key] = coerceValue(column.key, cells[headerMap[column.key]]);
    }

    const hasData = Object.values(row).some((value) => String(value || '').trim());
    if (!hasData) continue;

    rows.push(row);
  }

  if (rows.length === 0) {
    errors.push({ row: 0, reason: 'No data rows found after header row' });
  }

  return { rows, errors, headerMap, headers, matchedFields };
}

export function parseEtsyProductCsv(text, options = {}) {
  const matrix = parseCsvText(text);
  if (!matrix.length) {
    return { rows: [], errors: [{ row: 0, reason: 'CSV is empty' }], headerMap: {}, headers: [] };
  }
  return parseEtsyProductMatrix(matrix, options);
}

export function getEtsyProductDetectedColumns(headerMap) {
  return IMPORT_COLUMNS.filter((column) => headerMap[column.key] !== undefined);
}

export function buildEtsyProductImportTemplateCsv() {
  const headers = IMPORT_COLUMNS.map((column) => column.label);
  return `${headers.join(',')}\n`;
}

export function downloadEtsyProductImportTemplate() {
  const blob = new Blob([buildEtsyProductImportTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'etsy-products-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}
