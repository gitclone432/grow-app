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
  CircularProgress,
  Alert,
  TextField,
  Button,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Fade,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import api from '../../../lib/api';
import { dashboardSignatureTokens } from '../../../theme/appTheme';
import PageHeader from '../../../components/PageHeader.jsx';
import AdminPageShell from '../../../components/AdminPageShell.jsx';

function getTodayPtDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const tableHeaderCellSx = {
  backgroundColor: dashboardSignatureTokens.table.headerBackground,
  color: dashboardSignatureTokens.table.headerForeground,
  fontWeight: 700,
  py: 1.75,
  whiteSpace: 'nowrap',
  borderBottom: 'none',
};

const tableBodyCellSx = {
  py: 1.4,
  px: 1.5,
  borderBottom: `1px solid ${dashboardSignatureTokens.table.rowBorder}`,
};

export default function EtsyDailyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Filters
  const [selectedDate, setSelectedDate] = useState(getTodayPtDateString());
  const [selectedStore, setSelectedStore] = useState('');
  
  // Dialog state
  const [dialog, setDialog] = useState({
    open: false,
    mode: 'add', // 'add' or 'edit'
    data: { date: getTodayPtDateString(), storeId: '', orderCount: '' },
    editingId: null,
  });

  // Fetch stores and orders on mount and when filters change
  useEffect(() => {
    fetchStores();
    fetchOrders();
  }, [selectedDate, selectedStore]);

  const fetchStores = async () => {
    try {
      const { data } = await api.get('/etsy/stores');
      setStores(Array.isArray(data.stores) ? data.stores : []);
    } catch (err) {
      console.error('Error fetching Etsy stores:', err);
      setStores([]);
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (selectedStore) params.storeId = selectedStore;

      const { data } = await api.get('/etsy/daily-orders', { params });
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      console.error('Error fetching daily orders:', err);
      setError(err.response?.data?.error || 'Failed to load daily orders. Please try again.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddDialog = () => {
    setDialog({
      open: true,
      mode: 'add',
      data: { date: selectedDate || getTodayPtDateString(), storeId: selectedStore || '', orderCount: '' },
      editingId: null,
    });
  };

  const handleOpenEditDialog = (row) => {
    setDialog({
      open: true,
      mode: 'edit',
      data: { date: row.date, storeId: row.storeId, orderCount: String(row.orderCount) },
      editingId: row._id,
    });
  };

  const handleCloseDialog = () => {
    setDialog({
      open: false,
      mode: 'add',
      data: { date: getTodayPtDateString(), storeId: '', orderCount: '' },
      editingId: null,
    });
  };

  const handleSaveDialog = async () => {
    if (!dialog.data.date || !dialog.data.storeId || !dialog.data.orderCount) {
      setSnackbar({ open: true, message: 'Please fill in all fields', severity: 'warning' });
      return;
    }

    const orderCount = parseInt(dialog.data.orderCount, 10);
    if (isNaN(orderCount) || orderCount < 0) {
      setSnackbar({ open: true, message: 'Order count must be a valid number', severity: 'warning' });
      return;
    }

    try {
      if (dialog.mode === 'add') {
        await api.post('/etsy/daily-orders', {
          date: dialog.data.date,
          storeId: dialog.data.storeId,
          orderCount,
        });
        setSnackbar({ open: true, message: 'Order count added successfully', severity: 'success' });
      } else {
        await api.patch(`/etsy/daily-orders/${dialog.editingId}`, {
          date: dialog.data.date,
          storeId: dialog.data.storeId,
          orderCount,
        });
        setSnackbar({ open: true, message: 'Order count updated successfully', severity: 'success' });
      }

      handleCloseDialog();
      fetchOrders();
    } catch (err) {
      console.error('Error saving order count:', err);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to save order count',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;

    try {
      await api.delete(`/etsy/daily-orders/${id}`);
      setSnackbar({ open: true, message: 'Order count deleted successfully', severity: 'success' });
      fetchOrders();
    } catch (err) {
      console.error('Error deleting order count:', err);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to delete order count',
        severity: 'error',
      });
    }
  };

  const getStoreName = (storeId) => {
    const store = stores.find(s => s._id === storeId);
    return store?.name || storeId;
  };

  // Calculate summary statistics
  const summary = useMemo(() => {
    return {
      totalOrders: orders.reduce((sum, order) => sum + order.orderCount, 0),
      storeCount: new Set(orders.map(o => o.storeId)).size,
      entriesCount: orders.length,
    };
  }, [orders]);

  return (
    <Fade in timeout={500}>
      <AdminPageShell>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {snackbar.open && (
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            sx={{ mb: 2 }}
          >
            {snackbar.message}
          </Alert>
        )}

        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, md: 2 },
            mb: 2,
            background: dashboardSignatureTokens.surfaces.pageCard,
            borderRadius: 2,
          }}
        >
          <PageHeader
            title="Daily Etsy Orders"
            description="Manually track and maintain order counts for each Etsy account on a daily basis."
            sx={{ pt: 0, pb: 1 }}
          />

          <Stack
            direction="row"
            spacing={1.5}
            mb={2}
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
          >
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField
                type="date"
                label="Date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 150 }}
              />

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Store</InputLabel>
                <Select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  label="Store"
                >
                  <MenuItem value="">All Stores</MenuItem>
                  {stores.map((store) => (
                    <MenuItem key={store._id} value={store._id}>
                      {store.name || store._id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={fetchOrders}
                disabled={loading}
              >
                Refresh
              </Button>
            </Stack>

            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenAddDialog}
              sx={{
                background: 'linear-gradient(135deg, #f1641e 0%, #c2410c 100%)',
                color: '#fff',
                '&:hover': {
                  background: 'linear-gradient(135deg, #c2410c 0%, #a62a0c 100%)',
                },
              }}
            >
              Add Entry
            </Button>
          </Stack>

          {/* Summary Stats */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            mb={2}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                flex: 1,
                minWidth: 160,
                background: 'linear-gradient(135deg, #fff5e6 0%, #ffe6cc 100%)',
                borderColor: '#fed7aa',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Total Orders
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                {summary.totalOrders}
              </Typography>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                flex: 1,
                minWidth: 160,
                background: 'linear-gradient(135deg, #e6f2ff 0%, #cce5ff 100%)',
                borderColor: '#a8d4ff',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Stores
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                {summary.storeCount}
              </Typography>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                flex: 1,
                minWidth: 160,
                background: 'linear-gradient(135deg, #f0e6ff 0%, #e6ccff 100%)',
                borderColor: '#d4a8ff',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Entries
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                {summary.entriesCount}
              </Typography>
            </Paper>
          </Stack>
        </Paper>

        {/* Table */}
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>Date</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Store</TableCell>
                  <TableCell sx={tableHeaderCellSx} align="right">Order Count</TableCell>
                  <TableCell sx={tableHeaderCellSx} align="center" width={120}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        No entries found. Add one to get started!
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((row) => (
                    <TableRow key={row._id} hover>
                      <TableCell sx={tableBodyCellSx}>
                        <Typography variant="body2">{row.date}</Typography>
                      </TableCell>
                      <TableCell sx={tableBodyCellSx}>
                        <Chip
                          label={typeof row.storeId === 'object' ? (row.storeId?.name || 'Unknown') : getStoreName(row.storeId)}
                          size="small"
                          sx={{
                            background: 'linear-gradient(135deg, #f1641e 0%, #c2410c 100%)',
                            color: '#fff',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="right">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.orderCount}
                        </Typography>
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="center">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenEditDialog(row)}
                            sx={{ color: '#f1641e' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(row._id)}
                            sx={{ color: '#d32f2f' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialog.open} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {dialog.mode === 'add' ? 'Add Daily Order Count' : 'Edit Daily Order Count'}
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <TextField
                type="date"
                label="Date"
                value={dialog.data.date}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, date: e.target.value } })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Store</InputLabel>
                <Select
                  value={dialog.data.storeId}
                  onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, storeId: e.target.value } })}
                  label="Store"
                >
                  <MenuItem value="">Select Store</MenuItem>
                  {stores.map((store) => (
                    <MenuItem key={store._id} value={store._id}>
                      {store.name || store._id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                type="number"
                label="Order Count"
                value={dialog.data.orderCount}
                onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, orderCount: e.target.value } })}
                placeholder="Enter order count"
                inputProps={{ min: 0 }}
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button
              onClick={handleSaveDialog}
              variant="contained"
              sx={{
                background: 'linear-gradient(135deg, #f1641e 0%, #c2410c 100%)',
                color: '#fff',
              }}
            >
              {dialog.mode === 'add' ? 'Add' : 'Update'}
            </Button>
          </DialogActions>
        </Dialog>
      </AdminPageShell>
    </Fade>
  );
}
