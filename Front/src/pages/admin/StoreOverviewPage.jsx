import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../lib/api';
import {
  formatStoreSubscriptionPrice,
  formatTerm,
  freeListingsAllowanceNumber,
  levelChipColor,
  levelSortValue,
  listingCapacityStatus,
  monthlyStorePriceAmount,
  priceSortValue,
  termInMonths,
} from '../../lib/storeSubscriptionDisplay.js';

const SORT_COLUMNS = {
  sellerName: { label: 'Store', align: 'left' },
  freeListingsRemainingEst: { label: 'Free listings left', align: 'right' },
  quantityLimitRemaining: { label: 'Qty left', align: 'right' },
  amountLimitRemaining: { label: '$ left', align: 'right' },
  capacity: { label: 'Can list?', align: 'center' },
  subscriptionLevel: { label: 'Plan', align: 'left' },
  term: { label: 'Term', align: 'left' },
  price: { label: 'Price', align: 'right' },
};

function formatCurrency(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(num);
}

function formatNumber(num) {
  if (num === undefined || num === null || num === '') return '—';
  const n = Number(num);
  if (Number.isNaN(n)) return '—';
  return Math.trunc(n).toLocaleString();
}

function remainingPercent(remaining, total) {
  const rem = Number(remaining);
  const tot = Number(total);
  if (!Number.isFinite(rem) || !Number.isFinite(tot) || tot <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((rem / tot) * 100)));
}

function barColor(pct) {
  if (pct == null) return 'inherit';
  if (pct <= 0) return 'error';
  if (pct <= 10) return 'warning';
  return 'success';
}

function RemainingCell({ remaining, used, total, formatValue = formatNumber, hint }) {
  const pct = remainingPercent(remaining, total);
  const remLabel = formatValue(remaining);
  const sub =
    used != null && total != null
      ? `${formatValue(used)} used / ${formatValue(total)}`
      : total != null
        ? `of ${formatValue(total)}`
        : null;

  return (
    <Tooltip title={hint || ''} disableHoverListener={!hint}>
      <Box sx={{ minWidth: 110, ml: 'auto' }}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{
            fontVariantNumeric: 'tabular-nums',
            color: pct != null && pct <= 0 ? 'error.main' : pct != null && pct <= 10 ? 'warning.main' : 'text.primary',
          }}
        >
          {remLabel}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
            {sub}
          </Typography>
        )}
        {pct != null && (
          <LinearProgress
            variant="determinate"
            value={pct}
            color={barColor(pct)}
            sx={{ mt: 0.5, height: 4, borderRadius: 1 }}
          />
        )}
      </Box>
    </Tooltip>
  );
}

function compareNullableNumeric(a, b, dir) {
  const aMissing = a === null;
  const bMissing = b === null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return dir * (a - b);
}

