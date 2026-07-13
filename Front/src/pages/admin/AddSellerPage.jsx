import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import LockResetIcon from '@mui/icons-material/LockReset';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import api from '../../lib/api.js';

const EMPTY_FORM = { username: '', password: '', email: '' };

function isArchivedSeller(seller) {
  return !seller.active || !seller.isStoreActive;
}

function statusChip(seller) {
  if (!seller.active || !seller.isStoreActive) {
    return <Chip label="Archived" size="small" color="default" variant="outlined" />;
  }
  return <Chip label="Active" size="small" color="success" variant="filled" />;
}

function ebayChip(seller) {
  if (!seller.active || !seller.isStoreActive) {
    return <Chip label="—" size="small" variant="outlined" />;
  }
  if (seller.hasEbayConnection) {
    return <Chip label="Connected" size="small" color="info" variant="outlined" />;
  }
  return <Chip label="Not connected" size="small" color="warning" variant="outlined" />;
}

export default function AddSellerPage() {
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);
  const isSuperadmin = currentUser?.role === 'superadmin';

  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreds, setShowCreds] = useState(false);
  const [created, setCreated] = useState({ username: '', password: '' });

  const [passwordDialog, setPasswordDialog] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const [permanentTarget, setPermanentTarget] = useState(null);
  const [permanentStep, setPermanentStep] = useState(1);
  const [permanentConfirmUsername, setPermanentConfirmUsername] = useState('');
  const [permanentSaving, setPermanentSaving] = useState(false);
  const [permanentBlockers, setPermanentBlockers] = useState([]);

  const loadSellers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/users/sellers');
      setSellers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load sellers');
      setSellers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSellers();
  }, [loadSellers]);

  const filteredSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) =>
      s.username?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  }, [sellers, search]);

  const handleCreateSeller = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const { data } = await api.post('/users/seller', {
        username: form.username.trim(),
        password: form.password,
        email: form.email.trim(),
      });

      setCreated({ username: data.username || form.username.trim(), password: form.password });
      setShowCreds(true);
      setForm(EMPTY_FORM);
      setSuccess(data.reactivated ? `Seller "${data.username}" reactivated.` : `Seller "${data.username}" created.`);
      await loadSellers();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create seller account');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordDialog?.userId) return;
    if (!newPassword || !confirmPassword) {
      setError('Enter and confirm the new password');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setPasswordSaving(true);
    setError('');
    try {
      await api.put(`/users/${passwordDialog.userId}/password`, { newPassword });
      setSuccess(`Password updated for ${passwordDialog.username}`);
      setPasswordDialog(null);
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteSeller = async () => {
    if (!deleteTarget?.sellerId) return;
    setDeleteSaving(true);
    setError('');
    try {
      await api.delete(`/sellers/${deleteTarget.sellerId}`);
      setSuccess(`Seller "${deleteTarget.username}" archived`);
      setDeleteTarget(null);
      await loadSellers();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to archive seller');
    } finally {
      setDeleteSaving(false);
    }
  };

  const openPermanentDelete = (seller) => {
    setError('');
    setPermanentBlockers([]);
    setPermanentConfirmUsername('');
    setPermanentStep(1);
    setPermanentTarget(seller);
  };

  const closePermanentDelete = () => {
    if (permanentSaving) return;
    setPermanentTarget(null);
    setPermanentStep(1);
    setPermanentConfirmUsername('');
    setPermanentBlockers([]);
  };

  const handlePermanentDelete = async () => {
    if (!permanentTarget?.sellerId) return;
    if (permanentStep === 1) {
      setPermanentStep(2);
      return;
    }

    if (permanentConfirmUsername.trim() !== permanentTarget.username) {
      setError('Username confirmation does not match');
      return;
    }

    setPermanentSaving(true);
    setError('');
    setPermanentBlockers([]);
    try {
      await api.delete(`/sellers/${permanentTarget.sellerId}/permanent`, {
        data: { confirmUsername: permanentConfirmUsername.trim() },
      });
      setSuccess(`Seller "${permanentTarget.username}" permanently deleted`);
      closePermanentDelete();
      await loadSellers();
    } catch (err) {
      const blockers = err?.response?.data?.blockers;
      if (Array.isArray(blockers) && blockers.length > 0) {
        setPermanentBlockers(blockers);
      }
      setError(err?.response?.data?.error || 'Failed to permanently delete seller');
    } finally {
      setPermanentSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Seller Management</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Create seller accounts, reset passwords, archive stores, or permanently remove archived sellers.
          </Typography>
        </Box>
        <Tooltip title="Refresh list">
          <span>
            <IconButton onClick={() => loadSellers()} disabled={loading} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSuccess('')}>{success}</Alert>
      ) : null}

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, position: { md: 'sticky' }, top: 16 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <AddIcon color="primary" fontSize="small" />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Add Seller</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Role and department are set automatically: <strong>Seller</strong> + <strong>Executives</strong>.
              Reactivating an archived username restores the store account.
            </Typography>

            <Stack spacing={2} component="form" onSubmit={handleCreateSeller}>
              <TextField
                label="Username"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                required
                disabled={submitting}
                size="small"
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required
                disabled={submitting}
                size="small"
                fullWidth
              />
              <TextField
                label="Email (optional)"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                disabled={submitting}
                size="small"
                fullWidth
              />
              <Button type="submit" variant="contained" disabled={submitting} startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}>
                {submitting ? 'Creating...' : 'Create Seller'}
              </Button>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  All Sellers ({filteredSellers.length})
                </Typography>
                <TextField
                  size="small"
                  placeholder="Search username or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ minWidth: { sm: 260 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Stack>
            </Box>

            <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48, fontWeight: 600 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>eBay</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, minWidth: 140 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={28} />
                      </TableCell>
                    </TableRow>
                  ) : filteredSellers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        {search ? 'No sellers match your search' : 'No sellers yet — create one on the left'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSellers.map((seller, index) => (
                      <TableRow key={seller.sellerId} hover>
                        <TableCell sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{seller.username || '—'}</TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{seller.email || '—'}</TableCell>
                        <TableCell>{statusChip(seller)}</TableCell>
                        <TableCell>{ebayChip(seller)}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Change password">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setError('');
                                    setPasswordDialog({ userId: seller.userId, username: seller.username });
                                    setNewPassword('');
                                    setConfirmPassword('');
                                    setShowPassword(false);
                                  }}
                                  disabled={!seller.userId}
                                >
                                  <LockResetIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={isArchivedSeller(seller) ? 'Already archived' : 'Archive seller'}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => setDeleteTarget(seller)}
                                  disabled={isArchivedSeller(seller)}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {isSuperadmin && isArchivedSeller(seller) ? (
                              <Tooltip title="Permanently delete (superadmin)">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => openPermanentDelete(seller)}
                                  >
                                    <DeleteForeverIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            ) : null}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={Boolean(passwordDialog)} onClose={() => !passwordSaving && setPasswordDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 600 }}>Change password — {passwordDialog?.username}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              label="New password"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              size="small"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword((p) => !p)} edge="end">
                      {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Confirm password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setPasswordDialog(null)} disabled={passwordSaving}>Cancel</Button>
          <Button variant="contained" onClick={handlePasswordChange} disabled={passwordSaving}>
            {passwordSaving ? 'Saving...' : 'Update password'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleteSaving && setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 600 }}>Archive seller?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Archive <strong>{deleteTarget?.username}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This deactivates the login, disconnects eBay tokens, and hides the store from active lists.
            You can reactivate later by creating a seller with the same username.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteSeller} disabled={deleteSaving}>
            {deleteSaving ? 'Archiving...' : 'Archive seller'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(permanentTarget)} onClose={closePermanentDelete} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 600, color: 'error.main' }}>
          {permanentStep === 1 ? 'Permanent delete — step 1 of 2' : 'Permanent delete — final confirmation'}
        </DialogTitle>
        <DialogContent dividers>
          {permanentStep === 1 ? (
            <Stack spacing={1.5}>
              <Typography variant="body2">
                Permanently delete <strong>{permanentTarget?.username}</strong>?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This removes the seller account and login from the database. It cannot be undone.
                The seller must already be archived, and deletion is blocked if orders, listings,
                messages, or other historical records exist.
              </Typography>
              <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
                Archive first if the seller is still active. Permanent delete is for freeing the username when no business history exists.
              </Alert>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Typography variant="body2" color="error">
                Type <strong>{permanentTarget?.username}</strong> below to confirm permanent deletion.
              </Typography>
              <TextField
                label="Type username to confirm"
                value={permanentConfirmUsername}
                onChange={(e) => setPermanentConfirmUsername(e.target.value)}
                fullWidth
                size="small"
                autoFocus
              />
              {permanentBlockers.length > 0 ? (
                <Alert severity="error" sx={{ borderRadius: 1.5 }}>
                  Cannot delete — this seller still has:
                  <Box component="ul" sx={{ m: 0, pl: 2.5, mt: 0.5 }}>
                    {permanentBlockers.map((b) => (
                      <li key={b.type}>{b.count} {b.type}</li>
                    ))}
                  </Box>
                </Alert>
              ) : null}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closePermanentDelete} disabled={permanentSaving}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handlePermanentDelete}
            disabled={permanentSaving || (permanentStep === 2 && permanentConfirmUsername.trim() !== permanentTarget?.username)}
          >
            {permanentSaving
              ? 'Deleting...'
              : permanentStep === 1
                ? 'Continue'
                : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={showCreds}
        autoHideDuration={12000}
        onClose={() => setShowCreds(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowCreds(false)} severity="info" sx={{ width: '100%' }}>
          Share credentials securely:
          <br />Username: {created.username}
          <br />Password: {created.password}
        </Alert>
      </Snackbar>
    </Box>
  );
}
