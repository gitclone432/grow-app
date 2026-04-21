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
  Button,
  Snackbar,
  Alert,
  Pagination,
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fade,
  Switch,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import InfoIcon from '@mui/icons-material/Info';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';
import ColumnSelector from '../../components/ColumnSelector';
import ChatModal from '../../components/ChatModal';
import RemarkTemplateManagerModal from '../../components/RemarkTemplateManagerModal';
import {
  findRemarkTemplateText,
  loadRemarkTemplates,
  saveRemarkTemplates
} from '../../constants/remarkTemplates';
import AwaitingShipmentSkeleton from '../../components/skeletons/AwaitingShipmentSkeleton';

const ALL_COLUMNS = [
  { id: 'seller', label: 'Seller' },
  { id: 'orderId', label: 'Order ID' },
  { id: 'dateSold', label: 'Date Sold' },
  { id: 'shipBy', label: 'Ship By' },
  { id: 'deliveryDate', label: 'Delivery Date' },
  { id: 'productName', label: 'Product Name' },
  { id: 'buyerName', label: 'Buyer Name' },
  { id: 'shippingAddress', label: 'Shipping Address' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'subtotal', label: 'Subtotal' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'salesTax', label: 'Sales Tax' },
  { id: 'discount', label: 'Discount' },
  { id: 'transactionFees', label: 'Transaction Fees' },
  { id: 'adFeeGeneral', label: 'Ad Fee General' },
  { id: 'cancelStatus', label: 'Cancel Status' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'refundItemAmount', label: 'Refund Item' },
  { id: 'refundTaxAmount', label: 'Refund Tax' },
  { id: 'refundTotalToBuyer', label: 'Refund Total' },
  { id: 'orderTotalAfterRefund', label: 'Order Total (After Refund)' },
  { id: 'orderEarnings', label: 'Order Earnings' },
  { id: 'trackingNumber', label: 'Tracking Number' },
  { id: 'manualTracking', label: 'Manual Tracking' },
  { id: 'trackingId', label: 'Tracking ID' },
  { id: 'zipcode', label: 'Zipcode' },
  { id: 'amazonAccount', label: 'Amazon Acc' },
  { id: 'arriving', label: 'Arriving' },
  { id: 'beforeTax', label: 'Before Tax' },
  { id: 'estimatedTax', label: 'Estimated Tax' },
  { id: 'azOrderId', label: 'Az OrderID' },
  { id: 'amazonRefund', label: 'Amazon Refund' },
  { id: 'cardName', label: 'Card Name' },
  { id: 'notes', label: 'Notes' },
  { id: 'messagingStatus', label: 'Messaging' },
  { id: 'remark', label: 'Remark' },
  { id: 'alreadyInUse', label: 'Already in use' }
];

// ... (Rest of the file remains unchanged until ManualTrackingCell)

// Helper to get unique item IDs from order
function getUniqueItemIds(order) {
  if (!order.lineItems || order.lineItems.length === 0) return [];
  const uniqueIds = [...new Set(order.lineItems.map(item => item.legacyItemId).filter(Boolean))];
  return uniqueIds;
}

// Helper to check if order has multiple different items
function hasMultipleItems(order) {
  const uniqueIds = getUniqueItemIds(order);
  return uniqueIds.length > 1;
}

