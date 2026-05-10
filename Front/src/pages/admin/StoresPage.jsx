import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import api from '../../lib/api.js';
import {
  fetchDescriptionTemplateGallery,
  LEGACY_STORE_TEMPLATE_MAP_KEY,
  patchDescriptionTemplateStoreMap,
} from '../../lib/descriptionTemplateGalleryApi.js';

export default function StoresPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({ sync: false, renew: false, delete: false });
  const [editingSeller, setEditingSeller] = useState(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    isStoreActive: true,
    marketplaces: '',
  });
  const [templates, setTemplates] = useState([]);
  const [storeTemplateMap, setStoreTemplateMap] = useState({});
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [galleryError, setGalleryError] = useState('');

  const loadTemplateGallery = async () => {
    setGalleryError('');
    try {
      let { templates: list, storeTemplateMap: map } = await fetchDescriptionTemplateGallery();
      const mapObj = map && typeof map === 'object' ? map : {};

      if (
        (!mapObj || Object.keys(mapObj).length === 0)
      ) {
        try {
          const rawMap = localStorage.getItem(LEGACY_STORE_TEMPLATE_MAP_KEY);
          const parsedMap = rawMap ? JSON.parse(rawMap) : {};
          if (parsedMap && typeof parsedMap === 'object' && Object.keys(parsedMap).length) {
            await patchDescriptionTemplateStoreMap(parsedMap);
            ({ templates: list, storeTemplateMap: map } = await fetchDescriptionTemplateGallery());
            localStorage.removeItem(LEGACY_STORE_TEMPLATE_MAP_KEY);
          }
        } catch (e) {
          console.warn('Legacy store template map migrate skipped:', e?.message || e);
        }
      }

      const nextTemplates = Array.isArray(list) ? list : [];
      const nextMap = map && typeof map === 'object' ? map : {};
      setTemplates(nextTemplates);
      setStoreTemplateMap(nextMap);
      return { templates: nextTemplates, storeTemplateMap: nextMap };
    } catch (e) {
      console.error('Failed to load description template gallery', e);
      setGalleryError(e?.response?.data?.error || 'Failed to load description templates (server)');
      setTemplates([]);
      setStoreTemplateMap({});
      return { templates: [], storeTemplateMap: {} };
    }
  };

  const loadSellers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sellers/all');
      const sellers = Array.isArray(data) ? data : [];
      setRows(sellers);
    } catch (error) {
      console.error('Failed to load sellers:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSellers();
  }, []);

  useEffect(() => {
    void loadTemplateGallery();
  }, []);

  const openEdit = async (seller) => {
    const { storeTemplateMap: freshMap } = await loadTemplateGallery();
    const selectedFromStorage = freshMap?.[seller?._id] || '';
    setEditingSeller(seller);
    setForm({
      username: seller?.user?.username || '',
      email: seller?.user?.email || '',
      isStoreActive: seller?.isStoreActive !== false,
      marketplaces: Array.isArray(seller?.ebayMarketplaces) ? seller.ebayMarketplaces.join(', ') : '',
    });
    setError('');
    setSelectedTemplateId(selectedFromStorage);
    setEditOpen(true);
  };

  const saveStoreTemplateSelection = async (sellerId, templateId) => {
    if (!sellerId) return;
    try {
      const next = { [sellerId]: templateId || '' };
      const result = await patchDescriptionTemplateStoreMap(next);
      const merged = result.storeTemplateMap && typeof result.storeTemplateMap === 'object' ? result.storeTemplateMap : {};
      setStoreTemplateMap(merged);
      if (Array.isArray(result.templates)) setTemplates(result.templates);
    } catch (e) {
      console.error('Failed to save store template mapping', e);
      setError(e?.response?.data?.error || 'Failed to save description template for this store');
    }
  };

  const saveEdit = async () => {
    if (!editingSeller?._id) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        isStoreActive: form.isStoreActive,
        ebayMarketplaces: form.marketplaces
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      };
      await api.patch(`/sellers/${editingSeller._id}`, payload);
      setEditOpen(false);
      setEditingSeller(null);
      await loadSellers();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update seller');
    } finally {
      setSaving(false);
    }
  };

  const syncStore = async () => {
    if (!editingSeller?._id) return;
    setActionLoading((p) => ({ ...p, sync: true }));
    try {
      await api.post('/ebay/sync-all-listings', { sellerId: editingSeller._id });
      await loadSellers();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to sync store');
    } finally {
      setActionLoading((p) => ({ ...p, sync: false }));
    }
  };

  const renewStoreToken = async () => {
    if (!editingSeller?._id) return;
    setActionLoading((p) => ({ ...p, renew: true }));
    try {
      const { data } = await api.get(`/sellers/${editingSeller._id}/renew-ebay-url`);
      const base = import.meta.env.VITE_API_URL || '';
      const renewUrl = (data?.url || '').startsWith('http') ? data.url : `${base}${data.url || ''}`;
      if (renewUrl) window.open(renewUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to generate renew URL');
    } finally {
      setActionLoading((p) => ({ ...p, renew: false }));
    }
  };

  const deleteStore = async () => {
    if (!editingSeller?._id) return;
    const ok = window.confirm('Delete this store? This will archive it and deactivate the seller account.');
    if (!ok) return;
    setActionLoading((p) => ({ ...p, delete: true }));
    try {
      await api.delete(`/sellers/${editingSeller._id}`);
      setEditOpen(false);
      setEditingSeller(null);
      await loadSellers();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to delete store');
    } finally {
      setActionLoading((p) => ({ ...p, delete: false }));
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Stores
      </Typography>

      {galleryError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>{galleryError}</Alert>
      ) : null}

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Seller accounts are listed here.
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadSellers} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Store Active</TableCell>
              <TableCell>Marketplaces</TableCell>
              <TableCell>Description Template</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  {loading ? 'Loading sellers...' : 'No sellers found.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((seller) => (
                <TableRow key={seller._id} hover>
                  <TableCell>{seller?.user?.username || '-'}</TableCell>
                  <TableCell>{seller?.user?.email || '-'}</TableCell>
                  <TableCell>{seller?.isStoreActive === false ? 'No' : 'Yes'}</TableCell>
                  <TableCell>{Array.isArray(seller?.ebayMarketplaces) && seller.ebayMarketplaces.length > 0 ? seller.ebayMarketplaces.join(', ') : '-'}</TableCell>
                  <TableCell>
                    {templates.find((t) => String(t.id) === String(storeTemplateMap[seller._id]))?.title || '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(seller)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Store</DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <TextField
            margin="dense"
            label="Username"
            fullWidth
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          />
          <TextField
            margin="dense"
            label="Email"
            fullWidth
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <TextField
            margin="dense"
            label="Store Active (yes/no)"
            fullWidth
            value={form.isStoreActive ? 'yes' : 'no'}
            onChange={(e) => {
              const val = e.target.value.trim().toLowerCase();
              setForm((prev) => ({ ...prev, isStoreActive: val !== 'no' && val !== 'false' && val !== '0' }));
            }}
            helperText="Type yes or no"
          />
          <TextField
            margin="dense"
            label="Marketplaces (comma separated)"
            fullWidth
            value={form.marketplaces}
            onChange={(e) => setForm((prev) => ({ ...prev, marketplaces: e.target.value }))}
            placeholder="EBAY_US, EBAY_UK"
          />
          <FormControl margin="dense" fullWidth size="small">
            <InputLabel>Description Template</InputLabel>
            <Select
              label="Description Template"
              value={selectedTemplateId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedTemplateId(value);
                if (editingSeller?._id) void saveStoreTemplateSelection(editingSeller._id, value);
              }}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {templates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={syncStore} variant="outlined" disabled={actionLoading.sync}>
            {actionLoading.sync ? 'Syncing...' : 'Sync Store'}
          </Button>
          <Button onClick={renewStoreToken} variant="outlined" disabled={actionLoading.renew}>
            {actionLoading.renew ? 'Opening...' : 'Renew Store Token'}
          </Button>
          <Button onClick={deleteStore} color="error" variant="outlined" disabled={actionLoading.delete}>
            {actionLoading.delete ? 'Deleting...' : 'Delete Store'}
          </Button>
          <Button onClick={saveEdit} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
