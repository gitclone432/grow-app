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
  TableSortLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CancelIcon from '@mui/icons-material/Cancel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChatIcon from '@mui/icons-material/Chat';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import api from '../../lib/api';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import ChatModal from '../../components/ChatModal';
import ColumnSelector from '../../components/ColumnSelector';
import { yellowFilledButtonSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';

const headerSx = {
  backgroundColor: 'error.dark',
  color: 'white',
  fontWeight: 'bold',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  '& .MuiTableSortLabel-root': { color: 'inherit' },
  '& .MuiTableSortLabel-root:hover': { color: 'rgba(255,255,255,0.85)' },
  '& .MuiTableSortLabel-root.Mui-active': { color: 'inherit' },
  '& .MuiTableSortLabel-icon': { color: 'rgba(255,255,255,0.7) !important' },
};

export default function CancellationSearchPage({
  dateFilter: dateFilterProp,
  hideDateFilter = false,
  embedded = false,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('cancelRequestDate');
  const [sortDir, setSortDir] = useState('desc');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [actionBusyId, setActionBusyId] = useState('');
  const [approveDialog, setApproveDialog] = useState({ open: false, row: null });
  const [rejectDialog, setRejectDialog] = useState({ open: false, row: null });
  const limit = 25;

  const ALL_COLUMNS = [
    { id: 'cancelId', label: 'Cancel ID' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'seller', label: 'Seller' },
    { id: 'buyerLoginName', label: 'buyerLoginName' },
    { id: 'itemId', label: 'itemId' },
    { id: 'respondType', label: 'respondType' },
    { id: 'status', label: 'Status' },
    { id: 'state', label: 'State' },
    { id: 'reason', label: 'Reason' },
    { id: 'requestor', label: 'Requestor' },
    { id: 'amount', label: 'Amount' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'requestDate', label: 'Request Date' },
    { id: 'sellerDue', label: 'Seller Response Due' },
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
      .then((res) => setSellers(res.data || []))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    loadStored();
  }, [dateFilter, sellerFilter, statusFilter, stateFilter, page, sortBy, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [dateFilter, sellerFilter, statusFilter, stateFilter, sortBy, sortDir]);

  async function loadStored() {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit,
        sortBy,
        sortDir,
      };
      if (sellerFilter) params.sellerId = sellerFilter;
      if (statusFilter) params.status = statusFilter;
      if (stateFilter) params.state = stateFilter;

      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      const res = await api.get('/ebay/stored-cancellations', { params });
      setRows(res.data.cancellations || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      setTotalCount(res.data.pagination?.totalOrders || res.data.totalCancellations || 0);
    } catch (e) {
      console.error('Failed to load cancellations:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function enrichDetails() {
    setEnriching(true);
    setError('');
    try {
      const res = await api.post('/ebay/enrich-cancellation-details', {
        sellerId: sellerFilter || undefined,
        limit: 500,
      });
      const updated = res.data.updated || 0;
      const failed = res.data.failed || 0;
      const checked = res.data.checked || 0;
      setSnackbar({
        open: true,
        severity: failed && !updated ? 'error' : failed ? 'warning' : 'success',
        message: `Loaded buyerLoginName/respondType — checked ${checked}, updated ${updated}${failed ? `, failed ${failed}` : ''}`,
      });
      await loadStored();
    } catch (e) {
      console.error('Failed to enrich cancellation details:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setEnriching(false);
    }
  }

  async function fetchFromEbay() {
    setFetching(true);
    setError('');
    try {
      const res = await api.post('/ebay/fetch-cancellations');
      const newCount = res.data.totalNewCancellations || 0;
      const updatedCount = res.data.totalUpdatedCancellations || 0;
      const errCount = res.data.errors?.length || 0;
      const errPreview = errCount
        ? ` — ${res.data.errors.slice(0, 2).join('; ')}${errCount > 2 ? ` (+${errCount - 2} more)` : ''}`
        : '';
      setSnackbar({
        open: true,
        severity: errCount && newCount + updatedCount === 0 ? 'error' : errCount ? 'warning' : 'success',
        message: `Cancellations synced — ${newCount} new, ${updatedCount} updated${errPreview}`,
      });
      // Clear seller filter so newly synced rows are visible across all sellers
      setSellerFilter('');
      setPage(1);
      // Explicit reload without seller filter (state update is async)
      setLoading(true);
      try {
        const listRes = await api.get('/ebay/stored-cancellations', {
          params: { page: 1, limit, sortBy, sortDir, ...(statusFilter ? { status: statusFilter } : {}), ...(stateFilter ? { state: stateFilter } : {}) },
        });
        setRows(listRes.data.cancellations || []);
        setTotalPages(listRes.data.pagination?.totalPages || 1);
        setTotalCount(listRes.data.pagination?.totalOrders || listRes.data.totalCancellations || 0);
      } finally {
        setLoading(false);
      }
    } catch (e) {
      console.error('Failed to fetch cancellations:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setFetching(false);
    }
  }

  const handleCopy = (text) => {
    const val = text || '';
    if (!val || val === '-') return;
    navigator?.clipboard?.writeText?.(val);
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
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
    if (s.includes('CLOSED') || s.includes('COMPLETE') || s === 'CANCEL_CLOSED') return 'default';
    if (s.includes('REJECT') || s.includes('DENIED')) return 'error';
    if (s.includes('APPROV') || s.includes('CONFIRM')) return 'success';
    if (s.includes('PENDING') || s.includes('WAIT') || s.includes('OPEN') || s.includes('REQUESTED')) return 'warning';
    return 'primary';
  };

  const canSellerRespond = (row) => {
    const state = String(row?.cancelState || '').toUpperCase();
    const status = String(row?.cancelStatus || '').toUpperCase();
    const respondType = String(row?.respondType || '').toUpperCase();
    if (respondType && respondType !== 'SELLER') return false;
    if (state === 'CLOSED' || status.includes('CLOSED') || status.includes('REJECT')) return false;
    return (
      state === 'APPROVAL_PENDING'
      || status === 'CANCEL_REQUESTED'
      || status === 'CANCEL_PENDING'
      || status.includes('REQUESTED')
      || status.includes('PENDING')
    );
  };

  const mergeUpdatedRow = (updated) => {
    if (!updated?.cancelId) return;
    setRows((prev) => prev.map((r) => (r.cancelId === updated.cancelId ? { ...r, ...updated } : r)));
  };

  function openApproveDialog(row) {
    setApproveDialog({ open: true, row });
  }

  async function confirmApprove() {
    const row = approveDialog.row;
    if (!row?.cancelId) return;
    setActionBusyId(row.cancelId);
    setError('');
    try {
      const { data } = await api.post(`/ebay/cancellations/${row.cancelId}/approve`);
      mergeUpdatedRow(data.cancellation);
      setApproveDialog({ open: false, row: null });
      setSnackbar({
        open: true,
        severity: 'success',
        message: data.message || `Approved ${row.cancelId}`,
      });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  function openRejectDialog(row) {
    setRejectDialog({ open: true, row });
  }

  async function confirmReject() {
    const row = rejectDialog.row;
    if (!row?.cancelId) return;
    setActionBusyId(row.cancelId);
    setError('');
    try {
      const { data } = await api.post(`/ebay/cancellations/${row.cancelId}/reject`, {});
      mergeUpdatedRow(data.cancellation);
      setRejectDialog({ open: false, row: null });
      setSnackbar({
        open: true,
        severity: 'success',
        message: data.message || `Rejected ${row.cancelId}`,
      });
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      setSnackbar({ open: true, severity: 'error', message: msg });
    } finally {
      setActionBusyId('');
    }
  }

  return (
    <Box>
      {!embedded && (
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <CancelIcon color="error" />
          <Typography variant="h5" fontWeight="bold">
            Cancellation Search
          </Typography>
        </Stack>
      )}

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
          <Tooltip title="Search last 30 days, then enrich each row via GET /post-order/v2/cancellation/{cancelId} (buyerLoginName, itemId, respondType)">
            <span>
              <Button
                size="small"
                variant="contained"
                sx={yellowFilledButtonSx}
                startIcon={fetching ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={fetchFromEbay}
                disabled={fetching || enriching}
              >
                {fetching ? 'Fetching...' : 'Fetch from eBay'}
              </Button>
            </span>
          </Tooltip>

          <Tooltip title="GET /post-order/v2/cancellation/{cancelId} for buyerLoginName + respondType on stored rows">
            <span>
              <Button
                size="small"
                variant="outlined"
                sx={yellowOutlinedButtonSx}
                startIcon={enriching ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={enrichDetails}
                disabled={fetching || enriching}
              >
                {enriching ? 'Loading details...' : 'Load buyerLoginName / respondType'}
              </Button>
            </span>
          </Tooltip>

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              label="Seller"
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

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              label="Status"
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="CANCEL_REQUESTED">CANCEL_REQUESTED</MenuItem>
              <MenuItem value="CANCEL_PENDING">CANCEL_PENDING</MenuItem>
              <MenuItem value="CANCEL_REJECTED">CANCEL_REJECTED</MenuItem>
              <MenuItem value="CANCEL_CLOSED">CANCEL_CLOSED</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>State</InputLabel>
            <Select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              label="State"
            >
              <MenuItem value="">All States</MenuItem>
              <MenuItem value="INITIAL">INITIAL</MenuItem>
              <MenuItem value="CLOSED">CLOSED</MenuItem>
              <MenuItem value="APPROVAL_PENDING">APPROVAL_PENDING</MenuItem>
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
                'Cancel ID': 'cancelId',
                'Order ID': (r) => r.orderId || r.legacyOrderId || '',
                Seller: (r) => r.seller?.user?.username || '',
                buyerLoginName: (r) => r.buyerLoginName || r.buyerUsername || '',
                itemId: 'itemId',
                respondType: 'respondType',
                Status: 'cancelStatus',
                State: 'cancelState',
                Reason: 'cancelReason',
                Requestor: 'requestorType',
                Amount: (r) => (r.requestRefundAmount?.value
                  ? `${r.requestRefundAmount.currency || 'USD'} ${r.requestRefundAmount.value}`
                  : ''),
                Marketplace: 'marketplaceId',
                'Request Date': (r) => formatDate(r.cancelRequestDate),
                'Seller Response Due': (r) => formatDate(r.sellerResponseDueDate),
              });
              downloadCSV(csvData, 'Cancellation_Search');
            }}
          >
            CSV ({rows.length})
          </Button>
          <ColumnSelector
            allColumns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(ALL_COLUMNS.map((c) => c.id))}
            page="cancellation-search-v2"
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
        <TableContainer
          component={Paper}
          sx={{
            maxHeight: '70vh',
            overflowX: 'auto',
          }}
        >
          <Table size="small" stickyHeader sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                {visibleColumns.includes('cancelId') && <TableCell sx={headerSx}>Cancel ID</TableCell>}
                {visibleColumns.includes('orderId') && <TableCell sx={headerSx}>Order ID</TableCell>}
                {visibleColumns.includes('seller') && <TableCell sx={headerSx}>Seller</TableCell>}
                {visibleColumns.includes('buyerLoginName') && <TableCell sx={headerSx}>buyerLoginName</TableCell>}
                {visibleColumns.includes('itemId') && <TableCell sx={headerSx}>itemId</TableCell>}
                {visibleColumns.includes('respondType') && <TableCell sx={headerSx}>respondType</TableCell>}
                {visibleColumns.includes('status') && (
                  <TableCell sx={headerSx} sortDirection={sortBy === 'cancelStatus' ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === 'cancelStatus'}
                      direction={sortBy === 'cancelStatus' ? sortDir : 'asc'}
                      onClick={() => handleSort('cancelStatus')}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                )}
                {visibleColumns.includes('state') && (
                  <TableCell sx={headerSx} sortDirection={sortBy === 'cancelState' ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === 'cancelState'}
                      direction={sortBy === 'cancelState' ? sortDir : 'asc'}
                      onClick={() => handleSort('cancelState')}
                    >
                      State
                    </TableSortLabel>
                  </TableCell>
                )}
                {visibleColumns.includes('reason') && <TableCell sx={headerSx}>Reason</TableCell>}
                {visibleColumns.includes('requestor') && <TableCell sx={headerSx}>Requestor</TableCell>}
                {visibleColumns.includes('amount') && <TableCell sx={headerSx}>Amount</TableCell>}
                {visibleColumns.includes('marketplace') && <TableCell sx={headerSx}>Marketplace</TableCell>}
                {visibleColumns.includes('requestDate') && (
                  <TableCell sx={headerSx} sortDirection={sortBy === 'cancelRequestDate' ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === 'cancelRequestDate'}
                      direction={sortBy === 'cancelRequestDate' ? sortDir : 'asc'}
                      onClick={() => handleSort('cancelRequestDate')}
                    >
                      Request Date
                    </TableSortLabel>
                  </TableCell>
                )}
                {visibleColumns.includes('sellerDue') && <TableCell sx={headerSx}>Seller Response Due</TableCell>}
                {visibleColumns.includes('action') && <TableCell sx={headerSx} align="center">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length || 1} align="center">
                    <Typography variant="body2" color="text.secondary" py={2}>
                      No cancellations stored yet. Click &quot;Fetch from eBay&quot; to load from Post-Order cancellation/search.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row._id || row.cancelId} hover>
                    {visibleColumns.includes('cancelId') && (
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {row.cancelId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(row.cancelId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    )}
                    {visibleColumns.includes('orderId') && (
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {row.orderId || row.legacyOrderId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(row.orderId || row.legacyOrderId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    )}
                    {visibleColumns.includes('seller') && (
                      <TableCell>{row.seller?.user?.username || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('buyerLoginName') && (
                      <TableCell>{row.buyerLoginName || row.buyerUsername || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('itemId') && (
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {row.itemId || '-'}
                          </Typography>
                          {row.itemId ? (
                            <IconButton size="small" onClick={() => handleCopy(row.itemId)}>
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          ) : null}
                        </Stack>
                      </TableCell>
                    )}
                    {visibleColumns.includes('respondType') && (
                      <TableCell>{row.respondType || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('status') && (
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.cancelStatus || 'Unknown'}
                          color={getStatusColor(row.cancelStatus)}
                          sx={{ fontSize: '0.65rem' }}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.includes('state') && (
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.cancelState || '-'}
                          variant="outlined"
                          sx={{ fontSize: '0.65rem' }}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.includes('reason') && (
                      <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {(row.cancelReason || '-').replace(/_/g, ' ')}
                        </Typography>
                      </TableCell>
                    )}
                    {visibleColumns.includes('requestor') && (
                      <TableCell>{row.requestorType || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('amount') && (
                      <TableCell>
                        {row.requestRefundAmount?.value
                          ? `${row.requestRefundAmount.currency || 'USD'} ${row.requestRefundAmount.value}`
                          : '-'}
                      </TableCell>
                    )}
                    {visibleColumns.includes('marketplace') && (
                      <TableCell>{row.marketplaceId || '-'}</TableCell>
                    )}
                    {visibleColumns.includes('requestDate') && (
                      <TableCell>{formatDate(row.cancelRequestDate)}</TableCell>
                    )}
                    {visibleColumns.includes('sellerDue') && (
                      <TableCell>{formatDate(row.sellerResponseDueDate)}</TableCell>
                    )}
                    {visibleColumns.includes('action') && (
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                          {canSellerRespond(row) && (
                            <>
                              <Tooltip title="POST /cancellation/{cancelId}/approve">
                                <span>
                                  <Button
                                    size="small"
                                    color="success"
                                    variant="contained"
                                    disabled={actionBusyId === row.cancelId}
                                    startIcon={
                                      actionBusyId === row.cancelId
                                        ? <CircularProgress size={12} color="inherit" />
                                        : <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                                    }
                                    onClick={() => openApproveDialog(row)}
                                    sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.25, minWidth: 0 }}
                                  >
                                    Approve
                                  </Button>
                                </span>
                              </Tooltip>
                              <Tooltip title="POST /cancellation/{cancelId}/reject">
                                <span>
                                  <Button
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    disabled={actionBusyId === row.cancelId}
                                    startIcon={<HighlightOffIcon sx={{ fontSize: 16 }} />}
                                    onClick={() => openRejectDialog(row)}
                                    sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.25, minWidth: 0 }}
                                  >
                                    Reject
                                  </Button>
                                </span>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip title="Open chat / manage">
                            <IconButton size="small" onClick={() => setSelectedRow(row)}>
                              <ChatIcon fontSize="small" />
                            </IconButton>
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

      {selectedRow && (
        <ChatModal
          open={Boolean(selectedRow)}
          onClose={() => setSelectedRow(null)}
          orderId={selectedRow.orderId || selectedRow.legacyOrderId}
          buyerUsername={selectedRow.buyerLoginName || selectedRow.buyerUsername}
          itemId={selectedRow.itemId}
          itemTitle={selectedRow.itemTitle || selectedRow.productName || ''}
          sellerId={selectedRow.seller?._id || selectedRow.seller || null}
          sellerName={selectedRow.seller?.user?.username || ''}
          title="Manage Cancellation"
          category="Cancellation"
          caseStatus={selectedRow.cancelStatus || selectedRow.cancelState || 'Open'}
          entityId={selectedRow.cancelId || selectedRow._id}
          entityType="cancellation"
        />
      )}

      <Dialog
        open={approveDialog.open}
        onClose={() => !actionBusyId && setApproveDialog({ open: false, row: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Approve cancellation</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            You are about to approve cancellation <strong>{approveDialog.row?.cancelId}</strong>.
            This action is sent to eBay and cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setApproveDialog({ open: false, row: null })}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            color="success"
            variant="contained"
            onClick={confirmApprove}
            disabled={Boolean(actionBusyId)}
          >
            {actionBusyId ? 'Approving...' : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={rejectDialog.open}
        onClose={() => !actionBusyId && setRejectDialog({ open: false, row: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reject cancellation</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            You are about to reject cancellation <strong>{rejectDialog.row?.cancelId}</strong>.
            This action is sent to eBay and cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRejectDialog({ open: false, row: null })}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmReject}
            disabled={Boolean(actionBusyId)}
          >
            {actionBusyId ? 'Rejecting...' : 'Reject'}
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
