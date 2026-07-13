import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  Grid,
  IconButton,
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
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import {
  formatFeeTypeDisplay,
  transactionTypeLabel,
} from '../../utils/ebayTransactionTypes.js';
import {
  buildFinancesOrderIdIndexes,
  resolveFinancesOrderId,
  resolveFinancesDisplayFeeAmount,
  isPromotedListingsFinancesTransaction,
} from '../../utils/ebayFinances.js';
import { ALL_MARKETPLACES_VALUE } from '../../lib/marketingConstants.js';
import {
  PT_TIMEZONE,
  formatYyyyMmDdPt,
  getPTDayBoundsUTC,
  getTodayPtDateString,
} from '../../lib/pacificDate.js';

const ALL_STORES_VALUE = '__all__';
const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];
const PAGE_SIZES = [25, 50, 100];

const BOOKING_COLORS = {
  CREDIT: 'success',
  DEBIT: 'error',
};

function buildDefaultPtDateRange() {
  const to = getTodayPtDateString();
  const anchor = new Date(`${to}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() - 30);
  return { from: formatYyyyMmDdPt(anchor), to };
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    timeZone: PT_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatFilterDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const { start } = getPTDayBoundsUTC(value);
    return start.toLocaleDateString('en-US', {
      timeZone: PT_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    timeZone: PT_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(value, currency = 'USD', { colorNegative = false } = {}) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  try {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
    if (colorNegative && num < 0) {
      return <Box component="span" sx={{ color: 'error.main' }}>{formatted}</Box>;
    }
    return formatted;
  } catch {
    return `${num} ${currency}`;
  }
}

function formatPayoutAmountObject(amount) {
  if (!amount || amount.value == null || amount.value === '') return '—';
  const value = Math.abs(Number(amount.value));
  if (Number.isNaN(value)) return String(amount.value);
  const currency = amount.currency || 'USD';
  try {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    return (
      <Box component="span" sx={{ color: 'success.main' }}>{formatted}</Box>
    );
  } catch {
    return `${value} ${currency}`;
  }
}

function formatAmountObject(amount, bookingEntry) {
  if (!amount || amount.value == null || amount.value === '') return '—';
  let value = Number(amount.value);
  if (Number.isNaN(value)) return String(amount.value);
  const entry = String(bookingEntry || '').toUpperCase();
  if (entry === 'DEBIT') value = -Math.abs(value);
  const currency = amount.currency || 'USD';
  const isNegative = value < 0;
  try {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    return (
      <Box component="span" sx={isNegative ? { color: 'error.main' } : undefined}>
        {formatted}
      </Box>
    );
  } catch {
    return `${value} ${currency}`;
  }
}

function formatFeeAmountObject(amount, bookingEntry, { promotedListings = false } = {}) {
  if (!amount || amount.value == null || amount.value === '') return '—';
  let value = Math.abs(Number(amount.value));
  if (Number.isNaN(value)) return String(amount.value);
  const entry = String(bookingEntry || '').toUpperCase();
  if (promotedListings) {
    if (entry === 'DEBIT') value = -value;
  } else if (entry === 'CREDIT') {
    value = -value;
  }
  const currency = amount.currency || 'USD';
  const isNegative = value < 0;
  try {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    return (
      <Box component="span" sx={isNegative ? { color: 'error.main' } : undefined}>
        {formatted}
      </Box>
    );
  } catch {
    return `${value} ${currency}`;
  }
}

function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

function payoutStatusLabel(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'INITIATED') return 'Scheduled';
  if (s === 'SUCCEEDED') return 'Paid out';
  return status || '—';
}

function isFinancesWithdrawalTransaction(txn) {
  return Boolean(txn?._isPayoutRow)
    || String(txn?.transactionType || '').toUpperCase() === 'WITHDRAWAL';
}

function financesGroupTransactionCount(group) {
  if (Array.isArray(group?.transactions) && group.transactions.length > 0) {
    return group.transactions.filter((txn) => !isFinancesWithdrawalTransaction(txn)).length;
  }
  return group?.transactionCount;
}

function PayoutGroupRow({ group, expanded, onToggle, showStore, detailLoading }) {
  const displayTransactions = useMemo(
    () => (group.transactions || []).filter((txn) => !isFinancesWithdrawalTransaction(txn)),
    [group.transactions],
  );
  const orderIdIndexes = useMemo(
    () => buildFinancesOrderIdIndexes(displayTransactions),
    [displayTransactions],
  );
  const label = group.pendingPayout
    ? 'Pending payout — transactions not yet assigned to a payout batch'
    : `Payout ${group.payoutId}`;
  const txnCountDisplay = (() => {
    const count = financesGroupTransactionCount(group);
    return count == null ? '—' : count;
  })();

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: expanded ? 'unset' : undefined } }}>
        <TableCell>
          <IconButton size="small" onClick={onToggle} aria-label="expand payout group">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        {showStore ? (
          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
            {group.sellerName || '—'}
          </TableCell>
        ) : null}
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {group.pendingPayout ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Not assigned yet
            </Typography>
          ) : (group.payoutId || '—')}
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(group.payoutDate)}</TableCell>
        <TableCell>
          {group.pendingPayout ? (
            <Chip size="small" label="Accumulating" variant="outlined" />
          ) : group.payoutStatus ? (
            <Chip size="small" label={payoutStatusLabel(group.payoutStatus)} variant="outlined" />
          ) : '—'}
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {group.payoutAmount
            ? formatPayoutAmountObject(group.payoutAmount)
            : '—'}
        </TableCell>
        <TableCell align="center">{txnCountDisplay}</TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(group.totalAmount, group.currency, { colorNegative: true })}
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(group.totalFees, group.currency)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={showStore ? 9 : 8} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6, pr: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{label}</Typography>
              {detailLoading ? (
                <Typography variant="body2" color="text.secondary">Loading transactions…</Typography>
              ) : displayTransactions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No transactions for this payout.</Typography>
              ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date (PT)</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Entry</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Net</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Fees</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Memo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayTransactions.map((txn) => {
                    const orderId = resolveFinancesOrderId(txn, orderIdIndexes);
                    return (
                      <TableRow key={txn.transactionId || `${orderId}-${txn.transactionDate}`}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(txn.transactionDate)}</TableCell>
                        <TableCell>{transactionTypeLabel(txn.transactionType) || txn.transactionType || '—'}</TableCell>
                        <TableCell>
                          {txn.bookingEntry ? (
                            <Chip
                              size="small"
                              label={txn.bookingEntry}
                              color={BOOKING_COLORS[txn.bookingEntry] || 'default'}
                            />
                          ) : '—'}
                        </TableCell>
                        <TableCell align="right">{formatAmountObject(txn.amount, txn.bookingEntry)}</TableCell>
                        <TableCell align="right">
                          {formatFeeAmountObject(
                            resolveFinancesDisplayFeeAmount(txn),
                            txn.bookingEntry,
                            { promotedListings: isPromotedListingsFinancesTransaction(txn) },
                          )}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{orderId || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', maxWidth: 280 }}>
                          {txn.transactionMemo || formatFeeTypeDisplay(txn.feeType) || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function FinancesPayoutGroupsPage() {
  const defaultPtRange = useMemo(() => buildDefaultPtDateRange(), []);

  const { sellers, loading: sellersLoading } = useEbayConnectedSellers();
  const [sellerId, setSellerId] = useState(ALL_STORES_VALUE);
  const [marketplace, setMarketplace] = useState(ALL_MARKETPLACES_VALUE);
  const [fromDate, setFromDate] = useState(defaultPtRange.from);
  const [toDate, setToDate] = useState(defaultPtRange.to);
  const [payoutIdFilter, setPayoutIdFilter] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [offset, setOffset] = useState(0);

  const [groups, setGroups] = useState([]);
  const [storeErrors, setStoreErrors] = useState([]);
  const [sourceMarketplace, setSourceMarketplace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [expandedKey, setExpandedKey] = useState('');
  const [detailLoadingKey, setDetailLoadingKey] = useState('');
  const [cacheMeta, setCacheMeta] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const isAllStores = sellerId === ALL_STORES_VALUE;

  const rowKeyFor = useCallback((group) => (
    `${group.sellerId || 'one'}-${group.groupKey || group.payoutId || 'pending'}`
  ), []);

  const handleToggleGroup = useCallback(async (group) => {
    const rowKey = rowKeyFor(group);
    if (expandedKey === rowKey) {
      setExpandedKey('');
      return;
    }
    setExpandedKey(rowKey);

    if (group.transactions?.length > 0 || group.pendingPayout || !group.payoutId || !group.sellerId) {
      return;
    }

    setDetailLoadingKey(rowKey);
    try {
      const { data } = await api.get('/ebay/finances/transactions/by-payout/detail', {
        params: {
          sellerId: group.sellerId,
          payoutId: group.payoutId,
          marketplace,
        },
        timeout: 120000,
      });
      if (data.success && data.group) {
        setGroups((prev) => prev.map((g) => (
          rowKeyFor(g) === rowKey ? { ...data.group, sellerId: g.sellerId, sellerName: g.sellerName } : g
        )));
      }
    } catch (err) {
      setError(parseApiError(err, 'Failed to load payout transactions'));
    } finally {
      setDetailLoadingKey('');
    }
  }, [expandedKey, marketplace, rowKeyFor]);

  useEffect(() => {
    if (sellers.length === 0) return;
    setSellerId((prev) => prev || ALL_STORES_VALUE);
  }, [sellers.length]);

  const selectedSellerName = useMemo(() => {
    if (isAllStores) return 'All stores';
    return sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '';
  }, [isAllStores, sellers, sellerId]);

  const sharedParams = useMemo(() => {
    const params = {
      marketplace,
      fromDate: getPTDayBoundsUTC(fromDate).start.toISOString(),
      toDate: getPTDayBoundsUTC(toDate).end.toISOString(),
    };
    if (payoutIdFilter.trim()) params.payoutId = payoutIdFilter.trim();
    return params;
  }, [marketplace, fromDate, toDate, payoutIdFilter]);

  const loadGroups = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const endpoint = isAllStores
        ? '/ebay/finances/transactions/by-payout/all'
        : '/ebay/finances/transactions/by-payout';
      const params = isAllStores
        ? sharedParams
        : { ...sharedParams, sellerId };
      const { data } = await api.get(endpoint, { params, timeout: 30000 });
      if (!data.success) throw new Error(data.error || 'Failed to load payout groups');
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setSourceMarketplace(data.marketplaceId || '');
      setStoreErrors(Array.isArray(data.errors) ? data.errors : []);
      setCacheMeta(data.cache || null);
      setExpandedKey('');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load payout groups'));
      setGroups([]);
      setStoreErrors([]);
      setCacheMeta(null);
    } finally {
      setLoading(false);
    }
  }, [sellerId, isAllStores, sharedParams]);

  const refreshFromEbay = useCallback(async () => {
    if (!sellerId) return;
    setRefreshing(true);
    setError('');
    setStoreErrors([]);
    try {
      const endpoint = isAllStores
        ? '/ebay/finances/transactions/by-payout/all'
        : '/ebay/finances/transactions/by-payout';
      const params = {
        ...(isAllStores ? sharedParams : { ...sharedParams, sellerId }),
        forceRefresh: 'true',
      };
      const { data } = await api.get(endpoint, {
        params,
        timeout: isAllStores ? 300000 : 180000,
      });
      if (!data.success) throw new Error(data.error || 'Failed to refresh from eBay');
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setSourceMarketplace(data.marketplaceId || '');
      setStoreErrors(Array.isArray(data.errors) ? data.errors : []);
      setCacheMeta(data.cache || null);
      setExpandedKey('');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to refresh from eBay'));
    } finally {
      setRefreshing(false);
    }
  }, [sellerId, isAllStores, sharedParams]);

  useEffect(() => {
    if (!sellerId || sellersLoading) return;
    void loadGroups();
  }, [sellerId, sellersLoading, sharedParams, loadGroups]);

  const displayGroups = useMemo(() => groups.slice(offset, offset + pageSize), [groups, offset, pageSize]);

  const pageStart = displayGroups.length === 0 ? 0 : offset + 1;
  const pageEnd = offset + displayGroups.length;
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < groups.length;

  const resetFilters = () => {
    setFromDate(defaultPtRange.from);
    setToDate(defaultPtRange.to);
    setPayoutIdFilter('');
    setPageSize(25);
    setOffset(0);
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Finances by payout</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Transactions grouped by payout ID —{' '}
            <Link component={RouterLink} to="/admin/finances/transactions">View all transactions</Link>
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => void refreshFromEbay()}
          disabled={refreshing || loading || !sellerId || sellers.length === 0}
        >
          {refreshing ? 'Refreshing from eBay…' : 'Refresh from eBay'}
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Store</InputLabel>
              <Select
                label="Store"
                value={sellerId}
                onChange={(e) => { setSellerId(e.target.value); setOffset(0); }}
                disabled={sellersLoading || sellers.length === 0}
              >
                <MenuItem value={ALL_STORES_VALUE}>All stores</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.user?.email || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Marketplace</InputLabel>
              <Select label="Marketplace" value={marketplace} onChange={(e) => { setMarketplace(e.target.value); setOffset(0); }}>
                <MenuItem value={ALL_MARKETPLACES_VALUE}>All Marketplaces</MenuItem>
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="From (PT)"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
              InputLabelProps={{ shrink: true }}
              helperText="Pacific Time"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="To (PT)"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
              InputLabelProps={{ shrink: true }}
              helperText="Pacific Time"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Payout ID"
              value={payoutIdFilter}
              onChange={(e) => setPayoutIdFilter(e.target.value)}
              placeholder="Optional"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Page size</InputLabel>
              <Select label="Page size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}>
                {PAGE_SIZES.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1} sx={{ height: '100%', alignItems: 'center' }}>
              <Button variant="outlined" onClick={() => { setOffset(0); void loadGroups(); }} disabled={loading || refreshing || !sellerId}>
                Apply
              </Button>
              <Button variant="text" onClick={resetFilters} disabled={loading}>Reset</Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {isAllStores ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Page loads from saved data. Use Refresh from eBay to update. All stores shows summaries only — expand a row to load transactions (saved after first load).
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          Page loads from saved data. Use Refresh from eBay to fetch the latest payouts and transactions from eBay.
        </Alert>
      )}

      {!loading && loaded && !cacheMeta?.cachedAt && groups.length === 0 && !error ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No saved payout data yet. Click Refresh from eBay to load and save data for this store{isAllStores ? 's' : ''}.
        </Alert>
      ) : null}

      {storeErrors.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {storeErrors.length} store(s) failed to load: {storeErrors.map((e) => e.sellerName || e.sellerId).join(', ')}
        </Alert>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading && !loaded && !error ? (
        <GrowMentalityLoader label="Loading payout groups…" minHeight={360} />
      ) : (
        <>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip label={`Showing ${pageStart}–${pageEnd} of ${groups.length} payout groups`} variant="outlined" />
            {sourceMarketplace ? (
              <Chip
                size="small"
                label={sourceMarketplace === ALL_MARKETPLACES_VALUE || sourceMarketplace === 'ALL'
                  ? 'All Marketplaces'
                  : sourceMarketplace}
                variant="outlined"
              />
            ) : null}
            {selectedSellerName ? <Chip size="small" label={selectedSellerName} variant="outlined" /> : null}
            <Chip size="small" label={`${formatFilterDate(fromDate)} – ${formatFilterDate(toDate)}`} variant="outlined" />
            {cacheMeta?.cachedAt ? (
              <Chip
                size="small"
                label={`Saved ${formatDate(cacheMeta.cachedAt)}`}
                variant="outlined"
                color="success"
              />
            ) : null}
          </Stack>

          <Paper variant="outlined">
            <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48, bgcolor: 'background.paper' }} />
                    {isAllStores ? (
                      <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>Store</TableCell>
                    ) : null}
                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>Payout ID</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>Payout date (PT)</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Payout amount</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Txns</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Net total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Total fees</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAllStores ? 9 : 8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No payout groups in this date range.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayGroups.map((group) => {
                      const rowKey = rowKeyFor(group);
                      return (
                        <PayoutGroupRow
                          key={rowKey}
                          group={group}
                          expanded={expandedKey === rowKey}
                          onToggle={() => void handleToggleGroup(group)}
                          showStore={isAllStores}
                          detailLoading={detailLoadingKey === rowKey}
                        />
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
            <IconButton disabled={!hasPrev || loading} onClick={() => setOffset((o) => Math.max(0, o - pageSize))}>
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="body2">
              Page {Math.floor(offset / pageSize) + 1} of {Math.max(1, Math.ceil(groups.length / pageSize))}
            </Typography>
            <IconButton disabled={!hasNext || loading} onClick={() => setOffset((o) => o + pageSize)}>
              <ChevronRightIcon />
            </IconButton>
          </Stack>
        </>
      )}
    </Box>
  );
}
