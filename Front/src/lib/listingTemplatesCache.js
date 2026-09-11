const LISTING_TEMPLATES_SUMMARY_TTL_MS = 5 * 60_000;

let summaryCache = null;
let summaryExpiresAt = 0;

export function getCachedListingTemplatesSummary() {
  if (summaryCache && Date.now() < summaryExpiresAt) {
    return summaryCache;
  }
  return null;
}

export function setCachedListingTemplatesSummary(data) {
  summaryCache = Array.isArray(data) ? data : [];
  summaryExpiresAt = Date.now() + LISTING_TEMPLATES_SUMMARY_TTL_MS;
  return summaryCache;
}

export function invalidateListingTemplatesSummaryCache() {
  summaryCache = null;
  summaryExpiresAt = 0;
}

export async function fetchListingTemplatesSummary(apiClient) {
  const cached = getCachedListingTemplatesSummary();
  if (cached) return cached;

  if (!apiClient) {
    const { default: api } = await import('./api.js');
    apiClient = api;
  }

  const { data } = await apiClient.get('/listing-templates', {
    params: { summary: true },
    timeout: 30000,
  });
  return setCachedListingTemplatesSummary(data);
}

/** One option per template name (newest wins). Keeps the selected id if it is a same-name duplicate. */
export function uniqueTemplatesForPicker(templates = [], selectedId = '') {
  const selected = String(selectedId || '');
  const byId = new Map();
  for (const template of Array.isArray(templates) ? templates : []) {
    const id = String(template?._id || '');
    const name = String(template?.name || '').trim();
    if (!id || !name) continue;
    byId.set(id, {
      _id: id,
      name,
      updatedAt: template.updatedAt || template.createdAt || '',
    });
  }

  const byName = new Map();
  for (const template of byId.values()) {
    const key = template.name.toLowerCase();
    const existing = byName.get(key);
    const isSelected = Boolean(selected) && template._id === selected;
    const existingSelected = Boolean(selected) && existing && existing._id === selected;
    if (existingSelected && !isSelected) continue;
    if (!existing || isSelected || String(template.updatedAt) > String(existing.updatedAt)) {
      byName.set(key, template);
    }
  }

  return [...byName.values()]
    .map(({ _id, name }) => ({ _id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function filterTemplatesByName(options, state) {
  const query = String(state?.inputValue || '').trim().toLowerCase();
  if (!query) return options;
  return options.filter((option) => String(option?.name || '').toLowerCase().includes(query));
}
