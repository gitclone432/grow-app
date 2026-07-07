import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  Link,
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
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';
import GrowMentalityLoader from '../../components/GrowMentalityLoader.jsx';
import CreateItemPromotionDialog from '../../components/marketing/CreateItemPromotionDialog.jsx';
import UpdateItemPromotionDialog from '../../components/marketing/UpdateItemPromotionDialog.jsx';
import { canDeletePromotion, canEditPromotion } from '../../utils/itemPromotionUtils';

const EBAY_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/promotion/methods/getPromotions';

const CREATE_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/createItemPromotion';

const UPDATE_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/updateItemPromotion';

const DELETE_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/deleteItemPromotion';

const ALL_STORES_VALUE = '__all__';
const ALL_MARKETPLACES_VALUE = '__all__';
const ALL_STORES_PER_SELLER_LIMIT = 50;

const MARKETPLACES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE'];
const PAGE_SIZES = [25, 50, 100, 200];

const PROMOTION_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'DRAFT', label: 'Draft' },
];

const PROMOTION_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'CODED_COUPON', label: 'Coded coupon' },
  { value: 'MARKDOWN_SALE', label: 'Markdown sale' },
  { value: 'ORDER_DISCOUNT', label: 'Order discount' },
  { value: 'VOLUME_DISCOUNT', label: 'Volume discount' },
];

const SORT_OPTIONS = [
  { value: '', label: 'Default sort' },
  { value: 'START_DATE', label: 'Start date (asc)' },
  { value: '-START_DATE', label: 'Start date (desc)' },
  { value: 'END_DATE', label: 'End date (asc)' },
  { value: '-END_DATE', label: 'End date (desc)' },
  { value: 'PROMOTION_NAME', label: 'Name (A–Z)' },
  { value: '-PROMOTION_NAME', label: 'Name (Z–A)' },
];

