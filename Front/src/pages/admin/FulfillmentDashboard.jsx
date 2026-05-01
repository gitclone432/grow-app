import React, { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
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

import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';


import ChatIcon from '@mui/icons-material/Chat';

import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

import PersonIcon from '@mui/icons-material/Person'; // <--- Add this
import OpenInNewIcon from '@mui/icons-material/OpenInNew'; // <--- Add this
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import SyncIcon from '@mui/icons-material/Sync';


import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

import ColumnSelector from '../../components/ColumnSelector';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import api from '../../lib/api';
import { publishOrderSyncEvent, subscribeOrderSyncEvent } from '../../lib/orderSyncEvents';
import TemplateManagementModal from '../../components/TemplateManagementModal';
import { CHAT_TEMPLATES, personalizeTemplate } from '../../constants/chatTemplates';
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

// --- NEW COMPONENT: Chat Dialog (Visual Match with BuyerChatPage) ---
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
      const { data } = await api.get('/ebay/chat/messages', {
        params: { orderId: order.orderId }
      });
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
        orderId: order.orderId,
        buyerUsername: order.buyer?.username,
        itemId: itemId,
        body: newMessage,
        subject: `Regarding Order #${order.orderId}`
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
    const nameToUse = order.shippingFullName || order.buyer?.username || 'Buyer';
    const personalizedText = personalizeTemplate(templateText, nameToUse);

    setNewMessage(personalizedText);
    handleTemplateClose();
  };

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

            <Chip
              label={`Order: ${order?.orderId || order?.legacyOrderId || 'N/A'}`}
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
                    maxWidth: '70%' // Constrain width like Buyer Chat
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

// --- EARNINGS HELPER ---
// Returns the stored orderEarnings value directly (calculated backend-side as totalDueSeller.value - adFeeGeneral)
function getOrderEarnings(order) {
  if (order.orderEarnings === null || order.orderEarnings === undefined) return null;
  return order.orderEarnings;
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

// --- MOBILE ORDER CARD COMPONENT ---
function MobileOrderCard({ order, index, onCopy, onMessage, onViewImages, formatCurrency, thumbnailImages }) {
  const [expanded, setExpanded] = useState(false);

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
                label={order.cancelState === 'CANCELED' ? 'Canceled' : 'Cancel Req'}
                size="small"
                color={order.cancelState === 'CANCELED' ? 'error' : 'warning'}
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            )}
          </Stack>
        </Stack>

        {/* Product with thumbnail */}
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {thumbnailImages[order._id] && (
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
                src={thumbnailImages[order._id]}
                alt="Product"
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
              {formatCurrency(getOrderEarnings(order))}
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
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{formatCurrency(order.subtotal)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Shipping</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{formatCurrency(order.shipping)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Transaction Fees</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'error.main' }}>
                  {formatCurrency(order.transactionFees)}
                </Typography>
              </Box>
              {order.adFeeGeneral > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Ad Fees</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'error.main' }}>
                    {formatCurrency(order.adFeeGeneral)}
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
            <IconButton size="small" color="primary" onClick={() => onMessage(order)} title="Message Buyer">
              <ChatIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}

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
const HEADER_CELL_SX = { backgroundColor: 'primary.main', color: 'white', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 100 };
const HEADER_CELL_RIGHT_SX = { ...HEADER_CELL_SX, textAlign: 'right' };
const getOrderSku = (order) => {
  if (!order) return '';
  if (order.sku) return String(order.sku);
  if (Array.isArray(order.lineItems)) {
    const skuFromLine = order.lineItems.find((item) => item?.sku)?.sku;
    if (skuFromLine) return String(skuFromLine);
  }
  return '';
};

const createEmptyDateFilter = () => ({ mode: 'none', single: '', from: '', to: '' });
const normalizeDateFilter = (value) => (
  value && typeof value === 'object'
    ? { ...createEmptyDateFilter(), ...value }
    : createEmptyDateFilter()
);

