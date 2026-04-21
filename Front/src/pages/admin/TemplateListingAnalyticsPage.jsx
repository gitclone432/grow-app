import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Breadcrumbs, Link, TextField, Button, FormControl,
  InputLabel, Select, MenuItem, Chip, CircularProgress, Alert, Grid,
  Card, CardContent, Collapse, IconButton, Pagination
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Download as DownloadIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import api from '../../lib/api';

export default function TemplateListingAnalyticsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateId = searchParams.get('templateId');
  const sellerId = searchParams.get('sellerId');

  const [template, setTemplate] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1); // First day of current month
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedUser, setSelectedUser] = useState('all');

  // Data
  const [analytics, setAnalytics] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);
  const [dateDetails, setDateDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});

  // Pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
    if (sellerId) {
      fetchSeller();
    }
  }, [templateId, sellerId]);

  useEffect(() => {
    if (templateId) {
      fetchAnalytics();
    }
  }, [templateId, sellerId, startDate, endDate, selectedUser, page]);

  const fetchTemplate = async () => {
    try {
      const { data } = await api.get(`/listing-templates/${templateId}`);
      setTemplate(data);
    } catch (err) {
      console.error('Error fetching template:', err);
    }
  };

  const fetchSeller = async () => {
    try {
      const { data } = await api.get('/sellers/all');
      const foundSeller = data.find(s => s._id === sellerId);
      setSeller(foundSeller);
    } catch (err) {
      console.error('Error fetching seller:', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get('/template-listings/analytics', {
        params: {
          templateId,
          sellerId,
          startDate,
          endDate,
          userId: selectedUser,
          page,
          limit: 100
        }
      });
      setAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const fetchDateDetails = async (date) => {
    if (dateDetails[date]) {
      setExpandedDate(expandedDate === date ? null : date);
      return;
    }

    try {
      setLoadingDetails(prev => ({ ...prev, [date]: true }));
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);

      const { data } = await api.get('/template-listings/analytics', {
        params: {
          templateId,
          sellerId,
          startDate: dateStart.toISOString(),
          endDate: dateEnd.toISOString(),
          limit: 1000
        }
      });

      setDateDetails(prev => ({ ...prev, [date]: data.listings }));
      setExpandedDate(date);
    } catch (err) {
      console.error('Error fetching date details:', err);
    } finally {
      setLoadingDetails(prev => ({ ...prev, [date]: false }));
    }
  };

  const handleExport = async () => {
    try {
      const { data } = await api.get('/template-listings/analytics', {
        params: {
          templateId,
          sellerId,
          startDate,
          endDate,
          userId: selectedUser,
          limit: 10000
        }
      });

      // Convert to CSV
      const headers = ['Date', 'Time', 'SKU', 'Title', 'ASIN', 'Added By', 'Role'];
      const rows = data.listings.map(l => [
        new Date(l.createdAt).toLocaleDateString(),
        new Date(l.createdAt).toLocaleTimeString(),
        l.customLabel || '',
        l.title || '',
        l._asinReference || '',
        l.createdBy?.username || 'Unknown',
        l.createdBy?.role || 'N/A'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-analytics-${templateId}-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting:', err);
      alert('Failed to export data');
    }
  };

  const getQuickDateRange = (range) => {
    const end = new Date();
    const start = new Date();

    switch (range) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last7days':
        start.setDate(start.getDate() - 7);
        break;
      case 'thisMonth':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() - 1);
        end.setDate(new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate());
        end.setHours(23, 59, 59, 999);
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setPage(1);
  };

  return (
    <Box>
      {/* Breadcrumb Navigation */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          variant="body2"
          onClick={() => navigate('/admin/select-seller')}
          sx={{ cursor: 'pointer', textDecoration: 'none' }}
        >
          Select Seller
        </Link>
        <Link
          component="button"
          variant="body2"
          onClick={() => navigate(`/admin/seller-templates?sellerId=${sellerId}`)}
          sx={{ cursor: 'pointer', textDecoration: 'none' }}
        >
          {seller?.user?.username || seller?.user?.email || 'Seller'}
        </Link>
        <Link
          component="button"
          variant="body2"
          onClick={() => navigate(`/admin/template-listings?templateId=${templateId}&sellerId=${sellerId}`)}
          sx={{ cursor: 'pointer', textDecoration: 'none' }}
        >
          {template?.name || 'Template Listings'}
        </Link>
        <Typography color="text.primary" variant="body2">
          Analytics
        </Typography>
      </Breadcrumbs>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight="600">
          📊 Listing Analytics
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          disabled={!analytics || analytics.listings?.length === 0}
        >
          Export CSV
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>Filters</Typography>
        
        {/* Quick Date Ranges */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
          <Chip label="Today" onClick={() => getQuickDateRange('today')} size="small" />
          <Chip label="Yesterday" onClick={() => getQuickDateRange('yesterday')} size="small" />
          <Chip label="Last 7 Days" onClick={() => getQuickDateRange('last7days')} size="small" />
          <Chip label="This Month" onClick={() => getQuickDateRange('thisMonth')} size="small" />
          <Chip label="Last Month" onClick={() => getQuickDateRange('lastMonth')} size="small" />
        </Stack>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <TextField
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>User Filter</InputLabel>
              <Select
                value={selectedUser}
                label="User Filter"
                onChange={(e) => { setSelectedUser(e.target.value); setPage(1); }}
              >
                <MenuItem value="all">All Users</MenuItem>
                {analytics?.userBreakdown?.map(u => (
                  <MenuItem key={u.userId} value={u.userId}>
                    {u.username} ({u.count} listings)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              variant="contained"
              fullWidth
              onClick={fetchAnalytics}
              disabled={loading}
            >
              Apply
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : analytics ? (
        <>
          {/* Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Total Listings
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {analytics.summary?.totalInPeriod || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Unique Users
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {analytics.summary?.uniqueUsers || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Avg Per Day
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {analytics.dailyBreakdown?.length > 0
                      ? Math.round(analytics.summary.totalInPeriod / analytics.dailyBreakdown.length)
                      : 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            {/* Commented out for now - Top Contributor card
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Top Contributor
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" color="secondary.main" noWrap>
                    {analytics.userBreakdown?.[0]?.username || 'N/A'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {analytics.userBreakdown?.[0]?.count || 0} listings
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            */}
          </Grid>

          {/* Daily Breakdown Table */}
          <Paper sx={{ mb: 3 }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6">Daily Breakdown</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width="50px"></TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Contributors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.dailyBreakdown?.length > 0 ? (
                    analytics.dailyBreakdown.map((day) => (
                      <>
                        <TableRow
                          key={day.date}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => fetchDateDetails(day.date)}
                        >
                          <TableCell>
                            <IconButton size="small">
                              {expandedDate === day.date ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <CalendarIcon fontSize="small" color="action" />
                              <Typography variant="body2">
                                {new Date(day.date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Chip label={day.total} color="primary" size="small" />
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                              {day.users.map((u, idx) => (
                                <Chip
                                  key={idx}
                                  icon={<PersonIcon />}
                                  label={`${u.username} (${u.count})`}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expandable Details */}
                        <TableRow>
                          <TableCell colSpan={4} sx={{ py: 0, border: 0 }}>
                            <Collapse in={expandedDate === day.date} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                                {loadingDetails[day.date] ? (
                                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                    <CircularProgress size={24} />
                                  </Box>
                                ) : dateDetails[day.date] ? (
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Time</TableCell>
                                        <TableCell>SKU</TableCell>
                                        <TableCell>Title</TableCell>
                                        <TableCell>ASIN</TableCell>
                                        <TableCell>Added By</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {dateDetails[day.date].map((listing) => (
                                        <TableRow key={listing._id}>
                                          <TableCell>
                                            {new Date(listing.createdAt).toLocaleTimeString()}
                                          </TableCell>
                                          <TableCell>
                                            <Typography variant="body2" fontFamily="monospace">
                                              {listing.customLabel}
                                            </Typography>
                                          </TableCell>
                                          <TableCell>
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                                              {listing.title}
                                            </Typography>
                                          </TableCell>
                                          <TableCell>
                                            <Typography variant="body2" fontFamily="monospace">
                                              {listing._asinReference || '-'}
                                            </Typography>
                                          </TableCell>
                                          <TableCell>
                                            <Chip
                                              icon={<PersonIcon />}
                                              label={listing.createdBy?.username || 'Unknown'}
                                              size="small"
                                              color={listing.createdBy?.role === 'lister' ? 'primary' : 'default'}
                                            />
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                ) : null}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No data available for the selected period
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* User Breakdown */}
          <Paper>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6">User Breakdown</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Listings Added</TableCell>
                    <TableCell align="right">Percentage</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.userBreakdown?.map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PersonIcon fontSize="small" color="action" />
                          <Typography variant="body2" fontWeight="500">
                            {user.username}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip label={user.role} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="600">
                          {user.count}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {analytics.summary?.totalInPeriod > 0
                            ? Math.round((user.count / analytics.summary.totalInPeriod) * 100)
                            : 0}%
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">
            Select filters and click Apply to view analytics
          </Typography>
        </Box>
      )}
    </Box>
  );
}
