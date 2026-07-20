import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Container, Paper, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, Stack, FormControl, InputLabel, Button,
  ToggleButtonGroup, ToggleButton
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { alpha, ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import BarChartIcon from '@mui/icons-material/BarChart';
import FilterListIcon from '@mui/icons-material/FilterList';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import { tableHeaderCellSx, tableBodyRowSx, yellowFilledButtonSx } from '../../theme/tableStyles.js';
import api from '../../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, ResponsiveContainer } from 'recharts';

const getPTDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
};

const todayStr = getPTDate();
const currentMonthStr = todayStr.slice(0, 7);

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = String(new Date(y, m, 0).getDate()).padStart(2, '0');
  return { first: `${ym}-01`, last: `${ym}-${last}` };
}

// Sellers with a higher monthly quota (US only)
const HIGH_QUOTA_SELLERS = ['truxi', 'raveoli_cart', 'techmania', 'edgevolution'];

// Country-based quotas
const COUNTRY_QUOTAS = {
  US: { high: 25000, normal: 9000 },
  UK: { high: 100000, normal: 100000 },  // 1 lakh
  AU: { high: 250000, normal: 250000 },  // 2.5 lakh
  Canada: { high: null, normal: null },   // Not yet defined
};

const getQuota = (sellerName, country = 'US') => {
  const quotas = COUNTRY_QUOTAS[country] || COUNTRY_QUOTAS.US;
  const isHighQuota = HIGH_QUOTA_SELLERS.includes((sellerName || '').toLowerCase());
  return isHighQuota ? quotas.high : quotas.normal;
};

function CategoryTick({ x, y, payload, drillCategory, onSelect }) {
  const isActive = drillCategory?.name === payload.value;
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }} onClick={() => onSelect(payload.value)}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fontSize={12}
        fontWeight={isActive ? 700 : 400}
        fill={isActive ? BRAND_YELLOW_DARK : BRAND_DARK}
        style={{ textDecoration: isActive ? 'underline' : 'none' }}
      >
        {payload.value}
      </text>
    </g>
  );
}

