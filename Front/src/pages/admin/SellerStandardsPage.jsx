import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

const EBAY_SSP_DOCS =
  'https://developer.ebay.com/api-docs/sell/analytics/resources/seller_standards_profile/methods/findSellerStandardsProfiles';

const ALL_PROGRAMS_VALUE = '__all__';

const PROGRAMS = [
  { value: 'PROGRAM_US', label: 'United States' },
  { value: 'PROGRAM_UK', label: 'United Kingdom' },
  { value: 'PROGRAM_DE', label: 'Germany' },
  { value: 'PROGRAM_GLOBAL', label: 'Global' },
];

const STANDARDS_COLORS = {
  TOP_RATED: 'success',
  ABOVE_STANDARD: 'info',
  BELOW_STANDARD: 'error',
};

const PROFILE_BORDER_COLORS = {
  TOP_RATED: 'success.main',
  ABOVE_STANDARD: 'info.main',
  BELOW_STANDARD: 'error.main',
};

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

function programLabel(program) {
  return PROGRAMS.find((p) => p.value === program)?.label || program || '—';
}

function standardsLabel(level) {
  if (!level) return '—';
  return String(level).replace(/_/g, ' ');
}

function unwrapMetricField(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      scalar: raw.value != null ? raw.value : null,
      numerator: raw.numerator,
      denominator: raw.denominator,
      currency: raw.currency || null,
    };
  }
  return { scalar: raw, numerator: null, denominator: null, currency: null };
}

function formatRatePercent(scalar, type = 'RATE') {
  if (scalar == null || scalar === '') return '—';
  const n = Number(scalar);
  if (!Number.isNaN(n)) {
    const pct = type === 'FRACTION' && n <= 1 ? n * 100 : n;
    return `${pct.toFixed(2)}%`;
  }
  return `${scalar}%`;
}

function percentFromRatio(numerator, denominator) {
  if (numerator == null || denominator == null || Number(denominator) === 0) return null;
  const pct = (Number(numerator) / Number(denominator)) * 100;
  return Number.isNaN(pct) ? null : `${pct.toFixed(2)}%`;
}

function isRateMetric(metric) {
  const type = String(metric?.type || '').toUpperCase();
  if (type === 'RATE' || type === 'FRACTION') return true;
  const unwrapped = unwrapMetricField(metric?.value);
  return unwrapped?.numerator != null && unwrapped?.denominator != null;
}

function formatMetricDisplay(metric) {
  const type = String(metric?.type || '').toUpperCase();
  const unwrapped = unwrapMetricField(metric?.value);

  let yourValue = '—';
  if (unwrapped) {
    if (isRateMetric(metric) && unwrapped.numerator != null) {
      yourValue = String(unwrapped.numerator);
    } else if (type === 'BOOLEAN') {
      const v = unwrapped.scalar;
      yourValue = v === true || v === 'true' ? 'Yes' : 'No';
    } else if (unwrapped.currency) {
      yourValue = `${unwrapped.scalar} ${unwrapped.currency}`;
    } else if (unwrapped.scalar != null && unwrapped.scalar !== '') {
      yourValue = String(unwrapped.scalar);
    }
  }

  let ratePercent = '—';
  if (isRateMetric(metric) && unwrapped) {
    if (unwrapped.scalar != null && unwrapped.scalar !== '') {
      ratePercent = formatRatePercent(unwrapped.scalar, type);
    } else {
      ratePercent = percentFromRatio(unwrapped.numerator, unwrapped.denominator) || '—';
    }
  }

  const lowerRaw = unwrapMetricField(metric?.thresholdLowerBound);
  const upperRaw = unwrapMetricField(metric?.thresholdUpperBound);
  const formatBound = (unwrapped) => {
    if (!unwrapped || unwrapped.scalar == null) return null;
    if (type === 'RATE' || type === 'FRACTION') return formatRatePercent(unwrapped.scalar, type);
    if (unwrapped.currency) return `${unwrapped.scalar} ${unwrapped.currency}`;
    return String(unwrapped.scalar);
  };
  const lower = formatBound(lowerRaw);
  const upper = formatBound(upperRaw);
  let threshold = metric?.thresholdDisplay || '—';
  if (threshold === '—') {
    if (lower && upper) threshold = `Min ${lower} / Max ${upper}`;
    else if (lower) threshold = `Min ${lower}`;
    else if (upper) threshold = `Max ${upper}`;
  }

  const lookbackStart = metric?.lookbackStartDate
    ? new Date(metric.lookbackStartDate).toLocaleDateString()
    : null;
  const lookbackEnd = metric?.lookbackEndDate
    ? new Date(metric.lookbackEndDate).toLocaleDateString()
    : null;
  const lookback = lookbackStart || lookbackEnd
    ? `${lookbackStart || '—'} – ${lookbackEnd || '—'}`
    : '—';

  return {
    yourValue,
    ratePercent,
    threshold,
    lookback,
    level: metric?.level || null,
    name: metric?.name || metric?.metricKey || '—',
    metricKey: metric?.metricKey || '',
  };
}

