import React, { useEffect, useMemo, useState, useRef } from 'react';
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
  TableSortLabel,
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
import AttachFileIcon from '@mui/icons-material/AttachFile';
import api from '../../lib/api';
import BuyerMessageSentIndicator from '../../components/BuyerMessageSentIndicator';
import ChatModal from '../../components/ChatModal';
import OrderDetailsModal from '../../components/OrderDetailsModal';
import RemarkTemplateManagerModal from '../../components/RemarkTemplateManagerModal';
import SectionCard from '../../components/SectionCard.jsx';
import { tableContainerSx, tableHeaderCellSx, tableBodyRowSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';
import {
  findRemarkTemplateText,
  loadRemarkTemplates,
  saveRemarkTemplates
} from '../../constants/remarkTemplates';
import AmazonArrivalsSkeleton from '../../components/skeletons/AmazonArrivalsSkeleton';

// Buyer SLA: same 24h reply-window logic as ConversationManagementPage, based on
// the last buyer/seller message timestamps the backend attaches per order.
const SLA_ONE_HOUR_MS = 60 * 60 * 1000;
const SLA_ONE_DAY_MS = 24 * SLA_ONE_HOUR_MS;

function slaParseTimeMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function slaFormatElapsed(ms) {
  if (ms < SLA_ONE_HOUR_MS) return '<1 hr';
  if (ms < SLA_ONE_DAY_MS) return `${Math.floor(ms / SLA_ONE_HOUR_MS)} hr(s)`;
  return `${Math.floor(ms / SLA_ONE_DAY_MS)} day(s)`;
}

function getBuyerSlaLabel(order, nowMs) {
  const buyerMs = slaParseTimeMs(order.lastBuyerMessageAt);
  const sellerMs = slaParseTimeMs(order.lastSellerMessageAt);

  if (!buyerMs) return { label: 'No buyer message', color: 'default' };

  if (sellerMs && sellerMs >= buyerMs) {
    return { label: `Replied ${slaFormatElapsed(nowMs - sellerMs)} ago`, color: 'success' };
  }

  const remainingMs = SLA_ONE_DAY_MS - (nowMs - buyerMs);
  if (remainingMs > 0) {
    return { label: `${slaFormatElapsed(remainingMs)} left`, color: 'warning' };
  }

  return { label: `Overdue ${slaFormatElapsed(Math.abs(remainingMs))}`, color: 'error' };
}

const REMARK_COUNT_CARDS = [
  { key: 'Processing', label: 'Processing', color: '#2563eb' },
  { key: 'Shipped', label: 'Shipped', color: '#059669' },
  { key: 'Late Message', label: 'Late Message', color: '#d97706' },
  { key: 'Delayed', label: 'Delayed', color: '#dc2626' },
  { key: 'Delivered', label: 'Delivered', color: '#7c3aed' }
];

const SORTABLE_COLUMNS = {
  seller: 'Seller',
  orderId: 'Order ID',
  marketplace: 'Marketplace',
  arrivingDate: 'Arriving Date',
  amazonAccount: 'Amazon Account',
  productName: 'Product Name',
  azOrderId: 'Amazon Order ID',
  trackingId: 'Tracking ID',
  notes: 'Notes',
  remark: 'Remark',
  buyerSla: 'Buyer SLA'
};

function SortableHeaderCell({ field, label, sortBy, sortDir, onSort, align, sx }) {
  const active = sortBy === field;
  return (
    <TableCell
      align={align}
      sortDirection={active ? sortDir : false}
      sx={sx}
    >
      <TableSortLabel
        active={active}
        direction={active ? sortDir : 'asc'}
        onClick={() => onSort(field)}
        sx={{
          color: 'inherit !important',
          '& .MuiTableSortLabel-icon': { color: 'inherit !important' },
          '&.Mui-active': { color: 'inherit' },
          fontWeight: 700
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

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
      sx={{
        cursor: 'pointer',
        minHeight: 24,
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
    >
      <Typography
        variant="body2"
        sx={{
          fontSize: '0.85rem',
          fontStyle: !order[valueKey] ? 'italic' : 'normal',
          color: !order[valueKey] ? 'text.secondary' : 'text.primary',
          maxWidth: 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis'
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
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [remarkCounts, setRemarkCounts] = useState({});

  // Sort State (default: arriving date oldest first)
  const [sortBy, setSortBy] = useState('arrivingDate');
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

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
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState(null);
  const [remarkConfirmOpen, setRemarkConfirmOpen] = useState(false);
  const [pendingRemarkUpdate, setPendingRemarkUpdate] = useState(null); // { orderId, remarkValue, order }
  const [sendingRemarkMessage, setSendingRemarkMessage] = useState(false);
  const [editableRemarkMessage, setEditableRemarkMessage] = useState('');
  const [remarkAttachments, setRemarkAttachments] = useState([]);
  const fileInputRefRemark = useRef(null);
  const [remarkTemplates, setRemarkTemplates] = useState([]);
  const [manageRemarkTemplatesOpen, setManageRemarkTemplatesOpen] = useState(false);

  // Debounced Values
  const [debouncedOrderId, setDebouncedOrderId] = useState('');

  // REF: To prevent unnecessary re-fetches / skip stale filter→page races
  const lastFetchedParams = useRef('');
  const filtersChangedRef = useRef(false);

  const remarkCountCards = useMemo(
    () => REMARK_COUNT_CARDS.map(card => ({
      ...card,
      count: remarkCounts?.[card.key] || 0
    })),
    [remarkCounts]
  );

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
    filtersChangedRef.current = true;
    setPage(1);
  }, [selectedSeller, debouncedOrderId, searchMarketplace, selectedAmazonAccount, sortBy, sortDir, arrivalDateFrom, arrivalDateTo]);

  // 4. Fetch Orders (skip intermediate fetch when filters force page→1)
  useEffect(() => {
    if (filtersChangedRef.current && page !== 1) return;
    filtersChangedRef.current = false;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedSeller, debouncedOrderId, searchMarketplace, selectedAmazonAccount, sortBy, sortDir, arrivalDateFrom, arrivalDateTo]);

  async function fetchOrders({ force = false } = {}) {
    // Build Params Object
    const params = {
      amazonArriving: true,
      sortBy,
      sortDir,
      // keep legacy arrivalSort for arrivingDate sorts
      arrivalSort: sortBy === 'arrivingDate' ? sortDir : undefined,
      page: page,
      limit: 50
    };

    if (debouncedOrderId) params.searchOrderId = debouncedOrderId;
    if (selectedSeller) params.sellerId = selectedSeller;
    if (searchMarketplace) params.searchMarketplace = searchMarketplace;
    if (selectedAmazonAccount) params.amazonAccount = selectedAmazonAccount;
    if (arrivalDateFrom) params.arrivalStartDate = arrivalDateFrom;
    if (arrivalDateTo) params.arrivalEndDate = arrivalDateTo;

    // SMART CHECK: If params haven't changed since last fetch, STOP (unless forced refresh).
    const paramsString = JSON.stringify(params);
    if (!force && paramsString === lastFetchedParams.current) {
      return;
    }
    lastFetchedParams.current = paramsString;

    try {
      if (force || orders.length === 0) setLoading(true);
      setError('');

      const { data } = await api.get('/ebay/stored-orders', { params });

      let nextOrders = data?.orders || [];
      // Buyer SLA is attached after query — sort current page locally
      if (sortBy === 'buyerSla') {
        const dir = sortDir === 'desc' ? -1 : 1;
        nextOrders = [...nextOrders].sort((a, b) => {
          const ta = a.lastBuyerMessageAt ? new Date(a.lastBuyerMessageAt).getTime() : 0;
          const tb = b.lastBuyerMessageAt ? new Date(b.lastBuyerMessageAt).getTime() : 0;
          return (ta - tb) * dir;
        });
      }
      setOrders(nextOrders);

      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalOrders(data.pagination.totalOrders);
      }
      setRemarkCounts(data?.remarkCounts || {});
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

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'arrivingDate' ? 'asc' : 'asc');
    }
  };

  const toggleSort = () => {
    if (sortBy === 'arrivingDate') {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy('arrivingDate');
      setSortDir('asc');
    }
  };

  const handleOpenMessageDialog = (order) => {
    setSelectedOrderForMessage(order);
  };

  const handleMessageSent = (messageData) => {
    const payloadOrderId = String(messageData?.orderId || '').trim();
    const payloadBuyer = String(messageData?.buyerUsername || '').trim();
    const payloadItemId = String(messageData?.itemId || '').trim();
    const sentAt = new Date().toISOString();

    const patchOrder = (order) => {
      const rowOrderIds = [order?.orderId, order?.legacyOrderId]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      const rowBuyer = String(order?.buyer?.username || order?.buyerUsername || '').trim();
      const rowItem = String(order?.itemNumber || order?.lineItems?.[0]?.legacyItemId || order?.lineItems?.[0]?.itemId || '').trim();
      const isMatch = payloadOrderId
        ? rowOrderIds.includes(payloadOrderId)
        : Boolean(payloadBuyer && payloadItemId && rowBuyer === payloadBuyer && rowItem === payloadItemId);

      return isMatch
        ? { ...order, hasUnreadBuyerMessage: false, messageUnreadCount: 0, lastSellerMessageAt: sentAt }
        : order;
    };

    setOrders((prev) => prev.map(patchOrder));
    setSelectedOrderForMessage((prev) => (prev ? patchOrder(prev) : prev));
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

  const updateRemarkCountCards = (previousRemark, nextRemark) => {
    setRemarkCounts(prev => {
      const next = { ...(prev || {}) };
      if (previousRemark) {
        next[previousRemark] = Math.max((next[previousRemark] || 0) - 1, 0);
      }
      if (nextRemark) {
        next[nextRemark] = (next[nextRemark] || 0) + 1;
      }
      return next;
    });
  };

  const applyRemarkUpdateOnly = async (orderId, remarkValue) => {
    try {
      const normalizedRemark = remarkValue && String(remarkValue).trim().toLowerCase() !== 'select'
        ? String(remarkValue).trim()
        : null;
      const previousRemark = orders.find(o => o._id === orderId)?.remark || null;
      await api.patch(`/ebay/orders/${orderId}/manual-fields`, { remark: normalizedRemark });
      updateRemarkCountCards(previousRemark, normalizedRemark);
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
      sellerId: order.seller?._id || order.seller || order.sellerId || undefined,
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
      const mediaUrls = remarkAttachments.map((a) => a.url);
      const res = await api.post('/ebay/send-message', {
        orderId: order.orderId || order.legacyOrderId || order._id,
        buyerUsername: order.buyerName || order.buyerUsername || order.buyer?.username || 'Amazon Buyer',
        itemId: order.itemId || order.lineItems?.[0]?.legacyItemId,
        sellerId: order.sellerId || order.seller?._id,
        conversationId: null,
        body: editableRemarkMessage,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : []
      });
      showSnack('success', `✅ Message sent and remark updated to "${remarkValue}"`);
      const updated = await applyRemarkUpdateOnly(orderId, remarkValue);
      if (updated) {
        setOrders(prev =>
          prev.map(o =>
            o._id === orderId ? { ...o, remark: remarkValue } : o
          )
        );
      }
    } catch (err) {
      showSnack('error', err?.response?.data?.error || 'Failed to send message');
    } finally {
      setSendingRemarkMessage(false);
      setRemarkConfirmOpen(false);
      setPendingRemarkUpdate(null);
      setEditableRemarkMessage('');
      setRemarkAttachments([]);
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
    setEditableRemarkMessage('');
    setRemarkAttachments([]);
  };

  const handleRemarkFileSelect = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const { data } = await api.post('/internal-messages/upload-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const uploaded = (data?.urls || []).map((url, index) => ({
        url,
        name: files[index]?.name || 'Image'
      }));

      setRemarkAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      showSnack('error', 'Failed to upload attachment');
    }

    // Reset input
    if (fileInputRefRemark.current) {
      fileInputRefRemark.current.value = '';
    }
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
      const templateText = findRemarkTemplateText(remarkTemplates, remarkValue);
      const replacedText = replaceTemplateVariables(templateText, order);
      setPendingRemarkUpdate({ orderId, remarkValue, order });
      setEditableRemarkMessage(replacedText);
      setRemarkAttachments([]);
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
        <SectionCard sx={{ p: 2, mb: 2, flexShrink: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
            sx={{ width: '100%' }}
          >
            <FormControl size="small" sx={{ flex: '1 1 160px', minWidth: 140, maxWidth: 220 }}>
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
              sx={{ flex: '1 1 140px', minWidth: 130, maxWidth: 180 }}
            />

            <TextField
              type="date"
              size="small"
              label="Arrival To"
              value={arrivalDateTo}
              onChange={(e) => setArrivalDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: '1 1 140px', minWidth: 130, maxWidth: 180 }}
            />

            <TextField
              size="small"
              label="Search Order ID"
              value={searchOrderId}
              onChange={(e) => setSearchOrderId(e.target.value)}
              placeholder="Search by order ID..."
              sx={{ flex: '1 1 180px', minWidth: 150, maxWidth: 280 }}
            />

            <FormControl size="small" sx={{ flex: '1 1 130px', minWidth: 120, maxWidth: 170 }}>
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

            <FormControl size="small" sx={{ flex: '1 1 160px', minWidth: 140, maxWidth: 220 }}>
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
              startIcon={(sortBy === 'arrivingDate' ? sortDir : 'asc') === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
              sx={{ ...yellowOutlinedButtonSx, flex: '0 0 auto', minWidth: 130, height: 40, textTransform: 'none' }}
            >
              {sortBy === 'arrivingDate' && sortDir === 'desc' ? 'Newest First' : 'Oldest First'}
            </Button>

            <Button
              variant="outlined"
              onClick={() => fetchOrders({ force: true })}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              disabled={loading}
              sx={{ ...yellowOutlinedButtonSx, flex: '0 0 auto', minWidth: 100, height: 40 }}
            >
              Refresh
            </Button>
          </Stack>
        </SectionCard>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ mb: 2, flexShrink: 0, flexWrap: { sm: 'wrap' } }}
        >
          {remarkCountCards.map(card => (
            <SectionCard
              key={card.key}
              sx={{
                px: 2,
                py: 1.5,
                minWidth: { xs: '100%', sm: 150 },
                flex: { xs: '1 1 auto', sm: '0 1 170px' },
                borderLeft: '4px solid',
                borderLeftColor: card.color
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                {card.label}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700, color: card.color, lineHeight: 1 }}>
                {card.count}
              </Typography>
            </SectionCard>
          ))}
        </Stack>

        {/* Loading & Error States */}
        {loading && !orders.length ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        ) : !orders.length ? (
          <SectionCard sx={{ p: 4, textAlign: 'center', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No orders with arrival dates found
            </Typography>
          </SectionCard>
        ) : (
          <>
            <TableContainer
              component={Paper}
              sx={{
                ...tableContainerSx,
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
                    <SortableHeaderCell
                      field="seller"
                      label={SORTABLE_COLUMNS.seller}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="orderId"
                      label={SORTABLE_COLUMNS.orderId}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="marketplace"
                      label={SORTABLE_COLUMNS.marketplace}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="arrivingDate"
                      label={SORTABLE_COLUMNS.arrivingDate}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="amazonAccount"
                      label={SORTABLE_COLUMNS.amazonAccount}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="productName"
                      label={SORTABLE_COLUMNS.productName}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="azOrderId"
                      label={SORTABLE_COLUMNS.azOrderId}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="trackingId"
                      label={SORTABLE_COLUMNS.trackingId}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="notes"
                      label={SORTABLE_COLUMNS.notes}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <SortableHeaderCell
                      field="remark"
                      label={SORTABLE_COLUMNS.remark}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                    <TableCell sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }} align="center">Action</TableCell>
                    <SortableHeaderCell
                      field="buyerSla"
                      label={SORTABLE_COLUMNS.buyerSla}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      sx={{ ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 }}
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((order, idx) => (
                    <TableRow key={order._id || idx} hover sx={tableBodyRowSx}>
                      <TableCell>
                        {order.seller?.user?.username || order.seller?.user?.email || order.sellerId || '-'}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography 
                            variant="body2" 
                            fontWeight="medium" 
                            sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                            onClick={() => setSelectedOrderForDetails(order.orderId || order.legacyOrderId)}
                          >
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
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                          <Tooltip title="Open conversation">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<ChatIcon fontSize="small" />}
                              onClick={() => handleOpenMessageDialog(order)}
                              sx={{ ...yellowOutlinedButtonSx, minHeight: 32, px: 1.25, fontSize: '0.75rem' }}
                            >
                              Open
                            </Button>
                          </Tooltip>
                          <BuyerMessageSentIndicator item={order} size={16} />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const buyerSla = getBuyerSlaLabel(order, nowMs);
                          return (
                            <Chip
                              label={buyerSla.label}
                              color={buyerSla.color}
                              size="small"
                              variant={buyerSla.color === 'default' ? 'outlined' : 'filled'}
                            />
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <SectionCard sx={{
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
            </SectionCard>
          </>
        )}

        <Snackbar open={snack.open} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert severity={snack.severity} sx={{ width: '100%' }}>
            {snack.message}
          </Alert>
        </Snackbar>

        {selectedOrderForDetails && (
          <OrderDetailsModal
            open={Boolean(selectedOrderForDetails)}
            onClose={() => setSelectedOrderForDetails(null)}
            orderId={selectedOrderForDetails}
          />
        )}

      {selectedOrderForMessage && (
        <ChatModal
          open={Boolean(selectedOrderForMessage)}
          onClose={handleCloseMessageDialog}
          orderId={selectedOrderForMessage.orderId || selectedOrderForMessage.legacyOrderId}
          buyerUsername={selectedOrderForMessage.buyer?.username || selectedOrderForMessage.buyerUsername || ''}
          buyerName={selectedOrderForMessage.shippingFullName || selectedOrderForMessage.buyer?.buyerRegistrationAddress?.fullName || ''}
          itemId={selectedOrderForMessage.itemNumber || selectedOrderForMessage.lineItems?.[0]?.legacyItemId || selectedOrderForMessage.lineItems?.[0]?.itemId || ''}
          itemTitle={selectedOrderForMessage.productName || selectedOrderForMessage.lineItems?.[0]?.title || ''}
          sellerId={
            selectedOrderForMessage.seller?._id
              ? String(selectedOrderForMessage.seller._id)
              : (selectedOrderForMessage.sellerId
                ? String(selectedOrderForMessage.sellerId)
                : (typeof selectedOrderForMessage.seller === 'string'
                  ? selectedOrderForMessage.seller
                  : null))
          }
          sellerName={selectedOrderForMessage.seller?.user?.username || ''}
          title="Chat"
          showManageCase={false}
          onMessageSent={handleMessageSent}
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
              setEditableRemarkMessage('');
              setRemarkAttachments([]);
            }
          }}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <ChatIcon color="primary" />
              <Typography variant="h6">Send Message to Buyer - Edit & Preview</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="info" icon={<InfoIcon />}>
                You are updating the remark to <strong>"{pendingRemarkUpdate?.remarkValue}"</strong>.
              </Alert>
              
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Message Preview (Edit as needed):
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  maxRows={12}
                  value={editableRemarkMessage}
                  onChange={(e) => setEditableRemarkMessage(e.target.value)}
                  placeholder="Message text..."
                  variant="outlined"
                  size="small"
                />
              </Box>

              {remarkAttachments.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Attachments ({remarkAttachments.length}):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {remarkAttachments.map((attachment, index) => (
                      <Chip
                        key={`${attachment.url}-${index}`}
                        label={attachment.name}
                        onDelete={() => setRemarkAttachments((prev) => prev.filter((_, i) => i !== index))}
                        size="small"
                        variant="outlined"
                        sx={{ maxWidth: 200 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <input 
              ref={fileInputRefRemark} 
              type="file" 
              multiple 
              accept="image/*" 
              hidden 
              onChange={handleRemarkFileSelect} 
            />
            <Tooltip title="Attach images">
              <span>
                <Button
                  size="small"
                  startIcon={<AttachFileIcon />}
                  onClick={() => fileInputRefRemark.current?.click()}
                  disabled={sendingRemarkMessage}
                  variant="outlined"
                >
                  Add Attachment
                </Button>
              </span>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Button 
              onClick={handleSkipRemarkMessage} 
              disabled={sendingRemarkMessage} 
              variant="outlined"
            >
              Just Update Remark
            </Button>
            <Button 
              onClick={handleConfirmRemarkMessage} 
              disabled={sendingRemarkMessage || !editableRemarkMessage.trim()} 
              variant="contained"
            >
              {sendingRemarkMessage ? 'Sending...' : 'Send Message & Update Remark'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Fade>
  );
}
