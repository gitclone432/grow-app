const WEEKDAY_DATE_RE =
  /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?/i;
const TODAY_TOMORROW_RE =
  /(?:Today|Tomorrow)(?:,?\s+[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?)?/i;
const DATE_RE = new RegExp(`${TODAY_TOMORROW_RE.source}|${WEEKDAY_DATE_RE.source}`, 'i');

function collapseSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractDate(chunk) {
  const text = collapseSpaces(chunk);
  if (!text) return '';
  const afterDelivery = text.match(/delivery\s+(.+)/i);
  const source = afterDelivery ? afterDelivery[1] : text;
  const match = source.match(DATE_RE);
  return match ? collapseSpaces(match[0]) : '';
}

/**
 * Shorten ScrapingDog Amazon search delivery text.
 * "Join Prime to get FREE delivery Fri, Aug 28 Or Non-members get FREE delivery Mon, Aug 31 ..."
 * → "prime delivery Fri, Aug 28  non prime delivery Mon, Aug 31"
 */
export function formatAmazonDelivery(raw) {
  const text = collapseSpaces(raw);
  if (!text) return '';

  const parts = text.split(/\s+Or\s+Non-members?\s+get\s+/i);
  if (parts.length >= 2) {
    const primeDate = extractDate(parts[0]);
    const nonPrimeDate = extractDate(parts[1]);
    const out = [];
    if (primeDate) out.push(`prime delivery ${primeDate}`);
    if (nonPrimeDate) out.push(`non prime delivery ${nonPrimeDate}`);
    if (out.length) return out.join('  ');
  }

  const date = extractDate(text);
  if (!date) return text;
  if (/prime/i.test(text) && !/non[- ]?member/i.test(text)) {
    return `prime delivery ${date}`;
  }
  return `delivery ${date}`;
}
