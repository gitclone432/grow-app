import axios from 'axios';
import crypto from 'crypto';
import pLimit from 'p-limit';
import OverlayImage from '../models/OverlayImage.js';
import { uploadImageToEps } from './ebayMediaApi.js';
import { resolveBadge } from '../config/overlayBadges.js';
import { compositeBadge, MIN_SOURCE_EDGE, normalizeForUpload, normalizePlacement } from './overlayCompositor.js';

/**
 * Applies an overlay badge to a listing's primary image and hosts every image
 * on eBay Picture Services.
 *
 * Sits between fetchAmazonData() and applyFieldConfigs() so the swapped URLs
 * reach all three consumers of amazonData.images: the CSV "Item photo URL"
 * column, {image_main} in the description HTML, and the review modal preview.
 *
 * WHY EVERY IMAGE AND NOT JUST THE BADGED ONE
 * eBay rejects a listing whose pictures are split across EPS and external URLs:
 *
 *   20004 - A mixture of Self Hosted and EPS pictures are not allowed.|PICTURE_URL|
 *
 * Badging image 1 necessarily moves it to EPS, so images 2-N have to follow or
 * the whole row fails at upload. That makes uniformity a correctness property,
 * not an optimisation: this module must return an image list that is entirely
 * EPS-hosted or entirely untouched, and never a blend of the two.
 */

// A pseudo-badge for the secondary images: same upload path, no artwork
// composited. The key also keeps their ledger rows distinguishable from badged
// composites of the same source picture.
const PLAIN_BADGE = { key: '__plain__', version: 0 };

// Ledger-key discriminators, not geometry. PLAIN_BADGE has no filePath, so
// hostImage() routes these images to normalizeForUpload(), which takes no
// placement at all — nothing here ever reaches computeBadgeBox. The values
// only have to be constant, so that every unbadged copy of a given source
// picture is recorded the same way.
//
// So read `scale: 0` as "unused", not as "a badge scaled to nothing": these
// never go through normalizePlacement, which would clamp 0 up to 0.05 and
// replace the unrecognised anchor with the default. If a future change does
// start passing this to the compositor, it needs real values first.
const PLAIN_PLACEMENT = { scale: 0, anchor: 'none', margin: 0 };

// What a batch sends to say "no overlay on this one", as opposed to saying
// nothing and inheriting the template default. Any string works as long as the
// badge registry can never contain it; 'none' reads clearly in a URL and in a
// log line. Asserted against the registry in the tests.
export const NO_OVERLAY = 'none';

// Anything already on eBay's CDN has been through here before. Guards against
// double-badging on re-preview and duplicate-update flows.
const HOSTED_PATTERN = /(^|\.)ebayimg\.com/i;

// Pictures re-hosted at once by ensureImagesForSeller().
//
// This is the one path that can face hundreds of uploads in a single request —
// a whole feed file switched to another seller — where the sequential loop used
// elsewhere would run for tens of minutes. Five at a time puts roughly 1-2
// uploads a second on eBay against a ceiling of ten, leaving headroom for
// whatever else the account is doing.
const REHOST_CONCURRENCY = parseInt(process.env.EBAY_REHOST_CONCURRENCY, 10) || 5;

/**
 * @param {string} url
 * @returns {boolean} true if the URL is already a composited, hosted image
 */
