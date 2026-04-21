/**
 * ASIN Parser Utility
 * 
 * Handles parsing of Amazon ASINs from various input formats:
 * - Comma-separated: B08N5WRWNW, B09G9HD6PD
 * - Newline-separated: B08N5WRWNW\nB09G9HD6PD (Excel/Sheets)
 * - Space-separated: B08N5WRWNW B09G9HD6PD
 * - Tab-separated: B08N5WRWNW\tB09G9HD6PD
 * - Numbered lists: 1. B08N5WRWNW\n2. B09G9HD6PD
 * - Bullet points: • B08N5WRWNW\n• B09G9HD6PD
 * - Mixed delimiters: Any combination of the above
 */

/**
 * Validate ASIN format
 * ASINs must be exactly 10 alphanumeric characters
 * 
 * @param {string} asin - ASIN to validate
 * @returns {boolean} - True if valid ASIN format
 */
export function isValidAsin(asin) {
  if (!asin || typeof asin !== 'string') {
    return false;
  }
  
  // Must be exactly 10 alphanumeric characters (uppercase)
  return /^[A-Z0-9]{10}$/.test(asin);
}

/**
 * Clean ASIN string by removing common prefixes, formatting, and normalizing
 * 
 * @param {string} token - Raw token to clean
 * @returns {string} - Cleaned ASIN candidate
 */
export function cleanAsin(token) {
  if (!token || typeof token !== 'string') {
    return '';
  }
  
  let cleaned = token
    // Remove numbering: "1. ", "2. ", "10. ", etc.
    .replace(/^[\d]+\.\s*/, '')
    // Remove bullet points: "• ", "- ", "* ", "→ "
    .replace(/^[•\-\*→]\s*/, '')
    // Remove ASIN label: "ASIN: ", "asin: "
    .replace(/^ASIN:\s*/i, '')
    // Remove product/item labels: "Product: ", "Item: "
    .replace(/^(Product|Item):\s*/i, '')
    // Remove leading quotes/apostrophes
    .replace(/^['"`]+/g, '')
    // Remove trailing quotes/apostrophes
    .replace(/['"`]+$/g, '')
    // Remove parentheses
    .replace(/[()]/g, '')
    // Remove brackets
    .replace(/[\[\]]/g, '')
    // Remove any remaining non-alphanumeric characters
    .replace(/[^\w]/g, '')
    // Trim whitespace
    .trim()
    // Convert to uppercase
    .toUpperCase();
  
  return cleaned;
}

/**
 * Parse ASINs from various input formats
 * Automatically handles multiple delimiters and formats
 * 
 * @param {string} input - Raw input string containing ASINs
 * @returns {string[]} - Array of clean, deduplicated, uppercase ASINs
 */
export function parseAsins(input) {
  if (!input || typeof input !== 'string') {
    return [];
  }
  
  // Step 1: Normalize all delimiters to newlines
  // Replace commas, semicolons, tabs, pipes with newlines
  let normalized = input
    .replace(/[,;\t|]/g, '\n')
    // Replace multiple spaces with single space
    .replace(/\s{2,}/g, ' ');
  
  // Step 2: Split by newlines and spaces
  const tokens = normalized
    .split(/[\n\r\s]+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);
  
  // Step 3: Clean each token
  const cleanedTokens = tokens.map(token => cleanAsin(token));
  
  // Step 4: Filter valid ASINs
  const validAsins = cleanedTokens.filter(token => isValidAsin(token));
  
  // Step 5: Deduplicate while preserving order
  const uniqueAsins = [...new Set(validAsins)];
  
  return uniqueAsins;
}

/**
 * Get parsing statistics for user feedback
 * 
 * @param {string} input - Raw input string
 * @returns {object} - Parsing statistics
 *   - total: Total number of tokens found
 *   - valid: Number of valid ASINs
 *   - invalid: Number of invalid tokens
 *   - duplicates: Number of duplicate ASINs removed
 *   - uniqueValid: Number of unique valid ASINs
 */
export function getParsingStats(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return {
      total: 0,
      valid: 0,
      invalid: 0,
      duplicates: 0,
      uniqueValid: 0
    };
  }
  
  // Normalize and split
  const normalized = input.replace(/[,;\t|]/g, '\n');
  const tokens = normalized
    .split(/[\n\r\s]+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);
  
  // Clean tokens
  const cleaned = tokens.map(token => cleanAsin(token));
  
  // Filter valid
  const valid = cleaned.filter(token => isValidAsin(token));
  
  // Get unique
  const unique = [...new Set(valid)];
  
  return {
    total: tokens.length,
    valid: valid.length,
    invalid: tokens.length - valid.length,
    duplicates: valid.length - unique.length,
    uniqueValid: unique.length
  };
}

/**
 * Validate if input contains at least one valid ASIN
 * 
 * @param {string} input - Raw input string
 * @returns {boolean} - True if at least one valid ASIN found
 */
export function hasValidAsins(input) {
  const asins = parseAsins(input);
  return asins.length > 0;
}

/**
 * Get user-friendly error message based on parsing stats
 * 
 * @param {string} input - Raw input string
 * @param {number} maxAsins - Maximum ASINs allowed (default: 100)
 * @returns {string|null} - Error message or null if valid
 */
export function getValidationError(input, maxAsins = 100) {
  if (!input || !input.trim()) {
    return 'Please enter at least one ASIN';
  }
  
  const stats = getParsingStats(input);
  
  if (stats.uniqueValid === 0) {
    if (stats.total > 0) {
      return 'No valid ASINs found. ASINs must be 10 alphanumeric characters.';
    }
    return 'Please enter at least one ASIN';
  }
  
  if (stats.uniqueValid > maxAsins) {
    return `Maximum ${maxAsins} ASINs allowed per batch (found ${stats.uniqueValid})`;
  }
  
  return null;
}
