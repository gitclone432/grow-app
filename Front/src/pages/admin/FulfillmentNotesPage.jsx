import React, { useEffect, useState, useRef } from 'react';
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
  IconButton,
  Stack,
  Divider,
  Pagination,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogContent,
  DialogActions,
  Link,
  Alert,
  Snackbar,
  Fade,
} from '@mui/material';
import NoteIcon from '@mui/icons-material/Note';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../../lib/api';
import FulfillmentNotesSkeleton from '../../components/skeletons/FulfillmentNotesSkeleton';

// --- Chat Dialog Component ---
function ChatDialog({ open, onClose, order }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollingInterval = useRef(null);

  useEffect(() => {
    if (open && order) {
      loadMessages();
      startPolling();
    } else {
      stopPolling();
      setMessages([]);
    }
    return () => stopPolling();
  }, [open, order]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollingInterval.current = setInterval(() => {
      if (order) {
        const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
        api
          .post("/ebay/sync-thread", {
            sellerId: order.seller?._id || order.seller,
            buyerUsername: order.buyer?.username,
            itemId: itemId,
          })
          .then((res) => {
            if (res.data.newMessagesFound) {
              loadMessages(false);
            }
          })
          .catch((err) => console.error("Polling error", err));
      }
    }, 10000);
  };

  async function loadMessages(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const { data } = await api.get("/ebay/chat/messages", {
        params: { orderId: order.orderId },
      });
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
      const { data } = await api.post("/ebay/send-message", {
        orderId: order.orderId,
        buyerUsername: order.buyer?.username,
        itemId: itemId,
        body: newMessage,
        subject: `Regarding Order #${order.orderId}`,
      });

      setMessages([...messages, data.message]);
      setNewMessage("");
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  }

  const sellerName = order?.seller?.user?.username || 'Seller';
  const buyerName = order?.buyer?.buyerRegistrationAddress?.fullName || '-';
  const buyerUsername = order?.buyer?.username || '-';
  const itemId = order?.itemNumber || order?.lineItems?.[0]?.legacyItemId || '';
  let itemTitle = order?.productName || order?.lineItems?.[0]?.title || '';
  const itemCount = order?.lineItems?.length || 0;
  if (itemCount > 1) {
    itemTitle = `${itemTitle} (+${itemCount - 1} more items)`;
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', position: 'relative' }}>
        <Stack 
          direction="row" 
          spacing={1} 
          alignItems="center" 
          sx={{ position: 'absolute', top: 12, right: 12 }}
        >
          <Chip
            label={sellerName}
            size='small'
            icon={<PersonIcon style={{ fontSize: 16 }} />}
            sx={{
              bgcolor: '#e3f2fd',
              color: '#1565c0',
              fontWeight: 'bold',
              height: 24,
              fontSize: '0.75rem',
            }}
          />
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.disabled', ml: 1 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack spacing={1.5} sx={{ pr: 12 }}> 
        <Stack direction="row" alignItems="center" spacing={3} sx={{ mt: 0.5 }}>
            <Box>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Buyer Name
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
                {buyerName}
              </Typography>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ height: 20, alignSelf: 'center', opacity: 0.5 }} />

            <Box>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Username
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.05)', px: 0.5, borderRadius: 0.5 }}>
                {buyerUsername}
              </Typography>
            </Box>
          </Stack>

          <Box>
            <Link
              href={`https://www.ebay.com/itm/${itemId}`}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}
            >
              <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 600, lineHeight: 1.3 }}>
                {itemTitle || `Item ID: ${itemId}`}
              </Typography>
              <OpenInNewIcon
                sx={{ fontSize: 16, color: "primary.main", mt: 0.3 }}
              />
            </Link>

            <Chip
              label={`Order #: ${order?.orderId}`}
              size="small"
              variant="outlined"
              sx={{ 
                borderRadius: 1, 
                height: 22, 
                fontSize: '0.7rem',
                color: 'text.secondary',
                borderColor: 'divider',
                bgcolor: '#fafafa'
              }}
            />
          </Box>
        </Stack>
      </Box>

      <DialogContent
        sx={{ p: 0, bgcolor: '#f0f2f5', height: '500px', display: 'flex', flexDirection: 'column' }}
      >
        <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
          {loading ? (
            <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2}>
              {messages.length === 0 && (
                <Alert severity="info" sx={{ mx: 'auto', width: 'fit-content' }}>
                  No messages yet. Start the conversation below!
                </Alert>
              )}

              {messages.map((msg) => (
                <Box 
                key={msg._id} 
                sx={{ 
                  alignSelf: msg.sender === 'SELLER' ? 'flex-end' : 'flex-start',
                  maxWidth: '70%'
                  }}
                >
                  <Paper
                    elevation={1}
                    sx={{ 
                      p: 1.5, 
                      bgcolor: msg.sender === 'SELLER' ? '#1976d2' : '#ffffff',
                      color: msg.sender === 'SELLER' ? '#fff' : 'text.primary',
                      borderRadius: 2,
                      position: 'relative',
                    }}
                  >
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{msg.body}</Typography>

                    {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {msg.mediaUrls.map((url, idx) => (
                          <Box
                            key={idx}
                            component="img"
                            src={url}
                            alt="Attachment"
                            sx={{ 
                              width: 100, 
                              height: 100, 
                              objectFit: 'cover', 
                              borderRadius: 1, 
                              cursor: 'pointer', 
                              border: '1px solid #ccc' 
                            }}
                            onClick={() => window.open(url, '_blank')}
                          />
                        ))}
                      </Box>
                    )}
                  </Paper>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: msg.sender === 'SELLER' ? 'right' : 'left', fontSize: '0.7rem' }}>
                    {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                    {msg.sender === 'SELLER' && (msg.read ? ' • Read' : ' • Sent')}
                  </Typography>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Stack>
          )}
        </Box>

        <Box
          sx={{ p: 2, bgcolor: '#fff', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={3}
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={sending}
            size="small"
          />
          <Button 
            variant="contained" 
            sx={{ px: 3 }}
            endIcon={sending ? <CircularProgress size={20} color="inherit"/> : <SendIcon />}
            onClick={handleSendMessage}
            disabled={sending || !newMessage.trim()}
          >
            Send
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

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

  // Message dialog state
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);

  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Handlers for messaging
  const handleOpenMessageDialog = (order) => {
    setSelectedOrderForMessage(order);
    setMessageModalOpen(true);
  };

  const handleCloseMessageDialog = () => {
    setMessageModalOpen(false);
    setSelectedOrderForMessage(null);
  };

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
        setSellers(data || []);
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
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100, align: 'center' }}>Chat</TableCell>
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
                        <Tooltip title="Message Buyer">
                          <IconButton
                            color="primary"
                            size="small"
                            onClick={() => handleOpenMessageDialog(order)}
                          >
                            <ChatIcon />
                          </IconButton>
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

      {/* Chat Dialog */}
      {selectedOrderForMessage && (
        <ChatDialog 
          open={messageModalOpen} 
          onClose={handleCloseMessageDialog} 
          order={selectedOrderForMessage} 
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
