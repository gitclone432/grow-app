import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Fade,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { dashboardSignatureTokens } from '../../theme/appTheme';
import { yellowFilledButtonSx } from '../../theme/tableStyles.js';

const getPTDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
}).format(new Date());

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'US' },
  { value: 'UK', label: 'UK' },
  { value: 'AU', label: 'AU' },
  { value: 'Canada', label: 'CA' },
  { value: 'Unknown', label: 'Unknown' },
];

const getSellerName = (seller) => seller?.user?.username || seller?.user?.email || seller?._id || 'Unknown';

export default function ManualEndListingPage() {
  const [form, setForm] = useState({
    pdtDate: getPTDate(),
    sellerId: '',
    country: 'US',
    quantity: '',
    note: '',
  });
  const [sellers, setSellers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sortedSellers = useMemo(() => [...sellers].sort((a, b) => (
    getSellerName(a).localeCompare(getSellerName(b))
  )), [sellers]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sellerResponse, entryResponse] = await Promise.all([
        api.get('/sellers/all'),
        api.get('/ebay/feed/manual-end-listings', { params: { limit: 50 } }),
      ]);
      setSellers(Array.isArray(sellerResponse.data) ? sellerResponse.data : []);
      setEntries(Array.isArray(entryResponse.data) ? entryResponse.data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load manual end listing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateForm = (field) => (event) => {
    setForm(prev => ({ ...prev, [field]: event.target.value }));
    setSuccess('');
  };

  const updateEditForm = (field) => (event) => {
    setEditForm(prev => ({ ...prev, [field]: event.target.value }));
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/ebay/feed/manual-end-listings', {
        ...form,
        quantity: Number.parseInt(form.quantity, 10),
      });
      setSuccess('Manual ended quantity saved. Daily Listing Comparison will include it immediately.');
      setForm(prev => ({ ...prev, quantity: '', note: '' }));
      const { data } = await api.get('/ebay/feed/manual-end-listings', { params: { limit: 50 } });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save manual ended quantity.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (entry) => {
    setEditingId(entry.id);
    setEditForm({
      pdtDate: entry.pdtDate,
      sellerId: entry.sellerId || '',
      country: entry.country || 'US',
      quantity: String(entry.quantity || ''),
      note: entry.note || '',
    });
    setError('');
    setSuccess('');
  };

  const cancelEditing = () => {
    setEditingId('');
    setEditForm(null);
  };

  const saveEdit = async (entryId) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.put(`/ebay/feed/manual-end-listings/${entryId}`, {
        ...editForm,
        quantity: Number.parseInt(editForm.quantity, 10),
      });
      setSuccess('Manual entry updated. Daily Listing Comparison will use the updated quantity.');
      cancelEditing();
      const { data } = await api.get('/ebay/feed/manual-end-listings', { params: { limit: 50 } });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update manual ended quantity.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteEntry) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.delete(`/ebay/feed/manual-end-listings/${deleteEntry.id}`);
      setSuccess('Manual entry deleted. Daily Listing Comparison will no longer include it.');
      setDeleteEntry(null);
      if (editingId === deleteEntry.id) cancelEditing();
      const { data } = await api.get('/ebay/feed/manual-end-listings', { params: { limit: 50 } });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete manual ended quantity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Fade in timeout={600}>
      <AdminPageShell>
        <SectionCard
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            background: dashboardSignatureTokens.surfaces.pageCard,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={2}>
            <PageHeader
              title="Manual End Listing"
              subtitle="Add manual ended quantities by PDT date, seller, and country."
              sx={{ pt: 0, pb: 0 }}
            />
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={fetchData}
              disabled={loading || saving}
              sx={{ height: 40, textTransform: 'none', fontWeight: 700 }}
            >
              Refresh
            </Button>
          </Stack>

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
              <TextField
                label="Date (PDT)"
                type="date"
                size="small"
                value={form.pdtDate}
                onChange={updateForm('pdtDate')}
                InputLabelProps={{ shrink: true }}
                required
                sx={{ minWidth: 170 }}
              />
              <FormControl size="small" required sx={{ minWidth: 240 }}>
                <InputLabel>Seller</InputLabel>
                <Select label="Seller" value={form.sellerId} onChange={updateForm('sellerId')}>
                  {sortedSellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {getSellerName(seller)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" required sx={{ minWidth: 150 }}>
                <InputLabel>Country</InputLabel>
                <Select label="Country" value={form.country} onChange={updateForm('country')}>
                  {COUNTRY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Quantity"
                type="number"
                size="small"
                value={form.quantity}
                onChange={updateForm('quantity')}
                inputProps={{ min: 1, step: 1 }}
                required
                sx={{ minWidth: 140 }}
              />
              <TextField
                label="Note"
                size="small"
                value={form.note}
                onChange={updateForm('note')}
                sx={{ minWidth: { xs: '100%', lg: 260 }, flex: 1 }}
              />
              <Button
                type="submit"
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                disabled={saving || loading}
                sx={{ ...yellowFilledButtonSx, height: 40, minWidth: 130 }}
              >
                Save
              </Button>
            </Stack>
          </Box>
        </SectionCard>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <RemoveCircleOutlineIcon color="warning" />
            <Typography variant="h6" fontWeight={800}>Recent Manual Entries</Typography>
          </Stack>

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : entries.length === 0 ? (
            <Alert severity="info">No manual end listing entries found.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date (PDT)</TableCell>
                    <TableCell>Seller</TableCell>
                    <TableCell>Country</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell>Created By</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => {
                    const isEditing = editingId === entry.id;
                    return (
                      <TableRow key={entry.id} hover>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              type="date"
                              size="small"
                              value={editForm.pdtDate}
                              onChange={updateEditForm('pdtDate')}
                              InputLabelProps={{ shrink: true }}
                              sx={{ minWidth: 150 }}
                            />
                          ) : entry.pdtDate}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                              <Select value={editForm.sellerId} onChange={updateEditForm('sellerId')}>
                                {sortedSellers.map((seller) => (
                                  <MenuItem key={seller._id} value={seller._id}>
                                    {getSellerName(seller)}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ) : entry.sellerName}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <FormControl size="small" sx={{ minWidth: 120 }}>
                              <Select value={editForm.country} onChange={updateEditForm('country')}>
                                {COUNTRY_OPTIONS.map((option) => (
                                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ) : entry.country}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField
                              type="number"
                              size="small"
                              value={editForm.quantity}
                              onChange={updateEditForm('quantity')}
                              inputProps={{ min: 1, step: 1 }}
                              sx={{ width: 110 }}
                            />
                          ) : entry.quantity}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editForm.note}
                              onChange={updateEditForm('note')}
                              sx={{ minWidth: 180 }}
                            />
                          ) : (entry.note || '-')}
                        </TableCell>
                        <TableCell>{entry.createdBy}</TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <Stack direction="row" justifyContent="flex-end" spacing={1}>
                              <Button
                                size="small"
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                                onClick={() => saveEdit(entry.id)}
                                disabled={saving}
                                sx={{ ...yellowFilledButtonSx, minWidth: 88 }}
                              >
                                Save
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<CloseIcon />}
                                onClick={cancelEditing}
                                disabled={saving}
                                sx={{ textTransform: 'none', fontWeight: 700 }}
                              >
                                Cancel
                              </Button>
                            </Stack>
                          ) : (
                            <Stack direction="row" justifyContent="flex-end" spacing={1}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<EditIcon />}
                                onClick={() => startEditing(entry)}
                                disabled={saving || loading}
                                sx={{ textTransform: 'none', fontWeight: 700 }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteOutlineIcon />}
                                onClick={() => setDeleteEntry(entry)}
                                disabled={saving || loading}
                                sx={{ textTransform: 'none', fontWeight: 700 }}
                              >
                                Delete
                              </Button>
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>

        <Dialog
          open={Boolean(deleteEntry)}
          onClose={() => {
            if (!saving) setDeleteEntry(null);
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Delete Manual Entry?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will remove {deleteEntry?.quantity || 0} manual ended listings for {deleteEntry?.sellerName || 'this seller'} on {deleteEntry?.pdtDate || 'this date'}. Daily Listing Comparison will update after deletion.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setDeleteEntry(null)}
              disabled={saving}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineIcon />}
              onClick={confirmDelete}
              disabled={saving}
              sx={{ textTransform: 'none', fontWeight: 800 }}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </AdminPageShell>
    </Fade>
  );
}
