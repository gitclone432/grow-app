import { useEffect, useState, useRef } from 'react';
import {
  Box, Paper, Typography, List, ListItem, ListItemButton, ListItemText,
  Stack, CircularProgress, Chip, Divider, TextField, InputAdornment,
  Alert, Avatar, ListItemAvatar, IconButton, Button,
  useTheme, useMediaQuery
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PeopleIcon from '@mui/icons-material/People';
import MessageIcon from '@mui/icons-material/Message';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../lib/api.js';

export default function InternalMessagesAdminPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  // On tablet, keep sidebar closed when viewing a conversation
  useEffect(() => {
    if (isTablet && selectedConversation) {
      setSidebarOpen(false);
    }
  }, [isTablet, selectedConversation]);

  useEffect(() => {
    loadAllConversations();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadAllConversations();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  async function loadAllConversations() {
    setLoadingConversations(true);
    try {
      const { data } = await api.get('/internal-messages/admin/all-conversations', {
        params: { search: searchQuery }
      });
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadConversation(conversationId) {
    setLoadingMessages(true);
    try {
      const { data } = await api.get(`/internal-messages/admin/conversation/${conversationId}`);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleConversationSelect(conversation) {
    setSelectedConversation(conversation);
    // Close sidebar on mobile/tablet when a conversation is selected
    if (isMobile || isTablet) {
      setSidebarOpen(false);
    }
    await loadConversation(conversation.conversationId);
  }

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 2, bgcolor: '#f5f5f5' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <AdminPanelSettingsIcon sx={{ fontSize: 40, color: 'error.main' }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">
              Internal Messages - Admin Oversight
            </Typography>
            <Typography variant="body2" color="text.secondary">
              View all internal conversations between users (Read-Only)
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', md: 'row' },
        height: { xs: '100vh', md: '75vh' },
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
        
        {/* LEFT SIDEBAR: All Conversations */}
        <Paper sx={{ 
          width: { xs: '100%', sm: sidebarOpen ? '100%' : 0, md: 380 },
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
                <Typography variant="h6" sx={{ fontSize: '1rem' }}>All Conversations</Typography>
                <IconButton 
                  onClick={() => setSidebarOpen(false)}
                  size="small"
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            )}

            {!isMobile && <Typography variant="h6" sx={{ mb: 2 }}>All Conversations</Typography>}
            <TextField
              fullWidth
              size="small"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
          </Box>

          <List sx={{ overflow: 'auto', flex: 1 }}>
            {loadingConversations ? (
              <Box display="flex" justifyContent="center" mt={4}>
                <CircularProgress />
              </Box>
            ) : conversations.length === 0 ? (
              <Typography variant="caption" sx={{ p: 3, display: 'block', textAlign: 'center', color: 'text.secondary' }}>
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
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
                      <Avatar sx={{ bgcolor: 'secondary.main' }}>
                        <PeopleIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {conv.user1.username}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">↔</Typography>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {conv.user2.username}
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        <Stack spacing={0.5}>
                          <Stack direction="row" spacing={0.5}>
                            <Chip label={conv.user1.role} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                            <Chip label={conv.user2.role} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                          </Stack>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                              {conv.messageCount} messages
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(conv.lastMessageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                            </Typography>
                          </Stack>
                        </Stack>
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

        {/* RIGHT: Messages View (Read-Only) */}
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
              {/* Header */}
              <Box sx={{ p: 2, bgcolor: '#fff3e0', borderBottom: 1, borderColor: 'divider' }}>
                <Alert severity="warning" sx={{ mb: 1 }}>
                  <strong>Read-Only Mode:</strong> You are viewing this conversation as an administrator. You cannot send messages.
                </Alert>
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
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                      {selectedConversation.user1.username[0].toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {selectedConversation.user1.username}
                      </Typography>
                      <Chip 
                        label={selectedConversation.user1.role} 
                        size="small" 
                        sx={{ height: 18, fontSize: '0.65rem' }} 
                      />
                    </Box>
                  </Stack>

                  <Typography variant="h6" color="text.secondary">↔</Typography>

                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>
                      {selectedConversation.user2.username[0].toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {selectedConversation.user2.username}
                      </Typography>
                      <Chip 
                        label={selectedConversation.user2.role} 
                        size="small" 
                        sx={{ height: 18, fontSize: '0.65rem' }} 
                      />
                    </Box>
                  </Stack>

                  <Box sx={{ flex: 1 }} />

                  <Chip 
                    icon={<MessageIcon />}
                    label={`${selectedConversation.messageCount} messages`}
                    size="small"
                  />
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
                      <Alert severity="info">No messages in this conversation.</Alert>
                    )}

                    {messages.map((msg) => {
                      const isUser1 = msg.sender._id === selectedConversation.user1._id;
                      return (
                        <Box
                          key={msg._id}
                          sx={{
                            alignSelf: isUser1 ? 'flex-start' : 'flex-end',
                            maxWidth: { xs: '85%', sm: '75%', md: '70%' }
                          }}
                        >
                          <Stack spacing={0.5}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                              {msg.sender.username} ({msg.sender.role})
                            </Typography>
                            <Paper
                              elevation={1}
                              sx={{
                                p: 1.5,
                                bgcolor: isUser1 ? '#e3f2fd' : '#f3e5f5',
                                color: 'text.primary',
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
                                        icon={<MessageIcon />}
                                        label={fileName}
                                        onClick={() => window.open(url, '_blank')}
                                        size="small"
                                        sx={{ cursor: 'pointer' }}
                                      />
                                    );
                                  })}
                                </Box>
                              )}
                            </Paper>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ textAlign: isUser1 ? 'left' : 'right' }}
                            >
                              {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                            </Typography>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              {/* Stats Footer */}
              <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: '#f5f5f5' }}>
                <Stack direction="row" spacing={3}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Total Messages:</strong> {messages.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>First Message:</strong> {messages[0] ? new Date(messages[0].messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' PT' : 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Last Message:</strong> {messages[messages.length - 1] ? new Date(messages[messages.length - 1].messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' PT' : 'N/A'}
                  </Typography>
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
              <Stack alignItems="center" spacing={2}>
                <AdminPanelSettingsIcon sx={{ fontSize: 60 }} />
                <Typography variant="h6">Select a conversation to view messages</Typography>
              </Stack>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
