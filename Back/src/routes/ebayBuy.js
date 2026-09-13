import { Router } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import qs from 'qs';
import jwt from 'jsonwebtoken';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EbayBuyerAccount from '../models/EbayBuyerAccount.js';
import EbayBuyPurchase from '../models/EbayBuyPurchase.js';

const router = Router();
const pageAuth = [requireAuth, requirePageAccess(['EbayBuyingLab', 'EbayBuyingAccounts'])];

const MARKETPLACES = new Set([
  'EBAY_US',
  'EBAY_GB',
  'EBAY_DE',
  'EBAY_AU',
  'EBAY_CA',
  'EBAY_IT',
  'EBAY_FR',
  'EBAY_ES',
  'EBAY_MOTORS_US',
]);

const BUY_USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/buy.order',
];

const MEMBER_ORDER_BASES = ['/buy/order/v1', '/buy/order/v1_beta'];
const appTokenCache = { token: null, expiresAt: 0, key: '' };

function buyCredentials() {
  const dedicatedId = String(process.env.EBAY_BUY_CLIENT_ID || '').trim();
  const dedicatedSecret = String(process.env.EBAY_BUY_CLIENT_SECRET || '').trim();
  const clientId = dedicatedId || String(process.env.EBAY_CLIENT_ID || '').trim();
  const clientSecret = dedicatedSecret || String(process.env.EBAY_CLIENT_SECRET || '').trim();
  const sandbox = String(process.env.EBAY_BUY_SANDBOX || '').trim().toLowerCase() === 'true';
  return {
    clientId,
    clientSecret,
    sandbox,
    usingDedicatedBuyApp: Boolean(dedicatedId),
  };
}

function apiHost(sandbox) {
  return sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

function authHost(sandbox) {
  return sandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
}

function clientOrigin() {
  const raw = String(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return raw || 'http://localhost:5173';
}

function buyRedirectUri() {
  const ru = String(process.env.EBAY_BUY_RU_NAME || process.env.EBAY_RU_NAME || '').trim();
  if (ru && !/^https?:\/\//i.test(ru)) return ru;
  const override = String(process.env.EBAY_OAUTH_REDIRECT_URI || '').trim();
  if (/^https?:\/\//i.test(override)) return override;
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    const host = (process.env.PUBLIC_API_HOST || 'localhost').replace(/\/$/, '');
    return `http://${host}:${port}/api/ebay-buy/callback`;
  }
  return ru;
}

function buyUserScopes() {
  const fromEnv = String(process.env.EBAY_BUY_USER_SCOPES || '')
    .trim()
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (fromEnv.length ? fromEnv : BUY_USER_SCOPES).join(' ');
}

function normalizeMarketplace(raw) {
  const id = String(raw || 'EBAY_US').trim().toUpperCase();
  return MARKETPLACES.has(id) ? id : 'EBAY_US';
}

function extractItemId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^v1\|/i.test(s) || s.includes('|')) return s;
  const urlMatch = s.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})/i)
    || s.match(/[?&]item(?:id)?=(\d{9,15})/i);
  if (urlMatch) return urlMatch[1];
  const digits = s.replace(/\D/g, '');
  if (/^\d{9,15}$/.test(digits)) return digits;
  return s;
}

function parseItemLines(raw) {
  const text = Array.isArray(raw) ? raw.join('\n') : String(raw || '');
  const seen = new Set();
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/[\s,;]+/).filter(Boolean);
    const itemId = extractItemId(parts[0] || '');
    if (!itemId) continue;
    const qtyRaw = parts.length > 1 ? Number(parts[parts.length - 1]) : 1;
    const quantity = Number.isInteger(qtyRaw) && qtyRaw > 0 && qtyRaw < 100 && /^\d+$/.test(parts[parts.length - 1] || '')
      ? qtyRaw
      : 1;
    const key = `${itemId}:${quantity}`;
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    items.push({ itemId, quantity: quantity || 1, key });
  }
  return items;
}

function ebayErrorPayload(err) {
  const data = err.response?.data;
  const status = err.status || err.response?.status || 500;
  const message =
    data?.errors?.[0]?.longMessage
    || data?.errors?.[0]?.message
    || data?.error_description
    || data?.error
    || err.message
    || 'eBay Buy API request failed';
  return { status, body: { error: message, ebay: data || undefined } };
}

