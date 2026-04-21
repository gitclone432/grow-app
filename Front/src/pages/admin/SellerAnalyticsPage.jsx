import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  TextField,
  Chip,
  Card,
  CardContent,
  Grid
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parse, format } from 'date-fns';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import api from '../../lib/api';

export default function SellerAnalyticsPage() {
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [groupBy, setGroupBy] = useState('day'); // day, week, month
  const [searchMarketplace, setSearchMarketplace] = useState(''); // marketplace filter
  
  // Date filter state - similar to FulfillmentDashboard
  const [dateFilter, setDateFilter] = useState(() => {
    // Default to last 30 days range
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    return {
      mode: 'range',
      single: '',
      from: thirtyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0]
    };
  });
  
  // Month/Year selector for monthly grouping
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 7); // YYYY-MM format
  });
  
  const [analytics, setAnalytics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSellers();
  }, []);

  // Auto-load analytics when filters change
  useEffect(() => {
    // For monthly grouping, use selectedMonth
    if (groupBy === 'month') {
      if (!selectedMonth) return;
      loadAnalytics();
      return;
    }
    
    // For day/week grouping, use date filter
    if (dateFilter.mode === 'none') {
      setAnalytics([]);
      setSummary(null);
      return;
    }
    if (dateFilter.mode === 'single' && !dateFilter.single) {
      return;
    }
    if (dateFilter.mode === 'range' && (!dateFilter.from || !dateFilter.to)) {
      return;
    }
    
    loadAnalytics();
  }, [selectedSeller, groupBy, dateFilter, selectedMonth, searchMarketplace]);

  async function fetchSellers() {
    try {
      const { data } = await api.get('/sellers/all');
      setSellers(data || []);
    } catch (e) {
      console.error('Failed to load sellers:', e);
    }
  }

  async function loadAnalytics() {
    setLoading(true);
    setError('');
    
    try {
      // Prepare date parameters based on groupBy
      let startDate, endDate;
      
      if (groupBy === 'month') {
        // For monthly grouping, use selected month
        if (!selectedMonth) {
          setError('Please select a month');
          setLoading(false);
          return;
        }
        // Get first and last day of selected month
        const [year, month] = selectedMonth.split('-');
        startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
      } else {
        // For day/week grouping, use date filter
        if (dateFilter.mode === 'none') {
          setError('Please select a date range');
          setLoading(false);
          return;
        }
        if (dateFilter.mode === 'single' && !dateFilter.single) {
          setError('Please select a date');
          setLoading(false);
          return;
        }
        if (dateFilter.mode === 'range' && (!dateFilter.from || !dateFilter.to)) {
          setError('Please select start and end dates');
          setLoading(false);
          return;
        }

        if (dateFilter.mode === 'single') {
          startDate = dateFilter.single;
          endDate = dateFilter.single;
        } else if (dateFilter.mode === 'range') {
          startDate = dateFilter.from;
          endDate = dateFilter.to;
        }
      }

      const params = {
        groupBy,
        startDate,
        endDate
      };
      
      if (selectedSeller) params.sellerId = selectedSeller;
      if (searchMarketplace) params.marketplace = searchMarketplace;

      const { data } = await api.get('/ebay/seller-analytics', { params });
      setAnalytics(data.analytics || []);
      setSummary(data.summary || null);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load analytics');
      setAnalytics([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (value) => {
    if (value == null || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return `$${num.toFixed(2)}`;
  };

  const formatINR = (value) => {
    if (value == null || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return `₹${num.toFixed(2)}`;
  };

  const getGroupLabel = (period) => {
    if (groupBy === 'day') {
      return new Date(period).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } else if (groupBy === 'week') {
      return `Week ${period}`;
    } else if (groupBy === 'month') {
      return new Date(period + '-01').toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
    }
    return period;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Seller Analytics</Typography>
        {loading && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">Loading...</Typography>
          </Stack>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2 }}>
          Filters
        </Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Select Seller</InputLabel>
              <Select
                value={selectedSeller}
                label="Select Seller"
                onChange={(e) => setSelectedSeller(e.target.value)}
              >
                <MenuItem value="">All Sellers</MenuItem>
                {sellers.map((seller) => (
                  <MenuItem key={seller._id} value={seller._id}>
                    {seller.user?.username || seller._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Group By</InputLabel>
              <Select
                value={groupBy}
                label="Group By"
                onChange={(e) => setGroupBy(e.target.value)}
              >
                <MenuItem value="day">Daily</MenuItem>
                <MenuItem value="week">Weekly</MenuItem>
                <MenuItem value="month">Monthly</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Marketplace</InputLabel>
              <Select
                value={searchMarketplace}
                label="Marketplace"
                onChange={(e) => setSearchMarketplace(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="EBAY_US">US</MenuItem>
                <MenuItem value="EBAY_ENCA">Canada</MenuItem>
                <MenuItem value="EBAY_AU">Australia</MenuItem>
              </Select>
            </FormControl>

            {groupBy === 'month' ? (
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Select Month"
                  views={['year', 'month']}
                  value={selectedMonth ? parse(selectedMonth + '-01', 'yyyy-MM-dd', new Date()) : null}
                  onChange={(date) => {
                    if (date) {
                      setSelectedMonth(format(date, 'yyyy-MM'));
                    }
                  }}
                  slotProps={{
                    textField: {
                      size: "small",
                      sx: { width: 180 }
                    }
                  }}
                />
              </LocalizationProvider>
            ) : (
              <>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Date Mode</InputLabel>
                  <Select
                    value={dateFilter.mode}
                    label="Date Mode"
                    onChange={(e) => setDateFilter(prev => ({ ...prev, mode: e.target.value }))}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="single">Single Day</MenuItem>
                    <MenuItem value="range">Date Range</MenuItem>
                  </Select>
                </FormControl>

                {dateFilter.mode === 'single' && (
                  <TextField
                    size="small"
                    label="Date"
                    type="date"
                    value={dateFilter.single}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, single: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                  />
                )}

                {dateFilter.mode === 'range' && (
                  <>
                    <TextField
                      size="small"
                      label="From"
                      type="date"
                      value={dateFilter.from}
                      onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      size="small"
                      label="To"
                      type="date"
                      value={dateFilter.to}
                      onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 150 }}
                    />
                  </>
                )}
              </>
            )}

            <Button
              variant="outlined"
              onClick={() => {
                setSelectedSeller('');
                setSearchMarketplace('');
                setGroupBy('day');
                const today = new Date();
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 30);
                setDateFilter({
                  mode: 'range',
                  single: '',
                  from: thirtyDaysAgo.toISOString().split('T')[0],
                  to: today.toISOString().split('T')[0]
                });
                setSelectedMonth(today.toISOString().slice(0, 7));
              }}
              sx={{ minWidth: 80 }}
            >
              Reset
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Total Orders
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 1 }}>
                      {summary.totalOrders}
                    </Typography>
                  </Box>
                  <ShoppingCartIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Total Earnings
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 1, color: 'success.main' }}>
                      {formatCurrency(summary.totalEarnings)}
                    </Typography>
                  </Box>
                  <AttachMoneyIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Total Profit (INR)
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 1, color: 'primary.main' }}>
                      {formatINR(summary.totalProfit)}
                    </Typography>
                  </Box>
                  <TrendingUpIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Avg Order Value
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 1 }}>
                      {formatCurrency(summary.avgOrderValue)}
                    </Typography>
                  </Box>
                  <AccountBalanceIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Analytics Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : analytics.length === 0 ? (
        <Alert severity="info">
          {dateFilter.mode !== 'none'
            ? 'No data found for the selected filters.'
            : 'Select a date range to view analytics.'}
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#e3f2fd', position: 'sticky', top: 0, zIndex: 100 }}>
                  {groupBy === 'day' ? 'Date' : groupBy === 'week' ? 'Week' : 'Month'}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#e3f2fd', position: 'sticky', top: 0, zIndex: 100 }}>Orders</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fff3e0', position: 'sticky', top: 0, zIndex: 100 }}>Subtotal</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fff3e0', position: 'sticky', top: 0, zIndex: 100 }}>Shipping</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fff3e0', position: 'sticky', top: 0, zIndex: 100 }}>Sales Tax</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fff3e0', position: 'sticky', top: 0, zIndex: 100 }}>Transaction Fees</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fff3e0', position: 'sticky', top: 0, zIndex: 100 }}>Ad Fees</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fff9c4', position: 'sticky', top: 0, zIndex: 100 }}>Earnings</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#e1f5fe', position: 'sticky', top: 0, zIndex: 100 }}>P.Balance (INR)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#e8f5e9', position: 'sticky', top: 0, zIndex: 100 }}>A_total-inr</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#fce4ec', position: 'sticky', top: 0, zIndex: 100 }}>Credit Card Fees</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#c8e6c9', position: 'sticky', top: 0, zIndex: 100 }}>Profit (INR)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analytics.map((row, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Chip 
                      label={getGroupLabel(row.period)} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="bold">
                      {row.totalOrders}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatCurrency(row.totalSubtotal)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalShipping)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalSalesTax)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalTransactionFees)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAdFees)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="bold" color="success.main">
                      {formatCurrency(row.totalEarnings)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="bold" color="info.main">
                      {formatINR(row.totalPBalanceINR)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatINR(row.totalAmazonCosts)}</TableCell>
                  <TableCell align="right">{formatINR(row.totalCreditCardFees)}</TableCell>
                  <TableCell align="right">
                    <Typography 
                      variant="body2" 
                      fontWeight="bold" 
                      color={row.totalProfit >= 0 ? 'success.main' : 'error.main'}
                    >
                      {formatINR(row.totalProfit)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals Row */}
              {analytics.length > 0 && (() => {
                const totals = analytics.reduce((acc, row) => ({
                  totalOrders: acc.totalOrders + (row.totalOrders || 0),
                  totalSubtotal: acc.totalSubtotal + (row.totalSubtotal || 0),
                  totalShipping: acc.totalShipping + (row.totalShipping || 0),
                  totalSalesTax: acc.totalSalesTax + (row.totalSalesTax || 0),
                  totalTransactionFees: acc.totalTransactionFees + (row.totalTransactionFees || 0),
                  totalAdFees: acc.totalAdFees + (row.totalAdFees || 0),
                  totalEarnings: acc.totalEarnings + (row.totalEarnings || 0),
                  totalPBalanceINR: acc.totalPBalanceINR + (row.totalPBalanceINR || 0),
                  totalAmazonCosts: acc.totalAmazonCosts + (row.totalAmazonCosts || 0),
                  totalCreditCardFees: acc.totalCreditCardFees + (row.totalCreditCardFees || 0),
                  totalProfit: acc.totalProfit + (row.totalProfit || 0),
                }), {
                  totalOrders: 0, totalSubtotal: 0, totalShipping: 0, totalSalesTax: 0,
                  totalTransactionFees: 0, totalAdFees: 0, totalEarnings: 0,
                  totalPBalanceINR: 0, totalAmazonCosts: 0, totalCreditCardFees: 0, totalProfit: 0,
                });
                const cellSx = { fontWeight: 'bold', bgcolor: '#f5f5f5', borderTop: '2px solid #bdbdbd' };
                return (
                  <TableRow>
                    <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>TOTAL</TableCell>
                    <TableCell align="right" sx={cellSx}>{totals.totalOrders}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(parseFloat(totals.totalSubtotal.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(parseFloat(totals.totalShipping.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(parseFloat(totals.totalSalesTax.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(parseFloat(totals.totalTransactionFees.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatCurrency(parseFloat(totals.totalAdFees.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={{ ...cellSx, color: 'success.main' }}>{formatCurrency(parseFloat(totals.totalEarnings.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={{ ...cellSx, color: 'info.main' }}>{formatINR(parseFloat(totals.totalPBalanceINR.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatINR(parseFloat(totals.totalAmazonCosts.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={cellSx}>{formatINR(parseFloat(totals.totalCreditCardFees.toFixed(2)))}</TableCell>
                    <TableCell align="right" sx={{ ...cellSx, color: totals.totalProfit >= 0 ? 'success.main' : 'error.main' }}>{formatINR(parseFloat(totals.totalProfit.toFixed(2)))}</TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
