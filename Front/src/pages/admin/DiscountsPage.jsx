import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  AlertTitle,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Tooltip,
  Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell';
import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import StatMetricCard from '../../components/StatMetricCard';
import StatusChip from '../../components/StatusChip';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme';
import { dashboardSignatureTokens } from '../../theme/appTheme';
import {
  tableHeaderCellSx,
  tableBodyRowSx,
  tableBodyCellSx,
  tableContainerSx,
} from '../../theme/tableStyles';

// ─── Enum → display mappings ──────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'RUNNING', label: 'Active' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ALL', label: 'All statuses' },
];

const STATUS_TONES = {
  RUNNING: 'success',
  SCHEDULED: 'info',
  PAUSED: 'warning',
  ENDED: 'neutral',
  DRAFT: 'neutral',
};

const STATUS_LABELS = {
  RUNNING: 'Active',
  SCHEDULED: 'Scheduled',
  PAUSED: 'Paused',
  ENDED: 'Ended',
  DRAFT: 'Draft',
};

// Only coupons and sale events are shown — volume pricing and order
// discounts are intentionally excluded from this page.
const PAGE_TYPES = 'CODED_COUPON,MARKDOWN_SALE';

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'Coupons & Sale events' },
  { value: 'CODED_COUPON', label: 'Coupon' },
  { value: 'MARKDOWN_SALE', label: 'Sale event' },
];

const TYPE_LABELS = {
  CODED_COUPON: 'Coupon',
  MARKDOWN_SALE: 'Sale event',
  ORDER_DISCOUNT: 'Order discount',
  VOLUME_DISCOUNT: 'Volume pricing',
};

const URGENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Render dates in Pacific Time to match eBay Seller Hub (shows PDT/PST as appropriate)
const formatDate = (d) =>
  d
    ? new Date(d).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      })
    : '—';

// Ends within the next 3 days (but not already past)
const isEndingSoon = (endDate) => {
  if (!endDate) return false;
  const diff = new Date(endDate).getTime() - Date.now();
  return diff > 0 && diff <= URGENT_WINDOW_MS;
};

// ─── Format a DiscountBenefit / DiscountSpecification node into readable text ─
const formatBenefit = (b) => {
  if (!b) return null;
  const parts = [];
  if (b.percentageOffItem) parts.push(`${b.percentageOffItem}% off each item`);
  if (b.percentageOffOrder) parts.push(`${b.percentageOffOrder}% off order`);
  if (b.amountOffItem?.value) parts.push(`${b.amountOffItem.currency || ''} ${b.amountOffItem.value} off each item`);
  if (b.amountOffOrder?.value) parts.push(`${b.amountOffOrder.currency || ''} ${b.amountOffOrder.value} off order`);
  return parts.join(', ') || null;
};

const formatCriterion = (c) => {
  if (!c) return null;
  const parts = [];
  if (c.minAmount?.value) parts.push(`min spend ${c.minAmount.currency || ''} ${c.minAmount.value}`);
  if (c.minQuantity) parts.push(`min quantity ${c.minQuantity}`);
  if (c.numberOfDiscountedItems) parts.push(`${c.numberOfDiscountedItems} discounted item(s)`);
  if (c.forEachQuantity) parts.push(`for each ${c.forEachQuantity} item(s)`);
  if (c.forEachAmount?.value) parts.push(`for each ${c.forEachAmount.currency || ''} ${c.forEachAmount.value} spent`);
  return parts.join(', ') || null;
};

// ─── Detail row helper ────────────────────────────────────────────────────────
function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Stack direction="row" spacing={1} sx={{ py: 0.4 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 170, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Stack>
  );
}

