import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../lib/api';
import {
  formatFreeListings,
  formatStoreSubscriptionPrice,
  formatTerm,
  freeListingsSortValue,
  levelChipColor,
  levelSortValue,
  mergedStatusLabel,
  mergedStatusSortValue,
  monthlyStorePriceAmount,
  priceSortValue,
  termInMonths,
} from '../../lib/storeSubscriptionDisplay.js';

const SORT_COLUMNS = {
  sellerName: { label: 'Store', align: 'left' },
  quantityLimitRemaining: { label: 'Qty limit', align: 'right' },
  amountLimitRemaining: { label: 'Amt limit', align: 'right' },
  totalLimit: { label: 'Total Limit', align: 'right' },
  subscriptionLevel: { label: 'Store level', align: 'left' },
  term: { label: 'Term', align: 'left' },
  price: { label: 'Price', align: 'right' },
  freeListings: { label: 'Free listings', align: 'right' },
  status: { label: 'Status', align: 'center' },
};

function formatCurrency(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(num);
}

function formatCurrencyCompact(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
}

function formatNumber(num) {
  if (num === undefined || num === null || num === '') return '—';
  const n = parseInt(num, 10);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString();
}

function formatNumberCompact(num) {
  if (num === undefined || num === null || num === '') return '—';
  const n = parseInt(num, 10);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

function sortableLimitValue(row, field, errorField = 'privilegeError') {
  if (row.notConnected || row[errorField]) return null;
  const val = Number(row[field]);
  return Number.isFinite(val) ? val : null;
}

function compareNullableNumeric(a, b, dir) {
  const aMissing = a === null;
  const bMissing = b === null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return dir * (a - b);
}

function formatTotalLimit(row) {
  const qty = formatNumberCompact(row.accountLimitQuantity);
  const amt = formatCurrencyCompact(row.accountLimitAmount, row.accountLimitCurrency);
  if (qty === '—' && amt === '—') return '—';
  if (qty === '—') return `— / ${amt}`;
  if (amt === '—') return `${qty} / —`;
  return `${qty} / ${amt}`;
}

function pickSubscriptionRow(rows = []) {
  if (!rows.length) return null;
  return rows.find((row) => row.subscriptionLevel) || rows[0];
}

function mergeStoreOverviewRows(privileges = [], accountPrivileges = [], subscriptionRows = []) {
  const privilegesBySeller = new Map(
    privileges.map((row) => [String(row.sellerId), row])
  );
  const accountPrivilegesBySeller = new Map(
    accountPrivileges.map((row) => [String(row.sellerId), row])
  );
  const subscriptionsBySeller = new Map();

  for (const row of subscriptionRows) {
    const sellerId = String(row.sellerId);
    const existing = subscriptionsBySeller.get(sellerId) || [];
    existing.push(row);
    subscriptionsBySeller.set(sellerId, existing);
  }

  const sellerIds = new Set([
    ...privilegesBySeller.keys(),
    ...accountPrivilegesBySeller.keys(),
    ...subscriptionsBySeller.keys(),
  ]);

  return [...sellerIds]
    .map((sellerId) => {
      const priv = privilegesBySeller.get(sellerId) || {};
      const accountPriv = accountPrivilegesBySeller.get(sellerId) || {};
      const sub = pickSubscriptionRow(subscriptionsBySeller.get(sellerId)) || {};

      return {
        sellerId,
        sellerName: priv.sellerName || sub.sellerName || 'Unknown store',
        quantityLimitRemaining: priv.quantityLimitRemaining,
        amountLimitRemaining: priv.amountLimitRemaining,
        amountLimitCurrency: priv.amountLimitCurrency,
        accountLimitQuantity: accountPriv.limitQuantity,
        accountLimitAmount: accountPriv.limitAmount,
        accountLimitCurrency: accountPriv.limitCurrency,
        accountPrivilegeError: accountPriv.error || null,
        subscriptionLevel: sub.subscriptionLevel || null,
        termValue: sub.termValue,
        termUnit: sub.termUnit,
        notConnected: Boolean(priv.notConnected || sub.notConnected),
        privilegeError: priv.error || null,
        subscriptionError: sub.error || null,
        needsReconnect: sub.needsReconnect || false,
        noPlan: Boolean(sub.noPlan),
      };
    })
    .sort((a, b) => String(a.sellerName).localeCompare(String(b.sellerName)));
}

function compareRows(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  const tieBreak = () => String(a.sellerName || '').localeCompare(
    String(b.sellerName || ''),
    undefined,
    { sensitivity: 'base' }
  );

  let cmp = 0;
  switch (sortBy) {
    case 'sellerName':
      cmp = String(a.sellerName || '').localeCompare(
        String(b.sellerName || ''),
        undefined,
        { sensitivity: 'base' }
      );
      break;
    case 'quantityLimitRemaining': {
      const valA = a.notConnected || a.privilegeError ? -1 : Number(a.quantityLimitRemaining) || -1;
      const valB = b.notConnected || b.privilegeError ? -1 : Number(b.quantityLimitRemaining) || -1;
      cmp = valA - valB;
      break;
    }
    case 'amountLimitRemaining': {
      const valA = a.notConnected || a.privilegeError ? -1 : Number(a.amountLimitRemaining) || -1;
      const valB = b.notConnected || b.privilegeError ? -1 : Number(b.amountLimitRemaining) || -1;
      cmp = valA - valB;
      break;
    }
    case 'totalLimit': {
      const qtyA = sortableLimitValue(a, 'accountLimitQuantity', 'accountPrivilegeError');
      const qtyB = sortableLimitValue(b, 'accountLimitQuantity', 'accountPrivilegeError');
      const amtA = sortableLimitValue(a, 'accountLimitAmount', 'accountPrivilegeError');
      const amtB = sortableLimitValue(b, 'accountLimitAmount', 'accountPrivilegeError');
      cmp = compareNullableNumeric(qtyA, qtyB, dir);
      if (cmp === 0 && qtyA !== null) {
        cmp = compareNullableNumeric(amtA, amtB, dir);
      }
      break;
    }
    case 'subscriptionLevel':
      cmp = levelSortValue(a.subscriptionLevel) - levelSortValue(b.subscriptionLevel);
      if (cmp === 0) {
        cmp = String(a.subscriptionLevel || '').localeCompare(
          String(b.subscriptionLevel || ''),
          undefined,
          { sensitivity: 'base' }
        );
      }
      break;
    case 'term': {
      const termA = termInMonths(a.termValue, a.termUnit) ?? -1;
      const termB = termInMonths(b.termValue, b.termUnit) ?? -1;
      cmp = termA - termB;
      break;
    }
    case 'price':
      cmp = priceSortValue(a.subscriptionLevel, a.termValue, a.termUnit)
        - priceSortValue(b.subscriptionLevel, b.termValue, b.termUnit);
      break;
    case 'freeListings':
      cmp = freeListingsSortValue(a.subscriptionLevel) - freeListingsSortValue(b.subscriptionLevel);
      break;
    case 'status':
      cmp = mergedStatusSortValue(a) - mergedStatusSortValue(b);
      if (cmp === 0) {
        cmp = mergedStatusLabel(a).localeCompare(mergedStatusLabel(b), undefined, { sensitivity: 'base' });
      }
      break;
    default:
      cmp = 0;
  }

  if (cmp === 0 && sortBy !== 'sellerName') return tieBreak();
  if (sortBy === 'totalLimit') return cmp;
  return dir * cmp;
}

function SortableHeader({ column, sortBy, sortOrder, onSort }) {
  const meta = SORT_COLUMNS[column];
  return (
    <TableCell align={meta.align} sx={{ fontWeight: 700 }}>
      <TableSortLabel
        active={sortBy === column}
        direction={sortBy === column ? sortOrder : 'asc'}
        onClick={() => onSort(column)}
      >
        {meta.label}
      </TableSortLabel>
    </TableCell>
  );
}

export default function StoreOverviewPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('sellerName');
  const [sortOrder, setSortOrder] = useState('asc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [privilegesRes, accountPrivilegesRes, subscriptionsRes] = await Promise.all([
        api.get('/ebay/selling/summary/all'),
        api.get('/ebay/account/privileges/all'),
        api.get('/ebay/account/subscriptions/all'),
      ]);

      const privileges = privilegesRes.data?.success
        ? (privilegesRes.data.data || [])
        : [];
      const accountPrivileges = accountPrivilegesRes.data?.success
        ? (accountPrivilegesRes.data.rows || [])
        : [];
      const subscriptionRows = subscriptionsRes.data?.success
        ? (subscriptionsRes.data.rows || [])
        : [];

      if (!privilegesRes.data?.success && !accountPrivilegesRes.data?.success && !subscriptionsRes.data?.success) {
        setError('Failed to load store overview data');
        setRows([]);
        return;
      }

      setRows(mergeStoreOverviewRows(privileges, accountPrivileges, subscriptionRows));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load store overview');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.sellerName,
        row.subscriptionLevel,
        mergedStatusLabel(row),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    const next = [...filteredRows];
    next.sort((a, b) => compareRows(a, b, sortBy, sortOrder));
    return next;
  }, [filteredRows, sortBy, sortOrder]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortOrder('asc');
  };

  const summary = useMemo(() => {
    const withPlan = rows.filter((r) => r.subscriptionLevel && !r.notConnected).length;
    const noPlan = rows.filter((r) => r.noPlan && !r.notConnected).length;
    const notConnected = rows.filter((r) => r.notConnected).length;
    const errors = rows.filter((r) => r.privilegeError || r.subscriptionError).length;
    return { withPlan, noPlan, notConnected, errors };
  }, [rows]);

  const billingKpi = useMemo(() => {
    const billableRows = rows.filter(
      (row) => row.subscriptionLevel
        && !row.notConnected
        && !row.privilegeError
        && !row.subscriptionError
        && !row.noPlan
    );

    let total = 0;
    let storeCount = 0;
    for (const row of billableRows) {
      const amount = monthlyStorePriceAmount(row.subscriptionLevel, row.termValue, row.termUnit);
      if (amount == null) continue;
      total += amount;
      storeCount += 1;
    }

    return { total, storeCount };
  }, [rows]);

  const formatUsdTotal = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1600, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 1.75 }, mb: 1.5 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1.5}
          alignItems={{ lg: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.2 }}>
              Store Overview
            </Typography>
            {!loading && rows.length > 0 && (
              <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                <Chip label={`${rows.length} stores`} size="small" variant="outlined" />
                <Chip label={`${summary.withPlan} with plan`} size="small" color="success" variant="outlined" />
                {summary.noPlan > 0 && <Chip label={`${summary.noPlan} no plan`} size="small" variant="outlined" />}
                {summary.notConnected > 0 && (
                  <Chip label={`${summary.notConnected} not connected`} size="small" color="warning" />
                )}
                {summary.errors > 0 && <Chip label={`${summary.errors} errors`} size="small" color="error" />}
              </Stack>
            )}
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ sm: 'center' }}
            sx={{ flexShrink: 0, width: { xs: '100%', lg: 'auto' } }}
          >
            {!loading && (
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  minWidth: 138,
                }}
              >
                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" lineHeight={1.2}>
                  Monthly total
                </Typography>
                <Typography variant="h6" fontWeight={800} lineHeight={1.25}>
                  {formatUsdTotal(billingKpi.total)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                  {billingKpi.storeCount} priced store{billingKpi.storeCount === 1 ? '' : 's'}
                </Typography>
              </Box>
            )}
            <TextField
              size="small"
              placeholder="Search store or level…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ width: { xs: '100%', sm: 240 } }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              onClick={fetchData}
              disabled={loading}
              sx={{ whiteSpace: 'nowrap', px: 2 }}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table
            size="small"
            stickyHeader
            sx={{
              '& .MuiTableCell-root': {
                py: 0.9,
              },
              '& .MuiTableCell-head': {
                py: 1,
              },
            }}
          >
            <TableHead>
              <TableRow>
                {Object.keys(SORT_COLUMNS).map((column) => (
                  <SortableHeader
                    key={column}
                    column={column}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading selling limits and store subscriptions…
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No stores found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row) => (
                  <TableRow key={row.sellerId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{row.sellerName}</Typography>
                    </TableCell>
                    <TableCell align="right">{formatNumber(row.quantityLimitRemaining)}</TableCell>
                    <TableCell align="right">
                      {formatCurrency(row.amountLimitRemaining, row.amountLimitCurrency)}
                    </TableCell>
                    <TableCell align="right">
                      {formatTotalLimit(row)}
                    </TableCell>
                    <TableCell>
                      {row.subscriptionLevel ? (
                        <Chip
                          size="small"
                          label={row.subscriptionLevel}
                          color={levelChipColor(row.subscriptionLevel)}
                        />
                      ) : '—'}
                    </TableCell>
                    <TableCell>{formatTerm(row.termValue, row.termUnit)}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatStoreSubscriptionPrice(row.subscriptionLevel, row.termValue, row.termUnit)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatFreeListings(row.subscriptionLevel)}</TableCell>
                    <TableCell align="center">
                      {row.notConnected ? (
                        <Chip size="small" label="Not connected" color="warning" />
                      ) : row.privilegeError || row.subscriptionError ? (
                        <Chip
                          size="small"
                          label={row.needsReconnect ? 'Reconnect OAuth' : 'Error'}
                          color="error"
                          title={row.privilegeError || row.subscriptionError}
                        />
                      ) : row.noPlan ? (
                        <Chip size="small" label="No store plan" variant="outlined" />
                      ) : (
                        <Chip size="small" label="Active" color="success" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
