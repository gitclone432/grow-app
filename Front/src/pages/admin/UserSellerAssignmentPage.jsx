import React, { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    IconButton,
    Grid,
    Box,
    CircularProgress,
    Autocomplete,
    TextField
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import api from '../../lib/api';
import usePageAccess from '../../hooks/usePageAccess';

const UserSellerAssignmentPage = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = user?.role || '';
    
    // Use the page access hook for proper permission checking
    const { hasAccess } = usePageAccess(user);

    const [assignments, setAssignments] = useState([]);
    const [users, setUsers] = useState([]);
    const [sellers, setSellers] = useState([]);

    const [openDialog, setOpenDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedSeller, setSelectedSeller] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);

    const [dailyTarget, setDailyTarget] = useState(0);

    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [editAssignmentId, setEditAssignmentId] = useState('');
    const [editDailyTarget, setEditDailyTarget] = useState(0);

    useEffect(() => {
        fetchAssignments();
        fetchUsersAndSellers();
    }, []);

    const fetchAssignments = async () => {
        try {
            const { data } = await api.get('/user-sellers/assignments');
            setAssignments(data);
        } catch (err) {
            console.error('Failed to fetch assignments:', err);
            setError('Failed to load assignments');
        } finally {
            setPageLoading(false);
        }
    };

    const fetchUsersAndSellers = async () => {
        try {
            const [usersRes, sellersRes] = await Promise.all([
                api.get('/users'),
                api.get('/sellers/all')
            ]);
            // Filter out users with role 'seller'
            const filteredUsers = usersRes.data.filter(u => u.role !== 'seller');
            setUsers(filteredUsers);
            setSellers(sellersRes.data);
        } catch (err) {
            console.error('Failed to fetch users and sellers:', err);
        }
    };

    const handleAssign = async () => {
        if (!selectedUser || !selectedSeller) {
            setError('Please select both a user and a seller');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.post('/user-sellers/assignments', {
                userId: selectedUser,
                sellerId: selectedSeller,
                dailyTarget: Number(dailyTarget)
            });
            setOpenDialog(false);
            setSelectedUser('');
            setSelectedSeller('');
            setDailyTarget(0);
            fetchAssignments();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create assignment');
        } finally {
            setLoading(false);
        }
    };

    const handleEditTargetSubmit = async () => {
        if (editDailyTarget === '' || isNaN(editDailyTarget)) {
            setError('Please enter a valid daily target');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.patch(`/user-sellers/assignments/${editAssignmentId}/target`, {
                dailyTarget: Number(editDailyTarget)
            });
            setOpenEditDialog(false);
            setEditAssignmentId('');
            setEditDailyTarget(0);
            fetchAssignments();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update target');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to remove this assignment?')) return;
        try {
            await api.delete(`/user-sellers/assignments/${id}`);
            fetchAssignments();
        } catch (err) {
            console.error('Failed to delete assignment:', err);
            alert('Failed to remove assignment');
        }
    };

    // Check if user has access to this page (already protected by routing, but double-check)
    const canManage = hasAccess('UserSellerAssignments');

    if (pageLoading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
        </Box>
    );

    if (!canManage) {
        return (
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                <Alert severity="error">You do not have permission to view this page.</Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Grid container justifyContent="space-between" alignItems="center" mb={3}>
                <Grid item>
                    <Typography variant="h4" component="h1">
                        User-Seller Assignments
                    </Typography>
                </Grid>
                <Grid item>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddIcon />}
                        onClick={() => {
                            setOpenDialog(true);
                            setError('');
                        }}
                    >
                        New Assignment
                    </Button>
                </Grid>
            </Grid>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>User</TableCell>
                            <TableCell>Department</TableCell>
                            <TableCell>Seller / Store</TableCell>
                            <TableCell align="center">Daily Target</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {assignments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">No assignments found</TableCell>
                            </TableRow>
                        ) : (
                            assignments.map((assignment) => (
                                <TableRow key={assignment._id}>
                                    <TableCell>{assignment.user?.username} ({assignment.user?.email})</TableCell>
                                    <TableCell>{assignment.user?.department || '-'}</TableCell>
                                    <TableCell>
                                        {assignment.seller?.user?.username || assignment.seller?.storeName || assignment.seller?._id}
                                    </TableCell>
                                    <TableCell align="center">
                                        {assignment.dailyTarget || 0}
                                        <Button
                                            size="small"
                                            sx={{ ml: 1, minWidth: 'auto', p: '2px 8px' }}
                                            onClick={() => {
                                                setEditAssignmentId(assignment._id);
                                                setEditDailyTarget(assignment.dailyTarget || 0);
                                                setError('');
                                                setOpenEditDialog(true);
                                            }}
                                        >
                                            Edit
                                        </Button>
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton color="error" onClick={() => handleDelete(assignment._id)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Assignment Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Assign Seller to User</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
                    <Autocomplete
                        fullWidth
                        sx={{ mt: 2 }}
                        options={users}
                        getOptionLabel={(option) => `${option.username} (${option.role})`}
                        value={users.find(u => u._id === selectedUser) || null}
                        onChange={(event, newValue) => setSelectedUser(newValue?._id || '')}
                        renderInput={(params) => <TextField {...params} label="Select User" />}
                        isOptionEqualToValue={(option, value) => option._id === value._id}
                    />
                    <Autocomplete
                        fullWidth
                        sx={{ mt: 3, mb: 2 }}
                        options={sellers}
                        getOptionLabel={(option) => option.user?.username || option.storeName || option._id}
                        value={sellers.find(s => s._id === selectedSeller) || null}
                        onChange={(event, newValue) => setSelectedSeller(newValue?._id || '')}
                        renderInput={(params) => <TextField {...params} label="Select Seller" />}
                        isOptionEqualToValue={(option, value) => option._id === value._id}
                    />
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(0, 0, 0, 0.6)', marginBottom: '8px' }}>Daily Target</label>
                        <input
                            type="number"
                            value={dailyTarget}
                            onChange={(e) => setDailyTarget(e.target.value)}
                            style={{
                                padding: '16.5px 14px',
                                border: '1px solid rgba(0, 0, 0, 0.23)',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                color: 'rgba(0, 0, 0, 0.87)'
                            }}
                            min="0"
                        />
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
                    <Button onClick={handleAssign} variant="contained" disabled={loading}>
                        Assign
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Target Dialog */}
            <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Edit Daily Target</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(0, 0, 0, 0.6)', marginBottom: '8px' }}>Daily Target</label>
                        <input
                            type="number"
                            value={editDailyTarget}
                            onChange={(e) => setEditDailyTarget(e.target.value)}
                            style={{
                                padding: '16.5px 14px',
                                border: '1px solid rgba(0, 0, 0, 0.23)',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                color: 'rgba(0, 0, 0, 0.87)'
                            }}
                            min="0"
                        />
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
                    <Button onClick={handleEditTargetSubmit} variant="contained" disabled={loading}>
                        Save Target
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default UserSellerAssignmentPage;
