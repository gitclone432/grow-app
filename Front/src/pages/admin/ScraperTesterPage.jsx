import { useEffect, useMemo, useRef, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import api from '../../lib/api.js';
import AmazonSearchResultsTable from '../../components/AmazonSearchResultsTable.jsx';

const REGIONS = [
  { value: 'US', label: 'United States (amazon.com)' },
  { value: 'UK', label: 'United Kingdom (amazon.co.uk)' },
  { value: 'CA', label: 'Canada (amazon.ca)' },
  { value: 'AU', label: 'Australia (amazon.com.au)' },
];

const DEBUG_SCRAPE_BASE = '/debug-scrape';
const SEARCH_PAGE_MAX = 20;

function formatCaughtError(e, serverScraper, extra401Hint) {
  const httpStatus = e?.response?.status;
  const apiError = e?.response?.data?.error || e?.message || 'Request failed';
  const runtime = e?.response?.data?.runtime;
  const isNetwork =
    e?.code === 'ERR_NETWORK' ||
    String(e?.message || '').toLowerCase().includes('network error');
  let hint = '';
  if (isNetwork) {
    hint =
      ' No response from the server. Confirm the API is running and VITE_API_URL is correct. If other admin pages work, try pausing ad blockers for this site (they sometimes block scrape-related paths).';
  } else if (httpStatus === 401) {
    hint = extra401Hint;
    if (runtime?.provider) {
      hint += ` Live server reports SCRAPER_PROVIDER=${runtime.provider}, key length ${runtime.keyLen}.`;
    } else if (serverScraper) {
      hint += ` Live server reports SCRAPER_PROVIDER=${serverScraper.provider}, key length ${serverScraper.keyLen}.`;
    }
  }
  return {
    message: apiError + hint,
    json: JSON.stringify(
      e?.response?.data || { error: e.message, code: e.code, status: httpStatus },
      null,
      2
    ),
  };
}

export default function ScraperTesterPage() {
  const [asin, setAsin] = useState('');
  const [region, setRegion] = useState('US');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRegion, setSearchRegion] = useState('US');
  const [searchPage, setSearchPage] = useState(1);
  const [searchPageCount, setSearchPageCount] = useState(10);
  const [searchedAllPages, setSearchedAllPages] = useState(false);
  const [pagesFetched, setPagesFetched] = useState(0);
  const lastSearchRef = useRef({ query: '', region: '', allPages: false });
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [responseText, setResponseText] = useState('');
  const [responseLabel, setResponseLabel] = useState('Response');
  const [extractedAsins, setExtractedAsins] = useState([]);
  const [searchProducts, setSearchProducts] = useState([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [serverScraper, setServerScraper] = useState(null);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    api
      .get(`${DEBUG_SCRAPE_BASE}/status`)
      .then(({ data }) => setServerScraper(data))
      .catch(() => setServerScraper(null));
  }, []);

  const prettyResponse = useMemo(
    () => responseText || 'Run a request to see the raw scraper JSON.',
    [responseText]
  );

  const runScrape = async () => {
    setLoading('product');
    setError('');
    setResponseText('');
    setExtractedAsins([]);
    setSearchProducts([]);
    setCopyStatus('');
    setResponseLabel('Product response');
    setSearchedAllPages(false);
    setPagesFetched(0);
    const normalized = String(asin || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== 10) {
      setError('Enter a valid 10-character ASIN.');
      setLoading('');
      return;
    }

    try {
      const { data } = await api.post(
        `${DEBUG_SCRAPE_BASE}/raw`,
        { asin: normalized, region },
        { timeout: 120000 }
      );
      setResponseText(JSON.stringify(data, null, 2));
    } catch (e) {
      const caught = formatCaughtError(
        e,
        serverScraper,
        ' A ScrapingDog API key returns 401 when the server still uses ScraperAPI. On Render (API service): set SCRAPER_PROVIDER=scrapingdog and SCRAPER_API_KEY=your ScrapingDog key, then Manual Deploy. Redeploy the latest backend if you do not see a blue “Server scraper” banner above.'
      );
      setError(caught.message);
      setResponseText(caught.json);
    } finally {
      setLoading('');
    }
  };

  const runSearch = async (pageOverride) => {
    const requested = typeof pageOverride === 'number' ? pageOverride : searchPage;
    const page = Math.min(SEARCH_PAGE_MAX, Math.max(1, requested || 1));
    if (page !== searchPage) setSearchPage(page);
    setLoading('search');
    setError('');
    setResponseText('');
    setExtractedAsins([]);
    setSearchProducts([]);
    setCopyStatus('');
    setResponseLabel('Search response');
    const query = String(searchQuery || '').trim();
    if (query.length < 2) {
      setError('Enter a search query (at least 2 characters).');
      setLoading('');
      return;
    }

    try {
      const { data } = await api.post(
        `${DEBUG_SCRAPE_BASE}/search`,
        { query, region: searchRegion, page },
        { timeout: 120000 }
      );
      lastSearchRef.current = { query, region: searchRegion, allPages: false };
      setSearchedAllPages(false);
      setPagesFetched(1);
      setResponseText(JSON.stringify(data, null, 2));
      setExtractedAsins(Array.isArray(data?.asins) ? data.asins : []);
      setSearchProducts(Array.isArray(data?.products) ? data.products : []);
      const productCount = Array.isArray(data?.products) ? data.products.length : 0;
      setSearchPageCount((prev) => {
        if (productCount === 0) return Math.max(1, page);
        const next = data?.hasMore === false ? page : Math.min(SEARCH_PAGE_MAX, Math.max(prev, page + 1));
        return Math.max(next, page);
      });
    } catch (e) {
      const caught = formatCaughtError(
        e,
        serverScraper,
        ' ScrapingDog search 401: set SCRAPINGDOG_API_KEY, or SCRAPER_PROVIDER=scrapingdog with SCRAPER_API_KEY, then restart the API.'
      );
      setError(caught.message);
      setResponseText(caught.json);
    } finally {
      setLoading('');
    }
  };

  const handleSearchPageChange = (_, page) => {
    setSearchPage(page);
    const last = lastSearchRef.current;
    const query = String(searchQuery || '').trim();
    if (last.query && last.query === query && last.region === searchRegion && !last.allPages) {
      void runSearch(page);
    }
  };

  const runSearchAll = async () => {
    const pages = Math.min(SEARCH_PAGE_MAX, Math.max(1, searchPageCount || 10));
    setLoading('search-all');
    setError('');
    setResponseText('');
    setExtractedAsins([]);
    setSearchProducts([]);
    setCopyStatus('');
    setResponseLabel('Search response');
    const query = String(searchQuery || '').trim();
    if (query.length < 2) {
      setError('Enter a search query (at least 2 characters).');
      setLoading('');
      return;
    }

    try {
      const { data } = await api.post(
        `${DEBUG_SCRAPE_BASE}/search`,
        { query, region: searchRegion, allPages: true, pages },
        { timeout: 600000 }
      );
      lastSearchRef.current = { query, region: searchRegion, allPages: true };
      setSearchedAllPages(true);
      setSearchPage(1);
      setPagesFetched(data?.pagesFetched || pages);
      if (data?.pagesFetched) {
        setSearchPageCount(Math.max(pages, data.pagesFetched));
      }
      setResponseText(JSON.stringify(data, null, 2));
      setExtractedAsins(Array.isArray(data?.asins) ? data.asins : []);
      setSearchProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (e) {
      const caught = formatCaughtError(
        e,
        serverScraper,
        ' ScrapingDog search 401: set SCRAPINGDOG_API_KEY, or SCRAPER_PROVIDER=scrapingdog with SCRAPER_API_KEY, then restart the API.'
      );
      setError(caught.message);
      setResponseText(caught.json);
    } finally {
      setLoading('');
    }
  };

  const copyResponse = async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyStatus(''), 2000);
  };

  const copyAsins = async () => {
    if (!extractedAsins.length) return;
    try {
      await navigator.clipboard.writeText(extractedAsins.join('\n'));
      setCopyStatus('ASINs copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyStatus(''), 2000);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        Scraper Tester
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Product scrape uses ScraperAPI or ScrapingDog per <code>SCRAPER_PROVIDER</code> (same pipeline
        as ASIN auto-fill). Amazon Search always uses the ScrapingDog search API. Each run uses API
        credits.
      </Typography>

      {serverScraper ? (
        <Alert
          severity={
            serverScraper.provider === 'scrapingdog' && serverScraper.keyConfigured
              ? 'info'
              : 'warning'
          }
          sx={{ mb: 2 }}
        >
          Server scraper: <strong>{serverScraper.service}</strong> (
          <code>SCRAPER_PROVIDER={serverScraper.provider}</code>, key length{' '}
          {serverScraper.keyLen}
          {typeof serverScraper.searchKeyConfigured === 'boolean'
            ? `, search key ${serverScraper.searchKeyConfigured ? 'loaded' : 'missing'}`
            : ''}
          ).{' '}
          {serverScraper.provider !== 'scrapingdog' ? (
            <>
              <strong>401 with a ScrapingDog key?</strong> Set{' '}
              <code>SCRAPER_PROVIDER=scrapingdog</code> on the API host and restart.
            </>
          ) : null}
          {serverScraper.searchKeyConfigured === false ? (
            <>
              {' '}Search needs <code>SCRAPINGDOG_API_KEY</code> or{' '}
              <code>SCRAPER_PROVIDER=scrapingdog</code> with <code>SCRAPER_API_KEY</code>.
            </>
          ) : null}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Set <code>SCRAPER_API_KEY</code> and <code>SCRAPER_PROVIDER=scrapingdog</code> on the API
          server, then restart. A ScrapingDog key returns <strong>401</strong> if the server still
          defaults to ScraperAPI.
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Amazon product
        </Typography>
        <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'flex-end' }}>
          <TextField
            label="ASIN"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            placeholder="B08N5WRWNW"
            size="small"
            sx={{ minWidth: 200 }}
            inputProps={{ maxLength: 32 }}
            disabled={Boolean(loading)}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Region</InputLabel>
            <Select
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={Boolean(loading)}
            >
              {REGIONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={runScrape} disabled={Boolean(loading)}>
            {loading === 'product' ? 'Running…' : 'Fetch raw'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
          Amazon search (ScrapingDog)
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Calls <code>https://api.scrapingdog.com/amazon/search</code> — 1 credit per page. Search
          page fetches one page. Search all pages fetches pages 1–N in one run and lists every
          product together.
        </Typography>
        <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'flex-end' }} flexWrap="wrap" useFlexGap>
          <TextField
            label="Search query"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="center console hidden storage box"
            size="small"
            sx={{ minWidth: 280, flex: 1 }}
            disabled={Boolean(loading)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) runSearch();
            }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Region</InputLabel>
            <Select
              label="Region"
              value={searchRegion}
              onChange={(e) => setSearchRegion(e.target.value)}
              disabled={Boolean(loading)}
            >
              {REGIONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="number"
            label="Pages"
            value={searchPageCount}
            onChange={(e) => {
              const next = Math.min(SEARCH_PAGE_MAX, Math.max(1, Number(e.target.value) || 1));
              setSearchPageCount(next);
              if (searchPage > next) setSearchPage(next);
            }}
            disabled={Boolean(loading)}
            inputProps={{ min: 1, max: SEARCH_PAGE_MAX }}
            sx={{ width: 100 }}
            helperText={`max ${SEARCH_PAGE_MAX}`}
          />
          <Pagination
            count={searchPageCount}
            page={searchPage}
            onChange={handleSearchPageChange}
            color="secondary"
            size="small"
            siblingCount={1}
            boundaryCount={1}
            disabled={Boolean(loading)}
            showFirstButton
            showLastButton
          />
          <Typography variant="caption" color="text.secondary" sx={{ pb: { md: 0.5 } }}>
            Page {searchPage} · 1 credit / page
          </Typography>
          <Button variant="contained" color="secondary" onClick={() => runSearch()} disabled={Boolean(loading)}>
            {loading === 'search' ? 'Searching…' : 'Search page'}
          </Button>
          <Button variant="contained" onClick={() => runSearchAll()} disabled={Boolean(loading)}>
            {loading === 'search-all'
              ? `Searching ${searchPageCount} pages…`
              : `Search all pages (${searchPageCount} credits)`}
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6">{responseLabel}</Typography>
            {extractedAsins.length > 0 ? (
              <Chip
                size="small"
                color="primary"
                label={
                  searchedAllPages
                    ? `${extractedAsins.length} ASINs · ${pagesFetched} page${pagesFetched === 1 ? '' : 's'}`
                    : `Page ${searchPage} · ${extractedAsins.length} ASINs`
                }
              />
            ) : null}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            {copyStatus ? (
              <Typography variant="caption" color="text.secondary">
                {copyStatus}
              </Typography>
            ) : null}
            {extractedAsins.length > 0 ? (
              <Button variant="outlined" size="small" onClick={copyAsins}>
                Copy ASINs
              </Button>
            ) : null}
            <Tooltip title={responseText ? 'Copy JSON' : 'Fetch first'}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  onClick={copyResponse}
                  disabled={!responseText}
                >
                  Copy
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
        {searchProducts.length > 0 ? (
          <Box sx={{ mb: 2, overflow: 'auto' }}>
            <AmazonSearchResultsTable products={searchProducts} />
            {searchedAllPages ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Combined results from {pagesFetched} page{pagesFetched === 1 ? '' : 's'}. Pagination
                is not used after an all-pages search.
              </Typography>
            ) : (
              <Stack alignItems="center" sx={{ mt: 2 }}>
                <Pagination
                  count={searchPageCount}
                  page={searchPage}
                  onChange={handleSearchPageChange}
                  color="secondary"
                  siblingCount={1}
                  boundaryCount={1}
                  disabled={Boolean(loading)}
                  showFirstButton
                  showLastButton
                />
              </Stack>
            )}
          </Box>
        ) : extractedAsins.length > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontFamily: 'monospace' }}>
            {extractedAsins.join(', ')}
          </Typography>
        ) : null}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Raw JSON
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1,
            bgcolor: '#0b1020',
            color: '#d6e2ff',
            overflow: 'auto',
            maxHeight: searchProducts.length ? '40vh' : '65vh',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {prettyResponse}
        </Box>
      </Paper>
    </Box>
  );
}
