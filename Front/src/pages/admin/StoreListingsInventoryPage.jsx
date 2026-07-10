import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Chip,
  LinearProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  Snackbar,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import api from '../../lib/api';

function getSyncProgressPercent(sync) {
  const total = Number(sync?.sellersTotal) || 0;
  if (total <= 0) return 0;
  const complete = Number(sync?.sellersComplete) || 0;
  const curPage = Number(sync?.currentPage) || 0;
  const totalPages = Number(sync?.currentTotalPages) || 0;
  const storeFraction = totalPages > 0 ? Math.min(curPage / totalPages, 1) : 0;
  return Math.min(100, Math.round(((complete + storeFraction) / total) * 100));
}

function formatSyncStatusLine(sync) {
  const complete = Number(sync?.sellersComplete) || 0;
  const total = Number(sync?.sellersTotal) || 0;
  const curPage = Number(sync?.currentPage) || 0;
  const totalPages = Number(sync?.currentTotalPages) || 0;
  const storeNum = complete + (sync?.currentSeller ? 1 : 0);
  const seller = sync?.currentSeller ? String(sync.currentSeller) : 'stores';
  const parts = [`Syncing: ${seller}`];
  if (totalPages > 0) {
    parts.push(`page ${curPage}/${totalPages}`);
  }
  if (total > 0) {
    parts.push(`store ${storeNum} of ${total}`);
  }
  return parts.join(' · ');
}

