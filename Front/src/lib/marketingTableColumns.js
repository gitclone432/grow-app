export const PROMOTION_TABLE_COLUMNS = [
  { id: 'sellerName', label: 'Store' },
  { id: 'promotionName', label: 'Promotion' },
  { id: 'promotionStatus', label: 'Status' },
  { id: 'promotionType', label: 'Type' },
  { id: 'startDate', label: 'Start' },
  { id: 'endDate', label: 'End' },
  { id: 'couponCode', label: 'Coupon' },
  { id: 'marketplaceId', label: 'Marketplace' },
  { id: 'actions', label: 'Actions' },
];

export const CAMPAIGN_TABLE_COLUMNS = [
  { id: 'sellerName', label: 'Store' },
  { id: 'campaignName', label: 'Campaign' },
  { id: 'campaignStatus', label: 'Status' },
  { id: 'startDate', label: 'Start' },
  { id: 'endDate', label: 'End' },
  { id: 'fundingModel', label: 'Funding' },
  { id: 'bidPercentage', label: 'Bid %' },
  { id: 'dailyBudgetValue', label: 'Daily budget' },
  { id: 'campaignTargetingType', label: 'Targeting' },
  { id: 'channels', label: 'Channels' },
  { id: 'marketplaceId', label: 'Marketplace' },
  { id: 'actions', label: 'Actions' },
];

export const ELIGIBILITY_TABLE_COLUMNS = [
  { id: 'sellerName', label: 'Store' },
  { id: 'marketplaceId', label: 'Marketplace' },
  { id: 'programType', label: 'Program' },
  { id: 'status', label: 'Status' },
  { id: 'reason', label: 'Reason' },
];

export const RECOMMENDATIONS_TABLE_COLUMNS = [
  { id: 'sellerName', label: 'Store' },
  { id: 'marketplaceId', label: 'Marketplace' },
  { id: 'listingId', label: 'Listing ID' },
  { id: 'promoteWithAd', label: 'Promote with ad' },
  { id: 'trendingBidPercent', label: 'Trending bid %' },
  { id: 'message', label: 'Message' },
];

export const FINANCES_TRANSACTION_TABLE_COLUMNS = [
  { id: 'sellerName', label: 'Store' },
  { id: 'transactionDate', label: 'Date (PT)' },
  { id: 'transactionType', label: 'Type' },
  { id: 'transactionStatus', label: 'Status' },
  { id: 'bookingEntry', label: 'Entry' },
  { id: 'amount', label: 'Amount' },
  { id: 'totalFeeAmount', label: 'Fees' },
  { id: 'feeType', label: 'Fee type' },
  { id: 'orderId', label: 'Order' },
  { id: 'buyerUsername', label: 'Buyer' },
  { id: 'payoutId', label: 'Payout' },
];

export const MARKETING_TABLE_COLUMN_STORAGE_KEYS = {
  promotions: 'marketingPromotions.visibleColumns',
  campaigns: 'marketingCampaigns.visibleColumns',
  eligibility: 'marketingAdvertisingEligibility.visibleColumns',
  recommendations: 'marketingListingRecommendations.visibleColumns',
  financesTransactions: 'financesTransactions.visibleColumns',
};

export function defaultVisibleColumnIds(columns) {
  return columns.map((col) => col.id);
}

// `${storageKey}.known` remembers which columns existed when the page last
// loaded, so a column added in a later release can be shown by default
// without bringing back the columns the user chose to hide.
const knownColumnsKey = (storageKey) => `${storageKey}.known`;

export function loadMarketingVisibleColumns(storageKey, columns) {
  const defaults = defaultVisibleColumnIds(columns);
  try {
    let known = defaults; // nothing recorded yet: treat every column as known
    try {
      const parsedKnown = JSON.parse(localStorage.getItem(knownColumnsKey(storageKey)) || 'null');
      if (Array.isArray(parsedKnown)) known = parsedKnown;
    } catch {
      // unreadable: keep the defaults
    }
    localStorage.setItem(knownColumnsKey(storageKey), JSON.stringify(defaults));

    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const valid = new Set(defaults);
    const visible = parsed.filter((id) => valid.has(id));
    // Hidden columns stay hidden; only columns that are new since last time are added
    for (const id of defaults) {
      if (!known.includes(id) && !visible.includes(id)) visible.push(id);
    }
    return visible.length ? visible : defaults;
  } catch {
    return defaults;
  }
}

export function getMarketingColumnOptions(columns, showStoreColumn, storeColumnId = 'sellerName') {
  return showStoreColumn
    ? columns
    : columns.filter((col) => col.id !== storeColumnId);
}

export function isMarketingColumnVisible(
  visibleColumns,
  columnId,
  showStoreColumn,
  storeColumnId = 'sellerName',
) {
  if (columnId === storeColumnId && !showStoreColumn) return false;
  return visibleColumns.includes(columnId);
}

export function countMarketingTableColumns(
  visibleColumns,
  showStoreColumn,
  { storeColumnId = 'sellerName', leadingCols = 0 } = {},
) {
  let count = leadingCols;
  for (const id of visibleColumns) {
    if (id === storeColumnId && !showStoreColumn) continue;
    count += 1;
  }
  return count;
}

export function filterVisibleColumnsForSelector(visibleColumns, showStoreColumn, storeColumnId = 'sellerName') {
  return visibleColumns.filter((id) => id !== storeColumnId || showStoreColumn);
}