const SearchFiltersPanel = memo(function SearchFiltersPanel({
  searchOrderId, setSearchOrderId,
  searchAzOrderId, setSearchAzOrderId,
  searchBuyerName, setSearchBuyerName,
  searchItemId, setSearchItemId,
  searchProductName, setSearchProductName,
  setSearchPaymentStatus,
  dateFilter, setDateFilter,
  isSmallMobile,
}) {
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

  // Local state for all filter inputs — typing/changing only re-renders this small component.
  // Values are pushed to parent only when the user clicks Search (or presses Enter).
  const [localOrderId, setLocalOrderId] = useState(searchOrderId);
  const [localAzOrderId, setLocalAzOrderId] = useState(searchAzOrderId);
  const [localBuyerName, setLocalBuyerName] = useState(searchBuyerName);
  const [localItemId, setLocalItemId] = useState(searchItemId);
  const [localProductName, setLocalProductName] = useState(searchProductName);
  const [localDateFilter, setLocalDateFilter] = useState(() => normalizeDateFilter(dateFilter));

  // Sync local state when parent resets externally (e.g. Clear button calling parent setters).
  useEffect(() => { setLocalOrderId(searchOrderId); }, [searchOrderId]);
  useEffect(() => { setLocalAzOrderId(searchAzOrderId); }, [searchAzOrderId]);
  useEffect(() => { setLocalBuyerName(searchBuyerName); }, [searchBuyerName]);
  useEffect(() => { setLocalItemId(searchItemId); }, [searchItemId]);
  useEffect(() => { setLocalProductName(searchProductName); }, [searchProductName]);
  useEffect(() => { setLocalDateFilter(normalizeDateFilter(dateFilter)); }, [dateFilter]);

  // Push all local values to parent → triggers the API fetch in parent's filter useEffect.
  const handleSearch = () => {
    setSearchOrderId(localOrderId);
    setSearchAzOrderId(localAzOrderId);
    setSearchBuyerName(localBuyerName);
    setSearchItemId(localItemId);
    setSearchProductName(localProductName);
    setDateFilter(normalizeDateFilter(localDateFilter));
  };

  const handleClear = () => {
    const clearedDateFilter = createEmptyDateFilter();

    setLocalOrderId('');
    setLocalAzOrderId('');
    setLocalBuyerName('');
    setLocalItemId('');
    setLocalProductName('');
    setLocalDateFilter(clearedDateFilter);

    setSearchOrderId('');
    setSearchAzOrderId('');
    setSearchBuyerName('');
    setSearchItemId('');
    setSearchProductName('');
    setDateFilter(clearedDateFilter);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };

  return (
    <Box sx={{ mt: { xs: 1.5, sm: 2 }, p: { xs: 1.5, sm: 2 }, backgroundColor: 'action.hover', borderRadius: 1 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setFiltersExpanded(prev => !prev)}
      >
        <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
          Search Filters
        </Typography>
        <IconButton size="small">
          {filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={filtersExpanded}>
        <Stack spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 1.5 }}>
          {/* Row 1: Text searches */}
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
              label="Product Name"
              value={localProductName}
              onChange={(e) => setLocalProductName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by product name..."
              sx={{ flex: 1 }}
              fullWidth
            />
          </Stack>

          {/* Row 2: Date filters */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
            {/* DATE MODE SELECTOR */}
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 130 } }}>
              <InputLabel id="date-mode-label">Date Mode</InputLabel>
              <Select
                labelId="date-mode-label"
                value={localDateFilter.mode}
                label="Date Mode"
                onChange={(e) => setLocalDateFilter(prev => ({ ...prev, mode: e.target.value }))}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="single">Single Day</MenuItem>
                <MenuItem value="range">Date Range</MenuItem>
              </Select>
            </FormControl>

            {/* SINGLE DATE INPUT */}
            {localDateFilter.mode === 'single' && (
              <TextField
                size="small"
                label="Date"
                type="date"
                value={localDateFilter.single}
                onChange={(e) => setLocalDateFilter(prev => ({ ...prev, single: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: '100%', sm: 150 } }}
              />
            )}

            {/* RANGE INPUTS */}
            {localDateFilter.mode === 'range' && (
              <Stack direction="row" spacing={1} sx={{ flex: { xs: 1, sm: 'none' } }}>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={localDateFilter.from}
                  onChange={(e) => setLocalDateFilter(prev => ({ ...prev, from: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: '50%', sm: 150 } }}
                />
                <TextField
                  size="small"
                  label="To"
                  type="date"
                  value={localDateFilter.to}
                  onChange={(e) => setLocalDateFilter(prev => ({ ...prev, to: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: '50%', sm: 150 } }}
                />
              </Stack>
            )}

            {/* SEARCH BUTTON */}
            <Button
              size="small"
              variant="contained"
              onClick={handleSearch}
              startIcon={<SearchIcon />}
              sx={{ minWidth: { xs: '100%', sm: 90 }, height: 40, boxSizing: 'border-box' }}
            >
              Search
            </Button>

            {/* CLEAR BUTTON — resets local + parent filters so the unfiltered list reloads immediately */}
            <Button
              size="small"
              variant="outlined"
              onClick={handleClear}
              sx={{ minWidth: { xs: '100%', sm: 80 }, height: 40, boxSizing: 'border-box' }}
            >
              Clear
            </Button>
          </Stack>
        </Stack>
      </Collapse>
    </Box>
  );
});

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
  const [thumbnailImages, setThumbnailImages] = useState({}); // { orderId: imageUrl }
  const [loadingThumbnails, setLoadingThumbnails] = useState({}); // { orderId: boolean }
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
  const [searchOrderId, setSearchOrderId] = useState(() => getInitialState('searchOrderId', ''));
  const [searchAzOrderId, setSearchAzOrderId] = useState(() => getInitialState('searchAzOrderId', ''));
  const [searchBuyerName, setSearchBuyerName] = useState(() => getInitialState('searchBuyerName', ''));
  const [searchItemId, setSearchItemId] = useState(() => getInitialState('searchItemId', ''));
  const [searchProductName, setSearchProductName] = useState(() => getInitialState('searchProductName', ''));
  //const [searchSoldDate, setSearchSoldDate] = useState('');
  const [searchMarketplace, setSearchMarketplace] = useState(() => getInitialState('searchMarketplace', ''));
  const [searchPaymentStatus, setSearchPaymentStatus] = useState(() => getInitialState('searchPaymentStatus', ''));
  const [excludeClient, setExcludeClient] = useState(() => getInitialState('excludeClient', true));
  const [excludeLowValue, setExcludeLowValue] = useState(() => getInitialState('excludeLowValue', true));
  const [missingAmazonAccount, setMissingAmazonAccount] = useState(() => getInitialState('missingAmazonAccount', false));
  const [dateFilter, setDateFilter] = useState(() => getInitialState('dateFilter', ''));

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
  const [fetchingAdFeeGeneral, setFetchingAdFeeGeneral] = useState({});

  // Auto-message state
  const [autoMessageLoading, setAutoMessageLoading] = useState(false);
  const [autoMessageStats, setAutoMessageStats] = useState(null);

  // Resync window state
  const [resyncDays, setResyncDays] = useState(10);

  // Editing item status
  const [editingItemStatus, setEditingItemStatus] = useState({});

  // Remark message confirmation state
  const [remarkConfirmOpen, setRemarkConfirmOpen] = useState(false);
  const [pendingRemarkUpdate, setPendingRemarkUpdate] = useState(null);
  const [sendingRemarkMessage, setSendingRemarkMessage] = useState(false);
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
  // selectedExportColumns is initialized after ALL_COLUMNS is defined

  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');
  const [snackbarOrderIds, setSnackbarOrderIds] = useState([]); // Store order IDs for copying
  const [updatedOrderDetails, setUpdatedOrderDetails] = useState([]); // Store { orderId, changedFields }

  // Editing order earnings
  // (orderEarnings is now read-only, calculated server-side as totalDueSeller - adFeeGeneral)

  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

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
    'seller', 'orderId', 'dateSold', 'shipBy', 'deliveryDate', 'productName', 'sku', 'itemCategory', 'buyerNote',
    'buyerName', 'shippingAddress', 'marketplace', 'subtotal',
    'shipping', 'salesTax', 'discount', 'transactionFees',
    'adFeeGeneral', 'cancelStatus', 'refunds', 'orderEarnings', 'trackingNumber',
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
    { id: 'cancelStatus', label: 'Cancel Status' },
    { id: 'refunds', label: 'Refunds' },
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
    // Merge any newly added default columns that aren't in the cached list yet
    const missing = DEFAULT_VISIBLE_COLUMNS.filter(col => !stored.includes(col));
    return missing.length > 0 ? [...stored, ...missing] : stored;
  });

  // Convert to Set for O(1) lookups instead of O(n) .includes() per column per row
  const visibleColumnsSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const templates = await loadRemarkTemplates();
      if (mounted) setRemarkTemplates(templates);
    };
    load();
    return () => {
      mounted = false;
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

      // Then send the auto-message
      const messageSent = await sendAutoMessageForRemark(order, remarkValue);

      if (messageSent) {
        setSnackbarMsg(`Remark updated to "${remarkValue}" and message sent to buyer`);
        setSnackbarSeverity('success');
      }
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
      // Show confirmation dialog
      setPendingRemarkUpdate({ orderId, remarkValue, order });
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

  // Track previous filter values to detect changes
  const prevFilters = useRef({
    selectedSeller,
    searchOrderId,
    searchAzOrderId,
    searchBuyerName,
    searchItemId,
    searchProductName,
    searchMarketplace,
    searchPaymentStatus,
    excludeClient,
    excludeLowValue,
    missingAmazonAccount,
    dateFilter
  });

  // Fetch amazon accounts, CRP data, and issues index once on mount
  useEffect(() => {
    if (!hasFetchedInitialData.current) {
      api.get('/amazon-accounts').then(({ data }) => setAmazonAccounts(data || [])).catch(console.error);
      api.get('/credit-cards').then(({ data }) => setCreditCards(data || [])).catch(console.error);

      loadResolutionOptions();
    }
    // Issues index is always fetched fresh (independent of hasFetchedInitialData)
    api.get('/ebay/issues-by-order').then(({ data }) => setIssuesIndex(data?.index || {})).catch(console.error);
  }, [loadResolutionOptions]);

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
      prev.searchProductName !== searchProductName ||
      prev.selectedSeller !== selectedSeller ||
      prev.searchMarketplace !== searchMarketplace ||
      prev.searchPaymentStatus !== searchPaymentStatus ||
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
      searchProductName,
      searchMarketplace,
      searchPaymentStatus,
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
  }, [selectedSeller, searchOrderId, searchAzOrderId, searchBuyerName, searchItemId, searchProductName, searchMarketplace, searchPaymentStatus, excludeClient, excludeLowValue, missingAmazonAccount, dateFilter]);

  // orderEarnings is now read-only (auto-calculated server-side)
  // No manual editing handlers needed

  async function fetchSellers() {
    setError('');
    try {
      const { data } = await api.get('/sellers/all-unfiltered');
      setSellers(data || []);
    } catch (e) {
      setError('Failed to load sellers');
    }
  }

  async function loadStoredOrders() {
    setLoading(true);
    setError('');

    try {
      const params = {
        page: currentPage,
        limit: ordersPerPage
      };

      if (selectedSeller) params.sellerId = selectedSeller;
      if (searchProductName.trim()) params.productName = searchProductName.trim();
      if (searchOrderId.trim()) params.searchOrderId = searchOrderId.trim();
      if (searchAzOrderId.trim()) params.searchAzOrderId = searchAzOrderId.trim();
      if (searchBuyerName.trim()) params.searchBuyerName = searchBuyerName.trim();
      if (searchItemId.trim()) params.searchItemId = searchItemId.trim();
      if (searchMarketplace) params.searchMarketplace = searchMarketplace;
      if (searchPaymentStatus) params.paymentStatus = searchPaymentStatus;
      params.excludeClient = excludeClient;
      params.excludeLowValue = excludeLowValue;
      params.missingAmazonAccount = missingAmazonAccount;

      // --- NEW DATE LOGIC START ---
      if (dateFilter.mode === 'single' && dateFilter.single) {
        // For single day, start and end are the same day
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }
      // --- NEW DATE LOGIC END ---

      const { data } = await api.get('/ebay/stored-orders', { params });
      setOrders(data?.orders || []);

      // Update pagination metadata
      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalOrders(data.pagination.totalOrders);
      }
    } catch (e) {
      setOrders([]);
      setError(e?.response?.data?.error || 'Failed to load orders');
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



  // Function to fetch ONLY thumbnail (first image) for display
  const fetchThumbnail = async (order) => {
    const orderId = order._id;
    const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
    const sellerId = order.seller?._id || order.seller;

    if (!itemId || !sellerId || thumbnailImages[orderId]) {
      return; // Skip if no item ID, no seller, or already loaded
    }

    setLoadingThumbnails(prev => ({ ...prev, [orderId]: true }));

    try {
      const { data } = await api.get(`/ebay/item-images/${itemId}?sellerId=${sellerId}&thumbnail=true`);
      if (data.images && data.images.length > 0) {
        setThumbnailImages(prev => ({ ...prev, [orderId]: data.images[0] }));
        // Store the total count so we know if there are more images
        if (data.total > 1) {
          setItemImages(prev => ({ ...prev, [orderId]: { count: data.total } }));
        }
      }
    } catch (error) {
      console.error('Error fetching thumbnail:', error);
    } finally {
      setLoadingThumbnails(prev => ({ ...prev, [orderId]: false }));
    }
  };

  // Function to fetch ALL images when user clicks (only called on demand)
  const fetchAllImages = async (order) => {
    const orderId = order._id;
    const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
    const sellerId = order.seller?._id || order.seller;

    // If we already have all images, just use them
    if (itemImages[orderId]?.images) {
      return itemImages[orderId].images;
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
  };

  // Fetch thumbnails for visible orders when they load
  useEffect(() => {
    if (orders.length > 0) {
      orders.forEach(order => {
        fetchThumbnail(order);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Function to open image viewer (fetches all images on demand)
  const handleViewImages = async (order) => {
    const allImages = await fetchAllImages(order);

    if (allImages.length > 0) {
      setSelectedImages(allImages);
      setImageCount(allImages.length);
      setImageDialogOpen(true);
    }
  };

  const handleOpenMessageDialog = useCallback((order) => {
    setSelectedOrderForMessage(order);
    setMessageBody('');
    setMessageModalOpen(true);
  }, []);

  const handleCloseMessageDialog = () => {
    setMessageModalOpen(false);
    setSelectedOrderForMessage(null);
  };

  const handleSendMessage = async () => {
    if (!messageBody.trim() || !selectedOrderForMessage) return;

    setSendingMessage(true);
    try {
      // Use the same endpoint as the BuyerChatPage
      await api.post('/ebay/send-message', {
        orderId: selectedOrderForMessage.orderId,
        buyerUsername: selectedOrderForMessage.buyer?.username,
        // Fallback for item ID if lineItems is missing
        itemId: selectedOrderForMessage.itemNumber || selectedOrderForMessage.lineItems?.[0]?.legacyItemId,
        body: messageBody,
        subject: `Regarding Order #${selectedOrderForMessage.orderId}`
      });

      setSnackbarMsg('Message sent successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // Auto update status to "Ongoing Conversation"
      updateMessagingStatus(selectedOrderForMessage._id, 'Ongoing Conversation');

      handleCloseMessageDialog();
    } catch (e) {
      setSnackbarMsg('Failed to send message: ' + (e.response?.data?.error || e.message));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setSendingMessage(false);
    }
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

  // Poll for NEW orders only
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

      if (data && data.totalNewOrders > 0) {
        // Build summary by seller (don't show individual order IDs)
        const sellerSummary = data.pollResults
          .filter(r => r.success && r.newOrders && r.newOrders.length > 0)
          .map(r => `${r.sellerName}: ${r.newOrders.length} new order${r.newOrders.length > 1 ? 's' : ''}`)
          .join('\n');

        setSnackbarMsg(`Found ${data.totalNewOrders} new order${data.totalNewOrders > 1 ? 's' : ''}!\n\n${sellerSummary}`);
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        setSnackbarMsg('No new orders found.');
        setSnackbarSeverity('info');
        setSnackbarOpen(true);
      }
      publishOrderSyncEvent('FulfillmentDashboard', 'poll-new-orders');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to poll new orders');
    } finally {
      setLoading(false);
    }
  }

  // Poll for order UPDATES only
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

      if (data && data.totalUpdatedOrders > 0) {
        // Collect all updated order details (orderId + changedFields)
        const updatedDetails = data.pollResults
          .filter(r => r.success && r.updatedOrders && r.updatedOrders.length > 0)
          .flatMap(r => r.updatedOrders); // Each is { orderId, changedFields }

        const orderIds = updatedDetails.map(u => u.orderId);
        setSnackbarOrderIds(orderIds);
        setUpdatedOrderDetails(updatedDetails); // Store full details
        setSnackbarMsg(
          `Updated ${data.totalUpdatedOrders} order${data.totalUpdatedOrders > 1 ? 's' : ''}!`
        );
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        setSnackbarOrderIds([]);
        setUpdatedOrderDetails([]);
        setSnackbarMsg('No order updates found.');
        setSnackbarSeverity('info');
        setSnackbarOpen(true);
      }
      publishOrderSyncEvent('FulfillmentDashboard', 'poll-order-updates');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to poll order updates');
    } finally {
      setLoading(false);
    }
  }

  // Resync recent orders (last 10 days) - catches silent eBay changes
  async function resyncRecent() {
    setLoading(true);
    setError('');
    setPollResults(null);
    setSnackbarOrderIds([]);
    setUpdatedOrderDetails([]);
    setUpdatedOrderDetails([]);
    try {
      const { data } = await api.post('/ebay/resync-recent', { days: resyncDays });
      setPollResults(data || null);

      // Reset filters to show all sellers and go to page 1
      setSelectedSeller('');
      setCurrentPage(1);

      // Reload orders with reset filters
      await loadStoredOrders();

      if (data && (data.totalUpdated > 0 || data.totalNew > 0)) {
        // Collect updated order details
        const updatedDetails = data.pollResults
          .filter(r => r.success && r.updatedOrders && r.updatedOrders.length > 0)
          .flatMap(r => r.updatedOrders);

        const newOrderIds = data.pollResults
          .filter(r => r.success && r.newOrders && r.newOrders.length > 0)
          .flatMap(r => r.newOrders);

        const orderIds = [
          ...newOrderIds,
          ...updatedDetails.map(u => u.orderId)
        ];
        setSnackbarOrderIds(orderIds);
        setUpdatedOrderDetails(updatedDetails);

        setSnackbarMsg(
          `Resync Complete! Updated: ${data.totalUpdated}, New: ${data.totalNew}`
        );
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else if (data) {
        setSnackbarMsg('Resync Complete! All orders are up to date.');
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

      setSnackbarMsg(`Ad fee updated for ${order.orderId}`);
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

  // Recalculate Earnings for all orders of selected seller
  const recalculateEarnings = async () => {
    const SINCE_DATE = '2026-02-28';
    const scopeMsg = selectedSeller
      ? `seller "${sellers.find(s => s._id === selectedSeller)?.user?.username || selectedSeller}"`
      : 'ALL sellers';

    const confirmed = window.confirm(
      `This will recalculate orderEarnings for ${scopeMsg}, orders on/after ${SINCE_DATE}, across ALL marketplaces.\n\n` +
      'Formula: totalDueSeller.value − adFeeGeneral\n\n' +
      '• FULLY_REFUNDED → $0\n' +
      '• PARTIALLY_REFUNDED → skipped (enter manually)\n' +
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
  const formatDate = (dateStr, marketplaceId) => {
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

      return (
        <Stack spacing={0}>
          <Typography variant="body2">{formattedDate}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {formattedTime} ({timeZoneLabel})
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


  const formatCurrency = useCallback((value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (Number.isNaN(num)) return '-';
    return `$${num.toFixed(2)}`;
  }, []);

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

    const formatCurrency = (value) => {
      if (value == null || value === '') return '-';
      const num = parseFloat(value);
      return isNaN(num) ? '-' : `$${num.toFixed(2)}`;
    };

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
              <Typography fontWeight="medium">{formatCurrency(order.subtotal)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Shipping</Typography>
              <Typography fontWeight="medium">{formatCurrency(order.shipping)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Sales tax*</Typography>
              <Typography fontWeight="medium">{formatCurrency(order.salesTax)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Discount</Typography>
              <Typography fontWeight="medium" color="success.main">{formatCurrency(order.discount)}</Typography>
            </Box>
            {order.refundTotalToBuyerUSD > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>Refund</Typography>
                <Typography fontWeight="medium" color="error.main">-{formatCurrency(order.refundTotalToBuyerUSD || order.refundTotalToBuyer)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography fontWeight="bold">Order total**</Typography>
              <Typography fontWeight="bold">{formatCurrency(order.orderTotalAfterRefund)}</Typography>
            </Box>
          </Stack>

          {/* What You Earned */}
          <Typography variant="h6" sx={{ mb: 2, color: 'success.main' }}>
            What you earned
          </Typography>
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Order total</Typography>
              <Typography fontWeight="medium">{formatCurrency(order.orderTotalAfterRefund)}</Typography>
            </Box>
            {order.ebayPaidTaxRefundUSD > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>Refund (eBay paid)</Typography>
                <Typography fontWeight="medium" color="success.main">{formatCurrency(order.ebayPaidTaxRefundUSD || order.ebayPaidTaxRefund)}</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2 }}>
              <Typography variant="body2" color="text.secondary">eBay collected from buyer</Typography>
              <Box />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4 }}>
              <Typography variant="body2">Sales tax</Typography>
              <Typography variant="body2" color="error.main">-{formatCurrency(order.salesTax)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2 }}>
              <Typography variant="body2" color="text.secondary">Selling costs</Typography>
              <Box />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4 }}>
              <Typography variant="body2">Transaction fees</Typography>
              <Typography variant="body2" color="error.main">-{formatCurrency(order.transactionFees)}</Typography>
            </Box>
            {order.adFeeGeneral > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4 }}>
                <Typography variant="body2">Ad Fee General</Typography>
                <Typography variant="body2" color="error.main">-{formatCurrency(order.adFeeGeneral)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography fontWeight="bold" color="success.main">Order earnings</Typography>
              <Typography fontWeight="bold" color={getOrderEarnings(order) >= 0 ? 'success.main' : 'error.main'}>
                {formatCurrency(getOrderEarnings(order))}
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

    try {
      // Show loading state
      setLoading(true);
      setExportDialogOpen(false); // Close dialog immediately

      // Build params with all current filters, but without pagination limits
      const params = {};

      if (selectedSeller) params.sellerId = selectedSeller;
      if (searchProductName.trim()) params.productName = searchProductName.trim();
      if (searchOrderId.trim()) params.searchOrderId = searchOrderId.trim();
      if (searchAzOrderId.trim()) params.searchAzOrderId = searchAzOrderId.trim();
      if (searchBuyerName.trim()) params.searchBuyerName = searchBuyerName.trim();
      if (searchItemId.trim()) params.searchItemId = searchItemId.trim();
      if (searchMarketplace) params.searchMarketplace = searchMarketplace;
      if (searchPaymentStatus) params.paymentStatus = searchPaymentStatus;
      params.excludeClient = excludeClient;
      params.excludeLowValue = excludeLowValue;
      params.missingAmazonAccount = missingAmazonAccount;

      // Apply date filters
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }

      // Fetch ALL orders with current filters (no pagination limit)
      params.limit = 999999; // Ensure we get all results
      const { data } = await api.get('/ebay/stored-orders', { params });
      const allOrders = data?.orders || [];

      if (allOrders.length === 0) {
        setSnackbarMsg('No orders found to export');
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
        setLoading(false);
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
        discount: { header: 'Discount', accessor: 'discount' },
        transactionFees: { header: 'Transaction Fees', accessor: 'transactionFees' },
        adFeeGeneral: { header: 'Ad Fee General', accessor: 'adFeeGeneral' },
        cancelStatus: { header: 'Cancel Status', accessor: 'cancelState' },
        refunds: {
          header: 'Refunds',
          accessor: (o) => o.refunds?.map((refund) => `${refund.orderPaymentStatus === 'FULLY_REFUNDED' ? 'Full' : 'Partial'}: $${(Number(refund.amount?.value || refund.refundAmount?.value || 0) * (o.conversionRate || 1)).toFixed(2)}`).join('; ') || ''
        },
        refundItemAmount: { header: 'Refund Item', accessor: 'refundItemAmount' },
        refundTaxAmount: { header: 'Refund Tax', accessor: 'refundTaxAmount' },
        refundTotalToBuyer: { header: 'Refund Total', accessor: 'refundTotalToBuyer' },
        orderTotalAfterRefund: { header: 'Order Total (After Refund)', accessor: 'orderTotalAfterRefund' },
        orderEarnings: { header: 'Order Earnings', accessor: 'orderEarnings' },
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
      setSnackbarMsg('Failed to export orders to CSV');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
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
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: { xs: 1, sm: 2 }, flexShrink: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            spacing={{ xs: 1, sm: 2 }}
            sx={{ mb: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <LocalShippingIcon color="primary" sx={{ fontSize: { xs: 20, sm: 24 } }} />
              <Typography
                variant="h5"
                fontWeight="bold"
                sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.5rem' } }}
              >
                Fulfillment Dashboard
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              {totalOrders > 0 && (
                <Chip
                  label={`${totalOrders} orders`}
                  color="primary"
                  variant="filled"
                  size={isSmallMobile ? 'small' : 'medium'}
                />
              )}
              {orders.length > 0 && totalPages > 1 && (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                  (Page {currentPage}/{totalPages})
                </Typography>
              )}
              <Stack direction="row" spacing={1} alignItems="center">
                {orders.length > 0 && (
                  <Button
                    variant="outlined"
                    color="success"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={handleOpenExportDialog}
                    sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' } }}
                  >
                    {isSmallMobile ? 'CSV' : 'Download CSV'}
                  </Button>
                )}
                <Button
                  variant="contained"
                  color="info"
                  size="small"
                  startIcon={autoMessageLoading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                  onClick={handleSendAutoMessages}
                  disabled={autoMessageLoading}
                  sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' } }}
                >
                  {isSmallMobile ? 'Auto Msg' : 'Send Auto Messages'}
                </Button>
              </Stack>
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* CONTROLS */}
          {isMobile ? (
            /* MOBILE LAYOUT - Compact Vertical Stack */
            <Stack spacing={1}>
              {/* Row 1: Seller Select */}
              <FormControl size="small" fullWidth>
                <InputLabel id="seller-select-label">Select Seller</InputLabel>
                <Select
                  labelId="seller-select-label"
                  value={selectedSeller}
                  label="Select Seller"
                  onChange={(e) => setSelectedSeller(e.target.value)}
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

              {/* Row 2: Poll Buttons (side by side) */}
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={!isSmallMobile && (loading ? <CircularProgress size={16} color="inherit" /> : <ShoppingCartIcon />)}
                  onClick={pollNewOrders}
                  disabled={loading}
                  size="small"
                  fullWidth
                  sx={{
                    fontSize: { xs: '0.7rem', sm: '0.8rem' },
                    px: { xs: 0.5, sm: 1 }
                  }}
                >
                  {loading ? 'Polling...' : isSmallMobile ? 'Poll New' : 'Poll New Orders'}
                </Button>

                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={!isSmallMobile && (loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />)}
                  onClick={pollOrderUpdates}
                  disabled={loading}
                  size="small"
                  fullWidth
                  sx={{
                    fontSize: { xs: '0.7rem', sm: '0.8rem' },
                    px: { xs: 0.5, sm: 1 }
                  }}
                >
                  {loading ? 'Updating...' : isSmallMobile ? 'Poll Updates' : 'Poll Order Updates'}
                </Button>

                <Select
                  value={resyncDays}
                  onChange={(e) => setResyncDays(e.target.value)}
                  size="small"
                  sx={{
                    height: 30,
                    fontSize: '0.75rem',
                    bgcolor: 'background.paper',
                    '& .MuiSelect-select': { py: 0.5, px: 1 }
                  }}
                >
                  <MenuItem value={3}>3 Days</MenuItem>
                  <MenuItem value={7}>7 Days</MenuItem>
                  <MenuItem value={10}>10 Days</MenuItem>
                  <MenuItem value={15}>15 Days</MenuItem>
                  <MenuItem value={30}>30 Days</MenuItem>
                </Select>

                {isSuperAdmin && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={!isSmallMobile && (loading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />)}
                    onClick={resyncRecent}
                    disabled={loading}
                    size="small"
                    fullWidth
                    sx={{
                      fontSize: { xs: '0.7rem', sm: '0.8rem' },
                      px: { xs: 0.5, sm: 1 }
                    }}
                  >
                    {loading ? 'Syncing...' : isSmallMobile ? 'Resync' : `Resync ${resyncDays}D`}
                  </Button>
                )}
              </Stack>

              {/* Row 3: Filters side by side */}
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
                    <MenuItem value="EBAY_US">EBAY_US</MenuItem>
                    <MenuItem value="EBAY_AU">EBAY_AU</MenuItem>
                    <MenuItem value="EBAY_ENCA">EBAY_CA</MenuItem>
                    <MenuItem value="EBAY_GB">EBAY_GB</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel id="payment-status-filter-label">Payment Status</InputLabel>
                  <Select
                    labelId="payment-status-filter-label"
                    value={searchPaymentStatus}
                    label="Payment Status"
                    onChange={(e) => setSearchPaymentStatus(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    <MenuItem value="FULLY_REFUNDED">FULLY_REFUNDED</MenuItem>
                    <MenuItem value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              {/* Row 3.5: Exclude Low Value & Missing Amazon Account Toggles */}
              <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={excludeClient}
                      onChange={(e) => setExcludeClient(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      Exclude Client
                    </Typography>
                  }
                  sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={excludeLowValue}
                      onChange={(e) => setExcludeLowValue(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      Exclude &lt; $3 Orders
                    </Typography>
                  }
                  sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={missingAmazonAccount}
                      onChange={(e) => setMissingAmazonAccount(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      Missing Amazon Acc
                    </Typography>
                  }
                  sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
                />
              </Stack>

              {/* Row 4: Recalc & Column Selector */}
              <Stack direction="row" spacing={1} alignItems="center">
                {isSuperAdmin && (
                  <>
                    <Tooltip title={selectedSeller ? "Recalculate orderEarnings since Feb 28 2026 (selected seller)" : "Recalculate orderEarnings since Feb 28 2026 (ALL sellers)"}>
                      <span style={{ flex: 1 }}>
                        <Button
                          variant="outlined"
                          color="info"
                          size="small"
                          fullWidth
                          startIcon={recalcEarningsLoading ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                          onClick={recalculateEarnings}
                          disabled={recalcEarningsLoading}
                          sx={{ fontSize: '0.7rem' }}
                        >
                          {recalcEarningsLoading ? 'Recalculating...' : 'Recalc Earnings'}
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title={selectedSeller ? "Recalculate Amazon financials since Feb 28 2026 (selected seller)" : "Recalculate Amazon financials since Feb 28 2026 (ALL sellers)"}>
                      <span style={{ flex: 1 }}>
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          fullWidth
                          startIcon={recalcAmazonLoading ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                          onClick={recalculateAmazonFinancials}
                          disabled={recalcAmazonLoading}
                          sx={{ fontSize: '0.7rem' }}
                        >
                          {recalcAmazonLoading ? 'Recalculating...' : 'Recalc Amazon'}
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="Run full historical backfill for all stores (orders/messages/listings/returns/cases/disputes)">
                      <span style={{ flex: 1 }}>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          fullWidth
                          startIcon={backfillEverythingLoading ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                          onClick={backfillEverythingAllStores}
                          disabled={backfillEverythingLoading}
                          sx={{ fontSize: '0.7rem' }}
                        >
                          {backfillEverythingLoading ? 'Running...' : 'Backfill All'}
                        </Button>
                      </span>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Select Columns">
                  <IconButton
                    color="primary"
                    onClick={(e) => setColumnSelectorOpen(e.currentTarget)}
                    size="small"
                  >
                    <ViewColumnIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          ) : (
            /* DESKTOP LAYOUT - Two-row layout for better spacing */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Row 1: Seller, Poll/Sync Actions, Recalc */}
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Select
                  value={selectedSeller}
                  onChange={(e) => setSelectedSeller(e.target.value)}
                  displayEmpty
                  size="small"
                  renderValue={(val) => val ? (sellers.find(s => s._id === val)?.user?.username || sellers.find(s => s._id === val)?.user?.email || val) : 'Select Seller'}
                  sx={{ minWidth: 150, fontSize: '0.85rem', color: selectedSeller ? 'inherit' : 'text.secondary' }}
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

                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <ShoppingCartIcon />}
                  onClick={pollNewOrders}
                  disabled={loading}
                  sx={{ minWidth: 120 }}
                >
                  {loading ? 'Polling...' : 'Poll New Orders'}
                </Button>

                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                  onClick={pollOrderUpdates}
                  disabled={loading}
                  sx={{ minWidth: 120 }}
                >
                  {loading ? 'Updating...' : 'Poll Order Updates'}
                </Button>

                {isSuperAdmin && (
                  <>
                    <FormControl size="small" sx={{ minWidth: 90 }}>
                      <Select
                        value={resyncDays}
                        onChange={(e) => setResyncDays(e.target.value)}
                        sx={{ height: 36, fontSize: '0.85rem' }}
                      >
                        <MenuItem value={3}>3 Days</MenuItem>
                        <MenuItem value={7}>7 Days</MenuItem>
                        <MenuItem value={10}>10 Days</MenuItem>
                        <MenuItem value={15}>15 Days</MenuItem>
                        <MenuItem value={30}>30 Days</MenuItem>
                      </Select>
                    </FormControl>

                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                      onClick={resyncRecent}
                      disabled={loading}
                      sx={{ minWidth: 120 }}
                    >
                      {loading ? 'Syncing...' : `Resync ${resyncDays} Days`}
                    </Button>

                    <Tooltip title={selectedSeller ? "Recalculate orderEarnings since Feb 28 2026 (selected seller)" : "Recalculate orderEarnings since Feb 28 2026 (ALL sellers)"}>
                      <span>
                        <Button
                          variant="outlined"
                          color="info"
                          size="small"
                          startIcon={recalcEarningsLoading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                          onClick={recalculateEarnings}
                          disabled={recalcEarningsLoading}
                          sx={{ minWidth: 130 }}
                        >
                          {recalcEarningsLoading ? 'Recalculating...' : 'Recalc Earnings'}
                        </Button>
                      </span>
                    </Tooltip>

                    <Tooltip title={selectedSeller ? "Recalculate Amazon financials since Feb 28 2026 (selected seller)" : "Recalculate Amazon financials since Feb 28 2026 (ALL sellers)"}>
                      <span>
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          startIcon={recalcAmazonLoading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                          onClick={recalculateAmazonFinancials}
                          disabled={recalcAmazonLoading}
                          sx={{ minWidth: 130 }}
                        >
                          {recalcAmazonLoading ? 'Recalculating...' : 'Recalc Amazon'}
                        </Button>
                      </span>
                    </Tooltip>

                    <Tooltip title="Run full historical backfill for all stores (orders/messages/listings/returns/cases/disputes)">
                      <span>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          startIcon={backfillEverythingLoading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                          onClick={backfillEverythingAllStores}
                          disabled={backfillEverythingLoading}
                          sx={{ minWidth: 130 }}
                        >
                          {backfillEverythingLoading ? 'Running...' : 'Backfill All'}
                        </Button>
                      </span>
                    </Tooltip>
                  </>
                )}
              </Stack>

              {/* Row 2: Filters, Toggles, Column Selector */}
              <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Select
                  value={searchMarketplace}
                  onChange={(e) => setSearchMarketplace(e.target.value)}
                  displayEmpty
                  size="small"
                  renderValue={(val) => val ? val : 'Marketplace'}
                  sx={{ minWidth: 145, fontSize: '0.85rem', color: searchMarketplace ? 'inherit' : 'text.secondary' }}
                >
                  <MenuItem value=""><em>All</em></MenuItem>
                  <MenuItem value="EBAY_US">EBAY_US</MenuItem>
                  <MenuItem value="EBAY_AU">EBAY_AU</MenuItem>
                  <MenuItem value="EBAY_ENCA">EBAY_CA</MenuItem>
                  <MenuItem value="EBAY_GB">EBAY_GB</MenuItem>
                </Select>

                <Select
                  value={searchPaymentStatus}
                  onChange={(e) => setSearchPaymentStatus(e.target.value)}
                  displayEmpty
                  size="small"
                  renderValue={(val) => val ? val : 'Payment Status'}
                  sx={{ minWidth: 165, fontSize: '0.85rem', color: searchPaymentStatus ? 'inherit' : 'text.secondary' }}
                >
                  <MenuItem value=""><em>All</em></MenuItem>
                  <MenuItem value="FULLY_REFUNDED">FULLY_REFUNDED</MenuItem>
                  <MenuItem value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</MenuItem>
                </Select>

                <FormControlLabel
                  control={
                    <Switch
                      checked={excludeClient}
                      onChange={(e) => setExcludeClient(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      Exclude Client
                    </Typography>
                  }
                  sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={excludeLowValue}
                      onChange={(e) => setExcludeLowValue(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      Exclude &lt; $3 Orders
                    </Typography>
                  }
                  sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={missingAmazonAccount}
                      onChange={(e) => setMissingAmazonAccount(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      Missing Amazon Acc
                    </Typography>
                  }
                  sx={{ m: 0, px: 1.5, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxSizing: 'border-box' }}
                />

                {/* Column Selector Button */}
                <ColumnSelector
                  allColumns={ALL_COLUMNS}
                  visibleColumns={visibleColumns}
                  onColumnChange={setVisibleColumns}
                  onReset={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                  page="dashboard"
                />
              </Stack>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {/* SEARCH FILTERS */}
          <SearchFiltersPanel
            searchOrderId={searchOrderId}
            setSearchOrderId={setSearchOrderId}
            searchAzOrderId={searchAzOrderId}
            setSearchAzOrderId={setSearchAzOrderId}
            searchBuyerName={searchBuyerName}
            setSearchBuyerName={setSearchBuyerName}
            searchItemId={searchItemId}
            setSearchItemId={setSearchItemId}
            searchProductName={searchProductName}
            setSearchProductName={setSearchProductName}
            setSearchPaymentStatus={setSearchPaymentStatus}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            isSmallMobile={isSmallMobile}
          />



        </Paper>

        {/* TABLE SECTION */}
        {
          orders.length === 0 && !loading ? (
            <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center' }}>
              <ShoppingCartIcon sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 2 }} />
              <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                No orders found. Click "Poll New Orders" to fetch orders from all sellers.
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
                      formatCurrency={formatCurrency}
                      thumbnailImages={thumbnailImages}
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
                      {visibleColumnsSet.has('cancelStatus') && <TableCell sx={HEADER_CELL_SX}>Cancel Status</TableCell>}
                      {visibleColumnsSet.has('refunds') && <TableCell sx={HEADER_CELL_SX}>Refunds</TableCell>}
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
                    {orders.map((order, idx) => {
                      const isSelected = selectedRowId === order._id;
                      return (
                        <TableRow
                          key={order._id || idx}
                          sx={{
                            '&:nth-of-type(odd)': { backgroundColor: 'action.hover' },
                            '&:hover': { backgroundColor: 'action.selected' },
                          }}
                        >
                          <TableCell>{(currentPage - 1) * ordersPerPage + idx + 1}</TableCell>
                          {visibleColumnsSet.has('seller') && (
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {order.seller?.user?.username ||
                                  order.seller?.user?.email ||
                                  order.sellerId ||
                                  '-'}
                              </Typography>
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('orderId') && (
                            <TableCell>
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography variant="body2" fontWeight="medium" sx={{ color: 'primary.main' }}>
                                  {order.orderId || order.legacyOrderId || '-'}
                                </Typography>

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
                          {visibleColumnsSet.has('dateSold') && <TableCell>{formatDate(order.dateSold, order.purchaseMarketplaceId)}</TableCell>}
                          {visibleColumnsSet.has('shipBy') && <TableCell>{formatDate(order.shipByDate, order.purchaseMarketplaceId)}</TableCell>}
                          {visibleColumnsSet.has('deliveryDate') && <TableCell>{formatDeliveryDate(order)}</TableCell>}
                          {visibleColumnsSet.has('productName') && (
                            <TableCell sx={{ minWidth: 300, maxWidth: 400, pr: 1 }}>
                              <Stack spacing={1} sx={{ py: 1 }}>
                                {order.lineItems && order.lineItems.length > 0 ? (
                                  order.lineItems.map((item, i) => (
                                    <Box
                                      key={i}
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 1,
                                        borderBottom: i < order.lineItems.length - 1 ? '1px dashed rgba(0,0,0,0.1)' : 'none',
                                        pb: i < order.lineItems.length - 1 ? 1 : 0
                                      }}
                                    >
                                      {/* 1. QUANTITY BADGE */}
                                      <Chip
                                        label={`x${item.quantity}`}
                                        size="small"
                                        color={item.quantity > 1 ? "warning" : "default"}
                                        sx={{
                                          height: 24,
                                          minWidth: 35,
                                          fontWeight: 'bold',
                                          borderRadius: 1,
                                          backgroundColor: item.quantity > 1 ? '#ed6c02' : '#e0e0e0',
                                          color: item.quantity > 1 ? '#fff' : 'rgba(0,0,0,0.87)'
                                        }}
                                      />

                                      {/* 1.5 THUMBNAIL IMAGE (if available, only for first item) */}
                                      {i === 0 && thumbnailImages[order._id] && (
                                        <Box
                                          onClick={() => handleViewImages(order)}
                                          sx={{
                                            width: 50,
                                            height: 50,
                                            cursor: 'pointer',
                                            border: '1px solid',
                                            borderColor: 'grey.300',
                                            borderRadius: 1,
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            position: 'relative',
                                            '&:hover': {
                                              borderColor: 'primary.main',
                                              boxShadow: 2
                                            }
                                          }}
                                        >
                                          <img
                                            src={thumbnailImages[order._id]}
                                            alt="Product"
                                            style={{
                                              width: '100%',
                                              height: '100%',
                                              objectFit: 'cover'
                                            }}
                                          />
                                          {/* Show badge if there are more images */}
                                          {itemImages[order._id]?.count > 1 && (
                                            <Chip
                                              label={`+${itemImages[order._id].count - 1}`}
                                              size="small"
                                              sx={{
                                                position: 'absolute',
                                                bottom: 2,
                                                right: 2,
                                                height: 18,
                                                fontSize: '0.65rem',
                                                bgcolor: 'rgba(0,0,0,0.7)',
                                                color: 'white',
                                                '& .MuiChip-label': { px: 0.5 }
                                              }}
                                            />
                                          )}
                                          {/* Loading overlay */}
                                          {loadingImages[order._id] && (
                                            <Box
                                              sx={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                bgcolor: 'rgba(255,255,255,0.8)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                              }}
                                            >
                                              <CircularProgress size={20} />
                                            </Box>
                                          )}
                                        </Box>
                                      )}

                                      {/* 2. PRODUCT TITLE & ID */}
                                      <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                        <Tooltip title={item.title} arrow placement="top">
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              lineHeight: 1.2,
                                              fontWeight: item.quantity > 1 ? '500' : '400',
                                              display: '-webkit-box',
                                              WebkitLineClamp: 2,
                                              WebkitBoxOrient: 'vertical',
                                              overflow: 'hidden'
                                            }}
                                          >
                                            {item.title}
                                          </Typography>
                                        </Tooltip>
                                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                                          <Link
                                            href={`https://www.ebay.com/itm/${item.legacyItemId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            underline="hover"
                                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
                                          >
                                            <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                                              ID: {item.legacyItemId}
                                            </Typography>
                                            <OpenInNewIcon sx={{ fontSize: 12, color: 'primary.main' }} />
                                          </Link>
                                        </Stack>
                                      </Box>

                                      {/* 3. COPY BUTTON */}
                                      <IconButton
                                        size="small"
                                        onClick={() => handleCopy(item.title)}
                                        aria-label="copy product name"
                                        sx={{ mt: -0.5 }}
                                      >
                                        <ContentCopyIcon fontSize="small" sx={{ fontSize: '1rem' }} />
                                      </IconButton>
                                    </Box>
                                  ))
                                ) : (
                                  /* Fallback for old orders */
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip label="x1" size="small" />
                                    <Typography variant="body2">
                                      {order.productName || '-'}
                                    </Typography>
                                  </Box>
                                )}
                              </Stack>
                            </TableCell>
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
                            order.orderPaymentStatus !== 'PARTIALLY_REFUNDED' ? (
                              <TableCell align="right">
                                <Typography variant="body2" fontWeight="medium">
                                  {formatCurrency(order.subtotal)}
                                </Typography>
                              </TableCell>
                            ) : <TableCell align="center"><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                          )}
                          {visibleColumnsSet.has('shipping') && (
                            order.orderPaymentStatus !== 'PARTIALLY_REFUNDED' ? (
                              <TableCell align="right">{formatCurrency(order.shipping)}</TableCell>
                            ) : <TableCell align="center"><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                          )}
                          {visibleColumnsSet.has('salesTax') && (
                            order.orderPaymentStatus !== 'PARTIALLY_REFUNDED' ? (
                              <TableCell align="right">{formatCurrency(order.salesTax)}</TableCell>
                            ) : <TableCell align="center"><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                          )}
                          {visibleColumnsSet.has('discount') && (
                            order.orderPaymentStatus !== 'PARTIALLY_REFUNDED' ? (
                              <TableCell align="right">
                                <Typography variant="body2">
                                  {formatCurrency(order.discount)}
                                </Typography>
                              </TableCell>
                            ) : <TableCell align="center"><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                          )}
                          {visibleColumnsSet.has('transactionFees') && (
                            order.orderPaymentStatus !== 'PARTIALLY_REFUNDED' ? (
                              <TableCell align="right">{formatCurrency(order.transactionFees)}</TableCell>
                            ) : <TableCell align="center"><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                          )}
                          {visibleColumnsSet.has('adFeeGeneral') && (
                            order.orderPaymentStatus !== 'PARTIALLY_REFUNDED' ? (
                              <TableCell align="right">
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: order.adFeeGeneral ? 'medium' : 'normal',
                                    color: order.adFeeGeneral ? 'error.main' : 'text.secondary'
                                  }}
                                >
                                  {order.adFeeGeneral ? formatCurrency(order.adFeeGeneral) : '-'}
                                </Typography>
                              </TableCell>
                            ) : <TableCell align="center"><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                          )}
                          {visibleColumnsSet.has('cancelStatus') && (
                            <TableCell>
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
                          {/* --- NEW: Refund Breakdown Columns --- */}
                          {visibleColumnsSet.has('refundItemAmount') && (
                            <TableCell align="right">
                              {order.refundItemAmount ? (
                                <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 'medium' }}>
                                  {formatCurrency(order.refundItemAmount)}
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
                                  {formatCurrency(order.refundTaxAmount)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('refundTotalToBuyer') && (
                            <TableCell align="right">
                              {order.adFeeGeneral ? (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 'medium',
                                    color: 'error.main'
                                  }}
                                >
                                  {formatCurrency(order.adFeeGeneral)}
                                </Typography>
                              ) : (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleFetchAdFeeGeneral(order)}
                                  disabled={Boolean(fetchingAdFeeGeneral[order._id])}
                                  startIcon={fetchingAdFeeGeneral[order._id] ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                                  sx={{ minWidth: 110, fontSize: '0.72rem', py: 0.4 }}
                                >
                                  {fetchingAdFeeGeneral[order._id] ? 'Fetching...' : 'Fetch Ad Fee'}
                                </Button>
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
                                  {formatCurrency(order.orderTotalAfterRefund)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          )}
                          {visibleColumnsSet.has('orderEarnings') && (
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 'bold',
                                  color: order.orderPaymentStatus === 'FULLY_REFUNDED'
                                    ? 'text.secondary'
                                    : (order.orderEarnings ?? 0) >= 0 ? 'success.main' : 'error.main'
                                }}
                              >
                                {order.orderPaymentStatus === 'FULLY_REFUNDED'
                                  ? '$0.00'
                                  : order.orderEarnings != null
                                    ? `$${parseFloat(order.orderEarnings).toFixed(2)}`
                                    : '-'}
                              </Typography>
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
                                <Tooltip title="Message Buyer">
                                  <IconButton
                                    color="primary"
                                    size="small"
                                    onClick={() => handleOpenMessageDialog(order)}
                                  >
                                    <ChatIcon />
                                  </IconButton>
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
                      );
                    })}
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


        <ChatDialog
          open={messageModalOpen}
          onClose={handleCloseMessageDialog}
          order={selectedOrderForMessage}
        />

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
            }
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <ChatIcon color="primary" />
              <Typography variant="h6">Send Message to Buyer?</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Alert severity="info" icon={<InfoIcon />}>
                You're updating the remark to <strong>"{pendingRemarkUpdate?.remarkValue}"</strong>
              </Alert>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Would you like to automatically send this message to the buyer?
                </Typography>
                <Paper
                  elevation={0}
                  sx={{
                    mt: 1.5,
                    p: 2,
                    bgcolor: 'grey.50',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      lineHeight: 1.6
                    }}
                  >
                    {pendingRemarkUpdate && findRemarkTemplateText(remarkTemplates, pendingRemarkUpdate.remarkValue)
                      ? replaceTemplateVariables(
                        findRemarkTemplateText(remarkTemplates, pendingRemarkUpdate.remarkValue),
                        pendingRemarkUpdate.order
                      )
                      : ''}
                  </Typography>
                </Paper>
              </Box>

              <Typography variant="caption" color="text.secondary">
                💡 Tip: The message will be sent through the eBay messaging system
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={handleSkipRemarkMessage}
              disabled={sendingRemarkMessage}
              color="inherit"
            >
              No, Skip
            </Button>
            <Button
              onClick={handleConfirmRemarkMessage}
              variant="contained"
              disabled={sendingRemarkMessage}
              startIcon={sendingRemarkMessage ? <CircularProgress size={20} /> : <SendIcon />}
            >
              {sendingRemarkMessage ? 'Sending...' : 'Yes, Send Message'}
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
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={loading || selectedExportColumns.length === 0}
            >
              {loading ? 'Exporting...' : 'Export CSV'}
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
