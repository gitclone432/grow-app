import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  Link,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

const EBAY_CSM_DOCS =
  'https://developer.ebay.com/api-docs/sell/analytics/resources/customer_service_metric/methods/getCustomerServiceMetric';

const MARKETPLACES = [
  'EBAY_US',
  'EBAY_GB',
  'EBAY_AU',
  'EBAY_DE',
  'EBAY_FR',
  'EBAY_IT',
  'EBAY_ES',
  'EBAY_CA',
  'EBAY_MOTORS_US',
];

const INAD_REASON_LABELS = {
  MISSING_PARTS: 'Missing parts or pieces',
  ORDERED_DIFFERENT_ITEM: 'Wrong item',
  ARRIVED_DAMAGED: 'Arrived damaged',
  DEFECTIVE_ITEM: 'Not working or defective',
  FAKE_OR_COUNTERFEIT: 'Not authentic',
  DOES_NOT_MATCH_DESCRIPTION: "Doesn't match description or photos",
  DOES_NOT_MATCH_DESCRIPTION_OR_PHOTOS: "Doesn't match description or photos",
};

const RATING_COLORS = {
  LOW: 'success',
  AVERAGE: 'warning',
  HIGH: 'error',
  VERY_HIGH: 'error',
  NOT_APPLICABLE: 'default',
};

