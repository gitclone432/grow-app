import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  Pagination,
} from '@mui/material';
import {
  Inventory2Outlined as InventoryIcon,
  ShoppingCartOutlined as OrdersIcon,
  AccountTreeOutlined as MatchIcon,
  InsightsOutlined as GapIcon,
  Refresh as RefreshIcon,
  VisibilityOutlined as VisibilityIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import api from '../../lib/api.js';

const CHART_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#d32f2f', '#0288d1'];
const LEVEL_LABELS = {
  category: 'Category',
  range: 'Range',
  product: 'Product',
};
const DEFAULT_EXCLUDE_CLIENT = true;

function formatInputDate(date) {
  return date.toISOString().split('T')[0];
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatAmount(value) {
  if (value == null || value === '') return '—';
  return `$${Number(value).toFixed(2)}`;
}

function MetricCard({ icon, label, value, sub, color, onClick, active = false }) {
  const isInteractive = Boolean(onClick);

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      sx={{
        flex: '1 1 0',
        minWidth: 170,
        p: 1.75,
        border: '1px solid',
        borderColor: active ? color : 'divider',
        borderRadius: 2,
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        boxShadow: active ? `0 0 0 1px ${color}` : 'none',
        '&:hover': isInteractive ? {
          borderColor: color,
          transform: 'translateY(-1px)',
        } : undefined,
        '&:focus-visible': isInteractive ? {
          outline: '2px solid',
          outlineColor: color,
          outlineOffset: '2px',
        } : undefined,
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: '10px',
          bgcolor: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: 0.92,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.25 }}>
          {value}
        </Typography>
        {sub ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.25 }}>
            {sub}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function DateFilterCard({ title, date, onChange }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 280,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Pick a day for this side. Changes apply together when you run the comparison.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 1.5 }}>
        <TextField
          label="Day"
          type="date"
          size="small"
          fullWidth
          value={date}
          onChange={(event) => onChange(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>
    </Paper>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const percentage = item.percentage != null ? `${item.percentage}%` : null;

  return (
    <Paper elevation={3} sx={{ p: 1.25, minWidth: 160 }}>
      <Typography variant="body2" fontWeight={700}>{item.name}</Typography>
      <Typography variant="body2" color="text.secondary">{item.count.toLocaleString()} items</Typography>
      {percentage ? (
        <Typography variant="body2" color="text.secondary">{percentage} of visible total</Typography>
      ) : null}
    </Paper>
  );
}

function SideChart({ title, subtitle, data, colorIndex = 0 }) {
  const total = data.reduce((sum, item) => sum + (item.count || 0), 0);
  const chartData = data.map((item) => ({
    ...item,
    percentage: total > 0 ? Number(((item.count / total) * 100).toFixed(1)) : 0,
  }));

  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 320,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
      }}
    >
      <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
      <Typography variant="caption" color="text.secondary">{subtitle}</Typography>

      {data.length === 0 ? (
        <Box sx={{ py: 10, textAlign: 'center', color: 'text.secondary' }}>
          No data available for the current filters.
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <Box sx={{ width: '100%', maxWidth: 360, height: 320, mx: 'auto' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={118}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={entry.id || `${entry.name}-${index}`} fill={CHART_COLORS[(index + colorIndex) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </Box>

            <Stack spacing={1} sx={{ width: '100%', minWidth: 0 }}>
              <Paper
                variant="outlined"
                sx={{
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">Visible total</Typography>
                <Typography variant="subtitle2" fontWeight={700}>{total.toLocaleString()}</Typography>
              </Paper>

              {chartData.map((entry, index) => (
                <Paper
                  key={entry.id || `${entry.name}-${index}`}
                  variant="outlined"
                  sx={{
                    px: 1.5,
                    py: 1.1,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: CHART_COLORS[(index + colorIndex) % CHART_COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" sx={{ lineHeight: 1.25 }}>
                      {entry.name}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                    <Typography variant="body2" color="text.secondary">{entry.percentage}%</Typography>
                    <Typography variant="subtitle2" fontWeight={700}>{entry.count.toLocaleString()}</Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}

function PreviewCell({ side, row, onOpen }) {
  const block = row[side];

  if (!block.count) {
    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }

  return (
    <Stack spacing={0.8} sx={{ minWidth: 260 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          label={`${block.count.toLocaleString()} ${side === 'listings' ? 'listings' : 'orders'}`}
          color={side === 'listings' ? 'primary' : 'secondary'}
          variant="outlined"
        />
      </Stack>

      <Stack spacing={0.5}>
        {block.previews.map((item) => (
          <Tooltip
            key={item.id}
            title={side === 'listings' ? (item.title || item.asin || item.customLabel || 'Listing') : (item.productName || item.orderId || 'Order')}
            placement="top-start"
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {side === 'listings'
                ? `${item.customLabel || 'No SKU'}${item.asin ? ` • ${item.asin}` : ''}`
                : `${item.orderId}${item.productName ? ` • ${item.productName}` : ''}`}
            </Typography>
          </Tooltip>
        ))}
      </Stack>

      <Button
        size="small"
        variant="text"
        startIcon={<VisibilityIcon fontSize="small" />}
        onClick={() => onOpen(side, row)}
        sx={{ alignSelf: 'flex-start', px: 0 }}
      >
        {block.count > block.previews.length ? 'See More' : 'View'}
      </Button>
    </Stack>
  );
}

export default function CRPComparisonPage() {
  const initialFilters = useMemo(() => ({
    listingsStartDate: formatInputDate(addDays(new Date(), -2)),
    listingsEndDate: formatInputDate(addDays(new Date(), -2)),
    ordersStartDate: formatInputDate(addDays(new Date(), -1)),
    ordersEndDate: formatInputDate(addDays(new Date(), -1)),
  }), []);

  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [excludeClient, setExcludeClient] = useState(DEFAULT_EXCLUDE_CLIENT);
  const [excludeLowValue, setExcludeLowValue] = useState(false);
  const [chartLevel, setChartLevel] = useState('category');
  const [rowFilter, setRowFilter] = useState('all');
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [comparison, setComparison] = useState({
    summary: {
      listingsTotal: 0,
      ordersTotal: 0,
      matchedCrps: 0,
      listingCrps: 0,
      orderCrps: 0,
      largestGap: null,
    },
    rows: [],
    listingsChart: [],
    ordersChart: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailDialog, setDetailDialog] = useState({
    open: false,
    side: 'listings',
    row: null,
    items: [],
    loading: false,
    error: '',
    page: 1,
    pages: 0,
    total: 0,
    limit: 10,
  });

  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data || []);
      } catch (fetchError) {
        console.error('Failed to fetch sellers for CRP comparison:', fetchError);
      }
    };

    fetchSellers();
  }, []);

  const fetchComparison = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get('/orders/crp-comparison', {
        params: {
          sellerId: selectedSeller || undefined,
          excludeClient: excludeClient ? 'true' : undefined,
          excludeLowValue: excludeLowValue ? 'true' : undefined,
          chartLevel,
          ...filters,
        }
      });
      setComparison(data);
    } catch (fetchError) {
      console.error('Failed to fetch CRP comparison:', fetchError);
      setError(fetchError.response?.data?.error || 'Failed to load CRP comparison dashboard.');
    } finally {
      setLoading(false);
    }
  }, [chartLevel, excludeClient, excludeLowValue, filters, selectedSeller]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  const fetchDetail = useCallback(async (side, row, page = 1) => {
    try {
      setDetailDialog((prev) => ({ ...prev, loading: true, error: '' }));
      const { data } = await api.get('/orders/crp-comparison-details', {
        params: {
          side,
          sellerId: selectedSeller || undefined,
          excludeClient: excludeClient ? 'true' : undefined,
          excludeLowValue: excludeLowValue ? 'true' : undefined,
          categoryId: row.categoryId || 'null',
          rangeId: row.rangeId || 'null',
          productId: row.productId || 'null',
          page,
          limit: detailDialog.limit,
          ...filters,
        }
      });

      setDetailDialog((prev) => ({
        ...prev,
        items: data.items || [],
        loading: false,
        error: '',
        page: data.pagination?.page || 1,
        pages: data.pagination?.pages || 0,
        total: data.pagination?.total || 0,
      }));
    } catch (fetchError) {
      console.error('Failed to fetch CRP comparison detail:', fetchError);
      setDetailDialog((prev) => ({
        ...prev,
        loading: false,
        error: fetchError.response?.data?.error || 'Failed to load drill-down details.',
      }));
    }
  }, [detailDialog.limit, excludeClient, excludeLowValue, filters, selectedSeller]);

  const openDetail = (side, row) => {
    setDetailDialog({
      open: true,
      side,
      row,
      items: [],
      loading: true,
      error: '',
      page: 1,
      pages: 0,
      total: 0,
      limit: 10,
    });
    fetchDetail(side, row, 1);
  };

  const handleDetailPageChange = (_, page) => {
    if (!detailDialog.row) return;
    setDetailDialog((prev) => ({ ...prev, page }));
    fetchDetail(detailDialog.side, detailDialog.row, page);
  };

  const handleDateChange = (prefix, value) => {
    setDraftFilters((prev) => ({
      ...prev,
      [`${prefix}StartDate`]: value,
      [`${prefix}EndDate`]: value,
    }));
  };

  const hasPendingDateChanges = useMemo(() => (
    draftFilters.listingsStartDate !== filters.listingsStartDate
    || draftFilters.ordersStartDate !== filters.ordersStartDate
  ), [draftFilters, filters]);

  const handleApplyDates = () => {
    setFilters(draftFilters);
  };

  const levelLabel = LEVEL_LABELS[chartLevel];
  const largestGap = comparison.summary?.largestGap;
  const filteredRows = useMemo(() => {
    if (rowFilter === 'matched') {
      return comparison.rows.filter((row) => row.listings.count > 0 && row.orders.count > 0);
    }

    return comparison.rows;
  }, [comparison.rows, rowFilter]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction={{ xs: 'column', xl: 'row' }}
        justifyContent="space-between"
        alignItems={{ xl: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>CRP Comparison Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Compare listing-side CRPs against all-orders CRPs using one selected day per side.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={selectedSeller}
              label="Seller"
              onChange={(event) => setSelectedSeller(event.target.value)}
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((seller) => (
                <MenuItem key={seller._id} value={seller._id}>
                  {seller.user?.username || seller.user?.email || 'Unknown'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={chartLevel}
            onChange={(_, value) => {
              if (value) setChartLevel(value);
            }}
          >
            <ToggleButton value="category">Category</ToggleButton>
            <ToggleButton value="range">Range</ToggleButton>
            <ToggleButton value="product">Product</ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel
            control={
              <Switch
                checked={excludeClient}
                onChange={(event) => setExcludeClient(event.target.checked)}
              />
            }
            label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Exclude Client</Typography>}
            sx={{
              m: 0,
              px: 1.5,
              minHeight: 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              boxSizing: 'border-box',
            }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={excludeLowValue}
                onChange={(event) => setExcludeLowValue(event.target.checked)}
              />
            }
            label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Excl. &lt;$3 Orders</Typography>}
            sx={{
              m: 0,
              px: 1.5,
              minHeight: 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              boxSizing: 'border-box',
            }}
          />

          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={fetchComparison}
            disabled={loading}
            sx={{ height: 40 }}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <DateFilterCard
          title="Listings Day"
          date={draftFilters.listingsStartDate}
          onChange={(value) => handleDateChange('listings', value)}
        />
        <DateFilterCard
          title="Orders Day"
          date={draftFilters.ordersStartDate}
          onChange={(value) => handleDateChange('orders', value)}
        />
      </Stack>

      <Stack alignItems="center" spacing={0.75} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          onClick={handleApplyDates}
          disabled={loading || !hasPendingDateChanges}
          sx={{ minWidth: 220 }}
        >
          Run Comparison
        </Button>
        <Typography variant="caption" color="text.secondary">
          Apply both selected days in one fetch so listings and orders refresh together.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <MetricCard
          icon={<InventoryIcon sx={{ fontSize: 19 }} />}
          label="Listings On Day"
          value={(comparison.summary?.listingsTotal || 0).toLocaleString()}
          sub={`${comparison.summary?.listingCrps || 0} CRP buckets`}
          color="#1976d2"
        />
        <MetricCard
          icon={<OrdersIcon sx={{ fontSize: 19 }} />}
          label="Orders On Day"
          value={(comparison.summary?.ordersTotal || 0).toLocaleString()}
          sub={`${comparison.summary?.orderCrps || 0} CRP buckets`}
          color="#2e7d32"
        />
        <MetricCard
          icon={<MatchIcon sx={{ fontSize: 19 }} />}
          label="Matched CRPs"
          value={(comparison.summary?.matchedCrps || 0).toLocaleString()}
          sub={rowFilter === 'matched' ? 'Showing matched rows below' : 'Click to show matched rows'}
          color="#ed6c02"
          onClick={() => setRowFilter((prev) => prev === 'matched' ? 'all' : 'matched')}
          active={rowFilter === 'matched'}
        />
        <MetricCard
          icon={<GapIcon sx={{ fontSize: 19 }} />}
          label="Largest Gap"
          value={largestGap ? largestGap.count.toLocaleString() : '0'}
          sub={largestGap ? `${largestGap.productName || largestGap.rangeName || largestGap.categoryName}` : 'No data'}
          color="#9c27b0"
        />
      </Stack>

      {rowFilter === 'matched' ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Chip
            color="warning"
            variant="outlined"
            label={`Matched CRPs only • ${filteredRows.length.toLocaleString()} rows`}
          />
          <Typography variant="caption" color="text.secondary">
            Use View on both sides of the same row to inspect the listings and orders inside that shared CRP bucket.
          </Typography>
          <Button size="small" onClick={() => setRowFilter('all')}>Clear</Button>
        </Stack>
      ) : null}

      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          mb: 2,
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={700}>CRP Comparison Table</Typography>
          <Typography variant="caption" color="text.secondary">
            Scroll through CRPs and open side-specific drill-downs to inspect listings or orders for the same CRP path.
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress />
          </Box>
        ) : filteredRows.length === 0 ? (
          <Box sx={{ py: 10, textAlign: 'center', color: 'text.secondary' }}>
            {rowFilter === 'matched'
              ? 'No matched CRP rows found for the selected filters.'
              : 'No CRP comparison data found for the selected filters.'}
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 520 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Range</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 300 }}>Listings</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 300 }}>Orders</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.key} hover>
                    <TableCell sx={{ verticalAlign: 'top' }}>{row.categoryName}</TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>{row.rangeName || '—'}</TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>{row.productName || '—'}</TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <PreviewCell side="listings" row={row} onOpen={openDetail} />
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <PreviewCell side="orders" row={row} onOpen={openDetail} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2}>
        <SideChart
          title="Listings Chart"
          subtitle={`Top ${levelLabel.toLowerCase()} buckets from the listing-side day`}
          data={comparison.listingsChart || []}
          colorIndex={0}
        />
        <SideChart
          title="Orders Chart"
          subtitle={`Top ${levelLabel.toLowerCase()} buckets from the orders-side day`}
          data={comparison.ordersChart || []}
          colorIndex={2}
        />
      </Stack>

      <Dialog
        open={detailDialog.open}
        onClose={() => setDetailDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Stack spacing={0.75}>
            <Typography variant="h6" fontWeight={700}>
              {detailDialog.side === 'listings' ? 'Listings' : 'Orders'} Drill-Down
            </Typography>
            {detailDialog.row ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`Category: ${detailDialog.row.categoryName}`} />
                <Chip size="small" label={`Range: ${detailDialog.row.rangeName || '—'}`} />
                <Chip size="small" label={`Product: ${detailDialog.row.productName || '—'}`} />
              </Stack>
            ) : null}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {detailDialog.error ? <Alert severity="error" sx={{ mb: 2 }}>{detailDialog.error}</Alert> : null}

          {detailDialog.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : detailDialog.side === 'listings' ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ASIN</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailDialog.items.map((item) => (
                    <TableRow key={item._id} hover>
                      <TableCell>{item.customLabel || '—'}</TableCell>
                      <TableCell>{item.asin || '—'}</TableCell>
                      <TableCell>{item.title || '—'}</TableCell>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>
                        <Chip label={item.status || '—'} size="small" variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Order ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Sold At</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailDialog.items.map((item) => (
                    <TableRow key={item._id} hover>
                      <TableCell>{item.orderId}</TableCell>
                      <TableCell>{item.productName || '—'}</TableCell>
                      <TableCell>{formatDateTime(item.dateSold)}</TableCell>
                      <TableCell>{formatAmount(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {!detailDialog.loading && detailDialog.total > detailDialog.limit ? (
            <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
              <Pagination
                page={detailDialog.page}
                count={detailDialog.pages}
                onChange={handleDetailPageChange}
                color="primary"
              />
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog((prev) => ({ ...prev, open: false }))}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}