import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
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
  TableSortLabel,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

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

const STANDARDS_COLORS = {
  TOP_RATED: 'success',
  ABOVE_STANDARD: 'info',
  BELOW_STANDARD: 'error',
};

const LEVEL_SORT_ORDER = {
  BELOW_STANDARD: 0,
  ABOVE_STANDARD: 1,
  TOP_RATED: 2,
};

const METRIC_COLS = 6;
const SELLER_COL_WIDTH = 180;
const HEADER_ROW_H = 37;
const BODY_ROW_H = 48;

function formatPercent(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

function formatCount(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

function labelize(value) {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ');
}

function LevelChip({ level }) {
  if (!level) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <Chip
      size="small"
      label={labelize(level)}
      color={STANDARDS_COLORS[level] || 'default'}
    />
  );
}

const clickableCellSx = {
  cursor: 'pointer',
  '&:hover': { bgcolor: 'action.hover' },
};

function RateCell({ rate, level, warnBelow, warnAtOrAbove, onClick }) {
  const n = rate == null || rate === '' || Number.isNaN(Number(rate)) ? null : Number(rate);
  // Values are already percentage points (e.g. late ship 0.31 = 0.31%, tracking 96.5 = 96.5%)
  const belowThreshold = warnBelow != null && n != null && n < warnBelow;
  const atOrAboveThreshold = warnAtOrAbove != null && n != null && n >= warnAtOrAbove;
  const warn = belowThreshold || atOrAboveThreshold || level === 'BELOW_STANDARD';

  return (
    <TableCell
      align="right"
      onClick={onClick}
      sx={{
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        height: BODY_ROW_H,
        py: 0,
        color: warn ? 'error.main' : undefined,
        fontWeight: warn ? 700 : undefined,
        ...(onClick ? clickableCellSx : {}),
      }}
    >
      {formatPercent(rate)}
    </TableCell>
  );
}

function CountCell({ count, level, onClick }) {
  const n = count == null || count === '' || Number.isNaN(Number(count)) ? null : Number(count);
  let color;
  if (n == null) {
    color = undefined;
  } else if (n >= 3) {
    color = 'error.main';
  } else if (n === 2) {
    color = 'primary.main';
  } else if (n === 1) {
    color = 'text.primary';
  } else {
    color = level === 'BELOW_STANDARD' ? 'error.main' : 'text.secondary';
  }

  return (
    <TableCell
      align="right"
      onClick={onClick}
      sx={{
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        height: BODY_ROW_H,
        py: 0,
        fontWeight: 700,
        color,
        ...(onClick ? clickableCellSx : {}),
      }}
    >
      {formatCount(count)}
    </TableCell>
  );
}

function formatRateNumber(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

function CsmCell({ rate, peerRate, warnIfStoreAbovePeer = false, onClick }) {
  const storeNum = rate != null && rate !== '' && !Number.isNaN(Number(rate)) ? Number(rate) : null;
  const peerNum = peerRate != null && peerRate !== '' && !Number.isNaN(Number(peerRate))
    ? Number(peerRate)
    : null;
  const storeOverPeer =
    warnIfStoreAbovePeer && storeNum != null && peerNum != null && storeNum > peerNum;

  return (
    <TableCell
      align="right"
      onClick={onClick}
      sx={{
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        height: BODY_ROW_H,
        py: 0,
        ...(onClick ? clickableCellSx : {}),
      }}
    >
      <Typography variant="body2" component="span">
        <Box
          component="span"
          sx={storeOverPeer ? { color: 'error.main', fontWeight: 700 } : undefined}
        >
          {storeNum != null ? formatRateNumber(storeNum) : '—'}
        </Box>
        {' / '}
        <Box component="span" sx={{ fontWeight: 700 }}>
          {peerNum != null ? formatRateNumber(peerNum) : '—'}
        </Box>
      </Typography>
    </TableCell>
  );
}

function MetricsCells({ metrics, startBorder = false, onOpen }) {
  const m = metrics || {};
  const openStandards = onOpen
    ? (e) => {
      e.stopPropagation();
      onOpen({ tab: 'standards' });
    }
    : undefined;
  const openInr = onOpen
    ? (e) => {
      e.stopPropagation();
      onOpen({ tab: 'metrics', metricType: 'ITEM_NOT_RECEIVED' });
    }
    : undefined;
  const openInad = onOpen
    ? (e) => {
      e.stopPropagation();
      onOpen({ tab: 'metrics', metricType: 'ITEM_NOT_AS_DESCRIBED' });
    }
    : undefined;

  return (
    <>
      <TableCell
        onClick={openStandards}
        sx={{
          height: BODY_ROW_H,
          py: 0,
          ...(startBorder ? { borderLeft: 1, borderColor: 'divider' } : {}),
          ...(openStandards ? clickableCellSx : {}),
        }}
      >
        <LevelChip level={m.standardsLevel} />
      </TableCell>
      <CountCell count={m.defectCount} level={m.defectLevel} onClick={openStandards} />
      <RateCell rate={m.lateShipRate} level={m.lateShipLevel} warnAtOrAbove={3} onClick={openStandards} />
      <RateCell rate={m.trackingRate} level={m.trackingLevel} warnBelow={95} onClick={openStandards} />
      <CsmCell
        rate={m.inrRate}
        peerRate={m.inrPeerRate}
        warnIfStoreAbovePeer
        onClick={openInr}
      />
      <CsmCell
        rate={m.inadRate}
        peerRate={m.inadPeerRate}
        warnIfStoreAbovePeer
        onClick={openInad}
      />
    </>
  );
}

function compareRows(a, b, orderBy, order) {
  const dir = order === 'asc' ? 1 : -1;
  if (orderBy === 'sellerName') {
    return String(a.sellerName || '').localeCompare(String(b.sellerName || '')) * dir;
  }
  if (orderBy === 'current.standardsLevel' || orderBy === 'projected.standardsLevel') {
    const key = orderBy.startsWith('current') ? 'current' : 'projected';
    const av = LEVEL_SORT_ORDER[a?.[key]?.standardsLevel] ?? -1;
    const bv = LEVEL_SORT_ORDER[b?.[key]?.standardsLevel] ?? -1;
    if (av !== bv) return (av - bv) * dir;
    return String(a.sellerName || '').localeCompare(String(b.sellerName || '')) * dir;
  }
  return 0;
}

function isConcernRow(row) {
  const checks = [row.current, row.projected];
  return checks.some((m) => {
    if (!m) return false;
    if (m.standardsLevel === 'BELOW_STANDARD') return true;
    if (m.defectLevel === 'BELOW_STANDARD' || m.lateShipLevel === 'BELOW_STANDARD') return true;
    if (m.inrRating === 'VERY_HIGH' || m.inrRating === 'HIGH') return true;
    if (m.inadRating === 'VERY_HIGH' || m.inadRating === 'HIGH') return true;
    return false;
  });
}

const groupHeaderSx = {
  textAlign: 'center',
  fontWeight: 700,
  height: HEADER_ROW_H,
  py: 0,
  borderBottom: 1,
  borderColor: 'divider',
};

const subHeaderSx = {
  height: HEADER_ROW_H,
  py: 0,
  whiteSpace: 'nowrap',
};

export default function AnalyticsSummaryPage({
  embedded = false,
  active = true,
  onOpenSeller,
}) {
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [orderBy, setOrderBy] = useState('sellerName');
  const [order, setOrder] = useState('asc');

  const sellerScrollRef = useRef(null);
  const metricsScrollRef = useRef(null);
  const [scrollbarPad, setScrollbarPad] = useState(0);

  // Metrics pane is the only vertical scroller; seller follows it (avoids dual-scrollbar lag).
  const onMetricsScroll = useCallback(() => {
    const metricsEl = metricsScrollRef.current;
    const sellerEl = sellerScrollRef.current;
    if (!metricsEl || !sellerEl) return;
    if (sellerEl.scrollTop !== metricsEl.scrollTop) {
      sellerEl.scrollTop = metricsEl.scrollTop;
    }
  }, []);

  // Wheel over the frozen seller column still scrolls the metrics pane.
  useEffect(() => {
    const sellerEl = sellerScrollRef.current;
    if (!sellerEl) return undefined;
    const onWheel = (event) => {
      const metricsEl = metricsScrollRef.current;
      if (!metricsEl) return;
      metricsEl.scrollTop += event.deltaY;
      event.preventDefault();
    };
    sellerEl.addEventListener('wheel', onWheel, { passive: false });
    return () => sellerEl.removeEventListener('wheel', onWheel);
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ebay/analytics/summary', {
        params: { marketplace },
      });
      if (!data.success) {
        throw new Error(data.error || 'Failed to load summary');
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load summary');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [marketplace]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setError('');
    setBulkMessage('');
    try {
      const csmCalls = [
        ['INR current', { marketplace, evaluationType: 'CURRENT', metricType: 'ITEM_NOT_RECEIVED' }],
        ['INR projected', { marketplace, evaluationType: 'PROJECTED', metricType: 'ITEM_NOT_RECEIVED' }],
        ['INAD current', { marketplace, evaluationType: 'CURRENT', metricType: 'ITEM_NOT_AS_DESCRIBED' }],
        ['INAD projected', { marketplace, evaluationType: 'PROJECTED', metricType: 'ITEM_NOT_AS_DESCRIBED' }],
      ];

      const [sspRes, ...csmResults] = await Promise.all([
        api.post('/ebay/analytics/seller-standards-profiles/refresh-all', {}, { timeout: 600000 }),
        ...csmCalls.map(([, body]) =>
          api.post('/ebay/analytics/customer-service-metric/refresh-all', body, { timeout: 600000 })
        ),
      ]);

      const parts = [];
      const labeled = [
        ['Standards', sspRes.data],
        ...csmCalls.map(([label], i) => [label, csmResults[i].data]),
      ];
      for (const [label, data] of labeled) {
        if (!data?.success) {
          parts.push(`${label}: failed`);
          continue;
        }
        const s = data.summary || {};
        let msg = `${label}: ${s.succeeded ?? 0}/${s.total ?? 0}`;
        if (s.skipped) msg += ` (${s.skipped} skipped)`;
        if (s.failed) msg += `, ${s.failed} failed`;
        parts.push(msg);
      }
      setBulkMessage(parts.join(' · '));
      await loadSummary();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to refresh all sellers');
    } finally {
      setRefreshing(false);
    }
  }, [marketplace, loadSummary]);

  useEffect(() => {
    if (!active) return;
    void loadSummary();
  }, [active, loadSummary]);

  const handleSort = (column) => {
    if (orderBy === column) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setOrderBy(column);
    setOrder('asc');
  };

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, orderBy, order)),
    [rows, orderBy, order]
  );

  // Keep row alignment when the metrics pane shows a horizontal scrollbar.
  useEffect(() => {
    const metricsEl = metricsScrollRef.current;
    if (!metricsEl) return undefined;

    const measure = () => {
      const pad = Math.max(0, metricsEl.offsetHeight - metricsEl.clientHeight);
      setScrollbarPad((prev) => (prev === pad ? prev : pad));
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(metricsEl);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sortedRows.length, loading, refreshing]);

  const busy = loading || refreshing;
  const rootSx = embedded ? { pt: 2 } : { p: { xs: 2, sm: 3 }, maxWidth: 1800, mx: 'auto' };
  const emptyOrLoading = busy && !sortedRows.length;
  const emptyIdle = !busy && !sortedRows.length;

  return (
    <Box sx={rootSx}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          useFlexGap
          flexWrap="wrap"
        >
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              label="Marketplace"
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              disabled={busy}
            >
              {MARKETPLACES.map((mp) => (
                <MenuItem key={mp} value={mp}>{mp}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            startIcon={busy ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => void loadSummary()}
            disabled={busy}
          >
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={() => void refreshAll()}
            disabled={busy}
          >
            Refresh all
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
      ) : null}
      {bulkMessage ? (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setBulkMessage('')}>{bulkMessage}</Alert>
      ) : null}

      <Paper
        variant="outlined"
        sx={{
          display: 'flex',
          maxHeight: '70vh',
          overflow: 'hidden',
        }}
      >
        {/* Frozen seller column — follows metrics vertical scroll (no own scrollbar) */}
        <TableContainer
          ref={sellerScrollRef}
          sx={{
            width: SELLER_COL_WIDTH,
            minWidth: SELLER_COL_WIDTH,
            maxWidth: SELLER_COL_WIDTH,
            flexShrink: 0,
            // Programmatic scroll only (driven by metrics). Hidden scrollbar, no own scroll input.
            overflowY: 'scroll',
            overflowX: 'hidden',
            borderRight: 1,
            borderColor: 'divider',
            boxShadow: '4px 0 8px -4px rgba(0,0,0,0.18)',
            zIndex: 2,
            bgcolor: 'background.paper',
            overscrollBehavior: 'contain',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
          }}
        >
          <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: SELLER_COL_WIDTH }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ height: HEADER_ROW_H, py: 0, borderBottom: 0 }} />
              </TableRow>
              <TableRow>
                <TableCell
                  sortDirection={orderBy === 'sellerName' ? order : false}
                  sx={{ ...subHeaderSx, top: HEADER_ROW_H }}
                >
                  <TableSortLabel
                    active={orderBy === 'sellerName'}
                    direction={orderBy === 'sellerName' ? order : 'asc'}
                    onClick={() => handleSort('sellerName')}
                  >
                    Seller
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {emptyOrLoading ? (
                <TableRow>
                  <TableCell sx={{ height: BODY_ROW_H * 3, borderBottom: 0 }} />
                </TableRow>
              ) : null}
              {emptyIdle ? (
                <TableRow>
                  <TableCell sx={{ height: BODY_ROW_H * 3, borderBottom: 0 }} />
                </TableRow>
              ) : null}
              {sortedRows.map((row) => {
                const concern = isConcernRow(row);
                return (
                  <TableRow
                    key={row.sellerId}
                    hover
                    onClick={() => onOpenSeller?.(row.sellerId, 'standards', {
                      evaluationType: 'PROJECTED',
                    })}
                    sx={{
                      cursor: onOpenSeller ? 'pointer' : 'default',
                      bgcolor: concern ? 'error.50' : undefined,
                    }}
                  >
                    <TableCell sx={{ height: BODY_ROW_H, py: 0, maxWidth: SELLER_COL_WIDTH }}>
                      <Typography variant="body2" fontWeight={600} noWrap title={row.sellerName}>
                        {row.sellerName}
                      </Typography>
                      {!row.connected ? (
                        <Typography variant="caption" color="warning.main" display="block" noWrap>
                          Not connected
                        </Typography>
                      ) : !row.current?.hasStandards && !row.current?.hasCsm
                        && !row.projected?.hasStandards && !row.projected?.hasCsm ? (
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          No saved data
                        </Typography>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {scrollbarPad > 0 ? <Box sx={{ height: scrollbarPad, flexShrink: 0 }} /> : null}
        </TableContainer>

        {/* Metrics — sole vertical + horizontal scroller */}
        <TableContainer
          ref={metricsScrollRef}
          onScroll={onMetricsScroll}
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            overscrollBehavior: 'contain',
            scrollbarGutter: 'stable',
          }}
        >
          <Table stickyHeader size="small" sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <TableCell colSpan={METRIC_COLS} sx={groupHeaderSx}>
                  Current evaluation
                </TableCell>
                <TableCell colSpan={METRIC_COLS} sx={{ ...groupHeaderSx, borderLeft: 1 }}>
                  Projected evaluation
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell
                  sortDirection={orderBy === 'current.standardsLevel' ? order : false}
                  sx={{ ...subHeaderSx, top: HEADER_ROW_H }}
                >
                  <TableSortLabel
                    active={orderBy === 'current.standardsLevel'}
                    direction={orderBy === 'current.standardsLevel' ? order : 'asc'}
                    onClick={() => handleSort('current.standardsLevel')}
                  >
                    Standards
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>Defect</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>Late ship</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>Tracking</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>INR</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>INAD</TableCell>
                <TableCell
                  sortDirection={orderBy === 'projected.standardsLevel' ? order : false}
                  sx={{ ...subHeaderSx, top: HEADER_ROW_H, borderLeft: 1 }}
                >
                  <TableSortLabel
                    active={orderBy === 'projected.standardsLevel'}
                    direction={orderBy === 'projected.standardsLevel' ? order : 'asc'}
                    onClick={() => handleSort('projected.standardsLevel')}
                  >
                    Standards
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>Defect</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>Late ship</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>Tracking</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>INR</TableCell>
                <TableCell align="right" sx={{ ...subHeaderSx, top: HEADER_ROW_H }}>INAD</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {emptyOrLoading ? (
                <TableRow>
                  <TableCell colSpan={METRIC_COLS * 2} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : null}
              {emptyIdle ? (
                <TableRow>
                  <TableCell colSpan={METRIC_COLS * 2} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No seller data yet. Use Refresh all to pull metrics from eBay.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
              {sortedRows.map((row) => {
                const concern = isConcernRow(row);
                return (
                  <TableRow
                    key={row.sellerId}
                    hover
                    sx={{ bgcolor: concern ? 'error.50' : undefined }}
                  >
                    <MetricsCells
                      metrics={row.current}
                      onOpen={({ tab, metricType }) => {
                        onOpenSeller?.(row.sellerId, tab, {
                          evaluationType: 'CURRENT',
                          metricType,
                        });
                      }}
                    />
                    <MetricsCells
                      metrics={row.projected}
                      startBorder
                      onOpen={({ tab, metricType }) => {
                        onOpenSeller?.(row.sellerId, tab, {
                          evaluationType: 'PROJECTED',
                          metricType,
                        });
                      }}
                    />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
