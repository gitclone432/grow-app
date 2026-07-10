import { memo, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import MarketingKpiStrip from '../../components/marketing/MarketingKpiStrip.jsx';
import MarketingCollapsibleFilters from '../../components/marketing/MarketingCollapsibleFilters.jsx';
import MarketingScrollableTableContainer from '../../components/marketing/MarketingScrollableTableContainer.jsx';
import MarketingStoreFilters from '../../components/marketing/MarketingStoreFilters.jsx';
import CreateItemPromotionDialog from '../../components/marketing/CreateItemPromotionDialog.jsx';
import UpdateItemPromotionDialog from '../../components/marketing/UpdateItemPromotionDialog.jsx';
import ColumnSelector from '../../components/ColumnSelector.jsx';
import { canDeletePromotion, canEditPromotion } from '../../utils/itemPromotionUtils';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import {
  countMarketingTableColumns,
  defaultVisibleColumnIds,
  filterVisibleColumnsForSelector,
  getMarketingColumnOptions,
  isMarketingColumnVisible,
  loadMarketingVisibleColumns,
  MARKETING_TABLE_COLUMN_STORAGE_KEYS,
  PROMOTION_TABLE_COLUMNS,
} from '../../lib/marketingTableColumns.js';
import {
  ALL_MARKETPLACES_VALUE,
  ALL_STORES_PER_SELLER_LIMIT,
  ALL_STORES_VALUE,
  KPI_FETCH_LIMIT,
  PROMOTION_STATUS_OPTIONS,
  PROMOTION_TYPE_OPTIONS,
  STATUS_CHIP_COLOR,
} from '../../lib/marketingConstants.js';
import {
  buildMarketingKpiCacheKey,
  comparePromotionRows,
  formatDateOnly,
  formatPromotionTypeLabel,
  getMarketingKpiCache,
  invalidateMarketingKpiCache,
  isPromotionApiSortable,
  parseApiError,
  promotionSortToApiParam,
  resolveSellerName,
  setMarketingKpiCache,
} from '../../lib/marketingUtils.js';

const PROMOTION_SORT_COLUMNS = {
  sellerName: { label: 'Store', align: 'left' },
  promotionName: { label: 'Promotion', align: 'left' },
  promotionStatus: { label: 'Status', align: 'left' },
  promotionType: { label: 'Type', align: 'left' },
  startDate: { label: 'Start', align: 'left' },
  endDate: { label: 'End', align: 'left' },
  couponCode: { label: 'Coupon', align: 'left' },
  marketplaceId: { label: 'Marketplace', align: 'left' },
};

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = PROMOTION_SORT_COLUMNS[column];
  return (
    <TableCell align={meta.align} sx={{ fontWeight: 700 }}>
      <TableSortLabel
        active={sortBy === column}
        direction={sortBy === column ? sortOrder : 'asc'}
        onClick={() => onSort(column)}
      >
        {meta.label}
      </TableSortLabel>
    </TableCell>
  );
}

const EBAY_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/promotion/methods/getPromotions';

const CREATE_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/createItemPromotion';

const CREATE_MARKDOWN_DOCS =
  'https://developer.ebay.com/develop/api/sell/marketing_api#sell-marketing_api-item_price_markdown-createitempricemarkdownpromotion';

const UPDATE_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/updateItemPromotion';

const DELETE_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/deleteItemPromotion';

const PAGE_SIZES = [25, 50, 100, 200];

const DEFAULT_PROMOTION_VISIBLE_COLUMNS = defaultVisibleColumnIds(PROMOTION_TABLE_COLUMNS);

