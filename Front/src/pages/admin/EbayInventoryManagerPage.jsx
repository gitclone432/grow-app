import { useMemo, useState } from 'react';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tabs,
  Tab,
  Tooltip,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import { sortSellersByName, sellerDisplayName } from '../../lib/sellersSort';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers';

function SingleItemLookup() {
  const { sellers } = useEbayConnectedSellers();
  const sortedSellers = sortSellersByName(sellers);

  const [itemId, setItemId] = useState('');
  const [pickedSellerId, setPickedSellerId] = useState('');
  const [needsSellerPick, setNeedsSellerPick] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [item, setItem] = useState(null); // { itemId, title, sku, quantity, quantitySold, listingStatus, galleryUrl, viewItemUrl, sellerId, sellerName, hasVariations }
  const [qtyInput, setQtyInput] = useState('');

  const runLookup = async (explicitSellerId) => {
    const id = itemId.trim();
    if (!id) {
      setError('Enter an eBay Item ID');
      return;
    }
    setLoading(true);
    setError('');
    setNeedsSellerPick(false);
    try {
      const params = { itemId: id };
      if (explicitSellerId) params.sellerId = explicitSellerId;
      const { data } = await api.get('/ebay/inventory/lookup', { params });

      if (!data.found) {
        if (data.needsSeller) {
          setNeedsSellerPick(true);
          setItem(null);
          setError(data.message || 'Pick the store this item belongs to.');
        } else {
          setItem(null);
          setError(data.message || 'Item not found');
        }
        return;
      }

      setItem(data);
      setQtyInput(String(data.quantity ?? 0));
    } catch (err) {
      if (err.response?.data?.needsReconnect) {
        setError('This store\'s eBay connection has expired. Reconnect it from Seller Profile, then try again.');
      } else {
        setError(err.response?.data?.error || err.message || 'Lookup failed');
      }
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPickedSellerId('');
    runLookup();
  };

  const handleSellerPickSearch = () => {
    if (!pickedSellerId) return;
    runLookup(pickedSellerId);
  };

  const applyQuantity = async (newQuantity) => {
    if (!item) return;
    const qty = Number(newQuantity);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      setError('Quantity must be a non-negative whole number');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/ebay/inventory/${encodeURIComponent(item.itemId)}/quantity`, {
        sellerId: item.sellerId,
        quantity: qty,
      });
      setItem((prev) => (prev ? { ...prev, quantity: data.quantity } : prev));
      setQtyInput(String(data.quantity));
    } catch (err) {
      if (err.response?.data?.needsReconnect) {
        setError('This store\'s eBay connection has expired. Reconnect it from Seller Profile, then try again.');
      } else {
        setError(err.response?.data?.error || err.message || 'Quantity update failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const step = (delta) => {
    const current = item?.quantity ?? 0;
    const next = Math.max(0, current + delta);
    applyQuantity(next);
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="eBay Item ID"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            fullWidth
            size="small"
            placeholder="e.g. 123456789012"
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            onClick={handleSearch}
            disabled={loading}
            sx={{ minWidth: 140 }}
          >
            {loading ? 'Searching…' : 'Search'}
          </Button>
        </Stack>

        {needsSellerPick && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            <TextField
              select
              label="Store / Seller"
              value={pickedSellerId}
              onChange={(e) => setPickedSellerId(e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value=""><em>Select store...</em></MenuItem>
              {sortedSellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>{sellerDisplayName(s)}</MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              onClick={handleSellerPickSearch}
              disabled={!pickedSellerId || loading}
              sx={{ minWidth: 140 }}
            >
              Search this store
            </Button>
          </Stack>
        )}
      </Paper>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {item && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Avatar
              variant="rounded"
              src={item.galleryUrl || undefined}
              sx={{ width: 72, height: 72, bgcolor: 'action.hover' }}
            >
              {!item.galleryUrl && (item.title || '?').charAt(0)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                {item.title || 'Untitled listing'}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Chip size="small" label={`Item ID: ${item.itemId}`} />
                {item.sku && <Chip size="small" label={`SKU: ${item.sku}`} />}
                {item.listingStatus && (
                  <Chip
                    size="small"
                    label={item.listingStatus}
                    color={item.listingStatus === 'Active' ? 'success' : 'default'}
                  />
                )}
                <Chip size="small" variant="outlined" label={`Store: ${item.sellerName || item.sellerId}`} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Sold: {item.quantitySold ?? 0}
                {item.viewItemUrl && (
                  <>
                    {' • '}
                    <Link href={item.viewItemUrl} target="_blank" rel="noopener">View on eBay</Link>
                  </>
                )}
              </Typography>
            </Box>
          </Stack>

          {item.hasVariations && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This listing has variations. ReviseInventoryStatus sets the item-level quantity only —
              per-variation quantities aren't managed here.
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 90 }}>Live quantity</Typography>
            <IconButton
              size="small"
              onClick={() => step(-1)}
              disabled={saving || (item.quantity ?? 0) <= 0}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <TextField
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value.replace(/[^0-9]/g, ''))}
              size="small"
              sx={{ width: 90 }}
              inputProps={{ inputMode: 'numeric', style: { textAlign: 'center' } }}
              disabled={saving}
            />
            <IconButton size="small" onClick={() => step(1)} disabled={saving}>
              <AddIcon fontSize="small" />
            </IconButton>
            <Button
              variant="contained"
              size="small"
              onClick={() => applyQuantity(qtyInput)}
              disabled={saving || Number(qtyInput) === item.quantity}
            >
              {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
            </Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

function BulkInventoryEditor() {
  const { sellers } = useEbayConnectedSellers();
  const sortedSellers = sortSellersByName(sellers);

  const [sellerId, setSellerId] = useState('');

  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchInfo, setFetchInfo] = useState(null); // { sellerName, count, failed }

  const [listings, setListings] = useState([]); // [{ itemId, title, sku, galleryUrl, price, quantity, quantitySold, hasVariations }]
  const [qtyByItem, setQtyByItem] = useState({}); // itemId -> string input value
  const [selected, setSelected] = useState(() => new Set());
  const [bulkQty, setBulkQty] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState(null); // { total, succeeded, failed, results }

  const dirtyItemIds = useMemo(() => {
    const map = new Map(listings.map((l) => [l.itemId, l.quantity]));
    return Object.entries(qtyByItem)
      .filter(([itemId, val]) => {
        const orig = map.get(itemId);
        const num = Number(val);
        return Number.isFinite(num) && orig != null && num !== orig;
      })
      .map(([itemId]) => itemId);
  }, [qtyByItem, listings]);

  const handleFetch = async () => {
    if (!sellerId) {
      setFetchError('Pick a seller account');
      return;
    }
    setFetching(true);
    setFetchError('');
    setSaveSummary(null);
    try {
      const { data } = await api.get('/ebay/inventory/bulk-fetch-from-exclusions', { params: { sellerId } });
      setListings(data.listings || []);
      setFetchInfo({ sellerName: data.sellerName, count: data.count, failed: data.failed || [] });
      const initialQty = {};
      (data.listings || []).forEach((l) => { initialQty[l.itemId] = String(l.quantity ?? 0); });
      setQtyByItem(initialQty);
      setSelected(new Set());
    } catch (err) {
      if (err.response?.data?.needsReconnect) {
        setFetchError('This store\'s eBay connection has expired. Reconnect it from Seller Profile, then try again.');
      } else {
        setFetchError(err.response?.data?.error || err.message || 'Fetch failed');
      }
      setListings([]);
      setFetchInfo(null);
    } finally {
      setFetching(false);
    }
  };

  const setQty = (itemId, value) => {
    setQtyByItem((prev) => ({ ...prev, [itemId]: value.replace(/[^0-9]/g, '') }));
  };

  const stepQty = (itemId, delta) => {
    const current = Number(qtyByItem[itemId] ?? 0) || 0;
    setQty(itemId, String(Math.max(0, current + delta)));
  };

  const toggleSelected = (itemId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (
      prev.size === listings.length ? new Set() : new Set(listings.map((l) => l.itemId))
    ));
  };

  const applyBulkQtyToSelected = () => {
    if (!selected.size) return;
    const qty = String(Number(bulkQty) || 0);
    if (!Number.isFinite(Number(bulkQty)) || Number(bulkQty) < 0) return;
    setQtyByItem((prev) => {
      const next = { ...prev };
      selected.forEach((itemId) => { next[itemId] = qty; });
      return next;
    });
  };

  const saveChanges = async (itemIds) => {
    if (!itemIds.length) return;
    setSaving(true);
    setSaveSummary(null);
    setFetchError('');
    try {
      const updates = itemIds.map((itemId) => ({ itemId, quantity: Number(qtyByItem[itemId]) }));
      const { data } = await api.post('/ebay/inventory/bulk-quantity', { sellerId, updates });
      setSaveSummary(data);
      if (data.results) {
        setListings((prev) => prev.map((l) => {
          const r = data.results.find((x) => x.itemId === l.itemId);
          return r?.success ? { ...l, quantity: r.quantity } : l;
        }));
      }
    } catch (err) {
      if (err.response?.data?.needsReconnect) {
        setFetchError('This store\'s eBay connection has expired. Reconnect it from Seller Profile, then try again.');
      } else {
        setFetchError(err.response?.data?.error || err.message || 'Bulk update failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
          <TextField
            select
            label="Seller account"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
          >
            <MenuItem value=""><em>Select account...</em></MenuItem>
            {sortedSellers.map((s) => (
              <MenuItem key={s._id} value={s._id}>{sellerDisplayName(s)}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={fetching ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
            onClick={handleFetch}
            disabled={fetching || !sellerId}
            sx={{ minWidth: 140 }}
          >
            {fetching ? 'Fetching…' : 'Fetch'}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Fetches live quantity/price only for this account&apos;s listing IDs already on the{' '}
          <strong>Exclude &lt; $3</strong> page (Settings → Exclude &lt; $3) — no need to page through
          every active listing on the account.
        </Typography>
      </Paper>

      {fetchError && (
        <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setFetchError('')}>
          {fetchError}
        </Alert>
      )}

      {saveSummary && (
        <Alert
          severity={saveSummary.failed ? 'warning' : 'success'}
          sx={{ mb: 3 }}
          onClose={() => setSaveSummary(null)}
        >
          Updated {saveSummary.succeeded} of {saveSummary.total} listing(s) on eBay.
          {saveSummary.failed > 0 && ` ${saveSummary.failed} failed — see rows for details.`}
        </Alert>
      )}

      {fetchInfo && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {fetchInfo.count} excluded listing(s) for {fetchInfo.sellerName || 'this store'}
              {fetchInfo.failed?.length > 0 && ` • ${fetchInfo.failed.length} failed to fetch`}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <TextField
              label="Set quantity"
              value={bulkQty}
              onChange={(e) => setBulkQty(e.target.value.replace(/[^0-9]/g, ''))}
              size="small"
              sx={{ width: 140 }}
              inputProps={{ inputMode: 'numeric' }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={applyBulkQtyToSelected}
              disabled={!selected.size || bulkQty === ''}
            >
              Apply to {selected.size || ''} selected
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={() => saveChanges(dirtyItemIds)}
              disabled={saving || !dirtyItemIds.length}
            >
              {saving ? 'Saving…' : `Save changes (${dirtyItemIds.length})`}
            </Button>
          </Stack>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selected.size > 0 && selected.size < listings.length}
                      checked={listings.length > 0 && selected.size === listings.length}
                      onChange={toggleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Listing</TableCell>
                  <TableCell>SKU</TableCell>
                  <TableCell align="right">Current price</TableCell>
                  <TableCell align="center">Available quantity</TableCell>
                  <TableCell align="center">Save</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {listings.map((l) => {
                  const qty = qtyByItem[l.itemId] ?? '';
                  const isDirty = dirtyItemIds.includes(l.itemId);
                  const result = saveSummary?.results?.find((r) => r.itemId === l.itemId);
                  return (
                    <TableRow key={l.itemId} hover selected={selected.has(l.itemId)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(l.itemId)}
                          onChange={() => toggleSelected(l.itemId)}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            variant="rounded"
                            src={l.galleryUrl || undefined}
                            sx={{ width: 40, height: 40, bgcolor: 'action.hover' }}
                          >
                            {!l.galleryUrl && (l.title || '?').charAt(0)}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.title || 'Untitled listing'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {l.itemId}
                              {l.hasVariations && ' • has variations'}
                            </Typography>
                            {result && !result.success && (
                              <Tooltip title={result.error}>
                                <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                                  Failed: {result.error}
                                </Typography>
                              </Tooltip>
                            )}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>{l.sku || '—'}</TableCell>
                      <TableCell align="right">{l.price != null ? `$${l.price.toFixed(2)}` : '—'}</TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                          <IconButton size="small" onClick={() => stepQty(l.itemId, -1)} disabled={saving || Number(qty) <= 0}>
                            <RemoveIcon fontSize="inherit" />
                          </IconButton>
                          <TextField
                            value={qty}
                            onChange={(e) => setQty(l.itemId, e.target.value)}
                            size="small"
                            sx={{ width: 70 }}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'center' } }}
                            disabled={saving}
                            color={isDirty ? 'primary' : undefined}
                            focused={isDirty || undefined}
                          />
                          <IconButton size="small" onClick={() => stepQty(l.itemId, 1)} disabled={saving}>
                            <AddIcon fontSize="inherit" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => saveChanges([l.itemId])}
                          disabled={saving || !isDirty}
                        >
                          <SaveIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!listings.length && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No Exclude &lt; $3 listing IDs are assigned to this seller account.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}

export default function EbayInventoryManagerPage() {
  const [tab, setTab] = useState('bulk');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>eBay Inventory Manager</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Look up a single listing, or fetch and bulk-edit an account's listings by price.
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab value="bulk" label="Bulk fetch & edit" />
        <Tab value="single" label="Single item lookup" />
      </Tabs>

      {tab === 'bulk' ? <BulkInventoryEditor /> : <SingleItemLookup />}
    </Box>
  );
}
