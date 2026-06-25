import { getByPath, productInfoLeafToString } from './amazonPiSourceColumnUtils.js';
import {
  inferAmazonFieldForCustomColumn,
  normalizeCustomColumnKey,
  readAmazonFieldByKey,
  resolveCustomColumnValue,
  customColumnHasDefault,
  filterCustomFieldsToTemplateColumns,
} from './customColumnAmazonMapping.js';

const STORAGE_CAPACITY_PI_PATHS = [
  'storage_capacity',
  'hard_disk_size',
  'memory_storage_capacity',
  'digital_storage_capacity',
  'flash_memory_size',
  'internal_memory_storage_capacity',
  'storage',
];

export function applyCustomColumnDefaults(customFieldsMerged, customColumns = [], options = {}) {
  if (options.reuseMode) return;

  for (const col of customColumns) {
    const defaultValue = String(col?.defaultValue ?? '').trim();
    if (!defaultValue || !col?.name) continue;

    if (customColumnHasDefault(col)) {
      customFieldsMerged[col.name] = col.defaultValue;
      continue;
    }

    const current = String(customFieldsMerged[col.name] ?? '').trim();
    if (!current || current.toLowerCase() === 'does not apply') {
      customFieldsMerged[col.name] = col.defaultValue;
    }
  }
}

function findCustomColumnByAspect(customColumns, aspectName) {
  const target = normalizeCustomColumnKey(aspectName);
  return (customColumns || []).find(
    (col) => normalizeCustomColumnKey(col?.name) === target
  );
}

function setAspectValue(fields, customColumns, aspectName, value) {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'does not apply') return;

  const column = findCustomColumnByAspect(customColumns, aspectName);
  if (!column?.name) return;

  const fieldKey = column.name;
  const current = String(fields[fieldKey] ?? '').trim();
  if (current && current.toLowerCase() !== 'does not apply') return;

  fields[fieldKey] = text.length > 65 ? text.slice(0, 65) : text;
}

function readStorageCapacityFromAmazon(amazonData = {}) {
  const pi = amazonData.productInformation;
  if (pi && typeof pi === 'object') {
    for (const path of STORAGE_CAPACITY_PI_PATHS) {
      const text = productInfoLeafToString(getByPath(pi, path)).trim();
      if (text) return text;
    }
  }

  for (const key of ['amazon_pi_storage_capacity', 'amazon_pi_hard_disk_size', 'amazon_pi_memory_storage_capacity']) {
    const text = String(amazonData[key] ?? '').trim();
    if (text) return text;
  }

  return '';
}

/**
 * Ensure template custom columns and common category aspects are populated before Trading API list.
 */
export function enrichListingItemSpecifics(listing = {}, customColumns = [], amazonData = null, options = {}) {
  if (options.reuseMode) {
    return {
      ...listing,
      customFields: filterCustomFieldsToTemplateColumns(listing.customFields || {}, customColumns),
    };
  }

  const customFields = { ...(listing.customFields || {}) };

  for (const col of customColumns) {
    const name = col?.name;
    if (!name || customColumnHasDefault(col)) continue;

    const current = String(customFields[name] ?? '').trim();
    if (current && current.toLowerCase() !== 'does not apply') continue;

    const inferred = inferAmazonFieldForCustomColumn(name);
    if (inferred && amazonData) {
      const direct = readAmazonFieldByKey(inferred, amazonData);
      if (direct) {
        customFields[name] = direct;
        continue;
      }
    }

    if (amazonData) {
      const resolved = resolveCustomColumnValue(name, amazonData);
      if (resolved) {
        customFields[name] = resolved;
      }
    }
  }

  applyCustomColumnDefaults(customFields, customColumns);

  if (amazonData) {
    setAspectValue(customFields, customColumns, 'Brand', amazonData.brand);
    const storageCol = findCustomColumnByAspect(customColumns, 'Storage Capacity');
    if (!storageCol || !customColumnHasDefault(storageCol)) {
      setAspectValue(
        customFields,
        customColumns,
        'Storage Capacity',
        readStorageCapacityFromAmazon(amazonData)
      );
    }
  }

  applyCustomColumnDefaults(customFields, customColumns);

  return {
    ...listing,
    customFields: filterCustomFieldsToTemplateColumns(customFields, customColumns),
  };
}

export function getMissingRequiredAspects(listing = {}, requiredAspects = []) {
  const customFields = listing.customFields || {};
  return requiredAspects.filter((aspect) => {
    const column = findCustomColumnByAspect([], aspect);
    const key = column?.name || aspect;
    const direct = customFields[key];
    const normalizedKey = normalizeCustomColumnKey(aspect);
    const fromFields = Object.entries(customFields).find(
      ([name]) => normalizeCustomColumnKey(name) === normalizedKey
    )?.[1];
    const value = String(direct ?? fromFields ?? '').trim();
    return !value || value.toLowerCase() === 'does not apply';
  });
}
