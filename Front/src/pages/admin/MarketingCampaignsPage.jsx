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
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import MarketingKpiStrip from '../../components/marketing/MarketingKpiStrip.jsx';
import MarketingCollapsibleFilters from '../../components/marketing/MarketingCollapsibleFilters.jsx';
import MarketingScrollableTableContainer from '../../components/marketing/MarketingScrollableTableContainer.jsx';
import MarketingStoreFilters from '../../components/marketing/MarketingStoreFilters.jsx';
import ColumnSelector from '../../components/ColumnSelector.jsx';
import CreateCampaignDialog from '../../components/marketing/CreateCampaignDialog.jsx';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import {
  ALL_MARKETPLACES_VALUE,
  ALL_STORES_PER_SELLER_LIMIT,
  ALL_STORES_VALUE,
  CAMPAIGN_STATUS_OPTIONS,
  FUNDING_OPTIONS,
  KPI_FETCH_LIMIT,
  STATUS_CHIP_COLOR,
  TARGETING_OPTIONS,
} from '../../lib/marketingConstants.js';
import {
  buildMarketingKpiCacheKey,
  compareCampaignRows,
  formatBudget,
  formatDateOnly,
  getMarketingKpiCache,
  invalidateMarketingKpiCache,
  parseApiError,
  resolveSellerName,
  setMarketingKpiCache,
} from '../../lib/marketingUtils.js';
import {
  CAMPAIGN_TABLE_COLUMNS,
  countMarketingTableColumns,
  defaultVisibleColumnIds,
  filterVisibleColumnsForSelector,
  getMarketingColumnOptions,
  isMarketingColumnVisible,
  loadMarketingVisibleColumns,
  MARKETING_TABLE_COLUMN_STORAGE_KEYS,
} from '../../lib/marketingTableColumns.js';
import {
  canEndCampaign,
  canPauseCampaign,
  canResumeCampaign,
  parseCampaignApiError,
} from '../../utils/campaignUtils.js';

const CAMPAIGN_SORT_COLUMNS = {
  sellerName: { label: 'Store', align: 'left' },
  campaignName: { label: 'Campaign', align: 'left' },
  campaignStatus: { label: 'Status', align: 'left' },
  startDate: { label: 'Start', align: 'left' },
  endDate: { label: 'End', align: 'left' },
  fundingModel: { label: 'Funding', align: 'left' },
  bidPercentage: { label: 'Bid %', align: 'right' },
  dailyBudgetValue: { label: 'Daily budget', align: 'right' },
  campaignTargetingType: { label: 'Targeting', align: 'left' },
  channels: { label: 'Channels', align: 'left' },
  marketplaceId: { label: 'Marketplace', align: 'left' },
};

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = CAMPAIGN_SORT_COLUMNS[column];
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
  'https://developer.ebay.com/api-docs/sell/marketing/resources/campaign/methods/getCampaigns';

const CREATE_CAMPAIGN_DOCS =
  'https://developer.ebay.com/develop/api/sell/marketing_api#sell-marketing_api-campaign-createcampaign';

const PAGE_SIZES = [25, 50, 100, 200, 500];

const DEFAULT_CAMPAIGN_VISIBLE_COLUMNS = defaultVisibleColumnIds(CAMPAIGN_TABLE_COLUMNS);

