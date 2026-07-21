import { useCallback, useEffect, useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  Link,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Switch,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { BRAND_DARK } from '../../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  tableIndexBadgeSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

const T = dashboardSignatureTokens;
const PAGE_SIZE = 50;
const detailBodyCellSx = {
  ...tableBodyCellSx,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  px: 1,
};

const detailTableRowSx = {
  '&:nth-of-type(odd)': {
    bgcolor: '#ffffff',
  },
  '&:nth-of-type(even)': {
    bgcolor: alpha(BRAND_DARK, 0.025),
  },
  '&:hover': {
    bgcolor: alpha(T.colors?.yellow || '#facc15', 0.12),
  },
  '& td': {
    borderBottom: `1px solid ${alpha(BRAND_DARK, 0.08)}`,
  },
};

function sellerName(seller) {
  return seller?.user?.username || seller?.user?.email || seller?._id || 'Unknown';
}

function money(value, currency = '$') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${currency}${number.toFixed(2)}`;
}

function inr(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `₹${number.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  const datePart = date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} at ${timePart} PT`;
}

function ToneChip({ label, tone = 'neutral' }) {
  const t = T.tones[tone] || T.tones.neutral;
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 24,
        fontSize: '0.72rem',
        fontWeight: 800,
        bgcolor: t.background,
        color: t.color,
        border: `1px solid ${t.border}`,
      }}
    />
  );
}

function DetailTable({ title, icon, columns, emptyLabel, children }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        overflow: 'hidden',
        bgcolor: '#fff',
        border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
        borderRadius: 1.5,
        boxShadow: `0 8px 22px ${alpha(BRAND_DARK, 0.05)}`,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          px: 1.25,
          py: 1,
          bgcolor: alpha(BRAND_DARK, 0.035),
          borderBottom: `1px solid ${alpha(BRAND_DARK, 0.08)}`,
        }}
      >
        {icon}
        <Typography variant="subtitle2" fontWeight={900} sx={{ color: BRAND_DARK }}>
          {title}
        </Typography>
      </Stack>
      <TableContainer sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
        <Table size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              {columns.map(column => (
                <TableCell
                  key={column.label || column}
                  sx={{ ...tableHeaderCellSx, py: 1, px: 1, whiteSpace: 'nowrap', ...(column.sx || {}) }}
                >
                  {column.label || column}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {children || (
              <TableRow sx={detailTableRowSx}>
                <TableCell colSpan={columns.length} sx={detailBodyCellSx}>
                  <Typography variant="body2" color="text.secondary">{emptyLabel}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function joinNames(names, fallback = 'none') {
  const uniqueNames = [...new Set(names.filter(Boolean))];
  if (uniqueNames.length === 0) return fallback;
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) return `${uniqueNames[0]} and ${uniqueNames[1]}`;
  return `${uniqueNames.slice(0, -1).join(', ')}, and ${uniqueNames[uniqueNames.length - 1]}`;
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function SellerNameList({ names, fallback = 'None', highlightNames = [] }) {
  const values = [...new Set((names || []).filter(Boolean))];
  const highlightSet = new Set((highlightNames || []).filter(Boolean));
  if (!values.length) {
    return (
      <Typography variant="body2" sx={{ color: BRAND_DARK, lineHeight: 1.45 }}>
        {fallback}
      </Typography>
    );
  }

  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {values.map(name => (
        (() => {
          const highlighted = highlightSet.has(name);
          const dangerTone = T.tones.danger;
          return (
            <Box
              key={name}
              component="span"
              sx={{
                px: 1,
                py: 0.35,
                borderRadius: 1,
                bgcolor: highlighted ? dangerTone.background : alpha(BRAND_DARK, 0.055),
                color: highlighted ? dangerTone.color : BRAND_DARK,
                fontSize: '0.82rem',
                fontWeight: 900,
                lineHeight: 1.2,
                border: `1px solid ${highlighted ? dangerTone.border : alpha(BRAND_DARK, 0.08)}`,
              }}
            >
              {name}
            </Box>
          );
        })()
      ))}
    </Stack>
  );
}

function buildSkuStory(row) {
  const orderSellerCounts = new Map();
  (row.orders || []).forEach((order) => {
    const name = order.sellerName || 'Unknown seller';
    orderSellerCounts.set(name, (orderSellerCounts.get(name) || 0) + 1);
  });

  const templateSellers = [...new Set((row.listings || []).map(listing => listing.sellerName).filter(Boolean))];
  const missingTemplateSellers = [...new Set((row.listings || [])
    .filter(listing => !listing.skuSyncIndex?.present)
    .map(listing => listing.sellerName)
    .filter(Boolean))];
  const presentTemplateSellers = [...new Set((row.listings || [])
    .filter(listing => listing.skuSyncIndex?.present)
    .map(listing => listing.sellerName)
    .filter(Boolean))];
  const syncSellerCounts = new Map();
  (row.syncRecords || []).forEach((record) => {
    const name = record.sellerName || 'Unknown seller';
    syncSellerCounts.set(name, (syncSellerCounts.get(name) || 0) + 1);
  });
  const syncOnlySellers = [...syncSellerCounts.keys()].filter(name => !templateSellers.includes(name));
  return {
    orderStores: [...orderSellerCounts.entries()]
      .map(([name, count]) => `${name} (${plural(count, 'order')})`),
    templateSellers,
    presentTemplateSellers,
    missingTemplateSellers,
    syncOnlySellers,
  };
}

function SummaryLine({ label, value, tone = 'neutral', highlightNames = [] }) {
  const t = T.tones[tone] || T.tones.neutral;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '260px minmax(0, 1fr)' },
        gap: { xs: 0.25, md: 1.5 },
        alignItems: 'start',
        py: 0.85,
        px: 1,
        borderTop: `1px solid ${alpha(BRAND_DARK, 0.08)}`,
      }}
    >
      <Typography variant="caption" fontWeight={900} sx={{ color: t.color, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      {Array.isArray(value) ? (
        <SellerNameList names={value} highlightNames={highlightNames} />
      ) : (
        <Typography variant="body2" sx={{ color: BRAND_DARK, lineHeight: 1.45 }}>
          {value}
        </Typography>
      )}
    </Box>
  );
}

function SkuStory({ row }) {
  const story = buildSkuStory(row);
  return (
    <Box
      sx={{
        gridColumn: '1 / -1',
        border: `1px solid ${alpha(BRAND_DARK, 0.12)}`,
        borderRadius: 1,
        bgcolor: '#fff',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 1, py: 0.9, bgcolor: alpha(BRAND_DARK, 0.04) }}>
        <Typography variant="subtitle2" fontWeight={900} sx={{ color: BRAND_DARK }}>
          Row Summary
        </Typography>
      </Box>
      <SummaryLine
        label="Orders From Store"
        value={story.orderStores.length ? story.orderStores : 'No matching orders in the selected filters'}
        tone="info"
      />
      <SummaryLine
        label="Seller And Template Listings"
        value={story.templateSellers.length ? story.templateSellers : 'No seller template listing found'}
        highlightNames={story.missingTemplateSellers}
        tone="warning"
      />
      <SummaryLine
        label="Currently Active Seller"
        value={story.presentTemplateSellers.length ? story.presentTemplateSellers : 'No template seller currently has this SKU in sync'}
        tone="success"
      />
      <SummaryLine
        label="Initially Had SKU, Not Present Now"
        value={story.missingTemplateSellers.length ? story.missingTemplateSellers : 'None'}
        tone="danger"
      />
      <SummaryLine
        label="Never In Template, Present In Sync"
        value={story.syncOnlySellers.length ? story.syncOnlySellers : 'None'}
        tone="neutral"
      />
    </Box>
  );
}

function SkuRow({ row, index, isSelected, onOpen }) {
  const [open, setOpen] = useState(false);
  const profitTone = Number(row.totalProfit || 0) >= 0 ? 'success' : 'danger';
  const openDetails = () => {
    onOpen?.(row.sku);
    setOpen(true);
  };

  return (
    <>
      <TableRow
        hover
        sx={{
          ...tableBodyRowSx,
          bgcolor: isSelected ? alpha(T.colors?.yellow || '#820cb4', 0.18) : index % 2 === 0 ? '#fff' : alpha(BRAND_DARK, 0.025),
          boxShadow: isSelected ? `inset 4px 0 0 ${T.colors?.yellow || '#facc15'}` : 'none',
          '&:hover': {
            bgcolor: alpha(T.colors?.yellow || '#facc15', 0.1),
          },
          '& td': {
            borderBottom: isSelected
              ? `1px solid ${alpha(T.colors?.yellow || '#15a2fa', 0.45)}`
              : tableBodyRowSx?.['& td']?.borderBottom,
          },
        }}
      >
        <TableCell sx={{ ...tableBodyCellSx, width: 56 }}>
          <Box sx={{ ...tableIndexBadgeSx, width: 28, height: 28 }}>{index + 1}</Box>
        </TableCell>
        <TableCell sx={tableBodyCellSx}>
          <Typography fontFamily="'JetBrains Mono', monospace" fontWeight={900} sx={{ color: BRAND_DARK }}>
            {row.sku}
          </Typography>
        </TableCell>
        <TableCell sx={tableBodyCellSx}>
          <Tooltip title="Sellers found in template listings for this SKU." arrow>
            <Box component="span"><ToneChip label={`${row.sellerCount} sellers`} tone="info" /></Box>
          </Tooltip>
        </TableCell>
        <TableCell sx={tableBodyCellSx}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tooltip title="Template listings found for this exact SKU." arrow>
              <Box component="span"><ToneChip label={`${row.listingCount} listings`} tone="warning" /></Box>
            </Tooltip>
            <Tooltip title="Live synced eBay listings in SKU Seller Index for this base SKU." arrow>
              <Box component="span">
                <ToneChip
                  label={`${row.skuIndexCount || 0} sync`}
                  tone={Number(row.skuIndexCount || 0) >= Number(row.listingCount || 0) ? 'success' : 'neutral'}
                />
              </Box>
            </Tooltip>
          </Stack>
        </TableCell>
        <TableCell sx={tableBodyCellSx}>{money(row.minTemplatePrice)} - {money(row.maxTemplatePrice)}</TableCell>
        <TableCell sx={tableBodyCellSx}>{money(row.avgTemplatePrice)}</TableCell>
        <TableCell sx={tableBodyCellSx}>{row.orderCount}</TableCell>
        <TableCell sx={tableBodyCellSx}>{money(row.totalSubtotal)}</TableCell>
        <TableCell sx={tableBodyCellSx}><ToneChip label={inr(row.totalProfit)} tone={profitTone} /></TableCell>
        <TableCell align="right" sx={tableBodyCellSx}>
          <Tooltip title="Open row details">
            <IconButton
              onClick={openDetails}
              size="small"
              sx={{
                width: 34,
                height: 34,
                color: BRAND_DARK,
                bgcolor: alpha(BRAND_DARK, 0.04),
                border: `1px solid ${alpha(BRAND_DARK, 0.12)}`,
                '&:hover': {
                  bgcolor: alpha(T.colors?.yellow || '#facc15', 0.2),
                  borderColor: alpha(T.colors?.yellow || '#facc15', 0.7),
                },
              }}
            >
              <OpenInFullIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth={false}
        PaperProps={{
          sx: {
            width: 'calc(100vw - 16px)',
            maxWidth: 'none',
            borderRadius: 2,
            maxHeight: '92vh',
            bgcolor: '#f6f7fb',
            overflow: 'hidden',
            border: `1px solid ${alpha(BRAND_DARK, 0.16)}`,
          },
        }}
      >
        <DialogTitle sx={{ pb: 1.25, bgcolor: '#fff', borderBottom: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Typography fontFamily="'JetBrains Mono', monospace" fontWeight={900} sx={{ color: BRAND_DARK }}>
              {row.sku}
            </Typography>
            <ToneChip label={`${row.orderCount} orders`} tone="info" />
            <ToneChip label={`${row.listingCount} template listings`} tone="warning" />
            <ToneChip label={`${row.skuIndexCount || 0} synced`} tone="success" />
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#f6f7fb', p: 2, overflowX: 'hidden' }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) minmax(0, 1fr)' },
                gap: 2.5,
                overflowX: 'hidden',
              }}
            >
              <SkuStory row={row} />
              <DetailTable
                title="Template Listings"
                icon={<StorefrontIcon sx={{ fontSize: 18, color: alpha(BRAND_DARK, 0.55) }} />}
                columns={[
                  { label: 'Seller', sx: { width: '13%' } },
                  { label: 'Template', sx: { width: '14%' } },
                  { label: 'Created', sx: { width: '20%' } },
                  { label: 'Price', sx: { width: '9%' } },
                  { label: 'Sync', sx: { width: '12%' } },
                  { label: 'ASIN', sx: { width: '14%' } },
                  { label: 'Title', sx: { width: '18%' } },
                ]}
                emptyLabel="No template listings found."
              >
                {row.listings?.map(listing => (
                  <TableRow key={listing.id} sx={detailTableRowSx}>
                    <TableCell sx={{ ...detailBodyCellSx, fontWeight: 900, color: BRAND_DARK }}>{listing.sellerName}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{listing.templateName}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{formatDate(listing.createdAt)}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{money(listing.startPrice)}</TableCell>
                    <TableCell sx={detailBodyCellSx}>
                      <ToneChip
                        label={listing.skuSyncIndex?.present ? `Present (${listing.skuSyncIndex.count || 1})` : 'Missing'}
                        tone={listing.skuSyncIndex?.present ? 'success' : 'danger'}
                      />
                    </TableCell>
                    <TableCell sx={detailBodyCellSx}>
                      <Typography noWrap fontFamily="'JetBrains Mono', monospace" variant="body2">
                        {listing.asin || '-'}
                      </Typography>
                      {listing.amazonLink ? (
                        <Link
                          href={listing.amazonLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          sx={{ display: 'block', mt: 0.25, fontSize: '0.76rem' }}
                        >
                          Open
                        </Link>
                      ) : '-'}
                    </TableCell>
                    <TableCell sx={detailBodyCellSx}>
                      <Tooltip title={listing.title || ''} placement="top" arrow disableHoverListener={!listing.title}>
                        <Typography noWrap variant="body2" sx={{ color: listing.title ? BRAND_DARK : 'text.secondary' }}>
                          {listing.title || '-'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </DetailTable>
              <DetailTable
                title="Recent Matching Orders"
                icon={<ReceiptLongIcon sx={{ fontSize: 18, color: alpha(BRAND_DARK, 0.55) }} />}
                columns={[
                  { label: 'Order ID', sx: { width: '15%' } },
                  { label: 'SKU', sx: { width: '12%' } },
                  { label: 'Seller', sx: { width: '12%' } },
                  { label: 'Marketplace', sx: { width: '10%' } },
                  { label: 'Date', sx: { width: '19%' } },
                  { label: 'Subtotal', sx: { width: '9%' } },
                  { label: 'Profit', sx: { width: '9%' } },
                  { label: 'Product', sx: { width: '14%' } },
                ]}
                emptyLabel="No orders found for this SKU."
              >
                {row.orders?.length ? row.orders.map(order => (
                  <TableRow key={order.orderId} sx={detailTableRowSx}>
                    <TableCell sx={detailBodyCellSx}>{order.orderId}</TableCell>
                    <TableCell sx={detailBodyCellSx}>
                      <Typography noWrap fontFamily="'JetBrains Mono', monospace" variant="body2">{order.sku || '-'}</Typography>
                    </TableCell>
                    <TableCell sx={{ ...detailBodyCellSx, fontWeight: 900, color: BRAND_DARK }}>{order.sellerName || '-'}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{order.marketplace || '-'}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{formatDate(order.dateSold)}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{money(order.subtotal)}</TableCell>
                    <TableCell sx={detailBodyCellSx}>{inr(order.profit)}</TableCell>
                    <TableCell sx={detailBodyCellSx}>
                      <Tooltip title={order.productName || ''} placement="top" arrow disableHoverListener={!order.productName}>
                        <Typography noWrap variant="body2" sx={{ color: order.productName ? BRAND_DARK : 'text.secondary' }}>
                          {order.productName || '-'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )) : null}
              </DetailTable>
              <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                <DetailTable
                  title="SKU Seller Index Sync"
                  icon={<StorefrontIcon sx={{ fontSize: 18, color: alpha(BRAND_DARK, 0.55) }} />}
                  columns={[
                    { label: 'Seller', sx: { width: '15%' } },
                    { label: 'Item ID', sx: { width: '16%' } },
                    { label: 'SKU', sx: { width: '16%' } },
                    { label: 'Base SKU', sx: { width: '16%' } },
                    { label: 'Synced At', sx: { width: '17%' } },
                    { label: 'Title', sx: { width: '20%' } },
                  ]}
                  emptyLabel="No synced SKU index records found."
                >
                  {row.syncRecords?.length ? row.syncRecords.map(record => (
                    <TableRow key={record.id || `${record.sellerId}-${record.itemId}`} sx={detailTableRowSx}>
                      <TableCell sx={{ ...detailBodyCellSx, fontWeight: 900, color: BRAND_DARK }}>{record.sellerName || '-'}</TableCell>
                      <TableCell sx={detailBodyCellSx}>
                        <Typography noWrap fontFamily="'JetBrains Mono', monospace" variant="body2">{record.itemId || '-'}</Typography>
                      </TableCell>
                      <TableCell sx={detailBodyCellSx}>
                        <Typography noWrap fontFamily="'JetBrains Mono', monospace" variant="body2">{record.sku || '-'}</Typography>
                      </TableCell>
                      <TableCell sx={detailBodyCellSx}>
                        <Typography noWrap fontFamily="'JetBrains Mono', monospace" variant="body2">{record.baseSku || '-'}</Typography>
                      </TableCell>
                      <TableCell sx={detailBodyCellSx}>{formatDate(record.syncedAt)}</TableCell>
                      <TableCell sx={detailBodyCellSx}>
                        <Tooltip title={record.title || ''} placement="top" arrow disableHoverListener={!record.title}>
                          <Typography noWrap variant="body2" sx={{ color: record.title ? BRAND_DARK : 'text.secondary' }}>
                            {record.title || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )) : null}
                </DetailTable>
              </Box>
            </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, bgcolor: '#fff', borderTop: `1px solid ${alpha(BRAND_DARK, 0.1)}` }}>
          <Button variant="outlined" onClick={() => setOpen(false)} sx={yellowOutlinedButtonSx}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default function SkuSellerProfitPage() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('all');
  const [marketplace, setMarketplace] = useState('');
  const [excludeClient, setExcludeClient] = useState(true);
  const [excludeLowValue, setExcludeLowValue] = useState(true);
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ rows: [], pagination: { total: 0, pages: 0, totalOrders: 0 } });
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(true);
  const [error, setError] = useState('');
  const [lastOpenedSku, setLastOpenedSku] = useState('');

  const sortedSellers = useMemo(() => [...sellers].sort((a, b) => sellerName(a).localeCompare(sellerName(b))), [sellers]);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load sellers.'))
      .finally(() => setLoadingSellers(false));
  }, []);

  const fetchRows = useCallback(async (nextPage = 1) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/template-listings/sku-seller-order-profit', {
        params: {
          sellerId,
          marketplace,
          excludeClient,
          excludeLowValue,
          search: search.trim(),
          orderFrom: createdFrom,
          orderTo: createdTo,
          page: nextPage,
          limit: PAGE_SIZE,
        },
      });
      setResult(data);
      setPage(nextPage);
      setHasSearched(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load SKU seller profit report.');
    } finally {
      setLoading(false);
    }
  }, [createdFrom, createdTo, excludeClient, excludeLowValue, marketplace, search, sellerId]);

  const rows = result.rows || [];
  const pagination = result.pagination || { total: 0, pages: 0, totalOrders: 0, hasNextPage: false };

  return (
    <Fade in timeout={500}>
      <AdminPageShell>
        <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3, background: T.surfaces.pageCard }}>
          <Stack direction={{ xs: 'column', xl: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', xl: 'center' }} gap={2}>
            <PageHeader
              title="SKU Seller Profit"
              subtitle="Start from orders in a date range, then check where those SKUs exist in seller template listings."
              sx={{ pt: 0, pb: 0 }}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 240 }} disabled={loadingSellers || loading}>
                <InputLabel>Seller</InputLabel>
                <Select
                  label="Seller"
                  value={sellerId}
                  onChange={event => {
                    setSellerId(event.target.value);
                    setPage(1);
                  }}
                >
                  <MenuItem value="all">All sellers</MenuItem>
                  {sortedSellers.map(seller => (
                    <MenuItem key={seller._id} value={seller._id}>{sellerName(seller)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }} disabled={loading}>
                <InputLabel>Marketplace</InputLabel>
                <Select
                  label="Marketplace"
                  value={marketplace}
                  onChange={event => {
                    setMarketplace(event.target.value);
                    setPage(1);
                  }}
                >
                  <MenuItem value="">All marketplaces</MenuItem>
                  <MenuItem value="EBAY_US">United States</MenuItem>
                  <MenuItem value="EBAY_AU">Australia</MenuItem>
                  <MenuItem value="EBAY_CA">Canada</MenuItem>
                  <MenuItem value="EBAY_GB">England</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch
                    checked={excludeClient}
                    onChange={event => {
                      setExcludeClient(event.target.checked);
                      setPage(1);
                    }}
                    color="primary"
                  />
                }
                label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Exclude Client</Typography>}
                sx={{ m: 0, px: 1.25, minHeight: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={excludeLowValue}
                    onChange={event => {
                      setExcludeLowValue(event.target.checked);
                      setPage(1);
                    }}
                    color="primary"
                  />
                }
                label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Exclude &lt; $3 Orders</Typography>}
                sx={{ m: 0, px: 1.25, minHeight: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
              />
              <TextField
                size="small"
                label="Search SKU or title"
                value={search}
                onChange={event => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') fetchRows(1);
                }}
                sx={{ minWidth: { xs: '100%', md: 260 } }}
              />
              <TextField
                size="small"
                label="Order From"
                type="date"
                value={createdFrom}
                onChange={event => {
                  setCreatedFrom(event.target.value);
                  setPage(1);
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: { xs: '100%', md: 160 } }}
              />
              <TextField
                size="small"
                label="Order To"
                type="date"
                value={createdTo}
                onChange={event => {
                  setCreatedTo(event.target.value);
                  setPage(1);
                }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: createdFrom || undefined }}
                sx={{ minWidth: { xs: '100%', md: 160 } }}
              />
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={() => fetchRows(1)}
                disabled={loading}
                sx={{ ...yellowFilledButtonSx, minWidth: 110 }}
              >
                Search
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchRows(page)}
                disabled={loading || !hasSearched}
                sx={{ ...yellowOutlinedButtonSx, minWidth: 110 }}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>
        </SectionCard>

        {loading && <LinearProgress sx={{ mb: 2, borderRadius: 99 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <SectionCard sx={{ overflow: 'hidden' }}>
          <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.08)}` }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
              <Typography variant="subtitle1" fontWeight={900} sx={{ color: BRAND_DARK }}>
                Ordered SKUs and seller template presence
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <ToneChip label={`${Number(pagination.totalOrders || 0).toLocaleString()} orders`} tone="info" />
                <ToneChip label={`${Number(pagination.totalFilteredOrders || 0).toLocaleString()} filtered`} tone="neutral" />
                {Number(pagination.ordersWithoutUsableSku || 0) > 0 ? (
                  <ToneChip label={`${Number(pagination.ordersWithoutUsableSku || 0).toLocaleString()} no SKU`} tone="danger" />
                ) : null}
                <ToneChip label={`${Number(pagination.total || 0).toLocaleString()} SKUs`} tone="warning" />
                <ToneChip label={`Page ${page} of ${pagination.pages || 0}`} tone={rows.length > 0 ? 'warning' : 'success'} />
                {pagination.scannedListings ? (
                  <Typography variant="caption" color="text.secondary">
                    scanned {pagination.scannedListings.toLocaleString()} listings
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          </Box>

          {!hasSearched && !loading ? (
            <Box sx={{ py: 7, textAlign: 'center' }}>
              <Typography fontWeight={800} color="text.secondary">Choose an order date range, then click Search.</Typography>
            </Box>
          ) : rows.length === 0 && !loading ? (
            <Box sx={{ py: 7, textAlign: 'center' }}>
              <Typography fontWeight={800} color="text.secondary">No ordered SKUs found for this date range.</Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ ...tableContainerSx, maxHeight: 'calc(100vh - 350px)', overflow: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 56 }}>#</TableCell>
                      <TableCell sx={tableHeaderCellSx}>SKU</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Sellers</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Listings</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Template Price Range</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Avg Template Price</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Orders</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Order Subtotal</TableCell>
                      <TableCell sx={tableHeaderCellSx}>Profit</TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 52 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, index) => (
                      <SkuRow
                        key={row.sku}
                        row={row}
                        index={(page - 1) * PAGE_SIZE + index}
                        isSelected={lastOpenedSku === row.sku}
                        onOpen={setLastOpenedSku}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {(page > 1 || pagination.hasNextPage) && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: `1px solid ${alpha(BRAND_DARK, 0.08)}` }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Button
                      variant="outlined"
                      startIcon={<NavigateBeforeIcon />}
                      onClick={() => fetchRows(Math.max(1, page - 1))}
                      disabled={loading || page <= 1}
                      sx={yellowOutlinedButtonSx}
                    >
                      Previous
                    </Button>
                    <ToneChip label={`Page ${page} of ${pagination.pages || 0}`} tone="neutral" />
                    <Button
                      variant="outlined"
                      endIcon={<NavigateNextIcon />}
                      onClick={() => fetchRows(page + 1)}
                      disabled={loading || !pagination.hasNextPage}
                      sx={yellowOutlinedButtonSx}
                    >
                      Next
                    </Button>
                  </Stack>
                </Box>
              )}
            </>
          )}
        </SectionCard>
      </AdminPageShell>
    </Fade>
  );
}
