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
import OrderAnalyticsSkeleton from '../../components/skeletons/OrderAnalyticsSkeleton';
import { dashboardSignatureTokens } from '../../theme/appTheme';

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
        p: 2,
        borderRadius: `${dashboardSignatureTokens.radius.card}px`,
        borderColor: palette.border,
        background: dashboardSignatureTokens.surfaces.metricCard,
        minHeight: 108,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      <Box
        sx={{
          mt: 1.5,
          width: 'fit-content',
          px: 1.25,
          py: 0.5,
          borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
          backgroundColor: palette.background,
          border: '1px solid',
          borderColor: palette.border,
          color: palette.color
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
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
    single: new Date().toISOString().split('T')[0],
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
      setSellers(response.data || []);
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    }).format(date);
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
      { label: 'United States', value: marketplaceTotals.EBAY_US, tone: 'shipping' },
      { label: 'Australia', value: marketplaceTotals.EBAY_AU, tone: 'success' },
      { label: 'Canada', value: marketplaceTotals.EBAY_CA, tone: 'warning' },
      { label: 'England', value: marketplaceTotals.EBAY_GB, tone: 'amazon' }
    ];
  }, [statistics, totalOrders, sellersList.length]);

  if (loading) return <OrderAnalyticsSkeleton />;

  return (
    <Fade in timeout={600}>
      <Box sx={{ p: 3 }}>
        <Paper
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            borderRadius: `${dashboardSignatureTokens.radius.card}px`,
            border: '1px solid',
            borderColor: 'divider',
            background: dashboardSignatureTokens.surfaces.pageCard,
            boxShadow: dashboardSignatureTokens.shadows.card
          }}
        >
          <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }} gap={2.5}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '1.9rem' } }}>
                Order Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Daily seller and marketplace order totals in PST, including cancelled orders for full visibility.
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" sx={{ width: { xs: '100%', lg: 'auto' } }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <ShoppingCartIcon />}
                onClick={pollNewOrders}
                disabled={loading}
                sx={{ minWidth: 170, height: 40, boxSizing: 'border-box' }}
              >
                {loading ? 'Polling...' : 'Poll New Orders'}
              </Button>
              <Chip
                icon={<ShoppingCartIcon />}
                label={`${totalOrders} Total Orders`}
                sx={{
                  height: 40,
                  px: 1,
                  borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                  border: '1px solid',
                  borderColor: dashboardSignatureTokens.tones.info.border,
                  backgroundColor: dashboardSignatureTokens.tones.info.background,
                  color: dashboardSignatureTokens.tones.info.color,
                  '& .MuiChip-icon': {
                    color: dashboardSignatureTokens.tones.info.color
                  }
                }}
              />
            </Stack>
          </Stack>

          <Box
            sx={{
              mt: 3,
              pt: 2,
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems="center"
              flexWrap="wrap"
            >
              <FormControl size="small" sx={{ minWidth: 150 }}>
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

              {/* Single Date Input */}
              {draftDateFilter.mode === 'single' && (
                <TextField
                  label="Date"
                  type="date"
                  value={draftDateFilter.single}
                  onChange={(e) => setDraftDateFilter(prev => ({ ...prev, single: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ minWidth: 200 }}
                />
              )}

              {/* Date Range Inputs */}
              {draftDateFilter.mode === 'range' && (
                <>
                  <TextField
                    label="From"
                    type="date"
                    value={draftDateFilter.from}
                    onChange={(e) => setDraftDateFilter(prev => ({ ...prev, from: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    sx={{ minWidth: 200 }}
                  />
                  <TextField
                    label="To"
                    type="date"
                    value={draftDateFilter.to}
                    onChange={(e) => setDraftDateFilter(prev => ({ ...prev, to: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    sx={{ minWidth: 200 }}
                  />
                </>
              )}

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Seller</InputLabel>
                <Select
                  value={selectedSeller}
                  onChange={(e) => setSelectedSeller(e.target.value)}
                  label="Seller"
                >
                  <MenuItem value="">All Sellers</MenuItem>
                  {sellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {seller.user?.username || 'Unknown'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Marketplace</InputLabel>
                <Select
                  value={draftMarketplace}
                  onChange={(e) => setDraftMarketplace(e.target.value)}
                  label="Marketplace"
                >
                  <MenuItem value="">All Marketplaces</MenuItem>
                  <MenuItem value="EBAY_US">United States</MenuItem>
                  <MenuItem value="EBAY_AU">Australia</MenuItem>
                  <MenuItem value="EBAY_CA">Canada</MenuItem>
                  <MenuItem value="GB">England</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={excludeClient}
                    onChange={(e) => setExcludeClient(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                    Exclude Client
                  </Typography>
                }
                sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={excludeLowValue}
                    onChange={(e) => setExcludeLowValue(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                    Exclude &lt; $3 Orders
                  </Typography>
                }
                sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
              />
            </Stack>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ mt: 2 }}
            >
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={handleApplyFilters}
                disabled={loading || !hasPendingFilterChanges}
                sx={{ height: 40, boxSizing: 'border-box' }}
              >
                Apply Filters
              </Button>

              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={handleRefresh}
                disabled={loading}
                sx={{ height: 40, boxSizing: 'border-box' }}
              >
                Refresh
              </Button>
            </Stack>
          </Box>

          {summaryCards.length > 0 && (
            <Box
              sx={{
                mt: 3,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 1.5
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
                          GB
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
