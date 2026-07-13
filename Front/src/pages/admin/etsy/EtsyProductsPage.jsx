import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadIcon from '@mui/icons-material/Upload';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Pagination,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import api from '../../../lib/api.js';
import { normalizeEtsyRegion } from '../../../utils/etsyAddressZip.js';
import { enrichEtsyProductRow, LISTED_DATE_TIME_LEFT_TRIGGER } from '../../../utils/etsyProductTimeLeft.js';
import EtsyEditableCell, { EtsyRowNumberCell } from './EtsyEditableCell.jsx';
import EtsySoldPriceCalculatorDialog from './EtsySoldPriceCalculatorDialog.jsx';
import EtsyProductsImportDialog from '../../../components/EtsyProductsImportDialog.jsx';
import { ETSY_PRODUCT_COLUMNS, normalizeListingStatus } from './etsyProductColumns.js';

const ROWS_PER_PAGE = 25;
const ALL_STORES_VALUE = '__all__';

const HEADER_CELL_SX = {
  fontWeight: 'bold',
  py: 0.5,
  px: 0.75,
  whiteSpace: 'nowrap',
  borderBottom: 'none',
  fontSize: '0.7rem',
  lineHeight: 1.2,
};

const BODY_CELL_SX = {
  py: 0.25,
  px: 0.625,
  borderBottom: '1px solid',
  borderColor: 'divider',
  fontSize: '0.75rem',
  lineHeight: 1.25,
  verticalAlign: 'middle',
  overflow: 'hidden',
};

const TABLE_SCROLL_SX = {
  flexGrow: 1,
  overflow: 'auto',
  width: '100%',
  minHeight: 0,
  '&::-webkit-scrollbar': { width: 8, height: 8 },
  '&::-webkit-scrollbar-track': { backgroundColor: '#f1f1f1', borderRadius: '10px' },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: '#888',
    borderRadius: '10px',
    '&:hover': { backgroundColor: '#555' },
  },
};

function getRowBackground(rowIndex, isSaving, theme) {
  if (isSaving) return '#fff8e1';
  return rowIndex % 2 === 0 ? theme.palette.grey[50] : theme.palette.background.paper;
}

function getStickyColumnSx(column, theme, rowIndex, isSaving, isHeader = false) {
  if (column.sticky !== 'right') return {};

  const bg = isHeader
    ? theme.palette.primary.main
    : getRowBackground(rowIndex, isSaving, theme);

  return {
    position: 'sticky',
    right: 0,
    zIndex: isHeader ? 4 : 2,
    backgroundColor: bg,
    boxShadow: '-6px 0 10px rgba(15, 23, 42, 0.08)',
    borderLeft: '1px solid',
    borderColor: isHeader ? 'rgba(255,255,255,0.35)' : 'divider',
  };
}

function getHeaderCellSx(column, theme) {
  return {
    ...HEADER_CELL_SX,
    position: 'sticky',
    top: 0,
    zIndex: column.sticky === 'right' ? 4 : 2,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.common.white,
    ...(column.key === 'rowNum' ? { borderRight: '2px solid rgba(255,255,255,0.35)' } : {}),
    ...getStickyColumnSx(column, theme, 0, false, true),
  };
}

function getBodyCellSx(column, isSaving, rowIndex, theme) {
  return {
    ...BODY_CELL_SX,
    backgroundColor: getRowBackground(rowIndex, isSaving, theme),
    ...(column.key === 'rowNum'
      ? { borderRight: '2px solid', borderColor: 'divider', textAlign: 'center' }
      : {}),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    ...getStickyColumnSx(column, theme, rowIndex, isSaving, false),
  };
}

