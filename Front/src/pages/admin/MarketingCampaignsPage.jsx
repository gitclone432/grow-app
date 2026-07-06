import { useCallback, useEffect, useMemo, useState } from 'react';
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

const EBAY_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/campaign/methods/getCampaigns';

const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];
const PAGE_SIZES = [25, 50, 100, 200, 500];

const CAMPAIGN_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'DELETED', label: 'Deleted' },
];

const FUNDING_OPTIONS = [
  { value: '', label: 'All funding models' },
  { value: 'COST_PER_SALE', label: 'Cost per sale (CPS)' },
  { value: 'COST_PER_CLICK', label: 'Cost per click (CPC)' },
];

const TARGETING_OPTIONS = [
  { value: '', label: 'All targeting types' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SMART', label: 'Smart' },
];

const STATUS_CHIP_COLOR = {
  RUNNING: 'success',
  PAUSED: 'warning',
  ENDED: 'default',
  DELETED: 'error',
  SCHEDULED: 'info',
  DRAFT: 'default',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBudget(value, currency) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(num);
  } catch {
    return `${num} ${cur}`;
  }
}

function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

function CampaignRow({ row, expanded, onToggle }) {
  const channels = Array.isArray(row.channels) ? row.channels.join(', ') : '';
  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={onToggle} aria-label="expand campaign">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
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
        <TableCell colSpan={10} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
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
}

export default function MarketingCampaignsPage() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [marketplace, setMarketplace] = useState('EBAY_US');
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
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setSellers(list);
        if (list.length > 0) setSellerId((prev) => prev || list[0]._id);
      })
      .catch(() => setSellers([]));
  }, []);

  const selectedSellerName = useMemo(
    () => sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '',
    [sellers, sellerId]
  );

  const loadCampaigns = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ebay/marketing/campaigns', {
        params: {
          sellerId,
          marketplace,
          limit: pageSize,
          offset,
          campaign_status: campaignStatus || undefined,
          campaign_name: appliedFilters.campaignName.trim() || undefined,
          funding_strategy: fundingStrategy || undefined,
          campaign_targeting_type: campaignTargetingType || undefined,
          start_date_range: appliedFilters.startDateRange.trim() || undefined,
          end_date_range: appliedFilters.endDateRange.trim() || undefined,
        },
      });
      setRows(Array.isArray(data?.campaigns) ? data.campaigns : []);
      const parsedTotal = data?.total != null ? Number(data.total) : null;
      setTotal(Number.isFinite(parsedTotal) ? parsedTotal : null);
    } catch (err) {
      setRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load campaigns'));
    } finally {
      setLoading(false);
    }
  }, [
    sellerId,
    marketplace,
    pageSize,
    offset,
    campaignStatus,
    fundingStrategy,
    campaignTargetingType,
    appliedFilters,
  ]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

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
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
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
          onClick={() => void loadCampaigns()}
          disabled={!sellerId || loading}
        >
          Refresh
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Seller</InputLabel>
              <Select label="Seller" value={sellerId} onChange={(e) => { setSellerId(e.target.value); setOffset(0); }}>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.user?.email || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Marketplace</InputLabel>
              <Select label="Marketplace" value={marketplace} onChange={(e) => { setMarketplace(e.target.value); setOffset(0); }}>
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
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
      </Paper>

      {selectedSellerName ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Store: <strong>{selectedSellerName}</strong>
          {total != null ? ` · ${total.toLocaleString()} campaign(s)` : ` · ${rows.length} on this page`}
        </Typography>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Alert severity="info" sx={{ mb: 2 }}>
        Requires OAuth scope <code>sell.marketing.readonly</code> or <code>sell.marketing</code>.
        Reconnect the seller if you see scope or permission errors.
      </Alert>

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
                    <TableCell colSpan={10}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No campaigns returned for these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <CampaignRow
                      key={row.campaignId || row.campaignName}
                      row={row}
                      expanded={expandedId === row.campaignId}
                      onToggle={() => setExpandedId((prev) => (prev === row.campaignId ? null : row.campaignId))}
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
}