function compareRows(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  const tieBreak = () => String(a.sellerName || '').localeCompare(
    String(b.sellerName || ''),
    undefined,
    { sensitivity: 'base' }
  );

  let cmp = 0;
  switch (sortBy) {
    case 'sellerName':
      cmp = String(a.sellerName || '').localeCompare(
        String(b.sellerName || ''),
        undefined,
        { sensitivity: 'base' }
      );
      break;
    case 'freeListingsRemainingEst': {
      const valA = a.freeListingsRemainingEst != null ? Number(a.freeListingsRemainingEst) : null;
      const valB = b.freeListingsRemainingEst != null ? Number(b.freeListingsRemainingEst) : null;
      cmp = compareNullableNumeric(valA, valB, dir);
      break;
    }
    case 'quantityLimitRemaining': {
      const valA = a.notConnected || a.privilegeError ? null : Number(a.quantityLimitRemaining);
      const valB = b.notConnected || b.privilegeError ? null : Number(b.quantityLimitRemaining);
      cmp = compareNullableNumeric(
        Number.isFinite(valA) ? valA : null,
        Number.isFinite(valB) ? valB : null,
        dir
      );
      break;
    }
    case 'amountLimitRemaining': {
      const valA = a.notConnected || a.privilegeError ? null : Number(a.amountLimitRemaining);
      const valB = b.notConnected || b.privilegeError ? null : Number(b.amountLimitRemaining);
      cmp = compareNullableNumeric(
        Number.isFinite(valA) ? valA : null,
        Number.isFinite(valB) ? valB : null,
        dir
      );
      break;
    }
    case 'capacity':
      cmp = listingCapacityStatus(a).severity - listingCapacityStatus(b).severity;
      if (cmp === 0) {
        cmp = listingCapacityStatus(a).label.localeCompare(listingCapacityStatus(b).label);
      }
      break;
    case 'subscriptionLevel':
      cmp = levelSortValue(a.subscriptionLevel) - levelSortValue(b.subscriptionLevel);
      if (cmp === 0) {
        cmp = String(a.subscriptionLevel || '').localeCompare(
          String(b.subscriptionLevel || ''),
          undefined,
          { sensitivity: 'base' }
        );
      }
      break;
    case 'term': {
      const termA = termInMonths(a.termValue, a.termUnit) ?? -1;
      const termB = termInMonths(b.termValue, b.termUnit) ?? -1;
      cmp = termA - termB;
      break;
    }
    case 'price':
      cmp = priceSortValue(a.subscriptionLevel, a.termValue, a.termUnit)
        - priceSortValue(b.subscriptionLevel, b.termValue, b.termUnit);
      break;
    default:
      cmp = 0;
  }

  if (cmp === 0 && sortBy !== 'sellerName') return tieBreak();
  if (sortBy === 'freeListingsRemainingEst' || sortBy === 'quantityLimitRemaining' || sortBy === 'amountLimitRemaining') {
    return cmp;
  }
  return dir * cmp;
}

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = SORT_COLUMNS[column];
  return (
    <TableCell align={meta.align} sx={{ fontWeight: 700 }}>
      <TableSortLabel
        active={sortBy === column}
        direction={sortBy === column ? sortOrder : 'asc'}
        onClick={() => onSort(column)}
      >
        {meta.label}
      </TableSortLabel>
    </TableCell>
  );
}

