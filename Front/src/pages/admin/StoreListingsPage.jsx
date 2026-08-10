import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Link,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Link as RouterLink } from 'react-router-dom';
import { lazyWithRetry as lazy } from '../../lib/lazyImport.js';
import api from '../../lib/api';

const StoreListingsInventoryPage = lazy(() => import('./StoreListingsInventoryPage.jsx'));

const TAB_TO_VIEW = ['sync', 'listings', 'ended'];

/** Trading calls this Store Listings page drives (sync + live status refresh). */
const PAGE_API_CALLS = [
  {
    name: 'GetSellerList',
    label: 'GetSellerList',
    hint: 'Sync All Stores / Sync listings',
  },
  {
    name: 'GetMyeBaySelling',
    label: 'GetMyeBaySelling',
    hint: 'Refresh status (live eBay counts)',
  },
];

function usageColor(percent) {
  if (percent >= 90) return 'error';
  if (percent >= 70) return 'warning';
  return 'success';
}

function formatReset(resetStr) {
  if (!resetStr) return '—';
  const diffMs = new Date(resetStr) - Date.now();
  if (diffMs <= 0) return 'soon';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function pickResource(rateLimits, callName) {
  for (const ctx of rateLimits || []) {
    const hit = (ctx.resources || []).find(
      (r) => String(r?.name || '').toLowerCase() === callName.toLowerCase()
    );
    if (hit) {
      return {
        ...hit,
        apiContext: ctx.apiContext,
        poolUsed: ctx.used,
        poolLimit: ctx.limit,
        poolRemaining: ctx.remaining,
        usagePercent: ctx.usagePercent,
        reset: ctx.reset,
      };
    }
  }
  return null;
}

function StoreListingsApiUsageBar() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rateLimits, setRateLimits] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [cached, setCached] = useState(false);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ebay/api-usage-stats/all', {
        params: forceRefresh ? { refresh: 'true' } : {},
        timeout: 60000,
      });
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to load eBay API usage');
      }
      setRateLimits(Array.isArray(data.rateLimits) ? data.rateLimits : []);
      setFetchedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date());
      setCached(Boolean(data.cached) && !forceRefresh);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load eBay API usage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(false), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const callStats = useMemo(
    () => PAGE_API_CALLS.map((call) => ({
      ...call,
      resource: pickResource(rateLimits, call.name),
    })),
    [rateLimits]
  );

  const tradingPool = useMemo(() => {
    const trading = (rateLimits || []).find(
      (c) => String(c.apiContext || '').toLowerCase() === 'tradingapi'
      || String(c.apiName || '').toLowerCase() === 'tradingapi'
    );
    return trading || callStats.find((c) => c.resource)?.resource || null;
  }, [rateLimits, callStats]);

  const pageCallsToday = callStats.reduce(
    (sum, c) => sum + Number(c.resource?.count || 0),
    0
  );

  const poolPercent = Number(tradingPool?.usagePercent) || 0;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2,
        px: 1.5,
        py: 1.25,
        borderRadius: 1.5,
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              eBay API used today
            </Typography>
            <Chip
              size="small"
              label="This page"
              color="primary"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
            {cached ? (
              <Chip size="small" label="Cached" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
            ) : null}
            {fetchedAt ? (
              <Typography variant="caption" color="text.secondary">
                {fetchedAt.toLocaleTimeString()}
              </Typography>
            ) : null}
            <Typography variant="caption" color="text.secondary">
              App-wide daily counts for methods this page calls
            </Typography>
          </Stack>

          {error ? (
            <Alert
              severity="warning"
              sx={{ py: 0.25 }}
              action={(
                <Button color="inherit" size="small" onClick={() => load(true)}>
                  Retry
                </Button>
              )}
            >
              {error}
            </Alert>
          ) : loading && !rateLimits.length ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">Loading daily API usage…</Typography>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Chip
                size="small"
                color="default"
                variant="outlined"
                label={`Page methods: ${pageCallsToday.toLocaleString('en-US')} calls`}
                sx={{ fontWeight: 600 }}
              />
              {callStats.map((call) => (
                <Tooltip key={call.name} title={call.hint} arrow>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${call.label}: ${Number(call.resource?.count || 0).toLocaleString('en-US')}`}
                  />
                </Tooltip>
              ))}
              {tradingPool?.poolLimit != null || tradingPool?.limit != null ? (
                <Tooltip
                  title={`TradingAPI shared pool · resets ${formatReset(tradingPool.reset)}`}
                  arrow
                >
                  <Chip
                    size="small"
                    color={usageColor(poolPercent)}
                    variant="outlined"
                    label={`Trading pool: ${(tradingPool.poolUsed ?? tradingPool.used ?? 0).toLocaleString('en-US')} / ${(tradingPool.poolLimit ?? tradingPool.limit ?? 0).toLocaleString('en-US')} (${poolPercent}%)`}
                  />
                </Tooltip>
              ) : null}
            </Stack>
          )}

          {!error && (tradingPool?.poolLimit != null || tradingPool?.limit != null) ? (
            <LinearProgress
              variant="determinate"
              value={Math.min(poolPercent, 100)}
              color={usageColor(poolPercent)}
              sx={{ mt: 1, height: 4, borderRadius: 2, maxWidth: 480 }}
            />
          ) : null}
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
          <Button
            size="small"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            onClick={() => load(true)}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            Refresh
          </Button>
          <Link
            component={RouterLink}
            to="/ebay-api-usage"
            underline="hover"
            variant="body2"
            sx={{ whiteSpace: 'nowrap' }}
          >
            Full usage
          </Link>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function StoreListingsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ pb: 3 }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
        <StoreListingsApiUsageBar />

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            mb: 2,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 44 },
          }}
        >
          <Tab label="Sync status" />
          <Tab label="Active Listings" />
          <Tab label="Ended Listings" />
        </Tabs>
      </Box>

      <Suspense
        fallback={(
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      >
        <StoreListingsInventoryPage
          key={TAB_TO_VIEW[tab] || 'sync'}
          embedded
          active
          viewMode={TAB_TO_VIEW[tab] || 'sync'}
        />
      </Suspense>
    </Box>
  );
}