function MetricMiniCard({ label, value, sub }) {
  return (
    <Box sx={{ px: 2.5, py: 2, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.1)}`, backgroundColor: alpha(BRAND_YELLOW, 0.06), minWidth: 130 }}>
      <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.55), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK, lineHeight: 1.2, mt: 0.5 }}>
        {value}
      </Typography>
      {sub && <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.5) }}>{sub}</Typography>}
    </Box>
  );
}

export default function FeedUploadStatsPage() {
  const theme = useTheme();

  const inputFocusSx = {
    '& label.Mui-focused': { color: `${BRAND_YELLOW} !important` },
    '& .MuiOutlinedInput-root': {
      borderRadius: 1.5,
      '& fieldset': { transition: 'border-color 0.2s ease' },
      '&:hover fieldset': { borderColor: `${alpha(BRAND_DARK, 0.35)} !important` },
      '&.Mui-focused fieldset': { borderColor: `${BRAND_YELLOW} !important`, borderWidth: '2px !important' },
    },
    '& input': { accentColor: BRAND_YELLOW }
  };
  const selectFocusSx = {
    borderRadius: 1.5,
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${BRAND_YELLOW} !important`, borderWidth: '2px !important' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${alpha(BRAND_DARK, 0.35)} !important` },
  };

  const menuProps = {
    PaperProps: {
      sx: {
        '& .MuiMenuItem-root.Mui-selected': {
          backgroundColor: alpha(BRAND_YELLOW, 0.2),
          '&:hover': { backgroundColor: alpha(BRAND_YELLOW, 0.3) }
        }
      }
    }
  };

  const datePickerTheme = useMemo(() => createTheme({
    palette: {
      primary: { 
        main: BRAND_YELLOW,
        light: BRAND_YELLOW,
        dark: BRAND_YELLOW,
        contrastText: BRAND_DARK
      },
    },
    components: {
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12, // 1.5 * 8
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: BRAND_YELLOW,
            }
          }
        }
      }
    }
  }), []);

  // ── Global filters ────────────────────────────────────────────────
  const [dateMode, setDateMode] = useState('single'); // 'single' | 'range'
  const [filterSeller, setFilterSeller] = useState('');
  const [filterCountry, setFilterCountry] = useState('ALL');
  const [filterFromDate, setFilterFromDate] = useState(todayStr);
  const [filterToDate, setFilterToDate] = useState(todayStr);
  const [filterCategory, setFilterCategory] = useState(null);
  const [filterRange, setFilterRange] = useState(null);

  // Month picker (separate — driven by the same global filters except date)
  const [monthPicker, setMonthPicker] = useState(currentMonthStr);
  const [monthCountry, setMonthCountry] = useState('US');

  // Filter option lists
  const [sellers, setSellers] = useState([]);
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterRanges, setFilterRanges] = useState([]);

  // Stats state
  const [dayStats, setDayStats] = useState([]);
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState(null);

  const [monthStats, setMonthStats] = useState([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState(null);

  // ── Category / Range chart ─────────────────────────────────────────
  const [categoryStats, setCategoryStats] = useState({ categories: [], ranges: [] });
  const [categoryStatsLoading, setCategoryStatsLoading] = useState(false);
  const [drillCategory, setDrillCategory] = useState(null); // { name, categoryId }

  // ── Build shared query params from global filters ─────────────────
  const buildParams = (extra = {}) => {
    const p = {};
    if (filterCountry !== 'ALL') p.country = filterCountry;
    if (filterSeller) p.sellerId = filterSeller;
    if (filterCategory) p.categoryId = filterCategory._id;
    if (filterRange) p.rangeId = filterRange._id;
    return { ...p, ...extra };
  };

  // ── Fetch functions ───────────────────────────────────────────────
  const fetchDay = async (from, to, paramOverrides = null) => {
    try {
      setDayLoading(true);
      setDayError(null);
      const params = paramOverrides !== null
        ? { startDate: from, endDate: to, ...paramOverrides }
        : buildParams({ startDate: from, endDate: to });
      const { data } = await api.get('/ebay/feed/upload-stats', { params });
      setDayStats([...data].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    } catch (err) {
      setDayError(err.response?.data?.error || 'Failed to fetch data');
    } finally {
      setDayLoading(false);
    }
  };

  const fetchMonth = async (ym, paramOverrides = null) => {
    try {
      setMonthLoading(true);
      setMonthError(null);
      const { first, last } = monthBounds(ym);
      let params;
      if (paramOverrides !== null) {
        params = { startDate: first, endDate: last, ...paramOverrides };
      } else {
        const p = {};
        if (monthCountry !== 'ALL') p.country = monthCountry;
        if (filterSeller) p.sellerId = filterSeller;
        if (filterCategory) p.categoryId = filterCategory._id;
        if (filterRange) p.rangeId = filterRange._id;
        params = { startDate: first, endDate: last, ...p };
      }
      const { data } = await api.get('/ebay/feed/upload-stats', { params });
      const map = {};
      data.forEach((r) => {
        const key = r.sellerName;
        if (!map[key])
          map[key] = { sellerId: r.sellerId, sellerName: r.sellerName, totalSuccess: 0 };
        map[key].totalSuccess += r.totalSuccess || 0;
      });
      setMonthStats(Object.values(map).sort((a, b) => b.totalSuccess - a.totalSuccess));
    } catch (err) {
      setMonthError(err.response?.data?.error || 'Failed to fetch data');
    } finally {
      setMonthLoading(false);
    }
  };

  const fetchCategoryStats = async (from, to, paramOverrides = null) => {
    try {
      setCategoryStatsLoading(true);
      const params = paramOverrides !== null
        ? { startDate: from, endDate: to, ...paramOverrides }
        : buildParams({ startDate: from, endDate: to });
      const { data } = await api.get('/ebay/feed/category-stats', { params });
      setCategoryStats(data);
      setDrillCategory(null);
    } catch {
      // silent — chart section shows empty state
    } finally {
      setCategoryStatsLoading(false);
    }
  };

  // Apply handler — called only when user clicks "Apply Filters"
  const handleApply = () => {
    fetchDay(filterFromDate, filterToDate);
    fetchMonth(monthPicker);
    fetchCategoryStats(filterFromDate, filterToDate);
  };

  // Clear all filters to defaults and re-fetch
  const handleClearFilters = () => {
    setDateMode('single');
    setFilterSeller('');
    setFilterCountry('ALL');
    setFilterFromDate(todayStr);
    setFilterToDate(todayStr);
    setFilterCategory(null);
    setFilterRange(null);
    setMonthPicker(currentMonthStr);
    // Fetch with no filter constraints (bypass stale state)
    fetchDay(todayStr, todayStr, {});
    fetchMonth(currentMonthStr, {});
    fetchCategoryStats(todayStr, todayStr, {});
  };

  // Load filter option lists + initial data on mount
  useEffect(() => {
    api.get('/sellers/all').then(({ data }) => setSellers(data || [])).catch(() => {});
    api.get('/asin-list-categories').then(({ data }) => setFilterCategories(data || [])).catch(() => {});
    fetchDay(filterFromDate, filterToDate);
    fetchMonth(monthPicker);
    fetchCategoryStats(filterFromDate, filterToDate);
  }, []);

  // Load ranges when category filter changes (dropdown population only — no data fetch)
  useEffect(() => {
    setFilterRange(null);
    if (filterCategory) {
      api.get(`/asin-list-ranges?categoryId=${filterCategory._id}`)
        .then(({ data }) => setFilterRanges(data || []))
        .catch(() => setFilterRanges([]));
    } else {
      setFilterRanges([]);
    }
  }, [filterCategory]);

  const dayTotal = dayStats.reduce((s, r) => s + (r.totalSuccess || 0), 0);
  const monthTotal = monthStats.reduce((s, r) => s + (r.totalSuccess || 0), 0);
  const drillRanges = drillCategory
    ? (categoryStats.ranges || []).filter((r) => r.categoryName === drillCategory.name)
    : [];
  const categoryTotal = (categoryStats.categories || []).reduce((s, c) => s + (c.totalSuccess || 0), 0);

  const headSx = {
    fontWeight: 700,
    bgcolor: '#f0f0f0',
    fontSize: '0.85rem',
    py: 1.8,
    borderBottom: '2px solid #d0d0d0',
  };
  const cellSx = { py: 1.6, fontSize: '0.9rem' };
  const numCellSx = { py: 1.6, fontSize: '0.9rem', fontWeight: 600, minWidth: 140 };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', p: 1, borderRadius: 2, backgroundColor: alpha(BRAND_YELLOW, 0.2) }}>
          <BarChartIcon sx={{ color: BRAND_YELLOW_DARK, fontSize: 28 }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800, color: BRAND_DARK, letterSpacing: -0.5 }}>
          Feed Upload Success Stats
        </Typography>
      </Stack>

      {/* ── Global Filter Bar ──────────────────────────────────────── */}
      <Paper elevation={0} sx={{ mb: 3, border: `1px solid ${alpha(BRAND_DARK, 0.12)}`, borderRadius: 3, px: 3, py: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <FilterListIcon sx={{ color: BRAND_YELLOW_DARK, fontSize: 20 }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND_DARK }}>Filters</Typography>
        </Stack>
        <Stack direction="row" flexWrap="wrap" gap={2} alignItems="center">
          {/* Seller */}
          <FormControl size="small" sx={{ minWidth: 180, ...inputFocusSx }}>
            <InputLabel>Seller</InputLabel>
            <Select
              value={filterSeller}
              onChange={(e) => setFilterSeller(e.target.value)}
              label="Seller"
              sx={selectFocusSx}
              MenuProps={menuProps}
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>{s.storeName || s.user?.username || s._id}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Marketplace */}
          <FormControl size="small" sx={{ minWidth: 160, ...inputFocusSx }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              label="Marketplace"
              sx={selectFocusSx}
              MenuProps={menuProps}
            >
              <MenuItem value="ALL">All Marketplaces</MenuItem>
              <MenuItem value="US">US</MenuItem>
              <MenuItem value="UK">UK</MenuItem>
              <MenuItem value="AU">AU</MenuItem>
              <MenuItem value="Canada">Canada</MenuItem>
            </Select>
          </FormControl>

          {/* Date mode toggle */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={dateMode}
            onChange={(_, val) => {
              if (!val) return;
              setDateMode(val);
              // When switching to single, align both dates to filterFromDate
              if (val === 'single') setFilterToDate(filterFromDate);
            }}
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                px: 1.5,
                color: alpha(BRAND_DARK, 0.6),
                borderColor: alpha(BRAND_DARK, 0.18),
                '&.Mui-selected': {
                  backgroundColor: alpha(BRAND_YELLOW, 0.25),
                  color: BRAND_DARK,
                  '&:hover': { backgroundColor: alpha(BRAND_YELLOW, 0.35) }
                }
              }
            }}
          >
            <ToggleButton value="single">Single Date</ToggleButton>
            <ToggleButton value="range">Date Range</ToggleButton>
          </ToggleButtonGroup>

          {/* Date picker(s) */}
          {dateMode === 'single' ? (
            <ThemeProvider theme={datePickerTheme}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Date"
                  value={filterFromDate ? new Date(filterFromDate) : null}
                  onChange={(date) => {
                    if (!date) { setFilterFromDate(''); setFilterToDate(''); return; }
                    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                    setFilterFromDate(iso);
                    setFilterToDate(iso);
                  }}
                  slotProps={{ textField: { size: 'small', sx: { width: 160, ...inputFocusSx } } }}
                />
              </LocalizationProvider>
            </ThemeProvider>
          ) : (
            <>
              <ThemeProvider theme={datePickerTheme}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Date From"
                    value={filterFromDate ? new Date(filterFromDate) : null}
                    onChange={(date) => {
                      if (!date) { setFilterFromDate(''); return; }
                      const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                      setFilterFromDate(iso);
                    }}
                    slotProps={{ textField: { size: 'small', sx: { width: 160, ...inputFocusSx } } }}
                  />
                </LocalizationProvider>
              </ThemeProvider>
              <ThemeProvider theme={datePickerTheme}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Date To"
                    value={filterToDate ? new Date(filterToDate) : null}
                    onChange={(date) => {
                      if (!date) { setFilterToDate(''); return; }
                      const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                      setFilterToDate(iso);
                    }}
                    slotProps={{ textField: { size: 'small', sx: { width: 160, ...inputFocusSx } } }}
                  />
                </LocalizationProvider>
              </ThemeProvider>
            </>
          )}

          {/* Category */}
          <Autocomplete
            size="small"
            options={filterCategories}
            getOptionLabel={(o) => o.name || ''}
            value={filterCategory}
            onChange={(_, val) => setFilterCategory(val)}
            sx={{ minWidth: 180 }}
            renderInput={(params) => (
              <TextField {...params} label="Category" sx={inputFocusSx} />
            )}
          />

          {/* Range */}
          <Autocomplete
            size="small"
            options={filterRanges}
            getOptionLabel={(o) => o.name || ''}
            value={filterRange}
            onChange={(_, val) => setFilterRange(val)}
            disabled={!filterCategory}
            sx={{ minWidth: 180 }}
            renderInput={(params) => (
              <TextField {...params} label="Range" sx={inputFocusSx} />
            )}
          />

          {/* Apply */}
          <Button
            variant="contained"
            onClick={handleApply}
            sx={{ ...yellowFilledButtonSx, px: 3, height: 40, flexShrink: 0 }}
          >
            Apply Filters
          </Button>

          {/* Clear */}
          <Button
            variant="outlined"
            onClick={handleClearFilters}
            sx={{ height: 40, flexShrink: 0, textTransform: 'none', fontWeight: 600, borderColor: alpha(BRAND_DARK, 0.25), color: alpha(BRAND_DARK, 0.65), '&:hover': { borderColor: BRAND_DARK, backgroundColor: alpha(BRAND_DARK, 0.05) } }}
          >
            Clear Filters
          </Button>
        </Stack>
      </Paper>

      {/* ── Category & Range Breakdown ─────────────────────────────── */}
      <Paper elevation={0} sx={{ mb: 3, border: `1px solid ${alpha(BRAND_DARK, 0.12)}`, borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.12)}`, backgroundColor: alpha(BRAND_DARK, 0.02) }}>
          <Typography variant="subtitle1" fontWeight={700} fontSize="1rem" sx={{ color: BRAND_DARK }}>
            Category & Range Breakdown
          </Typography>
        </Box>

        {categoryStatsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (categoryStats.categories.length === 0 && categoryStats.ranges.length === 0) ? (
          <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary', fontSize: '0.9rem' }}>
            No category data for the selected period
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            {/* Summary cards */}
            <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
              <MetricMiniCard label="Categories" value={categoryStats.categories.length} />
              <MetricMiniCard label="Ranges" value={categoryStats.ranges.length} />
              <MetricMiniCard
                label="Top Category"
                value={categoryStats.categories[0]?.name || '—'}
                sub={categoryStats.categories[0] ? categoryStats.categories[0].totalSuccess.toLocaleString() + ' listings' : undefined}
              />
              <MetricMiniCard label="Total Successful" value={categoryTotal.toLocaleString()} />
            </Stack>

            {/* Charts row */}
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
              {/* Category bar chart */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: alpha(BRAND_DARK, 0.5), mb: 1.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: '0.7rem' }}>
                  By Category — click a bar or name to drill in
                </Typography>
                <ResponsiveContainer width="100%" height={Math.max(200, categoryStats.categories.length * 42 + 16)}>
                  <BarChart
                    data={categoryStats.categories}
                    layout="vertical"
                    margin={{ left: 0, right: 64, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={160}
                      tick={(props) => (
                        <CategoryTick
                          {...props}
                          drillCategory={drillCategory}
                          onSelect={(name) => {
                            const cat = categoryStats.categories.find((c) => c.name === name);
                            setDrillCategory(drillCategory?.name === name ? null : { name, categoryId: cat?.categoryId });
                          }}
                        />
                      )}
                    />
                    <RechartsTooltip
                      formatter={(v) => [v.toLocaleString(), 'Successful Listings']}
                      contentStyle={{ borderRadius: 8, fontSize: '0.82rem' }}
                    />
                    <Bar
                      dataKey="totalSuccess"
                      radius={[0, 5, 5, 0]}
                      cursor="pointer"
                      onClick={(d) => setDrillCategory(drillCategory?.name === d.name ? null : { name: d.name, categoryId: d.categoryId })}
                      label={{ position: 'right', formatter: (v) => v.toLocaleString(), fontSize: 11, fill: alpha(BRAND_DARK, 0.6) }}
                    >
                      {(categoryStats.categories || []).map((c) => (
                        <Cell
                          key={String(c.categoryId)}
                          fill={drillCategory?.name === c.name ? BRAND_YELLOW : alpha(BRAND_DARK, 0.55)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>

              {/* Range drill panel */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {drillCategory ? (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: alpha(BRAND_DARK, 0.5), textTransform: 'uppercase', letterSpacing: 0.6, fontSize: '0.7rem' }}>
                        Ranges — {drillCategory.name}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => setDrillCategory(null)}
                        sx={{ ml: 'auto', textTransform: 'none', color: alpha(BRAND_DARK, 0.45), fontSize: '0.75rem', minWidth: 0, px: 1 }}
                      >
                        Clear
                      </Button>
                    </Box>
                    {drillRanges.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No range breakdown for this category
                      </Typography>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(200, drillRanges.length * 42 + 16)}>
                        <BarChart
                          data={drillRanges}
                          layout="vertical"
                          margin={{ left: 0, right: 64, top: 0, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12, fill: BRAND_DARK }} />
                          <RechartsTooltip
                            formatter={(v) => [v.toLocaleString(), 'Successful Listings']}
                            contentStyle={{ borderRadius: 8, fontSize: '0.82rem' }}
                          />
                          <Bar
                            dataKey="totalSuccess"
                            fill={BRAND_YELLOW}
                            radius={[0, 5, 5, 0]}
                            label={{ position: 'right', formatter: (v) => v.toLocaleString(), fontSize: 11, fill: alpha(BRAND_DARK, 0.6) }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 1.5, opacity: 0.35 }}>
                    <BarChartIcon sx={{ fontSize: 44, color: BRAND_DARK }} />
                    <Typography variant="body2" sx={{ color: BRAND_DARK, fontWeight: 500 }}>
                      Click a category to see range breakdown
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {/* ── Day-wise ─────────────────────────────────────────────────── */}
        <Paper elevation={0} sx={{ flex: 1, minWidth: 0, border: `1px solid ${alpha(BRAND_DARK, 0.12)}`, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.12)}`, backgroundColor: alpha(BRAND_DARK, 0.02) }}>
            <Typography variant="subtitle1" fontWeight={700} fontSize="1rem" sx={{ color: BRAND_DARK }}>Day-wise</Typography>
          </Box>

          {dayLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : dayError ? (
            <Alert severity="error" sx={{ m: 2 }}>{dayError}</Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead sx={{ backgroundColor: BRAND_DARK }}>
                  <TableRow>
                    <TableCell sx={{ ...tableHeaderCellSx, width: 52, pl: 3 }}>#</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Date</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Seller</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Country</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Category</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Range</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, pr: 3 }} align="right">Successful Listings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dayStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary', fontSize: '0.9rem' }}>
                        No data for this date
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {dayStats.map((row, idx) => (
                        <TableRow
                          key={`d-${row.sellerId}-${idx}`}
                          hover
                          sx={tableBodyRowSx}
                        >
                          <TableCell sx={{ ...cellSx, color: 'text.disabled', width: 52, pl: 3 }}>{idx + 1}</TableCell>
                          <TableCell sx={{ ...cellSx }}>{row.date}</TableCell>
                          <TableCell sx={{ ...cellSx, fontWeight: 500, color: BRAND_DARK }}>{row.sellerName}</TableCell>
                          <TableCell sx={cellSx}>{row.country || 'US'}</TableCell>
                          <TableCell sx={cellSx}>{row.categoryName || <Typography component="span" sx={{ color: alpha(BRAND_DARK, 0.35), fontSize: '0.85rem' }}>—</Typography>}</TableCell>
                          <TableCell sx={cellSx}>{row.rangeName || <Typography component="span" sx={{ color: alpha(BRAND_DARK, 0.35), fontSize: '0.85rem' }}>—</Typography>}</TableCell>
                          <TableCell align="right" sx={{ ...numCellSx, pr: 3, fontWeight: 700, color: BRAND_DARK }}>
                            {row.totalSuccess.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ backgroundColor: alpha(BRAND_YELLOW, 0.15) }}>
                        <TableCell colSpan={6} sx={{ fontWeight: 800, color: BRAND_DARK, fontSize: '0.9rem', pl: 3, py: 1.6, borderBottom: 'none' }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK, fontSize: '0.9rem', pr: 3, py: 1.6, borderBottom: 'none' }}>
                          {dayTotal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

        {/* ── Month-wise ───────────────────────────────────────────────── */}
        <Paper elevation={0} sx={{ flex: 1, minWidth: 0, border: `1px solid ${alpha(BRAND_DARK, 0.12)}`, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.12)}`, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: alpha(BRAND_DARK, 0.02) }}>
            <Typography variant="subtitle1" fontWeight={700} fontSize="1rem" sx={{ color: BRAND_DARK }}>Month-wise</Typography>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Marketplace</InputLabel>
                <Select value={monthCountry} label="Marketplace" onChange={(e) => setMonthCountry(e.target.value)}>
                  <MenuItem value="ALL">All</MenuItem>
                  <MenuItem value="US">US</MenuItem>
                  <MenuItem value="UK">UK</MenuItem>
                  <MenuItem value="AU">AU</MenuItem>
                  <MenuItem value="Canada">Canada</MenuItem>
                </Select>
              </FormControl>
              <ThemeProvider theme={datePickerTheme}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    views={['month', 'year']}
                    value={monthPicker ? new Date(`${monthPicker}-01T00:00:00`) : null}
                    onChange={(date) => {
                      if (!date) { setMonthPicker(''); return; }
                      const y = date.getFullYear();
                      const m = String(date.getMonth() + 1).padStart(2, '0');
                      setMonthPicker(`${y}-${m}`);
                    }}
                    slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
                  />
                </LocalizationProvider>
              </ThemeProvider>
            </Box>
          </Box>

          {monthLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : monthError ? (
            <Alert severity="error" sx={{ m: 2 }}>{monthError}</Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead sx={{ backgroundColor: BRAND_DARK }}>
                  <TableRow>
                    <TableCell sx={{ ...tableHeaderCellSx, width: 52, pl: 3 }}>#</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Seller</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, pr: 3 }} align="right">Successful Listings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {monthStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary', fontSize: '0.9rem' }}>
                        No data for this month
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {monthStats.map((row, idx) => {
                        const quota = getQuota(row.sellerName, monthCountry === 'ALL' ? 'US' : monthCountry);
                        return (
                          <TableRow
                            key={`m-${row.sellerId}-${idx}`}
                            hover
                            sx={tableBodyRowSx}
                          >
                            <TableCell sx={{ ...cellSx, color: 'text.disabled', width: 52, pl: 3 }}>{idx + 1}</TableCell>
                            <TableCell sx={{ ...cellSx, fontWeight: 500, color: BRAND_DARK }}>{row.sellerName}</TableCell>
                            <TableCell align="right" sx={{ ...numCellSx, pr: 3, fontWeight: 700, color: BRAND_DARK }}>
                              {row.totalSuccess.toLocaleString()}
                              {quota && (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: alpha(BRAND_DARK, 0.5), ml: 0.5, fontWeight: 500 }}>
                                  / {quota.toLocaleString()}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow sx={{ backgroundColor: alpha(BRAND_YELLOW, 0.15) }}>
                        <TableCell colSpan={2} sx={{ fontWeight: 800, color: BRAND_DARK, fontSize: '0.9rem', pl: 3, py: 1.6, borderBottom: 'none' }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: BRAND_DARK, fontSize: '0.9rem', pr: 3, py: 1.6, borderBottom: 'none' }}>
                          {monthTotal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
