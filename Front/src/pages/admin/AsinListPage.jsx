import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Alert,
  Checkbox,
  TextField,
  InputAdornment,
  TablePagination,
  Toolbar,
  Tooltip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Chip,
  Autocomplete
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Search as SearchIcon,
  BrokenImage as BrokenImageIcon,
  AddCircle as AddCircleIcon
} from '@mui/icons-material';
import api, { getAuthToken } from '../../lib/api.js';
import AsinReviewModal from '../../components/AsinReviewModal.jsx';
import { useNavigate } from 'react-router-dom';
import AsinListCreateDialog from '../../components/AsinListCreateDialog.jsx';

export default function AsinListPage() {
  const navigate = useNavigate();
  // ── Taxonomy dropdowns ──────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [products, setProducts] = useState([]);

  const [categoryId, setCategoryId] = useState('');
  const [rangeId, setRangeId] = useState('');
  const [productId, setProductId] = useState('');

  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ── Table data ──────────────────────────────────────────────────────────────
  const [asins, setAsins] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(false);

  // ── Selection ───────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState([]);

  // ── Filters ──────────────────────────────────────────────────────
  const [keyword, setKeyword] = useState('');
  const [searchActive, setSearchActive] = useState('');  // committed on button press

  // placeholder — no logic wired yet
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [priceMinActive, setPriceMinActive] = useState('');
  const [priceMaxActive, setPriceMaxActive] = useState('');
  const [ordersComparator, setOrdersComparator] = useState('more than');
  const [ordersValue, setOrdersValue] = useState('');

  // Moved-to-list date filter
  const [movedAfter, setMovedAfter] = useState('');
  const [movedBefore, setMovedBefore] = useState('');

  // ── Feedback ────────────────────────────────────────────────────────────────
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Create Listing flow ──────────────────────────────────────────────────────
  const [createDialog, setCreateDialog] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [activeSellerId, setActiveSellerId] = useState('');

  // ── Taxonomy fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    setRanges([]);
    setRangeId('');
    setProducts([]);
    setProductId('');
    if (categoryId) fetchRanges(categoryId);
  }, [categoryId]);

  useEffect(() => {
    setProducts([]);
    setProductId('');
    if (rangeId) fetchProducts(rangeId);
  }, [rangeId]);

  const fetchCategories = async () => {
    try {
      setLoadingCategories(true);
      const { data } = await api.get('/asin-list-categories');
      setCategories(data);
    } catch {
      // silent
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchRanges = async (catId) => {
    try {
      setLoadingRanges(true);
      const { data } = await api.get('/asin-list-ranges', { params: { categoryId: catId } });
      setRanges(data);
    } catch {
      // silent
    } finally {
      setLoadingRanges(false);
    }
  };

  const fetchProducts = async (rngId) => {
    try {
      setLoadingProducts(true);
      const { data } = await api.get('/asin-list-products', { params: { rangeId: rngId } });
      setProducts(data);
    } catch {
      // silent
    } finally {
      setLoadingProducts(false);
    }
  };

  // ── Table fetch ─────────────────────────────────────────────────────────────
  const fetchAsins = useCallback(async () => {
    if (!rangeId) return;
    try {
      setLoading(true);
      const { data } = await api.get('/asin-directory', {
        params: {
          listProductId: productId || undefined,
          rangeId: !productId && rangeId ? rangeId : undefined,
          page: page + 1,
          limit: rowsPerPage,
          search: searchActive || undefined,
          priceMin: priceMinActive || undefined,
          priceMax: priceMaxActive || undefined,
          movedAfter: movedAfter || undefined,
          movedBefore: movedBefore || undefined,
        }
      });
      setAsins(data.asins || []);
      setTotal(data.total || 0);
      setSelected([]);
    } catch {
      setError('Failed to load ASINs');
    } finally {
      setLoading(false);
    }
  }, [productId, rangeId, page, rowsPerPage, searchActive, priceMinActive, priceMaxActive, movedAfter, movedBefore]);

  useEffect(() => {
    if (rangeId) {
      fetchAsins();
    } else {
      setAsins([]);
      setTotal(0);
      setSelected([]);
    }
  }, [fetchAsins, rangeId]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const isAllSelected = asins.length > 0 && selected.length === asins.length;
  const isIndeterminate = selected.length > 0 && selected.length < asins.length;

  const handleSelectAll = (e) => {
    setSelected(e.target.checked ? asins.map(a => a._id) : []);
  };

  const handleSelectRow = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await api.delete(`/asin-directory/${id}`);
      setSuccess('ASIN removed');
      fetchAsins();
    } catch {
      setError('Failed to delete ASIN');
    }
  };

  const handleBulkDelete = async () => {
    try {
      await api.post('/asin-directory/bulk-delete', { ids: selected });
      setSuccess(`${selected.length} ASINs deleted`);
      fetchAsins();
    } catch {
      setError('Failed to delete selected ASINs');
    }
  };

  // ── Pagination ───────────────────────────────────────────────────────────────
  const handleChangePage = (_, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  // ── Search (button-triggered) ────────────────────────────────────────────────
  const handleSearchSubmit = (e) => {
    if (e.key && e.key !== 'Enter') return;
    setPage(0);
    setSearchActive(keyword);
  };
  // ── Price filter (apply on Enter or blur) ───────────────────────────────
  const commitPriceFilter = (e) => {
    if (e.key && e.key !== 'Enter') return;
    setPage(0);
    setPriceMinActive(priceMin);
    setPriceMaxActive(priceMax);
  };
  // ── Create Listing handlers ──────────────────────────────────────────────────
  const handleCreateConfirmed = ({ sellerId, templateId, template }) => {
    setActiveSellerId(sellerId);
    setActiveTemplate(template);
    setCreateDialog(false);

    // Build loading placeholders so the modal opens immediately
    const selectedAsins = asins.filter(a => selected.includes(a._id));
    const placeholders = selectedAsins.map(a => ({
      id: `preview-${a.asin}`,
      asin: a.asin,
      sku: '',
      status: 'loading',
      generatedListing: null,
      warnings: [],
      errors: []
    }));
    setPreviewItems(placeholders);
    setReviewModal(true);

    // Connect SSE stream
    const asinParam = selectedAsins.map(a => a.asin).join(',');
    const authToken = getAuthToken();
    const sseUrl =
      `/template-listings/bulk-preview-from-directory-stream` +
      `?templateId=${templateId}&sellerId=${sellerId}` +
      `&asins=${encodeURIComponent(asinParam)}&token=${encodeURIComponent(authToken)}`;

    const eventSource = new EventSource(api.defaults.baseURL + sseUrl);
    window._directoryEventSource = eventSource;

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        window._directoryEventSource = null;
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'item') {
          setPreviewItems(prev =>
            prev.map(p => p.id === payload.item.id ? payload.item : p)
          );
        }
      } catch { /* ignore parse errors */ }
    };

    eventSource.onerror = () => {
      eventSource.close();
      window._directoryEventSource = null;
    };
  };

  const handleSaveFromReview = async (listings) => {
    try {
      const { data } = await api.post('/template-listings/bulk-save', {
        templateId: activeTemplate._id,
        sellerId: activeSellerId,
        listings,
        options: { skipDuplicates: true }
      });
      setReviewModal(false);
      setPreviewItems([]);
      setSelected([]);
      navigate(`/admin/template-listings?templateId=${activeTemplate._id}&sellerId=${activeSellerId}&fromAsinList=true`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save listings');
    }
  };

  // ── Image helper ─────────────────────────────────────────────────────────────
  const [imgErrors, setImgErrors] = useState({});
  const handleImgError = (id) => setImgErrors(prev => ({ ...prev, [id]: true }));

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Feedback */}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>

          {/* Row 1: Dropdowns + Keyword + Create Listing */}
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">

            {/* Category */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryId}
                label="Category"
                onChange={e => { setCategoryId(e.target.value); setPage(0); }}
                disabled={loadingCategories}
                endAdornment={loadingCategories ? <CircularProgress size={14} sx={{ mr: 2 }} /> : null}
              >
                <MenuItem value=""><em>All</em></MenuItem>
                {categories.map(c => (
                  <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Range */}
            <Autocomplete
              size="small"
              sx={{ minWidth: 200 }}
              disabled={!categoryId || loadingRanges}
              options={[{ _id: '', name: 'All' }, ...ranges]}
              getOptionLabel={opt => opt.name}
              value={ranges.find(r => r._id === rangeId) || { _id: '', name: 'All' }}
              onChange={(_, newVal) => { setRangeId(newVal?._id || ''); setPage(0); }}
              isOptionEqualToValue={(opt, val) => opt._id === val._id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Range"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: loadingRanges
                      ? <CircularProgress size={14} />
                      : params.InputProps.endAdornment
                  }}
                />
              )}
            />

            {/* Product */}
            <FormControl size="small" sx={{ minWidth: 150 }} disabled={!rangeId}>
              <InputLabel>Product</InputLabel>
              <Select
                value={productId}
                label="Product"
                onChange={e => { setProductId(e.target.value); setPage(0); }}
                disabled={!rangeId || loadingProducts}
                endAdornment={loadingProducts ? <CircularProgress size={14} sx={{ mr: 2 }} /> : null}
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {products.map(p => (
                  <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ flex: 1 }} />

            {/* Keyword search */}
            <TextField
              size="small"
              placeholder="Keyword"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={handleSearchSubmit}
              sx={{ minWidth: 200 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleSearchSubmit}>
                      <SearchIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            {/* Create Listing */}
            <Button
              variant="contained"
              startIcon={<AddCircleIcon />}
              disabled={selected.length === 0 || !rangeId}
              onClick={() => setCreateDialog(true)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Create Listing ({selected.length})
            </Button>
          </Stack>

          <Divider />

          {/* Row 2: Price Range + Orders Received + Moved to List date filter */}
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              Price Range
            </Typography>
            <TextField
              size="small"
              label="Min"
              value={priceMin}
              onChange={e => setPriceMin(e.target.value)}
              onKeyDown={commitPriceFilter}
              onBlur={commitPriceFilter}
              sx={{ width: 90 }}
              type="number"
            />
            <Typography variant="body2">–</Typography>
            <TextField
              size="small"
              label="Max"
              value={priceMax}
              onChange={e => setPriceMax(e.target.value)}
              onKeyDown={commitPriceFilter}
              onBlur={commitPriceFilter}
              sx={{ width: 90 }}
              type="number"
            />

            <Box sx={{ width: 24 }} />

            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              Orders Received
            </Typography>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select
                value={ordersComparator}
                onChange={e => setOrdersComparator(e.target.value)}
              >
                <MenuItem value="more than">more than</MenuItem>
                <MenuItem value="less than">less than</MenuItem>
                <MenuItem value="equal to">equal to</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              value={ordersValue}
              onChange={e => setOrdersValue(e.target.value)}
              sx={{ width: 80 }}
              type="number"
              placeholder="0"
            />

            <Box sx={{ width: 24 }} />

            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              Moved to List
            </Typography>
            <TextField
              size="small"
              label="From"
              type="date"
              value={movedAfter}
              onChange={e => { setMovedAfter(e.target.value); setPage(0); }}
              sx={{ width: 145 }}
              InputLabelProps={{ shrink: true }}
            />
            <Typography variant="body2">–</Typography>
            <TextField
              size="small"
              label="To"
              type="date"
              value={movedBefore}
              onChange={e => { setMovedBefore(e.target.value); setPage(0); }}
              sx={{ width: 145 }}
              InputLabelProps={{ shrink: true }}
            />
            {(movedAfter || movedBefore) && (
              <Button
                size="small"
                onClick={() => { setMovedAfter(''); setMovedBefore(''); setPage(0); }}
              >
                Clear
              </Button>
            )}
          </Stack>

        </Stack>
      </Paper>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <Paper>
        {!rangeId ? (
          <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1">
              Select a Category and Range to view ASINs
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'grey.50' }}>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={isAllSelected}
                      indeterminate={isIndeterminate}
                      onChange={handleSelectAll}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 64 }}>Image</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 90 }}>Price</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 130 }}>ASIN</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 70 }} align="center">Count</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 80 }} align="center">Orders</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 60 }} align="right">Delete</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : asins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No ASINs assigned to this product
                    </TableCell>
                  </TableRow>
                ) : (
                  asins.map((asin, idx) => {
                    const isSelected = selected.includes(asin._id);
                    const imgSrc = asin.images?.[0];
                    const imgBroken = imgErrors[asin._id];
                    return (
                      <TableRow
                        key={asin._id}
                        hover
                        selected={isSelected}
                        sx={{ cursor: 'pointer' }}
                        onClick={() => handleSelectRow(asin._id)}
                      >
                        <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleSelectRow(asin._id)}
                            size="small"
                          />
                        </TableCell>

                        {/* Image */}
                        <TableCell>
                          {imgSrc && !imgBroken ? (
                            <Box
                              component="img"
                              src={imgSrc}
                              alt={asin.asin}
                              onError={() => handleImgError(asin._id)}
                              sx={{
                                width: 48,
                                height: 48,
                                objectFit: 'contain',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider'
                              }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: 48,
                                height: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: 'grey.100',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider'
                              }}
                            >
                              <BrokenImageIcon sx={{ color: 'grey.400', fontSize: 24 }} />
                            </Box>
                          )}
                        </TableCell>

                        {/* Title */}
                        <TableCell>
                          <Tooltip title={asin.title || ''} placement="top">
                            <Typography
                              variant="body2"
                              sx={{
                                maxWidth: 300,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'block'
                              }}
                            >
                              {asin.title || '—'}
                            </Typography>
                          </Tooltip>
                          {asin.brand && (
                            <Typography variant="caption" color="text.secondary">
                              {asin.brand}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Price */}
                        <TableCell>
                          <Typography variant="body2">
                            {asin.price ? `$${asin.price}` : '—'}
                          </Typography>
                        </TableCell>

                        {/* ASIN */}
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontWeight: 500 }}
                          >
                            {asin.asin}
                          </Typography>
                        </TableCell>

                        {/* Count — total times this ASIN has been listed */}
                        <TableCell align="center">
                          <Chip
                            label={asin.listingCount || 0}
                            size="small"
                            color={asin.listingCount > 0 ? 'primary' : 'default'}
                            variant={asin.listingCount > 0 ? 'filled' : 'outlined'}
                          />
                        </TableCell>

                        {/* Orders — placeholder */}
                        <TableCell align="center">
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        </TableCell>

                        {/* Delete */}
                        <TableCell align="right" onClick={e => e.stopPropagation()}>
                          <Tooltip title="Remove from list">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(asin._id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Bulk action bar */}
        {selected.length > 0 && (
          <Toolbar sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>
              {selected.length} selected
            </Typography>
            <Button
              startIcon={<DeleteIcon />}
              onClick={handleBulkDelete}
              sx={{ color: 'inherit' }}
            >
              Delete Selected
            </Button>
          </Toolbar>
        )}

        {/* Pagination */}
        {rangeId && (
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[25, 50, 100]}
          />
        )}
      </Paper>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      <AsinListCreateDialog
        open={createDialog}
        onClose={() => setCreateDialog(false)}
        asinCount={selected.length}
        onConfirm={handleCreateConfirmed}
      />

      <AsinReviewModal
        open={reviewModal}
        onClose={() => {
          if (window._directoryEventSource) {
            window._directoryEventSource.close();
            window._directoryEventSource = null;
          }
          setReviewModal(false);
          setPreviewItems([]);
        }}
        previewItems={previewItems}
        onSave={handleSaveFromReview}
        templateColumns={[
          ...(activeTemplate?.customColumns?.map(c => ({ ...c, type: 'custom' })) || []),
          { name: 'title', label: 'Title', type: 'core' },
          { name: 'description', label: 'Description', type: 'core' },
          { name: 'startPrice', label: 'Start Price', type: 'core' },
          { name: 'quantity', label: 'Quantity', type: 'core' }
        ]}
      />
    </Box>
  );
}
