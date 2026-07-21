import React, { useCallback, useEffect, useState, useRef, useMemo, memo } from 'react';
import {
  Avatar, TextField, Button, Divider, Badge, Stack, CircularProgress,
  IconButton, Chip, Alert, FormControl, Select, MenuItem, InputLabel, Link,
  Snackbar, ListItemButton, Box, Paper, Typography, List, ListItem, ListItemText, ListItemAvatar,
  useTheme, useMediaQuery, Menu, ListSubheader, Tooltip, Popover
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import EmailIcon from '@mui/icons-material/Email';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MarkAsUnreadIcon from '@mui/icons-material/MarkAsUnread';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MenuIcon from '@mui/icons-material/Menu';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import SettingsIcon from '@mui/icons-material/Settings';
import HistoryIcon from '@mui/icons-material/History';
import api from '../../lib/api';
import { sortSellersByName } from '../../lib/sellersSort';
import TemplateManagementModal from '../../components/TemplateManagementModal';
import OrderDetailsModal from '../../components/OrderDetailsModal';

// Session storage key (v3: do not restore selected thread — empty chat until user picks one)
const CHAT_STORAGE_KEY = 'buyer_chat_page_state_v3';
const EMPTY_SELLER_KEYS = Object.freeze([]);
const THREAD_POLL_MS = 15000;

// Filters are not restored from session (stale searches hide threads)
const SESSION_RESTORE_KEYS = new Set([]);

// The whole app treats Pacific Time as the eBay business day (chat bubbles show
// "... PT"). Render the inbox list date in PT too so it matches the conversation
// instead of rolling forward a day in the viewer's local timezone.
const PT_TZ = 'America/Los_Angeles';
function ptDateKey(d) {
  // "M/D/YYYY" in PT — safe to compare for same-day
  return d.toLocaleDateString('en-US', { timeZone: PT_TZ });
}
/** Inbox list timestamp: time if today (PT), otherwise month/day (PT). */
function formatThreadListTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  if (ptDateKey(d) === ptDateKey(new Date())) {
    return d.toLocaleTimeString('en-US', { timeZone: PT_TZ, hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { timeZone: PT_TZ, month: 'numeric', day: 'numeric' });
}

// Format a timestamp in IST for the meta change history
const formatIST = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) + ' IST';
};
// CHAT_TEMPLATES are now fetched from API - see chatTemplates state in component

// Helper to get initial state from sessionStorage
const getInitialState = (key, defaultValue) => {
  if (!SESSION_RESTORE_KEYS.has(key)) return defaultValue;
  try {
    const stored = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed[key] !== undefined ? parsed[key] : defaultValue;
    }
  } catch (e) {
    console.error('Error reading sessionStorage:', e);
  }
  return defaultValue;
};

/** Collect seller store/login names (for header hints only). */
function collectSellerIdentities(sellers = []) {
  const names = new Set();
  const add = (v) => {
    if (v) names.add(String(v).trim().toLowerCase());
  };
  for (const s of sellers) {
    add(s?.user?.username);
    add(s?.user?.email);
    add(s?.ebayUserId);
    add(s?.ebayUsername);
  }
  return names;
}

/**
 * Inbox title = buyer eBay UserID.
 * Never show this store's login / eBay UserID as the buyer title.
 */
