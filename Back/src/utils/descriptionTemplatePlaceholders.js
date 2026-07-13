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
  const lis = String(ulInner || '').match(/<li[\s\S]*?<\/li>/gi) || [];
  const good = filterProductBullets(lis).filter(Boolean);
  return good.length ? good.join('') : '';
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

export function applyDescriptionTemplatePlaceholders(templateHtml, listingPayload, amazonData, aiDescriptionRaw = '') {
  return applyStoreTemplatePlaceholders(templateHtml, listingPayload, amazonData || {}, aiDescriptionRaw);
}
