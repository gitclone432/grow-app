import { parseCsvText } from './fulfillmentCsvImport.js';
import { normalizeIdentifierString } from './normalizeIdentifierString.js';
import { ETSY_ORDER_FULFILMENT_COLUMNS } from '../pages/admin/etsy/etsyOrderFulfilmentColumns.js';
import { enrichOrderWithAmazonPricing, formatExRate, formatRupeeField, ETSY_RUPEE_INPUT_FIELDS } from './etsyOrderPricing.js';
import { normalizeEtsyRegion } from './etsyAddressZip.js';
const COLUMN_ALIASES = {
  '': null,
  num: null,
  no: null,
  hash: null,
  rownum: null,
  slno: null,
  sl: null,
  serial: null,
  serialno: null,

  dateofsold: 'dateSold',
  datesold: 'dateSold',
  solddate: 'dateSold',

  etsyordersreceivedtime: 'etsyOrdersReceivedTime',
  etsyorderreceivedtime: 'etsyOrdersReceivedTime',
  etsyordersrecivedtime: 'etsyOrdersReceivedTime',
  etsyorderrecivedtime: 'etsyOrdersReceivedTime',
  ordersreceivedtime: 'etsyOrdersReceivedTime',
  receivedtime: 'etsyOrdersReceivedTime',
  etsyreceivedtime: 'etsyOrdersReceivedTime',

  shipby: 'shipBy',
  shipbydate: 'shipBy',

  estimateetsydelivery: 'estimateEtsyDelivery',
  estimatedetsydelivery: 'estimateEtsyDelivery',
  etsydelivery: 'estimateEtsyDelivery',
  etsyestimateddelivery: 'estimateEtsyDelivery',

  productname: 'productName',
  product: 'productName',
  title: 'productName',

  sku: 'sku',
  itemnumber: 'sku',
  itemno: 'sku',
  listingid: 'sku',

  address: 'address',
  shippingaddress: 'address',
  shipaddress: 'address',

  zipcode: 'zipCode',
  zip: 'zipCode',
  postalcode: 'zipCode',

  region: 'region',
  marketplace: 'region',
  marketplacecountry: 'region',
  country: 'region',

  qty: 'qty',
  quantity: 'qty',

  note: 'note',
  notes: 'note',

  messageupdate: 'messageUpdate',
  buyermessage: 'messageUpdate',

  soldfor: 'soldFor',
  sold: 'soldFor',

  tax: 'tax',
  salestax: 'tax',

  total: 'total',
  ordertotal: 'total',

  etsyfee: 'etsyFee',
  transactionfee: 'etsyFee',

  processingfee: 'processingFee',

  regulatoryoperatingfee: 'regulatoryOperatingFee',
  regulatoryfee: 'regulatoryOperatingFee',
  operatingfee: 'regulatoryOperatingFee',

  tds: 'tds',

  tcs: 'tcs',

  offsiteads: 'offsiteAds',
  offsitead: 'offsiteAds',

  coupons: 'coupons',
  coupon: 'coupons',

  relistfee: 'relistFee',

  tid: 'tId',
  transactionid: 'tId',
  etsytransactionid: 'tId',

  net: 'net',
  netamount: 'net',
  ordernet: 'net',

  estimateamazondelivery: 'estimateAmazonDelivery',
  estimatedamazondelivery: 'estimateAmazonDelivery',
  amazondelivery: 'estimateAmazonDelivery',

  amazonacc: 'amazonAccount',
  amazonaccount: 'amazonAccount',

  cardno: 'cardNo',
  cardnumber: 'cardNo',
  card: 'cardNo',

  itemcost: 'itemCost',
  cost: 'itemCost',
  amazonprice: 'itemCost',
  amazoncost: 'itemCost',

  shipcost: 'shipCost',
  shippingcost: 'shipCost',

  amazontax: 'amazonTax',

  totalinusd: 'totalInUsd',
  totalusd: 'totalInUsd',

  totalinrs: 'totalInRs',
  totalrs: 'totalInRs',
  totalinr: 'totalInRs',

  markupfee: 'markUpFee',
  markup: 'markUpFee',

  igst: 'igst',

  amazontotal: 'amazonTotal',

  exrate: 'exRate',
  exchangerate: 'exRate',
  rate: 'exRate',

  inhand: 'inHand',
  inhandamount: 'inHand',

  issuesifany: 'issuesIfAny',
  issues: 'issuesIfAny',
  issue: 'issuesIfAny',

  trackingid: 'trackingId',
  trackingnumber: 'trackingId',
  tracking: 'trackingId',

  remark: 'remark',
  remarks: 'remark',

  trackingiduploaded: 'trackingIdUploaded',
  trackinguploaded: 'trackingIdUploaded',

  amazonordernumber: 'amazonOrderNumber',
  amazonorderid: 'amazonOrderNumber',
  azordernumber: 'amazonOrderNumber',
  azorderid: 'amazonOrderNumber',

  orderstatus: 'orderStatus',

  refund: 'refund',
  refundamount: 'refund',
};

