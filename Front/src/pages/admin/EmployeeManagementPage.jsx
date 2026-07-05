
import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    Grid,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    Stack,
    Chip,
    InputAdornment,
    Divider,
    Tooltip,
    Snackbar,
    Alert,
    Tabs,
    Tab,
    CircularProgress,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Avatar,
} from '@mui/material';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import StarIcon from '@mui/icons-material/Star';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import SecurityIcon from '@mui/icons-material/Security';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { listEmployeeProfiles, updateEmployeeProfile, getEmployeeFileUrl, deleteEmployeeProfile, toggleEmployeeHidden } from '../../lib/api.js';
import AddUserForm from '../../components/AddUserForm.jsx';

// TabPanel component for managing tab content
function TabPanel({ children, value, index }) {
    return (
        <Box
            role="tabpanel"
            hidden={value !== index}
            sx={{ pt: 2 }}
        >
            {value === index && children}
        </Box>
    );
}


// Helper function to sanitize payload - remove empty strings from enum fields
function sanitizePayload(payload) {
    const sanitized = { ...payload };

    // Handle gender: if empty string, set to "other" instead of deleting
    if (sanitized.gender === '' || sanitized.gender === null || sanitized.gender === undefined) {
        sanitized.gender = 'other';
    }

    // Remove empty workingMode (still delete this one)
    if (sanitized.workingMode === '' || sanitized.workingMode === null || sanitized.workingMode === undefined) {
        delete sanitized.workingMode;
    }

    // Remove empty optional fields
    const optionalFields = ['workingHours', 'dateOfBirth', 'dateOfJoining'];
    optionalFields.forEach(field => {
        if (sanitized[field] === '' || sanitized[field] === null) {
            delete sanitized[field];
        }
    });

    return sanitized;
}

