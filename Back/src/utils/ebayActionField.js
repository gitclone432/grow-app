export const DEFAULT_EBAY_ACTION_FIELD =
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)';

/** Trading API X-EBAY-API-SITEID values for Action Field SiteID tokens. */
const TRADING_SITE_ID_BY_ACTION_SITE = {
  US: '0',
  eBayMotors: '100',
  UK: '3',
  Australia: '15',
  Canada: '2',
};

const MARKETPLACE_LABEL_BY_ACTION_SITE = {
  US: 'eBay US',
  eBayMotors: 'eBay Motors',
  UK: 'eBay UK',
  Australia: 'eBay Australia',
  Canada: 'eBay Canada',
};

/** Maps Action Field site to EbayStoreListerSettings region enum (US | UK | AU). */
function resolveStoreListerRegion(siteKey, country) {
  if (siteKey === 'UK') return 'UK';
  if (siteKey === 'Australia') return 'AU';
  if (country === 'GB') return 'UK';
  if (country === 'AU') return 'AU';
  return 'US';
}

function parseActionParams(actionField) {
  const params = {};
  const match = String(actionField || '').match(/\*Action\(([^)]+)\)/i);
  if (!match) return params;

  for (const segment of match[1].split('|')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (key) params[key] = value;
  }
  return params;
}

/**
 * Parse template customActionField (eBay File Exchange header) for Direct List / Trading API.
 */
export function parseEbayActionField(customActionField) {
  const actionField = String(customActionField || DEFAULT_EBAY_ACTION_FIELD).trim() || DEFAULT_EBAY_ACTION_FIELD;
  const params = parseActionParams(actionField);
  const siteKey = params.SiteID || 'US';
  const country = params.Country || 'US';
  const currency = params.Currency || 'USD';
  const siteId = TRADING_SITE_ID_BY_ACTION_SITE[siteKey] ?? '0';
  const storeListerRegion = resolveStoreListerRegion(siteKey, country);
  const marketplaceLabel = MARKETPLACE_LABEL_BY_ACTION_SITE[siteKey] || `eBay ${siteKey}`;

  return {
    actionField,
    siteKey,
    siteId,
    country,
    currency,
    storeListerRegion,
    marketplaceLabel,
    isMotors: siteKey === 'eBayMotors',
  };
}

export function resolveTemplateEbayMarketplace(template) {
  return parseEbayActionField(template?.customActionField);
}
