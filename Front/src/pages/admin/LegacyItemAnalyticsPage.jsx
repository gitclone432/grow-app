import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Fade,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import ChatIcon from '@mui/icons-material/Chat';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { alpha, useTheme } from '@mui/material/styles';
import api from '../../lib/api';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import StatMetricCard from '../../components/StatMetricCard.jsx';
import ChatModal from '../../components/ChatModal.jsx';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

const PT_TIMEZONE = 'America/Los_Angeles';
const initialSummary = null;

function getPtDateInputValue(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

const initialDateFilter = {
  mode: 'single',
  single: getPtDateInputValue(),
  from: '',
  to: ''
};

export default function LegacyItemAnalyticsPage() {
  const theme = useTheme();
  const dt = theme.customTokens?.dashboardSignature || dashboardSignatureTokens;

  const selectFocusSx = {
    '& label.Mui-focused': { color: BRAND_YELLOW_DARK },
    '& .MuiOutlinedInput-root': { '&.Mui-focused fieldset': { borderColor: BRAND_YELLOW_DARK } },
  };
  const inputFocusSx = {
    '& .MuiOutlinedInput-root': {
      '& .MuiOutlinedInput-notchedOutline': { transition: 'border-color 0.2s ease' },
      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(BRAND_DARK, 0.35) },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND_YELLOW_DARK, borderWidth: 2 },
    },
  };

  const [legacyItemIdInput, setLegacyItemIdInput] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('');
  const [selectedCancelledFilter, setSelectedCancelledFilter] = useState('');
  const [ebayMotorsOnly, setEbayMotorsOnly] = useState(false);
  const [excludeClient, setExcludeClient] = useState(true);
  const [excludeLowValue, setExcludeLowValue] = useState(true);
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  const [sellers, setSellers] = useState([]);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const [drillDown, setDrillDown] = useState({ open: false, loading: false, orders: [], error: '', meta: null });
  const [chatOrder, setChatOrder] = useState(null);

  const [endListingItemId, setEndListingItemId] = useState('');
  const [endListingSellerId, setEndListingSellerId] = useState('');
  const [endListingConfirmOpen, setEndListingConfirmOpen] = useState(false);
  const [endingListing, setEndingListing] = useState(false);
  const [endListingSnackbar, setEndListingSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [editSellerId, setEditSellerId] = useState('');
  const [editItemId, setEditItemId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editListingConfirmOpen, setEditListingConfirmOpen] = useState(false);
  const [editingListing, setEditingListing] = useState(false);
  const [editListingSnackbar, setEditListingSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    const fetchSellers = async () => {
      try {
        setSellerLoading(true);
        const response = await api.get('/sellers/all');
        setSellers(response.data || []);
      } catch (fetchError) {
        console.error('Error fetching sellers:', fetchError);
      } finally {
        setSellerLoading(false);
      }
    };

    fetchSellers();
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        ebayMotors: ebayMotorsOnly,
        excludeClient,
        excludeLowValue,
      };

      if (dateFilter.mode === 'single') {
        if (!dateFilter.single) {
          setError('Select a date first.');
          setLoading(false);
          return;
        }
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (!dateFilter.from && !dateFilter.to) {
          setError('Select a start date or end date.');
          setLoading(false);
          return;
        }
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      if (legacyItemIdInput.trim()) {
        params.legacyItemId = legacyItemIdInput.trim();
      }

      if (selectedSeller) {
        params.sellerId = selectedSeller;
      }

      if (selectedPaymentStatus) {
        params.paymentStatus = selectedPaymentStatus;
      }

      if (selectedCancelledFilter) {
        params.cancelledFilter = selectedCancelledFilter;
      }

      const response = await api.get('/orders/legacy-item-seller-summary', { params });
      setSummary(response.data || initialSummary);
      setHasSearched(true);
    } catch (fetchError) {
      console.error('Error fetching legacy item analytics:', fetchError);
      setSummary(initialSummary);
      setHasSearched(true);
      setError(fetchError?.response?.data?.error || 'Failed to load legacy item analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchSummary();
  };

  const handleRefresh = () => {
    if (!hasSearched) {
      return;
    }

    fetchSummary();
  };

  const DRILL_TYPE_LABELS = {
    all: 'Seller Orders',
    cancelled: 'Cancelled',
    partiallyRefunded: 'Partially Refunded',
    fullyRefunded: 'Fully Refunded',
  };

  const handleDrillDown = async (row, type) => {
    setDrillDown({ open: true, loading: true, orders: [], error: '', meta: { legacyItemId: row.legacyItemId, sellerUsername: row.sellerUsername, type } });
    try {
      const params = { legacyItemId: row.legacyItemId, type, ebayMotors: ebayMotorsOnly, excludeClient, excludeLowValue };
      if (row.sellerId) params.sellerId = row.sellerId;
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }
      const response = await api.get('/orders/legacy-item-orders', { params });
      setDrillDown((prev) => ({ ...prev, loading: false, orders: response.data.orders || [] }));
    } catch (err) {
      setDrillDown((prev) => ({ ...prev, loading: false, error: err?.response?.data?.error || 'Failed to load orders.' }));
    }
  };

  const handleEndListingClick = () => {
    if (!endListingItemId.trim() || !endListingSellerId) return;
    setEndListingConfirmOpen(true);
  };

  const confirmEndListing = async () => {
    setEndListingConfirmOpen(false);
    setEndingListing(true);
    try {
      await api.post('/ebay/end-item', {
        sellerId: endListingSellerId,
        itemId: endListingItemId.trim(),
        endingReason: 'NotAvailable',
      });
      setEndListingSnackbar({ open: true, message: 'Listing ended successfully on eBay', severity: 'success' });
      setEndListingItemId('');
    } catch (e) {
      setEndListingSnackbar({ open: true, message: 'Failed to end listing: ' + (e?.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setEndingListing(false);
    }
  };

  const handleEditListingClick = () => {
    if (!editItemId.trim() || !editSellerId) return;
    if (!editTitle.trim() && !editPrice) return;
    setEditListingConfirmOpen(true);
  };

  const confirmEditListing = async () => {
    setEditListingConfirmOpen(false);
    setEditingListing(true);
    try {
      const payload = { sellerId: editSellerId, itemId: editItemId.trim() };
      if (editTitle.trim()) payload.title = editTitle.trim();
      if (editPrice) payload.price = parseFloat(editPrice);
      await api.post('/ebay/update-listing', payload);
      setEditListingSnackbar({ open: true, message: 'Listing updated successfully on eBay', severity: 'success' });
      setEditItemId('');
      setEditTitle('');
      setEditPrice('');
    } catch (e) {
      setEditListingSnackbar({ open: true, message: 'Failed to update listing: ' + (e?.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setEditingListing(false);
    }
  };

  const itemRows = summary?.items || [];
  const flattenedRows = useMemo(() => itemRows.flatMap((item) => item.sellers.map((sellerRow) => ({
    legacyItemId: item.legacyItemId,
    productTitle: item.productTitle,
    itemTotalOrders: item.totalOrders,
    itemCancelledOrders: item.cancelledOrders,
    itemPartiallyRefundedOrders: item.partiallyRefundedOrders,
    itemFullyRefundedOrders: item.fullyRefundedOrders,
    ...sellerRow,
  }))), [itemRows]);

  const fmtPct = (numerator, denominator) => {
    if (!denominator) return null;
    const pct = (numerator / denominator) * 100;
    return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
  };

  const summaryCards = useMemo(() => {
    const total = summary?.totalOrders || 0;
    return [
      { label: 'Legacy Items', value: summary?.itemCount || 0, tone: 'neutral' },
      { label: 'Total Orders', value: total, tone: 'info' },
      { label: 'Cancelled', value: summary?.cancelledOrders || 0, tone: 'warning', subtext: fmtPct(summary?.cancelledOrders, total) },
      { label: 'Partially Refunded', value: summary?.partiallyRefundedOrders || 0, tone: 'amazon', subtext: fmtPct(summary?.partiallyRefundedOrders, total) },
      { label: 'Fully Refunded', value: summary?.fullyRefundedOrders || 0, tone: 'danger', subtext: fmtPct(summary?.fullyRefundedOrders, total) },
    ];
  }, [summary]);

  const pageSubtitle = dateFilter.mode === 'single'
    ? 'See all legacy item IDs sold on a selected PT day, with seller-wise cancellation and refund counts.'
    : 'See all legacy item IDs sold in a selected PT date range, with seller-wise cancellation and refund counts.';

  return (
    <>
      <Fade in timeout={400}>
        <AdminPageShell>
          <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
            <PageHeader
              title="Legacy Item Analytics"
              subtitle={pageSubtitle}
              sx={{ pt: 0, pb: 0 }}
            />

            {/* ── Row 1: Date controls + filters ── */}
            <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap sx={{ mt: 2.5 }}>
              <FormControl size="small" sx={{ minWidth: 150, ...selectFocusSx }}>
                <InputLabel>Date Mode</InputLabel>
                <Select
                  label="Date Mode"
                  value={dateFilter.mode}
                  onChange={(event) => setDateFilter((previous) => ({
                    ...previous,
                    mode: event.target.value,
                    single: event.target.value === 'single' && !previous.single ? getPtDateInputValue() : previous.single,
                  }))}
                >
                  <MenuItem value="single">Single Day</MenuItem>
                  <MenuItem value="range">Date Range</MenuItem>
                </Select>
              </FormControl>

              {dateFilter.mode === 'single' ? (
                <TextField
                  label="Date"
                  type="date"
                  size="small"
                  value={dateFilter.single}
                  onChange={(event) => setDateFilter((previous) => ({ ...previous, single: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 180, ...inputFocusSx }}
                  helperText="Uses PT day boundaries (America/Los_Angeles, PST/PDT)."
                />
              ) : (
                <>
                  <TextField
                    label="From"
                    type="date"
                    size="small"
                    value={dateFilter.from}
                    onChange={(event) => setDateFilter((previous) => ({ ...previous, from: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 180, ...inputFocusSx }}
                    helperText="PT start day"
                  />
                  <TextField
                    label="To"
                    type="date"
                    size="small"
                    value={dateFilter.to}
                    onChange={(event) => setDateFilter((previous) => ({ ...previous, to: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 180, ...inputFocusSx }}
                    helperText="PT end day"
                  />
                </>
              )}

              <TextField
                label="Legacy Item ID"
                size="small"
                value={legacyItemIdInput}
                onChange={(event) => setLegacyItemIdInput(event.target.value)}
                placeholder="Optional"
                sx={{ minWidth: 180, ...inputFocusSx }}
                onKeyDown={(event) => { if (event.key === 'Enter') handleSearch(); }}
              />

              <FormControl size="small" sx={{ minWidth: 200, ...selectFocusSx }}>
                <InputLabel>Seller</InputLabel>
                <Select
                  label="Seller"
                  value={selectedSeller}
                  onChange={(event) => setSelectedSeller(event.target.value)}
                  disabled={sellerLoading}
                >
                  <MenuItem value="">All Sellers</MenuItem>
                  {sellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {seller.user?.username || 'Unknown Seller'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 190, ...selectFocusSx }}>
                <InputLabel>Payment Status</InputLabel>
                <Select
                  label="Payment Status"
                  value={selectedPaymentStatus}
                  onChange={(event) => setSelectedPaymentStatus(event.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="FULLY_REFUNDED">FULLY_REFUNDED</MenuItem>
                  <MenuItem value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 180, ...selectFocusSx }}>
                <InputLabel>Cancel Filter</InputLabel>
                <Select
                  label="Cancel Filter"
                  value={selectedCancelledFilter}
                  onChange={(event) => setSelectedCancelledFilter(event.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="cancelled">Cancelled Only</MenuItem>
                  <MenuItem value="not_cancelled">Not Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* ── Row 2: Toggles + action buttons ── */}
            <Stack direction="row" flexWrap="wrap" gap={2} useFlexGap alignItems="center" sx={{ mt: 1.5 }}>
              {/* Toggles group */}
              <Stack direction="row" gap={3} useFlexGap alignItems="center" flexWrap="wrap">
                <FormControlLabel
                  sx={{ gap: 0.75, mr: 0 }}
                  control={<Switch checked={ebayMotorsOnly} onChange={(event) => setEbayMotorsOnly(event.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 500 }}>eBay Motors</Typography>}
                />
                <FormControlLabel
                  sx={{ gap: 0.75, mr: 0 }}
                  control={<Switch checked={excludeClient} onChange={(event) => setExcludeClient(event.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Exclude Client</Typography>}
                />
                <FormControlLabel
                  sx={{ gap: 0.75, mr: 0 }}
                  control={<Switch checked={excludeLowValue} onChange={(event) => setExcludeLowValue(event.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Exclude Low Value</Typography>}
                />
              </Stack>

              <Box sx={{ flex: 1 }} />

              {/* Action buttons group */}
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                  onClick={handleSearch}
                  disabled={loading}
                  sx={{ ...yellowFilledButtonSx, minWidth: 110 }}
                >
                  Search
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRefresh}
                  disabled={loading || !hasSearched}
                  sx={{ ...yellowOutlinedButtonSx, minWidth: 110 }}
                >
                  Refresh
                </Button>
              </Stack>
            </Stack>

            {/* ── Row 3: End Listing ── */}
            <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap alignItems="center" sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 90 }}>End Listing</Typography>
              <FormControl size="small" sx={{ minWidth: 200, ...selectFocusSx }}>
                <InputLabel>Seller</InputLabel>
                <Select
                  label="Seller"
                  value={endListingSellerId}
                  onChange={(e) => setEndListingSellerId(e.target.value)}
                  disabled={sellerLoading}
                >
                  <MenuItem value=""><em>Select Seller</em></MenuItem>
                  {sellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {seller.user?.username || 'Unknown Seller'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Item ID"
                size="small"
                value={endListingItemId}
                onChange={(e) => setEndListingItemId(e.target.value)}
                placeholder="e.g. 123456789012"
                sx={{ minWidth: 200, ...inputFocusSx }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEndListingClick(); }}
              />
              <Button
                variant="contained"
                color="error"
                size="small"
                disabled={!endListingItemId.trim() || !endListingSellerId || endingListing}
                onClick={handleEndListingClick}
                startIcon={endingListing ? <CircularProgress size={14} color="inherit" /> : null}
                sx={{ minWidth: 130, fontWeight: 700 }}
              >
                {endingListing ? 'Ending…' : 'End Listing'}
              </Button>
            </Stack>

            {/* ── Row 4: Edit Listing ── */}
            <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap alignItems="center" sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 90 }}>Edit Listing</Typography>
              <FormControl size="small" sx={{ minWidth: 200, ...selectFocusSx }}>
                <InputLabel>Seller</InputLabel>
                <Select
                  label="Seller"
                  value={editSellerId}
                  onChange={(e) => setEditSellerId(e.target.value)}
                  disabled={sellerLoading}
                >
                  <MenuItem value=""><em>Select Seller</em></MenuItem>
                  {sellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {seller.user?.username || 'Unknown Seller'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Item ID"
                size="small"
                value={editItemId}
                onChange={(e) => setEditItemId(e.target.value)}
                placeholder="e.g. 123456789012"
                sx={{ minWidth: 200, ...inputFocusSx }}
              />
              <TextField
                label="New Title"
                size="small"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Leave blank to keep current"
                inputProps={{ maxLength: 80 }}
                sx={{ minWidth: 280, ...inputFocusSx }}
              />
              <TextField
                label="New Price (USD)"
                size="small"
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="Leave blank to keep current"
                inputProps={{ min: 0, step: '0.01' }}
                sx={{ minWidth: 180, ...inputFocusSx }}
              />
              <Button
                variant="contained"
                size="small"
                disabled={!editItemId.trim() || !editSellerId || (!editTitle.trim() && !editPrice) || editingListing}
                onClick={handleEditListingClick}
                startIcon={editingListing ? <CircularProgress size={14} color="inherit" /> : null}
                sx={{ minWidth: 130, fontWeight: 700, bgcolor: BRAND_DARK, color: BRAND_YELLOW, '&:hover': { bgcolor: alpha(BRAND_DARK, 0.85) }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}
              >
                {editingListing ? 'Saving…' : 'Save Changes'}
              </Button>
            </Stack>

            {error && (
              <Alert severity="error" sx={{ mt: 2.5 }}>
                {error}
              </Alert>
            )}
          </SectionCard>

          {summary && !error && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
              {summaryCards.map((card) => (
                <StatMetricCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  tone={card.tone}
                  subtext={card.subtext}
                />
              ))}
            </Box>
          )}

          <SectionCard sx={{ p: 0 }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Legacy Item Breakdown
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Each row shows a legacy item ID found in the selected dates, the seller handling those orders, and the cancellation and refund counts.
              </Typography>
            </Box>

            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeaderCellSx}>Legacy Item ID</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Item Total</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Seller</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Product Title</TableCell>
                    <TableCell sx={tableHeaderCellSx} align="right">Seller Orders</TableCell>
                    <TableCell sx={tableHeaderCellSx} align="right">Cancelled</TableCell>
                    <TableCell sx={tableHeaderCellSx} align="right">Partially Refunded</TableCell>
                    <TableCell sx={tableHeaderCellSx} align="right">Fully Refunded</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {loading && (
                    <TableRow sx={tableBodyRowSx}>
                      <TableCell sx={tableBodyCellSx} colSpan={8}>
                        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 3 }}>
                          <CircularProgress size={20} />
                          <Typography variant="body2" color="text.secondary">
                            Loading legacy item summary...
                          </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading && flattenedRows.map((row) => (
                    <TableRow key={`${row.legacyItemId}-${row.sellerId || row.sellerUsername}`} sx={tableBodyRowSx}>
                      <TableCell sx={tableBodyCellSx}>{row.legacyItemId}</TableCell>
                      <TableCell sx={tableBodyCellSx} align="right">{row.itemTotalOrders}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{row.sellerUsername}</TableCell>
                      <TableCell sx={{ ...tableBodyCellSx, whiteSpace: 'normal', minWidth: 320 }}>
                        {row.productTitle || 'Title not found'}
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="right">
                        {row.totalOrders > 0 ? (
                          <Button variant="text" size="small" onClick={() => handleDrillDown(row, 'all')} sx={{ minWidth: 0, p: 0, fontWeight: 700, color: 'primary.main', '&:hover': { textDecoration: 'underline', bgcolor: 'transparent' } }}>
                            {row.totalOrders}
                          </Button>
                        ) : 0}
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="right">
                        {row.cancelledOrders > 0 ? (
                          <Stack alignItems="flex-end" spacing={0}>
                            <Button variant="text" size="small" onClick={() => handleDrillDown(row, 'cancelled')} sx={{ minWidth: 0, p: 0, fontWeight: 700, color: 'warning.main', '&:hover': { textDecoration: 'underline', bgcolor: 'transparent' } }}>
                              {row.cancelledOrders}
                            </Button>
                            {fmtPct(row.cancelledOrders, row.baseTotalOrders) && (
                              <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>{fmtPct(row.cancelledOrders, row.baseTotalOrders)}</Typography>
                            )}
                          </Stack>
                        ) : 0}
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="right">
                        {row.partiallyRefundedOrders > 0 ? (
                          <Stack alignItems="flex-end" spacing={0}>
                            <Button variant="text" size="small" onClick={() => handleDrillDown(row, 'partiallyRefunded')} sx={{ minWidth: 0, p: 0, fontWeight: 700, color: 'info.main', '&:hover': { textDecoration: 'underline', bgcolor: 'transparent' } }}>
                              {row.partiallyRefundedOrders}
                            </Button>
                            {fmtPct(row.partiallyRefundedOrders, row.baseTotalOrders) && (
                              <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>{fmtPct(row.partiallyRefundedOrders, row.baseTotalOrders)}</Typography>
                            )}
                          </Stack>
                        ) : 0}
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="right">
                        {row.fullyRefundedOrders > 0 ? (
                          <Stack alignItems="flex-end" spacing={0}>
                            <Button variant="text" size="small" onClick={() => handleDrillDown(row, 'fullyRefunded')} sx={{ minWidth: 0, p: 0, fontWeight: 700, color: 'error.main', '&:hover': { textDecoration: 'underline', bgcolor: 'transparent' } }}>
                              {row.fullyRefundedOrders}
                            </Button>
                            {fmtPct(row.fullyRefundedOrders, row.baseTotalOrders) && (
                              <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>{fmtPct(row.fullyRefundedOrders, row.baseTotalOrders)}</Typography>
                            )}
                          </Stack>
                        ) : 0}
                      </TableCell>
                    </TableRow>
                  ))}

                  {!loading && !flattenedRows.length && (
                    <TableRow sx={tableBodyRowSx}>
                      <TableCell sx={tableBodyCellSx} colSpan={8}>
                        <Box sx={{ py: 4, textAlign: 'center' }}>
                          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                            {hasSearched ? 'No matching legacy items found' : 'Select a date or date range'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {hasSearched
                              ? 'Try a different date selection or adjust the seller and filter options.'
                              : 'Choose a single day or date range to see which legacy item IDs were present.'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </AdminPageShell>
      </Fade>

      {/* ── Order Drill-Down Dialog ── */}
      <Dialog
        open={drillDown.open}
        onClose={() => setDrillDown((prev) => ({ ...prev, open: false }))}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {drillDown.meta ? DRILL_TYPE_LABELS[drillDown.meta.type] : 'Orders'} — {drillDown.meta?.legacyItemId}
            </Typography>
            {drillDown.meta?.sellerUsername && (
              <Typography variant="body2" color="text.secondary">
                Seller: {drillDown.meta.sellerUsername}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => setDrillDown((prev) => ({ ...prev, open: false }))}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {drillDown.loading && (
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 5 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary">Loading orders…</Typography>
            </Stack>
          )}

          {!drillDown.loading && drillDown.error && (
            <Alert severity="error" sx={{ m: 2 }}>{drillDown.error}</Alert>
          )}

          {!drillDown.loading && !drillDown.error && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeaderCellSx}>Order ID</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Status</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Issues</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Case Category</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Case Status</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Notes</TableCell>
                    <TableCell sx={tableHeaderCellSx}>Remark</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, textAlign: 'center' }}>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {drillDown.orders.length === 0 ? (
                    <TableRow sx={tableBodyRowSx}>
                      <TableCell sx={tableBodyCellSx} colSpan={8}>
                        <Box sx={{ py: 3, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">No orders found.</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    drillDown.orders.map((order) => (
                      <TableRow key={order.orderId} sx={tableBodyRowSx}>
                        {/* Order ID */}
                        <TableCell sx={tableBodyCellSx}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                              {order.orderId}
                            </Typography>
                            <Tooltip title="Copy Order ID">
                              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => navigator.clipboard?.writeText(order.orderId)}>
                                <ContentCopyIcon sx={{ fontSize: '0.8rem' }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>

                        {/* Status flags */}
                        <TableCell sx={tableBodyCellSx}>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {order.isCancelled === 1 && <Chip label="Cancelled" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
                            {order.isPartiallyRefunded === 1 && <Chip label="Part. Refunded" size="small" color="info" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
                            {order.isFullyRefunded === 1 && <Chip label="Fully Refunded" size="small" color="error" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
                            {order.isCancelled !== 1 && order.isPartiallyRefunded !== 1 && order.isFullyRefunded !== 1 && (
                              <Typography variant="body2" color="text.disabled">—</Typography>
                            )}
                          </Stack>
                        </TableCell>

                        {/* Issues */}
                        <TableCell sx={tableBodyCellSx}>
                          {order.issues && order.issues.length > 0 ? (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {order.issues.map((issue, idx) => (
                                <Tooltip key={idx} title={issue.caseStatus || 'Case Not Opened'}>
                                  <Chip
                                    label={issue.type}
                                    size="small"
                                    color={issue.caseStatus === 'Case Opened' ? 'error' : 'primary'}
                                    variant="outlined"
                                    sx={{ fontWeight: 'bold', fontSize: '0.7rem', height: 20 }}
                                  />
                                </Tooltip>
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.disabled">—</Typography>
                          )}
                        </TableCell>

                        {/* Case Category — matches FD: truthy check, info color, outlined */}
                        <TableCell sx={tableBodyCellSx}>
                          {order.convoCategory ? (
                            <Chip label={order.convoCategory} size="small" color="info" variant="outlined" sx={{ fontWeight: 'bold', fontSize: '0.75rem' }} />
                          ) : (
                            <Typography variant="body2" color="text.disabled">-</Typography>
                          )}
                        </TableCell>

                        {/* Case Status — matches FD exactly: truthy check, 'Case Opened' → error, else success */}
                        <TableCell sx={tableBodyCellSx}>
                          {order.convoCaseStatus ? (
                            <Chip
                              label={order.convoCaseStatus}
                              size="small"
                              color={order.convoCaseStatus === 'Case Opened' ? 'error' : 'success'}
                              variant="outlined"
                              sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.disabled">-</Typography>
                          )}
                        </TableCell>

                        {/* Notes (fulfillmentNotes) */}
                        <TableCell sx={{ ...tableBodyCellSx, maxWidth: 200 }}>
                          {order.fulfillmentNotes ? (
                            <Tooltip title={order.fulfillmentNotes} placement="top">
                              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                📝 {order.fulfillmentNotes}
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" color="text.disabled">-</Typography>
                          )}
                        </TableCell>

                        {/* Remark */}
                        <TableCell sx={{ ...tableBodyCellSx, maxWidth: 200 }}>
                          {order.remark ? (
                            <Tooltip title={order.remark} placement="top">
                              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                {order.remark}
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" color="text.disabled">-</Typography>
                          )}
                        </TableCell>

                        {/* Message button */}
                        <TableCell sx={tableBodyCellSx} align="center">
                          <Tooltip title="Open Messaging">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => {
                                setDrillDown((prev) => ({ ...prev, open: false }));
                                setChatOrder(order);
                              }}
                            >
                              <ChatIcon fontSize="small" />
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
        </DialogContent>
      </Dialog>

      {/* ── End Listing Confirmation Dialog ── */}
      <Dialog open={endListingConfirmOpen} onClose={() => setEndListingConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>End Listing on eBay?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>This will permanently end the eBay listing for item ID:</DialogContentText>
          <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'error.main' }}>
            {endListingItemId}
          </Typography>
          <DialogContentText sx={{ mt: 1 }}>This action cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEndListingConfirmOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={confirmEndListing} variant="contained" color="error" size="small" sx={{ fontWeight: 700 }}>
            Yes, End Listing
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── End Listing Snackbar ── */}
      <Snackbar
        open={endListingSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setEndListingSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setEndListingSnackbar((prev) => ({ ...prev, open: false }))} severity={endListingSnackbar.severity} sx={{ width: '100%' }}>
          {endListingSnackbar.message}
        </Alert>
      </Snackbar>

      {/* ── Edit Listing Confirmation Dialog ── */}
      <Dialog open={editListingConfirmOpen} onClose={() => setEditListingConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Save Listing Changes on eBay?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>The following changes will be applied to item:</DialogContentText>
          <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, mb: 1 }}>{editItemId}</Typography>
          {editTitle.trim() && (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary" component="span">Title: </Typography>
              <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>{editTitle.trim()}</Typography>
            </Box>
          )}
          {editPrice && (
            <Box>
              <Typography variant="body2" color="text.secondary" component="span">Price: </Typography>
              <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>${parseFloat(editPrice).toFixed(2)}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditListingConfirmOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={confirmEditListing} variant="contained" size="small" sx={{ fontWeight: 700, bgcolor: BRAND_DARK, color: BRAND_YELLOW, '&:hover': { bgcolor: alpha(BRAND_DARK, 0.85) } }}>
            Confirm Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Listing Snackbar ── */}
      <Snackbar
        open={editListingSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setEditListingSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setEditListingSnackbar((prev) => ({ ...prev, open: false }))} severity={editListingSnackbar.severity} sx={{ width: '100%' }}>
          {editListingSnackbar.message}
        </Alert>
      </Snackbar>

      {/* ── Chat Modal ── */}
      {chatOrder && (
        <ChatModal
          open={Boolean(chatOrder)}
          onClose={() => {
            setChatOrder(null);
            setDrillDown((prev) => ({ ...prev, open: true }));
          }}
          orderId={chatOrder.orderId}
          buyerUsername={chatOrder.buyerUsername || ''}
          buyerName={chatOrder.buyerName || chatOrder.shippingFullName || chatOrder.buyerUsername || ''}
          itemId={chatOrder.legacyItemId}
          title="Order Chat"
          category={chatOrder.convoCategory || 'General'}
          caseStatus={chatOrder.convoCaseStatus || 'Case Not Opened'}
        />
      )}
    </>
  );
}
