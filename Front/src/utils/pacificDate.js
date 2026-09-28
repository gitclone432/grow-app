// Calendar-date helpers for the stats pages that report in Pacific time
// (America/Los_Angeles, PDT/PST) — Feed Upload Stats, Daily Listing Comparison,
// Precheck Stats, AI Listing Usage and Precheck AI Usage. Their endpoints read
// startDate / endDate as Pacific calendar days, so "today" has to be the
// Pacific date too: deriving it from toISOString() gives the UTC date, which
// runs ahead of Pacific by 7-8 hours and made the default day empty (or
// yesterday's) every morning IST.
export const REPORT_TIMEZONE = 'America/Los_Angeles';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIMEZONE,
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit',
  timeZoneName: 'short'
});

export function toPacificDateString(date = new Date()) {
  return dateFmt.format(date);
}

// Arithmetic on the Pacific calendar date, not the instant: subtracting
// days x 24h lands on the wrong date during the 25-hour fall-back day and the
// 23-hour spring-forward day.
export function pacificDaysAgoString(days, from = new Date()) {
  const [year, month, day] = toPacificDateString(from).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

// e.g. "9/18/2026, 12:50:03 PM PDT" — the zone is spelled out because the
// viewer's browser is usually in IST.
export function formatPacificDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return dateTimeFmt.format(date);
}
