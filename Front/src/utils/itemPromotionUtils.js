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

export const NO_REDEMPTION_LIMIT_VALUE = 'NO_LIMIT';

export const MAX_REDEMPTION_PER_BUYER_OPTIONS = [
  { value: NO_REDEMPTION_LIMIT_VALUE, label: 'No Limit' },
  ...Array.from({ length: 10 }, (_, index) => {
    const value = String(index + 1);
    return { value, label: value };
  }),
];

export function normalizeMaxCouponRedemptionPerUser(value) {
  if (value == null || value === '' || value === NO_REDEMPTION_LIMIT_VALUE) {
    return NO_REDEMPTION_LIMIT_VALUE;
  }
  return String(value);
}

export function isLimitedMaxCouponRedemptionPerUser(value) {
  return normalizeMaxCouponRedemptionPerUser(value) !== NO_REDEMPTION_LIMIT_VALUE;
}

export function isPromotionImageRequired(promotionType, couponType) {
  if (promotionType === 'MARKDOWN_SALE') return true;
  if (promotionType === 'ORDER_DISCOUNT') return true;
  if (promotionType === 'CODED_COUPON') {
    return couponType === 'PUBLIC_SINGLE_SELLER_COUPON';
  }
  return false;
}

export const PROMOTION_IMAGE_HELPER =
  'Required for public coupons and order discounts. JPEG or PNG, minimum 500×500px.';

export const DEFAULT_PROMOTION_IMAGE_URL = String(
  import.meta.env.VITE_DEFAULT_PROMOTION_IMAGE_URL
    || 'https://your-cdn.com/promos/coupon-banner.png',
).trim();

export function extractPromotionImageUrl(promotion) {
  if (!promotion) return '';
  return String(
    promotion.promotionImageUrl
    || promotion.raw?.promotionImageUrl
    || '',
  ).trim();
}

export function resolveSuggestedPromotionImageUrl(promotions = []) {
  const fromHistory = (Array.isArray(promotions) ? promotions : [])
    .map((row) => extractPromotionImageUrl(row))
    .find(Boolean);
  return fromHistory || DEFAULT_PROMOTION_IMAGE_URL;
}

export function shouldShowPromotionImageField(promotionType, couponType) {
  return isPromotionImageRequired(promotionType, couponType);
}

const PROMOTION_NAME_MAX_LENGTH = 50;

function formatPromotionEndDateLabel(localDatetime) {
  if (!localDatetime) return '';
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPromotionPercentLabel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value || '0').trim();
  return Number.isInteger(num) ? String(num) : String(num);
}

