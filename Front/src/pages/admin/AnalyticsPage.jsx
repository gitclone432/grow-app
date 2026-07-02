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

const INR_BEST_PRACTICES = [
  'Upload tracking for every order so buyers can follow delivery.',
  'Ship on time — meet or beat your stated handling time.',
  'Choose the right shipping service for the destination and item type.',
];

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

function PeerScale({ yourRate, peerRate, rating }) {
  if (yourRate == null && peerRate == null) return null;
  const high = Math.max(yourRate ?? 0, peerRate ?? 0, 0.25) * 1.35 || 1;
  const toPct = (v) => Math.min(100, Math.max(0, ((v ?? 0) / high) * 100));

  return (
    <Box sx={{ px: 1 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="caption" color="error.main">Very high</Typography>
        <Typography variant="caption" color="warning.main">Average</Typography>
        <Typography variant="caption" color="success.main">Low</Typography>
      </Stack>
      <Box sx={{ position: 'relative', height: 160, borderRadius: 1, overflow: 'visible', mb: 2, mx: 'auto', width: 48 }}>
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: 1, background: 'linear-gradient(180deg, #f44336 0%, #ffeb3b 55%, #4caf50 100%)' }} />
        {peerRate != null && (
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              bottom: `${toPct(peerRate)}%`,
              width: 56,
              height: 2,
              bgcolor: 'grey.800',
              transform: 'translate(-50%, 1px)',
            }}
            title={`Peers ${formatPercent(peerRate)}`}
          />
        )}
        {yourRate != null && (
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              bottom: `${toPct(yourRate)}%`,
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              border: '2px solid #fff',
              transform: 'translate(-50%, 7px)',
              boxShadow: 1,
            }}
            title={`You ${formatPercent(yourRate)}`}
          />
        )}
      </Box>
      <Stack spacing={0.5}>
        {peerRate != null && (
          <Typography variant="body2">
            <strong>Peers =</strong> {formatPercent(peerRate)}
          </Typography>
        )}
        {yourRate != null && (
          <Typography variant="body2">
            <strong>You =</strong> {formatPercent(yourRate)}
            {rating ? (
              <> · <Chip size="small" color={RATING_COLORS[rating] || 'default'} label={rating.replace(/_/g, ' ')} /></>
            ) : null}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export default function AnalyticsPage() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
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

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => {
        const list = data || [];
        setSellers(list);
        if (list.length > 0) setSellerId((prev) => prev || list[0]._id);
      })
      .catch(() => setSellers([]));
  }, []);

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
    if (!sellerId) return;
    loadCsMetric({ refresh: false });
  }, [sellerId, marketplace, csMetricType, csEvaluationType, loadCsMetric]);

  return (
    <Box sx={{ p: 3 }}>
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
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, height: '100%' }}>
                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel>{dimensionLabel}</InputLabel>
                    <Select
                      label={dimensionLabel}
                      value={selectedBlock.categoryId}
                      onChange={(e) => setSelectedDimensionId(e.target.value)}
                    >
                      {sortedBlocks.map((block) => (
                        <MenuItem key={block.categoryId} value={block.categoryId}>
                          {block.categoryName} ({formatCount(block.transactionCount)})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {metricTitle}
                  </Typography>
                  <Typography variant="h6" sx={{ mb: 1 }}>{selectedBlock.categoryName}</Typography>
                  <Typography variant="h3" fontWeight={800} sx={{ mb: 1 }}>
                    {formatPercent(selectedBlock.rate)}
                  </Typography>
                  {selectedBlock.rating && (
                    <Chip
                      size="small"
                      color={RATING_COLORS[selectedBlock.rating] || 'default'}
                      label={ratingLabel(selectedBlock)}
                      sx={{ mb: 1 }}
                    />
                  )}
                  {selectedAdjustmentHint && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                      {selectedAdjustmentHint}
                    </Typography>
                  )}

                  <Stack spacing={0.5} sx={{ typography: 'body2', color: 'text.secondary' }}>
                    <Typography>
                      Total transactions: <strong>{formatCount(selectedBlock.transactionCount)}</strong>
                    </Typography>
                    <Typography>
                      {caseLabel}: <strong>{formatCount(selectedBlock.count)}</strong>
                    </Typography>
                    {selectedBlock.count != null && selectedBlock.transactionCount != null && selectedBlock.transactionCount > 0 && (
                      <Typography variant="caption">
                        {formatCount(selectedBlock.count)} / {formatCount(selectedBlock.transactionCount)} = {formatPercent(selectedBlock.rate)}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              </Grid>

              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                    Compared to peers
                  </Typography>
                  <PeerScale
                    yourRate={selectedBlock.rate}
                    peerRate={selectedBlock.peerAverage}
                    rating={selectedBlock.rating}
                  />
                </Paper>
              </Grid>

              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                    {isInad ? 'Reasons for your returns' : 'Best practices'}
                  </Typography>
                  {isInad ? (
                    selectedBlock.reasons.length === 0 ? (
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
                    )
                  ) : (
                    <Stack spacing={1.5} component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {INR_BEST_PRACTICES.map((tip) => (
                        <Typography key={tip} component="li" variant="body2" color="text.secondary">
                          {tip}
                        </Typography>
                      ))}
                    </Stack>
                  )}
                </Paper>
              </Grid>
            </Grid>
          )}

          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              All {dimensionLabel.toLowerCase()}s
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
