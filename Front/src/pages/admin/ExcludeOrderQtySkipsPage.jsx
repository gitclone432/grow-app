import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
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
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api.js';

export default function ExcludeOrderQtySkipsPage() {
  const [rows, setRows] = useState([]);
  const [legacyItemId, setLegacyItemId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [error, setError] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const load = () => {
    api.get('/order-qty-exclude-legacy').then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  const addRow = async (e) => {
    e.preventDefault();
    setError('');
    setBulkResult(null);
    try {
      await api.post('/order-qty-exclude-legacy', { legacyItemId: legacyItemId.trim() });
      setLegacyItemId('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add legacy item ID');
    }
  };

  const bulkAdd = async () => {
    setError('');
    setBulkResult(null);
    const text = bulkText.trim();
    if (!text) {
      setError('Paste at least one legacy item ID.');
      return;
    }
    setBulkBusy(true);
    try {
      const { data } = await api.post('/order-qty-exclude-legacy/bulk', { bulkText });
      setBulkResult(data);
      setBulkText('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Bulk add failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const removeRow = async (id) => {
    if (!window.confirm('Remove this legacy item ID from the skip list?')) return;
    try {
      await api.delete(`/order-qty-exclude-legacy/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove');
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>Exclude &lt; $3</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
        Legacy eBay listing IDs listed here skip the automated &quot;set quantity to 1&quot; step when a new
        order imports (Trading API ReviseInventoryStatus). Enable or schedule that automation on{' '}
        <strong>Cron Jobs → Set listing qty to 1 on new order</strong>. This page only controls per-listing
        exclusions; it does not affect dashboard &quot;exclude &lt; $3 orders&quot; filters.
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {bulkResult && (
          <Alert severity={bulkResult.invalidCount > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
            Processed {bulkResult.processed} ID(s): {bulkResult.inserted} new, {bulkResult.skippedExisting} already listed.
            {bulkResult.invalidCount > 0 && (
              <> Skipped {bulkResult.invalidCount} invalid token(s){bulkResult.invalid?.length ? `: ${bulkResult.invalid.slice(0, 8).join(', ')}${bulkResult.invalid.length > 8 ? '…' : ''}` : ''}.</>
            )}
          </Alert>
        )}
        <Stack direction="row" spacing={2} component="form" onSubmit={addRow} flexWrap="wrap" useFlexGap>
          <TextField
            label="Legacy listing ID"
            value={legacyItemId}
            onChange={(e) => setLegacyItemId(e.target.value)}
            required
            size="small"
            placeholder="e.g. 406874777825"
            sx={{ minWidth: 260 }}
          />
          <Button type="submit" variant="contained" size="medium">Add</Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Bulk add</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          One ID per line, or comma / space separated. Duplicate IDs are ignored; invalid tokens are skipped and reported.
        </Typography>
        <TextField
          multiline
          minRows={6}
          fullWidth
          size="small"
          placeholder={`406874777825\n406071247772`}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          sx={{ mb: 2, fontFamily: 'monospace' }}
        />
        <Button variant="contained" onClick={bulkAdd} disabled={bulkBusy} startIcon={bulkBusy ? <CircularProgress size={16} color="inherit" /> : null}>
          {bulkBusy ? 'Adding…' : 'Bulk add IDs'}
        </Button>
      </Paper>

      <TableContainer component={Paper} sx={{ maxWidth: 520 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Legacy item ID</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 56 }} align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r._id} hover>
                <TableCell>{r.legacyItemId}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" color="error" onClick={() => removeRow(r._id)} aria-label="remove">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={2} align="center">No IDs configured (defaults seed on first use).</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
