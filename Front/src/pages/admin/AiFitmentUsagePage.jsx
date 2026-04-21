import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Container, Paper, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Button, Chip, Stack, Card, CardContent, Tooltip,
  InputAdornment, MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/Save';
import PersonIcon from '@mui/icons-material/Person';
import api from '../../lib/api';

export default function AiFitmentUsagePage() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Default range: last 30 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [userFilter, setUserFilter] = useState('all');

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data } = await api.get('/ai/fitment-usage-stats', { params });
      setStats(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch usage stats');
    } finally {
      setLoading(false);
    }
  };

  // Unique users for filter dropdown
  const userOptions = useMemo(() => {
    const map = {};
    stats.forEach(r => { map[r.userId] = r.username || r.name || r.userId; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [stats]);

  // Filtered stats
  const filteredStats = useMemo(() => {
    if (userFilter === 'all') return stats;
    return stats.filter(r => r.userId === userFilter);
  }, [stats, userFilter]);

  // Summary totals
  const totals = useMemo(() => {
    let aiSuggest = 0, saveNext = 0, saveNextWithData = 0;
    filteredStats.forEach(r => {
      aiSuggest += r.aiSuggestCount || 0;
      saveNext += r.saveNextCount || 0;
      saveNextWithData += r.saveNextWithDataCount || 0;
    });
    return { aiSuggest, saveNext, saveNextWithData };
  }, [filteredStats]);

  // Group by user for user-level summary
  const userSummary = useMemo(() => {
    const map = {};
    filteredStats.forEach(r => {
      if (!map[r.userId]) {
        map[r.userId] = { username: r.username, name: r.name, role: r.role, aiSuggest: 0, saveNext: 0, saveNextWithData: 0, days: new Set() };
      }
      map[r.userId].aiSuggest += r.aiSuggestCount || 0;
      map[r.userId].saveNext += r.saveNextCount || 0;
      map[r.userId].saveNextWithData += r.saveNextWithDataCount || 0;
      map[r.userId].days.add(r.date);
    });
    return Object.entries(map)
      .map(([id, v]) => ({ userId: id, ...v, activeDays: v.days.size }))
      .sort((a, b) => b.aiSuggest - a.aiSuggest);
  }, [filteredStats]);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeIcon color="primary" /> AI Fitment Usage Stats
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchStats} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Start Date"
          type="date"
          size="small"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment>
          }}
        />
        <TextField
          label="End Date"
          type="date"
          size="small"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment>
          }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>User</InputLabel>
          <Select value={userFilter} onChange={e => setUserFilter(e.target.value)} label="User">
            <MenuItem value="all">All Users</MenuItem>
            {userOptions.map(([id, name]) => (
              <MenuItem key={id} value={id}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" onClick={fetchStats} disabled={loading} sx={{ minWidth: 100 }}>
          Apply
        </Button>
      </Paper>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <>
          {/* Summary Cards */}
          <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
            <Card sx={{ flex: 1, minWidth: 200, bgcolor: '#f5f3ff', border: '1px solid #e0d4fd' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <AutoAwesomeIcon sx={{ color: '#7c3aed', fontSize: 28, mb: 0.5 }} />
                <Typography variant="h4" fontWeight={700} color="#7c3aed">{totals.aiSuggest.toLocaleString()}</Typography>
                <Typography variant="body2" color="text.secondary">AI Suggest Requests</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 200, bgcolor: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <SaveIcon sx={{ color: '#0284c7', fontSize: 28, mb: 0.5 }} />
                <Typography variant="h4" fontWeight={700} color="#0284c7">{totals.saveNext.toLocaleString()}</Typography>
                <Typography variant="body2" color="text.secondary">Save & Next Clicks</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 200, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <SaveIcon sx={{ color: '#16a34a', fontSize: 28, mb: 0.5 }} />
                <Typography variant="h4" fontWeight={700} color="#16a34a">{totals.saveNextWithData.toLocaleString()}</Typography>
                <Typography variant="body2" color="text.secondary">Save & Next (with Compat Data)</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 200, bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <PersonIcon sx={{ color: '#d97706', fontSize: 28, mb: 0.5 }} />
                <Typography variant="h4" fontWeight={700} color="#d97706">{userSummary.length}</Typography>
                <Typography variant="body2" color="text.secondary">Active Users</Typography>
              </CardContent>
            </Card>
          </Stack>

          {/* User Summary Table */}
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>User Summary</Typography>
          <TableContainer component={Paper} sx={{ mb: 3, maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Active Days</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    <Tooltip title="Total times user triggered AI Suggest (single or bulk)">
                      <span>AI Suggest Requests</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    <Tooltip title="Total times user clicked Save & Next">
                      <span>Save & Next</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    <Tooltip title="Save & Next clicks where user had vehicle entries in the compatibility list">
                      <span>Save & Next (with Data)</span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {userSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No data for the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  userSummary.map(u => (
                    <TableRow key={u.userId} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{u.username || u.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={u.role} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="center">{u.activeDays}</TableCell>
                      <TableCell align="center">
                        <Chip label={u.aiSuggest} color="secondary" size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={u.saveNext} color="primary" size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={u.saveNextWithData} color="success" size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Day-wise Detail Table */}
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>Day-wise Breakdown</Typography>
          <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>AI Suggest Requests</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Save & Next</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Save & Next (with Data)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No data for the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((row, idx) => (
                    <TableRow key={`${row.date}-${row.userId}-${idx}`} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{row.date}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.username || row.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={row.role} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="center">
                        {row.aiSuggestCount > 0 ? (
                          <Chip label={row.aiSuggestCount} color="secondary" size="small" sx={{ fontWeight: 700 }} />
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {row.saveNextCount > 0 ? (
                          <Chip label={row.saveNextCount} color="primary" size="small" sx={{ fontWeight: 700 }} />
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {row.saveNextWithDataCount > 0 ? (
                          <Chip label={row.saveNextWithDataCount} color="success" size="small" sx={{ fontWeight: 700 }} />
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
}
