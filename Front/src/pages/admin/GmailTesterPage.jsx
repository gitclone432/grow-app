import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
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
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import api from '../../lib/api.js';
import { formatYyyyMmDdPt, getTodayPtDateString } from '../../lib/pacificDate.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const PREVIEW_TIMEOUT_MS = 180000;

const QUICK_SEARCHES = [
  { label: 'Payoneer', value: 'payoneer' },
  { label: 'Automatic withdrawal', value: 'automatic withdrawal' },
  { label: 'Unread only', value: 'unread' },
];

function statusChip(status) {
  if (status === 'ready') return <Chip size="small" color="success" label="Ready" />;
  return <Chip size="small" color="default" variant="outlined" label="Skipped" />;
}

function messageMatchesSearch(m, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    m.from,
    m.subject,
    m.parsedGreetingLine,
    m.parsedGreetingName,
    m.skipReason,
    m.status,
    m.parsedAmount != null ? String(m.parsedAmount) : '',
    m.parsedAmountUsd != null ? String(m.parsedAmountUsd) : '',
    m.parsedExchangeRate != null ? String(m.parsedExchangeRate) : '',
    m.parsedBankDepositInr != null ? String(m.parsedBankDepositInr) : '',
    m.parsedCustomerId || '',
    m.parsedDate ? new Date(m.parsedDate).toLocaleString() : '',
    m.internalDate ? new Date(m.internalDate).toLocaleString() : '',
    m.seen ? 'read' : 'unread',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function formatExtractedSummary(m) {
  if (!m) return '';
  const lines = [];
  if (m.parsedGreetingLine) lines.push(m.parsedGreetingLine);
  if (m.parsedAmountUsd != null) lines.push(`Amount: $${m.parsedAmountUsd}`);
  if (m.parsedExchangeRate != null) lines.push(`Exchange rate: 1 USD = ${m.parsedExchangeRate} INR`);
  const inr = m.parsedBankDepositInr ?? m.parsedAmount;
  if (inr != null) lines.push(`Bank deposit: ₹${inr} INR`);
  if (m.parsedCustomerId) lines.push(`Customer ID: ${m.parsedCustomerId}`);
  return lines.join('\n');
}

/** Received date in PT (internalDate), else parsed transaction date. */
function getMessagePtDateKey(m) {
  return formatYyyyMmDdPt(m.internalDate || m.parsedDate);
}

function messageMatchesDateFilter(m, { mode, singleDate, rangeStart, rangeEnd }) {
  if (mode === 'none') return true;
  const day = getMessagePtDateKey(m);
  if (!day) return false;
  if (mode === 'single') {
    return Boolean(singleDate) && day === singleDate;
  }
  if (mode === 'range') {
    if (rangeStart && day < rangeStart) return false;
    if (rangeEnd && day > rangeEnd) return false;
    return Boolean(rangeStart || rangeEnd);
  }
  return true;
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

export default function GmailTesterPage() {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(500);
  const [importLimit, setImportLimit] = useState(25);
  const [mode, setMode] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('payoneer');
  const [dateFilterMode, setDateFilterMode] = useState('none');
  const [singleDate, setSingleDate] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [report, setReport] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [payoneerSyncLoading, setPayoneerSyncLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const { data } = await api.get('/gmail-test/status');
      setStatus(data);
      setError((prev) => (prev && prev.includes('Failed to load Gmail status') ? '' : prev));
    } catch (e) {
      setStatus(null);
      setError(e?.response?.data?.error || e?.message || 'Failed to load Gmail status');
    } finally {
      setStatusLoading(false);
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
      if (statusFilter === 'unread' && m.seen) return false;
      if (
        !messageMatchesDateFilter(m, {
          mode: dateFilterMode,
          singleDate,
          rangeStart: dateRange.start,
          rangeEnd: dateRange.end,
        })
      ) {
        return false;
      }
      return messageMatchesSearch(m, search);
    });
  }, [report, search, statusFilter, dateFilterMode, singleDate, dateRange]);

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
      const { data } = await api.post(
        '/gmail-test/preview',
        {
          limit: Number(previewLimit) || 500,
          mode,
        },
        { timeout: PREVIEW_TIMEOUT_MS }
      );
      setReport(data);
      if (data?.messages?.length) setSelectedUid(data.messages[0].uid);
    } catch (e) {
      const isTimeout = e?.code === 'ECONNABORTED';
      setError(
        (e?.response?.data?.error || e?.message || 'Preview failed') +
          (isTimeout ? ' Try a lower max messages or use “Latest N only”.' : '')
      );
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (
      !window.confirm(
        `Import up to ${importLimit} unread Payoneer emails as Credit transactions? Already-imported mail is skipped.`
      )
    ) {
      return;
    }
    setImporting(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/gmail-test/import', {
        limit: Number(importLimit) || 25,
      });
      setSuccess(
        `Import done: scanned ${data?.scanned ?? 0}, imported ${data?.imported ?? 0}, skipped ${data?.skipped ?? 0}`
      );
      await runPreview();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const copyExtracted = async () => {
    const text = formatExtractedSummary(selectedMessage);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    setTimeout(() => setCopyStatus(''), 2000);
  };

  const applyToPayoneerSheet = async () => {
    if (!selectedMessage?.uid) return;
    setPayoneerSyncLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/gmail-test/sync-payoneer', { uid: selectedMessage.uid });
      if (data?.status === 'updated' || data?.status === 'created') {
        setSuccess(
          (data.status === 'created'
            ? `Payoneer row created and saved for ${data.storeUsername || 'store'}`
            : `Payoneer sheet updated for ${data.storeUsername || 'store'}`) +
            ` — rate ${data.exchangeRate}, deposit ₹${data.bankDepositInr}. ` +
            `Open Payoneer Sheet to view.`
        );
      } else {
        setError(data?.skipReason || 'Could not match this email to a Payoneer row.');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to update Payoneer sheet');
    } finally {
      setPayoneerSyncLoading(false);
    }
  };

  const canApplyToPayoneer =
    selectedMessage?.parsedAmountUsd != null &&
    selectedMessage?.parsedGreetingName &&
    (selectedMessage?.parsedExchangeRate != null || selectedMessage?.parsedBankDepositInr != null);

  const payoneerReadyCount = useMemo(() => {
    if (!report?.messages) return 0;
    return report.messages.filter(
      (m) =>
        m.status === 'ready' &&
        m.senderAllowed &&
        m.subjectAllowed &&
        !m.seen &&
        messageMatchesDateFilter(m, {
          mode: dateFilterMode,
          singleDate,
          rangeStart: dateRange.start,
          rangeEnd: dateRange.end,
        })
    ).length;
  }, [report, dateFilterMode, singleDate, dateRange]);

  const clearDateFilter = () => {
    setDateFilterMode('none');
    setSingleDate('');
    setDateRange({ start: '', end: '' });
  };

  const dateFilterActive =
    dateFilterMode === 'single'
      ? Boolean(singleDate)
      : dateFilterMode === 'range'
        ? Boolean(dateRange.start || dateRange.end)
        : false;

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Gmail Tester
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Preview Payoneer withdrawal emails and update{' '}
            <Link component={RouterLink} to="/admin/payoneer">
              Payoneer Sheet
            </Link>{' '}
            (exchange rate + bank deposit matched by USD amount and store name from the greeting).
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={statusLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={loadStatus}
          disabled={statusLoading}
        >
          Refresh status
        </Button>
      </Stack>

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

      <StatusPanel status={status} apiBase={API_BASE} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          1. Fetch inbox → 2. Search / filter → 3. Check parsed amount → 4. Import unread credits
        </Typography>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ md: 'flex-end' }}
            flexWrap="wrap"
            useFlexGap
          >
            <TextField
              size="small"
              type="number"
              label="Max messages (preview)"
              value={previewLimit}
              onChange={(e) => setPreviewLimit(e.target.value)}
              inputProps={{ min: 1, max: 2000 }}
              helperText="Up to 2000"
              sx={{ width: { xs: '100%', sm: 170 } }}
            />
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 280 } }}>
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
          </Stack>

          <Divider />

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ md: 'flex-end' }}
            flexWrap="wrap"
            useFlexGap
          >
            <TextField
              size="small"
              type="number"
              label="Import limit"
              value={importLimit}
              onChange={(e) => setImportLimit(e.target.value)}
              inputProps={{ min: 1, max: 100 }}
              helperText="Unread only, max 100"
              sx={{ width: { xs: '100%', sm: 140 } }}
            />
            <Button
              variant="outlined"
              color="secondary"
              onClick={runImport}
              disabled={importing || !status?.imapConfigured}
            >
              {importing ? 'Importing…' : 'Import credits (unread)'}
            </Button>
            {status?.imapConfigured && payoneerReadyCount > 0 && !report ? (
              <Typography variant="caption" color="text.secondary">
                Fetch mail first to see how many rows are ready.
              </Typography>
            ) : null}
            {report && payoneerReadyCount > 0 ? (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`${payoneerReadyCount} unread Payoneer-ready`}
              />
            ) : null}
          </Stack>

          {report ? (
            <>
              <Divider />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search from, subject, amount, greeting, skip reason…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                      startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
                    <InputLabel id="gmail-status-filter">Show</InputLabel>
                    <Select
                      labelId="gmail-status-filter"
                      label="Show"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <MenuItem value="payoneer">Payoneer match (sender + subject)</MenuItem>
                      <MenuItem value="all">All fetched</MenuItem>
                      <MenuItem value="ready">Ready to import</MenuItem>
                      <MenuItem value="skipped">Skipped</MenuItem>
                      <MenuItem value="unread">Unread only</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  alignItems={{ md: 'flex-end' }}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                    <InputLabel id="gmail-date-mode">Date filter</InputLabel>
                    <Select
                      labelId="gmail-date-mode"
                      label="Date filter"
                      value={dateFilterMode}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDateFilterMode(v);
                        if (v === 'none') {
                          setSingleDate('');
                          setDateRange({ start: '', end: '' });
                        }
                      }}
                    >
                      <MenuItem value="none">All dates</MenuItem>
                      <MenuItem value="single">Single day</MenuItem>
                      <MenuItem value="range">Date range</MenuItem>
                    </Select>
                  </FormControl>
                  {dateFilterMode === 'single' ? (
                    <TextField
                      size="small"
                      type="date"
                      label="Received date (PT)"
                      value={singleDate}
                      onChange={(e) => setSingleDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: { xs: '100%', sm: 200 } }}
                      helperText="Gmail received date, US Pacific"
                    />
                  ) : null}
                  {dateFilterMode === 'range' ? (
                    <>
                      <TextField
                        size="small"
                        type="date"
                        label="From (PT)"
                        value={dateRange.start}
                        onChange={(e) =>
                          setDateRange((prev) => ({ ...prev, start: e.target.value }))
                        }
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: { xs: '100%', sm: 170 } }}
                      />
                      <TextField
                        size="small"
                        type="date"
                        label="To (PT)"
                        value={dateRange.end}
                        onChange={(e) =>
                          setDateRange((prev) => ({ ...prev, end: e.target.value }))
                        }
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: { xs: '100%', sm: 170 } }}
                      />
                    </>
                  ) : null}
                  {dateFilterMode !== 'none' ? (
                    <Button size="small" onClick={clearDateFilter}>
                      Clear dates
                    </Button>
                  ) : null}
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {QUICK_SEARCHES.map((q) => (
                    <Chip
                      key={q.value}
                      size="small"
                      label={q.label}
                      variant={search === q.value ? 'filled' : 'outlined'}
                      onClick={() => setSearch(q.value)}
                      clickable
                    />
                  ))}
                  {search ? (
                    <Chip size="small" label="Clear search" onClick={() => setSearch('')} clickable />
                  ) : null}
                  <Chip
                    size="small"
                    label="Today (PT)"
                    variant={
                      dateFilterMode === 'single' && singleDate === getTodayPtDateString()
                        ? 'filled'
                        : 'outlined'
                    }
                    onClick={() => {
                      setDateFilterMode('single');
                      setSingleDate(getTodayPtDateString());
                      setDateRange({ start: '', end: '' });
                    }}
                    clickable
                  />
                </Stack>
              </Stack>
            </>
          ) : null}
        </Stack>
      </Paper>

      {report ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <Chip label={`Inbox: ${report.inboxTotal ?? '?'}`} />
            {report.imapFiltered ? (
              <Chip
                label={`Payoneer match in inbox: ${report.matchingInboxTotal ?? report.scanned ?? '?'}`}
                color="info"
                variant="outlined"
              />
            ) : null}
            <Chip label={`Fetched: ${report.scanned}`} />
            <Chip label={`Showing: ${filteredMessages.length}`} color="primary" variant="outlined" />
            <Chip color="success" label={`Ready: ${report.ready ?? 0}`} />
            <Chip label={`Skipped: ${report.skipped ?? 0}`} />
            <Chip variant="outlined" label={`Scan: ${report.mode}`} />
            {dateFilterActive ? (
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={
                  dateFilterMode === 'single'
                    ? `Date: ${singleDate}`
                    : `Dates: ${dateRange.start || '…'} → ${dateRange.end || '…'}`
                }
                onDelete={clearDateFilter}
              />
            ) : null}
          </Stack>

          <MailResultsLayout
            messages={filteredMessages}
            totalFetched={report.messages?.length ?? 0}
            selectedUid={selectedUid}
            onSelect={setSelectedUid}
            selectedMessage={selectedMessage}
            copyStatus={copyStatus}
            onCopyExtracted={copyExtracted}
            onApplyPayoneer={applyToPayoneerSheet}
            payoneerSyncLoading={payoneerSyncLoading}
            canApplyToPayoneer={canApplyToPayoneer}
          />
        </Stack>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <MailOutlineIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            Click <strong>Fetch mail</strong> to load inbox messages from the API server.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {status?.allowedSenders?.length || status?.allowedSubjects?.length
              ? 'Fetch uses server sender/subject filters via Gmail search — not the full inbox.'
              : 'Set GMAIL_IMPORT_ALLOWED_SENDERS and GMAIL_IMPORT_ALLOWED_SUBJECTS on the API to pre-filter Payoneer mail.'}{' '}
            Large unfiltered inboxes may take up to a few minutes.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

function StatusPanel({ status, apiBase }) {
  if (!status) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Could not load Gmail status from <code>{apiBase}</code>. Is the API running?
      </Alert>
    );
  }

  if (!status.imapConfigured) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Gmail IMAP is not configured on the API host. On <strong>Render</strong> (API service, not
        Vercel), set <code>GMAIL_IMAP_USER</code> and <code>GMAIL_IMAP_APP_PASSWORD</code> (Google App
        Password with 2FA), then <strong>Manual Deploy</strong>. Local: add the same to{' '}
        <code>Back/.env</code> and restart <code>npm run dev</code>.
      </Alert>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Chip size="small" color="success" label="IMAP connected" />
          <Typography variant="body2">
            <strong>{status.imapUserMasked}</strong> @ {status.imapHost}:{status.imapPort}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={`Cron: ${status.cronEnabled ? status.cronExpr : 'off (manual import)'}`}
          />
        </Stack>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            Server filters (env)
          </Typography>
          <Typography variant="body2" component="div">
            <strong>Senders:</strong>{' '}
            {status.allowedSenders?.length ? status.allowedSenders.join(', ') : '(any — not recommended)'}
          </Typography>
          <Typography variant="body2" component="div">
            <strong>Subjects:</strong>{' '}
            {status.allowedSubjects?.length
              ? status.allowedSubjects.join(' | ')
              : '(any — not recommended)'}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          API: <code>{apiBase}</code> · With env filters, fetch runs Gmail search (
          <strong>from</strong> + <strong>subject</strong>) before downloading bodies. Import still
          uses <strong>unread</strong> mail only.
        </Typography>
      </Stack>
    </Paper>
  );
}

