import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Link,
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
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../../lib/api';

const COLUMNS = [
  { id: 'sellerName', label: 'Store', align: 'left', numeric: false },
  { id: 'totalSoldCount', label: 'Total sold count', align: 'right', numeric: true },
  { id: 'totalSoldValue', label: 'Total sold value', align: 'right', numeric: true },
  { id: 'soldDurationInDays', label: 'Sold duration (days)', align: 'right', numeric: true },
  { id: 'quantityLimitRemaining', label: 'Qty limit remaining', align: 'right', numeric: true },
  { id: 'amountLimitRemaining', label: 'Amount limit remaining', align: 'right', numeric: true },
  { id: 'status', label: 'Status', align: 'left', numeric: false },
];

function formatNumber(num) {
  if (num === undefined || num === null || num === '') return '—';
  const n = Number(num);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function formatCurrency(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num.toFixed(2)} ${currency || ''}`.trim();
  }
}

function statusLabel(row) {
  if (row.notConnected) return { label: 'Not connected', color: 'warning' };
  if (row.error || row.success === false) return { label: 'Error', color: 'error' };
  return { label: 'OK', color: 'success' };
}

function sortValue(row, columnId) {
  if (columnId === 'status') {
    if (row.notConnected) return 1;
    if (row.error || row.success === false) return 2;
    return 0;
  }
  if (columnId === 'sellerName') return String(row.sellerName || '').toLowerCase();
  const n = Number(row[columnId]);
  return Number.isFinite(n) ? n : -Infinity;
}

export default function SellingSummaryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('sellerName');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ebay/selling/summary/all', { timeout: 180000 });
      setRows(Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.data) ? data.data : []);
      setFetchedAt(data?.fetchedAt || new Date().toISOString());
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.error || err.message || 'Failed to load selling summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((r) => String(r.sellerName || '').toLowerCase().includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortBy);
      const bv = sortValue(b, sortBy);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return String(a.sellerName || '').localeCompare(String(b.sellerName || ''));
    });
  }, [rows, search, sortBy, sortDir]);

  const totals = useMemo(() => {
    return filteredSorted.reduce(
      (acc, r) => {
        if (r.notConnected || r.error || r.success === false) return acc;
        acc.totalSoldCount += Number(r.totalSoldCount) || 0;
        acc.totalSoldValue += Number(r.totalSoldValue) || 0;
        acc.ok += 1;
        return acc;
      },
      {
        ok: 0,
        totalSoldCount: 0,
        totalSoldValue: 0,
      }
    );
  }, [filteredSorted]);

  const handleSort = (columnId) => {
    if (sortBy === columnId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnId);
      setSortDir(columnId === 'sellerName' || columnId === 'status' ? 'asc' : 'desc');
    }
  };

  return (
    <Box sx={{ pb: 4 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
        <Typography color="text.secondary">Store Listings</Typography>
        <Typography color="text.primary" fontWeight={600}>Selling Summary</Typography>
      </Breadcrumbs>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Selling Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live GetMyeBaySelling SellingSummary for every connected store.
            {' '}
            <Link
              href="https://developer.ebay.com/devzone/xml/docs/Reference/eBay/GetMyeBaySelling.html#Response.SellingSummary"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              eBay docs <OpenInNewIcon sx={{ fontSize: 14 }} />
            </Link>
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            placeholder="Filter stores…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 200 }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            onClick={load}
            disabled={loading}
          >
            {loading ? 'Fetching…' : 'Refresh'}
          </Button>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      ) : null}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Chip size="small" label={`${filteredSorted.length} stores`} />
        <Chip size="small" color="success" variant="outlined" label={`${totals.ok} OK`} />
        <Chip size="small" variant="outlined" label={`Sold (31d): ${formatNumber(totals.totalSoldCount)}`} />
        <Chip size="small" variant="outlined" label={`Sold value: ${formatCurrency(totals.totalSoldValue, 'USD')}`} />
        {fetchedAt ? (
          <Chip size="small" variant="outlined" label={`Fetched ${new Date(fetchedAt).toLocaleString()}`} />
        ) : null}
      </Stack>

      {loading && rows.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableCell
                    key={col.id}
                    align={col.align}
                    sortDirection={sortBy === col.id ? sortDir : false}
                    sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
                  >
                    <TableSortLabel
                      active={sortBy === col.id}
                      direction={sortBy === col.id ? sortDir : 'asc'}
                      onClick={() => handleSort(col.id)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length} align="center" sx={{ py: 4 }}>
                    No stores found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSorted.map((row) => {
                  const status = statusLabel(row);
                  return (
                    <TableRow key={String(row.sellerId)} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{row.sellerName || '—'}</TableCell>
                      <TableCell align="right">{formatNumber(row.totalSoldCount)}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(row.totalSoldValue, row.totalSoldValueCurrency)}
                      </TableCell>
                      <TableCell align="right">{formatNumber(row.soldDurationInDays)}</TableCell>
                      <TableCell align="right">{formatNumber(row.quantityLimitRemaining)}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(row.amountLimitRemaining, row.amountLimitCurrency)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={status.color}
                          label={status.label}
                          title={row.error || undefined}
                        />
                        {row.error ? (
                          <Typography variant="caption" color="error" display="block" sx={{ maxWidth: 180 }}>
                            {row.error}
                          </Typography>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
