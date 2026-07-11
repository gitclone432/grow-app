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
  TableSortLabel,
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
import MarketingCollapsibleFilters from '../../components/marketing/MarketingCollapsibleFilters.jsx';
import ColumnSelector from '../../components/ColumnSelector.jsx';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import {
  TRANSACTION_STATUS_DOCS,
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTION_TYPE_DOCS,
  TRANSACTION_TYPE_OPTIONS,
  FEE_TYPE_DOCS,
  FEE_TYPE_OPTIONS,
  feeTypeLabel,
  formatFeeTypeDisplay,
  transactionStatusDescription,
  transactionStatusLabel,
  transactionTypeDescription,
  transactionTypeLabel,
} from '../../utils/ebayTransactionTypes.js';
import {
  buildFinancesOrderIdIndexes,
  collectTransactionFeeTypes,
  compareFinancesTransactionRows,
  isStoreSubscriptionFeeFilter,
  resolveFinancesItemId,
  resolveFinancesOrderId,
} from '../../utils/ebayFinances.js';
import {
  FINANCES_TRANSACTION_TABLE_COLUMNS,
  MARKETING_TABLE_COLUMN_STORAGE_KEYS,
  countMarketingTableColumns,
  defaultVisibleColumnIds,
  filterVisibleColumnsForSelector,
  getMarketingColumnOptions,
  isMarketingColumnVisible,
  loadMarketingVisibleColumns,
} from '../../lib/marketingTableColumns.js';
import { ALL_MARKETPLACES_VALUE } from '../../lib/marketingConstants.js';
import {
  PT_TIMEZONE,
  formatYyyyMmDdPt,
  getPTDayBoundsUTC,
  getTodayPtDateString,
} from '../../lib/pacificDate.js';

const DEFAULT_VISIBLE_COLUMNS = defaultVisibleColumnIds(FINANCES_TRANSACTION_TABLE_COLUMNS);

const SORT_COLUMNS = Object.fromEntries(
  FINANCES_TRANSACTION_TABLE_COLUMNS.map((col) => [
    col.id,
    {
      label: col.label,
      align: ['amount', 'totalFeeAmount'].includes(col.id) ? 'right' : 'left',
    },
  ]),
);

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = SORT_COLUMNS[column];
  if (!meta) return null;
  return (
    <TableCell
      align={meta.align}
      sx={{
        fontWeight: 700,
        bgcolor: 'background.paper',
        whiteSpace: 'nowrap',
      }}
    >
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

const EBAY_DOCS =
  'https://developer.ebay.com/develop/api/sell/finances_api#sell-finances_api-transaction-gettransactions';

const ALL_STORES_VALUE = '__all__';
const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];
const PAGE_SIZES = [25, 50, 100, 200];
const ALL_STORES_PER_SELLER_LIMIT = 50;

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

