/**
 * Wraps an async route handler so unhandled rejections are forwarded to
 * Express's global error handler instead of causing an unhandled promise rejection.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOp();
 *     res.json(data);
 *   }));
 *
 * @param {Function} fn - async (req, res, next) route handler
 * @returns {Function} Express middleware that catches async errors
 */
export const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