function browseHeaders(token, marketplace) {
  return {
    Authorization: `Bearer ${token}`,
    'X-EBAY-C-MARKETPLACE-ID': marketplace,
    Accept: 'application/json',
  };
}

function orderHeaders(token, marketplace, account, shipping) {
  const country = String(shipping?.country || 'US').trim().toUpperCase() || 'US';
  const zip = String(shipping?.postalCode || '').trim();
  const deviceId = String(account?.deviceId || 'buy-lab').trim();
  const ctx = zip
    ? `contextualLocation=${encodeURIComponent(`country=${country},zip=${zip}`)}`
    : `deviceId=${deviceId}`;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': marketplace,
    'X-EBAY-C-ENDUSERCTX': ctx,
  };
}

function shippingIsComplete(shipping = {}) {
  return Boolean(
    String(shipping.recipient || '').trim()
    && String(shipping.addressLine1 || '').trim()
    && String(shipping.city || '').trim()
    && String(shipping.postalCode || '').trim()
    && String(shipping.country || '').trim()
  );
}

function toShippingPayload(shipping = {}) {
  return {
    recipient: String(shipping.recipient || '').trim(),
    addressLine1: String(shipping.addressLine1 || '').trim(),
    addressLine2: String(shipping.addressLine2 || '').trim() || undefined,
    city: String(shipping.city || '').trim(),
    stateOrProvince: String(shipping.stateOrProvince || '').trim() || undefined,
    postalCode: String(shipping.postalCode || '').trim(),
    country: String(shipping.country || 'US').trim().toUpperCase(),
    phoneNumber: String(shipping.phoneNumber || '').trim() || undefined,
  };
}

async function getBuyApplicationToken() {
  const { clientId, clientSecret, sandbox } = buyCredentials();
  if (!clientId || !clientSecret) {
    const err = new Error(
      'eBay Buy API credentials are missing. Set EBAY_BUY_CLIENT_ID and EBAY_BUY_CLIENT_SECRET in Back/.env (or EBAY_CLIENT_ID / EBAY_CLIENT_SECRET).'
    );
    err.status = 503;
    throw err;
  }

  const key = `${sandbox}:${clientId}`;
  if (appTokenCache.token && appTokenCache.key === key && Date.now() < appTokenCache.expiresAt) {
    return appTokenCache.token;
  }

  const scope = String(process.env.EBAY_BUY_SCOPE || 'https://api.ebay.com/oauth/api_scope').trim();
  const response = await axios.post(
    `${apiHost(sandbox)}/identity/v1/oauth2/token`,
    qs.stringify({ grant_type: 'client_credentials', scope }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
    }
  );

  const expiresIn = Number(response.data.expires_in || 7200);
  appTokenCache.token = response.data.access_token;
  appTokenCache.key = key;
  appTokenCache.expiresAt = Date.now() + Math.max(30, expiresIn - 60) * 1000;
  return appTokenCache.token;
}

function accountIsConnected(account) {
  return Boolean(account?.tokens?.refresh_token || account?.tokens?.access_token);
}

