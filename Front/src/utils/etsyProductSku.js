import { generateSKUFromASIN } from './skuGenerator.js';

export function extractAsinFromAmazonLink(link) {
  const text = String(link || '').trim();
  if (!text) return '';

  const pathMatch = text.match(/(?:\/dp\/|\/gp\/product\/|\/asin\/)([A-Z0-9]{10})(?:[/?#&]|$)/i);
  if (pathMatch) return pathMatch[1].toUpperCase();

  const bareMatch = text.match(/\b([A-Z0-9]{10})\b/i);
  if (bareMatch) return bareMatch[1].toUpperCase();

  return '';
}

export function previewEtsyProductSku(link) {
  const asin = extractAsinFromAmazonLink(link);
  if (!asin) return '';
  return generateSKUFromASIN(asin);
}
