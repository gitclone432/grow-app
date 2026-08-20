import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ChatIcon from '@mui/icons-material/Chat';
import api from '../../lib/api';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';
import { sortSellersByName } from '../../lib/sellersSort.js';
import ChatModal from '../../components/ChatModal';

const headerSx = {
  ...tableHeaderCellSx,
  py: 1,
  fontSize: '0.7rem',
};

const denseCellSx = {
  ...tableBodyCellSx,
  py: 0.55,
  px: 1,
  fontSize: '0.75rem',
  verticalAlign: 'middle',
};

const actionHeaderSx = {
  ...headerSx,
  minWidth: 118,
  width: 118,
};

const actionCellSx = {
  ...denseCellSx,
  minWidth: 118,
  width: 118,
  whiteSpace: 'nowrap',
  pl: 1,
  pr: 0.75,
};

/**
 * NotesCell component for editable notes in INR page
 */
const NotesCell = React.memo(function NotesCell({ row, onSave, onNotify }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [tempValue, setTempValue] = React.useState(row.notes || '');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setTempValue(row.notes || '');
    }
  }, [row.notes, isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(row.caseId || row._id, tempValue);
      setIsEditing(false);
      onNotify('success', 'Note saved successfully');
    } catch (e) {
      onNotify('error', 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTempValue(row.notes || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 150 }}
      >
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          placeholder="Add internal notes..."
          autoFocus
        />
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Button size="small" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      onClick={() => setIsEditing(true)}
      sx={{
        cursor: 'pointer',
        py: 0.5,
        px: 1,
        borderRadius: 0.5,
        bgcolor: tempValue ? 'grey.100' : 'transparent',
        '&:hover': { bgcolor: 'grey.200' },
        minHeight: 24,
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.75rem',
      }}
    >
      {tempValue ? (
        <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
          {tempValue.substring(0, 100)}{tempValue.length > 100 ? '...' : ''}
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem', fontStyle: 'italic' }}>
          Click to add notes
        </Typography>
      )}
    </Box>
  );
});

const SORT_COLUMNS = [
  { id: 'seller', label: 'Seller' },
  { id: 'created', label: 'Created (PT)' },
  { id: 'responseDue', label: 'Due (PT)' },
  { id: 'source', label: 'Issue' },
  { id: 'id', label: 'ID / Order' },
  { id: 'marketplace', label: 'Mkt' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'item', label: 'Item' },
  { id: 'status', label: 'Status' },
  { id: 'outcome', label: 'Outcome' },
  { id: 'shippingAddress', label: 'Ship to' },
  { id: 'trackingNumber', label: 'Shipment' },
  { id: 'notes', label: 'Notes' },
];

const NUMERIC_SORT_COLUMNS = new Set(['claim', 'created', 'responseDue', 'estimateFrom']);

const SHIP_CARRIERS = ['USPS', 'UPS', 'FEDEX', 'DHL', 'AUSTRALIA_POST', 'ROYAL_MAIL', 'CANADA_POST', 'OTHER'];

const INQUIRY_ESCALATE_REASON = 'SHIPPED_ITEM';

