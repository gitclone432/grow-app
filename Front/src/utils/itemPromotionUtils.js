export const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];

export const MARKETPLACE_CURRENCY = {
  EBAY_US: 'USD',
  EBAY_GB: 'GBP',
  EBAY_AU: 'AUD',
  EBAY_CA: 'CAD',
  EBAY_DE: 'EUR',
};

export function toLocalDatetimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isoToLocalDatetimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return toLocalDatetimeInput(d);
}

export function defaultStartLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalDatetimeInput(d);
}

export function defaultEndLocal() {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalDatetimeInput(d);
}

export function toEbayUtcIso(localDatetime) {
  if (!localDatetime) return '';
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

export function parseListingIds(raw) {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function buildItemPromotionPayload(form) {
  const currency = MARKETPLACE_CURRENCY[form.marketplaceId] || 'USD';
  const inventoryCriterion = form.inventoryType === 'INVENTORY_BY_VALUE'
    ? {
      inventoryCriterionType: 'INVENTORY_BY_VALUE',
      listingIds: parseListingIds(form.listingIds),
    }
    : { inventoryCriterionType: 'INVENTORY_ANY' };

  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    marketplaceId: form.marketplaceId,
    promotionType: form.promotionType,
    promotionStatus: form.promotionStatus,
    startDate: toEbayUtcIso(form.startDate),
    endDate: toEbayUtcIso(form.endDate),
    inventoryCriterion,
  };

  if (form.promotionType === 'VOLUME_DISCOUNT') {
    payload.applyDiscountToSingleItemOnly = Boolean(form.applyDiscountToSingleItemOnly);
    payload.discountRules = form.volumeTiers
      .filter((tier) => String(tier.minQuantity || '').trim())
      .map((tier, index) => ({
        discountSpecification: { minQuantity: Number(tier.minQuantity) },
        discountBenefit: { percentageOffOrder: String(tier.percentageOffOrder || '0') },
        ruleOrder: index + 1,
      }));
    return payload;
  }

  const discountSpecification = form.thresholdType === 'minQuantity'
    ? { minQuantity: Number(form.minQuantity) || 1 }
    : {
      minAmount: {
        currency,
        value: String(form.minAmount || '0'),
      },
    };

  const discountBenefit = form.benefitType === 'percentageOffOrder'
    ? { percentageOffOrder: String(form.percentageOffOrder || '0') }
    : {
      amountOffOrder: {
        currency,
        value: String(form.amountOffOrder || '0'),
      },
    };

  const rule = {
    discountSpecification,
    discountBenefit,
    ruleOrder: 1,
  };

  if (form.promotionType === 'CODED_COUPON' && form.maxDiscountAmount) {
    rule.maxDiscountAmount = { currency, value: String(form.maxDiscountAmount) };
  }

  payload.discountRules = [rule];
  payload.promotionImageUrl = form.promotionImageUrl.trim();

  if (form.promotionType === 'CODED_COUPON') {
    payload.couponConfiguration = {
      couponCode: form.couponCode.trim(),
      couponType: form.couponType,
    };
    if (form.maxCouponRedemptionPerUser) {
      payload.couponConfiguration.maxCouponRedemptionPerUser = Number(form.maxCouponRedemptionPerUser);
    }
    if (form.budget) {
      payload.budget = { currency, value: String(form.budget) };
    }
  }

  return payload;
}

export function promotionApiToForm(promotion, sellerId = '') {
  const inv = promotion?.inventoryCriterion || {};
  const rule = promotion?.discountRules?.[0] || {};
  const spec = rule.discountSpecification || {};
  const benefit = rule.discountBenefit || {};
  const coupon = promotion?.couponConfiguration || {};

  let thresholdType = 'minQuantity';
  if (spec.minAmount?.value != null) thresholdType = 'minAmount';

  let benefitType = 'percentageOffOrder';
  if (benefit.amountOffOrder?.value != null) benefitType = 'amountOffOrder';
  else if (benefit.percentageOffItem != null) benefitType = 'percentageOffOrder';

  const volumeTiers = (promotion?.discountRules || []).map((tier) => ({
    minQuantity: String(tier.discountSpecification?.minQuantity ?? ''),
    percentageOffOrder: String(
      tier.discountBenefit?.percentageOffOrder
      ?? tier.discountBenefit?.percentageOffItem
      ?? '0',
    ),
  }));

  return {
    sellerId,
    marketplaceId: promotion?.marketplaceId || 'EBAY_US',
    promotionType: promotion?.promotionType || 'CODED_COUPON',
    promotionStatus: promotion?.promotionStatus || 'SCHEDULED',
    name: promotion?.name || '',
    description: promotion?.description || '',
    startDate: isoToLocalDatetimeInput(promotion?.startDate) || defaultStartLocal(),
    endDate: isoToLocalDatetimeInput(promotion?.endDate) || defaultEndLocal(),
    inventoryType: inv.inventoryCriterionType || 'INVENTORY_ANY',
    listingIds: (inv.listingIds || []).join(', '),
    thresholdType,
    minQuantity: String(spec.minQuantity ?? '1'),
    minAmount: String(spec.minAmount?.value ?? '0'),
    benefitType,
    percentageOffOrder: String(benefit.percentageOffOrder ?? benefit.percentageOffItem ?? '0'),
    amountOffOrder: String(benefit.amountOffOrder?.value ?? '0'),
    couponCode: coupon.couponCode || '',
    couponType: coupon.couponType || 'PUBLIC_SINGLE_SELLER_COUPON',
    budget: String(promotion?.budget?.value ?? ''),
    maxDiscountAmount: String(rule.maxDiscountAmount?.value ?? ''),
    maxCouponRedemptionPerUser: coupon.maxCouponRedemptionPerUser != null
      ? String(coupon.maxCouponRedemptionPerUser)
      : '',
    promotionImageUrl: promotion?.promotionImageUrl || '',
    applyDiscountToSingleItemOnly: Boolean(promotion?.applyDiscountToSingleItemOnly),
    volumeTiers: volumeTiers.length > 0 ? volumeTiers : [
      { minQuantity: '1', percentageOffOrder: '0' },
      { minQuantity: '2', percentageOffOrder: '5' },
      { minQuantity: '3', percentageOffOrder: '10' },
    ],
  };
}

export function mergePromotionForUpdate(rawPromotion, form) {
  if (isLimitedPromotionEdit(form.promotionStatus)) {
    const inventoryCriterion = form.inventoryType === 'INVENTORY_BY_VALUE'
      ? {
        inventoryCriterionType: 'INVENTORY_BY_VALUE',
        listingIds: parseListingIds(form.listingIds),
      }
      : { inventoryCriterionType: 'INVENTORY_ANY' };

    return {
      ...rawPromotion,
      endDate: toEbayUtcIso(form.endDate),
      inventoryCriterion,
    };
  }

  const built = buildItemPromotionPayload(form);
  return {
    ...rawPromotion,
    ...built,
    inventoryCriterion: built.inventoryCriterion,
    discountRules: built.discountRules,
    couponConfiguration: built.couponConfiguration ?? rawPromotion?.couponConfiguration,
    budget: built.budget ?? rawPromotion?.budget,
  };
}

export function canDeletePromotion(status) {
  return status && status !== 'RUNNING';
}

export function canEditPromotion(status) {
  return status && status !== 'ENDED';
}

export function isLimitedPromotionEdit(status) {
  return status === 'RUNNING' || status === 'PAUSED';
}

export function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}
