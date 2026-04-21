// src/pages/admin/StoreWiseTaskListPage.jsx
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
import StorefrontIcon from '@mui/icons-material/Storefront';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import api from '../../lib/api.js';

export default function StoreWiseTaskListPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/store-wise-tasks/summary');
      setCards(data);
    } catch (e) {
      console.error('Failed to fetch store-wise summary:', e);
      alert('Failed to load store-wise tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleCardClick = (storeId, date) => {
    navigate(`/admin/store-wise-tasks/details?storeId=${storeId}&date=${date}`);
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
      const dateKey = card.date; // Use the date string as key
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
            Store-Wise Task List
          </Typography>
          <Tooltip title="Tasks are grouped by their scheduled date. All tasks shown regardless of scheduled date.">
            <InfoOutlinedIcon color="action" fontSize="small" sx={{ cursor: 'help' }} />
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          View all assignments grouped by store and scheduled date. Click on a card to see detailed assignments.
        </Typography>
      </Paper>

      {cards.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No assignments found. Start assigning tasks from the Listing Management page.
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
                  {dateCards.length} store{dateCards.length !== 1 ? 's' : ''} with tasks
                </Typography>
              </Paper>
              
              {/* Cards for this date */}
              <Grid container spacing={2}>
                {dateCards.map((card, idx) => {
                  const progressPct = getProgressPercentage(card.completedQuantity, card.totalQuantity);
                  const pending = card.pendingQuantity || 0;

                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={`${card.storeId}-${card.date}-${idx}`}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: 4,
                          },
                        }}
                        onClick={() => handleCardClick(card.storeId, card.date)}
                      >
                        <CardContent>
                          <Stack spacing={2}>
                            {/* Store Name */}
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <StorefrontIcon color="primary" />
                              <Typography variant="h6" noWrap>
                                {card.storeName}
                              </Typography>
                            </Stack>

                            {/* Assignment Count */}
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <AssignmentIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary">
                                {card.assignmentCount} assignment{card.assignmentCount !== 1 ? 's' : ''}
                              </Typography>
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