function ManualTrackingCell({ order, onSaved, onCopy, onNotify }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [value, setValue] = useState(order.manualTrackingNumber || '');
  const [carrier, setCarrier] = useState('USPS');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadMode, setUploadMode] = useState('bulk'); // 'bulk' or 'individual'
  const [individualTracking, setIndividualTracking] = useState({}); // { itemId: { trackingNumber, carrier } }

  const uniqueItemIds = getUniqueItemIds(order);
  const multipleItems = uniqueItemIds.length > 1;

  // Sync state when order changes, but only if not currently editing
  useEffect(() => {
    if (!anchorEl) {
      setValue(order.manualTrackingNumber || '');
      // Initialize individual tracking for each item with carrier
      if (multipleItems) {
        const tracking = {};
        uniqueItemIds.forEach(itemId => {
          tracking[itemId] = {
            trackingNumber: order.manualTrackingNumber || '',
            carrier: 'USPS'
          };
        });
        setIndividualTracking(tracking);
      }
    }
  }, [order.manualTrackingNumber, anchorEl, multipleItems, uniqueItemIds]);

  const detectCarrier = (trackingNumber) => {
    if (!trackingNumber) return null;
    const cleanNumber = trackingNumber.trim().toUpperCase();
    if (cleanNumber.startsWith('9')) return 'USPS';
    if (cleanNumber.startsWith('1Z')) return 'UPS';
    return null;
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    setError('');
  };

  const handleClose = () => {
    setAnchorEl(null);
    setError('');
    // Reset value on close if not saved
    setValue(order.manualTrackingNumber || '');
    setCarrier('USPS');
    setUploadMode('bulk');
    setIndividualTracking({});
  };

  const open = Boolean(anchorEl);
  const id = open ? `manual-tracking-popover-${order._id}` : undefined;

  const save = async () => {
    // Validate based on upload mode
    if (uploadMode === 'bulk') {
      if (!value.trim()) {
        setError('Tracking number is required');
        return;
      }
    } else {
      // Check if all individual tracking numbers are filled
      const allFilled = uniqueItemIds.every(itemId => {
        const tracking = individualTracking[itemId];
        return tracking?.trackingNumber?.trim();
      });
      if (!allFilled) {
        setError('Please provide tracking for all items');
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      if (uploadMode === 'bulk' || !multipleItems) {
        // Upload single tracking for all items
        const { data } = await api.post(`/ebay/orders/${order._id}/upload-tracking`, {
          trackingNumber: value.trim(),
          shippingCarrier: carrier
        });

        if (data?.success) {
          onSaved(value.trim());
          handleClose();
          onNotify?.('success', `✅ Tracking uploaded via ${carrier}!`);
        } else {
          setError('Failed to upload');
          onNotify?.('error', 'Failed to upload tracking to eBay');
        }
      } else {
        // Upload individual tracking for each item with their own carriers
        const trackingData = uniqueItemIds.map(itemId => ({
          itemId,
          trackingNumber: individualTracking[itemId].trackingNumber,
          carrier: individualTracking[itemId].carrier
        }));

        const { data } = await api.post(`/ebay/orders/${order._id}/upload-tracking-multiple`, {
          trackingData
        });

        if (data?.success) {
          onSaved(individualTracking[uniqueItemIds[0]].trackingNumber); // Save first one for display
          handleClose();
          onNotify?.('success', `✅ ${uniqueItemIds.length} tracking numbers uploaded!`);
        } else {
          setError('Failed to upload');
          onNotify?.('error', 'Failed to upload tracking to eBay');
        }
      }
    } catch (e) {
      const errorMsg = e?.response?.data?.error || 'Upload failed';
      // Check for error types to give better feedback
      if (e?.response?.data?.errorType === 'TRACKING_NOT_APPLIED') {
        setError('Verification Failed: Tracking not found on order.');
      } else {
        setError(errorMsg);
      }
      onNotify?.('error', `Failed: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* VIEW MODE */}
      <Stack direction="row" alignItems="center" spacing={1}>
        {order.manualTrackingNumber ? (
          <>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {order.manualTrackingNumber}
            </Typography>
            <IconButton
              size="small"
              onClick={() => onCopy?.(order.manualTrackingNumber)}
              aria-label="copy tracking"
            >
              <ContentCopyIcon fontSize="small" sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton size="small" onClick={handleClick} aria-label="edit tracking">
              <EditIcon fontSize="small" sx={{ fontSize: 16 }} />
            </IconButton>
          </>
        ) : (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleClick}
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 400 }}
          >
            Add Tracking
          </Button>
        )}
      </Stack>

      {/* EDIT POPOVER */}
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          sx: { p: 2, width: multipleItems && uploadMode === 'individual' ? 550 : 320, mt: 1 }
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
          Upload Tracking to eBay
        </Typography>

        {/* Show upload mode selector if multiple different items */}
        {multipleItems && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.lighter', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
            <Typography variant="caption" color="info.main" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
              This order has {uniqueItemIds.length} different items
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant={uploadMode === 'bulk' ? 'contained' : 'outlined'}
                onClick={() => setUploadMode('bulk')}
                sx={{ flex: 1, textTransform: 'none' }}
              >
                Same for All
              </Button>
              <Button
                size="small"
                variant={uploadMode === 'individual' ? 'contained' : 'outlined'}
                onClick={() => setUploadMode('individual')}
                sx={{ flex: 1, textTransform: 'none' }}
              >
                Separate Tracking
              </Button>
            </Stack>
          </Box>
        )}

        <Stack spacing={2}>
          {uploadMode === 'bulk' || !multipleItems ? (
            // Single tracking number for all items
            <TextField
              label="Tracking Number"
              variant="outlined"
              size="small"
              fullWidth
              value={value}
              onChange={(e) => {
                const newValue = e.target.value;
                setValue(newValue);
                const detected = detectCarrier(newValue);
                if (detected) setCarrier(detected);
              }}
              autoFocus
              placeholder="e.g. 9400..."
            />
          ) : (
            // Individual tracking for each item
            <Stack spacing={1.5}>
              {uniqueItemIds.map((itemId, idx) => {
                const item = order.lineItems.find(li => li.legacyItemId === itemId);
                return (
                  <Box key={itemId}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                      Item {idx + 1}: {item?.title?.substring(0, 40)}...
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        label={`Tracking #${idx + 1}`}
                        variant="outlined"
                        size="small"
                        fullWidth
                        value={individualTracking[itemId]?.trackingNumber || ''}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          const detected = detectCarrier(newValue);
                          setIndividualTracking(prev => ({
                            ...prev,
                            [itemId]: {
                              ...prev[itemId],
                              trackingNumber: newValue,
                              ...(detected ? { carrier: detected } : {})
                            }
                          }));
                        }}
                        placeholder="e.g. 9400..."
                      />
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Carrier</InputLabel>
                        <Select
                          value={individualTracking[itemId]?.carrier || 'USPS'}
                          label="Carrier"
                          onChange={(e) => setIndividualTracking(prev => ({
                            ...prev,
                            [itemId]: {
                              ...prev[itemId],
                              carrier: e.target.value
                            }
                          }))}
                        >
                          <MenuItem value="USPS">USPS</MenuItem>
                          <MenuItem value="UPS">UPS</MenuItem>
                          <MenuItem value="FEDEX">FedEx</MenuItem>
                          <MenuItem value="DHL">DHL</MenuItem>
                          <MenuItem value="AUSTRALIA_POST">Australia Post</MenuItem>
                          <MenuItem value="AUSTRALIA_POST_GLOBAL">Australia Post Global</MenuItem>
                          <MenuItem value="ARAMEX_AUSTRALIA">Aramex Australia</MenuItem>
                          <MenuItem value="OTHER">Other</MenuItem>
                        </Select>
                      </FormControl>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}

          {/* Only show global carrier selector in bulk mode */}
          {(uploadMode === 'bulk' || !multipleItems) && (
            <FormControl size="small" fullWidth>
              <InputLabel>Carrier</InputLabel>
              <Select
                value={carrier}
                label="Carrier"
                onChange={(e) => setCarrier(e.target.value)}
              >
                <MenuItem value="USPS">USPS</MenuItem>
                <MenuItem value="UPS">UPS</MenuItem>
                <MenuItem value="FEDEX">FedEx</MenuItem>
                <MenuItem value="DHL">DHL</MenuItem>
                <MenuItem value="AUSTRALIA_POST">Australia Post</MenuItem>
                <MenuItem value="AUSTRALIA_POST_GLOBAL">Australia Post Global</MenuItem>
                <MenuItem value="ARAMEX_AUSTRALIA">Aramex Australia</MenuItem>
                <MenuItem value="OTHER">Other</MenuItem>
              </Select>
            </FormControl>
          )}

          {error && (
            <Alert severity="error" sx={{ fontSize: '0.75rem', py: 0 }}>
              {error}
            </Alert>
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
            <Button onClick={handleClose} disabled={saving} size="small" color="inherit">
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || !value.trim()}
              variant="contained"
              size="small"
              disableElevation
            >
              {saving ? 'Uploading...' : 'Upload'}
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </div>
  );
}

