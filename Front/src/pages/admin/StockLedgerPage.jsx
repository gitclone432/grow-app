// src/pages/admin/StockLedgerPage.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Stack, Typography, Grid, FormControl, InputLabel, Select, MenuItem,
  Button, Divider, Chip, Badge, IconButton, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, OutlinedInput, Checkbox, ListItemText, Tooltip, LinearProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import api from '../../lib/api.js';

const ITEM_HEIGHT = 44;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: { style: { maxHeight: ITEM_HEIGHT * 6 + ITEM_PADDING_TOP, width: 280 } },
};

const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

export default function StockLedgerPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filters, setFilters] = useState({
    platformId: '',
    storeId: '',
    category: [],
    range: []
  });

  const [platforms, setPlatforms] = useState([]);
  const [stores, setStores] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [allRanges, setAllRanges] = useState([]);

  // Load platforms/stores/categories/ranges for filter dropdowns
  useEffect(() => {
    (async () => {
      try {
        const [plats, strs, cats, rngs] = await Promise.all([
          api.get('/platforms'),
          api.get('/stores'),
          api.get('/categories'),
          api.get('/ranges')
        ]);
        setPlatforms(plats.data || []);
        setStores(strs.data || []);
        setAllCategories(cats.data?.map(c => c.name) || []);
        setAllRanges(rngs.data?.map(r => r.name) || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Load ledger with server-side filters
  const fetchLedger = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.platformId) params.platformId = filters.platformId;
      if (filters.storeId) params.storeId = filters.storeId;
      if (filters.category.length) params.category = filters.category.join(',');
      if (filters.range.length) params.range = filters.range.join(',');
      
      const res = await api.get('/assignments/analytics/stock-ledger', { params });
      setRows(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLedger(); /* eslint-disable-next-line */ }, [filters]);

  const handleMultiChange = (key) => (e) => {
    const value = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
    setFilters(f => ({ ...f, [key]: value }));
  };

  const clearAll = () => setFilters({ platformId: '', storeId: '', category: [], range: [] });

  // No client-side filtering - backend handles it
  const filtered = rows;

  const totals = useMemo(() => {
    const c = filtered.reduce((acc, r) => acc + (Number(r.totalCompleted) || 0), 0);
    return { completed: c };
  }, [filtered]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.platformId) n++;
    if (filters.storeId) n++;
    n += (filters.category.length ? 1 : 0);
    n += (filters.range.length ? 1 : 0);
    return n;
  }, [filters]);

  return (
    <Box>
      <Paper sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Badge color={activeCount ? 'primary' : 'default'} badgeContent={activeCount} overlap="circular">
              <IconButton size="small" sx={{ transform: 'rotate(0)', transition: 'transform .2s' }}>
                <ExpandMoreIcon />
              </IconButton>
            </Badge>
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterListIcon fontSize="small" /> R-C Tracker
            </Typography>
            {loading && <LinearProgress sx={{ width: 120, height: 6, borderRadius: 1 }} />}
          </Stack>
          <Stack direction="row" gap={1}>
            <Tooltip title="Clear all filters">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ClearAllIcon />}
                  onClick={clearAll}
                  disabled={activeCount === 0}
                >
                  Clear all
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {/* Filters grid */}
        <Grid container spacing={1.5} alignItems="center">
          {/* Platform */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="platform-label">Listing Platform</InputLabel>
              <Select
                labelId="platform-label"
                value={filters.platformId}
                label="Listing Platform"
                onChange={(e) => setFilters(f => ({ ...f, platformId: e.target.value }))}
              >
                <MenuItem value=""><em>All</em></MenuItem>
                {platforms
                  .filter(p => p?.type === 'listing' || !p?.type) // be lenient
                  .map(p => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          {/* Store (optionally filter by platform) */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="store-label">Store</InputLabel>
              <Select
                labelId="store-label"
                value={filters.storeId}
                label="Store"
                onChange={(e) => setFilters(f => ({ ...f, storeId: e.target.value }))}
              >
                <MenuItem value=""><em>All</em></MenuItem>
                {stores
                  .filter(s => !filters.platformId || s?.platform?._id === filters.platformId)
                  .map(s => <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          {/* Category (multi) */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="category-label">Category</InputLabel>
              <Select
                multiple
                labelId="category-label"
                value={filters.category}
                onChange={handleMultiChange('category')}
                input={<OutlinedInput label="Category" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((v) => <Chip key={v} label={v} size="small" />)}
                  </Box>
                )}
                MenuProps={MenuProps}
              >
                {allCategories.map((name) => (
                  <MenuItem key={name} value={name}>
                    <Checkbox size="small" checked={filters.category.indexOf(name) > -1} />
                    <ListItemText primary={name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Range (multi) */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="range-label">Range</InputLabel>
              <Select
                multiple
                labelId="range-label"
                value={filters.range}
                onChange={handleMultiChange('range')}
                input={<OutlinedInput label="Range" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((v) => <Chip key={v} label={v} size="small" />)}
                  </Box>
                )}
                MenuProps={MenuProps}
              >
                {allRanges.map((name) => (
                  <MenuItem key={name} value={name}>
                    <Checkbox size="small" checked={filters.range.indexOf(name) > -1} />
                    <ListItemText primary={name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Totals */}
      <Paper sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" gap={2} flexWrap="wrap">
          <Chip label={`Completed: ${totals.completed}`} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Showing <b>{filtered.length} </b>groups
          </Typography>
        </Stack>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>SL No</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Subcategory</TableCell>
              <TableCell>Range</TableCell>
              <TableCell align="right">Listings Made</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((r, idx) => (
              <TableRow key={`${r.platformId}-${r.storeId}-${r.category}-${r.range}`}>
                <TableCell>{idx + 1}</TableCell>
                <TableCell>{r.platform || '—'}</TableCell>
                <TableCell>{r.store || '—'}</TableCell>
                <TableCell>{r.category || '—'}</TableCell>
                <TableCell>{r.subcategory || '—'}</TableCell>
                <TableCell>{r.range || '—'}</TableCell>
                <TableCell align="right">{r.totalCompleted}</TableCell>
              </TableRow>
            ))}
            {/* Totals row */}
            <TableRow>
              <TableCell colSpan={6} align="right"><b>Totals</b></TableCell>
              <TableCell align="right"><b>{totals.completed}</b></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
