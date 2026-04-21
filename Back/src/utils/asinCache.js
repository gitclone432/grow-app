import NodeCache from 'node-cache';

/**
 * ASIN Data Cache
 * Caches Amazon product data to avoid redundant ScraperAPI calls
 * 
 * Benefits:
 * - Instant results for repeated ASINs
 * - Reduces ScraperAPI quota usage
 * - Improves performance during testing/revisions
 */

// Cache TTL from environment (default: 1 hour = 3600 seconds)
const CACHE_TTL = parseInt(process.env.ASIN_CACHE_TTL) || 3600;
const CACHE_ENABLED = process.env.ENABLE_ASIN_CACHE !== 'false'; // Enabled by default

// Initialize cache
const asinCache = new NodeCache({
  stdTTL: CACHE_TTL,           // Standard TTL for all keys
  checkperiod: 120,             // Check for expired keys every 2 minutes
  useClones: false,             // Don't clone objects (faster for large data)
  maxKeys: 10000                // Maximum 10k ASINs in cache
});

console.log(`[ASIN Cache] 🗄️ Initialized: ${CACHE_ENABLED ? 'ENABLED' : 'DISABLED'} (TTL: ${CACHE_TTL}s, Max: 10k ASINs)`);

/**
 * Get cached ASIN data
 * @param {string} asin - Amazon ASIN
 * @param {string} [region='US'] - Marketplace region
 * @returns {Object|null} - Cached data or null if not found
 */
export function getCachedAsinData(asin, region = 'US') {
  if (!CACHE_ENABLED) return null;
  
  const key = `asin:${asin}_${region}`;
  const cached = asinCache.get(key);
  if (cached) {
    console.log(`[ASIN Cache] ✅ HIT: ${asin} (${region})`);
  }
  return cached || null;
}

/**
 * Store ASIN data in cache
 * @param {string} asin - Amazon ASIN
 * @param {Object} data - Product data to cache
 * @param {string} [region='US'] - Marketplace region
 */
export function setCachedAsinData(asin, data, region = 'US') {
  if (!CACHE_ENABLED) return;
  
  const key = `asin:${asin}_${region}`;
  const success = asinCache.set(key, data);
  if (success) {
    console.log(`[ASIN Cache] 💾 STORED: ${asin} (${region})`);
  }
}

/**
 * Invalidate cache for specific ASIN (all regions)
 * @param {string} asin - Amazon ASIN
 */
export function invalidateAsinCache(asin) {
  const regions = ['US', 'UK', 'CA', 'AU'];
  let deleted = 0;
  regions.forEach(region => {
    deleted += asinCache.del(`asin:${asin}_${region}`);
  });
  if (deleted) {
    console.log(`[ASIN Cache] 🗑️ INVALIDATED: ${asin} (${deleted} region(s))`);
  }
  return deleted > 0;
}

/**
 * Clear entire cache
 */
export function clearAsinCache() {
  asinCache.flushAll();
  console.log(`[ASIN Cache] 🧹 CLEARED: All cached data removed`);
}

/**
 * Get cache statistics
 * @returns {Object} - Cache stats
 */
export function getAsinCacheStats() {
  const stats = asinCache.getStats();
  const keys = asinCache.keys();
  
  return {
    enabled: CACHE_ENABLED,
    ttl: CACHE_TTL,
    keys: keys.length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) : 0,
    ksize: stats.ksize,
    vsize: stats.vsize
  };
}

/**
 * Warm cache with commonly used ASINs (optional)
 * @param {Array<{asin: string, data: Object}>} asinDataList
 */
export function warmAsinCache(asinDataList) {
  if (!CACHE_ENABLED) return;
  
  let warmed = 0;
  asinDataList.forEach(({ asin, data }) => {
    if (asinCache.set(`asin:${asin}`, data)) {
      warmed++;
    }
  });
  
  console.log(`[ASIN Cache] 🔥 WARMED: ${warmed} ASINs preloaded`);
  return warmed;
}

// Export cache instance for advanced usage
export default asinCache;
