import api from './api';

/**
 * Fetch every page from a paginated GET endpoint (respects server max page size).
 * @param {string} url
 * @param {object} baseParams - query params except page/limit
 * @param {{ limit?: number, itemsKey?: string, pagesKey?: string, maxPages?: number }} [opts]
 */
export async function fetchAllPages(url, baseParams = {}, opts = {}) {
  const limit = opts.limit ?? 200;
  const itemsKey = opts.itemsKey ?? inferItemsKey(url);
  const pagesKey = opts.pagesKey ?? 'totalPages';
  const maxPages = opts.maxPages ?? 500;

  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const { data } = await api.get(url, { params: { ...baseParams, page, limit } });
    const batch = data?.[itemsKey] ?? data?.orders ?? data?.returns ?? data?.asins ?? data?.tasks ?? [];
    if (Array.isArray(batch)) all.push(...batch);

    const pagination = data?.pagination ?? data;
    totalPages = pagination?.[pagesKey]
      ?? pagination?.totalPages
      ?? pagination?.pages
      ?? data?.totalPages
      ?? data?.pages
      ?? page;

    if (!batch.length || batch.length < limit) break;
    page += 1;
  }

  return all;
}

function inferItemsKey(url) {
  if (url.includes('orders')) return 'orders';
  if (url.includes('returns')) return 'returns';
  if (url.includes('asin-directory')) return 'asins';
  if (url.includes('tasks')) return 'tasks';
  return 'items';
}
