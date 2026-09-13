const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Imported sheet dates were stored as YYYY-MM-DD with day/month flipped
 * whenever the day is 01–12. Swap those; leave day 13–31 as written.
 */
export function swapAmbiguousIsoDayMonth(value) {
  const text = String(value || '').trim();
  const match = text.match(ISO_DATE);
  if (!match) return text;

  const year = match[1];
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (day >= 1 && day <= 12 && month >= 1 && month <= 12) {
    return `${year}-${pad2(day)}-${pad2(month)}`;
  }
  return text.slice(0, 10);
}

export function formatSheetDateDmy(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';

  const iso = text.match(ISO_DATE);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const dayMonthYear = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dayMonthYear) {
    let year = dayMonthYear[3];
    if (year.length === 2) year = `20${year}`;
    return `${pad2(dayMonthYear[1])}-${pad2(dayMonthYear[2])}-${year}`;
  }

  return text;
}
