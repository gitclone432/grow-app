import { getByPath, productInfoLeafToString } from './amazonPiSourceColumnUtils.js';

/**
 * Map eBay custom column names (e.g. C:Color) → amazonData keys for direct ASIN auto-fill.
 */
const CUSTOM_COLUMN_TO_AMAZON_FIELD = {
  color: 'color',
  compatibility: 'compatibility',
  model: 'model',
  material: 'material',
  size: 'size',
  screensize: 'screenSize',
  'screen size': 'screenSize',
  features: 'specialFeatures',
  'special features': 'specialFeatures',
  type: 'productCategory',
  category: 'productCategory',
  'item includes': 'includedComponents',
  'included components': 'includedComponents',
  'form factor': 'formFactor',
  'band material': 'bandMaterial',
  'band width': 'bandWidth',
  'band color': 'bandColor',
  brand: 'brand',
  'storage capacity': 'size',
  storagecapacity: 'size',
};

/** product_information paths when top-level scrape fields are empty */
const CUSTOM_COLUMN_PI_FALLBACKS = {
  model: [
    'compatible_phone_models',
    'compatible_devices',
    'compatible_cellular_phone_models',
    'item_model_number',
    'model_number',
    'model_name',
    'model',
  ],
  material: [
    'enclosure_material',
    'material',
    'material_type',
    'outer_material',
    'material_composition',
  ],
  screensize: ['screen_size'],
  size: ['size'],
  color: ['color'],
  compatibility: ['compatible_devices', 'compatible_phone_models', 'compatible_cellular_phone_models'],
  'storage capacity': [
    'storage_capacity',
    'hard_disk_size',
    'memory_storage_capacity',
    'digital_storage_capacity',
    'flash_memory_size',
    'internal_memory_storage_capacity',
    'storage',
  ],
  storagecapacity: [
    'storage_capacity',
    'hard_disk_size',
    'memory_storage_capacity',
    'digital_storage_capacity',
    'flash_memory_size',
    'internal_memory_storage_capacity',
    'storage',
  ],
};

/** Augmented `amazon_pi_*` keys (from saved PI catalog + augmentAmazonDataWithPiColumns) */
const CUSTOM_COLUMN_PI_KEY_HINTS = {
  model: [
    'amazon_pi_compatible_phone_models',
    'amazon_pi_compatible_cellular_phone_models',
    'amazon_pi_compatible_devices',
  ],
  material: [
    'amazon_pi_enclosure_material',
    'amazon_pi_material_type',
    'amazon_pi_outer_material',
  ],
  color: ['amazon_pi_color'],
  compatibility: [
    'amazon_pi_compatible_devices',
    'amazon_pi_compatible_phone_models',
    'amazon_pi_compatible_cellular_phone_models',
  ],
  screensize: ['amazon_pi_screen_size'],
  'storage capacity': [
    'amazon_pi_storage_capacity',
    'amazon_pi_hard_disk_size',
    'amazon_pi_memory_storage_capacity',
    'amazon_pi_digital_storage_capacity',
    'amazon_pi_flash_memory_size',
  ],
  storagecapacity: [
    'amazon_pi_storage_capacity',
    'amazon_pi_hard_disk_size',
    'amazon_pi_memory_storage_capacity',
  ],
};

export function customColumnHasDefault(column) {
  return String(column?.defaultValue ?? '').trim().length > 0;
}

