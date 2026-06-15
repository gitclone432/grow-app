/** Column definitions for Etsy Order Fulfilment sheet */

import { ETSY_REGION_OPTIONS } from '../../../utils/etsyAddressZip.js';

export { ETSY_REGION_OPTIONS };

export const MESSAGE_UPDATE_OPTIONS = [
  'Welcome Message',
  'Awareness Message',
  'After Shipping',
  'Wrong Tracking ID',
  'Deliverde & Feedback',
  'INR/Return/Feedback Revision',
  'Late Delivery',
  'Message Update',
];

/** Google Sheets–style pill colors for Message Update */
export const MESSAGE_UPDATE_STYLES = {
  'Welcome Message': { bg: '#e8eaed', color: '#3c4043' },
  'Awareness Message': { bg: '#c9daf8', color: '#1967d2' },
  'After Shipping': { bg: '#fff2cc', color: '#7f6000' },
  'Wrong Tracking ID': { bg: '#cc0000', color: '#ffffff' },
  'Deliverde & Feedback': { bg: '#d9ead3', color: '#274e13' },
  'INR/Return/Feedback Revision': { bg: '#cc0000', color: '#ffffff' },
  'Late Delivery': { bg: '#cc0000', color: '#ffffff' },
  'Message Update': { bg: '#e8eaed', color: '#3c4043' },
};

export const REMARK_OPTIONS = [
  'Delivered',
  'In-transit',
  'Not Yet Shipped',
  'Remark',
  'Shipped',
];

export const REMARK_STYLES = {
  Delivered: { bg: '#d9ead3', color: '#274e13' },
  'In-transit': { bg: '#c9daf8', color: '#1967d2' },
  'Not Yet Shipped': { bg: '#fff2cc', color: '#7f6000' },
  Remark: { bg: '#e8eaed', color: '#3c4043' },
  Shipped: { bg: '#d0e2ff', color: '#174ea6' },
};

export const ISSUES_IF_ANY_OPTIONS = [
  'OOS',
  'ADDRESS ISSUE',
  'LATE DELIVERY',
  'Issues If Any',
];

export const ISSUES_IF_ANY_STYLES = {
  OOS: { bg: '#cc0000', color: '#ffffff' },
  'ADDRESS ISSUE': { bg: '#cc0000', color: '#ffffff' },
  'LATE DELIVERY': { bg: '#cc0000', color: '#ffffff' },
  'Issues If Any': { bg: '#e8eaed', color: '#3c4043' },
};

export const TRACKING_ID_UPLOADED_STYLES = {
  Yes: { bg: '#d9ead3', color: '#274e13' },
  No: { bg: '#cc0000', color: '#ffffff' },
};

