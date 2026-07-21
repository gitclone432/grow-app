import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Fade,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import RefreshIcon from '@mui/icons-material/Refresh';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import StatMetricCard from '../../components/StatMetricCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { dashboardSignatureTokens } from '../../theme/appTheme';
import { yellowFilledButtonSx } from '../../theme/tableStyles.js';

const getPTDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
};

const numberFmt = new Intl.NumberFormat('en-US');

const COUNTRY_OPTIONS = [
  { value: 'ALL', label: 'All Countries' },
  { value: 'US', label: 'US' },
  { value: 'UK', label: 'UK' },
  { value: 'AU', label: 'AU' },
  { value: 'Canada', label: 'CA' },
  { value: 'Unknown', label: 'Unknown' },
];

const countryLabel = (country) => {
  if (country === 'US') return 'US';
  if (country === 'UK') return 'UK';
  if (country === 'AU') return 'AU';
  if (country === 'Canada') return 'CA';
  return country || 'Unknown';
};

const formatSignedNumber = (value) => `${value >= 0 ? '+' : ''}${numberFmt.format(value)}`;

const TARGET_PROGRESS_SELLERS = new Set([
  
  'techmania',
  'truxi',
  'raveoli_cart',
  'techvista',
  'valueventure',
  'ultimate',
  'edgevolution',
]);

const isTargetProgressSeller = (sellerName = '') => (
  TARGET_PROGRESS_SELLERS.has(String(sellerName).trim().toLowerCase())
);

const getSellerProgressConfig = (sellerName) => (
  isTargetProgressSeller(sellerName)
    ? { targetQuantity: 800, greenThreshold: 750 }
    : { targetQuantity: 300, greenThreshold: 275 }
);

const getUsSuccessfulListings = (row) => (
  row.usSuccessfulListings ?? (row.marketplaces || []).reduce((sum, marketplace) => (
    marketplace.country === 'US'
      ? sum + (marketplace.successfulListings || 0)
      : sum
  ), 0)
);

const getDateLabel = (filter) => {
  if (filter.mode === 'range') {
    if (filter.from && filter.to) return `${filter.from} to ${filter.to}`;
    if (filter.from) return `${filter.from} onward`;
    if (filter.to) return `Through ${filter.to}`;
  }
  return filter.single;
};

function StatBlock({ icon, label, value, tone = 'default' }) {
  const color =
    tone === 'good' ? 'success.main' :
    tone === 'bad' ? 'error.main' :
    'text.primary';

  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5, color: 'text.secondary' }}>
        {icon}
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', fontSize: '0.68rem' }}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h6" fontWeight={800} sx={{ color, lineHeight: 1.1 }}>
        {numberFmt.format(value || 0)}
      </Typography>
    </Box>
  );
}

