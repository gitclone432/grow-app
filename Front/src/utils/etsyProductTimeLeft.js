/** Etsy listing time-left: expiry date = listed date + 4 months. */

export const LISTING_DURATION_MONTHS = 4;

export const LISTED_DATE_TIME_LEFT_TRIGGER = 'listedDate';

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseListedDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const parsed = new Date(`${text.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function addCalendarMonths(date, months) {
  const next = new Date(date.getTime());
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) {
    next.setDate(0);
  }
  return startOfDay(next);
}

function formatDisplayDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeTimeLeftFromListedDate(listedDate) {
  const listed = parseListedDate(listedDate);
  if (!listed) return '';

  const expiry = addCalendarMonths(listed, LISTING_DURATION_MONTHS);
  const dateText = formatDisplayDate(expiry);

  if (expiry <= startOfDay(new Date())) {
    return `Expired (${dateText})`;
  }

  return dateText;
}

export function enrichEtsyProductRow(product = {}) {
  return {
    ...product,
    timeLeft: computeTimeLeftFromListedDate(product.listedDate),
  };
}