/** Headers that repeat in the sheet (e.g. Etsy Tax then Amazon Tax). */
const REPEATED_HEADER_FIELDS = {
  tax: ['tax', 'amazonTax'],
  total: ['total', 'amazonTotal'],
};

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseMonthToken(token) {
  const monthMap = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const key = String(token || '').trim().toLowerCase().slice(0, 3);
  return monthMap[key] ?? null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day || day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
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

  // 24-May, 24-May-2026, 02-Jun
  const dayMonthMatch = raw.match(/^(\d{1,2})[-/.]([A-Za-z]{3,9})(?:[-/.](\d{2,4}))?$/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const month = parseMonthToken(dayMonthMatch[2]);
    let year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : defaultYear;
    if (dayMonthMatch[3] && dayMonthMatch[3].length === 2) year += 2000;
    const iso = toIsoDate(year, month, day);
    if (iso) return iso;
  }

  // May-26, May-26-2026
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

const DATE_FIELDS = new Set([
  'dateSold',
  'shipBy',
  'estimateEtsyDelivery',
  'estimateAmazonDelivery',
]);

const IDENTIFIER_FIELDS = new Set(['trackingId', 'amazonOrderNumber']);

function coerceValue(fieldKey, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value || value === '-') return '';

  if (DATE_FIELDS.has(fieldKey)) {
    return normalizeDate(value);
  }

  if (IDENTIFIER_FIELDS.has(fieldKey)) {
    return normalizeIdentifierString(value);
  }
  if (ETSY_RUPEE_INPUT_FIELDS.has(fieldKey)) {
    return formatRupeeField(value);
  }
  if (fieldKey === 'exRate') {
    return formatExRate(value);
  }
  if (fieldKey === 'region') {
    return normalizeEtsyRegion(value);
  }

  if (fieldKey === 'trackingIdUploaded') {
    const lower = value.toLowerCase();
    if (['yes', 'y', 'true', '1', 'uploaded'].includes(lower)) return 'Yes';
    if (['no', 'n', 'false', '0', 'pending'].includes(lower)) return 'No';
    return value;
  }

  if (fieldKey === 'remark') {
    const lower = value.toLowerCase();
    if (lower === 'delivered') return 'Delivered';
    if (lower === 'in-transit' || lower === 'in transit') return 'In-transit';
    if (lower === 'not yet shipped') return 'Not Yet Shipped';
    if (lower === 'remark') return 'Remark';
    if (lower === 'shipped') return 'Shipped';
    return value;
  }

  if (fieldKey === 'issuesIfAny') {
    const lower = value.toLowerCase();
    if (lower === 'oos' || lower === 'out of stock') return 'OOS';
    if (lower === 'address issue' || lower === 'address') return 'ADDRESS ISSUE';
    if (lower === 'late delivery') return 'LATE DELIVERY';
    if (lower === 'issues if any' || lower === 'issue') return 'Issues If Any';
    return value;
  }

  return value;
}

