import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { splitItemPhotoUrls } from '../utils/itemPhotoUrls.js';
import {
  normalizeStoreLocationForEbay,
  validateTradingLocationFields,
} from '../utils/ebayTradingLocation.js';

export function escapeXml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function parseConditionId(value) {
  const text = String(value || '1000-New').trim();
  const match = /^(\d+)/.exec(text);
  return match ? match[1] : '1000';
}

function buildPictureDetailsXml(itemPhotoUrl) {
  const urls = splitItemPhotoUrls(itemPhotoUrl);
  if (urls.length === 0) return '';
  const pictureNodes = urls.map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join('');
  return `<PictureDetails>${pictureNodes}</PictureDetails>`;
}

function buildItemSpecificsXml(customFields = {}) {
  const entries = typeof customFields?.entries === 'function'
    ? [...customFields.entries()]
    : Object.entries(customFields || {});

  const blocks = entries
    .map(([rawName, rawValue]) => {
      const name = String(rawName || '').replace(/^C:/i, '').trim();
      const value = String(rawValue ?? '').trim();
      if (!name || !value) return '';
      return `<NameValueList><Name>${escapeXml(name)}</Name><Value>${escapeXml(value)}</Value></NameValueList>`;
    })
    .filter(Boolean);

  if (blocks.length === 0) return '';
  return `<ItemSpecifics>${blocks.join('')}</ItemSpecifics>`;
}

function buildProductListingDetailsXml(listing = {}) {
  const upc = String(listing.upc || '').trim();
  const epid = String(listing.epid || '').trim();
  if (!upc && !epid) return '';

  let inner = '';
  if (upc) inner += `<UPC>${escapeXml(upc)}</UPC>`;
  if (epid) inner += `<ProductReferenceID>${escapeXml(epid)}</ProductReferenceID>`;
  return `<ProductListingDetails>${inner}</ProductListingDetails>`;
}

function buildSellerProfilesXml(listing = {}) {
  const shipping = String(listing.shippingProfileName || 'Shipping Policy').trim();
  const returns = String(listing.returnProfileName || 'Return Policy').trim();
  const payment = String(listing.paymentProfileName || 'Payment Policy').trim();

  return `<SellerProfiles>
    <SellerShippingProfile><ShippingProfileName>${escapeXml(shipping)}</ShippingProfileName></SellerShippingProfile>
    <SellerReturnProfile><ReturnProfileName>${escapeXml(returns)}</ReturnProfileName></SellerReturnProfile>
    <SellerPaymentProfile><PaymentProfileName>${escapeXml(payment)}</PaymentProfileName></SellerPaymentProfile>
  </SellerProfiles>`;
}

function buildBestOfferXml(listing = {}) {
  const enabled = String(listing.bestOfferEnabled || '').toLowerCase();
  if (!['true', '1', 'yes'].includes(enabled)) return '';

  let xml = '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>';
  if (listing.bestOfferAutoAcceptPrice) {
    xml += `<ListingDetails><BestOfferAutoAcceptPrice>${escapeXml(Number(listing.bestOfferAutoAcceptPrice).toFixed(2))}</BestOfferAutoAcceptPrice>`;
    if (listing.minimumBestOfferPrice) {
      xml += `<MinimumBestOfferPrice>${escapeXml(Number(listing.minimumBestOfferPrice).toFixed(2))}</MinimumBestOfferPrice>`;
    }
    xml += '</ListingDetails>';
  }
  return xml;
}

function parseTradingAck(result, responseKey) {
  const response = result?.[responseKey];
  if (!response) {
    throw new Error(`Unexpected eBay response (${responseKey})`);
  }

  const ack = response.Ack?.[0];
  const errors = response.Errors || [];
  const errorMessages = errors
    .filter((entry) => entry.SeverityCode?.[0] === 'Error' || ack === 'Failure')
    .map((entry) => entry.LongMessage?.[0] || entry.ShortMessage?.[0])
    .filter(Boolean);

  const warningMessages = errors
    .filter((entry) => entry.SeverityCode?.[0] === 'Warning')
    .map((entry) => entry.LongMessage?.[0] || entry.ShortMessage?.[0])
    .filter(Boolean);

  if (ack === 'Failure') {
    throw new Error(errorMessages.join('; ') || 'eBay rejected the listing');
  }

  return {
    ack,
    itemId: response.ItemID?.[0] || null,
    fees: (response.Fees?.[0]?.Fee || []).map((fee) => ({
      name: fee.Name?.[0],
      amount: fee.Fee?.[0]?._ ?? fee.Fee?.[0],
    })),
    warnings: warningMessages,
    errors: errorMessages,
  };
}