const CampaignRow = memo(function CampaignRow({
  row,
  expanded,
  onToggle,
  showStore,
  visibleColumns,
  pageSellerId,
  actingKey,
  onPause,
  onResume,
  onEnd,
}) {
  const channels = Array.isArray(row.channels) ? row.channels.join(', ') : '';
  const colSpan = countMarketingTableColumns(visibleColumns, showStore, { leadingCols: 1 });
  const show = (columnId) => isMarketingColumnVisible(visibleColumns, columnId, showStore);
  const effectiveSellerId = row.sellerId || pageSellerId;
  const rowActionKey = `${effectiveSellerId}-${row.campaignId}`;
  const isActing = actingKey === rowActionKey;
  const pausable = canPauseCampaign(row.campaignStatus);
  const resumable = canResumeCampaign(row.campaignStatus);
  const endable = canEndCampaign(row.campaignStatus);
  const hasActions = pausable || resumable || endable;

  const buildActionTarget = () => {
    if (!effectiveSellerId || !row.campaignId || !row.marketplaceId) return null;
    return {
      sellerId: effectiveSellerId,
      campaignId: row.campaignId,
      marketplaceId: row.marketplaceId,
      campaignName: row.campaignName,
      campaignStatus: row.campaignStatus,
    };
  };

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={onToggle} aria-label="expand campaign">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        {show('sellerName') ? (
          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
            {row.sellerName || '—'}
          </TableCell>
        ) : null}
        {show('campaignName') ? (
        <TableCell sx={{ fontWeight: 600, maxWidth: 220 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={row.campaignName}>
            {row.campaignName || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {row.campaignId || '—'}
          </Typography>
        </TableCell>
        ) : null}
        {show('campaignStatus') ? (
        <TableCell>
          <Chip
            size="small"
            label={row.campaignStatus || '—'}
            color={STATUS_CHIP_COLOR[row.campaignStatus] || 'default'}
            variant="outlined"
          />
        </TableCell>
        ) : null}
        {show('startDate') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateOnly(row.startDate)}</TableCell>
        ) : null}
        {show('endDate') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateOnly(row.endDate)}</TableCell>
        ) : null}
        {show('fundingModel') ? (
        <TableCell>{row.fundingModel || '—'}</TableCell>
        ) : null}
        {show('bidPercentage') ? (
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.bidPercentage ? `${row.bidPercentage}%` : '—'}
        </TableCell>
        ) : null}
        {show('dailyBudgetValue') ? (
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatBudget(row.dailyBudgetValue, row.dailyBudgetCurrency)}
        </TableCell>
        ) : null}
        {show('campaignTargetingType') ? (
        <TableCell>{row.campaignTargetingType || '—'}</TableCell>
        ) : null}
        {show('channels') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{channels || '—'}</TableCell>
        ) : null}
        {show('marketplaceId') ? (
        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', fontFamily: 'monospace' }}>
          {row.marketplaceId || '—'}
        </TableCell>
        ) : null}
        {show('actions') ? (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Stack direction="row" spacing={0.5}>
            {pausable ? (
              <Tooltip title="Pause campaign">
                <span>
                  <IconButton
                    size="small"
                    aria-label="pause campaign"
                    disabled={!effectiveSellerId || isActing}
                    onClick={() => {
                      const target = buildActionTarget();
                      if (target) onPause?.(target);
                    }}
                  >
                    <PauseIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            {resumable ? (
              <Tooltip title="Resume campaign">
                <span>
                  <IconButton
                    size="small"
                    aria-label="resume campaign"
                    disabled={!effectiveSellerId || isActing}
                    onClick={() => {
                      const target = buildActionTarget();
                      if (target) onResume?.(target);
                    }}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            {endable ? (
              <Tooltip title="End campaign">
                <span>
                  <IconButton
                    size="small"
                    aria-label="end campaign"
                    disabled={!effectiveSellerId || isActing}
                    color="error"
                    onClick={() => {
                      const target = buildActionTarget();
                      if (target) onEnd?.(target);
                    }}
                  >
                    <StopCircleIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            {!hasActions ? (
              <Typography variant="caption" color="text.secondary">—</Typography>
            ) : null}
          </Stack>
        </TableCell>
        ) : null}
      </TableRow>
      <TableRow>
        <TableCell colSpan={colSpan} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6, pr: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Marketplace: {row.marketplaceId || '—'}
                {row.budgetStatus ? ` · Budget: ${row.budgetStatus}` : ''}
                {row.biddingStrategy ? ` · Bidding: ${row.biddingStrategy}` : ''}
                {row.adRateStrategy ? ` · Ad rate: ${row.adRateStrategy}` : ''}
              </Typography>
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

export default forwardRef(function MarketingCampaignsPage({
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
  const [campaignStatus, setCampaignStatus] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [fundingStrategy, setFundingStrategy] = useState('');
  const [campaignTargetingType, setCampaignTargetingType] = useState('');
  const [startDateRange, setStartDateRange] = useState('');
  const [endDateRange, setEndDateRange] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    campaignName: '',
    startDateRange: '',
    endDateRange: '',
  });
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState('endDate');
  const [sortOrder, setSortOrder] = useState('asc');

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
  const [actingKey, setActingKey] = useState('');
  const [endTarget, setEndTarget] = useState(null);
  const [lifecycleError, setLifecycleError] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(() => (
    loadMarketingVisibleColumns(MARKETING_TABLE_COLUMN_STORAGE_KEYS.campaigns, CAMPAIGN_TABLE_COLUMNS)
  ));

  useEffect(() => {
    localStorage.setItem(
      MARKETING_TABLE_COLUMN_STORAGE_KEYS.campaigns,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  useEffect(() => {
    if (embedded || sellerId || sellers.length === 0) return;
    setLocalSellerId(ALL_STORES_VALUE);
  }, [embedded, sellers, sellerId]);

  const isAllStores = sellerId === ALL_STORES_VALUE;
  const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;

  const campaignColumnOptions = useMemo(
    () => getMarketingColumnOptions(CAMPAIGN_TABLE_COLUMNS, isAllStores),
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

  const sharedParams = useMemo(
    () => ({
      marketplace: isAllMarketplaces ? ALL_MARKETPLACES_VALUE : marketplace,
      campaign_status: campaignStatus || undefined,
      campaign_name: appliedFilters.campaignName.trim() || undefined,
      funding_strategy: fundingStrategy || undefined,
      campaign_targeting_type: campaignTargetingType || undefined,
      start_date_range: appliedFilters.startDateRange.trim() || undefined,
      end_date_range: appliedFilters.endDateRange.trim() || undefined,
    }),
    [marketplace, isAllMarketplaces, campaignStatus, fundingStrategy, campaignTargetingType, appliedFilters],
  );

  const kpiParams = useMemo(
    () => ({
      marketplace: isAllMarketplaces ? ALL_MARKETPLACES_VALUE : marketplace,
      campaign_status: 'RUNNING',
    }),
    [marketplace, isAllMarketplaces],
  );

  const loadAllStoresCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/marketing/campaigns/all', {
        params: {
          ...sharedParams,
          perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
        },
      });
      const merged = Array.isArray(data?.campaigns) ? data.campaigns : [];
      setAllRows(merged);
      setTotal(merged.length);
      setStoreErrors(Array.isArray(data?.errors) ? data.errors : []);
    } catch (err) {
      setAllRows([]);
      setRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load campaigns'));
    } finally {
      setLoading(false);
    }
  }, [sharedParams]);

  const loadSingleSellerCampaigns = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/marketing/campaigns', {
        params: {
          ...sharedParams,
          sellerId,
          limit: pageSize,
          offset,
        },
      });
      const singleRows = Array.isArray(data?.campaigns) ? data.campaigns : [];
      setAllRows([]);
      setRows(singleRows);
      const parsedTotal = data?.total != null ? Number(data.total) : null;
      setTotal(Number.isFinite(parsedTotal) ? parsedTotal : null);
    } catch (err) {
      setRows([]);
      setAllRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load campaigns'));
    } finally {
      setLoading(false);
    }
  }, [sellerId, sharedParams, pageSize, offset]);

  const loadCampaigns = useCallback(() => {
    if (!sellerId) return Promise.resolve();
    return isAllStores ? loadAllStoresCampaigns() : loadSingleSellerCampaigns();
  }, [sellerId, isAllStores, loadAllStoresCampaigns, loadSingleSellerCampaigns]);

  const loadKpiCampaigns = useCallback(async ({ refresh = false } = {}) => {
    if (!sellerId) return;
    const cacheKey = buildMarketingKpiCacheKey('campaigns', sellerId, marketplace);
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
        const { data } = await api.get('/ebay/marketing/campaigns/all', {
          params: {
            ...kpiParams,
            perSellerLimit: KPI_FETCH_LIMIT,
          },
        });
        rows = Array.isArray(data?.campaigns) ? data.campaigns : [];
      } else {
        const { data } = await api.get('/ebay/marketing/campaigns', {
          params: {
            ...kpiParams,
            sellerId,
            limit: KPI_FETCH_LIMIT,
            offset: 0,
          },
        });
        rows = Array.isArray(data?.campaigns) ? data.campaigns : [];
      }
      setKpiRows(rows);
      setMarketingKpiCache(cacheKey, rows);
    } catch {
      setKpiRows([]);
    } finally {
      setKpiLoading(false);
    }
  }, [sellerId, isAllStores, kpiParams, marketplace]);

  const refreshCampaigns = useCallback(({ refreshKpi = true } = {}) => {
    const jobs = [loadCampaigns()];
    if (refreshKpi) {
      jobs.push(loadKpiCampaigns({ refresh: true }));
      invalidateMarketingKpiCache('campaigns:');
    }
    void Promise.all(jobs);
  }, [loadCampaigns, loadKpiCampaigns]);

  useImperativeHandle(ref, () => ({
    refresh: () => refreshCampaigns(),
    openCreate: () => setCreateOpen(true),
  }), [refreshCampaigns]);

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
    void loadAllStoresCampaigns();
  }, [active, sellerId, isAllStores, sharedParams, loadAllStoresCampaigns]);

  useEffect(() => {
    if (!active || !sellerId || isAllStores) return;
    void loadSingleSellerCampaigns();
  }, [active, sellerId, isAllStores, sharedParams, pageSize, offset, loadSingleSellerCampaigns]);

  const displayRows = useMemo(() => {
    const source = isAllStores ? allRows : rows;
    const sorted = [...source].sort((a, b) => compareCampaignRows(a, b, sortBy, sortOrder));
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
    void loadKpiCampaigns();
  }, [active, sellerId, isAllStores, kpiParams, loadKpiCampaigns]);

  useEffect(() => {
    setOffset(0);
  }, [sellerId, marketplace]);

  const pageIndex = Math.floor(offset / pageSize);
  const pageCount = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const canPrev = offset > 0;
  const canNext = total != null ? offset + pageSize < total : displayRows.length >= pageSize;

  const applyFilters = () => {
    setOffset(0);
    setAppliedFilters({
      campaignName,
      startDateRange,
      endDateRange,
    });
  };

  const runCampaignLifecycle = useCallback(async (target, action) => {
    if (!target?.sellerId || !target?.campaignId || !target?.marketplaceId) return;
    const key = `${target.sellerId}-${target.campaignId}`;
    setActingKey(key);
    setLifecycleError('');
    try {
      await api.post(`/ebay/marketing/campaigns/${action}`, {
        sellerId: target.sellerId,
        campaignId: target.campaignId,
        marketplaceId: target.marketplaceId,
      });
      if (action === 'end') setEndTarget(null);
      refreshCampaigns();
    } catch (err) {
      setLifecycleError(parseCampaignApiError(err, `Failed to ${action} campaign`));
    } finally {
      setActingKey('');
    }
  }, [refreshCampaigns]);

  const handlePauseCampaign = useCallback((target) => {
    void runCampaignLifecycle(target, 'pause');
  }, [runCampaignLifecycle]);

  const handleResumeCampaign = useCallback((target) => {
    void runCampaignLifecycle(target, 'resume');
  }, [runCampaignLifecycle]);

  const handleEndCampaign = useCallback(() => {
    if (!endTarget) return;
    void runCampaignLifecycle(endTarget, 'end');
  }, [endTarget, runCampaignLifecycle]);

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
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Marketing Campaigns</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Promoted Listings &amp; marketing campaigns via eBay{' '}
              <code>getCampaigns</code> / <code>createCampaign</code> —{' '}
              <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">List</Link>
              {' · '}
              <Link href={CREATE_CAMPAIGN_DOCS} target="_blank" rel="noopener noreferrer">Create</Link>
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => refreshCampaigns()}
            disabled={!sellerId || loading}
          >
            Refresh
          </Button>
        </Stack>
      ) : null}

      <MarketingKpiStrip
        rows={kpiRows}
        loading={kpiLoading}
        statusKey="campaignStatus"
        typeKey="fundingModel"
        typeLabel="Funding"
        entityLabel="campaigns"
        typeOptions={FUNDING_OPTIONS}
      />

      <MarketingCollapsibleFilters title="Campaign filters">
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
              <Select label="Status" value={campaignStatus} onChange={(e) => setCampaignStatus(e.target.value)}>
                {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Funding</InputLabel>
              <Select label="Funding" value={fundingStrategy} onChange={(e) => setFundingStrategy(e.target.value)}>
                {FUNDING_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Targeting</InputLabel>
              <Select label="Targeting" value={campaignTargetingType} onChange={(e) => setCampaignTargetingType(e.target.value)}>
                {TARGETING_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Campaign name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Exact campaign name"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Start date range"
              value={startDateRange}
              onChange={(e) => setStartDateRange(e.target.value)}
              placeholder="2026-01-01T00:00:00.000Z..2026-03-01T00:00:00.000Z"
              helperText="UTC range per eBay API"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              label="End date range"
              value={endDateRange}
              onChange={(e) => setEndDateRange(e.target.value)}
              placeholder="..2026-12-31T23:59:59.000Z"
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
            <Button variant="outlined" onClick={applyFilters} disabled={!sellerId || loading} fullWidth>
              Apply filters
            </Button>
          </Grid>
        </Grid>
      </MarketingCollapsibleFilters>

      {selectedSellerName ? (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Store: <strong>{selectedSellerName}</strong>
            {total != null ? ` · ${total.toLocaleString()} campaign(s)` : ` · ${displayRows.length} on this page`}
          </Typography>
          <ColumnSelector
            allColumns={campaignColumnOptions}
            visibleColumns={filterVisibleColumnsForSelector(visibleColumns, isAllStores)}
            onColumnChange={setVisibleColumns}
            onReset={() => setVisibleColumns(DEFAULT_CAMPAIGN_VISIBLE_COLUMNS)}
            page="marketing-campaigns"
          />
        </Stack>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {lifecycleError ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLifecycleError('')}>{lifecycleError}</Alert> : null}

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
                  {showColumn('campaignName') ? (
                    <SortableHeader column="campaignName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('campaignStatus') ? (
                    <SortableHeader column="campaignStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('startDate') ? (
                    <SortableHeader column="startDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('endDate') ? (
                    <SortableHeader column="endDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('fundingModel') ? (
                    <SortableHeader column="fundingModel" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('bidPercentage') ? (
                    <SortableHeader column="bidPercentage" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('dailyBudgetValue') ? (
                    <SortableHeader column="dailyBudgetValue" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('campaignTargetingType') ? (
                    <SortableHeader column="campaignTargetingType" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  ) : null}
                  {showColumn('channels') ? (
                    <SortableHeader column="channels" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
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
                        No campaigns returned for these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayRows.map((row) => (
                    <CampaignRow
                      key={`${row.sellerId || 'one'}-${row.campaignId || row.campaignName}`}
                      row={row}
                      showStore={isAllStores}
                      visibleColumns={visibleColumns}
                      pageSellerId={isAllStores ? '' : sellerId}
                      actingKey={actingKey}
                      onPause={handlePauseCampaign}
                      onResume={handleResumeCampaign}
                      onEnd={setEndTarget}
                      expanded={expandedId === `${row.sellerId}-${row.campaignId}`}
                      onToggle={() => setExpandedId((prev) => (
                        prev === `${row.sellerId}-${row.campaignId}` ? null : `${row.sellerId}-${row.campaignId}`
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

      <CreateCampaignDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        sellers={sellers}
        defaultSellerId={isAllStores ? '' : sellerId}
        defaultMarketplace={isAllMarketplaces ? 'EBAY_US' : marketplace}
        onCreated={() => {
          setCreateOpen(false);
          refreshCampaigns();
        }}
      />

      <Dialog
        open={Boolean(endTarget)}
        onClose={actingKey ? undefined : () => setEndTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>End campaign?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            End <strong>{endTarget?.campaignName || endTarget?.campaignId}</strong>
            {' '}on {endTarget?.marketplaceId}? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndTarget(null)} disabled={Boolean(actingKey)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleEndCampaign}
            disabled={Boolean(actingKey)}
          >
            {actingKey ? 'Ending…' : 'End campaign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});
