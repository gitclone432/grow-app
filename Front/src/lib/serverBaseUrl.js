/**
 * Base URL for the Express API host (no trailing slash).
 * Prefer VITE_API_URL host to keep OAuth connect/callback on same backend as API calls.
 * Dev: VITE_API_URL=http://localhost:5000/api (or VITE_SERVER_URL=http://localhost:5000)
 * Production same-origin: omit env so we use window.location.origin.
 */
export function getServerBaseUrl() {
  const normalizeBase = (value) => {
    if (!value || String(value).trim() === '') return '';
    const trimmed = String(value).trim().replace(/\/$/, '');
    // Convert ".../api" -> "..."
    return trimmed.replace(/\/api$/i, '');
  };

  // Keep OAuth host aligned with API host to avoid JWT state signature mismatch.
  const fromApiEnv = normalizeBase(import.meta.env.VITE_API_URL);
  if (fromApiEnv) return fromApiEnv;

  const fromEnv = import.meta.env.VITE_SERVER_URL;
  const normalizedServer = normalizeBase(fromEnv);
  if (normalizedServer) return normalizedServer;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:5000';
}
