import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import ChatIcon from '@mui/icons-material/Chat';
import PageHeader from '../../components/PageHeader.jsx';
import StatMetricCard from '../../components/StatMetricCard.jsx';
import api from '../../lib/api';

const BOARD_COLORS = {
  order_fulfillment: '#2563eb',
  cancellation: '#f97316',
  inr: '#ef4444',
  return_refund: '#8b5cf6',
  order_communication: '#10b981',
};

const MARKETPLACE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'EBAY_US', label: 'USA' },
  { value: 'EBAY_CA', label: 'CA' },
  { value: 'EBAY_AU', label: 'AUS' },
  { value: 'EBAY_GB', label: 'UK' },
];

const formatCount = (value) => Number(value || 0).toLocaleString();

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultSingleDay() {
  return formatInputDate(new Date());
}

function BoardPanel({ board }) {
  const color = BOARD_COLORS[board.id] || '#64748b';
  const maxCount = Math.max(...(board.items || []).map((item) => Number(item.count) || 0), 1);

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
        bgcolor: '#fff',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {board.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatCount(board.total)} tracked
          </Typography>
        </Box>
        <Box
          sx={{
            minWidth: 54,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            textAlign: 'center',
            bgcolor: `${color}1a`,
            color,
            border: '1px solid',
            borderColor: color,
            fontWeight: 800,
          }}
        >
          {formatCount(board.total)}
        </Box>
      </Stack>

      <Stack spacing={1.25} sx={{ p: 2 }}>
        {(board.items || []).map((item) => {
          const count = Number(item.count) || 0;
          const width = `${Math.max(3, Math.round((count / maxCount) * 100))}%`;
          return (
            <Box key={item.id}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>
                  {item.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, color }}>
                  {formatCount(count)}
                </Typography>
              </Stack>
              <Box sx={{ mt: 0.5, height: 8, borderRadius: 999, bgcolor: '#e5e7eb', overflow: 'hidden' }}>
                <Box sx={{ width, height: '100%', bgcolor: color, borderRadius: 999 }} />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}

export default function ComplianceMonitoringPage() {
  const [overview, setOverview] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  const [dateFilter, setDateFilter] = useState({
    mode: 'none',
    single: '',
    from: '',
    to: '',
  });
  const [excludeClient, setExcludeClient] = useState(true);
  const [excludeLowValue, setExcludeLowValue] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/sellers/all')
      .then(({ data }) => {
        if (mounted) setSellers(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (mounted) setSellers([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/orders/compliance-monitoring/overview', {
        params: {
          sellerId: selectedSeller || undefined,
          marketplace: selectedMarketplace || undefined,
          dateMode: dateFilter.mode,
          dateSingle: dateFilter.mode === 'single' ? dateFilter.single : undefined,
          dateFrom: dateFilter.mode === 'range' ? dateFilter.from : undefined,
          dateTo: dateFilter.mode === 'range' ? dateFilter.to : undefined,
          excludeClient,
          excludeLowValue,
        },
      });
      setOverview(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load compliance monitoring');
    } finally {
      setLoading(false);
    }
  }, [selectedSeller, selectedMarketplace, dateFilter, excludeClient, excludeLowValue]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const generatedAt = useMemo(() => {
    if (!overview?.generatedAt) return '';
    try {
      return new Date(overview.generatedAt).toLocaleString();
    } catch {
      return '';
    }
  }, [overview?.generatedAt]);

  return (
    <Box>
      <PageHeader
        title="Compliance Monitoring"
        subtitle="Complete overview of Compliance Board counts across all board areas."
        breadcrumbs={[{ label: 'Compliance & Support' }, { label: 'Monitoring' }]}
        actions={(
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={loadOverview}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      />

      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 260 } }}>
            <InputLabel>Seller Account</InputLabel>
            <Select
              label="Seller Account"
              value={selectedSeller}
              onChange={(event) => setSelectedSeller(event.target.value)}
            >
              <MenuItem value="">All Sellers</MenuItem>
              {sellers.map((seller) => (
                <MenuItem key={seller._id} value={seller._id}>
                  {seller.user?.username || seller.ebayUserId || seller._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 130 } }}>
            <InputLabel>Date Mode</InputLabel>
            <Select
              label="Date Mode"
              value={dateFilter.mode}
              onChange={(event) => {
                const mode = event.target.value;
                setDateFilter((prev) => ({
                  ...prev,
                  mode,
                  single: mode === 'single' && !prev.single ? getDefaultSingleDay() : prev.single,
                }));
              }}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="single">Single Date</MenuItem>
              <MenuItem value="range">Date Range</MenuItem>
            </Select>
          </FormControl>
          {dateFilter.mode === 'single' && (
            <TextField
              label="Date"
              type="date"
              size="small"
              value={dateFilter.single}
              onChange={(event) => setDateFilter((prev) => ({ ...prev, single: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: '100%', md: 150 } }}
            />
          )}
          {dateFilter.mode === 'range' && (
            <>
              <TextField
                label="From"
                type="date"
                size="small"
                value={dateFilter.from}
                onChange={(event) => setDateFilter((prev) => ({ ...prev, from: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: '100%', md: 150 } }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={dateFilter.to}
                onChange={(event) => setDateFilter((prev) => ({ ...prev, to: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: '100%', md: 150 } }}
              />
            </>
          )}
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 130 } }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              label="Marketplace"
              value={selectedMarketplace}
              onChange={(event) => setSelectedMarketplace(event.target.value)}
            >
              {MARKETPLACE_OPTIONS.map((option) => (
                <MenuItem key={option.value || 'all'} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={excludeClient} onChange={(event) => setExcludeClient(event.target.checked)} />}
            label="Exclude Client"
          />
          <FormControlLabel
            control={<Switch checked={excludeLowValue} onChange={(event) => setExcludeLowValue(event.target.checked)} />}
            label="Exclude <$3"
          />
          <Box sx={{ flex: 1 }} />
          {generatedAt && (
            <Typography variant="caption" color="text.secondary">
              Last updated {generatedAt}
            </Typography>
          )}
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading && !overview ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
            <StatMetricCard
              label="All Tracked Items"
              value={formatCount(overview?.totals?.allTracked)}
              icon={DashboardIcon}
              tone="info"
            />
            <StatMetricCard
              label="Order Boards"
              value={formatCount(overview?.totals?.orderBoards)}
              icon={AssignmentTurnedInIcon}
              tone="success"
            />
            <StatMetricCard
              label="Order Communication"
              value={formatCount(overview?.totals?.orderCommunication)}
              icon={ChatIcon}
              tone="warning"
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {(overview?.boards || []).map((board) => (
              <BoardPanel key={board.id} board={board} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
