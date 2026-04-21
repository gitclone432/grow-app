import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

const getISTDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
};
import {
  Box, Typography, Container, Paper, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Button, Chip, InputAdornment, MenuItem, Select, 
  FormControl, InputLabel, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import InventoryIcon from '@mui/icons-material/Inventory';
import StoreIcon from '@mui/icons-material/Store';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import api from '../../lib/api';

export default function ListingStatsPage() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Date filter mode: 'single' or 'range'
  const [dateMode, setDateMode] = useState('single');
  
  // Single date
  const [selectedDate, setSelectedDate] = useState(() => getISTDate());
  
  // Date range
  const [startDate, setStartDate] = useState(() => getISTDate(-7));
  const [endDate, setEndDate] = useState(() => getISTDate());
  
  const [sellerFilter, setSellerFilter] = useState('all');

  // Used to discard stale responses when date changes mid-request
  const fetchGenRef = useRef(0);

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      setLoading(true);
      setError(null);
      const params = {};
      
      if (dateMode === 'single') {
        params.startDate = selectedDate;
        params.endDate = selectedDate;
      } else {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      
      const { data } = await api.get('/listing-stats/day-wise-counts', { params });
      if (gen !== fetchGenRef.current) return; // stale — a newer request is in-flight
      setStats(data);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err.response?.data?.error || 'Failed to fetch listing statistics');
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [dateMode, selectedDate, startDate, endDate]);

  // Auto-fetch data when dates or date mode change
  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  // Unique sellers for filter dropdown
  const sellerOptions = useMemo(() => {
    const map = {};
    stats.forEach(s => { 
      if (s.sellerId && s.sellerName) {
        map[s.sellerId] = s.sellerName;
      }
    });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [stats]);

  // Filtered stats
  const filteredStats = useMemo(() => {
    if (sellerFilter === 'all') return stats;
    return stats.filter(s => s.sellerId === sellerFilter);
  }, [stats, sellerFilter]);

  // Group stats by date for better display
  const statsByDate = useMemo(() => {
    const grouped = {};
    filteredStats.forEach(stat => {
      if (!grouped[stat.date]) {
        grouped[stat.date] = [];
      }
      grouped[stat.date].push(stat);
    });
    return grouped;
  }, [filteredStats]);

  // Daily total for display
  const dailyTotal = useMemo(() => {
    return filteredStats.reduce((sum, stat) => sum + (stat.count || 0), 0);
  }, [filteredStats]);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InventoryIcon color="primary" /> Day-Wise Listing Counts
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <ToggleButtonGroup
            value={dateMode}
            exclusive
            onChange={(e, newMode) => newMode && setDateMode(newMode)}
            size="small"
          >
            <ToggleButton value="single">Single Date</ToggleButton>
            <ToggleButton value="range">Date Range</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {dateMode === 'single' ? (
            <TextField
              label="Select Date (IST)"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              InputProps={{ 
                startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment> 
              }}
              size="small"
              sx={{ minWidth: 200 }}
            />
          ) : (
            <>
              <TextField
                label="Start Date (IST)"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                InputProps={{ 
                  startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment> 
                }}
                size="small"
                sx={{ minWidth: 180 }}
              />
              <TextField
                label="End Date (IST)"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                InputProps={{ 
                  startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment> 
                }}
                size="small"
                sx={{ minWidth: 180 }}
              />
            </>
          )}

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Seller</InputLabel>
            <Select
              value={sellerFilter}
              label="Filter by Seller"
              onChange={(e) => setSellerFilter(e.target.value)}
              startAdornment={<InputAdornment position="start"><StoreIcon fontSize="small" /></InputAdornment>}
            >
              <MenuItem value="all">All Sellers</MenuItem>
              {sellerOptions.map(([id, name]) => (
                <MenuItem key={id} value={id}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        
        {filteredStats.length > 0 && (
          <Box sx={{ mt: 2, p: 1, bgcolor: 'info.lighter', borderRadius: 1 }}>
            <Typography variant="body2" color="info.main" fontWeight={600}>
              Total Listings in Period: {dailyTotal.toLocaleString()}
            </Typography>
          </Box>
        )}
      </Paper>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <Paper>
          <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
            <Typography variant="h6" fontWeight={600}>
              Listings by Date and Seller (IST)
            </Typography>
          </Box>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell><strong>Date (IST)</strong></TableCell>
                  <TableCell><strong>Seller Name</strong></TableCell>
                  <TableCell align="right"><strong>Listings Count</strong></TableCell>
                  <TableCell align="right"><strong>Empty Compatibility</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.keys(statsByDate).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      No data available for the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  Object.entries(statsByDate).map(([date, dateStats]) => (
                    <>
                      {/* Date Header */}
                      <TableRow key={date} sx={{ bgcolor: 'grey.50' }}>
                        <TableCell colSpan={4}>
                          <Typography variant="subtitle2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CalendarMonthIcon fontSize="small" />
                            {new Date(date + 'T00:00:00+05:30').toLocaleDateString('en-IN', { 
                              weekday: 'short', 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              timeZone: 'Asia/Kolkata'
                            })}
                            <Chip 
                              label={`${dateStats.reduce((sum, s) => sum + s.count, 0)} total`} 
                              size="small" 
                              color="primary" 
                              sx={{ ml: 1 }}
                            />
                            <Chip 
                              label={`${dateStats.reduce((sum, s) => sum + (s.emptyCompatibilityCount || 0), 0)} empty compatibility`} 
                              size="small" 
                              color="warning" 
                            />
                          </Typography>
                        </TableCell>
                      </TableRow>
                      {/* Stats for that date */}
                      {dateStats.map((stat, idx) => (
                        <TableRow key={`${date}-${idx}`} hover>
                          <TableCell sx={{ pl: 4 }}>-</TableCell>
                          <TableCell>{stat.sellerName || 'Unknown Seller'}</TableCell>
                          <TableCell align="right">
                            <Chip 
                              label={stat.count} 
                              size="small" 
                              color="secondary" 
                              icon={<TrendingUpIcon />}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Chip 
                              label={`${stat.emptyCompatibilityCount || 0}/${stat.count}`} 
                              size="small" 
                              color={stat.emptyCompatibilityCount > 0 ? "warning" : "success"}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Container>
  );
}
