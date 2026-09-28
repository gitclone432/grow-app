/**
 * Date-window helpers shared by the precheck stats, precheck exclusion history
 * and AI usage report endpoints.
 *
 * These pages all group days in America/Los_Angeles (PDT/PST) — the same
 * calendar the Feed Upload Stats and Daily Listing Comparison pages use — so
 * explicit date filters must use that timezone's midnight as the day boundary.
 * The two-pass offset technique stays correct across the DST switch.
 */

export const PRECHECK_STATS_TIMEZONE = 'America/Los_Angeles';

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;

function zoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
}

export function zonedMidnightUtc(dateStr, timeZone) {
  const naive = new Date(`${dateStr}T00:00:00Z`);
  const offset = zoneOffsetMs(naive, timeZone);
  let utc = new Date(naive.getTime() - offset);
  const refined = zoneOffsetMs(utc, timeZone);
  if (refined !== offset) utc = new Date(naive.getTime() - refined);
  return utc;
}

export function nextDateStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Last instant of `dateStr` in `timeZone`, for inclusive `$lte` bounds. */
export function zonedDayEndUtc(dateStr, timeZone) {
  return new Date(zonedMidnightUtc(nextDateStr(dateStr), timeZone).getTime() - 1);
}

const DATE_TIME_STR_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A wall-clock `YYYY-MM-DDTHH:mm[:ss]` in `timeZone` as a UTC instant, or null
 * when the value is not in that shape (an ISO string with a zone, say).
 */
export function zonedDateTimeUtc(dateTimeStr, timeZone) {
  const match = String(dateTimeStr || '').match(DATE_TIME_STR_RE);
  if (!match) return null;
  const [, dateStr, hour, minute, second = '0'] = match;
  const naive = new Date(`${dateStr}T${hour}:${minute}:${second.padStart(2, '0')}Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const offset = zoneOffsetMs(naive, timeZone);
  let utc = new Date(naive.getTime() - offset);
  const refined = zoneOffsetMs(utc, timeZone);
  if (refined !== offset) utc = new Date(naive.getTime() - refined);
  return utc;
}

/**
 * Resolve a request's date filter to a `createdAt` window. Explicit
 * `startDate`/`endDate` (YYYY-MM-DD, inclusive, in the stats timezone) win;
 * `endDate` alone defaults to `startDate` (a single day). Otherwise a rolling
 * `days` window ending now, clamped to 1–365, default 30.
 *
 * @returns {{ match: { $gte: Date, $lt?: Date }, rangeInfo: object } | { error: string }}
 */
export function resolvePrecheckDateWindow(query = {}) {
  const startDateParam = DATE_STR_RE.test(String(query.startDate || '')) ? String(query.startDate) : null;
  const endDateParam = DATE_STR_RE.test(String(query.endDate || '')) ? String(query.endDate) : startDateParam;

  if (startDateParam) {
    const from = zonedMidnightUtc(startDateParam, PRECHECK_STATS_TIMEZONE);
    const toExclusive = zonedMidnightUtc(nextDateStr(endDateParam), PRECHECK_STATS_TIMEZONE);
    if (toExclusive <= from) {
      return { error: 'endDate must be on or after startDate' };
    }
    return {
      match: { $gte: from, $lt: toExclusive },
      rangeInfo: { mode: 'range', startDate: startDateParam, endDate: endDateParam }
    };
  }

  const days = Math.min(365, Math.max(1, Number.parseInt(query.days, 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    match: { $gte: since },
    rangeInfo: { mode: 'rolling', days, since: since.toISOString() }
  };
}
