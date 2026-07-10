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

export const PROMOTION_TYPE_LABELS = {
  CODED_COUPON: 'COUPON',
  MARKDOWN_SALE: 'Markdown sale',
  ORDER_DISCOUNT: 'Order discount',
  VOLUME_DISCOUNT: 'Volume discount',
};

export const PROMOTION_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'CODED_COUPON', label: PROMOTION_TYPE_LABELS.CODED_COUPON },
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

export const CAMPAIGN_CHANNEL_OPTIONS = [
  { value: 'ON_SITE', label: 'On-site (Promoted Listings)' },
  { value: 'OFF_SITE', label: 'Off-site' },
];

export const AD_RATE_STRATEGY_OPTIONS = [
  { value: 'FIXED', label: 'Fixed ad rate' },
  { value: 'DYNAMIC', label: 'Dynamic ad rate' },
];

export const BIDDING_STRATEGY_OPTIONS = [
  { value: 'DYNAMIC', label: 'Dynamic (eBay manages bids)' },
  { value: 'FIXED', label: 'Fixed (manual keyword bids)' },
];

export const ADVERTISING_PROGRAM_LABELS = {
  PROMOTED_LISTINGS: 'Promoted Listings',
  PROMOTED_LISTINGS_STANDARD: 'Promoted Listings (General)',
  PROMOTED_LISTINGS_ADVANCED: 'Promoted Listings (Priority)',
  PROMOTED_LISTINGS_PRIORITY: 'Promoted Listings (Priority)',
  OFFSITE_ADS: 'Promoted Offsite',
};

export const ADVERTISING_INELIGIBLE_REASON_LABELS = {
  NOT_ENOUGH_ACTIVITY: 'Not enough activity — new accounts may take a few weeks',
  NOT_IN_GOOD_STANDING: 'Account not in good standing (Below Standard)',
  RESTRICTED: 'Restricted — invite-only program',
};

export const ADVERTISING_ELIGIBILITY_STATUS_CHIP_COLOR = {
  ELIGIBLE: 'success',
  INELIGIBLE: 'warning',
  ERROR: 'error',
};

export const ADVERTISING_ELIGIBILITY_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ELIGIBLE', label: 'Eligible' },
  { value: 'INELIGIBLE', label: 'Ineligible' },
  { value: 'ERROR', label: 'Error' },
];

export const ADVERTISING_PROGRAM_OPTIONS = [
  { value: '', label: 'All programs' },
  { value: 'PROMOTED_LISTINGS', label: ADVERTISING_PROGRAM_LABELS.PROMOTED_LISTINGS },
  { value: 'PROMOTED_LISTINGS_STANDARD', label: ADVERTISING_PROGRAM_LABELS.PROMOTED_LISTINGS_STANDARD },
  { value: 'PROMOTED_LISTINGS_ADVANCED', label: ADVERTISING_PROGRAM_LABELS.PROMOTED_LISTINGS_ADVANCED },
  { value: 'PROMOTED_LISTINGS_PRIORITY', label: ADVERTISING_PROGRAM_LABELS.PROMOTED_LISTINGS_PRIORITY },
  { value: 'OFFSITE_ADS', label: ADVERTISING_PROGRAM_LABELS.OFFSITE_ADS },
];

export const ADVERTISING_INELIGIBLE_REASON_OPTIONS = [
  { value: '', label: 'All reasons' },
  { value: 'NOT_ENOUGH_ACTIVITY', label: 'Not enough activity' },
  { value: 'NOT_IN_GOOD_STANDING', label: 'Not in good standing' },
  { value: 'RESTRICTED', label: 'Restricted / invite-only' },
];

export const LISTING_RECOMMENDATION_PROMOTE_LABELS = {
  RECOMMENDED: 'Recommended',
  UNDETERMINED: 'Undetermined',
};

export const LISTING_RECOMMENDATION_PROMOTE_CHIP_COLOR = {
  RECOMMENDED: 'success',
  UNDETERMINED: 'default',
  ERROR: 'error',
};

export const LISTING_RECOMMENDATION_PROMOTE_OPTIONS = [
  { value: '', label: 'All promote statuses' },
  { value: 'RECOMMENDED', label: LISTING_RECOMMENDATION_PROMOTE_LABELS.RECOMMENDED },
  { value: 'UNDETERMINED', label: LISTING_RECOMMENDATION_PROMOTE_LABELS.UNDETERMINED },
];

export const STATUS_CHIP_COLOR = {
  RUNNING: 'success',
  PAUSED: 'warning',
  ENDED: 'default',
  DELETED: 'error',
  SCHEDULED: 'info',
  DRAFT: 'default',
};
