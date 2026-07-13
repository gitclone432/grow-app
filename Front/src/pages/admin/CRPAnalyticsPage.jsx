import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Stack,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  Fade,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import api from '../../lib/api';
import CRPAnalyticsSkeleton from '../../components/skeletons/CRPAnalyticsSkeleton';
import { sortSellersByName, sellerDisplayName } from '../../lib/sellersSort';

const BAR_COLOR = '#1976d2';
const VALUE_BANDS = [
  { key: 'low', label: 'Low Ticket', sub: 'subtotal < $30', color: '#1976d2', bg: 'rgba(25, 118, 210, 0.08)', top: '$0', bottom: '30' },
  { key: 'mid', label: 'Mid Ticket', sub: '$30 - $59', color: '#2e7d32', bg: 'rgba(46, 125, 50, 0.08)', top: '$30', bottom: '60' },
  { key: 'high', label: 'High Ticket', sub: '$60 - $99', color: '#ed6c02', bg: 'rgba(237, 108, 2, 0.08)', top: '$60', bottom: '100' },
  { key: 'extraHigh', label: 'Extra High Ticket', sub: 'subtotal >= $100', color: '#d32f2f', bg: 'rgba(211, 47, 47, 0.08)', top: '$100', bottom: '+' },
];

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getDefaultSingleDay() {
  return formatInputDate(addDays(new Date(), -1));
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatAmount(value) {
  if (value == null || value === '') return '—';
  return `$${Number(value).toFixed(2)}`;
}

function SectionHeader({ title, subtitle }) {
  return (
    <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: 'text.secondary',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.disabled">
          · {subtitle}
        </Typography>
      ) : null}
    </Stack>
  );
}

function OverviewCard({ icon, label, value, sub, color, bg }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 130,
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        bgcolor: bg,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.5,
          bgcolor: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#fff',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2, fontSize: '1.1rem' }} noWrap>
          {value}
        </Typography>
        {sub ? (
          <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2, display: 'block' }} noWrap>
            {sub}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function ValueBandCard({ band, count }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 130,
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        bgcolor: band.bg,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1.5,
          bgcolor: band.color,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        <Typography sx={{ fontSize: 9, fontWeight: 700 }}>{band.top}</Typography>
        <Typography sx={{ fontSize: 9, fontWeight: 700 }}>{band.bottom}</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {band.label}
        </Typography>
        <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2, fontSize: '1.1rem' }}>
          {count.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }} noWrap>
          {band.sub}
        </Typography>
      </Box>
    </Paper>
  );
}

const BarTooltipContent = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <Paper elevation={3} sx={{ p: 1.5, minWidth: 160 }}>
      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>{d.name}</Typography>
      <Typography variant="body2" color="text.secondary">{d.count.toLocaleString()} orders</Typography>
      <Typography variant="body2" color="primary">{d.percentage}% of total</Typography>
    </Paper>
  );
};

