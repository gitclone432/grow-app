/**
 * Generates SKU using company format: GRW25 + last 5 chars of ASIN
 * @param {string} asin - Amazon Standard Identification Number
 * @returns {string} Generated SKU (e.g., 'GRW25WRWNW')
 */
export const generateSKUFromASIN = (asin) => {
  if (!asin || typeof asin !== 'string') return '';
  
  const cleanASIN = asin.trim().toUpperCase();
  
  if (cleanASIN.length < 5) {
    console.warn(`ASIN "${asin}" is too short for SKU generation`);
    return cleanASIN; // Return as-is if too short
  }
  
  return 'GRW25' + cleanASIN.slice(-5);
};

/**
 * Generates SKU with count suffix for repeat listings of the same ASIN.
 * count = 0 → first listing  → no suffix   (GRW25XXXXX)
 * count = 1 → second listing → GRW25XXXXX-1
 * count = N →                → GRW25XXXXX-N
 */
export const generateSKUWithCount = (asin, currentCount) => {
  const base = generateSKUFromASIN(asin);
  if (!currentCount || currentCount === 0) return base;
  return `${base}-${currentCount}`;
};

/**
 * Pick the next free SKU for an ASIN: base, then base-1, base-2, ...
 * Mutates `takenSkus` by adding the allocated value.
 */
export const allocateUniqueSKU = (asin, takenSkus, startCount = 0) => {
  const base = generateSKUFromASIN(asin);
  if (!base) return '';

  let n = Math.max(0, Number(startCount) || 0);
  for (let guard = 0; guard < 10000; guard++) {
    const candidate = n === 0 ? base : `${base}-${n}`;
    if (!takenSkus.has(candidate)) {
      takenSkus.add(candidate);
      return candidate;
    }
    n += 1;
  }

  const fallback = `${base}-${Date.now()}`;
  takenSkus.add(fallback);
  return fallback;
};

/**
 * Validates if a string is a valid ASIN format
 * @param {string} asin - String to validate
 * @returns {boolean} True if valid ASIN format
 */
export const isValidASIN = (asin) => {
  if (!asin || typeof asin !== 'string') return false;
  const cleanASIN = asin.trim();
  // ASINs are typically 10 characters, alphanumeric
  return /^[A-Z0-9]{10}$/i.test(cleanASIN);
};
