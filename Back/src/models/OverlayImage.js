import mongoose from 'mongoose';

/**
 * Ledger of pictures hosted on eBay Picture Services: one row per upload.
 *
 * NOT a cache — nothing is served from here to avoid an upload. Every listing
 * gets its own copy of a picture, because eBay ties a picture's life to the
 * listings using it and two listings sharing one would make ending the first
 * break the second.
 *
 * What each row is for is REBUILDING. It records how one hosted picture was
 * made, so when that picture expires the same image can be recreated from its
 * source. utils/overlayImage.js looks rows up by hostedUrl for exactly that,
 * which is why rows are inserted and never rewritten: overwriting one would
 * strand a live URL with no way to remake it.
 */
const overlayImageSchema = new mongoose.Schema({
  // sha1 of source URL + badge key/version + placement + seller. See
  // utils/overlayImage.js buildCacheKey().
  //
  // Deliberately NOT unique: several rows legitimately share these inputs, one
  // per listing that asked for the picture. Kept as a grouping key for
  // diagnostics, and it names the file sent to eBay.
  cacheKey: {
    type: String,
    required: true,
    index: true
  },

  sourceUrl: { type: String, required: true },

  // Indexed because the refresh path looks rows up BACKWARDS: a CSV export
  // holds only the hosted URLs, and has to recover each picture's recipe to
  // rebuild it. See utils/overlayImage.js refreshExpiredImages().
  hostedUrl: { type: String, required: true, index: true },

  // The Media API's handle for this picture. Kept alongside hostedUrl because
  // it is the only thing that can be asked about later: getImage(imageId)
  // answers 404 once EPS has dropped the image, whereas the URL alone can only
  // be discovered as broken by a listing failing.
  //
  // Absent on rows written before the UploadSiteHostedPictures migration —
  // that call returned a URL and nothing else.
  imageId: { type: String },

  // When EPS will drop this picture if no live listing references it. Null on
  // pre-migration rows, which utils/overlayImage.js isExpiring() treats as
  // stale for exactly that reason.
  expiresAt: { type: Date, default: null },

  // When hostedUrl was last uploaded. Distinct from createdAt, which records
  // when the composite was FIRST hosted and never moves: a row whose picture
  // expired and was re-hosted is new again, and ageing it against createdAt
  // would retire it immediately. canReuseCachedImage() measures against this.
  hostedAt: { type: Date, default: null },

  badgeKey: { type: String, required: true },
  badgeVersion: { type: Number, required: true },

  scale: Number,
  anchor: String,
  margin: Number,

  // EPS pictures are account-scoped, so a composite is not shared across
  // sellers — otherwise one suspended account could break another's listings.
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },

  host: { type: String, default: 'eps' },

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('OverlayImage', overlayImageSchema);
