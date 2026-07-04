import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  FormHelperText,
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
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import {
  TRANSACTION_STATUS_DOCS,
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTION_TYPE_DOCS,
  TRANSACTION_TYPE_OPTIONS,
  transactionStatusDescription,
  transactionStatusLabel,
  transactionTypeDescription,
} from '../../utils/ebayTransactionTypes.js';
import {
  buildFinancesOrderIdIndexes,
  fetchFinancesTransactionsByTypes,
  resolveFinancesOrderId,
  SUMMARY_CATEGORY_TRANSACTION_TYPES,
} from '../../utils/ebayFinances.js';

const EBAY_DOCS =
  'https://developer.ebay.com/develop/api/sell/finances_api#sell-finances_api-transaction-gettransactionsummary';

const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];

const SUMMARY_METRICS = [
  { prefix: 'credit', label: 'Credits', hint: 'Sales + seller credits', bookingEntry: 'CREDIT' },
  { prefix: 'refund', label: 'Refunds', hint: 'Buyer refunds', bookingEntry: 'DEBIT' },
  { prefix: 'dispute', label: 'Disputes', hint: 'Payment disputes', bookingEntry: 'DEBIT' },
  { prefix: 'shippingLabel', label: 'Shipping labels', hint: 'Label purchases', bookingEntry: 'DEBIT' },
  { prefix: 'transfer', label: 'Transfers', hint: 'Reimbursements to eBay', bookingEntry: 'DEBIT' },
  { prefix: 'withdrawal', label: 'Withdrawals', hint: 'On-demand payouts', bookingEntry: 'DEBIT' },
  { prefix: 'onHold', label: 'On hold', hint: 'Held funds' },
  { prefix: 'purchase', label: 'Purchases', hint: 'Seller purchases', bookingEntry: 'DEBIT' },
  { prefix: 'nonSaleCharge', label: 'Non-sale charges', hint: 'Fees, tax, subscriptions', bookingEntry: 'DEBIT' },
  { prefix: 'adjustment', label: 'Adjustments', hint: 'Account adjustments' },
  { prefix: 'balanceTransfer', label: 'Balance transfers', hint: 'Between balances' },
  { prefix: 'loanRepayment', label: 'Loan repayments', hint: 'Seller Capital', bookingEntry: 'DEBIT' },
];

function isoDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(amount) {
  if (!amount || amount.value == null || amount.value === '') return '—';
  const value = Number(amount.value);
  if (Number.isNaN(value)) return String(amount.value);
  const currency = amount.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function moneyValue(amount) {
  const value = Number(amount?.value);
  return Number.isNaN(value) ? 0 : value;
}

function formatCount(count) {
  if (count == null || count === '') return '—';
  return Number(count).toLocaleString();
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function txnDetailLabel(txn) {
  if (txn.feeType) return txn.feeType;
  if (txn.transactionMemo) return txn.transactionMemo;
  return '—';
}

function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

function summaryRows(summary, showEmpty) {
  if (!summary) return [];
  return SUMMARY_METRICS.map(({ prefix, label, hint, bookingEntry: categoryEntry }) => ({
    key: prefix,
    label,
    hint,
    count: summary[`${prefix}Count`],
    amount: summary[`${prefix}Amount`],
    bookingEntry: categoryEntry ?? summary[`${prefix}BookingEntry`] ?? null,
  })).filter((row) => {
    if (row.count == null && row.amount == null) return false;
    if (showEmpty) return true;
    return Number(row.count) > 0 || moneyValue(row.amount) !== 0;
  });
}

function SummaryKpi({ label, value, sub, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: color || 'text.primary' }}>
        {value}
      </Typography>
      {sub ? (
        <Typography variant="caption" color="text.secondary">{sub}</Typography>
      ) : null}
    </Paper>
  );
}

