import axios from 'axios';
import FormData from 'form-data';

/**
 * eBay Media API — image upload to eBay Picture Services (EPS).
 *
 * Replaces the Trading API's UploadSiteHostedPictures call, which eBay
 * decommissions on 2026-09-30. Three differences from the old call shape this
 * module:
 *
 *   1. Upload no longer hands back a URL. create_image_from_file answers
 *      201 Created with the new image's id in the Location header, and the
 *      usable EPS URL only comes back from a second GET. Every upload is two
 *      round trips now, not one.
 *
 *   2. Images carry an explicit expiry. getImage returns expirationDate and
 *      answers 404 once the picture is gone. The old call gave callers no way
 *      to ask whether a hosted picture still existed — KB 1840 flatly said to
 *      save the URL because nothing could look it up — so anything caching an
 *      EPS URL was guessing. Callers can now store the expiry and know.
 *
 *   3. Auth is a bearer token rather than an <eBayAuthToken> element, and the
 *      host is apim.ebay.com, not the api.ebay.com used everywhere else in
 *      this integration. Worth knowing if egress is filtered by hostname.
 *
 * None of the image methods exist in Sandbox, so this can only be exercised
 * against production. That is survivable: unassociated uploads are purged
 * automatically and there is no delete call, so test images cannot accumulate.
 */
const MEDIA_API_BASE = 'https://apim.ebay.com/commerce/media/v1_beta';

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Pull the image id out of the Location header eBay returns on 201.
 *
 * Documented as a full URI:
 *
 *   https://apim.ebay.com/commerce/media/v1_beta/image/{image_id}
 *
 * Tolerates a bare id as well, since the docs invite callers to persist either
 * form and a future response could plausibly send one.
 *
 * @param {string} location
 * @returns {string|null} the image id, or null if nothing usable was present
 */
export function extractImageId(location) {
  if (!location || typeof location !== 'string') return null;

  const trimmed = location.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  const id = trimmed.split('/').pop();
  return id || null;
}

// eBay's errors arrive as a JSON array; surface the first message rather than
// "Request failed with status code 400", which says nothing about the picture.
function describeEbayError(error) {
  const status = error.response?.status;
  const first = error.response?.data?.errors?.[0];
  const detail = first?.longMessage || first?.message;

  if (status === 429) {
    return 'eBay Media API rate limit hit (50 uploads per 5 seconds per user)';
  }

  if (detail) {
    return `eBay Media API ${status}: ${detail}${first?.errorId ? ` (errorId ${first.errorId})` : ''}`;
  }

  return `eBay Media API ${status || 'request'} failed: ${error.message}`;
}

/**
 * Upload an image and return its id. Does not resolve the URL — see fetchImage.
 *
 * @param {string} token an OAuth access token carrying the sell.inventory scope
 * @param {Buffer} buffer JPEG bytes
 * @param {string} fileName name reported to eBay in the multipart part
 * @returns {Promise<string>} the new image's id
 */
export async function createImageFromFile(token, buffer, fileName) {
  const form = new FormData();
  form.append('image', buffer, { filename: fileName, contentType: 'image/jpeg' });

  let response;
  try {
    response = await axios.post(`${MEDIA_API_BASE}/image/create_image_from_file`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
      timeout: REQUEST_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    throw new Error(describeEbayError(error));
  }

  // The id lives only in the header; the 201 body is empty.
  const imageId = extractImageId(response.headers?.location);
  if (!imageId) {
    throw new Error('eBay Media API returned 201 without a usable Location header');
  }

  return imageId;
}

/**
 * Resolve an image id to its EPS URL and expiry.
 *
 * @param {string} token
 * @param {string} imageId
 * @returns {Promise<{imageId: string, imageUrl: string, maxDimensionImageUrl: string|null, expiresAt: Date|null}|null>}
 *   null when eBay reports the image no longer exists (404), which for an id
 *   read out of a cache means it expired and the caller must re-upload.
 */
export async function fetchImage(token, imageId) {
  let response;
  try {
    response = await axios.get(`${MEDIA_API_BASE}/image/${encodeURIComponent(imageId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw new Error(describeEbayError(error));
  }

  const { imageUrl, maxDimensionImageUrl, expirationDate } = response.data || {};

  // A missing URL means the response schema moved under us. Fail loudly here
  // rather than letting an undefined propagate into a listing's picture list,
  // where it surfaces as eBay error 20004 several layers away.
  if (!imageUrl) {
    throw new Error('eBay Media API returned an image record without imageUrl');
  }

  const expiresAt = expirationDate ? new Date(expirationDate) : null;

  return {
    imageId,
    imageUrl,
    maxDimensionImageUrl: maxDimensionImageUrl || null,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
  };
}

/**
 * Upload a JPEG to EPS and resolve it to a usable URL.
 *
 * The two-call sequence the Media API requires, in one place, so callers keep
 * the single-call ergonomics UploadSiteHostedPictures gave them.
 *
 * eBay caps Media API POSTs at 50 per 5 seconds per user. Callers upload
 * sequentially, which cannot reach that, so there is no limiter here — if a
 * caller ever parallelises, the cap becomes theirs to respect.
 *
 * @param {string} token
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {Promise<{imageId: string, imageUrl: string, maxDimensionImageUrl: string|null, expiresAt: Date|null}>}
 */
export async function uploadImageToEps(token, buffer, fileName) {
  const imageId = await createImageFromFile(token, buffer, fileName);
  const image = await fetchImage(token, imageId);

  // 404 on an id eBay minted moments ago is not an expiry, it is a broken
  // assumption. Say so plainly instead of returning null up the stack.
  if (!image) {
    throw new Error(`eBay Media API lost image ${imageId} immediately after upload`);
  }

  return image;
}
