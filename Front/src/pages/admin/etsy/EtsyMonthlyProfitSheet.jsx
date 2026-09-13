import { useCallback, useEffect, useMemo, useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import api from '../../../lib/api.js';
import { aggregateProfitSheetByMonth } from '../../../utils/etsyMonthlyProfit.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableHeaderCellSx,
} from '../../../theme/tableStyles.js';

const ALL_STORES_VALUE = '__all__';

const COLUMNS = [
  { key: 'monthLabel', label: 'Month', align: 'left', minWidth: 160 },
  { key: 'storeName', label: 'Store', align: 'left', minWidth: 120 },
  { key: 'orderCount', label: 'Orders', align: 'right', minWidth: 80 },
  { key: 'qty', label: 'Qty', align: 'right', minWidth: 72 },
  { key: 'total', label: 'Total', align: 'right', minWidth: 120 },
  { key: 'tax', label: 'Sales Tax', align: 'right', minWidth: 112 },
  { key: 'additionalFees', label: 'Additional Fees', align: 'right', minWidth: 140 },
  { key: 'net', label: 'Net', align: 'right', minWidth: 120 },
  { key: 'itemCost', label: 'Item Cost', align: 'right', minWidth: 112 },
  { key: 'shipCost', label: 'Ship Cost', align: 'right', minWidth: 108 },
  { key: 'amazonTax', label: 'Tax', align: 'right', minWidth: 96 },
  { key: 'totalInUsd', label: 'Total (USD)', align: 'right', minWidth: 112 },
  { key: 'totalInRs', label: 'in (Rs)', align: 'right', minWidth: 128 },
  { key: 'markUpFee', label: 'MarkUp Fee', align: 'right', minWidth: 120 },
  { key: 'igst', label: 'IGST', align: 'right', minWidth: 108 },
  { key: 'amazonTotal', label: 'Total', align: 'right', minWidth: 120 },
  { key: 'inHand', label: 'In Hand', align: 'right', minWidth: 128, colorBySign: true },
];

function signedMoneyColor(value) {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num === 0) return null;
  return num > 0 ? '#2e7d32' : '#c62828';
}

export default function EtsyMonthlyProfitSheet() {
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(ALL_STORES_VALUE);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const storeNameById = useMemo(
    () => Object.fromEntries(stores.map((store) => [String(store._id), store.name])),
    [stores]
  );

  const loadStores = useCallback(async () => {
    const { data } = await api.get('/etsy/stores');
    const rows = Array.isArray(data.stores) ? data.stores : [];
    setStores(rows);
    return rows;
  }, []);

  const loadOrders = useCallback(async (storeId) => {
    if (!storeId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = storeId === ALL_STORES_VALUE ? {} : { storeId };
      const { data } = await api.get('/etsy/profit-sheet', { params });
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load profit sheet');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadStores();
        if (!cancelled && rows.length && !selectedStoreId) {
          setSelectedStoreId(ALL_STORES_VALUE);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load stores');
      }
    })();
    return () => { cancelled = true; };
  }, [loadStores, selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId) return undefined;
    loadOrders(selectedStoreId);
    return undefined;
  }, [selectedStoreId, loadOrders]);

  const monthlyRows = useMemo(
    () => aggregateProfitSheetByMonth(
      orders.map((order) => ({
        ...order,
        storeName: order.storeName || storeNameById[String(order.store)] || '',
      }))
    ),
    [orders, storeNameById]
  );

  const tableMinWidth = COLUMNS.reduce((sum, column) => sum + column.minWidth, 0);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: { xs: 1, sm: 2 }, flexShrink: 0 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          spacing={1.5}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <StorefrontIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Monthly totals from Profit Sheet
            </Typography>
            {monthlyRows.length > 0 && (
              <Chip
                size="small"
                color="primary"
                label={`${monthlyRows.length} month${monthlyRows.length === 1 ? '' : 's'}`}
              />
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
              <InputLabel id="monthly-profit-store-label">Etsy Store</InputLabel>
              <Select
                labelId="monthly-profit-store-label"
                value={selectedStoreId}
                label="Etsy Store"
                onChange={(e) => setSelectedStoreId(e.target.value)}
              >
                <MenuItem value={ALL_STORES_VALUE}>All Stores</MenuItem>
                {stores.map((store) => (
                  <MenuItem key={store._id} value={store._id}>{store.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={() => loadOrders(selectedStoreId)}
              disabled={loading}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
      </Paper>

      <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader sx={{ minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align}
                  sx={{ ...tableHeaderCellSx, minWidth: column.minWidth }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && monthlyRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : monthlyRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No Profit Sheet orders to group by month.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : monthlyRows.map((row) => (
              <TableRow key={row.id} hover sx={tableBodyRowSx}>
                {COLUMNS.map((column) => {
                  const raw = row[column.key];
                  const display = raw === '' || raw == null ? '-' : raw;
                  const signColor = column.colorBySign ? signedMoneyColor(raw) : null;
                  return (
                    <TableCell
                      key={column.key}
                      align={column.align}
                      sx={{
                        ...tableBodyCellSx,
                        ...(signColor ? { color: signColor, fontWeight: 700 } : {}),
                      }}
                    >
                      {display}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
