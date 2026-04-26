/**
 * Central Page Registry — single source of truth for all admin pages.
 * Each page has:
 *   id          — unique key (matches backend PAGE_DEFAULT_ROLES)
 *   name        — display label in sidebar
 *   path        — frontend route (relative to /admin)
 *   category    — sidebar group key
 *   defaultRoles — roles with access by default (backward compat)
 *   component   — lazy import path (used in AdminLayout for dynamic routing)
 */

// Categories for sidebar grouping
export const PAGE_CATEGORIES = {
  orderFulfilment: { id: 'orderFulfilment', name: 'Order Fulfilment', icon: 'LocalShippingIcon' },
  compatibility: { id: 'compatibility', name: 'Compatibility', icon: 'TaskIcon' },
  listingResearch: { id: 'listingResearch', name: 'Listing & Research', icon: 'ListAltIcon' },
  finance: { id: 'finance', name: 'Finance & Cash Flow', icon: 'AttachMoneyIcon' },
  compliance: { id: 'compliance', name: 'Compliance & Support', icon: 'AdminPanelSettingsIcon' },
  ebayParams: { id: 'ebayParams', name: 'eBay Parameters', icon: 'StoreIcon' },
  hrManagement: { id: 'hrManagement', name: 'HR & Management', icon: 'SupervisorAccountIcon' },
  others: { id: 'others', name: 'Others', icon: 'AppsIcon' },
};

// Submenu definitions
export const SUBMENUS = {
  templateListing: {
    id: 'templateListing',
    name: 'Template Listing',
    category: 'listingResearch',
    pages: ['ManageTemplates', 'ListingsDatabase', 'SelectSeller', 'ListingDirectory', 'TemplateDirectory'],
  },
  asinImporter: {
    id: 'asinImporter',
    name: 'ASIN Importer',
    category: 'listingResearch',
    pages: ['AsinDirectory', 'AsinLists'],
  },
};

