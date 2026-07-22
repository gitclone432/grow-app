import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog,
  Stack, TextField, Button, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Alert, Grid, InputAdornment, Menu, ListSubheader, Tooltip,
  Divider, Link, useMediaQuery, useTheme, List, ListItem, ListItemText,
  ListItemSecondaryAction, Pagination, Checkbox, FormControlLabel
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleIcon from '@mui/icons-material/People';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import api from '../../lib/api';
import { CHAT_TEMPLATES, personalizeTemplate } from '../../constants/chatTemplates';
import ColumnSelector from '../../components/ColumnSelector';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { downloadCSV } from '../../utils/csvExport';
import {
  tableHeaderCellSx,
  tableBodyRowSx,
  tableBodyCellSx,
  tableContainerSx,
  tableIndexBadgeSx,
  yellowOutlinedButtonSx,
  yellowFilledButtonSx
} from '../../theme/tableStyles.js';
import { BRAND_DARK } from '../../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';

const filterFieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#fff',
    borderRadius: 1.5
  }
};

// --- RESOLUTION MODAL COMPONENT (Unchanged logic, kept for completeness) ---
function ResolutionDialog({ open, onClose, metaItem, onSave, chatAgents = [] }) {
  const theme = useTheme();
  const isMobileChat = useMediaQuery(theme.breakpoints.down('sm'));
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [notes, setNotes] = useState(metaItem?.notes || '');
  const [status, setStatus] = useState(metaItem?.status || 'Open');
  const [pickedUpBy, setPickedUpBy] = useState(metaItem?.pickedUpBy || '');
  const [savingResolution, setSavingResolution] = useState(false);
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
  const [resolvedBuyerName, setResolvedBuyerName] = useState('');

  useEffect(() => {
    if (open && metaItem) {
      setNotes(metaItem.notes || '');
      setStatus(metaItem.status || 'Open');
      setPickedUpBy(metaItem.pickedUpBy || '');
      setAttachments([]);
      setResolvedBuyerName('');
      loadMessages();
      resolveBuyerName();
    }
  }, [open, metaItem]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function resolveBuyerName() {
    const propName = String(metaItem?.buyerName || '').trim();
    const propId = String(metaItem?.buyerUsername || '').trim();
    if (propName && propName.toLowerCase() !== propId.toLowerCase()) return;

    const params = {};
    if (metaItem?.orderId) params.orderId = metaItem.orderId;
    if (metaItem?.sellerId) params.sellerId = metaItem.sellerId;
    if (metaItem?.buyerUsername) params.buyerUsername = metaItem.buyerUsername;
    if (metaItem?.itemId) params.itemId = metaItem.itemId;
    if (!params.buyerUsername) return;
    if (!params.orderId && !params.sellerId && !params.itemId) return;

    try {
      const { data } = await api.get('/ebay/chat/search-order', { params });
      const name = String(data?.buyerName || '').trim();
      const username = String(data?.buyerUsername || '').trim();
      if (propId && username && username.toLowerCase() !== propId.toLowerCase()) return;
      if (name && name.toLowerCase() !== propId.toLowerCase()) {
        setResolvedBuyerName(name);
      }
    } catch (e) {
      // best-effort
    }
  }

  async function loadMessages() {
    setLoadingMessages(true);

    let effectiveConversationId = metaItem?.conversationId || '';
    let effectiveOrderId = metaItem?.orderId || '';
    let effectiveItemId = metaItem?.itemId || '';
    let effectiveBuyer = metaItem?.buyerUsername || '';

    if (metaItem?.sellerId && (metaItem?.buyerUsername || metaItem?.conversationId)) {
      try {
        const { data } = await api.get('/ebay/chat/resolve-conversation', {
          params: {
            sellerId: metaItem.sellerId,
            buyerUsername: metaItem.buyerUsername || undefined,
            itemId: metaItem.itemId || undefined,
            orderId: metaItem.orderId || undefined,
            conversationId: metaItem.conversationId || undefined
          }
        });
        if (data?.conversationId) effectiveConversationId = data.conversationId;
        if (data?.orderId) effectiveOrderId = data.orderId;
        if (data?.itemId) effectiveItemId = data.itemId;
        if (data?.buyerUsername) effectiveBuyer = data.buyerUsername;
        if (data?.buyerName) {
          const name = String(data.buyerName).trim();
          const user = String(data.buyerUsername || metaItem.buyerUsername || '').trim();
          if (name && name.toLowerCase() !== user.toLowerCase()) {
            setResolvedBuyerName(name);
          }
        }
      } catch (e) {
        if (metaItem?.buyerUsername && metaItem?.itemId) effectiveOrderId = metaItem.orderId || '';
      }
    }

    const params = { sellerId: metaItem.sellerId };
    if (effectiveBuyer) params.buyerUsername = effectiveBuyer;
    if (effectiveItemId) params.itemId = effectiveItemId;
    if (effectiveOrderId) params.orderId = effectiveOrderId;
    if (effectiveConversationId) params.conversationId = effectiveConversationId;

    try {
      const { data } = await api.get('/ebay/chat/messages', { params });
      setMessages(dedupeChatMessages(data));
    } catch (e) {
      console.error("Failed to load messages", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }

    if (metaItem?.sellerId && (effectiveBuyer || effectiveConversationId)) {
      (async () => {
        try {
          await api.post(
            '/ebay/sync-thread',
            {
              sellerId: metaItem.sellerId,
              buyerUsername: effectiveBuyer || undefined,
              itemId: effectiveItemId || undefined,
              orderId: effectiveOrderId || undefined,
              conversationId: effectiveConversationId || undefined,
              commerceOnly: Boolean(effectiveConversationId)
            },
            { timeout: 90000 }
          );
          const { data } = await api.get('/ebay/chat/messages', { params });
          setMessages(dedupeChatMessages(data));
        } catch (e) {
          if (e.response?.status !== 401 && e.response?.status !== 403) {
            console.error('Thread sync failed', e);
          }
        }
      })();
    }
  }

  function dedupeChatMessages(list) {
    const arr = Array.isArray(list) ? list : [];
    const normalizeBody = (body) =>
      String(body || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const idsOf = (m) =>
      [m.messageId, m.externalMessageId, m._id]
        .map((x) => String(x || '').trim())
        .filter(Boolean);
    const out = [];
    for (const m of arr) {
      const body = normalizeBody(m.body);
      const when = new Date(m.messageDate || 0).getTime();
      const sender = String(m.sender || '').toUpperCase();
      const ids = new Set(idsOf(m));
      const dupIdx = out.findIndex((x) => {
        for (const id of idsOf(x)) {
          if (ids.has(id)) return true;
        }
        if (!body || normalizeBody(x.body) !== body) return false;
        const senderX = String(x.sender || '').toUpperCase();
        if (sender && senderX && sender !== senderX) return false;
        const t = new Date(x.messageDate || 0).getTime();
        return Math.abs(t - when) <= 15 * 60 * 1000;
      });
      if (dupIdx === -1) out.push(m);
    }
    return out;
  }

  async function handleSendMessage() {
    if (!newMessage.trim() && attachments.length === 0) return;
    setSendingMsg(true);
    try {
      const { data } = await api.post('/ebay/send-message', {
        orderId: metaItem.orderId,
        buyerUsername: metaItem.buyerUsername,
        itemId: metaItem.itemId,
        sellerId: metaItem.sellerId,
        body: newMessage,
        mediaUrls: attachments.map((attachment) => attachment.url)
      });
      setMessages((previous) => [...previous, data.message]);
      setNewMessage('');
      setAttachments([]);
    } catch (e) {
      alert("Failed to send: " + e.message);
    } finally {
      setSendingMsg(false);
    }
  }

  async function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    try {
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const uploaded = (data.urls || []).map((url, index) => ({
        url,
        name: files[index]?.name || 'Image'
      }));
      setAttachments((previous) => [...previous, ...uploaded]);
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSaveResolution() {
    if (status === 'Resolved' && !notes.trim()) {
      alert("Notes are required to mark as Resolved.");
      return;
    }
    setSavingResolution(true);
    try {
      await api.patch(`/ebay/conversation-management/${metaItem._id}/resolve`, {
        notes,
        status,
        pickedUpBy
      });
      onSave();
      onClose();
    } catch (e) {
      alert("Failed to save: " + e.message);
    } finally {
      setSavingResolution(false);
    }
  }

  const handleTemplateClick = (event) => {
    setTemplateAnchorEl(event.currentTarget);
  };

  const handleTemplateClose = () => {
    setTemplateAnchorEl(null);
  };

  const handleSelectTemplate = (templateText) => {
    const nameToUse = (buyerName !== '-' ? buyerName : null) || buyerUsername || 'Buyer';
    const personalizedText = personalizeTemplate(templateText, nameToUse);
    setNewMessage(personalizedText);
    handleTemplateClose();
  };

  const handleMessageKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  function handleEscalateClick() {
    console.info('Escalate action is not implemented yet.');
  }

  // Helper to safely extract data from the metaItem object
  const sellerName = metaItem?.sellerName || 'Seller';
  const propBuyerName = String(metaItem?.buyerName || '').trim();
  const buyerUsername = metaItem?.buyerUsername || '-';
  const hasDistinctPropName = Boolean(propBuyerName) && propBuyerName.toLowerCase() !== String(buyerUsername).toLowerCase();
  const resolvedDistinct = Boolean(resolvedBuyerName) && resolvedBuyerName.toLowerCase() !== String(buyerUsername).toLowerCase();
  const buyerName = hasDistinctPropName ? propBuyerName : (resolvedDistinct ? resolvedBuyerName : '-');
  const itemId = metaItem?.itemId || '';
  const itemTitle = metaItem?.itemTitle || metaItem?.productName || '';
  const orderId = metaItem?.orderId || 'N/A';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      fullScreen={isMobileChat}
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: `${dashboardSignatureTokens.radius.card}px` },
          overflow: 'hidden',
          boxShadow: dashboardSignatureTokens.shadows.card,
          background: dashboardSignatureTokens.surfaces.pageCard
        }
      }}
    >
      <Box sx={{ display: 'flex', height: { xs: '100vh', sm: '82vh' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        {/* LEFT: CHAT */}
        <Box
          sx={{
            width: { xs: '100%', sm: '62%' },
            borderRight: { xs: 0, sm: `1px solid ${alpha(BRAND_DARK, 0.1)}` },
            borderBottom: { xs: `1px solid ${alpha(BRAND_DARK, 0.1)}`, sm: 0 },
            display: 'flex',
            flexDirection: 'column',
            minHeight: { xs: '55%', sm: 0 }
          }}
        >
          <Box
            sx={{
              px: { xs: 1.5, sm: 2 },
              py: 1.5,
              borderBottom: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
              bgcolor: '#fff'
            }}
          >
            <Stack
              direction="row"
              alignItems="flex-start"
              justifyContent="space-between"
              spacing={1.5}
              sx={{ mb: 1 }}
            >
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.4, color: 'text.secondary', textTransform: 'uppercase' }}>
                    Buyer
                  </Typography>
                  <Typography sx={{ fontWeight: 700, color: BRAND_DARK, lineHeight: 1.2, fontSize: { xs: '0.95rem', sm: '1.05rem' } }}>
                    {buyerName !== '-' ? buyerName : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.4, color: 'text.secondary', textTransform: 'uppercase' }}>
                    Buyer ID
                  </Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, bgcolor: alpha(BRAND_DARK, 0.06), px: 0.75, py: 0.25, borderRadius: 1 }}>
                    {buyerUsername}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={0.75} alignItems="center" flexShrink={0}>
                <Chip
                  label={sellerName}
                  size="small"
                  icon={<PersonIcon style={{ fontSize: 15 }} />}
                  sx={{
                    bgcolor: alpha('#1565c0', 0.1),
                    color: '#1565c0',
                    fontWeight: 700,
                    height: 28,
                    display: { xs: 'none', sm: 'inline-flex' }
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleTemplateClick}
                  disabled={sendingMsg}
                  endIcon={<ExpandMoreIcon />}
                  sx={{ ...yellowOutlinedButtonSx, minHeight: 32, px: 1.25 }}
                >
                  Templates
                </Button>
                {isMobileChat && (
                  <IconButton onClick={onClose} size="small">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {itemId ? (
                <Link
                  href={`https://www.ebay.com/itm/${itemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%' }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: { xs: 220, sm: 360 }
                    }}
                  >
                    {itemTitle || `Item ${itemId}`}
                  </Typography>
                  <OpenInNewIcon sx={{ fontSize: 13 }} />
                </Link>
              ) : null}
              <Chip
                label={orderId && orderId !== 'N/A' ? `Order ${orderId}` : 'Inquiry'}
                size="small"
                variant="outlined"
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  borderColor: alpha(BRAND_DARK, 0.18),
                  bgcolor: alpha(BRAND_DARK, 0.03)
                }}
              />
            </Stack>
          </Box>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              p: { xs: 1.25, sm: 1.75 },
              background: `linear-gradient(180deg, ${alpha(BRAND_DARK, 0.03)} 0%, ${alpha(BRAND_DARK, 0.06)} 100%)`
            }}
          >
            {loadingMessages ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight={180}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Stack spacing={1.5} sx={{ width: '100%' }}>
                {messages.length === 0 && (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    No messages in this thread yet. Sync from Buyer Messages if needed.
                  </Alert>
                )}

                {messages.map((msg, i) => {
                  const fromUser = String(msg.senderUsername || '').trim().toLowerCase();
                  const buyerUser = String(buyerUsername || msg.buyerUsername || '').trim().toLowerCase();
                  const sellerUser = String(sellerName || '').trim().toLowerCase();
                  let isSeller = String(msg.sender || '').toUpperCase() === 'SELLER';
                  if (fromUser) {
                    if (buyerUser && fromUser === buyerUser) isSeller = false;
                    else if (sellerUser && fromUser === sellerUser) isSeller = true;
                    else if (buyerUser && fromUser !== buyerUser) isSeller = true;
                  } else {
                    const toUser = String(msg.recipientUsername || '').trim().toLowerCase();
                    if (buyerUser && toUser === buyerUser) isSeller = true;
                    else if (sellerUser && toUser === sellerUser) isSeller = false;
                  }
                  const senderLabel = isSeller
                    ? (sellerName || msg.senderUsername || 'Seller')
                    : (buyerName !== '-' ? buyerName : (msg.senderUsername || buyerUsername || 'Buyer'));
                  const media = msg.mediaUrls?.length
                    ? msg.mediaUrls.map((url) => ({ url, name: '' }))
                    : (msg.messageMedia || []).map((m) => ({
                        url: m?.mediaUrl,
                        name: m?.mediaName || '',
                        type: m?.mediaType
                      }));

                  return (
                    <Box
                      key={msg._id || msg.messageId || i}
                      sx={{
                        display: 'flex',
                        justifyContent: isSeller ? 'flex-end' : 'flex-start',
                        width: '100%'
                      }}
                    >
                      <Box sx={{ maxWidth: { xs: '88%', sm: '78%', md: '72%' } }}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: { xs: 1.1, sm: 1.35 },
                            bgcolor: isSeller ? BRAND_DARK : '#fff',
                            color: isSeller ? '#fff' : BRAND_DARK,
                            borderRadius: 2.5,
                            border: isSeller ? 'none' : `1px solid ${alpha(BRAND_DARK, 0.1)}`,
                            boxShadow: isSeller ? 'none' : `0 4px 14px ${alpha(BRAND_DARK, 0.06)}`
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', mb: 0.5, opacity: 0.8, fontWeight: 700, fontSize: '0.68rem' }}
                          >
                            {senderLabel} · {isSeller ? 'seller' : 'buyer'}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: { xs: '0.82rem', sm: '0.875rem' },
                              lineHeight: 1.5
                            }}
                          >
                            {msg.body}
                          </Typography>

                          {media.filter((m) => m?.url).length > 0 && (
                            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {media.filter((m) => m?.url).map((attachment, index) => {
                                const url = String(attachment.url);
                                const name = attachment.name || url.split('/').pop() || 'Attachment';
                                const isImage =
                                  String(attachment.type || '').toUpperCase() === 'IMAGE' ||
                                  /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) ||
                                  /i\.ebayimg\.com/i.test(url);

                                return isImage ? (
                                  <Box
                                    key={index}
                                    component="a"
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ display: 'block', borderRadius: 1.5, overflow: 'hidden', lineHeight: 0 }}
                                  >
                                    <Box
                                      component="img"
                                      src={url}
                                      alt={name}
                                      loading="lazy"
                                      sx={{
                                        display: 'block',
                                        maxWidth: { xs: 160, sm: 240 },
                                        maxHeight: 180,
                                        objectFit: 'contain',
                                        bgcolor: '#fff'
                                      }}
                                    />
                                  </Box>
                                ) : (
                                  <Chip
                                    key={index}
                                    icon={<AttachFileIcon />}
                                    label={name.length > 28 ? `${name.slice(0, 28)}…` : name}
                                    onClick={() => window.open(url, '_blank')}
                                    sx={{
                                      cursor: 'pointer',
                                      color: 'inherit',
                                      bgcolor: isSeller ? 'rgba(255,255,255,.18)' : alpha(BRAND_DARK, 0.08)
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
                            fontSize: '0.7rem'
                          }}
                        >
                          {new Date(msg.messageDate).toLocaleString('en-US', {
                            timeZone: 'America/Los_Angeles',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })} PT
                          {isSeller && (msg.read ? ' · Read' : ' · Sent')}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
                <div ref={messagesEndRef} />
              </Stack>
            )}
          </Box>

          <Box
            sx={{
              p: { xs: 1, sm: 1.25 },
              bgcolor: '#fff',
              borderTop: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
              flexShrink: 0
            }}
          >
            {attachments.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {attachments.map((attachment, index) => (
                  <Chip
                    key={`${attachment.url}-${index}`}
                    label={attachment.name}
                    size="small"
                    variant="outlined"
                    onDelete={() => setAttachments((previous) => previous.filter((_, i) => i !== index))}
                    sx={{ maxWidth: { xs: 150, sm: 220 } }}
                  />
                ))}
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                hidden
                onChange={handleFileSelect}
              />
              <Tooltip title="Attach images">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sendingMsg}
                    sx={{
                      mb: 0.5,
                      border: `1px solid ${alpha(BRAND_DARK, 0.14)}`,
                      borderRadius: 1.5
                    }}
                  >
                    {uploading ? <CircularProgress size={18} /> : <AttachFileIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
              <TextField
                fullWidth
                size="small"
                multiline
                maxRows={4}
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleMessageKeyDown}
                disabled={sendingMsg}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: alpha(BRAND_DARK, 0.02)
                  }
                }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleSendMessage}
                disabled={sendingMsg || uploading || (!newMessage.trim() && attachments.length === 0)}
                endIcon={sendingMsg ? <CircularProgress size={16} color="inherit" /> : <SendIcon fontSize="small" />}
                sx={{ ...yellowFilledButtonSx, px: { xs: 1.5, sm: 2.25 }, mb: 0.5, minWidth: 0 }}
              >
                Send
              </Button>
            </Box>

            <Menu
              anchorEl={templateAnchorEl}
              open={Boolean(templateAnchorEl)}
              onClose={handleTemplateClose}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              PaperProps={{
                style: { maxHeight: 400, width: 320 },
                sx: { borderRadius: 2, mt: -0.5 }
              }}
            >
              {CHAT_TEMPLATES.map((group, index) => (
                <Box key={index}>
                  <ListSubheader
                    sx={{
                      bgcolor: alpha(BRAND_DARK, 0.04),
                      fontWeight: 800,
                      lineHeight: '32px',
                      color: BRAND_DARK,
                      fontSize: '0.72rem'
                    }}
                  >
                    {group.category}
                  </ListSubheader>
                  {group.items.map((item, idx) => (
                    <MenuItem
                      key={idx}
                      onClick={() => handleSelectTemplate(item.text)}
                      sx={{
                        fontSize: '0.85rem',
                        whiteSpace: 'normal',
                        py: 1,
                        borderBottom: `1px solid ${alpha(BRAND_DARK, 0.06)}`,
                        display: 'block'
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
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
                          fontSize: '0.72rem'
                        }}
                      >
                        {item.text}
                      </Typography>
                    </MenuItem>
                  ))}
                </Box>
              ))}
            </Menu>
          </Box>
        </Box>

        {/* RIGHT: MANAGEMENT */}
        <Box
          sx={{
            width: { xs: '100%', sm: '38%' },
            display: 'flex',
            flexDirection: 'column',
            bgcolor: dashboardSignatureTokens.surfaces.metricCard,
            minHeight: { xs: '45%', sm: 0 }
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.5,
              bgcolor: BRAND_DARK,
              color: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>Manage Case</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                Update assignment, status, and notes
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.85)' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ p: 2, flex: 1, overflowY: 'auto' }}>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
              <Box sx={{ flex: '1 1 140px' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  About
                </Typography>
                <Chip
                  label={formatCategory(metaItem?.category)}
                  size="small"
                  sx={{
                    mt: 0.75,
                    display: 'flex',
                    width: 'fit-content',
                    bgcolor: alpha('#1565c0', 0.1),
                    color: '#1565c0',
                    fontWeight: 700
                  }}
                />
              </Box>
              <Box sx={{ flex: '1 1 140px' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Case
                </Typography>
                <Chip
                  label={metaItem?.caseStatus || '—'}
                  size="small"
                  color={metaItem?.caseStatus === 'Case Opened' ? 'error' : 'success'}
                  variant="outlined"
                  sx={{ mt: 0.75, display: 'flex', width: 'fit-content', fontWeight: 700 }}
                />
              </Box>
            </Stack>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: BRAND_DARK, mb: 0.75 }}>
              Resolution Notes
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={6}
              maxRows={12}
              placeholder="Enter notes about how this was resolved..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              helperText={status === 'Resolved' ? 'Required when marking Resolved' : 'Optional'}
              error={status === 'Resolved' && !notes.trim()}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#fff',
                  borderRadius: 2
                }
              }}
            />

            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <InputLabel shrink>Picked Up By</InputLabel>
              <Select
                value={pickedUpBy}
                label="Picked Up By"
                onChange={(e) => setPickedUpBy(e.target.value)}
                displayEmpty
                notched
                sx={{ bgcolor: '#fff', borderRadius: 1.5 }}
                renderValue={(selected) => (selected ? selected : <em style={{ color: '#999' }}>Unassigned</em>)}
              >
                <MenuItem value=""><em>Unassigned</em></MenuItem>
                {chatAgents.map((agent) => (
                  <MenuItem key={agent._id} value={agent.name}>{agent.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <FormControl fullWidth size="small" sx={{ flex: 1.2 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={status}
                  label="Status"
                  onChange={(e) => setStatus(e.target.value)}
                  sx={{ bgcolor: '#fff', borderRadius: 1.5 }}
                >
                  <MenuItem value="Open">Open</MenuItem>
                  <MenuItem value="In Progress">In Progress</MenuItem>
                  <MenuItem value="Resolved">Resolved</MenuItem>
                </Select>
              </FormControl>
              <Button
                fullWidth
                variant="outlined"
                color="warning"
                onClick={handleEscalateClick}
                sx={{ flex: 0.8, minHeight: 40, borderRadius: 1.5, fontWeight: 700 }}
              >
                Escalate
              </Button>
            </Stack>
          </Box>

          <Box
            sx={{
              p: 2,
              borderTop: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
              bgcolor: '#fff',
              display: 'flex',
              justifyContent: 'flex-end'
            }}
          >
            <Button
              variant="contained"
              size="large"
              startIcon={savingResolution ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
              onClick={handleSaveResolution}
              disabled={savingResolution}
              sx={{ ...yellowFilledButtonSx, px: 2.5, minHeight: 42 }}
            >
              {savingResolution ? 'Saving…' : 'Save & Update'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}


const CATEGORY_DISPLAY_MAP = {
  'Return - Refund': 'Refund',
  'Return - Replace': 'Replace',
  '': 'Not a Case Yet',
};
const formatCategory = (cat) => CATEGORY_DISPLAY_MAP[cat ?? ''] ?? cat ?? 'Not a Case Yet';

function formatCreationDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function ConversationManagementPage() {
  const [items, setItems] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Chat Agents (Picked Up By)
  const [chatAgents, setChatAgents] = useState([]);
  const [manageAgentsOpen, setManageAgentsOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [editingAgent, setEditingAgent] = useState(null); // { _id, name }
  const [editAgentName, setEditAgentName] = useState('');
  const [agentSaving, setAgentSaving] = useState(false);
  const rowsPerPage = 25;

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;

  function parseTimeMs(value) {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  function formatElapsed(ms) {
    if (ms < ONE_HOUR_MS) return '<1 hr';
    if (ms < ONE_DAY_MS) {
      const hours = Math.floor(ms / ONE_HOUR_MS);
      return `${hours} hr${hours === 1 ? '' : 's'}`;
    }
    const days = Math.floor(ms / ONE_DAY_MS);
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  function getSellerReplyLabel(item) {
    const sellerMs = parseTimeMs(item.lastSellerMessageAt);
    if (!sellerMs) return { label: 'No reply yet', color: 'default' };
    const elapsedMs = Math.max(0, nowMs - sellerMs);
    return { label: `${formatElapsed(elapsedMs)} ago`, color: 'info' };
  }

  function getBuyerSlaLabel(item) {
    const buyerMs = parseTimeMs(item.lastBuyerMessageAt);
    const sellerMs = parseTimeMs(item.lastSellerMessageAt);

    if (!buyerMs) return { label: 'No buyer message', color: 'default' };

    // Seller replied to the latest buyer message.
    if (sellerMs && sellerMs >= buyerMs) {
      const repliedAgoMs = Math.max(0, nowMs - sellerMs);
      return { label: `Replied ${formatElapsed(repliedAgoMs)} ago`, color: 'success' };
    }

    // Waiting for seller reply inside 24h window.
    const elapsedSinceBuyerMs = Math.max(0, nowMs - buyerMs);
    const remainingMs = ONE_DAY_MS - elapsedSinceBuyerMs;
    if (remainingMs > 0) {
      return { label: `${formatElapsed(remainingMs)} left`, color: 'warning' };
    }

    // 24h breached.
    const overdueMs = Math.abs(remainingMs);
    return { label: `Overdue ${formatElapsed(overdueMs)}`, color: 'error' };
  }

  // Column Definitions
  const ALL_COLUMNS = [
    { id: 'sl', label: 'SL No' },
    { id: 'seller', label: 'Seller' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'creationDate', label: 'Creation Date' },
    { id: 'username', label: 'Buyer ID' },
    { id: 'buyerName', label: 'Buyer Name' },
    { id: 'buyerSla', label: 'Buyer SLA' },
    { id: 'sellerReply', label: 'Seller Last Reply' },
    { id: 'about', label: 'Conversation About' },
    { id: 'case', label: 'Case' },
    { id: 'amazonAccount', label: 'Amazon Account' },
    { id: 'azOrderId', label: 'AZ Order ID' },
    { id: 'pickedUpBy', label: 'Picked Up By' },
    { id: 'action', label: 'Action' },
  ];
  const [visibleColumns, setVisibleColumns] = useState(ALL_COLUMNS.map(c => c.id));
  const exportableColumns = ALL_COLUMNS.filter(column => column.id !== 'action');
  const [selectedExportColumns, setSelectedExportColumns] = useState(exportableColumns.map(column => column.id));

  // --- FILTERS STATE ---
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterSeller, setFilterSeller] = useState('All');
  const [filterAbout, setFilterAbout] = useState('All');
  const [filterCase, setFilterCase] = useState('All');
  const [filterPickedUpBy, setFilterPickedUpBy] = useState('All');
  const [dateFilterMode, setDateFilterMode] = useState('none');
  const [singleDate, setSingleDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchAgents();
    fetchSellers();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    fetchItems();
  }, [currentPage, debouncedSearch, filterSeller, filterAbout, filterCase, filterPickedUpBy, dateFilterMode, singleDate, dateFrom, dateTo]);

  function buildListParams() {
    const params = {
      status: 'Case Not Opened,Open,In Progress',
      page: currentPage,
      limit: rowsPerPage
    };

    if (debouncedSearch) params.search = debouncedSearch;
    if (filterSeller !== 'All') params.sellerId = filterSeller;
    if (filterAbout !== 'All') params.about = filterAbout;
    if (filterCase !== 'All') params.caseStatus = filterCase;
    if (filterPickedUpBy !== 'All') params.pickedUpBy = filterPickedUpBy;
    if (dateFilterMode === 'single' && singleDate) {
      params.creationDate = singleDate;
    }
    if (dateFilterMode === 'range') {
      if (dateFrom) params.creationDateFrom = dateFrom;
      if (dateTo) params.creationDateTo = dateTo;
    }

    return params;
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchText.trim()) count += 1;
    if (filterSeller !== 'All') count += 1;
    if (filterAbout !== 'All') count += 1;
    if (filterCase !== 'All') count += 1;
    if (filterPickedUpBy !== 'All') count += 1;
    if (dateFilterMode === 'single' && singleDate) count += 1;
    if (dateFilterMode === 'range' && (dateFrom || dateTo)) count += 1;
    return count;
  }, [searchText, filterSeller, filterAbout, filterCase, filterPickedUpBy, dateFilterMode, singleDate, dateFrom, dateTo]);

  const pageStats = useMemo(() => {
    let overdue = 0;
    let unassigned = 0;
    for (const item of items) {
      if (getBuyerSlaLabel(item).color === 'error') overdue += 1;
      if (!item.pickedUpBy) unassigned += 1;
    }
    return { overdue, unassigned };
  }, [items, nowMs]);

  function resetFilters() {
    setSearchText('');
    setDebouncedSearch('');
    setFilterSeller('All');
    setFilterAbout('All');
    setFilterCase('All');
    setFilterPickedUpBy('All');
    setDateFilterMode('none');
    setSingleDate('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  }

  async function fetchItems() {
    setLoading(true);
    try {
      const { data } = await api.get('/ebay/conversation-management/list', { params: buildListParams() });
      setItems(data?.records || []);
      setTotalItems(data?.total || 0);
      setTotalPages(data?.pagination?.totalPages || 1);
    } catch (e) {
      console.error(e);
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSellers() {
    try {
      const { data } = await api.get('/sellers/all');
      setSellers(data || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchAgents() {
    try {
      const { data } = await api.get('/ebay/chat-agents');
      setChatAgents(data || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDownloadCsv() {
    setExportingCsv(true);
    try {
      const { data } = await api.get('/ebay/conversation-management/export', {
        params: {
          ...buildListParams(),
          page: undefined,
          limit: undefined
        }
      });

      const csvColumnAccessors = {
        sl: {
          label: 'SL No',
          value: (item, index) => index + 1
        },
        seller: {
          label: 'Seller',
          value: (item) => item.sellerName || 'Unknown'
        },
        orderId: {
          label: 'Order ID',
          value: (item) => item.orderId || ''
        },
        creationDate: {
          label: 'Creation Date',
          value: (item) => formatCreationDate(item.creationDate)
        },
        username: {
          label: 'Buyer ID',
          value: (item) => item.buyerUsername || ''
        },
        buyerName: {
          label: 'Buyer Name',
          value: (item) => item.buyerName || ''
        },
        buyerSla: {
          label: 'Buyer SLA',
          value: (item) => getBuyerSlaLabel(item).label
        },
        sellerReply: {
          label: 'Seller Last Reply',
          value: (item) => getSellerReplyLabel(item).label
        },
        about: {
          label: 'Conversation About',
          value: (item) => formatCategory(item.category)
        },
        case: {
          label: 'Case',
          value: (item) => item.caseStatus || ''
        },
        amazonAccount: {
          label: 'Amazon Account',
          value: (item) => item.amazonAccount || ''
        },
        azOrderId: {
          label: 'AZ Order ID',
          value: (item) => item.azOrderId || ''
        },
        pickedUpBy: {
          label: 'Picked Up By',
          value: (item) => item.pickedUpBy || ''
        }
      };

      const csvData = (data || []).map((item, index) => {
        const row = {};
        selectedExportColumns.forEach((columnId) => {
          const config = csvColumnAccessors[columnId];
          if (!config) return;
          row[config.label] = config.value(item, index);
        });
        return row;
      });

      downloadCSV(csvData, 'Conversation_Management');
      setExportDialogOpen(false);
    } catch (e) {
      alert('Failed to download CSV: ' + (e.response?.data?.error || e.message));
    } finally {
      setExportingCsv(false);
    }
  }

  function handleOpenExportDialog() {
    const defaultColumns = visibleColumns.filter(columnId => columnId !== 'action');
    setSelectedExportColumns(defaultColumns.length ? defaultColumns : exportableColumns.map(column => column.id));
    setExportDialogOpen(true);
  }

  function handleToggleExportColumn(columnId) {
    setSelectedExportColumns((prev) => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      }

      const next = [...prev, columnId];
      next.sort((left, right) => (
        exportableColumns.findIndex(column => column.id === left) -
        exportableColumns.findIndex(column => column.id === right)
      ));
      return next;
    });
  }

  async function handleAddAgent() {
    if (!newAgentName.trim()) return;
    setAgentSaving(true);
    try {
      const { data } = await api.post('/ebay/chat-agents', { name: newAgentName.trim() });
      setChatAgents(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewAgentName('');
    } catch (e) {
      alert('Failed to add: ' + e.message);
    } finally {
      setAgentSaving(false);
    }
  }

  async function handleUpdateAgent() {
    if (!editAgentName.trim() || !editingAgent) return;
    setAgentSaving(true);
    try {
      const { data } = await api.patch(`/ebay/chat-agents/${editingAgent._id}`, { name: editAgentName.trim() });
      setChatAgents(prev => prev.map(a => a._id === data._id ? data : a).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingAgent(null);
      setEditAgentName('');
    } catch (e) {
      alert('Failed to update: ' + e.message);
    } finally {
      setAgentSaving(false);
    }
  }

  async function handleDeleteAgent(agent) {
    if (!window.confirm(`Delete "${agent.name}"?`)) return;
    try {
      await api.delete(`/ebay/chat-agents/${agent._id}`);
      setChatAgents(prev => prev.filter(a => a._id !== agent._id));
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    }
  }

  async function handlePickedUpByChange(item, agentName) {
    try {
      await api.patch(`/ebay/conversation-management/${item._id}/pick-up`, { pickedUpBy: agentName });
      setItems(prev => prev.map(i => i._id === item._id ? { ...i, pickedUpBy: agentName } : i));
    } catch (e) {
      console.error('Failed to update pickedUpBy', e);
    }
  }

  return (
    <AdminPageShell>
      <PageHeader
        title="Conversation Management"
        subtitle="Track open buyer conversations, SLA risk, and agent pickup across sellers."
        breadcrumbs={[
          { label: 'Compliance & Support' },
          { label: 'Conversation Management' }
        ]}
        actions={(
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              startIcon={<FilterListIcon />}
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              sx={yellowOutlinedButtonSx}
            >
              Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleOpenExportDialog}
              disabled={exportingCsv || loading || totalItems === 0}
              sx={yellowOutlinedButtonSx}
            >
              Download CSV
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PeopleIcon />}
              onClick={() => setManageAgentsOpen(true)}
              sx={yellowOutlinedButtonSx}
            >
              Manage Agents
            </Button>
            <ColumnSelector
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              onColumnChange={setVisibleColumns}
              onReset={() => setVisibleColumns(ALL_COLUMNS.map(c => c.id))}
              page="conversation-management"
            />
          </Stack>
        )}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <Chip
          label={`${totalItems.toLocaleString()} conversations`}
          sx={{ fontWeight: 700, bgcolor: alpha(BRAND_DARK, 0.08), color: BRAND_DARK }}
        />
        <Chip
          label={`${pageStats.overdue} overdue on page`}
          color={pageStats.overdue ? 'error' : 'default'}
          variant={pageStats.overdue ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600 }}
        />
        <Chip
          label={`${pageStats.unassigned} unassigned on page`}
          color={pageStats.unassigned ? 'warning' : 'default'}
          variant={pageStats.unassigned ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600 }}
        />
        {activeFilterCount > 0 && (
          <Chip
            label={`${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active`}
            onDelete={resetFilters}
            sx={{
              fontWeight: 600,
              bgcolor: alpha(dashboardSignatureTokens.tones.info.border, 0.16),
              color: dashboardSignatureTokens.tones.info.color
            }}
          />
        )}
      </Stack>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 2,
          borderRadius: `${dashboardSignatureTokens.radius.card}px`,
          border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
          background: dashboardSignatureTokens.surfaces.pageCard,
          boxShadow: dashboardSignatureTokens.shadows.card
        }}
      >
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search order, buyer ID, or buyer name..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              sx={filterFieldSx}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small" sx={filterFieldSx}>
              <InputLabel>Seller</InputLabel>
              <Select
                value={filterSeller}
                label="Seller"
                onChange={(e) => {
                  setFilterSeller(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <MenuItem value="All">All Sellers</MenuItem>
                {sellers.map((seller) => (
                  <MenuItem key={seller._id} value={seller._id}>
                    {seller.user?.username || seller.storeName || seller._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small" sx={filterFieldSx}>
              <InputLabel>About</InputLabel>
              <Select
                value={filterAbout}
                label="About"
                onChange={(e) => {
                  setFilterAbout(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <MenuItem value="All">All Categories</MenuItem>
                <MenuItem value="INR">INR</MenuItem>
                <MenuItem value="Cancellation">Cancellation</MenuItem>
                <MenuItem value="Return">Return</MenuItem>
                <MenuItem value="Refund">Refund</MenuItem>
                <MenuItem value="Replace">Replace</MenuItem>
                <MenuItem value="Out of Stock">Out of Stock</MenuItem>
                <MenuItem value="Issue with Product">Issue with Product</MenuItem>
                <MenuItem value="Issue with Delivery">Issue with Delivery</MenuItem>
                <MenuItem value="Inquiry">Inquiry</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small" sx={filterFieldSx}>
              <InputLabel>Case</InputLabel>
              <Select
                value={filterCase}
                label="Case"
                onChange={(e) => {
                  setFilterCase(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <MenuItem value="All">All Statuses</MenuItem>
                <MenuItem value="Case Opened">Case Opened</MenuItem>
                <MenuItem value="Case Not Opened">Case Not Opened</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small" sx={filterFieldSx}>
              <InputLabel>Picked Up By</InputLabel>
              <Select
                value={filterPickedUpBy}
                label="Picked Up By"
                onChange={(e) => {
                  setFilterPickedUpBy(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <MenuItem value="All">All Agents</MenuItem>
                <MenuItem value="__UNASSIGNED__">Unassigned</MenuItem>
                {chatAgents.map((agent) => (
                  <MenuItem key={agent._id} value={agent.name}>{agent.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small" sx={filterFieldSx}>
              <InputLabel>Date Filter</InputLabel>
              <Select
                value={dateFilterMode}
                label="Date Filter"
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setDateFilterMode(nextMode);
                  if (nextMode !== 'single') setSingleDate('');
                  if (nextMode !== 'range') {
                    setDateFrom('');
                    setDateTo('');
                  }
                  setCurrentPage(1);
                }}
              >
                <MenuItem value="none">No Date Filter</MenuItem>
                <MenuItem value="single">Single Date</MenuItem>
                <MenuItem value="range">Date Range</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {dateFilterMode === 'single' && (
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Creation Date"
                value={singleDate}
                onChange={(e) => {
                  setSingleDate(e.target.value);
                  setCurrentPage(1);
                }}
                InputLabelProps={{ shrink: true }}
                sx={filterFieldSx}
              />
            </Grid>
          )}
          {dateFilterMode === 'range' && (
            <>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="From"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={filterFieldSx}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="To"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={filterFieldSx}
                />
              </Grid>
            </>
          )}
        </Grid>
      </Paper>

      {loading ? (
        <Paper elevation={0} sx={{ ...tableContainerSx, py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">Loading conversations…</Typography>
        </Paper>
      ) : items.length === 0 ? (
        <Paper elevation={0} sx={{ ...tableContainerSx, py: 7, px: 3, textAlign: 'center' }}>
          <InboxOutlinedIcon sx={{ fontSize: 42, color: alpha(BRAND_DARK, 0.35), mb: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: BRAND_DARK, mb: 0.5 }}>
            No conversations match
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Try clearing filters or broadening the search.
          </Typography>
          {activeFilterCount > 0 && (
            <Button size="small" onClick={resetFilters} sx={yellowOutlinedButtonSx}>
              Reset Filters
            </Button>
          )}
        </Paper>
      ) : (
        <>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              ...tableContainerSx,
              overflow: 'auto',
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: { xs: 'none', md: 'calc(100vh - 340px)' }
            }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {visibleColumns.includes('sl') && <TableCell sx={tableHeaderCellSx}>SL</TableCell>}
                  {visibleColumns.includes('seller') && <TableCell sx={tableHeaderCellSx}>Seller</TableCell>}
                  {visibleColumns.includes('orderId') && <TableCell sx={tableHeaderCellSx}>Order ID</TableCell>}
                  {visibleColumns.includes('creationDate') && <TableCell sx={tableHeaderCellSx}>Created</TableCell>}
                  {visibleColumns.includes('username') && <TableCell sx={tableHeaderCellSx}>Buyer ID</TableCell>}
                  {visibleColumns.includes('buyerName') && <TableCell sx={tableHeaderCellSx}>Buyer Name</TableCell>}
                  {visibleColumns.includes('buyerSla') && <TableCell sx={tableHeaderCellSx}>Buyer SLA</TableCell>}
                  {visibleColumns.includes('sellerReply') && <TableCell sx={tableHeaderCellSx}>Seller Reply</TableCell>}
                  {visibleColumns.includes('about') && <TableCell sx={tableHeaderCellSx}>About</TableCell>}
                  {visibleColumns.includes('case') && <TableCell sx={tableHeaderCellSx}>Case</TableCell>}
                  {visibleColumns.includes('amazonAccount') && <TableCell sx={tableHeaderCellSx}>Amazon Acct</TableCell>}
                  {visibleColumns.includes('azOrderId') && <TableCell sx={tableHeaderCellSx}>AZ Order</TableCell>}
                  {visibleColumns.includes('pickedUpBy') && <TableCell sx={tableHeaderCellSx}>Picked Up By</TableCell>}
                  {visibleColumns.includes('action') && <TableCell align="center" sx={tableHeaderCellSx}>Action</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, index) => {
                  const buyerSla = getBuyerSlaLabel(item);
                  const sellerReply = getSellerReplyLabel(item);
                  return (
                    <TableRow key={item._id} hover sx={tableBodyRowSx}>
                      {visibleColumns.includes('sl') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Box component="span" sx={{ ...tableIndexBadgeSx, minWidth: 28, height: 28, fontSize: '0.75rem' }}>
                            {(currentPage - 1) * rowsPerPage + index + 1}
                          </Box>
                        </TableCell>
                      )}
                      {visibleColumns.includes('seller') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Chip
                            label={item.sellerName || 'Unknown'}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, borderColor: alpha(BRAND_DARK, 0.2) }}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.includes('orderId') && (
                        <TableCell sx={tableBodyCellSx}>
                          {item.orderId ? (
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>
                              {item.orderId}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="text.disabled">Inquiry</Typography>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.includes('creationDate') && (
                        <TableCell sx={{ ...tableBodyCellSx, color: 'text.secondary', fontSize: '0.8rem' }}>
                          {formatCreationDate(item.creationDate)}
                        </TableCell>
                      )}
                      {visibleColumns.includes('username') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {item.buyerUsername || '—'}
                          </Typography>
                        </TableCell>
                      )}
                      {visibleColumns.includes('buyerName') && (
                        <TableCell sx={{ ...tableBodyCellSx, fontWeight: 700 }}>
                          {item.buyerName || (
                            <Typography component="span" color="text.disabled" sx={{ fontWeight: 400 }}>—</Typography>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.includes('buyerSla') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Chip
                            label={buyerSla.label}
                            color={buyerSla.color}
                            size="small"
                            variant={buyerSla.color === 'default' ? 'outlined' : 'filled'}
                            sx={{ fontWeight: 600, height: 24 }}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.includes('sellerReply') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Chip
                            label={sellerReply.label}
                            color={sellerReply.color}
                            size="small"
                            variant={sellerReply.color === 'default' ? 'outlined' : 'filled'}
                            sx={{ fontWeight: 600, height: 24 }}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.includes('about') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Chip
                            label={formatCategory(item.category)}
                            size="small"
                            sx={{ bgcolor: alpha('#1565c0', 0.1), color: '#1565c0', fontWeight: 700, height: 24 }}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.includes('case') && (
                        <TableCell sx={tableBodyCellSx}>
                          <Chip
                            label={item.caseStatus}
                            color={item.caseStatus === 'Case Opened' ? 'error' : 'success'}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, height: 24 }}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.includes('amazonAccount') && (
                        <TableCell sx={tableBodyCellSx}>
                          {item.amazonAccount ? (
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{item.amazonAccount}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.includes('azOrderId') && (
                        <TableCell sx={tableBodyCellSx}>
                          {item.azOrderId ? (
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{item.azOrderId}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.includes('pickedUpBy') && (
                        <TableCell sx={{ ...tableBodyCellSx, minWidth: 140 }}>
                          <FormControl fullWidth size="small">
                            <Select
                              value={item.pickedUpBy || ''}
                              onChange={(e) => handlePickedUpByChange(item, e.target.value)}
                              displayEmpty
                              sx={{
                                fontSize: '0.8rem',
                                bgcolor: '#fff',
                                borderRadius: 1.25,
                                '& .MuiSelect-select': { py: 0.75 }
                              }}
                              renderValue={(selected) => (selected ? selected : <em style={{ color: '#999' }}>Unassigned</em>)}
                            >
                              <MenuItem value=""><em>Unassigned</em></MenuItem>
                              {chatAgents.map((agent) => (
                                <MenuItem key={agent._id} value={agent.name}>{agent.name}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                      )}
                      {visibleColumns.includes('action') && (
                        <TableCell align="center" sx={tableBodyCellSx}>
                          <Tooltip title="Open conversation">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<ChatIcon fontSize="small" />}
                              onClick={() => setSelectedItem(item)}
                              sx={{ ...yellowOutlinedButtonSx, minHeight: 32, px: 1.25, fontSize: '0.75rem' }}
                            >
                              Open
                            </Button>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Paper
            elevation={0}
            sx={{
              mt: 1.5,
              py: 1.25,
              px: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              borderRadius: `${dashboardSignatureTokens.radius.card}px`,
              border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
              background: dashboardSignatureTokens.surfaces.metricCard
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Showing {(currentPage - 1) * rowsPerPage + 1}–{(currentPage - 1) * rowsPerPage + items.length} of {totalItems.toLocaleString()}
            </Typography>
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={(event, value) => setCurrentPage(value)}
              color="primary"
              showFirstButton
              showLastButton
              size="small"
              siblingCount={1}
            />
          </Paper>
        </>
      )}

      <Dialog
        open={exportDialogOpen}
        onClose={() => !exportingCsv && setExportDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: `${dashboardSignatureTokens.radius.card}px`,
            overflow: 'hidden',
            boxShadow: dashboardSignatureTokens.shadows.card,
            background: dashboardSignatureTokens.surfaces.pageCard
          }
        }}
      >
        <Box sx={{ p: 3 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{
              mx: -3,
              mt: -3,
              mb: 2.5,
              px: 3,
              py: 2,
              bgcolor: BRAND_DARK,
              color: '#fff'
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Export CSV</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
                Download all rows matching the current filters.
              </Typography>
            </Box>
            <IconButton onClick={() => setExportDialogOpen(false)} disabled={exportingCsv} sx={{ color: 'rgba(255,255,255,0.8)' }}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={1} mb={2}>
            <Button size="small" variant="outlined" onClick={() => setSelectedExportColumns(exportableColumns.map((column) => column.id))} disabled={exportingCsv} sx={yellowOutlinedButtonSx}>Select All</Button>
            <Button size="small" variant="outlined" onClick={() => setSelectedExportColumns([])} disabled={exportingCsv} sx={yellowOutlinedButtonSx}>Clear All</Button>
          </Stack>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              maxHeight: 320,
              overflowY: 'auto',
              borderRadius: 2,
              borderColor: dashboardSignatureTokens.table.rowBorder,
              background: dashboardSignatureTokens.surfaces.metricCard
            }}
          >
            <Stack>
              {exportableColumns.map((column) => (
                <FormControlLabel
                  key={column.id}
                  sx={{
                    mx: 0,
                    px: 1,
                    borderRadius: 1.5,
                    '&:hover': { backgroundColor: dashboardSignatureTokens.table.rowHover }
                  }}
                  control={(
                    <Checkbox
                      checked={selectedExportColumns.includes(column.id)}
                      onChange={() => handleToggleExportColumn(column.id)}
                      disabled={exportingCsv}
                      sx={{ color: BRAND_DARK, '&.Mui-checked': { color: BRAND_DARK } }}
                    />
                  )}
                  label={column.label}
                />
              ))}
            </Stack>
          </Paper>
          {selectedExportColumns.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>Select at least one column to export.</Alert>
          )}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setExportDialogOpen(false)} disabled={exportingCsv} sx={yellowOutlinedButtonSx}>Cancel</Button>
            <Button variant="contained" onClick={handleDownloadCsv} disabled={exportingCsv || selectedExportColumns.length === 0} sx={yellowFilledButtonSx}>
              {exportingCsv ? 'Exporting...' : 'Download'}
            </Button>
          </Box>
        </Box>
      </Dialog>

      <Dialog
        open={manageAgentsOpen}
        onClose={() => { setManageAgentsOpen(false); setEditingAgent(null); setEditAgentName(''); setNewAgentName(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: `${dashboardSignatureTokens.radius.card}px`,
            overflow: 'hidden',
            boxShadow: dashboardSignatureTokens.shadows.card,
            background: dashboardSignatureTokens.surfaces.pageCard
          }
        }}
      >
        <Box sx={{ p: 3 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{
              mx: -3,
              mt: -3,
              mb: 2.5,
              px: 3,
              py: 2,
              bgcolor: BRAND_DARK,
              color: '#fff'
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Manage Agents</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
                Add, rename, or remove assignment owners.
              </Typography>
            </Box>
            <IconButton onClick={() => { setManageAgentsOpen(false); setEditingAgent(null); }} sx={{ color: 'rgba(255,255,255,0.8)' }}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={1} mb={2}>
            <TextField
              size="small"
              fullWidth
              placeholder="New agent name..."
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAgent(); }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddIcon />}
              onClick={handleAddAgent}
              disabled={agentSaving || !newAgentName.trim()}
              sx={yellowFilledButtonSx}
            >
              Add
            </Button>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              borderRadius: 2,
              borderColor: dashboardSignatureTokens.table.rowBorder,
              background: dashboardSignatureTokens.surfaces.metricCard
            }}
          >
            <List dense>
              {chatAgents.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No agents yet. Add one above.</Typography>
              )}
              {chatAgents.map((agent) => (
                <ListItem
                  key={agent._id}
                  disableGutters
                  sx={{
                    px: 1,
                    borderRadius: 1.5,
                    '&:hover': { backgroundColor: dashboardSignatureTokens.table.rowHover }
                  }}
                >
                  {editingAgent?._id === agent._id ? (
                    <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
                      <TextField
                        size="small"
                        fullWidth
                        value={editAgentName}
                        onChange={(e) => setEditAgentName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateAgent(); }}
                        autoFocus
                      />
                      <Button size="small" variant="contained" onClick={handleUpdateAgent} disabled={agentSaving} sx={yellowFilledButtonSx}>Save</Button>
                      <Button size="small" onClick={() => { setEditingAgent(null); setEditAgentName(''); }} sx={yellowOutlinedButtonSx}>Cancel</Button>
                    </Stack>
                  ) : (
                    <>
                      <ListItemText primary={agent.name} primaryTypographyProps={{ fontWeight: 600 }} />
                      <ListItemSecondaryAction>
                        <IconButton size="small" onClick={() => { setEditingAgent(agent); setEditAgentName(agent.name); }} sx={{ color: BRAND_DARK }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteAgent(agent)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </>
                  )}
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>
      </Dialog>

      <ResolutionDialog
        open={Boolean(selectedItem)}
        metaItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSave={fetchItems}
        chatAgents={chatAgents}
      />
    </AdminPageShell>
  );
}


