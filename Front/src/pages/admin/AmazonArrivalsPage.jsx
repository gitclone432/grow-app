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
  Button,
  Snackbar,
  Alert,
  Pagination,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fade,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChatIcon from '@mui/icons-material/Chat';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import api from '../../lib/api';
import ChatModal from '../../components/ChatModal';
import RemarkTemplateManagerModal from '../../components/RemarkTemplateManagerModal';
import {
  findRemarkTemplateText,
  loadRemarkTemplates,
  saveRemarkTemplates
} from '../../constants/remarkTemplates';
import AmazonArrivalsSkeleton from '../../components/skeletons/AmazonArrivalsSkeleton';

function NotesCell({
  order,
  onSave,
  onNotify,
  fieldLabel = 'Notes',
  valueKey = 'notes',
  placeholder = 'Enter notes...',
  emptyText = '+ Add Note'
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(order[valueKey] || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setTempValue(order[valueKey] || '');
    }
  }, [order, valueKey, isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(order._id, tempValue);
      setIsEditing(false);
      onNotify('success', `✅ ${fieldLabel} updated`);
    } catch {
      onNotify('error', `Failed to update ${fieldLabel.toLowerCase()}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <Box onClick={(e) => e.stopPropagation()} sx={{ minWidth: 180 }}>
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button size="small" variant="contained" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setTempValue(order[valueKey] || '');
              setIsEditing(false);
            }}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      sx={{ cursor: 'pointer', minHeight: 24 }}
    >
      <Typography
        variant="body2"
        sx={{
          fontSize: '0.85rem',
          fontStyle: !order[valueKey] ? 'italic' : 'normal',
          color: !order[valueKey] ? 'text.secondary' : 'text.primary'
        }}
      >
        {order[valueKey] || emptyText}
      </Typography>
    </Box>
  );
}

export default function AmazonArrivalsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // Sort State
  const [arrivalSort, setArrivalSort] = useState('asc'); // 'asc' or 'desc'

  // Filter State
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [searchMarketplace, setSearchMarketplace] = useState('');
  const [amazonAccounts, setAmazonAccounts] = useState([]);
  const [selectedAmazonAccount, setSelectedAmazonAccount] = useState('');
  const [arrivalDateFrom, setArrivalDateFrom] = useState('');
  const [arrivalDateTo, setArrivalDateTo] = useState('');
  const [editingArrivalDate, setEditingArrivalDate] = useState({}); // { [orderId]: 'YYYY-MM-DD' }
  const [savingArrivalDateId, setSavingArrivalDateId] = useState(null);
  const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);
  const [remarkConfirmOpen, setRemarkConfirmOpen] = useState(false);
  const [pendingRemarkUpdate, setPendingRemarkUpdate] = useState(null); // { orderId, remarkValue, order }
  const [sendingRemarkMessage, setSendingRemarkMessage] = useState(false);
  const [remarkTemplates, setRemarkTemplates] = useState([]);
  const [manageRemarkTemplatesOpen, setManageRemarkTemplatesOpen] = useState(false);

  // Debounced Values
  const [debouncedOrderId, setDebouncedOrderId] = useState('');

  // REF: To prevent unnecessary re-fetches
  const lastFetchedParams = useRef('');

  // 1. Fetch Sellers and Amazon Accounts on Mount
  useEffect(() => {
    const loadSellers = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data || []);
      } catch (e) {
        console.error("Failed to load sellers", e);
      }
    };
    const loadAmazonAccounts = async () => {
      try {
        const { data } = await api.get('/amazon-accounts');
        setAmazonAccounts(data || []);
      } catch (e) {
        console.error("Failed to load Amazon accounts", e);
      }
    };
    loadSellers();
    loadAmazonAccounts();
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const templates = await loadRemarkTemplates();
      if (mounted) setRemarkTemplates(templates);
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Debounce Order ID Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOrderId(searchOrderId);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchOrderId]);

  // 3. Reset to Page 1 when filters or sort change
  useEffect(() => {
    setPage(1);
  }, [selectedSeller, debouncedOrderId, searchMarketplace, selectedAmazonAccount, arrivalSort, arrivalDateFrom, arrivalDateTo]);

  // 4. Fetch Orders
  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedSeller, debouncedOrderId, searchMarketplace, selectedAmazonAccount, arrivalSort, arrivalDateFrom, arrivalDateTo]);

  async function fetchOrders() {
    // Build Params Object
    const params = {
      amazonArriving: true,
      arrivalSort: arrivalSort,
      page: page,
      limit: 50
    };

    if (debouncedOrderId) params.searchOrderId = debouncedOrderId;
    if (selectedSeller) params.sellerId = selectedSeller;
    if (searchMarketplace) params.searchMarketplace = searchMarketplace;
    if (selectedAmazonAccount) params.amazonAccount = selectedAmazonAccount;
    if (arrivalDateFrom) params.arrivalStartDate = arrivalDateFrom;
    if (arrivalDateTo) params.arrivalEndDate = arrivalDateTo;

    // SMART CHECK: If params haven't changed since last fetch, STOP.
    const paramsString = JSON.stringify(params);
    if (paramsString === lastFetchedParams.current) {
      return; // Skip fetch, prevent loading spinner
    }
    lastFetchedParams.current = paramsString;

    try {
      setLoading(true);
      setError('');

      const { data } = await api.get('/ebay/stored-orders', { params });

      setOrders(data?.orders || []);

      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalOrders(data.pagination.totalOrders);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load Amazon arrivals');
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = (text) => {
    if (!text || text === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      showSnack('success', '✅ Copied to clipboard');
    }
  };

  const showSnack = (severity, message) => {
    setSnack({ open: true, severity, message });
    setTimeout(() => setSnack(prev => ({ ...prev, open: false })), 2500);
  };

  const handleSaveRemarkTemplates = async (nextTemplates) => {
    try {
      const savedTemplates = await saveRemarkTemplates(nextTemplates);
      setRemarkTemplates(savedTemplates);
      showSnack('success', 'Remark templates saved');
    } catch (error) {
      showSnack('error', error?.response?.data?.error || 'Failed to save remark templates');
    }
  };

  const toggleSort = () => {
    setArrivalSort(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const handleOpenMessageDialog = (order) => {
    setSelectedOrderForMessage(order);
  };

  const handleCloseMessageDialog = () => {
    setSelectedOrderForMessage(null);
  };

  const updateSharedOrderNotes = async (orderId, value) => {
    await api.patch(`/ebay/orders/${orderId}/notes`, { notes: value });
    setOrders(prev => prev.map(o => (o._id === orderId ? { ...o, notes: value } : o)));
  };

  const updateFulfillmentNotes = async (orderId, value) => {
    await api.patch(`/ebay/orders/${orderId}/fulfillment-notes`, { fulfillmentNotes: value });
    setOrders(prev => prev.map(o => (o._id === orderId ? { ...o, fulfillmentNotes: value } : o)));
  };

  const replaceTemplateVariables = (template, order) => {
    const buyerFullName = order?.buyer?.buyerRegistrationAddress?.fullName || order?.buyerUsername || 'Customer';
    const buyerFirstName = buyerFullName.split(' ')[0] || 'Customer';
    return template
      .replace(/\{\{buyer_first_name\}\}/g, buyerFirstName)
      .replace(/\{\{buyer_name\}\}/g, buyerFullName)
      .replace(/\{\{order_id\}\}/g, order?.orderId || '');
  };

  const applyRemarkUpdateOnly = async (orderId, remarkValue) => {
    try {
      const normalizedRemark = remarkValue && String(remarkValue).trim().toLowerCase() !== 'select'
        ? String(remarkValue).trim()
        : null;
      await api.patch(`/ebay/orders/${orderId}/manual-fields`, { remark: normalizedRemark });
      if (normalizedRemark === 'Delivered') {
        // Remove the delivered order from the arrivals list
        setOrders(prev => prev.filter(o => o._id !== orderId));
      } else {
        setOrders(prev => prev.map(o => (o._id === orderId ? { ...o, remark: normalizedRemark } : o)));
      }
      return true;
    } catch (err) {
      showSnack('error', err?.response?.data?.error || 'Failed to update remark');
      return false;
    }
  };

  const sendAutoMessageForRemark = async (order, remarkValue) => {
    const template = findRemarkTemplateText(remarkTemplates, remarkValue);
    if (!template) return false;
    const messageBody = replaceTemplateVariables(template, order);

    await api.post('/ebay/send-message', {
      orderId: order.orderId,
      buyerUsername: order.buyer?.username || order.buyerUsername,
      itemId: order.itemNumber || order.lineItems?.[0]?.legacyItemId,
      body: messageBody,
      subject: `Regarding Order #${order.orderId}`
    });
    return true;
  };

  const handleConfirmRemarkMessage = async () => {
    if (!pendingRemarkUpdate) return;
    const { orderId, remarkValue, order } = pendingRemarkUpdate;
    setSendingRemarkMessage(true);
    try {
      const updated = await applyRemarkUpdateOnly(orderId, remarkValue);
      if (!updated) return;

      await sendAutoMessageForRemark(order, remarkValue);
      showSnack('success', `✅ Remark updated to "${remarkValue}" and message sent`);
    } catch (err) {
      showSnack('error', err?.response?.data?.error || 'Failed to send message');
    } finally {
      setSendingRemarkMessage(false);
      setRemarkConfirmOpen(false);
      setPendingRemarkUpdate(null);
    }
  };

  const handleSkipRemarkMessage = async () => {
    if (!pendingRemarkUpdate) return;
    const { orderId, remarkValue } = pendingRemarkUpdate;
    const updated = await applyRemarkUpdateOnly(orderId, remarkValue);
    if (updated) {
      showSnack('success', `✅ Remark updated to "${remarkValue}" (message not sent)`);
    }
    setRemarkConfirmOpen(false);
    setPendingRemarkUpdate(null);
  };

  const handleRemarkUpdate = async (orderId, remarkValue) => {
    if (remarkValue === '__manage_templates__') {
      setManageRemarkTemplatesOpen(true);
      return;
    }

    // allow setting remark back to default/empty without confirmation
    if (!remarkValue) {
      const updated = await applyRemarkUpdateOnly(orderId, '');
      if (updated) showSnack('success', '✅ Remark cleared');
      return;
    }

    const order = orders.find(o => o._id === orderId);
    const hasTemplate = findRemarkTemplateText(remarkTemplates, remarkValue);
    if (order && hasTemplate) {
      setPendingRemarkUpdate({ orderId, remarkValue, order });
      setRemarkConfirmOpen(true);
      return;
    }

    const updated = await applyRemarkUpdateOnly(orderId, remarkValue);
    if (updated) {
      showSnack('success', '✅ Remark updated');
    }
  };

  const startEditArrivalDate = (orderId, currentDate) => {
    setEditingArrivalDate(prev => ({ ...prev, [orderId]: (currentDate || '').slice(0, 10) }));
  };

  const cancelEditArrivalDate = (orderId) => {
    setEditingArrivalDate(prev => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  };

  const saveArrivalDate = async (order) => {
    const nextDate = editingArrivalDate[order._id];
    const currentDate = (order.arrivingDate || '').slice(0, 10);
    if (!nextDate || nextDate === currentDate) {
      cancelEditArrivalDate(order._id);
      return;
    }

    try {
      setSavingArrivalDateId(order._id);
      const { data } = await api.patch(`/ebay/orders/${order._id}/manual-fields`, {
        arrivingDate: nextDate
      });
      const updatedOrder = data?.order;
      setOrders(prev =>
        prev.map(o => (o._id === order._id ? { ...o, arrivingDate: updatedOrder?.arrivingDate || nextDate } : o))
      );
      cancelEditArrivalDate(order._id);
      showSnack('success', '✅ Arrival date updated');
    } catch (err) {
      showSnack('error', err?.response?.data?.error || 'Failed to update arrival date');
    } finally {
      setSavingArrivalDateId(null);
    }
  };

  const formatArrivingDate = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  const getDateColor = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return 'default';
    try {
      const arrivalDate = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      arrivalDate.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil((arrivalDate - today) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return 'error'; // Overdue
      if (diffDays <= 3) return 'warning'; // Arriving soon
      return 'success'; // Future
    } catch {
      return 'default';
    }
  };

  if (loading && orders.length === 0) return <AmazonArrivalsSkeleton />;

  return (
    <Fade in timeout={600}>
    <Box sx={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      p: 3,
      overflow: 'hidden'
    }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Amazon Arrivals
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, flexShrink: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={selectedSeller}
              label="Seller"
              onChange={(e) => setSelectedSeller(e.target.value)}
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map(s => (
                <MenuItem key={s._id} value={s._id}>
                  {s.user?.username || s.user?.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            type="date"
            size="small"
            label="Arrival From"
            value={arrivalDateFrom}
            onChange={(e) => setArrivalDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: { xs: '100%', sm: 170 } }}
          />

          <TextField
            type="date"
            size="small"
            label="Arrival To"
            value={arrivalDateTo}
            onChange={(e) => setArrivalDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: { xs: '100%', sm: 170 } }}
          />

          <TextField
            size="small"
            label="Search Order ID"
            value={searchOrderId}
            onChange={(e) => setSearchOrderId(e.target.value)}
            placeholder="Search by order ID..."
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
          />

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
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
              <MenuItem value="EBAY_GB">UK</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
            <InputLabel>Amazon Account</InputLabel>
            <Select
              value={selectedAmazonAccount}
              label="Amazon Account"
              onChange={(e) => setSelectedAmazonAccount(e.target.value)}
            >
              <MenuItem value="">All Accounts</MenuItem>
              {amazonAccounts.map(acc => (
                <MenuItem key={acc._id} value={acc.name}>
                  {acc.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Sort Toggle Button */}
          <Button
            variant="outlined"
            onClick={toggleSort}
            startIcon={arrivalSort === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
            sx={{ minWidth: { xs: '100%', sm: 140 }, height: 40, textTransform: 'none', boxSizing: 'border-box' }}
          >
            {arrivalSort === 'asc' ? 'Oldest First' : 'Newest First'}
          </Button>

          <Button
            variant="outlined"
            color="primary"
            onClick={fetchOrders}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            disabled={loading}
            sx={{ minWidth: { xs: '100%', sm: 100 }, height: 40, boxSizing: 'border-box' }}
          >
            Refresh
          </Button>
        </Stack>
      </Paper>

      {/* Loading & Error States */}
      {loading && !orders.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      ) : !orders.length ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No orders with arrival dates found
          </Typography>
        </Paper>
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
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '10px',
                '&:hover': {
                  backgroundColor: '#555',
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
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Arriving Date</span>
                      <Tooltip title={arrivalSort === 'asc' ? 'Sorted: Oldest First' : 'Sorted: Newest First'}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {arrivalSort === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                        </Box>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Amazon Account</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Product Name</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Amazon Order ID</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Tracking ID</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Notes</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}>Remark</TableCell>
                  <TableCell sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100, textAlign: 'center' }}>Messaging</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order, idx) => (
                  <TableRow key={order._id || idx} hover>
                    <TableCell>
                      {order.seller?.user?.username || order.seller?.user?.email || order.sellerId || '-'}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2" fontWeight="medium" sx={{ color: 'primary.main' }}>
                          {order.orderId || order.legacyOrderId || '-'}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(order.orderId || order.legacyOrderId)}
                          sx={{ p: 0.5 }}
                        >
                          <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                        </IconButton>
                      </Stack>
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
                      {editingArrivalDate[order._id] !== undefined ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <TextField
                            type="date"
                            size="small"
                            value={editingArrivalDate[order._id]}
                            onChange={(e) =>
                              setEditingArrivalDate(prev => ({ ...prev, [order._id]: e.target.value }))
                            }
                            InputLabelProps={{ shrink: true }}
                            sx={{ minWidth: 145 }}
                          />
                          <IconButton
                            size="small"
                            color="success"
                            disabled={savingArrivalDateId === order._id}
                            onClick={() => saveArrivalDate(order)}
                          >
                            <CheckIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="inherit"
                            disabled={savingArrivalDateId === order._id}
                            onClick={() => cancelEditArrivalDate(order._id)}
                          >
                            <CloseIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip
                            label={formatArrivingDate(order.arrivingDate)}
                            size="small"
                            color={getDateColor(order.arrivingDate)}
                            sx={{ fontWeight: 600 }}
                          />
                          <Tooltip title="Edit arrival date">
                            <IconButton
                              size="small"
                              onClick={() => startEditArrivalDate(order._id, order.arrivingDate)}
                              sx={{ p: 0.5 }}
                            >
                              <EditIcon sx={{ fontSize: '0.95rem' }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.amazonAccount || '-'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Tooltip title={order.productName || order.lineItems?.[0]?.title || '-'}>
                        <Typography variant="body2" sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 300
                        }}>
                          {order.productName || order.lineItems?.[0]?.title || '-'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {order.azOrderId || '-'}
                        </Typography>
                        {order.azOrderId && (
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(order.azOrderId)}
                            sx={{ p: 0.5 }}
                          >
                            <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <NotesCell
                        order={order}
                        onSave={updateSharedOrderNotes}
                        onNotify={showSnack}
                        fieldLabel="Tracking ID"
                        placeholder="Enter tracking ID..."
                        emptyText="+ Add Tracking ID"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <NotesCell
                        order={order}
                        onSave={updateFulfillmentNotes}
                        onNotify={showSnack}
                        valueKey="fulfillmentNotes"
                        fieldLabel="Notes"
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select
                          value={order.remark || ''}
                          displayEmpty
                          onChange={(e) => handleRemarkUpdate(order._id, e.target.value)}
                        >
                          <MenuItem value="">Select Remark</MenuItem>
                          {remarkTemplates.map((template) => (
                            <MenuItem key={template.id} value={template.name}>{template.name}</MenuItem>
                          ))}
                          <MenuItem value="__manage_templates__" sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                            Manage Templates
                          </MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Tooltip title="Message Buyer">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenMessageDialog(order)}
                        >
                          <ChatIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Paper sx={{
            py: 1,
            px: 2,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
            mt: 2
          }}>
            <Typography variant="body2" color="text.secondary" fontSize="0.875rem">
              Showing {orders.length} orders (Page {page} of {totalPages})
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(e, value) => setPage(value)}
              color="primary"
              showFirstButton
              showLastButton
              size="small"
            />
          </Paper>
        </>
      )}

      <Snackbar open={snack.open} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>

      {selectedOrderForMessage && (
        <ChatModal
          open={Boolean(selectedOrderForMessage)}
          onClose={handleCloseMessageDialog}
          orderId={selectedOrderForMessage.orderId}
          buyerUsername={selectedOrderForMessage.buyer?.username || selectedOrderForMessage.buyerUsername}
          buyerName={selectedOrderForMessage.buyer?.buyerRegistrationAddress?.fullName || selectedOrderForMessage.buyerUsername || 'Buyer'}
          itemId={selectedOrderForMessage.itemNumber || selectedOrderForMessage.lineItems?.[0]?.legacyItemId}
          title="Amazon Arrival Chat"
          category="Amazon Arrival"
          caseStatus={selectedOrderForMessage.messagingStatus || 'Open'}
        />
      )}

      <RemarkTemplateManagerModal
        open={manageRemarkTemplatesOpen}
        onClose={() => setManageRemarkTemplatesOpen(false)}
        templates={remarkTemplates}
        onSaveTemplates={handleSaveRemarkTemplates}
      />

      <Dialog
        open={remarkConfirmOpen}
        onClose={() => {
          if (!sendingRemarkMessage) {
            setRemarkConfirmOpen(false);
            setPendingRemarkUpdate(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ChatIcon color="primary" />
            <Typography variant="h6">Send Message to Buyer?</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="info" icon={<InfoIcon />}>
              You are updating the remark to <strong>"{pendingRemarkUpdate?.remarkValue}"</strong>.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Send the related message template to the buyer as well?
            </Typography>
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {pendingRemarkUpdate && findRemarkTemplateText(remarkTemplates, pendingRemarkUpdate.remarkValue)
                  ? replaceTemplateVariables(
                    findRemarkTemplateText(remarkTemplates, pendingRemarkUpdate.remarkValue),
                    pendingRemarkUpdate.order
                  )
                  : ''}
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleSkipRemarkMessage} disabled={sendingRemarkMessage} variant="outlined">
            No, Just Update Remark
          </Button>
          <Button onClick={handleConfirmRemarkMessage} disabled={sendingRemarkMessage} variant="contained">
            {sendingRemarkMessage ? 'Sending...' : 'Yes, Send Message'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
    </Fade>
  );
}