function normalizeCarrier(carrier) {
  const s = String(carrier || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (SHIP_CARRIERS.includes(s)) return s;
  if (s.includes('USPS') || s.includes('POSTAL')) return 'USPS';
  if (s.includes('UPS')) return 'UPS';
  if (s.includes('FEDEX')) return 'FEDEX';
  if (s.includes('DHL')) return 'DHL';
  if (s.includes('AUSTRALIA')) return 'AUSTRALIA_POST';
  if (s.includes('ROYAL')) return 'ROYAL_MAIL';
  if (s.includes('CANADA')) return 'CANADA_POST';
  return 'USPS';
}

function guessCarrierFromTracking(trackingNumber) {
  const s = String(trackingNumber || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!s) return '';
  if (s.startsWith('1Z')) return 'UPS';
  if (s.startsWith('JD') || s.startsWith('GM') || s.startsWith('LX')) return 'DHL';
  if (/^(94|93|92|91|95)\d{18,22}$/.test(s) || /^9\d{15,21}$/.test(s)) return 'USPS';
  if (/^\d{12}$/.test(s) || /^\d{14,15}$/.test(s) || s.startsWith('96')) return 'FEDEX';
  return '';
}

function displayCarrier(carrier, trackingNumber) {
  const raw = String(carrier || '').trim();
  if (raw) {
    const s = raw.toUpperCase().replace(/\s+/g, '_');
    if (SHIP_CARRIERS.includes(s)) return s;
    if (s.includes('USPS') || s.includes('POSTAL')) return 'USPS';
    if (s.includes('UPS')) return 'UPS';
    if (s.includes('FEDEX') || s.includes('FED_EX')) return 'FEDEX';
    if (s.includes('DHL')) return 'DHL';
    if (s.includes('AUSTRALIA')) return 'AUSTRALIA_POST';
    if (s.includes('ROYAL')) return 'ROYAL_MAIL';
    if (s.includes('CANADA')) return 'CANADA_POST';
    return raw;
  }
  return guessCarrierFromTracking(trackingNumber);
}

function cleanTrackingNumber(value) {
  return String(value || '').replace(/[\s-]+/g, '').trim();
}

const EMPTY_SHIP_DIALOG = {
  open: false,
  row: null,
  trackingNumber: '',
  carrier: 'USPS',
  shippedDate: '',
  comments: '',
  showComments: false,
};

function toDateInput(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function statusColor(status) {
  const s = String(status || '').toUpperCase();
  if (s.includes('CLOSED') || s.includes('CLOSED_WITH')) return 'default';
  if (s.includes('WAITING_SELLER') || s.includes('OPEN')) return 'error';
  if (s.includes('WAITING_BUYER')) return 'info';
  if (s.includes('WAITING') || s.includes('PENDING') || s.includes('ON_HOLD')) return 'warning';
  return 'primary';
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'America/Los_Angeles',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateParts(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(d);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${get('day')}/${get('month')}/${get('year')}`,
    time: `${get('hour')}:${get('minute')} ${get('dayPeriod')}`,
    zone: get('timeZoneName') || 'PT',
  };
}

function DateStack({ value, color, fontWeight }) {
  const parts = formatDateParts(value);
  if (!parts) return '—';
  return (
    <Stack spacing={0} sx={{ color, fontWeight: fontWeight || 400 }}>
      <Typography variant="body2" sx={{ fontSize: '0.72rem', fontWeight: 'inherit', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
        {parts.date}
      </Typography>
      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'inherit', opacity: 0.78, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
        {parts.time} {parts.zone}
      </Typography>
    </Stack>
  );
}

function reasonShort(reason) {
  const s = String(reason || '').toUpperCase();
  if (!s) return '—';
  if (s === 'ITEM_NOT_RECEIVED' || s === 'INR') return 'INR';
  if (s.includes('NOT_AS_DESCRIBED') || s === 'SNAD') return 'SNAD';
  if (s === 'UNAUTHORIZED_PAYMENT' || s === 'UNAUTHORIZED') return 'UAP';
  if (s === 'TRANSACTION_ISSUE') return 'TXN';
  if (s === 'AUTHORIZATION_FAILED') return 'AUTH FAIL';
  if (s === 'CREDIT_NOT_PROCESSED') return 'NO CREDIT';
  if (s === 'CANCELLATION' || s === 'CANCELLED' || s === 'CANCELED') return 'CANCEL';
  return s.replace(/_/g, ' ');
}

const REASON_GROUPS = [
  {
    id: 'INR',
    label: 'Item not received',
    hint: 'Buyer says the package never arrived. Inquiry INR and payment-dispute ITEM_NOT_RECEIVED are the same issue.',
    keys: ['INR', 'ITEM_NOT_RECEIVED'],
  },
  {
    id: 'SNAD',
    label: 'Not as described',
    hint: 'Buyer says the item is wrong, damaged, or not as listed. SNAD, SIGNIFICANTLY_NOT_AS_DESCRIBED, and ITEM_NOT_AS_DESCRIBED are the same issue.',
    keys: ['SNAD', 'SIGNIFICANTLY_NOT_AS_DESCRIBED', 'ITEM_NOT_AS_DESCRIBED', 'NOT_AS_DESCRIBED'],
  },
  {
    id: 'UAP',
    label: 'Unauthorized payment',
    hint: 'Buyer or bank says they did not authorize the charge.',
    keys: ['UNAUTHORIZED_PAYMENT', 'UNAUTHORIZED', 'UAP'],
  },
  {
    id: 'FRAUD',
    label: 'Fraud',
    hint: 'Payment dispute opened as suspected fraud.',
    keys: ['FRAUD'],
  },
  {
    id: 'TXN',
    label: 'Transaction issue',
    hint: 'Bank or payment processor flagged a problem with the transaction.',
    keys: ['TRANSACTION_ISSUE'],
  },
  {
    id: 'AUTH',
    label: 'Authorization failed',
    hint: 'Card or payment authorization did not complete.',
    keys: ['AUTHORIZATION_FAILED'],
  },
  {
    id: 'CANCEL',
    label: 'Cancellation',
    hint: 'Dispute tied to a cancelled order.',
    keys: ['CANCELLATION', 'CANCELLED', 'CANCELED'],
  },
  {
    id: 'CREDIT',
    label: 'Credit not processed',
    hint: 'Buyer says a promised refund or credit never posted.',
    keys: ['CREDIT_NOT_PROCESSED'],
  },
  {
    id: 'RETURN',
    label: 'Return',
    hint: 'Dispute tied to a return that was not refunded or completed.',
    keys: ['RETURN', 'RETURNS'],
  },
  {
    id: 'OTHER',
    label: 'Other',
    hint: 'eBay classified this as a reason that does not fit the groups above.',
    keys: ['OTHER'],
  },
];

const REASON_KEY_TO_GROUP = REASON_GROUPS.reduce((map, group) => {
  group.keys.forEach((key) => map.set(key, group));
  return map;
}, new Map());

function reasonKey(reason) {
  return String(reason || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function reasonGroupFor(reason) {
  const key = reasonKey(reason);
  if (!key) return null;
  return REASON_KEY_TO_GROUP.get(key) || {
    id: key,
    label: reasonShort(reason),
    hint: key.replace(/_/g, ' '),
    keys: [key],
  };
}

function reasonMatchesFilter(reason, filterId) {
  if (!filterId) return true;
  const group = reasonGroupFor(reason);
  return group?.id === filterId;
}

function statusShort(status) {
  const s = String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!s) return '—';
  if (s === 'CS_CLOSED' || s === 'CLOSED') return 'CLOSED';
  return s.replace(/_/g, ' ');
}

function rowStatus(row) {
  if (!row) return '';
  if (row.source === 'dispute') {
    return row.rawData?.paymentDisputeStatus
      || row.paymentDisputeStatus
      || '';
  }
  if (row.source === 'case' || row.mergedFromInquiry) {
    return row.rawData?.caseStatusEnum
      || row.rawData?.caseDetails?.caseStatusEnum
      || row.status
      || '';
  }
  return row.rawData?.inquiryStatusEnum
    || row.rawData?.inquiryDetails?.inquiryStatusEnum
    || row.status
    || '';
}

function marketplaceShort(row) {
  const label = marketplaceLabel(row);
  if (label === 'Australia') return 'AU';
  if (label === 'USA') return 'US';
  if (label === 'UK') return 'UK';
  if (label === 'Canada') return 'CA';
  return label;
}

function isClosedStatus(status) {
  const s = String(status || '').toUpperCase();
  return s.includes('CLOSED') || s.includes('RESOLVED');
}

function isResponseOverdue(responseDate) {
  if (!responseDate) return false;
  const due = new Date(responseDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function isResponseUrgent(responseDate) {
  if (!responseDate || isResponseOverdue(responseDate)) return false;
  const due = new Date(responseDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() <= Date.now() + 2 * 24 * 60 * 60 * 1000;
}

function hasTrackingNumber(row) {
  return Boolean(getShipmentTracking(row).trackingNumber);
}

const TRACKING_PROVIDED_ACTION = 'seller provided tracking information for shipment';

function sellerProvidedTrackingAction(row) {
  const sources = [row?.rawData?.inquiry, row?.rawData, row];
  for (const source of sources) {
    if (hasTrackingProvidedAction(source)) return true;
  }
  return false;
}

function hasTrackingProvidedAction(source, depth = 0) {
  if (!source || depth > 6) return false;
  if (typeof source === 'string') {
    return source.toLowerCase().includes(TRACKING_PROVIDED_ACTION);
  }
  if (typeof source !== 'object') return false;
  const action = source.action ?? source.actionType ?? source.description;
  if (typeof action === 'string' && action.toLowerCase().includes(TRACKING_PROVIDED_ACTION)) {
    return true;
  }
  const lists = [
    source.inquiryHistoryDetails,
    source.historyDetails,
    source.history,
    source.actions,
    source.activity,
  ];
  for (const list of lists) {
    if (Array.isArray(list) && list.some((item) => hasTrackingProvidedAction(item, depth + 1))) {
      return true;
    }
  }
  try {
    const blob = JSON.stringify(source.inquiryHistoryDetails || source.history || source);
    return String(blob).toLowerCase().includes(TRACKING_PROVIDED_ACTION);
  } catch {
    return false;
  }
}

function rowDueDate(row) {
  const sources = [row?.rawData, row];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const raw = source.sellerMakeItRightByDate?.value
      ?? source.sellerMakeItRightByDate
      ?? source.inquiryDetails?.sellerMakeItRightByDate?.value
      ?? source.inquiryDetails?.sellerMakeItRightByDate
      ?? source.caseDetails?.sellerMakeItRightByDate?.value
      ?? source.caseDetails?.sellerMakeItRightByDate;
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return row?.sellerResponseDueDate || null;
}

/** Inquiry: add tracking before due; after the deadline escalate → becomes a case. */
function inquiryWorkflow(row) {
  if (row?.source !== 'inquiry') return null;
  if (isClosedStatus(rowStatus(row))) return 'closed';
  if (isResponseOverdue(rowDueDate(row))) return 'escalate';
  return 'add_tracking';
}

function inquiryActionFlags(row) {
  if (row?.source !== 'inquiry') {
    return { showShip: false, canEscalate: false };
  }
  const workflow = inquiryWorkflow(row);
  if (workflow === 'closed') return { showShip: false, canEscalate: false };
  return {
    showShip: !sellerProvidedTrackingAction(row),
    canEscalate: workflow === 'escalate',
  };
}

function matchesActionFilter(row, action) {
  if (!action) return true;
  const flags = inquiryActionFlags(row);
  if (action === 'provide_shipment' || action === 'add_tracking') return flags.showShip;
  if (action === 'escalate') return flags.canEscalate;
  return false;
}

function inquiryRowSx(row) {
  const workflow = inquiryWorkflow(row);
  if (workflow === 'escalate') return { bgcolor: 'rgba(239, 68, 68, 0.10)' };
  if (workflow === 'add_tracking' && !hasTrackingNumber(row)) {
    if (isResponseUrgent(rowDueDate(row))) return { bgcolor: 'rgba(249, 115, 22, 0.12)' };
    return { bgcolor: 'rgba(234, 179, 8, 0.12)' };
  }
  return null;
}

function combinedRowSx(row) {
  const highlight = inquiryRowSx(row);
  const bg = highlight?.bgcolor;
  return {
    ...tableBodyRowSx,
    ...(bg
      ? {
          '& td': { backgroundColor: `${bg} !important` },
          '&:nth-of-type(even) td': { backgroundColor: `${bg} !important` },
        }
      : {}),
  };
}

function matchesInquiryStep(row, step) {
  return matchesActionFilter(row, step);
}

function formatAmount(amount) {
  if (!amount) return '—';
  const value = amount.value ?? amount;
  const currency = amount.currency || amount.currencyId || 'USD';
  if (value == null || value === '') return '—';
  return `${currency} ${value}`;
}

function rowItemPrice(row) {
  const candidates = [
    row?.itemPrice,
    row?.rawData?.itemPrice,
    row?.rawData?.inquiryDetails?.itemPrice,
    row?.rawData?.caseDetails?.itemPrice,
    row?.rawData?.itemDetails?.itemPrice,
    row?.rawData?.lineItems?.[0]?.itemPrice,
    row?.claimAmount,
    row?.amount,
  ];
  for (const amount of candidates) {
    if (amount == null || amount === '') continue;
    if (typeof amount === 'object' && amount.value == null && amount.currency == null) continue;
    return amount;
  }
  return null;
}

function getShipmentTracking(row) {
  const nested = row?.shipmentTrackingDetails
    || row?.rawData?.shipmentTrackingDetails
    || row?.rawData?.inquiryDetails?.shipmentTrackingDetails
    || row?.rawData?.caseDetails?.shipmentTrackingDetails
    || null;
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return null;
    if (node.trackingNumber || node.shipmentTrackingNumber || node.trackingURL || node.currentStatus || node.carrier) {
      if (node.trackingNumber || node.shipmentTrackingNumber || node.trackingURL) return node;
    }
    if (node.shipmentTrackingDetails) {
      const details = node.shipmentTrackingDetails;
      return Array.isArray(details) ? details[0] : details;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = walk(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const first = Array.isArray(nested) ? nested[0] : (nested || walk(row));
  if (!first || typeof first !== 'object') {
    return {
      trackingNumber: '',
      carrier: '',
      currentStatus: '',
      estimateFromDate: null,
      shippedDate: null,
      trackingURL: '',
    };
  }
  const trackingNumber = first.trackingNumber || first.trackingNo || first.shipmentTrackingNumber || '';
  const carrier = displayCarrier(
    first.carrier
      || first.shippingCarrier
      || first.shippingCarrierName
      || first.shippingCarrierUsed
      || first.carrierUsed
      || first.shippingCarrierCode
      || first.carrierName
      || first.carrierEnum
      || '',
    trackingNumber
  );
  return {
    trackingNumber,
    carrier,
    currentStatus: first.currentStatus || first.status || first.trackingStatus || '',
    estimateFromDate: first.estimateFromDate?.value || first.estimateFromDate || first.estimatedFromDate || null,
    shippedDate: first.shippedDate?.value || first.shippedDate || first.shippingDate?.value || first.shippingDate || first.dateShipped || null,
    trackingURL: first.trackingURL || first.trackingUrl || first.trackingLink || '',
  };
}

function CopyText({ value, secondary = false }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>—</Typography>
    );
  }
  return (
    <Tooltip title={copied ? 'Copied' : String(value)}>
      <Typography
        component="span"
        onClick={() => {
          navigator?.clipboard?.writeText?.(String(value));
          setCopied(true);
          window.setTimeout(() => setCopied(false), 900);
        }}
        sx={{
          fontFamily: 'monospace',
          fontSize: secondary ? '0.68rem' : '0.72rem',
          color: secondary ? 'text.secondary' : 'text.primary',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'block',
          maxWidth: 150,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.3,
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
}

function shippingAddressText(row) {
  const address = row?.shippingAddress;
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  if (address.formatted) return String(address.formatted).trim();
  return [
    address.fullName,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
    address.country,
  ].filter(Boolean).join(', ');
}

function ShippingCell({ row }) {
  const [copied, setCopied] = useState(false);
  const address = row?.shippingAddress;
  const formatted = shippingAddressText(row);
  if (!formatted) {
    return <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>—</Typography>;
  }
  const line1 = address?.line1 || formatted;
  const locality = [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', ');
  return (
    <Tooltip title={copied ? 'Copied' : `${formatted} (click to copy)`}>
      <Box
        onClick={() => {
          navigator?.clipboard?.writeText?.(formatted);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 900);
        }}
        sx={{ cursor: 'pointer', maxWidth: 190 }}
      >
        <Typography
          variant="body2"
          sx={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}
        >
          {line1}
        </Typography>
        {locality ? (
          <Typography
            variant="caption"
            sx={{ fontSize: '0.65rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', lineHeight: 1.2 }}
          >
            {locality}
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}

function tagRows(list, source) {
  return (Array.isArray(list) ? list : []).map((row) => ({ ...row, source }));
}

function earliestDate(...values) {
  let best = null;
  for (const value of values) {
    if (!value) continue;
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) continue;
    if (best == null || t < best) best = t;
  }
  return best == null ? (values.find(Boolean) || null) : new Date(best);
}

function firstFilled(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return '';
}

function linkedInquiryId(row) {
  return String(
    row?.inquiryId
    || row?.rawData?.inquiryId
    || row?.rawData?.caseDetails?.inquiryId
    || row?.rawData?.inquiryDetails?.inquiryId
    || ''
  ).trim();
}

function sellerKey(row) {
  return String(row?.seller?._id || row?.seller || '').trim();
}

function mergeInquiryCaseRow(inquiry, cse) {
  const caseTracking = getShipmentTracking(cse);
  const tracking = caseTracking.trackingNumber
    ? cse.shipmentTrackingDetails
    : (inquiry.shipmentTrackingDetails || cse.shipmentTrackingDetails);
  return {
    ...inquiry,
    ...cse,
    source: 'case',
    mergedFromInquiry: true,
    inquiryId: inquiry.caseId || linkedInquiryId(cse) || inquiry.inquiryId,
    caseId: cse.caseId || inquiry.caseId,
    creationDate: earliestDate(inquiry.creationDate, cse.creationDate),
    sellerResponseDueDate: cse.sellerResponseDueDate || inquiry.sellerResponseDueDate,
    status: cse.rawData?.caseStatusEnum || cse.status || inquiry.rawData?.inquiryStatusEnum || inquiry.status,
    orderId: firstFilled(cse.orderId, inquiry.orderId, rowOrderId(cse), rowOrderId(inquiry)),
    itemId: firstFilled(cse.itemId, inquiry.itemId, rowItemId(cse), rowItemId(inquiry)),
    itemPictureUrl: firstFilled(cse.itemPictureUrl, inquiry.itemPictureUrl, rowItemPictureUrl(cse), rowItemPictureUrl(inquiry)),
    itemTitle: firstFilled(cse.itemTitle, inquiry.itemTitle),
    buyerUsername: firstFilled(cse.buyerUsername, inquiry.buyerUsername),
    claimAmount: cse.claimAmount || inquiry.claimAmount,
    shipmentTrackingDetails: tracking || caseTracking,
    reasonForClosure: firstFilled(cse.reasonForClosure, inquiry.reasonForClosure),
    protectionStatus: firstFilled(cse.protectionStatus, inquiry.protectionStatus),
    sellerOutcome: firstFilled(cse.sellerOutcome, inquiry.sellerOutcome),
    rawData: {
      ...(inquiry.rawData || {}),
      ...(cse.rawData || {}),
      inquiry: inquiry.rawData || null,
    },
  };
}

function mergeInquiryAndCaseRows(inquiryRows, caseRows) {
  const usedCases = new Set();
  const casesById = new Map();
  const casesByInquiryId = new Map();
  const casesByOrderSeller = new Map();

  for (const cse of caseRows) {
    const id = String(rowIssueId(cse) || '').trim();
    if (id) casesById.set(id, cse);
    const inquiryId = linkedInquiryId(cse);
    if (inquiryId) casesByInquiryId.set(inquiryId, cse);
    const order = String(rowOrderId(cse) || '').trim();
    const seller = sellerKey(cse);
    if (order && seller) {
      const key = `${seller}::${order}`;
      if (!casesByOrderSeller.has(key)) casesByOrderSeller.set(key, []);
      casesByOrderSeller.get(key).push(cse);
    }
  }

  const merged = [];
  const leftoverInquiries = [];
  for (const inquiry of inquiryRows) {
    const id = String(rowIssueId(inquiry) || '').trim();
    const order = String(rowOrderId(inquiry) || '').trim();
    const seller = sellerKey(inquiry);
    let cse = (id && (casesById.get(id) || casesByInquiryId.get(id))) || null;
    if (!cse && order && seller) {
      const matches = (casesByOrderSeller.get(`${seller}::${order}`) || [])
        .filter((row) => !usedCases.has(String(row._id || row.caseId)));
      if (matches.length === 1) cse = matches[0];
    }
    const caseKey = cse ? String(cse._id || cse.caseId) : '';
    if (cse && caseKey && !usedCases.has(caseKey)) {
      usedCases.add(caseKey);
      merged.push(mergeInquiryCaseRow(inquiry, cse));
    } else {
      leftoverInquiries.push(inquiry);
    }
  }

  const leftoverCases = caseRows.filter((cse) => !usedCases.has(String(cse._id || cse.caseId)));
  return [...leftoverInquiries, ...merged, ...leftoverCases];
}

function normalizePaymentDispute(row) {
  return {
    ...row,
    source: 'dispute',
    caseId: row.paymentDisputeId,
    caseType: row.reason || 'DISPUTE',
    status: row.rawData?.paymentDisputeStatus || row.paymentDisputeStatus,
    claimAmount: row.amount,
    creationDate: row.openDate,
    sellerResponseDueDate: row.respondByDate || row.evidenceDeadline,
    initiator: 'BUYER',
    itemId: rowItemId(row),
  };
}

function sellerName(row) {
  return row?.seller?.user?.username || row?.sellerUsername || '—';
}

const MARKETPLACE_BY_CURRENCY = {
  AUD: 'Australia',
  USD: 'USA',
  GBP: 'UK',
  CAD: 'Canada',
};

const MARKETPLACE_BY_ID = {
  EBAY_AU: 'Australia',
  EBAY_US: 'USA',
  EBAY_GB: 'UK',
  EBAY_UK: 'UK',
  EBAY_CA: 'Canada',
  EBAY_ENCA: 'Canada',
};

function claimCurrency(row) {
  const amount = row?.claimAmount || row?.amount || row?.rawData?.claimAmount || row?.rawData?.amount;
  return String(amount?.currency || amount?.currencyId || '').trim().toUpperCase();
}

function rowMarketplaceId(row) {
  return String(
    row?.marketplaceId
    || row?.rawData?.marketplaceId
    || ''
  ).trim().toUpperCase();
}

function marketplaceLabel(row) {
  const fromId = MARKETPLACE_BY_ID[rowMarketplaceId(row)];
  if (fromId) return fromId;
  const currency = claimCurrency(row);
  if (!currency) return '—';
  return MARKETPLACE_BY_CURRENCY[currency] || currency;
}

function rowOrderId(row) {
  return row?.orderId
    || row?.legacyOrderId
    || row?.rawData?.orderId
    || row?.rawData?.legacyOrderId
    || row?.rawData?.orderNumber
    || row?.rawData?.inquiryDetails?.orderId
    || row?.rawData?.caseDetails?.orderId
    || '';
}

function rowIssueId(row) {
  return row?.caseId
    || row?.paymentDisputeId
    || row?.inquiryId
    || row?.rawData?.inquiryId
    || row?.rawData?.caseId
    || row?.rawData?.paymentDisputeId
    || '';
}

function normalizeIdQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '');
}

function matchesIssueOrOrderId(row, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const compact = normalizeIdQuery(q);
  const ids = [
    rowIssueId(row),
    rowOrderId(row),
    row?.inquiryId,
    row?.legacyOrderId,
    row?.rawData?.legacyOrderId,
  ];
  return ids.some((id) => {
    const s = String(id || '').trim().toLowerCase();
    if (!s) return false;
    return s.includes(q) || normalizeIdQuery(s).includes(compact);
  });
}

function rowItemId(row) {
  return row?.itemId
    || row?.rawData?.itemId
    || row?.rawData?.legacyItemId
    || row?.rawData?.lineItems?.[0]?.itemId
    || row?.rawData?.lineItems?.[0]?.legacyItemId
    || row?.rawData?.inquiryDetails?.itemId
    || row?.rawData?.caseDetails?.itemId
    || row?.rawData?.itemDetails?.itemId
    || '';
}

function rowItemPictureUrl(row) {
  const candidates = [
    row?.itemPictureUrl,
    row?.rawData?.itemPictureUrl,
    row?.rawData?.inquiryDetails?.itemPictureUrl,
    row?.rawData?.caseDetails?.itemPictureUrl,
    row?.rawData?.itemDetails?.itemPictureUrl,
    row?.rawData?.itemPicture?.url,
    row?.rawData?.lineItems?.[0]?.itemPictureUrl,
    row?.rawData?.lineItems?.[0]?.imageUrl,
  ];
  for (const url of candidates) {
    const s = String(url || '').trim();
    if (s.startsWith('http')) return s;
  }
  return '';
}

function asReasonValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    return asReasonValue(value.value ?? value.name ?? value.enum ?? value.caseTypeEnum);
  }
  const s = String(value).trim();
  if (!s || s === '—' || s === 'undefined' || s === 'null') return '';
  return s;
}

function extractIssueReason(source, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 6) return '';
  const keys = [
    'caseTypeEnum',
    'inquiryTypeEnum',
    'inquiryType',
    'caseType',
    'reason',
    'claimReason',
    'escalationReason',
    'escalateReason',
    'returnReason',
    'buyerRequestedReason',
  ];
  for (const key of keys) {
    const v = asReasonValue(source[key]);
    if (v && v !== 'OPEN' && v !== 'CLOSED') return v;
  }
  const values = Array.isArray(source) ? source : Object.values(source);
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const found = extractIssueReason(value, depth + 1);
    if (found) return found;
  }
  return '';
}

function rowReason(row) {
  return extractIssueReason(row?.rawData)
    || asReasonValue(row?.caseType)
    || asReasonValue(row?.reason)
    || extractIssueReason(row)
    || '';
}

function sourceChipProps(source) {
  if (source === 'inquiry') return { label: 'Inquiry', color: 'info' };
  if (source === 'case') return { label: 'Case', color: 'warning' };
  return { label: 'Dispute', color: 'success' };
}

function scalarReasonForClosure(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === '[object Object]') return '';
    return s;
  }
  if (typeof value === 'object') {
    return scalarReasonForClosure(value.reasonForClosure)
      || scalarReasonForClosure(value.reason_for_closure)
      || scalarReasonForClosure(value.value);
  }
  return '';
}

function extractReasonForClosure(source) {
  if (source == null) return '';
  if (typeof source === 'string') {
    const s = scalarReasonForClosure(source);
    return /WON|LOST|LOSE|WIN|FAVOUR|FAVOR|ACCEPT/i.test(s) ? s : '';
  }
  if (typeof source !== 'object') return '';
  const direct = scalarReasonForClosure(source.reasonForClosure)
    || scalarReasonForClosure(source.reason_for_closure)
    || scalarReasonForClosure(source.resolution?.reasonForClosure)
    || scalarReasonForClosure(source.resolution?.reason_for_closure)
    || scalarReasonForClosure(source.rawData?.reasonForClosure)
    || scalarReasonForClosure(source.rawData?.resolution?.reasonForClosure);
  if (direct && /WON|LOST|LOSE|WIN|FAVOUR|FAVOR|ACCEPT/i.test(direct)) return direct;
  if (typeof source.resolution === 'string') {
    const s = scalarReasonForClosure(source.resolution);
    if (s && /WON|LOST|LOSE|WIN|FAVOUR|FAVOR|ACCEPT/i.test(s)) return s;
  }
  try {
    const blob = JSON.stringify(source.rawData || source);
    const match = blob && blob.match(/"reason(?:For|_for_)Closure"\s*:\s*"([^"]+)"/i);
    if (match?.[1] && /WON|LOST|LOSE|WIN|FAVOUR|FAVOR|ACCEPT/i.test(match[1])) return match[1];
  } catch (_) { /* ignore */ }
  return '';
}

function paymentDisputeSellerAccept(row) {
  if (row?.source !== 'dispute') return '';
  const raw = extractReasonForClosure(row) || extractReasonForClosure(row?.rawData) || '';
  const s = String(raw || '').toUpperCase().replace(/[\s-]+/g, '_');
  return s.includes('SELLER_ACCEPT') || s === 'ACCEPT' ? 'SELLER ACCEPT' : '';
}

function rowOutcome(row) {
  const raw = extractReasonForClosure(row)
    || extractReasonForClosure(row?.rawData)
    || scalarReasonForClosure(row?.sellerOutcome)
    || scalarReasonForClosure(row?.rawData?.sellerOutcome)
    || scalarReasonForClosure(row?.rawData?.caseDetails?.sellerOutcome)
    || scalarReasonForClosure(row?.rawData?.decision?.sellerOutcome)
    || '';
  const s = String(raw || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (!s) return 'No result';
  if (s.includes('SELLER_ACCEPT') || s === 'ACCEPT') return 'Accept';
  if (
    s.includes('SELLER_LOST')
    || s.includes('LOST')
    || s === 'LOSE'
    || s === 'LOSS'
    || s === 'BUYER_WON'
    || s.includes('BUYER_WIN')
    || s.includes('BUYER_FAVOUR')
    || s.includes('BUYER_FAVOR')
  ) return 'Lose';
  if (
    s === 'WIN'
    || s === 'WON'
    || s.includes('SELLER_WON')
    || s.includes('SELLER_WIN')
    || s.includes('SELLER_FAVOUR')
    || s.includes('SELLER_FAVOR')
  ) return 'Won';
  return 'No result';
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function extractProtectionStatus(source) {
  if (!source || typeof source !== 'object') return '';
  const containers = [
    source,
    asPlainObject(source.resolution),
    asPlainObject(source.rawData),
    asPlainObject(source.rawData?.resolution),
    asPlainObject(source.outcome),
    asPlainObject(source.rawData?.outcome),
  ].filter(Boolean);
  for (const obj of containers) {
    const s = scalarReasonForClosure(obj.protectionStatus)
      || scalarReasonForClosure(obj.protection_status);
    if (s) return s;
  }
  try {
    for (const blobSource of [source.rawData, source]) {
      if (!blobSource) continue;
      const blob = JSON.stringify(blobSource);
      const match = blob && blob.match(/"protection(?:Status|_status)"\s*:\s*"([^"]+)"/i);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  } catch (_) { /* ignore */ }
  return scalarReasonForClosure(source.sellerProtectionDecision)
    || scalarReasonForClosure(source.rawData?.sellerProtectionDecision)
    || '';
}

function formatProtectionStatus(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!key) return '';
  const labels = {
    FULLY_PROTECTED: 'Fully protected',
    PARTIALLY_PROTECTED: 'Partially protected',
    NOT_PROTECTED: 'Not protected',
    PROTECTED: 'Protected',
    ELIGIBLE: 'Eligible',
    NOT_ELIGIBLE: 'Not eligible',
    PARTIAL: 'Partial',
  };
  return labels[key] || String(value).replace(/_/g, ' ');
}

function rowProtectionStatus(row) {
  return extractProtectionStatus(row) || extractProtectionStatus(row?.rawData) || '';
}

function outcomeColor(outcome) {
  const s = String(outcome || '').toUpperCase();
  if (s === 'WON' || s === 'WIN') return 'success';
  if (s === 'LOSE' || s === 'LOSS' || s === 'LOST') return 'error';
  return 'default';
}

function claimNumeric(row) {
  const amount = rowItemPrice(row);
  const n = Number(amount?.value ?? amount);
  return Number.isFinite(n) ? n : null;
}

function dateNumeric(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function sortValue(row, column) {
  const tracking = getShipmentTracking(row);
  switch (column) {
    case 'source': return sourceChipProps(row.source).label;
    case 'id': return row.caseId || '';
    case 'orderId': return rowOrderId(row);
    case 'reason': return rowReason(row);
    case 'marketplace': return marketplaceLabel(row);
    case 'seller': return sellerName(row);
    case 'buyer': return row.buyerUsername || '';
    case 'shippingAddress': return shippingAddressText(row);
    case 'item': return String(rowItemId(row) || '');
    case 'initiator': return row.initiator || row.escalationReason || '';
    case 'status': return rowStatus(row);
    case 'outcome': return rowOutcome(row);
    case 'claim': return claimNumeric(row);
    case 'trackingNumber': return tracking.trackingNumber || '';
    case 'carrier': return tracking.carrier || '';
    case 'trackingStatus': return tracking.currentStatus || '';
    case 'estimateFrom': return dateNumeric(tracking.estimateFromDate);
    case 'trackingUrl': return tracking.trackingURL || '';
    case 'created': return dateNumeric(row.creationDate);
    case 'responseDue': return dateNumeric(rowDueDate(row));
    default: return '';
  }
}

function isEmptySortValue(value) {
  return value == null || value === '' || value === '—';
}

function compareRows(a, b, column, dir) {
  const av = sortValue(a, column);
  const bv = sortValue(b, column);
  if (isEmptySortValue(av) && isEmptySortValue(bv)) return 0;
  if (isEmptySortValue(av)) return 1;
  if (isEmptySortValue(bv)) return -1;
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

function SortableHeader({ id, label, sortBy, sortDir, onSort, sx }) {
  return (
    <TableCell sx={{ ...headerSx, ...sx }} sortDirection={sortBy === id ? sortDir : false}>
      <TableSortLabel
        active={sortBy === id}
        direction={sortBy === id ? sortDir : 'asc'}
        onClick={() => onSort(id)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function displayDetailValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === 'undefined' || s === 'null') return '';
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatDate(s);
    return s;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '';
    return value.map((item) => displayDetailValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if (value.value != null && (value.currency || value.currencyId)) return formatAmount(value);
    if (value.content) return displayDetailValue(value.content);
    if (value.value != null) return displayDetailValue(value.value);
    if (value.formattedValue) return String(value.formattedValue);
  }
  return '';
}

function detailSources(data) {
  if (!data || typeof data !== 'object') return [];
  return [data, data.inquiryDetails, data.caseDetails, data.resolution, data.sellerResponse, data.itemDetails]
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value));
}

function pickDetailValue(data, keys) {
  for (const source of detailSources(data)) {
    for (const key of keys) {
      const shown = displayDetailValue(source[key]);
      if (shown) return shown;
    }
  }
  return '';
}

function detailHistory(data) {
  const lists = [
    data?.inquiryHistoryDetails?.history,
    data?.historyDetails?.history,
    data?.caseHistoryDetails?.history,
    data?.history,
  ];
  for (const list of lists) {
    if (Array.isArray(list) && list.some((item) => item && typeof item === 'object')) {
      return list.filter((item) => item && typeof item === 'object');
    }
  }
  return [];
}

function historyEventText(event) {
  return displayDetailValue(event.action)
    || displayDetailValue(event.description)
    || displayDetailValue(event.event)
    || displayDetailValue(event.activity)
    || '';
}

function DetailField({ label, value, copy, chipColor }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      {chipColor != null ? (
        <Chip size="small" label={value} color={chipColor} sx={{ height: 22, fontSize: '0.72rem' }} />
      ) : (
        <Typography
          variant="body2"
          title={copy ? 'Click to copy' : undefined}
          onClick={copy ? () => navigator?.clipboard?.writeText?.(String(value)) : undefined}
          sx={{
            fontSize: '0.875rem',
            wordBreak: 'break-word',
            cursor: copy ? 'pointer' : 'default',
            '&:hover': copy ? { textDecoration: 'underline' } : undefined,
          }}
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}

function IssueDetailView({ data, row }) {
  const [orderData, setOrderData] = useState(null);
  const [loadingOrderData, setLoadingOrderData] = useState(false);

  if (!data || typeof data !== 'object') {
    return <Alert severity="info">No details available.</Alert>;
  }

  const fakeRow = { ...(row || {}), rawData: { ...(row?.rawData || {}), ...data } };
  const status = pickDetailValue(data, ['paymentDisputeStatus', 'inquiryStatusEnum', 'caseStatusEnum', 'status'])
    || rowStatus(fakeRow);
  const reason = pickDetailValue(data, ['reason', 'caseTypeEnum', 'inquiryTypeEnum', 'claimReason'])
    || rowReason(fakeRow);
  const issueId = pickDetailValue(data, ['paymentDisputeId', 'inquiryId', 'caseId'])
    || rowIssueId(fakeRow);
  const orderId = pickDetailValue(data, ['orderId', 'legacyOrderId', 'orderNumber'])
    || rowOrderId(fakeRow);
  const buyer = pickDetailValue(data, ['buyerUsername', 'buyer', 'buyerLoginName']);
  const opened = pickDetailValue(data, ['openDate', 'creationDate', 'creationDateTime']);
  const due = pickDetailValue(data, ['respondByDate', 'sellerMakeItRightByDate', 'evidenceDeadline'])
    || (rowDueDate(fakeRow) ? formatDate(rowDueDate(fakeRow)) : '');
  const closed = pickDetailValue(data, ['closedDate']);
  const amount = pickDetailValue(data, ['amount', 'claimAmount']) || formatAmount(rowItemPrice(fakeRow));
  const itemId = pickDetailValue(data, ['itemId']) || rowItemId(fakeRow);
  const outcome = rowOutcome(fakeRow);
  const protection = formatProtectionStatus(rowProtectionStatus(fakeRow));
  const tracking = getShipmentTracking({ ...fakeRow, ...data, rawData: data });
  const address = shippingAddressText(fakeRow);
  const picture = rowItemPictureUrl(fakeRow);
  const choices = Array.isArray(data.availableChoices) ? data.availableChoices : [];
  const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
  const history = detailHistory(data).slice(-10).reverse();

  // Fetch order details based on orderId
  useEffect(() => {
    if (!orderId) {
      setOrderData(null);
      return;
    }

    let mounted = true;
    setLoadingOrderData(true);
    
    api.get(`/ebay/order/${orderId}`)
      .then(({ data: fetchedOrder }) => {
        if (mounted) {
          setOrderData(fetchedOrder);
        }
      })
      .catch(() => {
        if (mounted) {
          setOrderData(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingOrderData(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [orderId]);

  const fields = [
    { label: 'Status', value: statusShort(status), chipColor: statusColor(status) },
    { label: 'Reason', value: reasonShort(reason) || reason },
    { label: 'Outcome', value: outcome && outcome !== 'No result' ? outcome : '', chipColor: outcomeColor(outcome) },
    { label: 'Protection', value: protection },
    { label: 'Issue ID', value: issueId, copy: true },
    { label: 'Order ID', value: orderId, copy: true },
    { label: 'Buyer', value: buyer, copy: true },
    { label: 'Item ID', value: itemId, copy: true },
    { label: 'Amount', value: amount && amount !== '—' ? amount : '' },
    { label: 'Opened', value: opened },
    { label: 'Due', value: due },
    { label: 'Closed', value: closed },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        {picture ? (
          <Box
            component="img"
            src={picture}
            alt=""
            referrerPolicy="no-referrer"
            sx={{
              width: 56,
              height: 56,
              objectFit: 'cover',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
              bgcolor: 'grey.100',
            }}
          />
        ) : null}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 1.25,
            flex: 1,
            minWidth: 0,
          }}
        >
          {fields.map((field) => (
            <DetailField key={field.label} {...field} />
          ))}
        </Box>
      </Stack>

      {address ? (
        <>
          <Divider />
          <DetailField label="Ship to" value={address} />
        </>
      ) : null}

      {tracking.trackingNumber || tracking.carrier || orderData ? (
        <>
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Shipment & Fulfillment</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <DetailField label="Tracking" value={tracking.trackingNumber} copy />
              <DetailField label="Carrier" value={tracking.carrier} />
              <DetailField label="Status" value={tracking.currentStatus} />
              <DetailField label="Shipped" value={tracking.shippedDate ? formatDate(tracking.shippedDate) : ''} />
              {loadingOrderData ? (
                <DetailField label="Order Details" value={<CircularProgress size={16} />} />
              ) : orderData ? (
                <>
                  <DetailField label="Amazon Account" value={orderData.amazonAccount || '-'} />
                  <DetailField label="Amazon ID" value={orderData.azOrderId || orderData.amazonOrderId || '-'} copy />
                  <DetailField 
                    label="Remarks" 
                    value={orderData.remark || '-'} 
                  />
                </>
              ) : null}
            </Box>
            {tracking.trackingNumber ? (
              <Button
                size="small"
                href={`https://www.aftership.com/track/${encodeURIComponent(tracking.trackingNumber)}`}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                sx={{ mt: 1, textTransform: 'none', px: 0 }}
              >
                Track shipment
              </Button>
            ) : null}
          </Box>
        </>
      ) : null}

      {lineItems.length ? (
        <>
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Line items</Typography>
            <Stack spacing={0.75}>
              {lineItems.map((item, index) => (
                <Typography key={item.lineItemId || item.itemId || index} variant="body2" sx={{ fontSize: '0.82rem' }}>
                  {displayDetailValue(item.itemId) || 'Item'}
                  {item.lineItemId ? ` · line ${item.lineItemId}` : ''}
                  {item.quantity ? ` · qty ${item.quantity}` : ''}
                </Typography>
              ))}
            </Stack>
          </Box>
        </>
      ) : null}

      {choices.length ? (
        <>
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Available actions</Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {choices.map((choice) => (
                <Chip
                  key={String(choice)}
                  size="small"
                  variant="outlined"
                  label={displayDetailValue(choice).replace(/_/g, ' ')}
                />
              ))}
            </Stack>
          </Box>
        </>
      ) : null}

      {history.length ? (
        <>
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>History</Typography>
            <Stack spacing={1}>
              {history.map((event, index) => (
                <Box key={index}>
                  <Typography variant="caption" color="text.secondary">
                    {displayDetailValue(event.date || event.creationDate || event.timestamp) || '—'}
                    {displayDetailValue(event.actor?.role || event.actor || event.user) ? ` · ${displayDetailValue(event.actor?.role || event.actor || event.user)}` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                    {historyEventText(event) || 'Update'}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </>
      ) : null}
    </Stack>
  );
}

export default function InrApiPage({
  dateFilter: _dateFilter,
  hideDateFilter = false,
  embedded = false,
}) {
  const [inquiries, setInquiries] = useState([]);
  const [cases, setCases] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [idSearch, setIdSearch] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [detail, setDetail] = useState({
    open: false, title: '', loading: false, data: null, error: '', row: null, showJson: false,
  });
  const [actionBusyId, setActionBusyId] = useState('');
  const [shipDialog, setShipDialog] = useState(EMPTY_SHIP_DIALOG);
  const [escalateDialog, setEscalateDialog] = useState({
    open: false, row: null, comments: '',
  });
  const [selectedCase, setSelectedCase] = useState(null);

  const rows = useMemo(() => {
    const combined = [
      ...mergeInquiryAndCaseRows(tagRows(inquiries, 'inquiry'), tagRows(cases, 'case')),
      ...(Array.isArray(disputes) ? disputes.map(normalizePaymentDispute) : []),
    ];
    const filtered = combined.filter((row) => {
      if (sourceFilter && row.source !== sourceFilter) return false;
      if (marketplaceFilter && marketplaceLabel(row) !== marketplaceFilter) return false;
      if (workflowFilter && !matchesInquiryStep(row, workflowFilter)) return false;
      if (outcomeFilter && rowOutcome(row) !== outcomeFilter) return false;
      if (typeFilter && !reasonMatchesFilter(rowReason(row), typeFilter)) return false;
      if (statusFilter && statusShort(rowStatus(row)) !== statusFilter) return false;
      if (idSearch && !matchesIssueOrOrderId(row, idSearch)) return false;
      return true;
    });
    return filtered.sort((a, b) => compareRows(a, b, sortBy, sortDir));
  }, [inquiries, cases, disputes, sourceFilter, marketplaceFilter, workflowFilter, outcomeFilter, statusFilter, typeFilter, idSearch, sortBy, sortDir]);

  const statuses = useMemo(() => {
    const combined = [
      ...mergeInquiryAndCaseRows(tagRows(inquiries, 'inquiry'), tagRows(cases, 'case')),
      ...(Array.isArray(disputes) ? disputes.map(normalizePaymentDispute) : []),
    ];
    const set = new Set(
      combined.map((r) => statusShort(rowStatus(r))).filter((s) => s && s !== '—')
    );
    return [...set].sort();
  }, [inquiries, cases, disputes]);

  const types = useMemo(() => {
    const combined = [
      ...mergeInquiryAndCaseRows(tagRows(inquiries, 'inquiry'), tagRows(cases, 'case')),
      ...(Array.isArray(disputes) ? disputes.map(normalizePaymentDispute) : []),
    ];
    const byId = new Map();
    combined.forEach((row) => {
      const group = reasonGroupFor(rowReason(row));
      if (group?.id) byId.set(group.id, group);
    });
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [inquiries, cases, disputes]);

  const marketplaces = useMemo(() => {
    const set = new Set(['Australia', 'Canada', 'UK', 'USA']);
    [...inquiries, ...cases, ...(disputes || []).map(normalizePaymentDispute)].forEach((row) => {
      const m = marketplaceLabel(row);
      if (m && m !== '—') set.add(m);
    });
    return [...set].sort();
  }, [inquiries, cases, disputes]);

  const outcomes = useMemo(() => {
    const set = new Set(['Won', 'Lose', 'No result']);
    [...tagRows(inquiries, 'inquiry'), ...tagRows(cases, 'case'), ...(disputes || []).map(normalizePaymentDispute)]
      .forEach((row) => {
        const outcome = rowOutcome(row);
        if (outcome) set.add(outcome);
      });
    return [...set].sort();
  }, [inquiries, cases, disputes]);

  useEffect(() => {
    api.get('/sellers/all')
      .then((res) => setSellers(sortSellersByName(res.data || [])))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    loadStored();
  }, [sellerFilter]);

  async function loadStored() {
    setLoading(true);
    setError('');
    const params = { limit: 500 };
    if (sellerFilter) params.sellerId = sellerFilter;
    const inquiryParams = { ...params };
    const disputeParams = { ...params };
    const [inqRes, caseRes, disputeRes] = await Promise.allSettled([
      api.get('/ebay/stored-inr-cases', { params: inquiryParams, timeout: 60000 }),
      api.get('/ebay/stored-case-management', { params: inquiryParams, timeout: 60000 }),
      api.get('/ebay/stored-payment-disputes', { params: disputeParams, timeout: 60000 }),
    ]);
    const errors = [];
    if (inqRes.status === 'fulfilled') {
      setInquiries(Array.isArray(inqRes.value.data?.cases) ? inqRes.value.data.cases : []);
    } else {
      setInquiries([]);
      errors.push(inqRes.reason?.response?.data?.error || inqRes.reason?.message || 'Inquiry load failed');
    }
    if (caseRes.status === 'fulfilled') {
      setCases(Array.isArray(caseRes.value.data?.cases) ? caseRes.value.data.cases : []);
    } else {
      setCases([]);
      errors.push(caseRes.reason?.response?.data?.error || caseRes.reason?.message || 'Case management load failed');
    }
    if (disputeRes.status === 'fulfilled') {
      setDisputes(Array.isArray(disputeRes.value.data?.disputes) ? disputeRes.value.data.disputes : []);
    } else {
      setDisputes([]);
      errors.push(disputeRes.reason?.response?.data?.error || disputeRes.reason?.message || 'Payment dispute load failed');
    }
    setError(errors.join(' '));
    setLoading(false);
  }

  async function fetchFromEbay() {
    setFetching(true);
    setError('');
    try {
      const [inrRes, disputeRes] = await Promise.allSettled([
        api.post('/ebay/fetch-inr-api', {}, { timeout: 300000 }),
        api.post('/ebay/fetch-payment-disputes', {}, { timeout: 300000 }),
      ]);
      try {
        await api.post('/ebay/enrich-inr-api-tracking', { source: 'all', limit: 80 }, { timeout: 180000 });
      } catch {
        // tracking enrich is best-effort; search results still load
      }
      const errors = [];
      const inr = inrRes.status === 'fulfilled' ? inrRes.value.data : null;
      const pd = disputeRes.status === 'fulfilled' ? disputeRes.value.data : null;
      if (inrRes.status === 'rejected') {
        errors.push(inrRes.reason?.response?.data?.error || inrRes.reason?.message || 'Inquiry/case fetch failed');
      }
      if (disputeRes.status === 'rejected') {
        errors.push(disputeRes.reason?.response?.data?.error || disputeRes.reason?.message || 'Payment dispute fetch failed');
      }
      if (inr?.errors?.length) errors.push(...inr.errors);
      if (pd?.errors?.length) errors.push(...pd.errors);
      setSnackbar({
        open: true,
        severity: errors.length ? 'warning' : 'success',
        message:
          `Inquiry: ${inr?.totalNewInquiries || 0} new, ${inr?.totalUpdatedInquiries || 0} updated. `
          + `Cases: ${inr?.totalNewCases || 0} new, ${inr?.totalUpdatedCases || 0} updated. `
          + `Disputes: ${pd?.totalNewDisputes || 0} new, ${pd?.totalUpdatedDisputes || 0} updated`
          + (errors.length ? ` (${errors.length} error(s))` : ''),
      });
      if (errors.length) setError(errors.join(' '));
      await loadStored();
    } catch (e) {
      const msg = e.code === 'ECONNABORTED'
        ? 'Fetch timed out. Try again or narrow to fewer stores later.'
        : (e.response?.data?.error || e.message);
      setError(msg);
    } finally {
      setFetching(false);
    }
  }

  async function openDetail(row) {
    const id = row.caseId;
    const title = row.source === 'inquiry'
      ? `Inquiry ${id}`
      : row.source === 'case'
        ? `Case ${id}`
        : `Payment Dispute ${id}`;
    const path = row.source === 'inquiry'
      ? `/ebay/inquiry/${encodeURIComponent(id)}`
      : row.source === 'case'
        ? `/ebay/casemanagement/${encodeURIComponent(id)}`
        : `/ebay/payment-dispute/${encodeURIComponent(id)}`;
    setDetail({ open: true, title, loading: true, data: null, error: '', row, showJson: false });
    try {
      const { data } = await api.get(path, { timeout: 45000 });
      setDetail({ open: true, title, loading: false, data, error: '', row, showJson: false });
      const closure = extractReasonForClosure(data) || extractReasonForClosure({ rawData: data });
      if (data || closure) {
        const patch = { rawData: { ...(row.rawData || {}), ...(data || {}) } };
        if (closure) {
          patch.reasonForClosure = closure;
          patch.resolution = closure;
        }
        const protection = extractProtectionStatus(data) || extractProtectionStatus({ rawData: data });
        if (protection) patch.protectionStatus = protection;
        const liveStatus = data?.inquiryStatusEnum
          || data?.caseStatusEnum
          || data?.paymentDisputeStatus
          || data?.inquiryDetails?.inquiryStatusEnum
          || data?.caseDetails?.caseStatusEnum;
        if (liveStatus) {
          patch.status = liveStatus;
          if (row.source === 'dispute') patch.paymentDisputeStatus = liveStatus;
        }
        const sameRow = (r) => String(r.caseId || r.paymentDisputeId) === String(row.caseId);
        if (row.source === 'inquiry') {
          setInquiries((prev) => prev.map((r) => (sameRow(r) ? { ...r, ...patch } : r)));
        } else if (row.source === 'case') {
          setCases((prev) => prev.map((r) => (sameRow(r) ? { ...r, ...patch } : r)));
        } else {
          setDisputes((prev) => prev.map((r) => (
            String(r.paymentDisputeId) === String(row.caseId) ? { ...r, ...patch } : r
          )));
        }
      }
    } catch (e) {
      if (row.rawData) {
        setDetail({ open: true, title, loading: false, data: row.rawData, error: '', row, showJson: false });
      } else {
        setDetail({
          open: true,
          title,
          loading: false,
          data: null,
          error: e.response?.data?.details || e.response?.data?.error || e.message,
          row,
          showJson: false,
        });
      }
    }
  }

  function openShipDialog(row) {
    const tracking = getShipmentTracking(row);
    const trackingNumber = cleanTrackingNumber(tracking.trackingNumber);
    setShipDialog({
      open: true,
      row,
      trackingNumber,
      carrier: normalizeCarrier(tracking.carrier || guessCarrierFromTracking(trackingNumber)),
      shippedDate: toDateInput(tracking.shippedDate),
      comments: '',
      showComments: false,
    });
  }

  function closeShipDialog() {
    if (actionBusyId) return;
    setShipDialog(EMPTY_SHIP_DIALOG);
  }

  function openEscalateDialog(row) {
    setEscalateDialog({ open: true, row, comments: '' });
  }

  async function saveInquiryNotes(caseId, notes) {
    try {
      // Determine which endpoint to use based on the source
      const row = rows.find((r) => r.caseId === caseId);
      if (!row) throw new Error('Row not found');

      let endpoint = '';
      if (row.source === 'inquiry') {
        endpoint = `/ebay/inquiry/${encodeURIComponent(caseId)}/notes`;
      } else if (row.source === 'case') {
        endpoint = `/ebay/case-management/${encodeURIComponent(caseId)}/notes`;
      } else if (row.source === 'dispute') {
        endpoint = `/ebay/payment-dispute/${encodeURIComponent(caseId)}/notes`;
      }

      await api.patch(endpoint, { notes });

      // Update local state
      const sameRow = (r) => String(r.caseId || r.paymentDisputeId) === String(caseId);
      if (row.source === 'inquiry') {
        setInquiries((prev) => prev.map((r) => (sameRow(r) ? { ...r, notes } : r)));
      } else if (row.source === 'case') {
        setCases((prev) => prev.map((r) => (sameRow(r) ? { ...r, notes } : r)));
      } else {
        setDisputes((prev) => prev.map((r) => (
          String(r.paymentDisputeId) === String(caseId) ? { ...r, notes } : r
        )));
      }
    } catch (e) {
      throw new Error(e.response?.data?.error || e.message || 'Failed to save notes');
    }
  }

  const handleNotify = (severity, message) => {
    setSnackbar({ open: true, message, severity });
  };

  async function submitShipmentInfo() {
    const row = shipDialog.row;
    const inquiryId = row?.caseId;
    if (!inquiryId || !shipDialog.trackingNumber.trim() || !shipDialog.carrier) return;
    setActionBusyId(inquiryId);
    try {
      const { data } = await api.post(
        `/ebay/inquiry/${encodeURIComponent(inquiryId)}/provide-shipment-info`,
        {
          trackingNumber: cleanTrackingNumber(shipDialog.trackingNumber),
          shippingCarrierUsed: shipDialog.carrier,
          shippedDate: shipDialog.shippedDate || undefined,
          comments: shipDialog.comments.trim() || undefined,
        },
        { timeout: 45000 }
      );
      setShipDialog(EMPTY_SHIP_DIALOG);
      setSnackbar({ open: true, severity: 'success', message: data.message || `Provided shipment info for ${inquiryId}` });
      await loadStored();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setSnackbar({ open: true, severity: 'error', message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setActionBusyId('');
    }
  }

  async function submitEscalate() {
    const row = escalateDialog.row;
    const inquiryId = row?.caseId;
    if (!inquiryId || !escalateDialog.comments.trim()) return;
    setActionBusyId(inquiryId);
    try {
      const { data } = await api.post(
        `/ebay/inquiry/${encodeURIComponent(inquiryId)}/escalate`,
        {
          escalateInquiryReason: INQUIRY_ESCALATE_REASON,
          comments: escalateDialog.comments.trim(),
        },
        { timeout: 45000 }
      );
      setEscalateDialog({ open: false, row: null, comments: '' });
      setSnackbar({
        open: true,
        severity: 'success',
        message: data.message || `Escalated ${inquiryId}. Fetch from eBay to see it as a Case.`,
      });
      await loadStored();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setSnackbar({ open: true, severity: 'error', message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setActionBusyId('');
    }
  }

  const inquiryActionCounts = useMemo(() => {
    const tagged = mergeInquiryAndCaseRows(tagRows(inquiries, 'inquiry'), tagRows(cases, 'case'));
    return {
      provideShipment: tagged.filter((row) => inquiryActionFlags(row).showShip).length,
      escalate: tagged.filter((row) => inquiryActionFlags(row).canEscalate).length,
    };
  }, [inquiries, cases]);

  const hasActiveFilters = Boolean(
    sellerFilter || statusFilter || typeFilter || marketplaceFilter || sourceFilter || workflowFilter || outcomeFilter || idSearch.trim()
  );

  function clearFilters() {
    setSellerFilter('');
    setStatusFilter('');
    setTypeFilter('');
    setMarketplaceFilter('');
    setSourceFilter('');
    setWorkflowFilter('');
    setOutcomeFilter('');
    setIdSearch('');
  }

  function handleSort(column) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortDir(NUMERIC_SORT_COLUMNS.has(column) ? 'desc' : 'asc');
  }

  return (
    <Box>
      {!embedded && (
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <GavelIcon color="primary" />
          <Typography variant="h5" fontWeight="bold">INR API</Typography>
        </Stack>
      )}

      <Stack
        direction="row"
        spacing={1}
        mb={1.5}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Tooltip title="GET /post-order/v2/inquiry/search, GET /post-order/v2/casemanagement/search, GET /sell/fulfillment/v1/payment_dispute_summary">
            <span>
              <Button
                variant="contained"
                size="small"
                startIcon={fetching ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                onClick={fetchFromEbay}
                disabled={fetching || loading}
                sx={yellowFilledButtonSx}
              >
                {fetching ? 'Fetching…' : 'Fetch from eBay'}
              </Button>
            </span>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={loadStored}
            disabled={loading || fetching}
            sx={yellowOutlinedButtonSx}
          >
            Refresh
          </Button>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Seller</InputLabel>
            <Select
              label="Seller"
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
            >
              <MenuItem value="">All sellers</MenuItem>
              {sellers.map((store) => (
                <MenuItem key={store._id} value={store._id}>
                  {store?.user?.username || store._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              {statuses.map((status) => (
                <MenuItem key={status} value={status}>{status}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Outcome</InputLabel>
            <Select
              label="Outcome"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
            >
              <MenuItem value="">All outcomes</MenuItem>
              {outcomes.map((outcome) => (
                <MenuItem key={outcome} value={outcome}>{outcome}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Reason</InputLabel>
            <Select
              label="Reason"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="">All reasons</MenuItem>
              {types.map((type) => (
                <MenuItem key={type.id} value={type.id} title={type.hint}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              label="Marketplace"
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
            >
              <MenuItem value="">All marketplaces</MenuItem>
              {marketplaces.map((marketplace) => (
                <MenuItem key={marketplace} value={marketplace}>{marketplace}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Issue Type</InputLabel>
            <Select
              label="Issue Type"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <MenuItem value="">All issue types</MenuItem>
              <MenuItem value="inquiry">Inquiry ({inquiries.length})</MenuItem>
              <MenuItem value="case">Case Management ({cases.length})</MenuItem>
              <MenuItem value="dispute">Payment Dispute ({disputes.length})</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 230 }}>
            <InputLabel>Action</InputLabel>
            <Select
              label="Action"
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value)}
            >
              <MenuItem value="">All actions</MenuItem>
              <MenuItem value="provide_shipment">
                Provide shipment / tracking ({inquiryActionCounts.provideShipment})
              </MenuItem>
              <MenuItem value="escalate">
                Escalate ({inquiryActionCounts.escalate})
              </MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Issue / Order ID"
            placeholder="Search issue or order ID"
            value={idSearch}
            onChange={(e) => setIdSearch(e.target.value)}
            sx={{ minWidth: 220, width: 240 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={clearFilters}
            disabled={!hasActiveFilters || loading || fetching}
            color="inherit"
            sx={{ textTransform: 'none' }}
          >
            Clear filters
          </Button>
        </Stack>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}

      {loading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <TableContainer
          sx={{
            ...tableContainerSx,
            maxHeight: 640,
            maxWidth: '100%',
            overflow: 'auto',
          }}
        >
          <Table size="small" stickyHeader sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                {SORT_COLUMNS.map((col) => (
                  <SortableHeader
                    key={col.id}
                    id={col.id}
                    label={col.label}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                ))}
                <TableCell sx={actionHeaderSx} align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const tracking = getShipmentTracking(row);
                const dueDate = rowDueDate(row);
                const workflow = inquiryWorkflow(row);
                const overdue = isResponseOverdue(dueDate);
                const urgent = isResponseUrgent(dueDate);
                const tracked = Boolean(tracking.trackingNumber) || sellerProvidedTrackingAction(row);
                const dueAlert = !tracked
                  && (workflow === 'add_tracking' || workflow === 'escalate')
                  && (overdue || urgent);
                const actionFlags = inquiryActionFlags(row);
                const dueOpen = workflow === 'add_tracking';
                const canEscalate = actionFlags.canEscalate;
                const issue = sourceChipProps(row.source);
                const reason = rowReason(row);
                const outcome = rowOutcome(row);
                const protection = rowProtectionStatus(row);
                const sellerAccept = paymentDisputeSellerAccept(row);
                return (
                <TableRow key={`${row.source}-${row._id || row.caseId}`} hover sx={combinedRowSx(row)}>
                  <TableCell sx={denseCellSx}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sellerName(row)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <DateStack value={row.creationDate} />
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <Tooltip
                      title={
                        canEscalate
                          ? 'Overdue — escalate to a Case'
                          : dueOpen && !tracked
                            ? 'Add tracking before this due date or you lose money'
                            : ''
                      }
                    >
                      <span>
                        <DateStack
                          value={dueDate}
                          color={dueAlert ? 'error.main' : 'text.primary'}
                          fontWeight={dueAlert ? 700 : 400}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <Stack spacing={0.15}>
                      <Chip
                        size="small"
                        label={issue.label}
                        color={issue.color}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem', width: 'fit-content' }}
                      />
                      <Tooltip title={reason || ''}>
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.2 }}>
                          {row.mergedFromInquiry
                            ? `${reasonShort(reason) || 'INR'} · Inquiry → Case`
                            : reasonShort(reason)}
                        </Typography>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <CopyText value={row.caseId} secondary />
                    <CopyText value={rowOrderId(row)} />
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <Tooltip title={marketplaceLabel(row)}>
                      <span>{marketplaceShort(row)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.buyerUsername || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    {(() => {
                      const itemId = rowItemId(row);
                      const picture = rowItemPictureUrl(row);
                      return (
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          {picture ? (
                            <Box
                              component="img"
                              src={picture}
                              alt=""
                              referrerPolicy="no-referrer"
                              sx={{
                                width: 36,
                                height: 36,
                                objectFit: 'cover',
                                borderRadius: 0.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                flexShrink: 0,
                                bgcolor: 'grey.100',
                              }}
                            />
                          ) : null}
                          <Stack spacing={0.1} sx={{ minWidth: 0 }}>
                            <CopyText value={itemId} />
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                              {formatAmount(rowItemPrice(row))}
                            </Typography>
                          </Stack>
                        </Stack>
                      );
                    })()}
                  </TableCell>
                  <TableCell sx={denseCellSx}>
                    <Stack spacing={0.15}>
                      <Chip
                        size="small"
                        label={statusShort(rowStatus(row))}
                        color={statusColor(rowStatus(row))}
                        sx={{ height: 18, fontSize: '0.62rem', maxWidth: 140, '& .MuiChip-label': { px: 0.6, overflow: 'hidden', textOverflow: 'ellipsis' } }}
                      />
                      {sellerAccept ? (
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.2 }}>
                          {sellerAccept}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ ...denseCellSx, whiteSpace: 'normal', minWidth: 132 }}>
                    <Stack spacing={0.15}>
                      <Chip
                        size="small"
                        label={outcome || 'No result'}
                        color={outcomeColor(outcome)}
                        variant={outcome === 'Won' || outcome === 'Lose' ? 'filled' : 'outlined'}
                        sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, width: 'fit-content' }}
                      />
                      {protection ? (
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', whiteSpace: 'normal', lineHeight: 1.2 }}>
                          {formatProtectionStatus(protection)}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ ...denseCellSx, whiteSpace: 'normal' }}>
                    <ShippingCell row={row} />
                  </TableCell>
                  <TableCell sx={{ ...denseCellSx, whiteSpace: 'normal', minWidth: 128 }}>
                    {tracked ? (
                      <Stack spacing={0.1}>
                        <CopyText value={tracking.trackingNumber} />
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {[tracking.carrier, tracking.currentStatus].filter(Boolean).join(' · ') || '—'}
                        </Typography>
                        {tracking.estimateFromDate ? (
                          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                            Est {formatDateParts(tracking.estimateFromDate)?.date}
                          </Typography>
                        ) : null}
                        <Button
                          size="small"
                          href={`https://www.aftership.com/track/${encodeURIComponent(tracking.trackingNumber)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                          sx={{ textTransform: 'none', px: 0, minWidth: 0, minHeight: 0, py: 0, fontSize: '0.68rem', justifyContent: 'flex-start' }}
                        >
                          Track
                        </Button>
                      </Stack>
                    ) : '—'}
                  </TableCell>
                  <TableCell sx={{ ...denseCellSx, whiteSpace: 'normal', minWidth: 150 }}>
                    <NotesCell
                      row={row}
                      onSave={saveInquiryNotes}
                      onNotify={handleNotify}
                    />
                  </TableCell>
                  <TableCell sx={actionCellSx} align="right">
                    <Stack direction="row" spacing={0} justifyContent="flex-end" sx={{ flexWrap: 'nowrap' }}>
                      <Tooltip title="View">
                        <IconButton size="small" onClick={() => openDetail(row)} sx={{ p: 0.4 }}>
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      {row.source === 'inquiry' && workflow !== 'closed' ? (
                        <>
                          {actionFlags.showShip ? (
                          <Tooltip
                            title={dueOpen && !tracked
                              ? 'Add tracking before the response due date or you will lose money'
                              : 'Provide shipment / tracking info'}
                          >
                            <span>
                              <IconButton
                                size="small"
                                disabled={actionBusyId === row.caseId}
                                onClick={() => openShipDialog(row)}
                                sx={{
                                  p: 0.4,
                                  ...(dueOpen && !tracked ? {
                                    color: '#111',
                                    bgcolor: '#F5C518',
                                    '&:hover': { bgcolor: '#e0b410' },
                                  } : {}),
                                }}
                              >
                                <LocalShippingIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          ) : null}
                          <Tooltip
                            title={canEscalate
                              ? 'Escalate this inquiry. It will become a Case.'
                              : 'Escalate after the response due date. Add tracking first or you will lose money.'}
                          >
                            <span>
                              <IconButton
                                size="small"
                                color="warning"
                                disabled={actionBusyId === row.caseId || !canEscalate}
                                onClick={() => openEscalateDialog(row)}
                                sx={{
                                  p: 0.4,
                                  ...(canEscalate ? {
                                    bgcolor: 'warning.main',
                                    color: '#fff',
                                    '&:hover': { bgcolor: 'warning.dark' },
                                  } : {}),
                                }}
                              >
                                <TrendingUpIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      ) : null}
                      <Tooltip title="Open chat / manage">
                        <IconButton size="small" onClick={() => setSelectedCase(row)} sx={{ p: 0.4 }}>
                          <ChatIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
                );
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                    No inquiries, cases, or payment disputes found. Click Fetch from eBay.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={shipDialog.open}
        onClose={closeShipDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ pb: 1 }}>
          {shipDialog.trackingNumber ? 'Send tracking' : 'Add tracking'}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 400, mt: 0.25 }}>
            Inquiry {shipDialog.row?.caseId || '—'}
            {rowOrderId(shipDialog.row) ? ` · Order ${rowOrderId(shipDialog.row)}` : ''}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {(() => {
            const due = rowDueDate(shipDialog.row);
            const overdue = isResponseOverdue(due);
            const hasTracking = Boolean(shipDialog.trackingNumber);
            if (hasTracking && !overdue) {
              return (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  Tracking is already on this order. Send it to eBay for this inquiry
                  {due ? ` before ${formatDate(due)} PT` : ''}.
                </Alert>
              );
            }
            return (
              <Alert severity={overdue ? 'error' : 'warning'} sx={{ mb: 1.5 }}>
                {overdue
                  ? `Response due date has passed${due ? ` (${formatDate(due)} PT)` : ''}. Send tracking now or escalate.`
                  : `Send tracking before ${due ? `${formatDate(due)} PT` : 'the response due date'} or you will lose money.`}
              </Alert>
            );
          })()}
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              submitShipmentInfo();
            }}
          >
            <Stack spacing={1.5}>
              <TextField
                label="Tracking number"
                required
                autoFocus
                fullWidth
                size="small"
                value={shipDialog.trackingNumber}
                onChange={(e) => {
                  const trackingNumber = cleanTrackingNumber(e.target.value);
                  const guessed = guessCarrierFromTracking(trackingNumber);
                  setShipDialog((d) => ({
                    ...d,
                    trackingNumber,
                    carrier: guessed || d.carrier,
                  }));
                }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Carrier</InputLabel>
                  <Select
                    label="Carrier"
                    value={shipDialog.carrier}
                    onChange={(e) => setShipDialog((d) => ({ ...d, carrier: e.target.value }))}
                  >
                    {SHIP_CARRIERS.map((carrier) => (
                      <MenuItem key={carrier} value={carrier}>{carrier}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Shipped date"
                  type="date"
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={shipDialog.shippedDate}
                  onChange={(e) => setShipDialog((d) => ({ ...d, shippedDate: e.target.value }))}
                />
              </Stack>
              {shipDialog.showComments ? (
                <TextField
                  label="Comments to buyer (optional)"
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  value={shipDialog.comments}
                  onChange={(e) => setShipDialog((d) => ({ ...d, comments: e.target.value }))}
                />
              ) : (
                <Button
                  size="small"
                  onClick={() => setShipDialog((d) => ({ ...d, showComments: true }))}
                  sx={{ alignSelf: 'flex-start', px: 0 }}
                >
                  Add a comment
                </Button>
              )}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeShipDialog} disabled={Boolean(actionBusyId)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitShipmentInfo}
            disabled={Boolean(actionBusyId) || !shipDialog.trackingNumber.trim() || !shipDialog.carrier}
            startIcon={actionBusyId ? <CircularProgress size={14} color="inherit" /> : <LocalShippingIcon />}
          >
            {actionBusyId ? 'Sending…' : 'Send tracking'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={escalateDialog.open}
        onClose={() => !actionBusyId && setEscalateDialog({ open: false, row: null, comments: '' })}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Escalate inquiry to case</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            After the response due date, escalate this inquiry. It becomes a Case.
          </Alert>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Reason"
              fullWidth
              size="small"
              value="Shipped item"
              disabled
            />
            <TextField
              label="Comments"
              required
              fullWidth
              size="small"
              multiline
              minRows={3}
              value={escalateDialog.comments}
              onChange={(e) => setEscalateDialog((d) => ({ ...d, comments: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEscalateDialog({ open: false, row: null, comments: '' })}
            disabled={Boolean(actionBusyId)}
          >
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={submitEscalate}
            disabled={Boolean(actionBusyId) || !escalateDialog.comments.trim()}
          >
            {actionBusyId ? 'Escalating…' : 'Escalate'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={detail.open}
        onClose={() => setDetail((d) => ({ ...d, open: false }))}
        fullWidth
        maxWidth={detail.showJson ? 'md' : 'sm'}
      >
        <DialogTitle sx={{ pb: 1 }}>{detail.title}</DialogTitle>
        <DialogContent>
          {detail.loading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : detail.error ? (
            <Alert severity="error">{typeof detail.error === 'string' ? detail.error : JSON.stringify(detail.error)}</Alert>
          ) : detail.showJson ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: '#f6f8fa',
                borderRadius: 1,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 480,
              }}
            >
              {JSON.stringify(detail.data, null, 2)}
            </Box>
          ) : (
            <IssueDetailView data={detail.data} row={detail.row} />
          )}
        </DialogContent>
        <DialogActions>
          {detail.data && !detail.loading && !detail.error ? (
            <Button onClick={() => setDetail((d) => ({ ...d, showJson: !d.showJson }))}>
              {detail.showJson ? 'Readable view' : 'View JSON'}
            </Button>
          ) : null}
          <Button onClick={() => setDetail((d) => ({ ...d, open: false }))}>Close</Button>
        </DialogActions>
      </Dialog>

      {selectedCase && (
        <ChatModal
          open={Boolean(selectedCase)}
          onClose={() => setSelectedCase(null)}
          orderId={rowOrderId(selectedCase)}
          buyerUsername={selectedCase.buyerUsername}
          itemId={rowItemId(selectedCase)}
          itemTitle={selectedCase.itemTitle || ''}
          sellerId={selectedCase.seller?._id || selectedCase.seller || null}
          sellerName={sellerName(selectedCase)}
          title={`Manage ${selectedCase.source === 'dispute' ? 'Payment Dispute' : selectedCase.source === 'inquiry' ? 'Inquiry' : 'Case'}`}
          category={selectedCase.source === 'dispute' ? 'Payment Dispute' : 'INR'}
          caseStatus={rowStatus(selectedCase)}
          entityId={selectedCase.caseId || selectedCase.paymentDisputeId}
          entityType="inr"
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={8000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
