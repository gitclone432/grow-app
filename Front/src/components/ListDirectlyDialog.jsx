import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Stack,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ScheduleIcon from '@mui/icons-material/Schedule';
import api from '../lib/api.js';

export default function ListDirectlyDialog({ open, onClose, selectedListings, templateId, sellerId, inlineListings = null }) {
  const navigate = useNavigate();

  // Sellers
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [loadingSellers, setLoadingSellers] = useState(false);

  // CRP taxonomy
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);

  const [ranges, setRanges] = useState([]);
  const [selectedRangeId, setSelectedRangeId] = useState('');
  const [loadingRanges, setLoadingRanges] = useState(false);

  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Schedule mode
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(null);

  // Fetch sellers + categories when dialog opens
  useEffect(() => {
    if (!open) return;
    setError('');
    setSelectedCategoryId('');
    setSelectedRangeId('');
    setSelectedProductId('');
    setRanges([]);
    setProducts([]);
    setScheduleMode(false);
    setScheduledAt(null);

    const fetchInitial = async () => {
      setLoadingSellers(true);
      setLoadingCategories(true);
      try {
        const [sellersRes, categoriesRes] = await Promise.all([
          api.get('/sellers/all'),
          api.get('/asin-list-categories'),
        ]);
        setSellers(sellersRes.data);
        // Pre-select the seller that was passed in (the one used on the listing page)
        if (sellerId) {
          setSelectedSeller(sellerId);
        } else if (sellersRes.data.length > 0) {
          setSelectedSeller(sellersRes.data[0]._id);
        }
        setCategories(categoriesRes.data);
      } catch (err) {
        setError('Failed to load sellers or categories.');
      } finally {
        setLoadingSellers(false);
        setLoadingCategories(false);
      }
    };

    fetchInitial();
  }, [open, sellerId]);

  // Fetch ranges when category changes
  useEffect(() => {
    setRanges([]);
    setSelectedRangeId('');
    setProducts([]);
    setSelectedProductId('');
    if (!selectedCategoryId) return;

    const fetchRanges = async () => {
      setLoadingRanges(true);
      try {
        const { data } = await api.get('/asin-list-ranges', { params: { categoryId: selectedCategoryId } });
        setRanges(data);
      } catch {
        // silent
      } finally {
        setLoadingRanges(false);
      }
    };
    fetchRanges();
  }, [selectedCategoryId]);

  // Fetch products when range changes
  useEffect(() => {
    setProducts([]);
    setSelectedProductId('');
    if (!selectedRangeId) return;

    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const { data } = await api.get('/asin-list-products', { params: { rangeId: selectedRangeId } });
        setProducts(data);
      } catch {
        // silent
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [selectedRangeId]);

  const handleListNow = async () => {
    if (!selectedSeller) {
      setError('Please select a seller account.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let response;
      if (inlineListings) {
        // Proof Read → List Directly: field values come from the modal edits, not the DB
        response = await api.post(
          `/template-listings/export-csv-direct/${templateId}`,
          { sellerId: selectedSeller, listings: inlineListings },
          { responseType: 'blob' }
        );
      } else {
        const ids = [...selectedListings].join(',');
        const url = `/template-listings/export-csv/${templateId}?sellerId=${selectedSeller}&listingIds=${ids}`;
        response = await api.get(url, { responseType: 'blob' });
      }

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = `listings_${Date.now()}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/i);
        if (match?.[1]) filename = match[1].replace(/"/g, '');
      }

      const csvFile = new File([response.data], filename, { type: 'text/csv' });

      // Save to CSV Storage (non-blocking — upload still proceeds on failure)
      let csvStorageId = null;
      try {
        const storageForm = new FormData();
        storageForm.append('csvFile', csvFile, csvFile.name);
        storageForm.append('sellerId', selectedSeller);
        if (templateId) storageForm.append('templateId', templateId);
        storageForm.append('listingCount', String(selectedListings.size));
        if (selectedCategoryId) storageForm.append('categoryId', selectedCategoryId);
        storageForm.append('categoryName', categories.find(c => c._id === selectedCategoryId)?.name || '');
        if (selectedRangeId) storageForm.append('rangeId', selectedRangeId);
        storageForm.append('rangeName', ranges.find(r => r._id === selectedRangeId)?.name || '');
        if (selectedProductId) storageForm.append('productId', selectedProductId);
        storageForm.append('productName', products.find(p => p._id === selectedProductId)?.name || '');
        storageForm.append('source', 'asin_list');
        const saveRes = await api.post('/csv-storage', storageForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        csvStorageId = saveRes.data._id;
      } catch (saveErr) {
        console.error('Failed to save CSV to storage:', saveErr.message);
      }

      onClose();
      navigate('/admin/feed-upload', { state: { sellerId: selectedSeller, csvFile, csvStorageId } });
    } catch (err) {
      const msg = err.response?.data
        ? (err.response.data instanceof Blob
            ? await err.response.data.text().then(t => { try { return JSON.parse(t).error; } catch { return t; } })
            : err.response.data.error)
        : 'Failed to generate CSV.';
      setError(msg || 'Failed to generate CSV.');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleUpload = async () => {
    if (!selectedSeller) { setError('Please select a seller account.'); return; }
    if (!scheduledAt) { setError('Please select a date and time for the upload.'); return; }
    if (scheduledAt <= new Date()) { setError('Scheduled time must be in the future.'); return; }

    setLoading(true);
    setError('');

    try {
      let response;
      if (inlineListings) {
        response = await api.post(
          `/template-listings/export-csv-direct/${templateId}`,
          { sellerId: selectedSeller, listings: inlineListings },
          { responseType: 'blob' }
        );
      } else {
        const ids = [...selectedListings].join(',');
        const url = `/template-listings/export-csv/${templateId}?sellerId=${selectedSeller}&listingIds=${ids}`;
        response = await api.get(url, { responseType: 'blob' });
      }

      const contentDisposition = response.headers['content-disposition'];
      let filename = `listings_${Date.now()}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/i);
        if (match?.[1]) filename = match[1].replace(/"/g, '');
      }

      const csvFile = new File([response.data], filename, { type: 'text/csv' });

      // Save to CSV Storage first
      const storageForm = new FormData();
      storageForm.append('csvFile', csvFile, csvFile.name);
      storageForm.append('sellerId', selectedSeller);
      if (templateId) storageForm.append('templateId', templateId);
      storageForm.append('listingCount', String(selectedListings?.size ?? 0));
      if (selectedCategoryId) storageForm.append('categoryId', selectedCategoryId);
      storageForm.append('categoryName', categories.find(c => c._id === selectedCategoryId)?.name || '');
      if (selectedRangeId) storageForm.append('rangeId', selectedRangeId);
      storageForm.append('rangeName', ranges.find(r => r._id === selectedRangeId)?.name || '');
      if (selectedProductId) storageForm.append('productId', selectedProductId);
      storageForm.append('productName', products.find(p => p._id === selectedProductId)?.name || '');
      storageForm.append('source', 'asin_list');

      const saveRes = await api.post('/csv-storage', storageForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const csvStorageId = saveRes.data._id;

      // Schedule the upload
      await api.post(`/csv-storage/${csvStorageId}/schedule-upload`, {
        scheduledAt: scheduledAt.toISOString(),
        sellerId: selectedSeller,
      });

      onClose();
    } catch (err) {
      const msg = err.response?.data
        ? (err.response.data instanceof Blob
            ? await err.response.data.text().then(t => { try { return JSON.parse(t).error; } catch { return t; } })
            : err.response.data.error)
        : 'Failed to schedule upload.';
      setError(msg || 'Failed to schedule upload.');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = selectedListings?.size ?? 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Listing Dialog Box
        <Typography variant="caption" display="block" color="text.secondary">
          {selectedCount} listing{selectedCount !== 1 ? 's' : ''} selected
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

          {/* Store (Seller) */}
          <FormControl fullWidth size="small">
            <InputLabel>Store</InputLabel>
            <Select
              value={selectedSeller}
              label="Store"
              onChange={(e) => setSelectedSeller(e.target.value)}
              disabled={loadingSellers}
              endAdornment={loadingSellers ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
            >
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.storeName || s.user?.username || s._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Category */}
          <FormControl fullWidth size="small">
            <InputLabel>Category</InputLabel>
            <Select
              value={selectedCategoryId}
              label="Category"
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={loadingCategories}
              endAdornment={loadingCategories ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {categories.map((c) => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Range */}
          <FormControl fullWidth size="small">
            <InputLabel>Range</InputLabel>
            <Select
              value={selectedRangeId}
              label="Range"
              onChange={(e) => setSelectedRangeId(e.target.value)}
              disabled={!selectedCategoryId || loadingRanges}
              endAdornment={loadingRanges ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {ranges.map((r) => (
                <MenuItem key={r._id} value={r._id}>{r.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Product */}
          <FormControl fullWidth size="small">
            <InputLabel>Product</InputLabel>
            <Select
              value={selectedProductId}
              label="Product"
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={!selectedRangeId || loadingProducts}
              endAdornment={loadingProducts ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {products.map((p) => (
                <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />

          {/* Schedule Auto-Upload */}
          <FormControlLabel
            control={
              <Switch
                checked={scheduleMode}
                onChange={(e) => {
                  setScheduleMode(e.target.checked);
                  if (!e.target.checked) setScheduledAt(null);
                }}
                size="small"
              />
            }
            label={<Typography variant="body2">Schedule Auto-Upload instead</Typography>}
          />

          {scheduleMode && (
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateTimePicker
                label="Upload Date & Time"
                value={scheduledAt}
                onChange={setScheduledAt}
                minDateTime={new Date()}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </LocalizationProvider>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="outlined"
          onClick={handleListNow}
          disabled={loading || !selectedSeller || selectedCount === 0 || scheduleMode}
          startIcon={loading && !scheduleMode ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading && !scheduleMode ? 'Preparing...' : 'List Now'}
        </Button>
        <Button
          variant="contained"
          onClick={handleScheduleUpload}
          disabled={loading || !selectedSeller || selectedCount === 0 || !scheduleMode || !scheduledAt}
          startIcon={loading && scheduleMode ? <CircularProgress size={16} color="inherit" /> : <ScheduleIcon />}
        >
          {loading && scheduleMode ? 'Scheduling...' : 'Schedule Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