export const ETSY_ORDER_FULFILMENT_COLUMNS = [
  { key: 'rowNum', label: '#', minWidth: 96, align: 'center', section: 'index', editable: false },
  { key: 'storeName', label: 'Store', minWidth: 120, section: 'index', editable: false },
  { key: 'dateSold', label: 'Date of Sold', minWidth: 130, section: 'etsy', inputType: 'date' },
  { key: 'etsyOrdersReceivedTime', label: 'Etsy Orders Received Time', minWidth: 190, section: 'etsy', inputType: 'text' },
  { key: 'shipBy', label: 'Ship By', minWidth: 130, section: 'etsy', inputType: 'date' },
  { key: 'estimateEtsyDelivery', label: 'Estimate ETSY Delivery', minWidth: 168, section: 'etsy', inputType: 'date' },
  { key: 'productName', label: 'Product Name', minWidth: 280, section: 'etsy', inputType: 'text', multiline: true },
  { key: 'sku', label: 'SKU', minWidth: 130, section: 'etsy', inputType: 'text' },
  { key: 'address', label: 'Address', minWidth: 280, section: 'etsy', inputType: 'text', multiline: true },
  { key: 'zipCode', label: 'Zip Code', minWidth: 112, section: 'etsy', computed: true, copyable: true },
  { key: 'region', label: 'Region', minWidth: 96, align: 'center', section: 'etsy', inputType: 'select', options: ['', ...ETSY_REGION_OPTIONS] },
  { key: 'qty', label: 'Qty', minWidth: 72, align: 'center', section: 'etsy', inputType: 'number' },
  { key: 'note', label: 'Note', minWidth: 160, section: 'etsy', inputType: 'text', multiline: true },
  { key: 'messageUpdate', label: 'Message Update', minWidth: 260, section: 'etsy', inputType: 'select', options: ['', ...MESSAGE_UPDATE_OPTIONS], optionStyles: MESSAGE_UPDATE_STYLES },
  { key: 'soldFor', label: 'Sold For', minWidth: 100, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'tax', label: 'Tax (₹)', minWidth: 96, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'total', label: 'Total (₹)', minWidth: 96, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'etsyFee', label: 'Etsy fee (₹)', minWidth: 108, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'processingFee', label: 'Processing Fee (₹)', minWidth: 132, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'regulatoryOperatingFee', label: 'Regulatory Operating fee (₹)', minWidth: 180, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'tds', label: 'TDS (₹)', minWidth: 88, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'tcs', label: 'TCS (₹)', minWidth: 88, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'offsiteAds', label: 'Offsite ADS (₹)', minWidth: 120, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'coupons', label: 'Coupons (₹)', minWidth: 108, align: 'right', section: 'etsy', inputType: 'text' },
  { key: 'relistFee', label: 'Relist Fee (₹)', minWidth: 108, align: 'right', section: 'etsy', computed: true },
  { key: 'tId', label: 'T.Id (₹)', minWidth: 120, align: 'right', section: 'etsy', computed: true },
  { key: 'net', label: 'Net (₹)', minWidth: 96, align: 'right', section: 'etsy', computed: true },
  { key: 'estimateAmazonDelivery', label: 'Estimate Amazon Delivery', minWidth: 188, section: 'amazon', inputType: 'date' },
  { key: 'itemCost', label: 'Item Cost', minWidth: 120, align: 'right', section: 'amazon', inputType: 'text' },
  { key: 'shipCost', label: 'Ship Cost', minWidth: 100, align: 'right', section: 'amazon', inputType: 'text' },
  { key: 'amazonTax', label: 'Tax', minWidth: 88, align: 'right', section: 'amazon', inputType: 'text' },
  { key: 'totalInUsd', label: 'Total in (USD)', minWidth: 112, align: 'right', section: 'amazon', computed: true },
  { key: 'totalInRs', label: 'Total in (Rs)', minWidth: 112, align: 'right', section: 'amazon', computed: true },
  { key: 'markUpFee', label: 'MarkUp Fee', minWidth: 108, align: 'right', section: 'amazon', computed: true },
  { key: 'igst', label: 'IGST', minWidth: 88, align: 'right', section: 'amazon', computed: true },
  { key: 'amazonTotal', label: 'Total', minWidth: 88, align: 'right', section: 'amazon', computed: true },
  { key: 'exRate', label: 'Ex. Rate (₹)', minWidth: 108, align: 'right', section: 'amazon', inputType: 'text' },
  { key: 'inHand', label: 'In Hand', minWidth: 96, align: 'right', section: 'amazon', computed: true },
  { key: 'amazonAccount', label: 'Amazon Acc.', minWidth: 160, section: 'amazon', inputType: 'select', options: [''] },
  { key: 'cardNo', label: 'Card No.', minWidth: 110, section: 'amazon', inputType: 'text' },
  { key: 'issuesIfAny', label: 'Issues If Any', minWidth: 180, section: 'fulfilment', inputType: 'select', options: ['', ...ISSUES_IF_ANY_OPTIONS], optionStyles: ISSUES_IF_ANY_STYLES },
  { key: 'trackingId', label: 'Tracking Id.', minWidth: 140, section: 'fulfilment', inputType: 'text' },
  { key: 'remark', label: 'Remark', minWidth: 180, section: 'fulfilment', inputType: 'select', options: ['', ...REMARK_OPTIONS], optionStyles: REMARK_STYLES },
  { key: 'trackingIdUploaded', label: 'Tracking ID Uploaded', minWidth: 180, section: 'fulfilment', inputType: 'select', options: ['', 'Yes', 'No'], optionStyles: TRACKING_ID_UPLOADED_STYLES },
  { key: 'amazonOrderNumber', label: 'Amazon Order Number', minWidth: 168, section: 'fulfilment', inputType: 'text' },
  { key: 'orderStatus', label: 'Order Status', minWidth: 140, section: 'fulfilment', inputType: 'text' },
  { key: 'refund', label: 'Refund', minWidth: 100, align: 'right', section: 'fulfilment', inputType: 'text' },
];

