import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Stack
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, parseISO } from 'date-fns';
import api from '../../lib/api.js';

export default function ListingsSummaryPage() {
  const [rows, setRows] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [stores, setStores] = useState([]);
  const [platformId, setPlatformId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    mode: 'none', // 'none' | 'single' | 'range'
    single: '',
    from: '',
    to: ''
  });

  // Get only listing-type platforms
  useEffect(() => {
    api.get('/platforms')
      .then((p) => {
        const listingPlatforms = p.data.filter(platform => platform.type === 'listing');
        setPlatforms(listingPlatforms);
      })
      .catch(() => setPlatforms([]));
  }, []);

  // Get stores for selected platform
  useEffect(() => {
    if (platformId) {
      api.get('/stores', { params: { platformId } })
        .then((s) => setStores(s.data))
        .catch(() => setStores([]));
    } else {
      setStores([]);
      setStoreId(''); // Reset store selection when platform changes
    }
  }, [platformId]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params = {};
      if (platformId) params.platformId = platformId;
      if (storeId) params.storeId = storeId;

      // Add date filter parameters
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.dateMode = 'single';
        params.dateSingle = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        params.dateMode = 'range';
        if (dateFilter.from) params.dateFrom = dateFilter.from;
        if (dateFilter.to) params.dateTo = dateFilter.to;
      }

      const res = await api.get('/assignments/analytics/listings-summary', { params });
      setRows(res.data || []);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on initial load and when filters change
  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformId, storeId, dateFilter]);

  // Process the rows data
  const processedRows = useMemo(() =>
    rows.map(r => ({
      ...r,
    })),
    [rows]
  );

  // Calculate totals for numeric columns
  const totals = useMemo(() => {
    return processedRows.reduce(
      (acc, r) => ({
        totalQuantity: acc.totalQuantity + (r.totalQuantity ?? 0),
        assignmentsCount: acc.assignmentsCount + (r.assignmentsCount ?? 0),
        numListers: acc.numListers + (r.numListers ?? 0),
        numRanges: acc.numRanges + (r.numRanges ?? 0),
        numCategories: acc.numCategories + (r.numCategories ?? 0),
      }),
      {
        totalQuantity: 0,
        assignmentsCount: 0,
        numListers: 0,
        numRanges: 0,
        numCategories: 0,
      }
    );
  }, [processedRows]);

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Listings Summary (day-wise-assigned-by the listing-admin)</Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="platform-select-label">Platform</InputLabel>
              <Select labelId="platform-select-label" value={platformId} label="Platform" onChange={(e) => setPlatformId(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                {platforms.map((p) => (
                  <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="store-select-label">Store</InputLabel>
              <Select labelId="store-select-label" value={storeId} label="Store" onChange={(e) => setStoreId(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                {stores.map((s) => (
                  <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {/* Date filter UI like TaskListPage */}
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="date-mode-label">Date mode</InputLabel>
              <Select
                labelId="date-mode-label"
                value={dateFilter.mode}
                label="Date mode"
                onChange={(e) =>
                  setDateFilter((f) => ({ ...f, mode: e.target.value }))
                }
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="single">Single day</MenuItem>
                <MenuItem value="range">Range</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {dateFilter.mode === 'single' && (
            <Grid item xs={12} sm={4} md={3}>
              <TextField
                size="small"
                type="date"
                label="Date"
                InputLabelProps={{ shrink: true }}
                fullWidth
                value={dateFilter.single}
                onChange={(e) =>
                  setDateFilter((f) => ({ ...f, single: e.target.value }))
                }
              />
            </Grid>
          )}
          {dateFilter.mode === 'range' && (
            <>
              <Grid item xs={12} sm={2} md={1.5}>
                <TextField
                  size="small"
                  type="date"
                  label="From"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  value={dateFilter.from}
                  onChange={(e) =>
                    setDateFilter((f) => ({ ...f, from: e.target.value }))
                  }
                />
              </Grid>
              <Grid item xs={12} sm={2} md={1.5}>
                <TextField
                  size="small"
                  type="date"
                  label="To"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  value={dateFilter.to}
                  onChange={(e) =>
                    setDateFilter((f) => ({ ...f, to: e.target.value }))
                  }
                />
              </Grid>
            </>
          )}
        </Grid>
      </Paper>

      <TableContainer component={Paper} sx={{ mb: 3, maxHeight: 400, maxWidth: '100%', overflow: 'auto', position: 'relative' }}>
        <Box sx={{ overflowX: 'auto', overflowY: 'auto', position: 'sticky', top: 0, left: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Scheduled Date</TableCell>
                <TableCell>Platform</TableCell>
                <TableCell>Store</TableCell>
                <TableCell>Listing Quantity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {processedRows.map((r, idx) => {
                const assigned = r.totalQuantity ?? 0;
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      {r.date ?? '\u2014'}
                    </TableCell>
                    <TableCell>{r.platform || '\u2014'}</TableCell>
                    <TableCell>{r.store || '\u2014'}</TableCell>
                    <TableCell>{assigned}</TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              <TableRow>
                <TableCell colSpan={3} sx={{ fontWeight: 'bold' }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{totals.totalQuantity}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </TableContainer>
    </Box>
  );
}
