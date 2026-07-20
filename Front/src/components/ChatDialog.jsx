import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Button,
  TextField,
  Dialog,
  DialogContent,
  Divider,
  Link,
  useTheme,
  useMediaQuery,
  Menu,
  MenuItem,
  ListSubheader,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import SettingsIcon from '@mui/icons-material/Settings';
import api from '../lib/api';
import TemplateManagementModal from './TemplateManagementModal';
import { CHAT_TEMPLATES, personalizeTemplate } from '../constants/chatTemplates';

function ChatDialog({ open, onClose, order }) {
  const theme = useTheme();
  const isMobileChat = useMediaQuery(theme.breakpoints.down('sm'));

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollingInterval = useRef(null);

  // Load messages when dialog opens
  useEffect(() => {
    if (open && order) {
      loadMessages();
      startPolling();
    } else {
      stopPolling();
      setMessages([]);
      setNewMessage('');
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopPolling = () => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
  };

  const startPolling = () => {
    stopPolling();
    pollingInterval.current = setInterval(() => {
      if (order) {
        const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
        api.post('/ebay/sync-thread', {
          sellerId: order.seller?._id || order.seller,
          buyerUsername: order.buyer?.username,
          itemId: itemId
        }).then(res => {
          if (res.data.newMessagesFound) {
            loadMessages(false);
          }
        }).catch(err => console.error("Polling error", err));
      }
    }, 10000);
  };

  async function loadMessages(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const params = {};
      if (order.orderId) {
        params.orderId = order.orderId;
      } else {
        // Fallback for inquiry messages (no orderId)
        params.buyerUsername = order.buyer?.username;
        params.itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
      }
      
      const { data } = await api.get('/ebay/chat/messages', { params });
      setMessages(data || []);
    } catch (e) {
      console.error("Failed to load messages", e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
      const { data } = await api.post('/ebay/send-message', {
        orderId: order.orderId || null,
        buyerUsername: order.buyer?.username,
        itemId: itemId,
        body: newMessage,
        subject: order.orderId ? `Regarding Order #${order.orderId}` : 'Regarding your inquiry'
      });

      setMessages([...messages, data.message]);
      setNewMessage('');
    } catch (e) {
      alert('Failed to send: ' + (e.response?.data?.error || e.message));
    } finally {
      setSending(false);
    }
  }

  // Helper to safely extract data from the Order object
  const sellerName = order?.seller?.user?.username || 'Seller';
  const buyerName = order?.buyer?.buyerRegistrationAddress?.fullName || '-';
  const buyerUsername = order?.buyer?.username || '-';
  const itemId = order?.itemNumber || order?.lineItems?.[0]?.legacyItemId || '';
  let itemTitle = order?.productName || order?.lineItems?.[0]?.title || '';
  const itemCount = order?.lineItems?.length || 0;
  if (itemCount > 1) {
    itemTitle = `${itemTitle} (+ ${itemCount - 1} other${itemCount - 1 > 1 ? 's' : ''})`;
  }

  // --- TEMPLATE MENU STATE ---
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
  const [chatTemplates, setChatTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  // Load chat templates on mount
  useEffect(() => {
    loadChatTemplates();
  }, []);

  async function loadChatTemplates() {
    setTemplatesLoading(true);
    try {
      const { data } = await api.get('/chat-templates');
      if (data.templates && data.templates.length > 0) {
        setChatTemplates(data.templates);
      }
    } catch (e) {
      console.error('Failed to load chat templates:', e);
      // Fallback to hardcoded templates
      setChatTemplates(CHAT_TEMPLATES);
    } finally {
      setTemplatesLoading(false);
    }
  }

  const handleTemplateClick = (event) => {
    setTemplateAnchorEl(event.currentTarget);
  };

  const handleTemplateClose = () => {
    setTemplateAnchorEl(null);
  };

  const handleSelectTemplate = (templateText) => {
    const nameToUse = order?.shippingFullName || order?.buyer?.username || 'Buyer';
    const personalizedText = personalizeTemplate(templateText, nameToUse);

    setNewMessage(personalizedText);
    handleTemplateClose();
  };

  if (!order) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isMobileChat}
    >
      {/* --- HEADER (MATCHING BUYER CHAT PAGE) --- */}
      <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', position: 'relative' }}>

        {/* Top Right: Seller Chip & Close & Templates */}
        <Stack
          direction="column"
          spacing={1}
          alignItems="flex-end"
          sx={{ position: 'absolute', top: { xs: 8, sm: 12 }, right: { xs: 8, sm: 12 }, zIndex: 10 }}
        >
          <Stack direction="row" spacing={0.5} alignItems="center">
            {!isMobileChat && (
              <Chip
                label={sellerName}
                size="small"
                icon={<PersonIcon style={{ fontSize: 16 }} />}
                sx={{
                  bgcolor: '#e3f2fd',
                  color: '#1565c0',
                  fontWeight: 'bold',
                  height: 24,
                  fontSize: '0.75rem'
                }}
              />
            )}
            <IconButton onClick={onClose} size="small" sx={{ color: 'text.disabled' }}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Tooltip title="Choose a response template">
            <Button
              variant="outlined"
              size="small"
              onClick={handleTemplateClick}
              disabled={sending}
              sx={{
                minWidth: { xs: 'auto', sm: 100 },
                px: { xs: 1, sm: 2 },
                fontSize: { xs: '0.7rem', sm: '0.875rem' },
                bgcolor: 'white'
              }}
              endIcon={<ExpandMoreIcon />}
            >
              Templates
            </Button>
          </Tooltip>
        </Stack>

        {/* Main Content: Buyer & Item */}
        <Stack spacing={1} sx={{ pr: { xs: 6, sm: 12 } }}>

          {/* 1. Buyer Info */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={{ xs: 0.5, sm: 3 }}
            sx={{ mt: 0.5 }}
          >
            <Box>
              <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Buyer
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.1, fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                {buyerName}
              </Typography>
            </Box>

            {!isMobileChat && (
              <Divider orientation="vertical" flexItem sx={{ height: 20, alignSelf: 'center', opacity: 0.5 }} />
            )}

            <Box>
              <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Username
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.05)', px: 0.5, borderRadius: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                {buyerUsername}
              </Typography>
            </Box>
          </Stack>

          {/* 2. Item Link & Order ID */}
          <Box>
            {itemId && itemId !== 'DIRECT_MESSAGE' ? (
              <Link
                href={`https://www.ebay.com/itm/${itemId}`}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: 'primary.main',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                    display: '-webkit-box',
                    WebkitLineClamp: isMobileChat ? 1 : 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {itemTitle || `Item ID: ${itemId}`}
                </Typography>
                <OpenInNewIcon sx={{ fontSize: 14, color: 'primary.main', mt: 0.3, flexShrink: 0 }} />
              </Link>
            ) : (
              <Typography
                variant="subtitle2"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  fontSize: { xs: '0.8rem', sm: '0.875rem' },
                  mb: 0.5
                }}
              >
                {itemTitle || 'Direct Message'}
              </Typography>
            )}

            <Chip
              label={order?.orderId ? `Order: ${order.orderId}` : 'Inquiry Message'}
              size="small"
              variant="outlined"
              sx={{
                borderRadius: 1,
                height: 20,
                fontSize: '0.65rem',
                color: 'text.secondary',
                borderColor: 'divider',
                bgcolor: '#fafafa'
              }}
            />
          </Box>
        </Stack>
      </Box>

      {/* --- CHAT AREA (MATCHING BUYER CHAT PAGE) --- */}
      <DialogContent sx={{ p: 0, bgcolor: '#f0f2f5', height: { xs: 'calc(100vh - 180px)', sm: '500px' }, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
          {loading ? (
            <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2}>
              {messages.length === 0 && (
                <Alert severity="info" sx={{ mx: 'auto', width: 'fit-content' }}>
                  No messages yet. Start the conversation below!
                </Alert>
              )}

              {messages.map((msg) => (
                <Box
                  key={msg._id}
                  sx={{
                    alignSelf: msg.sender === 'SELLER' ? 'flex-end' : 'flex-start',
                    maxWidth: '70%'
                  }}
                >
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5,
                      bgcolor: msg.sender === 'SELLER' ? '#1976d2' : '#ffffff',
                      color: msg.sender === 'SELLER' ? '#fff' : 'text.primary',
                      borderRadius: 2,
                      position: 'relative'
                    }}
                  >
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{msg.body}</Typography>

                    {/* Images */}
                    {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {msg.mediaUrls.map((url, idx) => (
                          <Box
                            key={idx}
                            component="img"
                            src={url}
                            alt="Attachment"
                            sx={{
                              width: 100,
                              height: 100,
                              objectFit: 'cover',
                              borderRadius: 1,
                              cursor: 'pointer',
                              border: '1px solid #ccc'
                            }}
                            onClick={() => window.open(url, '_blank')}
                          />
                        ))}
                      </Box>
                    )}
                  </Paper>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: msg.sender === 'SELLER' ? 'right' : 'left', fontSize: '0.7rem' }}>
                    {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                    {msg.sender === 'SELLER' && (msg.read ? ' • Read' : ' • Sent')}
                  </Typography>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Stack>
          )}
        </Box>

        {/* --- INPUT AREA --- */}
        <Box sx={{ p: { xs: 1, sm: 2 }, bgcolor: '#fff', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            maxRows={3}
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
            size="small"
            sx={{
              '& .MuiInputBase-input': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
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
          <Button
            variant="contained"
            sx={{ px: { xs: 2, sm: 3 }, minWidth: { xs: 'auto', sm: 80 } }}
            endIcon={!isMobileChat && (sending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />)}
            onClick={handleSendMessage}
            disabled={sending || !newMessage.trim()}
          >
            {isMobileChat ? <SendIcon /> : 'Send'}
          </Button>
        </Box>
      </DialogContent>

      {/* Template Management Modal */}
      <TemplateManagementModal
        open={manageTemplatesOpen}
        onClose={() => {
          setManageTemplatesOpen(false);
          loadChatTemplates();
        }}
      />
    </Dialog>
  );
}

export default ChatDialog;
