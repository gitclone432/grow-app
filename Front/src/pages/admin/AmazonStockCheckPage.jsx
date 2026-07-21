import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RefreshIcon from '@mui/icons-material/Refresh';
import InventoryIcon from '@mui/icons-material/Inventory';
import EditIcon from '@mui/icons-material/Edit';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CloseIcon from '@mui/icons-material/Close';
import CancelIcon from '@mui/icons-material/Cancel';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ImageIcon from '@mui/icons-material/Image';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../lib/api';
import PageHeader from '../../components/PageHeader';
import { BRAND_DARK } from '../../constants/brandTheme';

const AMAZON_STOCK_CHECK_RUN_FEATURE_ID = 'amazonStockCheck.run';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'United States', credits: 1 },
  { value: 'AUD', label: 'Australia', credits: 5 },
  { value: 'CAD', label: 'Canada', credits: 5 },
  { value: 'GBP', label: 'United Kingdom', credits: 5 }
];

// Amazon marketplace domain per currency, used to open the product page in
// the side-by-side review window synchronously on click (popup-blocker safe).
const AMAZON_DOMAINS = { USD: 'com', AUD: 'com.au', CAD: 'ca', GBP: 'co.uk' };

const VERIFY_DRAWER_WIDTH = 700;
// Bulk-end review dialog only renders up to this many rows — selecting
// thousands of listings would otherwise mean thousands of real DOM rows in
// one paint, which can visibly freeze the tab. Selection and the actual
// end-item calls are unaffected; this only caps what gets drawn for review.
const BULK_END_REVIEW_ROW_CAP = 100;

function getAmazonUrl(item) {
  const domain = AMAZON_DOMAINS[String(item?.currency || '').toUpperCase()];
  if (!domain || !item?.asin) return '';
  return `https://www.amazon.${domain}/dp/${item.asin}`;
}

const STATUS_LABELS = {
  in_stock: 'In stock',
  in_stock_unconfirmed: 'In stock (unconfirmed)',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  unknown_stock_text: 'Unknown stock text',
  no_asin: 'No ASIN',
  error: 'Error',
  processing: 'Processing',
  queued: 'Queued'
};

