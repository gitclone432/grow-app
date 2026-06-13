const COLUMN_ALIASES = {
  orderid: 'orderId',
  ebayorderid: 'orderId',
  seller: 'sellerName',
  amazonacc: 'amazonAccount',
  amazonaccount: 'amazonAccount',
  arriving: 'arrivingDate',
  arrivingdate: 'arrivingDate',
  beforetax: 'beforeTax',
  estimatedtax: 'estimatedTax',
  azorderid: 'azOrderId',
  amazonorderid: 'azOrderId',
  amazonrefund: 'amazonRefund',
  cardname: 'cardName',
  trackingnumber: 'trackingNumber',
  notes: 'fulfillmentNotes',
  fulfillmentnotes: 'fulfillmentNotes',
  resolutions: 'resolution',
  remark: 'remark',
};

export const FULFILLMENT_IMPORT_FIELDS = [
  { key: 'orderId', label: 'Order ID', required: true },
  { key: 'amazonAccount', label: 'Amazon Acc' },
  { key: 'arrivingDate', label: 'Arriving' },
  { key: 'beforeTax', label: 'Before Tax' },
  { key: 'estimatedTax', label: 'Estimated Tax' },
  { key: 'azOrderId', label: 'Az OrderID' },
  { key: 'amazonRefund', label: 'Amazon Refund' },
  { key: 'cardName', label: 'Card Name' },
  { key: 'fulfillmentNotes', label: 'Notes' },
  { key: 'resolution', label: 'Resolutions' },
  { key: 'remark', label: 'Remark' },
];

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell);
      if (row.some((value) => String(value).trim() !== '')) {
        rows.push(row.map((value) => String(value).trim()));
      }
      row = [];
      cell = '';
      if (ch === '\r') i += 1;
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => String(value).trim() !== '')) {
      rows.push(row.map((value) => String(value).trim()));
    }
  }

  return rows;
}

function parseMoney(value) {
  const cleaned = String(value || '').replace(/[$,\s]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseArrivingDate(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let [, partA, partB, year] = slashMatch;
    if (year.length === 2) year = `20${year}`;
    let month = partA;
    let day = partB;
    if (Number(partA) > 12) {
      day = partA;
      month = partB;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return raw;
}

function coerceFieldValue(fieldKey, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value || value === '-') return null;

  if (fieldKey === 'beforeTax' || fieldKey === 'estimatedTax' || fieldKey === 'amazonRefund') {
    return parseMoney(value);
  }

  if (fieldKey === 'arrivingDate') {
    return parseArrivingDate(value);
  }

  return value;
}

export function buildHeaderIndexMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const fieldKey = COLUMN_ALIASES[normalized];
    if (fieldKey && map[fieldKey] === undefined) {
      map[fieldKey] = index;
    }
  });
  return map;
}

export function parseFulfillmentCsv(text) {
  const matrix = parseCsvText(text);
  if (!matrix.length) {
    return { rows: [], errors: [{ row: 0, reason: 'CSV is empty' }], headerMap: {} };
  }

  const headerMap = buildHeaderIndexMap(matrix[0]);
  if (headerMap.orderId === undefined) {
    return {
      rows: [],
      errors: [{ row: 1, reason: 'Missing required "Order ID" column' }],
      headerMap,
    };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    const orderId = String(cells[headerMap.orderId] || '').trim();
    if (!orderId) continue;

    const row = { orderId };
    if (headerMap.sellerName !== undefined) {
      row.sellerName = String(cells[headerMap.sellerName] || '').trim();
    }

    for (const field of FULFILLMENT_IMPORT_FIELDS) {
      if (field.key === 'orderId') continue;
      if (headerMap[field.key] === undefined) continue;
      const parsed = coerceFieldValue(field.key, cells[headerMap[field.key]]);
      if (parsed !== null && parsed !== undefined && parsed !== '') {
        row[field.key] = parsed;
      }
    }

    const hasData = Object.keys(row).some((key) => key !== 'orderId' && key !== 'sellerName');
    if (!hasData) {
      errors.push({ row: i + 1, orderId, reason: 'No fulfillment fields to import' });
      continue;
    }

    rows.push(row);
  }

  return { rows, errors, headerMap };
}

export function getDetectedColumns(headerMap) {
  return FULFILLMENT_IMPORT_FIELDS.filter((field) => headerMap[field.key] !== undefined);
}
