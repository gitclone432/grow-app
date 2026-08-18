import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Button,
  Snackbar,
  TextField,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CommentIcon from '@mui/icons-material/Comment';
import ChatIcon from '@mui/icons-material/Chat';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import { format } from 'date-fns';
import api from '../../lib/api';
import ChatModal from '../../components/ChatModal';
import OrderDetailsModal from '../../components/OrderDetailsModal';

const BOARD_CATEGORIES = [
  { value: 'order_fulfillment', label: 'Order Fulfillment' },
  { value: 'order_communication', label: 'Order Communication' },
  { value: 'issue_hub', label: 'Issue Hub' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'inr', label: 'INR (Item Not Received)' },
  { value: 'return_refund', label: 'Return / Refund' },
];

const COLUMN_STATUS = {
  TODO: 'todo',
  OUT_OF_STOCK: 'out_of_stock',
  CANCELLATION: 'cancellation',
  ADDRESS_ISSUE: 'address_issue',
  LATE_DELIVERY: 'late_delivery',
  NOT_FULFILLED: 'not_fulfilled',
  FULFILLED: 'fulfilled',
  BUYER_CONFIRMATION: 'buyer_confirmation',
  // Return/Refund statuses
  CASE_OPENED: 'case_opened',
  CASE_NOT_OPENED: 'case_not_opened',
  RETURN_FOLLOW_UP: 'return_follow_up',
  PROVIDE_RETURN_LABEL: 'provide_return_label',
  BUYER_DROP_OFF: 'buyer_drop_off',
  ITEM_DELIVERED: 'item_delivered',
  PARTIAL_REFUND: 'partial_refund',
  FULL_REFUND: 'full_refund',
  REPLACEMENT: 'replacement',
  // Cancellation statuses
  CANCELLATION_REQUEST: 'cancellation_request',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  // INR statuses
  INR_CASE_OPENED: 'inr_case_opened',
  INR_FOLLOW_UP: 'inr_follow_up',
  INR_TRACKING_ID_UPLOAD: 'inr_tracking_id_upload',
  INR_CASE_OPEN_EBAY_STEP_IN: 'inr_case_open_ebay_step_in',
  INR_FULLY_REFUNDED: 'inr_fully_refunded',
  INR_PARTIAL_REFUND: 'inr_partial_refund',
  INR_NOT_REFUNDED_RESOLVED: 'inr_not_refunded_resolved',
};

// Message categories for Order Communication
const MESSAGE_CATEGORIES = {
  ALL_MESSAGES: 'all_messages',
  ON_HOLD: 'On Hold',
  INR: 'INR',
  CANCELLATION: 'Cancellation',
  RETURN_REFUND_REPLACE: 'Return',
  OUT_OF_STOCK: 'Out of Stock',
  ISSUE_WITH_PRODUCT: 'Issue with Product',
  ISSUE_WITH_DELIVERY: 'Issue with Delivery',
  INQUIRY: 'Inquiry',
};

const ISSUE_HUB_MESSAGE_COLUMNS = new Set([
  MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT,
  MESSAGE_CATEGORIES.INQUIRY,
]);

const ORDER_COMMUNICATION_WORK_OPTIONS = [
  { id: MESSAGE_CATEGORIES.ON_HOLD, label: 'On Hold', color: '#64748b' },
  { id: MESSAGE_CATEGORIES.INR, label: 'INR', color: '#ef4444' },
  { id: MESSAGE_CATEGORIES.CANCELLATION, label: 'Cancellation', color: '#f97316' },
  { id: MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE, label: 'Return / Refund / Replace', color: '#8b5cf6' },
  { id: MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT, label: 'Issue with Product', color: '#ea580c' },
  { id: MESSAGE_CATEGORIES.INQUIRY, label: 'Inquiry', color: '#10b981' },
];

const ORDER_FULFILLMENT_ISSUE_OPTIONS = [
  { id: COLUMN_STATUS.OUT_OF_STOCK, label: 'Out of Stock', color: '#f97316' },
  { id: COLUMN_STATUS.CANCELLATION, label: 'Cancellation', color: '#3b82f6' },
  { id: COLUMN_STATUS.ADDRESS_ISSUE, label: 'Address Issue', color: '#a855f7' },
  { id: COLUMN_STATUS.LATE_DELIVERY, label: 'Late Delivery', color: '#dc2626' },
];

const ORDER_FULFILLMENT_PROGRESS_OPTIONS = [
  { id: COLUMN_STATUS.NOT_FULFILLED, label: 'Not Fulfilled', color: '#f59e0b' },
  { id: COLUMN_STATUS.FULFILLED, label: 'Fulfilled', color: '#10b981' },
  { id: COLUMN_STATUS.BUYER_CONFIRMATION, label: 'Buyer Confirmation', color: '#0f766e' },
];

const RETURN_FLOW_OPTIONS = [
  { id: COLUMN_STATUS.RETURN_FOLLOW_UP, label: 'Follow Up', color: '#8b5cf6' },
  { id: COLUMN_STATUS.PROVIDE_RETURN_LABEL, label: 'Provide Return Label', color: '#3b82f6' },
  { id: COLUMN_STATUS.BUYER_DROP_OFF, label: 'Buyer Drop Off', color: '#a855f7' },
  { id: COLUMN_STATUS.ITEM_DELIVERED, label: 'Item Delivered', color: '#06b6d4' },
];

const RETURN_CASE_OPENED_OPTIONS = [
  { id: COLUMN_STATUS.CASE_OPENED, label: 'Case Opened', color: '#ef4444' },
  { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: '#f97316' },
];

const RETURN_CASE_NOT_OPENED_OPTIONS = [
  { id: COLUMN_STATUS.CASE_OPENED, label: 'Case Opened', color: '#ef4444' },
  { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: '#f97316' },
  { id: COLUMN_STATUS.RETURN_FOLLOW_UP, label: 'Follow Up', color: '#8b5cf6' },
  { id: COLUMN_STATUS.PROVIDE_RETURN_LABEL, label: 'Provide Return Label', color: '#3b82f6' },
  { id: COLUMN_STATUS.BUYER_DROP_OFF, label: 'Buyer Drop Off', color: '#a855f7' },
  { id: COLUMN_STATUS.ITEM_DELIVERED, label: 'Item Delivered', color: '#06b6d4' },
];

const RETURN_RESOLUTION_OPTIONS = [
  { id: COLUMN_STATUS.PARTIAL_REFUND, label: 'Partial Refund', color: '#f59e0b' },
  { id: COLUMN_STATUS.FULL_REFUND, label: 'Full Refund', color: '#10b981' },
  { id: COLUMN_STATUS.REPLACEMENT, label: 'Replacement', color: '#0f766e' },
];

const CANCELLATION_DECISION_OPTIONS = [
  { id: COLUMN_STATUS.ACCEPTED, label: 'Accepted', color: '#10b981' },
  { id: COLUMN_STATUS.DECLINED, label: 'Declined', color: '#f97316' },
];

const INR_REFUND_OPTIONS = [
  { id: COLUMN_STATUS.INR_FULLY_REFUNDED, label: 'Fully Refunded', color: '#10b981' },
  { id: COLUMN_STATUS.INR_PARTIAL_REFUND, label: 'Partial Refund', color: '#f59e0b' },
  { id: COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED, label: 'Not Refunded but Resolved', color: '#3b82f6' },
];

const INR_ACTION_OPTIONS = [
  { id: COLUMN_STATUS.INR_FOLLOW_UP, label: 'Follow Up', color: '#8b5cf6' },
  { id: COLUMN_STATUS.INR_TRACKING_ID_UPLOAD, label: 'Tracking ID Upload', color: '#06b6d4' },
  { id: COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN, label: 'Case Open (Ebay Step In)', color: '#ef4444' },
];

const INR_PRIMARY_VIEW_OPTIONS = [
  { id: COLUMN_STATUS.INR_CASE_OPENED, label: 'Case Opened', color: '#ef4444' },
  { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: '#f97316' },
];

const INR_SECONDARY_VIEW_OPTIONS = [
  { id: COLUMN_STATUS.INR_CASE_OPENED, label: 'Case Opened', color: '#ef4444' },
  { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: '#f97316' },
  { id: COLUMN_STATUS.INR_FOLLOW_UP, label: 'Follow Up', color: '#8b5cf6' },
  { id: COLUMN_STATUS.INR_TRACKING_ID_UPLOAD, label: 'Tracking ID Upload', color: '#06b6d4' },
  { id: COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN, label: 'Case Open (Ebay Step In)', color: '#ef4444' },
];

const INR_VIEW_IDS = {
  PRIMARY: 'inr_view_primary',
  SECONDARY: 'inr_view_secondary',
  ACTION: 'inr_view_action',
  REFUND: 'inr_view_refund',
};

const BRAND_YELLOW = '#fbbf24';
const BRAND_YELLOW_DARK = '#f59e0b';
const BRAND_DARK = '#1e293b';
const BRAND_RED = '#ef4444';
const BRAND_ORANGE = '#f97316';
const BRAND_BLUE = '#3b82f6';
const BRAND_GREEN = '#10b981';
const FILTER_SWITCH_SX = {
  m: 0,
  px: 1,
  width: '100%',
  minHeight: 56,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.5,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1.5,
  boxSizing: 'border-box',
  '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
  '& .MuiSwitch-root': { transform: 'scale(0.85)' },
};
const FILTER_CONTROL_SX = {
  width: { xs: '100%', sm: 220, md: 220 },
  '& .MuiInputBase-root': {
    height: 56,
  },
};
const FILTER_ACTION_SX = {
  width: { xs: '100%', sm: 220, md: 220 },
  height: 56,
};
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const RETURN_LABEL_SLA_MS = 48 * ONE_HOUR_MS;
const MESSAGE_REPLY_SLA_MS = 8 * ONE_HOUR_MS;
const RETURN_LABEL_OVERDUE_ALERT_ID = 'return_label_overdue';
const PAYMENT_STATUS_OVERDUE_ALERT_ID = 'payment_status_overdue';
const MESSAGE_OVERDUE_ALERT_ID = 'message_overdue';
const FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS = {
  [COLUMN_STATUS.OUT_OF_STOCK]: 'fulfillment_out_of_stock_overdue',
  [COLUMN_STATUS.CANCELLATION]: 'fulfillment_cancellation_overdue',
  [COLUMN_STATUS.ADDRESS_ISSUE]: 'fulfillment_address_issue_overdue',
  [COLUMN_STATUS.LATE_DELIVERY]: 'fulfillment_late_delivery_overdue',
};
const FULFILLMENT_ISSUE_STATUS_BY_ALERT_ID = Object.entries(FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS)
  .reduce((acc, [status, alertId]) => ({ ...acc, [alertId]: status }), {});

const ISSUE_HUB_OPTIONS = [
  { id: COLUMN_STATUS.OUT_OF_STOCK, label: 'Out of Stock', type: 'order', color: BRAND_ORANGE },
  { id: COLUMN_STATUS.ADDRESS_ISSUE, label: 'Address Issue', type: 'order', color: '#a855f7' },
  { id: COLUMN_STATUS.LATE_DELIVERY, label: 'Late Delivery', type: 'order', color: '#dc2626' },
  { id: MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT, label: 'Issue with Product', type: 'message', color: '#ea580c' },
  { id: MESSAGE_CATEGORIES.INQUIRY, label: 'Inquiry', type: 'message', color: BRAND_GREEN },
];

// Limit items per column to improve performance and reduce lag
const MAX_ITEMS_PER_COLUMN = 8;
const INITIAL_LOAD_LIMIT = 50; // Only load first 50 items per fetch instead of 500
const LOAD_MORE_STEP = 8;
const MESSAGE_THREAD_LIMIT = 500;
const MESSAGE_THREAD_MAX_AGE_DAYS = 45;
const BOARD_REQUEST_TIMEOUT_MS = 30000;
const ALERT_REQUEST_TIMEOUT_MS = 12000;

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const toDraggableId = (prefix, item, fallback = '') => {
  // For special case types (return, cancelled, inr), prepend the prefix to the ID
  if (prefix === 'return' && (item?.returnId || fallback)) {
    return `return:${item?.returnId || fallback}`;
  }
  if (prefix === 'cancellation' && (item?.cancelId || fallback)) {
    return `cancelled:${item?.cancelId || fallback}`;
  }
  if (prefix === 'inr' && (item?.caseId || fallback)) {
    return `inr:${item?.caseId || fallback}`;
  }
  // For regular orders and other types, return the ID as-is
  return String(item?._id || item?.orderObjectId || item?.orderId || item?.caseId || item?.returnId || fallback || `${prefix}-${Date.now()}`);
};

const formatDateSoldPT = (dateValue) => {
  if (!dateValue) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(new Date(dateValue));
  } catch {
    return '';
  }
};