export function isAlreadyOverlaid(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    return HOSTED_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// eBay serves each picture at many sizes from one base name. Which variant an
// API response hands back is not guaranteed, and anything under
// MIN_SOURCE_EDGE (500px) is dropped by the compositor as 'source_too_small',
// so a listing would silently fail to badge purely because eBay quoted a
// thumbnail. Ask for the largest variant instead.
//
// Two URL schemes are in the wild and both appear on live listings:
//
//   modern: .../images/g/<id>/s-l500.jpg        → s-l1600
//   legacy: .../00/s/MTUwMFgxNDMy/z/<id>/$_1.JPG → $_57
//
// In the legacy scheme the base64 segment encodes the true dimensions
// ("MTUwMFgxNDMy" is "1500X1432"), while the $_N suffix selects the rendition:
// $_1 is a thumbnail, $_57 the full-size one. A legacy URL therefore looks
// large and downloads small, which is exactly the trap this avoids.
//
// Only the size token is rewritten; the rest of the path (and any non-eBay
// URL) is returned untouched.
const EBAY_MODERN_VARIANT = /\/s-l\d+(\.[a-z]+)(?=$|\?)/i;
const EBAY_LEGACY_VARIANT = /\$_\d+(\.[a-z]+)(?=$|\?)/i;

/**
 * @param {string} url
 * @returns {string} the same picture at eBay's largest variant, or url unchanged
 */
export function toLargestEbayVariant(url) {
  if (!url || typeof url !== 'string') return url;
  if (!isAlreadyOverlaid(url)) return url;

  if (EBAY_MODERN_VARIANT.test(url)) return url.replace(EBAY_MODERN_VARIANT, '/s-l1600$1');
  // '$$' is an escaped literal dollar in a replacement string.
  if (EBAY_LEGACY_VARIANT.test(url)) return url.replace(EBAY_LEGACY_VARIANT, '$$_57$1');

  return url;
}

/**
 * Fingerprint of one rendered composite: source picture, artwork, placement and
 * account. Names the file sent to eBay and is stored on the ledger row.
 *
 * No longer a lookup key — pictures are never reused, so nothing is fetched by
 * this. It groups rows describing the same composite, which is what makes a
 * duplicate upload recognisable as one in the data.
 */
export function buildCacheKey({ sourceUrl, badgeKey, badgeVersion, scale, anchor, margin, sellerId }) {
  return crypto
    .createHash('sha1')
    .update([sourceUrl, badgeKey, badgeVersion, scale, anchor, margin, String(sellerId)].join('|'))
    .digest('hex');
}

/**
 * True when an image list is safe to send to eBay — every picture on EPS, or
 * none of them.
 *
 * This is the invariant the 20004 error enforces. Exported so it can be
 * asserted in tests and re-checked before anything is handed to a caller.
 *
 * @param {string[]} images
 * @returns {boolean}
 */
export function hostsAreUniform(images) {
  if (!Array.isArray(images) || images.length === 0) return true;
  const hosted = images.map(isAlreadyOverlaid);
  return hosted.every(Boolean) || hosted.every((h) => !h);
}

/**
 * Return a copy of amazonData carrying a new image list.
 *
 * Extracted so the copy semantics can be tested without a network round trip.
 * This is the function that must never write to its input: asinCache runs with
 * useClones:false, so the object here is the live cache entry.
 *
 * @param {object} amazonData
 * @param {string[]} hostedUrls
 * @returns {object} a new object; the input is left exactly as it was
 */
export function replaceImages(amazonData, hostedUrls) {
  return { ...amazonData, images: [...hostedUrls] };
}

/**
 * Swap every occurrence of the original primary image for the badged one.
 *
 * Used on flows that don't regenerate fields from scratch — a duplicate update
 * hands back the listing's *saved* title/description/itemPhotoUrl for editing,
 * so the only safe way to badge it is an exact substitution that leaves every
 * other edit the user has made intact.
 *
 * A no-op when the original URL isn't present, which is the right answer if the
 * images were changed by hand.
 *
 * @param {string} text - e.g. a pipe-separated itemPhotoUrl, or description HTML
 * @param {Array<{from: string, to: string}>|{from: string, to: string}|null} mappings
 * @returns {string} text with every hosted image swapped in
 */
/**
 * Assemble the success result of an overlay.
 *
 * Extracted from withOverlaidImages so the shape callers rely on — including
 * `mappings`, which the duplicate-update branches need to rewrite already-saved
 * fields — is pinned by a test that doesn't need eBay or Mongo.
 *
 * One mapping per image that actually moved. Secondary images are in here too:
 * a saved itemPhotoUrl lists all six URLs, so swapping only the primary would
 * leave the stored listing in exactly the mixed-host state eBay rejects.
 *
 * @param {object} amazonData
 * @param {string[]} originalImages
 * @param {string[]} hostedImages
 */
export function buildOverlayResult(amazonData, originalImages, hostedImages) {
  const mappings = [];

  originalImages.forEach((from, i) => {
    const to = hostedImages[i];
    if (to && to !== from) mappings.push({ from, to });
  });

  return {
    data: replaceImages(amazonData, hostedImages),
    applied: true,
    mappings,
  };
}

export function applyOverlayMapping(text, mappings) {
  if (!text || typeof text !== 'string' || !mappings) return text;

  const list = Array.isArray(mappings) ? mappings : [mappings];

  return list.reduce(
    (acc, mapping) => (mapping?.from && mapping?.to ? acc.split(mapping.from).join(mapping.to) : acc),
    text
  );
}

// How eBay's Item photo URL column separates pictures. Matches the
// 'pipeSeparated' transform in asinAutofill.js.
export const IMAGE_LIST_SEPARATOR = ' | ';

/**
 * Split a saved Item photo URL field back into individual images.
 *
 * Tolerant of spacing, because the value may have been hand-edited. eBay uses
 * the pipe as its separator, so a URL cannot legitimately contain one.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitImageList(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split('|').map((part) => part.trim()).filter(Boolean);
}

/**
 * Work out the Item photo URL for a duplicate update.
 *
 * Duplicate branches reuse the listing's *saved* image list rather than
 * regenerating it, and rewrite it by exact substitution so manual edits
 * survive. That substitution can half-succeed: it matches on the Amazon URL as
 * it looks *today*, so if some of the saved URLs have drifted — Amazon replaced
 * a photo, or the scraper returned a different set — only the still-matching
 * ones move to EPS and the result is the mixed-host list eBay rejects with
 * 20004.
 *
 * So the gentle path runs first and is then checked. `hostedImages` is uniform
 * by construction (see withOverlaidImages), which makes it a safe fallback
 * whenever the substitution lands somewhere invalid.
 *
 * @param {string} savedItemPhotoUrl - the listing's stored pipe-separated value
 * @param {Array<{from: string, to: string}>|null} mappings - from withOverlaidImages
 * @param {string[]|null} hostedImages - the freshly hosted list
 * @returns {{value: string, replaced: boolean}} `replaced` is true when the
 *   saved list was discarded, which the caller must surface to the user.
 */
export function resolveSavedImageList(savedItemPhotoUrl, mappings, hostedImages) {
  const swapped = applyOverlayMapping(savedItemPhotoUrl || '', mappings);

  // No overlay ran, so nothing was rewritten and there is nothing to validate.
  // A saved list that was already mixed is left alone rather than "fixed" here:
  // this function only owns damage the overlay itself could have done.
  if (!mappings?.length || !Array.isArray(hostedImages) || !hostedImages.length) {
    return { value: swapped, replaced: false };
  }

  if (hostsAreUniform(splitImageList(swapped))) {
    return { value: swapped, replaced: false };
  }

  return { value: hostedImages.join(IMAGE_LIST_SEPARATOR), replaced: true };
}

async function downloadImage(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: 25 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

/**
 * Decide which badge a batch should use.
 *
 * Three inputs, three different meanings, and they must not collapse into each
 * other:
 *
 *   'case-only'  an explicit choice, which always wins
 *   NO_OVERLAY   an explicit refusal, which beats the template default
 *   '' / null    no opinion, so the template default fills the gap
 *
 * The default is what lets entry points with no picker of their own — the ASIN
 * List page's directory stream — badge their listings at all, so "no opinion"
 * has to mean "use the default". That is exactly why the refusal needs its own
 * value: without one, a lister choosing "None" in the picker is indistinguish-
 * able from a lister who never opened it, and the default badges the batch
 * anyway.
 *
 * Returns the key only; it is still checked against the template's allowlist by
 * resolveTemplateOverlay(). A default is stored as a flag on an existing
 * overlayOption, so it is always in that allowlist by construction.
 *
 * @param {object} template - effective template (may carry overlayOptions)
 * @param {string} badgeKey - explicitly requested badge, NO_OVERLAY, or nothing
 * @returns {{badgeKey: string, usingDefault: boolean, optedOut: boolean}}
 */
export function resolveEffectiveBadgeKey(template, badgeKey) {
  if (badgeKey === NO_OVERLAY) return { badgeKey: '', usingDefault: false, optedOut: true };
  if (badgeKey) return { badgeKey, usingDefault: false, optedOut: false };

  const options = Array.isArray(template?.overlayOptions) ? template.overlayOptions : [];
  // First wins if somehow several are flagged. The save-time validation rejects
  // that, but a document written before the rule existed must still behave
  // predictably rather than picking by chance.
  const defaultOption = options.find((option) => option?.isDefault && option?.badgeKey);

  return {
    badgeKey: defaultOption?.badgeKey || '',
    usingDefault: Boolean(defaultOption?.badgeKey),
    optedOut: false,
  };
}

/**
 * Resolve a caller-supplied badge key against a template's configured options.
 *
 * The key arrives as a query parameter, so it is only honoured when the
 * template actually offers it — otherwise any client could pick any badge.
 *
 * @param {object} template - effective template (may carry overlayOptions)
 * @param {string} badgeKey - requested badge key ('' / null means no overlay)
 * @returns {{badge: object, placement: object}|null}
 */
export function resolveTemplateOverlay(template, badgeKey) {
  if (!badgeKey) return null;

  const options = Array.isArray(template?.overlayOptions) ? template.overlayOptions : [];
  const option = options.find(o => o.badgeKey === badgeKey);
  if (!option) {
    console.warn(`[Overlay] Badge "${badgeKey}" is not enabled on template ${template?._id}`);
    return null;
  }

  const badge = resolveBadge(badgeKey);
  if (!badge) {
    console.warn(`[Overlay] Badge "${badgeKey}" is configured on template ${template?._id} but not registered`);
    return null;
  }

  return {
    badge,
    placement: normalizePlacement({
      scale: option.scale,
      anchor: option.anchor,
      margin: option.margin,
    }),
  };
}

// How much runway a cached picture needs before it is worth reusing.
//
// EPS keeps an image alive indefinitely once a live listing references it, but
// everything cached here is hosted *ahead* of that: an operator previews a
// batch, exports the CSV, and uploads it some time later. The picture has to
// outlive that gap. A day of margin covers same-day and overnight workflows
// while still reusing the vast majority of cache rows.
const EXPIRY_SAFETY_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * True when a cached picture is gone, too close to gone to reuse, or was hosted
 * before expiry was tracked at all.
 *
 * This is what makes the cache safe to keep. EPS drops any picture no live
 * listing references, so a stored URL goes stale on eBay's schedule rather than
 * ours — and since a listing's pictures must ALL be on EPS or all off it, one
 * dead URL invalidates the entire set. The old upload call reported no expiry
 * and offered no way to query one, so the previous cache could only guess. The
 * Media API returns expirationDate with every image, which turns that guess
 * into a check.
 *
 * Rows written by the pre-Media-API code have no expiresAt. Those are treated
 * as expiring rather than as never-expiring: their real deadline is unknown and
 * unknowable, so re-hosting is the only way to get back to a picture whose
 * lifetime is actually known. It costs one upload per stale row, once, and only
 * when that row is next requested.
 *
 * @param {Date|string|null|undefined} expiresAt
 * @returns {boolean}
 */
export function isExpiring(expiresAt, now = Date.now()) {
  if (!expiresAt) return true;

  const deadline = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (Number.isNaN(deadline)) return true;

  return deadline - now <= EXPIRY_SAFETY_MARGIN_MS;
}

// Longest a row is trusted, no matter what expiry it carries.
//
// The stored expiresAt describes the picture at the moment it was uploaded,
// while it was still unattached to any listing. Once a listing references it,
// its real lifetime becomes that listing's — and when the listing ENDS, eBay
// drops the picture within a few days. We never see that event, so a stored
// expiry can outlive the picture it describes. Bounding the age closes that
// hole without needing to model eBay's retention rules.
//
// Seven days, not the two this started at. Two was chosen while eBay's unused
// retention was unknown and the docs contradicted themselves; measuring real
// uploads (scripts/checkEpsImages.js) shows a flat 30 days, so a week of trust
// still leaves three weeks of headroom on the expiry itself.
//
// The residual risk this accepts: a picture listed and then ENDED inside the
// window could be reclaimed while a row still vouches for it. That needs the
// same ASIN re-listed by the same seller within seven days of ending — rare,
// since same-seller reuse runs to about once a month. Verifying each old row
// with getImage() would remove even that; it costs a request per picture and
// is worth adding if the assumption ever stops holding.
const MAX_TRUSTED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether a cache row may be handed back instead of re-hosting.
 *
 * Two independent reasons to refuse, and both matter:
 *   - the picture is at or near the expiry eBay gave us, or has none recorded
 *   - the row is old enough that its expiry is no longer trustworthy evidence
 *
 * @param {{hostedUrl?: string, expiresAt?: Date|string|null, createdAt?: Date|string}|null} cached
 * @returns {boolean}
 */
export function canReuseCachedImage(cached, now = Date.now()) {
  if (!cached?.hostedUrl) return false;
  if (isExpiring(cached.expiresAt, now)) return false;

  // hostedAt, not createdAt: a row that expired and was re-hosted keeps its
  // original createdAt, so ageing against that would retire a picture uploaded
  // seconds ago. No hostedAt means a row this logic cannot age-check, which
  // does not get the benefit of the doubt.
  const hostedAt = cached.hostedAt ? new Date(cached.hostedAt).getTime() : NaN;
  if (Number.isNaN(hostedAt)) return false;

  return now - hostedAt <= MAX_TRUSTED_AGE_MS;
}

/**
 * Composite (optionally) + host one image. Always uploads a fresh copy.
 *
 * A badge without a `filePath` — i.e. PLAIN_BADGE — means "upload this image
 * unchanged", which is what images 2-N need.
 *
 * ONE PICTURE PER LISTING, NEVER SHARED
 * This used to hand back a previously hosted URL when the same source, badge
 * and seller came round again, so two listings of one ASIN shared a picture.
 * They no longer do. Sharing makes two listings a single point of failure:
 * eBay ties a picture's life to the listings using it, so ending one can pull
 * the picture out from under the other, and nothing tells us when it happens.
 * A separate copy per listing costs an upload and removes the coupling.
 *
 * The OverlayImage collection is therefore a LEDGER, not a cache. Each row
 * records how one hosted picture was made — source URL, badge, placement,
 * seller — so refreshExpiredImages() and ensureImagesForSeller() can rebuild
 * that exact picture later, looking the row up by its hostedUrl. Rows are
 * inserted, never overwritten: an overwritten row would strand the previous
 * URL with no recipe, which is precisely what those two functions need.
 *
 * @returns {Promise<string|null>} hosted URL, or null if this image could not be
 *   hosted (source too small or unreadable)
 */
async function hostImage({ sourceUrl, badge, placement, sellerId, token, onSkip }) {
  const cacheKey = buildCacheKey({
    sourceUrl,
    badgeKey: badge.key,
    badgeVersion: badge.version,
    scale: placement.scale,
    anchor: placement.anchor,
    margin: placement.margin,
    sellerId,
  });

  const productBuffer = await downloadImage(sourceUrl);
  const result = badge.filePath
    ? await compositeBadge(productBuffer, badge.filePath, placement)
    : await normalizeForUpload(productBuffer);

  if (result.skipped) {
    console.warn(`[Overlay] Skipped ${sourceUrl}: ${result.reason}`);
    if (onSkip) onSkip(result.reason, sourceUrl);
    return null;
  }

  // The upload transport is shared with the buyer-messaging flow in
  // routes/ebay.js, reversing an earlier decision to duplicate it here. The
  // duplication existed so this feature could not regress that one, but what
  // actually differs between them is the Sharp pipeline producing the buffer,
  // not the call that ships it. Those pipelines are still separate; only the
  // eBay contract is shared, which is what let the Media API migration happen
  // in one place instead of two.
  const fileName = `overlay-${badge.key}-${cacheKey.slice(0, 12)}.jpg`;
  const { imageId, imageUrl: hostedUrl, expiresAt } = await uploadImageToEps(
    token,
    result.buffer,
    fileName
  );

  // Insert, never upsert. Every upload is its own picture with its own URL, so
  // it needs its own row: overwriting an earlier row would leave that earlier
  // URL — still live on eBay, still referenced by a listing — with no record of
  // how it was built, and nothing could rebuild it when it expired.
  //
  // Concurrent previews of the same ASIN therefore no longer race. They each
  // upload, each write a row, and each return their own URL.
  await OverlayImage.create({
    cacheKey,
    sourceUrl,
    hostedUrl,
    imageId,
    expiresAt,
    // Distinct from createdAt only in intent here, since rows are never
    // rewritten — this is what canReuseCachedImage() ages against when the
    // refresh paths ask whether a URL is still worth trusting.
    hostedAt: new Date(),
    badgeKey: badge.key,
    badgeVersion: badge.version,
    scale: placement.scale,
    anchor: placement.anchor,
    margin: placement.margin,
    sellerId,
    host: 'eps',
  });

  return hostedUrl;
}

/**
 * Host every image in the list on EPS, badging the first one.
 *
 * Sequential on purpose. The bulk preview already runs BULK_PREVIEW_CONCURRENCY
 * (default 15) ASINs at once; uploading a listing's six images in parallel too
 * would put ~90 concurrent uploads on eBay's picture endpoint. Going one at a
 * time keeps the in-flight count roughly where it was before this change.
 *
 * @returns {Promise<string[]|null>} the hosted list, or null if any image could
 *   not be hosted — in which case the caller must discard the partial results.
 */
async function hostAllImages(images, overlay, ctx, { skipHosted = true, onSkip } = {}) {
  const hosted = [];

  for (const [index, sourceUrl] of images.entries()) {
    // Re-preview of an already-processed listing: leave it where it is.
    //
    // Callers whose SOURCE is eBay pass skipHosted:false. For them "already on
    // ebayimg.com" is the starting state of every image rather than proof this
    // ran before, so the hostname says nothing and skipping would badge
    // nothing at all. Those callers establish idempotency from their own run
    // records instead.
    if (skipHosted && isAlreadyOverlaid(sourceUrl)) {
      hosted.push(sourceUrl);
      continue;
    }

    const isPrimary = index === 0;
    const hostedUrl = await hostImage({
      sourceUrl,
      badge: isPrimary ? overlay.badge : PLAIN_BADGE,
      placement: isPrimary ? overlay.placement : PLAIN_PLACEMENT,
      sellerId: ctx.sellerId,
      token: ctx.token,
      onSkip,
    });

    // One failure poisons the whole listing: a list where this image stayed on
    // Amazon and the others moved to EPS is precisely what eBay rejects. Bail
    // out and let the caller fall back to the untouched originals.
    if (!hostedUrl) return null;

    hosted.push(hostedUrl);
  }

  return hosted;
}

// Turn compositor skip reasons into something an operator can act on. Without
// this the UI only ever showed the mixed-host consequence.
function describeSkip(skips) {
  if (!skips.length) {
    return 'Overlay skipped: not every image could be hosted on eBay, and a listing cannot mix eBay-hosted and external pictures.';
  }

  const tooSmall = skips.filter((s) => s.reason === 'source_too_small').length;
  const unreadable = skips.filter((s) => s.reason === 'unreadable_source').length;
  const parts = [];

  if (tooSmall) {
    parts.push(`${tooSmall} picture${tooSmall === 1 ? ' is' : 's are'} under ${MIN_SOURCE_EDGE}px, which eBay rejects as a listing image`);
  }
  if (unreadable) {
    parts.push(`${unreadable} picture${unreadable === 1 ? ' could' : 's could'} not be read`);
  }

  return `Overlay skipped: ${parts.join('; ')}. The listing was left untouched.`;
}

/**
 * Badge the primary picture of an EXISTING eBay listing and host the whole set
 * on EPS, for the bulk-overlay page that revises live listings.
 *
 * Separate from withOverlaidImages() because that one is amazonData-shaped and
 * carries the Amazon-source assumptions: it returns { data, mappings } for the
 * CSV/description consumers, and it bails when every image is already on EPS.
 * Here the source IS eBay, so that check would reject every listing.
 *
 * Idempotency is the caller's job (the run records say what has been badged);
 * the OverlayImage cache still makes a repeat call cheap rather than wrong.
 *
 * @param {string[]} imageUrls - the listing's current pictures, primary first
 * @param {{badge: object, placement: object}} overlay - resolveTemplateOverlay()
 * @param {{sellerId: string, token: string}} ctx
 * @returns {Promise<{images: string[], applied: boolean, warning?: string}>}
 *   `images` is the original list untouched whenever applied is false.
 */
export async function overlayListingImages(imageUrls, overlay, ctx = {}) {
  const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];

  if (!overlay || !images.length || !ctx.token || !ctx.sellerId) {
    return { images, applied: false };
  }

  // eBay may quote any size variant; the compositor drops anything under 500px.
  const sources = images.map(toLargestEbayVariant);

  try {
    // The mixed-host bail-out is the CONSEQUENCE of a skip, not its cause.
    // Reporting only that sends people hunting for an eBay hosting problem when
    // the real answer is "this picture is 400px", so the reason is carried up.
    const skips = [];
    const hosted = await hostAllImages(sources, overlay, ctx, {
      skipHosted: false,
      onSkip: (reason, sourceUrl) => skips.push({ reason, sourceUrl }),
    });

    if (!hosted) {
      return {
        images,
        applied: false,
        warning: describeSkip(skips),
      };
    }

    // Same invariant as the Amazon path: a mixed list is rejected by eBay with
    // 20004, and here it would be rejected at revise time on a live listing.
    if (!hostsAreUniform(hosted)) {
      console.error('[Overlay] Refusing mixed-host image list for listing revise');
      return { images, applied: false, warning: 'Overlay skipped: mixed image hosts.' };
    }

    return { images: hosted, applied: true };
  } catch (error) {
    console.error(`[Overlay] Listing overlay failed: ${error.message}`);
    return { images, applied: false, warning: `Overlay could not be applied: ${error.message}` };
  }
}

/**
 * Move a set of pictures onto eBay Picture Services without badging any of them.
 *
 * The badged paths host as a side effect of compositing, which leaves every
 * template that has no badge configured pointing its listings at Amazon URLs.
 * That is survivable when a listing is CREATED — eBay ingests the externals at
 * publish time — but not when one is REVISED onto a different product: the
 * pictures change while the item stays live, so anything eBay fails to fetch
 * leaves the old product's photos on a listing that now describes a new one.
 *
 * Uses the same PLAIN_BADGE route the secondary images already take, so these
 * share the OverlayImage cache and the all-or-nothing failure rule with every
 * other hosted picture rather than growing a second set of semantics.
 *
 * Already-hosted pictures are left alone, which makes this safe to call after a
 * badge run: it becomes a no-op rather than a second upload of the same bytes.
 *
 * @param {string[]} imageUrls - pictures, primary first
 * @param {{sellerId: string, token: string}} ctx
 * @returns {Promise<{images: string[], applied: boolean, warning?: string}>}
 *   `images` is the original list untouched whenever applied is false.
 */
export async function hostImagesOnEbay(imageUrls, ctx = {}) {
  const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];

  if (!images.length || !ctx.token || !ctx.sellerId) {
    return { images, applied: false };
  }

  // Nothing to do — every picture is already on EPS.
  if (images.every(isAlreadyOverlaid)) {
    return { images, applied: false };
  }

  try {
    const skips = [];
    const hosted = await hostAllImages(images, { badge: PLAIN_BADGE, placement: PLAIN_PLACEMENT }, ctx, {
      skipHosted: true,
      onSkip: (reason, sourceUrl) => skips.push({ reason, sourceUrl }),
    });

    if (!hosted) {
      return { images, applied: false, warning: describeHostSkip(skips) };
    }

    // A half-hosted list is the 20004 rejection. hostAllImages already bails on
    // the first failure, so this only fires if that contract ever breaks.
    if (!hostsAreUniform(hosted)) {
      console.error('[Overlay] Refusing mixed-host image list from plain hosting');
      return { images, applied: false, warning: 'Pictures were left on their original host: hosting produced a mixed list.' };
    }

    return { images: hosted, applied: true };
  } catch (error) {
    console.error(`[Overlay] Plain hosting failed: ${error.message}`);
    return { images, applied: false, warning: `Pictures could not be hosted on eBay: ${error.message}` };
  }
}

