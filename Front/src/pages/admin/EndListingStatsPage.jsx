import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Button, FormControl, InputLabel, Select, MenuItem,
  ToggleButtonGroup, ToggleButton, Chip, Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LayersClearIcon from '@mui/icons-material/LayersClear';
import AdminPageShell from '../../components/AdminPageShell';
import api from '../../lib/api';

const getPTDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
};

const countryLabel = (country) => {
  if (country === 'US') return 'US';
  if (country === 'UK') return 'UK';
  if (country === 'AU') return 'AU';
  if (country === 'Canada') return 'CA';
  return country || 'Unknown';
};

export default function EndListingStatsPage() {
  const [rows, setRows] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [dateMode, setDateMode] = useState('single');
  const [selectedDate, setSelectedDate] = useState(() => getPTDate());
  const [startDate, setStartDate] = useState(() => getPTDate(-7));
  const [endDate, setEndDate] = useState(() => getPTDate());
  const [sellerFilter, setSellerFilter] = useState('all');

  const fetchGenRef = useRef(0);

  // Load sellers for the dropdown
  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch(() =>
        api.get('/sellers/me')
          .then(({ data }) => setSellers(data ? [data] : []))
          .catch(() => {})
      );
  }, []);

  const fetchStats = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (sellerFilter !== 'all') params.sellerId = sellerFilter;
      if (dateMode === 'single') {
        params.startDate = selectedDate;
        params.endDate = selectedDate;
      } else {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const { data } = await api.get('/end-listing-logs/stats', { params });
      if (gen !== fetchGenRef.current) return;
      setRows(data);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err.response?.data?.error || 'Failed to fetch stats');
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [dateMode, selectedDate, startDate, endDate, sellerFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Totals across all displayed rows
  const totalDupSku = rows.reduce((s, r) => s + r.duplicateSkuCount, 0);
  const totalExpiry = rows.reduce((s, r) => s + r.expiryListingCount, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <AdminPageShell>
      <Box sx={{ maxWidth: 1100, mx: 'auto', py: 3, px: { xs: 1, sm: 2 } }}>

        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RemoveCircleOutlineIcon color="error" />
            End-Listing Stats
          </Typography>
          <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchStats} disabled={loading}>
            Refresh
          </Button>
        </Box>

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>

            {/* Date mode toggle */}
            <ToggleButtonGroup
              size="small"
              exclusive
              value={dateMode}
              onChange={(_, v) => { if (v) setDateMode(v); }}
            >
              <ToggleButton value="single">Single Date</ToggleButton>
              <ToggleButton value="range">Date Range</ToggleButton>
            </ToggleButtonGroup>

            {/* Date inputs */}
            {dateMode === 'single' ? (
              <TextField
                label="Date"
                type="date"
                size="small"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160 }}
              />
            ) : (
              <>
                <TextField
                  label="Start Date"
                  type="date"
                  size="small"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 160 }}
                />
                <TextField
                  label="End Date"
                  type="date"
                  size="small"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 160 }}
                />
              </>
            )}

            {/* Seller filter */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Seller</InputLabel>
              <Select
                label="Seller"
                value={sellerFilter}
                onChange={e => setSellerFilter(e.target.value)}
              >
                <MenuItem value="all">All Sellers</MenuItem>
                {sellers.map(s => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Paper>

        {/* Summary chips */}
        {!loading && !error && rows.length > 0 && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <Chip
              icon={<ContentCopyIcon fontSize="small" />}
              label={`Duplicate SKU: ${totalDupSku}`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.9rem', px: 1 }}
            />
            <Chip
              icon={<LayersClearIcon fontSize="small" />}
              label={`Expiry Listings: ${totalExpiry}`}
              color="warning"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.9rem', px: 1 }}
            />
            <Chip
              icon={<RemoveCircleOutlineIcon fontSize="small" />}
              label={`Total: ${grandTotal}`}
              color="error"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.9rem', px: 1 }}
            />
          </Box>
        )}

        {/* Content */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && rows.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No end-listing activity found for the selected filters.</Typography>
          </Paper>
        )}

        {!loading && !error && rows.length > 0 && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'action.hover' } }}>
                  <TableCell>#</TableCell>
                  <TableCell>Seller</TableCell>
                  <TableCell align="center">Duplicate SKU</TableCell>
                  <TableCell align="center">Expiry Listing</TableCell>
                  <TableCell>Breakdown</TableCell>
                  <TableCell align="center">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.sellerId} hover>
                    <TableCell sx={{ color: 'text.secondary' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{row.sellerName}</TableCell>
                    <TableCell align="center">
                      {row.duplicateSkuCount > 0 ? (
                        <Chip label={row.duplicateSkuCount} color="primary" size="small" />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {row.expiryListingCount > 0 ? (
                        <Chip label={row.expiryListingCount} color="warning" size="small" />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.countryBreakdown?.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          {row.countryBreakdown.map(countryRow => (
                            <Chip
                              key={countryRow.country}
                              size="small"
                              variant="outlined"
                              label={`${countryLabel(countryRow.country)}: ${countryRow.total}`}
                              title={`Duplicate SKU: ${countryRow.duplicateSkuCount || 0}, Expiry Listings: ${countryRow.expiryListingCount || 0}`}
                              sx={{ fontWeight: 600 }}
                            />
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={row.total} color="error" size="small" sx={{ fontWeight: 700 }} />
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                {rows.length > 1 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={6}><Divider /></TableCell>
                    </TableRow>
                    <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: 'action.hover' } }}>
                      <TableCell colSpan={2}>TOTAL</TableCell>
                      <TableCell align="center">{totalDupSku}</TableCell>
                      <TableCell align="center">{totalExpiry}</TableCell>
                      <TableCell />
                      <TableCell align="center">{grandTotal}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </AdminPageShell>
  );
}
