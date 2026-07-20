import { useEffect, useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import GroupsIcon from '@mui/icons-material/Groups';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import TokenIcon from '@mui/icons-material/Token';
import BoltIcon from '@mui/icons-material/Bolt';
import api from '../../lib/api';
import { BRAND_DARK, BRAND_YELLOW } from '../../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import {
  tableHeaderCellSx,
  tableBodyRowSx,
  tableBodyCellSx,
  tableContainerSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx
} from '../../theme/tableStyles.js';

const numberFmt = new Intl.NumberFormat('en-US');

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

function getDefaultEndDate() {
  return new Date().toISOString().slice(0, 10);
}

function toDateTimeLocal(dateValue, timeValue = '00:00') {
  return `${dateValue}T${timeValue}`;
}

function toIsoDateTime(value) {
  return value ? new Date(value).toISOString() : undefined;
}

function formatNumber(value) {
  return numberFmt.format(value || 0);
}

function formatDateParts(value) {
  if (!value) return { date: '-', time: '' };
  const d = new Date(value);
  return {
    date: d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  };
}

function findSelectedOption(options, id, allLabel) {
  if (!id || id === 'all') return { id: 'all', label: allLabel };
  return options.find((option) => option.id === id) || { id, label: id };
}

function UsageFilter({ label, allLabel, value, options, onChange, minWidth = 190 }) {
  const fullOptions = useMemo(() => [{ id: 'all', label: allLabel }, ...options], [allLabel, options]);
  return (
    <Autocomplete
      size="small"
      options={fullOptions}
      value={findSelectedOption(fullOptions, value, allLabel)}
      onChange={(_, option) => onChange(option?.id || 'all')}
      getOptionLabel={(option) => option?.label || ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box>
            <Typography variant="body2">{option.label}</Typography>
            {option.id !== 'all' && (
              <Typography variant="caption" color="text.secondary">
                {formatNumber(option.count)} calls
              </Typography>
            )}
          </Box>
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} />}
      sx={{ minWidth, backgroundColor: 'background.paper', borderRadius: 1 }}
    />
  );
}

function MetricCard({ icon, label, value, tone = 'default' }) {
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
      </CardContent>
    </Card>
  );
}

const SORT_COLUMNS = {
  asinCount: (row) => row.asinCount || 0,
  aiCalls: (row) => row.aiCalls || 0,
  repeatCalls: (row) => Math.max(0, (row.aiCalls || 0) - (row.asinCount || 0)),
  totalTokens: (row) => row.totalTokens || 0,
  lastUsedAt: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0)
};

