# Grow Cursor — Frontend

> Modern React dashboard for the Grow e-commerce management platform.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
<!-- - [Environment Variables](#environment-variables) -->
- [Pages & Routing](#pages--routing)
- [User Roles](#user-roles)
- [Key Features](#key-features)
<!-- - [Scripts](#scripts) -->
- [Deployment](#deployment)

---

## Overview

**Grow Cursor Frontend** (`dropship-client`) is a React-based single-page application built with Vite. It provides a comprehensive dashboard for managing e-commerce operations including eBay listings, Amazon product research, order fulfillment, employee management, and financial tracking. The app features role-based routing and UI, Material UI components, and integration with multiple third-party services.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 |
| **Build Tool** | Vite 5 |
| **UI Library** | Material UI (MUI) v6 |
| **Data Grid** | MUI X Data Grid |
| **Date Pickers** | MUI X Date Pickers |
| **Routing** | React Router v6 |
| **HTTP Client** | Axios |
| **Charts** | Recharts |
| **Date Utilities** | date-fns |
| **Infinite Scroll** | react-infinite-scroll-component |
| **Styling** | Emotion (CSS-in-JS via MUI) |
| **Hosting** | Vercel |

---

## Project Structure

```
Grow-Cursor-Frontend/
├── public/               # Static assets
├── src/
│   ├── components/       # Reusable UI components (30+ components)
│   │   ├── Attendance/       # Attendance tracking components
│   │   │   ├── AttendanceModal.jsx
│   │   │   ├── AttendanceTimer.jsx
│   │   │   └── TimerPausedModal.jsx
│   │   ├── override-editors/ # Template override editors
│   │   ├── ActionFieldEditor.jsx
│   │   ├── AsinDetailDialog.jsx
│   │   ├── AsinReviewModal.jsx
│   │   ├── BulkListingPreview.jsx
│   │   ├── ChatModal.jsx
│   │   ├── ColumnSelector.jsx
│   │   ├── OrderDetailsModal.jsx
│   │   ├── TemplateManagementModal.jsx
│   │   └── ... (20+ more)
│   ├── constants/        # App-wide constants
│   ├── context/
│   │   └── AttendanceContext.jsx  # Global attendance state
│   ├── layouts/
│   │   └── AdminLayout.jsx       # Admin dashboard shell
│   ├── lib/
│   │   └── api.js                # Axios instance & interceptors
│   ├── pages/
│   │   ├── admin/            # Admin pages (78 pages)
│   │   │   ├── FulfillmentDashboard.jsx
│   │   │   ├── TemplateListingsPage.jsx
│   │   │   ├── BuyerChatPage.jsx
│   │   │   ├── AffiliateOrdersPage.jsx
│   │   │   ├── EmployeeManagementPage.jsx
│   │   │   ├── AllOrdersSheetPage.jsx
│   │   │   ├── ManageTemplatesPage.jsx
│   │   │   └── ... (70+ more)
│   │   ├── compatibility/    # Compatibility module pages
│   │   │   ├── CompatibilityDashboard.jsx
│   │   │   ├── AdminTaskList.jsx
│   │   │   ├── EditorDashboard.jsx
│   │   │   ├── CompatibilityBatchHistoryPage.jsx
│   │   │   └── ProgressTrackingPage.jsx
│   │   ├── ebay/             # eBay-specific pages
│   │   │   └── FeedUploadPage.jsx
│   │   ├── lister/           # Lister role pages
│   │   │   └── ListerDashboard.jsx
│   │   ├── listings/         # Listing management pages
│   │   │   └── EditListingsDashboard.jsx
│   │   ├── AboutMePage.jsx
│   │   ├── IdeasPage.jsx
│   │   ├── LandingPage.jsx
│   │   ├── LeaveManagementPage.jsx
│   │   ├── LoginPage.jsx
│   │   └── SellerProfilePage.jsx
│   ├── utils/            # Utility functions
│   ├── App.jsx           # Root component & routing
│   └── main.jsx          # Application entry point
├── index.html            # HTML entry point
├── vite.config.js        # Vite configuration
├── vercel.json           # Vercel deployment config (SPA rewrites)
├── .env                  # Environment variables
├── .gitignore
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 16.x
- **Backend server** running (see Backend README)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Grow-Cursor-Frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start development server
npm run dev
```

The app will start on `http://localhost:5173` with API requests proxied to `http://localhost:5000`.
<!-- 
---

## Environment Variables

Create a `.env` file in the project root:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL (e.g., `http://localhost:5000/api`) |
| `VITE_SERVER_URL` | Backend server URL (for non-API requests) |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (image hosting) |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary upload preset |

--- -->

## Pages & Routing

### Public Routes

| Route | Page | Description |
|---|---|---|
| `/` | LandingPage | Application landing page |
| `/login` | LoginPage | User authentication |
| `/ideas` | IdeasPage | Public idea submission board |

### Lister Routes

| Route | Page | Description |
|---|---|---|
| `/lister` | ListerDashboard | Lister's main workspace |
| `/lister/range-analyzer` | RangeAnalyzerPage | Price range analysis tool |

### Seller Routes

| Route | Page | Description |
|---|---|---|
| `/seller-ebay` | SellerProfilePage | Seller eBay profile & store management |

### Admin Routes (`/admin/*`)

#### Product Research & Listings
| Route | Page |
|---|---|
| `/admin/product-research` | ProductResearchPage |
| `/admin/template-listings` | TemplateListingsPage |
| `/admin/manage-templates` | ManageTemplatesPage |
| `/admin/template-database` | TemplateDatabasePage |
| `/admin/template-directory` | TemplateDirectoryPage |
| `/admin/template-listing-analytics` | TemplateListingAnalyticsPage |
| `/admin/listing-management` | ListingManagementPage |
| `/admin/listing-directory` | ListingDirectoryPage |
| `/admin/listing-analytics` | ListingAnalyticsPage |
| `/admin/listing-sheet` | ListingSheetPage |
| `/admin/listing-stats` | ListingStatsPage |
| `/admin/listings-summary` | ListingsSummaryPage |
| `/admin/column-creator` | ColumnCreatorPage |
| `/admin/seller-templates` | SellerTemplatesPage |

#### Amazon
| Route | Page |
|---|---|
| `/admin/amazon-lookup` | AmazonLookupPage |
| `/admin/amazon-arrivals` | AmazonArrivalsPage |
| `/admin/asin-directory` | AsinDirectoryPage |
| `/admin/asin-list` | AsinListPage |
| `/admin/asin-storage` | ASINStoragePage |

#### Orders & Fulfillment
| Route | Page |
|---|---|
| `/admin/fulfillment` | FulfillmentDashboard |
| `/admin/all-orders` | AllOrdersSheetPage |
| `/admin/awaiting-shipment` | AwaitingShipmentPage |
| `/admin/awaiting-sheet` | AwaitingSheetPage |
| `/admin/return-requested` | ReturnRequestedPage |
| `/admin/cancelled-status` | CancelledStatusPage |
| `/admin/disputes` | DisputesPage |
| `/admin/affiliate-orders` | AffiliateOrdersPage |
| `/admin/order-analytics` | OrderAnalyticsPage |
| `/admin/orders-department` | OrdersDepartmentDashboardPage |
| `/admin/fulfillment-notes` | FulfillmentNotesPage |
| `/admin/stock-ledger` | StockLedgerPage |
| `/admin/worksheet` | WorksheetPage |

#### Communication
| Route | Page |
|---|---|
| `/admin/buyer-chat` | BuyerChatPage |
| `/admin/conversation-management` | ConversationManagementPage |
| `/admin/conversation-tracking` | ConversationTrackingPage |
| `/admin/messages` | MessageReceivedPage |
| `/admin/internal-messages` | InternalMessagesPage |
| `/admin/internal-messages-admin` | InternalMessagesAdminPage |

#### Finance
| Route | Page |
|---|---|
| `/admin/payoneer-sheet` | PayoneerSheetPage |
| `/admin/bank-accounts` | BankAccountsPage |
| `/admin/transactions` | TransactionPage |
| `/admin/seller-funds` | SellerFundsPage |
| `/admin/extra-expenses` | ExtraExpensePage |
| `/admin/payment-accounts` | PaymentAccountsPage |

#### Employee & HR
| Route | Page |
|---|---|
| `/admin/employee-details` | EmployeeDetailsPage |
| `/admin/employee-management` | EmployeeManagementPage |
| `/admin/salary` | SalaryPage |
| `/admin/attendance` | AttendanceAdminPage |
| `/admin/leave-admin` | LeaveAdminPage |
| `/admin/about-me` | AboutMePage |

#### Seller & Account Management
| Route | Page |
|---|---|
| `/admin/select-seller` | SelectSellerPage |
| `/admin/seller-analytics` | SellerAnalyticsPage |
| `/admin/manage-amazon-accounts` | ManageAmazonAccountsPage |
| `/admin/account-health` | AccountHealthReportPage |
| `/admin/selling-privileges` | SellingPrivilegesPage |
| `/admin/user-seller-assignment` | UserSellerAssignmentPage |
| `/admin/user-credentials` | UserCredentialsPage |

#### Configuration
| Route | Page |
|---|---|
| `/admin/manage-categories` | ManageCategoriesPage |
| `/admin/manage-ranges` | ManageRangesPage |
| `/admin/manage-platforms` | ManagePlatformsPage |
| `/admin/manage-stores` | ManageStoresPage |
| `/admin/manage-credit-cards` | ManageCreditCardsPage |
| `/admin/manage-credit-card-names` | ManageCreditCardNamesPage |
| `/admin/manage-product-umbrellas` | ManageProductUmbrellasPage |

#### Analytics & Monitoring
| Route | Page |
|---|---|
| `/admin/range-analyzer` | RangeAnalyzerPage |
| `/admin/user-performance` | UserPerformancePage |
| `/admin/lister-insights` | ListerInsightsPage |
| `/admin/csv-storage` | CsvStoragePage |
| `/admin/ebay-api-usage` | EbayApiUsagePage |
| `/admin/ai-fitment-usage` | AiFitmentUsagePage |
| `/admin/feed-upload-stats` | FeedUploadStatsPage |

#### Compatibility Module
| Route | Page |
|---|---|
| `/admin/compatibility-tasks` | AdminTaskList |
| `/admin/compatibility-editor` | EditorDashboard |
| `/admin/compatibility-dashboard` | CompatibilityDashboard |
| `/admin/compatibility-batch-history` | CompatibilityBatchHistoryPage |
| `/admin/compatibility-progress` | ProgressTrackingPage |

#### Tasks & Assignments
| Route | Page |
|---|---|
| `/admin/tasks` | TaskListPage |
| `/admin/assignments` | AdminAssignmentsPage |
| `/admin/store-daily-tasks` | StoreDailyTasksPage |
| `/admin/store-wise-tasks` | StoreWiseTaskListPage |
| `/admin/lister-info` | ListerInfoPage |
| `/admin/add-lister` | AddListerPage |

#### eBay
| Route | Page |
|---|---|
| `/admin/feed-upload` | FeedUploadPage |

---

## User Roles

The application supports **12+ user roles** with role-specific routing and UI:

| Role | Default Route | Access Level |
|---|---|---|
| `superadmin` | `/admin` | Full access to all modules |
| `productadmin` | `/admin` | Product research & management |
| `listingadmin` | `/admin` | Listing management & templates |
| `lister` | `/lister` | Listing creation workflow |
| `advancelister` | `/lister` | Advanced listing features |
| `trainee` | `/lister` | Training-level listing access |
| `seller` | `/seller-ebay` | Seller profile & store view |
| `compatibilityadmin` | `/admin/compatibility-tasks` | Compatibility module admin |
| `compatibilityeditor` | `/admin/compatibility-editor` | Compatibility data editing |
| `fulfillmentadmin` | `/admin/fulfillment` | Order fulfillment management |
| `hradmin` | `/admin/employee-details` | HR & employee management |
| `hr` | `/admin/about-me` | Basic HR access |
| `operationhead` | `/admin/employee-details` | Operations oversight |
| `hoc` | `/admin` | Head of compliance |
| `compliancemanager` | `/admin` | Compliance management |

---

## Key Features

- **Role-Based Dashboard** — Each role gets a tailored landing page and navigation
- **eBay Integration** — Manage listings, process orders, track feeds, and handle buyer chats
- **Amazon Lookup** — Real-time Amazon product data with ASIN directory management
- **Template Listing System** — Create listings from templates with overrides and bulk operations
- **Fulfillment Dashboard** — Comprehensive order fulfillment with return/dispute handling
- **Employee Management** — Attendance tracking with timer, leave management, salary processing
- **Financial Tracking** — Payoneer integration, transaction management, bank accounts, seller funds
- **Compatibility Module** — Specialized workflow for compatibility data with admin/editor roles
- **Analytics & Reporting** — Charts and insights across listings, orders, sellers, and user performance
- **Buyer Chat** — eBay buyer communication with template responses
- **Internal Messaging** — Team communication system
- **CSV Import/Export** — Bulk data operations via CSV
- **Infinite Scroll** — Performant list rendering with lazy loading
- **Session-Based Auth** — Per-tab authentication using sessionStorage
<!-- 
---

## Scripts

| Script | Command | Description |
|---|---|---|
| **dev** | `npm run dev` | Start Vite dev server (port 5173) |
| **build** | `npm run build` | Build production bundle |
| **preview** | `npm run preview` | Preview production build locally |

--- -->

## Deployment

The frontend is deployed on **Vercel**:

- SPA routing is handled via `vercel.json` (all routes rewrite to `/index.html`)
- Environment variables are configured in the Vercel dashboard
- API requests are proxied to the backend server URL defined in `VITE_API_URL`

```bash
# Build for production
npm run build

# Preview locally
npm run preview
```

---

## License

Private — All rights reserved.