const cleanMessagePreviewText = (body = '') => {
  let text = String(body)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&copy;/g, '(c)');

  const markers = [
    '@media only screen',
    '@-moz-document',
    'body[yahoo]',
    'td.wraptext',
    '.externalclass',
    '.readmsgbody',
    'mso-table-lspace'
  ];
  const markerIndex = markers
    .map((marker) => text.toLowerCase().indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (markerIndex !== undefined) text = text.slice(0, markerIndex);

  const footerIndex = [
    'Order status:',
    'We scan messages to enforce policies.',
    'Email reference id:',
    "We don't check this mailbox",
    'eBay sent this message to',
    'eBay is committed to your privacy'
  ]
    .map((marker) => text.toLowerCase().indexOf(marker.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (footerIndex !== undefined) text = text.slice(0, footerIndex);

  text = text.replace(/\bNew message:\s*New message\b/gi, '').replace(/\s+/g, ' ').trim();
  const cssSignalCount = ['!important', '{', '}', 'padding:', 'width:', 'font-family:', 'word-wrap:']
    .filter((token) => text.toLowerCase().includes(token)).length;

  return cssSignalCount >= 3 ? '' : text;
};

// Helper function to check if all 6 fulfillment fields are complete
const isOrderFulfillmentComplete = (order) => {
  const hasAllFields = 
    order?.amazonAccount &&
    order?.amazonAccount !== '' &&
    order?.arrivingDate &&
    order?.arrivingDate !== '' &&
    order?.beforeTax !== null &&
    order?.beforeTax !== '' &&
    order?.beforeTax !== undefined &&
    order?.beforeTax !== 0 &&
    order?.estimatedTax !== null &&
    order?.estimatedTax !== '' &&
    order?.estimatedTax !== undefined &&
    order?.azOrderId &&
    order?.azOrderId !== '' &&
    order?.remark &&
    order?.remark !== '';
  
  return hasAllFields;
};

const getMissingFulfillmentFields = (order) => {
  const missing = [];
  if (!order?.amazonAccount || order.amazonAccount === '') missing.push('Amazon Account');
  if (!order?.arrivingDate || order.arrivingDate === '') missing.push('Arriving Date');
  if (order?.beforeTax === null || order?.beforeTax === '' || order?.beforeTax === undefined) missing.push('Before Tax');
  if (order?.estimatedTax === null || order?.estimatedTax === '' || order?.estimatedTax === undefined) missing.push('Estimated Tax');
  if (!order?.azOrderId || order.azOrderId === '') missing.push('Az Order ID');
  if (!order?.remark || order.remark === '') missing.push('Remark');
  return missing;
};

const createEmptyDateFilter = () => ({
  mode: 'none',
  single: '',
  from: '',
  to: ''
});

function ComplianceBoardPage() {
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const [selectedCategory, setSelectedCategory] = useState('order_fulfillment');
  const [dateFilter, setDateFilter] = useState(createEmptyDateFilter);
  const [draftDateFilter, setDraftDateFilter] = useState(createEmptyDateFilter);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [draftSearchOrderId, setDraftSearchOrderId] = useState('');
  const [searchBuyerName, setSearchBuyerName] = useState('');
  const [draftSearchBuyerName, setDraftSearchBuyerName] = useState('');
  const [excludeClient, setExcludeClient] = useState(true);
  const [draftExcludeClient, setDraftExcludeClient] = useState(true);
  const [excludeLowValue, setExcludeLowValue] = useState(true);
  const [draftExcludeLowValue, setDraftExcludeLowValue] = useState(true);
  const [statusCounts, setStatusCounts] = useState({});
  const [overdueCounts, setOverdueCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState({
    [COLUMN_STATUS.TODO]: [],
    [COLUMN_STATUS.OUT_OF_STOCK]: [],
    [COLUMN_STATUS.CANCELLATION]: [],
    [COLUMN_STATUS.ADDRESS_ISSUE]: [],
    [COLUMN_STATUS.LATE_DELIVERY]: [],
    [COLUMN_STATUS.NOT_FULFILLED]: [],
    [COLUMN_STATUS.FULFILLED]: [],
    [COLUMN_STATUS.BUYER_CONFIRMATION]: [],
    // Return/Refund columns
    [COLUMN_STATUS.CASE_OPENED]: [],
    [COLUMN_STATUS.CASE_NOT_OPENED]: [],
    [COLUMN_STATUS.RETURN_FOLLOW_UP]: [],
    [COLUMN_STATUS.PROVIDE_RETURN_LABEL]: [],
    [COLUMN_STATUS.BUYER_DROP_OFF]: [],
    [COLUMN_STATUS.ITEM_DELIVERED]: [],
    [COLUMN_STATUS.PARTIAL_REFUND]: [],
    [COLUMN_STATUS.FULL_REFUND]: [],
    [COLUMN_STATUS.REPLACEMENT]: [],
    // Cancellation columns
    [COLUMN_STATUS.CANCELLATION_REQUEST]: [],
    [COLUMN_STATUS.ACCEPTED]: [],
    [COLUMN_STATUS.DECLINED]: [],
    // INR columns
    [COLUMN_STATUS.INR_CASE_OPENED]: [],
    [COLUMN_STATUS.INR_FOLLOW_UP]: [],
    [COLUMN_STATUS.INR_TRACKING_ID_UPLOAD]: [],
    [COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN]: [],
    [COLUMN_STATUS.INR_FULLY_REFUNDED]: [],
    [COLUMN_STATUS.INR_PARTIAL_REFUND]: [],
    [COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED]: [],
  });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 500, totalPages: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [boardSourceCounts, setBoardSourceCounts] = useState({});

  // Summary/Alert statistics
  const [summary, setSummary] = useState({
    total: 0,
    todo: 0,
    outOfStock: 0,
    cancellation: 0,
    addressIssue: 0,
    notFulfilled: 0,
    fulfilled: 0,
    buyerConfirmation: 0
  });

  // Message modal state
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);

  // Activity logs modal state
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedOrderForLogs, setSelectedOrderForLogs] = useState(null);
  const [selectedOrderDetailsId, setSelectedOrderDetailsId] = useState(null);
  const [selectedOrderDetailsCanEditFulfillment, setSelectedOrderDetailsCanEditFulfillment] = useState(false);
  const [orderActivityLogs, setOrderActivityLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Order Communication specific state
  const [messages, setMessages] = useState({
    [MESSAGE_CATEGORIES.ALL_MESSAGES]: [],
    [MESSAGE_CATEGORIES.ON_HOLD]: [],
    [MESSAGE_CATEGORIES.INR]: [],
    [MESSAGE_CATEGORIES.CANCELLATION]: [],
    [MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE]: [],
    [MESSAGE_CATEGORIES.OUT_OF_STOCK]: [],
    [MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT]: [],
    [MESSAGE_CATEGORIES.ISSUE_WITH_DELIVERY]: [],
    [MESSAGE_CATEGORIES.INQUIRY]: [],
  });
  const [copiedText, setCopiedText] = useState('');
  const [sellers, setSellers] = useState([]);
  const [pendingOrderMoves, setPendingOrderMoves] = useState({});
  const [pendingMessageMoves, setPendingMessageMoves] = useState({});
  const [applyingColumns, setApplyingColumns] = useState({});
  const [visibleOrderCounts, setVisibleOrderCounts] = useState({});
  const [visibleMessageCounts, setVisibleMessageCounts] = useState({});
  const [issueHubSourceCategory, setIssueHubSourceCategory] = useState(COLUMN_STATUS.OUT_OF_STOCK);
  const [issueHubWorkspaceCategory, setIssueHubWorkspaceCategory] = useState(COLUMN_STATUS.OUT_OF_STOCK);
  const [orderCommunicationWorkCategory, setOrderCommunicationWorkCategory] = useState(MESSAGE_CATEGORIES.ON_HOLD);
  const [fulfillmentIssueCategory, setFulfillmentIssueCategory] = useState(COLUMN_STATUS.OUT_OF_STOCK);
  const [fulfillmentProgressCategory, setFulfillmentProgressCategory] = useState(COLUMN_STATUS.NOT_FULFILLED);
  const [showOnlyUnreadMessages, setShowOnlyUnreadMessages] = useState(false);
  const [returnCaseOpenedCategory, setReturnCaseOpenedCategory] = useState(COLUMN_STATUS.CASE_OPENED);
  const [returnCaseNotOpenedCategory, setReturnCaseNotOpenedCategory] = useState(COLUMN_STATUS.CASE_NOT_OPENED);
  const [returnFlowCategory, setReturnFlowCategory] = useState(COLUMN_STATUS.PROVIDE_RETURN_LABEL);
  const [returnResolutionCategory, setReturnResolutionCategory] = useState(COLUMN_STATUS.PARTIAL_REFUND);
  const [cancellationDecisionCategory, setCancellationDecisionCategory] = useState(COLUMN_STATUS.ACCEPTED);
  const [inrPrimaryCategory, setInrPrimaryCategory] = useState(COLUMN_STATUS.INR_CASE_OPENED);
  const [inrSecondaryCategory, setInrSecondaryCategory] = useState(COLUMN_STATUS.CASE_NOT_OPENED);
  const [inrActionCategory, setInrActionCategory] = useState(COLUMN_STATUS.INR_FOLLOW_UP);
  const [inrRefundCategory, setInrRefundCategory] = useState(COLUMN_STATUS.INR_FULLY_REFUNDED);
  const [activeAlertPreviewId, setActiveAlertPreviewId] = useState(null);
  const [alertPreviewItems, setAlertPreviewItems] = useState(null);
  const [alertPreviewLoading, setAlertPreviewLoading] = useState(false);
  const [allMessagesForAlerts, setAllMessagesForAlerts] = useState([]);
  const [chatAgents, setChatAgents] = useState([]);
  const [savingPickedUpByKey, setSavingPickedUpByKey] = useState('');

  // Stats section states
  const [showStats, setShowStats] = useState(true);
  const [statsDateFilter, setStatsDateFilter] = useState(createEmptyDateFilter());
  const [draftStatsDateFilter, setDraftStatsDateFilter] = useState(createEmptyDateFilter());
  const [statsCounts, setStatsCounts] = useState({
    todo: 0,
    outOfStock: 0,
    cancellation: 0,
    addressIssue: 0,
    lateDelivery: 0,
    notFulfilled: 0,
    fulfilled: 0,
    buyerConfirmation: 0
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsDetailsModal, setStatsDetailsModal] = useState({ open: false, statType: null, items: [] });

  const buildDateParams = () => {
    const params = {};
    if (dateFilter.mode === 'single' && dateFilter.single) {
      params.startDate = dateFilter.single;
      params.endDate = dateFilter.single;
    } else if (dateFilter.mode === 'range') {
      if (dateFilter.from) params.startDate = dateFilter.from;
      if (dateFilter.to) params.endDate = dateFilter.to;
    }
    return params;
  };

  const buildMessageDateParams = () => {
    const params = {};
    if (dateFilter.mode === 'single' && dateFilter.single) {
      params.dateFrom = dateFilter.single;
      params.dateTo = dateFilter.single;
    } else if (dateFilter.mode === 'range') {
      if (dateFilter.from) params.dateFrom = dateFilter.from;
      if (dateFilter.to) params.dateTo = dateFilter.to;
    }
    return params;
  };

  const buildBoardFilterParams = () => {
    const params = {};
    if (selectedSeller) params.sellerId = selectedSeller;
    if (searchOrderId.trim()) params.searchOrderId = searchOrderId.trim();
    if (searchBuyerName.trim()) params.searchBuyerName = searchBuyerName.trim();
    params.excludeClient = excludeClient;
    // Don't apply excludeLowValue for compliance boards (INR, Cancellation, Return) - these are customer support issues that need attention regardless of value
    // Also disable when searching for specific orders - user wants to see the searched order regardless of value
    const isComplianceBoard = ['inr', 'cancellation', 'return_refund'].includes(selectedCategory);
    params.excludeLowValue = (isComplianceBoard || searchOrderId.trim() || searchBuyerName.trim()) ? false : excludeLowValue;
    return params;
  };

  // Fetch stats based on date filter
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('category', selectedCategory);
      
      if (statsDateFilter.mode === 'single' && statsDateFilter.single) {
        params.append('startDate', statsDateFilter.single);
        params.append('endDate', statsDateFilter.single);
      } else if (statsDateFilter.mode === 'range') {
        if (statsDateFilter.from) params.append('startDate', statsDateFilter.from);
        if (statsDateFilter.to) params.append('endDate', statsDateFilter.to);
      }
      
      if (selectedSeller) params.append('sellerId', selectedSeller);
      if (excludeClient) params.append('excludeClient', 'true');
      if (excludeLowValue) params.append('excludeLowValue', 'true');
      
      console.log(`[STATS-FETCH] Calling /orders/stats with params:`, params.toString());
      
      const { data } = await api.get(`/orders/stats?${params.toString()}`);
      
      console.log(`[STATS-FETCH] Response:`, data);
      
      setStatsCounts({
        todo: data.todo || 0,
        outOfStock: data.outOfStock || 0,
        cancellation: data.cancellation || 0,
        addressIssue: data.addressIssue || 0,
        lateDelivery: data.lateDelivery || 0,
        notFulfilled: data.notFulfilled || 0,
        fulfilled: data.fulfilled || 0,
        buyerConfirmation: data.buyerConfirmation || 0
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [statsDateFilter, selectedSeller, excludeClient, excludeLowValue, selectedCategory]);

  // Fetch stats details for modal
  const fetchStatsDetails = useCallback(async (statType) => {
    console.log('[STATS-DETAILS-BADGE] Badge clicked with statType:', statType);
    setStatsDetailsModal(prev => ({ ...prev, open: true, statType, items: [] }));
    
    try {
      const params = new URLSearchParams();
      params.append('status', statType);
      params.append('category', selectedCategory);
      
      if (statsDateFilter.mode === 'single' && statsDateFilter.single) {
        params.append('startDate', statsDateFilter.single);
        params.append('endDate', statsDateFilter.single);
      } else if (statsDateFilter.mode === 'range') {
        if (statsDateFilter.from) params.append('startDate', statsDateFilter.from);
        if (statsDateFilter.to) params.append('endDate', statsDateFilter.to);
      }
      
      if (selectedSeller) params.append('sellerId', selectedSeller);
      if (excludeClient) params.append('excludeClient', 'true');
      if (excludeLowValue) params.append('excludeLowValue', 'true');
      
      const url = `/orders/stats-details?${params.toString()}`;
      console.log('[STATS-DETAILS-BADGE] Fetching from:', url);
      const { data } = await api.get(url);
      console.log('[STATS-DETAILS-BADGE] Received data:', data);
      
      setStatsDetailsModal(prev => ({ ...prev, items: data.items || [] }));
    } catch (err) {
      console.error('[STATS-DETAILS-BADGE] Error fetching stats details:', err);
      setStatsDetailsModal(prev => ({ ...prev, items: [] }));
    }
  }, [statsDateFilter, selectedSeller, excludeClient, excludeLowValue, selectedCategory]);

  // Fetch stats when date filter changes
  useEffect(() => {
    console.log(`[STATS-EFFECT] Calling fetchStats, statsDateFilter:`, statsDateFilter);
    fetchStats();
  }, [fetchStats]);

  const matchesMessageFilters = (message) => {
    if (selectedSeller) {
      const messageSellerId = String(message?.sellerId || message?.seller?._id || message?.seller || '');
      if (messageSellerId !== String(selectedSeller)) return false;
    }

    const orderQuery = searchOrderId.trim().toLowerCase();
    if (orderQuery) {
      const messageOrderId = String(message?.orderId || message?._conversationMeta?.orderId || '');
      if (!messageOrderId.toLowerCase().includes(orderQuery)) return false;
    }

    const buyerQuery = searchBuyerName.trim().toLowerCase();
    if (buyerQuery) {
      const buyerName = String(message?.buyerName || message?.buyerUsername || message?._conversationMeta?.buyerUsername || '');
      if (!buyerName.toLowerCase().includes(buyerQuery)) return false;
    }

    return true;
  };

  const matchesBoardOrderFilters = (order) => {
    if (selectedSeller) {
      const orderSellerId = String(order?.seller?._id || order?.seller || order?.sellerId || '');
      if (orderSellerId !== String(selectedSeller)) return false;
    }

    if (excludeClient) {
      const sellerName = resolveOrderSellerName(order);
      if (sellerName.toLowerCase() === 'vergo') return false;
    }

    if (excludeLowValue) {
      const amount = Number(order?.subtotalUSD ?? order?.subtotal ?? 0);
      if (Number.isFinite(amount) && amount < 3) return false;
    }

    if (searchOrderId.trim()) {
      const orderId = String(order?.orderId || '');
      if (!orderId.toLowerCase().includes(searchOrderId.trim().toLowerCase())) return false;
    }

    if (searchBuyerName.trim()) {
      const buyerName = String(order?.buyer?.buyerRegistrationAddress?.fullName || order?.buyer?.username || order?.buyerName || '');
      if (!buyerName.toLowerCase().includes(searchBuyerName.trim().toLowerCase())) return false;
    }

    return true;
  };

  const fetchINRCasesForBoard = async () => {
    try {
      const params = {
        page: 1,
        limit: INITIAL_LOAD_LIMIT,
      };
      
      // Date filter is based on INR Case's creationDate (when case was created), NOT Order's transaction date
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.dateFrom = dateFilter.single;
        // Set dateTo to today's date to show all cases from selected date to present
        const today = new Date();
        params.dateTo = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.dateFrom = dateFilter.from;
        if (dateFilter.to) params.dateTo = dateFilter.to;
      }

      const response = await api.get('/ebay/stored-inr-cases', {
        params,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      });
      const cases = ensureArray(response.data?.cases);
      
      // Transform INR cases to board format with proper field mapping for card display
      return cases.map(caseItem => ({
        ...caseItem,
        orderObjectId: caseItem._id, // Store original _id for API calls if case has one
        _id: toDraggableId('inr', caseItem, caseItem.caseId),
        originalOrderId: caseItem.orderId,
        caseOrderId: caseItem.orderId,
        orderId: caseItem.caseId, // Map caseId to orderId for card display
        dateSold: caseItem.creationDate || caseItem.createdDate || caseItem.created, // Map created date
        buyer: {
          username: caseItem.buyerUsername,
          buyerRegistrationAddress: { fullName: caseItem.buyerName }
        },
        // Use persisted complianceBoardStatus if set, otherwise default to INR_CASE_OPENED
        complianceBoardStatus: caseItem.complianceBoardStatus || COLUMN_STATUS.INR_CASE_OPENED,
        complianceBoardCategories: Array.isArray(caseItem.complianceBoardCategories)
          ? caseItem.complianceBoardCategories
          : (caseItem.complianceBoardCategory ? [caseItem.complianceBoardCategory] : ['inr']),
        complianceBoardCategory: caseItem.complianceBoardCategory || 'inr',
        status: caseItem.complianceBoardStatus || COLUMN_STATUS.INR_CASE_OPENED,
        sourceType: 'inr-case' // Mark as INR case for display
      }));
    } catch (err) {
      console.warn('Failed to fetch INR cases for board:', err);
      return [];
    }
  };

  const fetchStoredReturnCasesForBoard = async () => {
    try {
      const params = {
        limit: 200,
      };
      
      // Date filter is based on Return's creationDate (when return was initiated), NOT Order's transaction date
      if (dateFilter.mode === 'single' && dateFilter.single) {
        // For single date: set startDate to that date and endDate to today
        // This shows cases from the selected date onwards
        params.startDate = dateFilter.single;
        // Set endDate to today's date to show all cases from selected date to present
        const today = new Date();
        params.endDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      const response = await api.get('/ebay/stored-returns', {
        params,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      });
      const returnCases = ensureArray(response.data?.returns || response.data?.cases);
      
      // Transform return cases to board format with proper field mapping for card display
      return returnCases.map(returnItem => ({
        ...returnItem,
        orderObjectId: returnItem._id, // Store original _id for API calls if case has one
        _id: toDraggableId('return', returnItem, returnItem.returnId),
        originalOrderId: returnItem.orderId,
        caseOrderId: returnItem.orderId,
        orderId: returnItem.orderId || returnItem.itemId, // Display actual order ID
        returnId: returnItem.returnId, // Store returnId separately for return reference
        dateSold: returnItem.returnCreatedDate || returnItem.creationDate, // Use Return's creation date, not Order's dateSold
        buyer: {
          username: returnItem.buyerUsername,
          buyerRegistrationAddress: { fullName: returnItem.buyerName }
        },
        // Use persisted complianceBoardStatus if set, otherwise default to CASE_OPENED
        complianceBoardStatus: returnItem.complianceBoardStatus || COLUMN_STATUS.CASE_OPENED,
        complianceBoardCategories: Array.isArray(returnItem.complianceBoardCategories) 
          ? returnItem.complianceBoardCategories 
          : (returnItem.complianceBoardCategory ? [returnItem.complianceBoardCategory] : ['return_refund']),
        complianceBoardCategory: returnItem.complianceBoardCategory || 'return_refund',
        status: returnItem.complianceBoardStatus || COLUMN_STATUS.CASE_OPENED,
        returnBoardSource: 'return_request', // Mark as return request for proper filtering
        returnInfo: {
          returnId: returnItem.returnId,
          returnStatus: returnItem.returnStatus,
          returnReason: returnItem.returnReason,
          createdDate: returnItem.returnCreatedDate || returnItem.creationDate,
          responseDate: returnItem.responseDate,
        },
        sourceType: 'return-case' // Mark as return case for display
      }));
    } catch (err) {
      console.warn('Failed to fetch stored return cases for board:', err);
      return [];
    }
  };

  const fetchStoredCancellationCasesForBoard = async () => {
    try {
      const params = {
        limit: 200,
      };
      
      // Date filter is based on Cancellation's cancelRequestDate (when cancellation was requested), NOT Order's transaction date
      if (dateFilter.mode === 'single' && dateFilter.single) {
        // For single date: set startDate to that date and endDate to today
        // This shows cases from the selected date onwards
        params.startDate = dateFilter.single;
        // Set endDate to today's date to show all cases from selected date to present
        const today = new Date();
        params.endDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      const response = await api.get('/ebay/stored-cancellations', {
        params,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      });
      const cancellationCases = ensureArray(response.data?.cancellations);
      
      // Transform cancellation cases to board format with proper field mapping for card display
      return cancellationCases.map(caseItem => ({
        ...caseItem,
        orderObjectId: caseItem._id, // Store original _id for API calls if case has one
        _id: toDraggableId('cancellation', caseItem, caseItem.cancelId),
        originalOrderId: caseItem.orderId,
        caseOrderId: caseItem.orderId,
        orderId: caseItem.orderId || caseItem.legacyOrderId, // Display actual order ID
        cancelId: caseItem.cancelId, // Store cancelId separately for case reference
        dateSold: caseItem.dateSold, // Use backend's dateSold (cancellation's cancelRequestDate)
        buyer: {
          username: caseItem.buyerUsername,
          buyerRegistrationAddress: { fullName: caseItem.buyerLoginName }
        },
        // Use persisted complianceBoardStatus if set, otherwise default to CANCELLATION_REQUEST
        complianceBoardStatus: caseItem.complianceBoardStatus || COLUMN_STATUS.CANCELLATION_REQUEST,
        complianceBoardCategories: Array.isArray(caseItem.complianceBoardCategories) 
          ? caseItem.complianceBoardCategories 
          : (caseItem.complianceBoardCategory ? [caseItem.complianceBoardCategory] : ['cancellation']),
        complianceBoardCategory: caseItem.complianceBoardCategory || 'cancellation',
        status: caseItem.complianceBoardStatus || COLUMN_STATUS.CANCELLATION_REQUEST,
        sourceType: 'cancellation-case' // Mark as cancellation case for display
      }));
    } catch (err) {
      console.warn('Failed to fetch stored cancellation cases for board:', err);
      return [];
    }
  };

  const fetchCancelledOrdersForBoard = async () => {
    try {
      const params = {
        page: 1,
        limit: INITIAL_LOAD_LIMIT,
      };
      
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      const response = await api.get('/ebay/cancelled-orders', {
        params,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      });
      const cancelledOrders = ensureArray(response.data?.orders);
      
      // Transform cancelled orders to board format
      return cancelledOrders.map(order => ({
        ...order,
        orderObjectId: order._id, // Store original MongoDB _id for API calls
        _id: toDraggableId('cancelled', order, order.orderId),
        // Use persisted complianceBoardStatus if set, otherwise default to CANCELLATION_REQUEST
        complianceBoardStatus: order.complianceBoardStatus || COLUMN_STATUS.CANCELLATION_REQUEST,
        complianceBoardCategories: Array.isArray(order.complianceBoardCategories) 
          ? order.complianceBoardCategories 
          : (order.complianceBoardCategory ? [order.complianceBoardCategory] : ['cancellation']),
        complianceBoardCategory: order.complianceBoardCategory || 'cancellation',
        status: order.complianceBoardStatus || COLUMN_STATUS.CANCELLATION_REQUEST,
        sourceType: 'cancelled-order' // Mark as cancelled order for display
      }));
    } catch (err) {
      console.warn('Failed to fetch cancelled orders for board:', err);
      return [];
    }
  };

  const fetchIssueHubData = async () => {
    const orderParams = {
      category: 'order_fulfillment',
      page: 1,
      limit: 500,
      ...buildDateParams(),
      ...buildBoardFilterParams(),
    };

    const messageParams = {
      page: 1,
      limit: MESSAGE_THREAD_LIMIT,
      excludeClient,
      filterType: 'ALL',
      complianceBoardMode: true,
      maxAgeDays: MESSAGE_THREAD_MAX_AGE_DAYS,
      variant: 'v2',
      ...buildMessageDateParams(),
      ...buildBoardFilterParams(),
    };

    const [ordersResult, messagesResult] = await Promise.allSettled([
      api.get('/orders/compliance-board', {
        params: orderParams,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      }),
      api.get('/ebay/chat/threads', {
        params: messageParams,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      }),
    ]);

    if (ordersResult.status === 'rejected') {
      throw ordersResult.reason;
    }

    const ordersResponse = ordersResult.value;
    const messagesResponse = messagesResult.status === 'fulfilled'
      ? messagesResult.value
      : { data: { threads: [] } };
    if (messagesResult.status === 'rejected') {
      console.warn('Issue hub message source unavailable:', messagesResult.reason);
    }

    const groupedOrders = {
      [COLUMN_STATUS.OUT_OF_STOCK]: [],
      [COLUMN_STATUS.ADDRESS_ISSUE]: [],
    };

    ensureArray(ordersResponse.data?.orders).forEach((order) => {
      if (order.complianceBoardStatus === COLUMN_STATUS.OUT_OF_STOCK) {
        groupedOrders[COLUMN_STATUS.OUT_OF_STOCK].push(order);
      }
      if (order.complianceBoardStatus === COLUMN_STATUS.ADDRESS_ISSUE) {
        groupedOrders[COLUMN_STATUS.ADDRESS_ISSUE].push(order);
      }
    });

    const groupedMessages = {
      [MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT]: [],
      [MESSAGE_CATEGORIES.INQUIRY]: [],
    };

    const threads = ensureArray(messagesResponse.data?.threads);
    const metaPromises = threads.map(async (thread) => {
      try {
        const params = {
          sellerId: thread.sellerId,
          buyerUsername: thread.buyerUsername,
          itemId: thread.itemId,
          orderId: thread.orderId || ''
        };
        const { data } = await api.get('/ebay/conversation-meta/single', {
          params,
          timeout: ALERT_REQUEST_TIMEOUT_MS,
        });
        return { thread, meta: data };
      } catch (err) {
        return { thread, meta: null };
      }
    });

    const threadMetaResults = await Promise.all(metaPromises);
    const enrichedThreads = [];
    threadMetaResults.forEach(({ thread, meta }) => {
      const enrichedThread = {
        ...thread,
        _conversationMeta: meta || thread._conversationMeta || null,
        category: meta?.category || thread.category || '',
        status: meta?.status || thread.status || 'Open',
        caseStatus: meta?.caseStatus || thread.caseStatus || 'Case Not Opened',
        pickedUpBy: meta?.pickedUpBy || thread.pickedUpBy || null
      };
      enrichedThreads.push(enrichedThread);
      if (meta?.category === MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT) {
        groupedMessages[MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT].push(enrichedThread);
      }
      if (meta?.category === MESSAGE_CATEGORIES.INQUIRY) {
        groupedMessages[MESSAGE_CATEGORIES.INQUIRY].push(enrichedThread);
      }
    });

    return { groupedOrders, groupedMessages, allThreads: enrichedThreads };
  };

  const fetchOrders = useCallback(async () => {
    // Handle Order Communication separately
    if (selectedCategory === 'order_communication') {
      await fetchMessages();
      return;
    }

    if (selectedCategory === 'issue_hub') {
      setLoading(true);
      setError('');
      try {
        const { groupedOrders, groupedMessages, allThreads } = await fetchIssueHubData();
        setOrders((prev) => ({ ...prev, ...groupedOrders }));
        setMessages((prev) => ({ ...prev, ...groupedMessages }));
        setPendingOrderMoves({});
        setPendingMessageMoves({});
        setVisibleOrderCounts((prev) => ({ ...prev, ...buildVisibleCountMap(groupedOrders) }));
        setVisibleMessageCounts((prev) => ({ ...prev, ...buildVisibleCountMap(groupedMessages) }));
        setPagination({ total: 0, page: 1, limit: 0, totalPages: 0 });
        // Store all messages for alert calculations
        setAllMessagesForAlerts(allThreads);
      } catch (err) {
        console.error('Failed to load issue hub:', err);
        setError(err.response?.data?.error || 'Failed to load issue hub');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = {
        category: selectedCategory,
        page: currentPage,
        // Mixed boards need a broader fetch because one response is later split
        // into multiple columns and small pages can hide "Case Not Opened".
        limit: ['return_refund', 'inr', 'cancellation'].includes(selectedCategory) ? 500 : INITIAL_LOAD_LIMIT,
        ...buildBoardFilterParams()
      };
      
      // Only add dates based on filter mode
      Object.assign(params, buildDateParams());
      
      console.log(`[BOARD-API-CALL] Calling /orders/compliance-board with params:`, JSON.stringify(params));
      
      const [response, inrCasesResult, returnCasesResult, cancellationCasesResult, cancelledOrdersResult] = await Promise.all([
        api.get('/orders/compliance-board', {
          params,
          timeout: BOARD_REQUEST_TIMEOUT_MS,
        }),
        selectedCategory === 'inr'
          ? fetchINRCasesForBoard()
          : Promise.resolve(null),
        // Fetch stored return cases for 'return_refund' board
        // This brings in the actual return cases from Issues & Resolutions
        selectedCategory === 'return_refund'
          ? fetchStoredReturnCasesForBoard()
          : Promise.resolve(null),
        // Fetch stored cancellation cases for 'cancellation' board
        // This brings in the actual cancellation cases from Issues & Resolutions
        selectedCategory === 'cancellation'
          ? fetchStoredCancellationCasesForBoard()
          : Promise.resolve(null),
        // Fetch cancelled orders for both 'cancellation' and 'order_fulfillment' boards
        // This allows users to search for cancelled orders in Order Fulfillment board
        ['cancellation', 'order_fulfillment'].includes(selectedCategory)
          ? fetchCancelledOrdersForBoard()
          : Promise.resolve(null)
      ]);

      // Log search results from both main and special board calls
      if (searchOrderId.trim()) {
        console.log(`[BOARD-API] Main compliance-board API returned ${ensureArray(response.data?.orders).length} orders`);
        const mainMatches = ensureArray(response.data?.orders).filter(o => o.orderId?.toString().includes(searchOrderId.trim()));
        mainMatches.forEach(o => console.log(`  - Main API: orderId ${o.orderId}, status: ${o.complianceBoardStatus || 'todo'}`));
        
        const returnCases = ensureArray(returnCasesResult);
        if (returnCases.length > 0) {
          console.log(`[BOARD-API] fetchStoredReturnCasesForBoard returned ${returnCases.length} cases`);
          const returnMatches = returnCases.filter(o => o.orderId?.toString().includes(searchOrderId.trim()) || o.returnId?.toString().includes(searchOrderId.trim()));
          returnMatches.forEach(o => console.log(`  - Return Cases API: returnId ${o.returnId}, orderId ${o.orderId}, status: ${o.complianceBoardStatus || 'todo'}`));
        }
        
        const cancellationCases = ensureArray(cancellationCasesResult);
        if (cancellationCases.length > 0) {
          console.log(`[BOARD-API] fetchStoredCancellationCasesForBoard returned ${cancellationCases.length} cases`);
          const cancellationMatches = cancellationCases.filter(o => o.orderId?.toString().includes(searchOrderId.trim()) || o.cancelId?.toString().includes(searchOrderId.trim()));
          cancellationMatches.forEach(o => console.log(`  - Cancellation Cases API: cancelId ${o.cancelId}, orderId ${o.orderId}, status: ${o.complianceBoardStatus || 'todo'}`));
        }
        
        const cancelledOrders = ensureArray(cancelledOrdersResult);
        if (cancelledOrders.length > 0) {
          console.log(`[BOARD-API] fetchCancelledOrdersForBoard returned ${cancelledOrders.length} orders`);
          const cancelledMatches = cancelledOrders.filter(o => o.orderId?.toString().includes(searchOrderId.trim()));
          cancelledMatches.forEach(o => console.log(`  - Cancelled Orders API: orderId ${o.orderId}, status: ${o.complianceBoardStatus || 'todo'}`));
        }
      }
      
      // Group orders by their board status
      const grouped = {
        [COLUMN_STATUS.TODO]: [],
        [COLUMN_STATUS.OUT_OF_STOCK]: [],
        [COLUMN_STATUS.CANCELLATION]: [],
        [COLUMN_STATUS.ADDRESS_ISSUE]: [],
        [COLUMN_STATUS.LATE_DELIVERY]: [],
        [COLUMN_STATUS.NOT_FULFILLED]: [],
        [COLUMN_STATUS.FULFILLED]: [],
        [COLUMN_STATUS.BUYER_CONFIRMATION]: [],
        // Return/Refund columns
        [COLUMN_STATUS.CASE_OPENED]: [],
        [COLUMN_STATUS.CASE_NOT_OPENED]: [],
        [COLUMN_STATUS.RETURN_FOLLOW_UP]: [],
        [COLUMN_STATUS.PROVIDE_RETURN_LABEL]: [],
        [COLUMN_STATUS.BUYER_DROP_OFF]: [],
        [COLUMN_STATUS.ITEM_DELIVERED]: [],
        [COLUMN_STATUS.PARTIAL_REFUND]: [],
        [COLUMN_STATUS.FULL_REFUND]: [],
        [COLUMN_STATUS.REPLACEMENT]: [],
        // Cancellation columns
        [COLUMN_STATUS.CANCELLATION_REQUEST]: [],
        [COLUMN_STATUS.ACCEPTED]: [],
        [COLUMN_STATUS.DECLINED]: [],
        // INR columns
        [COLUMN_STATUS.INR_CASE_OPENED]: [],
        [COLUMN_STATUS.INR_FOLLOW_UP]: [],
        [COLUMN_STATUS.INR_TRACKING_ID_UPLOAD]: [],
        [COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN]: [],
        [COLUMN_STATUS.INR_FULLY_REFUNDED]: [],
        [COLUMN_STATUS.INR_PARTIAL_REFUND]: [],
        [COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED]: [],
      };
      
      const boardOrders = ensureArray(response.data?.orders).map((order, index) => ({
        ...order,
        _id: toDraggableId('order', order, `${selectedCategory}-${index}`),
      }));

      // Log orders if searching for specific order ID
      if (searchOrderId.trim()) {
        const searchedOrders = boardOrders.filter(o => o.orderId?.toString().includes(searchOrderId.trim()));
        if (searchedOrders.length > 0) {
          console.log(`[BOARD-GROUP] Searching for "${searchOrderId}": found ${searchedOrders.length} order(s) from API:`);
          searchedOrders.forEach(order => {
            console.log(`  - orderId: ${order.orderId}, status: ${order.complianceBoardStatus || 'todo'}, _id: ${order._id}, orderObjectId: ${order.orderObjectId}`);
          });
        }
      }

      boardOrders.forEach((order) => {
        const rawStatus = order.complianceBoardStatus || COLUMN_STATUS.TODO;
        const status = rawStatus === 'inr_case_closed'
          ? COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED
          : rawStatus;
        if (grouped[status]) {
          grouped[status].push(order);
        }
        
        // Log if adding searched order
        if (searchOrderId.trim() && order.orderId?.toString().includes(searchOrderId.trim())) {
          console.log(`[BOARD-GROUP] Adding orderId ${order.orderId} to column "${status}"`);
        }
      });

      const getOrderBoardCategories = (order) => (
        Array.isArray(order?.complianceBoardCategories)
          ? order.complianceBoardCategories
          : (order?.complianceBoardCategory ? [order.complianceBoardCategory] : [])
      );
      const isReturnConversationOrder = (order) => {
        const conversationCategory = order?.conversationInfo?.category;
        return (
          order?.returnBoardSource === 'conversation' ||
          conversationCategory === 'Return' ||
          conversationCategory === 'Refund' ||
          conversationCategory === 'Replace'
        );
      };

      // Merge INR cases from Issues & Resolutions into INR board's Case Opened column
      if (selectedCategory === 'inr') {
        // INR cases should be grouped by their complianceBoardStatus
        let inrCasesForBoard = inrCasesResult ? [...inrCasesResult] : [];
        
        // Apply only basic filters: search order ID and buyer name
        if (searchOrderId.trim()) {
          inrCasesForBoard = inrCasesForBoard.filter(c => {
            const orderId = String(c.orderId || c.caseOrderId || '');
            return orderId.toLowerCase().includes(searchOrderId.trim().toLowerCase());
          });
        }
        
        if (searchBuyerName.trim()) {
          inrCasesForBoard = inrCasesForBoard.filter(c => {
            const buyerName = String(c.buyer?.buyerRegistrationAddress?.fullName || c.buyerName || c.buyer?.username || '');
            return buyerName.toLowerCase().includes(searchBuyerName.trim().toLowerCase());
          });
        }
        
        // Deduplicate inrCasesForBoard by orderId
        // Keep only one INR case per order, preferring the one with inr_case_opened status or most recent
        const inrByOrderId = new Map();
        inrCasesForBoard.forEach((caseItem) => {
          const orderId = String(caseItem.orderId || caseItem.caseOrderId || '').toLowerCase();
          if (!orderId) return;
          
          const status = caseItem.complianceBoardStatus || COLUMN_STATUS.INR_CASE_OPENED;
          const existing = inrByOrderId.get(orderId);
          
          // Keep this case if:
          // - No existing entry, OR
          // - This one has inr_case_opened status and existing doesn't, OR
          // - This one is more recent (newer creationDate)
          if (!existing) {
            inrByOrderId.set(orderId, { caseItem, status, creationDate: caseItem.creationDate });
          } else if (status === COLUMN_STATUS.INR_CASE_OPENED && existing.status !== COLUMN_STATUS.INR_CASE_OPENED) {
            // Prefer inr_case_opened status
            inrByOrderId.set(orderId, { caseItem, status, creationDate: caseItem.creationDate });
          } else if (new Date(caseItem.creationDate) > new Date(existing.creationDate)) {
            // Keep the more recent one
            inrByOrderId.set(orderId, { caseItem, status, creationDate: caseItem.creationDate });
          }
        });
        
        // Extract deduplicated cases and build Set of orderIds for filtering
        const dedupInrCases = Array.from(inrByOrderId.values()).map(item => item.caseItem);
        const inrOrderIds = new Set(inrByOrderId.keys());
        
        // Remove duplicate Order Communication entries if same orderId exists in INR cases
        Object.keys(grouped).forEach((status) => {
          grouped[status] = grouped[status].filter((order) => {
            const orderId = String(order.orderId || order.caseOrderId || '').toLowerCase();
            return !inrOrderIds.has(orderId);
          });
        });
        
        // Group deduplicated INR cases by their complianceBoardStatus
        dedupInrCases.forEach((caseItem) => {
          const status = caseItem.complianceBoardStatus || COLUMN_STATUS.INR_CASE_OPENED;
          if (grouped[status]) {
            grouped[status].push(caseItem);
          }
        });
        
        // Case Not Opened = Orders with status 'case_not_opened'
        // Backend already filters to only return orders with 'inr' category, so we just need to check status
        // These are typically from Order Communication messages assigned to INR
        // Note: Orders are already grouped by status above, so this just uses that existing grouped data
        // grouped[COLUMN_STATUS.CASE_NOT_OPENED] is already populated by the status-based grouping above
      }

      // Merge stored cancellation cases from Issues & Resolutions into Cancellation board's columns
      if (selectedCategory === 'cancellation') {
        // Stored cancellation cases should be grouped by their complianceBoardStatus
        let cancellationCasesForBoard = cancellationCasesResult ? [...cancellationCasesResult] : [];
        
        // Apply only basic filters: search order ID and buyer name
        if (searchOrderId.trim()) {
          cancellationCasesForBoard = cancellationCasesForBoard.filter(c => {
            const orderId = String(c.orderId || c.legacyOrderId || '');
            const caseId = String(c.cancelId || '');
            return orderId.toLowerCase().includes(searchOrderId.trim().toLowerCase()) || 
                   caseId.toLowerCase().includes(searchOrderId.trim().toLowerCase());
          });
        }
        
        if (searchBuyerName.trim()) {
          cancellationCasesForBoard = cancellationCasesForBoard.filter(c => {
            const buyerName = String(c.buyer?.buyerRegistrationAddress?.fullName || c.buyerName || c.buyerUsername || '');
            return buyerName.toLowerCase().includes(searchBuyerName.trim().toLowerCase());
          });
        }
        
        // Deduplicate cancellationCasesForBoard by cancelId
        // Deduplicate cancellationCasesForBoard by orderId (not cancelId)
        // Keep only one cancellation per order, preferring the one with cancellation_request status or most recent
        const cancellationByOrderId = new Map();
        cancellationCasesForBoard.forEach((caseItem) => {
          const orderId = String(caseItem.orderId || caseItem.legacyOrderId || '').toLowerCase();
          if (!orderId) return;
          
          const status = caseItem.complianceBoardStatus || COLUMN_STATUS.CANCELLATION_REQUEST;
          const existing = cancellationByOrderId.get(orderId);
          
          // Keep this case if:
          // - No existing entry, OR
          // - This one has cancellation_request status and existing doesn't, OR
          // - This one is more recent (newer cancelRequestDate)
          if (!existing) {
            cancellationByOrderId.set(orderId, { caseItem, status, cancelRequestDate: caseItem.cancelRequestDate });
          } else if (status === COLUMN_STATUS.CANCELLATION_REQUEST && existing.status !== COLUMN_STATUS.CANCELLATION_REQUEST) {
            // Prefer cancellation_request status
            cancellationByOrderId.set(orderId, { caseItem, status, cancelRequestDate: caseItem.cancelRequestDate });
          } else if (new Date(caseItem.cancelRequestDate) > new Date(existing.cancelRequestDate)) {
            // Keep the more recent one
            cancellationByOrderId.set(orderId, { caseItem, status, cancelRequestDate: caseItem.cancelRequestDate });
          }
        });
        
        // Extract deduplicated cases and build Set of orderIds for filtering
        const dedupCancellationCases = Array.from(cancellationByOrderId.values()).map(item => item.caseItem);
        const cancellationOrderIds = new Set(dedupCancellationCases.map(c => String(c.orderId || c.legacyOrderId || '').toLowerCase()).filter(Boolean));
        
        // Remove duplicate Order Communication entries if same orderId exists in cancellation cases
        Object.keys(grouped).forEach((status) => {
          grouped[status] = grouped[status].filter((order) => {
            const orderId = String(order.orderId || order.legacyOrderId || '').toLowerCase();
            return !cancellationOrderIds.has(orderId);
          });
        });
        
        // Group deduplicated cancellation cases by their complianceBoardStatus
        dedupCancellationCases.forEach((caseItem) => {
          const status = caseItem.complianceBoardStatus || COLUMN_STATUS.CANCELLATION_REQUEST;
          if (grouped[status]) {
            grouped[status].push(caseItem);
          }
        });
        
        // Case Opened = Cancellation cases (from Issues & Resolutions / stored cancellation cases)
        // Case Not Opened = Orders with status 'case_not_opened' from Order Communication
        // Backend already filters to only return orders with 'cancellation' category, so we just need to check status
        // Note: Cases are already grouped by status above, so this uses that existing grouped data
      }

      // Merge cancelled orders into Order Fulfillment board as well
      // This allows users to see and search for cancelled orders in the Order Fulfillment view
      if (selectedCategory === 'order_fulfillment') {
        let cancelledOrdersForBoard = cancelledOrdersResult ? [...cancelledOrdersResult] : [];
        
        // Log what we received from backend
        if (cancelledOrdersForBoard.length > 0) {
          console.log(`[BOARD-MERGE] Received ${cancelledOrdersForBoard.length} cancelled orders from API`);
          console.log(`[BOARD-MERGE] Sample order:`, {
            orderId: cancelledOrdersForBoard[0].orderId,
            cancelState: cancelledOrdersForBoard[0].cancelState,
            complianceBoardStatus: cancelledOrdersForBoard[0].complianceBoardStatus,
            sourceType: cancelledOrdersForBoard[0].sourceType,
            keys: Object.keys(cancelledOrdersForBoard[0]).slice(0, 20)
          });
        }
        
        // Apply only basic filters: search order ID and buyer name
        if (searchOrderId.trim()) {
          cancelledOrdersForBoard = cancelledOrdersForBoard.filter(o => {
            const orderId = String(o.orderId || o.legacyOrderId || '');
            return orderId.toLowerCase().includes(searchOrderId.trim().toLowerCase());
          });
        }
        
        if (searchBuyerName.trim()) {
          cancelledOrdersForBoard = cancelledOrdersForBoard.filter(o => {
            const buyerName = String(o.buyer?.buyerRegistrationAddress?.fullName || o.buyerName || o.buyer?.username || '');
            return buyerName.toLowerCase().includes(searchBuyerName.trim().toLowerCase());
          });
        }

        // Log cancelled orders being merged
        if (cancelledOrdersForBoard.length > 0) {
          console.log(`[BOARD-GROUP] Merging ${cancelledOrdersForBoard.length} cancelled order(s) for order_fulfillment:`);
          cancelledOrdersForBoard.slice(0, 3).forEach(o => {
            console.log(`  - Cancelled orderId: ${o.orderId}, cancelState: ${o.cancelState}, status: ${o.complianceBoardStatus}`);
          });
        }
        
        // FIXED: Only add cancelled orders to TODO if they don't already exist in the main board orders
        // This prevents the same order from appearing in multiple columns
        const mainOrderIds = new Set();
        Object.values(grouped).forEach(columnOrders => {
          columnOrders.forEach(order => {
            mainOrderIds.add(String(order.orderId).toLowerCase());
          });
        });
        
        const dedupedCancelledOrders = cancelledOrdersForBoard.filter(o => 
          !mainOrderIds.has(String(o.orderId).toLowerCase())
        );
        
        // Merge cancelled orders into the groupedTodo
        // Cancelled orders go into "To Do" column (they need action)
        if (dedupedCancelledOrders.length > 0) {
          if (!grouped[COLUMN_STATUS.TODO]) {
            grouped[COLUMN_STATUS.TODO] = [];
          }
          grouped[COLUMN_STATUS.TODO].push(...dedupedCancelledOrders);
          
          if (searchOrderId.trim()) {
            console.log(`[BOARD-GROUP] After dedup, adding ${dedupedCancelledOrders.length} cancelled orders to TODO`);
          }
        }
      }

      if (selectedCategory === 'return_refund') {
        // Stored return cases should be grouped by their complianceBoardStatus
        let storedReturnCasesForBoard = returnCasesResult ? [...returnCasesResult] : [];
        
        // Apply only basic filters: search order ID and buyer name
        if (searchOrderId.trim()) {
          storedReturnCasesForBoard = storedReturnCasesForBoard.filter(c => {
            const orderId = String(c.orderId || c.itemId || '');
            const returnId = String(c.returnId || '');
            return orderId.toLowerCase().includes(searchOrderId.trim().toLowerCase()) || 
                   returnId.toLowerCase().includes(searchOrderId.trim().toLowerCase());
          });
        }
        
        if (searchBuyerName.trim()) {
          storedReturnCasesForBoard = storedReturnCasesForBoard.filter(c => {
            const buyerName = String(c.buyer?.buyerRegistrationAddress?.fullName || c.buyerName || c.buyerUsername || '');
            return buyerName.toLowerCase().includes(searchBuyerName.trim().toLowerCase());
          });
        }
        
        // Deduplicate storedReturnCasesForBoard by orderId (not returnId)
        // Keep only one return per order, preferring the one with case_opened status or most recent
        const returnByOrderId = new Map();
        storedReturnCasesForBoard.forEach((returnItem) => {
          const orderId = String(returnItem.orderId || returnItem.itemId || '').toLowerCase();
          if (!orderId) return;
          
          const status = returnItem.complianceBoardStatus || COLUMN_STATUS.CASE_OPENED;
          const existing = returnByOrderId.get(orderId);
          
          // Keep this case if:
          // - No existing entry, OR
          // - This one has case_opened status and existing doesn't, OR
          // - This one is more recent (newer creationDate)
          if (!existing) {
            returnByOrderId.set(orderId, { returnItem, status, creationDate: returnItem.returnCreatedDate || returnItem.creationDate });
          } else if (status === COLUMN_STATUS.CASE_OPENED && existing.status !== COLUMN_STATUS.CASE_OPENED) {
            // Prefer case_opened status
            returnByOrderId.set(orderId, { returnItem, status, creationDate: returnItem.returnCreatedDate || returnItem.creationDate });
          } else if (new Date(returnItem.returnCreatedDate || returnItem.creationDate) > new Date(existing.creationDate)) {
            // Keep the more recent one
            returnByOrderId.set(orderId, { returnItem, status, creationDate: returnItem.returnCreatedDate || returnItem.creationDate });
          }
        });
        
        // Extract deduplicated cases and build Set of orderIds for filtering
        const dedupReturnCases = Array.from(returnByOrderId.values()).map(item => item.returnItem);
        const returnOrderIds = new Set(dedupReturnCases.map(r => String(r.orderId || r.itemId || '').toLowerCase()).filter(Boolean));
        
        // Remove duplicate Order Communication entries if same orderId exists in return cases
        Object.keys(grouped).forEach((status) => {
          grouped[status] = grouped[status].filter((order) => {
            const orderId = String(order.orderId || order.itemId || '').toLowerCase();
            return !returnOrderIds.has(orderId);
          });
        });
        
        // Group deduplicated return cases by their complianceBoardStatus
        console.log(`[BOARD-GROUP] Processing ${dedupReturnCases.length} deduplicated return cases for grouping`);
        dedupReturnCases.forEach((returnItem, idx) => {
          const status = returnItem.complianceBoardStatus || COLUMN_STATUS.CASE_OPENED;
          if (grouped[status]) {
            grouped[status].push(returnItem);
            
            // Log first few returns to show what status they're getting
            if (idx < 3) {
              console.log(`[BOARD-GROUP] Return ${idx + 1}: returnId=${returnItem.returnId}, orderId=${returnItem.orderId}, status=${status}, _id=${returnItem._id}`);
            }
          }
        });
        
        // Case Opened = Return cases (from Issues & Resolutions / stored return cases)
        // Case Not Opened = Conversation items assigned to Return/Refund/Replace
        // Note: Cases are already grouped by status above
      }
      
      // Track all orderIds that have been added from special case sources
      // This prevents duplicate cards for the same orderId in return/refund, cancellation, and inr boards
      let caseSourceOrderIds = new Set();
      
      if (selectedCategory === 'return_refund') {
        // Store ALL orderIds from all columns to prevent duplicates from boardOrders
        // This includes return cases and any other items already in grouped
        // Don't filter by source - track everything to prevent any duplicates!
        caseSourceOrderIds = new Set(
          Object.values(grouped)
            .flat()
            .map(r => String(r.orderId || r.itemId || '').toLowerCase())
            .filter(Boolean)
        );
        
        // Case Opened: Merge Return cases with conversation-based items
        // Keep existing Return items, add only conversation items that don't duplicate existing orderIds
        grouped[COLUMN_STATUS.CASE_OPENED] = [
          ...(grouped[COLUMN_STATUS.CASE_OPENED] || []),
          ...boardOrders.filter((order) => 
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.CASE_OPENED) === COLUMN_STATUS.CASE_OPENED &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        
        // Case Not Opened: Only Conversation items (from Order Communication assigned to Return/Refund/Replace)
        grouped[COLUMN_STATUS.CASE_NOT_OPENED] = [
          ...(grouped[COLUMN_STATUS.CASE_NOT_OPENED] || []),
          ...boardOrders.filter((order) => 
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.CASE_NOT_OPENED &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        
        // Other return statuses (Follow Up, Provide Return Label, etc.) from Order Communication
        // IMPORTANT: Only add boardOrders that are not already in caseSourceOrderIds!
        grouped[COLUMN_STATUS.RETURN_FOLLOW_UP] = [
          ...(grouped[COLUMN_STATUS.RETURN_FOLLOW_UP] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.RETURN_FOLLOW_UP &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        grouped[COLUMN_STATUS.PROVIDE_RETURN_LABEL] = [
          ...(grouped[COLUMN_STATUS.PROVIDE_RETURN_LABEL] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.PROVIDE_RETURN_LABEL &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        grouped[COLUMN_STATUS.BUYER_DROP_OFF] = [
          ...(grouped[COLUMN_STATUS.BUYER_DROP_OFF] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.BUYER_DROP_OFF &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        grouped[COLUMN_STATUS.ITEM_DELIVERED] = [
          ...(grouped[COLUMN_STATUS.ITEM_DELIVERED] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.ITEM_DELIVERED &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        grouped[COLUMN_STATUS.PARTIAL_REFUND] = [
          ...(grouped[COLUMN_STATUS.PARTIAL_REFUND] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.PARTIAL_REFUND &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        grouped[COLUMN_STATUS.FULL_REFUND] = [
          ...(grouped[COLUMN_STATUS.FULL_REFUND] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.FULL_REFUND &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
        grouped[COLUMN_STATUS.REPLACEMENT] = [
          ...(grouped[COLUMN_STATUS.REPLACEMENT] || []),
          ...boardOrders.filter((order) =>
            order.returnBoardSource === 'conversation' &&
            (order.complianceBoardStatus || COLUMN_STATUS.TODO) === COLUMN_STATUS.REPLACEMENT &&
            !caseSourceOrderIds.has(String(order.orderId || order.itemId || '').toLowerCase())
          )
        ];
      }
      
      // Log column counts
      console.log(`[BOARD-FINAL] Column counts after grouping:`);
      Object.keys(grouped).forEach(status => {
        if (grouped[status].length > 0) {
          console.log(`  - ${status}: ${grouped[status].length} orders`);
        }
      });
      
      setOrders(grouped);
      setPendingOrderMoves({});
      setBoardSourceCounts(response.data?.sourceCounts || {});
      setStatusCounts(response.data?.statusCounts || {});
      setOverdueCounts(response.data?.overdueCounts || {});
      setVisibleOrderCounts(buildVisibleCountMap(grouped));
      if (response.data?.pagination) {
        setPagination(response.data.pagination);
      }

      // Calculate summary
      setSummary({
        total: response.data?.pagination?.total || boardOrders.length,
        todo: grouped[COLUMN_STATUS.TODO].length,
        outOfStock: grouped[COLUMN_STATUS.OUT_OF_STOCK].length,
        cancellation: grouped[COLUMN_STATUS.CANCELLATION].length,
        addressIssue: grouped[COLUMN_STATUS.ADDRESS_ISSUE].length,
        notFulfilled: grouped[COLUMN_STATUS.NOT_FULFILLED].length,
        fulfilled: grouped[COLUMN_STATUS.FULFILLED].length,
        buyerConfirmation: grouped[COLUMN_STATUS.BUYER_CONFIRMATION].length
      });

      // Fetch alert messages separately so order boards render even if the
      // message thread source is slow or temporarily unavailable.
      fetchMessagesForAlerts();
    } catch (err) {
      console.error('Failed to fetch compliance board orders:', err);
      setError(err.response?.data?.error || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, currentPage, dateFilter, selectedSeller, searchOrderId, searchBuyerName, excludeClient, excludeLowValue]);

  // Fetch messages for alert system (all boards except order_communication)
  const fetchMessagesForAlerts = async () => {
    try {
      const params = {
        page: 1,
        limit: MESSAGE_THREAD_LIMIT,
        excludeClient,
        filterType: 'ALL',
        complianceBoardMode: true,
        maxAgeDays: MESSAGE_THREAD_MAX_AGE_DAYS,
        variant: 'v2',
        ...buildMessageDateParams(),
        ...buildBoardFilterParams(),
      };

      const response = await api.get('/ebay/chat/threads', {
        params,
        timeout: ALERT_REQUEST_TIMEOUT_MS,
      });
      const threads = ensureArray(response.data?.threads);
      setAllMessagesForAlerts(threads);
    } catch (err) {
      console.warn('Failed to fetch messages for alerts:', err);
      setAllMessagesForAlerts([]);
    }
  };

  const fetchChatAgents = async () => {
    try {
      const { data } = await api.get('/ebay/chat-agents');
      setChatAgents(data || []);
    } catch (err) {
      console.error('Failed to fetch chat agents:', err);
      setChatAgents([]);
    }
  };

  // Fetch messages for Order Communication board using existing buyer messages endpoint
  const fetchMessages = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: 1,
        limit: MESSAGE_THREAD_LIMIT,
        excludeClient,
        filterType: 'ALL', // Get all message types
        complianceBoardMode: true,
        maxAgeDays: MESSAGE_THREAD_MAX_AGE_DAYS,
        variant: 'v2',
        ...buildMessageDateParams(),
        ...buildBoardFilterParams(),
      };

      const [threadsResult, assignedResult] = await Promise.allSettled([
        api.get('/ebay/chat/threads', {
          params,
          timeout: BOARD_REQUEST_TIMEOUT_MS,
        }),
        dateFilter.mode === 'none'
          ? api.get('/ebay/conversation-meta/assigned-board', {
              params: {
                limit: 500,
                ...buildBoardFilterParams(),
              },
              timeout: BOARD_REQUEST_TIMEOUT_MS,
            })
          : Promise.resolve({ data: { threads: [] } })
      ]);

      const threadsResponse = threadsResult.status === 'fulfilled'
        ? threadsResult.value
        : { data: { threads: [] } };
      const assignedResponse = assignedResult.status === 'fulfilled'
        ? assignedResult.value
        : { data: { threads: [] } };

      if (threadsResult.status === 'rejected' && assignedResult.status === 'rejected') {
        throw threadsResult.reason;
      }
      if (threadsResult.status === 'rejected') {
        console.warn('Live message threads unavailable, using assigned board conversations only:', threadsResult.reason);
      }
      if (assignedResult.status === 'rejected') {
        console.warn('Assigned board conversations unavailable, using live message threads only:', assignedResult.reason);
      }

      // Fetch conversation metadata for all threads to get category assignments.
      // In "None" mode, also include already-assigned board threads that may be
      // outside the recent message window.
      const threadMap = new Map();
      [
        ...ensureArray(threadsResponse.data?.threads),
        ...ensureArray(assignedResponse.data?.threads)
      ].forEach((thread) => {
        threadMap.set(getMessageKey(thread), thread);
      });
      const threads = Array.from(threadMap.values()).filter(matchesMessageFilters);
      
      // Debug: Log sample thread data to verify structure
      if (threads.length > 0) {
        console.log('📩 Fetched threads from API:', {
          total: threads.length,
          firstThread: threads[0],
          threadsWithNoOrderId: threads.filter(t => !t.orderId).length,
          threadsWithNoItem: threads.filter(t => !t.itemId || t.itemId === 'DIRECT_MESSAGE').length,
        });
        
        // Log specific raveoli_cart messages
        const raveoliThreads = threads.filter(t => 
          t.buyerUsername === 'raveoli_cart' || 
          (t.sellerId && sellers.find(s => s._id === t.sellerId && s.user?.username === 'raveoli_cart'))
        );
        if (raveoliThreads.length > 0) {
          console.log('🔍 raveoli_cart threads:', raveoliThreads.map(t => ({
            orderId: t.orderId,
            buyerUsername: t.buyerUsername,
            buyerName: t.buyerName,
            itemId: t.itemId,
            itemTitle: t.itemTitle,
            sellerId: t.sellerId,
            messageType: t.messageType,
            actualMessageType: t.actualMessageType
          })));
        }
      }
      
      // Group messages by category - messages ONLY appear in their assigned category OR "All Messages"
      const grouped = {
        [MESSAGE_CATEGORIES.ALL_MESSAGES]: [],
        [MESSAGE_CATEGORIES.ON_HOLD]: [],
        [MESSAGE_CATEGORIES.INR]: [],
        [MESSAGE_CATEGORIES.CANCELLATION]: [],
        [MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE]: [],
        [MESSAGE_CATEGORIES.OUT_OF_STOCK]: [],
        [MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT]: [],
        [MESSAGE_CATEGORIES.ISSUE_WITH_DELIVERY]: [],
        [MESSAGE_CATEGORIES.INQUIRY]: [],
      };

      // Fetch meta for each thread to get category
      const metaPromises = threads.map(async (thread) => {
        if (thread._conversationMeta) {
          return { thread, meta: thread._conversationMeta };
        }
        try {
          const params = {
            sellerId: thread.sellerId,
            buyerUsername: thread.buyerUsername,
            itemId: thread.itemId,
            orderId: thread.orderId || ''
          };
          const { data } = await api.get('/ebay/conversation-meta/single', {
            params,
            timeout: ALERT_REQUEST_TIMEOUT_MS,
          });
          return { thread, meta: data };
        } catch (err) {
          return { thread, meta: null };
        }
      });

      const threadMetaResults = await Promise.all(metaPromises);

      const enrichedThreads = [];
      threadMetaResults.forEach(({ thread, meta }) => {
        const enrichedThread = {
          ...thread,
          _conversationMeta: meta || thread._conversationMeta || null,
          category: meta?.category || thread.category || '',
          status: meta?.status || thread.status || 'Open',
          caseStatus: meta?.caseStatus || thread.caseStatus || 'Case Not Opened',
          pickedUpBy: meta?.pickedUpBy || thread.pickedUpBy || null
        };
        enrichedThreads.push(enrichedThread);
        // If no category assigned, add to "All Messages"
        if (!meta || !meta.category) {
          grouped[MESSAGE_CATEGORIES.ALL_MESSAGES].push(enrichedThread);
        } else {
          // Message has a category - add ONLY to that category, NOT to "All Messages"
          const category = meta.category;
          if (category === 'On Hold') {
            grouped[MESSAGE_CATEGORIES.ON_HOLD].push(enrichedThread);
          } else if (category === 'Return' || category === 'Refund' || category === 'Replace') {
            grouped[MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE].push(enrichedThread);
          } else if (category === 'Issue with Delivery') {
            grouped[MESSAGE_CATEGORIES.ISSUE_WITH_DELIVERY].push(enrichedThread);
          } else if (category === 'Issue with Product') {
            grouped[MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT].push(enrichedThread);
          } else if (category === 'Out of Stock') {
            grouped[MESSAGE_CATEGORIES.OUT_OF_STOCK].push(enrichedThread);
          } else if (category === 'INR') {
            grouped[MESSAGE_CATEGORIES.INR].push(enrichedThread);
          } else if (category === 'Cancellation') {
            grouped[MESSAGE_CATEGORIES.CANCELLATION].push(enrichedThread);
          } else if (category === 'Inquiry') {
            grouped[MESSAGE_CATEGORIES.INQUIRY].push(enrichedThread);
          }
        }
      });

      // DATA QUALITY REPORT
      const threadsWithoutOrderId = threads.filter(t => !t.orderId);
      const inquiryThreads = threads.filter(t => {
        const msgType = t.actualMessageType || t.messageType;
        return !t.orderId && (msgType === 'INQUIRY' || msgType === 'DIRECT' || t.itemId === 'DIRECT_MESSAGE');
      });
      const possiblyMissingOrderThreads = threadsWithoutOrderId.filter(t => {
        const msgType = t.actualMessageType || t.messageType;
        return msgType === 'ORDER'; // These claim to be ORDER messages but have no orderId
      });

      console.log('📊 Thread Summary:', {
        total: threads.length,
        withOrderId: threads.length - threadsWithoutOrderId.length,
        withoutOrderId: threadsWithoutOrderId.length,
        inquiryMessages: inquiryThreads.length,
        possiblyMissingOrderIds: possiblyMissingOrderThreads.length
      });

      if (possiblyMissingOrderThreads.length > 0) {
        console.warn('⚠️ Threads claiming to be ORDER messages but missing order IDs:', 
          possiblyMissingOrderThreads.map(t => ({
            buyerUsername: t.buyerUsername,
            itemId: t.itemId,
            messageType: t.messageType,
            actualMessageType: t.actualMessageType
          }))
        );
      }

      setMessages(grouped);
      setPendingMessageMoves({});
      setVisibleMessageCounts(buildVisibleCountMap(grouped));
      // Store all messages for alert calculations
      setAllMessagesForAlerts(enrichedThreads);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setError(err.response?.data?.error || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Load dropdown preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem('complianceBoardDropdownPreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.issueHubSourceCategory) setIssueHubSourceCategory(prefs.issueHubSourceCategory);
        if (prefs.issueHubWorkspaceCategory) setIssueHubWorkspaceCategory(prefs.issueHubWorkspaceCategory);
        if (prefs.orderCommunicationWorkCategory) setOrderCommunicationWorkCategory(prefs.orderCommunicationWorkCategory);
        if (prefs.fulfillmentIssueCategory) setFulfillmentIssueCategory(prefs.fulfillmentIssueCategory);
        if (prefs.fulfillmentProgressCategory) setFulfillmentProgressCategory(prefs.fulfillmentProgressCategory);
        if (prefs.returnCaseOpenedCategory) setReturnCaseOpenedCategory(prefs.returnCaseOpenedCategory);
        if (prefs.returnCaseNotOpenedCategory) setReturnCaseNotOpenedCategory(prefs.returnCaseNotOpenedCategory);
        if (prefs.returnFlowCategory) setReturnFlowCategory(prefs.returnFlowCategory);
        if (prefs.returnResolutionCategory) setReturnResolutionCategory(prefs.returnResolutionCategory);
        if (prefs.cancellationDecisionCategory) setCancellationDecisionCategory(prefs.cancellationDecisionCategory);
        if (prefs.inrPrimaryCategory) setInrPrimaryCategory(prefs.inrPrimaryCategory);
        if (prefs.inrSecondaryCategory) setInrSecondaryCategory(prefs.inrSecondaryCategory);
        if (prefs.inrActionCategory) setInrActionCategory(prefs.inrActionCategory);
        if (prefs.inrRefundCategory) setInrRefundCategory(prefs.inrRefundCategory);
        if (prefs.hasOwnProperty('showOnlyUnreadMessages')) setShowOnlyUnreadMessages(prefs.showOnlyUnreadMessages);
      }
    } catch (err) {
      console.error('Failed to load dropdown preferences:', err);
    }
  }, []);

  // Save dropdown preferences to localStorage whenever they change
  useEffect(() => {
    try {
      const prefs = {
        issueHubSourceCategory,
        issueHubWorkspaceCategory,
        orderCommunicationWorkCategory,
        fulfillmentIssueCategory,
        fulfillmentProgressCategory,
        returnCaseOpenedCategory,
        returnCaseNotOpenedCategory,
        returnFlowCategory,
        returnResolutionCategory,
        cancellationDecisionCategory,
        inrPrimaryCategory,
        inrSecondaryCategory,
        inrActionCategory,
        inrRefundCategory,
        showOnlyUnreadMessages,
      };
      localStorage.setItem('complianceBoardDropdownPreferences', JSON.stringify(prefs));
    } catch (err) {
      console.error('Failed to save dropdown preferences:', err);
    }
  }, [
    issueHubSourceCategory,
    issueHubWorkspaceCategory,
    orderCommunicationWorkCategory,
    fulfillmentIssueCategory,
    fulfillmentProgressCategory,
    returnCaseOpenedCategory,
    returnCaseNotOpenedCategory,
    returnFlowCategory,
    returnResolutionCategory,
    cancellationDecisionCategory,
    inrPrimaryCategory,
    inrSecondaryCategory,
    inrActionCategory,
    inrRefundCategory,
    showOnlyUnreadMessages,
  ]);

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchSellers(), fetchChatAgents()]); // Ensure sellers/agents load first
      fetchOrders();
    };
    init();
  }, [fetchOrders]);

  // Auto-refill empty/under-filled columns from next pages
  useEffect(() => {
    const autoRefillColumns = async () => {
      try {
        // Define column limits based on category
        const COLUMN_LIMITS = {
          [COLUMN_STATUS.TODO]: 50,
          [COLUMN_STATUS.OUT_OF_STOCK]: 50,
          [COLUMN_STATUS.CANCELLATION]: 50,
          [COLUMN_STATUS.ADDRESS_ISSUE]: 50,
          [COLUMN_STATUS.LATE_DELIVERY]: 50,
          [COLUMN_STATUS.NOT_FULFILLED]: 50,
          [COLUMN_STATUS.FULFILLED]: 100,
          [COLUMN_STATUS.BUYER_CONFIRMATION]: 50,
          // Return/Refund columns
          [COLUMN_STATUS.CASE_OPENED]: 500,
          [COLUMN_STATUS.CASE_NOT_OPENED]: 500,
          [COLUMN_STATUS.RETURN_FOLLOW_UP]: 500,
          [COLUMN_STATUS.PROVIDE_RETURN_LABEL]: 500,
          [COLUMN_STATUS.BUYER_DROP_OFF]: 500,
          [COLUMN_STATUS.ITEM_DELIVERED]: 500,
          [COLUMN_STATUS.PARTIAL_REFUND]: 500,
          [COLUMN_STATUS.FULL_REFUND]: 500,
          [COLUMN_STATUS.REPLACEMENT]: 500,
          // Cancellation columns
          [COLUMN_STATUS.CANCELLATION_REQUEST]: 500,
          [COLUMN_STATUS.ACCEPTED]: 500,
          [COLUMN_STATUS.DECLINED]: 500,
          // INR columns
          [COLUMN_STATUS.INR_CASE_OPENED]: 500,
          [COLUMN_STATUS.INR_FOLLOW_UP]: 500,
          [COLUMN_STATUS.INR_TRACKING_ID_UPLOAD]: 500,
          [COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN]: 500,
          [COLUMN_STATUS.INR_FULLY_REFUNDED]: 500,
          [COLUMN_STATUS.INR_PARTIAL_REFUND]: 500,
          [COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED]: 500,
        };
        
        // Check which columns need refilling
        const columnsNeedingRefill = [];
        
        Object.entries(orders).forEach(([status, items]) => {
          const columnLimit = COLUMN_LIMITS[status] || 50;
          const currentCount = items.length;
          const statsCount = statusCounts[status] ?? currentCount;
          
          // If column has less than its limit and stats say there are more orders out there
          if (currentCount < columnLimit && currentCount < statsCount) {
            const needed = Math.min(columnLimit - currentCount, statsCount - currentCount);
            if (needed > 0) {
              columnsNeedingRefill.push({
                status,
                currentCount,
                statsCount,
                columnLimit,
                needed
              });
            }
          }
        });
        
        if (columnsNeedingRefill.length > 0) {
          console.log(`[AUTO-REFILL-COLUMNS] Found ${columnsNeedingRefill.length} columns needing refill:`, 
            columnsNeedingRefill.map(c => `${c.status}(${c.currentCount}/${c.needed})`).join(', ')
          );
          
          if (currentPage <= pagination.totalPages && pagination.totalPages > 1) {
            await refillColumnsFromNextPages(columnsNeedingRefill);
          }
        }
      } catch (err) {
        console.warn('[AUTO-REFILL-COLUMNS] Error during auto-refill:', err);
      }
    };

    // Only auto-refill if not currently loading
    if (!loading && statusCounts && Object.keys(statusCounts).length > 0) {
      autoRefillColumns();
    }
  }, [orders, currentPage, pagination, selectedCategory, loading, statusCounts]);

  const fetchSellers = async () => {
    try {
      const { data } = await api.get('/sellers/all');
      setSellers(data || []);
      console.log('Fetched sellers:', {
        count: data?.length || 0,
        sample: data?.slice(0, 3).map(s => ({
          id: s._id,
          username: s.user?.username,
          email: s.user?.email
        }))
      });
    } catch (err) {
      console.error('Failed to fetch sellers:', err);
      setSellers([]);
    }
  };

  const handleApplyFilters = () => {
    console.log(`[APPLY-FILTERS] Applying filters, draftDateFilter:`, draftDateFilter);
    setDateFilter(draftDateFilter);
    setStatsDateFilter(draftDateFilter); // Sync stats filter with board filter
    setSearchOrderId(draftSearchOrderId);
    setSearchBuyerName(draftSearchBuyerName);
    setExcludeClient(draftExcludeClient);
    setExcludeLowValue(draftExcludeLowValue);
    setCurrentPage(1);
  };

  const handleClearDateFilters = () => {
    const emptyDateFilter = createEmptyDateFilter();
    setDateFilter(emptyDateFilter);
    setStatsDateFilter(emptyDateFilter); // Sync stats filter with board filter
    setDraftDateFilter(emptyDateFilter);
    setSelectedSeller('');
    setSearchOrderId('');
    setDraftSearchOrderId('');
    setSearchBuyerName('');
    setDraftSearchBuyerName('');
    setExcludeClient(true);
    setDraftExcludeClient(true);
    setExcludeLowValue(true);
    setDraftExcludeLowValue(true);
    setCurrentPage(1);
  };

  const getMessageKey = (item) => (
    `${item.sellerId || 'seller'}-${item.orderId || 'no-order'}-${item.buyerUsername || 'buyer'}-${item.itemId || 'item'}`
  );

  const updateMessageByKey = (messageKey, updater) => {
    const updateList = (list = []) => list.map((item) => (
      getMessageKey(item) === messageKey ? updater(item) : item
    ));

    setMessages((prev) => Object.entries(prev).reduce((acc, [columnId, items]) => ({
      ...acc,
      [columnId]: updateList(items)
    }), {}));

    setPendingMessageMoves((prev) => Object.entries(prev).reduce((acc, [columnId, moves]) => {
      const nextMoves = Object.entries(moves || {}).reduce((moveAcc, [key, item]) => ({
        ...moveAcc,
        [key]: key === messageKey ? updater(item) : item
      }), {});
      return { ...acc, [columnId]: nextMoves };
    }, {}));

    setAllMessagesForAlerts((prev) => updateList(prev));
    setAlertPreviewItems((prev) => (Array.isArray(prev) ? updateList(prev) : prev));
    setSelectedOrderForMessage((prev) => (
      prev && getMessageKey(prev) === messageKey ? updater(prev) : prev
    ));
  };

  const handleMessagePickedUpByChange = async (message, nextPickedUpBy) => {
    const messageKey = getMessageKey(message);
    const previousPickedUpBy = message.pickedUpBy || '';
    setSavingPickedUpByKey(messageKey);

    const applyPickedUpBy = (item, pickedUpBy) => ({
      ...item,
      pickedUpBy: pickedUpBy || null,
      _conversationMeta: item._conversationMeta
        ? { ...item._conversationMeta, pickedUpBy: pickedUpBy || null }
        : item._conversationMeta
    });

    updateMessageByKey(messageKey, (item) => applyPickedUpBy(item, nextPickedUpBy));

    try {
      const category = message.category || message._conversationMeta?.category || '';
      const { data } = await api.post('/ebay/conversation-meta', {
        sellerId: message.sellerId,
        buyerUsername: message.buyerUsername,
        orderId: message.orderId || null,
        itemId: message.itemId || 'DIRECT_MESSAGE',
        category,
        status: message.status || message._conversationMeta?.status || 'Open',
        caseStatus: message.caseStatus || message._conversationMeta?.caseStatus || 'Case Not Opened',
        pickedUpBy: nextPickedUpBy || null
      });

      if (data?.meta) {
        updateMessageByKey(messageKey, (item) => ({
          ...item,
          _conversationMeta: data.meta,
          category: data.meta.category || '',
          status: data.meta.status || 'Open',
          caseStatus: data.meta.caseStatus || 'Case Not Opened',
          pickedUpBy: data.meta.pickedUpBy || null
        }));
      }
    } catch (err) {
      updateMessageByKey(messageKey, (item) => applyPickedUpBy(item, previousPickedUpBy));
      setSnackbar({
        open: true,
        message: `Failed: ${err.response?.data?.error || err.message}`,
      });
    } finally {
      setSavingPickedUpByKey('');
    }
  };

  const getPickedUpByLabel = (item) => (
    item?.pickedUpBy ||
    item?.conversationInfo?.pickedUpBy ||
    item?._conversationMeta?.pickedUpBy ||
    ''
  );

  const buildVisibleCountMap = (itemsByColumn) => Object.keys(itemsByColumn || {}).reduce((acc, key) => {
    acc[key] = Math.min(LOAD_MORE_STEP, itemsByColumn[key]?.length || 0);
    return acc;
  }, {});

  const getPendingCount = (pendingMap, columnId) => Object.keys(pendingMap[columnId] || {}).length;

  const getVisibleOrderCount = (status) => visibleOrderCounts[status] ?? LOAD_MORE_STEP;
  const getVisibleMessageCount = (categoryId) => visibleMessageCounts[categoryId] ?? LOAD_MORE_STEP;

  const getIssueHubOption = (categoryId) => ISSUE_HUB_OPTIONS.find((option) => option.id === categoryId) || ISSUE_HUB_OPTIONS[0];
  const getIssueHubItems = (categoryId) => (
    ISSUE_HUB_MESSAGE_COLUMNS.has(categoryId)
      ? (messages[categoryId] || [])
      : (orders[categoryId] || [])
  );
  const normalizeMatchValue = (value) => String(value || '').trim().toLowerCase();
  const getSellerMatchId = (item) => String(
    item?.seller?._id ||
    item?.sellerId ||
    item?.seller ||
    item?.returnInfo?.sellerId ||
    ''
  ).trim();
  const getBuyerMatchValues = (item) => new Set([
    normalizeMatchValue(item?.buyer?.username),
    normalizeMatchValue(item?.buyerUsername),
    normalizeMatchValue(item?.buyer?.buyerRegistrationAddress?.fullName),
    normalizeMatchValue(item?.buyerName),
  ].filter(Boolean));
  const getOrderMatchValues = (item) => new Set([
    normalizeMatchValue(item?.orderId),
    normalizeMatchValue(item?.originalOrderId),
    normalizeMatchValue(item?.caseOrderId),
    normalizeMatchValue(item?.caseId),
    normalizeMatchValue(item?.returnId),
    normalizeMatchValue(item?.returnInfo?.orderId),
    normalizeMatchValue(item?.conversationInfo?.orderId),
  ].filter(Boolean));
  const getItemMatchValues = (item) => new Set([
    normalizeMatchValue(item?.itemId),
    normalizeMatchValue(item?.itemNumber),
    normalizeMatchValue(item?.legacyItemId),
    normalizeMatchValue(item?.returnInfo?.itemId),
    normalizeMatchValue(item?.conversationInfo?.itemId),
    ...ensureArray(item?.lineItems)
      .flatMap((lineItem) => [
        lineItem?.legacyItemId,
        lineItem?.itemId,
        lineItem?.sku,
      ])
      .map(normalizeMatchValue),
  ].filter(Boolean));
  const getDirectUnreadCount = (item) => Math.max(
    Number(item?.unreadCount) || 0,
    Number(item?.messageUnreadCount) || 0,
    Number(item?.conversationInfo?.unreadCount) || 0,
    Number(item?.returnInfo?.unreadCount) || 0,
  );
  const getUnreadMessageCountForOrder = (order) => {
    const directUnreadCount = getDirectUnreadCount(order);
    if (directUnreadCount > 0) return directUnreadCount;

    const sellerId = getSellerMatchId(order);
    const orderIds = getOrderMatchValues(order);
    const itemIds = getItemMatchValues(order);
    const buyerValues = getBuyerMatchValues(order);
    const seenThreads = new Set();

    return allMessagesForAlerts.reduce((total, thread) => {
      const unreadCount = Number(thread?.unreadCount) || 0;
      if (unreadCount <= 0) return total;

      const threadKey = thread?.conversationId || thread?._id || getMessageKey(thread);
      if (seenThreads.has(threadKey)) return total;
      seenThreads.add(threadKey);

      const threadSellerId = getSellerMatchId(thread);
      if (sellerId && threadSellerId && sellerId !== threadSellerId) return total;

      const threadOrderIds = getOrderMatchValues(thread);
      const hasOrderMatch = [...threadOrderIds].some((orderId) => orderIds.has(orderId));
      if (hasOrderMatch) return total + unreadCount;

      const threadItemIds = getItemMatchValues(thread);
      const hasItemMatch = [...threadItemIds].some((itemId) => itemIds.has(itemId));
      if (!hasItemMatch) return total;

      const threadBuyerValues = getBuyerMatchValues(thread);
      const hasBuyerMatch = buyerValues.size === 0 ||
        threadBuyerValues.size === 0 ||
        [...threadBuyerValues].some((buyerValue) => buyerValues.has(buyerValue));

      return hasBuyerMatch ? total + unreadCount : total;
    }, 0);
  };
  const parseTimeMs = (value) => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const getOverdueMessages = () => {
    const nowMs = Date.now();
    const allBoardMessages = selectedCategory === 'order_communication' || selectedCategory === 'issue_hub'
      ? Object.values(messages).flat()
      : allMessagesForAlerts;

    return allBoardMessages.filter((msg) => {
      // Only check messages where buyer sent the last message
      if (msg.sender !== 'BUYER') return false;

      const lastMessageTime = parseTimeMs(msg.lastDate || msg.lastMessageDate || msg.messageDate);
      if (!lastMessageTime) return false;

      const elapsedMs = nowMs - lastMessageTime;
      return elapsedMs > MESSAGE_REPLY_SLA_MS;
    }).map((msg) => {
      const lastMessageTime = parseTimeMs(msg.lastDate || msg.lastMessageDate || msg.messageDate);
      const elapsedMs = nowMs - lastMessageTime;
      return {
        ...msg,
        _overdueInfo: {
          lastMessageTime: msg.lastDate || msg.lastMessageDate || msg.messageDate,
          elapsedMs,
          overdueMs: elapsedMs - MESSAGE_REPLY_SLA_MS,
          alertType: MESSAGE_OVERDUE_ALERT_ID,
          message: `No reply sent for ${formatElapsed(elapsedMs)}.`,
        }
      };
    });
  };
  const formatElapsed = (ms) => {
    if (ms < ONE_HOUR_MS) return '<1 hr';
    if (ms < ONE_DAY_MS) {
      const hours = Math.floor(ms / ONE_HOUR_MS);
      return `${hours} hr${hours === 1 ? '' : 's'}`;
    }
    const days = Math.floor(ms / ONE_DAY_MS);
    const remainderHours = Math.floor((ms % ONE_DAY_MS) / ONE_HOUR_MS);
    return remainderHours > 0
      ? `${days} day${days === 1 ? '' : 's'} ${remainderHours} hr${remainderHours === 1 ? '' : 's'}`
      : `${days} day${days === 1 ? '' : 's'}`;
  };
  const isReturnOverdueAlert = (alertId) => [RETURN_LABEL_OVERDUE_ALERT_ID, PAYMENT_STATUS_OVERDUE_ALERT_ID].includes(alertId);
  const isFulfillmentIssueOverdueAlert = (alertId) => Boolean(FULFILLMENT_ISSUE_STATUS_BY_ALERT_ID[alertId]);
  const isMessageOverdueAlert = (alertId) => alertId === MESSAGE_OVERDUE_ALERT_ID;

  const getAlertPreviewItems = (boardCategory, alertId) => {
    if (isMessageOverdueAlert(alertId)) {
      return getOverdueMessages();
    }
    return boardCategory === 'order_communication'
      ? (messages[alertId] || [])
      : boardCategory === 'order_fulfillment' && isFulfillmentIssueOverdueAlert(alertId)
        ? getOverdueFulfillmentIssueOrders(FULFILLMENT_ISSUE_STATUS_BY_ALERT_ID[alertId])
        : boardCategory === 'return_refund' && alertId === RETURN_LABEL_OVERDUE_ALERT_ID
          ? getOverdueReturnLabelOrders()
          : boardCategory === 'return_refund' && alertId === PAYMENT_STATUS_OVERDUE_ALERT_ID
            ? getOverduePaymentStatusOrders()
            : (orders[alertId] || []);
  };
  const handleAlertPreviewSelect = async (alertId) => {
    setActiveAlertPreviewId(alertId);
    setAlertPreviewItems(null);

    if (
      selectedCategory === 'order_communication' ||
      selectedCategory === 'issue_hub' ||
      isMessageOverdueAlert(alertId)
    ) {
      return;
    }

    setAlertPreviewLoading(true);
    try {
      const params = {
        category: selectedCategory,
        page: 1,
        limit: 500,
        ...buildDateParams(),
        ...buildBoardFilterParams(),
      };

      if (
        isFulfillmentIssueOverdueAlert(alertId) ||
        isReturnOverdueAlert(alertId)
      ) {
        params.overdueAlert = alertId;
      } else {
        params.statusFilter = alertId;
      }

      const { data } = await api.get('/orders/compliance-board', {
        params,
        timeout: BOARD_REQUEST_TIMEOUT_MS,
      });
      setAlertPreviewItems(ensureArray(data?.orders));
    } catch (err) {
      console.error('Failed to load alert preview items:', err);
      setAlertPreviewItems([]);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to load preview items'
      });
    } finally {
      setAlertPreviewLoading(false);
    }
  };
  const getAlertPreviewVisibleCount = (boardCategory, alertId) => {
    if (isMessageOverdueAlert(alertId)) {
      return visibleMessageCounts[alertId] ?? LOAD_MORE_STEP;
    }
    return boardCategory === 'order_communication'
      ? getVisibleMessageCount(alertId)
      : (boardCategory === 'return_refund' && isReturnOverdueAlert(alertId)) ||
        (boardCategory === 'order_fulfillment' && isFulfillmentIssueOverdueAlert(alertId))
        ? (visibleOrderCounts[alertId] ?? LOAD_MORE_STEP)
        : getVisibleOrderCount(alertId);
  };
  const handleLoadMoreAlertPreviewItems = (boardCategory, alertId, totalItems) => {
    if (isMessageOverdueAlert(alertId)) {
      setVisibleMessageCounts((prev) => ({
        ...prev,
        [alertId]: Math.min(totalItems, (prev[alertId] ?? LOAD_MORE_STEP) + LOAD_MORE_STEP),
      }));
      return;
    }

    if (boardCategory === 'order_communication') {
      handleLoadMoreMessages(alertId);
      return;
    }

    if (
      (boardCategory === 'return_refund' && isReturnOverdueAlert(alertId)) ||
      (boardCategory === 'order_fulfillment' && isFulfillmentIssueOverdueAlert(alertId))
    ) {
      setVisibleOrderCounts((prev) => ({
        ...prev,
        [alertId]: Math.min(totalItems, (prev[alertId] ?? LOAD_MORE_STEP) + LOAD_MORE_STEP),
      }));
      return;
    }

    handleLoadMoreOrders(alertId);
  };
  const getFulfillmentIssueTimerStart = (order, status) => {
    if (!order) return null;
    if (status === COLUMN_STATUS.OUT_OF_STOCK) return order.outOfStockAssignedAt || order.updatedAt || null;
    if (status === COLUMN_STATUS.CANCELLATION) return order.cancellationAssignedAt || order.updatedAt || null;
    if (status === COLUMN_STATUS.ADDRESS_ISSUE) return order.addressIssueAssignedAt || order.updatedAt || null;
    return null;
  };
  const getOverdueFulfillmentIssueOrders = (status) => {
    const candidateOrders = orders[status] || [];
    const nowMs = Date.now();

    return candidateOrders.reduce((acc, order) => {
      const startedAt = getFulfillmentIssueTimerStart(order, status);
      const startedAtMs = parseTimeMs(startedAt);
      if (!startedAtMs) return acc;

      const elapsedMs = nowMs - startedAtMs;
      if (elapsedMs <= RETURN_LABEL_SLA_MS) return acc;

      acc.push({
        ...order,
        _overdueInfo: {
          startedAt,
          elapsedMs,
          overdueMs: elapsedMs - RETURN_LABEL_SLA_MS,
          sourceStatus: getColumnTitle(status),
          alertType: FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[status],
          message: `Not moved to Not Fulfilled, Fulfilled, or Buyer Confirmation for ${formatElapsed(elapsedMs)}.`,
        }
      });
      return acc;
    }, []);
  };
  const getReturnBoardTimerStart = (order) => {
    if (!order) return null;
    if (order.complianceBoardStatus === COLUMN_STATUS.CASE_OPENED) {
      return order.returnInfo?.createdDate || order.dateSold || null;
    }
    if (order.complianceBoardStatus === COLUMN_STATUS.CASE_NOT_OPENED) {
      return order.returnCaseNotOpenedAssignedAt || order.conversationInfo?.updatedAt || null;
    }
    return null;
  };
  const getOverdueReturnLabelOrders = () => {
    const candidateOrders = [
      ...(orders[COLUMN_STATUS.CASE_OPENED] || []),
      ...(orders[COLUMN_STATUS.CASE_NOT_OPENED] || []),
    ];
    const nowMs = Date.now();

    return candidateOrders.reduce((acc, order) => {
      const startedAt = getReturnBoardTimerStart(order);
      const startedAtMs = parseTimeMs(startedAt);
      if (!startedAtMs) return acc;

      const elapsedMs = nowMs - startedAtMs;
      if (elapsedMs <= RETURN_LABEL_SLA_MS) return acc;

      acc.push({
        ...order,
        _overdueInfo: {
          startedAt,
          elapsedMs,
          overdueMs: elapsedMs - RETURN_LABEL_SLA_MS,
          sourceStatus: order.complianceBoardStatus === COLUMN_STATUS.CASE_OPENED ? 'Case Opened' : 'Case Not Opened',
          alertType: RETURN_LABEL_OVERDUE_ALERT_ID,
        }
      });
      return acc;
    }, []);
  };
  const getOverduePaymentStatusOrders = () => {
    const candidateOrders = orders[COLUMN_STATUS.ITEM_DELIVERED] || [];
    const nowMs = Date.now();

    return candidateOrders.reduce((acc, order) => {
      const startedAt = order.returnItemDeliveredAssignedAt || null;
      const startedAtMs = parseTimeMs(startedAt);
      if (!startedAtMs) return acc;

      const elapsedMs = nowMs - startedAtMs;
      if (elapsedMs <= RETURN_LABEL_SLA_MS) return acc;

      acc.push({
        ...order,
        _overdueInfo: {
          startedAt,
          elapsedMs,
          overdueMs: elapsedMs - RETURN_LABEL_SLA_MS,
          sourceStatus: 'Item Delivered',
          alertType: PAYMENT_STATUS_OVERDUE_ALERT_ID,
        }
      });
      return acc;
    }, []);
  };

  const getStatusCount = (status) => (
    statusCounts[status] ?? orders[status]?.length ?? 0
  );
  const getOverdueCount = (alertId, fallbackCount) => (
    overdueCounts[alertId] ?? fallbackCount
  );

  const getAlertsForCurrentBoard = () => {
    const overdueMessages = getOverdueMessages();
    
    if (selectedCategory === 'issue_hub') {
      return ISSUE_HUB_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        color: option.color,
        count: getIssueHubItems(option.id).length,
        type: 'stat',
      }));
    }

    if (selectedCategory === 'order_communication') {
      return [
        { id: MESSAGE_CATEGORIES.ON_HOLD, label: 'On Hold', color: '#64748b', count: messages[MESSAGE_CATEGORIES.ON_HOLD]?.length || 0, type: 'stat' },
        { id: MESSAGE_CATEGORIES.INR, label: 'INR', color: BRAND_RED, count: messages[MESSAGE_CATEGORIES.INR]?.length || 0, type: 'stat' },
        { id: MESSAGE_CATEGORIES.CANCELLATION, label: 'Cancellation', color: BRAND_ORANGE, count: messages[MESSAGE_CATEGORIES.CANCELLATION]?.length || 0, type: 'stat' },
        { id: MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE, label: 'Return / Refund / Replace', color: '#8b5cf6', count: messages[MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE]?.length || 0, type: 'stat' },
        { id: MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT, label: 'Issue with Product', color: '#ea580c', count: messages[MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT]?.length || 0, type: 'stat' },
        { id: MESSAGE_CATEGORIES.INQUIRY, label: 'Inquiry', color: BRAND_GREEN, count: messages[MESSAGE_CATEGORIES.INQUIRY]?.length || 0, type: 'stat' },
        { id: MESSAGE_OVERDUE_ALERT_ID, label: 'Overdue Replies (8h+)', color: '#dc2626', count: overdueMessages.length, type: 'alert' },
      ];
    }

    if (selectedCategory === 'return_refund') {
      const overdueReturnLabelOrders = getOverdueReturnLabelOrders();
      const overduePaymentStatusOrders = getOverduePaymentStatusOrders();
      return [
        { id: COLUMN_STATUS.CASE_OPENED, label: 'Case Opened', color: BRAND_RED, count: getStatusCount(COLUMN_STATUS.CASE_OPENED), type: 'stat' },
        { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: BRAND_ORANGE, count: getStatusCount(COLUMN_STATUS.CASE_NOT_OPENED), type: 'stat' },
        { id: COLUMN_STATUS.RETURN_FOLLOW_UP, label: 'Follow Up', color: '#8b5cf6', count: getStatusCount(COLUMN_STATUS.RETURN_FOLLOW_UP), type: 'stat' },
        { id: COLUMN_STATUS.PROVIDE_RETURN_LABEL, label: 'Provide Return Label', color: BRAND_BLUE, count: getStatusCount(COLUMN_STATUS.PROVIDE_RETURN_LABEL), type: 'stat' },
        { id: COLUMN_STATUS.BUYER_DROP_OFF, label: 'Buyer Drop Off', color: '#a855f7', count: getStatusCount(COLUMN_STATUS.BUYER_DROP_OFF), type: 'stat' },
        { id: COLUMN_STATUS.ITEM_DELIVERED, label: 'Item Delivered', color: '#06b6d4', count: getStatusCount(COLUMN_STATUS.ITEM_DELIVERED), type: 'stat' },
        { id: COLUMN_STATUS.PARTIAL_REFUND, label: 'Partial Refund', color: BRAND_YELLOW_DARK, count: getStatusCount(COLUMN_STATUS.PARTIAL_REFUND), type: 'stat' },
        { id: COLUMN_STATUS.FULL_REFUND, label: 'Full Refund', color: BRAND_GREEN, count: getStatusCount(COLUMN_STATUS.FULL_REFUND), type: 'stat' },
        { id: COLUMN_STATUS.REPLACEMENT, label: 'Replacement', color: '#0f766e', count: getStatusCount(COLUMN_STATUS.REPLACEMENT), type: 'stat' },
        { id: RETURN_LABEL_OVERDUE_ALERT_ID, label: '48h Not Moved', color: '#dc2626', count: getOverdueCount(RETURN_LABEL_OVERDUE_ALERT_ID, overdueReturnLabelOrders.length), type: 'alert' },
        { id: PAYMENT_STATUS_OVERDUE_ALERT_ID, label: 'Payment Status', color: '#b91c1c', count: getOverdueCount(PAYMENT_STATUS_OVERDUE_ALERT_ID, overduePaymentStatusOrders.length), type: 'alert' },
        { id: MESSAGE_OVERDUE_ALERT_ID, label: 'Overdue Replies (8h+)', color: '#7f1d1d', count: overdueMessages.length, type: 'alert' },
      ];
    }

    if (selectedCategory === 'cancellation') {
      return [
        { id: COLUMN_STATUS.CANCELLATION_REQUEST, label: 'Case Opened', color: BRAND_RED, count: getStatusCount(COLUMN_STATUS.CANCELLATION_REQUEST), type: 'stat' },
        { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: BRAND_ORANGE, count: getStatusCount(COLUMN_STATUS.CASE_NOT_OPENED), type: 'stat' },
        { id: COLUMN_STATUS.ACCEPTED, label: 'Accepted', color: BRAND_GREEN, count: getStatusCount(COLUMN_STATUS.ACCEPTED), type: 'stat' },
        { id: COLUMN_STATUS.DECLINED, label: 'Declined', color: BRAND_ORANGE, count: getStatusCount(COLUMN_STATUS.DECLINED), type: 'stat' },
        { id: MESSAGE_OVERDUE_ALERT_ID, label: 'Overdue Replies (8h+)', color: '#dc2626', count: overdueMessages.length, type: 'alert' },
      ];
    }

    if (selectedCategory === 'inr') {
      return [
        { id: COLUMN_STATUS.INR_CASE_OPENED, label: 'Case Opened', color: BRAND_RED, count: getStatusCount(COLUMN_STATUS.INR_CASE_OPENED), type: 'stat' },
        { id: COLUMN_STATUS.CASE_NOT_OPENED, label: 'Case Not Opened', color: BRAND_ORANGE, count: getStatusCount(COLUMN_STATUS.CASE_NOT_OPENED), type: 'stat' },
        { id: COLUMN_STATUS.INR_FOLLOW_UP, label: 'Follow Up', color: '#8b5cf6', count: getStatusCount(COLUMN_STATUS.INR_FOLLOW_UP), type: 'stat' },
        { id: COLUMN_STATUS.INR_TRACKING_ID_UPLOAD, label: 'Tracking ID Upload', color: '#06b6d4', count: getStatusCount(COLUMN_STATUS.INR_TRACKING_ID_UPLOAD), type: 'stat' },
        { id: COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN, label: 'Case Open (Ebay Step In)', color: BRAND_RED, count: getStatusCount(COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN), type: 'stat' },
        { id: COLUMN_STATUS.INR_FULLY_REFUNDED, label: 'Fully Refunded', color: BRAND_GREEN, count: getStatusCount(COLUMN_STATUS.INR_FULLY_REFUNDED), type: 'stat' },
        { id: COLUMN_STATUS.INR_PARTIAL_REFUND, label: 'Partial Refund', color: BRAND_YELLOW_DARK, count: getStatusCount(COLUMN_STATUS.INR_PARTIAL_REFUND), type: 'stat' },
        { id: COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED, label: 'Resolved', color: BRAND_BLUE, count: getStatusCount(COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED), type: 'stat' },
        { id: MESSAGE_OVERDUE_ALERT_ID, label: 'Overdue Replies (8h+)', color: '#dc2626', count: overdueMessages.length, type: 'alert' },
      ];
    }

    const overdueOutOfStockOrders = getOverdueFulfillmentIssueOrders(COLUMN_STATUS.OUT_OF_STOCK);
    const overdueCancellationOrders = getOverdueFulfillmentIssueOrders(COLUMN_STATUS.CANCELLATION);
    const overdueAddressIssueOrders = getOverdueFulfillmentIssueOrders(COLUMN_STATUS.ADDRESS_ISSUE);
    const overdueLateLateDeliveryOrders = getOverdueFulfillmentIssueOrders(COLUMN_STATUS.LATE_DELIVERY);
    return [
      { id: COLUMN_STATUS.TODO, label: 'To Do', color: BRAND_RED, count: getStatusCount(COLUMN_STATUS.TODO), type: 'stat' },
      { id: COLUMN_STATUS.OUT_OF_STOCK, label: 'Out of Stock', color: BRAND_ORANGE, count: getStatusCount(COLUMN_STATUS.OUT_OF_STOCK), type: 'stat' },
      { id: COLUMN_STATUS.CANCELLATION, label: 'Cancellation', color: BRAND_BLUE, count: getStatusCount(COLUMN_STATUS.CANCELLATION), type: 'stat' },
      { id: COLUMN_STATUS.ADDRESS_ISSUE, label: 'Address Issue', color: '#a855f7', count: getStatusCount(COLUMN_STATUS.ADDRESS_ISSUE), type: 'stat' },
      { id: COLUMN_STATUS.LATE_DELIVERY, label: 'Late Delivery', color: '#dc2626', count: getStatusCount(COLUMN_STATUS.LATE_DELIVERY), type: 'stat' },
      { id: COLUMN_STATUS.NOT_FULFILLED, label: 'Not Fulfilled', color: BRAND_YELLOW_DARK, count: getStatusCount(COLUMN_STATUS.NOT_FULFILLED), type: 'stat' },
      { id: COLUMN_STATUS.FULFILLED, label: 'Fulfilled', color: BRAND_GREEN, count: getStatusCount(COLUMN_STATUS.FULFILLED), type: 'stat' },
      { id: COLUMN_STATUS.BUYER_CONFIRMATION, label: 'Buyer Confirmation', color: '#0f766e', count: getStatusCount(COLUMN_STATUS.BUYER_CONFIRMATION), type: 'stat' },
      { id: FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.OUT_OF_STOCK], label: 'Out of Stock 48h+', color: '#dc2626', count: getOverdueCount(FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.OUT_OF_STOCK], overdueOutOfStockOrders.length), type: 'alert' },
      { id: FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.CANCELLATION], label: 'Cancellation 48h+', color: '#b91c1c', count: getOverdueCount(FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.CANCELLATION], overdueCancellationOrders.length), type: 'alert' },
      { id: FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.ADDRESS_ISSUE], label: 'Address Issue 48h+', color: '#7f1d1d', count: getOverdueCount(FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.ADDRESS_ISSUE], overdueAddressIssueOrders.length), type: 'alert' },
      { id: FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.LATE_DELIVERY], label: 'Late Delivery 48h+', color: '#7c2d12', count: getOverdueCount(FULFILLMENT_ISSUE_OVERDUE_ALERT_IDS[COLUMN_STATUS.LATE_DELIVERY], overdueLateLateDeliveryOrders.length), type: 'alert' },
      { id: MESSAGE_OVERDUE_ALERT_ID, label: 'Overdue Replies (8h+)', color: '#991b1b', count: overdueMessages.length, type: 'alert' },
    ];
  };

  const handleLoadMoreOrders = (status) => {
    setVisibleOrderCounts((prev) => ({
      ...prev,
      [status]: Math.min((orders[status]?.length || 0), (prev[status] ?? LOAD_MORE_STEP) + LOAD_MORE_STEP),
    }));
  };

  const handleLoadMoreMessages = (categoryId) => {
    setVisibleMessageCounts((prev) => ({
      ...prev,
      [categoryId]: Math.min((messages[categoryId]?.length || 0), (prev[categoryId] ?? LOAD_MORE_STEP) + LOAD_MORE_STEP),
    }));
  };

  const getColumnCount = (status) => {
    let statusOrders = orders[status] || [];
    if (showOnlyUnreadMessages) {
      statusOrders = statusOrders.filter(order => getUnreadMessageCountForOrder(order) > 0);
    }
    
    // Filter out CANCELED orders from order_fulfillment board
    if (selectedCategory === 'order_fulfillment') {
      statusOrders = statusOrders.filter(order => order.cancelState !== 'CANCELED');
    }
    
    if (selectedCategory === 'return_refund' && status === COLUMN_STATUS.CASE_OPENED) {
      const baseCount = boardSourceCounts.caseOpenedReturnRequests ?? orders[status]?.length ?? 0;
      if (showOnlyUnreadMessages) {
        return statusOrders.length;
      }
      return baseCount;
    }
    return statusOrders.length;
  };

  const addPendingOrderMove = (order, destColumn) => {
    setPendingOrderMoves((prev) => {
      const next = {};
      Object.entries(prev).forEach(([columnId, moves]) => {
        const remaining = { ...moves };
        delete remaining[order._id];
        if (Object.keys(remaining).length > 0) {
          next[columnId] = remaining;
        }
      });

      const persistedStatus = order.complianceBoardStatus || COLUMN_STATUS.TODO;
      const categories = Array.isArray(order.complianceBoardCategories)
        ? order.complianceBoardCategories
        : (order.complianceBoardCategory ? [order.complianceBoardCategory] : []);
      const isAlreadyApplied = persistedStatus === destColumn && categories.includes(selectedCategory);

      if (!isAlreadyApplied) {
        next[destColumn] = {
          ...(next[destColumn] || {}),
          [order._id]: order,
        };
      }

      return next;
    });
  };

  const addPendingMessageMove = (message, destColumn) => {
    const key = getMessageKey(message);
    setPendingMessageMoves((prev) => {
      const next = {};
      Object.entries(prev).forEach(([columnId, moves]) => {
        const remaining = { ...moves };
        delete remaining[key];
        if (Object.keys(remaining).length > 0) {
          next[columnId] = remaining;
        }
      });

      next[destColumn] = {
        ...(next[destColumn] || {}),
        [key]: message,
      };

      return next;
    });
  };

  const clearPendingMessageMove = (message) => {
    const key = getMessageKey(message);
    setPendingMessageMoves((prev) => {
      const next = {};
      Object.entries(prev).forEach(([columnId, moves]) => {
        const remaining = { ...moves };
        delete remaining[key];
        if (Object.keys(remaining).length > 0) {
          next[columnId] = remaining;
        }
      });
      return next;
    });
  };

  const mapMessageCategoryForApi = (destColumn) => {
    if (destColumn === MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE) return 'Return';
    if (destColumn === MESSAGE_CATEGORIES.ISSUE_WITH_DELIVERY) return 'Issue with Delivery';
    if (destColumn === MESSAGE_CATEGORIES.ISSUE_WITH_PRODUCT) return 'Issue with Product';
    if (destColumn === MESSAGE_CATEGORIES.OUT_OF_STOCK) return 'Out of Stock';
    return destColumn;
  };

  const getOrderAssignmentForMessageCategory = (categoryId) => {
    if (categoryId === MESSAGE_CATEGORIES.INR) {
      return {
        complianceBoardCategory: 'inr',
        complianceBoardStatus: COLUMN_STATUS.CASE_NOT_OPENED,
        complianceBoardSource: 'order_communication',
      };
    }
    if (categoryId === MESSAGE_CATEGORIES.CANCELLATION) {
      return {
        complianceBoardCategory: 'cancellation',
        complianceBoardStatus: COLUMN_STATUS.CASE_NOT_OPENED,
        complianceBoardSource: 'order_communication',
      };
    }
    if (categoryId === MESSAGE_CATEGORIES.RETURN_REFUND_REPLACE) {
      return {
        complianceBoardCategory: 'return_refund',
        complianceBoardStatus: COLUMN_STATUS.CASE_NOT_OPENED,
        complianceBoardSource: 'order_communication',
      };
    }
    return null;
  };

  // Smart per-column refill from next pages respecting stats counts
  const refillColumnsFromNextPages = async (columnsNeedingRefill) => {
    try {
      const expectedPageSize = ['return_refund', 'inr', 'cancellation'].includes(selectedCategory) ? 500 : INITIAL_LOAD_LIMIT;
      
      // Track how many we need for each status
      const statusQuotas = {};
      columnsNeedingRefill.forEach(col => {
        statusQuotas[col.status] = col.needed;
      });
      
      console.log(`[REFILL-COLUMNS] Starting smart column refill. Quotas:`, statusQuotas);
      
      // Fetch ALL remaining pages in parallel
      const pagesToFetch = [];
      for (let pageNum = currentPage + 1; pageNum <= pagination.totalPages; pageNum++) {
        pagesToFetch.push(pageNum);
      }
      
      if (pagesToFetch.length === 0) {
        console.log(`[REFILL-COLUMNS] No more pages to fetch`);
        return;
      }
      
      console.log(`[REFILL-COLUMNS] Fetching ${pagesToFetch.length} pages in parallel to fill: ${columnsNeedingRefill.map(c => c.status).join(', ')}`);
      
      // Fetch all pages in parallel
      const fetchPromises = pagesToFetch.map(pageNum =>
        (async () => {
          try {
            const params = {
              category: selectedCategory,
              page: pageNum,
              limit: expectedPageSize,
              ...buildBoardFilterParams()
            };
            Object.assign(params, buildDateParams());
            
            const response = await api.get('/orders/compliance-board', {
              params,
              timeout: BOARD_REQUEST_TIMEOUT_MS,
            });
            
            return { pageNum, orders: response.data?.orders || [] };
          } catch (err) {
            console.warn(`[REFILL-COLUMNS] Failed to fetch page ${pageNum}:`, err);
            return { pageNum, orders: [] };
          }
        })()
      );
      
      const fetchResults = await Promise.all(fetchPromises);
      
      // Collect orders per status respecting quotas
      const accumulatedOrders = {};
      columnsNeedingRefill.forEach(col => {
        accumulatedOrders[col.status] = [];
      });
      
      // Process all fetched pages
      fetchResults.forEach(({ pageNum, orders: pageOrders }) => {
        console.log(`[REFILL-COLUMNS] Page ${pageNum} returned ${pageOrders.length} orders`);
        
        pageOrders.forEach((order, index) => {
          const rawStatus = order.complianceBoardStatus || COLUMN_STATUS.TODO;
          const status = rawStatus === 'inr_case_closed' ? COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED : rawStatus;
          
          // Only collect if this status needs refilling AND we haven't hit the quota
          if (accumulatedOrders[status] && statusQuotas[status] > 0) {
            accumulatedOrders[status].push({
              ...order,
              _id: toDraggableId('order', order, `${selectedCategory}-page${pageNum}-${index}`),
            });
            statusQuotas[status]--;
          }
        });
      });
      
      // Calculate total orders collected
      const totalToMerge = Object.values(accumulatedOrders).reduce((sum, arr) => sum + arr.length, 0);
      
      if (totalToMerge > 0) {
        console.log(`[REFILL-COLUMNS] Merging ${totalToMerge} orders into columns:`, 
          Object.fromEntries(Object.entries(accumulatedOrders).map(([status, arr]) => [status, arr.length]))
        );
        
        setOrders((prevOrders) => {
          const merged = { ...prevOrders };
          Object.entries(accumulatedOrders).forEach(([status, newOrders]) => {
            if (newOrders.length > 0) {
              merged[status] = [...(merged[status] || []), ...newOrders];
              console.log(`[REFILL-COLUMNS] Column ${status}: ${(merged[status] || []).length - newOrders.length} → ${merged[status].length} orders`);
            }
          });
          return merged;
        });
        
        console.log(`[REFILL-COLUMNS] Successfully merged ${totalToMerge} orders into columns`);
      } else {
        console.log(`[REFILL-COLUMNS] No matching orders found to merge`);
      }
    } catch (err) {
      console.warn('[REFILL-COLUMNS] Failed to refill columns from next pages:', err);
    }
  };

  // Refetch from next pages if current page is under-filled after orders are moved
  const refillCurrentPageFromNextPages = async () => {
    try {
      const expectedPageSize = ['return_refund', 'inr', 'cancellation'].includes(selectedCategory) ? 500 : INITIAL_LOAD_LIMIT;
      const currentOrderCount = Object.values(orders).reduce((sum, col) => sum + col.length, 0);
      
      console.log(`[REFILL-PAGE] Starting refill: page ${currentPage} has ${currentOrderCount}/${expectedPageSize} orders, totalPages: ${pagination.totalPages}`);
      
      if (currentOrderCount >= expectedPageSize) {
        console.log(`[REFILL-PAGE] Page is already full, no refill needed`);
        return;
      }
      
      if (currentPage >= pagination.totalPages) {
        console.log(`[REFILL-PAGE] Already on last page, no refill needed`);
        return;
      }
      
      // Fetch ALL remaining pages in parallel, then merge into current page
      const pagesToFetch = [];
      for (let pageNum = currentPage + 1; pageNum <= pagination.totalPages; pageNum++) {
        pagesToFetch.push(pageNum);
      }
      
      console.log(`[REFILL-PAGE] Fetching ${pagesToFetch.length} pages in parallel: ${pagesToFetch.join(', ')}`);
      
      // Fetch all pages in parallel
      const fetchPromises = pagesToFetch.map(pageNum =>
        (async () => {
          try {
            const params = {
              category: selectedCategory,
              page: pageNum,
              limit: expectedPageSize,
              ...buildBoardFilterParams()
            };
            Object.assign(params, buildDateParams());
            
            const response = await api.get('/orders/compliance-board', {
              params,
              timeout: BOARD_REQUEST_TIMEOUT_MS,
            });
            
            return { pageNum, orders: response.data?.orders || [] };
          } catch (err) {
            console.warn(`[REFILL-PAGE] Failed to fetch page ${pageNum}:`, err);
            return { pageNum, orders: [] };
          }
        })()
      );
      
      const fetchResults = await Promise.all(fetchPromises);
      
      // Accumulate all orders from all fetched pages
      const allAccumulatedOrders = {};
      Object.keys(orders).forEach(key => {
        allAccumulatedOrders[key] = [];
      });
      
      let totalAccumulated = 0;
      fetchResults.forEach(({ pageNum, orders: pageOrders }) => {
        console.log(`[REFILL-PAGE] Page ${pageNum} returned ${pageOrders.length} orders`);
        
        pageOrders.forEach((order, index) => {
          const rawStatus = order.complianceBoardStatus || COLUMN_STATUS.TODO;
          const status = rawStatus === 'inr_case_closed' ? COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED : rawStatus;
          if (allAccumulatedOrders[status]) {
            allAccumulatedOrders[status].push({
              ...order,
              _id: toDraggableId('order', order, `${selectedCategory}-page${pageNum}-${index}`),
            });
            totalAccumulated++;
          }
        });
      });
      
      // Merge all accumulated orders at once
      if (totalAccumulated > 0) {
        console.log(`[REFILL-PAGE] Merging ${totalAccumulated} orders from pages ${currentPage + 1} to ${pagination.totalPages}`);
        
        setOrders((prevOrders) => {
          const merged = { ...prevOrders };
          Object.keys(allAccumulatedOrders).forEach((status) => {
            merged[status] = [...(merged[status] || []), ...allAccumulatedOrders[status]];
          });
          console.log(`[REFILL-PAGE] Merged orders - new column counts:`, Object.fromEntries(
            Object.entries(merged).map(([status, items]) => [status, items.length])
          ));
          return merged;
        });
        
        console.log(`[REFILL-PAGE] Successfully merged ${totalAccumulated} orders into page ${currentPage}`);
      } else {
        console.log(`[REFILL-PAGE] No orders found to merge`);
      }
    } catch (err) {
      console.warn('[REFILL-PAGE] Failed to refill current page from next pages:', err);
      // Non-critical error, don't break the flow
    }
  };

  const applyOrderColumn = async (status) => {
    const moves = Object.values(pendingOrderMoves[status] || {});
    console.log(`[APPLY-ORDER] Starting applyOrderColumn for status: ${status}, moves count:`, moves.length);
    if (moves.length === 0) {
      console.log(`[APPLY-ORDER] No pending moves for status ${status}, returning`);
      return;
    }

    setApplyingColumns((prev) => ({ ...prev, [`order:${status}`]: true }));
    try {
      console.log(`[APPLY-ORDER] Processing ${moves.length} order move(s):`);
      console.log(`[APPLY-ORDER] Full pending moves object:`, pendingOrderMoves[status]);
      
      await Promise.all(moves.map((order, idx) => {
        const idStr = String(order._id || '');
        // For special case types (return, cancelled, inr), send full ID with prefix
        // Backend checks the prefix to determine document type
        let targetId = idStr;
        
        console.log(`[APPLY-ORDER] Order ${idx + 1}:`, {
          orderId: order.orderId,
          _id: order._id,
          orderObjectId: order.orderObjectId,
          targetId: targetId,
          fromStatus: order.complianceBoardStatus,
          toStatus: status,
          isReturn: idStr.startsWith('return:'),
          isCancellation: idStr.startsWith('cancelled:'),
          isINR: idStr.startsWith('inr:'),
          hasReturnInfo: !!order.returnInfo,
          returnBoardSource: order.returnBoardSource
        });

        const patchData = {
          complianceBoardStatus: status,
          complianceBoardCategory: selectedCategory,
        };
        console.log(`[APPLY-ORDER] Sending PATCH to /orders/${encodeURIComponent(targetId)}/compliance-status with:`, patchData);
        
        return api.patch(`/orders/${encodeURIComponent(targetId)}/compliance-status`, patchData)
          .then(res => {
            console.log(`[APPLY-ORDER] PATCH succeeded for order ${order.orderId}:`, res.data);
            return res;
          })
          .catch(err => {
            console.error(`[APPLY-ORDER] PATCH failed for order ${order.orderId}:`, {
              status: err.response?.status,
              data: err.response?.data,
              message: err.message
            });
            throw err;
          });
      }));

      setOrders((prev) => {
        const appliedIds = new Set(moves.map((order) => order._id));
        const appliedAt = new Date().toISOString();
        const next = { ...prev };
        Object.keys(next).forEach((columnId) => {
          next[columnId] = next[columnId].map((order) => {
            if (!appliedIds.has(order._id)) return order;
            const categories = Array.isArray(order.complianceBoardCategories)
              ? order.complianceBoardCategories
              : (order.complianceBoardCategory ? [order.complianceBoardCategory] : []);
            return {
              ...order,
              complianceBoardStatus: status,
              complianceBoardCategories: categories.includes(selectedCategory)
                ? categories
                : [...categories, selectedCategory],
              outOfStockAssignedAt:
                selectedCategory === 'order_fulfillment' && status === COLUMN_STATUS.OUT_OF_STOCK
                  ? appliedAt
                  : selectedCategory === 'order_fulfillment'
                    ? null
                    : order.outOfStockAssignedAt,
              cancellationAssignedAt:
                selectedCategory === 'order_fulfillment' && status === COLUMN_STATUS.CANCELLATION
                  ? appliedAt
                  : selectedCategory === 'order_fulfillment'
                    ? null
                    : order.cancellationAssignedAt,
              addressIssueAssignedAt:
                selectedCategory === 'order_fulfillment' && status === COLUMN_STATUS.ADDRESS_ISSUE
                  ? appliedAt
                  : selectedCategory === 'order_fulfillment'
                    ? null
                    : order.addressIssueAssignedAt,
              returnCaseNotOpenedAssignedAt:
                selectedCategory === 'return_refund' && status === COLUMN_STATUS.CASE_NOT_OPENED
                  ? appliedAt
                  : selectedCategory === 'return_refund'
                    ? null
                    : order.returnCaseNotOpenedAssignedAt,
              returnItemDeliveredAssignedAt:
                selectedCategory === 'return_refund' && status === COLUMN_STATUS.ITEM_DELIVERED
                  ? appliedAt
                  : selectedCategory === 'return_refund'
                    ? null
                    : order.returnItemDeliveredAssignedAt,
            };
          });
        });
        return next;
      });

      setPendingOrderMoves((prev) => {
        const next = { ...prev };
        delete next[status];
        return next;
      });
      console.log(`[APPLY-ORDER] Successfully applied ${moves.length} order(s) to ${status}`);
      setSnackbar({ open: true, message: `Applied ${moves.length} order(s) to ${getColumnTitle(status)}` });
      
      // Smart refill: check which columns need filling after this apply
      const COLUMN_LIMITS = {
        [COLUMN_STATUS.TODO]: 50,
        [COLUMN_STATUS.OUT_OF_STOCK]: 50,
        [COLUMN_STATUS.CANCELLATION]: 50,
        [COLUMN_STATUS.ADDRESS_ISSUE]: 50,
        [COLUMN_STATUS.LATE_DELIVERY]: 50,
        [COLUMN_STATUS.NOT_FULFILLED]: 50,
        [COLUMN_STATUS.FULFILLED]: 100,
        [COLUMN_STATUS.BUYER_CONFIRMATION]: 50,
      };
      
      const columnsNeedingRefill = [];
      Object.entries(orders).forEach(([colStatus, items]) => {
        const columnLimit = COLUMN_LIMITS[colStatus] || 50;
        const currentCount = items.length;
        const statsCount = statusCounts[colStatus] ?? currentCount;
        
        if (currentCount < columnLimit && currentCount < statsCount) {
          const needed = Math.min(columnLimit - currentCount, statsCount - currentCount);
          if (needed > 0) {
            columnsNeedingRefill.push({
              status: colStatus,
              currentCount,
              statsCount,
              columnLimit,
              needed
            });
          }
        }
      });
      
      if (columnsNeedingRefill.length > 0 && currentPage <= pagination.totalPages && pagination.totalPages > 1) {
        console.log(`[APPLY-ORDER] After apply, refilling columns:`, columnsNeedingRefill.map(c => `${c.status}(need ${c.needed})`).join(', '));
        await refillColumnsFromNextPages(columnsNeedingRefill);
      }
    } catch (err) {
      console.error('[APPLY-ORDER] Failed to apply order column:', err);
      console.error('[APPLY-ORDER] Error details:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      });
      setSnackbar({
        open: true,
        message: `Failed: ${err.response?.data?.error || err.message}`,
      });
    } finally {
      console.log(`[APPLY-ORDER] Finally block for status ${status}`);
      setApplyingColumns((prev) => ({ ...prev, [`order:${status}`]: false }));
    }
  };

  const applyMessageColumn = async (categoryId) => {
    const moves = Object.values(pendingMessageMoves[categoryId] || {});
    if (moves.length === 0) return;

    const category = mapMessageCategoryForApi(categoryId);
    const orderAssignment = getOrderAssignmentForMessageCategory(categoryId);
    setApplyingColumns((prev) => ({ ...prev, [`message:${categoryId}`]: true }));
    try {
      await Promise.all(moves.map(async (message) => {
        await api.post('/ebay/conversation-meta', {
          sellerId: message.sellerId,
          buyerUsername: message.buyerUsername,
          orderId: message.orderId || null,
          itemId: message.itemId,
          category,
          status: message.status || 'Open',
          caseStatus: message.caseStatus || 'Case Not Opened',
          pickedUpBy: message.pickedUpBy || null
        });

        if (orderAssignment && message.orderId) {
          try {
            await api.patch(`/orders/${encodeURIComponent(message.orderId)}/compliance-status`, orderAssignment);
          } catch (err) {
            console.warn('Message category applied, but linked order assignment failed:', err);
          }
        }
      }));

      // Update messages state locally to move them to the applied category
      setMessages((prev) => {
        const updated = { ...prev };
        
        // Remove from ALL_MESSAGES if they were there
        if (updated[MESSAGE_CATEGORIES.ALL_MESSAGES]) {
          updated[MESSAGE_CATEGORIES.ALL_MESSAGES] = updated[MESSAGE_CATEGORIES.ALL_MESSAGES].filter(
            msg => !moves.some(m => getMessageKey(m) === getMessageKey(msg))
          );
        }
        
        // Add to the target category
        if (!updated[categoryId]) {
          updated[categoryId] = [];
        }
        moves.forEach(msg => {
          if (!updated[categoryId].some(m => getMessageKey(m) === getMessageKey(msg))) {
            updated[categoryId].push({
              ...msg,
              category: category,
              conversationCategory: category
            });
          }
        });
        
        return updated;
      });

      // If orders were assigned, update the orders state locally
      if (orderAssignment) {
        const orderIdsToUpdate = moves.map(m => m.orderId).filter(Boolean);
        if (orderIdsToUpdate.length > 0) {
          setOrders((prev) => {
            const updated = { ...prev };
            
            // Find and update orders in all columns
            Object.keys(updated).forEach(columnKey => {
              updated[columnKey] = updated[columnKey].map(order => {
                if (orderIdsToUpdate.includes(order.orderId)) {
                  const categories = getOrderBoardCategories(order);
                  const newCategory = orderAssignment.complianceBoardCategory;
                  
                  // Add the new category if not already present
                  if (!categories.includes(newCategory)) {
                    return {
                      ...order,
                      complianceBoardCategories: [...categories, newCategory],
                      complianceBoardStatus: orderAssignment.complianceBoardStatus,
                      complianceBoardSource: orderAssignment.complianceBoardSource || order.complianceBoardSource
                    };
                  }
                }
                return order;
              });
            });
            
            // If we're on INR, Cancellation, or Return board, re-group orders to move them to correct columns
            if (selectedCategory === 'inr' && orderAssignment.complianceBoardCategory === 'inr') {
              // Move orders to Case Not Opened column
              const movedOrders = [];
              Object.keys(updated).forEach(columnKey => {
                updated[columnKey] = updated[columnKey].filter(order => {
                  if (orderIdsToUpdate.includes(order.orderId)) {
                    movedOrders.push({
                      ...order,
                      complianceBoardCategories: [...getOrderBoardCategories(order), 'inr'].filter((v, i, a) => a.indexOf(v) === i),
                      complianceBoardStatus: COLUMN_STATUS.CASE_NOT_OPENED,
                      complianceBoardSource: 'order_communication'
                    });
                    return false;
                  }
                  return true;
                });
              });
              updated[COLUMN_STATUS.CASE_NOT_OPENED] = [
                ...(updated[COLUMN_STATUS.CASE_NOT_OPENED] || []),
                ...movedOrders
              ];
            } else if (selectedCategory === 'cancellation' && orderAssignment.complianceBoardCategory === 'cancellation') {
              // Move orders to Case Not Opened column
              const movedOrders = [];
              Object.keys(updated).forEach(columnKey => {
                updated[columnKey] = updated[columnKey].filter(order => {
                  if (orderIdsToUpdate.includes(order.orderId)) {
                    movedOrders.push({
                      ...order,
                      complianceBoardCategories: [...getOrderBoardCategories(order), 'cancellation'].filter((v, i, a) => a.indexOf(v) === i),
                      complianceBoardStatus: COLUMN_STATUS.CASE_NOT_OPENED,
                      complianceBoardSource: 'order_communication'
                    });
                    return false;
                  }
                  return true;
                });
              });
              updated[COLUMN_STATUS.CASE_NOT_OPENED] = [
                ...(updated[COLUMN_STATUS.CASE_NOT_OPENED] || []),
                ...movedOrders
              ];
            }
            
            return updated;
          });
        }
      }

      setPendingMessageMoves((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });

      setSnackbar({ open: true, message: `Applied ${moves.length} message(s) to ${category}` });
    } catch (err) {
      console.error('Failed to apply message column:', err);
      setSnackbar({
        open: true,
        message: `Failed: ${err.response?.data?.error || err.message}`,
      });
    } finally {
      setApplyingColumns((prev) => ({ ...prev, [`message:${categoryId}`]: false }));
    }
  };

  const resolveOrderColumnStatus = (columnId) => {
    switch (columnId) {
      case INR_VIEW_IDS.PRIMARY:
        return inrPrimaryCategory;
      case INR_VIEW_IDS.SECONDARY:
        return inrSecondaryCategory;
      case INR_VIEW_IDS.ACTION:
        return inrActionCategory;
      case INR_VIEW_IDS.REFUND:
        return inrRefundCategory;
      default:
        return columnId;
    }
  };

  const handleDragEnd = async (result) => {
    const { source, destination, draggableId } = result;

    // Dropped outside a valid droppable area
    if (!destination) return;

    // No change in position
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const sourceColumn = resolveOrderColumnStatus(source.droppableId);
    const destColumn = resolveOrderColumnStatus(destination.droppableId);

    // Handle Order Communication drag-and-drop differently
    if (selectedCategory === 'order_communication') {
      await handleMessageDragEnd(result);
      return;
    }

    if (selectedCategory === 'issue_hub') {
      if (ISSUE_HUB_MESSAGE_COLUMNS.has(source.droppableId) || ISSUE_HUB_MESSAGE_COLUMNS.has(destination.droppableId)) {
        await handleMessageDragEnd(result);
        return;
      }
    }

    // Check if trying to move incomplete order to Fulfilled box in order_fulfillment category
    if (selectedCategory === 'order_fulfillment' && destColumn === COLUMN_STATUS.FULFILLED) {
      const sourceItems = orders[sourceColumn];
      const movedOrder = sourceItems[source.index];
      const isComplete = isOrderFulfillmentComplete(movedOrder);
      
      if (!isComplete) {
        const missingFields = getMissingFulfillmentFields(movedOrder);
        setSnackbar({
          open: true,
          message: `❌ Cannot move to Fulfilled: Missing fields - ${missingFields.join(', ')}`
        });
        return;
      }
    }

    // Create new state for orders
    const newOrders = { ...orders };
    const sourceItems = Array.from(newOrders[sourceColumn]);
    const destItems = sourceColumn === destColumn ? sourceItems : Array.from(newOrders[destColumn]);

    // Remove from source
    const [movedItem] = sourceItems.splice(source.index, 1);

    // Add to destination
    destItems.splice(destination.index, 0, movedItem);

    // Update state
    newOrders[sourceColumn] = sourceItems;
    if (sourceColumn !== destColumn) {
      newOrders[destColumn] = destItems;
    }

    setOrders(newOrders);

    if (sourceColumn !== destColumn) {
      addPendingOrderMove(movedItem, destColumn);
      setSnackbar({
        open: true,
        message: `Order staged in ${getColumnTitle(destColumn)}. Click Apply in that box to save.`,
      });
    }
  };

  // Handle drag-and-drop for Order Communication messages
  const handleMessageDragEnd = async (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const sourceColumn = source.droppableId;
    const destColumn = destination.droppableId;

    const newMessages = { ...messages };
    const sourceItems = Array.from(newMessages[sourceColumn]);
    const destItems = Array.from(newMessages[destColumn]);
    
    const movedItemIndex = sourceItems.findIndex(item => getMessageKey(item) === draggableId);
    if (movedItemIndex === -1) return;
    
    const [movedItem] = sourceItems.splice(movedItemIndex, 1);
    
    // Check if item already exists in destination
    const itemId = getMessageKey(movedItem);
    if (!destItems.find(item => getMessageKey(item) === itemId)) {
      destItems.push(movedItem);
    }
    
    // REMOVE from source (this makes it vanish)
    newMessages[sourceColumn] = sourceItems;
    newMessages[destColumn] = destItems;
    setMessages(newMessages);
    
    // Only add pending move if not dragging to All Messages
    if (destColumn !== MESSAGE_CATEGORIES.ALL_MESSAGES) {
      addPendingMessageMove(movedItem, destColumn);
      setSnackbar({
        open: true,
        message: `Message staged in ${mapMessageCategoryForApi(destColumn)}. Click Apply in that box to save.`,
      });
    } else {
      clearPendingMessageMove(movedItem);
      try {
        await api.post('/ebay/conversation-meta', {
          sellerId: movedItem.sellerId,
          buyerUsername: movedItem.buyerUsername,
          orderId: movedItem.orderId || null,
          itemId: movedItem.itemId || 'DIRECT_MESSAGE',
          category: '',
          status: movedItem.status || 'Open',
          caseStatus: movedItem.caseStatus || 'Case Not Opened',
          pickedUpBy: movedItem.pickedUpBy || null
        });

        // Also clear the order's compliance board category and status
        if (movedItem.orderId) {
          try {
            await api.patch(`/orders/${encodeURIComponent(movedItem.orderId)}/compliance-status`, {
              complianceBoardStatus: 'todo',
              complianceBoardCategory: null,
              complianceBoardSource: null,
              clearCategory: true // Flag to backend to remove from categories array
            });
          } catch (err) {
            console.warn('ConversationMeta cleared, but order category clear failed:', err);
          }
        }

        setSnackbar({
          open: true,
          message: 'Message moved back to All Messages',
        });
      } catch (err) {
        console.error('Failed to clear message category:', err);
        setSnackbar({
          open: true,
          message: `Failed: ${err.response?.data?.error || err.message}`,
        });
      }
    }
  };

  const getColumnTitle = (status) => {
    // For Order Communication, use different column names
    if (selectedCategory === 'order_communication') {
      switch (status) {
        case COLUMN_STATUS.TODO:
          return 'To Do';
        case COLUMN_STATUS.NOT_FULFILLED:
          return 'Not Messaged';
        case COLUMN_STATUS.FULFILLED:
          return 'Messaged';
        default:
          return status;
      }
    }
    
    // For Return/Refund board
    if (selectedCategory === 'return_refund') {
      switch (status) {
        case COLUMN_STATUS.CASE_OPENED:
          return 'Case Opened';
        case COLUMN_STATUS.CASE_NOT_OPENED:
          return 'Case Not Opened';
        case COLUMN_STATUS.RETURN_FOLLOW_UP:
          return 'Follow Up';
        case COLUMN_STATUS.PROVIDE_RETURN_LABEL:
          return 'Provide Return Label';
        case COLUMN_STATUS.BUYER_DROP_OFF:
          return 'Buyer Drop Off';
        case COLUMN_STATUS.ITEM_DELIVERED:
          return 'Item Delivered';
        case COLUMN_STATUS.PARTIAL_REFUND:
          return 'Partial Refund';
        case COLUMN_STATUS.FULL_REFUND:
          return 'Full Refund';
        case COLUMN_STATUS.REPLACEMENT:
          return 'Replacement';
        default:
          return status;
      }
    }
    
    // For Cancellation board
    if (selectedCategory === 'cancellation') {
      switch (status) {
        case COLUMN_STATUS.CANCELLATION_REQUEST:
          return 'Case Opened';
        case COLUMN_STATUS.CASE_NOT_OPENED:
          return 'Case Not Opened';
        case COLUMN_STATUS.ACCEPTED:
          return 'Accepted';
        case COLUMN_STATUS.DECLINED:
          return 'Declined';
        default:
          return status;
      }
    }
    
    // For INR board
    if (selectedCategory === 'inr') {
      switch (status) {
        case COLUMN_STATUS.INR_CASE_OPENED:
          return 'Case Opened';
        case COLUMN_STATUS.CASE_NOT_OPENED:
          return 'Case Not Opened';
        case COLUMN_STATUS.INR_FOLLOW_UP:
          return 'Follow Up';
        case COLUMN_STATUS.INR_TRACKING_ID_UPLOAD:
          return 'Tracking ID Upload';
        case COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN:
          return 'Case Open (Ebay Step In)';
        case COLUMN_STATUS.INR_FULLY_REFUNDED:
          return 'Fully Refunded';
        case COLUMN_STATUS.INR_PARTIAL_REFUND:
          return 'Partial Refund';
        case COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED:
          return 'Not Refunded but Resolved';
        default:
          return status;
      }
    }
    
    // Default names for order fulfillment
    switch (status) {
      case COLUMN_STATUS.TODO:
        return 'Orders (To Do)';
      case COLUMN_STATUS.OUT_OF_STOCK:
        return 'Out of Stock';
      case COLUMN_STATUS.CANCELLATION:
        return 'Cancellation';
      case COLUMN_STATUS.ADDRESS_ISSUE:
        return 'Address Issue';
      case COLUMN_STATUS.LATE_DELIVERY:
        return 'Late Delivery';
      case COLUMN_STATUS.NOT_FULFILLED:
        return 'Not Fulfilled';
      case COLUMN_STATUS.FULFILLED:
        return 'Fulfilled';
      case COLUMN_STATUS.BUYER_CONFIRMATION:
        return 'Buyer Confirmation';
      default:
        return status;
    }
  };

  const getColumnColor = (status) => {
    switch (status) {
      case COLUMN_STATUS.TODO:
        return BRAND_RED;
      case COLUMN_STATUS.OUT_OF_STOCK:
        return BRAND_ORANGE;
      case COLUMN_STATUS.CANCELLATION:
        return BRAND_BLUE;
      case COLUMN_STATUS.ADDRESS_ISSUE:
        return '#a855f7'; // purple
      case COLUMN_STATUS.LATE_DELIVERY:
        return '#dc2626'; // red
      case COLUMN_STATUS.NOT_FULFILLED:
        return BRAND_YELLOW_DARK;
      case COLUMN_STATUS.FULFILLED:
        return BRAND_GREEN;
      case COLUMN_STATUS.BUYER_CONFIRMATION:
        return '#0f766e';
      // Return/Refund colors
      case COLUMN_STATUS.CASE_OPENED:
        return BRAND_RED;
      case COLUMN_STATUS.CASE_NOT_OPENED:
        return BRAND_ORANGE;
      case COLUMN_STATUS.RETURN_FOLLOW_UP:
        return '#8b5cf6'; // purple
      case COLUMN_STATUS.PROVIDE_RETURN_LABEL:
        return BRAND_BLUE;
      case COLUMN_STATUS.BUYER_DROP_OFF:
        return '#a855f7'; // purple
      case COLUMN_STATUS.ITEM_DELIVERED:
        return '#06b6d4'; // cyan
      case COLUMN_STATUS.PARTIAL_REFUND:
        return BRAND_YELLOW_DARK;
      case COLUMN_STATUS.FULL_REFUND:
        return BRAND_GREEN;
      case COLUMN_STATUS.REPLACEMENT:
        return '#0f766e';
      // Cancellation colors
      case COLUMN_STATUS.CANCELLATION_REQUEST:
        return BRAND_RED;
      case COLUMN_STATUS.ACCEPTED:
        return BRAND_GREEN;
      case COLUMN_STATUS.DECLINED:
        return BRAND_ORANGE;
      // INR colors
      case COLUMN_STATUS.INR_CASE_OPENED:
        return BRAND_RED;
      case COLUMN_STATUS.INR_FOLLOW_UP:
        return '#8b5cf6';
      case COLUMN_STATUS.INR_TRACKING_ID_UPLOAD:
        return '#06b6d4';
      case COLUMN_STATUS.INR_CASE_OPEN_EBAY_STEP_IN:
        return BRAND_RED;
      case COLUMN_STATUS.INR_FULLY_REFUNDED:
        return BRAND_GREEN;
      case COLUMN_STATUS.INR_PARTIAL_REFUND:
        return BRAND_YELLOW_DARK;
      case COLUMN_STATUS.INR_NOT_REFUNDED_RESOLVED:
        return BRAND_BLUE;
      default:
        return '#6b7280';
    }
  };

  const handleCopyOrderId = (orderId) => {
    navigator.clipboard.writeText(orderId);
    setSnackbar({ open: true, message: 'Order ID copied!' });
  };

  const handleOpenOrderDetails = (orderId, options = {}) => {
    if (!orderId) return;
    setSelectedOrderDetailsId(orderId);
    setSelectedOrderDetailsCanEditFulfillment(Boolean(options.canEditFulfillment));
  };

  const handleOrderUpdatedInModal = (updatedOrder) => {
    // Update the order in the orders state
    // This ensures the card is immediately re-rendered with the new fulfillment data
    setOrders((prevOrders) => {
      const updated = { ...prevOrders };
      
      // Find and update the order in all columns
      Object.keys(updated).forEach((columnId) => {
        updated[columnId] = updated[columnId].map((order) => {
          if (order._id === updatedOrder._id || order.orderId === updatedOrder.orderId) {
            return {
              ...order,
              ...updatedOrder,
              // Preserve important fields that shouldn't be overwritten
              _id: order._id || updatedOrder._id
            };
          }
          return order;
        });
      });
      
      return updated;
    });
  };

  const handleCopy = (text) => {
    if (text && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(''), 1200);
    }
  };

  const getSellerName = (sellerId) => {
    if (!sellerId) return 'Unknown Seller';
    
    // Convert to string for comparison (handles ObjectId objects)
    const sellerIdStr = String(sellerId);
    
    // Find seller by ID comparison
    const seller = sellers.find(s => {
      const sIdStr = String(s._id);
      return sIdStr === sellerIdStr;
    });
    
    if (seller) {
      return seller.user?.username || seller.username || seller.name || 'Unknown Seller';
    }
    
    // Debug: Log if not found
    console.warn(`Seller ID ${sellerIdStr} not found in sellers list`);
    return 'Unknown Seller';
  };

  const resolveOrderSellerName = (order) => {
    if (!order) return 'Unknown Seller';

    if (order.sellerName) return order.sellerName;

    if (typeof order.seller === 'string') {
      const resolvedFromSeller = getSellerName(order.seller);
      if (resolvedFromSeller !== 'Unknown Seller') return resolvedFromSeller;
    }

    if (order.seller?.user?.username) return order.seller.user.username;
    if (order.seller?.username) return order.seller.username;
    if (order.seller?.name) return order.seller.name;

    if (order.sellerId) {
      const resolvedFromSellerId = getSellerName(order.sellerId);
      if (resolvedFromSellerId !== 'Unknown Seller') return resolvedFromSellerId;
    }

    return 'Unknown Seller';
  };

  const handleOpenMessageDialog = (orderOrThread) => {
    console.log('🔍 DIALOG OPEN - Raw thread data:', JSON.stringify(orderOrThread, null, 2));
    
    // Normalize thread data to match the order-shaped object expected by the all-orders chat dialog.
    let normalizedData = orderOrThread;
    
    // Check if this is a thread (from Order Communication board) or an actual order
    if (orderOrThread.buyerUsername && !orderOrThread.buyer) {
      // This is a thread object from /ebay/chat/threads - transform it to match Order structure
      const messageType = orderOrThread.actualMessageType || orderOrThread.messageType;
      const isInquiry = !orderOrThread.orderId && (messageType === 'INQUIRY' || messageType === 'DIRECT' || orderOrThread.itemId === 'DIRECT_MESSAGE');
      
      console.log('🔍 Thread data received:', {
        orderId: orderOrThread.orderId || (isInquiry ? 'INQUIRY' : 'MISSING'),
        orderIdType: typeof orderOrThread.orderId,
        orderIdLength: orderOrThread.orderId?.length,
        buyerUsername: orderOrThread.buyerUsername,
        buyerName: orderOrThread.buyerName,
        sellerId: orderOrThread.sellerId,
        itemId: orderOrThread.itemId,
        itemTitle: orderOrThread.itemTitle,
        messageType: orderOrThread.messageType,
        actualMessageType: orderOrThread.actualMessageType,
        isInquiry
      });
      
      // Try multiple sources for seller name
      let sellerName = orderOrThread.sellerName;
      if (!sellerName && orderOrThread.sellerId) {
        sellerName = getSellerName(orderOrThread.sellerId);
      }
      if (!sellerName) {
        sellerName = 'Unknown Seller';
      }
      
      // Ensure we're not mixing up buyer and seller
      const buyerUsername = orderOrThread.buyerUsername || 'Unknown Buyer';
      const buyerName = orderOrThread.buyerName || buyerUsername;
      
      normalizedData = {
        orderId: orderOrThread.orderId || null,
        conversationId: orderOrThread.conversationId || orderOrThread._id || null,
        itemNumber: orderOrThread.itemId || null,
        productName: orderOrThread.itemTitle || orderOrThread.productName || (isInquiry ? 'Inquiry Message' : 'Item'),
        seller: {
          _id: orderOrThread.sellerId,
          user: {
            username: sellerName
          }
        },
        buyer: {
          username: buyerUsername,
          buyerRegistrationAddress: {
            fullName: buyerName
          }
        },
        lineItems: orderOrThread.itemId && orderOrThread.itemId !== 'DIRECT_MESSAGE' ? [{
          legacyItemId: orderOrThread.itemId,
          title: orderOrThread.itemTitle || orderOrThread.productName || 'Item'
        }] : []
      };
      
      console.log('Normalized data for dialog:', {
        sellerName: normalizedData.seller.user.username,
        buyerUsername: normalizedData.buyer.username,
        buyerName: normalizedData.buyer.buyerRegistrationAddress.fullName,
        orderId: normalizedData.orderId,
        orderIdType: typeof normalizedData.orderId,
        orderIdLength: normalizedData.orderId?.length,
        itemId: normalizedData.itemNumber
      });
    }
    
    console.log('🔍 FINAL normalized data being passed to dialog:', JSON.stringify(normalizedData, null, 2));
    
    setSelectedOrderForMessage(normalizedData);
    setMessageModalOpen(true);
  };

  const handleCloseMessageDialog = () => {
    setMessageModalOpen(false);
    setSelectedOrderForMessage(null);
  };

  const handleOpenActivityLogs = async (order) => {
    setSelectedOrderForLogs(order);
    setLogsModalOpen(true);
    setLogsLoading(true);

    try {
      const orderId = order._id || order.orderId;
      const { data } = await api.get(`/orders/${encodeURIComponent(orderId)}/activity-logs`, {
        params: { limit: 100 },
      });
      setOrderActivityLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
      setOrderActivityLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCloseActivityLogs = () => {
    setLogsModalOpen(false);
    setSelectedOrderForLogs(null);
    setOrderActivityLogs([]);
    setNewNote('');
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      setSnackbar({ open: true, message: 'Please enter a note' });
      return;
    }

    setAddingNote(true);
    try {
      const orderId = selectedOrderForLogs?._id || selectedOrderForLogs?.orderId;
      const { data } = await api.post(
        `/orders/${encodeURIComponent(orderId)}/add-note`,
        { noteContent: newNote }
      );

      // Add the new note to the logs and refresh
      setOrderActivityLogs([data.log, ...orderActivityLogs]);
      setNewNote('');
      setSnackbar({ open: true, message: 'Note added successfully' });
    } catch (err) {
      console.error('Failed to add note:', err);
      setSnackbar({ open: true, message: 'Failed to add note' });
    } finally {
      setAddingNote(false);
    }
  };

  const renderMessagePickedUpByControl = (item) => {
    const messageKey = getMessageKey(item);
    return (
      <FormControl
        fullWidth
        size="small"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <InputLabel shrink sx={{ fontSize: '0.72rem' }}>Picked Up By</InputLabel>
        <Select
          value={item.pickedUpBy || ''}
          label="Picked Up By"
          displayEmpty
          disabled={savingPickedUpByKey === messageKey}
          onChange={(e) => handleMessagePickedUpByChange(item, e.target.value)}
          renderValue={(selected) => (selected ? selected : <em style={{ color: '#64748b' }}>Unassigned</em>)}
          sx={{
            bgcolor: '#fff',
            borderRadius: 1,
            fontSize: '0.82rem',
            '& .MuiSelect-select': { py: 0.75 }
          }}
        >
          <MenuItem value=""><em>Unassigned</em></MenuItem>
          {chatAgents.map((agent) => (
            <MenuItem key={agent._id || agent.name} value={agent.name}>
              {agent.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  };

  // Render message card for Order Communication board
  const renderMessageCard = (item, provided, snapshot) => {
    // Get seller name with fallback chain
    const sellerName = item.sellerName || getSellerName(item.sellerId) || 'Unknown Seller';
    const buyerName = item.buyerName || item.buyerUsername || 'Unknown Buyer';
    
    // Use actualMessageType if available (it's more accurate)
    const messageType = item.actualMessageType || item.messageType;
    
    // Determine if this is genuinely an inquiry (no order) vs missing order data
    const isInquiry = !item.orderId && (messageType === 'INQUIRY' || messageType === 'DIRECT' || item.itemId === 'DIRECT_MESSAGE');
    
    // Better display logic
    const orderId = item.orderId || (isInquiry ? 'Inquiry' : 'Order ID Missing');
    const itemTitle = item.itemTitle || item.productName || (messageType === 'INQUIRY' ? 'Inquiry Message' : (messageType === 'DIRECT' ? 'Direct Message' : 'No Item'));
    const lastMessageText = item.messageText || item.lastMessage || '';
    const unreadCount = item.unreadCount || 0;
    const messageDate = item.lastDate || item.lastMessageDate || item.messageDate;
    const uniqueId = item._id || item.orderId || `${item.buyerUsername}-${item.itemId}`;

    return (
      <Card
        ref={provided.innerRef}
        {...provided.draggableProps}
        {...provided.dragHandleProps}
        sx={{
          mb: 1.5,
          cursor: 'grab',
          bgcolor: snapshot.isDragging ? '#fef3c7' : '#fff',
          border: `1px solid ${snapshot.isDragging ? BRAND_YELLOW : '#e2e8f0'}`,
          '&:hover': {
            boxShadow: 3,
            borderColor: BRAND_YELLOW
          },
          transition: 'all 0.2s ease'
        }}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Stack spacing={0.5} flex={1}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  {sellerName}
                </Typography>
              </Stack>
              <Typography variant="body2" fontWeight={600} noWrap>
                {buyerName}
              </Typography>
            </Stack>
            {unreadCount > 0 && (
              <Chip
                label={`${unreadCount} unread`}
                size="small"
                color="error"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            )}
          </Stack>

          <Stack direction="row" alignItems="center" spacing={0.5} mb={0.5}>
            <ShoppingCartIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" noWrap>
              {orderId}
            </Typography>
            {item.orderId && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(orderId);
                }}
                sx={{ p: 0.25 }}
              >
                <ContentCopyIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Stack>

          <Box sx={{ mb: 1 }}>
            {renderMessagePickedUpByControl(item)}
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              mb: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {itemTitle}
          </Typography>

          {lastMessageText && (
            <Typography
              variant="body2"
              sx={{
                fontSize: '0.8rem',
                color: 'text.primary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                mb: 1
              }}
            >
              {lastMessageText}
            </Typography>
          )}

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {messageDate ? format(new Date(messageDate), 'MMM dd, yyyy HH:mm') : ''}
            </Typography>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenMessageDialog(item);
              }}
              sx={{ color: BRAND_BLUE }}
            >
              <ChatIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // Render message droppable column
  const renderMessageColumn = (categoryId, title, color, height = 600, headerControl = null) => {
    let items = messages[categoryId] || [];
    // Filter unread messages if toggle is enabled
    if (showOnlyUnreadMessages) {
      items = items.filter(item => (item.unreadCount || 0) > 0);
    }
    const count = items.length;
    const visibleCount = getVisibleMessageCount(categoryId);
    const remainingCount = Math.max(0, count - visibleCount);
    const pendingCount = getPendingCount(pendingMessageMoves, categoryId);
    const isApplying = applyingColumns[`message:${categoryId}`];

    return (
      <Droppable droppableId={categoryId} type="message">
        {(provided, snapshot) => (
          <Paper
            ref={provided.innerRef}
            {...provided.droppableProps}
            sx={{
              p: 2,
              height: height,
              bgcolor: snapshot.isDraggingOver ? `${color}10` : '#fff',
              borderRadius: 2,
              border: `2px solid ${snapshot.isDraggingOver ? color : '#e2e8f0'}`,
              transition: 'all 0.2s ease',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={1.5}
              pb={1.5}
              borderBottom={`2px solid ${color}`}
              sx={{ flexShrink: 0 }}
            >
              {headerControl || (
                <Typography variant="h6" fontWeight={700} color={color}>
                  {title}
                </Typography>
              )}
              <Stack direction="row" spacing={1} alignItems="center">
                {categoryId !== MESSAGE_CATEGORIES.ALL_MESSAGES && (
                  <Button
                    size="small"
                    variant={pendingCount > 0 ? 'contained' : 'outlined'}
                    disabled={pendingCount === 0 || isApplying}
                    onClick={() => applyMessageColumn(categoryId)}
                    sx={{
                      minWidth: 72,
                      height: 26,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      bgcolor: pendingCount > 0 ? color : 'transparent',
                      borderColor: color,
                      color: pendingCount > 0 ? '#fff' : color,
                      '&:hover': {
                        bgcolor: pendingCount > 0 ? color : `${color}10`,
                        borderColor: color,
                      }
                    }}
                  >
                    {isApplying ? <CircularProgress size={14} color="inherit" /> : `Apply${pendingCount ? ` ${pendingCount}` : ''}`}
                  </Button>
                )}
                <Chip
                  label={count}
                  size="small"
                  sx={{
                    bgcolor: color,
                    color: '#fff',
                    fontWeight: 700
                  }}
                />
              </Stack>
            </Stack>

            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {items.length === 0 ? (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'text.secondary'
                  }}
                >
                  <Typography variant="body2">
                    {categoryId === MESSAGE_CATEGORIES.ALL_MESSAGES
                      ? 'No messages found'
                      : 'Drag messages here'}
                  </Typography>
                </Box>
              ) : (
                items.slice(0, visibleCount).map((item, idx) => {
                  const uniqueId = getMessageKey(item);
                  return (
                    <Draggable key={uniqueId} draggableId={uniqueId} index={idx}>
                      {(provided, snapshot) => renderMessageCard(item, provided, snapshot)}
                    </Draggable>
                  );
                })
              )}
              {remainingCount > 0 && (
                <Button
                  size="small"
                  onClick={() => handleLoadMoreMessages(categoryId)}
                  sx={{ mt: 0.5, alignSelf: 'center', fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
                >
                  +{remainingCount} more
                </Button>
              )}
              {provided.placeholder}
            </Box>
          </Paper>
        )}
      </Droppable>
    );
  };

  // Render Order Communication Board
  const renderOrderCommunicationBoard = (alerts) => {
    const workOption = ORDER_COMMUNICATION_WORK_OPTIONS.find((option) => option.id === orderCommunicationWorkCategory)
      || ORDER_COMMUNICATION_WORK_OPTIONS[0];
    const handleAlertSelect = (alertId) => {
      setActiveAlertPreviewId(alertId);
      setAlertPreviewItems(null);
      if (ORDER_COMMUNICATION_WORK_OPTIONS.some((option) => option.id === alertId)) {
        setOrderCommunicationWorkCategory(alertId);
      }
    };
    const workHeader = (
      <FormControl size="small" sx={{ minWidth: 220 }}>
        <InputLabel>Box View</InputLabel>
        <Select
          label="Box View"
          value={orderCommunicationWorkCategory}
          onChange={(event) => setOrderCommunicationWorkCategory(event.target.value)}
          sx={{
            fontWeight: 800,
            color: workOption.color,
            '& .MuiSelect-select': { py: 0.6 }
          }}
        >
          {ORDER_COMMUNICATION_WORK_OPTIONS.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );

    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: 'minmax(0, 1.15fr) minmax(0, 1.35fr) 280px'
          },
          gap: 2,
          minWidth: 0,
          alignItems: 'start'
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {renderMessageColumn(
            MESSAGE_CATEGORIES.ALL_MESSAGES,
            'All Messages',
            BRAND_BLUE,
            740
          )}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          {renderMessageColumn(
            workOption.id,
            workOption.label,
            workOption.color,
            740,
            workHeader
          )}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          {renderAlertsTile(alerts, activeAlertPreviewId, handleAlertSelect)}
        </Box>
      </Box>
    );
  };

  const renderIssueHubBoard = () => {
    const sourceOption = getIssueHubOption(issueHubSourceCategory);
    const workspaceOption = getIssueHubOption(issueHubWorkspaceCategory);
    const sourceItems = getIssueHubItems(issueHubSourceCategory);
    const workspaceItems = getIssueHubItems(issueHubWorkspaceCategory);
    const alerts = getAlertsForCurrentBoard();

    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '300px minmax(0, 1fr) 280px' }, gap: 3 }}>
        <Paper sx={{ p: 2, minHeight: 740, borderRadius: 2, border: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Issue Type</InputLabel>
            <Select
              value={issueHubSourceCategory}
              label="Issue Type"
              onChange={(e) => setIssueHubSourceCategory(e.target.value)}
            >
              {ISSUE_HUB_OPTIONS.map((option) => (
                <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="h6" fontWeight={700} sx={{ color: sourceOption.color, mb: 1.5, pb: 1.5, borderBottom: `2px solid ${sourceOption.color}` }}>
            {sourceOption.label}
          </Typography>
          <Stack spacing={1} sx={{ overflowY: 'auto', flex: 1 }}>
            {sourceItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No items found</Typography>
            ) : (
              sourceItems.slice(0, getIssueHubOption(issueHubSourceCategory).type === 'message'
                ? getVisibleMessageCount(issueHubSourceCategory)
                : getVisibleOrderCount(issueHubSourceCategory)
              ).map((item) => sourceOption.type === 'message'
                ? renderStaticMessageCard(item)
                : renderStaticOrderCard(item)
              )
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, minHeight: 740, borderRadius: 2, border: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" fontWeight={700} sx={{ color: workspaceOption.color, mb: 1.5, pb: 1.5, borderBottom: `2px solid ${workspaceOption.color}` }}>
            Working Space: {workspaceOption.label}
          </Typography>
          <Stack spacing={1} sx={{ overflowY: 'auto', flex: 1 }}>
            {workspaceItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Click an alert to open its items here</Typography>
            ) : (
              workspaceItems.map((item) => workspaceOption.type === 'message'
                ? renderStaticMessageCard(item)
                : renderStaticOrderCard(item)
              )
            )}
          </Stack>
        </Paper>

        {renderAlertsTile(alerts, issueHubWorkspaceCategory, setIssueHubWorkspaceCategory)}
      </Box>
    );
  };

  // Render order card (compact version for mini tiles, full version for main columns)
  const renderOrderCard = (order, provided, snapshot, isCompact = false, columnStatus = '', isDragDisabled = false) => {
    const showOrderCommunicationBadge = (
      (selectedCategory === 'cancellation' || selectedCategory === 'inr') &&
      order.complianceBoardSource === 'order_communication'
    );
    const trackingNumber = order.manualTrackingNumber || order.trackingNumber || '';
    const unreadMessageCount = getUnreadMessageCountForOrder(order);
    const pickedUpByLabel = getPickedUpByLabel(order);

    // Debug log for cancelled orders
    if (columnStatus === COLUMN_STATUS.TODO && order.sourceType === 'cancelled-order') {
      console.log(`[CARD-DEBUG] Cancelled order ${order.orderId}:`, {
        cancelState: order.cancelState,
        sourceType: order.sourceType,
        complianceBoardStatus: order.complianceBoardStatus
      });
    }

    const missingFields = selectedCategory === 'order_fulfillment' ? getMissingFulfillmentFields(order) : [];

    return (
      <Card
        ref={provided.innerRef}
        {...provided.draggableProps}
        {...provided.dragHandleProps}
        sx={{
          cursor: isDragDisabled ? 'not-allowed' : 'grab',
          bgcolor: snapshot.isDragging ? '#fef3c7' : '#fff',
          border: snapshot.isDragging ? `2px solid ${BRAND_YELLOW_DARK}` : '1px solid #e2e8f0',
          borderRadius: 1.5,
          transition: 'all 0.2s ease',
          '&:hover': { 
            boxShadow: isDragDisabled ? 'none' : 3, 
            transform: isDragDisabled ? 'none' : 'translateY(-2px)'
          },
          flexShrink: 0,
          minHeight: 'fit-content',
          position: 'relative'
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack spacing={1.5}>
            {/* Top Row - Order ID with actions */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1}>
                <ShoppingCartIcon sx={{ fontSize: 18, color: BRAND_YELLOW_DARK }} />
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography
                    component="button"
                    type="button"
                    variant="body2"
                    fontWeight={700}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenOrderDetails(order.orderId || order.legacyOrderId, {
                        canEditFulfillment: selectedCategory === 'order_fulfillment' && columnStatus === COLUMN_STATUS.TODO
                      });
                    }}
                    sx={{
                      color: BRAND_DARK,
                      fontSize: '0.95rem',
                      p: 0,
                      border: 0,
                      bgcolor: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      '&:hover': { textDecoration: 'underline' },
                      '&:focus-visible': {
                        outline: `2px solid ${BRAND_BLUE}`,
                        outlineOffset: 2,
                      }
                    }}
                  >
                    {order.orderId || order.legacyOrderId || '-'}
                  </Typography>
                  {isDragDisabled && (
                    <Tooltip title={`Missing: ${missingFields.join(', ')}`} arrow>
                      <InfoIcon sx={{ fontSize: 18, color: '#dc2626', cursor: 'help', flexShrink: 0 }} />
                    </Tooltip>
                  )}
                </Stack>
                {selectedCategory === 'cancellation' && order.caseInfo?.state && (
                  <Chip
                    label={order.caseInfo.state}
                    size="small"
                    sx={{ 
                      bgcolor: (() => {
                        const state = order.caseInfo.state;
                        if (state === 'CLOSED' || state === 'RESOLVED') return '#dcfce7';
                        if (state === 'APPROVAL_PENDING' || state === 'PENDING') return '#fef3c7';
                        if (state === 'OPEN' || state === 'IN_PROGRESS') return '#fee2e2';
                        if (state === 'WAITING_BUYER_RESPONSE') return '#e0e7ff';
                        if (state === 'WAITING_SELLER_RESPONSE') return '#ffedd5';
                        if (state === 'ON_HOLD') return '#fef3c7';
                        return '#f3f4f6';
                      })(),
                      color: (() => {
                        const state = order.caseInfo.state;
                        if (state === 'CLOSED' || state === 'RESOLVED') return '#166534';
                        if (state === 'APPROVAL_PENDING' || state === 'PENDING') return '#92400e';
                        if (state === 'OPEN' || state === 'IN_PROGRESS') return '#991b1b';
                        if (state === 'WAITING_BUYER_RESPONSE') return '#3730a3';
                        if (state === 'WAITING_SELLER_RESPONSE') return '#9a3412';
                        if (state === 'ON_HOLD') return '#92400e';
                        return '#374151';
                      })(),
                      fontSize: '0.75rem', 
                      height: 24, 
                      fontWeight: 800 
                    }}
                  />
                )}
              </Stack>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Copy Order ID">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCopyOrderId(order.orderId); }} sx={{ p: 0.5 }}>
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Message Buyer">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenMessageDialog(order); }} sx={{ color: '#3b82f6', p: 0.5 }}>
                    <ChatIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="View Activity Logs">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenActivityLogs(order); }} sx={{ color: '#8b5cf6', p: 0.5 }}>
                    <HistoryIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {!isCompact && (
              <>
                {/* Second Row - Buyer Name and Date */}
                <Stack direction="row" spacing={2} alignItems="center">
                  {(order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username) && (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <PersonIcon sx={{ fontSize: 16, color: '#64748b' }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem' }}>
                        {order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username}
                      </Typography>
                    </Stack>
                  )}
                  {order.dateSold && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                      {formatDateSoldPT(order.dateSold)}
                    </Typography>
                  )}
                </Stack>

                {/* Remark Box */}
                {order.remark && (
                  <Stack spacing={0.5} sx={{ borderLeft: '3px solid #fbbf24', bgcolor: '#fef3c7', p: 1, borderRadius: 0.5 }}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <CommentIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
                      <Typography variant="caption" fontWeight={700} sx={{ color: '#f59e0b', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                        Remark
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#92400e', fontWeight: 600, wordBreak: 'break-word', fontSize: '0.85rem', lineHeight: 1.3 }}>
                      {order.remark}
                    </Typography>
                  </Stack>
                )}

                {/* Additional Info */}
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {unreadMessageCount > 0 && (
                    <Chip
                      icon={<ChatIcon sx={{ color: '#fff !important', fontSize: 14 }} />}
                      label={`${unreadMessageCount} unread`}
                      size="small"
                      sx={{ bgcolor: '#dc2626', color: '#fff', fontSize: '0.75rem', height: 24, fontWeight: 800 }}
                    />
                  )}
                  {/* Cancellation Status Badge */}
                  {order.cancelState && (
                    <Chip
                      label={String(order.cancelState).toUpperCase()}
                      size="small"
                      sx={{
                        bgcolor: (() => {
                          const state = String(order.cancelState || '').toUpperCase();
                          if (state === 'CANCEL_CLOSED_WITH_REFUND') return '#dcfce7';
                          if (state === 'CANCEL_PENDING') return '#fef3c7';
                          if (state === 'CANCEL_REQUESTED') return '#fed7aa';
                          if (state === 'CANCEL_REJECTED') return '#fee2e2';
                          if (state === 'IN_PROGRESS') return '#fed7aa';
                          return '#f3f4f6';
                        })(),
                        color: (() => {
                          const state = String(order.cancelState || '').toUpperCase();
                          if (state === 'CANCEL_CLOSED_WITH_REFUND') return '#166534';
                          if (state === 'CANCEL_PENDING') return '#92400e';
                          if (state === 'CANCEL_REQUESTED') return '#b45309';
                          if (state === 'CANCEL_REJECTED') return '#991b1b';
                          if (state === 'IN_PROGRESS') return '#b45309';
                          return '#374151';
                        })(),
                        fontSize: '0.75rem',
                        height: 24,
                        fontWeight: 800
                      }}
                    />
                  )}
                  {pickedUpByLabel && (
                    <Chip
                      icon={<PersonIcon sx={{ color: '#1e40af !important', fontSize: 14 }} />}
                      label={`Picked Up By: ${pickedUpByLabel}`}
                      size="small"
                      sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: '0.75rem', height: 24, fontWeight: 800 }}
                    />
                  )}
                  {selectedCategory === 'inr' && trackingNumber && (
                    <Chip
                      label={`Tracking: ${trackingNumber}`}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(trackingNumber);
                      }}
                      sx={{
                        bgcolor: '#dcfce7',
                        color: '#166534',
                        fontSize: '0.75rem',
                        height: 24,
                        fontWeight: 700,
                        maxWidth: '100%',
                        cursor: 'copy',
                        '& .MuiChip-label': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }
                      }}
                    />
                  )}
                  {showOrderCommunicationBadge && (
                    <Chip
                      label="From Order Communication"
                      size="small"
                      sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', height: 24, fontWeight: 700 }}
                    />
                  )}
                  {order.returnBoardSource === 'return_request' && (
                    <Chip
                      label={`Return Request${order.returnInfo?.returnStatus ? `: ${order.returnInfo.returnStatus}` : ''}`}
                      size="small"
                      sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontSize: '0.75rem', height: 24, fontWeight: 700 }}
                    />
                  )}
                  {order.returnBoardSource === 'conversation' && (
                    <Chip
                      label={`Conversation: ${order.conversationInfo?.category || 'Return'}`}
                      size="small"
                      sx={{ bgcolor: '#ffedd5', color: '#9a3412', fontSize: '0.75rem', height: 24, fontWeight: 700 }}
                    />
                  )}
                  {order.subtotal && (
                    <Chip label={`$${order.subtotal.toFixed(2)}`} size="small" sx={{ bgcolor: '#f1f5f9', fontSize: '0.8rem', height: 24 }} />
                  )}
                </Stack>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // Helper function to render a droppable column
  const renderDroppableColumn = (status, title, color, height = '100%', minHeight = 500, headerControl = null, droppableId = status) => {
    // Filter orders by unread status if the filter is enabled
    let statusOrders = orders[status] || [];
    if (showOnlyUnreadMessages) {
      statusOrders = statusOrders.filter(order => getUnreadMessageCountForOrder(order) > 0);
    }

    // Filter out CANCELED orders from order_fulfillment board
    if (selectedCategory === 'order_fulfillment') {
      statusOrders = statusOrders.filter(order => order.cancelState !== 'CANCELED');
    }

    const visibleCount = getVisibleOrderCount(status);
    const remainingCount = Math.max(0, statusOrders.length - visibleCount);

    return (
    <Droppable droppableId={droppableId} type="order">
      {(provided, snapshot) => (
        <Paper
          ref={provided.innerRef}
          {...provided.droppableProps}
          sx={{
            p: 2,
            height,
            minHeight,
            bgcolor: snapshot.isDraggingOver ? `${color}15` : '#fff',
            borderRadius: 1.5,
            border: `2px solid ${snapshot.isDraggingOver ? color : '#e2e8f0'}`,
            transition: 'all 0.2s ease',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={1.5}
            pb={1.5}
            borderBottom={`2px solid ${color}`}
            sx={{ flexShrink: 0 }}
          >
            {headerControl || (
              <Typography variant="h6" fontWeight={700} sx={{ color, fontSize: '1rem' }}>
                {title}
              </Typography>
            )}
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small"
                variant={getPendingCount(pendingOrderMoves, status) > 0 ? 'contained' : 'outlined'}
                disabled={getPendingCount(pendingOrderMoves, status) === 0 || applyingColumns[`order:${status}`]}
                onClick={() => {
                  console.log(`[APPLY-BTN] Apply button clicked for status: ${status}`, {
                    pendingCount: getPendingCount(pendingOrderMoves, status),
                    pendingOrderMoves: pendingOrderMoves[status] || {}
                  });
                  applyOrderColumn(status);
                }}
                sx={{
                  minWidth: 72,
                  height: 26,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  bgcolor: getPendingCount(pendingOrderMoves, status) > 0 ? color : 'transparent',
                  borderColor: color,
                  color: getPendingCount(pendingOrderMoves, status) > 0 ? '#fff' : color,
                  '&:hover': {
                    bgcolor: getPendingCount(pendingOrderMoves, status) > 0 ? color : `${color}10`,
                    borderColor: color,
                  }
                }}
              >
                {applyingColumns[`order:${status}`]
                  ? <CircularProgress size={14} color="inherit" />
                  : `Apply${getPendingCount(pendingOrderMoves, status) ? ` ${getPendingCount(pendingOrderMoves, status)}` : ''}`}
              </Button>
              <Chip
                label={getColumnCount(status)}
                size="small"
                sx={{ bgcolor: color, color: '#fff', fontWeight: 700, height: 24 }}
              />
            </Stack>
          </Stack>
          <Stack spacing={1} sx={{ overflowY: 'auto', flex: 1 }}>
            {statusOrders.slice(0, visibleCount).map((order, index) => {
              const isOrderFulfillmentCategory = selectedCategory === 'order_fulfillment';
              const isComplete = isOrderFulfillmentComplete(order);
              const canDrag = true;
              const missingFields = isOrderFulfillmentCategory ? getMissingFulfillmentFields(order) : [];
              
              return (
                <Draggable 
                  key={order._id} 
                  draggableId={order._id} 
                  index={index}
                  isDragDisabled={!canDrag}
                >
                  {(provided, snapshot) => {
                    // Handle drag attempt on incomplete order
                    if (!canDrag && snapshot.isDragging) {
                      setSnackbar({
                        open: true,
                        message: `❌ Cannot move: Missing fields - ${missingFields.join(', ')}`
                      });
                    }
                    return renderOrderCard(order, provided, snapshot, false, status, !canDrag);
                  }}
                </Draggable>
              );
            })}
            {remainingCount > 0 && (
              <Button
                size="small"
                onClick={() => handleLoadMoreOrders(status)}
                sx={{ alignSelf: 'center', fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
              >
                +{remainingCount} more
              </Button>
            )}
            {provided.placeholder}
          </Stack>
        </Paper>
      )}
    </Droppable>
    );
  };

  const renderStaticMessageCard = (item) => {
    const sellerName = item.sellerName || getSellerName(item.sellerId) || 'Unknown Seller';
    const buyerName = item.buyerName || item.buyerUsername || 'Unknown Buyer';
    const messageType = item.actualMessageType || item.messageType;
    const isInquiry = !item.orderId && (messageType === 'INQUIRY' || messageType === 'DIRECT' || item.itemId === 'DIRECT_MESSAGE');
    const orderId = item.orderId || (isInquiry ? 'Inquiry' : 'N/A');
    const itemTitle = item.itemTitle || item.productName || (messageType === 'INQUIRY' ? 'Inquiry Message' : (messageType === 'DIRECT' ? 'Direct Message' : 'No Item'));
    const lastMessageText = cleanMessagePreviewText(item.messageText || item.lastMessage || '');
    const unreadCount = item.unreadCount || 0;
    const messageDate = item.lastDate || item.lastMessageDate || item.messageDate;
    const overdueInfo = item._overdueInfo;

    return (
      <Card key={getMessageKey(item)} sx={{ borderRadius: 1.5, border: '1px solid #e2e8f0', boxShadow: 'none', flexShrink: 0 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack spacing={1.5}>
            {/* Top Row - Order ID with Actions */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1}>
                <ShoppingCartIcon sx={{ fontSize: 18, color: BRAND_YELLOW_DARK }} />
                <Typography variant="body2" fontWeight={700} sx={{ color: BRAND_DARK, fontSize: '0.95rem' }}>
                  {orderId}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                {item.orderId && (
                  <Tooltip title="Copy Order ID">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCopyOrderId(orderId); }} sx={{ p: 0.5 }}>
                      <ContentCopyIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Message Buyer">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenMessageDialog(item); }} sx={{ color: '#3b82f6', p: 0.5 }}>
                    <ChatIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {/* Seller and Buyer Info */}
            <Stack direction="column" spacing={0.75}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <PersonIcon sx={{ fontSize: 14, color: '#64748b' }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                  Seller: {sellerName}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <PersonIcon sx={{ fontSize: 14, color: '#64748b' }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                  Buyer: {buyerName}
                </Typography>
              </Stack>
            </Stack>

            {renderMessagePickedUpByControl(item)}

            {/* Item Title */}
            <Stack spacing={0.25}>
              <Typography variant="caption" sx={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                Item
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ color: BRAND_DARK, fontSize: '0.9rem' }}>
                {itemTitle}
              </Typography>
            </Stack>

            {/* Last Message Preview */}
            {lastMessageText && (
              <Stack spacing={0.25} sx={{ borderLeft: '3px solid #fbbf24', bgcolor: '#fef3c7', p: 1, borderRadius: 0.5 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <CommentIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
                  <Typography variant="caption" fontWeight={700} sx={{ color: '#f59e0b', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                    Latest Message
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: '#92400e', fontWeight: 600, wordBreak: 'break-word', fontSize: '0.85rem', lineHeight: 1.3 }}>
                  {lastMessageText}
                </Typography>
              </Stack>
            )}

            {/* Overdue Warning */}
            {overdueInfo && (
              <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 1, p: 1 }}>
                <Typography variant="caption" sx={{ color: '#b91c1c', fontWeight: 700, display: 'block', fontSize: '0.75rem' }}>
                  🔴 NO REPLY FOR {formatElapsed(overdueInfo.elapsedMs).toUpperCase()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#b91c1c', fontWeight: 700, display: 'block', fontSize: '0.75rem', mt: 0.5 }}>
                  Buyer sent message: {format(new Date(overdueInfo.lastMessageTime), 'MMM dd, yyyy HH:mm')}
                </Typography>
                <Typography variant="caption" sx={{ color: '#991b1b', display: 'block', fontSize: '0.75rem', mt: 0.25 }}>
                  Overdue by {formatElapsed(overdueInfo.overdueMs)} beyond 8h SLA
                </Typography>
              </Box>
            )}

            {/* Message Type Badge */}
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Chip
                label={messageType === 'ORDER' ? 'Order Message' : 'Inquiry'}
                size="small"
                sx={{ 
                  bgcolor: messageType === 'ORDER' ? '#dbeafe' : '#fef3c7',
                  color: messageType === 'ORDER' ? '#1d4ed8' : '#92400e',
                  fontSize: '0.75rem',
                  height: 24,
                  fontWeight: 700
                }}
              />
              {unreadCount > 0 && (
                <Chip 
                  label={`${unreadCount} unread`} 
                  size="small" 
                  color="error" 
                  sx={{ fontSize: '0.75rem', height: 24, fontWeight: 700 }}
                />
              )}
            </Stack>

            {/* Timestamp */}
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Last message: {messageDate ? format(new Date(messageDate), 'MMM dd, yyyy HH:mm') : 'N/A'}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  const renderStaticOrderCard = (order) => {
    const showOrderCommunicationBadge = (
      (selectedCategory === 'cancellation' || selectedCategory === 'inr') &&
      order.complianceBoardSource === 'order_communication'
    );
    const trackingNumber = order.manualTrackingNumber || order.trackingNumber || '';
    const unreadMessageCount = getUnreadMessageCountForOrder(order);
    const sellerName = resolveOrderSellerName(order);
    const buyerName = order.buyer?.buyerRegistrationAddress?.fullName || order.buyer?.username || 'Unknown Buyer';
    const itemTitle = order.itemTitle || order.productName || order.lineItems?.[0]?.title || 'Item details unavailable';
    const shippingAddress = [
      order.fulfillmentStartInstructions?.shipTo?.city,
      order.fulfillmentStartInstructions?.shipTo?.stateOrProvince,
      order.fulfillmentStartInstructions?.shipTo?.country
    ].filter(Boolean).join(', ');
    const overdueInfo = order._overdueInfo;
    const pickedUpByLabel = getPickedUpByLabel(order);
    const returnStatusChip = overdueInfo?.sourceStatus || (
      order.complianceBoardStatus === COLUMN_STATUS.CASE_OPENED
        ? 'Case Opened'
        : order.complianceBoardStatus === COLUMN_STATUS.CASE_NOT_OPENED
          ? 'Case Not Opened'
          : null
    );
    const returnStatusChipSx = returnStatusChip === 'Case Opened'
      ? { bgcolor: '#fee2e2', color: '#b91c1c', fontSize: '0.75rem', height: 24, fontWeight: 700 }
      : { bgcolor: '#ffedd5', color: '#c2410c', fontSize: '0.75rem', height: 24, fontWeight: 700 };

    return (
      <Card key={order._id} sx={{ borderRadius: 1.5, border: '1px solid #e2e8f0', boxShadow: 'none', flexShrink: 0 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack spacing={1}>
            {selectedCategory === 'issue_hub' && trackingNumber && (
              <Box sx={{ mb: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'inline-block',
                    bgcolor: '#1d4ed8',
                    color: '#fff',
                    fontWeight: 800,
                    px: 1,
                    py: 0.5,
                    borderRadius: 0.5,
                    letterSpacing: 0.2,
                  }}
                >
                  TRACKING NUMBER
                </Typography>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 0.75 }}>
                  <Chip
                    label={trackingNumber}
                    sx={{
                      maxWidth: 'calc(100% - 36px)',
                      bgcolor: '#e5e7eb',
                      color: '#374151',
                      fontWeight: 700,
                      '& .MuiChip-label': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }
                    }}
                  />
                  <IconButton size="small" onClick={() => handleCopy(trackingNumber)} sx={{ p: 0.25 }}>
                    <ContentCopyIcon sx={{ fontSize: 16, color: '#6b7280' }} />
                  </IconButton>
                </Stack>
              </Box>
            )}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Typography
                component="button"
                type="button"
                variant="body2"
                fontWeight={700}
                onClick={() => handleOpenOrderDetails(order.orderId || order.legacyOrderId)}
                sx={{
                  color: BRAND_DARK,
                  p: 0,
                  border: 0,
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  '&:hover': { textDecoration: 'underline' },
                  '&:focus-visible': {
                    outline: `2px solid ${BRAND_BLUE}`,
                    outlineOffset: 2,
                  }
                }}
              >
                {order.orderId || order.legacyOrderId || '-'}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => handleCopyOrderId(order.orderId)} sx={{ p: 0.25 }}>
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton size="small" onClick={() => handleOpenMessageDialog(order)} sx={{ color: BRAND_BLUE, p: 0.25 }}>
                  <ChatIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton size="small" onClick={() => handleOpenActivityLogs(order)} sx={{ color: '#8b5cf6', p: 0.25 }}>
                  <HistoryIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            </Stack>
            <Typography variant="body2" fontWeight={600} sx={{ color: BRAND_DARK }}>
              {itemTitle}
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {buyerName}
              </Typography>
              {order.dateSold && (
                <Typography variant="caption" color="text.secondary">
                  {formatDateSoldPT(order.dateSold)}
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Seller: {sellerName}
            </Typography>
            {shippingAddress && (
              <Typography variant="caption" color="text.secondary">
                Ship to: {shippingAddress}
              </Typography>
            )}
            {order.remark && (
              <Typography variant="body2" sx={{ bgcolor: '#fef3c7', color: '#92400e', p: 1, borderRadius: 1 }}>
                {order.remark}
              </Typography>
            )}
            {overdueInfo && (
              <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 1, p: 1 }}>
                <Typography variant="caption" sx={{ color: '#b91c1c', fontWeight: 700, display: 'block' }}>
                  {overdueInfo.sourceStatus} started on {format(new Date(overdueInfo.startedAt), 'MMM dd, yyyy HH:mm')}
                </Typography>
                {order.returnInfo?.responseDate && (
                  <Typography variant="caption" sx={{ color: '#991b1b', fontWeight: 700, display: 'block' }}>
                    Response due by {format(new Date(order.returnInfo.responseDate), 'MMM dd, yyyy HH:mm')}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#b91c1c', display: 'block' }}>
                  {overdueInfo.message
                    ? overdueInfo.message
                    : overdueInfo.alertType === PAYMENT_STATUS_OVERDUE_ALERT_ID
                    ? `Still waiting for refund action for ${formatElapsed(overdueInfo.elapsedMs)}.`
                    : `Not moved to Provide Return Label for ${formatElapsed(overdueInfo.elapsedMs)}.`}
                </Typography>
                <Typography variant="caption" sx={{ color: '#991b1b', display: 'block' }}>
                  Overdue by {formatElapsed(overdueInfo.overdueMs)}.
                </Typography>
              </Box>
            )}
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {unreadMessageCount > 0 && (
                <Chip
                  icon={<ChatIcon sx={{ color: '#fff !important', fontSize: 14 }} />}
                  label={`${unreadMessageCount} unread`}
                  size="small"
                  sx={{ bgcolor: '#dc2626', color: '#fff', fontSize: '0.75rem', height: 24, fontWeight: 800 }}
                />
              )}
              {pickedUpByLabel && (
                <Chip
                  icon={<PersonIcon sx={{ color: '#1e40af !important', fontSize: 14 }} />}
                  label={`Picked Up By: ${pickedUpByLabel}`}
                  size="small"
                  sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: '0.75rem', height: 24, fontWeight: 800 }}
                />
              )}
              {selectedCategory === 'inr' && trackingNumber && (
                <Chip
                  label={`Tracking: ${trackingNumber}`}
                  size="small"
                  onClick={() => handleCopy(trackingNumber)}
                  sx={{
                    bgcolor: '#dcfce7',
                    color: '#166534',
                    fontSize: '0.75rem',
                    height: 24,
                    fontWeight: 700,
                    maxWidth: '100%',
                    cursor: 'copy',
                    '& .MuiChip-label': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }
                  }}
                />
              )}
              {returnStatusChip && selectedCategory === 'return_refund' && (
                <Chip label={returnStatusChip} size="small" sx={returnStatusChipSx} />
              )}
              {showOrderCommunicationBadge && (
                <Chip label="From Order Communication" size="small" sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', height: 24, fontWeight: 700 }} />
              )}
              {order.subtotal && (
                <Chip label={`$${order.subtotal.toFixed(2)}`} size="small" sx={{ bgcolor: '#f1f5f9', fontSize: '0.8rem', height: 24 }} />
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  const renderAlertPreviewDialog = (alerts) => {
    const activeAlert = alerts.find((alert) => alert.id === activeAlertPreviewId);
    const previewItems = activeAlert
      ? (alertPreviewItems !== null ? alertPreviewItems : getAlertPreviewItems(selectedCategory, activeAlert.id))
      : [];
    const isMessageAlert = selectedCategory === 'order_communication' || (activeAlert && isMessageOverdueAlert(activeAlert.id));
    const visibleCount = activeAlert
      ? (alertPreviewItems !== null ? previewItems.length : getAlertPreviewVisibleCount(selectedCategory, activeAlert.id))
      : 0;
    const remainingCount = activeAlert ? Math.max(0, previewItems.length - visibleCount) : 0;

    return (
      <Dialog
        open={Boolean(activeAlert)}
        onClose={() => {
          setActiveAlertPreviewId(null);
          setAlertPreviewItems(null);
        }}
        fullWidth
        maxWidth="md"
        BackdropProps={{ style: { pointerEvents: 'none' } }}
        disableEnforceFocus
        PaperProps={{
          sx: {
            height: 'min(85vh, 900px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', bgcolor: '#fff', flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: activeAlert?.color || BRAND_DARK }}>
                {activeAlert ? `${activeAlert.label} Details` : 'Alert Details'}
              </Typography>
              {activeAlert && (
                <Typography variant="body2" color="text.secondary">
                  {previewItems.length} {isMessageAlert ? 'message' : 'order'}{previewItems.length === 1 ? '' : 's'} in this category
                </Typography>
              )}
            </Box>
            <IconButton onClick={() => {
              setActiveAlertPreviewId(null);
              setAlertPreviewItems(null);
            }} size="small" sx={{ color: 'text.disabled' }}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </Box>
        <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {alertPreviewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !activeAlert ? (
            <Typography variant="body2" color="text.secondary">
              Click an alert above to preview the items for that category.
            </Typography>
          ) : previewItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No items are currently in this category.
            </Typography>
          ) : (
            <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
              {previewItems.slice(0, visibleCount).map((item) => (
                isMessageAlert ? renderStaticMessageCard(item) : renderStaticOrderCard(item)
              ))}
              {remainingCount > 0 && (
                <Button
                  size="small"
                  onClick={() => handleLoadMoreAlertPreviewItems(selectedCategory, activeAlert.id, previewItems.length)}
                  sx={{ alignSelf: 'center', fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
                >
                  +{remainingCount} more
                </Button>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  const renderAlertButton = (alert, activeId, onSelect) => (
    <Button
      key={alert.id}
      variant={activeId === alert.id ? 'contained' : 'outlined'}
      onClick={() => onSelect?.(alert.id)}
      sx={{
        justifyContent: 'space-between',
        textTransform: 'none',
        fontWeight: 700,
        borderColor: alert.color,
        color: activeId === alert.id ? '#fff' : alert.color,
        bgcolor: activeId === alert.id ? alert.color : 'transparent',
        '&:hover': {
          borderColor: alert.color,
          bgcolor: activeId === alert.id ? alert.color : `${alert.color}12`,
        }
      }}
    >
      <span>{alert.label}</span>
      <Chip label={alert.count} size="small" sx={{ bgcolor: activeId === alert.id ? '#fff' : alert.color, color: activeId === alert.id ? alert.color : '#fff', fontWeight: 700, height: 22 }} />
    </Button>
  );

  const renderAlertsTile = (alerts, activeId, onSelect) => {
    const statItems = alerts.filter((alert) => alert.type !== 'alert');
    const alertItems = alerts.filter((alert) => alert.type === 'alert');

    return (
      <Paper sx={{ p: 2, height: '100%', minHeight: 740, borderRadius: 2, border: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: BRAND_DARK, mb: 1.5, pb: 1.5, borderBottom: '2px solid #e2e8f0' }}>
          Stats
        </Typography>

        <Stack spacing={2} sx={{ overflowY: 'auto' }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND_DARK, mb: 1 }}>
              Stats
            </Typography>
            <Stack spacing={1}>
              {statItems.map((alert) => renderAlertButton(alert, activeId, onSelect))}
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#b91c1c', mb: 1 }}>
              Alerts
            </Typography>
            {alertItems.length > 0 ? (
              <Stack spacing={1}>
                {alertItems.map((alert) => renderAlertButton(alert, activeId, onSelect))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No overdue alerts.
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>
    );
  };

  const renderBoardWithAlerts = (boardContent, alerts) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 280px' }, gap: 3, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0, overflow: 'hidden' }}>{boardContent}</Box>
      {renderAlertsTile(alerts, activeAlertPreviewId, handleAlertPreviewSelect)}
    </Box>
  );

  const renderColumnViewSelect = (label, value, options, onChange) => {
    const selected = options.find((option) => option.id === value) || options[0];
    return (
      <FormControl size="small" sx={{ minWidth: 220 }}>
        <InputLabel>{label}</InputLabel>
        <Select
          label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          sx={{
            fontWeight: 800,
            color: selected.color,
            '& .MuiSelect-select': { py: 0.6 }
          }}
        >
          {options.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  };

  // Render Return/Refund Board
  const renderReturnRefundBoard = () => {
    const caseOpenedOption = RETURN_CASE_OPENED_OPTIONS.find((option) => option.id === returnCaseOpenedCategory) || RETURN_CASE_OPENED_OPTIONS[0];
    const caseNotOpenedOption = RETURN_CASE_NOT_OPENED_OPTIONS.find((option) => option.id === returnCaseNotOpenedCategory) || RETURN_CASE_NOT_OPENED_OPTIONS[0];
    const flowOption = RETURN_FLOW_OPTIONS.find((option) => option.id === returnFlowCategory) || RETURN_FLOW_OPTIONS[0];
    const resolutionOption = RETURN_RESOLUTION_OPTIONS.find((option) => option.id === returnResolutionCategory) || RETURN_RESOLUTION_OPTIONS[0];

    return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {renderDroppableColumn(
          caseOpenedOption.id,
          caseOpenedOption.label,
          caseOpenedOption.color,
          '360px',
          0,
          renderColumnViewSelect('Box View', returnCaseOpenedCategory, RETURN_CASE_OPENED_OPTIONS, setReturnCaseOpenedCategory)
        )}
        {renderDroppableColumn(
          caseNotOpenedOption.id,
          caseNotOpenedOption.label,
          caseNotOpenedOption.color,
          '360px',
          0,
          renderColumnViewSelect('Box View', returnCaseNotOpenedCategory, RETURN_CASE_NOT_OPENED_OPTIONS, setReturnCaseNotOpenedCategory)
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {renderDroppableColumn(
          flowOption.id,
          flowOption.label,
          flowOption.color,
          '740px',
          0,
          renderColumnViewSelect('Box View', returnFlowCategory, RETURN_FLOW_OPTIONS, setReturnFlowCategory)
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {renderDroppableColumn(
          resolutionOption.id,
          resolutionOption.label,
          resolutionOption.color,
          '740px',
          0,
          renderColumnViewSelect('Box View', returnResolutionCategory, RETURN_RESOLUTION_OPTIONS, setReturnResolutionCategory)
        )}
      </Box>
    </Box>
    );
  };

  // Render Cancellation Board
  const renderCancellationBoard = () => {
    const decisionOption = CANCELLATION_DECISION_OPTIONS.find((option) => option.id === cancellationDecisionCategory) || CANCELLATION_DECISION_OPTIONS[0];

    return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {renderDroppableColumn(
          COLUMN_STATUS.CANCELLATION_REQUEST,
          getColumnTitle(COLUMN_STATUS.CANCELLATION_REQUEST),
          getColumnColor(COLUMN_STATUS.CANCELLATION_REQUEST),
          '280px',
          0
        )}
        {renderDroppableColumn(
          COLUMN_STATUS.CASE_NOT_OPENED,
          getColumnTitle(COLUMN_STATUS.CASE_NOT_OPENED),
          getColumnColor(COLUMN_STATUS.CASE_NOT_OPENED),
          '280px',
          0
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {renderDroppableColumn(
          decisionOption.id,
          decisionOption.label,
          decisionOption.color,
          '580px',
          0,
          renderColumnViewSelect('Box View', cancellationDecisionCategory, CANCELLATION_DECISION_OPTIONS, setCancellationDecisionCategory)
        )}
      </Box>
    </Box>
    );
  };

  // Render INR Board
  const renderINRBoard = () => {
    const primaryOption = INR_PRIMARY_VIEW_OPTIONS.find((option) => option.id === inrPrimaryCategory) || INR_PRIMARY_VIEW_OPTIONS[0];
    const secondaryOption = INR_SECONDARY_VIEW_OPTIONS.find((option) => option.id === inrSecondaryCategory) || INR_SECONDARY_VIEW_OPTIONS[0];
    const actionOption = INR_ACTION_OPTIONS.find((option) => option.id === inrActionCategory) || INR_ACTION_OPTIONS[0];
    const refundOption = INR_REFUND_OPTIONS.find((option) => option.id === inrRefundCategory) || INR_REFUND_OPTIONS[0];

    return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(3, 1fr)' }, gap: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {renderDroppableColumn(
          primaryOption.id,
          primaryOption.label,
          primaryOption.color,
          '280px',
          0,
          renderColumnViewSelect('Box View', inrPrimaryCategory, INR_PRIMARY_VIEW_OPTIONS, setInrPrimaryCategory),
          INR_VIEW_IDS.PRIMARY
        )}
        {renderDroppableColumn(
          secondaryOption.id,
          secondaryOption.label,
          secondaryOption.color,
          '280px',
          0,
          renderColumnViewSelect('Box View', inrSecondaryCategory, INR_SECONDARY_VIEW_OPTIONS, setInrSecondaryCategory),
          INR_VIEW_IDS.SECONDARY
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {renderDroppableColumn(
          actionOption.id,
          actionOption.label,
          actionOption.color,
          '580px',
          0,
          renderColumnViewSelect('Box View', inrActionCategory, INR_ACTION_OPTIONS, setInrActionCategory),
          INR_VIEW_IDS.ACTION
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {renderDroppableColumn(
          refundOption.id,
          refundOption.label,
          refundOption.color,
          '580px',
          0,
          renderColumnViewSelect('Box View', inrRefundCategory, INR_REFUND_OPTIONS, setInrRefundCategory),
          INR_VIEW_IDS.REFUND
        )}
      </Box>
    </Box>
    );
  };

  return (
    <Box sx={{ p: 3, bgcolor: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4" fontWeight={700} color={BRAND_DARK}>
            Compliance & Support Board
          </Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchOrders} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Filters */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-end" flexWrap="wrap">
          <FormControl sx={FILTER_CONTROL_SX}>
            <InputLabel>Category</InputLabel>
            <Select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
                setActiveAlertPreviewId(null);
                setAlertPreviewItems(null);
              }}
              label="Category"
            >
              {BOARD_CATEGORIES.map((cat) => (
                <MenuItem key={cat.value} value={cat.value}>
                  {cat.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={FILTER_CONTROL_SX}>
            <InputLabel>Seller Account</InputLabel>
            <Select
              value={selectedSeller}
              label="Seller Account"
              onChange={(e) => {
                setSelectedSeller(e.target.value);
                setCurrentPage(1);
                setActiveAlertPreviewId(null);
                setAlertPreviewItems(null);
              }}
            >
              <MenuItem value="">
                <em>All Sellers</em>
              </MenuItem>
              {sellers.map((seller) => (
                <MenuItem key={seller._id} value={seller._id}>
                  {seller.user?.username || seller.user?.email || seller._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Order ID"
            value={draftSearchOrderId}
            onChange={(e) => setDraftSearchOrderId(e.target.value)}
            placeholder="Search by order ID..."
            sx={FILTER_CONTROL_SX}
          />

          <TextField
            size="small"
            label="Buyer Name"
            value={draftSearchBuyerName}
            onChange={(e) => setDraftSearchBuyerName(e.target.value)}
            placeholder="Search by buyer name..."
            sx={FILTER_CONTROL_SX}
          />

          {/* Date Filter Mode */}
          <FormControl sx={FILTER_CONTROL_SX}>
            <InputLabel>Date Mode</InputLabel>
            <Select
              value={draftDateFilter.mode}
              label="Date Mode"
              onChange={(e) => setDraftDateFilter(prev => ({ ...prev, mode: e.target.value }))}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="single">Single Day</MenuItem>
              <MenuItem value="range">Date Range</MenuItem>
            </Select>
          </FormControl>

          {/* Single Date Input */}
          {draftDateFilter.mode === 'single' && (
            <TextField
              size="small"
              label="Date"
              type="date"
              value={draftDateFilter.single}
              onChange={(e) => setDraftDateFilter(prev => ({ ...prev, single: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={FILTER_CONTROL_SX}
            />
          )}

          {/* Range Inputs */}
          {draftDateFilter.mode === 'range' && (
            <>
              <TextField
                size="small"
                label="From"
                type="date"
                value={draftDateFilter.from}
                onChange={(e) => setDraftDateFilter(prev => ({ ...prev, from: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={FILTER_CONTROL_SX}
              />
              <TextField
                size="small"
                label="To"
                type="date"
                value={draftDateFilter.to}
                onChange={(e) => setDraftDateFilter(prev => ({ ...prev, to: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={FILTER_CONTROL_SX}
              />
            </>
          )}

          <Box sx={FILTER_ACTION_SX}>
            <FormControlLabel
              control={
                <Switch
                  checked={draftExcludeClient}
                  onChange={(e) => setDraftExcludeClient(e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label="Exclude Client"
              sx={FILTER_SWITCH_SX}
            />
          </Box>

          <Box sx={FILTER_ACTION_SX}>
            <FormControlLabel
              control={
                <Switch
                  checked={draftExcludeLowValue}
                  onChange={(e) => setDraftExcludeLowValue(e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label="Exclude <$3"
              sx={FILTER_SWITCH_SX}
            />
          </Box>

          <Box sx={FILTER_ACTION_SX}>
            <FormControlLabel
              control={
                <Switch
                  checked={showOnlyUnreadMessages}
                  onChange={(e) => setShowOnlyUnreadMessages(e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label="Unread Only"
              sx={FILTER_SWITCH_SX}
            />
          </Box>

          <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button
              variant="contained"
              onClick={handleApplyFilters}
              sx={{
                ...FILTER_ACTION_SX,
                bgcolor: BRAND_YELLOW_DARK,
                color: BRAND_DARK,
                fontWeight: 700,
                '&:hover': { bgcolor: BRAND_YELLOW }
              }}
            >
              Apply Filters
            </Button>
            {(dateFilter.mode !== 'none' || draftDateFilter.mode !== 'none' || selectedSeller || searchOrderId.trim() || draftSearchOrderId.trim() || searchBuyerName.trim() || draftSearchBuyerName.trim() || !excludeClient || !draftExcludeClient || !excludeLowValue || !draftExcludeLowValue || showOnlyUnreadMessages) && (
              <Button
                variant="outlined"
                onClick={() => {
                  handleClearDateFilters();
                  setShowOnlyUnreadMessages(false);
                }}
                sx={{ ...FILTER_ACTION_SX, color: BRAND_YELLOW_DARK, borderColor: BRAND_YELLOW_DARK }}
              >
                Clear Filters
              </Button>
            )}
          </Stack>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* Collapsible Stats Section - Only visible in Order Fulfillment board */}
      {selectedCategory === 'order_fulfillment' && (
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: '#f8fafc' }}>
        <Stack 
          direction="row" 
          justifyContent="space-between" 
          alignItems="center" 
          sx={{ cursor: 'pointer', mb: showStats ? 2 : 0 }}
          onClick={() => setShowStats(!showStats)}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" fontWeight={700} color={BRAND_DARK}>
              Stats
            </Typography>
            <Chip label={showStats ? 'Expanded' : 'Collapsed'} size="small" variant="outlined" />
          </Stack>
          <IconButton size="small" onClick={() => setShowStats(!showStats)}>
            <Typography sx={{ transform: showStats ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              ▼
            </Typography>
          </IconButton>
        </Stack>

        {showStats && (
          <>
            {/* Stats Date Filter */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-end" sx={{ mb: 2 }}>
              <FormControl sx={FILTER_CONTROL_SX}>
                <InputLabel>Date Mode</InputLabel>
                <Select
                  value={draftStatsDateFilter.mode}
                  label="Date Mode"
                  onChange={(e) => setDraftStatsDateFilter(prev => ({ ...prev, mode: e.target.value }))}
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="single">Single Day</MenuItem>
                  <MenuItem value="range">Date Range</MenuItem>
                </Select>
              </FormControl>

              {draftStatsDateFilter.mode === 'single' && (
                <TextField
                  size="small"
                  label="Date"
                  type="date"
                  value={draftStatsDateFilter.single}
                  onChange={(e) => setDraftStatsDateFilter(prev => ({ ...prev, single: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={FILTER_CONTROL_SX}
                />
              )}

              {draftStatsDateFilter.mode === 'range' && (
                <>
                  <TextField
                    size="small"
                    label="From"
                    type="date"
                    value={draftStatsDateFilter.from}
                    onChange={(e) => setDraftStatsDateFilter(prev => ({ ...prev, from: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={FILTER_CONTROL_SX}
                  />
                  <TextField
                    size="small"
                    label="To"
                    type="date"
                    value={draftStatsDateFilter.to}
                    onChange={(e) => setDraftStatsDateFilter(prev => ({ ...prev, to: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={FILTER_CONTROL_SX}
                  />
                </>
              )}

              <Button
                variant="contained"
                onClick={() => setStatsDateFilter(draftStatsDateFilter)}
                sx={{
                  ...FILTER_ACTION_SX,
                  bgcolor: BRAND_YELLOW_DARK,
                  color: BRAND_DARK,
                  fontWeight: 700,
                  '&:hover': { bgcolor: BRAND_YELLOW }
                }}
              >
                Apply
              </Button>
            </Stack>

            {/* Stats Cards Grid */}
            {statsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={30} />
              </Box>
            ) : (
              <Box 
                onClick={(e) => console.log('[STATS-BOX-CLICK] Parent box clicked!', e.target)}
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {/* To Do Card */}
                <Card
                  onMouseDown={(e) => {
                    console.log('[BADGE-MOUSEDOWN] Card mousedown!', e);
                    fetchStatsDetails(COLUMN_STATUS.TODO);
                  }}
                  onClick={(e) => {
                    console.log('[BADGE-CLICK] Card clicked!', e);
                    e.preventDefault();
                    e.stopPropagation();
                    fetchStatsDetails(COLUMN_STATUS.TODO);
                  }}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid ${BRAND_RED}`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        To Do
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color={BRAND_RED}>
                        {statsCounts.todo}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Out of Stock Card */}
                <Card
                  onClick={(e) => {
                    console.log('[BADGE-CLICK] Out of Stock clicked!', e);
                    e.preventDefault();
                    e.stopPropagation();
                    fetchStatsDetails(COLUMN_STATUS.OUT_OF_STOCK);
                  }}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid ${BRAND_ORANGE}`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Out of Stock
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color={BRAND_ORANGE}>
                        {statsCounts.outOfStock}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Cancellation Card */}
                <Card
                  onClick={() => fetchStatsDetails(COLUMN_STATUS.CANCELLATION)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid ${BRAND_BLUE}`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Cancellation
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color={BRAND_BLUE}>
                        {statsCounts.cancellation}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Address Issue Card */}
                <Card
                  onClick={() => fetchStatsDetails(COLUMN_STATUS.ADDRESS_ISSUE)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid #a855f7`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Address Issue
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color="#a855f7">
                        {statsCounts.addressIssue}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Late Delivery Card */}
                <Card
                  onClick={() => fetchStatsDetails(COLUMN_STATUS.LATE_DELIVERY)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid #dc2626`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Late Delivery
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color="#dc2626">
                        {statsCounts.lateDelivery}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Not Fulfilled Card */}
                <Card
                  onClick={() => fetchStatsDetails(COLUMN_STATUS.NOT_FULFILLED)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid ${BRAND_YELLOW_DARK}`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Not Fulfilled
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color={BRAND_YELLOW_DARK}>
                        {statsCounts.notFulfilled}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Fulfilled Card */}
                <Card
                  onClick={() => fetchStatsDetails(COLUMN_STATUS.FULFILLED)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid ${BRAND_GREEN}`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Fulfilled
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color={BRAND_GREEN}>
                        {statsCounts.fulfilled}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                {/* Buyer Confirmation Card */}
                <Card
                  onClick={() => fetchStatsDetails(COLUMN_STATUS.BUYER_CONFIRMATION)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid #0f766e`,
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' }
                  }}
                >
                  <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Buyer Confirmation
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color="#0f766e">
                        {statsCounts.buyerConfirmation}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            )}
          </>
        )}
      </Paper>
      )}

      {/* Board */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          {/* Conditional board rendering based on selected category */}
          {selectedCategory === 'order_communication' ? (
            renderOrderCommunicationBoard(getAlertsForCurrentBoard())
          ) : selectedCategory === 'issue_hub' ? (
            renderIssueHubBoard()
          ) : selectedCategory === 'return_refund' ? (
            renderBoardWithAlerts(renderReturnRefundBoard(), getAlertsForCurrentBoard())
          ) : selectedCategory === 'cancellation' ? (
            renderBoardWithAlerts(renderCancellationBoard(), getAlertsForCurrentBoard())
          ) : selectedCategory === 'inr' ? (
            renderBoardWithAlerts(renderINRBoard(), getAlertsForCurrentBoard())
          ) : (
            /* Default Order Fulfillment Board */
          (() => {
            const fulfillmentAlerts = getAlertsForCurrentBoard();
            const issueOption = ORDER_FULFILLMENT_ISSUE_OPTIONS.find((option) => option.id === fulfillmentIssueCategory) || ORDER_FULFILLMENT_ISSUE_OPTIONS[0];
            const progressOption = ORDER_FULFILLMENT_PROGRESS_OPTIONS.find((option) => option.id === fulfillmentProgressCategory) || ORDER_FULFILLMENT_PROGRESS_OPTIONS[0];
            return (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                    {/* Section 1: Orders (To Do) */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {renderDroppableColumn(
                        COLUMN_STATUS.TODO,
                        getColumnTitle(COLUMN_STATUS.TODO),
                        BRAND_RED,
                        '740px',
                        0
                      )}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      {renderDroppableColumn(
                        issueOption.id,
                        issueOption.label,
                        issueOption.color,
                        '740px',
                        0,
                        renderColumnViewSelect('Box View', fulfillmentIssueCategory, ORDER_FULFILLMENT_ISSUE_OPTIONS, setFulfillmentIssueCategory)
                      )}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      {renderDroppableColumn(
                        progressOption.id,
                        progressOption.label,
                        progressOption.color,
                        '740px',
                        0,
                        renderColumnViewSelect('Box View', fulfillmentProgressCategory, ORDER_FULFILLMENT_PROGRESS_OPTIONS, setFulfillmentProgressCategory)
                      )}
                    </Box>
                  </Box>
                </Box>
                <Stack spacing={2}>
                  {renderAlertsTile(fulfillmentAlerts, activeAlertPreviewId, handleAlertPreviewSelect)}
                </Stack>
              </Box>
            );
          })()
          )}
        </DragDropContext>
      )}

      {selectedCategory !== 'issue_hub' && renderAlertPreviewDialog(getAlertsForCurrentBoard())}

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <Stack
          direction="row"
          justifyContent="center"
          alignItems="center"
          spacing={2}
          sx={{ mt: 3 }}
        >
          <Typography variant="body2" color="text.secondary">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total orders)
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              disabled={pagination.page === 1 || loading}
              onClick={() => setCurrentPage(Math.max(1, pagination.page - 1))}
              variant="outlined"
            >
              Previous
            </Button>
            <Button
              disabled={pagination.page === pagination.totalPages || loading}
              onClick={() => setCurrentPage(pagination.page + 1)}
              variant="outlined"
            >
              Next
            </Button>
          </Stack>
        </Stack>
      )}

      {selectedOrderForMessage && (
        <ChatModal
          open={messageModalOpen}
          onClose={handleCloseMessageDialog}
          orderId={selectedOrderForMessage.orderId || selectedOrderForMessage.legacyOrderId}
          buyerUsername={selectedOrderForMessage.buyer?.username || selectedOrderForMessage.buyerUsername || ''}
          buyerName={selectedOrderForMessage.shippingFullName || selectedOrderForMessage.buyer?.buyerRegistrationAddress?.fullName || selectedOrderForMessage.buyerName || ''}
          itemId={selectedOrderForMessage.itemNumber || selectedOrderForMessage.lineItems?.[0]?.legacyItemId || selectedOrderForMessage.lineItems?.[0]?.itemId || selectedOrderForMessage.itemId || ''}
          itemTitle={selectedOrderForMessage.productName || selectedOrderForMessage.lineItems?.[0]?.title || selectedOrderForMessage.itemTitle || ''}
          sellerId={
            selectedOrderForMessage.seller?._id
              ? String(selectedOrderForMessage.seller._id)
              : (selectedOrderForMessage.sellerId
                ? String(selectedOrderForMessage.sellerId)
                : (typeof selectedOrderForMessage.seller === 'string'
                  ? selectedOrderForMessage.seller
                  : null))
          }
          sellerName={resolveOrderSellerName(selectedOrderForMessage)}
          conversationId={selectedOrderForMessage.conversationId || null}
          title="Chat"
          showManageCase={false}
        />
      )}

      <OrderDetailsModal
        open={Boolean(selectedOrderDetailsId)}
        onClose={() => {
          setSelectedOrderDetailsId(null);
          setSelectedOrderDetailsCanEditFulfillment(false);
        }}
        orderId={selectedOrderDetailsId}
        fulfillmentFieldsEditable={selectedOrderDetailsCanEditFulfillment}
        onOrderUpdated={handleOrderUpdatedInModal}
      />

      {/* Activity Logs Dialog */}
      <Dialog
        open={logsModalOpen}
        onClose={handleCloseActivityLogs}
        maxWidth="md"
        fullWidth
        BackdropProps={{ style: { pointerEvents: 'none' } }}
        disableEnforceFocus
        PaperProps={{
          sx: {
            backgroundImage: 'none',
            backgroundColor: '#f5f5f5'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 'bold', fontSize: '1.1rem' }}>
          Activity Log for {selectedOrderForLogs?.orderId || 'Order'}
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: '70vh', overflow: 'auto' }}>
          {/* Add Note Section */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: '#fff', borderRadius: 1, border: '2px solid #8b5cf6' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: '#8b5cf6' }}>
              + Add Note
            </Typography>
            <Stack spacing={1}>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder="Enter your note or remark here..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                disabled={addingNote}
                size="small"
                sx={{
                  backgroundColor: '#fafafa',
                  '& .MuiOutlinedInput-root': {
                    fontSize: '0.9rem',
                  }
                }}
              />
              <Button
                variant="contained"
                onClick={handleAddNote}
                disabled={addingNote || !newNote.trim()}
                sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' } }}
              >
                {addingNote ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                {addingNote ? 'Adding...' : 'Add Note'}
              </Button>
            </Stack>
          </Box>

          {/* Activity Logs Display */}
          {logsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : orderActivityLogs.length === 0 ? (
            <Typography color="textSecondary" sx={{ py: 2 }}>
              No activity logs found for this order.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {orderActivityLogs.map((log, idx) => {
                const isNote = log.action === 'note_added';
                const isAdmin = log.changedBy?.isAdmin;

                return (
                  <Box
                    key={idx}
                    sx={{
                      p: 1.5,
                      backgroundColor: isNote ? '#fef9f3' : '#fff',
                      border: isNote ? '2px solid #f97316' : '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        boxShadow: isNote ? '0 2px 8px rgba(249, 115, 22, 0.2)' : '0 2px 4px rgba(0,0,0,0.1)',
                      }
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Box sx={{ fontWeight: 'bold', color: isNote ? '#d97706' : '#333' }}>
                            {log.action?.replace(/_/g, ' ').toUpperCase()}
                          </Box>
                          {isAdmin && (
                            <Chip
                              label="ADMIN"
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                backgroundColor: '#dc2626',
                                color: '#fff'
                              }}
                            />
                          )}
                          {log.board && (
                            <Chip
                              label={log.board?.replace(/_/g, ' ')}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                backgroundColor: '#e0e7ff',
                                color: '#4c1d95'
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{ color: '#999', fontFamily: 'monospace', fontSize: '0.75rem' }}
                      >
                        {log.timestamp ? format(new Date(log.timestamp), 'MMM d, yyyy p') : 'Unknown'}
                      </Typography>
                    </Box>

                    {/* Note Content (if it's a note) */}
                    {isNote && log.noteContent && (
                      <Box sx={{
                        mb: 1,
                        p: 1.2,
                        backgroundColor: '#fffbeb',
                        borderLeft: '4px solid #f97316',
                        borderRadius: '4px',
                        fontStyle: 'italic',
                        color: '#92400e',
                        wordBreak: 'break-word'
                      }}>
                        <strong>Note: </strong>{log.noteContent}
                      </Box>
                    )}

                    {/* Status Changes */}
                    {log.fromStatus && log.toStatus && (
                      <Box sx={{ mb: 0.5, color: '#555', fontSize: '0.9rem' }}>
                        Status: <strong>{log.fromStatus}</strong> → <strong>{log.toStatus}</strong>
                      </Box>
                    )}

                    {/* Category */}
                    {log.category && (
                      <Box sx={{ mb: 0.5, color: '#666', fontSize: '0.9rem' }}>
                        Category: <strong>{log.category}</strong>
                      </Box>
                    )}

                    {/* Changed By */}
                    {log.changedBy && (
                      <Box sx={{ mb: 0.5, color: '#666', fontSize: '0.9rem' }}>
                        By: <strong>{log.changedBy?.username || log.changedBy?.email || 'System'}</strong>
                      </Box>
                    )}

                    {/* Details */}
                    {log.details && !isNote && (
                      <Box sx={{ color: '#666', fontStyle: 'italic', fontSize: '0.9rem' }}>
                        {log.details}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ pt: 2 }}>
          <Button onClick={handleCloseActivityLogs}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Stats Details Modal */}
      <Dialog 
        open={statsDetailsModal.open} 
        onClose={() => setStatsDetailsModal({ ...statsDetailsModal, open: false })}
        maxWidth="sm"
        fullWidth
        BackdropProps={{ style: { pointerEvents: 'none' } }}
        disableEnforceFocus
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            {statsDetailsModal.statType === COLUMN_STATUS.TODO && 'To Do Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.OUT_OF_STOCK && 'Out of Stock Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.CANCELLATION && 'Cancellation Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.ADDRESS_ISSUE && 'Address Issue Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.LATE_DELIVERY && 'Late Delivery Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.NOT_FULFILLED && 'Not Fulfilled Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.FULFILLED && 'Fulfilled Details'}
            {statsDetailsModal.statType === COLUMN_STATUS.BUYER_CONFIRMATION && 'Buyer Confirmation Details'}
          </Box>
          <IconButton 
            size="small" 
            onClick={() => setStatsDetailsModal({ ...statsDetailsModal, open: false })}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        {statsDetailsModal.items.length > 0 && (
          <Box sx={{ px: 3, pb: 1, pt: 0 }}>
            <Typography variant="caption" color="text.secondary">
              {statsDetailsModal.items.length} {statsDetailsModal.items.length === 1 ? 'order' : 'orders'} in this category
            </Typography>
          </Box>
        )}
        <DialogContent sx={{ maxHeight: '600px', overflow: 'auto', pt: 1 }}>
          {statsDetailsModal.items.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" sx={{ py: 3 }}>
              No items found
            </Typography>
          ) : (
            <Stack spacing={1}>
              {statsDetailsModal.items.map((item, idx) => (
                <Box key={idx} sx={{ pb: 1.5, borderBottom: idx < statsDetailsModal.items.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" fontWeight={700} color="text.primary">
                      {item.orderId}
                    </Typography>
                    {item.itemTitle && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {item.itemTitle}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                      {item.buyerName && (
                        <Typography variant="caption" color="text.secondary">
                          {item.buyerName}
                        </Typography>
                      )}
                      {item.creationDate && (
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(item.creationDate), 'MMM dd, yyyy')}
                        </Typography>
                      )}
                    </Stack>
                    {item.sellerName && (
                      <Typography variant="caption" color="text.secondary">
                        Seller: {item.sellerName}
                      </Typography>
                    )}
                    {item.price && (
                      <Typography variant="caption" fontWeight={600} color="success.main">
                        ${parseFloat(item.price).toFixed(2)}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', px: 3, py: 2 }}>
          <Button 
            onClick={() => setStatsDetailsModal({ ...statsDetailsModal, open: false })}
            variant="text"
            color="primary"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for copy notification */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

export default ComplianceBoardPage;
