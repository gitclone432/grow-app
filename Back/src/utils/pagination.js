/** Shared API pagination helpers — keeps page sizes bounded for bandwidth. */

export const DEFAULT_API_PAGE_SIZE = 50;
export const MAX_API_PAGE_SIZE = 200;

/**
 * @param {Record<string, unknown>} query
 * @param {{ defaultLimit?: number, maxLimit?: number, defaultPage?: number }} [opts]
 */
export function parsePagination(query = {}, opts = {}) {
  const defaultLimit = opts.defaultLimit ?? DEFAULT_API_PAGE_SIZE;
  const maxLimit = opts.maxLimit ?? MAX_API_PAGE_SIZE;
  const defaultPage = opts.defaultPage ?? 1;

  const page = Math.max(parseInt(query.page, 10) || defaultPage, 1);
  const requestedLimit = parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function buildPaginationMeta(total, page, limit) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
