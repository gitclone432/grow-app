import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import api from '../../lib/api.js';

export default function EtsyStoresPage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadStores = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/etsy/stores');
      setStores(Array.isArray(data.stores) ? data.stores : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load Etsy stores');
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [stores]
  );

  const handleAddStore = async () => {
    const trimmed = newStoreName.trim();
    if (!trimmed) {
      setError('Enter a store name');
      return;
    }

    setCreating(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/etsy/stores', { name: trimmed });
      const store = data.store;
      if (!store) {
        throw new Error('Store was not returned');
      }

      setStores((prev) => {
        const exists = prev.some((item) => String(item._id) === String(store._id));
        if (exists) return prev;
        return [...prev, store].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      });
      setNewStoreName('');
      setMessage(data.created ? `Store "${store.name}" added` : `Store "${store.name}" already exists`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to add store');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Etsy Stores
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {message ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert> : null}

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
        >
          <Typography variant="body2" color="text.secondary">
            Etsy shop names used in{' '}
            <Link component={RouterLink} to="/admin/etsy/order-fulfilment" fontWeight={600}>
              ETSY → Order Fulfilment
            </Link>
            . Add stores here only — not from the fulfilment page.
          </Typography>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadStores} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField
            size="small"
            label="New store name"
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddStore();
            }}
            placeholder="e.g. Techvista"
            sx={{ minWidth: { sm: 280 } }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddStore}
            disabled={creating || !newStoreName.trim()}
          >
            {creating ? 'Adding...' : 'Add Store'}
          </Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48 }} align="center">#</TableCell>
              <TableCell>Store Name</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                  <StorefrontIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {loading ? 'Loading Etsy stores...' : 'No Etsy stores yet. Add one above.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedStores.map((store, index) => (
                <TableRow key={store._id} hover>
                  <TableCell align="center" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {index + 1}
                  </TableCell>
                  <TableCell>{store.name}</TableCell>
                  <TableCell>
                    {store.createdAt ? new Date(store.createdAt).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
