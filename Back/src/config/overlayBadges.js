import path from 'path';

/**
 * Registry of overlay badges that can be composited onto a listing's primary image.
 *
 * Badges are resolved by key and never by a caller-supplied path, so a query
 * parameter can't be walked into the filesystem. Adding artwork means adding an
 * entry here plus the PNG under public/uploads/overlay-badges/.
 *
 * `version` participates in the composite cache key: bump it when the artwork
 * changes, otherwise every previously composited image keeps serving the old
 * badge forever.
 */
const BADGES = {
  'case-only': {
    key: 'case-only',
    label: 'Case Only — Phone Not Included (Red)',
    file: 'case-only-overlay.png',
    version: 1,
  },
  
  'watch-strap-text': {
    key: 'watch-strap-text',
    label: 'watch-strap-text',
    file: 'watch-strap-text.png',
    version: 1,
  },

  'watch-case-text': {
    key: 'watch-case-text',
    label: 'watch-case-text',
    file: 'watch-case-text.png',
    version: 1,
  },

   'phone-case-text': {
    key: 'phone-case-text',
    label: 'phone-case-text',
    file: 'phone-case-text.png',
    version: 1,
  },

  'case-only-text': {
    key: 'case-only-text',
    label: 'case-only-text',
    // Must match the filename on disk exactly, including case — Render's
    // filesystem is case-sensitive, so a mismatched spelling resolves locally
    // on Windows and then fails to load in production.
    file: 'case-only-text.png',
    version: 1,
  },

  'strap-only-text': {
    key: 'strap-only-text',
    label: 'strap-only-text',
    file: 'strap-only-text.png',
    version: 1,
  },
};

const BADGE_DIR = path.join(process.cwd(), 'public/uploads/overlay-badges');

/**
 * Resolve a badge key to its descriptor, including the absolute artwork path.
 * @param {string} badgeKey
 * @returns {{key: string, label: string, version: number, filePath: string}|null}
 */
export function resolveBadge(badgeKey) {
  if (!badgeKey || typeof badgeKey !== 'string') return null;

  const badge = BADGES[badgeKey];
  if (!badge) return null;

  // Defence in depth: the map is static, but a filename that ever picked up a
  // separator would escape BADGE_DIR.
  if (badge.file.includes('/') || badge.file.includes('\\') || badge.file.includes('..')) {
    console.error(`[Overlay] Refusing badge "${badgeKey}": unsafe filename "${badge.file}"`);
    return null;
  }

  return {
    key: badge.key,
    label: badge.label,
    version: badge.version,
    filePath: path.join(BADGE_DIR, badge.file),
  };
}

/**
 * All registered badges, for the template configuration UI.
 * @returns {Array<{key: string, label: string, version: number}>}
 */
export function listBadges() {
  return Object.values(BADGES).map(({ key, label, version }) => ({ key, label, version }));
}

export default BADGES;
