import { useEffect, useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import GroupsIcon from '@mui/icons-material/Groups';
import PublicIcon from '@mui/icons-material/Public';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import api from '../../lib/api';
import { BRAND_DARK, BRAND_YELLOW } from '../../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import {
  tableHeaderCellSx,
  tableBodyRowSx,
  tableBodyCellSx,
  tableContainerSx,
  yellowOutlinedButtonSx
} from '../../theme/tableStyles.js';

const numberFmt = new Intl.NumberFormat('en-US');

function formatNumber(value) {
  return numberFmt.format(value || 0);
}

const REGIONS = ['US', 'UK', 'CA', 'AU'];

const REGION_LABELS = {
  US: 'Amazon.com (US)',
  UK: 'Amazon.co.uk (UK)',
  CA: 'Amazon.ca (Canada)',
  AU: 'Amazon.com.au (Australia)'
};

const DAY_OPTIONS = [
  { value: 1, label: 'Today (24h)' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' }
];

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function MetricCard({ icon, label, value, hint, tone = 'default' }) {
  const toneColor = {
    default: BRAND_DARK,
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706'
  }[tone];

  return (
    <Card
      sx={{
        flex: 1,
        minWidth: 180,
        borderRadius: `${dashboardSignatureTokens.radius.card}px`,
        border: '1px solid',
        borderColor: alpha(BRAND_DARK, 0.08),
        background: dashboardSignatureTokens.surfaces.metricCard,
        boxShadow: dashboardSignatureTokens.shadows.card
      }}
    >
      <CardContent sx={{ py: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: alpha(toneColor, 0.12),
              color: toneColor
            }}
          >
            {icon}
          </Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
        </Stack>
        <Typography variant="h5" fontWeight={800} sx={{ color: toneColor }}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">{hint}</Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SectionTable({ title, caption, children }) {
  return (
    <Paper sx={{ ...tableContainerSx, mb: 3 }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: alpha(BRAND_DARK, 0.08) }}>
        <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        {caption && (
          <Typography variant="caption" color="text.secondary">{caption}</Typography>
        )}
      </Box>
      {children}
    </Paper>
  );
}

export default function AsinPrecheckStatsPage() {
  const [dateMode, setDateMode] = useState('single'); // 'period' | 'single' | 'range'
  const [days, setDays] = useState(30);
  const [singleDate, setSingleDate] = useState(todayDateStr);
  const [startDate, setStartDate] = useState(() => daysAgoDateStr(7));
  const [endDate, setEndDate] = useState(todayDateStr);
  const [region, setRegion] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Wait for complete date input before querying
    if (dateMode === 'single' && !singleDate) return;
    if (dateMode === 'range' && (!startDate || !endDate)) return;

    const params = { ...(region ? { region } : {}) };
    if (dateMode === 'single') {
      params.startDate = singleDate;
      params.endDate = singleDate;
    } else if (dateMode === 'range') {
      params.startDate = startDate;
      params.endDate = endDate;
    } else {
      params.days = days;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/template-listings/precheck-stats', { params })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error || e.message || 'Failed to load stats'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateMode, days, singleDate, startDate, endDate, region, reloadKey]);

  const regionCounts = useMemo(() => {
    const counts = { US: 0, UK: 0, CA: 0, AU: 0 };
    for (const row of data?.byRegion || []) {
      counts[row.region] = row.asinCount;
    }
    return counts;
  }, [data]);

  // Pivot byDay rows (one per day+region) into one table row per day
  const dayRows = useMemo(() => {
    const map = new Map();
    for (const row of data?.byDay || []) {
      if (!map.has(row.day)) map.set(row.day, { day: row.day, US: 0, UK: 0, CA: 0, AU: 0, total: 0 });
      const entry = map.get(row.day);
      entry[row.region] = (entry[row.region] || 0) + row.asinCount;
      entry.total += row.asinCount;
    }
    return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [data]);

  const totals = data?.totals || {};
  const retryCount = totals.availabilityRetryCount || 0;
  const retrySuccessCount = totals.availabilityRetrySuccessCount || 0;

  return (
    <Container maxWidth={false} sx={{ py: 2.5, px: { xs: 2, lg: 3 }, bgcolor: '#f6f8fb', minHeight: '100vh' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: BRAND_DARK }}>
            <QueryStatsIcon sx={{ color: BRAND_YELLOW }} /> Precheck Stats
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            How many ASINs are being prechecked — by country, day, user and seller/template.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          sx={yellowOutlinedButtonSx}
        >
          Refresh
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 3, borderRadius: `${dashboardSignatureTokens.radius.card}px`, border: '1px solid', borderColor: alpha(BRAND_DARK, 0.08), boxShadow: dashboardSignatureTokens.shadows.card }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }} alignItems="center">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dateMode}
            onChange={(_, value) => { if (value) setDateMode(value); }}
            aria-label="Date filter mode"
          >
            <ToggleButton value="period">Quick Period</ToggleButton>
            <ToggleButton value="single">Single Date</ToggleButton>
            <ToggleButton value="range">Date Range</ToggleButton>
          </ToggleButtonGroup>
          {dateMode === 'period' && (
            <FormControl size="small" sx={{ minWidth: 170, backgroundColor: 'background.paper', borderRadius: 1 }}>
              <InputLabel>Period</InputLabel>
              <Select label="Period" value={days} onChange={(e) => setDays(e.target.value)}>
                {DAY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {dateMode === 'single' && (
            <TextField
              label="Date (PDT)"
              type="date"
              size="small"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 170, backgroundColor: 'background.paper', borderRadius: 1 }}
            />
          )}
          {dateMode === 'range' && (
            <>
              <TextField
                label="Start Date (PDT)"
                type="date"
                size="small"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 170, backgroundColor: 'background.paper', borderRadius: 1 }}
              />
              <TextField
                label="End Date (PDT)"
                type="date"
                size="small"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 170, backgroundColor: 'background.paper', borderRadius: 1 }}
              />
            </>
          )}
          <FormControl size="small" sx={{ minWidth: 220, backgroundColor: 'background.paper', borderRadius: 1 }}>
            <InputLabel>Country</InputLabel>
            <Select label="Country" value={region} onChange={(e) => setRegion(e.target.value)}>
              <MenuItem value="">All countries</MenuItem>
              {REGIONS.map((value) => (
                <MenuItem key={value} value={value}>{REGION_LABELS[value]}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {loading && <CircularProgress size={22} />}
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 2 }}>
        <MetricCard
          icon={<FindInPageIcon fontSize="small" />}
          label="Total ASINs Prechecked"
          value={formatNumber(totals.asinCount)}
          hint={`${formatNumber(totals.batchCount)} precheck batches`}
        />
        {REGIONS.map((value) => (
          <MetricCard
            key={value}
            icon={<PublicIcon fontSize="small" />}
            label={REGION_LABELS[value]}
            value={formatNumber(regionCounts[value])}
          />
        ))}
        <MetricCard
          icon={<ReplayIcon fontSize="small" />}
          label="Stock-Info Retries"
          value={formatNumber(retryCount)}
          hint="Extra Scrapingdog calls for missing stock/delivery"
          tone={retryCount > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          icon={<CheckCircleIcon fontSize="small" />}
          label="Retries Recovered Info"
          value={formatNumber(retrySuccessCount)}
          hint={retryCount > 0 ? `${Math.round((retrySuccessCount / retryCount) * 100)}% success rate` : 'No retries needed'}
          tone={retrySuccessCount > 0 ? 'success' : 'default'}
        />
      </Stack>

      <SectionTable
        title="By Day"
        caption="ASINs prechecked per day (PDT days), split by Amazon marketplace."
      >
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeaderCellSx}>Date</TableCell>
                {REGIONS.map((value) => (
                  <TableCell key={value} sx={tableHeaderCellSx} align="right">{value}</TableCell>
                ))}
                <TableCell sx={tableHeaderCellSx} align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dayRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No prechecks in this period.
                  </TableCell>
                </TableRow>
              )}
              {dayRows.map((row) => (
                <TableRow key={row.day} sx={tableBodyRowSx}>
                  <TableCell sx={tableBodyCellSx}>{row.day}</TableCell>
                  {REGIONS.map((value) => (
                    <TableCell key={value} align="right" sx={tableBodyCellSx}>
                      {row[value] ? formatNumber(row[value]) : <Typography variant="body2" color="text.disabled">-</Typography>}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...tableBodyCellSx, fontWeight: 700 }}>{formatNumber(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionTable>

      <SectionTable
        title="By User"
        caption="Which team members are running prechecks in the selected period."
      >
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeaderCellSx}>User</TableCell>
                <TableCell sx={tableHeaderCellSx} align="right">ASINs</TableCell>
                <TableCell sx={tableHeaderCellSx} align="right">Batches</TableCell>
                <TableCell sx={tableHeaderCellSx} align="right">Avg / Batch</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.byUser || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No prechecks in this period.
                  </TableCell>
                </TableRow>
              )}
              {(data?.byUser || []).map((row) => (
                <TableRow key={row.userId || 'unknown'} sx={tableBodyRowSx}>
                  <TableCell sx={tableBodyCellSx}>
                    <Typography variant="body2" fontWeight={600}>{row.userName}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.asinCount)}</TableCell>
                  <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.batchCount)}</TableCell>
                  <TableCell align="right" sx={tableBodyCellSx}>
                    {row.batchCount ? Math.round(row.asinCount / row.batchCount) : 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionTable>

      <SectionTable
        title="By Seller / Template"
        caption="Where the prechecked ASINs are being added."
      >
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeaderCellSx}>Seller</TableCell>
                <TableCell sx={tableHeaderCellSx}>Template</TableCell>
                <TableCell sx={tableHeaderCellSx} align="right">ASINs</TableCell>
                <TableCell sx={tableHeaderCellSx} align="right">Batches</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.bySellerTemplate || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No prechecks in this period.
                  </TableCell>
                </TableRow>
              )}
              {(data?.bySellerTemplate || []).map((row) => (
                <TableRow key={`${row.sellerId}-${row.templateId}`} sx={tableBodyRowSx}>
                  <TableCell sx={tableBodyCellSx}>
                    <Typography variant="body2" fontWeight={600}>{row.sellerName}</Typography>
                  </TableCell>
                  <TableCell sx={tableBodyCellSx}>
                    <Chip size="small" label={row.templateName} variant="outlined" />
                  </TableCell>
                  <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.asinCount)}</TableCell>
                  <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.batchCount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionTable>

      {retryCount > 0 && (
        <Tooltip title="Each retry is one extra Scrapingdog API call (1 extra credit) made when the first response had no stock/delivery information." arrow>
          <Typography variant="caption" color="text.secondary">
            ℹ️ {formatNumber(retryCount)} stock-info retr{retryCount === 1 ? 'y' : 'ies'} used {formatNumber(retryCount)} extra credit{retryCount === 1 ? '' : 's'} and recovered info for {formatNumber(retrySuccessCount)} ASIN{retrySuccessCount === 1 ? '' : 's'}.
          </Typography>
        </Tooltip>
      )}
    </Container>
  );
}
