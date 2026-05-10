import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import api from '../../lib/api';

/** Overlay Negotiation eligible rows with data already shown on Store Listings (same listingId ↔ itemId). */
function mergeEligibleItemsWithStoreRows(eligibleItems, storeRows) {
  const byItemId = new Map();
  for (const r of storeRows || []) {
    const id = r?.itemId != null ? String(r.itemId).trim() : '';
    if (id) byItemId.set(id, r);
  }
  return eligibleItems.map((item) => {
    const lid = item?.listingId != null ? String(item.listingId).trim() : '';
    const row = lid ? byItemId.get(lid) : null;
    if (!row) return item;

    return {
      ...item,
      title: row.title ?? item.title,
      imageUrl: row.mainImageUrl ?? item.imageUrl,
      price: typeof row.currentPrice === 'number' ? row.currentPrice : item.price,
      currency: row.currency ?? item.currency,
      soldQuantity: typeof row.soldQuantity === 'number' ? row.soldQuantity : item.soldQuantity,
      startTime: row.startTime ?? item.startTime,
      timeLeft: (typeof row.timeLeft === 'string' && row.timeLeft) ? row.timeLeft : item.timeLeft,
      storeName: item.storeName || row.sellerName || item.sellerUsername,
    };
  });
}

export default function StoreListingsPage() {
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
  const [sendingOfferEligible, setSendingOfferEligible] = useState(false);
  const [eligibleDialogOpen, setEligibleDialogOpen] = useState(false);
  const [eligibleItems, setEligibleItems] = useState([]);
  const [eligibleSummary, setEligibleSummary] = useState({ stores: 0, totalItems: 0, failedStores: 0 });
  const [eligibleError, setEligibleError] = useState('');
  const [eligibleMarketplace, setEligibleMarketplace] = useState('EBAY_US');
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ totalAmount: 0, totalQuantity: 0 });
  const [customizeAnchorEl, setCustomizeAnchorEl] = useState(null);
  const [sortBy, setSortBy] = useState('startDate');
  const [sortOrder, setSortOrder] = useState('desc');
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
      });
    } catch (error) {
      console.error('Failed to load store listings:', error);
      setRows([]);
      setTotal(0);
      setSummary({ totalAmount: 0, totalQuantity: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, selectedSellerId, sortBy, sortOrder]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VISIBLE, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const handleSyncAllStores = async () => {
    setSyncing(true);
    try {
      await api.post('/ebay/sync-all-sellers-listings');
      await loadListings();
    } catch (error) {
      console.error('Failed to start all-store sync:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleSendOfferEligible = async () => {
    setEligibleDialogOpen(true);
    setSendingOfferEligible(true);
    setEligibleError('');
    setEligibleItems([]);
    setEligibleSummary({ stores: 0, totalItems: 0, failedStores: 0 });
    setEligibleMarketplace('EBAY_US');
    try {
      const { data } = await api.get('/ebay/negotiation/eligible-items', {
        params: {
          sellerId: selectedSellerId || undefined,
          limit: 200,
          offset: 0,
        },
      });
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      setEligibleItems(mergeEligibleItemsWithStoreRows(rawItems, rows));
      setEligibleSummary({
        stores: Number(data?.summary?.stores || 0),
        totalItems: Number(data?.summary?.totalItems || 0),
        failedStores: Number(data?.summary?.failedStores || 0),
      });
      setEligibleMarketplace(String(data?.request?.marketplace || data?.filters?.marketplaceId || 'EBAY_US'));
    } catch (error) {
      console.error('Failed to fetch eligible offers:', error);
      const message = error?.response?.data?.error || 'Failed to fetch eligible listings';
      setEligibleError(message);
    } finally {
      setSendingOfferEligible(false);
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
  const formattedTotalAmount = summary.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedTotalQty = summary.totalQuantity.toLocaleString('en-US');

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
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Store Listings
      </Typography>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Store</InputLabel>
          <Select
            label="Store"
            value={selectedSellerId}
            onChange={(e) => {
              setSelectedSellerId(e.target.value);
              setPage(0);
            }}
          >
            <MenuItem value="">All Stores</MenuItem>
            {stores.map((store) => (
              <MenuItem key={store._id} value={store._id}>
                {store?.user?.username || store?.username || store._id}
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
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadListings} disabled={loading}>
          Refresh
        </Button>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={handleSyncAllStores} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync All Stores'}
        </Button>
        <Button
          variant="outlined"
          onClick={handleSendOfferEligible}
          disabled={sendingOfferEligible}
        >
          {sendingOfferEligible ? 'Fetching...' : 'Send Offer Eligible'}
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

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #eee' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Results: {resultStart}-{resultEnd} of {total.toLocaleString('en-US')} | Total: ${formattedTotalAmount} | Qty:{formattedTotalQty}
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

      <Dialog
        open={eligibleDialogOpen}
        onClose={() => setEligibleDialogOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>
          Send Offer Eligible Listings
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Stores: {eligibleSummary.stores} | Eligible listings: {eligibleSummary.totalItems} | Failed stores: {eligibleSummary.failedStores} | Marketplace: {eligibleMarketplace}
          </Typography>
          {eligibleError ? <Alert severity="error" sx={{ mb: 1.5 }}>{eligibleError}</Alert> : null}
          {sendingOfferEligible ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={26} />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Store</TableCell>
                    <TableCell>Listing ID</TableCell>
                    <TableCell>Marketplace</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Sold qty</TableCell>
                    <TableCell>Start date</TableCell>
                    <TableCell>Time left</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eligibleItems.map((item, idx) => (
                    <TableRow key={`${item.sellerId || 'store'}-${item.listingId || idx}`}>
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
                          : (item.listingPrice != null ? `${item.listingCurrency || ''} ${item.listingPrice}`.trim() : '-')}
                      </TableCell>
                      <TableCell>
                        {item.soldQuantity != null ? Number(item.soldQuantity) : '-'}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-line' }}>{formatDateTime(item.startTime)}</TableCell>
                      <TableCell sx={{ color: '#d32f2f', fontWeight: 600 }}>{item.timeLeft ? formatTimeLeft(item.timeLeft) : '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
                          View listing
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!eligibleItems.length && (
                    <TableRow>
                      <TableCell colSpan={9} align="center">No eligible listings found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
