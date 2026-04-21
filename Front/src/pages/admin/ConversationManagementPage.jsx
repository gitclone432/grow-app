import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog,
  Stack, TextField, Button, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Alert, Grid, InputAdornment, Menu, ListSubheader, Tooltip,
  Divider, Link, useMediaQuery, useTheme, List, ListItem, ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleIcon from '@mui/icons-material/People';
import api from '../../lib/api';
import { CHAT_TEMPLATES, personalizeTemplate } from '../../constants/chatTemplates';
import ColumnSelector from '../../components/ColumnSelector';


// --- RESOLUTION MODAL COMPONENT (Unchanged logic, kept for completeness) ---
function ResolutionDialog({ open, onClose, metaItem, onSave, chatAgents = [] }) {
  const theme = useTheme();
  const isMobileChat = useMediaQuery(theme.breakpoints.down('sm'));
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef(null);
  const [notes, setNotes] = useState(metaItem?.notes || '');
  const [status, setStatus] = useState(metaItem?.status || 'Open');
  const [pickedUpBy, setPickedUpBy] = useState(metaItem?.pickedUpBy || '');
  const [savingResolution, setSavingResolution] = useState(false);
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);

  useEffect(() => {
    if (open && metaItem) {
      setNotes(metaItem.notes || '');
      setStatus(metaItem.status || 'Open');
      setPickedUpBy(metaItem.pickedUpBy || '');
      loadMessages();
    }
  }, [open, metaItem]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    try {
      const params = { orderId: metaItem.orderId };
      if (!metaItem.orderId) {
        params.buyerUsername = metaItem.buyerUsername;
        params.itemId = metaItem.itemId;
      }
      const { data } = await api.get('/ebay/chat/messages', { params });
      setMessages(data || []);
    } catch (e) {
      console.error("Failed to load messages", e);
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    try {
      const { data } = await api.post('/ebay/send-message', {
        orderId: metaItem.orderId,
        buyerUsername: metaItem.buyerUsername,
        itemId: metaItem.itemId,
        body: newMessage
      });
      setMessages([...messages, data.message]);
      setNewMessage('');
    } catch (e) {
      alert("Failed to send: " + e.message);
    } finally {
      setSendingMsg(false);
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
    const nameToUse = metaItem?.buyerName || metaItem?.buyerUsername || 'Buyer';
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
  const buyerName = metaItem?.buyerName || '-';
  const buyerUsername = metaItem?.buyerUsername || '-';
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
    >
      <Box sx={{ display: 'flex', height: { xs: '100vh', sm: '80vh' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        {/* LEFT: CHAT */}
        <Box sx={{ width: { xs: '100%', sm: '60%' }, borderRight: { xs: 0, sm: 1 }, borderBottom: { xs: 1, sm: 0 }, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          {/* --- HEADER (MATCHING FULFILLMENT DASHBOARD) --- */}
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
                  disabled={sendingMsg}
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
                {itemId && (
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
                )}

                <Chip
                  label={`Order: ${orderId}`}
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
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#f0f2f5' }}>
            <Stack spacing={2}>
              {messages.map((msg, i) => (
                <Box key={i} sx={{ alignSelf: msg.sender === 'SELLER' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <Paper sx={{ p: 1.5, bgcolor: msg.sender === 'SELLER' ? '#1976d2' : '#fff', color: msg.sender === 'SELLER' ? '#fff' : '#000' }}>
                    <Typography variant="body2">{msg.body}</Typography>
                  </Paper>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, textAlign: msg.sender === 'SELLER' ? 'right' : 'left' }}>
                    {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                  </Typography>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Stack>
          </Box>
          <Box sx={{ p: 2, bgcolor: '#fff', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              maxRows={4}
              placeholder="Type message..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={handleMessageKeyDown}
            />
            <Button variant="contained" onClick={handleSendMessage} disabled={sendingMsg}>
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
              {CHAT_TEMPLATES.map((group, index) => (
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
                      key={idx}
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
              ))}
            </Menu>
          </Box>
        </Box>

        {/* RIGHT: MANAGEMENT */}
        <Box sx={{ width: { xs: '100%', sm: '40%' }, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="h6">Manage Case</Typography>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
          </Box>
          <Box sx={{ p: 3, flex: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Conversation About</Typography>
                <Chip label={formatCategory(metaItem?.category)} color="primary" variant="outlined" sx={{ mt: 0.5, fontWeight: 'bold' }} />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Case Status</Typography>
                <Chip
                  label={metaItem?.caseStatus}
                  color={metaItem?.caseStatus === 'Case Opened' ? 'error' : 'success'}
                  variant="outlined"
                  sx={{ mt: 0.5, fontWeight: 'bold' }}
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
                  helperText={status === 'Resolved' ? "Required for resolution" : "Optional"}
                  error={status === 'Resolved' && !notes.trim()}
                />
              </Grid>
              <Grid item xs={12} sx={{ mt: 2 }}>
                <Grid container spacing={1.5} alignItems="flex-end">
                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel shrink>Picked Up By</InputLabel>
                      <Select
                        value={pickedUpBy}
                        label="Picked Up By"
                        onChange={(e) => setPickedUpBy(e.target.value)}
                        displayEmpty
                        notched
                        renderValue={(selected) => (selected ? selected : <em style={{ color: '#999' }}>— Unassigned —</em>)}
                      >
                        <MenuItem value=""><em>— Unassigned —</em></MenuItem>
                        {chatAgents.map(agent => (
                          <MenuItem key={agent._id} value={agent.name}>{agent.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={7}>
                    <FormControl fullWidth>
                      <InputLabel>Status</InputLabel>
                      <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                        <MenuItem value="Open">Open</MenuItem>
                        <MenuItem value="In Progress">In Progress</MenuItem>
                        <MenuItem value="Resolved">Resolved</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    <Button
                      fullWidth
                      variant="outlined"
                      color="warning"
                      onClick={handleEscalateClick}
                    >
                      Escalate
                    </Button>
                  </Grid>
                </Grid>
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
              {savingResolution ? 'Saving...' : 'Save & Update'}
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

export default function ConversationManagementPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // Chat Agents (Picked Up By)
  const [chatAgents, setChatAgents] = useState([]);
  const [manageAgentsOpen, setManageAgentsOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [editingAgent, setEditingAgent] = useState(null); // { _id, name }
  const [editAgentName, setEditAgentName] = useState('');
  const [agentSaving, setAgentSaving] = useState(false);

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
    { id: 'username', label: 'Username' },
    { id: 'buyerName', label: 'Buyer Name' },
    { id: 'buyerSla', label: 'Buyer SLA' },
    { id: 'sellerReply', label: 'Seller Last Reply' },
    { id: 'about', label: 'Conversation About' },
    { id: 'case', label: 'Case' },
    { id: 'pickedUpBy', label: 'Picked Up By' },
    { id: 'action', label: 'Action' },
  ];
  const [visibleColumns, setVisibleColumns] = useState(ALL_COLUMNS.map(c => c.id));

  // --- FILTERS STATE ---
  const [searchText, setSearchText] = useState('');
  const [filterSeller, setFilterSeller] = useState('All');
  const [filterAbout, setFilterAbout] = useState('All');
  const [filterCase, setFilterCase] = useState('All');

  useEffect(() => {
    fetchItems();
    fetchAgents();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const { data } = await api.get('/ebay/conversation-management/list', { params: { status: 'Case Not Opened,Open,In Progress' } });
      setItems(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

  // --- FILTER LOGIC ---
  // Extract unique sellers for the dropdown
  const uniqueSellers = useMemo(() => {
    const sellers = new Set(items.map(i => i.sellerName).filter(Boolean));
    return Array.from(sellers);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. Text Search (Matches OrderID, Username, BuyerName)
      const query = searchText.toLowerCase();
      const matchesText =
        (item.orderId && item.orderId.toLowerCase().includes(query)) ||
        (item.buyerUsername && item.buyerUsername.toLowerCase().includes(query)) ||
        (item.buyerName && item.buyerName.toLowerCase().includes(query));

      // 2. Dropdown Filters
      const matchesSeller = filterSeller === 'All' || item.sellerName === filterSeller;
      const matchesAbout = filterAbout === 'All' || formatCategory(item.category) === filterAbout;
      const matchesCase = filterCase === 'All' || item.caseStatus === filterCase;

      return matchesText && matchesSeller && matchesAbout && matchesCase;
    });
  }, [items, searchText, filterSeller, filterAbout, filterCase]);

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Conversation Management</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button startIcon={<FilterListIcon />} onClick={() => {
            setSearchText(''); setFilterSeller('All'); setFilterAbout('All'); setFilterCase('All');
          }}>
            Reset Filters
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PeopleIcon />}
            onClick={() => setManageAgentsOpen(true)}
          >
            Manage Agents
          </Button>
          <Box>
            <ColumnSelector
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              onColumnChange={setVisibleColumns}
              onReset={() => setVisibleColumns(ALL_COLUMNS.map(c => c.id))}
              page="conversation-management"
            />
          </Box>
        </Stack>
      </Stack>

      {/* --- FILTER BAR --- */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Search Box */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search Order, User, or Buyer Name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Seller Filter */}
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter Seller</InputLabel>
              <Select
                value={filterSeller}
                label="Filter Seller"
                onChange={(e) => setFilterSeller(e.target.value)}
              >
                <MenuItem value="All">All Sellers</MenuItem>
                {uniqueSellers.map(seller => (
                  <MenuItem key={seller} value={seller}>{seller}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* About Filter */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter About</InputLabel>
              <Select
                value={filterAbout}
                label="Filter About"
                onChange={(e) => setFilterAbout(e.target.value)}
              >
                <MenuItem value="All">All Categories</MenuItem>
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
          </Grid>

          {/* Case Filter */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter Case</InputLabel>
              <Select
                value={filterCase}
                label="Filter Case"
                onChange={(e) => setFilterCase(e.target.value)}
              >
                <MenuItem value="All">All Statuses</MenuItem>
                <MenuItem value="Case Opened">Case Opened</MenuItem>
                <MenuItem value="Case Not Opened">Case Not Opened</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* --- TABLE --- */}
      {loading ? (
        <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>
      ) : filteredItems.length === 0 ? (
        <Alert severity="info">No active conversation cases found matching your filters.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ bgcolor: '#eee' }}>
              <TableRow>
                {visibleColumns.includes('sl') && <TableCell sx={{ fontWeight: 'bold' }}>SL No</TableCell>}
                {visibleColumns.includes('seller') && <TableCell sx={{ fontWeight: 'bold' }}>Seller</TableCell>}
                {visibleColumns.includes('orderId') && <TableCell sx={{ fontWeight: 'bold' }}>Order ID</TableCell>}
                {visibleColumns.includes('username') && <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>}
                {visibleColumns.includes('buyerName') && <TableCell sx={{ fontWeight: 'bold' }}>Buyer Name</TableCell>}
                {visibleColumns.includes('buyerSla') && <TableCell sx={{ fontWeight: 'bold' }}>Buyer SLA</TableCell>}
                {visibleColumns.includes('sellerReply') && <TableCell sx={{ fontWeight: 'bold' }}>Seller Last Reply</TableCell>}
                {visibleColumns.includes('about') && <TableCell sx={{ fontWeight: 'bold' }}>Conversation About</TableCell>}
                {visibleColumns.includes('case') && <TableCell sx={{ fontWeight: 'bold' }}>Case</TableCell>}
                {visibleColumns.includes('pickedUpBy') && <TableCell sx={{ fontWeight: 'bold' }}>Picked Up By</TableCell>}
                {visibleColumns.includes('action') && <TableCell align="center" sx={{ fontWeight: 'bold' }}>Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item, index) => {
                const buyerSla = getBuyerSlaLabel(item);
                const sellerReply = getSellerReplyLabel(item);
                return (
                  <TableRow key={item._id} hover>
                    {/* SERIAL NUMBER */}
                    {visibleColumns.includes('sl') && <TableCell>{index + 1}</TableCell>}

                    {/* SELLER NAME (Added) */}
                    {visibleColumns.includes('seller') && <TableCell>
                      <Chip label={item.sellerName || 'Unknown'} size="small" variant="outlined" />
                    </TableCell>}

                    {visibleColumns.includes('orderId') && <TableCell>
                      {item.orderId ? (
                        <Chip label={item.orderId} size="small" variant="outlined" sx={{ bgcolor: '#fafafa' }} />
                      ) : (
                        <Typography color="text.secondary">-</Typography>
                      )}
                    </TableCell>}
                    {visibleColumns.includes('username') && <TableCell>{item.buyerUsername}</TableCell>}
                    {visibleColumns.includes('buyerName') && <TableCell sx={{ fontWeight: 'bold' }}>{item.buyerName}</TableCell>}
                    {visibleColumns.includes('buyerSla') && <TableCell>
                      <Chip
                        label={buyerSla.label}
                        color={buyerSla.color}
                        size="small"
                        variant={buyerSla.color === 'default' ? 'outlined' : 'filled'}
                      />
                    </TableCell>}
                    {visibleColumns.includes('sellerReply') && <TableCell>
                      <Chip
                        label={sellerReply.label}
                        color={sellerReply.color}
                        size="small"
                        variant={sellerReply.color === 'default' ? 'outlined' : 'filled'}
                      />
                    </TableCell>}
                    {visibleColumns.includes('about') && <TableCell>
                      <Chip label={formatCategory(item.category)} color="primary" size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 'bold' }} />
                    </TableCell>}
                    {visibleColumns.includes('case') && <TableCell>
                      <Chip
                        label={item.caseStatus}
                        color={item.caseStatus === 'Case Opened' ? 'error' : 'success'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>}
                    {visibleColumns.includes('pickedUpBy') && (
                      <TableCell sx={{ minWidth: 150 }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={item.pickedUpBy || ''}
                            onChange={(e) => handlePickedUpByChange(item, e.target.value)}
                            displayEmpty
                            sx={{ fontSize: '0.8rem' }}
                            renderValue={(selected) => (selected ? selected : <em style={{ color: '#999' }}>— Unassigned —</em>)}
                          >
                            <MenuItem value=""><em>— Unassigned —</em></MenuItem>
                            {chatAgents.map(agent => (
                              <MenuItem key={agent._id} value={agent.name}>{agent.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                    )}
                    {visibleColumns.includes('action') && <TableCell align="center">
                      <IconButton color="primary" onClick={() => setSelectedItem(item)}>
                        <ChatIcon />
                      </IconButton>
                    </TableCell>}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* MANAGE AGENTS DIALOG */}
      <Dialog open={manageAgentsOpen} onClose={() => { setManageAgentsOpen(false); setEditingAgent(null); setEditAgentName(''); setNewAgentName(''); }} maxWidth="xs" fullWidth>
        <Box sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Manage Agents</Typography>
            <IconButton onClick={() => { setManageAgentsOpen(false); setEditingAgent(null); }}><CloseIcon /></IconButton>
          </Stack>

          {/* Add new agent */}
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
            >
              Add
            </Button>
          </Stack>

          <Divider sx={{ mb: 1 }} />

          {/* Agent list */}
          <List dense>
            {chatAgents.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No agents yet. Add one above.</Typography>
            )}
            {chatAgents.map(agent => (
              <ListItem key={agent._id} disableGutters>
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
                    <Button size="small" variant="contained" onClick={handleUpdateAgent} disabled={agentSaving}>Save</Button>
                    <Button size="small" onClick={() => { setEditingAgent(null); setEditAgentName(''); }}>Cancel</Button>
                  </Stack>
                ) : (
                  <>
                    <ListItemText primary={agent.name} />
                    <ListItemSecondaryAction>
                      <IconButton size="small" onClick={() => { setEditingAgent(agent); setEditAgentName(agent.name); }}>
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
        </Box>
      </Dialog>

      {/* RESOLUTION MODAL */}
      <ResolutionDialog
        open={Boolean(selectedItem)}
        metaItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSave={fetchItems}
        chatAgents={chatAgents}
      />
    </Box>
  );
}
