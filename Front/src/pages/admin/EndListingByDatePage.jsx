import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Fade,
  FormControl,
  InputLabel,
  MenuItem,
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
  Tooltip,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';

import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import { BRAND_DARK } from '../../constants/brandTheme.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx
} from '../../theme/tableStyles.js';

const T = dashboardSignatureTokens;

// Matches the country names Amazon Stock Check runs are tagged with
// (server COUNTRY_CONFIG), which is what EndListingLog.country stores.
const COUNTRY_OPTIONS = ['United States', 'Australia', 'Canada', 'United Kingdom'];

// All dates on this page are computed and displayed in Pacific time (covers
// PST/PDT automatically), same convention used across the Fulfillment
// Dashboard and other eBay-parameter pages.
const getPTDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export default function EndListingByDatePage() {
  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [dateMode, setDateMode] = useState('single');
  const [selectedDate, setSelectedDate] = useState(() => getPTDate());
  const [startDate, setStartDate] = useState(() => getPTDate(-7));
  const [endDate, setEndDate] = useState(() => getPTDate());
  const [days, setDays] = useState(null);
  const [expandedDays, setExpandedDays] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchGenRef = useRef(0);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (sellerFilter !== 'all') params.sellerId = sellerFilter;
      if (countryFilter !== 'all') params.country = countryFilter;
      if (dateMode === 'single') {
        params.startDate = selectedDate;
        params.endDate = selectedDate;
      } else {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const { data } = await api.get('/end-listing-logs/by-date', { params });
      if (gen !== fetchGenRef.current) return;
      setDays(data.days || []);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err?.response?.data?.error || 'Failed to load end-listing activity.');
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [sellerFilter, countryFilter, dateMode, selectedDate, startDate, endDate]);

  // Auto-refetch whenever a filter changes — selecting a date (or switching
  // single/range) immediately shows the result, no separate "Apply" click.
  useEffect(() => { loadData(); }, [loadData]);

  const toggleDay = (day) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const grandTotal = (days || []).reduce((sum, entry) => sum + entry.totalItemsEnded, 0);

  return (
    <Fade in timeout={500}>
      <AdminPageShell>
        <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3, background: T.surfaces.pageCard }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            gap={2}
          >
            <PageHeader
              title="End Listing By Date"
              subtitle="Amazon Stock Check end-listing activity — by date (Pacific time), seller, country, and who ended them."
              sx={{ pt: 0, pb: 0 }}
            />
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} thickness={5} sx={{ color: BRAND_DARK }} /> : <RefreshIcon />}
              onClick={loadData}
              disabled={loading}
              sx={yellowFilledButtonSx}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={dateMode}
              onChange={(_, v) => { if (v) setDateMode(v); }}
            >
              <ToggleButton value="single">Single Date</ToggleButton>
              <ToggleButton value="range">Date Range</ToggleButton>
            </ToggleButtonGroup>

            {dateMode === 'single' ? (
              <TextField
                label="Date (PT)"
                type="date"
                size="small"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 170 }}
              />
            ) : (
              <>
                <TextField
                  label="Start Date (PT)"
                  type="date"
                  size="small"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <TextField
                  label="End Date (PT)"
                  type="date"
                  size="small"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
              </>
            )}

            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Seller</InputLabel>
              <Select label="Seller" value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
                <MenuItem value="all">All Sellers</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>{s.user?.username || s.user?.email || s._id}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Country</InputLabel>
              <Select label="Country" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
                <MenuItem value="all">All Countries</MenuItem>
                {COUNTRY_OPTIONS.map((country) => (
                  <MenuItem key={country} value={country}>{country}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </SectionCard>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && !days && (
          <SectionCard sx={{ p: 5, textAlign: 'center', background: T.surfaces.emptyState }}>
            <CircularProgress size={22} />
          </SectionCard>
        )}

        {days && (
          <SectionCard sx={{ p: { xs: 2, md: 3 }, background: T.surfaces.pageCard }}>
            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Box sx={{ flex: 1, p: 1.6, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, bgcolor: T.surfaces.metricCard }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>Days With Activity</Typography>
                  <Typography variant="h5" fontWeight={900} sx={{ color: BRAND_DARK }}>
                    {formatNumber(days.length)}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, p: 1.6, borderRadius: 2, border: `1px solid ${T.tones.danger.border}`, bgcolor: T.tones.danger.background }}>
                  <Typography variant="caption" sx={{ color: T.tones.danger.color }} fontWeight={700}>Total Items Ended</Typography>
                  <Typography variant="h5" fontWeight={900} sx={{ color: T.tones.danger.color }}>
                    {formatNumber(grandTotal)}
                  </Typography>
                </Box>
              </Stack>

              {!days.length ? (
                <Box py={5} textAlign="center">
                  <Typography color="text.secondary">No end-listing activity found for the selected filters.</Typography>
                </Box>
              ) : (
                <TableContainer sx={tableContainerSx}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ ...tableHeaderCellSx, width: 40 }} />
                        <TableCell sx={tableHeaderCellSx}>Date (PT)</TableCell>
                        <TableCell align="right" sx={tableHeaderCellSx}>Sellers Involved</TableCell>
                        <TableCell align="right" sx={tableHeaderCellSx}>People Involved</TableCell>
                        <TableCell align="right" sx={tableHeaderCellSx}>Items Ended</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {days.map((entry) => {
                        const expanded = expandedDays.has(entry.day);
                        const sellerCount = new Set(entry.breakdown.map((row) => row.sellerId)).size;
                        const personCount = new Set(entry.breakdown.map((row) => row.endedById)).size;
                        return (
                          <Fragment key={entry.day}>
                            <TableRow
                              hover
                              onClick={() => toggleDay(entry.day)}
                              sx={{ ...tableBodyRowSx, cursor: 'pointer' }}
                            >
                              <TableCell sx={tableBodyCellSx}>
                                {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                              </TableCell>
                              <TableCell sx={tableBodyCellSx}>
                                <Typography fontWeight={800} sx={{ color: BRAND_DARK }}>{entry.day}</Typography>
                              </TableCell>
                              <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(sellerCount)}</TableCell>
                              <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(personCount)}</TableCell>
                              <TableCell align="right" sx={tableBodyCellSx}>
                                <Chip size="small" color="error" label={formatNumber(entry.totalItemsEnded)} sx={{ fontWeight: 800 }} />
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                                <Collapse in={expanded} timeout="auto" unmountOnExit>
                                  <Box sx={{ p: 2, background: '#f8fafc' }}>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Seller</TableCell>
                                          <TableCell>Country</TableCell>
                                          <TableCell>Ended By</TableCell>
                                          <TableCell align="right">Items Ended</TableCell>
                                          <TableCell>Item IDs</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {entry.breakdown.map((row) => (
                                          <TableRow key={`${row.sellerId}-${row.endedById}-${row.country}`}>
                                            <TableCell sx={{ fontWeight: 700 }}>{row.sellerName}</TableCell>
                                            <TableCell>
                                              <Chip size="small" variant="outlined" label={row.country || 'Unknown'} />
                                            </TableCell>
                                            <TableCell>{row.endedByName}</TableCell>
                                            <TableCell align="right">
                                              <Chip size="small" label={formatNumber(row.count)} sx={{ fontWeight: 800 }} />
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 420 }}>
                                              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                {row.itemIds.slice(0, 8).map((id) => (
                                                  <Chip
                                                    key={id}
                                                    size="small"
                                                    variant="outlined"
                                                    label={id}
                                                    sx={{ fontFamily: 'monospace' }}
                                                  />
                                                ))}
                                                {row.itemIds.length > 8 && (
                                                  <Tooltip title={row.itemIds.slice(8).join(', ')}>
                                                    <Chip size="small" label={`+${row.itemIds.length - 8} more`} />
                                                  </Tooltip>
                                                )}
                                              </Stack>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          </SectionCard>
        )}
      </AdminPageShell>
    </Fade>
  );
}
