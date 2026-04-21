import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Typography, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip, TextField, FormControl, InputLabel, Select, MenuItem,
  Pagination, Autocomplete
} from '@mui/material';
import api from '../../lib/api';

// Format time only in IST (e.g. "2:35 PM")
const formatTimeIST = (dateString) => {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(dateString));
};

// Format full date+time in IST for dialog
const formatFullIST = (dateString) => {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(dateString));
};

// Get today's date string in IST (YYYY-MM-DD)
const getTodayIST = () => {
  const now = new Date();
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  return istParts; // en-CA gives YYYY-MM-DD format
};

export default function CompatibilityBatchHistoryPage() {
  const [sellers, setSellers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayIST());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailDialog, setDetailDialog] = useState(null);

  useEffect(() => {
    const loadFilters = async () => {
      // Load sellers
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data);
      } catch {
        try {
          const { data } = await api.get('/sellers/me');
          setSellers([data]);
        } catch (e) { console.error(e); }
      }
      // Load users
      try {
        const { data } = await api.get('/users');
        // Filter out users with role 'seller'
        const filteredUsers = data.filter(u => u.role !== 'seller');
        setUsers(filteredUsers);
      } catch (e) { console.error('Failed to load users:', e); }
    };
    loadFilters();
  }, []);

  useEffect(() => {
    if (selectedDate) fetchLogs();
  }, [page, selectedSellerId, selectedUserId, selectedDate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50, date: selectedDate };
      if (selectedSellerId) params.sellerId = selectedSellerId;
      if (selectedUserId) params.userId = selectedUserId;

      const { data } = await api.get('/ebay/compatibility-batch-history', { params });
      setLogs(data.logs);
      setTotalPages(data.pages);
    } catch (e) {
      console.error('Failed to fetch batch history:', e);
    } finally {
      setLoading(false);
    }
  };

  // Compute totals for the selected date
  const totals = logs.reduce((acc, log) => ({
    totalItems: acc.totalItems + (log.totalItems || 0),
    correctCount: acc.correctCount + (log.correctCount || 0),
    skippedCount: acc.skippedCount + (log.skippedCount || 0),
    successCount: acc.successCount + (log.successCount || 0),
    failureCount: acc.failureCount + (log.failureCount || 0),
  }), { totalItems: 0, correctCount: 0, skippedCount: 0, successCount: 0, failureCount: 0 });

  // Format selected date for display
  const displayDate = selectedDate
    ? new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(selectedDate + 'T00:00:00'))
    : '';

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" gutterBottom>Compatibility Batch History</Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Day-wise and seller-wise history of bulk compatibility sends to eBay
        <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 1 }}>
          (All times in IST)
        </Typography>
      </Typography>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          type="date"
          label="Date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
          sx={{ minWidth: 160 }}
        />
        <Autocomplete
          size="small"
          sx={{ minWidth: 180 }}
          options={users}
          getOptionLabel={(option) => option.username || option.email}
          value={users.find(u => u._id === selectedUserId) || null}
          onChange={(event, newValue) => { setSelectedUserId(newValue?._id || ''); setPage(1); }}
          renderInput={(params) => <TextField {...params} label="User" />}
          isOptionEqualToValue={(option, value) => option._id === value._id}
        />
        <Autocomplete
          size="small"
          sx={{ minWidth: 200 }}
          options={sellers}
          getOptionLabel={(option) => option.user?.username || option.user?.email}
          value={sellers.find(s => s._id === selectedSellerId) || null}
          onChange={(event, newValue) => { setSelectedSellerId(newValue?._id || ''); setPage(1); }}
          renderInput={(params) => <TextField {...params} label="Seller" />}
          isOptionEqualToValue={(option, value) => option._id === value._id}
        />
      </Box>

      {/* Date Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight="bold">{displayDate}</Typography>
        {!loading && logs.length > 0 && (
          <>
            <Chip label={`${logs.length} batch${logs.length > 1 ? 'es' : ''}`} size="small" variant="outlined" />
            <Chip label={`${totals.successCount} success`} size="small" color="success" variant="outlined" />
            {totals.failureCount > 0 && (
              <Chip label={`${totals.failureCount} failed`} size="small" color="error" variant="outlined" />
            )}
          </>
        )}
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" mt={5}><CircularProgress /></Box>
      ) : logs.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="textSecondary">No batch history found for {displayDate}</Typography>
        </Paper>
      ) : (
        <>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{
              flex: 1,
              maxHeight: 'calc(100vh - 340px)',
              overflow: 'auto',
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Time (IST)</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Seller</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Total</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Correct</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Skipped</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Success</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Failed</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', zIndex: 2 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log._id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{formatTimeIST(log.createdAt)}</Typography>
                    </TableCell>
                    <TableCell>{log.user?.username || log.user?.name || 'Unknown'}</TableCell>
                    <TableCell>{log.sellerUsername || 'Unknown'}</TableCell>
                    <TableCell align="center">{log.totalItems}</TableCell>
                    <TableCell align="center">
                      <Chip label={log.correctCount} size="small" color="success" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={log.skippedCount} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={log.successCount} size="small" color="success" />
                    </TableCell>
                    <TableCell align="center">
                      {log.failureCount > 0 ? (
                        <Chip label={log.failureCount} size="small" color="error" />
                      ) : (
                        <Chip label="0" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={() => setDetailDialog(log)}>
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Total Summary Row */}
                <TableRow sx={{ bgcolor: '#e3f2fd', position: 'sticky', bottom: 0, zIndex: 1 }}>
                  <TableCell colSpan={3} sx={{ fontWeight: 'bold', borderTop: '2px solid #1976d2' }}>
                    <Typography variant="body2" fontWeight="bold">Day Total</Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', borderTop: '2px solid #1976d2' }}>
                    {totals.totalItems}
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    <Chip label={totals.correctCount} size="small" color="success" variant="outlined" sx={{ fontWeight: 'bold' }} />
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    <Chip label={totals.skippedCount} size="small" variant="outlined" sx={{ fontWeight: 'bold' }} />
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    <Chip label={totals.successCount} size="small" color="success" sx={{ fontWeight: 'bold' }} />
                  </TableCell>
                  <TableCell align="center" sx={{ borderTop: '2px solid #1976d2' }}>
                    {totals.failureCount > 0 ? (
                      <Chip label={totals.failureCount} size="small" color="error" sx={{ fontWeight: 'bold' }} />
                    ) : (
                      <Chip label="0" size="small" variant="outlined" sx={{ fontWeight: 'bold' }} />
                    )}
                  </TableCell>
                  <TableCell sx={{ borderTop: '2px solid #1976d2' }} />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Pagination count={totalPages} page={page} onChange={(e, v) => setPage(v)} color="primary" />
            </Box>
          )}
        </>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={!!detailDialog} onClose={() => setDetailDialog(null)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ borderBottom: '1px solid #eee' }}>
          <Typography variant="h6" fontWeight="bold">Batch Details</Typography>
          <Typography variant="body2" color="textSecondary">
            {detailDialog && `${formatFullIST(detailDialog.createdAt)} • ${detailDialog.user?.username || 'Unknown'} • ${detailDialog.sellerUsername || 'Unknown Seller'}`}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          {detailDialog && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 1 }}>
                <Chip label={`Total: ${detailDialog.totalItems}`} variant="outlined" />
                <Chip label={`Success: ${detailDialog.successCount}`} color="success" />
                <Chip label={`Failed: ${detailDialog.failureCount}`} color={detailDialog.failureCount > 0 ? 'error' : 'default'} />
                <Chip label={`Skipped: ${detailDialog.skippedCount}`} variant="outlined" />
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Status</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Item ID</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell align="right">Vehicles</TableCell>
                      <TableCell>Error / Warning</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailDialog.items.map((item, idx) => (
                      <TableRow key={idx} sx={{ bgcolor: item.status === 'success' ? '#f0fdf4' : item.status === 'failure' ? '#fef2f2' : '#fafafa' }}>
                        <TableCell>
                          <Chip
                            label={item.status === 'success' ? '✓ Success' : item.status === 'failure' ? '✗ Failed' : '⊘ Skipped'}
                            size="small"
                            color={item.status === 'success' ? 'success' : item.status === 'failure' ? 'error' : 'default'}
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </TableCell>
                        <TableCell><Typography variant="caption">{item.itemId}</Typography></TableCell>
                        <TableCell><Typography variant="caption">{item.sku || '—'}</Typography></TableCell>
                        <TableCell align="right">{item.compatibilityCount}</TableCell>
                        <TableCell>
                          {item.error && (
                            <Typography variant="caption" color="error.main" sx={{ maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.error}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(null)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
