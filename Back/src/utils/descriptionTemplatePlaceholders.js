function formatBulletLi(text, isLast = false) {
  let cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/<[\w!/?]/.test(cleaned)) {
    cleaned = stripHtmlTagsToPlain(cleaned);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  }
  if (!cleaned) return '';
  if (cleaned.length > 620) cleaned = `${cleaned.slice(0, 617)}...`;
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
    .replace(/\n+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function stylePlainBulletLines(lines = []) {
  const parts = (Array.isArray(lines) ? lines : [])
    .map((s) => String(s || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
  return parts
    .map((line, idx, arr) => formatBulletLi(line, idx === arr.length - 1))
    .filter(Boolean)
    .join('');
}

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

export function hasUnsubstitutedPlaceholders(html = '') {
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
  const inner = String(ulInner || '');
  const lis = inner.match(/<li[\s\S]*?<\/li>/gi) || [];
  if (lis.length) {
    const plains = filterProductBullets(lis)
      .map((li) => stripHtmlTagsToPlain(li).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const styled = stylePlainBulletLines(plains);
    if (styled) return styled;
  }
  // AI sometimes dumps plain prose / <p> into the highlights <ul>
  return bulletsFromPlainLines(stripHtmlTagsToPlain(inner), 8);
}

function normalizeAiFeatureBullets(aiDescription = '') {
  const text = String(aiDescription || '').trim();
  if (!text) return '';
  if (hasUnsubstitutedPlaceholders(text)) return '';

  const ulScoped = text.match(/<ul[^>]*>([\s\S]*?)<\/ul>/gi) || [];
  for (let i = 0; i < ulScoped.length; i++) {
    const innerMatch = ulScoped[i].match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    if (!innerMatch) continue;
    const chunk = bulletsFromUlBlock(innerMatch[1]);
    if (chunk) return chunk;
  }

  const looseLis = text.match(/<li[\s\S]*?<\/li>/gi) || [];
  if (looseLis.length) {
    const plains = filterProductBullets(looseLis)
      .map((li) => stripHtmlTagsToPlain(li).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const styled = stylePlainBulletLines(plains);
    if (styled) return styled;
  }

  if (looksLikeListingShellEcho(text)) {
    return '';
  }
  if (text.length > 2000 && /<div\b|<table\b/i.test(text)) {
    return bulletsFromPlainLines(stripHtmlTagsToPlain(text), 8);
  }

  return bulletsFromPlainLines(stripHtmlTagsToPlain(text) || text, 8);
}

function bulletsFromPlainLines(plain, maxItems = 8) {
  const source = String(plain || '').trim();
  if (!source) return '';
  let parts = source
    .split(/\r?\n|[•●▪‣]/g)
    .map((s) => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean);

  // Prose blob → one bullet per sentence so Product Highlights isn't a wall of text
  if (parts.length === 1 && /\.\s+/.test(parts[0])) {
    const sentences = parts[0]
      .split(/\.\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    if (sentences.length > 1) {
      parts = sentences.map((s) => (/\.\s*$/.test(s) ? s : `${s}.`));
    }
  }
  return stylePlainBulletLines(parts.slice(0, maxItems));
}

function buildFallbackFeatureBullets(rawDescription = '') {
  return bulletsFromPlainLines(stripHtmlTagsToPlain(rawDescription) || rawDescription, 8);
}

function extractProductHighlightsUlInner(html = '') {
  const match = String(html || '').match(
    /Product Highlights[\s\S]{0,500}?<ul[^>]*>([\s\S]*?)<\/ul>/i
  );
  return match ? match[1] : null;
}

function hasStyledFeatureBullets(ulInner = '') {
  const inner = String(ulInner || '');
  return /<li\b/i.test(inner) && /(?:&#9658;|▶)/.test(inner);
}

/** Fix Product Highlights when AI/plain text was dumped into the <ul> without styled bullets. */
export function repairProductHighlightsInDescription(html = '', fallbackPlain = '') {
  const composed = String(html || '');
  if (!composed || !/Product Highlights/i.test(composed)) return composed;

  const inner = extractProductHighlightsUlInner(composed);
  if (inner == null) return composed;
  if (hasStyledFeatureBullets(inner)) return composed;

  const repaired =
    normalizeAiFeatureBullets(inner)
    || normalizeAiFeatureBullets(fallbackPlain)
    || buildFallbackFeatureBullets(fallbackPlain)
    || bulletsFromPlainLines(stripHtmlTagsToPlain(inner), 8);

  if (!repaired) return composed;

  return composed.replace(
    /(Product Highlights[\s\S]{0,500}?<ul[^>]*>)([\s\S]*?)(<\/ul>)/i,
    `$1${repaired}$3`
  );
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

  // Never inject raw AI prose into the template — always styled <li> bullets.
  const sanitizedDescriptionPlaceholder =
    resolvedBullets
    || buildFallbackFeatureBullets(scrapedDescription)
    || bulletsFromPlainLines(stripHtmlTagsToPlain(aiDescription), 8);

  const titleClean = String(sourceData?.title || generatedListing?.title || '').trim();
  const images = resolveListingImageUrls(sourceData, generatedListing);

  const placeholderMap = {
    '{{AI_FEATURE_BULLETS}}': sanitizedDescriptionPlaceholder,
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

  return repairProductHighlightsInDescription(
    composed,
    scrapedDescription || stripHtmlTagsToPlain(aiDescription)
  );
}

export function applyDescriptionTemplatePlaceholders(templateHtml, listingPayload, amazonData, aiDescriptionRaw = '') {
  return applyStoreTemplatePlaceholders(templateHtml, listingPayload, amazonData || {}, aiDescriptionRaw);
}
