import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  TRANSACTION_STATUS_DOCS,
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTION_TYPE_DOCS,
  TRANSACTION_TYPE_OPTIONS,
  transactionStatusDescription,
  transactionStatusLabel,
  transactionTypeDescription,
  transactionTypeLabel,
} from '../../utils/ebayTransactionTypes.js';
import {
  buildFinancesOrderIdIndexes,
  resolveFinancesItemId,
  resolveFinancesOrderId,
} from '../../utils/ebayFinances.js';

const EBAY_DOCS =
  'https://developer.ebay.com/develop/api/sell/finances_api#sell-finances_api-transaction-gettransactions';

const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];
const PAGE_SIZES = [25, 50, 100, 200];

const BOOKING_COLORS = {
  CREDIT: 'success',
  DEBIT: 'error',
};

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

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function TransactionRow({ txn, expanded, onToggle, orderIdIndexes }) {
  const fees = collectFees(txn);
  const orderId = resolveFinancesOrderId(txn, orderIdIndexes);
  const itemId = resolveFinancesItemId(txn);
  const rowKey = txn.transactionId || `${orderId}-${txn.transactionDate}`;

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
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(txn.transactionDate)}</TableCell>
        <TableCell>
          <Chip size="small" label={txn.transactionType || '—'} variant="outlined" />
        </TableCell>
        <TableCell>
          <Chip size="small" label={txn.transactionStatus || '—'} variant="outlined" />
        </TableCell>
        <TableCell>
          {txn.bookingEntry ? (
            <Chip
              size="small"
              label={txn.bookingEntry}
              color={BOOKING_COLORS[txn.bookingEntry] || 'default'}
            />
          ) : '—'}
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {formatMoney(txn.amount)}
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(txn.totalFeeAmount)}
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          {orderId || '—'}
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.buyer?.username || '—'}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          {txn.payoutId || '—'}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={10} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
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
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{fee.feeType}</TableCell>
                          <TableCell align="right">{formatMoney(fee.amount)}</TableCell>
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
  const defaultTo = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), []);

  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [transactionStatus, setTransactionStatus] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [fromDate, setFromDate] = useState(isoDateInputValue(defaultFrom));
  const [toDate, setToDate] = useState(isoDateInputValue(defaultTo));
  const [orderId, setOrderId] = useState('');
  const [payoutId, setPayoutId] = useState('');
  const [buyerUsername, setBuyerUsername] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);

  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(null);
  const [filters, setFilters] = useState([]);
  const [sourceMarketplace, setSourceMarketplace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState('');

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

  const loadTransactions = useCallback(async () => {
    if (!sellerId) {
      setError('Select a seller');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = {
        sellerId,
        marketplace,
        fromDate: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
        toDate: new Date(`${toDate}T23:59:59.999Z`).toISOString(),
        limit: pageSize,
        offset,
      };
      if (transactionStatus) params.transactionStatus = transactionStatus;
      if (transactionType) params.transactionType = transactionType;
      if (orderId.trim()) params.orderId = orderId.trim();
      if (payoutId.trim()) params.payoutId = payoutId.trim();
      if (buyerUsername.trim()) params.buyerUsername = buyerUsername.trim();
      if (transactionId.trim()) params.transactionId = transactionId.trim();

      const { data } = await api.get('/ebay/finances/transactions', { params, timeout: 90000 });
      if (!data.success) throw new Error(data.error || 'Failed to load transactions');
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setTotal(data.total ?? null);
      setFilters(Array.isArray(data.filters) ? data.filters : []);
      setSourceMarketplace(data.marketplaceId || '');
      setExpandedId('');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load transactions'));
      setTransactions([]);
      setTotal(null);
      setFilters([]);
    } finally {
      setLoading(false);
    }
  }, [
    sellerId,
    marketplace,
    transactionStatus,
    transactionType,
    fromDate,
    toDate,
    orderId,
    payoutId,
    buyerUsername,
    transactionId,
    pageSize,
    offset,
  ]);

  useEffect(() => {
    if (!sellerId) return;
    void loadTransactions();
  }, [sellerId, loadTransactions]);

  const resetFilters = () => {
    setTransactionStatus('');
    setTransactionType('');
    setFromDate(isoDateInputValue(defaultFrom));
    setToDate(isoDateInputValue(defaultTo));
    setOrderId('');
    setPayoutId('');
    setBuyerUsername('');
    setTransactionId('');
    setPageSize(50);
    setOffset(0);
  };

  const pageStart = transactions.length === 0 ? 0 : offset + 1;
  const pageEnd = offset + transactions.length;
  const hasPrev = offset > 0;
  const hasNext = transactions.length >= pageSize;
  const statusHint = transactionStatus ? transactionStatusDescription(transactionStatus) : '';
  const typeHint = transactionType ? transactionTypeDescription(transactionType) : '';
  const orderIdIndexes = useMemo(() => buildFinancesOrderIdIndexes(transactions), [transactions]);

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
            <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
            {' · '}
            <Link href={TRANSACTION_TYPE_DOCS} target="_blank" rel="noopener noreferrer">TransactionTypeEnum</Link>
            {' · '}
            <Link href={TRANSACTION_STATUS_DOCS} target="_blank" rel="noopener noreferrer">TransactionStatusEnum</Link>
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => void loadTransactions()}
          disabled={loading || !sellerId}
        >
          {loading ? 'Loading…' : 'Refresh from eBay'}
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Seller</InputLabel>
              <Select label="Seller" value={sellerId} onChange={(e) => { setSellerId(e.target.value); setOffset(0); }}>
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
              <Select label="Marketplace" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
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
                    {opt.value ? `${opt.label} (${opt.value})` : opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" type="date" label="From" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setOffset(0); }} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" type="date" label="To" value={toDate} onChange={(e) => { setToDate(e.target.value); setOffset(0); }} InputLabelProps={{ shrink: true }} />
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
              <Button variant="outlined" onClick={() => { setOffset(0); void loadTransactions(); }} disabled={loading}>Apply</Button>
              <Button variant="text" onClick={resetFilters} disabled={loading}>Reset</Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

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
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip label={`Showing ${pageStart}–${pageEnd}${total != null ? ` of ${total}` : ''}`} variant="outlined" />
            {sourceMarketplace ? <Chip size="small" label={sourceMarketplace} variant="outlined" /> : null}
            {selectedSellerName ? <Chip size="small" label={selectedSellerName} variant="outlined" /> : null}
            {filters.map((f) => (
              <Chip key={f} size="small" label={f} variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
            ))}
          </Stack>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', width: 48 }} />
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Date</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Type</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Entry</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Amount</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Fees</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Order</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Buyer</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Payout</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No transactions returned for this seller and filters.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((txn) => {
                    const rowKey = txn.transactionId || `${resolveFinancesOrderId(txn, orderIdIndexes)}-${txn.transactionDate}`;
                    return (
                      <TransactionRow
                        key={rowKey}
                        txn={txn}
                        expanded={expandedId === rowKey}
                        onToggle={() => setExpandedId((prev) => (prev === rowKey ? '' : rowKey))}
                        orderIdIndexes={orderIdIndexes}
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1}>
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
