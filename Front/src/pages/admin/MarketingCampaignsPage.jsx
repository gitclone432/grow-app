import { memo, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
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
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import MarketingKpiStrip from '../../components/marketing/MarketingKpiStrip.jsx';
import MarketingCollapsibleFilters from '../../components/marketing/MarketingCollapsibleFilters.jsx';
import MarketingStoreFilters from '../../components/marketing/MarketingStoreFilters.jsx';
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
  formatBudget,
  formatDate,
  getMarketingKpiCache,
  invalidateMarketingKpiCache,
  parseApiError,
  resolveSellerName,
  setMarketingKpiCache,
} from '../../lib/marketingUtils.js';

const EBAY_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/campaign/methods/getCampaigns';

const PAGE_SIZES = [25, 50, 100, 200, 500];

const CampaignRow = memo(function CampaignRow({ row, expanded, onToggle, showStore }) {
  const channels = Array.isArray(row.channels) ? row.channels.join(', ') : '';
  const colSpan = showStore ? 11 : 10;
  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={onToggle} aria-label="expand campaign">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        {showStore ? (
          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
            {row.sellerName || '—'}
          </TableCell>
        ) : null}
        <TableCell sx={{ fontWeight: 600, maxWidth: 220 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={row.campaignName}>
            {row.campaignName || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {row.campaignId || '—'}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            label={row.campaignStatus || '—'}
            color={STATUS_CHIP_COLOR[row.campaignStatus] || 'default'}
            variant="outlined"
          />
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.startDate)}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.endDate)}</TableCell>
        <TableCell>{row.fundingModel || '—'}</TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.bidPercentage ? `${row.bidPercentage}%` : '—'}
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatBudget(row.dailyBudgetValue, row.dailyBudgetCurrency)}
        </TableCell>
        <TableCell>{row.campaignTargetingType || '—'}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{channels || '—'}</TableCell>
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

  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [storeErrors, setStoreErrors] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (embedded || sellerId || sellers.length === 0) return;
    setLocalSellerId(ALL_STORES_VALUE);
  }, [embedded, sellers, sellerId]);

  const isAllStores = sellerId === ALL_STORES_VALUE;
  const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;

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
            perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
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
    void Promise.all([
      loadCampaigns(),
      refreshKpi ? loadKpiCampaigns({ refresh: true }) : Promise.resolve(),
    ]);
    if (refreshKpi) invalidateMarketingKpiCache('campaigns:');
  }, [loadCampaigns, loadKpiCampaigns]);

  useImperativeHandle(ref, () => ({
    refresh: () => refreshCampaigns(),
  }), [refreshCampaigns]);

  useEffect(() => {
    if (!embedded || !onToolbarState) return;
    onToolbarState({
      loading,
      refreshDisabled: !sellerId || loading,
    });
  }, [embedded, onToolbarState, loading, sellerId]);

  useEffect(() => {
    if (!active || !sellerId || !isAllStores) return;
    void loadAllStoresCampaigns();
  }, [active, sellerId, isAllStores, sharedParams, loadAllStoresCampaigns]);

  useEffect(() => {
    if (!active || !sellerId || isAllStores) return;
    void loadSingleSellerCampaigns();
  }, [active, sellerId, isAllStores, sharedParams, pageSize, offset, loadSingleSellerCampaigns]);

  useEffect(() => {
    if (!isAllStores) return;
    setRows(allRows.slice(offset, offset + pageSize));
  }, [isAllStores, allRows, offset, pageSize]);

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
  const canNext = total != null ? offset + pageSize < total : rows.length >= pageSize;

  const applyFilters = () => {
    setOffset(0);
    setAppliedFilters({
      campaignName,
      startDateRange,
      endDateRange,
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
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Marketing Campaigns</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Promoted Listings &amp; marketing campaigns via eBay{' '}
              <code>getCampaigns</code> —{' '}
              <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Store: <strong>{selectedSellerName}</strong>
          {total != null ? ` · ${total.toLocaleString()} campaign(s)` : ` · ${rows.length} on this page`}
        </Typography>
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
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 48 }} />
                  {isAllStores ? <TableCell sx={{ fontWeight: 700 }}>Store</TableCell> : null}
                  <TableCell sx={{ fontWeight: 700 }}>Campaign</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>End</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Funding</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Bid %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Daily budget</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Targeting</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Channels</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAllStores ? 11 : 10}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No campaigns returned for these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <CampaignRow
                      key={`${row.sellerId || 'one'}-${row.campaignId || row.campaignName}`}
                      row={row}
                      showStore={isAllStores}
                      expanded={expandedId === `${row.sellerId}-${row.campaignId}`}
                      onToggle={() => setExpandedId((prev) => (
                        prev === `${row.sellerId}-${row.campaignId}` ? null : `${row.sellerId}-${row.campaignId}`
                      ))}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
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
    </Box>
  );
});
