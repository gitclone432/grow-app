import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  TextField,
  Alert,
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Tabs,
  Tab,
  Chip,
  Card,
  CardContent,
  TablePagination
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';

const formatCurrency = (val) => {
  if (val === undefined || val === null || val === '') return '$0.00';
  const num = parseFloat(val);
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

const MARKETPLACES = [
  { value: 'EBAY_US', label: 'eBay US' },
  { value: 'EBAY_GB', label: 'eBay UK' },
  { value: 'EBAY_AU', label: 'eBay Australia' },
  { value: 'EBAY_CA', label: 'eBay Canada' }
];

export default function FinanceCashflowPage() {
  // Display state
  const [rows, setRows] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  
  // Multi-account summary state
  const [summaryFrom, setSummaryFrom] = useState('');
  const [summaryTo, setSummaryTo] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState([]);

  // Form state
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    sellerId: '',
    marketplace: 'EBAY_US',
    date: new Date().toISOString().split('T')[0],
    gross: '',
    taxesAndFees: '',
    sellingCosts: '',
    payoneerId: '',
    notes: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Analytics state
  const [tabValue, setTabValue] = useState(0);
  const [chartType, setChartType] = useState('bar'); // 'bar', 'line', 'area', 'pie'
  const [chartData, setChartData] = useState([]);
  const [accountChartData, setAccountChartData] = useState([]);
  const [marketplaceChartData, setMarketplaceChartData] = useState([]);
  
  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Chart color schemes
  const CHART_COLORS = {
    gross: '#3B82F6',
    taxes: '#F59E0B',
    selling: '#EF4444',
    net: '#10B981',
    account1: '#8B5CF6',
    account2: '#EC4899',
    account3: '#06B6D4',
    account4: '#F97316'
  };

  const PIE_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

  // Fetch seller list on mount
  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const { data } = await api.get('/ebay/sellers-list');
        setSellers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load sellers:', err);
      }
    };
    fetchSellers();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (from) params.startDate = from;
      if (to) params.endDate = to;
      if (selectedSeller) params.sellerId = selectedSeller;
      if (selectedMarketplace) params.marketplace = selectedMarketplace;
      
      const { data } = await api.get('/ebay/cashflow', { params });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load cashflow');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedSeller, selectedMarketplace]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenDialog = (entry = null, seller = null) => {
    if (entry && seller) {
      // Editing mode
      setEditingId(entry.id);
      setFormData({
        sellerId: seller.sellerId,
        marketplace: entry.marketplace,
        date: new Date(entry.date).toISOString().split('T')[0],
        gross: entry.gross.value.toString(),
        taxesAndFees: entry.taxesAndFees.value.toString(),
        sellingCosts: entry.sellingCosts.value.toString(),
        payoneerId: entry.payoneerId || '',
        notes: entry.notes || ''
      });
    } else {
      // Create mode - set date to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      setEditingId(null);
      setFormData({
        sellerId: '',
        marketplace: 'EBAY_US',
        date: yesterday.toISOString().split('T')[0],
        gross: '',
        taxesAndFees: '',
        sellingCosts: '',
        payoneerId: '',
        notes: ''
      });
    }
    setFormError('');
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingId(null);
    setFormError('');
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitForm = async () => {
    setFormError('');
    
    if (!formData.sellerId) {
      setFormError('Please select an account');
      return;
    }
    if (!formData.date) {
      setFormError('Please select a date');
      return;
    }
    if (!formData.gross && !formData.taxesAndFees && !formData.sellingCosts) {
      setFormError('Please enter at least one amount');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        // Update
        await api.patch(`/ebay/cashflow/${editingId}`, {
          gross: parseFloat(formData.gross) || 0,
          taxesAndFees: parseFloat(formData.taxesAndFees) || 0,
          sellingCosts: parseFloat(formData.sellingCosts) || 0,
          payoneerId: formData.payoneerId,
          notes: formData.notes
        });
      } else {
        // Create
        await api.post('/ebay/cashflow', {
          sellerId: formData.sellerId,
          marketplace: formData.marketplace,
          date: formData.date,
          gross: parseFloat(formData.gross) || 0,
          taxesAndFees: parseFloat(formData.taxesAndFees) || 0,
          sellingCosts: parseFloat(formData.sellingCosts) || 0,
          payoneerId: formData.payoneerId,
          notes: formData.notes
        });
      }
      handleCloseDialog();
      load(); // Refresh table
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return;
    
    try {
      await api.delete(`/ebay/cashflow/${entryId}`);
      load(); // Refresh table
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete entry');
    }
  };

  // Chart data aggregation functions
  const prepareChartData = useCallback(() => {
    if (rows.length === 0) {
      setChartData([]);
      setAccountChartData([]);
      setMarketplaceChartData([]);
      return;
    }

    // Group by date for timeline chart
    const dateMap = new Map();
    const accountMap = new Map();
    const marketplaceMap = new Map();

    rows.forEach(seller => {
      (seller.marketplaces || []).forEach(mp => {
        const dateStr = new Date(mp.date).toLocaleDateString('en-US');
        
        // Date chart data
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, {
            date: dateStr,
            gross: 0,
            taxesAndFees: 0,
            sellingCosts: 0,
            net: 0
          });
        }
        const dateData = dateMap.get(dateStr);
        dateData.gross += parseFloat(mp.gross.value || 0);
        dateData.taxesAndFees += parseFloat(mp.taxesAndFees.value || 0);
        dateData.sellingCosts += parseFloat(mp.sellingCosts.value || 0);
        dateData.net += parseFloat(mp.net.value || 0);

        // Account chart data
        const accountKey = seller.sellerName;
        if (!accountMap.has(accountKey)) {
          accountMap.set(accountKey, {
            name: accountKey,
            gross: 0,
            taxesAndFees: 0,
            sellingCosts: 0,
            net: 0
          });
        }
        const accountData = accountMap.get(accountKey);
        accountData.gross += parseFloat(mp.gross.value || 0);
        accountData.taxesAndFees += parseFloat(mp.taxesAndFees.value || 0);
        accountData.sellingCosts += parseFloat(mp.sellingCosts.value || 0);
        accountData.net += parseFloat(mp.net.value || 0);

        // Marketplace chart data
        const marketplaceKey = mp.marketplace;
        if (!marketplaceMap.has(marketplaceKey)) {
          marketplaceMap.set(marketplaceKey, {
            name: marketplaceKey,
            gross: 0,
            taxesAndFees: 0,
            sellingCosts: 0,
            net: 0
          });
        }
        const mpData = marketplaceMap.get(marketplaceKey);
        mpData.gross += parseFloat(mp.gross.value || 0);
        mpData.taxesAndFees += parseFloat(mp.taxesAndFees.value || 0);
        mpData.sellingCosts += parseFloat(mp.sellingCosts.value || 0);
        mpData.net += parseFloat(mp.net.value || 0);
      });
    });

    setChartData(Array.from(dateMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date)));
    setAccountChartData(Array.from(accountMap.values()));
    setMarketplaceChartData(Array.from(marketplaceMap.values()));
  }, [rows]);

  useEffect(() => {
    prepareChartData();
  }, [rows, prepareChartData]);

  // Calculate summary totals for selected accounts
  const calculateSummaryTotals = useCallback(() => {
    if (!selectedAccounts.length) {
      return { totalGross: 0, totalNet: 0, totalTaxesAndFees: 0, totalSellingCosts: 0 };
    }

    let totalGross = 0;
    let totalNet = 0;
    let totalTaxesAndFees = 0;
    let totalSellingCosts = 0;

    rows.forEach(seller => {
      if (selectedAccounts.includes(seller.sellerId)) {
        // Check if we need to filter by date range
        if (summaryFrom || summaryTo) {
          const summaryFromDate = summaryFrom ? new Date(summaryFrom) : new Date('1900-01-01');
          const summaryToDate = summaryTo ? new Date(summaryTo) : new Date('2099-12-31');

          (seller.marketplaces || []).forEach(mp => {
            const mpDate = new Date(mp.date);
            if (mpDate >= summaryFromDate && mpDate <= summaryToDate) {
              totalGross += parseFloat(mp.gross.value || 0);
              totalNet += parseFloat(mp.net.value || 0);
              totalTaxesAndFees += parseFloat(mp.taxesAndFees.value || 0);
              totalSellingCosts += parseFloat(mp.sellingCosts.value || 0);
            }
          });
        } else {
          // If no date filter, use all data for this account
          totalGross += parseFloat(seller.gross.value || 0);
            totalNet += parseFloat(seller.net.value || 0);
            totalTaxesAndFees += parseFloat(seller.taxesAndFees.value || 0);
            totalSellingCosts += parseFloat(seller.sellingCosts.value || 0);
        }
      }
    });

      return { totalGross, totalNet, totalTaxesAndFees, totalSellingCosts };
  }, [rows, selectedAccounts, summaryFrom, summaryTo]);
    const { totalGross, totalNet, totalTaxesAndFees, totalSellingCosts } = calculateSummaryTotals();

  // Reset pagination when rows change
  useEffect(() => {
    setPage(0);
  }, [rows]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Generate paginated rows data
  const getPaginatedData = () => {
    let allRows = [];
    rows.forEach((seller) => {
      // Add seller header
      allRows.push({
        type: 'seller-header',
        id: `seller-${seller.sellerId}`,
        data: seller
      });
      // Add individual entries
      if (seller.marketplaces && seller.marketplaces.length > 0) {
        seller.marketplaces.forEach((mp) => {
          allRows.push({
            type: 'entry',
            id: `entry-${mp.id}`,
            seller,
            mp
          });
        });
      }
    });
    
    const startIdx = page * rowsPerPage;
    const endIdx = startIdx + rowsPerPage;
    return allRows.slice(startIdx, endIdx);
  };

  const getTotalRows = () => {
    return rows.reduce((sum, seller) => {
      const sellerHeaderCount = 1;
      const entriesCount = seller.marketplaces?.length || 0;
      return sum + sellerHeaderCount + entriesCount;
    }, 0);
  };

  return (
    <Box sx={{ pb: 4 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
        <Typography color="text.secondary">Finance & Cash Flow</Typography>
        <Typography color="text.primary" fontWeight={600}>Gross & Net</Typography>
      </Breadcrumbs>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Gross & Net</Typography>
        <Button startIcon={<RefreshIcon />} size="small" onClick={load}>Refresh</Button>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => handleOpenDialog()}>
          Add Entry
        </Button>
      </Stack>

      {/* Multi-Account Summary Section */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 2, background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)' }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
            📊 Multi-Account Summary
          </Typography>
          
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            <FormControl size="small" sx={{ minWidth: 300, flex: 1 }}>
              <InputLabel>Select Accounts</InputLabel>
              <Select
                multiple
                value={selectedAccounts}
                onChange={(e) => setSelectedAccounts(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                label="Select Accounts"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => {
                      const seller = sellers.find(s => s._id === value);
                      return (
                        <Chip 
                          key={value} 
                          label={seller?.user?.username || value} 
                          size="small"
                          sx={{ 
                            bgcolor: '#3B82F6',
                            color: '#fff',
                            fontWeight: 600,
                            '& .MuiChip-deleteIcon': { color: '#fff', '&:hover': { color: '#fff' } }
                          }}
                        />
                      );
                    })}
                  </Box>
                )}
              >
                {sellers.map(s => (
                  <MenuItem key={s._id} value={s._id} sx={{ fontSize: '0.95rem' }}>
                    {s.user?.username || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField 
              label="From" 
              type="date" 
              size="small" 
              InputLabelProps={{ shrink: true }} 
              value={summaryFrom} 
              onChange={(e) => setSummaryFrom(e.target.value)} 
              sx={{ minWidth: 150 }}
            />
            <TextField 
              label="To" 
              type="date" 
              size="small" 
              InputLabelProps={{ shrink: true }} 
              value={summaryTo} 
              onChange={(e) => setSummaryTo(e.target.value)}
              sx={{ minWidth: 150 }}
            />
            
            {selectedAccounts.length > 0 && (
              <Button 
                variant="outlined" 
                color="error" 
                size="small"
                onClick={() => setSelectedAccounts([])}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Clear
              </Button>
            )}
          </Stack>

          {selectedAccounts.length > 0 && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3}>
                <Card sx={{ 
                  background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                }}>
                  <CardContent>
                    <Typography color="rgba(255, 255, 255, 0.9)" sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>
                      Total Gross (Total Sales)
                    </Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
                      {formatCurrency(totalGross)}
                    </Typography>
                    <Typography color="rgba(255, 255, 255, 0.8)" sx={{ fontSize: '0.75rem', mt: 1 }}>
                      {selectedAccounts.length} account{selectedAccounts.length !== 1 ? 's' : ''} selected
                    </Typography>
                  </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={3}>
                    <Card sx={{ 
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}>
                  <CardContent>
                    <Typography color="rgba(255, 255, 255, 0.9)" sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>
                      Total Net (Net Sales)
                    </Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
                      {formatCurrency(totalNet)}
                    </Typography>
                    <Typography color="rgba(255, 255, 255, 0.8)" sx={{ fontSize: '0.75rem', mt: 1 }}>
                      {summaryFrom || summaryTo ? `${summaryFrom || 'Start'} to ${summaryTo || 'End'}` : 'All dates'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
                  <Grid item xs={12} sm={3}>
                    <Card sx={{ 
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
                    }}>
                      <CardContent>
                        <Typography color="rgba(255, 255, 255, 0.9)" sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>
                          Total Taxes & Fees
                        </Typography>
                        <Typography sx={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
                          {formatCurrency(totalTaxesAndFees)}
                        </Typography>
                        <Typography color="rgba(255, 255, 255, 0.8)" sx={{ fontSize: '0.75rem', mt: 1 }}>
                          {summaryFrom || summaryTo ? `${summaryFrom || 'Start'} to ${summaryTo || 'End'}` : 'All dates'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={3}>
                    <Card sx={{ 
                      background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                    }}>
                      <CardContent>
                        <Typography color="rgba(255, 255, 255, 0.9)" sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>
                          Total Selling Costs
                        </Typography>
                        <Typography sx={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
                          {formatCurrency(totalSellingCosts)}
                        </Typography>
                        <Typography color="rgba(255, 255, 255, 0.8)" sx={{ fontSize: '0.75rem', mt: 1 }}>
                          {summaryFrom || summaryTo ? `${summaryFrom || 'Start'} to ${summaryTo || 'End'}` : 'All dates'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
            </Grid>
          )}

          {selectedAccounts.length === 0 && (
            <Box sx={{ 
              p: 2, 
              bgcolor: 'action.hover', 
              borderRadius: 1, 
              textAlign: 'center',
              border: '1px dashed #3B82F6'
            }}>
              <Typography color="text.secondary" sx={{ fontSize: '0.9rem' }}>
                Select one or more accounts to see their combined gross and net totals
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end">
          <TextField 
            label="From" 
            type="date" 
            size="small" 
            InputLabelProps={{ shrink: true }} 
            value={from} 
            onChange={(e) => setFrom(e.target.value)} 
            sx={{ minWidth: 150 }}
          />
          <TextField 
            label="To" 
            type="date" 
            size="small" 
            InputLabelProps={{ shrink: true }} 
            value={to} 
            onChange={(e) => setTo(e.target.value)}
            sx={{ minWidth: 150 }}
          />
          
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Account</InputLabel>
            <Select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              label="Account"
            >
              <MenuItem value="">All Accounts</MenuItem>
              {sellers.map(s => (
                <MenuItem key={s._id} value={s._id}>{s.user?.username || s._id}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value)}
              label="Marketplace"
            >
              <MenuItem value="">All Marketplaces</MenuItem>
              {MARKETPLACES.map(mp => (
                <MenuItem key={mp.value} value={mp.value}>{mp.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="contained" size="small" onClick={load}>Apply</Button>
        </Stack>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Marketplace</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Payoneer ID</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Gross (Total Sales)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Taxes & Fees</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Selling Costs</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Net (Net Sales)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      No data available. Click "Add Entry" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  getPaginatedData().map((item) => {
                    if (item.type === 'seller-header') {
                      const seller = item.data;
                      return (
                        <TableRow key={item.id} sx={{ bgcolor: 'grey.50', fontWeight: 700 }}>
                          <TableCell sx={{ fontWeight: 700 }}>{seller.sellerName}</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>TOTAL</TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(seller.gross.value)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(seller.taxesAndFees.value)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(seller.sellingCosts.value)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(seller.net.value)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      );
                    } else if (item.type === 'entry') {
                      const { seller, mp } = item;
                      return (
                        <TableRow key={item.id} hover>
                          <TableCell sx={{ pl: 4, color: 'text.secondary', fontSize: '0.9rem' }}>→ {seller.sellerName}</TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>{mp.marketplace}</TableCell>
                          <TableCell sx={{ fontSize: '0.9rem' }}>{new Date(mp.date).toLocaleDateString()}</TableCell>
                          <TableCell sx={{ fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace', maxWidth: 140 }}>
                            {mp.payoneerId || '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.9rem' }}>{formatCurrency(mp.gross.value)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.9rem' }}>{formatCurrency(mp.taxesAndFees.value)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.9rem' }}>{formatCurrency(mp.sellingCosts.value)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.9rem' }}>{formatCurrency(mp.net.value)}</TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.9rem' }}>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDialog(mp, seller)}
                              title="Edit"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteEntry(mp.id)}
                              title="Delete"
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    }
                  })
                )}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[5, 10, 15, 25]}
              component="div"
              count={getTotalRows()}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                '.MuiTablePagination-toolbar': {
                  bgcolor: 'grey.50',
                  borderTop: 1,
                  borderColor: 'divider'
                },
                '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                  margin: 1,
                  fontSize: '0.875rem'
                }
              }}
            />
          </TableContainer>
        </Paper>
      )}

      {/* Analytics Section */}
      {rows.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>📊 Analytics & Reports</Typography>
          </Stack>
          
          <Paper 
            variant="outlined" 
            sx={{ 
              borderRadius: 2.5,
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)',
              overflow: 'hidden'
            }}
          >
            <Tabs 
              value={tabValue} 
              onChange={(e, newValue) => setTabValue(newValue)}
              sx={{ 
                borderBottom: 2, 
                borderColor: 'divider',
                bgcolor: 'background.paper',
                '& .MuiTab-root': {
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }
              }}
            >
              <Tab label="📅 Date Analysis" />
              <Tab label="👤 By Account" />
              <Tab label="🌐 By Marketplace" />
            </Tabs>

            <Box sx={{ p: 3 }}>
              {/* Chart Type Selector */}
              <Stack direction="row" spacing={1} sx={{ mb: 3, justifyContent: 'center' }}>
                {[
                  { value: 'bar', label: '📊 Bar', icon: '▨' },
                  { value: 'line', label: '📈 Line', icon: '⟶' },
                  { value: 'area', label: '📐 Area', icon: '▦' },
                  ...(tabValue === 1 || tabValue === 2 ? [{ value: 'pie', label: '🥧 Pie', icon: '●' }] : [])
                ].map(type => (
                  <Button
                    key={type.value}
                    onClick={() => setChartType(type.value)}
                    variant={chartType === type.value ? 'contained' : 'outlined'}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      transition: 'all 0.3s ease',
                      background: chartType === type.value 
                        ? 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)' 
                        : 'transparent',
                      color: chartType === type.value ? '#fff' : 'text.primary',
                      border: chartType === type.value ? 'none' : '2px solid #3B82F6',
                      '&:hover': {
                        background: chartType === type.value 
                          ? 'linear-gradient(135deg, #2563EB 0%, #1E3A8A 100%)' 
                          : '#F0F9FF',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                      }
                    }}
                  >
                    {type.label}
                  </Button>
                ))}
              </Stack>

              {/* Date Analysis Tab */}
              {tabValue === 0 && (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: 'text.primary' }}>
                    Daily Cashflow Breakdown
                  </Typography>
                  {chartData.length > 0 ? (
                    <Box sx={{ 
                      bgcolor: 'background.paper', 
                      borderRadius: 2, 
                      p: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }}>
                      <ResponsiveContainer width="100%" height={450}>
                        {chartType === 'bar' && (
                          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                            <defs>
                              <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.gross} stopOpacity={0.9}/>
                                <stop offset="95%" stopColor={CHART_COLORS.gross} stopOpacity={0.7}/>
                              </linearGradient>
                              <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.net} stopOpacity={0.9}/>
                                <stop offset="95%" stopColor={CHART_COLORS.net} stopOpacity={0.7}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="date" stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                              }}
                              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="gross" fill="url(#colorGross)" name="Gross Sales" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="taxesAndFees" fill={CHART_COLORS.taxes} name="Taxes & Fees" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="sellingCosts" fill={CHART_COLORS.selling} name="Selling Costs" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="net" fill="url(#colorNet)" name="Net Sales" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        )}
                        {chartType === 'line' && (
                          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                            <defs>
                              <linearGradient id="lineGradient1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.gross} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={CHART_COLORS.gross} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="date" stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Line type="monotone" dataKey="gross" stroke={CHART_COLORS.gross} strokeWidth={3} dot={{ fill: CHART_COLORS.gross, r: 5 }} name="Gross Sales" />
                            <Line type="monotone" dataKey="net" stroke={CHART_COLORS.net} strokeWidth={3} dot={{ fill: CHART_COLORS.net, r: 5 }} name="Net Sales" />
                            <Line type="monotone" dataKey="taxesAndFees" stroke={CHART_COLORS.taxes} strokeWidth={2} strokeDasharray="5 5" name="Taxes & Fees" />
                            <Line type="monotone" dataKey="sellingCosts" stroke={CHART_COLORS.selling} strokeWidth={2} strokeDasharray="5 5" name="Selling Costs" />
                          </LineChart>
                        )}
                        {chartType === 'area' && (
                          <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                            <defs>
                              <linearGradient id="colorGross1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.gross} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={CHART_COLORS.gross} stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorNet1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.net} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={CHART_COLORS.net} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="date" stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Area type="monotone" dataKey="gross" stroke={CHART_COLORS.gross} fillOpacity={1} fill="url(#colorGross1)" name="Gross Sales" />
                            <Area type="monotone" dataKey="net" stroke={CHART_COLORS.net} fillOpacity={1} fill="url(#colorNet1)" name="Net Sales" />
                          </AreaChart>
                        )}
                      </ResponsiveContainer>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 6, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography color="text.secondary" sx={{ fontSize: '1.1rem' }}>📭 No data available for charts</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* By Account Tab */}
              {tabValue === 1 && (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: 'text.primary' }}>
                    Account-wise Performance
                  </Typography>
                  {accountChartData.length > 0 ? (
                    <Box sx={{ 
                      bgcolor: 'background.paper', 
                      borderRadius: 2, 
                      p: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }}>
                      <ResponsiveContainer width="100%" height={450}>
                        {chartType === 'bar' && (
                          <BarChart data={accountChartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                            <defs>
                              <linearGradient id="colorAcc1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.gross} stopOpacity={0.9}/>
                                <stop offset="95%" stopColor={CHART_COLORS.gross} stopOpacity={0.7}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px'
                              }}
                              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="gross" fill="url(#colorAcc1)" name="Gross Sales" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="net" fill={CHART_COLORS.net} name="Net Sales" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        )}
                        {chartType === 'pie' && (
                          <PieChart>
                            <Pie
                              data={accountChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="net"
                            >
                              {accountChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                          </PieChart>
                        )}
                        {chartType === 'line' && (
                          <LineChart data={accountChartData} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Line type="monotone" dataKey="gross" stroke={CHART_COLORS.gross} strokeWidth={3} dot={{ fill: CHART_COLORS.gross, r: 6 }} name="Gross Sales" />
                            <Line type="monotone" dataKey="net" stroke={CHART_COLORS.net} strokeWidth={3} dot={{ fill: CHART_COLORS.net, r: 6 }} name="Net Sales" />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 6, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography color="text.secondary" sx={{ fontSize: '1.1rem' }}>📭 No data available for charts</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* By Marketplace Tab */}
              {tabValue === 2 && (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: 'text.primary' }}>
                    Marketplace Comparison
                  </Typography>
                  {marketplaceChartData.length > 0 ? (
                    <Box sx={{ 
                      bgcolor: 'background.paper', 
                      borderRadius: 2, 
                      p: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }}>
                      <ResponsiveContainer width="100%" height={450}>
                        {chartType === 'bar' && (
                          <BarChart data={marketplaceChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="name" stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px'
                              }}
                              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                            />
                            <Legend />
                            <Bar dataKey="gross" fill={CHART_COLORS.gross} name="Gross Sales" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="taxesAndFees" fill={CHART_COLORS.taxes} name="Taxes & Fees" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="sellingCosts" fill={CHART_COLORS.selling} name="Selling Costs" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="net" fill={CHART_COLORS.net} name="Net Sales" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        )}
                        {chartType === 'pie' && (
                          <PieChart>
                            <Pie
                              data={marketplaceChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="gross"
                            >
                              {marketplaceChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                          </PieChart>
                        )}
                        {chartType === 'line' && (
                          <LineChart data={marketplaceChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="name" stroke="#6B7280" />
                            <YAxis stroke="#6B7280" />
                            <Tooltip 
                              formatter={(value) => formatCurrency(value)}
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '2px solid #3B82F6',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="gross" stroke={CHART_COLORS.gross} strokeWidth={3} dot={{ r: 6 }} name="Gross Sales" />
                            <Line type="monotone" dataKey="net" stroke={CHART_COLORS.net} strokeWidth={3} dot={{ r: 6 }} name="Net Sales" />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 6, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography color="text.secondary" sx={{ fontSize: '1.1rem' }}>📭 No data available for charts</Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: 'text.primary' }}>
          {editingId ? 'Edit Gross & Net Entry' : 'Add Gross & Net Entry'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            
            <FormControl fullWidth size="medium">
              <InputLabel sx={{ color: 'text.primary' }}>Account</InputLabel>
              <Select
                value={formData.sellerId}
                onChange={(e) => handleFormChange('sellerId', e.target.value)}
                label="Account"
                disabled={!!editingId}
                sx={{
                  '& .MuiOutlinedInput-input': {
                    color: 'text.primary',
                    fontWeight: 500
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider'
                  }
                }}
              >
                {sellers.map(s => (
                  <MenuItem key={s._id} value={s._id} sx={{ color: 'text.primary' }}>
                    {s.user?.username || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="medium">
              <InputLabel sx={{ color: 'text.primary' }}>Marketplace</InputLabel>
              <Select
                value={formData.marketplace}
                onChange={(e) => handleFormChange('marketplace', e.target.value)}
                label="Marketplace"
                disabled={!!editingId}
                sx={{
                  '& .MuiOutlinedInput-input': {
                    color: 'text.primary',
                    fontWeight: 500
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider'
                  }
                }}
              >
                {MARKETPLACES.map(mp => (
                  <MenuItem key={mp.value} value={mp.value} sx={{ color: 'text.primary' }}>
                    {mp.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Date"
              type="date"
              value={formData.date}
              onChange={(e) => handleFormChange('date', e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={!!editingId}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-input': {
                  color: 'text.primary',
                  fontWeight: 500
                },
                '& label': {
                  color: 'text.secondary'
                }
              }}
            />

            <TextField
              label="Gross (Total Sales)"
              type="number"
              inputProps={{ step: '0.01', min: '0' }}
              value={formData.gross}
              onChange={(e) => handleFormChange('gross', e.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-input': {
                  color: 'text.primary'
                },
                '& label': {
                  color: 'text.secondary'
                }
              }}
            />

            <TextField
              label="Taxes & Fees"
              type="number"
              inputProps={{ step: '0.01', min: '0' }}
              value={formData.taxesAndFees}
              onChange={(e) => handleFormChange('taxesAndFees', e.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-input': {
                  color: 'text.primary'
                },
                '& label': {
                  color: 'text.secondary'
                }
              }}
            />

            <TextField
              label="Selling Costs"
              type="number"
              inputProps={{ step: '0.01', min: '0' }}
              value={formData.sellingCosts}
              onChange={(e) => handleFormChange('sellingCosts', e.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-input': {
                  color: 'text.primary'
                },
                '& label': {
                  color: 'text.secondary'
                }
              }}
            />

            <TextField
              label="Payoneer ID"
              value={formData.payoneerId}
              onChange={(e) => handleFormChange('payoneerId', e.target.value)}
              placeholder="Optional payout reference"
              fullWidth
              sx={{
                '& .MuiOutlinedInput-input': {
                  color: 'text.primary',
                  fontFamily: 'ui-monospace, monospace',
                },
                '& label': {
                  color: 'text.secondary'
                }
              }}
            />

            <TextField
              label="Notes"
              multiline
              rows={2}
              value={formData.notes}
              onChange={(e) => handleFormChange('notes', e.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-input': {
                  color: 'text.primary'
                },
                '& label': {
                  color: 'text.secondary'
                }
              }}
            />

            <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
              <Typography variant="caption" display="block" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                Net Calculation:
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {formatCurrency(formData.gross)} - ({formatCurrency(formData.taxesAndFees)} + {formatCurrency(formData.sellingCosts)}) = <strong style={{ color: 'inherit' }}>{formatCurrency((parseFloat(formData.gross) || 0) - (parseFloat(formData.taxesAndFees) || 0) - (parseFloat(formData.sellingCosts) || 0))}</strong>
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} sx={{ color: 'text.primary' }}>
            Cancel
          </Button>
          <Button onClick={handleSubmitForm} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
