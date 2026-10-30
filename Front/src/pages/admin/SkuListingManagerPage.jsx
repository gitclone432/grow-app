import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  LinearProgress,
  Link,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import api from '../../lib/api';
import PageHeader from '../../components/PageHeader';
import AsinReviewModal from '../../components/AsinReviewModal';
import ListingThumb from '../../components/ListingThumb';
import usePageAccess from '../../hooks/usePageAccess';
import OrderSparkline from '../../components/OrderSparkline';
import { BRAND_DARK } from '../../constants/brandTheme';

// Amazon marketplace domain per currency, so a row's ASIN links to the
// marketplace the listing actually sells on.
const AMAZON_DOMAINS = { USD: 'com', AUD: 'com.au', CAD: 'ca', GBP: 'co.uk' };

// The SKU index stores a currency, not a country, but EndListingLog records a
// country — mapping it here keeps the country breakdown on End Listing Stats
// populated instead of filing these ends under "Unknown".
const END_LISTING_COUNTRIES = { USD: 'US', GBP: 'UK', AUD: 'AU', CAD: 'Canada' };

// Seller blocks alternate between plain white and light grey. A popular SKU
// stacks a dozen sellers down the page, and with every card white on white the
// eye had nothing to anchor on when scanning from one seller's last listing to
// the next seller's first. Two neutral bands fix that without colouring the
// page — the listing rows stay white on both, so the data keeps the contrast.
const SELLER_BANDS = [
  { accent: '#94a3b8', header: '#f8fafc', body: '#ffffff', border: '#cbd5e1' }, // white band
  { accent: '#334155', header: '#e2e8f0', body: '#eef2f6', border: '#94a3b8' }  // grey band
];

// The 90-day count is the number you actually decide on, so it leads: heavier
// and a size up. Lifetime is background context and is stepped down rather than
// left competing with it at the same weight.
const ORDERS_90D_CHIP_SX = {
  fontWeight: 900,
  fontSize: '0.85rem',
  height: 26,
  '& .MuiChip-label': { px: 1.25 }
};
const LIFETIME_CHIP_SX = {
  fontWeight: 600,
  fontSize: '0.68rem',
  height: 20,
  color: 'text.secondary',
  borderColor: 'divider',
  '& .MuiChip-label': { px: 0.75 }
};

