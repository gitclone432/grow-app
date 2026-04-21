import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
    Alert,
    Chip,
    CircularProgress,
} from '@mui/material';
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CancelIcon from '@mui/icons-material/Cancel';
import api from '../lib/api';

/**
 * Dialog for scheduling, modifying, or cancelling an auto-upload for a CSV Storage record.
 *
 * Props:
 *   open        — boolean
 *   onClose     — () => void
 *   record      — CsvStorage record object (with scheduledUploadAt, scheduledSellerId, scheduledUploadStatus)
 *   sellers     — array of Seller objects { _id, storeName, user }
 *   onUpdated   — (updatedRecord) => void — called after any successful change
 */
export default function ScheduleUploadDialog({ open, onClose, record, sellers = [], onUpdated }) {
    const [scheduledAt, setScheduledAt] = useState(null);
    const [sellerId, setSellerId] = useState('');
    const [loading, setLoading] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [error, setError] = useState('');

    const isPending = record?.scheduledUploadStatus === 'pending';
    const isProcessing = record?.scheduledUploadStatus === 'processing';

    // Pre-fill when editing an existing schedule
    useEffect(() => {
        if (open && record) {
            setError('');
            if (isPending && record.scheduledUploadAt) {
                setScheduledAt(new Date(record.scheduledUploadAt));
                setSellerId(record.scheduledSellerId?._id || record.scheduledSellerId || record.seller?._id || '');
            } else {
                // New schedule — default seller to the record's seller
                setScheduledAt(null);
                setSellerId(record.seller?._id || '');
            }
        }
    }, [open, record]);

    const handleSchedule = async () => {
        if (!scheduledAt) { setError('Please select a date and time'); return; }
        if (!sellerId) { setError('Please select a seller'); return; }
        if (scheduledAt <= new Date()) { setError('Scheduled time must be in the future'); return; }

        setLoading(true);
        setError('');
        try {
            const { data } = await api.post(`/csv-storage/${record._id}/schedule-upload`, {
                scheduledAt: scheduledAt.toISOString(),
                sellerId,
            });
            onUpdated(data.record);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to schedule upload');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        setCancelLoading(true);
        setError('');
        try {
            const { data } = await api.delete(`/csv-storage/${record._id}/schedule-upload`);
            onUpdated(data.record);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to cancel scheduled upload');
        } finally {
            setCancelLoading(false);
        }
    };

    if (!record) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <ScheduleIcon color="primary" />
                    <span>{isPending ? 'Modify Scheduled Upload' : 'Schedule Auto-Upload'}</span>
                </Stack>
            </DialogTitle>

            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    {isProcessing && (
                        <Alert severity="info" icon={<CircularProgress size={16} />}>
                            This upload is currently processing and cannot be modified.
                        </Alert>
                    )}

                    {isPending && record.scheduledUploadAt && (
                        <Alert severity="warning" variant="outlined">
                            Currently scheduled for{' '}
                            <strong>{new Date(record.scheduledUploadAt).toLocaleString()}</strong>
                            {record.scheduledSellerId?.storeName && (
                                <> → <strong>{record.scheduledSellerId.storeName}</strong></>
                            )}
                        </Alert>
                    )}

                    <Typography variant="body2" color="text.secondary">
                        The CSV <strong>{record.name}</strong> will be automatically uploaded to eBay at the selected time, exactly as if you clicked "Upload to eBay" manually.
                    </Typography>

                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <DateTimePicker
                            label="Upload Date & Time"
                            value={scheduledAt}
                            onChange={setScheduledAt}
                            minDateTime={new Date()}
                            disabled={isProcessing}
                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                    </LocalizationProvider>

                    <FormControl fullWidth size="small" disabled={isProcessing}>
                        <InputLabel>Seller</InputLabel>
                        <Select
                            value={sellerId}
                            label="Seller"
                            onChange={(e) => setSellerId(e.target.value)}
                        >
                            {sellers.map((s) => (
                                <MenuItem key={s._id} value={s._id}>
                                    {s.storeName || s.user?.username || s._id}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
                {isPending ? (
                    <Button
                        startIcon={cancelLoading ? <CircularProgress size={14} /> : <CancelIcon />}
                        color="error"
                        onClick={handleCancel}
                        disabled={cancelLoading || loading}
                    >
                        Cancel Schedule
                    </Button>
                ) : (
                    <span />
                )}
                <Stack direction="row" spacing={1}>
                    <Button onClick={onClose} disabled={loading || cancelLoading}>Close</Button>
                    <Button
                        variant="contained"
                        startIcon={loading ? <CircularProgress size={14} /> : <ScheduleIcon />}
                        onClick={handleSchedule}
                        disabled={loading || cancelLoading || isProcessing}
                    >
                        {isPending ? 'Update Schedule' : 'Schedule Upload'}
                    </Button>
                </Stack>
            </DialogActions>
        </Dialog>
    );
}
