# API Inventory

This document lists APIs currently used in this app.

## Base Rules

- Internal backend APIs are mounted under `/api/*`.
- eBay calls are made server-side from `Back/src/routes/ebay.js` and related routes.
- Frontend calls backend via `Front/src/lib/api`.

## Internal Route Groups (`/api/*`)

- `/api/auth`
- `/api/users`
- `/api/platforms`
- `/api/stores`
- `/api/tasks`
- `/api/ranges`
- `/api/categories`
- `/api/subcategories`
- `/api/assignments`
- `/api/compatibility`
- `/api/listing-completions`
- `/api/ebay`
- `/api/sellers`
- `/api/employee-profiles`
- `/api/store-wise-tasks`
- `/api/lister-info`
- `/api/amazon-accounts`
- `/api/range-analysis`
- `/api/ideas`
- `/api/orders`
- `/api/upload`
- `/api/credit-cards`
- `/api/credit-card-names`
- `/api/resolution-options`
- `/api/exchange-rates`
- `/api/internal-messages`
- `/api/payoneer`
- `/api/payment-accounts`
- `/api/price-change-logs`
- `/api/transactions`
- `/api/bank-accounts`
- `/api/column-presets`
- `/api/amazon-lookup`
- `/api/product-umbrellas`
- `/api/custom-columns`
- `/api/listing-templates`
- `/api/template-listings`
- `/api/template-overrides`
- `/api/seller-pricing-config`
- `/api/account-health`
- `/api/chat-templates`
- `/api/remark-templates`
- `/api/extra-expenses`
- `/api/leaves`
- `/api/asin-directory`
- `/api/asin-list-categories`
- `/api/asin-list-ranges`
- `/api/asin-list-products`
- `/api/csv-storage`
- `/api/attendance`
- `/api/user-sellers`
- `/api/salary`
- `/api/ai`
- `/api/affiliate-orders`
- `/api/listing-stats`
- `/api/item-category-map`

Source: `Back/src/index.js`.

## Key eBay Proxy Endpoints Used by Frontend (`/api/ebay/*`)

### Auth / Connection

- `GET /api/ebay/connect`
- `GET /api/ebay/callback`
- `POST /api/ebay/oauth/complete`

### Orders / Fulfillment

- `GET /api/ebay/stored-orders`
- `GET /api/ebay/all-orders-usd`
- `GET /api/ebay/order/:orderId`
- `POST /api/ebay/poll-all-sellers`
- `POST /api/ebay/poll-new-orders`
- `POST /api/ebay/poll-order-updates`
- `POST /api/ebay/resync-recent`

### Seller Funds / Payoneer

- `GET /api/ebay/seller-funds-summary`
- `GET /api/ebay/processing-transactions/:sellerId`
- `GET /api/ebay/onhold-transactions/:sellerId`
- `GET /api/ebay/upcoming-payouts/:sellerId`
- `GET /api/ebay/payoneer-recent-completed-feed`
- `GET /api/ebay/payout-transactions/:sellerId/:payoutId`

### Disputes / Returns / Messages

- `GET /api/ebay/stored-returns`
- `GET /api/ebay/stored-inr-cases`
- `GET /api/ebay/stored-payment-disputes`
- `GET /api/ebay/issues-by-order`
- `GET /api/ebay/chat/threads`
- `GET /api/ebay/chat/messages`
- `GET /api/ebay/chat/search-order`
- `POST /api/ebay/send-message`

### Listings / Compatibility

- `GET /api/ebay/listings`
- `GET /api/ebay/all-listings`
- `POST /api/ebay/sync-listings`
- `POST /api/ebay/sync-all-sellers-listings`
- `GET /api/ebay/sync-all-sellers-status`
- `POST /api/ebay/update-listing`
- `POST /api/ebay/update-compatibility`
- `POST /api/ebay/bulk-update-compatibility`
- `POST /api/ebay/compatibility/values`
- `POST /api/ebay/end-item`

### Feed Upload / Analytics / Tester

- `POST /api/ebay/feed/upload`
- `GET /api/ebay/feed/tasks`
- `GET /api/ebay/feed/result/:taskId`
- `GET /api/ebay/feed/upload-stats`
- `GET /api/ebay/api-usage-stats`
- `GET /api/ebay/api-usage-stats/all`
- `GET /api/ebay/selling/summary`
- `GET /api/ebay/selling/summary/all`
- `POST /api/ebay/dev/raw-call`