function formatCurrencyAmount(amount, valueTransform) {
  if (!amount || amount.value == null || amount.value === '') return '—';
  let value = Number(amount.value);
  if (Number.isNaN(value)) return String(amount.value);
  value = valueTransform(value);
  const currency = amount.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function formatMoney(amount, { bookingEntry } = {}) {
  const entry = String(bookingEntry || '').toUpperCase();
  return formatCurrencyAmount(amount, (value) => (
    entry === 'DEBIT' ? -Math.abs(value) : value
  ));
}

function formatFeeMoney(amount, bookingEntry) {
  const entry = String(bookingEntry || '').toUpperCase();
  return formatCurrencyAmount(amount, (value) => {
    if (entry === 'CREDIT') return -Math.abs(value);
    if (entry === 'DEBIT') return Math.abs(value);
    return value;
  });
}

function amountCellSx(bookingEntry, { bold = false } = {}) {
  const isDebit = String(bookingEntry || '').toUpperCase() === 'DEBIT';
  return {
    fontVariantNumeric: 'tabular-nums',
    ...(bold ? { fontWeight: 600 } : {}),
    ...(isDebit ? { color: 'error.main' } : {}),
  };
}

function feeCellSx(bookingEntry) {
  const isCredit = String(bookingEntry || '').toUpperCase() === 'CREDIT';
  return {
    fontVariantNumeric: 'tabular-nums',
    ...(isCredit ? { color: 'error.main' } : {}),
  };
}

function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

function collectFees(txn) {
  const fees = [];
  for (const line of txn?.orderLineItems || []) {
    for (const fee of line?.marketplaceFees || []) {
      fees.push({
        key: `${line.lineItemId || 'line'}-${fee.feeType || 'fee'}`,
        lineItemId: line.lineItemId,
        feeType: fee.feeType,
        amount: fee.amount,
      });
    }
  }
  if (txn?.feeType && txn?.amount) {
    fees.push({
      key: `txn-${txn.feeType}`,
      lineItemId: '—',
      feeType: txn.feeType,
      amount: txn.amount,
    });
  }
  return fees;
}

function formatTransactionFeeTypeSummary(txn) {
  const types = [...collectTransactionFeeTypes(txn)].sort();
  if (!types.length) return '—';
  if (types.length === 1) return formatFeeTypeDisplay(types[0]);
  return `${formatFeeTypeDisplay(types[0])} (+${types.length - 1})`;
}

function TransactionRow({ txn, expanded, onToggle, orderIdIndexes, showColumn, tableColSpan }) {
  const fees = collectFees(txn);
  const orderId = resolveFinancesOrderId(txn, orderIdIndexes);
  const itemId = resolveFinancesItemId(txn);

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: expanded ? 'unset' : undefined } }}>
        <TableCell>
          {fees.length > 0 || txn.transactionMemo ? (
            <IconButton size="small" onClick={onToggle} aria-label="expand details">
              {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
          ) : null}
        </TableCell>
        {showColumn('sellerName') ? (
          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
            {txn.sellerName || '—'}
          </TableCell>
        ) : null}
        {showColumn('transactionDate') ? (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(txn.transactionDate)}</TableCell>
        ) : null}
        {showColumn('transactionType') ? (
          <TableCell>
            <Chip size="small" label={txn.transactionType || '—'} variant="outlined" />
          </TableCell>
        ) : null}
        {showColumn('transactionStatus') ? (
          <TableCell>
            <Chip size="small" label={txn.transactionStatus || '—'} variant="outlined" />
          </TableCell>
        ) : null}
        {showColumn('bookingEntry') ? (
          <TableCell>
            {txn.bookingEntry ? (
              <Chip
                size="small"
                label={txn.bookingEntry}
                color={BOOKING_COLORS[txn.bookingEntry] || 'default'}
              />
            ) : '—'}
          </TableCell>
        ) : null}
        {showColumn('amount') ? (
          <TableCell align="right" sx={amountCellSx(txn.bookingEntry, { bold: true })}>
            {formatMoney(txn.amount, { bookingEntry: txn.bookingEntry })}
          </TableCell>
        ) : null}
        {showColumn('totalFeeAmount') ? (
          <TableCell align="right" sx={feeCellSx(txn.bookingEntry)}>
            {formatFeeMoney(txn.totalFeeAmount, txn.bookingEntry)}
          </TableCell>
        ) : null}
        {showColumn('feeType') ? (
          <TableCell sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {formatTransactionFeeTypeSummary(txn)}
          </TableCell>
        ) : null}
        {showColumn('orderId') ? (
          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {orderId || '—'}
          </TableCell>
        ) : null}
        {showColumn('buyerUsername') ? (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.buyer?.username || '—'}</TableCell>
        ) : null}
        {showColumn('payoutId') ? (
          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {txn.payoutId || '—'}
          </TableCell>
        ) : null}
      </TableRow>
      <TableRow>
        <TableCell colSpan={tableColSpan} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6, pr: 2 }}>
              {txn.transactionMemo ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Memo:</strong> {txn.transactionMemo}
                </Typography>
              ) : null}
              {txn.transactionId ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Transaction ID: {txn.transactionId}
                </Typography>
              ) : null}
              {orderId ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Order ID: {orderId}
                </Typography>
              ) : null}
              {!orderId && itemId ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Item ID: {itemId}
                </Typography>
              ) : null}
              {fees.length > 0 ? (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Fees</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Line item</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Fee type</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fees.map((fee) => (
                        <TableRow key={fee.key}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{fee.lineItemId}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{formatFeeTypeDisplay(fee.feeType)}</TableCell>
                          <TableCell align="right" sx={feeCellSx(txn.bookingEntry)}>
                            {formatFeeMoney(fee.amount, txn.bookingEntry)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">No fee breakdown on this transaction.</Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function FinancesTransactionsPage() {
  const defaultPtRange = useMemo(() => buildDefaultPtDateRange(), []);

  const { sellers, loading: sellersLoading } = useEbayConnectedSellers();
  const [sellerId, setSellerId] = useState(ALL_STORES_VALUE);
  const [marketplace, setMarketplace] = useState(ALL_MARKETPLACES_VALUE);
  const [transactionStatus, setTransactionStatus] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [feeType, setFeeType] = useState('');
  const [fromDate, setFromDate] = useState(defaultPtRange.from);
  const [toDate, setToDate] = useState(defaultPtRange.to);
  const [orderId, setOrderId] = useState('');
  const [payoutId, setPayoutId] = useState('');
  const [buyerUsername, setBuyerUsername] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [storeErrors, setStoreErrors] = useState([]);
  const [total, setTotal] = useState(null);
  const [sourceMarketplace, setSourceMarketplace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [sortBy, setSortBy] = useState('transactionDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [visibleColumns, setVisibleColumns] = useState(() => (
    loadMarketingVisibleColumns(
      MARKETING_TABLE_COLUMN_STORAGE_KEYS.financesTransactions,
      FINANCES_TRANSACTION_TABLE_COLUMNS,
    )
  ));

  const isAllStores = sellerId === ALL_STORES_VALUE;

  useEffect(() => {
    localStorage.setItem(
      MARKETING_TABLE_COLUMN_STORAGE_KEYS.financesTransactions,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

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
    if (transactionStatus) params.transactionStatus = transactionStatus;
    if (transactionType) params.transactionType = transactionType;
    if (feeType) params.feeType = feeType;
    if (orderId.trim()) params.orderId = orderId.trim();
    if (payoutId.trim()) params.payoutId = payoutId.trim();
    if (buyerUsername.trim()) params.buyerUsername = buyerUsername.trim();
    if (transactionId.trim()) params.transactionId = transactionId.trim();
    return params;
  }, [
    marketplace,
    fromDate,
    toDate,
    transactionStatus,
    transactionType,
    feeType,
    orderId,
    payoutId,
    buyerUsername,
    transactionId,
  ]);

  const loadAllStoresTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/finances/transactions/all', {
        params: {
          ...sharedParams,
          perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
        },
        timeout: 120000,
      });
      if (!data.success) throw new Error(data.error || 'Failed to load transactions');
      const merged = Array.isArray(data.transactions) ? data.transactions : [];
      setAllRows(merged);
      setRows([]);
      setTotal(merged.length);
      setSourceMarketplace(data.marketplaceId || '');
      setStoreErrors(Array.isArray(data.errors) ? data.errors : []);
      setExpandedId('');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load transactions'));
      setAllRows([]);
      setRows([]);
      setTotal(null);
      setStoreErrors([]);
    } finally {
      setLoading(false);
    }
  }, [sharedParams]);

  const loadSingleSellerTransactions = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/finances/transactions', {
        params: {
          ...sharedParams,
          sellerId,
          limit: pageSize,
          offset,
        },
        timeout: 90000,
      });
      if (!data.success) throw new Error(data.error || 'Failed to load transactions');
      setAllRows([]);
      setRows(Array.isArray(data.transactions) ? data.transactions : []);
      setTotal(data.total ?? null);
      setSourceMarketplace(data.marketplaceId || '');
      setExpandedId('');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load transactions'));
      setRows([]);
      setAllRows([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }, [sellerId, sharedParams, pageSize, offset]);

  const loadTransactions = useCallback(() => {
    if (!sellerId) return Promise.resolve();
    return isAllStores ? loadAllStoresTransactions() : loadSingleSellerTransactions();
  }, [sellerId, isAllStores, loadAllStoresTransactions, loadSingleSellerTransactions]);

  useEffect(() => {
    if (!sellerId || sellersLoading) return;
    void loadTransactions();
  }, [sellerId, sellersLoading, isAllStores, sharedParams, pageSize, offset, loadTransactions]);

  const orderIdIndexes = useMemo(
    () => buildFinancesOrderIdIndexes(isAllStores ? allRows : rows),
    [isAllStores, allRows, rows],
  );

  const sortedRows = useMemo(() => {
    const source = isAllStores ? allRows : rows;
    const resolveOrder = (txn) => resolveFinancesOrderId(txn, orderIdIndexes);
    return [...source].sort((a, b) => compareFinancesTransactionRows(
      a,
      b,
      sortBy,
      sortOrder,
      resolveOrder,
    ));
  }, [isAllStores, allRows, rows, sortBy, sortOrder, orderIdIndexes]);

  const displayRows = useMemo(() => {
    if (isAllStores) return sortedRows.slice(offset, offset + pageSize);
    return sortedRows;
  }, [isAllStores, sortedRows, offset, pageSize]);

  const handleSort = (column) => {
    setOffset(0);
    if (sortBy === column) {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'transactionDate' ? 'desc' : 'asc');
    }
  };

  const resetFilters = () => {
    setTransactionStatus('');
    setTransactionType('');
    setFeeType('');
    setFromDate(defaultPtRange.from);
    setToDate(defaultPtRange.to);
    setOrderId('');
    setPayoutId('');
    setBuyerUsername('');
    setTransactionId('');
    setPageSize(50);
    setOffset(0);
  };

  const pageStart = displayRows.length === 0 ? 0 : offset + 1;
  const pageEnd = offset + displayRows.length;
  const hasPrev = offset > 0;
  const hasNext = isAllStores
    ? offset + pageSize < allRows.length
    : displayRows.length >= pageSize;
  const pageCount = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const statusHint = transactionStatus ? transactionStatusDescription(transactionStatus) : '';
  const typeHint = transactionType ? transactionTypeDescription(transactionType) : '';
  const displayOrderIdIndexes = useMemo(
    () => buildFinancesOrderIdIndexes(displayRows),
    [displayRows],
  );

  const showColumn = useCallback(
    (columnId) => isMarketingColumnVisible(visibleColumns, columnId, isAllStores),
    [visibleColumns, isAllStores],
  );

  const tableColSpan = useMemo(
    () => countMarketingTableColumns(visibleColumns, isAllStores, { leadingCols: 1 }),
    [visibleColumns, isAllStores],
  );

  const columnOptions = useMemo(
    () => getMarketingColumnOptions(FINANCES_TRANSACTION_TABLE_COLUMNS, isAllStores),
    [isAllStores],
  );

  const appliedFilterChips = useMemo(() => {
    const chips = [
      { key: 'dates', label: `${formatFilterDate(fromDate)} – ${formatFilterDate(toDate)}` },
    ];
    if (transactionStatus) {
      chips.push({ key: 'status', label: transactionStatusLabel(transactionStatus) });
    }
    if (transactionType) {
      chips.push({ key: 'type', label: transactionTypeLabel(transactionType) });
    }
    if (feeType) {
      chips.push({ key: 'feeType', label: formatFeeTypeDisplay(feeType) });
    }
    if (orderId.trim()) chips.push({ key: 'orderId', label: `Order ${orderId.trim()}` });
    if (payoutId.trim()) chips.push({ key: 'payoutId', label: `Payout ${payoutId.trim()}` });
    if (buyerUsername.trim()) chips.push({ key: 'buyer', label: `Buyer ${buyerUsername.trim()}` });
    if (transactionId.trim()) chips.push({ key: 'transactionId', label: `Txn ${transactionId.trim()}` });
    return chips;
  }, [
    fromDate,
    toDate,
    transactionStatus,
    transactionType,
    feeType,
    orderId,
    payoutId,
    buyerUsername,
    transactionId,
  ]);

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
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Finances transactions</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Individual monetary transactions from eBay Finances —{' '}
            <Link component={RouterLink} to="/admin/finances/transactions-by-payout">Group by payout</Link>
            {' · '}
            <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
            {' · '}
            <Link href={TRANSACTION_TYPE_DOCS} target="_blank" rel="noopener noreferrer">TransactionTypeEnum</Link>
            {' · '}
            <Link href={TRANSACTION_STATUS_DOCS} target="_blank" rel="noopener noreferrer">TransactionStatusEnum</Link>
            {' · '}
            <Link href={FEE_TYPE_DOCS} target="_blank" rel="noopener noreferrer">FeeTypeEnum</Link>
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => void loadTransactions()}
          disabled={loading || !sellerId || sellers.length === 0}
        >
          {loading ? 'Loading…' : 'Refresh from eBay'}
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
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
          <Grid item xs={12} sm={6} md={4}>
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
        </Grid>
      </Paper>

      <MarketingCollapsibleFilters title="Transaction filters">
        <Grid container spacing={2} alignItems="center" sx={{ pt: 1 }}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Transaction status</InputLabel>
              <Select label="Transaction status" value={transactionStatus} onChange={(e) => { setTransactionStatus(e.target.value); setOffset(0); }}>
                <MenuItem value="">All statuses</MenuItem>
                {TRANSACTION_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Transaction type</InputLabel>
              <Select label="Transaction type" value={transactionType} onChange={(e) => { setTransactionType(e.target.value); setOffset(0); }}>
                {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || '__all'} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Fee type</InputLabel>
              <Select
                label="Fee type"
                value={feeType}
                onChange={(e) => {
                  const next = e.target.value;
                  setFeeType(next);
                  setOffset(0);
                  if (isStoreSubscriptionFeeFilter(next)) {
                    setTransactionType('NON_SALE_CHARGE');
                  }
                }}
              >
                {FEE_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || '__all'} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" type="date" label="From (PT)" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setOffset(0); }} InputLabelProps={{ shrink: true }} helperText="Pacific Time" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" type="date" label="To (PT)" value={toDate} onChange={(e) => { setToDate(e.target.value); setOffset(0); }} InputLabelProps={{ shrink: true }} helperText="Pacific Time" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Optional" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" label="Payout ID" value={payoutId} onChange={(e) => setPayoutId(e.target.value)} placeholder="Optional" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" label="Buyer username" value={buyerUsername} onChange={(e) => setBuyerUsername(e.target.value)} placeholder="Optional" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" label="Transaction ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Requires type" />
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
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => { setOffset(0); void loadTransactions(); }} disabled={loading || !sellerId}>Apply</Button>
              <Button variant="text" onClick={resetFilters} disabled={loading}>Reset</Button>
            </Stack>
          </Grid>
        </Grid>
      </MarketingCollapsibleFilters>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {storeErrors.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {storeErrors.length} store(s) failed: {storeErrors.slice(0, 3).map((e) => `${e.sellerName}: ${e.error}`).join(' · ')}
          {storeErrors.length > 3 ? ` · +${storeErrors.length - 3} more` : ''}
        </Alert>
      ) : null}

      {!error && feeType ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            Showing transactions with fee type <strong>{feeTypeLabel(feeType)}</strong>
            {isStoreSubscriptionFeeFilter(feeType)
              ? ' (matches OTHER_FEES and STORE_SUBSCRIPTION_FEE from eBay)'
              : ' on the transaction or in line-item fees'}
            .
            {isAllStores
              ? ' Each store scans up to 2,000 NON_SALE_CHARGE transactions when this filter is active.'
              : ' Scans up to 2,000 transactions in the date range.'}
          </Typography>
        </Alert>
      ) : null}

      {!error && (statusHint || typeHint) ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {statusHint ? (
            <Typography variant="body2"><strong>{transactionStatusLabel(transactionStatus)}:</strong> {statusHint}</Typography>
          ) : null}
          {typeHint ? (
            <Typography variant="body2" sx={{ mt: statusHint ? 1 : 0 }}>
              <strong>{transactionTypeLabel(transactionType)}:</strong> {typeHint}
            </Typography>
          ) : null}
        </Alert>
      ) : null}

      {loading && !loaded && !error ? (
        <GrowMentalityLoader label="Loading transactions…" minHeight={360} />
      ) : (
        <>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2, gap: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
            <Chip label={`Showing ${pageStart}–${pageEnd}${total != null ? ` of ${total.toLocaleString()}` : ''}`} variant="outlined" />
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
            {isAllStores ? (
              <Chip size="small" label={`Up to ${ALL_STORES_PER_SELLER_LIMIT} per store`} variant="outlined" />
            ) : null}
            {appliedFilterChips.map((chip) => (
              <Chip key={chip.key} size="small" label={chip.label} variant="outlined" />
            ))}
            </Stack>
            <ColumnSelector
              allColumns={columnOptions}
              visibleColumns={filterVisibleColumnsForSelector(visibleColumns, isAllStores)}
              onColumnChange={setVisibleColumns}
              onReset={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
              page="finances-transactions"
              disabled={loading}
            />
          </Stack>

          <Paper variant="outlined">
            <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48, bgcolor: 'background.paper' }} />
                    {showColumn('sellerName') ? (
                      <SortableHeader column="sellerName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('transactionDate') ? (
                      <SortableHeader column="transactionDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('transactionType') ? (
                      <SortableHeader column="transactionType" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('transactionStatus') ? (
                      <SortableHeader column="transactionStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('bookingEntry') ? (
                      <SortableHeader column="bookingEntry" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('amount') ? (
                      <SortableHeader column="amount" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('totalFeeAmount') ? (
                      <SortableHeader column="totalFeeAmount" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('feeType') ? (
                      <SortableHeader column="feeType" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('orderId') ? (
                      <SortableHeader column="orderId" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('buyerUsername') ? (
                      <SortableHeader column="buyerUsername" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                    {showColumn('payoutId') ? (
                      <SortableHeader column="payoutId" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tableColSpan} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No transactions returned for this store and filters.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((txn) => {
                      const rowKey = `${txn.sellerId || 'one'}-${txn.transactionId || `${resolveFinancesOrderId(txn, displayOrderIdIndexes)}-${txn.transactionDate}`}`;
                      return (
                        <TransactionRow
                          key={rowKey}
                          txn={txn}
                          expanded={expandedId === rowKey}
                          onToggle={() => setExpandedId((prev) => (prev === rowKey ? '' : rowKey))}
                          orderIdIndexes={displayOrderIdIndexes}
                          showColumn={showColumn}
                          tableColSpan={tableColSpan}
                        />
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {pageCount != null ? (
                <Typography variant="body2" color="text.secondary">
                  Page {Math.floor(offset / pageSize) + 1} of {pageCount}
                </Typography>
              ) : null}
              <Button size="small" startIcon={<ChevronLeftIcon />} disabled={!hasPrev || loading} onClick={() => setOffset((p) => Math.max(0, p - pageSize))}>
                Previous
              </Button>
              <Button size="small" endIcon={<ChevronRightIcon />} disabled={!hasNext || loading} onClick={() => setOffset((p) => p + pageSize)}>
                Next
              </Button>
            </Stack>
          </Stack>
        </>
      )}
    </Box>
  );
}