function profileKey(profile) {
  return `${profile?.program || ''}:${profile?.cycle?.cycleType || ''}`;
}

const MetricRow = memo(function MetricRow({ metric }) {
  const row = useMemo(() => formatMetricDisplay(metric), [metric]);
  const belowStandard = row.level === 'BELOW_STANDARD';

  return (
    <TableRow
      hover
      sx={{
        bgcolor: belowStandard ? 'error.50' : undefined,
        '&:last-child td': { borderBottom: 0 },
      }}
    >
      <TableCell sx={{ maxWidth: 280 }}>
        <Tooltip title={row.metricKey || row.name} placement="top-start">
          <Typography variant="body2" fontWeight={600} noWrap>
            {row.name}
          </Typography>
        </Tooltip>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {row.yourValue}
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {row.ratePercent}
      </TableCell>
      <TableCell align="center">
        {row.level ? (
          <Chip
            size="small"
            label={standardsLabel(row.level)}
            color={STANDARDS_COLORS[row.level] || 'default'}
          />
        ) : '—'}
      </TableCell>
      <TableCell
        align="right"
        sx={{ color: 'error.main', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {row.threshold}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Typography variant="caption" color="text.secondary">
          {row.lookback}
        </Typography>
      </TableCell>
    </TableRow>
  );
});

const ProfileCard = memo(function ProfileCard({ profile, loading, onRefresh }) {
  const borderColor = PROFILE_BORDER_COLORS[profile.standardsLevel] || 'divider';

  return (
    <Paper
      variant="outlined"
      sx={{
        borderLeft: 4,
        borderLeftColor: borderColor,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'center' }}
        sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          {programLabel(profile.program)}
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {profile.standardsLevel && (
            <Chip
              size="small"
              label={standardsLabel(profile.standardsLevel)}
              color={STANDARDS_COLORS[profile.standardsLevel] || 'default'}
            />
          )}
          {profile.cycle?.cycleType && (
            <Chip size="small" label={profile.cycle.cycleType} variant="outlined" />
          )}
          {profile.cycle?.evaluationMonth && (
            <Chip size="small" label={`Eval ${profile.cycle.evaluationMonth}`} variant="outlined" />
          )}
          {profile.defaultProgram && (
            <Chip size="small" label="Default" variant="outlined" />
          )}
        </Stack>
        <Button
          size="small"
          variant="text"
          disabled={loading}
          onClick={onRefresh}
          sx={{ flexShrink: 0 }}
        >
          Refresh
        </Button>
      </Stack>

      {profile.evaluationReason && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>
          {profile.evaluationReason}
        </Typography>
      )}

      <TableContainer sx={{ maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Metric</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>
                Your value
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>
                Rate %
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Level</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>
                Threshold
              </TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>Lookback</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(profile.metrics || []).map((metric) => (
              <MetricRow key={metric.metricKey || metric.name} metric={metric} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
});

export default function SellerStandardsPage() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [cycleFilter, setCycleFilter] = useState('CURRENT');
  const [programFilter, setProgramFilter] = useState(ALL_PROGRAMS_VALUE);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
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

  const profiles = useMemo(() => {
    const list = Array.isArray(report?.standardsProfiles) ? report.standardsProfiles : [];
    return list.filter((p) => {
      if (cycleFilter && p?.cycle?.cycleType !== cycleFilter) return false;
      if (programFilter !== ALL_PROGRAMS_VALUE && p?.program !== programFilter) return false;
      return true;
    });
  }, [report, cycleFilter, programFilter]);

  const availablePrograms = useMemo(() => {
    const list = Array.isArray(report?.standardsProfiles) ? report.standardsProfiles : [];
    return [...new Set(list.map((p) => p?.program).filter(Boolean))].sort();
  }, [report]);

  const selectedSellerName = useMemo(
    () => sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '',
    [sellers, sellerId]
  );

  const applyResponse = useCallback((data) => {
    if (data.noData || !data.report) {
      setReport(null);
      setNoSavedData(true);
      setFromCache(false);
      setFetchedAt(null);
      return;
    }
    setReport(data.report);
    setFromCache(Boolean(data.fromCache));
    setFetchedAt(data.fetchedAt || null);
    setNoSavedData(false);
  }, []);

  const loadProfiles = useCallback(async ({ refresh = false, program, cycle } = {}) => {
    if (!sellerId) {
      setError('Select a seller');
      return;
    }
    setLoading(true);
    setError('');
    setHint('');
    try {
      const params = { sellerId };
      if (refresh) params.refresh = true;
      if (program && cycle) {
        params.program = program;
        params.cycle = cycle;
      }
      const { data } = await api.get('/ebay/analytics/seller-standards-profiles', { params });
      if (!data.success) {
        throw new Error(data.error || 'Failed to load seller standards');
      }
      applyResponse(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load seller standards';
      setError(msg);
      setHint(err.response?.data?.hint || '');
      if (err.response?.data?.cachedReport) {
        setReport(err.response.data.cachedReport);
        setFromCache(true);
        setFetchedAt(err.response.data.fetchedAt || null);
        setNoSavedData(false);
      } else if (refresh) {
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [sellerId, applyResponse]);

  const refreshAllFromEbay = useCallback(async () => {
    setLoading(true);
    setError('');
    setHint('');
    setBulkRefreshMessage('');
    try {
      const { data } = await api.post(
        '/ebay/analytics/seller-standards-profiles/refresh-all',
        {},
        { timeout: 600000 }
      );
      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh seller standards');
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
        if (failedNames.length) {
          message += `: ${failedNames.join(', ')}${summary.failed > failedNames.length ? '…' : ''}`;
        }
      }
      setBulkRefreshMessage(message);
      if (sellerId) {
        await loadProfiles({ refresh: false });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to refresh seller standards');
    } finally {
      setLoading(false);
    }
  }, [sellerId, loadProfiles]);

  useEffect(() => {
    if (!sellerId) return;
    void loadProfiles({ refresh: false });
  }, [sellerId, loadProfiles]);

  const savedAtLabel = formatSavedAt(fetchedAt);
  const overallLevel = profiles[0]?.standardsLevel;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Seller standards</Typography>
            {overallLevel && profiles.length === 1 && (
              <Chip
                size="small"
                label={standardsLabel(overallLevel)}
                color={STANDARDS_COLORS[overallLevel] || 'default'}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Seller Hub performance ratings —{' '}
            <Link href={EBAY_SSP_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
          onClick={refreshAllFromEbay}
          disabled={loading || sellers.length === 0}
          sx={{ alignSelf: { md: 'flex-start' }, flexShrink: 0 }}
        >
          {loading ? 'Refreshing…' : 'Refresh from eBay'}
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
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
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Cycle</InputLabel>
              <Select label="Cycle" value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
                <MenuItem value="CURRENT">Current (monthly)</MenuItem>
                <MenuItem value="PROJECTED">Projected (live)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Program</InputLabel>
              <Select
                label="Program"
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
              >
                <MenuItem value={ALL_PROGRAMS_VALUE}>All programs</MenuItem>
                {availablePrograms.map((program) => (
                  <MenuItem key={program} value={program}>
                    {programLabel(program)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        {savedAtLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            {selectedSellerName ? `${selectedSellerName} · ` : ''}
            Saved {savedAtLabel}
            {fromCache ? ' (cached)' : ''}
          </Typography>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          {hint ? <Typography variant="body2" sx={{ mt: 1 }}>{hint}</Typography> : null}
        </Alert>
      )}

      {!error && bulkRefreshMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setBulkRefreshMessage('')}>
          {bulkRefreshMessage}
        </Alert>
      )}

      {!error && noSavedData && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No saved data yet — click <strong>Refresh from eBay</strong> to fetch all sellers.
        </Alert>
      )}

      {loading && !report && (
        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      )}

      {profiles.length > 0 && (
        <Stack spacing={2} sx={{ opacity: loading && report ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {profiles.map((profile) => (
            <ProfileCard
              key={profileKey(profile)}
              profile={profile}
              loading={loading}
              onRefresh={() => loadProfiles({
                refresh: true,
                program: profile.program,
                cycle: profile.cycle?.cycleType,
              })}
            />
          ))}
        </Stack>
      )}

      {report && profiles.length === 0 && !loading && (
        <Alert severity="warning">No profiles match the selected cycle/program filters.</Alert>
      )}
    </Box>
  );
}
