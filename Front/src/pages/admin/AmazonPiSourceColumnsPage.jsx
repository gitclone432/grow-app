import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
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
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../lib/api.js';

const REGIONS = [
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
];

const TABLE_SCROLL_SX = { maxHeight: 420 };
const EXCLUDED_PREVIEW_KEYS = new Set([
  'amazon_pi_asin',
  'amazon_pi_best_sellers_rank',
  'amazon_pi_customer_reviews__ratings_count',
  'amazon_pi_customer_reviews__stars',
]);

function isExcludedPreviewRow(row) {
  if (EXCLUDED_PREVIEW_KEYS.has(row?.key)) return true;
  const path = String(row?.jsonPath || '')
    .trim()
    .split('.')
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
    )
    .filter(Boolean)
    .join('.');
  return (
    path === 'asin'
    || path === 'best_sellers_rank'
    || path === 'customer_reviews.ratings_count'
    || path === 'customer_reviews.stars'
  );
}

function filterPreviewRows(rows = []) {
  return rows.filter((row) => !isExcludedPreviewRow(row));
}
const PATH_CELL_SX = {
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 0,
};

/** Prefer path without "amazon" (ad blockers); fall back for older backends. */
const PI_COLUMNS_API_CANDIDATES = ['/pi-source-columns', '/amazon-pi-source-columns'];
let resolvedPiColumnsBase = null;

async function requestPiColumns(requestForBase) {
  const bases = resolvedPiColumnsBase
    ? [resolvedPiColumnsBase]
    : PI_COLUMNS_API_CANDIDATES;

  let lastError;
  for (const base of bases) {
    try {
      const response = await requestForBase(base);
      resolvedPiColumnsBase = base;
      return response;
    } catch (e) {
      lastError = e;
      if (e?.response?.status !== 404) throw e;
    }
  }
  throw lastError;
}

function piColumnsGet(path = '') {
  return requestPiColumns((base) => api.get(`${base}${path}`));
}

function piColumnsPost(path, body, options) {
  return requestPiColumns((base) => api.post(`${base}${path}`, body, options));
}

function piColumnsDelete(path) {
  return requestPiColumns((base) => api.delete(`${base}${path}`));
}

function formatApiError(e, fallback) {
  const serverMsg = e?.response?.data?.error;
  if (serverMsg) return serverMsg;
  if (e?.response?.status === 404) {
    return 'API route not found. Deploy the latest backend and restart it, then hard-refresh this page.';
  }
  if (!e?.response && e?.message) {
    return 'Cannot reach the API server. Restart the backend, confirm VITE_API_URL, or pause ad blockers for this site.';
  }
  return e?.message || fallback;
}

function rowMatchesFilter(row, filter) {
  const q = String(filter || '').trim().toLowerCase();
  if (!q) return true;
  return [row.jsonPath, row.key, row.label, row.value, row.lastSampleValue]
    .some((part) => String(part || '').toLowerCase().includes(q));
}

