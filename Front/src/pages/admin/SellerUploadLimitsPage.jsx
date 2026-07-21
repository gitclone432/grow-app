import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Stack, Alert, Button, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Select, MenuItem, FormControl, InputLabel,
  IconButton, CircularProgress, LinearProgress, Tooltip,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { alpha, useTheme } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TuneIcon from '@mui/icons-material/Tune';
import api from '../../lib/api';

const COUNTRIES = ['US', 'UK', 'AU', 'Canada'];
const EMPTY_FORM = { seller: null, country: 'US', limit: '' };

export default function SellerUploadLimitsPage() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  const [sellers, setSellers] = useState([]);
  const [limits, setLimits] = useState([]);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    api.get('/sellers/all').then(({ data }) => setSellers(data || [])).catch(() => {});
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    setLoadingLimits(true);
    try {
      const { data } = await api.get('/seller-upload-limits');
      setLimits(data || []);
    } catch {
      setLimits([]);
    } finally {
      setLoadingLimits(false);
    }
  };

  const getSellerLabel = (s) => s?.user?.username || s?.user?.email || 'Unknown';

  const handleEdit = (record) => {
    setEditingId(record._id);
    setForm({
      seller: sellers.find((s) => s._id === (record.seller?._id || record.seller)) || null,
      country: record.country,
      limit: String(record.limit),
    });
    setFormError('');
    setFormSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormSuccess('');
  };

  const handleSave = async () => {
    setFormError('');
    setFormSuccess('');

    if (!form.seller) return setFormError('Please select a seller.');
    if (!form.country) return setFormError('Please select a country.');
    if (!form.limit || Number.isNaN(Number(form.limit)) || Number(form.limit) < 1) {
      return setFormError('Limit must be a positive number.');
    }

    setSaving(true);
    try {
      await api.post('/seller-upload-limits', {
        sellerId: form.seller._id,
        country: form.country,
        limit: Number(form.limit),
      });
      setFormSuccess(editingId ? 'Limit updated.' : 'Limit saved.');
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchLimits();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save limit.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleteId(id);
    try {
      await api.delete(`/seller-upload-limits/${id}`);
      setLimits((prev) => prev.filter((l) => l._id !== id));
    } catch {
      // ignore
    } finally {
      setDeleteId(null);
    }
  };

  const usagePct = (record) =>
    record.limit > 0 ? Math.min(Math.round((record.currentCount / record.limit) * 100), 100) : 0;

  const progressColor = (pct, isBlocked) => {
    if (isBlocked) return 'error';
    if (pct >= 80) return 'warning';
    return 'success';
  };

  const headerCellSx = {
    fontWeight: 700,
    bgcolor: primary,
    color: 'white',
    whiteSpace: 'nowrap',
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 5, minHeight: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ pt: 2.5, mb: 3 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            flexShrink: 0,
            bgcolor: primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TuneIcon sx={{ color: 'white', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ color: primary, letterSpacing: -0.5 }}>
            Seller Upload Limits
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
            Configure per-seller, per-country daily upload caps — resets at 12:00 AM IST
          </Typography>
        </Box>
      </Stack>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 2,
          border: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          {editingId ? 'Edit Daily Limit' : 'Set a New Daily Limit'}
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap">
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Country</InputLabel>
            <Select
              value={form.country}
              label="Country"
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            >
              {COUNTRIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            options={sellers}
            getOptionLabel={getSellerLabel}
            value={form.seller}
            onChange={(_, v) => setForm((f) => ({ ...f, seller: v }))}
            isOptionEqualToValue={(opt, val) => opt._id === val._id}
            sx={{ minWidth: 240, flexGrow: 1 }}
            renderInput={(params) => <TextField {...params} label="Seller" />}
          />

          <TextField
            label="Daily Upload Limit"
            type="number"
            value={form.limit}
            onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))}
            inputProps={{ min: 1, step: 1 }}
            sx={{ minWidth: 220 }}
            helperText="Max successful uploads per day (resets 12 AM IST)"
          />
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? 'Saving…' : editingId ? 'Update Limit' : 'Save Limit'}
          </Button>
          {editingId && (
            <Button variant="outlined" onClick={handleCancelEdit}>
              Cancel
            </Button>
          )}
          {formError && <Alert severity="error" sx={{ py: 0, flexGrow: 1 }}>{formError}</Alert>}
          {formSuccess && <Alert severity="success" sx={{ py: 0, flexGrow: 1 }}>{formSuccess}</Alert>}
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 2,
          border: (t) => `1px solid ${t.palette.divider}`,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 3, py: 2, borderBottom: (t) => `1px solid ${t.palette.divider}` }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Configured Limits
            {!loadingLimits && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 500 }}>
                ({limits.length} record{limits.length !== 1 ? 's' : ''})
              </Typography>
            )}
          </Typography>
        </Box>

        {loadingLimits ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : limits.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No limits configured yet. Use the form above to add one.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Seller</TableCell>
                  <TableCell sx={headerCellSx}>Country</TableCell>
                  <TableCell sx={headerCellSx} align="right">Daily Limit</TableCell>
                  <TableCell sx={headerCellSx} align="right">Today&apos;s Count</TableCell>
                  <TableCell sx={{ ...headerCellSx, minWidth: 180 }}>Today&apos;s Usage</TableCell>
                  <TableCell sx={headerCellSx}>Resets At</TableCell>
                  <TableCell sx={headerCellSx}>Status</TableCell>
                  <TableCell sx={headerCellSx} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {limits.map((record) => {
                  const pct = usagePct(record);
                  const color = progressColor(pct, record.isBlocked);
                  const isEditing = editingId === record._id;
                  return (
                    <TableRow
                      key={record._id}
                      hover
                      sx={isEditing ? { backgroundColor: alpha(primary, 0.06) } : undefined}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>{record.sellerName}</TableCell>
                      <TableCell>
                        <Chip label={record.country} size="small" sx={{ fontWeight: 700, height: 22, fontSize: '0.72rem' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {record.limit.toLocaleString()}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          color: record.isBlocked ? 'error.main' : 'text.primary',
                        }}
                      >
                        {(record.currentCount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ minWidth: 180 }}>
                        <Stack spacing={0.4}>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            color={color}
                            sx={{ height: 7, borderRadius: 4 }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            {pct}%
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.82rem' }}>
                        12:00 AM IST
                      </TableCell>
                      <TableCell>
                        {record.isBlocked ? (
                          <Chip
                            icon={<BlockIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="Blocked"
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700 }}
                          />
                        ) : pct >= 80 ? (
                          <Chip
                            icon={<WarningAmberIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="Near Limit"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700 }}
                          />
                        ) : (
                          <Chip
                            icon={<CheckCircleIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="Active"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Edit">
                            <span>
                              <IconButton size="small" onClick={() => handleEdit(record)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDelete(record._id)}
                                disabled={deleteId === record._id}
                              >
                                {deleteId === record._id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
