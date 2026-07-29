import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import ImageOverlaySettings from '../models/ImageOverlaySettings.js';
import ListingTemplate from '../models/ListingTemplate.js';
import { createEbayImageWithOverlay, createEbayImageWithTextOverlay } from '../utils/imageProcessor.js';
import {
  OVERLAY_BADGES_DIR,
  OVERLAY_EXTENSIONS,
  ensureOverlayBadgesDir,
  getImageOverlayRuntimeConfig,
  invalidateImageOverlaySettingsCache,
  listOverlayBadges,
  overlayBadgePublicUrl,
  resolveOverlayBadgePath,
  sanitizeOverlayBadgeName,
} from '../utils/overlaySettings.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (OVERLAY_EXTENSIONS.includes(ext)) return cb(null, true);
    cb(new Error(`Allowed file types: ${OVERLAY_EXTENSIONS.join(', ')}`));
  },
});

function templateOverlayBadgeName(templateId) {
  return `tpl-${String(templateId)}`;
}

async function getOrCreateSettings() {
  let doc = await ImageOverlaySettings.findOne({ settingsKey: 'global' });
  if (!doc) {
    const runtime = await getImageOverlayRuntimeConfig();
    doc = await ImageOverlaySettings.create({
      settingsKey: 'global',
      enabled: runtime.enabled,
      activeBadge: runtime.activeBadge,
      maxImages: runtime.maxImages,
    });
  }
  return doc;
}

router.get('/', requireAuth, requirePageAccess('ImageOverlaySettings'), async (req, res) => {
  try {
    const doc = await getOrCreateSettings();
    const badges = await listOverlayBadges();
    const runtime = await getImageOverlayRuntimeConfig();
    res.json({
      settings: {
        enabled: doc.enabled,
        activeBadge: doc.activeBadge,
        maxImages: doc.maxImages,
        overlayMode: doc.overlayMode || 'frame',
        framePaddingPercent: doc.framePaddingPercent ?? 0,
        overlayScalePercent: doc.overlayScalePercent ?? 30,
        overlayPosition: doc.overlayPosition || 'bottom-left',
        outputMaxPx: doc.outputMaxPx ?? 1600,
        updatedAt: doc.updatedAt,
      },
      badges: badges.map((b) => ({
        ...b,
        previewUrl: overlayBadgePublicUrl(req, b.name, b.extension),
      })),
      imgbbConfigured: runtime.imgbbConfigured,
    });
  } catch (err) {
    console.error('[ImageOverlaySettings] GET:', err);
    res.status(500).json({ error: err.message || 'Failed to load overlay settings' });
  }
});

