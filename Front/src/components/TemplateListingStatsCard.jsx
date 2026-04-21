import { useEffect, useState } from 'react';
import { 
  Paper, Box, Typography, Grid, Chip, Stack, CircularProgress, 
  Button, Divider 
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  CalendarToday as CalendarIcon,
  DateRange as DateRangeIcon,
  Inventory as InventoryIcon,
  Analytics as AnalyticsIcon
} from '@mui/icons-material';
import api from '../lib/api';

const StatBox = ({ label, value, icon: Icon, color = 'primary' }) => (
  <Box sx={{ textAlign: 'center' }}>
    <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 0.5 }}>
      <Icon color={color} fontSize="small" />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
    <Typography variant="h5" color={`${color}.main`} fontWeight="bold">
      {value !== null && value !== undefined ? value.toLocaleString() : '-'}
    </Typography>
  </Box>
);

export default function TemplateListingStatsCard({ templateId, sellerId, onViewDetails }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    if (!templateId) return;
    
    try {
      setLoading(true);
      const { data } = await api.get('/template-listings/stats', {
        params: { templateId, sellerId }
      });
      setStats(data);
      setError('');
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Auto-refresh every minute
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [templateId, sellerId]);

  if (error) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3, bgcolor: 'error.lighter' }}>
        <Typography color="error" variant="body2">{error}</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 2.5, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AnalyticsIcon />
          <Typography variant="h6" fontWeight="600">
            Listing Activity
          </Typography>
        </Stack>
        {onViewDetails && (
          <Button 
            size="small" 
            variant="contained" 
            onClick={onViewDetails}
            sx={{ 
              bgcolor: 'rgba(255, 255, 255, 0.2)', 
              color: 'white',
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.3)' }
            }}
          >
            View Details →
          </Button>
        )}
      </Stack>
      
      <Divider sx={{ mb: 2, borderColor: 'rgba(255, 255, 255, 0.2)' }} />
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={40} sx={{ color: 'white' }} />
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={6} sm={3}>
            <Box sx={{ 
              textAlign: 'center', 
              p: 2, 
              borderRadius: 2, 
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              transition: 'all 0.3s',
              '&:hover': { 
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                transform: 'translateY(-4px)'
              }
            }}>
              <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 1 }}>
                <CalendarIcon fontSize="small" />
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Today
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {stats?.today || 0}
              </Typography>
              <Chip 
                label="Active" 
                size="small" 
                sx={{ 
                  mt: 1, 
                  bgcolor: 'rgba(76, 175, 80, 0.8)', 
                  color: 'white',
                  fontSize: '0.7rem'
                }} 
              />
            </Box>
          </Grid>
          
          <Grid item xs={6} sm={3}>
            <Box sx={{ 
              textAlign: 'center', 
              p: 2, 
              borderRadius: 2, 
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              transition: 'all 0.3s',
              '&:hover': { 
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                transform: 'translateY(-4px)'
              }
            }}>
              <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 1 }}>
                <DateRangeIcon fontSize="small" />
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  This Week
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {stats?.thisWeek || 0}
              </Typography>
              <Chip 
                label="7 Days" 
                size="small" 
                sx={{ 
                  mt: 1, 
                  bgcolor: 'rgba(33, 150, 243, 0.8)', 
                  color: 'white',
                  fontSize: '0.7rem'
                }} 
              />
            </Box>
          </Grid>
          
          <Grid item xs={6} sm={3}>
            <Box sx={{ 
              textAlign: 'center', 
              p: 2, 
              borderRadius: 2, 
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              transition: 'all 0.3s',
              '&:hover': { 
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                transform: 'translateY(-4px)'
              }
            }}>
              <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 1 }}>
                <TrendingUpIcon fontSize="small" />
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  This Month
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {stats?.thisMonth || 0}
              </Typography>
              <Chip 
                label="Current" 
                size="small" 
                sx={{ 
                  mt: 1, 
                  bgcolor: 'rgba(156, 39, 176, 0.8)', 
                  color: 'white',
                  fontSize: '0.7rem'
                }} 
              />
            </Box>
          </Grid>
          
          <Grid item xs={6} sm={3}>
            <Box sx={{ 
              textAlign: 'center', 
              p: 2, 
              borderRadius: 2, 
              bgcolor: 'rgba(255, 255, 255, 0.15)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              transition: 'all 0.3s',
              '&:hover': { 
                bgcolor: 'rgba(255, 255, 255, 0.25)',
                transform: 'translateY(-4px)'
              }
            }}>
              <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 1 }}>
                <InventoryIcon fontSize="small" />
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Total Active
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {stats?.total || 0}
              </Typography>
              <Chip 
                label="All Time" 
                size="small" 
                sx={{ 
                  mt: 1, 
                  bgcolor: 'rgba(255, 255, 255, 0.3)', 
                  color: 'white',
                  fontSize: '0.7rem'
                }} 
              />
            </Box>
          </Grid>
        </Grid>
      )}
    </Paper>
  );
}
