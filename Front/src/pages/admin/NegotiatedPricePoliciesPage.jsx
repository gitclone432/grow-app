import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
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
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import PageHeader from '../../components/PageHeader.jsx';
import api from '../../lib/api';
import { fetchSellersAll } from '../../lib/sellersAllCache.js';

const MARKETPLACES = [
  'EBAY_US', 'EBAY_MOTORS_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA',
  'EBAY_DE', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES', 'EBAY_AT',
  'EBAY_BE', 'EBAY_CH', 'EBAY_IE', 'EBAY_NL', 'EBAY_PL',
];

const DOCS_URL = 'https://developer.ebay.com/api-docs/sell/metadata/resources/marketplace/methods/getNegotiatedPricePolicies';

function sellerLabel(store) {
  return store?.user?.username || store?.username || store?._id || '';
}

function BoolChip({ value, reason }) {
  if (value == null) {
    const label = reason === 'not_in_marketplace' ? 'Not in marketplace' : 'No category ID';
    return <Chip size="small" label={label} variant="outlined" color="warning" sx={{ height: 22 }} />;
  }
  return (
    <Chip
      size="small"
      label={value ? 'Yes' : 'No'}
      color={value ? 'success' : 'default'}
      variant={value ? 'filled' : 'outlined'}
      sx={{ height: 22, fontWeight: 600 }}
    />
  );
}

function sortValue(row, columnId) {
  if (columnId === 'listingCount') return Number(row.listingCount) || 0;
  if (typeof row[columnId] === 'boolean') return row[columnId] ? 1 : 0;
  return String(row[columnId] || '').toLowerCase();
}

