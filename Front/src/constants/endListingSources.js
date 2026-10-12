// EndListingLog.source → the page a listing was ended from. Shown beside
// "Ended by …" so a listing ended elsewhere (Keyword End Listing, VeRO
// cleanup…) is told apart from one ended on the page being viewed.
export const END_LISTING_SOURCE_LABELS = Object.freeze({
  duplicate_sku: 'Duplicate SKU',
  expiry_listing: 'Expiry Listing',
  amazon_stock_check: 'Amazon Stock Check',
  sku_listing_manager: 'SKU Listing Manager',
  keyword_end_listing: 'Keyword End Listing',
  excluded_brand: 'Excluded Brands',
});

export const endListingSourceLabel = (source) => END_LISTING_SOURCE_LABELS[source] || source || '';
