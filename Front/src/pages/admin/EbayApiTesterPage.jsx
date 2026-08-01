import { useEffect, useMemo, useRef, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import { sortSellersByName } from '../../lib/sellersSort';

const ALL_SELLERS_VALUE = '__all__';
const BULK_CALL_DELAY_MS = 1200;

function buildGetSellerListXml({ entriesPerPage = 5, pageNumber = 1 } = {}) {
  const end = new Date();
  const start = new Date(Date.now() - 119 * 24 * 60 * 60 * 1000); // eBay max window ~120 days
  return `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken></eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <GranularityLevel>Fine</GranularityLevel>
  <StartTimeFrom>${start.toISOString()}</StartTimeFrom>
  <StartTimeTo>${end.toISOString()}</StartTimeTo>
  <IncludeWatchCount>true</IncludeWatchCount>
  <Pagination>
    <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
</GetSellerListRequest>`;
}

function buildGetMyeBaySellingXml({ entriesPerPage = 25, pageNumber = 1 } = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken></eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnSummary</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <IncludeNotes>false</IncludeNotes>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
    <Sort>StartTime</Sort>
  </ActiveList>
  <SellingSummary>
    <Include>true</Include>
  </SellingSummary>
  <ScheduledList>
    <Include>false</Include>
  </ScheduledList>
  <SoldList>
    <Include>false</Include>
  </SoldList>
  <UnsoldList>
    <Include>false</Include>
  </UnsoldList>
  <HideVariations>false</HideVariations>
</GetMyeBaySellingRequest>`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text, fallback = {}) {
  try {
    return text?.trim() ? JSON.parse(text) : fallback;
  } catch {
    return null;
  }
}

function isInternalAppPath(pathValue) {
  return /^\/ebay\//i.test(String(pathValue || '').trim());
}

function isExternalEbayPath(pathValue) {
  const pathOnly = String(pathValue || '').trim().split('?')[0];
  return (
    /^\/(sell|commerce|buy|post-order|developer|identity)\//i.test(pathOnly) ||
    /^https?:\/\/(?:[^/]+\.)?ebay\.com\//i.test(pathOnly)
  );
}

function normalizeEbayPath(pathValue) {
  const trimmed = String(pathValue || '').trim();
  return trimmed.replace(/\/commerce\/notification\/v1\/subs\/?$/i, '/commerce/notification/v1/subscription');
}

function suggestParamsForPath(pathValue, marketplace = 'EBAY_US') {
  const pathOnly = normalizeEbayPath(String(pathValue || '').trim().split('?')[0]);
  if (/^\/commerce\/message\/v1\/conversation\/?$/i.test(pathOnly)) {
    return { conversation_type: 'FROM_MEMBERS', limit: 50 };
  }
  if (/^\/commerce\/notification\/v1\/subscription\/?$/i.test(pathOnly)) {
    return { limit: 20 };
  }
  if (/^\/commerce\/notification\/v1\/topic\/?$/i.test(pathOnly)) {
    return { limit: 20 };
  }
  if (/^\/sell\/analytics\/v1\/customer_service_metric\//i.test(pathOnly)) {
    return { evaluation_marketplace_id: marketplace || 'EBAY_US' };
  }
  if (/^\/post-order\/v2\/cancellation\/search\/?$/i.test(pathOnly)) {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      creation_date_range_from: from,
      creation_date_range_to: to,
      limit: '50',
      role: 'SELLER',
    };
  }
  if (/^\/post-order\/v2\/return\/search\/?$/i.test(pathOnly)) {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      creation_date_range_from: from,
      creation_date_range_to: to,
      limit: '50',
    };
  }
  if (/^\/post-order\/v2\/return\/[^/]+\/?$/i.test(pathOnly)) {
    return {};
  }
  if (/^\/post-order\/v2\/return\/[^/]+\/tracking\/?$/i.test(pathOnly)) {
    return {
      carrier_used: 'UPS',
      tracking_number: '',
    };
  }
  if (/^\/post-order\/v2\/return\/[^/]+\/files\/?$/i.test(pathOnly)) {
    return {};
  }
  return null;
}

function parseEbayEndpointInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return { path: '', params: null };

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      if (!/\.ebay\.com$/i.test(u.hostname)) {
        return { path: raw, params: null };
      }
      const path = normalizeEbayPath(u.pathname);
      const params = Object.fromEntries(u.searchParams.entries());
      return { path, params: Object.keys(params).length ? params : null };
    }
    if (raw.includes('?')) {
      const [pathname, search] = raw.split('?', 2);
      const path = normalizeEbayPath(pathname.startsWith('/') ? pathname : `/${pathname}`);
      const sp = new URLSearchParams(search);
      const params = Object.fromEntries(sp.entries());
      return { path, params: Object.keys(params).length ? params : null };
    }
    const path = normalizeEbayPath(raw.startsWith('/') ? raw : `/${raw}`);
    return { path, params: null };
  } catch {
    return { path: raw, params: null };
  }
}

function replaceRuntimePlaceholders(value, map) {
  if (typeof value === 'string') {
    return value.replace(/<([^>]+)>/g, (_, key) => {
      const v = map?.[key];
      return v == null || v === '' ? `<${key}>` : String(v);
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => replaceRuntimePlaceholders(v, map));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceRuntimePlaceholders(v, map)])
    );
  }
  return value;
}

export default function EbayApiTesterPage() {
  const [apiMode, setApiMode] = useState('rest'); // rest | trading
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [paramsText, setParamsText] = useState('{}');
  const [bodyText, setBodyText] = useState('{}');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [marketplaceId, setMarketplaceId] = useState('EBAY_US');
  const [tradingCallName, setTradingCallName] = useState('GetSellerList');
  const [tradingSiteId, setTradingSiteId] = useState('0');
  const [tradingXml, setTradingXml] = useState(() => buildGetSellerListXml());

  const [loading, setLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [error, setError] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [status, setStatus] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [responseHint, setResponseHint] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const copyStatusTimerRef = useRef(null);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => {
        const list = sortSellersByName(data || []);
        setSellers(list);
        if (list.length > 0) {
          setSellerId((prev) => prev || list[0]._id);
        }
      })
      .catch(() => setSellers([]));
  }, []);

  const prettyResponse = useMemo(() => responseText || 'Run a request to see response.', [responseText]);
  const pathText = String(path || '').trim();

  const handlePathChange = (value) => {
    const { path: parsedPath, params: parsedParams } = parseEbayEndpointInput(value);
    setPath(parsedPath);
    if (parsedParams) {
      setParamsText(JSON.stringify(parsedParams, null, 2));
      return;
    }
    if (isExternalEbayPath(parsedPath) || /^https?:\/\/.*\.ebay\.com/i.test(value)) {
      const suggested = suggestParamsForPath(parsedPath, marketplaceId);
      if (suggested) {
        setParamsText(JSON.stringify(suggested, null, 2));
      }
    }
  };

  const runTradingRequest = async () => {
    if (!sellerId || sellerId === ALL_SELLERS_VALUE) {
      setError('Select one seller for Trading API calls');
      return;
    }
    if (!String(tradingCallName || '').trim()) {
      setError('Trading call name is required (e.g. GetSellerList)');
      return;
    }
    if (!String(tradingXml || '').trim()) {
      setError('Trading request XML is required');
      return;
    }

    setLoading(true);
    setError('');
    setNeedsReconnect(false);
    setStatus(null);
    setResponseHint(
      tradingCallName === 'GetMyeBaySelling'
        ? 'Trading API GetMyeBaySelling returns ActiveList / SellingSummary (live My eBay selling data).'
        : 'Trading API GetSellerList returns live eBay listings (not Inventory API).'
    );
    setCopyStatus('');
    setBulkProgress('');

    try {
      const { data } = await api.post('/ebay/dev/trading-call', {
        sellerId,
        callName: String(tradingCallName).trim(),
        requestXml: tradingXml,
        siteId: tradingSiteId || '0',
      });
      setStatus(data?.statusCode ?? 200);
      setResponseText(JSON.stringify(data, null, 2));
      if (!data?.ok) {
        setError(data?.statusText || 'Trading call returned a non-success status');
      }
    } catch (e) {
      const sellerNeedsReconnect = e?.response?.data?.needsReconnect === true;
      setNeedsReconnect(sellerNeedsReconnect);
      setStatus(e?.response?.status || 500);
      setResponseText(JSON.stringify(e?.response?.data || { error: e.message }, null, 2));
      setError(e?.response?.data?.error || e.message || 'Trading call failed');
    } finally {
      setLoading(false);
      setBulkProgress('');
    }
  };

  const runRequest = async () => {
    if (apiMode === 'trading') {
      await runTradingRequest();
      return;
    }

    const parsedParamsRaw = safeJsonParse(paramsText, {});
    const parsedBodyRaw = safeJsonParse(bodyText, {});

    if (parsedParamsRaw === null) {
      setError('Invalid Params JSON');
      return;
    }
    if (['POST', 'PATCH', 'PUT'].includes(method) && parsedBodyRaw === null) {
      setError('Invalid Body JSON');
      return;
    }

    const placeholderMap = { sellerId, orderId };
    let parsedParams = replaceRuntimePlaceholders(parsedParamsRaw, placeholderMap);
    const parsedBody = replaceRuntimePlaceholders(parsedBodyRaw, placeholderMap);

    setLoading(true);
    setError('');
    setNeedsReconnect(false);
    setStatus(null);
    setResponseHint('');
    setCopyStatus('');
    setBulkProgress('');

    try {
      let statusCode;
      let payload;

      const resolvedPath = normalizeEbayPath(String(replaceRuntimePlaceholders(path, placeholderMap) || '').trim());
      if (!resolvedPath) {
        setError('Paste an eBay API path or full URL');
        setLoading(false);
        return;
      }
      if (/<[^>]+>/.test(resolvedPath)) {
        setError(`Unresolved placeholder in path: ${resolvedPath}`);
        setLoading(false);
        return;
      }
      if (isInternalAppPath(resolvedPath)) {
        setError('This REST tab only supports raw eBay REST paths (e.g. /sell/..., /commerce/...). Use the Trading API tab for GetSellerList listings.');
        setLoading(false);
        return;
      }

      const runForAllSellers = sellerId === ALL_SELLERS_VALUE;

      if (Object.keys(parsedParams || {}).length === 0) {
        const suggested = suggestParamsForPath(resolvedPath, marketplaceId);
        if (suggested) parsedParams = suggested;
      }
      if (
        /^\/sell\/analytics\/v1\/customer_service_metric\//i.test(resolvedPath) &&
        !parsedParams?.evaluation_marketplace_id
      ) {
        parsedParams = {
          ...parsedParams,
          evaluation_marketplace_id: marketplaceId || 'EBAY_US',
        };
      }

      if (!sellerId) {
        setError('Select a seller for raw eBay API calls');
        setLoading(false);
        return;
      }

      if (runForAllSellers && method !== 'GET') {
        setError('All sellers mode only supports GET requests');
        setLoading(false);
        return;
      }

      if (runForAllSellers) {
        if (!sellers.length) {
          setError('No sellers available');
          setLoading(false);
          return;
        }

        const results = [];
        for (let i = 0; i < sellers.length; i++) {
          const s = sellers[i];
          const sellerName = s.user?.username || s.user?.email || s._id;
          setBulkProgress(`Seller ${i + 1} of ${sellers.length}: ${sellerName}`);
          try {
            const proxyRes = await api.post('/ebay/dev/raw-call', {
              sellerId: s._id,
              method,
              endpoint: resolvedPath || pathText,
              params: parsedParams,
              body: parsedBody || {},
              marketplace: marketplaceId || undefined,
            });
            results.push({
              sellerId: s._id,
              sellerName,
              ...(proxyRes.data || {}),
            });
          } catch (e) {
            const sellerNeedsReconnect = e?.response?.data?.needsReconnect === true;
            if (sellerNeedsReconnect) setNeedsReconnect(true);
            results.push({
              sellerId: s._id,
              sellerName,
              ok: false,
              needsReconnect: sellerNeedsReconnect,
              statusCode: e?.response?.status || 500,
              error: e?.response?.data?.error || e.message || 'Request failed',
              data: e?.response?.data || null,
            });
          }
          if (i < sellers.length - 1) {
            await sleep(BULK_CALL_DELAY_MS);
          }
        }

        const succeeded = results.filter((r) => r.ok && r.statusCode >= 200 && r.statusCode < 300).length;
        const failed = results.length - succeeded;
        statusCode = 200;
        payload = {
          allSellers: true,
          endpoint: resolvedPath,
          summary: { total: sellers.length, succeeded, failed },
          results,
        };
        setResponseHint(
          failed
            ? `Fetched ${succeeded} of ${sellers.length} sellers (${failed} failed).`
            : `Fetched all ${sellers.length} sellers.`
        );
      } else {
        const proxyRes = await api.post('/ebay/dev/raw-call', {
          sellerId,
          method,
          endpoint: resolvedPath || pathText,
          params: parsedParams,
          body: parsedBody || {},
          marketplace: marketplaceId || undefined,
        });
        statusCode = proxyRes.data?.statusCode ?? proxyRes.status;
        payload = proxyRes.data;
      }

      setStatus(statusCode);
      setResponseText(JSON.stringify(payload, null, 2));
      const ebayErrMsg = payload?.ebayErrors?.[0]?.longMessage || payload?.ebayErrors?.[0]?.message;
      let hintText = payload?.hint || '';
      if (Array.isArray(payload?.trafficReportFixes) && payload.trafficReportFixes.length) {
        hintText = `${payload.trafficReportFixes.join(' ')} ${hintText}`.trim();
      }
      if (ebayErrMsg) {
        hintText = hintText ? `${hintText} eBay says: ${ebayErrMsg}` : `eBay says: ${ebayErrMsg}`;
      }
      if (hintText) setResponseHint(hintText);
      if (!payload?.ok && payload?.appTokenAttempt?.ok) {
        setResponseHint(
          `${hintText ? `${hintText} ` : ''}`
          + 'Seller token failed, but the app token succeeded — see appTokenAttempt in the response.'
        );
      }
    } catch (e) {
      setStatus(e?.response?.status || 500);
      setResponseText(JSON.stringify(e?.response?.data || { error: e.message }, null, 2));
      setNeedsReconnect(e?.response?.data?.needsReconnect === true);
      setError(e?.response?.data?.error || e.message || 'Request failed');
    } finally {
      setLoading(false);
      setBulkProgress('');
    }
  };

  const copyResponseToClipboard = async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      setCopyStatus('Copied to clipboard');
    } catch {
      setCopyStatus('Copy failed — check browser permissions');
    }
    if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
    copyStatusTimerRef.current = setTimeout(() => setCopyStatus(''), 2500);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>eBay API Tester</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        REST tab calls Sell/Commerce APIs. Trading tab supports GetSellerList and GetMyeBaySelling
        (ActiveList / SellingSummary).
        (what Store Listings uses). Inventory API often returns 0 for Trading-listed stores.
      </Typography>

      <Tabs
        value={apiMode}
        onChange={(_e, v) => setApiMode(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="rest" label="REST API" />
        <Tab value="trading" label="Trading API (listings)" />
      </Tabs>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              select
              required
              label="Seller"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              size="small"
              sx={{ minWidth: 260 }}
              helperText={
                apiMode === 'trading'
                  ? (sellerId ? `ID: ${sellerId}` : 'Required')
                  : sellerId === ALL_SELLERS_VALUE
                    ? `GET only — runs for all ${sellers.length} sellers sequentially`
                    : sellerId
                      ? `ID: ${sellerId}`
                      : 'Required for raw eBay calls'
              }
            >
              <MenuItem value=""><em>Select seller...</em></MenuItem>
              {apiMode === 'rest' ? (
                <MenuItem value={ALL_SELLERS_VALUE}>
                  <em>All sellers ({sellers.length})</em>
                </MenuItem>
              ) : null}
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.user?.username || s.user?.email || s._id}
                </MenuItem>
              ))}
            </TextField>

            {apiMode === 'rest' ? (
              <>
                <TextField
                  label="Marketplace ID"
                  value={marketplaceId}
                  onChange={(e) => setMarketplaceId(e.target.value)}
                  size="small"
                  placeholder="EBAY_US"
                  helperText="Required for Sell Account, Marketing, Inventory APIs"
                  sx={{ minWidth: 200 }}
                />
                <TextField
                  label="Order ID (optional)"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  size="small"
                  sx={{ minWidth: 220 }}
                  helperText="Fills <orderId> placeholders"
                />
                <TextField
                  select
                  label="Method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  size="small"
                  sx={{ width: 160 }}
                >
                  {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </TextField>
              </>
            ) : (
              <>
                <TextField
                  label="Call name"
                  value={tradingCallName}
                  onChange={(e) => setTradingCallName(e.target.value)}
                  size="small"
                  sx={{ minWidth: 200 }}
                  helperText="GetSellerList or GetMyeBaySelling"
                />
                <TextField
                  label="Site ID"
                  value={tradingSiteId}
                  onChange={(e) => setTradingSiteId(e.target.value)}
                  size="small"
                  sx={{ width: 120 }}
                  helperText="0 = EBAY_US"
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    setTradingCallName('GetSellerList');
                    setTradingXml(buildGetSellerListXml({ entriesPerPage: 5, pageNumber: 1 }));
                  }}
                >
                  Load GetSellerList sample
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setTradingCallName('GetMyeBaySelling');
                    setTradingXml(buildGetMyeBaySellingXml({ entriesPerPage: 25, pageNumber: 1 }));
                  }}
                >
                  Load GetMyeBaySelling sample
                </Button>
              </>
            )}
          </Stack>

          {apiMode === 'rest' ? (
            <>
              <TextField
                label="eBay API Path or URL"
                value={path}
                onChange={(e) => handlePathChange(e.target.value)}
                size="small"
                fullWidth
                placeholder="/commerce/message/v1/conversation"
                helperText="Paste path only, path with ?query=, or full https://api.ebay.com/... URL"
              />
              <TextField
                label="Params (JSON)"
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                multiline
                minRows={5}
                fullWidth
                sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
              />
              {['POST', 'PATCH', 'PUT'].includes(method) && (
                <TextField
                  label="Body (JSON)"
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  multiline
                  minRows={5}
                  fullWidth
                  sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
                />
              )}
            </>
          ) : (
            <TextField
              label="Trading request XML"
              value={tradingXml}
              onChange={(e) => setTradingXml(e.target.value)}
              multiline
              minRows={14}
              fullWidth
              helperText="Token is injected automatically. GetSellerList needs StartTimeFrom/To within ~120 days; GetMyeBaySelling uses ActiveList pagination."
              sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
            />
          )}

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Button variant="contained" onClick={runRequest} disabled={loading}>
              {loading
                ? (bulkProgress || 'Running...')
                : apiMode === 'trading'
                  ? 'Run Trading call'
                  : sellerId === ALL_SELLERS_VALUE
                    ? 'Run for all sellers'
                    : 'Run'}
            </Button>
            {bulkProgress && loading && (
              <Typography variant="body2" color="text.secondary">
                {bulkProgress}
              </Typography>
            )}
            {status != null && (
              <Typography variant="body2" color={status >= 200 && status < 300 ? 'success.main' : 'error.main'}>
                Status: {status}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity={needsReconnect ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {needsReconnect && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                eBay reconnect required
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, mb: 1 }}>
                Open Seller Profile → Connect eBay for this seller. If reconnect fails, revoke this app under
                eBay → Account → Third-party app access, then connect again.
              </Typography>
            </>
          )}
          {error}
        </Alert>
      )}
      {responseHint && <Alert severity="info" sx={{ mb: 2 }}>{responseHint}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h6">Response</Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            {copyStatus ? (
              <Typography variant="caption" color="text.secondary">
                {copyStatus}
              </Typography>
            ) : null}
            <Tooltip title={responseText ? 'Copy raw JSON response' : 'Run a request first'}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  onClick={copyResponseToClipboard}
                  disabled={!responseText}
                >
                  Copy
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1,
            bgcolor: '#0b1020',
            color: '#d6e2ff',
            overflow: 'auto',
            maxHeight: '60vh',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {prettyResponse}
        </Box>
      </Paper>
    </Box>
  );
}
