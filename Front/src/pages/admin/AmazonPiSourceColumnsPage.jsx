import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
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
import api from '../../lib/api.js';

const REGIONS = [
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
];

export default function AmazonPiSourceColumnsPage() {
  const [asin, setAsin] = useState('');
  const [region, setRegion] = useState('US');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewMeta, setPreviewMeta] = useState({ asin: '', region: '' });
  const [selectedPaths, setSelectedPaths] = useState(() => new Set());
  const [savedColumns, setSavedColumns] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    setError('');
    try {
      const { data } = await api.get('/amazon-pi-source-columns');
      setSavedColumns(data.columns || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load saved columns');
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const runPreview = async () => {
    setError('');
    setSuccess('');
    setPreviewRows([]);
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
      const { data } = await api.post(
        '/amazon-pi-source-columns/preview-from-asin',
        { asin: normalized, region },
        { timeout: 120000 }
      );
      const rows = data.rows || [];
      setPreviewRows(rows);
      setPreviewMeta({ asin: data.asin || normalized, region: data.region || region });
      setSelectedPaths(new Set(rows.map((r) => r.jsonPath)));
      if (rows.length === 0) {
        setSuccess('Scrape succeeded but product_information was empty for this ASIN.');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Preview failed');
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
    setSelectedPaths(new Set(previewRows.map((r) => r.jsonPath)));
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
      const { data } = await api.post('/amazon-pi-source-columns/import-rows', {
        sourceAsin: previewMeta.asin,
        rows,
      });
      setSavedColumns(data.columns || []);
      setSuccess(
        `Saved ${data.saved ?? rows.length} column(s). They now appear under Amazon Source Field on Manage Templates.`
      );
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteSaved = async (id) => {
    if (!window.confirm('Remove this column from the catalog?')) return;
    setError('');
    try {
      await api.delete(`/amazon-pi-source-columns/${id}`);
      await loadSaved();
      setSuccess('Column removed.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Delete failed');
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Amazon Product Info Columns
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Scrape <code>product_information</code> from one ASIN, review flattened <strong>column (path)</strong> and{' '}
        <strong>value</strong> rows, then save the ones you want. Saved paths become extra{' '}
        <strong>Amazon Source Field</strong> options in{' '}
        <Link to="/admin/manage-templates">Manage Listing Templates</Link> (and seller template overrides) for direct mapping
        and AI placeholders like <code>{'{amazon_pi_your_key}'}</code>.
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Uses the same ScraperAPI product scrape as live listings (one credit per preview). Values shown are samples from
        that ASIN; at listing time each row resolves from the current product&apos;s <code>product_information</code>.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Preview from ASIN
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
          <TextField
            label="ASIN"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
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
            {loadingPreview ? <CircularProgress size={22} color="inherit" /> : 'Preview product_information'}
          </Button>
          <Button variant="outlined" onClick={loadSaved} disabled={loadingSaved}>
            Refresh saved list
          </Button>
        </Stack>

        {previewRows.length > 0 && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Button size="small" onClick={selectAllPreview}>
                Select all
              </Button>
              <Button size="small" onClick={clearPreviewSelection}>
                Clear selection
              </Button>
              <Button size="small" variant="contained" color="secondary" onClick={saveSelected} disabled={saving}>
                {saving ? 'Saving…' : `Save selected (${selectedPaths.size})`}
              </Button>
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Column (JSON path)</TableCell>
                    <TableCell>Template key (amazonField)</TableCell>
                    <TableCell>Value (sample)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.jsonPath} hover selected={selectedPaths.has(row.jsonPath)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedPaths.has(row.jsonPath)}
                          onChange={() => togglePath(row.jsonPath)}
                        />
                      </TableCell>
                      <TableCell>{row.jsonPath}</TableCell>
                      <TableCell>
                        <code>{row.key}</code>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 480, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Saved catalog
        </Typography>
        {loadingSaved ? (
          <CircularProgress size={28} />
        ) : savedColumns.length === 0 ? (
          <Typography color="text.secondary">No saved columns yet. Preview an ASIN and save selected rows.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Label (dropdown)</TableCell>
                  <TableCell>JSON path</TableCell>
                  <TableCell>amazonField key</TableCell>
                  <TableCell>Last sample</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {savedColumns.map((col) => (
                  <TableRow key={col._id}>
                    <TableCell>{col.label}</TableCell>
                    <TableCell>{col.jsonPath}</TableCell>
                    <TableCell>
                      <code>{col.key}</code>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {col.lastSampleValue}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" color="error" onClick={() => deleteSaved(col._id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