// describeSkip's wording is about a badge that did not get applied, which is
// the wrong story when no badge was ever involved.
function describeHostSkip(skips) {
  if (!skips.length) {
    return 'Pictures were left on their original host: not every picture could be uploaded to eBay, and a listing cannot mix eBay-hosted and external pictures.';
  }

  const tooSmall = skips.filter((s) => s.reason === 'source_too_small').length;
  const unreadable = skips.filter((s) => s.reason === 'unreadable_source').length;
  const parts = [];

  if (tooSmall) {
    parts.push(`${tooSmall} picture${tooSmall === 1 ? ' is' : 's are'} under ${MIN_SOURCE_EDGE}px, which eBay rejects as a listing image`);
  }
  if (unreadable) {
    parts.push(`${unreadable} picture${unreadable === 1 ? ' could' : 's could'} not be read`);
  }

  return `Pictures were left on their original host: ${parts.join('; ')}.`;
}

/**
 * Return a copy of amazonData whose primary image carries the overlay badge and
 * whose every image is hosted on eBay Picture Services.
 *
 * IMPORTANT: never mutates the input. asinCache is configured with
 * useClones:false, so fetchAmazonData() hands back the live cached object —
 * writing to it would push the badge into the shared cache and leak it into
 * every other template, plus the compatibility, directory and stock-check
 * callers.
 *
 * Failure is non-fatal and all-or-nothing: a listing with unbadged Amazon
 * images uploads fine, a listing with a mix of hosts does not. So any problem
 * anywhere in the list discards the whole attempt rather than emitting a
 * partially-hosted array.
 *
 * @param {object} amazonData - result of fetchAmazonData()
 * @param {{badge: object, placement: object}|null} overlay - from resolveTemplateOverlay()
 * @param {{sellerId: string, token: string}} ctx
 * @returns {Promise<{data: object, applied: boolean, mappings?: Array, warning?: string}>}
 */
