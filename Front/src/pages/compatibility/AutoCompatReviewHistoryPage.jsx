import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Typography, CircularProgress, Chip, TextField, Autocomplete, Pagination,
  ToggleButtonGroup, ToggleButton, Select, MenuItem, FormControl, InputLabel, Divider
} from '@mui/material';
import api from '../../lib/api';

const formatIST = (dateString) => {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(dateString));
};

export default function AutoCompatReviewHistoryPage() {
  const [sellers, setSellers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [selectedRunById, setSelectedRunById] = useState('');
  const [selectedReviewedById, setSelectedReviewedById] = useState('');
  // Listing date (targetDate) filters
  const [listingDateMode, setListingDateMode] = useState('range'); // 'single' | 'range'
  const [listingDate, setListingDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Run On (createdAt) filters
  const [runOnMode, setRunOnMode] = useState('single'); // 'single' | 'range'
  const [runOnDate, setRunOnDate] = useState('');
  const [runOnFrom, setRunOnFrom] = useState('');
  const [runOnTo, setRunOnTo] = useState('');
  // Status filter
  const [statusFilter, setStatusFilter] = useState('');
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data);
      } catch {
        try {
          const { data } = await api.get('/sellers/me');
          setSellers([data]);
        } catch (e) { console.error(e); }
      }
      try {
        const { data } = await api.get('/users');
        setUsers(data.filter(u => u.role !== 'seller'));
      } catch (e) { console.error(e); }
    };
    loadFilters();
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [page, selectedSellerId, selectedRunById, selectedReviewedById,
      listingDateMode, listingDate, dateFrom, dateTo,
      runOnMode, runOnDate, runOnFrom, runOnTo, statusFilter]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50, manualReviewDone: true };
      if (selectedSellerId) params.sellerId = selectedSellerId;
      if (selectedRunById) params.triggeredBy = selectedRunById;
      if (selectedReviewedById) params.reviewedBy = selectedReviewedById;
      // Listing date
      if (listingDateMode === 'single') {
        if (listingDate) params.listingDate = listingDate;
      } else {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
      }
      // Run On date (createdAt)
      if (runOnMode === 'single') {
        if (runOnDate) params.runOnDate = runOnDate;
      } else {
        if (runOnFrom) params.runOnFrom = runOnFrom;
        if (runOnTo) params.runOnTo = runOnTo;
      }
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/ebay/auto-compatibility-batches', { params });
      setBatches(data.batches || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const totals = batches.reduce((acc, b) => ({
    correct: acc.correct + (b.manualCorrectCount || 0),
    reviewed: acc.reviewed + (b.manualSkippedCount || 0),
    ended: acc.ended + (b.manualEndedCount || 0),
  }), { correct: 0, reviewed: 0, ended: 0 });

  const clearFilters = () => {
    setSelectedSellerId('');
    setSelectedRunById('');
    setSelectedReviewedById('');
    setListingDateMode('range');
    setListingDate('');
    setDateFrom('');
    setDateTo('');
    setRunOnMode('single');
    setRunOnDate('');
    setRunOnFrom('');
    setRunOnTo('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>📋 Manual Review History</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            Track who reviewed which auto-compat batch and what actions were taken
          </Typography>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>

        {/* Row 1: Date filters */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Listing Date (targetDate) */}
          <Box>
            <Typography variant="caption" color="textSecondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
              Listing Date
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small" exclusive value={listingDateMode}
                onChange={(_, v) => { if (!v) return; setListingDateMode(v); setListingDate(''); setDateFrom(''); setDateTo(''); setPage(1); }}
                sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
              >
                <ToggleButton value="single">Single</ToggleButton>
                <ToggleButton value="range">Range</ToggleButton>
              </ToggleButtonGroup>
              {listingDateMode === 'single' ? (
                <TextField
                  type="date" size="small" InputLabelProps={{ shrink: true }}
                  value={listingDate}
                  onChange={e => { setListingDate(e.target.value); setPage(1); }}
                  sx={{ width: 150 }}
                />
              ) : (
                <>
                  <TextField
                    label="From" type="date" size="small" InputLabelProps={{ shrink: true }}
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                    sx={{ width: 150 }}
                  />
                  <TextField
                    label="To" type="date" size="small" InputLabelProps={{ shrink: true }}
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPage(1); }}
                    sx={{ width: 150 }}
                  />
                </>
              )}
            </Box>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Run On Date (createdAt) */}
          <Box>
            <Typography variant="caption" color="textSecondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
              Run On (IST)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small" exclusive value={runOnMode}
                onChange={(_, v) => { if (!v) return; setRunOnMode(v); setRunOnDate(''); setRunOnFrom(''); setRunOnTo(''); setPage(1); }}
                sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
              >
                <ToggleButton value="single">Single</ToggleButton>
                <ToggleButton value="range">Range</ToggleButton>
              </ToggleButtonGroup>
              {runOnMode === 'single' ? (
                <TextField
                  type="date" size="small" InputLabelProps={{ shrink: true }}
                  value={runOnDate}
                  onChange={e => { setRunOnDate(e.target.value); setPage(1); }}
                  sx={{ width: 150 }}
                />
              ) : (
                <>
                  <TextField
                    label="From" type="date" size="small" InputLabelProps={{ shrink: true }}
                    value={runOnFrom}
                    onChange={e => { setRunOnFrom(e.target.value); setPage(1); }}
                    sx={{ width: 150 }}
                  />
                  <TextField
                    label="To" type="date" size="small" InputLabelProps={{ shrink: true }}
                    value={runOnTo}
                    onChange={e => { setRunOnTo(e.target.value); setPage(1); }}
                    sx={{ width: 150 }}
                  />
                </>
              )}
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Row 2: Dropdown filters */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Autocomplete
            size="small" sx={{ minWidth: 200 }} options={sellers}
            getOptionLabel={o => o.user?.username || o.user?.email || ''}
            value={sellers.find(s => s._id === selectedSellerId) || null}
            onChange={(_, v) => { setSelectedSellerId(v?._id || ''); setPage(1); }}
            renderInput={p => <TextField {...p} label="Seller" />}
            isOptionEqualToValue={(o, v) => o._id === v._id}
          />
          <Autocomplete
            size="small" sx={{ minWidth: 180 }} options={users}
            getOptionLabel={o => o.username || o.email || ''}
            value={users.find(u => u._id === selectedRunById) || null}
            onChange={(_, v) => { setSelectedRunById(v?._id || ''); setPage(1); }}
            renderInput={p => <TextField {...p} label="Run By" />}
            isOptionEqualToValue={(o, v) => o._id === v._id}
          />
          <Autocomplete
            size="small" sx={{ minWidth: 180 }} options={users}
            getOptionLabel={o => o.username || o.email || ''}
            value={users.find(u => u._id === selectedReviewedById) || null}
            onChange={(_, v) => { setSelectedReviewedById(v?._id || ''); setPage(1); }}
            renderInput={p => <TextField {...p} label="Reviewed By" />}
            isOptionEqualToValue={(o, v) => o._id === v._id}
          />
          <FormControl size="small" sx={{ minWidth: 145 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="running">Running</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
          {(selectedSellerId || selectedRunById || selectedReviewedById ||
            listingDate || dateFrom || dateTo ||
            runOnDate || runOnFrom || runOnTo || statusFilter) && (
            <Button size="small" variant="outlined" onClick={clearFilters}>Clear All</Button>
          )}
        </Box>
      </Box>

      {/* Summary chips */}
      {!loading && batches.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`${total} batch${total !== 1 ? 'es' : ''}`} variant="outlined" />
          <Chip label={`✓ ${totals.correct} correct`} color="success" variant="outlined" />
          <Chip label={`→ ${totals.reviewed} reviewed/skipped`} color="warning" variant="outlined" />
          {totals.ended > 0 && <Chip label={`✗ ${totals.ended} ended`} color="error" variant="outlined" />}
        </Box>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" mt={5}><CircularProgress /></Box>
      ) : batches.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="textSecondary">
            No manual review history found{(selectedSellerId || selectedRunById || selectedReviewedById || dateFrom || dateTo) ? ' for the selected filters' : ''}
          </Typography>
        </Paper>
      ) : (
        <>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ flex: 1, maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Listing Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Batch Run On</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Reviewed On</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Seller</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Run By</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Reviewed By</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Total</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', color: 'success.main' }}>✓ Correct</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', color: 'warning.dark' }}>→ Reviewed</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', color: 'error.main' }}>✗ Ended</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batches.map(b => (
                  <TableRow key={b._id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{b.targetDate}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="textSecondary">{formatIST(b.createdAt)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="textSecondary">{formatIST(b.reviewedAt)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{b.seller?.user?.username || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{b.triggeredBy?.username || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      {b.reviewedBy?.username ? (
                        <Chip label={b.reviewedBy.username} size="small" color="primary" variant="outlined" />
                      ) : <Typography variant="body2" color="textSecondary">—</Typography>}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{b.totalListings}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={b.manualCorrectCount || 0}
                        size="small"
                        color={b.manualCorrectCount > 0 ? 'success' : 'default'}
                        variant={b.manualCorrectCount > 0 ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={b.manualSkippedCount || 0}
                        size="small"
                        color={b.manualSkippedCount > 0 ? 'warning' : 'default'}
                        variant={b.manualSkippedCount > 0 ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={b.manualEndedCount || 0}
                        size="small"
                        color={b.manualEndedCount > 0 ? 'error' : 'default'}
                        variant={b.manualEndedCount > 0 ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          sessionStorage.setItem('autoCompat_loadBatchId', b._id);
                          window.location.href = '/admin/auto-compatibility';
                        }}
                      >
                        View Batch
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                <TableRow sx={{ bgcolor: '#e3f2fd', position: 'sticky', bottom: 0, zIndex: 1 }}>
                  <TableCell colSpan={6} sx={{ fontWeight: 'bold', borderTop: '2px solid #1976d2' }}>
                    <Typography variant="body2" fontWeight="bold">Page Total</Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    {batches.reduce((s, b) => s + (b.totalListings || 0), 0)}
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    <Chip label={totals.correct} size="small" color="success" sx={{ fontWeight: 'bold' }} />
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    <Chip label={totals.reviewed} size="small" color="warning" sx={{ fontWeight: 'bold' }} />
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    <Chip label={totals.ended} size="small" color={totals.ended > 0 ? 'error' : 'default'} sx={{ fontWeight: 'bold' }} />
                  </TableCell>
                  <TableCell sx={{ borderTop: '2px solid #1976d2' }} />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
