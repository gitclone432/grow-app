import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
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
    Snackbar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableFooter,
    TableHead,
    TableRow,
    TextField,
    Tooltip as MuiTooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseIcon from '@mui/icons-material/Close';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import api from '../../lib/api';

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Payoneer', 'Other'];

const CHART_COLORS = ['#1976d2', '#ed6c02', '#2e7d32', '#9c27b0', '#d32f2f', '#0288d1', '#6d4c41', '#455a64'];
const EMPTY_FILTERS = {
    from: '',
    to: '',
    paidBy: '',
    category: '',
    search: '',
};

const EMPTY_FORM = {
    date: new Date().toISOString().split('T')[0],
    name: '',
    amount: '',
    paidBy: '',
    category: '',
    remark: '',
    paymentMethod: '',
};

function formatInr(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
}

function MonthSpendChart({ data, height = 280 }) {
    if (!data?.length) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 8, textAlign: 'center' }}>
                No data for chart
            </Typography>
        );
    }
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                    formatter={(value) => [formatInr(value), 'Amount']}
                    labelFormatter={(label) => `Month: ${label}`}
                />
                <Bar dataKey="amount" fill="#d32f2f" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function CategorySpendChart({ data, height = 280, yAxisWidth = 110, maxBars }) {
    const rows = maxBars ? data.slice(0, maxBars) : data;
    if (!rows?.length) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 8, textAlign: 'center' }}>
                No data for chart
            </Typography>
        );
    }
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart
                layout="vertical"
                data={rows}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                    type="category"
                    dataKey="category"
                    width={yAxisWidth}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                />
                <Tooltip formatter={(value) => [formatInr(value), 'Amount']} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {rows.map((entry, i) => (
                        <Cell key={entry.category} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function ChartBreakdownTable({ rows, labelKey, labelHeader }) {
    if (!rows?.length) return null;
    return (
        <TableContainer sx={{ mt: 2, maxHeight: 320 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>{labelHeader}</TableCell>
                        <TableCell align="right">Count</TableCell>
                        <TableCell align="right">Amount</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row[labelKey]}>
                            <TableCell>{row[labelKey]}</TableCell>
                            <TableCell align="right">{row.count ?? 0}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                                {formatInr(row.amount)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

function ExpenseChartCard({
    title,
    subtitle,
    collapsed,
    onToggleCollapse,
    onExpand,
    children,
}) {
    return (
        <Paper sx={{ borderRadius: 2, height: '100%', overflow: 'hidden' }}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                    px: 2,
                    py: 1.25,
                    borderBottom: collapsed ? 'none' : '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
                    <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                    <MuiTooltip title="Expand chart">
                        <IconButton size="small" onClick={onExpand} aria-label="Expand chart">
                            <OpenInFullIcon fontSize="small" />
                        </IconButton>
                    </MuiTooltip>
                    <MuiTooltip title={collapsed ? 'Show chart' : 'Hide chart'}>
                        <IconButton
                            size="small"
                            onClick={onToggleCollapse}
                            aria-label={collapsed ? 'Show chart' : 'Hide chart'}
                        >
                            {collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                        </IconButton>
                    </MuiTooltip>
                </Stack>
            </Stack>
            <Collapse in={!collapsed} timeout="auto" unmountOnExit>
                <Box sx={{ p: 2 }}>{children}</Box>
            </Collapse>
        </Paper>
    );
}

const MobileExpenseCard = ({ expense, onEdit, onDelete }) => {
    const dateStr = expense.date ? new Date(expense.date).toLocaleDateString() : '-';

    return (
        <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">Date</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{dateStr}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'error.main' }}>
                        {formatInr(expense.amount)}
                    </Typography>
                </Stack>
                <Box>
                    <Typography variant="caption" color="text.secondary">Name of Expenditure</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{expense.name}</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {expense.category ? <Chip size="small" label={expense.category} /> : null}
                    {expense.paymentMethod ? <Chip size="small" variant="outlined" label={expense.paymentMethod} /> : null}
                </Stack>
                <Typography variant="body2"><strong>Paid by:</strong> {expense.paidBy}</Typography>
                {expense.remark ? (
                    <Typography variant="caption" color="text.secondary">{expense.remark}</Typography>
                ) : null}
                <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <IconButton size="small" onClick={onEdit} color="primary"><EditIcon /></IconButton>
                    <IconButton size="small" onClick={onDelete} color="error"><DeleteIcon /></IconButton>
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
    const [summary, setSummary] = useState({
        filteredTotal: 0,
        filteredCount: 0,
        monthTotal: 0,
        monthCount: 0,
        yearTotal: 0,
        yearCount: 0,
    });
    const [charts, setCharts] = useState({ byMonth: [], byCategory: [] });
    const [filterOptions, setFilterOptions] = useState({ paidByOptions: [], categoryOptions: [] });
    const [filters, setFilters] = useState(EMPTY_FILTERS);

    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
    const [chartsSectionOpen, setChartsSectionOpen] = useState(false);
    const [chartCollapsed, setChartCollapsed] = useState({ month: true, category: true });
    const [expandedChart, setExpandedChart] = useState(null);

    const queryParams = useMemo(() => {
        const p = {};
        if (filters.from) p.from = filters.from;
        if (filters.to) p.to = filters.to;
        if (filters.paidBy) p.paidBy = filters.paidBy;
        if (filters.category) p.category = filters.category;
        if (filters.search.trim()) p.search = filters.search.trim();
        return p;
    }, [filters]);

    const fetchExpenses = useCallback(async () => {
        try {
            setPageLoading(true);
            const { data } = await api.get('/extra-expenses', { params: queryParams });
            setExpenses(data?.expenses || []);
            setSummary(data?.summary || {
                filteredTotal: 0,
                filteredCount: 0,
                monthTotal: 0,
                monthCount: 0,
                yearTotal: 0,
                yearCount: 0,
            });
            setCharts(data?.charts || { byMonth: [], byCategory: [] });
            setFilterOptions(data?.filters || { paidByOptions: [], categoryOptions: [] });
        } catch (error) {
            console.error('Error fetching expenses:', error);
            setSnackbar({ open: true, message: 'Failed to load expenses', severity: 'error' });
        } finally {
            setPageLoading(false);
        }
    }, [queryParams]);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    const categoryFilterOptions = useMemo(() => {
        return (filterOptions.categoryOptions || []).filter(Boolean).sort();
    }, [filterOptions.categoryOptions]);

    const handleSubmit = async () => {
        try {
            setLoading(true);
            const payload = {
                ...formData,
                amount: parseFloat(formData.amount),
                bankAccount: null,
            };
            if (editingId) {
                await api.put(`/extra-expenses/${editingId}`, payload);
            } else {
                await api.post('/extra-expenses', payload);
            }
            handleClose();
            fetchExpenses();
            setSnackbar({ open: true, message: 'Expense saved', severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.error || error.message || 'Failed to save',
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this expense?')) return;
        try {
            await api.delete(`/extra-expenses/${id}`);
            fetchExpenses();
            setSnackbar({ open: true, message: 'Expense deleted', severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to delete',
                severity: 'error',
            });
        }
    };

    const handleExportCsv = async () => {
        try {
            setExporting(true);
            const response = await api.get('/extra-expenses/export-csv', {
                params: queryParams,
                responseType: 'blob',
            });
            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `extra-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setSnackbar({ open: true, message: 'CSV export failed', severity: 'error' });
        } finally {
            setExporting(false);
        }
    };

    const startEdit = (expense) => {
        setEditingId(expense._id);
        setFormData({
            date: expense.date ? expense.date.split('T')[0] : '',
            name: expense.name,
            amount: expense.amount,
            paidBy: expense.paidBy,
            category: expense.category || '',
            remark: expense.remark || '',
            paymentMethod: expense.paymentMethod || '',
        });
        setOpenDialog(true);
    };

    const handleClose = () => {
        setOpenDialog(false);
        setEditingId(null);
        setFormData({
            ...EMPTY_FORM,
            date: new Date().toISOString().split('T')[0],
        });
    };

    const hasActiveFilters = Boolean(
        filters.from || filters.to || filters.paidBy || filters.category || filters.search.trim()
    );

    const listTotal = useMemo(
        () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        [expenses]
    );

    const toggleChartsSection = () => {
        setChartsSectionOpen((prev) => !prev);
    };

    const toggleChartCollapsed = (key) => {
        setChartCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    if (pageLoading && expenses.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                mb={2}
            >
                <Typography variant="h5" sx={{ fontWeight: 700 }}>Extra Expenses</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                        variant="outlined"
                        startIcon={<FileDownloadIcon />}
                        onClick={handleExportCsv}
                        disabled={exporting}
                        fullWidth={isMobile}
                    >
                        {exporting ? 'Exporting…' : 'Export CSV'}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenDialog(true)}
                        fullWidth={isMobile}
                    >
                        Add Expense
                    </Button>
                </Stack>
            </Stack>

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                        <Typography variant="overline" color="text.secondary">This month</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main' }}>
                            {formatInr(summary.monthTotal)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {summary.monthCount} expense{summary.monthCount === 1 ? '' : 's'}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                        <Typography variant="overline" color="text.secondary">This year</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main' }}>
                            {formatInr(summary.yearTotal)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {summary.yearCount} expense{summary.yearCount === 1 ? '' : 's'}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                        <Typography variant="overline" color="text.secondary">
                            {hasActiveFilters ? 'Filtered total' : 'Listed total'}
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {formatInr(summary.filteredTotal)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {summary.filteredCount} in current view
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                        <Typography variant="overline" color="text.secondary">Categories</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {charts.byCategory?.length || 0}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            in current view
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Filters</Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            label="From"
                            type="date"
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={filters.from}
                            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            label="To"
                            type="date"
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={filters.to}
                            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Paid by</InputLabel>
                            <Select
                                label="Paid by"
                                value={filters.paidBy}
                                onChange={(e) => setFilters((f) => ({ ...f, paidBy: e.target.value }))}
                            >
                                <MenuItem value="">All</MenuItem>
                                {filterOptions.paidByOptions.map((name) => (
                                    <MenuItem key={name} value={name}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select
                                label="Category"
                                value={filters.category}
                                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                            >
                                <MenuItem value="">All</MenuItem>
                                <MenuItem value="__uncategorized__">Uncategorized</MenuItem>
                                {categoryFilterOptions.map((cat) => (
                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            label="Search expenditure name"
                            size="small"
                            fullWidth
                            value={filters.search}
                            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                        />
                    </Grid>
                </Grid>
                {hasActiveFilters ? (
                    <Button size="small" sx={{ mt: 1.5 }} onClick={() => setFilters(EMPTY_FILTERS)}>
                        Clear filters
                    </Button>
                ) : null}
            </Paper>

            <Paper sx={{ borderRadius: 2, mb: 3, overflow: 'hidden' }}>
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{
                        px: 2,
                        py: 1.25,
                        cursor: 'pointer',
                        bgcolor: 'grey.50',
                        borderBottom: chartsSectionOpen ? '1px solid' : 'none',
                        borderColor: 'divider',
                    }}
                    onClick={toggleChartsSection}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleChartsSection();
                        }
                    }}
                >
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Charts</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Spending by month and category (filtered view)
                        </Typography>
                    </Box>
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleChartsSection();
                        }}
                        aria-label={chartsSectionOpen ? 'Collapse charts section' : 'Expand charts section'}
                    >
                        {chartsSectionOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Stack>
                <Collapse in={chartsSectionOpen} timeout="auto">
                    <Box sx={{ p: 2 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} lg={7}>
                                <ExpenseChartCard
                                    title="Spending by month"
                                    subtitle="Current filtered results"
                                    collapsed={chartCollapsed.month}
                                    onToggleCollapse={() => toggleChartCollapsed('month')}
                                    onExpand={() => setExpandedChart('month')}
                                >
                                    <Box sx={{ height: 280 }}>
                                        <MonthSpendChart data={charts.byMonth} height={280} />
                                    </Box>
                                </ExpenseChartCard>
                            </Grid>
                            <Grid item xs={12} lg={5}>
                                <ExpenseChartCard
                                    title="Spending by category"
                                    subtitle={
                                        charts.byCategory?.length > 8
                                            ? `Top 8 of ${charts.byCategory.length} categories`
                                            : 'Current filtered results'
                                    }
                                    collapsed={chartCollapsed.category}
                                    onToggleCollapse={() => toggleChartCollapsed('category')}
                                    onExpand={() => setExpandedChart('category')}
                                >
                                    <Box sx={{ height: 280 }}>
                                        <CategorySpendChart
                                            data={charts.byCategory}
                                            height={280}
                                            maxBars={8}
                                        />
                                    </Box>
                                </ExpenseChartCard>
                            </Grid>
                        </Grid>
                    </Box>
                </Collapse>
            </Paper>

            <Dialog
                open={expandedChart === 'month'}
                onClose={() => setExpandedChart(null)}
                fullWidth
                maxWidth="lg"
            >
                <DialogTitle sx={{ pr: 6 }}>
                    Spending by month
                    <IconButton
                        onClick={() => setExpandedChart(null)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                        aria-label="Close"
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ height: { xs: 320, sm: 420 } }}>
                        <MonthSpendChart data={charts.byMonth} height={420} />
                    </Box>
                    <ChartBreakdownTable
                        rows={charts.byMonth}
                        labelKey="month"
                        labelHeader="Month"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExpandedChart(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={expandedChart === 'category'}
                onClose={() => setExpandedChart(null)}
                fullWidth
                maxWidth="lg"
            >
                <DialogTitle sx={{ pr: 6 }}>
                    Spending by category
                    <IconButton
                        onClick={() => setExpandedChart(null)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                        aria-label="Close"
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Box
                        sx={{
                            height: Math.min(
                                560,
                                Math.max(320, (charts.byCategory?.length || 1) * 36)
                            ),
                        }}
                    >
                        <CategorySpendChart
                            data={charts.byCategory}
                            height={Math.min(560, Math.max(320, (charts.byCategory?.length || 1) * 36))}
                            yAxisWidth={160}
                        />
                    </Box>
                    <ChartBreakdownTable
                        rows={charts.byCategory}
                        labelKey="category"
                        labelHeader="Category"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExpandedChart(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
                {expenses.length === 0 ? (
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">No expenses found.</Typography>
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
                        <Paper sx={{ p: 1.5, borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Total ({expenses.length})
                            </Typography>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'error.main' }}>
                                {formatInr(listTotal)}
                            </Typography>
                        </Paper>
                    </Stack>
                )}
            </Box>

            <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell>Date</TableCell>
                            <TableCell>Name of Expenditure</TableCell>
                            <TableCell>Category</TableCell>
                            <TableCell align="right">Amount</TableCell>
                            <TableCell>Paid by</TableCell>
                            <TableCell>Payment</TableCell>
                            <TableCell>Remark</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {expenses.map((expense) => (
                            <TableRow key={expense._id} hover>
                                <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{expense.name}</TableCell>
                                <TableCell>{expense.category || '—'}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                                    {formatInr(expense.amount)}
                                </TableCell>
                                <TableCell>{expense.paidBy}</TableCell>
                                <TableCell>{expense.paymentMethod || '—'}</TableCell>
                                <TableCell sx={{ maxWidth: 200 }}>
                                    <Typography variant="body2" noWrap title={expense.remark || ''}>
                                        {expense.remark || '—'}
                                    </Typography>
                                </TableCell>
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
                                <TableCell colSpan={8} align="center">No expenses found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    {expenses.length > 0 ? (
                        <TableFooter>
                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                <TableCell sx={{ borderTop: '2px solid', borderColor: 'divider' }} />
                                <TableCell sx={{ borderTop: '2px solid', borderColor: 'divider' }} />
                                <TableCell
                                    align="right"
                                    sx={{
                                        fontWeight: 700,
                                        borderTop: '2px solid',
                                        borderColor: 'divider',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    Total ({expenses.length})
                                </TableCell>
                                <TableCell
                                    align="right"
                                    sx={{
                                        fontWeight: 800,
                                        color: 'error.main',
                                        borderTop: '2px solid',
                                        borderColor: 'divider',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {formatInr(listTotal)}
                                </TableCell>
                                <TableCell colSpan={4} sx={{ borderTop: '2px solid', borderColor: 'divider' }} />
                            </TableRow>
                        </TableFooter>
                    ) : null}
                </Table>
            </TableContainer>

            <Dialog
                open={openDialog}
                onClose={handleClose}
                fullScreen={isSmallMobile}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>{editingId ? 'Edit Expense' : 'Add Extra Expense'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1, minWidth: { sm: 320 } }}>
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
                            label="Amount (INR)"
                            type="number"
                            fullWidth
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        />
                        <TextField
                            label="Paid by"
                            fullWidth
                            value={formData.paidBy}
                            onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                        />
                        <TextField
                            label="Category"
                            fullWidth
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            placeholder="Type category (e.g. Office, Marketing)"
                            helperText="Enter any category name — saved expenses build the filter list"
                        />
                        <FormControl fullWidth>
                            <InputLabel>Payment method</InputLabel>
                            <Select
                                label="Payment method"
                                value={formData.paymentMethod}
                                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                            >
                                <MenuItem value="">None</MenuItem>
                                {PAYMENT_METHODS.map((m) => (
                                    <MenuItem key={m} value={m}>{m}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label="Remark"
                            fullWidth
                            multiline
                            minRows={2}
                            value={formData.remark}
                            onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={loading}>
                        {loading ? 'Saving…' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    severity={snackbar.severity}
                    variant="filled"
                    onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ExtraExpensePage;
