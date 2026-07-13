import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  Link,
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
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import api from '../../lib/api';
import GrowMentalityLoader from '../GrowMentalityLoader.jsx';
import {
  PAGE_SIZES,
  ebayListingUrl,
  formatDate,
  parseApiError,
  sourceLabel,
} from '../../utils/ebayFeedback';

const FEEDBACK_TYPE_OPTIONS = [
  { value: 'FEEDBACK_RECEIVED_AS_SELLER', label: 'Received as seller' },
  { value: 'FEEDBACK_RECEIVED_AS_BUYER', label: 'Received as buyer' },
  { value: 'FEEDBACK_RECEIVED', label: 'Received (buyer + seller)' },
  { value: 'FEEDBACK_LEFT', label: 'Left by seller' },
];

const COMMENT_TYPE_OPTIONS = [
  { value: '', label: 'All ratings' },
  { value: 'Positive', label: 'Positive' },
  { value: 'Negative', label: 'Negative' },
  { value: 'Neutral', label: 'Neutral' },
];

const PERIOD_OPTIONS = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 365 days' },
];

const COMMENT_COLORS = {
  POSITIVE: 'success',
  NEGATIVE: 'error',
  NEUTRAL: 'default',
};

function commentColor(type) {
  return COMMENT_COLORS[String(type || '').toUpperCase()] || 'default';
}

export default function FeedbackListPanel({ sellerId, selectedSellerName, active }) {
  const [feedbackType, setFeedbackType] = useState('FEEDBACK_RECEIVED_AS_SELLER');
  const [commentType, setCommentType] = useState('');
  const [periodDays, setPeriodDays] = useState('');
  const [listingIdFilter, setListingIdFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [offset, setOffset] = useState(0);

  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [ebayUserId, setEbayUserId] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadFeedback = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const params = { sellerId, feedbackType, limit: pageSize, offset };
      if (commentType) params.commentType = commentType;
      if (periodDays) params.periodDays = periodDays;
      if (listingIdFilter.trim()) params.listingId = listingIdFilter.trim();
      if (userIdFilter.trim()) params.userId = userIdFilter.trim();

      const { data } = await api.get('/ebay/feedback/list', { params, timeout: 90000 });
      if (!data.success) throw new Error(data.error || 'Failed to load feedback');
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setSummary(data.summary || null);
      setEbayUserId(data.seller?.ebayUserId || data.request?.userId || '');
      setSource(data.source || '');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load feedback'));
      setEntries([]);
      setSummary(null);
      setEbayUserId('');
      setSource('');
    } finally {
      setLoading(false);
    }
  }, [sellerId, feedbackType, commentType, periodDays, listingIdFilter, userIdFilter, pageSize, offset]);

  useEffect(() => {
    if (!active || !sellerId) return;
    void loadFeedback();
  }, [active, sellerId, loadFeedback]);

  useEffect(() => {
    setLoaded(false);
    setOffset(0);
  }, [sellerId]);

  const resetFilters = () => {
    setFeedbackType('FEEDBACK_RECEIVED_AS_SELLER');
    setCommentType('');
    setPeriodDays('');
    setListingIdFilter('');
    setUserIdFilter('');
    setPageSize(25);
    setOffset(0);
  };

  const totalCount = summary?.total ?? entries.length;
  const pageStart = totalCount === 0 ? 0 : offset + 1;
  const pageEnd = offset + entries.length;
  const hasPrev = offset > 0;
  const hasNext = entries.length >= pageSize;

  if (!sellerId) {
    return <Alert severity="info">Select a seller to view feedback history.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Feedback type</InputLabel>
              <Select
                label="Feedback type"
                value={feedbackType}
                onChange={(e) => { setFeedbackType(e.target.value); setOffset(0); }}
              >
                {FEEDBACK_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Rating</InputLabel>
              <Select label="Rating" value={commentType} onChange={(e) => { setCommentType(e.target.value); setOffset(0); }}>
                {COMMENT_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || '__all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Period</InputLabel>
              <Select label="Period" value={periodDays} onChange={(e) => { setPeriodDays(e.target.value); setOffset(0); }}>
                {PERIOD_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || '__all'} value={opt.value}>{opt.label}</MenuItem>
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
            <TextField
              fullWidth
              size="small"
              label="Listing ID filter"
              value={listingIdFilter}
              onChange={(e) => setListingIdFilter(e.target.value)}
              placeholder="Optional"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Page size</InputLabel>
              <Select
                label="Page size"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}
              >
                {PAGE_SIZES.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => { setOffset(0); void loadFeedback(); }} disabled={loading}>
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

      {loading && !loaded && !error ? (
        <GrowMentalityLoader label="Loading feedback…" minHeight={360} />
      ) : (
        <>
          {summary ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Showing ${pageStart}–${pageEnd}${totalCount ? ` of ${totalCount}` : ''}`} variant="outlined" />
              {summary.feedbackScore != null ? (
                <Chip label={`Score: ${summary.feedbackScore}`} color="primary" variant="outlined" />
              ) : null}
              {summary.positiveFeedbackPercent != null ? (
                <Chip label={`${summary.positiveFeedbackPercent}% positive`} color="success" variant="outlined" />
              ) : null}
              {source ? <Chip size="small" label={sourceLabel(source)} variant="outlined" /> : null}
              {ebayUserId ? <Chip size="small" label={`eBay: ${ebayUserId}`} variant="outlined" /> : null}
              {selectedSellerName ? <Chip size="small" label={selectedSellerName} variant="outlined" /> : null}
            </Stack>
          ) : null}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Date</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Rating</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>From</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Comment</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Listing</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Title</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Response</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No feedback entries for this seller and filters.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const listingId = entry.listingId || '';
                    const listingUrl = ebayListingUrl(listingId);
                    const rowKey = entry.feedbackId || `${listingId}-${entry.commentTime}-${entry.userName}`;
                    return (
                      <TableRow key={rowKey} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(entry.commentTime)}</TableCell>
                        <TableCell>
                          <Chip size="small" label={entry.commentType || '—'} color={commentColor(entry.commentType)} />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.userName || '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 360 }}>
                          <Tooltip title={entry.commentText || ''} placement="top-start">
                            <Typography
                              variant="body2"
                              sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                              {entry.commentText || '—'}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {listingUrl ? (
                            <Link href={listingUrl} target="_blank" rel="noopener noreferrer">{listingId}</Link>
                          ) : (listingId || '—')}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Typography variant="body2" noWrap title={entry.title || ''}>{entry.title || '—'}</Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 200 }}>
                          <Typography variant="caption" color="text.secondary" noWrap title={entry.response || ''}>
                            {entry.response || '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" justifyContent="flex-end">
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                startIcon={<ChevronLeftIcon />}
                disabled={!hasPrev || loading}
                onClick={() => setOffset((prev) => Math.max(0, prev - pageSize))}
              >
                Previous
              </Button>
              <Button
                size="small"
                endIcon={<ChevronRightIcon />}
                disabled={!hasNext || loading}
                onClick={() => setOffset((prev) => prev + pageSize)}
              >
                Next
              </Button>
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
}
