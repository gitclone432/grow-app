/** Extract zip code and marketplace region from Etsy shipping address. */

export const ETSY_REGION_OPTIONS = ['USA', 'UK', 'CANADA', 'AU'];

export const ADDRESS_DERIVED_TRIGGER_FIELD = 'address';

/** @deprecated Use ADDRESS_DERIVED_TRIGGER_FIELD */
export const ADDRESS_ZIP_TRIGGER_FIELD = ADDRESS_DERIVED_TRIGGER_FIELD;

const COUNTRY_LINE_MATCHERS = [
  { pattern: /^(united states|usa|u\.?s\.?a?\.?)$/i, region: 'USA' },
  { pattern: /^(united kingdom|great britain|uk|u\.?k\.?|england|scotland|wales|northern ireland)$/i, region: 'UK' },
  { pattern: /^(canada|can)$/i, region: 'CANADA' },
  { pattern: /^(australia|aus)$/i, region: 'AU' },
];

/**
 * Typical address lines:
 *   Name
 *   Street
 *   City, ST 20678
 *   United States
 */
export function extractZipFromAddress(address) {
  const text = String(address ?? '').trim();
  if (!text) return '';

  const stateZipMatch = text.match(/\b[A-Za-z]{2}\s+(\d{5}(?:-\d{4})?)\b/);
  if (stateZipMatch) return stateZipMatch[1];

  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^united states$/i.test(line)) continue;
    if (/\(\d{3}\)/.test(line)) continue;

    const zipMatch = line.match(/\b(\d{5}(?:-\d{4})?)\b/);
    if (zipMatch) return zipMatch[1];
  }

  return '';
}

export function extractRegionFromAddress(address) {
  const text = String(address ?? '').trim();
  if (!text) return '';

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/\(\d{3}\)/.test(line)) continue;

    for (const { pattern, region } of COUNTRY_LINE_MATCHERS) {
      if (pattern.test(line)) return region;
    }
  }

  for (const { pattern, region } of COUNTRY_LINE_MATCHERS) {
    if (pattern.test(text)) return region;
  }

  if (/\b[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/.test(text)) return 'USA';
  if (/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(text)) return 'CANADA';
  if (/\b\d{4}\b/.test(text) && /\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i.test(text)) return 'AU';

  return '';
}

export function normalizeEtsyRegion(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';

  const aliases = {
    US: 'USA',
    'U.S.': 'USA',
    'U.S.A.': 'USA',
    'UNITED STATES': 'USA',
    'UNITED STATES OF AMERICA': 'USA',
    'U.K.': 'UK',
    'UNITED KINGDOM': 'UK',
    'GREAT BRITAIN': 'UK',
    CA: 'CANADA',
    CAN: 'CANADA',
    AUS: 'AU',
    AUSTRALIA: 'AU',
  };

  if (aliases[raw]) return aliases[raw];
  if (ETSY_REGION_OPTIONS.includes(raw)) return raw;
  return '';
}

export function applyAddressDerivedFields(row = {}) {
  const detectedRegion = extractRegionFromAddress(row.address);
  const storedRegion = normalizeEtsyRegion(row.region);

  return {
    zipCode: extractZipFromAddress(row.address),
    region: detectedRegion || storedRegion,
  };
}
