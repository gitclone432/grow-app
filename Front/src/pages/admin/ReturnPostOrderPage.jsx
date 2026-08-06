import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Pagination,
  Button,
  Snackbar,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import InventoryIcon from '@mui/icons-material/Inventory';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EscalatorWarningIcon from '@mui/icons-material/EscalatorWarning';
import SendIcon from '@mui/icons-material/Send';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api from '../../lib/api';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import ColumnSelector from '../../components/ColumnSelector';
import { yellowFilledButtonSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';
import { sortSellersByName } from '../../lib/sellersSort.js';

const headerSx = {
  backgroundColor: '#1565c0',
  color: 'white',
  fontWeight: 'bold',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

export default function ReturnPostOrderPage({
  dateFilter: dateFilterProp,
  hideDateFilter = false,
  embedded = false,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchPhase, setFetchPhase] = useState(''); // 'search' | 'details' | ''
  const [error, setError] = useState('');
  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [detailDialog, setDetailDialog] = useState({
    open: false,
    row: null,
    loading: false,
    detail: null,
    tracking: null,
    files: null,
    error: '',
  });
  const [detailTab, setDetailTab] = useState(0);
  const [actionBusyId, setActionBusyId] = useState('');
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, row: null });
  const [declineDialog, setDeclineDialog] = useState({ open: false, row: null });
  const [declineComments, setDeclineComments] = useState('');
  const [messageDialog, setMessageDialog] = useState({ open: false, row: null, text: '' });
  const [escalateDialog, setEscalateDialog] = useState({ open: false, row: null, comments: '', reason: '' });
  const [labelDialog, setLabelDialog] = useState({
    open: false,
    row: null,
    trackingNumber: '',
    carrierEnum: 'USPS',
    comments: '',
    file: null,
    fileName: '',
  });
  const [uploadDialog, setUploadDialog] = useState({
    open: false, row: null, filePurpose: 'ITEM_RELATED', file: null, fileName: '',
  });
  const [partialDialog, setPartialDialog] = useState({
    open: false, row: null, amount: '', currency: 'USD', comments: '',
  });
  const limit = 25;

  const ALL_COLUMNS = [
    { id: 'returnId', label: 'returnId' },
    { id: 'orderId', label: 'orderId' },
    { id: 'seller', label: 'Seller' },
    { id: 'buyerLoginName', label: 'buyerLoginName' },
    { id: 'itemId', label: 'itemId' },
    { id: 'status', label: 'status' },
    { id: 'state', label: 'state' },
    { id: 'reason', label: 'reason' },
    { id: 'reasonType', label: 'reasonType' },
    { id: 'returnCloseReason', label: 'returnCloseReason' },
    { id: 'notes', label: 'notes' },
    { id: 'refund', label: 'refund' },
    { id: 'trackingNumber', label: 'trackingNumber' },
    { id: 'carrierUsed', label: 'carrierUsed' },
    { id: 'trackingStatus', label: 'trackingStatus' },
    { id: 'filesCount', label: 'files' },
    { id: 'marketplaceId', label: 'marketplaceId' },
    { id: 'transactionDate', label: 'transactionDate' },
    { id: 'created', label: 'creationDate' },
    { id: 'responseDue', label: 'Response Due (PST)' },
    { id: 'worksheetStatus', label: 'Worksheet Status' },
    { id: 'action', label: 'Action' },
  ];
  const [visibleColumns, setVisibleColumns] = useState(ALL_COLUMNS.map((c) => c.id));

  const internalDateFilter = useMemo(
    () => ({ mode: 'all', single: '', from: '', to: '' }),
    []
  );
  const dateFilter = dateFilterProp ?? internalDateFilter;

  useEffect(() => {
    api.get('/sellers/all')
      .then((res) => setSellers(sortSellersByName(res.data || [])))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    loadStored();
  }, [dateFilter, sellerFilter, statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [dateFilter.mode, dateFilter.single, dateFilter.from, dateFilter.to, sellerFilter, statusFilter]);

  async function loadStored() {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (sellerFilter) params.sellerId = sellerFilter;
      if (statusFilter) params.status = statusFilter;
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }
      const res = await api.get('/ebay/stored-returns', { params, timeout: 60000 });
      setRows(res.data.returns || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      setTotalCount(res.data.pagination?.totalReturns || res.data.totalReturns || 0);
    } catch (e) {
      if (e.code === 'ECONNABORTED') {
        setError('Loading returns timed out. Try again or narrow filters.');
      } else {
        setError(e.response?.data?.error || e.message);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFromEbayAndEnrich() {
    setFetching(true);
    setFetchPhase('search');
    setError('');
    try {
      // 1) Sync return/search (same as Return Search "Fetch from eBay")
      const res = await api.post('/ebay/fetch-returns', {}, { timeout: 300000 });
      const newCount = res.data.totalNewReturns || 0;
      const updatedCount = res.data.totalUpdatedReturns || 0;
      const errCount = res.data.errors?.length || 0;
      setSellerFilter('');
      setPage(1);

      // 2) Enrich only rows missing detail/files/tracking (no force — force:true re-hits eBay for every row and hangs)
      setFetchPhase('details');
      let checked = 0;
      let updated = 0;
      let failed = 0;
      let enrichError = '';
      try {
        const enrichRes = await api.post(
          '/ebay/enrich-return-details',
          { limit: 100 },
          { timeout: 300000 }
        );
        checked = enrichRes.data.checked || 0;
        updated = enrichRes.data.updated || 0;
        failed = enrichRes.data.failed || 0;
      } catch (e) {
        enrichError = e.response?.data?.error || e.message || 'details timed out';
      }

      const searchFailed = errCount && !newCount && !updatedCount;
      setSnackbar({
        open: true,
        severity: searchFailed || enrichError ? 'error' : (errCount || failed) ? 'warning' : 'success',
        message: enrichError
          ? `Synced ${newCount} new, ${updatedCount} updated — details failed: ${enrichError}`
          : `Synced ${newCount} new, ${updatedCount} updated${errCount ? ` (${errCount} seller error(s))` : ''}; details checked ${checked}, updated ${updated}${failed ? `, failed ${failed}` : ''}`,
      });
      await loadStored();
    } catch (e) {
      const msg = e.code === 'ECONNABORTED'
        ? 'Fetch timed out. Try again or use Refresh to reload stored rows.'
        : (e.response?.data?.error || e.message);
      setError(msg);
    } finally {
      setFetching(false);
      setFetchPhase('');
    }
  }

  async function openApiDetails(row) {
    setDetailTab(0);
    setDetailDialog({
      open: true,
      row,
      loading: true,
      detail: null,
      tracking: null,
      files: null,
      error: '',
    });
    try {
      const [detailRes, filesRes, trackingRes] = await Promise.allSettled([
        api.get(`/ebay/returns/${row.returnId}/detail`),
        api.get(`/ebay/returns/${row.returnId}/files`),
        api.get(`/ebay/returns/${row.returnId}/tracking`),
      ]);
      const errParts = [];
      if (detailRes.status === 'rejected') {
        errParts.push(detailRes.reason?.response?.data?.error || 'detail failed');
      }
      if (filesRes.status === 'rejected') {
        errParts.push(filesRes.reason?.response?.data?.error || 'files failed');
      }
      if (trackingRes.status === 'rejected') {
        errParts.push(trackingRes.reason?.response?.data?.error || 'tracking failed');
      }
      setDetailDialog({
        open: true,
        row,
        loading: false,
        detail: detailRes.status === 'fulfilled' ? detailRes.value.data : null,
        files: filesRes.status === 'fulfilled' ? filesRes.value.data : null,
        tracking: trackingRes.status === 'fulfilled' ? trackingRes.value.data : null,
        error: errParts.join(' | '),
      });
    } catch (e) {
      setDetailDialog({
        open: true,
        row,
        loading: false,
        detail: null,
        tracking: null,
        files: null,
        error: e.response?.data?.error || e.message,
      });
    }
  }

  const handleCopy = (text) => {
    if (!text || text === '-') return;
    navigator?.clipboard?.writeText?.(String(text));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  const getStatusColor = (status) => {
    const s = String(status || '').toUpperCase();
    if (s.includes('CLOSED')) return 'default';
    if (s.includes('REQUEST')) return 'warning';
    if (s.includes('SHIP') || s.includes('LABEL')) return 'info';
    return 'primary';
  };

  // Check if response due date is within next 24 hours
  const isResponseUrgent24hrs = (responseDate) => {
    if (!responseDate) return false;
    const dueDate = new Date(responseDate);
    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  // Check if response due date is within next 2 days
  const isResponseUrgent = (responseDate) => {
    if (!responseDate) return false;
    const dueDate = new Date(responseDate);
    const now = new Date();
    return dueDate.getTime() - now.getTime() > 0 && dueDate.getTime() - now.getTime() < 2 * 24 * 60 * 60 * 1000;
  };

  // Check if response due date has already passed
  const isResponseOverdue = (responseDate) => {
    if (!responseDate) return false;
    return new Date(responseDate) < new Date();
  };

  // Handle worksheet status change
  const handleWorksheetStatusChange = async (returnId, newStatus) => {
    try {
      await api.patch(`/ebay/returns/${returnId}/worksheet-status`, { worksheetStatus: newStatus });
      // Update local state
      setRows(prevRows =>
        prevRows.map(row =>
          row.returnId === returnId ? { ...row, worksheetStatus: newStatus } : row
        )
      );
      setSnackbar({ open: true, message: 'Worksheet status updated', severity: 'success' });
    } catch (err) {
      console.error('Failed to update worksheet status:', err);
      setSnackbar({ open: true, message: 'Failed to update worksheet status', severity: 'error' });
    }
  };

  const getSellerActionTypes = (row) => {
    const fromDoc = row?.sellerAvailableOptions;
    const fromRaw = row?.rawData?.sellerAvailableOptions
      || row?.rawDetail?.summary?.sellerAvailableOptions
      || row?.rawDetail?.sellerAvailableOptions;
    const list = Array.isArray(fromDoc) && fromDoc.length
      ? fromDoc
      : (Array.isArray(fromRaw) ? fromRaw : []);
    return new Set(
      list.map((o) => String(o?.actionType || '').toUpperCase()).filter(Boolean)
    );
  };

  const canSellerRespond = (row) => {
    const status = String(row?.returnStatus || '').toUpperCase();
    const state = String(row?.returnState || '').toUpperCase();
    if (status.includes('CLOSED') || state.includes('CLOSED')) return false;

    const actions = getSellerActionTypes(row);
    if (actions.size > 0) {
      return (
        actions.has('SELLER_APPROVE_REQUEST')
        || actions.has('SELLER_DECLINE_REQUEST')
        || actions.has('SELLER_ISSUE_REFUND')
        || actions.has('SELLER_MARK_AS_RECEIVED')
        || actions.has('MARK_AS_RECEIVED')
      );
    }

    // Fallback when options not enriched yet
    return (
      status.includes('REQUEST')
      || status.includes('WAITING')
      || status.includes('ITEM')
      || status.includes('LABEL')
      || status.includes('DELIVER')
      || !status
    );
  };

  const canApprove = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return canSellerRespond(row);
    return actions.has('SELLER_APPROVE_REQUEST');
  };

  const canDecline = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return false;
    return actions.has('SELLER_DECLINE_REQUEST');
  };

  const canIssueRefund = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return canSellerRespond(row);
    return actions.has('SELLER_ISSUE_REFUND');
  };

  const canMarkReceived = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return false;
    return actions.has('SELLER_MARK_AS_RECEIVED') || actions.has('MARK_AS_RECEIVED');
  };

  const canEscalate = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return canSellerRespond(row);
    return actions.has('SELLER_ESCALATE') || actions.has('ESCALATE');
  };

  const canSendMessage = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return true;
    return actions.has('SELLER_SEND_MESSAGE') || actions.has('SEND_MESSAGE');
  };

  const canOfferPartial = (row) => {
    const actions = getSellerActionTypes(row);
    if (actions.size === 0) return canSellerRespond(row);
    return actions.has('SELLER_OFFER_PARTIAL_REFUND');
  };

  const canAddLabel = (row) => {
    const actions = getSellerActionTypes(row);
    // eBay requires Accept/Approve first; label upload comes on the next step.
    if (actions.has('SELLER_APPROVE_REQUEST')) return false;
    if (actions.size === 0) return canSellerRespond(row);
    return (
      actions.has('SELLER_PROVIDE_LABEL')
      || actions.has('SELLER_UPLOAD_LABEL')
      || actions.has('ADD_SHIPPING_LABEL')
      || actions.has('SELLER_PRINT_SHIPPING_LABEL')
    );
  };

  const canUploadFile = (row) => {
    const status = String(row?.returnStatus || '').toUpperCase();
    const state = String(row?.returnState || '').toUpperCase();
    // File upload is allowed on open returns; eBay often does not list SUBMIT_FILE in sellerAvailableOptions.
    return !(status.includes('CLOSED') || state.includes('CLOSED'));
  };

  const mergeUpdatedRow = (updated) => {
    if (!updated?.returnId) return;
    setRows((prev) => prev.map((r) => (r.returnId === updated.returnId ? { ...r, ...updated } : r)));
  };

  const closeActionMenu = () => setActionMenu({ anchorEl: null, row: null });

  async function runRowAction(row, fn) {
    if (!row?.returnId) return;
    setActionBusyId(row.returnId);
    setError('');
    closeActionMenu();
    try {
      await fn();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  async function handleApprove(row) {
    if (!row?.returnId) return;
    if (!window.confirm(
      `Accept return ${row.returnId}?\n\nSame as eBay “Accept the return”. After this you can upload a return shipping label.`
    )) return;
    await runRowAction(row, async () => {
      const { data } = await api.post(`/ebay/returns/${row.returnId}/decide`, { decision: 'APPROVE' });
      const updated = data.return || { ...row, returnStatus: 'APPROVED' };
      mergeUpdatedRow(updated);
      setSnackbar({
        open: true,
        severity: 'success',
        message: data.message || `Accepted return ${row.returnId}. Next: upload a return label.`,
      });
      // Mirror eBay: after Accept, go to Provide / Upload return shipping label
      setLabelDialog({
        open: true,
        row: updated,
        trackingNumber: updated.trackingNumber || '',
        carrierEnum: updated.carrierUsed || 'USPS',
        comments: '',
        file: null,
        fileName: '',
      });
    });
  }

  function openDeclineDialog(row) {
    closeActionMenu();
    setDeclineComments('');
    setDeclineDialog({ open: true, row });
  }

  async function handleDecline() {
    const row = declineDialog.row;
    if (!row?.returnId) return;
    setActionBusyId(row.returnId);
    setError('');
    try {
      const body = { decision: 'DECLINE' };
      if (declineComments.trim()) body.comments = declineComments.trim();
      const { data } = await api.post(`/ebay/returns/${row.returnId}/decide`, body);
      mergeUpdatedRow(data.return);
      setDeclineDialog({ open: false, row: null });
      setDeclineComments('');
      setSnackbar({ open: true, severity: 'success', message: data.message || `Declined ${row.returnId}` });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  async function handleIssueRefund(row) {
    if (!row?.returnId) return;
    if (!window.confirm(`Issue refund for return ${row.returnId}?`)) return;
    await runRowAction(row, async () => {
      const { data } = await api.post(`/ebay/returns/${row.returnId}/issue-refund`);
      mergeUpdatedRow(data.return);
      setSnackbar({ open: true, severity: 'success', message: data.message || `Refunded ${row.returnId}` });
    });
  }

  async function handleMarkReceived(row) {
    if (!row?.returnId) return;
    if (!window.confirm(`Mark return ${row.returnId} as received?`)) return;
    await runRowAction(row, async () => {
      const { data } = await api.post(`/ebay/returns/${row.returnId}/mark-as-received`);
      mergeUpdatedRow(data.return);
      setSnackbar({ open: true, severity: 'success', message: data.message || `Marked received ${row.returnId}` });
    });
  }

  async function handleEscalateSubmit() {
    const row = escalateDialog.row;
    if (!row?.returnId) return;
    setActionBusyId(row.returnId);
    try {
      const { data } = await api.post(`/ebay/returns/${row.returnId}/escalate`, {
        comments: escalateDialog.comments || undefined,
        reason: escalateDialog.reason || undefined,
      });
      mergeUpdatedRow(data.return);
      setEscalateDialog({ open: false, row: null, comments: '', reason: '' });
      setSnackbar({ open: true, severity: 'success', message: data.message || `Escalated ${row.returnId}` });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  async function handleSendMessageSubmit() {
    const row = messageDialog.row;
    if (!row?.returnId || !messageDialog.text.trim()) return;
    setActionBusyId(row.returnId);
    try {
      const { data } = await api.post(`/ebay/returns/${row.returnId}/send-message`, {
        message: messageDialog.text.trim(),
      });
      setMessageDialog({ open: false, row: null, text: '' });
      setSnackbar({ open: true, severity: 'success', message: data.message || 'Message sent' });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  async function handleLabelSubmit() {
    const row = labelDialog.row;
    if (!row?.returnId) return;
    if (!labelDialog.trackingNumber.trim()) return;
    if (!labelDialog.carrierEnum.trim()) return;
    if (!labelDialog.file) {
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Choose a return label file (PDF or image), same as eBay Seller Hub.',
      });
      return;
    }
    setActionBusyId(row.returnId);
    try {
      const file = labelDialog.file;
      const dataB64 = await fileToBase64(file);
      const fileFormat = guessFileFormat(file);
      const { data } = await api.post(`/ebay/returns/${row.returnId}/upload-shipping-label`, {
        trackingNumber: labelDialog.trackingNumber.trim(),
        carrierEnum: labelDialog.carrierEnum.trim(),
        comments: labelDialog.comments.trim() || undefined,
        fileName: labelDialog.fileName || file.name || `return-label-${row.returnId}`,
        data: dataB64,
        ...(fileFormat ? { fileFormat } : {}),
      });
      mergeUpdatedRow(data.return);
      setLabelDialog({
        open: false, row: null, trackingNumber: '', carrierEnum: 'USPS', comments: '', file: null, fileName: '',
      });
      setSnackbar({ open: true, severity: 'success', message: data.message || 'Return label uploaded' });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  async function fileToBase64(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  }

  function guessFileFormat(file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPEG';
    if (mime.includes('png')) return 'PNG';
    if (mime.includes('gif')) return 'GIF';
    if (mime.includes('bmp')) return 'BMP';
    if (mime.includes('tif')) return 'TIFF';
    if (mime.includes('pdf')) return 'PDF';
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'JPEG';
    if (name.endsWith('.png')) return 'PNG';
    if (name.endsWith('.gif')) return 'GIF';
    if (name.endsWith('.bmp')) return 'BMP';
    if (name.endsWith('.tif') || name.endsWith('.tiff')) return 'TIFF';
    if (name.endsWith('.pdf')) return 'PDF';
    return '';
  }

  async function handleUploadSubmit() {
    const row = uploadDialog.row;
    if (!row?.returnId || !uploadDialog.file) return;
    setActionBusyId(row.returnId);
    try {
      const file = uploadDialog.file;
      const dataB64 = await fileToBase64(file);
      const fileFormat = guessFileFormat(file);
      const { data } = await api.post(`/ebay/returns/${row.returnId}/file-upload`, {
        filePurpose: uploadDialog.filePurpose || 'ITEM_RELATED',
        fileName: uploadDialog.fileName || file.name || `return-${row.returnId}`,
        data: dataB64,
        ...(fileFormat ? { fileFormat } : {}),
      });
      mergeUpdatedRow(data.return);
      setUploadDialog({ open: false, row: null, filePurpose: 'ITEM_RELATED', file: null, fileName: '' });
      setSnackbar({ open: true, severity: 'success', message: data.message || 'File uploaded' });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  async function handlePartialSubmit() {
    const row = partialDialog.row;
    if (!row?.returnId || !partialDialog.amount) return;
    setActionBusyId(row.returnId);
    try {
      const body = {
        decision: 'OFFER_PARTIAL_REFUND',
        partialRefundAmount: {
          value: String(partialDialog.amount),
          currency: partialDialog.currency || 'USD',
        },
      };
      if (partialDialog.comments.trim()) body.comments = partialDialog.comments.trim();
      const { data } = await api.post(`/ebay/returns/${row.returnId}/decide`, body);
      mergeUpdatedRow(data.return);
      setPartialDialog({ open: false, row: null, amount: '', currency: 'USD', comments: '' });
      setSnackbar({ open: true, severity: 'success', message: data.message || 'Partial refund offered' });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  const jsonBlock = (value, { maxHeight = 420 } = {}) => (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        bgcolor: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 1.5,
        fontSize: '0.72rem',
        lineHeight: 1.45,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        overflow: 'auto',
        maxHeight,
        border: '1px solid',
        borderColor: 'grey.800',
      }}
    >
      {JSON.stringify(value ?? {}, null, 2)}
    </Box>
  );

  const closeDetailDialog = () => {
    setDetailDialog({
      open: false, row: null, loading: false, detail: null, tracking: null, files: null, error: '',
    });
    setDetailTab(0);
  };

  const detailPayload = detailDialog.detail?.data || detailDialog.row?.rawDetail || null;
  const trackingPayload = detailDialog.tracking?.data || detailDialog.row?.rawTracking || null;
  const filesPayload = detailDialog.files?.files || detailDialog.row?.files || [];
  const detailSummary = detailPayload?.summary || {};
  const filesCount = Array.isArray(filesPayload) ? filesPayload.length : 0;
  const hasTrackingData = trackingPayload && Object.keys(trackingPayload).length > 0;
  const trackingMissing = String(detailDialog.error || '').toLowerCase().includes('tracking requires');

  const copyJson = (value, label) => {
    const text = JSON.stringify(value ?? {}, null, 2);
    navigator?.clipboard?.writeText?.(text);
    setSnackbar({ open: true, severity: 'success', message: `Copied ${label}` });
  };

  return (
    <Box>
      {!embedded && (
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <AssignmentReturnIcon color="primary" />
          <Typography variant="h5" fontWeight="bold">
            Return API
          </Typography>
        </Stack>
      )}

      <Alert severity="info" sx={{ mb: 1.5 }}>
        Full Return Call Index: search, get, files, tracking, decide, issue_refund, mark_as_received,
        escalate, send_message, add_shipping_label, and file/upload.
      </Alert>

      <Stack
        direction="row"
        spacing={1}
        mb={1.5}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Tooltip title="GET /post-order/v2/return/search, then fill missing detail / files / tracking">
            <span>
              <Button
                size="small"
                variant="contained"
                sx={yellowFilledButtonSx}
                startIcon={fetching ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={fetchFromEbayAndEnrich}
                disabled={fetching}
              >
                {fetchPhase === 'details'
                  ? 'Loading details...'
                  : fetching
                    ? 'Fetching search...'
                    : 'Fetch from eBay'}
              </Button>
            </span>
          </Tooltip>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={sellerFilter}
              label="Seller"
              onChange={(e) => setSellerFilter(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.user?.username || s._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="RETURN_REQUESTED">RETURN_REQUESTED</MenuItem>
              <MenuItem value="ITEM_READY_TO_SHIP">ITEM_READY_TO_SHIP</MenuItem>
              <MenuItem value="RETURN_LABEL_PENDING">RETURN_LABEL_PENDING</MenuItem>
              <MenuItem value="CLOSED">CLOSED</MenuItem>
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="outlined"
            sx={yellowOutlinedButtonSx}
            startIcon={<RefreshIcon />}
            onClick={loadStored}
            disabled={loading}
          >
            Refresh
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="outlined"
            sx={yellowOutlinedButtonSx}
            startIcon={<DownloadIcon />}
            disabled={rows.length === 0}
            onClick={() => {
              const csvData = prepareCSVData(rows, {
                returnId: 'returnId',
                orderId: 'orderId',
                Seller: (r) => r.seller?.user?.username || '',
                buyerLoginName: 'buyerUsername',
                itemId: 'itemId',
                status: 'returnStatus',
                state: 'returnState',
                reason: 'returnReason',
                reasonType: 'reasonType',
                returnCloseReason: 'returnCloseReason',
                notes: (r) => r.notes || r.buyerComments || '',
                trackingNumber: 'trackingNumber',
                carrierUsed: 'carrierUsed',
                trackingStatus: 'trackingStatus',
                files: 'filesCount',
                marketplaceId: 'marketplaceId',
                transactionDate: (r) => formatDate(r.transactionDate || r.dateSold),
                creationDate: (r) => formatDate(r.creationDate),
              });
              downloadCSV(csvData, 'Return_PostOrder_API');
            }}
          >
            CSV ({rows.length})
          </Button>
          <ColumnSelector
            allColumns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(ALL_COLUMNS.map((c) => c.id))}
            page="return-post-order-api-v4"
          />
        </Stack>
      </Stack>

      {!hideDateFilter && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Uses the shared Issues & Resolutions date filter when embedded.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: '70vh', overflowX: 'auto' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                {visibleColumns.includes('returnId') && <TableCell sx={headerSx}>returnId</TableCell>}
                {visibleColumns.includes('orderId') && <TableCell sx={headerSx}>orderId</TableCell>}
                {visibleColumns.includes('seller') && <TableCell sx={headerSx}>Seller</TableCell>}
                {visibleColumns.includes('buyerLoginName') && <TableCell sx={headerSx}>buyerLoginName</TableCell>}
                {visibleColumns.includes('itemId') && <TableCell sx={headerSx}>itemId</TableCell>}
                {visibleColumns.includes('status') && <TableCell sx={headerSx}>status</TableCell>}
                {visibleColumns.includes('state') && <TableCell sx={headerSx}>state</TableCell>}
                {visibleColumns.includes('reason') && <TableCell sx={headerSx}>reason</TableCell>}
                {visibleColumns.includes('reasonType') && <TableCell sx={headerSx}>reasonType</TableCell>}
                {visibleColumns.includes('returnCloseReason') && <TableCell sx={headerSx}>returnCloseReason</TableCell>}
                {visibleColumns.includes('notes') && <TableCell sx={headerSx}>notes</TableCell>}
                {visibleColumns.includes('refund') && <TableCell sx={headerSx}>refund</TableCell>}
                {visibleColumns.includes('trackingNumber') && <TableCell sx={headerSx}>trackingNumber</TableCell>}
                {visibleColumns.includes('carrierUsed') && <TableCell sx={headerSx}>carrierUsed</TableCell>}
                {visibleColumns.includes('trackingStatus') && <TableCell sx={headerSx}>trackingStatus</TableCell>}
                {visibleColumns.includes('filesCount') && <TableCell sx={headerSx}>files</TableCell>}
                {visibleColumns.includes('marketplaceId') && <TableCell sx={headerSx}>marketplaceId</TableCell>}
                {visibleColumns.includes('transactionDate') && <TableCell sx={headerSx}>transactionDate</TableCell>}
                {visibleColumns.includes('created') && <TableCell sx={headerSx}>creationDate</TableCell>}
                {visibleColumns.includes('responseDue') && <TableCell sx={headerSx}>Response Due (PST)</TableCell>}
                {visibleColumns.includes('worksheetStatus') && <TableCell sx={headerSx}>Worksheet Status</TableCell>}
                {visibleColumns.includes('action') && <TableCell sx={headerSx} align="center">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length || 1} align="center">
                    <Typography variant="body2" color="text.secondary" py={2}>
                      No returns yet. Click &quot;Fetch return/search&quot;, then &quot;Load detail / tracking / files&quot;.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row._id || row.returnId} hover>
                    {visibleColumns.includes('returnId') && (
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {row.returnId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(row.returnId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    )}
                    {visibleColumns.includes('orderId') && (
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {row.orderId || row.legacyOrderId || '-'}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('seller') && (
                      <TableCell>{row.seller?.user?.username || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('buyerLoginName') && (
                      <TableCell>{row.buyerUsername || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('itemId') && (
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                          {row.itemId || '-'}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('status') && (
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.returnStatus || '-'}
                          color={getStatusColor(row.returnStatus)}
                          sx={{ fontSize: '0.65rem' }}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.includes('state') && (
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={row.returnState || '-'}
                          sx={{ fontSize: '0.65rem' }}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.includes('reason') && (
                      <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {(row.returnReason || '-').toString().replace(/_/g, ' ')}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('reasonType') && (
                      <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {row.reasonType || '-'}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('returnCloseReason') && (
                      <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {(row.returnCloseReason || '-').toString().replace(/_/g, ' ')}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('notes') && (
                      <TableCell sx={{ maxWidth: 280, whiteSpace: 'normal' }}>
                        <Typography
                          variant="body2"
                          fontSize="0.75rem"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={row.notes || row.buyerComments || ''}
                        >
                          {row.notes || row.buyerComments || '-'}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('refund') && (
                      <TableCell>
                        {row.refundAmount?.value
                          ? `${row.refundAmount.currency || 'USD'} ${row.refundAmount.value}`
                          : '-'}
                      </TableCell>
                    )}
                    {visibleColumns.includes('trackingNumber') && (
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                          {row.trackingNumber || '-'}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('carrierUsed') && (
                      <TableCell>{row.carrierUsed || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('trackingStatus') && (
                      <TableCell>
                        {row.trackingStatus ? (
                          <Chip size="small" label={row.trackingStatus} sx={{ fontSize: '0.65rem' }} />
                        ) : '-'}
                      </TableCell>
                    )}
                    {visibleColumns.includes('filesCount') && (
                      <TableCell>{row.filesCount ?? row.files?.length ?? 0}</TableCell>
                    )}
                    {visibleColumns.includes('marketplaceId') && (
                      <TableCell>{row.marketplaceId || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('transactionDate') && (
                      <TableCell>{formatDate(row.transactionDate || row.dateSold)}</TableCell>
                    )}
                    {visibleColumns.includes('created') && (
                      <TableCell>{formatDate(row.creationDate)}</TableCell>
                    )}
                    {visibleColumns.includes('responseDue') && (
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography
                            variant="body2"
                            fontSize="0.75rem"
                            color={row.returnStatus !== 'CLOSED' && isResponseOverdue(row.responseDate) ? 'error' : 'inherit'}
                            fontWeight={row.returnStatus !== 'CLOSED' && (isResponseOverdue(row.responseDate) || isResponseUrgent(row.responseDate)) ? 'bold' : 'normal'}
                          >
                            {formatDate(row.responseDate)}
                          </Typography>
                          {row.returnStatus !== 'CLOSED' && isResponseOverdue(row.responseDate) && (
                            <Chip
                              label="OVERDUE"
                              size="small"
                              color="error"
                              sx={{ fontSize: '0.6rem', height: 16 }}
                            />
                          )}
                          {row.returnStatus !== 'CLOSED' && !isResponseOverdue(row.responseDate) && isResponseUrgent(row.responseDate) && (
                            <Chip
                              label="URGENT"
                              size="small"
                              color="warning"
                              sx={{ fontSize: '0.6rem', height: 16 }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                    )}
                    {visibleColumns.includes('worksheetStatus') && (
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={row.worksheetStatus || 'open'}
                            onChange={(e) => handleWorksheetStatusChange(row.returnId, e.target.value)}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            <MenuItem value="open">Open</MenuItem>
                            <MenuItem value="attended">Attended</MenuItem>
                            <MenuItem value="resolved">Resolved</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                    )}
                    {visibleColumns.includes('action') && (
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                          {canApprove(row) && (
                            <Button
                              size="small"
                              color="success"
                              variant="contained"
                              disabled={actionBusyId === row.returnId}
                              onClick={() => handleApprove(row)}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.25, minWidth: 0 }}
                            >
                              Accept return
                            </Button>
                          )}
                          {canIssueRefund(row) && (
                            <Button
                              size="small"
                              color="warning"
                              variant="outlined"
                              disabled={actionBusyId === row.returnId}
                              onClick={() => handleIssueRefund(row)}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.25, minWidth: 0 }}
                            >
                              Refund
                            </Button>
                          )}
                          <Tooltip title="All Return Post-Order APIs">
                            <span>
                              <IconButton
                                size="small"
                                disabled={actionBusyId === row.returnId}
                                onClick={(e) => setActionMenu({ anchorEl: e.currentTarget, row })}
                              >
                                {actionBusyId === row.returnId
                                  ? <CircularProgress size={16} />
                                  : <MoreVertIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && totalCount > 0 && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1.5}>
          <Typography variant="body2" color="text.secondary">
            Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, totalCount)} of {totalCount}
          </Typography>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_e, value) => setPage(value)}
            color="primary"
            size="small"
          />
        </Stack>
      )}

      <Menu
        anchorEl={actionMenu.anchorEl}
        open={Boolean(actionMenu.anchorEl)}
        onClose={closeActionMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {(() => {
          const row = actionMenu.row;
          if (!row) return null;
          return (
            <>
              <MenuItem dense onClick={() => { closeActionMenu(); openApiDetails(row); }}>
                <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Get Return / Files / Tracking" />
              </MenuItem>
              <Divider />
              <MenuItem dense disabled={!canApprove(row)} onClick={() => handleApprove(row)}>
                <ListItemIcon><CheckCircleOutlineIcon fontSize="small" color="success" /></ListItemIcon>
                <ListItemText primary="Accept the return" />
              </MenuItem>
              <MenuItem dense disabled={!canDecline(row)} onClick={() => openDeclineDialog(row)}>
                <ListItemIcon><HighlightOffIcon fontSize="small" color="error" /></ListItemIcon>
                <ListItemText primary="Process — Decline" />
              </MenuItem>
              <MenuItem
                dense
                disabled={!canOfferPartial(row)}
                onClick={() => {
                  closeActionMenu();
                  setPartialDialog({
                    open: true,
                    row,
                    amount: row.refundAmount?.value || '',
                    currency: row.refundAmount?.currency || 'USD',
                    comments: '',
                  });
                }}
              >
                <ListItemIcon><LocalAtmIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Process — Offer partial refund" />
              </MenuItem>
              <MenuItem dense disabled={!canIssueRefund(row)} onClick={() => handleIssueRefund(row)}>
                <ListItemIcon><LocalAtmIcon fontSize="small" color="warning" /></ListItemIcon>
                <ListItemText primary="Issue Return Refund" />
              </MenuItem>
              <MenuItem dense disabled={!canMarkReceived(row)} onClick={() => handleMarkReceived(row)}>
                <ListItemIcon><InventoryIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Mark Return Received" />
              </MenuItem>
              <Divider />
              <MenuItem
                dense
                disabled={!canEscalate(row)}
                onClick={() => {
                  closeActionMenu();
                  setEscalateDialog({ open: true, row, comments: '', reason: '' });
                }}
              >
                <ListItemIcon><EscalatorWarningIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Escalate Return" />
              </MenuItem>
              <MenuItem
                dense
                disabled={!canSendMessage(row)}
                onClick={() => {
                  closeActionMenu();
                  setMessageDialog({ open: true, row, text: '' });
                }}
              >
                <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Send Return Message" />
              </MenuItem>
              <MenuItem
                dense
                disabled={!canAddLabel(row) && getSellerActionTypes(row).size > 0}
                onClick={() => {
                  closeActionMenu();
                  setLabelDialog({
                    open: true,
                    row,
                    trackingNumber: row.trackingNumber || '',
                    carrierEnum: row.carrierUsed || 'USPS',
                    comments: '',
                    file: null,
                    fileName: '',
                  });
                }}
              >
                <ListItemIcon><LocalShippingIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Upload Return Label" />
              </MenuItem>
              <MenuItem
                dense
                disabled={!canUploadFile(row)}
                onClick={() => {
                  closeActionMenu();
                  setUploadDialog({
                    open: true, row, filePurpose: 'ITEM_RELATED', file: null, fileName: '',
                  });
                }}
              >
                <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Upload Return File" />
              </MenuItem>
            </>
          );
        })()}
      </Menu>

      <Dialog
        open={detailDialog.open}
        onClose={closeDetailDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: '70vh' } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack spacing={0.75}>
            <Typography variant="h6" fontWeight={700}>
              Return {detailDialog.row?.returnId || ''}
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {(detailSummary.status || detailDialog.row?.returnStatus) && (
                <Chip
                  size="small"
                  color={getStatusColor(detailSummary.status || detailDialog.row?.returnStatus)}
                  label={detailSummary.status || detailDialog.row?.returnStatus}
                />
              )}
              {(detailSummary.state || detailDialog.row?.returnState) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={detailSummary.state || detailDialog.row?.returnState}
                />
              )}
              {(detailSummary.buyerLoginName || detailDialog.row?.buyerUsername) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Buyer: ${detailSummary.buyerLoginName || detailDialog.row?.buyerUsername}`}
                />
              )}
              {(detailSummary.orderId || detailDialog.row?.orderId) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Order: ${detailSummary.orderId || detailDialog.row?.orderId}`}
                />
              )}
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {detailDialog.loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={8}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {detailDialog.error ? (
                <Alert
                  severity={trackingMissing && !detailDialog.error.includes('|') ? 'info' : 'warning'}
                  sx={{ m: 1.5, mb: 0 }}
                >
                  {detailDialog.error}
                </Alert>
              ) : null}

              <Tabs
                value={detailTab}
                onChange={(_e, v) => setDetailTab(v)}
                sx={{
                  px: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  minHeight: 42,
                  '& .MuiTab-root': { minHeight: 42, textTransform: 'none', fontWeight: 600 },
                }}
              >
                <Tab label="Detail" />
                <Tab label={`Tracking${hasTrackingData ? '' : ' (empty)'}`} />
                <Tab label={`Files (${filesCount})`} />
              </Tabs>

              <Box sx={{ p: 1.5, flex: 1, minHeight: 0 }}>
                {detailTab === 0 && (
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        GET /post-order/v2/return/{'{returnId}'}
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                        onClick={() => copyJson(detailPayload, 'detail JSON')}
                        sx={{ textTransform: 'none' }}
                      >
                        Copy
                      </Button>
                    </Stack>
                    {detailPayload
                      ? jsonBlock(detailPayload)
                      : (
                        <Alert severity="info">No detail payload available for this return.</Alert>
                      )}
                  </Stack>
                )}

                {detailTab === 1 && (
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        GET /post-order/v2/return/{'{returnId}'}/tracking
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                        disabled={!hasTrackingData}
                        onClick={() => copyJson(trackingPayload, 'tracking JSON')}
                        sx={{ textTransform: 'none' }}
                      >
                        Copy
                      </Button>
                    </Stack>
                    {hasTrackingData ? (
                      jsonBlock(trackingPayload)
                    ) : (
                      <Alert severity="info">
                        No tracking data yet. eBay needs <code>carrier_used</code> and <code>tracking_number</code> on the return.
                      </Alert>
                    )}
                  </Stack>
                )}

                {detailTab === 2 && (
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        GET /post-order/v2/return/{'{returnId}'}/files
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                        disabled={filesCount === 0}
                        onClick={() => copyJson(filesPayload, 'files JSON')}
                        sx={{ textTransform: 'none' }}
                      >
                        Copy
                      </Button>
                    </Stack>
                    {filesCount > 0 ? (
                      jsonBlock(filesPayload)
                    ) : (
                      <Alert severity="info">No files uploaded for this return.</Alert>
                    )}
                  </Stack>
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDetailDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={declineDialog.open}
        onClose={() => {
          if (actionBusyId) return;
          setDeclineDialog({ open: false, row: null });
          setDeclineComments('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Decline return</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={1.5}>
            Decline return ID <strong>{declineDialog.row?.returnId}</strong> via
            {' '}<code>POST /post-order/v2/return/{'{returnId}'}/decide</code> with
            {' '}<code>DECLINE</code>?
          </Typography>
          <TextField
            label="Comments (optional)"
            fullWidth
            multiline
            minRows={2}
            value={declineComments}
            onChange={(e) => setDeclineComments(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeclineDialog({ open: false, row: null });
              setDeclineComments('');
            }}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDecline}
            disabled={Boolean(actionBusyId)}
            startIcon={
              actionBusyId
                ? <CircularProgress size={14} color="inherit" />
                : <HighlightOffIcon />
            }
          >
            Decline
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={messageDialog.open}
        onClose={() => !actionBusyId && setMessageDialog({ open: false, row: null, text: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Send Return Message</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={1.5}>
            <code>POST /post-order/v2/return/{messageDialog.row?.returnId || '{returnId}'}/send_message</code>
          </Typography>
          <TextField
            label="Message"
            fullWidth
            multiline
            minRows={3}
            value={messageDialog.text}
            onChange={(e) => setMessageDialog((d) => ({ ...d, text: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageDialog({ open: false, row: null, text: '' })} disabled={Boolean(actionBusyId)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSendMessageSubmit}
            disabled={Boolean(actionBusyId) || !messageDialog.text.trim()}
            startIcon={<SendIcon />}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={escalateDialog.open}
        onClose={() => !actionBusyId && setEscalateDialog({ open: false, row: null, comments: '', reason: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Escalate Return</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={1.5}>
            <code>POST /post-order/v2/return/{escalateDialog.row?.returnId || '{returnId}'}/escalate</code>
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              label="Reason (optional)"
              fullWidth
              value={escalateDialog.reason}
              onChange={(e) => setEscalateDialog((d) => ({ ...d, reason: e.target.value }))}
            />
            <TextField
              label="Comments (optional)"
              fullWidth
              multiline
              minRows={2}
              value={escalateDialog.comments}
              onChange={(e) => setEscalateDialog((d) => ({ ...d, comments: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEscalateDialog({ open: false, row: null, comments: '', reason: '' })} disabled={Boolean(actionBusyId)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={handleEscalateSubmit} disabled={Boolean(actionBusyId)}>
            Escalate
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={labelDialog.open}
        onClose={() => !actionBusyId && setLabelDialog({
          open: false, row: null, trackingNumber: '', carrierEnum: 'USPS', comments: '', file: null, fileName: '',
        })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Upload Return Label</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            Same as eBay Seller Hub: upload a label PDF/image, then share carrier + tracking with the buyer.
          </Typography>
          <Stack spacing={1.5}>
            <Button variant="outlined" component="label">
              Choose label file
              <input
                hidden
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.bmp,.tif,.tiff,.pdf,image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setLabelDialog((d) => ({
                    ...d,
                    file,
                    fileName: file?.name || '',
                  }));
                }}
              />
            </Button>
            <Typography variant="caption" color="text.secondary">
              {labelDialog.fileName || 'No file selected'} · PDF or image
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Carrier</InputLabel>
              <Select
                label="Carrier"
                value={labelDialog.carrierEnum}
                onChange={(e) => setLabelDialog((d) => ({ ...d, carrierEnum: e.target.value }))}
              >
                {['USPS', 'UPS', 'FEDEX', 'DHL', 'OTHER'].map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Tracking number"
              fullWidth
              value={labelDialog.trackingNumber}
              onChange={(e) => setLabelDialog((d) => ({ ...d, trackingNumber: e.target.value }))}
            />
            <TextField
              label="Comments (optional)"
              fullWidth
              multiline
              minRows={2}
              value={labelDialog.comments}
              onChange={(e) => setLabelDialog((d) => ({ ...d, comments: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setLabelDialog({
              open: false, row: null, trackingNumber: '', carrierEnum: 'USPS', comments: '', file: null, fileName: '',
            })}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleLabelSubmit}
            disabled={
              Boolean(actionBusyId)
              || !labelDialog.trackingNumber.trim()
              || !labelDialog.carrierEnum.trim()
              || !labelDialog.file
            }
            startIcon={actionBusyId ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
          >
            Upload label
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={uploadDialog.open}
        onClose={() => !actionBusyId && setUploadDialog({
          open: false, row: null, filePurpose: 'ITEM_RELATED', file: null, fileName: '',
        })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Upload Return File</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={1.5}>
            <code>POST /post-order/v2/return/{uploadDialog.row?.returnId || '{returnId}'}/file/upload</code>
          </Typography>
          <Stack spacing={1.5}>
            <FormControl fullWidth size="small">
              <InputLabel>filePurpose</InputLabel>
              <Select
                label="filePurpose"
                value={uploadDialog.filePurpose}
                onChange={(e) => setUploadDialog((d) => ({ ...d, filePurpose: e.target.value }))}
              >
                <MenuItem value="ITEM_RELATED">ITEM_RELATED</MenuItem>
                <MenuItem value="LABEL_RELATED">LABEL_RELATED</MenuItem>
                <MenuItem value="RETURN_RELATED">RETURN_RELATED</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" component="label">
              Choose file
              <input
                hidden
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.bmp,.tif,.tiff,.pdf,image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setUploadDialog((d) => ({
                    ...d,
                    file,
                    fileName: file?.name || '',
                  }));
                }}
              />
            </Button>
            <Typography variant="caption" color="text.secondary">
              {uploadDialog.fileName || 'No file selected'} · JPEG/PNG/GIF/BMP/TIFF/PDF
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setUploadDialog({
              open: false, row: null, filePurpose: 'ITEM_RELATED', file: null, fileName: '',
            })}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUploadSubmit}
            disabled={Boolean(actionBusyId) || !uploadDialog.file}
            startIcon={<UploadFileIcon />}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={partialDialog.open}
        onClose={() => !actionBusyId && setPartialDialog({
          open: false, row: null, amount: '', currency: 'USD', comments: '',
        })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Offer Partial Refund</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} mt={0.5}>
            <TextField
              label="Amount"
              fullWidth
              value={partialDialog.amount}
              onChange={(e) => setPartialDialog((d) => ({ ...d, amount: e.target.value }))}
            />
            <TextField
              label="Currency"
              fullWidth
              value={partialDialog.currency}
              onChange={(e) => setPartialDialog((d) => ({ ...d, currency: e.target.value }))}
            />
            <TextField
              label="Comments (optional)"
              fullWidth
              multiline
              minRows={2}
              value={partialDialog.comments}
              onChange={(e) => setPartialDialog((d) => ({ ...d, comments: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPartialDialog({
              open: false, row: null, amount: '', currency: 'USD', comments: '',
            })}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handlePartialSubmit}
            disabled={Boolean(actionBusyId) || !partialDialog.amount}
          >
            Offer partial
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        message={snackbar.message}
      />
    </Box>
  );
}
