import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
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
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
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
import StopCircleIcon from '@mui/icons-material/StopCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CloseIcon from '@mui/icons-material/Close';
import CancelIcon from '@mui/icons-material/Cancel';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import ImageIcon from '@mui/icons-material/Image';
import EditIcon from '@mui/icons-material/Edit';
import api from '../../lib/api';
import PageHeader from '../../components/PageHeader';
import { BRAND_DARK } from '../../constants/brandTheme';

const AMAZON_STOCK_CHECK_RUN_FEATURE_ID = 'amazonStockCheck.run';

// Amazon marketplace domain per currency, used to open the product page in
// the side-by-side review window synchronously on click (popup-blocker safe).
const AMAZON_DOMAINS = { USD: 'com', AUD: 'com.au', CAD: 'ca', GBP: 'co.uk' };

const VERIFY_DRAWER_WIDTH = 700;

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
  out_of_stock: 'Out of Stock',
  unknown_stock_text: 'Unknown Stock Text',
  no_asin: 'No ASIN',
  errors: 'Errors',
  has_orders: 'Has Orders'
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function statusColor(status) {
  if (status === 'in_stock') return 'success';
  if (status === 'in_stock_unconfirmed') return 'info';
  if (status === 'low_stock' || status === 'unknown_stock_text') return 'warning';
  if (status === 'out_of_stock' || status === 'error') return 'error';
  return 'default';
}

function getSellerLabel(seller) {
  return seller?.user?.username || seller?.user?.email || seller?._id || '';
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
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 1.5,
        borderRadius: 2,
        borderColor: active ? BRAND_DARK : palette.border,
        background: palette.bg,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: active ? `0 0 0 2px ${BRAND_DARK}` : 'none'
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800 }}>{label}</Typography>
      <Typography variant="h6" sx={{ color: palette.color, fontWeight: 900 }}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </Typography>
    </Paper>
  );
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

