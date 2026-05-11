import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
    CircularProgress,
    Stack,
    FormControl,
    InputLabel,
    OutlinedInput,
    Select,
    MenuItem,
    FormHelperText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';
import useFetchTable from '../../hooks/useFetchTable';
import useFormDialog from '../../hooks/useFormDialog';

const INITIAL_FORM = { name: '', accountNumber: '', ifscCode: '', sellers: '' };

function sellersFieldToTokens(s) {
    if (s == null || !String(s).trim()) return [];
    return String(s)
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

/**
 * Same list as Settings → Stores (`/sellers/all`): eBay seller accounts.
 * `bankToken` is what we write into BankAccount.sellers (username preferred) — Payoneer matches on username/email.
 */
function buildSellerOptions(sellersList) {
    const rows = (sellersList || [])
        .map((s) => {
            const username = (s.user?.username || '').trim();
            const email = (s.user?.email || '').trim();
            const bankToken = username || email;
            if (!bankToken) return null;
            const label =
                username && email && username.toLowerCase() !== email.toLowerCase()
                    ? `${username} (${email})`
                    : bankToken;
            const matchLower = new Set(
                [username, email].filter(Boolean).map((x) => x.toLowerCase())
            );
            return { id: String(s._id), label, bankToken, matchLower };
        })
        .filter(Boolean);
    rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return rows;
}

const BankAccountsPage = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    /** Same API as Settings → Stores page (`StoresPage.jsx`). */
    const [sellers, setSellers] = useState([]);

    const { rows: accounts, loading, refetch } = useFetchTable('/bank-accounts');

    const loadSellers = useCallback(() => {
        let cancelled = false;
        api
            .get('/sellers/all')
            .then(({ data }) => {
                if (cancelled || !Array.isArray(data)) return;
                setSellers(data);
            })
            .catch(() => {
                if (!cancelled) setSellers([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        return loadSellers();
    }, [loadSellers]);

    const sellerOptions = useMemo(() => buildSellerOptions(sellers), [sellers]);

    const dialog = useFormDialog(INITIAL_FORM, {
        onSave: (formData, editingId) =>
            editingId
                ? api.put(`/bank-accounts/${editingId}`, formData)
                : api.post('/bank-accounts', formData),
        onAfterSave: refetch,
    });

    useEffect(() => {
        if (!dialog.open) return;
        const cancel = loadSellers();
        return cancel;
    }, [dialog.open, loadSellers]);

    const selectedSellerIds = useMemo(() => {
        const tokens = sellersFieldToTokens(dialog.formData.sellers);
        const ids = [];
        for (const t of tokens) {
            const tl = t.toLowerCase();
            const opt = sellerOptions.find((o) => o.matchLower.has(tl));
            if (opt && !ids.includes(opt.id)) ids.push(opt.id);
        }
        return ids.filter((id) => sellerOptions.some((o) => o.id === id));
    }, [dialog.formData.sellers, sellerOptions]);

    const setSellersFromParts = (sellerIds) => {
        const ids = (Array.isArray(sellerIds) ? sellerIds : []).map((id) => String(id));
        dialog.setFormData((prev) => {
            const prevTokens = sellersFieldToTokens(prev.sellers);
            const others = prevTokens.filter((t) => {
                const tl = t.toLowerCase();
                return !sellerOptions.some((o) => o.matchLower.has(tl));
            });
            const tokensFromIds = ids
                .map((id) => sellerOptions.find((o) => String(o.id) === id)?.bankToken)
                .filter(Boolean);
            return { ...prev, sellers: [...tokensFromIds, ...others].join(', ') };
        });
    };

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
                gap={{ xs: 1, sm: 1 }}
                mb={3}
            >
                <Typography variant="h5">Bank Accounts</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                        variant="outlined"
                        startIcon={<AccountBalanceIcon />}
                        component={RouterLink}
                        to="/admin/payoneer"
                        fullWidth={isMobile}
                    >
                        Payoneer Sheet
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={dialog.openCreate}
                        fullWidth={isMobile}
                    >
                        Add Bank Account
                    </Button>
                </Stack>
            </Box>

            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell>Bank Name</TableCell>
                            <TableCell>Account Number</TableCell>
                            <TableCell>IFSC Code</TableCell>
                            <TableCell>Sellers</TableCell>
                            <TableCell>Payoneer</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((acc) => (
                            <TableRow key={acc._id}>
                                <TableCell>{acc.name}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>{acc.accountNumber}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>{acc.ifscCode}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' }, maxWidth: 280 }}>{acc.sellers || '—'}</TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                    <Typography variant="body2" component="span" sx={{ mr: 1 }}>
                                        {(acc.payoneerRecordCount ?? 0) === 0
                                            ? '0 records'
                                            : `${acc.payoneerRecordCount} record${acc.payoneerRecordCount === 1 ? '' : 's'}`}
                                    </Typography>
                                    <Button
                                        size="small"
                                        variant="text"
                                        component={RouterLink}
                                        to={`/admin/payoneer?bankAccount=${acc._id}`}
                                    >
                                        View
                                    </Button>
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={() => dialog.openEdit(acc, (a) => ({ name: a.name, accountNumber: a.accountNumber || '', ifscCode: a.ifscCode || '', sellers: a.sellers || '' }))} color="primary" size="small"><EditIcon /></IconButton>
                                    <IconButton onClick={() => handleDelete(acc._id)} color="error" size="small"><DeleteIcon /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center">No accounts found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog
                open={dialog.open}
                onClose={dialog.handleClose}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: { sx: { overflow: 'visible' } },
                }}
            >
                <DialogTitle>{dialog.editingId ? 'Edit Bank Account' : 'New Bank Account'}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
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
                        <FormControl fullWidth>
                            <InputLabel id="bank-account-stores-label">Stores (Settings → Stores)</InputLabel>
                            <Select
                                labelId="bank-account-stores-label"
                                multiple
                                disabled={sellerOptions.length === 0}
                                value={selectedSellerIds}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    const nextIds = Array.isArray(raw)
                                        ? raw.map(String)
                                        : typeof raw === 'string'
                                          ? raw.split(',').map((s) => s.trim()).filter(Boolean)
                                          : [];
                                    setSellersFromParts(nextIds);
                                }}
                                input={<OutlinedInput label="Stores (Settings → Stores)" />}
                                renderValue={(selected) =>
                                    selected.length
                                        ? selected
                                              .map((id) => sellerOptions.find((o) => String(o.id) === String(id))?.bankToken)
                                              .filter(Boolean)
                                              .join(', ')
                                        : sellerOptions.length === 0
                                          ? 'No stores'
                                          : 'Select stores…'
                                }
                                MenuProps={{
                                    disablePortal: true,
                                    PaperProps: {
                                        sx: { maxHeight: 360, zIndex: (theme) => theme.zIndex.modal + 2 },
                                    },
                                }}
                            >
                                {sellerOptions.map((o) => (
                                    <MenuItem key={o.id} value={o.id}>
                                        {o.label}
                                    </MenuItem>
                                ))}
                            </Select>
                            <FormHelperText component="div">
                                {sellerOptions.length === 0 ? (
                                    <>
                                        No seller accounts loaded. Add or manage them under{' '}
                                        <RouterLink to="/admin/stores-page">Settings → Stores</RouterLink>.
                                    </>
                                ) : (
                                    <>
                                        Same eBay seller accounts as{' '}
                                        <RouterLink to="/admin/stores-page">Settings → Stores</RouterLink>. Selected
                                        usernames are saved in Sellers (used by Payoneer to match the right store).
                                    </>
                                )}
                            </FormHelperText>
                        </FormControl>
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
