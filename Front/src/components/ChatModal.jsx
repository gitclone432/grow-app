import React, { useEffect, useState, useRef } from 'react';
import {
  Dialog, Box, Typography, Stack, TextField, Button, Paper,
  CircularProgress, IconButton, FormControl, InputLabel, Select, MenuItem, Chip,
  Menu, ListSubheader, Tooltip, Link, useMediaQuery, useTheme, Alert
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PersonIcon from '@mui/icons-material/Person';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../lib/api';
import { CHAT_TEMPLATES as FALLBACK_TEMPLATES, personalizeTemplate } from '../constants/chatTemplates';
import TemplateManagementModal from './TemplateManagementModal';
import { BRAND_DARK } from '../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../theme/appTheme.js';
import { yellowFilledButtonSx, yellowOutlinedButtonSx } from '../theme/tableStyles.js';

/**
 * Shared Manage Case dialog — same experience as Conversation Management Action → Open.
 * Used by Issues & Resolutions (INR / Return / Cancelled) and other order chats.
 */
export default function ChatModal({
  open,
  onClose,
  orderId,
  buyerUsername,
  buyerName,
  itemId,
  itemTitle = '',
  sellerId = null,
  sellerName = '',
  conversationId: conversationIdProp = null,
  title = 'Chat',
  category = 'General',
  caseStatus = 'Case Not Opened',
  initialNotes = '',
  initialStatus = 'Open',
  initialPickedUpBy = '',
  onSave = null,
  entityId = null,
  entityType = null,
}) {
  const theme = useTheme();
  const isMobileChat = useMediaQuery(theme.breakpoints.down('sm'));
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState(initialStatus);
  const [pickedUpBy, setPickedUpBy] = useState(initialPickedUpBy || '');
  const [chatAgents, setChatAgents] = useState([]);
  const [savingResolution, setSavingResolution] = useState(false);
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
  const [chatTemplates, setChatTemplates] = useState(FALLBACK_TEMPLATES);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [resolvedBuyerName, setResolvedBuyerName] = useState('');
  const [resolvedConversationId, setResolvedConversationId] = useState('');
  const [resolvedOrderId, setResolvedOrderId] = useState('');

  const propBuyerName = String(buyerName || '').trim();
  const propBuyerId = String(buyerUsername || '').trim();
  // Prefer a real name over username; callers often pass username as buyerName by mistake.
  const hasDistinctPropName = Boolean(propBuyerName) && propBuyerName.toLowerCase() !== propBuyerId.toLowerCase();
  const resolvedDistinct = Boolean(resolvedBuyerName) && resolvedBuyerName.toLowerCase() !== propBuyerId.toLowerCase();
  const displayBuyerName = hasDistinctPropName
    ? propBuyerName
    : (resolvedDistinct ? resolvedBuyerName : '—');
  const templateBuyerName = hasDistinctPropName
    ? propBuyerName
    : (resolvedDistinct ? resolvedBuyerName : (propBuyerId || 'Buyer'));
  const displayBuyerId = propBuyerId || '-';
  const displaySeller = sellerName || 'Seller';
  const displayOrder = resolvedOrderId || orderId || 'N/A';

  function dedupeMessagesForDisplay(list) {
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

  useEffect(() => {
    loadTemplates();
    loadAgents();
  }, []);

  useEffect(() => {
    if (open) {
      setNotes(initialNotes);
      setStatus(initialStatus);
      setPickedUpBy(initialPickedUpBy || '');
      setAttachments([]);
      setNewMessage('');
      setResolvedBuyerName('');
      setResolvedConversationId(conversationIdProp || '');
      setResolvedOrderId(orderId || '');
      loadMessages();
    }
  }, [open, orderId, buyerUsername, itemId, sellerId, buyerName, conversationIdProp]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const { data } = await api.get('/chat-templates');
      if (data.templates?.length) setChatTemplates(data.templates);
    } catch (e) {
      console.error('Failed to load chat templates, using fallback:', e);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function loadAgents() {
    try {
      const { data } = await api.get('/ebay/chat-agents');
      setChatAgents(data || []);
    } catch (e) {
      console.error('Failed to load chat agents', e);
    }
  }

  async function loadMessages() {
    setLoading(true);

    // 1) Resolve order for this buyer+seller (ignore mis-stamped case orderId)
    let effectiveOrderId = orderId || '';
    let effectiveItemId = itemId || '';
    let effectiveBuyer = buyerUsername || '';
    let effectiveConversationId = conversationIdProp || '';

    if (sellerId && buyerUsername) {
      try {
        const { data: orderData } = await api.get('/ebay/chat/search-order', {
          params: {
            sellerId,
            buyerUsername,
            itemId: itemId || undefined,
            orderId: orderId || undefined
          }
        });
        if (orderData?.orderId) effectiveOrderId = orderData.orderId;
        if (orderData?.itemId) effectiveItemId = orderData.itemId || effectiveItemId;
        if (orderData?.buyerUsername) effectiveBuyer = orderData.buyerUsername;
        if (orderData?.buyerName) {
          const name = String(orderData.buyerName).trim();
          const user = String(orderData.buyerUsername || buyerUsername || '').trim();
          if (name && name.toLowerCase() !== user.toLowerCase()) {
            setResolvedBuyerName(name);
          }
        }
      } catch (e) {
        // keep case orderId only if search failed
      }

      // 2) Exact seller + buyerId + orderId → conversationId (Buyer Messages cache)
      try {
        const { data } = await api.get('/ebay/chat/resolve-conversation', {
          params: {
            sellerId,
            buyerUsername: effectiveBuyer || buyerUsername,
            itemId: effectiveItemId || undefined,
            orderId: effectiveOrderId || undefined,
            conversationId: conversationIdProp || undefined
          }
        });
        if (data?.conversationId) {
          effectiveConversationId = data.conversationId;
          setResolvedConversationId(data.conversationId);
        }
        if (data?.orderId) {
          effectiveOrderId = data.orderId;
          setResolvedOrderId(data.orderId);
        } else if (effectiveOrderId) {
          setResolvedOrderId(effectiveOrderId);
        }
        if (data?.itemId) effectiveItemId = data.itemId;
        if (data?.buyerUsername) effectiveBuyer = data.buyerUsername;
        if (data?.buyerName) {
          const name = String(data.buyerName).trim();
          const user = String(data.buyerUsername || buyerUsername || '').trim();
          if (name && name.toLowerCase() !== user.toLowerCase()) {
            setResolvedBuyerName(name);
          }
        }
      } catch (e) {
        if (effectiveOrderId) setResolvedOrderId(effectiveOrderId);
      }
    }

    // 3) Load that conversation only (conversationId is the key)
    const params = { sellerId };
    if (effectiveBuyer) params.buyerUsername = effectiveBuyer;
    if (effectiveConversationId) {
      params.conversationId = effectiveConversationId;
      if (effectiveOrderId) params.orderId = effectiveOrderId;
    } else {
      if (effectiveItemId) params.itemId = effectiveItemId;
      if (effectiveOrderId) params.orderId = effectiveOrderId;
    }

    try {
      const { data } = await api.get('/ebay/chat/messages', { params });
      setMessages(dedupeMessagesForDisplay(data));
    } catch (e) {
      console.error('Failed to load messages', e);
      setMessages([]);
    } finally {
      setLoading(false);
    }

    if (sellerId && effectiveConversationId) {
      (async () => {
        try {
          await api.post(
            '/ebay/sync-thread',
            {
              sellerId,
              buyerUsername: effectiveBuyer || undefined,
              itemId: effectiveItemId || undefined,
              orderId: effectiveOrderId || undefined,
              conversationId: effectiveConversationId,
              commerceOnly: true
            },
            { timeout: 90000 }
          );
          const { data } = await api.get('/ebay/chat/messages', { params });
          setMessages(dedupeMessagesForDisplay(data));
        } catch (e) {
          if (e.response?.status !== 401 && e.response?.status !== 403) {
            console.error('Thread sync failed', e);
          }
        }
      })();
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim() && attachments.length === 0) return;
    setSendingMsg(true);
    try {
      const { data } = await api.post('/ebay/send-message', {
        orderId: resolvedOrderId || orderId,
        buyerUsername,
        itemId,
        sellerId,
        conversationId: resolvedConversationId || conversationIdProp || undefined,
        body: newMessage,
        mediaUrls: attachments.map((a) => a.url)
      });
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
      setAttachments([]);
    } catch (e) {
      alert('Failed to send: ' + (e.response?.data?.error || e.message));
    } finally {
      setSendingMsg(false);
    }
  }

  async function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
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
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function mapMetaCategory() {
    const raw = String(category || '').toLowerCase();
    if (raw.includes('inr') || raw.includes('item not received')) return 'INR';
    if (raw.includes('return')) return 'Return';
    if (raw.includes('cancel')) return 'Cancellation';
    if (raw.includes('refund')) return 'Refund';
    if (raw.includes('replace')) return 'Replace';
    if (raw.includes('inquiry')) return 'Inquiry';
    if (['inr', 'cancellation', 'return', 'refund', 'replace', 'out of stock', 'issue with product', 'issue with delivery', 'inquiry'].includes(raw)) {
      return category;
    }
    return entityType === 'inr' ? 'INR'
      : entityType === 'return' ? 'Return'
      : entityType === 'cancellation' ? 'Cancellation'
      : '';
  }

  function caseStatusLabel() {
    if (caseStatus == null || caseStatus === '') return '—';
    if (typeof caseStatus === 'string' || typeof caseStatus === 'number' || typeof caseStatus === 'boolean') {
      return String(caseStatus);
    }
    // Cancelled orders store cancelStatus as an object; prefer cancelState-style strings from callers.
    if (typeof caseStatus === 'object') {
      const nested =
        caseStatus.cancelState
        || caseStatus.status
        || caseStatus.state
        || caseStatus.value;
      if (nested != null && nested !== '') return String(nested);
    }
    return '—';
  }

  function mapMetaCaseStatus() {
    const raw = caseStatusLabel();
    if (/case opened/i.test(raw) || /OPEN/i.test(raw)) return 'Case Opened';
    return 'Case Not Opened';
  }

  async function handleSaveResolution() {
    if (status === 'Resolved' && !notes.trim()) {
      alert('Notes are required to mark as Resolved.');
      return;
    }
    setSavingResolution(true);
    try {
      if (sellerId && (orderId || (buyerUsername && itemId))) {
        const { data } = await api.post('/ebay/conversation-meta', {
          sellerId,
          buyerUsername,
          orderId: orderId || null,
          itemId: itemId || undefined,
          category: mapMetaCategory(),
          caseStatus: mapMetaCaseStatus(),
          status,
          pickedUpBy: pickedUpBy || null
        });
        if (data?.meta?._id) {
          await api.patch(`/ebay/conversation-management/${data.meta._id}/resolve`, {
            notes,
            status,
            pickedUpBy: pickedUpBy || null
          });
        }
      } else if (onSave) {
        await onSave({ notes, status, pickedUpBy, entityId, entityType });
      }
      onClose();
    } catch (e) {
      alert('Failed to save: ' + (e.response?.data?.error || e.message));
    } finally {
      setSavingResolution(false);
    }
  }

  const handleTemplateClick = (event) => setTemplateAnchorEl(event.currentTarget);
  const handleTemplateClose = () => setTemplateAnchorEl(null);
  const handleSelectTemplate = (templateText) => {
    setNewMessage(personalizeTemplate(templateText, templateBuyerName));
    handleTemplateClose();
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const displayCaseStatus = caseStatusLabel();

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
          <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.5, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.1)}`, bgcolor: '#fff' }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: 1 }}>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.4, color: 'text.secondary', textTransform: 'uppercase' }}>
                    Buyer
                  </Typography>
                  <Typography sx={{ fontWeight: 700, color: BRAND_DARK, lineHeight: 1.2, fontSize: { xs: '0.95rem', sm: '1.05rem' } }}>
                    {displayBuyerName}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.4, color: 'text.secondary', textTransform: 'uppercase' }}>
                    Buyer ID
                  </Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, bgcolor: alpha(BRAND_DARK, 0.06), px: 0.75, py: 0.25, borderRadius: 1 }}>
                    {displayBuyerId}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={0.75} alignItems="center" flexShrink={0}>
                {displaySeller && displaySeller !== 'Seller' && (
                  <Chip
                    label={displaySeller}
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
                )}
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
                  <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
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
                label={displayOrder !== 'N/A' ? `Order ${displayOrder}` : (title || 'Inquiry')}
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
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight={180}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Stack spacing={1.5} sx={{ width: '100%' }}>
                {messages.length === 0 && (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    No messages in this thread yet.
                  </Alert>
                )}
                {messages.map((msg, i) => {
                  const fromUser = String(msg.senderUsername || '').trim().toLowerCase();
                  const buyerUser = String(buyerUsername || msg.buyerUsername || '').trim().toLowerCase();
                  const sellerUser = String(displaySeller || '').trim().toLowerCase();
                  let isSeller = String(msg.sender || '').toUpperCase() === 'SELLER';
                  if (fromUser) {
                    if (buyerUser && fromUser === buyerUser) isSeller = false;
                    else if (sellerUser && fromUser === sellerUser) isSeller = true;
                    else if (buyerUser && fromUser !== buyerUser) isSeller = true;
                  }
                  const senderLabel = isSeller
                    ? (displaySeller || msg.senderUsername || 'Seller')
                    : (displayBuyerName !== '—'
                      ? displayBuyerName
                      : (msg.senderUsername && msg.senderUsername.toLowerCase() !== String(buyerUsername || '').toLowerCase()
                        ? msg.senderUsername
                        : (templateBuyerName || 'Buyer')));
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
                      sx={{ display: 'flex', justifyContent: isSeller ? 'flex-end' : 'flex-start', width: '100%' }}
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
                          <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8, fontWeight: 700, fontSize: '0.68rem' }}>
                            {senderLabel} · {isSeller ? 'seller' : 'buyer'}
                          </Typography>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: { xs: '0.82rem', sm: '0.875rem' }, lineHeight: 1.5 }}>
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
                                  <Box key={index} component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ display: 'block', borderRadius: 1.5, overflow: 'hidden', lineHeight: 0 }}>
                                    <Box component="img" src={url} alt={name} loading="lazy" sx={{ display: 'block', maxWidth: { xs: 160, sm: 240 }, maxHeight: 180, objectFit: 'contain', bgcolor: '#fff' }} />
                                  </Box>
                                ) : (
                                  <Chip
                                    key={index}
                                    icon={<AttachFileIcon />}
                                    label={name.length > 28 ? `${name.slice(0, 28)}…` : name}
                                    onClick={() => window.open(url, '_blank')}
                                    sx={{ cursor: 'pointer', color: 'inherit', bgcolor: isSeller ? 'rgba(255,255,255,.18)' : alpha(BRAND_DARK, 0.08) }}
                                  />
                                );
                              })}
                            </Box>
                          )}
                        </Paper>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: isSeller ? 'right' : 'left', fontSize: '0.7rem' }}>
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

          <Box sx={{ p: { xs: 1, sm: 1.25 }, bgcolor: '#fff', borderTop: `1px solid ${alpha(BRAND_DARK, 0.1)}`, flexShrink: 0 }}>
            {attachments.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {attachments.map((attachment, index) => (
                  <Chip
                    key={`${attachment.url}-${index}`}
                    label={attachment.name}
                    size="small"
                    variant="outlined"
                    onDelete={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                    sx={{ maxWidth: { xs: 150, sm: 220 } }}
                  />
                ))}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <input ref={fileInputRef} type="file" multiple accept="image/*" hidden onChange={handleFileSelect} />
              <Tooltip title="Attach images">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sendingMsg}
                    sx={{ mb: 0.5, border: `1px solid ${alpha(BRAND_DARK, 0.14)}`, borderRadius: 1.5 }}
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
                onKeyDown={handleKeyDown}
                disabled={sendingMsg}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: alpha(BRAND_DARK, 0.02) } }}
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
              PaperProps={{ style: { maxHeight: 400, width: 320 }, sx: { borderRadius: 2, mt: -0.5 } }}
            >
              <MenuItem
                onClick={() => { handleTemplateClose(); setManageTemplatesOpen(true); }}
                sx={{ borderBottom: `2px solid ${alpha(BRAND_DARK, 0.08)}`, bgcolor: alpha(BRAND_DARK, 0.03), py: 1.5 }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <SettingsIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2" color="primary">Manage Templates</Typography>
                </Stack>
              </MenuItem>
              {templatesLoading ? (
                <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
              ) : (
                chatTemplates.map((group, index) => (
                  <Box key={index}>
                    <ListSubheader sx={{ bgcolor: alpha(BRAND_DARK, 0.04), fontWeight: 800, lineHeight: '32px', color: BRAND_DARK, fontSize: '0.72rem' }}>
                      {group.category}
                    </ListSubheader>
                    {group.items.map((item, idx) => (
                      <MenuItem
                        key={item._id || idx}
                        onClick={() => handleSelectTemplate(item.text)}
                        sx={{ fontSize: '0.85rem', whiteSpace: 'normal', py: 1, borderBottom: `1px solid ${alpha(BRAND_DARK, 0.06)}`, display: 'block' }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{item.label}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.72rem' }}>
                          {item.text}
                        </Typography>
                      </MenuItem>
                    ))}
                  </Box>
                ))
              )}
            </Menu>
          </Box>
        </Box>

        <Box
          sx={{
            width: { xs: '100%', sm: '38%' },
            display: 'flex',
            flexDirection: 'column',
            bgcolor: dashboardSignatureTokens.surfaces.metricCard,
            minHeight: { xs: '45%', sm: 0 }
          }}
        >
          <Box sx={{ px: 2, py: 1.5, bgcolor: BRAND_DARK, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  label={String(category || title || '—')}
                  size="small"
                  sx={{ mt: 0.75, display: 'flex', width: 'fit-content', bgcolor: alpha('#1565c0', 0.1), color: '#1565c0', fontWeight: 700 }}
                />
              </Box>
              <Box sx={{ flex: '1 1 140px' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Case
                </Typography>
                <Chip
                  label={displayCaseStatus}
                  size="small"
                  color={/opened|open/i.test(displayCaseStatus) && !/not opened/i.test(displayCaseStatus) ? 'error' : 'success'}
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
              sx={{ mb: 2, '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 } }}
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

            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)} sx={{ bgcolor: '#fff', borderRadius: 1.5 }}>
                <MenuItem value="Open">Open</MenuItem>
                <MenuItem value="In Progress">In Progress</MenuItem>
                <MenuItem value="Resolved">Resolved</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ p: 2, borderTop: `1px solid ${alpha(BRAND_DARK, 0.1)}`, bgcolor: '#fff', display: 'flex', justifyContent: 'flex-end' }}>
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

      <TemplateManagementModal
        open={manageTemplatesOpen}
        onClose={() => {
          setManageTemplatesOpen(false);
          loadTemplates();
        }}
      />
    </Dialog>
  );
}
