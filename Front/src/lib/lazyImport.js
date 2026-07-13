import { lazy } from 'react';

const CHUNK_RELOAD_KEY = 'gm_chunk_reload';

/** True when the browser is trying to load an old hashed JS chunk after a deploy. */
export function isStaleChunkLoadError(error) {
  const message = String(error?.message || error || '');
  const name = String(error?.name || '');
  return (
    /failed to fetch dynamically imported module/i.test(message)
    || /loading chunk [\da-z]+ failed/i.test(message)
    || /importing a module script failed/i.test(message)
    || /chunkloaderror/i.test(name)
    || /chunkloaderror/i.test(message)
  );
}

/** Reload once so the browser picks up the latest Vite asset manifest. */
export function tryReloadForStaleChunk(error) {
  if (!isStaleChunkLoadError(error)) return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    // sessionStorage may be blocked — still attempt one reload.
  }
  window.location.reload();
  return true;
}

export function clearStaleChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // ignore
  }
}

/** React.lazy wrapper — auto-reloads once when a post-deploy chunk 404s. */
export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (tryReloadForStaleChunk(error)) {
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
