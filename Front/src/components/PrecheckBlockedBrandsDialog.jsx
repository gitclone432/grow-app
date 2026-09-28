import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Delete as DeleteIcon, Search as SearchIcon } from '@mui/icons-material';
import api from '../lib/api.js';
import useFetchTable from '../hooks/useFetchTable';
import { yellowFilledButtonSx } from '../theme/tableStyles.js';

/**
 * Manages the brands the ASIN precheck drops. Previously a hard-coded list in
 * the server; now editable here so a brand can be excluded the moment a
 * takedown lands, without a redeploy. Each precheck run reads the list when it
 * starts, so an addition applies to the next run. One rule for every entry:
 * the name appears in the brand Amazon shows or in the seller ("Sold by") —
 * never the title or description.
 */
export default function PrecheckBlockedBrandsDialog({ open, onClose }) {
  const { rows: entries, loading, error: loadError, refetch } = useFetchTable(
    '/precheck-blocked-brands',
    undefined,
    { enabled: open }
  );

  const [brandsInput, setBrandsInput] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const [removingId, setRemovingId] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter(row =>
      String(row.brand || '').toLowerCase().includes(term)
      || String(row.note || '').toLowerCase().includes(term)
      || String(row.createdByName || '').toLowerCase().includes(term)
    );
  }, [entries, search]);

  // Count of what the user has pasted, so a big paste can be sanity-checked
  // before submitting. Mirrors the server's separators: never a plain space.
  const pendingCount = useMemo(
    () => brandsInput.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean).length,
    [brandsInput]
  );

  const addBrands = async (event) => {
    event.preventDefault();
    setFormError('');
    setResult(null);
    setSubmitting(true);
    try {
      const { data } = await api.post('/precheck-blocked-brands', {
        brands: brandsInput,
        note: note.trim()
      });
      setBrandsInput('');
      setNote('');
      setResult(data);
      refetch();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to add brands');
    } finally {
      setSubmitting(false);
    }
  };

  const removeBrand = async (row) => {
    if (!window.confirm(`Remove "${row.brand}" from the excluded brands?\n\nIts ASINs WILL show up in future prechecks.`)) return;
    setRemovingId(row._id);
    try {
      await api.delete(`/precheck-blocked-brands/${row._id}`);
      setResult(null);
      refetch();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to remove brand');
    } finally {
      setRemovingId('');
    }
  };

  const handleClose = () => {
    setFormError('');
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Excluded Brands</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          An ASIN is dropped from the precheck when any of these names appears in its Amazon brand
          field or in its seller (&ldquo;Sold by&rdquo;) — case and ®/™ are ignored. The title and
          description are not checked. Each run reads this list when it starts, so a brand added
          here applies to the next precheck.
        </Typography>

        <Box component="form" onSubmit={addBrands} sx={{ mb: 2.5 }}>
          {formError && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setFormError('')}>{formError}</Alert>}
          {result && (
            <Alert severity={result.added > 0 ? 'success' : 'info'} sx={{ mb: 1.5 }} onClose={() => setResult(null)}>
              Added {result.added} brand{result.added === 1 ? '' : 's'}
              {result.skipped > 0 && ` · ${result.skipped} already on the list`}
              {result.invalid?.length > 0 && ` · ignored (too long): ${result.invalid.join(', ')}`}
            </Alert>
          )}
          <Stack spacing={1.5}>
            <TextField
              label="Brands to exclude"
              placeholder={'One per line, or comma-separated\nBINQIGOO\nWeatherTech'}
              value={brandsInput}
              onChange={(e) => setBrandsInput(e.target.value)}
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              helperText={pendingCount > 0 ? `${pendingCount} brand${pendingCount === 1 ? '' : 's'} to add` : 'Paste straight from a spreadsheet column — quotes and blank lines are ignored'}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Reason (optional)"
                size="small"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                inputProps={{ maxLength: 500 }}
                sx={{ flex: 1 }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={submitting || pendingCount === 0}
                sx={{ ...yellowFilledButtonSx, whiteSpace: 'nowrap' }}
              >
                {submitting ? 'Adding…' : 'Add'}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TextField
            size="small"
            placeholder="Search brands"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ flex: 1 }}
          />
          <Chip size="small" label={`${entries.length} brand${entries.length === 1 ? '' : 's'}`} />
        </Stack>

        {loadError && <Alert severity="error" sx={{ mb: 1 }}>{loadError}</Alert>}

        <TableContainer sx={{ maxHeight: 360 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Brand</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Added by</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={22} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {search ? 'No brands match your search' : 'No brands excluded yet'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(row => (
                <TableRow key={row._id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{row.brand}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', maxWidth: 220 }}>{row.note || '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {row.source === 'seed' ? 'Imported' : (row.createdByName || '—')}
                    {row.createdAt && (
                      <Typography component="span" variant="caption" display="block">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Remove">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeBrand(row)}
                          disabled={removingId === row._id}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