const PromotionRow = memo(function PromotionRow({
  row,
  expanded,
  onToggle,
  showStore,
  visibleColumns,
  pageSellerId,
  onEdit,
  onDelete,
}) {
  const colSpan = countMarketingTableColumns(visibleColumns, showStore, { leadingCols: 1 });
  const show = (columnId) => isMarketingColumnVisible(visibleColumns, columnId, showStore);
  const effectiveSellerId = row.sellerId || pageSellerId;
  const deletable = canDeletePromotion(row.promotionStatus);
  const editable = canEditPromotion(row.promotionStatus);

  const handleEdit = () => {
    if (!effectiveSellerId || !row.promotionId || !row.marketplaceId) return;
    onEdit?.({
      sellerId: effectiveSellerId,
      promotionId: row.promotionId,
      marketplaceId: row.marketplaceId,
      promotionName: row.promotionName,
      promotionStatus: row.promotionStatus,
      promotionType: row.promotionType,
    });
  };

  const handleDelete = () => {
    if (!effectiveSellerId || !row.promotionId || !row.marketplaceId) return;
    onDelete?.({
      sellerId: effectiveSellerId,
      promotionId: row.promotionId,
      marketplaceId: row.marketplaceId,
      promotionName: row.promotionName,
      promotionStatus: row.promotionStatus,
      promotionType: row.promotionType,
    });
  };

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={onToggle} aria-label="expand promotion">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        {show('sellerName') ? (
          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
            {row.sellerName || '—'}
          </TableCell>
        ) : null}
        {show('promotionName') ? (
        <TableCell sx={{ maxWidth: 240 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={row.promotionName}>
            {row.promotionName || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {row.promotionId || '—'}
          </Typography>
        </TableCell>
        ) : null}
        {show('promotionStatus') ? (
        <TableCell>
          <Chip
            size="small"
            label={row.promotionStatus || '—'}
            color={STATUS_CHIP_COLOR[row.promotionStatus] || 'default'}
            variant="outlined"
          />
        </TableCell>
        ) : null}
        {show('promotionType') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatPromotionTypeLabel(row.promotionType)}</TableCell>
        ) : null}
        {show('startDate') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateOnly(row.startDate)}</TableCell>
        ) : null}
        {show('endDate') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateOnly(row.endDate)}</TableCell>
        ) : null}
        {show('couponCode') ? (
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.couponCode || '—'}</TableCell>
        ) : null}
        {show('marketplaceId') ? (
        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{row.marketplaceId || '—'}</TableCell>
        ) : null}
        {show('actions') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Stack direction="row" spacing={0.5}>
            <IconButton
              size="small"
              aria-label="edit promotion"
              onClick={handleEdit}
              disabled={!editable || !effectiveSellerId}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="delete promotion"
              onClick={handleDelete}
              disabled={!deletable || !effectiveSellerId}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </TableCell>
        ) : null}
      </TableRow>
      <TableRow>
        <TableCell colSpan={colSpan} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6, pr: 2 }}>
              {row.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {row.description}
                </Typography>
              ) : null}
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Raw API payload</Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: 'grey.50',
                  borderRadius: 1,
                  fontSize: '0.72rem',
                  overflow: 'auto',
                  maxHeight: 320,
                }}
              >
                {JSON.stringify(row.raw, null, 2)}
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
});

