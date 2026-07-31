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
  Chip,
  IconButton,
  Snackbar,
  Alert,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import api from '../../lib/api';

const formatINR = (val) => {
  if (val === undefined || val === null || val === '') return '₹0.00';
  const num = parseFloat(val);
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(num);
};

export default function CardFundRequestsPage() {
  const navigate = useNavigate();

  // State
  const [requests, setRequests] = useState([]);
  const [allCards, setAllCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [currentTab, setCurrentTab] = useState('PENDING'); // PENDING, APPROVED, REJECTED, ALL

  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [openRejectDialog, setOpenRejectDialog] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [formData, setFormData] = useState({
    card: '',
    requestedAmount: '',
    remarks: '',
  });
  const [submitting, setSubmitting] = useState(false);

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

  // Fetch fund requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const status = currentTab === 'ALL' ? '' : currentTab;
      const { data } = await api.get('/card-fund-requests', {
        params: { status }
      });
      setRequests(data);
    } catch (err) {
      console.error('Error fetching fund requests:', err);
      setError('Failed to load fund requests');
    } finally {
      setLoading(false);
    }
  }, [currentTab]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Handle create request
  const handleCreateRequest = async () => {
    if (!formData.card || !formData.requestedAmount) {
      setSnackbar({ open: true, message: 'Card and amount are required', severity: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/card-fund-requests', formData);
      setSnackbar({ open: true, message: 'Fund request created successfully', severity: 'success' });
      setOpenDialog(false);
      resetForm();
      fetchRequests();
    } catch (err) {
      console.error('Error creating fund request:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to create fund request', 
        severity: 'error' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle approve request
  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this fund request?')) return;

    try {
      const { data } = await api.put(`/card-fund-requests/${id}/approve`);
      setSnackbar({ 
        open: true, 
        message: `Approved! New card balance: ${formatINR(data.newCardBalance)}`, 
        severity: 'success' 
      });
      fetchRequests();
      fetchCards(); // Refresh card balances
    } catch (err) {
      console.error('Error approving request:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to approve request', 
        severity: 'error' 
      });
    }
  };

  // Handle reject request
  const handleRejectClick = (id) => {
    setRejectingId(id);
    setRejectionReason('');
    setOpenRejectDialog(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason.trim()) {
      setSnackbar({ open: true, message: 'Please provide a reason for rejection', severity: 'error' });
      return;
    }

    try {
      await api.put(`/card-fund-requests/${rejectingId}/reject`, { rejectionReason });
      setSnackbar({ open: true, message: 'Fund request rejected', severity: 'info' });
      setOpenRejectDialog(false);
      setRejectingId(null);
      setRejectionReason('');
      fetchRequests();
      fetchCards(); // Refresh card balances
    } catch (err) {
      console.error('Error rejecting request:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to reject request', 
        severity: 'error' 
      });
    }
  };

  // Handle delete request
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;

    try {
      await api.delete(`/card-fund-requests/${id}`);
      setSnackbar({ open: true, message: 'Fund request deleted', severity: 'success' });
      fetchRequests();
    } catch (err) {
      console.error('Error deleting request:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to delete request', 
        severity: 'error' 
      });
    }
  };

  const resetForm = () => {
    setFormData({
      card: '',
      requestedAmount: '',
      remarks: '',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      case 'PENDING': return 'warning';
      default: return 'default';
    }
  };

  // Summary cards
  const summary = {
    pending: requests.filter(r => r.status === 'PENDING').length,
    approved: requests.filter(r => r.status === 'APPROVED').length,
    rejected: requests.filter(r => r.status === 'REJECTED').length,
    totalRequested: requests
      .filter(r => r.status === 'PENDING')
      .reduce((sum, r) => sum + r.requestedAmount, 0),
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Card Fund Requests
          </Typography>
          <Breadcrumbs>
            <Typography color="text.primary" sx={{ cursor: 'pointer' }} onClick={() => navigate('/admin')}>
              Admin
            </Typography>
            <Typography color="text.secondary">Card Fund Requests</Typography>
          </Breadcrumbs>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchRequests}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Request Funds
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
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Pending Requests
              </Typography>
              <Typography variant="h4" fontWeight={700} color="warning.main">
                {summary.pending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Total Pending Amount
              </Typography>
              <Typography variant="h4" fontWeight={700} color="primary">
                {formatINR(summary.totalRequested)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Approved
              </Typography>
              <Typography variant="h4" fontWeight={700} color="success.main">
                {summary.approved}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                Rejected
              </Typography>
              <Typography variant="h4" fontWeight={700} color="error.main">
                {summary.rejected}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)}>
          <Tab label={`Pending (${summary.pending})`} value="PENDING" />
          <Tab label={`Approved (${summary.approved})`} value="APPROVED" />
          <Tab label={`Rejected (${summary.rejected})`} value="REJECTED" />
          <Tab label="All" value="ALL" />
        </Tabs>
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
                <TableCell>Request Date</TableCell>
                <TableCell>Card</TableCell>
                <TableCell align="right">Requested Amount</TableCell>
                <TableCell>Requested By</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reviewed By</TableCell>
                <TableCell>Review Date</TableCell>
                <TableCell>Remarks</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">No fund requests found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request._id}>
                    <TableCell>
                      {new Date(request.requestDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AccountBalanceWalletIcon fontSize="small" color="primary" />
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {request.card?.name || 'N/A'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ****{request.card?.last4digits || 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={700} color="primary">
                        {formatINR(request.requestedAmount)}
                      </Typography>
                    </TableCell>
                    <TableCell>{request.requestedBy?.username || 'N/A'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={request.status} 
                        color={getStatusColor(request.status)} 
                        size="small" 
                      />
                    </TableCell>
                    <TableCell>{request.reviewedBy?.username || '-'}</TableCell>
                    <TableCell>
                      {request.reviewDate 
                        ? new Date(request.reviewDate).toLocaleDateString()
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {request.remarks || '-'}
                      </Typography>
                      {request.rejectionReason && (
                        <Typography variant="caption" color="error" display="block">
                          Reason: {request.rejectionReason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        {request.status === 'PENDING' && (
                          <>
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleApprove(request._id)}
                              title="Approve"
                            >
                              <CheckIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRejectClick(request._id)}
                              title="Reject"
                            >
                              <CloseIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(request._id)}
                              title="Delete"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create Request Dialog */}
      <Dialog open={openDialog} onClose={() => !submitting && setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Card Funds</DialogTitle>
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

            <TextField
              label="Requested Amount (INR)"
              type="number"
              value={formData.requestedAmount}
              onChange={(e) => setFormData({ ...formData, requestedAmount: e.target.value })}
              fullWidth
              required
              inputProps={{ min: 0, step: 0.01 }}
            />

            <TextField
              label="Remarks"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateRequest}
            variant="contained"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={openRejectDialog} onClose={() => setOpenRejectDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Fund Request</DialogTitle>
        <DialogContent>
          <TextField
            label="Rejection Reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRejectDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRejectConfirm}
            variant="contained"
            color="error"
          >
            Reject
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