export default function StoreListingsInventoryPage({ embedded = false, active = true }) {
  const navigate = useNavigate();
  const ALL_COLUMNS = [
    { key: 'actions', label: 'Actions' },
    { key: 'item', label: 'Item' },
    { key: 'currentPrice', label: 'Current price' },
    { key: 'availableQty', label: 'Available quantity' },
    { key: 'soldQty', label: 'Sold quantity' },
    { key: 'views30d', label: 'Views (30 days)' },
    { key: 'promoted', label: 'Promoted Listings' },
    { key: 'startDate', label: 'Start date' },
    { key: 'watch', label: 'Watchers' },
    { key: 'sku', label: 'Custom label (SKU)' },
    { key: 'timeLeft', label: 'Time left' },
    { key: 'seller', label: 'Seller' },
  ];

  const STORAGE_KEY_ORDER = 'storeListings.columnOrder';
  const STORAGE_KEY_VISIBLE = 'storeListings.visibleColumns';
  const SORTABLE_COLUMNS = new Set(['currentPrice', 'availableQty', 'soldQty', 'views30d', 'startDate', 'watch', 'timeLeft']);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const prevSyncRunningRef = useRef(false);
  const [search, setSearch] = useState('');
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalQuantity: 0,
    totalSoldQuantity: 0,
    totalViews30d: 0,
    totalWatchers: 0,
    promotedCount: 0,
    inventoryValue: 0,
    uniqueStoreCount: 0,
  });
  const [customizeAnchorEl, setCustomizeAnchorEl] = useState(null);
  const [sortBy, setSortBy] = useState('startDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [storeStatus, setStoreStatus] = useState({ sync: null, stores: [] });
  const [storeStatusLoading, setStoreStatusLoading] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VISIBLE);
      if (!saved) return Object.fromEntries(ALL_COLUMNS.map((col) => [col.key, true]));
      const parsed = JSON.parse(saved);
      const defaults = Object.fromEntries(ALL_COLUMNS.map((col) => [col.key, true]));
      return { ...defaults, ...parsed };
    } catch {
      return Object.fromEntries(ALL_COLUMNS.map((col) => [col.key, true]));
    }
  });
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDER);
      if (!saved) return ALL_COLUMNS.map((col) => col.key);
      const parsed = JSON.parse(saved);
      const validKeys = ALL_COLUMNS.map((col) => col.key);
      const filtered = Array.isArray(parsed) ? parsed.filter((k) => validKeys.includes(k)) : [];
      const missing = validKeys.filter((k) => !filtered.includes(k));
      return [...filtered, ...missing];
    } catch {
      return ALL_COLUMNS.map((col) => col.key);
    }
  });

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ebay/all-store-listings', {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: search || undefined,
          sellerId: selectedSellerId || undefined,
          sortBy,
          sortOrder,
        },
      });
      setRows(data?.listings || []);
      setTotal(data?.pagination?.total || 0);
      setSummary({
        totalAmount: Number(data?.summary?.totalAmount || 0),
        totalQuantity: Number(data?.summary?.totalQuantity || 0),
        totalSoldQuantity: Number(data?.summary?.totalSoldQuantity || 0),
        totalViews30d: Number(data?.summary?.totalViews30d || 0),
        totalWatchers: Number(data?.summary?.totalWatchers || 0),
        promotedCount: Number(data?.summary?.promotedCount || 0),
        inventoryValue: Number(data?.summary?.inventoryValue || 0),
        uniqueStoreCount: Number(data?.summary?.uniqueStoreCount || 0),
      });
    } catch (error) {
      console.error('Failed to load store listings:', error);
      const msg =
        error?.response?.data?.error
        || error?.response?.data?.message
        || error?.message
        || 'Failed to load store listings';
      setSnackbar({ open: true, message: msg, severity: 'error' });
      setRows([]);
      setTotal(0);
      setSummary({
        totalAmount: 0,
        totalQuantity: 0,
        totalSoldQuantity: 0,
        totalViews30d: 0,
        totalWatchers: 0,
        promotedCount: 0,
        inventoryValue: 0,
        uniqueStoreCount: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, selectedSellerId, sortBy, sortOrder]);

  const loadStoreStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStoreStatusLoading(true);
    try {
      const { data } = await api.get('/ebay/store-listings/store-status');
      setStoreStatus({
        sync: data?.sync || null,
        stores: Array.isArray(data?.stores) ? data.stores : [],
      });
    } catch (error) {
      console.error('Failed to load store status:', error);
    } finally {
      if (!silent) setStoreStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    loadListings();
  }, [active, loadListings]);

  useEffect(() => {
    if (!active) return;
    loadStoreStatus();
  }, [active, loadStoreStatus]);

  useEffect(() => {
    if (!active || !storeStatus.sync?.running) return undefined;

    setSyncing(true);
    const intervalId = setInterval(() => {
      void loadStoreStatus({ silent: true });
    }, 3000);

    return () => clearInterval(intervalId);
  }, [active, storeStatus.sync?.running, loadStoreStatus]);

  useEffect(() => {
    const running = Boolean(storeStatus.sync?.running);
    if (prevSyncRunningRef.current && !running) {
      setSyncing(false);
      void loadListings();
      const errCount = Array.isArray(storeStatus.sync?.errors) ? storeStatus.sync.errors.length : 0;
      setSnackbar({
        open: true,
        message: errCount
          ? `Sync finished with ${errCount} seller error(s). Table refreshed.`
          : 'Sync finished. Table refreshed.',
        severity: errCount ? 'warning' : 'success',
      });
    }
    prevSyncRunningRef.current = running;
  }, [storeStatus.sync?.running, storeStatus.sync?.errors, loadListings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VISIBLE, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const handleSyncAllStores = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/ebay/sync-all-sellers-listings');
      if (!data?.success) {
        setSnackbar({
          open: true,
          message: data?.message || 'Sync did not start',
          severity: 'error',
        });
        setSyncing(false);
        return;
      }
      setSnackbar({
        open: true,
        message: data?.message || `Sync started for ${data.sellersTotal} seller(s).`,
        severity: 'info',
      });
      await loadStoreStatus({ silent: true });
    } catch (error) {
      console.error('Failed to start all-store sync:', error);
      const msg =
        error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || 'Failed to start sync';
      setSnackbar({ open: true, message: msg, severity: 'error' });
      setSyncing(false);
    }
  };

  const openSendOfferEligible = () => {
    const params = new URLSearchParams();
    if (selectedSellerId) params.set('sellerId', selectedSellerId);
    const qs = params.toString();
    navigate(qs ? `/admin/send-offer-eligible?${qs}` : '/admin/send-offer-eligible');
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

    // eBay returns ISO-8601 durations like P9DT5H38M4S
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

    if (parts.length === 0) return '0s';
    return parts.join(' ');
  };

  const isColumnVisible = (key) => visibleColumns[key] !== false;

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !isColumnVisible(key) }));
  };

  const moveColumn = (key, direction) => {
    setColumnOrder((prev) => {
      const index = prev.indexOf(key);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const orderedColumns = columnOrder
    .map((key) => ALL_COLUMNS.find((col) => col.key === key))
    .filter(Boolean);

  const resultStart = total === 0 ? 0 : (page * rowsPerPage) + 1;
  const resultEnd = total === 0 ? 0 : Math.min((page * rowsPerPage) + rows.length, total);
  const promotedPct = total > 0 ? Math.round((summary.promotedCount / total) * 100) : 0;

  const formatUsd = (n) =>
    Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatInt = (n) => Number(n || 0).toLocaleString('en-US');

  const handleSort = (key) => {
    if (!SORTABLE_COLUMNS.has(key)) return;
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortOrder('asc');
  };

  return (
    <Box sx={{ px: embedded ? { xs: 2, sm: 3 } : 0, pt: embedded ? 1.5 : 0, pb: embedded ? { xs: 2, sm: 3 } : 0 }}>
      {!embedded ? (
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Store Listings
        </Typography>
      ) : null}

      {!loading && total === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No listings in the database for this view. Data comes from <strong>Sync All Stores</strong> (eBay{' '}
          <code>GetSellerList</code> → MongoDB), not a live API call. Each store needs a working eBay OAuth
          connection. If only one store (e.g. raveoli) ever had data, other stores likely failed during sync —
          check backend logs or run sync again after fixing token errors.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Active listings
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(total)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Matches store / search filters
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Unique stores
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(summary.uniqueStoreCount)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Distinct sellers in this result set
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Available units
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(summary.totalQuantity)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Sum of on-hand qty
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Inventory at list
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatUsd(summary.inventoryValue)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Σ (price × available qty)
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Sold (reported)
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(summary.totalSoldQuantity)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Σ sold quantity on listings
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              30-day views
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(summary.totalViews30d)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Σ views (30d) where present
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Watchers
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(summary.totalWatchers)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Σ watcher count
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" display="block">
              Promoted listings
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatInt(summary.promotedCount)}
              {total > 0 ? (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5, fontWeight: 500 }}>
                  ({promotedPct}%)
                </Typography>
              ) : null}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              eBay Promoted Listings = on
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Store</InputLabel>
          <Select
            label="Store"
            value={String(selectedSellerId)}
            onChange={(e) => {
              setSelectedSellerId(e.target.value);
              setPage(0);
            }}
          >
            <MenuItem value="">All Stores</MenuItem>
            {storeStatus.stores.map((store) => (
              <MenuItem key={String(store.sellerId)} value={String(store.sellerId)}>
                {store.sellerName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="Search by item, SKU, title"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          sx={{ minWidth: 280 }}
        />
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => { loadListings(); loadStoreStatus(); }} disabled={loading}>
          Refresh
        </Button>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={handleSyncAllStores} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync All Stores'}
        </Button>
        <Button variant="outlined" onClick={openSendOfferEligible}>
          Send Offer Eligible
        </Button>
        <Button variant="outlined" onClick={(e) => setCustomizeAnchorEl(e.currentTarget)}>
          Customize Table
        </Button>
      </Paper>

      <Menu
        anchorEl={customizeAnchorEl}
        open={Boolean(customizeAnchorEl)}
        onClose={() => setCustomizeAnchorEl(null)}
      >
        <Box sx={{ p: 1, minWidth: 290 }}>
          {orderedColumns.map((col, index) => (
            <Box key={col.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <FormControlLabel
                control={(
                  <Checkbox
                    size="small"
                    checked={isColumnVisible(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />
                )}
                label={col.label}
                sx={{ m: 0, flex: 1 }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Button
                  size="small"
                  onClick={() => moveColumn(col.key, 'up')}
                  disabled={index === 0}
                  sx={{ minWidth: 32, p: 0.5 }}
                >
                  <ArrowUpwardIcon fontSize="inherit" />
                </Button>
                <Button
                  size="small"
                  onClick={() => moveColumn(col.key, 'down')}
                  disabled={index === orderedColumns.length - 1}
                  sx={{ minWidth: 32, p: 0.5 }}
                >
                  <ArrowDownwardIcon fontSize="inherit" />
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      </Menu>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Store sync status
          </Typography>
          <Button size="small" onClick={() => void loadStoreStatus()} disabled={storeStatusLoading}>
            Refresh status
          </Button>
        </Box>

        {storeStatus.sync?.running ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {formatSyncStatusLine(storeStatus.sync)}
            </Typography>
            {Number(storeStatus.sync.totalProcessed) > 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {Number(storeStatus.sync.totalProcessed).toLocaleString()} listings written this run
              </Typography>
            ) : null}
            <LinearProgress
              variant="determinate"
              value={getSyncProgressPercent(storeStatus.sync)}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {getSyncProgressPercent(storeStatus.sync)}% overall
            </Typography>
          </Box>
        ) : null}

        {!storeStatus.sync?.running && storeStatus.sync?.completedAt ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Last sync finished: {formatDateTime(storeStatus.sync.completedAt)}
          </Typography>
        ) : null}

        {storeStatusLoading ? (
          <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Store</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>OAuth</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Listings in DB</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Last polled</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Last sync</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {storeStatus.stores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        No stores in scope for your account.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  storeStatus.stores.map((store) => {
                    const syncErr = store.lastSync?.error;
                    let statusChip = { label: 'OK', color: 'success' };
                    if (!store.hasOAuth) statusChip = { label: 'No OAuth', color: 'error' };
                    else if (syncErr) statusChip = { label: 'Sync failed', color: 'error' };
                    else if (store.listingCount === 0) statusChip = { label: 'Empty', color: 'warning' };

                    return (
                      <TableRow
                        key={store.sellerId}
                        hover
                        selected={String(selectedSellerId) === String(store.sellerId)}
                        sx={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedSellerId(String(store.sellerId));
                          setPage(0);
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {store.sellerName}
                          </Typography>
                          {!store.isStoreActive || !store.userActive ? (
                            <Typography variant="caption" color="warning.main">
                              {!store.isStoreActive ? 'Store inactive' : 'User inactive'}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={store.hasOAuth ? 'Connected' : 'Missing'}
                            color={store.hasOAuth ? 'success' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {store.listingCount.toLocaleString('en-US')}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="caption">
                            {formatDateTime(store.lastAllListingsPolledAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={statusChip.label} color={statusChip.color} variant="outlined" />
                          {store.lastSync && !syncErr ? (
                            <Typography variant="caption" display="block" color="text.secondary">
                              +{store.lastSync.processedCount} processed
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 280 }}>
                          <Typography variant="caption" color="error.main" sx={{ wordBreak: 'break-word' }}>
                            {syncErr || '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #eee' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Showing {resultStart.toLocaleString('en-US')}-{resultEnd.toLocaleString('en-US')} of{' '}
            {total.toLocaleString('en-US')} (page {page + 1}
            {total > 0 ? ` of ${Math.max(1, Math.ceil(total / rowsPerPage))}` : ''})
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" disabled />
                </TableCell>
                {orderedColumns
                  .filter((col) => isColumnVisible(col.key))
                  .map((col) => (
                    <TableCell key={`header-${col.key}`}>
                      {SORTABLE_COLUMNS.has(col.key) ? (
                        <TableSortLabel
                          active={sortBy === col.key}
                          direction={sortBy === col.key ? sortOrder : 'asc'}
                          onClick={() => handleSort(col.key)}
                        >
                          {col.label}
                        </TableSortLabel>
                      ) : (
                        col.label
                      )}
                    </TableCell>
                  ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                    No active listings found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row._id || row.itemId} hover>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" />
                    </TableCell>
                    {orderedColumns
                      .filter((col) => isColumnVisible(col.key))
                      .map((col) => {
                        if (col.key === 'actions') {
                          return (
                            <TableCell key={`${row._id || row.itemId}-actions`} sx={{ whiteSpace: 'nowrap' }}>
                              <Button size="small" variant="outlined" sx={{ minWidth: 52, mr: 0.5, textTransform: 'none' }}>
                                Edit
                              </Button>
                              <Button size="small" variant="text" sx={{ minWidth: 28, p: 0.5 }}>
                                <MoreVertIcon fontSize="small" />
                              </Button>
                            </TableCell>
                          );
                        }
                        if (col.key === 'item') {
                          return (
                            <TableCell key={`${row._id || row.itemId}-item`}>
                              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                                <Box
                                  component="img"
                                  src={row.mainImageUrl || 'https://via.placeholder.com/48?text=No+Img'}
                                  alt={row.title || 'listing'}
                                  sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #eee', flexShrink: 0 }}
                                />
                                <Box sx={{ minWidth: 220 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                                    {row.title || '-'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {row.itemId || '-'}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                          );
                        }
                        if (col.key === 'currentPrice') {
                          return (
                            <TableCell key={`${row._id || row.itemId}-currentPrice`}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {formatPrice(row.currentPrice, row.currency)}
                              </Typography>
                            </TableCell>
                          );
                        }
                        if (col.key === 'availableQty') return <TableCell key={`${row._id || row.itemId}-availableQty`}>{Number(row.quantity ?? 0)}</TableCell>;
                        if (col.key === 'soldQty') return <TableCell key={`${row._id || row.itemId}-soldQty`}>{Number(row.soldQuantity ?? 0)}</TableCell>;
                        if (col.key === 'views30d') return <TableCell key={`${row._id || row.itemId}-views30d`}>{Number(row.views30d ?? 0)}</TableCell>;
                        if (col.key === 'promoted') {
                          const promotedStatus = row.promoted === true
                            ? 'General: Promoted'
                            : row.promoted === false
                              ? 'General: Not promoted'
                              : 'General: No data fetched';
                          return (
                            <TableCell key={`${row._id || row.itemId}-promoted`}>
                              <Typography variant="caption" display="block" sx={{ fontWeight: 700 }}>
                                {promotedStatus}
                              </Typography>
                              <Typography variant="caption" display="block">
                                Your ad rate: {row.adRate != null ? `${row.adRate}%` : '-'}
                              </Typography>
                              <Typography variant="caption" display="block">Suggested ad rate: -</Typography>
                              <Typography variant="caption" display="block" sx={{ textDecoration: 'underline' }}>Edit promoted listing</Typography>
                            </TableCell>
                          );
                        }
                        if (col.key === 'startDate') {
                          return (
                            <TableCell key={`${row._id || row.itemId}-startDate`} sx={{ whiteSpace: 'pre-line' }}>
                              <Typography variant="caption">{formatDateTime(row.startTime)}</Typography>
                            </TableCell>
                          );
                        }
                        if (col.key === 'watch') return <TableCell key={`${row._id || row.itemId}-watch`}>{Number(row.watchCount ?? 0)}</TableCell>;
                        if (col.key === 'sku') return <TableCell key={`${row._id || row.itemId}-sku`}>{row.sku || '-'}</TableCell>;
                        if (col.key === 'timeLeft') {
                          return (
                            <TableCell key={`${row._id || row.itemId}-timeLeft`}>
                              <Typography variant="body2" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                                {formatTimeLeft(row.timeLeft)}
                              </Typography>
                            </TableCell>
                          );
                        }
                        if (col.key === 'seller') return <TableCell key={`${row._id || row.itemId}-seller`}>{row.sellerName || '-'}</TableCell>;
                        return null;
                      })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>

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