const FILTER_LABELS = {
  all: 'All',
  actionable: 'Actionable',
  checked: 'Checked',
  in_stock: 'In Stock',
  in_stock_unconfirmed: 'In Stock (Unconfirmed)',
  low_stock: 'Low Stock',
  low_stock_no_orders: 'Low Stock (No Orders 90d)',
  low_stock_with_orders: 'Low Stock (Orders 90d)',
  out_of_stock: 'Out of Stock',
  unknown_stock_text: 'Unknown Stock Text',
  qty_zero_success: 'Qty Zero Success',
  no_asin: 'No ASIN',
  restocked: 'Became Available',
  errors: 'Errors',
  has_orders: 'Has Orders'
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function KpiCard({ label, value, tone = 'default', active = false, onClick }) {
  const colors = {
    default: { bg: '#fff', border: '#e5e7eb', color: BRAND_DARK },
    good: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
    warn: { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
    bad: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
    // Inferred (not Amazon-confirmed) availability — kept visually distinct
    // from "good" so it never reads as a confirmed in-stock result.
    info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' }
  };
  const palette = colors[tone] || colors.default;
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        borderColor: active ? BRAND_DARK : palette.border,
        background: palette.bg,
        borderRadius: 2,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: active ? `0 0 0 2px ${BRAND_DARK}` : 'none'
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800 }}>{label}</Typography>
        <Typography variant="h5" sx={{ color: palette.color, fontWeight: 900 }}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function statusColor(status) {
  if (status === 'in_stock') return 'success';
  if (status === 'in_stock_unconfirmed') return 'info';
  if (status === 'low_stock' || status === 'unknown_stock_text') return 'warning';
  if (status === 'out_of_stock' || status === 'error') return 'error';
  return 'default';
}

function getOrderCount(sellerItems) {
  return (sellerItems || []).reduce((sum, row) => sum + (row.orderCount || 0), 0);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function getRunUser(run) {
  return run?.requestedBy?.username || run?.requestedBy?.name || run?.requestedBy?.email || '-';
}

function getRunScope(run) {
  return `${run.mode} | ${(run.currencies || []).join(', ') || '-'}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

// 12-month order-count sparkline: single hue, baseline-anchored bars,
// per-month tooltip; zero months render as a light stub so the timeline
// stays readable.
function OrderSparkline({ monthly = [] }) {
  if (!monthly.length) return null;
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <Stack
      direction="row"
      spacing="2px"
      alignItems="flex-end"
      sx={{ height: 26, px: 0.5 }}
      aria-label="Orders per month, last 12 months"
    >
      {monthly.map((m) => (
        <Tooltip key={m.month} title={`${formatMonthLabel(m.month)}: ${m.count} order${m.count === 1 ? '' : 's'}`}>
          <Box
            sx={{
              width: 7,
              height: m.count ? Math.max(4, Math.round((m.count / max) * 24)) : 2,
              bgcolor: m.count ? '#2563eb' : '#e2e8f0',
              borderRadius: '1px 1px 0 0'
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

function ListingThumb({ url, title }) {
  if (!url) {
    return (
      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 1,
          bgcolor: '#f1f5f9',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <ImageIcon sx={{ fontSize: 18, color: '#cbd5e1' }} />
      </Box>
    );
  }
  return (
    <Box component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0, lineHeight: 0 }}>
      <Box
        component="img"
        src={url}
        alt={title || 'listing image'}
        loading="lazy"
        sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
      />
    </Box>
  );
}

// One row per seller-listing carrying the SKU being verified. A SKU shared
// across multiple sellers repeats here once per seller/itemId on purpose —
// each is an independent eBay listing that may need its own end/revise action.
function SellerItemsSection({
  rows,
  currentSku,
  images,
  endedItems,
  endingItemId,
  onEndItem,
  revisedItems,
  onReviseItem,
  selectedIds,
  onToggleSelect
}) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 0.5 }}>
        Seller listings ({rows.length})
      </Typography>
      {!rows.length && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No item IDs found.
        </Typography>
      )}
      {rows.map((row) => {
        const endedInfo = endedItems[row.itemId] || row.endedInfo;
        const revisedInfo = revisedItems[row.itemId] || row.revisedInfo;
        const busy = endingItemId === row.itemId;
        return (
          <Paper key={`${row.sellerId}-${row.itemId}`} variant="outlined" sx={{ p: 1.25, mb: 1, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                size="small"
                sx={{ p: 0.25 }}
                disabled={Boolean(endedInfo) || busy}
                checked={selectedIds.has(row.itemId)}
                onChange={() => onToggleSelect(row)}
              />
              <ListingThumb url={images?.[row.itemId]} title={row.title} />
              <Chip size="small" label={row.sellerName} sx={{ fontWeight: 800 }} />
              <Button
                size="small"
                variant="text"
                endIcon={<OpenInNewIcon fontSize="inherit" />}
                href={`https://www.ebay.com/itm/${row.itemId}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontFamily: 'monospace', fontWeight: 800 }}
              >
                {row.itemId}
              </Button>
              {row.sku && currentSku && row.sku !== currentSku && (
                <Tooltip title={`Variant listing — exact SKU is ${row.sku}`}>
                  <Chip
                    size="small"
                    variant="outlined"
                    color="info"
                    label={row.sku}
                    sx={{ fontWeight: 800, fontFamily: 'monospace' }}
                  />
                </Tooltip>
              )}
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                {row.price != null ? `${row.price} ${row.currency}` : '-'}
              </Typography>
              {!endedInfo && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditIcon />}
                  disabled={busy}
                  onClick={() => onReviseItem(row)}
                >
                  Revise
                </Button>
              )}
              {endedInfo ? (
                <Tooltip title={`Ended by ${endedInfo.endedBy || 'unknown'} on ${formatDateTime(endedInfo.endedAt)}`}>
                  <Chip size="small" color="error" label="Ended" sx={{ fontWeight: 800 }} />
                </Tooltip>
              ) : (
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
                  disabled={busy}
                  onClick={() => onEndItem(row)}
                >
                  End Listing
                </Button>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap title={row.title}>
              {row.title || '-'}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
              <Chip
                size="small"
                color={row.orderCount90d > 0 ? 'warning' : 'default'}
                label={`${formatNumber(row.orderCount90d)} / 90d`}
                sx={{ fontWeight: 800 }}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${formatNumber(row.lifetimeOrderCount || 0)} lifetime`}
                sx={{ fontWeight: 800 }}
              />
              <OrderSparkline monthly={row.monthlyOrders} />
            </Stack>
            {endedInfo && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main', fontWeight: 700 }}>
                Ended by {endedInfo.endedBy || 'unknown'} &middot; {formatDateTime(endedInfo.endedAt)}
              </Typography>
            )}
            {revisedInfo && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#1d4ed8', fontWeight: 700 }}>
                Revised by {revisedInfo.revisedBy || 'unknown'} &middot; {formatDateTime(revisedInfo.revisedAt)}
                {revisedInfo.previousPrice != null && revisedInfo.newPrice != null
                  ? ` · ${revisedInfo.previousPrice} → ${revisedInfo.newPrice} ${row.currency}`
                  : ''}
              </Typography>
            )}
            {row.orders?.length > 0 && (
              <Box sx={{ mt: 1, pl: 1, borderLeft: '3px solid #fed7aa' }}>
                {row.orders.map((order) => (
                  <Typography key={`${order.orderId}-${order.date}`} variant="caption" display="block" color="text.secondary">
                    {formatDateTime(order.date)} | Order {order.orderId}
                    {order.quantity != null ? ` | Qty ${order.quantity}` : ''}
                    {order.subtotal != null ? ` | ${order.subtotal} ${row.currency}` : ''}
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}

export default function AmazonStockCheckPage() {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isSuperAdmin = user?.role === 'superadmin';

  const [canRun, setCanRun] = useState(isSuperAdmin);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);

  const [mode, setMode] = useState('pilot_option_b');
  const [currencies, setCurrencies] = useState(['USD']);
  const [threshold, setThreshold] = useState(5);
  const [estimate, setEstimate] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runPagination, setRunPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [activeRun, setActiveRun] = useState(null);
  const [items, setItems] = useState([]);
  const [itemCounts, setItemCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 1 });
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const [activeFilters, setActiveFilters] = useState(['actionable']);
  const [multiFilterEnabled, setMultiFilterEnabled] = useState(false);
  const [reviseTarget, setReviseTarget] = useState(null);
  const [reviseForm, setReviseForm] = useState({ title: '', price: '' });
  const [revising, setRevising] = useState(false);

  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState(null);
  const [recentRunsOpen, setRecentRunsOpen] = useState(false);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [verifyIndex, setVerifyIndex] = useState(-1);
  const [endedItems, setEndedItems] = useState({});
  const [endingItemId, setEndingItemId] = useState(null);
  const [revisedItems, setRevisedItems] = useState({});
  // Map<itemId, rowData> — accumulates selections across every SKU visited
  // in this verify session (not just the currently-displayed one), so a big
  // batch of out-of-stock/low-stock SKUs can be end-listed together.
  const [selectedRows, setSelectedRows] = useState(() => new Map());
  const [bulkEnding, setBulkEnding] = useState(false);
  const [bulkEndReviewOpen, setBulkEndReviewOpen] = useState(false);
  const [verifyImages, setVerifyImages] = useState({});
  const imageRequestRef = useRef(null);
  const amazonWinRef = useRef(null);
  const pendingNavRef = useRef(null);
  // Item _ids already auto-selected once, so revisiting via Prev doesn't
  // re-add rows the user deliberately deselected.
  const autoSelectedItemIdsRef = useRef(new Set());

  const isRunning = activeRun && ['queued', 'running'].includes(activeRun.status);
  const isPaused = activeRun?.status === 'paused';

  const selectedCurrencyList = useMemo(() => (
    mode === 'custom' ? currencies : ['USD', 'AUD', 'CAD', 'GBP']
  ), [mode, currencies]);

  const selectedCountryValue = mode === 'custom' ? (currencies[0] || 'USD') : 'ALL';

  const fetchRuns = async () => {
    setLoadingRuns(true);
    try {
      const { data } = await api.get('/amazon-stock-checks/runs', {
        params: {
          page: runPagination.page,
          limit: runPagination.limit
        }
      });
      setRuns(data.runs || []);
      setRunPagination((prev) => ({ ...prev, ...(data.pagination || {}) }));
      if (!activeRun && data.runs?.[0]) setActiveRun(data.runs[0]);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load runs');
    } finally {
      setLoadingRuns(false);
    }
  };

  const fetchRun = async (runId) => {
    if (!runId) return;
    try {
      const sellerId = sellerFilter?._id || undefined;
      const [{ data: runData }, { data: itemsData }] = await Promise.all([
        api.get(`/amazon-stock-checks/runs/${runId}`, { params: { sellerId } }),
        api.get(`/amazon-stock-checks/runs/${runId}/items`, {
          params: {
            filter: activeFilters.join(','),
            page: pagination.page,
            limit: pagination.limit,
            sellerId
          }
        })
      ]);
      setActiveRun(runData.run);
      setItemCounts(runData.itemCounts || {});
      setItems(itemsData.items || []);
      setPagination((prev) => ({ ...prev, ...(itemsData.pagination || {}) }));
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load run details');
    }
  };

  useEffect(() => {
    if (isSuperAdmin) return;
    api.get(`/feature-permissions/${AMAZON_STOCK_CHECK_RUN_FEATURE_ID}/check`)
      .then(({ data }) => setCanRun(Boolean(data?.allowed)))
      .catch(() => setCanRun(false));
  }, []);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load sellers'));
  }, []);

  const openAccessDialog = async () => {
    setAccessDialogOpen(true);
    setLoadingAccess(true);
    try {
      const [{ data: usersData }, { data: permissionData }] = await Promise.all([
        api.get('/users'),
        api.get(`/feature-permissions/${AMAZON_STOCK_CHECK_RUN_FEATURE_ID}`)
      ]);
      setAllUsers(usersData || []);
      setAllowedUsers(permissionData?.allowedUserIds || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load access settings');
    } finally {
      setLoadingAccess(false);
    }
  };

  const saveAccess = async () => {
    setSavingAccess(true);
    try {
      const { data } = await api.put(`/feature-permissions/${AMAZON_STOCK_CHECK_RUN_FEATURE_ID}`, {
        allowedUserIds: allowedUsers.map((u) => u._id)
      });
      setAllowedUsers(data?.allowedUserIds || []);
      setSuccess('Access list updated.');
      setAccessDialogOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save access settings');
    } finally {
      setSavingAccess(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [runPagination.page, runPagination.limit]);

  useEffect(() => {
    if (!activeRun?._id) return undefined;
    fetchRun(activeRun._id);
    if (!['queued', 'running'].includes(activeRun.status)) return undefined;
    const timer = setInterval(() => fetchRun(activeRun._id), 5000);
    return () => clearInterval(timer);
  }, [activeRun?._id, activeRun?.status, activeFilters.join(','), pagination.page, pagination.limit, sellerFilter?._id]);

  const handleEstimate = async () => {
    setError('');
    setSuccess('');
    setLoadingEstimate(true);
    try {
      const params = mode === 'pilot_option_b'
        ? { mode }
        : { mode, currencies: selectedCurrencyList.join(',') };
      const { data } = await api.get('/amazon-stock-checks/estimate', { params });
      setEstimate(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to estimate run');
    } finally {
      setLoadingEstimate(false);
    }
  };

  const handleStart = async () => {
    setError('');
    setSuccess('');
    setStarting(true);
    try {
      const payload = {
        mode,
        currencies: selectedCurrencyList,
        threshold
      };
      const { data } = await api.post('/amazon-stock-checks/runs', payload);
      setActiveRun(data.run);
      setItems([]);
      setItemCounts({});
      setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 1 }));
      setExpandedRows(new Set());
      setActiveFilters(['actionable']);
      await fetchRuns();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to start run');
    } finally {
      setStarting(false);
    }
  };

  const handleManualZero = async (item, sellerItem) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`/amazon-stock-checks/items/${item._id}/set-quantity-zero`, {
        itemId: sellerItem.itemId
      });
      setSuccess(data.message || `Quantity set to zero for item ${sellerItem.itemId}`);
      await fetchRun(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to set quantity to zero');
    }
  };

  const handleManualOne = async (item, sellerItem) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`/amazon-stock-checks/items/${item._id}/set-quantity-one`, {
        itemId: sellerItem.itemId
      });
      setSuccess(data.message || `Quantity set to one for item ${sellerItem.itemId}`);
      await fetchRun(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to set quantity to one');
    }
  };

  const handleRunAction = async (action) => {
    if (!activeRun?._id) return;
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`/amazon-stock-checks/runs/${activeRun._id}/${action}`);
      setSuccess(data.message || `Run ${action} requested.`);
      await fetchRuns();
      await fetchRun(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || `Failed to ${action} run`);
    }
  };

  const handleEndItem = async (sellerItem) => {
    setError('');
    setSuccess('');
    setEndingItemId(sellerItem.itemId);
    try {
      await api.post('/ebay/end-item', {
        sellerId: sellerItem.sellerId,
        itemId: sellerItem.itemId,
        source: 'amazon_stock_check',
        sku: sellerItem.sku || '',
        country: sellerItem.country || '',
        run: activeRun?._id || ''
      });
      setEndedItems((prev) => ({
        ...prev,
        [sellerItem.itemId]: {
          endedAt: new Date().toISOString(),
          endedBy: user?.username || user?.name || user?.email || 'you'
        }
      }));
      setSuccess(`Ended item ${sellerItem.itemId}`);
      if (activeRun?._id) await fetchRun(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to end item');
    } finally {
      setEndingItemId(null);
    }
  };

  // item only needs sku/asin (verifyData or the row from the flat table both
  // qualify); sellerItem is the specific listing being revised.
  const openReviseDialog = (item, sellerItem) => {
    setReviseTarget({ item, sellerItem });
    setReviseForm({
      title: sellerItem.title || '',
      price: sellerItem.price ?? ''
    });
  };

  const handleReviseListing = async () => {
    if (!reviseTarget) return;
    setError('');
    setSuccess('');
    setRevising(true);
    try {
      const { data } = await api.post('/amazon-stock-checks/revise-listing', {
        sellerId: reviseTarget.sellerItem.sellerId,
        itemId: reviseTarget.sellerItem.itemId,
        title: reviseForm.title,
        price: reviseForm.price,
        previousTitle: reviseTarget.sellerItem.title || '',
        previousPrice: reviseTarget.sellerItem.price ?? null,
        sku: reviseTarget.item?.sku || '',
        asin: reviseTarget.item?.asin || ''
      });
      setRevisedItems((prev) => ({
        ...prev,
        [reviseTarget.sellerItem.itemId]: {
          revisedAt: new Date().toISOString(),
          revisedBy: user?.username || user?.name || user?.email || 'you',
          previousTitle: reviseTarget.sellerItem.title || '',
          newTitle: reviseForm.title,
          previousPrice: reviseTarget.sellerItem.price ?? null,
          newPrice: reviseForm.price !== '' ? Number(reviseForm.price) : null
        }
      }));
      setReviseTarget(null);
      setSuccess(data.message || `Revised item ${reviseTarget.sellerItem.itemId}`);
      if (activeRun?._id) await fetchRun(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to revise listing');
    } finally {
      setRevising(false);
    }
  };

  const displayItems = items;

  const applyFilter = (filter) => {
    setActiveFilters((prev) => {
      if (filter === 'all') return ['all'];
      if (!multiFilterEnabled) return [filter];
      const current = prev.includes('all') ? [] : prev;
      const next = current.includes(filter)
        ? current.filter((value) => value !== filter)
        : [...current, filter];
      return next.length ? next : ['all'];
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
    setExpandedRows(new Set());
    if (verifyOpen) closeVerify();
  };

  const handleSellerFilterChange = (value) => {
    setSellerFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setExpandedRows(new Set());
    if (verifyOpen) closeVerify();
  };

  const isFilterActive = (filter) => activeFilters.includes(filter);

  const handleMultiFilterToggle = (event) => {
    const enabled = event.target.checked;
    setMultiFilterEnabled(enabled);
    if (!enabled) {
      setActiveFilters((prev) => [prev.find((filter) => filter !== 'all') || 'actionable']);
    }
    setPagination((prev) => ({ ...prev, page: 1 }));
    setExpandedRows(new Set());
  };

  const toggleExpanded = (itemId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // When a seller filter is active, every count/list/action in the table and
  // verify drawer scopes down to just that seller's own listing(s) for the
  // SKU — other sellers who also carry it are hidden entirely, not just the
  // top-level row inclusion.
  const getVisibleSellerItems = (sellerItems = []) => (
    sellerFilter ? sellerItems.filter((row) => String(row.sellerId) === String(sellerFilter._id)) : sellerItems
  );

  const getQtyZeroSummary = (sellerItems = []) => {
    const successCount = sellerItems.filter((row) => row.quantityZeroStatus === 'success').length;
    const failedCount = sellerItems.filter((row) => row.quantityZeroStatus === 'failed').length;
    const pendingCount = sellerItems.filter((row) => row.quantityZeroStatus === 'pending').length;
    return { successCount, failedCount, pendingCount };
  };

  // Open (or navigate) the shared Amazon review window, positioned on the
  // left half of the screen so the verify panel can sit on the right.
  const openAmazonWindow = (url) => {
    if (!url) return;
    const existing = amazonWinRef.current;
    if (existing && !existing.closed) {
      try {
        existing.location.href = url;
        return;
      } catch {
        // Window reference went stale — fall through and recreate it.
      }
    }
    const browserRightEdge = (window.screenX || 0) + (window.outerWidth || 0);
    const screenWidth = window.screen.availWidth || 1600;
    const spaceLeftOfPanel = Math.min(browserRightEdge || screenWidth, screenWidth) - VERIFY_DRAWER_WIDTH - 32;
    const width = Math.min(1200, Math.max(860, spaceLeftOfPanel));
    const height = (window.screen.availHeight || 900) - 40;
    const win = window.open(url, 'amazonVerifyWindow', `left=0,top=0,width=${width},height=${height}`);
    if (win) {
      amazonWinRef.current = win;
    }
  };

  // The seller listings that are safe to bulk-end for this item's status:
  // everything for out-of-stock and errors; for low-stock, only when NO
  // seller carrying this SKU has sold in the last 90 days — if even one
  // has, the whole SKU is left for manual review, not just the specific
  // rows with orders.
  const getAutoSelectRows = (data) => {
    if (!data) return [];
    // Based on the visible (possibly seller-scoped) rows, not every seller
    // carrying the SKU — so filtering to one seller reflects their own
    // order history, not a different seller's.
    const rows = getVisibleSellerItems(data.sellerItems || []);
    if (data.status === 'out_of_stock' || data.status === 'error') {
      return rows.filter((row) => !row.endedInfo);
    }
    if (data.status === 'low_stock') {
      const hasRecentOrder = rows.some((row) => (row.orderCount90d || 0) > 0);
      if (!hasRecentOrder) return rows.filter((row) => !row.endedInfo);
    }
    return [];
  };

  const handleVerify = async (item, index) => {
    setError('');
    setVerifyOpen(true);
    setVerifyLoading(true);
    setVerifyData(null);
    setVerifyIndex(index);
    setEndedItems({});
    setRevisedItems({});
    setVerifyImages({});
    openAmazonWindow(getAmazonUrl(item));
    try {
      const { data } = await api.get(`/amazon-stock-checks/items/${item._id}/verify`);
      setVerifyData(data);
      // Only auto-select the first time this SKU is seen this session, so
      // navigating back to it later doesn't undo a manual deselection.
      if (!autoSelectedItemIdsRef.current.has(item._id)) {
        autoSelectedItemIdsRef.current.add(item._id);
        const autoRows = getAutoSelectRows(data);
        if (autoRows.length) {
          setSelectedRows((prev) => {
            const next = new Map(prev);
            for (const row of autoRows) {
              if (!next.has(row.itemId)) next.set(row.itemId, { ...row, sku: data.sku, country: data.country });
            }
            return next;
          });
        }
      }
      if (data.amazonUrl && data.amazonUrl !== getAmazonUrl(item)) openAmazonWindow(data.amazonUrl);
      const imageItemIds = [...new Set(getVisibleSellerItems(data.sellerItems || []).map((row) => row.itemId).filter(Boolean))];
      if (imageItemIds.length && sellerFilter?._id) {
        imageRequestRef.current = item._id;
        api.post('/amazon-stock-checks/live-images', { sellerId: sellerFilter._id, itemIds: imageItemIds })
          .then(({ data: imageData }) => {
            if (imageRequestRef.current === item._id) setVerifyImages(imageData.images || {});
          })
          .catch(() => {});
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load verification data');
      setVerifyOpen(false);
    } finally {
      setVerifyLoading(false);
    }
  };

  const closeVerify = () => {
    setVerifyOpen(false);
    setVerifyIndex(-1);
    setSelectedRows(new Map());
    autoSelectedItemIdsRef.current = new Set();
    if (amazonWinRef.current && !amazonWinRef.current.closed) amazonWinRef.current.close();
    amazonWinRef.current = null;
  };

  // Move to the previous/next verifiable row (rows with an ASIN) in the
  // current filtered list, crossing table pages when needed.
  const handleVerifyNav = (step) => {
    for (let i = verifyIndex + step; i >= 0 && i < items.length; i += step) {
      if (items[i]?.asin) {
        handleVerify(items[i], i);
        return;
      }
    }
    if (step > 0 && pagination.page < pagination.totalPages) {
      pendingNavRef.current = 'first';
      setPagination((prev) => ({ ...prev, page: prev.page + 1 }));
    } else if (step < 0 && pagination.page > 1) {
      pendingNavRef.current = 'last';
      setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
    }
  };

  useEffect(() => {
    if (!pendingNavRef.current || !items.length) return;
    const direction = pendingNavRef.current;
    pendingNavRef.current = null;
    const indexes = items.map((_, i) => i);
    if (direction === 'last') indexes.reverse();
    const targetIndex = indexes.find((i) => items[i]?.asin);
    if (targetIndex != null) handleVerify(items[targetIndex], targetIndex);
  }, [items]);

  const hasPrevVerifiable = verifyIndex > -1 && (
    items.slice(0, Math.max(0, verifyIndex)).some((row) => row.asin) || pagination.page > 1
  );
  const hasNextVerifiable = verifyIndex > -1 && (
    items.slice(verifyIndex + 1).some((row) => row.asin) || pagination.page < pagination.totalPages
  );

  // Left/right arrow keys step through rows while the verify panel is open.
  useEffect(() => {
    if (!verifyOpen) return undefined;
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'Escape') {
        closeVerify();
        return;
      }
      if (verifyLoading) return;
      if (event.key === 'ArrowRight' && hasNextVerifiable) handleVerifyNav(1);
      if (event.key === 'ArrowLeft' && hasPrevVerifiable) handleVerifyNav(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [verifyOpen, verifyLoading, verifyIndex, items, pagination.page, pagination.totalPages]);

  const verifyRowNumber = verifyIndex > -1 ? ((pagination.page - 1) * pagination.limit) + verifyIndex + 1 : 0;
  const verifyProgress = pagination.total > 0 ? Math.min(100, (verifyRowNumber / pagination.total) * 100) : 0;

  // Toggling always applies to the currently-open SKU's row, so it carries
  // that SKU's sku/country along for the eventual end-item call.
  const toggleSelect = (row) => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (next.has(row.itemId)) {
        next.delete(row.itemId);
      } else {
        next.set(row.itemId, { ...row, sku: verifyData?.sku || row.sku, country: verifyData?.country || '' });
      }
      return next;
    });
  };

  // Adds (doesn't replace) this SKU's no-recent-order rows to the running
  // selection — a manual top-up for rows the auto-select rule skipped.
  const selectNoOrderItems = () => {
    const rows = getVisibleSellerItems(verifyData?.sellerItems || [])
      .filter((row) => row.orderCount90d === 0 && !(endedItems[row.itemId] || row.endedInfo));
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const row of rows) next.set(row.itemId, { ...row, sku: verifyData?.sku || '', country: verifyData?.country || '' });
      return next;
    });
  };

  // Removes only the current SKU's rows from the running selection.
  const clearCurrentSkuSelection = () => {
    const currentIds = new Set(getVisibleSellerItems(verifyData?.sellerItems || []).map((row) => row.itemId));
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const id of currentIds) next.delete(id);
      return next;
    });
  };

  const clearAllSelection = () => setSelectedRows(new Map());

  const selectedSkuCount = useMemo(
    () => new Set(Array.from(selectedRows.values()).map((row) => row.sku)).size,
    [selectedRows]
  );

  const performBulkEnd = async () => {
    const rows = Array.from(selectedRows.values()).filter((row) => !(endedItems[row.itemId] || row.endedInfo));
    if (!rows.length) return;
    setError('');
    setSuccess('');
    setBulkEndReviewOpen(false);
    setBulkEnding(true);
    let okCount = 0;
    const failures = [];
    for (const row of rows) {
      setEndingItemId(row.itemId);
      try {
        await api.post('/ebay/end-item', {
          sellerId: row.sellerId,
          itemId: row.itemId,
          source: 'amazon_stock_check',
          sku: row.sku || '',
          country: row.country || '',
          run: activeRun?._id || ''
        });
        okCount += 1;
        setEndedItems((prev) => ({
          ...prev,
          [row.itemId]: {
            endedAt: new Date().toISOString(),
            endedBy: user?.username || user?.name || user?.email || 'you'
          }
        }));
      } catch (err) {
        failures.push(row.itemId);
      }
    }
    setEndingItemId(null);
    setBulkEnding(false);
    setSelectedRows(new Map());
    if (failures.length) {
      setError(`Ended ${okCount} listing(s); failed for: ${failures.join(', ')}`);
    } else {
      setSuccess(`Ended ${okCount} listing(s).`);
    }
    if (activeRun?._id) await fetchRun(activeRun._id);
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Amazon Stock Check"
        subtitle="Run SKU-to-ASIN stock checks on demand and zero eBay quantity when Amazon stock is low or unavailable."
      />

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{
          top: '50% !important',
          transform: 'translateY(-50%)'
        }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSuccess('')} sx={{ minWidth: 320 }}>
          {success}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={3000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{
          top: '50% !important',
          transform: 'translateY(-50%)'
        }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError('')} sx={{ minWidth: 320 }}>
          {error}
        </Alert>
      </Snackbar>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          mb: 2,
          borderColor: sellerFilter ? BRAND_DARK : '#e5e7eb',
          borderWidth: sellerFilter ? 2 : 1,
          background: sellerFilter ? '#f8fafc' : '#fff'
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Filter by seller</Typography>
            <Typography variant="caption" color="text.secondary">
              Narrow the cards and table below to one seller, across any custom country/currency check.
            </Typography>
          </Box>
          <Autocomplete
            options={sellers}
            value={sellerFilter}
            onChange={(_, value) => handleSellerFilterChange(value)}
            getOptionLabel={(option) => option?.user?.username || option?.user?.email || option?._id || ''}
            isOptionEqualToValue={(option, value) => option._id === value._id}
            sx={{ flex: 1, minWidth: 280 }}
            renderInput={(params) => <TextField {...params} label="Seller" placeholder="All sellers" />}
          />
          {sellerFilter && (
            <Chip
              label={`Viewing: ${sellerFilter.user?.username || sellerFilter.user?.email || sellerFilter._id}`}
              color="primary"
              sx={{ fontWeight: 900, fontSize: 14, py: 2.25, backgroundColor: BRAND_DARK }}
            />
          )}
          {sellerFilter && (
            <Button variant="outlined" onClick={() => handleSellerFilterChange(null)}>
              Clear
            </Button>
          )}
        </Stack>
      </Paper>

      {canRun ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Run Mode</Typography>
              <Select fullWidth size="small" value={mode} onChange={(event) => setMode(event.target.value)}>
                <MenuItem value="pilot_option_b">Pilot Option B - 195 credits</MenuItem>
                <MenuItem value="custom">Custom country run</MenuItem>
                <MenuItem value="full">Full selected countries</MenuItem>
              </Select>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Countries</Typography>
              <Select
                fullWidth
                size="small"
                value={selectedCountryValue}
                disabled={mode !== 'custom'}
                onChange={(event) => setCurrencies([event.target.value])}
              >
                {mode !== 'custom' && (
                  <MenuItem value="ALL">All supported countries (USD, AUD, CAD, GBP)</MenuItem>
                )}
                {CURRENCY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label} ({option.value}, {option.credits} credit{option.credits > 1 ? 's' : ''})
                  </MenuItem>
                ))}
              </Select>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Low Stock Threshold</Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Stack direction="row" spacing={1} sx={{ mt: { md: 2 } }} alignItems="center">
                <Button
                  variant="outlined"
                  startIcon={loadingEstimate ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={handleEstimate}
                  disabled={loadingEstimate || starting || isRunning}
                >
                  Estimate
                </Button>
                <Button
                  variant="contained"
                  startIcon={starting ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                  onClick={handleStart}
                  disabled={starting || isRunning || isPaused}
                  sx={{ backgroundColor: BRAND_DARK }}
                >
                  Start
                </Button>
                {isRunning && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<PauseIcon />}
                    onClick={() => handleRunAction('pause')}
                  >
                    Pause
                  </Button>
                )}
                {isPaused && (
                  <Button
                    variant="outlined"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => handleRunAction('resume')}
                  >
                    Resume
                  </Button>
                )}
                {activeRun && ['queued', 'running', 'paused'].includes(activeRun.status) && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<StopCircleIcon />}
                    onClick={() => handleRunAction('cancel')}
                  >
                    Cancel
                  </Button>
                )}
                {isSuperAdmin && (
                  <Tooltip title="Manage who can Estimate/Start runs">
                    <IconButton size="small" onClick={openAccessDialog}>
                      <LockPersonIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Grid>
          </Grid>

          {estimate && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Estimate: {formatNumber(estimate.totalSkus)} non-empty SKUs selected from the SKU index, {formatNumber(estimate.asinFoundCount)} base SKUs mapped to ASINs and ready to check,
              {' '}{formatNumber(estimate.noAsinCount)} with no ASIN found for base SKU, estimated {formatNumber(estimate.creditsEstimated)} credits.
            </Alert>
          )}
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            You have view-only access to this page — you can browse, verify, and end listings, but starting or configuring new stock check runs requires permission from a superadmin.
          </Typography>
        </Paper>
      )}

      {activeRun && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={6} md={2}><KpiCard label="Status" value={activeRun.status} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Total SKUs" value={itemCounts.all ?? activeRun.totalSkus} active={isFilterActive('all')} onClick={() => applyFilter('all')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Checked" value={itemCounts.checked || 0} active={isFilterActive('checked')} onClick={() => applyFilter('checked')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="In Stock" value={itemCounts.in_stock || 0} tone="good" active={isFilterActive('in_stock')} onClick={() => applyFilter('in_stock')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="In Stock (Unconfirmed)" value={itemCounts.in_stock_unconfirmed || 0} tone="info" active={isFilterActive('in_stock_unconfirmed')} onClick={() => applyFilter('in_stock_unconfirmed')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Low Stock (No Orders 90d)" value={itemCounts.low_stock_no_orders || 0} tone="bad" active={isFilterActive('low_stock_no_orders')} onClick={() => applyFilter('low_stock_no_orders')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Low Stock (Orders 90d)" value={itemCounts.low_stock_with_orders || 0} tone="warn" active={isFilterActive('low_stock_with_orders')} onClick={() => applyFilter('low_stock_with_orders')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Out of Stock" value={itemCounts.out_of_stock || 0} tone="bad" active={isFilterActive('out_of_stock')} onClick={() => applyFilter('out_of_stock')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Unknown Stock Text" value={itemCounts.unknown_stock_text || 0} tone="warn" active={isFilterActive('unknown_stock_text')} onClick={() => applyFilter('unknown_stock_text')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="No ASIN" value={itemCounts.no_asin || 0} active={isFilterActive('no_asin')} onClick={() => applyFilter('no_asin')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Errors" value={itemCounts.errors || 0} tone="bad" active={isFilterActive('errors')} onClick={() => applyFilter('errors')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Has Orders" value={itemCounts.has_orders || 0} active={isFilterActive('has_orders')} onClick={() => applyFilter('has_orders')} /></Grid>
          <Grid item xs={6} md={2}>
            <Tooltip title="Credits are spent once per unique SKU across all sellers, so this total isn't divisible by seller.">
              <span><KpiCard label="Credits Used (run total)" value={activeRun.creditsUsed} /></span>
            </Tooltip>
          </Grid>
        </Grid>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ cursor: 'pointer' }}
          onClick={() => setRecentRunsOpen((prev) => !prev)}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Recent Runs</Typography>
            {activeRun && (
              <Chip
                size="small"
                label={`Active: ${getRunScope(activeRun)} · ${formatDateTime(activeRun.createdAt)}`}
                sx={{ fontWeight: 700 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {loadingRuns && <CircularProgress size={16} />}
            <IconButton size="small">
              <ExpandMoreIcon sx={{ transform: recentRunsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </IconButton>
          </Stack>
        </Stack>
        <Collapse in={recentRunsOpen} timeout="auto" unmountOnExit>
          <Stack direction="row" spacing={1.5} sx={{ overflowX: 'auto', pt: 1.5, pb: 0.5 }}>
            {runs.map((run) => (
              <Button
                key={run._id}
                variant="outlined"
                onClick={() => {
                  setActiveRun(run);
                  setActiveFilters(['actionable']);
                  setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 1 }));
                  setExpandedRows(new Set());
                }}
                sx={{
                  alignItems: 'flex-start',
                  flex: '0 0 340px',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  p: 1.75,
                  backgroundColor: activeRun?._id === run._id ? '#e9ec35' : '#fff',
                  borderColor: activeRun?._id === run._id ? '#2563eb' : undefined,
                  borderWidth: activeRun?._id === run._id ? 2 : 1,
                  '&:hover': {
                    backgroundColor: activeRun?._id === run._id ? '#e0edff' : undefined
                  }
                }}
              >
                <Stack spacing={0.75} sx={{ width: '100%' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Chip size="small" variant="outlined" label={run.mode} sx={{ fontWeight: 800 }} />
                    <Chip
                      size="small"
                      label={(run.currencies || []).join(', ') || '-'}
                      sx={{ fontWeight: 900, fontFamily: 'monospace', bgcolor: '#eef2ff', color: '#3730a3' }}
                    />
                  </Stack>
                  <Typography variant="body1" sx={{ fontWeight: 900, color: BRAND_DARK }}>{formatDateTime(run.createdAt)}</Typography>
                  <Typography variant="caption" color="text.secondary">By {getRunUser(run)}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={run.status}
                      color={run.status === 'completed' ? 'success' : run.status === 'cancelled' || run.status === 'failed' ? 'error' : 'default'}
                      sx={{ fontWeight: 800 }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 900 }}>
                      {formatNumber(run.checkedCount)}/{formatNumber(run.totalSkus)}
                    </Typography>
                  </Stack>
                </Stack>
              </Button>
            ))}
            {!runs.length && <Typography variant="body2" color="text.secondary">No runs yet.</Typography>}
          </Stack>
          <TablePagination
            component="div"
            count={runPagination.total || 0}
            page={Math.max(0, (runPagination.page || 1) - 1)}
            onPageChange={(_event, nextPage) => {
              setRunPagination((prev) => ({ ...prev, page: nextPage + 1 }));
            }}
            rowsPerPage={runPagination.limit || 20}
            onRowsPerPageChange={(event) => {
              setRunPagination((prev) => ({
                ...prev,
                page: 1,
                limit: Number.parseInt(event.target.value, 10)
              }));
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Collapse>
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>Active filters</Typography>
        <FormControlLabel
          control={<Switch size="small" checked={multiFilterEnabled} onChange={handleMultiFilterToggle} />}
          label="Multi-filter AND"
          sx={{ '& .MuiFormControlLabel-label': { fontSize: 12, fontWeight: 800 } }}
        />
        {activeFilters.map((filter) => (
          <Chip
            key={filter}
            size="small"
            label={FILTER_LABELS[filter] || filter}
            onDelete={filter === 'all' ? undefined : () => applyFilter(filter)}
            sx={{ fontWeight: 800 }}
          />
        ))}
      </Stack>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table
              size="small"
              sx={{
                borderCollapse: 'separate',
                borderSpacing: '0 4px',
                backgroundColor: '#f8fafc'
              }}
            >
              <TableHead sx={{ background: BRAND_DARK }}>
                <TableRow>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>SKU</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>ASIN</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Country</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Amazon Status</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Stock</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Qty Zero</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Seller Items</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Orders</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }} align="right">Verify</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayItems.map((item, index) => {
                  const visibleSellerItems = getVisibleSellerItems(item.sellerItems || []);
                  const orderCount = getOrderCount(visibleSellerItems);
                  const expanded = expandedRows.has(item._id);
                  const qtySummary = getQtyZeroSummary(visibleSellerItems);
                  const expandedPalette = index % 2 === 0
                    ? { row: '#f8fbff', detail: '#eff6ff', rail: '#2563eb', line: '#bfdbfe' }
                    : { row: '#fffaf0', detail: '#fff7ed', rail: '#f97316', line: '#fed7aa' };
                  const groupBg = expanded ? expandedPalette.row : '#fff';
                  const groupBorder = expanded ? '3px solid #2563eb' : '3px solid transparent';
                  return (
                    <Fragment key={item._id}>
                      <TableRow
                        key={item._id}
                        hover
                        onClick={() => toggleExpanded(item._id)}
                        sx={{
                          cursor: 'pointer',
                          backgroundColor: groupBg,
                          boxShadow: expanded ? '0 1px 0 rgba(15, 23, 42, 0.06)' : 'none',
                          '& > td': {
                            borderTop: expanded ? `1px solid ${expandedPalette.line}` : '1px solid #e5e7eb',
                            borderBottom: expanded ? `1px solid ${expandedPalette.line}` : '1px solid #eef2f7'
                          },
                          '& > td:first-of-type': {
                            borderLeft: expanded ? `4px solid ${expandedPalette.rail}` : groupBorder,
                            borderTopLeftRadius: 6,
                            borderBottomLeftRadius: expanded ? 0 : 6
                          },
                          '& > td:last-of-type': {
                            borderTopRightRadius: 6,
                            borderBottomRightRadius: expanded ? 0 : 6
                          }
                        }}
                      >
                        <TableCell sx={{ fontWeight: 900 }}>{item.sku}</TableCell>
                        <TableCell>{item.asin || '-'}</TableCell>
                        <TableCell>{item.country}</TableCell>
                        <TableCell>
                          <Chip size="small" color={statusColor(item.status)} label={STATUS_LABELS[item.status] || item.status} />
                          {item.becameAvailable && <Chip size="small" color="success" label="Became available" sx={{ ml: 1 }} />}
                          {item.status === 'error' && (
                            <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                              <Typography variant="caption" sx={{ fontWeight: 900, color: 'error.main' }}>
                                {item.errorType || 'stock_check_failed'}{item.errorSource ? ` | ${item.errorSource}` : ''}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" title={item.error || ''}>
                                {item.error || 'No error detail saved'}
                              </Typography>
                              {item.retryable && <Chip size="small" label="retryable" sx={{ alignSelf: 'flex-start' }} />}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell>{item.stockQuantity ?? (item.availabilityText || '-')}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {qtySummary.successCount > 0 && <Chip size="small" color="success" label={`${qtySummary.successCount} success`} />}
                            {qtySummary.failedCount > 0 && <Chip size="small" color="error" label={`${qtySummary.failedCount} failed`} />}
                            {qtySummary.pendingCount > 0 && <Chip size="small" label={`${qtySummary.pendingCount} pending`} />}
                            {!qtySummary.successCount && !qtySummary.failedCount && !qtySummary.pendingCount && <Typography variant="body2" color="text.secondary">-</Typography>}
                          </Stack>
                        </TableCell>
                        <TableCell>{formatNumber(visibleSellerItems.length)}</TableCell>
                        <TableCell>{formatNumber(orderCount)}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<FactCheckIcon />}
                            disabled={!item.asin}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleVerify(item, index);
                            }}
                          >
                            Verify
                          </Button>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          sx={{
                            p: 0,
                            border: 0,
                            borderLeft: expanded ? `4px solid ${expandedPalette.rail}` : '4px solid transparent',
                            backgroundColor: expanded ? expandedPalette.detail : 'transparent',
                            borderBottom: expanded ? `1px solid ${expandedPalette.line}` : 0,
                            borderBottomLeftRadius: 6,
                            borderBottomRightRadius: 6
                          }}
                        >
                          <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <Box
                              sx={{
                                p: 2,
                                background: expandedPalette.detail,
                                borderBottomLeftRadius: 1,
                                borderBottomRightRadius: 1
                              }}
                            >
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>Seller item breakdown</Typography>
                                <Chip size="small" label={item.sku} sx={{ fontWeight: 900 }} />
                                <Chip size="small" label={`${visibleSellerItems.length} item IDs`} />
                                {sellerFilter && (
                                  <Chip size="small" variant="outlined" color="primary" label="This seller only" />
                                )}
                              </Stack>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Seller</TableCell>
                                    <TableCell>Item ID</TableCell>
                                    <TableCell>Title</TableCell>
                                    <TableCell>Price</TableCell>
                                    <TableCell>Orders</TableCell>
                                    <TableCell>Qty Zero</TableCell>
                                    <TableCell align="right">Action</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {visibleSellerItems.map((sellerItem) => (
                                    <TableRow key={`${sellerItem.sellerId}-${sellerItem.itemId}`}>
                                      <TableCell>{sellerItem.sellerName}</TableCell>
                                      <TableCell>
                                        <Button
                                          size="small"
                                          variant="text"
                                          endIcon={<OpenInNewIcon fontSize="inherit" />}
                                          href={`https://www.ebay.com/itm/${sellerItem.itemId}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          {sellerItem.itemId}
                                        </Button>
                                      </TableCell>
                                      <TableCell sx={{ maxWidth: 360 }}>
                                        <Typography variant="body2" noWrap title={sellerItem.title}>{sellerItem.title || '-'}</Typography>
                                      </TableCell>
                                      <TableCell>{sellerItem.price ?? '-'}</TableCell>
                                      <TableCell>{formatNumber(sellerItem.orderCount)}</TableCell>
                                      <TableCell>
                                        <Chip
                                          size="small"
                                          label={sellerItem.quantityZeroStatus || 'not_needed'}
                                          color={sellerItem.quantityZeroStatus === 'success' ? 'success' : sellerItem.quantityZeroStatus === 'failed' ? 'error' : 'default'}
                                        />
                                      </TableCell>
                                      <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<InventoryIcon />}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleManualZero(item, sellerItem);
                                            }}
                                          >
                                            Qty 0
                                          </Button>
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            color="success"
                                            startIcon={<InventoryIcon />}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleManualOne(item, sellerItem);
                                            }}
                                          >
                                            Qty 1
                                          </Button>
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<EditIcon />}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              openReviseDialog(item, sellerItem);
                                            }}
                                          >
                                            Revise
                                          </Button>
                                          <Button
                                            size="small"
                                            color="error"
                                            variant="outlined"
                                            startIcon={<StopCircleIcon />}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleEndItem({ ...sellerItem, sku: item.sku, country: item.country });
                                            }}
                                          >
                                            End
                                          </Button>
                                        </Stack>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {!displayItems.length && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      {activeRun ? 'No rows match the selected card/filter yet.' : 'Start a run to see results.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={pagination.total || 0}
              page={Math.max(0, (pagination.page || 1) - 1)}
              onPageChange={(_event, nextPage) => {
                setPagination((prev) => ({ ...prev, page: nextPage + 1 }));
                setExpandedRows(new Set());
              }}
              rowsPerPage={pagination.limit || 100}
              onRowsPerPageChange={(event) => {
                setPagination((prev) => ({
                  ...prev,
                  page: 1,
                  limit: Number.parseInt(event.target.value, 10)
                }));
                setExpandedRows(new Set());
              }}
              rowsPerPageOptions={[25, 50, 100, 250, 500]}
            />
          </TableContainer>

      <Dialog open={!!reviseTarget} onClose={() => setReviseTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revise Listing</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={reviseForm.title}
              onChange={(event) => setReviseForm((prev) => ({ ...prev, title: event.target.value }))}
              inputProps={{ maxLength: 80 }}
              helperText={`${reviseForm.title.length}/80 characters`}
              fullWidth
            />
            <TextField
              label="Price"
              type="number"
              value={reviseForm.price}
              onChange={(event) => setReviseForm((prev) => ({ ...prev, price: event.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviseTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleReviseListing}
            disabled={revising}
            startIcon={revising ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ backgroundColor: BRAND_DARK }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={accessDialogOpen} onClose={() => setAccessDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Estimate/Start Access</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Superadmins always have access. Select which other users can also run Estimate/Start on this page.
            </Typography>
            {loadingAccess ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">Loading...</Typography>
              </Stack>
            ) : (
              <Autocomplete
                multiple
                options={allUsers}
                value={allowedUsers}
                onChange={(_, value) => setAllowedUsers(value)}
                getOptionLabel={(option) => option?.username ? `${option.username} (${option.role})` : ''}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                renderInput={(params) => <TextField {...params} label="Allowed users" placeholder="Select users" />}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccessDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveAccess}
            disabled={savingAccess || loadingAccess}
            startIcon={savingAccess ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ backgroundColor: BRAND_DARK }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        variant="persistent"
        open={verifyOpen}
        // The admin AppBar uses zIndex.drawer + 1, so go one higher or it
        // covers this panel's header (SKU, prev/next, close button).
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: VERIFY_DRAWER_WIDTH },
            boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.18)'
          }
        }}
      >
        <Box sx={{ borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ px: 1, pt: 1.25 }}>
            <Tooltip title="Previous (Left arrow key)">
              <span>
                <IconButton
                  size="small"
                  disabled={verifyLoading || !hasPrevVerifiable}
                  onClick={() => handleVerifyNav(-1)}
                  sx={{ border: '1px solid #e5e7eb' }}
                >
                  <NavigateBeforeIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Box sx={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <Typography sx={{ fontWeight: 900, fontFamily: "'JetBrains Mono', 'Fira Mono', monospace" }} noWrap>
                {verifyData?.sku || items[verifyIndex]?.sku || ''}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {verifyIndex > -1 ? `${formatNumber(verifyRowNumber)} of ${formatNumber(pagination.total)}` : '-'}
                {' '}&middot; {activeFilters.map((filter) => FILTER_LABELS[filter] || filter).join(', ')}
              </Typography>
            </Box>
            <Tooltip title="Next (Right arrow key)">
              <span>
                <IconButton
                  size="small"
                  disabled={verifyLoading || !hasNextVerifiable}
                  onClick={() => handleVerifyNav(1)}
                  sx={{
                    bgcolor: BRAND_DARK,
                    color: '#fff',
                    '&:hover': { bgcolor: '#000' },
                    '&.Mui-disabled': { bgcolor: '#f1f5f9', color: '#cbd5e1' }
                  }}
                >
                  <NavigateNextIcon />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" onClick={closeVerify}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ px: 1.5, py: 1 }}>
            {verifyData && !verifyLoading && (
              <>
                <Chip size="small" label={verifyData.asin || '-'} sx={{ fontWeight: 800, fontFamily: 'monospace' }} />
                <Chip
                  size="small"
                  color={statusColor(verifyData.status)}
                  label={STATUS_LABELS[verifyData.status] || verifyData.status}
                  sx={{ fontWeight: 800 }}
                />
                {verifyData.availabilityText && (
                  <Chip size="small" variant="outlined" label={verifyData.availabilityText} />
                )}
              </>
            )}
            <Box sx={{ flex: 1 }} />
            {verifyData?.amazonUrl && (
              <Button
                size="small"
                variant="outlined"
                endIcon={<OpenInNewIcon />}
                onClick={() => openAmazonWindow(verifyData.amazonUrl)}
              >
                Amazon
              </Button>
            )}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pb: 0.75 }}>
            <LinearProgress
              variant="determinate"
              value={verifyProgress}
              sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: '#f1f5f9', '& .MuiLinearProgress-bar': { bgcolor: BRAND_DARK } }}
            />
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {formatNumber(verifyRowNumber)}/{formatNumber(pagination.total)} ({Math.round(verifyProgress)}%)
            </Typography>
          </Stack>
          {/* Selection accumulates across every SKU visited this session, not
              just the one currently on screen — stays visible while loading. */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
              {selectedRows.size
                ? `${formatNumber(selectedRows.size)} listing(s) selected across ${formatNumber(selectedSkuCount)} SKU(s)`
                : 'Nothing selected yet'}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" disabled={!selectedRows.size || bulkEnding} onClick={clearAllSelection}>
              Clear All
            </Button>
            <Button
              size="small"
              color="error"
              variant="contained"
              disabled={!selectedRows.size || bulkEnding}
              startIcon={bulkEnding ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
              onClick={() => setBulkEndReviewOpen(true)}
            >
              End Selected ({selectedRows.size})
            </Button>
          </Stack>
        </Box>
        <Box sx={{ p: 2, overflowY: 'auto' }}>
          {verifyLoading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Loading item IDs and orders...</Typography>
            </Stack>
          )}
          {verifyData && !verifyLoading && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" disabled={bulkEnding} onClick={selectNoOrderItems}>
                  Select 0-order (90d) — this SKU
                </Button>
                <Button size="small" disabled={bulkEnding} onClick={clearCurrentSkuSelection}>
                  Clear this SKU
                </Button>
              </Stack>
              <SellerItemsSection
                rows={getVisibleSellerItems(verifyData.sellerItems || [])}
                currentSku={verifyData.sku}
                images={verifyImages}
                endedItems={endedItems}
                endingItemId={endingItemId}
                onEndItem={handleEndItem}
                revisedItems={revisedItems}
                onReviseItem={(row) => openReviseDialog({ sku: verifyData.sku, asin: verifyData.asin }, row)}
                selectedIds={selectedRows}
                onToggleSelect={toggleSelect}
              />
            </Stack>
          )}
        </Box>
      </Drawer>

      <Dialog open={bulkEndReviewOpen} onClose={() => setBulkEndReviewOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>End {formatNumber(selectedRows.size)} listing(s)?</DialogTitle>
        <DialogContent dividers sx={{ maxHeight: 420 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            This ends these eBay listings immediately and cannot be undone. Review the list below before confirming.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Seller</TableCell>
                <TableCell>Item ID</TableCell>
                <TableCell align="right">Price</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from(selectedRows.values()).slice(0, BULK_END_REVIEW_ROW_CAP).map((row) => (
                <TableRow key={row.itemId}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{row.sku}</TableCell>
                  <TableCell>{row.sellerName}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{row.itemId}</TableCell>
                  <TableCell align="right">{row.price != null ? `${row.price} ${row.currency}` : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {selectedRows.size > BULK_END_REVIEW_ROW_CAP && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              + {formatNumber(selectedRows.size - BULK_END_REVIEW_ROW_CAP)} more not shown (all {formatNumber(selectedRows.size)} will still be ended)
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkEndReviewOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={performBulkEnd}
            disabled={bulkEnding}
            startIcon={bulkEnding ? <CircularProgress size={16} color="inherit" /> : <CancelIcon />}
          >
            End {formatNumber(selectedRows.size)} listing(s)
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
