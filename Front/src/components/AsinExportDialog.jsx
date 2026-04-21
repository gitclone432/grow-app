import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Box,
  Typography,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  IconButton,
  Divider,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';
import api from '../lib/api.js';

const CREATE_NEW_VALUE = '__CREATE_NEW__';

export default function AsinExportDialog({ open, onClose, selectedIds, onMoved }) {
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedRangeId, setSelectedRangeId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  // Inline create state
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingRange, setCreatingRange] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newRangeName, setNewRangeName] = useState('');
  const [newProductName, setNewProductName] = useState('');

  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');

  // Derived labels for summary line
  const selectedCategory = categories.find(c => c._id === selectedCategoryId);
  const selectedRange = ranges.find(r => r._id === selectedRangeId);
  const selectedProduct = products.find(p => p._id === selectedProductId);

  // Fetch categories on open
  useEffect(() => {
    if (!open) return;
    resetAll();
    fetchCategories();
  }, [open]);

  // Fetch ranges when category changes
  useEffect(() => {
    if (!selectedCategoryId) {
      setRanges([]);
      setSelectedRangeId('');
      setProducts([]);
      setSelectedProductId('');
      return;
    }
    fetchRanges(selectedCategoryId);
  }, [selectedCategoryId]);

  // Fetch products when range changes
  useEffect(() => {
    if (!selectedRangeId) {
      setProducts([]);
      setSelectedProductId('');
      return;
    }
    fetchProducts(selectedRangeId);
  }, [selectedRangeId]);

  const resetAll = () => {
    setSelectedCategoryId('');
    setSelectedRangeId('');
    setSelectedProductId('');
    setCreatingCategory(false);
    setCreatingRange(false);
    setCreatingProduct(false);
    setNewCategoryName('');
    setNewRangeName('');
    setNewProductName('');
    setError('');
    setRanges([]);
    setProducts([]);
  };

  const fetchCategories = async () => {
    try {
      setLoadingCategories(true);
      const { data } = await api.get('/asin-list-categories');
      setCategories(data);
    } catch (err) {
      setError('Failed to load categories');
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchRanges = async (categoryId) => {
    try {
      setLoadingRanges(true);
      setSelectedRangeId('');
      setProducts([]);
      setSelectedProductId('');
      const { data } = await api.get('/asin-list-ranges', { params: { categoryId } });
      setRanges(data);
    } catch (err) {
      setError('Failed to load ranges');
    } finally {
      setLoadingRanges(false);
    }
  };

  const fetchProducts = async (rangeId) => {
    try {
      setLoadingProducts(true);
      setSelectedProductId('');
      const { data } = await api.get('/asin-list-products', { params: { rangeId } });
      setProducts(data);
    } catch (err) {
      setError('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  // ── Category handlers ─────────────────────────────────────────────────────
  const handleCategoryChange = (e) => {
    const val = e.target.value;
    if (val === CREATE_NEW_VALUE) {
      setCreatingCategory(true);
      setSelectedCategoryId('');
    } else {
      setSelectedCategoryId(val);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const { data } = await api.post('/asin-list-categories', { name: newCategoryName.trim() });
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCategoryId(data._id);
      setCreatingCategory(false);
      setNewCategoryName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    }
  };

  const handleCancelCategory = () => {
    setCreatingCategory(false);
    setNewCategoryName('');
  };

  // ── Range handlers ────────────────────────────────────────────────────────
  const handleRangeChange = (e) => {
    const val = e.target.value;
    if (val === CREATE_NEW_VALUE) {
      setCreatingRange(true);
      setSelectedRangeId('');
    } else {
      setSelectedRangeId(val);
    }
  };

  const handleCreateRange = async () => {
    if (!newRangeName.trim()) return;
    try {
      const { data } = await api.post('/asin-list-ranges', {
        name: newRangeName.trim(),
        categoryId: selectedCategoryId
      });
      setRanges(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedRangeId(data._id);
      setCreatingRange(false);
      setNewRangeName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create range');
    }
  };

  const handleCancelRange = () => {
    setCreatingRange(false);
    setNewRangeName('');
  };

  // ── Product handlers ──────────────────────────────────────────────────────
  const handleProductChange = (e) => {
    const val = e.target.value;
    if (val === CREATE_NEW_VALUE) {
      setCreatingProduct(true);
      setSelectedProductId('');
    } else {
      setSelectedProductId(val);
    }
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) return;
    try {
      const { data } = await api.post('/asin-list-products', {
        name: newProductName.trim(),
        rangeId: selectedRangeId,
        categoryId: selectedCategoryId
      });
      setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedProductId(data._id);
      setCreatingProduct(false);
      setNewProductName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create product');
    }
  };

  const handleCancelProduct = () => {
    setCreatingProduct(false);
    setNewProductName('');
  };

  // ── Move ──────────────────────────────────────────────────────────────────
  const handleMove = async () => {
    if (!selectedProductId || !selectedIds.length) return;
    try {
      setMoving(true);
      setError('');
      await api.post('/asin-list-products/move', {
        asinIds: selectedIds,
        productId: selectedProductId
      });
      onMoved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to move ASINs');
    } finally {
      setMoving(false);
    }
  };

  const canMove = !!selectedCategoryId && !!selectedRangeId && !!selectedProductId && !moving;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Move to List</Typography>
          <Chip
            label={`${selectedIds.length} ASIN${selectedIds.length !== 1 ? 's' : ''} selected`}
            color="primary"
            size="small"
          />
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
          )}

          {/* ── Category ────────────────────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Category</Typography>
            {creatingCategory ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  placeholder="New category name…"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); if (e.key === 'Escape') handleCancelCategory(); }}
                />
                <IconButton color="primary" onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
                  <CheckIcon />
                </IconButton>
                <IconButton onClick={handleCancelCategory}>
                  <CloseIcon />
                </IconButton>
              </Stack>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel>Select category</InputLabel>
                <Select
                  value={selectedCategoryId}
                  label="Select category"
                  onChange={handleCategoryChange}
                  disabled={loadingCategories}
                  endAdornment={loadingCategories ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
                >
                  {categories.map(c => (
                    <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value={CREATE_NEW_VALUE}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <AddIcon fontSize="small" />
                      <Typography variant="body2">Create new category…</Typography>
                    </Stack>
                  </MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>

          {/* ── Range ───────────────────────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ color: !selectedCategoryId ? 'text.disabled' : 'text.primary' }}>
              Range
            </Typography>
            {creatingRange ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  placeholder="New range name…"
                  value={newRangeName}
                  onChange={e => setNewRangeName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateRange(); if (e.key === 'Escape') handleCancelRange(); }}
                />
                <IconButton color="primary" onClick={handleCreateRange} disabled={!newRangeName.trim()}>
                  <CheckIcon />
                </IconButton>
                <IconButton onClick={handleCancelRange}>
                  <CloseIcon />
                </IconButton>
              </Stack>
            ) : (
              <FormControl fullWidth size="small" disabled={!selectedCategoryId}>
                <InputLabel>Select range</InputLabel>
                <Select
                  value={selectedRangeId}
                  label="Select range"
                  onChange={handleRangeChange}
                  disabled={!selectedCategoryId || loadingRanges}
                  endAdornment={loadingRanges ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
                >
                  {ranges.map(r => (
                    <MenuItem key={r._id} value={r._id}>{r.name}</MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value={CREATE_NEW_VALUE} disabled={!selectedCategoryId}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <AddIcon fontSize="small" />
                      <Typography variant="body2">Create new range…</Typography>
                    </Stack>
                  </MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>

          {/* ── Product ─────────────────────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ color: !selectedRangeId ? 'text.disabled' : 'text.primary' }}>
              Product
            </Typography>
            {creatingProduct ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  placeholder="New product name…"
                  value={newProductName}
                  onChange={e => setNewProductName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateProduct(); if (e.key === 'Escape') handleCancelProduct(); }}
                />
                <IconButton color="primary" onClick={handleCreateProduct} disabled={!newProductName.trim()}>
                  <CheckIcon />
                </IconButton>
                <IconButton onClick={handleCancelProduct}>
                  <CloseIcon />
                </IconButton>
              </Stack>
            ) : (
              <FormControl fullWidth size="small" disabled={!selectedRangeId}>
                <InputLabel>Select product</InputLabel>
                <Select
                  value={selectedProductId}
                  label="Select product"
                  onChange={handleProductChange}
                  disabled={!selectedRangeId || loadingProducts}
                  endAdornment={loadingProducts ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
                >
                  {products.map(p => (
                    <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value={CREATE_NEW_VALUE} disabled={!selectedRangeId}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <AddIcon fontSize="small" />
                      <Typography variant="body2">Create new product…</Typography>
                    </Stack>
                  </MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>

          {/* ── Summary ─────────────────────────────────────────────── */}
          {selectedCategory && selectedRange && selectedProduct && (
            <Alert severity="info" icon={false}>
              <Typography variant="body2">
                Moving <strong>{selectedIds.length}</strong> ASIN{selectedIds.length !== 1 ? 's' : ''} to{' '}
                <strong>{selectedCategory.name}</strong>
                {' → '}
                <strong>{selectedRange.name}</strong>
                {' → '}
                <strong>{selectedProduct.name}</strong>
              </Typography>
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={moving}>Cancel</Button>
        <Button
          variant="contained"
          endIcon={moving ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />}
          onClick={handleMove}
          disabled={!canMove}
        >
          {moving ? 'Moving…' : 'Move'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
