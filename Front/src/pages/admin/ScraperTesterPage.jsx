import { useMemo, useRef, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import api from '../../lib/api.js';

const REGIONS = [
  { value: 'US', label: 'United States (amazon.com)' },
  { value: 'UK', label: 'United Kingdom (amazon.co.uk)' },
  { value: 'CA', label: 'Canada (amazon.ca)' },
  { value: 'AU', label: 'Australia (amazon.com.au)' },
];

export default function ScraperTesterPage() {
  const [asin, setAsin] = useState('');
  const [region, setRegion] = useState('US');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [responseText, setResponseText] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const copyTimerRef = useRef(null);

  const prettyResponse = useMemo(
    () => responseText || 'Run a request to see the raw ScraperAPI JSON.',
    [responseText]
  );

  const runScrape = async () => {
    setLoading(true);
    setError('');
    setResponseText('');
    setCopyStatus('');
    const normalized = String(asin || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== 10) {
      setError('Enter a valid 10-character ASIN.');
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.post(
        '/amazon-debug-scrape/raw',
        { asin: normalized, region },
        { timeout: 120000 }
      );
      setResponseText(JSON.stringify(data, null, 2));
    } catch (e) {
      const isNetwork =
        e?.code === 'ERR_NETWORK' ||
        String(e?.message || '').toLowerCase().includes('network error');
      const hint = isNetwork
        ? ' No response from the server. Confirm the API is running and VITE_API_URL is correct. If other admin pages work, try pausing ad blockers for this site (they sometimes block scrape-related paths).'
        : '';
      setError((e?.response?.data?.error || e?.message || 'Request failed') + hint);
      setResponseText(
        JSON.stringify(
          e?.response?.data || { error: e.message, code: e.code },
          null,
          2
        )
      );
    } finally {
      setLoading(false);
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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        Scraper Tester
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Fetches the raw JSON from ScraperAPI&apos;s structured Amazon product endpoint (same URL as
        the listing pipeline). Each run uses API credits—use for debugging only.
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        Requires <code>SCRAPER_API_KEY</code> on the server. Superadmin and listing admin only
        (page access <code>ScraperTester</code>). If you see a generic network error while other
        admin pages load, check ad blockers and that this environment can reach the API (see{' '}
        <code>VITE_API_URL</code>).
      </Alert>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'flex-end' }}>
          <TextField
            label="ASIN"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            placeholder="B08N5WRWNW"
            size="small"
            sx={{ minWidth: 200 }}
            inputProps={{ maxLength: 32 }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Region</InputLabel>
            <Select
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {REGIONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={runScrape} disabled={loading}>
            {loading ? 'Running…' : 'Fetch raw'}
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h6">Response</Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            {copyStatus ? (
              <Typography variant="caption" color="text.secondary">
                {copyStatus}
              </Typography>
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
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1,
            bgcolor: '#0b1020',
            color: '#d6e2ff',
            overflow: 'auto',
            maxHeight: '65vh',
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
