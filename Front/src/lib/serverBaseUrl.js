/**
 * Base URL for the Express API host (no trailing slash).
 * Dev: set VITE_SERVER_URL in .env. Production same-origin: omit env so we use window.location.origin.
 */
export function getServerBaseUrl() {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    return String(fromEnv).replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:5000';
}
