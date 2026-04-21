import React from 'react';
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
    useMediaQuery,
    useTheme,
    CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';
import useFetchTable from '../../hooks/useFetchTable';
import useFormDialog from '../../hooks/useFormDialog';

const INITIAL_FORM = { name: '', accountNumber: '', ifscCode: '' };

const BankAccountsPage = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const { rows: accounts, loading, refetch } = useFetchTable('/bank-accounts');

    const dialog = useFormDialog(INITIAL_FORM, {
        onSave: (formData, editingId) =>
            editingId
                ? api.put(`/bank-accounts/${editingId}`, formData)
                : api.post('/bank-accounts', formData),
        onAfterSave: refetch,
    });

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this bank account?')) return;
        try {
            await api.delete(`/bank-accounts/${id}`);
            refetch();
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
        </Box>
    );

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Box 
                display="flex" 
                flexDirection={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between" 
                alignItems={{ xs: 'stretch', sm: 'center' }}
                gap={{ xs: 1, sm: 0 }}
                mb={3}
            >
                <Typography variant="h5">Bank Accounts</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={dialog.openCreate}
                    fullWidth={isMobile}
                >
                    Add Bank Account
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell>Bank Name</TableCell>
                            <TableCell>Account Number</TableCell>
                            <TableCell>IFSC Code</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((acc) => (
                            <TableRow key={acc._id}>
                                <TableCell>{acc.name}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>{acc.accountNumber}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>{acc.ifscCode}</TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={() => dialog.openEdit(acc, (a) => ({ name: a.name, accountNumber: a.accountNumber || '', ifscCode: a.ifscCode || '' }))} color="primary" size="small"><EditIcon /></IconButton>
                                    <IconButton onClick={() => handleDelete(acc._id)} color="error" size="small"><DeleteIcon /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center">No accounts found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={dialog.open} onClose={dialog.handleClose} fullWidth maxWidth="sm">
                <DialogTitle>{dialog.editingId ? 'Edit Bank Account' : 'New Bank Account'}</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Box display="flex" flexDirection="column" gap={2}>
                        <TextField
                            label="Bank Name"
                            fullWidth
                            value={dialog.formData.name}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, name: e.target.value })}
                        />
                        <TextField
                            label="Account Number (Optional)"
                            fullWidth
                            value={dialog.formData.accountNumber}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, accountNumber: e.target.value })}
                        />
                        <TextField
                            label="IFSC Code (Optional)"
                            fullWidth
                            value={dialog.formData.ifscCode}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, ifscCode: e.target.value })}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={dialog.handleClose}>Cancel</Button>
                    <Button onClick={dialog.handleSave} variant="contained" disabled={dialog.saving}>
                        {dialog.saving ? 'Saving…' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default BankAccountsPage;
