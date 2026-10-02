import { useEffect, useState, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, List, ListItem, ListItemButton, ListItemText, ListItemAvatar,
  Avatar, TextField, IconButton, Stack, CircularProgress, Badge, Divider, Chip,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Alert,
  useTheme, useMediaQuery, ToggleButtonGroup, ToggleButton, Menu, MenuItem, ListItemIcon
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import LogoutIcon from '@mui/icons-material/Logout';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ReplyIcon from '@mui/icons-material/Reply';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import RemoveModeratorIcon from '@mui/icons-material/RemoveModerator';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import api from '../../lib/api.js';
import { onSocketEvent } from '../../lib/socket.js';

const TEAM_CHAT_IST_FORMAT = {
  timeZone: 'Asia/Kolkata',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
};

function formatTeamChatTimestamp(value) {
  if (!value) return '';
  return `${new Date(value).toLocaleString('en-US', TEAM_CHAT_IST_FORMAT)} IST`;
}

function summarizeReplyBody(body, maxLength = 120) {
  const compact = String(body || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}...`;
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function currentUserId() {
  const storedUser = readStoredUser();
  return storedUser?.id || storedUser?._id || null;
}

function sanitizeParticipants(participants) {
  return (participants || []).filter((participant) => participant && participant._id);
}

function normalizeConversation(conversation) {
  if (!conversation) return null;
  const participants = sanitizeParticipants(conversation.participants);
  return {
    ...conversation,
    participants,
    otherUser: conversation.otherUser && conversation.otherUser._id ? conversation.otherUser : null,
  };
}

function normalizeMessage(message) {
  if (!message) return null;
  return {
    ...message,
    sender: message.sender || { _id: null, username: 'Former user', role: 'unknown' },
    replyTo: message.replyTo
      ? {
          ...message.replyTo,
          sender: message.replyTo.sender || { _id: null, username: 'Former user', role: 'unknown' },
        }
      : null,
    mentions: (message.mentions || []).filter((mention) => mention && mention._id),
  };
}

// Splits a message body on "@username" tokens matching a known participant,
// so mentions can be rendered as a highlighted inline chip.
function renderBodyWithMentions(body, participants) {
  const usernames = (participants || []).map((p) => p.username).filter(Boolean);
  if (usernames.length === 0) return body;

  const pattern = new RegExp(`@(${usernames.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    parts.push(
      <Box
        key={`mention-${key++}`}
        component="span"
        sx={{ fontWeight: 700, bgcolor: 'rgba(25, 118, 210, 0.12)', borderRadius: 0.5, px: 0.5 }}
      >
        @{match[1]}
      </Box>
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

export default function InternalMessagesPage() {
  // State
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // New chat dialog (DM or group)
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState('dm'); // 'dm' | 'group'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null); // dm
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]); // group
  const [savingChat, setSavingChat] = useState(false);

  // Group members management dialog
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [addMemberResults, setAddMemberResults] = useState([]);
  const [addMemberSelection, setAddMemberSelection] = useState([]);
  const [membersBusy, setMembersBusy] = useState(false);
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState(null);

  // @mention autocomplete in the message input
  const [mentionQuery, setMentionQuery] = useState(null); // string while a "@..." token is being typed
  const [mentionAnchorIndex, setMentionAnchorIndex] = useState(null);
  const [mentionIds, setMentionIds] = useState([]); // resolved userIds tagged in the current draft

  // File attachments
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [pinnedDialogOpen, setPinnedDialogOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Refs
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const textFieldRef = useRef(null);

  // Responsive hooks (match BuyerChatPage behavior)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600px - 960px
  const isDesktop = !isMobile && !isTablet;
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const prevIsDesktopRef = useRef(null);

  const myId = currentUserId();

  // Mirrors the backend fallback (routes/internalMessages.js: isGroupAdmin):
  // groups with no admins[] set default to "the creator is admin", and only
  // fall back further to "everyone" if there's no creator on record at all.
  function isConvAdmin(conv, userId) {
    if (!conv || conv.type !== 'group') return false;
    if (conv.admins && conv.admins.length > 0) return conv.admins.includes(userId);
    if (conv.createdBy) return conv.createdBy === userId;
    return true;
  }
  const iAmGroupAdmin = isConvAdmin(selectedConversation, myId);

  // Sync sidebar state with breakpoints - closed on mobile/tablet, open on desktop
  useEffect(() => {
    if (prevIsDesktopRef.current === null || prevIsDesktopRef.current !== isDesktop) {
      setSidebarOpen(isDesktop);
      prevIsDesktopRef.current = isDesktop;
    }
  }, [isDesktop]);

  // On tablet, keep sidebar closed when viewing a chat
  useEffect(() => {
    if (isTablet && selectedConversation) {
      setSidebarOpen(false);
    }
  }, [isTablet, selectedConversation]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Scroll on conversation switch, own sends, or when already at the bottom; otherwise just count unseen messages
  const lastScrollSigRef = useRef('');
  const prevMessageCountRef = useRef(0);
  const atBottomRef = useRef(true);
  const [unseenCount, setUnseenCount] = useState(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    const convId = String(selectedConversation?.conversationId || '');
    const sig = `${convId}|${messages.length}|${last?._id || ''}`;
    if (sig === lastScrollSigRef.current) return;
    const prevConvId = lastScrollSigRef.current.split('|')[0];
    const prevCount = prevMessageCountRef.current;
    lastScrollSigRef.current = sig;
    prevMessageCountRef.current = messages.length;
    if (messageSearchQuery.trim()) return;

    if (prevConvId !== convId) {
      setUnseenCount(0);
      atBottomRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }
    const added = messages.length - prevCount;
    if (added <= 0) return;
    if (last?.sender?._id === myId || atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setUnseenCount((c) => c + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedConversation?.conversationId]);

  function handleMessagesScroll(e) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    if (atBottom) setUnseenCount(0);
  }

  function jumpToLatest() {
    setUnseenCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // Real-time: new messages / conversation changes via socket, with polling as a fallback safety-net
  useEffect(() => {
    const offNewMessage = onSocketEvent('new_message', (payload) => {
      if (selectedConversation && String(payload.conversationId) === String(selectedConversation.conversationId)) {
        const incomingMessage = normalizeMessage(payload.message);
        if (!incomingMessage) return;
        setMessages((prev) => (prev.some((m) => m._id === incomingMessage._id) ? prev : [...prev, incomingMessage]));
        markConversationRead(payload.conversationId);
      }
      loadConversations();
    });
    const offConversationUpdated = onSocketEvent('conversation_updated', (payload) => {
      if (payload?.pinChanged && selectedConversation
        && String(payload.conversationId) === String(selectedConversation.conversationId)) {
        loadMessages(selectedConversation.conversationId, false);
      }
      loadConversations();
    });
    return () => {
      offNewMessage();
      offConversationUpdated();
    };
  }, [selectedConversation]);

  // Fallback polling while a conversation is open, in case the socket connection drops
  useEffect(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    if (selectedConversation?.conversationId) {
      pollingIntervalRef.current = setInterval(() => {
        loadMessages(selectedConversation.conversationId, false);
      }, 15000);
    }

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [selectedConversation]);

  // API Functions
  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const { data } = await api.get('/internal-messages/conversations');
      const nextConversations = data.map(normalizeConversation).filter(Boolean);
      setConversations(nextConversations);
      // Keep the open conversation's participant list fresh (e.g. after add/remove)
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        const fresh = nextConversations.find((c) => String(c.conversationId) === String(prev.conversationId));
        return fresh || prev;
      });
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function handleTogglePin(conv, e) {
    e?.stopPropagation();
    const nextPinned = !conv.pinned;
    try {
      await api.post(`/internal-messages/conversations/${conv.conversationId}/pin`, { pinned: nextPinned });
      await loadConversations();
    } catch (err) {
      alert('Failed to update pin: ' + (err.response?.data?.error || err.message));
    }
  }

  function markConversationRead(conversationId) {
    setConversations((prev) =>
      prev.map((conv) =>
        String(conv.conversationId) === String(conversationId) ? { ...conv, unreadCount: 0 } : conv
      )
    );
  }

  async function loadMessages(conversationId, showLoading = true) {
    if (!conversationId) return;
    if (showLoading) setLoadingMessages(true);
    try {
      const { data } = await api.get(`/internal-messages/messages/${conversationId}`);
      setMessages(data.map(normalizeMessage).filter(Boolean));
      markConversationRead(conversationId);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }

  async function handleConversationSelect(conversation) {
    setSelectedConversation(conversation);
    setMessageSearchQuery('');
    if (isMobile || isTablet) {
      setSidebarOpen(false);
    }
    await loadMessages(conversation.conversationId);
  }

  function resetDraft() {
    setNewMessage('');
    setAttachments([]);
    setMentionIds([]);
    setMentionQuery(null);
    setReplyingTo(null);
  }

  async function handleSendMessage() {
    if (!newMessage.trim() && attachments.length === 0) return;
    if (!selectedConversation) return;

    setSending(true);
    try {
      const { data } = await api.post('/internal-messages/send', {
        conversationId: selectedConversation.conversationId,
        body: newMessage,
        mediaUrls: attachments.map((a) => a.url),
        mentions: mentionIds,
        replyToMessageId: replyingTo?._id || undefined,
      });

      const sentMessage = normalizeMessage(data);
      if (sentMessage) {
        setMessages((prev) => [...prev, sentMessage]);
      }
      resetDraft();
      loadConversations();
    } catch (err) {
      alert('Failed to send message: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  }

  async function handleToggleMessagePin(message) {
    const nextPinned = !message.pinnedAt;
    try {
      const { data } = await api.post(`/internal-messages/messages/${message._id}/pin`, { pinned: nextPinned });
      setMessages((prev) => prev.map((m) => (m._id === message._id
        ? { ...m, pinnedAt: data.pinnedAt, pinnedBy: data.pinnedBy }
        : m)));
    } catch (err) {
      alert('Failed to update pin: ' + (err.response?.data?.error || err.message));
    }
  }

  function jumpToMessage(messageId) {
    setPinnedDialogOpen(false);
    setMessageSearchQuery('');
    setTimeout(() => {
      document.getElementById(`team-msg-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  function handleReplyToMessage(message) {
    setReplyingTo(message);
    setTimeout(() => textFieldRef.current?.focus(), 0);
  }

  async function searchUsers(query, setter, setLoadingFn) {
    if (!query || query.length < 2) {
      setter([]);
      return;
    }
    setLoadingFn?.(true);
    try {
      const { data } = await api.get('/internal-messages/search-users', { params: { q: query } });
      setter(data);
    } catch (err) {
      console.error('Failed to search users:', err);
    } finally {
      setLoadingFn?.(false);
    }
  }

  async function startNewConversation(selfChat = false) {
    setSavingChat(true);
    try {
      if (newChatMode === 'dm') {
        const recipientId = selfChat === true ? myId : selectedUser?._id;
        if (!recipientId) return;
        const { data } = await api.post('/internal-messages/conversations/dm', { recipientId });
        await loadConversations();
        setSelectedConversation(normalizeConversation(data));
        await loadMessages(data.conversationId);
      } else {
        if (!groupName.trim() || groupMembers.length === 0) return;
        const { data } = await api.post('/internal-messages/conversations/group', {
          name: groupName.trim(),
          participantIds: groupMembers.map((u) => u._id)
        });
        await loadConversations();
        setSelectedConversation(normalizeConversation(data));
        await loadMessages(data.conversationId);
      }
      closeNewChatDialog();
    } catch (err) {
      alert('Failed to start conversation: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingChat(false);
    }
  }

  function closeNewChatDialog() {
    setNewChatOpen(false);
    setNewChatMode('dm');
    setSelectedUser(null);
    setGroupName('');
    setGroupMembers([]);
    setSearchQuery('');
    setSearchResults([]);
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const uploadedFiles = data.urls.map((url, idx) => ({
        name: files[idx].name,
        url
      }));

      setAttachments([...attachments, ...uploadedFiles]);
    } catch (err) {
      alert('Failed to upload files: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveAttachment(index) {
    setAttachments(attachments.filter((_, i) => i !== index));
  }

  // ── @mention handling ────────────────────────────────────────────────────
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null || !selectedConversation) return [];
    const others = sanitizeParticipants(selectedConversation.participants).filter((participant) => participant._id !== myId);
    if (!mentionQuery) return others;
    return others.filter((participant) => participant.username?.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  }, [mentionQuery, selectedConversation, myId]);

  const normalizedMessageSearchQuery = messageSearchQuery.trim().toLowerCase();

  // Most recently pinned first; the first entry is the one shown in the banner
  const pinnedMessages = useMemo(
    () => messages
      .filter((m) => m.pinnedAt)
      .sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt)),
    [messages]
  );

  const visibleMessages = useMemo(() => {
    if (!normalizedMessageSearchQuery) return messages;

    return messages.filter((message) => {
      const senderName = message.sender?.username?.toLowerCase() || '';
      const body = String(message.body || '').toLowerCase();
      const replyBody = String(message.replyTo?.body || '').toLowerCase();
      return senderName.includes(normalizedMessageSearchQuery)
        || body.includes(normalizedMessageSearchQuery)
        || replyBody.includes(normalizedMessageSearchQuery);
    });
  }, [messages, normalizedMessageSearchQuery]);

  function handleMessageInputChange(e) {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setNewMessage(value);

    // Look backwards from the cursor for an unfinished "@token"
    const uptoCursor = value.slice(0, cursor);
    const match = /(^|\s)@([a-zA-Z0-9_.]*)$/.exec(uptoCursor);
    if (match && selectedConversation?.type === 'group') {
      setMentionAnchorIndex(cursor - match[2].length - 1);
      setMentionQuery(match[2]);
    } else {
      setMentionQuery(null);
      setMentionAnchorIndex(null);
    }
  }

  function insertMention(user) {
    if (mentionAnchorIndex === null) return;
    const before = newMessage.slice(0, mentionAnchorIndex);
    const cursor = mentionAnchorIndex + 1 + (mentionQuery?.length || 0);
    const after = newMessage.slice(cursor);
    const inserted = `@${user.username} `;
    setNewMessage(before + inserted + after);
    setMentionIds((prev) => (prev.includes(user._id) ? prev : [...prev, user._id]));
    setMentionQuery(null);
    setMentionAnchorIndex(null);
    setTimeout(() => textFieldRef.current?.focus(), 0);
  }

  // ── Group member management ──────────────────────────────────────────────
  function openMembersDialog() {
    setHeaderMenuAnchor(null);
    setAddMemberQuery('');
    setAddMemberResults([]);
    setAddMemberSelection([]);
    setMembersDialogOpen(true);
  }

  async function handleAddMembers() {
    if (addMemberSelection.length === 0 || !selectedConversation) return;
    setMembersBusy(true);
    try {
      const { data } = await api.post(`/internal-messages/conversations/${selectedConversation.conversationId}/participants`, {
        userIds: addMemberSelection.map((u) => u._id)
      });
      setSelectedConversation(normalizeConversation(data));
      setAddMemberSelection([]);
      setAddMemberQuery('');
      setAddMemberResults([]);
      loadConversations();
    } catch (err) {
      alert('Failed to add members: ' + (err.response?.data?.error || err.message));
    } finally {
      setMembersBusy(false);
    }
  }

  async function handleRemoveMember(userId) {
    if (!selectedConversation) return;
    setMembersBusy(true);
    try {
      const { data } = await api.delete(`/internal-messages/conversations/${selectedConversation.conversationId}/participants/${userId}`);
      if (data.deleted) {
        setSelectedConversation(null);
        setMembersDialogOpen(false);
      } else {
        setSelectedConversation(normalizeConversation(data));
      }
      loadConversations();
    } catch (err) {
      alert('Failed to remove member: ' + (err.response?.data?.error || err.message));
    } finally {
      setMembersBusy(false);
    }
  }

  async function handleLeaveGroup() {
    if (!selectedConversation) return;
    if (!window.confirm(`Leave "${selectedConversation.displayName}"?`)) return;
    await handleRemoveMember(myId);
    setHeaderMenuAnchor(null);
  }

  async function handlePromoteAdmin(userId) {
    if (!selectedConversation) return;
    setMembersBusy(true);
    try {
      const { data } = await api.post(`/internal-messages/conversations/${selectedConversation.conversationId}/admins/${userId}`);
      setSelectedConversation(normalizeConversation(data));
      loadConversations();
    } catch (err) {
      alert('Failed to make admin: ' + (err.response?.data?.error || err.message));
    } finally {
      setMembersBusy(false);
    }
  }

  async function handleDemoteAdmin(userId) {
    if (!selectedConversation) return;
    setMembersBusy(true);
    try {
      const { data } = await api.delete(`/internal-messages/conversations/${selectedConversation.conversationId}/admins/${userId}`);
      setSelectedConversation(normalizeConversation(data));
      loadConversations();
    } catch (err) {
      alert('Failed to remove admin: ' + (err.response?.data?.error || err.message));
    } finally {
      setMembersBusy(false);
    }
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: { xs: 'column', md: 'row' },
      height: { xs: '100vh', md: '85vh' },
      gap: { xs: 0, md: 2 },
      position: 'relative'
    }}>

      {/* Mobile & Tablet: Backdrop overlay when sidebar is open */}
      {(isMobile || isTablet) && sidebarOpen && (
        <Box
          sx={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            bgcolor: 'rgba(0, 0, 0, 0.5)', zIndex: 1500,
            display: { xs: 'block', sm: 'block', md: 'none' }
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR: Conversations List */}
      <Paper sx={{
        width: { xs: '100%', sm: sidebarOpen ? '100%' : 0, md: 340 },
        display: { xs: sidebarOpen ? 'flex' : 'none', sm: sidebarOpen ? 'flex' : 'none', md: 'flex' },
        flexDirection: 'column',
        height: { xs: '100%', sm: '100%', md: '100%' },
        position: { xs: 'fixed', sm: 'fixed', md: 'relative' },
        top: { xs: 0, sm: 0, md: 'auto' },
        left: { xs: 0, sm: 0, md: 'auto' },
        zIndex: { xs: 1600, sm: 1600, md: 1 },
        overflow: 'hidden',
        boxShadow: { xs: 3, sm: 3, md: 1 }
      }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, bgcolor: '#f5f5f5', borderBottom: 1, borderColor: 'divider' }}>
          {(isMobile || isTablet) && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6" sx={{ fontSize: '1rem' }}>Team Chat</Typography>
              <IconButton onClick={() => setSidebarOpen(false)} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
          )}

          {!isMobile && <Typography variant="h6" sx={{ mb: 1 }}>Team Chat</Typography>}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            fullWidth
            onClick={() => setNewChatOpen(true)}
          >
            New Chat
          </Button>
        </Box>

        <List sx={{ overflow: 'auto', flex: 1 }}>
          {loadingConversations ? (
            <Box display="flex" justifyContent="center" mt={4}>
              <CircularProgress />
            </Box>
          ) : conversations.length === 0 ? (
            <Typography variant="caption" sx={{ p: 3, display: 'block', textAlign: 'center', color: 'text.secondary' }}>
              No conversations yet. Start a new chat!
            </Typography>
          ) : (
            conversations.map((conv) => (
              <div key={conv.conversationId}>
                <ListItem
                  button
                  selected={selectedConversation?.conversationId === conv.conversationId}
                  onClick={() => handleConversationSelect(conv)}
                  alignItems="flex-start"
                >
                  <ListItemAvatar>
                    <Badge color="error" badgeContent={conv.unreadCount}>
                      <Avatar sx={{ bgcolor: conv.type === 'group' ? 'secondary.main' : 'primary.main' }}>
                        {conv.type === 'group' ? <GroupIcon /> : <PersonIcon />}
                      </Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="subtitle2" noWrap sx={{ maxWidth: 140, fontWeight: 'bold' }}>
                          {conv.displayName}
                        </Typography>
                        {conv.lastMessageDate && (
                          <Typography variant="caption" color="text.secondary">
                            {formatTeamChatTimestamp(conv.lastMessageDate)}
                          </Typography>
                        )}
                        <IconButton
                          size="small"
                          title={conv.pinned ? 'Unpin chat' : 'Pin chat'}
                          onClick={(e) => handleTogglePin(conv, e)}
                          sx={{ p: 0.25, ml: 0.5 }}
                        >
                          {conv.pinned ? <PushPinIcon sx={{ fontSize: 16 }} color="primary" /> : <PushPinOutlinedIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Stack>
                    }
                    secondary={
                      <>
                        {conv.type === 'group' ? (
                          <Chip label={`${conv.participants?.length || 0} members`} size="small" sx={{ height: 18, fontSize: '0.7rem', mb: 0.5 }} />
                        ) : (
                          <Chip label={conv.otherUser?.role} size="small" sx={{ height: 18, fontSize: '0.7rem', mb: 0.5 }} />
                        )}
                        <Typography variant="body2" noWrap sx={{ fontWeight: conv.unreadCount > 0 ? 'bold' : 'normal' }}>
                          {conv.lastMessage || 'Start a conversation'}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
                <Divider component="li" />
              </div>
            ))
          )}
        </List>
      </Paper>

      {/* Button to open sidebar when closed */}
      {!sidebarOpen && !selectedConversation && (
        <Box sx={{ p: 2, width: '100%' }}>
          <Button fullWidth variant="contained" onClick={() => setSidebarOpen(true)}>
            View Conversations
          </Button>
        </Box>
      )}

      {/* RIGHT: Chat Area */}
      <Paper sx={{
        flex: 1, display: 'flex', flexDirection: 'column',
        width: { xs: '100%', md: 'auto' }, height: { xs: '100vh', md: '100%' }, minWidth: 0
      }}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <Box sx={{ p: { xs: 1.5, md: 2 }, bgcolor: '#f5f5f5', borderBottom: 1, borderColor: 'divider' }}>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  {(isMobile || isTablet) && (
                    <IconButton onClick={() => { setSelectedConversation(null); setSidebarOpen(true); }} size="small">
                      <CloseIcon />
                    </IconButton>
                  )}
                  <Avatar sx={{ bgcolor: selectedConversation.type === 'group' ? 'secondary.main' : 'primary.main' }}>
                    {selectedConversation.type === 'group' ? <GroupIcon /> : <PersonIcon />}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {selectedConversation.displayName}
                    </Typography>
                    {selectedConversation.type === 'group' ? (
                      <Typography variant="caption" color="text.secondary">
                        {selectedConversation.participants?.length || 0} members
                      </Typography>
                    ) : (
                      <Chip label={selectedConversation.otherUser?.role} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                  {selectedConversation.type === 'group' && (
                    <IconButton onClick={(e) => setHeaderMenuAnchor(e.currentTarget)}>
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search in this chat..."
                    value={messageSearchQuery}
                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                    InputProps={{
                      startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                      endAdornment: messageSearchQuery ? (
                        <IconButton size="small" onClick={() => setMessageSearchQuery('')} edge="end">
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      ) : null,
                    }}
                    sx={{ bgcolor: '#fff', borderRadius: 1 }}
                  />
                  {messageSearchQuery && (
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 'fit-content' }}>
                      {visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </Box>

            <Menu anchorEl={headerMenuAnchor} open={Boolean(headerMenuAnchor)} onClose={() => setHeaderMenuAnchor(null)}>
              <MenuItem onClick={openMembersDialog}>
                <ListItemIcon><PersonAddIcon fontSize="small" /></ListItemIcon>
                Manage members
              </MenuItem>
              <MenuItem onClick={handleLeaveGroup}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                Leave group
              </MenuItem>
            </Menu>

            {/* Pinned message banner: latest pin, with access to all pins */}
            {pinnedMessages.length > 0 && (
              <Box sx={{ px: 2, py: 0.75, bgcolor: '#fff8e1', borderBottom: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <PushPinIcon sx={{ fontSize: 18 }} color="warning" />
                  <Box
                    sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => jumpToMessage(pinnedMessages[0]._id)}
                  >
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                      Pinned by {pinnedMessages[0].sender?.username || 'Former user'}
                    </Typography>
                    <Typography variant="body2" noWrap>
                      {summarizeReplyBody(pinnedMessages[0].body, 160)}
                    </Typography>
                  </Box>
                  {pinnedMessages.length > 1 && (
                    <Button size="small" onClick={() => setPinnedDialogOpen(true)}>
                      View all ({pinnedMessages.length})
                    </Button>
                  )}
                  <IconButton size="small" title="Unpin" onClick={() => handleToggleMessagePin(pinnedMessages[0])}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              </Box>
            )}

            {/* Messages Area */}
            <Box onScroll={handleMessagesScroll} sx={{ flex: 1, p: 2, overflowY: 'auto', bgcolor: '#f0f2f5' }}>
              {loadingMessages ? (
                <Box display="flex" justifyContent="center" mt={4}>
                  <CircularProgress />
                </Box>
              ) : (
                <Stack spacing={2}>
                  {messages.length === 0 && (
                    <Alert severity="info">Start the conversation by typing a message below!</Alert>
                  )}
                  {messages.length > 0 && visibleMessages.length === 0 && (
                    <Alert severity="info">No messages match your search.</Alert>
                  )}

                  {visibleMessages.map((msg) => {
                    const isMe = msg.sender?._id === myId;
                    const isGroup = selectedConversation.type === 'group';
                    return (
                      <Box
                        key={msg._id}
                        id={`team-msg-${msg._id}`}
                        sx={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: { xs: '85%', sm: '75%', md: '70%' } }}
                      >
                        {isGroup && !isMe && (
                          <Typography variant="caption" sx={{ display: 'block', ml: 1, mb: 0.25, fontWeight: 600, color: 'text.secondary' }}>
                            {msg.sender.username}
                          </Typography>
                        )}
                        <Paper
                          elevation={1}
                          sx={{ p: 1.5, bgcolor: isMe ? '#1976d2' : '#ffffff', color: isMe ? '#fff' : 'text.primary', borderRadius: 2 }}
                        >
                          {msg.replyTo && (
                            <Box
                              sx={{
                                mb: 1,
                                px: 1,
                                py: 0.75,
                                borderLeft: '3px solid',
                                borderColor: isMe ? 'rgba(255,255,255,0.7)' : 'primary.main',
                                bgcolor: isMe ? 'rgba(255,255,255,0.14)' : 'rgba(25,118,210,0.08)',
                                borderRadius: 1,
                              }}
                            >
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: isMe ? 'rgba(255,255,255,0.92)' : 'primary.main' }}>
                                Replying to {msg.replyTo.sender?.username || 'Former user'}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: isMe ? 'rgba(255,255,255,0.82)' : 'text.secondary' }}>
                                {summarizeReplyBody(msg.replyTo.body)}
                              </Typography>
                            </Box>
                          )}
                          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                            {renderBodyWithMentions(msg.body, selectedConversation.participants)}
                          </Typography>

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
                                      bgcolor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
                                      color: 'inherit',
                                      maxWidth: 200
                                    }}
                                  />
                                );
                              })}
                            </Box>
                          )}
                        </Paper>
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent={isMe ? 'flex-end' : 'flex-start'} sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ textAlign: isMe ? 'right' : 'left' }}>
                            {formatTeamChatTimestamp(msg.messageDate)}
                          </Typography>
                          <IconButton size="small" onClick={() => handleReplyToMessage(msg)} sx={{ p: 0.25 }}>
                            <ReplyIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            title={msg.pinnedAt ? 'Unpin message' : 'Pin message'}
                            onClick={() => handleToggleMessagePin(msg)}
                            sx={{ p: 0.25 }}
                          >
                            {msg.pinnedAt
                              ? <PushPinIcon sx={{ fontSize: 15 }} color="warning" />
                              : <PushPinOutlinedIcon sx={{ fontSize: 15 }} />}
                          </IconButton>
                        </Stack>
                      </Box>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </Stack>
              )}
            </Box>

            {/* Input Area */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: '#fff', position: 'relative' }}>
              {unseenCount > 0 && (
                <Chip
                  color="primary"
                  label={`${unseenCount} new message${unseenCount === 1 ? '' : 's'} ↓`}
                  onClick={jumpToLatest}
                  sx={{ position: 'absolute', bottom: '100%', right: 16, mb: 1, cursor: 'pointer', boxShadow: 3 }}
                />
              )}

              {/* @mention suggestions */}
              {mentionQuery !== null && mentionCandidates.length > 0 && (
                <Paper elevation={4} sx={{ position: 'absolute', bottom: '100%', left: 16, mb: 0.5, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
                  <List dense>
                    {mentionCandidates.map((u) => (
                      <ListItemButton key={u._id} onClick={() => insertMention(u)}>
                        <ListItemAvatar><Avatar sx={{ width: 28, height: 28 }}><PersonIcon fontSize="small" /></Avatar></ListItemAvatar>
                        <ListItemText primary={u.username} secondary={u.role} />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              )}

              {attachments.length > 0 && (
                <Box sx={{ mb: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {attachments.map((file, idx) => (
                    <Chip key={idx} label={file.name} onDelete={() => handleRemoveAttachment(idx)} size="small" />
                  ))}
                </Box>
              )}

              {replyingTo && (
                <Paper variant="outlined" sx={{ mb: 1, px: 1.25, py: 0.9, bgcolor: '#f8fafc' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'primary.main' }}>
                        Replying to {replyingTo.sender?.username || 'Former user'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                        {summarizeReplyBody(replyingTo.body)}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => setReplyingTo(null)} sx={{ p: 0.25 }}>
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                </Paper>
              )}

              <Stack direction="row" spacing={1}>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} multiple />
                <IconButton onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <CircularProgress size={24} /> : <AttachFileIcon />}
                </IconButton>

                <TextField
                  fullWidth
                  inputRef={textFieldRef}
                  placeholder={selectedConversation.type === 'group' ? 'Type a message... use @ to mention someone' : 'Type a message...'}
                  value={newMessage}
                  onChange={handleMessageInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  multiline
                  maxRows={4}
                  disabled={sending}
                />

                <IconButton
                  color="primary"
                  onClick={handleSendMessage}
                  disabled={sending || (!newMessage.trim() && attachments.length === 0)}
                >
                  {sending ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </Stack>
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
            <Typography variant="h6">{isMobile ? 'Select a conversation' : 'Select a conversation to start chatting'}</Typography>
          </Box>
        )}
      </Paper>

      {/* All pinned messages */}
      <Dialog open={pinnedDialogOpen} onClose={() => setPinnedDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pinned messages ({pinnedMessages.length})</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {pinnedMessages.map((m) => (
              <Paper key={m._id} variant="outlined" sx={{ p: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {m.sender?.username || 'Former user'} · sent {formatTeamChatTimestamp(m.messageDate)} · pinned {formatTeamChatTimestamp(m.pinnedAt)}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.body}
                    </Typography>
                  </Box>
                  <Button size="small" onClick={() => jumpToMessage(m._id)}>Go to</Button>
                  <IconButton size="small" title="Unpin" onClick={() => handleToggleMessagePin(m)}>
                    <PushPinIcon sx={{ fontSize: 16 }} color="warning" />
                  </IconButton>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPinnedDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* New Chat Dialog */}
      <Dialog open={newChatOpen} onClose={closeNewChatDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Start New Conversation</DialogTitle>
        <DialogContent>
          <ToggleButtonGroup
            value={newChatMode}
            exclusive
            onChange={(e, val) => val && setNewChatMode(val)}
            size="small"
            sx={{ mt: 1, mb: 2 }}
          >
            <ToggleButton value="dm">Direct Message</ToggleButton>
            <ToggleButton value="group">New Group</ToggleButton>
          </ToggleButtonGroup>

          {newChatMode === 'dm' && (
            <Button
              fullWidth
              variant="outlined"
              startIcon={<PersonIcon />}
              disabled={savingChat}
              onClick={() => startNewConversation(true)}
              sx={{ mb: 2, justifyContent: 'flex-start' }}
            >
              Message Yourself
            </Button>
          )}

          {newChatMode === 'dm' ? (
            <Autocomplete
              options={searchResults}
              getOptionLabel={(option) => `${option.username} (${option.role})`}
              loading={searchingUsers}
              onInputChange={(e, value) => {
                setSearchQuery(value);
                searchUsers(value, setSearchResults, setSearchingUsers);
              }}
              onChange={(e, value) => setSelectedUser(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search users"
                  placeholder="Type username..."
                  autoFocus
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  }}
                />
              )}
            />
          ) : (
            <Stack spacing={2}>
              <TextField
                label="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
                fullWidth
              />
              <Autocomplete
                multiple
                options={searchResults}
                value={groupMembers}
                getOptionLabel={(option) => `${option.username} (${option.role})`}
                loading={searchingUsers}
                onInputChange={(e, value) => {
                  setSearchQuery(value);
                  searchUsers(value, setSearchResults, setSearchingUsers);
                }}
                onChange={(e, value) => setGroupMembers(value)}
                renderInput={(params) => (
                  <TextField {...params} label="Add members" placeholder="Type username..." />
                )}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeNewChatDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => startNewConversation()}
            disabled={savingChat || (newChatMode === 'dm' ? !selectedUser : !groupName.trim() || groupMembers.length === 0)}
          >
            {savingChat ? <CircularProgress size={20} /> : (newChatMode === 'dm' ? 'Start Chat' : 'Create Group')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={membersDialogOpen} onClose={() => setMembersDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Group Members</DialogTitle>
        <DialogContent>
          <List dense>
            {selectedConversation?.participants?.map((p) => {
              if (!p?._id) return null;
              const isAdmin = isConvAdmin(selectedConversation, p._id);
              // Superadmin is protected: never demotable or removable by a group admin.
              const isProtected = p.role === 'superadmin';
              return (
                <ListItem
                  key={p._id}
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      {iAmGroupAdmin && !isProtected && (
                        isAdmin ? (
                          <IconButton
                            edge="end"
                            size="small"
                            disabled={membersBusy}
                            title="Dismiss as admin"
                            onClick={() => handleDemoteAdmin(p._id)}
                          >
                            <RemoveModeratorIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <IconButton
                            edge="end"
                            size="small"
                            disabled={membersBusy}
                            title="Make group admin"
                            onClick={() => handlePromoteAdmin(p._id)}
                          >
                            <AdminPanelSettingsIcon fontSize="small" />
                          </IconButton>
                        )
                      )}
                      {(iAmGroupAdmin || p._id === myId) && !(isProtected && p._id !== myId) && (
                        <IconButton edge="end" size="small" disabled={membersBusy} title="Remove from group" onClick={() => handleRemoveMember(p._id)}>
                          <PersonRemoveIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  }
                >
                  <ListItemAvatar><Avatar><PersonIcon /></Avatar></ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <span>{p.username}</span>
                        {isAdmin && <Chip label="Admin" size="small" color="primary" sx={{ height: 16, fontSize: '0.6rem' }} />}
                      </Stack>
                    }
                    secondary={p._id === myId ? `${p.role} (you)` : p.role}
                  />
                </ListItem>
              );
            })}
          </List>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Add members</Typography>
          <Autocomplete
            multiple
            options={addMemberResults}
            value={addMemberSelection}
            getOptionLabel={(option) => `${option.username} (${option.role})`}
            filterOptions={(opts) => opts.filter((o) => !selectedConversation?.participants?.some((p) => p._id === o._id))}
            onInputChange={(e, value) => {
              setAddMemberQuery(value);
              searchUsers(value, setAddMemberResults);
            }}
            onChange={(e, value) => setAddMemberSelection(value)}
            renderInput={(params) => <TextField {...params} placeholder="Type username..." />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMembersDialogOpen(false)}>Close</Button>
          <Button variant="contained" disabled={membersBusy || addMemberSelection.length === 0} onClick={handleAddMembers}>
            {membersBusy ? <CircularProgress size={20} /> : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
