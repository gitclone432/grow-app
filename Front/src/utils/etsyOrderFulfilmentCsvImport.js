import { parseCsvText } from './fulfillmentCsvImport.js';
import { normalizeIdentifierString } from './normalizeIdentifierString.js';
import { ETSY_ORDER_FULFILMENT_COLUMNS } from '../pages/admin/etsy/etsyOrderFulfilmentColumns.js';
import { enrichOrderWithAmazonPricing, formatExRate, formatRupeeField, ETSY_RUPEE_INPUT_FIELDS } from './etsyOrderPricing.js';
import { normalizeEtsyRegion } from './etsyAddressZip.js';

/** Exact headers from the Order Fulfilment Google Sheet (import + template). */
export const ETSY_FULFILMENT_SHEET_HEADERS = [
  { header: 'Sl. No', key: null },
  { header: 'Date of Sold', key: 'dateSold' },
  { header: 'Etsy Orders Recived Time', key: 'etsyOrdersReceivedTime' },
  { header: 'Ship By', key: 'shipBy' },
  { header: 'Estimate ETSY Delivery', key: 'estimateEtsyDelivery' },
  { header: 'Product Name', key: 'productName' },
  { header: 'SKU', key: 'sku' },
  { header: 'Address', key: 'address' },
  { header: 'Zip Code', key: 'zipCode' },
  { header: 'Qty', key: 'qty' },
  { header: 'Note', key: 'note' },
  { header: 'Message Update', key: 'messageUpdate' },
  { header: 'Etsy Price Details', key: 'soldFor' },
  { header: 'Estimate Amazon Delivery', key: 'estimateAmazonDelivery' },
  { header: 'Amazon Acc.', key: 'amazonAccount' },
  { header: 'Card No.', key: 'cardNo' },
  { header: 'Amazon Price', key: 'itemCost' },
  { header: 'Issues If Any', key: 'issuesIfAny' },
  { header: 'Tracking Id.', key: 'trackingId' },
  { header: 'Remark', key: 'remark' },
  { header: 'Tracking ID Uploaded', key: 'trackingIdUploaded' },
  { header: 'Amazon Order Number', key: 'amazonOrderNumber' },
];

/** Exact headers from the Profit Sheet Excel export (import aliases). */
export const ETSY_PROFIT_SHEET_HEADERS = [
  { header: 'Order Date', key: 'dateSold' },
  { header: 'Name', key: 'productName' },
  { header: 'Qty', key: 'qty' },
  { header: 'Sold For', key: 'soldFor' },
  { header: 'Sales Tax', key: 'tax' },
  { header: 'Etsy fee', key: 'etsyFee' },
  { header: 'Processing Fee', key: 'processingFee' },
  { header: 'Regulatory Operating fee', key: 'regulatoryOperatingFee' },
  { header: 'TDS', key: 'tds' },
  { header: 'TCS', key: 'tcs' },
  { header: 'Offsite ADS', key: 'offsiteAds' },
  { header: 'Coupons', key: 'coupons' },
  { header: 'Relist Fee', key: 'relistFee' },
  { header: 'T.Id', key: 'tId' },
  { header: 'Additional Fees', key: 'additionalFees' },
  { header: 'Net', key: 'net' },
  { header: 'P. Date', key: 'estimateAmazonDelivery' },
  { header: 'Item Cost', key: 'itemCost' },
  { header: 'Ship Cost', key: 'shipCost' },
  { header: 'in (Rs)', key: 'totalInRs' },
  { header: 'MarkUp Fee', key: 'markUpFee' },
  { header: 'IGST', key: 'igst' },
  { header: 'Ex. Rate', key: 'exRate' },
  { header: 'In Hand', key: 'inHand' },
  { header: 'Customers Name', key: 'customerName' },
  { header: 'Amazon A/C', key: 'amazonAccount' },
  { header: 'Credit Card', key: 'cardNo' },
];

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
  orderdate: 'dateSold',

  name: 'productName',
  customersname: 'customerName',
  customername: 'customerName',
  customer: 'customerName',

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
  estdelivery: 'estimateEtsyDelivery',

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

  etsypricedetails: 'soldFor',
  etsyprice: 'soldFor',
  pricedetails: 'soldFor',
  etsypricedetailssoldfor: 'soldFor',
  etsypricedetailstax: 'tax',
  etsypricedetailstotal: 'total',
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

  additionalfees: 'additionalFees',
  additionalfee: 'additionalFees',

  net: 'net',
  netamount: 'net',
  ordernet: 'net',

  estimateamazondelivery: 'estimateAmazonDelivery',
  estimatedamazondelivery: 'estimateAmazonDelivery',
  amazondelivery: 'estimateAmazonDelivery',
  pdate: 'estimateAmazonDelivery',
  purchasedate: 'estimateAmazonDelivery',
  puchasedate: 'estimateAmazonDelivery',

  amazonacc: 'amazonAccount',
  amazonaccount: 'amazonAccount',
  amazonac: 'amazonAccount',
  amazona: 'amazonAccount',

  cardno: 'cardNo',
  cardnumber: 'cardNo',
  card: 'cardNo',
  creditcard: 'cardNo',
  creditcardno: 'cardNo',

  amazonprice: 'itemCost',
  itemcost: 'itemCost',
  cost: 'itemCost',
  amazoncost: 'itemCost',

  shipcost: 'shipCost',
  shippingcost: 'shipCost',

  amazontax: 'amazonTax',

  totalinusd: 'totalInUsd',
  totalusd: 'totalInUsd',

  totalinrs: 'totalInRs',
  totalrs: 'totalInRs',
  totalinr: 'totalInRs',
  inrs: 'totalInRs',
  inrupees: 'totalInRs',

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
  trackingidupload: 'trackingIdUploaded',

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
  total: ['total', 'totalInUsd', 'amazonTotal'],
  etsypricedetails: ['soldFor', 'tax', 'total'],
};

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

