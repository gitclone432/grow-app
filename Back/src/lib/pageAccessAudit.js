import PageAccessAuditLog from '../models/PageAccessAuditLog.js';
import { PAGE_DEFAULT_ROLES } from '../middleware/auth.js';

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function normalizePagePermissions(pagePermissions) {
  if (!Array.isArray(pagePermissions)) {
    return [];
  }

  const normalized = new Set();

  pagePermissions.forEach((pageId) => {
    if (typeof pageId === 'string' && pageId.trim()) {
      normalized.add(pageId.trim());
    }
  });

  return sortStrings(normalized);
}

function roleHasDefaultAccess(role, defaultRoles = []) {
  if (role === 'superadmin') {
    return true;
  }

  if (defaultRoles.includes('_all')) {
    return true;
  }

  if (defaultRoles.includes('_all_except_superadmin')) {
    return role !== 'superadmin';
  }

  return defaultRoles.includes(role);
}

export function getDefaultPagePermissions(role) {
  const pageIds = Object.entries(PAGE_DEFAULT_ROLES)
    .filter(([, defaultRoles]) => roleHasDefaultAccess(role, defaultRoles))
    .map(([pageId]) => pageId);

  return sortStrings(pageIds);
}

export function buildPermissionSnapshot(userLike) {
  if (!userLike) {
    return null;
  }

  const role = userLike.role || 'unknown';
  const useCustomPermissions = Boolean(userLike.useCustomPermissions);
  const pagePermissions = normalizePagePermissions(userLike.pagePermissions || []);

  let effectivePagePermissions;
  if (role === 'superadmin') {
    effectivePagePermissions = sortStrings(new Set([...Object.keys(PAGE_DEFAULT_ROLES), ...pagePermissions]));
  } else if (useCustomPermissions) {
    effectivePagePermissions = pagePermissions;
  } else {
    effectivePagePermissions = getDefaultPagePermissions(role);
  }

  return {
    role,
    useCustomPermissions,
    pagePermissions,
    effectivePagePermissions,
    permissionsVersion: userLike.permissionsVersion || 1,
  };
}

function difference(afterValues = [], beforeValues = []) {
  const beforeSet = new Set(beforeValues);
  return afterValues.filter((value) => !beforeSet.has(value));
}

export function diffPermissionSnapshots(beforeSnapshot, afterSnapshot) {
  const before = beforeSnapshot || {
    role: null,
    useCustomPermissions: false,
    pagePermissions: [],
    effectivePagePermissions: [],
    permissionsVersion: 0,
  };

  const after = afterSnapshot || {
    role: null,
    useCustomPermissions: false,
    pagePermissions: [],
    effectivePagePermissions: [],
    permissionsVersion: 0,
  };

  const addedStoredPermissions = difference(after.pagePermissions, before.pagePermissions);
  const removedStoredPermissions = difference(before.pagePermissions, after.pagePermissions);
  const grantedEffectivePermissions = difference(after.effectivePagePermissions, before.effectivePagePermissions);
  const revokedEffectivePermissions = difference(before.effectivePagePermissions, after.effectivePagePermissions);
  const useCustomPermissionsChanged = before.useCustomPermissions !== after.useCustomPermissions;
  const roleChanged = before.role !== after.role;
  const configurationChanged =
    roleChanged ||
    useCustomPermissionsChanged ||
    addedStoredPermissions.length > 0 ||
    removedStoredPermissions.length > 0;
  const effectiveAccessChanged =
    roleChanged ||
    grantedEffectivePermissions.length > 0 ||
    revokedEffectivePermissions.length > 0;

  return {
    addedStoredPermissions,
    removedStoredPermissions,
    grantedEffectivePermissions,
    revokedEffectivePermissions,
    useCustomPermissionsChanged,
    roleChanged,
    configurationChanged,
    effectiveAccessChanged,
  };
}

export function collectAffectedPageIds(diff) {
  return sortStrings(new Set([
    ...(diff?.addedStoredPermissions || []),
    ...(diff?.removedStoredPermissions || []),
    ...(diff?.grantedEffectivePermissions || []),
    ...(diff?.revokedEffectivePermissions || []),
  ]));
}

export function getRequestMetadata(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || '',
  };
}

function toAuditUser(userLike, fallback = {}) {
  return {
    id: userLike?._id || userLike?.id || fallback.id,
    username: userLike?.username || fallback.username || 'Unknown',
    email: userLike?.email || fallback.email || '',
    role: userLike?.role || fallback.role || 'unknown',
  };
}

export async function createPageAccessAuditLog({
  actor,
  target,
  before,
  after,
  diff,
  eventType,
  source,
  sessionInvalidated = false,
  reason = '',
  metadata = {},
}) {
  return PageAccessAuditLog.create({
    eventType,
    source,
    actor: toAuditUser(actor),
    target: toAuditUser(target),
    before,
    after,
    diff,
    affectedPageIds: collectAffectedPageIds(diff),
    effectiveAccessChanged: Boolean(diff?.effectiveAccessChanged),
    sessionInvalidated,
    reason,
    metadata,
  });
}