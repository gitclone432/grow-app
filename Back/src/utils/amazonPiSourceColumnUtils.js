/**
 * Flatten Amazon structured `product_information` into path → string rows.
 * Nested objects become dotted paths; arrays become "a | b" (string leaves).
 */

export function getByPath(obj, path) {
  if (obj == null || path == null || path === '') return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

export function productInfoLeafToString(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((x) => (x != null && typeof x === 'object' ? JSON.stringify(x) : String(x)))
      .join(' | ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function walkProductInformation(pi, visitor, prefix = '') {
  if (pi == null) return;
  if (typeof pi !== 'object' || Array.isArray(pi)) {
    visitor(prefix, pi);
    return;
  }
  const keys = Object.keys(pi);
  if (keys.length === 0) return;
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = pi[k];
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      walkProductInformation(v, visitor, path);
    } else {
      visitor(path, v);
    }
  }
}

/**
 * @returns {{ jsonPath: string, value: string }[]}
 */
export function flattenProductInformationRows(pi) {
  const rows = [];
  if (pi == null || typeof pi !== 'object' || Array.isArray(pi)) return rows;
  walkProductInformation(pi, (jsonPath, raw) => {
    rows.push({ jsonPath, value: productInfoLeafToString(raw) });
  });
  return rows;
}

export function jsonPathToAmazonFieldKey(jsonPath) {
  const safe = String(jsonPath || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/\./g, '__');
  return `amazon_pi_${safe || 'unknown'}`;
}

export function jsonPathToDefaultLabel(jsonPath) {
  return `PI: ${String(jsonPath || '').replace(/\./g, ' › ')}`;
}

/**
 * Merge saved PI column values onto a copy of amazonData for mapping / placeholders.
 */
export function augmentAmazonDataWithPiColumns(amazonData, columns) {
  const merged = { ...amazonData };
  const pi = merged.productInformation;
  if (!pi || typeof pi !== 'object') return merged;
  for (const col of columns) {
    const raw = getByPath(pi, col.jsonPath);
    merged[col.key] = productInfoLeafToString(raw);
  }
  return merged;
}
