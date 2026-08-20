import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Fade,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
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
import { alpha } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import api from '../../lib/api';
import OrdersDashboardSkeleton from '../../components/skeletons/OrdersDashboardSkeleton';
import PageHeader from '../../components/PageHeader.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import { sortSellersByName, sellerDisplayName } from '../../lib/sellersSort';
import { BRAND_DARK } from '../../constants/brandTheme.js';
import { tableBodyRowSx, tableHeaderCellSx } from '../../theme/tableStyles.js';

const DASHBOARD_DATE_KEY = 'orders_dashboard_date';
const MARKETPLACE_OPTIONS = [
  { value: '', label: 'All marketplaces' },
  { value: 'EBAY_US', label: 'USA' },
  { value: 'EBAY_CA', label: 'CA' },
  { value: 'EBAY_AU', label: 'AUS' },
  { value: 'EBAY_GB', label: 'UK' },
];

const MARKETPLACE_SHORT = {
  EBAY_US: 'US',
  EBAY_CA: 'CA',
  EBAY_AU: 'AU',
  EBAY_GB: 'UK',
  EBAY_ENCA: 'CA',
};

function fmtDateTimePt(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDatePt(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
  });
}

function getTodayPtDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatKpi(value) {
  if (value == null || value === '-') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-US');
}

function formatDelta(value) {
  if (value == null || value === '-') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const abs = Math.abs(n).toLocaleString('en-US');
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return '0';
}

function marketplaceLabel(id) {
  if (!id) return '—';
  return MARKETPLACE_SHORT[id] || String(id).replace(/^EBAY_/, '');
}

function cancelRefundParts(order) {
  const parts = [];
  const cancelState = String(order?.cancelState || order?.cancelStatus?.cancelState || '').toUpperCase();
  if (cancelState === 'CANCELED' || cancelState === 'CANCELLED') {
    parts.push({ label: 'Cancelled', color: 'error' });
  } else if (cancelState === 'CANCEL_REQUESTED' || cancelState === 'IN_PROGRESS') {
    parts.push({ label: 'Cancel req', color: 'warning' });
  }

  const pay = String(order?.orderPaymentStatus || '').toUpperCase();
  if (pay === 'FULLY_REFUNDED') parts.push({ label: 'Refunded', color: 'warning' });
  else if (pay === 'PARTIALLY_REFUNDED') parts.push({ label: 'Partial', color: 'warning' });

  if (order?.hasReturn) parts.push({ label: 'Return', color: 'info' });
  return parts;
}

function KpiCard({ title, value, hint, color = BRAND_DARK, to }) {
  const card = (
    <SectionCard
      sx={{
        p: 1.5,
        height: '100%',
        minHeight: 88,
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        ...(to && {
          '&:hover': {
            borderColor: alpha(BRAND_DARK, 0.22),
          },
        }),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: 'text.secondary',
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontSize: '0.68rem',
          lineHeight: 1.3,
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          mt: 0.75,
          fontSize: hint ? '1.35rem' : '1.65rem',
          fontWeight: 800,
          lineHeight: 1.1,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.4, fontSize: '0.68rem' }}>
          {hint}
        </Typography>
      )}
    </SectionCard>
  );

  if (!to) return card;
  return (
    <Box
      component={Link}
      to={to}
      sx={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
    >
      {card}
    </Box>
  );
}

function SectionHeading({ title, to, count }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
      <Stack direction="row" alignItems="baseline" gap={1} minWidth={0}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {title}
        </Typography>
        {count != null && (
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </Typography>
        )}
      </Stack>
      {to && (
        <Chip
          component={Link}
          to={to}
          clickable
          size="small"
          label="Open"
          icon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
          sx={{ height: 24, '& .MuiChip-icon': { ml: 0.5, mr: -0.25 } }}
        />
      )}
    </Stack>
  );
}

