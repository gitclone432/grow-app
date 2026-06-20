import DescriptionTemplateGallery from '../models/DescriptionTemplateGallery.js';

export async function patchDescriptionTemplateStoreMap(patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return null;
  }

  const doc = await DescriptionTemplateGallery.findOneAndUpdate(
    { key: 'singleton' },
    { $setOnInsert: { key: 'singleton', templates: [], storeTemplateMap: {} } },
    { upsert: true, new: true }
  );

  const map = doc.storeTemplateMap && typeof doc.storeTemplateMap === 'object'
    ? { ...doc.storeTemplateMap }
    : {};

  for (const [sellerIdRaw, templateIdRaw] of Object.entries(patch)) {
    const sellerId = String(sellerIdRaw || '').trim();
    if (!sellerId) continue;
    if (templateIdRaw === '' || templateIdRaw == null) {
      delete map[sellerId];
    } else {
      map[sellerId] = String(templateIdRaw);
    }
  }

  doc.storeTemplateMap = map;
  await doc.save();
  return doc;
}
