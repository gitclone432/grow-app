import { useCallback, useEffect, useMemo, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Chip,
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

function statusChip(status) {
  if (status === 'ready') return <Chip size="small" color="success" label="Ready to import" />;
  return <Chip size="small" color="default" label="Skipped" />;
}

function messageMatchesSearch(m, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    m.from,
    m.subject,
    m.bodyPreview,
    m.skipReason,
    m.status,
    m.parsedAmount != null ? String(m.parsedAmount) : '',
    m.parsedDate ? new Date(m.parsedDate).toLocaleString() : '',
    m.internalDate ? new Date(m.internalDate).toLocaleString() : '',
    m.seen ? 'read' : 'unread',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export default function GmailTesterPage() {
  const [status, setStatus] = useState(null);
  const [limit, setLimit] = useState(500);
  const [mode, setMode] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [report, setReport] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/gmail-test/status');
      setStatus(data);
    } catch (e) {
      setStatus(null);
      setError(e?.response?.data?.error || e?.message || 'Failed to load Gmail status');
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const filteredMessages = useMemo(() => {
    const list = report?.messages || [];
    return list.filter((m) => {
      if (statusFilter === 'ready' && m.status !== 'ready') return false;
      if (statusFilter === 'skipped' && m.status !== 'skipped') return false;
      if (statusFilter === 'payoneer' && (!m.senderAllowed || !m.subjectAllowed)) return false;
      return messageMatchesSearch(m, search);
    });
  }, [report, search, statusFilter]);

  const selectedMessage = useMemo(
    () => filteredMessages.find((m) => m.uid === selectedUid) || filteredMessages[0] || null,
    [filteredMessages, selectedUid]
  );

  useEffect(() => {
    if (!filteredMessages.length) {
      setSelectedUid(null);
      return;
    }
    if (!filteredMessages.some((m) => m.uid === selectedUid)) {
      setSelectedUid(filteredMessages[0].uid);
    }
  }, [filteredMessages, selectedUid]);

  const runPreview = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setReport(null);
    try {
      const { data } = await api.post('/gmail-test/preview', {
        limit: Number(limit) || 500,
        mode,
      });
      setReport(data);
      if (data?.messages?.length) setSelectedUid(data.messages[0].uid);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!window.confirm('Import ready unread emails as Credit transactions? Already-imported mail is skipped.')) {
      return;
    }
    setImporting(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/gmail-test/import', { limit: Number(limit) || 25 });
      setSuccess(
        `Import done: scanned ${data?.scanned ?? 0}, imported ${data?.imported ?? 0}, skipped ${data?.skipped ?? 0}` +
          (data?.bankAccount ? ` → ${data.bankAccount}` : '')
      );
      await runPreview();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const copyBody = async () => {
    if (!selectedMessage?.bodyPreview) return;
    try {
      await navigator.clipboard.writeText(selectedMessage.bodyPreview);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    setTimeout(() => setCopyStatus(''), 2000);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        Gmail Tester
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Fetch inbox mail from Gmail, then search and filter results. Import still uses unread mail only
        (Payoneer sender + subject rules from server env).
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      ) : null}

      {status ? (
        <Alert severity={status.imapConfigured ? 'info' : 'warning'} sx={{ mb: 2 }}>
          {status.imapConfigured ? (
            <>
              IMAP: <strong>{status.imapUserMasked}</strong> @ {status.imapHost}:{status.imapPort}
              {status.bankAccount ? (
                <>
                  {' '}
                  → bank account <strong>{status.bankAccount.name}</strong>
                </>
              ) : (
                <> — no bank account resolved (set GMAIL_IMPORT_BANK_ACCOUNT_NAME or create one)</>
              )}
              . Senders:{' '}
              {status.allowedSenders?.length ? status.allowedSenders.join(', ') : '(any)'}
              . Subjects:{' '}
              {status.allowedSubjects?.length ? status.allowedSubjects.join(' | ') : '(any)'}
              . Cron: {status.cronEnabled ? `on (${status.cronExpr})` : 'off'}.
            </>
          ) : (
            <>
              Set <code>GMAIL_IMAP_USER</code> and <code>GMAIL_IMAP_APP_PASSWORD</code> on the API server,
              then restart.
            </>
          )}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              type="number"
              label="Max messages"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              inputProps={{ min: 1, max: 2000 }}
              helperText="Up to 2000 (whole inbox if smaller)"
              sx={{ width: 160 }}
            />
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="gmail-mode-label">Inbox scan</InputLabel>
              <Select
                labelId="gmail-mode-label"
                label="Inbox scan"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <MenuItem value="all">All inbox (read + unread)</MenuItem>
                <MenuItem value="recent">Latest N only</MenuItem>
                <MenuItem value="unread">Unread only (same as import)</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <MailOutlineIcon />}
              onClick={runPreview}
              disabled={loading || !status?.imapConfigured}
            >
              {loading ? 'Fetching…' : 'Fetch mail'}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={runImport}
              disabled={importing || !status?.imapConfigured || !status?.bankAccount}
            >
              {importing ? 'Importing…' : 'Import ready (unread)'}
            </Button>
          </Stack>

          {report ? (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search from, subject, body, amount, skip reason…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="gmail-status-filter">Show</InputLabel>
                <Select
                  labelId="gmail-status-filter"
                  label="Show"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All fetched</MenuItem>
                  <MenuItem value="ready">Ready to import</MenuItem>
                  <MenuItem value="skipped">Skipped</MenuItem>
                  <MenuItem value="payoneer">Payoneer match (sender + subject)</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      {report ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Inbox: ${report.inboxTotal ?? '?'}`} />
            <Chip label={`Fetched: ${report.scanned}`} />
            <Chip label={`Showing: ${filteredMessages.length}`} color="primary" variant="outlined" />
            <Chip color="success" label={`Ready: ${report.ready ?? 0}`} />
            <Chip label={`Skipped: ${report.skipped ?? 0}`} />
            <Chip variant="outlined" label={`Mode: ${report.mode}`} />
          </Stack>

          <GridLikeLayout
            messages={filteredMessages}
            totalFetched={report.messages?.length ?? 0}
            selectedUid={selectedUid}
            onSelect={setSelectedUid}
            selectedMessage={selectedMessage}
            copyStatus={copyStatus}
            onCopyBody={copyBody}
          />
        </Stack>
      ) : (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Click <strong>Fetch mail</strong> to load inbox messages, then use search to find Payoneer or
            other mail.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

function GridLikeLayout({
  messages,
  totalFetched,
  selectedUid,
  onSelect,
  selectedMessage,
  copyStatus,
  onCopyBody,
}) {
  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper sx={{ flex: 1, p: 0, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>From</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(messages || []).map((m) => (
                <TableRow
                  key={m.uid}
                  hover
                  selected={m.uid === selectedUid}
                  onClick={() => onSelect(m.uid)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{statusChip(m.status)}</TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Typography variant="body2" noWrap title={m.from}>
                      {m.from}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block" title={m.subject}>
                      {m.subject}
                    </Typography>
                  </TableCell>
                  <TableCell>{m.parsedAmount ?? '—'}</TableCell>
                  <TableCell>
                    {m.parsedDate ? new Date(m.parsedDate).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!messages?.length ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    {totalFetched > 0
                      ? 'No messages match your search or filter.'
                      : 'No messages in this scan.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ flex: 1, p: 2 }}>
        {selectedMessage ? (
          <Stack spacing={1.5}>
            <Typography variant="h6">Message detail</Typography>
            <Typography variant="body2">
              <strong>Subject:</strong> {selectedMessage.subject || '(none)'}
            </Typography>
            <Typography variant="body2">
              <strong>From:</strong> {selectedMessage.from}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={selectedMessage.seen ? 'Read' : 'Unread'} />
              {selectedMessage.alreadyProcessed ? (
                <Chip size="small" color="warning" label="Already imported" />
              ) : null}
              {selectedMessage.senderAllowed && selectedMessage.subjectAllowed ? (
                <Chip size="small" color="info" label="Payoneer rules OK" />
              ) : null}
              {!selectedMessage.senderAllowed ? (
                <Chip size="small" color="error" label="Sender blocked" />
              ) : null}
              {!selectedMessage.subjectAllowed ? (
                <Chip size="small" color="error" label="Subject blocked" />
              ) : null}
            </Stack>
            {selectedMessage.skipReason ? (
              <Alert severity="warning">{selectedMessage.skipReason}</Alert>
            ) : null}
            <Typography variant="subtitle2">Parsed for import</Typography>
            <Typography variant="body2">
              Amount: <strong>{selectedMessage.parsedAmount ?? '—'}</strong>
              <br />
              Date:{' '}
              <strong>
                {selectedMessage.parsedDate
                  ? new Date(selectedMessage.parsedDate).toLocaleString()
                  : '—'}
              </strong>
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2">Body preview</Typography>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={onCopyBody}>
                Copy
              </Button>
              {copyStatus ? (
                <Typography variant="caption" color="text.secondary">
                  {copyStatus}
                </Typography>
              ) : null}
            </Stack>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                maxHeight: 320,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {selectedMessage.bodyPreview || '(empty)'}
            </Paper>
          </Stack>
        ) : (
          <Typography color="text.secondary">Select a row to see details.</Typography>
        )}
      </Paper>
    </Stack>
  );
}