export default function CRPAnalyticsPage() {
  const [data, setData] = useState([]);
  const [valueBands, setValueBands] = useState({ low: 0, mid: 0, high: 0, extraHigh: 0 });
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [groupBy, setGroupBy] = useState('category');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  const [excludeClient, setExcludeClient] = useState(true);
  const [excludeLowValue, setExcludeLowValue] = useState(true);
  const [dateFilter, setDateFilter] = useState(() => ({
    mode: 'single',
    single: getDefaultSingleDay(),
    from: '',
    to: '',
  }));
  const [detailDialog, setDetailDialog] = useState({
    open: false,
    row: null,
    items: [],
    loading: false,
    error: '',
    page: 1,
    pages: 0,
    total: 0,
    limit: 10,
  });

  const buildParams = useCallback(() => {
    const params = { groupBy, excludeClient, excludeLowValue };
    if (dateFilter.mode === 'single' && dateFilter.single) {
      params.startDate = params.endDate = dateFilter.single;
    } else if (dateFilter.mode === 'range') {
      if (dateFilter.from) params.startDate = dateFilter.from;
      if (dateFilter.to) params.endDate = dateFilter.to;
    }
    if (selectedSeller) params.sellerId = selectedSeller;
    if (selectedMarketplace) params.marketplace = selectedMarketplace;
    return params;
  }, [dateFilter, excludeClient, excludeLowValue, groupBy, selectedMarketplace, selectedSeller]);

  useEffect(() => { fetchSellers(); }, []);

  useEffect(() => { fetchAnalytics(); }, [dateFilter, selectedSeller, selectedMarketplace, excludeClient, excludeLowValue, groupBy]);

  const fetchSellers = async () => {
    try {
      const res = await api.get('/sellers/all');
      setSellers(sortSellersByName(res.data || []));
    } catch (e) {
      console.error('Error fetching sellers:', e);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/orders/crp-analytics', { params: buildParams() });
      const categories = res.data?.categories || [];
      const total = categories.reduce((s, r) => s + r.count, 0);
      setData(categories.map((r) => ({
        ...r,
        percentage: total > 0 ? ((r.count / total) * 100).toFixed(1) : '0.0',
      })));
      setValueBands(res.data?.valueBands || { low: 0, mid: 0, high: 0, extraHigh: 0 });
    } catch (e) {
      console.error('Error fetching CRP analytics:', e);
      setError('Failed to load CRP analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = useCallback(async (row, page = 1) => {
    try {
      setDetailDialog((prev) => ({ ...prev, loading: true, error: '' }));
      const params = {
        ...buildParams(),
        page,
        limit: detailDialog.limit,
        categoryId: groupBy === 'category' ? (row.id ?? 'null') : 'null',
        rangeId: groupBy === 'range' ? (row.id ?? 'null') : 'null',
        productId: groupBy === 'product' ? (row.id ?? 'null') : 'null',
      };
      const { data } = await api.get('/orders/crp-analytics/details', { params });
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
      console.error('Error fetching CRP analytics details:', fetchError);
      setDetailDialog((prev) => ({
        ...prev,
        loading: false,
        error: fetchError.response?.data?.error || 'Failed to load drill-down details.',
      }));
    }
  }, [buildParams, detailDialog.limit, groupBy]);

  const openDetail = (row) => {
    setDetailDialog({
      open: true,
      row,
      items: [],
      loading: true,
      error: '',
      page: 1,
      pages: 0,
      total: 0,
      limit: 10,
    });
    fetchDetail(row, 1);
  };

  const handleDetailPageChange = (_, page) => {
    if (!detailDialog.row) return;
    setDetailDialog((prev) => ({ ...prev, page }));
    fetchDetail(detailDialog.row, page);
  };

  const dateLabel = useMemo(() => {
    if (dateFilter.mode === 'single' && dateFilter.single) return dateFilter.single;
    if (dateFilter.mode === 'range') {
      if (dateFilter.from && dateFilter.to) return `${dateFilter.from} – ${dateFilter.to}`;
      if (dateFilter.from) return `from ${dateFilter.from}`;
      if (dateFilter.to) return `to ${dateFilter.to}`;
    }
    return 'All dates';
  }, [dateFilter]);

  const totalOrders = data.reduce((s, r) => s + r.count, 0);
  const unassigned = data.find((d) => d.name === 'Unassigned');
  const unassignedCount = unassigned?.count ?? 0;
  const assignedCount = totalOrders - unassignedCount;
  const assignedPct = totalOrders > 0 ? ((assignedCount / totalOrders) * 100).toFixed(1) : '0.0';
  const unassignedPct = totalOrders > 0 ? ((unassignedCount / totalOrders) * 100).toFixed(1) : '0.0';
  const topAssigned = data.filter((d) => d.name !== 'Unassigned')[0];
  const groupByLabel = { category: 'Category', range: 'Range', product: 'Product' }[groupBy];
  const barHeight = Math.min(420, Math.max(180, data.length * 36));

  if (loading && data.length === 0) return <CRPAnalyticsSkeleton />;

  return (
    <Fade in timeout={600}>
      <Box sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          gap={1.5}
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h5" fontWeight={700}>CRP Analytics</Typography>
            <Typography variant="body2" color="text.secondary">
              {groupByLabel} assignment · Pacific Time (PT)
            </Typography>
          </Box>
        </Stack>

        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{
            mb: 2.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Date Mode</InputLabel>
            <Select
              value={dateFilter.mode}
              label="Date Mode"
              onChange={(e) => setDateFilter((prev) => ({
                ...prev,
                mode: e.target.value,
                single: e.target.value === 'single' && !prev.single ? getDefaultSingleDay() : prev.single,
              }))}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="single">Single Day</MenuItem>
              <MenuItem value="range">Date Range</MenuItem>
            </Select>
          </FormControl>

          {dateFilter.mode === 'single' && (
            <TextField
              label="Date"
              type="date"
              size="small"
              value={dateFilter.single}
              onChange={(e) => setDateFilter((p) => ({ ...p, single: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
          )}
          {dateFilter.mode === 'range' && (
            <>
              <TextField
                label="From"
                type="date"
                size="small"
                value={dateFilter.from}
                onChange={(e) => setDateFilter((p) => ({ ...p, from: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 140 }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={dateFilter.to}
                onChange={(e) => setDateFilter((p) => ({ ...p, to: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 140 }}
              />
            </>
          )}

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Seller</InputLabel>
            <Select value={selectedSeller} onChange={(e) => setSelectedSeller(e.target.value)} label="Seller">
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>{sellerDisplayName(s) || 'Unknown'}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select value={selectedMarketplace} onChange={(e) => setSelectedMarketplace(e.target.value)} label="Marketplace">
              <MenuItem value="">All</MenuItem>
              <MenuItem value="EBAY_US">USA</MenuItem>
              <MenuItem value="EBAY_CA">CA</MenuItem>
              <MenuItem value="EBAY_AU">AUS</MenuItem>
              <MenuItem value="EBAY_GB">UK</MenuItem>
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={groupBy}
            exclusive
            size="small"
            onChange={(_, v) => { if (v) setGroupBy(v); }}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, textTransform: 'none' } }}
          >
            <ToggleButton value="category">Category</ToggleButton>
            <ToggleButton value="range">Range</ToggleButton>
            <ToggleButton value="product">Product</ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel
            control={<Switch size="small" checked={excludeClient} color="primary" onChange={(e) => setExcludeClient(e.target.checked)} />}
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>Exclude Client</Typography>}
            sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={excludeLowValue} color="primary" onChange={(e) => setExcludeLowValue(e.target.checked)} />}
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>Excl. &lt;$3</Typography>}
            sx={{ m: 0 }}
          />

          <Button
            variant="outlined"
            color="primary"
            size="small"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            onClick={fetchAnalytics}
            disabled={loading}
            sx={{ ml: { md: 'auto' } }}
          >
            Refresh
          </Button>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && data.length === 0 && !error && (
          <Alert severity="info">No orders found for the selected filters.</Alert>
        )}

        {!loading && data.length > 0 && (
          <Stack spacing={2.5}>
            <Box>
              <SectionHeader title="CRP Overview" />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <OverviewCard
                  icon={<TrendingUpIcon sx={{ fontSize: 18 }} />}
                  label="Total Orders"
                  value={totalOrders.toLocaleString()}
                  sub={dateLabel}
                  color="#1976d2"
                  bg="rgba(25, 118, 210, 0.08)"
                />
                <OverviewCard
                  icon={<CheckCircleOutlineIcon sx={{ fontSize: 18 }} />}
                  label="Assigned"
                  value={`${assignedPct}%`}
                  sub={`${assignedCount.toLocaleString()} orders`}
                  color="#2e7d32"
                  bg="rgba(46, 125, 50, 0.08)"
                />
                <OverviewCard
                  icon={<HelpOutlineIcon sx={{ fontSize: 18 }} />}
                  label="Unassigned"
                  value={`${unassignedPct}%`}
                  sub={`${unassignedCount.toLocaleString()} orders`}
                  color="#d32f2f"
                  bg="rgba(211, 47, 47, 0.08)"
                />
                <OverviewCard
                  icon={<EmojiEventsOutlinedIcon sx={{ fontSize: 18 }} />}
                  label={`Top ${groupByLabel}`}
                  value={topAssigned?.name ?? '-'}
                  sub={topAssigned ? `${topAssigned.count.toLocaleString()} orders` : undefined}
                  color="#ed6c02"
                  bg="rgba(237, 108, 2, 0.08)"
                />
              </Stack>
            </Box>

            <Box>
              <SectionHeader title="Order Value Bands" />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {VALUE_BANDS.map((band) => (
                  <ValueBandCard key={band.key} band={band} count={valueBands[band.key] ?? 0} />
                ))}
              </Stack>
            </Box>

            <Box>
              <SectionHeader title={`Distribution by ${groupByLabel}`} subtitle="Click a bar or row to drill in" />
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems="stretch">
                <Paper
                  elevation={0}
                  sx={{ flex: '3 1 0', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>Orders by {groupByLabel}</Typography>
                  <Typography variant="caption" color="text.secondary">Sorted by volume</Typography>
                  <Box sx={{ mt: 1 }}>
                    <ResponsiveContainer width="100%" height={barHeight}>
                      <BarChart
                        layout="vertical"
                        data={data}
                        margin={{ top: 2, right: 48, left: 4, bottom: 2 }}
                        onClick={(state) => {
                          if (state?.activePayload?.[0]?.payload) {
                            openDetail(state.activePayload[0].payload);
                          }
                        }}
                      >
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fontSize: 11, fill: '#555' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
                        />
                        <Tooltip content={<BarTooltipContent />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} style={{ cursor: 'pointer' }}>
                          {data.map((entry) => (
                            <Cell key={entry.id ?? entry.name} fill={BAR_COLOR} />
                          ))}
                          <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#555', fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    flex: '2 1 0',
                    minWidth: 260,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: Math.max(barHeight + 56, 240),
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>Ranking</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                    {data.length} {groupByLabel.toLowerCase()}{data.length === 1 ? '' : 's'}
                  </Typography>

                  <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                    <Table
                      size="small"
                      stickyHeader
                      sx={{
                        '& .MuiTableCell-root': {
                          py: 0.75,
                          px: 1,
                          fontSize: '0.8125rem',
                        },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, color: 'text.secondary', width: 32, bgcolor: 'background.paper' }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: 'text.secondary', bgcolor: 'background.paper' }}>Name</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', bgcolor: 'background.paper' }}>Orders</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', bgcolor: 'background.paper', width: 64 }}>Share</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.map((entry, i) => (
                          <TableRow
                            key={entry.id ?? entry.name}
                            hover
                            onClick={() => openDetail(entry)}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell sx={{ color: '#ed6c02', fontWeight: 700 }}>{i + 1}</TableCell>
                            <TableCell>
                              <Stack direction="row" alignItems="center" spacing={0.75}>
                                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: BAR_COLOR, flexShrink: 0 }} />
                                <Typography variant="body2" noWrap sx={{ fontSize: '0.8125rem' }}>{entry.name}</Typography>
                              </Stack>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(parseFloat(entry.percentage), 100)}
                                sx={{
                                  mt: 0.5,
                                  height: 3,
                                  borderRadius: 2,
                                  bgcolor: 'grey.100',
                                  '& .MuiLinearProgress-bar': { bgcolor: BAR_COLOR, borderRadius: 2 },
                                }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{entry.count.toLocaleString()}</TableCell>
                            <TableCell align="right" sx={{ color: 'text.secondary' }}>{entry.percentage}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Stack>
            </Box>
          </Stack>
        )}

        <Dialog
          open={detailDialog.open}
          onClose={() => setDetailDialog((prev) => ({ ...prev, open: false }))}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            {detailDialog.row ? `${detailDialog.row.name} · Orders` : 'Orders'}
          </DialogTitle>
          <DialogContent dividers>
            {detailDialog.loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : detailDialog.error ? (
              <Alert severity="error">{detailDialog.error}</Alert>
            ) : detailDialog.items.length === 0 ? (
              <Alert severity="info">No orders found for this bucket.</Alert>
            ) : (
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Order ID</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Date Sold</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailDialog.items.map((item) => (
                      <TableRow key={item._id || item.orderId}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.orderId || '—'}</TableCell>
                        <TableCell>{item.productName || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.dateSold)}</TableCell>
                        <TableCell align="right">{formatAmount(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {detailDialog.total > 0 ? `${detailDialog.total.toLocaleString()} orders` : ''}
            </Typography>
            {detailDialog.pages > 1 ? (
              <Pagination
                count={detailDialog.pages}
                page={detailDialog.page}
                onChange={handleDetailPageChange}
                size="small"
                color="primary"
              />
            ) : (
              <Button onClick={() => setDetailDialog((prev) => ({ ...prev, open: false }))}>Close</Button>
            )}
          </DialogActions>
        </Dialog>
      </Box>
    </Fade>
  );
}
