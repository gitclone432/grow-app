import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
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
    TablePagination,
    TableRow,
    TableSortLabel,
    Dialog,
    DialogTitle,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    Chip,
    IconButton,
    Tooltip,
    Grid,
    Card,
    CardContent,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Divider,
    Switch,
    useMediaQuery,
    useTheme,
    CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../lib/api';
import { bankAccountMenuLabel } from '../../lib/bankAccountLabel.js';

// Mobile Transaction Card Component
const MobileTransactionCard = ({ txn, onEdit, onDelete }) => {
    const dateStr = txn.date ? new Date(txn.date).toLocaleDateString() : '-';

    return (
        <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
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
                            color: txn.transactionType === 'Credit' ? 'success.main' : 'error.main',
                            textAlign: 'right',
                            lineHeight: 1.15,
                            // Stay single-line, but scale down when the container is narrow
                            fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)',
                            maxWidth: '60%'
                        }}
                    >
                        {txn.transactionType === 'Credit' ? '+' : '-'} ₹{Number.isFinite(txn.amount) ? txn.amount.toFixed(2) : (txn.amount ?? '-')}
                    </Typography>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                    <Chip
                        label={txn.transactionType}
                        color={txn.transactionType === 'Credit' ? 'success' : 'error'}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 700 }}
                    />
                    <Chip
                        label={txn.source === 'PAYONEER' ? 'payoneer' : 'manual'}
                        size="small"
                        color={txn.source === 'PAYONEER' ? 'primary' : 'default'}
                        variant={txn.source === 'PAYONEER' ? 'filled' : 'outlined'}
                    />
                </Stack>

                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Bank Account
                    </Typography>
                    <Typography variant="body2">{txn.bankAccount?.name || '-'}</Typography>
                </Box>

                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Remark
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                        {txn.remark || '-'}
                    </Typography>
                    {txn.creditCardName && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                            To: {txn.creditCardName.name}
                        </Typography>
                    )}
                </Box>

                {(txn.source === 'MANUAL' || txn.source === 'PAYONEER') && (
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                        <IconButton size="small" onClick={onEdit} color="primary">
                            <EditIcon />
                        </IconButton>
                        {txn.source === 'MANUAL' && (
                            <IconButton size="small" onClick={onDelete} color="error">
                                <DeleteIcon />
                            </IconButton>
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
};

/** Desktop table: header fixed, body scrolls after this many data rows; totals sit below scroll. */
const TXN_TABLE_VISIBLE_ROWS = 10;
const TXN_TABLE_ROW_HEIGHT_PX = 42;
const TXN_TABLE_HEADER_HEIGHT_PX = 41;
const TXN_TABLE_BODY_MAX_HEIGHT =
    TXN_TABLE_HEADER_HEIGHT_PX + TXN_TABLE_VISIBLE_ROWS * TXN_TABLE_ROW_HEIGHT_PX;

/** Always-visible page totals (compact single row). */
function TransactionPageTotalsBar({ credit, debit, net, sx = {} }) {
    return (
        <Box
            sx={{
                flexShrink: 0,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: { xs: 1, sm: 2 },
                px: 2,
                py: 1,
                bgcolor: '#fafafa',
                borderLeft: 1,
                borderRight: 1,
                borderBottom: 1,
                borderColor: 'divider',
                ...sx,
            }}
        >
            <Typography variant="body2" sx={{ fontWeight: 700, mr: { xs: 0, sm: 'auto' }, width: { xs: '100%', sm: 'auto' } }}>
                Page Total
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                + ₹{credit.toFixed(2)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                − ₹{debit.toFixed(2)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                = ₹{net.toFixed(2)}
            </Typography>
        </Box>
    );
}

const TransactionPage = () => {
    const [searchParams] = useSearchParams();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [transactions, setTransactions] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [creditCards, setCreditCards] = useState([]);
    const [balanceSummary, setBalanceSummary] = useState([]);
    const [creditCardSummary, setCreditCardSummary] = useState([]); // NEW
    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [sendToggleLoadingId, setSendToggleLoadingId] = useState('');
    const [pageLoading, setPageLoading] = useState(true);

    // Pagination and Filter State
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [totalTransactions, setTotalTransactions] = useState(0);
    const [summary, setSummary] = useState({ totalCredit: 0, totalDebit: 0 });

    const [dateMode, setDateMode] = useState('range'); // 'single' or 'range'
    const [filterSingleDate, setFilterSingleDate] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterBankAccount, setFilterBankAccount] = useState('');
    const [filterType, setFilterType] = useState('');
    const [dateSortOrder, setDateSortOrder] = useState('desc');

    // Editing state
    const [editingId, setEditingId] = useState(null);
    const [editingSource, setEditingSource] = useState('MANUAL');

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        bankAccount: '',
        transactionType: 'Debit',
        amount: '',
        remark: '',
        creditCardName: '' // NEW
    });

    useEffect(() => {
        fetchBankAccounts();
        fetchCreditCards();
        fetchBalanceSummary();
        fetchCreditCardSummary(); // NEW
    }, []);

    // Deep link from Payoneer / Bank Accounts: /admin/transactions?bankAccount=<id>
    useEffect(() => {
        const bid = searchParams.get('bankAccount') || '';
        setFilterBankAccount((prev) => (prev === bid ? prev : bid));
    }, [searchParams]);

    useEffect(() => {
        fetchTransactions();
    }, [page, rowsPerPage, dateMode, filterSingleDate, filterStartDate, filterEndDate, filterBankAccount, filterType, dateSortOrder]);

    const fetchCreditCards = async () => {
        try {
            const { data } = await api.get('/credit-card-names');
            setCreditCards(data);
        } catch (error) {
            console.error('Error fetching credit cards:', error);
        }
    };

    const fetchCreditCardSummary = async () => {
        try {
            const { data } = await api.get('/transactions/credit-card-summary');
            setCreditCardSummary(data);
        } catch (error) {
            console.error('Error fetching credit card summary:', error);
        }
    };

    const buildTransactionListParams = () => ({
        ...(dateMode === 'range' && filterStartDate && { startDate: filterStartDate }),
        ...(dateMode === 'range' && filterEndDate && { endDate: filterEndDate }),
        ...(dateMode === 'single' && filterSingleDate && { startDate: filterSingleDate, endDate: filterSingleDate }),
        ...(filterBankAccount && { bankAccount: filterBankAccount }),
        ...(filterType && { transactionType: filterType }),
        sortBy: 'date',
        sortOrder: dateSortOrder
    });

    const fetchTransactions = async () => {
        try {
            const params = {
                page: page + 1,
                limit: rowsPerPage,
                ...buildTransactionListParams()
            };
            const { data } = await api.get('/transactions', { params });
            setTransactions(data.transactions || []);
            setTotalTransactions(data.totalTransactions || 0);
            if (data.summary) {
                setSummary(data.summary);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setPageLoading(false);
        }
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const clearFilters = () => {
        setFilterSingleDate('');
        setFilterStartDate('');
        setFilterEndDate('');
        setFilterBankAccount('');
        setFilterType('');
        setDateMode('range');
        setDateSortOrder('desc');
        setRowsPerPage(50);
        setPage(0);
    };

    const handleDateSortToggle = () => {
        setDateSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        setPage(0);
    };

    const handleDownloadCsv = async () => {
        try {
            setExportLoading(true);
            const response = await api.get('/transactions/export-csv', {
                params: buildTransactionListParams(),
                responseType: 'blob'
            });

            const contentDisposition = response.headers['content-disposition'];
            let filename = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
                if (filenameMatch?.[1]) {
                    filename = filenameMatch[1].replace(/"/g, '').trim();
                }
            }

            const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error('CSV export failed:', error);
            let msg = error.message;
            if (error.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const parsed = JSON.parse(text);
                    msg = parsed.error || msg;
                } catch {
                    msg = 'Failed to download CSV';
                }
            } else if (error.response?.data?.error) {
                msg = error.response.data.error;
            }
            alert(msg);
        } finally {
            setExportLoading(false);
        }
    };

    const handleSendToggle = async (txnId, enabled) => {
        try {
            setSendToggleLoadingId(txnId);
            await api.patch(`/transactions/${txnId}/send-toggle`, { enabled });
            setTransactions((prev) =>
                prev.map((t) => (t._id === txnId ? { ...t, sendEnabled: enabled } : t))
            );
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to update send toggle');
        } finally {
            setSendToggleLoadingId('');
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

    const fetchBalanceSummary = async () => {
        try {
            const { data } = await api.get('/transactions/balance-summary');
            setBalanceSummary(data);
        } catch (error) {
            console.error('Error fetching balance summary:', error);
        }
    };



    const handleSubmit = async () => {
        try {
            setLoading(true);
            if (editingId) {
                if (editingSource === 'PAYONEER') {
                    await api.put(`/transactions/${editingId}`, { date: formData.date, remark: formData.remark });
                } else {
                    await api.put(`/transactions/${editingId}`, formData);
                }
            } else {
                await api.post('/transactions', formData);
            }
            handleClose();
            fetchTransactions();
            fetchBalanceSummary();
            fetchCreditCardSummary();
        } catch (error) {
            alert('Failed to save: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this transaction?')) return;
        try {
            await api.delete(`/transactions/${id}`);
            fetchTransactions();
            fetchBalanceSummary();
            fetchCreditCardSummary();
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to delete');
        }
    };

    const startEdit = (txn) => {
        setEditingId(txn._id);
        setEditingSource(txn.source || 'MANUAL');
        setFormData({
            date: txn.date ? txn.date.split('T')[0] : '',
            bankAccount: txn.bankAccount?._id,
            transactionType: txn.transactionType,
            amount: txn.amount,
            remark: txn.remark,
            creditCardName: txn.creditCardName?._id || ''
        });
        setOpenDialog(true);
    };

    const handleClose = () => {
        setOpenDialog(false);
        setEditingId(null);
        setEditingSource('MANUAL');
        setFormData({
            date: new Date().toISOString().split('T')[0],
            bankAccount: '',
            transactionType: 'Debit',
            amount: '',
            remark: '',
            creditCardName: ''
        });
    };

    const pageTotals = useMemo(() => {
        const credit = transactions.reduce(
            (acc, curr) => (curr.transactionType === 'Credit' ? acc + (curr.amount || 0) : acc),
            0
        );
        const debit = transactions.reduce(
            (acc, curr) => (curr.transactionType === 'Debit' ? acc + (curr.amount || 0) : acc),
            0
        );
        return { credit, debit, net: credit - debit };
    }, [transactions]);

    if (pageLoading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
        </Box>
    );

    return (
        <Box
            sx={{
                p: { xs: 1.5, sm: 2, md: 3 },
                height: { md: 'calc(100dvh - 112px)' },
                maxHeight: { md: 'calc(100dvh - 112px)' },
                display: 'flex',
                flexDirection: 'column',
                overflow: { md: 'hidden' },
                boxSizing: 'border-box',
            }}
        >
            <Box sx={{ flexShrink: 0 }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                mb={{ xs: 2, md: 1.5 }}
            >
                <Typography variant="h5">Transactions</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                        variant="outlined"
                        startIcon={<PaymentsIcon />}
                        component={RouterLink}
                        to={
                            filterBankAccount
                                ? `/admin/payoneer?bankAccount=${filterBankAccount}`
                                : '/admin/payoneer'
                        }
                        fullWidth={isMobile}
                    >
                        Payoneer Sheet
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleDownloadCsv}
                        disabled={exportLoading}
                        fullWidth={isMobile}
                    >
                        {exportLoading ? 'Downloading…' : 'Download CSV'}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenDialog(true)}
                        fullWidth={isMobile}
                    >
                        Add Transaction
                    </Button>
                </Stack>
            </Stack>

            {/* Filters Section */}
            <Paper sx={{ p: { xs: 2, md: 1.5 }, mb: { xs: 2, md: 1 } }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            select
                            label="Date Mode"
                            fullWidth
                            value={dateMode}
                            onChange={(e) => {
                                setDateMode(e.target.value);
                                setPage(0);
                            }}
                        >
                            <MenuItem value="single">Single Date</MenuItem>
                            <MenuItem value="range">Date Range</MenuItem>
                        </TextField>
                    </Grid>
                    {dateMode === 'single' ? (
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField
                                label="Date"
                                type="date"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={filterSingleDate}
                                onChange={(e) => { setFilterSingleDate(e.target.value); setPage(0); }}
                            />
                        </Grid>
                    ) : (
                        <>
                            <Grid item xs={12} sm={6} md={2}>
                                <TextField
                                    label="Start Date"
                                    type="date"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={filterStartDate}
                                    onChange={(e) => { setFilterStartDate(e.target.value); setPage(0); }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <TextField
                                    label="End Date"
                                    type="date"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={filterEndDate}
                                    onChange={(e) => { setFilterEndDate(e.target.value); setPage(0); }}
                                />
                            </Grid>
                        </>
                    )}
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            select
                            label="Bank Account"
                            fullWidth
                            value={filterBankAccount}
                            onChange={(e) => { setFilterBankAccount(e.target.value); setPage(0); }}
                        >
                            <MenuItem value="">All Accounts</MenuItem>
                            {bankAccounts.map((acc) => (
                                <MenuItem key={acc._id} value={acc._id}>
                                    {bankAccountMenuLabel(acc)}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            select
                            label="Type"
                            fullWidth
                            value={filterType}
                            onChange={(e) => { setFilterType(e.target.value); setPage(0); }}
                        >
                            <MenuItem value="">All Types</MenuItem>
                            <MenuItem value="Credit">Credit</MenuItem>
                            <MenuItem value="Debit">Debit</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            label="Rows Per Page"
                            type="number"
                            fullWidth
                            inputProps={{ min: 1 }}
                            value={rowsPerPage === -1 ? '' : rowsPerPage}
                            onChange={(e) => { 
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val > 0) {
                                    setRowsPerPage(val);
                                } else if (e.target.value === '') {
                                    setRowsPerPage(50);
                                }
                                setPage(0);
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={12} md={12} display="flex" justifyContent="flex-end">
                         <Button variant="outlined" onClick={clearFilters} color="secondary" fullWidth={isMobile}>
                             Clear Filters
                         </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Accordion sx={{ mb: { xs: 2, md: 0 } }} defaultExpanded={false} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Bank Accounts & Credit Card Balance Summary
                    </Typography>
                </AccordionSummary>
                <AccordionDetails>
                    {/* Balance Summary Cards */}
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>Bank Accounts</Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {balanceSummary.map((item) => (
                    <Grid item xs={12} sm={6} md={3} key={item._id}>
                        <Card>
                            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography
                                            color="text.secondary"
                                            variant="body2"
                                            noWrap
                                            sx={{ textOverflow: 'ellipsis', overflow: 'hidden' }}
                                        >
                                            {item.bankName}
                                        </Typography>
                                        <Typography
                                            variant="h5"
                                            noWrap
                                            sx={{
                                                mt: 1,
                                                color: item.balance >= 0 ? 'success.main' : 'error.main',
                                                fontWeight: 'bold',
                                                // Single line; scale down smoothly as the card narrows
                                                fontSize: 'clamp(1.05rem, 2.2vw, 1.75rem)',
                                                lineHeight: 1.1,
                                                maxWidth: '100%'
                                            }}
                                        >
                                            ₹{item.balance.toFixed(2)}
                                        </Typography>
                                    </Box>
                                    <AccountBalanceIcon
                                        sx={{
                                            fontSize: { xs: 34, sm: 38, md: 40 },
                                            color: 'primary.main',
                                            opacity: 0.3,
                                            flexShrink: 0
                                        }}
                                    />
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Credit Card Summary Cards */}
            {creditCardSummary.length > 0 && (
                <>
                    <Typography variant="h6" gutterBottom>Credit Card Balance Summary</Typography>
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {creditCardSummary.map((item) => (
                            <Grid item xs={12} sm={6} md={4} key={item._id}>
                                <Card>
                                    <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                                        <Typography
                                            color="text.secondary"
                                            variant="body2"
                                            gutterBottom
                                            noWrap
                                            sx={{ textOverflow: 'ellipsis', overflow: 'hidden' }}
                                        >
                                            {item.cardName}
                                        </Typography>
                                        
                                        {/* Remaining Balance - Primary Display */}
                                        <Typography 
                                            variant="h4" 
                                            noWrap
                                            sx={{ 
                                                mt: 1, 
                                                mb: 2,
                                                color: item.balance < 0 ? 'error.main' : 'success.main',
                                                fontWeight: 'bold',
                                                // Single line; scale down smoothly as the card narrows
                                                fontSize: 'clamp(1.35rem, 2.4vw, 2.125rem)',
                                                lineHeight: 1.1,
                                                maxWidth: '100%'
                                            }}
                                        >
                                            ₹{item.balance.toFixed(2)}
                                        </Typography>
                                        
                                        {/* Breakdown */}
                                        <Divider sx={{ mb: 1 }} />
                                        <Stack spacing={0.5}>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="caption" color="text.secondary">
                                                    Transferred:
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 'medium' }}>
                                                    +₹{item.totalTransferred.toFixed(2)}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="caption" color="text.secondary">
                                                    Spent (Orders):
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 'medium' }}>
                                                    -₹{item.totalSpent.toFixed(2)}
                                                </Typography>
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </>
            )}
            </AccordionDetails>
        </Accordion>
            </Box>

            {/* MOBILE */}
            <Box
                sx={{
                    display: { xs: 'flex', md: 'none' },
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                }}
            >
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', mb: 1 }}>
                {transactions.length === 0 ? (
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            No transactions found.
                        </Typography>
                    </Paper>
                ) : (
                    <Stack spacing={1.5}>
                        {transactions.map((txn) => (
                            <MobileTransactionCard
                                key={txn._id}
                                txn={txn}
                                onEdit={() => startEdit(txn)}
                                onDelete={() => handleDelete(txn._id)}
                            />
                        ))}
                    </Stack>
                )}
            </Box>
            {transactions.length > 0 && (
                <TransactionPageTotalsBar
                    credit={pageTotals.credit}
                    debit={pageTotals.debit}
                    net={pageTotals.net}
                    sx={{ borderRadius: 1, border: 1, mb: 1 }}
                />
            )}
            <TablePagination
                component="div"
                count={totalTransactions}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[]}
                sx={{ flexShrink: 0, '.MuiTablePagination-actions': { ml: 0 } }}
                labelRowsPerPage=""
            />
            </Box>

            {/* DESKTOP — grid: scrollable table + fixed totals + pagination */}
            <Box
                sx={{
                    display: { xs: 'none', md: 'grid' },
                    flex: 1,
                    minHeight: 0,
                    gridTemplateRows: 'auto auto auto',
                    overflow: 'hidden',
                }}
            >
                    <TableContainer
                        component={Paper}
                        sx={{
                            minHeight: 0,
                            overflow: 'auto',
                            maxHeight: `min(${TXN_TABLE_BODY_MAX_HEIGHT}px, calc(100dvh - 300px))`,
                            borderRadius: transactions.length > 0 ? '4px 4px 0 0' : 1,
                        }}
                    >
                        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                            <colgroup>
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '22%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '16%' }} />
                            </colgroup>
                            <TableHead>
                                <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 700 } }}>
                            <TableCell sortDirection={dateSortOrder}>
                                <TableSortLabel
                                    active
                                    direction={dateSortOrder}
                                    onClick={handleDateSortToggle}
                                >
                                    Date
                                </TableSortLabel>
                            </TableCell>
                            <TableCell>Bank Account</TableCell>
                            <TableCell>Send</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Remark</TableCell>
                            <TableCell>Source</TableCell>
                            <TableCell align="right">Amount</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transactions.map((txn) => (
                            <TableRow key={txn._id}>
                                <TableCell>{new Date(txn.date).toLocaleDateString()}</TableCell>
                                <TableCell>{txn.bankAccount?.name}</TableCell>
                                <TableCell>
                                    {txn.source === 'PAYONEER' ? (
                                        <Switch
                                            size="small"
                                            checked={Boolean(txn.sendEnabled)}
                                            onChange={(e) => handleSendToggle(txn._id, e.target.checked)}
                                            disabled={sendToggleLoadingId === txn._id}
                                        />
                                    ) : (
                                        '-'
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={txn.transactionType}
                                        color={txn.transactionType === 'Credit' ? 'success' : 'error'}
                                        size="small"
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell>
                                    {txn.remark}
                                    {txn.creditCardName && (
                                        <Typography variant="caption" display="block" color="text.secondary">
                                            To: {txn.creditCardName.name}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={txn.source === 'PAYONEER' ? 'payoneer' : 'manual'}
                                        size="small"
                                        color={txn.source === 'PAYONEER' ? 'primary' : 'default'}
                                        variant={txn.source === 'PAYONEER' ? 'filled' : 'outlined'}
                                    />
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: txn.transactionType === 'Credit' ? 'success.main' : 'error.main' }}>
                                    {txn.transactionType === 'Credit' ? '+' : '-'} ₹{txn.amount?.toFixed(2)}
                                </TableCell>
                                <TableCell align="right">
                                    {(txn.source === 'MANUAL' || txn.source === 'PAYONEER') && (
                                        <>
                                            <IconButton size="small" onClick={() => startEdit(txn)} color="primary">
                                                <EditIcon />
                                            </IconButton>
                                            {txn.source === 'MANUAL' && (
                                                <IconButton size="small" onClick={() => handleDelete(txn._id)} color="error">
                                                    <DeleteIcon />
                                                </IconButton>
                                            )}
                                        </>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {transactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} align="center">No transactions found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                        </Table>
                    </TableContainer>

                {transactions.length > 0 && (
                    <TransactionPageTotalsBar
                        credit={pageTotals.credit}
                        debit={pageTotals.debit}
                        net={pageTotals.net}
                    />
                )}

                <TablePagination
                    component="div"
                    count={totalTransactions}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    rowsPerPageOptions={[]}
                    sx={{
                        flexShrink: 0,
                        border: 1,
                        borderTop: 0,
                        borderColor: 'divider',
                        borderRadius: transactions.length > 0 ? '0 0 4px 4px' : 1,
                    }}
                />
            </Box>

            <Dialog
                open={openDialog}
                onClose={handleClose}
                fullScreen={isSmallMobile}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    {editingId
                        ? (editingSource === 'PAYONEER' ? 'Edit Payoneer Transaction (Date & Remark)' : 'Edit Transaction')
                        : 'Add Manual Transaction'}
                </DialogTitle>
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
                            select
                            label={formData.transactionType === 'Debit' ? "From (Bank Account)" : "To (Bank Account)"}
                            fullWidth
                            value={formData.bankAccount}
                            onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                            disabled={editingId && editingSource === 'PAYONEER'}
                        >
                            {bankAccounts.map((acc) => (
                                <MenuItem key={acc._id} value={acc._id}>
                                    {bankAccountMenuLabel(acc)}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* NEW: Credit Card Dropdown for Debit */}
                        {formData.transactionType === 'Debit' && editingSource !== 'PAYONEER' && (
                            <TextField
                                select
                                label="To (Bank Account/Name)"
                                fullWidth
                                value={formData.creditCardName || ''}
                                onChange={(e) => setFormData({ ...formData, creditCardName: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                                SelectProps={{
                                    displayEmpty: true,
                                    renderValue: (value) => {
                                        if (!value) return 'Skip';
                                        const selectedCard = creditCards.find(card => card._id === value);
                                        return selectedCard?.name || '';
                                    }
                                }}
                            >
                                <MenuItem value="">Skip</MenuItem>
                                {creditCards.map((card) => (
                                    <MenuItem key={card._id} value={card._id}>
                                        {card.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                        )}

                        <Box>
                            <Typography variant="caption" color="text.secondary" mb={1} display="block">
                                Transaction Type
                            </Typography>
                            <ToggleButtonGroup
                                color="primary"
                                value={formData.transactionType}
                                exclusive
                                onChange={(e, newType) => {
                                    if (newType !== null) {
                                        setFormData({ ...formData, transactionType: newType });
                                    }
                                }}
                                fullWidth
                                disabled={editingId && editingSource === 'PAYONEER'}
                            >
                                <ToggleButton value="Credit" color="success">Credit</ToggleButton>
                                <ToggleButton value="Debit" color="error">Debit</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <TextField
                            label="Amount"
                            type="number"
                            fullWidth
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            disabled={editingId && editingSource === 'PAYONEER'}
                        />

                        <TextField
                            label="Remark"
                            fullWidth
                            multiline
                            rows={2}
                            value={formData.remark}
                            onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
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

export default TransactionPage;
