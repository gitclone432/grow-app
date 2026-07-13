import { useEffect, useState } from 'react';
import api from '../lib/api';

const TTL_MS = 5 * 60_000;
let cachedSellers = null;
let cacheExpiresAt = 0;
let inflight = null;

async function fetchEbayConnectedSellers() {
  const { data } = await api.get('/sellers/ebay-connected');
  const list = Array.isArray(data) ? data : [];
  cachedSellers = list;
  cacheExpiresAt = Date.now() + TTL_MS;
  return list;
}

export function useEbayConnectedSellers({ enabled = true } = {}) {
  const [sellers, setSellers] = useState(() => (
    enabled && cachedSellers && Date.now() < cacheExpiresAt ? cachedSellers : []
  ));
  const [loading, setLoading] = useState(() => (
    enabled && !(cachedSellers && Date.now() < cacheExpiresAt)
  ));

  useEffect(() => {
    if (!enabled) return undefined;

    if (cachedSellers && Date.now() < cacheExpiresAt) {
      setSellers(cachedSellers);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    if (!inflight) {
      inflight = fetchEbayConnectedSellers().finally(() => {
        inflight = null;
      });
    }

    inflight
      .then((list) => {
        if (!cancelled) {
          setSellers(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSellers([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { sellers, loading };
}
