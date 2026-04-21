# Build SPA then ship API + static assets in one image (same-origin /api + UI).
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app/Front
COPY Front/package.json Front/package-lock.json ./
RUN npm ci
COPY Front/ ./
ARG VITE_API_URL=/api
ARG VITE_SERVER_URL=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
COPY Back/package.json Back/package-lock.json ./
RUN npm ci --omit=dev
COPY Back/ ./
COPY --from=frontend-builder /app/Front/dist ./public/app
RUN chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=8080
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST_PATH=public/app
EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