function getThreadBuyerDisplay(thread, extraSellerKeys = []) {
  const buyer = String(thread?.buyerUsername || '').trim();
  const sender = String(thread?.lastSenderUsername || '').trim();
  const recipient = String(thread?.lastRecipientUsername || '').trim();
  const buyerName = String(thread?.buyerName || '').trim();

  const sellerKeys = new Set(
    [
      thread?.sellerEbayUsername,
      thread?.sellerUsername,
      thread?.sellerEmail,
      ...(extraSellerKeys || [])
    ]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const isSeller = (name) => {
    const n = String(name || '').trim().toLowerCase();
    return Boolean(n) && sellerKeys.has(n);
  };

  if (thread?.buyerLooksLikeSeller === true && buyerName && !isSeller(buyerName)) {
    return buyerName;
  }

  // Strongest: sender/recipient vs this store's eBay id / login
  if (sender && recipient) {
    if (isSeller(sender) && !isSeller(recipient)) return recipient;
    if (isSeller(recipient) && !isSeller(sender)) return sender;
    if (buyer && isSeller(buyer)) {
      if (buyer.toLowerCase() === sender.toLowerCase()) return recipient;
      if (buyer.toLowerCase() === recipient.toLowerCase()) return sender;
    }
  }

  if (buyer && !isSeller(buyer)) return buyer;
  if (buyerName && !isSeller(buyerName)) return buyerName;

  // Never surface the store id as the inbox title
  if (buyer && isSeller(buyer)) return buyerName || 'Unknown buyer';

  return buyer || buyerName || recipient || sender || 'Unknown buyer';
}

/** Isolated composer — keeps inbox from re-rendering on every keystroke. */
const ChatComposer = memo(function ChatComposer({
  isMobile,
  isDirectMessage,
  attachments,
  uploading,
  sending,
  newMessage,
  fileInputRef,
  onFileSelect,
  onRemoveAttachment,
  onChangeMessage,
  onSend
}) {
  if (isDirectMessage) {
    return (
      <Alert severity="warning" sx={{ width: '100%' }}>
        <strong>Direct messages cannot be replied to via API.</strong> Respond through eBay&apos;s messaging center.
      </Alert>
    );
  }

  return (
    <>
      {attachments.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {attachments.map((att, idx) => (
            <Chip
              key={`${att.name}-${idx}`}
              label={att.name}
              onDelete={() => onRemoveAttachment(idx)}
              variant="outlined"
              size="small"
              sx={{ maxWidth: { xs: 150, md: 200 } }}
            />
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <input
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={onFileSelect}
        />
        <IconButton
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          sx={{ alignSelf: 'flex-end', mb: 0.5 }}
          size="small"
        >
          {uploading ? <CircularProgress size={20} /> : <AttachFileIcon fontSize="small" />}
        </IconButton>

        <TextField
          fullWidth
          multiline
          maxRows={isMobile ? 3 : 4}
          placeholder="Type a message..."
          value={newMessage}
          onChange={onChangeMessage}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={sending}
          size="small"
        />

        <Button
          variant="contained"
          size="small"
          sx={{ px: { xs: 1.5, md: 2.5 }, alignSelf: 'flex-end', mb: 0.5, minWidth: 0 }}
          endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon fontSize="small" />}
          onClick={onSend}
          disabled={sending || (!newMessage.trim() && attachments.length === 0)}
        >
          {isMobile ? '' : 'Send'}
        </Button>
      </Box>
    </>
  );
});

const ThreadListItem = memo(function ThreadListItem({
  thread, isSelected, imageUrl, isLoadingImage, onSelect, sellerKeys
}) {
  const msgType = thread.actualMessageType || thread.messageType;
  const isOrder = msgType === 'ORDER';
  const isDirect = msgType === 'DIRECT';

  // Prefer the buyer's real name from the matched order; fall back to eBay UserID
  // for inquiries or orders whose Fulfillment data has no full name.
  const buyerName = String(thread?.buyerName || '').trim();
  const displayName = buyerName || getThreadBuyerDisplay(thread, sellerKeys);

  return (
    <ListItem disablePadding dense>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelect(thread)}
        alignItems="flex-start"
        sx={{ py: 0.75, px: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <ListItemAvatar sx={{ minWidth: 44, mt: 0.25 }}>
          <Badge color="error" badgeContent={thread.unreadCount || null} max={99}>
            {isOrder && imageUrl ? (
              <Avatar
                src={imageUrl}
                variant="rounded"
                sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider' }}
              />
            ) : isOrder && isLoadingImage ? (
              <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'action.hover' }}>
                <CircularProgress size={16} />
              </Avatar>
            ) : (
              <Avatar sx={{ width: 40, height: 40, bgcolor: isOrder ? 'primary.main' : isDirect ? 'warning.main' : 'secondary.main' }}>
                {isOrder ? <ShoppingBagIcon sx={{ fontSize: 18 }} /> : isDirect ? <EmailIcon sx={{ fontSize: 18 }} /> : <QuestionAnswerIcon sx={{ fontSize: 18 }} />}
              </Avatar>
            )}
          </Badge>
        </ListItemAvatar>
        <ListItemText
          disableTypography
          primary={
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5}>
              <Typography variant="body2" noWrap sx={{ fontWeight: thread.unreadCount > 0 ? 700 : 600, flex: 1 }}>
                {displayName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {formatThreadListTime(thread.lastDate)}
              </Typography>
            </Stack>
          }
          secondary={
            <Box sx={{ mt: 0.25 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                {thread.marketplaceId && thread.marketplaceId !== 'Unknown' && thread.marketplaceId !== 'System' && (
                  <Chip
                    label={thread.marketplaceId.replace('EBAY_', '')}
                    size="small"
                    sx={{
                      height: 14, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.5 },
                      bgcolor: thread.marketplaceId === 'EBAY_US' ? '#e3f2fd' : '#fff3e0',
                      color: thread.marketplaceId === 'EBAY_US' ? '#1565c0' : '#e65100',
                    }}
                  />
                )}
                <Typography variant="caption" color="text.secondary" noWrap>
                  {thread.orderId ? `#${thread.orderId}` : isDirect ? 'Direct' : 'Inquiry'}
                </Typography>
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: 'block', lineHeight: 1.2 }}
              >
                {thread.itemId === 'DIRECT_MESSAGE'
                  ? 'No item'
                  : (thread.itemTitle || (thread.itemId ? `Item ${thread.itemId}` : ''))}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                sx={{
                  display: 'block',
                  fontWeight: thread.unreadCount > 0 ? 600 : 400,
                  color: 'text.primary',
                  lineHeight: 1.3,
                  mt: 0.25
                }}
              >
                {thread.sender === 'SELLER' ? 'You: ' : ''}{thread.lastMessage}
              </Typography>
            </Box>
          }
        />
      </ListItemButton>
    </ListItem>
  );
});

export default function BuyerChatPage() {
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncingInbox, setSyncingInbox] = useState(false);
  /** Which sync button is active: 'full' | 'todayTomorrow' | null */
  const [syncingMode, setSyncingMode] = useState(null);
  const [searchQuery, setSearchQuery] = useState(() => getInitialState('searchQuery', ''));
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState(() => getInitialState('selectedSeller', ''));
  const [filterType, setFilterType] = useState(() => getInitialState('filterType', 'ALL'));
  const [filterMarketplace, setFilterMarketplace] = useState(() => getInitialState('filterMarketplace', ''));
  const [showUnreadOnly, setShowUnreadOnly] = useState(() => {
    const saved = getInitialState('showUnreadOnly', 'all');
    if (saved === true || saved === 'true' || saved === 'unread') return 'unread';
    if (saved === 'read') return 'read';
    return 'all';
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [threadTotal, setThreadTotal] = useState(0);
  const [loadingThreads, setLoadingThreads] = useState(false);

  const [metaCategory, setMetaCategory] = useState('');
  const [metaCaseStatus, setMetaCaseStatus] = useState('');
  const [metaPickedUpBy, setMetaPickedUpBy] = useState('');
  const [metaChangeLog, setMetaChangeLog] = useState([]);
  const [historyAnchorEl, setHistoryAnchorEl] = useState(null);
  const [savingMeta, setSavingMeta] = useState(false);

  // Chat agents for "Picked Up By" dropdown
  const [chatAgents, setChatAgents] = useState([]);

  // Order details modal
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // Thread thumbnail image
  const [threadThumbnail, setThreadThumbnail] = useState(null);

  // Store fetched product images for threads (itemId -> imageUrl)
  const [threadImages, setThreadImages] = useState({});
  const [fetchingImages, setFetchingImages] = useState(new Set());

  // Snackbar state for sync results
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');


  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const hasFetchedInitialData = useRef(false);
  const didAutoSync = useRef(false);
  const loadRequestIdRef = useRef(0);
  const messageLoadRequestIdRef = useRef(0);
  const fileInputRef = useRef(null);
  const syncingInboxRef = useRef(false);
  const pollActiveThreadRef = useRef(null);
  const handleManualSyncRef = useRef(null);
  const handleThreadSelectRef = useRef(null);
  const threadImagesRef = useRef({});
  const fetchingImagesRef = useRef(new Set());

  const handleCopy = (text) => {
    const val = text || '-';
    if (val === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
      setCopiedText(val);
      setTimeout(() => setCopiedText(''), 1200);
    }
  };

  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [markingUnread, setMarkingUnread] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [resolvingOrder, setResolvingOrder] = useState(false);
  const [copiedText, setCopiedText] = useState('');
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
  const [chatTemplates, setChatTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  // Responsive hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600px - 960px
  const isDesktop = !isMobile && !isTablet;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const prevIsDesktopRef = useRef(null);

  // Sync sidebar state with breakpoints - closed on mobile/tablet, open on desktop
  useEffect(() => {
    // On initial mount or when switching breakpoint categories
    if (prevIsDesktopRef.current === null || prevIsDesktopRef.current !== isDesktop) {
      setSidebarOpen(isDesktop);
      prevIsDesktopRef.current = isDesktop;
    }
  }, [isDesktop]);

  // On tablet, keep sidebar closed when viewing a chat
  useEffect(() => {
    if (isTablet && selectedThread) {
      setSidebarOpen(false);
    }
  }, [isTablet, selectedThread]);

  // Do not persist selected thread — reopening Buyer Messages starts with empty chat pane
  useEffect(() => {
    try {
      sessionStorage.removeItem('buyer_chat_page_state_v2');
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }, []);

  // No conversation selected → never keep stale/cached messages in the pane
  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      setThreadThumbnail(null);
    }
  }, [selectedThread]);

  const threadEquals = (a, b) => {
    if (!a || !b) return false;
    if (a.conversationId && b.conversationId) {
      return String(a.conversationId) === String(b.conversationId);
    }
    // An order id can be shared by multiple buyers — always disambiguate by buyer + item
    return (
      String(a.orderId || '') === String(b.orderId || '') &&
      a.buyerUsername === b.buyerUsername &&
      a.itemId === b.itemId &&
      String(a.sellerId || '') === String(b.sellerId || '')
    );
  };

  // If the open chat is not in the current inbox list (filters / seller change), close it
  useEffect(() => {
    if (!selectedThread || loadingThreads) return;
    const visible = threads.some((t) => threadEquals(t, selectedThread));
    if (!visible) {
      setSelectedThread(null);
      setMessages([]);
    }
  }, [threads, loadingThreads, selectedThread]);





  useEffect(() => {
    if (selectedThread && !selectedThread.isNew) {
      fetchMeta(selectedThread);
    } else {
      setMetaCategory('');
      setMetaCaseStatus('');
      setMetaPickedUpBy('');
      setMetaChangeLog([]);
      setHistoryAnchorEl(null);
    }
  }, [selectedThread]);

  // Fetch thumbnail image when thread changes
  useEffect(() => {
    setThreadThumbnail(null);
    if (
      selectedThread &&
      selectedThread.itemId &&
      selectedThread.itemId !== 'DIRECT_MESSAGE' &&
      selectedThread.sellerId
    ) {
      api
        .get(`/ebay/item-images/${selectedThread.itemId}`, {
          params: { sellerId: selectedThread.sellerId, thumbnail: true }
        })
        .then((res) => {
          const url = res.data?.thumbnail || res.data?.images?.[0] || null;
          setThreadThumbnail(url);
        })
        .catch(() => setThreadThumbnail(null));
    }
  }, [selectedThread]);

  async function fetchMeta(thread) {
    try {
      const params = {
        sellerId: thread.sellerId,
        buyerUsername: thread.buyerUsername,
        itemId: thread.itemId,
        orderId: thread.orderId || ''
      };

      const { data } = await api.get('/ebay/conversation-meta/single', { params });
      // If data exists, fill state. If not, reset to empty/default.
      if (data && data._id) {
        setMetaCategory(data.category);
        setMetaCaseStatus(data.status || data.caseStatus || '');
        setMetaPickedUpBy(data.pickedUpBy || '');
        setMetaChangeLog(data.changeLog || []);
      } else {
        setMetaCategory('');
        setMetaCaseStatus('');
        setMetaPickedUpBy('');
        setMetaChangeLog([]);
      }
    } catch (e) {
      // Don't log 401 errors - they're handled by the interceptor
      if (e.response?.status !== 401) {
        console.error("Failed to fetch meta tags", e);
      }
      // Reset to empty on error
      setMetaCategory('');
      setMetaCaseStatus('');
      setMetaPickedUpBy('');
      setMetaChangeLog([]);
    }
  }

  async function handleSaveMeta() {
    if (!metaCaseStatus) {
      alert("Please select a 'Status' field.");
      return;
    }

    setSavingMeta(true);
    try {
      const { data } = await api.post('/ebay/conversation-meta', {
        sellerId: selectedThread.sellerId,
        buyerUsername: selectedThread.buyerUsername,
        orderId: selectedThread.orderId,
        itemId: selectedThread.itemId,
        category: metaCategory,
        caseStatus: metaCaseStatus,  // keep backward-compat field
        status: metaCaseStatus,      // synced status field
        pickedUpBy: metaPickedUpBy || null
      });
      if (data?.meta?.changeLog) setMetaChangeLog(data.meta.changeLog);
    } catch (e) {
      alert("Failed to save tags: " + e.message);
    } finally {
      setSavingMeta(false);
    }
  }




  async function fetchAgents() {
    try {
      const { data } = await api.get('/ebay/chat-agents');
      setChatAgents(data || []);
    } catch (e) {
      console.error('Failed to load chat agents', e);
    }
  }

  async function loadChatTemplates() {
    setTemplatesLoading(true);
    try {
      const { data } = await api.get('/chat-templates');
      if (data.templates && data.templates.length > 0) {
        setChatTemplates(data.templates);
      }
    } catch (e) {
      console.error('Failed to load chat templates:', e);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function fetchSellers() {
    try {
      const { data } = await api.get('/sellers/all');
      setSellers(sortSellersByName(data || []));
    } catch (e) {
      // Don't log 401 errors - they're handled by the interceptor
      if (e.response?.status !== 401) {
        console.error('Failed to load sellers', e);
      }
      // Set empty array on error to prevent crashes
      setSellers([]);
    }
  }

  // 1. Initial Load - only run once
  useEffect(() => {
    if (!hasFetchedInitialData.current) {
      hasFetchedInitialData.current = true;
      fetchSellers();
      loadThreads(true).then((count) => {
        if (count === 0 && !didAutoSync.current) {
          didAutoSync.current = true;
          handleManualSync();
        }
      });
      loadChatTemplates();
      fetchAgents();
      // Never auto-load a cached conversation — wait for user to select a thread
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous values to detect actual changes
  const prevSearchQuery = useRef(searchQuery);
  const prevSelectedSeller = useRef(selectedSeller);
  const prevFilterType = useRef(filterType);
  const prevFilterMarketplace = useRef(filterMarketplace);
  const prevShowUnreadOnly = useRef(showUnreadOnly);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip on first render (initial data already loaded above)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Only reload if values actually changed
    if (
      prevSearchQuery.current !== searchQuery ||
      prevSelectedSeller.current !== selectedSeller ||
      prevFilterType.current !== filterType ||
      prevFilterMarketplace.current !== filterMarketplace ||
      prevShowUnreadOnly.current !== showUnreadOnly
    ) {
      prevSearchQuery.current = searchQuery;
      prevSelectedSeller.current = selectedSeller;
      prevFilterType.current = filterType;
      prevFilterMarketplace.current = filterMarketplace;
      prevShowUnreadOnly.current = showUnreadOnly;

      // Close any open chat that may no longer be in the filtered inbox
      setSelectedThread(null);
      setMessages([]);

      const delayDebounceFn = setTimeout(() => {
        setPage(1);
        loadThreads(true);
      }, 500);

      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchQuery, selectedSeller, filterType, filterMarketplace, showUnreadOnly]);

  // 2. Scroll Effect — only when the thread changes or a genuinely new
  // message arrives (not on every background refresh that returns the same list).
  const lastScrollSigRef = useRef('');
  useEffect(() => {
    const last = messages[messages.length - 1];
    const sig = `${selectedThread?.conversationId || selectedThread?.orderId || selectedThread?.buyerUsername || ''}:${messages.length}:${last?._id || last?.messageId || ''}`;
    if (sig === lastScrollSigRef.current) return;
    const threadChanged =
      !lastScrollSigRef.current ||
      lastScrollSigRef.current.split(':')[0] !== sig.split(':')[0];
    lastScrollSigRef.current = sig;
    scrollToBottom(threadChanged ? 'auto' : 'smooth');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedThread]);

  // 3. ACTIVE POLLING — pause when the tab is hidden
  useEffect(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    if (!selectedThread || selectedThread.isNew) {
      return undefined;
    }

    const tick = () => {
      if (document.visibilityState === 'visible') {
        pollActiveThreadRef.current?.();
      }
    };
    pollingIntervalRef.current = setInterval(tick, THREAD_POLL_MS);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread]);

  // 4. FETCH MISSING PRODUCT IMAGES — all loaded order threads missing a URL
  useEffect(() => {
    const fetchMissingImages = async () => {
      const threadsNeedingImages = threads.filter((thread) => {
        const msgType = thread.actualMessageType || thread.messageType;
        return (
          msgType === 'ORDER' &&
          !thread.productImageUrl &&
          thread.itemId &&
          thread.itemId !== 'DIRECT_MESSAGE' &&
          thread.sellerId &&
          // undefined = not tried; '' = tried and failed; url = success
          threadImagesRef.current[thread.itemId] === undefined &&
          !fetchingImagesRef.current.has(thread.itemId)
        );
      });

      if (threadsNeedingImages.length === 0) return;

      setFetchingImages((prev) => {
        const next = new Set(prev);
        threadsNeedingImages.forEach((t) => next.add(t.itemId));
        fetchingImagesRef.current = next;
        return next;
      });

      const batchSize = 4;
      for (let i = 0; i < threadsNeedingImages.length; i += batchSize) {
        const batch = threadsNeedingImages.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (thread) => {
            try {
              const res = await api.get(`/ebay/item-images/${thread.itemId}`, {
                params: { sellerId: thread.sellerId, thumbnail: true }
              });
              const url = res.data?.thumbnail || res.data?.images?.[0] || null;
              setThreadImages((prev) => {
                // Store '' on miss so we don't re-hammer eBay for the same item
                const next = { ...prev, [thread.itemId]: url || '' };
                threadImagesRef.current = next;
                return next;
              });
            } catch (err) {
              console.debug(`Failed to fetch image for ${thread.itemId}`, err.message);
              setThreadImages((prev) => {
                const next = { ...prev, [thread.itemId]: '' };
                threadImagesRef.current = next;
                return next;
              });
            } finally {
              setFetchingImages((prev) => {
                const updated = new Set(prev);
                updated.delete(thread.itemId);
                fetchingImagesRef.current = updated;
                return updated;
              });
            }
          })
        );
      }
    };

    fetchMissingImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // API CALLS
  async function runInboxSync({ mode = 'full', timeout = 180000 } = {}) {
    if (syncingInboxRef.current) return;
    syncingInboxRef.current = true;
    setSyncingInbox(true);
    setSyncingMode(mode === 'todayTomorrow' ? 'todayTomorrow' : 'full');
    try {
      const body = { mode };
      // Scope eBay fetch to the selected seller when one is chosen
      if (selectedSeller) body.sellerId = selectedSeller;
      const res = await api.post('/ebay/sync-inbox', body, { timeout });
      setPage(1);
      // Reload with current Type / Marketplace / Search / Unread filters
      await loadThreads(true);

      if (res.data.success) {
        const { syncResults, totalNewMessages, dateRange, skipped, error: syncError } = res.data;
        const commerceCount = (syncResults || []).reduce(
          (sum, r) => sum + (r.conversationsUpserted || r.commerceConversations || 0),
          0
        );
        const commerceErrors = (syncResults || []).filter((r) => r.commerceError || r.error).map((r) => `${r.sellerName}: ${r.commerceError || r.error}`);
        const rangeLabel = dateRange?.from && dateRange?.to
          ? ` (${dateRange.from} → ${dateRange.to} PT)`
          : '';

        if (skipped) {
          setSnackbarMsg(syncError || 'Sync was skipped because another sync is already running. Try again in a moment.');
          setSnackbarSeverity('warning');
        } else if (totalNewMessages > 0 && syncResults) {
          const sellerSummary = syncResults
            .filter(r => r.newMessages > 0)
            .map(r => `${r.sellerName}: ${r.newMessages} new`)
            .join('\n');

          setSnackbarMsg(`Found ${totalNewMessages} new message${totalNewMessages > 1 ? 's' : ''}${rangeLabel}!\n\n${sellerSummary}`);
          setSnackbarSeverity('success');
        } else if (commerceCount > 0) {
          setSnackbarMsg(`Synced ${commerceCount} conversation${commerceCount === 1 ? '' : 's'} from eBay${rangeLabel}.`);
          setSnackbarSeverity('success');
        } else if (commerceErrors.length > 0) {
          setSnackbarMsg(`Commerce API sync issue:\n${commerceErrors.join('\n')}`);
          setSnackbarSeverity('warning');
        } else if (syncError) {
          setSnackbarMsg(syncError);
          setSnackbarSeverity('warning');
        } else {
          setSnackbarMsg(`No new messages found${rangeLabel}.`);
          setSnackbarSeverity('info');
        }
        setSnackbarOpen(true);
      }
    } catch (e) {
      if (e.response?.status !== 401) {
        console.error('Inbox Sync failed', e);
        setSnackbarMsg('Sync failed: ' + (e.response?.data?.error || e.message));
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
      await loadThreads(true);
    } finally {
      syncingInboxRef.current = false;
      setSyncingInbox(false);
      setSyncingMode(null);
    }
  }

  async function handleManualSync() {
    await runInboxSync({ mode: 'full', timeout: 180000 });
  }

  async function handleTodayTomorrowSync() {
    await runInboxSync({ mode: 'todayTomorrow', timeout: 120000 });
  }

  async function pollActiveThread() {
    // SAFETY CHECK: Don't poll if we don't have the required IDs
    if (!selectedThread || !selectedThread.sellerId || !selectedThread.buyerUsername) {
      return;
    }

    try {
      await api.post('/ebay/sync-thread', {
        sellerId: selectedThread.sellerId,
        buyerUsername: selectedThread.buyerUsername,
        itemId: selectedThread.itemId,
        orderId: selectedThread.orderId || undefined,
        conversationId: selectedThread.conversationId || undefined,
        commerceOnly: true
      });

      await loadMessages(selectedThread, false);
    } catch (e) {
      // Don't log 401 errors - they're handled by the interceptor
      // Use silent error logging to avoid spamming console if it's just a timeout or 400
      if (e.response && e.response.status !== 400 && e.response.status !== 401) {
        console.error("Thread Poll failed", e);
      }
    }
  }

  async function loadThreads(reset = false) {
    const requestId = ++loadRequestIdRef.current;
    setLoadingThreads(true);
    // Keep previous threads visible while refreshing to avoid inbox flash.

    try {
      const currentPage = reset ? 1 : page;
      // Grow model: always bound inbox to last 45 days
      const params = {
        page: currentPage,
        limit: 50,
        search: searchQuery,
        filterType: filterType,
        filterMarketplace: filterMarketplace,
        showUnreadOnly: showUnreadOnly === 'unread',
        showReadOnly: showUnreadOnly === 'read',
        readFilter: showUnreadOnly,
        maxAgeDays: 45,
        // Same fast path as Buyer Messages (Test)
        variant: 'v2'
      };

      if (selectedSeller) params.sellerId = selectedSeller;

      const res = await api.get('/ebay/chat/threads', { params });
      if (requestId !== loadRequestIdRef.current) return 0;

      const newThreads = res.data.threads || [];
      const total = res.data.total ?? 0;

      if (reset) {
        setThreads(newThreads);
        setThreadTotal(total);
        setHasMore(newThreads.length < total);
      } else {
        setThreads(prev => {
          const byKey = new Map();
          const keyOf = (t) =>
            t.conversationId
              ? `c:${t.conversationId}`
              : `t:${t.sellerId}|${t.orderId || ''}|${t.buyerUsername || ''}|${t.itemId || ''}`;
          [...prev, ...newThreads].forEach((t) => byKey.set(keyOf(t), t));
          const combined = [...byKey.values()].sort((a, b) => {
            const ta = a.lastDate ? new Date(a.lastDate).getTime() : 0;
            const tb = b.lastDate ? new Date(b.lastDate).getTime() : 0;
            return tb - ta;
          });
          setHasMore(combined.length < total);
          return combined;
        });
        setThreadTotal(total);
      }

      setPage(currentPage + 1);
      return newThreads.length;
    } catch (e) {
      if (requestId !== loadRequestIdRef.current) return 0;
      if (e.response?.status !== 401) {
        console.error('Failed to load threads', e);
      }
      if (reset) {
        setThreads([]);
        setThreadTotal(0);
      }
      return 0;
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoadingThreads(false);
      }
    }
  }

  async function handleThreadSelect(thread) {
    // Bump request id so any in-flight load for the previous thread is ignored
    const requestId = ++messageLoadRequestIdRef.current;

    setSelectedThread(thread);
    setNewMessage('');
    setAttachments([]);
    // Clear previous conversation immediately so it doesn't linger while loading
    setMessages([]);
    setLoadingMessages(!thread.isNew);

    // Close sidebar on mobile and tablet when thread is selected
    if (isMobile || isTablet) {
      setSidebarOpen(false);
    }

    // Do not auto-clear unread — agents must click Mark Read explicitly

    // DB-first: show cached messages immediately, then soft-refresh from Commerce in background.
    if (!thread.isNew) {
      await loadMessages(thread, true, requestId);
      if (requestId !== messageLoadRequestIdRef.current) return;

      // Background refresh — never block the chat pane on Trading API crawls
      (async () => {
        try {
          await api.post(
            '/ebay/sync-thread',
            {
              sellerId: thread.sellerId,
              buyerUsername: thread.buyerUsername,
              itemId: thread.itemId,
              orderId: thread.orderId || undefined,
              conversationId: thread.conversationId || undefined,
              commerceOnly: true
            },
            { timeout: 45000 }
          );
          if (requestId !== messageLoadRequestIdRef.current) return;
          await loadMessages(thread, false, requestId);
        } catch (e) {
          if (e.response?.status !== 401 && e.response?.status !== 400) {
            console.error('Thread sync failed', e);
          }
        }
      })();
    } else {
      if (requestId !== messageLoadRequestIdRef.current) return;
      setMessages([]);
      setLoadingMessages(false);
    }
  }

  // Keep latest handlers in refs so intervals / memo children stay stable
  handleManualSyncRef.current = handleManualSync;
  pollActiveThreadRef.current = pollActiveThread;
  handleThreadSelectRef.current = handleThreadSelect;

  const onSelectThread = useCallback((thread) => {
    handleThreadSelectRef.current?.(thread);
  }, []);

  const onChangeMessage = useCallback((e) => {
    setNewMessage(e.target.value);
  }, []);

  async function loadMessages(thread, showLoading = true, requestId = null) {
    const activeRequestId = requestId ?? ++messageLoadRequestIdRef.current;
    if (showLoading) setLoadingMessages(true);
    try {
      const params = {};
      // Prefer Commerce conversation id when present (Message Conversations cache)
      if (thread.conversationId) params.conversationId = thread.conversationId;
      if (thread.sellerId) params.sellerId = thread.sellerId;
      // Grow scoping: order threads load by orderId only; inquiries by buyer+item(+seller)
      if (thread.orderId) {
        params.orderId = thread.orderId;
      } else {
        if (thread.buyerUsername) params.buyerUsername = thread.buyerUsername;
        if (thread.itemId) params.itemId = thread.itemId;
      }

      const res = await api.get('/ebay/chat/messages', { params });
      if (activeRequestId !== messageLoadRequestIdRef.current) return;
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      if (activeRequestId !== messageLoadRequestIdRef.current) return;
      // Don't log 401 errors - they're handled by the interceptor
      if (e.response?.status !== 401) {
        console.error('Failed to load messages', e);
      }
      // Set empty array on error to prevent crashes
      setMessages([]);
    } finally {
      if (activeRequestId === messageLoadRequestIdRef.current && showLoading) {
        setLoadingMessages(false);
      }
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const res = await api.post('/ebay/send-message', {
        orderId: selectedThread.orderId,
        itemId: selectedThread.itemId,
        buyerUsername: selectedThread.buyerUsername,
        sellerId: selectedThread.sellerId,
        conversationId: selectedThread.conversationId,
        body: newMessage,
        mediaUrls: attachments.map(a => a.url)
      });

      setMessages([...messages, res.data.message]);
      setNewMessage('');
      setAttachments([]);

      if (selectedThread.isNew) {
        loadThreads();
        const newThread = { ...selectedThread, isNew: false, conversationId: res.data.message?.conversationId || selectedThread.conversationId };
        setSelectedThread(newThread);
      } else if (res.data.message?.conversationId && !selectedThread.conversationId) {
        setSelectedThread({ ...selectedThread, conversationId: res.data.message.conversationId });
      }
    } catch (e) {
      alert('Failed to send: ' + (e.response?.data?.error || e.message));
    } finally {
      setSending(false);
    }
  }

  const getSellerName = (id) => {
    const seller = sellers.find(s => String(s._id) === String(id));
    return seller?.user?.username || seller?.username || 'Unknown Seller';
  };

  // All known store names — used so inquiry titles never show the seller as "buyer"
  const sellerIdentities = useMemo(
    () => collectSellerIdentities(sellers),
    [sellers]
  );

  // Per-store identity keys for inbox titles (ebay UserID + app username)
  const sellerKeysById = useMemo(() => {
    const map = new Map();
    for (const s of sellers) {
      map.set(
        String(s._id),
        [s?.user?.username, s?.user?.email, s?.ebayUserId, s?.ebayUsername]
          .map((v) => String(v || '').trim().toLowerCase())
          .filter(Boolean)
      );
    }
    return map;
  }, [sellers]);

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const newAttachments = res.data.urls.map((url, index) => ({
        url,
        name: files[index].name
      }));

      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveAttachment(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;
  const handleFileSelectRef = useRef(handleFileSelect);
  handleFileSelectRef.current = handleFileSelect;

  const onSendMessage = useCallback(() => {
    handleSendMessageRef.current?.();
  }, []);
  const onFileSelect = useCallback((e) => {
    handleFileSelectRef.current?.(e);
  }, []);
  const onRemoveAttachment = useCallback((idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Template menu handlers
  const handleTemplateClick = (event) => {
    setTemplateAnchorEl(event.currentTarget);
  };

  const handleTemplateClose = () => {
    setTemplateAnchorEl(null);
  };

  const handleSelectTemplate = (templateText) => {
    // Get buyer name from selectedThread
    const buyerName = selectedThread?.buyerName || selectedThread?.buyerUsername || 'Buyer';
    const firstName = buyerName.split(' ')[0];

    // Replace "Hi," with "Hi Name,"
    let personalizedText = templateText;
    if (personalizedText.startsWith('Hi,')) {
      personalizedText = personalizedText.replace('Hi,', `Hi ${firstName},`);
    } else {
      personalizedText = `Hi ${firstName},\n\n${personalizedText}`;
    }

    setNewMessage(personalizedText);
    handleTemplateClose();
  };

  async function handleResolveOrder() {
    if (!selectedThread || !selectedThread.buyerUsername) return;
    if (!selectedThread.itemId || selectedThread.itemId === 'DIRECT_MESSAGE') return;

    setResolvingOrder(true);
    try {
      const { data } = await api.post('/ebay/chat/resolve-order', {
        sellerId: selectedThread.sellerId,
        conversationId: selectedThread.conversationId || '',
        buyerUsername: selectedThread.buyerUsername,
        itemId: selectedThread.itemId,
        date: selectedThread.lastDate || ''
      });

      if (data?.orderId) {
        setSelectedThread((prev) => (prev ? { ...prev, orderId: data.orderId } : prev));
        setThreads((prev) =>
          prev.map((t) =>
            threadEquals(t, selectedThread) ? { ...t, orderId: data.orderId } : t
          )
        );
        setSnackbarMsg(
          data.source === 'ebay'
            ? `Order ${data.orderId} matched from eBay`
            : `Order ${data.orderId} matched`
        );
        setSnackbarSeverity('success');
      } else {
        setSnackbarMsg('No matching order found for this buyer + item');
        setSnackbarSeverity('info');
      }
      setSnackbarOpen(true);
    } catch (err) {
      setSnackbarMsg('Failed to find order: ' + (err.response?.data?.error || err.message));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setResolvingOrder(false);
    }
  }

  async function handleMarkAsUnread() {
    if (!selectedThread) return;

    setMarkingUnread(true);
    try {
      const payload = {
        orderId: selectedThread.orderId,
        buyerUsername: selectedThread.buyerUsername,
        itemId: selectedThread.itemId
      };

      await api.post('/ebay/chat/mark-unread', payload);

      // Update local thread state to show unread badge
      setThreads(prevThreads =>
        prevThreads.map(t => {
          const isMatch = t.orderId
            ? t.orderId === selectedThread.orderId
            : (t.buyerUsername === selectedThread.buyerUsername && t.itemId === selectedThread.itemId);

          if (isMatch) {
            // Count buyer messages to set unread count
            const buyerMessageCount = messages.filter(m => m.sender === 'BUYER').length;
            return { ...t, unreadCount: buyerMessageCount };
          }
          return t;
        })
      );

      // Show success notification
      setSnackbarMsg('Conversation marked as unread');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // Close conversation
      setSelectedThread(null);
      setMessages([]);

    } catch (err) {
      setSnackbarMsg('Failed to mark as unread: ' + (err.response?.data?.error || err.message));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setMarkingUnread(false);
    }
  }

  async function handleMarkAsRead() {
    if (!selectedThread) return;

    setMarkingRead(true);
    try {
      const payload = {
        orderId: selectedThread.orderId,
        buyerUsername: selectedThread.buyerUsername,
        itemId: selectedThread.itemId
      };

      await api.post('/ebay/chat/mark-read', payload);

      setThreads(prevThreads =>
        prevThreads.map(t => {
          const isMatch = t.orderId
            ? t.orderId === selectedThread.orderId
            : (t.buyerUsername === selectedThread.buyerUsername && t.itemId === selectedThread.itemId);
          return isMatch ? { ...t, unreadCount: 0 } : t;
        })
      );
      setSelectedThread(prev => prev ? { ...prev, unreadCount: 0 } : prev);
      setMessages(prev => prev.map(m => m.sender === 'BUYER' ? { ...m, read: true } : m));

      setSnackbarMsg('Conversation marked as read');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      setSnackbarMsg('Failed to mark as read: ' + (err.response?.data?.error || err.message));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setMarkingRead(false);
    }
  }

  const narrowingFiltersActive = useMemo(() => (
    Boolean(searchQuery.trim()) ||
    Boolean(selectedSeller) ||
    filterType !== 'ALL' ||
    Boolean(filterMarketplace) ||
    showUnreadOnly === 'unread' ||
    showUnreadOnly === 'read'
  ), [searchQuery, selectedSeller, filterType, filterMarketplace, showUnreadOnly]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedSeller('');
    setFilterType('ALL');
    setFilterMarketplace('');
    setShowUnreadOnly('all');
    setPage(1);
  };

  const inboxStats = useMemo(() => ({
    unreadThreads: threads.filter(t => t.unreadCount > 0).length,
    loaded: threads.length
  }), [threads]);

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: { xs: '100dvh', md: 'calc(100vh - 72px)' },
      gap: 1,
      position: 'relative',
      minHeight: 0
    }}>
      {/* Filters */}
      <Box sx={{ px: { xs: 1, md: 0 }, flexShrink: 0 }}>
        {narrowingFiltersActive && !loadingThreads && (
          <Alert
            severity="info"
            sx={{ mb: 1, py: 0, alignItems: 'center' }}
            action={
              <Button color="inherit" size="small" startIcon={<FilterAltOffIcon />} onClick={clearAllFilters}>
                Clear filters
              </Button>
            }
          >
            Showing {threadTotal.toLocaleString()} filtered conversation{threadTotal === 1 ? '' : 's'}
          </Alert>
        )}

        <Paper sx={{ p: 1, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ lg: 'center' }} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 140 }, flex: { lg: 1 } }}>
              <InputLabel shrink>Seller</InputLabel>
              <Select
                value={selectedSeller}
                label="Seller"
                displayEmpty
                notched
                onChange={(e) => setSelectedSeller(e.target.value)}
                renderValue={(value) => {
                  if (!value) return 'All Sellers';
                  const s = sellers.find((x) => String(x._id) === String(value));
                  return s?.user?.username || s?.user?.email || 'Seller';
                }}
              >
                <MenuItem value="">
                  <em>All Sellers</em>
                </MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>{s.user?.username || s.user?.email}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 130 } }}>
              <InputLabel>Type</InputLabel>
              <Select value={filterType} label="Type" onChange={(e) => setFilterType(e.target.value)}>
                <MenuItem value="ALL">All Messages</MenuItem>
                <MenuItem value="ORDER">Order Related</MenuItem>
                <MenuItem value="INQUIRY">Inquiries Only</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 140 } }}>
              <InputLabel shrink>Marketplace</InputLabel>
              <Select
                value={filterMarketplace}
                label="Marketplace"
                displayEmpty
                notched
                onChange={(e) => setFilterMarketplace(e.target.value)}
                renderValue={(value) => {
                  if (!value) return 'All';
                  const labels = { EBAY_US: 'US', EBAY_CA: 'CA', EBAY_AU: 'AU', EBAY_GB: 'GB' };
                  return labels[value] || value;
                }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="EBAY_US">US</MenuItem>
                <MenuItem value="EBAY_CA">CA</MenuItem>
                <MenuItem value="EBAY_AU">AU</MenuItem>
                <MenuItem value="EBAY_GB">GB</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 130 } }}>
              <InputLabel>Show</InputLabel>
              <Select value={showUnreadOnly} label="Show" onChange={(e) => setShowUnreadOnly(e.target.value)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="unread">Unread Only</MenuItem>
                <MenuItem value="read">Read Only</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Search buyer, order, item, seller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: { xs: '100%', lg: 200 }, flex: { lg: 2 } }}
            />
            <Button
              size="small"
              startIcon={syncingMode === 'todayTomorrow' ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={handleTodayTomorrowSync}
              disabled={syncingInbox}
              variant="contained"
              title={
                selectedSeller
                  ? 'Fetch today & tomorrow (PT) for the selected seller, then show results with your current filters'
                  : 'Fetch today & tomorrow (PT) for all sellers, then show results with your current filters'
              }
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {syncingMode === 'todayTomorrow' ? 'Syncing...' : 'Sync Today+'}
            </Button>
            <Button
              size="small"
              startIcon={syncingMode === 'full' ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={handleManualSync}
              disabled={syncingInbox}
              variant="outlined"
              title={
                selectedSeller
                  ? 'Full inbox sync (longer lookback) for the selected seller, then show results with your current filters'
                  : 'Full inbox sync (longer lookback) for all sellers, then show results with your current filters'
              }
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {syncingMode === 'full' ? 'Syncing...' : 'Check New'}
            </Button>
          </Stack>
        </Paper>
      </Box>

      <Paper
        elevation={2}
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 2,
          position: 'relative'
        }}
      >
      {/* Mobile & Tablet: Backdrop overlay when sidebar is open */}
      {(isMobile || isTablet) && sidebarOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1500,
            display: { xs: 'block', sm: 'block', md: 'none' }
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Box sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 300px) 1fr' },
        overflow: 'hidden'
      }}>
      {/* LEFT: INBOX */}
      <Box sx={{
        display: { xs: sidebarOpen ? 'flex' : 'none', sm: sidebarOpen ? 'flex' : 'none', md: 'flex' },
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        borderRight: { md: 1 },
        borderColor: 'divider',
        bgcolor: '#fafafa',
        position: { xs: 'fixed', sm: 'fixed', md: 'relative' },
        top: { xs: 0, sm: 0 },
        left: { xs: 0, sm: 0 },
        width: { xs: '100%', sm: '100%', md: 'auto' },
        height: { xs: '100%', sm: '100%', md: 'auto' },
        zIndex: { xs: 1600, sm: 1600, md: 1 }
      }}>
        <Box sx={{
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: '#fff'
        }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>Inbox</Typography>
            {inboxStats.unreadThreads > 0 && (
              <Chip label={inboxStats.unreadThreads} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
            )}
            <Typography variant="caption" color="text.secondary">
              {threadTotal > 0 ? `${inboxStats.loaded}/${threadTotal}` : ''}
            </Typography>
          </Stack>
          {(isMobile || isTablet) && (
            <IconButton onClick={() => setSidebarOpen(false)} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
          {loadingThreads && <CircularProgress size={14} />}
        </Box>

        <List dense sx={{ overflow: 'auto', flex: 1, py: 0 }}>
          {threads.map((thread, index) => {
            const isSelected = selectedThread && (
              selectedThread.conversationId && thread.conversationId
                ? String(selectedThread.conversationId) === String(thread.conversationId)
                : (
                  // An order id can be shared by multiple buyers — always disambiguate
                  String(selectedThread.orderId || '') === String(thread.orderId || '') &&
                  selectedThread.buyerUsername === thread.buyerUsername &&
                  selectedThread.itemId === thread.itemId &&
                  String(selectedThread.sellerId || '') === String(thread.sellerId || '')
                )
            );
            const imageUrl = thread.productImageUrl || threadImages[thread.itemId] || null;

            return (
              <ThreadListItem
                key={thread.conversationId || `${thread.sellerId || 's'}-${thread.orderId || 'inq'}-${thread.buyerUsername || 'b'}-${thread.itemId || index}`}
                thread={thread}
                isSelected={isSelected}
                imageUrl={imageUrl}
                isLoadingImage={fetchingImages.has(thread.itemId)}
                onSelect={onSelectThread}
                sellerKeys={sellerKeysById.get(String(thread.sellerId)) || EMPTY_SELLER_KEYS}
              />
            );
          })}

          {/* LOAD MORE BUTTON */}
          {hasMore && threads.length > 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Button
                size="small"
                onClick={() => loadThreads(false)}
                disabled={loadingThreads}
              >
                {loadingThreads ? <CircularProgress size={20} /> : 'Load More'}
              </Button>
            </Box>
          )}

          {/* EMPTY STATE */}
          {threads.length === 0 && !loadingThreads && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <QuestionAnswerIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {syncingInbox
                  ? 'Syncing conversations from eBay…'
                  : threadTotal > 0
                    ? 'Conversations failed to load. Try Check New or pick a seller.'
                    : 'No conversations yet.'}
              </Typography>
              {!syncingInbox && (
                <Button size="small" sx={{ mt: 1.5 }} startIcon={<RefreshIcon />} onClick={handleManualSync}>
                  Check New
                </Button>
              )}
            </Box>
          )}
        </List>
      </Box>

      {/* RIGHT: CHAT AREA */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        bgcolor: '#fff'
      }}>
        {/* ... existing chat area code ... */}
        {
          selectedThread ? (
            <>
              <Box sx={{
                px: { xs: 1.5, md: 2 },
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: '#fff',
                flexShrink: 0
              }}>
                {(isMobile || isTablet) && (
                  <IconButton
                    onClick={() => { setSelectedThread(null); setMessages([]); setSidebarOpen(true); }}
                    size="small"
                    sx={{ mb: 0.5 }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}

                {/* Row 1: Meta + actions */}
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ mb: 1, gap: 0.75 }}
                >
                  <FormControl size="small" sx={{ minWidth: 110, '& .MuiInputBase-root': { height: 32 } }}>
                    <InputLabel shrink sx={{ fontSize: '0.75rem' }}>About</InputLabel>
                    <Select
                      value={metaCategory}
                      label="About"
                      displayEmpty
                      notched
                      onChange={(e) => setMetaCategory(e.target.value)}
                      sx={{ fontSize: '0.75rem' }}
                      renderValue={(selected) => selected || <em style={{ color: '#999' }}>Not a Case</em>}
                    >
                      <MenuItem value=""><em>Not a Case</em></MenuItem>
                      <MenuItem value="INR">INR</MenuItem>
                      <MenuItem value="Cancellation">Cancellation</MenuItem>
                      <MenuItem value="Return">Return</MenuItem>
                      <MenuItem value="Refund">Refund</MenuItem>
                      <MenuItem value="Replace">Replace</MenuItem>
                      <MenuItem value="Out of Stock">Out of Stock</MenuItem>
                      <MenuItem value="Issue with Product">Issue with Product</MenuItem>
                      <MenuItem value="Inquiry">Inquiry</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 110, '& .MuiInputBase-root': { height: 32 } }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>Status</InputLabel>
                    <Select value={metaCaseStatus} label="Status" onChange={(e) => setMetaCaseStatus(e.target.value)} sx={{ fontSize: '0.75rem' }}>
                      <MenuItem value="Case Not Opened">Case Not Opened</MenuItem>
                      <MenuItem value="Open">Open</MenuItem>
                      <MenuItem value="In Progress">In Progress</MenuItem>
                      <MenuItem value="Resolved">Resolved</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 120, '& .MuiInputBase-root': { height: 32 } }}>
                    <InputLabel shrink sx={{ fontSize: '0.75rem' }}>Picked Up By</InputLabel>
                    <Select
                      value={metaPickedUpBy}
                      label="Picked Up By"
                      onChange={(e) => setMetaPickedUpBy(e.target.value)}
                      sx={{ fontSize: '0.75rem' }}
                      displayEmpty
                      renderValue={(selected) => selected || 'Unassigned'}
                    >
                      <MenuItem value=""><em>Unassigned</em></MenuItem>
                      {chatAgents.map(agent => (
                        <MenuItem key={agent._id} value={agent.name}>{agent.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Button variant="contained" size="small" onClick={handleSaveMeta} disabled={savingMeta} sx={{ minWidth: 36, height: 32, px: 1 }}>
                    {savingMeta ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: 18 }} />}
                  </Button>

                  {metaChangeLog.length > 0 && (
                    <>
                      <Tooltip title="View change history">
                        <IconButton
                          size="small"
                          onClick={(e) => setHistoryAnchorEl(e.currentTarget)}
                          sx={{ height: 32, width: 32 }}
                        >
                          <HistoryIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontSize: '0.68rem', lineHeight: 1.2, maxWidth: 180 }}
                      >
                        Last changed by <b>{metaChangeLog[metaChangeLog.length - 1].changedBy}</b>
                        <br />
                        {formatIST(metaChangeLog[metaChangeLog.length - 1].changedAt)}
                      </Typography>
                      <Popover
                        open={Boolean(historyAnchorEl)}
                        anchorEl={historyAnchorEl}
                        onClose={() => setHistoryAnchorEl(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                      >
                        <Box sx={{ p: 1.5, maxWidth: 380, maxHeight: 320, overflowY: 'auto' }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.78rem' }}>
                            Change History (IST)
                          </Typography>
                          <Stack spacing={1}>
                            {[...metaChangeLog].reverse().map((entry, idx) => (
                              <Box key={idx} sx={{ borderBottom: idx < metaChangeLog.length - 1 ? '1px solid #eee' : 'none', pb: 0.75 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.74rem' }}>
                                  <b>{entry.changedBy}</b> changed <b>{entry.field}</b>:{' '}
                                  <span style={{ color: '#999' }}>{entry.oldValue || '— empty —'}</span>
                                  {' → '}
                                  <span style={{ fontWeight: 600 }}>{entry.newValue || '— empty —'}</span>
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.66rem' }}>
                                  {formatIST(entry.changedAt)}
                                </Typography>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      </Popover>
                    </>
                  )}

                  <Box sx={{ flex: 1 }} />

                  <Chip
                    label={getSellerName(selectedThread.sellerId)}
                    size="small"
                    icon={<PersonIcon sx={{ fontSize: '16px !important' }} />}
                    sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 600, height: 28 }}
                  />

                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleTemplateClick}
                    disabled={sending}
                    sx={{ height: 28, fontSize: '0.7rem', px: 1 }}
                    endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  >
                    Templates
                  </Button>

                  {!selectedThread.isNew && (
                    <>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleMarkAsRead}
                        disabled={markingRead}
                        startIcon={markingRead ? <CircularProgress size={12} /> : <MarkEmailReadIcon sx={{ fontSize: 16 }} />}
                        sx={{ height: 28, fontSize: '0.7rem', px: 1 }}
                      >
                        {markingRead ? 'Marking...' : 'Mark Read'}
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleMarkAsUnread}
                        disabled={markingUnread}
                        startIcon={markingUnread ? <CircularProgress size={12} /> : <MarkAsUnreadIcon sx={{ fontSize: 16 }} />}
                        sx={{ height: 28, fontSize: '0.7rem', px: 1 }}
                      >
                        Unread
                      </Button>
                    </>
                  )}

                  {!isMobile && (
                    <IconButton onClick={() => { setSelectedThread(null); setMessages([]); }} size="small" sx={{ color: 'text.disabled' }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>

                {/* Row 2: Buyer + product context */}
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {(() => {
                    const buyerTitle =
                      String(selectedThread.buyerName || '').trim() ||
                      getThreadBuyerDisplay(
                        selectedThread,
                        sellerKeysById.get(String(selectedThread.sellerId)) || []
                      );
                    const buyerIsSellerIdentity =
                      selectedThread.buyerLooksLikeSeller === true ||
                      (selectedThread.buyerUsername &&
                        sellerIdentities.has(String(selectedThread.buyerUsername).toLowerCase()));
                    return (
                      <>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {buyerTitle}
                        </Typography>
                        {!buyerIsSellerIdentity && selectedThread.buyerUsername && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            @{selectedThread.buyerUsername}
                          </Typography>
                        )}
                      </>
                    );
                  })()}

                  {selectedThread.itemId !== 'DIRECT_MESSAGE' && (
                    <>
                      <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />
                      {threadThumbnail && (
                        <Box
                          component="img"
                          src={threadThumbnail}
                          alt=""
                          sx={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 0.5, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
                        />
                      )}
                      <Link
                        href={`https://www.ebay.com/itm/${selectedThread.itemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.25 }}
                      >
                        <Typography variant="caption" noWrap sx={{ color: 'primary.main', fontWeight: 600 }}>
                          {selectedThread.itemTitle || selectedThread.itemId}
                        </Typography>
                        <OpenInNewIcon sx={{ fontSize: 12, flexShrink: 0 }} />
                      </Link>
                      <IconButton size="small" onClick={() => handleCopy(selectedThread.itemTitle || selectedThread.itemId)} sx={{ p: 0.25 }}>
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </>
                  )}

                  {selectedThread.orderId ? (
                    <Chip
                      label={`#${selectedThread.orderId}`}
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedOrderId(selectedThread.orderId)}
                      sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                    />
                  ) : (
                    selectedThread.itemId && selectedThread.itemId !== 'DIRECT_MESSAGE' && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleResolveOrder}
                        disabled={resolvingOrder}
                        startIcon={resolvingOrder ? <CircularProgress size={12} /> : null}
                        sx={{ height: 24, fontSize: '0.68rem', px: 1, textTransform: 'none' }}
                      >
                        {resolvingOrder ? 'Finding…' : 'Find order'}
                      </Button>
                    )
                  )}
                  {selectedThread.marketplaceId && selectedThread.marketplaceId !== 'Unknown' && (
                    <Chip
                      label={selectedThread.marketplaceId.replace('EBAY_', '')}
                      size="small"
                      sx={{
                        height: 24, fontSize: '0.7rem', fontWeight: 600,
                        bgcolor: selectedThread.marketplaceId === 'EBAY_US' ? '#e3f2fd' : '#fff3e0',
                        color: selectedThread.marketplaceId === 'EBAY_US' ? '#1565c0' : '#e65100',
                      }}
                    />
                  )}
                </Stack>

                {/* Templates Menu - Positioned outside the header Stack */}
                <Menu
                  anchorEl={templateAnchorEl}
                  open={Boolean(templateAnchorEl)}
                  onClose={handleTemplateClose}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  PaperProps={{
                    style: {
                      maxHeight: 400,
                      width: 320,
                    },
                  }}
                >
                  {/* Manage Templates Button */}
                  <MenuItem
                    onClick={() => { handleTemplateClose(); setManageTemplatesOpen(true); }}
                    sx={{
                      borderBottom: '2px solid #e0e0e0',
                      bgcolor: '#f9f9ff',
                      py: 1.5
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <SettingsIcon fontSize="small" color="primary" />
                      <Typography variant="subtitle2" color="primary">Manage Templates</Typography>
                    </Stack>
                  </MenuItem>

                  {templatesLoading ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : chatTemplates.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                      No templates available. Click "Manage Templates" to add some.
                    </Typography>
                  ) : (
                    chatTemplates.map((group, index) => (
                      <Box key={index}>
                        <ListSubheader
                          sx={{
                            bgcolor: '#f5f5f5',
                            fontWeight: 'bold',
                            lineHeight: '32px',
                            color: 'primary.main',
                            fontSize: '0.75rem'
                          }}
                        >
                          {group.category}
                        </ListSubheader>
                        {group.items.map((item, idx) => (
                          <MenuItem
                            key={item._id || idx}
                            onClick={() => handleSelectTemplate(item.text)}
                            sx={{
                              fontSize: '0.85rem',
                              whiteSpace: 'normal',
                              py: 1,
                              borderBottom: '1px solid #f0f0f0',
                              display: 'block'
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                              {item.label}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                fontSize: '0.75rem'
                              }}
                            >
                              {item.text}
                            </Typography>
                          </MenuItem>
                        ))}
                      </Box>
                    ))
                  )}
                </Menu>

                {/* Template Management Modal */}
                <TemplateManagementModal
                  open={manageTemplatesOpen}
                  onClose={() => {
                    setManageTemplatesOpen(false);
                    loadChatTemplates();
                  }}
                />

                {selectedThread.itemId === 'DIRECT_MESSAGE' && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0, fontSize: '0.75rem' }}>
                    Direct messages cannot be replied to via API.
                  </Alert>
                )}
              </Box>

              <Box sx={{
                flex: 1,
                minHeight: 0,
                p: { xs: 1, md: 1.5 },
                overflowY: 'auto',
                bgcolor: 'grey.100'
              }}>
                {loadingMessages ? (
                  <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
                ) : (
                  <Stack spacing={2} sx={{ width: '100%' }}>
                    {messages.length === 0 && selectedThread.isNew && (
                      <Alert severity="info">Start the conversation by typing a welcome message below!</Alert>
                    )}
                    {messages.length === 0 && !selectedThread.isNew && (
                      <Alert severity="info">No messages in this thread yet. Try Check New or reopen the conversation.</Alert>
                    )}

                    {messages.map((msg) => {
                      const isSeller = String(msg.sender || '').toUpperCase() === 'SELLER';
                      // Prefer human/store names over eBay UserIDs in bubble labels
                      const senderLabel = isSeller
                        ? (
                            String(selectedThread?.sellerUsername || '').trim() ||
                            String(selectedThread?.sellerEbayUsername || '').trim() ||
                            String(msg.senderUsername || '').trim() ||
                            'Seller'
                          )
                        : (
                            String(selectedThread?.buyerName || '').trim() ||
                            String(msg.senderUsername || '').trim() ||
                            String(selectedThread?.buyerUsername || '').trim() ||
                            'Buyer'
                          );
                      return (
                      <Box
                        key={msg._id || msg.messageId}
                        sx={{
                          display: 'flex',
                          justifyContent: isSeller ? 'flex-end' : 'flex-start',
                          width: '100%'
                        }}
                      >
                        <Box sx={{ maxWidth: { xs: '85%', sm: '75%', md: '70%' } }}>
                        <Paper
                          elevation={1}
                          sx={{
                            p: { xs: 1, md: 1.5 },
                            bgcolor: isSeller ? '#1976d2' : '#ffffff',
                            color: isSeller ? '#fff' : 'text.primary',
                            borderRadius: 2,
                            position: 'relative'
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              mb: 0.5,
                              opacity: 0.85,
                              fontWeight: 600,
                              fontSize: '0.7rem'
                            }}
                          >
                            {senderLabel} ({isSeller ? 'seller' : 'buyer'})
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: { xs: '0.8rem', md: '0.875rem' },
                              lineHeight: 1.45
                            }}
                          >
                            {msg.body}
                          </Typography>

                          {/* Attachments / images */}
                          {((msg.mediaUrls && msg.mediaUrls.length > 0) ||
                            (Array.isArray(msg.messageMedia) && msg.messageMedia.length > 0)) && (
                            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {(msg.mediaUrls?.length
                                ? msg.mediaUrls.map((url) => ({ url, name: '' }))
                                : (msg.messageMedia || []).map((m) => ({
                                    url: m?.mediaUrl,
                                    name: m?.mediaName || '',
                                    type: m?.mediaType
                                  }))
                              )
                                .filter((m) => m?.url)
                                .map((media, idx) => {
                                  const url = String(media.url);
                                  const name = media.name || url.split('/').pop() || 'Attachment';
                                  const type = String(media.type || '').toUpperCase();
                                  const isImage =
                                    type === 'IMAGE' ||
                                    /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) ||
                                    /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(name) ||
                                    /i\.ebayimg\.com/i.test(url) ||
                                    /\$\_\d+\.(jpe?g|png|gif|webp)/i.test(url);

                                  if (isImage) {
                                    return (
                                      <Box
                                        key={idx}
                                        component="a"
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{
                                          display: 'block',
                                          borderRadius: 1,
                                          overflow: 'hidden',
                                          border: '1px solid',
                                          borderColor: isSeller ? 'rgba(255,255,255,0.35)' : 'divider',
                                          lineHeight: 0,
                                          maxWidth: '100%'
                                        }}
                                      >
                                        <Box
                                          component="img"
                                          src={url}
                                          alt={name}
                                          loading="lazy"
                                          sx={{
                                            display: 'block',
                                            maxWidth: { xs: 180, md: 260 },
                                            maxHeight: 200,
                                            width: 'auto',
                                            height: 'auto',
                                            objectFit: 'contain',
                                            bgcolor: '#fff'
                                          }}
                                        />
                                      </Box>
                                    );
                                  }

                                  return (
                                    <Chip
                                      key={idx}
                                      icon={<AttachFileIcon />}
                                      label={name.length > 28 ? `${name.slice(0, 28)}…` : name}
                                      onClick={() => window.open(url, '_blank')}
                                      sx={{
                                        cursor: 'pointer',
                                        bgcolor: isSeller ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
                                        color: 'inherit',
                                        maxWidth: { xs: 150, md: 200 },
                                        fontSize: { xs: '0.7rem', md: '0.75rem' }
                                      }}
                                    />
                                  );
                                })}
                            </Box>
                          )}
                        </Paper>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            mt: 0.5,
                            textAlign: isSeller ? 'right' : 'left',
                            fontSize: { xs: '0.7rem', md: '0.75rem' }
                          }}
                        >
                          {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                          {isSeller && (msg.read ? ' • Read' : ' • Sent')}
                        </Typography>
                        </Box>
                      </Box>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </Stack>
                )}
              </Box>

              <Box sx={{
                p: { xs: 1, md: 1.25 },
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                flexShrink: 0
              }}>
                <ChatComposer
                  isMobile={isMobile}
                  isDirectMessage={selectedThread.itemId === 'DIRECT_MESSAGE'}
                  attachments={attachments}
                  uploading={uploading}
                  sending={sending}
                  newMessage={newMessage}
                  fileInputRef={fileInputRef}
                  onFileSelect={onFileSelect}
                  onRemoveAttachment={onRemoveAttachment}
                  onChangeMessage={onChangeMessage}
                  onSend={onSendMessage}
                />
              </Box>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', bgcolor: 'action.hover' }}>
              <Stack alignItems="center" spacing={1} sx={{ px: 2 }}>
                <QuestionAnswerIcon sx={{ fontSize: { xs: 40, md: 52 }, color: 'text.disabled' }} />
                <Typography color="text.secondary" variant="body2">
                  Select a conversation from the inbox
                </Typography>
                {!sidebarOpen && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => setSidebarOpen(true)}
                    sx={{ mt: 1 }}
                    startIcon={<MenuIcon />}
                  >
                    View Conversations
                  </Button>
                )}
              </Stack>
            </Box>
          )
        }
      </Box>
      </Box>
      </Paper>

      {/* Snackbar for sync results */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={8000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{
            width: '100%',
            whiteSpace: 'pre-line',
            minWidth: 300
          }}
          elevation={6}
          variant="filled"
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>

      {/* Copy Feedback Snackbar */}
      <Snackbar
        open={!!copiedText}
        autoHideDuration={1200}
        message="Copied to clipboard!"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* Order Details Modal */}
      {selectedOrderId && (
        <OrderDetailsModal
          open={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          orderId={selectedOrderId}
        />
      )}
    </Box>
  );
}
