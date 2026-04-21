import React, { useEffect, useState, useRef } from 'react';
import {
  Dialog, Box, Typography, Stack, TextField, Button, Paper,
  CircularProgress, IconButton, Grid, FormControl, InputLabel, Select, MenuItem, Chip,
  Menu, ListSubheader, Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import api from '../lib/api';
import { CHAT_TEMPLATES as FALLBACK_TEMPLATES, personalizeTemplate } from '../constants/chatTemplates';
import TemplateManagementModal from './TemplateManagementModal';

/**
 * Reusable Chat Modal Component with Case Management
 * Displays chat history and allows sending messages + managing case status
 */
export default function ChatModal({
  open,
  onClose,
  orderId,
  buyerUsername,
  buyerName,
  itemId,
  title = 'Chat',
  category = 'General',
  caseStatus = 'Open',
  initialNotes = '',
  initialStatus = 'Open',
  onSave = null, // Optional callback to save resolution
  entityId = null, // Optional: ID of the entity (return, case, order) for saving
  entityType = null, // Optional: 'return', 'inr', 'cancellation'
}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState(initialStatus);
  const [savingResolution, setSavingResolution] = useState(false);
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
  const [chatTemplates, setChatTemplates] = useState(FALLBACK_TEMPLATES);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const messagesEndRef = useRef(null);

  // Fetch templates from API on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const { data } = await api.get('/chat-templates');
      if (data.templates && data.templates.length > 0) {
        setChatTemplates(data.templates);
      }
    } catch (e) {
      console.error('Failed to load chat templates, using fallback:', e);
      // Keep using fallback templates
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setNotes(initialNotes);
      setStatus(initialStatus);
      loadMessages();
    }
  }, [open, orderId, buyerUsername, itemId]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    setLoading(true);
    try {
      const params = { orderId };
      if (!orderId) {
        params.buyerUsername = buyerUsername;
        params.itemId = itemId;
      }
      const { data } = await api.get('/ebay/chat/messages', { params });
      setMessages(data || []);
    } catch (e) {
      console.error('Failed to load messages', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    try {
      const { data } = await api.post('/ebay/send-message', {
        orderId,
        buyerUsername,
        itemId,
        body: newMessage
      });
      setMessages([...messages, data.message]);
      setNewMessage('');
    } catch (e) {
      alert('Failed to send: ' + e.message);
    } finally {
      setSendingMsg(false);
    }
  }

  async function handleSaveResolution() {
    if (status === 'Resolved' && !notes.trim()) {
      alert('Notes are required to mark as Resolved.');
      return;
    }
    setSavingResolution(true);
    try {
      if (onSave) {
        await onSave({ notes, status, entityId, entityType });
      }
      onClose();
    } catch (e) {
      alert('Failed to save: ' + e.message);
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
    const personalizedText = personalizeTemplate(templateText, buyerName);
    setNewMessage(personalizedText);
    handleTemplateClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <Box sx={{ display: 'flex', height: '80vh' }}>
        {/* LEFT: CHAT */}
        <Box sx={{ width: '60%', borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6">Chat History</Typography>
              <Typography variant="caption" color="text.secondary">
                {buyerName} ({buyerUsername})
              </Typography>
            </Box>
            <Tooltip title="Choose a response template">
              <Button
                variant="outlined"
                size="small"
                onClick={handleTemplateClick}
                sx={{ 
                  bgcolor: 'white',
                  textTransform: 'none'
                }}
                endIcon={<ExpandMoreIcon />}
              >
                Templates
              </Button>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#f0f2f5' }}>
            {loading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : (
              <Stack spacing={2}>
                {messages.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                    No messages yet
                  </Typography>
                ) : (
                  messages.map((msg, i) => (
                    <Box
                      key={i}
                      sx={{
                        alignSelf: msg.sender === 'SELLER' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%'
                      }}
                    >
                      <Paper
                        sx={{
                          p: 1.5,
                          bgcolor: msg.sender === 'SELLER' ? '#1976d2' : '#fff',
                          color: msg.sender === 'SELLER' ? '#fff' : '#000'
                        }}
                      >
                        <Typography variant="body2">{msg.body}</Typography>
                      </Paper>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.5,
                          textAlign: msg.sender === 'SELLER' ? 'right' : 'left'
                        }}
                      >
                        {new Date(msg.messageDate).toLocaleString('en-US', { 
                          timeZone: 'America/Los_Angeles',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })} PT
                      </Typography>
                    </Box>
                  ))
                )}
                <div ref={messagesEndRef} />
              </Stack>
            )}
          </Box>
          <Box sx={{ p: 2, bgcolor: '#fff', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              maxRows={4}
              placeholder="Type message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              variant="contained"
              onClick={handleSendMessage}
              disabled={sendingMsg || !newMessage.trim()}
            >
              {sendingMsg ? <CircularProgress size={20} /> : <SendIcon />}
            </Button>
            <Menu
              anchorEl={templateAnchorEl}
              open={Boolean(templateAnchorEl)}
              onClose={handleTemplateClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{ style: { maxHeight: 400, width: 320 } }}
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
          </Box>
        </Box>

        {/* RIGHT: MANAGEMENT */}
        <Box sx={{ width: '40%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="h6">Manage Case</Typography>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
          </Box>
          <Box sx={{ p: 3, flex: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Conversation About</Typography>
                <Chip label={category || title} color="primary" variant="outlined" sx={{ mt: 0.5, fontWeight: 'bold', display: 'block' }} />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Case Status</Typography>
                <Chip 
                  label={caseStatus} 
                  color={caseStatus === 'Case Opened' ? 'error' : 'success'} 
                  variant="outlined" 
                  sx={{ mt: 0.5, fontWeight: 'bold', display: 'block' }} 
                />
              </Grid>
              <Grid item xs={12} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Resolution Notes</Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={8}
                  placeholder="Enter notes about how this was resolved..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  helperText={status === 'Resolved' ? 'Required for resolution' : 'Optional'}
                  error={status === 'Resolved' && !notes.trim()}
                />
              </Grid>
              <Grid item xs={12} sx={{ mt: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                    <MenuItem value="Open">Open</MenuItem>
                    <MenuItem value="Resolved">Resolved</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: '#f9f9f9', textAlign: 'right' }}>
            <Button 
              variant="contained" 
              color="success" 
              size="large"
              startIcon={<CheckCircleIcon />}
              onClick={handleSaveResolution}
              disabled={savingResolution}
            >
              {savingResolution ? 'Saving...' : 'SAVE & UPDATE'}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Template Management Modal */}
      <TemplateManagementModal
        open={manageTemplatesOpen}
        onClose={() => {
          setManageTemplatesOpen(false);
          loadTemplates(); // Reload templates after closing management modal
        }}
      />
    </Dialog>
  );
}
