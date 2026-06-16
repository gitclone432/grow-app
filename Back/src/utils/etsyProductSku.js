import EtsyProduct from '../models/EtsyProduct.js';
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function allocateUniqueEtsyProductSku(asin, excludeProductId = null) {
  const base = generateSKUFromASIN(asin);
  if (!base) return '';

  const filter = {
    sku: { $regex: `^${escapeRegex(base)}(-\\d+)?$`, $options: 'i' },
  };

  if (excludeProductId) {
    filter._id = { $ne: excludeProductId };
  }

  const existing = await EtsyProduct.find(filter).select('sku').lean();
  if (!existing.length) return base;

  const usedSuffixes = new Set();
  const baseUpper = base.toUpperCase();

  for (const row of existing) {
    const sku = String(row.sku || '').trim().toUpperCase();
    if (sku === baseUpper) {
      usedSuffixes.add(0);
      continue;
    }

    const match = sku.match(new RegExp(`^${escapeRegex(baseUpper)}-(\\d+)$`));
    if (match) usedSuffixes.add(Number(match[1]));
  }

  let suffix = 1;
  while (usedSuffixes.has(suffix)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function resolveSkuForProductLink(links, { productId = null, currentSku = '' } = {}) {
  const asin = extractAsinFromAmazonLink(links);
  if (!asin) return '';

  const trimmedSku = String(currentSku || '').trim();
  if (trimmedSku) return trimmedSku;

  return allocateUniqueEtsyProductSku(asin, productId);
}
