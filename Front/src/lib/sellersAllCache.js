const SELLERS_ALL_TTL_MS = 5 * 60_000;

let sellersAllCache = null;
let sellersAllExpiresAt = 0;

export function getCachedSellersAll() {
  if (sellersAllCache && Date.now() < sellersAllExpiresAt) {
    return sellersAllCache;
  }
  return null;
}

export function setCachedSellersAll(data) {
  sellersAllCache = Array.isArray(data) ? data : [];
  sellersAllExpiresAt = Date.now() + SELLERS_ALL_TTL_MS;
  return sellersAllCache;
}

export function invalidateSellersAllCache() {
  sellersAllCache = null;
  sellersAllExpiresAt = 0;
}

/** Soft prefetch used by AdminLayout — failure must never block login/admin shell. */
export async function fetchSellersAll(apiClient) {
  const cached = getCachedSellersAll();
  if (cached) return cached;

  if (!apiClient) {
    const { default: api } = await import('./api.js');
    apiClient = api;
  }

  try {
    const { data } = await apiClient.get('/sellers/all');
    return setCachedSellersAll(data);
  } catch (err) {
    // Do not clear auth here; the shared interceptor handles real session expiry.
    return [];
  }
}