function SellerItemsSection({
  title,
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
        {title} ({rows.length})
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
                color={row.orderCount30d > 0 ? 'warning' : 'default'}
                label={`${formatNumber(row.orderCount30d)} / 30d`}
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

export default function SellerSkuStockCheckPage() {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isSuperAdmin = user?.role === 'superadmin';

  const [canRun, setCanRun] = useState(isSuperAdmin);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [starting, setStarting] = useState(false);

  const [runs, setRuns] = useState([]);
  const [runPagination, setRunPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [activeRun, setActiveRun] = useState(null);
  const [items, setItems] = useState([]);
  const [itemCounts, setItemCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 1 });
  const [activeFilter, setActiveFilter] = useState('actionable');
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [verifyIndex, setVerifyIndex] = useState(-1);
  const [endedItems, setEndedItems] = useState({});
  const [endingItemId, setEndingItemId] = useState(null);
  const [revisedItems, setRevisedItems] = useState({});
  const [reviseTarget, setReviseTarget] = useState(null);
  const [reviseForm, setReviseForm] = useState({ title: '', price: '' });
  const [revising, setRevising] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkEnding, setBulkEnding] = useState(false);
  const [verifyImages, setVerifyImages] = useState({});
  // Guards against a slow image response overwriting a newer row's images.
  const imageRequestRef = useRef(null);
  const amazonWinRef = useRef(null);
  // Set when Next/Prev crosses a page boundary: verify the first/last row once
  // the new page of items loads.
  const pendingNavRef = useRef(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isRunning = activeRun && ['queued', 'running'].includes(activeRun.status);
  const isPaused = activeRun?.status === 'paused';

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load sellers'));
  }, []);

  useEffect(() => {
    if (isSuperAdmin) return;
    api.get(`/feature-permissions/${AMAZON_STOCK_CHECK_RUN_FEATURE_ID}/check`)
      .then(({ data }) => setCanRun(Boolean(data?.allowed)))
      .catch(() => setCanRun(false));
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
      setError(err.response?.data?.error || 'Failed to load access settings');
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
      setError(err.response?.data?.error || 'Failed to save access settings');
    } finally {
      setSavingAccess(false);
    }
  };

  const loadSummary = async (sellerId) => {
    setLoadingSummary(true);
    setSummary(null);
    try {
      const { data } = await api.get('/amazon-stock-checks/seller-summary', { params: { sellerId } });
      setSummary(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load SKU summary for seller');
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchRuns = async (sellerId) => {
    if (!sellerId) return;
    try {
      const { data } = await api.get('/amazon-stock-checks/runs', {
        params: { sellerId, page: runPagination.page, limit: runPagination.limit }
      });
      setRuns(data.runs || []);
      setRunPagination((prev) => ({ ...prev, ...(data.pagination || {}) }));
      setActiveRun((prev) => {
        if (prev && (data.runs || []).some((run) => run._id === prev._id)) return prev;
        return data.runs?.[0] || null;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load runs');
    }
  };

  const fetchRun = async (runId) => {
    if (!runId) return;
    try {
      const [{ data: runData }, { data: itemsData }] = await Promise.all([
        api.get(`/amazon-stock-checks/runs/${runId}`),
        api.get(`/amazon-stock-checks/runs/${runId}/items`, {
          params: { filter: activeFilter, page: pagination.page, limit: pagination.limit }
        })
      ]);
      setActiveRun(runData.run);
      setItemCounts(runData.itemCounts || {});
      setItems(itemsData.items || []);
      setPagination((prev) => ({ ...prev, ...(itemsData.pagination || {}) }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load run details');
    }
  };

  useEffect(() => {
    if (!selectedSeller?._id) {
      setSummary(null);
      setRuns([]);
      setActiveRun(null);
      setItems([]);
      setItemCounts({});
      return;
    }
    loadSummary(selectedSeller._id);
    fetchRuns(selectedSeller._id);
  }, [selectedSeller?._id, runPagination.page, runPagination.limit]);

  useEffect(() => {
    if (!activeRun?._id) return undefined;
    fetchRun(activeRun._id);
    if (!['queued', 'running'].includes(activeRun.status)) return undefined;
    const timer = setInterval(() => {
      fetchRun(activeRun._id);
      if (selectedSeller?._id) fetchRuns(selectedSeller._id);
    }, 5000);
    return () => clearInterval(timer);
  }, [activeRun?._id, activeRun?.status, activeFilter, pagination.page, pagination.limit]);

  const handleStart = async (currency) => {
    if (!selectedSeller?._id) return;
    setError('');
    setSuccess('');
    setStarting(true);
    try {
      const { data } = await api.post('/amazon-stock-checks/runs', {
        sellerId: selectedSeller._id,
        currencies: [currency],
        threshold
      });
      setActiveRun(data.run);
      setItems([]);
      setItemCounts({});
      setActiveFilter('actionable');
      setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 1 }));
      setExpandedRows(new Set());
      setSuccess(`Stock check started for ${getSellerLabel(selectedSeller)} (${currency}).`);
      await fetchRuns(selectedSeller._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start stock check');
    } finally {
      setStarting(false);
    }
  };

  const handleRunAction = async (action) => {
    if (!activeRun?._id) return;
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`/amazon-stock-checks/runs/${activeRun._id}/${action}`);
      setSuccess(data.message || `Run ${action} requested.`);
      await fetchRuns(selectedSeller?._id);
      await fetchRun(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${action} run`);
    }
  };

  // Open (or navigate) the shared Amazon review window, positioned on the
  // left half of the screen so the verify panel can sit on the right.
  const openAmazonWindow = (url) => {
    if (!url) return;
    // If the review window is already open, navigate it via location instead
    // of window.open: that swaps the page WITHOUT focusing the Amazon window,
    // so keyboard focus (and the arrow-key navigation) stays on this app.
    const existing = amazonWinRef.current;
    if (existing && !existing.closed) {
      try {
        existing.location.href = url;
        return;
      } catch {
        // Window reference went stale — fall through and recreate it.
      }
    }
    // Size the popup to fill the screen from the left edge up to where the
    // verify panel sits inside this browser window, so the two never overlap.
    // Browsers only honor width/height when the named window is first created,
    // so if the user resizes/snaps the Amazon window their arrangement sticks
    // for the rest of the review session.
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

  const handleVerify = async (item, index) => {
    setError('');
    setVerifyOpen(true);
    setVerifyLoading(true);
    setVerifyData(null);
    setVerifyIndex(index);
    setEndedItems({});
    setRevisedItems({});
    setSelectedIds(new Set());
    setVerifyImages({});
    // Open Amazon synchronously with a client-built URL so popup blockers
    // treat it as user-initiated; the verify data fetch follows.
    openAmazonWindow(getAmazonUrl(item));
    try {
      const { data } = await api.get(`/amazon-stock-checks/items/${item._id}/verify`);
      setVerifyData(data);
      if (data.amazonUrl && data.amazonUrl !== getAmazonUrl(item)) openAmazonWindow(data.amazonUrl);
      // Load listing images live from eBay in the background; the panel is
      // already usable while they arrive.
      const imageItemIds = [...new Set((data.sellerItems || []).map((row) => row.itemId).filter(Boolean))];
      if (imageItemIds.length && selectedSeller?._id) {
        imageRequestRef.current = item._id;
        api.post('/amazon-stock-checks/live-images', { sellerId: selectedSeller._id, itemIds: imageItemIds })
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

  const handleEndItem = async (sellerItemRow) => {
    setError('');
    setSuccess('');
    setEndingItemId(sellerItemRow.itemId);
    try {
      await api.post('/ebay/end-item', {
        sellerId: sellerItemRow.sellerId,
        itemId: sellerItemRow.itemId,
        source: 'amazon_stock_check',
        sku: verifyData?.sku || '',
        country: verifyData?.country || '',
        run: activeRun?._id || ''
      });
      setEndedItems((prev) => ({
        ...prev,
        [sellerItemRow.itemId]: {
          endedAt: new Date().toISOString(),
          endedBy: user?.username || user?.name || user?.email || 'you'
        }
      }));
      setSuccess(`Ended item ${sellerItemRow.itemId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.details || 'Failed to end item');
    } finally {
      setEndingItemId(null);
    }
  };

  const openReviseDialog = (sellerItemRow) => {
    setReviseTarget(sellerItemRow);
    setReviseForm({ title: sellerItemRow.title || '', price: sellerItemRow.price ?? '' });
  };

  const handleReviseListing = async () => {
    if (!reviseTarget) return;
    setError('');
    setSuccess('');
    setRevising(true);
    try {
      const { data } = await api.post('/amazon-stock-checks/revise-listing', {
        sellerId: reviseTarget.sellerId,
        itemId: reviseTarget.itemId,
        title: reviseForm.title,
        price: reviseForm.price,
        previousTitle: reviseTarget.title || '',
        previousPrice: reviseTarget.price ?? null,
        sku: verifyData?.sku || '',
        asin: verifyData?.asin || ''
      });
      setRevisedItems((prev) => ({
        ...prev,
        [reviseTarget.itemId]: {
          revisedAt: new Date().toISOString(),
          revisedBy: user?.username || user?.name || user?.email || 'you',
          previousTitle: reviseTarget.title || '',
          newTitle: reviseForm.title,
          previousPrice: reviseTarget.price ?? null,
          newPrice: reviseForm.price !== '' ? Number(reviseForm.price) : null
        }
      }));
      setReviseTarget(null);
      setSuccess(data.message || `Revised item ${reviseTarget.itemId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revise listing');
    } finally {
      setRevising(false);
    }
  };

  const toggleSelect = (row) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.itemId)) next.delete(row.itemId);
      else next.add(row.itemId);
      return next;
    });
  };

  const selectNoOrderItems = () => {
    const ids = (verifyData?.sellerItems || [])
      .filter((row) => row.orderCount30d === 0 && !(endedItems[row.itemId] || row.endedInfo))
      .map((row) => row.itemId);
    setSelectedIds(new Set(ids));
  };

  const handleEndSelected = async () => {
    const rows = (verifyData?.sellerItems || [])
      .filter((row) => selectedIds.has(row.itemId) && !(endedItems[row.itemId] || row.endedInfo));
    if (!rows.length) return;
    if (!window.confirm(`End ${rows.length} listing(s)? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
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
          sku: verifyData?.sku || '',
          country: verifyData?.country || '',
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
    setSelectedIds(new Set());
    if (failures.length) {
      setError(`Ended ${okCount} listing(s); failed for: ${failures.join(', ')}`);
    } else {
      setSuccess(`Ended ${okCount} listing(s).`);
    }
  };

  const applyFilter = (filter) => {
    setActiveFilter(filter);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setExpandedRows(new Set());
    if (verifyOpen) closeVerify();
  };

  const toggleExpanded = (itemId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const verifySellerRows = useMemo(() => {
    const rows = verifyData?.sellerItems || [];
    return {
      runSeller: rows.filter((row) => row.isRunSeller),
      others: rows.filter((row) => !row.isRunSeller)
    };
  }, [verifyData]);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Seller SKU Stock Check"
        subtitle="Pick a seller, review their SKU index by currency, run an Amazon stock check on those SKUs, then verify results and end listings manually."
      />

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSuccess('')} sx={{ minWidth: 320 }}>
          {success}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={4000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError('')} sx={{ minWidth: 320 }}>
          {error}
        </Alert>
      </Snackbar>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Seller</Typography>
            <Autocomplete
              options={sellers}
              value={selectedSeller}
              onChange={(_, value) => {
                setSelectedSeller(value);
                setRunPagination((prev) => ({ ...prev, page: 1 }));
              }}
              getOptionLabel={getSellerLabel}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderInput={(params) => <TextField {...params} size="small" placeholder="Select a seller" />}
            />
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
          <Grid item xs={6} md={5}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
              {loadingSummary && (
                <>
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">Loading SKU index summary...</Typography>
                </>
              )}
              <Box sx={{ flex: 1 }} />
              {isSuperAdmin && (
                <Tooltip title="Manage who can run stock checks (shared with the Amazon Stock Check page)">
                  <IconButton size="small" onClick={openAccessDialog}>
                    <LockPersonIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {summary && (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>
            SKU Index by Currency — {getSellerLabel(selectedSeller)}
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ background: BRAND_DARK }}>
                <TableRow>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Country</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Currency</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 900 }}>SKU Count</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 900 }}>Listings</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 900 }}>Duplicate SKUs</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 900 }}>Extra Count</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 900 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(summary.currencies || []).map((row) => (
                  <TableRow key={row.currency} hover>
                    <TableCell sx={{ fontWeight: 800 }}>{row.country}</TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell align="right">{formatNumber(row.uniqueSkuCount)}</TableCell>
                    <TableCell align="right">{formatNumber(row.listingCount)}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" color={row.duplicateSkuCount > 0 ? 'warning' : 'success'} label={formatNumber(row.duplicateSkuCount)} />
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small" color={row.extraCount > 0 ? 'error' : 'success'} label={formatNumber(row.extraCount)} />
                    </TableCell>
                    <TableCell align="right">
                      {row.supported ? (
                        canRun ? (
                          <Tooltip title={`Check Amazon availability for all ${formatNumber(row.uniqueSkuCount)} SKUs (${row.credits} credit${row.credits > 1 ? 's' : ''}/SKU)`}>
                            <span>
                              <Button
                                size="small"
                                variant="contained"
                                startIcon={starting ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                                disabled={starting || isRunning}
                                onClick={() => handleStart(row.currency)}
                                sx={{ backgroundColor: BRAND_DARK }}
                              >
                                Check Stock
                              </Button>
                            </span>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">No run access</Typography>
                        )
                      ) : (
                        <Typography variant="caption" color="text.secondary">Unsupported</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!summary.currencies?.length && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No SKU index rows found for this seller. Run a SKU Index Sync first.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {selectedSeller && runs.length > 0 && (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Runs for {getSellerLabel(selectedSeller)}</Typography>
          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
            {runs.map((run) => (
              <Button
                key={run._id}
                variant={activeRun?._id === run._id ? 'contained' : 'outlined'}
                onClick={() => {
                  setActiveRun(run);
                  setActiveFilter('actionable');
                  setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 1 }));
                  setExpandedRows(new Set());
                  if (verifyOpen) closeVerify();
                }}
                sx={{
                  alignItems: 'flex-start',
                  flex: '0 0 250px',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  backgroundColor: activeRun?._id === run._id ? BRAND_DARK : undefined
                }}
              >
                <Stack spacing={0.25} sx={{ width: '100%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 900 }}>{(run.currencies || []).join(', ')}</Typography>
                  <Typography variant="caption">{formatDateTime(run.createdAt)}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 900 }}>
                    {run.status} | {formatNumber(run.checkedCount)}/{formatNumber(run.totalSkus)}
                  </Typography>
                </Stack>
              </Button>
            ))}
          </Stack>
          <TablePagination
            component="div"
            count={runPagination.total || 0}
            page={Math.max(0, (runPagination.page || 1) - 1)}
            onPageChange={(_event, nextPage) => setRunPagination((prev) => ({ ...prev, page: nextPage + 1 }))}
            rowsPerPage={runPagination.limit || 10}
            onRowsPerPageChange={(event) => {
              setRunPagination((prev) => ({ ...prev, page: 1, limit: Number.parseInt(event.target.value, 10) }));
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}

      {activeRun && (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            {canRun && isRunning && (
              <Button variant="outlined" color="warning" size="small" startIcon={<PauseIcon />} onClick={() => handleRunAction('pause')}>
                Pause
              </Button>
            )}
            {canRun && isPaused && (
              <Button variant="outlined" size="small" startIcon={<PlayArrowIcon />} onClick={() => handleRunAction('resume')}>
                Resume
              </Button>
            )}
            {canRun && ['queued', 'running', 'paused'].includes(activeRun.status) && (
              <Button variant="outlined" color="error" size="small" startIcon={<StopCircleIcon />} onClick={() => handleRunAction('cancel')}>
                Cancel
              </Button>
            )}
            {isRunning && <CircularProgress size={16} />}
          </Stack>

          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={6} md={1.5}><KpiCard label="Status" value={activeRun.status} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="Total SKUs" value={activeRun.totalSkus} active={activeFilter === 'all'} onClick={() => applyFilter('all')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="Checked" value={activeRun.checkedCount} active={activeFilter === 'checked'} onClick={() => applyFilter('checked')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="In Stock" value={activeRun.inStockCount} tone="good" active={activeFilter === 'in_stock'} onClick={() => applyFilter('in_stock')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="In Stock (Unconfirmed)" value={activeRun.inStockUnconfirmedCount || itemCounts.in_stock_unconfirmed || 0} tone="info" active={activeFilter === 'in_stock_unconfirmed'} onClick={() => applyFilter('in_stock_unconfirmed')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="Low Stock" value={activeRun.lowStockCount} tone="warn" active={activeFilter === 'low_stock'} onClick={() => applyFilter('low_stock')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="Out of Stock" value={activeRun.outOfStockCount} tone="bad" active={activeFilter === 'out_of_stock'} onClick={() => applyFilter('out_of_stock')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="No ASIN" value={activeRun.noAsinCount} active={activeFilter === 'no_asin'} onClick={() => applyFilter('no_asin')} /></Grid>
            <Grid item xs={6} md={1.5}><KpiCard label="Errors" value={activeRun.errorCount} tone="bad" active={activeFilter === 'errors'} onClick={() => applyFilter('errors')} /></Grid>
          </Grid>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>Filter</Typography>
            {Object.entries(FILTER_LABELS).map(([filter, label]) => (
              <Chip
                key={filter}
                size="small"
                label={`${label}${itemCounts[filter] != null ? ` (${formatNumber(itemCounts[filter])})` : ''}`}
                color={activeFilter === filter ? 'primary' : 'default'}
                onClick={() => applyFilter(filter)}
                sx={{ fontWeight: 800 }}
              />
            ))}
          </Stack>

          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ background: BRAND_DARK }}>
                <TableRow>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>SKU</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>ASIN</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Country</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Amazon Status</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Stock</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Item IDs</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 900 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, index) => {
                  const expanded = expandedRows.has(item._id);
                  return (
                    <Fragment key={item._id}>
                      <TableRow
                        hover
                        onClick={() => toggleExpanded(item._id)}
                        selected={verifyOpen && index === verifyIndex}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={{ fontWeight: 900 }}>{item.sku}</TableCell>
                        <TableCell>{item.asin || '-'}</TableCell>
                        <TableCell>{item.country}</TableCell>
                        <TableCell>
                          <Chip size="small" color={statusColor(item.status)} label={STATUS_LABELS[item.status] || item.status} />
                        </TableCell>
                        <TableCell>{item.stockQuantity ?? (item.availabilityText || '-')}</TableCell>
                        <TableCell>{formatNumber(item.sellerItems?.length || 0)}</TableCell>
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
                        <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                          <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, background: '#f8fafc' }}>
                              <Typography variant="caption" sx={{ fontWeight: 900 }}>Item IDs on this SKU</Typography>
                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                                {(item.sellerItems || []).map((sellerItem) => (
                                  <Chip
                                    key={`${sellerItem.sellerId}-${sellerItem.itemId}`}
                                    size="small"
                                    label={`${sellerItem.sellerName}: ${sellerItem.itemId}`}
                                  />
                                ))}
                              </Stack>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {!items.length && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      {isRunning ? 'Check in progress — results will appear here.' : 'No rows match the selected filter yet.'}
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
                setPagination((prev) => ({ ...prev, page: 1, limit: Number.parseInt(event.target.value, 10) }));
                setExpandedRows(new Set());
              }}
              rowsPerPageOptions={[25, 50, 100, 250, 500]}
            />
          </TableContainer>
        </>
      )}

      <Dialog open={accessDialogOpen} onClose={() => setAccessDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Stock Check Access</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Superadmins always have access. Select which other users can run stock checks.
              This list is shared with the Amazon Stock Check page.
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

      <Dialog open={Boolean(reviseTarget)} onClose={() => setReviseTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revise Listing</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Item {reviseTarget?.itemId} &middot; {reviseTarget?.sellerName}
            </Typography>
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
                {' '}&middot; {FILTER_LABELS[activeFilter] || activeFilter}
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
                  Select 0-order (30d)
                </Button>
                <Button size="small" disabled={!selectedIds.size || bulkEnding} onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  color="error"
                  variant="contained"
                  disabled={!selectedIds.size || bulkEnding}
                  startIcon={bulkEnding ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
                  onClick={handleEndSelected}
                >
                  End Selected ({selectedIds.size})
                </Button>
              </Stack>
              <SellerItemsSection
                title={`This seller${selectedSeller ? ` — ${getSellerLabel(selectedSeller)}` : ''}`}
                rows={verifySellerRows.runSeller}
                currentSku={verifyData.sku}
                images={verifyImages}
                endedItems={endedItems}
                endingItemId={endingItemId}
                onEndItem={handleEndItem}
                revisedItems={revisedItems}
                onReviseItem={openReviseDialog}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
              <Divider />
              <SellerItemsSection
                title="Other sellers with this base SKU in the same currency"
                rows={verifySellerRows.others}
                currentSku={verifyData.sku}
                images={verifyImages}
                endedItems={endedItems}
                endingItemId={endingItemId}
                onEndItem={handleEndItem}
                revisedItems={revisedItems}
                onReviseItem={openReviseDialog}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </Stack>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
