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
  ADVERTISING_ELIGIBILITY_STATUS_CHIP_COLOR,
  ADVERTISING_ELIGIBILITY_STATUS_OPTIONS,
  ADVERTISING_INELIGIBLE_REASON_OPTIONS,
  ADVERTISING_PROGRAM_OPTIONS,
  ALL_MARKETPLACES_VALUE,
  ALL_STORES_VALUE,
  MARKETPLACES,
} from '../../lib/marketingConstants.js';
import {
  compareAdvertisingEligibilityRows,
  filterAdvertisingEligibilityRows,
  formatAdvertisingIneligibleReason,
  formatAdvertisingProgramLabel,
  parseApiError,
  resolveSellerName,
} from '../../lib/marketingUtils.js';
import {
  countMarketingTableColumns,
  defaultVisibleColumnIds,
  ELIGIBILITY_TABLE_COLUMNS,
  filterVisibleColumnsForSelector,
  getMarketingColumnOptions,
  isMarketingColumnVisible,
  loadMarketingVisibleColumns,
  MARKETING_TABLE_COLUMN_STORAGE_KEYS,
} from '../../lib/marketingTableColumns.js';

const EBAY_DOCS =
  'https://developer.ebay.com/develop/api/sell/account_api_v1#sell-account_api_v1-advertising_eligibility-getadvertisingeligibility';

