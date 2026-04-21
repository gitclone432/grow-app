import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    IconButton,
    Tooltip,
    Stack,
    Divider,
    useTheme,
    useMediaQuery,
    Pagination,
    CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Close';
import api from '../../lib/api';

// --- MOBILE PAYONEER CARD COMPONENT ---
function MobilePayoneerCard({ record, isEditing, renderCell, onEdit, onDelete, onSave, onCancel }) {
    return (
        <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1.5}>
                {/* Header Row: Store + Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            STORE
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                            {isEditing ? 'Editing...' : (record.store?.user?.username || 'Unknown')}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={0.5}>
                        {isEditing ? (
                            <>
                                <Tooltip title="Save">
                                    <IconButton color="primary" onClick={onSave} size="small">
                                        <SaveIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Cancel">
                                    <IconButton color="error" onClick={onCancel} size="small">
                                        <CancelIcon />
                                    </IconButton>
                                </Tooltip>
                            </>
                        ) : (
                            <>
                                <Tooltip title="Edit">
                                    <IconButton color="primary" onClick={onEdit} size="small">
                                        <EditIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                    <IconButton color="error" onClick={onDelete} size="small">
                                        <DeleteIcon />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                    </Stack>
                </Stack>

                <Divider />

                {/* Details Grid */}
                <Stack spacing={1.25}>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            BANK ACCOUNT
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>{renderCell(record, 'bankAccount')}</Box>
                    </Box>

                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            PAYMENT DATE
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>{renderCell(record, 'paymentDate', 'date')}</Box>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                AMOUNT ($)
                            </Typography>
                            <Box sx={{ mt: 0.5 }}>{renderCell(record, 'amount', 'number')}</Box>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                EXCHANGE RATE (₹)
                            </Typography>
                            <Box sx={{ mt: 0.5 }}>{renderCell(record, 'exchangeRate', 'number')}</Box>
                        </Box>
                    </Stack>

                    {!isEditing && (
                        <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                                <Box>
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                                        Actual (+2%)
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {record.actualExchangeRate?.toFixed(4) ?? '-'}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                                        Deposit (₹)
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                        {record.bankDeposit?.toFixed(2) ?? '-'}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    )}

                    {/* Period & Profit */}
                    <Stack direction="row" spacing={2}>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                PERIOD
                            </Typography>
                            {isEditing ? (
                                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                    <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }} value={editFormData?.periodStart || ''} onChange={(e) => handleEditChange('periodStart', e.target.value)} fullWidth />
                                    <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }} value={editFormData?.periodEnd || ''} onChange={(e) => handleEditChange('periodEnd', e.target.value)} fullWidth />
                                </Stack>
                            ) : (
                                <Typography variant="body2" sx={{ mt: 0.5 }}>
                                    {record.periodStart ? new Date(record.periodStart).toLocaleDateString() : '-'} → {record.periodEnd ? new Date(record.periodEnd).toLocaleDateString() : '-'}
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                PROFIT ($)
                            </Typography>
                            <Box sx={{ mt: 0.5 }}>{renderCell(record, 'profit', 'number')}</Box>
                        </Box>
                    </Stack>
                </Stack>
            </Stack>
        </Paper>
    );
}

