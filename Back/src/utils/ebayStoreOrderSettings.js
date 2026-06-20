import EbayStoreListerSettings, { DEFAULT_ORDER_SETTINGS } from '../models/EbayStoreListerSettings.js';
import { mergeAutomaticMessages } from './ebayStoreAutomaticMessages.js';

export function marketplaceIdToRegion(marketplaceId = '') {
  const mp = String(marketplaceId || '').toUpperCase();
  if (mp.includes('GB') || mp.includes('UK')) return 'UK';
  if (mp.includes('AU')) return 'AU';
  return 'US';
}

export function mergeOrderSettings(input = {}) {
  return {
    ...DEFAULT_ORDER_SETTINGS,
    ...(input || {}),
    defaultAmazonAccount: String(input?.defaultAmazonAccount ?? '').trim(),
    fulfillmentNotesPrefix: String(input?.fulfillmentNotesPrefix ?? '').trim(),
    autoAssignAmazonAccount: input?.autoAssignAmazonAccount !== false,
    policyMessagesEnabled: input?.policyMessagesEnabled !== false,
    automaticMessages: mergeAutomaticMessages(input?.automaticMessages),
  };
}

export async function getEbayStoreOrderSettings(sellerId, region = 'US') {
  if (!sellerId) return { ...DEFAULT_ORDER_SETTINGS };

  const doc = await EbayStoreListerSettings.findOne({
    sellerId,
    supplier: 'amazon',
    region,
  }).lean();

  return mergeOrderSettings(doc?.orders);
}

export async function enrichNewOrderData(orderData = {}, sellerId) {
  if (!sellerId || !orderData) return orderData;

  const region = marketplaceIdToRegion(orderData.purchaseMarketplaceId);
  const settings = await getEbayStoreOrderSettings(sellerId, region);

  if (settings.autoAssignAmazonAccount && settings.defaultAmazonAccount) {
    orderData.amazonAccount = settings.defaultAmazonAccount;
    orderData.amazonAccountAssignmentSource = 'store_settings';
  }

  if (!settings.policyMessagesEnabled) {
    orderData.policyMessageDisabled = true;
    delete orderData.policyMessageEligibleAt;
  }

  const prefix = String(settings.fulfillmentNotesPrefix || '').trim();
  if (prefix && !String(orderData.fulfillmentNotes || '').trim()) {
    orderData.fulfillmentNotes = prefix;
  }

  return orderData;
}