router.put('/', requireAuth, requirePageAccess('ImageOverlaySettings'), async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const activeBadge = sanitizeOverlayBadgeName(req.body?.activeBadge);
    const maxImages = Math.max(
      1,
      Math.min(12, Number(req.body?.maxImages) || 3)
    );
    const overlayMode =
      req.body?.overlayMode === 'full'
        ? 'full'
        : req.body?.overlayMode === 'corner'
          ? 'corner'
          : 'frame';
    const framePaddingPercent = Math.max(
      0,
      Math.min(40, Number.isFinite(Number(req.body?.framePaddingPercent)) ? Number(req.body?.framePaddingPercent) : 0)
    );
    const overlayScalePercent = Math.max(
      8,
      Math.min(80, Number(req.body?.overlayScalePercent) || 30)
    );
    const allowedPositions = new Set([
      'bottom-left',
      'bottom-right',
      'top-left',
      'top-right',
      'center',
    ]);
    const overlayPosition = allowedPositions.has(req.body?.overlayPosition)
      ? req.body.overlayPosition
      : 'bottom-left';
    const outputMaxPx = Math.max(
      400,
      Math.min(2400, Number(req.body?.outputMaxPx) || 1600)
    );

    if (!activeBadge) {
      return res.status(400).json({ error: 'activeBadge is required (letters, numbers, hyphen)' });
    }

    const badgePath = await resolveOverlayBadgePath(activeBadge);
    if (!badgePath) {
      return res.status(400).json({
        error: `No overlay file found for "${activeBadge}". Upload a badge first.`,
      });
    }

    const doc = await ImageOverlaySettings.findOneAndUpdate(
      { settingsKey: 'global' },
      {
        $set: {
          enabled,
          activeBadge,
          maxImages,
          overlayMode,
          framePaddingPercent,
          overlayScalePercent,
          overlayPosition,
          outputMaxPx,
        },
      },
      { new: true, upsert: true }
    ).lean();

    invalidateImageOverlaySettingsCache();

    res.json({
      settings: {
        enabled: doc.enabled,
        activeBadge: doc.activeBadge,
        maxImages: doc.maxImages,
        overlayMode: doc.overlayMode,
        framePaddingPercent: doc.framePaddingPercent,
        overlayScalePercent: doc.overlayScalePercent,
        overlayPosition: doc.overlayPosition,
        outputMaxPx: doc.outputMaxPx,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error('[ImageOverlaySettings] PUT:', err);
    res.status(500).json({ error: err.message || 'Failed to save overlay settings' });
  }
});

router.post(
  '/badges',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Image file is required' });
      }

      const ext = path.extname(req.file.originalname || '').toLowerCase();
      if (!OVERLAY_EXTENSIONS.includes(ext)) {
        return res.status(400).json({ error: `File must be ${OVERLAY_EXTENSIONS.join(', ')}` });
      }

      const name =
        sanitizeOverlayBadgeName(req.body?.name)
        || sanitizeOverlayBadgeName(path.basename(req.file.originalname, ext));
      if (!name) {
        return res.status(400).json({
          error: 'Invalid badge name. Use letters, numbers, and hyphens (e.g. usa-seller).',
        });
      }

      await ensureOverlayBadgesDir();

      // Remove other extensions for same badge name
      for (const otherExt of OVERLAY_EXTENSIONS) {
        const oldPath = path.join(OVERLAY_BADGES_DIR, `${name}${otherExt}`);
        try {
          await fs.unlink(oldPath);
        } catch {
          // ignore
        }
      }

      const destPath = path.join(OVERLAY_BADGES_DIR, `${name}${ext}`);
      await fs.writeFile(destPath, req.file.buffer);

      invalidateImageOverlaySettingsCache();

      res.json({
        ok: true,
        badge: {
          name,
          extension: ext,
          previewUrl: overlayBadgePublicUrl(req, name, ext),
        },
      });
    } catch (err) {
      console.error('[ImageOverlaySettings] upload badge:', err);
      res.status(500).json({ error: err.message || 'Failed to upload overlay badge' });
    }
  }
);

router.delete(
  '/badges/:name',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  async (req, res) => {
    try {
      const name = sanitizeOverlayBadgeName(req.params.name);
      if (!name) return res.status(400).json({ error: 'Invalid badge name' });

      let removed = 0;
      for (const ext of OVERLAY_EXTENSIONS) {
        const filePath = path.join(OVERLAY_BADGES_DIR, `${name}${ext}`);
        try {
          await fs.unlink(filePath);
          removed += 1;
        } catch {
          // ignore
        }
      }

      if (removed === 0) {
        return res.status(404).json({ error: 'Overlay badge not found' });
      }

      const doc = await ImageOverlaySettings.findOne({ settingsKey: 'global' });
      if (doc?.activeBadge === name) {
        const remaining = await listOverlayBadges();
        doc.activeBadge = remaining[0]?.name || 'usa-seller';
        await doc.save();
      }

      invalidateImageOverlaySettingsCache();
      res.json({ ok: true, removed: name });
    } catch (err) {
      console.error('[ImageOverlaySettings] delete badge:', err);
      res.status(500).json({ error: err.message || 'Failed to delete overlay badge' });
    }
  }
);

router.post('/preview', requireAuth, requirePageAccess('ImageOverlaySettings'), async (req, res) => {
  try {
    const sampleImageUrl = String(req.body?.sampleImageUrl || '').trim();
    const badgeName =
      sanitizeOverlayBadgeName(req.body?.badgeName)
      || (await getImageOverlayRuntimeConfig()).activeBadge;

    if (!sampleImageUrl) {
      return res.status(400).json({ error: 'sampleImageUrl is required' });
    }

    const runtime = await getImageOverlayRuntimeConfig();
    if (!runtime.imgbbConfigured) {
      return res.status(400).json({
        error: 'IMGBB_API_KEY is not set on the server. Overlays are uploaded to ImgBB after processing.',
      });
    }

    const processedUrl = await createEbayImageWithOverlay(sampleImageUrl, badgeName);
    res.json({
      ok: true,
      originalUrl: sampleImageUrl,
      processedUrl,
      badgeName,
    });
  } catch (err) {
    console.error('[ImageOverlaySettings] preview:', err);
    res.status(500).json({ error: err.message || 'Preview failed' });
  }
});

