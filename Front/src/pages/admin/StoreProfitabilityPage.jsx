import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
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
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

function formatInr(value) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(num);
}

function formatUsd(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatPercent(value) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)}%`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const headCellSx = {
  fontWeight: 700,
  textAlign: 'center',
  color: 'white',
  whiteSpace: 'nowrap',
  borderColor: 'rgba(255,255,255,0.35)',
};

const headBg = (key) => (theme) => theme.palette[key].main;

const bodyCellSx = {
  verticalAlign: 'middle',
};

export default function StoreProfitabilityPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [inrRate, setInrRate] = useState('83');
  const [rows, setRows] = useState([]);
  const [draftBreakeven, setDraftBreakeven] = useState({});
  const [savingIds, setSavingIds] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadRows(activeMonth = month, activeRate = inrRate, { silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const rateValue = Number(activeRate);
      const { data } = await api.get('/ebay/store-profitability', {
        params: {
          month: activeMonth,
          inrRate: Number.isFinite(rateValue) && rateValue > 0 ? rateValue : undefined,
        },
      });
      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
      if (!silent) {
        setInrRate(String(data?.inrRate || activeRate || '83'));
        setDraftBreakeven(
          nextRows.reduce((acc, row) => {
            acc[row.sellerId] = row.breakevenPoint == null ? '' : String(row.breakevenPoint);
            return acc;
          }, {})
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load store profitability');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, [month]);

  async function saveBreakeven(sellerId) {
    const rawAmount = draftBreakeven[sellerId] ?? '';
    const amount = rawAmount === '' ? '' : Number(rawAmount);
    if (rawAmount !== '' && !Number.isFinite(amount)) return;

    setSavingIds((prev) => ({ ...prev, [sellerId]: true }));
    setError('');
    try {
      await api.put('/ebay/store-profitability/breakeven', {
        sellerId,
        month,
        amount,
      });
      await loadRows(month, inrRate, { silent: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save breakeven point');
    } finally {
      setSavingIds((prev) => ({ ...prev, [sellerId]: false }));
    }
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.revenue += Number(row.revenue) || 0;
      acc.manualBreakeven += Number(row.breakevenPoint) || 0;
      acc.cog += Number(row.cog) || 0;
      acc.storeFees += Number(row.storeFees) || 0;
      acc.profit += Number(row.profit) || 0;
      acc.marginCurrent += Number(row.breakevenMarginCurrent) || 0;
      acc.marginPrevious += Number(row.breakevenMarginPrevious) || 0;
      return acc;
    },
    { revenue: 0, manualBreakeven: 0, cog: 0, storeFees: 0, profit: 0, marginCurrent: 0, marginPrevious: 0 }
  );

  const totalMos = totals.manualBreakeven > 0 ? (totals.marginCurrent / totals.manualBreakeven) * 100 : null;

  return (
    <Box sx={{ p: 3, minHeight: '100%', background: 'linear-gradient(135deg, #f0f9ff 0%, #ecfdf5 100%)' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: (theme) => theme.palette.primary.main }}>
          Store Profitability
        </Typography>
        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">Loading...</Typography>
          </Stack>
        ) : null}
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert> : null}

      <Paper sx={{ p: 2, mb: 3, background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,249,255,0.9) 100%)', border: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2, color: (theme) => theme.palette.primary.main }}>
          Filters
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            label="Month"
            type="month"
            size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonthValue())}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="USD to INR Rate"
            type="number"
            size="small"
            value={inrRate}
            onChange={(e) => setInrRate(e.target.value)}
            onBlur={() => loadRows(month, inrRate)}
            inputProps={{ min: '1', step: '0.01' }}
          />
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => loadRows(month, inrRate)}
            disabled={loading}
          >
            Refresh
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Revenue: Seller Analytics P.Balance (INR) &middot; COG: Seller Analytics Total (A_total-inr + CC Fees) &middot; Store Fees: Store Limits price converted to INR &middot; Profit: Seller Analytics Profit (INR)
        </Typography>
      </Paper>

      <TableContainer component={Paper} sx={{ maxHeight: 600, borderRadius: 2, boxShadow: (theme) => `0 8px 24px ${theme.palette.primary.main}10`, border: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={{ ...headCellSx, bgcolor: headBg('primary') }}>Store (Sellers)</TableCell>
              <TableCell rowSpan={2} sx={{ ...headCellSx, bgcolor: headBg('info') }}>Revenue</TableCell>
              <TableCell colSpan={3} sx={{ ...headCellSx, bgcolor: headBg('secondary') }}>Expense</TableCell>
              <TableCell rowSpan={2} sx={{ ...headCellSx, bgcolor: headBg('success') }}>Profit</TableCell>
              <TableCell colSpan={2} sx={{ ...headCellSx, bgcolor: headBg('warning') }}>Breakeven Margin</TableCell>
              <TableCell rowSpan={2} sx={{ ...headCellSx, bgcolor: headBg('primary') }}>% Margin of Safety</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ ...headCellSx, bgcolor: headBg('secondary'), top: 37 }}>Breakeven Point</TableCell>
              <TableCell sx={{ ...headCellSx, bgcolor: headBg('secondary'), top: 37 }}>COG</TableCell>
              <TableCell sx={{ ...headCellSx, bgcolor: headBg('secondary'), top: 37 }}>Store Fees</TableCell>
              <TableCell sx={{ ...headCellSx, bgcolor: headBg('warning'), top: 37 }}>Current Month</TableCell>
              <TableCell sx={{ ...headCellSx, bgcolor: headBg('warning'), top: 37 }}>Previous Month</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={bodyCellSx}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={bodyCellSx}>No data found for this month.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.sellerId} hover>
                  <TableCell sx={bodyCellSx}>
                    <Chip label={row.store} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    <Typography variant="body2" fontWeight="bold" color="info.main">{formatInr(row.revenue)}</Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={draftBreakeven[row.sellerId] ?? ''}
                      onChange={(e) => setDraftBreakeven((prev) => ({ ...prev, [row.sellerId]: e.target.value }))}
                      onBlur={() => saveBreakeven(row.sellerId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveBreakeven(row.sellerId);
                        }
                      }}
                      placeholder="—"
                      inputProps={{ min: '0', step: '0.01', style: { textAlign: 'right', fontWeight: 600 } }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start" sx={{ '& p': { fontSize: 13 } }}>₹</InputAdornment>,
                        endAdornment: savingIds[row.sellerId] ? <CircularProgress size={14} /> : null,
                        sx: { fontSize: 13, bgcolor: 'rgba(255,255,255,0.8)', borderRadius: 1.5 },
                      }}
                      disabled={!!savingIds[row.sellerId]}
                      sx={{
                        width: 140,
                        '& .MuiInputBase-input': { py: 0.5 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                        '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': { display: 'none' },
                        '& input[type=number]': { MozAppearance: 'textfield' },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">{formatInr(row.cog)}</TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    <Typography variant="body2" fontWeight={600}>{formatInr(row.storeFees)}</Typography>
                    {row.storeFeesUsd != null ? (
                      <Typography variant="caption" color="text.secondary">{formatUsd(row.storeFeesUsd)}</Typography>
                    ) : null}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, color: Number(row.profit) < 0 ? 'error.main' : 'success.main', fontWeight: 700 }} align="right">
                    {formatInr(row.profit)}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">{formatInr(row.breakevenMarginCurrent)}</TableCell>
                  <TableCell sx={bodyCellSx} align="right">{formatInr(row.breakevenMarginPrevious)}</TableCell>
                  <TableCell sx={{ ...bodyCellSx, color: Number(row.marginOfSafety) < 0 ? 'error.main' : 'text.primary' }} align="right">
                    {formatPercent(row.marginOfSafety)}
                  </TableCell>
                </TableRow>
              ))
            )}
            {!loading && rows.length > 0 ? (
              <TableRow sx={{ '& td': { fontWeight: 700, backgroundColor: 'action.hover' } }}>
                <TableCell sx={bodyCellSx}>Total</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.revenue)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.manualBreakeven)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.cog)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.storeFees)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.profit)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.marginCurrent)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatInr(totals.marginPrevious)}</TableCell>
                <TableCell sx={bodyCellSx} align="right">{formatPercent(totalMos)}</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
