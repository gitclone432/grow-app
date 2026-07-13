import express from 'express';
import DescriptionTemplateGallery from '../models/DescriptionTemplateGallery.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

const DESCRIPTION_GALLERY_READ_PAGES = [
  'DescriptionTemplates',
  'StoresPage',
  'ManageStores',
  'TemplateListingsLab',
  'SellerTemplatesLab',
  'SelectSellerLab',
  'ListingDirectory',
  'TemplateDirectory',
];

async function getSingleton() {
  return DescriptionTemplateGallery.findOneAndUpdate(
    { key: 'singleton' },
    { $setOnInsert: { key: 'singleton', templates: [], storeTemplateMap: {} } },
    { upsert: true, new: true }
  );
}

function sanitizeTemplates(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    const id = String(item?.id ?? '').trim();
    const html = String(item?.html ?? '');
    const title = String(item?.title ?? '').trim();
    if (!id || !html.trim()) continue;
    out.push({
      id,
      title: title || id,
      html,
    });
  }
  return out;
}

router.get('/', requireAuth, requirePageAccess(DESCRIPTION_GALLERY_READ_PAGES), async (req, res) => {
  try {
    const doc = await getSingleton();
    const map = doc.storeTemplateMap && typeof doc.storeTemplateMap === 'object' ? doc.storeTemplateMap : {};
    res.json({
      templates: doc.templates || [],
      storeTemplateMap: map,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('[description-template-gallery] GET:', err.message);
    res.status(500).json({ error: 'Failed to load description template gallery' });
  }
});

/** Replace gallery templates list (does not alter store assignments) */
router.put('/templates', requireAuth, requirePageAccess('DescriptionTemplates'), async (req, res) => {
  try {
    const doc = await getSingleton();
    doc.templates = sanitizeTemplates(req.body?.templates);
    await doc.save();
    const map = doc.storeTemplateMap && typeof doc.storeTemplateMap === 'object' ? doc.storeTemplateMap : {};
    res.json({
      templates: doc.templates,
      storeTemplateMap: map,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('[description-template-gallery] PUT templates:', err.message);
    res.status(500).json({ error: 'Failed to save description templates' });
  }
});

/** Merge assignments for one or more sellers (sellerId -> template id or empty string) */
router.patch('/store-map', requireAuth, requirePageAccess(['StoresPage', 'ManageStores']), async (req, res) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Body must be a JSON object of sellerId -> templateId' });
    }

    const doc = await getSingleton();
    let map = doc.storeTemplateMap && typeof doc.storeTemplateMap === 'object' ? { ...doc.storeTemplateMap } : {};

    for (const [sellerIdRaw, templateIdRaw] of Object.entries(patch)) {
      const sellerId = String(sellerIdRaw || '').trim();
      if (!sellerId) continue;
      if (templateIdRaw === '' || templateIdRaw === null || templateIdRaw === undefined) {
        delete map[sellerId];
      } else {
        map[sellerId] = String(templateIdRaw);
      }
    }

    doc.storeTemplateMap = map;
    await doc.save();

    res.json({
      templates: doc.templates || [],
      storeTemplateMap: doc.storeTemplateMap,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('[description-template-gallery] PATCH store-map:', err.message);
    res.status(500).json({ error: 'Failed to update store template map' });
  }
});

export default router;
