// src/pages/admin/ListerInfoDetailPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Button,
  CircularProgress,
  LinearProgress,
  Collapse,
  IconButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import api from '../../lib/api.js';

export default function ListerInfoDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const listerId = searchParams.get('listerId');
  const date = searchParams.get('date');
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ items: [], total: 0 });
  const [listerName, setListerName] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  const loadDetails = async () => {
    try {
      setLoading(true);
      const { data: response } = await api.get('/lister-info/details', {
        params: { listerId, date, limit: 1000 }
      });
      setData(response);
      if (response.items.length > 0 && response.items[0].lister) {
        setListerName(response.items[0].lister.username);
      }
    } catch (e) {
      console.error('Failed to fetch lister details:', e);
      alert('Failed to load lister details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (listerId && date) {
      loadDetails();
    }
  }, [listerId, date]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (completed, total) => {
    if (completed === 0) return 'default';
    if (completed < total) return 'warning';
    return 'success';
  };

  const getProgressPercentage = (completed, total) => {
    if (!total || total <= 0) return 0;
    return Math.round((completed / total) * 100);
  };

  const toggleRow = (itemId) => {
    setExpandedRows(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

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
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/admin/lister-info')}
            variant="outlined"
          >
            Back
          </Button>
          <Box>
            <Typography variant="h5">
              {listerName || 'Lister'} - {formatDate(date)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.total} assignment{data.total !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product Title</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Distributed Qty</TableCell>
              <TableCell>Quantity Pending</TableCell>
              <TableCell>Assigned By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                    No assignments found for this lister on this date.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => {
                const pendingQty = item.quantity - item.completedQuantity;
                const progressPct = getProgressPercentage(item.completedQuantity, item.quantity);
                const isExpanded = expandedRows[item._id];
                const hasRanges = item.rangeQuantities && item.rangeQuantities.length > 0;
                
                return (
                <>
                <TableRow key={item._id} hover>
                  <TableCell>
                    {item.task?.productTitle || 'N/A'}
                  </TableCell>
                  <TableCell>{item.store?.name || 'N/A'}</TableCell>
                  <TableCell>{item.marketplace || 'N/A'}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Typography>{item.completedQuantity}</Typography>
                      {hasRanges && (
                        <IconButton
                          size="small"
                          onClick={() => toggleRow(item._id)}
                        >
                          {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                      <Typography variant="body2">{pendingQty} pending</Typography>
                      <LinearProgress variant="determinate" value={progressPct} sx={{ height: 6, borderRadius: 3 }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {item.completedQuantity} / {item.quantity} ({progressPct}%)
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{item.createdBy?.username || 'N/A'}</TableCell>
                </TableRow>
                {hasRanges && (
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2 }}>
                          <Typography variant="subtitle2" gutterBottom component="div">
                            Quantity Breakdown:
                          </Typography>
                          <Table size="small" sx={{ width: 'auto', ml: 2 }}>
                            <TableHead>
                              <TableRow>
                                <TableCell>Range</TableCell>
                                <TableCell align="right">Quantity</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {item.rangeQuantities.map((rq, idx) => (
                                <TableRow key={idx}>
                                  <TableCell component="th" scope="row">
                                    {rq.range?.name || 'Unknown Range'}
                                  </TableCell>
                                  <TableCell align="right">{rq.quantity}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                )}
                </>
              )})
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