export async function withOverlaidImages(amazonData, overlay, ctx = {}) {
  const images = Array.isArray(amazonData?.images) ? amazonData.images : [];

  if (!overlay || !images.length || !ctx.token || !ctx.sellerId) {
    return { data: amazonData, applied: false };
  }

  // Everything is already on EPS — a re-preview of a listing this ran on before.
  if (images.every(isAlreadyOverlaid)) {
    return { data: amazonData, applied: false };
  }

  try {
    const hosted = await hostAllImages(images, overlay, ctx);

    if (!hosted) {
      return {
        data: amazonData,
        applied: false,
        warning: 'Overlay skipped: not every image could be hosted on eBay, and a listing cannot mix eBay-hosted and external pictures.',
      };
    }

    // Belt and braces. hostAllImages already guarantees this, but the cost of
    // being wrong is a failed CSV upload the seller only discovers hours later,
    // so the invariant is re-checked before the list escapes this module.
    if (!hostsAreUniform(hosted)) {
      console.error(`[Overlay] Refusing mixed-host image list for ${amazonData?.asin}`);
      return { data: amazonData, applied: false, warning: 'Overlay skipped: mixed image hosts.' };
    }

    // Shallow copy, fresh array — the cached object stays untouched. `mappings`
    // lets callers that work on already-saved text (duplicate updates) apply
    // the same swaps without regenerating the whole listing.
    return buildOverlayResult(amazonData, images, hosted);
  } catch (error) {
    console.error(`[Overlay] Failed for ${amazonData?.asin}: ${error.message}`);
    return {
      data: amazonData,
      applied: false,
      warning: `Overlay could not be applied: ${error.message}`,
    };
  }
}

