/** Split pipe-, comma-, or newline-separated photo URLs (max 12 for eBay). */
export function splitItemPhotoUrls(value) {
  if (Array.isArray(value)) {
    return value.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 12);
  }

  return String(value || '')
    .split(/\s*\|\s*|\s*,\s*|\n+/)
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Normalize any stored/legacy photo URL string to eBay File Exchange format (no spaces around pipes). */
export function normalizeItemPhotoUrl(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  return joinItemPhotoUrls(text);
}

/** eBay File Exchange: pipe-separated URLs with no spaces (url1|url2|url3). */
export function joinItemPhotoUrls(urls) {
  return splitItemPhotoUrls(urls).join('|');
}

/** Merge existing listing photos with additional URLs, preserving order and deduping. */
export function mergeItemPhotoUrls(existingValue, additionalUrls = []) {
  const merged = splitItemPhotoUrls(existingValue);
  const seen = new Set(merged.map((url) => url.toLowerCase()));

  for (const raw of additionalUrls) {
    const url = String(raw || '').trim();
    if (!url || seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    merged.push(url);
    if (merged.length >= 12) break;
  }

  return joinItemPhotoUrls(merged);
}