function amazonUrl(asin, currency) {
  const domain = AMAZON_DOMAINS[String(currency || '').toUpperCase()] || 'com';
  return asin ? `https://www.amazon.${domain}/dp/${asin}` : '';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatPrice(price, currency) {
  if (price === null || price === undefined || price === '') return '-';
  const value = Number(price);
  if (Number.isNaN(value)) return '-';
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
}

/**
 * Search a SKU or ASIN and act on every seller listing carrying it: see which
 * sellers have it, how each individual item id has sold, and end or revise any
 * of them without leaving the page. Data comes from SellerSkuIndex (the daily
 * SKU Index Sync), so a listing created after this morning's run appears
 * tomorrow.
 *
 * End and revise controls are only shown to users with SkuListingManager
 * access; the server enforces the same check on /revise-listing*.
 */
export default function SkuListingManagerPage() {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const actorName = user?.username || user?.name || user?.email || 'you';
  const { hasAccess } = usePageAccess(user);
  // Ending and revising are gated on the action page, not on merely reaching
  // this component — the read-only lookup route renders the same JSX. The
  // server enforces the same split on /revise-listing*; hiding the controls
  // here just keeps them out of reach.
  const canAct = hasAccess('SkuListingManager');

  const [query, setQuery] = useState('');
  const [searchedTerm, setSearchedTerm] = useState('');
  const [result, setResult] = useState(null); // null = nothing searched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Actions taken this session, keyed by item id. Kept separately from the
  // search result so a row reflects what just happened without a re-search.
  const [endedItems, setEndedItems] = useState({});
  const [revisedItems, setRevisedItems] = useState({});
  const [failedItems, setFailedItems] = useState({});
  const [endingItemId, setEndingItemId] = useState(null);

  const [selectedRows, setSelectedRows] = useState(() => new Map()); // itemId -> row
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { total, done, ok }

  const [reviseTarget, setReviseTarget] = useState(null); // the row being revised
  const [reviseForm, setReviseForm] = useState({ title: '', price: '' });
  const [revising, setRevising] = useState(false);
  // 'manual' edits title/price on the listing as it stands; 'asin' repoints the
  // same eBay item at a different Amazon product.
  const [reviseMode, setReviseMode] = useState('manual');
  const [reviseAsin, setReviseAsin] = useState('');
  const [reviseTemplateId, setReviseTemplateId] = useState('');
  const [reviseTemplates, setReviseTemplates] = useState([]);
  const [reviseTemplatesLoading, setReviseTemplatesLoading] = useState(false);
  const [revisePreview, setRevisePreview] = useState(null);
  const [reviseReviewOpen, setReviseReviewOpen] = useState(false);

  const sellers = result?.sellers || [];

  const runSearch = useCallback(async () => {
    const sku = query.trim();
    if (!sku) return;
    setLoading(true);
    setError('');
    setSuccess('');
    // A fresh search is a fresh set of rows — session action state from the
    // previous SKU would otherwise badge unrelated listings.
    setEndedItems({});
    setRevisedItems({});
    setFailedItems({});
    setSelectedRows(new Map());
    try {
      const { data } = await api.get('/amazon-stock-checks/sku-lookup', { params: { query: sku } });
      setResult(data);
      setSearchedTerm(sku);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to look up that SKU or ASIN.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const isEnded = useCallback(
    (row) => Boolean(endedItems[row.itemId] || row.endedInfo),
    [endedItems]
  );

  const toggleSelect = (row) => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (next.has(row.itemId)) next.delete(row.itemId);
      else next.set(row.itemId, row);
      return next;
    });
  };

  const toggleSelectSeller = (seller) => {
    const selectable = seller.listings.filter((row) => !isEnded(row));
    const allSelected = selectable.length > 0 && selectable.every((row) => selectedRows.has(row.itemId));
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const row of selectable) {
        if (allSelected) next.delete(row.itemId);
        else next.set(row.itemId, row);
      }
      return next;
    });
  };

  const endOne = async (row) => {
    await api.post('/ebay/end-item', {
      sellerId: row.sellerId,
      itemId: row.itemId,
      source: 'sku_listing_manager',
      sku: row.sku || '',
      country: END_LISTING_COUNTRIES[String(row.currency || '').toUpperCase()] || ''
    });
    setEndedItems((prev) => ({
      ...prev,
      [row.itemId]: { endedAt: new Date().toISOString(), endedBy: actorName }
    }));
    setFailedItems((prev) => {
      if (!prev[row.itemId]) return prev;
      const next = { ...prev };
      delete next[row.itemId];
      return next;
    });
    setSelectedRows((prev) => {
      if (!prev.has(row.itemId)) return prev;
      const next = new Map(prev);
      next.delete(row.itemId);
      return next;
    });
  };

  const handleEndItem = async (row) => {
    setError('');
    setSuccess('');
    setEndingItemId(row.itemId);
    try {
      await endOne(row);
      setSuccess(`Ended item ${row.itemId}`);
    } catch (err) {
      const reason = err.response?.data?.error || err.message || 'Failed to end item';
      setFailedItems((prev) => ({ ...prev, [row.itemId]: reason }));
      setError(`Failed to end item ${row.itemId}: ${reason}`);
    } finally {
      setEndingItemId(null);
    }
  };

  // Ended one at a time rather than in parallel: each call is a live eBay
  // write, and a burst of them risks tripping call limits mid-way through.
  const handleBulkEnd = async () => {
    const rows = Array.from(selectedRows.values()).filter((row) => !isEnded(row));
    if (!rows.length) return;
    setBulkConfirmOpen(false);
    setError('');
    setSuccess('');
    setBulkProgress({ total: rows.length, done: 0, ok: 0 });
    let okCount = 0;
    const failures = [];
    for (const row of rows) {
      setEndingItemId(row.itemId);
      try {
        await endOne(row);
        okCount += 1;
      } catch (err) {
        const reason = err.response?.data?.error || err.message || 'Unknown error';
        failures.push(`${row.itemId} (${reason})`);
        setFailedItems((prev) => ({ ...prev, [row.itemId]: reason }));
      }
      setBulkProgress((prev) => (prev ? { ...prev, done: prev.done + 1, ok: okCount } : prev));
    }
    setEndingItemId(null);
    setBulkProgress(null);
    if (failures.length) {
      setError(`Ended ${okCount} of ${rows.length} listing(s). Failed: ${failures.join('; ')}`);
    } else {
      setSuccess(`Ended all ${okCount} listing(s).`);
    }
  };

  const openReviseDialog = (row) => {
    setReviseTarget(row);
    setReviseForm({ title: row.title || '', price: row.price ?? '' });
    setReviseMode('manual');
    setReviseAsin('');
    setRevisePreview(null);
    setReviseReviewOpen(false);
  };

  // Only templates with ASIN automation switched on can generate listing
  // content, so the picker never offers one that would fail on submit. Fetched
  // once per page visit, on first open of the dialog.
  useEffect(() => {
    if (!reviseTarget || reviseTemplates.length || reviseTemplatesLoading) return;
    setReviseTemplatesLoading(true);
    api.get('/listing-templates')
      .then(({ data }) => {
        const usable = (Array.isArray(data) ? data : [])
          .filter((template) => template.asinAutomation?.enabled)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setReviseTemplates(usable);
        if (usable.length === 1) setReviseTemplateId(usable[0]._id);
      })
      .catch((err) => {
        setReviseTemplates([]);
        setError(err.response?.data?.error || 'Could not load templates for the revise dialog.');
      })
      .finally(() => setReviseTemplatesLoading(false));
  }, [reviseTarget, reviseTemplates.length, reviseTemplatesLoading]);

  const markRevised = (row, info) => {
    setRevisedItems((prev) => ({
      ...prev,
      [row.itemId]: { revisedAt: new Date().toISOString(), revisedBy: actorName, ...info }
    }));
  };

  const handleReviseListing = async () => {
    if (!reviseTarget) return;
    setError('');
    setSuccess('');
    setRevising(true);
    try {
      const { data } = await api.post('/amazon-stock-checks/revise-listing', {
        sellerId: reviseTarget.sellerId,
        itemId: reviseTarget.itemId,
        title: reviseForm.title,
        price: reviseForm.price,
        previousTitle: reviseTarget.title || '',
        previousPrice: reviseTarget.price ?? null,
        sku: reviseTarget.sku || '',
        asin: reviseTarget.asin || ''
      });
      markRevised(reviseTarget, {
        previousTitle: reviseTarget.title || '',
        newTitle: reviseForm.title,
        previousPrice: reviseTarget.price ?? null,
        newPrice: reviseForm.price !== '' ? Number(reviseForm.price) : null
      });
      setSuccess(data.message || `Revised item ${reviseTarget.itemId}`);
      setReviseTarget(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to revise listing');
    } finally {
      setRevising(false);
    }
  };

  const handleGenerateRevisePreview = async () => {
    if (!reviseTarget) return;
    setError('');
    setSuccess('');
    setRevising(true);
    try {
      const { data } = await api.post('/amazon-stock-checks/revise-listing/preview', {
        sellerId: reviseTarget.sellerId,
        itemId: reviseTarget.itemId,
        asin: reviseAsin.trim().toUpperCase(),
        templateId: reviseTemplateId,
        currency: reviseTarget.currency || 'USD'
      });
      // The review modal drops items it considers unsaveable, so a generation
      // that failed validation has to be reported here — opening the modal
      // would show a row whose Save button silently does nothing.
      if (data.errors?.length) {
        setError(`Could not generate a listing for ${data.asin}: ${data.errors.join('; ')}`);
        return;
      }
      setRevisePreview(data);
      setReviseReviewOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to generate the revise preview');
    } finally {
      setRevising(false);
    }
  };

  // AsinReviewModal hands back an array; this flow only ever has one item in it.
  const handleApplyAsinRevise = async (listings) => {
    if (!reviseTarget || !revisePreview) return;
    const listing = listings?.[0];
    if (!listing) {
      setError('Nothing to revise — the generated listing was dismissed in the review.');
      setReviseReviewOpen(false);
      return;
    }
    const target = reviseTarget;
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/amazon-stock-checks/revise-listing/apply', {
        sellerId: target.sellerId,
        itemId: target.itemId,
        asin: revisePreview.asin,
        // From the preview, not the picker: the two must not drift.
        templateId: revisePreview.templateId,
        listing
      });
      markRevised(target, {
        previousTitle: revisePreview.before?.title || '',
        newTitle: listing.title || '',
        previousPrice: revisePreview.before?.price ?? null,
        newPrice: listing.startPrice != null && listing.startPrice !== '' ? Number(listing.startPrice) : null
      });
      setReviseReviewOpen(false);
      setRevisePreview(null);
      setReviseTarget(null);
      setSuccess(data.message || `Revised item ${target.itemId}`);
    } catch (err) {
      // Surfaced on the page rather than swallowed by the modal: when eBay
      // accepted the revise but the row failed to save, the message is the only
      // signal that the listing is live and needs reconciling.
      setError(err.response?.data?.error || err.message || 'Failed to revise listing');
      setReviseReviewOpen(false);
    }
  };

  const selectedCount = useMemo(
    () => Array.from(selectedRows.values()).filter((row) => !isEnded(row)).length,
    [selectedRows, isEnded]
  );

  const busy = Boolean(bulkProgress);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title={canAct ? 'SKU Listing Manager' : 'SKU / ASIN Lookup'}
        subtitle={canAct
          ? 'Search a SKU or ASIN to see every seller listing carrying it, how each item id has sold, and end or revise any of them.'
          : 'Search a SKU or ASIN to see every seller listing carrying it and how each item id has sold.'}
      />

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>
      </Snackbar>

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="SKU or ASIN"
            placeholder="e.g. GRW25N4VFV or B0CFXYZ123"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') runSearch(); }}
            sx={{ flex: 1, minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              )
            }}
          />
          <Button
            variant="contained"
            onClick={runSearch}
            disabled={loading || busy || !query.trim()}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            sx={{ backgroundColor: BRAND_DARK }}
          >
            Search
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Variants are included — searching <b>GRW25N4VFV</b> also finds <b>GRW25N4VFV-1</b>. An ASIN is resolved to
          the SKUs listed for it. Listings come from each seller&apos;s last SKU Index Sync.
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {bulkProgress && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, mb: 1 }}>
            Ending listings… {bulkProgress.done} of {bulkProgress.total} ({bulkProgress.ok} succeeded)
          </Typography>
          <LinearProgress variant="determinate" value={(bulkProgress.done / bulkProgress.total) * 100} />
        </Paper>
      )}

      {canAct && !bulkProgress && selectedCount > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, borderColor: '#fecaca', bgcolor: '#fef2f2' }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              {selectedCount} listing{selectedCount === 1 ? '' : 's'} selected
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => setSelectedRows(new Map())}>Clear</Button>
            <Button
              size="small"
              color="error"
              variant="contained"
              startIcon={<CancelIcon />}
              onClick={() => setBulkConfirmOpen(true)}
            >
              End selected
            </Button>
          </Stack>
        </Paper>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && result && !sellers.length && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="text.secondary">
            No seller has <b>{searchedTerm}</b> in their synced SKU index.
          </Typography>
          {result.knownSkusForAsin?.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                This ASIN is listed in the database under {result.knownSkusForAsin.length} SKU
                {result.knownSkusForAsin.length === 1 ? '' : 's'} — none of them are currently in the index:
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent="center" sx={{ mt: 1 }}>
                {result.knownSkusForAsin.map((sku) => (
                  <Chip key={sku} size="small" variant="outlined" label={sku} sx={{ fontFamily: 'monospace' }} />
                ))}
              </Stack>
            </Box>
          )}
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
            The index holds each seller&apos;s active listings as of their last SKU Index Sync, so an item listed
            after this morning&apos;s run will not appear until tomorrow.
          </Typography>
        </Paper>
      )}

      {!loading && sellers.length > 0 && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {formatNumber(result.totalListings)} listing{result.totalListings === 1 ? '' : 's'} across{' '}
                {formatNumber(result.sellerCount)} seller{result.sellerCount === 1 ? '' : 's'} for <b>{searchedTerm}</b>
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Chip
                size="small"
                color={result.totals?.orderCount90d > 0 ? 'warning' : 'default'}
                label={`${formatNumber(result.totals?.orderCount90d)} orders / 90d`}
                sx={ORDERS_90D_CHIP_SX}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${formatNumber(result.totals?.lifetimeOrderCount)} lifetime`}
                sx={LIFETIME_CHIP_SX}
              />
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <Chip
                size="small"
                variant="outlined"
                color={result.queryType === 'asin' ? 'warning' : 'primary'}
                label={result.queryType === 'asin' ? 'Searched as ASIN' : 'Searched as SKU'}
              />
              {result.matchedSkus?.slice(0, 12).map((sku) => (
                <Chip key={sku} size="small" variant="outlined" label={sku} sx={{ fontFamily: 'monospace' }} />
              ))}
              {result.matchedSkus?.length > 12 && (
                <Chip size="small" variant="outlined" label={`+${result.matchedSkus.length - 12} more SKUs`} />
              )}
              {result.asins?.map((asin) => (
                <Chip
                  key={asin}
                  size="small"
                  variant="outlined"
                  color="warning"
                  sx={{ fontFamily: 'monospace' }}
                  label={(
                    <Link href={amazonUrl(asin, 'USD')} target="_blank" rel="noopener" underline="hover" sx={{ color: 'inherit' }}>
                      {asin}
                    </Link>
                  )}
                />
              ))}
            </Stack>
            {result.truncated && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Showing the 500 most recently synced listings for this SKU — there are more.
              </Alert>
            )}
          </Paper>

          {sellers.map((seller, sellerIndex) => {
            const selectable = seller.listings.filter((row) => !isEnded(row));
            const allSelected = selectable.length > 0 && selectable.every((row) => selectedRows.has(row.itemId));
            const band = SELLER_BANDS[sellerIndex % SELLER_BANDS.length];
            return (
              <Paper
                key={seller.sellerId}
                variant="outlined"
                sx={{
                  mb: 2.5,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: band.body,
                  borderColor: band.border,
                  borderLeft: `5px solid ${band.accent}`
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ px: 1.5, py: 1.25, bgcolor: band.header }}
                >
                  {canAct && (
                    <Checkbox
                      size="small"
                      sx={{ p: 0.25 }}
                      disabled={!selectable.length || busy}
                      checked={allSelected}
                      indeterminate={!allSelected && selectable.some((row) => selectedRows.has(row.itemId))}
                      onChange={() => toggleSelectSeller(seller)}
                    />
                  )}
                  <StorefrontIcon fontSize="small" color="action" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{seller.sellerName}</Typography>
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={`${seller.listingCount} listing${seller.listingCount === 1 ? '' : 's'}`}
                    sx={{ fontWeight: 800 }}
                  />
                  <Chip
                    size="small"
                    color={seller.orderCount90d > 0 ? 'warning' : 'default'}
                    label={`${formatNumber(seller.orderCount90d)} / 90d`}
                    sx={ORDERS_90D_CHIP_SX}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${formatNumber(seller.lifetimeOrderCount)} lifetime`}
                    sx={LIFETIME_CHIP_SX}
                  />
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title="Most recent SKU Index Sync covering these listings" arrow>
                    <Typography variant="caption" color="text.secondary">
                      synced {formatDateTime(seller.lastSyncedAt)}
                    </Typography>
                  </Tooltip>
                </Stack>
                <Divider />

                <Box sx={{ p: 1.25 }}>
                  {seller.listings.map((row) => {
                    const endedInfo = endedItems[row.itemId] || row.endedInfo;
                    const revisedInfo = revisedItems[row.itemId] || row.revisedInfo;
                    const rowBusy = endingItemId === row.itemId;
                    const failReason = !endedInfo ? failedItems[row.itemId] : null;
                    return (
                      <Paper
                        key={row.itemId}
                        variant="outlined"
                        sx={{ p: 1.25, mb: 1, borderRadius: 2, bgcolor: '#fff', borderColor: band.border, '&:last-of-type': { mb: 0 } }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          {canAct && (
                            <Checkbox
                              size="small"
                              sx={{ p: 0.25 }}
                              disabled={Boolean(endedInfo) || rowBusy || busy}
                              checked={selectedRows.has(row.itemId)}
                              onChange={() => toggleSelect(row)}
                            />
                          )}
                          <ListingThumb url={row.imageUrl} title={row.title} />
                          <Button
                            size="small"
                            variant="text"
                            endIcon={<OpenInNewIcon fontSize="inherit" />}
                            href={`https://www.ebay.com/itm/${row.itemId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ fontFamily: 'monospace', fontWeight: 800 }}
                          >
                            {row.itemId}
                          </Button>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={row.sku === searchedTerm ? 'default' : 'info'}
                            label={row.sku || '-'}
                            sx={{ fontFamily: 'monospace', fontWeight: 800 }}
                          />
                          {row.asin && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{ fontFamily: 'monospace' }}
                              label={(
                                <Link
                                  href={amazonUrl(row.asin, row.currency)}
                                  target="_blank"
                                  rel="noopener"
                                  underline="hover"
                                  sx={{ color: 'inherit' }}
                                >
                                  {row.asin}
                                </Link>
                              )}
                            />
                          )}
                          <Box sx={{ flex: 1 }} />
                          <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {formatPrice(row.price, row.currency)}
                          </Typography>
                          {canAct && !endedInfo && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<EditIcon />}
                              disabled={rowBusy || busy}
                              onClick={() => openReviseDialog(row)}
                            >
                              Revise
                            </Button>
                          )}
                          {endedInfo ? (
                            <Tooltip title={`Ended by ${endedInfo.endedBy || 'unknown'} on ${formatDateTime(endedInfo.endedAt)}`}>
                              <Chip size="small" color="error" label="Ended" sx={{ fontWeight: 800 }} />
                            </Tooltip>
                          ) : canAct && (
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              startIcon={rowBusy ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
                              disabled={rowBusy || busy}
                              onClick={() => handleEndItem(row)}
                            >
                              End Listing
                            </Button>
                          )}
                        </Stack>

                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap title={row.title}>
                          {row.title || '-'}
                        </Typography>

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                          <Chip
                            size="small"
                            color={row.orderCount90d > 0 ? 'warning' : 'default'}
                            label={`${formatNumber(row.orderCount90d)} / 90d`}
                            sx={ORDERS_90D_CHIP_SX}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${formatNumber(row.lifetimeOrderCount)} lifetime`}
                            sx={LIFETIME_CHIP_SX}
                          />
                          <OrderSparkline monthly={row.monthlyOrders} />
                        </Stack>

                        {endedInfo && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main', fontWeight: 700 }}>
                            Ended by {endedInfo.endedBy || 'unknown'} &middot; {formatDateTime(endedInfo.endedAt)}
                          </Typography>
                        )}
                        {failReason && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main', fontWeight: 700 }}>
                            End failed: {failReason} — use End Listing to retry
                          </Typography>
                        )}
                        {revisedInfo && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#1d4ed8', fontWeight: 700 }}>
                            Revised by {revisedInfo.revisedBy || 'unknown'} &middot; {formatDateTime(revisedInfo.revisedAt)}
                            {revisedInfo.previousPrice != null && revisedInfo.newPrice != null
                              ? ` · ${revisedInfo.previousPrice} → ${revisedInfo.newPrice} ${row.currency}`
                              : ''}
                          </Typography>
                        )}

                        {row.orders?.length > 0 && (
                          <Box sx={{ mt: 1, pl: 1, borderLeft: '3px solid #fed7aa' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                              Orders in the last 30 days
                            </Typography>
                            {row.orders.map((order) => (
                              <Typography key={`${order.orderId}-${order.date}`} variant="caption" display="block" color="text.secondary">
                                {formatDateTime(order.date)} | Order {order.orderId}
                                {order.quantity != null ? ` | Qty ${order.quantity}` : ''}
                                {order.subtotal != null ? ` | ${order.subtotal} ${row.currency}` : ''}
                              </Typography>
                            ))}
                          </Box>
                        )}
                      </Paper>
                    );
                  })}
                </Box>
              </Paper>
            );
          })}
        </>
      )}

      <Dialog open={bulkConfirmOpen} onClose={() => setBulkConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>End {selectedCount} listing{selectedCount === 1 ? '' : 's'}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This ends the selected eBay listings for good. Listings that have sold recently are worth a second look.
          </Alert>
          <Stack spacing={0.5}>
            {Array.from(selectedRows.values())
              .filter((row) => !isEnded(row))
              .slice(0, 100)
              .map((row) => (
                <Typography key={row.itemId} variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {row.itemId} · {row.sellerName} · {row.sku}
                  {row.orderCount90d > 0 ? ` · ${row.orderCount90d} order(s) in 90d` : ''}
                </Typography>
              ))}
            {selectedCount > 100 && (
              <Typography variant="caption" color="text.secondary">
                …and {selectedCount - 100} more.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkConfirmOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleBulkEnd}>End listings</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(reviseTarget)} onClose={() => setReviseTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revise Listing</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              value={reviseMode}
              onChange={(event, next) => { if (next) setReviseMode(next); }}
            >
              <ToggleButton value="manual">Edit title &amp; price</ToggleButton>
              <ToggleButton value="asin">Revise to a new ASIN</ToggleButton>
            </ToggleButtonGroup>

            {reviseMode === 'manual' ? (
              <>
                <TextField
                  label="Title"
                  value={reviseForm.title}
                  onChange={(event) => setReviseForm((prev) => ({ ...prev, title: event.target.value }))}
                  inputProps={{ maxLength: 80 }}
                  helperText={`${reviseForm.title.length}/80 characters`}
                  fullWidth
                />
                <TextField
                  label="Price"
                  type="number"
                  value={reviseForm.price}
                  onChange={(event) => setReviseForm((prev) => ({ ...prev, price: event.target.value }))}
                  fullWidth
                />
              </>
            ) : (
              <>
                <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
                  eBay item <strong>{reviseTarget?.itemId}</strong> keeps its item ID. Its SKU, title, description,
                  price, images and item specifics are replaced with the new ASIN&apos;s, and the new ASIN is saved
                  as its own listing. The current details stay in the database.
                </Alert>

                <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Currently listed</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{reviseTarget?.title || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {reviseTarget?.sku || '—'}
                    {reviseTarget?.asin ? ` · ${reviseTarget.asin}` : ''}
                    {reviseTarget?.price != null ? ` · ${reviseTarget.price} ${reviseTarget.currency || ''}` : ''}
                  </Typography>
                </Box>

                <TextField
                  label="Seller"
                  value={reviseTarget?.sellerName || ''}
                  InputProps={{ readOnly: true }}
                  helperText="Detected from the listing"
                  fullWidth
                />
                <TextField
                  label="New ASIN"
                  value={reviseAsin}
                  onChange={(event) => setReviseAsin(event.target.value.toUpperCase())}
                  placeholder="B0XXXXXXXX"
                  inputProps={{ maxLength: 10 }}
                  fullWidth
                />
                {/* Autocomplete rather than a plain select: the template list
                    runs to dozens of entries, and scrolling it to find one is
                    the slow part of this dialog. */}
                <Autocomplete
                  options={reviseTemplates}
                  loading={reviseTemplatesLoading}
                  disabled={reviseTemplatesLoading || !reviseTemplates.length}
                  value={reviseTemplates.find((template) => template._id === reviseTemplateId) || null}
                  onChange={(event, next) => setReviseTemplateId(next?._id || '')}
                  getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option._id === value._id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Template"
                      placeholder="Type to search…"
                      helperText={
                        reviseTemplatesLoading
                          ? 'Loading templates…'
                          : (reviseTemplates.length
                            ? 'Generates the eBay fields from this template'
                            : 'No templates have ASIN automation enabled')
                      }
                    />
                  )}
                  fullWidth
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviseTarget(null)}>Cancel</Button>
          {reviseMode === 'manual' ? (
            <Button
              variant="contained"
              onClick={handleReviseListing}
              disabled={revising}
              startIcon={revising ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ backgroundColor: BRAND_DARK }}
            >
              Save
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleGenerateRevisePreview}
              disabled={revising || reviseAsin.trim().length !== 10 || !reviseTemplateId}
              startIcon={revising ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ backgroundColor: BRAND_DARK }}
            >
              {revising ? 'Generating…' : 'Generate from ASIN'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Step two of an ASIN revise: the same review surface the ASIN Precheck
          flow uses, so a revised listing is edited exactly like a new one. */}
      <AsinReviewModal
        open={reviseReviewOpen}
        onClose={() => setReviseReviewOpen(false)}
        marketplace={revisePreview?.region || 'US'}
        sellerId={reviseTarget?.sellerId || null}
        templateName={reviseTemplates.find((template) => template._id === reviseTemplateId)?.name || ''}
        templateId={reviseTemplateId || null}
        previewItems={revisePreview ? [{
          id: `revise-${revisePreview.itemId}`,
          asin: revisePreview.asin,
          sku: revisePreview.newSku,
          sourceData: revisePreview.sourceData,
          generatedListing: { ...revisePreview.after, customLabel: revisePreview.newSku },
          pricingCalculation: revisePreview.pricingCalculation,
          warnings: revisePreview.warnings || [],
          errors: revisePreview.errors || [],
          progressStage: 'complete',
          status: revisePreview.errors?.length ? 'error' : (revisePreview.warnings?.length ? 'warning' : 'success')
        }] : []}
        onSave={handleApplyAsinRevise}
        templateColumns={[
          ...(revisePreview?.templateColumns || []).map((col) => ({ ...col, type: 'custom' })),
          { name: 'title', label: 'Title', type: 'core' },
          { name: 'description', label: 'Description', type: 'core' },
          { name: 'startPrice', label: 'Start Price', type: 'core' },
          { name: 'quantity', label: 'Quantity', type: 'core' }
        ]}
      />
    </Box>
  );
}
