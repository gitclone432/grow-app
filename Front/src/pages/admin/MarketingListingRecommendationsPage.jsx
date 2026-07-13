import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
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
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import MarketingCollapsibleFilters from '../../components/marketing/MarketingCollapsibleFilters.jsx';
import MarketingScrollableTableContainer from '../../components/marketing/MarketingScrollableTableContainer.jsx';
import MarketingStoreFilters from '../../components/marketing/MarketingStoreFilters.jsx';
import ColumnSelector from '../../components/ColumnSelector.jsx';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import {
  ALL_MARKETPLACES_VALUE,
  ALL_STORES_VALUE,
  LISTING_RECOMMENDATION_PROMOTE_CHIP_COLOR,
  LISTING_RECOMMENDATION_PROMOTE_OPTIONS,
  MARKETPLACES,
} from '../../lib/marketingConstants.js';
import {
  compareListingRecommendationRows,
  filterListingRecommendationRows,
  formatListingRecommendationPromoteLabel,
  parseApiError,
  resolveSellerName,
} from '../../lib/marketingUtils.js';
import {
  countMarketingTableColumns,
  defaultVisibleColumnIds,
  filterVisibleColumnsForSelector,
  getMarketingColumnOptions,
  isMarketingColumnVisible,
  loadMarketingVisibleColumns,
  MARKETING_TABLE_COLUMN_STORAGE_KEYS,
  RECOMMENDATIONS_TABLE_COLUMNS,
} from '../../lib/marketingTableColumns.js';

const EBAY_DOCS =
  'https://developer.ebay.com/develop/api/sell/recommendation_api#sell-recommendation_api-listing_recommendation-findlistingrecommendations';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const SORT_COLUMNS = {
  sellerName: { label: 'Store', align: 'left' },
  marketplaceId: { label: 'Marketplace', align: 'left' },
  listingId: { label: 'Listing ID', align: 'left' },
  promoteWithAd: { label: 'Promote with ad', align: 'left' },
  trendingBidPercent: { label: 'Trending bid %', align: 'right' },
  message: { label: 'Message', align: 'left' },
};

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = SORT_COLUMNS[column];
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

const DEFAULT_RECOMMENDATIONS_VISIBLE_COLUMNS = defaultVisibleColumnIds(RECOMMENDATIONS_TABLE_COLUMNS);

