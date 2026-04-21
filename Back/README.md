# Grow Cursor — Backend

> RESTful API server powering the Grow e-commerce management platform.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
<!-- - [Environment Variables](#environment-variables) -->
- [API Routes](#api-routes)
- [Key Features](#key-features)
<!-- - [Scripts](#scripts) -->
- [Deployment](#deployment)

---

## Overview

**Grow Cursor Backend** (`dropship-backend`) is a Node.js + Express API server that serves as the backbone for the Grow e-commerce management platform. It handles everything from user authentication and role-based access control to eBay listing management, Amazon product lookup, order processing, AI-powered operations, and employee management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (ES Modules) |
| **Framework** | Express.js |
| **Database** | MongoDB (via Mongoose ODM) |
| **Authentication** | JWT (jsonwebtoken) + bcryptjs |
| **AI / LLM** | OpenAI, Groq SDK, Google Generative AI (Gemini) |
| **Web Scraping** | ScraperAPI SDK |
| **Image Processing** | Sharp |
| **File Upload** | Multer |
| **API Documentation** | Swagger (swagger-jsdoc + swagger-ui-express) |
| **Security** | Helmet, express-mongo-sanitize, express-rate-limit, CORS |
| **Scheduling** | node-cron |
| **Caching** | node-cache |
| **HTTP Client** | Axios |
| **XML Parsing** | xml2js |

---

## Project Structure

```
Grow-Cursor-Backend/
├── public/
│   └── uploads/          # Static file uploads served at /uploads
├── scripts/              # Maintenance & migration scripts
├── src/
│   ├── config/           # App configuration
│   ├── lib/              # Core libraries
│   │   ├── db.js             # MongoDB connection
│   │   ├── ebayFeedUpload.js # eBay feed upload logic
│   │   └── imageCache.js     # In-memory image cache with auto-cleanup
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── models/           # Mongoose schemas (62 models)
│   │   ├── User.js
│   │   ├── Order.js
│   │   ├── Listing.js
│   │   ├── ListingTemplate.js
│   │   ├── TemplateListing.js
│   │   ├── Seller.js
│   │   ├── AmazonProduct.js
│   │   ├── AsinDirectory.js
│   │   ├── Assignment.js
│   │   ├── Attendance.js
│   │   ├── EmployeeProfile.js
│   │   └── ... (50+ more)
│   ├── routes/           # Express route handlers (55 route files)
│   │   ├── auth.js           # Login / registration
│   │   ├── users.js          # User management
│   │   ├── ebay.js           # eBay integration (listings, orders, feeds)
│   │   ├── orders.js         # Order management
│   │   ├── templateListings.js  # Template-based listing workflow
│   │   ├── assignments.js    # Task assignments
│   │   ├── compatibility.js  # Compatibility data management
│   │   ├── amazonLookup.js   # Amazon product lookup
│   │   ├── ai.js             # AI-powered endpoints
│   │   ├── attendance.js     # Working hours tracking
│   │   ├── salary.js         # Payroll management
│   │   └── ... (40+ more)
│   ├── utils/            # Utility modules
│   │   ├── scraperApiPrice.js    # Price scraping via ScraperAPI
│   │   ├── scraperApiProduct.js  # Product data scraping
│   │   ├── pricingCalculator.js  # Dynamic pricing engine
│   │   ├── asinAutofill.js       # ASIN auto-population
│   │   ├── asinCache.js          # ASIN data caching layer
│   │   ├── gemini.js             # Google Gemini AI integration
│   │   ├── imageProcessor.js     # Image processing (Sharp)
│   │   ├── imageReplacer.js      # Image replacement utilities
│   │   ├── imgbbUploader.js      # ImgBB image hosting
│   │   ├── skuGenerator.js       # SKU generation logic
│   │   ├── templateMerger.js     # Template merging utilities
│   │   ├── performanceSync.js    # Performance data synchronization
│   │   └── apiUsageTracker.js    # API usage monitoring
│   ├── index.js          # Application entry point
│   ├── scheduledJobs.js  # Cron job definitions
│   └── swagger.js        # Swagger/OpenAPI specification
├── .env                  # Environment variables
├── .gitignore
├── copy-prod-to-test.js  # Script to clone prod data to test env
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x (uses `--watch` and `--env-file` flags)
- **MongoDB** instance (Atlas or local)
- API keys for external services (see [Environment Variables](#environment-variables))

<!-- ### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Grow-Cursor-Backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start development server (with auto-restart on file changes)
npm run dev
```

The server will start on `http://localhost:5000` by default. -->

<!-- --- -->
<!-- 
## Environment Variables

Create a `.env` file in the project root with the following variables:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT token signing |
| `CLIENT_ORIGIN` | Frontend URL for CORS |
| `EBAY_CLIENT_ID` | eBay API client ID |
| `EBAY_CLIENT_SECRET` | eBay API client secret |
| `EBAY_RU_NAME` | eBay redirect URL name (OAuth) |
| `EBAY_WEBHOOK_VERIFICATION_TOKEN` | eBay webhook verification token |
| `PUBLIC_BASE_URL` | Public-facing URL (for webhooks, etc.) |
| `IMGBB_API_KEY` | ImgBB image hosting API key |
| `GROQ_API_KEY` | Groq AI API key |
| `OPENAI_API_KEY` | OpenAI API key (general) |
| `OPENAI_FITMENT_API_KEY` | OpenAI API key (fitment-specific) |
| `SCRAPER_API_KEY` | ScraperAPI key |
| `SCRAPER_API_CONCURRENT` | Max concurrent scraper requests |
| `SCRAPER_API_MAX_RETRIES` | Scraper retry count |
| `SCRAPER_API_TIMEOUT_MS` | Scraper request timeout (ms) |
| `OPENAI_CONCURRENT_REQUESTS` | Max concurrent OpenAI requests |
| `BACKEND_BATCH_SIZE` | Batch processing chunk size |
| `ENABLE_ASIN_CACHE` | Enable/disable ASIN caching (`true`/`false`) |
| `ASIN_CACHE_TTL` | ASIN cache TTL in seconds |

--- -->

## API Routes

The API is organized under `/api` with the following route groups:

### Authentication & Users
| Endpoint | Description |
|---|---|
| `/api/auth` | Login & registration |
| `/api/users` | User CRUD & role management |

### eBay Integration
| Endpoint | Description |
|---|---|
| `/api/ebay` | eBay listing management, orders, feeds, OAuth |
| `/api/sellers` | Seller account management |
| `/api/seller-pricing-config` | Seller-specific pricing rules |

### Product & Listing Management
| Endpoint | Description |
|---|---|
| `/api/template-listings` | Template-based listing workflow |
| `/api/listing-templates` | Listing template CRUD |
| `/api/template-overrides` | Per-listing template overrides |
| `/api/listing-completions` | Listing completion tracking |
| `/api/listing-stats` | Listing performance statistics |
| `/api/product-umbrellas` | Product umbrella grouping |
| `/api/custom-columns` | Custom column definitions |
| `/api/column-presets` | Saved column presets |

### Amazon
| Endpoint | Description |
|---|---|
| `/api/amazon-lookup` | Amazon product data lookup |
| `/api/amazon-accounts` | Amazon account management |
| `/api/asin-directory` | ASIN directory management |
| `/api/asin-list-categories` | ASIN list categories |
| `/api/asin-list-ranges` | ASIN list price ranges |
| `/api/asin-list-products` | ASIN list products |

### Orders & Finance
| Endpoint | Description |
|---|---|
| `/api/orders` | Order management |
| `/api/affiliate-orders` | Affiliate order tracking |
| `/api/transactions` | Financial transactions |
| `/api/payoneer` | Payoneer integration |
| `/api/payment-accounts` | Payment account management |
| `/api/bank-accounts` | Bank account records |
| `/api/credit-cards` | Credit card management |
| `/api/credit-card-names` | Credit card name references |
| `/api/exchange-rates` | Currency exchange rates |
| `/api/extra-expenses` | Additional expense tracking |

### Employee & HR
| Endpoint | Description |
|---|---|
| `/api/employee-profiles` | Employee profile management |
| `/api/attendance` | Working hours / timer tracking |
| `/api/salary` | Payroll management |
| `/api/leaves` | Leave request management |

### Task & Assignment Management
| Endpoint | Description |
|---|---|
| `/api/tasks` | Task management |
| `/api/assignments` | Task assignments |
| `/api/compatibility` | Compatibility data assignments |
| `/api/store-wise-tasks` | Store-level task tracking |

### Communication
| Endpoint | Description |
|---|---|
| `/api/internal-messages` | Internal messaging system |
| `/api/chat-templates` | Chat response templates |
| `/api/remark-templates` | Remark/note templates |

### AI & Utilities
| Endpoint | Description |
|---|---|
| `/api/ai` | AI-powered endpoints (Gemini, OpenAI, Groq) |
| `/api/upload` | File upload handling |
| `/api/csv-storage` | CSV data storage & retrieval |
| `/api/account-health` | Account health reporting |
| `/api/range-analysis` | Price range analysis |

### Miscellaneous
| Endpoint | Description |
|---|---|
| `/api/platforms` | Platform management |
| `/api/stores` | Store management |
| `/api/ranges` | Price range definitions |
| `/api/categories` | Category management |
| `/api/subcategories` | Subcategory management |
| `/api/ideas` | Idea tracking |
| `/api/resolution-options` | Resolution option definitions |
| `/api/lister-info` | Lister information |
| `/api/user-sellers` | User-seller assignments |

### Documentation
| Endpoint | Description |
|---|---|
| `/api-docs` | Swagger UI (interactive API docs) |
| `/api-docs.json` | Raw OpenAPI JSON spec |
| `/health` | Health check endpoint |

---

## Key Features

- **Role-Based Access Control** — Fine-grained permissions across 12+ user roles (superadmin, productadmin, listingadmin, lister, advancelister, seller, fulfillmentadmin, hradmin, etc.)
- **eBay Integration** — Full eBay API integration for listing creation, order sync, feed uploads, and OAuth token management
- **Amazon Product Lookup** — Real-time Amazon product data fetching with intelligent caching
- **AI-Powered Operations** — Multi-provider AI integration (OpenAI, Groq, Google Gemini) for product descriptions, fitment data, and chat assistance
- **Price Scraping** — Automated price scraping via ScraperAPI with configurable concurrency and retry logic
- **Template Listing System** — Sophisticated template-based listing workflow with overrides and bulk operations
- **Employee Management** — Complete HR module including attendance tracking, leave management, and payroll
- **Real-Time Image Processing** — Server-side image processing with Sharp, including caching and CDN upload
- **Scheduled Jobs** — Automated background tasks via node-cron (e.g., daily timer auto-stop)
- **API Documentation** — Auto-generated Swagger/OpenAPI docs
- **Security** — Helmet headers, NoSQL injection prevention, rate limiting, JWT auth

---

## Scripts

| Script | Command | Description |
|---|---|---|
| **dev** | `npm run dev` | Start dev server with `--watch` (auto-restart) |
| **dev:test** | `npm run dev:test` | Start dev server using `.env.test` |
| **start** | `npm start` | Start production server |
| **start:test** | `npm run start:test` | Start production server using `.env.test` |
| **clone** | `npm run clone` | Clone production data to test environment |

---

## Deployment

The backend is designed to be deployed as a standard Node.js application. Key considerations:

- **Database**: Uses MongoDB Atlas (cloud-hosted) — connection string configured via `MONGODB_URI`
- **Static Files**: Serves uploaded files from `public/uploads/`
- **Webhooks**: Requires a publicly accessible URL (`PUBLIC_BASE_URL`) for eBay webhook callbacks (ngrok for local dev)
- **Port**: Configurable via `PORT` env var (default: `5000`)

```bash
# Production start
npm start
```

---

## License

Private — All rights reserved.
