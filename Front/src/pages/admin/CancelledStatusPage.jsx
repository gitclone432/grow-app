import React, { useEffect, useMemo, useState } from 'react';
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
  TextField,
  Pagination
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CancelIcon from '@mui/icons-material/Cancel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChatIcon from '@mui/icons-material/Chat';
import DownloadIcon from '@mui/icons-material/Download';
import { Button } from '@mui/material';
import api from '../../lib/api';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import ChatModal from '../../components/ChatModal';
import ColumnSelector from '../../components/ColumnSelector';

export default function CancelledStatusPage({
  dateFilter: dateFilterProp,
  hideDateFilter = false
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Filters
  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState('');
  const [itemsFilter, setItemsFilter] = useState(''); // repurposing for marketplace filter to match API if needed, or just new param
  const [marketplaceFilter, setMarketplaceFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const limit = 50; // Items per page

  const MARKETPLACES = [
    'EBAY_US',
    'EBAY_GB',
    'EBAY_DE',
    'EBAY_AU',
    'EBAY_CA',
    'EBAY_FR',
    'EBAY_IT',
    'EBAY_ES'
  ];

  const ALL_COLUMNS = [
    { id: 'sl', label: 'SL No' },
    { id: 'seller', label: 'Seller' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'dateSold', label: 'Date Sold' },
    { id: 'productName', label: 'Product Name' },
    { id: 'buyerName', label: 'Buyer Name' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'total', label: 'Total' },
    { id: 'cancelStatus', label: 'Cancel Status' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'worksheetStatus', label: 'Worksheet Status' },
    { id: 'logs', label: 'Logs' },
    { id: 'chat', label: 'Chat' },
  ];
  const [visibleColumns, setVisibleColumns] = useState(ALL_COLUMNS.map(c => c.id));
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

  useEffect(() => {
    fetchCancelledOrders();
  }, [dateFilter, sellerFilter, marketplaceFilter, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [dateFilter, sellerFilter, marketplaceFilter]);

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

  const handleWorksheetStatusChange = async (orderId, newStatus) => {
    try {
      await api.patch(`/ebay/orders/${orderId}/worksheet-status`, { worksheetStatus: newStatus });
      // Update local state
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.orderId === orderId ? { ...order, worksheetStatus: newStatus } : order
        )
      );
    } catch (err) {
      console.error('Failed to update worksheet status:', err);
      alert('Failed to update worksheet status: ' + (err.response?.data?.error || err.message));
    }
  };

  async function fetchCancelledOrders() {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: page,
        limit: limit
      };
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }
      // mode 'all' = no date params, shows all orders

      // Add filters
      if (sellerFilter) params.sellerId = sellerFilter;
      if (marketplaceFilter) params.marketplace = marketplaceFilter;

      // NEW: Use the dedicated endpoint that filters server-side (30-day window)
      const res = await api.get('/ebay/cancelled-orders', { params });
      const cancelledOrders = res.data.orders || [];
      const pagination = res.data.pagination || {};

      console.log(`Loaded ${cancelledOrders.length} IN_PROGRESS orders (Page ${pagination.currentPage}/${pagination.totalPages})`);

      setOrders(cancelledOrders);
      setTotalPages(pagination.totalPages || 1);
      setTotalOrders(pagination.totalOrders || 0);
    } catch (e) {
      console.error('Failed to fetch cancelled orders:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

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
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const year = d.getFullYear();
      return `${month}/${day}/${year}`;
    } catch {
      return '-';
    }
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (Number.isNaN(num)) return '-';
    return `$${num.toFixed(2)}`;
  };

  // Handler for saving order logs
  const handleSaveOrderLogs = async (orderId, logs) => {
    try {
      await api.patch(`/ebay/orders/${orderId}/logs`, { logs });
      // Update local state
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.orderId === orderId ? { ...order, logs } : order
        )
      );
    } catch (err) {
      console.error('Failed to save order logs:', err);
      throw err;
    }
  };

  // LogsCell component for editable logs field with save functionality
  const LogsCell = ({ value, onSave, id }) => {
    const [localValue, setLocalValue] = React.useState(value || '');
    const [saving, setSaving] = React.useState(false);
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
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
  };

  return (
    <Box>
      {/* HEADER SECTION */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CancelIcon color="error" />
            <Typography variant="h5" fontWeight="bold">
              Cancelled Status
            </Typography>
          </Stack>
          {orders.length > 0 && (
            <Chip
              icon={<CancelIcon />}
              label={`${orders.length} order(s) with cancellation`}
              color="error"
              variant="outlined"
            />
          )}

          <Button
            variant="outlined"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={() => {
              const csvData = prepareCSVData(orders, {
                'Order ID': 'orderId',
                'Seller': (o) => o.seller?.user?.username || '',
                'Buyer Name': 'shippingFullName',
                'Product': 'productName',
                'Cancel State': 'cancelState',
                'Date Sold': (o) => o.dateSold ? new Date(o.dateSold).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : '',
                'Marketplace': 'purchaseMarketplaceId',
                'Total': (o) => o.pricingSummary?.total?.value || '',
                'Worksheet Status': 'worksheetStatus',
                'Logs': 'logs',
              });
              downloadCSV(csvData, 'Cancelled_Orders');
            }}
            disabled={orders.length === 0}
          >
            Download CSV ({orders.length})
          </Button>
          <ColumnSelector
            allColumns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(ALL_COLUMNS.map(c => c.id))}
            page="cancelled-status"
          />
        </Stack>

        {/* Filters Row */}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
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

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
              label="Marketplace"
            >
              <MenuItem value="">All Marketplaces</MenuItem>
              {MARKETPLACES.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchCancelledOrders}
            disabled={loading}
            size="small"
          >
            Refresh
          </Button>
        </Stack>

        {!hideDateFilter && (
          <>
            {/* Date Filter */}
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Date</InputLabel>
                <Select
                  value={dateFilter.mode}
                  onChange={(e) => setInternalDateFilter({ ...dateFilter, mode: e.target.value })}
                  label="Date"
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="single">Single Date</MenuItem>
                  <MenuItem value="range">Date Range</MenuItem>
                </Select>
              </FormControl>

              {dateFilter.mode === 'single' && (
                <TextField
                  type="date"
                  size="small"
                  value={dateFilter.single}
                  onChange={(e) => setInternalDateFilter({ ...dateFilter, single: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              )}

              {dateFilter.mode === 'range' && (
                <>
                  <TextField
                    type="date"
                    size="small"
                    value={dateFilter.from}
                    onChange={(e) => setInternalDateFilter({ ...dateFilter, from: e.target.value })}
                    label="From"
                    InputLabelProps={{ shrink: true }}
                  />
                  <Typography variant="body2">to</Typography>
                  <TextField
                    type="date"
                    size="small"
                    value={dateFilter.to}
                    onChange={(e) => setInternalDateFilter({ ...dateFilter, to: e.target.value })}
                    label="To"
                    InputLabelProps={{ shrink: true }}
                  />
                </>
              )}
            </Stack>
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* TABLE SECTION */}
      {loading ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ mt: 2 }}>
            Loading cancelled orders...
          </Typography>
        </Paper>
      ) : orders.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CancelIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            No cancelled orders found.
          </Typography>
        </Paper>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            maxHeight: 'calc(100vh - 300px)',
            overflow: 'auto',
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
          <Table size="small" stickyHeader sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                {visibleColumns.includes('sl') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>SL No</TableCell>}
                {visibleColumns.includes('seller') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Seller</TableCell>}
                {visibleColumns.includes('orderId') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Order ID</TableCell>}
                {visibleColumns.includes('dateSold') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Date Sold</TableCell>}
                {visibleColumns.includes('productName') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Product Name</TableCell>}
                {visibleColumns.includes('buyerName') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Buyer Name</TableCell>}
                {visibleColumns.includes('marketplace') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Marketplace</TableCell>}
                {visibleColumns.includes('total') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }} align="right">
                  Total
                </TableCell>}
                {visibleColumns.includes('cancelStatus') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Cancel Status</TableCell>}
                {visibleColumns.includes('refunds') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Refunds</TableCell>}
                {visibleColumns.includes('worksheetStatus') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Worksheet Status</TableCell>}
                {visibleColumns.includes('logs') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }}>Logs</TableCell>}
                {visibleColumns.includes('chat') && <TableCell sx={{ backgroundColor: 'error.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1 }} align="center">Chat</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order, idx) => (
                <TableRow
                  key={order._id || idx}
                  sx={{
                    '&:nth-of-type(odd)': { backgroundColor: 'action.hover' },
                    '&:hover': { backgroundColor: 'action.selected' },
                  }}
                >
                  {visibleColumns.includes('sl') && <TableCell>{idx + 1}</TableCell>}
                  {visibleColumns.includes('seller') && <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {order.seller?.user?.username ||
                        order.seller?.user?.email ||
                        order.sellerId ||
                        '-'}
                    </Typography>
                  </TableCell>}
                  {visibleColumns.includes('orderId') && <TableCell>
                    <Typography
                      variant="body2"
                      fontWeight="medium"
                      sx={{ color: 'primary.main' }}
                    >
                      {order.orderId || order.legacyOrderId || '-'}
                    </Typography>
                  </TableCell>}
                  {visibleColumns.includes('dateSold') && <TableCell>{formatDate(order.dateSold)}</TableCell>}
                  {visibleColumns.includes('productName') && <TableCell sx={{ maxWidth: 250, pr: 1 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <Tooltip
                        title={order.productName || order.lineItems?.[0]?.title || '-'}
                        arrow
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {order.productName || order.lineItems?.[0]?.title || '-'}
                        </Typography>
                      </Tooltip>
                      <IconButton
                        size="small"
                        onClick={() =>
                          handleCopy(order.productName || order.lineItems?.[0]?.title || '-')
                        }
                        aria-label="copy product name"
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>}
                  {visibleColumns.includes('buyerName') && <TableCell sx={{ maxWidth: 150, pr: 1 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <Tooltip
                        title={order.buyer?.buyerRegistrationAddress?.fullName || '-'}
                        arrow
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {order.buyer?.buyerRegistrationAddress?.fullName || '-'}
                        </Typography>
                      </Tooltip>
                      <IconButton
                        size="small"
                        onClick={() =>
                          handleCopy(order.buyer?.buyerRegistrationAddress?.fullName || '-')
                        }
                        aria-label="copy buyer name"
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>}
                  {visibleColumns.includes('marketplace') && <TableCell>
                    <Typography variant="body2">
                      {order.purchaseMarketplaceId || '-'}
                    </Typography>
                  </TableCell>}
                  {visibleColumns.includes('total') && <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium">
                      {formatCurrency(
                        (order.subtotal || 0) +
                        (order.shipping || 0) +
                        (order.salesTax || 0) -
                        (order.discount || 0)
                      )}
                    </Typography>
                  </TableCell>}
                  {visibleColumns.includes('cancelStatus') && <TableCell>
                    <Chip
                      label={order.cancelState || 'NONE_REQUESTED'}
                      size="small"
                      color={
                        order.cancelState === 'CANCELED'
                          ? 'error'
                          : order.cancelState === 'CANCEL_REQUESTED'
                            ? 'warning'
                            : 'success'
                      }
                      sx={{
                        fontSize: '0.7rem',
                        backgroundColor: order.cancelState === 'IN_PROGRESS' ? '#ffd700' : undefined,
                        color: order.cancelState === 'IN_PROGRESS' ? '#000' : undefined,
                        fontWeight: order.cancelState === 'IN_PROGRESS' ? 'bold' : 'normal'
                      }}
                    />
                  </TableCell>}
                  {visibleColumns.includes('refunds') && <TableCell>
                    {order.refunds && order.refunds.length > 0 ? (
                      <Tooltip
                        title={
                          <Box>
                            {order.refunds.map((refund, refIdx) => (
                              <Typography key={refIdx} variant="caption" display="block">
                                {formatCurrency(refund.refundAmount?.value)} -{' '}
                                {refund.refundStatus}
                              </Typography>
                            ))}
                          </Box>
                        }
                        arrow
                      >
                        <Chip
                          label={`${order.refunds.length} refund(s)`}
                          size="small"
                          color="warning"
                          sx={{ fontSize: '0.7rem', cursor: 'pointer' }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>}
                  {visibleColumns.includes('worksheetStatus') && <TableCell>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={order.worksheetStatus || 'open'}
                        onChange={(e) => handleWorksheetStatusChange(order.orderId, e.target.value)}
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
                      value={order.logs}
                      id={order.orderId}
                      onSave={handleSaveOrderLogs}
                    />
                  </TableCell>}
                  {visibleColumns.includes('chat') && <TableCell align="center">
                    <Tooltip title="Chat with buyer">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <ChatIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination Controls */}
      {!loading && orders.length > 0 && totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mt: 2, py: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, totalOrders)} of {totalOrders} orders
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
      {selectedOrder && (
        <ChatModal
          open={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          orderId={selectedOrder.orderId || selectedOrder.legacyOrderId}
          buyerUsername={selectedOrder.buyer?.username || selectedOrder.buyer?.buyerRegistrationAddress?.fullName}
          buyerName={selectedOrder.buyer?.buyerRegistrationAddress?.fullName || selectedOrder.buyer?.username}
          title="Cancellation Chat"
        />
      )}
    </Box>
  );
}
