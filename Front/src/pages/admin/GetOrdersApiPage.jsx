import { useEffect, useMemo, useState } from 'react';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  MenuItem,
  Select,
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
  Typography,
} from '@mui/material';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import ColumnSelector from '../../components/ColumnSelector.jsx';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import api from '../../lib/api';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import {
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

const DOCS_URL =
  'https://developer.ebay.com/develop/api/sell/fulfillment_api#sell-fulfillment_api-order-getorders';
const API_PATH = '/sell/fulfillment/v1/order';
const API_URL = `https://api.ebay.com${API_PATH}`;
const ROWS_PER_PAGE = 25;
const ALL_SELLERS_VALUE = '__all__';
const BULK_CALL_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PREFERRED_COLUMNS = [
  'sellerUsername',
  'orderId',
  'creationDate',
  'orderFulfillmentStatus',
  'buyer.username',
  'sellerId',
  'pricingSummary.total.value',
  'pricingSummary.total.currency',
  'pricingSummary.priceSubtotal.value',
  'cancelStatus.cancelState',
  'lineItems.count',
  'lineItem.lineItemId',
  'lineItem.sku',
  'lineItem.title',
  'lineItem.quantity',
  'lineItem.lineItemCost.value',
  'lineItem.lineItemFulfillmentStatus',
  'fulfillmentStartInstructions.0.shippingStep.shipTo.fullName',
  'fulfillmentStartInstructions.0.shippingStep.shipTo.contactAddress.city',
  'fulfillmentStartInstructions.0.shippingStep.shipTo.contactAddress.stateOrProvince',
  'fulfillmentStartInstructions.0.shippingStep.shipTo.contactAddress.postalCode',
  'fulfillmentStartInstructions.0.shippingStep.shipTo.contactAddress.countryCode',
];

const HIDDEN_COLUMNS = new Set([
  'legacyOrderId',
  'lastModifiedDate',
  'salesRecordReference',
  'orderPaymentStatus',
  'pricingSummary.deliveryCost.value',
]);

function flattenObject(value, prefix = '', out = {}, depth = 0, maxDepth = 5) {
  if (value == null) {
    if (prefix) out[prefix] = '';
    return out;
  }

  if (typeof value !== 'object') {
    out[prefix] = value;
    return out;
  }

  if (Array.isArray(value)) {
    if (!prefix) return out;
    out[`${prefix}.count`] = value.length;
    if (value.length === 0) {
      out[prefix] = '[]';
      return out;
    }
    if (value.every((item) => item == null || typeof item !== 'object')) {
      out[prefix] = value.join(', ');
      return out;
    }
    if (depth >= maxDepth) {
      out[prefix] = JSON.stringify(value);
      return out;
    }
    value.forEach((item, index) => {
      flattenObject(item, `${prefix}.${index}`, out, depth + 1, maxDepth);
    });
    return out;
  }

  if (depth >= maxDepth) {
    if (prefix) out[prefix] = JSON.stringify(value);
    return out;
  }

  Object.entries(value).forEach(([key, nested]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    flattenObject(nested, nextKey, out, depth + 1, maxDepth);
  });
  return out;
}

function buildRows(orders, viewMode) {
  const list = Array.isArray(orders) ? orders : [];
  if (viewMode === 'lineItems') {
    const rows = [];
    list.forEach((order, orderIndex) => {
      const orderFlat = flattenObject({ ...order, lineItems: undefined });
      const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
      if (lineItems.length === 0) {
        rows.push({
          _rowKey: `${order?.sellerMongoId || ''}-${order?.orderId || orderIndex}-empty`,
          ...orderFlat,
          'lineItems.count': 0,
        });
        return;
      }
      lineItems.forEach((lineItem, lineIndex) => {
        const lineFlat = flattenObject(lineItem, 'lineItem');
        rows.push({
          _rowKey: `${order?.sellerMongoId || ''}-${order?.orderId || orderIndex}-${lineItem?.lineItemId || lineIndex}`,
          ...orderFlat,
          'lineItems.count': lineItems.length,
          ...lineFlat,
        });
      });
    });
    return rows;
  }

  return list.map((order, index) => ({
    _rowKey: `${order?.sellerMongoId || ''}-${order?.orderId || index}`,
    ...flattenObject(order),
  }));
}

function formatCell(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toYyyyMmDd(date) {
  return date.toISOString().slice(0, 10);
}

function dayStartIso(yyyyMmDd) {
  return `${yyyyMmDd}T00:00:00.000Z`;
}

function dayEndIso(yyyyMmDd) {
  return `${yyyyMmDd}T23:59:59.999Z`;
}

function defaultFromDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return toYyyyMmDd(d);
}

function buildEbayDateFilter({ field, mode, single, from, to }) {
  if (!field || mode === 'all') return '';
  if (mode === 'single' && single) {
    return `${field}:[${dayStartIso(single)}..${dayEndIso(single)}]`;
  }
  if (mode === 'from' && from) {
    return `${field}:[${dayStartIso(from)}..]`;
  }
  if (mode === 'range') {
    if (from && to) return `${field}:[${dayStartIso(from)}..${dayEndIso(to)}]`;
    if (from) return `${field}:[${dayStartIso(from)}..]`;
    if (to) return `${field}:[..${dayEndIso(to)}]`;
  }
  return '';
}

export default function GetOrdersApiPage() {
  const { sellers, loading: sellersLoading } = useEbayConnectedSellers();
  const [sellerId, setSellerId] = useState(ALL_SELLERS_VALUE);
  const [dateField, setDateField] = useState('lastmodifieddate');
  const [dateMode, setDateMode] = useState('from');
  const [dateFrom, setDateFrom] = useState(defaultFromDate);
  const [dateTo, setDateTo] = useState(() => toYyyyMmDd(new Date()));
  const [dateSingle, setDateSingle] = useState(() => toYyyyMmDd(new Date()));
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loadAllPages, setLoadAllPages] = useState(true);
  const [fieldGroups, setFieldGroups] = useState('');
  const [orderIds, setOrderIds] = useState('');
  const [viewMode, setViewMode] = useState('orders');
  const [loading, setLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState([]);

  const ebayFilter = useMemo(
    () => buildEbayDateFilter({
      field: dateField,
      mode: dateMode,
      single: dateSingle,
      from: dateFrom,
      to: dateTo,
    }),
    [dateField, dateMode, dateSingle, dateFrom, dateTo]
  );

  const rows = useMemo(() => buildRows(orders, viewMode), [orders, viewMode]);

  const allColumns = useMemo(() => {
    const keys = new Set();
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== '_rowKey' && !HIDDEN_COLUMNS.has(key)) keys.add(key);
      });
    });
    const preferred = PREFERRED_COLUMNS.filter((key) => keys.has(key));
    const rest = [...keys].filter((key) => !preferred.includes(key)).sort();
    return [...preferred, ...rest].map((id) => ({ id, label: id }));
  }, [rows]);

  useEffect(() => {
    if (!sellers.length) return;
    if (sellerId === ALL_SELLERS_VALUE) return;
    if (!sellerId || !sellers.some((s) => s._id === sellerId)) {
      setSellerId(ALL_SELLERS_VALUE);
    }
  }, [sellers, sellerId]);

  useEffect(() => {
    if (!allColumns.length) {
      setVisibleColumns([]);
      return;
    }
    setVisibleColumns((prev) => {
      const valid = prev.filter((id) => allColumns.some((col) => col.id === id));
      if (valid.length) return valid;
      const defaults = PREFERRED_COLUMNS.filter((id) => allColumns.some((col) => col.id === id));
      return defaults.length ? defaults : allColumns.slice(0, 12).map((col) => col.id);
    });
  }, [allColumns]);

  useEffect(() => {
    setPage(0);
  }, [viewMode, orders]);

  const displayedColumns = useMemo(
    () => allColumns.filter((col) => visibleColumns.includes(col.id)),
    [allColumns, visibleColumns]
  );

  const pagedRows = useMemo(
    () => rows.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE),
    [rows, page]
  );

  const pageSize = Math.min(200, Math.max(1, Number(limit) || 25));

  const fetchSellerOrders = async (id, username, onProgress) => {
    const collected = [];
    let requestOffset = loadAllPages ? 0 : Math.max(0, Number(offset) || 0);
    let ebayTotal = null;
    let lastData = null;
    let pagesFetched = 0;
    const maxPages = 50; // safety: 50 * 200 = 10,000 orders max

    while (pagesFetched < maxPages) {
      if (onProgress) {
        onProgress(
          loadAllPages
            ? `${username}: page ${pagesFetched + 1} (loaded ${collected.length}${ebayTotal != null ? `/${ebayTotal}` : ''})`
            : `${username}: fetching…`
        );
      }

      const { data } = await api.get('/ebay/fulfillment/get-orders', {
        params: {
          sellerId: id,
          filter: ebayFilter || undefined,
          limit: pageSize,
          offset: requestOffset,
          fieldGroups: fieldGroups.trim() || undefined,
          orderIds: orderIds.trim() || undefined,
        },
      });

      lastData = data;
      const batch = Array.isArray(data?.data?.orders) ? data.data.orders : [];
      ebayTotal = data?.data?.total != null ? Number(data.data.total) : ebayTotal;
      batch.forEach((order) => {
        collected.push({
          ...order,
          sellerUsername: username,
          sellerMongoId: id,
        });
      });
      pagesFetched += 1;

      if (!loadAllPages) break;
      if (batch.length === 0) break;
      if (ebayTotal != null && collected.length >= ebayTotal) break;
      if (batch.length < pageSize) break;

      requestOffset += pageSize;
      await sleep(300);
    }

    return {
      orders: collected,
      meta: lastData,
      ebayTotal: ebayTotal ?? collected.length,
      pagesFetched,
      pageSize,
    };
  };

  const fetchOrders = async () => {
    if (!sellerId) {
      setError('Select a connected seller first.');
      return;
    }
    if (!sellers.length) {
      setError('No connected sellers available.');
      return;
    }

    setLoading(true);
    setError('');
    setBulkProgress('');

    try {
      if (sellerId === ALL_SELLERS_VALUE) {
        const combined = [];
        const failures = [];
        let totalFromApi = 0;
        let pagesFetched = 0;

        for (let i = 0; i < sellers.length; i += 1) {
          const seller = sellers[i];
          const username = seller.user?.username || seller._id;
          try {
            const result = await fetchSellerOrders(seller._id, username, setBulkProgress);
            totalFromApi += result.ebayTotal;
            pagesFetched += result.pagesFetched;
            combined.push(...result.orders);
          } catch (err) {
            failures.push(`${username}: ${err.response?.data?.error || err.message}`);
          }
          if (i < sellers.length - 1) {
            await sleep(BULK_CALL_DELAY_MS);
          }
        }

        setOrders(combined);
        setMeta({
          seller: { username: `All sellers (${sellers.length})` },
          data: {
            total: totalFromApi,
            limit: pageSize,
            offset: loadAllPages ? 0 : offset,
            orders: combined,
          },
          bulk: {
            sellersAttempted: sellers.length,
            sellersFailed: failures.length,
            failures,
            pagesFetched,
            loadAllPages,
          },
        });
        setPage(0);
        if (failures.length) {
          setError(`Fetched with ${failures.length} seller error(s):\n${failures.join('\n')}`);
        }
      } else {
        const seller = sellers.find((s) => s._id === sellerId);
        const username = seller?.user?.username || sellerId;
        const result = await fetchSellerOrders(sellerId, username, setBulkProgress);
        setMeta({
          ...(result.meta || {}),
          data: {
            ...(result.meta?.data || {}),
            total: result.ebayTotal,
            limit: pageSize,
            offset: loadAllPages ? 0 : offset,
            orders: result.orders,
          },
          bulk: {
            pagesFetched: result.pagesFetched,
            loadAllPages,
          },
        });
        setOrders(result.orders);
        setPage(0);
      }
    } catch (err) {
      setOrders([]);
      setMeta(null);
      setError(err.response?.data?.error || err.message || 'Failed to call getOrders');
    } finally {
      setLoading(false);
      setBulkProgress('');
    }
  };

  return (
    <AdminPageShell>
      <SectionCard
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 1.5,
          background: dashboardSignatureTokens.surfaces.pageCard,
        }}
      >
        <PageHeader
          title="getOrders (Fulfillment API)"
          subtitle="Live Sell Fulfillment getOrders response rendered as a flat table."
          sx={{ pt: 0, pb: 1 }}
          actions={
            <Button
              component="a"
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              variant="outlined"
              sx={yellowOutlinedButtonSx}
              endIcon={<OpenInNewIcon fontSize="small" />}
            >
              API docs
            </Button>
          }
        />

        <Stack spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Endpoint:{' '}
            <Box component="code" sx={{ fontSize: '0.85em' }}>
              GET {API_URL}
            </Box>
          </Typography>
          <Link href={DOCS_URL} target="_blank" rel="noopener noreferrer" underline="hover">
            {DOCS_URL}
          </Link>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              label="Seller"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              disabled={sellersLoading || !sellers.length}
            >
              <MenuItem value={ALL_SELLERS_VALUE}>
                <em>All sellers ({sellers.length})</em>
              </MenuItem>
              {sellers.map((seller) => (
                <MenuItem key={seller._id} value={seller._id}>
                  {seller.user?.username || seller._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Date field</InputLabel>
            <Select
              label="Date field"
              value={dateField}
              onChange={(e) => setDateField(e.target.value)}
            >
              <MenuItem value="lastmodifieddate">Last modified</MenuItem>
              <MenuItem value="creationdate">Creation date</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Date mode</InputLabel>
            <Select
              label="Date mode"
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value)}
            >
              <MenuItem value="all">All dates</MenuItem>
              <MenuItem value="from">From date</MenuItem>
              <MenuItem value="single">Single day</MenuItem>
              <MenuItem value="range">Date range</MenuItem>
            </Select>
          </FormControl>

          {dateMode === 'single' && (
            <TextField
              size="small"
              type="date"
              label="On"
              value={dateSingle}
              onChange={(e) => setDateSingle(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
          )}

          {(dateMode === 'from' || dateMode === 'range') && (
            <TextField
              size="small"
              type="date"
              label="From"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
          )}

          {dateMode === 'range' && (
            <TextField
              size="small"
              type="date"
              label="To"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
          )}

          {ebayFilter && (
            <Chip
              size="small"
              variant="outlined"
              label={ebayFilter}
              sx={{ maxWidth: 420, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
            />
          )}

          <TextField
            size="small"
            label="Page size"
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
            sx={{ width: 110 }}
            inputProps={{ min: 1, max: 200 }}
            helperText="Max per API call"
          />

          {!loadAllPages && (
            <TextField
              size="small"
              label="offset"
              type="number"
              value={offset}
              onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
              sx={{ width: 100 }}
              inputProps={{ min: 0 }}
            />
          )}

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={loadAllPages}
                onChange={(e) => setLoadAllPages(e.target.checked)}
              />
            }
            label="Load all pages"
            sx={{ ml: 0.5 }}
          />

          <TextField
            size="small"
            label="fieldGroups"
            placeholder="TAX_BREAKDOWN"
            value={fieldGroups}
            onChange={(e) => setFieldGroups(e.target.value)}
            sx={{ width: 160 }}
          />

          <TextField
            size="small"
            label="orderIds"
            placeholder="id1,id2"
            value={orderIds}
            onChange={(e) => setOrderIds(e.target.value)}
            sx={{ minWidth: 180 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Table view</InputLabel>
            <Select
              label="Table view"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
            >
              <MenuItem value="orders">One row / order</MenuItem>
              <MenuItem value="lineItems">One row / line item</MenuItem>
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="contained"
            sx={yellowFilledButtonSx}
            startIcon={<RefreshIcon />}
            onClick={fetchOrders}
            disabled={loading || !sellerId || !sellers.length}
          >
            {loading
              ? (bulkProgress || 'Fetching…')
              : sellerId === ALL_SELLERS_VALUE
                ? `Fetch all sellers (${sellers.length})`
                : 'Fetch getOrders'}
          </Button>

          {allColumns.length > 0 && (
            <ColumnSelector
              allColumns={allColumns}
              visibleColumns={visibleColumns}
              onColumnChange={setVisibleColumns}
              onReset={() =>
                setVisibleColumns(
                  PREFERRED_COLUMNS.filter((id) => allColumns.some((col) => col.id === id))
                )
              }
              page="get-orders-api"
            />
          )}
        </Stack>
      </SectionCard>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5, whiteSpace: 'pre-line' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {meta && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Chip size="small" label={`loaded: ${orders.length}`} />
          <Chip size="small" label={`ebay total: ${meta?.data?.total ?? '—'}`} />
          <Chip size="small" label={`page size: ${meta?.data?.limit ?? pageSize}`} />
          {!loadAllPages && (
            <Chip size="small" label={`offset: ${meta?.data?.offset ?? offset}`} />
          )}
          <Chip size="small" label={`table rows: ${rows.length}`} />
          {meta?.bulk?.pagesFetched != null && (
            <Chip size="small" label={`api pages: ${meta.bulk.pagesFetched}`} />
          )}
          {meta?.seller?.username && (
            <Chip size="small" color="primary" variant="outlined" label={`seller: ${meta.seller.username}`} />
          )}
          {meta?.bulk?.sellersFailed > 0 && (
            <Chip size="small" color="warning" label={`failed sellers: ${meta.bulk.sellersFailed}`} />
          )}
          {Number(meta?.data?.total) === 1 && orders.length === 1 && (
            <Chip
              size="small"
              color="info"
              variant="outlined"
              label="Only 1 order matches this date filter (page size does not invent extra rows)"
            />
          )}
        </Stack>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <Typography color="text.secondary">
            {bulkProgress || 'Calling eBay getOrders…'}
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ ...tableContainerSx, maxWidth: '100%', overflowX: 'auto' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  {displayedColumns.map((col) => (
                    <TableCell key={col.id} sx={tableHeaderCellSx}>
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={Math.max(displayedColumns.length, 1)} align="center">
                      <Typography variant="body2" color="text.secondary" py={3}>
                        {meta
                          ? 'No orders returned for these parameters.'
                          : 'Choose a seller and click Fetch getOrders.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRows.map((row) => (
                    <TableRow key={row._rowKey} hover sx={tableBodyRowSx}>
                      {displayedColumns.map((col) => (
                        <TableCell key={col.id} sx={{ maxWidth: 280, verticalAlign: 'top' }}>
                          <Tooltip title={formatCell(row[col.id])} placement="top-start">
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.75rem',
                                fontFamily: col.id.toLowerCase().includes('id') ? 'monospace' : 'inherit',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatCell(row[col.id])}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {rows.length > 0 && (
            <TablePagination
              component="div"
              count={rows.length}
              page={page}
              onPageChange={(_, next) => setPage(next)}
              rowsPerPage={ROWS_PER_PAGE}
              rowsPerPageOptions={[ROWS_PER_PAGE]}
              onRowsPerPageChange={() => {}}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
          )}
        </>
      )}
    </AdminPageShell>
  );
}