const PayoneerSheetPage = () => {
    // Responsive breakpoints
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [records, setRecords] = useState([]);
    const [sellers, setSellers] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);

    // Advanced Filter State
    const [filters, setFilters] = useState({
        store: '',
        dateMode: 'none', // 'none', 'single', 'range'
        singleDate: '',
        dateRange: { start: '', end: '' }
    });

    // Pagination State
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
        totalPages: 1,
        totalRecords: 0
    });

    const [formData, setFormData] = useState({
        bankAccount: '', // ObjectId of BankAccount
        paymentDate: new Date().toISOString().split('T')[0],
        amount: '',
        exchangeRate: '',
        store: '',
        periodStart: '',
        periodEnd: '',
        profit: ''
    });

    // Calculated Preview for "Add New"
    const [preview, setPreview] = useState({
        actualExchangeRate: 0,
        bankDeposit: 0
    });

    // Editing State
    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // Fetch Reference Data on Mount
    useEffect(() => {
        fetchSellers();
        fetchBankAccounts();
    }, []);

    // Fetch Records when Filters or Page Changes
    useEffect(() => {
        fetchRecords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagination.page, filters]);

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const params = {
                page: pagination.page,
                limit: pagination.limit
            };

            // Add Store Filter
            if (filters.store) params.store = filters.store;

            // Add Date Filter based on Mode
            if (filters.dateMode === 'single' && filters.singleDate) {
                params.startDate = filters.singleDate;
                params.endDate = filters.singleDate;
            } else if (filters.dateMode === 'range') {
                if (filters.dateRange.start) params.startDate = filters.dateRange.start;
                if (filters.dateRange.end) params.endDate = filters.dateRange.end;
            }

            const { data } = await api.get('/payoneer', { params });

            // Backend now returns { records, totalRecords, totalPages, currentPage }
            if (data.records) {
                setRecords(data.records);
                setPagination(prev => ({
                    ...prev,
                    totalPages: data.totalPages,
                    totalRecords: data.totalRecords
                }));
            } else {
                // Fallback for old API response (array)
                setRecords(data);
            }
        } catch (error) {
            console.error('Failed to fetch records:', error);
        } finally {
            setLoading(false);
            setPageLoading(false);
        }
    };

    const fetchSellers = async () => {
        try {
            const { data } = await api.get('/sellers/all');
            setSellers(data);
        } catch (error) {
            console.error('Failed to fetch sellers:', error);
        }
    };

    const fetchBankAccounts = async () => {
        try {
            const { data } = await api.get('/bank-accounts');
            setBankAccounts(data);
        } catch (error) {
            console.error('Failed to fetch bank accounts:', error);
        }
    };

    // Update calculations when Amount or Rate changes (for Add Dialog)
    useEffect(() => {
        const amount = parseFloat(formData.amount) || 0;
        const rate = parseFloat(formData.exchangeRate) || 0;
        const actualRate = rate + (rate * 0.02);
        const deposit = amount * rate;

        setPreview({
            actualExchangeRate: actualRate,
            bankDeposit: deposit
        });
    }, [formData.amount, formData.exchangeRate]);



    const handleCreate = async () => {
        try {
            setLoading(true);
            await api.post('/payoneer', formData);
            setOpenDialog(false);
            fetchRecords();
            // Reset form
            setFormData({
                bankAccount: '',
                paymentDate: new Date().toISOString().split('T')[0],
                amount: '',
                exchangeRate: '',
                store: '',
                periodStart: '',
                periodEnd: '',
                profit: ''
            });
        } catch (error) {
            alert('Failed to create: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        try {
            await api.delete(`/payoneer/${id}`);
            setRecords(prev => prev.filter(r => r._id !== id));
        } catch (error) {
            console.error(error);
        }
    };

    // --- EDITING LOGIC ---

    const startEditing = (record) => {
        setEditingId(record._id);
        setEditFormData({
            bankAccount: record.bankAccount?._id,
            paymentDate: record.paymentDate ? record.paymentDate.split('T')[0] : '',
            amount: record.amount,
            exchangeRate: record.exchangeRate,
            store: record.store?._id,
            periodStart: record.periodStart ? record.periodStart.split('T')[0] : '',
            periodEnd: record.periodEnd ? record.periodEnd.split('T')[0] : '',
            profit: record.profit ?? ''
        });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditFormData({});
    };

    const handleEditChange = (field, value) => {
        setEditFormData(prev => ({ ...prev, [field]: value }));
    };

    const saveEdit = async () => {
        try {
            await api.put(`/payoneer/${editingId}`, editFormData);
            setEditingId(null);
            fetchRecords();
        } catch (error) {
            alert('Failed to update: ' + (error.response?.data?.error || error.message));
        }
    };

    // Render a cell that is text normally, but an input when editing
    const renderCell = (record, field, type = 'text') => {
        const isEditing = editingId === record._id;
        let value = isEditing ? editFormData[field] : (field === 'store' ? (record.store?.user?.username || 'Unknown') : record[field]);

        if (!isEditing && field === 'bankAccount') {
            value = record.bankAccount?.name || 'Unknown';
        }

        if (!isEditing) {
            if (field === 'amount' || field === 'bankDeposit') return value?.toFixed(2);
            if (field === 'actualExchangeRate') return value?.toFixed(4);
            if (field === 'paymentDate') return new Date(value).toLocaleDateString();
            if (field === 'periodStart' || field === 'periodEnd') return value ? new Date(value).toLocaleDateString() : '-';
            if (field === 'profit') return value != null ? value.toFixed(2) : '-';
            return value;
        }

        if (field === 'bankAccount') {
            return (
                <TextField
                    select
                    size="small"
                    value={editFormData.bankAccount || ''}
                    onChange={(e) => handleEditChange('bankAccount', e.target.value)}
                    sx={{ minWidth: 150 }}
                >
                    {bankAccounts.map((acc) => (
                        <MenuItem key={acc._id} value={acc._id}>
                            {acc.name}
                        </MenuItem>
                    ))}
                </TextField>
            );
        }

        if (field === 'store') {
            return (
                <TextField
                    select
                    size="small"
                    value={editFormData.store || ''}
                    onChange={(e) => handleEditChange('store', e.target.value)}
                    sx={{ minWidth: 120 }}
                >
                    {sellers.map((seller) => (
                        <MenuItem key={seller._id} value={seller._id}>
                            {seller.user?.username || seller.user?.email}
                        </MenuItem>
                    ))}
                </TextField>
            );
        }

        return (
            <TextField
                type={type}
                size="small"
                value={value}
                onChange={(e) => handleEditChange(field, e.target.value)}
                sx={{ maxWidth: 100 }}
            />
        );
    };

    if (pageLoading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
        </Box>
    );

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: { xs: 1, sm: 2 },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    mb: { xs: 2, sm: 3 }
                }}
            >
                <Typography variant={isSmallMobile ? 'h6' : 'h5'} sx={{ fontWeight: 'bold' }}>
                    Payoneer Sheet
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenDialog(true)}
                    fullWidth={isSmallMobile}
                >
                    Add Record
                </Button>
            </Box>

            {/* ADVANCED FILTERS */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
                        {/* Store Filter */}
                        <TextField
                            select
                            label="Store"
                            size="small"
                            value={filters.store}
                            onChange={(e) => setFilters(prev => ({ ...prev, store: e.target.value }))}
                            sx={{ minWidth: 150 }}
                        >
                            <MenuItem value="">
                                <em>All Stores</em>
                            </MenuItem>
                            {sellers.map((s) => (
                                <MenuItem key={s._id} value={s._id}>
                                    {s.user?.username || s.user?.email || 'Unknown'}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* Date Mode Selector */}
                        <TextField
                            select
                            label="Date Mode"
                            size="small"
                            value={filters.dateMode}
                            onChange={(e) => setFilters(prev => ({ ...prev, dateMode: e.target.value }))}
                            sx={{ minWidth: 120 }}
                        >
                            <MenuItem value="none">None</MenuItem>
                            <MenuItem value="single">Single Date</MenuItem>
                            <MenuItem value="range">Date Range</MenuItem>
                        </TextField>

                        {/* Conditional Date Inputs */}
                        {filters.dateMode === 'single' && (
                            <TextField
                                label="Date"
                                type="date"
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={filters.singleDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, singleDate: e.target.value }))}
                            />
                        )}

                        {filters.dateMode === 'range' && (
                            <>
                                <TextField
                                    label="From"
                                    type="date"
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    value={filters.dateRange.start}
                                    onChange={(e) => setFilters(prev => ({
                                        ...prev,
                                        dateRange: { ...prev.dateRange, start: e.target.value }
                                    }))}
                                />
                                <TextField
                                    label="To"
                                    type="date"
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    value={filters.dateRange.end}
                                    onChange={(e) => setFilters(prev => ({
                                        ...prev,
                                        dateRange: { ...prev.dateRange, end: e.target.value }
                                    }))}
                                />
                            </>
                        )}

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                                setFilters({
                                    store: '',
                                    dateMode: 'none',
                                    singleDate: '',
                                    dateRange: { start: '', end: '' }
                                });
                                setPagination(prev => ({ ...prev, page: 1 }));
                            }}
                        >
                            Clear Filters
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {isMobile ? (
                // MOBILE CARD VIEW
                <Box sx={{ mt: { xs: 1.5, sm: 2 } }}>
                    <Stack spacing={1.5}>
                        {records.map((record) => {
                            const isEditing = editingId === record._id;
                            return (
                                <MobilePayoneerCard
                                    key={record._id}
                                    record={record}
                                    isEditing={isEditing}
                                    renderCell={renderCell}
                                    onEdit={() => startEditing(record)}
                                    onDelete={() => handleDelete(record._id)}
                                    onSave={saveEdit}
                                    onCancel={cancelEditing}
                                />
                            );
                        })}

                        {records.length === 0 && !loading && (
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    No records found.
                                </Typography>
                            </Paper>
                        )}
                    </Stack>
                </Box>
            ) : (
                // DESKTOP TABLE VIEW
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Bank Account</TableCell>
                                <TableCell>Payment Date</TableCell>
                                <TableCell>Store</TableCell>
                                <TableCell>Amount (USD)</TableCell>
                                <TableCell>Exch. Rate</TableCell>
                                <TableCell>Actual Rate (+2%)</TableCell>
                                <TableCell>Bank Deposit (INR)</TableCell>
                                <TableCell>Period</TableCell>
                                <TableCell>Profit ($)</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {records.map((record) => {
                                const isEditing = editingId === record._id;
                                return (
                                    <TableRow key={record._id}>
                                        <TableCell>{renderCell(record, 'bankAccount')}</TableCell>
                                        <TableCell>{renderCell(record, 'paymentDate', 'date')}</TableCell>
                                        <TableCell>{renderCell(record, 'store')}</TableCell>
                                        <TableCell>{renderCell(record, 'amount', 'number')}</TableCell>
                                        <TableCell>{renderCell(record, 'exchangeRate', 'number')}</TableCell>

                                        {/* Calculated fields are READ-ONLY even in edit mode (server calculates them) */}
                                        <TableCell sx={{ bgcolor: isEditing ? '#f8f9fa' : 'inherit', color: 'text.secondary' }}>
                                            {isEditing ? 'Auto-calc' : record.actualExchangeRate?.toFixed(4)}
                                        </TableCell>
                                        <TableCell sx={{ bgcolor: isEditing ? '#f8f9fa' : 'inherit', color: 'text.secondary', fontWeight: 'bold' }}>
                                            {isEditing ? 'Auto-calc' : record.bankDeposit?.toFixed(2)}
                                        </TableCell>

                                        {/* Period range */}
                                        <TableCell>
                                            {isEditing ? (
                                                <Stack spacing={0.5}>
                                                    <TextField
                                                        type="date"
                                                        size="small"
                                                        label="From"
                                                        InputLabelProps={{ shrink: true }}
                                                        value={editFormData.periodStart || ''}
                                                        onChange={(e) => handleEditChange('periodStart', e.target.value)}
                                                        sx={{ width: 150 }}
                                                    />
                                                    <TextField
                                                        type="date"
                                                        size="small"
                                                        label="To"
                                                        InputLabelProps={{ shrink: true }}
                                                        value={editFormData.periodEnd || ''}
                                                        onChange={(e) => handleEditChange('periodEnd', e.target.value)}
                                                        sx={{ width: 150 }}
                                                    />
                                                </Stack>
                                            ) : (
                                                <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                                                    {record.periodStart ? new Date(record.periodStart).toLocaleDateString() : '-'}
                                                    {' → '}
                                                    {record.periodEnd ? new Date(record.periodEnd).toLocaleDateString() : '-'}
                                                </Typography>
                                            )}
                                        </TableCell>

                                        {/* Profit */}
                                        <TableCell>{renderCell(record, 'profit', 'number')}</TableCell>

                                        <TableCell align="right">
                                            {isEditing ? (
                                                <>
                                                    <Tooltip title="Save">
                                                        <IconButton color="primary" onClick={saveEdit}>
                                                            <SaveIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Cancel">
                                                        <IconButton color="error" onClick={cancelEditing}>
                                                            <CancelIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            ) : (
                                                <>
                                                    <Tooltip title="Edit">
                                                        <IconButton color="primary" size="small" onClick={() => startEditing(record)}>
                                                            <EditIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                        <IconButton color="error" size="small" onClick={() => handleDelete(record._id)}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {records.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={10} align="center">
                                        No records found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* PAGINATION */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Pagination
                    count={pagination.totalPages}
                    page={pagination.currentPage}
                    onChange={(e, value) => setPagination(prev => ({ ...prev, page: value }))}
                    color="primary"
                    showFirstButton
                    showLastButton
                />
            </Box>

            {/* CREATE DIALOG */}
            <Dialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                maxWidth="sm"
                fullWidth
                fullScreen={isSmallMobile}
            >
                <DialogTitle>Add Payoneer Record</DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            select
                            label="Bank Account"
                            fullWidth
                            value={formData.bankAccount}
                            onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                        >
                            {bankAccounts.map((acc) => (
                                <MenuItem key={acc._id} value={acc._id}>
                                    {acc.name}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* Store Name Selection */}
                        <TextField
                            select
                            label="Store Name"
                            fullWidth
                            value={formData.store}
                            onChange={(e) => setFormData({ ...formData, store: e.target.value })}
                        >
                            {sellers.map((seller) => (
                                <MenuItem key={seller._id} value={seller._id}>
                                    {seller.user?.username || seller.user?.email}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            label="Payment Date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={formData.paymentDate}
                            onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                        />

                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                            <TextField
                                label="Amount ($)"
                                type="number"
                                fullWidth
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            />
                            <TextField
                                label="Exchange Rate (₹)"
                                type="number"
                                fullWidth
                                value={formData.exchangeRate}
                                onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })}
                            />
                        </Stack>

                        {/* PREVIEW OF CALCULATIONS */}
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                            <Typography variant="subtitle2" gutterBottom>Calculated Preview:</Typography>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2">Actual Rate (+2%): <b>{preview.actualExchangeRate?.toFixed(4)}</b></Typography>
                                <Typography variant="body2">Bank Deposit: <b>{preview.bankDeposit?.toFixed(2)}</b></Typography>
                            </Box>
                        </Paper>

                        {/* Period Range */}
                        <Typography variant="subtitle2" sx={{ mb: -1 }}>Period (optional)</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                            <TextField
                                label="From"
                                type="date"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={formData.periodStart}
                                onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                            />
                            <TextField
                                label="To"
                                type="date"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={formData.periodEnd}
                                onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                            />
                        </Stack>

                        {/* Profit */}
                        <TextField
                            label="Profit ($)"
                            type="number"
                            fullWidth
                            placeholder="Enter profit amount (optional)"
                            value={formData.profit}
                            onChange={(e) => setFormData({ ...formData, profit: e.target.value })}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: { xs: 1, sm: 2 }, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' } }}>
                    <Button onClick={() => setOpenDialog(false)} fullWidth={isSmallMobile}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        variant="contained"
                        disabled={loading}
                        fullWidth={isSmallMobile}
                    >
                        {loading ? 'Saving...' : 'Save Record'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default PayoneerSheetPage;