export const PAGE_REGISTRY = [
  // ====== ORDER FULFILMENT ======
  { id: 'OrdersDashboard', name: 'Orders Dashboard', path: '/orders-dashboard', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'OrderAnalytics', name: 'Order Analytics', path: '/order-analytics', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'CRPAnalytics', name: 'CRP Analytics', path: '/crp-analytics', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'CRPComparison', name: 'CRP Comparison', path: '/crp-comparison', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'Fulfillment', name: 'All Orders (Fulfilment)', path: '/fulfillment', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'AwaitingShipment', name: 'Awaiting Shipment', path: '/awaiting-shipment', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'AwaitingSheet', name: 'Awaiting Sheet', path: '/awaiting-sheet', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'AmazonArrivals', name: 'Amazon Arrivals', path: '/amazon-arrivals', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'FulfillmentNotes', name: 'Fulfillment Notes', path: '/fulfillment-notes', category: 'orderFulfilment', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },

  // ====== COMPATIBILITY ======
  { id: 'CompatibilityDashboard', name: 'Compatibility Dashboard', path: '/compatibility-dashboard', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin', 'compatibilityeditor'] },
  { id: 'CompatibilityTasks', name: 'Compatibility Tasks', path: '/compatibility-tasks', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'CompatibilityProgress', name: 'Progress Tracking', path: '/compatibility-progress', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'AiFitmentUsage', name: 'AI Fitment Usage', path: '/ai-fitment-usage', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'ListingStats', name: 'Listing Statistics', path: '/listing-stats', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'CompatibilityBatchHistory', name: 'Batch History', path: '/compatibility-batch-history', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin', 'compatibilityeditor'] },
  { id: 'AutoCompatibility', name: 'Auto Compatibility', path: '/auto-compatibility', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'AutoCompatSellerHistory', name: 'Auto Compat Seller History', path: '/auto-compat-seller-history', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'AutoCompatReviewHistory', name: 'Review History', path: '/auto-compat-review-history', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },
  { id: 'EditListings', name: 'Edit Listings', path: '/edit-listings', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin', 'compatibilityeditor'] },
  { id: 'CompatibilityEditor', name: 'My Assignments', path: '/compatibility-editor', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityeditor'] },
  { id: 'AddCompatibilityEditor', name: 'Add Compatibility Editor', path: '/add-compatibility-editor', category: 'compatibility', defaultRoles: ['superadmin', 'compatibilityadmin'] },

  // ====== LISTING & RESEARCH ======
  // Template Listing submenu
  { id: 'ManageTemplates', name: 'Manage Templates', path: '/manage-templates', category: 'listingResearch', submenu: 'templateListing', defaultRoles: ['superadmin'] },
  { id: 'ListingsDatabase', name: 'Listings Database', path: '/listings-database', category: 'listingResearch', submenu: 'templateListing', defaultRoles: ['superadmin'] },
  { id: 'SelectSeller', name: 'Add Template Listings', path: '/select-seller', category: 'listingResearch', submenu: 'templateListing', defaultRoles: ['superadmin', 'lister', 'advancelister', 'trainee'] },
  { id: 'ListingDirectory', name: 'Listing Directory', path: '/listing-directory', category: 'listingResearch', submenu: 'templateListing', defaultRoles: ['superadmin', 'lister', 'advancelister', 'trainee'] },
  { id: 'TemplateDirectory', name: 'Template Directory', path: '/template-directory', category: 'listingResearch', submenu: 'templateListing', defaultRoles: ['superadmin', 'lister', 'advancelister', 'trainee'] },
  // ASIN Importer submenu
  { id: 'AsinDirectory', name: 'ASIN Directory', path: '/asin-directory', category: 'listingResearch', submenu: 'asinImporter', defaultRoles: ['superadmin', 'productadmin'] },
  { id: 'AsinLists', name: 'ASIN Lists', path: '/asin-lists', category: 'listingResearch', submenu: 'asinImporter', defaultRoles: ['superadmin', 'productadmin'] },
  // Direct items
  { id: 'FeedUpload', name: 'Feed Upload (CSV)', path: '/feed-upload', category: 'listingResearch', defaultRoles: ['superadmin', 'listingadmin', 'lister'] },
  { id: 'FeedUploadStats', name: 'Feed Upload Stats', path: '/feed-upload-stats', category: 'listingResearch', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'CsvStorage', name: 'CSV Storage', path: '/csv-storage', category: 'listingResearch', defaultRoles: ['superadmin', 'listingadmin', 'lister'] },
  { id: 'ProductResearch', name: 'Product Research', path: '/research', category: 'listingResearch', defaultRoles: ['superadmin', 'productadmin'] },

  // ====== FINANCE & CASH FLOW ======
  { id: 'Payoneer', name: 'Payoneer Sheet', path: '/payoneer', category: 'finance', defaultRoles: ['superadmin'] },
  { id: 'BankAccounts', name: 'Bank Accounts', path: '/bank-accounts', category: 'finance', defaultRoles: ['superadmin'] },
  { id: 'Transactions', name: 'Transactions', path: '/transactions', category: 'finance', defaultRoles: ['superadmin'] },
  { id: 'ExtraExpenses', name: 'Extra Expenses', path: '/extra-expenses', category: 'finance', defaultRoles: ['superadmin'] },
  { id: 'CreditCardNames', name: 'Credit Card Names', path: '/credit-card-names', category: 'finance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'Salary', name: 'Salary Page', path: '/salary', category: 'finance', defaultRoles: ['superadmin'] },
  { id: 'AllOrdersSheet', name: 'All Orders USD', path: '/all-orders-sheet', category: 'finance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'PriceChangeHistory', name: 'Price Change History', path: '/price-change-history', category: 'finance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'SellerAnalytics', name: 'Seller Analytics', path: '/seller-analytics', category: 'finance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },

  // ====== COMPLIANCE & SUPPORT ======
  { id: 'Disputes', name: 'Issues and Resolutions', path: '/disputes', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'AccountHealth', name: 'Account Health Report', path: '/account-health', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'BuyerMessages', name: 'Buyer Messages', path: '/message-received', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'ConversationManagement', name: 'Conversation Mgmt', path: '/conversation-management', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'AmazonAccounts', name: 'Manage Amazon Accounts', path: '/amazon-accounts', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'CreditCards', name: 'Manage Credit Cards', path: '/credit-cards', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },
  { id: 'AffiliateOrders', name: 'Affiliate Orders', path: '/affiliate-orders', category: 'compliance', defaultRoles: ['superadmin', 'fulfillmentadmin', 'hoc', 'compliancemanager'] },

  // ====== EBAY PARAMETERS ======
  { id: 'SellingPrivileges', name: 'Seller Privileges', path: '/selling-privileges', category: 'ebayParams', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'EbayApiUsage', name: 'eBay API Usage', path: '/ebay-api-usage', category: 'ebayParams', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'SellerFunds', name: 'Seller Funds', path: '/seller-funds', category: 'ebayParams', defaultRoles: ['superadmin', 'listingadmin'] },

  // ====== HR & MANAGEMENT ======
  { id: 'IdeasAndIssues', name: 'Ideas and Issues', path: '/ideas', category: 'hrManagement', defaultRoles: ['superadmin', 'hradmin', 'operationhead', 'listingadmin'] },
  { id: 'TeamChat', name: 'Team Chat', path: '/internal-messages', category: 'hrManagement', defaultRoles: ['superadmin', 'hradmin', 'operationhead', 'listingadmin'] },
  { id: 'LeaveAdmin', name: 'Leave Admin', path: '/leave-admin', category: 'hrManagement', defaultRoles: ['superadmin', 'hradmin'] },
  { id: 'EmployeeManagement', name: 'Employee Management', path: '/employee-management', category: 'hrManagement', defaultRoles: ['superadmin', 'hradmin'] },
  { id: 'AddUser', name: 'Add User', path: '/add-user', category: 'hrManagement', defaultRoles: ['superadmin', 'listingadmin', 'hradmin', 'operationhead'] },
  { id: 'AddSeller', name: 'Add Seller', path: '/add-seller', category: 'hrManagement', defaultRoles: ['superadmin', 'hradmin', 'operationhead'] },
  { id: 'UserSellerAssignments', name: 'User-Seller Assignments', path: '/user-seller-assignments', category: 'hrManagement', defaultRoles: ['superadmin', 'hradmin', 'hr'] },
  { id: 'ViewAllMessages', name: 'View All Messages', path: '/internal-messages-admin', category: 'hrManagement', defaultRoles: ['superadmin'] },
  { id: 'Attendance', name: 'Working Hours Tracking', path: '/attendance', category: 'hrManagement', defaultRoles: ['superadmin'] },
  { id: 'PageAccessManagement', name: 'Page Access Management', path: '/page-access-management', category: 'hrManagement', defaultRoles: ['superadmin'] },
  { id: 'PageAccessAuditLog', name: 'Page Access Audit Log', path: '/page-access-audit-log', category: 'hrManagement', defaultRoles: ['superadmin'] },
  { id: 'UserPasswordManagement', name: 'User Password Management', path: '/user-password-management', category: 'hrManagement', defaultRoles: ['superadmin'] },

  // ====== OTHERS ======
  { id: 'ManageCategories', name: 'Manage Categories', path: '/categories', category: 'others', defaultRoles: ['superadmin', 'productadmin'] },
  { id: 'ManagePlatforms', name: 'Manage Platforms', path: '/platforms', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'ManageStores', name: 'Manage Stores', path: '/stores', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'ProductTable', name: 'Product Table', path: '/listing', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'TaskList', name: 'Task List', path: '/task-list', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'Assignments', name: 'Assignments', path: '/assignments', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'ListingsSummary', name: 'Listings Summary', path: '/listings-summary', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'ListingSheet', name: 'Listing Sheet', path: '/listing-sheet', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'StoreWiseTasks', name: 'Store-Wise Tasks', path: '/store-wise-tasks', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'StoreDailyTasks', name: 'Store Daily Tasks', path: '/store-daily-tasks', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'ListerInfo', name: 'Lister Info', path: '/lister-info', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'RangeAnalyzer', name: 'Range Analyzer', path: '/range-analyzer', category: 'others', defaultRoles: ['superadmin', 'listingadmin'] },
  { id: 'AmazonLookup', name: 'Amazon Lookup', path: '/amazon-lookup', category: 'others', defaultRoles: ['superadmin'] },
  { id: 'ProductUmbrellas', name: 'Product Umbrellas', path: '/product-umbrellas', category: 'others', defaultRoles: ['superadmin'] },
  { id: 'AsinStorage', name: 'ASIN Storage', path: '/asin-storage', category: 'others', defaultRoles: ['superadmin', 'productadmin'] },
  { id: 'ColumnCreator', name: 'Column Creator', path: '/column-creator', category: 'others', defaultRoles: ['superadmin', 'productadmin'] },
  { id: 'ManageRanges', name: 'Manage Ranges', path: '/ranges', category: 'others', defaultRoles: ['superadmin', 'productadmin'] },
  { id: 'UserCredentials', name: 'User Credentials', path: '/user-credentials', category: 'others', defaultRoles: ['superadmin'] },
  { id: 'UserPerformance', name: 'User Performance Logs', path: '/user-performance', category: 'others', defaultRoles: ['superadmin'] },
  { id: 'EmployeeDetails', name: 'Employee Details', path: '/employee-details', category: 'others', defaultRoles: ['superadmin', 'hradmin', 'operationhead'] },
];

// Helper: get page by ID
export const getPageById = (id) => PAGE_REGISTRY.find(p => p.id === id);

// Helper: get all pages by category
export const getPagesByCategory = (category) => PAGE_REGISTRY.filter(p => p.category === category);

// Helper: get all category IDs
export const getCategoryIds = () => Object.keys(PAGE_CATEGORIES);
