const DIRECT_LIST_PREFS_KEY = 'direct-list.prefs.v1';

export function readDirectListPrefs() {
  try {
    const raw = localStorage.getItem(DIRECT_LIST_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeDirectListPrefs({ sellerId, templateId, region }) {
  try {
    localStorage.setItem(
      DIRECT_LIST_PREFS_KEY,
      JSON.stringify({
        sellerId: sellerId || '',
        templateId: templateId || '',
        region: region || 'US',
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function pickInitialSelection(items, preferredId, fallbackIndex = 0) {
  if (!Array.isArray(items) || items.length === 0) return '';
  if (preferredId && items.some((item) => String(item._id) === String(preferredId))) {
    return preferredId;
  }
  return items[fallbackIndex]?._id || '';
}
