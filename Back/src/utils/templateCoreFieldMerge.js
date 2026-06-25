import { mergeDefaultCoreFieldDefaults } from '../constants/defaultDescriptionTemplate.js';
import EbayStoreListerSettings from '../models/EbayStoreListerSettings.js';
import DescriptionTemplateGallery from '../models/DescriptionTemplateGallery.js';
import { joinItemPhotoUrls } from './itemPhotoUrls.js';

function parseAmazonPriceToNumber(priceValue) {
  const numeric = parseFloat(String(priceValue || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function coreFieldHasDescriptionDefault(coreFieldDefaults = {}) {
  return String(coreFieldDefaults?.description || '').trim().length > 0;
}

export function mergeTemplateCoreFields(
  coreFieldDefaults = {},
  autoCoreFields = {},
  amazonData = {},
  options = {}
) {
  const reuseMode = Boolean(options.reuseMode);
  const defaultDescription = String(coreFieldDefaults?.description || '').trim();
  const merged = {
    ...(coreFieldDefaults || {}),
    ...(autoCoreFields || {}),
  };

  if (!reuseMode) {
    if (!String(merged.title || '').trim() && String(amazonData?.title || '').trim()) {
      merged.title = String(amazonData.title).trim().slice(0, 80);
    }

    if (!String(merged.itemPhotoUrl || '').trim() && Array.isArray(amazonData?.images) && amazonData.images.length) {
      merged.itemPhotoUrl = joinItemPhotoUrls(amazonData.images);
    }

    if (merged.startPrice === undefined || merged.startPrice === null || merged.startPrice === '') {
      const parsedAmazonPrice = parseAmazonPriceToNumber(amazonData?.price);
      merged.startPrice = parsedAmazonPrice ? parsedAmazonPrice.toFixed(2) : '0.01';
    }
  }

  if (defaultDescription) {
    merged.description = coreFieldDefaults.description;
  } else if (!reuseMode && !String(merged.description || '').trim()) {
    const fromAmazon = String(amazonData?.description || '').trim();
    if (fromAmazon) merged.description = fromAmazon;
  }

  return merged;
}

function toPlainCoreFieldDefaults(coreFieldDefaults = {}) {
  if (!coreFieldDefaults || typeof coreFieldDefaults !== 'object') return {};
  if (typeof coreFieldDefaults.toObject === 'function') return coreFieldDefaults.toObject();
  return { ...coreFieldDefaults };
}

export async function resolveStoreDescriptionHtml(sellerId, region = 'US') {
  if (!sellerId) return '';

  const settings = await EbayStoreListerSettings.findOne({
    sellerId,
    supplier: 'amazon',
    region,
  }).select('general.descriptionTemplateId').lean();

  let templateId = String(settings?.general?.descriptionTemplateId || '').trim();

  const gallery = await DescriptionTemplateGallery.findOne({ key: 'singleton' }).lean();
  if (!templateId) {
    const map = gallery?.storeTemplateMap && typeof gallery.storeTemplateMap === 'object'
      ? gallery.storeTemplateMap
      : {};
    templateId = String(map[String(sellerId)] || '').trim();
  }

  if (!templateId) return '';

  const templates = Array.isArray(gallery?.templates) ? gallery.templates : [];
  const match = templates.find((t) => String(t?.id) === templateId);
  return String(match?.html || '').trim();
}

export function resolveTemplateCoreFieldDefaults(template) {
  return mergeDefaultCoreFieldDefaults(toPlainCoreFieldDefaults(template?.coreFieldDefaults));
}

export async function resolveEffectiveCoreFieldDefaults(template, sellerId, region = 'US') {
  const base = mergeDefaultCoreFieldDefaults(toPlainCoreFieldDefaults(template?.coreFieldDefaults));

  if (!sellerId) return base;

  const storeHtml = await resolveStoreDescriptionHtml(sellerId, region);
  if (storeHtml) {
    return { ...base, description: storeHtml };
  }
  return base;
}
