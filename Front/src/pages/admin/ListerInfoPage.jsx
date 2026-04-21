// src/pages/admin/ListerInfoPage.jsx
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  LinearProgress,
  Stack,
  Chip,
  Paper,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AssignmentIcon from '@mui/icons-material/Assignment';
import StorefrontIcon from '@mui/icons-material/Storefront';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import api from '../../lib/api.js';

export default function ListerInfoPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/lister-info/summary');
      setCards(data);
    } catch (e) {
      console.error('Failed to fetch lister info:', e);
      alert('Failed to load lister information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleCardClick = (listerId, date) => {
    navigate(`/admin/lister-info/details?listerId=${listerId}&date=${date}`);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getProgressPercentage = (completed, total) => {
    if (!total || total <= 0) return 0;
    return Math.round((completed / total) * 100);
  };

  // Group cards by date
  const groupedByDate = useMemo(() => {
    const grouped = {};
    cards.forEach(card => {
      const dateKey = card.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(card);
    });
    // Sort dates in descending order (newest first)
    return Object.entries(grouped).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [cards]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5" gutterBottom sx={{ mb: 0 }}>
            Lister Information
          </Typography>
          <Tooltip title="View all lister assignments grouped by scheduled date. See progress and stores for each lister.">
            <InfoOutlinedIcon color="action" fontSize="small" sx={{ cursor: 'help' }} />
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          View all lister assignments grouped by scheduled date. Click on a card to see detailed assignments.
        </Typography>
      </Paper>

      {cards.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No lister assignments found. Start assigning tasks from the Listing Management page.
          </Typography>
        </Paper>
      ) : (
        <Box>
          {groupedByDate.map(([date, dateCards]) => (
            <Box key={date} sx={{ mb: 4 }}>
              {/* Date Header */}
              <Paper sx={{ p: 1.5, mb: 2, backgroundColor: 'primary.main', color: 'white' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CalendarTodayIcon fontSize="small" />
                  <Typography variant="h6">
                    Scheduled: {formatDate(date)}
                  </Typography>
                </Stack>
                <Typography variant="caption">
                  {dateCards.length} lister{dateCards.length !== 1 ? 's' : ''} with assignments
                </Typography>
              </Paper>
              
              {/* Cards for this date */}
              <Grid container spacing={2}>
                {dateCards.map((card, idx) => {
                  const progressPct = getProgressPercentage(card.completedQuantity, card.totalQuantity);
                  const pending = card.pendingQuantity || 0;

                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={`${card.listerId}-${card.date}-${idx}`}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: 4,
                          },
                        }}
                        onClick={() => handleCardClick(card.listerId, card.date)}
                      >
                        <CardContent>
                          <Stack spacing={2}>
                            {/* Lister Name */}
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <PersonIcon color="primary" />
                              <Typography variant="h6" noWrap>
                                {card.listerName}
                              </Typography>
                            </Stack>

                            {/* Assignment Count */}
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <AssignmentIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary">
                                {card.assignmentCount} assignment{card.assignmentCount !== 1 ? 's' : ''}
                              </Typography>
                            </Stack>

                            {/* Stores */}
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <StorefrontIcon fontSize="small" color="action" />
                              <Tooltip 
                                title={
                                  <Box>
                                    {card.stores.map((store, i) => (
                                      <Typography key={i} variant="caption" display="block">
                                        • {store.storeName}
                                      </Typography>
                                    ))}
                                  </Box>
                                }
                              >
                                <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                                  {card.storeCount} store{card.storeCount !== 1 ? 's' : ''}
                                </Typography>
                              </Tooltip>
                            </Stack>

                            {/* Quantity Stats */}
                            <Box>
                              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Quantity Progress
                                </Typography>
                                <Typography variant="caption" fontWeight="bold">
                                  {progressPct}%
                                </Typography>
                              </Stack>
                              <LinearProgress
                                variant="determinate"
                                value={progressPct}
                                sx={{ height: 8, borderRadius: 4 }}
                              />
                              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {card.completedQuantity} / {card.totalQuantity}
                                </Typography>
                                <Chip
                                  label={`${pending} pending`}
                                  size="small"
                                  color={pending > 0 ? 'warning' : 'success'}
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                              </Stack>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