export const LOCKED_ETSY_COLUMNS = new Set(['rowNum']);

export const DEFAULT_VISIBLE_ETSY_COLUMNS = ETSY_ORDER_FULFILMENT_COLUMNS.map((column) => column.key);

export const ETSY_COLUMN_SELECTOR_OPTIONS = ETSY_ORDER_FULFILMENT_COLUMNS
  .filter((column) => !LOCKED_ETSY_COLUMNS.has(column.key))
  .map((column) => ({ id: column.key, label: column.label }));

export const ETSY_VISIBLE_COLUMNS_STORAGE_KEY = 'etsyOrderFulfilment.visibleColumns';

export function loadVisibleEtsyColumns() {
  const allKeys = DEFAULT_VISIBLE_ETSY_COLUMNS;

  try {
    const raw = localStorage.getItem(ETSY_VISIBLE_COLUMNS_STORAGE_KEY);
    if (!raw) return [...allKeys];

    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) return [...allKeys];

    const valid = stored.filter((key) => allKeys.includes(key));
    if (!valid.includes('rowNum')) valid.unshift('rowNum');

    const missing = allKeys.filter((key) => !valid.includes(key));
    return missing.length > 0 ? [...valid, ...missing] : valid;
  } catch {
    return [...allKeys];
  }
}

export function saveVisibleEtsyColumns(columns) {
  try {
    localStorage.setItem(ETSY_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // ignore quota / private mode errors
  }
}

export function orderVisibleEtsyColumnKeys(keys) {
  const keySet = new Set(keys);
  if (!keySet.has('rowNum')) keySet.add('rowNum');

  return ETSY_ORDER_FULFILMENT_COLUMNS
    .map((column) => column.key)
    .filter((key) => keySet.has(key));
}

export function buildVisibleEtsySectionHeaders(visibleColumns) {
  const visibleSet = new Set(visibleColumns);

  return ETSY_SECTION_HEADERS
    .map((section) => ({
      ...section,
      colspan: ETSY_ORDER_FULFILMENT_COLUMNS.filter(
        (column) => column.section === section.id && visibleSet.has(column.key)
      ).length,
    }))
    .filter((section) => section.colspan > 0);
}

export const ETSY_SECTION_HEADERS = [
  { id: 'index', label: '', colspan: 2, bgcolor: '#e3f2fd' },
  { id: 'etsy', label: 'Etsy', colspan: 25, bgcolor: '#fff3e0' },
  { id: 'amazon', label: 'Amazon', colspan: 13, bgcolor: '#e8f5e9' },
  { id: 'fulfilment', label: 'Fulfilment', colspan: 7, bgcolor: '#fce4ec' },
];

export function createEmptyEtsyOrderRow() {
  return {
    dateSold: '',
    etsyOrdersReceivedTime: '',
    shipBy: '',
    estimateEtsyDelivery: '',
    productName: '',
    sku: '',
    address: '',
    zipCode: '',
    region: '',
    qty: '',
    note: '',
    messageUpdate: '',
    soldFor: '',
    tax: '',
    total: '',
    etsyFee: '',
    processingFee: '',
    regulatoryOperatingFee: '',
    tds: '',
    tcs: '',
    offsiteAds: '',
    coupons: '',
    relistFee: '',
    tId: '',
    net: '',
    estimateAmazonDelivery: '',
    amazonAccount: '',
    cardNo: '',
    itemCost: '',
    shipCost: '',
    amazonTax: '',
    totalInUsd: '',
    totalInRs: '',
    markUpFee: '',
    igst: '',
    amazonTotal: '',
    exRate: '',
    inHand: '',
    issuesIfAny: '',
    trackingId: '',
    remark: '',
    trackingIdUploaded: '',
    amazonOrderNumber: '',
    orderStatus: '',
    refund: '',
  };
}

export function formatEtsyCellValue(value) {
  if (value == null || value === '') return '-';
  return String(value);
}
