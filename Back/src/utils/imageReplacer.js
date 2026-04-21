/**
 * Image Placeholder Replacement Utility
 * 
 * Handles replacement of image placeholders in HTML content with actual Amazon image URLs.
 * This allows AI to generate HTML templates with predictable placeholders without wasting
 * tokens on long image URLs.
 * 
 * Supported placeholders:
 * - {image_main} -> images[0]
 * - {image_sub1} -> images[1]
 * - {image_sub2} -> images[2]
 * - ... up to {image_sub7} -> images[7]
 */

/**
 * Replace image placeholders in HTML content with actual image URLs
 * @param {string} htmlContent - HTML content containing image placeholders
 * @param {Array<string>} imageUrls - Array of image URLs from Amazon PAAPI
 * @returns {string} - HTML content with placeholders replaced by actual URLs
 */
export function replaceImagePlaceholders(htmlContent, imageUrls) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return htmlContent;
  }

  if (!Array.isArray(imageUrls)) {
    imageUrls = [];
  }

  let processedContent = htmlContent;

  // Define placeholder mapping
  const placeholderMap = {
    '{image_main}': 0,  // images[0]
    '{image_sub1}': 1,  // images[1]
    '{image_sub2}': 2,  // images[2]
    '{image_sub3}': 3,  // images[3]
    '{image_sub4}': 4,  // images[4]
    '{image_sub5}': 5,  // images[5]
    '{image_sub6}': 6,  // images[6]
    '{image_sub7}': 7,  // images[7]
  };

  // Replace each placeholder with corresponding image URL
  for (const [placeholder, index] of Object.entries(placeholderMap)) {
    if (imageUrls[index]) {
      // Replace all occurrences of this placeholder with the actual URL
      // Use global replace to handle multiple instances
      const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
      processedContent = processedContent.replace(regex, imageUrls[index]);
    }
  }

  return processedContent;
}

/**
 * Remove any unused image placeholders from HTML content
 * This is useful when there are fewer images available than placeholders in the template
 * @param {string} htmlContent - HTML content that may contain unused placeholders
 * @returns {string} - HTML content with unused placeholders removed
 */
export function cleanUnusedPlaceholders(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return htmlContent;
  }

  let cleanedContent = htmlContent;

  // List of all possible placeholders
  const allPlaceholders = [
    '{image_main}',
    '{image_sub1}',
    '{image_sub2}',
    '{image_sub3}',
    '{image_sub4}',
    '{image_sub5}',
    '{image_sub6}',
    '{image_sub7}'
  ];

  // Remove entire img tags that still contain placeholders
  // Pattern: <img[^>]*{image_...}[^>]*>
  for (const placeholder of allPlaceholders) {
    const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&');
    // Remove img tags containing this placeholder
    const imgTagRegex = new RegExp(`<img[^>]*${escapedPlaceholder}[^>]*>`, 'gi');
    cleanedContent = cleanedContent.replace(imgTagRegex, '');
  }

  // Also remove any remaining bare placeholders (just in case)
  for (const placeholder of allPlaceholders) {
    const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
    cleanedContent = cleanedContent.replace(regex, '');
  }

  // Clean up any double spaces or empty lines that might result from removal
  cleanedContent = cleanedContent.replace(/\s+/g, ' ').trim();

  return cleanedContent;
}

/**
 * Process HTML content: replace available images and clean unused placeholders
 * This is the main function to use in the ASIN autofill workflow
 * @param {string} htmlContent - HTML content containing image placeholders
 * @param {Array<string>} imageUrls - Array of image URLs from Amazon PAAPI
 * @returns {string} - Fully processed HTML content
 */
export function processImagePlaceholders(htmlContent, imageUrls) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return htmlContent;
  }

  // Step 1: Replace placeholders with actual image URLs
  let processedContent = replaceImagePlaceholders(htmlContent, imageUrls);

  // Step 2: Clean up any unused placeholders
  processedContent = cleanUnusedPlaceholders(processedContent);

  return processedContent;
}
