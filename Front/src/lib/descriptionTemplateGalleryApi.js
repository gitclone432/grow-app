import api from './api.js';

/** @deprecated Prefer server-backed gallery via fetchDescriptionTemplateGallery */
export const LEGACY_DESCRIPTION_TEMPLATES_KEY = 'description-templates.gallery.v1';
/** @deprecated Prefer server-backed store map */
export const LEGACY_STORE_TEMPLATE_MAP_KEY = 'store-description-template-map.v1';

export async function fetchDescriptionTemplateGallery() {
  const { data } = await api.get('/description-template-gallery');
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const storeTemplateMap =
    data.storeTemplateMap && typeof data.storeTemplateMap === 'object' && !Array.isArray(data.storeTemplateMap)
      ? data.storeTemplateMap
      : {};
  return { templates, storeTemplateMap, updatedAt: data.updatedAt };
}

export async function saveDescriptionTemplates(templates) {
  const { data } = await api.put('/description-template-gallery/templates', { templates });
  const saved = Array.isArray(data.templates) ? data.templates : [];
  const storeTemplateMap =
    data.storeTemplateMap && typeof data.storeTemplateMap === 'object' ? data.storeTemplateMap : {};
  return { templates: saved, storeTemplateMap };
}

/** @param {Record<string, string>} partialMap Mongo seller ids -> gallery template id (empty string clears) */
export async function patchDescriptionTemplateStoreMap(partialMap) {
  const { data } = await api.patch('/description-template-gallery/store-map', partialMap);
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const storeTemplateMap =
    data.storeTemplateMap && typeof data.storeTemplateMap === 'object' ? data.storeTemplateMap : {};
  return { templates, storeTemplateMap };
}
