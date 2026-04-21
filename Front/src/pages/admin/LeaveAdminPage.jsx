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
    Tabs,
    Tab,
    Badge,
    MenuItem
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingIcon from '@mui/icons-material/Pending';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function LeaveAdminPage() {
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTab, setCurrentTab] = useState(0); // 0: Pending, 1: Approved, 2: Rejected, 3: All
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
    const [rejectionReason, setRejectionReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await axios.get(`${API_URL}/leaves/admin`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLeaves(res.data);

            // Extract unique departments
            const uniqueDepts = [...new Set(res.data.map(l => l.user?.department).filter(Boolean))];
            setDepartments(uniqueDepts);
        } catch (error) {
            console.error('Error fetching leaves:', error);
            showSnackbar('Failed to fetch leave requests', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = (leave, action) => {
        setSelectedLeave(leave);
        setActionType(action);
        setRejectionReason('');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedLeave(null);
        setRejectionReason('');
    };

    const handleSubmitAction = async () => {
        if (actionType === 'reject' && !rejectionReason.trim()) {
            showSnackbar('Please provide a rejection reason', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('auth_token');
            await axios.put(
                `${API_URL}/leaves/${selectedLeave._id}/status`,
                {
                    status: actionType === 'approve' ? 'approved' : 'rejected',
                    rejectionReason: actionType === 'reject' ? rejectionReason : undefined
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            showSnackbar(
                `Leave request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully`,
                'success'
            );
            handleCloseDialog();
            fetchLeaves();
        } catch (error) {
            const errorMsg = error.response?.data?.error || `Failed to ${actionType} leave request`;
            showSnackbar(errorMsg, 'error');
        } finally {
            setSubmitting(false);
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

    const getFilteredLeaves = () => {
        let filtered = leaves;

        // Filter by tab
        switch (currentTab) {
            case 0:
                filtered = filtered.filter(l => l.status === 'pending');
                break;
            case 1:
                filtered = filtered.filter(l => l.status === 'approved');
                break;
            case 2:
                filtered = filtered.filter(l => l.status === 'rejected');
                break;
            case 3:
                // All leaves
                break;
        }

        // Filter by department
        if (departmentFilter) {
            filtered = filtered.filter(l => l.user?.department === departmentFilter);
        }

        return filtered;
    };

    const pendingCount = leaves.filter(l => l.status === 'pending').length;
    const approvedCount = leaves.filter(l => l.status === 'approved').length;
    const rejectedCount = leaves.filter(l => l.status === 'rejected').length;

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    const filteredLeaves = getFilteredLeaves();

    return (
        <Box maxWidth="1400px" mx="auto" p={3}>
            <Paper sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <AdminPanelSettingsIcon color="primary" fontSize="large" />
                        <Typography variant="h5" fontWeight="bold">
                            Leave Management (Admin)
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        onClick={fetchLeaves}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Stack>

                {/* Department Filter */}
                <Stack direction="row" spacing={2} mb={3}>
                    <TextField
                        select
                        label="Filter by Department"
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        sx={{ minWidth: 200 }}
                        size="small"
                    >
                        <MenuItem value="">All Departments</MenuItem>
                        {departments.map((dept) => (
                            <MenuItem key={dept} value={dept}>{dept}</MenuItem>
                        ))}
                    </TextField>
                </Stack>

                {/* Tabs */}
                <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)} sx={{ mb: 3 }}>
                    <Tab
                        icon={
                            <Badge badgeContent={pendingCount} color="warning">
                                <PendingIcon />
                            </Badge>
                        }
                        label="Pending"
                        iconPosition="start"
                    />
                    <Tab
                        icon={
                            <Badge badgeContent={approvedCount} color="success">
                                <CheckCircleIcon />
                            </Badge>
                        }
                        label="Approved"
                        iconPosition="start"
                    />
                    <Tab
                        icon={
                            <Badge badgeContent={rejectedCount} color="error">
                                <CancelIcon />
                            </Badge>
                        }
                        label="Rejected"
                        iconPosition="start"
                    />
                    <Tab
                        icon={
                            <Badge badgeContent={leaves.length} color="primary">
                                <AdminPanelSettingsIcon />
                            </Badge>
                        }
                        label="All"
                        iconPosition="start"
                    />
                </Tabs>

                {/* Table */}
                {filteredLeaves.length === 0 ? (
                    <Box textAlign="center" py={8}>
                        <PendingIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                            No leave requests found
                        </Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Employee</strong></TableCell>
                                    <TableCell><strong>Department</strong></TableCell>
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
                                {filteredLeaves.map((leave) => (
                                    <TableRow key={leave._id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="medium">
                                                {leave.user?.username || 'N/A'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {leave.user?.email}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{leave.user?.department || 'N/A'}</TableCell>
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
                                                <Stack direction="row" spacing={1} justifyContent="center">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        startIcon={<CheckCircleIcon />}
                                                        onClick={() => handleAction(leave, 'approve')}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="error"
                                                        startIcon={<CancelIcon />}
                                                        onClick={() => handleAction(leave, 'reject')}
                                                    >
                                                        Reject
                                                    </Button>
                                                </Stack>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Action Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {actionType === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
                </DialogTitle>
                <DialogContent>
                    {selectedLeave && (
                        <Stack spacing={2} mt={1}>
                            <Typography>
                                <strong>Employee:</strong> {selectedLeave.user?.username}
                            </Typography>
                            <Typography>
                                <strong>Department:</strong> {selectedLeave.user?.department}
                            </Typography>
                            <Typography>
                                <strong>Dates:</strong> {formatDate(selectedLeave.startDate)} - {formatDate(selectedLeave.endDate)}
                            </Typography>
                            <Typography>
                                <strong>Days:</strong> {selectedLeave.numberOfDays}
                            </Typography>
                            <Typography>
                                <strong>Reason:</strong> {selectedLeave.reason}
                            </Typography>

                            {actionType === 'reject' && (
                                <TextField
                                    label="Rejection Reason"
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    fullWidth
                                    multiline
                                    rows={3}
                                    required
                                    placeholder="Please provide a reason for rejecting this leave request"
                                />
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmitAction}
                        variant="contained"
                        color={actionType === 'approve' ? 'success' : 'error'}
                        disabled={submitting}
                        startIcon={submitting && <CircularProgress size={20} />}
                    >
                        {submitting ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject'}
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