Source: `Back/src/routes/ebay.js`.

## External eBay APIs Called by Backend

### OAuth / Identity

- `https://api.ebay.com/identity/v1/oauth2/token`

### Sell Fulfillment API

- `https://api.ebay.com/sell/fulfillment/v1/order`
- `https://api.ebay.com/sell/fulfillment/v1/order/{orderId}`
- `https://api.ebay.com/sell/fulfillment/v1/order/{orderId}/shipping_fulfillment`
- `https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute_summary`

### Sell Finances API

- `https://apiz.ebay.com/sell/finances/v1/seller_funds_summary`
- `https://apiz.ebay.com/sell/finances/v1/transaction`
- `https://apiz.ebay.com/sell/finances/v1/payout`

### Sell Feed API

- `https://api.ebay.com/sell/feed/v1/task`
- `https://api.ebay.com/sell/feed/v1/task/{taskId}`
- `https://api.ebay.com/sell/feed/v1/task/{taskId}/upload_file`
- `https://api.ebay.com/sell/feed/v1/task/{taskId}/download_result_file`

### Taxonomy / Analytics / Post-Order / Trading XML

- `https://api.ebay.com/commerce/taxonomy/v1/category_tree/...`
- `https://api.ebay.com/developer/analytics/v1_beta/rate_limit`
- `https://api.ebay.com/post-order/v2/return/search`
- `https://api.ebay.com/post-order/v2/inquiry/search`
- `https://api.ebay.com/ws/api.dll`

Primary sources: `Back/src/routes/ebay.js`, `Back/src/routes/rangeAnalysis.js`.

## Page to API Mapping (Structured)

This section maps frontend pages to internal APIs, then to external eBay APIs used underneath.

### `Seller Privileges` (`/admin/selling-privileges`)

- Internal APIs
  - `GET /api/ebay/selling/summary/all`
- External eBay APIs (via backend)
  - `POST https://api.ebay.com/ws/api.dll` (Trading API for limits/privileges)

### `eBay API Usage` (`/admin/ebay-api-usage`)

- Internal APIs
  - `GET /api/ebay/api-usage-stats/all`
- External eBay APIs (via backend)
  - `GET https://api.ebay.com/developer/analytics/v1_beta/rate_limit`

### `eBay API Tester` (`/admin/ebay-api-tester`)

- Internal APIs
  - `POST /api/ebay/dev/raw-call` (raw proxy mode)
  - Any `/api/*` endpoint in app (manual mode in tester)
- External eBay APIs (via backend)
  - Any eBay REST endpoint on `api.ebay.com` / `apiz.ebay.com` supported by seller token scope

### `Seller Funds` (`/admin/seller-funds`)

- Internal APIs
  - `GET /api/ebay/seller-funds-summary`
  - `GET /api/ebay/processing-transactions/:sellerId`
  - `GET /api/ebay/onhold-transactions/:sellerId`
- External eBay APIs (via backend)
  - `GET https://apiz.ebay.com/sell/finances/v1/seller_funds_summary`
  - `GET https://apiz.ebay.com/sell/finances/v1/transaction`

### `Payoneer Sheet` (`/admin/payoneer`)

- Internal APIs
  - `GET /api/payoneer`
  - `POST /api/payoneer`
  - `PUT /api/payoneer/:id`
  - `DELETE /api/payoneer/:id`
  - `GET /api/ebay/payoneer-recent-completed-feed`
  - `GET /api/ebay/seller-funds-summary`
  - `GET /api/ebay/upcoming-payouts/:sellerId`
  - `GET /api/sellers/all`
  - `GET /api/bank-accounts`
- External eBay APIs (via backend)
  - `GET https://apiz.ebay.com/sell/finances/v1/payout`
  - `GET https://apiz.ebay.com/sell/finances/v1/seller_funds_summary`
  - `GET https://apiz.ebay.com/sell/finances/v1/transaction`

### `All Orders USD` (`/admin/all-orders-sheet`)

- Internal APIs
  - `GET /api/ebay/all-orders-usd`
  - `PATCH /api/ebay/orders/:orderId/order-total`
  - `POST /api/ebay/update-listing`
  - `GET /api/sellers/all`
  - `GET /api/exchange-rates/current`
  - `GET /api/exchange-rates/history`
  - `POST /api/exchange-rates`