export default forwardRef(function MarketingListingRecommendationsPage({
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
  const [localSellerId, setLocalSellerId] = useState('');
  const [localMarketplace, setLocalMarketplace] = useState(ALL_MARKETPLACES_VALUE);
  const sellerId = embedded ? (sellerIdProp ?? '') : localSellerId;
  const marketplace = embedded ? (marketplaceProp ?? ALL_MARKETPLACES_VALUE) : localMarketplace;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [storeErrors, setStoreErrors] = useState([]);
  const [meta, setMeta] = useState({ sellersQueried: 0 });
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, total: null, aggregated: false });
  const [sortBy, setSortBy] = useState('listingId');
  const [sortOrder, setSortOrder] = useState('asc');

  const [promoteWithAd, setPromoteWithAd] = useState('RECOMMENDED');
  const [listingIdSearch, setListingIdSearch] = useState('');
  const [listingIds, setListingIds] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    promoteWithAd: 'RECOMMENDED',
    listingIdSearch: '',
    listingIds: '',
    storeSearch: '',
    marketplaceFilter: '',
  });
  const [visibleColumns, setVisibleColumns] = useState(() => (
    loadMarketingVisibleColumns(MARKETING_TABLE_COLUMN_STORAGE_KEYS.recommendations, RECOMMENDATIONS_TABLE_COLUMNS)
  ));

  useEffect(() => {
    localStorage.setItem(
      MARKETING_TABLE_COLUMN_STORAGE_KEYS.recommendations,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  const isAllStores = sellerId === ALL_STORES_VALUE;
  const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;
  const canPaginate = !isAllStores && !isAllMarketplaces;
  const selectedSellerName = resolveSellerName(sellers, sellerId, isAllStores);

  const recommendationsColumnOptions = useMemo(
    () => getMarketingColumnOptions(RECOMMENDATIONS_TABLE_COLUMNS, isAllStores),
    [isAllStores],
  );

  const tableColSpan = useMemo(
    () => countMarketingTableColumns(visibleColumns, isAllStores),
    [visibleColumns, isAllStores],
  );

  const showColumn = useCallback(
    (columnId) => isMarketingColumnVisible(visibleColumns, columnId, isAllStores),
    [visibleColumns, isAllStores],
  );

  useEffect(() => {
    if (embedded || sellerId || sellers.length === 0) return;
    setLocalSellerId(sellers[0]._id);
  }, [embedded, sellers, sellerId]);

  const loadRecommendations = useCallback(async ({ refresh = false, offset = 0 } = {}) => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        marketplace,
        limit: pagination.limit,
        offset: canPaginate ? offset : 0,
      };
      if (refresh) params.refresh = '1';
      if (appliedFilters.listingIds) params.listingIds = appliedFilters.listingIds;

      const { data } = isAllStores
        ? await api.get('/ebay/marketing/listing-recommendations/all', { params })
        : await api.get('/ebay/marketing/listing-recommendations', { params: { ...params, sellerId } });

      setRows(Array.isArray(data?.recommendations) ? data.recommendations : []);
      setStoreErrors(Array.isArray(data?.errors) ? data.errors : []);
      setMeta({
        sellersQueried: data?.sellersQueried ?? (isAllStores ? null : 1),
        sellerName: data?.seller?.name || '',
      });
      setPagination((prev) => ({
        limit: data?.pagination?.limit ?? prev.limit,
        offset: data?.pagination?.offset ?? offset,
        total: data?.pagination?.total ?? data?.total ?? null,
        aggregated: Boolean(data?.pagination?.aggregated),
      }));
    } catch (err) {
      setRows([]);
      setStoreErrors([]);
      setMeta({ sellersQueried: 0 });
      setError(parseApiError(err, 'Failed to load listing recommendations'));
    } finally {
      setLoading(false);
    }
  }, [
    sellerId,
    marketplace,
    isAllStores,
    appliedFilters.listingIds,
    pagination.limit,
    canPaginate,
  ]);

  const refreshRecommendations = useCallback(
    () => loadRecommendations({ refresh: true, offset: pagination.offset }),
    [loadRecommendations, pagination.offset],
  );

  useImperativeHandle(ref, () => ({
    refresh: () => refreshRecommendations(),
  }), [refreshRecommendations]);

  useEffect(() => {
    if (!embedded || !onToolbarState) return;
    onToolbarState({
      loading,
      refreshDisabled: !sellerId || loading,
    });
  }, [embedded, onToolbarState, loading, sellerId]);

  useEffect(() => {
    if (!active || !sellerId) return;
    void loadRecommendations({ offset: 0 });
  }, [active, sellerId, marketplace, appliedFilters.listingIds, pagination.limit, loadRecommendations]);

  const filteredRows = useMemo(
    () => filterListingRecommendationRows(rows, appliedFilters),
    [rows, appliedFilters],
  );

  const displayRows = useMemo(
    () => [...filteredRows].sort((a, b) => compareListingRecommendationRows(a, b, sortBy, sortOrder)),
    [filteredRows, sortBy, sortOrder],
  );

  const summary = useMemo(() => {
    const recommended = filteredRows.filter((row) => row.promoteWithAd === 'RECOMMENDED').length;
    const undetermined = filteredRows.filter((row) => row.promoteWithAd === 'UNDETERMINED').length;
    const errored = filteredRows.filter((row) => row.error).length;
    return { recommended, undetermined, errored, total: filteredRows.length };
  }, [filteredRows]);

  const hasActiveFilters = Boolean(
    (appliedFilters.promoteWithAd && appliedFilters.promoteWithAd !== 'RECOMMENDED')
    || appliedFilters.listingIdSearch
    || appliedFilters.listingIds
    || appliedFilters.storeSearch
    || appliedFilters.marketplaceFilter,
  );

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const applyFilters = () => {
    setPagination((prev) => ({ ...prev, offset: 0 }));
    setAppliedFilters({
      promoteWithAd,
      listingIdSearch,
      listingIds,
      storeSearch,
      marketplaceFilter,
    });
  };

  const clearFilters = () => {
    setPromoteWithAd('RECOMMENDED');
    setListingIdSearch('');
    setListingIds('');
    setStoreSearch('');
    setMarketplaceFilter('');
    setPagination((prev) => ({ ...prev, offset: 0 }));
    setAppliedFilters({
      promoteWithAd: 'RECOMMENDED',
      listingIdSearch: '',
      listingIds: '',
      storeSearch: '',
      marketplaceFilter: '',
    });
  };

  const handlePageChange = (_event, newPage) => {
    const nextOffset = newPage * pagination.limit;
    setPagination((prev) => ({ ...prev, offset: nextOffset }));
    void loadRecommendations({ offset: nextOffset });
  };

  const handleRowsPerPageChange = (event) => {
    const nextLimit = parseInt(event.target.value, 10) || 50;
    setPagination({ limit: nextLimit, offset: 0, total: pagination.total, aggregated: pagination.aggregated });
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
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Listing Recommendations</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Promoted Listings ad guidance via eBay{' '}
              <code>findListingRecommendations</code> —{' '}
              <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => refreshRecommendations()}
            disabled={!sellerId || loading}
          >
            Refresh
          </Button>
        </Stack>
      ) : null}

      <MarketingCollapsibleFilters title="Recommendation filters" defaultOpen={false}>
        <Grid container spacing={2}>
          {!embedded ? (
            <MarketingStoreFilters
              sellers={sellers}
              sellerId={sellerId}
              onSellerChange={(value) => {
                if (embedded) onSellerChange?.(value);
                else setLocalSellerId(value);
              }}
              marketplace={marketplace}
              onMarketplaceChange={(value) => {
                if (embedded) onMarketplaceChange?.(value);
                else setLocalMarketplace(value);
              }}
            />
          ) : null}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Promote with ad</InputLabel>
              <Select
                label="Promote with ad"
                value={promoteWithAd}
                onChange={(e) => setPromoteWithAd(e.target.value)}
              >
                {LISTING_RECOMMENDATION_PROMOTE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all-promote'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Listing IDs (API lookup)"
              value={listingIds}
              onChange={(e) => setListingIds(e.target.value)}
              placeholder="Comma-separated, up to 500"
              helperText="Optional — fetches specific active listings"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Listing ID contains"
              value={listingIdSearch}
              onChange={(e) => setListingIdSearch(e.target.value)}
              placeholder="Client-side filter"
            />
          </Grid>
          {isAllMarketplaces ? (
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Marketplace</InputLabel>
                <Select
                  label="Marketplace"
                  value={marketplaceFilter}
                  onChange={(e) => setMarketplaceFilter(e.target.value)}
                >
                  <MenuItem value="">All marketplaces</MenuItem>
                  {MARKETPLACES.map((mp) => (
                    <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          ) : null}
          {isAllStores ? (
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Store name"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="Search by store name"
              />
            </Grid>
          ) : null}
          <Grid item xs={12} sm={6} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button variant="outlined" onClick={applyFilters} disabled={!sellerId || loading} fullWidth>
              Apply filters
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button variant="text" onClick={clearFilters} disabled={!hasActiveFilters} fullWidth>
              Clear
            </Button>
          </Grid>
        </Grid>
      </MarketingCollapsibleFilters>

      {selectedSellerName ? (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Store: <strong>{selectedSellerName}</strong>
            {rows.length > 0 ? (
              <>
                {' · '}
                {displayRows.length !== rows.length
                  ? `${displayRows.length.toLocaleString()} of ${rows.length.toLocaleString()} row(s)`
                  : `${rows.length.toLocaleString()} recommendation(s)`}
                {pagination.aggregated ? ' · aggregated preview' : null}
              </>
            ) : null}
          </Typography>
          <ColumnSelector
            allColumns={recommendationsColumnOptions}
            visibleColumns={filterVisibleColumnsForSelector(visibleColumns, isAllStores)}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(DEFAULT_RECOMMENDATIONS_VISIBLE_COLUMNS)}
            page="marketing-listing-recommendations"
          />
        </Stack>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {storeErrors.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {storeErrors.length} store{storeErrors.length === 1 ? '' : 's'} failed to load:{' '}
          {storeErrors.map((item) => item.sellerName || item.sellerId).join(', ')}
        </Alert>
      ) : null}

      {filteredRows.length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Chip size="small" label={`${summary.total} shown`} variant="outlined" />
          <Chip size="small" label={`${summary.recommended} recommended`} color="success" variant="outlined" />
          <Chip size="small" label={`${summary.undetermined} undetermined`} variant="outlined" />
          {summary.errored > 0 ? (
            <Chip size="small" label={`${summary.errored} errors`} color="error" variant="outlined" />
          ) : null}
        </Stack>
      ) : null}

      <Paper variant="outlined">
        <MarketingScrollableTableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {showColumn('sellerName') ? (
                  <SortableHeader column="sellerName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('marketplaceId') ? (
                  <SortableHeader column="marketplaceId" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('listingId') ? (
                  <SortableHeader column="listingId" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('promoteWithAd') ? (
                  <SortableHeader column="promoteWithAd" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('trendingBidPercent') ? (
                  <SortableHeader column="trendingBidPercent" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('message') ? (
                  <SortableHeader column="message" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColSpan || 1} sx={{ py: 6, textAlign: 'center' }}>
                    <GrowMentalityLoader />
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColSpan || 1} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {sellerId
                        ? (
                          <>
                            {hasActiveFilters && rows.length > 0
                              ? 'No rows match the current filters.'
                              : (
                                <>
                                  No listing recommendations returned
                                  {meta.sellersQueried != null ? ` (${meta.sellersQueried} store${meta.sellersQueried === 1 ? '' : 's'} checked)` : ''}
                                  . Without listing IDs, eBay returns only listings where promote with ad is RECOMMENDED. Try a single marketplace or specific listing IDs.
                                </>
                              )}
                          </>
                        )
                        : 'Select a store to load listing recommendations.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
              {displayRows.map((row) => {
                const statusKey = row.error ? 'ERROR' : row.promoteWithAd;
                const rowKey = `${row.sellerId || 'single'}-${row.marketplaceId}-${row.listingId || row.errorMessage || 'error'}`;

                return (
                  <TableRow key={rowKey} hover>
                    {showColumn('sellerName') ? (
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {row.sellerName || '—'}
                      </TableCell>
                    ) : null}
                    {showColumn('marketplaceId') ? (
                      <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {row.marketplaceId || '—'}
                      </TableCell>
                    ) : null}
                    {showColumn('listingId') ? (
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {row.listingId || '—'}
                      </TableCell>
                    ) : null}
                    {showColumn('promoteWithAd') ? (
                      <TableCell>
                        {row.error ? (
                          <Chip size="small" label="ERROR" color="error" variant="outlined" />
                        ) : (
                          <Chip
                            size="small"
                            label={formatListingRecommendationPromoteLabel(row.promoteWithAd)}
                            color={LISTING_RECOMMENDATION_PROMOTE_CHIP_COLOR[statusKey] || 'default'}
                            variant="outlined"
                          />
                        )}
                      </TableCell>
                    ) : null}
                    {showColumn('trendingBidPercent') ? (
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {row.trendingBidPercent !== '' && row.trendingBidPercent != null
                          ? `${row.trendingBidPercent}%`
                          : '—'}
                      </TableCell>
                    ) : null}
                    {showColumn('message') ? (
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography variant="body2" color={row.message || row.error ? 'text.primary' : 'text.secondary'}>
                          {row.error ? (row.errorMessage || 'Request failed') : (row.message || '—')}
                        </Typography>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </MarketingScrollableTableContainer>
        {canPaginate && pagination.total != null ? (
          <TablePagination
            component="div"
            count={pagination.total}
            page={Math.floor(pagination.offset / pagination.limit)}
            onPageChange={handlePageChange}
            rowsPerPage={pagination.limit}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          />
        ) : null}
      </Paper>
    </Box>
  );
});
