import React, { useState, useEffect, useCallback } from 'react';
import {
    Alert,
    Box,
    Breadcrumbs,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

const MARKETPLACES = ['US', 'AU', 'UK', 'CA'];

const AffiliateBalancePage = () => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filter states
    const [filterMode, setFilterMode] = useState('none'); // 'none', 'single', 'range'
    const [singleDate, setSingleDate] = useState(new Date().toISOString().split('T')[0]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterAccountName, setFilterAccountName] = useState('');
    const [filterMarketplace, setFilterMarketplace] = useState('');

    // Management dialog states
    const [openManageDialog, setOpenManageDialog] = useState(false);
    const [manageTab, setManageTab] = useState('accounts'); // 'accounts' or 'cards'

    // Dialog states
    const [openDialog, setOpenDialog] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        accountName: '',
        availableBalance: '',
        balanceAdded: '',
        totalBalance: '',
        cardNo: '',
        expenses: '',
        marketplace: 'US',
        remarks: '',
        notes: '',
    });

    // Account names for dropdown
    const [accountNames, setAccountNames] = useState([]);
    const [showAddAccountInput, setShowAddAccountInput] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');

    // Card numbers for dropdown
    const [cardNumbers, setCardNumbers] = useState([]);
    const [showAddCardInput, setShowAddCardInput] = useState(false);
    const [newCardNumber, setNewCardNumber] = useState('');

    // Fetch records
    const fetchRecords = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();

            if (filterMode === 'single' && singleDate) {
                params.append('date', singleDate);
            } else if (filterMode === 'range') {
                if (startDate) params.append('startDate', startDate);
                if (endDate) params.append('endDate', endDate);
            }

            if (filterAccountName) params.append('accountName', filterAccountName);
            if (filterMarketplace) params.append('marketplace', filterMarketplace);

            const response = await api.get(`/affiliate-balance?${params.toString()}`);
            setRecords(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load records');
        } finally {
            setLoading(false);
        }
    }, [filterMode, singleDate, startDate, endDate, filterAccountName, filterMarketplace]);

    // Fetch account names
    const fetchAccountNames = useCallback(async () => {
        try {
            const response = await api.get('/affiliate-balance/accounts/list');
            setAccountNames(response.data);
        } catch (err) {
            console.error('Failed to fetch account names:', err);
        }
    }, []);

    // Fetch card numbers
    const fetchCardNumbers = useCallback(async () => {
        try {
            const response = await api.get('/affiliate-balance/cards/list');
            setCardNumbers(response.data);
        } catch (err) {
            console.error('Failed to fetch card numbers:', err);
        }
    }, []);

    useEffect(() => {
        fetchRecords();
        fetchAccountNames();
        fetchCardNumbers();
    }, []);

    // Handle add/edit dialog open
    const handleOpenDialog = (record = null) => {
        if (record) {
            setEditingId(record._id);
            setFormData({
                date: record.date,
                accountName: record.accountName,
                availableBalance: record.availableBalance,
                balanceAdded: record.balanceAdded,
                totalBalance: record.totalBalance,
                cardNo: record.cardNo,
                expenses: record.expenses,
                marketplace: record.marketplace || 'US',
                remarks: record.remarks,
                notes: record.notes,
            });
        } else {
            setEditingId(null);
            setFormData({
                date: new Date().toISOString().split('T')[0],
                accountName: '',
                availableBalance: '',
                balanceAdded: '',
                totalBalance: '',
                cardNo: '',
                expenses: '',
                marketplace: 'US',
                remarks: '',
                notes: '',
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setShowAddAccountInput(false);
        setNewAccountName('');
        setShowAddCardInput(false);
        setNewCardNumber('');
    };

    // Calculate total balance
    const calculateTotalBalance = useCallback(() => {
        const available = parseFloat(formData.availableBalance) || 0;
        const added = parseFloat(formData.balanceAdded) || 0;
        return available + added;
    }, [formData.availableBalance, formData.balanceAdded]);

    // Handle account name change
    const handleAccountNameChange = (newValue) => {
        if (newValue === 'add_new') {
            setShowAddAccountInput(true);
            setFormData({ ...formData, accountName: '' });
        } else {
            setFormData({ ...formData, accountName: newValue });
            setShowAddAccountInput(false);
        }
    };

    // Handle add new account
    const handleAddNewAccount = () => {
        if (newAccountName.trim()) {
            setFormData({ ...formData, accountName: newAccountName });
            setAccountNames([...accountNames, newAccountName].sort());
            setShowAddAccountInput(false);
            setNewAccountName('');
        }
    };

    // Handle card number change
    const handleCardNumberChange = (newValue) => {
        if (newValue === 'add_new') {
            setShowAddCardInput(true);
            setFormData({ ...formData, cardNo: '' });
        } else {
            setFormData({ ...formData, cardNo: newValue });
            setShowAddCardInput(false);
        }
    };

    // Handle add new card
    const handleAddNewCard = () => {
        if (newCardNumber.trim()) {
            // Keep only last 4 digits
            const last4 = newCardNumber.slice(-4);
            setFormData({ ...formData, cardNo: last4 });
            setCardNumbers([...cardNumbers, last4].sort());
            setShowAddCardInput(false);
            setNewCardNumber('');
        }
    };

    // Handle save
    const handleSave = async () => {
        try {
            setError('');

            if (!formData.date || !formData.accountName) {
                setError('Date and Account Name are required');
                return;
            }

            const payload = {
                ...formData,
                availableBalance: parseFloat(formData.availableBalance) || 0,
                balanceAdded: parseFloat(formData.balanceAdded) || 0,
                totalBalance: calculateTotalBalance(),
                expenses: parseFloat(formData.expenses) || 0,
            };

            if (editingId) {
                await api.put(`/affiliate-balance/${editingId}`, payload);
                setSuccess('Record updated successfully');
            } else {
                await api.post('/affiliate-balance', payload);
                setSuccess('Record added successfully');
            }

            handleCloseDialog();
            fetchRecords();
            fetchAccountNames();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save record');
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;

        try {
            setError('');
            await api.delete(`/affiliate-balance/${id}`);
            setSuccess('Record deleted successfully');
            fetchRecords();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete record');
        }
    };

    // Handle delete account
    const handleDeleteAccount = async (accountName) => {
        if (!window.confirm(`Are you sure you want to delete all records for account "${accountName}"? This action cannot be undone.`)) return;

        try {
            setError('');
            await api.delete(`/affiliate-balance/account/${accountName}`);
            setSuccess(`Account "${accountName}" and all its records deleted successfully`);
            fetchRecords();
            fetchAccountNames();
            setOpenManageDialog(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete account');
        }
    };

    // Handle delete card
    const handleDeleteCard = async (cardNo) => {
        if (!window.confirm(`Are you sure you want to delete all records with card ****${cardNo}? This action cannot be undone.`)) return;

        try {
            setError('');
            await api.delete(`/affiliate-balance/card/${cardNo}`);
            setSuccess(`Card ****${cardNo} and all its records deleted successfully`);
            fetchRecords();
            fetchCardNumbers();
            setOpenManageDialog(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete card');
        }
    };

    // Get balance color
    const getBalanceColor = (totalBalance) => {
        const val = parseFloat(totalBalance) || 0;
        return val >= 10 ? '#4caf50' : '#f44336'; // Green if >= 10, Red otherwise
    };

    const sortedRecords = records.sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <Box sx={{ pb: 4, background: 'linear-gradient(135deg, #f0f9ff 0%, #ecfdf5 100%)', p: { xs: 1.5, sm: 2, md: 3 } }}>
            <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
                <Typography color="text.secondary">Finance & Cash Flow</Typography>
                <Typography color="text.primary" fontWeight={600}>Daily Card Expenses</Typography>
            </Breadcrumbs>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, flex: 1, color: theme => theme.palette.primary.main }}>
                    Daily Card Expenses
                </Typography>
                <Button startIcon={<RefreshIcon />} size="small" onClick={fetchRecords} disabled={loading} sx={{ color: theme => theme.palette.info.main }}>
                    Refresh
                </Button>
                <Button variant="outlined" size="small" onClick={() => setOpenManageDialog(true)} sx={{ borderColor: theme => theme.palette.warning.main, color: theme => theme.palette.warning.main }}>
                    Manage Cards & Accounts
                </Button>
                <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => handleOpenDialog()} sx={{ background: theme => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.success.main} 100%)`, boxShadow: theme => `0 4px 12px ${theme.palette.primary.main}40` }}>
                    Add Record
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, background: theme => `linear-gradient(135deg, ${theme.palette.error.main}15 0%, ${theme.palette.error.main}05 100%)`, border: theme => `1px solid ${theme.palette.error.main}30` }} onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2, background: theme => `linear-gradient(135deg, ${theme.palette.success.main}15 0%, ${theme.palette.success.main}05 100%)`, border: theme => `1px solid ${theme.palette.success.main}30` }} onClose={() => setSuccess('')}>{success}</Alert>}

            {/* Filters */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, background: theme => `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,249,255,0.9) 100%)`, border: theme => `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: theme => theme.palette.primary.main }}>Filters</Typography>
                <Grid container spacing={2} alignItems="flex-end">
                    <Grid item xs={12} sm={3}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Date Filter</InputLabel>
                            <Select
                                value={filterMode}
                                onChange={(e) => setFilterMode(e.target.value)}
                                label="Date Filter"
                            >
                                <MenuItem value="none">None</MenuItem>
                                <MenuItem value="single">Single Day</MenuItem>
                                <MenuItem value="range">Date Range</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    {filterMode === 'single' && (
                        <Grid item xs={12} sm={3}>
                            <TextField
                                label="Date"
                                type="date"
                                size="small"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={singleDate}
                                onChange={(e) => setSingleDate(e.target.value)}
                            />
                        </Grid>
                    )}

                    {filterMode === 'range' && (
                        <>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Start Date"
                                    type="date"
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="End Date"
                                    type="date"
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </Grid>
                        </>
                    )}

                    <Grid item xs={12} sm={3}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Account</InputLabel>
                            <Select
                                value={filterAccountName}
                                onChange={(e) => setFilterAccountName(e.target.value)}
                                label="Account"
                            >
                                <MenuItem value="">All Accounts</MenuItem>
                                {accountNames.map(name => (
                                    <MenuItem key={name} value={name}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Marketplace</InputLabel>
                            <Select
                                value={filterMarketplace}
                                onChange={(e) => setFilterMarketplace(e.target.value)}
                                label="Marketplace"
                            >
                                <MenuItem value="">All</MenuItem>
                                {MARKETPLACES.map(mp => (
                                    <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={2}>
                        <Button
                            variant="contained"
                            fullWidth
                            onClick={fetchRecords}
                            disabled={loading}
                            size="small"
                        >
                            Apply
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Records Table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: theme => theme.palette.primary.main, '& th': { color: 'white', fontWeight: 700 } }}>
                                <TableCell sx={{ fontWeight: 700, color: 'white' }}>Date</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'white' }}>Account Name</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'white' }}>Available Balance (USD)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'white' }}>Balance Added (USD)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'white' }}>Total Balance (USD)</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'white' }}>Card No</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'white' }}>Expenses</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'white' }}>Marketplace</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'white' }}>Payment Revision</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'white' }}>Notes</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700, color: 'white' }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedRecords.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={11} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                        No records found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedRecords.map(record => (
                                    <TableRow key={record._id} hover>
                                        <TableCell>{record.date}</TableCell>
                                        <TableCell>{record.accountName}</TableCell>
                                        <TableCell align="right">${parseFloat(record.availableBalance || 0).toFixed(2)}</TableCell>
                                        <TableCell align="right">${parseFloat(record.balanceAdded || 0).toFixed(2)}</TableCell>
                                        <TableCell
                                            align="right"
                                            sx={{
                                                color: getBalanceColor(record.totalBalance),
                                                fontWeight: 600,
                                            }}
                                        >
                                            ${parseFloat(record.totalBalance || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell>{record.cardNo || '-'}</TableCell>
                                        <TableCell align="right">${parseFloat(record.expenses || 0).toFixed(2)}</TableCell>
                                        <TableCell>
                                            <Chip label={record.marketplace} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>{record.remarks || '-'}</TableCell>
                                        <TableCell sx={{ maxWidth: 150, wordBreak: 'break-word' }}>
                                            {record.notes || '-'}
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleOpenDialog(record)}
                                                title="Edit"
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDelete(record._id)}
                                                title="Delete"
                                                sx={{ color: 'error.main' }}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    {editingId ? 'Edit Record' : 'Add New Record'}
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Stack spacing={2}>
                        <TextField
                            label="Date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            required
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    color: 'text.primary',
                                },
                                '& .MuiInputLabel-root': {
                                    color: 'text.primary',
                                }
                            }}
                        />

                        <Box>
                            {showAddAccountInput ? (
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        label="New Account Name"
                                        fullWidth
                                        size="small"
                                        value={newAccountName}
                                        onChange={(e) => setNewAccountName(e.target.value)}
                                        placeholder="Enter account name"
                                    />
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={handleAddNewAccount}
                                        sx={{ whiteSpace: 'nowrap' }}
                                    >
                                        Add
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setShowAddAccountInput(false);
                                            setNewAccountName('');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </Stack>
                            ) : (
                                <FormControl fullWidth size="small">
                                    <InputLabel>Account Name</InputLabel>
                                    <Select
                                        value={formData.accountName}
                                        onChange={(e) => handleAccountNameChange(e.target.value)}
                                        label="Account Name"
                                    >
                                        <MenuItem value="">Select Account</MenuItem>
                                        {accountNames.map(name => (
                                            <MenuItem key={name} value={name}>{name}</MenuItem>
                                        ))}
                                        <MenuItem value="add_new" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            + Add New Account
                                        </MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        </Box>

                        <TextField
                            label="Available Balance (USD)"
                            type="number"
                            fullWidth
                            inputProps={{ step: '0.01' }}
                            value={formData.availableBalance}
                            onChange={(e) => setFormData({ ...formData, availableBalance: e.target.value })}
                        />

                        <TextField
                            label="Balance Added (USD)"
                            type="number"
                            fullWidth
                            inputProps={{ step: '0.01' }}
                            value={formData.balanceAdded}
                            onChange={(e) => setFormData({ ...formData, balanceAdded: e.target.value })}
                        />

                        <Card sx={{ bgcolor: 'info.light', p: 1.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Total Balance: ${calculateTotalBalance().toFixed(2)}
                            </Typography>
                        </Card>

                        <Box>
                            {showAddCardInput ? (
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        label="Card Number (Last 4 Digits)"
                                        fullWidth
                                        size="small"
                                        value={newCardNumber}
                                        onChange={(e) => setNewCardNumber(e.target.value.slice(-4))}
                                        placeholder="Enter last 4 digits"
                                        inputProps={{ maxLength: 4 }}
                                    />
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={handleAddNewCard}
                                        sx={{ whiteSpace: 'nowrap' }}
                                    >
                                        Add
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setShowAddCardInput(false);
                                            setNewCardNumber('');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </Stack>
                            ) : (
                                <FormControl fullWidth size="small">
                                    <InputLabel>Card No</InputLabel>
                                    <Select
                                        value={formData.cardNo}
                                        onChange={(e) => handleCardNumberChange(e.target.value)}
                                        label="Card No"
                                    >
                                        <MenuItem value="">Select Card</MenuItem>
                                        {cardNumbers.map(card => (
                                            <MenuItem key={card} value={card}>****{card}</MenuItem>
                                        ))}
                                        <MenuItem value="add_new" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            + Add New Card
                                        </MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        </Box>

                        <TextField
                            label="Expenses (USD)"
                            type="number"
                            fullWidth
                            inputProps={{ step: '0.01' }}
                            value={formData.expenses}
                            onChange={(e) => setFormData({ ...formData, expenses: e.target.value })}
                        />

                        <FormControl fullWidth size="small">
                            <InputLabel>Marketplace</InputLabel>
                            <Select
                                value={formData.marketplace}
                                onChange={(e) => setFormData({ ...formData, marketplace: e.target.value })}
                                label="Marketplace"
                            >
                                {MARKETPLACES.map(mp => (
                                    <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small">
                            <InputLabel>Remarks</InputLabel>
                            <Select
                                value={formData.remarks}
                                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                label="Remarks"
                            >
                                <MenuItem value="">Select status</MenuItem>
                                <MenuItem value="Payment Revision">Payment Revision</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField
                            label="Notes"
                            fullWidth
                            multiline
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Add any notes..."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained">
                        {editingId ? 'Update' : 'Add'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Manage Cards & Accounts Dialog */}
            <Dialog open={openManageDialog} onClose={() => setOpenManageDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    Manage Cards & Accounts
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Stack spacing={3}>
                        <FormControl fullWidth variant="outlined" sx={{ mb: 2 }}>
                            <InputLabel 
                                shrink 
                                sx={{ 
                                    color: '#000 !important',
                                    backgroundColor: '#fff',
                                    px: 1,
                                    '&.Mui-focused': {
                                        color: '#000 !important'
                                    }
                                }}
                            >
                                Select Type
                            </InputLabel>
                            <Select
                                value={manageTab}
                                onChange={(e) => setManageTab(e.target.value)}
                                label="Select Type"
                                notched
                                sx={{
                                    color: '#000',
                                    backgroundColor: '#fff',
                                    '& .MuiOutlinedInput-root': {
                                        color: '#000',
                                        '& fieldset': {
                                            borderColor: '#ccc',
                                        },
                                        '&:hover fieldset': {
                                            borderColor: '#999',
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#1976d2',
                                        }
                                    },
                                    '& .MuiInputLabel-root': {
                                        color: '#000',
                                    }
                                }}
                            >
                                <MenuItem value="accounts" sx={{ color: '#000', backgroundColor: '#fff' }}>Accounts</MenuItem>
                                <MenuItem value="cards" sx={{ color: '#000', backgroundColor: '#fff' }}>Cards</MenuItem>
                            </Select>
                        </FormControl>

                        {manageTab === 'accounts' && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                    Existing Accounts ({accountNames.length})
                                </Typography>
                                {accountNames.length === 0 ? (
                                    <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                        No accounts found
                                    </Typography>
                                ) : (
                                    <Stack spacing={1} sx={{ maxHeight: 300, overflowY: 'auto' }}>
                                        {accountNames.map(account => (
                                            <Box
                                                key={account}
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    p: 1.5,
                                                    bgcolor: 'grey.100',
                                                    borderRadius: 1,
                                                }}
                                            >
                                                <Typography variant="body2">{account}</Typography>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteAccount(account)}
                                                    sx={{ color: 'error.main' }}
                                                    title="Delete account"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        ))}
                                    </Stack>
                                )}
                            </Box>
                        )}

                        {manageTab === 'cards' && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                    Existing Cards ({cardNumbers.length})
                                </Typography>
                                {cardNumbers.length === 0 ? (
                                    <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                        No cards found
                                    </Typography>
                                ) : (
                                    <Stack spacing={1} sx={{ maxHeight: 300, overflowY: 'auto' }}>
                                        {cardNumbers.map(card => (
                                            <Box
                                                key={card}
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    p: 1.5,
                                                    bgcolor: 'grey.100',
                                                    borderRadius: 1,
                                                }}
                                            >
                                                <Typography variant="body2">****{card}</Typography>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteCard(card)}
                                                    sx={{ color: 'error.main' }}
                                                    title="Delete card"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        ))}
                                    </Stack>
                                )}
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenManageDialog(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AffiliateBalancePage;
