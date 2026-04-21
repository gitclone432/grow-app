import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MessageIcon from '@mui/icons-material/Message';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../lib/api';

export default function MessageReceivedPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('false'); // Show unresolved by default

  // Dialog state
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadStoredMessages();
  }, [resolvedFilter]);

  async function loadStoredMessages() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (resolvedFilter !== '') params.isResolved = resolvedFilter;

      const res = await api.get('/ebay/stored-messages', { params });
      const messageData = res.data.messages || [];
      console.log(`Loaded ${messageData.length} messages from database`);
      setMessages(messageData);
    } catch (e) {
      console.error('Failed to load messages:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessagesFromEbay() {
    setFetching(true);
    setError('');
    setSnackbarMsg('');
    try {
      const res = await api.post('/ebay/fetch-messages');
      const { totalNewMessages, totalUpdatedMessages, results, errors } = res.data;

      let msg = `✅ Fetch complete!\n`;
      msg += `New messages: ${totalNewMessages}\n`;
      msg += `Updated messages: ${totalUpdatedMessages}\n\n`;

      if (results && results.length > 0) {
        results.forEach(r => {
          msg += `${r.sellerName}: ${r.newMessages} new, ${r.updatedMessages} updated\n`;
        });
      }

      if (errors && errors.length > 0) {
        msg += `\n⚠️ Errors:\n${errors.join('\n')}`;
      }

      setSnackbarMsg(msg);

      // Reload messages from database
      await loadStoredMessages();
    } catch (e) {
      console.error('Failed to fetch messages:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setFetching(false);
    }
  }

  async function toggleResolvedStatus(messageId, currentStatus) {
    try {
      await api.patch(`/ebay/messages/${messageId}/resolve`, {
        isResolved: !currentStatus
      });

      // Reload messages
      await loadStoredMessages();
    } catch (e) {
      console.error('Failed to update message status:', e);
      setError(e.response?.data?.error || e.message);
    }
  }

  const handleCopy = (text) => {
    const val = text || '-';
    if (val === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${month}/${day}/${year} ${hours}:${minutes}`;
    } catch {
      return '-';
    }
  };

  const openMessageDialog = (message) => {
    setSelectedMessage(message);
    setDialogOpen(true);
  };

  const closeMessageDialog = () => {
    setDialogOpen(false);
    setSelectedMessage(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <MessageIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4">Buyer Messages</Typography>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {snackbarMsg && (
        <Alert
          severity="info"
          sx={{ mb: 2, whiteSpace: 'pre-line' }}
          onClose={() => setSnackbarMsg('')}
        >
          {snackbarMsg}
        </Alert>
      )}

      {/* Controls */}
      <Stack direction="row" spacing={2} mb={3} alignItems="center">
        <Button
          variant="contained"
          color="primary"
          startIcon={fetching ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
          onClick={fetchMessagesFromEbay}
          disabled={fetching}
        >
          {fetching ? 'Fetching Messages...' : 'Fetch Messages from eBay'}
        </Button>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Status Filter</InputLabel>
          <Select
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            label="Status Filter"
          >
            <MenuItem value="">All Messages</MenuItem>
            <MenuItem value="false">Unresolved Only</MenuItem>
            <MenuItem value="true">Resolved Only</MenuItem>
          </Select>
        </FormControl>

        <Typography variant="body2" color="text.secondary">
          Total: {messages.length} messages
        </Typography>
      </Stack>

      {/* Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell><strong>Message ID</strong></TableCell>
                <TableCell><strong>Order ID</strong></TableCell>
                <TableCell><strong>Seller</strong></TableCell>
                <TableCell><strong>Buyer</strong></TableCell>
                <TableCell><strong>Subject</strong></TableCell>
                <TableCell><strong>Message Preview</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Created Date</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {messages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography variant="body2" color="text.secondary" py={2}>
                      No messages found. Click "Fetch Messages from eBay" to load data.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                messages.map((msg) => (
                  <TableRow
                    key={msg._id}
                    hover
                    sx={{ backgroundColor: !msg.isResolved ? '#fff3e0' : 'inherit' }}
                  >
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {msg.messageId ? msg.messageId.substring(0, 12) + '...' : '-'}
                        </Typography>
                        <IconButton size="small" onClick={() => handleCopy(msg.messageId)}>
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {msg.orderId || '-'}
                        </Typography>
                        {msg.orderId && (
                          <IconButton size="small" onClick={() => handleCopy(msg.orderId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{msg.seller?.username || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{msg.buyerUsername || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" fontSize="0.75rem">
                        {msg.subject || 'No Subject'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontSize="0.7rem"
                        sx={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {msg.messageText || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={msg.isResolved ? 'Resolved' : 'Unresolved'}
                        color={msg.isResolved ? 'success' : 'warning'}
                        size="small"
                        sx={{ fontSize: '0.7rem' }}
                      />
                      {msg.inquiryStatus && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {msg.inquiryStatus}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontSize="0.75rem">
                        {formatDate(msg.creationDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="View Full Message">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => openMessageDialog(msg)}
                          >
                            <VisibilityIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={msg.isResolved ? 'Mark as Unresolved' : 'Mark as Resolved'}>
                          <IconButton
                            size="small"
                            color={msg.isResolved ? 'warning' : 'success'}
                            onClick={() => toggleResolvedStatus(msg._id, msg.isResolved)}
                          >
                            {msg.isResolved ? (
                              <CancelIcon sx={{ fontSize: 18 }} />
                            ) : (
                              <CheckCircleIcon sx={{ fontSize: 18 }} />
                            )}
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Message Detail Dialog */}
      <Dialog open={dialogOpen} onClose={closeMessageDialog} maxWidth="md" fullWidth>
        {selectedMessage && (
          <>
            <DialogTitle>
              <Stack direction="row" alignItems="center" spacing={2}>
                <MessageIcon color="primary" />
                <Box>
                  <Typography variant="h6">{selectedMessage.subject || 'No Subject'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Message ID: {selectedMessage.messageId}
                  </Typography>
                </Box>
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Order ID:</Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body1" fontFamily="monospace">
                      {selectedMessage.orderId || 'N/A'}
                    </Typography>
                    {selectedMessage.orderId && (
                      <IconButton size="small" onClick={() => handleCopy(selectedMessage.orderId)}>
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">From:</Typography>
                  <Typography variant="body1">{selectedMessage.buyerUsername || 'Unknown Buyer'}</Typography>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">To:</Typography>
                  <Typography variant="body1">{selectedMessage.seller?.username || 'Unknown Seller'}</Typography>
                </Box>

                {selectedMessage.itemTitle && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Related Item:</Typography>
                    <Typography variant="body1">{selectedMessage.itemTitle}</Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Message:</Typography>
                  <Paper sx={{ p: 2, backgroundColor: '#f5f5f5', mt: 1 }}>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selectedMessage.messageText || 'No message text available'}
                    </Typography>
                  </Paper>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Status:</Typography>
                  <Stack direction="row" spacing={1} mt={0.5}>
                    <Chip
                      label={selectedMessage.isResolved ? 'Resolved' : 'Unresolved'}
                      color={selectedMessage.isResolved ? 'success' : 'warning'}
                      size="small"
                    />
                    {selectedMessage.inquiryStatus && (
                      <Chip
                        label={selectedMessage.inquiryStatus}
                        variant="outlined"
                        size="small"
                      />
                    )}
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Created:</Typography>
                  <Typography variant="body2">{formatDate(selectedMessage.creationDate)}</Typography>
                </Box>

                {selectedMessage.isResolved && selectedMessage.resolvedAt && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Resolved:</Typography>
                    <Typography variant="body2">
                      {formatDate(selectedMessage.resolvedAt)} by {selectedMessage.resolvedBy || 'admin'}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeMessageDialog}>Close</Button>
              <Button
                variant="contained"
                color={selectedMessage.isResolved ? 'warning' : 'success'}
                onClick={() => {
                  toggleResolvedStatus(selectedMessage._id, selectedMessage.isResolved);
                  closeMessageDialog();
                }}
              >
                {selectedMessage.isResolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
