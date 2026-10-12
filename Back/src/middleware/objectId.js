/**
 * Let a literal path reach its own route when it sits behind a `/:id` pattern.
 *
 * Express matches routes in registration order and has no notion of a literal
 * segment being more specific than a parameter, so `router.get('/:id')`
 * swallows every single-segment path registered after it. The handler then
 * hands the literal to Mongoose, the ObjectId cast throws, and the route's own
 * catch reports it as a 500 whose message names `_id` — an error that gives no
 * hint the real problem is route ordering, and sends whoever is debugging it
 * looking at the database instead of the router.
 *
 * `next('route')` skips the rest of this route's stack and resumes matching, so
 * a literal route registered later still gets its request. An id that is merely
 * malformed matches nothing further and ends at the router's 404 — which is
 * what a bad id should have returned in the first place.
 *
 * Guarding the pattern rather than reordering the routes is what keeps this
 * fixed: the next literal path added to the bottom of the file works without
 * its author needing to know the ordering rule exists.
 */

// A route parameter is always a string, and the only string form an id takes in
// a URL is 24-char hex.
//
// Checked here rather than with mongoose.Types.ObjectId.isValid, which answers a
// broader question than this one: it accepts 12-byte Buffers, bare numbers and
// ObjectId instances too, and which *strings* it accepts has moved between major
// versions (8.x is strict; earlier ones took any 12-character string, which
// would have quietly shadowed any 12-character route name). Nothing about which
// path reaches which handler should depend on the installed Mongoose, so the
// shape is pinned here.
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * @param {string} [param='id'] - name of the route parameter to check
 * @returns {import('express').RequestHandler}
 */
export function requireObjectId(param = 'id') {
  // Named rather than anonymous so it appears as itself in stack traces and in
  // a router's layer list, both of which otherwise show '<anonymous>'.
  return function requireObjectIdGuard(req, res, next) {
    if (OBJECT_ID_PATTERN.test(req.params[param] || '')) return next();
    next('route');
  };
}
