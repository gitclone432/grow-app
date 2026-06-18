import { ETSY_REGION_OPTIONS } from '../../../utils/etsyAddressZip.js';

export const LISTING_STATUS_OPTIONS = ['Listed', 'Ended', 'Renew'];

export const LISTING_STATUS_STYLES = {
  Listed: { bg: '#d9ead3', color: '#274e13' },
  Ended: { bg: '#cc0000', color: '#ffffff' },
  Renew: { bg: '#c9daf8', color: '#1967d2' },
};

export function normalizeListingStatus(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (LISTING_STATUS_OPTIONS.includes(raw)) return raw;

  const aliases = {
    active: 'Listed',
    listed: 'Listed',
    draft: 'Listed',
    expired: 'Ended',
    ended: 'Ended',
    inactive: 'Ended',
    'sold out': 'Ended',
    renew: 'Renew',
    renewal: 'Renew',
  };

  return aliases[raw.toLowerCase()] || raw;
}

export const ETSY_PRODUCT_COLUMNS = [
  { key: 'rowNum', label: '#', minWidth: 88, align: 'center', editable: false },
  { key: 'listedDate', label: 'Listed Date', minWidth: 118, inputType: 'date' },
  { key: 'store', label: 'Store', minWidth: 110, inputType: 'select', options: [''] },
  { key: 'sku', label: 'SKU', minWidth: 108, inputType: 'text', emptyLabel: 'Auto from link' },
  { key: 'supplierPrice', label: 'Supplier', minWidth: 96, align: 'right', inputType: 'text', format: 'usd' },
  { key: 'listedPrice', label: 'Listed', minWidth: 96, align: 'right', inputType: 'text', format: 'usd' },
  { key: 'region', label: 'Region', minWidth: 80, align: 'center', inputType: 'select', options: ['', ...ETSY_REGION_OPTIONS] },
  { key: 'timeLeft', label: 'Time Left', minWidth: 108, align: 'center', computed: true },
  { key: 'links', label: 'Links', minWidth: 180, inputType: 'text', multiline: true, copyable: true },
  {
    key: 'listingStatus',
    label: 'Listing Status',
    minWidth: 132,
    align: 'center',
    sticky: 'right',
    alwaysEdit: true,
    inputType: 'select',
    options: ['', ...LISTING_STATUS_OPTIONS],
    optionLabels: { '': 'Select status' },
    emptyLabel: 'Select status',
    optionStyles: LISTING_STATUS_STYLES,
  },
];

export function createEmptyEtsyProductRow() {
  return {
    listedDate: '',
    links: '',
    sku: '',
    supplierPrice: '',
    listedPrice: '',
    region: '',
    timeLeft: '',
    listingStatus: '',
  };
}
