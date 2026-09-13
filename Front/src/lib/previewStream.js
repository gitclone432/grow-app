export function asinsMatch(a, b) {
  return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}

export function mergePreviewStreamItem(prev, incoming) {
  if (!incoming) return prev;
  const incomingId = incoming.id;
  return prev.map((item) => {
    const sameId = incomingId && item.id === incomingId;
    const sameAsin = asinsMatch(item.asin, incoming.asin);
    return (sameId || sameAsin) ? { ...item, ...incoming } : item;
  });
}

export function failRemainingLoadingPreviewItems(prev, message) {
  return prev.map((item) => (
    item.status === 'loading'
      ? {
          ...item,
          status: 'error',
          errors: [message || 'Preview ended before this ASIN finished generating.'],
        }
      : item
  ));
}
