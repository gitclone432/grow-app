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
  Button,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Pagination,
  TextField,
  OutlinedInput,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ClearIcon from '@mui/icons-material/Clear';
import ChatIcon from '@mui/icons-material/Chat';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../lib/api';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import ChatModal from '../../components/ChatModal';
import OrderDetailsModal from '../../components/OrderDetailsModal';
import ColumnSelector from '../../components/ColumnSelector';

// LogsCell component for editable logs field with save functionality
function LogsCell({ value, onSave, id }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleSave = async () => {
    if (localValue === (value || '')) return; // No changes
    setSaving(true);
    try {
      await onSave(id, localValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save logs:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <TextField
      size="small"
      multiline
      maxRows={3}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      disabled={saving}
      placeholder="Add logs..."
      sx={{
        minWidth: 120,
        '& .MuiInputBase-input': { fontSize: '0.75rem' },
        '& .MuiOutlinedInput-root': {
          backgroundColor: saved ? '#e8f5e9' : 'transparent',
          transition: 'background-color 0.3s'
        }
      }}
    />
  );
}

export default function ReturnRequestedPage({
  dateFilter: dateFilterProp,
  hideDateFilter = false,
  embedded = false
}) {
  const EBAY_STATUS_OPTIONS = [
    'Fully Refunded',
    'Partially Refunded',
    'To be returned',
    'Received Item',
    'Awaiting Return Shipment'
  ];

  const AMAZON_STATUS_OPTIONS = [
    'Received',
    'Refund Issued',
    'Replacement Delivered',
    'Dropped Off'
  ];

  const [returns, setReturns] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [snadConfirm, setSnadConfirm] = useState({ open: false, ret: null, action: null });

  const ALL_COLUMNS = [
    { id: 'returnId', label: 'Return ID' },
    { id: 'createdDate', label: 'Created Date (PST)' },
    { id: 'responseDue', label: 'Response Due (PST)' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'productName', label: 'Product Name' },
    { id: 'dateSold', label: 'Date Sold (PST)' },
    { id: 'seller', label: 'Seller' },
    { id: 'buyer', label: 'Buyer' },
    { id: 'item', label: 'Item' },
    { id: 'reason', label: 'Reason' },
    { id: 'status', label: 'Status' },
    { id: 'ebayStatus', label: 'eBay Status' },
    { id: 'amazonStatus', label: 'Amazon Status' },
    { id: 'refundAmount', label: 'Refund Amount' },
    { id: 'worksheetStatus', label: 'Worksheet Status' },
    { id: 'logs', label: 'Logs' },
    { id: 'snad', label: 'SNAD' },
    { id: 'chat', label: 'Chat' },
  ];
  const [visibleColumns, setVisibleColumns] = useState(ALL_COLUMNS.map(c => c.id));

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReturns, setTotalReturns] = useState(0);
  const limit = 50; // Items per page

  // Snackbar state for sync results
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // Filter states
  const [statusFilter, setStatusFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState([]);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [internalDateFilter, setInternalDateFilter] = useState({
    mode: 'all',
    single: '',
    from: '',
    to: ''
  });
  const dateFilter = useMemo(
    () => dateFilterProp ?? internalDateFilter,
    [dateFilterProp, internalDateFilter]
  );

  const hasFetchedInitialData = useRef(false);

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSource, setExportSource] = useState('page'); // 'page' = current page, 'custom' = date range
  const [exportDateMode, setExportDateMode] = useState('all'); // 'all', 'single', 'range'
  const [exportSingleDate, setExportSingleDate] = useState('');
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [exportFilename, setExportFilename] = useState('Return_Requests');

  // Fetch sellers on mount
  useEffect(() => {
    async function fetchSellers() {
      try {
        const res = await api.get('/sellers/all');
        setSellers(res.data || []);
      } catch (e) {
        console.error('Failed to fetch sellers:', e);
      }
    }
    fetchSellers();
  }, []);

  // Load returns when filters or page changes
  useEffect(() => {
    if (!hasFetchedInitialData.current) {
      hasFetchedInitialData.current = true;
      loadStoredReturns();
      return;
    }
    loadStoredReturns();
  }, [statusFilter, sellerFilter, reasonFilter, dateFilter, urgentOnly, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (hasFetchedInitialData.current) {
      setPage(1);
    }
  }, [statusFilter, sellerFilter, reasonFilter, dateFilter, urgentOnly]);

  async function loadStoredReturns() {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: page,
        limit: limit
      };
      if (statusFilter) params.status = statusFilter;
      if (sellerFilter) params.sellerId = sellerFilter;
      if (reasonFilter.length > 0) params.reason = reasonFilter.join(',');
      if (urgentOnly) params.urgentOnly = 'true';
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      const res = await api.get('/ebay/stored-returns', { params });
      const returnData = res.data.returns || [];
      const pagination = res.data.pagination || {};

      console.log(`Loaded ${returnData.length} returns from database (Page ${pagination.currentPage}/${pagination.totalPages})`);

      setReturns(returnData);
      setTotalPages(pagination.totalPages || 1);
      setTotalReturns(pagination.totalReturns || 0);
    } catch (e) {
      console.error('Failed to load returns:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchReturnsFromEbay() {
    setFetching(true);
    setError('');
    try {
      const res = await api.post('/ebay/fetch-returns');
      const { totalNewReturns, totalUpdatedReturns, results, errors } = res.data;

      // Build snackbar message with per-seller breakdown and update details
      let msgParts = [];
      let updateDetailsParts = [];

      if (results && results.length > 0) {
        results.forEach(r => {
          if (r.newReturns > 0 || r.updatedReturns > 0) {
            let parts = [];
            if (r.newReturns > 0) parts.push(`${r.newReturns} new`);
            if (r.updatedReturns > 0) parts.push(`${r.updatedReturns} updated`);
            msgParts.push(`${r.sellerName}: ${parts.join(', ')}`);

            // Collect update details for snackbar
            if (r.updateDetails && r.updateDetails.length > 0) {
              r.updateDetails.forEach(ud => {
                let changeDesc = [];
                if (ud.changes?.status) {
                  changeDesc.push(`Status: ${ud.changes.status.from} → ${ud.changes.status.to}`);
                }
                if (ud.changes?.refund) {
                  changeDesc.push(`Refund: $${ud.changes.refund.from} → $${ud.changes.refund.to}`);
                }
                if (changeDesc.length > 0) {
                  updateDetailsParts.push(`• ${r.sellerName} | Return ${ud.returnId} | Order ${ud.orderId}: ${changeDesc.join(', ')}`);
                }
              });
            }
          }
        });
      }

      // Build final snackbar message
      let finalMsg = '';
      if (msgParts.length > 0) {
        finalMsg = `✅ ${msgParts.join(' | ')}`;
        if (updateDetailsParts.length > 0) {
          finalMsg += `\n\n📝 Updates:\n${updateDetailsParts.join('\n')}`;
        }
      } else if (totalNewReturns === 0 && totalUpdatedReturns === 0) {
        finalMsg = '✅ No new or updated returns found';
      } else {
        finalMsg = `✅ ${totalNewReturns} new, ${totalUpdatedReturns} updated`;
      }

      setSnackbarMsg(finalMsg);
      setSnackbarOpen(true);

      if (errors && errors.length > 0) {
        setError(`⚠️ Errors: ${errors.join(', ')}`);
      }

      // Reload returns from database
      await loadStoredReturns();
    } catch (e) {
      console.error('Failed to fetch returns:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setFetching(false);
    }
  }

  const handleClearFilters = () => {
    setStatusFilter('');
    setSellerFilter('');
    setReasonFilter([]);
    setUrgentOnly(false);
    setInternalDateFilter({ mode: 'all', single: '', from: '', to: '' });
  };

  const handleWorksheetStatusChange = async (returnId, newStatus) => {
    try {
      await api.patch(`/ebay/returns/${returnId}/worksheet-status`, { worksheetStatus: newStatus });
      // Update local state
      setReturns(prevReturns =>
        prevReturns.map(ret =>
          ret.returnId === returnId ? { ...ret, worksheetStatus: newStatus } : ret
        )
      );
    } catch (err) {
      console.error('Failed to update worksheet status:', err);
      alert('Failed to update worksheet status: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleMarketplaceStatusChange = async (ret, field, value) => {
    const nextEbayStatus = field === 'ebayStatus' ? value : (ret.ebayStatus || '');
    const nextAmazonStatus = field === 'amazonStatus' ? value : (ret.amazonStatus || '');

    try {
      await api.patch(`/ebay/returns/${ret.returnId}/marketplace-statuses`, {
        ebayStatus: nextEbayStatus,
        amazonStatus: nextAmazonStatus
      });

      setReturns(prevReturns =>
        prevReturns.map(item =>
          item.returnId === ret.returnId
            ? { ...item, ebayStatus: nextEbayStatus, amazonStatus: nextAmazonStatus }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to update marketplace statuses:', err);
      alert('Failed to update marketplace statuses: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCopy = (text) => {
    const val = text || '-';
    if (val === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      // Convert to PST (America/Los_Angeles)
      return d.toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  const getStatusColor = (status) => {
    if (!status) return 'default';
    const s = status.toUpperCase();
    if (s === 'RETURN_REQUESTED') return 'error';
    if (s === 'ITEM_SHIPPED') return 'warning';
    if (s === 'ITEM_READY_TO_SHIP' || s === 'RETURN_SHIPPED') return 'info';
    if (s === 'CLOSED' || s === 'REFUND_ISSUED') return 'success';
    if (s === 'CANCELLED' || s === 'DENIED') return 'error';
    return 'default';
  };

  const hasActiveFilters =
    statusFilter ||
    sellerFilter ||
    reasonFilter.length > 0 ||
    urgentOnly ||
    (!hideDateFilter &&
      (dateFilter.mode !== 'all' || dateFilter.single || dateFilter.from || dateFilter.to));

  // Check if response due date is within next 24 hours (urgent for filter)
  const isResponseUrgent24hrs = (responseDate) => {
    if (!responseDate) return false;
    const now = new Date();
    const dueDate = new Date(responseDate);
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return dueDate <= oneDayFromNow && dueDate >= now;
  };

  // Check if response due date is within next 2 days (urgent)
  const isResponseUrgent = (responseDate) => {
    if (!responseDate) return false;
    const now = new Date();
    const dueDate = new Date(responseDate);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return dueDate <= twoDaysFromNow && dueDate >= now;
  };

  // Check if response due date has already passed
  const isResponseOverdue = (responseDate) => {
    if (!responseDate) return false;
    return new Date(responseDate) < new Date();
  };

  // Handler for saving return logs
  const handleSaveReturnLogs = async (returnId, logs) => {
    try {
      await api.patch(`/ebay/returns/${returnId}/logs`, { logs });
      // Update local state
      setReturns(prevReturns =>
        prevReturns.map(ret =>
          ret.returnId === returnId ? { ...ret, logs } : ret
        )
      );
    } catch (err) {
      console.error('Failed to save return logs:', err);
      throw err;
    }
  };

  const handleToggleSNAD = async (returnId, value) => {
    try {
      await api.patch(`/ebay/returns/${returnId}/mark-snad`, { markedAsSNAD: value });
      setReturns(prev => prev.map(r => r.returnId === returnId ? { ...r, markedAsSNAD: value } : r));
      setSnadConfirm({ open: false, ret: null, action: null });
    } catch (err) {
      console.error('Failed to update SNAD status:', err);
      alert('Failed to update SNAD status: ' + (err.response?.data?.error || err.message));
    }
  };

  // Handle CSV export with date filter and all data
  const handleExportCSV = async () => {
    setExportLoading(true);
    try {
      let exportData;

      if (exportSource === 'page') {
        // Export current page data directly
        exportData = returns;
      } else {
        // Fetch data with custom date filter
        const params = { limit: 10000 }; // High limit to get all results
        if (statusFilter) params.status = statusFilter;
        if (sellerFilter) params.sellerId = sellerFilter;
        if (reasonFilter.length > 0) params.reason = reasonFilter.join(',');

        // Apply export date filter
        if (exportDateMode === 'single' && exportSingleDate) {
          params.startDate = exportSingleDate;
          params.endDate = exportSingleDate;
        } else if (exportDateMode === 'range') {
          if (exportFromDate) params.startDate = exportFromDate;
          if (exportToDate) params.endDate = exportToDate;
        }

        const res = await api.get('/ebay/stored-returns', { params });
        exportData = res.data.returns || [];
      }

      if (exportData.length === 0) {
        setSnackbarMsg('No data to export');
        setSnackbarOpen(true);
        setExportLoading(false);
        return;
      }

      const csvData = prepareCSVData(exportData, {
        'Return ID': 'returnId',
        'Order ID': 'orderId',
        'Product Name': 'productName',
        'Date Sold': (r) => r.dateSold ? new Date(r.dateSold).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : '',
        'Seller': (r) => r.seller?.user?.username || '',
        'Buyer': 'buyerUsername',
        'Reason': (r) => {
          const reason = r.returnReason?.value || r.returnReason || '';
          const reasonLabels = {
            'WRONG_SIZE': 'Does not fit',
            'DOES_NOT_FIT': "Doesn't fit my vehicle",
            'NOT_AS_DESCRIBED': 'Not As Described',
            'DEFECTIVE_ITEM': 'Defective Item',
            'NO_LONGER_NEED_ITEM': 'No Longer Needed',
            'ORDERED_ACCIDENTALLY': 'Ordered Accidentally',
            'ARRIVED_DAMAGED': 'Arrived Damaged',
            'MISSING_PARTS': 'Missing Parts',
            'OTHER': 'Other'
          };
          return reasonLabels[reason] || reason;
        },
        'Status': (r) => r.currentStatus || r.returnRequest?.currentType || '',
        'eBay Status': 'ebayStatus',
        'Amazon Status': 'amazonStatus',
        'RMA Number': 'RMANumber',
        'Created Date': (r) => r.creationDate ? new Date(r.creationDate).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : '',
        'Response Due': (r) => r.responseDate ? new Date(r.responseDate).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : '',
        'Logs': 'logs',
      });

      downloadCSV(csvData, exportFilename || 'Return_Requests');
      setExportDialogOpen(false);
      setSnackbarMsg(`Successfully exported ${exportData.length} returns`);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export data: ' + err.message);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        ...(embedded
          ? { width: '100%', maxWidth: '100%' }
          : {
            height: 'calc(100vh - 100px)',
            overflow: 'hidden',
            width: '100%',
            maxWidth: '100%',
            p: 3
          })
      }}
    >
      <Stack direction="row" alignItems="center" spacing={2} mb={3} sx={{ flexShrink: 0 }}>
        <AssignmentReturnIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4">Return Requests</Typography>
        <Chip
          label={`${totalReturns} total returns`}
          color="info"
          variant="outlined"
          sx={{ ml: 'auto' }}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Snackbar for sync results */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={10000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity="success"
          sx={{ whiteSpace: 'pre-line', maxWidth: 600 }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>

      {/* Controls Row 1: Fetch Button & Info */}
      <Stack direction="row" spacing={2} mb={2} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            color="primary"
            startIcon={fetching ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
            onClick={fetchReturnsFromEbay}
            disabled={fetching}
          >
            {fetching ? 'Fetching...' : 'Fetch Returns from eBay'}
          </Button>

          <Typography variant="caption" color="text.secondary">
            📅 Polls returns from <strong>last 30 days</strong> from eBay
          </Typography>
        </Stack>

        <Button
          variant="outlined"
          color="success"
          startIcon={<DownloadIcon />}
          onClick={() => setExportDialogOpen(true)}
        >
          Export CSV
        </Button>
        <ColumnSelector
          allColumns={ALL_COLUMNS}
          visibleColumns={visibleColumns}
          onColumnChange={setVisibleColumns}
          onReset={() => setVisibleColumns(ALL_COLUMNS.map(c => c.id))}
          page="return-requested"
        />
      </Stack>

      {/* Controls Row 2: Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          {/* Seller Filter */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              label="Seller"
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.user?.username || s._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              label="Status"
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="RETURN_REQUESTED">Return Requested</MenuItem>
              <MenuItem value="ITEM_READY_TO_SHIP">Item Ready to Ship</MenuItem>
              <MenuItem value="CLOSED">Closed</MenuItem>
            </Select>
          </FormControl>

          {/* Reason Filter - Multi-select */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Reason</InputLabel>
            <Select
              multiple
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              input={<OutlinedInput label="Reason" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip
                      key={value}
                      label={{
                        'WRONG_SIZE': 'Does not fit',
                        'DOES_NOT_FIT': "Doesn't fit my vehicle",
                        'NOT_AS_DESCRIBED': 'Not As Described',
                        'DEFECTIVE_ITEM': 'Defective Item',
                        'NO_LONGER_NEED_ITEM': 'No Longer Needed',
                        'ORDERED_ACCIDENTALLY': 'Ordered Accidentally',
                        'ARRIVED_DAMAGED': 'Arrived Damaged',
                        'MISSING_PARTS': 'Missing Parts',
                        'OTHER': 'Other'
                      }[value] || value}
                      size="small"
                    />
                  ))}
                </Box>
              )}
            >
              <MenuItem value="WRONG_SIZE">Does not fit</MenuItem>
              <MenuItem value="DOES_NOT_FIT">Doesn't fit my vehicle</MenuItem>
              <MenuItem value="NOT_AS_DESCRIBED">Not As Described</MenuItem>
              <MenuItem value="DEFECTIVE_ITEM">Defective Item</MenuItem>
              <MenuItem value="NO_LONGER_NEED_ITEM">No Longer Needed</MenuItem>
              <MenuItem value="ORDERED_ACCIDENTALLY">Ordered Accidentally</MenuItem>
              <MenuItem value="ARRIVED_DAMAGED">Arrived Damaged</MenuItem>
              <MenuItem value="MISSING_PARTS">Missing Parts</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </Select>
          </FormControl>

          {!hideDateFilter && (
            <>
              {/* Date Filter */}
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Date</InputLabel>
                <Select
                  value={dateFilter.mode}
                  label="Date"
                  onChange={(e) => {
                    const mode = e.target.value;
                    if (mode === 'all') {
                      setInternalDateFilter({ mode: 'all', single: '', from: '', to: '' });
                    } else if (mode === 'single') {
                      setInternalDateFilter((prev) => ({
                        mode: 'single',
                        single: prev.single || new Date().toISOString().split('T')[0],
                        from: '',
                        to: ''
                      }));
                    } else {
                      setInternalDateFilter((prev) => ({
                        mode: 'range',
                        single: '',
                        from: prev.from || '',
                        to: prev.to || ''
                      }));
                    }
                  }}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="single">Single date</MenuItem>
                  <MenuItem value="range">Date range</MenuItem>
                </Select>
              </FormControl>

              {dateFilter.mode === 'single' && (
                <TextField
                  size="small"
                  type="date"
                  label="On"
                  value={dateFilter.single}
                  onChange={(e) =>
                    setInternalDateFilter((prev) => ({ ...prev, single: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
              )}

              {dateFilter.mode === 'range' && (
                <>
                  <TextField
                    size="small"
                    type="date"
                    label="From"
                    value={dateFilter.from}
                    onChange={(e) =>
                      setInternalDateFilter((prev) => ({ ...prev, from: e.target.value }))
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    type="date"
                    label="To"
                    value={dateFilter.to}
                    onChange={(e) =>
                      setInternalDateFilter((prev) => ({ ...prev, to: e.target.value }))
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </>
              )}
            </>
          )}

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              color="inherit"
            >
              Clear Filters
            </Button>
          )}

          {/* Urgent Only Switch */}
          <FormControlLabel
            control={
              <Switch
                checked={urgentOnly}
                onChange={(e) => setUrgentOnly(e.target.checked)}
                color="error"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: urgentOnly ? 'bold' : 'normal', color: urgentOnly ? 'error.main' : 'inherit' }}>
                🔥 Urgent (Due in 48hrs)
              </Typography>
            }
          />
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
            flexGrow: 1,
            overflow: 'auto',
            ...(embedded ? {} : { maxHeight: 'calc(100% - 50px)' }),
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
          >
            <TableHead>
              <TableRow>
                {visibleColumns.includes('returnId') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Return ID</strong></TableCell>}
                {visibleColumns.includes('createdDate') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Created Date (PST)</strong></TableCell>}
                {visibleColumns.includes('responseDue') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Response Due (PST)</strong></TableCell>}
                {visibleColumns.includes('orderId') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Order ID</strong></TableCell>}
                {visibleColumns.includes('productName') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100, minWidth: 300 }}><strong>Product Name</strong></TableCell>}
                {visibleColumns.includes('dateSold') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Date Sold (PST)</strong></TableCell>}
                {visibleColumns.includes('seller') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Seller</strong></TableCell>}
                {visibleColumns.includes('buyer') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Buyer</strong></TableCell>}
                {visibleColumns.includes('item') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Item</strong></TableCell>}
                {visibleColumns.includes('reason') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Reason</strong></TableCell>}
                {visibleColumns.includes('status') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Status</strong></TableCell>}
                {visibleColumns.includes('ebayStatus') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>eBay Status</strong></TableCell>}
                {visibleColumns.includes('amazonStatus') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Amazon Status</strong></TableCell>}
                {visibleColumns.includes('refundAmount') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Refund Amount</strong></TableCell>}
                {visibleColumns.includes('worksheetStatus') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Worksheet Status</strong></TableCell>}
                {visibleColumns.includes('logs') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }}><strong>Logs</strong></TableCell>}
                {visibleColumns.includes('snad') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }} align="center"><strong>SNAD</strong></TableCell>}
                {visibleColumns.includes('chat') && <TableCell sx={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 100 }} align="center"><strong>Chat</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} align="center">
                    <Typography variant="body2" color="text.secondary" py={2}>
                      No return requests found. Click "Fetch Returns from eBay" to load data.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                returns.map((ret) => (
                  <TableRow key={ret._id} hover>
                    {visibleColumns.includes('returnId') && <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {ret.returnId || '-'}
                        </Typography>
                        <IconButton size="small" onClick={() => handleCopy(ret.returnId)}>
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </TableCell>}
                    {visibleColumns.includes('createdDate') && <TableCell>
                      <Typography variant="body2" fontSize="0.75rem">
                        {formatDate(ret.creationDate)}
                      </Typography>
                    </TableCell>}
                    {visibleColumns.includes('responseDue') && <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography
                          variant="body2"
                          fontSize="0.75rem"
                          color={ret.returnStatus !== 'CLOSED' && isResponseOverdue(ret.responseDate) ? 'error' : 'inherit'}
                          fontWeight={ret.returnStatus !== 'CLOSED' && (isResponseOverdue(ret.responseDate) || isResponseUrgent(ret.responseDate)) ? 'bold' : 'normal'}
                        >
                          {formatDate(ret.responseDate)}
                        </Typography>
                        {ret.returnStatus !== 'CLOSED' && isResponseOverdue(ret.responseDate) && (
                          <Chip
                            label="OVERDUE"
                            size="small"
                            sx={{
                              fontSize: '0.6rem',
                              height: 18,
                              backgroundColor: '#fbdbc4ff',
                              color: 'black',
                              fontWeight: 'bold'
                            }}
                          />
                        )}
                        {ret.returnStatus !== 'CLOSED' && !isResponseOverdue(ret.responseDate) && isResponseUrgent(ret.responseDate) && (
                          <Chip
                            label="URGENT"
                            size="small"
                            sx={{
                              fontSize: '0.6rem',
                              height: 18,
                              backgroundColor: '#dc3545',
                              color: 'white',
                              fontWeight: 'bold'
                            }}
                          />
                        )}
                      </Stack>
                    </TableCell>}
                    {visibleColumns.includes('orderId') && <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => setSelectedOrderId(ret.orderId)}
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            textTransform: 'none',
                            p: 0,
                            minWidth: 'auto',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                        >
                          {ret.orderId || '-'}
                        </Button>
                        {ret.orderId && (
                          <IconButton size="small" onClick={() => handleCopy(ret.orderId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>}
                    {visibleColumns.includes('productName') && <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2">
                          {ret.productName || '-'}
                        </Typography>
                        {ret.productName && (
                          <IconButton size="small" onClick={() => handleCopy(ret.productName)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>}
                    {visibleColumns.includes('dateSold') && <TableCell>
                      <Typography variant="body2" fontSize="0.75rem">
                        {ret.dateSold ? formatDate(ret.dateSold) : '-'}
                      </Typography>
                    </TableCell>}
                    {visibleColumns.includes('seller') && <TableCell>
                      <Typography variant="body2">{ret.seller?.user?.username || '-'}</Typography>
                    </TableCell>}
                    {visibleColumns.includes('buyer') && <TableCell>
                      <Typography variant="body2">{ret.buyerUsername || '-'}</Typography>
                    </TableCell>}
                    {visibleColumns.includes('item') && <TableCell>
                      <Tooltip title={ret.itemTitle || 'N/A'}>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: 150,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {ret.itemTitle || ret.itemId || '-'}
                        </Typography>
                      </Tooltip>
                      {ret.returnQuantity && (
                        <Typography variant="caption" color="text.secondary">
                          Qty: {ret.returnQuantity}
                        </Typography>
                      )}
                    </TableCell>}
                    {visibleColumns.includes('reason') && <TableCell>
                      <Typography variant="body2" fontSize="0.7rem">
                        {{
                          'WRONG_SIZE': 'Does not fit',
                          'DOES_NOT_FIT': "Doesn't fit my vehicle",
                          'NOT_AS_DESCRIBED': 'Not As Described',
                          'DEFECTIVE_ITEM': 'Defective Item',
                          'NO_LONGER_NEED_ITEM': 'No Longer Needed',
                          'ORDERED_ACCIDENTALLY': 'Ordered Accidentally',
                          'ARRIVED_DAMAGED': 'Arrived Damaged',
                          'MISSING_PARTS': 'Missing Parts',
                          'OTHER': 'Other'
                        }[ret.returnReason] || ret.returnReason || '-'}
                      </Typography>
                    </TableCell>}
                    {visibleColumns.includes('status') && <TableCell>
                      <Chip
                        label={ret.returnStatus || 'Unknown'}
                        color={getStatusColor(ret.returnStatus)}
                        size="small"
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </TableCell>}
                    {visibleColumns.includes('ebayStatus') && <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={ret.ebayStatus || ''}
                          onChange={(e) => handleMarketplaceStatusChange(ret, 'ebayStatus', e.target.value)}
                          displayEmpty
                          sx={{ fontSize: '0.75rem', minWidth: 210 }}
                        >
                          <MenuItem value="">
                            <em>-</em>
                          </MenuItem>
                          {EBAY_STATUS_OPTIONS.map((status) => (
                            <MenuItem key={status} value={status}>{status}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>}
                    {visibleColumns.includes('amazonStatus') && <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={ret.amazonStatus || ''}
                          onChange={(e) => handleMarketplaceStatusChange(ret, 'amazonStatus', e.target.value)}
                          displayEmpty
                          sx={{ fontSize: '0.75rem', minWidth: 210 }}
                        >
                          <MenuItem value="">
                            <em>-</em>
                          </MenuItem>
                          {AMAZON_STATUS_OPTIONS.map((status) => (
                            <MenuItem key={status} value={status}>{status}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>}
                    {visibleColumns.includes('refundAmount') && <TableCell>
                      <Typography variant="body2">
                        {ret.refundAmount?.value
                          ? `${ret.refundAmount.currency} ${ret.refundAmount.value}`
                          : '-'}
                      </Typography>
                    </TableCell>}
                    {visibleColumns.includes('worksheetStatus') && <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={ret.worksheetStatus || 'open'}
                          onChange={(e) => handleWorksheetStatusChange(ret.returnId, e.target.value)}
                          sx={{ fontSize: '0.75rem' }}
                        >
                          <MenuItem value="open">Open</MenuItem>
                          <MenuItem value="attended">Attended</MenuItem>
                          <MenuItem value="resolved">Resolved</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>}
                    {visibleColumns.includes('logs') && <TableCell>
                      <LogsCell
                        value={ret.logs}
                        id={ret.returnId}
                        onSave={handleSaveReturnLogs}
                      />
                    </TableCell>}
                    {visibleColumns.includes('snad') && <TableCell align="center">
                      {ret.markedAsSNAD ? (
                        <Chip
                          label="SNAD"
                          color="warning"
                          size="small"
                          onDelete={() => setSnadConfirm({ open: true, ret, action: false })}
                          sx={{ fontSize: '0.7rem' }}
                        />
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          color="warning"
                          onClick={() => setSnadConfirm({ open: true, ret, action: true })}
                          sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 'unset' }}
                        >
                          + SNAD
                        </Button>
                      )}
                    </TableCell>}
                    {visibleColumns.includes('chat') && <TableCell align="center">
                      <Tooltip title="Chat with buyer">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setSelectedReturn(ret)}
                        >
                          <ChatIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination Controls */}
      {!loading && returns.length > 0 && totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mt: 2, py: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, totalReturns)} of {totalReturns} returns
          </Typography>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, value) => setPage(value)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Chat Modal */}
      {selectedReturn && (
        <ChatModal
          open={Boolean(selectedReturn)}
          onClose={() => setSelectedReturn(null)}
          orderId={selectedReturn.orderId}
          buyerUsername={selectedReturn.buyerUsername}
          buyerName={selectedReturn.buyerUsername}
          itemId={selectedReturn.itemId}
          title="Return Request Chat"
        />
      )}

      {/* Order Details Modal */}
      {selectedOrderId && (
        <OrderDetailsModal
          open={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          orderId={selectedOrderId}
        />
      )}

      {/* SNAD Confirmation Dialog */}
      <Dialog open={snadConfirm.open} onClose={() => setSnadConfirm({ open: false, ret: null, action: null })} maxWidth="sm" fullWidth>
        <DialogTitle>{snadConfirm.action ? 'Mark Return as SNAD?' : 'Remove SNAD Mark?'}</DialogTitle>
        <DialogContent>
          {snadConfirm.ret && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
                {snadConfirm.action
                  ? 'This return will be included in the BBE (Buyer Bad Experience) SNAD calculation for this seller, counting toward the relevant 84-day window.'
                  : 'This return will be removed from the BBE (Buyer Bad Experience) SNAD calculation.'}
              </Typography>
              <Stack spacing={1}>
                <Typography variant="body2"><strong>Order ID:</strong> {snadConfirm.ret.orderId || '-'}</Typography>
                <Typography variant="body2"><strong>Seller:</strong> {snadConfirm.ret.seller?.user?.username || '-'}</Typography>
                <Typography variant="body2"><strong>Buyer:</strong> {snadConfirm.ret.buyerUsername || '-'}</Typography>
                <Typography variant="body2"><strong>Return Reason:</strong> {snadConfirm.ret.returnReason?.replace(/_/g, ' ') || '-'}</Typography>
                <Typography variant="body2"><strong>Refund Amount:</strong> {snadConfirm.ret.refundAmount?.value ? `${snadConfirm.ret.refundAmount.currency} ${snadConfirm.ret.refundAmount.value}` : '-'}</Typography>
                <Typography variant="body2"><strong>Created:</strong> {formatDate(snadConfirm.ret.creationDate)}</Typography>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnadConfirm({ open: false, ret: null, action: null })}>Cancel</Button>
          <Button
            variant="contained"
            color={snadConfirm.action ? 'warning' : 'inherit'}
            onClick={() => handleToggleSNAD(snadConfirm.ret?.returnId, snadConfirm.action)}
          >
            {snadConfirm.action ? 'Mark as SNAD' : 'Remove SNAD Mark'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export CSV Dialog */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Export Returns to CSV</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* Filename Input */}
            <TextField
              label="Filename"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              fullWidth
              helperText=".csv will be added automatically"
              size="small"
            />

            {/* Export Source Selection */}
            <FormControl fullWidth size="small">
              <InputLabel>Export Data</InputLabel>
              <Select
                value={exportSource}
                onChange={(e) => setExportSource(e.target.value)}
                label="Export Data"
              >
                <MenuItem value="page">Current Page ({returns.length} items)</MenuItem>
                <MenuItem value="custom">Custom Date Range</MenuItem>
              </Select>
            </FormControl>

            {/* Date filter options - only show for custom export */}
            {exportSource === 'custom' && (
              <>
                {/* Date Mode Selection */}
                <FormControl fullWidth size="small">
                  <InputLabel>Date Filter</InputLabel>
                  <Select
                    value={exportDateMode}
                    onChange={(e) => setExportDateMode(e.target.value)}
                    label="Date Filter"
                  >
                    <MenuItem value="all">All Dates (No Filter)</MenuItem>
                    <MenuItem value="single">Single Date</MenuItem>
                    <MenuItem value="range">Date Range</MenuItem>
                  </Select>
                </FormControl>

                {/* Single Date Input */}
                {exportDateMode === 'single' && (
                  <TextField
                    label="Select Date"
                    type="date"
                    value={exportSingleDate}
                    onChange={(e) => setExportSingleDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    size="small"
                  />
                )}

                {/* Date Range Inputs */}
                {exportDateMode === 'range' && (
                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="From Date"
                      type="date"
                      value={exportFromDate}
                      onChange={(e) => setExportFromDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="To Date"
                      type="date"
                      value={exportToDate}
                      onChange={(e) => setExportToDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      size="small"
                    />
                  </Stack>
                )}
              </>
            )}

            <Typography variant="caption" color="text.secondary">
              {exportSource === 'page'
                ? 'This will export only the returns currently shown on this page.'
                : 'This will export ALL returns matching the selected filters (not limited to current page). Current page filters (seller, status, reason) will also be applied.'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)} disabled={exportLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleExportCSV}
            disabled={exportLoading}
            startIcon={exportLoading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          >
            {exportLoading ? 'Exporting...' : 'Export CSV'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
