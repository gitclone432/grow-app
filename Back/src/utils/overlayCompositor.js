import fs from 'node:fs/promises';
import sharp from 'sharp';

/**
 * Image compositing for listing overlay badges.
 *
 * No network, no database, no configuration lookups — so the placement maths
 * can be unit tested without touching eBay or Mongo.
 *
 * The one piece of state is badgeCache, which memoizes resized badge artwork
 * (see getResizedBadge). It changes how often the artwork is decoded and
 * nothing else: for a given badge and size the composite is byte-identical
 * whether it was a hit or a miss, which is asserted directly in the tests. Call
 * clearBadgeCache() to reset it.
 */

// eBay recommends 1600px on the longest edge; below 500px it rejects the picture.
export const WORK_EDGE = 1600;
export const MIN_SOURCE_EDGE = 500;

export const ANCHORS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

// Verified against the case-only artwork at 1600px: 26% keeps "CASE ONLY"
// legible at eBay's ~225px search thumbnail while covering under 7% of the frame.
export const DEFAULT_PLACEMENT = {
  scale: 0.26,
  anchor: 'bottom-right',
  margin: 0.015,
};

/**
 * Clamp caller-supplied placement into a range that can't produce a badge
 * larger than the image or negative offsets.
 */
export function normalizePlacement(placement = {}) {
  const scale = Number.isFinite(placement.scale)
    ? Math.min(Math.max(placement.scale, 0.05), 1)
    : DEFAULT_PLACEMENT.scale;

  const margin = Number.isFinite(placement.margin)
    ? Math.min(Math.max(placement.margin, 0), 0.2)
    : DEFAULT_PLACEMENT.margin;

  const anchor = ANCHORS.includes(placement.anchor)
    ? placement.anchor
    : DEFAULT_PLACEMENT.anchor;

  return { scale, anchor, margin };
}

/**
 * Work out where the badge sits on the base image.
 *
 * Kept separate from the sharp pipeline so the geometry is directly assertable.
 * The badge is sized from the *longest* edge so a tall product photo and a wide
 * one get a visually comparable badge.
 *
 * @returns {{badgeEdge: number, top: number, left: number, marginPx: number}}
 */
export function computeBadgeBox(baseWidth, baseHeight, placement) {
  const { scale, anchor, margin } = normalizePlacement(placement);

  const longestEdge = Math.max(baseWidth, baseHeight);
  const marginPx = Math.round(longestEdge * margin);

  // Never let the badge plus its margins exceed either axis — a very narrow
  // product photo would otherwise get a badge wider than the image.
  const maxEdge = Math.max(1, Math.min(baseWidth, baseHeight) - marginPx * 2);
  const badgeEdge = Math.max(1, Math.min(Math.round(longestEdge * scale), maxEdge));

  const top = anchor.startsWith('top')
    ? marginPx
    : Math.max(0, baseHeight - badgeEdge - marginPx);

  const left = anchor.endsWith('left')
    ? marginPx
    : Math.max(0, baseWidth - badgeEdge - marginPx);

  return { badgeEdge, top, left, marginPx };
}

/**
 * Decode, orient and resize a source image into the buffer everything else
 * builds on.
 *
 * Shared by compositeBadge() and normalizeForUpload() so a badged image and an
 * unbadged one are prepared identically — same orientation handling, same size
 * ceiling, same rejection rules. Divergence here would show up as image 1
 * looking subtly different from images 2-6 in the same listing.
 *
 * @returns {Promise<{skipped: true, reason: string}|{skipped: false, baseBuffer: Buffer, meta: object}>}
 */
