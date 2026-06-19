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
  InputLabel,
  Select,
  MenuItem,
  Fade,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import api from '../../../lib/api';
import EtsyOrderAnalyticsSkeleton from '../../../components/skeletons/EtsyOrderAnalyticsSkeleton';
import { dashboardSignatureTokens } from '../../../theme/appTheme';
import { ETSY_REGION_OPTIONS } from '../../../utils/etsyAddressZip';

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
  borderBottom: 'none',
};

const tableBodyCellSx = {
  py: 1.4,
  px: 1.5,
  borderBottom: `1px solid ${dashboardSignatureTokens.table.rowBorder}`,
  whiteSpace: 'nowrap',
};

const REGION_KEYS = ['USA', 'UK', 'CANADA', 'AU'];

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
        justifyContent: 'space-between',
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
          color: palette.color,
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
        lineHeight: 1,
      }}
    >
      {value}
    </Box>
  );
}

function getRegionTone(value, regionKey) {
  if (regionKey === 'total') return value > 0 ? 'info' : 'neutral';
  if (regionKey === 'USA') return value > 0 ? 'shipping' : 'neutral';
  if (regionKey === 'AU') return value > 0 ? 'success' : 'neutral';
  if (regionKey === 'CANADA') return value > 0 ? 'warning' : 'neutral';
  if (regionKey === 'UK') return value > 0 ? 'amazon' : 'neutral';
  return value > 0 ? 'info' : 'neutral';
}

function getRegionLabel(regionKey) {
  if (regionKey === 'USA') return 'US';
  if (regionKey === 'CANADA') return 'CA';
  return regionKey;
}

