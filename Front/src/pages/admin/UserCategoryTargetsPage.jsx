import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddTaskIcon from '@mui/icons-material/AddTask';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import api from '../../lib/api';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import { tableBodyCellSx, tableBodyRowSx, tableHeaderCellSx, yellowFilledButtonSx } from '../../theme/tableStyles.js';

const EMPTY_FORM = {
  user: null,
  seller: null,
  marketplace: '',
  category: null,
  range: null,
  dailyDesiredQuantity: '',
};

const MARKETPLACES = ['US', 'UK', 'AU', 'Canada'];

export default function UserCategoryTargetsPage() {
  const theme = useTheme();
  const [users, setUsers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [targets, setTargets] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [targetFilters, setTargetFilters] = useState({
    user: null,
    search: '',
  });

  const inputSx = {
    '& label.Mui-focused': { color: `${BRAND_YELLOW_DARK} !important` },
    '& .MuiOutlinedInput-root': {
      borderRadius: 1.5,
      '&:hover fieldset': { borderColor: `${alpha(BRAND_DARK, 0.35)} !important` },
      '&.Mui-focused fieldset': { borderColor: `${BRAND_YELLOW_DARK} !important` },
    },
  };

  useEffect(() => {
    loadPage();
  }, []);

  const loadPage = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, sellersRes, categoriesRes, rangesRes, targetsRes] = await Promise.all([
        api.get('/users'),
        api.get('/sellers/all'),
        api.get('/asin-list-categories'),
        api.get('/asin-list-ranges', { params: { all: true } }),
        api.get('/user-category-targets'),
      ]);

      setUsers((usersRes.data || []).filter((user) => user.role !== 'seller'));
      setSellers(sellersRes.data || []);
      setCategories(categoriesRes.data || []);
      setRanges(rangesRes.data || []);
      setTargets(targetsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load desired quantity targets.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTargets = async () => {
    const { data } = await api.get('/user-category-targets');
    setTargets(data || []);
  };

  const getUserLabel = (user) => {
    if (!user) return '';
    const detail = user.email || user.role || '';
    return detail ? `${user.username} (${detail})` : user.username;
  };

  const getSellerLabel = (seller) => seller?.user?.username || seller?.user?.email || seller?.storeName || seller?._id || '';

  const getCategoryLabel = (category) => category?.name || '';
  const getRangeLabel = (range) => range?.name || '';

  const selectedUserTargets = useMemo(() => {
    const normalizedSearch = targetFilters.search.trim().toLowerCase();

    return targets.filter((target) => {
      const matchesUser = !targetFilters.user || target.user?._id === targetFilters.user._id;
      if (!matchesUser) return false;

      if (!normalizedSearch) return true;

      const searchableText = [
        getUserLabel(target.user),
        target.user?.department,
        getSellerLabel(target.seller),
        target.marketplace,
        target.category?.name,
        target.range?.name,
        target.dailyDesiredQuantity,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [targetFilters, targets]);

  const selectedUserSummary = useMemo(() => {
    const sellerNames = new Set();
    const categoryNames = new Set();
    const totalQuantity = selectedUserTargets.reduce((sum, target) => {
      if (target.seller) sellerNames.add(getSellerLabel(target.seller));
      if (target.category?.name) categoryNames.add(target.category.name);
      return sum + Number(target.dailyDesiredQuantity || 0);
    }, 0);

    return {
      sellers: sellerNames.size,
      categories: categoryNames.size,
      totalQuantity,
    };
  }, [selectedUserTargets]);

  const filteredRanges = form.category
    ? ranges.filter((range) => String(range.categoryId?._id || range.categoryId) === form.category._id)
    : [];

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleEdit = (target) => {
    setEditingId(target._id);
    setForm({
      user: users.find((user) => user._id === target.user?._id) || target.user || null,
      seller: sellers.find((seller) => seller._id === target.seller?._id) || target.seller || null,
      marketplace: target.marketplace || '',
      category: categories.find((category) => category._id === target.category?._id) || target.category || null,
      range: ranges.find((range) => range._id === target.range?._id) || target.range || null,
      dailyDesiredQuantity: String(target.dailyDesiredQuantity ?? 0),
    });
    setError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    setError('');
    setMessage('');

    if (!form.user) return setError('Please select a user.');
    if (!form.seller) return setError('Please select a seller.');
    if (!form.marketplace) return setError('Please select a marketplace.');
    if (!form.category) return setError('Please select a category.');

    const quantity = Number(form.dailyDesiredQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return setError('Daily desired quantity must be 0 or higher.');
    }

    setSaving(true);
    try {
      await api.post('/user-category-targets', {
        userId: form.user._id,
        sellerId: form.seller._id,
        marketplace: form.marketplace,
        categoryId: form.category._id,
        rangeId: form.range?._id || null,
        dailyDesiredQuantity: quantity,
      });
      setMessage(editingId ? 'Desired quantity updated.' : 'Desired quantity saved.');
      resetForm();
      await fetchTargets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save desired quantity.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleteId(id);
    setError('');
    setMessage('');
    try {
      await api.delete(`/user-category-targets/${id}`);
      setTargets((prev) => prev.filter((target) => target._id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete desired quantity.');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 5, backgroundColor: theme.palette.background.paper, minHeight: '100vh' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ pt: 2.5, mb: 3 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            flexShrink: 0,
            background: BRAND_DARK,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 12px ${alpha(BRAND_DARK, 0.24)}`,
          }}
        >
          <AddTaskIcon sx={{ color: BRAND_YELLOW, fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ color: BRAND_DARK }}>
            User Category Targets
          </Typography>
          <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.5), fontWeight: 500 }}>
            Set editable daily desired quantities by user, seller, and category
          </Typography>
        </Box>
      </Stack>

      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ color: BRAND_DARK, mb: 2 }}>
          {editingId ? 'Edit Desired Quantity' : 'Set Desired Quantity'}
        </Typography>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
          <Autocomplete
            options={users}
            getOptionLabel={getUserLabel}
            value={form.user}
            onChange={(_, value) => setForm((prev) => ({ ...prev, user: value }))}
            isOptionEqualToValue={(option, value) => option._id === value._id}
            sx={{ minWidth: 240, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="User" sx={inputSx} />}
          />
          <Autocomplete
            options={sellers}
            getOptionLabel={getSellerLabel}
            value={form.seller}
            onChange={(_, value) => setForm((prev) => ({ ...prev, seller: value }))}
            isOptionEqualToValue={(option, value) => option._id === value._id}
            sx={{ minWidth: 240, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="Seller" sx={inputSx} />}
          />
          <FormControl sx={{ minWidth: 170 }}>
            <InputLabel sx={{ '&.Mui-focused': { color: BRAND_YELLOW_DARK } }}>Marketplace</InputLabel>
            <Select
              value={form.marketplace}
              label="Marketplace"
              onChange={(event) => setForm((prev) => ({ ...prev, marketplace: event.target.value }))}
              sx={{
                borderRadius: 1.5,
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${BRAND_YELLOW_DARK} !important` },
              }}
            >
              {MARKETPLACES.map((marketplace) => (
                <MenuItem key={marketplace} value={marketplace}>{marketplace}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            options={categories}
            getOptionLabel={getCategoryLabel}
            value={form.category}
            onChange={(_, value) => setForm((prev) => ({ ...prev, category: value, range: null }))}
            isOptionEqualToValue={(option, value) => option._id === value._id}
            sx={{ minWidth: 220, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="Category" sx={inputSx} />}
          />
          <Autocomplete
            options={filteredRanges}
            getOptionLabel={getRangeLabel}
            value={form.range}
            onChange={(_, value) => setForm((prev) => ({ ...prev, range: value }))}
            isOptionEqualToValue={(option, value) => option._id === value._id}
            disabled={!form.category}
            sx={{ minWidth: 220, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="Range (Optional)" sx={inputSx} />}
          />
          <TextField
            label="Daily Desired Quantity"
            type="number"
            value={form.dailyDesiredQuantity}
            onChange={(event) => setForm((prev) => ({ ...prev, dailyDesiredQuantity: event.target.value }))}
            inputProps={{ min: 0, step: 1 }}
            sx={{ minWidth: 220, ...inputSx }}
          />
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || loading}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddTaskIcon />}
            sx={yellowFilledButtonSx}
          >
            {saving ? 'Saving...' : editingId ? 'Update Quantity' : 'Save Quantity'}
          </Button>
          {editingId && (
            <Button
              variant="outlined"
              startIcon={<CancelIcon />}
              onClick={resetForm}
              sx={{ borderRadius: 1.5, color: BRAND_DARK, borderColor: alpha(BRAND_DARK, 0.3) }}
            >
              Cancel
            </Button>
          )}
          {error && <Alert severity="error" sx={{ py: 0, flexGrow: 1 }}>{error}</Alert>}
          {message && <Alert severity="success" sx={{ py: 0, flexGrow: 1 }}>{message}</Alert>}
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}`, overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.08)}` }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: BRAND_DARK }}>
                Saved Desired Quantities
                {!loading && (
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: alpha(BRAND_DARK, 0.45), fontWeight: 500 }}>
                    ({selectedUserTargets.length} of {targets.length} record{targets.length === 1 ? '' : 's'})
                  </Typography>
                )}
              </Typography>
              {!loading && targetFilters.user && (
                <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.55), fontWeight: 600 }}>
                  {selectedUserSummary.totalQuantity.toLocaleString()} daily quota across {selectedUserSummary.sellers} seller{selectedUserSummary.sellers === 1 ? '' : 's'} and {selectedUserSummary.categories} categor{selectedUserSummary.categories === 1 ? 'y' : 'ies'}
                </Typography>
              )}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ minWidth: { md: 680 } }}>
              <Autocomplete
                options={users}
                getOptionLabel={getUserLabel}
                value={targetFilters.user}
                onChange={(_, value) => setTargetFilters((prev) => ({ ...prev, user: value }))}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                sx={{ minWidth: { xs: '100%', sm: 280 }, flex: 1 }}
                renderInput={(params) => <TextField {...params} label="View assignments for user" size="small" sx={inputSx} />}
              />
              <TextField
                label="Search seller, category, range"
                size="small"
                value={targetFilters.search}
                onChange={(event) => setTargetFilters((prev) => ({ ...prev, search: event.target.value }))}
                sx={{ minWidth: { xs: '100%', sm: 260 }, flex: 1, ...inputSx }}
              />
              {(targetFilters.user || targetFilters.search) && (
                <Button
                  variant="outlined"
                  onClick={() => setTargetFilters({ user: null, search: '' })}
                  sx={{ borderRadius: 1.5, color: BRAND_DARK, borderColor: alpha(BRAND_DARK, 0.3), whiteSpace: 'nowrap' }}
                >
                  Clear
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>

        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: BRAND_YELLOW_DARK }} />
          </Box>
        ) : targets.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.45) }}>
              No desired quantities saved yet.
            </Typography>
          </Box>
        ) : selectedUserTargets.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.45) }}>
              No saved desired quantities match the selected filters.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>User</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Department</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Seller</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Marketplace</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Category</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Range</TableCell>
                  <TableCell sx={tableHeaderCellSx} align="right">Daily Desired Quantity</TableCell>
                  <TableCell sx={tableHeaderCellSx} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedUserTargets.map((target) => {
                  const isEditing = editingId === target._id;
                  return (
                    <TableRow key={target._id} sx={{ ...tableBodyRowSx, ...(isEditing ? { '& td': { backgroundColor: `${alpha(BRAND_YELLOW, 0.14)} !important` } } : {}) }}>
                      <TableCell sx={tableBodyCellSx}>{getUserLabel(target.user)}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{target.user?.department || '-'}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{getSellerLabel(target.seller)}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{target.marketplace || '-'}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{target.category?.name || '-'}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{target.range?.name || 'All ranges'}</TableCell>
                      <TableCell sx={{ ...tableBodyCellSx, fontWeight: 700 }} align="right">
                        {Number(target.dailyDesiredQuantity || 0).toLocaleString()}
                      </TableCell>
                      <TableCell sx={tableBodyCellSx} align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Edit">
                            <span>
                              <IconButton size="small" onClick={() => handleEdit(target)} sx={{ color: BRAND_DARK }}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <span>
                              <IconButton size="small" onClick={() => handleDelete(target._id)} disabled={deleteId === target._id} sx={{ color: '#c0392b' }}>
                                {deleteId === target._id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
