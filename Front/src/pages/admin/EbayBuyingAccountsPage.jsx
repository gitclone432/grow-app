import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
import api, { getAuthToken } from '../../lib/api';
import { getServerBaseUrl } from '../../lib/serverBaseUrl.js';
import { EBAY_BUY_MARKETPLACES, EMPTY_BUY_SHIPPING } from '../../constants/ebayBuying.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

export default function EbayBuyingAccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [shipping, setShipping] = useState(EMPTY_BUY_SHIPPING);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oauth, setOauth] = useState(null);

  const selected = accounts.find((row) => row.id === selectedId) || null;

  const loadAccounts = async (preferId) => {
    const [{ data }, statusRes] = await Promise.all([
      api.get('/ebay-buy/accounts'),
      api.get('/ebay-buy/status').catch(() => ({ data: null })),
    ]);
    if (statusRes.data?.oauth) setOauth(statusRes.data.oauth);
    const rows = data.accounts || [];
    setAccounts(rows);
    const nextId = preferId
      || (rows.find((row) => row.active)?.id)
      || rows[0]?.id
      || '';
    setSelectedId(nextId);
    const next = rows.find((row) => row.id === nextId);
    if (next) {
      setEditName(next.name || '');
      setMarketplace(next.marketplace || 'EBAY_US');
      setShipping({ ...EMPTY_BUY_SHIPPING, ...(next.shipping || {}) });
    } else {
      setEditName('');
      setMarketplace('EBAY_US');
      setShipping(EMPTY_BUY_SHIPPING);
    }
    return rows;
  };

  useEffect(() => {
    loadAccounts().catch((err) => {
      setError(err.response?.data?.error || err.message || 'Could not load buying accounts');
    });
  }, []);

  useEffect(() => {
    const connected = searchParams.get('buyerConnected');
    const connectError = searchParams.get('buyerConnectError');
    if (connected) {
      setNotice('eBay buying account connected.');
      loadAccounts().catch(() => {});
      setSearchParams({}, { replace: true });
    } else if (connectError) {
      setError(connectError);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const selectAccount = (row) => {
    setSelectedId(row.id);
    setEditName(row.name || '');
    setMarketplace(row.marketplace || 'EBAY_US');
    setShipping({ ...EMPTY_BUY_SHIPPING, ...(row.shipping || {}) });
  };

  const addAccount = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Enter a name for this buying account');
      return;
    }
    setLoading('add');
    setError('');
    try {
      const { data } = await api.post('/ebay-buy/accounts', { name });
      setNewName('');
      setNotice(`Added "${data.account.name}". Connect eBay to store its buying token.`);
      await loadAccounts(data.account.id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not add account');
    } finally {
      setLoading('');
    }
  };

  const saveAccount = async () => {
    if (!selectedId) return;
    setLoading('save');
    setError('');
    try {
      const { data } = await api.patch(`/ebay-buy/accounts/${selectedId}`, {
        name: editName,
        marketplace,
        shipping,
      });
      setNotice('Buying account saved.');
      await loadAccounts(data.account.id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not save account');
    } finally {
      setLoading('');
    }
  };

  const connectAccount = (accountId) => {
    const token = getAuthToken() || localStorage.getItem('auth_token');
    if (!token) {
      setError('Sign in again, then connect the buying account.');
      return;
    }
    window.location.href = `${getServerBaseUrl()}/api/ebay-buy/connect?token=${encodeURIComponent(token)}&accountId=${encodeURIComponent(accountId)}`;
  };

  const activateAccount = async (accountId) => {
    setLoading('activate');
    setError('');
    try {
      await api.post(`/ebay-buy/accounts/${accountId}/activate`);
      setNotice('This account is now used for Place Orders.');
      await loadAccounts(accountId);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not set active account');
    } finally {
      setLoading('');
    }
  };

  const disconnectAccount = async (accountId) => {
    if (!window.confirm('Disconnect this eBay buying login? Tokens will be removed; shipping stays saved.')) return;
    setLoading('disconnect');
    setError('');
    try {
      await api.post(`/ebay-buy/accounts/${accountId}/disconnect`);
      setNotice('eBay login disconnected.');
      await loadAccounts(accountId);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Disconnect failed');
    } finally {
      setLoading('');
    }
  };

  const deleteAccount = async (accountId) => {
    if (!window.confirm('Delete this buying account and its saved shipping?')) return;
    setLoading('delete');
    setError('');
    try {
      await api.delete(`/ebay-buy/accounts/${accountId}`);
      setNotice('Buying account deleted.');
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Delete failed');
    } finally {
      setLoading('');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>Buying accounts</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Store connected eBay member buying logins here. Place Orders uses the active account and its ship-to address.
        {' '}
        <Link component={RouterLink} to="/admin/ebay-buying" fontWeight={600}>Open Place Orders</Link>
      </Typography>

      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {oauth?.note && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {oauth.note}
          {oauth.userScopes?.length ? (
            <Box sx={{ mt: 1 }}>Connect asks eBay for: {oauth.userScopes.join(' ')}</Box>
          ) : null}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField
            size="small"
            label="Account name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addAccount(); }}
            placeholder="e.g. US buyer 1"
            sx={{ minWidth: { sm: 280 } }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addAccount}
            disabled={loading === 'add' || !newName.trim()}
            sx={yellowFilledButtonSx}
          >
            {loading === 'add' ? 'Adding…' : 'Add account'}
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ ...tableContainerSx, mb: 3, overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={tableHeaderCellSx}>Name</TableCell>
              <TableCell sx={tableHeaderCellSx}>eBay user</TableCell>
              <TableCell sx={tableHeaderCellSx}>Status</TableCell>
              <TableCell sx={tableHeaderCellSx}>Marketplace</TableCell>
              <TableCell sx={tableHeaderCellSx}>Shipping</TableCell>
              <TableCell sx={tableHeaderCellSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!accounts.length && (
              <TableRow>
                <TableCell sx={tableBodyCellSx} colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No buying accounts yet. Add a name, then connect eBay.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {accounts.map((row) => (
              <TableRow
                key={row.id}
                hover
                selected={row.id === selectedId}
                onClick={() => selectAccount(row)}
                sx={{ ...tableBodyRowSx, cursor: 'pointer' }}
              >
                <TableCell sx={tableBodyCellSx}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.name}</Typography>
                </TableCell>
                <TableCell sx={tableBodyCellSx}>{row.ebayUsername || '—'}</TableCell>
                <TableCell sx={tableBodyCellSx}>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {row.connected
                      ? <Chip size="small" color="success" label="Connected" />
                      : <Chip size="small" color="warning" label="Not connected" />}
                    {row.active && <Chip size="small" label="Active" />}
                  </Stack>
                </TableCell>
                <TableCell sx={tableBodyCellSx}>{row.marketplace}</TableCell>
                <TableCell sx={tableBodyCellSx}>
                  {row.shippingReady ? `${row.shipping?.city || ''}, ${row.shipping?.country || ''}`.trim() : 'Not saved'}
                </TableCell>
                <TableCell sx={tableBodyCellSx} onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="contained" onClick={() => connectAccount(row.id)} sx={yellowFilledButtonSx}>
                      {row.connected ? 'Reconnect' : 'Connect'}
                    </Button>
                    {row.connected && !row.active && (
                      <Button size="small" variant="outlined" onClick={() => activateAccount(row.id)} sx={yellowOutlinedButtonSx}>
                        Use for orders
                      </Button>
                    )}
                    {row.connected && (
                      <Button size="small" onClick={() => disconnectAccount(row.id)}>Disconnect</Button>
                    )}
                    <Button size="small" color="error" onClick={() => deleteAccount(row.id)}>Delete</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {selected && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Manage {selected.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {selected.connected
              ? `Connected${selected.ebayUsername ? ` as ${selected.ebayUsername}` : ''}${selected.connectedAt ? ` · ${new Date(selected.connectedAt).toLocaleString()}` : ''}`
              : 'Not connected yet. Connect eBay to store a buying token on this row.'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
            <TextField
              size="small"
              label="Display name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              sx={{ minWidth: 220 }}
            />
            <TextField
              select
              size="small"
              label="Marketplace"
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              {EBAY_BUY_MARKETPLACES.map((m) => (
                <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Ship-to address</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
            <TextField size="small" label="Recipient" value={shipping.recipient} onChange={(e) => setShipping((s) => ({ ...s, recipient: e.target.value }))} fullWidth />
            <TextField size="small" label="Email" value={shipping.contactEmail} onChange={(e) => setShipping((s) => ({ ...s, contactEmail: e.target.value }))} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
            <TextField size="small" label="Address line 1" value={shipping.addressLine1} onChange={(e) => setShipping((s) => ({ ...s, addressLine1: e.target.value }))} fullWidth />
            <TextField size="small" label="Address line 2" value={shipping.addressLine2} onChange={(e) => setShipping((s) => ({ ...s, addressLine2: e.target.value }))} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
            <TextField size="small" label="City" value={shipping.city} onChange={(e) => setShipping((s) => ({ ...s, city: e.target.value }))} fullWidth />
            <TextField size="small" label="State" value={shipping.stateOrProvince} onChange={(e) => setShipping((s) => ({ ...s, stateOrProvince: e.target.value }))} sx={{ minWidth: 120 }} />
            <TextField size="small" label="ZIP" value={shipping.postalCode} onChange={(e) => setShipping((s) => ({ ...s, postalCode: e.target.value }))} sx={{ minWidth: 120 }} />
            <TextField size="small" label="Country" value={shipping.country} onChange={(e) => setShipping((s) => ({ ...s, country: e.target.value }))} sx={{ minWidth: 100 }} />
            <TextField size="small" label="Phone" value={shipping.phoneNumber} onChange={(e) => setShipping((s) => ({ ...s, phoneNumber: e.target.value }))} sx={{ minWidth: 140 }} />
          </Stack>
          <Button variant="contained" onClick={saveAccount} disabled={loading === 'save'} sx={yellowFilledButtonSx}>
            {loading === 'save' ? 'Saving…' : 'Save account'}
          </Button>
        </Paper>
      )}
    </Box>
  );
}
