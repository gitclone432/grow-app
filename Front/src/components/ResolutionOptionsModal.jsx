import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    TextField,
    Typography,
    Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import api from '../lib/api';

export default function ResolutionOptionsModal({ open, onClose, options = [], onReload }) {
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setName('');
        setEditingId(null);
        setError('');
    }, [open]);

    const normalizedNames = useMemo(
        () => new Set(
            options
                .filter((option) => option._id !== editingId)
                .map((option) => option.name?.trim().toLowerCase())
                .filter(Boolean)
        ),
        [options, editingId]
    );

    const handleSave = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Option name is required.');
            return;
        }
        if (normalizedNames.has(trimmedName.toLowerCase())) {
            setError('This option already exists.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            if (editingId) {
                await api.patch(`/resolution-options/${editingId}`, { name: trimmedName });
            } else {
                await api.post('/resolution-options', { name: trimmedName });
            }
            setName('');
            setEditingId(null);
            await onReload?.();
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to save option');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (option) => {
        setEditingId(option._id);
        setName(option.name || '');
        setError('');
    };

    const handleDelete = async (optionId) => {
        setSaving(true);
        setError('');
        try {
            await api.delete(`/resolution-options/${optionId}`);
            if (editingId === optionId) {
                setEditingId(null);
                setName('');
            }
            await onReload?.();
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to delete option');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Manage Resolution Options</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <TextField
                        label="Option Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        size="small"
                        fullWidth
                        disabled={saving}
                    />

                    {error ? <Alert severity="error">{error}</Alert> : null}

                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={handleSave} disabled={saving}>
                            {editingId ? 'Save Option' : 'Add Option'}
                        </Button>
                        {editingId ? (
                            <Button
                                variant="outlined"
                                disabled={saving}
                                onClick={() => {
                                    setEditingId(null);
                                    setName('');
                                    setError('');
                                }}
                            >
                                Cancel Edit
                            </Button>
                        ) : null}
                    </Stack>

                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Existing Options
                        </Typography>
                        <Stack spacing={1}>
                            {options.map((option) => (
                                <Box
                                    key={option._id}
                                    sx={{
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                        p: 1.25
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {option.name}
                                        </Typography>
                                        <Stack direction="row" spacing={0.5}>
                                            <IconButton size="small" onClick={() => handleEdit(option)} disabled={saving}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton size="small" color="error" onClick={() => handleDelete(option._id)} disabled={saving}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                    </Stack>
                                </Box>
                            ))}
                            {options.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No options yet.
                                </Typography>
                            ) : null}
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Done</Button>
            </DialogActions>
        </Dialog>
    );
}
