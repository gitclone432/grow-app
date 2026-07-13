import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';

const BILLING_CYCLES = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
];

const EMPTY_FORM = {
    month: new Date().toISOString().slice(0, 7),
    sellerId: '',
    billingCycle: 'monthly',
    amount: '',
    notes: '',
};

const EMPTY_FILTERS = {
    filterMode: 'none',
    month: '',
    startMonth: '',
    endMonth: '',
    sellerId: '',
    billingCycle: '',
};

function getSellerLabel(seller) {
    return seller?.storeName || seller?.user?.username || seller?.user?.email || 'Unknown Seller';
}

function formatUsd(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(Number(value) || 0);
}

function formatMonth(value) {
    if (!value) return '-';
    const [year, month] = value.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const StoreSubscriptionPage = () => {
    const [records, setRecords] = useState([]);
    const [sellers, setSellers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [filters, setFilters] = useState(EMPTY_FILTERS);

    const fetchSellers = useCallback(async () => {
        try {
            const response = await api.get('/sellers/all');
            setSellers(response.data || []);
        } catch (err) {
            console.error('Failed to fetch sellers:', err);
            setError('Failed to load sellers');
        }
    }, []);

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (filters.filterMode === 'single' && filters.month) {
                params.append('month', filters.month);
            } else if (filters.filterMode === 'range') {
                if (filters.startMonth) params.append('startMonth', filters.startMonth);
                if (filters.endMonth) params.append('endMonth', filters.endMonth);
            }
            if (filters.sellerId) params.append('sellerId', filters.sellerId);
            if (filters.billingCycle) params.append('billingCycle', filters.billingCycle);

            const response = await api.get(`/store-subscriptions?${params.toString()}`);
            setRecords(response.data || []);
        } catch (err) {
            console.error('Failed to fetch subscription records:', err);
            setError(err.response?.data?.error || 'Failed to load subscription records');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchSellers();
    }, [fetchSellers]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const summary = useMemo(() => {
        return records.reduce((acc, record) => {
            acc.totalAmount += Number(record.amount) || 0;
            acc.totalRecords += 1;
            if (record.billingCycle === 'monthly') acc.monthlyAmount += Number(record.amount) || 0;
            if (record.billingCycle === 'yearly') acc.yearlyAmount += Number(record.amount) || 0;
            return acc;
        }, {
            totalAmount: 0,
            totalRecords: 0,
            monthlyAmount: 0,
            yearlyAmount: 0,
        });
    }, [records]);

    const handleOpenDialog = (record = null) => {
        if (record) {
            setEditingId(record._id);
            setFormData({
                month: record.month || EMPTY_FORM.month,
                sellerId: record.sellerId?._id || record.sellerId || '',
                billingCycle: record.billingCycle || 'monthly',
                amount: record.amount ?? '',
                notes: record.notes || '',
            });
        } else {
            setEditingId(null);
            setFormData(EMPTY_FORM);
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingId(null);
        setFormData(EMPTY_FORM);
    };

    const handleSave = async () => {
        if (!formData.month || !formData.sellerId || !formData.billingCycle || formData.amount === '') {
            setError('Month, seller, billing cycle, and amount are required');
            return;
        }

        try {
            setSaving(true);
            setError('');
            const payload = {
                month: formData.month,
                sellerId: formData.sellerId,
                billingCycle: formData.billingCycle,
                amount: parseFloat(formData.amount) || 0,
                notes: formData.notes,
            };

            if (editingId) {
                await api.put(`/store-subscriptions/${editingId}`, payload);
                setSuccess('Subscription record updated successfully');
            } else {
                await api.post('/store-subscriptions', payload);
                setSuccess('Subscription record added successfully');
            }

            handleCloseDialog();
            fetchRecords();
        } catch (err) {
            console.error('Failed to save subscription record:', err);
            setError(err.response?.data?.error || 'Failed to save subscription record');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this subscription record?')) return;
        try {
            setError('');
            await api.delete(`/store-subscriptions/${id}`);
            setSuccess('Subscription record deleted successfully');
            fetchRecords();
        } catch (err) {
            console.error('Failed to delete subscription record:', err);
            setError(err.response?.data?.error || 'Failed to delete subscription record');
        }
    };

    return (
        <Box sx={{ pb: 4, background: 'linear-gradient(135deg, #f8fafc 0%, #eefbf3 100%)', p: { xs: 1.5, sm: 2, md: 3 } }}>
            <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
                <Typography color="text.secondary">Finance & Cash Flow</Typography>
                <Typography color="text.primary" fontWeight={600}>Store Subscription</Typography>
            </Breadcrumbs>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 3 }}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: (theme) => theme.palette.primary.main }}>
                        Store Subscription
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Track monthly and yearly store subscription charges by seller.
                    </Typography>
                </Box>
                <Button startIcon={<RefreshIcon />} variant="outlined" onClick={fetchRecords} disabled={loading}>
                    Refresh
                </Button>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => handleOpenDialog()}>
                    Add Subscription
                </Button>
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}
            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Total Subscription Amount</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800 }}>{formatUsd(summary.totalAmount)}</Typography>
                            <Typography variant="body2" color="text.secondary">{summary.totalRecords} records</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Monthly Subscriptions</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800 }}>{formatUsd(summary.monthlyAmount)}</Typography>
                            <Typography variant="body2" color="text.secondary">Recurring monthly charges in current result set</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Yearly Subscriptions</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800 }}>{formatUsd(summary.yearlyAmount)}</Typography>
                            <Typography variant="body2" color="text.secondary">Yearly charges in current result set</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Filters
                </Typography>
                <Grid container spacing={2} alignItems="flex-end">
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Month Filter</InputLabel>
                            <Select
                                value={filters.filterMode}
                                label="Month Filter"
                                onChange={(e) => setFilters((prev) => ({
                                    ...prev,
                                    filterMode: e.target.value,
                                    month: '',
                                    startMonth: '',
                                    endMonth: '',
                                }))}
                            >
                                <MenuItem value="none">None</MenuItem>
                                <MenuItem value="single">Single Month</MenuItem>
                                <MenuItem value="range">Month Range</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    {filters.filterMode === 'single' && (
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField
                                label="Month"
                                type="month"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={filters.month}
                                onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
                            />
                        </Grid>
                    )}
                    {filters.filterMode === 'range' && (
                        <>
                            <Grid item xs={12} sm={6} md={2}>
                                <TextField
                                    label="Start Month"
                                    type="month"
                                    fullWidth
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    value={filters.startMonth}
                                    onChange={(e) => setFilters((prev) => ({ ...prev, startMonth: e.target.value }))}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <TextField
                                    label="End Month"
                                    type="month"
                                    fullWidth
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    value={filters.endMonth}
                                    onChange={(e) => setFilters((prev) => ({ ...prev, endMonth: e.target.value }))}
                                />
                            </Grid>
                        </>
                    )}
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Seller</InputLabel>
                            <Select
                                value={filters.sellerId}
                                label="Seller"
                                onChange={(e) => setFilters((prev) => ({ ...prev, sellerId: e.target.value }))}
                            >
                                <MenuItem value="">All Sellers</MenuItem>
                                {sellers.map((seller) => (
                                    <MenuItem key={seller._id} value={seller._id}>
                                        {getSellerLabel(seller)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Cycle</InputLabel>
                            <Select
                                value={filters.billingCycle}
                                label="Cycle"
                                onChange={(e) => setFilters((prev) => ({ ...prev, billingCycle: e.target.value }))}
                            >
                                <MenuItem value="">All</MenuItem>
                                {BILLING_CYCLES.map((cycle) => (
                                    <MenuItem key={cycle.value} value={cycle.value}>
                                        {cycle.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={1}>
                        <Button variant="contained" fullWidth onClick={fetchRecords} disabled={loading}>
                            Apply
                        </Button>
                    </Grid>
                    <Grid item xs={12} sm={6} md={1}>
                        <Button
                            variant="text"
                            fullWidth
                            onClick={() => setFilters(EMPTY_FILTERS)}
                        >
                            Clear
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: (theme) => theme.palette.primary.main, '& th': { color: 'white', fontWeight: 700 } }}>
                                <TableCell>Month</TableCell>
                                <TableCell>Seller</TableCell>
                                <TableCell>Cycle</TableCell>
                                <TableCell align="right">Amount (USD)</TableCell>
                                <TableCell>Notes</TableCell>
                                <TableCell>Last Updated</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {records.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                                        <Typography color="text.secondary">No subscription records found.</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                records.map((record) => (
                                    <TableRow key={record._id} hover>
                                        <TableCell sx={{ fontWeight: 600 }}>{formatMonth(record.month)}</TableCell>
                                        <TableCell>{record.sellerName || '-'}</TableCell>
                                        <TableCell sx={{ textTransform: 'capitalize' }}>{record.billingCycle}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>{formatUsd(record.amount)}</TableCell>
                                        <TableCell sx={{ maxWidth: 280 }}>{record.notes || '-'}</TableCell>
                                        <TableCell>
                                            {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton size="small" onClick={() => handleOpenDialog(record)}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton size="small" color="error" onClick={() => handleDelete(record._id)}>
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

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    {editingId ? 'Edit Store Subscription' : 'Add Store Subscription'}
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Stack spacing={2}>
                        <Box>
                            <Typography
                                variant="body2"
                                sx={{
                                    mb: 0.75,
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Subscription Month
                            </Typography>
                            <TextField
                                type="month"
                                fullWidth
                                value={formData.month}
                                onChange={(e) => setFormData((prev) => ({ ...prev, month: e.target.value }))}
                                required
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#111827',
                                        backgroundColor: '#ffffff',
                                    },
                                }}
                            />
                        </Box>

                        <FormControl fullWidth size="small">
                            <InputLabel>Seller</InputLabel>
                            <Select
                                value={formData.sellerId}
                                label="Seller"
                                onChange={(e) => setFormData((prev) => ({ ...prev, sellerId: e.target.value }))}
                            >
                                {sellers.map((seller) => (
                                    <MenuItem key={seller._id} value={seller._id}>
                                        {getSellerLabel(seller)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small">
                            <InputLabel>Billing Cycle</InputLabel>
                            <Select
                                value={formData.billingCycle}
                                label="Billing Cycle"
                                onChange={(e) => setFormData((prev) => ({ ...prev, billingCycle: e.target.value }))}
                            >
                                {BILLING_CYCLES.map((cycle) => (
                                    <MenuItem key={cycle.value} value={cycle.value}>
                                        {cycle.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            label="Amount (USD)"
                            type="number"
                            fullWidth
                            inputProps={{ min: 0, step: '0.01' }}
                            value={formData.amount}
                            onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                            required
                        />

                        <TextField
                            label="Notes"
                            fullWidth
                            multiline
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                            placeholder="Optional subscription note"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default StoreSubscriptionPage;
