/**
 * Expand spreadsheet scientific notation (e.g. 8.72224E+11) into a plain
 * digit string. Alphanumeric values (UPS 1Z..., etc.) are left unchanged.
 */
export function normalizeIdentifierString(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-') return '';

  const sciMatch = raw.toUpperCase().match(/^([+-]?)(\d+(?:\.\d+)?)[E]([+-]?\d+)$/);
  if (sciMatch) {
    const sign = sciMatch[1] === '-' ? '-' : '';
    const [whole, frac = ''] = sciMatch[2].split('.');
    const digits = whole + frac;
    const decimalLen = whole.length;
    const exponent = parseInt(sciMatch[3], 10);
    const targetLen = decimalLen + exponent;

    if (exponent >= 0) {
      if (targetLen <= digits.length) {
        const intDigits = digits.slice(0, targetLen);
        const remainder = digits.slice(targetLen).replace(/0+$/, '');
        return sign + intDigits + (remainder ? `.${remainder}` : '');
      }
      return sign + digits + '0'.repeat(targetLen - digits.length);
    }
    return raw;
  }

  if (/^\d+\.0+$/.test(raw)) {
    return raw.split('.')[0];
  }

  return raw;
}
