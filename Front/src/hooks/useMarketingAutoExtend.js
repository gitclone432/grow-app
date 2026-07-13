import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { isEndingWithinDays, parseApiError } from '../lib/marketingUtils.js';
import {
  buildCampaignAutoExtendKey,
  buildExtendedCampaignIdentification,
  buildExtendedPromotionPayload,
  buildPromotionAutoExtendKey,
  canAutoExtendCampaign,
  canAutoExtendPromotion,
  loadAutoExtendToggles,
  saveAutoExtendToggle,
} from '../lib/marketingAutoExtend.js';

export function useMarketingAutoExtend({ kind, rows, active, pageSellerId = '', onExtended }) {
  const [toggles, setToggles] = useState(() => loadAutoExtendToggles());
  const [extendingKeys, setExtendingKeys] = useState(() => new Set());
  const inFlightRef = useRef(new Set());
  const failedRef = useRef(new Set());

  const buildKey = useCallback((row, pageSellerId) => {
    const sellerId = row.sellerId || pageSellerId;
    if (kind === 'campaign') return buildCampaignAutoExtendKey(sellerId, row.campaignId);
    return buildPromotionAutoExtendKey(sellerId, row.promotionId);
  }, [kind]);

  const isEnabled = useCallback((key) => Boolean(toggles[key]), [toggles]);

  const setEnabled = useCallback((key, enabled) => {
    if (!enabled) failedRef.current.delete(key);
    const next = saveAutoExtendToggle(key, enabled);
    setToggles({ ...next });
  }, []);

  const markExtending = useCallback((key, extending) => {
    setExtendingKeys((prev) => {
      const next = new Set(prev);
      if (extending) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const extendPromotion = useCallback(async (row, sellerId) => {
    const { data } = await api.get('/ebay/marketing/promotions/item', {
      params: {
        sellerId,
        promotionId: row.promotionId,
        marketplaceId: row.marketplaceId,
        promotionType: row.promotionType,
      },
    });
    const promotion = data?.promotion;
    if (!promotion) throw new Error('Promotion details not found');

    const { merged } = buildExtendedPromotionPayload(promotion, sellerId);
    await api.put('/ebay/marketing/promotions/update', {
      sellerId,
      promotionId: row.promotionId,
      marketplaceId: row.marketplaceId,
      promotionType: row.promotionType || promotion.promotionType,
      promotion: merged,
    });
  }, []);

  const extendCampaign = useCallback(async (row, sellerId) => {
    const { data } = await api.get('/ebay/marketing/campaigns/item', {
      params: {
        sellerId,
        campaignId: row.campaignId,
        marketplaceId: row.marketplaceId,
      },
    });
    const campaign = data?.campaign;
    if (!campaign) throw new Error('Campaign details not found');

    const identification = buildExtendedCampaignIdentification(campaign);
    await api.post('/ebay/marketing/campaigns/update-identification', {
      sellerId,
      campaignId: row.campaignId,
      marketplaceId: row.marketplaceId,
      ...identification,
    });
  }, []);

  const tryAutoExtendRow = useCallback(async (row, pageSellerId) => {
    const sellerId = row.sellerId || pageSellerId;
    const entityId = kind === 'campaign' ? row.campaignId : row.promotionId;
    if (!sellerId || !entityId || !row.marketplaceId) return;

    const key = buildKey(row, pageSellerId);
    if (!toggles[key]) return;
    if (!isEndingWithinDays(row.endDate)) return;
    if (inFlightRef.current.has(key) || failedRef.current.has(key)) return;

    const eligible = kind === 'campaign' ? canAutoExtendCampaign(row) : canAutoExtendPromotion(row);
    if (!eligible) return;

    inFlightRef.current.add(key);
    markExtending(key, true);
    try {
      if (kind === 'campaign') await extendCampaign(row, sellerId);
      else await extendPromotion(row, sellerId);
      failedRef.current.delete(key);
      onExtended?.();
    } catch (err) {
      failedRef.current.add(key);
      console.error('[Auto-extend]', parseApiError(err, 'Failed to auto-extend'));
    } finally {
      inFlightRef.current.delete(key);
      markExtending(key, false);
    }
  }, [
    buildKey,
    extendCampaign,
    extendPromotion,
    kind,
    markExtending,
    onExtended,
    toggles,
  ]);

  useEffect(() => {
    if (!active || !Array.isArray(rows) || rows.length === 0) return;
    for (const row of rows) {
      void tryAutoExtendRow(row, pageSellerId);
    }
  }, [active, rows, toggles, tryAutoExtendRow, pageSellerId]);

  const isExtending = useCallback((key) => extendingKeys.has(key), [extendingKeys]);

  return {
    isEnabled,
    setEnabled,
    buildKey,
    isExtending,
    tryAutoExtendRow,
  };
}
