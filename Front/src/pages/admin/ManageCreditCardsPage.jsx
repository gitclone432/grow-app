// pages/admin/ManageCreditCardsPage.jsx
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Breadcrumbs,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api.js';

export default function ManageCreditCardsPage() {
  const [cards, setCards] = useState([]);
  const [name, setName] = useState('');
  const [last4digits, setLast4digits] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/credit-cards');
      setCards(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load cards');
      console.error('Error fetching cards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const handleOpenDialog = (card = null) => {
    if (card) {
      setEditingId(card._id);
      setName(card.name);
      setLast4digits(card.last4digits);
    } else {
      setEditingId(null);
      setName('');
      setLast4digits('');
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingId(null);
    setName('');
    setLast4digits('');
  };

  const addCard = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) {
      setError('Card name is required');
      return;
    }
    if (!last4digits || !/^\d{4}$/.test(last4digits)) {
      setError('Last 4 digits must be exactly 4 numbers');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await api.post('/credit-cards', { name: name.trim(), last4digits });
      setSnackbar({ open: true, message: 'Card added successfully', severity: 'success' });
      setName('');
      setLast4digits('');
      handleCloseDialog();
      fetchCards();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to add credit card';
      setError(errorMsg);
      setSnackbar({ open: true, message: errorMsg, severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCard = async (id) => {
    if (!window.confirm('Are you sure you want to delete this card?')) return;
    try {
      await api.delete(`/credit-cards/${id}`);
      setSnackbar({ open: true, message: 'Card deleted successfully', severity: 'success' });
      fetchCards();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to delete card';
      setSnackbar({ open: true, message: errorMsg, severity: 'error' });
    }
  };

  return (
    <Box sx={{ pb: 4 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
        <Typography color="text.secondary">Settings</Typography>
        <Typography color="text.primary" fontWeight={600}>
          Manage Credit Cards
        </Typography>
      </Breadcrumbs>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          💳 Manage Credit Cards
        </Typography>
        <Button startIcon={<RefreshIcon />} size="small" onClick={fetchCards}>
          Refresh
        </Button>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => handleOpenDialog()}>
          Add Card
        </Button>
      </Stack>

      {/* Summary Card */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)', color: '#fff' }}>
            <CardContent>
              <Typography color="rgba(255, 255, 255, 0.9)" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Total Cards
              </Typography>
              <Typography sx={{ fontSize: '2.5rem', fontWeight: 700 }}>
                {cards.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 700 }}>Card Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Card Number</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No cards yet. Click "Add Card" to create one.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                cards.map((card) => (
                  <TableRow key={card._id} hover>
                    <TableCell>
                      <Chip
                        label={card.name}
                        variant="filled"
                        sx={{
                          background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
                          color: '#fff',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 500 }}>
                      xxxx{card.last4digits}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.9rem' }}>
                      {card.createdAt ? new Date(card.createdAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(card)}
                        title="Edit"
                        color="primary"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => deleteCard(card._id)}
                        title="Delete"
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? 'Edit Credit Card' : 'Add New Credit Card'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              label="Card Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ICICI Debit Card, Amex Credit Card"
            />
            <TextField
              fullWidth
              label="Last 4 Digits"
              value={last4digits}
              onChange={(e) => setLast4digits(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g., 1625"
              inputProps={{ maxLength: 4 }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !submitting) addCard();
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={addCard} variant="contained" disabled={submitting || !name.trim()}>
            {submitting ? 'Saving...' : editingId ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
