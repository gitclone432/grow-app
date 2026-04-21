import React, { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Snackbar,
  Chip,
  FormControlLabel,
  Switch,
} from '@mui/material';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ClearIcon from '@mui/icons-material/Clear';
import CalculateIcon from '@mui/icons-material/Calculate';
import api from '../../lib/api';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import OrderDetailsModal from '../../components/OrderDetailsModal';
import BBECalculatorModal from '../../components/BBECalculatorModal';

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export default function AccountHealthReportPage() {
  const [tabValue, setTabValue] = useState(0);

  // SNAD Details state
  const [details, setDetails] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [hideInactiveDetails, setHideInactiveDetails] = useState(false);

  // Evaluation Windows state
  const [windows, setWindows] = useState([]);
  const [windowsLoading, setWindowsLoading] = useState(false);

  // Overview state
  const [overviewData, setOverviewData] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewMarketAvg, setOverviewMarketAvg] = useState(1.1);

  // Shared state
  const [sellers, setSellers] = useState([]);
  const [error, setError] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // Filters
  const [sellerFilter, setSellerFilter] = useState('');
  const [dateFilter, setDateFilter] = useState({
    mode: 'all',
    from: '',
    to: ''
  });

  // Selected order for modal
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // Calculator state
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [initialCalcSales, setInitialCalcSales] = useState(0);
  const [initialCalcSnad, setInitialCalcSnad] = useState(0);

  // Fetch sellers on mount
  useEffect(() => {
    async function fetchSellers() {
      try {
        const res = await api.get('/sellers/all');
        const sellerList = res.data || [];
        setSellers(sellerList);
        if (!sellerFilter && sellerList.length > 0) {
          setSellerFilter(sellerList[0]._id);
        }
      } catch (e) {
        console.error('Failed to fetch sellers:', e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchSellers();
  }, []);

  // Load SNAD details
  useEffect(() => {
    if (!sellerFilter) return;
    loadDetails();
  }, [sellerFilter, dateFilter]);

  // Load evaluation windows
  useEffect(() => {
    if (!sellerFilter) return;
    loadEvaluationWindows();
  }, [sellerFilter]);

  // Load overview on mount
  useEffect(() => {
    loadOverview();
  }, []);

  async function loadDetails() {
    setDetailsLoading(true);
    setError('');
    try {
      const params = {};
      if (sellerFilter) params.sellerId = sellerFilter;
      if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      const res = await api.get('/account-health/details', { params });
      setDetails(res.data.details || []);
    } catch (e) {
      console.error('Failed to load SNAD details:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function loadEvaluationWindows() {
    setWindowsLoading(true);
    try {
      const params = {};
      if (sellerFilter) params.sellerId = sellerFilter;

      const res = await api.get('/account-health/evaluation-windows', { params });
      setWindows(res.data.windows || []);
    } catch (e) {
      console.error('Failed to load evaluation windows:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setWindowsLoading(false);
    }
  }

  async function loadOverview() {
    setOverviewLoading(true);
    try {
      const res = await api.get('/account-health/overview');
      setOverviewData(res.data.overview || []);
      setOverviewMarketAvg(res.data.marketAvg || 1.1);
    } catch (e) {
      console.error('Failed to load overview:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setOverviewLoading(false);
    }
  }

  async function handleSellerFaultChange(orderId, newValue) {
    try {
      await api.patch(`/account-health/details/${orderId}`, { sellerFault: newValue });
      setDetails(prev => prev.map(d =>
        d._id === orderId ? { ...d, sellerFault: newValue } : d
      ));
      setSnackbarMsg('Seller Fault updated successfully');
      setSnackbarOpen(true);
    } catch (e) {
      console.error('Failed to update seller fault:', e);
      setError(e.response?.data?.error || e.message);
    }
  }

  // Market Avg Editing
  const [editingMarketAvg, setEditingMarketAvg] = useState(null); // { key, value }
  const [savingMarketAvg, setSavingMarketAvg] = useState(false);

  async function handleUpdateMarketAvg(rowKey, effectiveDate, sellerId) {
    if (!editingMarketAvg || editingMarketAvg.key !== rowKey) return;

    // Don't save if value hasn't changed (optional optimization, but user logic says "new avg used going forward")
    // Use parseFloat to compare

    setSavingMarketAvg(true);
    try {
      await api.post('/account-health/evaluation-windows/market-avg', {
        value: editingMarketAvg.value,
        effectiveDate: effectiveDate, // This window's end date is the effective date for 'going forward' logic
        sellerId: sellerId || sellerFilter
      });

      setSnackbarMsg('Market Average updated successfully');
      setSnackbarOpen(true);
      setEditingMarketAvg(null);

      // Reload windows to reflect changes (and potential 'going forward' implications)
      await loadEvaluationWindows();
    } catch (e) {
      console.error('Failed to update market avg:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setSavingMarketAvg(false);
    }
  }

  const handleClearFilters = () => {
    if (sellers.length > 0) {
      setSellerFilter(sellers[0]._id);
    }
    setDateFilter({ mode: 'all', from: '', to: '' });
  };

  const handleCopy = (text) => {
    if (!text || text === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setSnackbarMsg('Copied to clipboard');
      setSnackbarOpen(true);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  const formatWindowDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const getActualDataWindowStart = (w) => {
    if (w?.windowStart) return w.windowStart;
    // Fallback for legacy payloads that may not include windowStart
    if (w?.evaluationWindowEnd) {
      const d = new Date(w.evaluationWindowEnd);
      d.setDate(d.getDate() - 84);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    return '';
  };

  const getActualDataWindowEnd = (w) => {
    if (w?.windowStart) {
      const d = new Date(w.windowStart);
      d.setDate(d.getDate() + 83); // 84-day inclusive window
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    }
    // Fallback for legacy payloads
    if (w?.evaluationWindowEnd) {
      const d = new Date(w.evaluationWindowEnd);
      d.setDate(d.getDate() - 1);
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    }
    return '';
  };

  const hasActiveFilters = dateFilter.mode !== 'all' || (sellers.length > 0 && sellerFilter !== sellers[0]._id);

  const isDetailStillCounted = (detail) => {
    if (!detail?.remarkDate) return true;
    const remarkDate = new Date(detail.remarkDate);
    if (Number.isNaN(remarkDate.getTime())) return true;
    return remarkDate >= new Date();
  };

  const visibleDetails = useMemo(() => {
    if (!hideInactiveDetails) return details;
    return details.filter(isDetailStillCounted);
  }, [details, hideInactiveDetails]);

  // CSV Export for SNAD Details
  const handleExportDetails = () => {
    const csvData = prepareCSVData(visibleDetails, {
      'Order Date': (d) => formatDate(d.orderDate),
      'Order ID': 'orderId',
      'Item ID': 'itemId',
      'SNAD Count': 'snadCount',
      'Seller Fault': 'sellerFault',
      'INR': 'hasInr',
      'Remark (Expiry Date)': (d) => formatDate(d.remarkDate),
      'Seller': (d) => d.seller?.username || '',
    });
    downloadCSV(csvData, 'Account_Health_SNAD_Details');
  };

  // CSV Export for Evaluation Windows
  const handleExportWindows = () => {
    const csvData = prepareCSVData(windows, {
      'Evaluation Window': (w) => `${formatWindowDate(getActualDataWindowStart(w))} - ${formatWindowDate(getActualDataWindowEnd(w))}`,
      'Total Sales': 'totalSales',
      'BBE Rate (%)': 'bbeRate',
      'Market Avg': 'marketAvg',
      'Evaluation Date': (w) => formatDate(w.evaluationDate),
      'SNAD Count': 'snadCount',
    });
    downloadCSV(csvData, 'Account_Health_Evaluation_Windows');
  };

  // Get BBE Rate color based on value
  const getBbeRateColor = (rate, marketAvg) => {
    const rateNum = parseFloat(rate);
    if (rateNum > marketAvg * 1.5) return 'error.main';
    if (rateNum > marketAvg) return 'warning.main';
    return 'success.main';
  };

  // Compute Store Status for each evaluation window
  // Logic: Per-seller tracking. Status escalates when BBE rate increases while above market avg,
  // and de-escalates when BBE rate decreases (but never below Non-Compliant while above market avg).
  // Levels: Compliant (green) → Non-Compliant (yellow) → Warning (orange) → Action Taken (red)
  const STATUS_LEVELS = ['Compliant', 'Non-Compliant', 'Warning', 'Action Taken'];
  const STATUS_COLORS = {
    'Compliant': '#4caf50',      // Green
    'Non-Compliant': '#ffeb3b',  // Yellow
    'Warning': '#ff9800',        // Orange
    'Action Taken': '#f44336'    // Red
  };

  const windowsWithStatus = useMemo(() => {
    if (!windows || windows.length === 0) return [];

    // Group windows by seller
    const sellerWindowsMap = {};
    for (const w of windows) {
      const sellerId = w.sellerId || w.seller?._id || 'unknown';
      if (!sellerWindowsMap[sellerId]) {
        sellerWindowsMap[sellerId] = [];
      }
      sellerWindowsMap[sellerId].push(w);
    }

    const result = [];

    // Process each seller's windows independently
    for (const sellerId of Object.keys(sellerWindowsMap)) {
      const sellerWindows = sellerWindowsMap[sellerId];

      // Sort oldest first for chronological processing
      const sortedWindows = [...sellerWindows].sort((a, b) =>
        new Date(a.evaluationWindowEnd || a.windowEnd) - new Date(b.evaluationWindowEnd || b.windowEnd)
      );

      let currentStatusLevel = 0; // 0 = Compliant
      let prevBbeRate = null;

      for (const w of sortedWindows) {
        const bbeRate = parseFloat(w.bbeRate);
        const marketAvg = parseFloat(w.marketAvg);
        const isAbove = bbeRate > marketAvg;

        if (!isAbove) {
          // Below market avg → Compliant
          currentStatusLevel = 0;
        } else {
          // Above market avg
          if (currentStatusLevel === 0) {
            // First time going above → Non-Compliant
            currentStatusLevel = 1;
          } else if (prevBbeRate !== null) {
            // Compare with previous week
            if (bbeRate > prevBbeRate) {
              // BBE increased → escalate (max level 3)
              currentStatusLevel = Math.min(currentStatusLevel + 1, 3);
            } else if (bbeRate < prevBbeRate) {
              // BBE decreased → de-escalate (min level 1 while above market avg)
              currentStatusLevel = Math.max(currentStatusLevel - 1, 1);
            }
            // If equal, stay at same level
          }
        }

        prevBbeRate = bbeRate;

        const status = STATUS_LEVELS[currentStatusLevel];
        const statusColor = STATUS_COLORS[status];

        result.push({ ...w, storeStatus: status, storeStatusColor: statusColor });
      }
    }

    // Sort back to newest first for display
    return result.sort((a, b) =>
      new Date(b.evaluationWindowEnd || b.windowEnd) - new Date(a.evaluationWindowEnd || a.windowEnd)
    );
  }, [windows]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <HealthAndSafetyIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4">Account Health Report</Typography>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success">
          {snackbarMsg}
        </Alert>
      </Snackbar>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              label="Seller"
            >
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.user?.username || s._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Date</InputLabel>
            <Select
              value={dateFilter.mode}
              onChange={(e) => setDateFilter({ ...dateFilter, mode: e.target.value })}
              label="Date"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="range">Date Range</MenuItem>
            </Select>
          </FormControl>

          {dateFilter.mode === 'range' && (
            <>
              <TextField
                type="date"
                size="small"
                value={dateFilter.from}
                onChange={(e) => setDateFilter({ ...dateFilter, from: e.target.value })}
                label="From"
                InputLabelProps={{ shrink: true }}
              />
              <Typography variant="body2">to</Typography>
              <TextField
                type="date"
                size="small"
                value={dateFilter.to}
                onChange={(e) => setDateFilter({ ...dateFilter, to: e.target.value })}
                label="To"
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}

          {hasActiveFilters && (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              color="inherit"
            >
              Clear Filters
            </Button>
          )}

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { loadDetails(); loadEvaluationWindows(); }}
            disabled={detailsLoading || windowsLoading}
          >
            Refresh
          </Button>
        </Stack>
      </Paper>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(e, newValue) => setTabValue(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Overview" />
          <Tab label={`SNAD Details (${details.length})`} />
          <Tab label={`Evaluation Windows (${windows.length})`} />
        </Tabs>
      </Paper>

      {/* Overview Tab */}
      <TabPanel value={tabValue} index={0}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Account Health Overview - All Sellers</Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadOverview}
            disabled={overviewLoading}
          >
            Refresh
          </Button>
        </Stack>

        {overviewLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell><strong>Store</strong></TableCell>
                  <TableCell align="center"><strong>Week 1</strong></TableCell>
                  <TableCell align="center"><strong>Week 2</strong></TableCell>
                  <TableCell align="center"><strong>Week 3</strong></TableCell>
                  <TableCell align="center"><strong>Week 4</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {overviewData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary">No data available</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  overviewData.map((seller) => (
                    <TableRow key={seller.sellerId} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">{seller.sellerName}</Typography>
                      </TableCell>
                      {seller.weeks.map((week, idx) => (
                        <TableCell key={idx} align="center">
                          {week.type === 'actual' ? (
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 'bold',
                                color: week.bbeRate <= overviewMarketAvg ? 'success.main' :
                                  week.bbeRate <= overviewMarketAvg * 1.2 ? 'warning.main' : 'error.main'
                              }}
                            >
                              {week.bbeRate}%
                            </Typography>
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 'bold',
                                color: week.salesNeeded <= 0 ? 'success.main' : 'error.main'
                              }}
                            >
                              {week.salesNeeded <= 0 ? '✓' : `+${week.salesNeeded}`}
                            </Typography>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* SNAD Details Tab */}
      <TabPanel value={tabValue} index={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap mb={2}>
          <FormControlLabel
            control={(
              <Switch
                checked={hideInactiveDetails}
                onChange={(e) => setHideInactiveDetails(e.target.checked)}
              />
            )}
            label="Hide no longer counted"
          />
          <Button
            variant="outlined"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={handleExportDetails}
            disabled={visibleDetails.length === 0}
          >
            Download CSV ({visibleDetails.length})
          </Button>
        </Stack>

        {detailsLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer
            component={Paper}
            sx={{
              maxWidth: '100%',
              overflowX: 'auto',
              '&::-webkit-scrollbar': { height: '8px' },
              '&::-webkit-scrollbar-track': { backgroundColor: '#f1f1f1' },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '4px',
                '&:hover': { backgroundColor: '#555' }
              },
            }}
          >
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell><strong>Order Date</strong></TableCell>
                  <TableCell><strong>Order ID</strong></TableCell>
                  <TableCell><strong>Item ID</strong></TableCell>
                  <TableCell><strong>SNAD Count</strong></TableCell>
                  <TableCell><strong>Seller Fault</strong></TableCell>
                  <TableCell><strong>INR</strong></TableCell>
                  <TableCell><strong>Remark (Expiry)</strong></TableCell>
                  <TableCell><strong>Seller</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleDetails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" py={2}>
                        {details.length === 0 ? 'No SNAD records found.' : 'No SNAD records match the current toggle.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleDetails.map((d) => (
                    <TableRow key={d._id} hover>
                      <TableCell>{formatDate(d.orderDate)}</TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              color: 'primary.main',
                              '&:hover': { textDecoration: 'underline' }
                            }}
                            onClick={() => setSelectedOrderId(d.orderId)}
                          >
                            {d.orderId || d.legacyOrderId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(d.orderId || d.legacyOrderId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {d.itemId || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 'bold',
                            color: d.snadCount > 0 ? 'error.main' : 'text.primary'
                          }}
                        >
                          {d.snadCount}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 80 }}>
                          <Select
                            value={d.sellerFault || 'No'}
                            onChange={(e) => handleSellerFaultChange(d._id, e.target.value)}
                            sx={{ fontSize: '0.8rem' }}
                          >
                            <MenuItem value="Yes">Yes</MenuItem>
                            <MenuItem value="No">No</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ color: d.hasInr ? 'warning.main' : 'text.secondary' }}
                        >
                          {d.hasInr || 0}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Data expires from calculation on this date">
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {formatDate(d.remarkDate)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{d.seller?.username || '-'}</Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Evaluation Windows Tab */}
      <TabPanel value={tabValue} index={2}>
        <Stack direction="row" justifyContent="flex-end" mb={2}>
          <Button
            variant="outlined"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={handleExportWindows}
            disabled={windows.length === 0}
          >
            Download CSV ({windows.length})
          </Button>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<CalculateIcon />}
            onClick={() => {
              // Pre-fill with the latest window data if available
              if (windows.length > 0) {
                setInitialCalcSales(windows[0].totalSales);
                setInitialCalcSnad(windows[0].snadCount);
              }
              setCalculatorOpen(true);
            }}
          >
            Calculator
          </Button>
        </Stack>

        {windowsLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell><strong>Evaluation Window</strong></TableCell>
                  <TableCell><strong>Total Sales</strong></TableCell>
                  <TableCell><strong>BBE Rate (%)</strong></TableCell>
                  <TableCell><strong>Market Avg</strong></TableCell>
                  <TableCell><strong>Store Status</strong></TableCell>
                  <TableCell><strong>Evaluation Date</strong></TableCell>
                  <TableCell><strong>Total SNAD Count</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {windowsWithStatus.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" py={2}>
                        No evaluation windows found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  windowsWithStatus.map((w, idx) => {
                    const rowKey = `${w.sellerId || w.seller?._id || 'unknown'}-${w.evaluationWindowEnd || w.windowEnd || idx}`;
                    // Show next evaluation cycle date (current row date + 7 days).
                    const nextEvaluationDate = (() => {
                      if (!w.evaluationDate) return null;
                      const d = new Date(w.evaluationDate);
                      d.setDate(d.getDate() + 7);
                      return d.toISOString();
                    })();
                    return (
                      <TableRow key={rowKey} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {formatWindowDate(getActualDataWindowStart(w))} - {formatWindowDate(getActualDataWindowEnd(w))}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{w.totalSales}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 'bold',
                              color: getBbeRateColor(w.bbeRate, w.marketAvg)
                            }}
                          >
                            {w.bbeRate}%
                          </Typography>
                        </TableCell>
                        <TableCell
                          onClick={() => setEditingMarketAvg({ key: rowKey, value: w.marketAvg })}
                          sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f0f0f0' } }}
                        >
                          {editingMarketAvg?.key === rowKey ? (
                            <TextField
                              autoFocus
                              size="small"
                              type="number"
                              value={editingMarketAvg.value}
                              onChange={(e) => setEditingMarketAvg({ ...editingMarketAvg, value: e.target.value })}
                              onBlur={() => handleUpdateMarketAvg(rowKey, w.evaluationWindowEnd || w.windowEnd, w.sellerId || w.seller?._id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateMarketAvg(rowKey, w.evaluationWindowEnd || w.windowEnd, w.sellerId || w.seller?._id);
                                } else if (e.key === 'Escape') {
                                  setEditingMarketAvg(null);
                                }
                              }}
                              inputProps={{ step: 0.1, style: { padding: '4px 8px' } }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={savingMarketAvg}
                            />
                          ) : (
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Typography variant="body2">{w.marketAvg}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>(edit)</Typography>
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={w.storeStatus}
                            size="small"
                            sx={{
                              fontWeight: 'bold',
                              bgcolor: w.storeStatusColor,
                              color: w.storeStatus === 'Non-Compliant' ? '#000' : '#fff'
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(nextEvaluationDate || w.evaluationDate)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{w.snadCount}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Order Details Modal */}
      <OrderDetailsModal
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />

      {/* BBE Calculator Modal */}
      <BBECalculatorModal
        open={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
        initialSales={initialCalcSales}
        initialSnad={initialCalcSnad}
      />
    </Box>
  );
}