export default function EtsyOrderAnalyticsPage() {
  const initialDateFilter = {
    mode: 'single',
    single: getTodayPtDateString(),
    from: '',
    to: '',
  };

  const [statistics, setStatistics] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftDateFilter, setDraftDateFilter] = useState(initialDateFilter);
  const [appliedDateFilter, setAppliedDateFilter] = useState(initialDateFilter);
  const [selectedStore, setSelectedStore] = useState('');
  const [draftRegion, setDraftRegion] = useState('');
  const [appliedRegion, setAppliedRegion] = useState('');
  const [totalOrders, setTotalOrders] = useState(0);

  useEffect(() => {
    const loadStores = async () => {
      try {
        const { data } = await api.get('/etsy/stores');
        setStores(Array.isArray(data.stores) ? data.stores : []);
      } catch (err) {
        console.error('Error fetching Etsy stores:', err);
      }
    };
    loadStores();
  }, []);

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {};

      if (appliedDateFilter.mode === 'single' && appliedDateFilter.single) {
        params.startDate = appliedDateFilter.single;
        params.endDate = appliedDateFilter.single;
      } else if (appliedDateFilter.mode === 'range') {
        if (appliedDateFilter.from) params.startDate = appliedDateFilter.from;
        if (appliedDateFilter.to) params.endDate = appliedDateFilter.to;
      }

      if (selectedStore) params.storeId = selectedStore;
      if (appliedRegion) params.region = appliedRegion;

      const { data } = await api.get('/etsy/order-fulfilment/daily-statistics', { params });
      const rows = Array.isArray(data) ? data : [];
      setStatistics(rows);
      setTotalOrders(rows.reduce((sum, stat) => sum + stat.totalOrders, 0));
    } catch (err) {
      console.error('Error fetching Etsy statistics:', err);
      setError('Failed to load order statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedDateFilter, selectedStore, appliedRegion]);

  const transformToTableFormat = () => {
    const dates = [...new Set(statistics.map((stat) => stat.date))].sort();
    const storesMap = new Map();

    statistics.forEach((stat) => {
      if (!storesMap.has(stat.store.id)) {
        storesMap.set(stat.store.id, stat.store.name);
      }
    });

    const tableData = dates.map((date) => {
      const dateData = { date, stores: {} };

      Array.from(storesMap.entries()).forEach(([storeId, storeName]) => {
        const dateStats = statistics.find(
          (s) => s.store.id === storeId && s.date === date
        );

        const regions = {
          USA: 0,
          UK: 0,
          CANADA: 0,
          AU: 0,
          total: dateStats?.totalOrders || 0,
        };

        (dateStats?.regionBreakdown || []).forEach((entry) => {
          if (Object.prototype.hasOwnProperty.call(regions, entry.region)) {
            regions[entry.region] = entry.count;
          }
        });

        dateData.stores[storeId] = { storeName, ...regions };
      });

      return dateData;
    });

    return { stores: Array.from(storesMap.entries()), tableData, dates };
  };

  const { stores: storesList, tableData } = transformToTableFormat();

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

  const calculateStoreTotals = (storeId) => (
    tableData.reduce((total, dateRow) => total + (dateRow.stores[storeId]?.total || 0), 0)
  );

  const topHeaderOffset = 0;
  const firstHeaderHeight = 44;
  const secondHeaderOffset = firstHeaderHeight;
  const isDateFilterDirty = JSON.stringify(draftDateFilter) !== JSON.stringify(appliedDateFilter);
  const isRegionDirty = draftRegion !== appliedRegion;
  const hasPendingFilterChanges = isDateFilterDirty || isRegionDirty;

  const summaryCards = useMemo(() => {
    const regionTotals = statistics.reduce((accumulator, stat) => {
      stat.regionBreakdown.forEach((entry) => {
        if (Object.prototype.hasOwnProperty.call(accumulator, entry.region)) {
          accumulator[entry.region] += entry.count;
        }
      });
      return accumulator;
    }, { USA: 0, UK: 0, CANADA: 0, AU: 0 });

    return [
      { label: 'Total Orders', value: totalOrders, tone: 'info' },
      { label: 'Stores', value: storesList.length, tone: 'neutral' },
      { label: 'United States', value: regionTotals.USA, tone: 'shipping' },
      { label: 'United Kingdom', value: regionTotals.UK, tone: 'amazon' },
      { label: 'Canada', value: regionTotals.CANADA, tone: 'warning' },
      { label: 'Australia', value: regionTotals.AU, tone: 'success' },
    ];
  }, [statistics, totalOrders, storesList.length]);

  if (loading && statistics.length === 0) return <EtsyOrderAnalyticsSkeleton />;

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
            boxShadow: dashboardSignatureTokens.shadows.card,
          }}
        >
          <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }} gap={2.5}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '1.9rem' } }}>
                Etsy Order Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Daily Etsy store and region order totals from fulfilment data. Single-day default is today in Pacific Time.
              </Typography>
            </Box>

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
                  color: dashboardSignatureTokens.tones.info.color,
                },
              }}
            />
          </Stack>

          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="etsy-date-mode-label">Date Mode</InputLabel>
                <Select
                  labelId="etsy-date-mode-label"
                  value={draftDateFilter.mode}
                  label="Date Mode"
                  onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, mode: e.target.value }))}
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
                  onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, single: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ minWidth: 200 }}
                />
              )}

              {draftDateFilter.mode === 'range' && (
                <>
                  <TextField
                    label="From"
                    type="date"
                    value={draftDateFilter.from}
                    onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, from: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    sx={{ minWidth: 200 }}
                  />
                  <TextField
                    label="To"
                    type="date"
                    value={draftDateFilter.to}
                    onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, to: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    sx={{ minWidth: 200 }}
                  />
                </>
              )}

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Store</InputLabel>
                <Select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  label="Store"
                >
                  <MenuItem value="">All Stores</MenuItem>
                  {stores.map((store) => (
                    <MenuItem key={store._id} value={store._id}>
                      {store.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Region</InputLabel>
                <Select
                  value={draftRegion}
                  onChange={(e) => setDraftRegion(e.target.value)}
                  label="Region"
                >
                  <MenuItem value="">All Regions</MenuItem>
                  {ETSY_REGION_OPTIONS.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={() => {
                  setAppliedDateFilter(draftDateFilter);
                  setAppliedRegion(draftRegion);
                }}
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
                onClick={fetchStatistics}
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
                gap: 1.5,
              }}
            >
              {summaryCards.map((card) => (
                <SummaryCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
              ))}
            </Box>
          )}
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: `${dashboardSignatureTokens.radius.card}px`,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: dashboardSignatureTokens.shadows.table,
              overflow: 'hidden',
            }}
          >
            <TableContainer sx={{ maxHeight: 'calc(100vh - 400px)' }}>
              <Table stickyHeader size="small">
                <TableHead>
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
                        zIndex: 3,
                      }}
                    >
                      Date
                    </TableCell>
                    {storesList.map(([storeId, storeName]) => (
                      <TableCell
                        key={storeId}
                        align="center"
                        colSpan={5}
                        sx={{
                          ...tableHeaderCellSx,
                          borderLeft: '8px solid white',
                          height: firstHeaderHeight,
                          boxSizing: 'border-box',
                          position: 'sticky',
                          top: topHeaderOffset,
                          zIndex: 2,
                        }}
                      >
                        {storeName}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell
                      sx={{
                        ...tableHeaderCellSx,
                        boxSizing: 'border-box',
                        position: 'sticky',
                        top: secondHeaderOffset,
                        left: 0,
                        zIndex: 3,
                      }}
                    />
                    {storesList.map(([storeId]) => (
                      <React.Fragment key={storeId}>
                        {['total', ...REGION_KEYS].map((regionKey, index) => (
                          <TableCell
                            key={`${storeId}-${regionKey}`}
                            align="center"
                            sx={{
                              ...tableHeaderCellSx,
                              fontSize: '0.75rem',
                              borderLeft: index === 0 ? '8px solid white' : undefined,
                              boxSizing: 'border-box',
                              position: 'sticky',
                              top: secondHeaderOffset,
                              zIndex: 2,
                            }}
                          >
                            {regionKey === 'total' ? 'Total' : getRegionLabel(regionKey)}
                          </TableCell>
                        ))}
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={1 + storesList.length * 5} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                          No orders found for the selected date range and filters.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {tableData.map((dateRow) => (
                        <TableRow
                          key={dateRow.date}
                          hover
                          sx={{
                            transition: 'background-color 0.2s ease',
                            '&:nth-of-type(odd)': {
                              backgroundColor: dashboardSignatureTokens.table.rowStripe,
                            },
                            '&:hover': {
                              backgroundColor: dashboardSignatureTokens.table.rowHover,
                            },
                            '&:last-child td': {
                              borderBottom: 'none',
                            },
                          }}
                        >
                          <TableCell
                            sx={{
                              ...tableBodyCellSx,
                              fontWeight: 700,
                              position: 'sticky',
                              left: 0,
                              bgcolor: 'background.paper',
                              zIndex: 1,
                            }}
                          >
                            {formatDate(dateRow.date)}
                          </TableCell>
                          {storesList.map(([storeId]) => {
                            const data = dateRow.stores[storeId];
                            return (
                              <React.Fragment key={storeId}>
                                {['total', ...REGION_KEYS].map((regionKey, index) => {
                                  const value = regionKey === 'total' ? data.total : data[regionKey];
                                  return (
                                    <TableCell
                                      key={`${storeId}-${regionKey}`}
                                      align="center"
                                      sx={{
                                        ...tableBodyCellSx,
                                        ...(index === 0
                                          ? {
                                            borderLeft: '8px solid',
                                            borderColor: dashboardSignatureTokens.table.rowBorder,
                                          }
                                          : {}),
                                      }}
                                    >
                                      <MetricPill
                                        value={value || '-'}
                                        tone={getRegionTone(value, regionKey)}
                                        minWidth={regionKey === 'total' ? 50 : 42}
                                      />
                                    </TableCell>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      ))}

                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell
                          sx={{
                            ...tableBodyCellSx,
                            fontWeight: 'bold',
                            position: 'sticky',
                            left: 0,
                            bgcolor: 'grey.100',
                            zIndex: 1,
                          }}
                        >
                          TOTAL
                        </TableCell>
                        {storesList.map(([storeId]) => {
                          const storeTotal = calculateStoreTotals(storeId);
                          return (
                            <React.Fragment key={storeId}>
                              {['total', ...REGION_KEYS].map((regionKey, index) => {
                                const value = regionKey === 'total'
                                  ? storeTotal
                                  : tableData.reduce(
                                    (sum, row) => sum + (row.stores[storeId]?.[regionKey] || 0),
                                    0
                                  );
                                return (
                                  <TableCell
                                    key={`${storeId}-${regionKey}-total`}
                                    align="center"
                                    sx={{
                                      ...tableBodyCellSx,
                                      ...(index === 0
                                        ? {
                                          borderLeft: '8px solid',
                                          borderColor: dashboardSignatureTokens.table.rowBorder,
                                          bgcolor: 'grey.200',
                                        }
                                        : {}),
                                    }}
                                  >
                                    <MetricPill
                                      value={value || '-'}
                                      tone={getRegionTone(value, regionKey)}
                                      minWidth={regionKey === 'total' ? 50 : 42}
                                    />
                                  </TableCell>
                                );
                              })}
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
      </Box>
    </Fade>
  );
}
