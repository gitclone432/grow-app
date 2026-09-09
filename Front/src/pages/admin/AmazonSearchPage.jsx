import { useEffect, useMemo, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api.js';
import { fetchSellersAll } from '../../lib/sellersAllCache.js';
import AmazonSearchResultsTable from '../../components/AmazonSearchResultsTable.jsx';

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: 'Amazon.com (US)' },
  { value: 'UK', label: 'Amazon.co.uk (UK)' },
  { value: 'CA', label: 'Amazon.ca (Canada)' },
  { value: 'AU', label: 'Amazon.com.au (Australia)' },
];

const QUERY_STORAGE_KEY = 'amazonSearchPageQuery';

function sellerLabel(seller) {
  return seller?.user?.username || seller?.user?.email || seller?._id || 'Unknown Seller';
}

export default function AmazonSearchPage() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('US');
  const [pages, setPages] = useState(1);
  const [maxAsins, setMaxAsins] = useState(40);
  const [excludeSponsored, setExcludeSponsored] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUERY_STORAGE_KEY);
      if (saved) setQuery(saved);
    } catch {
      // ignore
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchSellersAll(api);
        if (!cancelled) setSellers(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setSellers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedSellers = useMemo(
    () =>
      [...sellers].sort((a, b) =>
        sellerLabel(a).localeCompare(sellerLabel(b), undefined, { sensitivity: 'base' })
      ),
    [sellers]
  );

  const products = result?.products || [];
  const selectedAsins = useMemo(
    () => products.filter((p) => selected.has(p.asin)).map((p) => p.asin),
    [products, selected]
  );

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError('Enter a search query (at least 2 characters)');
      return;
    }

    setSearching(true);
    setError('');
    setResult(null);
    setCopyStatus('');
    try {
      localStorage.setItem(QUERY_STORAGE_KEY, trimmed);
    } catch {
      // ignore
    }

    try {
      const { data } = await api.post('/product-search', {
        query: trimmed,
        region,
        pages,
        excludeSponsored,
        maxAsins,
        sellerId: sellerId || undefined,
      });
      setResult(data);
      const next = new Set(
        (data.products || [])
          .filter((p) => p.asin && !p.alreadyListed)
          .map((p) => p.asin)
      );
      setSelected(next);
      if (!(data.products || []).length) {
        setError('No ASINs found for this query. Try different keywords or another marketplace.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Amazon search failed');
    } finally {
      setSearching(false);
    }
  };

  const toggleAsin = (asin) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  const toggleAll = (checked) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(products.map((p) => p.asin)));
  };

  const copyAsins = async (asins) => {
    if (!asins.length) return;
    try {
      await navigator.clipboard.writeText(asins.join('\n'));
      setCopyStatus(`Copied ${asins.length} ASIN${asins.length === 1 ? '' : 's'}`);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Typography variant="h5" sx={{ mb: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Amazon Search
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Search Amazon with ScrapingDog and copy ASINs. CSV Listings is unchanged — paste ASINs there with Add Listing when you are ready.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            label="Seller (optional)"
            size="small"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            disabled={searching}
            sx={{ maxWidth: 360 }}
            helperText="Used only to mark ASINs already listed on that store"
          >
            <MenuItem value="">
              <em>No seller — skip already-listed check</em>
            </MenuItem>
            {sortedSellers.map((s) => (
              <MenuItem key={s._id} value={s._id}>
                {sellerLabel(s)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Amazon search query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. stainless steel water bottle 32oz"
            fullWidth
            disabled={searching}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !searching) handleSearch();
            }}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl size="small" sx={{ minWidth: 220, flex: 1 }}>
              <InputLabel>Marketplace</InputLabel>
              <Select
                value={region}
                label="Marketplace"
                onChange={(e) => setRegion(e.target.value)}
                disabled={searching}
              >
                {MARKETPLACE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              select
              size="small"
              label="Pages"
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              disabled={searching}
              sx={{ minWidth: 110 }}
              helperText="1 credit / page"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label="Max ASINs"
              value={maxAsins}
              onChange={(e) => setMaxAsins(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
              disabled={searching}
              inputProps={{ min: 1, max: 100 }}
              sx={{ minWidth: 120 }}
            />
          </Stack>

          <FormControlLabel
            control={
              <Checkbox
                checked={excludeSponsored}
                onChange={(e) => setExcludeSponsored(e.target.checked)}
                disabled={searching}
              />
            }
            label="Skip sponsored results"
          />

          <Box>
            <Button
              variant="contained"
              startIcon={searching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
              onClick={handleSearch}
              disabled={searching || query.trim().length < 2}
            >
              {searching ? 'Searching Amazon…' : 'Search Amazon'}
            </Button>
          </Box>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}
      {copyStatus && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCopyStatus('')}>{copyStatus}</Alert>
      )}

      {result && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Chip size="small" label={`${products.length} ASINs`} color="primary" />
              {result.alreadyListedCount > 0 && (
                <Chip size="small" label={`${result.alreadyListedCount} already on this store`} />
              )}
              {result.skippedSponsored > 0 && (
                <Chip size="small" label={`${result.skippedSponsored} sponsored skipped`} />
              )}
              <Chip size="small" variant="outlined" label={`${result.creditsUsed || 0} credit${result.creditsUsed === 1 ? '' : 's'}`} />
            </Stack>
            {result.warning && (
              <Alert severity="warning">{result.warning}</Alert>
            )}
            {products.length > 0 && (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copyAsins(selectedAsins)}
                    disabled={selectedAsins.length === 0}
                  >
                    Copy selected ({selectedAsins.length})
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copyAsins(products.map((p) => p.asin).filter(Boolean))}
                  >
                    Copy all ASINs
                  </Button>
                </Stack>
                <AmazonSearchResultsTable
                  products={products}
                  selectable
                  selected={selected}
                  onToggle={toggleAsin}
                  onToggleAll={toggleAll}
                  showAlreadyListed
                />
              </>
            )}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
