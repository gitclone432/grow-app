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
  Drawer,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CloseIcon from '@mui/icons-material/Close';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import api from '../../lib/api';
import { endListingSourceLabel } from '../../constants/endListingSources';
import PageHeader from '../../components/PageHeader';
import AsinReviewModal from '../../components/AsinReviewModal';
import ListingThumb from '../../components/ListingThumb';
import OrderSparkline from '../../components/OrderSparkline';
import VerifyResumeButton from '../../components/VerifyResumeButton';
import useVerifyResumePoint from '../../hooks/useVerifyResumePoint';
import { BRAND_DARK } from '../../constants/brandTheme';

// Companion to the Amazon Stock Check page: for a run started there, lists the
// SKUs whose Amazon brand or buy-box seller is on the Excluded Brands list (the
// ASIN precheck's list) — or, in the second view, whose buy-box Ships From is
// not Amazon (the precheck's "Not shipped by Amazon" rule) — with every eBay
// listing carrying each SKU, its order history, and the same end / revise
// actions as the stock check page. The run itself is untouched — it records
// the brand, seller and shipper it already scraped, and this page matches the
// brand and seller against the list as it stands now.

const AMAZON_DOMAINS = { USD: 'com', AUD: 'com.au', CAD: 'ca', GBP: 'co.uk' };

// Same gate as the stock check page's Start button.
const AMAZON_STOCK_CHECK_RUN_FEATURE_ID = 'amazonStockCheck.run';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'United States', credits: 1 },
  { value: 'AUD', label: 'Australia', credits: 5 },
  { value: 'CAD', label: 'Canada', credits: 5 },
  { value: 'GBP', label: 'United Kingdom', credits: 5 }
];

// Matches BRAND_TEST_MAX_SKUS on the server.
const TEST_RUN_MAX_SKUS = 2000;

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

const MATCHED_ON_LABELS = { brand: 'Matched on Brand', soldBy: 'Matched on Seller' };

const VIEW_LABELS = { brands: 'Excluded brands', notAmazon: 'Not shipped by Amazon' };

const SHIPPER_LABELS = { thirdParty: 'Third-party shipper', unknown: 'Shipper unknown' };

