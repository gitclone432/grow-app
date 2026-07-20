import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  LinearProgress,
  Chip,
  TextField,
  Grid,
  Paper,
  Divider,
  Alert,
  Stack,
  Skeleton,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Snackbar
} from '@mui/material';
import {
  Close as CloseIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as LoadingIcon,
  Delete as DeleteIcon,
  Code as CodeIcon,
  Visibility as VisibilityIcon,
  Update as UpdateIcon,
  Autorenew as AutorenewIcon
} from '@mui/icons-material';
import api from '../lib/api.js';
import { calcInrProfitFromPricingCalculator } from '../utils/pricingProfitPreview.js';

const MARKETPLACE_DOMAINS = {
  US: 'www.amazon.com',
  UK: 'www.amazon.co.uk',
  CA: 'www.amazon.ca',
  AU: 'www.amazon.com.au',
};

const SCRAPE_SOURCE_META = {
  cache: { label: 'Cache', color: 'default', title: 'Served from in-memory ASIN cache' },
  listings_db: { label: 'DB reuse', color: 'info', title: 'Reused Amazon snapshot from Listings Database' },
  live_scrape: { label: 'Live scrape', color: 'warning', title: 'Fetched live via ScrapingDog / ScraperAPI' },
  directory: { label: 'Directory', color: 'secondary', title: 'Loaded from ASIN Directory' },
};

function getScrapeSourceMeta(source) {
  return SCRAPE_SOURCE_META[source] || null;
}

function formatBulletLi(text, isLast = false) {
  let cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/<[\w!/?]/.test(cleaned)) {
    cleaned = stripHtmlTagsToPlain(cleaned);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  }
  if (!cleaned || cleaned.length > 620) return '';
  const words = cleaned.split(' ');
  const firstThree = words.slice(0, 3).join(' ');
  const rest = words.slice(3).join(' ');
  const borderCss = isLast ? '' : 'border-bottom:1px solid #e8d88a;';
  const esc = escapeHtmlLite;
  return `<li style='padding:10px 14px;${borderCss}font-size:16px;color:#1a1a1a;'><span style='color:#b8960c;margin-right:8px;'>&#9658;</span><strong>${esc(firstThree)}</strong>${rest ? ` ${esc(rest)}` : ''}</li>`;
}