/** List templates with their per-template overlay config (1st scraped image). */
router.get('/templates', requireAuth, requirePageAccess('ImageOverlaySettings'), async (req, res) => {
  try {
    const templates = await ListingTemplate.find({})
      .select('name imageOverlay textOverlay updatedAt')
      .sort({ name: 1 })
      .lean();

    res.json({
      templates: templates.map((t) => {
        const badgeName = t.imageOverlay?.badgeName || null;
        const original = String(t.imageOverlay?.originalFilename || '');
        const extMatch = original.match(/\.(png|jpe?g|webp)$/i);
        const extension = extMatch ? `.${extMatch[1].toLowerCase()}` : '.png';
        const textOverlay = t.textOverlay || {};
        return {
          _id: t._id,
          name: t.name,
          imageOverlay: {
            enabled: Boolean(t.imageOverlay?.enabled),
            badgeName,
            originalFilename: t.imageOverlay?.originalFilename || null,
            updatedAt: t.imageOverlay?.updatedAt || null,
            previewUrl: badgeName
              ? overlayBadgePublicUrl(req, badgeName, extension)
              : null,
          },
          textOverlay: {
            enabled: Boolean(textOverlay.enabled),
            sourceField: textOverlay.sourceField || 'custom',
            customText: textOverlay.customText || '',
            position: textOverlay.position || 'bottom',
            fontSize: Number(textOverlay.fontSize) || 0,
            textColor: textOverlay.textColor || '#FFFFFF',
            backgroundColor: textOverlay.backgroundColor || '#000000',
            backgroundOpacity: Number.isFinite(Number(textOverlay.backgroundOpacity))
              ? Number(textOverlay.backgroundOpacity)
              : 0.55,
            updatedAt: textOverlay.updatedAt || null,
          },
        };
      }),
    });
  } catch (err) {
    console.error('[ImageOverlaySettings] GET templates:', err);
    res.status(500).json({ error: err.message || 'Failed to load templates' });
  }
});

/** Enable/disable per-template overlay (requires an uploaded badge). */
router.put(
  '/templates/:templateId',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  async (req, res) => {
    try {
      const template = await ListingTemplate.findById(req.params.templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const enabled = Boolean(req.body?.enabled);
      if (enabled && !template.imageOverlay?.badgeName) {
        return res.status(400).json({
          error: 'Upload an overlay image for this template before enabling.',
        });
      }

      template.imageOverlay = {
        enabled,
        badgeName: template.imageOverlay?.badgeName || null,
        originalFilename: template.imageOverlay?.originalFilename || null,
        updatedAt: new Date(),
      };
      await template.save();

      res.json({
        ok: true,
        template: {
          _id: template._id,
          name: template.name,
          imageOverlay: template.imageOverlay,
        },
      });
    } catch (err) {
      console.error('[ImageOverlaySettings] PUT template overlay:', err);
      res.status(500).json({ error: err.message || 'Failed to update template overlay' });
    }
  }
);

/** Upload / replace overlay frame for a template (applied to 1st scraped image). */
router.post(
  '/templates/:templateId/overlay',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    try {
      const template = await ListingTemplate.findById(req.params.templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'file is required (PNG recommended)' });
      }

      const ext = path.extname(req.file.originalname || '').toLowerCase() || '.png';
      if (!OVERLAY_EXTENSIONS.includes(ext)) {
        return res.status(400).json({ error: `Allowed types: ${OVERLAY_EXTENSIONS.join(', ')}` });
      }

      await ensureOverlayBadgesDir();
      const badgeName = templateOverlayBadgeName(template._id);

      for (const oldExt of OVERLAY_EXTENSIONS) {
        try {
          await fs.unlink(path.join(OVERLAY_BADGES_DIR, `${badgeName}${oldExt}`));
        } catch {
          // ignore
        }
      }

      await fs.writeFile(path.join(OVERLAY_BADGES_DIR, `${badgeName}${ext}`), req.file.buffer);

      template.imageOverlay = {
        enabled: true,
        badgeName,
        originalFilename: req.file.originalname || `${badgeName}${ext}`,
        updatedAt: new Date(),
      };
      await template.save();

      res.json({
        ok: true,
        template: {
          _id: template._id,
          name: template.name,
          imageOverlay: {
            enabled: Boolean(template.imageOverlay?.enabled),
            badgeName: template.imageOverlay?.badgeName || null,
            originalFilename: template.imageOverlay?.originalFilename || null,
            updatedAt: template.imageOverlay?.updatedAt || null,
            previewUrl: overlayBadgePublicUrl(req, badgeName, ext),
          },
        },
      });
    } catch (err) {
      console.error('[ImageOverlaySettings] upload template overlay:', err);
      res.status(500).json({ error: err.message || 'Failed to upload template overlay' });
    }
  }
);