export function buildEtsyHeaderIndexMap(headers) {
  const map = {};
  const repeatIndex = {};

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);

    if (REPEATED_HEADER_FIELDS[normalized]) {
      const fields = REPEATED_HEADER_FIELDS[normalized];
      const nextIdx = repeatIndex[normalized] || 0;
      if (nextIdx < fields.length) {
        const fieldKey = fields[nextIdx];
        if (map[fieldKey] === undefined) {
          map[fieldKey] = index;
          repeatIndex[normalized] = nextIdx + 1;
        }
      }
      return;
    }

    const fieldKey = COLUMN_ALIASES[normalized];
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
    const score = Object.keys(buildEtsyHeaderIndexMap(matrix[i] || [])).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function collectIdentifierWarnings(rows) {
  const warnings = [];
  rows.forEach((row, index) => {
    for (const [fieldKey, label] of [
      ['trackingId', 'Tracking Id'],
    ]) {
      const value = String(row[fieldKey] || '').trim();
      if (!value) continue;

      if (/[eE][+-]?\d+$/.test(value)) {
        warnings.push({
          row: index + 2,
          reason: `Row ${index + 2}: ${label} "${value}" is in scientific notation and may be wrong. Re-import using an .xlsx file from Google Sheets (File → Download → Microsoft Excel).`,
        });
        continue;
      }

      if (/^\d{16,}$/.test(value)) {
        warnings.push({
          row: index + 2,
          reason: `Row ${index + 2}: ${label} "${value}" looks truncated (CSV scientific notation). Re-import using an .xlsx file from Google Sheets.`,
        });
      }
    }
  });
  return warnings;
}

export function parseEtsyOrderFulfilmentMatrix(matrix, options = {}) {
  const defaultYear = Number.isFinite(options.defaultYear)
    ? options.defaultYear
    : new Date().getFullYear();

  if (!matrix?.length) {
    return { rows: [], errors: [{ row: 0, reason: 'Spreadsheet is empty' }], headerMap: {}, headers: [] };
  }

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headers = matrix[headerRowIndex] || [];
  const headerMap = buildEtsyHeaderIndexMap(headers);
  const matchedFields = ETSY_ORDER_FULFILMENT_COLUMNS
    .filter((col) => col.key !== 'rowNum' && headerMap[col.key] !== undefined);

  if (matchedFields.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, reason: 'No recognizable columns found. Use headers like "Date of Sold", "Product Name", etc.' }],
      headerMap,
      headers,
    };
  }

  const rows = [];
  const errors = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    const row = {};

    for (const column of ETSY_ORDER_FULFILMENT_COLUMNS) {
      if (column.key === 'rowNum' || column.key === 'storeName' || column.computed) continue;
      if (headerMap[column.key] === undefined) continue;
      row[column.key] = DATE_FIELDS.has(column.key)
        ? normalizeDate(cells[headerMap[column.key]], defaultYear)
        : coerceValue(column.key, cells[headerMap[column.key]]);
    }

    const hasData = Object.values(row).some((value) => String(value || '').trim());
    if (!hasData) continue;

    rows.push(enrichOrderWithAmazonPricing(row));
  }

  if (rows.length === 0) {
    errors.push({ row: 0, reason: 'No data rows found after header row' });
  }

  const trackingWarnings = collectIdentifierWarnings(rows);
  if (trackingWarnings.length) {
    errors.push(...trackingWarnings);
  }

  return { rows, errors, headerMap, headers, matchedFields };
}

export function parseEtsyOrderFulfilmentCsv(text, options = {}) {
  const matrix = parseCsvText(text);
  if (!matrix.length) {
    return { rows: [], errors: [{ row: 0, reason: 'CSV is empty' }], headerMap: {}, headers: [] };
  }
  return parseEtsyOrderFulfilmentMatrix(matrix, options);
}

export function getEtsyDetectedColumns(headerMap) {
  return ETSY_ORDER_FULFILMENT_COLUMNS.filter(
    (column) => !['rowNum', 'storeName'].includes(column.key) && headerMap[column.key] !== undefined
  );
}

export function buildEtsyImportTemplateCsv() {
  const headers = ETSY_ORDER_FULFILMENT_COLUMNS
    .filter((column) => !['rowNum', 'storeName'].includes(column.key))
    .map((column) => column.label);
  return `${headers.join(',')}\n`;
}

export function downloadEtsyImportTemplate() {
  const blob = new Blob([buildEtsyImportTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'etsy-order-fulfilment-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}
