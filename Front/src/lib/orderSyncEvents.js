const ORDER_SYNC_EVENT = 'orders-sync:updated';
const ORDER_SYNC_STORAGE_KEY = 'orders_sync_signal';

export function publishOrderSyncEvent(source = 'unknown', reason = 'manual') {
  const payload = {
    at: Date.now(),
    source,
    reason,
  };

  // Same-tab listeners
  window.dispatchEvent(new CustomEvent(ORDER_SYNC_EVENT, { detail: payload }));

  // Cross-tab listeners
  try {
    localStorage.setItem(ORDER_SYNC_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore localStorage write failures (private mode/quota).
    console.warn('[OrderSync] Could not write localStorage signal:', error?.message || error);
  }
}

export function subscribeOrderSyncEvent(callback) {
  const handleCustomEvent = (event) => {
    callback(event?.detail || null);
  };

  const handleStorageEvent = (event) => {
    if (event.key !== ORDER_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      callback(JSON.parse(event.newValue));
    } catch {
      callback(null);
    }
  };

  window.addEventListener(ORDER_SYNC_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(ORDER_SYNC_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}
