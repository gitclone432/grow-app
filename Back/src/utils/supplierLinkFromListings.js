import mongoose from 'mongoose';
import TemplateListing from '../models/TemplateListing.js';
import Listing from '../models/Listing.js';

export function extractOrderSku(order) {
    if (!order) return '';
    if (order.sku) return String(order.sku).trim();
    if (Array.isArray(order.lineItems)) {
        for (const lineItem of order.lineItems) {
            const sku = lineItem?.sku || lineItem?.SKU || lineItem?.customLabel;
            if (sku) return String(sku).trim();
        }
    }
    return '';
}

function normalizeSku(value) {
    return String(value || '').trim().toUpperCase();
}

/** GRW25XXXXX or GRW25XXXXX-2 → GRW25XXXXX */
function getBaseSku(value) {
    const sku = normalizeSku(value);
    const match = sku.match(/^(GRW25[A-Z0-9]{5})(?:-\d+)?$/);
    return match ? match[1] : sku;
}

function extractOrderItemNumber(order) {
    const lineItem = Array.isArray(order?.lineItems) ? order.lineItems[0] : null;
    return (
        lineItem?.legacyItemId ||
        order?.itemNumber ||
        ''
    ).toString().trim();
}

function buildAmazonLinkFromAsin(asin) {
    const clean = String(asin || '').trim();
    if (!clean) return '';
    return `https://www.amazon.com/dp/${clean}`;
}

/** Prefer saved TemplateListing.amazonLink; fall back to /dp/{ASIN}. */
function resolveSupplierLinkFromListing(listingRow) {
    if (!listingRow) return '';
    const savedLink = String(listingRow.amazonLink || '').trim();
    if (savedLink) return savedLink;
    return buildAmazonLinkFromAsin(listingRow._asinReference);
}

function toSellerObjectIds(sellerIds = []) {
    return [...new Set(sellerIds)]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
}

function upsertListingLinkIndexEntry(byKey, key, listing) {
    if (!key || !listing) return;
    const link = resolveSupplierLinkFromListing(listing);
    if (!link) return;

    const existing = byKey.get(key);
    if (!existing) {
        byKey.set(key, { link, listing });
        return;
    }

    const existingActive = existing.listing?.status === 'active';
    const nextActive = listing.status === 'active';
    if (!existingActive && nextActive) {
        byKey.set(key, { link, listing });
        return;
    }

    if (existingActive === nextActive) {
        const existingAt = new Date(existing.listing?.updatedAt || 0).getTime();
        const nextAt = new Date(listing.updatedAt || 0).getTime();
        if (nextAt > existingAt) {
            byKey.set(key, { link, listing });
        }
    }
}

/**
 * Index Listings Database rows by seller + SKU / eBay item / ASIN suffix,
 * plus global SKU keys when the order seller differs from the listing seller.
 */
function buildTemplateListingLinkIndex(templateListings = []) {
    const byKey = new Map();

    const sorted = [...templateListings].sort((left, right) => {
        const leftActive = left?.status === 'active' ? 0 : 1;
        const rightActive = right?.status === 'active' ? 0 : 1;
        if (leftActive !== rightActive) return leftActive - rightActive;
        return new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
    });

    for (const listing of sorted) {
        const sellerId = String(listing.sellerId || '');
        const customLabel = normalizeSku(listing.customLabel || '');
        const asin = String(listing._asinReference || '').trim().toUpperCase();
        const ebayItemId = String(listing.ebayItemId || '').trim();

        if (customLabel) {
            upsertListingLinkIndexEntry(byKey, `${sellerId}::sku::${customLabel}`, listing);
            upsertListingLinkIndexEntry(byKey, `${sellerId}::sku::${getBaseSku(customLabel)}`, listing);
            upsertListingLinkIndexEntry(byKey, `global::sku::${customLabel}`, listing);
            upsertListingLinkIndexEntry(byKey, `global::sku::${getBaseSku(customLabel)}`, listing);
        }
        if (ebayItemId) {
            upsertListingLinkIndexEntry(byKey, `${sellerId}::item::${ebayItemId}`, listing);
        }
        if (asin.length >= 5) {
            const suffix = asin.slice(-5);
            upsertListingLinkIndexEntry(byKey, `${sellerId}::asinSuffix::${suffix}`, listing);
            upsertListingLinkIndexEntry(byKey, `global::asinSuffix::${suffix}`, listing);
        }
    }

    return byKey;
}

function collectSkuVariantsForOrders(orders = [], listingSkuBySellerItem = new Map()) {
    const variants = new Set();

    for (const order of orders) {
        const sellerId = String(order?.seller?._id || order?.seller || '').trim();
        const itemNumber = String(extractOrderItemNumber(order) || '').trim();
        const sku = normalizeSku(
            extractOrderSku(order) || (sellerId ? listingSkuBySellerItem.get(`${sellerId}::${itemNumber}`) : '') || ''
        );
        if (!sku) continue;
        variants.add(sku);
        variants.add(getBaseSku(sku));
    }

    return [...variants];
}

