import { useState } from 'react';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import { sortSellersByName, sellerDisplayName } from '../../lib/sellersSort';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers';

export default function EbayInventoryManagerPage() {
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>eBay Inventory Manager</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Look up a listing by Item ID and adjust its live quantity on eBay.
      </Typography>

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
