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
  Tooltip,
  Typography,
} from '@mui/material';
import cronstrue from 'cronstrue';
import api from '../../lib/api.js';

const MONO = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: '0.8125rem',
  letterSpacing: '0.02em',
};

/** Plain-English schedule from a 5-field cron (best-effort). */
function describeCronExpression(expr) {
  const s = String(expr || '').trim();
  if (!s) return '';
  try {
    return cronstrue.toString(s, { use24HourTimeFormat: false });
  } catch {
    return '';
  }
}

/** Next run: separate DATE and TIME lines so nothing looks like one unreadable blob. */
function formatNextRunLines(iso, timezone) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = (timezone || '').trim();
  const base = {};
  if (tz) base.timeZone = tz;
  let dateLine;
  let timeLine;
  try {
    dateLine = new Intl.DateTimeFormat(undefined, {
      ...base,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
    timeLine = new Intl.DateTimeFormat(undefined, {
      ...base,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'long',
    }).format(d);
  } catch {
    dateLine = d.toDateString();
    timeLine = d.toLocaleTimeString(undefined, { hour12: true });
  }
  const zoneNote = tz ? `Schedule timezone: ${tz}` : 'Using your browser locale (set IANA zone next column for fixed zone)';
  return { dateLine, timeLine, zoneNote, iso };
}

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
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Job</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', minWidth: 180 }}>Cron</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', minWidth: 140 }}>Timezone</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', minWidth: 220 }}>Next run</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Enabled</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 120 }} align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => {
                const state = draft[row.jobKey] || { cronExpr: '', timezone: '', enabled: false };
                const busy = savingKey === row.jobKey;
                const cronHuman = describeCronExpression(state.cronExpr);
                return (
                  <TableRow key={row.jobKey} hover>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.label || row.jobKey}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.description || row.jobKey}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <TextField
                        size="small"
                        value={state.cronExpr}
                        onChange={(e) => setField(row.jobKey, 'cronExpr', e.target.value)}
                        placeholder="*/5 * * * *"
                        fullWidth
                        inputProps={{
                          spellCheck: false,
                          'aria-label': 'Cron expression',
                          style: MONO,
                        }}
                      />
                      {cronHuman ? (
                        <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'text.secondary', lineHeight: 1.45 }}>
                          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>Means: </Box>
                          {cronHuman}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <TextField
                        size="small"
                        value={state.timezone}
                        onChange={(e) => setField(row.jobKey, 'timezone', e.target.value)}
                        placeholder="Asia/Kolkata"
                        fullWidth
                        inputProps={{
                          spellCheck: false,
                          'aria-label': 'IANA timezone',
                          style: MONO,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top', py: 1, bgcolor: 'grey.50', borderLeft: '1px solid', borderColor: 'divider' }}>
                      {row.enabled ? (
                        row.nextRunAt ? (
                          (() => {
                            const lines = formatNextRunLines(row.nextRunAt, row.timezone);
                            if (!lines) {
                              return (
                                <Typography variant="body2" color="text.secondary">
                                  Invalid time
                                </Typography>
                              );
                            }
                            return (
                              <Tooltip title={`ISO: ${lines.iso}`}>
                                <Stack spacing={0.25}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.35 }}>
                                    {lines.dateLine}
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark', lineHeight: 1.35 }}>
                                    {lines.timeLine}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                                    {lines.zoneNote}
                                  </Typography>
                                </Stack>
                              </Tooltip>
                            );
                          })()
                        ) : (
                          <Typography variant="body2" color="error" sx={{ lineHeight: 1.45, wordBreak: 'break-word' }}>
                            {row.nextRunError || 'Could not compute next run'}
                          </Typography>
                        )
                      ) : (
                        <Typography variant="body2" color="text.secondary">Disabled</Typography>
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
