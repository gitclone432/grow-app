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
  Typography,
  CircularProgress,
  Chip,
  Tooltip,
  Stack,
  Divider,
  Pagination,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Snackbar,
  Fade,
} from '@mui/material';
import NoteIcon from '@mui/icons-material/Note';
import ChatIcon from '@mui/icons-material/Chat';
import api from '../../lib/api';
import ChatModal from '../../components/ChatModal';
import FulfillmentNotesSkeleton from '../../components/skeletons/FulfillmentNotesSkeleton';
import { sortSellersByName } from '../../lib/sellersSort';
import { yellowOutlinedButtonSx } from '../../theme/tableStyles.js';

// --- Notes Cell Component ---
function NotesCell({ order, onSave, onNotify }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.fulfillmentNotes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (value === (order.fulfillmentNotes || '')) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(order._id, value);
      onNotify('success', 'Note saved successfully');
      setEditing(false);
    } catch (err) {
      onNotify('error', 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(order.fulfillmentNotes || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ minWidth: 300 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          size="small"
          autoFocus
          disabled={saving}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button 
            size="small" 
            variant="contained" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button 
            size="small" 
            variant="outlined" 
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Tooltip title={order.fulfillmentNotes || 'Click to add note'} arrow placement="left">
      <Box 
        onClick={() => setEditing(true)}
        sx={{ 
          maxWidth: 300, 
          overflow: 'hidden', 
          textOverflow: 'ellipsis',
          bgcolor: 'transparent',
          p: 1,
          border: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'action.hover',
          }
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {order.fulfillmentNotes || 'Click to add note'}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// Format Delivery Date helper
function formatDeliveryDate(order) {
  let minDateStr = order.lineItems?.[0]?.lineItemFulfillmentInstructions?.minEstimatedDeliveryDate;
  let maxDateStr = order.lineItems?.[0]?.lineItemFulfillmentInstructions?.maxEstimatedDeliveryDate || order.estimatedDelivery;

  if (!maxDateStr) return '-';

  const marketplaceId = order.purchaseMarketplaceId;

  const getFormattedDatePart = (dStr) => {
    if (!dStr) return null;
    try {
      const date = new Date(dStr);
      let timeZone = 'UTC';
      if (marketplaceId === 'EBAY_US') timeZone = 'America/Los_Angeles';
      else if (['EBAY_CA', 'EBAY_ENCA'].includes(marketplaceId)) timeZone = 'America/New_York';
      else if (marketplaceId === 'EBAY_AU') timeZone = 'Australia/Sydney';

      return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', timeZone
      });
    } catch { return null; }
  };

  const minPart = getFormattedDatePart(minDateStr);
  const maxPart = getFormattedDatePart(maxDateStr);

  if (minPart && maxPart && minPart !== maxPart) {
    return (
      <Stack spacing={0}>
        <Typography variant="body2" fontWeight="medium">{minPart} -</Typography>
        <Typography variant="body2" fontWeight="medium">{maxPart}</Typography>
      </Stack>
    );
  }

  return (
    <Typography variant="body2">
      {maxPart || '-'}
    </Typography>
  );
}

export default function FulfillmentNotesPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // Filter State
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');

  // Debounced Values
  const [debouncedOrderId, setDebouncedOrderId] = useState('');

  const [selectedOrder, setSelectedOrder] = useState(null);

  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Handler for saving notes
  const handleSaveNote = async (orderId, newNote) => {
    await api.patch(`/ebay/orders/${orderId}/fulfillment-notes`, { fulfillmentNotes: newNote });
    // Refresh orders to show updated note
    setOrders(prev => prev.map(o => o._id === orderId ? { ...o, fulfillmentNotes: newNote } : o));
  };

  // Notification helper
  const showNotification = (severity, message) => {
    setSnackbarSeverity(severity);
    setSnackbarMsg(message);
    setSnackbarOpen(true);
  };

  // 1. Fetch Sellers on Mount
  useEffect(() => {
    const loadSellers = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(sortSellersByName(data || []));
      } catch (e) {
        console.error("Failed to load sellers", e);
      }
    };
    loadSellers();
  }, []);

  // 2. Debounce Logic for Order ID
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOrderId(searchOrderId);
      if (searchOrderId !== debouncedOrderId) setPage(1);
    }, 500);
    return () => clearTimeout(handler);
    // eslint-disable-next-line
  }, [searchOrderId]);

  // 3. Main Fetch Effect
  useEffect(() => {
    fetchOrdersWithNotes();
    // eslint-disable-next-line
  }, [page, debouncedOrderId, selectedSeller]);

  // Handlers
  const handleSellerChange = (e) => {
    setSelectedSeller(e.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchOrderId('');
    setDebouncedOrderId('');
    setSelectedSeller('');
    setPage(1);
  };

  async function fetchOrdersWithNotes() {
    setError('');
    setLoading(true);

    try {
      const params = { 
        hasFulfillmentNotes: true,
        page: page,
        limit: 50
      };

      if (debouncedOrderId) params.searchOrderId = debouncedOrderId;
      if (selectedSeller) params.sellerId = selectedSeller;

      const { data } = await api.get('/ebay/stored-orders', { params });

      setOrders(data?.orders || []);

      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalOrders(data.pagination.totalOrders);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load orders with notes');
    } finally {
      setLoading(false);
    }
  }
  if (loading && orders.length === 0) return <FulfillmentNotesSkeleton />;

  return (
    <Fade in timeout={600}>
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 100px)',
      overflow: 'hidden',
      width: '100%',
      maxWidth: '100%',
      p: 3
    }}>
      <Paper sx={{ p: 2, mb: 2, flexShrink: 0 }}>
        {/* HEADER */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <NoteIcon color="primary" />
            <Typography variant="h5" fontWeight="bold">Orders with Fulfillment Notes</Typography>
          </Stack>
          <Chip label={`${totalOrders} orders`} color="primary" variant="filled" size="small" />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* FILTERS SECTION */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            {/* 1. SELLER FILTER */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="seller-select-label">Select Seller</InputLabel>
              <Select
                labelId="seller-select-label"
                value={selectedSeller}
                label="Select Seller"
                onChange={handleSellerChange}
              >
                <MenuItem value=""><em>All Sellers</em></MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.user?.email || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 2. ORDER ID */}
            <TextField
              size="small"
              label="Order ID"
              value={searchOrderId}
              onChange={(e) => setSearchOrderId(e.target.value)}
              placeholder="Search ID..."
            />

            <Button variant="outlined" onClick={handleClearFilters} size="small" sx={{ height: 40, boxSizing: 'border-box' }}>Clear</Button>
          </Stack>
        </Box>

        {error && (
          <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
        )}
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <Box sx={{ textAlign: 'center', p: 4, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <NoteIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
          <Typography variant="body1" color="text.secondary">
            No orders with fulfillment notes found.
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer 
            component={Paper}
            sx={{ 
              flexGrow: 1, 
              overflow: 'auto',
              width: '100%',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#f1f1f1',
                borderRadius: '10px',
                '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '10px',
                '&:hover': {
                  backgroundColor: '#555', 
                },
              },
              },
            }}
          >
            <Table 
              size="small" 
              stickyHeader
              sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}
            >
              <TableHead>
                <TableRow>
                <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Seller</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Order ID</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Marketplace</TableCell>

                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Buyer Name</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100, minWidth: 150 }}>Delivery Date</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100, minWidth: 300 }}>Fulfillment Notes</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }} align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order, idx) => {
                  return (
                    <TableRow key={order._id || idx} hover>
                      <TableCell>
                        {order.seller?.user?.username || order.seller?.user?.email || order.sellerId || '-'}
                      </TableCell>
                      <TableCell>
                      <Typography variant="body2" fontWeight="medium" sx={{ color: 'primary.main' }}>
                      {order.orderId || order.legacyOrderId || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                      <Chip 
                          label={order.purchaseMarketplaceId || 'Unknown'} 
                          size="small" 
                          variant="outlined"
                          color={
                            order.purchaseMarketplaceId === 'EBAY_US' ? 'primary' :
                            order.purchaseMarketplaceId === 'EBAY_CA' || order.purchaseMarketplaceId === 'EBAY_ENCA' ? 'secondary' :
                            order.purchaseMarketplaceId === 'EBAY_AU' ? 'success' :
                            'default'
                          }
                        />
                      </TableCell>

                      <TableCell>
                      <Tooltip title={order.buyer?.buyerRegistrationAddress?.fullName || '-'} arrow>
                          <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                            {order.buyer?.buyerRegistrationAddress?.fullName || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        {formatDeliveryDate(order)}
                      </TableCell>

                      <TableCell>
                        <NotesCell 
                          order={order} 
                          onSave={handleSaveNote} 
                          onNotify={showNotification} 
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Open conversation">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ChatIcon fontSize="small" />}
                            onClick={() => setSelectedOrder(order)}
                            sx={{ ...yellowOutlinedButtonSx, minHeight: 32, px: 1.25, fontSize: '0.75rem' }}
                          >
                            Open
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexShrink: 0 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(e, value) => setPage(value)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      {selectedOrder && (
        <ChatModal
          open={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          orderId={selectedOrder.orderId || selectedOrder.legacyOrderId}
          buyerUsername={selectedOrder.buyer?.username || ''}
          buyerName={selectedOrder.shippingFullName || selectedOrder.buyer?.buyerRegistrationAddress?.fullName || ''}
          itemId={selectedOrder.itemNumber || selectedOrder.lineItems?.[0]?.legacyItemId || selectedOrder.lineItems?.[0]?.itemId || ''}
          itemTitle={selectedOrder.productName || selectedOrder.lineItems?.[0]?.title || ''}
          sellerId={selectedOrder.seller?._id || selectedOrder.seller || selectedOrder.sellerId || null}
          sellerName={selectedOrder.seller?.user?.username || ''}
          title="Chat"
          showManageCase={false}
        />
      )}

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
    </Fade>
  );
}