export default function DailyListingComparisonPage() {
  const [draftDateFilter, setDraftDateFilter] = useState(() => ({
    mode: 'single',
    single: getPTDate(),
    from: getPTDate(-6),
    to: getPTDate()
  }));
  const [appliedDateFilter, setAppliedDateFilter] = useState(() => ({
    mode: 'single',
    single: getPTDate(),
    from: getPTDate(-6),
    to: getPTDate()
  }));
  const [rows, setRows] = useState([]);
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = appliedDateFilter.mode === 'range'
        ? {
            startDate: appliedDateFilter.from || undefined,
            endDate: appliedDateFilter.to || undefined
          }
        : { date: appliedDateFilter.single };
      const { data } = await api.get('/ebay/feed/daily-listing-comparison', {
        params
      });
      setRows(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load daily listing comparison');
    } finally {
      setLoading(false);
    }
  }, [appliedDateFilter]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  const displayedRows = useMemo(() => {
    if (countryFilter === 'ALL') return rows;

    return rows
      .map(row => {
        const marketplaces = (row.marketplaces || []).filter(marketplace => marketplace.country === countryFilter);
        const successfulListings = marketplaces.reduce((sum, marketplace) => sum + (marketplace.successfulListings || 0), 0);
        const endedListings = marketplaces.reduce((sum, marketplace) => sum + (marketplace.endedListings || 0), 0);
        const manualEndedListings = marketplaces.reduce((sum, marketplace) => sum + (marketplace.manualEndedListings || 0), 0);
        const netListings = successfulListings - endedListings;

        return {
          ...row,
          successfulListings,
          endedListings,
          manualEndedListings,
          netListings,
          marketplaces,
        };
      })
      .filter(row => (row.successfulListings || 0) > 0 || (row.endedListings || 0) > 0);
  }, [rows, countryFilter]);

  const totals = useMemo(() => displayedRows.reduce(
    (acc, row) => {
      acc.successfulListings += row.successfulListings || 0;
      acc.endedListings += row.endedListings || 0;
      acc.netListings += row.netListings || 0;
      return acc;
    },
    { successfulListings: 0, endedListings: 0, netListings: 0 }
  ), [displayedRows]);

  const hasPendingFilterChanges = JSON.stringify(draftDateFilter) !== JSON.stringify(appliedDateFilter);

  const handleApplyFilters = () => {
    setAppliedDateFilter(draftDateFilter);
  };

  const handleResetToday = () => {
    const today = getPTDate();
    const next = { mode: 'single', single: today, from: getPTDate(-6), to: today };
    setDraftDateFilter(next);
    setAppliedDateFilter(next);
  };

  const summaryCards = [
    { label: 'Successful Listings', value: totals.successfulListings, tone: 'success' },
    { label: 'Ended Listings', value: totals.endedListings, tone: 'warning' },
    { label: 'Net Listings', value: totals.netListings, tone: totals.netListings >= 0 ? 'info' : 'amazon' },
    { label: 'Sellers', value: displayedRows.length, tone: 'neutral' }
  ];

  return (
    <Fade in timeout={600}>
      <AdminPageShell>
        <SectionCard
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            background: dashboardSignatureTokens.surfaces.pageCard,
          }}
        >
          <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }} gap={2.5}>
            <PageHeader
              title="Daily Listing Comparison"
              subtitle="Pacific day seller comparison for successful feed uploads and ended listings."
              sx={{ pt: 0, pb: 0 }}
            />

            <Chip
              icon={<CompareArrowsIcon />}
              label={`${getDateLabel(appliedDateFilter)} PT`}
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

          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} flexWrap="wrap">
              <ToggleButtonGroup
                size="small"
                exclusive
                value={draftDateFilter.mode}
                onChange={(_, mode) => {
                  if (!mode) return;
                  setDraftDateFilter(prev => ({ ...prev, mode }));
                }}
                sx={{
                  '& .MuiToggleButton-root': {
                    height: 40,
                    px: 2,
                    textTransform: 'none',
                    fontWeight: 700
                  }
                }}
              >
                <ToggleButton value="single">Single Day</ToggleButton>
                <ToggleButton value="range">Date Range</ToggleButton>
              </ToggleButtonGroup>

              {draftDateFilter.mode === 'single' ? (
                <TextField
                  label="Date"
                  type="date"
                  size="small"
                  value={draftDateFilter.single}
                  onChange={(e) => setDraftDateFilter(prev => ({ ...prev, single: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 200 }}
                />
              ) : (
                <>
                  <TextField
                    label="From"
                    type="date"
                    size="small"
                    value={draftDateFilter.from}
                    onChange={(e) => setDraftDateFilter(prev => ({ ...prev, from: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 180 }}
                  />
                  <TextField
                    label="To"
                    type="date"
                    size="small"
                    value={draftDateFilter.to}
                    onChange={(e) => setDraftDateFilter(prev => ({ ...prev, to: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 180 }}
                  />
                </>
              )}

              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>Country</InputLabel>
                <Select
                  label="Country"
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                >
                  {COUNTRY_OPTIONS.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="contained"
                size="small"
                onClick={handleApplyFilters}
                disabled={loading || !hasPendingFilterChanges}
                sx={{ ...yellowFilledButtonSx, height: 40 }}
              >
                Apply Filters
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={fetchComparison}
                disabled={loading}
                sx={{ ...yellowFilledButtonSx, height: 40 }}
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleResetToday}
                disabled={loading}
                sx={{ height: 40, textTransform: 'none', fontWeight: 700 }}
              >
                Today
              </Button>
            </Stack>

            <Box
              sx={{
                mt: 3,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 1.5
              }}
            >
              {summaryCards.map((card) => (
                <StatMetricCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
              ))}
            </Box>
          </Box>
        </SectionCard>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : displayedRows.length === 0 ? (
        <Alert severity="info">No successful feed uploads or end-listing stats found for this date and country.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5 }}>
          {displayedRows.map((row, index) => {
            const isPositive = row.netListings >= 0;
            const { targetQuantity, greenThreshold } = getSellerProgressConfig(row.sellerName);
            const usSuccessfulListings = getUsSuccessfulListings(row);
            const targetProgress = Math.min(100, Math.round((usSuccessfulListings / targetQuantity) * 100));
            const progress = Math.max(usSuccessfulListings > 0 ? 4 : 0, targetProgress);
            const isTargetMet = usSuccessfulListings >= greenThreshold;
            const marketplaceBreakdown = [...(row.marketplaces || [])]
              .filter(marketplace => (marketplace.successfulListings || 0) > 0 || (marketplace.endedListings || 0) > 0)
              .map(marketplace => ({
                ...marketplace,
                netListings: marketplace.netListings ?? ((marketplace.successfulListings || 0) - (marketplace.endedListings || 0)),
              }))
              .sort((a, b) => {
                const bTotal = (b.successfulListings || 0) + (b.endedListings || 0);
                const aTotal = (a.successfulListings || 0) + (a.endedListings || 0);
                return bTotal - aTotal;
              });
            return (
              <Card
                key={row.sellerId || row.sellerName}
                sx={{
                  borderRadius: `${dashboardSignatureTokens.radius.card}px`,
                  border: '1px solid',
                  borderColor: isPositive ? dashboardSignatureTokens.tones.success.border : dashboardSignatureTokens.tones.warning.border,
                  boxShadow: dashboardSignatureTokens.shadows.card,
                  minWidth: 0,
                  overflow: 'hidden',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: '0 0 auto 0',
                    height: 4,
                    backgroundColor: isPositive ? dashboardSignatureTokens.tones.success.border : dashboardSignatureTokens.tones.warning.border
                  }
                }}
              >
                <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        #{index + 1}
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={800} noWrap title={row.sellerName} sx={{ minWidth: 0 }}>
                        {row.sellerName}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={`${isPositive ? '+' : ''}${numberFmt.format(row.netListings)} net`}
                      color={isPositive ? 'success' : 'error'}
                      variant="outlined"
                      sx={{ height: 24, fontWeight: 700, flexShrink: 0 }}
                    />
                  </Stack>
                  <Divider sx={{ mb: 1.5 }} />
                  <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                    <StatBlock
                      icon={<CloudUploadIcon fontSize="small" />}
                      label={countryFilter === 'ALL' ? 'Successful' : 'Net'}
                      value={countryFilter === 'ALL' ? row.successfulListings : row.netListings}
                      tone={(countryFilter === 'ALL' || row.netListings >= 0) ? 'good' : 'bad'}
                    />
                    <StatBlock icon={<RemoveCircleOutlineIcon fontSize="small" />} label="Ended" value={row.endedListings} tone="bad" />
                  </Stack>
                  {marketplaceBreakdown.length > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 0.75 }}>
                        Marketplace breakdown
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.75}>
                        {marketplaceBreakdown.map((marketplace) => (
                          <Chip
                            key={marketplace.country}
                            size="small"
                            label={`${countryLabel(marketplace.country)} ${formatSignedNumber(marketplace.netListings || 0)}`}
                            sx={{
                              height: 24,
                              borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                              border: '1px solid',
                              borderColor: (marketplace.netListings || 0) >= 0
                                ? dashboardSignatureTokens.tones.success.border
                                : dashboardSignatureTokens.tones.warning.border,
                              backgroundColor: (marketplace.netListings || 0) >= 0
                                ? dashboardSignatureTokens.tones.success.background
                                : dashboardSignatureTokens.tones.warning.background,
                              color: (marketplace.netListings || 0) >= 0
                                ? dashboardSignatureTokens.tones.success.color
                                : dashboardSignatureTokens.tones.warning.color,
                              fontWeight: 700,
                              '& .MuiChip-label': { px: 1 }
                            }}
                          />
                        ))}
                      </Stack>
                      <Stack spacing={0.75} sx={{ mt: 1 }}>
                        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary" fontWeight={700}>
                            Successful
                          </Typography>
                          {marketplaceBreakdown.map((marketplace) => (
                            <Chip
                              key={`successful-${marketplace.country}`}
                              size="small"
                              label={`${countryLabel(marketplace.country)} ${numberFmt.format(marketplace.successfulListings || 0)}`}
                              sx={{
                                height: 22,
                                borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                                border: '1px solid',
                                borderColor: dashboardSignatureTokens.tones.success.border,
                                backgroundColor: dashboardSignatureTokens.tones.success.background,
                                color: dashboardSignatureTokens.tones.success.color,
                                fontWeight: 700,
                                '& .MuiChip-label': { px: 1 }
                              }}
                            />
                          ))}
                        </Stack>
                        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary" fontWeight={700}>
                            Ended
                          </Typography>
                          {marketplaceBreakdown.map((marketplace) => (
                            <Chip
                              key={`ended-${marketplace.country}`}
                              size="small"
                              label={`${countryLabel(marketplace.country)} ${numberFmt.format(marketplace.endedListings || 0)}`}
                              sx={{
                                height: 22,
                                borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                                border: '1px solid',
                                borderColor: dashboardSignatureTokens.tones.warning.border,
                                backgroundColor: dashboardSignatureTokens.tones.warning.background,
                                color: dashboardSignatureTokens.tones.warning.color,
                                fontWeight: 700,
                                '& .MuiChip-label': { px: 1 }
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                    </Box>
                  )}
                  <Box sx={{ mt: 1.75 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        US successful vs target
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${numberFmt.format(usSuccessfulListings)} / ${numberFmt.format(targetQuantity)}`}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={progress}
                      sx={{
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: 'action.hover',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 999,
                          backgroundColor: isTargetMet ? dashboardSignatureTokens.tones.success.color : 'error.main'
                        }
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
      </AdminPageShell>
    </Fade>
  );
}
