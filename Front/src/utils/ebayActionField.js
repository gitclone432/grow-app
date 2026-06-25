export const DEFAULT_EBAY_ACTION_FIELD =
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)';

const MARKETPLACE_LABEL_BY_ACTION_SITE = {
  US: 'eBay US',
  eBayMotors: 'eBay Motors',
  UK: 'eBay UK',
  Australia: 'eBay Australia',
  Canada: 'eBay Canada',
};

function parseActionParams(actionField) {
  const params = {};
  const match = String(actionField || '').match(/\*Action\(([^)]+)\)/i);
  if (!match) return params;

  for (const segment of match[1].split('|')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    params[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim();
  }
  return params;
}

export function parseEbayActionField(customActionField) {
  const actionField = String(customActionField || DEFAULT_EBAY_ACTION_FIELD).trim() || DEFAULT_EBAY_ACTION_FIELD;
  const params = parseActionParams(actionField);
  const siteKey = params.SiteID || 'US';
  const marketplaceLabel = MARKETPLACE_LABEL_BY_ACTION_SITE[siteKey] || `eBay ${siteKey}`;

  return { actionField, siteKey, marketplaceLabel, isMotors: siteKey === 'eBayMotors' };
}
