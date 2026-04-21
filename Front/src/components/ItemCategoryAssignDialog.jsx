import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  TextField,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import InputAdornment from '@mui/material/InputAdornment';
import api from '../lib/api.js';

// ── Simplified taxonomy panel (add/select/delete only) ─────────────────────
function TaxonomyPanel({
  title,
  items,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  loading,
  disabled,
  emptyText,
  addPlaceholder,
  saving,
  searchable,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset search when items change (panel switches to new category/range)
  useEffect(() => { setSearchQuery(''); }, [items]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName('');
    setAdding(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
  };

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderRight: 'none' }
      }}
    >
      {/* Panel header */}
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
          {!disabled && (
            <Tooltip title={`Add ${title.slice(0, -1)}`}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => setAdding(true)}
                  disabled={adding || disabled}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {/* Search bar */}
      {searchable && !disabled && !loading && (
        <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            fullWidth
            placeholder={`Search ${title.toLowerCase()}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} edge="end">
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null
            }}
            sx={{ '& input': { py: 0.5, fontSize: 13 } }}
          />
        </Box>
      )}

      {/* Inline add field */}
      {adding && (
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <TextField
              autoFocus
              size="small"
              fullWidth
              placeholder={addPlaceholder}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
            />
            <IconButton size="small" color="success" onClick={handleAdd} disabled={!newName.trim() || saving}>
              {saving ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
            </IconButton>
            <IconButton size="small" onClick={() => { setAdding(false); setNewName(''); }} disabled={saving}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
      )}

      {/* List */}
      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : disabled ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.disabled">{emptyText}</Typography>
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No items yet</Typography>
          </Box>
        ) : (() => {
          const filtered = searchQuery.trim()
            ? items.filter(item => item.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            : items;
          return filtered.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">No matches</Typography>
            </Box>
          ) : (
          <List dense disablePadding>
            {filtered.map(item => (
              <ListItem key={item._id} disablePadding>
                <ListItemButton
                  selected={selectedId === item._id}
                  onClick={() => onSelect && onSelect(item._id)}
                  sx={{ pr: 1, flex: 1 }}
                >
                  <ListItemText
                    primary={item.name}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  />
                  {onSelect && selectedId === item._id && (
                    <ChevronRightIcon fontSize="small" sx={{ color: 'primary.main', flexShrink: 0 }} />
                  )}
                </ListItemButton>
                {onDelete && (
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                      sx={{ flexShrink: 0, mr: 0.5 }}
                    >
                      <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItem>
            ))}
          </List>
          )
        })()
        }
      </Box>
    </Box>
  );
}

// ── Main dialog ─────────────────────────────────────────────────────────────
export default function ItemCategoryAssignDialog({
  open,
  onClose,
  itemNumber,
  productTitle,
  currentCategoryId,
  currentRangeId,
  currentProductId,
  onAssign,
  onClear,
}) {
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedRangeId, setSelectedRangeId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [savingCategory, setSavingCategory] = useState(false);
  const [savingRange, setSavingRange] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Confirm-delete state
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmDelete(null);
    // Skip re-fetching categories if we already have them cached
    if (categories.length === 0) {
      fetchCategories();
    }
  }, [open]);

  // Pre-select current values when categories load
  useEffect(() => {
    if (!open || categories.length === 0) return;
    if (currentCategoryId) {
      setSelectedCategoryId(currentCategoryId);
    } else {
      setSelectedCategoryId('');
      setRanges([]);
      setProducts([]);
      setSelectedRangeId('');
      setSelectedProductId('');
    }
  }, [open, categories, currentCategoryId]);

  // Fetch ranges when category selected
  useEffect(() => {
    setSelectedRangeId('');
    setSelectedProductId('');
    setProducts([]);
    if (selectedCategoryId) {
      fetchRanges(selectedCategoryId);
    } else {
      setRanges([]);
    }
  }, [selectedCategoryId]);

  // Pre-select current range once ranges load
  useEffect(() => {
    if (ranges.length === 0) return;
    if (currentRangeId && selectedCategoryId === currentCategoryId) {
      setSelectedRangeId(currentRangeId);
    }
  }, [ranges, currentRangeId, selectedCategoryId, currentCategoryId]);

  // Fetch products when range selected
  useEffect(() => {
    setSelectedProductId('');
    if (selectedRangeId) {
      fetchProducts(selectedRangeId);
    } else {
      setProducts([]);
    }
  }, [selectedRangeId]);

  // Pre-select current product once products load
  useEffect(() => {
    if (products.length === 0) return;
    if (currentProductId && selectedRangeId === currentRangeId) {
      setSelectedProductId(currentProductId);
    }
  }, [products, currentProductId, selectedRangeId, currentRangeId]);

  const fetchCategories = async () => {
    try {
      setLoadingCategories(true);
      const { data } = await api.get('/asin-list-categories');
      setCategories(data);
    } catch { setError('Failed to load categories'); }
    finally { setLoadingCategories(false); }
  };

  const fetchRanges = async (catId) => {
    try {
      setLoadingRanges(true);
      const { data } = await api.get('/asin-list-ranges', { params: { categoryId: catId } });
      setRanges(data);
    } catch { setError('Failed to load ranges'); }
    finally { setLoadingRanges(false); }
  };

  const fetchProducts = async (rngId) => {
    try {
      setLoadingProducts(true);
      const { data } = await api.get('/asin-list-products', { params: { rangeId: rngId } });
      setProducts(data);
    } catch { setError('Failed to load products'); }
    finally { setLoadingProducts(false); }
  };

  // ── Add handlers ────────────────────────────────────────────────────────
  const handleAddCategory = async (name) => {
    try {
      setSavingCategory(true);
      const { data } = await api.post('/asin-list-categories', { name });
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCategoryId(data._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleAddRange = async (name) => {
    try {
      setSavingRange(true);
      const { data } = await api.post('/asin-list-ranges', { name, categoryId: selectedCategoryId });
      setRanges(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedRangeId(data._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create range');
    } finally {
      setSavingRange(false);
    }
  };

  const handleAddProduct = async (name) => {
    try {
      setSavingProduct(true);
      const { data } = await api.post('/asin-list-products', {
        name,
        rangeId: selectedRangeId,
        categoryId: selectedCategoryId
      });
      setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedProductId(data._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  };

  // ── Delete handlers ─────────────────────────────────────────────────────
  const handleDeleteRequest = (type, item) => {
    setConfirmDelete({ type, item });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const { type, item } = confirmDelete;
    try {
      setDeleting(true);
      if (type === 'category') {
        await api.delete(`/asin-list-categories/${item._id}`);
        setCategories(prev => prev.filter(c => c._id !== item._id));
        if (selectedCategoryId === item._id) {
          setSelectedCategoryId('');
          setRanges([]);
          setSelectedRangeId('');
          setProducts([]);
          setSelectedProductId('');
        }
      } else if (type === 'range') {
        await api.delete(`/asin-list-ranges/${item._id}`);
        setRanges(prev => prev.filter(r => r._id !== item._id));
        if (selectedRangeId === item._id) {
          setSelectedRangeId('');
          setProducts([]);
          setSelectedProductId('');
        }
      } else if (type === 'product') {
        await api.delete(`/asin-list-products/${item._id}`);
        setProducts(prev => prev.filter(p => p._id !== item._id));
        if (selectedProductId === item._id) {
          setSelectedProductId('');
        }
      }
      setConfirmDelete(null);
    } catch {
      setError('Failed to delete item');
    } finally {
      setDeleting(false);
    }
  };

  const confirmMessage = () => {
    if (!confirmDelete) return '';
    const { type, item } = confirmDelete;
    if (type === 'category') return `Delete category "${item.name}"? This will also delete all its Ranges and Products.`;
    if (type === 'range') return `Delete range "${item.name}"? This will also delete all its Products.`;
    return `Delete product "${item.name}"?`;
  };

  // ── Assign handler ──────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!selectedCategoryId) return;
    try {
      setSaving(true);
      await onAssign(itemNumber, selectedCategoryId, selectedRangeId || null, selectedProductId || null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign category');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      setSaving(true);
      await onClear(itemNumber);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clear category');
    } finally {
      setSaving(false);
    }
  };

  // Build breadcrumb preview
  const selectedCatName = categories.find(c => c._id === selectedCategoryId)?.name;
  const selectedRangeName = ranges.find(r => r._id === selectedRangeId)?.name;
  const selectedProductName = products.find(p => p._id === selectedProductId)?.name;

  const breadcrumb = [selectedCatName, selectedRangeName, selectedProductName].filter(Boolean).join(' > ');

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6" fontWeight={700}>Assign Category</Typography>
              <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
            </Stack>
            {productTitle && (
              <Typography variant="body2" color="text.secondary" noWrap>
                Item: {productTitle} {itemNumber && `(${itemNumber})`}
              </Typography>
            )}
          </Stack>
        </DialogTitle>
        <Divider />

        {error && (
          <Box sx={{ px: 3, pt: 2 }}>
            <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
          </Box>
        )}

        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', height: 380 }}>
            <TaxonomyPanel
              title="Categories"
              items={categories}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
              onAdd={handleAddCategory}
              onDelete={(item) => handleDeleteRequest('category', item)}
              loading={loadingCategories}
              disabled={false}
              emptyText=""
              addPlaceholder="Category name"
              saving={savingCategory}
            />
            <TaxonomyPanel
              title="Ranges"
              items={ranges}
              selectedId={selectedRangeId}
              onSelect={setSelectedRangeId}
              onAdd={handleAddRange}
              onDelete={(item) => handleDeleteRequest('range', item)}
              loading={loadingRanges}
              disabled={!selectedCategoryId}
              emptyText="Select a category"
              addPlaceholder="Range name"
              saving={savingRange}
              searchable
            />
            <TaxonomyPanel
              title="Products"
              items={products}
              selectedId={selectedProductId}
              onSelect={setSelectedProductId}
              onAdd={handleAddProduct}
              onDelete={(item) => handleDeleteRequest('product', item)}
              loading={loadingProducts}
              disabled={!selectedRangeId}
              emptyText="Select a range"
              addPlaceholder="Product name"
              saving={savingProduct}
              searchable
            />
          </Box>

          {/* Selection preview */}
          {breadcrumb && (
            <Box sx={{ px: 3, py: 1.5, bgcolor: 'grey.50', borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                  Selection:
                </Typography>
                <Chip label={breadcrumb} size="small" color="primary" variant="outlined" />
              </Stack>
            </Box>
          )}
        </DialogContent>

        <Divider />
        <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
          <Box>
            {currentCategoryId && (
              <Button
                onClick={handleClear}
                color="error"
                variant="text"
                disabled={saving}
                startIcon={<DeleteIcon />}
              >
                Clear Assignment
              </Button>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} variant="outlined" disabled={saving}>Cancel</Button>
            <Button
              onClick={handleAssign}
              variant="contained"
              disabled={!selectedCategoryId || saving}
              startIcon={saving ? <CircularProgress size={14} /> : <CheckIcon />}
            >
              Assign
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      {/* ── Confirm delete dialog ── */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirmMessage()}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} /> : <DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