function SummaryCategoryRow({
  row,
  expanded,
  onToggle,
  transactions,
  loading,
  detailError,
  orderIdIndexes,
}) {
  const canExpand = Number(row.count) > 0;

  return (
    <>
      <TableRow
        hover
        onClick={canExpand ? onToggle : undefined}
        sx={{
          cursor: canExpand ? 'pointer' : 'default',
          bgcolor: expanded ? 'action.hover' : undefined,
          '& > *': { borderBottom: expanded ? 'unset' : undefined },
        }}
      >
        <TableCell sx={{ width: 40, p: 0.5 }}>
          {canExpand ? (
            <IconButton size="small" tabIndex={-1} aria-label={`Show ${row.label} transactions`}>
              {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
          ) : null}
        </TableCell>
        <TableCell>
          <Tooltip title={row.hint || row.label} placement="top-start">
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.label}</Typography>
          </Tooltip>
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCount(row.count)}</TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {formatMoney(row.amount)}
        </TableCell>
        <TableCell align="center" sx={{ width: 90 }}>
          {row.bookingEntry ? (
            <Chip
              size="small"
              label={row.bookingEntry}
              color={row.bookingEntry === 'CREDIT' ? 'success' : row.bookingEntry === 'DEBIT' ? 'error' : 'default'}
              variant="outlined"
            />
          ) : '—'}
        </TableCell>
      </TableRow>
      {canExpand ? (
        <TableRow>
          <TableCell colSpan={5} sx={{ py: 0, bgcolor: 'grey.50', borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
            <Collapse in={expanded} timeout="auto" unmountOnExit>
              <Box sx={{ py: 1.5, px: 2 }}>
                {loading ? (
                  <Typography variant="body2" color="text.secondary">Loading {row.count} transaction(s)…</Typography>
                ) : null}
                {detailError ? <Alert severity="error" sx={{ mb: 1 }}>{detailError}</Alert> : null}
                {!loading && !detailError && transactions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No transactions returned.</Typography>
                ) : null}
                {!loading && transactions.length > 0 ? (
                  <Table size="small" sx={{ bgcolor: 'background.paper' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }} align="right">Amount</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Order</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Transaction ID</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Detail</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactions.map((txn) => {
                        const resolvedOrderId = resolveFinancesOrderId(txn, orderIdIndexes);
                        const rowKey = txn.transactionId || `${resolvedOrderId}-${txn.transactionDate}`;
                        return (
                          <TableRow key={rowKey} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap', py: 0.75 }}>{formatDate(txn.transactionDate)}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Chip size="small" label={txn.transactionType || '—'} variant="outlined" />
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, py: 0.75 }}>
                              {formatMoney(txn.amount)}
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'nowrap', py: 0.75 }}>
                              {resolvedOrderId || '—'}
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'nowrap', py: 0.75 }}>
                              {txn.transactionId || '—'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', maxWidth: 180, py: 0.75 }}>{txnDetailLabel(txn)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : null}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export default function TransactionSummaryPage() {
  const defaultTo = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), []);

  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [transactionStatus, setTransactionStatus] = useState('FUNDS_AVAILABLE_FOR_PAYOUT');
  const [transactionType, setTransactionType] = useState('');
  const [fromDate, setFromDate] = useState(isoDateInputValue(defaultFrom));
  const [toDate, setToDate] = useState(isoDateInputValue(defaultTo));
  const [orderId, setOrderId] = useState('');
  const [payoutId, setPayoutId] = useState('');
  const [buyerUsername, setBuyerUsername] = useState('');
  const [transactionId, setTransactionId] = useState('');

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

  const [expandedCategory, setExpandedCategory] = useState('');
  const [categoryTxns, setCategoryTxns] = useState({});
  const [categoryLoading, setCategoryLoading] = useState('');
  const [categoryError, setCategoryError] = useState('');

  const listParams = useMemo(() => {
    const params = {
      sellerId,
      marketplace,
      transactionStatus,
      fromDate: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
      toDate: new Date(`${toDate}T23:59:59.999Z`).toISOString(),
    };
    if (orderId.trim()) params.orderId = orderId.trim();
    if (payoutId.trim()) params.payoutId = payoutId.trim();
    if (buyerUsername.trim()) params.buyerUsername = buyerUsername.trim();
    if (transactionId.trim()) params.transactionId = transactionId.trim();
    return params;
  }, [sellerId, marketplace, transactionStatus, fromDate, toDate, orderId, payoutId, buyerUsername, transactionId]);

  const expandedTransactions = categoryTxns[expandedCategory] || [];
  const orderIdIndexes = useMemo(
    () => buildFinancesOrderIdIndexes(expandedTransactions),
    [expandedTransactions]
  );

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => {
        const list = data || [];
        setSellers(list);
        if (list.length > 0) setSellerId((prev) => prev || list[0]._id);
      })
      .catch(() => setSellers([]));
  }, []);

  const selectedSellerName = useMemo(
    () => sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '',
    [sellers, sellerId]
  );

  const loadSummary = useCallback(async () => {
    if (!sellerId) {
      setError('Select a seller');
      return;
    }
    setLoading(true);
    setError('');
    setExpandedCategory('');
    setCategoryTxns({});
    setCategoryLoading('');
    setCategoryError('');
    try {
      const params = { ...listParams };
      if (transactionType) params.transactionType = transactionType;

      const { data } = await api.get('/ebay/finances/transaction-summary', { params, timeout: 90000 });
      if (!data.success) throw new Error(data.error || 'Failed to load transaction summary');
      setSummary(data.summary || null);
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load transaction summary'));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [sellerId, listParams, transactionType]);

  useEffect(() => {
    if (!sellerId) return;
    void loadSummary();
  }, [sellerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCategoryTransactions = useCallback(async (categoryKey) => {
    const categoryTypes = SUMMARY_CATEGORY_TRANSACTION_TYPES[categoryKey] || [];
    const types = transactionType
      ? (categoryTypes.includes(transactionType) ? [transactionType] : [])
      : categoryTypes;
    if (!types.length) {
      setCategoryTxns((prev) => ({ ...prev, [categoryKey]: [] }));
      return;
    }
    setCategoryLoading(categoryKey);
    setCategoryError('');
    try {
      const txns = await fetchFinancesTransactionsByTypes(api, listParams, types);
      setCategoryTxns((prev) => ({ ...prev, [categoryKey]: txns }));
    } catch (err) {
      setCategoryError(parseApiError(err, 'Failed to load transactions'));
      setCategoryTxns((prev) => ({ ...prev, [categoryKey]: [] }));
    } finally {
      setCategoryLoading('');
    }
  }, [listParams, transactionType]);

  const handleToggleCategory = (categoryKey) => {
    if (expandedCategory === categoryKey) {
      setExpandedCategory('');
      return;
    }
    setExpandedCategory(categoryKey);
    if (!categoryTxns[categoryKey]) {
      void loadCategoryTransactions(categoryKey);
    }
  };

  const resetFilters = () => {
    setTransactionStatus('FUNDS_AVAILABLE_FOR_PAYOUT');
    setTransactionType('');
    setFromDate(isoDateInputValue(defaultFrom));
    setToDate(isoDateInputValue(defaultTo));
    setOrderId('');
    setPayoutId('');
    setBuyerUsername('');
    setTransactionId('');
  };

  const allRows = useMemo(() => summaryRows(summary, true), [summary]);
  const rows = useMemo(() => summaryRows(summary, showEmptyCategories), [summary, showEmptyCategories]);
  const hiddenEmptyCount = allRows.length - rows.length;

  const kpis = useMemo(() => {
    let creditTotal = 0;
    let debitTotal = 0;
    let txnCount = 0;
    for (const row of allRows) {
      const count = Number(row.count) || 0;
      const amount = moneyValue(row.amount);
      txnCount += count;
      if (row.bookingEntry === 'CREDIT') creditTotal += amount;
      else if (row.bookingEntry === 'DEBIT') debitTotal += amount;
    }
    return { creditTotal, debitTotal, txnCount, activeCategories: rows.length };
  }, [allRows, rows.length]);

  const statusLabel = transactionStatusLabel(transactionStatus);
  const statusHint = transactionStatusDescription(transactionStatus);
  const typeHint = transactionTypeDescription(transactionType);
  const hasAdvancedFilters = Boolean(
    transactionType || orderId.trim() || payoutId.trim() || buyerUsername.trim() || transactionId.trim()
  );

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Transaction summary</Typography>
          <Typography variant="caption" color="text.secondary">
            eBay Finances aggregates ·{' '}
            <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">API</Link>
            {' · '}
            <Link href={TRANSACTION_TYPE_DOCS} target="_blank" rel="noopener noreferrer">Types</Link>
            {' · '}
            <Link href={TRANSACTION_STATUS_DOCS} target="_blank" rel="noopener noreferrer">Statuses</Link>
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => void loadSummary()}
          disabled={loading || !sellerId}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="flex-end">
          <Grid item xs={12} sm={6} md={2.4}>
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
          <Grid item xs={6} sm={3} md={1.8}>
            <FormControl fullWidth size="small">
              <InputLabel>Marketplace</InputLabel>
              <Select label="Marketplace" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp.replace('EBAY_', '')}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2.8}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={transactionStatus} onChange={(e) => setTransactionStatus(e.target.value)}>
                {TRANSACTION_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
              {statusHint ? <FormHelperText sx={{ mx: 0, mt: 0.25, lineHeight: 1.2 }}>{statusHint}</FormHelperText> : null}
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={1.6}>
            <TextField
              fullWidth size="small" type="date" label="From" value={fromDate}
              onChange={(e) => setFromDate(e.target.value)} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={1.6}>
            <TextField
              fullWidth size="small" type="date" label="To" value={toDate}
              onChange={(e) => setToDate(e.target.value)} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Stack direction="row" spacing={0.5}>
              <Button variant="contained" size="small" onClick={() => void loadSummary()} disabled={loading || !sellerId} sx={{ flex: 1 }}>
                Apply
              </Button>
              <Button
                variant={advancedOpen ? 'outlined' : 'text'}
                size="small"
                startIcon={<FilterListIcon />}
                onClick={() => setAdvancedOpen((v) => !v)}
                color={hasAdvancedFilters ? 'primary' : 'inherit'}
              >
                More
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <Collapse in={advancedOpen}>
          <Grid container spacing={1.5} sx={{ mt: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Transaction type</InputLabel>
                <Select label="Transaction type" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
                  {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value || '__all'} value={opt.value}>
                      {opt.value ? opt.label : opt.label}
                    </MenuItem>
                  ))}
                </Select>
                {typeHint ? <FormHelperText>{typeHint}</FormHelperText> : null}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField fullWidth size="small" label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField fullWidth size="small" label="Payout ID" value={payoutId} onChange={(e) => setPayoutId(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField fullWidth size="small" label="Buyer username" value={buyerUsername} onChange={(e) => setBuyerUsername(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField fullWidth size="small" label="Transaction ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} helperText="Requires transaction type" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Button variant="text" size="small" onClick={resetFilters} disabled={loading}>Reset filters</Button>
            </Grid>
          </Grid>
        </Collapse>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading && !loaded && !error ? (
        <GrowMentalityLoader label="Loading transaction summary…" minHeight={280} />
      ) : (
        <>
          {loaded && summary ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
              <SummaryKpi
                label="Transactions"
                value={kpis.txnCount.toLocaleString()}
                sub={`${kpis.activeCategories} active categories`}
              />
              <SummaryKpi
                label="Credits"
                value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(kpis.creditTotal)}
                color="success.main"
              />
              <SummaryKpi
                label="Debits"
                value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(kpis.debitTotal)}
                color="error.main"
              />
              <SummaryKpi
                label="Scope"
                value={selectedSellerName || '—'}
                sub={`${statusLabel} · ${fromDate} → ${toDate}`}
              />
            </Stack>
          ) : null}

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {rows.length === 0 ? 'No activity for these filters' : 'Click a row to expand transactions'}
            </Typography>
            {hiddenEmptyCount > 0 ? (
              <Button size="small" variant="text" onClick={() => setShowEmptyCategories((v) => !v)}>
                {showEmptyCategories ? 'Hide empty categories' : `Show ${hiddenEmptyCount} empty`}
              </Button>
            ) : null}
          </Stack>

          {rows.length === 0 ? (
            <Alert severity="info">No summary metrics with activity for these filters.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.main' }}>
                    <TableCell sx={{ color: 'white', width: 40 }} />
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Category</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Count</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Amount</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Entry</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <SummaryCategoryRow
                      key={row.key}
                      row={row}
                      expanded={expandedCategory === row.key}
                      onToggle={() => handleToggleCategory(row.key)}
                      transactions={expandedCategory === row.key ? expandedTransactions : []}
                      loading={categoryLoading === row.key}
                      detailError={expandedCategory === row.key ? categoryError : ''}
                      orderIdIndexes={orderIdIndexes}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
