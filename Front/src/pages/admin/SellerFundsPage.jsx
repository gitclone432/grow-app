import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  Button,
  Stack,
  Tooltip,
  TextField,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import api from '../../lib/api';

const formatCurrency = (amountObj) => {
  if (!amountObj) return '$0.00';
  const val = parseFloat(amountObj.value || 0);
  const currency = amountObj.currency || 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
};

const fmtUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const getFundValue = (amountObj) => parseFloat(amountObj?.value ?? amountObj ?? 0);

const getAvailableColor = (amountObjOrNum) => (
  getFundValue(amountObjOrNum) < 0 ? '#ef4444' : '#22c55e'
);

const SORT_COLUMNS = {
  sellerName: { label: 'Seller', align: 'left', color: undefined },
  totalFunds: { label: 'Total Funds', align: 'right', color: '#3b82f6' },
  availableFunds: { label: 'Available', align: 'right', color: '#22c55e' },
  processingFunds: { label: 'Processing', align: 'right', color: '#f59e0b' },
  fundsOnHold: { label: 'On Hold', align: 'right', color: '#ef4444' },
};

function compareSellers(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  if (sortBy === 'sellerName') {
    const nameA = String(a.sellerName || a.error || '').toLowerCase();
    const nameB = String(b.sellerName || b.error || '').toLowerCase();
    return dir * nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  }
  const field = SORT_COLUMNS[sortBy] ? sortBy : 'totalFunds';
  const valA = a.error ? -Infinity : getFundValue(a[field]);
  const valB = b.error ? -Infinity : getFundValue(b[field]);
  if (valA === valB) {
    return (a.sellerName || '').localeCompare(b.sellerName || '', undefined, { sensitivity: 'base' });
  }
  return dir * (valA - valB);
}

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = SORT_COLUMNS[column];
  return (
    <TableCell align={meta.align} sx={{ fontWeight: 700, color: meta.color }}>
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

// Format date+time in PST
const formatDatePST = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Format date only (no time) in PST
const formatDateOnlyPST = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Get YYYY-MM-DD string in PST for date comparison
const getDateKeyPST = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const pst = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const y = pst.getFullYear();
  const m = String(pst.getMonth() + 1).padStart(2, '0');
  const day = String(pst.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Get today's YYYY-MM-DD in Pacific time
const getTodayPtDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

// ============================================
// SELLER ROW with Processing + On Hold expand
// ============================================
const SellerRow = ({ seller, onHoldExpanded, onToggleHold }) => {
  const [processingOpen, setProcessingOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loadingProcessing, setLoadingProcessing] = useState(false);
  const [errorProcessing, setErrorProcessing] = useState(null);

  const [holdTransactions, setHoldTransactions] = useState([]);
  const [loadingHold, setLoadingHold] = useState(false);
  const [errorHold, setErrorHold] = useState(null);
  const [holdFetched, setHoldFetched] = useState(false);

  const processingValue = parseFloat(seller.processingFunds?.value || 0);
  const canExpandProcessing = processingValue > 0;

  const holdValue = parseFloat(seller.fundsOnHold?.value || 0);
  const canExpandHold = holdValue > 0;


  const fetchTransactions = async () => {
    if (!canExpandProcessing) return;
    setLoadingProcessing(true);
    setErrorProcessing(null);
    try {
      const res = await api.get(`/ebay/processing-transactions/${seller.sellerId}`);
      setTransactions(res.data.transactions || []);
    } catch (err) {
      setErrorProcessing(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoadingProcessing(false);
    }
  };

  const fetchHoldTransactions = async () => {
    if (!canExpandHold) return;
    setLoadingHold(true);
    setErrorHold(null);
    setHoldFetched(false);
    try {
      const res = await api.get(`/ebay/onhold-transactions/${seller.sellerId}`);
      setHoldTransactions(res.data.transactions || []);
    } catch (err) {
      setErrorHold(err.response?.data?.error || 'Failed to load on-hold transactions');
    } finally {
      setLoadingHold(false);
      setHoldFetched(true);
    }
  };


  const handleToggleProcessing = () => {
    if (!canExpandProcessing) return;
    const willOpen = !processingOpen;
    setProcessingOpen(willOpen);
    if (willOpen) fetchTransactions();
  };

  const handleToggleHold = () => {
    if (!canExpandHold) return;
    const willOpen = !onHoldExpanded;
    onToggleHold(seller.sellerId);
    if (willOpen) fetchHoldTransactions();
    if (!willOpen) {
      setHoldTransactions([]);
      setHoldFetched(false);
      setErrorHold(null);
    }
  };

  // Align with seller_funds_summary processing balance: hide orders whose
  // available date is already in the past (still returned by eBay as FUNDS_PROCESSING).
  const todayPtKey = getTodayPtDateKey();
  const activeProcessingTxns = useMemo(() => (
    transactions.filter((txn) => {
      if (!txn.availableDate) return true;
      const key = getDateKeyPST(txn.availableDate);
      return !key || key >= todayPtKey;
    })
  ), [transactions, todayPtKey]);
  const hiddenPastProcessingCount = transactions.length - activeProcessingTxns.length;
  const activeProcessingTotal = activeProcessingTxns.reduce(
    (sum, txn) => sum + (parseFloat(txn.amount) || 0),
    0,
  );

  if (seller.error) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
            <ErrorOutlineIcon color="error" fontSize="small" />
            <Typography variant="body2" fontWeight={600}>{seller.sellerName}</Typography>
            <Typography variant="body2" color="error">— {seller.error}</Typography>
          </Box>
        </TableCell>
      </TableRow>
    );
  }

  const anyExpanded = processingOpen || onHoldExpanded;

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: anyExpanded ? 'none !important' : undefined } }}>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>{seller.sellerName}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" fontWeight={700} sx={{ color: '#3b82f6' }}>
            {formatCurrency(seller.totalFunds)}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" fontWeight={600} sx={{ color: getAvailableColor(seller.availableFunds) }}>
            {formatCurrency(seller.availableFunds)}
          </Typography>
        </TableCell>
        {/* Processing cell - clickable */}
        <TableCell
          align="right"
          sx={{
            cursor: canExpandProcessing ? 'pointer' : 'default',
            backgroundColor: processingOpen ? '#fef3c7' : canExpandProcessing ? '#fffbeb' : 'transparent',
            '&:hover': canExpandProcessing ? { backgroundColor: '#fef3c7' } : {},
            transition: 'background-color 0.2s'
          }}
          onClick={handleToggleProcessing}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ color: '#f59e0b' }}>
              {formatCurrency(seller.processingFunds)}
            </Typography>
            {canExpandProcessing && (
              <IconButton size="small" sx={{ ml: 0.5 }}>
                {processingOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
              </IconButton>
            )}
          </Box>
        </TableCell>
        {/* On Hold cell - clickable */}
        <TableCell
          align="right"
          sx={{
            cursor: canExpandHold ? 'pointer' : 'default',
            backgroundColor: onHoldExpanded ? '#fee2e2' : canExpandHold ? '#fef2f2' : 'transparent',
            '&:hover': canExpandHold ? { backgroundColor: '#fee2e2' } : {},
            transition: 'background-color 0.2s'
          }}
          onClick={handleToggleHold}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ color: '#ef4444' }}>
              {formatCurrency(seller.fundsOnHold)}
            </Typography>
            {canExpandHold && (
              <IconButton size="small" sx={{ ml: 0.5 }}>
                {onHoldExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
              </IconButton>
            )}
          </Box>
        </TableCell>
      </TableRow>

      {/* Expandable Processing Details */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
          <Collapse in={processingOpen} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 3, backgroundColor: '#fffbeb' }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5, color: '#92400e' }}>
                Processing Orders
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Showing orders with available date today or later
                {hiddenPastProcessingCount > 0
                  ? ` · ${hiddenPastProcessingCount} older processing order(s) hidden`
                  : ''}
                {' · '}
                Total {fmtUSD(activeProcessingTotal)}
              </Typography>

              {loadingProcessing && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {errorProcessing && <Alert severity="error" sx={{ mb: 1 }}>{errorProcessing}</Alert>}

              {!loadingProcessing && activeProcessingTxns.length === 0 && !errorProcessing && (
                <Typography variant="body2" color="text.secondary">
                  {transactions.length > 0
                    ? 'No processing orders with available date today or later.'
                    : 'No processing transactions found.'}
                </Typography>
              )}

              {!loadingProcessing && activeProcessingTxns.length > 0 && (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #fbbf24' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#fef3c7' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Order ID</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>Amount</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Buyer</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Transaction Date (PST)</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Available Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeProcessingTxns.map((txn, idx) => (
                        <TableRow key={txn.orderId || idx} hover>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                              {txn.orderId}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={600} fontSize={12}>
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: txn.currency || 'USD'
                              }).format(txn.amount)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize={12}>{txn.buyer}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize={11} color="text.secondary">
                              {formatDatePST(txn.transactionDate)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {txn.availableDate ? (
                              <Chip
                                label={formatDateOnlyPST(txn.availableDate)}
                                size="small"
                                sx={{
                                  fontWeight: 600,
                                  backgroundColor: '#22c55e',
                                  color: 'white',
                                  fontSize: 11
                                }}
                              />
                            ) : (
                              <Typography variant="body2" fontSize={11} color="text.secondary">—</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      {/* Expandable On Hold Details */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
          <Collapse in={onHoldExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 3, backgroundColor: '#fef2f2' }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: '#991b1b' }}>
                On Hold Orders
              </Typography>

              {loadingHold && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {errorHold && <Alert severity="error" sx={{ mb: 1 }}>{errorHold}</Alert>}

              {!loadingHold && holdTransactions.length === 0 && !errorHold && holdFetched && (
                <Typography variant="body2" color="text.secondary">
                  {holdValue > 0
                    ? `eBay reports ${formatCurrency(seller.fundsOnHold)} on hold, but no order-level FUNDS_ON_HOLD transactions were returned. This may be an account-level hold not tied to a specific order.`
                    : 'No on-hold transactions found.'}
                </Typography>
              )}

              {!loadingHold && holdTransactions.length > 0 && (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #fca5a5' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#fee2e2' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Order / Return ID</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>Amount</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Buyer</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Transaction Date (PST)</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Reason</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {holdTransactions.map((txn, idx) => (
                        <TableRow key={txn.orderId || idx} hover>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                              {txn.orderId}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={600} fontSize={12}>
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: txn.currency || 'USD'
                              }).format(txn.amount)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize={12}>{txn.buyer}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize={11} color="text.secondary">
                              {formatDatePST(txn.transactionDate)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize={11} color="text.secondary">
                              {txn.transactionMemo || '—'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const PROCESSING_DATE_COUNT_OPTIONS = [5, 10, 15, 20, 30];
const DEFAULT_PROCESSING_DATE_COUNT = 10;

// ============================================
// Processing funds — next N dates that have funds
// ============================================
const ProcessingByDateSection = ({ sellers }) => {
  const [filterSellerId, setFilterSellerId] = useState('');
  const [dateCount, setDateCount] = useState(DEFAULT_PROCESSING_DATE_COUNT);
  const [dayGroups, setDayGroups] = useState([]);
  const [expandedDates, setExpandedDates] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);
  const [totalDatesFound, setTotalDatesFound] = useState(0);

  const sellerOptions = useMemo(
    () => [...sellers]
      .filter((s) => !s.error)
      .sort((a, b) => String(a.sellerName || '').localeCompare(String(b.sellerName || ''), undefined, { sensitivity: 'base' })),
    [sellers],
  );

  const loadUpcoming = useCallback(async () => {
    if (sellerOptions.length === 0) {
      setDayGroups([]);
      setTotalDatesFound(0);
      setExpandedDates({});
      setFetched(true);
      return;
    }

    setLoading(true);
    setError(null);

    const todayKey = getTodayPtDateKey();
    const activeSellers = sellerOptions.filter((s) => (
      !filterSellerId || String(s.sellerId) === String(filterSellerId)
    ));

    const byDate = new Map();

    await Promise.all(
      activeSellers.map(async (seller) => {
        try {
          const res = await api.get(`/ebay/processing-transactions/${seller.sellerId}`);
          const txns = res.data.transactions || [];

          for (const txn of txns) {
            if (!txn.availableDate) continue;
            const dateKey = getDateKeyPST(txn.availableDate);
            if (!dateKey || dateKey < todayKey) continue;

            if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
            const sellerMap = byDate.get(dateKey);
            const sid = String(seller.sellerId);
            const existing = sellerMap.get(sid) || {
              sellerId: seller.sellerId,
              sellerName: seller.sellerName,
              totalAmount: 0,
              transactionCount: 0,
            };
            existing.totalAmount += Number(txn.amount) || 0;
            existing.transactionCount += 1;
            sellerMap.set(sid, existing);
          }
        } catch {
          // skip failed sellers
        }
      }),
    );

    const allGroups = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, sellerMap]) => {
        const sellerRows = [...sellerMap.values()].sort((a, b) => (
          String(a.sellerName || '').localeCompare(String(b.sellerName || ''), undefined, { sensitivity: 'base' })
        ));
        return {
          dateKey,
          sellers: sellerRows,
          totalAmount: sellerRows.reduce((sum, r) => sum + r.totalAmount, 0),
          orderCount: sellerRows.reduce((sum, r) => sum + r.transactionCount, 0),
        };
      })
      .filter((g) => g.orderCount > 0);

    setTotalDatesFound(allGroups.length);
    setDayGroups(allGroups.slice(0, dateCount));
    setExpandedDates({});
    setFetched(true);
    setLoading(false);
  }, [sellerOptions, filterSellerId, dateCount]);

  useEffect(() => {
    void loadUpcoming();
  }, [loadUpcoming]);

  const grandTotal = dayGroups.reduce((sum, g) => sum + g.totalAmount, 0);
  const todayKey = getTodayPtDateKey();

  const toggleDate = (dateKey) => {
    setExpandedDates((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="processing-seller-filter-label">Seller</InputLabel>
          <Select
            labelId="processing-seller-filter-label"
            label="Seller"
            value={filterSellerId}
            onChange={(e) => setFilterSellerId(e.target.value)}
          >
            <MenuItem value="">
              <em>All sellers</em>
            </MenuItem>
            {sellerOptions.map((s) => (
              <MenuItem key={String(s.sellerId)} value={String(s.sellerId)}>
                {s.sellerName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="processing-date-count-label">Future dates</InputLabel>
          <Select
            labelId="processing-date-count-label"
            label="Future dates"
            value={dateCount}
            onChange={(e) => setDateCount(Number(e.target.value))}
          >
            {PROCESSING_DATE_COUNT_OPTIONS.map((n) => (
              <MenuItem key={n} value={n}>
                Next {n} dates
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          onClick={() => void loadUpcoming()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && fetched && dayGroups.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No upcoming processing dates with funds.
        </Alert>
      )}

      {!loading && dayGroups.length > 0 && (
        <Box>
          <Box
            sx={{
              p: 2,
              mb: 2,
              bgcolor: 'action.hover',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Next {dayGroups.length} processing date{dayGroups.length === 1 ? '' : 's'}
              {totalDatesFound > dayGroups.length ? ` (of ${totalDatesFound} found)` : ''}
            </Typography>
            <Typography variant="h5" fontWeight={700} sx={{ color: '#8b5cf6', mt: 0.5 }}>
              {fmtUSD(grandTotal)}
            </Typography>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f3ff' }}>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell sx={{ fontWeight: 700 }}>Available Date</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Sellers</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Orders</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dayGroups.map((group) => {
                  const open = !!expandedDates[group.dateKey];
                  const isToday = group.dateKey === todayKey;
                  return (
                    <React.Fragment key={group.dateKey}>
                      <TableRow
                        hover
                        sx={{ cursor: 'pointer', bgcolor: open ? 'action.selected' : undefined }}
                        onClick={() => toggleDate(group.dateKey)}
                      >
                        <TableCell>
                          <IconButton size="small" aria-label={open ? 'collapse' : 'expand'}>
                            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" fontWeight={700}>
                              {formatDateOnlyPST(`${group.dateKey}T12:00:00Z`)}
                            </Typography>
                            {isToday && <Chip label="Today" size="small" color="primary" sx={{ height: 20 }} />}
                          </Stack>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">{group.sellers.length}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={group.orderCount} size="small" sx={{ fontWeight: 600 }} />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#8b5cf6' }}>
                            {fmtUSD(group.totalAmount)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
                          <Collapse in={open} timeout="auto" unmountOnExit>
                            <Box sx={{ px: 2, py: 1.5, bgcolor: 'grey.50' }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>Seller</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600 }}>Orders</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {group.sellers.map((r) => (
                                    <TableRow key={String(r.sellerId)}>
                                      <TableCell>
                                        <Typography variant="body2">{r.sellerName}</Typography>
                                      </TableCell>
                                      <TableCell align="center">{r.transactionCount}</TableCell>
                                      <TableCell align="right">
                                        <Typography variant="body2" fontWeight={600}>
                                          {fmtUSD(r.totalAmount)}
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
                <TableRow sx={{ bgcolor: '#f5f3ff' }}>
                  <TableCell />
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>TOTAL</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" fontWeight={700}>
                      {dayGroups.reduce((n, g) => n + g.sellers.length, 0)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={dayGroups.reduce((n, g) => n + g.orderCount, 0)}
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#8b5cf6' }}>
                      {fmtUSD(grandTotal)}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Paper>
  );
};

const KpiCard = ({ label, value, color, bgcolor = 'action.hover' }) => (
  <Card sx={{ p: 1, borderRadius: 2, bgcolor, height: '100%' }}>
    <CardContent sx={{ '&:last-child': { pb: 2 } }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color, mt: 0.5 }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

// ============================================
// MAIN PAGE
// ============================================
const SellerFundsPage = () => {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [cacheSource, setCacheSource] = useState(null); // 'mongodb' | 'ebay' | 'none' | null
  const [expandedHolds, setExpandedHolds] = useState({});
  const [sortBy, setSortBy] = useState('sellerName');
  const [sortOrder, setSortOrder] = useState('asc');
  const [activeTab, setActiveTab] = useState(0);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'sellerName' ? 'asc' : 'desc');
    }
  };

  const sortedSellers = useMemo(
    () => [...sellers].sort((a, b) => compareSellers(a, b, sortBy, sortOrder)),
    [sellers, sortBy, sortOrder]
  );

  const applyFundsResponse = useCallback((data) => {
    const rows = Array.isArray(data?.sellers)
      ? data.sellers
      : (Array.isArray(data) ? data : []);
    setSellers(rows);
    const cachedAt = data?.cache?.cachedAt ? new Date(data.cache.cachedAt) : new Date();
    setLastRefresh(Number.isNaN(cachedAt.getTime()) ? new Date() : cachedAt);
    setCacheSource(data?.cache?.source || (rows.length ? 'ebay' : 'none'));
  }, []);

  const fetchFundsSummary = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/ebay/seller-funds-summary', {
        params: forceRefresh ? { refresh: 'true' } : {},
        timeout: forceRefresh ? 180000 : 30000,
      });
      if (res.data?.success === false) {
        throw new Error(res.data?.error || 'Failed to fetch seller funds');
      }
      applyFundsResponse(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch seller funds');
    } finally {
      setLoading(false);
    }
  }, [applyFundsResponse]);

  useEffect(() => {
    fetchFundsSummary(false);
  }, [fetchFundsSummary]);

  const toggleHold = (sellerId) => {
    setExpandedHolds(prev => ({ ...prev, [sellerId]: !prev[sellerId] }));
  };

  const totals = sellers.reduce((acc, s) => {
    if (!s.error) {
      acc.total += parseFloat(s.totalFunds?.value || 0);
      acc.available += parseFloat(s.availableFunds?.value || 0);
      acc.processing += parseFloat(s.processingFunds?.value || 0);
      acc.onHold += parseFloat(s.fundsOnHold?.value || 0);
    }
    return acc;
  }, { total: 0, available: 0, processing: 0, onHold: 0 });

  const sellerCount = sellers.filter((s) => !s.error).length;
  const statusLabel = cacheSource === 'mongodb'
    ? 'Cached'
    : cacheSource === 'ebay'
      ? 'Live'
      : cacheSource === 'none'
        ? 'No saved data'
        : null;

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Seller Funds Overview</Typography>
          <Typography variant="body2" color="text.secondary">
            {statusLabel
              ? `${statusLabel}${lastRefresh ? ` — ${lastRefresh.toLocaleString()}` : ''}`
              : 'Loading…'}
          </Typography>
        </Box>
        {activeTab === 0 && (
          <Button
            variant="contained"
            size="small"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={() => fetchFundsSummary(true)}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh from eBay'}
          </Button>
        )}
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        sx={{
          mb: 2,
          minHeight: 40,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab label="Seller Funds" />
        <Tab label="Processing by Available Date" />
      </Tabs>

      {activeTab === 0 && (
        <Box>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!loading && !error && sellers.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No saved seller funds yet. Click Refresh from eBay to load and save data for all stores.
            </Alert>
          )}

          {!loading && sellers.length > 0 && (
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 1.5,
              }}
            >
              <KpiCard
                label="Total Funds"
                value={fmtUSD(totals.total)}
                color="#3b82f6"
                bgcolor="#eff6ff"
              />
              <KpiCard
                label="Available"
                value={fmtUSD(totals.available)}
                color={getAvailableColor(totals.available)}
                bgcolor={totals.available < 0 ? '#fef2f2' : '#f0fdf4'}
              />
              <KpiCard
                label="Processing"
                value={fmtUSD(totals.processing)}
                color="#f59e0b"
                bgcolor="#fffbeb"
              />
              <KpiCard
                label="On Hold"
                value={fmtUSD(totals.onHold)}
                color="#ef4444"
                bgcolor="#fef2f2"
              />
              <KpiCard
                label="Stores"
                value={sellerCount}
                color="text.primary"
                bgcolor="#f8fafc"
              />
            </Box>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
          ) : sellers.length === 0 ? (
            <Alert severity="info">No sellers with eBay connections found in cache. Refresh from eBay to load.</Alert>
          ) : (
            <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
                <Table size="small" stickyHeader>
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
                    {sortedSellers.map((seller) => (
                      <SellerRow
                        key={`${seller.sellerId}-${lastRefresh?.getTime() || 0}`}
                        seller={seller}
                        onHoldExpanded={!!expandedHolds[seller.sellerId]}
                        onToggleHold={toggleHold}
                      />
                    ))}
                    {sellers.length > 1 && (
                      <TableRow sx={{ backgroundColor: '#f1f5f9' }}>
                        <TableCell><Typography variant="body2" fontWeight={700}>TOTAL</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#3b82f6' }}>{fmtUSD(totals.total)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ color: getAvailableColor(totals.available) }}>{fmtUSD(totals.available)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#f59e0b' }}>{fmtUSD(totals.processing)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#ef4444' }}>{fmtUSD(totals.onHold)}</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          {sellers.length === 0 ? (
            <Alert severity="info">
              Load seller funds first (Seller Funds tab → Refresh from eBay), then search processing by date here.
            </Alert>
          ) : (
            <ProcessingByDateSection sellers={sellers} />
          )}
        </Box>
      )}
    </Box>
  );
};

export default SellerFundsPage;
