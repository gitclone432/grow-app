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
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'text.secondary',
          textTransform: 'uppercase',
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.75 }}>
          {subtitle}
        </Typography>
      ) : null}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />
    </Box>
  );
}

function OverviewCard({ icon, label, value, sub, color, bg }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 150,
        p: 1.75,
        borderRadius: 2,
        bgcolor: bg,
        border: '1px solid',
        borderColor: 'rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          mt: 0.25,
          width: 36,
          height: 36,
          borderRadius: '10px',
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
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '1.35rem' }}>
          {value}
        </Typography>
        {sub ? (
          <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2, display: 'block' }}>
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
        minWidth: 150,
        p: 1.75,
        borderRadius: 2,
        bgcolor: band.bg,
        border: '1px solid',
        borderColor: 'rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '10px',
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
        <Typography sx={{ fontSize: 10, fontWeight: 700 }}>{band.top}</Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 700 }}>{band.bottom}</Typography>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
          {band.label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '1.35rem' }}>
          {count.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>
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
  const [excludeLowValue, setExcludeLowValue] = useState(false);
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
      setSellers(res.data || []);
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
  const barHeight = Math.max(220, data.length * 40);

  if (loading && data.length === 0) return <CRPAnalyticsSkeleton />;

  return (
    <Fade in timeout={600}>
      <Box sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', xl: 'row' }}
          alignItems={{ xl: 'flex-start' }}
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="h5" fontWeight={700}>CRP Analytics</Typography>
            <Typography variant="body2" color="text.secondary">
              Orders grouped by {groupByLabel.toLowerCase()} assignment · PST timezone
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 130 }}>
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
                sx={{ width: 158 }}
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
                  sx={{ width: 152 }}
                />
                <TextField
                  label="To"
                  type="date"
                  size="small"
                  value={dateFilter.to}
                  onChange={(e) => setDateFilter((p) => ({ ...p, to: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 152 }}
                />
              </>
            )}

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Seller</InputLabel>
              <Select value={selectedSeller} onChange={(e) => setSelectedSeller(e.target.value)} label="Seller">
                <MenuItem value="">All Sellers</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>{s.user?.username || 'Unknown'}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Marketplace</InputLabel>
              <Select value={selectedMarketplace} onChange={(e) => setSelectedMarketplace(e.target.value)} label="Marketplace">
                <MenuItem value=""><em>All</em></MenuItem>
                <MenuItem value="EBAY_US">EBAY_US</MenuItem>
                <MenuItem value="EBAY_AU">EBAY_AU</MenuItem>
                <MenuItem value="EBAY_ENCA">EBAY_CA</MenuItem>
                <MenuItem value="EBAY_GB">EBAY_GB</MenuItem>
              </Select>
            </FormControl>

            <ToggleButtonGroup value={groupBy} exclusive size="small" onChange={(_, v) => { if (v) setGroupBy(v); }}>
              <ToggleButton value="category">Category</ToggleButton>
              <ToggleButton value="range">Range</ToggleButton>
              <ToggleButton value="product">Product</ToggleButton>
            </ToggleButtonGroup>

            <FormControlLabel
              control={<Switch checked={excludeClient} color="primary" onChange={(e) => setExcludeClient(e.target.checked)} />}
              label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Exclude Client</Typography>}
              sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
            />

            <FormControlLabel
              control={<Switch checked={excludeLowValue} color="primary" onChange={(e) => setExcludeLowValue(e.target.checked)} />}
              label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Excl. &lt;$3</Typography>}
              sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
            />

            <Button
              variant="outlined"
              color="primary"
              size="small"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              onClick={fetchAnalytics}
              disabled={loading}
              sx={{ height: 40, boxSizing: 'border-box' }}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && data.length === 0 && !error && (
          <Alert severity="info">No orders found for the selected filters.</Alert>
        )}

        {!loading && data.length > 0 && (
          <>
            <SectionHeader title="CRP Overview" />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
              <OverviewCard
                icon={<TrendingUpIcon sx={{ fontSize: 19 }} />}
                label="Total Orders"
                value={totalOrders.toLocaleString()}
                sub={dateLabel}
                color="#1976d2"
                bg="rgba(25, 118, 210, 0.08)"
              />
              <OverviewCard
                icon={<CheckCircleOutlineIcon sx={{ fontSize: 19 }} />}
                label="Assigned"
                value={`${assignedPct}%`}
                sub={`${assignedCount.toLocaleString()} orders`}
                color="#2e7d32"
                bg="rgba(46, 125, 50, 0.08)"
              />
              <OverviewCard
                icon={<HelpOutlineIcon sx={{ fontSize: 19 }} />}
                label="Unassigned"
                value={`${unassignedPct}%`}
                sub={`${unassignedCount.toLocaleString()} orders`}
                color="#d32f2f"
                bg="rgba(211, 47, 47, 0.08)"
              />
              <OverviewCard
                icon={<EmojiEventsOutlinedIcon sx={{ fontSize: 19 }} />}
                label={`Top ${groupByLabel}`}
                value={topAssigned?.name ?? '-'}
                sub={topAssigned ? `${topAssigned.count.toLocaleString()} orders` : undefined}
                color="#ed6c02"
                bg="rgba(237, 108, 2, 0.08)"
              />
            </Stack>

            <SectionHeader title="Order Value Bands" />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
              {VALUE_BANDS.map((band) => (
                <ValueBandCard key={band.key} band={band} count={valueBands[band.key] ?? 0} />
              ))}
            </Stack>

            <SectionHeader title="Distribution by Category" subtitle="Click a bar or row to drill in" />
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <Paper
                elevation={0}
                sx={{ flex: '3 1 0', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
              >
                <Typography variant="subtitle1" fontWeight={700}>Orders by {groupByLabel}</Typography>
                <Typography variant="caption" color="text.secondary">Sorted by volume</Typography>
                <Box sx={{ mt: 2 }}>
                  <ResponsiveContainer width="100%" height={barHeight}>
                    <BarChart
                      layout="vertical"
                      data={data}
                      margin={{ top: 2, right: 52, left: 8, bottom: 2 }}
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
                        width={155}
                        tick={{ fontSize: 11, fill: '#555' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                      />
                      <Tooltip content={<BarTooltipContent />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} style={{ cursor: 'pointer' }}>
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
                  minWidth: 280,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Typography variant="subtitle1" fontWeight={700}>Ranking</Typography>
                <Typography variant="caption" color="text.secondary">
                  {data.length} {groupByLabel.toLowerCase()}{data.length === 1 ? '' : 's'} · click to drill down
                </Typography>

                <TableContainer sx={{ mt: 1.5, flex: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, color: 'text.secondary', width: 36, py: 1 }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: 'text.secondary', py: 1 }}>Name</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', py: 1 }}>Orders</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', py: 1, minWidth: 72 }}>Share</TableCell>
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
                          <TableCell sx={{ py: 1.25, color: '#ed6c02', fontWeight: 700 }}>{i + 1}</TableCell>
                          <TableCell sx={{ py: 1.25 }}>
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: BAR_COLOR, flexShrink: 0 }} />
                              <Typography variant="body2" noWrap>{entry.name}</Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(parseFloat(entry.percentage), 100)}
                              sx={{
                                mt: 0.75,
                                height: 3,
                                borderRadius: 2,
                                bgcolor: 'grey.100',
                                '& .MuiLinearProgress-bar': { bgcolor: BAR_COLOR, borderRadius: 2 },
                              }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1.25, fontWeight: 600 }}>{entry.count.toLocaleString()}</TableCell>
                          <TableCell align="right" sx={{ py: 1.25, color: 'text.secondary' }}>{entry.percentage}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Stack>
          </>
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
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Order ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date Sold</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Subtotal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailDialog.items.map((item) => (
                    <TableRow key={item._id || item.orderId}>
                      <TableCell>{item.orderId || '—'}</TableCell>
                      <TableCell>{item.productName || '—'}</TableCell>
                      <TableCell>{formatDateTime(item.dateSold)}</TableCell>
                      <TableCell align="right">{formatAmount(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2 }}>
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