/** Remove per-template overlay image and disable. */
router.delete(
  '/templates/:templateId/overlay',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  async (req, res) => {
    try {
      const template = await ListingTemplate.findById(req.params.templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const badgeName =
        sanitizeOverlayBadgeName(template.imageOverlay?.badgeName) ||
        templateOverlayBadgeName(template._id);

      for (const ext of OVERLAY_EXTENSIONS) {
        try {
          await fs.unlink(path.join(OVERLAY_BADGES_DIR, `${badgeName}${ext}`));
        } catch {
          // ignore
        }
      }

      template.imageOverlay = {
        enabled: false,
        badgeName: null,
        originalFilename: null,
        updatedAt: new Date(),
      };
      await template.save();

      res.json({
        ok: true,
        template: {
          _id: template._id,
          name: template.name,
          imageOverlay: template.imageOverlay,
        },
      });
    } catch (err) {
      console.error('[ImageOverlaySettings] delete template overlay:', err);
      res.status(500).json({ error: err.message || 'Failed to delete template overlay' });
    }
  }
);

function normalizeTextOverlayBody(body = {}) {
  const sourceField = ['custom', 'brand', 'title', 'price'].includes(body.sourceField)
    ? body.sourceField
    : 'custom';
  const position = ['top', 'bottom', 'center'].includes(body.position)
    ? body.position
    : 'bottom';
  const customText = String(body.customText || '').trim().slice(0, 500);
  if (Boolean(body.enabled) && sourceField === 'custom' && !customText) {
    return { error: 'Custom text is required when text source is Custom text.' };
  }
  return {
    enabled: Boolean(body.enabled),
    sourceField,
    customText,
    position,
    fontSize: Math.max(0, Math.min(120, Number(body.fontSize) || 0)),
    textColor: String(body.textColor || '#FFFFFF').trim() || '#FFFFFF',
    backgroundColor: String(body.backgroundColor || '#000000').trim() || '#000000',
    backgroundOpacity: Math.max(
      0,
      Math.min(1, Number.isFinite(Number(body.backgroundOpacity)) ? Number(body.backgroundOpacity) : 0.55)
    ),
    updatedAt: new Date(),
  };
}

/** Save per-template scraped-text overlay settings. */
router.put(
  '/templates/:templateId/text-overlay',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  async (req, res) => {
    try {
      const template = await ListingTemplate.findById(req.params.templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const next = normalizeTextOverlayBody(req.body || {});
      if (next.error) {
        return res.status(400).json({ error: next.error });
      }

      template.textOverlay = next;
      await template.save();

      res.json({
        ok: true,
        template: {
          _id: template._id,
          name: template.name,
          textOverlay: template.textOverlay,
        },
      });
    } catch (err) {
      console.error('[ImageOverlaySettings] PUT text overlay:', err);
      res.status(500).json({ error: err.message || 'Failed to save text overlay' });
    }
  }
);

/** Preview scraped/custom text drawn on a sample product image. */
router.post(
  '/preview-text',
  requireAuth,
  requirePageAccess('ImageOverlaySettings'),
  async (req, res) => {
    try {
      const sampleImageUrl = String(req.body?.sampleImageUrl || '').trim();
      const text = String(req.body?.text || '').trim();
      if (!sampleImageUrl) {
        return res.status(400).json({ error: 'sampleImageUrl is required' });
      }
      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }

      const runtime = await getImageOverlayRuntimeConfig();
      if (!runtime.imgbbConfigured) {
        return res.status(400).json({
          error: 'IMGBB_API_KEY is not set on the server. Overlays are uploaded to ImgBB after processing.',
        });
      }

      const style = normalizeTextOverlayBody({ ...req.body, enabled: true });
      const processedUrl = await createEbayImageWithTextOverlay(sampleImageUrl, text, style);
      res.json({
        ok: true,
        originalUrl: sampleImageUrl,
        processedUrl,
        text,
        style,
      });
    } catch (err) {
      console.error('[ImageOverlaySettings] preview-text:', err);
      res.status(500).json({ error: err.message || 'Text preview failed' });
    }
  }
);

export default router;