const SORT_COLUMNS = {
  sellerName: { label: 'Store', align: 'left' },
  marketplaceId: { label: 'Marketplace', align: 'left' },
  programType: { label: 'Program', align: 'left' },
  status: { label: 'Status', align: 'left' },
  reason: { label: 'Reason', align: 'left' },
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

const DEFAULT_ELIGIBILITY_VISIBLE_COLUMNS = defaultVisibleColumnIds(ELIGIBILITY_TABLE_COLUMNS);

export default forwardRef(function MarketingAdvertisingEligibilityPage({
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
  const [sortBy, setSortBy] = useState('programType');
  const [sortOrder, setSortOrder] = useState('asc');

  const [eligibilityStatus, setEligibilityStatus] = useState('INELIGIBLE');
  const [programType, setProgramType] = useState('');
  const [ineligibleReason, setIneligibleReason] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    status: 'INELIGIBLE',
    programType: '',
    reason: '',
    storeSearch: '',
    marketplaceFilter: '',
  });
  const [visibleColumns, setVisibleColumns] = useState(() => (
    loadMarketingVisibleColumns(MARKETING_TABLE_COLUMN_STORAGE_KEYS.eligibility, ELIGIBILITY_TABLE_COLUMNS)
  ));

  useEffect(() => {
    localStorage.setItem(
      MARKETING_TABLE_COLUMN_STORAGE_KEYS.eligibility,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  const isAllStores = sellerId === ALL_STORES_VALUE;
  const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;
  const selectedSellerName = resolveSellerName(sellers, sellerId, isAllStores);

  const eligibilityColumnOptions = useMemo(
    () => getMarketingColumnOptions(ELIGIBILITY_TABLE_COLUMNS, isAllStores),
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

  const loadEligibility = useCallback(async ({ refresh = false } = {}) => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const params = { marketplace };
      if (refresh) params.refresh = '1';
      if (appliedFilters.programType) params.program_types = appliedFilters.programType;

      const { data } = isAllStores
        ? await api.get('/ebay/marketing/advertising-eligibility/all', { params })
        : await api.get('/ebay/marketing/advertising-eligibility', { params: { ...params, sellerId } });

      setRows(Array.isArray(data?.programs) ? data.programs : []);
      setStoreErrors(Array.isArray(data?.errors) ? data.errors : []);
      setMeta({
        sellersQueried: data?.sellersQueried ?? (isAllStores ? null : 1),
        sellerName: data?.seller?.name || '',
      });
    } catch (err) {
      setRows([]);
      setStoreErrors([]);
      setMeta({ sellersQueried: 0 });
      setError(parseApiError(err, 'Failed to load advertising eligibility'));
    } finally {
      setLoading(false);
    }
  }, [sellerId, marketplace, isAllStores, appliedFilters.programType]);

  const refreshEligibility = useCallback(() => loadEligibility({ refresh: true }), [loadEligibility]);

  useImperativeHandle(ref, () => ({
    refresh: () => refreshEligibility(),
  }), [refreshEligibility]);

  useEffect(() => {
    if (!embedded || !onToolbarState) return;
    onToolbarState({
      loading,
      refreshDisabled: !sellerId || loading,
    });
  }, [embedded, onToolbarState, loading, sellerId]);

  useEffect(() => {
    if (!active || !sellerId) return;
    void loadEligibility();
  }, [active, sellerId, marketplace, loadEligibility]);

  const filteredRows = useMemo(
    () => filterAdvertisingEligibilityRows(rows, appliedFilters),
    [rows, appliedFilters],
  );

  const displayRows = useMemo(
    () => [...filteredRows].sort((a, b) => compareAdvertisingEligibilityRows(a, b, sortBy, sortOrder)),
    [filteredRows, sortBy, sortOrder],
  );

  const summary = useMemo(() => {
    const eligible = filteredRows.filter((row) => row.status === 'ELIGIBLE').length;
    const ineligible = filteredRows.filter((row) => row.status === 'INELIGIBLE').length;
    const errored = filteredRows.filter((row) => row.error).length;
    return { eligible, ineligible, errored, total: filteredRows.length };
  }, [filteredRows]);

  const hasActiveFilters = Boolean(
    (appliedFilters.status && appliedFilters.status !== 'INELIGIBLE')
    || appliedFilters.programType
    || appliedFilters.reason
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
    setAppliedFilters({
      status: eligibilityStatus,
      programType,
      reason: ineligibleReason,
      storeSearch,
      marketplaceFilter,
    });
  };

  const clearFilters = () => {
    setEligibilityStatus('INELIGIBLE');
    setProgramType('');
    setIneligibleReason('');
    setStoreSearch('');
    setMarketplaceFilter('');
    setAppliedFilters({
      status: 'INELIGIBLE',
      programType: '',
      reason: '',
      storeSearch: '',
      marketplaceFilter: '',
    });
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
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Advertising Eligibility</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Seller eligibility for Promoted Listings and offsite ads via eBay{' '}
              <code>getAdvertisingEligibility</code> —{' '}
              <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => refreshEligibility()}
            disabled={!sellerId || loading}
          >
            Refresh
          </Button>
        </Stack>
      ) : null}

      <MarketingCollapsibleFilters title="Eligibility filters">
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
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={eligibilityStatus}
                onChange={(e) => setEligibilityStatus(e.target.value)}
              >
                {ADVERTISING_ELIGIBILITY_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all-status'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Program</InputLabel>
              <Select
                label="Program"
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
              >
                {ADVERTISING_PROGRAM_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all-program'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Ineligible reason</InputLabel>
              <Select
                label="Ineligible reason"
                value={ineligibleReason}
                onChange={(e) => setIneligibleReason(e.target.value)}
              >
                {ADVERTISING_INELIGIBLE_REASON_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all-reason'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
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
                  : `${rows.length.toLocaleString()} program check(s)`}
              </>
            ) : null}
          </Typography>
          <ColumnSelector
            allColumns={eligibilityColumnOptions}
            visibleColumns={filterVisibleColumnsForSelector(visibleColumns, isAllStores)}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(DEFAULT_ELIGIBILITY_VISIBLE_COLUMNS)}
            page="marketing-advertising-eligibility"
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
          <Chip size="small" label={`${summary.eligible} eligible`} color="success" variant="outlined" />
          <Chip size="small" label={`${summary.ineligible} ineligible`} color="warning" variant="outlined" />
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
                {showColumn('programType') ? (
                  <SortableHeader column="programType" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('status') ? (
                  <SortableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                ) : null}
                {showColumn('reason') ? (
                  <SortableHeader column="reason" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
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
                                  No eligibility data returned
                                  {meta.sellersQueried != null ? ` (${meta.sellersQueried} store${meta.sellersQueried === 1 ? '' : 's'} checked)` : ''}
                                  . Try Refresh or pick a single marketplace (e.g. EBAY_US).
                                </>
                              )}
                          </>
                        )
                        : 'Select a store to check advertising eligibility.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
              {displayRows.map((row) => {
                const statusKey = row.error ? 'ERROR' : row.status;
                const reasonText = row.error
                  ? (row.errorMessage || 'Request failed')
                  : (row.reason ? formatAdvertisingIneligibleReason(row.reason) : '—');
                const rowKey = `${row.sellerId || 'single'}-${row.marketplaceId}-${row.programType || 'error'}-${row.status}`;

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
                    {showColumn('programType') ? (
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatAdvertisingProgramLabel(row.programType)}
                      </Typography>
                      {row.programType ? (
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {row.programType}
                        </Typography>
                      ) : null}
                    </TableCell>
                    ) : null}
                    {showColumn('status') ? (
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.error ? 'ERROR' : (row.status || '—')}
                        color={ADVERTISING_ELIGIBILITY_STATUS_CHIP_COLOR[statusKey] || 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    ) : null}
                    {showColumn('reason') ? (
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography variant="body2" color={row.reason || row.error ? 'text.primary' : 'text.secondary'}>
                        {reasonText}
                      </Typography>
                    </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </MarketingScrollableTableContainer>
      </Paper>
    </Box>
  );
});
