import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Button,
  Stack,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  IconButton,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  Tooltip
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../lib/api';
import usePageAccess from '../../hooks/usePageAccess';

const PriceChangeHistoryPage = () => {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const { hasAccess } = usePageAccess(user);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedText, setCopiedText] = useState('');
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });

  // User and Seller lists for dropdowns
  const [users, setUsers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Date filter mode
  const [dateMode, setDateMode] = useState('range'); // 'single' or 'range'

  // Filters
  const [filters, setFilters] = useState({
    legacyItemId: '',
    orderId: '',
    userId: '',
    sellerId: '',
    startDate: null,
    endDate: null,
    successFilter: 'all' // 'all', 'success', 'failed'
  });

  const fetchLogs = async (page = 1, customFilters = null) => {
    setLoading(true);
    setError('');
    try {
      const currentFilters = customFilters || filters;
      const params = {
        page,
        limit: pagination.limit,
        legacyItemId: currentFilters.legacyItemId,
        orderId: currentFilters.orderId,
        userId: currentFilters.userId,
        sellerId: currentFilters.sellerId,
        startDate: currentFilters.startDate ? currentFilters.startDate.toISOString() : undefined,
        endDate: currentFilters.endDate ? currentFilters.endDate.toISOString() : undefined
      };

      // Handle success filter
      if (currentFilters.successFilter === 'success') {
        params.successOnly = 'true';
      } else if (currentFilters.successFilter === 'failed') {
        params.failedOnly = 'true';
      }

      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key] === undefined || params[key] === '') {
          delete params[key];
        }
      });

      const response = await api.get('/price-change-logs', { params });
      setLogs(response.data.logs);
      setPagination(response.data.pagination);
    } catch (err) {
      console.error('Error fetching price change logs:', err);
      setError(err.response?.data?.error || 'Failed to fetch price change logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersAndSellers = async () => {
    setLoadingFilters(true);
    try {
      const [usersRes, sellersRes] = await Promise.all([
        api.get('/users'),
        api.get('/sellers/all')
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setSellers(Array.isArray(sellersRes.data) ? sellersRes.data : []);
    } catch (err) {
      console.error('Error fetching users/sellers:', err);
    } finally {
      setLoadingFilters(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchUsersAndSellers();
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyFilters = () => {
    fetchLogs(1);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      legacyItemId: '',
      orderId: '',
      userId: '',
      sellerId: '',
      startDate: null,
      endDate: null,
      successFilter: 'all'
    };
    setFilters(clearedFilters);
    fetchLogs(1, clearedFilters);
  };

  const handleDateModeChange = (event, newMode) => {
    if (newMode !== null) {
      setDateMode(newMode);
      // Clear date filters when switching modes
      if (newMode === 'single') {
        setFilters(prev => ({ ...prev, endDate: null }));
      }
    }
  };

  const handleCopy = (text) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(''), 1200);
    }
  };

  const handlePageChange = (event, newPage) => {
    fetchLogs(newPage + 1);
  };

  const handleRowsPerPageChange = (event) => {
    setPagination(prev => ({ ...prev, limit: parseInt(event.target.value, 10) }));
    fetchLogs(1);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportToCSV = () => {
    const headers = [
      'Date/Time',
      'Username',
      'Seller',
      'Order ID',
      'Legacy Item ID',
      'Product Title',
      'Original Price',
      'New Price',
      'Difference',
      'Success',
      'Source',
      'Error Message'
    ];

    const rows = logs.map(log => [
      formatDate(log.createdAt),
      log.user?.username || 'N/A',
      log.seller?.user?.username || 'N/A',
      log.orderId || 'N/A',
      log.legacyItemId,
      log.productTitle || 'N/A',
      log.originalPrice,
      log.newPrice,
      log.priceDifference,
      log.success ? 'Yes' : 'No',
      log.changeSource || 'N/A',
      log.errorMessage || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `price_change_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Check page access
  if (!hasAccess('PriceChangeHistory')) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">You do not have permission to view this page.</Alert>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Price Change History
        </Typography>

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Filters
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                fullWidth
                size="small"
                options={users}
                getOptionLabel={(option) => option.username || ''}
                value={users.find(u => u._id === filters.userId) || null}
                onChange={(e, newValue) => handleFilterChange('userId', newValue?._id || '')}
                loading={loadingFilters}
                renderInput={(params) => (
                  <TextField {...params} label="Username" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                fullWidth
                size="small"
                options={sellers}
                getOptionLabel={(option) => option.user?.username || ''}
                value={sellers.find(s => s._id === filters.sellerId) || null}
                onChange={(e, newValue) => handleFilterChange('sellerId', newValue?._id || '')}
                loading={loadingFilters}
                renderInput={(params) => (
                  <TextField {...params} label="Seller" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Legacy Item ID"
                value={filters.legacyItemId}
                onChange={(e) => handleFilterChange('legacyItemId', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Order ID"
                value={filters.orderId}
                onChange={(e) => handleFilterChange('orderId', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ minWidth: 'fit-content' }}>
                  Date Filter:
                </Typography>
                <ToggleButtonGroup
                  value={dateMode}
                  exclusive
                  onChange={handleDateModeChange}
                  size="small"
                >
                  <ToggleButton value="single">Single Date</ToggleButton>
                  <ToggleButton value="range">Date Range</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Grid>
            {dateMode === 'single' ? (
              <Grid item xs={12} sm={6} md={3}>
                <DatePicker
                  label="Date"
                  value={filters.startDate}
                  onChange={(date) => {
                    handleFilterChange('startDate', date);
                    // Set endDate to same date for single date mode
                    if (date) {
                      const endOfDay = new Date(date);
                      endOfDay.setHours(23, 59, 59, 999);
                      handleFilterChange('endDate', endOfDay);
                    } else {
                      handleFilterChange('endDate', null);
                    }
                  }}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
            ) : (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="Start Date"
                    value={filters.startDate}
                    onChange={(date) => handleFilterChange('startDate', date)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="End Date"
                    value={filters.endDate}
                    onChange={(date) => handleFilterChange('endDate', date)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status Filter</InputLabel>
                <Select
                  value={filters.successFilter}
                  label="Status Filter"
                  onChange={(e) => handleFilterChange('successFilter', e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="success">Success Only</MenuItem>
                  <MenuItem value="failed">Failed Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
            <Button variant="outlined" onClick={handleClearFilters}>
              Clear Filters
            </Button>
            <Button variant="outlined" onClick={exportToCSV} disabled={logs.length === 0}>
              Export to CSV
            </Button>
          </Stack>
        </Paper>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Table */}
        <Paper>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date/Time</TableCell>
                      <TableCell>Username</TableCell>
                      <TableCell>Seller</TableCell>
                      <TableCell>Order ID</TableCell>
                      <TableCell>Legacy Item ID</TableCell>
                      <TableCell>Product Title</TableCell>
                      <TableCell align="right">Original Price</TableCell>
                      <TableCell align="right">New Price</TableCell>
                      <TableCell align="right">Difference</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Source</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} align="center">
                          No price change logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log._id}>
                          <TableCell>{formatDate(log.createdAt)}</TableCell>
                          <TableCell>{log.user?.username || 'N/A'}</TableCell>
                          <TableCell>{log.seller?.user?.username || 'N/A'}</TableCell>
                          <TableCell>{log.orderId || 'N/A'}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Chip
                                label={log.legacyItemId}
                                size="small"
                                color="primary"
                                component="a"
                                href={`https://www.ebay.com/itm/${log.legacyItemId}`}
                                target="_blank"
                                clickable
                                sx={{ cursor: 'pointer' }}
                              />
                              <IconButton
                                size="small"
                                onClick={() => handleCopy(log.legacyItemId)}
                                aria-label="copy legacy item id"
                              >
                                <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {log.productTitle || 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatCurrency(log.originalPrice)}</TableCell>
                          <TableCell align="right">{formatCurrency(log.newPrice)}</TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{
                                color: log.priceDifference > 0 ? 'success.main' : log.priceDifference < 0 ? 'error.main' : 'text.primary',
                                fontWeight: 'bold'
                              }}
                            >
                              {log.priceDifference > 0 ? '+' : ''}{formatCurrency(log.priceDifference)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Chip
                                label={log.success ? 'Success' : 'Failed'}
                                size="small"
                                color={log.success ? 'success' : 'error'}
                                sx={{ width: 'fit-content' }}
                              />
                              {!log.success && log.errorMessage && (
                                <Tooltip title={log.errorMessage} arrow placement="top">
                                  <Typography 
                                    variant="caption" 
                                    display="block" 
                                    color="error"
                                    sx={{ 
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis', 
                                      whiteSpace: 'nowrap',
                                      cursor: 'help',
                                      maxWidth: 230
                                    }}
                                  >
                                    {log.errorMessage}
                                  </Typography>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={log.changeSource || 'N/A'}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[25, 50, 100]}
                component="div"
                count={pagination.total}
                rowsPerPage={pagination.limit}
                page={pagination.page - 1}
                onPageChange={handlePageChange}
                onRowsPerPageChange={handleRowsPerPageChange}
              />
            </>
          )}
        </Paper>

        {/* Copy Success Snackbar */}
        <Snackbar
          open={!!copiedText}
          autoHideDuration={1200}
          onClose={() => setCopiedText('')}
          message={`Copied: ${copiedText}`}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </Box>
    </LocalizationProvider>
  );
};

export default PriceChangeHistoryPage;
