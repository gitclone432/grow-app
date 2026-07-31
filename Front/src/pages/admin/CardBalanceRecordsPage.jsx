import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Snackbar,
  Alert,
  Card,
  CardContent,
  Grid,
  Divider,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalculateIcon from '@mui/icons-material/Calculate';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import api from '../../lib/api';

const formatINR = (val) => {
  if (val === undefined || val === null || val === '') return '₹0.00';
  const num = parseFloat(val);
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(num);
};

const formatUSD = (val) => {
  if (val === undefined || val === null || val === '') return '$0.00';
  const num = parseFloat(val);
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(num);
};

export default function CardBalanceRecordsPage() {
  const navigate = useNavigate();

  // State
  const [records, setRecords] = useState([]);
  const [allCards, setAllCards] = useState([]);
  const [allAmazonAccounts, setAllAmazonAccounts] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(83.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Filter state
  const [selectedCard, setSelectedCard] = useState('');
  const [selectedAmazonAccount, setSelectedAmazonAccount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [openExchangeRateDialog, setOpenExchangeRateDialog] = useState(false);
  const [newExchangeRate, setNewExchangeRate] = useState('');
  const [formData, setFormData] = useState({
    card: '',
    amazonAccount: '',
    balanceAmountUSD: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [calculations, setCalculations] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Fetch exchange rate
  const fetchExchangeRate = useCallback(async () => {
    try {
      const { data } = await api.get('/exchange-rate');
      setExchangeRate(data.rate);
    } catch (err) {
      console.error('Error fetching exchange rate:', err);
    }
  }, []);

  // Fetch all cards
  const fetchCards = useCallback(async () => {
    try {
      const { data } = await api.get('/credit-cards');
      setAllCards(data);
    } catch (err) {
      console.error('Error fetching cards:', err);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // Fetch Amazon accounts
  useEffect(() => {
    const fetchAmazonAccounts = async () => {
      try {
        const { data } = await api.get('/amazon-accounts');
        setAllAmazonAccounts(data);
      } catch (err) {
        console.error('Error fetching Amazon accounts:', err);
      }
    };
    fetchAmazonAccounts();
  }, []);

  useEffect(() => {
    fetchExchangeRate();
  }, [fetchExchangeRate]);

  // Fetch balance records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (selectedCard) params.cardId = selectedCard;
      if (selectedAmazonAccount) params.amazonAccountId = selectedAmazonAccount;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const { data } = await api.get('/card-balance-records', { params });
      setRecords(data);
    } catch (err) {
      console.error('Error fetching records:', err);
      setError('Failed to load balance records');
    } finally {
      setLoading(false);
    }
  }, [selectedCard, selectedAmazonAccount, dateFrom, dateTo]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Calculate fees when amount changes
  const handleCalculate = async () => {
    if (!formData.balanceAmountUSD || parseFloat(formData.balanceAmountUSD) <= 0) {
      setSnackbar({ open: true, message: 'Please enter a valid amount', severity: 'error' });
      return;
    }

    setCalculating(true);
    try {
      const { data } = await api.get('/card-balance-records/calculate', {
        params: { amountUSD: formData.balanceAmountUSD }
      });
      setCalculations(data);
    } catch (err) {
      console.error('Error calculating fees:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to calculate fees', 
        severity: 'error' 
      });
    } finally {
      setCalculating(false);
    }
  };

  // Handle create record
  const handleCreateRecord = async () => {
    if (!formData.card || !formData.amazonAccount || !formData.balanceAmountUSD) {
      setSnackbar({ open: true, message: 'Card, Amazon account, and amount are required', severity: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/card-balance-records', formData);
      setSnackbar({ 
        open: true, 
        message: `Balance record created! Deducted ${formatINR(data.record.totalAmountINR)} from card.`, 
        severity: 'success' 
      });
      setOpenDialog(false);
      resetForm();
      fetchRecords();
      // Refresh cards to show updated balances
      fetchCards();
    } catch (err) {
      console.error('Error creating record:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to create balance record', 
        severity: 'error' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete record
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record? The card balance will be restored.')) return;

    try {
      const { data } = await api.delete(`/card-balance-records/${id}`);
      setSnackbar({ 
        open: true, 
        message: `Record deleted! Restored ${formatINR(data.restoredAmount)} to card.`, 
        severity: 'success' 
      });
      fetchRecords();
      // Refresh cards to show updated balances
      fetchCards();
    } catch (err) {
      console.error('Error deleting record:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to delete record', 
        severity: 'error' 
      });
    }
  };

  // Handle update exchange rate
  const handleUpdateExchangeRate = async () => {
    if (!newExchangeRate || parseFloat(newExchangeRate) <= 0) {
      setSnackbar({ open: true, message: 'Please enter a valid exchange rate', severity: 'error' });
      return;
    }

    try {
      await api.put('/exchange-rate', { rate: newExchangeRate });
      setSnackbar({ open: true, message: 'Exchange rate updated successfully', severity: 'success' });
      setOpenExchangeRateDialog(false);
      fetchExchangeRate();
    } catch (err) {
      console.error('Error updating exchange rate:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to update exchange rate', 
        severity: 'error' 
      });
    }
  };

  const resetForm = () => {
    setFormData({
      card: '',
      amazonAccount: '',
      balanceAmountUSD: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setCalculations(null);
  };

  // Summary
  const summary = {
    totalRecords: records.length,
    totalUSD: records.reduce((sum, r) => sum + r.totalAmountUSD, 0),
    totalINR: records.reduce((sum, r) => sum + r.totalAmountINR, 0),
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Card Balance Records
          </Typography>
          <Breadcrumbs>
            <Typography color="text.primary" sx={{ cursor: 'pointer' }} onClick={() => navigate('/admin')}>
              Admin
            </Typography>
            <Typography color="text.secondary">Card Balance Records</Typography>
          </Breadcrumbs>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => {
              setNewExchangeRate(exchangeRate.toString());
              setOpenExchangeRateDialog(true);
            }}
          >
            Exchange Rate: ₹{exchangeRate}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchRecords}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Add Balance
          </Button>
        </Stack>
      </Stack>

      {/* Credit Cards Balance Overview */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <AccountBalanceWalletIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            Credit Cards Balance
          </Typography>
        </Stack>
        <Grid container spacing={2}>
          {allCards.map((card) => (
            <Grid item xs={12} sm={6} md={3} key={card._id}>
              <Card 
                variant="outlined" 
                sx={{ 
                  bgcolor: 'background.paper',
                  borderLeft: 4,
                  borderLeftColor: card.balance > 50000 ? 'success.main' : card.balance > 20000 ? 'warning.main' : 'error.main',
                }}
              >
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {card.name}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color="primary">
                    {formatINR(card.balance || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Available Balance
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {allCards.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" textAlign="center">
                No credit cards found
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Total Records
              </Typography>
              <Typography variant="h4" fontWeight={700} color="primary">
                {summary.totalRecords}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Total Amount (USD)
              </Typography>
              <Typography variant="h4" fontWeight={700} color="success.main">
                {formatUSD(summary.totalUSD)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Total Deducted (INR)
              </Typography>
              <Typography variant="h4" fontWeight={700} color="error.main">
                {formatINR(summary.totalINR)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Filters</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Card</InputLabel>
              <Select
                value={selectedCard}
                onChange={(e) => setSelectedCard(e.target.value)}
                label="Card"
              >
                <MenuItem value="">All Cards</MenuItem>
                {allCards.map((card) => (
                  <MenuItem key={card._id} value={card._id}>
                    {card.name} (****{card.last4digits})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Amazon Account</InputLabel>
              <Select
                value={selectedAmazonAccount}
                onChange={(e) => setSelectedAmazonAccount(e.target.value)}
                label="Amazon Account"
              >
                <MenuItem value="">All Accounts</MenuItem>
                {allAmazonAccounts.map((account) => (
                  <MenuItem key={account._id} value={account._id}>
                    {account.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="From Date"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="To Date"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Card</TableCell>
                <TableCell>Amazon Account</TableCell>
                <TableCell align="right">Amount (USD)</TableCell>
                <TableCell align="right">Markup Fee</TableCell>
                <TableCell align="right">GST on Markup</TableCell>
                <TableCell align="right">Total (USD)</TableCell>
                <TableCell align="right">Exchange Rate</TableCell>
                <TableCell align="right">Total (INR)</TableCell>
                <TableCell>Balance After</TableCell>
                <TableCell>Created By</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">No balance records found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record._id}>
                    <TableCell>
                      {new Date(record.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AccountBalanceWalletIcon fontSize="small" color="primary" />
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {record.card?.name || 'N/A'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ****{record.card?.last4digits || 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ShoppingCartIcon fontSize="small" color="success" />
                        <Typography variant="body2">
                          {record.amazonAccount?.name || 'N/A'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600}>
                        {formatUSD(record.balanceAmountUSD)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {formatUSD(record.markupFeeUSD)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {formatUSD(record.gstOnMarkupUSD)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600} color="primary">
                        {formatUSD(record.totalAmountUSD)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip label={`₹${record.exchangeRate}`} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={700} color="error">
                        {formatINR(record.totalAmountINR)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="success.main" fontWeight={600}>
                        {formatINR(record.cardBalanceAfter)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {record.createdBy?.username || 'N/A'}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(record._id)}
                        title="Delete"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create Record Dialog */}
      <Dialog open={openDialog} onClose={() => !submitting && setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Balance Record</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel>Select Card</InputLabel>
              <Select
                value={formData.card}
                onChange={(e) => setFormData({ ...formData, card: e.target.value })}
                label="Select Card"
              >
                {allCards.map((card) => (
                  <MenuItem key={card._id} value={card._id}>
                    {card.name} (****{card.last4digits}) - Balance: {formatINR(card.balance || 0)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth required>
              <InputLabel>Amazon Account</InputLabel>
              <Select
                value={formData.amazonAccount}
                onChange={(e) => setFormData({ ...formData, amazonAccount: e.target.value })}
                label="Amazon Account"
              >
                {allAmazonAccounts.map((account) => (
                  <MenuItem key={account._id} value={account._id}>
                    {account.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Balance Amount (USD)"
                type="number"
                value={formData.balanceAmountUSD}
                onChange={(e) => {
                  setFormData({ ...formData, balanceAmountUSD: e.target.value });
                  setCalculations(null); // Reset calculations when amount changes
                }}
                fullWidth
                required
                inputProps={{ min: 0, step: 0.01 }}
              />
              <Button
                variant="outlined"
                startIcon={calculating ? <CircularProgress size={20} /> : <CalculateIcon />}
                onClick={handleCalculate}
                disabled={calculating}
                sx={{ minWidth: 120 }}
              >
                Calculate
              </Button>
            </Stack>

            {calculations && (
              <Card variant="outlined" sx={{ bgcolor: '#f5f5f5' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Fee Breakdown</Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography>Base Amount:</Typography>
                      <Typography fontWeight={600}>{calculations.breakdown.baseAmount}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Markup Fee (3.5%):
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {calculations.breakdown.markupFee}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        GST on Markup (18%):
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {calculations.breakdown.gstOnMarkup}
                      </Typography>
                    </Stack>
                    <Divider />
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={600}>Total (USD):</Typography>
                      <Typography fontWeight={600} color="primary">
                        {calculations.breakdown.totalUSD}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        {calculations.breakdown.exchangeRate}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="h6" fontWeight={700}>
                        Total to Deduct (INR):
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color="error">
                        {calculations.breakdown.totalINR}
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            )}

            <TextField
              label="Date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateRecord}
            variant="contained"
            disabled={submitting || !calculations}
          >
            {submitting ? <CircularProgress size={24} /> : 'Create Record'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Exchange Rate Dialog */}
      <Dialog open={openExchangeRateDialog} onClose={() => setOpenExchangeRateDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Update Exchange Rate</DialogTitle>
        <DialogContent>
          <TextField
            label="Exchange Rate (1 USD = ? INR)"
            type="number"
            value={newExchangeRate}
            onChange={(e) => setNewExchangeRate(e.target.value)}
            fullWidth
            required
            inputProps={{ min: 0, step: 0.01 }}
            sx={{ mt: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Current rate: ₹{exchangeRate} per USD
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenExchangeRateDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleUpdateExchangeRate}
            variant="contained"
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
