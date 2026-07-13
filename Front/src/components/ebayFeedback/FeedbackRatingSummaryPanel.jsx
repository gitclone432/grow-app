import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
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
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import GrowMentalityLoader from '../GrowMentalityLoader.jsx';
import {
  formatAverage,
  formatPercent,
  formatPeriodLabel,
  formatRatingType,
  parseApiError,
  sourceLabel,
} from '../../utils/ebayFeedback';

const ROLE_OPTIONS = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
];

const PERIOD_OPTIONS = [
  { value: '', label: 'Default period' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 365 days' },
];

export default function FeedbackRatingSummaryPanel({ sellerId, selectedSellerName, active }) {
  const [role, setRole] = useState('SELLER');
  const [periodDays, setPeriodDays] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');

  const [overview, setOverview] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [ebayUserId, setEbayUserId] = useState('');
  const [source, setSource] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const params = { sellerId, role };
      if (periodDays) params.periodDays = periodDays;
      if (userIdFilter.trim()) params.userId = userIdFilter.trim();

      const { data } = await api.get('/ebay/feedback/rating-summary', { params, timeout: 90000 });
      if (!data.success) throw new Error(data.error || 'Failed to load feedback rating summary');
      setOverview(data.overview || null);
      setRatings(Array.isArray(data.ratings) ? data.ratings : []);
      setPeriods(Array.isArray(data.periods) ? data.periods : []);
      setEbayUserId(data.seller?.ebayUserId || data.request?.userId || '');
      setSource(data.source || '');
      setWarning(data.warning || '');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load feedback rating summary'));
      setOverview(null);
      setRatings([]);
      setPeriods([]);
      setEbayUserId('');
      setSource('');
      setWarning('');
    } finally {
      setLoading(false);
    }
  }, [sellerId, role, periodDays, userIdFilter]);

  useEffect(() => {
    if (!active || !sellerId) return;
    void loadSummary();
  }, [active, sellerId, loadSummary]);

  useEffect(() => {
    setLoaded(false);
  }, [sellerId]);

  const resetFilters = () => {
    setRole('SELLER');
    setPeriodDays('');
    setUserIdFilter('');
  };

  if (!sellerId) {
    return <Alert severity="info">Select a seller to view the rating summary.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Period</InputLabel>
              <Select label="Period" value={periodDays} onChange={(e) => setPeriodDays(e.target.value)}>
                {PERIOD_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || '__default'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="eBay user ID (optional)"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder={ebayUserId || 'Defaults to seller'}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => void loadSummary()} disabled={loading}>
                Apply
              </Button>
              <Button variant="text" onClick={resetFilters} disabled={loading}>
                Reset
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {warning && !error ? <Alert severity="warning">{warning}</Alert> : null}

      {loading && !loaded && !error ? (
        <GrowMentalityLoader label="Loading summary…" minHeight={360} />
      ) : (
        <>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {overview?.feedbackScore != null ? (
              <Chip label={`Score: ${overview.feedbackScore}`} color="primary" />
            ) : null}
            {overview?.positiveFeedbackPercent != null ? (
              <Chip label={`${formatPercent(overview.positiveFeedbackPercent)} positive`} color="success" variant="outlined" />
            ) : null}
            {overview?.uniquePositive != null ? (
              <Chip label={`${overview.uniquePositive} positive`} variant="outlined" />
            ) : null}
            {overview?.uniqueNeutral != null ? (
              <Chip label={`${overview.uniqueNeutral} neutral`} variant="outlined" />
            ) : null}
            {overview?.uniqueNegative != null ? (
              <Chip label={`${overview.uniqueNegative} negative`} variant="outlined" />
            ) : null}
            {source ? <Chip size="small" label={sourceLabel(source)} variant="outlined" /> : null}
            {ebayUserId ? <Chip size="small" label={`eBay: ${ebayUserId}`} variant="outlined" /> : null}
            {selectedSellerName ? <Chip size="small" label={selectedSellerName} variant="outlined" /> : null}
          </Stack>

          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Detailed ratings</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Rating type</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Role</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Period</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Average</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Count</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">% Positive</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ratings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No detailed rating breakdown returned.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  ratings.map((row, idx) => (
                    <TableRow key={`${row.ratingType}-${row.period}-${idx}`} hover>
                      <TableCell>{formatRatingType(row.ratingType)}</TableCell>
                      <TableCell>{row.role || '—'}</TableCell>
                      <TableCell>{formatPeriodLabel(row.period)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(row.average)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.count ?? '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatPercent(row.positivePercent)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Feedback counts by period</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Type</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Period (days)</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No period breakdown returned.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  periods.map((row, idx) => (
                    <TableRow key={`${row.type}-${row.periodDays}-${idx}`} hover>
                      <TableCell>{row.type || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.periodDays ?? '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.count ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Stack>
  );
}