// ─── Discount Details Dialog ──────────────────────────────────────────────────
function DetailsDialog({ open, discount, detail, loading, error, onClose }) {
  const full = detail || discount || {};
  const rules = full.discountRules || [];
  const inventory = full.inventoryCriterion || {};
  const listingIds = inventory.listingIds || [];
  const inventoryItems = inventory.inventoryItems || [];
  const ruleCriteria = inventory.inventoryCriterion?.selectionRules || inventory.ruleCriteria;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, bgcolor: BRAND_DARK, color: '#fff' }}>
        Discount Details
        {discount && (
          <Typography variant="body2" sx={{ color: alpha('#fff', 0.7), mt: 0.5, fontWeight: 400 }}>
            {discount.sellerName ? `${discount.sellerName} — ` : ''}{discount.name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={36} sx={{ color: BRAND_YELLOW_DARK }} />
          </Box>
        ) : (
          <>
            {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

            {/* ── General ── */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>General</Typography>
            <Box sx={{ p: 1.5, bgcolor: alpha(BRAND_YELLOW, 0.08), borderRadius: 1.5, mb: 2 }}>
              <DetailRow label="Seller" value={discount?.sellerName} />
              <DetailRow label="Discount ID" value={full.promotionId || discount?.promotionId} />
              <DetailRow label="Name" value={full.name || discount?.name} />
              <DetailRow label="Description" value={full.description || discount?.description} />
              <DetailRow
                label="Type"
                value={TYPE_LABELS[full.promotionType || discount?.promotionType] || full.promotionType || discount?.promotionType}
              />
              <DetailRow
                label="Status"
                value={
                  <StatusChip
                    label={STATUS_LABELS[full.promotionStatus || discount?.promotionStatus] || full.promotionStatus || discount?.promotionStatus || '—'}
                    tone={STATUS_TONES[full.promotionStatus || discount?.promotionStatus] || 'neutral'}
                  />
                }
              />
              <DetailRow label="Marketplace" value={full.marketplaceId || discount?.marketplaceId} />
              <DetailRow label="Start date" value={formatDate(full.startDate || discount?.startDate)} />
              <DetailRow label="End date" value={formatDate(full.endDate || discount?.endDate)} />
              <DetailRow label="Priority" value={full.priority || discount?.priority} />
              <DetailRow label="Coupon code" value={full.couponConfiguration?.couponCode || discount?.couponCode} />
              <DetailRow label="Coupon type" value={full.couponConfiguration?.couponType || discount?.couponType} />
              <DetailRow
                label="Max redemptions/user"
                value={full.couponConfiguration?.maxCouponRedemptionPerUser ?? discount?.maxCouponRedemptionPerUser}
              />
              <DetailRow
                label="Budget"
                value={
                  full.budget?.value || discount?.budget
                    ? `${(full.budget || discount?.budget)?.currency || ''} ${(full.budget || discount?.budget)?.value}`
                    : null
                }
              />
            </Box>

            {/* ── Discount rules ── */}
            {rules.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Discount Rules ({rules.length})
                </Typography>
                <Stack spacing={1} sx={{ mb: 2 }}>
                  {rules.map((rule, idx) => (
                    <Box key={idx} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                      <DetailRow label="Rule order" value={rule.ruleOrder ?? idx + 1} />
                      <DetailRow label="Benefit" value={formatBenefit(rule.discountBenefit)} />
                      <DetailRow label="Condition" value={formatCriterion(rule.discountCriterion)} />
                      <DetailRow label="Max discount" value={rule.maxDiscountAmount?.value ? `${rule.maxDiscountAmount.currency || ''} ${rule.maxDiscountAmount.value}` : null} />
                    </Box>
                  ))}
                </Stack>
              </>
            )}

            {/* ── Inventory scope ── */}
            {detail && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Items in Discount</Typography>
                <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, mb: 2 }}>
                  <DetailRow label="Selection mode" value={inventory.inventoryCriterionType} />
                  {listingIds.length > 0 && (
                    <DetailRow
                      label={`Listing IDs (${listingIds.length})`}
                      value={
                        <Box sx={{ maxHeight: 140, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {listingIds.join(', ')}
                        </Box>
                      }
                    />
                  )}
                  {inventoryItems.length > 0 && (
                    <DetailRow
                      label={`Inventory items (${inventoryItems.length})`}
                      value={
                        <Box sx={{ maxHeight: 140, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {inventoryItems.map((i) => i.inventoryReferenceId || i.sku || JSON.stringify(i)).join(', ')}
                        </Box>
                      }
                    />
                  )}
                  {ruleCriteria && (
                    <DetailRow
                      label="Selection rules"
                      value={
                        <Box component="pre" sx={{ m: 0, maxHeight: 180, overflow: 'auto', fontSize: '0.75rem' }}>
                          {JSON.stringify(ruleCriteria, null, 2)}
                        </Box>
                      }
                    />
                  )}
                  {!inventory.inventoryCriterionType && listingIds.length === 0 && inventoryItems.length === 0 && !ruleCriteria && (
                    <Typography variant="body2" color="text.secondary">
                      No item-selection details returned for this discount.
                    </Typography>
                  )}
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* ── Raw response for anything not surfaced above ── */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Raw Response</Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? alpha('#fff', 0.05) : alpha(BRAND_DARK, 0.04)),
                    borderRadius: 1.5,
                    maxHeight: 260,
                    overflow: 'auto',
                    fontSize: '0.72rem',
                  }}
                >
                  {JSON.stringify(detail, null, 2)}
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: BRAND_DARK, fontWeight: 700 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DiscountsPage() {
  const [status, setStatus] = useState('RUNNING');
  const [type, setType] = useState('ALL');
  const [search, setSearch] = useState('');

  // One entry per seller: { sellerId, sellerName, discounts, total, error }
  const [results, setResults] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(false);

  // Details dialog
  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  // ── Fetch discounts for ALL sellers ─────────────────────────────────────────
  // The default Active view reads the server's 12-hour cache — opening the
  // page never calls eBay. Other statuses need a live fetch (the cache only
  // holds active discounts). "Refresh All" forces a live re-fetch; on the
  // Active view that also updates the shared cache, so the bell benefits too.
  const fetchAll = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const { data } =
        status === 'RUNNING'
          ? await api.get('/ebay/discounts/cached', {
              params: forceRefresh ? { refresh: 'true' } : {},
            })
          : await api.get('/ebay/discounts/all', {
              params: {
                status: status !== 'ALL' ? status : undefined,
                // coupons + sale events only, never volume/order discounts
                types: PAGE_TYPES,
                sort: '-START_DATE',
              },
            });
      setResults(data.results || []);
      setFetchedAt(data.fetchedAt || new Date().toISOString());
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message;
      setError(`Failed to load discounts: ${msg}`);
      setResults([]);
      setFetchedAt(null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Flatten per-seller results into table rows, urgent + soonest-ending first ─
  // The type filter is applied here, client-side — switching Coupon/Sale event
  // never re-fetches, since both types are already loaded.
  const rows = useMemo(() => {
    const flat = results.flatMap((r) =>
      (r.discounts || []).map((d) => ({ ...d, sellerId: r.sellerId, sellerName: r.sellerName }))
    );
    const typed = type === 'ALL' ? flat : flat.filter((d) => d.promotionType === type);
    typed.sort((a, b) => {
      const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return aEnd - bEnd;
    });
    return typed;
  }, [results, type]);

  const failedSellers = useMemo(() => results.filter((r) => r.error), [results]);

  // ── Client-side search across seller, name, coupon code, ID ────────────────
  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.trim().toLowerCase();
    return rows.filter(
      (d) =>
        (d.sellerName || '').toLowerCase().includes(term) ||
        (d.name || '').toLowerCase().includes(term) ||
        (d.couponCode || '').toLowerCase().includes(term) ||
        (d.promotionId || '').toLowerCase().includes(term)
    );
  }, [rows, search]);

  // ── Fetch full details when a discount is opened ────────────────────────────
  const openDetails = async (row) => {
    setDetailTarget(row);
    setDetail(null);
    setDetailError('');
    if (!row.promotionHref) {
      setDetailError('No details link (promotionHref) available for this discount.');
      return;
    }
    setDetailLoading(true);
    try {
      const { data } = await api.get('/ebay/discounts/detail', {
        params: { sellerId: row.sellerId, href: row.promotionHref },
      });
      setDetail(data.discount || null);
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message;
      setDetailError(`Could not load full details: ${msg}. Showing summary fields only.`);
    } finally {
      setDetailLoading(false);
    }
  };

  const copyCouponCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // ── Stat cards ──────────────────────────────────────────────────────────────
  const statCards = useMemo(() => {
    const urgentCount = rows.filter((d) => isEndingSoon(d.endDate)).length;
    return [
      { label: 'Sellers Checked', value: results.length, tone: results.length > 0 ? 'info' : 'neutral' },
      { label: 'Discounts Found', value: rows.length, tone: rows.length > 0 ? 'success' : 'neutral' },
      { label: 'Ending ≤ 3 Days', value: urgentCount, tone: urgentCount > 0 ? 'danger' : 'neutral' },
      { label: 'Sellers Failed', value: failedSellers.length, tone: failedSellers.length > 0 ? 'danger' : 'neutral' },
    ];
  }, [results, rows, failedSellers]);

  const indexBadgeSx = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: dashboardSignatureTokens.table.indexBadgeBackground,
    color: dashboardSignatureTokens.table.indexBadgeForeground,
    fontWeight: 700,
    fontSize: '0.875rem',
  };

  return (
    <AdminPageShell>
      {/* ── Header Card ── */}
      <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }} gap={2.5}>
          <Box>
            <PageHeader
              title="Discounts"
              subtitle="eBay discounts (promotions) across all sellers — coupons, sale events, order and volume discounts."
              sx={{ pt: 0, pb: 0 }}
            />
            {fetchedAt && !loading && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Last refreshed: {new Date(fetchedAt).toLocaleString()}
              </Typography>
            )}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" sx={{ width: { xs: '100%', lg: 'auto' } }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Type</InputLabel>
              <Select value={type} label="Type" onChange={(e) => setType(e.target.value)}>
                {TYPE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Search"
              placeholder="Seller, name, coupon code, ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.secondary' }} /> }}
              sx={{ minWidth: 210 }}
            />
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RefreshIcon />}
              onClick={() => fetchAll(true)}
              disabled={loading}
              sx={{
                bgcolor: BRAND_DARK, color: '#fff', fontWeight: 700, minHeight: 40,
                '&:hover': { bgcolor: alpha(BRAND_DARK, 0.82) },
                '&.Mui-disabled': { color: alpha('#fff', 0.35), bgcolor: alpha(BRAND_DARK, 0.38) },
              }}
            >
              {loading ? 'Refreshing…' : 'Refresh All'}
            </Button>
          </Stack>
        </Stack>

        {/* ── Stat cards ── */}
        {!loading && (
          <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1.5 }}>
            {statCards.map((card) => (
              <StatMetricCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
            ))}
          </Box>
        )}
      </SectionCard>

      {/* ── Whole-request error ── */}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Per-seller fetch errors ── */}
      {!loading && failedSellers.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle sx={{ fontWeight: 700 }}>
            Could not fetch discounts for {failedSellers.length} seller{failedSellers.length > 1 ? 's' : ''}
          </AlertTitle>
          <Stack spacing={0.5}>
            {failedSellers.map((r) => (
              <Typography key={r.sellerId} variant="body2">
                <b>{r.sellerName}:</b> {r.error}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {/* ── Discounts table ── */}
      <TableContainer component={Paper} sx={tableContainerSx}>
        <Table size="small" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={tableHeaderCellSx} align="center">#</TableCell>
              <TableCell sx={tableHeaderCellSx}>Seller</TableCell>
              <TableCell sx={tableHeaderCellSx}>Name</TableCell>
              <TableCell sx={tableHeaderCellSx}>Status</TableCell>
              <TableCell sx={tableHeaderCellSx}>Type</TableCell>
              <TableCell sx={tableHeaderCellSx}>Coupon Code</TableCell>
              <TableCell sx={tableHeaderCellSx}>Start Date</TableCell>
              <TableCell sx={tableHeaderCellSx}>End Date</TableCell>
              <TableCell sx={tableHeaderCellSx}>Priority</TableCell>
              <TableCell sx={{ ...tableHeaderCellSx, textAlign: 'center' }}>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 7 }}>
                  <CircularProgress size={36} sx={{ color: BRAND_YELLOW_DARK }} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Fetching discounts for all sellers…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  {search
                    ? 'No discounts match your search.'
                    : `No ${status === 'ALL' ? '' : (STATUS_LABELS[status] || status).toLowerCase() + ' '}discounts found across ${results.length} seller(s).`}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((d, idx) => {
                const urgent = isEndingSoon(d.endDate);
                return (
                  <TableRow key={`${d.sellerId}-${d.promotionId || idx}`} sx={tableBodyRowSx}>
                    <TableCell sx={tableBodyCellSx} align="center">
                      <Box component="span" sx={indexBadgeSx}>{idx + 1}</Box>
                    </TableCell>

                    {/* Seller */}
                    <TableCell sx={{ ...tableBodyCellSx, maxWidth: 150 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{d.sellerName}</Typography>
                    </TableCell>

                    {/* Name */}
                    <TableCell sx={{ ...tableBodyCellSx, maxWidth: 260 }}>
                      <Tooltip title={d.name || ''} placement="top" arrow>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240, display: 'block' }}>
                          {d.name || d.promotionId}
                        </Typography>
                      </Tooltip>
                      {d.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240, display: 'block' }}>
                          {d.description}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell sx={tableBodyCellSx}>
                      <StatusChip label={STATUS_LABELS[d.promotionStatus] || d.promotionStatus || '—'} tone={STATUS_TONES[d.promotionStatus] || 'neutral'} />
                    </TableCell>

                    {/* Type */}
                    <TableCell sx={tableBodyCellSx}>
                      <Typography variant="body2">{TYPE_LABELS[d.promotionType] || d.promotionType || '—'}</Typography>
                    </TableCell>

                    {/* Coupon Code */}
                    <TableCell sx={tableBodyCellSx}>
                      {d.couponCode ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>
                            {d.couponCode}
                          </Typography>
                          <Tooltip title={copiedCode === d.couponCode ? 'Copied!' : 'Copy code'} arrow>
                            <IconButton size="small" onClick={() => copyCouponCode(d.couponCode)} sx={{ p: 0.3 }}>
                              <ContentCopyIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </TableCell>

                    {/* Start Date */}
                    <TableCell sx={{ ...tableBodyCellSx, whiteSpace: 'nowrap' }}>{formatDate(d.startDate)}</TableCell>

                    {/* End Date + urgent chip */}
                    <TableCell sx={{ ...tableBodyCellSx, whiteSpace: 'nowrap' }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" sx={urgent ? { fontWeight: 700, color: 'error.main' } : undefined}>
                          {formatDate(d.endDate)}
                        </Typography>
                        {urgent && (
                          <Tooltip title="Ends within 3 days" arrow>
                            <Box component="span">
                              <StatusChip label="URGENT" tone="danger" />
                            </Box>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>

                    {/* Priority */}
                    <TableCell sx={tableBodyCellSx}>
                      <Typography variant="body2">{d.priority ? d.priority.replace('PRIORITY_', 'P') : '—'}</Typography>
                    </TableCell>

                    {/* Details */}
                    <TableCell sx={{ ...tableBodyCellSx, textAlign: 'center' }}>
                      <Tooltip title="View full discount details" arrow>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<VisibilityOutlinedIcon sx={{ fontSize: '14px !important' }} />}
                          onClick={() => openDetails(d)}
                          sx={{ bgcolor: BRAND_DARK, color: '#fff', fontWeight: 700, fontSize: '0.72rem', px: 1.2, py: 0.4, borderRadius: 1, '&:hover': { bgcolor: alpha(BRAND_DARK, 0.82) } }}
                        >
                          View
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Details Dialog ── */}
      <DetailsDialog
        open={Boolean(detailTarget)}
        discount={detailTarget}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => { setDetailTarget(null); setDetail(null); setDetailError(''); }}
      />
    </AdminPageShell>
  );
}
