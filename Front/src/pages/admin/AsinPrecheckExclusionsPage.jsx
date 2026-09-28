import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Block as BlockIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import api from '../../lib/api.js';
import { pacificDaysAgoString, toPacificDateString } from '../../utils/pacificDate.js';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import PrecheckBlockedBrandsDialog from '../../components/PrecheckBlockedBrandsDialog.jsx';
import { tableHeaderCellSx, tableContainerSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';

// Dates are picked and shown in the precheck stats timezone (same as the
// Precheck Stats page), so a row's "When" always falls inside the day picked.
const DISPLAY_TIMEZONE = 'America/Los_Angeles';

const AMAZON_DOMAIN = { US: 'amazon.com', UK: 'amazon.co.uk', CA: 'amazon.ca', AU: 'amazon.com.au' };

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_ROWS_PER_PAGE = 50;
const EMPTY_SUMMARY = { exclusions: 0, asins: 0, brands: 0, topBrands: [] };

// Defaults are the Pacific "today" — not the UTC day, which runs ahead of
// Pacific for seven hours and would make the default single day come up empty
// every evening.
const defaultApplied = () => ({ startDate: toPacificDateString(), endDate: toPacificDateString(), asin: '', brand: '' });

// Query-string form of the applied filters, shared by the paged history and
// the copy-all ASIN list so both describe the same period.
const historyParams = (applied) => ({
  startDate: applied.startDate,
  endDate: applied.endDate,
  asin: applied.asin || undefined,
  brand: applied.brand || undefined
});

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { timeZone: DISPLAY_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });
};

