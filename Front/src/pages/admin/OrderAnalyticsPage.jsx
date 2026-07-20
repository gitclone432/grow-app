import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Stack,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  Fade
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import api from '../../lib/api';
import { publishOrderSyncEvent, subscribeOrderSyncEvent } from '../../lib/orderSyncEvents';
import OrderAnalyticsSkeleton from '../../components/skeletons/OrderAnalyticsSkeleton';
import { dashboardSignatureTokens } from '../../theme/appTheme';
import { sortSellersByName, sellerDisplayName } from '../../lib/sellersSort';

/** Calendar "today" in Pacific (same as Orders Department Dashboard / backend PT helpers). */
function getTodayPtDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const tableHeaderCellSx = {
  backgroundColor: dashboardSignatureTokens.table.headerBackground,
  color: dashboardSignatureTokens.table.headerForeground,
  fontWeight: 700,
  py: 1.75,
  whiteSpace: 'nowrap',
  borderBottom: 'none'
};

const tableBodyCellSx = {
  py: 1.4,
  px: 1.5,
  borderBottom: `1px solid ${dashboardSignatureTokens.table.rowBorder}`,
  whiteSpace: 'nowrap'
};

function SummaryCard({ label, value, tone = 'neutral' }) {
  const palette = dashboardSignatureTokens.tones[tone] || dashboardSignatureTokens.tones.neutral;

  return (
    <Paper
      variant="outlined"
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: `${dashboardSignatureTokens.radius.card}px`,
        borderColor: palette.border,
        background: dashboardSignatureTokens.surfaces.metricCard,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        minHeight: 56,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.2 }}>
        {label}
      </Typography>
      <Box
        sx={{
          minWidth: 36,
          px: 1,
          py: 0.35,
          borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
          backgroundColor: palette.background,
          border: '1px solid',
          borderColor: palette.border,
          color: palette.color,
          textAlign: 'center',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: '1rem' }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

function FilterToggle({ label, checked, onChange }) {
  return (
    <FormControlLabel
      control={<Switch size="small" checked={checked} onChange={onChange} color="primary" />}
      label={
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
          {label}
        </Typography>
      }
      sx={{ m: 0, mr: 0.5 }}
    />
  );
}

function MetricPill({ value, tone = 'neutral', minWidth = 42 }) {
  const palette = dashboardSignatureTokens.tones[tone] || dashboardSignatureTokens.tones.neutral;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth,
        px: 1.1,
        py: 0.45,
        borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
        border: '1px solid',
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.color,
        fontWeight: 700,
        fontSize: '0.8125rem',
        lineHeight: 1
      }}
    >
      {value}
    </Box>
  );
}

function getMarketplaceTone(value, marketplaceKey) {
  if (marketplaceKey === 'total') return value > 0 ? 'info' : 'neutral';
  if (marketplaceKey === 'EBAY_US') return value > 0 ? 'shipping' : 'neutral';
  if (marketplaceKey === 'EBAY_AU') return value > 0 ? 'success' : 'neutral';
  if (marketplaceKey === 'EBAY_CA') return value > 0 ? 'warning' : 'neutral';
  if (marketplaceKey === 'EBAY_GB') return value > 0 ? 'amazon' : 'neutral';
  return value > 0 ? 'info' : 'neutral';
}