for (const { header, key } of [...ETSY_FULFILMENT_SHEET_HEADERS, ...ETSY_PROFIT_SHEET_HEADERS]) {
  const normalized = normalizeHeader(header);
  if (normalized && key && COLUMN_ALIASES[normalized] == null) {
    COLUMN_ALIASES[normalized] = key;
  }
}

function combineHeaderRows(topRow = [], bottomRow = []) {
  const len = Math.max(topRow.length, bottomRow.length);
  const combined = [];
  for (let i = 0; i < len; i += 1) {
    const top = String(topRow[i] || '').trim();
    const bottom = String(bottomRow[i] || '').trim();
    if (top && bottom && normalizeHeader(top) !== normalizeHeader(bottom)) {
      combined.push(`${top} ${bottom}`);
    } else {
      combined.push(bottom || top);
    }
  }
  return combined;
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

function excelSerialToIsoDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function replaceIsoYear(iso, year) {
  if (!iso || !year) return iso;
  return `${year}${iso.slice(4)}`;
}

function alignDateYearToSold(soldIso, otherIso) {
  if (!soldIso || !otherIso) return otherIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldIso) || !/^\d{4}-\d{2}-\d{2}$/.test(otherIso)) return otherIso;
  const soldY = Number(soldIso.slice(0, 4));
  const otherY = Number(otherIso.slice(0, 4));
  if (Math.abs(otherY - soldY) >= 2) {
    return replaceIsoYear(otherIso, soldY);
  }
  return otherIso;
}

function normalizeDate(value, defaultYear = new Date().getFullYear()) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // Raw Excel serial (e.g. 46207 = 2026-07-04). Old years are usually MMM-YY
  // misreads like Jul-06 → 2006-07-01; keep month/day and use defaultYear.
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const iso = excelSerialToIsoDate(raw);
    if (iso) {
      const year = Number(iso.slice(0, 4));
      return year >= 2018 ? iso : replaceIsoYear(iso, defaultYear);
    }
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

  if (fieldKey === 'etsyOrdersReceivedTime') {
    if (/^\d{1,2}:\d{2}/.test(value)) return value;
    const fraction = Number(value);
    if (Number.isFinite(fraction) && fraction > 0 && fraction < 1) {
      const minutes = Math.round(fraction * 24 * 60);
      const hours = Math.floor(minutes / 60) % 24;
      const mins = minutes % 60;
      return `${hours}:${pad2(mins)}`;
    }
    return value;
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
      let nextIdx = repeatIndex[normalized] || 0;
      while (nextIdx < fields.length) {
        const fieldKey = fields[nextIdx];
        nextIdx += 1;
        if (map[fieldKey] === undefined) {
          map[fieldKey] = index;
          repeatIndex[normalized] = nextIdx;
          break;
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

function findHeaderRow(matrix) {
  const maxScan = Math.min(12, matrix.length);
  let best = { index: 0, dataStart: 1, headers: matrix[0] || [], score: -1 };

  for (let i = 0; i < maxScan; i += 1) {
    const row = matrix[i] || [];
    const score = Object.keys(buildEtsyHeaderIndexMap(row)).length;
    if (score > best.score) {
      best = { index: i, dataStart: i + 1, headers: row, score };
    }

    if (i + 1 < matrix.length) {
      const combined = combineHeaderRows(row, matrix[i + 1] || []);
      const combinedScore = Object.keys(buildEtsyHeaderIndexMap(combined)).length;
      if (combinedScore > best.score) {
        best = { index: i, dataStart: i + 2, headers: combined, score: combinedScore };
      }
    }
  }

  return best;
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

  const headerRow = findHeaderRow(matrix);
  const headers = headerRow.headers || [];
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

  for (let i = headerRow.dataStart; i < matrix.length; i += 1) {
    const cells = matrix[i];
    const row = {};

    for (const column of ETSY_ORDER_FULFILMENT_COLUMNS) {
      if (column.key === 'rowNum' || column.key === 'storeName') continue;
      if (headerMap[column.key] === undefined) continue;
      row[column.key] = DATE_FIELDS.has(column.key)
        ? normalizeDate(cells[headerMap[column.key]], defaultYear)
        : coerceValue(column.key, cells[headerMap[column.key]]);
    }

    const hasData = Object.values(row).some((value) => String(value || '').trim());
    if (!hasData) continue;

    if (row.dateSold) {
      row.shipBy = alignDateYearToSold(row.dateSold, row.shipBy);
      row.estimateEtsyDelivery = alignDateYearToSold(row.dateSold, row.estimateEtsyDelivery);
      row.estimateAmazonDelivery = alignDateYearToSold(row.dateSold, row.estimateAmazonDelivery);
    }

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
  const headers = ETSY_FULFILMENT_SHEET_HEADERS.map((column) => column.header);
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
