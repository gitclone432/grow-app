import axios from 'axios';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Calls this same server's own /api routes as if a real logged-in user made
 * the request — used by background automation (Sourcing Rules auto-generate
 * & save, lib/asinSourcingAutomation.js) that needs to reuse existing
 * request-handler logic (e.g. /template-listings/bulk-preview, /bulk-save)
 * exactly as the browser does, rather than duplicating it.
 *
 * Signs a short-lived JWT the same way routes/auth.js's /login does, using
 * the target user's *current* tokenVersion/permissionsVersion so it passes
 * requireAuth (middleware/auth.js) precisely like a fresh login would.
 */
export async function callInternalApi({ method = 'POST', path, data, asUserId, responseType, raw = false }) {
  if (!asUserId) {
    throw new Error('callInternalApi requires asUserId');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set — cannot sign internal API token');
  }

  const user = await User.findById(asUserId).select('role tokenVersion permissionsVersion active').lean();
  if (!user) {
    throw new Error(`Internal API user ${asUserId} not found`);
  }
  if (!user.active) {
    throw new Error(`Internal API user ${asUserId} is not active`);
  }

  const token = jwt.sign(
    {
      userId: String(asUserId),
      role: user.role,
      tokenVersion: user.tokenVersion || 1,
      permissionsVersion: user.permissionsVersion || 1,
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const port = process.env.PORT || 5000;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const response = await axios({
      method,
      url: `${baseUrl}${path}`,
      data,
      headers: { Authorization: `Bearer ${token}` },
      timeout: parseInt(process.env.INTERNAL_API_TIMEOUT_MS, 10) || 300000,
      ...(responseType ? { responseType } : {}),
    });
    // `raw: true` returns the full axios response (needed for endpoints like
    // /export-csv that return a file body + a Content-Disposition header,
    // not a JSON envelope) — otherwise just the parsed body, as before.
    return raw ? response : response.data;
  } catch (error) {
    // For non-JSON responseTypes (e.g. 'text', 'arraybuffer'), an error body
    // isn't pre-parsed JSON — try to surface it anyway, best-effort.
    let message = error.response?.data?.error || error.message || 'Internal API call failed';
    if (!error.response?.data?.error && Buffer.isBuffer(error.response?.data)) {
      try {
        message = JSON.parse(error.response.data.toString('utf8'))?.error || message;
      } catch {
        // leave message as-is
      }
    }
    throw new Error(`${method} ${path} failed: ${message}`);
  }
}