export default function OrderAnalyticsPage() {
  const initialDateFilter = {
    mode: 'single',
    single: getTodayPtDateString(),
    from: '',
    to: ''
  };

  const [statistics, setStatistics] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollResults, setPollResults] = useState(null);

  // Filter states - Date filter defaults to single mode with today's date
  const [draftDateFilter, setDraftDateFilter] = useState(initialDateFilter);
  const [appliedDateFilter, setAppliedDateFilter] = useState(initialDateFilter);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [draftMarketplace, setDraftMarketplace] = useState('');
  const [appliedMarketplace, setAppliedMarketplace] = useState('');
  const [excludeClient, setExcludeClient] = useState(true);
  const [excludeLowValue, setExcludeLowValue] = useState(true);

  // Summary statistics - only count
  const [totalOrders, setTotalOrders] = useState(0);

  useEffect(() => {
    fetchSellers();
  }, []);

  // Auto-fetch when applied filters change
  useEffect(() => {
    fetchStatistics();
  }, [appliedDateFilter, selectedSeller, appliedMarketplace, excludeClient, excludeLowValue]);

  const fetchSellers = async () => {
    try {
      const response = await api.get('/sellers/all');
      setSellers(sortSellersByName(response.data || []));
    } catch (err) {
      console.error('Error fetching sellers:', err);
    }
  };

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {};

      // Handle date filtering based on mode
      if (appliedDateFilter.mode === 'single' && appliedDateFilter.single) {
        params.startDate = appliedDateFilter.single;
        params.endDate = appliedDateFilter.single;
      } else if (appliedDateFilter.mode === 'range') {
        if (appliedDateFilter.from) params.startDate = appliedDateFilter.from;
        if (appliedDateFilter.to) params.endDate = appliedDateFilter.to;
      }

      if (selectedSeller) params.sellerId = selectedSeller;
      if (appliedMarketplace) params.marketplace = appliedMarketplace;
      params.excludeClient = excludeClient;
      params.excludeLowValue = excludeLowValue;

      const statsResponse = await api.get('/orders/daily-statistics', { params });

      setStatistics(statsResponse.data || []);

      // Calculate total orders from the statistics
      const total = (statsResponse.data || []).reduce((sum, stat) => sum + stat.totalOrders, 0);
      setTotalOrders(total);
    } catch (err) {
      console.error('Error fetching statistics:', err);
      setError('Failed to load order statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchStatistics();
  };

  useEffect(() => {
    const unsubscribe = subscribeOrderSyncEvent(() => {
      fetchStatistics();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    setAppliedDateFilter(draftDateFilter);
    setAppliedMarketplace(draftMarketplace);
  };

  // Poll for NEW orders (like FulfillmentDashboard)
  const pollNewOrders = async () => {
    setLoading(true);
    setError('');
    setPollResults(null);
    try {
      const { data } = await api.post('/ebay/poll-all-sellers');
      setPollResults(data || null);

      // Refresh statistics after polling
      await fetchStatistics();
      publishOrderSyncEvent('OrderAnalyticsPage', 'poll-all-sellers');

      if (data && data.totalNewOrders > 0) {
        console.log(`✅ Polled ${data.totalNewOrders} new orders`);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to poll orders');
    } finally {
      setLoading(false);
    }
  };

  // Transform statistics into table format
  // NOW: Dates in rows (left), Sellers in columns (top)
  const transformToTableFormat = () => {
    // Get all unique dates
    const dates = [...new Set(statistics.map(stat => stat.date))].sort();

    // Get all unique sellers
    const sellersMap = new Map();
    statistics.forEach(stat => {
      if (!sellersMap.has(stat.seller.id)) {
        sellersMap.set(stat.seller.id, stat.seller.username);
      }
    });

    // Build table data: for each DATE (row), show each seller's marketplace counts
    const tableData = dates.map(date => {
      const dateData = {
        date,
        sellers: {}
      };

      // For each seller, get marketplace breakdown for this date
      Array.from(sellersMap.entries()).forEach(([sellerId, sellerUsername]) => {
        const dateStats = statistics.find(
          s => s.seller.id === sellerId && s.date === date
        );

        if (dateStats) {
          const marketplaces = {
            EBAY_US: 0,
            EBAY_AU: 0,
            EBAY_CA: 0,
            EBAY_GB: 0,
            total: dateStats.totalOrders
          };

          dateStats.marketplaceBreakdown.forEach(mp => {
            if (mp.marketplace === 'EBAY_US') {
              marketplaces.EBAY_US = mp.count;
            } else if (mp.marketplace === 'EBAY_AU') {
              marketplaces.EBAY_AU = mp.count;
            } else if (mp.marketplace === 'EBAY_CA' || mp.marketplace === 'EBAY_ENCA') {
              marketplaces.EBAY_CA = mp.count;
            } else if (mp.marketplace === 'EBAY_GB' || mp.marketplace === 'GB') {
              marketplaces.EBAY_GB = mp.count;
            }
          });

          dateData.sellers[sellerId] = {
            sellerUsername,
            ...marketplaces
          };
        } else {
          dateData.sellers[sellerId] = {
            sellerUsername,
            EBAY_US: 0,
            EBAY_AU: 0,
            EBAY_CA: 0,
            EBAY_GB: 0,
            total: 0
          };
        }
      });

      return dateData;
    });

    return { sellers: Array.from(sellersMap.entries()), tableData, dates };
  };

  const { sellers: sellersList, tableData, dates } = transformToTableFormat();

  /** `dateString` is YYYY-MM-DD in Pacific (from API); avoid UTC parse so weekday matches PT. */
  const formatDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return '–';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString.trim());
    if (!m) return dateString;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const anchorUtc = Date.UTC(y, mo - 1, d, 12, 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(anchorUtc));
  };

  // Calculate seller totals across all dates
  const calculateSellerTotals = (sellerId) => {
    return tableData.reduce((total, dateRow) => {
      return total + (dateRow.sellers[sellerId]?.total || 0);
    }, 0);
  };

  // Calculate date totals across all sellers
  const calculateDateTotals = (date) => {
    const dateRow = tableData.find(row => row.date === date);
    if (!dateRow) return 0;

    return Object.values(dateRow.sellers).reduce((sum, seller) => {
      return sum + (seller.total || 0);
    }, 0);
  };

  const topHeaderOffset = 0;
  const firstHeaderHeight = 44;
  const secondHeaderOffset = firstHeaderHeight;
  const isDateFilterDirty = JSON.stringify(draftDateFilter) !== JSON.stringify(appliedDateFilter);
  const isMarketplaceDirty = draftMarketplace !== appliedMarketplace;
  const hasPendingFilterChanges = isDateFilterDirty || isMarketplaceDirty;

  const summaryCards = useMemo(() => {
    const marketplaceTotals = statistics.reduce((accumulator, stat) => {
      stat.marketplaceBreakdown.forEach((mp) => {
        if (mp.marketplace === 'EBAY_US') {
          accumulator.EBAY_US += mp.count;
        } else if (mp.marketplace === 'EBAY_AU') {
          accumulator.EBAY_AU += mp.count;
        } else if (mp.marketplace === 'EBAY_CA' || mp.marketplace === 'EBAY_ENCA') {
          accumulator.EBAY_CA += mp.count;
        } else if (mp.marketplace === 'EBAY_GB' || mp.marketplace === 'GB') {
          accumulator.EBAY_GB += mp.count;
        }
      });

      return accumulator;
    }, {
      EBAY_US: 0,
      EBAY_AU: 0,
      EBAY_CA: 0,
      EBAY_GB: 0
    });

    return [
      { label: 'Total Orders', value: totalOrders, tone: 'info' },
      { label: 'Sellers', value: sellersList.length, tone: 'neutral' },
      { label: 'USA', value: marketplaceTotals.EBAY_US, tone: 'shipping' },
      { label: 'AUS', value: marketplaceTotals.EBAY_AU, tone: 'success' },
      { label: 'CA', value: marketplaceTotals.EBAY_CA, tone: 'warning' },
      { label: 'UK', value: marketplaceTotals.EBAY_GB, tone: 'amazon' }
    ];
  }, [statistics, totalOrders, sellersList.length]);

  if (loading) return <OrderAnalyticsSkeleton />;

  return (
    <Fade in timeout={600}>
      <Box sx={{ p: 3 }}>
        <Paper
          sx={{
            p: { xs: 2, md: 2.5 },
            mb: 3,
            borderRadius: `${dashboardSignatureTokens.radius.card}px`,
            border: '1px solid',
            borderColor: 'divider',
            background: dashboardSignatureTokens.surfaces.pageCard,
            boxShadow: dashboardSignatureTokens.shadows.card
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            gap={1.5}
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Order Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Seller & marketplace order totals · Pacific Time (PT)
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                icon={<ShoppingCartIcon sx={{ fontSize: 16 }} />}
                label={`${totalOrders} orders`}
                sx={{
                  height: 32,
                  border: '1px solid',
                  borderColor: dashboardSignatureTokens.tones.info.border,
                  backgroundColor: dashboardSignatureTokens.tones.info.background,
                  color: dashboardSignatureTokens.tones.info.color,
                  '& .MuiChip-icon': { color: dashboardSignatureTokens.tones.info.color },
                }}
              />
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <ShoppingCartIcon />}
                onClick={pollNewOrders}
                disabled={loading}
              >
                {loading ? 'Polling…' : 'Poll New Orders'}
              </Button>
            </Stack>
          </Stack>

          <Stack
            direction="row"
            spacing={1.25}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="date-mode-label">Date Mode</InputLabel>
              <Select
                labelId="date-mode-label"
                value={draftDateFilter.mode}
                label="Date Mode"
                onChange={(e) => setDraftDateFilter(prev => ({ ...prev, mode: e.target.value }))}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="single">Single Day</MenuItem>
                <MenuItem value="range">Date Range</MenuItem>
              </Select>
            </FormControl>

            {draftDateFilter.mode === 'single' && (
              <TextField
                label="Date"
                type="date"
                value={draftDateFilter.single}
                onChange={(e) => setDraftDateFilter(prev => ({ ...prev, single: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 160 }}
              />
            )}

            {draftDateFilter.mode === 'range' && (
              <>
                <TextField
                  label="From"
                  type="date"
                  value={draftDateFilter.from}
                  onChange={(e) => setDraftDateFilter(prev => ({ ...prev, from: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ width: 150 }}
                />
                <TextField
                  label="To"
                  type="date"
                  value={draftDateFilter.to}
                  onChange={(e) => setDraftDateFilter(prev => ({ ...prev, to: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ width: 150 }}
                />
              </>
            )}

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Seller</InputLabel>
              <Select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                label="Seller"
              >
                <MenuItem value="">All Sellers</MenuItem>
                {sellers.map((seller) => (
                  <MenuItem key={seller._id} value={seller._id}>
                    {sellerDisplayName(seller) || 'Unknown'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Marketplace</InputLabel>
              <Select
                value={draftMarketplace}
                onChange={(e) => setDraftMarketplace(e.target.value)}
                label="Marketplace"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="EBAY_US">USA</MenuItem>
                <MenuItem value="EBAY_CA">CA</MenuItem>
                <MenuItem value="EBAY_AU">AUS</MenuItem>
                <MenuItem value="EBAY_GB">UK</MenuItem>
              </Select>
            </FormControl>

            <FilterToggle
              label="Exclude Client"
              checked={excludeClient}
              onChange={(e) => setExcludeClient(e.target.checked)}
            />
            <FilterToggle
              label="Exclude &lt; $3"
              checked={excludeLowValue}
              onChange={(e) => setExcludeLowValue(e.target.checked)}
            />

            <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={handleApplyFilters}
                disabled={loading || !hasPendingFilterChanges}
              >
                Apply
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                onClick={handleRefresh}
                disabled={loading}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>

          {summaryCards.length > 0 && (
            <Box
              sx={{
                mt: 2,
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(3, 1fr)',
                  md: 'repeat(6, 1fr)',
                },
                gap: 1,
              }}
            >
              {summaryCards.map((card) => (
                <SummaryCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
              ))}
            </Box>
          )}
        </Paper>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Loading State */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          /* Statistics Table - Sellers as Columns, Dates as Rows */
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: `${dashboardSignatureTokens.radius.card}px`,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: dashboardSignatureTokens.shadows.table,
              overflow: 'hidden'
            }}
          >
            <TableContainer sx={{ maxHeight: 'calc(100vh - 400px)' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  {/* First Header Row - Seller Names */}
                  <TableRow>
                    <TableCell
                      sx={{
                        ...tableHeaderCellSx,
                        minWidth: 120,
                        height: firstHeaderHeight,
                        boxSizing: 'border-box',
                        position: 'sticky',
                        top: topHeaderOffset,
                        left: 0,
                        zIndex: 3
                      }}
                    >
                      Date
                    </TableCell>
                    {sellersList.map(([sellerId, sellerUsername]) => (
                      <TableCell
                        key={sellerId}
                        align="center"
                        colSpan={5}
                        sx={{
                          ...tableHeaderCellSx,
                          borderLeft: '8px solid white',
                          height: firstHeaderHeight,
                          boxSizing: 'border-box',
                          position: 'sticky',
                          top: topHeaderOffset,
                          zIndex: 2
                        }}
                      >
                        {sellerUsername}
                      </TableCell>
                    ))}
                  </TableRow>
                  {/* Second Header Row - Marketplace Columns */}
                  <TableRow>
                    <TableCell
                      sx={{
                        ...tableHeaderCellSx,
                        boxSizing: 'border-box',
                        position: 'sticky',
                        top: secondHeaderOffset,
                        left: 0,
                        zIndex: 3
                      }}
                    >
                      {/* Empty cell for date column */}
                    </TableCell>
                    {sellersList.map(([sellerId]) => (
                      <React.Fragment key={sellerId}>
                        <TableCell
                          align="center"
                          sx={{
                            ...tableHeaderCellSx,
                            fontSize: '0.75rem',
                            borderLeft: '8px solid white',
                            boxSizing: 'border-box',
                            position: 'sticky',
                            top: secondHeaderOffset,
                            zIndex: 2
                          }}
                        >
                          Total
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{
                            ...tableHeaderCellSx,
                            fontSize: '0.75rem',
                            boxSizing: 'border-box',
                            position: 'sticky',
                            top: secondHeaderOffset,
                            zIndex: 2
                          }}
                        >
                          US
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{
                            ...tableHeaderCellSx,
                            fontSize: '0.75rem',
                            boxSizing: 'border-box',
                            position: 'sticky',
                            top: secondHeaderOffset,
                            zIndex: 2
                          }}
                        >
                          AU
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{
                            ...tableHeaderCellSx,
                            fontSize: '0.75rem',
                            boxSizing: 'border-box',
                            position: 'sticky',
                            top: secondHeaderOffset,
                            zIndex: 2
                          }}
                        >
                          CA
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{
                            ...tableHeaderCellSx,
                            fontSize: '0.75rem',
                            boxSizing: 'border-box',
                            position: 'sticky',
                            top: secondHeaderOffset,
                            zIndex: 2
                          }}
                        >
                          UK
                        </TableCell>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={1 + sellersList.length * 5} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                          No orders found for the selected date range and filters.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* Date Rows */}
                      {tableData.map((dateRow) => (
                        <TableRow
                          key={dateRow.date}
                          hover
                          sx={{
                            transition: 'background-color 0.2s ease',
                            '&:nth-of-type(odd)': {
                              backgroundColor: dashboardSignatureTokens.table.rowStripe
                            },
                            '&:hover': {
                              backgroundColor: dashboardSignatureTokens.table.rowHover
                            },
                            '&:last-child td': {
                              borderBottom: 'none'
                            }
                          }}
                        >
                          <TableCell
                            sx={{
                              ...tableBodyCellSx,
                              fontWeight: 700,
                              position: 'sticky',
                              left: 0,
                              bgcolor: 'background.paper',
                              zIndex: 1
                            }}
                          >
                            {formatDate(dateRow.date)}
                          </TableCell>
                          {sellersList.map(([sellerId]) => {
                            const data = dateRow.sellers[sellerId];
                            return (
                              <React.Fragment key={sellerId}>
                                <TableCell
                                  align="center"
                                  sx={{
                                    ...tableBodyCellSx,
                                    borderLeft: '8px solid',
                                    borderColor: dashboardSignatureTokens.table.rowBorder
                                  }}
                                >
                                  <MetricPill value={data.total || '-'} tone={getMarketplaceTone(data.total, 'total')} minWidth={50} />
                                </TableCell>
                                <TableCell align="center" sx={tableBodyCellSx}>
                                  <MetricPill value={data.EBAY_US || '-'} tone={getMarketplaceTone(data.EBAY_US, 'EBAY_US')} />
                                </TableCell>
                                <TableCell align="center" sx={tableBodyCellSx}>
                                  <MetricPill value={data.EBAY_AU || '-'} tone={getMarketplaceTone(data.EBAY_AU, 'EBAY_AU')} />
                                </TableCell>
                                <TableCell align="center" sx={tableBodyCellSx}>
                                  <MetricPill value={data.EBAY_CA || '-'} tone={getMarketplaceTone(data.EBAY_CA, 'EBAY_CA')} />
                                </TableCell>
                                <TableCell align="center" sx={tableBodyCellSx}>
                                  <MetricPill value={data.EBAY_GB || '-'} tone={getMarketplaceTone(data.EBAY_GB, 'EBAY_GB')} />
                                </TableCell>
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      ))}

                      {/* Totals Row */}
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell
                          sx={{
                            ...tableBodyCellSx,
                            fontWeight: 'bold',
                            position: 'sticky',
                            left: 0,
                            bgcolor: 'grey.100',
                            zIndex: 1
                          }}
                        >
                          TOTAL
                        </TableCell>
                        {sellersList.map(([sellerId]) => {
                          const sellerTotal = calculateSellerTotals(sellerId);
                          const usTotal = tableData.reduce((sum, row) => sum + (row.sellers[sellerId]?.EBAY_US || 0), 0);
                          const auTotal = tableData.reduce((sum, row) => sum + (row.sellers[sellerId]?.EBAY_AU || 0), 0);
                          const caTotal = tableData.reduce((sum, row) => sum + (row.sellers[sellerId]?.EBAY_CA || 0), 0);
                          const gbTotal = tableData.reduce((sum, row) => sum + (row.sellers[sellerId]?.EBAY_GB || 0), 0);

                          return (
                            <React.Fragment key={sellerId}>
                              <TableCell
                                align="center"
                                sx={{
                                  ...tableBodyCellSx,
                                  borderLeft: '8px solid',
                                  borderColor: dashboardSignatureTokens.table.rowBorder,
                                  bgcolor: 'grey.200'
                                }}
                              >
                                <MetricPill value={sellerTotal || '-'} tone={getMarketplaceTone(sellerTotal, 'total')} minWidth={50} />
                              </TableCell>
                              <TableCell align="center" sx={tableBodyCellSx}>
                                <MetricPill value={usTotal || '-'} tone={getMarketplaceTone(usTotal, 'EBAY_US')} />
                              </TableCell>
                              <TableCell align="center" sx={tableBodyCellSx}>
                                <MetricPill value={auTotal || '-'} tone={getMarketplaceTone(auTotal, 'EBAY_AU')} />
                              </TableCell>
                              <TableCell align="center" sx={tableBodyCellSx}>
                                <MetricPill value={caTotal || '-'} tone={getMarketplaceTone(caTotal, 'EBAY_CA')} />
                              </TableCell>
                              <TableCell align="center" sx={tableBodyCellSx}>
                                <MetricPill value={gbTotal || '-'} tone={getMarketplaceTone(gbTotal, 'EBAY_GB')} />
                              </TableCell>
                            </React.Fragment>
                          );
                        })}
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TableContainer>
        )}

        {/* Poll Results Display */}
        {pollResults && pollResults.totalNewOrders > 0 && (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setPollResults(null)}>
            <Typography variant="subtitle2" fontWeight="bold">
              ✅ Successfully polled {pollResults.totalNewOrders} new order{pollResults.totalNewOrders !== 1 ? 's' : ''}!
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Statistics have been refreshed with the latest data.
            </Typography>
          </Alert>
        )}
      </Box>
    </Fade>
  );
}
