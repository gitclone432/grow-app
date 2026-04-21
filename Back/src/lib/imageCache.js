/**
 * In-Memory Image Cache
 * 
 * Caches eBay item image URLs to reduce API calls and improve performance.
 * - LRU eviction: Removes oldest entries when maxSize is reached
 * - TTL expiration: Automatically removes entries after 1 hour
 * - Auto-cleanup: Runs every 10 minutes to remove expired entries
 * 
 * Usage:
 *   import imageCache from './lib/imageCache.js';
 *   imageCache.set('key', data);
 *   const data = imageCache.get('key');
 */

class ImageCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 500; // Store up to 500 items
    this.ttl = 3600000; // 1 hour in milliseconds (60 * 60 * 1000)
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Store data in cache
   * @param {string} key - Cache key
   * @param {any} value - Data to cache
   */
  set(key, value) {
    // LRU eviction: Remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log(`[ImageCache] Evicted oldest entry: ${firstKey}`);
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }

  /**
   * Retrieve data from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached data or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.misses++;
      return null;
    }
    
    // Check if expired
    const age = Date.now() - item.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return item.data;
  }

  /**
   * Remove a specific entry from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log('[ImageCache] Cache cleared');
  }

  /**
   * Start automatic cleanup of expired entries
   * Runs every 10 minutes
   */
  startAutoCleanup() {
    setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;
      
      for (const [key, value] of this.cache.entries()) {
        const age = now - value.timestamp;
        if (age > this.ttl) {
          this.cache.delete(key);
          expiredCount++;
        }
      }
      
      if (expiredCount > 0) {
        console.log(`[ImageCache] Auto-cleanup: Removed ${expiredCount} expired entries`);
      }
    }, 600000); // 10 minutes in milliseconds
    
    console.log('[ImageCache] Auto-cleanup started (runs every 10 minutes)');
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getStats() {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? ((this.hits / totalRequests) * 100).toFixed(2) : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      ttlHours: this.ttl / 3600000,
      hits: this.hits,
      misses: this.misses,
      totalRequests,
      hitRate: `${hitRate}%`,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Get cache size in bytes (approximate)
   * @returns {object} Size information
   */
  getSizeInfo() {
    let totalSize = 0;
    for (const [key, value] of this.cache.entries()) {
      totalSize += JSON.stringify(value).length;
    }
    
    return {
      entries: this.cache.size,
      sizeBytes: totalSize,
      sizeKB: (totalSize / 1024).toFixed(2),
      sizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }
}

// Export singleton instance
const imageCache = new ImageCache();
export default imageCache;