function parseSortableDate(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortProductsNewestFirst(products = []) {
  return products.map((row) => enrichEtsyProductRow({
    ...row,
    listingStatus: normalizeListingStatus(row.listingStatus),
  })).sort((a, b) => {
    const rowOrderDiff = (b.rowOrder ?? 0) - (a.rowOrder ?? 0);
    if (rowOrderDiff !== 0) return rowOrderDiff;

    const dateDiff = parseSortableDate(b.listedDate) - parseSortableDate(a.listedDate);
    if (dateDiff !== 0) return dateDiff;

    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

function matchesRegionFilter(product, regionFilter) {
  if (!regionFilter) return true;
  return String(product.region || '').trim().toUpperCase() === regionFilter.toUpperCase();
}

export default function EtsyProductsPage() {
  const theme = useTheme();
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [savingCells, setSavingCells] = useState({});
  const [deletingIds, setDeletingIds] = useState({});
  const [calculatorProduct, setCalculatorProduct] = useState(null);
  const [applyingListedPrice, setApplyingListedPrice] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importStoreId, setImportStoreId] = useState('');

  const isAllStoresSelected = selectedStoreId === ALL_STORES_VALUE;
  const isSingleStoreSelected = Boolean(selectedStoreId) && !isAllStoresSelected;

  const storeNameById = useMemo(
    () => Object.fromEntries(stores.map((store) => [String(store._id), store.name])),
    [stores]
  );

  const storeOptionLabels = useMemo(
    () => Object.fromEntries(stores.map((store) => [String(store._id), store.name])),
    [stores]
  );

  const productColumns = useMemo(
    () => ETSY_PRODUCT_COLUMNS.map((column) => {
      if (column.key !== 'store') return column;
      return {
        ...column,
        options: ['', ...stores.map((store) => String(store._id))],
        optionLabels: storeOptionLabels,
        getDisplayLabel: (value) => storeNameById[String(value)] || '-',
      };
    }),
    [stores, storeNameById, storeOptionLabels]
  );

  const tableMinWidth = useMemo(
    () => productColumns.reduce((sum, column) => sum + (column.minWidth || 100), 0),
    [productColumns]
  );

  const selectedStore = useMemo(
    () => stores.find((store) => store._id === selectedStoreId) || null,
    [stores, selectedStoreId]
  );

  const loadStores = useCallback(async () => {
    setStoresLoading(true);
    try {
      const { data } = await api.get('/etsy/stores');
      const nextStores = Array.isArray(data.stores) ? data.stores : [];
      setStores(nextStores);
      setSelectedStoreId((prev) => {
        if (prev === ALL_STORES_VALUE) return prev;
        if (prev && nextStores.some((store) => store._id === prev)) return prev;
        return nextStores.length > 0 ? ALL_STORES_VALUE : '';
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load Etsy stores');
    } finally {
      setStoresLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async (storeId = selectedStoreId) => {
    if (!storeId || (storeId !== ALL_STORES_VALUE && !stores.length)) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = storeId === ALL_STORES_VALUE ? {} : { storeId };
      const { data } = await api.get('/etsy/products', { params, timeout: 30000 });
      setProducts(sortProductsNewestFirst(Array.isArray(data.products) ? data.products : []));
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, stores.length]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    setPage(1);
    loadProducts(selectedStoreId);
  }, [selectedStoreId, loadProducts]);

  const filteredProducts = useMemo(
    () => products.filter((product) => matchesRegionFilter(product, selectedRegion)),
    [products, selectedRegion]
  );

  useEffect(() => {
    setPage(1);
  }, [selectedRegion]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredProducts.slice(start, start + ROWS_PER_PAGE);
  }, [filteredProducts, page]);

  const setCellSaving = (productId, field, saving) => {
    const key = `${productId}:${field}`;
    setSavingCells((prev) => {
      const next = { ...prev };
      if (saving) next[key] = true;
      else delete next[key];
      return next;
    });
  };

  const isRowSaving = (productId) => Object.keys(savingCells).some((key) => key.startsWith(`${productId}:`));

  const handleRefresh = () => loadProducts(selectedStoreId);

  const openImportDialog = () => {
    setImportStoreId(isSingleStoreSelected ? selectedStoreId : (stores[0]?._id || ''));
    setImportOpen(true);
  };

  const handleImported = (summary) => {
    if (selectedStoreId === ALL_STORES_VALUE) {
      loadProducts(ALL_STORES_VALUE);
    } else {
      setSelectedStoreId(summary.storeId);
    }
    setSnackbar({
      open: true,
      message: `Imported ${summary.insertedCount} row(s)${summary.mode === 'replace' ? ' (replaced existing rows)' : ''}`,
      severity: 'success',
    });
  };

  const handleAddRow = async () => {
    if (!isSingleStoreSelected) {
      setSnackbar({ open: true, message: 'Select a single store to add a row', severity: 'warning' });
      return;
    }

    setCreating(true);
    try {
      const { data } = await api.post('/etsy/products', { storeId: selectedStoreId });
      setProducts((prev) => [{
        ...data.product,
        storeName: data.product.storeName || storeNameById[String(data.product.store)] || selectedStore?.name || '',
      }, ...prev]);
      setPage(1);
      setSnackbar({ open: true, message: 'Row added', severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to add row',
        severity: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRow = async (productId) => {
    if (!window.confirm('Remove this row? This cannot be undone.')) return;

    setDeletingIds((prev) => ({ ...prev, [productId]: true }));
    try {
      await api.delete(`/etsy/products/${productId}`);
      setProducts((prev) => prev.filter((row) => row._id !== productId));
      setSnackbar({ open: true, message: 'Row removed', severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to remove row',
        severity: 'error',
      });
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
  };

  const handleSaveCell = useCallback(async (productId, field, value) => {
    setCellSaving(productId, field, true);
    try {
      const current = products.find((row) => row._id === productId);
      const normalizedValue = field === 'region'
        ? normalizeEtsyRegion(value)
        : field === 'listingStatus'
          ? normalizeListingStatus(value)
          : value;
      const merged = enrichEtsyProductRow({ ...current, [field]: normalizedValue });
      const patch = field === 'store'
        ? { store: normalizedValue }
        : { [field]: normalizedValue };

      if (field === LISTED_DATE_TIME_LEFT_TRIGGER) {
        patch.timeLeft = merged.timeLeft;
      }

      const { data } = await api.patch(`/etsy/products/${productId}`, patch);
      setProducts((prev) => prev.map((row) => (
        row._id === productId
          ? enrichEtsyProductRow({
            ...data.product,
            storeName: data.product.storeName || storeNameById[String(data.product.store)] || row.storeName || '',
          })
          : row
      )));

      if (field === 'links' && data.product.sku && !String(current?.sku || '').trim()) {
        setSnackbar({
          open: true,
          message: `SKU generated: ${data.product.sku}`,
          severity: 'success',
        });
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to save changes',
        severity: 'error',
      });
      throw err;
    } finally {
      setCellSaving(productId, field, false);
    }
  }, [products, storeNameById]);

  const handleCopyCell = useCallback(async (text) => {
    const value = String(text ?? '').trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setSnackbar({ open: true, message: 'Copied to clipboard', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to copy', severity: 'error' });
    }
  }, []);

  const handleApplyListedPrice = useCallback(async (listedPrice) => {
    if (!calculatorProduct?._id) return;

    setApplyingListedPrice(true);
    try {
      await handleSaveCell(calculatorProduct._id, 'listedPrice', listedPrice);
      setCalculatorProduct((prev) => (prev ? { ...prev, listedPrice } : prev));
      setSnackbar({
        open: true,
        message: `Listed price updated to $${listedPrice}`,
        severity: 'success',
      });
      setCalculatorProduct(null);
    } catch {
      // handleSaveCell already surfaces errors
    } finally {
      setApplyingListedPrice(false);
    }
  }, [calculatorProduct, handleSaveCell]);

  return (
    <Box
      sx={{
        p: { xs: 1, sm: 1.5, md: 2 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, flexShrink: 0 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          spacing={1.5}
        >
          <Typography variant="h5" fontWeight={700}>
            Products
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            {filteredProducts.length > 0 && (
              <Chip
                label={`${filteredProducts.length} listing${filteredProducts.length === 1 ? '' : 's'}`}
                color="primary"
                variant="filled"
                size={isSmallMobile ? 'small' : 'medium'}
              />
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadIcon />}
              onClick={openImportDialog}
              disabled={stores.length === 0}
            >
              Import CSV
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={handleRefresh}
              disabled={loading || !selectedStoreId}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
              onClick={handleAddRow}
              disabled={creating || !isSingleStoreSelected}
            >
              Add Row
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
            <InputLabel id="etsy-products-store-label">Etsy Store</InputLabel>
            <Select
              labelId="etsy-products-store-label"
              value={selectedStoreId}
              label="Etsy Store"
              onChange={(e) => setSelectedStoreId(e.target.value)}
              disabled={storesLoading}
            >
              {stores.length === 0 ? (
                <MenuItem value="" disabled>No stores yet</MenuItem>
              ) : (
                [
                  <MenuItem key={ALL_STORES_VALUE} value={ALL_STORES_VALUE}>All Stores</MenuItem>,
                  ...stores.map((store) => (
                    <MenuItem key={store._id} value={store._id}>{store.name}</MenuItem>
                  )),
                ]
              )}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 140 } }}>
            <InputLabel id="etsy-products-region-label">Region</InputLabel>
            <Select
              labelId="etsy-products-region-label"
              value={selectedRegion}
              label="Region"
              onChange={(e) => setSelectedRegion(e.target.value)}
              disabled={!selectedStoreId}
            >
              <MenuItem value="">All Regions</MenuItem>
              {['USA', 'UK', 'CANADA', 'AU'].map((region) => (
                <MenuItem key={region} value={region}>{region}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedRegion && (
            <Button size="small" variant="text" onClick={() => setSelectedRegion('')}>
              Clear region filter
            </Button>
          )}
        </Stack>

        {!storesLoading && stores.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Add Etsy stores in{' '}
            <Link component={RouterLink} to="/etsy-stores" fontWeight={600}>
              Settings → Etsy Stores
            </Link>
            , then return here to manage product listings.
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>

      {!selectedStoreId ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
          <StorefrontIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography color="text.secondary">
            Select an Etsy store to view product listings.
          </Typography>
        </Paper>
      ) : loading && products.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
          <CircularProgress size={32} sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">Loading products…</Typography>
        </Paper>
      ) : products.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
          <Typography color="text.secondary" gutterBottom>
            No product rows for {isAllStoresSelected ? 'any store' : (selectedStore?.name || 'this store')}.
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }}>
            <Button variant="outlined" size="small" startIcon={<UploadIcon />} onClick={openImportDialog} disabled={stores.length === 0}>
              Import CSV
            </Button>
            {isSingleStoreSelected && (
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddRow} disabled={creating}>
                Add Row
              </Button>
            )}
          </Stack>
        </Paper>
      ) : filteredProducts.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
          <Typography color="text.secondary" gutterBottom>No listings match the region filter.</Typography>
          <Button size="small" variant="outlined" onClick={() => setSelectedRegion('')}>Clear region filter</Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ ...TABLE_SCROLL_SX, flex: 1 }}>
          <Table
            size="small"
            stickyHeader
            sx={{ tableLayout: 'fixed', width: tableMinWidth, minWidth: '100%' }}
          >
            <colgroup>
              {productColumns.map((column) => (
                <col key={column.key} style={{ width: column.minWidth, minWidth: column.minWidth }} />
              ))}
            </colgroup>
            <TableHead>
              <TableRow>
                {productColumns.map((column) => (
                  <TableCell
                    key={column.key}
                    align={column.align || 'left'}
                    sx={getHeaderCellSx(column, theme)}
                  >
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedProducts.map((row, rowIndex) => {
                const absoluteIndex = (page - 1) * ROWS_PER_PAGE + rowIndex;
                const serialNumber = filteredProducts.length - absoluteIndex;
                const rowSaving = isRowSaving(row._id);
                const rowDeleting = Boolean(deletingIds[row._id]);

                return (
                  <TableRow
                    key={row._id}
                    hover
                    sx={{
                      opacity: rowDeleting ? 0.5 : 1,
                      '&:hover td': { backgroundColor: theme.palette.action.selected },
                      '&:hover td[data-sticky="right"]': {
                        backgroundColor: theme.palette.action.selected,
                      },
                    }}
                  >
                    {productColumns.map((column) => (
                      <TableCell
                        key={column.key}
                        align={column.align || 'left'}
                        data-sticky={column.sticky === 'right' ? 'right' : undefined}
                        sx={getBodyCellSx(column, rowSaving, absoluteIndex, theme)}
                      >
                        {column.key === 'rowNum' ? (
                          <EtsyRowNumberCell
                            serialNumber={serialNumber}
                            deleting={rowDeleting}
                            compact
                            onCalculate={() => setCalculatorProduct(row)}
                            onDelete={() => handleDeleteRow(row._id)}
                          />
                        ) : (
                          <EtsyEditableCell
                            column={column}
                            value={row[column.key]}
                            compact
                            saving={Boolean(savingCells[`${row._id}:${column.key}`])}
                            disabled={rowDeleting}
                            onSave={(value) => handleSaveCell(row._id, column.key, value)}
                            onCopy={column.copyable ? handleCopyCell : undefined}
                          />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.25, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_event, nextPage) => setPage(nextPage)}
                color="primary"
                size="small"
              />
            </Box>
          )}
        </TableContainer>
      )}

      <EtsySoldPriceCalculatorDialog
        open={Boolean(calculatorProduct)}
        product={calculatorProduct}
        applying={applyingListedPrice}
        onClose={() => setCalculatorProduct(null)}
        onApplyListedPrice={handleApplyListedPrice}
      />

      <EtsyProductsImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        stores={stores}
        selectedStoreId={importStoreId}
        onStoreChange={setImportStoreId}
        onImported={handleImported}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
