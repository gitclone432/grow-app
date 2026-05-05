import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
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
  Chip,
  Button,
  Stack,
  Tooltip,
  Divider,
  TextField
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterListIcon from '@mui/icons-material/FilterList';
import api from '../../lib/api';

const formatCurrency = (amountObj) => {
  if (!amountObj) return '$0.00';
  const val = parseFloat(amountObj.value || 0);
  const currency = amountObj.currency || 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
};

const fmtUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

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

  const processingValue = parseFloat(seller.processingFunds?.value || 0);
  const canExpandProcessing = processingValue > 0;

  const holdValue = parseFloat(seller.fundsOnHold?.value || 0);
  const canExpandHold = holdValue > 0;


  const fetchTransactions = async () => {
    if (!canExpandProcessing || transactions.length > 0) return;
    setLoadingProcessing(true);
    setErrorProcessing(null);
    try {
      const res = await api.get(`/ebay/processing-transactions/${seller.sellerId}`, {
        params: seller.financesMarketplaceId ? { marketplace: seller.financesMarketplaceId } : undefined
      });
      setTransactions(res.data.transactions || []);
    } catch (err) {
      setErrorProcessing(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoadingProcessing(false);
    }
  };

  const fetchHoldTransactions = async () => {
    if (!canExpandHold || holdTransactions.length > 0) return;
    setLoadingHold(true);
    setErrorHold(null);
    try {
      const res = await api.get(`/ebay/onhold-transactions/${seller.sellerId}`, {
        params: seller.financesMarketplaceId ? { marketplace: seller.financesMarketplaceId } : undefined
      });
      setHoldTransactions(res.data.transactions || []);
    } catch (err) {
      setErrorHold(err.response?.data?.error || 'Failed to load on-hold transactions');
    } finally {
      setLoadingHold(false);
    }
  };


  const handleToggleProcessing = () => {
    if (!canExpandProcessing) return;
    const willOpen = !processingOpen;
    setProcessingOpen(willOpen);
    if (willOpen && transactions.length === 0) fetchTransactions();
  };

  const handleToggleHold = () => {
    if (!canExpandHold) return;
    const willOpen = !onHoldExpanded;
    onToggleHold(seller.sellerId);
    if (willOpen && holdTransactions.length === 0) fetchHoldTransactions();
  };

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
          <Typography variant="body2" fontWeight={600} sx={{ color: '#22c55e' }}>
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
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: '#92400e' }}>
                Processing Orders
              </Typography>

              {loadingProcessing && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {errorProcessing && <Alert severity="error" sx={{ mb: 1 }}>{errorProcessing}</Alert>}

              {!loadingProcessing && transactions.length === 0 && !errorProcessing && (
                <Typography variant="body2" color="text.secondary">No processing transactions found.</Typography>
              )}

              {!loadingProcessing && transactions.length > 0 && (
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
                      {transactions.map((txn, idx) => (
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

              {!loadingHold && holdTransactions.length === 0 && !errorHold && (
                <Typography variant="body2" color="text.secondary">No on-hold transactions found.</Typography>
              )}

              {!loadingHold && holdTransactions.length > 0 && (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #fca5a5' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#fee2e2' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Order ID</TableCell>
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

// ============================================
// DATE FILTER - Processing sums by available date
// ============================================
const ProcessingByDateSection = ({ sellers }) => {
  const [filterDate, setFilterDate] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);

  const handleSearch = async () => {
    if (!filterDate) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setFetched(true);

    const sellerResults = [];

    for (const seller of sellers.filter(s => !s.error)) {
      try {
        const res = await api.get(`/ebay/processing-transactions/${seller.sellerId}`, {
          params: seller.financesMarketplaceId ? { marketplace: seller.financesMarketplaceId } : undefined
        });
        const txns = res.data.transactions || [];

        const matchingTxns = txns.filter(txn => {
          if (!txn.availableDate) return false;
          return getDateKeyPST(txn.availableDate) === filterDate;
        });

        const totalAmount = matchingTxns.reduce((sum, txn) => sum + txn.amount, 0);

        if (matchingTxns.length > 0) {
          sellerResults.push({
            sellerId: seller.sellerId,
            sellerName: seller.sellerName,
            totalAmount,
            transactionCount: matchingTxns.length,
            transactions: matchingTxns
          });
        }
      } catch {
        // Skip sellers with errors
      }
    }

    setResults(sellerResults);
    setLoading(false);
  };

  const grandTotal = results.reduce((sum, r) => sum + r.totalAmount, 0);

  return (
    <Paper elevation={3} sx={{ p: 4, borderRadius: 2, backgroundColor: '#fafafa' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterListIcon sx={{ color: '#8b5cf6' }} />
        Processing Funds by Available Date
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a date to see total processing funds becoming available for each seller on that day
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <TextField
          type="date"
          size="small"
          label="Available Date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 220 }}
        />
        <Button
          variant="contained"
          onClick={handleSearch}
          disabled={!filterDate || loading}
          startIcon={loading ? <CircularProgress size={16} /> : <FilterListIcon />}
          sx={{ backgroundColor: '#8b5cf6', '&:hover': { backgroundColor: '#7c3aed' } }}
        >
          {loading ? 'Loading...' : 'Search'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {fetched && !loading && results.length === 0 && (
        <Alert severity="info">No processing funds are becoming available on {filterDate}.</Alert>
      )}

      {!loading && results.length > 0 && (
        <Box>
          <Box sx={{
            p: 2,
            mb: 3,
            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            borderRadius: 2,
            color: 'white'
          }}>
            <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
              Total processing funds becoming available on {formatDateOnlyPST(filterDate + 'T12:00:00Z')}
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {fmtUSD(grandTotal)}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Across {results.length} seller{results.length > 1 ? 's' : ''}
            </Typography>
          </Box>

          <TableContainer component={Paper} elevation={2}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f3ff' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Seller</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Orders</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.sellerId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{r.sellerName}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={r.transactionCount} size="small" sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700} sx={{ color: '#8b5cf6' }}>
                        {fmtUSD(r.totalAmount)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {results.length > 1 && (
                  <TableRow sx={{ backgroundColor: '#f5f3ff' }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>TOTAL</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={results.reduce((s, r) => s + r.transactionCount, 0)}
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight={700} sx={{ color: '#8b5cf6' }}>
                        {fmtUSD(grandTotal)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Paper>
  );
};

// ============================================
// MAIN PAGE
// ============================================
const SellerFundsPage = () => {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [expandedHolds, setExpandedHolds] = useState({});

  const fetchFundsSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/ebay/seller-funds-summary');
      setSellers(res.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch seller funds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFundsSummary();
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

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Seller Funds Overview</Typography>
          <Typography variant="body2" color="text.secondary">
            Live data from eBay Finances API
            {lastRefresh && ` • Last refreshed: ${lastRefresh.toLocaleTimeString()}`}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchFundsSummary} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ===== SECTION 1: SELLER FUNDS OVERVIEW ===== */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : sellers.length === 0 ? (
        <Alert severity="info">No sellers with eBay connections found.</Alert>
      ) : (
        <Paper elevation={3} sx={{ mb: 5, overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Seller</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#3b82f6' }}>Total Funds</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#22c55e' }}>Available</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#f59e0b' }}>Processing</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#ef4444' }}>On Hold</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sellers.map((seller) => (
                  <SellerRow
                    key={seller.sellerId}
                    seller={seller}
                    onHoldExpanded={!!expandedHolds[seller.sellerId]}
                    onToggleHold={toggleHold}
                  />
                ))}
                {sellers.length > 1 && (
                  <TableRow sx={{ backgroundColor: '#f1f5f9' }}>
                    <TableCell><Typography variant="body2" fontWeight={700}>TOTAL</Typography></TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight={700} sx={{ color: '#3b82f6' }}>{fmtUSD(totals.total)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight={700} sx={{ color: '#22c55e' }}>{fmtUSD(totals.available)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight={700} sx={{ color: '#f59e0b' }}>{fmtUSD(totals.processing)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight={700} sx={{ color: '#ef4444' }}>{fmtUSD(totals.onHold)}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ===== SECTION 2: PROCESSING FUNDS BY AVAILABLE DATE ===== */}
      {!loading && sellers.length > 0 && (
        <>
          <Divider sx={{ my: 5 }}>
            <Chip label="SECTION 2" size="small" sx={{ fontWeight: 600, backgroundColor: '#e0e7ff' }} />
          </Divider>
          <ProcessingByDateSection sellers={sellers} />
        </>
      )}

    </Box>
  );
};

export default SellerFundsPage;