const STATUS_CHIP_COLOR = {
  RUNNING: 'success',
  PAUSED: 'warning',
  ENDED: 'default',
  SCHEDULED: 'info',
  DRAFT: 'default',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseApiError(err, fallback) {
  const apiError = err.response?.data?.error;
  const details = err.response?.data?.details;
  const detailMsg = details?.errors?.[0]?.longMessage || details?.errors?.[0]?.message;
  return detailMsg || apiError || err.message || fallback;
}

function PromotionRow({
  row,
  expanded,
  onToggle,
  showStore,
  pageSellerId,
  onEdit,
  onDelete,
}) {
  const colSpan = showStore ? 10 : 9;
  const effectiveSellerId = row.sellerId || pageSellerId;
  const deletable = canDeletePromotion(row.promotionStatus);
  const editable = canEditPromotion(row.promotionStatus);

  const handleEdit = () => {
    if (!effectiveSellerId || !row.promotionId || !row.marketplaceId) return;
    onEdit?.({
      sellerId: effectiveSellerId,
      promotionId: row.promotionId,
      marketplaceId: row.marketplaceId,
      promotionName: row.promotionName,
      promotionStatus: row.promotionStatus,
    });
  };

  const handleDelete = () => {
    if (!effectiveSellerId || !row.promotionId || !row.marketplaceId) return;
    onDelete?.({
      sellerId: effectiveSellerId,
      promotionId: row.promotionId,
      marketplaceId: row.marketplaceId,
      promotionName: row.promotionName,
      promotionStatus: row.promotionStatus,
    });
  };

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={onToggle} aria-label="expand promotion">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        {showStore ? (
          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
            {row.sellerName || '—'}
          </TableCell>
        ) : null}
        <TableCell sx={{ maxWidth: 240 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={row.promotionName}>
            {row.promotionName || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {row.promotionId || '—'}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            label={row.promotionStatus || '—'}
            color={STATUS_CHIP_COLOR[row.promotionStatus] || 'default'}
            variant="outlined"
          />
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.promotionType || '—'}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.startDate)}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.endDate)}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.couponCode || '—'}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{row.marketplaceId || '—'}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Stack direction="row" spacing={0.5}>
            <IconButton
              size="small"
              aria-label="edit promotion"
              onClick={handleEdit}
              disabled={!editable || !effectiveSellerId}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="delete promotion"
              onClick={handleDelete}
              disabled={!deletable || !effectiveSellerId}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={colSpan} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'divider' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6, pr: 2 }}>
              {row.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {row.description}
                </Typography>
              ) : null}
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Raw API payload</Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: 'grey.50',
                  borderRadius: 1,
                  fontSize: '0.72rem',
                  overflow: 'auto',
                  maxHeight: 320,
                }}
              >
                {JSON.stringify(row.raw, null, 2)}
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function MarketingPromotionsPage() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState(ALL_STORES_VALUE);
  const [marketplace, setMarketplace] = useState(ALL_MARKETPLACES_VALUE);
  const [promotionStatus, setPromotionStatus] = useState('RUNNING');
  const [promotionType, setPromotionType] = useState('CODED_COUPON');
  const [sort, setSort] = useState('END_DATE');
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [storeErrors, setStoreErrors] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api.get('/sellers/ebay-connected')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setSellers(list);
        if (list.length > 0) {
          setSellerId((prev) => prev || ALL_STORES_VALUE);
        }
      })
      .catch(() => setSellers([]));
  }, []);

  const isAllStores = sellerId === ALL_STORES_VALUE;
  const isAllMarketplaces = marketplace === ALL_MARKETPLACES_VALUE;

  const selectedSellerName = useMemo(() => {
    if (isAllStores) return 'All Stores';
    return sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '';
  }, [sellers, sellerId, isAllStores]);

  const sharedParams = useMemo(
    () => ({
      marketplace: isAllMarketplaces ? ALL_MARKETPLACES_VALUE : marketplace,
      promotion_status: promotionStatus || undefined,
      promotion_type: promotionType || undefined,
      sort: sort || undefined,
      q: appliedKeyword.trim() || undefined,
    }),
    [marketplace, isAllMarketplaces, promotionStatus, promotionType, sort, appliedKeyword],
  );

  const loadAllStoresPromotions = useCallback(async () => {
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/marketing/promotions/all', {
        params: {
          ...sharedParams,
          perSellerLimit: ALL_STORES_PER_SELLER_LIMIT,
        },
      });
      const merged = Array.isArray(data?.promotions) ? data.promotions : [];
      setAllRows(merged);
      setTotal(merged.length);
      setStoreErrors(Array.isArray(data?.errors) ? data.errors : []);
    } catch (err) {
      setAllRows([]);
      setRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load promotions'));
    } finally {
      setLoading(false);
    }
  }, [sharedParams]);

  const loadSingleSellerPromotions = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    setStoreErrors([]);
    try {
      const { data } = await api.get('/ebay/marketing/promotions', {
        params: {
          ...sharedParams,
          sellerId,
          limit: pageSize,
          offset,
        },
      });
      const singleRows = Array.isArray(data?.promotions) ? data.promotions : [];
      setAllRows([]);
      setRows(singleRows);
      const parsedTotal = data?.total != null ? Number(data.total) : null;
      setTotal(Number.isFinite(parsedTotal) ? parsedTotal : null);
    } catch (err) {
      setRows([]);
      setAllRows([]);
      setTotal(null);
      setError(parseApiError(err, 'Failed to load promotions'));
    } finally {
      setLoading(false);
    }
  }, [sellerId, sharedParams, pageSize, offset]);

  const loadPromotions = useCallback(() => {
    if (!sellerId) return Promise.resolve();
    return isAllStores ? loadAllStoresPromotions() : loadSingleSellerPromotions();
  }, [sellerId, isAllStores, loadAllStoresPromotions, loadSingleSellerPromotions]);

  useEffect(() => {
    if (!sellerId || !isAllStores) return;
    void loadAllStoresPromotions();
  }, [sellerId, isAllStores, sharedParams, loadAllStoresPromotions]);

  useEffect(() => {
    if (!sellerId || isAllStores) return;
    void loadSingleSellerPromotions();
  }, [sellerId, isAllStores, sharedParams, pageSize, offset, loadSingleSellerPromotions]);

  useEffect(() => {
    if (!isAllStores) return;
    setRows(allRows.slice(offset, offset + pageSize));
  }, [isAllStores, allRows, offset, pageSize]);

  const pageIndex = Math.floor(offset / pageSize);
  const pageCount = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const canPrev = offset > 0;
  const canNext = total != null ? offset + pageSize < total : rows.length >= pageSize;

  const applyKeyword = () => {
    setOffset(0);
    setAppliedKeyword(keyword);
  };

  const handleDeletePromotion = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/ebay/marketing/promotions/delete', {
        data: {
          sellerId: deleteTarget.sellerId,
          promotionId: deleteTarget.promotionId,
          marketplaceId: deleteTarget.marketplaceId,
        },
      });
      setDeleteTarget(null);
      void loadPromotions();
    } catch (err) {
      setDeleteError(parseApiError(err, 'Failed to delete promotion'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Marketing Promotions</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Item discounts &amp; coupons via eBay <code>getPromotions</code> / <code>createItemPromotion</code> —{' '}
            <Link href={EBAY_DOCS} target="_blank" rel="noopener noreferrer">List</Link>
            {' · '}
            <Link href={CREATE_PROMOTION_DOCS} target="_blank" rel="noopener noreferrer">Create</Link>
            {' · '}
            <Link href={UPDATE_PROMOTION_DOCS} target="_blank" rel="noopener noreferrer">Update</Link>
            {' · '}
            <Link href={DELETE_PROMOTION_DOCS} target="_blank" rel="noopener noreferrer">Delete</Link>
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            disabled={sellers.length === 0}
          >
            Create promotion
          </Button>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => void loadPromotions()}
            disabled={!sellerId || loading}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Seller</InputLabel>
              <Select label="Seller" value={sellerId} onChange={(e) => { setSellerId(e.target.value); setOffset(0); }}>
                <MenuItem value={ALL_STORES_VALUE}>All Stores</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.user?.email || s._id}
                    {s.user?.active === false ? ' (inactive user)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Marketplace</InputLabel>
              <Select label="Marketplace" value={marketplace} onChange={(e) => { setMarketplace(e.target.value); setOffset(0); }}>
                <MenuItem value={ALL_MARKETPLACES_VALUE}>All Marketplaces</MenuItem>
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={promotionStatus} onChange={(e) => { setPromotionStatus(e.target.value); setOffset(0); }}>
                {PROMOTION_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={promotionType} onChange={(e) => { setPromotionType(e.target.value); setOffset(0); }}>
                {PROMOTION_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort</InputLabel>
              <Select label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setOffset(0); }}>
                {SORT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'default'} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Title keywords"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. iPhone"
              onKeyDown={(e) => { if (e.key === 'Enter') applyKeyword(); }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Page size</InputLabel>
              <Select label="Page size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}>
                {PAGE_SIZES.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button variant="outlined" onClick={applyKeyword} disabled={!sellerId || loading} fullWidth>
              Search title
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {selectedSellerName ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Store: <strong>{selectedSellerName}</strong>
          {total != null ? ` · ${total.toLocaleString()} promotion(s)` : ` · ${rows.length} on this page`}
        </Typography>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {storeErrors.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {storeErrors.length} store(s) failed: {storeErrors.slice(0, 3).map((e) => `${e.sellerName}: ${e.error}`).join(' · ')}
          {storeErrors.length > 3 ? ` · +${storeErrors.length - 3} more` : ''}
        </Alert>
      ) : null}

      <Alert severity="info" sx={{ mb: 2 }}>
        Listing requires OAuth scope <code>sell.marketing.readonly</code> or <code>sell.marketing</code>.
        Creating promotions requires <code>sell.marketing</code> (write).
        Sellers need an active eBay Store for most discount types. Reconnect OAuth if you see scope errors.
      </Alert>

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <GrowMentalityLoader />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 48 }} />
                  {isAllStores ? <TableCell sx={{ fontWeight: 700 }}>Store</TableCell> : null}
                  <TableCell sx={{ fontWeight: 700 }}>Promotion</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>End</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Coupon</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Marketplace</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAllStores ? 10 : 9}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No promotions returned for these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <PromotionRow
                      key={`${row.sellerId || 'one'}-${row.promotionId || row.promotionName}`}
                      row={row}
                      showStore={isAllStores}
                      pageSellerId={isAllStores ? '' : sellerId}
                      onEdit={setUpdateTarget}
                      onDelete={setDeleteTarget}
                      expanded={expandedId === `${row.sellerId}-${row.promotionId}`}
                      onToggle={() => setExpandedId((prev) => (
                        prev === `${row.sellerId}-${row.promotionId}` ? null : `${row.sellerId}-${row.promotionId}`
                      ))}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {pageCount != null ? `Page ${pageIndex + 1} of ${pageCount}` : `Offset ${offset}`}
        </Typography>
        <IconButton
          size="small"
          disabled={!canPrev || loading}
          onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
          aria-label="previous page"
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          size="small"
          disabled={!canNext || loading}
          onClick={() => setOffset((o) => o + pageSize)}
          aria-label="next page"
        >
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      <CreateItemPromotionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        sellers={sellers}
        defaultSellerId={isAllStores ? '' : sellerId}
        onCreated={() => {
          void loadPromotions();
        }}
      />

      <UpdateItemPromotionDialog
        open={Boolean(updateTarget)}
        onClose={() => setUpdateTarget(null)}
        target={updateTarget}
        onUpdated={() => {
          void loadPromotions();
        }}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={deleting ? undefined : () => { setDeleteTarget(null); setDeleteError(''); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete promotion?</DialogTitle>
        <DialogContent>
          {deleteError ? <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert> : null}
          <Typography variant="body2">
            Delete <strong>{deleteTarget?.promotionName || deleteTarget?.promotionId}</strong>
            {' '}on {deleteTarget?.marketplaceId}?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Only paused or ended promotions can be deleted. Running promotions must be ended first
            (update the end date via Edit).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDeletePromotion()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
