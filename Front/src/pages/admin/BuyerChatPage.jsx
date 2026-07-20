import React, { useEffect, useState, useRef, useMemo, memo } from 'react';
import {
  Avatar, TextField, Button, Divider, Badge, Stack, CircularProgress,
  IconButton, Chip, Alert,   FormControl, Select, MenuItem, InputLabel, Link,
  Snackbar, ListItemButton, Box, Paper, Typography, List, ListItem, ListItemText, ListItemAvatar,
  useTheme, useMediaQuery, Menu, ListSubheader, Tooltip, Card, CardContent, FormControlLabel, Checkbox
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import EmailIcon from '@mui/icons-material/Email';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MarkAsUnreadIcon from '@mui/icons-material/MarkAsUnread';
import MenuIcon from '@mui/icons-material/Menu';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import SettingsIcon from '@mui/icons-material/Settings';
import api from '../../lib/api';
import { sortSellersByName } from '../../lib/sellersSort';
import TemplateManagementModal from '../../components/TemplateManagementModal';
import OrderDetailsModal from '../../components/OrderDetailsModal';

// Session storage key for persisting state (v2: only restore selected thread, not filters)
const CHAT_STORAGE_KEY = 'buyer_chat_page_state_v2';

// Keys restored from session — filters are intentionally excluded so stale searches don't hide threads
const SESSION_RESTORE_KEYS = new Set(['selectedThread']);

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

const KpiCard = ({ label, value, color, bgcolor = '#f8fafc' }) => (
  <Card sx={{ borderRadius: 2, bgcolor, height: '100%' }}>
    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, color, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

const ThreadListItem = memo(function ThreadListItem({
  thread, index, isSelected, imageUrl, isLoadingImage, onSelect
}) {
  const msgType = thread.actualMessageType || thread.messageType;
  const isOrder = msgType === 'ORDER';
  const isDirect = msgType === 'DIRECT';

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
                {thread.buyerName || thread.buyerUsername || 'Unknown Buyer'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {new Date(thread.lastDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
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
                {thread.itemId === 'DIRECT_MESSAGE' ? 'No item' : (thread.itemTitle || thread.itemId)}
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
  const [selectedThread, setSelectedThread] = useState(() => getInitialState('selectedThread', null));
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => getInitialState('searchQuery', ''));
  const [searchError, setSearchError] = useState('');
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState(() => getInitialState('selectedSeller', ''));
  const [filterType, setFilterType] = useState(() => getInitialState('filterType', 'ALL'));
  const [filterMarketplace, setFilterMarketplace] = useState(() => getInitialState('filterMarketplace', ''));
  const [showUnreadOnly, setShowUnreadOnly] = useState(() => getInitialState('showUnreadOnly', false));
  const [includeResolved, setIncludeResolved] = useState(() => getInitialState('includeResolved', true));
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [threadTotal, setThreadTotal] = useState(0);
  const [loadingThreads, setLoadingThreads] = useState(false);

  const [metaCategory, setMetaCategory] = useState('');
  const [metaCaseStatus, setMetaCaseStatus] = useState('');
  const [metaPickedUpBy, setMetaPickedUpBy] = useState('');
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
  const fileInputRef = useRef(null);

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

  // Persist state to sessionStorage (selected thread only — filters reset on reload)
  useEffect(() => {
    const stateToSave = { selectedThread };
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('Error saving to sessionStorage:', e);
    }
  }, [selectedThread]);





  useEffect(() => {
    if (selectedThread && !selectedThread.isNew) {
      fetchMeta(selectedThread);
    } else {
      setMetaCategory('');
      setMetaCaseStatus('');
      setMetaPickedUpBy('');
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
      } else {
        setMetaCategory('');
        setMetaCaseStatus('');
        setMetaPickedUpBy('');
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
    }
  }

  async function handleSaveMeta() {
    if (!metaCaseStatus) {
      alert("Please select a 'Status' field.");
      return;
    }

    setSavingMeta(true);
    try {
      await api.post('/ebay/conversation-meta', {
        sellerId: selectedThread.sellerId,
        buyerUsername: selectedThread.buyerUsername,
        orderId: selectedThread.orderId,
        itemId: selectedThread.itemId,
        category: metaCategory,
        caseStatus: metaCaseStatus,  // keep backward-compat field
        status: metaCaseStatus,      // synced status field
        pickedUpBy: metaPickedUpBy || null
      });
      // Optional: Show a small success toast or icon change
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
      loadAllThreadPages().then((count) => {
        if (count === 0 && !didAutoSync.current) {
          didAutoSync.current = true;
          handleManualSync();
        }
      });
      loadChatTemplates();
      fetchAgents();

      // If we have a restored selectedThread, load its messages
      if (selectedThread && !selectedThread.isNew) {
        loadMessages(selectedThread);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous values to detect actual changes
  const prevSearchQuery = useRef(searchQuery);
  const prevSelectedSeller = useRef(selectedSeller);
  const prevFilterType = useRef(filterType);
  const prevFilterMarketplace = useRef(filterMarketplace);
  const prevShowUnreadOnly = useRef(showUnreadOnly);
  const prevIncludeResolved = useRef(includeResolved);
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
      prevShowUnreadOnly.current !== showUnreadOnly ||
      prevIncludeResolved.current !== includeResolved
    ) {
      prevSearchQuery.current = searchQuery;
      prevSelectedSeller.current = selectedSeller;
      prevFilterType.current = filterType;
      prevFilterMarketplace.current = filterMarketplace;
      prevShowUnreadOnly.current = showUnreadOnly;
      prevIncludeResolved.current = includeResolved;

      const delayDebounceFn = setTimeout(() => {
        setPage(1);
        loadAllThreadPages();
      }, 500);

      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchQuery, selectedSeller, filterType, filterMarketplace, showUnreadOnly, includeResolved]);

  // 2. Scroll Effect
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 3. ACTIVE POLLING
  useEffect(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    if (selectedThread && !selectedThread.isNew) {
      pollingIntervalRef.current = setInterval(() => {
        pollActiveThread();
      }, 10000);
    }

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [selectedThread]);

  // 4. FETCH MISSING PRODUCT IMAGES — only for first visible threads
  useEffect(() => {
    const fetchMissingImages = async () => {
      const visibleThreads = threads.slice(0, 12);
      const threadsNeedingImages = visibleThreads.filter(thread => {
        const msgType = thread.actualMessageType || thread.messageType;
        return (
          msgType === 'ORDER' &&
          !thread.productImageUrl &&
          thread.itemId &&
          thread.itemId !== 'DIRECT_MESSAGE' &&
          thread.sellerId &&
          !threadImages[thread.itemId] &&
          !fetchingImages.has(thread.itemId)
        );
      });

      if (threadsNeedingImages.length === 0) return;

      const newFetching = new Set(fetchingImages);
      threadsNeedingImages.forEach(t => newFetching.add(t.itemId));
      setFetchingImages(newFetching);

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
              if (url) {
                setThreadImages(prev => ({ ...prev, [thread.itemId]: url }));
              }
            } catch (err) {
              console.debug(`Failed to fetch image for ${thread.itemId}`, err.message);
            } finally {
              setFetchingImages(prev => {
                const updated = new Set(prev);
                updated.delete(thread.itemId);
                return updated;
              });
            }
          })
        );
      }
    };

    fetchMissingImages();
  }, [threads]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // API CALLS
  async function handleManualSync() {
    if (syncingInbox) return;
    setSyncingInbox(true);
    try {
      const res = await api.post('/ebay/sync-inbox', {}, { timeout: 180000 });
      setPage(1);
      await loadAllThreadPages();

      if (res.data.success) {
        const { syncResults, totalNewMessages } = res.data;
        const commerceCount = (syncResults || []).reduce((sum, r) => sum + (r.commerceConversations || 0), 0);
        const commerceErrors = (syncResults || []).filter((r) => r.commerceError).map((r) => `${r.sellerName}: ${r.commerceError}`);

        if (totalNewMessages > 0 && syncResults) {
          const sellerSummary = syncResults
            .filter(r => r.newMessages > 0)
            .map(r => `${r.sellerName}: ${r.newMessages} new`)
            .join('\n');

          setSnackbarMsg(`Found ${totalNewMessages} new message${totalNewMessages > 1 ? 's' : ''}!\n\n${sellerSummary}`);
          setSnackbarSeverity('success');
        } else if (commerceCount > 0) {
          setSnackbarMsg(`Synced ${commerceCount} conversation${commerceCount === 1 ? '' : 's'} from eBay.`);
          setSnackbarSeverity('success');
        } else if (commerceErrors.length > 0) {
          setSnackbarMsg(`Commerce API sync issue:\n${commerceErrors.join('\n')}`);
          setSnackbarSeverity('warning');
        } else {
          setSnackbarMsg('No new messages found.');
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
      await loadAllThreadPages();
    } finally {
      setSyncingInbox(false);
    }
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
        orderId: selectedThread.orderId || undefined
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
    if (loadingThreads) return;
    setLoadingThreads(true);
    if (reset) setThreads([]);

    try {
      const currentPage = reset ? 1 : page;
      const params = {
        page: currentPage,
        limit: 50,
        search: searchQuery,
        filterType: filterType,
        filterMarketplace: filterMarketplace,
        showUnreadOnly: showUnreadOnly,
        includeResolved: includeResolved,
        maxAgeDays: 0
      };

      if (selectedSeller) params.sellerId = selectedSeller;

      const res = await api.get('/ebay/chat/threads', { params });
      const newThreads = res.data.threads;
      const total = res.data.total ?? 0;

      if (reset) {
        setThreads(newThreads);
        setThreadTotal(total);
        setHasMore(newThreads.length < total);
      } else {
        setThreads(prev => {
          const combined = [...prev, ...newThreads];
          setHasMore(combined.length < total);
          return combined;
        });
      }

      setPage(currentPage + 1);
    } catch (e) {
      if (e.response?.status !== 401) {
        console.error('Failed to load threads', e);
      }
      if (reset) {
        setThreads([]);
      }
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadAllThreadPages() {
    if (loadingThreads) return;
    setLoadingThreads(true);
    setThreads([]);

    try {
      let pageNum = 1;
      let combined = [];
      let total = 0;

      while (pageNum <= 40) {
        const params = {
          page: pageNum,
          limit: 50,
          search: searchQuery,
          filterType: filterType,
          filterMarketplace: filterMarketplace,
          showUnreadOnly: showUnreadOnly,
          includeResolved: includeResolved,
          maxAgeDays: 0
        };
        if (selectedSeller) params.sellerId = selectedSeller;

        const res = await api.get('/ebay/chat/threads', { params });
        const batch = res.data.threads || [];
        total = res.data.total ?? 0;
        combined = [...combined, ...batch];

        if (batch.length === 0 || combined.length >= total) break;
        pageNum += 1;
      }

      setThreads(combined);
      setThreadTotal(total);
      setHasMore(combined.length < total);
      setPage(pageNum + 1);
      return combined.length;
    } catch (e) {
      if (e.response?.status !== 401) {
        console.error('Failed to load threads', e);
      }
      setThreads([]);
      return 0;
    } finally {
      setLoadingThreads(false);
    }
  }

  async function handleThreadSelect(thread) {
    setSelectedThread(thread);
    setSearchError('');

    // Close sidebar on mobile and tablet when thread is selected
    if (isMobile || isTablet) {
      setSidebarOpen(false);
    }

    // 1. OPTIMISTIC UPDATE: Remove Red Dot Immediately
    if (thread.unreadCount > 0) {
      setThreads(prevThreads =>
        prevThreads.map(t => {
          // Match by OrderId OR (Buyer + Item)
          const isMatch = t.orderId
            ? t.orderId === thread.orderId
            : (t.buyerUsername === thread.buyerUsername && t.itemId === thread.itemId);

          if (isMatch) {
            return { ...t, unreadCount: 0 }; // Zero out unread count
          }
          return t;
        })
      );
    }

    // 2. Sync from eBay then load messages from DB
    if (!thread.isNew) {
      try {
        await api.post('/ebay/sync-thread', {
          sellerId: thread.sellerId,
          buyerUsername: thread.buyerUsername,
          itemId: thread.itemId,
          orderId: thread.orderId || undefined
        });
      } catch (e) {
        if (e.response?.status !== 401 && e.response?.status !== 400) {
          console.error('Thread sync failed', e);
        }
      }
      await loadMessages(thread, true);
    } else {
      setMessages([]);
    }
  }

  async function loadMessages(thread, showLoading = true) {
    if (showLoading) setLoadingMessages(true);
    try {
      const params = {
        buyerUsername: thread.buyerUsername
      };
      if (thread.orderId) params.orderId = thread.orderId;
      if (thread.itemId) params.itemId = thread.itemId;
      if (thread.sellerId) params.sellerId = thread.sellerId;

      const res = await api.get('/ebay/chat/messages', { params });
      setMessages(res.data);
    } catch (e) {
      // Don't log 401 errors - they're handled by the interceptor
      if (e.response?.status !== 401) {
        console.error('Failed to load messages', e);
      }
      // Set empty array on error to prevent crashes
      setMessages([]);
    } finally {
      if (showLoading) setLoadingMessages(false);
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

  async function handleSearchOrder() {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    setSearchError('');

    // 1. Local Search (Checks OrderID OR Username)
    const foundLocal = threads.find(t =>
      (t.orderId && t.orderId.toLowerCase().includes(query)) ||
      (t.buyerUsername && t.buyerUsername.toLowerCase().includes(query)) ||
      (t.buyerName && t.buyerName.toLowerCase().includes(query))
    );

    if (foundLocal) {
      handleThreadSelect(foundLocal);
      return;
    }

    // 2. Remote Search (Only if looks like Order ID)
    // We assume usernames are found locally since you fetch all active threads.
    // Only fetch from API if it looks like an Order ID (contains hyphens or numbers)
    if (query.match(/[\d-]/)) {
      try {
        const res = await api.get('/ebay/chat/search-order', { params: { orderId: searchQuery.trim() } });
        handleThreadSelect(res.data);
      } catch (e) {
        setSearchError('Not found locally or remotely.');
      }
    } else {
      setSearchError('User conversation not found in active threads.');
    }
  }

  const getSellerName = (id) => {
    const seller = sellers.find(s => s._id === id);
    return seller?.user?.username || 'Unknown Seller';
  };

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

  const narrowingFiltersActive = useMemo(() => (
    Boolean(searchQuery.trim()) ||
    Boolean(selectedSeller) ||
    filterType !== 'ALL' ||
    Boolean(filterMarketplace) ||
    showUnreadOnly
  ), [searchQuery, selectedSeller, filterType, filterMarketplace, showUnreadOnly]);

  const hasActiveFilters = narrowingFiltersActive || includeResolved;

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedSeller('');
    setFilterType('ALL');
    setFilterMarketplace('');
    setShowUnreadOnly(false);
    setIncludeResolved(true);
    setPage(1);
  };

  const inboxStats = useMemo(() => ({
    unreadThreads: threads.filter(t => t.unreadCount > 0).length,
    unreadMessages: threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0),
    loaded: threads.length
  }), [threads]);

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: { xs: '100vh', md: '85vh' },
      gap: 1.5,
      position: 'relative'
    }}>
      {/* KPI + compact filters */}
      <Box sx={{ px: { xs: 1, md: 0 }, flexShrink: 0 }}>
        {!loadingThreads && (threads.length > 0 || threadTotal > 0) && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5, mb: 1.5 }}>
            <KpiCard label="Conversations" value={threadTotal.toLocaleString()} color="#3b82f6" bgcolor="#eff6ff" />
            <KpiCard label="Unread Threads" value={inboxStats.unreadThreads} color="#ef4444" bgcolor="#fef2f2" />
            <KpiCard label="Unread Messages" value={inboxStats.unreadMessages} color="#f59e0b" bgcolor="#fffbeb" />
            <KpiCard label="Loaded" value={`${inboxStats.loaded} / ${threadTotal}`} color="#64748b" bgcolor="#f8fafc" />
          </Box>
        )}

        {narrowingFiltersActive && !loadingThreads && (
          <Alert
            severity="info"
            sx={{ mb: 1.5, py: 0.25, alignItems: 'center' }}
            action={
              <Button color="inherit" size="small" startIcon={<FilterAltOffIcon />} onClick={clearAllFilters}>
                Clear filters
              </Button>
            }
          >
            Filters are narrowing results — showing {threadTotal.toLocaleString()} conversation{threadTotal === 1 ? '' : 's'}.
            {searchQuery.trim() && ' Search matches buyer, order, item title, seller, or message text.'}
          </Alert>
        )}

        <Paper sx={{ p: 1.5, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ lg: 'center' }}>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 140 }, flex: { lg: 1 } }}>
              <InputLabel>Seller</InputLabel>
              <Select value={selectedSeller} label="Seller" onChange={(e) => setSelectedSeller(e.target.value)}>
                <MenuItem value=""><em>All Sellers</em></MenuItem>
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
              <InputLabel>Marketplace</InputLabel>
              <Select value={filterMarketplace} label="Marketplace" onChange={(e) => setFilterMarketplace(e.target.value)}>
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
                <MenuItem value={false}>All</MenuItem>
                <MenuItem value={true}>Unread Only</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={includeResolved}
                  onChange={(e) => setIncludeResolved(e.target.checked)}
                />
              }
              label={<Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Include resolved</Typography>}
              sx={{ ml: 0, flexShrink: 0 }}
            />
            <TextField
              size="small"
              placeholder="Search buyer, order, item, seller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: { xs: '100%', lg: 200 }, flex: { lg: 2 } }}
            />
            <Button
              size="small"
              startIcon={syncingInbox ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={handleManualSync}
              disabled={syncingInbox}
              variant="outlined"
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {syncingInbox ? 'Syncing...' : 'Check New'}
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
              (selectedThread.orderId && selectedThread.orderId === thread.orderId) ||
              (!selectedThread.orderId && selectedThread.buyerUsername === thread.buyerUsername && selectedThread.itemId === thread.itemId)
            );
            const imageUrl = thread.productImageUrl || threadImages[thread.itemId] || null;

            return (
              <ThreadListItem
                key={`${thread.orderId || 'inq'}-${thread.itemId || index}`}
                thread={thread}
                index={index}
                isSelected={isSelected}
                imageUrl={imageUrl}
                isLoadingImage={fetchingImages.has(thread.itemId)}
                onSelect={handleThreadSelect}
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
            <Typography variant="caption" sx={{ p: 3, display: 'block', textAlign: 'center', color: 'text.secondary' }}>
              {syncingInbox
                ? 'Syncing conversations from eBay...'
                : 'No conversations yet. Click Check New to sync from eBay.'}
            </Typography>
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
                    onClick={() => { setSelectedThread(null); setSidebarOpen(true); }}
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
                  )}

                  {!isMobile && (
                    <IconButton onClick={() => setSelectedThread(null)} size="small" sx={{ color: 'text.disabled' }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>

                {/* Row 2: Buyer + product context */}
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {selectedThread.buyerName || selectedThread.buyerUsername}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    @{selectedThread.buyerUsername}
                  </Typography>

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

                  {selectedThread.orderId && (
                    <Chip
                      label={`#${selectedThread.orderId}`}
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedOrderId(selectedThread.orderId)}
                      sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                    />
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
                bgcolor: '#f0f2f5'
              }}>
                {loadingMessages ? (
                  <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
                ) : (
                  <Stack spacing={2}>
                    {messages.length === 0 && selectedThread.isNew && (
                      <Alert severity="info">Start the conversation by typing a welcome message below!</Alert>
                    )}

                    {messages.map((msg) => (
                      <Box
                        key={msg._id}
                        sx={{
                          alignSelf: msg.sender === 'SELLER' ? 'flex-end' : 'flex-start',
                          maxWidth: { xs: '85%', sm: '75%', md: '70%' }
                        }}
                      >
                        <Paper
                          elevation={1}
                          sx={{
                            p: { xs: 1, md: 1.5 },
                            bgcolor: msg.sender === 'SELLER' ? '#1976d2' : '#ffffff',
                            color: msg.sender === 'SELLER' ? '#fff' : 'text.primary',
                            borderRadius: 2,
                            position: 'relative'
                          }}
                        >
                          <Typography
                            variant="body1"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: { xs: '0.875rem', md: '1rem' }
                            }}
                          >
                            {msg.body}
                          </Typography>

                          {/* IMAGES */}
                          {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {msg.mediaUrls.map((url, idx) => {
                                const fileName = url.split('/').pop() || 'Attachment';
                                return (
                                  <Chip
                                    key={idx}
                                    icon={<AttachFileIcon />}
                                    label={fileName}
                                    onClick={() => window.open(url, '_blank')}
                                    sx={{
                                      cursor: 'pointer',
                                      bgcolor: msg.sender === 'SELLER' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
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
                            textAlign: msg.sender === 'SELLER' ? 'right' : 'left',
                            fontSize: { xs: '0.7rem', md: '0.75rem' }
                          }}
                        >
                          {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                          {msg.sender === 'SELLER' && (msg.read ? ' • Read' : ' • Sent')}
                        </Typography>
                      </Box>
                    ))}
                    <div ref={messagesEndRef} />
                  </Stack>
                )}
              </Box>

              <Box sx={{
                p: { xs: 1, md: 1.5 },
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                flexShrink: 0
              }}>
                {selectedThread.itemId === 'DIRECT_MESSAGE' ? (
                  <Alert severity="warning" sx={{ width: '100%' }}>
                    <strong>Direct messages cannot be replied to via API.</strong> These are account-level messages without item context. Please respond through eBay's messaging center directly.
                  </Alert>
                ) : (
                  <>
                    {/* ATTACHMENT PREVIEWS */}
                    {attachments.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                        {attachments.map((att, idx) => (
                          <Chip
                            key={idx}
                            label={att.name}
                            onDelete={() => handleRemoveAttachment(idx)}
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
                        onChange={handleFileSelect}
                      />
                      <IconButton
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || sending}
                        sx={{ alignSelf: 'flex-end', mb: 0.5 }}
                      >
                        {uploading ? <CircularProgress size={24} /> : <AttachFileIcon />}
                      </IconButton>

                      <TextField
                        fullWidth
                        multiline
                        maxRows={isMobile ? 3 : 5}
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        disabled={sending}
                        size={isMobile ? 'small' : 'medium'}
                      />

                      <Button
                        variant="contained"
                        sx={{
                          px: { xs: 2, md: 3 },
                          alignSelf: 'flex-end',
                          mb: 0.5,
                          minWidth: { xs: 'auto', md: 'auto' }
                        }}
                        endIcon={sending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                        onClick={handleSendMessage}
                        disabled={sending || (!newMessage.trim() && attachments.length === 0)}
                      >
                        {isMobile ? '' : 'Send'}
                      </Button>
                    </Box>
                  </>
                )}
              </Box>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', bgcolor: '#fafafa' }}>
              <Stack alignItems="center" spacing={1}>
                <QuestionAnswerIcon sx={{ fontSize: { xs: 40, md: 60 }, color: 'text.secondary', opacity: 0.2 }} />
                <Typography color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '1rem' } }}>
                  {isMobile ? 'Select a conversation' : 'Select a conversation or search an Order ID'}
                </Typography>
                {!sidebarOpen && (
                  <Button
                    variant="contained"
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
      < Snackbar
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
      </Snackbar >

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
    </Box >
  );
}
