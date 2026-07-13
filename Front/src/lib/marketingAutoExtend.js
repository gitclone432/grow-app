import {
  canEditPromotion,
  isoToLocalDatetimeInput,
  mergePromotionForUpdate,
  promotionApiToForm,
  toEbayUtcIso,
} from '../utils/itemPromotionUtils.js';

export const AUTO_EXTEND_STORAGE_KEY = 'marketingAutoExtend.toggles';

export function buildPromotionAutoExtendKey(sellerId, promotionId) {
  return `promotion:${sellerId}:${promotionId}`;
}

export function buildCampaignAutoExtendKey(sellerId, campaignId) {
  return `campaign:${sellerId}:${campaignId}`;
}

export function loadAutoExtendToggles() {
  try {
    const raw = localStorage.getItem(AUTO_EXTEND_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAutoExtendToggle(key, enabled) {
  const toggles = loadAutoExtendToggles();
  if (enabled) toggles[key] = true;
  else delete toggles[key];
  localStorage.setItem(AUTO_EXTEND_STORAGE_KEY, JSON.stringify(toggles));
  return toggles;
}

export function addOneMonthToIso(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return toEbayUtcIso(isoToLocalDatetimeInput(next.toISOString()));
}

export function buildExtendedPromotionPayload(rawPromotion, sellerId) {
  const newEndIso = addOneMonthToIso(rawPromotion?.endDate);
  if (!newEndIso) throw new Error('Invalid promotion end date');

  const form = promotionApiToForm(rawPromotion, sellerId);
  form.endDate = isoToLocalDatetimeInput(newEndIso);
  form.promotionStatus = rawPromotion?.promotionStatus || form.promotionStatus;

  const merged = mergePromotionForUpdate(rawPromotion, form);
  return { merged, newEndIso };
}

export function buildExtendedCampaignIdentification(campaign) {
  const newEndIso = addOneMonthToIso(campaign?.endDate);
  if (!newEndIso) throw new Error('Invalid campaign end date');
  if (!campaign?.campaignName || !campaign?.startDate) {
    throw new Error('Campaign name and start date are required to extend.');
  }

  return {
    campaignName: campaign.campaignName,
    startDate: campaign.startDate,
    endDate: newEndIso,
  };
}

export function canAutoExtendPromotion(row) {
  if (!row?.endDate) return false;
  if (String(row?.promotionStatus || '').toUpperCase() !== 'RUNNING') return false;
  return canEditPromotion(row.promotionStatus);
}

export function canAutoExtendCampaign(row) {
  if (!row?.endDate) return false;
  return String(row?.campaignStatus || '').toUpperCase() === 'RUNNING';
}