export default forwardRef(function MarketingPromotionsPage({
  embedded = false,
  active = true,
  sellers: sellersProp,
  sellerId: sellerIdProp,
  onSellerChange,
  marketplace: marketplaceProp,
  onMarketplaceChange,
  onToolbarState,
}, ref) {
  const { sellers: hookSellers } = useEbayConnectedSellers({ enabled: !embedded });
  const sellers = embedded ? (sellersProp ?? []) : hookSellers;

  const [localSellerId, setLocalSellerId] = useState(ALL_STORES_VALUE);
  const [localMarketplace, setLocalMarketplace] = useState(ALL_MARKETPLACES_VALUE);
  const sellerId = embedded ? (sellerIdProp ?? '') : localSellerId;
  const marketplace = embedded ? (marketplaceProp ?? ALL_MARKETPLACES_VALUE) : localMarketplace;

  const setSellerId = useCallback((value) => {
    if (embedded) onSellerChange?.(value);
    else setLocalSellerId(value);
  }, [embedded, onSellerChange]);

  const setMarketplace = useCallback((value) => {
    if (embedded) onMarketplaceChange?.(value);
    else setLocalMarketplace(value);
  }, [embedded, onMarketplaceChange]);
  const [promotionStatus, setPromotionStatus] = useState('RUNNING');
  const [promotionType, setPromotionType] = useState('CODED_COUPON');
  const [sortBy, setSortBy] = useState('endDate');
  const [sortOrder, setSortOrder] = useState('asc');
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [storeErrors, setStoreErrors] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(() => (
    loadMarketingVisibleColumns(MARKETING_TABLE_COLUMN_STORAGE_KEYS.promotions, PROMOTION_TABLE_COLUMNS)
  ));

  useEffect(() => {
    localStorage.setItem(
      MARKETING_TABLE_COLUMN_STORAGE_KEYS.promotions,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  useEffect(() => {
    if (embedded || sellerId || sellers.length === 0) return;
    setLocalSellerId(ALL_STORES_VALUE);
  }, [embedded, sellers, sellerId]);

  const isAllStores = sellerId === ALL_STORES_VALUE;
  const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;

  const promotionColumnOptions = useMemo(
    () => getMarketingColumnOptions(PROMOTION_TABLE_COLUMNS, isAllStores),
    [isAllStores],
  );

  const tableColSpan = useMemo(
    () => countMarketingTableColumns(visibleColumns, isAllStores, { leadingCols: 1 }),
    [visibleColumns, isAllStores],
  );

  const showColumn = useCallback(
    (columnId) => isMarketingColumnVisible(visibleColumns, columnId, isAllStores),
    [visibleColumns, isAllStores],
  );

  const selectedSellerName = useMemo(
    () => resolveSellerName(sellers, sellerId, isAllStores),
    [sellers, sellerId, isAllStores],
  );

  const apiSort = useMemo(() => {
    if (isAllStores) return undefined;
    return promotionSortToApiParam(sortBy, sortOrder);
  }, [isAllStores, sortBy, sortOrder]);

  const sharedParams = useMemo(
    () => ({
      marketplace: isAllMarketplaces ? ALL_MARKETPLACES_VALUE : marketplace,
      promotion_status: promotionStatus || undefined,
      promotion_type: promotionType || undefined,
      sort: apiSort || undefined,
      q: appliedKeyword.trim() || undefined,
    }),
    [marketplace, isAllMarketplaces, promotionStatus, promotionType, apiSort, appliedKeyword],
  );

  const kpiParams = useMemo(
    () => ({
      marketplace: isAllMarketplaces ? ALL_MARKETPLACES_VALUE : marketplace,
      promotion_status: 'RUNNING',
    }),
    [marketplace, isAllMarketplaces],
  );

  const loadAllStoresPromotions = useCallback(async () => {
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/marketing/promotions/all', {
        params: {
          ...sharedParams,
          perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
        },
      });
      const merged = Array.isArray(data?.promotions) ? data.promotions : [];
      setAllRows(merged);
      setTotal(merged.length);
      setStoreErrors(Array.isArray(data?.errors) ? data.errors : []);
    } catch (err) {
      setAllRows([]);
      setRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load promotions'));
    } finally {
      setLoading(false);
    }
  }, [sharedParams]);

  const loadSingleSellerPromotions = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/marketing/promotions', {
        params: {
          ...sharedParams,
          sellerId,
          limit: pageSize,
          offset,
        },
      });
      const singleRows = Array.isArray(data?.promotions) ? data.promotions : [];
      setAllRows([]);
      setRows(singleRows);
      const parsedTotal = data?.total != null ? Number(data.total) : null;
      setTotal(Number.isFinite(parsedTotal) ? parsedTotal : null);
    } catch (err) {
      setRows([]);
      setAllRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load promotions'));
    } finally {
      setLoading(false);
    }
  }, [sellerId, sharedParams, pageSize, offset]);

  const loadPromotions = useCallback(() => {
    if (!sellerId) return Promise.resolve();
    return isAllStores ? loadAllStoresPromotions() : loadSingleSellerPromotions();
  }, [sellerId, isAllStores, loadAllStoresPromotions, loadSingleSellerPromotions]);

  const loadKpiPromotions = useCallback(async ({ refresh = false } = {}) => {
    if (!sellerId) return;
    const cacheKey = buildMarketingKpiCacheKey('promotions', sellerId, marketplace);
    if (!refresh) {
      const cached = getMarketingKpiCache(cacheKey);
      if (cached) {
        setKpiRows(cached);
        return;
      }
    }

    setKpiLoading(true);
    try {
      let rows = [];
      if (isAllStores) {
        const { data } = await api.get('/ebay/marketing/promotions/all', {
          params: {
            ...kpiParams,
            perSellerLimit: KPI_FETCH_LIMIT,
          },
        });
        rows = Array.isArray(data?.promotions) ? data.promotions : [];
      } else {
        const { data } = await api.get('/ebay/marketing/promotions', {
          params: {
            ...kpiParams,
            sellerId,
            limit: KPI_FETCH_LIMIT,
            offset: 0,
          },
        });
        rows = Array.isArray(data?.promotions) ? data.promotions : [];
      }
      setKpiRows(rows);
      setMarketingKpiCache(cacheKey, rows);
    } catch {
      setKpiRows([]);
    } finally {
      setKpiLoading(false);
    }
  }, [sellerId, isAllStores, kpiParams, marketplace]);

  const refreshPromotions = useCallback(({ refreshKpi = true } = {}) => {
    const jobs = [loadPromotions()];
    if (refreshKpi) {
      jobs.push(loadKpiPromotions({ refresh: true }));
      invalidateMarketingKpiCache('promotions:');
    }
    void Promise.all(jobs);
  }, [loadPromotions, loadKpiPromotions]);

  useImperativeHandle(ref, () => ({
    refresh: () => refreshPromotions(),
    openCreate: () => setCreateOpen(true),
  }), [refreshPromotions]);

  useEffect(() => {
    if (!embedded || !onToolbarState) return;
    onToolbarState({
      loading,
      refreshDisabled: !sellerId || loading,
      createDisabled: sellers.length === 0,
    });
  }, [embedded, onToolbarState, loading, sellerId, sellers.length]);

  useEffect(() => {
    if (!active || !sellerId || !isAllStores) return;
    void loadAllStoresPromotions();
  }, [active, sellerId, isAllStores, sharedParams, loadAllStoresPromotions]);

  useEffect(() => {
    if (!active || !sellerId || isAllStores) return;
    void loadSingleSellerPromotions();
  }, [active, sellerId, isAllStores, sharedParams, pageSize, offset, loadSingleSellerPromotions]);

  const displayRows = useMemo(() => {
    const source = isAllStores ? allRows : rows;
    const needsClientSort = isAllStores || !isPromotionApiSortable(sortBy);
    const sorted = needsClientSort
      ? [...source].sort((a, b) => comparePromotionRows(a, b, sortBy, sortOrder))
      : source;
    return isAllStores ? sorted.slice(offset, offset + pageSize) : sorted;
  }, [isAllStores, allRows, rows, sortBy, sortOrder, offset, pageSize]);

  const handleSort = (column) => {
    setOffset(0);
    if (sortBy === column) {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  useEffect(() => {
    if (!active || !sellerId) return;
    void loadKpiPromotions();
  }, [active, sellerId, isAllStores, kpiParams, loadKpiPromotions]);

  useEffect(() => {
    setOffset(0);
  }, [sellerId, marketplace]);

  const pageIndex = Math.floor(offset / pageSize);
  const pageCount = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const canPrev = offset > 0;
  const canNext = total != null ? offset + pageSize < total : displayRows.length >= pageSize;

  const applyKeyword = () => {
    setOffset(0);
    setAppliedKeyword(keyword);
  };

  const handleDeletePromotion = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/ebay/marketing/promotions/delete', {
        data: {
          sellerId: deleteTarget.sellerId,
          promotionId: deleteTarget.promotionId,
          marketplaceId: deleteTarget.marketplaceId,
          promotionType: deleteTarget.promotionType,
        },
      });
      setDeleteTarget(null);
      refreshPromotions();
    } catch (err) {
      setDeleteError(parseApiError(err, 'Failed to delete promotion'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, pt: embedded ? 1.5 : { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
      {!embedded ? (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Marketing Promotions</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Item discounts, markdown sales &amp; coupons via eBay{' '}
              <code>getPromotions</code> / <code>createItemPromotion</code> /{' '}
              <code>createItemPriceMarkdownPromotion</code> —{' '}
              <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">List</Link>
              {' · '}
              <Link href={CREATE_PROMOTION_DOCS} target="_blank" rel="noopener noreferrer">Create</Link>
              {' · '}
              <Link href={CREATE_MARKDOWN_DOCS} target="_blank" rel="noopener noreferrer">Markdown</Link>
              {' · '}
              <Link href={UPDATE_PROMOTION_DOCS} target="_blank" rel="noopener noreferrer">Update</Link>
              {' · '}
              <Link href={DELETE_PROMOTION_DOCS} target="_blank" rel="noopener noreferrer">Delete</Link>
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
              disabled={sellers.length === 0}
            >
              Create promotion
            </Button>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => refreshPromotions()}
              disabled={!sellerId || loading}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
      ) : null}

      <MarketingKpiStrip
        rows={kpiRows}
        loading={kpiLoading}
        statusKey="promotionStatus"
        typeKey="promotionType"
        typeLabel="Promotion type"
        entityLabel="promotions"
        typeOptions={PROMOTION_TYPE_OPTIONS}
      />

      <MarketingCollapsibleFilters title="Promotion filters">
        <Grid container spacing={2}>
          {!embedded ? (
            <MarketingStoreFilters
              sellers={sellers}
              sellerId={sellerId}
              onSellerChange={(value) => { setSellerId(value); setOffset(0); }}
              marketplace={marketplace}
              onMarketplaceChange={(value) => { setMarketplace(value); setOffset(0); }}
            />
          ) : null}
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={promotionStatus} onChange={(e) => { setPromotionStatus(e.target.value); setOffset(0); }}>
                {PROMOTION_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={promotionType} onChange={(e) => { setPromotionType(e.target.value); setOffset(0); }}>
                {PROMOTION_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Title keywords"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. iPhone"
              onKeyDown={(e) => { if (e.key === 'Enter') applyKeyword(); }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Page size</InputLabel>
              <Select label="Page size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}>
                {PAGE_SIZES.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button variant="outlined" onClick={applyKeyword} disabled={!sellerId || loading} fullWidth>
              Search title
            </Button>
          </Grid>
        </Grid>
      </MarketingCollapsibleFilters>

      {selectedSellerName ? (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Store: <strong>{selectedSellerName}</strong>
            {total != null ? ` · ${total.toLocaleString()} promotion(s)` : ` · ${displayRows.length} on this page`}
          </Typography>
          <ColumnSelector
            allColumns={promotionColumnOptions}
            visibleColumns={filterVisibleColumnsForSelector(visibleColumns, isAllStores)}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(DEFAULT_PROMOTION_VISIBLE_COLUMNS)}
            page="marketing-promotions"
          />
        </Stack>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {storeErrors.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {storeErrors.length} store(s) failed: {storeErrors.slice(0, 3).map((e) => `${e.sellerName}: ${e.error}`).join(' · ')}
          {storeErrors.length > 3 ? ` · +${storeErrors.length - 3} more` : ''}
        </Alert>
      ) : null}

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <GrowMentalityLoader />
          </Box>
        ) : (
          <MarketingScrollableTableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 48 }} />
                  {showColumn('sellerName') ? (
                    <SortableHeader column="sellerName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('promotionName') ? (
                    <SortableHeader column="promotionName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('promotionStatus') ? (
                    <SortableHeader column="promotionStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('promotionType') ? (
                    <SortableHeader column="promotionType" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('startDate') ? (
                    <SortableHeader column="startDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('endDate') ? (
                    <SortableHeader column="endDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('couponCode') ? (
                    <SortableHeader column="couponCode" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('marketplaceId') ? (
                    <SortableHeader column="marketplaceId" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('actions') ? (
                    <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                  ) : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {displayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableColSpan}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No promotions returned for these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayRows.map((row) => (
                    <PromotionRow
                      key={`${row.sellerId || 'one'}-${row.promotionId || row.promotionName}`}
                      row={row}
                      showStore={isAllStores}
                      visibleColumns={visibleColumns}
                      pageSellerId={isAllStores ? '' : sellerId}
                      onEdit={setUpdateTarget}
                      onDelete={setDeleteTarget}
                      expanded={expandedId === `${row.sellerId}-${row.promotionId}`}
                      onToggle={() => setExpandedId((prev) => (
                        prev === `${row.sellerId}-${row.promotionId}` ? null : `${row.sellerId}-${row.promotionId}`
                      ))}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </MarketingScrollableTableContainer>
        )}
      </Paper>

      <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {pageCount != null ? `Page ${pageIndex + 1} of ${pageCount}` : `Offset ${offset}`}
        </Typography>
        <IconButton
          size="small"
          disabled={!canPrev || loading}
          onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
          aria-label="previous page"
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          size="small"
          disabled={!canNext || loading}
          onClick={() => setOffset((o) => o + pageSize)}
          aria-label="next page"
        >
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      <CreateItemPromotionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        sellers={sellers}
        defaultSellerId={isAllStores ? '' : sellerId}
        onCreated={() => {
          refreshPromotions();
        }}
      />

      <UpdateItemPromotionDialog
        open={Boolean(updateTarget)}
        onClose={() => setUpdateTarget(null)}
        target={updateTarget}
        onUpdated={() => {
          refreshPromotions();
        }}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={deleting ? undefined : () => { setDeleteTarget(null); setDeleteError(''); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete promotion?</DialogTitle>
        <DialogContent>
          {deleteError ? <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert> : null}
          <Typography variant="body2">
            Delete <strong>{deleteTarget?.promotionName || deleteTarget?.promotionId}</strong>
            {' '}on {deleteTarget?.marketplaceId}?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Only paused or ended promotions can be deleted. Running promotions must be ended first
            (update the end date via Edit).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDeletePromotion()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});