async function fetchTemplateListingsForSupplierLookup(sellerObjectIds = [], skuVariants = []) {
    const clauses = [];

    if (sellerObjectIds.length) {
        clauses.push({
            sellerId: { $in: sellerObjectIds },
            deletedAt: null,
        });
    }

    if (skuVariants.length) {
        clauses.push({
            deletedAt: null,
            customLabel: { $in: skuVariants },
        });

        const asinSuffixes = [...new Set(
            skuVariants
                .map((sku) => getBaseSku(sku))
                .filter((sku) => sku.startsWith('GRW25') && sku.length === 10)
                .map((sku) => sku.slice(5))
        )];

        if (asinSuffixes.length) {
            clauses.push({
                deletedAt: null,
                $or: asinSuffixes.map((suffix) => ({
                    _asinReference: new RegExp(`${suffix}$`, 'i'),
                })),
            });
        }
    }

    if (!clauses.length) return [];

    const rows = await TemplateListing.find({ $or: clauses })
        .select('+_asinReference sellerId customLabel amazonLink ebayItemId status updatedAt')
        .lean();

    const byId = new Map();
    for (const row of rows) {
        byId.set(String(row._id), row);
    }
    return [...byId.values()];
}

function lookupSupplierLinkForOrder(order, linkIndex, listingSkuBySellerItem) {
    const sellerId = String(order?.seller?._id || order?.seller || '').trim();
    const itemNumber = String(extractOrderItemNumber(order) || '').trim();
    const sku = normalizeSku(
        extractOrderSku(order) || (sellerId ? listingSkuBySellerItem.get(`${sellerId}::${itemNumber}`) : '') || ''
    );

    const sellerAttempts = [];
    const globalAttempts = [];

    if (sku) {
        const baseSku = getBaseSku(sku);
        globalAttempts.push(`global::sku::${sku}`);
        globalAttempts.push(`global::sku::${baseSku}`);
        if (baseSku.startsWith('GRW25') && baseSku.length === 10) {
            globalAttempts.push(`global::asinSuffix::${baseSku.slice(5)}`);
        }
        if (sellerId) {
            sellerAttempts.push(`${sellerId}::sku::${sku}`);
            sellerAttempts.push(`${sellerId}::sku::${baseSku}`);
            if (baseSku.startsWith('GRW25') && baseSku.length === 10) {
                sellerAttempts.push(`${sellerId}::asinSuffix::${baseSku.slice(5)}`);
            }
        }
    }
    if (sellerId && itemNumber) {
        sellerAttempts.push(`${sellerId}::item::${itemNumber}`);
    }

    for (const key of [...sellerAttempts, ...globalAttempts]) {
        const match = linkIndex.get(key);
        if (match?.link) return match.link;
    }

    return '';
}

async function resolveSupplierLinksForOrders(orders = [], { writeField = 'supplierLink' } = {}) {
    if (!orders.length) return orders;

    const sellerIds = [
        ...new Set(
            orders
                .map((order) => String(order?.seller?._id || order?.seller || '').trim())
                .filter(Boolean)
        ),
    ];
    const missingSkuItemNumbers = [
        ...new Set(
            orders
                .filter((order) => !extractOrderSku(order) && extractOrderItemNumber(order))
                .map((order) => extractOrderItemNumber(order))
        ),
    ];

    const listingDocs = missingSkuItemNumbers.length > 0 && sellerIds.length > 0
        ? await Listing.find({
            seller: { $in: toSellerObjectIds(sellerIds) },
            itemId: { $in: missingSkuItemNumbers },
          }).select('seller itemId sku').lean()
        : [];

    const listingSkuBySellerItem = new Map(
        listingDocs.map((row) => [`${String(row.seller)}::${String(row.itemId || '').trim()}`, String(row.sku || '').trim()])
    );

    const skuVariants = collectSkuVariantsForOrders(orders, listingSkuBySellerItem);
    if (!skuVariants.length && !sellerIds.length) return orders;

    const templateListings = await fetchTemplateListingsForSupplierLookup(
        toSellerObjectIds(sellerIds),
        skuVariants
    );
    if (!templateListings.length) return orders;

    const linkIndex = buildTemplateListingLinkIndex(templateListings);

    return orders.map((order) => {
        const existingLink = String(order?.affiliateLink || order?.supplierLink || '').trim();
        if (existingLink) {
            return writeField === 'supplierLink'
                ? { ...order, supplierLink: existingLink }
                : order;
        }

        const supplierLink = lookupSupplierLinkForOrder(order, linkIndex, listingSkuBySellerItem);
        if (!supplierLink) return order;

        return {
            ...order,
            [writeField]: supplierLink,
        };
    });
}

/** Add supplierLink to orders (from saved affiliateLink or Listings Database lookup). */
export async function enrichOrdersWithSupplierLinks(orders = []) {
    if (!Array.isArray(orders) || orders.length === 0) return orders;
    return resolveSupplierLinksForOrders(orders, { writeField: 'supplierLink' });
}

/** Backfill affiliateLink on orders missing it (Affiliate Orders page). */
export async function applyAffiliateSupplierLinks(orders = []) {
    if (!Array.isArray(orders) || orders.length === 0) return orders;

    const missingLink = orders.filter((order) => !String(order?.affiliateLink || '').trim());
    if (!missingLink.length) return orders;

    const enrichedMissing = await resolveSupplierLinksForOrders(missingLink, { writeField: 'affiliateLink' });
    const enrichedById = new Map(
        enrichedMissing.map((order) => [String(order._id), order])
    );

    return orders.map((order) => enrichedById.get(String(order._id)) || order);
}