function RankList({ rows, empty, getLabel, getValue, chipColor = 'default' }) {
  if (!rows?.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        {empty}
      </Typography>
    );
  }

  return (
    <Stack divider={<Divider />}>
      {rows.map((row) => (
        <Stack
          key={row.sellerId}
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          sx={{ py: 0.7, minHeight: 32 }}
        >
          <Typography variant="body2" noWrap title={getLabel(row)} sx={{ fontWeight: 500 }}>
            {getLabel(row)}
          </Typography>
          <Chip
            size="small"
            color={chipColor}
            label={getValue(row)}
            sx={{ height: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          />
        </Stack>
      ))}
    </Stack>
  );
}

export default function OrdersDepartmentDashboardPage() {
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  const [date, setDate] = useState(() => sessionStorage.getItem(DASHBOARD_DATE_KEY) || getTodayPtDateString());
  const [excludeLowValue, setExcludeLowValue] = useState(true);

  const [overview, setOverview] = useState(null);

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    sessionStorage.setItem(DASHBOARD_DATE_KEY, date);
  }, [date]);

  useEffect(() => {
    loadSellers();
  }, []);

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selectedSeller, selectedMarketplace, excludeLowValue]);

  async function loadSellers() {
    try {
      const { data } = await api.get('/sellers/all');
      setSellers(sortSellersByName(data || []));
    } catch (e) {
      console.error('Failed to load sellers:', e);
      setSellers([]);
    }
  }

  async function loadDashboard() {
    setLoading(true);
    const params = {
      date,
      excludeLowValue: excludeLowValue ? 'true' : 'false',
    };
    if (selectedSeller) params.sellerId = selectedSeller;
    if (selectedMarketplace) params.marketplace = selectedMarketplace;

    const settled = await Promise.allSettled([
      api.get('/orders/dashboard/overview', { params }),
    ]);

    const nextErrors = [];

    if (settled[0].status === 'fulfilled') {
      setOverview(settled[0].value.data || null);
    } else {
      setOverview(null);
      nextErrors.push(`Overview failed: ${settled[0].reason?.response?.data?.error || settled[0].reason?.message || 'Unknown error'}`);
    }

    setErrors(nextErrors);
    setLastUpdatedAt(new Date().toISOString());
    setLoading(false);
  }

  const quickLinks = [
    { label: 'All Orders', to: '/admin/fulfillment' },
    { label: 'Awaiting Sheet', to: '/admin/awaiting-sheet' },
    { label: 'Amazon Arrivals', to: '/admin/amazon-arrivals' },
    { label: 'Account Health', to: '/admin/account-health' },
    { label: 'Buyer Messages', to: '/admin/message-received' },
  ];

  const topBlockers = overview?.riskQueues?.topBlockers || [];
  const nonCompliantSellerList = overview?.riskQueues?.nonCompliantSellerList || [];
  const unreadBySeller = overview?.riskQueues?.unreadBySeller || [];
  const awaitingBySeller = overview?.riskQueues?.awaitingBySeller || [];
  const arrivalsBySeller = overview?.riskQueues?.arrivalsBySeller || [];
  const todayOrdersRaw = overview?.todayOrdersTable || [];
  const returnedOrderIds = new Set(
    (overview?.todayOrdersTable || []).filter((row) => row.hasReturn).map((row) => String(row.orderId || ''))
  );
  const todayOrders = todayOrdersRaw.map((order) => ({
    ...order,
    hasReturn: Boolean(order.hasReturn) || returnedOrderIds.has(String(order.orderId || '')),
  }));
  const monthlyDelta = overview?.kpis?.monthlyDeltaNet;

  if (loading && !overview) return <OrdersDashboardSkeleton />;

  return (
    <Fade in={!loading} timeout={250}>
      <Box sx={{ px: { xs: 2, md: 3 }, pb: 3 }}>
        <PageHeader
          title="Orders Department"
          subtitle="Fulfillment and compliance snapshot"
          sx={{ pt: 0.5, pb: 1.5 }}
          actions={
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              Updated {fmtDateTimePt(lastUpdatedAt)} PT
            </Typography>
          }
        />

        <SectionCard sx={{ p: 1.5, mb: 1.5 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.25}
            alignItems={{ xs: 'stretch', md: 'center' }}
            flexWrap="wrap"
            useFlexGap
          >
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: '100%', md: 168 } }}
            />
            <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 200 }, flex: { md: '0 1 220px' } }}>
              <InputLabel>Seller</InputLabel>
              <Select value={selectedSeller} label="Seller" onChange={(e) => setSelectedSeller(e.target.value)}>
                <MenuItem value="">All sellers</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {sellerDisplayName(s) || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 160 } }}>
              <InputLabel>Marketplace</InputLabel>
              <Select
                value={selectedMarketplace}
                label="Marketplace"
                onChange={(e) => setSelectedMarketplace(e.target.value)}
              >
                {MARKETPLACE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={excludeLowValue}
                  onChange={(e) => setExcludeLowValue(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography component="span" variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                  Exclude {'<'}$3
                </Typography>
              }
              sx={{ m: 0, mr: 0.5 }}
            />
            <Tooltip title="Refresh">
              <span>
                <IconButton
                  onClick={loadDashboard}
                  disabled={loading}
                  size="small"
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    height: 40,
                    width: 40,
                  }}
                >
                  {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </SectionCard>

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {quickLinks.map((linkItem) => (
            <Chip
              key={linkItem.to}
              component={Link}
              to={linkItem.to}
              clickable
              size="small"
              label={linkItem.label}
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          ))}
        </Stack>

        {errors.map((msg, idx) => (
          <Alert key={idx} severity="warning" sx={{ mb: 1.5 }}>
            {msg}
          </Alert>
        ))}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' },
            gap: 1.25,
            mb: 2,
          }}
        >
          <KpiCard
            title="Today orders"
            value={`${formatKpi(overview?.kpis?.todaySuccessfulOrders ?? overview?.kpis?.todayOrders)} / ${formatKpi(overview?.kpis?.todayOrders)}`}
            hint="Successful / all"
            to={`/admin/fulfillment?dateSold=${date}`}
          />
          <KpiCard
            title="Monthly Δ (net)"
            value={formatDelta(monthlyDelta)}
            color={(Number(monthlyDelta) || 0) >= 0 ? 'success.main' : 'error.main'}
          />
          <KpiCard
            title="Awaiting today"
            value={formatKpi(overview?.kpis?.awaitingToday)}
            to={`/admin/awaiting-sheet?date=${date}`}
          />
          <KpiCard
            title="Arrivals today"
            value={formatKpi(overview?.kpis?.arrivalsToday)}
            to="/admin/amazon-arrivals"
          />
          <KpiCard
            title="Unread today"
            value={formatKpi(overview?.kpis?.unreadBuyerMessagesToday)}
            color="warning.main"
            to="/admin/message-received"
          />
          <KpiCard
            title="Non-compliant"
            value={formatKpi(overview?.kpis?.nonCompliantAccounts)}
            color="error.main"
            to="/admin/account-health"
          />
        </Box>

        <SectionCard sx={{ px: 1.5, py: 1.25, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'text.secondary' }}>
              Top blockers
            </Typography>
            {topBlockers.length === 0 && <Chip size="small" label="None for these filters" />}
            {topBlockers.map((b) => (
              <Chip
                key={b.sellerId}
                size="small"
                color="warning"
                variant="outlined"
                label={`${b.sellerName} · ${b.awaiting} awaiting · ${b.unread} unread`}
              />
            ))}
          </Stack>
        </SectionCard>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.65fr) minmax(280px, 1fr)' },
            gap: 2,
            mb: 2,
            alignItems: 'start',
          }}
        >
          <SectionCard sx={{ p: 0, overflow: 'hidden' }}>
            <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
              <SectionHeading
                title="Today's orders"
                count={todayOrders.length ? `${todayOrders.length}` : '0'}
                to={`/admin/fulfillment?dateSold=${date}`}
              />
            </Box>
            <TableContainer sx={{ maxHeight: 560 }}>
              <Table
                size="small"
                stickyHeader
                sx={{
                  tableLayout: 'fixed',
                  width: '100%',
                  '& .MuiTableCell-root': {
                    py: 0.7,
                    px: 1,
                    fontSize: '0.78rem',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...tableHeaderCellSx, py: 1, width: '16%' }}>Seller</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, py: 1, width: '22%' }}>Order ID</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, py: 1, width: '18%' }}>Sold (PT)</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, py: 1, width: '10%' }}>Mkt</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, py: 1, width: '12%' }}>Ship by</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, py: 1, width: '22%' }}>Cancel / Refund</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {todayOrders.map((o) => (
                    <TableRow key={o._id || o.id || o.orderId} hover sx={tableBodyRowSx}>
                      <TableCell title={o.seller?.user?.username || o.sellerName || '—'}>
                        {o.seller?.user?.username || o.sellerName || '—'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }} title={o.orderId || '—'}>
                        {o.orderId || '—'}
                      </TableCell>
                      <TableCell>{fmtDateTimePt(o.dateSold)}</TableCell>
                      <TableCell>{marketplaceLabel(o.purchaseMarketplaceId)}</TableCell>
                      <TableCell>{fmtDatePt(o.shipByDate)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal !important' }}>
                        {(() => {
                          const parts = cancelRefundParts(o);
                          if (!parts.length) return '—';
                          return (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {parts.map((part) => (
                                <Chip
                                  key={part.label}
                                  size="small"
                                  color={part.color}
                                  label={part.label}
                                  sx={{ height: 20, fontWeight: 700, fontSize: '0.68rem' }}
                                />
                              ))}
                            </Stack>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {todayOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ whiteSpace: 'normal !important', py: 4 }}>
                        No orders found for the selected date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>

          <SectionCard sx={{ p: 2 }}>
            <SectionHeading title="Needs attention" />
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Non-compliant
              </Typography>
              <Chip component={Link} to="/admin/account-health" clickable size="small" label="Open" sx={{ height: 22 }} />
            </Stack>
            <RankList
              rows={nonCompliantSellerList.slice(0, 8)}
              empty="No non-compliant sellers in this window."
              getLabel={(row) => row.sellerName}
              getValue={(row) => `${row.bbeRate}%`}
              chipColor="error"
            />
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Unread messages
              </Typography>
              <Chip component={Link} to="/admin/message-received" clickable size="small" label="Open" sx={{ height: 22 }} />
            </Stack>
            <RankList
              rows={unreadBySeller.slice(0, 8)}
              empty="No unread buyer messages today."
              getLabel={(row) => row.sellerName}
              getValue={(row) => row.count}
              chipColor="warning"
            />
          </SectionCard>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          <SectionCard sx={{ p: 2 }}>
            <SectionHeading title="Awaiting by seller" count={awaitingBySeller.length || null} to={`/admin/awaiting-sheet?date=${date}`} />
            <RankList
              rows={awaitingBySeller.slice(0, 12)}
              empty="No awaiting items today."
              getLabel={(row) => row.sellerName}
              getValue={(row) => row.count}
            />
          </SectionCard>
          <SectionCard sx={{ p: 2 }}>
            <SectionHeading title="Arrivals by seller" count={arrivalsBySeller.length || null} to="/admin/amazon-arrivals" />
            <RankList
              rows={arrivalsBySeller.slice(0, 12)}
              empty="No arrivals today."
              getLabel={(row) => row.sellerName}
              getValue={(row) => row.count}
            />
          </SectionCard>
        </Box>
      </Box>
    </Fade>
  );
}
