import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import api from '../../lib/api.js';

function formatUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n));
}

function formatInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const abs = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(Number(n)));
  if (Number(n) < 0) return `-₹${abs}`;
  return `₹${abs}`;
}

function formatInrSigned(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(Number(n)));
  if (Number(n) < 0) return `-₹${formatted}`;
  return `₹${formatted}`;
}

function formatDateSold(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatExchangeRate(row) {
  const r = row.conversionRate ?? row.ebayExchangeRate;
  if (r == null || Number.isNaN(Number(r))) return '—';
  return Number(r).toFixed(4);
}

const defaultCommitted = {
  sellerId: '',
  dateMode: 'none',
  date: '',
  dateFrom: '',
  dateTo: '',
  excludeClient: true,
};

const headCellSx = {
  fontWeight: 700,
  whiteSpace: 'nowrap',
  backgroundColor: 'grey.100',
  borderBottom: '2px solid',
  borderColor: 'divider',
  py: 1.25,
  px: 1.25,
  fontSize: '0.75rem',
};

const zebraRow = (i) => ({
  backgroundColor: i % 2 === 0 ? '#fff' : 'grey.50',
  '&:hover': { backgroundColor: 'action.hover' },
});

export default function MicroOrdersPage() {
  const [sellers, setSellers] = useState([]);
  const [draft, setDraft] = useState(defaultCommitted);
  const [committed, setCommitted] = useState(defaultCommitted);

  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalProfitFake, setTotalProfitFake] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setSellers([]));
  }, []);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const params = {
        seller: committed.sellerId || undefined,
        dateMode: committed.dateMode,
        excludeClient: committed.excludeClient ? 'true' : 'false',
        page: page + 1,
        limit: rowsPerPage,
      };
      if (committed.dateMode === 'single' && committed.date) params.date = committed.date;
      if (committed.dateMode === 'range' && committed.dateFrom && committed.dateTo) {
        params.dateFrom = committed.dateFrom;
        params.dateTo = committed.dateTo;
      }

      const { data } = await api.get('/micro-orders', { params });
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setTotalCount(Number(data.totalCount) || 0);
      setTotalProfitFake(Number(data.totalProfitFake) || 0);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load');
      setOrders([]);
      setTotalCount(0);
      setTotalProfitFake(0);
    } finally {
      setLoading(false);
    }
  }, [committed, page, rowsPerPage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApplyFilters = () => {
    setCommitted({ ...draft });
    setPage(0);
  };

  const handleClear = () => {
    const cleared = { ...defaultCommitted };
    setDraft(cleared);
    setCommitted(cleared);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage) || 1);

  return (
    <Box sx={{ pb: 4 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
        <Typography color="text.secondary">Finance & Cash Flow</Typography>
        <Typography color="text.primary" fontWeight={600}>
          Micro Orders
        </Typography>
      </Breadcrumbs>

      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, letterSpacing: '-0.02em' }}>
        Micro Orders
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
        Orders with subtotal $0.01 - $3.00 — Seller markup &amp; IGST analysis.
      </Typography>

      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          p: 2,
          mb: 2.5,
          borderRadius: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Seller</InputLabel>
          <Select
            label="Seller"
            value={draft.sellerId}
            onChange={(e) => setDraft((d) => ({ ...d, sellerId: e.target.value }))}
          >
            <MenuItem value="">All sellers</MenuItem>
            {sellers.map((s) => (
              <MenuItem key={s._id} value={s._id}>
                {s.user?.username || s._id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={draft.dateMode}
          onChange={(_, v) => v != null && setDraft((d) => ({ ...d, dateMode: v }))}
          sx={{
            '& .MuiToggleButton-root': { px: 1.5, textTransform: 'none', fontWeight: 500 },
            '& .Mui-selected': {
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            },
          }}
        >
          <ToggleButton value="none">No Date Filter</ToggleButton>
          <ToggleButton value="single">Single Date</ToggleButton>
          <ToggleButton value="range">Date Range</ToggleButton>
        </ToggleButtonGroup>

        {draft.dateMode === 'single' && (
          <TextField
            size="small"
            type="date"
            label="Date"
            InputLabelProps={{ shrink: true }}
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          />
        )}
        {draft.dateMode === 'range' && (
          <>
            <TextField
              size="small"
              type="date"
              label="From"
              InputLabelProps={{ shrink: true }}
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              InputLabelProps={{ shrink: true }}
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
            />
          </>
        )}

        <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: { md: 'auto' } }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Exclude Client
          </Typography>
          <Switch
            checked={draft.excludeClient}
            onChange={(e) => setDraft((d) => ({ ...d, excludeClient: e.target.checked }))}
            color="success"
          />
        </Stack>

        <Button variant="contained" onClick={handleApplyFilters} disabled={loading} sx={{ textTransform: 'none', fontWeight: 600 }}>
          Apply Filters
        </Button>
        <Button variant="outlined" onClick={handleClear} disabled={loading} sx={{ textTransform: 'none', fontWeight: 600 }}>
          Clear
        </Button>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2.5 }}>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 2 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: 'primary.light',
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShoppingCartIcon fontSize="large" />
            </Box>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main', lineHeight: 1.1 }}>
                {loading ? '…' : new Intl.NumberFormat('en-US').format(totalCount)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                matching current filters
              </Typography>
            </Box>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 2 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: totalProfitFake < 0 ? 'error.light' : 'success.light',
                color: totalProfitFake < 0 ? 'error.main' : 'success.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CurrencyRupeeIcon fontSize="large" />
            </Box>
            <Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1.1,
                  color: totalProfitFake < 0 ? 'error.main' : 'text.primary',
                }}
              >
                {loading ? '…' : formatInrSigned(totalProfitFake)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                P.Balance − Markup − IGST
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Stack>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          borderRadius: 2,
          maxWidth: '100%',
          overflowX: 'auto',
          mb: 1,
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: 2200 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx}>Order ID</TableCell>
              <TableCell sx={headCellSx}>Seller</TableCell>
              <TableCell sx={headCellSx}>Date Sold</TableCell>
              <TableCell sx={{ ...headCellSx, minWidth: 220 }}>Product Name</TableCell>
              <TableCell sx={headCellSx} align="right">Subtotal</TableCell>
              <TableCell sx={headCellSx} align="right">Shipping</TableCell>
              <TableCell sx={headCellSx} align="right">Sales Tax</TableCell>
              <TableCell sx={headCellSx} align="right">Discount</TableCell>
              <TableCell sx={headCellSx} align="right">Transaction Fees</TableCell>
              <TableCell sx={headCellSx} align="right">Ad Fee</TableCell>
              <TableCell sx={headCellSx} align="right">Earnings</TableCell>
              <TableCell sx={headCellSx} align="right">Order Total</TableCell>
              <TableCell sx={headCellSx} align="right">TDS</TableCell>
              <TableCell sx={headCellSx} align="right">T.ID</TableCell>
              <TableCell sx={headCellSx} align="right">NET</TableCell>
              <TableCell sx={headCellSx} align="right">Exchange Rate</TableCell>
              <TableCell sx={headCellSx} align="right">P.Balance (INR)</TableCell>
              <TableCell sx={headCellSx} align="right">Seller Cost (INR)</TableCell>
              <TableCell sx={headCellSx} align="right">Seller Markup Fee (INR)</TableCell>
              <TableCell sx={headCellSx} align="right">Seller IGST (INR)</TableCell>
              <TableCell sx={headCellSx} align="right">Profit Fake (INR)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={21} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={21} align="center" sx={{ py: 4 }}>
                  No orders match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((row, i) => (
                <TableRow key={row._id} sx={zebraRow(i)}>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{row.orderId}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{row.sellerName || '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatDateSold(row.dateSold)}</TableCell>
                  <TableCell sx={{ maxWidth: 320, px: 1.25, fontSize: '0.8125rem' }} title={row.productName || ''}>
                    {row.productName || '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.subtotal)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.shipping)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.salesTax)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.discount)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.transactionFees)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.adFeeGeneral ?? row.adFee)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.orderEarnings)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.orderTotal)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.tds)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.tid)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatUsd(row.net)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatExchangeRate(row)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatInr(row.pBalanceINR)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatInr(row.sellerCost)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatInr(row.sellerMarkupFee)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 1.25 }}>{formatInr(row.sellerIGST)}</TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      px: 1.25,
                      fontWeight: 600,
                      color: row.profitFake < 0 ? 'error.main' : 'text.primary',
                    }}
                  >
                    {formatInr(row.profitFake)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            onClick={() => setPage(0)}
            disabled={page === 0 || loading}
            startIcon={<FirstPageIcon />}
            sx={{ minWidth: 0, px: 1 }}
          >
            First
          </Button>
          <Button
            size="small"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            startIcon={<NavigateBeforeIcon />}
            sx={{ minWidth: 0, px: 1 }}
          >
            Previous
          </Button>
          <Pagination
            count={totalPages}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
            color="primary"
            siblingCount={1}
            boundaryCount={1}
            disabled={loading}
            size="small"
            sx={{ mx: 1 }}
          />
          <Button
            size="small"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            endIcon={<NavigateNextIcon />}
            sx={{ minWidth: 0, px: 1 }}
          >
            Next
          </Button>
          <Button
            size="small"
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1 || loading}
            endIcon={<LastPageIcon />}
            sx={{ minWidth: 0, px: 1 }}
          >
            Last
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Showing {orders.length} of {new Intl.NumberFormat('en-US').format(totalCount)} records — Page {page + 1} of {totalPages}
        </Typography>
      </Stack>

      <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.7, maxWidth: 960 }}>
        <strong>Computed columns</strong> — Seller Cost (INR) = Subtotal × 90 · Seller Markup Fee (INR) = Subtotal × 90 × 4% ·
        Seller IGST (INR) = Markup × 18% · Profit Fake (INR) = P.Balance − Seller Cost − Markup − IGST.
        <br />
        Summary totals reflect all matching records across all pages. Date filter uses UTC calendar day on <code>dateSold</code>.
      </Typography>
    </Box>
  );
}