export function buildAddFixedPriceItemXml(token, listing = {}, { verifyOnly = false } = {}) {
  const requestTag = verifyOnly ? 'VerifyAddFixedPriceItemRequest' : 'AddFixedPriceItemRequest';
  const title = String(listing.title || '').trim();
  const description = String(listing.description || '');
  const categoryId = String(listing.categoryId || '').trim();
  const startPrice = Number.parseFloat(listing.startPrice);
  const quantity = Math.max(1, Number.parseInt(listing.quantity, 10) || 1);
  const sku = String(listing.customLabel || '').trim();
  const duration = String(listing.duration || 'GTC').trim();
  const dispatchTime = String(listing.maxDispatchTime || '1').trim() || '1';
  const normalizedLocation = normalizeStoreLocationForEbay({
    location: listing.location,
    country: listing.country,
    postalCode: listing.postalCode,
  });
  const locationErrors = validateTradingLocationFields(normalizedLocation);
  if (locationErrors.length > 0) {
    throw new Error(locationErrors.join('; '));
  }

  const { location, country, postalCode } = normalizedLocation;

  if (!title || !categoryId || !Number.isFinite(startPrice) || !sku) {
    throw new Error('title, categoryId, startPrice, and customLabel (SKU) are required');
  }

  const pictureXml = buildPictureDetailsXml(listing.itemPhotoUrl);
  if (!pictureXml) {
    throw new Error('At least one item photo URL is required');
  }

  const itemXml = `
    <Title>${escapeXml(title)}</Title>
    <Description><![CDATA[${description}]]></Description>
    <PrimaryCategory><CategoryID>${escapeXml(categoryId)}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${startPrice.toFixed(2)}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <Country>${escapeXml(country)}</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>${escapeXml(dispatchTime)}</DispatchTimeMax>
    <ListingDuration>${escapeXml(duration)}</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Location>${escapeXml(location)}</Location>
    ${postalCode ? `<PostalCode>${escapeXml(postalCode)}</PostalCode>` : ''}
    <Quantity>${quantity}</Quantity>
    <SKU>${escapeXml(sku)}</SKU>
    <ConditionID>${parseConditionId(listing.conditionId)}</ConditionID>
    ${pictureXml}
    ${buildProductListingDetailsXml(listing)}
    ${buildItemSpecificsXml(listing.customFields)}
    ${buildSellerProfilesXml(listing)}
    ${buildBestOfferXml(listing)}
  `;

  return `<?xml version="1.0" encoding="utf-8"?>
<${requestTag} xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>${itemXml}</Item>
</${requestTag}>`;
}

export async function addFixedPriceItemListing(token, listing, { siteId = '0', verifyOnly = false } = {}) {
  const callName = verifyOnly ? 'VerifyAddFixedPriceItem' : 'AddFixedPriceItem';
  const xmlRequest = buildAddFixedPriceItemXml(token, listing, { verifyOnly });

  const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
    headers: {
      'X-EBAY-API-SITEID': siteId,
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
      'X-EBAY-API-CALL-NAME': callName,
      'Content-Type': 'text/xml',
    },
    timeout: 60000,
  });

  const result = await parseStringPromise(response.data);
  const responseKey = verifyOnly ? 'VerifyAddFixedPriceItemResponse' : 'AddFixedPriceItemResponse';
  const parsed = parseTradingAck(result, responseKey);

  return {
    ...parsed,
    listingUrl: parsed.itemId ? `https://www.ebay.com/itm/${parsed.itemId}` : null,
    verifiedOnly: verifyOnly,
  };
}
