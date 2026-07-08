import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import {
  ALL_MARKETPLACES_VALUE,
  ALL_STORES_PER_SELLER_LIMIT,
  ALL_STORES_VALUE,
  KPI_FETCH_LIMIT,
} from '../lib/marketingConstants.js';
import {
  buildEndingSoonCacheKey,
  buildEndingSoonItems,
  getEndingSoonCache,
  setEndingSoonCache,
} from '../lib/marketingUtils.js';

export function useMarketingEndingSoon({ sellerId, marketplace, enabled = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadEndingSoon = useCallback(async ({ refresh = false } = {}) => {
    if (!enabled || !sellerId) {
      setItems([]);
      return;
    }

    const cacheKey = buildEndingSoonCacheKey(sellerId, marketplace);
    if (!refresh) {
      const cached = getEndingSoonCache(cacheKey);
      if (cached) {
        setItems(cached);
        return;
      }
    }

    const isAllStores = sellerId === ALL_STORES_VALUE;
    const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;
    const baseParams = {
      marketplace: isAllMarketplaces ? ALL_MARKETPLACES_VALUE : marketplace,
    };

    setLoading(true);
    try {
      let promotions = [];
      let campaigns = [];

      if (isAllStores) {
        const [promoRes, campaignRes] = await Promise.all([
          api.get('/ebay/marketing/promotions/all', {
            params: {
              ...baseParams,
              promotion_status: 'RUNNING',
              perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
            },
          }),
          api.get('/ebay/marketing/campaigns/all', {
            params: {
              ...baseParams,
              campaign_status: 'RUNNING',
              perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
            },
          }),
        ]);
        promotions = Array.isArray(promoRes.data?.promotions) ? promoRes.data.promotions : [];
        campaigns = Array.isArray(campaignRes.data?.campaigns) ? campaignRes.data.campaigns : [];
      } else {
        const [promoRes, campaignRes] = await Promise.all([
          api.get('/ebay/marketing/promotions', {
            params: {
              ...baseParams,
              promotion_status: 'RUNNING',
              sellerId,
              limit: KPI_FETCH_LIMIT,
              offset: 0,
            },
          }),
          api.get('/ebay/marketing/campaigns', {
            params: {
              ...baseParams,
              campaign_status: 'RUNNING',
              sellerId,
              limit: KPI_FETCH_LIMIT,
              offset: 0,
            },
          }),
        ]);
        promotions = Array.isArray(promoRes.data?.promotions) ? promoRes.data.promotions : [];
        campaigns = Array.isArray(campaignRes.data?.campaigns) ? campaignRes.data.campaigns : [];
      }

      const endingSoon = buildEndingSoonItems({ promotions, campaigns });
      setItems(endingSoon);
      setEndingSoonCache(cacheKey, endingSoon);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, sellerId, marketplace]);

  useEffect(() => {
    void loadEndingSoon();
  }, [loadEndingSoon]);

  return {
    items,
    loading,
    count: items.length,
    refresh: () => loadEndingSoon({ refresh: true }),
  };
}