async function prepareBase(productBuffer) {
  // .rotate() with no argument applies the EXIF orientation, matching the eBay
  // picture uploader in routes/ebay.js.
  const source = sharp(productBuffer).rotate();
  const metadata = await source.metadata();

  if (!metadata.width || !metadata.height) {
    return { skipped: true, reason: 'unreadable_source' };
  }

  // Uploading a picture eBay would reject anyway just wastes a round trip.
  if (Math.max(metadata.width, metadata.height) < MIN_SOURCE_EDGE) {
    return { skipped: true, reason: 'source_too_small' };
  }

  const baseBuffer = await source
    .resize(WORK_EDGE, WORK_EDGE, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  return { skipped: false, baseBuffer, meta: await sharp(baseBuffer).metadata() };
}

/**
 * Re-encode a product image for upload without touching its content.
 *
 * eBay forbids mixing its own hosted pictures with external URLs in one
 * listing, so when the primary image gets badged and hosted on EPS every other
 * image has to be hosted too. Those images need no badge — they just need to
 * make the same trip.
 *
 * @param {Buffer} productBuffer - Source product image
 * @returns {Promise<{skipped: boolean, reason?: string, buffer?: Buffer, width?: number, height?: number}>}
 */
export async function normalizeForUpload(productBuffer) {
  const base = await prepareBase(productBuffer);
  if (base.skipped) return base;

  let pipeline = sharp(base.baseBuffer);
  if (base.meta.hasAlpha) {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  return {
    skipped: false,
    buffer: await pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer(),
    width: base.meta.width,
    height: base.meta.height,
  };
}

/**
 * Resized badge artwork, keyed by path + mtime + the size asked for.
 *
 * The artwork on disk is far larger than it is ever drawn: the files run to
 * 2508px and 3464px square, while the badge is rendered at 26% of a base capped
 * to WORK_EDGE — 416px for any product photo of 1600px or more, which is nearly
 * all of them. Decoding a 3464px RGBA PNG costs ~48MB of raw pixels and ~145ms,
 * and without this every badged image in a bulk run paid that again to produce
 * a byte-identical result.
 *
 * Keyed on mtime as well as path so replacing artwork on disk takes effect
 * without a restart; the stat that costs is a rounding error against the decode
 * it avoids. Only string paths are cached — a caller passing a Buffer has given
 * us no stable identity to key on, so that path renders every time.
 */
const badgeCache = new Map();

// Six badges at the handful of sizes non-1600px sources produce. The limit only
// exists so an unforeseen spread of base dimensions can't grow this without end.
// Exported so the eviction test doesn't have to hardcode it.
export const BADGE_CACHE_LIMIT = 32;

function renderBadge(badge, badgeEdge) {
  return sharp(badge)
    .resize(badgeEdge, badgeEdge, {
      // 'contain' keeps the artwork's aspect ratio. 'cover' would crop the badge
      // on any non-square target, which is what the earlier prototype did.
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
}

async function getResizedBadge(badge, badgeEdge) {
  if (typeof badge !== 'string') return renderBadge(badge, badgeEdge);

  let mtimeMs;
  try {
    ({ mtimeMs } = await fs.stat(badge));
  } catch {
    // Missing or unreadable: fall through and let sharp report it as it did
    // before, rather than turning a file error into a cache miss error.
    return renderBadge(badge, badgeEdge);
  }

  const key = `${badge}\0${mtimeMs}\0${badgeEdge}`;
  const cached = badgeCache.get(key);
  if (cached) {
    // Re-insert to move this key to the end of the Map's iteration order, which
    // is what makes the eviction below LRU rather than FIFO. It matters only in
    // the case the limit exists for — an unexpected spread of base dimensions —
    // and that is exactly where FIFO would evict the one hot entry while cold
    // one-off sizes survive.
    badgeCache.delete(key);
    badgeCache.set(key, cached);
    return cached;
  }

  // The promise is cached, not the buffer, so concurrent images of the same
  // badge — the normal case in a bulk run — share one decode instead of racing
  // to do the same work. A rejection is evicted so a transient read failure
  // isn't remembered for the life of the process.
  const pending = renderBadge(badge, badgeEdge);
  pending.catch(() => badgeCache.delete(key));

  badgeCache.set(key, pending);
  if (badgeCache.size > BADGE_CACHE_LIMIT) {
    // Least recently used: the first key in iteration order, given every hit
    // above moves its key to the end.
    badgeCache.delete(badgeCache.keys().next().value);
  }

  return pending;
}

/** Drop every memoized badge. Exported for tests. */
export function clearBadgeCache() {
  badgeCache.clear();
}

/**
 * Composite a badge onto a product image.
 *
 * @param {Buffer} productBuffer - Source product image
 * @param {string|Buffer} badge - Path to (or buffer of) the badge artwork
 * @param {object} [placement] - { scale, anchor, margin }
 * @returns {Promise<{skipped: boolean, reason?: string, buffer?: Buffer, width?: number, height?: number, box?: object}>}
 */
export async function compositeBadge(productBuffer, badge, placement = DEFAULT_PLACEMENT) {
  const base = await prepareBase(productBuffer);
  if (base.skipped) return base;

  const baseBuffer = base.baseBuffer;
  const baseMeta = base.meta;
  const box = computeBadgeBox(baseMeta.width, baseMeta.height, placement);

  // Shared between callers, so it must stay read-only from here on. sharp's
  // composite() only reads its input, which is the one thing done with it below.
  const badgeBuffer = await getResizedBadge(badge, box.badgeEdge);

  let pipeline = sharp(baseBuffer);

  // Amazon serves JPEGs, so this is normally a no-op. It matters only if a
  // source ever arrives as a PNG with alpha: JPEG has no alpha channel, and
  // without flattening the transparent areas take whatever RGB sits under them.
  if (baseMeta.hasAlpha) {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  const buffer = await pipeline
    .composite([{ input: badgeBuffer, top: box.top, left: box.left }])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return {
    skipped: false,
    buffer,
    width: baseMeta.width,
    height: baseMeta.height,
    box,
  };
}