function truncatePromotionName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length <= PROMOTION_NAME_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, PROMOTION_NAME_MAX_LENGTH - 3)}...`;
}

export function buildSuggestedPromotionName(form) {
  const endLabel = formatPromotionEndDateLabel(form.endDate);
  if (!endLabel) return '';

  if (form.promotionType === 'MARKDOWN_SALE') {
    return truncatePromotionName(`Sale event ending ${endLabel}`);
  }

  if (form.promotionType === 'VOLUME_DISCOUNT') {
    const maxPct = (form.volumeTiers || []).reduce((max, tier) => {
      const n = Number(tier.percentageOffOrder);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    if (maxPct > 0) {
      return truncatePromotionName(`Extra ${formatPromotionPercentLabel(maxPct)}% off ending ${endLabel}`);
    }
    return truncatePromotionName(`Volume discount ending ${endLabel}`);
  }

  if (form.benefitType === 'amountOffOrder') {
    const amount = String(form.amountOffOrder || '0').trim();
    const currency = MARKETPLACE_CURRENCY[form.marketplaceId] || 'USD';
    const amountLabel = currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
    return truncatePromotionName(`Extra ${amountLabel} off ending ${endLabel}`);
  }

  const pctLabel = formatPromotionPercentLabel(form.percentageOffOrder);
  return truncatePromotionName(`Extra ${pctLabel}% off ending ${endLabel}`);
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

  const imageUrl = form.promotionImageUrl.trim();
  const isPrivateCoupon = form.promotionType === 'CODED_COUPON'
    && form.couponType === 'PRIVATE_SINGLE_SELLER_COUPON';

  if (!isPrivateCoupon && isPromotionImageRequired(form.promotionType, form.couponType)) {
    if (!imageUrl) {
      throw new Error('Promotion image URL is required for public coupons and order discounts.');
    }
    payload.promotionImageUrl = imageUrl;
  } else if (!isPrivateCoupon && imageUrl) {
    payload.promotionImageUrl = imageUrl;
  }

  if (form.promotionType === 'CODED_COUPON') {
    payload.couponConfiguration = {
      couponCode: form.couponCode.trim(),
      couponType: form.couponType,
    };
    if (isLimitedMaxCouponRedemptionPerUser(form.maxCouponRedemptionPerUser)) {
      payload.couponConfiguration.maxCouponRedemptionPerUser = Number(form.maxCouponRedemptionPerUser);
    }
    if (form.budget) {
      payload.budget = { currency, value: String(form.budget) };
    }
  }

  return payload;
}

export function buildItemPriceMarkdownPayload(form) {
  const currency = MARKETPLACE_CURRENCY[form.marketplaceId] || 'USD';
  const imageUrl = form.promotionImageUrl.trim();
  if (!imageUrl) {
    throw new Error('Promotion image URL is required for markdown sales.');
  }

  const inventoryCriterion = form.inventoryType === 'INVENTORY_BY_VALUE'
    ? {
      inventoryCriterionType: 'INVENTORY_BY_VALUE',
      listingIds: parseListingIds(form.listingIds),
    }
    : { inventoryCriterionType: 'INVENTORY_ANY' };

  const discountBenefit = form.benefitType === 'amountOffItem'
    ? { amountOffItem: { currency, value: String(form.amountOffItem || '0') } }
    : { percentageOffItem: String(form.percentageOffItem || '0') };

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    marketplaceId: form.marketplaceId,
    promotionStatus: form.promotionStatus,
    startDate: toEbayUtcIso(form.startDate),
    endDate: toEbayUtcIso(form.endDate),
    promotionImageUrl: imageUrl,
    applyFreeShipping: Boolean(form.applyFreeShipping),
    autoSelectFutureInventory: form.autoSelectFutureInventory !== false,
    blockPriceIncreaseInItemRevision: form.blockPriceIncreaseInItemRevision !== false,
    selectedInventoryDiscounts: [{
      inventoryCriterion,
      discountBenefit,
    }],
  };
}

export function buildPromotionCreatePayload(form) {
  if (form.promotionType === 'MARKDOWN_SALE') {
    return buildItemPriceMarkdownPayload(form);
  }
  return buildItemPromotionPayload(form);
}

export function isMarkdownPromotionType(promotionType) {
  return String(promotionType || '').trim().toUpperCase() === 'MARKDOWN_SALE';
}

export function markdownApiToForm(promotion, sellerId = '') {
  const discount = promotion?.selectedInventoryDiscounts?.[0] || {};
  const inv = discount.inventoryCriterion || {};
  const benefit = discount.discountBenefit || {};
  let benefitType = 'percentageOffItem';
  if (benefit.amountOffItem?.value != null) benefitType = 'amountOffItem';

  return {
    sellerId,
    marketplaceId: promotion?.marketplaceId || 'EBAY_US',
    promotionType: 'MARKDOWN_SALE',
    promotionStatus: promotion?.promotionStatus || 'SCHEDULED',
    name: promotion?.name || '',
    description: promotion?.description || '',
    startDate: isoToLocalDatetimeInput(promotion?.startDate) || defaultStartLocal(),
    endDate: isoToLocalDatetimeInput(promotion?.endDate) || defaultEndLocal(),
    inventoryType: inv.inventoryCriterionType || 'INVENTORY_ANY',
    listingIds: (inv.listingIds || []).join(', '),
    benefitType,
    percentageOffItem: String(benefit.percentageOffItem ?? '0'),
    amountOffItem: String(benefit.amountOffItem?.value ?? '0'),
    promotionImageUrl: promotion?.promotionImageUrl || '',
    applyFreeShipping: Boolean(promotion?.applyFreeShipping),
    autoSelectFutureInventory: promotion?.autoSelectFutureInventory !== false,
    blockPriceIncreaseInItemRevision: promotion?.blockPriceIncreaseInItemRevision !== false,
  };
}

export function promotionApiToForm(promotion, sellerId = '') {
  if (isMarkdownPromotionType(promotion?.promotionType) || promotion?.selectedInventoryDiscounts) {
    return markdownApiToForm(promotion, sellerId);
  }
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
    maxCouponRedemptionPerUser: normalizeMaxCouponRedemptionPerUser(coupon.maxCouponRedemptionPerUser),
    promotionImageUrl: promotion?.promotionImageUrl || '',
    applyDiscountToSingleItemOnly: Boolean(promotion?.applyDiscountToSingleItemOnly),
    volumeTiers: volumeTiers.length > 0 ? volumeTiers : [
      { minQuantity: '1', percentageOffOrder: '0' },
      { minQuantity: '2', percentageOffOrder: '5' },
      { minQuantity: '3', percentageOffOrder: '10' },
    ],
  };
}

export function getPromotionStatusOptionsForUpdate(currentStatus) {
  const status = String(currentStatus || '').toUpperCase();
  if (status === 'RUNNING') {
    return [
      { value: 'RUNNING', label: 'Running' },
      { value: 'PAUSED', label: 'Paused' },
      { value: 'ENDED', label: 'Ended' },
    ];
  }
  if (status === 'PAUSED') {
    return [
      { value: 'PAUSED', label: 'Paused' },
      { value: 'RUNNING', label: 'Running' },
      { value: 'ENDED', label: 'Ended' },
    ];
  }
  return [
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'RUNNING', label: 'Running' },
    { value: 'PAUSED', label: 'Paused' },
    { value: 'ENDED', label: 'Ended' },
  ];
}

export function getPromotionLifecycleActions(originalStatus, desiredStatus) {
  const from = String(originalStatus || '').toUpperCase();
  const to = String(desiredStatus || '').toUpperCase();
  return {
    pause: from === 'RUNNING' && to === 'PAUSED',
    resume: from === 'PAUSED' && to === 'RUNNING',
    end: to === 'ENDED' && (from === 'RUNNING' || from === 'PAUSED'),
  };
}

export function resolveLimitedPromotionEndDate(form, desiredStatus) {
  if (String(desiredStatus || '').toUpperCase() !== 'ENDED') {
    return form.endDate;
  }
  const now = new Date();
  const userEnd = new Date(form.endDate);
  if (!Number.isFinite(userEnd.getTime()) || userEnd > now) {
    return toLocalDatetimeInput(now);
  }
  return form.endDate;
}

export function mergeMarkdownForUpdate(rawPromotion, form) {
  const originalStatus = rawPromotion?.promotionStatus;
  if (isLimitedPromotionEdit(originalStatus)) {
    const inventoryCriterion = form.inventoryType === 'INVENTORY_BY_VALUE'
      ? {
        inventoryCriterionType: 'INVENTORY_BY_VALUE',
        listingIds: parseListingIds(form.listingIds),
      }
      : { inventoryCriterionType: 'INVENTORY_ANY' };

    const endDateLocal = resolveLimitedPromotionEndDate(form, form.promotionStatus);
    const existingDiscount = rawPromotion?.selectedInventoryDiscounts?.[0] || {};

    return {
      ...rawPromotion,
      endDate: toEbayUtcIso(endDateLocal),
      promotionStatus: 'SCHEDULED',
      selectedInventoryDiscounts: [{
        ...existingDiscount,
        inventoryCriterion,
      }],
    };
  }

  const built = buildItemPriceMarkdownPayload(form);
  return {
    ...rawPromotion,
    ...built,
  };
}

export function mergePromotionForUpdate(rawPromotion, form) {
  if (isMarkdownPromotionType(form?.promotionType) || isMarkdownPromotionType(rawPromotion?.promotionType)) {
    return mergeMarkdownForUpdate(rawPromotion, form);
  }
  const originalStatus = rawPromotion?.promotionStatus;
  if (isLimitedPromotionEdit(originalStatus)) {
    const inventoryCriterion = form.inventoryType === 'INVENTORY_BY_VALUE'
      ? {
        inventoryCriterionType: 'INVENTORY_BY_VALUE',
        listingIds: parseListingIds(form.listingIds),
      }
      : { inventoryCriterionType: 'INVENTORY_ANY' };

    const endDateLocal = resolveLimitedPromotionEndDate(form, form.promotionStatus);

    return {
      ...rawPromotion,
      endDate: toEbayUtcIso(endDateLocal),
      inventoryCriterion,
      promotionStatus: 'SCHEDULED',
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
