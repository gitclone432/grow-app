# Deploy: GitHub + Vercel (frontend) + MongoDB Atlas + API host

Your stack is a **Vite React app** (`Front/`) and an **Express API** (`Back/`). Vercel is ideal for the static/React build. The API is a long‑running Node server, so it should run on a **Node host** (this repo includes an optional **[Render](https://render.com)** blueprint). MongoDB **Atlas M0** is free and works from both.

---

## 1. Push the project to GitHub

1. On GitHub, create a **new empty repository** (no README if you already have files locally).
2. In a terminal at the **repository root** (the folder that contains `Front/`, `Back/`, and `.gitignore`):
  ```powershell
   git status
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git add .
   git commit -m "Initial commit"
   git push -u origin main
  ```
   Use `master` instead of `main` if that is your default branch.
3. Confirm `**.env` files are not tracked** (`git status` should not list `Back/.env` or `Front/.env`). The root `.gitignore` ignores them.

---

## 2. MongoDB Atlas (free M0)

1. Sign in at [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas) and create a project.
2. **Create** a **M0** (free) cluster (pick a nearby region).
3. **Database Access** → create a database user (username + password). Save the password.
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`) so Vercel and Render (dynamic IPs) can connect. For stricter security later, narrow this down.
5. **Database** → **Connect** → **Drivers** → copy the **connection string** (SRV), replace `<password>` with your user’s password, and set a database name in the path (e.g. `...mongodb.net/grow?retryWrites=true&w=majority`).

You will paste this string into **Render** (and optionally local) as `MONGODB_URI`.

---

## 3. Host the API (Render — free, recommended with Vercel)

Vercel serverless is a poor fit for this Express app as‑is; use **Render Web Service** (free tier; service may spin down after idle).

1. Sign up at [https://render.com](https://render.com) and connect your **GitHub** account.
2. **New** → **Blueprint** (or **Web Service** if you prefer manual).
  - If using the repo’s `render.yaml`, choose the repo and follow the blueprint flow.
  - Otherwise: **New Web Service** → select the repo → set **Root Directory** to `Back` → **Build** `npm ci` → **Start** `npm start`.
3. After deploy, copy the service URL, e.g. `https://grow-api-xxxx.onrender.com`.
4. In Render → your service → **Environment**, add (values are examples):

  | Key                  | Value                                                                                                                                            |
  | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `MONGODB_URI`        | Atlas SRV connection string                                                                                                                      |
  | `JWT_SECRET`         | Long random string (32+ characters)                                                                                                              |
  | `NODE_ENV`           | `production`                                                                                                                                     |
  | `CLIENT_ORIGIN`      | Your Vercel URL(s), comma‑separated, no trailing slash, e.g. `https://your-app.vercel.app`                                                       |
  | `EBAY_CLIENT_ID`     | From eBay Developer Portal                                                                                                                       |
  | `EBAY_CLIENT_SECRET` | From eBay Developer Portal                                                                                                                       |
  | `EBAY_RU_NAME`       | RuName string (User Tokens)                                                                                                                      |
  | `RUNNER_ID`          | e.g. `render` (distinct from your laptop’s `local`)                                                                                              |
  | `IMGBB_API_KEY`      | From [api.imgbb.com](https://api.imgbb.com/) — required for **Settings → Image Overlay** (processed listing images upload to ImgBB)              |
  | `SCRAPER_PROVIDER`   | `**scrapingdog`** if your key is from [ScrapingDog](https://www.scrapingdog.com/) (default on server is `scraperapi` — wrong provider = **401**) |
  | `SCRAPER_API_KEY`    | Your ScrapingDog API key (same variable name for both providers)                                                                                 |

  After changing scraper env vars, **Save** and **Manual Deploy** the API service. On startup, logs should show: `[env] ... | gmail=...` and `[Amazon Scraper] Provider: scrapingdog`.
  In the app: **Settings → Scraper Tester** — banner should say `SCRAPER_PROVIDER=scrapingdog` and key length > 0.
5. **eBay RuName** → set **Your auth accepted URL** to:
  `https://YOUR-RENDER-HOST.onrender.com/api/ebay/callback`
6. Redeploy after changing env vars. Open `https://YOUR-RENDER-HOST.onrender.com/health` — you should see `{"ok":true}`.

---

## 4. Vercel (frontend only)

1. Sign in at [https://vercel.com](https://vercel.com) → **Add New** → **Project** → import the **same GitHub repo**.
2. Under **Configure Project**:
  - **Root Directory**: set to `**Front`** (Important.)
  - Framework Preset: **Vite** (auto).
  - Build / Output: defaults (`npm run build`, output `dist`).
3. **Environment Variables** (Production — repeat for Preview if you use previews):

  | Name              | Value                                       |
  | ----------------- | ------------------------------------------- |
  | `VITE_API_URL`    | `https://YOUR-RENDER-HOST.onrender.com/api` |
  | `VITE_SERVER_URL` | `https://YOUR-RENDER-HOST.onrender.com`     |

   `VITE_SERVER_URL` is required so eBay OAuth and any full‑URL links hit the API host, not the Vercel page origin.
4. Deploy. Open the `.vercel.app` URL and test login and API calls.
5. **CORS**: In Render, set `CLIENT_ORIGIN` to your Vercel production URL. For preview deployments, add additional origins separated by commas, or use a second Render env group — the backend reads comma‑separated `CLIENT_ORIGIN` in `Back/src/index.js`.

---

## 5. Checklist before going live

- Atlas user + network `0.0.0.0/0` (or documented restrictions).
- Render: `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, eBay vars, `IMGBB_API_KEY` (image overlays).
- Vercel: `VITE_API_URL`, `VITE_SERVER_URL` point to the **same** Render base URL.
- eBay RuName **auth accepted URL** = `https://<render-host>/api/ebay/callback`.
- First‑time admin: use your existing seed flow or create user in DB as you do locally.

---

## Optional: all‑in‑one Docker image

If you prefer a **single URL** (UI + API) on a VM, use the root `Dockerfile` and `docker-compose.yml` from the repo instead of Vercel + Render; Atlas still works as the database.