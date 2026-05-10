import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Switch,
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

export default function CronJobsPage() {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''))),
    [rows]
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/cron-jobs');
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      const nextDraft = {};
      for (const row of list) {
        nextDraft[row.jobKey] = {
          cronExpr: row.cronExpr || '',
          timezone: row.timezone || '',
          enabled: Boolean(row.enabled),
        };
      }
      setDraft(nextDraft);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load cron jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setField = (jobKey, key, value) => {
    setDraft((prev) => ({
      ...prev,
      [jobKey]: {
        ...(prev[jobKey] || {}),
        [key]: value,
      },
    }));
  };

  const saveOne = async (row) => {
    const state = draft[row.jobKey] || {};
    setError('');
    setSuccess('');
    setSavingKey(row.jobKey);
    try {
      await api.put(`/cron-jobs/${row.jobKey}`, {
        cronExpr: String(state.cronExpr || '').trim(),
        timezone: String(state.timezone || '').trim(),
        enabled: Boolean(state.enabled),
      });
      setSuccess(`Saved: ${row.label}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to save ${row.label}`);
    } finally {
      setSavingKey('');
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>Cron Jobs</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 820 }}>
        Configure scheduler expressions and enable/disable jobs. Saving a row immediately reloads backend schedulers.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert> : null}

      {loading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Job</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Cron</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Timezone</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Next run</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Enabled</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 120 }} align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => {
                const state = draft[row.jobKey] || { cronExpr: '', timezone: '', enabled: false };
                const busy = savingKey === row.jobKey;
                return (
                  <TableRow key={row.jobKey} hover>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.label || row.jobKey}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.description || row.jobKey}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={state.cronExpr}
                        onChange={(e) => setField(row.jobKey, 'cronExpr', e.target.value)}
                        placeholder="*/5 * * * *"
                        sx={{ minWidth: 170 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={state.timezone}
                        onChange={(e) => setField(row.jobKey, 'timezone', e.target.value)}
                        placeholder="Asia/Kolkata"
                        sx={{ minWidth: 160 }}
                      />
                    </TableCell>
                    <TableCell>
                      {row.enabled ? (
                        row.nextRunAt ? (
                          <Typography variant="body2">
                            {new Date(row.nextRunAt).toLocaleString()}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            {row.nextRunError || '—'}
                          </Typography>
                        )
                      ) : (
                        <Typography variant="caption" color="text.secondary">Disabled</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={Boolean(state.enabled)}
                        onChange={(e) => setField(row.jobKey, 'enabled', e.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => saveOne(row)}
                        disabled={busy}
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">No cron jobs configured.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
