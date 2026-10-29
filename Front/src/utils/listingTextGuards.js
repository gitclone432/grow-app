// Mirror of Back/src/utils/listingTextGuards.js — keep the two files identical.
/**
 * Guards applied to AI-generated listing text: no warranty/guarantee claims
 * (the seller does not honour Amazon/manufacturer warranties) and no brand
 * names in titles.
 */

const WARRANTY_RE = /warrant(?:y|ies)|guarantee[sd]?\b|money[- ]back/i;
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;

export const NO_WARRANTY_PROMPT_RULE =
  'Never mention warranty, warranties, guarantee, or money-back terms anywhere in the output, even if the source does.';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripWarrantySentences(text) {
  return String(text || '')
    .split(SENTENCE_SPLIT_RE)
    .filter((sentence) => !WARRANTY_RE.test(sentence))
    .join(' ')
    .trim();
}

/** Plain-text source (Amazon description / reviews): drop lines and sentences about warranty. */
export function stripWarrantyFromText(text) {
  if (!text || !WARRANTY_RE.test(text)) return text || '';
  return String(text)
    .split(/\r?\n/)
    .map((line) => (WARRANTY_RE.test(line) ? stripWarrantySentences(line) : line))
    .filter((line, idx, lines) => line.trim() || (idx > 0 && lines[idx - 1].trim()))
    .join('\n')
    .trim();
}

/** Remove product-information rows such as "Manufacturer Warranty Description". */
export function stripWarrantyFromProductInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return info;
  return Object.fromEntries(Object.entries(info).filter(([key]) => !WARRANTY_RE.test(key)));
}

/**
 * Generated description HTML: drop warranty sentences inside each <li>/<p>,
 * and drop the element entirely when nothing meaningful is left.
 */
export function stripWarrantyFromHtml(html) {
  if (!html || typeof html !== 'string' || !WARRANTY_RE.test(html)) return html || '';

  const cleaned = html.replace(/<(li|p)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (full, tag, attrs = '', inner) => {
    if (!WARRANTY_RE.test(inner)) return full;
    const remaining = stripWarrantySentences(inner);
    const textOnly = remaining.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    // A lone "Label:" with nothing after it is not worth keeping
    if (!textOnly || /^[^.!?]{0,60}:$/.test(textOnly)) return '';
    return `<${tag}${attrs}>${remaining}</${tag}>`;
  });

  // Anything left outside list/paragraph elements (plain-text descriptions)
  return WARRANTY_RE.test(cleaned.replace(/<[^>]*>/g, ' ')) && !/<[a-z][\s\S]*>/i.test(cleaned)
    ? stripWarrantyFromText(cleaned)
    : cleaned;
}

/** Remove every occurrence of the given brand/manufacturer names from a title. */
export function stripBrandNames(title, names = []) {
  return replaceBrandNames(title, names)
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,\-â€“:|/]+|[\s,\-â€“:|/]+$/g, '')
    .trim();
}

export function titleContainsBrand(title, names = []) {
  return stripBrandNames(title, names) !== String(title || '').trim();
}

const GENERIC_BRAND_VALUES = new Set(['generic', 'unbranded', 'unknown', 'does not apply', 'n/a', 'na', 'none', 'other']);

export const NO_BRAND_PROMPT_RULE =
  'Never mention any brand, manufacturer, or store name anywhere in the output; refer to the item generically (e.g. "these mud flaps").';

/** Brand + manufacturer names known for an Amazon product (skips placeholders like "Generic"). */
export function collectBrandNames(data = {}) {
  const names = [data?.brand, data?.manufacturer];
  const info = data?.productInformation;
  if (info && typeof info === 'object' && !Array.isArray(info)) {
    for (const [key, value] of Object.entries(info)) {
      if (/^\s*(brand|brand name|manufacturer)\s*$/i.test(key)) names.push(value);
    }
  }
  return [...new Set(
    names
      .map((name) => String(name || '').trim())
      .filter((name) => name.length >= 2 && !GENERIC_BRAND_VALUES.has(name.toLowerCase()))
  )];
}

/** Drop brand/manufacturer rows from Amazon product information. */
export function stripBrandFromProductInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return info;
  return Object.fromEntries(
    Object.entries(info).filter(([key]) => !/brand|manufacturer/i.test(key))
  );
}

/** Remove brand names from plain text, keeping line breaks. */
export function stripBrandFromText(text, names = []) {
  if (!text || !names.length) return text || '';
  return String(text)
    .split(/\r?\n/)
    .map((line) => removeBrandFromSegment(line, names, false))
    .join('\n');
}

/** Remove brand names from the text of an HTML fragment only (tags/attributes/URLs untouched). */
export function stripBrandFromHtml(html, names = []) {
  if (!html || typeof html !== 'string' || !names.length) return html || '';
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : removeBrandFromSegment(part, names, true)))
    .join('');
}

function removeBrandFromSegment(segment, names, keepEdges) {
  const replaced = replaceBrandNames(segment, names);
  if (replaced === segment) return segment;
  const brandWasLeading = /^\s/.test(replaced) && !/^\s/.test(segment);
  return tidyAfterBrandRemoval(replaced, keepEdges, brandWasLeading);
}

function replaceBrandNames(text, names = []) {
  let result = String(text || '');
  const unique = [...new Set(
    names.map((name) => String(name || '').trim()).filter((name) => name.length >= 2)
  )].sort((a, b) => b.length - a.length);

  for (const name of unique) {
    const pattern = escapeRegExp(name).replace(/(?:\\?[\s-])+/g, '[\\s-]*');
    result = result.replace(
      new RegExp(`(?:\\b(?:by|from)\\s+)?(?<![A-Za-z0-9])${pattern}(?:['â€™]s)?(?![A-Za-z0-9])`, 'gi'),
      ' '
    );
  }
  return result;
}

/** Collapse the gaps a removed brand leaves; keep edge whitespace for HTML text nodes. */
function tidyAfterBrandRemoval(text, keepEdges = false, capitalize = false) {
  const lead = keepEdges && /^\s/.test(text) && !capitalize ? ' ' : '';
  const trail = keepEdges && /\s$/.test(text) ? ' ' : '';
  let body = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  // "A-Premium mud flaps areâ€¦" â†’ "Mud flaps areâ€¦"
  if (capitalize) body = body.replace(/^[a-z]/, (c) => c.toUpperCase());
  return body ? `${lead}${body}${trail}` : (lead || trail);
}
