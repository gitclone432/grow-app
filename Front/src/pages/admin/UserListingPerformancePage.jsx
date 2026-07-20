import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import InsightsIcon from '@mui/icons-material/Insights';
import RefreshIcon from '@mui/icons-material/Refresh';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../lib/api';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import { yellowFilledButtonSx } from '../../theme/tableStyles.js';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

const getPTDate = (offsetDays = 0) => {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
};

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today', days: 0 },
  { value: '7', label: '7 Days', days: 6 },
  { value: '30', label: '30 Days', days: 29 },
  { value: 'custom', label: 'Custom' },
];

const MARKETPLACES = ['US', 'UK', 'AU', 'Canada'];

const statusMeta = {
  onTrack: { label: 'On Track', color: '#1b7f3a', bg: '#e8f5e9', Icon: TaskAltIcon },
  behind: { label: 'Behind', color: '#a05a00', bg: '#fff4de', Icon: WarningAmberIcon },
  critical: { label: 'Critical', color: '#b3261e', bg: '#fde8e8', Icon: ErrorOutlineIcon },
};

const CATEGORY_COLORS = ['#f2b400', '#264653', '#2a9d8f', '#e76f51', '#8a5cf6', '#457b9d', '#a05a00', '#1b7f3a'];

const getCompletionStatus = (percent) => {
  if (percent >= 95) return 'onTrack';
  if (percent >= 60) return 'behind';
  return 'critical';
};

function SubmissionTimeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <Paper elevation={6} sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${alpha(BRAND_DARK, 0.12)}` }}>
      <Typography variant="subtitle2" fontWeight={800} sx={{ color: BRAND_DARK }}>
        {row.label} IST
      </Typography>
      <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.62), display: 'block', fontWeight: 700 }}>
        CSV uploads: {row.uploadCount.toLocaleString()}
      </Typography>
      <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.62), display: 'block', fontWeight: 700 }}>
        Successful listings: {row.successfulListings.toLocaleString()}
      </Typography>
      <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.62), display: 'block', fontWeight: 700 }}>
        Failed listings: {(row.failedListings || 0).toLocaleString()}
      </Typography>
    </Paper>
  );
}

export default function UserListingPerformancePage() {
  const theme = useTheme();
  const [users, setUsers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [rangeMode, setRangeMode] = useState('today');
  const [startDate, setStartDate] = useState(() => getPTDate());
  const [endDate, setEndDate] = useState(() => getPTDate());
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBreakdownUser, setSelectedBreakdownUser] = useState(null);

  const inputSx = {
    '& label.Mui-focused': { color: `${BRAND_YELLOW_DARK} !important` },
    '& .MuiOutlinedInput-root': {
      borderRadius: 1.5,
      '&:hover fieldset': { borderColor: `${alpha(BRAND_DARK, 0.35)} !important` },
      '&.Mui-focused fieldset': { borderColor: `${BRAND_YELLOW_DARK} !important` },
    },
  };

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    const option = RANGE_OPTIONS.find((item) => item.value === rangeMode);
    if (!option || option.value === 'custom') return;
    setStartDate(getPTDate(-option.days));
    setEndDate(getPTDate());
  }, [rangeMode]);

  useEffect(() => {
    fetchPerformance();
  }, [selectedUser, selectedSeller, selectedMarketplace, selectedCategory, selectedRange, startDate, endDate]);

  const loadOptions = async () => {
    try {
      const [usersRes, sellersRes, categoriesRes, rangesRes] = await Promise.all([
        api.get('/users'),
        api.get('/sellers/all'),
        api.get('/asin-list-categories'),
        api.get('/asin-list-ranges', { params: { all: true } }),
      ]);
      setUsers((usersRes.data || []).filter((user) => user.role !== 'seller'));
      setSellers(sellersRes.data || []);
      setCategories(categoriesRes.data || []);
      setRanges(rangesRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load filters.');
    }
  };

  const fetchPerformance = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        startDate,
        endDate,
      };
      if (selectedUser?._id) params.userId = selectedUser._id;
      if (selectedSeller?._id) params.sellerId = selectedSeller._id;
      if (selectedMarketplace) params.marketplace = selectedMarketplace;
      if (selectedCategory?._id) params.categoryId = selectedCategory._id;
      if (selectedRange?._id) params.rangeId = selectedRange._id;

      const { data } = await api.get('/user-category-targets/performance', { params });
      setPerformance(data);
    } catch (err) {
      setPerformance(null);
      setError(err.response?.data?.error || 'Failed to load listing performance.');
    } finally {
      setLoading(false);
    }
  };

  const getUserLabel = (user) => {
    if (!user) return '';
    return user.email ? `${user.username} (${user.email})` : user.username;
  };

  const getSellerLabel = (seller) => seller?.user?.username || seller?.user?.email || seller?.storeName || seller?._id || '';
  const getCategoryLabel = (category) => category?.name || '';
  const getRangeLabel = (range) => range?.name || '';

  const filteredRanges = selectedCategory
    ? ranges.filter((range) => String(range.categoryId?._id || range.categoryId) === selectedCategory._id)
    : ranges;

  const summary = performance?.summary || {};
  const cards = performance?.cards || [];
  const submissionTimeRows = performance?.submissionTimeDistribution || [];
  const hasSubmissionTimeRows = submissionTimeRows.some((row) => row.uploadCount > 0);

  const metricCards = useMemo(() => ([
    { label: 'Total Successful Listings', value: summary.totalSuccessfulListings || 0, helper: `${summary.totalTargetQuantity || 0} target listings` },
    { label: 'AI Saved Listings', value: summary.totalAiSavedCount || 0, helper: 'Saved from AI listing usage' },
    { label: 'Failed Listings', value: summary.totalFailedListings || 0, helper: 'From feed upload failures', tone: 'error' },
    { label: 'Average Quota Fill', value: `${summary.averageCompletionPercent || 0}%`, helper: 'Across selected targets' },
    { label: 'On Track', value: summary.onTrack || 0, helper: '95% or above', tone: 'success' },
    { label: 'Behind', value: summary.behind || 0, helper: '60% to 94%', tone: 'warning' },
    { label: 'Critical', value: summary.critical || 0, helper: 'Less than 60%', tone: 'error' },
    { label: 'Total Missed', value: summary.totalMissedListings || 0, helper: 'Items not listed' },
  ]), [summary]);

  const userBreakdownRows = useMemo(() => {
    const userMap = new Map();

    cards.forEach((card) => {
      const userId = card.user?._id || card.user?.username || 'unknown';
      const userName = card.user?.username || 'Unknown User';
      const existing = userMap.get(userId) || {
        userId,
        userName,
        targetQuantity: 0,
        successfulListings: 0,
        failedListings: 0,
        aiSavedCount: 0,
        missedListings: 0,
        categories: new Map(),
        assignments: [],
        submissionTimeDistribution: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          label: new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            hour12: true,
          }).format(new Date(Date.UTC(2026, 0, 1, hour - 5, 30))),
          uploadCount: 0,
          successfulListings: 0,
          failedListings: 0,
        })),
      };

      existing.targetQuantity += card.targetQuantity || 0;
      existing.successfulListings += card.successfulListings || 0;
      existing.failedListings += card.failedListings || 0;
      existing.aiSavedCount = Math.max(existing.aiSavedCount, card.aiSavedCount || 0);
      existing.missedListings += card.missedListings || 0;
      existing.assignments.push(card);

      const categoryId = card.category?._id || card.category?.name || 'unknown';
      const categoryName = card.category?.name || 'Unknown Category';
      const category = existing.categories.get(categoryId) || {
        categoryId,
        categoryName,
        targetQuantity: 0,
        successfulListings: 0,
        missedListings: 0,
      };
      category.targetQuantity += card.targetQuantity || 0;
      category.successfulListings += card.successfulListings || 0;
      category.missedListings += card.missedListings || 0;
      existing.categories.set(categoryId, category);

      (card.submissionTimeDistribution || []).forEach((timeRow) => {
        const existingTime = existing.submissionTimeDistribution[timeRow.hour];
        if (!existingTime) return;
        existingTime.uploadCount += timeRow.uploadCount || 0;
        existingTime.successfulListings += timeRow.successfulListings || 0;
        existingTime.failedListings += timeRow.failedListings || 0;
      });

      userMap.set(userId, existing);
    });

    return Array.from(userMap.values())
      .map((row) => ({
        ...row,
        completionPercent: row.targetQuantity > 0
          ? Math.round((row.successfulListings / row.targetQuantity) * 100)
          : 0,
        status: getCompletionStatus(row.targetQuantity > 0 ? Math.round((row.successfulListings / row.targetQuantity) * 100) : 0),
        categoryRows: Array.from(row.categories.values())
          .map((category) => ({
            ...category,
            completionPercent: category.targetQuantity > 0
              ? Math.round((category.successfulListings / category.targetQuantity) * 100)
              : 0,
          }))
          .sort((a, b) => b.successfulListings - a.successfulListings),
      }))
      .sort((a, b) => b.completionPercent - a.completionPercent || b.successfulListings - a.successfulListings);
  }, [cards]);

  const selectedUserHasTimeline = selectedBreakdownUser?.submissionTimeDistribution?.some((row) => row.uploadCount > 0);


  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 5, backgroundColor: theme.palette.background.paper, minHeight: '100vh' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ pt: 2.5, mb: 3, flexWrap: 'wrap' }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              background: BRAND_DARK,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 12px ${alpha(BRAND_DARK, 0.24)}`,
            }}
          >
            <InsightsIcon sx={{ color: BRAND_YELLOW, fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: BRAND_DARK }}>
              Listing Performance
            </Typography>
            <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.5), fontWeight: 500 }}>
              PDT target comparison by user, seller, and category
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
          disabled={loading}
          onClick={fetchPerformance}
          sx={yellowFilledButtonSx}
        >
          Refresh
        </Button>
      </Stack>

      <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={rangeMode}
            exclusive
            onChange={(_, value) => value && setRangeMode(value)}
            size="small"
            sx={{ flexWrap: 'wrap' }}
          >
            {RANGE_OPTIONS.map((option) => (
              <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
            <TextField
              label="Start Date (PDT)"
              type="date"
              value={startDate}
              onChange={(event) => {
                setRangeMode('custom');
                setStartDate(event.target.value);
              }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment> }}
              sx={{ minWidth: 190, ...inputSx }}
            />
            <TextField
              label="End Date (PDT)"
              type="date"
              value={endDate}
              onChange={(event) => {
                setRangeMode('custom');
                setEndDate(event.target.value);
              }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment> }}
              sx={{ minWidth: 190, ...inputSx }}
            />
            <Autocomplete
              options={users}
              getOptionLabel={getUserLabel}
              value={selectedUser}
              onChange={(_, value) => setSelectedUser(value)}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              sx={{ minWidth: 240, flex: 1 }}
              renderInput={(params) => <TextField {...params} label="All User Names" sx={inputSx} />}
            />
            <Autocomplete
              options={sellers}
              getOptionLabel={getSellerLabel}
              value={selectedSeller}
              onChange={(_, value) => setSelectedSeller(value)}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              sx={{ minWidth: 220, flex: 1 }}
              renderInput={(params) => <TextField {...params} label="All Sellers" sx={inputSx} />}
            />
            <FormControl sx={{ minWidth: 170 }}>
              <InputLabel sx={{ '&.Mui-focused': { color: BRAND_YELLOW_DARK } }}>All Marketplaces</InputLabel>
              <Select
                value={selectedMarketplace}
                label="All Marketplaces"
                onChange={(event) => setSelectedMarketplace(event.target.value)}
                sx={{
                  borderRadius: 1.5,
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${BRAND_YELLOW_DARK} !important` },
                }}
              >
                <MenuItem value="">All Marketplaces</MenuItem>
                {MARKETPLACES.map((marketplace) => (
                  <MenuItem key={marketplace} value={marketplace}>{marketplace}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              options={categories}
              getOptionLabel={getCategoryLabel}
              value={selectedCategory}
              onChange={(_, value) => {
                setSelectedCategory(value);
                setSelectedRange(null);
              }}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              sx={{ minWidth: 240, flex: 1 }}
              renderInput={(params) => <TextField {...params} label="All Categories" sx={inputSx} />}
            />
            <Autocomplete
              options={filteredRanges}
              getOptionLabel={(range) => {
                const categoryName = range.categoryName ? `${range.categoryName} / ` : '';
                return `${categoryName}${getRangeLabel(range)}`;
              }}
              value={selectedRange}
              onChange={(_, value) => setSelectedRange(value)}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              sx={{ minWidth: 240, flex: 1 }}
              renderInput={(params) => <TextField {...params} label="All Ranges" sx={inputSx} />}
            />
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {metricCards.map((metric) => (
          <Grid item xs={12} sm={6} md={4} xl={2} key={metric.label}>
            <Card elevation={0} sx={{ height: '100%', borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
              <CardContent>
                <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.55), fontWeight: 700, textTransform: 'uppercase' }}>
                  {metric.label}
                </Typography>
                <Typography variant="h4" fontWeight={800} sx={{ color: metric.tone === 'error' ? '#b3261e' : metric.tone === 'warning' ? '#a05a00' : BRAND_DARK, mt: 0.5 }}>
                  {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                </Typography>
                <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.5), mt: 0.5 }}>
                  {metric.helper}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!loading && userBreakdownRows.length > 0 && (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: BRAND_DARK }}>
                Quota Utilization per Lister
              </Typography>
              <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.52), fontWeight: 600 }}>
                Total successful listings against desired quantity across selected marketplaces, sellers, categories, and ranges
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ width: '100%', height: Math.max(220, userBreakdownRows.length * 54 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={userBreakdownRows}
                layout="vertical"
                margin={{ top: 8, right: 96, bottom: 8, left: 8 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="userName"
                  width={230}
                  tick={{ fill: BRAND_DARK, fontSize: 13, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar dataKey="completionPercent" radius={[0, 7, 7, 0]} barSize={18} background={{ fill: alpha(BRAND_DARK, 0.08), radius: 7 }}>
                  {userBreakdownRows.map((row) => {
                    const color = row.completionPercent >= 95
                      ? statusMeta.onTrack.color
                      : row.completionPercent >= 60
                        ? statusMeta.behind.color
                        : statusMeta.critical.color;
                    return <Cell key={row.userId} fill={color} />;
                  })}
                  <LabelList
                    dataKey={(row) => `${row.completionPercent}% ${row.successfulListings.toLocaleString()}/${row.targetQuantity.toLocaleString()}`}
                    position="right"
                    fill={BRAND_DARK}
                    fontSize={12}
                    fontWeight={800}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {!loading && userBreakdownRows.length > 0 && (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: BRAND_DARK }}>
                Lister Breakdown
              </Typography>
              <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.52), fontWeight: 600 }}>
                Assigned users for the selected date range, with category drill-down available in details
              </Typography>
            </Box>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, color: BRAND_DARK }}>Lister</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>Listed</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>AI Saved</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>Failed</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>Quota</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>Missed</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>Quota %</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: BRAND_DARK }}>Categories</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: BRAND_DARK }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {userBreakdownRows.map((row) => {
                  const meta = statusMeta[row.status] || statusMeta.critical;
                  const Icon = meta.Icon;
                  return (
                    <TableRow key={row.userId} hover>
                      <TableCell sx={{ fontWeight: 800, color: BRAND_DARK }}>{row.userName}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{row.successfulListings.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{row.aiSavedCount.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ color: row.failedListings > 0 ? '#b3261e' : BRAND_DARK, fontWeight: 800 }}>
                        {row.failedListings.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">{row.targetQuantity.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ color: row.missedListings > 0 ? '#b3261e' : BRAND_DARK, fontWeight: 800 }}>
                        {row.missedListings.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{row.completionPercent}%</TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.7) }}>
                          {row.categoryRows.slice(0, 3).map((category) => category.categoryName).join(', ')}
                          {row.categoryRows.length > 3 ? ` +${row.categoryRows.length - 3} more` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ px: 1, py: 0.5, borderRadius: 1.5, width: 'fit-content', backgroundColor: meta.bg, color: meta.color }}>
                          <Icon sx={{ fontSize: 17 }} />
                          <Typography variant="caption" fontWeight={800}>{meta.label}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setSelectedBreakdownUser(row)} sx={{ color: BRAND_DARK }}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {!loading && hasSubmissionTimeRows && (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: BRAND_DARK }}>
                Submission Time Distribution
              </Typography>
              <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.52), fontWeight: 600 }}>
                CSV upload times from matching feed uploads, shown in IST
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ width: '100%', height: { xs: 300, md: 360 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={submissionTimeRows} margin={{ top: 18, right: 18, bottom: 12, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(BRAND_DARK, 0.1)} />
                <XAxis
                  dataKey="label"
                  interval={2}
                  tick={{ fill: BRAND_DARK, fontSize: 12, fontWeight: 700 }}
                  axisLine={{ stroke: alpha(BRAND_DARK, 0.18) }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: alpha(BRAND_DARK, 0.7), fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<SubmissionTimeTooltip />} cursor={{ fill: alpha(BRAND_YELLOW, 0.08) }} />
                <Bar dataKey="successfulListings" name="Successful" fill={BRAND_YELLOW_DARK} radius={[7, 7, 0, 0]} barSize={18}>
                  <LabelList
                    dataKey="successfulListings"
                    position="top"
                    fill={BRAND_DARK}
                    fontSize={11}
                    fontWeight={800}
                    formatter={(value) => (value > 0 ? value.toLocaleString() : '')}
                  />
                </Bar>
                <Bar dataKey="failedListings" name="Failed" fill="#b3261e" radius={[7, 7, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {loading ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={30} sx={{ color: BRAND_YELLOW_DARK }} />
        </Box>
      ) : userBreakdownRows.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
          <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.55) }}>
            No saved targets match the selected filters.
          </Typography>
        </Paper>
      ) : null}

      <Dialog
        open={Boolean(selectedBreakdownUser)}
        onClose={() => setSelectedBreakdownUser(null)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6 }}>
          <Typography variant="h6" fontWeight={900} sx={{ color: BRAND_DARK }}>
            {selectedBreakdownUser?.userName || 'Lister'} Details
          </Typography>
          <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.55), fontWeight: 600 }}>
            {startDate} to {endDate} PDT
          </Typography>
          <IconButton
            onClick={() => setSelectedBreakdownUser(null)}
            sx={{ position: 'absolute', right: 12, top: 12, color: BRAND_DARK }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedBreakdownUser && (
            <Stack spacing={3}>
              {selectedBreakdownUser.status !== 'onTrack' && (
                <Alert severity={selectedBreakdownUser.status === 'behind' ? 'warning' : 'error'}>
                  Quota alert: {selectedBreakdownUser.userName} is {selectedBreakdownUser.missedListings.toLocaleString()} items short
                  ({selectedBreakdownUser.completionPercent}% complete).
                </Alert>
              )}

              <Grid container spacing={2}>
                {[
                  { label: 'Successful Listings', value: selectedBreakdownUser.successfulListings },
                  { label: 'AI Saved', value: selectedBreakdownUser.aiSavedCount },
                  { label: 'Failed', value: selectedBreakdownUser.failedListings },
                  { label: 'Quota %', value: `${selectedBreakdownUser.completionPercent}%` },
                  { label: 'Gap', value: selectedBreakdownUser.missedListings },
                  { label: 'Categories', value: selectedBreakdownUser.categoryRows.length },
                ].map((metric) => (
                  <Grid item xs={12} sm={6} md={2} key={metric.label}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
                      <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.55), fontWeight: 800, textTransform: 'uppercase' }}>
                        {metric.label}
                      </Typography>
                      <Typography variant="h5" fontWeight={900} sx={{ color: (metric.label === 'Gap' || metric.label === 'Failed') && metric.value > 0 ? '#b3261e' : BRAND_DARK, mt: 0.5 }}>
                        {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
                  <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}`, height: '100%' }}>
                    <Typography variant="subtitle2" fontWeight={900} sx={{ color: BRAND_DARK, mb: 1 }}>
                      Category Breakdown
                    </Typography>
                    <Box sx={{ height: { xs: 360, md: 340 } }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 12, right: 170, bottom: 12, left: 12 }}>
                          <Pie
                            data={selectedBreakdownUser.categoryRows}
                            dataKey="successfulListings"
                            nameKey="categoryName"
                            cx="42%"
                            cy="50%"
                            innerRadius={72}
                            outerRadius={118}
                            paddingAngle={2}
                            labelLine={false}
                            label={({ successfulListings }) => successfulListings > 0 ? successfulListings.toLocaleString() : ''}
                          >
                            {selectedBreakdownUser.categoryRows.map((entry, index) => (
                              <Cell key={entry.categoryId} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value, name) => [`${Number(value).toLocaleString()} listed`, name]}
                          />
                          <Legend
                            layout="vertical"
                            align="right"
                            verticalAlign="middle"
                            wrapperStyle={{ maxWidth: 160, fontSize: 12, lineHeight: '20px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                  <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}`, height: '100%' }}>
                    <Typography variant="subtitle2" fontWeight={900} sx={{ color: BRAND_DARK, mb: 1 }}>
                      Submission Timeline (IST)
                    </Typography>
                    {selectedUserHasTimeline ? (
                      <Box sx={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedBreakdownUser.submissionTimeDistribution} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(BRAND_DARK, 0.1)} />
                            <XAxis dataKey="label" interval={2} tick={{ fill: BRAND_DARK, fontSize: 11, fontWeight: 700 }} tickLine={false} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: alpha(BRAND_DARK, 0.7), fontSize: 12, fontWeight: 700 }} />
                            <RechartsTooltip content={<SubmissionTimeTooltip />} cursor={{ fill: alpha(BRAND_YELLOW, 0.08) }} />
                            <Bar dataKey="successfulListings" name="Successful" fill={BRAND_YELLOW_DARK} radius={[7, 7, 0, 0]} barSize={18}>
                              <LabelList dataKey="successfulListings" position="top" fill={BRAND_DARK} fontSize={11} fontWeight={800} formatter={(value) => (value > 0 ? value.toLocaleString() : '')} />
                            </Bar>
                            <Bar dataKey="failedListings" name="Failed" fill="#b3261e" radius={[7, 7, 0, 0]} barSize={18} />
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.55), py: 4, textAlign: 'center' }}>
                        No CSV upload timing found for this lister in the selected range.
                      </Typography>
                    )}
                  </Paper>
                </Grid>
              </Grid>

              <Paper elevation={0} sx={{ borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}`, overflow: 'hidden' }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>Seller / Marketplace</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>Range</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>Listed</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>Failed</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>Target</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>Quota %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedBreakdownUser.assignments.map((card) => (
                        <TableRow key={card.targetId}>
                          <TableCell>{getSellerLabel(card.seller)} / {card.marketplace || '-'}</TableCell>
                          <TableCell>{card.category?.name || 'Unknown Category'}</TableCell>
                          <TableCell>{card.range?.name || 'All ranges'}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800 }}>{card.successfulListings.toLocaleString()}</TableCell>
                          <TableCell align="right" sx={{ color: card.failedListings > 0 ? '#b3261e' : BRAND_DARK, fontWeight: 800 }}>
                            {(card.failedListings || 0).toLocaleString()}
                          </TableCell>
                          <TableCell align="right">{card.targetQuantity.toLocaleString()}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800 }}>{card.completionPercent}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
