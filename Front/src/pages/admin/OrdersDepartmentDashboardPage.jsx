import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
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
  Typography
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../../lib/api';
import OrdersDashboardSkeleton from '../../components/skeletons/OrdersDashboardSkeleton';
import { Fade } from '@mui/material';
import { sortSellersByName, sellerDisplayName } from '../../lib/sellersSort';

const DASHBOARD_DATE_KEY = 'orders_dashboard_date';
const MARKETPLACE_OPTIONS = [
  { value: '', label: 'All Marketplaces' },
  { value: 'EBAY_US', label: 'USA' },
  { value: 'EBAY_CA', label: 'CA' },
  { value: 'EBAY_AU', label: 'AUS' },
  { value: 'EBAY_GB', label: 'UK' },
];

function fmtDateTimePt(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fmtDatePt(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric'
  });
}

function getTodayPtDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function KpiCard({ title, value, color = 'primary.main', actionTo, actionLabel }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h4" fontWeight="bold" sx={{ color }}>
          {value}
        </Typography>
        {actionTo && (
          <Button
            size="small"
            component={Link}
            to={actionTo}
            endIcon={<OpenInNewIcon fontSize="small" />}
            sx={{ width: 'fit-content', mt: 0.5 }}
          >
            {actionLabel || 'Open'}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

export default function OrdersDepartmentDashboardPage() {
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  const [date, setDate] = useState(() => sessionStorage.getItem(DASHBOARD_DATE_KEY) || getTodayPtDateString());
  // Default ON: hide sub-$3 orders; user can turn off for this session
  const [excludeLowValue, setExcludeLowValue] = useState(true);

  const [overview, setOverview] = useState(null);
  const [ordersTable, setOrdersTable] = useState([]);

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
      excludeLowValue: excludeLowValue ? 'true' : 'false'
    };
    if (selectedSeller) params.sellerId = selectedSeller;
    if (selectedMarketplace) params.marketplace = selectedMarketplace;

    const settled = await Promise.allSettled([
      api.get('/orders/dashboard/overview', { params }),
      api.get('/ebay/stored-orders', { params: { sellerId: selectedSeller || undefined, dateSold: date, page: 1, limit: 25, searchMarketplace: selectedMarketplace || undefined, excludeLowValue: excludeLowValue ? 'true' : 'false' } })
    ]);

    const nextErrors = [];

    if (settled[0].status === 'fulfilled') {
      setOverview(settled[0].value.data || null);
    } else {
      setOverview(null);
      nextErrors.push(`Overview failed: ${settled[0].reason?.response?.data?.error || settled[0].reason?.message || 'Unknown error'}`);
    }

    if (settled[1].status === 'fulfilled') {
      setOrdersTable(settled[1].value.data?.orders || []);
    } else {
      setOrdersTable([]);
      nextErrors.push(`Today's order list failed: ${settled[1].reason?.response?.data?.error || settled[1].reason?.message || 'Unknown error'}`);
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
    { label: 'Buyer Messages', to: '/admin/message-received' }
  ];

  const topBlockers = overview?.riskQueues?.topBlockers || [];
  const nonCompliantSellerList = overview?.riskQueues?.nonCompliantSellerList || [];
  const unreadBySeller = overview?.riskQueues?.unreadBySeller || [];
  const awaitingBySeller = overview?.riskQueues?.awaitingBySeller || [];
  const arrivalsBySeller = overview?.riskQueues?.arrivalsBySeller || [];

  if (loading && !overview) return <OrdersDashboardSkeleton />;

  return (
    <Fade in={!loading} timeout={600}>
    <Box sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4">Orders Department Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Snapshot view for fulfillment and compliance workflows
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Last updated: {fmtDateTimePt(lastUpdatedAt)} PT
        </Typography>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} flexWrap="wrap" useFlexGap>
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: 180 }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={selectedSeller}
              label="Seller"
              onChange={(e) => setSelectedSeller(e.target.value)}
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {sellerDisplayName(s) || s._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
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
                color="primary"
              />
            }
            label={
              <Typography component="span" variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                Exclude {'<'}$3
              </Typography>
            }
            sx={{
              m: 0,
              px: 1.5,
              minHeight: 40,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              boxSizing: 'border-box',
              alignItems: 'center',
            }}
          />
          <Button
            variant="outlined"
            color="primary"
            size="small"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={loadDashboard}
            disabled={loading}
            sx={{ height: 40, boxSizing: 'border-box' }}
          >
            Refresh
          </Button>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {quickLinks.map((linkItem) => (
              <Button key={linkItem.to} component={Link} to={linkItem.to} size="small" variant="text">
                {linkItem.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Paper>

      {errors.map((msg, idx) => (
        <Alert key={idx} severity="warning" sx={{ mb: 1.5 }}>
          {msg}
        </Alert>
      ))}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={2}>
          <KpiCard title="Today Orders" value={overview?.kpis?.todayOrders ?? '-'} actionTo={`/admin/fulfillment?dateSold=${date}`} actionLabel="Open orders" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <KpiCard title="Monthly Δ (Net)" value={overview?.kpis?.monthlyDeltaNet ?? '-'} color={(overview?.kpis?.monthlyDeltaNet || 0) >= 0 ? 'success.main' : 'error.main'} />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <KpiCard title="Awaiting Today" value={overview?.kpis?.awaitingToday ?? '-'} actionTo={`/admin/awaiting-sheet?date=${date}`} />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <KpiCard title="Arrivals Today" value={overview?.kpis?.arrivalsToday ?? '-'} actionTo={`/admin/amazon-arrivals`} />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <KpiCard title="Unread Today" value={overview?.kpis?.unreadBuyerMessagesToday ?? '-'} color="warning.main" actionTo="/admin/message-received" />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <KpiCard title="Non-Compliant Accounts" value={overview?.kpis?.nonCompliantAccounts ?? '-'} color="error.main" actionTo="/admin/account-health" />
        </Grid>
      </Grid>

      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2">Top blockers:</Typography>
          {topBlockers.length === 0 && <Chip size="small" label="No blockers for selected filters" />}
          {topBlockers.map((b) => (
            <Chip key={b.sellerId} size="small" label={`${b.sellerName}: ${b.awaiting} awaiting, ${b.unread} unread`} color="warning" variant="outlined" />
          ))}
        </Stack>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Today&apos;s Orders (Latest 25)</Typography>
            <TableContainer sx={{ maxHeight: 420, overflow: 'auto' }}>
              <Table
                size="small"
                stickyHeader
                sx={{
                  tableLayout: 'fixed',
                  width: '100%',
                  '& .MuiTableCell-root': {
                    py: 0.35,
                    px: 0.75,
                    fontSize: '0.75rem',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'background.paper', width: '18%' }}>Seller</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', width: '22%' }}>Order ID</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', width: '20%' }}>Date Sold</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', width: '16%' }}>Marketplace</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', width: '12%' }}>Ship By</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', width: '12%' }}>Tracking</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(ordersTable.length > 0 ? ordersTable : overview?.todayOrdersTable || []).map((o) => (
                    <TableRow key={o._id || o.id || o.orderId} hover>
                      <TableCell title={o.seller?.user?.username || o.sellerName || '-'}>
                        {o.seller?.user?.username || o.sellerName || '-'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }} title={o.orderId || '-'}>
                        {o.orderId || '-'}
                      </TableCell>
                      <TableCell>{fmtDateTimePt(o.dateSold)}</TableCell>
                      <TableCell title={o.purchaseMarketplaceId || '-'}>{o.purchaseMarketplaceId || '-'}</TableCell>
                      <TableCell>{fmtDatePt(o.shipByDate)}</TableCell>
                      <TableCell title={o.trackingNumber || '-'}>{o.trackingNumber || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {(ordersTable.length === 0 && (!overview?.todayOrdersTable || overview.todayOrdersTable.length === 0)) && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ whiteSpace: 'normal !important' }}>
                        No orders found for selected date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Needs Attention: Non-Compliant</Typography>
            <Stack spacing={1}>
              {nonCompliantSellerList.length === 0 && <Typography variant="body2" color="text.secondary">No non-compliant sellers in current window.</Typography>}
              {nonCompliantSellerList.slice(0, 8).map((row) => (
                <Paper key={row.sellerId} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" fontWeight="bold">{row.sellerName}</Typography>
                    <Chip size="small" color="error" label={`${row.bbeRate}%`} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Needs Attention: Unread Messages</Typography>
            <Stack spacing={1}>
              {unreadBySeller.length === 0 && <Typography variant="body2" color="text.secondary">No unread buyer messages today.</Typography>}
              {unreadBySeller.slice(0, 8).map((row) => (
                <Paper key={row.sellerId} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">{row.sellerName}</Typography>
                    <Chip size="small" color="warning" label={row.count} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="h6">Awaiting By Seller</Typography>
              <Button component={Link} to={`/admin/awaiting-sheet?date=${date}`} size="small">Open</Button>
            </Stack>
            <Stack spacing={1}>
              {awaitingBySeller.length === 0 && <Typography variant="body2" color="text.secondary">No awaiting items today.</Typography>}
              {awaitingBySeller.slice(0, 12).map((row) => (
                <Paper key={row.sellerId} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">{row.sellerName}</Typography>
                    <Chip size="small" label={row.count} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="h6">Arrivals By Seller</Typography>
              <Button component={Link} to="/admin/amazon-arrivals" size="small">Open</Button>
            </Stack>
            <Stack spacing={1}>
              {arrivalsBySeller.length === 0 && <Typography variant="body2" color="text.secondary">No arrivals today.</Typography>}
              {arrivalsBySeller.slice(0, 12).map((row) => (
                <Paper key={row.sellerId} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">{row.sellerName}</Typography>
                    <Chip size="small" label={row.count} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
    </Fade>
  );
}