- External eBay APIs (via backend)
  - `GET https://api.ebay.com/sell/fulfillment/v1/order`
  - `GET https://apiz.ebay.com/sell/finances/v1/transaction`
  - `POST https://api.ebay.com/ws/api.dll`

### `Orders Dashboard` (`/admin/orders-dashboard`)

- Internal APIs
  - `GET /api/orders/dashboard/overview`
  - `GET /api/orders/dashboard/monthly-delta`
  - `GET /api/ebay/stored-orders`
  - `GET /api/sellers/all`
- External eBay APIs (via backend refresh/sync jobs)
  - `GET https://api.ebay.com/sell/fulfillment/v1/order`

### `All Orders (Fulfilment)` (`/admin/fulfillment`)

- Internal APIs (core)
  - `GET /api/ebay/stored-orders`
  - `POST /api/ebay/poll-new-orders`
  - `POST /api/ebay/poll-order-updates`
  - `PATCH /api/ebay/orders/:orderId/manual-tracking`
  - `POST /api/ebay/orders/:orderId/upload-tracking`
  - `POST /api/ebay/send-message`
- External eBay APIs (via backend)
  - `GET https://api.ebay.com/sell/fulfillment/v1/order`
  - `POST https://api.ebay.com/sell/fulfillment/v1/order/{orderId}/shipping_fulfillment`
  - `POST https://api.ebay.com/ws/api.dll`

### `Buyer Messages` (`/admin/message-received`)

- Internal APIs
  - `POST /api/ebay/sync-inbox`
  - `POST /api/ebay/sync-thread`
  - `GET /api/ebay/chat/threads`
  - `GET /api/ebay/chat/messages`
  - `GET /api/ebay/chat/search-order`
  - `POST /api/ebay/send-message`
  - `POST /api/ebay/chat/mark-unread`
  - `GET /api/ebay/item-images/:itemId`
- External eBay APIs (via backend)
  - `POST https://api.ebay.com/ws/api.dll` (member messages / inbox XML calls)

### `Conversation Mgmt` (`/admin/conversation-management`)

- Internal APIs
  - `GET /api/ebay/conversation-management/list`
  - `PATCH /api/ebay/conversation-management/:id/resolve`
  - `PATCH /api/ebay/conversation-management/:id/pick-up`
  - `GET /api/ebay/chat/messages`
  - `POST /api/ebay/send-message`
  - `GET/POST/PATCH/DELETE /api/ebay/chat-agents`
- External eBay APIs (via backend)
  - `POST https://api.ebay.com/ws/api.dll`

### `Issues and Resolutions` (`/admin/disputes`)

- Internal APIs
  - `GET /api/ebay/stored-inr-cases`
  - `POST /api/ebay/fetch-inr-cases`
  - `GET /api/ebay/stored-payment-disputes`
  - `POST /api/ebay/fetch-payment-disputes`
  - `PATCH /api/ebay/cases/:caseId/logs`
- External eBay APIs (via backend)
  - `GET https://api.ebay.com/post-order/v2/inquiry/search`
  - `GET https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute_summary`

### `Feed Upload (CSV)` (`/admin/feed-upload`)

- Internal APIs
  - `POST /api/ebay/feed/upload`
  - `GET /api/ebay/feed/tasks`
  - `GET /api/ebay/feed/result/:taskId`
- External eBay APIs (via backend)
  - `POST https://api.ebay.com/sell/feed/v1/task`
  - `POST https://api.ebay.com/sell/feed/v1/task/{taskId}/upload_file`
  - `GET https://api.ebay.com/sell/feed/v1/task/{taskId}`
  - `GET https://api.ebay.com/sell/feed/v1/task/{taskId}/download_result_file`

### `Compatibility Dashboard` (`/admin/compatibility-dashboard`)

- Internal APIs
  - `GET /api/ebay/listings`
  - `POST /api/ebay/sync-listings`
  - `POST /api/ebay/sync-all-sellers-listings`
  - `GET /api/ebay/sync-all-sellers-status`
  - `POST /api/ebay/update-compatibility`
  - `POST /api/ebay/bulk-update-compatibility`
  - `POST /api/ebay/compatibility/values`
  - `POST /api/ebay/end-item`
  - `GET /api/ebay/api-usage-stats`
- External eBay APIs (via backend)
  - `POST https://api.ebay.com/ws/api.dll`
  - `GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/.../get_compatibility_property_values`
  - `GET https://api.ebay.com/developer/analytics/v1_beta/rate_limit`