function MailResultsLayout({
  messages,
  totalFetched,
  selectedUid,
  onSelect,
  selectedMessage,
  copyStatus,
  onCopyExtracted,
  onApplyPayoneer,
  payoneerSyncLoading,
  canApplyToPayoneer,
}) {
  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper sx={{ flex: 1.2, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 560 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell width={88}>Status</TableCell>
                <TableCell>From / subject</TableCell>
                <TableCell>Amount / INR</TableCell>
                <TableCell width={150}>Received</TableCell>
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
                  <TableCell>
                    <Stack spacing={0.5}>
                      {statusChip(m.status)}
                      <Chip
                        size="small"
                        label={m.seen ? 'Read' : 'Unread'}
                        color={m.seen ? 'default' : 'info'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography variant="body2" noWrap title={m.from}>
                      {m.from}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                      title={m.subject}
                    >
                      {m.subject || '(no subject)'}
                    </Typography>
                    {m.skipReason ? (
                      <Tooltip title={m.skipReason}>
                        <Typography variant="caption" color="warning.main" noWrap display="block">
                          {m.skipReason}
                        </Typography>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {m.parsedBankDepositInr != null || m.parsedAmount != null ? (
                      <>
                        <Typography variant="body2" fontWeight={600}>
                          ₹{m.parsedBankDepositInr ?? m.parsedAmount}
                        </Typography>
                        {m.parsedAmountUsd != null ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            ${m.parsedAmountUsd}
                          </Typography>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">
                      {formatWhen(m.internalDate)}
                    </Typography>
                    {m.parsedDate ? (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Parsed: {formatWhen(m.parsedDate)}
                      </Typography>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!messages?.length ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    {totalFetched > 0
                      ? 'No messages match your search, date, or filter. Try “All fetched” or clear filters.'
                      : 'No messages in this scan.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ flex: 1, p: 2, minHeight: 320 }}>
        {selectedMessage ? (
          <Stack spacing={1.5}>
            <Typography variant="h6">Message detail</Typography>
            <Typography variant="body2">
              <strong>Subject:</strong> {selectedMessage.subject || '(none)'}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
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
              {selectedMessage.status === 'ready' && !selectedMessage.seen ? (
                <Chip size="small" color="success" label="Will import on next run" />
              ) : null}
            </Stack>
            {selectedMessage.skipReason ? (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                {selectedMessage.skipReason}
              </Alert>
            ) : null}
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2">Extracted from Payoneer email</Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={onApplyPayoneer}
                disabled={!canApplyToPayoneer || payoneerSyncLoading}
              >
                {payoneerSyncLoading ? 'Updating…' : 'Update Payoneer Sheet'}
              </Button>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={onCopyExtracted}
                disabled={!formatExtractedSummary(selectedMessage)}
              >
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
                p: 2,
                bgcolor: 'action.hover',
              }}
            >
              {selectedMessage.parsedGreetingLine ? (
                <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
                  {selectedMessage.parsedGreetingLine}
                </Typography>
              ) : null}
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Amount (USD)
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedMessage.parsedAmountUsd != null
                      ? `$${selectedMessage.parsedAmountUsd}`
                      : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Exchange rate
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedMessage.parsedExchangeRate != null
                      ? `1 USD = ${selectedMessage.parsedExchangeRate} INR`
                      : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Bank deposit (INR)
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedMessage.parsedBankDepositInr != null
                      ? `₹${selectedMessage.parsedBankDepositInr}`
                      : selectedMessage.parsedAmount != null
                        ? `₹${selectedMessage.parsedAmount}`
                        : '—'}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
            {selectedMessage.parsedCustomerId ? (
              <Typography variant="body2">
                <strong>Customer ID:</strong>{' '}
                <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace' }}>
                  {selectedMessage.parsedCustomerId}
                </Box>
              </Typography>
            ) : null}
            <Typography variant="caption" color="text.secondary" display="block">
              Transaction credit uses bank deposit (INR). Date:{' '}
              {formatWhen(selectedMessage.parsedDate)}
            </Typography>
          </Stack>
        ) : (
          <Typography color="text.secondary" sx={{ pt: 4, textAlign: 'center' }}>
            Select a row to inspect parsing and skip reasons.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
