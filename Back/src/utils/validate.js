/**
 * Express middleware factory for Zod schema validation.
 *
 * Usage:
 *   import { validate } from '../utils/validate.js';
 *   import { mySchema } from '../schemas/index.js';
 *
 *   router.post('/route', validate(mySchema), async (req, res) => { ... });
 *
 * On success  : req.body is replaced with the parsed (coerced + unknown-keys-stripped) data.
 * On failure  : responds 400 { error: 'Validation failed', details: [{ field, message }] }
 *
 * The `source` parameter lets you validate req.query or req.params instead of req.body.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map(e => ({
          field: e.path.join('.') || source,
          message: e.message,
        })),
      });
    }
    // Replace with the parsed/coerced/stripped value so downstream handlers see clean data
    req[source] = result.data;
    next();
  };
}