/**
 * Re-host any of a listing's pictures that EPS has dropped, or is about to.
 *
 * WHY THIS EXISTS
 * Pictures are hosted at PREVIEW time, but a CSV is uploaded to eBay whenever
 * the operator gets to it — sometimes more than a week later, sometimes from a
 * file re-used months on. EPS reclaims any picture no live listing has claimed,
 * and eBay removed the only call that could extend that deadline
 * (ExtendSiteHostedPictures, decommissioned July 2025). So the deadline cannot
 * be pushed out; the pictures have to be replaced instead.
 *
 * Each cache row is a complete recipe for its own picture — source URL, badge,
 * placement, seller — so a stale URL can be rebuilt without re-scraping Amazon
 * or asking the caller for anything it does not already have.
 *
 * ALL OR NOTHING, as everywhere else in this module: a list where some pictures
 * were refreshed and others could not be is exactly the mixed-host state eBay
 * rejects with 20004. If any picture cannot be rebuilt, the original list is
 * returned untouched and the caller is told why.
 *
 * @param {string[]} imageList - the listing's current pictures, primary first
 * @param {{sellerId: string, token: string}} ctx
 * @returns {Promise<{images: string[], refreshed: boolean, mappings?: Array<{from: string, to: string}>, warning?: string}>}
 */
