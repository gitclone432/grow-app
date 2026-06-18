import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontIcon from '@mui/icons-material/Storefront';
import UploadIcon from '@mui/icons-material/Upload';
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
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ColumnSelector from '../../../components/ColumnSelector.jsx';
import api from '../../../lib/api.js';
import EtsyEditableCell, { EtsyRowNumberCell } from './EtsyEditableCell.jsx';
import {
  ETSY_ORDER_FULFILMENT_COLUMNS,
  ETSY_COLUMN_SELECTOR_OPTIONS,
  DEFAULT_VISIBLE_ETSY_COLUMNS,
  ETSY_REGION_OPTIONS,
  loadVisibleEtsyColumns,
  saveVisibleEtsyColumns,
  orderVisibleEtsyColumnKeys,
  buildVisibleEtsySectionHeaders,
} from './etsyOrderFulfilmentColumns.js';
import { ADDRESS_DERIVED_TRIGGER_FIELD, normalizeEtsyRegion } from '../../../utils/etsyAddressZip.js';
import {
  AMAZON_PRICING_TRIGGER_FIELDS,
  enrichOrderWithAmazonPricing,
  formatExRate,
  formatRupeeField,
  ETSY_RUPEE_INPUT_FIELDS,
  ETSY_COMPUTED_FIELDS,
  AMAZON_PRICING_COMPUTED_FIELDS,
} from '../../../utils/etsyOrderPricing.js';

const EtsyOrderFulfilmentImportDialog = lazy(
  () => import('../../../components/EtsyOrderFulfilmentImportDialog.jsx')
);

const ROWS_PER_PAGE = 25;
const ALL_STORES_VALUE = '__all__';

function toDateKey(value) {
  const timestamp = parseSortableDate(value);
  if (!timestamp) return '';
  return new Date(timestamp).toISOString().slice(0, 10);
}

function matchesDateSoldFilter(order, dateFrom, dateTo) {
  const soldKey = toDateKey(order?.dateSold);
  if (!dateFrom && !dateTo) return true;
  if (!soldKey) return false;

  if (dateFrom && soldKey < dateFrom) return false;
  if (dateTo && soldKey > dateTo) return false;
  return true;
}

function matchesRegionFilter(order, regionFilter) {
  if (!regionFilter) return true;
  return String(order.region || '').trim().toUpperCase() === regionFilter.toUpperCase();
}

