export const ETSY_LISTING_PROMPT = `I will provide only the Title and Product Description of an item. You must generate a complete Etsy product listing using the default template below:

🟢 Template Rules

Title

Max 130 characters.

Keyword-rich and optimized for Etsy search.

Put values (numbers, quantities, pack count, etc.) at the beginning.

Description
Structure the description in clear sections with headings and bullet points using - (no •) & Include Stcker in Description.

Features

Dimensions (Include Lenth & Breath Separately)

Perfect For

Package Includes

Customer Service


Mention Emoji In Description

“We are committed to providing excellent service. Please contact us if you have any questions or issues with your order.”

Returns & Exchanges

30 days return window

Buyer is responsible for return shipping costs and any loss in value if item isn’t returned in original condition

Cancellations

“Buyer can cancel the order within 2 hours of purchase. Please contact us first if you wish to cancel.”

Material

Extract from description.

Color

Extract from description.

Tags

Exactly 13 tags.

Each between 1–20 characters.

Capitalized.

Output in one line, comma-separated.

Warnings / Safety Info

Automatically include if product contains small parts, sharp objects, or risks.

Example:

WARNING: CHOKING HAZARD – Small parts. Not for children under 3 yrs.

⚠ Extra Notes:

No “Highlights” section.

Tags must be Etsy-compliant. Shorten or split long ones.

If safety info is detected from description (small, resin, wood, etc.), auto-generate the proper warning.`;

const STORE_NAME_PLACEHOLDER = '"Etsy Store name"';

const ETSY_IMAGE_BACKGROUND_PROMPT_TEMPLATE = `I will send you product photos, and you need to change the background according to each product's theme. Add the store name ${STORE_NAME_PLACEHOLDER} , Italice fonts.

Please ensure that:

The main focus is always on the product.

The background matches the product's theme.

Use natural daylight with bright, clear lighting.

Avoid applying too many filters. Keep the photo realistic and professional.

Make sure the product's original color and details remain unchanged.

I will send you different photos each time, so create a unique background for each photo according to its theme.

Correct any spelling mistakes and present everything neatly and professionally.

The final image should look natural, attractive, and suitable for Etsy product listings.`;

/** Image prompt with the chosen Etsy store's name in place of the "Etsy Store name" placeholder. */
export function buildEtsyImageBackgroundPrompt(storeName) {
  const name = String(storeName || '').trim();
  if (!name) return ETSY_IMAGE_BACKGROUND_PROMPT_TEMPLATE;
  return ETSY_IMAGE_BACKGROUND_PROMPT_TEMPLATE.replace(STORE_NAME_PLACEHOLDER, () => `"${name}"`);
}

export const ETSY_MODEL_PHOTO_PROMPT = 'You need to edit an e-commerce product photo by strictly following these instructions: '
  + '1. Add a Professional Model: If the photo does not have a model, seamlessly integrate a professional model wearing or displaying the product in a natural, lifestyle setting. The placement must look completely realistic. '
  + '2. Natural Look (Platform Verification Safe): Keep the overall photo completely natural. Avoid any artificial or heavy editing that could be flagged by automated verification or AI-detection tools. The image should look like a real, professional photoshoot. '
  + '3. Product Quality & Real Colors: Enhance the product quality to look premium, but do not add any extra or fake colors. Maintain the exact real color of the original product with no color mismatch. '
  + '4. Background: Keep the background clean, professional, and complementary to the lifestyle context of the product. '
  + 'Please follow these exact guidelines for any photo I provide.';

export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path (e.g. when the Clipboard API is blocked).
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  return copied;
}
