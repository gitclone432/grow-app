import { useEffect, useState, useRef } from 'react';
import {
  Box, Paper, Typography, List, ListItem, ListItemButton, ListItemText, ListItemAvatar,
  Avatar, TextField, IconButton, Stack, CircularProgress, Badge, Divider, Chip,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Alert,
  useTheme, useMediaQuery
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../lib/api.js';

export default function InternalMessagesPage() {
  // State
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // New conversation dialog
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // File attachments
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Refs
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // Responsive hooks (match BuyerChatPage behavior)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600px - 960px
  const isDesktop = !isMobile && !isTablet;
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const prevIsDesktopRef = useRef(null);

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

  // Polling for new messages
  useEffect(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    if (selectedConversation) {
      pollingIntervalRef.current = setInterval(() => {
        loadMessages(selectedConversation.conversationId, false);
      }, 10000); // Poll every 10 seconds
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
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId, showLoading = true) {
    if (showLoading) setLoadingMessages(true);
    try {
      const { data } = await api.get(`/internal-messages/messages/${conversationId}`);
      setMessages(data);
      
      // Update conversation unread count
      setConversations(prev =>
        prev.map(conv =>
          conv.conversationId === conversationId
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }

  async function handleConversationSelect(conversation) {
    setSelectedConversation(conversation);
    // Close sidebar on mobile and tablet when conversation is selected
    if (isMobile || isTablet) {
      setSidebarOpen(false);
    }
    await loadMessages(conversation.conversationId);
  }

  async function handleSendMessage() {
    if (!newMessage.trim() && attachments.length === 0) return;
    if (!selectedConversation) return;

    setSending(true);
    try {
      const { data } = await api.post('/internal-messages/send', {
        recipientId: selectedConversation.otherUser._id,
        body: newMessage,
        mediaUrls: attachments.map(a => a.url)
      });

      setMessages([...messages, data]);
      setNewMessage('');
      setAttachments([]);
      
      // Refresh conversations list to update "last message"
      loadConversations();
    } catch (err) {
      alert('Failed to send message: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  }

  async function searchUsers(query) {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const { data } = await api.get('/internal-messages/search-users', {
        params: { q: query }
      });
      setSearchResults(data);
    } catch (err) {
      console.error('Failed to search users:', err);
    } finally {
      setSearchingUsers(false);
    }
  }

  async function startNewConversation() {
    if (!selectedUser) return;

    // Check if conversation already exists
    const existingConv = conversations.find(
      conv => conv.otherUser._id === selectedUser._id
    );

    if (existingConv) {
      // Select existing conversation
      setSelectedConversation(existingConv);
      await loadMessages(existingConv.conversationId);
      setNewChatOpen(false);
      setSelectedUser(null);
      setSearchQuery('');
      return;
    }

    // Create new conversation (virtual)
    const newConv = {
      conversationId: null, // Will be created on first message
      otherUser: selectedUser,
      lastMessage: null,
      lastMessageDate: null,
      unreadCount: 0,
      isNew: true
    };

    setSelectedConversation(newConv);
    setMessages([]);
    setNewChatOpen(false);
    setSelectedUser(null);
    setSearchQuery('');
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const uploadedFiles = data.urls.map((url, idx) => ({
        name: files[idx].name,
        url: url
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
          {/* Mobile & Tablet: Close button */}
          {(isMobile || isTablet) && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6" sx={{ fontSize: '1rem' }}>Team Chat</Typography>
              <IconButton 
                onClick={() => setSidebarOpen(false)}
                size="small"
              >
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
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <PersonIcon />
                      </Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="subtitle2" noWrap sx={{ maxWidth: 140, fontWeight: 'bold' }}>
                          {conv.otherUser.username}
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
                        <Chip label={conv.otherUser.role} size="small" sx={{ height: 18, fontSize: '0.7rem', mb: 0.5 }} />
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
          <Button
            fullWidth
            variant="contained"
            onClick={() => setSidebarOpen(true)}
          >
            View Conversations
          </Button>
        </Box>
      )}

      {/* RIGHT: Chat Area */}
      <Paper sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        width: { xs: '100%', md: 'auto' },
        height: { xs: '100vh', md: '100%' },
        minWidth: 0
      }}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <Box sx={{ p: { xs: 1.5, md: 2 }, bgcolor: '#f5f5f5', borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                {/* Mobile & Tablet: Back button */}
                {(isMobile || isTablet) && (
                  <IconButton
                    onClick={() => {
                      setSelectedConversation(null);
                      setSidebarOpen(true);
                    }}
                    size="small"
                  >
                    <CloseIcon />
                  </IconButton>
                )}
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <PersonIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {selectedConversation.otherUser.username}
                  </Typography>
                  <Chip 
                    label={selectedConversation.otherUser.role} 
                    size="small" 
                    sx={{ height: 20, fontSize: '0.7rem' }} 
                  />
                </Box>
                {selectedConversation.isNew && (
                  <Chip label="New Conversation" size="small" color="success" />
                )}
              </Stack>
            </Box>

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
                    const isMe = msg.sender._id === JSON.parse(localStorage.getItem('user'))?.id;
                    return (
                      <Box
                        key={msg._id}
                        sx={{
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          maxWidth: { xs: '85%', sm: '75%', md: '70%' }
                        }}
                      >
                        <Paper
                          elevation={1}
                          sx={{
                            p: 1.5,
                            bgcolor: isMe ? '#1976d2' : '#ffffff',
                            color: isMe ? '#fff' : 'text.primary',
                            borderRadius: 2
                          }}
                        >
                          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                            {msg.body}
                          </Typography>

                          {/* Attachments */}
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
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mt: 0.5, textAlign: isMe ? 'right' : 'left' }}
                        >
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
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: '#fff' }}>
              {/* Attachment Previews */}
              {attachments.length > 0 && (
                <Box sx={{ mb: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {attachments.map((file, idx) => (
                    <Chip
                      key={idx}
                      label={file.name}
                      onDelete={() => handleRemoveAttachment(idx)}
                      size="small"
                    />
                  ))}
                </Box>
              )}

              <Stack direction="row" spacing={1}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                  multiple
                />
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <CircularProgress size={24} /> : <AttachFileIcon />}
                </IconButton>

                <TextField
                  fullWidth
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary'
            }}
          >
            <Typography variant="h6">{isMobile ? 'Select a conversation' : 'Select a conversation to start chatting'}</Typography>
          </Box>
        )}
      </Paper>

      {/* New Chat Dialog */}
      <Dialog open={newChatOpen} onClose={() => setNewChatOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Start New Conversation</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={searchResults}
            getOptionLabel={(option) => `${option.username} (${option.role})`}
            loading={searchingUsers}
            onInputChange={(e, value) => {
              setSearchQuery(value);
              searchUsers(value);
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
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewChatOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={startNewConversation}
            disabled={!selectedUser}
          >
            Start Chat
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
