export const ALL_STORES_VALUE = '__all__';
export const ALL_MARKETPLACES_VALUE = '__all__';
export const ALL_STORES_PER_SELLER_LIMIT = 50;
export const KPI_FETCH_LIMIT = 200;

export const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];

export const PROMOTION_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'DRAFT', label: 'Draft' },
];

export const PROMOTION_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'CODED_COUPON', label: 'Coded coupon' },
  { value: 'MARKDOWN_SALE', label: 'Markdown sale' },
  { value: 'ORDER_DISCOUNT', label: 'Order discount' },
  { value: 'VOLUME_DISCOUNT', label: 'Volume discount' },
];

export const CAMPAIGN_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'DELETED', label: 'Deleted' },
];

export const FUNDING_OPTIONS = [
  { value: '', label: 'All funding models' },
  { value: 'COST_PER_SALE', label: 'Cost per sale (CPS)' },
  { value: 'COST_PER_CLICK', label: 'Cost per click (CPC)' },
];

export const TARGETING_OPTIONS = [
  { value: '', label: 'All targeting types' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SMART', label: 'Smart' },
];

export const STATUS_CHIP_COLOR = {
  RUNNING: 'success',
  PAUSED: 'warning',
  ENDED: 'default',
  DELETED: 'error',
  SCHEDULED: 'info',
  DRAFT: 'default',
};
