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
    IconButton,
    Stack,
    useMediaQuery,
    useTheme,
    CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';

// Mobile card for each expense
const MobileExpenseCard = ({ expense, onEdit, onDelete }) => {
    const dateStr = expense.date ? new Date(expense.date).toLocaleDateString() : '-';

    return (
        <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            Date
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {dateStr}
                        </Typography>
                    </Box>
                    <Typography
                        variant="body2"
                        noWrap
                        sx={{
                            fontWeight: 800,
                            color: 'error.main',
                            textAlign: 'right',
                            fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)',
                            maxWidth: '50%'
                        }}
                    >
                        ₹{Number.isFinite(expense.amount) ? expense.amount.toFixed(2) : (expense.amount ?? '-')}
                    </Typography>
                </Stack>

                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Expenditure
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {expense.name}
                    </Typography>
                </Box>

                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Paid By
                    </Typography>
                    <Typography variant="body2">{expense.paidBy}</Typography>
                </Box>

                <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <IconButton size="small" onClick={onEdit} color="primary">
                        <EditIcon />
                    </IconButton>
                    <IconButton size="small" onClick={onDelete} color="error">
                        <DeleteIcon />
                    </IconButton>
                </Stack>
            </Stack>
        </Paper>
    );
};

const ExtraExpensePage = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [expenses, setExpenses] = useState([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        name: '',
        amount: '',
        paidBy: ''
    });

    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        try {
            const { data } = await api.get('/extra-expenses');
            setExpenses(data);
        } catch (error) {
            console.error('Error fetching expenses:', error);
        } finally {
            setPageLoading(false);
        }
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            if (editingId) {
                await api.put(`/extra-expenses/${editingId}`, formData);
            } else {
                await api.post('/extra-expenses', formData);
            }
            handleClose();
            fetchExpenses();
        } catch (error) {
            alert('Failed to save: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this expense?')) return;
        try {
            await api.delete(`/extra-expenses/${id}`);
            fetchExpenses();
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to delete');
        }
    };

    const startEdit = (expense) => {
        setEditingId(expense._id);
        setFormData({
            date: expense.date ? expense.date.split('T')[0] : '',
            name: expense.name,
            amount: expense.amount,
            paidBy: expense.paidBy
        });
        setOpenDialog(true);
    };

    const handleClose = () => {
        setOpenDialog(false);
        setEditingId(null);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            name: '',
            amount: '',
            paidBy: ''
        });
    };

    if (pageLoading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
        </Box>
    );

    return (
        <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                mb={3}
            >
                <Typography variant="h5">Extra Expenses</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenDialog(true)}
                    fullWidth={isMobile}
                >
                    Add Expense
                </Button>
            </Stack>

            {/* MOBILE CARD VIEW */}
            <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
                {expenses.length === 0 ? (
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            No expenses found.
                        </Typography>
                    </Paper>
                ) : (
                    <Stack spacing={1.5}>
                        {expenses.map((expense) => (
                            <MobileExpenseCard
                                key={expense._id}
                                expense={expense}
                                onEdit={() => startEdit(expense)}
                                onDelete={() => handleDelete(expense._id)}
                            />
                        ))}
                    </Stack>
                )}
            </Box>

            {/* DESKTOP TABLE VIEW */}
            <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell>Date</TableCell>
                            <TableCell>Name of Expenditure</TableCell>
                            <TableCell align="right">Amount</TableCell>
                            <TableCell>Paid By</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {expenses.map((expense) => (
                            <TableRow key={expense._id}>
                                <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                                <TableCell>{expense.name}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                                    ₹{expense.amount?.toFixed(2)}
                                </TableCell>
                                <TableCell>{expense.paidBy}</TableCell>
                                <TableCell align="right">
                                    <IconButton size="small" onClick={() => startEdit(expense)} color="primary">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => handleDelete(expense._id)} color="error">
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {expenses.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} align="center">No expenses found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ADD / EDIT DIALOG */}
            <Dialog
                open={openDialog}
                onClose={handleClose}
                fullScreen={isSmallMobile}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>{editingId ? 'Edit Expense' : 'Add Extra Expense'}</DialogTitle>
                <DialogContent sx={{ minWidth: { xs: 'auto', sm: 300 } }}>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            label="Date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />

                        <TextField
                            label="Name of Expenditure"
                            fullWidth
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />

                        <TextField
                            label="Amount"
                            type="number"
                            fullWidth
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        />

                        <TextField
                            label="Paid By"
                            fullWidth
                            value={formData.paidBy}
                            onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={loading}>
                        {loading ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ExtraExpensePage;