function SortableHeaderCell({ label, sortKey, sortState, onSort, align = 'right', tooltip }) {
  const active = sortState.key === sortKey;
  const cell = (
    <TableCell align={align} sx={tableHeaderCellSx}>
      <TableSortLabel
        active={active}
        direction={active ? sortState.direction : 'desc'}
        onClick={() => onSort(sortKey)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
  return tooltip ? <Tooltip title={tooltip} arrow placement="top">{cell}</Tooltip> : cell;
}

export default function PrecheckAiUsagePage() {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [filterOptions, setFilterOptions] = useState({ users: [], sellers: [], templates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortState, setSortState] = useState({ key: 'aiCalls', direction: 'desc' });

  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [singleDate, setSingleDate] = useState(getDefaultEndDate);
  const [startDateTime, setStartDateTime] = useState(() => toDateTimeLocal(getDefaultStartDate()));
  const [endDateTime, setEndDateTime] = useState(() => toDateTimeLocal(getDefaultEndDate(), '23:59'));
  const [singleDateTime, setSingleDateTime] = useState(() => toDateTimeLocal(getDefaultEndDate()));
  const [dateMode, setDateMode] = useState('single');
  const [timeFilterEnabled, setTimeFilterEnabled] = useState(false);
  const [userFilter, setUserFilter] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');

  const fetchUsage = async (overrides = {}) => {
    try {
      setLoading(true);
      setError('');
      const activeDateMode = overrides.dateMode ?? dateMode;
      const activeStartDate = overrides.startDate ?? startDate;
      const activeEndDate = overrides.endDate ?? endDate;
      const activeSingleDate = overrides.singleDate ?? singleDate;
      const activeStartDateTime = overrides.startDateTime ?? startDateTime;
      const activeEndDateTime = overrides.endDateTime ?? endDateTime;
      const activeSingleDateTime = overrides.singleDateTime ?? singleDateTime;
      const activeTimeFilterEnabled = overrides.timeFilterEnabled ?? timeFilterEnabled;
      const selectedStartDate = activeDateMode === 'single' ? activeSingleDate : activeStartDate;
      const selectedEndDate = activeDateMode === 'single' ? activeSingleDate : activeEndDate;
      const params = {
        startDate: selectedStartDate,
        endDate: selectedEndDate,
        userId: overrides.userFilter ?? userFilter,
        sellerId: overrides.sellerFilter ?? sellerFilter,
        templateId: overrides.templateFilter ?? templateFilter
      };
      if (activeTimeFilterEnabled) {
        params.startDate = undefined;
        params.endDate = undefined;
        params.startDateTime = activeDateMode === 'single'
          ? toIsoDateTime(activeSingleDateTime)
          : toIsoDateTime(activeStartDateTime);
        params.endDateTime = activeDateMode === 'single'
          ? undefined
          : toIsoDateTime(activeEndDateTime);
      }
      const { data } = await api.get('/template-listings/api/precheck-usage-summary', { params });
      setRows(data.rows || []);
      setTotals(data.totals || {});
      setFilterOptions(data.filterOptions || { users: [], sellers: [], templates: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch precheck AI usage');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    const defaultStartDate = getDefaultStartDate();
    const defaultEndDate = getDefaultEndDate();
    setDateMode('single');
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
    setSingleDate(defaultEndDate);
    setStartDateTime(toDateTimeLocal(defaultStartDate));
    setEndDateTime(toDateTimeLocal(defaultEndDate, '23:59'));
    setSingleDateTime(toDateTimeLocal(defaultEndDate));
    setTimeFilterEnabled(false);
    setUserFilter('all');
    setSellerFilter('all');
    setTemplateFilter('all');
    fetchUsage({
      dateMode: 'single',
      startDate: defaultStartDate,
      endDate: defaultEndDate,
      singleDate: defaultEndDate,
      startDateTime: toDateTimeLocal(defaultStartDate),
      endDateTime: toDateTimeLocal(defaultEndDate, '23:59'),
      singleDateTime: toDateTimeLocal(defaultEndDate),
      timeFilterEnabled: false,
      userFilter: 'all',
      sellerFilter: 'all',
      templateFilter: 'all'
    });
  };

  useEffect(() => {
    fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSort = (key) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedRows = useMemo(() => {
    const getValue = SORT_COLUMNS[sortState.key] || SORT_COLUMNS.aiCalls;
    const sorted = [...rows].sort((a, b) => getValue(a) - getValue(b));
    return sortState.direction === 'asc' ? sorted : sorted.reverse();
  }, [rows, sortState]);

  const totalRepeatCalls = Math.max(0, (totals.aiCalls || 0) - (totals.asinCount || 0));

  return (
    <Container maxWidth={false} sx={{ py: 2.5, px: { xs: 2, lg: 3 }, bgcolor: '#f6f8fb', minHeight: '100vh' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: BRAND_DARK }}>
            <AutoAwesomeIcon sx={{ color: BRAND_YELLOW }} /> ASIN Precheck AI Usage
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            eBay Motors eligibility checks only — separate from Add Template Listings AI usage.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchUsage} disabled={loading} sx={yellowOutlinedButtonSx}>
          Refresh
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 3, borderRadius: `${dashboardSignatureTokens.radius.card}px`, border: '1px solid', borderColor: alpha(BRAND_DARK, 0.08), boxShadow: dashboardSignatureTokens.shadows.card }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }} alignItems="center">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dateMode}
            onChange={(_, value) => {
              if (value) setDateMode(value);
            }}
            aria-label="Date filter mode"
          >
            <ToggleButton value="single">Single Date</ToggleButton>
            <ToggleButton value="range">Date Range</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={timeFilterEnabled ? 'time' : 'date'}
            onChange={(_, value) => {
              if (value) setTimeFilterEnabled(value === 'time');
            }}
            aria-label="Time filter mode"
          >
            <ToggleButton value="date">Date Only</ToggleButton>
            <ToggleButton value="time">Date + Time</ToggleButton>
          </ToggleButtonGroup>
          {dateMode === 'single' ? (
            timeFilterEnabled ? (
              <TextField
                label="Show After"
                type="datetime-local"
                size="small"
                value={singleDateTime}
                onChange={(e) => setSingleDateTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 220 }}
              />
            ) : (
              <TextField
                label="Date"
                type="date"
                size="small"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 160 }}
              />
            )
          ) : (
            <>
              {timeFilterEnabled ? (
                <>
                  <TextField
                    label="Start Date & Time"
                    type="datetime-local"
                    size="small"
                    value={startDateTime}
                    onChange={(e) => setStartDateTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 220 }}
                  />
                  <TextField
                    label="End Date & Time"
                    type="datetime-local"
                    size="small"
                    value={endDateTime}
                    onChange={(e) => setEndDateTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 220 }}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="Start Date"
                    type="date"
                    size="small"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 160 }}
                  />
                  <TextField
                    label="End Date"
                    type="date"
                    size="small"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 160 }}
                  />
                </>
              )}
            </>
          )}
          <UsageFilter label="User" allLabel="All Users" value={userFilter} options={filterOptions.users || []} onChange={setUserFilter} />
          <UsageFilter label="Seller" allLabel="All Sellers" value={sellerFilter} options={filterOptions.sellers || []} onChange={setSellerFilter} />
          <UsageFilter label="Template" allLabel="All Templates" value={templateFilter} options={filterOptions.templates || []} onChange={setTemplateFilter} minWidth={220} />
          <Button variant="contained" onClick={fetchUsage} disabled={loading} startIcon={<CalendarMonthIcon />} sx={yellowFilledButtonSx}>
            Apply
          </Button>
          <Button variant="outlined" onClick={clearFilters} disabled={loading} sx={yellowOutlinedButtonSx}>
            Clear
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 2 }}>
        <MetricCard icon={<TokenIcon fontSize="small" />} label="Total Tokens" value={formatNumber(totals.totalTokens)} />
        <MetricCard icon={<FindInPageIcon fontSize="small" />} label="ASINs Checked" value={formatNumber(totals.asinCount)} />
        <MetricCard icon={<BoltIcon fontSize="small" />} label="Total AI Calls" value={formatNumber(totals.aiCalls)} />
        <MetricCard
          icon={<ReplayIcon fontSize="small" />}
          label="Repeat Calls"
          value={formatNumber(totalRepeatCalls)}
          tone={totalRepeatCalls > 0 ? 'warning' : 'default'}
        />
        <MetricCard icon={<CheckCircleIcon fontSize="small" />} label="Successful Calls" value={formatNumber(totals.successfulCalls)} tone="success" />
        <MetricCard
          icon={<ErrorOutlineIcon fontSize="small" />}
          label="Failed Calls"
          value={formatNumber(totals.failedCalls)}
          tone={totals.failedCalls ? 'error' : 'default'}
        />
        <MetricCard icon={<GroupsIcon fontSize="small" />} label="Users / Templates" value={`${formatNumber(totals.userCount)} / ${formatNumber(totals.templateCount)}`} />
      </Stack>

      <Paper sx={tableContainerSx}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: alpha(BRAND_DARK, 0.08) }}>
          <Typography variant="subtitle1" fontWeight={700}>Usage By User, Seller, Template</Typography>
          <Typography variant="caption" color="text.secondary">
            "Repeat Calls" = AI calls beyond one check per ASIN — the same ASIN was precheck-scored more than once.
          </Typography>
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 640 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>User</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Seller</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Template</TableCell>
                  <SortableHeaderCell label="ASINs Checked" sortKey="asinCount" sortState={sortState} onSort={handleSort} />
                  <SortableHeaderCell label="AI Calls" sortKey="aiCalls" sortState={sortState} onSort={handleSort} />
                  <SortableHeaderCell
                    label="Repeat Calls"
                    sortKey="repeatCalls"
                    sortState={sortState}
                    onSort={handleSort}
                    tooltip="AI calls beyond one per ASIN — same ASIN checked more than once"
                  />
                  <TableCell align="right" sx={tableHeaderCellSx}>Successful</TableCell>
                  <TableCell align="right" sx={tableHeaderCellSx}>Failed</TableCell>
                  <SortableHeaderCell label="Total Tokens" sortKey="totalTokens" sortState={sortState} onSort={handleSort} />
                  <TableCell sx={tableHeaderCellSx}>First Used</TableCell>
                  <SortableHeaderCell label="Last Used" sortKey="lastUsedAt" sortState={sortState} onSort={handleSort} align="left" />
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      No precheck AI usage found for the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {sortedRows.map((row, index) => {
                  const repeatCalls = Math.max(0, (row.aiCalls || 0) - (row.asinCount || 0));
                  const repeatRatio = row.asinCount ? repeatCalls / row.asinCount : 0;
                  const repeatTone = repeatCalls === 0 ? 'default' : repeatRatio >= 0.5 ? 'error' : 'warning';
                  const firstUsed = formatDateParts(row.firstUsedAt);
                  const lastUsed = formatDateParts(row.lastUsedAt);
                  return (
                    <TableRow key={`${row.userId || 'u'}-${row.sellerId || 's'}-${row.templateId || 't'}-${index}`} sx={tableBodyRowSx}>
                      <TableCell sx={tableBodyCellSx}>
                        <Typography variant="body2" fontWeight={600}>{row.username}</Typography>
                        {row.userEmail && (
                          <Typography variant="caption" color="text.secondary">{row.userEmail}</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={tableBodyCellSx}>{row.sellerName}</TableCell>
                      <TableCell sx={tableBodyCellSx}>{row.templateName}</TableCell>
                      <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.asinCount)}</TableCell>
                      <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.aiCalls)}</TableCell>
                      <TableCell align="right" sx={tableBodyCellSx}>
                        {repeatCalls > 0 ? (
                          <Tooltip title={`${formatNumber(repeatCalls)} extra call${repeatCalls === 1 ? '' : 's'} across ${formatNumber(row.asinCount)} ASINs`} arrow>
                            <Chip
                              size="small"
                              label={formatNumber(repeatCalls)}
                              color={repeatTone === 'error' ? 'error' : 'warning'}
                              variant="outlined"
                              sx={{ fontWeight: 700 }}
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.disabled">0</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ ...tableBodyCellSx, color: 'success.main', fontWeight: 600 }}>
                        {formatNumber(row.successfulCalls)}
                      </TableCell>
                      <TableCell align="right" sx={{ ...tableBodyCellSx, color: row.failedCalls ? 'error.main' : 'text.primary', fontWeight: row.failedCalls ? 700 : 400 }}>
                        {formatNumber(row.failedCalls)}
                      </TableCell>
                      <TableCell align="right" sx={tableBodyCellSx}>{formatNumber(row.totalTokens)}</TableCell>
                      <TableCell sx={tableBodyCellSx}>
                        <Typography variant="body2">{firstUsed.date}</Typography>
                        <Typography variant="caption" color="text.secondary">{firstUsed.time}</Typography>
                      </TableCell>
                      <TableCell sx={tableBodyCellSx}>
                        <Typography variant="body2">{lastUsed.date}</Typography>
                        <Typography variant="caption" color="text.secondary">{lastUsed.time}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
}