export function normalizeCustomColumnKey(ebayField) {
  return String(ebayField || '')
    .replace(/^C:/i, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function inferAmazonFieldForCustomColumn(ebayField) {
  const key = normalizeCustomColumnKey(ebayField);
  if (!key) return null;
  return CUSTOM_COLUMN_TO_AMAZON_FIELD[key] || null;
}

/** Custom columns use C: prefix; older configs may omit fieldType: 'custom'. */
export function isCustomFieldConfig(config) {
  if (!config) return false;
  if (config.fieldType === 'custom') return true;
  return /^C:/i.test(String(config.ebayField || ''));
}

export function toPlainFieldConfig(config) {
  if (!config) return config;
  if (typeof config.toObject === 'function') return config.toObject();
  if (typeof config.toJSON === 'function') return config.toJSON();
  return { ...config };
}

function trimCustomFieldValue(value, ebayField) {
  if (value == null || value === '') return value;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (ebayField === 'title') return text.length > 80 ? text.slice(0, 80) : text;
  if (ebayField === 'description' || ebayField === 'review') return text;
  return text.length > 60 ? text.slice(0, 60) : text;
}

export function isEmptyCustomFieldValue(value) {
  const text = String(value ?? '').trim();
  return !text || text.toLowerCase() === 'does not apply';
}

function normalizeAmazonScalar(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const text = String(value).trim();
  return text || null;
}

export function readAmazonFieldByKey(amazonField, amazonData) {
  const key = String(amazonField || '').trim();
  if (!key) return null;
  return normalizeAmazonScalar(amazonData?.[key]);
}

function readAmazonValueForCustomColumn(name, amazonData) {
  const amazonKey = inferAmazonFieldForCustomColumn(name);
  if (amazonKey) {
    const value = readAmazonFieldByKey(amazonKey, amazonData);
    if (value) return value;
  }

  const piKey = normalizeCustomColumnKey(name).replace(/\s+/g, '');
  const paths = CUSTOM_COLUMN_PI_FALLBACKS[piKey];
  const pi = amazonData?.productInformation;
  if (paths && pi && typeof pi === 'object') {
    for (const path of paths) {
      const text = productInfoLeafToString(getByPath(pi, path)).trim();
      if (text) return text;
    }
  }

  const keyHints = CUSTOM_COLUMN_PI_KEY_HINTS[piKey];
  if (keyHints) {
    for (const hintKey of keyHints) {
      const text = String(amazonData?.[hintKey] ?? '').trim();
      if (text) return text;
    }
  }

  return null;
}

/** Resolve a custom column using saved field config (PI keys) then name-based heuristics. */
export function resolveCustomColumnValue(columnName, amazonData, fieldConfig = null) {
  const configuredKey = String(fieldConfig?.amazonField || '').trim();
  if (configuredKey) {
    const configuredValue = readAmazonFieldByKey(configuredKey, amazonData);
    if (configuredValue) return configuredValue;
  }
  return readAmazonValueForCustomColumn(columnName, amazonData);
}

/** Fill custom columns from Amazon scrape when configs are missing or misrouted. */
export function fillMissingCustomColumnsFromAmazon(customColumns, amazonData, customFields, fieldConfigs = []) {
  const configByField = new Map();
  for (const config of fieldConfigs || []) {
    const plain = toPlainFieldConfig(config);
    if (plain?.ebayField) configByField.set(plain.ebayField, plain);
  }

  for (const col of customColumns || []) {
    const name = col?.name;
    if (!name || customColumnHasDefault(col)) continue;
    if (!isEmptyCustomFieldValue(customFields[name])) continue;

    const value = resolveCustomColumnValue(name, amazonData, configByField.get(name));
    if (value == null || value === '') continue;
    customFields[name] = trimCustomFieldValue(value, name);
  }
}

/** Columns with template defaults should not run ASIN auto-fill (matches Manage Templates UI). */
export function filterAutofillConfigsForColumnDefaults(fieldConfigs, customColumns) {
  const columns = Array.isArray(customColumns) ? customColumns : [];
  const columnKey = (name) => String(name || '').trim().toLowerCase();
  const columnsByKey = new Map(
    columns.filter((col) => col?.name).map((col) => [columnKey(col.name), col])
  );

  return (Array.isArray(fieldConfigs) ? fieldConfigs : []).filter((config) => {
    if (!isCustomFieldConfig(config)) return true;
    const col = columnsByKey.get(columnKey(config.ebayField));
    if (!col) return false;
    return !customColumnHasDefault(col);
  });
}

/** Merge template custom columns into field configs (fixes saved templates missing ASIN auto-fill rows). */
function hasPiAmazonField(config) {
  return String(config?.amazonField || '').startsWith('amazon_pi_');
}

export function ensureCustomColumnFieldConfigs(fieldConfigs, customColumns) {
  const byField = new Map();
  for (const config of fieldConfigs || []) {
    const plain = toPlainFieldConfig(config);
    if (plain?.ebayField) byField.set(plain.ebayField, plain);
  }

  for (const col of customColumns || []) {
    const name = col?.name;
    if (!name || customColumnHasDefault(col)) continue;

    const ideal = buildCustomColumnFieldConfig(col);
    const existing = byField.get(name);

    if (!existing) {
      byField.set(name, ideal);
      continue;
    }

    const patched = { ...existing, fieldType: 'custom' };
    if (!patched.amazonField && ideal.amazonField) {
      patched.amazonField = ideal.amazonField;
    }
    if (
      ideal.source === 'direct'
      && ideal.amazonField
      && patched.source !== 'direct'
      && !hasPiAmazonField(patched)
    ) {
      patched.source = 'direct';
      patched.promptTemplate = ideal.promptTemplate;
      patched.transform = ideal.transform;
      if (!patched.amazonField) {
        patched.amazonField = ideal.amazonField;
      }
    }
    byField.set(name, patched);
  }

  return Array.from(byField.values());
}

export function buildCustomColumnFieldConfig(column) {
  const name = column?.name || '';
  const label = column?.displayName || name;
  const inferred = inferAmazonFieldForCustomColumn(name);

  if (inferred) {
    return {
      fieldType: 'custom',
      ebayField: name,
      source: 'direct',
      promptTemplate: '',
      amazonField: inferred,
      transform: inferred === 'compatibility' || inferred === 'specialFeatures' ? 'truncate80' : 'none',
      enabled: true,
      defaultValue: '',
    };
  }

  return {
    fieldType: 'custom',
    ebayField: name,
    source: 'ai',
    promptTemplate: [
      `Output ONLY the value for eBay custom field "${label}" (one short line, max 60 characters).`,
      'Use facts from the Amazon data below. If unknown, output "Does Not Apply".',
      '',
      'Title: {title}',
      'Brand: {brand}',
      'Color: {color}',
      'Compatibility: {compatibility}',
      'Model: {model}',
      'Material: {material}',
      'Size: {size}',
      'Features: {specialFeatures}',
      'Description: {description}',
    ].join('\n'),
    amazonField: '',
    transform: 'none',
    enabled: true,
    defaultValue: '',
  };
}
