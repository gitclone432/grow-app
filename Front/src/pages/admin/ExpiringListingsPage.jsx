import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Checkbox, Chip, CircularProgress,
  Alert, FormControl, InputLabel, Select, MenuItem, LinearProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  TablePagination, Tooltip, Avatar, IconButton, Stack, Fade, TextField,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import SearchIcon from '@mui/icons-material/Search';
import StopIcon from '@mui/icons-material/Stop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import TimerOffIcon from '@mui/icons-material/TimerOff';

import api, { getAuthToken } from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import {
  tableHeaderCellSx,
  tableBodyRowSx,
  tableBodyCellSx,
  tableContainerSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import { BRAND_DARK } from '../../constants/brandTheme.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatTimeLeft(h, m) {
  if (h === 0 && m === 0) return '< 1 min';
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function timeLeftTone(h) {
  if (h < 1) return dashboardSignatureTokens.tones.danger;
  if (h < 6) return dashboardSignatureTokens.tones.warning;
  return dashboardSignatureTokens.tones.info;
}

// ─── constants ────────────────────────────────────────────────────────────────

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

const COUNTRY_OPTIONS = [
  { value: 'ALL', label: 'All Countries' },
  { value: 'USD', label: '\uD83C\uDDFA\uD83C\uDDF8 eBay US' },
  { value: 'AUD', label: '\uD83C\uDDE6\uD83C\uDDFA eBay Australia' },
  { value: 'CAD', label: '\uD83C\uDDE8\uD83C\uDDE6 eBay Canada' },
  { value: 'GBP', label: '\uD83C\uDDEC\uD83C\uDDE7 eBay UK' },
];

const CURRENCY_TO_COUNTRY = {
  USD: 'US',
  AUD: 'AU',
  CAD: 'Canada',
  GBP: 'UK',
};

// ─── component ────────────────────────────────────────────────────────────────

export default function ExpiringListingsPage() {
  // ── data ──────────────────────────────────────────────────────────────────
  const [sellers, setSellers]               = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [fetching, setFetching]             = useState(false);
  const [listings, setListings]             = useState([]);
  const [fetchError, setFetchError]         = useState('');
  const [fetchWarning, setFetchWarning]     = useState('');
  const [fetchProgress, setFetchProgress]   = useState(null); // { page, totalPages, count }

  // ── selection — global across all pages ───────────────────────────────────
  const [selectedItems, setSelectedItems] = useState(new Set());

  // ── pagination ────────────────────────────────────────────────────────────
  const [tablePage, setTablePage]     = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // ── filters ───────────────────────────────────────────────────────────────
  const [hoursRange, setHoursRange]         = useState(24);
  const [countryFilter, setCountryFilter]   = useState('ALL');
  const [maxWatchers, setMaxWatchers]       = useState(5);
  const [maxViews, setMaxViews]             = useState(5);

  // ── ending ────────────────────────────────────────────────────────────────
  const [endingProgress, setEndingProgress] = useState(null);
  const [endingResults, setEndingResults]   = useState(null);

  const readerRef = useRef(null);

  // ── load sellers ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/sellers/all')
      .then(res => setSellers(Array.isArray(res.data) ? res.data : []))
      .catch(() =>
        api.get('/sellers/me')
          .then(res => setSellers(res.data ? [res.data] : []))
          .catch(() => {})
      );
  }, []);

  // ── SSE stop / fetch ──────────────────────────────────────────────────────
  const stopFetch = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    setFetching(false);
  }, []);

  const fetchListings = useCallback(async () => {
    if (!selectedSeller) return;
    setFetching(true);
    setFetchError('');
    setFetchWarning('');
    setListings([]);
    setFetchProgress(null);
    setSelectedItems(new Set());
    setEndingResults(null);
    setTablePage(0);

    try {
      const baseURL  = import.meta.env.VITE_API_URL;
      const token    = getAuthToken();
      const response = await fetch(
        `${baseURL}/ebay/expiring-low-activity-listings?sellerId=${selectedSeller}&hours=${hoursRange}&maxWatchers=${maxWatchers}&maxViews=${maxViews}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${response.status})`);
      }

      const reader  = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'progress') {
            setFetchProgress({ page: evt.page, totalPages: evt.totalPages, count: evt.count });
          } else if (evt.type === 'warning') {
            setFetchWarning(evt.warning || 'Some listing view data was unavailable.');
          } else if (evt.type === 'done') {
            setListings(evt.listings || []);
          } else if (evt.type === 'error') {
            throw new Error(evt.error);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !err.message?.includes('cancel')) {
        setFetchError(err.message || 'Failed to fetch from eBay');
      }
    } finally {
      readerRef.current = null;
      setFetching(false);
    }
  }, [selectedSeller, hoursRange, maxWatchers, maxViews]);

  // ── selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (itemId) =>
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });

  // client-side country filter
  const displayListings = countryFilter === 'ALL'
    ? listings
    : listings.filter(l => l.currency === countryFilter);

  // current page listings
  const pagedListings = displayListings.slice(tablePage * rowsPerPage, tablePage * rowsPerPage + rowsPerPage);

  // selection states scoped to the current page
  const allSelected  = pagedListings.length > 0 && pagedListings.every(l => selectedItems.has(l.itemId));
  const someSelected = pagedListings.some(l => selectedItems.has(l.itemId)) && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        pagedListings.forEach(l => next.delete(l.itemId));
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev);
        pagedListings.forEach(l => next.add(l.itemId));
        return next;
      });
    }
  };

  const selectAllDisplayedListings = () => {
    setSelectedItems(new Set(displayListings.map(l => l.itemId)));
  };

  // ── end listings ──────────────────────────────────────────────────────────
  const endSelectedListings = async () => {
    // Only end items that are visible in the current country filter —
    // never touch listings that belong to a different country.
    const itemsToEnd = displayListings.filter(l => selectedItems.has(l.itemId));
    if (!itemsToEnd.length) return;

    setEndingProgress({ total: itemsToEnd.length, done: 0, success: 0, failed: 0 });
    setEndingResults(null);
    const results = { success: [], failed: [] };

    for (const item of itemsToEnd) {
      try {
        await api.post('/ebay/end-item', {
          sellerId: selectedSeller,
          itemId: item.itemId,
          endingReason: 'NotAvailable',
          source: 'expiry_listing',
          country: CURRENCY_TO_COUNTRY[item.currency] || item.country || null,
          marketplaceId: item.marketplaceId || null,
        });
        results.success.push(item.itemId);
      } catch (err) {
        results.failed.push({
          itemId: item.itemId,
          title: item.title,
          error: err.response?.data?.error || err.message,
        });
      }
      setEndingProgress(prev => ({
        ...prev,
        done: prev.done + 1,
        success: results.success.length,
        failed: results.failed.length,
      }));
    }

    setListings(prev => prev.filter(l => !results.success.includes(l.itemId)));
    setSelectedItems(new Set());
    setEndingProgress(null);
    setEndingResults(results);
    setTablePage(0);
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const sellerName    = sellers.find(s => s._id === selectedSeller)?.user?.username || '';
  const pct           = fetchProgress && fetchProgress.totalPages > 0
    ? Math.round((fetchProgress.page / fetchProgress.totalPages) * 100)
    : 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Fade in timeout={500}>
      <AdminPageShell>

        {/* ── Header card ───────────────────────────────────────────────── */}
        <SectionCard
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            background: dashboardSignatureTokens.surfaces.pageCard,
          }}
        >
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
            gap={2}
          >
            <PageHeader
              title="Expiring Low-Activity Listings"
              subtitle={`Active listings expiring within ${hoursRange} h · up to ${maxWatchers} watchers · up to ${maxViews} views (30-day) · 0 sold.`}
              sx={{ pt: 0, pb: 0 }}
            />

            {listings.length > 0 && (
              <Chip
                icon={<TimerOffIcon />}
                label={countryFilter === 'ALL'
                  ? `${listings.length} expiring listing${listings.length !== 1 ? 's' : ''}`
                  : `${displayListings.length} / ${listings.length} listing${listings.length !== 1 ? 's' : ''}`}
                sx={{
                  height: 36,
                  px: 1,
                  fontWeight: 600,
                  borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                  border: '1px solid',
                  borderColor: dashboardSignatureTokens.tones.danger.border,
                  backgroundColor: dashboardSignatureTokens.tones.danger.background,
                  color: dashboardSignatureTokens.tones.danger.color,
                  '& .MuiChip-icon': { color: dashboardSignatureTokens.tones.danger.color },
                }}
              />
            )}
          </Stack>

          {/* Filters */}
          <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Time Range</InputLabel>
                <Select
                  value={hoursRange}
                  label="Time Range"
                  disabled={fetching}
                  onChange={e => {
                    setHoursRange(Number(e.target.value));
                    setListings([]);
                    setEndingResults(null);
                    setFetchError('');
                    setFetchWarning('');
                    setFetchProgress(null);
                    setSelectedItems(new Set());
                  }}
                >
                  {[24, 48, 72, 96].map(h => (
                    <MenuItem key={h} value={h}>{h} hours</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Max Watchers"
                type="number"
                size="small"
                disabled={fetching}
                value={maxWatchers}
                onChange={e => setMaxWatchers(Math.max(0, parseInt(e.target.value) || 0))}
                inputProps={{ min: 0 }}
                sx={{ width: 130 }}
              />

              <TextField
                label="Max Views"
                type="number"
                size="small"
                disabled={fetching}
                value={maxViews}
                onChange={e => setMaxViews(Math.max(0, parseInt(e.target.value) || 0))}
                inputProps={{ min: 0 }}
                sx={{ width: 130 }}
              />

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Country</InputLabel>
                <Select
                  value={countryFilter}
                  label="Country"
                  onChange={e => {
                    setCountryFilter(e.target.value);
                    setTablePage(0);
                    setSelectedItems(new Set());
                  }}
                >
                  {COUNTRY_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Select Seller</InputLabel>
                <Select
                  value={selectedSeller}
                  label="Select Seller"
                  disabled={fetching}
                  onChange={e => {
                    setSelectedSeller(e.target.value);
                    setListings([]);
                    setEndingResults(null);
                    setFetchError('');
                    setFetchWarning('');
                    setFetchProgress(null);
                    setSelectedItems(new Set());
                  }}
                >
                  {sellers.map(s => (
                    <MenuItem key={s._id} value={s._id}>
                      {s.user?.username || s._id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {!fetching ? (
                <Button
                  variant="contained"
                  startIcon={<SearchIcon />}
                  onClick={fetchListings}
                  disabled={!selectedSeller}
                  sx={{ ...yellowFilledButtonSx, height: 40 }}
                >
                  Fetch Expiring Listings
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<StopIcon />}
                  onClick={stopFetch}
                  sx={{ ...yellowOutlinedButtonSx, height: 40 }}
                >
                  Stop
                </Button>
              )}
            </Stack>

            {/* SSE progress bar */}
            {fetching && (
              <Box mt={2.5}>
                {fetchProgress ? (
                  <>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Typography variant="caption" color="text.secondary">
                        Page <strong>{fetchProgress.page}</strong> of <strong>{fetchProgress.totalPages}</strong>
                        &nbsp;·&nbsp;
                        <strong>{fetchProgress.count}</strong> match{fetchProgress.count !== 1 ? 'es' : ''} so far
                      </Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        {pct}%
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={pct} sx={{ borderRadius: 2, height: 6 }} />
                  </>
                ) : (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                      Connecting to eBay…
                    </Typography>
                    <LinearProgress sx={{ borderRadius: 2, height: 6 }} />
                  </>
                )}
              </Box>
            )}
          </Box>
        </SectionCard>

        {/* ── Fetch error ───────────────────────────────────────────────── */}
        {fetchError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFetchError('')}>
            {fetchError}
          </Alert>
        )}

        {fetchWarning && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setFetchWarning('')}>
            {fetchWarning}
          </Alert>
        )}

        {/* ── End-listing progress ──────────────────────────────────────── */}
        {endingProgress && (
          <SectionCard sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="body2" fontWeight={600} mb={1}>
              Ending listings… {endingProgress.done}/{endingProgress.total}
              &nbsp;({endingProgress.success} succeeded, {endingProgress.failed} failed)
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(endingProgress.done / endingProgress.total) * 100}
              sx={{ borderRadius: 2, height: 8 }}
            />
          </SectionCard>
        )}

        {/* ── End results ───────────────────────────────────────────────── */}
        {endingResults && (
          <Stack spacing={1} mb={2}>
            {endingResults.success.length > 0 && (
              <Alert severity="success">
                Successfully ended {endingResults.success.length} listing{endingResults.success.length !== 1 ? 's' : ''}.
              </Alert>
            )}
            {endingResults.failed.length > 0 && (
              <Alert severity="error">
                Failed to end {endingResults.failed.length} listing{endingResults.failed.length !== 1 ? 's' : ''}:
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {endingResults.failed.map(f => (
                    <li key={f.itemId}>
                      <strong>{f.itemId}</strong> — {f.error}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
          </Stack>
        )}

        {/* ── Table card ────────────────────────────────────────────────── */}
        {displayListings.length > 0 && (
          <SectionCard>
            {/* Action bar */}
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
              gap={1.5}
              sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  <strong style={{ color: BRAND_DARK }}>{displayListings.length}</strong>{' '}
                  listing{displayListings.length !== 1 ? 's' : ''}
                  {countryFilter !== 'ALL' && listings.length !== displayListings.length && (
                    <> of <strong style={{ color: BRAND_DARK }}>{listings.length}</strong> total</>
                  )}
                  {sellerName && (
                    <> for <strong style={{ color: BRAND_DARK }}>{sellerName}</strong></>
                  )}
                </Typography>
                {selectedItems.size > 0 && (
                  <Chip
                    size="small"
                    label={`${selectedItems.size} selected`}
                    sx={{
                      fontWeight: 600,
                      borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                      border: '1px solid',
                      borderColor: dashboardSignatureTokens.tones.warning.border,
                      backgroundColor: dashboardSignatureTokens.tones.warning.background,
                      color: dashboardSignatureTokens.tones.warning.color,
                    }}
                  />
                )}
              </Stack>

              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<HighlightOffIcon />}
                onClick={endSelectedListings}
                disabled={selectedItems.size === 0 || !!endingProgress}
                sx={{ height: 36, textTransform: 'none', fontWeight: 600 }}
              >
                End {selectedItems.size > 0 ? `${selectedItems.size} ` : ''}Selected
                {selectedItems.size !== 1 ? ' Listings' : ' Listing'}
              </Button>
            </Box>

            {/* Cross-page "select all" helper banner */}
            {selectedItems.size > 0 && selectedItems.size < displayListings.length && (
              <Box
                sx={{
                  px: 2.5,
                  py: 1,
                  bgcolor: alpha(BRAND_DARK, 0.04),
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  flexWrap: 'wrap',
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {selectedItems.size} of {displayListings.length} listings selected.
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={selectAllDisplayedListings}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', p: 0, minWidth: 0 }}
                >
                  Select all {displayListings.length}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={() => setSelectedItems(new Set())}
                  sx={{ textTransform: 'none', fontSize: '0.78rem', p: 0, minWidth: 0, color: 'text.secondary' }}
                >
                  Clear
                </Button>
              </Box>
            )}

            {/* Table */}
            <TableContainer
              sx={{ ...tableContainerSx, borderRadius: 0, border: 'none', boxShadow: 'none' }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ ...tableHeaderCellSx, width: 52 }}>
                      <Checkbox
                        size="small"
                        indeterminate={someSelected}
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        sx={{
                          color: 'rgba(255,255,255,0.65)',
                          '&.Mui-checked': { color: '#fff' },
                          '&.MuiCheckbox-indeterminate': { color: 'rgba(255,255,255,0.85)' },
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, width: 60 }}>Image</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Title / SKU</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Item ID</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }} align="right">Price</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }} align="center">
                      <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                        <AccessTimeIcon sx={{ fontSize: 14 }} /> Time Left
                      </Box>
                    </TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }} align="center">
                      <Tooltip title="Watchers">
                        <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                          <BookmarkBorderIcon sx={{ fontSize: 14 }} /> Watchers
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }} align="center">
                      <Tooltip title="Views in last 30 days">
                        <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                          <VisibilityIcon sx={{ fontSize: 14 }} /> Views (30d)
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }} align="center">Sold</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx }}>Category</TableCell>
                    <TableCell sx={{ ...tableHeaderCellSx, width: 44 }} />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {pagedListings.map(listing => {
                    const isSelected = selectedItems.has(listing.itemId);
                    const tone = timeLeftTone(listing.hoursLeft);

                    return (
                      <TableRow
                        key={listing.itemId}
                        hover
                        selected={isSelected}
                        sx={{ ...tableBodyRowSx, cursor: 'pointer' }}
                        onClick={() => toggleSelect(listing.itemId)}
                      >
                        {/* Checkbox */}
                        <TableCell
                          padding="checkbox"
                          sx={{ ...tableBodyCellSx }}
                          onClick={e => e.stopPropagation()}
                        >
                          <Checkbox
                            size="small"
                            checked={isSelected}
                            onChange={() => toggleSelect(listing.itemId)}
                          />
                        </TableCell>

                        {/* Image */}
                        <TableCell sx={{ ...tableBodyCellSx }}>
                          <Avatar
                            src={listing.mainImageUrl}
                            variant="rounded"
                            sx={{
                              width: 44,
                              height: 44,
                              borderRadius: 1.5,
                              border: '1px solid',
                              borderColor: alpha(BRAND_DARK, 0.1),
                            }}
                          >
                            ?
                          </Avatar>
                        </TableCell>

                        {/* Title / SKU */}
                        <TableCell sx={{ ...tableBodyCellSx, maxWidth: 300 }}>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            noWrap
                            title={listing.title}
                            sx={{ color: BRAND_DARK }}
                          >
                            {listing.title}
                          </Typography>
                          {listing.sku && (
                            <Typography variant="caption" color="text.secondary">
                              SKU: {listing.sku}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Item ID */}
                        <TableCell sx={{ ...tableBodyCellSx }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: 'monospace' }}
                          >
                            {listing.itemId}
                          </Typography>
                        </TableCell>

                        {/* Price */}
                        <TableCell sx={{ ...tableBodyCellSx }} align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ color: BRAND_DARK }}>
                            {listing.currency !== 'USD'
                              ? `${listing.currency} ${listing.currentPrice?.toFixed(2)}`
                              : `$${listing.currentPriceUSD?.toFixed(2)}`}
                          </Typography>
                          {listing.currency !== 'USD' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              ≈ ${listing.currentPriceUSD?.toFixed(2)}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Time left */}
                        <TableCell sx={{ ...tableBodyCellSx }} align="center">
                          <Chip
                            icon={<AccessTimeIcon />}
                            label={formatTimeLeft(listing.hoursLeft, listing.minutesLeft)}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                              border: '1px solid',
                              borderColor: tone.border,
                              backgroundColor: tone.background,
                              color: tone.color,
                              '& .MuiChip-icon': { color: tone.color },
                            }}
                          />
                        </TableCell>

                        {/* Watchers */}
                        <TableCell sx={{ ...tableBodyCellSx }} align="center">
                          <Chip
                            label={listing.watchCount}
                            size="small"
                            sx={{
                              fontWeight: 600,
                              minWidth: 32,
                              borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                              border: '1px solid',
                              ...(listing.watchCount === 0
                                ? {
                                    borderColor: dashboardSignatureTokens.tones.neutral.border,
                                    backgroundColor: dashboardSignatureTokens.tones.neutral.background,
                                    color: dashboardSignatureTokens.tones.neutral.color,
                                  }
                                : {
                                    borderColor: dashboardSignatureTokens.tones.warning.border,
                                    backgroundColor: dashboardSignatureTokens.tones.warning.background,
                                    color: dashboardSignatureTokens.tones.warning.color,
                                  }),
                            }}
                          />
                        </TableCell>

                        {/* Views */}
                        <TableCell sx={{ ...tableBodyCellSx }} align="center">
                          <Chip
                            label={listing.hitCount}
                            size="small"
                            sx={{
                              fontWeight: 600,
                              minWidth: 32,
                              borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
                              border: '1px solid',
                              ...(listing.hitCount === 0
                                ? {
                                    borderColor: dashboardSignatureTokens.tones.neutral.border,
                                    backgroundColor: dashboardSignatureTokens.tones.neutral.background,
                                    color: dashboardSignatureTokens.tones.neutral.color,
                                  }
                                : {
                                    borderColor: dashboardSignatureTokens.tones.info.border,
                                    backgroundColor: dashboardSignatureTokens.tones.info.background,
                                    color: dashboardSignatureTokens.tones.info.color,
                                  }),
                            }}
                          />
                        </TableCell>

                        {/* Sold */}
                        <TableCell sx={{ ...tableBodyCellSx }} align="center">
                          <Typography variant="body2" fontWeight={600} color="text.secondary">
                            {listing.quantitySold}
                          </Typography>
                        </TableCell>

                        {/* Category */}
                        <TableCell sx={{ ...tableBodyCellSx }}>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {listing.categoryName || '—'}
                          </Typography>
                        </TableCell>

                        {/* eBay link */}
                        <TableCell
                          sx={{ ...tableBodyCellSx }}
                          onClick={e => e.stopPropagation()}
                        >
                          <Tooltip title="View on eBay">
                            <IconButton
                              size="small"
                              component="a"
                              href={`https://www.ebay.com/itm/${listing.itemId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination controls */}
            <TablePagination
              component="div"
              count={displayListings.length}
              page={tablePage}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
              onPageChange={(_, newPage) => setTablePage(newPage)}
              onRowsPerPageChange={e => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setTablePage(0);
              }}
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                '& .MuiTablePagination-toolbar': { px: 2.5 },
              }}
            />
          </SectionCard>
        )}

        {/* ── Country filter empty state ─────────────────────────────────────────────── */}
        {!fetching && !fetchError && listings.length > 0 && displayListings.length === 0 && (
          <SectionCard
            sx={{
              p: 5,
              textAlign: 'center',
              background: dashboardSignatureTokens.surfaces.emptyState,
            }}
          >
            <TimerOffIcon sx={{ fontSize: 48, color: alpha(BRAND_DARK, 0.16), mb: 2 }} />
            <Typography variant="h6" fontWeight={600} color="text.secondary" gutterBottom>
              No listings for this country
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {listings.length} listing{listings.length !== 1 ? 's' : ''} fetched, but none match the selected country filter.
            </Typography>
          </SectionCard>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────────────────────── */}
        {!fetching && !fetchError && listings.length === 0 && selectedSeller && !fetchProgress && (
          <SectionCard
            sx={{
              p: 6,
              textAlign: 'center',
              background: dashboardSignatureTokens.surfaces.emptyState,
            }}
          >
            <TimerOffIcon sx={{ fontSize: 52, color: alpha(BRAND_DARK, 0.16), mb: 2 }} />
            <Typography variant="h6" fontWeight={600} color="text.secondary" gutterBottom>
              No expiring low-activity listings found
            </Typography>
            <Typography variant="body2" color="text.disabled">
              No active listings match: expiring within {hoursRange} h · watchers ≤ {maxWatchers} · views ≤ {maxViews} · sold = 0
            </Typography>
          </SectionCard>
        )}

      </AdminPageShell>
    </Fade>
  );
}
