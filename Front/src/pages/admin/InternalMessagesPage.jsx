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
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import RemoveModeratorIcon from '@mui/icons-material/RemoveModerator';
import api from '../../lib/api.js';
import { onSocketEvent } from '../../lib/socket.js';

function currentUserId() {
  return JSON.parse(localStorage.getItem('user') || 'null')?.id;
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

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Real-time: new messages / conversation changes via socket, with polling as a fallback safety-net
  useEffect(() => {
    const offNewMessage = onSocketEvent('new_message', (payload) => {
      if (selectedConversation && String(payload.conversationId) === String(selectedConversation.conversationId)) {
        setMessages((prev) => (prev.some((m) => m._id === payload.message._id) ? prev : [...prev, payload.message]));
        markConversationRead(payload.conversationId);
      }
      loadConversations();
    });
    const offConversationUpdated = onSocketEvent('conversation_updated', () => {
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // API Functions
  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const { data } = await api.get('/internal-messages/conversations');
      setConversations(data);
      // Keep the open conversation's participant list fresh (e.g. after add/remove)
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        const fresh = data.find((c) => String(c.conversationId) === String(prev.conversationId));
        return fresh || prev;
      });
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
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
      setMessages(data);
      markConversationRead(conversationId);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }

  async function handleConversationSelect(conversation) {
    setSelectedConversation(conversation);
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
        mentions: mentionIds
      });

      setMessages((prev) => [...prev, data]);
      resetDraft();
      loadConversations();
    } catch (err) {
      alert('Failed to send message: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
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

  async function startNewConversation() {
    setSavingChat(true);
    try {
      if (newChatMode === 'dm') {
        if (!selectedUser) return;
        const { data } = await api.post('/internal-messages/conversations/dm', { recipientId: selectedUser._id });
        await loadConversations();
        setSelectedConversation(data);
        await loadMessages(data.conversationId);
      } else {
        if (!groupName.trim() || groupMembers.length === 0) return;
        const { data } = await api.post('/internal-messages/conversations/group', {
          name: groupName.trim(),
          participantIds: groupMembers.map((u) => u._id)
        });
        await loadConversations();
        setSelectedConversation(data);
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
    const others = (selectedConversation.participants || []).filter((p) => p._id !== myId);
    if (!mentionQuery) return others;
    return others.filter((p) => p.username.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  }, [mentionQuery, selectedConversation, myId]);

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
      setSelectedConversation(data);
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
        setSelectedConversation(data);
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
      setSelectedConversation(data);
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
      setSelectedConversation(data);
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
                            {new Date(conv.lastMessageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                          </Typography>
                        )}
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

            {/* Messages Area */}
            <Box sx={{ flex: 1, p: 2, overflowY: 'auto', bgcolor: '#f0f2f5' }}>
              {loadingMessages ? (
                <Box display="flex" justifyContent="center" mt={4}>
                  <CircularProgress />
                </Box>
              ) : (
                <Stack spacing={2}>
                  {messages.length === 0 && (
                    <Alert severity="info">Start the conversation by typing a message below!</Alert>
                  )}

                  {messages.map((msg) => {
                    const isMe = msg.sender._id === myId;
                    const isGroup = selectedConversation.type === 'group';
                    return (
                      <Box
                        key={msg._id}
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
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: isMe ? 'right' : 'left' }}>
                          {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                        </Typography>
                      </Box>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </Stack>
              )}
            </Box>

            {/* Input Area */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: '#fff', position: 'relative' }}>
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
            onClick={startNewConversation}
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