function parseSortableDate(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortOrdersNewestFirst(orders = []) {
  return [...orders].map(enrichOrderWithAmazonPricing).sort((a, b) => {
    const rowOrderDiff = (b.rowOrder ?? 0) - (a.rowOrder ?? 0);
    if (rowOrderDiff !== 0) return rowOrderDiff;

    const dateDiff = parseSortableDate(b.dateSold) - parseSortableDate(a.dateSold);
    if (dateDiff !== 0) return dateDiff;

    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

const SECTION_HEADER_HEIGHT = 32;

const COMPUTED_COLUMN_BODY_BG = '#fff5f5';
const COMPUTED_COLUMN_BODY_BG_ALT = '#ffecec';

const HEADER_CELL_SX = {
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
  borderBottom: 'none',
  fontSize: '0.8125rem',
};

const BODY_CELL_SX = {
  borderBottom: '1px solid',
  borderColor: 'divider',
  fontSize: '0.8125rem',
  lineHeight: 1.43,
  verticalAlign: 'middle',
  overflow: 'hidden',
};

function getRowBackground(rowIndex, isSaving, theme) {
  if (isSaving) return '#fff8e1';
  return rowIndex % 2 === 1
    ? theme.palette.action.hover
    : theme.palette.background.paper;
}

function getComputedBodyBackground(rowIndex, isSaving) {
  if (isSaving) return '#fff8e1';
  return rowIndex % 2 === 1 ? COMPUTED_COLUMN_BODY_BG_ALT : COMPUTED_COLUMN_BODY_BG;
}

function getHeaderCellSx(column, theme) {
  return {
    ...HEADER_CELL_SX,
    position: 'sticky',
    top: SECTION_HEADER_HEIGHT,
    zIndex: 2,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.common.white,
    textAlign: column.align || 'left',
    ...(column.key === 'rowNum'
      ? {
        borderRight: '2px solid rgba(255,255,255,0.35)',
        textAlign: 'center',
      }
      : {}),
  };
}

function getBodyCellSx(column, isSaving, rowIndex, theme) {
  const isComputed = Boolean(column.computed);

  return {
    ...BODY_CELL_SX,
    backgroundColor: isComputed
      ? getComputedBodyBackground(rowIndex, isSaving)
      : getRowBackground(rowIndex, isSaving, theme),
    ...(column.key === 'rowNum'
      ? { borderRight: '2px solid', borderColor: 'divider', textAlign: 'center' }
      : {}),
    ...(column.align ? { textAlign: column.align } : {}),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };
}

const SECTION_HEADER_SX = {
  fontWeight: 700,
  whiteSpace: 'nowrap',
  borderBottom: '2px solid rgba(15, 23, 42, 0.12)',
  fontSize: '0.75rem',
  lineHeight: 1.43,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const TABLE_SCROLL_SX = {
  flexGrow: 1,
  overflow: 'auto',
  maxHeight: 'calc(100% - 50px)',
  width: '100%',
  '&::-webkit-scrollbar': {
    width: '8px',
    height: '8px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: '#f1f1f1',
    borderRadius: '10px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: '#888',
    borderRadius: '10px',
    '&:hover': {
      backgroundColor: '#555',
    },
  },
};

export default function EtsyOrderFulfilmentPage() {
  const theme = useTheme();
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [storesLoading, setStoresLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [savingCells, setSavingCells] = useState({});
  const [deletingIds, setDeletingIds] = useState({});
  const [supplierAccounts, setSupplierAccounts] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState(() => loadVisibleEtsyColumns());

  const supplierAccountNames = useMemo(
    () => supplierAccounts
      .map((account) => account.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    [supplierAccounts]
  );

  const fulfilmentColumns = useMemo(
    () => ETSY_ORDER_FULFILMENT_COLUMNS.map((column) => (
      column.key === 'amazonAccount'
        ? { ...column, options: ['', ...supplierAccountNames] }
        : column
    )),
    [supplierAccountNames]
  );

  const visibleColumnsSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);

  const visibleFulfilmentColumns = useMemo(
    () => fulfilmentColumns.filter((column) => visibleColumnsSet.has(column.key)),
    [fulfilmentColumns, visibleColumnsSet]
  );

  const visibleSectionHeaders = useMemo(
    () => buildVisibleEtsySectionHeaders(visibleColumns),
    [visibleColumns]
  );

  const handleVisibleColumnsChange = useCallback((nextColumns) => {
    const ordered = orderVisibleEtsyColumnKeys(nextColumns);
    setVisibleColumns(ordered);
    saveVisibleEtsyColumns(ordered);
  }, []);

  const handleResetVisibleColumns = useCallback(() => {
    const defaults = [...DEFAULT_VISIBLE_ETSY_COLUMNS];
    setVisibleColumns(defaults);
    saveVisibleEtsyColumns(defaults);
  }, []);

  const isAllStoresSelected = selectedStoreId === ALL_STORES_VALUE;
  const isSingleStoreSelected = Boolean(selectedStoreId) && !isAllStoresSelected;

  const storeNameById = useMemo(
    () => Object.fromEntries(stores.map((store) => [String(store._id), store.name])),
    [stores]
  );

  const tableMinWidth = useMemo(
    () => visibleFulfilmentColumns.reduce((sum, column) => sum + (column.minWidth || 100), 0),
    [visibleFulfilmentColumns]
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

  const loadOrders = useCallback(async (storeId = selectedStoreId) => {
    if (!storeId || (storeId !== ALL_STORES_VALUE && !stores.length)) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = storeId === ALL_STORES_VALUE ? {} : { storeId };
      const { data } = await api.get('/etsy/order-fulfilment', {
        params,
        timeout: 30000,
      });
      setOrders(sortOrdersNewestFirst(Array.isArray(data.orders) ? data.orders : []));
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, stores.length]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    let cancelled = false;
    api.get('/amazon-accounts')
      .then(({ data }) => {
        if (!cancelled) setSupplierAccounts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSupplierAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
    loadOrders(selectedStoreId);
  }, [selectedStoreId, loadOrders]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => (
      matchesDateSoldFilter(order, dateFrom, dateTo)
      && matchesRegionFilter(order, selectedRegion)
    )),
    [orders, dateFrom, dateTo, selectedRegion]
  );

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, selectedRegion]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredOrders.slice(start, start + ROWS_PER_PAGE);
  }, [filteredOrders, page]);

  const setCellSaving = (orderId, field, isSaving) => {
    const key = `${orderId}:${field}`;
    setSavingCells((prev) => {
      const next = { ...prev };
      if (isSaving) next[key] = true;
      else delete next[key];
      return next;
    });
  };

  const isRowSaving = (orderId) => Object.keys(savingCells).some((key) => key.startsWith(`${orderId}:`));

  const handleRefresh = useCallback(async () => {
    await loadStores();
    await loadOrders(selectedStoreId);
  }, [loadStores, loadOrders, selectedStoreId]);

  const handleAddRow = async () => {
    if (!isSingleStoreSelected) {
      setSnackbar({
        open: true,
        message: isAllStoresSelected
          ? 'Select a single store to add a row'
          : 'Select an Etsy store first (add stores in Settings → Etsy Stores)',
        severity: 'warning',
      });
      return;
    }

    setCreating(true);
    try {
      const { data } = await api.post('/etsy/order-fulfilment', { storeId: selectedStoreId });
      setOrders((prev) => [{
        ...data.order,
        storeName: data.order.storeName || storeNameById[String(data.order.store)] || selectedStore?.name || '',
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

  const handleDeleteRow = async (orderId) => {
    if (!window.confirm('Remove this row? This cannot be undone.')) return;

    setDeletingIds((prev) => ({ ...prev, [orderId]: true }));
    try {
      await api.delete(`/etsy/order-fulfilment/${orderId}`);
      setOrders((prev) => prev.filter((row) => row._id !== orderId));
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
        delete next[orderId];
        return next;
      });
    }
  };

  const handleSaveCell = useCallback(async (orderId, field, value) => {
    setCellSaving(orderId, field, true);
    try {
      const current = orders.find((row) => row._id === orderId);
      const normalizedValue = ETSY_RUPEE_INPUT_FIELDS.has(field)
        ? formatRupeeField(value)
        : field === 'exRate'
          ? formatExRate(value)
          : field === 'region'
            ? normalizeEtsyRegion(value)
            : value;
      const merged = enrichOrderWithAmazonPricing({ ...current, [field]: normalizedValue });
      const patch = { [field]: normalizedValue };

      if (AMAZON_PRICING_TRIGGER_FIELDS.has(field)) {
        for (const key of [...ETSY_COMPUTED_FIELDS, ...AMAZON_PRICING_COMPUTED_FIELDS]) {
          patch[key] = merged[key];
        }
      }

      if (field === ADDRESS_DERIVED_TRIGGER_FIELD) {
        patch.zipCode = merged.zipCode;
        patch.region = merged.region;
      }

      const { data } = await api.patch(`/etsy/order-fulfilment/${orderId}`, patch);
      setOrders((prev) => prev.map((row) => (
        row._id === orderId
          ? enrichOrderWithAmazonPricing({
            ...data.order,
            storeName: data.order.storeName || row.storeName || storeNameById[String(data.order.store)] || '',
          })
          : row
      )));
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to save changes',
        severity: 'error',
      });
      throw err;
    } finally {
      setCellSaving(orderId, field, false);
    }
  }, [orders, storeNameById]);

  const handleCopyCell = useCallback(async (text) => {
    const value = String(text ?? '').trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setSnackbar({
        open: true,
        message: `Copied: ${value}`,
        severity: 'success',
      });
    } catch {
      setSnackbar({
        open: true,
        message: 'Failed to copy to clipboard',
        severity: 'error',
      });
    }
  }, []);

  const handleImported = (summary) => {
    setSnackbar({
      open: true,
      message: `Imported ${summary.insertedCount} row(s)${summary.mode === 'replace' ? ' (replaced existing rows)' : ''}`,
      severity: 'success',
    });
    setPage(1);
    loadOrders(selectedStoreId);
  };

  return (
    <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: { xs: 'calc(100dvh - 56px)', sm: 'calc(100dvh - 64px)', md: 'calc(100vh - 100px)' },
          overflow: 'hidden',
          width: '100%',
          maxWidth: '100%',
          px: { xs: 0.5, sm: 1, md: 0 },
        }}
      >
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: { xs: 1, sm: 2 }, flexShrink: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            spacing={{ xs: 1, sm: 2 }}
            sx={{ mb: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <StorefrontIcon color="primary" sx={{ fontSize: { xs: 20, sm: 24 } }} />
              <Typography
                variant="h5"
                fontWeight="bold"
                sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.5rem' } }}
              >
                Order Fulfilment
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              {(filteredOrders.length > 0 || orders.length > 0) && (
                <Chip
                  label={
                    (dateFrom || dateTo) && filteredOrders.length !== orders.length
                      ? `${filteredOrders.length} of ${orders.length} orders`
                      : `${filteredOrders.length} order${filteredOrders.length === 1 ? '' : 's'}`
                  }
                  color="primary"
                  variant="filled"
                  size={isSmallMobile ? 'small' : 'medium'}
                />
              )}
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={handleRefresh}
                disabled={loading || !selectedStoreId}
                sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' } }}
              >
                {isSmallMobile ? 'Refresh' : 'Refresh'}
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<UploadIcon />}
                onClick={() => {
                  if (isAllStoresSelected) {
                    setSnackbar({ open: true, message: 'Select a single store to import', severity: 'warning' });
                    return;
                  }
                  setImportOpen(true);
                }}
                disabled={!isSingleStoreSelected}
                sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' } }}
              >
                {isSmallMobile ? 'Import' : 'Import CSV'}
              </Button>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
                onClick={handleAddRow}
                disabled={creating || !isSingleStoreSelected}
                sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' } }}
              >
                {isSmallMobile ? 'Add Row' : 'Add Row'}
              </Button>
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            flexWrap="wrap"
            useFlexGap
          >
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
              <InputLabel id="etsy-store-select-label">Etsy Store</InputLabel>
              <Select
                labelId="etsy-store-select-label"
                value={selectedStoreId}
                label="Etsy Store"
                onChange={(e) => setSelectedStoreId(e.target.value)}
                disabled={storesLoading}
              >
                {stores.length === 0 ? (
                  <MenuItem value="" disabled>
                    No stores yet
                  </MenuItem>
                ) : (
                  [
                    <MenuItem key={ALL_STORES_VALUE} value={ALL_STORES_VALUE}>
                      All Stores
                    </MenuItem>,
                    ...stores.map((store) => (
                      <MenuItem key={store._id} value={store._id}>
                        {store.name}
                      </MenuItem>
                    )),
                  ]
                )}
              </Select>
            </FormControl>

            <TextField
              size="small"
              type="date"
              label="Date from"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { xs: '100%', sm: 160 } }}
            />
            <TextField
              size="small"
              type="date"
              label="Date to"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { xs: '100%', sm: 160 } }}
            />

            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 140 } }}>
              <InputLabel id="etsy-region-filter-label">Region</InputLabel>
              <Select
                labelId="etsy-region-filter-label"
                value={selectedRegion}
                label="Region"
                onChange={(e) => setSelectedRegion(e.target.value)}
                disabled={!selectedStoreId}
              >
                <MenuItem value="">All Regions</MenuItem>
                {ETSY_REGION_OPTIONS.map((region) => (
                  <MenuItem key={region} value={region}>
                    {region}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {(dateFrom || dateTo || selectedRegion) && (
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSelectedRegion('');
                }}
              >
                Clear filters
              </Button>
            )}

            <ColumnSelector
              allColumns={ETSY_COLUMN_SELECTOR_OPTIONS}
              visibleColumns={visibleColumns.filter((key) => key !== 'rowNum')}
              onColumnChange={handleVisibleColumnsChange}
              onReset={handleResetVisibleColumns}
              page="etsy-order-fulfilment"
              disabled={!selectedStoreId}
            />

            {isAllStoresSelected && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                Viewing <strong>All Stores</strong>
              </Typography>
            )}
            {selectedStore && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                Viewing <strong>{selectedStore.name}</strong>
              </Typography>
            )}
          </Stack>

          {!storesLoading && stores.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Add Etsy stores in{' '}
              <Link component={RouterLink} to="/admin/etsy-stores" fontWeight={600}>
                Settings → Etsy Stores
              </Link>
              , then return here to import or manage orders.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Paper>

        {!selectedStoreId ? (
          <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center', flexShrink: 0 }}>
            <StorefrontIcon sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              {stores.length === 0
                ? 'Add an Etsy store in Settings → Etsy Stores, then select it here.'
                : 'Select an Etsy store to view or import orders.'}
            </Typography>
            {stores.length === 0 && (
              <Button
                component={RouterLink}
                to="/admin/etsy-stores"
                variant="outlined"
                size="small"
                sx={{ mt: 2 }}
              >
                Go to Etsy Stores
              </Button>
            )}
          </Paper>
        ) : loading && orders.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
            <CircularProgress size={32} sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Loading orders…
            </Typography>
          </Paper>
        ) : orders.length === 0 ? (
          <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center', flexShrink: 0 }}>
            <StorefrontIcon sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 2 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              No rows for {isAllStoresSelected ? 'any store' : (selectedStore?.name || 'this store')}.
            </Typography>
            {!isAllStoresSelected && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Import a CSV from your spreadsheet or add rows manually.
                </Typography>
                <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
                  <Button variant="outlined" size="small" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
                    Import CSV
                  </Button>
                  <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddRow} disabled={creating}>
                    Add Row
                  </Button>
                </Stack>
              </>
            )}
          </Paper>
        ) : filteredOrders.length === 0 ? (
          <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center', flexShrink: 0 }}>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              No orders match the selected filters.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSelectedRegion('');
              }}
            >
              Clear filters
            </Button>
          </Paper>
        ) : (
          <TableContainer component={Paper} sx={TABLE_SCROLL_SX}>
            <Table
              size="small"
              stickyHeader
              sx={{
                tableLayout: 'fixed',
                width: tableMinWidth,
                minWidth: tableMinWidth,
                '& td, & th': { whiteSpace: 'nowrap' },
              }}
            >
              <colgroup>
                {visibleFulfilmentColumns.map((column) => (
                  <col key={column.key} style={{ width: column.minWidth, minWidth: column.minWidth }} />
                ))}
              </colgroup>
              <TableHead>
                <TableRow>
                  {visibleSectionHeaders.map((section) => (
                    <TableCell
                      key={section.id}
                      colSpan={section.colspan}
                      align="center"
                      sx={{
                        ...SECTION_HEADER_SX,
                        backgroundColor: section.bgcolor,
                        color: '#334155',
                        position: 'sticky',
                        top: 0,
                        zIndex: 3,
                      }}
                    >
                      {section.label}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  {visibleFulfilmentColumns.map((column) => (
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
                {paginatedOrders.map((row, rowIndex) => {
                  const absoluteIndex = (page - 1) * ROWS_PER_PAGE + rowIndex;
                  const serialNumber = filteredOrders.length - absoluteIndex;
                  const rowSaving = isRowSaving(row._id);
                  const rowDeleting = Boolean(deletingIds[row._id]);
                  const storeLabel = row.storeName || storeNameById[String(row.store)] || '-';

                  return (
                    <TableRow
                      key={row._id}
                      hover
                      sx={{
                        '&:hover td': {
                          backgroundColor: theme.palette.action.selected,
                        },
                        opacity: rowDeleting ? 0.5 : 1,
                      }}
                    >
                      {visibleFulfilmentColumns.map((column) => (
                        <TableCell
                          key={column.key}
                          align={column.align || 'left'}
                          sx={getBodyCellSx(column, rowSaving, absoluteIndex, theme)}
                        >
                          {column.key === 'rowNum' ? (
                            <EtsyRowNumberCell
                              serialNumber={serialNumber}
                              deleting={rowDeleting}
                              inlineActions
                              onDelete={() => handleDeleteRow(row._id)}
                            />
                          ) : column.key === 'storeName' ? (
                            <Typography variant="body2" fontWeight="medium" noWrap>
                              {storeLabel}
                            </Typography>
                          ) : (
                            <EtsyEditableCell
                              column={column}
                              value={row[column.key]}
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
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
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

        {importOpen && (
          <Suspense fallback={null}>
            <EtsyOrderFulfilmentImportDialog
              open={importOpen}
              onClose={() => setImportOpen(false)}
              stores={stores}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
              onImported={handleImported}
            />
          </Suspense>
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
  );
}