function formatPercent(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

function formatCount(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

function formatSavedAt(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEvalPeriod(cycle) {
  if (!cycle?.startDate || !cycle?.endDate) return null;
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatCaseDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function MetricCasesPanel({ cases, loading, error, title, emptyHint, expectedCount }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        {expectedCount != null ? (
          <Chip size="small" label={`${cases.length}${expectedCount != null ? ` / ${expectedCount}` : ''}`} variant="outlined" />
        ) : null}
      </Stack>
      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Loading orders…</Typography>
        </Stack>
      ) : null}
      {error ? <Alert severity="warning" sx={{ mb: 1 }}>{error}</Alert> : null}
      {!loading && !error && cases.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{emptyHint}</Typography>
      ) : null}
      {!loading && cases.length > 0 ? (
        <Stack spacing={1} sx={{ maxHeight: 320, overflow: 'auto' }}>
          {cases.map((c) => (
            <Box
              key={c.caseId}
              sx={{
                p: 1.25,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem' }}>
                  {c.orderId || c.caseId}
                </Typography>
                <Chip size="small" label={(c.status || 'OPEN').replace(/_/g, ' ')} variant="outlined" />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {c.buyerUsername ? `@${c.buyerUsername}` : 'Buyer —'}
                {' · '}
                {formatCaseDate(c.creationDate)}
              </Typography>
              {c.itemTitle ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.78rem' }} noWrap title={c.itemTitle}>
                  {c.itemTitle}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Stack>
      ) : null}
    </Paper>
  );
}

function parseCsDimensionBlocks(report, metricType) {
  const isInad = metricType === 'ITEM_NOT_AS_DESCRIBED';
  return (report?.dimensionMetrics || []).map((block) => {
    const dim = block.dimension || {};
    const byKey = Object.fromEntries((block.metrics || []).map((m) => [m.metricKey, m]));
    const rateMetric = byKey.RATE;
    const countMetric = byKey.COUNT;
    const txnMetric = byKey.TRANSACTION_COUNT;
    const benchmark = rateMetric?.benchmark || {};
    const distributionBlock = isInad
      ? (countMetric?.distributions || []).find((d) => d?.basis === 'ITEM_NOT_AS_DESCRIBED_REASON')
      : countMetric?.distributions?.[0];
    const reasons = (distributionBlock?.data || []).map((entry) => ({
      key: entry.name,
      label: INAD_REASON_LABELS[entry.name] || entry.name?.replace(/_/g, ' ') || entry.name,
      value: Number(entry.value) || 0,
    }));

    return {
      dimensionKey: dim.dimensionKey,
      categoryId: dim.value,
      categoryName: dim.name || dim.value,
      rate: rateMetric?.value != null ? Number(rateMetric.value) : null,
      rating: benchmark.rating || null,
      adjustment: benchmark.adjustment || null,
      peerAverage: benchmark.metadata?.average != null ? Number(benchmark.metadata.average) : null,
      count: countMetric?.value != null ? Number(countMetric.value) : null,
      transactionCount: txnMetric?.value != null ? Number(txnMetric.value) : null,
      reasons,
    };
  });
}

function ratingLabel(block) {
  if (!block?.rating) return null;
  const text = block.rating.replace(/_/g, ' ');
  if (block.adjustment === 'OVERRIDE') return `Adjusted: ${text}`;
  return text;
}

function adjustmentHint(block, metricType) {
  if (block?.adjustment !== 'OVERRIDE') return null;
  if (block.count != null && block.count < 10) {
    return 'Requests from less than 10 buyers — eBay adjusted the standing rating.';
  }
  return 'eBay applied a rating adjustment for circumstances beyond seller control.';
}

function PeerComparisonBar({ yourRate, peerRate, rating }) {
  if (yourRate == null && peerRate == null) {
    return (
      <Typography variant="body2" color="text.secondary">No peer benchmark for this category.</Typography>
    );
  }
  const high = Math.max(yourRate ?? 0, peerRate ?? 0, 0.25) * 1.35 || 1;
  const toPct = (v) => Math.min(100, Math.max(0, ((v ?? 0) / high) * 100));
  const vsPeer = yourRate != null && peerRate != null ? yourRate - peerRate : null;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
          Compared to peers
        </Typography>
        {rating ? (
          <Chip
            size="small"
            color={RATING_COLORS[rating] || 'default'}
            label={rating.replace(/_/g, ' ')}
          />
        ) : null}
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="success.main" fontWeight={600}>Low</Typography>
        <Typography variant="caption" color="warning.main">Average</Typography>
        <Typography variant="caption" color="error.main" fontWeight={600}>Very high</Typography>
      </Stack>
      <Box
        sx={{
          position: 'relative',
          height: 10,
          borderRadius: 1,
          mb: 1.5,
          background: 'linear-gradient(90deg, #4caf50 0%, #ffeb3b 50%, #f44336 100%)',
        }}
      >
        {peerRate != null && (
          <Box
            sx={{
              position: 'absolute',
              left: `${toPct(peerRate)}%`,
              top: -3,
              bottom: -3,
              width: 2,
              bgcolor: 'grey.900',
              transform: 'translateX(-1px)',
              zIndex: 1,
            }}
            title={`Peers ${formatPercent(peerRate)}`}
          />
        )}
        {yourRate != null && (
          <Box
            sx={{
              position: 'absolute',
              left: `${toPct(yourRate)}%`,
              top: '50%',
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              border: '2px solid #fff',
              transform: 'translate(-50%, -50%)',
              boxShadow: 2,
              zIndex: 2,
            }}
            title={`You ${formatPercent(yourRate)}`}
          />
        )}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
        <Typography variant="body2">
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>You</Box>
          {' '}{formatPercent(yourRate)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Peers</strong> {formatPercent(peerRate)}
        </Typography>
        {vsPeer != null && (
          <Typography
            variant="body2"
            sx={{ color: vsPeer <= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
          >
            {vsPeer <= 0 ? 'Below' : 'Above'} peers by {formatPercent(Math.abs(vsPeer))}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function MetricOverviewCard({
  dimensionLabel,
  metricTitle,
  caseLabel,
  sortedBlocks,
  selectedBlock,
  onSelectDimension,
  selectedAdjustmentHint,
}) {
  if (!selectedBlock) return null;

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <FormControl size="small" sx={{ minWidth: { sm: 220 }, flex: 1, maxWidth: 360 }}>
          <InputLabel>{dimensionLabel}</InputLabel>
          <Select
            label={dimensionLabel}
            value={selectedBlock.categoryId}
            onChange={(e) => onSelectDimension(e.target.value)}
          >
            {sortedBlocks.map((block) => (
              <MenuItem key={block.categoryId} value={block.categoryId}>
                {block.categoryName} ({formatCount(block.transactionCount)})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary" sx={{ pt: { sm: 0.5 } }}>
          {metricTitle}
        </Typography>
      </Stack>

      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs={12} md={5}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
              {selectedBlock.categoryName}
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1 }}>
              <Typography variant="h3" fontWeight={800} sx={{ lineHeight: 1 }}>
                {formatPercent(selectedBlock.rate)}
              </Typography>
              {selectedBlock.rating && selectedBlock.rating !== 'NOT_APPLICABLE' ? (
                <Chip
                  size="small"
                  color={RATING_COLORS[selectedBlock.rating] || 'default'}
                  label={ratingLabel(selectedBlock)}
                />
              ) : null}
            </Stack>
            <Stack spacing={0.25} sx={{ typography: 'body2', color: 'text.secondary' }}>
              <Typography>
                <strong>{formatCount(selectedBlock.transactionCount)}</strong> transactions
                {' · '}
                <strong>{formatCount(selectedBlock.count)}</strong> {caseLabel.toLowerCase()}
              </Typography>
              {selectedBlock.count != null && selectedBlock.transactionCount > 0 ? (
                <Typography variant="caption">
                  {formatCount(selectedBlock.count)} ÷ {formatCount(selectedBlock.transactionCount)} = {formatPercent(selectedBlock.rate)}
                </Typography>
              ) : null}
            </Stack>
            {selectedAdjustmentHint ? (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                {selectedAdjustmentHint}
              </Typography>
            ) : null}
          </Box>
        </Grid>
        <Grid item xs={12} md={7}>
          <Box
            sx={{
              height: '100%',
              pl: { md: 2 },
              borderLeft: { md: 1 },
              borderColor: { md: 'divider' },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <PeerComparisonBar
              yourRate={selectedBlock.rate}
              peerRate={selectedBlock.peerAverage}
              rating={selectedBlock.rating}
            />
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}

export default function AnalyticsPage({
  embedded = false,
  sellerId: sellerIdProp,
  sellers: sellersProp,
  hideSellerFilter = false,
  active = true,
} = {}) {
  const [internalSellers, setInternalSellers] = useState([]);
  const [internalSellerId, setInternalSellerId] = useState('');
  const sellers = sellersProp ?? internalSellers;
  const sellerId = sellerIdProp ?? internalSellerId;
  const setSellerId = sellerIdProp != null ? () => {} : setInternalSellerId;
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [csMetricType, setCsMetricType] = useState('ITEM_NOT_AS_DESCRIBED');
  const [csEvaluationType, setCsEvaluationType] = useState('CURRENT');
  const [csReport, setCsReport] = useState(null);
  const [csHint, setCsHint] = useState('');
  const [selectedDimensionId, setSelectedDimensionId] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [noSavedData, setNoSavedData] = useState(false);
  const [bulkRefreshMessage, setBulkRefreshMessage] = useState('');
  const [metricCases, setMetricCases] = useState([]);
  const [metricCasesLoading, setMetricCasesLoading] = useState(false);
  const [metricCasesError, setMetricCasesError] = useState('');

  useEffect(() => {
    if (sellersProp) return;
    api.get('/sellers/all')
      .then(({ data }) => {
        const list = data || [];
        setInternalSellers(list);
        if (list.length > 0) setInternalSellerId((prev) => prev || list[0]._id);
      })
      .catch(() => setInternalSellers([]));
  }, [sellersProp]);

  const dimensionBlocks = useMemo(
    () => parseCsDimensionBlocks(csReport, csMetricType),
    [csReport, csMetricType]
  );

  const sortedBlocks = useMemo(() => {
    const blocks = [...dimensionBlocks].sort((a, b) => (b.transactionCount || 0) - (a.transactionCount || 0));
    if (csMetricType === 'ITEM_NOT_RECEIVED') {
      const domestic = blocks.find((b) => b.categoryId === 'DOMESTIC');
      if (domestic) {
        return [domestic, ...blocks.filter((b) => b.categoryId !== 'DOMESTIC')];
      }
    }
    return blocks;
  }, [dimensionBlocks, csMetricType]);

  const selectedBlock = useMemo(() => {
    if (!sortedBlocks.length) return null;
    return sortedBlocks.find((b) => b.categoryId === selectedDimensionId) || sortedBlocks[0];
  }, [sortedBlocks, selectedDimensionId]);

  useEffect(() => {
    if (!sortedBlocks.length) {
      setSelectedDimensionId('');
      return;
    }
    if (!sortedBlocks.some((b) => b.categoryId === selectedDimensionId)) {
      setSelectedDimensionId(sortedBlocks[0].categoryId);
    }
  }, [sortedBlocks, selectedDimensionId]);

  const evalPeriod = useMemo(() => formatEvalPeriod(csReport?.evaluationCycle), [csReport]);
  const isInad = csMetricType === 'ITEM_NOT_AS_DESCRIBED';
  const dimensionLabel = isInad ? 'Category' : 'Region';
  const metricTitle = isInad ? 'Item not as described' : 'Item not received requests';
  const caseLabel = isInad ? 'Item not as described' : 'Not received';
  const totalReasons = selectedBlock?.reasons?.reduce((sum, r) => sum + r.value, 0) || 0;
  const selectedAdjustmentHint = selectedBlock ? adjustmentHint(selectedBlock, csMetricType) : null;
  const savedAtLabel = formatSavedAt(fetchedAt);

  const applyCsResponse = useCallback((data) => {
    if (data.noData || !data.report) {
      setCsReport(null);
      setNoSavedData(true);
      setFromCache(false);
      setFetchedAt(null);
      return;
    }
    setCsReport(data.report);
    setFromCache(Boolean(data.fromCache));
    setFetchedAt(data.fetchedAt || null);
    setNoSavedData(false);
  }, []);

  const loadCsMetric = useCallback(async ({ refresh = false } = {}) => {
    if (!sellerId) {
      setError('Select a seller');
      return;
    }
    setLoading(true);
    setError('');
    setCsHint('');
    if (refresh) {
      setSelectedDimensionId('');
    }
    try {
      const params = {
        sellerId,
        marketplace,
        metricType: csMetricType,
        evaluationType: csEvaluationType,
      };
      if (refresh) params.refresh = true;

      const { data } = await api.get('/ebay/analytics/customer-service-metric', { params });
      if (!data.success) {
        throw new Error(data.error || 'Failed to load customer service metric');
      }
      applyCsResponse(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load customer service metric';
      setError(msg);
      setCsHint(err.response?.data?.hint || '');
      if (err.response?.data?.cachedReport) {
        setCsReport(err.response.data.cachedReport);
        setFromCache(true);
        setFetchedAt(err.response.data.fetchedAt || null);
        setNoSavedData(false);
      } else if (refresh) {
        setCsReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [sellerId, marketplace, csMetricType, csEvaluationType, applyCsResponse]);

  const refreshAllFromEbay = useCallback(async () => {
    setLoading(true);
    setError('');
    setCsHint('');
    setBulkRefreshMessage('');
    setSelectedDimensionId('');
    try {
      const { data } = await api.post(
        '/ebay/analytics/customer-service-metric/refresh-all',
        {
          marketplace,
          metricType: csMetricType,
          evaluationType: csEvaluationType,
        },
        { timeout: 600000 }
      );
      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh customer service metrics');
      }
      const { summary, results } = data;
      const failedNames = (results || [])
        .filter((r) => !r.success && !r.skipped)
        .map((r) => r.sellerName)
        .slice(0, 5);
      let message = `Saved ${summary.succeeded} of ${summary.total} sellers`;
      if (summary.skipped) message += ` (${summary.skipped} not connected)`;
      if (summary.failed) {
        message += ` — ${summary.failed} failed`;
        if (failedNames.length) message += `: ${failedNames.join(', ')}${summary.failed > failedNames.length ? '…' : ''}`;
      }
      setBulkRefreshMessage(message);
      if (sellerId) {
        await loadCsMetric({ refresh: false });
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to refresh customer service metrics';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [marketplace, csMetricType, csEvaluationType, sellerId, loadCsMetric]);

  useEffect(() => {
    if (!active || !sellerId) return;
    loadCsMetric({ refresh: false });
  }, [active, sellerId, marketplace, csMetricType, csEvaluationType, loadCsMetric]);

  const loadMetricCases = useCallback(async () => {
    if (!sellerId || !csReport?.evaluationCycle) {
      setMetricCases([]);
      setMetricCasesError('');
      return;
    }
    setMetricCasesLoading(true);
    setMetricCasesError('');
    try {
      const { data } = await api.get('/ebay/analytics/customer-service-metric/orders', {
        params: {
          sellerId,
          metricType: csMetricType,
          fromDate: csReport.evaluationCycle.startDate,
          toDate: csReport.evaluationCycle.endDate,
          limit: Math.max(50, Number(selectedBlock?.count) || 50),
        },
      });
      if (!data.success) throw new Error(data.error || 'Failed to load orders');
      setMetricCases(Array.isArray(data.cases) ? data.cases : []);
    } catch (err) {
      setMetricCases([]);
      setMetricCasesError(err.response?.data?.error || err.message || 'Failed to load orders');
    } finally {
      setMetricCasesLoading(false);
    }
  }, [sellerId, csMetricType, csReport, selectedBlock?.count]);

  useEffect(() => {
    if (!active || !csReport || csMetricType !== 'ITEM_NOT_RECEIVED') {
      setMetricCases([]);
      setMetricCasesError('');
      return;
    }
    void loadMetricCases();
  }, [active, csReport, csMetricType, loadMetricCases]);

  const rootSx = embedded
    ? { pt: 2 }
    : { p: 3 };

  return (
    <Box sx={rootSx}>
      {!embedded ? (
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Service metrics</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            eBay customer service metrics —{' '}
            <Link href={EBAY_CSM_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
            . Matches Seller Hub performance / service metrics.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
          onClick={refreshAllFromEbay}
          disabled={loading || sellers.length === 0}
        >
          {loading ? 'Refreshing all sellers…' : 'Refresh from eBay'}
        </Button>
      </Stack>
      ) : (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={refreshAllFromEbay}
            disabled={loading || sellers.length === 0}
          >
            {loading ? 'Refreshing…' : 'Refresh all sellers'}
          </Button>
        </Stack>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Tabs
          value={csMetricType}
          onChange={(_, v) => setCsMetricType(v)}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="ITEM_NOT_AS_DESCRIBED" label="Item not as described" />
          <Tab value="ITEM_NOT_RECEIVED" label="Item not received" />
        </Tabs>

        <Grid container spacing={2}>
          {!hideSellerFilter ? (
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Seller</InputLabel>
              <Select label="Seller" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.user?.email || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          ) : null}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Marketplace</InputLabel>
              <Select label="Marketplace" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Evaluation</InputLabel>
              <Select label="Evaluation" value={csEvaluationType} onChange={(e) => setCsEvaluationType(e.target.value)}>
                <MenuItem value="CURRENT">Current rate (monthly)</MenuItem>
                <MenuItem value="PROJECTED">Projected (daily)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          {csHint ? <Typography variant="body2" sx={{ mt: 1 }}>{csHint}</Typography> : null}
          {fromCache && savedAtLabel ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Showing last saved data from {savedAtLabel}.
            </Typography>
          ) : null}
        </Alert>
      )}

      {!error && bulkRefreshMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setBulkRefreshMessage('')}>
          {bulkRefreshMessage}
        </Alert>
      )}

      {!error && csReport && fromCache && savedAtLabel && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing saved data from {savedAtLabel}. Service metrics are historical — use <strong>Refresh from eBay</strong> to pull newer snapshots for all sellers.
        </Alert>
      )}

      {!error && noSavedData && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No saved report for this seller and filters yet. Click <strong>Refresh from eBay</strong> to fetch and save metrics for all sellers.
        </Alert>
      )}

      {csReport && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
            {csReport.marketplaceId && (
              <Chip size="small" label={csReport.marketplaceId} variant="outlined" />
            )}
            {csReport.evaluationCycle?.evaluationType && (
              <Chip size="small" label={csReport.evaluationCycle.evaluationType} variant="outlined" />
            )}
            {evalPeriod && (
              <Chip size="small" label={evalPeriod} />
            )}
            {savedAtLabel && (
              <Chip size="small" label={`Saved ${savedAtLabel}`} color="default" />
            )}
          </Stack>

          {sortedBlocks.length > 0 && selectedBlock && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={8}>
                <MetricOverviewCard
                  dimensionLabel={dimensionLabel}
                  metricTitle={metricTitle}
                  caseLabel={caseLabel}
                  sortedBlocks={sortedBlocks}
                  selectedBlock={selectedBlock}
                  onSelectDimension={setSelectedDimensionId}
                  selectedAdjustmentHint={selectedAdjustmentHint}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                {isInad ? (
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                      Reasons for your returns
                    </Typography>
                    {selectedBlock.reasons.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No reason breakdown for this category.
                      </Typography>
                    ) : (
                      <>
                        <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
                          {formatCount(totalReasons)} returns
                        </Typography>
                        <Stack spacing={1}>
                          {selectedBlock.reasons.map((reason) => (
                            <Box key={reason.key}>
                              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                                <Typography variant="body2">{reason.label}</Typography>
                                <Typography variant="body2" fontWeight={600}>{reason.value}</Typography>
                              </Stack>
                              <LinearProgress
                                variant="determinate"
                                value={totalReasons > 0 ? (reason.value / totalReasons) * 100 : 0}
                                sx={{ height: 6, borderRadius: 1 }}
                              />
                            </Box>
                          ))}
                        </Stack>
                      </>
                    )}
                  </Paper>
                ) : (
                  <MetricCasesPanel
                    title="Not received orders"
                    cases={metricCases}
                    loading={metricCasesLoading}
                    error={metricCasesError}
                    expectedCount={selectedBlock?.count}
                    emptyHint="No INR cases found in this evaluation period. Sync INR cases from Disputes → Fetch INR Cases, then refresh."
                  />
                )}
              </Grid>
            </Grid>
          )}

          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              {isInad ? 'All categories' : 'All regions'}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>{dimensionLabel}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Rate</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Peers</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Rating</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Cases</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Transactions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedBlocks.map((row) => (
                    <TableRow
                      key={row.categoryId}
                      hover
                      selected={row.categoryId === selectedBlock?.categoryId}
                      onClick={() => setSelectedDimensionId(row.categoryId)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{row.categoryName}</TableCell>
                      <TableCell align="right">{formatPercent(row.rate)}</TableCell>
                      <TableCell align="right">{formatPercent(row.peerAverage)}</TableCell>
                      <TableCell align="right">
                        {row.rating ? (
                          <Chip
                            size="small"
                            color={RATING_COLORS[row.rating] || 'default'}
                            label={ratingLabel(row)}
                          />
                        ) : '—'}
                      </TableCell>
                      <TableCell align="right">{formatCount(row.count)}</TableCell>
                      <TableCell align="right">{formatCount(row.transactionCount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}


    </Box>
  );
}
