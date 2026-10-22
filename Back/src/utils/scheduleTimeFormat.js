// scheduleTime is stored as an IST wall-clock string ("YYYY-MM-DD HH:MM:SS").
// eBay File Exchange expects Schedule time in GMT, so convert when writing CSVs.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const STORED_FORMAT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function istScheduleToEbayUtc(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const m = raw.match(STORED_FORMAT);
  if (!m) return raw;
  const istAsUtcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return new Date(istAsUtcMs - IST_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}