// amazonShippedByAmazon is missing on items checked before it was recorded —
// only an explicit false is a not-Amazon shipper.
const isNotShippedByAmazon = (item) => item?.amazonShippedByAmazon === false;

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function KpiCard({ label, value, tone = 'default', active = false, onClick }) {
  const colors = {
    default: { bg: '#fff', border: '#e5e7eb', color: BRAND_DARK },
    bad: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' }
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

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function getRunUser(run) {
  return run?.requestedBy?.username || run?.requestedBy?.name || run?.requestedBy?.email || '-';
}

function getRunMode(run) {
  return run.mode === 'brand_test' ? `test run · ${formatNumber(run.skuLimit)} SKUs` : run.mode;
}

function getRunScope(run) {
  return `${getRunMode(run)} | ${(run.currencies || []).join(', ') || '-'}`;
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function currentUserName() {
  const user = readUser();
  return user?.username || user?.name || user?.email || 'you';
}

// A SKU's listings are auto-ticked for ending only when none of them has sold
// in the last 90 days — if even one has, the whole SKU is left for a manual
// decision (end or revise), as with the stock check page's low-stock rule.
function getAutoSelectRows(rows, isEnded) {
  if (!rows?.length || rows.some((row) => (row.orderCount90d || 0) > 0)) return [];
  return rows.filter((row) => !isEnded(row));
}

// The verify panel's listing cards — same layout as the stock check page's.
function SellerItemsSection({
  rows,
  currentSku,
  images,
  endedItems,
  revisedItems,
  failedItems,
  endingItemId,
  busy,
  selectedIds,
  onToggleSelect,
  onEndItem,
  onReviseItem
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
        const rowBusy = endingItemId === row.itemId || busy;
        const failReason = !endedInfo ? failedItems[row.itemId] : null;
        return (
          <Paper key={`${row.sellerId}-${row.itemId}`} variant="outlined" sx={{ p: 1.25, mb: 1, borderRadius: 2, opacity: endedInfo ? 0.6 : 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                size="small"
                sx={{ p: 0.25 }}
                disabled={Boolean(endedInfo) || rowBusy}
                checked={selectedIds.has(row.itemId) && !endedInfo}
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
                  <Chip size="small" variant="outlined" color="info" label={row.sku} sx={{ fontWeight: 800, fontFamily: 'monospace' }} />
                </Tooltip>
              )}
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                {row.price != null ? `${row.price} ${row.currency || ''}` : '-'}
              </Typography>
              {!endedInfo && (
                <Button size="small" variant="outlined" startIcon={<EditIcon />} disabled={rowBusy} onClick={() => onReviseItem(row)}>
                  Revise
                </Button>
              )}
              {endedInfo ? (
                <Tooltip title={`Ended by ${endedInfo.endedBy || 'unknown'} on ${formatDateTime(endedInfo.endedAt)}${endedInfo.source ? ` from ${endListingSourceLabel(endedInfo.source)}` : ''}`}>
                  <Chip size="small" color="error" label="Ended" sx={{ fontWeight: 800 }} />
                </Tooltip>
              ) : (
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  startIcon={endingItemId === row.itemId ? <CircularProgress size={14} color="inherit" /> : <StopCircleIcon />}
                  disabled={rowBusy}
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
              <Chip size="small" variant="outlined" label={`${formatNumber(row.orderCount30d)} / 30d`} sx={{ fontWeight: 800 }} />
              <Chip
                size="small"
                color={row.orderCount90d > 0 ? 'warning' : 'default'}
                label={`${formatNumber(row.orderCount90d)} / 90d`}
                sx={{ fontWeight: 800 }}
              />
              <Chip size="small" variant="outlined" label={`${formatNumber(row.lifetimeOrderCount || 0)} lifetime`} sx={{ fontWeight: 800 }} />
              <OrderSparkline monthly={row.monthlyOrders} />
            </Stack>
            {endedInfo && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main', fontWeight: 700 }}>
                Ended by {endedInfo.endedBy || 'unknown'} &middot; {formatDateTime(endedInfo.endedAt)}{endedInfo.source && <> &middot; from {endListingSourceLabel(endedInfo.source)}</>}
              </Typography>
            )}
            {failReason && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main', fontWeight: 700 }}>
                End failed: {failReason} — use End Listing to retry
              </Typography>
            )}
            {revisedInfo && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#1d4ed8', fontWeight: 700 }}>
                Revised by {revisedInfo.revisedBy || 'unknown'} &middot; {formatDateTime(revisedInfo.revisedAt)}
                {revisedInfo.previousPrice != null && revisedInfo.newPrice != null
                  ? ` · ${revisedInfo.previousPrice} → ${revisedInfo.newPrice} ${row.currency || ''}`
                  : ''}
              </Typography>
            )}
            {row.orders?.length > 0 && (
              <Box sx={{ mt: 1, pl: 1, borderLeft: '3px solid #fed7aa' }}>
                {row.orders.map((order) => (
                  <Typography key={`${order.orderId}-${order.date}`} variant="caption" display="block" color="text.secondary">
                    {formatDateTime(order.date)} | Order {order.orderId}
                    {order.quantity != null ? ` | Qty ${order.quantity}` : ''}
                    {order.subtotal != null ? ` | ${order.subtotal} ${row.currency || ''}` : ''}
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

// brand and matchedOn apply to the brands view, shipper to the notAmazon view.
const EMPTY_FILTERS = { brand: '', matchedOn: '', shipper: '' };

export default function StockCheckExcludedBrandsPage() {
  const [view, setView] = useState('brands');
  const isSuperAdmin = readUser()?.role === 'superadmin';
  const [canRun, setCanRun] = useState(isSuperAdmin);
  const [testCurrency, setTestCurrency] = useState('USD');
  const [testSkuCount, setTestSkuCount] = useState(50);
  const [startingTest, setStartingTest] = useState(false);

  const [runs, setRuns] = useState([]);
  const [runPagination, setRunPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [recentRunsOpen, setRecentRunsOpen] = useState(false);
  const [activeRun, setActiveRun] = useState(null);

  const [data, setData] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loadingItems, setLoadingItems] = useState(false);

  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Ending listings: per-row, or everything ticked across the page.
  const [endedItems, setEndedItems] = useState({});
  const [failedItems, setFailedItems] = useState({});
  const [endingItemId, setEndingItemId] = useState(null);
  // Map<itemId, row> so a selection survives paging and filter changes.
  const [selectedRows, setSelectedRows] = useState(() => new Map());
  const [confirmEnd, setConfirmEnd] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  // Revise — same two modes as the stock check page: 'manual' edits title and
  // price; 'asin' repoints the listing at a new ASIN using a template.
  const [revisedItems, setRevisedItems] = useState({});
  const [reviseTarget, setReviseTarget] = useState(null);
  const [reviseForm, setReviseForm] = useState({ title: '', price: '' });
  const [revising, setRevising] = useState(false);
  const [reviseMode, setReviseMode] = useState('manual');
  const [reviseAsin, setReviseAsin] = useState('');
  const [reviseTemplateId, setReviseTemplateId] = useState('');
  const [reviseTemplates, setReviseTemplates] = useState([]);
  const [reviseTemplatesLoading, setReviseTemplatesLoading] = useState(false);
  const [revisePreview, setRevisePreview] = useState(null);
  const [reviseReviewOpen, setReviseReviewOpen] = useState(false);

  // Verify split screen: Amazon product page in a window on the left, this
  // SKU's live listings in a panel on the right.
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [verifyIndex, setVerifyIndex] = useState(-1);
  const [verifyImages, setVerifyImages] = useState({});
  const amazonWinRef = useRef(null);
  const pendingNavRef = useRef(null);
  const imageRequestRef = useRef(null);
  // Keys already auto-ticked once (item ids for the table, 'verify:<id>' for
  // the panel), so a listing the user unticks isn't ticked again on refresh.
  const autoSelectedRef = useRef(new Set());
  const fetchSeqRef = useRef(0);

  const items = data?.items || [];
  const counts = data?.counts || {};
  const isRunning = activeRun && ['queued', 'running'].includes(activeRun.status);

  // Where to pick up in the verify list: the row after the furthest one with
  // a listing ended from this page, whoever ended it (see useVerifyResumePoint).
  // Only with a seller selected — a whole run is too big to scan.
  const { resumePoint, live: liveRows, refresh: refreshResumePoint } = useVerifyResumePoint(
    activeRun?._id && sellerFilter?._id ? `/amazon-stock-checks/runs/${activeRun._id}/excluded-brands/resume-point` : null,
    {
      view,
      brand: filters.brand || undefined,
      matchedOn: filters.matchedOn || undefined,
      shipper: filters.shipper || undefined,
      sellerId: sellerFilter?._id || undefined
    }
  );

  const fetchRuns = async () => {
    setLoadingRuns(true);
    try {
      const { data: runsData } = await api.get('/amazon-stock-checks/runs', {
        params: { page: runPagination.page, limit: runPagination.limit }
      });
      setRuns(runsData.runs || []);
      setRunPagination((prev) => ({ ...prev, ...(runsData.pagination || {}) }));
      if (!activeRun && runsData.runs?.[0]) setActiveRun(runsData.runs[0]);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load runs');
    } finally {
      setLoadingRuns(false);
    }
  };

  const fetchExcluded = async (runId, { showLoading = false } = {}) => {
    if (!runId) return;
    // Only the latest request may land: a slower one started before a view,
    // filter or page change would otherwise show (and auto-tick) stale rows.
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
    if (showLoading) setLoadingItems(true);
    try {
      const { data: result } = await api.get(`/amazon-stock-checks/runs/${runId}/excluded-brands`, {
        params: {
          view,
          brand: filters.brand || undefined,
          matchedOn: filters.matchedOn || undefined,
          shipper: filters.shipper || undefined,
          sellerId: sellerFilter?._id || undefined,
          page: pagination.page,
          limit: pagination.limit
        }
      });
      if (isStale()) return;
      setData(result);
      setActiveRun(result.run);
      // Keep the run's card in Recent Runs in step (status, checked count) —
      // the list is otherwise only read on load and paging.
      setRuns((prev) => prev.map((run) => (run._id === result.run?._id ? { ...run, ...result.run } : run)));
      setPagination((prev) => ({ ...prev, ...(result.pagination || {}) }));
    } catch (err) {
      if (isStale()) return;
      setError(err.response?.data?.error || err.message || `Failed to load ${VIEW_LABELS[view].toLowerCase()} for this run`);
      dropPendingNav();
    } finally {
      // The latest request owns the spinner, whichever request turned it on.
      if (!isStale()) setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) return;
    api.get(`/feature-permissions/${AMAZON_STOCK_CHECK_RUN_FEATURE_ID}/check`)
      .then(({ data: permission }) => setCanRun(Boolean(permission?.allowed)))
      .catch(() => setCanRun(false));
  }, []);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data: sellerData }) => setSellers(Array.isArray(sellerData) ? sellerData : []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load sellers'));
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [runPagination.page, runPagination.limit]);

  // Slower poll than the stock check page: each refresh also re-reads order
  // history for the listings on screen.
  useEffect(() => {
    if (!activeRun?._id) return undefined;
    fetchExcluded(activeRun._id, { showLoading: true });
    if (!['queued', 'running'].includes(activeRun.status)) return undefined;
    const timer = setInterval(() => fetchExcluded(activeRun._id), 15000);
    return () => clearInterval(timer);
  }, [activeRun?._id, activeRun?.status, view, filters.brand, filters.matchedOn, filters.shipper, pagination.page, pagination.limit, sellerFilter?._id]);

  const resetView = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const selectRun = (run) => {
    if (verifyOpen) closeVerify();
    autoSelectedRef.current = new Set();
    setActiveRun(run);
    setData(null);
    setFilters(EMPTY_FILTERS);
    setSelectedRows(new Map());
    setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 1 }));
  };

  // A fresh start in the other view: the selection is cleared so listings
  // ticked in one view can't be ended unseen from the other.
  const changeView = (next) => {
    if (!next || next === view) return;
    if (verifyOpen) closeVerify();
    autoSelectedRef.current = new Set();
    setView(next);
    setData(null);
    setFilters(EMPTY_FILTERS);
    setSelectedRows(new Map());
    setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 1 }));
  };

  // Clicking the active card/chip again clears that filter.
  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? EMPTY_FILTERS[key] : value }));
    resetView();
    if (verifyOpen) closeVerify();
  };

  const testSkuNumber = Number.parseInt(testSkuCount, 10);
  const testSkuValid = Number.isFinite(testSkuNumber) && testSkuNumber >= 1 && testSkuNumber <= TEST_RUN_MAX_SKUS;
  const testCredits = testSkuValid
    ? testSkuNumber * (CURRENCY_OPTIONS.find((option) => option.value === testCurrency)?.credits || 1)
    : 0;

  const handleStartTest = async () => {
    setError('');
    setSuccess('');
    setStartingTest(true);
    try {
      const { data: result } = await api.post('/amazon-stock-checks/runs/brand-test', {
        currency: testCurrency,
        skuCount: testSkuNumber
      });
      selectRun(result.run);
      setSuccess(`Test run started on ${formatNumber(testSkuNumber)} ${testCurrency} SKUs.`);
      await fetchRuns();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to start the test run');
    } finally {
      setStartingTest(false);
    }
  };

  const handleCancelRun = async () => {
    if (!activeRun?._id) return;
    setError('');
    setSuccess('');
    try {
      const { data: result } = await api.post(`/amazon-stock-checks/runs/${activeRun._id}/cancel`);
      setSuccess(result.message || 'Run cancelled.');
      setActiveRun(result.run ? { ...activeRun, ...result.run } : activeRun);
      await fetchRuns();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to cancel the run');
    }
  };

  const handleSellerFilterChange = (value) => {
    setSellerFilter(value);
    resetView();
    if (verifyOpen) closeVerify();
  };

  const isEnded = (row) => Boolean(endedItems[row.itemId] || row.endedInfo);

  // Auto-tick for ending: each excluded SKU with no orders in the last 90 days
  // on any of its listings, the first time it appears. Brands view only — a
  // not-Amazon shipper (often just a blank Ships From) is a judgement call, so
  // that view leaves ticking to "Select no-order listings".
  useEffect(() => {
    // data.view is checked too, so rows from the other view never auto-tick
    // (it is absent from older servers, which only have the brands view).
    if (view !== 'brands' || (data?.view && data.view !== 'brands')) return;
    const fresh = items.filter((item) => !autoSelectedRef.current.has(item._id));
    if (!fresh.length) return;
    const additions = [];
    for (const item of fresh) {
      autoSelectedRef.current.add(item._id);
      for (const row of getAutoSelectRows(item.sellerItems, isEnded)) {
        additions.push({ ...row, sku: row.sku || item.sku, country: item.country });
      }
    }
    if (!additions.length) return;
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const row of additions) if (!next.has(row.itemId)) next.set(row.itemId, row);
      return next;
    });
  }, [items]);

  const getVisibleSellerItems = (sellerItems = []) => (
    sellerFilter ? sellerItems.filter((row) => String(row.sellerId) === String(sellerFilter._id)) : sellerItems
  );

  // Open (or navigate) the shared Amazon window on the left half of the
  // screen so the verify panel can sit on the right.
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
    if (win) amazonWinRef.current = win;
  };

  const handleVerify = async (item, index) => {
    setError('');
    setVerifyOpen(true);
    setVerifyLoading(true);
    setVerifyData(null);
    setVerifyIndex(index);
    setVerifyImages({});
    // Synchronously on click, so the popup blocker allows it.
    openAmazonWindow(getAmazonUrl(item));
    try {
      const { data: verify } = await api.get(`/amazon-stock-checks/items/${item._id}/verify`);
      setVerifyData(verify);
      const autoKey = `verify:${item._id}`;
      if (view === 'brands' && !autoSelectedRef.current.has(autoKey)) {
        autoSelectedRef.current.add(autoKey);
        const autoRows = getAutoSelectRows(getVisibleSellerItems(verify.sellerItems || []), isEnded);
        if (autoRows.length) {
          setSelectedRows((prev) => {
            const next = new Map(prev);
            for (const row of autoRows) {
              if (!next.has(row.itemId)) next.set(row.itemId, { ...row, sku: row.sku || verify.sku, country: verify.country });
            }
            return next;
          });
        }
      }
      if (verify.amazonUrl && verify.amazonUrl !== getAmazonUrl(item)) openAmazonWindow(verify.amazonUrl);
      const imageItemIds = [...new Set(getVisibleSellerItems(verify.sellerItems || []).map((row) => row.itemId).filter(Boolean))];
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

  function closeVerify() {
    setVerifyOpen(false);
    setVerifyIndex(-1);
    setVerifyData(null);
    if (amazonWinRef.current && !amazonWinRef.current.closed) amazonWinRef.current.close();
    amazonWinRef.current = null;
  }

  // Closes the Amazon window only while it is still the blank one opened
  // ahead of a jump to another table page (a window on Amazon can't be read,
  // so reading it throws and it is left alone).
  const closeBlankAmazonWindow = () => {
    const win = amazonWinRef.current;
    try {
      if (win && !win.closed && win.location.href === 'about:blank') {
        win.close();
        amazonWinRef.current = null;
      }
    } catch {
      // On Amazon — leave it.
    }
  };

  // A jump waiting on a table page that failed to load is dropped, with its
  // blank window — otherwise the next successful poll would open it late.
  const dropPendingNav = () => {
    if (!pendingNavRef.current) return;
    pendingNavRef.current = null;
    closeBlankAmazonWindow();
  };

  // Previous/next SKU from fromIndex in the current filtered list, crossing
  // table pages. Returns false when there is no such SKU.
  const stepFrom = (rows, fromIndex, step) => {
    const target = fromIndex + step;
    if (target >= 0 && target < rows.length) {
      handleVerify(rows[target], target);
      return true;
    }
    if (step > 0 && pagination.page < pagination.totalPages) {
      pendingNavRef.current = 'first';
      setPagination((prev) => ({ ...prev, page: prev.page + 1 }));
      return true;
    }
    if (step < 0 && pagination.page > 1) {
      pendingNavRef.current = 'last';
      setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
      return true;
    }
    return false;
  };

  const handleVerifyNav = (step) => stepFrom(items, verifyIndex, step);

  // Opens a list row named by the resume-point response — that row itself,
  // or the one after it when `after`. The row is looked up by id on its page;
  // if the list shifted under it, its old row number is used instead.
  const openListTarget = (rows, target) => {
    const foundIndex = rows.findIndex((row) => String(row._id) === target.itemId);
    const index = foundIndex > -1 ? foundIndex : Math.min(target.offset, rows.length - 1);
    if (!stepFrom(rows, target.after ? index : index - 1, 1)) {
      if (amazonWinRef.current && !amazonWinRef.current.closed) amazonWinRef.current.close();
      amazonWinRef.current = null;
      setSuccess(`Nothing left to verify after row #${target.position.toLocaleString()} in this list.`);
    }
  };

  const openListRow = (point, { after }) => {
    if (!point) return;
    const anchor = point.position - 1;
    const limit = pagination.limit || 50;
    const target = { itemId: point.itemId, offset: anchor % limit, position: point.position, after };
    const page = Math.min(Math.floor(anchor / limit) + 1, pagination.totalPages || 1);
    // Opened now, while the click still counts as a user gesture, so the
    // popup blocker allows it even when the row is on a page still to load.
    openAmazonWindow('about:blank');
    if (page === pagination.page && items.length) {
      openListTarget(items, target);
      return;
    }
    pendingNavRef.current = target;
    setPagination((prev) => ({ ...prev, page }));
  };

  const resumeVerify = () => openListRow(resumePoint, { after: true });
  const openFirstLive = () => openListRow(liveRows?.first, { after: false });

  useEffect(() => {
    if (!pendingNavRef.current || !items.length) return;
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    if (typeof pending === 'object') {
      openListTarget(items, pending);
      return;
    }
    const targetIndex = pending === 'last' ? items.length - 1 : 0;
    handleVerify(items[targetIndex], targetIndex);
  }, [items]);

  const hasPrevVerifiable = verifyIndex > 0 || (verifyIndex > -1 && pagination.page > 1);
  const hasNextVerifiable = verifyIndex > -1 && (verifyIndex < items.length - 1 || pagination.page < pagination.totalPages);

  // Left/right arrow keys step through SKUs while the verify panel is open.
  useEffect(() => {
    if (!verifyOpen) return undefined;
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (reviseTarget || confirmEnd) return;
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
  }, [verifyOpen, verifyLoading, verifyIndex, items, pagination.page, pagination.totalPages, reviseTarget, confirmEnd]);

  const verifyRowNumber = verifyIndex > -1 ? ((pagination.page - 1) * pagination.limit) + verifyIndex + 1 : 0;
  const verifyProgress = pagination.total > 0 ? Math.min(100, (verifyRowNumber / pagination.total) * 100) : 0;
  const verifyItem = verifyIndex > -1 ? items[verifyIndex] : null;

  const toggleSelect = (item, row) => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (next.has(row.itemId)) next.delete(row.itemId);
      else next.set(row.itemId, { ...row, sku: item.sku, country: item.country });
      return next;
    });
  };

  // Ticks (or clears) every live listing of one SKU.
  const toggleSelectSku = (item) => {
    const live = (item.sellerItems || []).filter((row) => !isEnded(row));
    const allSelected = live.length > 0 && live.every((row) => selectedRows.has(row.itemId));
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const row of live) {
        if (allSelected) next.delete(row.itemId);
        else next.set(row.itemId, { ...row, sku: item.sku, country: item.country });
      }
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        for (const row of item.sellerItems || []) {
          if (!isEnded(row)) next.set(row.itemId, { ...row, sku: item.sku, country: item.country });
        }
      }
      return next;
    });
  };

  // Adds the listings with no orders in the last 90 days — the ones that are
  // usually safe to end outright; anything that sells is left for a decision.
  const selectNoOrdersOnPage = () => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        for (const row of item.sellerItems || []) {
          if (!isEnded(row) && !(row.orderCount90d > 0)) next.set(row.itemId, { ...row, sku: item.sku, country: item.country });
        }
      }
      return next;
    });
  };

  const endOne = async (row) => {
    await api.post('/ebay/end-item', {
      sellerId: row.sellerId,
      itemId: row.itemId,
      source: 'excluded_brand',
      sku: row.sku || '',
      country: row.country || '',
      run: activeRun?._id || ''
    });
    setEndedItems((prev) => ({
      ...prev,
      [row.itemId]: { endedAt: new Date().toISOString(), endedBy: currentUserName(), source: 'excluded_brand' }
    }));
    setFailedItems((prev) => {
      if (!prev[row.itemId]) return prev;
      const next = { ...prev };
      delete next[row.itemId];
      return next;
    });
    setSelectedRows((prev) => {
      if (!prev.has(row.itemId)) return prev;
      const next = new Map(prev);
      next.delete(row.itemId);
      return next;
    });
  };

  const performEnd = async (rows) => {
    setConfirmEnd(null);
    setError('');
    setSuccess('');
    const failures = [];
    setBulkProgress({ total: rows.length, done: 0 });
    for (const row of rows) {
      setEndingItemId(row.itemId);
      try {
        await endOne(row);
      } catch (err) {
        const reason = err.response?.data?.error || err.message || 'Failed to end item';
        failures.push(row.itemId);
        setFailedItems((prev) => ({ ...prev, [row.itemId]: reason }));
      }
      setBulkProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    setEndingItemId(null);
    setBulkProgress(null);
    if (failures.length < rows.length) refreshResumePoint();
    if (failures.length) {
      setError(`Ended ${rows.length - failures.length} of ${rows.length} listing(s); ${failures.length} failed — the reason is shown beside each one.`);
    } else {
      setSuccess(`Ended ${rows.length} listing(s).`);
    }
    if (activeRun?._id) await fetchExcluded(activeRun._id);
  };

  // ---- Revise (mirrors AmazonStockCheckPage) --------------------------------

  const openReviseDialog = (item, sellerItem) => {
    setReviseTarget({ item, sellerItem });
    setReviseForm({ title: sellerItem.title || '', price: sellerItem.price ?? '' });
    setReviseMode('manual');
    setReviseAsin('');
    setRevisePreview(null);
    setReviseReviewOpen(false);
  };

  // Only templates with ASIN automation switched on can generate listing
  // content. Fetched once per page visit, on first open of the dialog.
  useEffect(() => {
    if (!reviseTarget || reviseTemplates.length || reviseTemplatesLoading) return;
    setReviseTemplatesLoading(true);
    api.get('/listing-templates')
      .then(({ data: templateData }) => {
        const usable = (Array.isArray(templateData) ? templateData : [])
          .filter((template) => template.asinAutomation?.enabled)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setReviseTemplates(usable);
        if (usable.length === 1) setReviseTemplateId(usable[0]._id);
      })
      .catch((err) => {
        setReviseTemplates([]);
        setError(err.response?.data?.error || 'Could not load templates for the revise dialog.');
      })
      .finally(() => setReviseTemplatesLoading(false));
  }, [reviseTarget, reviseTemplates.length, reviseTemplatesLoading]);

  const markRevised = (itemId, info) => {
    setRevisedItems((prev) => ({
      ...prev,
      [itemId]: { revisedAt: new Date().toISOString(), revisedBy: currentUserName(), ...info }
    }));
  };

  const handleReviseListing = async () => {
    if (!reviseTarget) return;
    setError('');
    setSuccess('');
    setRevising(true);
    try {
      const { data: result } = await api.post('/amazon-stock-checks/revise-listing', {
        sellerId: reviseTarget.sellerItem.sellerId,
        itemId: reviseTarget.sellerItem.itemId,
        title: reviseForm.title,
        price: reviseForm.price,
        previousTitle: reviseTarget.sellerItem.title || '',
        previousPrice: reviseTarget.sellerItem.price ?? null,
        sku: reviseTarget.item?.sku || '',
        asin: reviseTarget.item?.asin || ''
      });
      markRevised(reviseTarget.sellerItem.itemId, {
        previousPrice: reviseTarget.sellerItem.price ?? null,
        newPrice: reviseForm.price !== '' ? Number(reviseForm.price) : null
      });
      setSuccess(result.message || `Revised item ${reviseTarget.sellerItem.itemId}`);
      setReviseTarget(null);
      if (activeRun?._id) await fetchExcluded(activeRun._id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to revise listing');
    } finally {
      setRevising(false);
    }
  };

  const handleGenerateRevisePreview = async () => {
    if (!reviseTarget) return;
    setError('');
    setSuccess('');
    setRevising(true);
    try {
      const { data: preview } = await api.post('/amazon-stock-checks/revise-listing/preview', {
        sellerId: reviseTarget.sellerItem.sellerId,
        itemId: reviseTarget.sellerItem.itemId,
        asin: reviseAsin.trim().toUpperCase(),
        templateId: reviseTemplateId,
        currency: reviseTarget.sellerItem.currency || reviseTarget.item?.currency || 'USD'
      });
      // The review modal drops items it considers unsaveable, so a failed
      // generation is reported here rather than opening an empty review.
      if (preview.errors?.length) {
        setError(`Could not generate a listing for ${preview.asin}: ${preview.errors.join('; ')}`);
        return;
      }
      setRevisePreview(preview);
      setReviseReviewOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to generate the revise preview');
    } finally {
      setRevising(false);
    }
  };

  // AsinReviewModal hands back an array; this flow only ever has one item in it.
  const handleApplyAsinRevise = async (listings) => {
    if (!reviseTarget || !revisePreview) return;
    const listing = listings?.[0];
    if (!listing) {
      setError('Nothing to revise — the generated listing was dismissed in the review.');
      setReviseReviewOpen(false);
      return;
    }
    setError('');
    setSuccess('');
    try {
      const { data: result } = await api.post('/amazon-stock-checks/revise-listing/apply', {
        sellerId: reviseTarget.sellerItem.sellerId,
        itemId: reviseTarget.sellerItem.itemId,
        asin: revisePreview.asin,
        // From the preview, not the picker: the two must not drift.
        templateId: revisePreview.templateId,
        listing
      });
      markRevised(reviseTarget.sellerItem.itemId, {
        previousPrice: revisePreview.before?.price ?? null,
        newPrice: listing.startPrice != null && listing.startPrice !== '' ? Number(listing.startPrice) : null
      });
      setReviseReviewOpen(false);
      setRevisePreview(null);
      setSuccess(result.message || `Revised item ${reviseTarget.sellerItem.itemId}`);
      setReviseTarget(null);
      if (activeRun?._id) await fetchExcluded(activeRun._id);
    } catch (err) {
      // Surfaced rather than swallowed: when eBay accepted the revise but the
      // row failed to save, this message is the only signal to reconcile it.
      setError(err.response?.data?.error || err.message || 'Failed to revise listing');
      setReviseReviewOpen(false);
    }
  };

  const selectedList = useMemo(
    () => Array.from(selectedRows.values()).filter((row) => !endedItems[row.itemId]),
    [selectedRows, endedItems]
  );
  const selectedSkuCount = useMemo(() => new Set(selectedList.map((row) => row.sku)).size, [selectedList]);

  const scannedCount = data?.scannedCount ?? 0;
  const shipperScannedCount = data?.shipperScannedCount ?? 0;
  const notAmazonCounts = data?.notAmazonCounts || {};
  const viewScannedCount = view === 'notAmazon' ? shipperScannedCount : scannedCount;
  const viewTotal = view === 'notAmazon' ? notAmazonCounts.all : counts.all;
  const checkedCount = activeRun?.checkedCount ?? 0;
  const activeFilterChips = [
    filters.brand && { key: 'brand', label: `Brand: ${(data?.brands || []).find((b) => b.key === filters.brand)?.display || filters.brand}` },
    filters.matchedOn && { key: 'matchedOn', label: MATCHED_ON_LABELS[filters.matchedOn] },
    filters.shipper && { key: 'shipper', label: SHIPPER_LABELS[filters.shipper] }
  ].filter(Boolean);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Stock Check Excluded Brands"
        subtitle="SKUs in an Amazon Stock Check run whose Amazon brand or seller is on the Excluded Brands list, or that Amazon doesn't ship — end or revise their listings here."
      />

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '50% !important', transform: 'translateY(-50%)' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSuccess('')} sx={{ minWidth: 320 }}>
          {success}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '50% !important', transform: 'translateY(-50%)' }}
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
              Narrow the cards and table below to SKUs one seller carries.
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

      {canRun && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Test run</Typography>
              <Typography variant="caption" color="text.secondary">
                Check a random sample of SKUs (with an ASIN) from one country for excluded brands and non-Amazon shippers.
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Country</Typography>
              <Select fullWidth size="small" value={testCurrency} onChange={(event) => setTestCurrency(event.target.value)}>
                {CURRENCY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label} ({option.value}, {option.credits} credit{option.credits > 1 ? 's' : ''})
                  </MenuItem>
                ))}
              </Select>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Number of SKUs</Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={testSkuCount}
                onChange={(event) => setTestSkuCount(event.target.value)}
                error={!testSkuValid}
                helperText={testSkuValid ? `~${formatNumber(testCredits)} credits` : `1 – ${formatNumber(TEST_RUN_MAX_SKUS)}`}
                inputProps={{ min: 1, max: TEST_RUN_MAX_SKUS }}
              />
            </Grid>
            <Grid item xs={6} md={4}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  variant="contained"
                  startIcon={startingTest ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                  onClick={handleStartTest}
                  disabled={!testSkuValid || startingTest}
                  sx={{ backgroundColor: BRAND_DARK }}
                >
                  Start test run
                </Button>
                {activeRun && ['queued', 'running', 'paused'].includes(activeRun.status) && (
                  <Button variant="outlined" color="error" startIcon={<StopCircleIcon />} onClick={handleCancelRun}>
                    Cancel run
                  </Button>
                )}
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      )}

      {activeRun && data && viewScannedCount === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {checkedCount === 0
            ? `No SKUs have been checked in this run yet. ${VIEW_LABELS[view]} SKUs appear here as the run checks them.`
            : view === 'notAmazon'
              ? 'This run was checked before stock checks recorded who ships each item, so it has nothing to show here. Runs started from now on (including test runs) will.'
              : 'This run was checked before stock checks recorded the Amazon brand, so it has nothing to match. Runs started from now on will show their excluded brands here.'}
        </Alert>
      )}
      {view === 'brands' && activeRun && data && scannedCount > 0 && data.blockListSize === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          The Excluded Brands list is empty. Add brands from the ASIN Precheck page&apos;s Excluded Brands dialog.
        </Alert>
      )}

      {activeRun && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_event, next) => changeView(next)}
          sx={{ mb: 1.5 }}
        >
          <ToggleButton value="brands" sx={{ fontWeight: 800, textTransform: 'none', px: 2 }}>
            {VIEW_LABELS.brands}{data ? ` (${formatNumber(counts.all || 0)})` : ''}
          </ToggleButton>
          <Tooltip title="Ships From is not Amazon, or Amazon showed none — the same rule as the ASIN Precheck's Not shipped by Amazon filter.">
            <ToggleButton value="notAmazon" sx={{ fontWeight: 800, textTransform: 'none', px: 2 }}>
              {VIEW_LABELS.notAmazon}{data ? ` (${formatNumber(notAmazonCounts.all || 0)})` : ''}
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      )}

      {activeRun && view === 'brands' && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={6} md={2}><KpiCard label="Run Status" value={activeRun.status} /></Grid>
          <Grid item xs={6} md={2}>
            <Tooltip title="SKUs in this run checked with the Amazon brand recorded, out of all SKUs checked so far.">
              <span><KpiCard label="Brand Scanned" value={`${formatNumber(scannedCount)} / ${formatNumber(checkedCount)}`} /></span>
            </Tooltip>
          </Grid>
          <Grid item xs={6} md={2}>
            <KpiCard label="Excluded Brand SKUs" value={counts.all || 0} tone="bad" active={!filters.matchedOn && !filters.brand} onClick={() => { setFilters(EMPTY_FILTERS); resetView(); }} />
          </Grid>
          <Grid item xs={6} md={2}><KpiCard label="Matched on Brand" value={counts.brand || 0} active={filters.matchedOn === 'brand'} onClick={() => setFilter('matchedOn', 'brand')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Matched on Seller" value={counts.soldBy || 0} active={filters.matchedOn === 'soldBy'} onClick={() => setFilter('matchedOn', 'soldBy')} /></Grid>
          <Grid item xs={6} md={2}><KpiCard label="Excluded Brands Found" value={(data?.brands || []).length} /></Grid>
        </Grid>
      )}

      {activeRun && view === 'notAmazon' && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={6} md={2}><KpiCard label="Run Status" value={activeRun.status} /></Grid>
          <Grid item xs={6} md={2}>
            <Tooltip title="SKUs in this run checked with Ships From recorded, out of all SKUs checked so far.">
              <span><KpiCard label="Shipper Scanned" value={`${formatNumber(shipperScannedCount)} / ${formatNumber(checkedCount)}`} /></span>
            </Tooltip>
          </Grid>
          <Grid item xs={6} md={2}>
            <KpiCard label="Not Shipped by Amazon" value={notAmazonCounts.all || 0} tone="bad" active={!filters.shipper} onClick={() => { setFilters(EMPTY_FILTERS); resetView(); }} />
          </Grid>
          <Grid item xs={6} md={3}>
            <Tooltip title="Ships From names someone other than Amazon.">
              <span><KpiCard label={SHIPPER_LABELS.thirdParty} value={notAmazonCounts.thirdParty || 0} active={filters.shipper === 'thirdParty'} onClick={() => setFilter('shipper', 'thirdParty')} /></span>
            </Tooltip>
          </Grid>
          <Grid item xs={6} md={3}>
            <Tooltip title="Amazon showed no Ships From line — usually an out-of-stock page with no buy box (see the Amazon Stock column). Nothing confirms Amazon ships it, so it counts as not Amazon.">
              <span><KpiCard label={SHIPPER_LABELS.unknown} value={notAmazonCounts.unknown || 0} active={filters.shipper === 'unknown'} onClick={() => setFilter('shipper', 'unknown')} /></span>
            </Tooltip>
          </Grid>
        </Grid>
      )}

      {view === 'brands' && (data?.brands || []).length > 0 && (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Excluded brands in this run</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {data.brands.map((brand) => (
              <Chip
                key={brand.key}
                label={`${brand.display} · ${formatNumber(brand.count)}`}
                onClick={() => setFilter('brand', brand.key)}
                color={filters.brand === brand.key ? 'error' : 'default'}
                variant={filters.brand === brand.key ? 'filled' : 'outlined'}
                sx={{ fontWeight: 800 }}
              />
            ))}
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ cursor: 'pointer' }}
          onClick={() => setRecentRunsOpen((prev) => !prev)}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Recent Runs</Typography>
            {activeRun && (
              <Chip
                color="primary"
                variant="outlined"
                label={`Active: ${getRunScope(activeRun)} · ${formatDateTime(activeRun.createdAt)}`}
                sx={{ fontWeight: 800, fontSize: '0.95rem', height: 34, borderWidth: 2 }}
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
                onClick={() => selectRun(run)}
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
                    <Chip size="small" variant="outlined" label={getRunMode(run)} sx={{ fontWeight: 800 }} />
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
            {!runs.length && (
              <Typography variant="body2" color="text.secondary">
                No runs yet — start one from the Amazon Stock Check page.
              </Typography>
            )}
          </Stack>
          <TablePagination
            component="div"
            count={runPagination.total || 0}
            page={Math.max(0, (runPagination.page || 1) - 1)}
            onPageChange={(_event, nextPage) => setRunPagination((prev) => ({ ...prev, page: nextPage + 1 }))}
            rowsPerPage={runPagination.limit || 20}
            onRowsPerPageChange={(event) => setRunPagination((prev) => ({
              ...prev,
              page: 1,
              limit: Number.parseInt(event.target.value, 10)
            }))}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Collapse>
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>Active filters</Typography>
        {activeFilterChips.length === 0 && <Chip size="small" label={`All ${VIEW_LABELS[view].toLowerCase()}`} sx={{ fontWeight: 800 }} />}
        {activeFilterChips.map((chip) => (
          <Chip
            key={chip.key}
            size="small"
            label={chip.label}
            onDelete={() => { setFilters((prev) => ({ ...prev, [chip.key]: EMPTY_FILTERS[chip.key] })); resetView(); }}
            sx={{ fontWeight: 800 }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <VerifyResumeButton
          resumePoint={resumePoint}
          live={liveRows}
          total={pagination.total}
          onResume={resumeVerify}
          onOpenFirstLive={openFirstLive}
          disabled={loadingItems || verifyLoading || Boolean(bulkProgress)}
        />
        <Button size="small" variant="outlined" onClick={selectNoOrdersOnPage} disabled={!items.length || Boolean(bulkProgress)}>
          Select no-order listings
        </Button>
        <Button size="small" variant="outlined" onClick={selectAllOnPage} disabled={!items.length || Boolean(bulkProgress)}>
          Select all on page
        </Button>
        {selectedList.length > 0 && (
          <Button size="small" variant="text" onClick={() => setSelectedRows(new Map())} disabled={Boolean(bulkProgress)}>
            Clear selection
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          color="error"
          startIcon={<StopCircleIcon />}
          disabled={!selectedList.length || Boolean(bulkProgress)}
          onClick={() => setConfirmEnd(selectedList)}
        >
          End selected ({formatNumber(selectedList.length)})
        </Button>
      </Stack>

      {bulkProgress && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 800 }}>
            Ending listings… {bulkProgress.done} / {bulkProgress.total}
          </Typography>
          <LinearProgress variant="determinate" value={(bulkProgress.done / bulkProgress.total) * 100} />
        </Box>
      )}

      <Box sx={{ position: 'relative' }}>
        {loadingItems && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 2
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ bgcolor: '#fff', px: 2, py: 1, borderRadius: 2, boxShadow: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                Loading items…
              </Typography>
            </Stack>
          </Box>
        )}
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ borderRadius: 2, opacity: loadingItems ? 0.55 : 1, transition: 'opacity 0.15s', pointerEvents: loadingItems ? 'none' : 'auto' }}
        >
          <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: '0 4px', backgroundColor: '#f8fafc' }}>
            <TableHead sx={{ background: BRAND_DARK }}>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>SKU</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>ASIN</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Country</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Flagged</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Amazon Brand / Seller / Shipper</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Amazon Stock</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Live Listings</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }}>Orders 90d / Lifetime</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 900 }} align="right">Verify</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => {
                const sellerItems = item.sellerItems || [];
                const liveRows = sellerItems.filter((row) => !isEnded(row));
                const orders90d = sellerItems.reduce((sum, row) => sum + (row.orderCount90d || 0), 0);
                const ordersLifetime = sellerItems.reduce((sum, row) => sum + (row.lifetimeOrderCount || 0), 0);
                const skuSelected = liveRows.length > 0 && liveRows.every((row) => selectedRows.has(row.itemId));
                const skuPartlySelected = !skuSelected && liveRows.some((row) => selectedRows.has(row.itemId));
                const palette = index % 2 === 0
                  ? { row: '#f8fbff', detail: '#eff6ff', rail: '#2563eb', line: '#bfdbfe' }
                  : { row: '#fffaf0', detail: '#fff7ed', rail: '#f97316', line: '#fed7aa' };
                const amazonUrl = getAmazonUrl(item);
                return (
                  <Fragment key={item._id}>
                    <TableRow
                      sx={{
                        backgroundColor: palette.row,
                        '& > td': {
                          borderTop: `1px solid ${palette.line}`,
                          borderBottom: `1px solid ${palette.line}`
                        },
                        '& > td:first-of-type': {
                          borderLeft: `4px solid ${palette.rail}`,
                          borderTopLeftRadius: 6
                        },
                        '& > td:last-of-type': { borderTopRightRadius: 6 }
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={skuSelected}
                          indeterminate={skuPartlySelected}
                          disabled={!liveRows.length || Boolean(bulkProgress)}
                          onChange={() => toggleSelectSku(item)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>{item.sku}</TableCell>
                      <TableCell>
                        {amazonUrl ? (
                          <Button
                            size="small"
                            variant="text"
                            endIcon={<OpenInNewIcon fontSize="inherit" />}
                            href={amazonUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ fontFamily: 'monospace', fontWeight: 800 }}
                          >
                            {item.asin}
                          </Button>
                        ) : (item.asin || '-')}
                      </TableCell>
                      <TableCell>{item.country}</TableCell>
                      <TableCell>
                        {/* Both flags, whichever view listed the SKU. */}
                        <Stack spacing={0.5} alignItems="flex-start">
                          {item.matchedBrand && (
                            <Chip size="small" color="error" label={item.matchedBrand} sx={{ fontWeight: 900 }} />
                          )}
                          {isNotShippedByAmazon(item) && (
                            <Chip
                              size="small"
                              color="secondary"
                              variant={view === 'notAmazon' ? 'filled' : 'outlined'}
                              label="Not shipped by Amazon"
                              sx={{ fontWeight: 800 }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 260 }}>
                        <Typography
                          variant="body2"
                          noWrap
                          title={item.amazonBrand || ''}
                          sx={{ fontWeight: item.matchedOn === 'brand' ? 900 : 400 }}
                        >
                          Brand: {item.amazonBrand || '-'}
                        </Typography>
                        <Typography
                          variant="caption"
                          noWrap
                          display="block"
                          title={item.amazonSoldBy || ''}
                          sx={{ fontWeight: item.matchedOn === 'soldBy' ? 900 : 400, color: item.matchedOn === 'soldBy' ? 'text.primary' : 'text.secondary' }}
                        >
                          Sold by: {item.amazonSoldBy || '-'}
                        </Typography>
                        {item.amazonShippedByAmazon !== undefined && (
                          <Typography
                            variant="caption"
                            noWrap
                            display="block"
                            title={item.amazonShipsFrom || ''}
                            sx={{
                              fontWeight: view === 'notAmazon' ? 900 : 400,
                              color: isNotShippedByAmazon(item) ? 'secondary.main' : 'text.secondary'
                            }}
                          >
                            Ships from: {item.amazonShipsFrom || 'not shown'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={statusColor(item.status)} label={STATUS_LABELS[item.status] || item.status} />
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>
                          {item.stockQuantity ?? (item.availabilityText || '-')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {formatNumber(liveRows.length)}
                        {sellerItems.length > liveRows.length && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {` (${formatNumber(sellerItems.length - liveRows.length)} ended)`}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={orders90d > 0 ? 'warning' : 'default'}
                          label={`${formatNumber(orders90d)} / ${formatNumber(ordersLifetime)}`}
                          sx={{ fontWeight: 800 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant={verifyOpen && verifyIndex === index ? 'contained' : 'outlined'}
                          startIcon={<FactCheckIcon />}
                          onClick={() => handleVerify(item, index)}
                        >
                          Verify
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        sx={{
                          p: 0,
                          border: 0,
                          borderLeft: `4px solid ${palette.rail}`,
                          backgroundColor: palette.detail,
                          borderBottom: `1px solid ${palette.line}`,
                          borderBottomLeftRadius: 6,
                          borderBottomRightRadius: 6
                        }}
                      >
                        <Box sx={{ px: 2, py: 1 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell padding="checkbox" />
                                <TableCell>Seller</TableCell>
                                <TableCell>Item ID</TableCell>
                                <TableCell>Title</TableCell>
                                <TableCell>Price</TableCell>
                                <TableCell>Orders</TableCell>
                                <TableCell align="right">Action</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {sellerItems.map((row) => {
                                const endedInfo = endedItems[row.itemId] || row.endedInfo;
                                const revisedInfo = revisedItems[row.itemId] || row.revisedInfo;
                                const busy = endingItemId === row.itemId;
                                const failReason = !endedInfo ? failedItems[row.itemId] : null;
                                return (
                                  <TableRow key={`${row.sellerId}-${row.itemId}`} sx={{ opacity: endedInfo ? 0.6 : 1 }}>
                                    <TableCell padding="checkbox">
                                      <Checkbox
                                        size="small"
                                        disabled={Boolean(endedInfo) || busy || Boolean(bulkProgress)}
                                        checked={selectedRows.has(row.itemId) && !endedInfo}
                                        onChange={() => toggleSelect(item, row)}
                                      />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>{row.sellerName}</TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 340 }}>
                                      <Typography variant="body2" noWrap title={row.title}>{row.title || '-'}</Typography>
                                      {endedInfo && (
                                        <Typography variant="caption" sx={{ display: 'block', color: 'error.main', fontWeight: 700 }}>
                                          Ended by {endedInfo.endedBy || 'unknown'} · {formatDateTime(endedInfo.endedAt)}{endedInfo.source && <> · from {endListingSourceLabel(endedInfo.source)}</>}
                                        </Typography>
                                      )}
                                      {revisedInfo && (
                                        <Typography variant="caption" sx={{ display: 'block', color: '#1d4ed8', fontWeight: 700 }}>
                                          Revised by {revisedInfo.revisedBy || 'unknown'} · {formatDateTime(revisedInfo.revisedAt)}
                                          {revisedInfo.previousPrice != null && revisedInfo.newPrice != null
                                            ? ` · ${revisedInfo.previousPrice} → ${revisedInfo.newPrice} ${row.currency || ''}`
                                            : ''}
                                        </Typography>
                                      )}
                                      {failReason && (
                                        <Typography variant="caption" sx={{ display: 'block', color: 'error.main', fontWeight: 700 }}>
                                          End failed: {failReason}
                                        </Typography>
                                      )}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                      {row.price != null ? `${row.price} ${row.currency || ''}` : '-'}
                                    </TableCell>
                                    <TableCell>
                                      <Stack direction="row" spacing={0.75} alignItems="center">
                                        <Tooltip title="Orders in the last 30 days">
                                          <Chip size="small" variant="outlined" label={`${formatNumber(row.orderCount30d)} / 30d`} sx={{ fontWeight: 800 }} />
                                        </Tooltip>
                                        <Chip
                                          size="small"
                                          color={row.orderCount90d > 0 ? 'warning' : 'default'}
                                          label={`${formatNumber(row.orderCount90d)} / 90d`}
                                          sx={{ fontWeight: 800 }}
                                        />
                                        <Chip size="small" variant="outlined" label={`${formatNumber(row.lifetimeOrderCount)} lifetime`} sx={{ fontWeight: 800 }} />
                                        <OrderSparkline monthly={row.monthlyOrders} />
                                      </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                      {endedInfo ? (
                                        <Chip size="small" color="error" label="Ended" sx={{ fontWeight: 800 }} />
                                      ) : (
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<EditIcon />}
                                            disabled={busy || Boolean(bulkProgress)}
                                            onClick={() => openReviseDialog(item, row)}
                                          >
                                            Revise
                                          </Button>
                                          <Button
                                            size="small"
                                            color="error"
                                            variant="outlined"
                                            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <StopCircleIcon />}
                                            disabled={busy || Boolean(bulkProgress)}
                                            onClick={() => setConfirmEnd([{ ...row, sku: item.sku, country: item.country }])}
                                          >
                                            End Listing
                                          </Button>
                                        </Stack>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {!sellerItems.length && (
                                <TableRow>
                                  <TableCell colSpan={7} sx={{ color: 'text.secondary' }}>No item IDs recorded for this SKU.</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </Box>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    {loadingItems
                      ? 'Loading items…'
                      : !activeRun
                        ? 'Start a run from the Amazon Stock Check page to see results.'
                        : viewTotal
                          ? 'No rows match the selected filters.'
                          : view === 'notAmazon'
                            ? (isRunning
                              ? 'No SKUs found yet that Amazon doesn’t ship — the run is still checking.'
                              : shipperScannedCount
                                ? 'Every checked SKU in this run ships from Amazon.'
                                : 'This run has no shipper data.')
                            : (isRunning
                              ? 'No excluded brands found yet — the run is still checking.'
                              : 'No excluded brands found in this run.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={pagination.total || 0}
            page={Math.max(0, (pagination.page || 1) - 1)}
            onPageChange={(_event, nextPage) => setPagination((prev) => ({ ...prev, page: nextPage + 1 }))}
            rowsPerPage={pagination.limit || 50}
            onRowsPerPageChange={(event) => {
              setPagination((prev) => ({ ...prev, page: 1, limit: Number.parseInt(event.target.value, 10) }));
            }}
            rowsPerPageOptions={[25, 50, 100, 200]}
          />
        </TableContainer>
      </Box>

      <Drawer
        anchor="right"
        variant="persistent"
        open={verifyOpen}
        PaperProps={{
          sx: {
            // The admin AppBar uses zIndex.drawer + 1, so go one higher or it
            // covers this panel's header.
            // Set on the Paper: a persistent drawer's Paper is the fixed
            // element, so a z-index on the Drawer root has no effect.
            zIndex: (theme) => theme.zIndex.drawer + 2,
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
                {verifyData?.sku || verifyItem?.sku || ''}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {verifyIndex > -1 ? `${formatNumber(verifyRowNumber)} of ${formatNumber(pagination.total)}` : '-'}
                {' '}&middot; {VIEW_LABELS[view]}
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
            {verifyItem?.matchedBrand && (
              <Tooltip title={`${MATCHED_ON_LABELS[verifyItem.matchedOn]} — Brand: ${verifyItem.amazonBrand || '-'} · Sold by: ${verifyItem.amazonSoldBy || '-'}`}>
                <Chip size="small" color="error" label={verifyItem.matchedBrand} sx={{ fontWeight: 900 }} />
              </Tooltip>
            )}
            {isNotShippedByAmazon(verifyItem) && (
              <Tooltip title={`Ships from: ${verifyItem.amazonShipsFrom || 'not shown'} · Sold by: ${verifyItem.amazonSoldBy || '-'}`}>
                <Chip size="small" color="secondary" label="Not shipped by Amazon" sx={{ fontWeight: 800 }} />
              </Tooltip>
            )}
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
              <Button size="small" variant="outlined" endIcon={<OpenInNewIcon />} onClick={() => openAmazonWindow(verifyData.amazonUrl)}>
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
          {/* The same selection as the table: auto-ticked no-order SKUs plus
              anything ticked by hand, across every SKU visited. */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
              {selectedList.length
                ? `${formatNumber(selectedList.length)} listing(s) selected across ${formatNumber(selectedSkuCount)} SKU(s)`
                : 'Nothing selected yet'}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" disabled={!selectedList.length || Boolean(bulkProgress)} onClick={() => setSelectedRows(new Map())}>
              Clear All
            </Button>
            <Button
              size="small"
              color="error"
              variant="contained"
              disabled={!selectedList.length || Boolean(bulkProgress)}
              startIcon={bulkProgress ? <CircularProgress size={14} color="inherit" /> : <StopCircleIcon />}
              onClick={() => setConfirmEnd(selectedList)}
            >
              End Selected ({formatNumber(selectedList.length)})
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
            <SellerItemsSection
              rows={getVisibleSellerItems(verifyData.sellerItems || [])}
              currentSku={verifyData.sku}
              images={verifyImages}
              endedItems={endedItems}
              revisedItems={revisedItems}
              failedItems={failedItems}
              endingItemId={endingItemId}
              busy={Boolean(bulkProgress)}
              selectedIds={selectedRows}
              onToggleSelect={(row) => toggleSelect({ sku: row.sku || verifyData.sku, country: verifyData.country }, row)}
              onEndItem={(row) => setConfirmEnd([{ ...row, sku: row.sku || verifyData.sku, country: verifyData.country }])}
              onReviseItem={(row) => openReviseDialog({ sku: verifyData.sku, asin: verifyData.asin, currency: verifyData.currency }, row)}
            />
          )}
        </Box>
      </Drawer>

      <Dialog open={Boolean(confirmEnd)} onClose={() => setConfirmEnd(null)} fullWidth maxWidth="sm">
        <DialogTitle>End {formatNumber(confirmEnd?.length || 0)} listing(s)?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            These eBay listings will be ended. This can&apos;t be undone from here.
          </Typography>
          <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {(confirmEnd || []).slice(0, 100).map((row) => (
              <Typography key={row.itemId} variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                {row.itemId} · {row.sellerName || '-'} · {row.sku} · {formatNumber(row.orderCount90d)} orders / 90d
              </Typography>
            ))}
            {(confirmEnd?.length || 0) > 100 && (
              <Typography variant="caption" color="text.secondary">
                …and {formatNumber(confirmEnd.length - 100)} more
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEnd(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<StopCircleIcon />} onClick={() => performEnd(confirmEnd)}>
            End listing(s)
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!reviseTarget} onClose={() => setReviseTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revise Listing</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              value={reviseMode}
              onChange={(event, next) => { if (next) setReviseMode(next); }}
            >
              <ToggleButton value="manual">Edit title &amp; price</ToggleButton>
              <ToggleButton value="asin">Revise to a new ASIN</ToggleButton>
            </ToggleButtonGroup>

            {reviseMode === 'manual' ? (
              <>
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
              </>
            ) : (
              <>
                <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
                  eBay item <strong>{reviseTarget?.sellerItem?.itemId}</strong> keeps its item ID. Its SKU,
                  title, description, price, images and item specifics are replaced with the new ASIN&apos;s,
                  and the new ASIN is saved as its own listing. The current details stay in the database.
                </Alert>

                <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Currently listed</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{reviseTarget?.sellerItem?.title || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {reviseTarget?.item?.sku || reviseTarget?.sellerItem?.sku || '—'}
                    {reviseTarget?.item?.asin ? ` · ${reviseTarget.item.asin}` : ''}
                    {reviseTarget?.sellerItem?.price != null
                      ? ` · ${reviseTarget.sellerItem.price} ${reviseTarget.sellerItem.currency || ''}`
                      : ''}
                  </Typography>
                </Box>

                <TextField
                  label="Seller"
                  value={reviseTarget?.sellerItem?.sellerName || ''}
                  InputProps={{ readOnly: true }}
                  helperText="Detected from the listing"
                  fullWidth
                />
                <TextField
                  label="New ASIN"
                  value={reviseAsin}
                  onChange={(event) => setReviseAsin(event.target.value.toUpperCase())}
                  placeholder="B0XXXXXXXX"
                  inputProps={{ maxLength: 10 }}
                  fullWidth
                />
                <Autocomplete
                  options={reviseTemplates}
                  loading={reviseTemplatesLoading}
                  disabled={reviseTemplatesLoading || !reviseTemplates.length}
                  value={reviseTemplates.find((template) => template._id === reviseTemplateId) || null}
                  onChange={(event, next) => setReviseTemplateId(next?._id || '')}
                  getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option._id === value._id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Template"
                      placeholder="Type to search…"
                      helperText={
                        reviseTemplatesLoading
                          ? 'Loading templates…'
                          : (reviseTemplates.length
                            ? 'Generates the eBay fields from this template'
                            : 'No templates have ASIN automation enabled')
                      }
                    />
                  )}
                  fullWidth
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviseTarget(null)}>Cancel</Button>
          {reviseMode === 'manual' ? (
            <Button
              variant="contained"
              onClick={handleReviseListing}
              disabled={revising}
              startIcon={revising ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ backgroundColor: BRAND_DARK }}
            >
              Save
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleGenerateRevisePreview}
              disabled={revising || reviseAsin.trim().length !== 10 || !reviseTemplateId}
              startIcon={revising ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ backgroundColor: BRAND_DARK }}
            >
              {revising ? 'Generating…' : 'Generate from ASIN'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Step two of an ASIN revise: the same review surface the ASIN Precheck
          flow uses, so a revised listing is edited exactly like a new one. */}
      <AsinReviewModal
        flagSource="stock-check-excluded-brands"
        open={reviseReviewOpen}
        onClose={() => setReviseReviewOpen(false)}
        marketplace={revisePreview?.region || 'US'}
        sellerId={reviseTarget?.sellerItem?.sellerId || null}
        templateName={reviseTemplates.find((t) => t._id === reviseTemplateId)?.name || ''}
        templateId={reviseTemplateId || null}
        previewItems={revisePreview ? [{
          id: `revise-${revisePreview.itemId}`,
          asin: revisePreview.asin,
          sku: revisePreview.newSku,
          sourceData: revisePreview.sourceData,
          generatedListing: { ...revisePreview.after, customLabel: revisePreview.newSku },
          pricingCalculation: revisePreview.pricingCalculation,
          warnings: revisePreview.warnings || [],
          errors: revisePreview.errors || [],
          progressStage: 'complete',
          status: revisePreview.errors?.length ? 'error' : (revisePreview.warnings?.length ? 'warning' : 'success')
        }] : []}
        onSave={handleApplyAsinRevise}
        templateColumns={[
          ...(revisePreview?.templateColumns || []).map((col) => ({ ...col, type: 'custom' })),
          { name: 'title', label: 'Title', type: 'core' },
          { name: 'description', label: 'Description', type: 'core' },
          { name: 'startPrice', label: 'Start Price', type: 'core' },
          { name: 'quantity', label: 'Quantity', type: 'core' }
        ]}
      />
    </Box>
  );
}
