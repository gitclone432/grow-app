const VALID_COUNTRY_CODES = new Set([
  'US', 'GB', 'CA', 'AU', 'DE', 'IN', 'FR', 'IT', 'ES', 'MX', 'JP', 'CN',
]);

const COUNTRY_SUFFIX_LABELS = {
  US: ['united states', 'usa', 'u.s.a.', 'u.s.'],
  IN: ['india', 'भारत', 'bharat'],
  GB: ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales'],
  AU: ['australia'],
  CA: ['canada'],
  DE: ['germany', 'deutschland'],
};

const STATE_SCRIPT_REPLACEMENTS = [
  [/ओडिशा/giu, 'Odisha'],
  [/ओड़िशा/giu, 'Odisha'],
  [/महाराष्ट्र/giu, 'Maharashtra'],
  [/गुजरात/giu, 'Gujarat'],
  [/कर्नाटक/giu, 'Karnataka'],
  [/तमिल\s*नाडु/giu, 'Tamil Nadu'],
  [/west bengal/giu, 'West Bengal'],
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeTradingCountryCode(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text.length === 2) return text;
  return 'US';
}

export function normalizeTradingLocationText(location, countryCode = 'US') {
  let text = String(location || '').trim();
  if (!text) return '';

  for (const [from, to] of STATE_SCRIPT_REPLACEMENTS) {
    text = text.replace(from, to);
  }

  text = text.replace(/\s+HO\b/gi, '').replace(/\s+/g, ' ').trim();

  const cc = normalizeTradingCountryCode(countryCode);
  const suffixes = COUNTRY_SUFFIX_LABELS[cc] || [];
  for (const suffix of suffixes) {
    const pattern = new RegExp(`,\\s*${escapeRegExp(suffix)}\\s*$`, 'iu');
    text = text.replace(pattern, '').trim();
  }

  return text.slice(0, 80);
}

export function normalizeStoreLocationForEbay({ location, country, postalCode } = {}) {
  const countryCode = normalizeTradingCountryCode(country);
  return {
    location: normalizeTradingLocationText(location, countryCode),
    country: countryCode,
    postalCode: String(postalCode || '').trim().slice(0, 16),
  };
}

export function validateTradingLocationFields({ location, country, postalCode } = {}) {
  const errors = [];
  const locationText = String(location || '').trim();
  const countryCode = normalizeTradingCountryCode(country);

  if (!locationText) {
    errors.push('Item location (city/region) is required in Settings → eBay Stores → Lister');
  }

  if (!VALID_COUNTRY_CODES.has(countryCode)) {
    errors.push(`Unsupported item country code "${countryCode}"`);
  }

  if (/[\u0900-\u097F]/.test(locationText)) {
    errors.push('Item location should use English/Latin text (e.g. "Balasore, Odisha"), not regional script');
  }

  return errors;
}
