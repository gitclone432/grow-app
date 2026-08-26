import React, { useEffect, useState, useRef, memo, useCallback, useMemo, useSyncExternalStore, forwardRef, useImperativeHandle } from 'react';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  TextField,
  Tooltip,
  IconButton,
  InputAdornment,
  Badge,
  Pagination,
  Link,
  Checkbox,
  FormControlLabel,
  Popover,
  List,
  ListItem,
  useMediaQuery,
  useTheme,
  Collapse,
  Menu,
  ListSubheader,
  Switch,
  Fade
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parseISO, isValid } from 'date-fns';
import {
  computePartialRefundEnterAmount,
  getOrderEarnings,
  PARTIAL_REFUND_TARGET_EARNINGS,
  EBAY_PER_ORDER_FIXED_FEE
} from '../../utils/partialRefundEarnings';

import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import ChatIcon from '@mui/icons-material/Chat';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import SyncIcon from '@mui/icons-material/Sync';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AttachFileIcon from '@mui/icons-material/AttachFile';

import ColumnSelector from '../../components/ColumnSelector';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import api from '../../lib/api';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { publishOrderSyncEvent, subscribeOrderSyncEvent } from '../../lib/orderSyncEvents';
import { getTodayPtDateString } from '../../lib/pacificDate.js';
import { sortSellersByName } from '../../lib/sellersSort';
import ChatModal from '../../components/ChatModal';
import RemarkTemplateManagerModal from '../../components/RemarkTemplateManagerModal';
import ResolutionOptionsModal from '../../components/ResolutionOptionsModal';
import {
  findRemarkTemplateText,
  loadRemarkTemplates,
  remarkOptionsFromTemplates,
  saveRemarkTemplates
} from '../../constants/remarkTemplates';
import ItemCategoryAssignDialog from '../../components/ItemCategoryAssignDialog.jsx';
import FulfillmentSkeleton from '../../components/skeletons/FulfillmentSkeleton';
import FulfillmentCsvImportDialog from '../../components/FulfillmentCsvImportDialog';
import SectionCard from '../../components/SectionCard.jsx';
import { tableHeaderCellSx, tableBodyRowSx, yellowFilledButtonSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';

// --- IMAGE VIEWER DIALOG ---
function ImageDialog({ open, onClose, images }) {
  const theme = useTheme();
  const isMobileDialog = useMediaQuery(theme.breakpoints.down('sm'));
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
    }
  }, [open]);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobileDialog}
    >
      <DialogTitle sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            Images ({currentIndex + 1}/{images.length})
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
        {images.length > 0 ? (
          <Box>
            {/* Main Image */}
            <Box
              sx={{
                width: '100%',
                height: { xs: 'calc(100vh - 200px)', sm: 500 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.100',
                borderRadius: 1,
                mb: 2,
                position: 'relative'
              }}
            >
              <img
                src={images[currentIndex]}
                alt={`Item ${currentIndex + 1}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain'
                }}
              />

              {/* Mobile swipe hint overlay (optional arrows) */}
              {images.length > 1 && isMobileDialog && (
                <>
                  <IconButton
                    onClick={handlePrev}
                    sx={{
                      position: 'absolute',
                      left: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      bgcolor: 'rgba(255,255,255,0.8)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                    }}
                  >
                    <NavigateBeforeIcon />
                  </IconButton>
                  <IconButton
                    onClick={handleNext}
                    sx={{
                      position: 'absolute',
                      right: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      bgcolor: 'rgba(255,255,255,0.8)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                    }}
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </>
              )}
            </Box>

            {/* Navigation Buttons - Desktop only */}
            {images.length > 1 && !isMobileDialog && (
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
                <Button
                  onClick={handlePrev}
                  startIcon={<NavigateBeforeIcon />}
                  variant="outlined"
                >
                  Previous
                </Button>
                <Button
                  onClick={handleNext}
                  endIcon={<NavigateNextIcon />}
                  variant="outlined"
                >
                  Next
                </Button>
              </Stack>
            )}

            {/* Thumbnail Gallery */}
            {images.length > 1 && (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  overflowX: 'auto',
                  pb: 1,
                  justifyContent: { xs: 'flex-start', sm: 'center' },
                  flexWrap: { xs: 'nowrap', sm: 'wrap' }
                }}
              >
                {images.map((img, idx) => (
                  <Box
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    sx={{
                      width: { xs: 60, sm: 80 },
                      height: { xs: 60, sm: 80 },
                      cursor: 'pointer',
                      border: idx === currentIndex ? '3px solid' : '1px solid',
                      borderColor: idx === currentIndex ? 'primary.main' : 'grey.300',
                      borderRadius: 1,
                      overflow: 'hidden',
                      flexShrink: 0,
                      '&:hover': {
                        borderColor: 'primary.main',
                        opacity: 0.8
                      }
                    }}
                  >
                    <img
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        ) : (
          <Alert severity="info">No images available for this item</Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- EARNINGS HELPER ---
// Live from row components (not stale DB orderEarnings):
// subtotal − |discount| − transactionFees − adFeeGeneral − shipping
function isEbayAuOrder(order) {
  const mp = String(order?.purchaseMarketplaceId || '').toUpperCase();
  return mp === 'EBAY_AU' || mp === 'EBAY_AUS';
}

function isEbayGbOrder(order) {
  const mp = String(order?.purchaseMarketplaceId || '').toUpperCase();
  return mp === 'EBAY_GB' || mp === 'EBAY_UK' || mp === 'GB' || mp === 'UK';
}

function isEbayCaOrder(order) {
  const mp = String(order?.purchaseMarketplaceId || '').toUpperCase();
  return mp === 'EBAY_CA' || mp === 'EBAY_ENCA' || mp === 'EBAY_MOTORS_CA' || mp === 'CA';
}

function formatMoneyAmount(value, prefix = '$') {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  return `${prefix}${num.toFixed(2)}`;
}

/** Local marketplace currency: AU$ / £ / C $ / $ for line amounts. */
function formatOrderLocalAmount(order, value) {
  let prefix = '$';
  if (isEbayAuOrder(order)) prefix = 'AU$';
  else if (isEbayGbOrder(order)) prefix = '£';
  else if (isEbayCaOrder(order)) prefix = 'C $';
  return formatMoneyAmount(value, prefix);
}

/** TDS and Ad Fee are always shown in USD ($), even for AU/UK/CA. */
function formatOrderTdsAmount(order, value) {
  return formatMoneyAmount(value, '$');
}

/** eBay discounts are often negative; show as positive in the UI. */
function formatOrderDiscountAmount(order, value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  return formatOrderLocalAmount(order, Math.abs(num));
}

/** Ad fees and earnings are stored in USD for all marketplaces. */
function formatOrderUsdAmount(order, value) {
  return formatMoneyAmount(value, '$');
}

function formatPTWordDate(dateStr) {
  if (!dateStr) return '-';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;

  const [, y, m, d] = match;
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  if (isNaN(date.getTime())) return dateStr;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find(p => p.type === type)?.value || '';

    const day = parseInt(getPart('day'), 10);
    const month = getPart('month');
    const year = getPart('year');

    const getOrdinal = (dVal) => {
      if (dVal > 3 && dVal < 21) return 'th';
      switch (dVal % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${day}${getOrdinal(day)} ${month} ${year}`;
  } catch (e) {
    return dateStr;
  }
}

function formatISTWordDate(utcDateStr) {
  if (!utcDateStr) return '-';
  const date = new Date(utcDateStr);
  if (isNaN(date.getTime())) return utcDateStr;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find(p => p.type === type)?.value || '';

    const day = parseInt(getPart('day'), 10);
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');
    const dayPeriod = getPart('dayPeriod');

    const getOrdinal = (dVal) => {
      if (dVal > 3 && dVal < 21) return 'th';
      switch (dVal % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${day}${getOrdinal(day)} ${month} ${year}, ${hour}:${minute}:${second} ${dayPeriod} IST`;
  } catch (e) {
    return utcDateStr;
  }
}

function formatFullShippingAddress(order, options = {}) {
  const { includePhone = true } = options;
  if (!order) return '';

  const lines = [
    order.shippingFullName,
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    [
      [order.shippingCity, order.shippingState].filter(Boolean).join(', '),
      order.shippingPostalCode
    ].filter(Boolean).join(' '),
    order.shippingCountry
  ].filter((line) => Boolean(line && String(line).trim()));

  if (includePhone) {
    lines.push(`Phone: 0000000000`);
  }

  return lines.join('\n');
}

function orderHasUnreadBuyerMessage(order) {
  if (!order) return false;
  if (order.hasUnreadBuyerMessage) return true;

  const lastBuyerMessageAt = order.lastBuyerMessageAt ? new Date(order.lastBuyerMessageAt) : null;
  const lastSellerMessageAt = order.lastSellerMessageAt ? new Date(order.lastSellerMessageAt) : null;
  if (!lastBuyerMessageAt || Number.isNaN(lastBuyerMessageAt.getTime())) return false;
  if (!lastSellerMessageAt || Number.isNaN(lastSellerMessageAt.getTime())) return true;
  return lastBuyerMessageAt > lastSellerMessageAt;
}

// --- MOBILE ORDER CARD COMPONENT ---
const MobileOrderCard = memo(function MobileOrderCard({ order, index, onCopy, onMessage, onViewImages }) {
  const [expanded, setExpanded] = useState(false);
  const thumbnailUrl = useOrderThumbnail(order._id);

  const productTitle = order.lineItems?.[0]?.title || order.productName || 'Unknown Product';
  const itemId = order.lineItems?.[0]?.legacyItemId || order.itemNumber;
  const buyerName = order.buyer?.buyerRegistrationAddress?.fullName || '-';
  const dateSold = order.dateSold ? new Date(order.dateSold).toLocaleDateString() : '-';

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        borderLeft: 4,
        borderLeftColor: order.cancelState === 'CANCELED' ? 'error.main' :
          order.orderPaymentStatus === 'FULLY_REFUNDED' ? 'warning.main' : 'primary.main'
      }}
    >
      <Stack spacing={1.5}>
        {/* Header: Order ID + Seller */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="caption" color="text.secondary">#{index}</Typography>
            <Typography
              variant="subtitle2"
              fontWeight="bold"
              color="primary.main"
              sx={{ cursor: 'pointer' }}
              onClick={() => onCopy(order.orderId)}
            >
              {order.orderId || order.legacyOrderId || '-'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip
              label={order.seller?.user?.username || 'N/A'}
              size="small"
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
            {order.cancelState && order.cancelState !== 'NONE_REQUESTED' && (
              <Chip
                label={
                  order.cancelState === 'CANCEL_REQUESTED' ? 'Cancel Requested' :
                  order.cancelState === 'CANCEL_REJECTED' ? 'Cancel Rejected' :
                  order.cancelState
                }
                size="small"
                color={order.cancelState === 'CANCEL_REJECTED' ? 'error' : 'warning'}
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            )}
          </Stack>
        </Stack>

        {/* Product with thumbnail */}
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {thumbnailUrl && (
            <Box
              onClick={() => onViewImages(order)}
              sx={{
                width: 60,
                height: 60,
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'grey.300',
                flexShrink: 0,
                cursor: 'pointer'
              }}
            >
              <img
                src={thumbnailUrl}
                alt="Product"
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.3,
                fontSize: '0.85rem'
              }}
            >
              {productTitle}
            </Typography>
            {itemId && (
              <Link
                href={`https://www.ebay.com/itm/${itemId}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontSize: '0.7rem' }}
              >
                ID: {itemId}
              </Link>
            )}
          </Box>
        </Stack>

        {/* Key Info Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Date Sold
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{dateSold}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Earnings
            </Typography>
            <Typography
              variant="body2"
              fontWeight="bold"
              sx={{
                fontSize: '0.9rem',
                color: getOrderEarnings(order) >= 0 ? 'success.main' : 'error.main'
              }}
            >
              {formatOrderUsdAmount(order, getOrderEarnings(order))}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Buyer
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>{buyerName}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Marketplace
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              {order.purchaseMarketplaceId?.replace('EBAY_', '') || '-'}
            </Typography>
          </Box>
        </Box>

        {/* Expandable Details */}
        <Collapse in={expanded}>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={1}>
            {/* Financial Details */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Subtotal</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{formatOrderLocalAmount(order, order.subtotal)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Shipping</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{formatOrderLocalAmount(order, order.shipping)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Transaction Fees</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'error.main' }}>
                  {formatOrderLocalAmount(order, order.transactionFees)}
                </Typography>
              </Box>
              {order.adFeeGeneral > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Ad Fees</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'error.main' }}>
                    {formatOrderUsdAmount(order, order.adFeeGeneral)}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Shipping Address */}
            {order.shippingFullName && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ fontSize: '0.7rem' }}>
                    SHIPPING ADDRESS
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => onCopy(formatFullShippingAddress(order))}
                    startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                    sx={{ minWidth: 'auto', px: 0.75, fontSize: '0.65rem', textTransform: 'none' }}
                  >
                    Copy All
                  </Button>
                </Stack>
                <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight="medium" sx={{ fontSize: '0.8rem' }}>
                      {order.shippingFullName}
                    </Typography>
                    <IconButton size="small" onClick={() => onCopy(order.shippingFullName)}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Stack>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{order.shippingAddressLine1}</Typography>
                  {order.shippingAddressLine2 && (
                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{order.shippingAddressLine2}</Typography>
                  )}
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{order.shippingCountry}</Typography>
                </Stack>
              </Box>
            )}

            {/* Tracking */}
            {order.trackingNumber && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary">Tracking:</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {order.trackingNumber}
                </Typography>
                <IconButton size="small" onClick={() => onCopy(order.trackingNumber)}>
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            )}

            {/* Notes */}
            {order.fulfillmentNotes && (
              <Box sx={{ p: 1, bgcolor: 'warning.light', borderRadius: 1, opacity: 0.8 }}>
                <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                  📝 {order.fulfillmentNotes}
                </Typography>
              </Box>
            )}
          </Stack>
        </Collapse>

        {/* Action Row */}
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Button
            size="small"
            variant="text"
            onClick={() => setExpanded(!expanded)}
            endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
          >
            {expanded ? 'Less' : 'More Details'}
          </Button>
          <Stack direction="row" spacing={0.5}>
            <IconButton size="small" onClick={() => onCopy(order.orderId)} title="Copy Order ID">
              <ContentCopyIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Tooltip title="Open conversation">
              <Button
                size="small"
                variant="outlined"
                startIcon={(
                  <Badge
                    color="error"
                    variant="dot"
                    overlap="circular"
                    invisible={!orderHasUnreadBuyerMessage(order)}
                    sx={{ '& .MuiBadge-badge': { boxShadow: '0 0 0 2px #fff' } }}
                  >
                    <ChatIcon fontSize="small" />
                  </Badge>
                )}
                onClick={() => onMessage(order)}
                sx={{ ...yellowOutlinedButtonSx, minHeight: 28, px: 1, fontSize: '0.7rem' }}
              >
                Open
              </Button>
            </Tooltip>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
});

const NotesCell = memo(function NotesCell({ order, onSave, onNotify }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [tempValue, setTempValue] = React.useState(order.fulfillmentNotes || '');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setTempValue(order.fulfillmentNotes || '');
    }
  }, [order.fulfillmentNotes, isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(order._id, tempValue);
      setIsEditing(false);
      onNotify('success', 'Note saved successfully');
    } catch (e) {
      onNotify('error', 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTempValue(order.fulfillmentNotes || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 200 }}
      >
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          placeholder="Enter note..."
          autoFocus
        />
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={isSaving}
            sx={{ fontSize: '0.7rem', py: 0.5 }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleCancel}
            disabled={isSaving}
            sx={{ fontSize: '0.7rem', py: 0.5 }}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      sx={{
        cursor: 'pointer',
        minHeight: 30,
        minWidth: 150,
        display: 'flex',
        alignItems: 'center',
        '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 1 }
      }}
    >
      {order.fulfillmentNotes ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
          {order.fulfillmentNotes}
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          + Add Note
        </Typography>
      )}
    </Box>
  );
});

const EditableCell = memo(function EditableCell({ value, type = 'text', onSave }) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value || '');




  useEffect(() => { setTempValue(value || ''); }, [value]);

  const handleSave = () => { onSave(tempValue); setEditing(false); };

  if (editing) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <TextField
          size="small" type={type} value={tempValue} autoFocus
          onChange={(e) => setTempValue(e.target.value)}
          sx={{ width: type === 'date' ? 130 : 80, '& input': { p: 0.5 } }}
        />
        <Button size="small" variant="contained" onClick={handleSave} sx={{ minWidth: 30, p: 0.5 }}>✓</Button>
        <Button size="small" onClick={() => setEditing(false)} sx={{ minWidth: 20, p: 0.5 }}>X</Button>
      </Stack>
    );
  }

  let display = value;
  if (type === 'date' && value) display = new Date(value).toLocaleDateString();
  else if (type === 'number' && value) display = `$${Number(value).toFixed(2)}`;

  return (
    <Box onClick={() => setEditing(true)} sx={{ cursor: 'pointer', minHeight: 24, borderBottom: '1px dashed transparent', '&:hover': { borderBottom: '1px dashed #ccc' } }}>
      <Typography variant="body2" color={!display ? 'text.disabled' : 'text.primary'}>{display || '-'}</Typography>
    </Box>
  );
});

// Sticky header cell style — extracted to avoid re-creating per render
const HEADER_CELL_SX = { ...tableHeaderCellSx, position: 'sticky', top: 0, zIndex: 100 };
const HEADER_CELL_RIGHT_SX = { ...HEADER_CELL_SX, textAlign: 'right' };
const BODY_CELL_SX = { py: 0.5, fontSize: '0.8125rem' };
const FILTER_SWITCH_SX = {
  m: 0,
  px: 1,
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1.5,
  boxSizing: 'border-box',
  '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
  '& .MuiSwitch-root': { transform: 'scale(0.85)' },
};

// Thumbnail URLs live outside React state so arrivals don't re-render the whole dashboard
const thumbnailUrlMap = new Map();
const thumbnailListeners = new Map();
function subscribeThumbnail(orderId, onStoreChange) {
  if (!thumbnailListeners.has(orderId)) thumbnailListeners.set(orderId, new Set());
  thumbnailListeners.get(orderId).add(onStoreChange);
  return () => thumbnailListeners.get(orderId)?.delete(onStoreChange);
}
function getThumbnailUrl(orderId) {
  return thumbnailUrlMap.get(orderId) || null;
}
function setThumbnailUrl(orderId, url) {
  if (thumbnailUrlMap.get(orderId) === url) return;
  thumbnailUrlMap.set(orderId, url);
  thumbnailListeners.get(orderId)?.forEach((listener) => listener());
}
function useOrderThumbnail(orderId) {
  return useSyncExternalStore(
    (onStoreChange) => subscribeThumbnail(orderId, onStoreChange),
    () => getThumbnailUrl(orderId),
    () => null
  );
}

/** Memoized product column (row hot-path) — thumbnail store updates only re-render this cell */
const FulfillmentOrderRow = memo(function FulfillmentOrderRow({
  order,
  imageCount,
  loadingImages,
  onViewImages,
  onCopy,
}) {
  const thumbnailUrl = useOrderThumbnail(order._id);

  return (
    <TableCell sx={{ ...BODY_CELL_SX, minWidth: 280, maxWidth: 400, pr: 1 }}>
      <Stack spacing={0.5} sx={{ py: 0.35 }}>
        {order.lineItems && order.lineItems.length > 0 ? (
          order.lineItems.map((item, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.75,
                borderBottom: i < order.lineItems.length - 1 ? '1px dashed rgba(0,0,0,0.1)' : 'none',
                pb: i < order.lineItems.length - 1 ? 0.5 : 0,
              }}
            >
              <Chip
                label={`x${item.quantity}`}
                size="small"
                color={item.quantity > 1 ? 'warning' : 'default'}
                sx={{
                  height: 20,
                  minWidth: 30,
                  fontWeight: 'bold',
                  fontSize: '0.7rem',
                  borderRadius: 1,
                  backgroundColor: item.quantity > 1 ? '#ed6c02' : '#e0e0e0',
                  color: item.quantity > 1 ? '#fff' : 'rgba(0,0,0,0.87)',
                }}
              />

              {i === 0 && thumbnailUrl && (
                <Box
                  onClick={() => onViewImages(order)}
                  sx={{
                    width: 34,
                    height: 34,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    overflow: 'hidden',
                    flexShrink: 0,
                    position: 'relative',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: 1,
                    },
                  }}
                >
                  <img
                    src={thumbnailUrl}
                    alt="Product"
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {imageCount > 1 && (
                    <Chip
                      label={`+${imageCount - 1}`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        bottom: 1,
                        right: 1,
                        height: 14,
                        fontSize: '0.55rem',
                        bgcolor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        '& .MuiChip-label': { px: 0.35 },
                      }}
                    />
                  )}
                  {loadingImages && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        bgcolor: 'rgba(255,255,255,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CircularProgress size={16} />
                    </Box>
                  )}
                </Box>
              )}

              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <Tooltip title={item.title} arrow placement="top">
                  <Typography
                    variant="body2"
                    sx={{
                      lineHeight: 1.2,
                      fontSize: '0.8125rem',
                      fontWeight: item.quantity > 1 ? 500 : 400,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.title}
                  </Typography>
                </Tooltip>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                  <Link
                    href={`https://www.ebay.com/itm/${item.legacyItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
                  >
                    <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500 }}>
                      ID: {item.legacyItemId}
                    </Typography>
                    <OpenInNewIcon sx={{ fontSize: 11, color: 'primary.main' }} />
                  </Link>
                </Stack>
              </Box>

              <IconButton
                size="small"
                onClick={() => onCopy(item.title)}
                aria-label="copy product name"
                sx={{ mt: -0.5, p: 0.35 }}
              >
                <ContentCopyIcon sx={{ fontSize: '0.9rem' }} />
              </IconButton>
            </Box>
          ))
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip label="x1" size="small" sx={{ height: 20 }} />
            <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
              {order.productName || '-'}
            </Typography>
          </Box>
        )}
      </Stack>
    </TableCell>
  );
});

const getOrderSku = (order) => {
  if (!order) return '';
  if (order.sku) return String(order.sku);
  if (Array.isArray(order.lineItems)) {
    const skuFromLine = order.lineItems.find((item) => item?.sku)?.sku;
    if (skuFromLine) return String(skuFromLine);
  }
  return '';
};

const getSupplierLink = (order) => String(order?.supplierLink || order?.affiliateLink || '').trim();

const createEmptyDateFilter = () => ({ mode: 'none', single: '', from: '', to: '' });

const DATE_PRESET_MODES = new Set([
  'last90',
  'today',
  'yesterday',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
]);

/** Shift a YYYY-MM-DD calendar date by N days (timezone-agnostic calendar math). */
const shiftYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

/** Preset ranges use Pacific (America/Los_Angeles) calendar days — matches stored-orders PT bounds. */
const getPresetDateRange = (mode) => {
  const todayPt = getTodayPtDateString(); // YYYY-MM-DD in PDT/PST
  const [y, m] = todayPt.split('-').map(Number);

  switch (mode) {
    case 'today':
      return { from: todayPt, to: todayPt };
    case 'yesterday': {
      const yesterday = shiftYmd(todayPt, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'last90':
      // Inclusive of today → 90 PT calendar days
      return { from: shiftYmd(todayPt, -89), to: todayPt };
    case 'thisMonth':
      return {
        from: `${y}-${String(m).padStart(2, '0')}-01`,
        to: todayPt,
      };
    case 'lastMonth': {
      const lastDayPrev = new Date(Date.UTC(y, m - 1, 0)); // day 0 of current month
      const from = `${lastDayPrev.getUTCFullYear()}-${String(lastDayPrev.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const to = `${lastDayPrev.getUTCFullYear()}-${String(lastDayPrev.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDayPrev.getUTCDate()).padStart(2, '0')}`;
      return { from, to };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: todayPt };
    case 'lastYear':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return null;
  }
};

const normalizeDateFilter = (value) => {
  const base = value && typeof value === 'object'
    ? { ...createEmptyDateFilter(), ...value }
    : createEmptyDateFilter();

  if (DATE_PRESET_MODES.has(base.mode)) {
    const range = getPresetDateRange(base.mode);
    if (range) {
      return { ...base, single: '', from: range.from, to: range.to };
    }
  }

  return base;
};

const applyDateFilterParams = (params, dateFilter) => {
  if (!dateFilter || dateFilter.mode === 'none') return;

  if (dateFilter.mode === 'single' && dateFilter.single) {
    params.startDate = dateFilter.single;
    params.endDate = dateFilter.single;
    return;
  }

  if (dateFilter.mode === 'range' || DATE_PRESET_MODES.has(dateFilter.mode)) {
    const resolved = DATE_PRESET_MODES.has(dateFilter.mode)
      ? (getPresetDateRange(dateFilter.mode) || dateFilter)
      : dateFilter;
    if (resolved.from) params.startDate = resolved.from;
    if (resolved.to) params.endDate = resolved.to;
  }
};

const DateModeSearchBar = memo(function DateModeSearchBar({
  sellers = [],
  draftSelectedSeller,
  setDraftSelectedSeller,
  draftDateFilter,
  setDraftDateFilter,
  onSearch,
  onClear,
  fullWidth = false,
  sellerFullWidth = false,
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      sx={{ flexWrap: 'wrap', flex: fullWidth ? 1 : 'none' }}
    >
      {sellerFullWidth ? (
        <FormControl size="small" fullWidth>
          <InputLabel id="seller-select-label">Select Seller</InputLabel>
          <Select
            labelId="seller-select-label"
            value={draftSelectedSeller}
            label="Select Seller"
            onChange={(e) => setDraftSelectedSeller(e.target.value)}
          >
            <MenuItem value="">
              <em>-- Select Seller --</em>
            </MenuItem>
            {sellers.map((s) => (
              <MenuItem key={s._id} value={s._id}>
                {s.user?.username || s.user?.email || s._id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <Select
          value={draftSelectedSeller}
          onChange={(e) => setDraftSelectedSeller(e.target.value)}
          displayEmpty
          size="small"
          renderValue={(val) => val ? (sellers.find(s => s._id === val)?.user?.username || sellers.find(s => s._id === val)?.user?.email || val) : 'Select Seller'}
          sx={{ minWidth: 140, fontSize: '0.8rem', color: draftSelectedSeller ? 'inherit' : 'text.secondary' }}
        >
          <MenuItem value="">
            <em>All Sellers</em>
          </MenuItem>
          {sellers.map((s) => (
            <MenuItem key={s._id} value={s._id}>
              {s.user?.username || s.user?.email || s._id}
            </MenuItem>
          ))}
        </Select>
      )}

      <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
        <InputLabel id="date-mode-label">Date Mode</InputLabel>
        <Select
          labelId="date-mode-label"
          value={draftDateFilter.mode}
          label="Date Mode"
          onChange={(e) => {
            const mode = e.target.value;
            if (mode === 'none') {
              setDraftDateFilter(createEmptyDateFilter());
              return;
            }
            const preset = getPresetDateRange(mode);
            if (preset) {
              setDraftDateFilter({ mode, single: '', from: preset.from, to: preset.to });
              return;
            }
            setDraftDateFilter((prev) => ({
              ...prev,
              mode,
              ...(mode === 'single' ? { from: '', to: '' } : { single: '' }),
            }));
          }}
        >
          <MenuItem value="none">None</MenuItem>
          <MenuItem value="single">Single Day</MenuItem>
          <MenuItem value="range">Date Range</MenuItem>
          <MenuItem value="today">Today</MenuItem>
          <MenuItem value="yesterday">Yesterday</MenuItem>
          <MenuItem value="thisMonth">This Month</MenuItem>
          <MenuItem value="lastMonth">Last Month</MenuItem>
          <MenuItem value="last90">Last 90 Days</MenuItem>
          <MenuItem value="thisYear">This Year</MenuItem>
          <MenuItem value="lastYear">Last Year</MenuItem>
        </Select>
      </FormControl>

      {draftDateFilter.mode === 'single' && (
        <TextField
          size="small"
          label="Date"
          type="date"
          value={draftDateFilter.single}
          onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, single: e.target.value }))}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: '100%', sm: 150 } }}
        />
      )}

      {draftDateFilter.mode === 'range' && (
        <Stack direction="row" spacing={1} sx={{ flex: { xs: 1, sm: 'none' } }}>
          <TextField
            size="small"
            label="From"
            type="date"
            value={draftDateFilter.from}
            onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, from: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '50%', sm: 150 } }}
          />
          <TextField
            size="small"
            label="To"
            type="date"
            value={draftDateFilter.to}
            onChange={(e) => setDraftDateFilter((prev) => ({ ...prev, to: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '50%', sm: 150 } }}
          />
        </Stack>
      )}

      <Button
        size="small"
        variant="contained"
        onClick={onSearch}
        startIcon={<SearchIcon />}
        sx={{ ...yellowFilledButtonSx, minWidth: { xs: '100%', sm: 90 }, height: 40 }}
      >
        Search
      </Button>

      <Button
        size="small"
        variant="outlined"
        onClick={onClear}
        sx={{ ...yellowOutlinedButtonSx, minWidth: { xs: '100%', sm: 80 }, height: 40 }}
      >
        Clear
      </Button>
    </Stack>
  );
});