export default function AwaitingShipmentPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedShipping, setExpandedShipping] = useState({});
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);
  const [remarkConfirmOpen, setRemarkConfirmOpen] = useState(false);
  const [pendingRemarkUpdate, setPendingRemarkUpdate] = useState(null); // { orderId, remarkValue, order }
  const [sendingRemarkMessage, setSendingRemarkMessage] = useState(false);
  const [remarkTemplates, setRemarkTemplates] = useState([]);
  const [manageRemarkTemplatesOpen, setManageRemarkTemplatesOpen] = useState(false);

  // Arrival Date Editing State
  const [editingArrivalDate, setEditingArrivalDate] = useState({});
  const [savingArrivalDateId, setSavingArrivalDateId] = useState(null);

  // Ship By Date Fetch State
  const [fetchingShipByDateIds, setFetchingShipByDateIds] = useState(new Set());

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // Filter State
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [searchBuyerName, setSearchBuyerName] = useState('');
  const [searchMarketplace, setSearchMarketplace] = useState('');
  const [shipByDate, setShipByDate] = useState('');
  const [dateSold, setDateSold] = useState('');
  const [arrivalDateFrom, setArrivalDateFrom] = useState('');
  const [arrivalDateTo, setArrivalDateTo] = useState('');
  const [excludeClient, setExcludeClient] = useState(true);
  const [amazonAccounts, setAmazonAccounts] = useState([]);
  const [selectedAmazonAccount, setSelectedAmazonAccount] = useState('');

  const [visibleColumns, setVisibleColumns] = useState([
    'seller', 'orderId', 'marketplace', 'dateSold', 'shipBy', 'deliveryDate', 'productName', 'buyerName', 'shippingAddress', 'trackingNumber', 'trackingId', 'arriving', 'notes'
  ]); // Default specific to Awaiting Shipment needs, or use ALL_COLUMNS.map(c => c.id)

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (Number.isNaN(num)) return '-';
    return `$${num.toFixed(2)}`;
  };

  // Debounced Values
  const [debouncedOrderId, setDebouncedOrderId] = useState('');
  const [debouncedBuyerName, setDebouncedBuyerName] = useState('');

  // REF: To prevent unnecessary re-fetches
  const lastFetchedParams = useRef('');

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

  // Fetch Amazon Accounts on Mount
  useEffect(() => {
    const loadAmazonAccounts = async () => {
      try {
        const { data } = await api.get('/amazon-accounts');
        setAmazonAccounts(data || []);
      } catch (e) {
        console.error('Failed to load Amazon accounts', e);
      }
    };
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

  // 2. Debounce Logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOrderId(searchOrderId);
      if (searchOrderId !== debouncedOrderId) setPage(1);
    }, 500);
    return () => clearTimeout(handler);
    // eslint-disable-next-line
  }, [searchOrderId]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBuyerName(searchBuyerName);
      if (searchBuyerName !== debouncedBuyerName) setPage(1);
    }, 500);
    return () => clearTimeout(handler);
    // eslint-disable-next-line
  }, [searchBuyerName]);

  // 3. Main Fetch Effect
  useEffect(() => {
    fetchAwaitingOrders();
    // eslint-disable-next-line
  }, [page, debouncedOrderId, debouncedBuyerName, selectedSeller, searchMarketplace, shipByDate, dateSold, arrivalDateFrom, arrivalDateTo, excludeClient, selectedAmazonAccount]);

  // Handlers
  const handleSellerChange = (e) => {
    setSelectedSeller(e.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchOrderId('');
    setSearchBuyerName('');
    setDebouncedOrderId('');
    setDebouncedBuyerName('');
    setSelectedSeller('');
    setSearchMarketplace('');
    setShipByDate('');
    setDateSold('');
    setArrivalDateFrom('');
    setArrivalDateTo('');
    setExcludeClient(true);
    setSelectedAmazonAccount('');
    setPage(1);
  };

  async function fetchAwaitingOrders() {
    setError('');

    // Build Params Object
    const params = {
      awaitingShipment: true,
      page: page,
      limit: 50
    };

    if (debouncedOrderId) params.searchOrderId = debouncedOrderId;
    if (debouncedBuyerName) params.searchBuyerName = debouncedBuyerName;
    if (selectedSeller) params.sellerId = selectedSeller;
    if (searchMarketplace) params.searchMarketplace = searchMarketplace;
    if (shipByDate) params.shipByDate = shipByDate;
    if (dateSold) params.dateSold = dateSold;
    if (arrivalDateFrom) params.arrivalDateFrom = arrivalDateFrom;
    if (arrivalDateTo) params.arrivalDateTo = arrivalDateTo;
    params.excludeClient = excludeClient;
    if (selectedAmazonAccount) params.amazonAccount = selectedAmazonAccount;

    // SMART CHECK: If params haven't changed since last fetch, STOP.
    const paramsString = JSON.stringify(params);
    if (paramsString === lastFetchedParams.current) {
      return; // Skip fetch, prevent loading spinner
    }
    lastFetchedParams.current = paramsString;

    try {
      setLoading(true);

      const { data } = await api.get('/ebay/stored-orders', { params });

      setOrders(data?.orders || []);

      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalOrders(data.pagination.totalOrders);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load awaiting shipment orders');
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = (text) => {
    if (!text || text === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
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

  const handleOpenMessageDialog = (order) => {
    setSelectedOrderForMessage(order);
  };

  const handleCloseMessageDialog = () => {
    setSelectedOrderForMessage(null);
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
      setOrders(prev => prev.map(o => (o._id === orderId ? { ...o, remark: normalizedRemark } : o)));
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
    if (updated) showSnack('success', '✅ Remark updated');
  };

  // --- Fetch Ship By Date ---
  const handleFetchShipByDate = async (order) => {
    const id = order._id;
    setFetchingShipByDateIds(prev => new Set([...prev, id]));
    try {
      const { data } = await api.post(`/ebay/orders/${id}/fetch-ship-by-date`);
      if (data?.shipByDate) {
        setOrders(prev => prev.map(o => o._id === id ? { ...o, shipByDate: data.shipByDate } : o));
        showSnack('success', 'Ship by date fetched successfully');
      }
    } catch (err) {
      showSnack('error', err?.response?.data?.error || 'Failed to fetch ship by date');
    } finally {
      setFetchingShipByDateIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // --- Arrival Date helpers ---
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
    setSavingArrivalDateId(order._id);
    try {
      await api.patch(`/ebay/orders/${order._id}/manual-fields`, { arrivingDate: nextDate });
      setOrders(prev => prev.map(o => o._id === order._id ? { ...o, arrivingDate: nextDate } : o));
      showSnack('success', 'Arrival date updated');
      cancelEditArrivalDate(order._id);
    } catch (err) {
      showSnack('error', 'Failed to update arrival date');
    } finally {
      setSavingArrivalDateId(null);
    }
  };

  const formatArrivingDate = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return 'No Date';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
  };

  const getArrivalDateColor = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return 'default';
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const arrival = new Date(dateStr + 'T00:00:00');
      const diffDays = Math.ceil((arrival - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return 'error';
      if (diffDays <= 2) return 'warning';
      return 'success';
    } catch { return 'default'; }
  };

  const toggleShippingExpanded = (orderId) => {
    setExpandedShipping(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const formatDate = (dateStr, marketplaceId) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      let timeZone = 'UTC';
      let timeZoneLabel = 'UTC';

      if (marketplaceId === 'EBAY_US') {
        timeZone = 'America/Los_Angeles';
        timeZoneLabel = 'PT';
      } else if (marketplaceId === 'EBAY_CA' || marketplaceId === 'EBAY_ENCA') {
        timeZone = 'America/New_York';
        timeZoneLabel = 'ET';
      } else if (marketplaceId === 'EBAY_AU') {
        timeZone = 'Australia/Sydney';
        timeZoneLabel = 'AET';
      }

      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timeZone,
      });

      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timeZone,
      });

      return (
        <Stack spacing={0}>
          <Typography variant="body2">{formattedDate}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {formattedTime} ({timeZoneLabel})
          </Typography>
        </Stack>
      );
    } catch {
      return '-';
    }
  };

  const renderCell = (order, columnId) => {
    switch (columnId) {
      case 'seller':
        return order.seller?.user?.username || order.seller?.user?.email || order.sellerId || '-';
      case 'orderId':
        return (
          <Typography variant="body2" fontWeight="medium" sx={{ color: 'primary.main' }}>
            {order.orderId || order.legacyOrderId || '-'}
          </Typography>
        );
      case 'marketplace':
        return (
          <Chip
            label={order.purchaseMarketplaceId || 'Unknown'}
            size="small"
            variant="outlined"
            color={
              order.purchaseMarketplaceId === 'EBAY_US' ? 'primary' :
                order.purchaseMarketplaceId === 'EBAY_CA' || order.purchaseMarketplaceId === 'EBAY_ENCA' ? 'secondary' :
                  order.purchaseMarketplaceId === 'EBAY_AU' ? 'success' : 'default'
            }
          />
        );
      case 'dateSold':
        return formatDate(order.dateSold, order.purchaseMarketplaceId);
      case 'shipBy': {
        const shipByDateStr = order.shipByDate || order.lineItems?.[0]?.lineItemFulfillmentInstructions?.shipByDate;
        if (!shipByDateStr) {
          const isFetching = fetchingShipByDateIds.has(order._id);
          return (
            <Tooltip title="Fetch ship by date from eBay">
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  disabled={isFetching}
                  onClick={() => handleFetchShipByDate(order)}
                  sx={{ p: 0.5 }}
                >
                  <RefreshIcon sx={{ fontSize: '1rem', animation: isFetching ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
                </IconButton>
              </span>
            </Tooltip>
          );
        }

        // Check if ship-by date is within 24 hours of current IST time
        const shipByDate = new Date(shipByDateStr);
        const nowIST = new Date(); // Current time (system already in IST)
        const twentyFourHoursFromNow = new Date(nowIST.getTime() + 24 * 60 * 60 * 1000);

        // Highlight in red if: ship-by date is in the future AND within 24 hours
        const isUrgent = shipByDate > nowIST && shipByDate <= twentyFourHoursFromNow;

        return (
          <Box sx={isUrgent ? { color: 'error.main', fontWeight: 'bold' } : {}}>
            {formatDate(shipByDateStr, order.purchaseMarketplaceId)}
          </Box>
        );
      }
      case 'deliveryDate': {
        // Use same logic as FulfillmentDashboard's formatDeliveryDate
        const minDateStr = order.lineItems?.[0]?.lineItemFulfillmentInstructions?.minEstimatedDeliveryDate;
        const maxDateStr = order.lineItems?.[0]?.lineItemFulfillmentInstructions?.maxEstimatedDeliveryDate || order.estimatedDelivery;
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
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone });
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
        return <Typography variant="body2">{maxPart || '-'}</Typography>;
      }
      case 'arriving': {
        return editingArrivalDate[order._id] !== undefined ? (
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
              color={getArrivalDateColor(order.arrivingDate)}
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
        );
      }
      case 'productName':
        return (
          <Stack spacing={0.5} sx={{ minWidth: 250, maxWidth: 350 }}>
            {order.lineItems && order.lineItems.length > 0 ? (
              order.lineItems.map((item, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: i < order.lineItems.length - 1 ? '1px dashed rgba(0,0,0,0.1)' : 'none', pb: i < order.lineItems.length - 1 ? 0.5 : 0 }}>
                  <Chip label={`x${item.quantity}`} size="small" sx={{ height: 20, minWidth: 30, fontWeight: 'bold', fontSize: '0.7rem', backgroundColor: item.quantity > 1 ? '#ed6c02' : '#e0e0e0', color: item.quantity > 1 ? '#fff' : 'rgba(0,0,0,0.87)' }} />
                  <Tooltip title={item.title || '-'} arrow>
                    <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>{item.title || '-'}</Typography>
                  </Tooltip>
                  <IconButton size="small" onClick={() => handleCopy(item.title || '-')} sx={{ p: 0.5 }}><ContentCopyIcon fontSize="small" sx={{ fontSize: 14 }} /></IconButton>
                </Box>
              ))
            ) : <Typography variant="body2">-</Typography>}
          </Stack>
        );
      case 'buyerName':
        return (
          <Box>
            <Tooltip title={order.buyer?.buyerRegistrationAddress?.fullName || '-'} arrow>
              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                {order.buyer?.buyerRegistrationAddress?.fullName || '-'}
              </Typography>
            </Tooltip>
            <IconButton size="small" onClick={() => handleCopy(order.buyer?.buyerRegistrationAddress?.fullName || '-')}><ContentCopyIcon fontSize="small" /></IconButton>
          </Box>
        );
      case 'zipcode':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">{order.shippingPostalCode || order.buyer?.buyerRegistrationAddress?.postalCode || '-'}</Typography>
            <IconButton size="small" onClick={() => handleCopy(order.shippingPostalCode || order.buyer?.buyerRegistrationAddress?.postalCode || '-')}><ContentCopyIcon fontSize="small" /></IconButton>
          </Box>
        );
      case 'shippingAddress':
        return (
          <Box sx={{ maxWidth: 300 }}>
            {expandedShipping[order._id] ? (
              <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" fontWeight="medium" sx={{ flex: 1 }}>{order.shippingFullName || '-'}</Typography>
                  <IconButton size="small" onClick={() => handleCopy(order.shippingFullName)}><ContentCopyIcon fontSize="small" /></IconButton>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ flex: 1 }}>{order.shippingAddressLine1 || '-'}</Typography>
                  <IconButton size="small" onClick={() => handleCopy(order.shippingAddressLine1)}><ContentCopyIcon fontSize="small" /></IconButton>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ flex: 1 }}>{order.shippingCity || '-'}</Typography>
                  <IconButton size="small" onClick={() => handleCopy(order.shippingCity)}><ContentCopyIcon fontSize="small" /></IconButton>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ flex: 1 }}>{order.shippingState || '-'}</Typography>
                  <IconButton size="small" onClick={() => handleCopy(order.shippingState)}><ContentCopyIcon fontSize="small" /></IconButton>
                </Box>
                <IconButton size="small" onClick={() => toggleShippingExpanded(order._id)}><ExpandLessIcon /></IconButton>
              </Stack>
            ) : (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}
                </Typography>
                <IconButton size="small" onClick={() => toggleShippingExpanded(order._id)}><ExpandMoreIcon /></IconButton>
              </Stack>
            )}
          </Box>
        );
      case 'manualTracking':
        return (
          <ManualTrackingCell
            order={order}
            onSaved={(tracking) => {
              setOrders(prev => prev.map(o => o._id === order._id ? { ...o, manualTrackingNumber: tracking } : o));
            }}
            onCopy={handleCopy}
            onNotify={(sev, msg) => showSnack(sev, msg)}
          />
        );
      case 'trackingNumber':
        return order.trackingNumber ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="body2" fontFamily="monospace">{order.trackingNumber}</Typography>
            <IconButton size="small" onClick={() => handleCopy(order.trackingNumber)}><ContentCopyIcon fontSize="small" sx={{ fontSize: 14 }} /></IconButton>
          </Stack>
        ) : <Typography variant="body2" color="text.secondary">-</Typography>;
      case 'notes':
        return (
          <NotesCell
            order={order}
            onSaved={(newNotes) => {
              setOrders(prev => prev.map(o => (o._id === order._id ? { ...o, fulfillmentNotes: newNotes } : o)));
            }}
            onNotify={showSnack}
            fieldLabel="Notes"
            valueKey="fulfillmentNotes"
            endpoint="fulfillment-notes"
            payloadKey="fulfillmentNotes"
          />
        );
      case 'trackingId':
        return (
          <NotesCell
            order={order}
            onSaved={(newNotes) => {
              setOrders(prev => prev.map(o => (o._id === order._id ? { ...o, notes: newNotes } : o)));
            }}
            onNotify={showSnack}
            fieldLabel="Tracking ID"
          />
        );
      case 'messagingStatus':
        return (
          <Box sx={{ textAlign: 'center' }}>
            <Tooltip title="Message Buyer">
              <IconButton
                color="primary"
                size="small"
                onClick={() => handleOpenMessageDialog(order)}
              >
                <ChatIcon />
              </IconButton>
            </Tooltip>
          </Box>
        );
      case 'remark':
        return (
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
        );
      case 'subtotal': return formatCurrency(order.subtotalUSD);
      case 'shipping': return formatCurrency(order.shippingUSD);
      case 'salesTax': return formatCurrency(order.salesTaxUSD);
      case 'discount': return formatCurrency(order.discountUSD);
      case 'transactionFees': return formatCurrency(order.transactionFeesUSD);
      case 'adFeeGeneral': return formatCurrency(order.adFeeGeneral);
      case 'orderEarnings':
        return <Typography variant="body2" fontWeight="bold" color={order.orderEarnings >= 0 ? 'success.main' : 'error.main'}>{formatCurrency(order.orderEarnings)}</Typography>;
      case 'cancelStatus':
        return order.cancelState && order.cancelState !== 'NONE_REQUESTED' ? (
          <Chip label={order.cancelState} size="small" color={order.cancelState === 'CANCELED' ? 'error' : 'warning'} />
        ) : '-';
      case 'alreadyInUse':
        return (
          <FormControl size="small" sx={{ minWidth: 70 }}>
            <Select
              value={order.alreadyInUse || 'No'}
              onChange={async (e) => {
                const newValue = e.target.value;
                try {
                  await api.patch(`/ebay/orders/${order._id}/manual-fields`, { alreadyInUse: newValue });
                  setOrders(prev => prev.map(o => o._id === order._id ? { ...o, alreadyInUse: newValue } : o));
                  showSnack('success', 'Updated!');
                } catch (err) {
                  showSnack('error', 'Failed to update');
                }
              }}
              size="small"
              sx={{ fontSize: '0.75rem' }}
            >
              <MenuItem value="Yes">Yes</MenuItem>
              <MenuItem value="No">No</MenuItem>
            </Select>
          </FormControl>
        );

      // Default fallback
      default:
        return order[columnId] || '-';
    }
  };

  if (loading && orders.length === 0) return <AwaitingShipmentSkeleton />;

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
        {/* HEADER - Refresh button removed as requested */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h5" fontWeight="bold">Awaiting Shipment</Typography>
          </Stack>
          <Chip label={`${totalOrders} awaiting`} color="primary" variant="filled" size="small" />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* --- FILTERS SECTION --- */}
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

            {/* 2. ORDER ID (Auto-debounced) */}
            <TextField
              size="small"
              label="Order ID"
              value={searchOrderId}
              onChange={(e) => setSearchOrderId(e.target.value)}
              placeholder="Search ID..."
            />

            {/* 3. BUYER NAME (Auto-debounced) */}
            <TextField
              size="small"
              label="Buyer Name"
              value={searchBuyerName}
              onChange={(e) => setSearchBuyerName(e.target.value)}
              placeholder="Search Buyer..."
            />

            {/* 4. MARKETPLACE FILTER */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="marketplace-select-label">Marketplace</InputLabel>
              <Select
                labelId="marketplace-select-label"
                value={searchMarketplace}
                label="Marketplace"
                onChange={(e) => {
                  setSearchMarketplace(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value=""><em>All</em></MenuItem>
                <MenuItem value="EBAY_US">EBAY_US</MenuItem>
                <MenuItem value="EBAY_AU">EBAY_AU</MenuItem>
                <MenuItem value="EBAY_ENCA">EBAY_CA</MenuItem>
                <MenuItem value="EBAY_GB">EBAY_GB</MenuItem>
              </Select>
            </FormControl>

            {/* 5. SHIP BY DATE FILTER */}
            <TextField
              type="date"
              size="small"
              label="Ship By Date"
              value={shipByDate}
              onChange={(e) => {
                setShipByDate(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />

            {/* 6. DATE SOLD FILTER */}
            <TextField
              type="date"
              size="small"
              label="Date Sold"
              value={dateSold}
              onChange={(e) => {
                setDateSold(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />

            {/* 7. ARRIVAL DATE FROM FILTER */}
            <TextField
              type="date"
              size="small"
              label="Arrival From"
              value={arrivalDateFrom}
              onChange={(e) => {
                setArrivalDateFrom(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />

            {/* 8. ARRIVAL DATE TO FILTER */}
            <TextField
              type="date"
              size="small"
              label="Arrival To"
              value={arrivalDateTo}
              onChange={(e) => {
                setArrivalDateTo(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />

            {/* 9. AMAZON ACCOUNT FILTER */}
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="amazon-account-select-label">Amazon Account</InputLabel>
              <Select
                labelId="amazon-account-select-label"
                value={selectedAmazonAccount}
                label="Amazon Account"
                onChange={(e) => {
                  setSelectedAmazonAccount(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value=""><em>All Accounts</em></MenuItem>
                {amazonAccounts.map((acc) => (
                  <MenuItem key={acc._id} value={acc.name}>{acc.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={excludeClient}
                  onChange={(e) => {
                    setExcludeClient(e.target.checked);
                    setPage(1);
                  }}
                  color="primary"
                />
              }
              label="Exclude Client"
              sx={{ m: 0, px: 1.5, minHeight: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            />

            <Button variant="outlined" onClick={handleClearFilters} size="small" sx={{ height: 40, boxSizing: 'border-box' }}>Clear</Button>

            <ColumnSelector
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              onColumnChange={setVisibleColumns}
              onReset={() => setVisibleColumns(ALL_COLUMNS.map(c => c.id))}
              page="awaiting-shipment"
            />
          </Stack>
        </Box>

        {error && (
          <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
        )}
      </Paper>

      {orders.length === 0 ? (
        <Box sx={{ textAlign: 'center', p: 4, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <LocalShippingIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
          <Typography variant="body1" color="text.secondary">
            No orders found matching criteria.
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
                  {ALL_COLUMNS.filter(c => visibleColumns.includes(c.id)).map(col => (
                    <TableCell
                      key={col.id}
                      sx={{ backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order, idx) => (
                  <TableRow key={order._id || idx}>
                    {ALL_COLUMNS.filter(c => visibleColumns.includes(c.id)).map(col => (
                      <TableCell key={col.id}>
                        {renderCell(order, col.id)}
                      </TableCell>
                    ))}
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
          title="Awaiting Shipment Chat"
          category="Awaiting Shipment"
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

// ... Helper Components ...
// ManualTrackingCell has been moved up


function NotesCell({
  order,
  onSaved,
  onNotify,
  fieldLabel = 'Notes',
  valueKey = 'notes',
  endpoint = 'notes',
  payloadKey = 'notes'
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(order[valueKey] || '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  useEffect(() => {
    setValue(order[valueKey] || '');
  }, [order, valueKey]);

  const startEdit = () => {
    setError('');
    setEditing(true);
  };

  const cancel = () => {
    setValue(order[valueKey] || '');
    setEditing(false);
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch(`/ebay/orders/${order._id}/${endpoint}`, { [payloadKey]: value });
      if (data?.success) {
        onSaved(value);
        setEditing(false);
        onNotify?.('success', `${fieldLabel} saved`);
      } else {
        setError('Failed to save');
        onNotify?.('error', `Failed to save ${fieldLabel.toLowerCase()}`);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || 'Save failed';
      setError(msg);
      onNotify?.('error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            style={{ padding: 6, minWidth: 180, minHeight: 60, resize: 'vertical' }}
            placeholder="Enter notes..."
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" variant="contained" onClick={save} disabled={saving}>Save</Button>
            <Button size="small" onClick={cancel} disabled={saving}>Cancel</Button>
          </div>
          {error && <Typography variant="caption" color="error">{error}</Typography>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Typography variant="body2" sx={{ fontSize: '0.85rem', maxWidth: 200, wordWrap: 'break-word' }}>
            {order[valueKey] || '-'}
          </Typography>
          <Button size="small" onClick={startEdit} sx={{ alignSelf: 'flex-start' }}>
            {order[valueKey] ? `Edit ${fieldLabel}` : `Add ${fieldLabel}`}
          </Button>
        </div>
      )}
    </div>
  );
}
