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