function StatTile({ label, value, hint }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 150, flex: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
      <Typography variant="h5" fontWeight={700} lineHeight={1.2}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

/**
 * The durable view of what the ASIN Precheck dropped for an excluded brand —
 * the same rows the end-of-run summary shows, kept after the page is left.
 * Reads /precheck-blocked-brands/history; the list itself is managed from the
 * Excluded Brands dialog, reachable from here as well as from the precheck.
 */
export default function AsinPrecheckExclusionsPage() {
  const [dateMode, setDateMode] = useState('single'); // 'single' | 'range'
  const [singleDate, setSingleDate] = useState(() => toPacificDateString());
  const [startDate, setStartDate] = useState(() => pacificDaysAgoString(7));
  const [endDate, setEndDate] = useState(() => toPacificDateString());
  const [asinFilter, setAsinFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  // Applied copies: the table reloads on Apply/Enter, not on every keystroke.
  const [applied, setApplied] = useState(defaultApplied);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  // Period-wide numbers for the tiles; the server computes them over the whole
  // filter, not just the page in view.
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [brandOptions, setBrandOptions] = useState([]);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/precheck-blocked-brands/history', {
      params: { ...historyParams(applied), page, limit: rowsPerPage }
    })
      .then(({ data }) => {
        if (cancelled) return;
        setRows(data.rows || []);
        setTotal(data.pagination?.total || 0);
        setSummary(data.summary || EMPTY_SUMMARY);
      })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Failed to load excluded ASINs'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applied, page, rowsPerPage, reloadKey]);

  // Brand names for the filter's suggestions — the current exclusion list.
  useEffect(() => {
    if (!managerOpen) {
      api.get('/precheck-blocked-brands')
        .then(({ data }) => setBrandOptions((data || []).map(entry => entry.brand)))
        .catch(() => {});
    }
  }, [managerOpen]);

  const dateRangeValid = dateMode === 'single'
    ? Boolean(singleDate)
    : Boolean(startDate && endDate && startDate <= endDate);

  // Any change to the applied filters starts back at the first page.
  const applyChange = (next) => {
    setApplied(next);
    setPage(1);
  };

  const applyFilters = (event) => {
    event?.preventDefault?.();
    if (!dateRangeValid) return;
    applyChange({
      startDate: dateMode === 'single' ? singleDate : startDate,
      endDate: dateMode === 'single' ? singleDate : endDate,
      asin: asinFilter.trim().toUpperCase(),
      brand: brandFilter.trim()
    });
  };

  const clearFilters = () => {
    const today = toPacificDateString();
    setDateMode('single');
    setSingleDate(today);
    setStartDate(pacificDaysAgoString(7));
    setEndDate(today);
    setAsinFilter('');
    setBrandFilter('');
    applyChange(defaultApplied());
  };

  const periodLabel = applied.startDate === applied.endDate
    ? `on ${applied.startDate}`
    : `${applied.startDate} to ${applied.endDate}`;

  // Copies every distinct ASIN in the period, not just the page in view.
  const copyAsins = async () => {
    setCopying(true);
    try {
      const { data } = await api.get('/precheck-blocked-brands/history/asins', { params: historyParams(applied) });
      const asins = data.asins || [];
      if (asins.length === 0) {
        setNotice('No ASINs to copy');
        return;
      }
      await navigator.clipboard.writeText(asins.join('\n'));
      setNotice(`Copied ${asins.length} ASIN${asins.length === 1 ? '' : 's'} excluded ${periodLabel}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not copy ASINs to clipboard');
    } finally {
      setCopying(false);
    }
  };

  return (
    <AdminPageShell>
      <PageHeader
        title="Precheck Exclusions"
        subtitle="ASINs the ASIN Precheck dropped because their brand is on the excluded list"
        actions={(
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<BlockIcon />}
              onClick={() => setManagerOpen(true)}
              sx={yellowOutlinedButtonSx}
            >
              Excluded Brands
            </Button>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setReloadKey(k => k + 1)}>
              Refresh
            </Button>
          </Stack>
        )}
      />

      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

        <Paper component="form" onSubmit={applyFilters} sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={dateMode}
              onChange={(_, value) => { if (value) setDateMode(value); }}
              aria-label="Date filter mode"
            >
              <ToggleButton value="single">Single Date</ToggleButton>
              <ToggleButton value="range">Date Range</ToggleButton>
            </ToggleButtonGroup>
            {dateMode === 'single' ? (
              <TextField
                label="Date (PT)"
                type="date"
                size="small"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 165 }}
              />
            ) : (
              <>
                <TextField
                  label="Start (PT)"
                  type="date"
                  size="small"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: endDate || undefined }}
                  sx={{ minWidth: 165 }}
                />
                <TextField
                  label="End (PT)"
                  type="date"
                  size="small"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: startDate || undefined }}
                  error={Boolean(startDate && endDate && startDate > endDate)}
                  sx={{ minWidth: 165 }}
                />
              </>
            )}
            <TextField
              size="small"
              label="ASIN"
              value={asinFilter}
              onChange={(e) => setAsinFilter(e.target.value)}
              inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 10 }}
              sx={{ width: 160 }}
            />
            <Autocomplete
              freeSolo
              size="small"
              options={brandOptions}
              inputValue={brandFilter}
              onInputChange={(_, value) => setBrandFilter(value)}
              sx={{ minWidth: 220 }}
              renderInput={(params) => <TextField {...params} label="Excluded brand" />}
            />
            <Button type="submit" variant="contained" disabled={!dateRangeValid} sx={{ whiteSpace: 'nowrap' }}>Apply</Button>
            <Button onClick={clearFilters}>Clear</Button>
            <Box sx={{ flex: 1 }} />
            <Tooltip title={`Copy every distinct ASIN excluded ${periodLabel}`}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={copying ? <CircularProgress size={16} color="inherit" /> : <CopyIcon />}
                  onClick={copyAsins}
                  disabled={total === 0 || copying}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Copy ASINs
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Paper>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <StatTile label="Exclusions" value={summary.exclusions} hint={periodLabel} />
          <StatTile label="Distinct ASINs" value={summary.asins} hint="an ASIN can be excluded in several runs" />
          <StatTile label="Brands hit" value={summary.brands} />
          <Paper variant="outlined" sx={{ px: 2, py: 1.5, flex: 2, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Most excluded brands</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
              {summary.topBrands.length === 0 && (
                <Typography variant="body2" color="text.secondary">—</Typography>
              )}
              {summary.topBrands.map(({ brand, count }) => (
                <Chip
                  key={brand}
                  size="small"
                  label={`${brand} ×${count}`}
                  onClick={() => { setBrandFilter(brand); applyChange(prev => ({ ...prev, brand })); }}
                  color={applied.brand.toLowerCase() === brand.toLowerCase() ? 'warning' : 'default'}
                  variant={applied.brand.toLowerCase() === brand.toLowerCase() ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
          </Paper>
        </Stack>

        <TableContainer component={Paper} sx={tableContainerSx}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...tableHeaderCellSx, width: 180 }}>When (PT)</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 130 }}>ASIN</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 170 }}>Excluded brand</TableCell>
                <TableCell sx={tableHeaderCellSx}>Title</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 70 }}>Region</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 180 }}>Seller / Template</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 120 }}>Run by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={26} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No ASINs were excluded {applied.asin || applied.brand ? 'matching these filters' : 'in this period'}.
                  </TableCell>
                </TableRow>
              ) : rows.map(row => {
                const brandDiffers = row.amazonBrand && row.amazonBrand.toLowerCase() !== row.brand.toLowerCase();
                const domain = AMAZON_DOMAIN[row.region] || AMAZON_DOMAIN.US;
                return (
                  <TableRow key={row._id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell>
                      <Typography
                        component="a"
                        href={`https://www.${domain}/dp/${row.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'primary.main', textDecoration: 'none' }}
                      >
                        {row.asin}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color="warning" variant="outlined" label={row.brand} />
                      {row.matchedOn === 'soldBy' ? (
                        <Tooltip title={`Matched on the seller (Sold by), not the brand field${row.amazonBrand ? ` — Amazon's brand was "${row.amazonBrand}"` : ''}.`}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Sold by: {row.amazonSoldBy || '—'}
                          </Typography>
                        </Tooltip>
                      ) : brandDiffers && (
                        <Tooltip title="Amazon's full brand field, which contains the excluded name. Rows from before brand-only matching may have matched the title or description instead.">
                          <Typography variant="caption" color="text.secondary" display="block">
                            Amazon: {row.amazonBrand}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Tooltip title={row.title || ''} placement="top-start">
                        <Typography variant="body2" noWrap>{row.title || '—'}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{row.region}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      <Typography variant="body2" noWrap>{row.sellerName || '—'}</Typography>
                      <Typography variant="caption" noWrap display="block">{row.templateName || ''}</Typography>
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{row.userName || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={Math.max(page - 1, 0)}
            onPageChange={(_, zeroBased) => setPage(zeroBased + 1)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </TableContainer>
      </Stack>

      <PrecheckBlockedBrandsDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
    </AdminPageShell>
  );
}
