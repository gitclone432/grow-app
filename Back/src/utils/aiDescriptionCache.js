import NodeCache from 'node-cache';

/**
 * Cache AI description / feature-bullet text by template + ASIN.
 * Avoids repeating ~10–15s OpenAI calls when the same ASIN is prepared again
 * for the same listing template.
 */

const TTL = parseInt(process.env.AI_DESCRIPTION_CACHE_TTL, 10) || 86400; // 24h
const ENABLED = process.env.ENABLE_AI_DESCRIPTION_CACHE !== 'false';

const cache = new NodeCache({
  stdTTL: TTL,
  checkperiod: 600,
  useClones: false,
  maxKeys: 20000,
});

console.log(
  `[AI Description Cache] Initialized: ${ENABLED ? 'ENABLED' : 'DISABLED'} (TTL: ${TTL}s)`
);

function buildKey(templateId, asin, region = 'US') {
  const t = String(templateId || '').trim() || 'none';
  const a = String(asin || '').trim().toUpperCase();
  const r = String(region || 'US').trim().toUpperCase() || 'US';
  return `ai-desc:${t}:${a}:${r}`;
}

export function getCachedAiDescription(templateId, asin, region = 'US') {
  if (!ENABLED) return null;
  const key = buildKey(templateId, asin, region);
  const value = cache.get(key);
  if (value) {
    console.log(`[AI Description Cache] HIT ${asin} template=${templateId || 'none'}`);
  }
  return value || null;
}

export function setCachedAiDescription(templateId, asin, region, text) {
  if (!ENABLED) return;
  const cleaned = String(text || '').trim();
  if (!cleaned) return;
  const key = buildKey(templateId, asin, region);
  cache.set(key, cleaned);
  console.log(`[AI Description Cache] SET ${asin} template=${templateId || 'none'} (${cleaned.length} chars)`);
}

export function getAiDescriptionCacheStats() {
  return {
    enabled: ENABLED,
    ttlSeconds: TTL,
    keys: cache.keys().length,
  };
}
