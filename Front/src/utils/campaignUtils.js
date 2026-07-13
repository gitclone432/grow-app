import {
  defaultEndLocal,
  defaultStartLocal,
  MARKETPLACES,
  MARKETPLACE_CURRENCY,
  toEbayUtcIso,
} from './itemPromotionUtils.js';

export { MARKETPLACES, toEbayUtcIso };

export function emptyCampaignForm(sellerId = '') {
  return {
    sellerId,
    marketplaceId: 'EBAY_US',
    campaignName: '',
    startDate: defaultStartLocal(),
    endDate: defaultEndLocal(),
    fundingModel: 'COST_PER_SALE',
    bidPercentage: '5.0',
    adRateStrategy: 'FIXED',
    campaignTargetingType: 'MANUAL',
    channel: 'ON_SITE',
    biddingStrategy: 'DYNAMIC',
    dailyBudget: '10.00',
    maxCpc: '0.50',
  };
}

export function getCampaignDateRangeError(startDate, endDate) {
  if (!startDate) return 'Start date is required.';
  if (!endDate) return '';
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  if (end <= start) return 'End date must be after start date.';
  return '';
}

function isValidBidPercentage(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 2 || num > 100) return false;
  const parts = String(value).trim().split('.');
  if (parts.length === 2 && parts[1].length > 1) return false;
  return true;
}

export function validateCampaignForm(form) {
  if (!form.sellerId) return 'Select a store for this campaign.';
  if (!String(form.campaignName || '').trim()) return 'Campaign name is required.';
  if (!form.startDate) return 'Start date is required.';
  const dateError = getCampaignDateRangeError(form.startDate, form.endDate);
  if (dateError) return dateError;
  if (!form.marketplaceId) return 'Marketplace is required.';
  if (!form.fundingModel) return 'Funding model is required.';

  if (form.fundingModel === 'COST_PER_SALE') {
    if (!isValidBidPercentage(form.bidPercentage)) {
      return 'Bid percentage must be between 2.0 and 100.0 with at most one decimal place (e.g. 5.0).';
    }
  }

  if (form.fundingModel === 'COST_PER_CLICK') {
    const budget = Number(form.dailyBudget);
    if (!Number.isFinite(budget) || budget <= 0) {
      return 'Daily budget is required for cost-per-click campaigns.';
    }

    if (form.campaignTargetingType === 'SMART') {
      const maxCpc = Number(form.maxCpc);
      if (!Number.isFinite(maxCpc) || maxCpc < 0.02 || maxCpc > 100) {
        return 'Max CPC must be between 0.02 and 100 for smart targeting campaigns.';
      }
    }
  }

  return '';
}

export function buildCampaignCreatePayload(form) {
  const currency = MARKETPLACE_CURRENCY[form.marketplaceId] || 'USD';
  const payload = {
    campaignName: String(form.campaignName).trim(),
    marketplaceId: form.marketplaceId,
    startDate: toEbayUtcIso(form.startDate),
    fundingStrategy: {
      fundingModel: form.fundingModel,
    },
  };

  if (form.endDate) {
    payload.endDate = toEbayUtcIso(form.endDate);
  }

  if (form.fundingModel === 'COST_PER_SALE') {
    payload.fundingStrategy.bidPercentage = String(form.bidPercentage).trim();
    if (form.adRateStrategy) {
      payload.fundingStrategy.adRateStrategy = form.adRateStrategy;
    }
    return payload;
  }

  payload.budget = {
    daily: {
      amount: {
        currency,
        value: String(form.dailyBudget).trim(),
      },
    },
  };

  if (form.channel === 'OFF_SITE') {
    payload.channels = ['OFF_SITE'];
    return payload;
  }

  payload.channels = ['ON_SITE'];

  if (form.campaignTargetingType === 'SMART') {
    payload.campaignTargetingType = 'SMART';
    payload.fundingStrategy.bidPreferences = [{
      maxCpc: {
        amount: {
          currency,
          value: String(form.maxCpc).trim(),
        },
      },
    }];
    return payload;
  }

  payload.campaignTargetingType = 'MANUAL';
  payload.fundingStrategy.biddingStrategy = form.biddingStrategy || 'DYNAMIC';
  return payload;
}

export function parseCampaignApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

export function canPauseCampaign(status) {
  return status === 'RUNNING';
}

export function canResumeCampaign(status) {
  return status === 'PAUSED';
}

export function canEndCampaign(status) {
  return status === 'RUNNING' || status === 'PAUSED';
}