// URLs per lookup when recipes are prefetched for a whole batch. Mongo has no
// trouble with a large $in, but the query document itself travels over the
// wire, so a batch of a few thousand pictures is split rather than sent as one
// oversized filter.
const RECIPE_LOOKUP_CHUNK = 1000;

/**
 * Load the ledger rows for many listings' pictures in one pass.
 *
 * refreshExpiredImages() looks up its own rows when called alone, which costs a
 * round trip PER LISTING when an export walks a batch. The rows are keyed by
 * hostedUrl and the filter is identical apart from the URL list, so the whole
 * batch can be fetched up front and handed back through ctx.recipes.
 *
 * Seller scoping is applied here for the same reason it is applied there: EPS
 * pictures are account-scoped, and a row belonging to another account is not a
 * recipe this caller may re-run. Keeping that rule in this module means a
 * caller cannot batch the lookup and accidentally widen it.
 *
 * @param {string[]} urls - every picture URL in the batch; non-EPS ones ignored
 * @param {{sellerId: string}} ctx
 * @returns {Promise<Map<string, object>>} hostedUrl -> ledger row
 */
export async function prefetchImageRecipes(urls, ctx = {}) {
  const recipes = new Map();
  if (!ctx.sellerId) return recipes;

  // Only EPS URLs can have a row, and a batch is mostly the same few pictures
  // repeated across listings, so this is usually far smaller than it looks.
  const unique = [...new Set((urls || []).filter((url) => url && isAlreadyOverlaid(url)))];
  if (!unique.length) return recipes;

  for (let i = 0; i < unique.length; i += RECIPE_LOOKUP_CHUNK) {
    const rows = await OverlayImage.find({
      hostedUrl: { $in: unique.slice(i, i + RECIPE_LOOKUP_CHUNK) },
      sellerId: ctx.sellerId,
    }).lean();

    for (const row of rows) recipes.set(row.hostedUrl, row);
  }

  return recipes;
}

