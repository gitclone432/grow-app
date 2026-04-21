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
    TextField,
    Alert,
    IconButton,
    Grid,
    Box,
    CircularProgress,
    Chip,
    InputAdornment
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SearchIcon from '@mui/icons-material/Search';
import usePageAccess from '../../hooks/usePageAccess';
import api from '../../lib/api';

const UserPasswordManagementPage = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const { hasAccess } = usePageAccess(user);
    
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Change password dialog state
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        // Filter users based on search term
        if (searchTerm.trim() === '') {
            setFilteredUsers(users);
        } else {
            const term = searchTerm.toLowerCase();
            setFilteredUsers(
                users.filter(
                    (user) =>
                        user.username?.toLowerCase().includes(term) ||
                        user.email?.toLowerCase().includes(term) ||
                        user.role?.toLowerCase().includes(term) ||
                        user.department?.toLowerCase().includes(term)
                )
            );
        }
    }, [searchTerm, users]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/users');
            // Sort by username
            const sortedUsers = data.sort((a, b) => 
                (a.username || '').localeCompare(b.username || '')
            );
            setUsers(sortedUsers);
            setFilteredUsers(sortedUsers);
        } catch (err) {
            console.error('Failed to fetch users:', err);
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (user) => {
        setSelectedUser(user);
        setNewPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setError('');
        setSuccess('');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedUser(null);
        setNewPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setError('');
    };

    const handlePasswordChange = async () => {
        // Validation
        if (!newPassword || !confirmPassword) {
            setError('Please enter and confirm the new password');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.put(`/users/${selectedUser._id}/password`, {
                newPassword
            });

            setSuccess(response.data.message || `Password updated for ${selectedUser.username}`);
            
            // Close dialog after 1.5 seconds
            setTimeout(() => {
                handleCloseDialog();
            }, 1500);
        } catch (err) {
            console.error('Failed to change password:', err);
            setError(err.response?.data?.error || 'Failed to change password');
        } finally {
            setSubmitting(false);
        }
    };

    const getRoleColor = (role) => {
        const roleColors = {
            superadmin: 'error',
            productadmin: 'primary',
            listingadmin: 'primary',
            fulfillmentadmin: 'primary',
            hradmin: 'primary',
            compatibilityadmin: 'primary',
            operationhead: 'secondary',
            hoc: 'secondary',
            compliancemanager: 'secondary',
            lister: 'default',
            advancelister: 'info',
            compatibilityeditor: 'default',
            seller: 'warning',
            hr: 'default',
            trainee: 'default'
        };
        return roleColors[role] || 'default';
    };

    // Check access
    if (!hasAccess('UserPasswordManagement')) {
        return (
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                <Alert severity="error">
                    You do not have permission to view this page. Only super admins can manage user passwords.
                </Alert>
            </Container>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Grid container justifyContent="space-between" alignItems="center" mb={3}>
                <Grid item>
                    <Typography variant="h4" component="h1" gutterBottom>
                        User Password Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Change passwords for any user in the system (Super Admin only)
                    </Typography>
                </Grid>
            </Grid>

            {error && !openDialog && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && !openDialog && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            {/* Search Bar */}
            <Box sx={{ mb: 3 }}>
                <TextField
                    fullWidth
                    placeholder="Search by username, email, role, or department..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Username</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>Department</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    {searchTerm ? 'No users found matching your search' : 'No users found'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredUsers.map((user) => (
                                <TableRow key={user._id} hover>
                                    <TableCell>
                                        <strong>{user.username}</strong>
                                    </TableCell>
                                    <TableCell>{user.email || '-'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={user.role}
                                            color={getRoleColor(user.role)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>{user.department || '-'}</TableCell>
                                    <TableCell align="right">
                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            size="small"
                                            startIcon={<LockResetIcon />}
                                            onClick={() => handleOpenDialog(user)}
                                        >
                                            Change Password
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    Total: {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                    {searchTerm && ` (filtered from ${users.length})`}
                </Typography>
            </Box>

            {/* Change Password Dialog */}
            <Dialog 
                open={openDialog} 
                onClose={handleCloseDialog} 
                maxWidth="sm" 
                fullWidth
                disableEscapeKeyDown={submitting}
            >
                <DialogTitle>
                    Change Password for {selectedUser?.username}
                </DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2, mt: 1 }}>{success}</Alert>}

                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            User: <strong>{selectedUser?.username}</strong> ({selectedUser?.email || 'No email'})
                            <br />
                            Role: <Chip label={selectedUser?.role} color={getRoleColor(selectedUser?.role)} size="small" sx={{ mt: 0.5 }} />
                        </Typography>
                    </Box>

                    <TextField
                        fullWidth
                        label="New Password"
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={submitting || success}
                        sx={{ mt: 2 }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={() => setShowPassword(!showPassword)}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        helperText="Minimum 6 characters"
                    />

                    <TextField
                        fullWidth
                        label="Confirm New Password"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={submitting || success}
                        sx={{ mt: 2 }}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !submitting && !success) {
                                handlePasswordChange();
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={handleCloseDialog} 
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handlePasswordChange}
                        variant="contained"
                        color="primary"
                        disabled={submitting || success}
                        startIcon={submitting ? <CircularProgress size={16} /> : <LockResetIcon />}
                    >
                        {submitting ? 'Changing...' : 'Change Password'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default UserPasswordManagementPage;
