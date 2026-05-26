import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ImageOverlaySettings from '../models/ImageOverlaySettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_ROOT = path.join(__dirname, '../..');
export const OVERLAY_BADGES_DIR = path.join(SERVER_ROOT, 'public', 'uploads', 'overlay-badges');
export const OVERLAY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const SETTINGS_CACHE_MS = 30_000;
let settingsCache = { t: 0, value: null };

export function sanitizeOverlayBadgeName(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug || !/^[a-z0-9]/.test(slug)) return '';
  return slug;
}

export async function ensureOverlayBadgesDir() {
  await fs.mkdir(OVERLAY_BADGES_DIR, { recursive: true });
}

export async function resolveOverlayBadgePath(overlayBadgeName = 'usa-seller') {
  const baseName = sanitizeOverlayBadgeName(overlayBadgeName) || 'usa-seller';
  await ensureOverlayBadgesDir();
  for (const ext of OVERLAY_EXTENSIONS) {
    const candidate = path.join(OVERLAY_BADGES_DIR, `${baseName}${ext}`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next extension
    }
  }
  return null;
}

export async function listOverlayBadges() {
  await ensureOverlayBadgesDir();
  let files = [];
  try {
    files = await fs.readdir(OVERLAY_BADGES_DIR);
  } catch {
    return [];
  }

  const byName = new Map();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!OVERLAY_EXTENSIONS.includes(ext)) continue;
    const name = path.basename(file, ext);
    const safeName = sanitizeOverlayBadgeName(name);
    if (!safeName) continue;
    const stat = await fs.stat(path.join(OVERLAY_BADGES_DIR, file));
    const existing = byName.get(safeName);
    if (!existing || stat.mtimeMs > existing.mtimeMs) {
      byName.set(safeName, {
        name: safeName,
        extension: ext,
        filename: file,
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadSettingsDoc() {
  let doc = await ImageOverlaySettings.findOne({ settingsKey: 'global' }).lean();
  if (!doc) {
    const envEnabled = String(process.env.ENABLE_SCRAPER_IMAGE_WATERMARK || '').toLowerCase() === 'true';
    const envBadge = String(process.env.SCRAPER_IMAGE_OVERLAY_BADGE || 'usa-seller').trim() || 'usa-seller';
    const envMax = Math.max(
      1,
      Number(process.env.SCRAPER_IMAGE_OVERLAY_MAX_IMAGES || 3) || 3
    );
    doc = await ImageOverlaySettings.create({
      settingsKey: 'global',
      enabled: envEnabled,
      activeBadge: sanitizeOverlayBadgeName(envBadge) || 'usa-seller',
      maxImages: envMax,
    }).then((d) => d.toObject());
  }
  return doc;
}

export function invalidateImageOverlaySettingsCache() {
  settingsCache = { t: 0, value: null };
}

/** Runtime config for applyOverlayToScrapedImages (DB + env fallback). */
export async function getImageOverlayRuntimeConfig() {
  if (settingsCache.value && Date.now() - settingsCache.t < SETTINGS_CACHE_MS) {
    return settingsCache.value;
  }

  const doc = await loadSettingsDoc();
  const envEnabled = String(process.env.ENABLE_SCRAPER_IMAGE_WATERMARK || '').toLowerCase() === 'true';
  const envBadge =
    sanitizeOverlayBadgeName(process.env.SCRAPER_IMAGE_OVERLAY_BADGE || '') || 'usa-seller';
  const envMax = Math.max(
    1,
    Math.min(12, Number(process.env.SCRAPER_IMAGE_OVERLAY_MAX_IMAGES || 3) || 3)
  );

  const overlayMode =
    doc.overlayMode === 'full'
      ? 'full'
      : doc.overlayMode === 'corner'
        ? 'corner'
        : 'frame';
  const framePaddingPercent = Math.max(
    0,
    Math.min(40, Number.isFinite(Number(doc.framePaddingPercent)) ? Number(doc.framePaddingPercent) : 0)
  );
  const overlayScalePercent = Math.max(
    8,
    Math.min(80, Number(doc.overlayScalePercent) || 30)
  );
  const allowedPositions = new Set([
    'bottom-left',
    'bottom-right',
    'top-left',
    'top-right',
    'center',
  ]);
  const overlayPosition = allowedPositions.has(doc.overlayPosition)
    ? doc.overlayPosition
    : 'bottom-left';
  const outputMaxPx = Math.max(
    400,
    Math.min(2400, Number(doc.outputMaxPx) || 1600)
  );

  const value = {
    enabled: typeof doc.enabled === 'boolean' ? doc.enabled : envEnabled,
    activeBadge: sanitizeOverlayBadgeName(doc.activeBadge) || envBadge,
    maxImages: Math.max(
      1,
      Math.min(12, Number(doc.maxImages) || envMax)
    ),
    overlayMode,
    framePaddingPercent,
    overlayScalePercent,
    overlayPosition,
    outputMaxPx,
    imgbbConfigured: Boolean(String(process.env.IMGBB_API_KEY || '').trim()),
  };

  settingsCache = { t: Date.now(), value };
  return value;
}

export function overlayBadgePublicUrl(req, badgeName, extension = '.png') {
  const name = sanitizeOverlayBadgeName(badgeName);
  const ext = OVERLAY_EXTENSIONS.includes(extension) ? extension : '.png';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/overlay-badges/${name}${ext}`;
}