export async function refreshExpiredImages(imageList, ctx = {}) {
  const images = Array.isArray(imageList) ? imageList.filter(Boolean) : [];

  if (!images.length || !ctx.token || !ctx.sellerId) {
    return { images, refreshed: false };
  }

  // Nothing here is on EPS, so no expiry of ours governs it. An un-overlaid
  // listing still pointing at Amazon is eBay's problem to fetch at publish
  // time, exactly as it was before.
  if (!images.some(isAlreadyOverlaid)) {
    return { images, refreshed: false };
  }

  // Scoped by seller as well as URL: EPS pictures are account-scoped, and a row
  // belonging to another account is not a recipe this caller may re-run.
  //
  // ctx.recipes is the same lookup already done for a whole batch — see
  // prefetchImageRecipes(). A caller exporting many listings passes it so this
  // does not spend a round trip per listing; a caller with one listing omits it
  // and the query happens here. A prefetched map covers every URL in the batch,
  // so a miss below means no row exists, not that it went unfetched.
  const byUrl =
    ctx.recipes ||
    new Map(
      (
        await OverlayImage.find({
          hostedUrl: { $in: images },
          sellerId: ctx.sellerId,
        }).lean()
      ).map((row) => [row.hostedUrl, row])
    );

  // Decide everything before uploading anything, so a listing that cannot be
  // rebuilt costs no uploads at all rather than failing partway through one.
  const stale = [];

  for (const url of images) {
    // An external URL has no EPS expiry to worry about; eBay fetches it at
    // publish time. Left exactly where it is.
    if (!isAlreadyOverlaid(url)) continue;

    const row = byUrl.get(url);

    // No row means no recipe: this picture was hosted by something that did not
    // record where it came from, so there is nothing to rebuild it from.
    if (!row) {
      return {
        images,
        refreshed: false,
        warning:
          'Some pictures on this listing have expired on eBay and cannot be rebuilt automatically. Re-run the preview for it before uploading.',
      };
    }

    if (canReuseCachedImage(row)) continue;

    // resolveBadge returns the CURRENT artwork, which may be a newer version
    // than the row was hosted with. That is intended: a rebuild should carry
    // the badge the template uses today, not the one it used in March.
    const isPlain = row.badgeKey === PLAIN_BADGE.key;
    const badge = isPlain ? PLAIN_BADGE : resolveBadge(row.badgeKey);

    if (!badge) {
      return {
        images,
        refreshed: false,
        warning: `Cannot rebuild this listing's pictures: badge "${row.badgeKey}" is no longer available.`,
      };
    }

    stale.push({
      url,
      row,
      badge,
      placement: isPlain
        ? PLAIN_PLACEMENT
        : { scale: row.scale, anchor: row.anchor, margin: row.margin },
    });
  }

  if (!stale.length) {
    return { images, refreshed: false };
  }

  // Concurrent, unlike the badging path this shares a module with. That one
  // runs under a caller already processing several listings at once; this runs
  // per listing inside an export that walks them one at a time, so without
  // concurrency here nothing is parallel at all — and a stale re-download of a
  // hundred listings would sit for half an hour and time out the request.
  const limit = pLimit(REHOST_CONCURRENCY);
  const remap = new Map();
  let failure = null;

  await Promise.all(
    stale.map((item) =>
      limit(async () => {
        // One picture failing dooms the whole listing anyway, so the rest of
        // the batch is abandoned rather than uploaded and then discarded.
        if (failure) return;

        try {
          const hosted = await hostImage({
            sourceUrl: item.row.sourceUrl,
            badge: item.badge,
            placement: item.placement,
            sellerId: ctx.sellerId,
            token: ctx.token,
          });

          if (!hosted) {
            failure =
              'Some pictures on this listing could not be re-hosted on eBay, so its images were left as they are.';
            return;
          }

          remap.set(item.url, hosted);
        } catch (error) {
          failure = `Re-hosting this listing's pictures failed: ${error.message}`;
        }
      })
    )
  );

  // ALL OR NOTHING. A list where some pictures moved and others did not is the
  // mixed-host state eBay rejects with 20004, so a single failure discards
  // every replacement and the caller exports the originals untouched.
  if (failure) {
    return { images, refreshed: false, warning: failure };
  }

  const next = images.map((url) => remap.get(url) || url);

  if (!hostsAreUniform(next)) {
    console.error('[Overlay] Refusing mixed-host image list after refresh');
    return { images, refreshed: false, warning: 'Refresh skipped: mixed image hosts.' };
  }

  return {
    images: next,
    refreshed: true,
    mappings: [...remap].map(([from, to]) => ({ from, to })),
  };
}

