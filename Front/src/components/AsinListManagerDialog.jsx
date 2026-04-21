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
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ChevronRight as ChevronRightIcon,
  Edit as EditIcon,
  ContentCopy as DuplicateIcon,
  CallMade as CopyToIcon
} from '@mui/icons-material';
import api from '../lib/api.js';

// ── Single panel component ─────────────────────────────────────────────────
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
  // Selectable / copy props
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  // Edit props
  onEdit,
  onDuplicate,
  editingId,
  editingName,
  onEditNameChange,
  onEditConfirm,
  onEditCancel,
  savingEdit,
  // Duplicate-inline props
  duplicatingSourceId,
  duplicateNewName,
  onDuplicateNameChange,
  onDuplicateConfirm,
  onDuplicateCancel,
  savingDuplicate,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

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

  const allSelected = items.length > 0 && selectedIds && selectedIds.size === items.length;
  const someSelected = selectedIds && selectedIds.size > 0 && selectedIds.size < items.length;

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
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {selectable && !disabled && (
              <Checkbox
                size="small"
                indeterminate={someSelected}
                checked={allSelected}
                onChange={onToggleAll}
                disabled={items.length === 0}
                sx={{ p: 0.25 }}
              />
            )}
            <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
          </Stack>
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
        ) : (
          <List dense disablePadding>
            {items.map(item => (
              <Box key={item._id}>
                {/* ── Normal / edit row ── */}
                <ListItem disablePadding>
                  {selectable && (
                    <Checkbox
                      size="small"
                      checked={selectedIds ? selectedIds.has(item._id) : false}
                      onChange={() => onToggleSelect(item._id)}
                      sx={{ ml: 0.5, flexShrink: 0 }}
                    />
                  )}

                  {editingId === item._id ? (
                    /* ── Inline edit field ── */
                    <Box sx={{ flex: 1, px: 1, py: 0.5 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <TextField
                          autoFocus
                          size="small"
                          fullWidth
                          value={editingName}
                          onChange={e => onEditNameChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onEditConfirm();
                            if (e.key === 'Escape') onEditCancel();
                          }}
                          disabled={savingEdit}
                        />
                        <IconButton size="small" color="success" onClick={onEditConfirm} disabled={!editingName.trim() || savingEdit}>
                          {savingEdit ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" onClick={onEditCancel} disabled={savingEdit}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Box>
                  ) : (
                    /* ── Normal row ── */
                    <>
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

                      {/* Action icons */}
                      <Stack direction="row" alignItems="center" sx={{ pr: 0.5, flexShrink: 0 }}>
                        {onEdit && (
                          <Tooltip title="Rename">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(item); }}>
                              <EditIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onDuplicate && (
                          <Tooltip title="Duplicate">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate(item); }}>
                              <DuplicateIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                          >
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </>
                  )}
                </ListItem>

                {/* ── Inline duplicate row (appears below source) ── */}
                {duplicatingSourceId === item._id && (
                  <ListItem disablePadding sx={{ bgcolor: 'action.hover' }}>
                    {selectable && <Box sx={{ width: 34, flexShrink: 0 }} />}
                    <Box sx={{ flex: 1, px: 1, py: 0.5 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <TextField
                          autoFocus
                          size="small"
                          fullWidth
                          placeholder="New product name"
                          value={duplicateNewName}
                          onChange={e => onDuplicateNameChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onDuplicateConfirm();
                            if (e.key === 'Escape') onDuplicateCancel();
                          }}
                          disabled={savingDuplicate}
                        />
                        <IconButton size="small" color="success" onClick={onDuplicateConfirm} disabled={!duplicateNewName.trim() || savingDuplicate}>
                          {savingDuplicate ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" onClick={onDuplicateCancel} disabled={savingDuplicate}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Box>
                  </ListItem>
                )}
              </Box>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}

// ── Main dialog ─────────────────────────────────────────────────────────────
export default function AsinListManagerDialog({ open, onClose }) {
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedRangeId, setSelectedRangeId] = useState('');

  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [savingCategory, setSavingCategory] = useState(false);
  const [savingRange, setSavingRange] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Confirm-delete state
  const [confirmDelete, setConfirmDelete] = useState(null); // { type, item }
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState('');

  // ── Product selection (for copy) ─────────────────────────────────────────
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());

  const handleToggleProductSelect = (id) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAllProducts = () => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map(p => p._id)));
    }
  };

  // ── Copy-to-range state ──────────────────────────────────────────────────
  const [copyDialog, setCopyDialog] = useState(false);
  const [allRanges, setAllRanges] = useState([]);
  const [loadingAllRanges, setLoadingAllRanges] = useState(false);
  const [targetRangeIds, setTargetRangeIds] = useState(new Set());
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  const openCopyDialog = async () => {
    setTargetRangeIds(new Set());
    setCopyDialog(true);
    if (allRanges.length === 0) {
      try {
        setLoadingAllRanges(true);
        const { data } = await api.get('/asin-list-ranges', { params: { all: 'true' } });
        setAllRanges(data);
      } catch {
        setError('Failed to load ranges');
      } finally {
        setLoadingAllRanges(false);
      }
    }
  };

  const handleToggleTargetRange = (id) => {
    setTargetRangeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAllTargetRanges = (rangeList) => {
    const ids = rangeList.map(r => r._id);
    const allChecked = ids.every(id => targetRangeIds.has(id));
    setTargetRangeIds(prev => {
      const next = new Set(prev);
      if (allChecked) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleCopyToRange = async () => {
    if (targetRangeIds.size === 0 || selectedProductIds.size === 0) return;
    try {
      setCopying(true);
      const { data } = await api.post('/asin-list-products/copy-to-range', {
        productIds: [...selectedProductIds],
        targetRangeIds: [...targetRangeIds]
      });
      const msg = `Copied ${data.copied} product(s) to ${data.rangesProcessed} range(s)` +
        (data.skipped > 0 ? `. ${data.skipped} already existed and were skipped.` : '.');
      setCopySuccess(msg);
      setCopyDialog(false);
      setSelectedProductIds(new Set());
      setTargetRangeIds(new Set());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to copy products');
    } finally {
      setCopying(false);
    }
  };

  // ── Product edit (rename) state ──────────────────────────────────────────
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProductName, setEditingProductName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const handleEditProduct = (item) => {
    setEditingProductId(item._id);
    setEditingProductName(item.name);
    setDuplicatingSourceId(null);
    setDuplicateNewName('');
  };

  const handleEditConfirm = async () => {
    if (!editingProductName.trim()) return;
    try {
      setSavingEdit(true);
      const { data } = await api.put(`/asin-list-products/${editingProductId}`, { name: editingProductName.trim() });
      setProducts(prev => prev.map(p => p._id === editingProductId ? data : p));
      setEditingProductId(null);
      setEditingProductName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename product');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditCancel = () => {
    setEditingProductId(null);
    setEditingProductName('');
  };

  // ── Product duplicate state ──────────────────────────────────────────────
  const [duplicatingSourceId, setDuplicatingSourceId] = useState(null);
  const [duplicateNewName, setDuplicateNewName] = useState('');
  const [savingDuplicate, setSavingDuplicate] = useState(false);

  const handleDuplicateProduct = (item) => {
    setDuplicatingSourceId(item._id);
    setDuplicateNewName(`${item.name} (copy)`);
    setEditingProductId(null);
    setEditingProductName('');
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateNewName.trim()) return;
    const selectedRange = ranges.find(r => r._id === selectedRangeId);
    try {
      setSavingDuplicate(true);
      const { data } = await api.post('/asin-list-products', {
        name: duplicateNewName.trim(),
        rangeId: selectedRangeId,
        categoryId: selectedRange?.categoryId || selectedCategoryId
      });
      setProducts(prev => {
        const idx = prev.findIndex(p => p._id === duplicatingSourceId);
        const next = [...prev];
        next.splice(idx + 1, 0, data);
        return next;
      });
      setDuplicatingSourceId(null);
      setDuplicateNewName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate product');
    } finally {
      setSavingDuplicate(false);
    }
  };

  const handleDuplicateCancel = () => {
    setDuplicatingSourceId(null);
    setDuplicateNewName('');
  };

  // ── Range edit (rename) state ────────────────────────────────────────────
  const [editingRangeId, setEditingRangeId] = useState(null);
  const [editingRangeName, setEditingRangeName] = useState('');
  const [savingRangeEdit, setSavingRangeEdit] = useState(false);

  const handleEditRange = (item) => {
    setEditingRangeId(item._id);
    setEditingRangeName(item.name);
    setDuplicatingRangeSourceId(null);
    setDuplicateRangeNewName('');
  };

  const handleEditRangeConfirm = async () => {
    if (!editingRangeName.trim()) return;
    try {
      setSavingRangeEdit(true);
      const { data } = await api.put(`/asin-list-ranges/${editingRangeId}`, { name: editingRangeName.trim() });
      setRanges(prev => prev.map(r => r._id === editingRangeId ? data : r));
      setEditingRangeId(null);
      setEditingRangeName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename range');
    } finally {
      setSavingRangeEdit(false);
    }
  };

  const handleEditRangeCancel = () => {
    setEditingRangeId(null);
    setEditingRangeName('');
  };

  // ── Range duplicate (shallow) state ─────────────────────────────────────
  const [duplicatingRangeSourceId, setDuplicatingRangeSourceId] = useState(null);
  const [duplicateRangeNewName, setDuplicateRangeNewName] = useState('');
  const [savingRangeDuplicate, setSavingRangeDuplicate] = useState(false);

  const handleDuplicateRange = (item) => {
    setDuplicatingRangeSourceId(item._id);
    setDuplicateRangeNewName(`${item.name} (copy)`);
    setEditingRangeId(null);
    setEditingRangeName('');
  };

  const handleDuplicateRangeConfirm = async () => {
    if (!duplicateRangeNewName.trim()) return;
    try {
      setSavingRangeDuplicate(true);
      const { data } = await api.post('/asin-list-ranges/duplicate', {
        sourceRangeId: duplicatingRangeSourceId,
        name: duplicateRangeNewName.trim()
      });
      setRanges(prev => {
        const idx = prev.findIndex(r => r._id === duplicatingRangeSourceId);
        const next = [...prev];
        next.splice(idx + 1, 0, data);
        return next;
      });
      setDuplicatingRangeSourceId(null);
      setDuplicateRangeNewName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate range');
    } finally {
      setSavingRangeDuplicate(false);
    }
  };

  const handleDuplicateRangeCancel = () => {
    setDuplicatingRangeSourceId(null);
    setDuplicateRangeNewName('');
  };

  // ── Fetch on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSelectedCategoryId('');
    setSelectedRangeId('');
    setRanges([]);
    setProducts([]);
    setError('');
    setCopySuccess('');
    setConfirmDelete(null);
    setSelectedProductIds(new Set());
    setEditingProductId(null);
    setDuplicatingSourceId(null);
    setEditingRangeId(null);
    setDuplicatingRangeSourceId(null);
    fetchCategories();
  }, [open]);

  useEffect(() => {
    setSelectedRangeId('');
    setProducts([]);
    setSelectedProductIds(new Set());
    setEditingProductId(null);
    setDuplicatingSourceId(null);
    setEditingRangeId(null);
    setDuplicatingRangeSourceId(null);
    if (selectedCategoryId) fetchRanges(selectedCategoryId);
    else setRanges([]);
  }, [selectedCategoryId]);

  useEffect(() => {
    setProducts([]);
    setSelectedProductIds(new Set());
    setEditingProductId(null);
    setDuplicatingSourceId(null);
    if (selectedRangeId) fetchProducts(selectedRangeId);
  }, [selectedRangeId]);

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

  // ── Add handlers ──────────────────────────────────────────────────────────
  const handleAddCategory = async (name) => {
    try {
      setSavingCategory(true);
      const { data } = await api.post('/asin-list-categories', { name });
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create range');
    } finally {
      setSavingRange(false);
    }
  };

  const handleAddProduct = async (name) => {
    const selectedRange = ranges.find(r => r._id === selectedRangeId);
    try {
      setSavingProduct(true);
      const { data } = await api.post('/asin-list-products', {
        name,
        rangeId: selectedRangeId,
        categoryId: selectedRange?.categoryId || selectedCategoryId
      });
      setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  };

  // ── Delete handlers ───────────────────────────────────────────────────────
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
        }
      } else if (type === 'range') {
        await api.delete(`/asin-list-ranges/${item._id}`);
        setRanges(prev => prev.filter(r => r._id !== item._id));
        if (selectedRangeId === item._id) {
          setSelectedRangeId('');
          setProducts([]);
        }
      } else if (type === 'product') {
        await api.delete(`/asin-list-products/${item._id}`);
        setProducts(prev => prev.filter(p => p._id !== item._id));
        setSelectedProductIds(prev => {
          const next = new Set(prev);
          next.delete(item._id);
          return next;
        });
      }
      setConfirmDelete(null);
    } catch {
      setError('Failed to delete item');
    } finally {
      setDeleting(false);
    }
  };

  // ── Confirm message ───────────────────────────────────────────────────────
  const confirmMessage = () => {
    if (!confirmDelete) return '';
    const { type, item } = confirmDelete;
    if (type === 'category') return `Delete category "${item.name}"? This will also delete all its Ranges and Products, and unassign any ASINs.`;
    if (type === 'range') return `Delete range "${item.name}"? This will also delete all its Products and unassign any ASINs.`;
    return `Delete product "${item.name}"? Any ASINs assigned to it will be unassigned.`;
  };

  // ── Grouped ranges for copy picker ────────────────────────────────────────
  const groupedRanges = allRanges
    .filter(r => r._id !== selectedRangeId)
    .reduce((acc, r) => {
      const cat = r.categoryName || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    }, {});

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700}>Manage Lists</Typography>
            <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
        </DialogTitle>
        <Divider />

        {error && (
          <Box sx={{ px: 3, pt: 2 }}>
            <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
          </Box>
        )}
        {copySuccess && (
          <Box sx={{ px: 3, pt: 2 }}>
            <Alert severity="success" onClose={() => setCopySuccess('')}>{copySuccess}</Alert>
          </Box>
        )}

        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', height: 420 }}>
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
              onEdit={handleEditRange}
              onDuplicate={handleDuplicateRange}
              editingId={editingRangeId}
              editingName={editingRangeName}
              onEditNameChange={setEditingRangeName}
              onEditConfirm={handleEditRangeConfirm}
              onEditCancel={handleEditRangeCancel}
              savingEdit={savingRangeEdit}
              duplicatingSourceId={duplicatingRangeSourceId}
              duplicateNewName={duplicateRangeNewName}
              onDuplicateNameChange={setDuplicateRangeNewName}
              onDuplicateConfirm={handleDuplicateRangeConfirm}
              onDuplicateCancel={handleDuplicateRangeCancel}
              savingDuplicate={savingRangeDuplicate}
            />
            <TaxonomyPanel
              title="Products"
              items={products}
              selectedId={null}
              onSelect={() => {}}
              onAdd={handleAddProduct}
              onDelete={(item) => handleDeleteRequest('product', item)}
              loading={loadingProducts}
              disabled={!selectedRangeId}
              emptyText="Select a range"
              addPlaceholder="Product name"
              saving={savingProduct}
              selectable={!!selectedRangeId}
              selectedIds={selectedProductIds}
              onToggleSelect={handleToggleProductSelect}
              onToggleAll={handleToggleAllProducts}
              onEdit={handleEditProduct}
              onDuplicate={handleDuplicateProduct}
              editingId={editingProductId}
              editingName={editingProductName}
              onEditNameChange={setEditingProductName}
              onEditConfirm={handleEditConfirm}
              onEditCancel={handleEditCancel}
              savingEdit={savingEdit}
              duplicatingSourceId={duplicatingSourceId}
              duplicateNewName={duplicateNewName}
              onDuplicateNameChange={setDuplicateNewName}
              onDuplicateConfirm={handleDuplicateConfirm}
              onDuplicateCancel={handleDuplicateCancel}
              savingDuplicate={savingDuplicate}
            />
          </Box>

          {/* ── Copy-to-range toolbar ── */}
          {selectedProductIds.size > 0 && (
            <Box sx={{ px: 2, py: 1, bgcolor: 'primary.50', borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  label={`${selectedProductIds.size} product${selectedProductIds.size > 1 ? 's' : ''} selected`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<CopyToIcon fontSize="small" />}
                  onClick={openCopyDialog}
                >
                  Copy to Range
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setSelectedProductIds(new Set())}
                >
                  Clear
                </Button>
              </Stack>
            </Box>
          )}
        </DialogContent>

        <Divider />
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={onClose} variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Copy-to-range sub-dialog ── */}
      <Dialog open={copyDialog} onClose={() => setCopyDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Copy {selectedProductIds.size} product{selectedProductIds.size > 1 ? 's' : ''} to ranges
        </DialogTitle>
        <DialogContent sx={{ pt: 1, px: 1 }}>
          {(() => {
            const availableRanges = ranges.filter(r => r._id !== selectedRangeId);
            const allChecked = availableRanges.length > 0 && availableRanges.every(r => targetRangeIds.has(r._id));
            const someChecked = availableRanges.some(r => targetRangeIds.has(r._id));
            return (
              <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
                {availableRanges.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                    No other ranges in this category
                  </Typography>
                ) : (
                  <>
                    {/* Select All */}
                    <ListItem disablePadding dense>
                      <ListItemButton dense onClick={() => handleToggleAllTargetRanges(availableRanges)} sx={{ py: 0.5 }}>
                        <Checkbox
                          size="small"
                          checked={allChecked}
                          indeterminate={someChecked && !allChecked}
                          sx={{ mr: 0.5 }}
                        />
                        <ListItemText primary={<Typography variant="body2" fontWeight={600}>Select All</Typography>} />
                        <Typography variant="caption" color="text.secondary">
                          {targetRangeIds.size} selected
                        </Typography>
                      </ListItemButton>
                    </ListItem>
                    <Divider />
                    {/* Flat range list */}
                    {availableRanges.map(r => (
                      <ListItem key={r._id} disablePadding dense>
                        <ListItemButton dense onClick={() => handleToggleTargetRange(r._id)} sx={{ py: 0.25 }}>
                          <Checkbox
                            size="small"
                            checked={targetRangeIds.has(r._id)}
                            sx={{ mr: 0.5 }}
                          />
                          <ListItemText primary={<Typography variant="body2">{r.name}</Typography>} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </>
                )}
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialog(false)} disabled={copying}>Cancel</Button>
          <Button
            onClick={handleCopyToRange}
            variant="contained"
            disabled={targetRangeIds.size === 0 || copying}
            startIcon={copying ? <CircularProgress size={14} /> : <CopyToIcon />}
          >
            {copying ? 'Copying…' : `Copy to ${targetRangeIds.size || ''} Range${targetRangeIds.size !== 1 ? 's' : ''}`}
          </Button>
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