function escapeHtmlLite(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtmlTagsToPlain(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Model sometimes echoes the whole golden eBay shell into the bullets field — reject that. */
function looksLikeListingShellEcho(s = '') {
  const t = String(s);
  if (t.length < 600) return false;
  let score = 0;
  if (t.includes('VISIT OUR STORE FOR MORE GREAT ITEMS')) score++;
  if (t.includes('{{AI_FEATURE_BULLETS}}') || /\{\{[A-Za-z0-9_]+\}\}/.test(t)) score++;
  if (/max-width:\s*1000px/i.test(t)) score++;
  if (t.includes('Product Highlights')) score++;
  if (/<table\b/i.test(t) && /<\/table>/i.test(t)) score++;
  if (t.includes('Great Seller') && t.includes('Fast')) score++;
  return score >= 2;
}

/** Unsubstituted template tokens pasted into AI output breaks replacement and nesting. */
function hasUnsubstitutedPlaceholders(html = '') {
  return /\{\{[A-Za-z0-9_]+\}\}/.test(String(html || ''));
}

const BOILERPLATE_LI_REGEXES = [
  /ebay\s+messaging/i,
  /buy\s+with\s+confidence/i,
  /five-?star\s+experience/i,
  /we\s+usually\s+respond/i,
  /visit\s+our\s+store/i,
  /thank\s+you\s+for\s+shopping/i,
  /whether\s+you\s+are\s+just\s+browsing/i,
  /each\s+item\s+is\s+carefully\s+inspected/i,
  /orders\s+ship\s+within\s+.*business\s+day/i,
  /shipping\s+is\s+always\s+free/i,
  /great\s+seller[\s\S]{0,80}\|/i,
  /fast,\s*reliable\s+shipping/i,
  /1-?day\s+processing/i,
  /customer\s+support\s+you\s+can\s+trust/i,
  /\bcommitted\s+to\s+a\b.*\bfive/i,
];

function liPlainTextLooksLikeSellerBoilerplate(plain = '') {
  const p = String(plain || '').trim();
  if (!p) return true;
  if (p.includes('Product Highlights') && /\{\{/.test(p)) return true;
  return BOILERPLATE_LI_REGEXES.some((re) => re.test(p));
}

const MAX_AI_LI_CHARS = 1600;

function isSafeBulletLi(li = '') {
  if (!li || li.length > MAX_AI_LI_CHARS) return false;
  if (/^<li\b/i.test(li) === false) return false;
  if (hasUnsubstitutedPlaceholders(li)) return false;
  if (/<\s*(table|html|body|iframe|object\b)/i.test(li)) return false;
  const innerNested = String(li.match(/<(div)\b/gi) || []).length;
  if (innerNested > 3) return false;
  const innerUl = /<ul\b/i.test(li) || /<ol\b/i.test(li);
  return !innerUl;
}

/** Keep only `<li>` that look like product lines, not eBay boilerplate pasted from the golden template. */
function filterProductBullets(htmlLis = []) {
  const good = htmlLis.filter((li) => {
    if (!isSafeBulletLi(li)) return false;
    const plain = stripHtmlTagsToPlain(li).replace(/\s+/g, ' ').trim();
    if (!plain || plain.length > 520) return false;
    if (liPlainTextLooksLikeSellerBoilerplate(plain)) return false;
    return true;
  });
  return good.slice(0, 12);
}

function bulletsFromUlBlock(ulInner) {
  const lis = String(ulInner || '').match(/<li[\s\S]*?<\/li>/gi) || [];
  const good = filterProductBullets(lis).filter(Boolean);
  return good.length ? good.join('') : '';
}

/** Turn AI / scrape text into bullets for Product Highlights placeholder (never full listing HTML). */
function normalizeAiFeatureBullets(aiDescription = '') {
  const text = String(aiDescription || '').trim();
  if (!text) return '';
  // Never splice template tokens or shell HTML into placeholders — fallback uses scrape.
  if (hasUnsubstitutedPlaceholders(text)) return '';

  const ulScoped = text.match(/<ul[^>]*>([\s\S]*?)<\/ul>/gi) || [];
  for (let i = 0; i < ulScoped.length; i++) {
    const innerMatch = ulScoped[i].match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    if (!innerMatch) continue;
    const chunk = bulletsFromUlBlock(innerMatch[1]);
    if (chunk) return chunk;
  }

  const looseLis = text.match(/<li[\s\S]*?<\/li>/gi) || [];
  const goodLoose = filterProductBullets(looseLis).filter(Boolean);
  if (goodLoose.length) return goodLoose.join('');

  if (looksLikeListingShellEcho(text)) {
    return '';
  }
  if (text.length > 2000 && /<div\b|<table\b/i.test(text)) {
    const plain = stripHtmlTagsToPlain(text);
    return bulletsFromPlainLines(plain, 8);
  }

  const lines = text
    .split(/\r?\n|[•●▪‣]/g)
    .map((s) => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!lines.length) return '';
  if (lines.length === 1 && lines[0].length > 420) {
    return bulletsFromPlainLines(lines[0], 8);
  }
  return lines.map((line, idx) => formatBulletLi(line, idx === lines.length - 1)).join('');
}

function bulletsFromPlainLines(plain, maxItems = 8) {
  const source = String(plain || '').trim();
  if (!source) return '';
  let parts = source
    .split(/\r?\n|[•●▪‣]/g)
    .map((s) => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean);

  if (parts.length === 1 && parts[0].length > 240) {
    parts = parts[0].split(/\.\s+/).map((s) => s.trim()).filter((s) => s.length > 18);
    parts = parts.map((s) => (/\.\s*$/.test(s) ? s : `${s}.`)).slice(0, maxItems);
  }
  return parts
    .slice(0, maxItems)
    .map((line, idx, arr) => formatBulletLi(line, idx === arr.length - 1))
    .filter(Boolean)
    .join('');
}

function buildFallbackFeatureBullets(rawDescription = '') {
  const source = String(rawDescription || '').trim();
  if (!source) return '';

  let lines = source
    .split(/\r?\n|[•●▪‣]/g)
    .map((s) => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean);

  if (lines.length === 1 && lines[0].length > 280) {
    return bulletsFromPlainLines(lines[0], 8);
  }
  return lines.slice(0, 8).map((line, idx, arr) => formatBulletLi(line, idx === arr.length - 1)).join('');
}

function parseAmazonPrice(value) {
  const numeric = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function withAmazonScrapedPrice(listingData, item) {
  if (listingData?.amazonScrapedPrice != null) return listingData;
  const scrapedPrice = parseAmazonPrice(item?.sourceData?.price);
  return scrapedPrice != null ? { ...listingData, amazonScrapedPrice: scrapedPrice } : listingData;
}

function resolveListingImageUrls(sourceData = {}, generatedListing = {}) {
  if (Array.isArray(sourceData?.images) && sourceData.images.length) {
    return sourceData.images.map((url) => String(url || '').trim()).filter(Boolean);
  }
  return String(generatedListing?.itemPhotoUrl || '')
    .split(/\s*\|\s*|\s*,\s*|\n+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function applyStoreTemplatePlaceholders(templateHtml = '', generatedListing = {}, sourceData = {}, aiDescriptionRaw = '') {
  let composed = String(templateHtml || '');
  if (!composed.trim()) return '';

  const explicitAiDescription = String(aiDescriptionRaw || '').trim();
  const generatedDescription = String(generatedListing?.description || '').trim();
  const scrapedDescription = String(sourceData?.description || '').trim();
  // Prefer explicit AI text. Ignore listing-shell / unsubstituted HTML that was copied into
  // description as the store template default — that must not block title/image substitution.
  const usableGeneratedDescription =
    generatedDescription
    && !looksLikeListingShellEcho(generatedDescription)
    && !hasUnsubstitutedPlaceholders(generatedDescription)
      ? generatedDescription
      : '';
  const aiDescription = explicitAiDescription || usableGeneratedDescription || '';
  const resolvedBullets =
    normalizeAiFeatureBullets(aiDescription) ||
    buildFallbackFeatureBullets(scrapedDescription);

  const sanitizedDescriptionPlaceholder = (() => {
    if (resolvedBullets) return resolvedBullets;
    if (!aiDescription) return '';
    if (looksLikeListingShellEcho(aiDescription) || hasUnsubstitutedPlaceholders(aiDescription)) {
      return buildFallbackFeatureBullets(scrapedDescription);
    }
    return aiDescription;
  })();

  const titleClean = String(sourceData?.title || generatedListing?.title || '').trim();
  const images = resolveListingImageUrls(sourceData, generatedListing);

  const placeholderMap = {
    '{{AI_FEATURE_BULLETS}}': resolvedBullets,
    '{{AI_DESCRIPTION}}': sanitizedDescriptionPlaceholder,
    '{{TITLE_CLEAN}}': titleClean,
    '{{MAIN_IMAGE}}': images[0] || '',
    '{{SUB1}}': images[1] || '',
    '{{SUB2}}': images[2] || '',
    '{{SUB3}}': images[3] || '',
    '{{SUB4}}': images[4] || '',
    '{{SUB5}}': images[5] || '',
    '{{SUB6}}': images[6] || '',
    '{{SUB7}}': images[7] || '',
  };

  Object.entries(placeholderMap).forEach(([token, value]) => {
    if (composed.includes(token)) {
      composed = composed.split(token).join(value || '');
    }
  });

  return composed;
}

/**
 * Settlement-style profit (INR): Payoneer (Net×payout) − Amazon spend (basis×spent).
 * A = sold×(1+saleTax/100); eBay = A×(ebayFee/100)+fixed (defaults from opts / template).
 */
function calcActualProfit(buyingPrice, sold, opts = {}) {
  const n = (v, d) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  };
  const payoutRate = n(opts.payoutRate, 87);
  const spentRate = n(opts.spentRate, 95);
  const taxRateOnCost = n(opts.taxRate, 10);
  const saleTaxPctOnSold = n(opts.saleTax, 10);
  const ebayPct = n(opts.ebayFee, 13.95) / 100;
  const adsPct = n(opts.adsFee, 15) / 100;
  const tdsPct = n(opts.tdsFee, 1) / 100;
  const ebayFixed = n(opts.ebayFixedUsd, 0.4);
  const tCont = n(opts.transactionContUsd, 0.24);

  const mult = 1 + saleTaxPctOnSold / 100;
  const A = parseFloat((sold * mult).toFixed(2));
  const eBay = parseFloat((A * ebayPct + ebayFixed).toFixed(2));
  const ADS = parseFloat((A * adsPct).toFixed(2));
  const TDS = parseFloat((A * tdsPct).toFixed(2));
  const Net = parseFloat((sold - eBay - ADS - TDS - tCont).toFixed(2));
  const costMult = 1 + taxRateOnCost / 100;
  const AmazonWithTax = parseFloat((buyingPrice * costMult).toFixed(2));
  const Payoneer = parseFloat((Net * payoutRate).toFixed(2));
  const AmazonExpense = parseFloat((AmazonWithTax * spentRate).toFixed(2));
  const actualProfit = parseFloat((Payoneer - AmazonExpense).toFixed(2));
  return {
    A,
    eBay,
    ADS,
    TDS,
    TCont: tCont,
    Net,
    AmazonWithTax,
    Payoneer,
    AmazonExpense,
    actualProfit,
    payoutRate,
    spentRate
  };
}

export default function AsinReviewModal({ 
  open, 
  onClose, 
  previewItems = [], 
  onSave,
  onListDirectly = null,
  hideSaveButton = false,
  listDirectlyLabel = 'List Directly',
  templateColumns = [],
  marketplace = 'US',
  sellerId = '',
  storeTemplateHtml = '',
  /** When set, fills missing rates on older pricingCalculation.breakdown rows */
  pricingConfig = null
}) {
  const DESCRIPTION_TEMPLATE_STORAGE_KEY = 'description-templates.gallery.v1';
  const STORE_TEMPLATE_MAP_KEY = 'store-description-template-map.v1';
  const amazonDomain = MARKETPLACE_DOMAINS[marketplace] || MARKETPLACE_DOMAINS.US;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedItems, setEditedItems] = useState({});
  const [dismissedItems, setDismissedItems] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [descriptionViewMode, setDescriptionViewMode] = useState('preview'); // 'code' | 'preview'
  const [amazonWindowRef, setAmazonWindowRef] = useState(null);
  const [showAmazonPreview, setShowAmazonPreview] = useState(false);
  const [rephrasing, setRephrasing] = useState({}); // { [itemId]: true|false }
  const [startPriceEditMode, setStartPriceEditMode] = useState({}); // { [itemId]: true|false }
  const [skuToast, setSkuToast] = useState({ open: false, message: '' });

  // Filter out dismissed items
  const activeItems = previewItems.filter(item => !dismissedItems.has(item.id));
  const listableCount = activeItems.filter(
    (item) => !['error', 'loading', 'blocked'].includes(item.status)
  ).length;
  const listDirectlyButtonLabel = `${String(listDirectlyLabel || 'List Directly').replace(/\s*\(\d+\)\s*$/, '')} (${listableCount})`;
  const currentItem = activeItems[currentIndex];
  const scrapeSourceMeta = getScrapeSourceMeta(currentItem?.scrapeSource);
  const itemData = editedItems[currentItem?.id] || currentItem?.generatedListing || {};
  const isStartPriceEditing = !!(currentItem?.id && startPriceEditMode[currentItem.id]);
  const startPriceValue = itemData.startPrice ?? '';
  const soldPriceUsd = parseFloat(startPriceValue);
  const pricingBreakdown = currentItem?.pricingCalculation?.breakdown;
  const pricingCalcActive =
    currentItem?.pricingCalculation?.enabled &&
    !currentItem?.pricingCalculation?.error &&
    pricingBreakdown;

  const calculatorProfit =
    pricingCalcActive && !isNaN(soldPriceUsd) && soldPriceUsd > 0
      ? calcInrProfitFromPricingCalculator(pricingBreakdown, pricingConfig, soldPriceUsd)
      : null;

  const actualProfitBuyingPrice = parseFloat(currentItem?.sourceData?.price);
  const legacyActualProfit =
    marketplace === 'US' &&
    !calculatorProfit &&
    !isNaN(actualProfitBuyingPrice) &&
    actualProfitBuyingPrice > 0 &&
    !isNaN(soldPriceUsd) &&
    soldPriceUsd > 0
      ? calcActualProfit(actualProfitBuyingPrice, soldPriceUsd, {
          payoutRate: pricingConfig?.payoutRate,
          spentRate: pricingConfig?.spentRate,
          saleTax: pricingConfig?.saleTax,
          taxRate: pricingConfig?.taxRate,
          ebayFee: pricingConfig?.ebayFee,
          adsFee: pricingConfig?.adsFee,
          tdsFee: pricingConfig?.tdsFee,
          ebayFixedUsd: pricingConfig?.ebayFixedUsd,
          transactionContUsd: pricingConfig?.transactionContUsd
        })
      : null;

  const showProfitChip = !!(calculatorProfit || legacyActualProfit);
  const displayProfitInr = calculatorProfit
    ? calculatorProfit.profitINR
    : legacyActualProfit?.actualProfit ?? null;
  const actualProfitColor =
    displayProfitInr != null && displayProfitInr < 300 ? 'error' : 'success';

  // Initialize edited items from preview data
  useEffect(() => {
    if (previewItems.length > 0) {
      let selectedStoreTemplate = null;
      try {
        if (String(storeTemplateHtml || '').trim()) {
          selectedStoreTemplate = { html: String(storeTemplateHtml) };
        } else {
          const rawMap = localStorage.getItem(STORE_TEMPLATE_MAP_KEY);
          const parsedMap = rawMap ? JSON.parse(rawMap) : {};
          let assignedTemplateId = '';
          if (sellerId) {
            assignedTemplateId = parsedMap?.[sellerId] || '';
            if (!assignedTemplateId && parsedMap && typeof parsedMap === 'object') {
              const matchedKey = Object.keys(parsedMap).find((key) => String(key) === String(sellerId));
              assignedTemplateId = matchedKey ? parsedMap[matchedKey] : '';
            }
          }

          if (assignedTemplateId) {
            const rawTemplates = localStorage.getItem(DESCRIPTION_TEMPLATE_STORAGE_KEY);
            const parsedTemplates = rawTemplates ? JSON.parse(rawTemplates) : [];
            selectedStoreTemplate = (Array.isArray(parsedTemplates) ? parsedTemplates : [])
              .find((template) => String(template?.id) === String(assignedTemplateId));
          }
        }
      } catch {
        selectedStoreTemplate = null;
      }

      const directTemplateHtml = String(storeTemplateHtml || '').trim();
      const resolvedTemplateHtml = directTemplateHtml || String(selectedStoreTemplate?.html || '').trim();

      const initial = {};
      previewItems.forEach(item => {
        if (item.generatedListing) {
          const nextListing = { ...item.generatedListing };
          const isExistingListingEdit = Boolean(nextListing?._existingListingId);
          if (!isExistingListingEdit) {
            const mergedDesc = String(item.generatedListing?.description || '').trim();
            // Always substitute {{TITLE_CLEAN}} / image tokens — including when the
            // default description shell was used and no store template was assigned.
            const templateHtml =
              resolvedTemplateHtml
              || (hasUnsubstitutedPlaceholders(mergedDesc) ? mergedDesc : '');
            if (templateHtml) {
              nextListing.description = applyStoreTemplatePlaceholders(
                templateHtml,
                item.generatedListing,
                item.sourceData,
                item.aiDescription
              );
            } else {
              const aiTrim = String(item.aiDescription || '').trim();
              nextListing.description = mergedDesc || aiTrim || '';
            }
          }
          initial[item.id] = nextListing;
        }
      });
      setEditedItems(initial);
      setStartPriceEditMode({});
    }
  }, [previewItems, sellerId, storeTemplateHtml]);


  // Reset transient review state for each new preview run/open
  useEffect(() => {
    if (!open) return;
    setDismissedItems(new Set());
    setCurrentIndex(0);
    setHasUnsavedChanges(false);
  }, [open, previewItems]);

  // Sync Amazon preview window when navigating
  useEffect(() => {
    if (showAmazonPreview && amazonWindowRef && !amazonWindowRef.closed && currentItem?.asin) {
      const asin = currentItem.asin;
      const amazonUrl = `https://${amazonDomain}/dp/${asin}`;
      try {
        amazonWindowRef.location.href = amazonUrl;
      } catch (error) {
        // Window might be closed or blocked
        console.warn('Could not update Amazon preview window:', error);
        setShowAmazonPreview(false);
        setAmazonWindowRef(null);
      }
    }
  }, [currentIndex, currentItem?.asin, showAmazonPreview, amazonWindowRef]);

  // Check if Amazon preview window was closed manually
  useEffect(() => {
    if (!showAmazonPreview || !amazonWindowRef) return;
    
    const checkWindowClosed = setInterval(() => {
      if (amazonWindowRef.closed) {
        setShowAmazonPreview(false);
        setAmazonWindowRef(null);
      }
    }, 500);
    
    return () => clearInterval(checkWindowClosed);
  }, [showAmazonPreview, amazonWindowRef]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, activeItems.length, hasUnsavedChanges]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < activeItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleDismiss = () => {
    if (!currentItem) return;
    
    // Add to dismissed set
    setDismissedItems(prev => new Set([...prev, currentItem.id]));
    
    // Navigate to next item, or previous if we're at the end
    if (currentIndex >= activeItems.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    // If this was the last item, currentIndex stays the same but will show next remaining item
  };

  const handleFieldChange = (field, value, isCustomField = false) => {
    const updatedItem = { ...itemData };
    
    if (isCustomField) {
      updatedItem.customFields = { ...updatedItem.customFields, [field]: value };
    } else {
      updatedItem[field] = value;
    }
    
    setEditedItems(prev => ({
      ...prev,
      [currentItem.id]: updatedItem
    }));
    
    setHasUnsavedChanges(true);
  };

  const handleStartPriceEdit = () => {
    if (!currentItem) return;
    setStartPriceEditMode(prev => ({
      ...prev,
      [currentItem.id]: true
    }));
  };

  const handleStartPriceSave = () => {
    if (!currentItem) return;
    setStartPriceEditMode(prev => ({
      ...prev,
      [currentItem.id]: false
    }));
  };


  const notifySkuReallocations = (items) => {
    const reallocated = items.filter(
      (item) =>
        item.skuReallocated ||
        (item.sku && item.baseSku && item.sku !== item.baseSku) ||
        (Array.isArray(item.warnings) && item.warnings.some((w) => /was taken/i.test(String(w))))
    );
    if (reallocated.length === 0) return;
    const sample = reallocated
      .slice(0, 3)
      .map((item) => `${item.baseSku || 'SKU'} → ${item.sku}`)
      .join(', ');
    const extra = reallocated.length > 3 ? ` (+${reallocated.length - 3} more)` : '';
    setSkuToast({
      open: true,
      message: `Base SKU was taken for ${reallocated.length} listing(s). Using counted SKUs: ${sample}${extra}`,
    });
  };

  const handleSaveAll = async () => {
    const savableItems = activeItems.filter(
      (item) => !['error', 'loading', 'blocked'].includes(item.status)
    );
    const listingsToSave = savableItems.map(item => {
        const listingData = withAmazonScrapedPrice(
          editedItems[item.id] || item.generatedListing,
          item
        );
        
        // Mark duplicates for update
        if (item.status === 'duplicate_updateable') {
          return {
            ...listingData,
            _isDuplicateUpdate: true,
            _existingListingId: item.generatedListing?._existingListingId || listingData._existingListingId
          };
        }
        
        return listingData;
      });

    notifySkuReallocations(savableItems);

    setSaving(true);
    try {
      await onSave(listingsToSave);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRephrase = async () => {
    if (!currentItem || !itemData.title) return;
    setRephrasing(prev => ({ ...prev, [currentItem.id]: true }));
    try {
      const { data } = await api.post('/ai/rephrase-title', {
        currentTitle: itemData.title,
        sourceTitle: currentItem.sourceData?.title || '',
        brand: currentItem.sourceData?.brand || '',
        color: currentItem.sourceData?.color || '',
        compatibility: currentItem.sourceData?.compatibility || ''
      });
      handleFieldChange('title', data.rephrasedTitle, false);
    } catch (error) {
      console.error('[Rephrase Title] Error:', error);
    } finally {
      setRephrasing(prev => ({ ...prev, [currentItem.id]: false }));
    }
  };

  const openAmazonPreview = () => {
    if (!currentItem?.asin) return;
    
    const asin = currentItem.asin;
    const amazonUrl = `https://${amazonDomain}/dp/${asin}`;
    
    const halfWidth = Math.floor(window.screen.width / 2);
    const screenHeight = window.screen.height;

    // Move the main browser window to the right half
    try {
      window.moveTo(halfWidth, 0);
      window.resizeTo(halfWidth, screenHeight);
    } catch (e) {
      // Silently ignore — not permitted for regular browser tabs
    }
    
    // Open Amazon popup on the left half
    const windowRef = window.open(
      amazonUrl,
      'AmazonPreview',
      `width=${halfWidth},height=${screenHeight},left=0,top=0,resizable=yes,scrollbars=yes,location=yes`
    );
    
    if (windowRef) {
      setAmazonWindowRef(windowRef);
      setShowAmazonPreview(true);
    } else {
      alert('Please allow popups to view Amazon preview side-by-side');
    }
  };

  const closeAmazonPreview = () => {
    if (amazonWindowRef && !amazonWindowRef.closed) {
      amazonWindowRef.close();
    }
    setAmazonWindowRef(null);
    setShowAmazonPreview(false);

    // Restore main window to full screen
    try {
      window.moveTo(0, 0);
      window.resizeTo(window.screen.width, window.screen.height);
    } catch (e) {
      // Silently ignore
    }
  };

  const toggleAmazonPreview = () => {
    if (showAmazonPreview) {
      closeAmazonPreview();
    } else {
      openAmazonPreview();
    }
  };

  const handleClose = () => {
    // Close Amazon preview window if open
    closeAmazonPreview();
    
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    setStartPriceEditMode({});
    onClose();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'loading':
        return <CircularProgress size={20} />;
      case 'ready':
      case 'success':
        return <CheckIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'duplicate_updateable':
        return <UpdateIcon color="warning" />;
      case 'blocked':
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'loading':
        return 'info';
      case 'ready':
      case 'success':
        return 'success';
      case 'warning':
      case 'duplicate_updateable':
        return 'warning';
      case 'blocked':
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  if (!currentItem) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogContent sx={{ py: 4 }}>
          <Stack spacing={2} alignItems="center">
            <Typography variant="h6">Review Generated Listings</Typography>
            <Alert severity="info" sx={{ width: '100%' }}>
              No preview items are available to review right now. Please run Bulk Auto-Fill again.
            </Alert>
            <Button variant="contained" onClick={handleClose}>Close</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    );
  }


  const profitTooltipContent = (() => {
    if (calculatorProfit?.mode === 'legacy_fee_multiplier') {
      return (
        <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: 1.8, p: 0.5 }}>
          <Box sx={{ opacity: 0.92, mb: 0.5 }}>Older pricing snapshot (previous fee-multiplier model)</Box>
          <Box>Fee mult:&nbsp; {calculatorProfit.feeMultiplier}</Box>
          <Box>Profit component (INR):&nbsp; {calculatorProfit.profitComponent}</Box>
          <Box>Buying (INR):&nbsp; {calculatorProfit.buyingPriceINR}</Box>
          <Box sx={{ fontWeight: 700, color: displayProfitInr < 300 ? '#e57373' : '#81c784' }}>
            Net margin (INR):&nbsp; ₹{(displayProfitInr ?? 0).toFixed(2)}
          </Box>
        </Box>
      );
    }
    if (calculatorProfit) {
      return (
        <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: 1.8, p: 0.5 }}>
          <Box sx={{ opacity: 0.92, mb: 0.5 }}>Template pricing calculator (settlement model)</Box>
          <Box>Bought (basis, USD):&nbsp; ${Number(calculatorProfit.buyingPriceUSD ?? pricingBreakdown.buyingPriceUSD ?? 0).toFixed(2)}&nbsp; (cost + ship + tax on cost)</Box>
          <Box>Amazon cost (USD):&nbsp; ${Number(calculatorProfit.cost ?? pricingBreakdown.cost ?? 0).toFixed(2)}</Box>
          <Box>Sold (Start):&nbsp;&nbsp;&nbsp;&nbsp; ${soldPriceUsd.toFixed(2)}</Box>
          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box>Sold + tax (A):&nbsp; ${Number(calculatorProfit.soldPlusTax ?? 0).toFixed(2)}&nbsp; (Sold × (1 + saleTax/100))</Box>
          <Box>eBay fee (USD):&nbsp;&nbsp; ${Number(calculatorProfit.eBayFeeUsd ?? 0).toFixed(2)}</Box>
          <Box>ADS (USD):&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${Number(calculatorProfit.adsFeeUsd ?? 0).toFixed(2)}</Box>
          <Box>TDS (USD):&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${Number(calculatorProfit.tdsFeeUsd ?? 0).toFixed(2)}</Box>
          <Box>T.Cont (USD):&nbsp;&nbsp;&nbsp;&nbsp; ${Number(calculatorProfit.transactionContUsd ?? 0.24).toFixed(2)}</Box>
          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box>Net (USD):&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${Number(calculatorProfit.netUsd ?? 0).toFixed(2)}</Box>
          <Box>Payoneer (INR):&nbsp;&nbsp; ₹{Number(calculatorProfit.payoneerInr ?? 0).toFixed(2)}&nbsp; (Net × {calculatorProfit.payoutRate})</Box>
          <Box>Buying (INR):&nbsp;&nbsp;&nbsp;&nbsp; ₹{Number(calculatorProfit.buyingPriceINR ?? 0).toFixed(2)}&nbsp; (basis USD × {calculatorProfit.spentRate})</Box>
          {calculatorProfit.targetProfitINR != null && (
            <Box>Tier / target (INR):&nbsp; {calculatorProfit.targetProfitINR}</Box>
          )}
          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box sx={{ fontWeight: 700, color: displayProfitInr < 300 ? '#e57373' : '#81c784' }}>
            Net margin (INR):&nbsp; ₹{(displayProfitInr ?? 0).toFixed(2)}
          </Box>
        </Box>
      );
    }
    if (legacyActualProfit) {
      return (
        <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: 1.8, p: 0.5 }}>
          <Box sx={{ opacity: 0.92, mb: 0.5 }}>Estimate (no auto pricing row) — same fee rules as calculator defaults</Box>
          <Box>Bought (Amazon):&nbsp; ${actualProfitBuyingPrice.toFixed(2)}</Box>
          <Box>Sold (Start):&nbsp;&nbsp;&nbsp;&nbsp; ${soldPriceUsd.toFixed(2)}</Box>
          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box>A (sold+tax):&nbsp;&nbsp;&nbsp;&nbsp; ${legacyActualProfit.A.toFixed(2)}</Box>
          <Box>eBay Fee:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${legacyActualProfit.eBay.toFixed(2)}</Box>
          <Box>ADS:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${legacyActualProfit.ADS.toFixed(2)}</Box>
          <Box>TDS:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${legacyActualProfit.TDS.toFixed(2)}</Box>
          <Box>T.Cont:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${legacyActualProfit.TCont.toFixed(2)}</Box>
          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box>Net (USD):&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${legacyActualProfit.Net.toFixed(2)}&nbsp; (Sold − eBay − ADS − TDS − T.Cont)</Box>
          <Box>Amazon + Tax:&nbsp;&nbsp; ${legacyActualProfit.AmazonWithTax.toFixed(2)}</Box>
          <Box>Payoneer (INR):&nbsp;&nbsp; ₹{legacyActualProfit.Payoneer.toFixed(2)}&nbsp; (Net × {legacyActualProfit.payoutRate})</Box>
          <Box>Amazon Spend:&nbsp;&nbsp;&nbsp;&nbsp; ₹{legacyActualProfit.AmazonExpense.toFixed(2)}&nbsp; ((Amazon + Tax) × {legacyActualProfit.spentRate})</Box>
          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box sx={{ fontWeight: 700, color: legacyActualProfit.actualProfit < 300 ? '#e57373' : '#81c784' }}>
            Actual Profit:&nbsp;&nbsp;&nbsp;&nbsp; ₹{legacyActualProfit.actualProfit.toFixed(2)}
          </Box>
        </Box>
      );
    }
    return '';
  })();
  // Separate core fields and custom fields from template columns
  const coreFieldColumns = templateColumns.filter(col => col.type === 'core');
  const templateCustomFieldColumns = templateColumns.filter(col => col.type === 'custom');
  const customFieldColumns = (() => {
    if (templateCustomFieldColumns.length > 0) return templateCustomFieldColumns;
    const fields = itemData.customFields || {};
    return Object.keys(fields)
      .filter((key) => String(fields[key] ?? '').trim())
      .map((name) => ({
        name,
        label: String(name).replace(/^C:/i, '').trim() || name,
        type: 'custom',
      }));
  })();

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth={false}
      fullScreen={!showAmazonPreview}
      PaperProps={{
        sx: showAmazonPreview
          ? {
              position: 'fixed',
              right: 0,
              top: 0,
              width: '50vw',
              height: '100vh',
              maxHeight: '100vh',
              m: 0,
              borderRadius: 0,
              bgcolor: '#f5f5f5'
            }
          : {
              bgcolor: '#f5f5f5',
              height: '100vh'
            }
      }}
    >
      <DialogContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ 
          bgcolor: 'white', 
          p: showAmazonPreview ? 1 : 2, 
          borderBottom: 1, 
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: showAmazonPreview ? 'wrap' : 'nowrap',
          gap: showAmazonPreview ? 0.5 : 0
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: showAmazonPreview ? 0.5 : 2, flexWrap: 'wrap' }}>
            {!showAmazonPreview && (
              <Typography variant="h6">
                Review Generated Listings
              </Typography>
            )}
            <Chip 
              label={`${currentIndex + 1} / ${activeItems.length}`}
              color="primary"
              size="small"
            />
            {dismissedItems.size > 0 && (
              <Chip 
                label={`${dismissedItems.size} dismissed`}
                color="default"
                size="small"
                variant="outlined"
              />
            )}
            <Chip
              icon={getStatusIcon(currentItem?.status)}
              label={currentItem?.status || 'N/A'}
              color={getStatusColor(currentItem?.status)}
              size="small"
            />
            {scrapeSourceMeta && (
              <Tooltip title={scrapeSourceMeta.title}>
                <Chip
                  size="small"
                  variant="outlined"
                  color={scrapeSourceMeta.color}
                  label={scrapeSourceMeta.label}
                />
              </Tooltip>
            )}
            {(currentItem?.skuReallocated ||
              (currentItem?.sku && currentItem?.baseSku && currentItem.sku !== currentItem.baseSku)) && (
              <Tooltip title={`Base SKU ${currentItem.baseSku || ''} was taken — using ${currentItem.sku}`}>
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  icon={<WarningIcon />}
                  label={`SKU ${currentItem.sku}`}
                />
              </Tooltip>
            )}
          </Box>
          
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant={showAmazonPreview ? "contained" : "outlined"}
              onClick={toggleAmazonPreview}
              size="small"
              sx={{ whiteSpace: 'nowrap', fontSize: showAmazonPreview ? '0.7rem' : undefined }}
            >
              {showAmazonPreview ? '✓ Split' : 'Split View Amazon'}
            </Button>

            {showAmazonPreview && (
              <Button
                variant="outlined"
                size="small"
                sx={{ whiteSpace: 'nowrap', fontSize: '0.7rem' }}
                onClick={() => {
                  if (amazonWindowRef && !amazonWindowRef.closed) {
                    amazonWindowRef.focus();
                  }
                }}
              >
                ↗ Amazon
              </Button>
            )}
            
            {showAmazonPreview ? (
              <IconButton
                color="error"
                size="small"
                onClick={handleDismiss}
                disabled={!currentItem || activeItems.length === 0}
                title="Dismiss"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            ) : (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDismiss}
                disabled={!currentItem || activeItems.length === 0}
                size="small"
              >
                Dismiss
              </Button>
            )}
            {onListDirectly && (
              <Button
                variant="contained"
                color={hideSaveButton ? 'primary' : 'secondary'}
                size="small"
                onClick={() => {
                  const savableItems = activeItems.filter(
                    (item) => !['error', 'loading', 'blocked'].includes(item.status)
                  );
                  const listingsToSave = savableItems.map(item => {
                      const listingData = withAmazonScrapedPrice(
                        editedItems[item.id] || item.generatedListing,
                        item
                      );
                      if (item.status === 'duplicate_updateable') {
                        return {
                          ...listingData,
                          _isDuplicateUpdate: true,
                          _existingListingId: item.generatedListing?._existingListingId || listingData._existingListingId
                        };
                      }
                      return listingData;
                    });
                  notifySkuReallocations(savableItems);
                  onListDirectly(listingsToSave);
                }}
                disabled={saving || listableCount === 0}
                sx={{ fontSize: showAmazonPreview ? '0.7rem' : undefined, whiteSpace: 'nowrap' }}
              >
                {listDirectlyButtonLabel}
              </Button>
            )}
            {!hideSaveButton && onSave && (
            <Button
              variant="contained"
              startIcon={showAmazonPreview ? null : <SaveIcon />}
              onClick={handleSaveAll}
              size="small"
              disabled={saving || activeItems.every(i => ['error', 'loading', 'blocked'].includes(i.status))}
              sx={{ fontSize: showAmazonPreview ? '0.7rem' : undefined, whiteSpace: 'nowrap' }}
            >
              {saving ? 'Saving...' : `Save All (${activeItems.filter(i => !['error', 'loading', 'blocked'].includes(i.status)).length})`}
            </Button>
            )}
            <IconButton onClick={handleClose} size="small">
              <CloseIcon fontSize={showAmazonPreview ? 'small' : 'medium'} />
            </IconButton>
          </Box>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ bgcolor: 'white', px: showAmazonPreview ? 1 : 2, pb: 1 }}>
          <LinearProgress 
            variant="determinate" 
            value={activeItems.length > 0 ? ((currentIndex + 1) / activeItems.length) * 100 : 0}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        {/* Duplicate Notification */}
        {currentItem?.status === 'duplicate_updateable' && (
          <Box sx={{ px: showAmazonPreview ? 1 : 2, pt: showAmazonPreview ? 1 : 2 }}>
            <Alert severity="info" sx={{ mb: 1 }}>
              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight="bold">
                  📝 Editing Existing Listing
                </Typography>
                <Typography variant="caption">
                  You are editing an existing ASIN. Make any changes needed and click Save to update.
                </Typography>
                {currentItem.warnings?.map((warning, idx) => (
                  <Typography key={idx} variant="caption" color="text.secondary">
                    • {warning}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          </Box>
        )}

        {/* Warnings/Errors (exclude duplicate_updateable warnings since shown above) */}
        {(currentItem.warnings?.length > 0 || currentItem.errors?.length > 0) && currentItem?.status !== 'duplicate_updateable' && (
          <Box sx={{ px: showAmazonPreview ? 1 : 2, pt: showAmazonPreview ? 1 : 2 }}>
            {currentItem.errors?.map((error, idx) => (
              <Alert key={idx} severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            ))}
            {currentItem.warnings?.map((warning, idx) => (
              <Alert key={idx} severity="warning" sx={{ mb: 1 }}>
                {warning}
              </Alert>
            ))}
          </Box>
        )}

        {/* Main Content - Split Panel */}
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          gap: showAmazonPreview ? 0 : 2, 
          p: showAmazonPreview ? 0.5 : 2, 
          overflow: 'hidden'
        }}>
          {/* Left Panel - Amazon Source Data (hidden in split view mode) */}
          <Paper sx={{ 
            width: '40%', 
            p: 2, 
            overflow: 'auto',
            bgcolor: '#fafafa',
            display: showAmazonPreview ? 'none' : undefined
          }}>
            <Typography variant="h6" gutterBottom>
              Amazon Product Data
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {currentItem.status === 'loading' ? (
              // Loading skeleton for source data
              <Stack spacing={2}>
                <Box>
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" width="60%" />
                </Box>
                <Box>
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rectangular" height={40} />
                </Box>
                <Box>
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" width="50%" />
                </Box>
                <Box>
                  <Skeleton variant="text" width="25%" />
                  <Skeleton variant="text" width="40%" />
                </Box>
                <Box>
                  <Skeleton variant="rectangular" height={150} />
                </Box>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Skeleton variant="rectangular" height={120} />
                  </Grid>
                  <Grid item xs={6}>
                    <Skeleton variant="rectangular" height={120} />
                  </Grid>
                </Grid>
              </Stack>
            ) : currentItem.status === 'duplicate_updateable' ? (
              // Show metadata for existing listings
              <Stack spacing={2}>
                <Alert severity="info" variant="outlined">
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Existing Listing
                  </Typography>
                  <Typography variant="caption">
                    This ASIN already exists in your listings. Edit the fields on the right to update it.
                  </Typography>
                </Alert>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    ASIN
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {currentItem.asin}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    SKU
                  </Typography>
                  <Typography variant="body2">
                    {currentItem.sku}
                  </Typography>
                </Box>

                {currentItem.warnings?.map((warning, idx) => (
                  <Box key={idx}>
                    <Typography variant="caption" color="text.secondary">
                      {idx === 0 ? 'Status' : ''}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {warning}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : currentItem.sourceData ? (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    ASIN
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {currentItem.asin}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Original Title
                  </Typography>
                  <Typography variant="body2">
                    {currentItem.sourceData.title}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Brand
                  </Typography>
                  <Typography variant="body2">
                    {currentItem.sourceData.brand}
                  </Typography>
                </Box>

                {currentItem.sourceData?.color && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Color
                    </Typography>
                    <Typography variant="body2">
                      {currentItem.sourceData.color}
                    </Typography>
                  </Box>
                )}

                {currentItem.sourceData?.compatibility && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Compatibility
                    </Typography>
                    <Typography variant="body2">
                      {currentItem.sourceData.compatibility}
                    </Typography>
                  </Box>
                )}

                {currentItem.sourceData?.productInformation
                  && Object.keys(currentItem.sourceData.productInformation).length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Specifications
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                      {Object.entries(currentItem.sourceData.productInformation)
                        .filter(([key]) => !/^best[_]?sellers?[_]?rank$/i.test(String(key || '').replace(/\s+/g, '_')))
                        .map(([key, value]) => (
                        <Box key={key}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {key}
                          </Typography>
                          <Typography variant="body2">
                            {String(value ?? '').trim() || '—'}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Price
                  </Typography>
                  <Typography variant="body2">
                    ${currentItem.sourceData.price}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      fontSize: '0.875rem',
                      lineHeight: 1.6
                    }}
                  >
                    {currentItem.sourceData.description}
                  </Typography>
                </Box>

                {currentItem.sourceData?.review ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Reviews (from scraper)
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.6 }}
                    >
                      {currentItem.sourceData.review}
                    </Typography>
                  </Box>
                ) : null}

                {currentItem.sourceData?.images?.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Images ({currentItem.sourceData.images.length})
                    </Typography>
                    <Grid container spacing={1} sx={{ mt: 0.5 }}>
                      {currentItem.sourceData.images.map((img, idx) => (
                        <Grid item xs={6} key={idx}>
                          <Box
                            component="img"
                            src={img}
                            sx={{
                              width: '100%',
                              height: 120,
                              objectFit: 'contain',
                              border: 1,
                              borderColor: 'divider',
                              borderRadius: 1,
                              bgcolor: 'white'
                            }}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </Stack>
            ) : !currentItem.sourceData ? (
              <Stack spacing={2}>
                <Alert severity="info" variant="outlined">
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Existing Listing
                  </Typography>
                  <Typography variant="caption">
                    This is an existing listing from the directory. Edit any fields on the right, then click <strong>Save All</strong> to update or <strong>List Directly</strong> to proceed to listing.
                  </Typography>
                </Alert>
                {currentItem.asin && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">ASIN</Typography>
                    <Typography variant="body2" fontWeight="bold">{currentItem.asin}</Typography>
                  </Box>
                )}
                {currentItem.sku && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">SKU</Typography>
                    <Typography variant="body2">{currentItem.sku}</Typography>
                  </Box>
                )}
              </Stack>
            ) : (
              <Alert severity="error">
                Failed to load Amazon product data
              </Alert>
            )}
          </Paper>

          {/* Right Panel - Generated Listing (Editable) */}
          <Paper sx={{ 
            width: showAmazonPreview ? '100%' : '60%', 
            p: showAmazonPreview ? 1.5 : 2, 
            overflow: 'auto'
          }}>
            <Typography variant="h6" gutterBottom>
              Generated Listing
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {currentItem.status === 'loading' ? (
              // Loading skeleton for generated listing
              <Stack spacing={2}>
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={120} />
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={56} />
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Generating listing for ASIN: {currentItem.asin}
                  </Typography>
                </Box>
              </Stack>
            ) : currentItem.generatedListing ? (
              <Stack spacing={2}>
                {/* SKU */}
                <TextField
                  label="SKU (Custom Label)"
                  value={itemData.customLabel || ''}
                  size="small"
                  fullWidth
                  disabled
                  helperText="Auto-generated from ASIN"
                />

                {/* Core Fields */}
                {coreFieldColumns.map(col => {
                  // Special handling for description field with HTML preview
                  if (col.name === 'description') {
                    return (
                      <Box key={col.name}>
                        {/* Toggle Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight="500">
                            {col.label || 'Description'}
                          </Typography>
                          <ToggleButtonGroup
                            value={descriptionViewMode}
                            exclusive
                            onChange={(e, newMode) => newMode && setDescriptionViewMode(newMode)}
                            size="small"
                          >
                            <ToggleButton value="code">
                              <CodeIcon sx={{ fontSize: 16, mr: 0.5 }} />
                              Code
                            </ToggleButton>
                            <ToggleButton value="preview">
                              <VisibilityIcon sx={{ fontSize: 16, mr: 0.5 }} />
                              Preview
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}>
                          {showProfitChip && (
                            <Tooltip
                              title={profitTooltipContent}
                              placement="bottom-end"
                              arrow
                              componentsProps={{
                                tooltip: { sx: { maxWidth: 420, bgcolor: '#1a1a2e', color: '#fff' } },
                                arrow: { sx: { color: '#1a1a2e' } }
                              }}
                            >
                              <Chip
                                label={`Actual Profit: ₹${(displayProfitInr ?? 0).toFixed(2)}`}
                                size="small"
                                variant="outlined"
                                color={actualProfitColor}
                                sx={{ mt: 0.5, cursor: 'default' }}
                              />
                            </Tooltip>
                          )}
                        </Stack>

                        {/* Content Area */}
                        {descriptionViewMode === 'code' ? (
                          <TextField
                            value={itemData.description || ''}
                            onChange={(e) => handleFieldChange('description', e.target.value, false)}
                            multiline
                            rows={8}
                            size="small"
                            fullWidth
                            placeholder="<html>...</html>"
                            helperText={`HTML allowed • ${(itemData.description || '').length} characters`}
                          />
                        ) : (
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2,
                              minHeight: 200,
                              maxHeight: 400,
                              overflow: 'auto',
                              bgcolor: 'white',
                              border: '1px solid',
                              borderColor: 'divider',
                              '& img': { maxWidth: '100%', height: 'auto' },
                              '& table': { width: '100%', borderCollapse: 'collapse' },
                              '& td, & th': { border: '1px solid #ddd', padding: '8px' },
                              '& p': { margin: '0 0 8px 0' },
                              '& ul, & ol': { marginLeft: '20px' }
                            }}
                          >
                            {itemData.description ? (
                              <Box dangerouslySetInnerHTML={{ __html: itemData.description }} />
                            ) : (
                              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                No description generated
                              </Typography>
                            )}
                          </Paper>
                        )}
                      </Box>
                    );
                  }

                  // Title field — with rephrase button
                  if (col.name === 'title') {
                    return (
                      <Stack key="title" direction="row" alignItems="flex-start" spacing={1}>
                        <TextField
                          label={col.label || col.name}
                          value={itemData.title || ''}
                          onChange={(e) => handleFieldChange('title', e.target.value, false)}
                          size="small"
                          fullWidth
                          required
                          helperText={`${(itemData.title || '').length}/80`}
                          sx={{ flex: 1 }}
                        />
                        <Tooltip title="Rephrase title">
                          <span>
                            <IconButton
                              onClick={handleRephrase}
                              disabled={!itemData.title || !!rephrasing[currentItem.id]}
                              size="small"
                              sx={{ mt: 0.5 }}
                            >
                              {rephrasing[currentItem.id]
                                ? <CircularProgress size={18} />
                                : <AutorenewIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    );
                  }

                  // Start Price field — with Actual Profit chip
                  if (col.name === 'startPrice') {
                    return (
                      <Box key="startPrice">
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <TextField
                            label={col.label || col.name}
                            value={startPriceValue}
                            onChange={(e) => handleFieldChange('startPrice', e.target.value, false)}
                            size="small"
                            fullWidth
                            required
                            type="number"
                            disabled={!isStartPriceEditing}
                            sx={{
                              '& input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                              '& input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                              '& input[type=number]': { MozAppearance: 'textfield' },
                            }}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={isStartPriceEditing ? handleStartPriceSave : handleStartPriceEdit}
                            startIcon={isStartPriceEditing ? <SaveIcon fontSize="small" /> : <EditIcon fontSize="small" />}
                            sx={{ minWidth: 86, height: 40, flexShrink: 0 }}
                          >
                            {isStartPriceEditing ? 'Save' : 'Edit'}
                          </Button>
                        </Stack>
                      </Box>
                    );
                  }

                  // Regular fields
                  return (
                    <TextField
                      key={col.name}
                      label={col.label || col.name}
                      value={itemData[col.name] || ''}
                      onChange={(e) => handleFieldChange(col.name, e.target.value, false)}
                      size="small"
                      fullWidth
                      required={col.name === 'startPrice'}
                      type={col.name === 'startPrice' || col.name === 'quantity' ? 'number' : 'text'}
                      helperText={
                        col.name !== 'startPrice' && col.name !== 'quantity' ? `${(itemData[col.name] || '').length}/60` :
                        ''
                      }
                      {...(col.name === 'startPrice' && {
                        sx: {
                          '& input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                          '& input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                          '& input[type=number]': { MozAppearance: 'textfield' },
                        },
                      })}
                    />
                  );
                })}

                {/* Custom Fields */}
                {customFieldColumns.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }}>
                      <Chip label="Item Specifications" size="small" />
                    </Divider>

                    {customFieldColumns.map(col => (
                      <TextField
                        key={col.name}
                        label={col.label || col.name}
                        value={itemData.customFields?.[col.name] || ''}
                        onChange={(e) => handleFieldChange(col.name, e.target.value, true)}
                        multiline={col.name.toLowerCase().includes('description')}
                        rows={col.name.toLowerCase().includes('description') ? 4 : 1}
                        size="small"
                        fullWidth
                        helperText={`${(itemData.customFields?.[col.name] || '').length}/60`}
                      />
                    ))}
                  </>
                )}

                {/* Pricing Calculation Info */}
                {currentItem.pricingCalculation?.enabled && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                      Pricing Breakdown
                    </Typography>
                    <Typography variant="caption" display="block">
                      Amazon Cost: {currentItem.pricingCalculation.amazonCost}
                    </Typography>
                    {currentItem.pricingCalculation.breakdown?.profitTier?.enabled ? (
                      <Typography variant="caption" display="block" sx={{ color: 'success.main', fontWeight: 600 }}>
                        Profit (Tier): {currentItem.pricingCalculation.breakdown.profitTier.profit} INR
                        {currentItem.pricingCalculation.breakdown.profitTier.costRange && 
                          ` (${currentItem.pricingCalculation.breakdown.profitTier.costRange})`
                        }
                      </Typography>
                    ) : (
                      <Typography variant="caption" display="block">
                        Profit: {currentItem.pricingCalculation.breakdown?.desiredProfit || currentItem.pricingCalculation.breakdown?.applicableProfit} INR
                      </Typography>
                    )}
                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mt: 0.5 }}>
                      Calculated Start Price: ${currentItem.pricingCalculation.calculatedStartPrice}
                    </Typography>
                  </Alert>
                )}
              </Stack>
            ) : (
              <Alert severity="error">
                Failed to generate listing data
              </Alert>
            )}
          </Paper>
        </Box>

        {/* Footer - Navigation */}
        <Box sx={{ 
          bgcolor: 'white', 
          p: showAmazonPreview ? 1 : 2, 
          borderTop: 1, 
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Button
            startIcon={<PrevIcon />}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            size={showAmazonPreview ? 'small' : 'medium'}
          >
            {showAmazonPreview ? 'Prev' : 'Previous'}
          </Button>
          
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: showAmazonPreview ? '0.7rem' : undefined }}>
            {showAmazonPreview ? '← →' : 'Use arrow keys to navigate'}
          </Typography>
          
          <Button
            endIcon={<NextIcon />}
            onClick={handleNext}
            disabled={currentIndex === activeItems.length - 1}
            size={showAmazonPreview ? 'small' : 'medium'}
          >
            Next
          </Button>
        </Box>
      </DialogContent>
      <Snackbar
        open={skuToast.open}
        autoHideDuration={8000}
        onClose={() => setSkuToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => setSkuToast((prev) => ({ ...prev, open: false }))}
          sx={{ maxWidth: 560 }}
        >
          {skuToast.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
