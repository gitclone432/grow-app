import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import FeaturePermission from '../models/FeaturePermission.js';

/** Short-lived in-memory cache for auth version checks (cuts DB round-trips on page APIs). */
const AUTH_VERSION_CACHE_TTL_MS = 60_000;
const authVersionCache = new Map();

function getCachedAuthVersions(userId) {
  const entry = authVersionCache.get(String(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authVersionCache.delete(String(userId));
    return null;
  }
  return entry.value;
}

function setCachedAuthVersions(userId, value) {
  authVersionCache.set(String(userId), {
    value,
    expiresAt: Date.now() + AUTH_VERSION_CACHE_TTL_MS,
  });
}

async function loadAuthVersions(userId) {
  const cached = getCachedAuthVersions(userId);
  if (cached) return cached;
  const user = await User.findById(userId).select('tokenVersion permissionsVersion').lean();
  if (!user) return null;
  const value = {
    tokenVersion: user.tokenVersion || 1,
    permissionsVersion: user.permissionsVersion || 1,
  };
  setCachedAuthVersions(userId, value);
  return value;
}

/** Invalidate after password reset / permission changes if callers know the userId. */
export function invalidateAuthVersionCache(userId) {
  if (userId) authVersionCache.delete(String(userId));
  else authVersionCache.clear();
}

// Page registry: maps pageId -> defaultRoles (backward compat)
// This is the server-side source of truth for which roles have default access to each page
export const PAGE_DEFAULT_ROLES = {
  // Store Listings
  'StoreListings': ['superadmin', 'listingadmin'],
  'SendOfferEligible': ['superadmin', 'listingadmin'],

  // Order Fulfilment
  'OrdersDashboard': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'OrderAnalytics': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'MicroOrders': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'LegacyItemAnalytics': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'CRPAnalytics': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'CRPComparison': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'Fulfillment': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'AwaitingShipment': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'AwaitingSheet': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'AmazonArrivals': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'FulfillmentNotes': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],

  // Compatibility
  'CompatibilityDashboard': ['superadmin', 'compatibilityadmin', 'compatibilityeditor'],
  'CompatibilityTasks': ['superadmin', 'compatibilityadmin'],
  'CompatibilityProgress': ['superadmin', 'compatibilityadmin'],
  'AiFitmentUsage': ['superadmin', 'compatibilityadmin'],
  'ListingStats': ['superadmin', 'compatibilityadmin'],
  'CompatibilityBatchHistory': ['superadmin', 'compatibilityadmin', 'compatibilityeditor'],
  'EditListings': ['superadmin', 'compatibilityadmin', 'compatibilityeditor'],
  'CompatibilityEditor': ['superadmin', 'compatibilityeditor'],
  'AddCompatibilityEditor': ['superadmin', 'compatibilityadmin'],

  // Listing & Research
  'ManageTemplates': ['superadmin'],
  'AmazonPiSourceColumns': ['superadmin', 'listingadmin'],
  'ListingsDatabase': ['superadmin'],
  'SelectSellerLab': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'SellerTemplatesLab': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'AsinPrecheck': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'AsinPrecheckStats': ['superadmin'],
  'TemplateListingsLab': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'ListingDirectory': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'TemplateDirectory': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'TemplateListingAnalytics': ['superadmin', 'lister', 'advancelister', 'trainee'],
  'AsinDirectory': ['superadmin', 'productadmin'],
  'AsinLists': ['superadmin', 'productadmin'],
  'FeedUpload': ['superadmin', 'listingadmin', 'lister'],
  'DirectList': ['superadmin', 'listingadmin', 'lister'],
  'FeedUploadStats': ['superadmin', 'listingadmin'],
  'DailyListingComparison': ['superadmin', 'listingadmin'],
  'ManualEndListing': ['superadmin', 'listingadmin'],
  'UserCategoryTargets': ['superadmin', 'hradmin', 'hr'],
  'UserListingPerformance': ['superadmin', 'hradmin', 'hr'],
  'SkuSellerOrderProfit': ['superadmin', 'listingadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'AiListingUsage': ['superadmin', 'listingadmin'],
  'SellerUploadLimits': ['superadmin', 'listingadmin'],
  'CsvStorage': ['superadmin', 'listingadmin', 'lister'],

  // Finance & Cash Flow
  'Payoneer': ['superadmin'],
  'BankAccounts': ['superadmin'],
  'Transactions': ['superadmin'],
  'ExtraExpenses': ['superadmin'],
  'RevenueGrossNet': ['superadmin'],
  'Cashflow': ['superadmin'],
  'Affiliate': ['superadmin'],
  'Salary': ['superadmin'],
  'AllOrdersSheet': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'PriceChangeHistory': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'SellerAnalytics': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],

  // Compliance & Support
  'ComplianceBoard': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'ComplianceMonitoring': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'Disputes': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'AccountHealth': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'BuyerMessages': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'ConversationManagement': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'AmazonAccounts': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'CreditCards': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'ExcludeOrderQtySkips': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],
  'CronJobs': ['superadmin'],
  'AffiliateOrders': ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],

  // eBay Parameters
  'StoreOverview': ['superadmin', 'listingadmin'],
  'EbayApiUsage': ['superadmin', 'listingadmin'],
  'Analytics': ['superadmin', 'listingadmin'],
  'AnalyticsSellerStandards': ['superadmin', 'listingadmin'],
  'EbayAnalyticsHub': ['superadmin', 'listingadmin'],
  'EbayFeedback': ['superadmin', 'listingadmin'],
  'EbayApiTester': ['superadmin', 'listingadmin'],
  'SkuIndexSync': ['superadmin', 'listingadmin'],
  'DuplicateSkus': ['superadmin', 'listingadmin'],
  'SkuIndexDashboard': ['superadmin', 'listingadmin'],
  'AmazonStockCheck': ['superadmin', 'listingadmin'],
  'SellerSkuStockCheck': ['superadmin', 'listingadmin'],
  'ExpiringListings': ['superadmin', 'listingadmin'],
  'ActiveListingTiers': ['superadmin', 'listingadmin'],
  'EndListingStats': ['superadmin', 'listingadmin'],
  'EndListingByDate': ['superadmin', 'listingadmin'],
  'PrecheckAiUsage': ['superadmin', 'listingadmin'],
  'AdsAndMarketing': ['superadmin', 'listingadmin'],
  'MarketingCampaigns': ['superadmin', 'listingadmin'],
  'MarketingPromotions': ['superadmin', 'listingadmin'],
  'SellerFunds': ['superadmin', 'listingadmin'],
  'FinancesTransactionSummary': ['superadmin', 'listingadmin'],
  'FinancesTransactions': ['superadmin', 'listingadmin'],
  'FinancesPayoutGroups': ['superadmin', 'listingadmin'],
  'Discounts': ['superadmin', 'listingadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'],

  // HR & Management
  'IdeasAndIssues': ['superadmin', 'hradmin', 'operationhead', 'listingadmin'],
  'TeamChat': ['superadmin', 'hradmin', 'operationhead', 'listingadmin'],
  'LeaveAdmin': ['superadmin', 'hradmin'],
  'EmployeeManagement': ['superadmin', 'listingadmin', 'hradmin', 'operationhead'],
  'AddUser': ['superadmin', 'listingadmin', 'hradmin', 'operationhead'],
  'AddSeller': ['superadmin', 'hradmin', 'operationhead'],
  'UserSellerAssignments': ['superadmin', 'hradmin', 'hr'],
  'Meetings': ['superadmin', 'productadmin', 'listingadmin', 'lister', 'advancelister', 'compatibilityadmin', 'compatibilityeditor', 'fulfillmentadmin', 'hradmin', 'hr', 'operationhead', 'trainee', 'hoc', 'compliancemanager'],
  'ViewAllMessages': ['superadmin'],
  'Attendance': ['superadmin'],
  'PageAccessManagement': ['superadmin'],
  'PageAccessAuditLog': ['superadmin'],
  'UserPasswordManagement': ['superadmin'],

  // Others (superadmin only by default)
  'ManageCategories': ['superadmin', 'productadmin'],
  'ManagePlatforms': ['superadmin', 'listingadmin'],
  'ManageStores': ['superadmin', 'listingadmin'],
  'ProductTable': ['superadmin', 'listingadmin'],
  // Legacy page IDs kept for shared assignment/task/range APIs used by other pages
  'TaskList': ['superadmin', 'listingadmin'],
  'Assignments': ['superadmin', 'listingadmin'],
  'RangeAnalyzer': ['superadmin', 'listingadmin', 'lister', 'advancelister', 'trainee'],
  'ColumnCreator': ['superadmin', 'productadmin'],
  'ManageRanges': ['superadmin', 'productadmin'],
  'UserPerformance': ['superadmin'],
  // Etsy
  'EtsyProducts': ['superadmin', 'listingadmin'],
  'EtsyOrderFulfilment': ['superadmin', 'listingadmin'],
  'EtsyOrderAnalytics': ['superadmin', 'listingadmin'],
  'EtsyProfitSheet': ['superadmin', 'listingadmin'],
  'EtsyDashboard': ['superadmin', 'listingadmin'],

  // Stores
  'StoresPage': ['superadmin', 'listingadmin'],
  'EtsyStoresPage': ['superadmin', 'listingadmin'],

  // Settings
  'SettingsPage': ['superadmin', 'listingadmin'],
  'DescriptionTemplates': ['superadmin', 'listingadmin'],
  'ScraperTester': ['superadmin', 'listingadmin'],
  'ImageOverlaySettings': ['superadmin', 'listingadmin'],
  'GmailTester': ['superadmin'],

  // Shared pages (accessible to all authenticated users)
  'AboutMe': ['_all_except_superadmin'],
  'MyLeaves': ['_all_except_superadmin'],
  'InternalMessages': ['_all'],
  'Ideas': ['_all'],
};

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // NOTE: The former req.query.token fallback has been removed — passing JWTs in
  // query parameters leaks them into server logs, browser history, and Referer
  // headers. SSE endpoints that cannot use Authorization headers should use the
  // dedicated requireAuthSSE middleware below instead.

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const versions = await loadAuthVersions(payload.userId);
    if (!versions) {
      return res.status(401).json({ error: 'User not found' });
    }

    const payloadTokenVersion = payload.tokenVersion || 1;
    if (payloadTokenVersion !== versions.tokenVersion) {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }

    const payloadPermissionsVersion = payload.permissionsVersion || 1;
    if (payloadPermissionsVersion !== versions.permissionsVersion) {
      return res.status(401).json({ error: 'Your access permissions have been updated. Please login again.' });
    }

    req.user = payload; // { userId, role, tokenVersion, permissionsVersion }
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * SSE-only auth middleware.
 * The browser's native EventSource API cannot set custom headers, so SSE
 * endpoints must accept the token via ?token= query param. This middleware
 * is intentionally scoped to SSE routes only — all other routes use requireAuth.
 */
