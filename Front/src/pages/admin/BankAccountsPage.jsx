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
    Alert,
    Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';
import useFetchTable from '../../hooks/useFetchTable';
import useFormDialog from '../../hooks/useFormDialog';
import {
    splitBankSellersField,
    isMongoIdString,
    normalizeBankSellersPayload,
    buildSellerOptions,
} from '../../lib/bankAccountSellers.js';
import { bankAccountMenuLabel, bankAccountListLabelDraft } from '../../lib/bankAccountLabel.js';

const INITIAL_FORM = { name: '', accountNumber: '', ifscCode: '', payoneerId: '', sellers: '' };

function sellersFieldToTokens(s) {
    if (s == null || !String(s).trim()) return [];
    return String(s)
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

function formatSellersCell(sellersStr, sellerOptions) {
    if (!sellersStr?.trim()) return '—';
    return (
        splitBankSellersField(sellersStr)
            .map((t) => {
                if (isMongoIdString(t)) {
                    const o = sellerOptions.find((x) => String(x.id) === t);
                    return o ? o.label : t;
                }
                const tl = t.toLowerCase();
                const o = sellerOptions.find((x) => x.matchLower.has(tl));
                return o ? o.label : t;
            })
            .join(', ') || '—'
    );
}

const BankAccountsPage = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    /** Same API as Settings → eBay Stores page (`StoresPage.jsx`). */
    const [sellers, setSellers] = useState([]);

    /** Stores dropdown: close after each pick so the full list is not left open (multi-select). */
    const [storesMenuOpen, setStoresMenuOpen] = useState(false);

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
        onSave: (formData, editingId) => {
            const payload = {
                ...formData,
                sellers: normalizeBankSellersPayload(formData.sellers, sellerOptions),
            };
            return editingId
                ? api.put(`/bank-accounts/${editingId}`, payload)
                : api.post('/bank-accounts', payload);
        },
        onAfterSave: refetch,
    });

    useEffect(() => {
        if (!dialog.open) return;
        const cancel = loadSellers();
        return cancel;
    }, [dialog.open, loadSellers]);

    useEffect(() => {
        if (!dialog.open) setStoresMenuOpen(false);
    }, [dialog.open]);

    const selectedSellerIds = useMemo(() => {
        const tokens = sellersFieldToTokens(dialog.formData.sellers);
        const ids = [];
        for (const t of tokens) {
            const ts = String(t).trim();
            if (isMongoIdString(ts)) {
                if (sellerOptions.some((o) => String(o.id) === ts) && !ids.includes(ts)) ids.push(ts);
                continue;
            }
            const tl = ts.toLowerCase();
            const opt = sellerOptions.find((o) => o.matchLower.has(tl));
            if (opt && !ids.includes(String(opt.id))) ids.push(String(opt.id));
        }
        return ids.filter((id) => sellerOptions.some((o) => String(o.id) === String(id)));
    }, [dialog.formData.sellers, sellerOptions]);

    const setSellersFromParts = (sellerIds) => {
        const ids = (Array.isArray(sellerIds) ? sellerIds : []).map((id) => String(id));
        dialog.setFormData((prev) => {
            const prevTokens = sellersFieldToTokens(prev.sellers);
            const legacy = prevTokens.filter((t) => {
                const ts = String(t).trim();
                if (isMongoIdString(ts) && sellerOptions.some((o) => String(o.id) === ts)) return false;
                const tl = ts.toLowerCase();
                const opt = sellerOptions.find((o) => o.matchLower.has(tl));
                return !opt;
            });
            return { ...prev, sellers: [...ids, ...legacy].join(', ') };
        });
    };

    const listLabelPreview = useMemo(
        () =>
            bankAccountListLabelDraft(
                dialog.formData.name,
                dialog.formData.accountNumber,
                dialog.editingId
            ),
        [dialog.formData.name, dialog.formData.accountNumber, dialog.editingId]
    );

    const canSave = Boolean(String(dialog.formData.name || '').trim());

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
        <Box sx={{ p: { xs: 2, sm: 3 }, background: 'linear-gradient(135deg, #f0f9ff 0%, #ecfdf5 100%)' }}>
            <Box 
                display="flex" 
                flexDirection={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between" 
                alignItems={{ xs: 'stretch', sm: 'center' }}
                gap={{ xs: 1, sm: 1 }}
                mb={3}
                sx={{
                    background: theme => `linear-gradient(135deg, ${theme.palette.primary.main}15 0%, ${theme.palette.success.main}15 100%)`,
                    p: 2.5,
                    borderRadius: 2,
                    border: theme => `1px solid ${theme.palette.primary.main}30`
                }}
            >
                <Typography variant="h5" sx={{ fontWeight: 800, color: theme => theme.palette.primary.main }}>
                    <AccountBalanceIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Bank Accounts
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                        variant="outlined"
                        startIcon={<AccountBalanceIcon />}
                        component={RouterLink}
                        to="/admin/payoneer"
                        fullWidth={isMobile}
                        sx={{ borderColor: theme => theme.palette.info.main, color: theme => theme.palette.info.main }}
                    >
                        Payoneer Sheet
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={dialog.openCreate}
                        fullWidth={isMobile}
                        sx={{ background: theme => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.success.main} 100%)`, boxShadow: theme => `0 4px 12px ${theme.palette.primary.main}40` }}
                    >
                        Add Bank Account
                    </Button>
                </Stack>
            </Box>

            <Alert severity="info" sx={{ mb: 2, borderRadius: 2, background: theme => `linear-gradient(135deg, ${theme.palette.info.main}15 0%, ${theme.palette.secondary.main}15 100%)`, border: theme => `1px solid ${theme.palette.info.main}30` }}>
                <strong>One row per real bank account:</strong> link multiple stores on that row (Stores dropdown).
                <br />
                <strong>One row per store (same bank):</strong> duplicate the bank name/account number but set a different{' '}
                <strong>Seller</strong> on each row — menus show the store after the account mask (e.g.{' '}
                <em>Actus Corp (****9013) · rolex</em>).
            </Alert>

            <TableContainer component={Paper} sx={{ overflowX: 'auto', borderRadius: 2, boxShadow: theme => `0 8px 24px ${theme.palette.primary.main}10`, border: theme => `1px solid ${theme.palette.divider}` }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: theme => theme.palette.primary.main, '& th': { color: 'white', fontWeight: 700 } }}>
                            <TableCell sx={{ color: 'white', fontWeight: 700, width: 56 }}>#</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Bank</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Account Number</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>IFSC Code</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Payoneer ID</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Sellers</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Payoneer</TableCell>
                            <TableCell align="right" sx={{ color: 'white', fontWeight: 700 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((acc, index) => (
                            <TableRow key={acc._id}>
                                <TableCell sx={{ color: 'text.secondary', fontWeight: 600 }}>{index + 1}</TableCell>
                                <TableCell>{bankAccountMenuLabel(acc, sellerOptions)}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>{acc.accountNumber}</TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>{acc.ifscCode}</TableCell>
                                <TableCell
                                    sx={{
                                        fontSize: { xs: '0.85rem', sm: '1rem' },
                                        fontFamily: 'ui-monospace, monospace',
                                        maxWidth: 160,
                                    }}
                                >
                                    {acc.payoneerId?.trim() || '—'}
                                </TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.85rem', sm: '1rem' }, maxWidth: 280 }}>
                                    {formatSellersCell(acc.sellers, sellerOptions)}
                                </TableCell>
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
                                    <IconButton onClick={() => dialog.openEdit(acc, (a) => ({ name: a.name, accountNumber: a.accountNumber || '', ifscCode: a.ifscCode || '', payoneerId: a.payoneerId || '', sellers: a.sellers || '' }))} color="primary" size="small"><EditIcon /></IconButton>
                                    <IconButton onClick={() => handleDelete(acc._id)} color="error" size="small"><DeleteIcon /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} align="center">No accounts found.</TableCell>
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
                <DialogTitle>
                    <Stack spacing={0.5}>
                        <Typography component="span" variant="h6">
                            {dialog.editingId ? 'Edit Bank Account' : 'New Bank Account'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
                            Same bank name is allowed for different accounts. Add an account number when names match so
                            Payoneer and other pages can tell them apart.
                        </Typography>
                    </Stack>
                </DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {dialog.saveError ? (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {dialog.saveError}
                        </Alert>
                    ) : null}
                    {listLabelPreview !== '—' ? (
                        <Alert severity="info" sx={{ mb: 2, py: 0.75 }} icon={false}>
                            <Typography variant="body2" component="div">
                                <strong>Shown in menus</strong> (Payoneer, Transactions, etc.):{' '}
                                <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                                    {listLabelPreview}
                                </Box>
                            </Typography>
                        </Alert>
                    ) : null}
                    <Box display="flex" flexDirection="column" gap={2}>
                        <TextField
                            label="Bank name"
                            fullWidth
                            required
                            autoFocus
                            value={dialog.formData.name}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, name: e.target.value })}
                            helperText="Display label only. Duplicates are OK if each row has different stores or account details."
                        />
                        <TextField
                            label="Account number"
                            fullWidth
                            value={dialog.formData.accountNumber}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, accountNumber: e.target.value })}
                            helperText="Optional but recommended when several rows share the same bank name (last digits appear in lists)."
                            placeholder="Optional"
                        />
                        <TextField
                            label="IFSC code"
                            fullWidth
                            value={dialog.formData.ifscCode}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, ifscCode: e.target.value })}
                            helperText="Optional (India domestic transfers)."
                            placeholder="Optional"
                        />
                        <TextField
                            label="Payoneer ID"
                            fullWidth
                            value={dialog.formData.payoneerId}
                            onChange={(e) => dialog.setFormData({ ...dialog.formData, payoneerId: e.target.value })}
                            helperText="Optional Payoneer account or payout reference for this bank account."
                            placeholder="Optional"
                            inputProps={{ style: { fontFamily: 'ui-monospace, monospace' } }}
                        />
                        <FormControl fullWidth>
                            <InputLabel id="bank-account-stores-label">Stores (Settings → eBay Stores)</InputLabel>
                            <Select
                                labelId="bank-account-stores-label"
                                multiple
                                open={storesMenuOpen}
                                onOpen={() => setStoresMenuOpen(true)}
                                onClose={() => setStoresMenuOpen(false)}
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
                                    setStoresMenuOpen(false);
                                }}
                                input={<OutlinedInput label="Stores (Settings → eBay Stores)" />}
                                renderValue={(selected) => {
                                    if (!selected.length) {
                                        return sellerOptions.length === 0 ? 'No stores' : 'Select stores…';
                                    }
                                    return (
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: 0.5,
                                                py: 0.25,
                                                maxHeight: 88,
                                                overflow: 'auto',
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            {selected.map((id) => {
                                                const o = sellerOptions.find((x) => String(x.id) === String(id));
                                                if (!o) return null;
                                                return (
                                                    <Chip
                                                        key={id}
                                                        size="small"
                                                        label={o.label}
                                                        onDelete={(ev) => {
                                                            ev.preventDefault();
                                                            ev.stopPropagation();
                                                            const next = selected.filter(
                                                                (x) => String(x) !== String(id)
                                                            );
                                                            setSellersFromParts(next);
                                                        }}
                                                    />
                                                );
                                            })}
                                        </Box>
                                    );
                                }}
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
                                        <RouterLink to="/admin/stores-page">Settings → eBay Stores</RouterLink>.
                                    </>
                                ) : (
                                    <>
                                        Same eBay seller accounts as{' '}
                                        <RouterLink to="/admin/stores-page">Settings → eBay Stores</RouterLink>. Pick one
                                        store at a time—the list closes after each choice. Remove a store with the × on
                                        its chip. Saved as store IDs for Payoneer matching.
                                    </>
                                )}
                            </FormHelperText>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={dialog.handleClose}>Cancel</Button>
                    <Button
                        onClick={dialog.handleSave}
                        variant="contained"
                        disabled={dialog.saving || !canSave}
                    >
                        {dialog.saving ? 'Saving…' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default BankAccountsPage;