export default function StoreOverviewPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('capacity');
  const [sortOrder, setSortOrder] = useState('asc');
  const [notes, setNotes] = useState('');

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ebay/store-overview/all', {
        params: forceRefresh ? { refresh: '1' } : {},
      });

      if (!data.success) {
        setError(data.error || 'Failed to load store overview data');
        setRows([]);
        return;
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setNotes(data.notes?.freeListingsEstimate || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load store overview');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.sellerName,
        row.subscriptionLevel,
        listingCapacityStatus(row).label,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    const next = [...filteredRows];
    next.sort((a, b) => compareRows(a, b, sortBy, sortOrder));
    return next;
  }, [filteredRows, sortBy, sortOrder]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortOrder(column === 'capacity' ? 'asc' : 'asc');
  };

  const summary = useMemo(() => {
    let blocked = 0;
    let feeRisk = 0;
    let low = 0;
    let ok = 0;
    for (const row of rows) {
      const id = listingCapacityStatus(row).id;
      if (id === 'blocked') blocked += 1;
      else if (id === 'fee_risk') feeRisk += 1;
      else if (id === 'low') low += 1;
      else if (id === 'ok') ok += 1;
    }
    return { blocked, feeRisk, low, ok };
  }, [rows]);

  const billingKpi = useMemo(() => {
    const billableRows = rows.filter(
      (row) => row.subscriptionLevel
        && !row.notConnected
        && !row.privilegeError
        && !row.subscriptionError
        && !row.noPlan
    );

    let total = 0;
    let storeCount = 0;
    for (const row of billableRows) {
      const amount = monthlyStorePriceAmount(row.subscriptionLevel, row.termValue, row.termUnit);
      if (amount == null) continue;
      total += amount;
      storeCount += 1;
    }

    return { total, storeCount };
  }, [rows]);

  const formatUsdTotal = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1600, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 1.75 }, mb: 1.5 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1.5}
          alignItems={{ lg: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.2 }}>
              Store Limits Tracker
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
              Monthly remaining headroom per store. Selling qty/$ exhaust = cannot list.
              Free listing exhaust = can still list, but insertion fees apply (avoid).
            </Typography>
            {!loading && rows.length > 0 && (
              <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                <Chip label={`${rows.length} stores`} size="small" variant="outlined" />
                {summary.blocked > 0 && <Chip label={`${summary.blocked} blocked`} size="small" color="error" />}
                {summary.feeRisk > 0 && <Chip label={`${summary.feeRisk} fee risk`} size="small" color="warning" />}
                {summary.low > 0 && <Chip label={`${summary.low} low`} size="small" color="warning" variant="outlined" />}
                <Chip label={`${summary.ok} OK`} size="small" color="success" variant="outlined" />
              </Stack>
            )}
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ sm: 'center' }}
            sx={{ flexShrink: 0, width: { xs: '100%', lg: 'auto' } }}
          >
            {!loading && (
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  minWidth: 138,
                }}
              >
                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" lineHeight={1.2}>
                  Monthly total
                </Typography>
                <Typography variant="h6" fontWeight={800} lineHeight={1.25}>
                  {formatUsdTotal(billingKpi.total)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                  {billingKpi.storeCount} priced store{billingKpi.storeCount === 1 ? '' : 's'}
                </Typography>
              </Box>
            )}
            <TextField
              size="small"
              placeholder="Search store or plan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ width: { xs: '100%', sm: 240 } }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              onClick={() => fetchData(true)}
              disabled={loading}
              sx={{ whiteSpace: 'nowrap', px: 2 }}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 1.5, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}>
        <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
          {notes || (
            <>
              Free listings used ≈ new + renew (EndTime already rolled to next month) + ended (started this
              month then ended, or renewed this month then ended). Early end before renew is not counted. Sync Store
              Listings so ended inserts are stored. Qty/$ left is live from eBay.
            </>
          )}
        </Typography>
      </Alert>

      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table
            size="small"
            stickyHeader
            sx={{
              '& .MuiTableCell-root': { py: 0.9 },
              '& .MuiTableCell-head': { py: 1 },
            }}
          >
            <TableHead>
              <TableRow>
                {Object.keys(SORT_COLUMNS).map((column) => (
                  <SortableHeader
                    key={column}
                    column={column}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading monthly limits…
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No stores found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row) => {
                  const capacity = listingCapacityStatus(row);
                  const freeAllowance = row.freeListingsAllowance ?? freeListingsAllowanceNumber(row.subscriptionLevel);
                  return (
                    <TableRow key={row.sellerId} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.sellerName}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <RemainingCell
                          remaining={row.freeListingsRemainingEst}
                          used={row.freeListingsUsedEst}
                          total={freeAllowance}
                          hint={
                            [
                              'Estimate (eBay has no free-insert remaining API).',
                              `Used = new + renew (active) + ended.`,
                              `Ended includes started-this-month then ended, and renew-then-ended (${formatNumber(row.freeListingsEndedStartedThisMonth || 0)}).`,
                              'Early end before renew day is excluded. Sync Store Listings to refresh ended inserts.',
                            ].join(' ')
                          }
                        />
                        {(row.freeListingsEndedStartedThisMonth > 0 || row.activeListingsCount != null) && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            sx={{ fontSize: '0.62rem', lineHeight: 1.2, mt: 0.25 }}
                          >
                            {formatNumber(row.activeListingsCount)} active
                            {row.freeListingsEndedStartedThisMonth > 0
                              ? ` + ${formatNumber(row.freeListingsEndedStartedThisMonth)} ended`
                              : ''}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <RemainingCell
                          remaining={row.notConnected || row.privilegeError ? null : row.quantityLimitRemaining}
                          used={row.quantityUsed}
                          total={row.accountLimitQuantity}
                          hint="Hard stop: when qty left hits 0 you cannot list for the month."
                        />
                      </TableCell>
                      <TableCell align="right">
                        <RemainingCell
                          remaining={row.notConnected || row.privilegeError ? null : row.amountLimitRemaining}
                          used={row.amountUsed}
                          total={row.accountLimitAmount}
                          formatValue={(v) => formatCurrency(v, row.amountLimitCurrency || row.accountLimitCurrency)}
                          hint="Hard stop: when $ left hits 0 you cannot list for the month."
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={capacity.label} color={capacity.color} />
                      </TableCell>
                      <TableCell>
                        {row.subscriptionLevel ? (
                          <Chip
                            size="small"
                            label={row.subscriptionLevel}
                            color={levelChipColor(row.subscriptionLevel)}
                          />
                        ) : '—'}
                      </TableCell>
                      <TableCell>{formatTerm(row.termValue, row.termUnit)}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatStoreSubscriptionPrice(row.subscriptionLevel, row.termValue, row.termUnit)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