// Employee table row
function EmployeeTableRows({ profiles, onEdit, onDelete, onToggleHidden, canToggleHidden, startIndex = 0 }) {
    return profiles.map((profile, index) => {
        const isHidden = profile.isHidden;
        const displayName = profile.name || profile.user?.username || '—';
        return (
            <TableRow
                key={profile._id}
                hover
                sx={{
                    opacity: isHidden ? 0.72 : 1,
                    bgcolor: isHidden ? 'action.hover' : undefined,
                }}
            >
                <TableCell sx={{ color: 'text.secondary', width: 48 }}>{startIndex + index + 1}</TableCell>
                <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        {profile.hasProfilePic ? (
                            <Avatar
                                src={`${import.meta.env.VITE_API_URL}/employee-profiles/${profile._id}/file/profile-pic?token=${localStorage.getItem('auth_token')}&t=${profile.updatedAt || Date.now()}`}
                                alt=""
                                sx={{ width: 32, height: 32 }}
                            />
                        ) : (
                            <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem' }}>
                                {(displayName[0] || '?').toUpperCase()}
                            </Avatar>
                        )}
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={displayName}>
                            {displayName}
                        </Typography>
                    </Stack>
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{profile.user?.username || '—'}</TableCell>
                <TableCell>
                    <Chip label={profile.user?.role || 'N/A'} size="small" color="primary" variant="outlined" />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{profile.user?.department || '—'}</TableCell>
                <TableCell>
                    {isHidden ? (
                        <Chip label="Hidden" size="small" color="warning" variant="outlined" />
                    ) : (
                        <Chip label="Active" size="small" color="success" variant="filled" />
                    )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                        {canToggleHidden ? (
                            <Tooltip title={isHidden ? 'Unhide profile' : 'Hide profile'}>
                                <IconButton
                                    size="small"
                                    onClick={() => onToggleHidden(profile)}
                                    color={isHidden ? 'success' : 'warning'}
                                >
                                    {isHidden ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                                </IconButton>
                            </Tooltip>
                        ) : null}
                        <Tooltip title="Manage employee">
                            <IconButton size="small" onClick={() => onEdit(profile)} color="primary">
                                <ManageAccountsIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete employee">
                            <IconButton size="small" onClick={() => onDelete(profile)} color="error">
                                <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </TableCell>
            </TableRow>
        );
    });
}

function EmployeeTable({ profiles, loading, emptyMessage, onEdit, onDelete, onToggleHidden, canToggleHidden, startIndex = 0 }) {
    return (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600, width: 48 }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, minWidth: 120 }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                                <CircularProgress size={28} />
                            </TableCell>
                        </TableRow>
                    ) : profiles.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    ) : (
                        <EmployeeTableRows
                            profiles={profiles}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleHidden={onToggleHidden}
                            canToggleHidden={canToggleHidden}
                            startIndex={startIndex}
                        />
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default function EmployeeManagementPage() {
    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch {
            return null;
        }
    }, []);
    const userRole = currentUser?.role || '';
    const canCreateUser = ['superadmin', 'listingadmin', 'hradmin', 'operationhead'].includes(userRole);
    const canManageRoster = ['superadmin', 'hradmin', 'operationhead'].includes(userRole);
    const canToggleHidden = ['superadmin', 'hradmin'].includes(userRole);

    const [rows, setRows] = useState([]);
    const [editOpen, setEditOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [editForm, setEditForm] = useState({
        username: '',
        role: '',
        department: '',
        workingMode: '',
        workingHours: '',
        name: '',
        phoneNumber: '',
        dateOfBirth: '',

        dateOfJoining: '',
        gender: '',
        address: '',
        email: '',
        aadharNumber: '',
        panNumber: '',
        bankAccountNumber: '',
        bankIFSC: '',
        bankName: '',
        myTaskList: '',
        primaryTask: '',
        secondaryTask: ''
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
    const [validationErrors, setValidationErrors] = useState({});
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);
    const [deletingProfile, setDeletingProfile] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [secretsOpen, setSecretsOpen] = useState(false);
    const [isEditingSecrets, setIsEditingSecrets] = useState(false);
    const [savingSecrets, setSavingSecrets] = useState(false);
    const [hiddenAccordionExpanded, setHiddenAccordionExpanded] = useState(false);

    const loadProfiles = async () => {
        setLoading(true);
        try {
            const list = await listEmployeeProfiles();
            // Seller accounts are managed elsewhere; exclude from employee roster
            setRows(list.filter((p) => (p.user?.role || '') !== 'seller'));
        } catch (e) {
            console.error('Failed to load employees', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canManageRoster) {
            loadProfiles();
        } else {
            setLoading(false);
        }
    }, [canManageRoster]);

    const openEdit = (profile) => {
        setEditingProfile(profile);
        setEditForm({
            username: profile.user?.username || '',
            role: profile.user?.role || '',
            department: profile.user?.department || '',
            workingMode: profile.workingMode || '',
            workingHours: profile.workingHours || '',
            name: profile.name || '',
            phoneNumber: profile.phoneNumber || '',
            dateOfBirth: profile.dateOfBirth || '',
            dateOfJoining: profile.dateOfJoining || '',
            gender: profile.gender || '',
            address: profile.address || '',
            email: profile.email || '',
            aadharNumber: profile.aadharNumber || '',
            panNumber: profile.panNumber || '',
            bankAccountNumber: profile.bankAccountNumber || '',
            bankIFSC: profile.bankIFSC || '',
            bankName: profile.bankName || '',
            myTaskList: profile.myTaskList || '',
            primaryTask: profile.primaryTask || '',
            secondaryTask: profile.secondaryTask || ''
        });
        setEditOpen(true);
        setIsEditing(false);
        setActiveTab(0);
    };

    const closeEdit = () => {
        setEditOpen(false);
        setEditingProfile(null);
        setIsEditing(false);
    };

    const handleStartEdit = () => {
        setIsEditing(true);
        setValidationErrors({});
    };

    const validateForm = () => {
        const errors = {};

        if (!editForm.name || editForm.name.trim() === '') {
            errors.name = 'Name is required';
        }
        if (!editForm.username || editForm.username.trim() === '') {
            errors.username = 'Username is required';
        }
        if (!editForm.email || editForm.email.trim() === '') {
            errors.email = 'Email is required';
        }
        if (!editForm.role || editForm.role.trim() === '') {
            errors.role = 'Role is required';
        }
        if (!editForm.department || editForm.department.trim() === '') {
            errors.department = 'Department is required';
        }
        if (!editForm.workingMode || editForm.workingMode.trim() === '') {
            errors.workingMode = 'Working Mode is required';
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!editingProfile) return;

        if (!validateForm()) {
            const missingFields = Object.keys(validationErrors).map(field => {
                const fieldNames = {
                    name: 'Name',
                    username: 'Username',
                    email: 'Email',
                    role: 'Role',
                    department: 'Department',
                    workingMode: 'Working Mode'
                };
                return fieldNames[field] || field;
            });

            setActiveTab(0);

            const errorMsg = missingFields.length === 1
                ? `${missingFields[0]} is required (Profile tab)`
                : `Please fill in: ${missingFields.join(', ')} (Profile tab)`;

            setSnack({ open: true, message: errorMsg, severity: 'error' });
            return;
        }

        setSaving(true);
        try {
            const payload = sanitizePayload(editForm);
            await updateEmployeeProfile(editingProfile._id, payload);
            await loadProfiles();
            setIsEditing(false);
            setSnack({ open: true, message: 'Changes saved successfully!', severity: 'success' });
        } catch (err) {
            console.error('Failed to update profile', err);
            const errorMsg = err.response?.data?.details || err.response?.data?.error || 'Failed to update profile. Please try again.';
            setSnack({ open: true, message: errorMsg, severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSecrets = async () => {
        if (!editingProfile) return;

        setSavingSecrets(true);
        try {
            const payload = sanitizePayload(editForm);
            await updateEmployeeProfile(editingProfile._id, payload);
            await loadProfiles();
            setIsEditingSecrets(false);
            setSnack({ open: true, message: 'Secret details updated successfully!', severity: 'success' });
        } catch (err) {
            console.error('Failed to update secrets', err);
            const errorMsg = err.response?.data?.details || err.response?.data?.error || 'Failed to update secret details.';
            setSnack({ open: true, message: errorMsg, severity: 'error' });
        } finally {
            setSavingSecrets(false);
        }
    };

    const handleCancelSecretsEdit = () => {
        if (editingProfile) {
            setEditForm({
                ...editForm,
                aadharNumber: editingProfile.aadharNumber || '',
                panNumber: editingProfile.panNumber || '',
                bankAccountNumber: editingProfile.bankAccountNumber || '',
                bankIFSC: editingProfile.bankIFSC || '',
                bankName: editingProfile.bankName || ''
            });
        }
        setIsEditingSecrets(false);
    };

    const handleCloseSecrets = () => {
        setSecretsOpen(false);
        setIsEditingSecrets(false);
    };

    const openDeleteDialog = (profile) => {
        setDeletingProfile(profile);
        setDeleteConfirmStep(1);
        setDeleteDialogOpen(true);
    };

    const closeDeleteDialog = () => {
        setDeleteDialogOpen(false);
        setDeletingProfile(null);
        setDeleteConfirmStep(1);
    };

    const handleDeleteConfirm = async () => {
        if (deleteConfirmStep === 1) {
            setDeleteConfirmStep(2);
            return;
        }

        setDeleting(true);
        try {
            await deleteEmployeeProfile(deletingProfile._id);
            await loadProfiles();
            setSnack({ open: true, message: `Employee "${deletingProfile.user?.username}" permanently deleted.`, severity: 'success' });
            closeDeleteDialog();
        } catch (err) {
            console.error('Failed to delete employee', err);
            const errorMsg = err.response?.data?.details || err.response?.data?.error || 'Failed to delete employee. Please try again.';
            setSnack({ open: true, message: errorMsg, severity: 'error' });
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleHidden = async (profile) => {
        try {
            const result = await toggleEmployeeHidden(profile._id);
            await loadProfiles();
            setSnack({
                open: true,
                message: result.message || `Profile ${profile.isHidden ? 'unhidden' : 'hidden'} successfully!`,
                severity: 'success'
            });
        } catch (err) {
            console.error('Failed to toggle hidden status', err);
            const errorMsg = err.response?.data?.details || err.response?.data?.error || 'Failed to toggle hidden status.';
            setSnack({ open: true, message: errorMsg, severity: 'error' });
        }
    };

    // Separate active and hidden profiles
    const activeProfiles = rows.filter(r => !r.isHidden && (
        (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user?.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user?.role || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user?.department || '').toLowerCase().includes(search.toLowerCase())
    ));

    const hiddenProfiles = rows.filter(r => r.isHidden && (
        (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user?.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user?.role || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.user?.department || '').toLowerCase().includes(search.toLowerCase())
    ));

    const totalHiddenCount = rows.filter(r => r.isHidden).length;
    const filteredHiddenCount = hiddenProfiles.length;

    return (
        <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>Team Management</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Create user accounts and manage employee profiles in one place.
                    </Typography>
                </Box>
                {canManageRoster ? (
                    <Tooltip title="Refresh roster">
                        <span>
                            <IconButton onClick={() => loadProfiles()} disabled={loading} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                ) : null}
            </Stack>

            <Grid container spacing={3}>
                {canCreateUser ? (
                    <Grid item xs={12} md={canManageRoster ? 4 : 12} lg={canManageRoster ? 4 : 6}>
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, position: { md: 'sticky' }, top: 16, maxWidth: canManageRoster ? 'none' : 520, mx: canManageRoster ? 0 : 'auto' }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                                <AddIcon color="primary" fontSize="small" />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>Add User</Typography>
                            </Stack>
                            <AddUserForm onCreated={() => canManageRoster && loadProfiles()} />
                        </Paper>
                    </Grid>
                ) : null}

                {canManageRoster ? (
                    <Grid item xs={12} md={canCreateUser ? 8 : 12}>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Employees ({activeProfiles.length}{totalHiddenCount ? ` · ${totalHiddenCount} hidden` : ''})
                        </Typography>
                        <TextField
                            placeholder="Search name, username, role, department..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            size="small"
                            sx={{ minWidth: { sm: 280 } }}
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

                <EmployeeTable
                    profiles={activeProfiles}
                    loading={loading}
                    emptyMessage={search ? 'No matching employees found' : 'No employees yet — create a user on the left'}
                    onEdit={openEdit}
                    onDelete={openDeleteDialog}
                    onToggleHidden={handleToggleHidden}
                    canToggleHidden={canToggleHidden}
                />

                {totalHiddenCount > 0 ? (
                    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
                        <Accordion
                            expanded={hiddenAccordionExpanded}
                            onChange={(e, isExpanded) => setHiddenAccordionExpanded(isExpanded)}
                            disableGutters
                            elevation={0}
                            sx={{ '&::before': { display: 'none' } }}
                        >
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                sx={{
                                    px: 2,
                                    bgcolor: 'warning.50',
                                    '&:hover': { bgcolor: 'warning.100' },
                                }}
                            >
                                <Typography variant="subtitle2" fontWeight={600} color="warning.dark">
                                    Hidden accounts ({search ? filteredHiddenCount : totalHiddenCount})
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ p: 0 }}>
                                <EmployeeTable
                                    profiles={hiddenProfiles}
                                    loading={false}
                                    emptyMessage="No hidden profiles match your search"
                                    onEdit={openEdit}
                                    onDelete={openDeleteDialog}
                                    onToggleHidden={handleToggleHidden}
                                    canToggleHidden={canToggleHidden}
                                    startIndex={activeProfiles.length}
                                />
                            </AccordionDetails>
                        </Accordion>
                    </Box>
                ) : null}
            </Paper>
                    </Grid>
                ) : null}
            </Grid>

            {/* Edit Dialog - Reusing exact same structure from before */}
            <Dialog
                open={editOpen}
                onClose={closeEdit}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        height: '80vh',
                        maxHeight: '80vh',
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', m: 0, p: 2 }}>
                    <Typography variant="h6" component="div">Manage Employee - {editingProfile?.user?.username}</Typography>
                    <Box>
                        {!isEditing && (
                            <>
                                <Button
                                    startIcon={<SecurityIcon />}
                                    onClick={() => setSecretsOpen(true)}
                                    variant="outlined"
                                    color="primary"
                                    size="small"
                                    sx={{ mr: 1 }}
                                >
                                    Secrets
                                </Button>
                                <Button
                                    startIcon={<EditIcon />}
                                    onClick={handleStartEdit}
                                    variant="contained"
                                    color="primary"
                                    size="small"
                                    sx={{ mr: 2 }}
                                >
                                    Edit
                                </Button>
                            </>
                        )}
                        <IconButton onClick={closeEdit}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 'calc(80vh - 140px)' }}>
                    <Tabs
                        value={activeTab}
                        onChange={(e, newValue) => setActiveTab(newValue)}
                        variant="fullWidth"
                        sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            backgroundColor: 'background.paper',
                            zIndex: 10,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            minHeight: 64,
                            '& .MuiTab-root': {
                                minHeight: 64,
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                textTransform: 'none',
                                transition: 'none',
                            },
                        }}
                    >
                        <Tab icon={<PersonIcon />} label="Profile" iconPosition="start" />
                        <Tab icon={<AssignmentIcon />} label="My Task List" iconPosition="start" />
                        <Tab icon={<StarIcon />} label="Primary Task" iconPosition="start" />
                        <Tab icon={<BookmarkIcon />} label="Secondary Task" iconPosition="start" />
                    </Tabs>

                    <Box sx={{ p: 3, overflow: 'auto', flex: 1 }}>
                        <TabPanel value={activeTab} index={0}>
                            <Grid container spacing={3}>
                                <Grid item xs={12}>
                                    <Typography variant="subtitle2" color="primary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                                        Professional Details
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Username"
                                                value={editForm.username}
                                                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                                                size="small"
                                                disabled={!isEditing}
                                                required
                                                error={!!validationErrors.username}
                                                helperText={validationErrors.username}
                                                sx={{
                                                    '& .MuiFormLabel-asterisk': {
                                                        color: 'red',
                                                    },
                                                }}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                select
                                                label="Role"
                                                value={editForm.role}
                                                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                                fullWidth
                                                size="small"
                                                disabled={!isEditing}
                                                required
                                                error={!!validationErrors.role}
                                                helperText={validationErrors.role}
                                                sx={{
                                                    '& .MuiFormLabel-asterisk': {
                                                        color: 'red',
                                                    },
                                                }}
                                            >
                                                <MenuItem value="productadmin">Product Research Admin</MenuItem>
                                                <MenuItem value="listingadmin">Listing Admin</MenuItem>
                                                <MenuItem value="compatibilityadmin">Compatibility Admin</MenuItem>
                                                <MenuItem value="compatibilityeditor">Compatibility Editor</MenuItem>
                                                <MenuItem value="fulfillmentadmin">Fulfillment Admin</MenuItem>
                                                <MenuItem value="hradmin">HR Admin</MenuItem>
                                                <MenuItem value="hr">HR</MenuItem>
                                                <MenuItem value="operationhead">Operation Head</MenuItem>
                                                <MenuItem value="lister">Lister</MenuItem>
                                                <MenuItem value="advancelister">Advance Lister</MenuItem>
                                                <MenuItem value="trainee">Trainee</MenuItem>
                                                <MenuItem value="seller">Seller</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                select
                                                label="Department"
                                                value={editForm.department}
                                                onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                                                fullWidth
                                                size="small"
                                                disabled={!isEditing}
                                                required
                                                error={!!validationErrors.department}
                                                helperText={validationErrors.department}
                                                sx={{
                                                    '& .MuiFormLabel-asterisk': {
                                                        color: 'red',
                                                    },
                                                }}
                                            >
                                                <MenuItem value="">Select Department</MenuItem>
                                                <MenuItem value="Product Research">Product Research Department</MenuItem>
                                                <MenuItem value="Listing">Listing Department</MenuItem>
                                                <MenuItem value="Compatibility">Compatibility Department</MenuItem>
                                                <MenuItem value="Fulfillment">Fulfillment Department</MenuItem>
                                                <MenuItem value="HR">HR Department</MenuItem>
                                                <MenuItem value="Operations">Operations Department</MenuItem>
                                                <MenuItem value="Executives">Executives Department</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                select
                                                label="Working Mode"
                                                value={editForm.workingMode}
                                                onChange={(e) => setEditForm({ ...editForm, workingMode: e.target.value })}
                                                fullWidth
                                                size="small"
                                                disabled={!isEditing}
                                                required
                                                error={!!validationErrors.workingMode}
                                                helperText={validationErrors.workingMode}
                                                sx={{
                                                    '& .MuiFormLabel-asterisk': {
                                                        color: 'red',
                                                    },
                                                }}
                                            >
                                                <MenuItem value="">Select</MenuItem>
                                                <MenuItem value="remote">Remote</MenuItem>
                                                <MenuItem value="office">Office</MenuItem>
                                                <MenuItem value="hybrid">Hybrid</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Working Hours"
                                                value={editForm.workingHours}
                                                onChange={(e) => setEditForm({ ...editForm, workingHours: e.target.value })}
                                                fullWidth
                                                size="small"
                                                placeholder="e.g., 9 AM - 6 PM"
                                                disabled={!isEditing}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Date of Joining"
                                                type="date"
                                                value={editForm.dateOfJoining ? editForm.dateOfJoining.split('T')[0] : ''}
                                                onChange={(e) => setEditForm({ ...editForm, dateOfJoining: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                                InputLabelProps={{ shrink: true }}
                                            />
                                        </Grid>
                                    </Grid>
                                </Grid>

                                <Grid item xs={12}>
                                    <Divider />
                                </Grid>

                                <Grid item xs={12}>
                                    <Typography variant="subtitle2" color="primary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                                        Personal Details
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Full Name"
                                                value={editForm.name}
                                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                                required
                                                error={!!validationErrors.name}
                                                helperText={validationErrors.name}
                                                sx={{
                                                    '& .MuiFormLabel-asterisk': {
                                                        color: 'red',
                                                    },
                                                }}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Email"
                                                value={editForm.email}
                                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                                required
                                                error={!!validationErrors.email}
                                                helperText={validationErrors.email}
                                                sx={{
                                                    '& .MuiFormLabel-asterisk': {
                                                        color: 'red',
                                                    },
                                                }}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Phone"
                                                value={editForm.phoneNumber}
                                                onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                select
                                                fullWidth
                                                label="Gender"
                                                value={editForm.gender}
                                                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                            >
                                                <MenuItem value="">Select</MenuItem>
                                                <MenuItem value="male">Male</MenuItem>
                                                <MenuItem value="female">Female</MenuItem>
                                                <MenuItem value="other">Other</MenuItem>
                                                <MenuItem value="prefer_not_to_say">Prefer not to say</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                label="Date of Birth"
                                                type="date"
                                                value={editForm.dateOfBirth ? editForm.dateOfBirth.split('T')[0] : ''}
                                                onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                                InputLabelProps={{ shrink: true }}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                select
                                                fullWidth
                                                label="Blood Group"
                                                value={editForm.bloodGroup}
                                                onChange={(e) => setEditForm({ ...editForm, bloodGroup: e.target.value })}
                                                disabled={!isEditing}
                                                size="small"
                                            >
                                                <MenuItem value="">Select</MenuItem>
                                                <MenuItem value="A+">A+</MenuItem>
                                                <MenuItem value="A-">A-</MenuItem>
                                                <MenuItem value="B+">B+</MenuItem>
                                                <MenuItem value="B-">B-</MenuItem>
                                                <MenuItem value="AB+">AB+</MenuItem>
                                                <MenuItem value="AB-">AB-</MenuItem>
                                                <MenuItem value="O+">O+</MenuItem>
                                                <MenuItem value="O-">O-</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                fullWidth
                                                label="Address"
                                                value={editForm.address}
                                                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                                multiline
                                                rows={2}
                                                disabled={!isEditing}
                                                size="small"
                                            />
                                        </Grid>
                                    </Grid>
                                </Grid>
                            </Grid>
                        </TabPanel>

                        <TabPanel value={activeTab} index={1}>
                            <Box sx={{ maxWidth: 800, mx: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="h6" gutterBottom>
                                    My Task List
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Enter each task on a new line. Use • for bullets.
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    label="Task List"
                                    placeholder="• Task 1&#10;• Task 2&#10;• Task 3"
                                    value={editForm.myTaskList}
                                    onChange={(e) => setEditForm({ ...editForm, myTaskList: e.target.value })}
                                    disabled={!isEditing}
                                    variant="outlined"
                                    sx={{
                                        flex: 1,
                                        '& .MuiInputBase-root': {
                                            fontFamily: 'monospace',
                                            fontSize: '0.95rem',
                                            height: '100%',
                                            alignItems: 'flex-start'
                                        }
                                    }}
                                />
                            </Box>
                        </TabPanel>

                        <TabPanel value={activeTab} index={2}>
                            <Box sx={{ maxWidth: 800, mx: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="h6" gutterBottom>
                                    Primary Task
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Describe the primary task or responsibility for this employee.
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    label="Primary Task"
                                    placeholder="Describe the primary task in detail..."
                                    value={editForm.primaryTask}
                                    onChange={(e) => setEditForm({ ...editForm, primaryTask: e.target.value })}
                                    disabled={!isEditing}
                                    variant="outlined"
                                    sx={{
                                        flex: 1,
                                        '& .MuiInputBase-root': {
                                            height: '100%',
                                            alignItems: 'flex-start'
                                        }
                                    }}
                                />
                            </Box>
                        </TabPanel>

                        <TabPanel value={activeTab} index={3}>
                            <Box sx={{ maxWidth: 800, mx: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="h6" gutterBottom>
                                    Secondary Task
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Describe the secondary task or additional responsibilities.
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    label="Secondary Task"
                                    placeholder="Describe the secondary task in detail..."
                                    value={editForm.secondaryTask}
                                    onChange={(e) => setEditForm({ ...editForm, secondaryTask: e.target.value })}
                                    disabled={!isEditing}
                                    variant="outlined"
                                    sx={{
                                        flex: 1,
                                        '& .MuiInputBase-root': {
                                            height: '100%',
                                            alignItems: 'flex-start'
                                        }
                                    }}
                                />
                            </Box>
                        </TabPanel>
                    </Box>
                </DialogContent>
                {isEditing && (
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button
                            onClick={handleSave}
                            variant="contained"
                            color="success"
                            disabled={saving}
                            startIcon={saving && <CircularProgress size={20} color="inherit" />}
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogActions>
                )}
            </Dialog>

            <Snackbar
                open={snack.open}
                autoHideDuration={4000}
                onClose={() => setSnack({ ...snack, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                sx={{ zIndex: 99999 }}
            >
                <Alert
                    onClose={() => setSnack({ ...snack, open: false })}
                    severity={snack.severity}
                    sx={{ width: '100%' }}
                    variant="filled"
                >
                    {snack.message}
                </Alert>
            </Snackbar>

            {/* Delete Dialog - Same as before */}
            <Dialog
                open={deleteDialogOpen}
                onClose={closeDeleteDialog}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        borderTop: '4px solid #d32f2f'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                    <DeleteForeverIcon />
                    <Typography variant="h6" component="span">
                        {deleteConfirmStep === 1 ? 'Confirm Permanent Deletion' : 'Final Confirmation Required'}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    {deleteConfirmStep === 1 ? (
                        <Box sx={{ mt: 2 }}>
                            <Alert severity="error" sx={{ mb: 3 }}>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                                    ⚠️ WARNING: This action cannot be undone!
                                </Typography>
                                <Typography variant="body2">
                                    You are about to permanently delete:
                                </Typography>
                            </Alert>
                            <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1, mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">Employee</Typography>
                                <Typography variant="h6" sx={{ mb: 1 }}>{deletingProfile?.user?.username}</Typography>
                                <Chip label={deletingProfile?.user?.role || 'N/A'} size="small" color="primary" sx={{ mr: 1 }} />
                                <Chip label={deletingProfile?.user?.department || 'N/A'} size="small" />
                                <Typography variant="body2" sx={{ mt: 1 }}>{deletingProfile?.name || 'No name provided'}</Typography>
                                <Typography variant="body2" color="text.secondary">{deletingProfile?.email || 'No email'}</Typography>
                            </Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                <strong>This will permanently delete:</strong>
                            </Typography>
                            <Box component="ul" sx={{ m: 0, pl: 3 }}>
                                <li><Typography variant="body2">Employee profile and all personal information</Typography></li>
                                <li><Typography variant="body2">User account and login credentials</Typography></li>
                                <li><Typography variant="body2">All uploaded documents (Aadhar, PAN, Profile Picture)</Typography></li>
                                <li><Typography variant="body2">All associated data and history</Typography></li>
                            </Box>
                        </Box>
                    ) : (
                        <Box sx={{ mt: 2 }}>
                            <Alert severity="error" sx={{ mb: 3 }}>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    🚨 FINAL WARNING: You are about to permanently delete this employee!
                                </Typography>
                            </Alert>
                            <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                                Are you sure you want to proceed?
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                                This action is permanent and cannot be undone.
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={closeDeleteDialog} disabled={deleting}>
                        Cancel
                    </Button>
                    {deleteConfirmStep === 1 ? (
                        <Button
                            onClick={handleDeleteConfirm}
                            variant="contained"
                            color="warning"
                            disabled={deleting}
                        >
                            Continue to Final Step
                        </Button>
                    ) : (
                        <Button
                            onClick={handleDeleteConfirm}
                            variant="contained"
                            color="error"
                            disabled={deleting}
                            startIcon={<DeleteForeverIcon />}
                        >
                            {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Secrets Modal - Same as before */}
            <Dialog
                open={secretsOpen}
                onClose={handleCloseSecrets}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', m: 0, p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SecurityIcon />
                        <Typography variant="h6" component="div">Sensitive Documents</Typography>
                    </Box>
                    <Box>
                        {!isEditingSecrets && (
                            <Button
                                startIcon={<EditIcon />}
                                onClick={() => setIsEditingSecrets(true)}
                                variant="contained"
                                color="primary"
                                size="small"
                                sx={{ mr: 2 }}
                            >
                                Edit
                            </Button>
                        )}
                        <IconButton onClick={handleCloseSecrets}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', color: 'text.secondary' }}>
                        Employee: {editingProfile?.user?.username}
                    </Typography>

                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Paper elevation={2} sx={{ p: 2, bgcolor: 'grey.50' }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    🪪 Aadhar Card
                                </Typography>
                                <Divider sx={{ mb: 2 }} />
                                <TextField
                                    fullWidth
                                    label="Aadhar Number"
                                    value={editForm.aadharNumber || ''}
                                    onChange={(e) => setEditForm({ ...editForm, aadharNumber: e.target.value })}
                                    size="small"
                                    disabled={!isEditingSecrets}
                                    placeholder={!isEditingSecrets && !editForm.aadharNumber ? 'Not provided' : ''}
                                    sx={{ mb: 2 }}
                                />
                                {editingProfile?.hasAadhar ? (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        startIcon={<LaunchIcon />}
                                        onClick={() => window.open(getEmployeeFileUrl(editingProfile._id, 'aadhar'), '_blank')}
                                        fullWidth
                                    >
                                        View Aadhar Document
                                    </Button>
                                ) : (
                                    <Alert severity="info">No Aadhar document uploaded</Alert>
                                )}
                            </Paper>
                        </Grid>

                        <Grid item xs={12}>
                            <Paper elevation={2} sx={{ p: 2, bgcolor: 'grey.50' }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    💳 PAN Card
                                </Typography>
                                <Divider sx={{ mb: 2 }} />
                                <TextField
                                    fullWidth
                                    label="PAN Number"
                                    value={editForm.panNumber || ''}
                                    onChange={(e) => setEditForm({ ...editForm, panNumber: e.target.value })}
                                    size="small"
                                    disabled={!isEditingSecrets}
                                    placeholder={!isEditingSecrets && !editForm.panNumber ? 'Not provided' : ''}
                                    sx={{ mb: 2 }}
                                />
                                {editingProfile?.hasPan ? (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        startIcon={<LaunchIcon />}
                                        onClick={() => window.open(getEmployeeFileUrl(editingProfile._id, 'pan'), '_blank')}
                                        fullWidth
                                    >
                                        View PAN Document
                                    </Button>
                                ) : (
                                    <Alert severity="info">No PAN document uploaded</Alert>
                                )}
                            </Paper>
                        </Grid>

                        <Grid item xs={12}>
                            <Paper elevation={2} sx={{ p: 2, bgcolor: 'grey.50' }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    🏦 Bank Details
                                </Typography>
                                <Divider sx={{ mb: 2 }} />
                                <Grid container spacing={2}>
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Bank Account Number"
                                            value={editForm.bankAccountNumber || ''}
                                            onChange={(e) => setEditForm({ ...editForm, bankAccountNumber: e.target.value })}
                                            size="small"
                                            disabled={!isEditingSecrets}
                                            placeholder={!isEditingSecrets && !editForm.bankAccountNumber ? 'Not provided' : ''}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Bank IFSC Code"
                                            value={editForm.bankIFSC || ''}
                                            onChange={(e) => setEditForm({ ...editForm, bankIFSC: e.target.value })}
                                            size="small"
                                            disabled={!isEditingSecrets}
                                            placeholder={!isEditingSecrets && !editForm.bankIFSC ? 'Not provided' : ''}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Bank Name"
                                            value={editForm.bankName || ''}
                                            onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                                            size="small"
                                            disabled={!isEditingSecrets}
                                            placeholder={!isEditingSecrets && !editForm.bankName ? 'Not provided' : ''}
                                        />
                                    </Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    {isEditingSecrets ? (
                        <>
                            <Button onClick={handleCancelSecretsEdit} disabled={savingSecrets}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSaveSecrets}
                                variant="contained"
                                color="success"
                                disabled={savingSecrets}
                                startIcon={savingSecrets && <CircularProgress size={20} color="inherit" />}
                            >
                                {savingSecrets ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleCloseSecrets} variant="outlined">
                            Close
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}
