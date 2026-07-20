/**
 * eBay Seller Hub "Create new drafts" CSV format
 * (eBay-draft-listings-template_US / locale variants).
 */

export const DRAFT_LISTING_ACTION_HEADER =
  'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)';

export const DRAFT_LISTING_CORE_HEADERS = [
  DRAFT_LISTING_ACTION_HEADER,
  'Custom label (SKU)',
  'Category ID',
  'Title',
  'UPC',
  'Price',
  'Quantity',
  'Item photo URL',
  'Condition ID',
  'Description',
  'Format',
];

/** @deprecated use DRAFT_LISTING_CORE_HEADERS */
export const DRAFT_LISTING_HEADERS = DRAFT_LISTING_CORE_HEADERS;

const DRAFT_MARKET = {
  US: { siteId: 'US', country: 'US', currency: 'USD', templateSuffix: 'US' },
  UK: { siteId: 'UK', country: 'GB', currency: 'GBP', templateSuffix: 'UK' },
  GB: { siteId: 'UK', country: 'GB', currency: 'GBP', templateSuffix: 'UK' },
  AU: { siteId: 'AU', country: 'AU', currency: 'AUD', templateSuffix: 'AU' },
  CA: { siteId: 'CA', country: 'CA', currency: 'CAD', templateSuffix: 'CA' },
  Canada: { siteId: 'CA', country: 'CA', currency: 'CAD', templateSuffix: 'CA' },
};

export function resolveDraftMarket(countryOrSite = 'US') {
  const key = String(countryOrSite || 'US').trim();
  return DRAFT_MARKET[key] || DRAFT_MARKET.US;
}

export function buildDraftActionHeader(countryOrSite = 'US') {
  const m = resolveDraftMarket(countryOrSite);
  return `Action(SiteID=${m.siteId}|Country=${m.country}|Currency=${m.currency}|Version=1193|CC=UTF-8)`;
}

function padRow(cells, columnCount) {
  const row = [...cells];
  while (row.length < columnCount) row.push('');
  return row.slice(0, columnCount);
}

export function buildDraftListingInfoRows(columnCount = 11, countryOrSite = 'US') {
  const m = resolveDraftMarket(countryOrSite);
  return [
    padRow(
      ['#INFO', 'Version=0.0.2', `Template= eBay-draft-listings-template_${m.templateSuffix}`],
      columnCount
    ),
    padRow(
      [
        '#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html',
      ],
      columnCount
    ),
    padRow(
      [
        "#INFO After you've successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",
      ],
      columnCount
    ),
    padRow(['#INFO'], columnCount),
  ];
}

export function toDraftConditionId(conditionId) {
  const raw = String(conditionId || '').trim();
  if (!raw) return 'NEW';
  if (/^new$/i.test(raw)) return 'NEW';
  if (/^used$/i.test(raw)) return 'USED';
  if (/^1000/.test(raw) || /new/i.test(raw)) return 'NEW';
  if (/^3000|^4000|^5000|used/i.test(raw)) return 'USED';
  return 'NEW';
}

export function sanitizeDraftDescription(description) {
  return String(description || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .trim();
}

/** Draft photo field: first URL only (official template is single-photo oriented). */
export function firstPhotoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.split(/\s*\|\s*|\s*,\s*/)[0].trim();
}

export function listingToDraftCsvRow(listing, helpers = {}) {
  const joinPhotos =
    typeof helpers.joinItemPhotoUrls === 'function'
      ? helpers.joinItemPhotoUrls
      : (v) => String(v || '');

  return [
    'Draft',
    listing.customLabel || '',
    listing.categoryId || '',
    listing.title || '',
    listing.upc || '',
    listing.startPrice || '',
    listing.quantity ?? 1,
    firstPhotoUrl(joinPhotos(listing.itemPhotoUrl || '')),
    toDraftConditionId(listing.conditionId),
    sanitizeDraftDescription(listing.description),
    listing.format || 'FixedPrice',
  ];
}

export function rowsToCsvString(rows, { withBom = false, eol = '\r\n' } = {}) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    )
    .join(eol);
  return withBom ? `\uFEFF${body}` : body;
}

export function buildDraftListingsCsv(listings, helpers = {}, countryOrSite = 'US') {
  const actionHeader = buildDraftActionHeader(countryOrSite);
  const headers = [actionHeader, ...DRAFT_LISTING_CORE_HEADERS.slice(1)];
  const infoRows = buildDraftListingInfoRows(headers.length, countryOrSite);
  const dataRows = (listings || []).map((listing) => listingToDraftCsvRow(listing, helpers));
  return rowsToCsvString([...infoRows, headers, ...dataRows]);
}

export function looksLikeDraftListingCsv(text = '') {
  const sample = String(text || '').slice(0, 8000);
  if (/eBay-draft-listings-template/i.test(sample)) return true;
  if (/(^|,|\r?\n)Draft(,|\r?\n|$)/m.test(sample) && /Action\(/i.test(sample)) return true;
  return false;
}

/** Minimal RFC4180-ish CSV parse (quoted fields, commas, CRLF/LF). */
export function parseCsvRows(text) {
  const input = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c || '').trim() !== ''));
}

function normalizeHeaderKey(h) {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

/**
 * Light touch only: strip UTF-8 BOM and normalize newlines to CRLF.
 * Do NOT rebuild columns — Seller Hub–valid files must be sent byte-stable via Feed API.
 */
export function prepareFxCsvBufferForUpload(fileBuffer) {
  let buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(String(fileBuffer || ''), 'utf8');
  let strippedBom = false;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
    strippedBom = true;
  }
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    strippedBom = true;
  }
  const crlf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
  const kind = looksLikeDraftListingCsv(crlf) ? 'draft' : 'active';
  return {
    buffer: Buffer.from(crlf, 'utf8'),
    kind,
    changed: strippedBom || crlf !== text,
    rowCount: null,
  };
}
