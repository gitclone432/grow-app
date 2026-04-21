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
    Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';

const PaymentAccountsPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]); // New
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [formData, setFormData] = useState({ name: '', bankAccount: '' });

    useEffect(() => {
        fetchAccounts();
        fetchBankAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            const { data } = await api.get('/payment-accounts');
            setAccounts(data);
        } catch (error) {
            console.error('Error fetching accounts:', error);
        }
    };

    const fetchBankAccounts = async () => {
        try {
            const { data } = await api.get('/bank-accounts');
            setBankAccounts(data);
        } catch (error) {
            console.error('Error fetching bank accounts:', error);
        }
    };

    const handleSubmit = async () => {
        try {
            if (editingAccount) {
                await api.put(`/payment-accounts/${editingAccount._id}`, formData);
            } else {
                await api.post('/payment-accounts', formData);
            }
            setOpenDialog(false);
            setEditingAccount(null);
            setFormData({ name: '', bankAccount: '' });
            fetchAccounts();
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed');
        }
    };

    const handleEdit = (account) => {
        setEditingAccount(account);
        setFormData({ name: account.name, bankAccount: account.bankAccount?._id || '' });
        setOpenDialog(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this account?')) return;
        try {
            await api.delete(`/payment-accounts/${id}`);
            fetchAccounts();
        } catch (error) {
            console.error(error);
        }
    };

    const handleClose = () => {
        setOpenDialog(false);
        setEditingAccount(null);
        setFormData({ name: '', bankAccount: '' });
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h5">Payment Accounts</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenDialog(true)}
                >
                    Add Account
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell>Account Name</TableCell>
                            <TableCell>Bank Account</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((acc) => (
                            <TableRow key={acc._id}>
                                <TableCell>{acc.name}</TableCell>
                                <TableCell>{acc.bankAccount?.name || 'Unlinked'}</TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={() => handleEdit(acc)} color="primary"><EditIcon /></IconButton>
                                    <IconButton onClick={() => handleDelete(acc._id)} color="error"><DeleteIcon /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} align="center">No accounts found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={openDialog} onClose={handleClose}>
                <DialogTitle>{editingAccount ? 'Edit Account' : 'New Payment Account'}</DialogTitle>
                <DialogContent sx={{ minWidth: 300 }}>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            label="Account Name"
                            fullWidth
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                        <TextField
                            select
                            label="Bank Account"
                            fullWidth
                            value={formData.bankAccount}
                            onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                        >
                            {bankAccounts.map((bank) => (
                                <MenuItem key={bank._id} value={bank._id}>
                                    {bank.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained">Save</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default PaymentAccountsPage;
