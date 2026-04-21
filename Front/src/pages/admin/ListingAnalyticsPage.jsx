import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Divider, FormControl, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, TextField, Button } from '@mui/material';
import api from '../../lib/api.js';

export default function ListingAnalyticsPage() {
  const [listingPlatforms, setListingPlatforms] = useState([]);
  const [stores, setStores] = useState([]);
  const [listers, setListers] = useState([]);
  const [filters, setFilters] = useState({ platformId: '', date: '' });
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [daily, setDaily] = useState([]);
  const [listerDaily, setListerDaily] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => {
    api.get('/platforms', { params: { type: 'listing' } }).then(({ data }) => setListingPlatforms(data));
  }, []);

  useEffect(() => {
    if (filters.platformId) {
      api.get('/stores', { params: { platformId: filters.platformId } }).then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [filters.platformId]);

  const refresh = async () => {
    setLoading(true);
    const current = ++reqSeq.current;
    try {
      const reqs = [
        api.get('/tasks/analytics', { params: filters }),
        api.get('/tasks', { params: filters })
      ];
      const responses = await Promise.all(reqs);
      if (current !== reqSeq.current) return; // stale
      const [s, t] = responses;
      setStats(s.data);
      setTasks(t.data);
      setDaily([]);
      setListerDaily([]);
    } finally {
      if (current === reqSeq.current) setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { refresh(); }, [filters]);

  const byStore = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.store?._id || 'unknown';
      if (!map.has(key)) map.set(key, {
        store: t.store?.name || 'Unknown',
        platform: t.listingPlatform?.name || '-',
        quantity: 0,
        completedQty: 0,
        listerSet: new Set(),
        storeSet: new Set(),
        rangeSet: new Set(),
        categorySet: new Set()
      });
      const agg = map.get(key);
      agg.quantity += t.quantity || 0;
      agg.completedQty += t.completedQuantity || (t.status === 'completed' ? t.quantity : 0);
      if (t.assignedLister?._id) agg.listerSet.add(t.assignedLister._id);
      if (t.store?._id) agg.storeSet.add(t.store._id);
      if (t.range) agg.rangeSet.add(t.range);
      if (t.category) agg.categorySet.add(t.category);
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      numListers: r.listerSet.size,
      numStores: r.storeSet.size || 1,
      numRanges: r.rangeSet.size,
      numCategories: r.categorySet.size
    }));
  }, [tasks]);

  const applyFilters = () => refresh();
  const resetFilters = () => {
    setFilters({ platformId: '', date: '' });
    setStores([]);
  };

  const isFilterApplied = useMemo(() => !!(filters.platformId || filters.date), [filters]);
  const pendingQuantity = useMemo(() => {
    let pending = 0;
    for (const t of tasks) {
      const done = t.completedQuantity || (t.status === 'completed' ? t.quantity : 0);
      pending += Math.max(0, (t.quantity || 0) - done);
    }
    return pending;
  }, [tasks]);

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <FormControl sx={{ minWidth: 220 }}>
            <InputLabel>Platform</InputLabel>
            <Select label="Platform" value={filters.platformId} onChange={(e) => setFilters({ ...filters, platformId: e.target.value })}>
              <MenuItem value=""><em>All</em></MenuItem>
              {listingPlatforms.map((p) => (<MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField label="Date" type="date" InputLabelProps={{ shrink: true }} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
          <Button onClick={resetFilters}>Reset</Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
          {filters.platformId ? <Chip label={`Platform`} size="small" /> : null}
          {filters.date ? <Chip label={`Date: ${filters.date}`} size="small" /> : null}
        </Stack>
        {loading ? <LinearProgress sx={{ mt: 2 }} /> : null}
      </Paper>
      {!isFilterApplied ? (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableBody>
            <TableRow><TableCell>Total Listings (quantity)</TableCell><TableCell>{stats?.totalListings ?? 0}</TableCell></TableRow>
            <TableRow><TableCell>Listing Pending (quantity)</TableCell><TableCell>{pendingQuantity}</TableCell></TableRow>
            <TableRow><TableCell>Number of Listers</TableCell><TableCell>{stats?.numListers ?? 0}</TableCell></TableRow>
            <TableRow><TableCell>Number of Stores</TableCell><TableCell>{stats?.numStores ?? 0}</TableCell></TableRow>
            <TableRow><TableCell>Number of Ranges</TableCell><TableCell>{stats?.numRanges ?? 0}</TableCell></TableRow>
            <TableRow><TableCell>Number of Categories</TableCell><TableCell>{stats?.numCategories ?? 0}</TableCell></TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      ) : null}

      {isFilterApplied && filters.listerId ? (
        <>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Lister Daily Breakdown</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Platform</TableCell>
                  <TableCell>Store</TableCell>
                  <TableCell>Tasks</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Completed Tasks</TableCell>
                  <TableCell>Completed Qty</TableCell>
                  <TableCell>Ranges</TableCell>
                  <TableCell>Categories</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {listerDaily.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.platform || '-'}</TableCell>
                    <TableCell>{r.store || '-'}</TableCell>
                    <TableCell>{r.tasksCount}</TableCell>
                    <TableCell>{r.quantityTotal}</TableCell>
                    <TableCell>{r.completedCount}</TableCell>
                    <TableCell>{r.completedQty}</TableCell>
                    <TableCell>{r.numRanges}</TableCell>
                    <TableCell>{r.numCategories}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : null}

      {isFilterApplied ? (
        <>
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Breakdown by Store</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Platform</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Total Listings (quantity)</TableCell>
              <TableCell>Listing Pending (quantity)</TableCell>
              <TableCell>Number of Listers</TableCell>
              {/*<TableCell>Number of Stores</TableCell>*/}
              <TableCell>Number of Ranges</TableCell>
              <TableCell>Number of Categories</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {byStore.map((r, idx) => (
              <TableRow key={idx}>
                <TableCell>{r.platform}</TableCell>
                <TableCell>{r.store}</TableCell>
                <TableCell>{r.quantity}</TableCell>
                <TableCell>{Math.max(0, r.quantity - r.completedQty)}</TableCell>
                <TableCell>{r.numListers}</TableCell>
                {/*<TableCell>{r.numStores}</TableCell>*/}
                <TableCell>{r.numRanges}</TableCell>
                <TableCell>{r.numCategories}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
        </>
      ) : null}
    </Box>
  );
}