export default function NegotiatedPricePoliciesPage() {
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [sellerId, setSellerId] = useState('');
  const [view, setView] = useState('stores');
  const [stores, setStores] = useState([]);
  const [categoryInput, setCategoryInput] = useState('');
  const [policies, setPolicies] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState('all');
  const [sortBy, setSortBy] = useState('sellerName');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  useEffect(() => {
    fetchSellersAll(api).then((rows) => setStores(Array.isArray(rows) ? rows : [])).catch(() => setStores([]));
  }, []);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ebay/metadata/negotiated-price-policies', {
        params: {
          marketplace,
          view,
          sellerId: sellerId || undefined,
          categoryIds: categoryInput.trim() || undefined,
          refresh: refresh ? 'true' : undefined,
        },
        timeout: 180000,
      });
      setPolicies(Array.isArray(data?.policies) ? data.policies : []);
      setWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
      setMeta({
        view: data?.view,
        marketplaceId: data?.marketplaceId,
        total: data?.total || 0,
        fetchedAt: data?.fetchedAt,
        cached: Boolean(data?.cached),
        missingCategoryIds: data?.missingCategoryIds || 0,
        categoryIdsBackfilled: data?.categoryIdsBackfilled || 0,
      });
      setPage(0);
    } catch (err) {
      setPolicies([]);
      setWarnings([]);
      setMeta(null);
      setError(err?.response?.data?.details || err?.response?.data?.error || err.message || 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, [marketplace, view, sellerId, categoryInput]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = policies;
    if (q) {
      list = list.filter((row) => (
        String(row.sellerName || '').toLowerCase().includes(q)
        || String(row.categoryId || '').includes(q)
        || String(row.categoryName || '').toLowerCase().includes(q)
      ));
    }
    if (flagFilter === 'counter') list = list.filter((row) => row.bestOfferCounterEnabled);
    if (flagFilter === 'autoAccept') list = list.filter((row) => row.bestOfferAutoAcceptEnabled);
    if (flagFilter === 'autoDecline') list = list.filter((row) => row.bestOfferAutoDeclineEnabled);
    if (flagFilter === 'unknown') list = list.filter((row) => row.policyFound === false);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortBy);
      const bv = sortValue(b, sortBy);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return String(a.sellerName || '').localeCompare(String(b.sellerName || ''));
    });
  }, [policies, search, flagFilter, sortBy, sortDir]);

  const counts = useMemo(() => ({
    total: policies.length,
    counter: policies.filter((row) => row.bestOfferCounterEnabled).length,
    autoAccept: policies.filter((row) => row.bestOfferAutoAcceptEnabled).length,
    autoDecline: policies.filter((row) => row.bestOfferAutoDeclineEnabled).length,
    unknown: policies.filter((row) => row.policyFound === false).length,
  }), [policies]);

  const paged = filteredSorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSort = (columnId) => {
    if (sortBy === columnId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnId);
      setSortDir(columnId === 'sellerName' || columnId === 'categoryName' ? 'asc' : 'desc');
    }
  };

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Negotiated Price Policies"
        breadcrumbs={[
          { label: 'Store Listings', href: '/admin/store-listings' },
          { label: 'Negotiated Price Policies' },
        ]}
        subtitle={(
          <>
            Category rules from eBay Metadata, joined to your store listings.
            {' '}
            <Link
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              getNegotiatedPricePolicies <OpenInNewIcon sx={{ fontSize: 14 }} />
            </Link>
          </>
        )}
        actions={(
          <Button component={RouterLink} to="/admin/store-listings" sx={{ textTransform: 'none' }}>
            Back to Store Listings
          </Button>
        )}
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        This API does <strong>not</strong> send offers and is <strong>not a per-seller quota</strong>.
        It tells you, for each eBay <strong>category</strong> on a marketplace, whether Best Offer
        auto-accept, auto-decline, and counter-offer prices are allowed when you list there.
        Most US categories allow all three, which is why a full-tree table looks like thousands of identical Yes rows.
        This page defaults to <strong>your stores × the categories they actually list in</strong>.
      </Alert>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              label="Seller"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              disabled={loading || view === 'marketplace'}
            >
              <MenuItem value="">All stores</MenuItem>
              {stores.map((store) => (
                <MenuItem key={store._id} value={store._id}>{sellerLabel(store)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              label="Marketplace"
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              disabled={loading}
            >
              {MARKETPLACES.map((id) => (
                <MenuItem key={id} value={id}>{id}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Rows</InputLabel>
            <Select
              label="Rows"
              value={view}
              onChange={(e) => setView(e.target.value)}
              disabled={loading}
            >
              <MenuItem value="stores">Our listings (by seller)</MenuItem>
              <MenuItem value="marketplace">Full eBay category tree</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Category IDs (optional)"
            placeholder="Limit to IDs, e.g. 6001, 6028"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            disabled={loading}
            sx={{ minWidth: 240, flex: 1 }}
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            onClick={() => load(false)}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            {loading ? 'Loading…' : 'Load'}
          </Button>
          <Button variant="outlined" onClick={() => load(true)} disabled={loading} sx={{ textTransform: 'none' }}>
            Refresh live
          </Button>
        </Stack>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {meta?.categoryIdsBackfilled > 0 ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Filled eBay category IDs for {meta.categoryIdsBackfilled} store categor{meta.categoryIdsBackfilled === 1 ? 'y' : 'ies'} from GetItem, then looked up Best Offer rules.
        </Alert>
      ) : null}
      {meta?.missingCategoryIds > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {meta.missingCategoryIds} row{meta.missingCategoryIds === 1 ? '' : 's'} still have no eBay category ID on the listing, so Counter / Auto-accept / Auto-decline cannot be looked up. Click Load again, or sync Store Listings.
        </Alert>
      ) : null}
      {warnings.map((warning, i) => (
        <Alert key={i} severity="warning" sx={{ mb: 1 }}>
          {warning.longMessage || warning.message || JSON.stringify(warning)}
        </Alert>
      ))}

      {meta ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Chip size="small" label={meta.marketplaceId} />
          <Chip size="small" label={`${counts.total} rows`} />
          <Chip size="small" color="success" variant="outlined" label={`Counter ${counts.counter}`} />
          <Chip size="small" variant="outlined" label={`Auto-accept ${counts.autoAccept}`} />
          <Chip size="small" variant="outlined" label={`Auto-decline ${counts.autoDecline}`} />
          {counts.unknown > 0 ? <Chip size="small" color="warning" variant="outlined" label={`Unknown ${counts.unknown}`} /> : null}
          <Chip size="small" variant="outlined" label={meta.view === 'marketplace' ? 'Full tree' : 'Store listings'} />
          <Chip size="small" variant="outlined" label={meta.cached ? 'Cached' : 'Live'} />
          {meta.fetchedAt ? (
            <Chip size="small" variant="outlined" label={new Date(meta.fetchedAt).toLocaleString()} />
          ) : null}
        </Stack>
      ) : null}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          placeholder="Filter seller, category, or ID"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Show</InputLabel>
          <Select
            label="Show"
            value={flagFilter}
            onChange={(e) => { setFlagFilter(e.target.value); setPage(0); }}
          >
            <MenuItem value="all">All rows</MenuItem>
            <MenuItem value="counter">Counter allowed</MenuItem>
            <MenuItem value="autoAccept">Auto-accept allowed</MenuItem>
            <MenuItem value="autoDecline">Auto-decline allowed</MenuItem>
            <MenuItem value="unknown">Policy unknown</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {loading && policies.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !meta && !error ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Choose a seller (or all stores) and click Load.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <TableContainer sx={{ maxHeight: '70vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {[
                    { id: 'sellerName', label: 'Seller', align: 'left' },
                    { id: 'categoryName', label: 'Category', align: 'left' },
                    { id: 'categoryId', label: 'Category ID', align: 'left' },
                    { id: 'listingCount', label: 'Listings', align: 'right' },
                    { id: 'bestOfferCounterEnabled', label: 'Counter offer', align: 'center' },
                    { id: 'bestOfferAutoAcceptEnabled', label: 'Auto-accept', align: 'center' },
                    { id: 'bestOfferAutoDeclineEnabled', label: 'Auto-decline', align: 'center' },
                  ].map((col) => (
                    <TableCell key={col.id} align={col.align} sortDirection={sortBy === col.id ? sortDir : false}>
                      <TableSortLabel
                        active={sortBy === col.id}
                        direction={sortBy === col.id ? sortDir : 'asc'}
                        onClick={() => handleSort(col.id)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No rows match this filter.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : paged.map((row, i) => (
                  <TableRow key={`${row.sellerId || 'mkt'}-${row.categoryId || row.categoryName || i}`} hover>
                    <TableCell>{row.sellerName || '—'}</TableCell>
                    <TableCell>{row.categoryName || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {row.categoryId || '—'}
                    </TableCell>
                    <TableCell align="right">
                      {row.listingCount == null ? '—' : Number(row.listingCount).toLocaleString()}
                    </TableCell>
                    <TableCell align="center"><BoolChip value={row.bestOfferCounterEnabled} reason={row.unknownReason} /></TableCell>
                    <TableCell align="center"><BoolChip value={row.bestOfferAutoAcceptEnabled} reason={row.unknownReason} /></TableCell>
                    <TableCell align="center"><BoolChip value={row.bestOfferAutoDeclineEnabled} reason={row.unknownReason} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredSorted.length}
            page={page}
            onPageChange={(_, next) => setPage(next)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100, 250]}
          />
        </Paper>
      )}
    </Box>
  );
}