export async function requireAuthSSE(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null)
    || req.query.token || null;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const versions = await loadAuthVersions(payload.userId);
    if (!versions) return res.status(401).json({ error: 'User not found' });

    if ((payload.tokenVersion || 1) !== versions.tokenVersion) {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    if ((payload.permissionsVersion || 1) !== versions.permissionsVersion) {
      return res.status(401).json({ error: 'Your access permissions have been updated. Please login again.' });
    }
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * File-serving auth middleware.
 * Browser <img src> tags cannot set custom headers, so file-retrieval endpoints
 * must accept the token via ?token= query param in addition to the Authorization
 * header. This is intentionally scoped to file-serving GET routes only.
 */
export async function requireAuthFile(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null)
    || req.query.token || null;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const versions = await loadAuthVersions(payload.userId);
    if (!versions) return res.status(401).json({ error: 'User not found' });

    if ((payload.tokenVersion || 1) !== versions.tokenVersion) {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    if ((payload.permissionsVersion || 1) !== versions.permissionsVersion) {
      return res.status(401).json({ error: 'Your access permissions have been updated. Please login again.' });
    }
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Legacy role check — kept for non-page-specific routes
export function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

/**
 * New page-based access control middleware.
 * Replaces requireRole() for all admin-managed page routes.
 *
 * @param {string|string[]} pageId - Single page identifier or array of page IDs (user needs access to ANY one)
 * @param {string[]} [defaultRoles] - Override default roles (optional, falls back to PAGE_DEFAULT_ROLES)
 */
export function requirePageAccess(pageId, defaultRoles) {
  // Normalize to array for consistent handling
  const pageIds = Array.isArray(pageId) ? pageId : [pageId];
  
  // Collect fallback roles from all pages (if defaultRoles not provided)
  let fallbackRoles = defaultRoles;
  if (!fallbackRoles) {
    const allRoles = new Set();
    pageIds.forEach(id => {
      const roles = PAGE_DEFAULT_ROLES[id] || [];
      roles.forEach(role => allRoles.add(role));
    });
    fallbackRoles = Array.from(allRoles);
  }

  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Superadmin always has access
    if (req.user.role === 'superadmin') {
      return next();
    }

    try {
      // Fetch user's permission settings from DB
      const user = await User.findById(req.user.userId).select('pagePermissions useCustomPermissions role').lean();
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.useCustomPermissions) {
        // Custom permissions mode: check if user has access to ANY of the requested pages
        const hasAccess = user.pagePermissions && pageIds.some(id => user.pagePermissions.includes(id));
        if (hasAccess) {
          return next();
        }
        return res.status(403).json({ error: 'Forbidden: You do not have access to this page' });
      } else {
        // Default mode: check role-based defaults
        // Handle special role groups
        if (fallbackRoles.includes('_all')) {
          return next();
        }
        if (fallbackRoles.includes('_all_except_superadmin')) {
          return next(); // Already not superadmin (checked above)
        }
        if (fallbackRoles.includes(user.role)) {
          return next();
        }
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch (err) {
      console.error('requirePageAccess error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// Button/feature-level gate, finer-grained than requirePageAccess: superadmin
// always passes, everyone else must be explicitly listed in the FeaturePermission
// doc for featureId (defaults to nobody until a superadmin configures it).
export function requireFeatureAccess(featureId) {
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    try {
      const permission = await FeaturePermission.findOne({ featureId }).lean();
      const allowedUserIds = permission?.allowedUserIds || [];
      const isAllowed = allowedUserIds.some((id) => id.toString() === req.user.userId);
      if (isAllowed) {
        return next();
      }
      return res.status(403).json({ error: 'Forbidden: You do not have access to this feature' });
    } catch (err) {
      console.error('requireFeatureAccess error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
