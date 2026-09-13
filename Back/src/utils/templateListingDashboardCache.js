import NodeCache from 'node-cache';

/** Short TTL so Listings Database summary/stats are not rebuilt from 40k+ fat docs on every visit. */
const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false,
});

export function dashboardCacheKey(kind, params) {
  return `${kind}:${JSON.stringify(params)}`;
}

export function getDashboardCache(key) {
  return cache.get(key);
}

export function setDashboardCache(key, value) {
  cache.set(key, value);
}

export function invalidateTemplateListingDashboardCache() {
  cache.flushAll();
}