function publicAccount(account) {
  if (!account) return null;
  const shipping = account.shipping || {};
  return {
    id: String(account._id),
    name: account.name || account.ebayUsername || 'Untitled',
    ebayUsername: account.ebayUsername || '',
    ebayUserId: account.ebayUserId || '',
    connected: accountIsConnected(account),
    connectedAt: account.connectedAt || null,
    disconnectedAt: account.disconnectedAt || null,
    shipping,
    shippingReady: shippingIsComplete(shipping),
    marketplace: account.marketplace || 'EBAY_US',
    active: Boolean(account.active),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function applyShippingFields(account, ship = {}) {
  account.shipping = {
    recipient: String(ship.recipient || '').trim(),
    addressLine1: String(ship.addressLine1 || '').trim(),
    addressLine2: String(ship.addressLine2 || '').trim(),
    city: String(ship.city || '').trim(),
    stateOrProvince: String(ship.stateOrProvince || '').trim(),
    postalCode: String(ship.postalCode || '').trim(),
    country: String(ship.country || 'US').trim().toUpperCase(),
    phoneNumber: String(ship.phoneNumber || '').trim(),
    contactEmail: String(ship.contactEmail || '').trim(),
  };
}

async function ensureDeviceId(account) {
  if (!account.deviceId) {
    account.deviceId = crypto.randomUUID();
    await account.save();
  }
  return account;
}

async function setActiveAccount(account) {
  await EbayBuyerAccount.updateMany({ _id: { $ne: account._id } }, { $set: { active: false } });
  account.active = true;
  await account.save();
  return account;
}

async function getBuyerAccount(accountId) {
  if (accountId) {
    const account = await EbayBuyerAccount.findById(accountId);
    if (!account) {
      const err = new Error('Buying account not found');
      err.status = 404;
      throw err;
    }
    return ensureDeviceId(account);
  }

  const active = await EbayBuyerAccount.findOne({ active: true });
  if (active && accountIsConnected(active)) return ensureDeviceId(active);

  const connected = await EbayBuyerAccount.findOne({
    $or: [
      { 'tokens.refresh_token': { $exists: true, $nin: [null, ''] } },
      { 'tokens.access_token': { $exists: true, $nin: [null, ''] } },
    ],
  }).sort({ connectedAt: -1, updatedAt: -1 });
  if (connected) return ensureDeviceId(connected);

  const err = new Error('Add and connect a buying account first.');
  err.status = 400;
  throw err;
}

async function getBuyUserToken(accountId) {
  const account = await getBuyerAccount(accountId);
  if (!accountIsConnected(account)) {
    const err = new Error('Connect an eBay buying account first.');
    err.status = 400;
    throw err;
  }

  const { clientId, clientSecret, sandbox } = buyCredentials();
  const fetchedAt = account.tokens.fetchedAt ? new Date(account.tokens.fetchedAt).getTime() : 0;
  const expiresInMs = (account.tokens.expires_in || 0) * 1000;
  const stillValid = fetchedAt && Date.now() - fetchedAt < expiresInMs - 2 * 60 * 1000;
  if (stillValid && account.tokens.access_token) {
    return { token: account.tokens.access_token, account };
  }

  if (!account.tokens.refresh_token) {
    const err = new Error('Buying account token expired. Reconnect the eBay buying account.');
    err.status = 401;
    throw err;
  }

  const response = await axios.post(
    `${apiHost(sandbox)}/identity/v1/oauth2/token`,
    qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: account.tokens.refresh_token,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
    }
  );

  account.tokens.access_token = response.data.access_token;
  account.tokens.expires_in = response.data.expires_in;
  account.tokens.token_type = response.data.token_type;
  if (response.data.refresh_token) account.tokens.refresh_token = response.data.refresh_token;
  if (response.data.scope) account.tokens.scope = response.data.scope;
  account.tokens.fetchedAt = new Date();
  await account.save();
  return { token: account.tokens.access_token, account };
}

async function fetchBrowseItem({ itemId, marketplace, sandbox, token }) {
  const isRestful = /\|/.test(itemId);
  if (isRestful) {
    const response = await axios.get(`${apiHost(sandbox)}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
      params: { fieldgroups: 'PRODUCT' },
      headers: browseHeaders(token, marketplace),
    });
    return { item: response.data, lookup: 'item' };
  }

  try {
    const response = await axios.get(`${apiHost(sandbox)}/buy/browse/v1/item/get_item_by_legacy_id`, {
      params: { legacy_item_id: itemId, fieldgroups: 'PRODUCT' },
      headers: browseHeaders(token, marketplace),
    });
    return { item: response.data, lookup: 'legacy' };
  } catch (err) {
    const payload = JSON.stringify(err.response?.data || '');
    if (!/item_group|item group/i.test(payload)) throw err;
    const response = await axios.get(`${apiHost(sandbox)}/buy/browse/v1/item/get_items_by_item_group`, {
      params: { item_group_id: itemId },
      headers: browseHeaders(token, marketplace),
    });
    const items = response.data.items || [];
    return {
      item: items[0] || null,
      items,
      itemGroup: response.data,
      lookup: 'item_group',
    };
  }
}

function summarizeBrowseItem(item, inputId, quantity, lookup) {
  const options = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
  const buyable = options.includes('FIXED_PRICE') || options.includes('BEST_OFFER');
  const availability = item?.estimatedAvailabilities?.[0] || {};
  return {
    inputId,
    itemId: item?.itemId || '',
    legacyItemId: item?.legacyItemId || inputId,
    title: item?.title || '',
    condition: item?.condition || '',
    quantity,
    price: item?.price || null,
    seller: item?.seller?.username || '',
    imageUrl: item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || '',
    itemWebUrl: item?.itemWebUrl || '',
    buyingOptions: options,
    buyable,
    lookup,
    availabilityStatus: availability.availabilityStatus || item?.availabilityStatus || '',
    estimatedAvailableQuantity: availability.estimatedAvailableQuantity ?? null,
    warning: buyable ? '' : 'This listing is not Buy It Now. Auctions need the Offer API, not Order checkout.',
  };
}

async function memberOrderRequest({ method, path, body, token, marketplace, account, shipping }) {
  const { sandbox } = buyCredentials();
  let lastErr;
  for (const base of MEMBER_ORDER_BASES) {
    try {
      const response = await axios({
        method,
        url: `${apiHost(sandbox)}${base}${path}`,
        data: body,
        headers: orderHeaders(token, marketplace, account, shipping),
        validateStatus: (status) => status < 500,
      });
      if (response.status === 404 && base === MEMBER_ORDER_BASES[0]) {
        lastErr = response;
        continue;
      }
      if (response.status >= 400) {
        const err = new Error(
          response.data?.errors?.[0]?.longMessage
          || response.data?.errors?.[0]?.message
          || 'eBay Order API request failed'
        );
        err.response = response;
        err.status = response.status;
        throw err;
      }
      return { data: response.data, base };
    } catch (err) {
      lastErr = err;
      if (err.response?.status === 404 && base === MEMBER_ORDER_BASES[0]) continue;
      throw err;
    }
  }
  throw lastErr;
}

async function runCheckout({ items, marketplace, shipping, place, userId, accountId }) {
  const { token, account } = await getBuyUserToken(accountId);
  const { sandbox } = buyCredentials();
  const browseToken = await getBuyApplicationToken();
  const ship = shipping && Object.keys(shipping).length ? shipping : (account.shipping || {});
  const lineItemInputs = [];
  const resolved = [];

  for (const row of items) {
    const lookup = await fetchBrowseItem({
      itemId: extractItemId(row.itemId),
      marketplace,
      sandbox,
      token: browseToken,
    });
    const item = lookup.item;
    if (!item?.itemId) {
      throw Object.assign(new Error(`Could not resolve item ${row.itemId}`), { status: 400 });
    }
    const summary = summarizeBrowseItem(item, row.itemId, row.quantity || 1, lookup.lookup);
    if (!summary.buyable) {
      throw Object.assign(new Error(summary.warning || `Item ${row.itemId} is not Buy It Now`), { status: 400 });
    }
    resolved.push(summary);
    lineItemInputs.push({ itemId: item.itemId, quantity: Number(row.quantity) || 1 });
  }

  if (!lineItemInputs.length) {
    throw Object.assign(new Error('Add at least one item ID'), { status: 400 });
  }
  if (lineItemInputs.length > 4) {
    throw Object.assign(new Error('eBay member checkout allows at most 4 items per order. Place them in batches.'), { status: 400 });
  }

  const initiateBody = { lineItemInputs };
  if (shippingIsComplete(ship)) initiateBody.shippingAddress = toShippingPayload(ship);

  const initiated = await memberOrderRequest({
    method: 'post',
    path: '/checkout_session/initiate',
    body: initiateBody,
    token,
    marketplace,
    account,
    shipping: ship,
  });
  let session = initiated.data;
  const checkoutSessionId = session.checkoutSessionId;
  if (!checkoutSessionId) {
    throw Object.assign(new Error('eBay did not return a checkout session id'), { status: 502 });
  }

  if (shippingIsComplete(ship) && !initiateBody.shippingAddress) {
    const updated = await memberOrderRequest({
      method: 'post',
      path: `/checkout_session/${encodeURIComponent(checkoutSessionId)}/update_shipping_address`,
      body: toShippingPayload(ship),
      token,
      marketplace,
      account,
      shipping: ship,
    });
    session = updated.data;
  }

  if (!place) {
    return {
      placed: false,
      checkoutSessionId,
      session,
      items: resolved,
      account: publicAccount(account),
    };
  }

  const placed = await memberOrderRequest({
    method: 'post',
    path: `/checkout_session/${encodeURIComponent(checkoutSessionId)}/place_order`,
    token,
    marketplace,
    account,
    shipping: ship,
  });

  const record = await EbayBuyPurchase.create({
    inputId: resolved.map((r) => r.inputId).join(','),
    itemId: resolved.map((r) => r.itemId).join(','),
    legacyItemId: resolved.map((r) => r.legacyItemId).filter(Boolean).join(','),
    title: resolved.map((r) => r.title).filter(Boolean).join(' | '),
    quantity: resolved.reduce((sum, r) => sum + (r.quantity || 1), 0),
    marketplace,
    checkoutSessionId,
    purchaseOrderId: placed.data.purchaseOrderId || '',
    purchaseOrderHref: placed.data.purchaseOrderHref || '',
    purchaseOrderPaymentStatus: placed.data.purchaseOrderPaymentStatus || '',
    status: 'placed',
    pricingSummary: session.pricingSummary || null,
    raw: placed.data,
    placedBy: userId || null,
    buyerAccount: account._id,
  });

  return {
    placed: true,
    checkoutSessionId,
    purchaseOrder: placed.data,
    session,
    items: resolved,
    recordId: record._id,
    account: publicAccount(account),
  };
}

async function exchangeBuyOAuthCode(code) {
  const { clientId, clientSecret, sandbox } = buyCredentials();
  const redirectUri = buyRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error('Buy OAuth is not configured. Set EBAY_BUY_CLIENT_ID / SECRET and EBAY_BUY_RU_NAME.');
    err.status = 500;
    throw err;
  }
  const response = await axios.post(
    `${apiHost(sandbox)}/identity/v1/oauth2/token`,
    qs.stringify({
      grant_type: 'authorization_code',
      code: String(code || '').trim(),
      redirect_uri: redirectUri,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
    }
  );
  return response.data;
}

async function saveBuyTokens(tokenPayload, account) {
  const target = account || await getBuyerAccount();
  target.tokens = {
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token || target.tokens?.refresh_token,
    expires_in: tokenPayload.expires_in,
    refresh_token_expires_in: tokenPayload.refresh_token_expires_in,
    token_type: tokenPayload.token_type,
    scope: tokenPayload.scope,
    fetchedAt: new Date(),
  };
  target.connectedAt = new Date();
  target.disconnectedAt = null;

  try {
    const { sandbox } = buyCredentials();
    const identityHost = sandbox ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com';
    const identity = await axios.get(`${identityHost}/commerce/identity/v1/user/`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    target.ebayUsername = identity.data?.username || identity.data?.userId || target.ebayUsername;
    target.ebayUserId = identity.data?.userId || target.ebayUserId;
  } catch {
    // identity scope is optional
  }

  await target.save();
  return target;
}

export async function completeBuyOAuthFromCallback(req, res) {
  const { code, state, ebaytkn, username } = req.query;
  const front = `${clientOrigin()}/admin/ebay-buying/accounts`;
  try {
    if (!code && (ebaytkn !== undefined || username)) {
      throw new Error(
        'eBay sent an Auth’n’Auth redirect (ebaytkn/username), not an OAuth code. Do not use “Get a User Token Here” in the developer portal. In Buying Accounts click Connect, then grant buy.order. Auth accepted URL must be http://localhost:5000/api/ebay-buy/callback (http, not https) for local, or your Render https callback for live.'
      );
    }
    if (!code) throw new Error('Missing OAuth code');
    const raw = String(state || '');
    if (!raw.startsWith('buy:')) throw new Error('Invalid OAuth state');
    const rest = raw.slice(4);
    let accountId = '';
    let stateToken = rest;
    if (!rest.startsWith('eyJ')) {
      const idx = rest.indexOf(':');
      if (idx > 0) {
        accountId = rest.slice(0, idx);
        stateToken = rest.slice(idx + 1);
      }
    }
    jwt.verify(stateToken, process.env.JWT_SECRET);
    const tokens = await exchangeBuyOAuthCode(code);
    const account = accountId
      ? await getBuyerAccount(accountId)
      : await EbayBuyerAccount.create({
        key: crypto.randomUUID(),
        name: 'Buying account',
        deviceId: crypto.randomUUID(),
      });
    await saveBuyTokens(tokens, account);
    const connected = await EbayBuyerAccount.countDocuments({ active: true });
    if (!connected) await setActiveAccount(account);
    return res.redirect(`${front}?buyerConnected=true`);
  } catch (err) {
    const message = encodeURIComponent(err.response?.data?.error_description || err.message || 'Buy OAuth failed');
    return res.redirect(`${front}?buyerConnectError=${message}`);
  }
}

router.get('/connect', async (req, res) => {
  const { token, accountId } = req.query;
  if (!token) return res.status(400).send('Missing authentication token');
  try {
    jwt.verify(String(token), process.env.JWT_SECRET);
  } catch {
    return res.status(401).send('Invalid authentication token');
  }

  const { clientId, sandbox } = buyCredentials();
  const redirectUri = buyRedirectUri();
  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: 'Buy OAuth is not configured',
      missing: {
        EBAY_BUY_CLIENT_ID: !clientId,
        EBAY_BUY_RU_NAME: !redirectUri,
      },
    });
  }

  if (!accountId) return res.status(400).send('Missing accountId');
  try {
    await getBuyerAccount(accountId);
  } catch (err) {
    return res.status(err.status || 404).send(err.message || 'Buying account not found');
  }

  const scopes = buyUserScopes();
  const state = `buy:${accountId}:${token}`;
  const redirectUrl = `${authHost(sandbox)}/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
  res.redirect(redirectUrl);
});

router.get('/callback', completeBuyOAuthFromCallback);

router.get('/status', ...pageAuth, async (_req, res) => {
  try {
    const creds = buyCredentials();
    let browseOk = false;
    let browseError = '';
    if (creds.clientId && creds.clientSecret) {
      try {
        await getBuyApplicationToken();
        browseOk = true;
      } catch (err) {
        browseError = err.response?.data?.error_description || err.message;
      }
    }
    const accounts = await EbayBuyerAccount.find({}).sort({ active: -1, name: 1, createdAt: 1 });
    const publicAccounts = accounts.map(publicAccount);
    const active = publicAccounts.find((row) => row.active && row.connected)
      || publicAccounts.find((row) => row.connected)
      || null;
    res.json({
      ok: browseOk,
      configured: Boolean(creds.clientId && creds.clientSecret),
      sandbox: creds.sandbox,
      usingDedicatedBuyApp: creds.usingDedicatedBuyApp,
      clientIdHint: creds.clientId ? `${creds.clientId.slice(0, 8)}…` : '',
      oauth: {
        usingDedicatedBuyApp: creds.usingDedicatedBuyApp,
        usingSellerAppKeys: !creds.usingDedicatedBuyApp,
        userScopes: buyUserScopes().split(/\s+/).filter(Boolean),
        ruNameConfigured: Boolean(String(process.env.EBAY_BUY_RU_NAME || process.env.EBAY_RU_NAME || '').trim()),
        note: creds.usingDedicatedBuyApp
          ? 'Connect uses the dedicated Buy app (EBAY_BUY_CLIENT_ID). Enable User Token scope buy.order on that app, and set this RuName’s Auth accepted URL to /api/ebay-buy/callback (or /api/ebay/callback).'
          : 'Connect uses the same app keys as selling (EBAY_CLIENT_ID). Enable User Token scope buy.order on that same eBay application, then Connect a buying eBay login — not a seller store token.',
      },
      browseError,
      accounts: publicAccounts,
      account: active,
      buyerConnected: Boolean(active?.connected),
      ebayUsername: active?.ebayUsername || '',
      shipping: active?.shipping || {},
      shippingReady: Boolean(active?.shippingReady),
      marketplace: active?.marketplace || 'EBAY_US',
      message: browseOk ? undefined : (browseError || 'Set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in Back/.env.'),
    });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.get('/accounts', ...pageAuth, async (_req, res) => {
  try {
    const accounts = await EbayBuyerAccount.find({}).sort({ active: -1, name: 1, createdAt: 1 });
    res.json({ accounts: accounts.map(publicAccount) });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.post('/accounts', ...pageAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Account name is required' });
    const existing = await EbayBuyerAccount.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing) return res.status(409).json({ error: 'A buying account with that name already exists', account: publicAccount(existing) });
    const count = await EbayBuyerAccount.countDocuments();
    const account = await EbayBuyerAccount.create({
      key: crypto.randomUUID(),
      name,
      deviceId: crypto.randomUUID(),
      marketplace: normalizeMarketplace(req.body?.marketplace),
      active: count === 0,
    });
    res.status(201).json({ account: publicAccount(account) });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.patch('/accounts/:id', ...pageAuth, async (req, res) => {
  try {
    const account = await getBuyerAccount(req.params.id);
    if (req.body?.name != null) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Account name is required' });
      account.name = name;
    }
    if (req.body?.marketplace) account.marketplace = normalizeMarketplace(req.body.marketplace);
    if (req.body?.shipping) applyShippingFields(account, req.body.shipping);
    await account.save();
    res.json({ account: publicAccount(account) });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.post('/accounts/:id/activate', ...pageAuth, async (req, res) => {
  try {
    const account = await getBuyerAccount(req.params.id);
    await setActiveAccount(account);
    res.json({ account: publicAccount(account) });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.post('/accounts/:id/disconnect', ...pageAuth, async (req, res) => {
  try {
    const account = await getBuyerAccount(req.params.id);
    account.tokens = {};
    account.disconnectedAt = new Date();
    account.ebayUsername = account.ebayUsername || '';
    await account.save();
    res.json({ account: publicAccount(account) });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.delete('/accounts/:id', ...pageAuth, async (req, res) => {
  try {
    const account = await getBuyerAccount(req.params.id);
    const wasActive = account.active;
    await account.deleteOne();
    if (wasActive) {
      const next = await EbayBuyerAccount.findOne({
        $or: [
          { 'tokens.refresh_token': { $exists: true, $nin: [null, ''] } },
          { 'tokens.access_token': { $exists: true, $nin: [null, ''] } },
        ],
      }).sort({ connectedAt: -1 });
      if (next) await setActiveAccount(next);
    }
    res.json({ ok: true });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.get('/item', ...pageAuth, async (req, res) => {
  try {
    const itemId = extractItemId(req.query.itemId);
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });
    const marketplace = normalizeMarketplace(req.query.marketplace);
    const { sandbox } = buyCredentials();
    const token = await getBuyApplicationToken();
    const result = await fetchBrowseItem({ itemId, marketplace, sandbox, token });
    res.json({ ...result, marketplace });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.post('/items/resolve', ...pageAuth, async (req, res) => {
  try {
    const marketplace = normalizeMarketplace(req.body?.marketplace);
    const parsed = parseItemLines(req.body?.text || req.body?.items || '');
    if (!parsed.length) return res.status(400).json({ error: 'Paste at least one eBay item ID' });
    const { sandbox } = buyCredentials();
    const token = await getBuyApplicationToken();
    const items = [];
    for (const row of parsed) {
      try {
        const result = await fetchBrowseItem({
          itemId: row.itemId,
          marketplace,
          sandbox,
          token,
        });
        items.push(summarizeBrowseItem(result.item, row.itemId, row.quantity, result.lookup));
      } catch (err) {
        const { body } = ebayErrorPayload(err);
        items.push({
          inputId: row.itemId,
          itemId: '',
          quantity: row.quantity,
          buyable: false,
          warning: body.error || 'Lookup failed',
        });
      }
    }
    res.json({ marketplace, items });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.post('/checkout/preview', ...pageAuth, async (req, res) => {
  try {
    const marketplace = normalizeMarketplace(req.body?.marketplace);
    const items = Array.isArray(req.body?.items) ? req.body.items : parseItemLines(req.body?.text);
    const result = await runCheckout({
      items,
      marketplace,
      shipping: req.body?.shipping,
      place: false,
      userId: req.user?.userId,
      accountId: req.body?.accountId,
    });
    res.json(result);
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.post('/checkout/place', ...pageAuth, async (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: 'Set confirm: true to place a live order on the connected buying account.' });
    }
    const marketplace = normalizeMarketplace(req.body?.marketplace);
    const items = Array.isArray(req.body?.items) ? req.body.items : parseItemLines(req.body?.text);
    const accountId = req.body?.accountId;
    const oneOrderPerItem = req.body?.oneOrderPerItem !== false;
    if (!oneOrderPerItem) {
      const result = await runCheckout({
        items,
        marketplace,
        shipping: req.body?.shipping,
        place: true,
        userId: req.user?.userId,
        accountId,
      });
      return res.json({ orders: [result] });
    }

    const orders = [];
    for (const row of items) {
      try {
        const result = await runCheckout({
          items: [row],
          marketplace,
          shipping: req.body?.shipping,
          place: true,
          userId: req.user?.userId,
          accountId,
        });
        orders.push(result);
      } catch (err) {
        const { body } = ebayErrorPayload(err);
        orders.push({
          placed: false,
          error: body.error,
          ebay: body.ebay,
          items: [{ inputId: row.itemId, quantity: row.quantity }],
        });
      }
    }
    res.json({ orders });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

router.get('/purchases', ...pageAuth, async (_req, res) => {
  try {
    const rows = await EbayBuyPurchase.find({}).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ purchases: rows });
  } catch (err) {
    const { status, body } = ebayErrorPayload(err);
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
  }
});

export default router;
