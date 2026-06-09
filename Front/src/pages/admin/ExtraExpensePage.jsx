import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
    Autocomplete,
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

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Payoneer', 'Other', 'Growmentality'];
const DIALOG_PAID_BY_ORDER = ['Sachin Sir', 'Sakchi', 'Satya Sir', 'Shubhankar Sir', 'Bapun', 'Soubhagya Sir'];

const CHART_COLORS = ['#1976d2', '#ed6c02', '#2e7d32', '#9c27b0', '#d32f2f', '#0288d1', '#6d4c41', '#455a64'];
const EMPTY_FILTERS = {
    dateMode: 'None',
    date: '',
    from: '',
    to: '',
    paidBy: '',
    category: '',
    paymentMethod: '',
    search: '',
    searchSelect: '',
};

const CATEGORY_OPTIONS = ['Fixed Expenses', 'Variable Expenses', 'Other Expenses'];
const NAME_FILTER_OPTIONS = ['Pantry & Refreshments', 'Puja Expense', 'Office Expense'];

// Map old category names to new fixed categories for display
const CATEGORY_MAP = {
  'Salaries': 'Fixed Expenses',
  'Office & Supplies': 'Fixed Expenses',
  'Office Expense': 'Fixed Expenses',
  'Utilities': 'Variable Expenses',
  'Pantry & Refreshments': 'Variable Expenses',
  'Puja Expense': 'Other Expenses',
  'Uncategorized': 'Other Expenses',
  '__uncategorized__': 'Other Expenses'
};

const mapOldCategoryToNew = (oldCategory) => {
  if (!oldCategory) return 'Other Expenses';
  return CATEGORY_MAP[oldCategory] || oldCategory;
};

