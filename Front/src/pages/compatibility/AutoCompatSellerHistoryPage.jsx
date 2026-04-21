import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
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
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

const formatDateIST = (dateString) => {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(dateString));
};

export default function AutoCompatSellerHistoryPage() {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellerSearch, setSellerSearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [staffUsers, setStaffUsers] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const defaultFilters = {
    listingDateMode: 'single', listingDate: '', dateFrom: '', dateTo: '',
    runOnMode: 'single', runOnDate: '', runOnFrom: '', runOnTo: '',
    triggeredByFilter: '', statusFilter: '', reviewedFilter: '',
    page: 1, limit: 25,
  };
  const [historyFilters, setHistoryFilters] = useState(defaultFilters);

  useEffect(() => {
    const loadSellers = async () => {
      setLoadingSellers(true);
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data || []);
      } catch {
        try {
          const { data } = await api.get('/sellers/me');
          setSellers(data ? [data] : []);
        } catch (e) {
          console.error(e);
          setSnackbar({ open: true, message: 'Failed to load sellers', severity: 'error' });
        }
      } finally {
        setLoadingSellers(false);
      }
    };

    const loadStaff = async () => {
      try {
        const { data } = await api.get('/users');
        setStaffUsers((data || []).filter(u => u.role !== 'seller'));
      } catch { /* non-critical */ }
    };

    loadSellers();
    loadStaff();
  }, []);

  const filteredSellers = useMemo(() => {
    const keyword = sellerSearch.trim().toLowerCase();
    if (!keyword) return sellers;
    return sellers.filter((seller) => {
      const username = seller.user?.username?.toLowerCase() || '';
      const email = seller.user?.email?.toLowerCase() || '';
      const storeName = seller.storeName?.toLowerCase() || '';
      return username.includes(keyword) || email.includes(keyword) || storeName.includes(keyword);
    });
  }, [sellerSearch, sellers]);

  const loadHistory = async (seller, overrides = {}) => {
    const resolvedSeller = seller || selectedSeller;
    if (!resolvedSeller) return;
    if (seller) {
      setSelectedSeller(seller);
      setHistoryOpen(true);
    }
    setHistoryLoading(true);
    try {
      const filters = { ...historyFilters, ...overrides };
      const params = { sellerId: resolvedSeller._id, page: filters.page, limit: filters.limit };
      if (filters.triggeredByFilter) params.triggeredBy = filters.triggeredByFilter;
      if (filters.listingDateMode === 'single') {
        if (filters.listingDate) params.listingDate = filters.listingDate;
      } else {
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
      }
      if (filters.runOnMode === 'single') {
        if (filters.runOnDate) params.runOnDate = filters.runOnDate;
      } else {
        if (filters.runOnFrom) params.runOnFrom = filters.runOnFrom;
        if (filters.runOnTo) params.runOnTo = filters.runOnTo;
      }
      if (filters.statusFilter) params.status = filters.statusFilter;
      if (filters.reviewedFilter === 'reviewed') params.manualReviewDone = 'true';
      const { data } = await api.get('/ebay/auto-compatibility-batches', { params });
      setHistory(data.batches || []);
      setHistoryTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setHistory([]);
      setSnackbar({ open: true, message: 'Failed to load auto-compatibility history', severity: 'error' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateHistoryFilter = (key, value) => {
    const next = { ...historyFilters, [key]: value, page: 1 };
    setHistoryFilters(next);
    loadHistory(null, next);
  };

  const handleViewBatch = (batchId) => {
    sessionStorage.setItem('autoCompat_loadBatchId', batchId);
    navigate('/admin/auto-compatibility');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Auto-Compatibility Seller History</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            Open auto-compatibility history directly from a seller list without selecting the seller in the run page.
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Search Seller"
          placeholder="Search by username, email, or store name"
          value={sellerSearch}
          onChange={(e) => setSellerSearch(e.target.value)}
        />
      </Paper>

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loadingSellers ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : filteredSellers.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography color="textSecondary">No sellers found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Seller</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSellers.map((seller) => (
                  <TableRow key={seller._id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {seller.user?.username || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<HistoryIcon />}
                        onClick={() => loadHistory(seller)}
                      >
                        View History
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={historyOpen} onClose={() => { setHistoryOpen(false); setHistoryFilters(defaultFilters); }} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={700}>Auto-Compatibility History</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip
                label={`Seller: ${selectedSeller?.user?.username || selectedSeller?.user?.email || '—'}`}
                size="small"
                variant="outlined"
              />
              {historyTotal > 0 && <Chip label={`${historyTotal} total`} size="small" variant="outlined" />}
            </Box>
          </Box>

          {/* ── Filter Rows ── */}
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Row 1: Date filters */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>

              {/* Listing Date (targetDate) */}
              <Box>
                <Typography variant="caption" color="textSecondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
                  Listing Date
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={historyFilters.listingDateMode}
                    onChange={(_, v) => {
                      if (!v) return;
                      const next = { ...historyFilters, listingDateMode: v, listingDate: '', dateFrom: '', dateTo: '', page: 1 };
                      setHistoryFilters(next);
                      loadHistory(null, next);
                    }}
                    sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
                  >
                    <ToggleButton value="single">Single</ToggleButton>
                    <ToggleButton value="range">Range</ToggleButton>
                  </ToggleButtonGroup>
                  {historyFilters.listingDateMode === 'single' ? (
                    <TextField
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={historyFilters.listingDate}
                      onChange={e => updateHistoryFilter('listingDate', e.target.value)}
                      sx={{ width: 150 }}
                    />
                  ) : (
                    <>
                      <TextField
                        label="From"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.dateFrom}
                        onChange={e => updateHistoryFilter('dateFrom', e.target.value)}
                        sx={{ width: 150 }}
                      />
                      <TextField
                        label="To"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.dateTo}
                        onChange={e => updateHistoryFilter('dateTo', e.target.value)}
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
                    size="small"
                    exclusive
                    value={historyFilters.runOnMode}
                    onChange={(_, v) => {
                      if (!v) return;
                      const next = { ...historyFilters, runOnMode: v, runOnDate: '', runOnFrom: '', runOnTo: '', page: 1 };
                      setHistoryFilters(next);
                      loadHistory(null, next);
                    }}
                    sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
                  >
                    <ToggleButton value="single">Single</ToggleButton>
                    <ToggleButton value="range">Range</ToggleButton>
                  </ToggleButtonGroup>
                  {historyFilters.runOnMode === 'single' ? (
                    <TextField
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={historyFilters.runOnDate}
                      onChange={e => updateHistoryFilter('runOnDate', e.target.value)}
                      sx={{ width: 150 }}
                    />
                  ) : (
                    <>
                      <TextField
                        label="From"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.runOnFrom}
                        onChange={e => updateHistoryFilter('runOnFrom', e.target.value)}
                        sx={{ width: 150 }}
                      />
                      <TextField
                        label="To"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.runOnTo}
                        onChange={e => updateHistoryFilter('runOnTo', e.target.value)}
                        sx={{ width: 150 }}
                      />
                    </>
                  )}
                </Box>
              </Box>
            </Box>

            <Divider />

            {/* Row 2: Dropdown filters + Clear */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>By</InputLabel>
                <Select
                  value={historyFilters.triggeredByFilter}
                  label="By"
                  onChange={e => updateHistoryFilter('triggeredByFilter', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {staffUsers.map(u => (
                    <MenuItem key={u._id} value={u._id}>{u.username || u.email}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 145 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={historyFilters.statusFilter}
                  label="Status"
                  onChange={e => updateHistoryFilter('statusFilter', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="running">Running</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 155 }}>
                <InputLabel>Review</InputLabel>
                <Select
                  value={historyFilters.reviewedFilter}
                  label="Review"
                  onChange={e => updateHistoryFilter('reviewedFilter', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="reviewed">Reviewed</MenuItem>
                </Select>
              </FormControl>

              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  setHistoryFilters(defaultFilters);
                  loadHistory(null, defaultFilters);
                }}
              >
                Clear All
              </Button>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {historyLoading ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : history.length === 0 ? (
            <Typography color="textSecondary" textAlign="center" p={3}>
              No batches found for the selected filters
            </Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 'calc(80vh - 260px)' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Listing Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Run On (IST)</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>By</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Status</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>✅ Sent</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>🔧 Manual</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>❌ Errors</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Review</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((batch) => (
                    <TableRow key={batch._id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{batch.targetDate}</TableCell>
                      <TableCell>
                        <Typography variant="caption">{formatDateIST(batch.createdAt)}</Typography>
                      </TableCell>
                      <TableCell>{batch.triggeredBy?.username || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={batch.status}
                          size="small"
                          color={batch.status === 'completed' ? 'success' : batch.status === 'running' ? 'warning' : 'error'}
                        />
                      </TableCell>
                      <TableCell align="center">{batch.totalListings}</TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                          <Typography variant="caption" color="success.main" fontWeight={600}>{batch.successCount || 0} ✓</Typography>
                          {(batch.warningCount || 0) > 0 && <Typography variant="caption" color="warning.dark" sx={{ fontSize: '0.65rem' }}>{batch.warningCount} w/notes</Typography>}
                        </Box>
                      </TableCell>
                      <TableCell align="center">{batch.needsManualCount || 0}</TableCell>
                      <TableCell align="center">{(batch.ebayErrorCount || 0) + (batch.aiFailedCount || 0)}</TableCell>
                      <TableCell>
                        {batch.manualReviewDone ? (
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            <Chip label={`✓${batch.manualCorrectCount}`} size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                            <Chip label={`→${batch.manualSkippedCount}`} size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                            <Chip label={`⨯${batch.manualEndedCount}`} size="small" color="error" sx={{ height: 20, fontSize: '0.65rem' }} />
                          </Box>
                        ) : (
                          <Typography variant="caption" color="textSecondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => handleViewBatch(batch._id)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {/* Pagination */}
          {historyTotal > historyFilters.limit && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, p: 1.5, borderTop: '1px solid #eee' }}>
              <Button
                size="small"
                disabled={historyFilters.page <= 1 || historyLoading}
                onClick={() => {
                  const next = { ...historyFilters, page: historyFilters.page - 1 };
                  setHistoryFilters(next);
                  loadHistory(null, next);
                }}
              >
                Prev
              </Button>
              <Typography variant="caption">
                Page {historyFilters.page} of {Math.ceil(historyTotal / historyFilters.limit)}
              </Typography>
              <Button
                size="small"
                disabled={historyFilters.page >= Math.ceil(historyTotal / historyFilters.limit) || historyLoading}
                onClick={() => {
                  const next = { ...historyFilters, page: historyFilters.page + 1 };
                  setHistoryFilters(next);
                  loadHistory(null, next);
                }}
              >
                Next
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setHistoryOpen(false); setHistoryFilters(defaultFilters); }} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}