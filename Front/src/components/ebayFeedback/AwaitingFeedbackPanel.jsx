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
  formatMoney,
  parseApiError,
  pickEndDate,
  pickListingId,
  pickOrderLineItemId,
  pickPartner,
  pickRole,
  pickTitle,
  sourceLabel,
} from '../../utils/ebayFeedback';

const ROLE_OPTIONS = [
  { value: 'SELLER', label: 'Seller (sold, feedback not left)' },
  { value: 'BUYER', label: 'Buyer (purchased, feedback not left)' },
  { value: 'ALL', label: 'All roles' },
];

const SORT_OPTIONS = [
  { value: '', label: 'Default (end time, newest first)' },
  { value: 'EndTimeDescending', label: 'End time (newest)' },
  { value: 'EndTime', label: 'End time (oldest)' },
  { value: 'Title', label: 'Title (A–Z)' },
  { value: 'TitleDescending', label: 'Title (Z–A)' },
  { value: 'UserID', label: 'Partner user ID (A–Z)' },
  { value: 'UserIDDescending', label: 'Partner user ID (Z–A)' },
];

export default function AwaitingFeedbackPanel({ sellerId, selectedSellerName, active }) {
  const [role, setRole] = useState('SELLER');
  const [sort, setSort] = useState('');
  const [listingIdFilter, setListingIdFilter] = useState('');
  const [userNameFilter, setUserNameFilter] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [offset, setOffset] = useState(0);

  const [lineItems, setLineItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadItems = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const params = { sellerId, role, limit: pageSize, offset };
      if (sort) params.sort = sort;
      if (listingIdFilter.trim()) params.listingId = listingIdFilter.trim();
      if (userNameFilter.trim()) params.userName = userNameFilter.trim();

      const { data } = await api.get('/ebay/feedback/awaiting', { params, timeout: 90000 });
      if (!data.success) throw new Error(data.error || 'Failed to load awaiting feedback');
      setLineItems(Array.isArray(data.lineItems) ? data.lineItems : []);
      setSummary(data.summary || null);
      setSource(data.source || '');
      setLoaded(true);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load awaiting feedback'));
      setLineItems([]);
      setSummary(null);
      setSource('');
    } finally {
      setLoading(false);
    }
  }, [sellerId, role, sort, listingIdFilter, userNameFilter, pageSize, offset]);

  useEffect(() => {
    if (!active || !sellerId) return;
    void loadItems();
  }, [active, sellerId, loadItems]);

  useEffect(() => {
    setLoaded(false);
    setOffset(0);
  }, [sellerId]);

  const resetFilters = () => {
    setRole('SELLER');
    setSort('');
    setListingIdFilter('');
    setUserNameFilter('');
    setPageSize(25);
    setOffset(0);
  };

  const totalCount = summary?.total ?? lineItems.length;
  const pageStart = totalCount === 0 ? 0 : offset + 1;
  const pageEnd = offset + lineItems.length;
  const hasPrev = offset > 0;
  const hasNext = lineItems.length >= pageSize;

  if (!sellerId) {
    return <Alert severity="info">Select a seller to view items awaiting feedback.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select label="Role" value={role} onChange={(e) => { setRole(e.target.value); setOffset(0); }}>
                {ROLE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort</InputLabel>
              <Select label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setOffset(0); }}>
                {SORT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || '__default'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
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
            <TextField
              fullWidth
              size="small"
              label="Partner username filter"
              value={userNameFilter}
              onChange={(e) => setUserNameFilter(e.target.value)}
              placeholder="Optional"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => { setOffset(0); void loadItems(); }} disabled={loading}>
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
        <GrowMentalityLoader label="Loading awaiting feedback…" minHeight={360} />
      ) : (
        <>
          {summary ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {summary.sellerCount != null ? (
                <Chip label={`Seller role: ${summary.sellerCount}`} color="primary" variant="outlined" />
              ) : null}
              {summary.buyerCount != null ? (
                <Chip label={`Buyer role: ${summary.buyerCount}`} variant="outlined" />
              ) : null}
              <Chip label={`Showing ${pageStart}–${pageEnd}${totalCount ? ` of ${totalCount}` : ''}`} variant="outlined" />
              {source ? <Chip size="small" label={sourceLabel(source)} variant="outlined" /> : null}
              {selectedSellerName ? <Chip label={selectedSellerName} size="small" variant="outlined" /> : null}
            </Stack>
          ) : null}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Listing</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Title</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Partner</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Role</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">Price</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Ended</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Line item ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No items awaiting feedback for this seller and filters.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map((item, idx) => {
                    const listingId = pickListingId(item);
                    const listingUrl = ebayListingUrl(listingId);
                    const rowKey = pickOrderLineItemId(item) !== '—'
                      ? pickOrderLineItemId(item)
                      : `${listingId}-${idx}`;
                    return (
                      <TableRow key={rowKey} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {listingUrl ? (
                            <Link href={listingUrl} target="_blank" rel="noopener noreferrer">{listingId}</Link>
                          ) : (listingId || '—')}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Typography variant="body2" noWrap title={pickTitle(item)}>{pickTitle(item)}</Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{pickPartner(item)}</TableCell>
                        <TableCell><Chip size="small" label={pickRole(item)} variant="outlined" /></TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(item.price || item.transactionPrice || item.item?.price)}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(pickEndDate(item))}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 180 }}>
                          <Typography variant="caption" noWrap title={pickOrderLineItemId(item)}>
                            {pickOrderLineItemId(item)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              Feedback must be left within 60 days of the transaction.
            </Typography>
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