const SearchFiltersPanel = memo(forwardRef(function SearchFiltersPanel({
  searchOrderId, setSearchOrderId,
  searchAzOrderId, setSearchAzOrderId,
  searchBuyerName, setSearchBuyerName,
  searchItemId, setSearchItemId,
  searchSku, setSearchSku,
  searchProductName, setSearchProductName,
  searchPaymentStatus, setSearchPaymentStatus,
  searchCancelStatus, setSearchCancelStatus,
  searchIssueType, setSearchIssueType,
  searchCaseCategory, setSearchCaseCategory,
  searchCaseStatus, setSearchCaseStatus,
  draftSelectedSeller, setDraftSelectedSeller, setSelectedSeller,
  draftDateFilter, setDraftDateFilter,
  setDateFilter,
  onApplyFilters,
  isSmallMobile,
}, ref) {
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      const stored = sessionStorage.getItem('fulfillment_dashboard_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed['filtersExpanded'] !== undefined ? parsed['filtersExpanded'] : false;
      }
    } catch (e) { }
    return false;
  });

  useEffect(() => {
    if (isSmallMobile && filtersExpanded) {
      setFiltersExpanded(false);
    }
  }, []); // Only run on mount

  // Local draft for ALL search filters — only committed when Search (or Enter) is pressed.
  const [localOrderId, setLocalOrderId] = useState(searchOrderId);
  const [localAzOrderId, setLocalAzOrderId] = useState(searchAzOrderId);
  const [localBuyerName, setLocalBuyerName] = useState(searchBuyerName);
  const [localItemId, setLocalItemId] = useState(searchItemId);
  const [localSku, setLocalSku] = useState(searchSku);
  const [localProductName, setLocalProductName] = useState(searchProductName);
  const [localPaymentStatus, setLocalPaymentStatus] = useState(searchPaymentStatus);
  const [localCancelStatus, setLocalCancelStatus] = useState(searchCancelStatus);
  const [localIssueType, setLocalIssueType] = useState(searchIssueType);
  const [localCaseCategory, setLocalCaseCategory] = useState(searchCaseCategory);
  const [localCaseStatus, setLocalCaseStatus] = useState(searchCaseStatus);

  // Keep local drafts in sync when parent clears / applies externally.
  useEffect(() => { setLocalOrderId(searchOrderId); }, [searchOrderId]);
  useEffect(() => { setLocalAzOrderId(searchAzOrderId); }, [searchAzOrderId]);
  useEffect(() => { setLocalBuyerName(searchBuyerName); }, [searchBuyerName]);
  useEffect(() => { setLocalItemId(searchItemId); }, [searchItemId]);
  useEffect(() => { setLocalSku(searchSku); }, [searchSku]);
  useEffect(() => { setLocalProductName(searchProductName); }, [searchProductName]);
  useEffect(() => { setLocalPaymentStatus(searchPaymentStatus); }, [searchPaymentStatus]);
  useEffect(() => { setLocalCancelStatus(searchCancelStatus); }, [searchCancelStatus]);
  useEffect(() => { setLocalIssueType(searchIssueType); }, [searchIssueType]);
  useEffect(() => { setLocalCaseCategory(searchCaseCategory); }, [searchCaseCategory]);
  useEffect(() => { setLocalCaseStatus(searchCaseStatus); }, [searchCaseStatus]);

  // Commit drafts → parent (seller/date + search filters), then force a fetch.
  const handleSearch = useCallback(() => {
    setSearchOrderId(localOrderId);
    setSearchAzOrderId(localAzOrderId);
    setSearchBuyerName(localBuyerName);
    setSearchItemId(localItemId);
    setSearchSku(localSku);
    setSearchProductName(localProductName);
    setSearchPaymentStatus(localPaymentStatus);
    setSearchCancelStatus(localCancelStatus);
    setSearchIssueType(localIssueType);
    setSearchCaseCategory(localCaseCategory);
    setSearchCaseStatus(localCaseStatus);
    setSelectedSeller(draftSelectedSeller);
    setDateFilter(normalizeDateFilter(draftDateFilter));
    onApplyFilters?.({
      sellerId: draftSelectedSeller,
      dateFilter: normalizeDateFilter(draftDateFilter),
      searchOrderId: localOrderId,
      searchAzOrderId: localAzOrderId,
      searchBuyerName: localBuyerName,
      searchItemId: localItemId,
      searchSku: localSku,
      searchProductName: localProductName,
      searchPaymentStatus: localPaymentStatus,
      searchCancelStatus: localCancelStatus,
      searchIssueType: localIssueType,
      searchCaseCategory: localCaseCategory,
      searchCaseStatus: localCaseStatus,
    });
  }, [
    localOrderId, localAzOrderId, localBuyerName, localItemId, localSku, localProductName,
    localPaymentStatus, localCancelStatus, localIssueType, localCaseCategory, localCaseStatus,
    draftSelectedSeller, draftDateFilter,
    setSearchOrderId, setSearchAzOrderId, setSearchBuyerName, setSearchItemId, setSearchSku, setSearchProductName,
    setSearchPaymentStatus, setSearchCancelStatus, setSearchIssueType, setSearchCaseCategory, setSearchCaseStatus,
    setSelectedSeller, setDateFilter, onApplyFilters,
  ]);

  const handleClear = useCallback(() => {
    const clearedDateFilter = createEmptyDateFilter();

    setLocalOrderId('');
    setLocalAzOrderId('');
    setLocalBuyerName('');
    setLocalItemId('');
    setLocalSku('');
    setLocalProductName('');
    setLocalPaymentStatus('');
    setLocalCancelStatus('');
    setLocalIssueType('');
    setLocalCaseCategory('');
    setLocalCaseStatus('');
    setDraftSelectedSeller('');
    setDraftDateFilter(clearedDateFilter);

    setSearchOrderId('');
    setSearchAzOrderId('');
    setSearchBuyerName('');
    setSearchItemId('');
    setSearchSku('');
    setSearchProductName('');
    setSearchPaymentStatus('');
    setSearchCancelStatus('');
    setSearchIssueType('');
    setSearchCaseCategory('');
    setSearchCaseStatus('');
    setSelectedSeller('');
    setDateFilter(clearedDateFilter);
    onApplyFilters?.({
      sellerId: '',
      dateFilter: clearedDateFilter,
      searchOrderId: '',
      searchAzOrderId: '',
      searchBuyerName: '',
      searchItemId: '',
      searchSku: '',
      searchProductName: '',
      searchPaymentStatus: '',
      searchCancelStatus: '',
      searchIssueType: '',
      searchCaseCategory: '',
      searchCaseStatus: '',
    });
  }, [
    setDraftSelectedSeller, setDraftDateFilter,
    setSearchOrderId, setSearchAzOrderId, setSearchBuyerName, setSearchItemId, setSearchSku, setSearchProductName,
    setSearchPaymentStatus, setSearchCancelStatus, setSearchIssueType, setSearchCaseCategory, setSearchCaseStatus,
    setSelectedSeller,
    setDateFilter,
    onApplyFilters,
  ]);

  useImperativeHandle(ref, () => ({
    search: handleSearch,
    clear: handleClear,
  }), [handleSearch, handleClear]);

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };

  return (
    <Box sx={{ mt: 1, p: { xs: 1, sm: 1.25 }, backgroundColor: 'action.hover', borderRadius: 1 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setFiltersExpanded(prev => !prev)}
      >
        <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
          Search Filters
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flex: 1, display: { xs: 'none', sm: 'block' } }}>
          Fill fields, then click Search above (or press Enter)
        </Typography>
        <IconButton size="small">
          {filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={filtersExpanded}>
        <Stack spacing={{ xs: 1, sm: 1.25 }} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}>
            <TextField
              size="small"
              label="Order ID"
              value={localOrderId}
              onChange={(e) => setLocalOrderId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by order ID..."
              sx={{ flex: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              label="Amazon Order ID"
              value={localAzOrderId}
              onChange={(e) => setLocalAzOrderId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by Amazon order ID..."
              sx={{ flex: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              label="Buyer Name"
              value={localBuyerName}
              onChange={(e) => setLocalBuyerName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by buyer name..."
              sx={{ flex: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              label="Item ID"
              value={localItemId}
              onChange={(e) => setLocalItemId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by item ID..."
              sx={{ flex: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              label="SKU"
              value={localSku}
              onChange={(e) => setLocalSku(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by SKU..."
              sx={{ flex: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              label="Product Name"
              value={localProductName}
              onChange={(e) => setLocalProductName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by product name..."
              sx={{ flex: 1 }}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 }, maxWidth: { sm: 240 } }}>
              <InputLabel id="payment-status-filter-label">Payment Status</InputLabel>
              <Select
                labelId="payment-status-filter-label"
                value={localPaymentStatus}
                label="Payment Status"
                onChange={(e) => setLocalPaymentStatus(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                <MenuItem value="FULLY_REFUNDED">FULLY_REFUNDED</MenuItem>
                <MenuItem value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 }, maxWidth: { sm: 240 } }}>
              <InputLabel id="cancel-status-filter-label">Cancel Status</InputLabel>
              <Select
                labelId="cancel-status-filter-label"
                value={localCancelStatus}
                label="Cancel Status"
                onChange={(e) => setLocalCancelStatus(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                <MenuItem value="NONE_REQUESTED">NONE_REQUESTED</MenuItem>
                <MenuItem value="CANCEL_REQUESTED">CANCEL_REQUESTED</MenuItem>
                <MenuItem value="IN_PROGRESS">IN_PROGRESS</MenuItem>
                <MenuItem value="CANCELED">CANCELED</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 }, maxWidth: { sm: 220 } }}>
              <InputLabel id="issue-type-filter-label">Issues</InputLabel>
              <Select
                labelId="issue-type-filter-label"
                value={localIssueType}
                label="Issues"
                onChange={(e) => setLocalIssueType(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                <MenuItem value="ANY">Any Issue</MenuItem>
                <MenuItem value="INR">INR</MenuItem>
                <MenuItem value="SNAD">SNAD</MenuItem>
                <MenuItem value="Return">Return</MenuItem>
                <MenuItem value="Dispute">Dispute</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 }, maxWidth: { sm: 240 } }}>
              <InputLabel id="case-category-filter-label">Case Category</InputLabel>
              <Select
                labelId="case-category-filter-label"
                value={localCaseCategory}
                label="Case Category"
                onChange={(e) => setLocalCaseCategory(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                <MenuItem value="On Hold">On Hold</MenuItem>
                <MenuItem value="INR">INR</MenuItem>
                <MenuItem value="Cancellation">Cancellation</MenuItem>
                <MenuItem value="Return">Return</MenuItem>
                <MenuItem value="Refund">Refund</MenuItem>
                <MenuItem value="Replace">Replace</MenuItem>
                <MenuItem value="Out of Stock">Out of Stock</MenuItem>
                <MenuItem value="Issue with Product">Issue with Product</MenuItem>
                <MenuItem value="Issue with Delivery">Issue with Delivery</MenuItem>
                <MenuItem value="Inquiry">Inquiry</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 }, maxWidth: { sm: 220 } }}>
              <InputLabel id="case-status-filter-label">Case Status</InputLabel>
              <Select
                labelId="case-status-filter-label"
                value={localCaseStatus}
                label="Case Status"
                onChange={(e) => setLocalCaseStatus(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                <MenuItem value="Case Opened">Case Opened</MenuItem>
                <MenuItem value="Case Not Opened">Case Not Opened</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Collapse>
    </Box>
  );
}));

function FulfillmentDashboard() {
  // Get user role for permission checks
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = currentUser.role === 'superadmin';

  // Mobile responsiveness
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [sellers, setSellers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollResults, setPollResults] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  // Image viewer state
  const [itemImages, setItemImages] = useState({}); // { orderId: [imageUrls] }
  const [loadingImages, setLoadingImages] = useState({}); // { orderId: boolean }
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imageCount, setImageCount] = useState(0); // Total image count

  // Earnings breakdown modal
  const [earningsDialogOpen, setEarningsDialogOpen] = useState(false);
  const [selectedOrderForEarnings, setSelectedOrderForEarnings] = useState(null);

  // Session storage key for persisting state
  const STORAGE_KEY = 'fulfillment_dashboard_state';

  // Helper to get initial state from sessionStorage
  const getInitialState = (key, defaultValue) => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed[key] !== undefined ? parsed[key] : defaultValue;
      }
    } catch (e) {
      console.error('Error reading sessionStorage:', e);
    }
    return defaultValue;
  };

  // Search filters - restored from sessionStorage
  const [selectedSeller, setSelectedSeller] = useState(() => getInitialState('selectedSeller', ''));
  const [draftSelectedSeller, setDraftSelectedSeller] = useState(() => getInitialState('selectedSeller', ''));
  const [searchOrderId, setSearchOrderId] = useState(() => getInitialState('searchOrderId', ''));
  const [searchAzOrderId, setSearchAzOrderId] = useState(() => getInitialState('searchAzOrderId', ''));
  const [searchBuyerName, setSearchBuyerName] = useState(() => getInitialState('searchBuyerName', ''));
  const [searchItemId, setSearchItemId] = useState(() => getInitialState('searchItemId', ''));
  const [searchSku, setSearchSku] = useState(() => getInitialState('searchSku', ''));
  const [searchProductName, setSearchProductName] = useState(() => getInitialState('searchProductName', ''));
  //const [searchSoldDate, setSearchSoldDate] = useState('');
  const [searchMarketplace, setSearchMarketplace] = useState(() => getInitialState('searchMarketplace', ''));
  const [searchPaymentStatus, setSearchPaymentStatus] = useState(() => getInitialState('searchPaymentStatus', ''));
  const [searchCancelStatus, setSearchCancelStatus] = useState(() => getInitialState('searchCancelStatus', ''));
  const [searchIssueType, setSearchIssueType] = useState(() => getInitialState('searchIssueType', ''));
  const [searchCaseCategory, setSearchCaseCategory] = useState(() => getInitialState('searchCaseCategory', ''));
  const [searchCaseStatus, setSearchCaseStatus] = useState(() => getInitialState('searchCaseStatus', ''));
  const [excludeClient, setExcludeClient] = useState(() => getInitialState('excludeClient', true));
  const [excludeLowValue, setExcludeLowValue] = useState(() => getInitialState('excludeLowValue', true));
  const [missingAmazonAccount, setMissingAmazonAccount] = useState(() => getInitialState('missingAmazonAccount', false));
  const [dateFilter, setDateFilter] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.dateFilter !== undefined) {
          return normalizeDateFilter(parsed.dateFilter);
        }
      }
    } catch (e) {
      console.error('Error reading dateFilter from sessionStorage:', e);
    }
    return createEmptyDateFilter();
  });
  const [draftDateFilter, setDraftDateFilter] = useState(() => normalizeDateFilter(dateFilter));
  const searchFiltersRef = useRef(null);

  useEffect(() => {
    setDraftDateFilter(normalizeDateFilter(dateFilter));
  }, [dateFilter]);

  useEffect(() => {
    setDraftSelectedSeller(selectedSeller);
  }, [selectedSeller]);

  const [scopeWarning, setScopeWarning] = useState('');

  // Pagination state - restored from sessionStorage
  const [currentPage, setCurrentPage] = useState(() => getInitialState('currentPage', 1));
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [ordersPerPage] = useState(50);

  // Expanded shipping address - only one can be expanded at a time (accordion behavior)
  const [expandedShippingId, setExpandedShippingId] = useState(null);

  // Editing messaging status
  const [editingMessagingStatus, setEditingMessagingStatus] = useState({});

  // Recalculate Earnings state
  const [recalcEarningsLoading, setRecalcEarningsLoading] = useState(false);
  const [recalcAmazonLoading, setRecalcAmazonLoading] = useState(false);
  const [backfillEverythingLoading, setBackfillEverythingLoading] = useState(false);
  const [pollTdsLoading, setPollTdsLoading] = useState(false);
  const [fetchingAdFeeGeneral, setFetchingAdFeeGeneral] = useState({});
  const [fetchingCancelStatus, setFetchingCancelStatus] = useState({});

  // Auto-message state
  const [autoMessageLoading, setAutoMessageLoading] = useState(false);
  const [autoMessageStats, setAutoMessageStats] = useState(null);

  // Resync window state
  const [resyncDays, setResyncDays] = useState(7);
  const [moreActionsAnchor, setMoreActionsAnchor] = useState(null);

  // PT (Pacific Time) refresh state — refreshes existing orders created on a specific PT date/range
  const todayUTC = new Date().toISOString().slice(0, 10);
  const [utcRefreshMode, setUtcRefreshMode] = useState('single');
  const [utcRefreshStartDate, setUtcRefreshStartDate] = useState(todayUTC);
  const [utcRefreshEndDate, setUtcRefreshEndDate] = useState(todayUTC);
  const [utcRefreshConfirmOpen, setUtcRefreshConfirmOpen] = useState(false);
  const utcRefreshClickTimeRef = useRef(null);
  const [ptRefreshPreview, setPtRefreshPreview] = useState(null);
  const [ptRefreshPreviewLoading, setPtRefreshPreviewLoading] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Editing item status
  const [editingItemStatus, setEditingItemStatus] = useState({});

  // Remark message confirmation state
  const [remarkConfirmOpen, setRemarkConfirmOpen] = useState(false);
  const [pendingRemarkUpdate, setPendingRemarkUpdate] = useState(null);
  const [sendingRemarkMessage, setSendingRemarkMessage] = useState(false);
  const [editableRemarkMessage, setEditableRemarkMessage] = useState('');
  const [remarkAttachments, setRemarkAttachments] = useState([]);
  const fileInputRefRemark = useRef(null);
  const [remarkTemplates, setRemarkTemplates] = useState([]);
  const [manageRemarkTemplatesOpen, setManageRemarkTemplatesOpen] = useState(false);

  const normalizeRemarkValue = useCallback((value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === 'select') return null;
    return trimmed;
  }, []);

  // CSV Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // selectedExportColumns is initialized after ALL_COLUMNS is defined

  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');
  const [snackbarOrderIds, setSnackbarOrderIds] = useState([]); // Store order IDs for copying
  const [updatedOrderDetails, setUpdatedOrderDetails] = useState([]); // Store { orderId, changedFields }

  // Editing order earnings
  // (orderEarnings is now read-only, calculated server-side from order components)

  const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);

  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');

  const [amazonAccounts, setAmazonAccounts] = useState([]);
  const [creditCards, setCreditCards] = useState([]);
  const [resolutionOptions, setResolutionOptions] = useState([]);
  const [manageResolutionOptionsOpen, setManageResolutionOptionsOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);

  // Issues index: maps orderId -> [{type, status}] for INR/Return/Dispute chips
  const [issuesIndex, setIssuesIndex] = useState({});

  // CRP (Category/Range/Product) assignment dialog state
  const [crpDialogOpen, setCrpDialogOpen] = useState(false);
  const [crpDialogOrder, setCrpDialogOrder] = useState(null);

  // Column visibility state - persisted in sessionStorage
  const DEFAULT_VISIBLE_COLUMNS = [
    'seller', 'orderId', 'dateSold', 'shipBy', 'deliveryDate', 'productName', 'sku', 'supplierLink', 'itemCategory', 'buyerNote',
    'buyerName', 'shippingAddress', 'marketplace', 'subtotal',
    'shipping', 'salesTax', 'discount', 'transactionFees',
    'adFeeGeneral', 'tds', 'cancelStatus', 'refunds', 'reviewedRefund', 'orderEarnings', 'trackingNumber',
    'amazonAccount', 'arriving', 'beforeTax', 'estimatedTax',
    'azOrderId', 'amazonRefund', 'cardName', 'resolution', 'notes', 'messagingStatus', 'remark', 'issueFlags',
    'convoCategory', 'convoCaseStatus'
  ];

  const ALL_COLUMNS = [
    { id: 'seller', label: 'Seller' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'dateSold', label: 'Date Sold' },
    { id: 'shipBy', label: 'Ship By' },
    { id: 'deliveryDate', label: 'Delivery Date' },
    { id: 'productName', label: 'Product Name' },
    { id: 'sku', label: 'SKU' },
    { id: 'supplierLink', label: 'Supplier Link' },
    { id: 'itemCategory', label: 'Category' },
    { id: 'buyerNote', label: 'Buyer Note' },
    { id: 'buyerName', label: 'Buyer Name' },
    { id: 'shippingAddress', label: 'Shipping Address' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'subtotal', label: 'Subtotal' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'salesTax', label: 'Sales Tax' },
    { id: 'discount', label: 'Discount' },
    { id: 'transactionFees', label: 'Transaction Fees' },
    { id: 'adFeeGeneral', label: 'Ad Fee General' },
    { id: 'tds', label: 'TDS' },
    { id: 'cancelStatus', label: 'Cancel Status' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'reviewedRefund', label: 'Reviewed Refund' },
    { id: 'refundItemAmount', label: 'Refund Item' },
    { id: 'refundTaxAmount', label: 'Refund Tax' },
    { id: 'refundTotalToBuyer', label: 'Refund Total' },
    { id: 'orderTotalAfterRefund', label: 'Order Total (After Refund)' },
    { id: 'orderEarnings', label: 'Order Earnings' },
    { id: 'trackingNumber', label: 'Tracking Number' },
    { id: 'amazonAccount', label: 'Amazon Acc' },
    { id: 'arriving', label: 'Arriving' },
    { id: 'beforeTax', label: 'Before Tax' },
    { id: 'estimatedTax', label: 'Estimated Tax' },
    { id: 'azOrderId', label: 'Az OrderID' },
    { id: 'amazonRefund', label: 'Amazon Refund' },
    { id: 'cardName', label: 'Card Name' },
    { id: 'resolution', label: 'Resolutions' },
    { id: 'notes', label: 'Notes' },
    { id: 'messagingStatus', label: 'Messaging' },
    { id: 'remark', label: 'Remark' },
    { id: 'issueFlags', label: 'Issues' },
    { id: 'convoCategory', label: 'Case Category' },
    { id: 'convoCaseStatus', label: 'Case Status' }
  ];

  // CSV Export column selection - initialized after ALL_COLUMNS is defined
  const [selectedExportColumns, setSelectedExportColumns] = useState(ALL_COLUMNS.map(c => c.id));

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const stored = getInitialState('visibleColumns', DEFAULT_VISIBLE_COLUMNS);
    let next = Array.isArray(stored) ? [...stored] : [...DEFAULT_VISIBLE_COLUMNS];
    // Place new column beside Refunds for existing saved layouts
    if (!next.includes('reviewedRefund')) {
      const refundIdx = next.indexOf('refunds');
      if (refundIdx >= 0) next.splice(refundIdx + 1, 0, 'reviewedRefund');
      else next.push('reviewedRefund');
    }
    const missing = DEFAULT_VISIBLE_COLUMNS.filter(col => !next.includes(col));
    if (missing.length > 0) next = [...next, ...missing];
    return next;
  });

  // Convert to Set for O(1) lookups instead of O(n) .includes() per column per row
  const visibleColumnsSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const templates = await loadRemarkTemplates();
      if (mounted) setRemarkTemplates(templates);
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => load(), { timeout: 3000 });
      return () => {
        mounted = false;
        cancelIdleCallback(id);
      };
    }
    const timer = setTimeout(load, 200);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const loadResolutionOptions = useCallback(async () => {
    try {
      const { data } = await api.get('/resolution-options');
      setResolutionOptions(data || []);
    } catch (e) {
      console.error('Failed to load resolution options', e);
    }
  }, []);


  // Helper function to replace template variables
  const replaceTemplateVariables = (template, order) => {
    if (!template || !order) return template;

    // Extract buyer first name
    const buyerFullName = order.buyer?.buyerRegistrationAddress?.fullName || order.shippingFullName || 'Buyer';
    const buyerFirstName = buyerFullName.split(' ')[0];
    const itemTitle = order.lineItems?.[0]?.title || order.productName || `Item ${order.itemNumber || ''}`.trim() || 'item';

    // Extract tracking info
    const trackingNumber = order.trackingNumber || '[tracking number]';
    const shippingCarrier = order.shippingCarrier || 'the shipping carrier';

    const hasBuyerNameToken = /\{\{\s*buyer_(first_)?name\s*\}\}|\{BUYER_NAME\}/i.test(template);

    // Replace variables
    let personalizedTemplate = template
      .replace(/\{\{buyer_first_name\}\}/g, buyerFirstName)
      .replace(/\{\{buyer_name\}\}/gi, buyerFirstName)
      .replace(/\{BUYER_NAME\}/g, buyerFirstName)
      .replace(/\{\{item_title\}\}/g, itemTitle)
      .replace(/\{\{tracking_number\}\}/g, trackingNumber)
      .replace(/\{\{shipping_carrier\}\}/g, shippingCarrier);

    if (!hasBuyerNameToken) {
      personalizedTemplate = personalizedTemplate.replace(
        /^(\s*["'“”‘’]?\s*)(hi|hello|hey)([!,.:;]?)(\s*)/i,
        (match, leadingPrefix, greeting, punctuation, whitespaceAfterGreeting) => {
          const separator = punctuation || ',';
          const trailingWhitespace = whitespaceAfterGreeting || ' ';
          return `${leadingPrefix}${greeting} ${buyerFirstName}${separator}${trailingWhitespace}`;
        }
      );
    }

    return personalizedTemplate;
  };

  const handleSaveRemarkTemplates = async (nextTemplates) => {
    try {
      const savedTemplates = await saveRemarkTemplates(nextTemplates);
      setRemarkTemplates(savedTemplates);
      setSnackbarMsg('Remark templates saved');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      setSnackbarMsg(error?.response?.data?.error || 'Failed to save remark templates');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Function to send auto-message based on remark
  const sendAutoMessageForRemark = async (order, remarkValue) => {
    // Get template for this remark
    const template = findRemarkTemplateText(remarkTemplates, remarkValue);
    if (!template) {
      console.log('No template found for remark:', remarkValue);
      return false;
    }

    // Replace variables in template
    const messageBody = replaceTemplateVariables(template, order);

    try {
      // Send message using the same endpoint as manual messages
      await api.post('/ebay/send-message', {
        orderId: order.orderId,
        buyerUsername: order.buyer?.username,
        itemId: order.itemNumber || order.lineItems?.[0]?.legacyItemId,
        body: messageBody,
        subject: `Regarding Order #${order.orderId}`
      });

      console.log(`Auto-message sent for remark: ${remarkValue}`);
      return true;
    } catch (error) {
      console.error('Failed to send auto-message:', error);
      throw error;
    }
  };

  // Handle remark confirmation - user clicked "Yes, Send Message"
  const handleConfirmRemarkMessage = async () => {
    if (!pendingRemarkUpdate) return;

    const { orderId, remarkValue, order } = pendingRemarkUpdate;
    const normalizedRemarkValue = normalizeRemarkValue(remarkValue);
    setSendingRemarkMessage(true);

    try {
      // First update the remark field and mark that message was sent
      const { data } = await api.patch(`/ebay/orders/${orderId}/manual-fields`, { remark: normalizedRemarkValue, remarkMessageSent: true });

      // Update local state
      setOrders(prev => prev.map(o => {
        if (o._id === orderId) {
          return { ...o, remark: normalizedRemarkValue, remarkMessageSent: true };
        }
        return o;
      }));

      // Send the editable message with attachments
      const mediaUrls = remarkAttachments.map((a) => a.url);
      await api.post('/ebay/send-message', {
        orderId: order.orderId || order.legacyOrderId || order._id,
        buyerUsername: order.buyer?.username || order.buyerUsername || 'eBay Buyer',
        itemId: order.itemId || order.itemNumber || order.lineItems?.[0]?.legacyItemId,
        sellerId: order.sellerId || order.seller?._id,
        conversationId: null,
        body: editableRemarkMessage,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : []
      });

      clearBuyerMessageIndicator({
        orderId: order.orderId || order.legacyOrderId || order._id,
        buyerUsername: order.buyer?.username || order.buyerUsername,
        itemId: order.itemId || order.itemNumber || order.lineItems?.[0]?.legacyItemId,
      });

      setSnackbarMsg(`Remark updated to "${remarkValue}" and message sent to buyer`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

    } catch (error) {
      console.error('Error in remark update/message:', error);
      setSnackbarMsg('Failed to update remark or send message: ' + (error.response?.data?.error || error.message));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setSendingRemarkMessage(false);
      setRemarkConfirmOpen(false);
      setPendingRemarkUpdate(null);
      setEditableRemarkMessage('');
      setRemarkAttachments([]);
    }
  };

  // Handle remark confirmation - user clicked "No, Skip"
  const handleSkipRemarkMessage = async () => {
    if (!pendingRemarkUpdate) return;

    const { orderId, remarkValue } = pendingRemarkUpdate;
    const normalizedRemarkValue = normalizeRemarkValue(remarkValue);

    try {
      // Just update the remark without sending message
      await api.patch(`/ebay/orders/${orderId}/manual-fields`, { remark: normalizedRemarkValue, remarkMessageSent: false });

      // Update local state
      setOrders(prev => prev.map(o => {
        if (o._id === orderId) {
          return { ...o, remark: normalizedRemarkValue, remarkMessageSent: false };
        }
        return o;
      }));

      setSnackbarMsg(`Remark updated to "${remarkValue}" (message not sent)`);
      setSnackbarSeverity('info');
      setSnackbarOpen(true);

    } catch (error) {
      console.error('Error updating remark:', error);
      setSnackbarMsg('Failed to update remark');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setRemarkConfirmOpen(false);
      setPendingRemarkUpdate(null);
      setEditableRemarkMessage('');
      setRemarkAttachments([]);
    }
  };

  const handleRemarkFileSelect = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const { data } = await api.post('/internal-messages/upload-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const uploaded = (data?.urls || []).map((url, index) => ({
        url,
        name: files[index]?.name || 'Image'
      }));

      setRemarkAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setSnackbarMsg('Failed to upload attachment');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }

    // Reset input
    if (fileInputRefRemark.current) {
      fileInputRefRemark.current.value = '';
    }
  };

  // Handle remark update - intercept to show confirmation
  const handleRemarkUpdate = (orderId, remarkValue) => {
    if (remarkValue === '__manage_templates__') {
      setManageRemarkTemplatesOpen(true);
      return;
    }
    // Find the order
    const order = orders.find(o => o._id === orderId);
    if (!order) {
      console.error('Order not found:', orderId);
      return;
    }

    // Check if there's a template for this remark
    const hasTemplate = findRemarkTemplateText(remarkTemplates, remarkValue);

    if (hasTemplate) {
      // Get the template text and pre-fill the editable message
      const templateText = findRemarkTemplateText(remarkTemplates, remarkValue);
      const replacedText = replaceTemplateVariables(templateText, order);
      setPendingRemarkUpdate({ orderId, remarkValue, order });
      setEditableRemarkMessage(replacedText);
      setRemarkAttachments([]);
      setRemarkConfirmOpen(true);
    } else {
      // No template, update remark and reset remarkMessageSent flag
      updateManualField(orderId, 'remark', remarkValue, { remarkMessageSent: false });
    }
  };


  const updateManualField = useCallback(async (orderId, field, value, extraFields = {}) => {
    const valueToSave = field === 'remark' ? normalizeRemarkValue(value) : value;
    try {
      const { data } = await api.patch(`/ebay/orders/${orderId}/manual-fields`, { [field]: valueToSave, ...extraFields });

      // Update local state with the full order data (includes recalculated Amazon financials)
      setOrders(prev => prev.map(o => {
        if (o._id === orderId) {
          // If beforeTax or estimatedTax was updated, use the full order response which includes recalculated values
          if (field === 'beforeTax' || field === 'estimatedTax') {
            return data.order; // Full order with recalculated amazonTotal, amazonTotalINR, marketplaceFee, igst, totalCC
          }
          // For other fields, just update that field (including any extraFields)
          return { ...o, [field]: valueToSave, ...extraFields };
        }
        return o;
      }));
      setSnackbarMsg('Updated successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error(e);
      setSnackbarMsg('Failed to update');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [normalizeRemarkValue]);

  // Update item category classification (CRP)
  const updateItemCategory = useCallback(async (itemNumber, categoryId, rangeId, productId) => {
    try {
      const { data } = await api.put(`/item-category-map/${encodeURIComponent(itemNumber)}`, {
        categoryId,
        rangeId: rangeId || null,
        productId: productId || null
      });
      // Update local orders that share this itemNumber with the populated CRP values from the response
      setOrders(prev => prev.map(o => {
        const orderItemNumbers = o.lineItems?.map(li => li.legacyItemId) || [o.itemNumber];
        if (orderItemNumbers.includes(itemNumber)) {
          return {
            ...o,
            orderCategoryId: data.mapping.categoryId || null,
            orderRangeId: data.mapping.rangeId || null,
            orderProductId: data.mapping.productId || null
          };
        }
        return o;
      }));
      setSnackbarMsg('Category updated');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error(e);
      setSnackbarMsg('Failed to update category');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, []);

  // Clear item category classification
  const clearItemCategory = useCallback(async (itemNumber) => {
    try {
      await api.delete(`/item-category-map/${encodeURIComponent(itemNumber)}`);
      setOrders(prev => prev.map(o => {
        const orderItemNumbers = o.lineItems?.map(li => li.legacyItemId) || [o.itemNumber];
        if (orderItemNumbers.includes(itemNumber)) {
          return { ...o, orderCategoryId: null, orderRangeId: null, orderProductId: null };
        }
        return o;
      }));
      setSnackbarMsg('Category cleared');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error(e);
      setSnackbarMsg('Failed to clear category');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, []);

  // Track if this is the initial mount
  const isInitialMount = useRef(true);
  const hasFetchedInitialData = useRef(false);
  const skipNextPageLoad = useRef(false);

  // Track previous filter values to detect changes
  const prevFilters = useRef({
    selectedSeller,
    searchOrderId,
    searchAzOrderId,
    searchBuyerName,
    searchItemId,
    searchSku,
    searchProductName,
    searchMarketplace,
    searchPaymentStatus,
    searchCancelStatus,
    searchIssueType,
    searchCaseCategory,
    searchCaseStatus,
    excludeClient,
    excludeLowValue,
    missingAmazonAccount,
    dateFilter
  });

  // Fetch amazon accounts, CRP data, and issues index once on mount (deferred so orders load first)
  useEffect(() => {
    if (!hasFetchedInitialData.current) {
      const loadSecondaryData = () => {
        api.get('/amazon-accounts').then(({ data }) => setAmazonAccounts(data || [])).catch(console.error);
        api.get('/credit-card-names').then(({ data }) => setCreditCards(data || [])).catch(console.error);
        loadResolutionOptions();
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(loadSecondaryData, { timeout: 2500 });
      } else {
        setTimeout(loadSecondaryData, 150);
      }
    }
  }, [loadResolutionOptions]);

  // Issues index is heavy — load well after the table has painted (Grow does not load this at all)
  useEffect(() => {
    const timer = setTimeout(() => {
      api.get('/ebay/issues-by-order').then(({ data }) => setIssuesIndex(data?.index || {})).catch(console.error);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Initial load - fetch sellers and orders once
  useEffect(() => {
    if (!hasFetchedInitialData.current) {
      hasFetchedInitialData.current = true;
      fetchSellers();
      loadStoredOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOrderSyncEvent(() => {
      if (!hasFetchedInitialData.current) return;
      loadStoredOrders();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload orders when page changes (but not on initial mount)
  useEffect(() => {
    // Skip on initial mount (already loaded above)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (skipNextPageLoad.current) {
      skipNextPageLoad.current = false;
      return;
    }
    loadStoredOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // When filters change, reset to page 1 and reload.
  // Text inputs are already debounced (400ms) inside SearchFiltersPanel before reaching here,
  // so all changes fire the reload immediately — no double-debounce needed.
  useEffect(() => {
    // Check if any filter actually changed
    const prev = prevFilters.current;

    const filtersChanged =
      prev.searchOrderId !== searchOrderId ||
      prev.searchAzOrderId !== searchAzOrderId ||
      prev.searchBuyerName !== searchBuyerName ||
      prev.searchItemId !== searchItemId ||
      prev.searchSku !== searchSku ||
      prev.searchProductName !== searchProductName ||
      prev.selectedSeller !== selectedSeller ||
      prev.searchMarketplace !== searchMarketplace ||
      prev.searchPaymentStatus !== searchPaymentStatus ||
      prev.searchCancelStatus !== searchCancelStatus ||
      prev.searchIssueType !== searchIssueType ||
      prev.searchCaseCategory !== searchCaseCategory ||
      prev.searchCaseStatus !== searchCaseStatus ||
      prev.excludeClient !== excludeClient ||
      prev.excludeLowValue !== excludeLowValue ||
      prev.missingAmazonAccount !== missingAmazonAccount ||
      JSON.stringify(prev.dateFilter) !== JSON.stringify(dateFilter);

    // Update prev filters
    prevFilters.current = {
      selectedSeller,
      searchOrderId,
      searchAzOrderId,
      searchBuyerName,
      searchItemId,
      searchSku,
      searchProductName,
      searchMarketplace,
      searchPaymentStatus,
      searchCancelStatus,
      searchIssueType,
      searchCaseCategory,
      searchCaseStatus,
      excludeClient,
      excludeLowValue,
      missingAmazonAccount,
      dateFilter
    };

    // Skip on initial mount
    if (!hasFetchedInitialData.current) return;

    if (!filtersChanged) return;

    if (currentPage === 1) {
      loadStoredOrders();
    } else {
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeller, searchOrderId, searchAzOrderId, searchBuyerName, searchItemId, searchSku, searchProductName, searchMarketplace, searchPaymentStatus, searchCancelStatus, searchIssueType, searchCaseCategory, searchCaseStatus, excludeClient, excludeLowValue, missingAmazonAccount, dateFilter]);

  // orderEarnings is now read-only (auto-calculated server-side)
  // No manual editing handlers needed

  function buildStoredOrdersParams(overrides = {}) {
    const includePagination = overrides.includePagination !== false;
    const page = overrides.page ?? currentPage;
    const sellerId = overrides.sellerId !== undefined ? overrides.sellerId : selectedSeller;
    const activeDateFilter = overrides.dateFilter !== undefined ? overrides.dateFilter : dateFilter;
    const activeOrderId = overrides.searchOrderId !== undefined ? overrides.searchOrderId : searchOrderId;
    const activeAzOrderId = overrides.searchAzOrderId !== undefined ? overrides.searchAzOrderId : searchAzOrderId;
    const activeBuyerName = overrides.searchBuyerName !== undefined ? overrides.searchBuyerName : searchBuyerName;
    const activeItemId = overrides.searchItemId !== undefined ? overrides.searchItemId : searchItemId;
    const activeSku = overrides.searchSku !== undefined ? overrides.searchSku : searchSku;
    const activeProductName = overrides.searchProductName !== undefined ? overrides.searchProductName : searchProductName;
    const activePaymentStatus = overrides.searchPaymentStatus !== undefined ? overrides.searchPaymentStatus : searchPaymentStatus;
    const activeCancelStatus = overrides.searchCancelStatus !== undefined ? overrides.searchCancelStatus : searchCancelStatus;
    const activeIssueType = overrides.searchIssueType !== undefined ? overrides.searchIssueType : searchIssueType;
    const activeCaseCategory = overrides.searchCaseCategory !== undefined ? overrides.searchCaseCategory : searchCaseCategory;
    const activeCaseStatus = overrides.searchCaseStatus !== undefined ? overrides.searchCaseStatus : searchCaseStatus;

    const params = {};
    if (includePagination) {
      params.page = page;
      params.limit = ordersPerPage;
    }

    if (sellerId) params.sellerId = sellerId;
    if (String(activeProductName || '').trim()) params.productName = String(activeProductName).trim();
    if (String(activeOrderId || '').trim()) params.searchOrderId = String(activeOrderId).trim();
    if (String(activeAzOrderId || '').trim()) params.searchAzOrderId = String(activeAzOrderId).trim();
    if (String(activeBuyerName || '').trim()) params.searchBuyerName = String(activeBuyerName).trim();
    if (String(activeItemId || '').trim()) params.searchItemId = String(activeItemId).trim();
    if (String(activeSku || '').trim()) params.searchSku = String(activeSku).trim();
    if (searchMarketplace) params.searchMarketplace = searchMarketplace;
    if (activePaymentStatus) params.paymentStatus = activePaymentStatus;
    if (activeCancelStatus) params.cancelStatus = activeCancelStatus;
    if (activeIssueType) params.issueType = activeIssueType;
    if (activeCaseCategory) params.caseCategory = activeCaseCategory;
    if (activeCaseStatus) params.caseStatus = activeCaseStatus;
    params.excludeClient = excludeClient ? 'true' : 'false';
    params.excludeLowValue = excludeLowValue ? 'true' : 'false';
    params.missingAmazonAccount = missingAmazonAccount ? 'true' : 'false';
    params.includeSupplierLinks = visibleColumnsSet.has('supplierLink') ? 'true' : 'false';

    applyDateFilterParams(params, activeDateFilter);
    return params;
  }

  /** Called by Search / Clear — applies drafts immediately and fetches page 1. */
  const applyCommittedFilters = useCallback((draft = {}) => {
    prevFilters.current = {
      selectedSeller: draft.sellerId ?? '',
      searchOrderId: draft.searchOrderId ?? '',
      searchAzOrderId: draft.searchAzOrderId ?? '',
      searchBuyerName: draft.searchBuyerName ?? '',
      searchItemId: draft.searchItemId ?? '',
      searchSku: draft.searchSku ?? '',
      searchProductName: draft.searchProductName ?? '',
      searchMarketplace,
      searchPaymentStatus: draft.searchPaymentStatus ?? '',
      searchCancelStatus: draft.searchCancelStatus ?? '',
      searchIssueType: draft.searchIssueType ?? '',
      searchCaseCategory: draft.searchCaseCategory ?? '',
      searchCaseStatus: draft.searchCaseStatus ?? '',
      excludeClient,
      excludeLowValue,
      missingAmazonAccount,
      dateFilter: draft.dateFilter || createEmptyDateFilter(),
    };

    if (currentPage !== 1) {
      skipNextPageLoad.current = true;
      setCurrentPage(1);
    }

    loadStoredOrders({
      page: 1,
      sellerId: draft.sellerId ?? '',
      dateFilter: draft.dateFilter || createEmptyDateFilter(),
      searchOrderId: draft.searchOrderId ?? '',
      searchAzOrderId: draft.searchAzOrderId ?? '',
      searchBuyerName: draft.searchBuyerName ?? '',
      searchItemId: draft.searchItemId ?? '',
      searchSku: draft.searchSku ?? '',
      searchProductName: draft.searchProductName ?? '',
      searchPaymentStatus: draft.searchPaymentStatus ?? '',
      searchCancelStatus: draft.searchCancelStatus ?? '',
      searchIssueType: draft.searchIssueType ?? '',
      searchCaseCategory: draft.searchCaseCategory ?? '',
      searchCaseStatus: draft.searchCaseStatus ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    searchMarketplace,
    excludeClient,
    excludeLowValue,
    missingAmazonAccount,
  ]);

  async function fetchSellers() {
    setError('');
    try {
      const { data } = await api.get('/sellers/all-unfiltered');
      setSellers(sortSellersByName(data || []));
    } catch (e) {
      setError('Failed to load sellers');
    }
  }

  async function loadStoredOrders(overrides = {}) {
    setLoading(true);
    setError('');

    try {
      const params = buildStoredOrdersParams(overrides);

      const { data } = await api.get('/ebay/stored-orders', { params });
      const loadedOrders = data?.orders || [];
      setOrders(loadedOrders);
      setScopeWarning(data?.meta?.warning || '');

      // Update pagination metadata
      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalOrders(data.pagination.totalOrders);
      }
      return loadedOrders;
    } catch (e) {
      setOrders([]);
      setScopeWarning('');
      setError(e?.response?.data?.error || 'Failed to load orders');
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrders() {
    setLoading(true);
    setError('');
    setPollResults(null);
    setSnackbarOrderIds([]);
    setUpdatedOrderDetails([]);
    try {
      const { data } = await api.post('/ebay/poll-all-sellers');
      setPollResults(data || null);
      await loadStoredOrders();

      // Show snackbar if there are new or updated orders
      if (data && (data.totalNewOrders > 0 || data.totalUpdatedOrders > 0)) {
        // Extract new order IDs (simple strings)
        const newOrderIds = data.pollResults
          .filter(r => r.success && r.newOrders && r.newOrders.length > 0)
          .flatMap(r => r.newOrders);

        // Extract updated order details (objects with orderId + changedFields)
        const updatedDetails = data.pollResults
          .filter(r => r.success && r.updatedOrders && r.updatedOrders.length > 0)
          .flatMap(r => r.updatedOrders);

        const updatedOrderIds = updatedDetails.map(u => u.orderId);

        // Combine both lists (new orders first, then updated)
        setSnackbarOrderIds([...newOrderIds, ...updatedOrderIds]);
        setUpdatedOrderDetails(updatedDetails);

        setSnackbarMsg(
          `Polling Complete! New Orders: ${data.totalNewOrders}, Updated Orders: ${data.totalUpdatedOrders}`
        );
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        setSnackbarMsg('Polling Complete! No new or updated orders.');
        setSnackbarSeverity('info');
        setSnackbarOpen(true);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to poll orders');
    } finally {
      setLoading(false);
    }
  }



  const thumbnailFetchStarted = useRef(new Set());
  const itemImagesRef = useRef(itemImages);
  itemImagesRef.current = itemImages;

  // Function to fetch ONLY thumbnail (first image) for display
  const fetchThumbnail = useCallback(async (order) => {
    const orderId = order._id;
    const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
    const sellerId = order.seller?._id || order.seller;

    if (!itemId || !sellerId || thumbnailFetchStarted.current.has(orderId)) {
      return;
    }
    thumbnailFetchStarted.current.add(orderId);

    try {
      const { data } = await api.get(`/ebay/item-images/${itemId}?sellerId=${sellerId}&thumbnail=true`);
      if (data.images && data.images.length > 0) {
        setThumbnailUrl(orderId, data.images[0]);
        if (data.total > 1) {
          setItemImages(prev => ({ ...prev, [orderId]: { count: data.total } }));
        }
      }
    } catch (error) {
      console.error('Error fetching thumbnail:', error);
    }
  }, []);

  // Function to fetch ALL images when user clicks (only called on demand)
  const fetchAllImages = useCallback(async (order) => {
    const orderId = order._id;
    const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
    const sellerId = order.seller?._id || order.seller;

    // If we already have all images, just use them
    if (itemImagesRef.current[orderId]?.images) {
      return itemImagesRef.current[orderId].images;
    }

    setLoadingImages(prev => ({ ...prev, [orderId]: true }));

    try {
      const { data } = await api.get(`/ebay/item-images/${itemId}?sellerId=${sellerId}`);
      const allImages = data.images || [];
      setItemImages(prev => ({ ...prev, [orderId]: { images: allImages, count: allImages.length } }));
      return allImages;
    } catch (error) {
      console.error('Error fetching all images:', error);
      return [];
    } finally {
      setLoadingImages(prev => ({ ...prev, [orderId]: false }));
    }
  }, []);

  // Fetch thumbnails in small batches after paint so order rows render first
  useEffect(() => {
    if (!orders.length) return;

    let cancelled = false;
    let idleId;
    let timeoutId;

    const run = () => {
      const queue = orders.filter((order) => {
        const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
        const sellerId = order.seller?._id || order.seller;
        return itemId && sellerId && !thumbnailFetchStarted.current.has(order._id);
      });

      const concurrency = 3;
      (async () => {
        while (!cancelled && queue.length) {
          const batch = queue.splice(0, concurrency);
          await Promise.all(batch.map((order) => fetchThumbnail(order)));
        }
      })();
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 400 });
    } else {
      timeoutId = setTimeout(run, 120);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [orders, fetchThumbnail]);

  // Function to open image viewer (fetches all images on demand)
  const handleViewImages = useCallback(async (order) => {
    const allImages = await fetchAllImages(order);

    if (allImages.length > 0) {
      setSelectedImages(allImages);
      setImageCount(allImages.length);
      setImageDialogOpen(true);
    }
  }, [fetchAllImages]);

  const handleOpenMessageDialog = useCallback((order) => {
    setSelectedOrderForMessage(order);
  }, []);

  const clearBuyerMessageIndicator = useCallback((payload = {}) => {
    const payloadOrderId = String(payload.orderId || '').trim();
    const payloadBuyer = String(payload.buyerUsername || '').trim();
    const payloadItemId = String(payload.itemId || '').trim();

    setOrders((prev) => prev.map((order) => {
      const rowOrderIds = [order.orderId, order.legacyOrderId]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      const rowBuyer = String(order.buyer?.username || order.buyerUsername || '').trim();
      const rowItemId = String(
        order.itemId || order.itemNumber || order.lineItems?.[0]?.legacyItemId || order.lineItems?.[0]?.itemId || ''
      ).trim();
      const isMatch = payloadOrderId
        ? rowOrderIds.includes(payloadOrderId)
        : Boolean(payloadBuyer && payloadItemId && rowBuyer === payloadBuyer && rowItemId === payloadItemId);

      return isMatch
        ? {
            ...order,
            hasUnreadBuyerMessage: false,
            lastSellerMessageAt: new Date().toISOString(),
          }
        : order;
    }));
  }, []);

  const handleCloseMessageDialog = () => {
    setSelectedOrderForMessage(null);
  };




  const updateFulfillmentNotes = async (orderId, value) => {
    try {
      // POINT TO NEW ENDPOINT
      await api.patch(`/ebay/orders/${orderId}/fulfillment-notes`, { fulfillmentNotes: value });

      // UPDATE LOCAL STATE with new field name
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, fulfillmentNotes: value } : o));

      setSnackbarMsg('Fulfillment notes updated');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Failed to update notes:', err);
      setSnackbarMsg('Failed to update notes');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };






  //  HELPER for the NotesCell
  const handleSaveNote = useCallback(async (orderId, noteValue) => {
    await api.patch(`/ebay/orders/${orderId}/fulfillment-notes`, { fulfillmentNotes: noteValue });
    // Update local state
    setOrders(prev => prev.map(o => o._id === orderId ? { ...o, fulfillmentNotes: noteValue } : o));
  }, []);

  //  HELPER for Notifications
  const showNotification = useCallback((severity, message) => {
    setSnackbarMsg(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  }, []);

  // After order polls: TDS only for touched eBay order IDs (never the whole table page).
  async function pollTdsForEbayOrderIds(ebayOrderIds) {
    const ids = [...new Set((ebayOrderIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return null;

    try {
      const { data } = await api.post(
        '/ebay/poll-tds',
        { ebayOrderIds: ids.slice(0, 100), skipAlreadySet: true },
        { timeout: 600000 },
      );
      if ((data?.results?.updated || 0) > 0) {
        await loadStoredOrders();
      }
      return data;
    } catch (e) {
      console.error('Poll TDS (merged) error:', e);
      return { error: e?.response?.data?.error || e?.message || 'Failed to poll TDS' };
    }
  }

  function appendTdsSummary(baseMsg, tdsData) {
    if (!tdsData) return baseMsg;
    if (tdsData.error) return `${baseMsg}\n\nTDS: ${tdsData.error}`;
    const updated = tdsData?.results?.updated || 0;
    const skipped = tdsData?.results?.skipped || 0;
    const failed = tdsData?.results?.failed || 0;
    const paused = tdsData?.rateLimited || tdsData?.results?.rateLimited
      ? ' (paused on Finances burst 429 — wait ~1 min)'
      : '';
    return `${baseMsg}\n\nTDS: ${updated} updated, ${skipped} skipped, ${failed} failed${paused}`;
  }

  // Standalone Poll TDS for ALL orders in DB (More actions) — batched until done
  async function pollTds() {
    const confirmed = window.confirm(
      'Fetch Finances TDS for ALL orders in the database?\n\n' +
      '• Skips orders that already have Finances TDS\n' +
      '• Skips FULLY/PARTIALLY refunded orders\n' +
      '• Runs in batches (can take a long time for 10k+ orders)\n\n' +
      'Continue?'
    );
    if (!confirmed) return;

    setPollTdsLoading(true);
    setError('');
    setSnackbarMsg('Polling TDS for all DB orders…');
    setSnackbarSeverity('info');
    setSnackbarOpen(true);

    const grand = { updated: 0, skipped: 0, failed: 0, total: 0 };
    let remaining = null;
    let rounds = 0;
    const maxRounds = 500;

    try {
      while (rounds < maxRounds) {
        rounds += 1;
        const { data } = await api.post(
          '/ebay/poll-tds',
          { allOrders: true, skipAlreadySet: true, limit: 50 },
          { timeout: 600000 },
        );
        const r = data?.results || {};
        grand.updated += r.updated || 0;
        grand.skipped += r.skipped || 0;
        grand.failed += r.failed || 0;
        grand.total += r.total || 0;
        remaining = typeof data?.remaining === 'number' ? data.remaining : null;

        setSnackbarMsg(
          `TDS batch ${rounds}: ${grand.updated} updated, ${grand.skipped} no-TDS, ${grand.failed} failed` +
          (remaining != null ? ` — ${remaining} remaining` : '')
        );
        setSnackbarSeverity('info');
        setSnackbarOpen(true);

        if (data?.rateLimited || r.rateLimited) {
          setSnackbarMsg(
            `TDS paused: eBay Finances burst limit (429), not the daily 15,000 quota. ` +
            `Wait about ${Math.max(1, Math.ceil((data?.retryAfterMs || 60000) / 60000))} min, then run Poll TDS again.` +
            ` ${grand.updated} updated, ${grand.failed} failed.` +
            (remaining != null ? ` ${remaining} still pending.` : '')
          );
          setSnackbarSeverity('warning');
          setSnackbarOpen(true);
          break;
        }

        // Done when nothing checked this round, or remaining hit 0
        if ((r.total || 0) === 0 || remaining === 0) break;
      }

      await loadStoredOrders();
      setSnackbarMsg(
        `TDS complete: ${grand.updated} updated, ${grand.skipped} no TAX_DEDUCTION_AT_SOURCE, ${grand.failed} failed (${grand.total} checked)` +
        (remaining != null ? `. Remaining: ${remaining}` : '')
      );
      setSnackbarSeverity(grand.failed > 0 ? 'warning' : 'success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error('Poll TDS (all DB) error:', e);
      setSnackbarMsg(
        `${e?.response?.data?.error || e?.message || 'Failed to poll TDS'}` +
        ` (progress: ${grand.updated} updated / ${grand.total} checked)`
      );
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setPollTdsLoading(false);
    }
  }

  // Poll for NEW orders, then TDS only for those new order IDs
  async function pollNewOrders() {
    setLoading(true);
    setError('');
    setPollResults(null);
    setSnackbarOrderIds([]);
    setUpdatedOrderDetails([]);
    try {
      const { data } = await api.post('/ebay/poll-new-orders');
      setPollResults(data || null);

      // Reset filters to show all sellers and go to page 1
      setSelectedSeller('');
      setCurrentPage(1);

      // Reload orders with reset filters
      await loadStoredOrders();

      const newOrderIds = (data?.pollResults || [])
        .filter((r) => r.success && Array.isArray(r.newOrders) && r.newOrders.length > 0)
        .flatMap((r) => r.newOrders);
      const updatedCount = Number(data?.totalUpdatedOrders) || 0;
      const ptLabel = data?.ptWindow
        ? `PT ${data.ptWindow.yesterdayPt} → ${data.ptWindow.todayPt}`
        : 'today + yesterday (PT)';

      let severity = 'info';
      let msg = '';
      if (data && (data.totalNewOrders > 0 || updatedCount > 0)) {
        const sellerSummary = data.pollResults
          .filter(r => r.success && ((r.newOrders && r.newOrders.length > 0) || (r.totalUpdated > 0)))
          .map(r => {
            const parts = [];
            if (r.newOrders?.length) parts.push(`${r.newOrders.length} new`);
            if (r.totalUpdated) parts.push(`${r.totalUpdated} updated`);
            return `${r.sellerName}: ${parts.join(', ')}`;
          })
          .join('\n');
        msg = `Poll (${ptLabel}): ${data.totalNewOrders || 0} new, ${updatedCount} updated.\n\n${sellerSummary}`;
        severity = 'success';
      } else if (data) {
        const failures = (data.pollResults || []).filter((r) => !r.success && r.error);
        const fetched = Number(data.totalEbayFetched) || 0;
        if (failures.length > 0) {
          msg = `Poll failed: ${failures.map((f) => `${f.sellerName}: ${f.error}`).join('; ')}`;
          severity = 'error';
        } else if (fetched > 0) {
          msg = `eBay returned ${fetched} order(s) for ${ptLabel}; all already match the database.`;
          severity = 'info';
        } else {
          msg = `No eBay orders found for ${ptLabel}.`;
          severity = 'info';
        }
      }

      // Finish poll UI first — TDS must not keep the button stuck on "Polling..."
      if (msg) {
        setSnackbarMsg(msg);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
      }
      setLoading(false);

      if (newOrderIds.length) {
        const tdsData = await pollTdsForEbayOrderIds(newOrderIds);
        if (msg && tdsData) {
          if (tdsData.error) severity = severity === 'error' ? 'error' : 'warning';
          else if ((tdsData?.results?.failed || 0) > 0 && severity === 'success') severity = 'warning';
          setSnackbarMsg(appendTdsSummary(msg, tdsData));
          setSnackbarSeverity(severity);
          setSnackbarOpen(true);
        }
      }
      publishOrderSyncEvent('FulfillmentDashboard', 'poll-new-orders');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to poll new orders');
      setLoading(false);
    }
  }

  // Poll for order UPDATES, then TDS only for touched order IDs
  async function pollOrderUpdates() {
    setLoading(true);
    setError('');
    setPollResults(null);
    setSnackbarOrderIds([]);
    setUpdatedOrderDetails([]);
    try {
      const { data } = await api.post('/ebay/poll-order-updates');
      setPollResults(data || null);

      // Reset filters to show all sellers and go to page 1
      setSelectedSeller('');
      setCurrentPage(1);

      // Reload orders with reset filters
      await loadStoredOrders();

      const updatedDetails = (data?.pollResults || [])
        .filter(r => r.success && r.updatedOrders && r.updatedOrders.length > 0)
        .flatMap(r => r.updatedOrders);

      const newOrderIds = (data?.pollResults || [])
        .filter(r => r.success && Array.isArray(r.newOrders) && r.newOrders.length > 0)
        .flatMap(r => r.newOrders);

      const touchedOrderIds = [
        ...newOrderIds,
        ...updatedDetails.map(u => u.orderId)
      ].filter(Boolean);

      if (data && (data.totalUpdatedOrders > 0 || data.totalNewOrders > 0)) {
        setSnackbarOrderIds(touchedOrderIds);
        setUpdatedOrderDetails(updatedDetails);
        const parts = [];
        if (data.totalUpdatedOrders > 0) {
          parts.push(`Updated ${data.totalUpdatedOrders} order${data.totalUpdatedOrders > 1 ? 's' : ''}`);
        }
        if (data.totalNewOrders > 0) {
          parts.push(`imported ${data.totalNewOrders} missing`);
        }
        setSnackbarMsg(`${parts.join(', ')}!`);
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        setSnackbarOrderIds([]);
        setUpdatedOrderDetails([]);
        setSnackbarMsg('No order updates found.');
        setSnackbarSeverity('info');
        setSnackbarOpen(true);
      }

      // Finish poll UI first — TDS must not keep the button stuck on "Updating..."
      setLoading(false);

      if (touchedOrderIds.length) {
        const tdsData = await pollTdsForEbayOrderIds(touchedOrderIds);
        if (tdsData) {
          const base = (data && (data.totalUpdatedOrders > 0 || data.totalNewOrders > 0))
            ? [
                data.totalUpdatedOrders > 0 ? `Updated ${data.totalUpdatedOrders} order${data.totalUpdatedOrders > 1 ? 's' : ''}` : null,
                data.totalNewOrders > 0 ? `imported ${data.totalNewOrders} missing` : null,
              ].filter(Boolean).join(', ') + '!'
            : 'No order updates found.';
          const severity = tdsData.error || (tdsData?.results?.failed || 0) > 0
            ? 'warning'
            : ((data?.totalUpdatedOrders || 0) > 0 || (data?.totalNewOrders || 0) > 0 ? 'success' : 'info');
          setSnackbarMsg(appendTdsSummary(base, tdsData));
          setSnackbarSeverity(severity);
          setSnackbarOpen(true);
        }
      }
      publishOrderSyncEvent('FulfillmentDashboard', 'poll-order-updates');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to poll order updates');
      setLoading(false);
    }
  }

  // Resync last N PT calendar days — same full sync as Poll New Orders
  async function resyncRecent() {
    setLoading(true);
    setError('');
    setPollResults(null);
    setSnackbarOrderIds([]);
    setUpdatedOrderDetails([]);
    try {
      const { data } = await api.post('/ebay/resync-recent', { days: resyncDays });
      setPollResults(data || null);

      // Show the same PT window that was just synced (not older DB rows outside the window)
      const syncedDateFilter = data?.ptWindow?.startPt && data?.ptWindow?.todayPt
        ? {
            mode: 'range',
            single: '',
            from: data.ptWindow.startPt,
            to: data.ptWindow.todayPt,
          }
        : null;

      setSelectedSeller('');
      setDraftSelectedSeller('');
      setCurrentPage(1);
      if (syncedDateFilter) {
        setDateFilter(syncedDateFilter);
        setDraftDateFilter(syncedDateFilter);
      }

      // Pass overrides — setState is async, so don't rely on closure values yet
      await loadStoredOrders({
        page: 1,
        sellerId: '',
        ...(syncedDateFilter ? { dateFilter: syncedDateFilter } : {}),
      });

      const ptLabel = data?.ptWindow
        ? `PT ${data.ptWindow.startPt} → ${data.ptWindow.todayPt}`
        : `last ${resyncDays} days (PT)`;

      if (data && (data.totalUpdated > 0 || data.totalNew > 0)) {
        const updatedDetails = (data.pollResults || [])
          .filter(r => r.success && r.updatedOrders && r.updatedOrders.length > 0)
          .flatMap(r => r.updatedOrders);

        const newOrderIds = (data.pollResults || [])
          .filter(r => r.success && r.newOrders && r.newOrders.length > 0)
          .flatMap(r => r.newOrders);

        const orderIds = [
          ...newOrderIds,
          ...updatedDetails.map(u => u.orderId)
        ];
        setSnackbarOrderIds(orderIds);
        setUpdatedOrderDetails(updatedDetails);

        setSnackbarMsg(
          `Resync (${ptLabel}): ${data.totalNew || 0} new, ${data.totalUpdated || 0} updated`
        );
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        const fetched = Number(data.totalFetched) || 0;
        setSnackbarMsg(
          fetched > 0
            ? `Resync (${ptLabel}): ${fetched} order(s) fetched; already up to date.`
            : `Resync (${ptLabel}): no eBay orders found.`
        );
        setSnackbarSeverity('info');
        setSnackbarOpen(true);
      }
      publishOrderSyncEvent('FulfillmentDashboard', 'resync-recent');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to resync orders');
    } finally {
      setLoading(false);
    }
  }

  // PT (Pacific Time) refresh — refreshes EXISTING orders created on a specific PT date/range.
  // New orders in the window are intentionally ignored (use "Poll New Orders" for those).
  async function refreshExistingOrdersByUtcDate(clickedRefreshAt, clickedConfirmAt) {
    const startDate = utcRefreshStartDate;
    const endDate = utcRefreshMode === 'single'
      ? utcRefreshStartDate
      : (utcRefreshEndDate || utcRefreshStartDate);

    if (!startDate || !endDate) {
      setSnackbarMsg(utcRefreshMode === 'single' ? 'Select a PT date first.' : 'Select a PT start and end date first.');
      setSnackbarSeverity('warning');
      setSnackbarOpen(true);
      return;
    }

    setLoading(true);
    setError('');
    setPollResults(null);
    setSnackbarOrderIds([]);
    setUpdatedOrderDetails([]);

    try {
      const payload = {
        startDate,
        endDate,
        dateMode: utcRefreshMode,
        clickedRefreshAt,
        clickedConfirmAt,
        ...(selectedSeller ? { sellerId: selectedSeller } : {})
      };
      const { data } = await api.post('/ebay/resync-existing-orders-by-utc-date', payload);
      setPollResults(data || null);

      setCurrentPage(1);
      await loadStoredOrders();

      if (data && data.totalUpdated > 0) {
        const updatedDetails = data.pollResults
          .filter(r => r.success && r.updatedOrders && r.updatedOrders.length > 0)
          .flatMap(r => r.updatedOrders);

        setSnackbarOrderIds(updatedDetails.map(u => u.orderId));
        setUpdatedOrderDetails(updatedDetails);
        const changedFieldSummary = Object.entries(data.changedFieldCounts || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([field, count]) => `${formatFieldName(field)} x${count}`)
          .join(', ');
        setSnackbarMsg(
          `PT refresh complete! Fetched: ${data.totalFetched || 0}, Existing checked: ${data.totalExistingMatched || 0}, Updated: ${data.totalUpdated}, Ignored new: ${data.totalIgnoredNew || 0}${changedFieldSummary ? `. Fields: ${changedFieldSummary}` : ''}`
        );
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        setSnackbarMsg(`PT refresh complete. Fetched: ${data.totalFetched || 0}, Existing checked: ${data.totalExistingMatched || 0}, Updated: 0, Ignored new: ${data.totalIgnoredNew || 0}`);
        setSnackbarSeverity('info');
        setSnackbarOpen(true);
      }
      publishOrderSyncEvent('FulfillmentDashboard', 'pt-refresh');
    } catch (e) {
      const message = e?.response?.data?.error || 'Failed to refresh existing orders by PT date';
      setError(message);
      setSnackbarMsg(message);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPtRefreshPreview() {
    const endDate = utcRefreshMode === 'single'
      ? utcRefreshStartDate
      : (utcRefreshEndDate || utcRefreshStartDate);

    setPtRefreshPreviewLoading(true);
    setPtRefreshPreview(null);
    try {
      const { data } = await api.get('/ebay/pt-refresh-preview', {
        params: {
          startDate: utcRefreshStartDate,
          endDate,
          dateMode: utcRefreshMode,
          ...(selectedSeller ? { sellerId: selectedSeller } : {})
        }
      });
      setPtRefreshPreview(data || null);
    } catch (e) {
      const message = e?.response?.data?.error || 'Failed to check seller tokens and order count';
      setPtRefreshPreview({ error: message });
    } finally {
      setPtRefreshPreviewLoading(false);
    }
  }

  function handleOpenUtcRefreshConfirm() {
    const endDate = utcRefreshMode === 'single'
      ? utcRefreshStartDate
      : (utcRefreshEndDate || utcRefreshStartDate);

    if (!utcRefreshStartDate || !endDate) {
      setSnackbarMsg(utcRefreshMode === 'single' ? 'Select a PT date first.' : 'Select a PT start and end date first.');
      setSnackbarSeverity('warning');
      setSnackbarOpen(true);
      return;
    }

    utcRefreshClickTimeRef.current = new Date().toISOString();
    setUtcRefreshConfirmOpen(true);
    fetchPtRefreshPreview();
  }

  async function handleConfirmUtcRefresh() {
    const confirmTime = new Date().toISOString();
    setUtcRefreshConfirmOpen(false);
    await refreshExistingOrdersByUtcDate(utcRefreshClickTimeRef.current, confirmTime);
  }

  const fetchPtRefreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/ebay/pt-refresh-history');
      setHistoryLogs(data || []);
    } catch (e) {
      console.error('Failed to load refresh history:', e);
      setSnackbarMsg('Failed to load refresh history.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistoryDialog = () => {
    setHistoryDialogOpen(true);
    fetchPtRefreshHistory();
  };

  const handleCopy = useCallback((text) => {
    const val = text || '-';
    if (val === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
      setCopiedText(val);
      setTimeout(() => setCopiedText(''), 1200);
    }
  }, []);

  // Handle Amazon refund received - zero out Amazon costs
  const handleAmazonRefundReceived = async (order) => {
    const confirmed = window.confirm(`Have you received the refund from Amazon for order ${order.orderId}?\n\nThis will set Before Tax and Estimated Tax to $0 and recalculate all dependent values.`);

    if (!confirmed) return;

    try {
      const { data } = await api.post(`/ebay/orders/${order.orderId}/amazon-refund-received`);

      // Update orders state with zeroed Amazon values
      setOrders(prev => prev.map(o =>
        o._id === order._id
          ? {
            ...o,
            beforeTaxUSD: data.beforeTaxUSD,
            estimatedTaxUSD: data.estimatedTaxUSD,
            amazonTotal: data.amazonTotal,
            amazonTotalINR: data.amazonTotalINR,
            marketplaceFee: data.marketplaceFee,
            igst: data.igst,
            totalCC: data.totalCC,
            amazonExchangeRate: data.amazonExchangeRate
          }
          : o
      ));

      setSnackbarMsg(`Amazon refund marked as received for order ${order.orderId}`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Error marking Amazon refund received:', err);
      setSnackbarMsg(`Failed to update: ${err.response?.data?.error || err.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleFetchAdFeeGeneral = useCallback(async (order) => {
    try {
      setFetchingAdFeeGeneral(prev => ({ ...prev, [order._id]: true }));

      const { data } = await api.post(`/ebay/orders/${order._id}/fetch-ad-fee-general`);

      setOrders(prev => prev.map(existingOrder => (
        existingOrder._id === order._id
          ? { ...existingOrder, ...data.order }
          : existingOrder
      )));

      const fee = data?.adFeeGeneral ?? data?.order?.adFeeGeneral;
      const tds = data?.tds ?? data?.order?.tds;
      const tdsSource = data?.tdsSource ?? data?.order?.tdsSource;
      const src = data?.lookupSource ? ` via ${data.lookupSource}` : '';
      if (tdsSource === 'finances' && tds != null && Number(tds) > 0) {
        setSnackbarMsg(`TDS $${Number(tds).toFixed(2)} (Finances) · Ad fee $${Number(fee || 0).toFixed(2)} for ${order.orderId}${src}`);
      } else if (fee > 0) {
        setSnackbarMsg(`Ad fee $${Number(fee).toFixed(2)} for ${order.orderId}; no eBay TDS — kept DB estimate $${Number(tds || 0).toFixed(2)}${src}`);
      } else if (data?.lookupSource === 'not_found') {
        setSnackbarMsg(`No AD_FEE / TDS on eBay for ${order.orderId} — kept DB TDS $${Number(tds || 0).toFixed(2)}.`);
      } else {
        setSnackbarMsg(`No Finances TDS for ${order.orderId} — kept DB estimate $${Number(tds || 0).toFixed(2)}${src}.`);
      }
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      setSnackbarMsg(e?.response?.data?.error || 'Failed to fetch ad fee');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setFetchingAdFeeGeneral(prev => ({ ...prev, [order._id]: false }));
    }
  }, []);

  const handleFetchCancelStatus = useCallback(async (order) => {
    try {
      setFetchingCancelStatus(prev => ({ ...prev, [order._id]: true }));

      const { data } = await api.post(`/ebay/orders/${order._id}/fetch-cancel-status`);

      setOrders(prev => prev.map(existingOrder => (
        existingOrder._id === order._id
          ? {
            ...existingOrder,
            cancelState: data.cancelState ?? data.order?.cancelState,
            cancelStatus: data.order?.cancelStatus ?? existingOrder.cancelStatus,
            orderPaymentStatus: data.orderPaymentStatus ?? data.order?.orderPaymentStatus ?? existingOrder.orderPaymentStatus,
            refunds: data.order?.refunds ?? existingOrder.refunds,
            lastModifiedDate: data.order?.lastModifiedDate ?? existingOrder.lastModifiedDate,
          }
          : existingOrder
      )));

      const next = data.cancelState || 'NONE_REQUESTED';
      const prev = data.previousCancelState || order.cancelState || 'NONE_REQUESTED';
      if (data.changed) {
        setSnackbarMsg(`Cancel status updated for ${order.orderId}: ${prev} → ${next}`);
      } else {
        setSnackbarMsg(`Cancel status unchanged for ${order.orderId}: ${next}`);
      }
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      setSnackbarMsg(e?.response?.data?.error || 'Failed to fetch cancel status');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setFetchingCancelStatus(prev => ({ ...prev, [order._id]: false }));
    }
  }, []);

  // Recalculate Earnings for all orders of selected seller
  const recalculateEarnings = async () => {
    const SINCE_DATE = '2026-02-28';
    const scopeMsg = selectedSeller
      ? `seller "${sellers.find(s => s._id === selectedSeller)?.user?.username || selectedSeller}"`
      : 'ALL sellers';

    const confirmed = window.confirm(
      `This will recalculate orderEarnings for ${scopeMsg}, orders on/after ${SINCE_DATE}, across ALL marketplaces.\n\n` +
      'Formula: Subtotal − Discount − Transaction Fees − Ad Fee − Shipping\n\n' +
      '• FULLY_REFUNDED → $-0.40\n' +
      '• PARTIALLY_REFUNDED → pre-refund earnings − net refund + ad fee credit\n' +
      '• All other statuses → recalculated\n\n' +
      'Continue?'
    );
    if (!confirmed) return;

    setRecalcEarningsLoading(true);
    try {
      const payload = selectedSeller
        ? { sellerId: selectedSeller, sinceDate: SINCE_DATE }
        : { allSellers: true, sinceDate: SINCE_DATE };

      const res = await api.post('/ebay/backfill-earnings', payload);
      await fetchOrders();
      setSnackbarMsg(res.data.message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error('Recalculate earnings error:', e);
      setSnackbarMsg(e?.response?.data?.error || 'Failed to recalculate earnings');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setRecalcEarningsLoading(false);
    }
  };

  const recalculateAmazonFinancials = async () => {
    const SINCE_DATE = '2026-02-28';
    const scopeMsg = selectedSeller
      ? `seller "${sellers.find(s => s._id === selectedSeller)?.user?.username || selectedSeller}"`
      : 'ALL sellers';

    const confirmed = window.confirm(
      `This will recalculate Amazon financials for ${scopeMsg}, orders on/after ${SINCE_DATE}.\n\n` +
      'Recalculates: amazonTotal, amazonTotalINR, marketplaceFee, igst, totalCC, profit\n' +
      'Formula: amazonTotal = beforeTax + estimatedTax\n\n' +
      'Continue?'
    );
    if (!confirmed) return;

    setRecalcAmazonLoading(true);
    try {
      const payload = selectedSeller
        ? { sellerId: selectedSeller, sinceDate: SINCE_DATE }
        : { allSellers: true, sinceDate: SINCE_DATE };

      const res = await api.post('/ebay/backfill-amazon-financials', payload);
      await fetchOrders();
      setSnackbarMsg(res.data.message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error('Recalculate Amazon financials error:', e);
      setSnackbarMsg(e?.response?.data?.error || 'Failed to recalculate Amazon financials');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setRecalcAmazonLoading(false);
    }
  };

  const backfillEverythingAllStores = async () => {
    const confirmed = window.confirm(
      'Run full historical backfill for ALL stores?\n\n' +
      'This runs Orders, Messages, Listings, Returns, INR Cases, and Payment Disputes sync in sequence and may take several minutes.'
    );
    if (!confirmed) return;

    setBackfillEverythingLoading(true);
    setError('');
    try {
      const { data } = await api.post('/ebay/backfill-everything-all-stores', {
        modules: ['orders', 'messages', 'listings', 'returns', 'inrCases', 'paymentDisputes'],
        continueOnError: true,
      });

      await loadStoredOrders();

      const ok = Number(data?.successfulSteps || 0);
      const failed = Number(data?.failedSteps || 0);
      setSnackbarMsg(`Backfill finished. Successful steps: ${ok}, Failed steps: ${failed}.`);
      setSnackbarSeverity(failed > 0 ? 'warning' : 'success');
      setSnackbarOpen(true);
      publishOrderSyncEvent('FulfillmentDashboard', 'backfill-everything-all-stores');
    } catch (e) {
      setSnackbarMsg(e?.response?.data?.error || 'Failed to run full backfill');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setBackfillEverythingLoading(false);
    }
  };

  // Update messaging status in database
  const updateMessagingStatus = async (orderId, status) => {
    try {
      await api.patch(`/ebay/orders/${orderId}/messaging-status`, { messagingStatus: status });
      // Update local state
      setOrders(prevOrders =>
        prevOrders.map(o => (o._id === orderId ? { ...o, messagingStatus: status } : o))
      );
      setSnackbarMsg('Messaging status updated successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Failed to update messaging status:', err);
      setSnackbarMsg('Failed to update messaging status');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleMessagingStatusChange = (orderId, newStatus) => {
    updateMessagingStatus(orderId, newStatus);
  };

  // Update item status in database
  const updateItemStatus = async (orderId, status) => {
    try {
      await api.patch(`/ebay/orders/${orderId}/item-status`, { itemStatus: status });
      // Update local state
      setOrders(prevOrders =>
        prevOrders.map(o => (o._id === orderId ? { ...o, itemStatus: status } : o))
      );
      setSnackbarMsg('Item status updated successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Failed to update item status:', err);
      setSnackbarMsg('Failed to update item status');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleItemStatusChange = (orderId, newStatus) => {
    updateItemStatus(orderId, newStatus);
  };

  const toggleShippingExpanded = useCallback((orderId) => {
    // If clicking same order, collapse it; otherwise expand new one
    setExpandedShippingId(prev => prev === orderId ? null : orderId);
  }, []);

  // helpers
  const formatDate = (dateStr, marketplaceId, { showIst = false } = {}) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);

      // Default to UTC
      let timeZone = 'UTC';
      let timeZoneLabel = 'UTC';

      // Determine Timezone based on Marketplace
      if (marketplaceId === 'EBAY_US') {
        timeZone = 'America/Los_Angeles'; // Covers PST and PDT automatically
        timeZoneLabel = 'PT';
      } else if (marketplaceId === 'EBAY_CA' || marketplaceId === 'EBAY_ENCA') {
        timeZone = 'America/New_York';    // Covers EST and EDT automatically
        timeZoneLabel = 'ET';
      } else if (marketplaceId === 'EBAY_AU') {
        timeZone = 'Australia/Sydney';    // Covers AEST and AEDT automatically
        timeZoneLabel = 'AET';
      } else if (marketplaceId === 'EBAY_GB') {
        timeZone = 'Europe/London';       // Covers GMT and BST automatically
        timeZoneLabel = 'GMT';
      }

      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timeZone,
      });

      // Optional: Add the time if you want to be precise
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timeZone,
      });

      const primaryLine = (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', lineHeight: 1.25 }}>
          {formattedDate}{' '}
          <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            {formattedTime} ({timeZoneLabel})
          </Box>
        </Typography>
      );

      if (!showIst) return primaryLine;

      const istDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Kolkata',
      });
      const istTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      });

      return (
        <Stack spacing={0.15}>
          {primaryLine}
          <Typography
            variant="caption"
            sx={{ whiteSpace: 'nowrap', fontSize: '0.68rem', lineHeight: 1.2, color: 'text.secondary' }}
          >
            {istDate}{' '}
            <Box component="span" sx={{ fontSize: '0.65rem' }}>
              {istTime} (IST)
            </Box>
          </Typography>
        </Stack>
      );
    } catch {
      return '-';
    }
  };

  // Custom formatter for Delivery Date Range
  const formatDeliveryDate = (order) => {
    // 1. Try to find dates in line items (preferred) or top-level
    // The structure is usually order.lineItems[0].lineItemFulfillmentInstructions.minEstimatedDeliveryDate
    let minDateStr = order.lineItems?.[0]?.lineItemFulfillmentInstructions?.minEstimatedDeliveryDate;
    let maxDateStr = order.lineItems?.[0]?.lineItemFulfillmentInstructions?.maxEstimatedDeliveryDate || order.estimatedDelivery;

    // Fallback if lineItems is missing or structure is different
    if (!maxDateStr) return '-';

    const marketplaceId = order.purchaseMarketplaceId;

    // Helper to get partial date string
    const getFormattedDatePart = (dStr) => {
      if (!dStr) return null;
      try {
        const date = new Date(dStr);
        let timeZone = 'UTC';
        // Determine Timezone
        if (marketplaceId === 'EBAY_US') timeZone = 'America/Los_Angeles';
        else if (['EBAY_CA', 'EBAY_ENCA'].includes(marketplaceId)) timeZone = 'America/New_York';
        else if (marketplaceId === 'EBAY_AU') timeZone = 'Australia/Sydney';

        return date.toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric', timeZone
        });
      } catch { return null; }
    };

    const minPart = getFormattedDatePart(minDateStr);
    const maxPart = getFormattedDatePart(maxDateStr);

    if (minPart && maxPart && minPart !== maxPart) {
      return (
        <Stack spacing={0}>
          <Typography variant="body2" fontWeight="medium">{minPart} -</Typography>
          <Typography variant="body2" fontWeight="medium">{maxPart}</Typography>
        </Stack>
      );
    }

    return (
      <Typography variant="body2">
        {maxPart || '-'}
      </Typography>
    );
  };


  const formatFieldName = (fieldName) => {
    // Convert camelCase to readable format
    return fieldName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  };

  // Earnings Breakdown Modal Component
  const EarningsBreakdownModal = ({ open, order, onClose }) => {
    if (!order) return null;

    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: 'primary.main', color: 'white', pb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Order Earnings Breakdown</Typography>
            <IconButton onClick={onClose} sx={{ color: 'white' }} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
            Order ID: {order.orderId}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {/* What Your Buyer Paid */}
          <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
            What your buyer paid
          </Typography>
          <Stack spacing={1} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Subtotal</Typography>
              <Typography fontWeight="medium">{formatOrderLocalAmount(order, order.subtotal)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Shipping</Typography>
              <Typography fontWeight="medium">{formatOrderLocalAmount(order, order.shipping)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Sales tax*</Typography>
              <Typography fontWeight="medium">{formatOrderLocalAmount(order, order.salesTax)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Discount</Typography>
              <Typography fontWeight="medium" color="success.main">{formatOrderDiscountAmount(order, order.discount)}</Typography>
            </Box>
            {order.refundTotalToBuyerUSD > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>Refund</Typography>
                <Typography fontWeight="medium" color="error.main">-{formatOrderUsdAmount(order, order.refundTotalToBuyerUSD || order.refundTotalToBuyer)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography fontWeight="bold">Order total**</Typography>
              <Typography fontWeight="bold">{formatOrderLocalAmount(order, order.orderTotalAfterRefund)}</Typography>
            </Box>
          </Stack>

          {/* What You Earned */}
          <Typography variant="h6" sx={{ mb: 2, color: 'success.main' }}>
            What you earned
          </Typography>
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Order total</Typography>
              <Typography fontWeight="medium">{formatOrderLocalAmount(order, order.orderTotalAfterRefund)}</Typography>
            </Box>
            {order.ebayPaidTaxRefundUSD > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>Refund (eBay paid)</Typography>
                <Typography fontWeight="medium" color="success.main">{formatOrderUsdAmount(order, order.ebayPaidTaxRefundUSD || order.ebayPaidTaxRefund)}</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2 }}>
              <Typography variant="body2" color="text.secondary">eBay collected from buyer</Typography>
              <Box />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4 }}>
              <Typography variant="body2">Sales tax</Typography>
              <Typography variant="body2" color="error.main">-{formatOrderLocalAmount(order, order.salesTax)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2 }}>
              <Typography variant="body2" color="text.secondary">Selling costs</Typography>
              <Box />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4 }}>
              <Typography variant="body2">Transaction fees</Typography>
              <Typography variant="body2" color="error.main">-{formatOrderLocalAmount(order, order.transactionFees)}</Typography>
            </Box>
            {order.adFeeGeneral > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4 }}>
                <Typography variant="body2">Ad Fee General</Typography>
                <Typography variant="body2" color="error.main">-{formatOrderUsdAmount(order, order.adFeeGeneral)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography fontWeight="bold" color="success.main">Order earnings</Typography>
              <Typography fontWeight="bold" color={getOrderEarnings(order) >= 0 ? 'success.main' : 'error.main'}>
                {formatOrderUsdAmount(order, getOrderEarnings(order))}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Open the Export Dialog
  const handleOpenExportDialog = () => {
    // Initialize with ALL columns selected by default
    setSelectedExportColumns(ALL_COLUMNS.map(col => col.id));
    setExportDialogOpen(true);
  };

  const handleFulfillmentImport = async ({ rows, fillEmptyOnly, onProgress }) => {
    const chunkSize = 100;
    const totalRows = rows.length;
    const totalChunks = Math.ceil(totalRows / chunkSize);
    const totals = { updated: 0, skipped: 0, notFound: 0, errors: [], processed: 0 };

    for (let start = 0; start < rows.length; start += chunkSize) {
      const chunkIndex = Math.floor(start / chunkSize) + 1;
      const chunk = rows.slice(start, start + chunkSize);

      onProgress?.({
        phase: 'sending',
        chunkIndex,
        totalChunks,
        processed: start,
        totalRows,
        updated: totals.updated,
        skipped: totals.skipped,
        notFound: totals.notFound,
      });

      const { data } = await api.post('/ebay/orders/bulk-import-fulfillment', {
        rows: chunk,
        fillEmptyOnly,
      }, { timeout: 300000 });
      totals.updated += data.updated || 0;
      totals.skipped += data.skipped || 0;
      totals.notFound += data.notFound || 0;
      totals.errors.push(...(data.errors || []));
      totals.processed = Math.min(start + chunk.length, totalRows);

      onProgress?.({
        phase: 'done',
        chunkIndex,
        totalChunks,
        processed: totals.processed,
        totalRows,
        updated: totals.updated,
        skipped: totals.skipped,
        notFound: totals.notFound,
      });
    }

    const parts = [
      `${totals.updated} updated`,
      `${totals.notFound} not found`,
      `${totals.skipped} skipped`,
    ];
    setSnackbarMsg(`Import complete: ${parts.join(', ')}`);
    setSnackbarSeverity(totals.updated > 0 ? 'success' : 'warning');
    setSnackbarOpen(true);

    if (totals.updated > 0) {
      await fetchOrders();
    }

    return totals;
  };

  // Toggle column selection in Export Dialog
  const handleToggleExportColumn = (columnId) => {
    setSelectedExportColumns(prev => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      } else {
        return [...prev, columnId];
      }
    });
  };

  const handleToggleAllExportColumns = () => {
    if (selectedExportColumns.length === ALL_COLUMNS.length) {
      setSelectedExportColumns([]); // Deselect all
    } else {
      setSelectedExportColumns(ALL_COLUMNS.map(col => col.id)); // Select all
    }
  };

  // Execute CSV Export with selected columns
  const handleExecuteExport = async () => {
    if (orders.length === 0) {
      setSnackbarMsg('No orders to export');
      setSnackbarSeverity('warning');
      setSnackbarOpen(true);
      return;
    }

    if (selectedExportColumns.length === 0) {
      alert("Please select at least one column to export.");
      return;
    }

    setExportingCSV(true);
    setExportDialogOpen(false);

    try {
      const params = buildStoredOrdersParams({ includePagination: false });

      const allOrders = await fetchAllPages('/ebay/stored-orders', params, {
        itemsKey: 'orders',
        limit: 200,
        timeout: 300000,
      });

      if (allOrders.length === 0) {
        setSnackbarMsg('No orders found to export');
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
        return;
      }

      const exportColumnDefs = {
        seller: { header: 'Seller', accessor: (o) => o.seller?.user?.username || '' },
        orderId: { header: 'Order ID', accessor: 'orderId' },
        dateSold: {
          header: 'Date Sold',
          accessor: (o) => o.dateSold ? new Date(o.dateSold).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : ''
        },
        shipBy: {
          header: 'Ship By',
          accessor: (o) => o.shipByDate ? new Date(o.shipByDate).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : ''
        },
        deliveryDate: {
          header: 'Delivery Date',
          accessor: (o) => formatDeliveryDate(o)
        },
        productName: { header: 'Product Name', accessor: 'productName' },
        sku: { header: 'SKU', accessor: (o) => getOrderSku(o) },
        supplierLink: { header: 'Supplier Link', accessor: (o) => getSupplierLink(o) },
        buyerNote: { header: 'Buyer Note', accessor: 'buyerCheckoutNotes' },
        buyerName: { header: 'Buyer Name', accessor: 'shippingFullName' },
        shippingAddress: {
          header: 'Shipping Address',
          accessor: (o) => [
            o.shippingFullName,
            o.shippingAddressLine1,
            o.shippingAddressLine2,
            [o.shippingCity, o.shippingState].filter(Boolean).join(', '),
            o.shippingPostalCode,
            o.shippingCountry,
          ].filter(Boolean).join(', ')
        },
        marketplace: { header: 'Marketplace', accessor: 'purchaseMarketplaceId' },
        subtotal: { header: 'Subtotal', accessor: 'subtotal' },
        shipping: { header: 'Shipping', accessor: 'shipping' },
        salesTax: { header: 'Sales Tax', accessor: 'salesTax' },
        discount: {
          header: 'Discount',
          accessor: (o) => {
            const n = Number(o.discount);
            return Number.isNaN(n) ? o.discount : Math.abs(n);
          }
        },
        transactionFees: { header: 'Transaction Fees', accessor: 'transactionFees' },
        adFeeGeneral: { header: 'Ad Fee General', accessor: 'adFeeGeneral' },
        tds: { header: 'TDS', accessor: 'tds' },
        cancelStatus: { header: 'Cancel Status', accessor: 'cancelState' },
        refunds: {
          header: 'Refunds',
          accessor: (o) => o.refunds?.map((refund) => `${refund.orderPaymentStatus === 'FULLY_REFUNDED' ? 'Full' : 'Partial'}: $${(Number(refund.amount?.value || refund.refundAmount?.value || 0) * (o.conversionRate || 1)).toFixed(2)}`).join('; ') || ''
        },
        reviewedRefund: {
          header: 'Reviewed Refund',
          accessor: (o) => {
            const status = String(o.orderPaymentStatus || '').toUpperCase();
            if (status !== 'PAID' && status !== 'PARTIALLY_REFUNDED') return '';
            const planOrder = status === 'PARTIALLY_REFUNDED'
              ? {
                ...o,
                adFeeGeneral: o.preRefundAdFeeGeneral != null ? o.preRefundAdFeeGeneral : o.adFeeGeneral,
                orderPaymentStatus: 'PAID'
              }
              : o;
            const plan = computePartialRefundEnterAmount(planOrder, PARTIAL_REFUND_TARGET_EARNINGS);
            return plan ? plan.enterRefundAmount : '';
          }
        },
        refundItemAmount: { header: 'Refund Item', accessor: 'refundItemAmount' },
        refundTaxAmount: { header: 'Refund Tax', accessor: 'refundTaxAmount' },
        refundTotalToBuyer: { header: 'Refund Total', accessor: 'refundTotalToBuyer' },
        orderTotalAfterRefund: { header: 'Order Total (After Refund)', accessor: 'orderTotalAfterRefund' },
        orderEarnings: {
          header: 'Order Earnings',
          accessor: (o) => getOrderEarnings(o)
        },
        trackingNumber: { header: 'Tracking Number', accessor: 'trackingNumber' },
        amazonAccount: { header: 'Amazon Acc', accessor: 'amazonAccount' },
        arriving: { header: 'Arriving', accessor: 'arrivingDate' },
        beforeTax: { header: 'Before Tax', accessor: 'beforeTax' },
        estimatedTax: { header: 'Estimated Tax', accessor: 'estimatedTax' },
        azOrderId: { header: 'Az OrderID', accessor: 'azOrderId' },
        amazonRefund: { header: 'Amazon Refund', accessor: 'amazonRefund' },
        cardName: { header: 'Card Name', accessor: 'cardName' },
        resolution: { header: 'Resolutions', accessor: 'resolution' },
        notes: { header: 'Notes', accessor: 'fulfillmentNotes' },
        messagingStatus: { header: 'Messaging', accessor: 'messagingStatus' },
        remark: { header: 'Remark', accessor: 'remark' },
        issueFlags: {
          header: 'Issues',
          accessor: (o) => {
            const issues = issuesIndex[o.orderId] || issuesIndex[o.legacyOrderId] || [];
            const seen = new Set();
            return issues
              .filter((issue) => {
                if (seen.has(issue.type)) return false;
                seen.add(issue.type);
                return true;
              })
              .map((issue) => issue.type)
              .join(', ');
          }
        },
      };

      const dynamicCsvColumns = {};

      ALL_COLUMNS.forEach((column) => {
        if (!selectedExportColumns.includes(column.id)) return;
        const exportDef = exportColumnDefs[column.id];
        if (!exportDef) return;
        dynamicCsvColumns[exportDef.header] = exportDef.accessor;
      });


      const csvData = prepareCSVData(allOrders, dynamicCsvColumns);
      downloadCSV(csvData, 'Fulfillment_Orders');

      setSnackbarMsg(`Exported ${allOrders.length} orders with ${Object.keys(dynamicCsvColumns).length} columns`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('CSV export error:', error);
      setSnackbarMsg(`Failed to export orders to CSV: ${error?.response?.data?.error || error.message || 'Unknown error'}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setExportingCSV(false);
    }
  };

  // Auto-message handlers
  const handleSendAutoMessages = async () => {
    setAutoMessageLoading(true);
    try {
      const res = await api.post('/ebay/orders/send-auto-messages');
      const { sent, failed, processed } = res.data;
      setSnackbarMsg(`Auto-messages: ${sent} sent, ${failed} failed (${processed} processed)`);
      setSnackbarSeverity(sent > 0 ? 'success' : 'info');
      setSnackbarOpen(true);
      // Reload orders to reflect updated status
      await fetchOrders();
    } catch (err) {
      console.error('Auto-message error:', err);
      setSnackbarMsg('Failed to send auto-messages: ' + (err.response?.data?.error || err.message));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setAutoMessageLoading(false);
    }
  };

  const handleToggleAutoMessage = useCallback(async (orderId, disabled) => {
    try {
      await api.patch(`/ebay/orders/${orderId}/auto-message-toggle`, { disabled });
      // Update local state
      setOrders(prevOrders =>
        prevOrders.map(o =>
          o.orderId === orderId ? { ...o, autoMessageDisabled: disabled } : o
        )
      );
      setSnackbarMsg(`Auto-message ${disabled ? 'disabled' : 'enabled'} for order`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Toggle auto-message error:', err);
      setSnackbarMsg('Failed to toggle auto-message');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, []);

  if (loading && orders.length === 0) return <FulfillmentSkeleton />;

  return (
    <Fade in timeout={600}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'calc(100dvh - 56px)', sm: 'calc(100dvh - 64px)', md: 'calc(100vh - 100px)' },
        overflow: 'hidden',
        width: '100%',
        maxWidth: '100%',
        px: { xs: 0.5, sm: 1, md: 0 }
      }}>
        {/* LOADING OVERLAY */}
        {loading && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
          >
            <Paper
              elevation={4}
              sx={{
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                borderRadius: 2,
              }}
            >
              <CircularProgress size={48} />
              <Typography variant="body1" color="text.secondary">
                Loading orders...
              </Typography>
            </Paper>
          </Box>
        )}

        {/* HEADER SECTION - FIXED */}
        <SectionCard sx={{ p: { xs: 1, sm: 1.25 }, mb: 1, flexShrink: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <LocalShippingIcon color="primary" sx={{ fontSize: { xs: 18, sm: 20 } }} />
              <Typography
                variant="h6"
                fontWeight="bold"
                sx={{ fontSize: { xs: '1rem', sm: '1.05rem', md: '1.15rem' } }}
              >
                Fulfillment Dashboard
              </Typography>
              {totalOrders > 0 && (
                <Chip
                  label={`${totalOrders} orders`}
                  variant="filled"
                  size="small"
                  sx={{ bgcolor: '#f5c842', color: '#1a1a2e', fontWeight: 700, height: 22, fontSize: '0.7rem' }}
                />
              )}
              {orders.length > 0 && totalPages > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  (Page {currentPage}/{totalPages})
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadIcon />}
                onClick={() => setImportDialogOpen(true)}
                sx={{ ...yellowOutlinedButtonSx, fontSize: { xs: '0.7rem', sm: '0.75rem' }, py: 0.25, minHeight: 28 }}
              >
                {isSmallMobile ? 'Import' : 'Import CSV'}
              </Button>
              {orders.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={exportingCSV ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
                  onClick={handleOpenExportDialog}
                  disabled={exportingCSV}
                  sx={{ ...yellowOutlinedButtonSx, fontSize: { xs: '0.7rem', sm: '0.75rem' }, py: 0.25, minHeight: 28 }}
                >
                  {exportingCSV ? 'Exporting...' : (isSmallMobile ? 'CSV' : 'Download CSV')}
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                startIcon={autoMessageLoading ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
                onClick={handleSendAutoMessages}
                disabled={autoMessageLoading}
                sx={{ ...yellowFilledButtonSx, fontSize: { xs: '0.7rem', sm: '0.75rem' }, py: 0.25, minHeight: 28 }}
              >
                {isSmallMobile ? 'Auto Msg' : 'Send Auto Messages'}
              </Button>
            </Stack>
          </Stack>

          {/* CONTROLS */}
          {isMobile ? (
            /* MOBILE LAYOUT - Compact Vertical Stack */
            <Stack spacing={1}>
              {/* Row 1: Seller + Date Mode / Search / Clear */}
              <DateModeSearchBar
                sellers={sellers}
                draftSelectedSeller={draftSelectedSeller}
                setDraftSelectedSeller={setDraftSelectedSeller}
                draftDateFilter={draftDateFilter}
                setDraftDateFilter={setDraftDateFilter}
                onSearch={() => searchFiltersRef.current?.search()}
                onClear={() => searchFiltersRef.current?.clear()}
                fullWidth
                sellerFullWidth
              />

              {/* Row 2: Poll New + More actions */}
              <Stack direction="row" spacing={1}>
                <Tooltip title="Fetches all eBay orders created today + yesterday (Pacific Time). Creates new orders and refreshes existing ones.">
                  <span style={{ display: 'flex', flex: 1 }}>
                    <Button
                      variant="contained"
                      startIcon={!isSmallMobile && (loading ? <CircularProgress size={16} color="inherit" /> : <ShoppingCartIcon />)}
                      onClick={pollNewOrders}
                      disabled={loading}
                      size="small"
                      fullWidth
                      sx={{
                        ...yellowFilledButtonSx,
                        fontSize: { xs: '0.7rem', sm: '0.8rem' },
                        px: { xs: 0.5, sm: 1 }
                      }}
                    >
                      {loading ? 'Polling...' : isSmallMobile ? 'Poll New' : 'Poll New Orders'}
                    </Button>
                  </span>
                </Tooltip>

                {isSuperAdmin && (
                  <>
                    <Button
                      variant="outlined"
                      color="inherit"
                      size="small"
                      endIcon={<MoreVertIcon />}
                      onClick={(e) => setMoreActionsAnchor(e.currentTarget)}
                      sx={{ fontSize: '0.7rem', minWidth: 'auto', whiteSpace: 'nowrap' }}
                    >
                      More
                    </Button>
                    <Menu
                      anchorEl={moreActionsAnchor}
                      open={Boolean(moreActionsAnchor)}
                      onClose={() => setMoreActionsAnchor(null)}
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                      PaperProps={{ sx: { maxWidth: 320 } }}
                    >
                      <Box sx={{ px: 2, pb: 1, pt: 1 }}>
                        <Select
                          value={resyncDays}
                          onChange={(e) => setResyncDays(e.target.value)}
                          size="small"
                          fullWidth
                          sx={{ height: 32, fontSize: '0.75rem' }}
                        >
                          <MenuItem value={3}>3 Days</MenuItem>
                          <MenuItem value={7}>7 Days</MenuItem>
                          <MenuItem value={30}>30 Days</MenuItem>
                          <MenuItem value={90}>90 Days</MenuItem>
                          <MenuItem value={365}>1 Year</MenuItem>
                          <MenuItem value={730}>2 Year</MenuItem>
                        </Select>
                      </Box>
                      <MenuItem
                        onClick={() => { setMoreActionsAnchor(null); resyncRecent(); }}
                        disabled={loading}
                      >
                        {loading ? 'Syncing...' : `Resync ${
                          Number(resyncDays) === 365 ? '1 Year'
                            : Number(resyncDays) === 730 ? '2 Year'
                              : `${resyncDays} Days`
                        }`}
                      </MenuItem>
                      <MenuItem
                        onClick={() => { setMoreActionsAnchor(null); pollTds(); }}
                        disabled={pollTdsLoading}
                      >
                        {pollTdsLoading ? 'Polling TDS...' : 'Poll TDS (All DB)'}
                      </MenuItem>
                      <MenuItem
                        onClick={() => { setMoreActionsAnchor(null); recalculateEarnings(); }}
                        disabled={recalcEarningsLoading}
                      >
                        {recalcEarningsLoading ? 'Recalculating...' : 'Recalc Earnings'}
                      </MenuItem>
                      <MenuItem
                        onClick={() => { setMoreActionsAnchor(null); recalculateAmazonFinancials(); }}
                        disabled={recalcAmazonLoading}
                      >
                        {recalcAmazonLoading ? 'Recalculating...' : 'Recalc Amazon'}
                      </MenuItem>
                    </Menu>
                  </>
                )}
              </Stack>

              {/* Row 3: Marketplace filter */}
              <Stack direction="row" spacing={1}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="marketplace-filter-label">Marketplace</InputLabel>
                  <Select
                    labelId="marketplace-filter-label"
                    value={searchMarketplace}
                    label="Marketplace"
                    onChange={(e) => setSearchMarketplace(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    <MenuItem value="EBAY_US">USA</MenuItem>
                    <MenuItem value="EBAY_ENCA">CA</MenuItem>
                    <MenuItem value="EBAY_AU">AUS</MenuItem>
                    <MenuItem value="EBAY_GB">UK</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              {/* Row 3.5: Exclude Low Value & Missing Amazon Account Toggles */}
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={excludeClient}
                      onChange={(e) => setExcludeClient(e.target.checked)}
                      color="primary"
                      size="small"
                    />
                  }
                  label="Exclude Client"
                  sx={FILTER_SWITCH_SX}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={excludeLowValue}
                      onChange={(e) => setExcludeLowValue(e.target.checked)}
                      color="primary"
                      size="small"
                    />
                  }
                  label="Exclude <$3"
                  sx={FILTER_SWITCH_SX}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={missingAmazonAccount}
                      onChange={(e) => setMissingAmazonAccount(e.target.checked)}
                      color="primary"
                      size="small"
                    />
                  }
                  label="Missing Amazon Acc"
                  sx={FILTER_SWITCH_SX}
                />
              </Stack>

              {/* Row 4: Column Selector */}
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                <ColumnSelector
                  allColumns={ALL_COLUMNS}
                  visibleColumns={visibleColumns}
                  onColumnChange={setVisibleColumns}
                  onReset={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                  page="dashboard"
                />
              </Stack>
            </Stack>
          ) : (
            /* DESKTOP LAYOUT - Dense rows */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Row 1: Seller + Poll actions (left) | Filters, Toggles, Column Selector (right) */}
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                justifyContent="space-between"
                sx={{ flexWrap: 'wrap', rowGap: 1 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <DateModeSearchBar
                    sellers={sellers}
                    draftSelectedSeller={draftSelectedSeller}
                    setDraftSelectedSeller={setDraftSelectedSeller}
                    draftDateFilter={draftDateFilter}
                    setDraftDateFilter={setDraftDateFilter}
                    onSearch={() => searchFiltersRef.current?.search()}
                    onClear={() => searchFiltersRef.current?.clear()}
                  />

                  <Tooltip title="Fetches all eBay orders created today + yesterday (Pacific Time). Creates new orders and refreshes existing ones.">
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <ShoppingCartIcon />}
                        onClick={pollNewOrders}
                        disabled={loading}
                        sx={{ ...yellowFilledButtonSx, minWidth: 'auto' }}
                      >
                        {loading ? 'Polling...' : 'Poll New Orders'}
                      </Button>
                    </span>
                  </Tooltip>

                  {isSuperAdmin && (
                    <>
                      <Button
                        variant="outlined"
                        color="inherit"
                        size="small"
                        endIcon={<MoreVertIcon />}
                        onClick={(e) => setMoreActionsAnchor(e.currentTarget)}
                      >
                        More actions
                      </Button>
                      <Menu
                        anchorEl={moreActionsAnchor}
                        open={Boolean(moreActionsAnchor)}
                        onClose={() => setMoreActionsAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        PaperProps={{ sx: { maxWidth: 360 } }}
                      >
                        <Box sx={{ px: 2, pb: 1, pt: 1 }}>
                          <Select
                            value={resyncDays}
                            onChange={(e) => setResyncDays(e.target.value)}
                            size="small"
                            fullWidth
                            sx={{ height: 36, fontSize: '0.85rem' }}
                          >
                            <MenuItem value={3}>3 Days</MenuItem>
                            <MenuItem value={7}>7 Days</MenuItem>
                            <MenuItem value={30}>30 Days</MenuItem>
                            <MenuItem value={90}>90 Days</MenuItem>
                            <MenuItem value={365}>1 Year</MenuItem>
                            <MenuItem value={730}>2 Year</MenuItem>
                          </Select>
                        </Box>
                        <MenuItem
                          onClick={() => { setMoreActionsAnchor(null); resyncRecent(); }}
                          disabled={loading}
                        >
                          {loading ? 'Syncing...' : `Resync ${
                            Number(resyncDays) === 365 ? '1 Year'
                              : Number(resyncDays) === 730 ? '2 Year'
                                : `${resyncDays} Days`
                          }`}
                        </MenuItem>
                        <MenuItem
                          onClick={() => { setMoreActionsAnchor(null); pollTds(); }}
                          disabled={pollTdsLoading}
                        >
                          {pollTdsLoading ? 'Polling TDS...' : 'Poll TDS (All DB)'}
                        </MenuItem>
                        <MenuItem
                          onClick={() => { setMoreActionsAnchor(null); recalculateEarnings(); }}
                          disabled={recalcEarningsLoading}
                        >
                          {recalcEarningsLoading ? 'Recalculating...' : 'Recalc Earnings'}
                        </MenuItem>
                        <MenuItem
                          onClick={() => { setMoreActionsAnchor(null); recalculateAmazonFinancials(); }}
                          disabled={recalcAmazonLoading}
                        >
                          {recalcAmazonLoading ? 'Recalculating...' : 'Recalc Amazon'}
                        </MenuItem>
                      </Menu>
                    </>
                  )}
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <Select
                    value={searchMarketplace}
                    onChange={(e) => setSearchMarketplace(e.target.value)}
                    displayEmpty
                    size="small"
                    renderValue={(val) => {
                      if (!val) return 'Marketplace';
                      const labels = { EBAY_US: 'USA', EBAY_ENCA: 'CA', EBAY_AU: 'AUS', EBAY_GB: 'UK' };
                      return labels[val] || val;
                    }}
                    sx={{ minWidth: 110, fontSize: '0.8rem', color: searchMarketplace ? 'inherit' : 'text.secondary' }}
                  >
                    <MenuItem value=""><em>All</em></MenuItem>
                    <MenuItem value="EBAY_US">USA</MenuItem>
                    <MenuItem value="EBAY_ENCA">CA</MenuItem>
                    <MenuItem value="EBAY_AU">AUS</MenuItem>
                    <MenuItem value="EBAY_GB">UK</MenuItem>
                  </Select>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={excludeClient}
                        onChange={(e) => setExcludeClient(e.target.checked)}
                        color="primary"
                        size="small"
                      />
                    }
                    label="Exclude Client"
                    sx={FILTER_SWITCH_SX}
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={excludeLowValue}
                        onChange={(e) => setExcludeLowValue(e.target.checked)}
                        color="primary"
                        size="small"
                      />
                    }
                    label="Exclude <$3"
                    sx={FILTER_SWITCH_SX}
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={missingAmazonAccount}
                        onChange={(e) => setMissingAmazonAccount(e.target.checked)}
                        color="primary"
                        size="small"
                      />
                    }
                    label="Missing Amazon Acc"
                    sx={FILTER_SWITCH_SX}
                  />

                  <ColumnSelector
                    allColumns={ALL_COLUMNS}
                    visibleColumns={visibleColumns}
                    onColumnChange={setVisibleColumns}
                    onReset={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                    page="dashboard"
                  />
                </Stack>
              </Stack>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}

          {scopeWarning && !error && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {scopeWarning}
            </Alert>
          )}

          {/* SEARCH FILTERS */}
          <SearchFiltersPanel
            ref={searchFiltersRef}
            searchOrderId={searchOrderId}
            setSearchOrderId={setSearchOrderId}
            searchAzOrderId={searchAzOrderId}
            setSearchAzOrderId={setSearchAzOrderId}
            searchBuyerName={searchBuyerName}
            setSearchBuyerName={setSearchBuyerName}
            searchItemId={searchItemId}
            setSearchItemId={setSearchItemId}
            searchSku={searchSku}
            setSearchSku={setSearchSku}
            searchProductName={searchProductName}
            setSearchProductName={setSearchProductName}
            searchPaymentStatus={searchPaymentStatus}
            setSearchPaymentStatus={setSearchPaymentStatus}
            searchCancelStatus={searchCancelStatus}
            setSearchCancelStatus={setSearchCancelStatus}
            searchIssueType={searchIssueType}
            setSearchIssueType={setSearchIssueType}
            searchCaseCategory={searchCaseCategory}
            setSearchCaseCategory={setSearchCaseCategory}
            searchCaseStatus={searchCaseStatus}
            setSearchCaseStatus={setSearchCaseStatus}
            draftSelectedSeller={draftSelectedSeller}
            setDraftSelectedSeller={setDraftSelectedSeller}
            setSelectedSeller={setSelectedSeller}
            draftDateFilter={draftDateFilter}
            setDraftDateFilter={setDraftDateFilter}
            setDateFilter={setDateFilter}
            onApplyFilters={applyCommittedFilters}
            isSmallMobile={isSmallMobile}
          />



        </SectionCard>

        {/* TABLE SECTION */}
        {
          orders.length === 0 && !loading ? (
            <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center' }}>
              <ShoppingCartIcon sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 2 }} />
              <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                No orders found. Click "Poll New Orders" to fetch today + yesterday (PT) from eBay.
              </Typography>
            </Paper>
          ) : (
            <>
              {/* MOBILE CARD VIEW */}
              <Box
                sx={{
                  display: { xs: 'block', md: 'none' },
                  flexGrow: 1,
                  overflow: 'auto',
                  p: 1,
                  '&::-webkit-scrollbar': { width: '4px' },
                  '&::-webkit-scrollbar-thumb': { backgroundColor: '#888', borderRadius: '4px' }
                }}
              >
                <Stack spacing={1.5}>
                  {orders.map((order, idx) => (
                    <MobileOrderCard
                      key={order._id || idx}
                      order={order}
                      index={(currentPage - 1) * ordersPerPage + idx + 1}
                      onCopy={handleCopy}
                      onMessage={handleOpenMessageDialog}
                      onViewImages={handleViewImages}
                    />
                  ))}
                </Stack>
              </Box>

              {/* DESKTOP TABLE VIEW */}
              <TableContainer
                component={Paper}
                sx={{
                  display: { xs: 'none', md: 'block' },
                  flexGrow: 1,
                  overflow: 'auto',
                  maxHeight: 'calc(100% - 50px)',
                  width: '100%',
                  '&::-webkit-scrollbar': {
                    width: '8px',
                    height: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    backgroundColor: '#f1f1f1',
                    borderRadius: '10px',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    backgroundColor: '#888',
                    borderRadius: '10px',
                    '&:hover': {
                      backgroundColor: '#555',
                    },
                  },
                }}
              >
                <Table
                  size="small"
                  stickyHeader
                  sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell sx={HEADER_CELL_SX}>SL No</TableCell>
                      {visibleColumnsSet.has('seller') && <TableCell sx={HEADER_CELL_SX}>Seller</TableCell>}
                      {visibleColumnsSet.has('orderId') && <TableCell sx={HEADER_CELL_SX}>Order ID</TableCell>}
                      {visibleColumnsSet.has('dateSold') && <TableCell sx={HEADER_CELL_SX}>Date Sold</TableCell>}
                      {visibleColumnsSet.has('shipBy') && <TableCell sx={HEADER_CELL_SX}>Ship By</TableCell>}
                      {visibleColumnsSet.has('deliveryDate') && <TableCell sx={HEADER_CELL_SX}>Delivery Date</TableCell>}
                      {visibleColumnsSet.has('productName') && <TableCell sx={HEADER_CELL_SX}>Product Name</TableCell>}
                      {visibleColumnsSet.has('sku') && <TableCell sx={HEADER_CELL_SX}>SKU</TableCell>}
                      {visibleColumnsSet.has('supplierLink') && <TableCell sx={HEADER_CELL_SX}>Supplier Link</TableCell>}
                      {visibleColumnsSet.has('itemCategory') && <TableCell sx={HEADER_CELL_SX}>Category</TableCell>}
                      {visibleColumnsSet.has('buyerNote') && <TableCell sx={HEADER_CELL_SX}>Buyer Note</TableCell>}
                      {visibleColumnsSet.has('buyerName') && <TableCell sx={HEADER_CELL_SX}>Buyer Name</TableCell>}
                      {visibleColumnsSet.has('shippingAddress') && <TableCell sx={HEADER_CELL_SX}>Shipping Address</TableCell>}
                      {visibleColumnsSet.has('marketplace') && <TableCell sx={HEADER_CELL_SX}>Marketplace</TableCell>}
                      {visibleColumnsSet.has('subtotal') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Subtotal</TableCell>}
                      {visibleColumnsSet.has('shipping') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Shipping</TableCell>}
                      {visibleColumnsSet.has('salesTax') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Sales Tax</TableCell>}
                      {visibleColumnsSet.has('discount') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Discount</TableCell>}
                      {visibleColumnsSet.has('transactionFees') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Transaction Fees</TableCell>}
                      {visibleColumnsSet.has('adFeeGeneral') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Ad Fee General</TableCell>}
                      {visibleColumnsSet.has('tds') && <TableCell sx={HEADER_CELL_RIGHT_SX}>TDS</TableCell>}
                      {visibleColumnsSet.has('cancelStatus') && <TableCell sx={HEADER_CELL_SX}>Cancel Status</TableCell>}
                      {visibleColumnsSet.has('refunds') && <TableCell sx={HEADER_CELL_SX}>Refunds</TableCell>}
                      {visibleColumnsSet.has('reviewedRefund') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Reviewed Refund</TableCell>}
                      {visibleColumnsSet.has('refundItemAmount') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Refund Item</TableCell>}
                      {visibleColumnsSet.has('refundTaxAmount') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Refund Tax</TableCell>}
                      {visibleColumnsSet.has('refundTotalToBuyer') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Refund Total</TableCell>}
                      {visibleColumnsSet.has('orderTotalAfterRefund') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Order Total</TableCell>}
                      {visibleColumnsSet.has('orderEarnings') && <TableCell sx={HEADER_CELL_RIGHT_SX}>Earnings</TableCell>}
                      {visibleColumnsSet.has('trackingNumber') && <TableCell sx={HEADER_CELL_SX}>Tracking Number</TableCell>}
                      {visibleColumnsSet.has('amazonAccount') && <TableCell sx={HEADER_CELL_SX}>Amazon Acc</TableCell>}
                      {visibleColumnsSet.has('arriving') && <TableCell sx={HEADER_CELL_SX}>Arriving</TableCell>}
                      {visibleColumnsSet.has('beforeTax') && <TableCell sx={HEADER_CELL_SX}>Before Tax</TableCell>}
                      {visibleColumnsSet.has('estimatedTax') && <TableCell sx={HEADER_CELL_SX}>Estimated Tax</TableCell>}
                      {visibleColumnsSet.has('azOrderId') && <TableCell sx={HEADER_CELL_SX}>Az OrderID</TableCell>}
                      {visibleColumnsSet.has('amazonRefund') && <TableCell sx={HEADER_CELL_SX}>Amazon Refund</TableCell>}
                      {visibleColumnsSet.has('cardName') && <TableCell sx={HEADER_CELL_SX}>Card Name</TableCell>}
                      {visibleColumnsSet.has('resolution') && <TableCell sx={HEADER_CELL_SX}>Resolutions</TableCell>}
                      {visibleColumnsSet.has('notes') && <TableCell sx={HEADER_CELL_SX}>Notes</TableCell>}
                      {visibleColumnsSet.has('messagingStatus') && <TableCell sx={HEADER_CELL_SX}>Messaging</TableCell>}
                      {visibleColumnsSet.has('remark') && <TableCell sx={HEADER_CELL_SX}>Remark</TableCell>}
                      {visibleColumnsSet.has('issueFlags') && <TableCell sx={HEADER_CELL_SX}>Issues</TableCell>}
                      {visibleColumnsSet.has('convoCategory') && <TableCell sx={HEADER_CELL_SX}>Case Category</TableCell>}
                      {visibleColumnsSet.has('convoCaseStatus') && <TableCell sx={HEADER_CELL_SX}>Case Status</TableCell>}
                      <TableCell sx={{ ...HEADER_CELL_SX, textAlign: 'center' }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.map((order, idx) => (
                        <TableRow
                          key={order._id}
                          sx={{
                            ...tableBodyRowSx,
                            '& > .MuiTableCell-root': BODY_CELL_SX,
                          }}
                        >
                          <TableCell>{(currentPage - 1) * ordersPerPage + idx + 1}</TableCell>
                          {visibleColumnsSet.has('seller') && (
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium" sx={{ fontSize: '0.8125rem' }}>
                                {order.seller?.user?.username ||
                                  order.seller?.user?.email ||
                                  order.sellerId ||
                                  '-'}
                              </Typography>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('orderId') && (
                            <TableCell>
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Typography variant="body2" fontWeight="medium" sx={{ color: 'primary.main', fontSize: '0.8125rem' }}>
                                  {order.orderId || order.legacyOrderId || '-'}
                                </Typography>
                                {(order.orderId || order.legacyOrderId) && (
                                  <Tooltip title="Copy Order ID">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopy(order.orderId || order.legacyOrderId)}
                                      aria-label="copy order id"
                                      sx={{ p: 0.25 }}
                                    >
                                      <ContentCopyIcon fontSize="small" sx={{ fontSize: '0.875rem' }} />
                                    </IconButton>
                                  </Tooltip>
                                )}

                                {/* Auto-Message Status Indicator */}
                                {order.autoMessageSent ? (
                                  <Tooltip title={`Auto-message sent at ${new Date(order.autoMessageSentAt).toLocaleString()}`}>
                                    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                                  </Tooltip>
                                ) : (
                                  <Tooltip title={order.autoMessageDisabled ? "Auto-message disabled (click to enable)" : "Auto-message pending (click to disable)"}>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleAutoMessage(order.orderId, !order.autoMessageDisabled);
                                      }}
                                      sx={{ p: 0.5 }}
                                    >
                                      {order.autoMessageDisabled ? (
                                        <BlockIcon color="action" sx={{ fontSize: 16 }} />
                                      ) : (
                                        <AccessTimeIcon color="primary" sx={{ fontSize: 16 }} />
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('dateSold') && (
                            <TableCell>
                              {formatDate(order.dateSold, order.purchaseMarketplaceId, { showIst: true })}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('shipBy') && (
                            <TableCell>
                              {formatDate(order.shipByDate, order.purchaseMarketplaceId, { showIst: true })}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('deliveryDate') && <TableCell>{formatDeliveryDate(order)}</TableCell>}
                          {visibleColumnsSet.has('productName') && (
                            <FulfillmentOrderRow
                              order={order}
                              imageCount={itemImages[order._id]?.count || 0}
                              loadingImages={!!loadingImages[order._id]}
                              onViewImages={handleViewImages}
                              onCopy={handleCopy}
                            />
                          )}
                          {visibleColumnsSet.has('sku') && (
                            <TableCell sx={{ maxWidth: 220, pr: 1 }}>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                  {getOrderSku(order) || '-'}
                                </Typography>
                                {getOrderSku(order) && (
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCopy(getOrderSku(order))}
                                    aria-label="copy sku"
                                  >
                                    <ContentCopyIcon fontSize="small" sx={{ fontSize: '1rem' }} />
                                  </IconButton>
                                )}
                              </Stack>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('supplierLink') && (
                            <TableCell sx={{ maxWidth: 260, pr: 1 }}>
                              {(() => {
                                const supplierLink = getSupplierLink(order);
                                if (!supplierLink) {
                                  return <Typography variant="body2" color="text.disabled">-</Typography>;
                                }
                                return (
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Tooltip title={supplierLink} arrow placement="top">
                                      <Link
                                        href={supplierLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        variant="body2"
                                        sx={{
                                          maxWidth: 180,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          display: 'inline-block',
                                        }}
                                      >
                                        Link
                                      </Link>
                                    </Tooltip>
                                    <Tooltip title="Open link">
                                      <IconButton
                                        size="small"
                                        component="a"
                                        href={supplierLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="open supplier link"
                                      >
                                        <OpenInNewIcon fontSize="small" sx={{ fontSize: '1rem' }} />
                                      </IconButton>
                                    </Tooltip>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopy(supplierLink)}
                                      aria-label="copy supplier link"
                                    >
                                      <ContentCopyIcon fontSize="small" sx={{ fontSize: '1rem' }} />
                                    </IconButton>
                                  </Stack>
                                );
                              })()}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('itemCategory') && (
                            <TableCell>
                              {(() => {
                                const cat = order.orderCategoryId?.name;
                                const rng = order.orderRangeId?.name;
                                const prod = order.orderProductId?.name;
                                const label = cat ? [cat, rng, prod].filter(Boolean).join(' > ') : null;
                                return (
                                  <Chip
                                    label={label || '- Assign -'}
                                    size="small"
                                    variant={label ? 'filled' : 'outlined'}
                                    color={label ? 'primary' : 'default'}
                                    onClick={() => { setCrpDialogOrder(order); setCrpDialogOpen(true); }}
                                    sx={{ cursor: 'pointer', maxWidth: 220, fontSize: '0.78rem' }}
                                  />
                                );
                              })()}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('buyerNote') && (
                            <TableCell sx={{ maxWidth: 300 }}>
                              {order.buyerCheckoutNotes ? (
                                <Tooltip title={order.buyerCheckoutNotes} arrow placement="top">
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      fontStyle: 'italic',
                                      color: 'text.secondary'
                                    }}
                                  >
                                    {order.buyerCheckoutNotes}
                                  </Typography>
                                </Tooltip>
                              ) : (
                                <Typography variant="body2" color="text.disabled">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('buyerName') && (
                            <TableCell sx={{ maxWidth: 150, pr: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                                <Tooltip title={order.buyer?.buyerRegistrationAddress?.fullName || '-'} arrow>
                                  <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {order.buyer?.buyerRegistrationAddress?.fullName || '-'}
                                  </Typography>
                                </Tooltip>
                                <IconButton size="small" onClick={() => handleCopy(order.buyer?.buyerRegistrationAddress?.fullName || '-')} aria-label="copy buyer name">
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('shippingAddress') && (
                            <TableCell sx={{ maxWidth: 300 }}>
                              <Collapse in={expandedShippingId === order._id} timeout="auto">
                                <Stack spacing={0.5}>
                                  {/* Full Name */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingFullName || '-'} arrow>
                                      <Typography variant="body2" fontWeight="medium" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingFullName || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingFullName)} aria-label="copy name">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* Address Line 1 */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingAddressLine1 || '-'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingAddressLine1 || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingAddressLine1)} aria-label="copy address">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* Address Line 2 */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingAddressLine2 || '-'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingAddressLine2 || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingAddressLine2)} aria-label="copy address line 2">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* City */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingCity || '-'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingCity || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingCity)} aria-label="copy city">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* State */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingState || '-'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingState || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingState)} aria-label="copy state">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* Postal Code */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingPostalCode || '-'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingPostalCode || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingPostalCode)} aria-label="copy postal code">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* Country */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingCountry || '-'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {order.shippingCountry || '-'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy(order.shippingCountry)} aria-label="copy country">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* Phone */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Tooltip title={order.shippingPhone || '0000000000'} arrow>
                                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        📞 {'0000000000'}
                                      </Typography>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => handleCopy('0000000000')} aria-label="copy phone">
                                      <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                  {/* Collapse Button */}
                                  <Button
                                    size="small"
                                    onClick={() => handleCopy(formatFullShippingAddress(order))}
                                    startIcon={<ContentCopyIcon fontSize="small" />}
                                    sx={{ mt: 0.5, textTransform: 'none' }}
                                  >
                                    Copy Full Address
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => toggleShippingExpanded(order._id)}
                                    startIcon={<ExpandLessIcon />}
                                    sx={{ mt: 0.5 }}
                                  >
                                    Collapse
                                  </Button>
                                </Stack>
                              </Collapse>
                              <Collapse in={expandedShippingId !== order._id} timeout="auto">
                                <Button
                                  size="small"
                                  onClick={() => toggleShippingExpanded(order._id)}
                                  endIcon={<ExpandMoreIcon />}
                                  sx={{ textTransform: 'none' }}
                                >
                                  {order.shippingFullName || 'View Address'}
                                </Button>
                              </Collapse>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('marketplace') && (
                            <TableCell>
                              <Typography variant="body2">
                                {order.purchaseMarketplaceId || '-'}
                              </Typography>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('subtotal') && (
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight="medium">
                                {formatOrderLocalAmount(order, order.subtotal)}
                              </Typography>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('shipping') && (
                            <TableCell align="right">{formatOrderLocalAmount(order, order.shipping)}</TableCell>
                          )}
                          {visibleColumnsSet.has('salesTax') && (
                            <TableCell align="right">{formatOrderLocalAmount(order, order.salesTax)}</TableCell>
                          )}
                          {visibleColumnsSet.has('discount') && (
                            <TableCell align="right">
                              <Typography variant="body2">
                                {formatOrderDiscountAmount(order, order.discount)}
                              </Typography>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('transactionFees') && (
                            <TableCell align="right">{formatOrderLocalAmount(order, order.transactionFees)}</TableCell>
                          )}
                          {visibleColumnsSet.has('adFeeGeneral') && (
                            <TableCell align="right">
                              {order.adFeeGeneral ? (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 'medium',
                                    color: 'error.main'
                                  }}
                                >
                                  {formatOrderUsdAmount(order, order.adFeeGeneral)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('tds') && (
                            <TableCell align="right">
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                                {order.tds != null ? (
                                  <Tooltip
                                    title={
                                      order.tdsSource === 'finances'
                                        ? 'TDS from eBay Finances'
                                        : '0.1% of subtotal (no Finances TDS found — DB estimate kept)'
                                    }
                                  >
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: order.tds ? 'medium' : 'normal',
                                        color: order.tdsSource === 'finances'
                                          ? (order.tds ? 'error.main' : 'text.secondary')
                                          : 'text.secondary'
                                      }}
                                    >
                                      {formatOrderTdsAmount(order, order.tds)}
                                    </Typography>
                                  </Tooltip>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">-</Typography>
                                )}
                                <Tooltip title="Fetch Ad Fee + TDS from eBay Finances">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleFetchAdFeeGeneral(order)}
                                      disabled={Boolean(fetchingAdFeeGeneral[order._id])}
                                      aria-label="fetch ad fee and tds"
                                      sx={{ p: 0.35 }}
                                    >
                                      {fetchingAdFeeGeneral[order._id]
                                        ? <CircularProgress size={14} color="inherit" />
                                        : <SyncIcon sx={{ fontSize: 16 }} />}
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('cancelStatus') && (
                            <TableCell>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip
                                  label={order.cancelState || 'NONE_REQUESTED'}
                                  size="small"
                                  color={
                                    order.cancelState === 'CANCELED' ? 'error' :
                                      order.cancelState === 'CANCEL_REQUESTED' ? 'warning' :
                                        order.cancelState === 'IN_PROGRESS' ? 'warning' :
                                          'success'
                                  }
                                  sx={{
                                    fontSize: '0.7rem',
                                    backgroundColor: order.cancelState === 'IN_PROGRESS' ? '#ffd700' : undefined,
                                    color: order.cancelState === 'IN_PROGRESS' ? '#000' : undefined,
                                    fontWeight: order.cancelState === 'IN_PROGRESS' ? 'bold' : 'normal'
                                  }}
                                />
                                <Tooltip title="Fetch cancel status from eBay">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleFetchCancelStatus(order)}
                                      disabled={Boolean(fetchingCancelStatus[order._id])}
                                      aria-label="fetch cancel status"
                                      sx={{ p: 0.35 }}
                                    >
                                      {fetchingCancelStatus[order._id]
                                        ? <CircularProgress size={14} color="inherit" />
                                        : <SyncIcon sx={{ fontSize: 16 }} />}
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          )}
                          {/* --- REPLACEMENT FOR REFUNDS CELL --- */}
                          {visibleColumnsSet.has('refunds') && (
                            <TableCell>
                              {order.refunds && order.refunds.length > 0 ? (
                                <Stack spacing={0.5}>
                                  {order.refunds.map((refund, idx) => {
                                    // 1. Get Amount in USD (convert using order's conversion rate)
                                    const rawValue = refund.amount?.value || refund.refundAmount?.value || 0;
                                    const conversionRate = order.conversionRate || 1;
                                    const amountUSD = (Number(rawValue) * conversionRate).toFixed(2);

                                    // 2. Determine Label & Color based on Order Status
                                    // If order says 'FULLY_REFUNDED', we label it Full. Otherwise Partial.
                                    const isFull = order.orderPaymentStatus === 'FULLY_REFUNDED';
                                    const typeLabel = isFull ? 'Full' : 'Partial';
                                    const color = isFull ? 'error' : 'warning'; // Red for Full, Orange for Partial

                                    return (
                                      <Chip
                                        key={idx}
                                        // Result: "Full: $28.17" or "Partial: $15.00" (in USD)
                                        label={`${typeLabel}: $${amountUSD}`}
                                        size="small"
                                        color={color}
                                        variant="outlined"
                                        sx={{
                                          fontWeight: 'bold',
                                          fontSize: '0.75rem',
                                          height: 24
                                        }}
                                      />
                                    );
                                  })}
                                </Stack>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('reviewedRefund') && (
                            <TableCell align="right">
                              {(() => {
                                const status = String(order.orderPaymentStatus || '').toUpperCase();
                                // Show suggested Enter-refund amount for PAID (plan ahead)
                                // and PARTIALLY_REFUNDED (what should have been entered for $1.10).
                                if (status !== 'PAID' && status !== 'PARTIALLY_REFUNDED') {
                                  return <Typography variant="body2" color="text.secondary">-</Typography>;
                                }
                                const planOrder = status === 'PARTIALLY_REFUNDED'
                                  ? {
                                    ...order,
                                    // Prefer frozen pre-refund fee/ad when present
                                    adFeeGeneral: order.preRefundAdFeeGeneral != null
                                      ? order.preRefundAdFeeGeneral
                                      : order.adFeeGeneral,
                                    orderPaymentStatus: 'PAID'
                                  }
                                  : order;
                                const plan = computePartialRefundEnterAmount(planOrder, PARTIAL_REFUND_TARGET_EARNINGS);
                                if (!plan) {
                                  return <Typography variant="body2" color="text.secondary">-</Typography>;
                                }
                                const copyText = plan.enterRefundAmount.toFixed(2);
                                return (
                                  <Tooltip
                                    title={
                                      `Enter refund $${plan.enterRefundAmount.toFixed(2)} ` +
                                      `(leave $${plan.leaveAmount.toFixed(2)} of $${plan.purchasePrice.toFixed(2)}) ` +
                                      `→ ~$${plan.estimatedEarnings.toFixed(2)} earnings ` +
                                      `(target $${PARTIAL_REFUND_TARGET_EARNINGS.toFixed(2)}). ` +
                                      `eBay proportional fee credits ~$${plan.estimatedFeeCredits.toFixed(2)} ` +
                                      `(excl. $${EBAY_PER_ORDER_FIXED_FEE.toFixed(2)} fixed), ` +
                                      `you owe ~$${plan.estimatedNetOwed.toFixed(2)}. Click to copy.`
                                    }
                                    arrow
                                  >
                                    <Chip
                                      size="small"
                                      color="info"
                                      variant="outlined"
                                      label={`$${plan.enterRefundAmount.toFixed(2)}`}
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(copyText);
                                        } catch {
                                          /* ignore */
                                        }
                                      }}
                                      sx={{
                                        fontWeight: 'bold',
                                        fontSize: '0.75rem',
                                        height: 24,
                                        cursor: 'pointer'
                                      }}
                                    />
                                  </Tooltip>
                                );
                              })()}
                            </TableCell>
                          )}
                          {/* --- NEW: Refund Breakdown Columns --- */}
                          {visibleColumnsSet.has('refundItemAmount') && (
                            <TableCell align="right">
                              {order.refundItemAmount ? (
                                <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 'medium' }}>
                                  {formatOrderLocalAmount(order, order.refundItemAmount)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('refundTaxAmount') && (
                            <TableCell align="right">
                              {order.refundTaxAmount ? (
                                <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 'medium' }}>
                                  {formatOrderLocalAmount(order, order.refundTaxAmount)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('refundTotalToBuyer') && (
                            <TableCell align="right">
                              {order.refundTotalToBuyer ? (
                                <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'medium' }}>
                                  {formatOrderLocalAmount(order, order.refundTotalToBuyer)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('orderTotalAfterRefund') && (
                            <TableCell align="right">
                              {order.orderTotalAfterRefund != null ? (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: order.orderTotalAfterRefund >= 0 ? 'text.primary' : 'error.main',
                                    fontWeight: 'medium'
                                  }}
                                >
                                  {formatOrderLocalAmount(order, order.orderTotalAfterRefund)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('orderEarnings') && (
                            <TableCell align="right">
                              {(() => {
                                const earnings = getOrderEarnings(order);
                                const isPartial = String(order.orderPaymentStatus || '').toUpperCase() === 'PARTIALLY_REFUNDED';
                                const belowFloor = isPartial && earnings < PARTIAL_REFUND_TARGET_EARNINGS;
                                return (
                                  <Tooltip
                                    title={belowFloor
                                      ? `Below $${PARTIAL_REFUND_TARGET_EARNINGS.toFixed(2)} defect floor`
                                      : ''}
                                    arrow
                                    disableHoverListener={!belowFloor}
                                  >
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: 'bold',
                                        color: belowFloor
                                          ? 'warning.main'
                                          : (earnings ?? 0) < 0
                                            ? 'error.main'
                                            : 'success.main'
                                      }}
                                    >
                                      {formatOrderUsdAmount(order, earnings)}
                                    </Typography>
                                  </Tooltip>
                                );
                              })()}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('trackingNumber') && (
                            <TableCell sx={{ maxWidth: 150, pr: 1 }}>
                              {order.trackingNumber ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                                  <Tooltip title={order.trackingNumber} arrow>
                                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {order.trackingNumber}
                                    </Typography>
                                  </Tooltip>
                                  <IconButton size="small" onClick={() => handleCopy(order.trackingNumber)} aria-label="copy tracking number">
                                    <ContentCopyIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}

                          {/* 1. Amazon Account */}
                          {visibleColumnsSet.has('amazonAccount') && (
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveSelect
                                  value={order.amazonAccount}
                                  options={amazonAccounts}
                                  onSave={(val) => updateManualField(order._id, 'amazonAccount', val)}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.amazonAccount || '-')}
                                  aria-label="copy amazon account"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}

                          {/* 2. Arriving Date */}
                          {visibleColumnsSet.has('arriving') && (
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveDatePicker
                                  value={order.arrivingDate}
                                  onSave={(val) => updateManualField(order._id, 'arrivingDate', val)}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.arrivingDate || '-')}
                                  aria-label="copy arriving date"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}

                          {/* 3. Before Tax */}
                          {visibleColumnsSet.has('beforeTax') && (
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveTextField
                                  type="text"
                                  value={order.beforeTax}
                                  onSave={(val) => updateManualField(order._id, 'beforeTax', parseCurrencyInput(val))}
                                  textFieldProps={{
                                    InputProps: {
                                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                                    }
                                  }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.beforeTax || '-')}
                                  aria-label="copy before tax"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}

                          {/* 4. Estimated Tax */}
                          {visibleColumnsSet.has('estimatedTax') && (
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveTextField
                                  type="text"
                                  value={order.estimatedTax}
                                  onSave={(val) => updateManualField(order._id, 'estimatedTax', parseCurrencyInput(val))}
                                  textFieldProps={{
                                    InputProps: {
                                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                                    }
                                  }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.estimatedTax || '-')}
                                  aria-label="copy estimated tax"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}

                          {/* 5. Amazon Order ID */}
                          {visibleColumnsSet.has('azOrderId') && (
                            <TableCell sx={{ minWidth: 200 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveTextField
                                  value={order.azOrderId}
                                  onSave={(val) => updateManualField(order._id, 'azOrderId', val)}
                                  sx={{ minWidth: 150 }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.azOrderId || '-')}
                                  aria-label="copy amazon order id"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}

                          {/* 6. Amazon Refund */}
                          {visibleColumnsSet.has('amazonRefund') && (
                            <TableCell sx={{ minWidth: 200 }}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <AutoSaveTextField
                                  value={order.amazonRefund}
                                  type="text"
                                  onSave={(val) => updateManualField(order._id, 'amazonRefund', val === '' ? null : parseFloat(val))}
                                  sx={{ minWidth: 100 }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.amazonRefund || '-')}
                                  aria-label="copy amazon refund"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                                {order.beforeTaxUSD > 0 && (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="success"
                                    onClick={() => handleAmazonRefundReceived(order)}
                                    sx={{ minWidth: 90, fontSize: '0.7rem', py: 0.5 }}
                                  >
                                    Received
                                  </Button>
                                )}
                              </Stack>
                            </TableCell>
                          )}

                          {/* 7. Card Name */}
                          {visibleColumnsSet.has('cardName') && (
                            <TableCell sx={{ minWidth: 200 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveSelect
                                  value={order.cardName || ''}
                                  options={creditCards}
                                  onSave={(val) => updateManualField(order._id, 'cardName', val)}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.cardName || '-')}
                                  aria-label="copy card name"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}

                          {visibleColumnsSet.has('resolution') && (
                            <TableCell sx={{ minWidth: 220 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoSaveSelect
                                  value={order.resolution || ''}
                                  options={resolutionOptions}
                                  onSave={(val) => updateManualField(order._id, 'resolution', val)}
                                  onManage={() => setManageResolutionOptionsOpen(true)}
                                  manageLabel="Manage Options"
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(order.resolution || '-')}
                                  aria-label="copy resolution"
                                  sx={{ p: 0.5 }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          )}


                          {visibleColumnsSet.has('notes') && (
                            <TableCell>
                              <NotesCell
                                order={order}
                                onSave={handleSaveNote}
                                onNotify={showNotification}
                              />
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('messagingStatus') && (
                            <TableCell align="center">
                              <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                                <Tooltip title="Open conversation">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={(
                                      <Badge
                                        color="error"
                                        variant="dot"
                                        overlap="circular"
                                        invisible={!orderHasUnreadBuyerMessage(order)}
                                        sx={{ '& .MuiBadge-badge': { boxShadow: '0 0 0 2px #fff' } }}
                                      >
                                        <ChatIcon fontSize="small" />
                                      </Badge>
                                    )}
                                    onClick={() => handleOpenMessageDialog(order)}
                                    sx={{ ...yellowOutlinedButtonSx, minHeight: 32, px: 1.25, fontSize: '0.75rem' }}
                                  >
                                    Open
                                  </Button>
                                </Tooltip>
                                {order.remarkMessageSent ? (
                                  <Tooltip title="Message was sent with last remark update">
                                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                  </Tooltip>
                                ) : null}
                              </Stack>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('remark') && (
                            <TableCell>
                              <AutoSaveSelect
                                value={order.remark || ''}
                                options={remarkOptionsFromTemplates(remarkTemplates)}
                                onSave={(val) => handleRemarkUpdate(order._id, val)}
                                onManage={() => setManageRemarkTemplatesOpen(true)}
                                manageLabel="Manage Templates"
                              />
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('issueFlags') && (() => {
                            const issues = issuesIndex[order.orderId] || issuesIndex[order.legacyOrderId] || [];
                            if (issues.length === 0) return <TableCell><Typography variant="body2" color="text.disabled">-</Typography></TableCell>;
                            // Deduplicate by type
                            const seen = new Set();
                            const unique = issues.filter(i => { if (seen.has(i.type)) return false; seen.add(i.type); return true; });
                            return (
                              <TableCell>
                                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                  {unique.map((issue, idx) => {
                                    const chipColor = issue.caseStatus === 'Case Opened' ? 'error' : 'primary';
                                    return (
                                      <Tooltip key={idx} title={issue.caseStatus || 'Case Not Opened'}>
                                        <Chip
                                          label={issue.type}
                                          size="small"
                                          color={chipColor}
                                          variant="outlined"
                                          sx={{ fontWeight: 'bold', fontSize: '0.7rem', height: 20 }}
                                        />
                                      </Tooltip>
                                    );
                                  })}
                                </Stack>
                              </TableCell>
                            );
                          })()}
                          {visibleColumnsSet.has('convoCategory') && (
                            <TableCell>
                              {order.convoCategory ? (
                                <Chip
                                  label={order.convoCategory}
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                                />
                              ) : (
                                <Typography variant="body2" color="text.disabled">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('convoCaseStatus') && (
                            <TableCell>
                              {order.convoCaseStatus ? (
                                <Chip
                                  label={order.convoCaseStatus}
                                  size="small"
                                  color={order.convoCaseStatus === 'Case Opened' ? 'error' : 'success'}
                                  variant="outlined"
                                  sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                                />
                              ) : (
                                <Typography variant="body2" color="text.disabled">-</Typography>
                              )}
                            </TableCell>
                          )}


                        </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )
        }

        {/* Pagination Controls - FIXED AT BOTTOM */}
        {
          !loading && orders.length > 0 && totalPages > 1 && (
            <Box sx={{
              py: { xs: 0.75, sm: 1 },
              px: { xs: 1, sm: 2 },
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'center',
              alignItems: 'center',
              gap: { xs: 0.5, sm: 2 },
              flexShrink: 0,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
              >
                {isSmallMobile
                  ? `${(currentPage - 1) * ordersPerPage + 1}-${Math.min(currentPage * ordersPerPage, totalOrders)} of ${totalOrders}`
                  : `Showing ${(currentPage - 1) * ordersPerPage + 1} - ${Math.min(currentPage * ordersPerPage, totalOrders)} of ${totalOrders} orders`
                }
              </Typography>
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(e, page) => setCurrentPage(page)}
                color="primary"
                showFirstButton={!isMobile}
                showLastButton={!isMobile}
                size={isSmallMobile ? 'small' : 'medium'}
                siblingCount={isSmallMobile ? 0 : 1}
                boundaryCount={isSmallMobile ? 1 : 1}
              />
            </Box>
          )
        }


        {selectedOrderForMessage && (
          <ChatModal
            open={Boolean(selectedOrderForMessage)}
            onClose={handleCloseMessageDialog}
            orderId={selectedOrderForMessage.orderId || selectedOrderForMessage.legacyOrderId}
            buyerUsername={selectedOrderForMessage.buyer?.username || ''}
            buyerName={selectedOrderForMessage.shippingFullName || selectedOrderForMessage.buyer?.buyerRegistrationAddress?.fullName || ''}
            itemId={selectedOrderForMessage.itemNumber || selectedOrderForMessage.lineItems?.[0]?.legacyItemId || selectedOrderForMessage.lineItems?.[0]?.itemId || ''}
            itemTitle={selectedOrderForMessage.productName || selectedOrderForMessage.lineItems?.[0]?.title || ''}
            sellerId={
              selectedOrderForMessage.seller?._id
                ? String(selectedOrderForMessage.seller._id)
                : (selectedOrderForMessage.sellerId
                  ? String(selectedOrderForMessage.sellerId)
                  : (typeof selectedOrderForMessage.seller === 'string'
                    ? selectedOrderForMessage.seller
                    : null))
            }
            sellerName={selectedOrderForMessage.seller?.user?.username || ''}
            title="Chat"
            showManageCase={false}
            onMessageSent={clearBuyerMessageIndicator}
          />
        )}

        {/* Earnings Breakdown Dialog */}
        <EarningsBreakdownModal
          open={earningsDialogOpen}
          order={selectedOrderForEarnings}
          onClose={() => setEarningsDialogOpen(false)}
        />

        {/* Image Viewer Dialog */}
        <ImageDialog
          open={imageDialogOpen}
          onClose={() => setImageDialogOpen(false)}
          images={selectedImages}
        />

        {/* Remark Message Confirmation Dialog */}
        <Dialog
          open={remarkConfirmOpen}
          onClose={() => {
            if (!sendingRemarkMessage) {
              setRemarkConfirmOpen(false);
              setPendingRemarkUpdate(null);
              setEditableRemarkMessage('');
              setRemarkAttachments([]);
            }
          }}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <ChatIcon color="primary" />
              <Typography variant="h6">Send Message to Buyer - Edit & Preview</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="info" icon={<InfoIcon />}>
                You're updating the remark to <strong>"{pendingRemarkUpdate?.remarkValue}"</strong>
              </Alert>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Message Preview (Edit as needed):
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={6}
                maxRows={12}
                value={editableRemarkMessage}
                onChange={(e) => setEditableRemarkMessage(e.target.value)}
                placeholder="Enter your message to the buyer..."
              />
              {remarkAttachments.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 500, mb: 1, display: 'block' }}>
                    Attachments:
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {remarkAttachments.map((attachment, index) => (
                      <Chip
                        key={`${attachment.url}-${index}`}
                        label={attachment.name}
                        onDelete={() => setRemarkAttachments(remarkAttachments.filter((_, i) => i !== index))}
                        variant="outlined"
                        size="small"
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <input
              ref={fileInputRefRemark}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleRemarkFileSelect}
            />
            <Button onClick={() => fileInputRefRemark.current?.click()}>
              <AttachFileIcon sx={{ mr: 1 }} />
              Add Attachment
            </Button>
            <Button
              onClick={handleSkipRemarkMessage}
              disabled={sendingRemarkMessage}
              color="inherit"
            >
              Just Update Remark
            </Button>
            <Button
              onClick={handleConfirmRemarkMessage}
              variant="contained"
              disabled={!editableRemarkMessage.trim() || sendingRemarkMessage}
              startIcon={sendingRemarkMessage ? <CircularProgress size={20} /> : <SendIcon />}
            >
              {sendingRemarkMessage ? 'Sending...' : 'Send Message & Update Remark'}
            </Button>
          </DialogActions>
        </Dialog>

        <RemarkTemplateManagerModal
          open={manageRemarkTemplatesOpen}
          onClose={() => setManageRemarkTemplatesOpen(false)}
          templates={remarkTemplates}
          onSaveTemplates={handleSaveRemarkTemplates}
        />

        <ResolutionOptionsModal
          open={manageResolutionOptionsOpen}
          onClose={() => {
            setManageResolutionOptionsOpen(false);
            loadResolutionOptions();
          }}
          options={resolutionOptions}
          onReload={loadResolutionOptions}
        />

        <ItemCategoryAssignDialog
          open={crpDialogOpen}
          onClose={() => { setCrpDialogOpen(false); setCrpDialogOrder(null); }}
          itemNumber={crpDialogOrder?.lineItems?.[0]?.legacyItemId || crpDialogOrder?.itemNumber}
          productTitle={crpDialogOrder?.lineItems?.[0]?.title || crpDialogOrder?.productName}
          currentCategoryId={crpDialogOrder?.orderCategoryId?._id || ''}
          currentRangeId={crpDialogOrder?.orderRangeId?._id || ''}
          currentProductId={crpDialogOrder?.orderProductId?._id || ''}
          onAssign={(itemNumber, catId, rangeId, prodId) => {
            updateItemCategory(itemNumber, catId, rangeId, prodId);
            setCrpDialogOpen(false);
            setCrpDialogOrder(null);
          }}
          onClear={(itemNumber) => {
            clearItemCategory(itemNumber);
            setCrpDialogOpen(false);
            setCrpDialogOrder(null);
          }}
        />


        {/* CSV Export Column Selection Dialog */}
        <FulfillmentCsvImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          onImport={handleFulfillmentImport}
        />

        <Dialog
          open={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Select Columns to Export</Typography>
              <Box>
                <Button size="small" onClick={handleToggleAllExportColumns}>
                  {selectedExportColumns.length === ALL_COLUMNS.length ? "Deselect All" : "Select All"}
                </Button>
              </Box>
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2, height: 400 }}>
            <Stack spacing={1}>
              {ALL_COLUMNS.map((col) => (
                <Box key={col.id} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={selectedExportColumns.includes(col.id)}
                    onChange={() => handleToggleExportColumn(col.id)}
                    size="small"
                  />
                  <Typography variant="body2">{col.label}</Typography>
                </Box>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setExportDialogOpen(false)} color="inherit">Cancel</Button>
            <Button
              onClick={handleExecuteExport}
              variant="contained"
              color="primary"
              startIcon={exportingCSV ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={exportingCSV || selectedExportColumns.length === 0}
            >
              {exportingCSV ? 'Exporting...' : 'Export CSV'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={utcRefreshConfirmOpen}
          onClose={() => setUtcRefreshConfirmOpen(false)}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              position: { sm: 'fixed' },
              right: { sm: 24 },
              top: { sm: 88 },
              m: { sm: 0 },
              width: { sm: 420 },
              maxWidth: { sm: 'calc(100vw - 48px)' }
            }
          }}
        >
          <DialogTitle>Confirm PT Refresh</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5}>
              <Alert severity="warning" icon={<InfoIcon />}>
                This will refresh existing DB orders from eBay for the selected Pacific Time {utcRefreshMode === 'single' ? 'date' : 'date range'}.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {utcRefreshMode === 'single'
                  ? `PT Date: ${utcRefreshStartDate}`
                  : `PT Range: ${utcRefreshStartDate} to ${utcRefreshEndDate || utcRefreshStartDate}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Seller scope: {selectedSeller
                  ? (sellers.find(s => s._id === selectedSeller)?.user?.username || sellers.find(s => s._id === selectedSeller)?.user?.email || 'Selected seller')
                  : 'All connected sellers'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                New eBay orders will be ignored. Existing matching orders may have eBay fields, totals, earnings, and profit-related values recalculated.
              </Typography>

              {ptRefreshPreviewLoading && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Checking seller tokens and order count...
                  </Typography>
                </Stack>
              )}

              {!ptRefreshPreviewLoading && ptRefreshPreview?.error && (
                <Alert severity="error">{ptRefreshPreview.error}</Alert>
              )}

              {!ptRefreshPreviewLoading && ptRefreshPreview && !ptRefreshPreview.error && (
                <>
                  <Typography variant="body2" fontWeight={600}>
                    This will fetch ~{ptRefreshPreview.totalPreviewCount} order{ptRefreshPreview.totalPreviewCount === 1 ? '' : 's'} from{' '}
                    {ptRefreshPreview.sellers.filter(s => s.tokenStatus === 'active' || s.tokenStatus === 'refreshed').length} of{' '}
                    {ptRefreshPreview.sellers.length} seller{ptRefreshPreview.sellers.length === 1 ? '' : 's'}.
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {ptRefreshPreview.sellers.map(s => (
                      <Tooltip key={s.sellerId} title={s.error || ''} disableHoverListener={!s.error}>
                        <Chip
                          size="small"
                          icon={s.tokenStatus === 'active' || s.tokenStatus === 'refreshed' ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : undefined}
                          label={`${s.sellerName}${s.tokenStatus === 'refreshed' ? ' (refreshed)' : ''}${s.orderCountPreview != null ? `: ${s.orderCountPreview}` : ''}`}
                          color={
                            s.tokenStatus === 'active' || s.tokenStatus === 'refreshed'
                              ? 'success'
                              : 'error'
                          }
                          variant="outlined"
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                  {ptRefreshPreview.sellersNeedingAttention.length > 0 && (
                    <Alert severity="warning">
                      <Typography variant="body2" fontWeight={600}>
                        {ptRefreshPreview.sellersNeedingAttention.length} seller{ptRefreshPreview.sellersNeedingAttention.length === 1 ? '' : 's'} will be skipped and won't have orders refreshed:
                      </Typography>
                      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                        {ptRefreshPreview.sellersNeedingAttention.map(s => (
                          <Typography key={s.sellerId} variant="caption" component="div">
                            {s.sellerName} ({s.tokenStatus === 'needs_reconnect' ? 'needs eBay reconnect' : 'fetch failed'}){s.error ? `: ${s.error}` : ''}
                          </Typography>
                        ))}
                      </Stack>
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setUtcRefreshConfirmOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUtcRefresh}
              variant="contained"
              color="secondary"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
            >
              {loading ? 'Refreshing...' : 'Confirm Refresh'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={historyDialogOpen}
          onClose={() => setHistoryDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight="bold">PT Refresh History</Typography>
            <IconButton onClick={() => setHistoryDialogOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {historyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : historyLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                No refresh history found.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'action.hover' }}>
                      <TableCell>User</TableCell>
                      <TableCell>Mode</TableCell>
                      <TableCell>PT Dates</TableCell>
                      <TableCell>Confirmed (IST)</TableCell>
                      <TableCell>Status / Outcome</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historyLogs.map((log) => (
                      <TableRow key={log._id}>
                        <TableCell>
                          <Stack>
                            <Typography variant="body2" fontWeight="medium">
                              {log.user?.username || 'Unknown'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {log.user?.email || ''}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={log.dateMode === 'single' ? 'Single' : 'Range'}
                            size="small"
                            color={log.dateMode === 'single' ? 'primary' : 'secondary'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {log.dateMode === 'single'
                              ? formatPTWordDate(log.startDate)
                              : `${formatPTWordDate(log.startDate)} to ${formatPTWordDate(log.endDate)}`}
                          </Typography>
                          {log.sellerId && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Seller: {log.sellerId?.user?.username || log.sellerId?.user?.email || 'Filtered'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{formatISTWordDate(log.clickedConfirmAt)}</Typography>
                        </TableCell>
                        <TableCell>
                          {log.status === 'processing' ? (
                            <Stack spacing={0.5}>
                              <Chip label="Processing" color="info" size="small" variant="filled" sx={{ width: 'fit-content' }} />
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.75rem' }}>
                                Sync in progress...
                              </Typography>
                            </Stack>
                          ) : log.status === 'completed' || log.success ? (
                            <Stack spacing={0.5}>
                              <Chip label="Success" color="success" size="small" variant="filled" sx={{ width: 'fit-content' }} />
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.75rem' }}>
                                Fetch: {log.totalFetched} | Match: {log.totalExistingMatched} | Upd: {log.totalUpdated}
                              </Typography>
                            </Stack>
                          ) : (
                            <Stack spacing={0.5}>
                              <Chip label="Failed" color="error" size="small" variant="filled" sx={{ width: 'fit-content' }} />
                              {log.errorMessage && (
                                <Tooltip title={log.errorMessage}>
                                  <Typography variant="caption" color="error" sx={{ cursor: 'pointer', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                                    {log.errorMessage}
                                  </Typography>
                                </Tooltip>
                              )}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setHistoryDialogOpen(false)} color="inherit">
              Close
            </Button>
          </DialogActions>
        </Dialog>


        {/* Snackbar for polling results */}
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={10000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <MuiAlert
            onClose={() => setSnackbarOpen(false)}
            severity={snackbarSeverity}
            sx={{
              width: '100%',
              fontSize: '1.1rem',
              py: 2,
              px: 4,
              minWidth: 400,
              maxWidth: 800,
            }}
            elevation={6}
            variant="filled"
            action={
              snackbarOrderIds.length > 0 ? (
                <IconButton
                  size="small"
                  aria-label="copy order IDs"
                  color="inherit"
                  onClick={() => {
                    const orderIdsList = snackbarOrderIds.join(', ');
                    if (navigator?.clipboard?.writeText) {
                      navigator.clipboard.writeText(orderIdsList);
                      // Show temporary feedback
                      const originalMsg = snackbarMsg;
                      setSnackbarMsg('Order IDs copied to clipboard!');
                      setTimeout(() => setSnackbarMsg(originalMsg), 1500);
                    }
                  }}
                  sx={{ ml: 2 }}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              ) : null
            }
          >
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 'bold', mb: snackbarOrderIds.length > 0 ? 1 : 0 }}>
                {snackbarMsg}
              </Typography>
              {snackbarOrderIds.length > 0 && (
                <Typography variant="body2" sx={{ mt: 1, opacity: 0.9, fontSize: '0.9rem' }}>
                  Order IDs: {snackbarOrderIds.join(', ')}
                </Typography>
              )}
              {updatedOrderDetails.length > 0 && (
                <Box sx={{ mt: 1.5, maxHeight: 200, overflowY: 'auto', fontSize: '0.85rem' }}>
                  {updatedOrderDetails.map((detail, idx) => {
                    const hasShippingChange = detail.changedFields.includes('shippingAddress');
                    return (
                      <Box
                        key={idx}
                        sx={{
                          mb: 0.5,
                          opacity: 0.95,
                          backgroundColor: hasShippingChange ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                          padding: hasShippingChange ? '4px 8px' : '0',
                          borderRadius: hasShippingChange ? '4px' : '0',
                          border: hasShippingChange ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
                        }}
                      >
                        <Typography variant="caption" component="span" sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                          {hasShippingChange && '🏠 '}{detail.orderId}:
                        </Typography>
                        {' '}
                        <Typography variant="caption" component="span" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                          {detail.changedFields.map(formatFieldName).join(', ')}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </MuiAlert>
        </Snackbar>
      </Box >
    </Fade>
  );
}


// --- ADD AT BOTTOM OF FILE ---

function parseCurrencyInput(value) {
  if (value === null || value === undefined) return null;

  const trimmedValue = String(value).trim();
  if (!trimmedValue) return null;

  const normalizedValue = trimmedValue.replace(/[$,\s]/g, '');
  if (!normalizedValue) return null;

  const parsedValue = Number(normalizedValue);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

const AutoSaveTextField = memo(function AutoSaveTextField({ value, type = 'text', onSave, sx = {}, textFieldProps = {} }) {
  // Format initial value for Date inputs (YYYY-MM-DD)
  const formatVal = (val) => {
    if (type === 'date' && val) return val.split('T')[0];
    return val ?? '';
  };

  const [localValue, setLocalValue] = React.useState(formatVal(value));

  // Sync with DB updates
  React.useEffect(() => {
    setLocalValue(formatVal(value));
  }, [value, type]);

  const handleBlur = () => {
    // Only api call if value actually changed
    if (localValue !== formatVal(value)) {
      onSave(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur(); // Triggers save
    }
  };

  return (
    <TextField
      size="small"
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="-"
      {...textFieldProps}
      sx={{
        backgroundColor: '#fff',
        borderRadius: 1,
        minWidth: type === 'date' ? 130 : 80,
        '& .MuiOutlinedInput-root': { paddingRight: 0 },
        '& input': { padding: '6px 8px', fontSize: '0.85rem' },
        ...sx // Merge custom sx prop
      }}
    />
  );
});

const AutoSaveDatePicker = memo(function AutoSaveDatePicker({ value, onSave, sx = {} }) {
  // Helper to check if value is a valid ISO format date
  const parseValue = (val) => {
    if (!val) return null;

    // Only accept ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
    // This prevents "Jan 8" from being parsed as 2001-01-08
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;

    if (!isoDateRegex.test(val)) {
      // Not ISO format → treat as legacy text
      return null;
    }

    try {
      const date = new Date(val);
      return isValid(date) ? date : null;
    } catch {
      return null;
    }
  };

  const [localValue, setLocalValue] = useState(parseValue(value));
  const [isLegacyText, setIsLegacyText] = useState(false);

  useEffect(() => {
    const parsed = parseValue(value);
    setLocalValue(parsed);
    // Check if it's legacy text (not a valid date)
    setIsLegacyText(value && !parsed);
  }, [value]);

  const handleChange = (newDate) => {
    setLocalValue(newDate);
    if (newDate && isValid(newDate)) {
      // Save as ISO date string (YYYY-MM-DD)
      onSave(format(newDate, 'yyyy-MM-dd'));
    } else {
      onSave(null);
    }
  };

  // If legacy text detected, show text field with option to convert
  if (isLegacyText) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          size="small"
          value={value}
          disabled
          sx={{
            backgroundColor: '#f5f5f5',
            borderRadius: 1,
            minWidth: 100,
            '& input': { padding: '6px 8px', fontSize: '0.85rem' },
            ...sx
          }}
        />
        <Tooltip title="Convert to date picker">
          <IconButton
            size="small"
            onClick={() => setIsLegacyText(false)}
            sx={{ p: 0.5 }}
          >
            <RefreshIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        value={localValue}
        onChange={handleChange}
        format="dd/MM/yyyy"
        slotProps={{
          textField: {
            size: 'small',
            placeholder: '-',
            sx: {
              backgroundColor: '#fff',
              borderRadius: 1,
              minWidth: 150,
              '& .MuiOutlinedInput-root': { paddingRight: 0 },
              '& input': { padding: '6px 8px', fontSize: '0.85rem' },
              ...sx
            }
          }
        }}
      />
    </LocalizationProvider>
  );
});

const AutoSaveSelect = memo(function AutoSaveSelect({ value, options, onSave, onManage, manageLabel = 'Manage Options' }) {
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    if (newVal === '__manage_templates__') {
      if (onManage) onManage();
      return;
    }
    setLocalValue(newVal);
    onSave(newVal); // Auto-save immediately on selection
  };

  return (
    <Select
      value={localValue}
      onChange={handleChange}
      displayEmpty
      size="small"
      sx={{
        backgroundColor: '#fff',
        borderRadius: 1,
        minWidth: 130,
        height: 32,
        fontSize: '0.85rem',
        '& .MuiSelect-select': { py: 0.5, px: 1 }
      }}
    >
      <MenuItem value="">
        <em style={{ color: '#aaa' }}>- Select -</em>
      </MenuItem>
      {options.map((opt) => (
        <MenuItem key={opt._id} value={opt.name}>
          {opt.name}
        </MenuItem>
      ))}
      {onManage ? (
        <MenuItem value="__manage_templates__" sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5 }}>
          {manageLabel}
        </MenuItem>
      ) : null}
    </Select>
  );
});

export default memo(FulfillmentDashboard);