function ClampedSampleText({ text, lines = 2 }) {
  const [expanded, setExpanded] = useState(false);
  const sample = String(text ?? '').trim();
  if (!sample) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
        —
      </Typography>
    );
  }
  const long = sample.length > 100 || sample.includes('\n');
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={{
          fontSize: '0.8125rem',
          lineHeight: 1.45,
          wordBreak: 'break-word',
          ...(expanded || !long
            ? {}
            : {
                display: '-webkit-box',
                WebkitLineClamp: lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }),
        }}
      >
        {sample}
      </Typography>
      {long && (
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          sx={{ py: 0, px: 0.5, minHeight: 22, fontSize: '0.75rem', mt: 0.25 }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </Box>
  );
}

export default function AmazonPiSourceColumnsPage() {
  const [asin, setAsin] = useState('');
  const [region, setRegion] = useState('US');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewMeta, setPreviewMeta] = useState({ asin: '', region: '' });
  const [selectedPaths, setSelectedPaths] = useState(() => new Set());
  const [savedColumns, setSavedColumns] = useState([]);
  const [previewFilter, setPreviewFilter] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadWarning, setLoadWarning] = useState('');
  const [success, setSuccess] = useState('');

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    setLoadWarning('');
    try {
      const { data } = await piColumnsGet();
      setSavedColumns(filterPreviewRows(data.columns || []));
    } catch (e) {
      setSavedColumns([]);
      setLoadWarning(formatApiError(e, 'Failed to load saved columns'));
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const filteredPreviewRows = useMemo(
    () => previewRows.filter((row) => rowMatchesFilter(row, previewFilter)),
    [previewRows, previewFilter]
  );

  const filteredSavedColumns = useMemo(
    () => savedColumns.filter((col) => rowMatchesFilter(col, catalogFilter)),
    [savedColumns, catalogFilter]
  );

  const runPreview = async () => {
    setError('');
    setSuccess('');
    setPreviewRows([]);
    setPreviewFilter('');
    setSelectedPaths(new Set());
    const normalized = String(asin || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== 10) {
      setError('Enter a valid 10-character ASIN.');
      return;
    }
    setLoadingPreview(true);
    try {
      const { data } = await piColumnsPost(
        '/preview-from-asin',
        { asin: normalized, region },
        { timeout: 120000 }
      );
      const rows = filterPreviewRows(data.rows || []);
      setPreviewRows(rows);
      setPreviewMeta({ asin: data.asin || normalized, region: data.region || region });
      setSelectedPaths(new Set(rows.map((r) => r.jsonPath)));
      if (rows.length === 0) {
        setSuccess('Scrape succeeded but product_information was empty for this ASIN.');
      }
    } catch (e) {
      setError(formatApiError(e, 'Preview failed'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const togglePath = (path) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllPreview = () => {
    setSelectedPaths(new Set(filteredPreviewRows.map((r) => r.jsonPath)));
  };

  const clearPreviewSelection = () => {
    setSelectedPaths(new Set());
  };

  const saveSelected = async () => {
    setError('');
    setSuccess('');
    const rows = previewRows
      .filter((r) => selectedPaths.has(r.jsonPath))
      .map((r) => ({
        jsonPath: r.jsonPath,
        value: r.value,
        label: r.label,
      }));
    if (rows.length === 0) {
      setError('Select at least one row to save.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await piColumnsPost('/import-rows', {
        sourceAsin: previewMeta.asin,
        rows,
      });
      setSavedColumns(filterPreviewRows(data.columns || []));
      setSuccess(
        `Saved ${data.saved ?? rows.length} column(s). They now appear under Amazon Source Field on Manage Templates.`
      );
    } catch (e) {
      setError(formatApiError(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteSaved = async (id) => {
    if (!window.confirm('Remove this column from the catalog?')) return;
    setError('');
    try {
      await piColumnsDelete(`/${id}`);
      await loadSaved();
      setSuccess('Column removed.');
    } catch (e) {
      setError(formatApiError(e, 'Delete failed'));
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ mb: 0.5 }}>
            Amazon Product Info Columns
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Scrape <code>product_information</code>, pick paths to save, then map them in{' '}
            <Link to="/admin/manage-templates">Manage Listing Templates</Link>.
          </Typography>
        </Box>
        <Chip
          label={loadingSaved ? 'Loading catalog…' : `${savedColumns.length} saved`}
          size="small"
          color={savedColumns.length ? 'primary' : 'default'}
          variant="outlined"
        />
      </Stack>

      <Alert severity="info" sx={{ mb: 1.5, py: 0.75 }}>
        One ScraperAPI credit per preview. Sample values come from the preview ASIN; listings resolve live{' '}
        <code>product_information</code> at publish time.
      </Alert>

      {loadWarning && (
        <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setLoadWarning('')}>
          {loadWarning}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Preview from ASIN
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: previewRows.length ? 1.5 : 0 }}>
          <TextField
            label="ASIN"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            size="small"
            placeholder="B0XXXXXXXXX"
            sx={{ width: { xs: '100%', sm: 160 } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loadingPreview) runPreview();
            }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Region</InputLabel>
            <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={runPreview} disabled={loadingPreview}>
            {loadingPreview ? <CircularProgress size={22} color="inherit" /> : 'Preview'}
          </Button>
          <Button variant="outlined" onClick={loadSaved} disabled={loadingSaved}>
            Refresh catalog
          </Button>
          {previewMeta.asin && (
            <Chip size="small" label={`${previewMeta.asin} · ${previewMeta.region}`} variant="outlined" />
          )}
        </Stack>

        {previewRows.length > 0 && (
          <>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" onClick={selectAllPreview}>
                  Select visible
                </Button>
                <Button size="small" onClick={clearPreviewSelection}>
                  Clear
                </Button>
                <Button size="small" variant="contained" color="secondary" onClick={saveSelected} disabled={saving}>
                  {saving ? 'Saving…' : `Save selected (${selectedPaths.size})`}
                </Button>
              </Stack>
              <TextField
                size="small"
                placeholder="Filter paths or values…"
                value={previewFilter}
                onChange={(e) => setPreviewFilter(e.target.value)}
                sx={{ width: { xs: '100%', sm: 240 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {filteredPreviewRows.length} of {previewRows.length} rows
            </Typography>
            <TableContainer sx={TABLE_SCROLL_SX}>
              <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" width={48} />
                    <TableCell width="28%">Column (JSON path)</TableCell>
                    <TableCell width="22%">Template key</TableCell>
                    <TableCell width="50%">Value (sample)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPreviewRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          No rows match your filter.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPreviewRows.map((row) => (
                      <TableRow key={row.jsonPath} hover selected={selectedPaths.has(row.jsonPath)}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedPaths.has(row.jsonPath)}
                            onChange={() => togglePath(row.jsonPath)}
                          />
                        </TableCell>
                        <TableCell sx={PATH_CELL_SX}>
                          <Tooltip title={row.jsonPath} placement="top-start">
                            <span>{row.jsonPath}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={PATH_CELL_SX}>
                          <Tooltip title={row.key} placement="top-start">
                            <code>{row.key}</code>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <ClampedSampleText text={row.value} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1">Saved catalog</Typography>
          {savedColumns.length > 0 && (
            <TextField
              size="small"
              placeholder="Search saved columns…"
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              sx={{ width: { xs: '100%', sm: 260 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
          )}
        </Stack>

        {loadingSaved ? (
          <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : savedColumns.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography color="text.secondary" gutterBottom>
              No saved columns yet.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter an ASIN above, preview <code>product_information</code>, select rows, and save.
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {filteredSavedColumns.length} of {savedColumns.length} columns
            </Typography>
            <TableContainer sx={TABLE_SCROLL_SX}>
              <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell width="18%">Label</TableCell>
                    <TableCell width="24%">JSON path</TableCell>
                    <TableCell width="20%">amazonField key</TableCell>
                    <TableCell width="34%">Last sample</TableCell>
                    <TableCell width={52} align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSavedColumns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          No columns match your search.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSavedColumns.map((col) => (
                      <TableRow key={col._id} hover>
                        <TableCell sx={{ fontSize: '0.8125rem' }}>
                          {col.label || '—'}
                        </TableCell>
                        <TableCell sx={PATH_CELL_SX}>
                          <Tooltip title={col.jsonPath || ''} placement="top-start">
                            <span>{col.jsonPath || '—'}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={PATH_CELL_SX}>
                          <Tooltip title={col.key || ''} placement="top-start">
                            <code>{col.key || '—'}</code>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <ClampedSampleText text={col.lastSampleValue} />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Remove from catalog">
                            <IconButton size="small" color="error" onClick={() => deleteSaved(col._id)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
    </Box>
  );
}
