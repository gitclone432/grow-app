import { useEffect, useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Snackbar,
    Alert,
    CircularProgress,
    Stack,
    IconButton,
    Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
const MAX_LEAVES_PER_MONTH = 2;

export default function LeaveManagementPage() {
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [form, setForm] = useState({
        startDate: '',
        endDate: '',
        reason: ''
    });

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await axios.get(`${API_URL}/leaves`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLeaves(res.data);
        } catch (error) {
            console.error('Error fetching leaves:', error);
            showSnackbar('Failed to fetch leave requests', 'error');
        } finally {
            setLoading(false);
        }
    };

    const calculateDays = (startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    };

    const getRemainingLeaves = () => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const monthStart = new Date(currentYear, currentMonth, 1);
        const monthEnd = new Date(currentYear, currentMonth + 1, 0);

        let consumed = 0;

        leaves.forEach(leave => {
            if (leave.status === 'rejected') return;

            const leaveStart = new Date(leave.startDate);
            const leaveEnd = new Date(leave.endDate);

            // Check for overlap with current month
            if (leaveStart <= monthEnd && leaveEnd >= monthStart) {
                const effectiveStart = new Date(Math.max(leaveStart, monthStart));
                const effectiveEnd = new Date(Math.min(leaveEnd, monthEnd));
                consumed += calculateDays(effectiveStart, effectiveEnd);
            }
        });

        return Math.max(0, MAX_LEAVES_PER_MONTH - consumed);
    };

    const handleOpenDialog = () => {
        setForm({
            startDate: '',
            endDate: '',
            reason: ''
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setForm({ startDate: '', endDate: '', reason: '' });
    };

    const handleSubmit = async () => {
        if (!form.startDate || !form.endDate || !form.reason.trim()) {
            showSnackbar('Please fill all fields', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('auth_token');
            await axios.post(
                `${API_URL}/leaves`,
                form,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            showSnackbar('Leave request submitted successfully', 'success');
            handleCloseDialog();
            fetchLeaves();
        } catch (error) {
            const errorMsg = error.response?.data?.error || 'Failed to submit leave request';
            showSnackbar(errorMsg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this leave request?')) return;

        try {
            const token = localStorage.getItem('auth_token');
            await axios.delete(`${API_URL}/leaves/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showSnackbar('Leave request cancelled', 'success');
            fetchLeaves();
        } catch (error) {
            const errorMsg = error.response?.data?.error || 'Failed to cancel leave request';
            showSnackbar(errorMsg, 'error');
        }
    };

    const showSnackbar = (message, severity) => {
        setSnackbar({ open: true, message, severity });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved':
                return 'success';
            case 'rejected':
                return 'error';
            case 'pending':
                return 'warning';
            default:
                return 'default';
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box maxWidth="1200px" mx="auto" p={3}>
            <Paper sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <EventAvailableIcon color="primary" fontSize="large" />
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                My Leave Requests
                            </Typography>
                            <Typography variant="subtitle2" color="text.secondary">
                                Balance this month: <strong>{getRemainingLeaves()} days</strong>
                            </Typography>
                        </Box>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpenDialog}
                        sx={{
                            background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                            '&:hover': {
                                background: 'linear-gradient(45deg, #1565c0, #1976d2)',
                            }
                        }}
                    >
                        Apply for Leave
                    </Button>
                </Stack>

                {leaves.length === 0 ? (
                    <Box textAlign="center" py={8}>
                        <EventAvailableIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No leave requests yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary" mb={3}>
                            Click "Apply for Leave" to submit your first request
                        </Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Start Date</strong></TableCell>
                                    <TableCell><strong>End Date</strong></TableCell>
                                    <TableCell><strong>Days</strong></TableCell>
                                    <TableCell><strong>Reason</strong></TableCell>
                                    <TableCell><strong>Status</strong></TableCell>
                                    <TableCell><strong>Rejection Reason</strong></TableCell>
                                    <TableCell align="center"><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {leaves.map((leave) => (
                                    <TableRow key={leave._id} hover>
                                        <TableCell>{formatDate(leave.startDate)}</TableCell>
                                        <TableCell>{formatDate(leave.endDate)}</TableCell>
                                        <TableCell>{leave.numberOfDays}</TableCell>
                                        <TableCell>{leave.reason}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={leave.status.toUpperCase()}
                                                color={getStatusColor(leave.status)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {leave.rejectionReason || '-'}
                                        </TableCell>
                                        <TableCell align="center">
                                            {leave.status === 'pending' && (
                                                <Tooltip title="Cancel Request">
                                                    <IconButton
                                                        color="error"
                                                        size="small"
                                                        onClick={() => handleCancel(leave._id)}
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Apply Leave Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Apply for Leave</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} mt={1}>
                        <TextField
                            label="Start Date"
                            type="date"
                            value={form.startDate}
                            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="End Date"
                            type="date"
                            value={form.endDate}
                            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="Reason"
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                            fullWidth
                            multiline
                            rows={3}
                            placeholder="Please provide a reason for your leave request"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Note: Leave requests must be submitted at least 2 days in advance. You have a maximum of 2 days of leave per month.
                        </Typography>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        variant="contained"
                        disabled={submitting}
                        startIcon={submitting && <CircularProgress size={20} />}
                    >
                        {submitting ? 'Submitting...' : 'Submit'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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
