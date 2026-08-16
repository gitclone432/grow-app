import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

const DEFAULT_OFFER_MESSAGE = "Here's your chance to get this item at a great price!";
const OFFER_DURATION_OPTIONS = [1, 2, 3, 7, 14];

function listingCurrentPrice(item) {
  if (typeof item?.price === 'number' && item.price > 0) return item.price;
  if (item?.listingPrice != null && !Number.isNaN(Number(item.listingPrice))) {
    return Number(item.listingPrice);
  }
  return null;
}

function currencySymbol(currency) {
  const code = String(currency || 'USD').toUpperCase();
  if (code === 'USD') return '$';
  if (code === 'GBP') return '£';
  if (code === 'EUR') return '€';
  if (code === 'AUD') return 'A$';
  if (code === 'CAD') return 'C$';
  return `${code} `;
}

function formatMoney(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${currencySymbol(currency)}${n.toFixed(2)}`;
}

function itemRowKey(item) {
  return `${item?.sellerId || ''}::${item?.listingId || item?.itemId || ''}`;
}

function listingCurrencyOf(item) {
  return item?.currency || item?.listingCurrency || item?.minimumOfferCurrency || 'USD';
}

function computeItemOfferPrice(item, discountType, percentOff, amountOff) {
  const current = listingCurrentPrice(item);
  if (!Number.isFinite(current) || current <= 0) return null;
  if (discountType === 'percent') {
    const pct = parseFloat(percentOff);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return parseFloat((current * (1 - pct / 100)).toFixed(2));
  }
  const amt = parseFloat(amountOff);
  if (!Number.isFinite(amt) || amt <= 0) return null;
  const next = parseFloat((current - amt).toFixed(2));
  return next > 0 ? next : null;
}

export default function SendOfferEligiblePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sellerIdFromUrl = searchParams.get('sellerId') || '';

  const [loading, setLoading] = useState(false);
  const [eligibleItems, setEligibleItems] = useState([]);
  const [eligibleSummary, setEligibleSummary] = useState({ stores: 0, totalItems: 0, failedStores: 0 });
  const [eligibleError, setEligibleError] = useState('');
  const [eligibleMarketplace, setEligibleMarketplace] = useState('EBAY_US');
  const [stores, setStores] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState(sellerIdFromUrl);

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendTargets, setSendTargets] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [discountType, setDiscountType] = useState('percent');
  const [percentOff, setPercentOff] = useState('');
  const [amountOff, setAmountOff] = useState('');
  const [sendAutomated, setSendAutomated] = useState(true);
  const [durationDays, setDurationDays] = useState(7);
  const [offerMessage, setOfferMessage] = useState(DEFAULT_OFFER_MESSAGE);
  const [allowCounter, setAllowCounter] = useState(true);
  const [itemPanelTab, setItemPanelTab] = useState(0);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    setSelectedSellerId(sellerIdFromUrl);
  }, [sellerIdFromUrl]);

  useEffect(() => {
    const loadStores = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setStores(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load stores:', error);
        setStores([]);
      }
    };
    loadStores();
  }, []);

  const loadEligible = useCallback(async () => {
    setLoading(true);
    setEligibleError('');
    setSelectedKeys(new Set());
    try {
      const { data } = await api.get('/ebay/negotiation/eligible-items', {
        params: {
          limit: 200,
          offset: 0,
          ...(selectedSellerId ? { sellerId: selectedSellerId } : {}),
        },
      });
      setEligibleItems(Array.isArray(data?.items) ? data.items : []);
      setEligibleSummary({
        stores: Number(data?.summary?.stores || 0),
        totalItems: Number(data?.summary?.totalItems || 0),
        failedStores: Number(data?.summary?.failedStores || 0),
      });
      setEligibleMarketplace(String(data?.request?.marketplace || data?.filters?.marketplaceId || 'EBAY_US'));
    } catch (error) {
      console.error('Failed to fetch eligible offers:', error);
      setEligibleItems([]);
      setEligibleSummary({ stores: 0, totalItems: 0, failedStores: 0 });
      setEligibleError(
        error?.response?.data?.error
        || error?.response?.data?.details
        || 'Failed to fetch eligible listings'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedSellerId]);

  useEffect(() => {
    loadEligible();
  }, [loadEligible]);

  const handleStoreChange = (nextSellerId) => {
    setSelectedSellerId(nextSellerId);
    const next = new URLSearchParams(searchParams);
    if (nextSellerId) next.set('sellerId', nextSellerId);
    else next.delete('sellerId');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    setSelectedKeys(new Set());
    if (selectedSellerId) handleStoreChange('');
  };

  const selectableItems = useMemo(
    () => eligibleItems.filter((item) => item.listingId && item.sellerId),
    [eligibleItems]
  );
  const allSelectableSelected =
    selectableItems.length > 0 && selectableItems.every((item) => selectedKeys.has(itemRowKey(item)));
  const someSelectableSelected = selectableItems.some((item) => selectedKeys.has(itemRowKey(item)));

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedKeys(new Set(selectableItems.map(itemRowKey)));
    } else {
      setSelectedKeys(new Set());
    }
  };

  const toggleSelectRow = (item) => {
    const key = itemRowKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetOfferForm = () => {
    setDiscountType('percent');
    setPercentOff('');
    setAmountOff('');
    setSendAutomated(true);
    setDurationDays(7);
    setOfferMessage(DEFAULT_OFFER_MESSAGE);
    setAllowCounter(true);
    setItemPanelTab(0);
  };

  const openSendDialog = (items) => {
    const list = (Array.isArray(items) ? items : [items]).filter((item) => item?.listingId && item?.sellerId);
    if (!list.length) return;
    setSendTargets(list);
    resetOfferForm();
    setSendDialogOpen(true);
  };

  const openSendDialogForSelected = () => {
    const selected = eligibleItems.filter((item) => selectedKeys.has(itemRowKey(item)) && item.listingId && item.sellerId);
    if (!selected.length) {
      setSnackbar({ open: true, message: 'Select at least one listing', severity: 'warning' });
      return;
    }
    openSendDialog(selected);
  };

  const closeSendDialog = () => {
    if (sendingOffer) return;
    setSendDialogOpen(false);
    setSendTargets([]);
  };

  const previewTarget = sendTargets[0] || null;
  const currentPrice = listingCurrentPrice(previewTarget);
  const listingCurrency = listingCurrencyOf(previewTarget);
  const computedOffer = useMemo(() => {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
    if (discountType === 'percent') {
      const pct = parseFloat(percentOff);
      if (!Number.isFinite(pct) || pct <= 0) return null;
      return parseFloat((currentPrice * (1 - pct / 100)).toFixed(2));
    }
    const amt = parseFloat(amountOff);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return parseFloat((currentPrice - amt).toFixed(2));
  }, [currentPrice, discountType, percentOff, amountOff]);

  const handleSendOffer = async () => {
    if (!sendTargets.length) return;

    const shared = {
      quantity: 1,
      message: offerMessage || undefined,
      allowCounter,
      offerDurationDays: sendAutomated ? durationDays : undefined,
    };

    if (discountType === 'percent') {
      const pct = parseFloat(percentOff);
      if (!Number.isFinite(pct) || pct < 5 || pct > 99) {
        setSnackbar({ open: true, message: 'Percent off must be between 5 and 99', severity: 'warning' });
        return;
      }
      shared.discountPercentage = pct;
    } else {
      const amt = parseFloat(amountOff);
      if (!Number.isFinite(amt) || amt <= 0) {
        setSnackbar({ open: true, message: 'Enter a valid amount off', severity: 'warning' });
        return;
      }
      const invalid = sendTargets.some((item) => {
        const price = listingCurrentPrice(item);
        return !Number.isFinite(price) || price <= amt;
      });
      if (invalid) {
        setSnackbar({
          open: true,
          message: 'Amount off must be less than each selected listing’s current price',
          severity: 'warning',
        });
        return;
      }
      shared.amountOff = amt;
    }

    setSendingOffer(true);
    let sent = 0;
    const failures = [];
    try {
      for (const item of sendTargets) {
        const payload = {
          ...shared,
          sellerId: item.sellerId,
          listingId: item.listingId,
          currency: listingCurrencyOf(item),
        };
        if (discountType === 'amount') {
          const price = listingCurrentPrice(item);
          payload.price = parseFloat((price - shared.amountOff).toFixed(2));
          delete payload.discountPercentage;
        }
        delete payload.amountOff;
        try {
          await api.post('/ebay/eligible-offers/send', payload);
          sent += 1;
        } catch (error) {
          failures.push({
            listingId: item.listingId,
            error: error?.response?.data?.details || error?.response?.data?.error || 'Failed',
          });
        }
      }

      if (failures.length === 0) {
        setSnackbar({
          open: true,
          message: sent === 1 ? 'Offer sent to interested buyers' : `Offers sent for ${sent} listings`,
          severity: 'success',
        });
        setSendDialogOpen(false);
        setSendTargets([]);
        setSelectedKeys(new Set());
        await loadEligible();
      } else {
        setSnackbar({
          open: true,
          message: `Sent ${sent}, failed ${failures.length}: ${failures[0].listingId} (${failures[0].error})`,
          severity: sent ? 'warning' : 'error',
        });
        if (sent > 0) await loadEligible();
      }
    } finally {
      setSendingOffer(false);
    }
  };

  const formatPrice = (value, currency) => {
    if (typeof value !== 'number') return '-';
    if (!currency) return value.toFixed(2);
    return `${currency} ${value.toFixed(2)}`;
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${date}\nat ${time}`;
  };

  const formatTimeLeft = (value) => {
    if (!value || typeof value !== 'string') return '-';
    const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!match) return value;
    const days = Number(match[1] || 0);
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const seconds = Number(match[4] || 0);
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds) parts.push(`${seconds}s`);
    return parts.length === 0 ? '0s' : parts.join(' ');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Button
          component={RouterLink}
          to="/admin/store-listings"
          startIcon={<ArrowBackIcon />}
          variant="text"
          sx={{ textTransform: 'none' }}
        >
          Store Listings
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Send Offer Eligible
        </Typography>
      </Box>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Store</InputLabel>
          <Select
            label="Store"
            value={selectedSellerId}
            onChange={(e) => handleStoreChange(e.target.value)}
          >
            <MenuItem value="">All Stores</MenuItem>
            {stores.map((store) => (
              <MenuItem key={store._id} value={store._id}>
                {store?.user?.username || store?.username || store._id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadEligible} disabled={loading}>
          Refresh
        </Button>
        <Button
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={clearFilters}
          disabled={loading || (!selectedSellerId && selectedKeys.size === 0)}
          sx={{ textTransform: 'none' }}
        >
          Clear
        </Button>
        <Button
          variant="contained"
          onClick={openSendDialogForSelected}
          disabled={loading || selectedKeys.size === 0}
          sx={{ textTransform: 'none' }}
        >
          Send offer{selectedKeys.size > 1 ? 's' : ''}{selectedKeys.size ? ` (${selectedKeys.size})` : ''}
        </Button>
      </Paper>

      <Typography variant="body2" sx={{ mb: 1.5 }}>
        Stores: {eligibleSummary.stores} | Eligible listings: {eligibleSummary.totalItems} | Failed stores:{' '}
        {eligibleSummary.failedStores} | Marketplace: {eligibleMarketplace}
      </Typography>

      {eligibleError ? <Alert severity="error" sx={{ mb: 1.5 }}>{eligibleError}</Alert> : null}

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={allSelectableSelected}
                      indeterminate={someSelectableSelected && !allSelectableSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      disabled={!selectableItems.length}
                      inputProps={{ 'aria-label': 'Select all eligible listings' }}
                    />
                  </TableCell>
                  <TableCell>Store</TableCell>
                  <TableCell>Listing ID</TableCell>
                  <TableCell>Marketplace</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Interested</TableCell>
                  <TableCell>Start date</TableCell>
                  <TableCell>Time left</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eligibleItems.map((item, idx) => {
                  const rowKey = itemRowKey(item);
                  const canSelect = Boolean(item.listingId && item.sellerId);
                  const selected = selectedKeys.has(rowKey);
                  return (
                  <TableRow
                    key={`${item.sellerId || 'store'}-${item.listingId || idx}`}
                    hover
                    selected={selected}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selected}
                        disabled={!canSelect}
                        onChange={() => toggleSelectRow(item)}
                        inputProps={{ 'aria-label': `Select listing ${item.listingId || idx + 1}` }}
                      />
                    </TableCell>
                    <TableCell>{item.storeName || item.sellerUsername || '-'}</TableCell>
                    <TableCell>{item.listingId || '-'}</TableCell>
                    <TableCell>{item.marketplaceId || eligibleMarketplace || '-'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', maxWidth: 360 }}>
                        <Box
                          component="img"
                          src={item.imageUrl || 'https://via.placeholder.com/48?text=No+Img'}
                          alt={item.title || 'listing'}
                          sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #eee', flexShrink: 0 }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                          {item.title || '-'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {typeof item.price === 'number'
                        ? formatPrice(item.price, item.currency)
                        : (item.listingPrice != null ? `${item.listingCurrency || item.currency || ''} ${item.listingPrice}`.trim() : '-')}
                    </TableCell>
                    <TableCell>
                      {item.interestedBuyers != null ? Number(item.interestedBuyers) : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'pre-line' }}>{formatDateTime(item.startTime)}</TableCell>
                    <TableCell sx={{ color: '#d32f2f', fontWeight: 600 }}>
                      {item.timeLeft ? formatTimeLeft(item.timeLeft) : '-'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!item.listingId || !item.sellerId}
                        onClick={() => openSendDialog(item)}
                        sx={{ textTransform: 'none', mr: 0.5 }}
                      >
                        Send offer
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        component="a"
                        href={item.listingId ? `https://www.ebay.com/itm/${item.listingId}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        disabled={!item.listingId}
                        sx={{ textTransform: 'none' }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {!eligibleItems.length && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      No eligible listings found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog
        open={sendDialogOpen}
        onClose={closeSendDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ position: 'relative', pr: 6, pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Send offers
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Encourage interested buyers to purchase your items.
          </Typography>
          <IconButton
            aria-label="Close"
            onClick={closeSendDialog}
            disabled={sendingOffer}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1, pb: 1 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 3,
              alignItems: 'start',
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.25, fontWeight: 700 }}>
                Discount
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
                <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    label="Type"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    disabled={sendingOffer}
                  >
                    <MenuItem value="percent">Percent off</MenuItem>
                    <MenuItem value="amount">Amount off</MenuItem>
                  </Select>
                </FormControl>
                {discountType === 'percent' ? (
                  <TextField
                    label="Percent off"
                    type="number"
                    size="small"
                    value={percentOff}
                    onChange={(e) => setPercentOff(e.target.value)}
                    disabled={sendingOffer}
                    sx={{ width: 150 }}
                    inputProps={{ min: 5, max: 99, step: '1' }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                  />
                ) : (
                  <TextField
                    label="Amount off"
                    type="number"
                    size="small"
                    value={amountOff}
                    onChange={(e) => setAmountOff(e.target.value)}
                    disabled={sendingOffer}
                    sx={{ width: 150 }}
                    inputProps={{ min: 0.01, step: '0.01' }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">{currencySymbol(listingCurrency)}</InputAdornment>
                      ),
                    }}
                  />
                )}
              </Box>
              {computedOffer != null ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, mt: -1.5 }}>
                  Offer price: {formatMoney(computedOffer, listingCurrency)}
                  {Number.isFinite(currentPrice) ? ` (current ${formatMoney(currentPrice, listingCurrency)})` : ''}
                </Typography>
              ) : null}

              <FormControlLabel
                sx={{ alignItems: 'flex-start', ml: 0, mb: 1 }}
                control={(
                  <Checkbox
                    checked={sendAutomated}
                    onChange={(e) => setSendAutomated(e.target.checked)}
                    disabled={sendingOffer}
                    sx={{ pt: 0.25 }}
                  />
                )}
                label={(
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Send automated offer</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Automatically send offers to interested buyers.
                    </Typography>
                  </Box>
                )}
              />
              {sendAutomated ? (
                <FormControl size="small" sx={{ minWidth: 180, mb: 2, ml: 4 }}>
                  <InputLabel>Duration</InputLabel>
                  <Select
                    label="Duration"
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    disabled={sendingOffer}
                  >
                    {OFFER_DURATION_OPTIONS.map((days) => (
                      <MenuItem key={days} value={days}>
                        {days} {days === 1 ? 'day' : 'days'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}

              <FormControlLabel
                sx={{ alignItems: 'flex-start', ml: 0, mb: 2 }}
                control={(
                  <Checkbox
                    checked={allowCounter}
                    onChange={(e) => setAllowCounter(e.target.checked)}
                    disabled={sendingOffer}
                    sx={{ pt: 0.25 }}
                  />
                )}
                label={(
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Allow counteroffers</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Increase buyer engagement by 25%.
                    </Typography>
                  </Box>
                )}
              />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Message
              </Typography>
              <TextField
                fullWidth
                size="small"
                multiline
                minRows={3}
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                disabled={sendingOffer}
                inputProps={{ maxLength: 2000 }}
              />
            </Box>

            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {sendTargets.length} item{sendTargets.length === 1 ? '' : 's'} selected
                </Typography>
                <Tabs
                  value={itemPanelTab}
                  onChange={(_e, v) => setItemPanelTab(v)}
                  sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 600 } }}
                >
                  <Tab label={`Eligible (${sendTargets.length})`} />
                  <Tab label="Not eligible (0)" />
                </Tabs>
              </Box>
              <Box sx={{ px: 2, py: 1.5 }}>
                {itemPanelTab === 0 ? (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Ready to send</Typography>
                      <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </Box>
                    <Box sx={{ maxHeight: 280, overflowY: 'auto', pr: 0.5 }}>
                      {sendTargets.map((item, idx) => {
                        const price = listingCurrentPrice(item);
                        const currency = listingCurrencyOf(item);
                        const offerPrice = computeItemOfferPrice(item, discountType, percentOff, amountOff);
                        return (
                          <Box
                            key={itemRowKey(item) || idx}
                            sx={{ display: 'flex', gap: 1.5, mb: idx === sendTargets.length - 1 ? 0 : 1.5 }}
                          >
                            <Box
                              component="img"
                              src={item.imageUrl || 'https://via.placeholder.com/72?text=No+Img'}
                              alt={item.title || 'listing'}
                              sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: '1px solid #eee', flexShrink: 0 }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}>
                                {item.title || item.listingId || 'Listing'}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                Current: {formatMoney(price, currency)}
                                {' + Calculated shipping'}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ display: 'block', fontWeight: 700, color: offerPrice != null ? 'success.main' : 'text.secondary' }}
                              >
                                Offer price: {offerPrice != null ? formatMoney(offerPrice, currency) : '—'}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No ineligible items in this send.
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeSendDialog} disabled={sendingOffer} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSendOffer}
            disabled={sendingOffer || (discountType === 'percent' ? !percentOff : !amountOff)}
            sx={{ textTransform: 'none', minWidth: 120 }}
          >
            {sendingOffer
              ? `Sending… (${sendTargets.length})`
              : `Send offer${sendTargets.length > 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={8000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
