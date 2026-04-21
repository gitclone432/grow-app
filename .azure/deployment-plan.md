# Deployment plan — Grow (Back + Front + MongoDB)

For **GitHub + Vercel + Atlas + API hosting**, follow the step-by-step guide: **[DEPLOY.md](../DEPLOY.md)** (Vercel = frontend; API = Render or Docker).

## Status

**Artifacts generated** — Review this plan, then run `docker compose up --build` (or deploy the image to your host). Optional Azure path: push image to ACR + run on Container Apps / App Service.

## Mode

**MODIFY** — Existing Express API (`Back/`) + Vite React app (`Front/`) + MongoDB.

## Target architecture

| Component | Approach |
|-----------|----------|
| API + UI (single origin) | One Node process serves `/api/*` and static SPA from `public/app` when `SERVE_FRONTEND=true` |
| Container | Multi-stage `Dockerfile` at repo root: build Front → copy `dist` into Back `public/app` |
| Database | **MongoDB Atlas** (recommended) or MongoDB in `docker-compose` for self-hosted trials |
| HTTPS | Terminated at reverse proxy (nginx, Caddy, cloud load balancer) or PaaS (Azure App Service, Render, etc.) |

## Environment variables (server)

Set on the host or in `docker-compose.yml` / PaaS config:

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Production Mongo connection string |
| `JWT_SECRET` | Strong random secret (not the dev placeholder) |
| `NODE_ENV` | `production` |
| `PORT` | Listen port (default `8080` in Docker image) |
| `CLIENT_ORIGIN` | Public site URL, e.g. `https://app.example.com` (CORS; no trailing slash) |
| `SERVE_FRONTEND` | `true` when serving the built SPA from the API container |
| `FRONTEND_DIST_PATH` | Optional; default `public/app` inside container |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` / `EBAY_RU_NAME` | eBay production keys |
| `RUNNER_ID` | Unique per deployment (e.g. `prod`) so batch jobs do not collide with dev |

**eBay:** In Developer Portal → User Tokens → RuName, set **Your auth accepted URL** to:

`https://<your-public-host>/api/ebay/callback`

(HTTPS in production.) OAuth `redirect_uri` remains the **RuName string** in env.

## Build-time (Front)

Docker build passes `VITE_API_URL=/api` so the browser calls same-origin API. `VITE_SERVER_URL` is omitted so runtime uses `window.location.origin` for eBay connect redirects.

## Files added / changed

- Root `Dockerfile`, `.dockerignore`, `docker-compose.yml`
- `Back/src/index.js` — optional SPA static + fallback
- `Front/src/lib/serverBaseUrl.js` — same-origin server URL
- `Front` components/pages — use `getServerBaseUrl()` where needed
- `Back/.env.example` — production hints

## Validation

1. `docker compose up --build` → open `http://localhost:8080`, log in, smoke-test API.
2. Replace `MONGODB_URI` with Atlas URI before real data.
3. After public DNS + TLS, update `CLIENT_ORIGIN` and eBay RuName accepted URL.

## Azure (optional follow-up)

Use **azure-validate** / **azure-deploy** after choosing subscription/region: push this image to Azure Container Registry, run on Container Apps or Web App for Containers, attach secrets for env vars, and use Atlas or Azure Cosmos DB for MongoDB API if desired.
