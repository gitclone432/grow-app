import { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Switch,
    FormControlLabel,
    TextField,
    MenuItem,
    Grid,
    Chip,
    CircularProgress,
    Alert,
    Tabs,
    Tab,
    InputAdornment,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Tooltip,
    IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { getAdminAttendanceReport, toggleUserStrictTimer, listEmployeeProfiles, forceStopAttendance, updateAttendanceHours, deleteAttendanceRecord } from '../../lib/api';

function TabPanel({ children, value, index }) {
    return (
        <div hidden={value !== index} style={{ marginTop: 24 }}>
            {value === index && children}
        </div>
    );
}

export default function AttendanceAdminPage() {
    const [tabValue, setTabValue] = useState(0);

    // Attendance tab state
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const [departmentFilter, setDepartmentFilter] = useState('All');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Strict Timer tab state
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [deptFilter, setDeptFilter] = useState('All');
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    // Hardcoded list of all departments
    const DEPARTMENTS = [
        'Product Research',
        'Listing',
        'Compatibility',
        'HR',
        'Operations',
        'Executives'
    ];

    const [departments] = useState(DEPARTMENTS);

    // Force stop dialog state
    const [forceStopDialog, setForceStopDialog] = useState({ open: false, record: null });

    // Edit hours dialog state
    const [editDialog, setEditDialog] = useState({ open: false, record: null, newHours: '' });

    // Delete confirmation dialog state
    const [deleteDialog, setDeleteDialog] = useState({ open: false, record: null });

    // Fetch employees for strict timer management
    useEffect(() => {
        const loadEmployees = async () => {
            setLoadingEmployees(true);
            try {
                const profiles = await listEmployeeProfiles();
                setEmployees(profiles);
            } catch (err) {
                console.error('Failed to load employees:', err);
            } finally {
                setLoadingEmployees(false);
            }
        };
        loadEmployees();
    }, []);

    // Filter employees for strict timer tab
    useEffect(() => {
        let filtered = employees;

        // Filter by search query
        if (searchQuery) {
            filtered = filtered.filter(emp =>
                emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.user?.username?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Filter by department
        if (deptFilter && deptFilter !== 'All') {
            filtered = filtered.filter(emp => (emp.department || emp.user?.department) === deptFilter);
        }

        setFilteredEmployees(filtered);
    }, [employees, searchQuery, deptFilter]);

    // Fetch attendance data when date or filter changes
    useEffect(() => {
        if (tabValue !== 0) return; // Only load when on attendance tab

        const loadAttendanceData = async () => {
            setLoading(true);
            setError(null);
            try {
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                const params = { date: dateStr };

                if (departmentFilter && departmentFilter !== 'All') {
                    params.department = departmentFilter;
                }

                const records = await getAdminAttendanceReport(params);
                setAttendanceRecords(records);
            } catch (err) {
                console.error('Failed to load working hours data:', err);
                setError('Failed to load working hours data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        loadAttendanceData();
    }, [selectedDate, departmentFilter, tabValue]);

    const handleStrictTimerToggle = async (userId, currentValue) => {
        console.log('Toggle clicked:', { userId, currentValue, newValue: !currentValue });

        if (!userId) {
            console.error('No userId provided to handleStrictTimerToggle');
            alert('Error: User ID is missing. Cannot toggle strict timer.');
            return;
        }

        try {
            console.log('Calling API to toggle strict timer...');
            const response = await toggleUserStrictTimer(userId, !currentValue);
            console.log('API response:', response);

            // Update local state
            setEmployees(prev =>
                prev.map(emp =>
                    emp.user?._id === userId
                        ? { ...emp, user: { ...emp.user, isStrictTimer: !currentValue } }
                        : emp
                )
            );

            console.log('Local state updated successfully');
        } catch (err) {
            console.error('Failed to toggle strict timer:', err);
            console.error('Error details:', {
                message: err.message,
                response: err.response?.data,
                status: err.response?.status
            });
            alert(`Failed to update strict timer setting: ${err.response?.data?.error || err.message}`);
        }
    };

    // Handle force stop timer
    const handleForceStop = async () => {
        if (!forceStopDialog.record) return;

        try {
            await forceStopAttendance(forceStopDialog.record._id);

            // Refresh attendance records
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const params = { date: `${year}-${month}-${day}` };
            if (departmentFilter && departmentFilter !== 'All') {
                params.department = departmentFilter;
            }
            const records = await getAdminAttendanceReport(params);
            setAttendanceRecords(records);

            setForceStopDialog({ open: false, record: null });
            alert(`Timer successfully stopped for ${forceStopDialog.record.user?.username}`);
        } catch (err) {
            console.error('Failed to force stop timer:', err);
            alert(`Failed to stop timer: ${err.response?.data?.error || err.message}`);
        }
    };

    // Handle edit hours
    const handleEditHours = async () => {
        if (!editDialog.record || !editDialog.newHours) return;

        const hours = parseFloat(editDialog.newHours);
        if (isNaN(hours) || hours < 0) {
            alert('Please enter a valid non-negative number for hours');
            return;
        }

        try {
            const totalWorkTime = hours * 60 * 60 * 1000; // Convert hours to milliseconds
            await updateAttendanceHours(editDialog.record._id, totalWorkTime);

            // Refresh attendance records
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const params = { date: `${year}-${month}-${day}` };
            if (departmentFilter && departmentFilter !== 'All') {
                params.department = departmentFilter;
            }
            const records = await getAdminAttendanceReport(params);
            setAttendanceRecords(records);

            setEditDialog({ open: false, record: null, newHours: '' });
            alert(`Hours updated to ${hours} for ${editDialog.record.user?.username}`);
        } catch (err) {
            console.error('Failed to edit hours:', err);
            alert(`Failed to edit hours: ${err.response?.data?.error || err.message}`);
        }
    };

    // Handle delete record
    const handleDeleteRecord = async () => {
        if (!deleteDialog.record) return;

        try {
            await deleteAttendanceRecord(deleteDialog.record._id);

            // Refresh attendance records
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const params = { date: `${year}-${month}-${day}` };
            if (departmentFilter && departmentFilter !== 'All') {
                params.department = departmentFilter;
            }
            const records = await getAdminAttendanceReport(params);
            setAttendanceRecords(records);

            setDeleteDialog({ open: false, record: null });
            alert(`Working hours record deleted for ${deleteDialog.record.user?.username}`);
        } catch (err) {
            console.error('Failed to delete record:', err);
            alert(`Failed to delete record: ${err.response?.data?.error || err.message}`);
        }
    };

    // Get warning level based on hours (in milliseconds)
    const getHoursWarning = (totalWorkTime) => {
        const hours = totalWorkTime / (1000 * 60 * 60);
        if (hours > 16) return 'error';
        if (hours > 12) return 'warning';
        return 'normal';
    };

    // Format milliseconds to HH:MM string
    const formatHours = (milliseconds) => {
        if (!milliseconds) return '00:00';
        const totalMinutes = Math.floor(milliseconds / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    // Format milliseconds to decimal hours for the edit dialog input
    const msToDecimalHours = (milliseconds) => {
        if (!milliseconds) return '0.00';
        return (milliseconds / (1000 * 60 * 60)).toFixed(2);
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">
                Working Hours Tracking
            </Typography>

            <Paper sx={{ mb: 3 }}>
                <Tabs
                    value={tabValue}
                    onChange={(e, newValue) => setTabValue(newValue)}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab label="Working Hours Records" />
                    <Tab label="Strict Timer Management" />
                </Tabs>
            </Paper>

            {/* Tab 1: Working Hours Records */}
            <TabPanel value={tabValue} index={0}>
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <LocalizationProvider dateAdapter={AdapterDateFns}>
                                <DatePicker
                                    label="Select Date"
                                    value={selectedDate}
                                    onChange={(newDate) => setSelectedDate(newDate)}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </LocalizationProvider>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                label="Department"
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                                fullWidth
                            >
                                <MenuItem value="All">All Departments</MenuItem>
                                {departments.map((dept) => (
                                    <MenuItem key={dept} value={dept}>
                                        {dept}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="h6" color="primary">
                                    {attendanceRecords.length}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Total Records
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </Paper>

                {error && (
                    <Alert severity="error" sx={{ mb: 3 }}>
                        {error}
                    </Alert>
                )}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: 'primary.main' }}>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Employee</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Role</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Department</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Status</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Hours Worked</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {attendanceRecords.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">
                                                No working hours records found for the selected date
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    attendanceRecords.map((record) => {
                                        const warningLevel = getHoursWarning(record.totalWorkTime);
                                        return (
                                            <TableRow
                                                key={record._id}
                                                hover
                                                sx={{
                                                    backgroundColor:
                                                        warningLevel === 'error' ? 'error.light' :
                                                            warningLevel === 'warning' ? 'warning.light' :
                                                                'transparent',
                                                    opacity: warningLevel !== 'normal' ? 0.85 : 1
                                                }}
                                            >
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {record.user?.username || 'Unknown'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {record.user?.email}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={record.user?.role || 'N/A'}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>{record.user?.department || 'N/A'}</TableCell>
                                                <TableCell align="center">
                                                    <Chip
                                                        label={record.status}
                                                        size="small"
                                                        color={
                                                            record.status === 'active'
                                                                ? 'success'
                                                                : record.status === 'paused'
                                                                    ? 'warning'
                                                                    : 'default'
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                                        <Typography variant="h6" fontFamily="monospace">
                                                            {formatHours(record.totalWorkTime)} hrs
                                                        </Typography>
                                                        {warningLevel === 'error' && (
                                                            <Chip label="!!" size="small" color="error" />
                                                        )}
                                                        {warningLevel === 'warning' && (
                                                            <Chip label="!" size="small" color="warning" />
                                                        )}
                                                    </Box>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                        {record.status === 'active' && (
                                                            <Tooltip title="Force stop this timer">
                                                                <IconButton
                                                                    color="error"
                                                                    size="small"
                                                                    onClick={() => setForceStopDialog({ open: true, record })}
                                                                >
                                                                    <StopCircleIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        <Tooltip title="Edit hours">
                                                            <IconButton
                                                                color="primary"
                                                                size="small"
                                                                onClick={() => setEditDialog({
                                                                    open: true,
                                                                    record,
                                                                    newHours: msToDecimalHours(record.totalWorkTime)
                                                                })}
                                                            >
                                                                <EditIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Delete record">
                                                            <IconButton
                                                                color="error"
                                                                size="small"
                                                                onClick={() => setDeleteDialog({ open: true, record })}
                                                            >
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </TabPanel>

            {/* Tab 2: Strict Timer Management */}
            <TabPanel value={tabValue} index={1}>
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                placeholder="Search by name, email, or username..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                select
                                label="Department"
                                value={deptFilter}
                                onChange={(e) => setDeptFilter(e.target.value)}
                                fullWidth
                            >
                                <MenuItem value="All">All Departments</MenuItem>
                                {departments.map((dept) => (
                                    <MenuItem key={dept} value={dept}>
                                        {dept}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                    </Grid>
                </Paper>

                {loadingEmployees ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: 'primary.main' }}>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Employee</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Role</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Department</TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Strict Timer</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredEmployees.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">
                                                No employees found
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredEmployees.map((emp) => (
                                        <TableRow key={emp._id} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {emp.user?.username || 'Unknown'}{emp.name ? ` (${emp.name})` : ''}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {emp.email || emp.user?.email}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={emp.user?.role || 'N/A'}
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>{emp.department || emp.user?.department || 'N/A'}</TableCell>
                                            <TableCell align="center">
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={emp.user?.isStrictTimer !== false}
                                                            onChange={() =>
                                                                handleStrictTimerToggle(
                                                                    emp.user?._id,
                                                                    emp.user?.isStrictTimer !== false
                                                                )
                                                            }
                                                            color="primary"
                                                        />
                                                    }
                                                    label={emp.user?.isStrictTimer !== false ? 'ON' : 'OFF'}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </TabPanel>

            {/* Force Stop Confirmation Dialog */}
            <Dialog
                open={forceStopDialog.open}
                onClose={() => setForceStopDialog({ open: false, record: null })}
            >
                <DialogTitle>Force Stop Timer</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to force-stop the timer for{' '}
                        <strong>{forceStopDialog.record?.user?.username}</strong>?
                        <br /><br />
                        Current hours: <strong>{formatHours(forceStopDialog.record?.totalWorkTime)} hrs</strong>
                        <br /><br />
                        This will immediately stop the timer and freeze the work hours at the current value.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setForceStopDialog({ open: false, record: null })}>
                        Cancel
                    </Button>
                    <Button onClick={handleForceStop} color="error" variant="contained">
                        Force Stop
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Hours Dialog */}
            <Dialog
                open={editDialog.open}
                onClose={() => setEditDialog({ open: false, record: null, newHours: '' })}
            >
                <DialogTitle>Edit Work Hours</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        Employee: <strong>{editDialog.record?.user?.username}</strong>
                        <br />
                        Date: <strong>{editDialog.record?.date}</strong>
                        <br />
                        Current Hours: <strong>{formatHours(editDialog.record?.totalWorkTime)} hrs</strong>
                    </DialogContentText>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="New Hours"
                        type="number"
                        fullWidth
                        value={editDialog.newHours}
                        onChange={(e) => setEditDialog({ ...editDialog, newHours: e.target.value })}
                        inputProps={{ min: 0, step: 0.01 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialog({ open: false, record: null, newHours: '' })}>
                        Cancel
                    </Button>
                    <Button onClick={handleEditHours} color="primary" variant="contained">
                        Save Changes
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, record: null })}
            >
                <DialogTitle>Delete Working Hours Record</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the working hours record for{' '}
                        <strong>{deleteDialog.record?.user?.username}</strong> on{' '}
                        <strong>{deleteDialog.record?.date}</strong>?
                        <br /><br />
                        Total Hours: <strong>{formatHours(deleteDialog.record?.totalWorkTime)} hrs</strong>
                        <br /><br />
                        <Alert severity="warning" sx={{ mt: 1 }}>
                            This action cannot be undone!
                        </Alert>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, record: null })}>
                        Cancel
                    </Button>
                    <Button onClick={handleDeleteRecord} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
