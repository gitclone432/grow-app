import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress
} from '@mui/material';
import { parseBulkAsins } from '../utils/asinDirectoryUtils.js';
import api, { getAuthToken } from '../lib/api.js';

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: '🇺🇸 Amazon.com (US)' },
  { value: 'UK', label: '🇬🇧 Amazon.co.uk (UK)' },
  { value: 'CA', label: '🇨🇦 Amazon.ca (Canada)' },
  { value: 'AU', label: '🇦🇺 Amazon.com.au (Australia)' },
];

export default function AsinBulkAddDialog({ open, onClose, onAdd }) {
  const [asinText, setAsinText] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [region, setRegion] = useState('US');
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const handleTextChange = (e) => {
    const text = e.target.value;
    setAsinText(text);
    if (text.trim()) {
      const parsed = parseBulkAsins(text);
      setPreview(parsed);
    } else {
      setPreview(null);
    }
  };

  const handleAdd = () => {
    if (!preview || preview.valid.length === 0) {
      setError('No valid ASINs to add');
      return;
    }

    setLoading(true);
    setError('');
    setProgress({ done: 0, total: preview.valid.length });

    const asinsParam = encodeURIComponent(preview.valid.join(','));
    const token = encodeURIComponent(getAuthToken() || '');
    const url = `${api.defaults.baseURL}/asin-directory/bulk-manual-stream?asins=${asinsParam}&region=${region}&token=${token}`;
    const es = new EventSource(url);

    es.addEventListener('progress', (e) => {
      const { done, total } = JSON.parse(e.data);
      setProgress({ done, total });
    });

    es.addEventListener('complete', (e) => {
      es.close();
      const result = JSON.parse(e.data);
      setLoading(false);
      setProgress({ done: 0, total: 0 });
      setAsinText('');
      setPreview(null);
      // bubble result up so parent can show success message
      if (onAdd) onAdd(result);
      onClose();
    });

    es.addEventListener('error', (e) => {
      es.close();
      let msg = 'Failed to add ASINs';
      try { msg = JSON.parse(e.data).message || msg; } catch {}
      setError(msg);
      setLoading(false);
      setProgress({ done: 0, total: 0 });
    });

    es.onerror = () => {
      es.close();
      setError('Connection lost. Please try again.');
      setLoading(false);
      setProgress({ done: 0, total: 0 });
    };
  };

  const handleClose = () => {
    if (loading) return; // block close while streaming
    setAsinText('');
    setPreview(null);
    setError('');
    onClose();
  };

  const progressPct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add ASINs Manually</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            <Typography variant="body2">
              Paste ASINs separated by newlines, commas, semicolons, or spaces.
              Each ASIN should be 10 characters starting with 'B'.
            </Typography>
          </Alert>

          <FormControl size="small" sx={{ maxWidth: 280 }} disabled={loading}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              value={region}
              label="Marketplace"
              onChange={(e) => setRegion(e.target.value)}
            >
              {MARKETPLACE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            multiline
            rows={10}
            fullWidth
            placeholder="B08N5WRWNW&#10;B07K2G8Z4Q&#10;B09H3TLQX5&#10;..."
            value={asinText}
            onChange={handleTextChange}
            helperText="Example: B08N5WRWNW, B07K2G8Z4Q"
            disabled={loading}
          />

          {loading && (
            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Processing ASINs…
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {progress.done} / {progress.total}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{ borderRadius: 1, height: 8 }}
              />
            </Box>
          )}

          {!loading && preview && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Preview:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                {preview.valid.length > 0 && (
                  <Chip label={`${preview.valid.length} Valid`} color="success" size="small" />
                )}
                {preview.duplicates.length > 0 && (
                  <Chip label={`${preview.duplicates.length} Duplicates in Input`} color="warning" size="small" />
                )}
                {preview.invalid.length > 0 && (
                  <Chip label={`${preview.invalid.length} Invalid`} color="error" size="small" />
                )}
              </Stack>
              {preview.invalid.length > 0 && preview.invalid.length <= 10 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="error">
                    Invalid ASINs: {preview.invalid.join(', ')}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleAdd}
          variant="contained"
          disabled={loading || !preview || preview.valid.length === 0}
        >
          {loading ? `${progress.done} / ${progress.total} done…` : `Add ${preview?.valid.length || 0} ASINs`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
