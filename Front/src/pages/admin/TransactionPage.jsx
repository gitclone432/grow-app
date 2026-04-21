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
    TablePagination,
    TableRow,
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
    useMediaQuery,
    useTheme,
    CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../lib/api';

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
                        label={txn.source}
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

                {txn.source === 'MANUAL' && (
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                        <IconButton size="small" onClick={onEdit} color="primary">
                            <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={onDelete} color="error">
                            <DeleteIcon />
                        </IconButton>
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
};

const TransactionPage = () => {
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

    // Editing state
    const [editingId, setEditingId] = useState(null);

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

    useEffect(() => {
        fetchTransactions();
    }, [page, rowsPerPage, dateMode, filterSingleDate, filterStartDate, filterEndDate, filterBankAccount, filterType]);

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

    const fetchTransactions = async () => {
        try {
            const params = {
                page: page + 1,
                limit: rowsPerPage,
                ...(dateMode === 'range' && filterStartDate && { startDate: filterStartDate }),
                ...(dateMode === 'range' && filterEndDate && { endDate: filterEndDate }),
                ...(dateMode === 'single' && filterSingleDate && { startDate: filterSingleDate, endDate: filterSingleDate }),
                ...(filterBankAccount && { bankAccount: filterBankAccount }),
                ...(filterType && { transactionType: filterType })
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
        setRowsPerPage(50);
        setPage(0);
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
                await api.put(`/transactions/${editingId}`, formData);
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
        setFormData({
            date: new Date().toISOString().split('T')[0],
            bankAccount: '',
            transactionType: 'Debit',
            amount: '',
            remark: '',
            creditCardName: ''
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
                <Typography variant="h5">Transactions</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenDialog(true)}
                    fullWidth={isMobile}
                >
                    Add Transaction
                </Button>
            </Stack>

            {/* Filters Section */}
            <Paper sx={{ p: 2, mb: 3 }}>
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
                                <MenuItem key={acc._id} value={acc._id}>{acc.name}</MenuItem>
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

            <Accordion sx={{ mb: 3 }} defaultExpanded={false}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">Bank Accounts & Credit Card Balance Summary</Typography>
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

            {/* MOBILE CARD VIEW */}
            <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
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

            {/* DESKTOP TABLE VIEW */}
            <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell>Date</TableCell>
                            <TableCell>Bank Account</TableCell>
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
                                        label={txn.source}
                                        size="small"
                                        color={txn.source === 'PAYONEER' ? 'primary' : 'default'}
                                        variant={txn.source === 'PAYONEER' ? 'filled' : 'outlined'}
                                    />
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: txn.transactionType === 'Credit' ? 'success.main' : 'error.main' }}>
                                    {txn.transactionType === 'Credit' ? '+' : '-'} ₹{txn.amount?.toFixed(2)}
                                </TableCell>
                                <TableCell align="right">
                                    {txn.source === 'MANUAL' && (
                                        <>
                                            <IconButton size="small" onClick={() => startEdit(txn)} color="primary">
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton size="small" onClick={() => handleDelete(txn._id)} color="error">
                                                <DeleteIcon />
                                            </IconButton>
                                        </>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {transactions.length > 0 && (
                            <TableRow sx={{ backgroundColor: '#fafafa' }}>
                                <TableCell colSpan={5} align="right">
                                    <strong>Page Total:</strong>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main', display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                        <span>+</span> <span>₹{transactions.reduce((acc, curr) => curr.transactionType === 'Credit' ? acc + (curr.amount || 0) : acc, 0).toFixed(2)}</span>
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'error.main', display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                        <span>-</span> <span>₹{transactions.reduce((acc, curr) => curr.transactionType === 'Debit' ? acc + (curr.amount || 0) : acc, 0).toFixed(2)}</span>
                                    </Typography>
                                    <Divider sx={{ my: 0.5 }} />
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                        <span>=</span> <span>₹{(
                                            transactions.reduce((acc, curr) => curr.transactionType === 'Credit' ? acc + (curr.amount || 0) : acc, 0) -
                                            transactions.reduce((acc, curr) => curr.transactionType === 'Debit' ? acc + (curr.amount || 0) : acc, 0)
                                        ).toFixed(2)}</span>
                                    </Typography>
                                </TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        )}
                        {transactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center">No transactions found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <TablePagination
                component="div"
                count={totalTransactions}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[]}
                sx={{ display: { xs: 'none', md: 'block' } }}
            />
            {/* Simple pagination for mobile */}
            <TablePagination
                component="div"
                count={totalTransactions}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[]}
                sx={{ display: { xs: 'block', md: 'none' }, '.MuiTablePagination-actions': { ml: 0 } }}
                labelRowsPerPage=""
            />

            <Dialog
                open={openDialog}
                onClose={handleClose}
                fullScreen={isSmallMobile}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>{editingId ? 'Edit Transaction' : 'Add Manual Transaction'}</DialogTitle>
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
                        >
                            {bankAccounts.map((acc) => (
                                <MenuItem key={acc._id} value={acc._id}>
                                    {acc.name}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* NEW: Credit Card Dropdown for Debit */}
                        {formData.transactionType === 'Debit' && (
                            <TextField
                                select
                                label="To (Credit Card Name)"
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
