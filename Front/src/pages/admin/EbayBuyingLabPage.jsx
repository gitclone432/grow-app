import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import { EBAY_BUY_MARKETPLACES } from '../../constants/ebayBuying.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

function priceLabel(price) {
  if (!price || price.value == null) return '';
  const value = Number(price.value);
  if (!Number.isFinite(value)) return String(price.value);
  return `${price.currency || ''} ${value.toFixed(2)}`.trim();
}

function amountLabel(amount) {
  return priceLabel(amount);
}

export default function EbayBuyingLabPage() {
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [itemText, setItemText] = useState('');
  const [items, setItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const [orders, setOrders] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [confirmPlace, setConfirmPlace] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const selectedAccount = accounts.find((row) => row.id === accountId) || null;
  const buyerConnected = Boolean(selectedAccount?.connected);

  const loadStatus = async () => {
    const { data } = await api.get('/ebay-buy/status');
    setStatus(data);
    const rows = data.accounts || [];
    setAccounts(rows);
    const next = rows.find((row) => row.active && row.connected)
      || rows.find((row) => row.connected)
      || rows[0]
      || null;
    setAccountId(next?.id || '');
    if (next?.marketplace) setMarketplace(next.marketplace);
    return data;
  };

  const loadPurchases = async () => {
    try {
      const { data } = await api.get('/ebay-buy/purchases');
      setPurchases(data.purchases || []);
    } catch {
      setPurchases([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadStatus();
        if (!cancelled) await loadPurchases();
      } catch (err) {
        if (!cancelled) {
          setStatus({
            ok: false,
            configured: false,
            error: err.response?.data?.error || err.message || 'Could not check Buy API status',
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onAccountChange = (id) => {
    setAccountId(id);
    const next = accounts.find((row) => row.id === id);
    if (next?.marketplace) setMarketplace(next.marketplace);
    setPreview(null);
  };

  const resolveItems = async () => {
    setLoading('resolve');
    setError('');
    setPreview(null);
    setOrders(null);
    try {
      const { data } = await api.post('/ebay-buy/items/resolve', {
        marketplace,
        text: itemText,
      });
      setItems(data.items || []);
      if (!(data.items || []).length) setError('No item IDs found.');
    } catch (err) {
      setItems([]);
      setError(err.response?.data?.error || err.message || 'Item lookup failed');
    } finally {
      setLoading('');
    }
  };

  const checkoutItems = useMemo(
    () => items
      .filter((row) => row.buyable && row.itemId)
      .map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity) || 1 })),
    [items]
  );

  const previewCheckout = async () => {
    if (!checkoutItems.length) {
      setError('Load at least one Buy It Now item first.');
      return;
    }
    setLoading('preview');
    setError('');
    setOrders(null);
    try {
      const { data } = await api.post('/ebay-buy/checkout/preview', {
        marketplace,
        items: checkoutItems.slice(0, 4),
        shipping: selectedAccount?.shipping,
        accountId,
      });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.error || err.message || 'Checkout preview failed');
    } finally {
      setLoading('');
    }
  };

  const placeOrders = async () => {
    if (!checkoutItems.length) {
      setError('Load at least one Buy It Now item first.');
      return;
    }
    if (!confirmPlace) {
      setError('Confirm that this will charge the connected buying account.');
      return;
    }
    setLoading('place');
    setError('');
    try {
      const { data } = await api.post('/ebay-buy/checkout/place', {
        marketplace,
        items: checkoutItems,
        shipping: selectedAccount?.shipping,
        accountId,
        confirm: true,
        oneOrderPerItem: true,
      });
      setOrders(data.orders || []);
      setPreview(null);
      setConfirmPlace(false);
      await loadPurchases();
    } catch (err) {
      setOrders(null);
      setError(err.response?.data?.error || err.message || 'Place order failed');
    } finally {
      setLoading('');
    }
  };

  const setQty = (index, quantity) => {
    setItems((prev) => prev.map((row, i) => (
      i === index ? { ...row, quantity: Math.max(1, Number(quantity) || 1) } : row
    )));
    setPreview(null);
  };

  const buyableCount = checkoutItems.length;
  const blockedCount = items.length - buyableCount;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>Place eBay orders</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Browse resolves item IDs, then Order API member checkout places the order on the selected buying account.
        Connect and store buyers in{' '}
        <Link component={RouterLink} to="/admin/ebay-buying/accounts" fontWeight={600}>Buying Accounts</Link>.
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        {status?.ok ? (
          <Chip size="small" color="success" label={status.sandbox ? 'Sandbox Browse OK' : 'Browse token OK'} />
        ) : status ? (
          <Chip size="small" color="warning" label={status.configured ? 'Browse token failed' : 'Buy app keys missing'} />
        ) : (
          <Chip size="small" label="Checking…" />
        )}
        {buyerConnected ? (
          <Chip size="small" color="success" label={selectedAccount.ebayUsername ? `Buyer: ${selectedAccount.ebayUsername}` : selectedAccount.name} />
        ) : (
          <Chip size="small" color="warning" label="No connected buying account" />
        )}
        {selectedAccount?.shippingReady && <Chip size="small" variant="outlined" label="Shipping saved" />}
      </Stack>

      {status && !status.ok && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {status.message || status.error || 'Could not mint a Browse application token.'}
        </Alert>
      )}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Buying account</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField
            select
            label="Account"
            value={accountId}
            onChange={(e) => onAccountChange(e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
            helperText={selectedAccount?.shippingReady
              ? `${selectedAccount.shipping?.recipient || ''} · ${selectedAccount.shipping?.city || ''} ${selectedAccount.shipping?.postalCode || ''}`
              : 'Save ship-to on Buying Accounts before placing'}
          >
            {!accounts.length && <MenuItem value="">No accounts yet</MenuItem>}
            {accounts.map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {row.name}{row.connected ? '' : ' (not connected)'}{row.active ? ' · active' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Marketplace"
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            size="small"
            sx={{ minWidth: 220 }}
          >
            {EBAY_BUY_MARKETPLACES.map((m) => (
              <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
            ))}
          </TextField>
          <Button component={RouterLink} to="/admin/ebay-buying/accounts" variant="outlined" sx={yellowOutlinedButtonSx}>
            Manage accounts
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Item IDs</Typography>
        <TextField
          label="One item ID or eBay URL per line"
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          fullWidth
          multiline
          minRows={4}
          placeholder={'123456789012\n123456789013 2\nhttps://www.ebay.com/itm/…'}
          helperText="Quantity is optional: put a whole number after the ID."
        />
        <Button
          variant="contained"
          startIcon={loading === 'resolve' ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
          onClick={resolveItems}
          disabled={loading === 'resolve'}
          sx={{ ...yellowFilledButtonSx, mt: 1.5 }}
        >
          {loading === 'resolve' ? 'Loading…' : 'Load items'}
        </Button>
      </Paper>

      {!!items.length && (
        <Paper variant="outlined" sx={{ ...tableContainerSx, mb: 3, overflow: 'auto' }}>
          <Stack direction="row" spacing={1} sx={{ p: 1.5, pb: 0 }} alignItems="center">
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Ready to buy</Typography>
            <Chip size="small" label={`${buyableCount} buyable`} />
            {blockedCount > 0 && <Chip size="small" color="warning" label={`${blockedCount} blocked`} />}
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeaderCellSx}>Item</TableCell>
                <TableCell sx={tableHeaderCellSx}>ID</TableCell>
                <TableCell sx={tableHeaderCellSx}>Price</TableCell>
                <TableCell sx={tableHeaderCellSx}>Qty</TableCell>
                <TableCell sx={tableHeaderCellSx}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row, index) => (
                <TableRow key={`${row.inputId}-${index}`} sx={tableBodyRowSx}>
                  <TableCell sx={tableBodyCellSx}>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <Avatar variant="rounded" src={row.imageUrl || undefined} sx={{ width: 40, height: 40 }}>
                        {(row.title || '?').charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: 420 }}>
                          {row.title || 'Lookup failed'}
                        </Typography>
                        {row.seller && <Typography variant="caption" color="text.secondary">{row.seller}</Typography>}
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={tableBodyCellSx}>
                    <Typography variant="caption">{row.legacyItemId || row.inputId}</Typography>
                    {row.itemWebUrl && (
                      <Box>
                        <Link href={row.itemWebUrl} target="_blank" rel="noopener noreferrer" variant="caption">eBay</Link>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell sx={tableBodyCellSx}>{priceLabel(row.price) || '—'}</TableCell>
                  <TableCell sx={tableBodyCellSx}>
                    <TextField
                      type="number"
                      size="small"
                      value={row.quantity || 1}
                      onChange={(e) => setQty(index, e.target.value)}
                      inputProps={{ min: 1, max: 99, style: { width: 64 } }}
                      disabled={!row.buyable}
                    />
                  </TableCell>
                  <TableCell sx={tableBodyCellSx}>
                    {row.buyable ? (
                      <Chip size="small" color="success" label="Buy It Now" />
                    ) : (
                      <Typography variant="caption" color="warning.main">{row.warning || 'Not buyable'}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Divider />
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
              <Button
                variant="outlined"
                onClick={previewCheckout}
                disabled={!buyerConnected || !buyableCount || loading === 'preview'}
                sx={yellowOutlinedButtonSx}
              >
                {loading === 'preview' ? 'Previewing…' : 'Preview checkout'}
              </Button>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={confirmPlace}
                    onChange={(e) => setConfirmPlace(e.target.checked)}
                  />
                )}
                label="Place live orders on the selected buying account"
              />
              <Button
                variant="contained"
                onClick={placeOrders}
                disabled={!buyerConnected || !buyableCount || !confirmPlace || loading === 'place'}
                sx={yellowFilledButtonSx}
              >
                {loading === 'place' ? 'Placing…' : `Place ${buyableCount} order${buyableCount === 1 ? '' : 's'}`}
              </Button>
            </Stack>
            {!buyerConnected && (
              <Typography variant="caption" color="text.secondary">
                Connect a buying account in Buying Accounts before preview or place.
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {preview?.session && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Checkout preview</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Session {preview.checkoutSessionId} — this has not been purchased yet.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Items ${amountLabel(preview.session.pricingSummary?.priceSubtotal) || '—'}`} />
            <Chip label={`Shipping ${amountLabel(preview.session.pricingSummary?.deliveryCost) || '—'}`} />
            <Chip label={`Tax ${amountLabel(preview.session.pricingSummary?.tax) || '—'}`} />
            <Chip color="primary" label={`Total ${amountLabel(preview.session.pricingSummary?.total) || '—'}`} />
          </Stack>
        </Paper>
      )}

      {!!orders?.length && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Place results</Typography>
          <Stack spacing={1}>
            {orders.map((row, index) => (
              <Alert key={row.purchaseOrder?.purchaseOrderId || index} severity={row.placed ? 'success' : 'warning'}>
                {row.placed
                  ? `Placed ${row.items?.[0]?.title || row.items?.[0]?.inputId || 'item'} · order ${row.purchaseOrder?.purchaseOrderId || 'unknown'}${row.purchaseOrder?.purchaseOrderPaymentStatus ? ` · ${row.purchaseOrder.purchaseOrderPaymentStatus}` : ''}`
                  : `${row.items?.[0]?.inputId || 'Item'}: ${row.error || 'Failed'}`}
              </Alert>
            ))}
          </Stack>
        </Paper>
      )}

      {!!purchases.length && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Recent purchases</Typography>
          <Stack spacing={0.75}>
            {purchases.map((row) => (
              <Typography key={row._id} variant="body2">
                {new Date(row.createdAt).toLocaleString()} · {row.title || row.legacyItemId || row.itemId} · {row.purchaseOrderId || row.status}
                {row.error ? ` · ${row.error}` : ''}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