/**
 * Bring a list of pictures under one seller's account, re-hosting whatever is
 * not already there and still valid.
 *
 * WHY THIS EXISTS
 * A CSV holds literal URLs, so a file exported for seller A and uploaded under
 * seller B leaves B's listing pointing at pictures hosted in A's account. eBay
 * ties a picture's lifetime to the listing using it, so when A's listing ends,
 * B's images are dropped with it — and if A's account is ever suspended, B's
 * listings lose their pictures outright. The cache key includes sellerId
 * precisely to stop composites being shared this way; copying a CSV by hand
 * walks around that, and this puts it back.
 *
 * Runs at feed-upload time, the last moment before the file reaches eBay, so
 * it also catches pictures that simply expired while the file sat unused. Both
 * problems have the same remedy — re-host under the seller doing the upload —
 * so they are handled in one pass rather than two.
 *
 * Unlike the rest of this module there is no all-or-nothing rule here: the
 * uniformity eBay enforces is EPS-vs-external, and every outcome of this
 * function is still EPS. A picture that cannot be rebuilt is left pointing
 * where it did, which is exactly as good as not having run.
 *
 * @param {string[]} imageList
 * @param {{sellerId: string, token: string}} ctx - the seller being uploaded FOR
 * @returns {Promise<{images: string[], mappings: Array<{from: string, to: string}>, rehosted: number, foreign: number, warnings: string[]}>}
 */
export async function ensureImagesForSeller(imageList, ctx = {}) {
  const images = Array.isArray(imageList) ? imageList.filter(Boolean) : [];
  const result = { images, mappings: [], rehosted: 0, foreign: 0, warnings: [] };

  if (!images.length || !ctx.token || !ctx.sellerId) return result;

  // Deduplicated before anything else. A feed file names the same picture in
  // the photo column AND again inside the description HTML, so a whole CSV's
  // worth of URLs collapses to far fewer actual pictures — and each one must
  // be re-hosted once, not once per mention.
  const unique = [...new Set(images.filter(isAlreadyOverlaid))];
  if (!unique.length) return result;

  // Deliberately NOT scoped by seller: finding rows that belong to someone
  // else is the entire point of this lookup.
  const rows = await OverlayImage.find({ hostedUrl: { $in: unique } }).lean();
  const byUrl = new Map(rows.map((row) => [row.hostedUrl, row]));
  const target = String(ctx.sellerId);

  const pending = [];

  for (const url of unique) {
    const row = byUrl.get(url);

    if (!row) {
      // Hosted by something that did not record where it came from, so there
      // is no recipe to re-run. Left alone: for a same-seller upload that is
      // the status quo, and for a cross-seller one the caller is warned.
      result.warnings.push(`No source on record for ${url}`);
      continue;
    }

    const isForeign = String(row.sellerId) !== target;
    if (isForeign) result.foreign += 1;

    // Someone else's picture is never reusable however fresh it looks, so
    // ownership is checked first and expiry only decides same-seller rows.
    if (!isForeign && canReuseCachedImage(row)) continue;

    pending.push({ url, row });
  }

  if (!pending.length) return result;

  const remap = new Map();
  const limit = pLimit(REHOST_CONCURRENCY);

  await Promise.all(
    pending.map(({ url, row }) =>
      limit(async () => {
        const isPlain = row.badgeKey === PLAIN_BADGE.key;
        const badge = isPlain ? PLAIN_BADGE : resolveBadge(row.badgeKey);

        if (!badge) {
          result.warnings.push(`Badge "${row.badgeKey}" no longer exists; left ${url} as it was`);
          return;
        }

        const placement = isPlain
          ? PLAIN_PLACEMENT
          : { scale: row.scale, anchor: row.anchor, margin: row.margin };

        try {
          const rehosted = await hostImage({
            sourceUrl: row.sourceUrl,
            badge,
            placement,
            sellerId: ctx.sellerId,
            token: ctx.token,
          });

          if (!rehosted) {
            result.warnings.push(`Could not re-host ${row.sourceUrl}; left ${url} as it was`);
            return;
          }

          remap.set(url, rehosted);
        } catch (error) {
          result.warnings.push(`Re-hosting ${row.sourceUrl} failed: ${error.message}`);
        }
      })
    )
  );

  // A URL with no replacement keeps pointing where it did, which is no worse
  // than not having run at all.
  result.images = images.map((url) => remap.get(url) || url);
  result.mappings = [...remap].map(([from, to]) => ({ from, to }));
  result.rehosted = remap.size;

  return result;
}
