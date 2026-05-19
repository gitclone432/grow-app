import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import api from '../../lib/api';

const MARKETPLACES = [
  { value: '', label: 'All marketplaces' },
  { value: 'EBAY_US', label: 'eBay US' },
  { value: 'EBAY_CA', label: 'eBay CA' },
  { value: 'EBAY_ENCA', label: 'eBay ENCA' },
  { value: 'EBAY_GB', label: 'eBay GB' },
  { value: 'EBAY_AU', label: 'eBay AU' },
];

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatUsd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function formatInr(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
}

const defaultFilters = {
  date: '',
  from: currentMonthRange().from,
  to: currentMonthRange().to,
  sellerId: '',
  marketplace: '',
  excludeMicro: false,
  groupBy: 'day',
};

export default function RevenueGrossNetPage() {
  const [sellers, setSellers] = useState([]);
  const [draft, setDraft] = useState(defaultFilters);
  const [committed, setCommitted] = useState(defaultFilters);
  const [summary, setSummary] = useState(null);
  const [bySeller, setBySeller] = useState([]);
  const [byPeriod, setByPeriod] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setSellers([]));
  }, []);

  const queryParams = useMemo(() => {
    const p = { groupBy: committed.groupBy };
    if (committed.date) p.date = committed.date;
    if (committed.from) p.from = committed.from;
    if (committed.to) p.to = committed.to;
    if (committed.sellerId) p.sellerId = committed.sellerId;
    if (committed.marketplace) p.marketplace = committed.marketplace;
    if (committed.excludeMicro) p.excludeMicro = 'true';
    return p;
  }, [committed]);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get('/revenue', { params: queryParams });
      setSummary(data?.summary || null);
      setBySeller(Array.isArray(data?.bySeller) ? data.bySeller : []);
      setByPeriod(Array.isArray(data?.byPeriod) ? data.byPeriod : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load revenue');
      setSummary(null);
      setBySeller([]);
      setByPeriod([]);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => setCommitted({ ...draft });
  const clearFilters = () => {
    const cleared = { ...defaultFilters };
    setDraft(cleared);
    setCommitted(cleared);
  };

  return (
    <Box sx={{ pb: 4 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
        <Typography color="text.secondary">Finance & Cash Flow</Typography>
        <Typography color="text.primary" fontWeight={600}>
          Revenue (Gross & Net)
        </Typography>
      </Breadcrumbs>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TrendingUpIcon color="primary" />
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
          Revenue (Gross & Net)
        </Typography>
      </Stack>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
        Gross = eBay earnings (orderEarnings). Net = earnings after TDS and T.ID — same definitions as All Orders USD.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Filters
        </Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              label="Date"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={draft.date}
              onChange={(e) => setDraft((f) => ({ ...f, date: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={draft.from}
              onChange={(e) => setDraft((f) => ({ ...f, from: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={draft.to}
              onChange={(e) => setDraft((f) => ({ ...f, to: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Seller</InputLabel>
              <Select
                label="Seller"
                value={draft.sellerId}
                onChange={(e) => setDraft((f) => ({ ...f, sellerId: e.target.value }))}
              >
                <MenuItem value="">All sellers</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.sellerId || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Marketplace</InputLabel>
              <Select
                label="Marketplace"
                value={draft.marketplace}
                onChange={(e) => setDraft((f) => ({ ...f, marketplace: e.target.value }))}
              >
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp.value || 'all'} value={mp.value}>
                    {mp.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Group by</InputLabel>
              <Select
                label="Group by"
                value={draft.groupBy}
                onChange={(e) => setDraft((f) => ({ ...f, groupBy: e.target.value }))}
              >
                <MenuItem value="day">Day</MenuItem>
                <MenuItem value="week">Week</MenuItem>
                <MenuItem value="month">Month</MenuItem>
                <MenuItem value="none">No period breakdown</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.excludeMicro}
                  onChange={(e) => setDraft((f) => ({ ...f, excludeMicro: e.target.checked }))}
                />
              }
              label="Exclude micro orders (subtotal under $3)"
            />
          </Grid>
        </Grid>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button variant="contained" size="small" onClick={applyFilters}>
            Apply
          </Button>
          <Button size="small" onClick={clearFilters}>
            Clear
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Gross revenue (USD)
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {formatUsd(summary?.grossRevenue)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Sum of eBay earnings
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Net revenue (USD)
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {formatUsd(summary?.netRevenue)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    After TDS &amp; T.ID
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Orders
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {summary?.orderCount ?? 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    TDS {formatUsd(summary?.totalTds)} · T.ID {formatUsd(summary?.totalTid)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    P.Balance (INR)
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatInr(summary?.totalPBalanceInr)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Net × exchange rate (stored)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {committed.groupBy !== 'none' && byPeriod.length > 0 ? (
            <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2.5, overflow: 'hidden' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, p: 2, pb: 1 }}>
                By {committed.groupBy}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Orders</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Gross (USD)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>TDS</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>T.ID</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Net (USD)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byPeriod.map((row) => (
                      <TableRow key={row.period} hover>
                        <TableCell>{row.period}</TableCell>
                        <TableCell align="right">{row.orderCount}</TableCell>
                        <TableCell align="right">{formatUsd(row.grossRevenue)}</TableCell>
                        <TableCell align="right">{formatUsd(row.totalTds)}</TableCell>
                        <TableCell align="right">{formatUsd(row.totalTid)}</TableCell>
                        <TableCell align="right">{formatUsd(row.netRevenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ) : null}

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, p: 2, pb: 1 }}>
              By seller
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Seller</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Orders</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Gross (USD)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>TDS</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>T.ID</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Net (USD)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bySeller.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }} color="text.secondary">
                        No orders match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bySeller.map((row) => (
                      <TableRow key={String(row.sellerId)} hover>
                        <TableCell>{row.sellerLabel}</TableCell>
                        <TableCell align="right">{row.orderCount}</TableCell>
                        <TableCell align="right">{formatUsd(row.grossRevenue)}</TableCell>
                        <TableCell align="right">{formatUsd(row.totalTds)}</TableCell>
                        <TableCell align="right">{formatUsd(row.totalTid)}</TableCell>
                        <TableCell align="right">{formatUsd(row.netRevenue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
}