// Reverse mapping: convert new category back to query array of old categories
const getOldCategoriesForNewCategory = (newCategory) => {
  if (!newCategory) return [];
  return Object.keys(CATEGORY_MAP).filter(old => CATEGORY_MAP[old] === newCategory);
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

function normalizePaidBy(name) {
    return (name || '').toLowerCase().replace(/\b(sir|ma'am|maam)\b/g, '').replace(/[^a-z0-9]/gi, ' ').trim();
}

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
    // Map old categories to new ones and aggregate
    const mappedData = data.reduce((acc, item) => {
      const newCat = mapOldCategoryToNew(item.category);
      const existing = acc.find(d => d.category === newCat);
      if (existing) {
        existing.amount += item.amount;
        existing.count += item.count || 1;
      } else {
        acc.push({ ...item, category: newCat });
      }
      return acc;
    }, []);
    
    const rows = maxBars ? mappedData.slice(0, maxBars) : mappedData;
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
                    {(() => {
                        const isCredit = expense.isCredit;
                        return (
                            <Typography variant="body2" sx={{ fontWeight: 800, color: isCredit ? 'success.main' : 'error.main' }}>
                                {formatInr(expense.amount)}
                            </Typography>
                        );
                    })()}
                </Stack>
                <Box>
                    <Typography variant="caption" color="text.secondary">Name of Expenditure</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{expense.name}</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {expense.category ? <Chip size="small" label={mapOldCategoryToNew(expense.category)} /> : null}
                    {expense.paymentMethod ? (
                        <Chip
                            size="small"
                            label={expense.paymentMethod}
                            color={expense.isCredit ? 'success' : undefined}
                            variant={expense.isCredit ? 'filled' : 'outlined'}
                        />
                    ) : null}
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

function CreditHistoryTable({ onClose }) {
    const [creditHistory, setCreditHistory] = useState([]);
    const [creditHistoryLoading, setCreditHistoryLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);

    useEffect(() => {
        fetchCreditHistory();
    }, []);

    const fetchCreditHistory = async () => {
        try {
            setCreditHistoryLoading(true);
            const { data } = await api.get('/cash-credit/history', { params: { type: 'CREDIT_ADDED' } });
            setCreditHistory(data.history || []);
        } catch (error) {
            console.error('Error fetching credit history:', error);
        } finally {
            setCreditHistoryLoading(false);
        }
    };

    const handleDeleteRecord = async (id) => {
        if (!window.confirm('Delete this credit history record?')) return;
        try {
            setDeletingId(id);
            await api.delete(`/cash-credit/history/${id}`);
            setCreditHistory(creditHistory.filter(r => r._id !== id));
            // Refresh global credit summary after deleting a credit history record
            fetchCredit();
        } catch (error) {
            console.error('Error deleting record:', error);
        } finally {
            setDeletingId(null);
        }
    };

    if (creditHistoryLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <TableContainer sx={{ mt: 2 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell>Date</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Amount</TableCell>
                        <TableCell>Given By / Expense</TableCell>
                        <TableCell>Balance After</TableCell>
                        <TableCell>Remarks</TableCell>
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {creditHistory.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 2 }}>
                                <Typography color="text.secondary">No credit history records yet</Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        creditHistory.map((record) => (
                            <TableRow
                                key={record._id}
                                hover
                                sx={{
                                    bgcolor: record.type === 'CREDIT_ADDED' ? 'success.lighter' : 'error.lighter',
                                }}
                            >
                                <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={record.type === 'CREDIT_ADDED' ? 'Credit Added' : 'Credit Used'}
                                        color={record.type === 'CREDIT_ADDED' ? 'success' : 'error'}
                                        variant="filled"
                                    />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>
                                    {formatInr(record.amount)}
                                </TableCell>
                                <TableCell>
                                    {record.type === 'CREDIT_ADDED'
                                        ? record.creditGivenBy
                                        : record.expenseId?.name || 'Deleted Expense'
                                    }
                                </TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>
                                    {formatInr(record.balanceAfter)}
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" noWrap title={record.remarks || ''}>
                                        {record.remarks || '—'}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton
                                        size="small"
                                        onClick={() => handleDeleteRecord(record._id)}
                                        disabled={deletingId === record._id}
                                        color="error"
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

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
    const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

    // Credit state
    const [credit, setCredit] = useState({ totalCredit: 0, totalUsed: 0, remainingCredit: 0, monthlyBreakdown: [] });
    const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [openCreditDialog, setOpenCreditDialog] = useState(false);
    const [creditFormData, setCreditFormData] = useState({ amount: '', date: new Date().toISOString().split('T')[0], creditGivenBy: '', remarks: '' });
    const [creditDialogLoading, setCreditDialogLoading] = useState(false);
    const [openCreditHistoryDialog, setOpenCreditHistoryDialog] = useState(false);
    const [creditHistory, setCreditHistory] = useState([]);

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
        
        // Handle date based on mode
        if (appliedFilters.dateMode === 'Single Day' && appliedFilters.date) {
            p.date = appliedFilters.date;
        } else if (appliedFilters.dateMode === 'Date Range') {
            if (appliedFilters.from) p.from = appliedFilters.from;
            if (appliedFilters.to) p.to = appliedFilters.to;
        }
        // If dateMode is 'None', don't send any date params
        
        if (appliedFilters.paidBy) p.paidBy = appliedFilters.paidBy;
        if (appliedFilters.paymentMethod) p.paymentMethod = appliedFilters.paymentMethod;
        if (appliedFilters.category) {
            // Convert new category to old categories for backend query
            const oldCats = getOldCategoriesForNewCategory(appliedFilters.category);
            if (oldCats.length > 0) {
                p.categories = oldCats; // Pass array to backend to filter by multiple old categories
            }
        }
        if (appliedFilters.search.trim()) p.search = appliedFilters.search.trim();
        return p;
    }, [appliedFilters]);

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
            // Set credit from response
            if (data?.credit) {
                setCredit(data.credit);
            }
            // Fetch credit history (only CREDIT_ADDED used for showing in table)
            try {
                const h = await api.get('/cash-credit/history', { params: { type: 'CREDIT_ADDED' } });
                setCreditHistory(h.data?.history || []);
            } catch (err) {
                console.error('Failed to fetch credit history:', err);
            }
        } catch (error) {
            console.error('Error fetching expenses:', error);
            setSnackbar({ open: true, message: 'Failed to load expenses', severity: 'error' });
        } finally {
            setPageLoading(false);
        }
    }, [queryParams]);

    const fetchCredit = useCallback(async () => {
        try {
            const { data } = await api.get('/cash-credit');
            setCredit(data);
            if (data.monthlyBreakdown) {
                setMonthlyBreakdown(data.monthlyBreakdown);
            }
        } catch (error) {
            console.error('Error fetching credit:', error);
        }
    }, []);

    const handleAddCredit = async () => {
        try {
            setCreditDialogLoading(true);
            const payload = {
                amount: parseFloat(creditFormData.amount),
                date: creditFormData.date,
                creditGivenBy: creditFormData.creditGivenBy || '',
                remarks: creditFormData.remarks || '',
            };
            await api.post('/cash-credit/add', payload);
            setSnackbar({ open: true, message: 'Credit added successfully', severity: 'success' });
            setCreditFormData({ amount: '', date: new Date().toISOString().split('T')[0], creditGivenBy: '', remarks: '' });
            setOpenCreditDialog(false);
            // Refresh credit information
            fetchCredit();
            // Refresh expenses to reflect credit changes
            fetchExpenses();
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to add credit',
                severity: 'error',
            });
        } finally {
            setCreditDialogLoading(false);
        }
    };

    // Fetch on mount with empty filters
    useEffect(() => {
        fetchExpenses();
        fetchCredit();
    }, []); // Empty dependency array - only run on mount

    // Re-fetch when applied filters change
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        // Filters changed after mount, fetch new data
        fetchExpenses();
    }, [appliedFilters]);

    const categoryFilterOptions = useMemo(() => {
        return (filterOptions.categoryOptions || []).filter(Boolean).sort();
    }, [filterOptions.categoryOptions]);

    const paidByOptionsList = useMemo(() => {
        const arr = (filterOptions.paidByOptions || []).filter(Boolean);
        const seen = new Map();
        for (const name of arr) {
            const norm = (name || '').toLowerCase()
                .replace(/\b(sir|ma'am|maam)\b/g, '')
                .replace(/[^a-z0-9]/gi, ' ')
                .trim();
            if (!norm) continue;
            if (!seen.has(norm)) {
                seen.set(norm, name);
            } else {
                const existing = seen.get(norm) || '';
                const hasHonorificExisting = /\b(sir|ma'am|maam)\b/i.test(existing);
                const hasHonorificNew = /\b(sir|ma'am|maam)\b/i.test(name);
                // Prefer the variant that contains honorific (e.g., 'Sachin Sir')
                if (!hasHonorificExisting && hasHonorificNew) {
                    seen.set(norm, name);
                }
            }
        }
        return Array.from(seen.values());
    }, [filterOptions.paidByOptions]);

    const paidByDialogOptions = useMemo(() => {
        // Show only this specific set (in this order) in the Add/Edit dialog
        return DIALOG_PAID_BY_ORDER.slice();
    }, []);

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
            // Refresh global credit summary after changes
            fetchCredit();
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
            // Refresh credit summary after deletion
            fetchCredit();
            setSnackbar({ open: true, message: 'Expense deleted', severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to delete',
                severity: 'error',
            });
        }
    };

    const handleDeleteCredit = async (rawId) => {
        if (!window.confirm('Delete this credit history record?')) return;
        try {
            await api.delete(`/cash-credit/history/${rawId}`);
            fetchExpenses();
            // Refresh credit summary after deleting a credit record
            fetchCredit();
            setSnackbar({ open: true, message: 'Credit record deleted', severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to delete credit record',
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
        let paidByVal = expense.paidBy || '';
        try {
            const norm = normalizePaidBy(paidByVal);
            const match = (DIALOG_PAID_BY_ORDER || []).find((opt) => normalizePaidBy(opt) === norm);
            if (match) paidByVal = match;
        } catch (e) { /* ignore */ }

        setFormData({
            date: expense.date ? expense.date.split('T')[0] : '',
            name: expense.name,
            amount: expense.amount,
            paidBy: paidByVal,
            category: mapOldCategoryToNew(expense.category) || '',
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

    const handleApplyFilters = () => {
        setAppliedFilters(filters);
    };

    const handleClearFilters = () => {
        setFilters(EMPTY_FILTERS);
        setAppliedFilters(EMPTY_FILTERS);
    };

    const hasActiveFilters = Boolean(
        appliedFilters.dateMode !== 'None' || appliedFilters.date || appliedFilters.from || appliedFilters.to || appliedFilters.paidBy || appliedFilters.category || appliedFilters.paymentMethod || appliedFilters.search.trim()
    );

    // Merge expenses with credit-added records for table display
    const displayedExpenses = useMemo(() => {
        const pm = (appliedFilters.paymentMethod || '').trim();
        // base expenses (apply payment method filter if set)
        let expenseList = Array.isArray(expenses) ? expenses.slice() : [];
        if (pm) {
            expenseList = expenseList.filter((e) => ((e.paymentMethod || '').toLowerCase() === pm.toLowerCase()));
        }

        // map credit history entries (only CREDIT_ADDED) to table rows
        const creditRows = (creditHistory || [])
            .filter((r) => r.type === 'CREDIT_ADDED')
            .map((r) => ({
                _id: `credit-${r._id}`,
                date: r.date,
                name: `Credit: ${r.creditGivenBy || 'Added'}`,
                category: '',
                amount: Number(r.amount) || 0,
                paidBy: r.creditGivenBy || '',
                paymentMethod: 'Credit',
                remark: r.remarks || '',
                isCredit: true,
                rawRecord: r,
            }));

        // merge and sort by date desc
        const merged = [...expenseList, ...creditRows].sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return db - da;
        });

        return merged;
    }, [expenses, creditHistory, appliedFilters.paymentMethod]);

    // Total should only sum actual expenses (exclude credit records)
    const listTotal = useMemo(
        () => (displayedExpenses || []).filter(e => !e.isCredit).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        [displayedExpenses]
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

            {/* Credit Box Section with Month Selector */}
            <Stack spacing={2} sx={{ mb: 2 }}>
                {/* Month Selector */}
                <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, minWidth: '100px' }}>
                        Select Month:
                    </Typography>
                    <FormControl size="small" sx={{ minWidth: '200px' }}>
                        <Select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        >
                            {monthlyBreakdown.map((month) => (
                                <MenuItem key={month.yearMonth} value={month.yearMonth}>
                                    {new Date(`${month.yearMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>

                {/* Monthly Credit Details */}
                {monthlyBreakdown.find(m => m.yearMonth === selectedMonth) && (
                    (() => {
                        const currentMonth = monthlyBreakdown.find(m => m.yearMonth === selectedMonth);
                        return (
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%', bgcolor: 'info.lighter', border: '2px solid', borderColor: 'info.main' }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                            <Box>
                                                <Typography variant="caption" color="info.dark" sx={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>Credit Added</Typography>
                                                <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.dark', fontSize: '1.1rem' }}>
                                                    {formatInr(currentMonth.creditsAdded)}
                                                </Typography>
                                            </Box>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => setOpenCreditDialog(true)}
                                                sx={{ mt: -0.5 }}
                                            >
                                                Add
                                            </Button>
                                        </Stack>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%', bgcolor: 'error.lighter', border: '2px solid', borderColor: 'error.main' }}>
                                        <Typography variant="caption" color="error.dark" sx={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>Cash Expenses</Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.dark', fontSize: '1.1rem' }}>
                                            {formatInr(currentMonth.cashExpenses)}
                                        </Typography>
                                        <Typography variant="caption" color="error.dark" sx={{ fontSize: '0.7rem' }}>
                                            This month
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%', bgcolor: 'warning.lighter', border: '2px solid', borderColor: 'warning.main' }}>
                                        <Typography variant="caption" color="warning.dark" sx={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>Carryover</Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark', fontSize: '1.1rem' }}>
                                            {formatInr(Math.max(0, currentMonth.carryoverFromPrevious))}
                                        </Typography>
                                        <Typography variant="caption" color="warning.dark" sx={{ fontSize: '0.7rem' }}>
                                            From previous
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ 
                                        p: 2, 
                                        borderRadius: 2, 
                                        height: '100%', 
                                        bgcolor: currentMonth.netBalance >= 0 ? 'success.lighter' : 'error.lighter',
                                        border: '2px solid',
                                        borderColor: currentMonth.netBalance >= 0 ? 'success.main' : 'error.main'
                                    }}>
                                        <Typography variant="caption" sx={{ 
                                            textTransform: 'uppercase', 
                                            fontSize: '0.7rem',
                                            color: currentMonth.netBalance >= 0 ? 'success.dark' : 'error.dark'
                                        }}>Available Balance</Typography>
                                        <Typography variant="h6" sx={{ 
                                            fontWeight: 700, 
                                            fontSize: '1.1rem',
                                            color: currentMonth.netBalance >= 0 ? 'success.dark' : 'error.dark'
                                        }}>
                                            {formatInr(Math.max(0, currentMonth.netBalance))}
                                        </Typography>
                                        <Typography variant="caption" sx={{ 
                                            fontSize: '0.7rem',
                                            color: currentMonth.netBalance >= 0 ? 'success.dark' : 'error.dark'
                                        }}>
                                            Ready to spend
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => setOpenCreditHistoryDialog(true)}
                                            fullWidth
                                        >
                                            History
                                        </Button>
                                    </Paper>
                                </Grid>
                            </Grid>
                        );
                    })()
                )}

                {/* Global Credit Summary */}
                <Box sx={{ 
                    p: 2, 
                    bgcolor: 'grey.100', 
                    borderRadius: 1, 
                    border: '1px solid',
                    borderColor: 'grey.300'
                }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        Global Summary
                    </Typography>
                    <Grid container spacing={1} sx={{ mt: 0.5 }}>
                        <Grid item xs={6} sm={3}>
                            <Box>
                                <Typography variant="caption" color="text.secondary">Total Credit Added</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {formatInr(credit.totalCredit)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <Box>
                                <Typography variant="caption" color="text.secondary">Total Used</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                                    {formatInr(credit.totalUsed)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <Box>
                                <Typography variant="caption" color="text.secondary">Overall Balance</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                                    {formatInr(credit.remainingCredit)}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </Box>
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
                            {hasActiveFilters ? ' · matches filters' : ''}
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
                            {hasActiveFilters ? ' · matches filters' : ''}
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
                        <FormControl size="small" fullWidth>
                            <InputLabel>Date Mode</InputLabel>
                            <Select
                                label="Date Mode"
                                value={filters.dateMode}
                                onChange={(e) => {
                                    const mode = e.target.value;
                                    // Clear date fields when switching modes
                                    setFilters((f) => ({
                                        ...f,
                                        dateMode: mode,
                                        date: '',
                                        from: '',
                                        to: '',
                                    }));
                                }}
                            >
                                <MenuItem value="None">None</MenuItem>
                                <MenuItem value="Single Day">Single Day</MenuItem>
                                <MenuItem value="Date Range">Date Range</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    {filters.dateMode === 'Single Day' && (
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField
                                label="Date"
                                type="date"
                                size="small"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={filters.date}
                                onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
                            />
                        </Grid>
                    )}

                    {filters.dateMode === 'Date Range' && (
                        <>
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
                        </>
                    )}
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Paid by</InputLabel>
                            <Select
                                label="Paid by"
                                value={filters.paidBy}
                                onChange={(e) => setFilters((f) => ({ ...f, paidBy: e.target.value }))}
                            >
                                <MenuItem value="">All</MenuItem>
                                {paidByOptionsList.map((name) => (
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
                                {CATEGORY_OPTIONS.map((cat) => (
                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Payment method</InputLabel>
                            <Select
                                label="Payment method"
                                value={filters.paymentMethod || ''}
                                onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
                            >
                                <MenuItem value="">All</MenuItem>
                                {PAYMENT_METHODS.map((m) => (
                                    <MenuItem key={m} value={m}>{m}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Search expenditure name</InputLabel>
                            <Select
                                label="Search expenditure name"
                                value={filters.searchSelect || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '__custom__') {
                                        // switch to custom search (clear existing search)
                                        setFilters((f) => ({ ...f, searchSelect: val, search: '' }));
                                    } else {
                                        setFilters((f) => ({ ...f, searchSelect: val, search: val }));
                                    }
                                }}
                            >
                                <MenuItem value="">All</MenuItem>
                                {NAME_FILTER_OPTIONS.map((name) => (
                                    <MenuItem key={name} value={name}>{name}</MenuItem>
                                ))}
                                <MenuItem value="__custom__">Search by name...</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    {filters.searchSelect === '__custom__' && (
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField
                                label="Search expenditure name"
                                size="small"
                                fullWidth
                                value={filters.search}
                                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                            />
                        </Grid>
                    )}
                </Grid>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button 
                        variant="contained" 
                        size="small" 
                        onClick={handleApplyFilters}
                    >
                        Apply Filters
                    </Button>
                    {hasActiveFilters ? (
                        <Button size="small" onClick={handleClearFilters}>
                            Clear filters
                        </Button>
                    ) : null}
                </Stack>
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
                {displayedExpenses.length === 0 ? (
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">No expenses found.</Typography>
                    </Paper>
                ) : (
                    <Stack spacing={1.5}>
                        {displayedExpenses.map((expense) => (
                            <MobileExpenseCard
                                key={expense._id}
                                expense={expense}
                                onEdit={() => expense.isCredit ? null : startEdit(expense)}
                                onDelete={() => expense.isCredit ? handleDeleteCredit(expense.rawRecord?._id) : handleDelete(expense._id)}
                            />
                        ))}
                        <Paper sx={{ p: 1.5, borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Total ({displayedExpenses.length})
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
                        {displayedExpenses.map((expense) => {
                            const isCredit = !!expense.isCredit;
                            const isCashExpense = !isCredit && expense.paymentMethod && expense.paymentMethod.toLowerCase() === 'cash';
                            return (
                                <TableRow key={expense._id} hover sx={{ bgcolor: isCredit ? 'success.lighter' : (isCashExpense ? 'error.lighter' : 'transparent') }}>
                                    <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{expense.name}</TableCell>
                                    <TableCell>{expense.category ? mapOldCategoryToNew(expense.category) : '—'}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, color: isCredit ? 'success.main' : 'error.main' }}>
                                        {formatInr(expense.amount)}
                                    </TableCell>
                                    <TableCell>{expense.paidBy}</TableCell>
                                    <TableCell>
                                        {isCredit ? (
                                            <Chip size="small" label="Credit" color="success" variant="filled" />
                                        ) : (
                                            <Chip
                                                size="small"
                                                label={expense.paymentMethod || '—'}
                                                color={isCashExpense ? 'error' : 'default'}
                                                variant={isCashExpense ? 'filled' : 'outlined'}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 200 }}>
                                        <Typography variant="body2" noWrap title={expense.remark || ''}>
                                            {expense.remark || '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        {isCredit ? (
                                            <IconButton size="small" onClick={() => handleDeleteCredit(expense.rawRecord?._id)} color="error">
                                                <DeleteIcon />
                                            </IconButton>
                                        ) : (
                                            <>
                                                <IconButton size="small" onClick={() => startEdit(expense)} color="primary">
                                                    <EditIcon />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => handleDelete(expense._id)} color="error">
                                                    <DeleteIcon />
                                                </IconButton>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {displayedExpenses.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} align="center">No expenses found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    {displayedExpenses.length > 0 ? (
                        <TableFooter>
                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                <TableCell
                                    sx={{
                                        fontWeight: 700,
                                        borderTop: '2px solid',
                                        borderColor: 'divider',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    Total ({displayedExpenses.length})
                                </TableCell>
                                <TableCell sx={{ borderTop: '2px solid', borderColor: 'divider' }} />
                                <TableCell sx={{ borderTop: '2px solid', borderColor: 'divider' }} />
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
                        <Autocomplete
                            freeSolo
                            options={NAME_FILTER_OPTIONS}
                            value={formData.name || ''}
                            onChange={(e, newVal) => setFormData({ ...formData, name: newVal || '' })}
                            onInputChange={(e, newInput) => setFormData({ ...formData, name: newInput })}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Name of Expenditure"
                                    fullWidth
                                    placeholder="Select or type custom name"
                                />
                            )}
                        />
                        <TextField
                            label="Amount (INR)"
                            type="number"
                            fullWidth
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        />
                        <Autocomplete
                            freeSolo
                            options={paidByDialogOptions}
                            value={formData.paidBy || ''}
                            onChange={(e, newVal) => setFormData({ ...formData, paidBy: newVal || '' })}
                            onInputChange={(e, newInput) => setFormData({ ...formData, paidBy: newInput })}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Paid by"
                                    fullWidth
                                    size="small"
                                    placeholder="Select or type name"
                                />
                            )}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select
                                label="Category"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            >
                                <MenuItem value="">None</MenuItem>
                                {CATEGORY_OPTIONS.map((c) => (
                                    <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
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

            {/* Add Credit Dialog */}
            <Dialog
                open={openCreditDialog}
                onClose={() => setOpenCreditDialog(false)}
                fullScreen={isSmallMobile}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Add Credit Amount</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1, minWidth: { sm: 320 } }}>
                        <Alert severity="info">
                            Enter the credit amount that will be used for cash expenses. When you add a cash expense, the amount will be automatically deducted from this credit.
                        </Alert>
                        <TextField
                            label="Amount (INR)"
                            type="number"
                            fullWidth
                            value={creditFormData.amount}
                            onChange={(e) => setCreditFormData({ ...creditFormData, amount: e.target.value })}
                            placeholder="e.g., 100000"
                        />
                        <TextField
                            label="Date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={creditFormData.date}
                            onChange={(e) => setCreditFormData({ ...creditFormData, date: e.target.value })}
                        />
                        <TextField
                            label="Credit Given By"
                            fullWidth
                            value={creditFormData.creditGivenBy}
                            onChange={(e) => setCreditFormData({ ...creditFormData, creditGivenBy: e.target.value })}
                            placeholder="Name of person who provided credit"
                        />
                        <TextField
                            label="Remarks"
                            fullWidth
                            multiline
                            minRows={2}
                            value={creditFormData.remarks}
                            onChange={(e) => setCreditFormData({ ...creditFormData, remarks: e.target.value })}
                            placeholder="Additional notes"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCreditDialog(false)}>Cancel</Button>
                    <Button 
                        onClick={handleAddCredit} 
                        variant="contained" 
                        disabled={creditDialogLoading || !creditFormData.amount}
                    >
                        {creditDialogLoading ? 'Adding…' : 'Add Credit'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Credit History Dialog */}
            <Dialog
                open={openCreditHistoryDialog}
                onClose={() => setOpenCreditHistoryDialog(false)}
                fullScreen={isSmallMobile}
                fullWidth
                maxWidth="md"
            >
                <DialogTitle>
                    Credit History
                    <IconButton
                        onClick={() => setOpenCreditHistoryDialog(false)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                        aria-label="Close"
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <CreditHistoryTable onClose={() => setOpenCreditHistoryDialog(false)} />
                </DialogContent>
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
