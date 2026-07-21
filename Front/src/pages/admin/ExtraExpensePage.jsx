import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
    Pagination,
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
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
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
        <Paper 
            elevation={0}
            sx={{ 
                borderRadius: 3, 
                height: '100%', 
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(249,250,251,0.95) 100%)',
                border: '1px solid rgba(209, 213, 219, 0.5)',
                boxShadow: '0 4px 16px rgba(107, 114, 128, 0.08)'
            }}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                    px: 2.5,
                    py: 2,
                    borderBottom: collapsed ? 'none' : '1px solid rgba(209, 213, 219, 0.5)',
                    background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#374151' }}>{title}</Typography>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 500 }}>{subtitle}</Typography>
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
    const isCredit = !!expense.isCredit;
    const isCashExpense = !isCredit && expense.paymentMethod && expense.paymentMethod.toLowerCase() === 'cash';

    return (
        <Paper 
            elevation={0}
            sx={{ 
                p: 2, 
                borderRadius: 3,
                background: isCredit
                    ? 'linear-gradient(135deg, rgba(220, 252, 231, 0.7) 0%, rgba(187, 247, 208, 0.5) 100%)'
                    : (isCashExpense 
                        ? 'linear-gradient(135deg, rgba(254, 226, 226, 0.7) 0%, rgba(252, 165, 165, 0.5) 100%)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(249,250,251,0.95) 100%)'),
                border: '1px solid',
                borderColor: isCredit 
                    ? 'rgba(34, 197, 94, 0.3)'
                    : (isCashExpense ? 'rgba(239, 68, 68, 0.3)' : 'rgba(209, 213, 219, 0.5)'),
                boxShadow: isCredit
                    ? '0 4px 16px rgba(34, 197, 94, 0.15)'
                    : (isCashExpense ? '0 4px 16px rgba(239, 68, 68, 0.15)' : '0 4px 16px rgba(107, 114, 128, 0.08)'),
                transition: 'all 0.3s ease',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isCredit
                        ? '0 8px 24px rgba(34, 197, 94, 0.25)'
                        : (isCashExpense ? '0 8px 24px rgba(239, 68, 68, 0.25)' : '0 8px 24px rgba(107, 114, 128, 0.15)')
                }
            }}>
            <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600 }}>📅 Date</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#374151' }}>{dateStr}</Typography>
                    </Box>
                    {(() => {
                        return (
                            <Typography variant="h6" sx={{ fontWeight: 900, color: isCredit ? '#16a34a' : '#dc2626' }}>
                                {formatInr(expense.amount)}
                            </Typography>
                        );
                    })()}
                </Stack>
                <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600 }}>📝 Name of Expenditure</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#1f2937' }}>{expense.name}</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {expense.category ? (
                        <Chip 
                            size="small" 
                            label={mapOldCategoryToNew(expense.category)}
                            sx={{
                                fontWeight: 600,
                                borderRadius: 2,
                                background: 'linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%)',
                                color: '#3730a3',
                                border: '1px solid rgba(99, 102, 241, 0.2)'
                            }}
                        />
                    ) : null}
                    {expense.paymentMethod ? (
                        <Chip
                            size="small"
                            label={expense.paymentMethod}
                            sx={{
                                fontWeight: 600,
                                borderRadius: 2,
                                ...(expense.isCredit ? {
                                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                                    color: '#14532d',
                                    border: '1px solid rgba(34, 197, 94, 0.3)'
                                } : {})
                            }}
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
    const navigate = useNavigate();
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
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

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
            // Send the category group name (new name) to backend
            // Backend will match both new names and old category names that map to it
            p.groupCategory = appliedFilters.category;
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
        const hasCategoryFilter = Boolean(appliedFilters.category);
        
        // base expenses (apply payment method filter if set)
        let expenseList = Array.isArray(expenses) ? expenses.slice() : [];
        if (pm) {
            expenseList = expenseList.filter((e) => ((e.paymentMethod || '').toLowerCase() === pm.toLowerCase()));
        }

        // map credit history entries (only CREDIT_ADDED) to table rows
        // Only show credit entries if no category filter is applied (credit entries have no category)
        const creditRows = hasCategoryFilter ? [] : (creditHistory || [])
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
    }, [expenses, creditHistory, appliedFilters.paymentMethod, appliedFilters.category]);

    // Total should only sum actual expenses (exclude credit records)
    const listTotal = useMemo(
        () => (displayedExpenses || []).filter(e => !e.isCredit).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        [displayedExpenses]
    );

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [displayedExpenses]);

    // Calculate pagination values
    const totalPages = useMemo(
        () => Math.ceil((displayedExpenses?.length || 0) / itemsPerPage),
        [displayedExpenses, itemsPerPage]
    );

    // Get paginated data
    const paginatedExpenses = useMemo(() => {
        const startIdx = (currentPage - 1) * itemsPerPage;
        const endIdx = startIdx + itemsPerPage;
        return (displayedExpenses || []).slice(startIdx, endIdx);
    }, [displayedExpenses, currentPage, itemsPerPage]);

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
        <Box sx={{ 
            p: { xs: 1.5, sm: 3 },
            minHeight: '100vh',
            background: 'transparent'
        }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                mb={3}
            >
                <Typography 
                    variant="h4" 
                    sx={{ 
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.5px'
                    }}
                >
                    Extra Expenses
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button
                        variant="outlined"
                        startIcon={<ReceiptLongIcon />}
                        onClick={() => navigate('/admin/invoice-upload')}
                        fullWidth={isMobile}
                        sx={{
                            px: 3,
                            py: 1.2,
                            borderRadius: 2,
                            fontWeight: 700,
                            color: '#2563eb',
                            borderColor: 'rgba(37, 99, 235, 0.5)',
                            borderWidth: '2px',
                            background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.35) 0%, rgba(224, 231, 255, 0.35) 100%)',
                            backdropFilter: 'blur(10px)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                borderColor: '#2563eb',
                                background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.6) 0%, rgba(224, 231, 255, 0.6) 100%)',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(37, 99, 235, 0.25)'
                            }
                        }}
                    >
                        Invoice Upload
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<FileDownloadIcon />}
                        onClick={handleExportCsv}
                        disabled={exporting}
                        fullWidth={isMobile}
                        sx={{
                            px: 3,
                            py: 1.2,
                            borderRadius: 2,
                            fontWeight: 700,
                            color: '#3b82f6',
                            borderColor: 'rgba(59, 130, 246, 0.5)',
                            borderWidth: '2px',
                            background: 'linear-gradient(135deg, rgba(219, 234, 254, 0.3) 0%, rgba(224, 231, 255, 0.3) 100%)',
                            backdropFilter: 'blur(10px)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                borderColor: '#3b82f6',
                                background: 'linear-gradient(135deg, rgba(219, 234, 254, 0.5) 0%, rgba(224, 231, 255, 0.5) 100%)',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(59, 130, 246, 0.3)'
                            },
                            '&.Mui-disabled': {
                                borderColor: 'rgba(156, 163, 175, 0.3)',
                                color: '#9ca3af',
                                background: 'rgba(243, 244, 246, 0.5)'
                            }
                        }}
                    >
                        {exporting ? '⏳ Exporting…' : '⬇️ Export CSV'}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenDialog(true)}
                        fullWidth={isMobile}
                        sx={{
                            px: 3,
                            py: 1.2,
                            borderRadius: 2,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            boxShadow: '0 4px 12px rgba(118, 75, 162, 0.3)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #5568d3 0%, #653a8a 100%)',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(118, 75, 162, 0.4)'
                            }
                        }}
                    >
                        Add Expense
                    </Button>
                </Stack>
            </Stack>

            {/* Credit Box Section with Month Selector */}
            <Stack spacing={2.5} sx={{ mb: 3 }}>
                {/* Month Selector */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        borderRadius: 3,
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 100%)',
                        border: '1px solid rgba(209, 213, 219, 0.5)',
                        boxShadow: '0 4px 16px rgba(107, 114, 128, 0.08)',
                        backdropFilter: 'blur(10px)'
                    }}
                >
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', gap: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#374151', fontSize: '1rem' }}>
                            📅 Select Month:
                        </Typography>
                        <FormControl 
                            size="small" 
                            sx={{ 
                                minWidth: '220px',
                                flex: { xs: 1, sm: 'initial' }
                            }}>
                            <Select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                sx={{
                                    borderRadius: 2,
                                    fontWeight: 600,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(209, 213, 219, 0.6)',
                                        borderWidth: '2px'
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(102, 126, 234, 0.6)'
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#667eea',
                                        borderWidth: '2px'
                                    },
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    boxShadow: '0 2px 8px rgba(107, 114, 128, 0.06)'
                                }}
                            >
                                {monthlyBreakdown.map((month) => (
                                    <MenuItem 
                                        key={month.yearMonth} 
                                        value={month.yearMonth}
                                        sx={{
                                            fontWeight: 600,
                                            '&:hover': {
                                                background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)'
                                            },
                                            '&.Mui-selected': {
                                                background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
                                                fontWeight: 700,
                                                '&:hover': {
                                                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.25) 100%)'
                                                }
                                            }
                                        }}
                                    >
                                        {new Date(`${month.yearMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </Paper>

                {/* Monthly Credit Details */}
                {monthlyBreakdown.find(m => m.yearMonth === selectedMonth) && (
                    (() => {
                        const currentMonth = monthlyBreakdown.find(m => m.yearMonth === selectedMonth);
                        return (
                            <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ 
                                        p: 2.5, 
                                        borderRadius: 3, 
                                        height: '100%', 
                                        background: 'linear-gradient(135deg, rgba(224, 242, 254, 0.9) 0%, rgba(186, 230, 253, 0.7) 100%)',
                                        border: '1px solid',
                                        borderColor: 'rgba(14, 165, 233, 0.3)',
                                        boxShadow: '0 8px 24px rgba(14, 165, 233, 0.15)',
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: '0 12px 32px rgba(14, 165, 233, 0.25)'
                                        }
                                    }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                            <Box>
                                                <Typography variant="caption" color="info.dark" sx={{ textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px' }}>Credit Added</Typography>
                                                <Typography variant="h5" sx={{ fontWeight: 800, color: '#075985', fontSize: '1.4rem', mt: 0.5 }}>
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
                                    <Paper sx={{ 
                                        p: 2.5, 
                                        borderRadius: 3, 
                                        height: '100%', 
                                        background: 'linear-gradient(135deg, rgba(254, 226, 226, 0.9) 0%, rgba(252, 165, 165, 0.7) 100%)',
                                        border: '1px solid',
                                        borderColor: 'rgba(239, 68, 68, 0.3)',
                                        boxShadow: '0 8px 24px rgba(239, 68, 68, 0.15)',
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: '0 12px 32px rgba(239, 68, 68, 0.25)'
                                        }
                                    }}>
                                        <Typography variant="caption" color="error.dark" sx={{ textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px' }}>Cash Expenses</Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#b91c1c', fontSize: '1.4rem', mt: 0.5 }}>
                                            {formatInr(currentMonth.cashExpenses)}
                                        </Typography>
                                        <Typography variant="caption" color="error.dark" sx={{ fontSize: '0.7rem' }}>
                                            This month
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ 
                                        p: 2.5, 
                                        borderRadius: 3, 
                                        height: '100%', 
                                        background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.9) 0%, rgba(253, 230, 138, 0.7) 100%)',
                                        border: '1px solid',
                                        borderColor: 'rgba(251, 146, 60, 0.3)',
                                        boxShadow: '0 8px 24px rgba(251, 146, 60, 0.15)',
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: '0 12px 32px rgba(251, 146, 60, 0.25)'
                                        }
                                    }}>
                                        <Typography variant="caption" color="warning.dark" sx={{ textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px' }}>Carryover</Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#92400e', fontSize: '1.4rem', mt: 0.5 }}>
                                            {formatInr(Math.max(0, currentMonth.carryoverFromPrevious))}
                                        </Typography>
                                        <Typography variant="caption" color="warning.dark" sx={{ fontSize: '0.7rem' }}>
                                            From previous
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Paper sx={{ 
                                        p: 2.5, 
                                        borderRadius: 3, 
                                        height: '100%', 
                                        background: currentMonth.netBalance >= 0 
                                            ? 'linear-gradient(135deg, rgba(220, 252, 231, 0.9) 0%, rgba(187, 247, 208, 0.7) 100%)'
                                            : 'linear-gradient(135deg, rgba(254, 226, 226, 0.9) 0%, rgba(252, 165, 165, 0.7) 100%)',
                                        border: '1px solid',
                                        borderColor: currentMonth.netBalance >= 0 
                                            ? 'rgba(34, 197, 94, 0.3)'
                                            : 'rgba(239, 68, 68, 0.3)',
                                        boxShadow: currentMonth.netBalance >= 0
                                            ? '0 8px 24px rgba(34, 197, 94, 0.15)'
                                            : '0 8px 24px rgba(239, 68, 68, 0.15)',
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: currentMonth.netBalance >= 0
                                                ? '0 12px 32px rgba(34, 197, 94, 0.25)'
                                                : '0 12px 32px rgba(239, 68, 68, 0.25)'
                                        }
                                    }}>
                                        <Typography variant="caption" sx={{ 
                                            textTransform: 'uppercase', 
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.5px',
                                            color: currentMonth.netBalance >= 0 ? '#166534' : '#b91c1c'
                                        }}>Available Balance</Typography>
                                        <Typography variant="h5" sx={{ 
                                            fontWeight: 800, 
                                            fontSize: '1.4rem',
                                            mt: 0.5,
                                            color: currentMonth.netBalance >= 0 ? '#166534' : '#b91c1c'
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
                                    <Paper sx={{ 
                                        p: 2.5, 
                                        borderRadius: 3, 
                                        height: '100%', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,249,255,0.95) 100%)',
                                        border: '1px solid rgba(59, 130, 246, 0.2)',
                                        boxShadow: '0 8px 24px rgba(59, 130, 246, 0.1)',
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: '0 12px 32px rgba(59, 130, 246, 0.2)'
                                        }
                                    }}>
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
                    p: 3.5, 
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.98) 100%)',
                    borderRadius: 3, 
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.15)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <Typography variant="subtitle1" sx={{ textTransform: 'uppercase', fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', mb: 2 }}>
                        🏦 GLOBAL SUMMARY
                    </Typography>
                    <Grid container spacing={3} sx={{ mt: 0.5 }}>
                        <Grid item xs={6} sm={4}>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Credit Added</Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: '#374151', mt: 0.5 }}>
                                    {formatInr(credit.totalCredit)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={6} sm={4}>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Used</Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: '#dc2626', mt: 0.5 }}>
                                    {formatInr(credit.totalUsed)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Balance</Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: '#16a34a', mt: 0.5 }}>
                                    {formatInr(credit.remainingCredit)}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </Box>
            </Stack>

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: 2.5, 
                            borderRadius: 3, 
                            height: '100%',
                            background: 'linear-gradient(135deg, rgba(254, 226, 226, 0.5) 0%, rgba(252, 165, 165, 0.3) 100%)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.12)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 20px rgba(239, 68, 68, 0.18)'
                            }
                        }}>
                        <Typography variant="overline" sx={{ color: '#7f1d1d', fontWeight: 700, fontSize: '0.75rem' }}>📅 This month</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#dc2626', mt: 1 }}>
                            {formatInr(summary.monthTotal)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#991b1b', fontWeight: 600, mt: 0.5, display: 'block' }}>
                            {summary.monthCount} expense{summary.monthCount === 1 ? '' : 's'}
                            {hasActiveFilters ? ' • matches filters' : ''}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: 2.5, 
                            borderRadius: 3, 
                            height: '100%',
                            background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.3) 100%)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            boxShadow: '0 4px 16px rgba(59, 130, 246, 0.12)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.18)'
                            }
                        }}>
                        <Typography variant="overline" sx={{ color: '#1e3a8a', fontWeight: 700, fontSize: '0.75rem' }}>📊 This year</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#dc2626', mt: 1 }}>
                            {formatInr(summary.yearTotal)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#1e40af', fontWeight: 600, mt: 0.5, display: 'block' }}>
                            {summary.yearCount} expense{summary.yearCount === 1 ? '' : 's'}
                            {hasActiveFilters ? ' • matches filters' : ''}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: 2.5, 
                            borderRadius: 3, 
                            height: '100%',
                            background: 'linear-gradient(135deg, rgba(232, 222, 248, 0.5) 0%, rgba(221, 214, 254, 0.3) 100%)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            boxShadow: '0 4px 16px rgba(139, 92, 246, 0.12)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 20px rgba(139, 92, 246, 0.18)'
                            }
                        }}>
                        <Typography variant="overline" sx={{ color: '#4c1d95', fontWeight: 700, fontSize: '0.75rem' }}>
                            {hasActiveFilters ? '🔍 Filtered total' : '📋 Listed total'}
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#7c3aed', mt: 1 }}>
                            {formatInr(summary.filteredTotal)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#5b21b6', fontWeight: 600, mt: 0.5, display: 'block' }}>
                            {summary.filteredCount} in current view
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: 2.5, 
                            borderRadius: 3, 
                            height: '100%',
                            background: 'linear-gradient(135deg, rgba(220, 252, 231, 0.5) 0%, rgba(187, 247, 208, 0.3) 100%)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            boxShadow: '0 4px 16px rgba(34, 197, 94, 0.12)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 20px rgba(34, 197, 94, 0.18)'
                            }
                        }}>
                        <Typography variant="overline" sx={{ color: '#14532d', fontWeight: 700, fontSize: '0.75rem' }}>🏷️ Categories</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#16a34a', mt: 1 }}>
                            {charts.byCategory?.length || 0}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#166534', fontWeight: 600, mt: 0.5, display: 'block' }}>
                            in current view
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper 
                elevation={0}
                sx={{ 
                    p: 2.5, 
                    borderRadius: 3, 
                    mb: 3,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 100%)',
                    border: '1px solid rgba(209, 213, 219, 0.5)',
                    boxShadow: '0 4px 16px rgba(107, 114, 128, 0.08)',
                    backdropFilter: 'blur(10px)'
                }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2, color: '#374151', fontSize: '1.1rem' }}>🔍 Filters</Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontWeight: 600 }}>Date Mode</InputLabel>
                            <Select
                                label="Date Mode"
                                sx={{
                                    borderRadius: 2,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(209, 213, 219, 0.6)'
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(102, 126, 234, 0.5)'
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#667eea',
                                        borderWidth: '2px'
                                    },
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)'
                                }}
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
                                <MenuItem value="None" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>None</MenuItem>
                                <MenuItem value="Single Day" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>Single Day</MenuItem>
                                <MenuItem value="Date Range" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>Date Range</MenuItem>
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
                                InputLabelProps={{ shrink: true, sx: { fontWeight: 600 } }}
                                value={filters.date}
                                onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: 2,
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        '& fieldset': {
                                            borderColor: 'rgba(209, 213, 219, 0.6)'
                                        },
                                        '&:hover fieldset': {
                                            borderColor: 'rgba(102, 126, 234, 0.5)'
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#667eea',
                                            borderWidth: '2px'
                                        }
                                    }
                                }}
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
                                    InputLabelProps={{ shrink: true, sx: { fontWeight: 600 } }}
                                    value={filters.from}
                                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                            '& fieldset': {
                                                borderColor: 'rgba(209, 213, 219, 0.6)'
                                            },
                                            '&:hover fieldset': {
                                                borderColor: 'rgba(102, 126, 234, 0.5)'
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderColor: '#667eea',
                                                borderWidth: '2px'
                                            }
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <TextField
                                    label="To"
                                    type="date"
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ shrink: true, sx: { fontWeight: 600 } }}
                                    value={filters.to}
                                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                            '& fieldset': {
                                                borderColor: 'rgba(209, 213, 219, 0.6)'
                                            },
                                            '&:hover fieldset': {
                                                borderColor: 'rgba(102, 126, 234, 0.5)'
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderColor: '#667eea',
                                                borderWidth: '2px'
                                            }
                                        }
                                    }}
                                />
                            </Grid>
                        </>
                    )}
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontWeight: 600 }}>Paid by</InputLabel>
                            <Select
                                label="Paid by"
                                value={filters.paidBy}
                                onChange={(e) => setFilters((f) => ({ ...f, paidBy: e.target.value }))}
                                sx={{
                                    borderRadius: 2,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(209, 213, 219, 0.6)'
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(102, 126, 234, 0.5)'
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#667eea',
                                        borderWidth: '2px'
                                    },
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)'
                                }}
                            >
                                <MenuItem value="" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>All</MenuItem>
                                {paidByOptionsList.map((name) => (
                                    <MenuItem key={name} value={name} sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontWeight: 600 }}>Category</InputLabel>
                            <Select
                                label="Category"
                                value={filters.category}
                                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                                sx={{
                                    borderRadius: 2,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(209, 213, 219, 0.6)'
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(102, 126, 234, 0.5)'
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#667eea',
                                        borderWidth: '2px'
                                    },
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)'
                                }}
                            >
                                <MenuItem value="" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>All</MenuItem>
                                {CATEGORY_OPTIONS.map((cat) => (
                                    <MenuItem key={cat} value={cat} sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>{cat}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontWeight: 600 }}>Payment method</InputLabel>
                            <Select
                                label="Payment method"
                                value={filters.paymentMethod || ''}
                                onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
                                sx={{
                                    borderRadius: 2,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(209, 213, 219, 0.6)'
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(102, 126, 234, 0.5)'
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#667eea',
                                        borderWidth: '2px'
                                    },
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)'
                                }}
                            >
                                <MenuItem value="" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>All</MenuItem>
                                {PAYMENT_METHODS.map((m) => (
                                    <MenuItem key={m} value={m} sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>{m}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontWeight: 600 }}>Search expenditure name</InputLabel>
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
                                sx={{
                                    borderRadius: 2,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(209, 213, 219, 0.6)'
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(102, 126, 234, 0.5)'
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#667eea',
                                        borderWidth: '2px'
                                    },
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)'
                                }}
                            >
                                <MenuItem value="" sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>All</MenuItem>
                                {NAME_FILTER_OPTIONS.map((name) => (
                                    <MenuItem key={name} value={name} sx={{ fontWeight: 600, '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>{name}</MenuItem>
                                ))}
                                <MenuItem value="__custom__" sx={{ fontWeight: 600, fontStyle: 'italic', '&:hover': { background: 'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(219, 234, 254, 0.5) 100%)' } }}>Search by name...</MenuItem>
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
                                InputLabelProps={{ sx: { fontWeight: 600 } }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: 2,
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        '& fieldset': {
                                            borderColor: 'rgba(209, 213, 219, 0.6)'
                                        },
                                        '&:hover fieldset': {
                                            borderColor: 'rgba(102, 126, 234, 0.5)'
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#667eea',
                                            borderWidth: '2px'
                                        }
                                    }
                                }}
                            />
                        </Grid>
                    )}
                </Grid>
                <Stack direction="row" spacing={2} sx={{ mt: 2.5 }}>
                    <Button 
                        variant="contained" 
                        size="medium"
                        onClick={handleApplyFilters}
                        sx={{
                            px: 3,
                            py: 1,
                            borderRadius: 2,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            boxShadow: '0 4px 12px rgba(118, 75, 162, 0.3)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #5568d3 0%, #653a8a 100%)',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(118, 75, 162, 0.4)'
                            }
                        }}
                    >
                        ✨ Apply Filters
                    </Button>
                    {hasActiveFilters ? (
                        <Button 
                            size="medium" 
                            onClick={handleClearFilters}
                            sx={{
                                px: 3,
                                py: 1,
                                borderRadius: 2,
                                fontWeight: 600,
                                color: '#6b7280',
                                borderColor: 'rgba(209, 213, 219, 0.6)',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    borderColor: '#dc2626',
                                    color: '#dc2626',
                                    backgroundColor: 'rgba(254, 226, 226, 0.3)'
                                }
                            }}
                        >
                            🗑️ Clear filters
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
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: 4, 
                            textAlign: 'center',
                            borderRadius: 3,
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 100%)',
                            border: '1px solid rgba(209, 213, 219, 0.5)',
                            boxShadow: '0 4px 16px rgba(107, 114, 128, 0.08)'
                        }}>
                        <Typography variant="h6" sx={{ color: '#6b7280', fontWeight: 600 }}>📭 No expenses found.</Typography>
                    </Paper>
                ) : (
                    <Stack spacing={1.5}>
                        {paginatedExpenses.map((expense) => (
                            <MobileExpenseCard
                                key={expense._id}
                                expense={expense}
                                onEdit={() => expense.isCredit ? null : startEdit(expense)}
                                onDelete={() => expense.isCredit ? handleDeleteCredit(expense.rawRecord?._id) : handleDelete(expense._id)}
                            />
                        ))}
                        <Paper 
                            elevation={0}
                            sx={{ 
                                p: 2, 
                                borderRadius: 3, 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                                border: '1px solid rgba(209, 213, 219, 0.5)'
                            }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#374151' }}>
                                📊 Total this page ({paginatedExpenses.length})
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 900, color: '#dc2626' }}>
                                {formatInr(paginatedExpenses.filter(e => !e.isCredit).reduce((sum, e) => sum + (Number(e.amount) || 0), 0))}
                            </Typography>
                        </Paper>
                        {totalPages > 1 && (
                            <Stack spacing={1.5}>
                                <Stack direction="row" justifyContent="center" alignItems="center" spacing={2} sx={{ mt: 2 }}>
                                    <FormControl sx={{ minWidth: 120 }} size="small">
                                        <InputLabel>Rows per page</InputLabel>
                                        <Select
                                            value={itemsPerPage}
                                            onChange={(e) => {
                                                setItemsPerPage(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            label="Rows per page"
                                        >
                                            <MenuItem value={50}>50</MenuItem>
                                            <MenuItem value={100}>100</MenuItem>
                                            <MenuItem value={150}>150</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <Pagination
                                        count={totalPages}
                                        page={currentPage}
                                        onChange={(e, value) => setCurrentPage(value)}
                                        color="primary"
                                        size="small"
                                    />
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                                    Page {currentPage} of {totalPages}
                                </Typography>
                            </Stack>
                        )}
                    </Stack>
                )}
            </Box>

            <TableContainer 
                component={Paper} 
                elevation={0}
                sx={{ 
                    display: { xs: 'none', md: 'block' }, 
                    overflowX: 'auto',
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 100%)',
                    border: '1px solid rgba(209, 213, 219, 0.5)',
                    boxShadow: '0 8px 32px rgba(107, 114, 128, 0.12)',
                    backdropFilter: 'blur(10px)'
                }}>
                <Table size="small">
                    <TableHead>
                        <TableRow 
                            sx={{ 
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                '& .MuiTableCell-root': {
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    fontSize: '0.813rem',
                                    letterSpacing: '0.5px',
                                    textTransform: 'uppercase',
                                    borderBottom: 'none',
                                    py: 2
                                }
                            }}>
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
                        {paginatedExpenses.map((expense, idx) => {
                            const isCredit = !!expense.isCredit;
                            const isCashExpense = !isCredit && expense.paymentMethod && expense.paymentMethod.toLowerCase() === 'cash';
                            return (
                                <TableRow 
                                    key={expense._id} 
                                    sx={{ 
                                        bgcolor: isCredit 
                                            ? 'rgba(220, 252, 231, 0.3)' 
                                            : (isCashExpense ? 'rgba(254, 226, 226, 0.3)' : 'transparent'),
                                        transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                                        '&:nth-of-type(even)': {
                                            bgcolor: isCredit 
                                                ? 'rgba(220, 252, 231, 0.4)'
                                                : (isCashExpense ? 'rgba(254, 226, 226, 0.4)' : 'rgba(249, 250, 251, 0.5)')
                                        },
                                        '&:hover': {
                                            bgcolor: isCredit
                                                ? 'rgba(187, 247, 208, 0.6)'
                                                : (isCashExpense ? 'rgba(252, 165, 165, 0.6)' : 'rgba(224, 231, 255, 0.5)'),
                                            boxShadow: '0 0 0 1px rgba(102, 126, 234, 0.2) inset'
                                        },
                                        '& .MuiTableCell-root': {
                                            borderColor: 'rgba(209, 213, 219, 0.4)'
                                        }
                                    }}>
                                    <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>{expense.name}</TableCell>
                                    <TableCell>
                                        {expense.category ? (
                                            <Chip 
                                                size="small" 
                                                label={mapOldCategoryToNew(expense.category)}
                                                sx={{
                                                    fontWeight: 600,
                                                    fontSize: '0.75rem',
                                                    borderRadius: 2,
                                                    background: 'linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%)',
                                                    color: '#3730a3',
                                                    border: '1px solid rgba(99, 102, 241, 0.2)'
                                                }}
                                            />
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.938rem', color: isCredit ? '#16a34a' : '#dc2626' }}>
                                        {formatInr(expense.amount)}
                                    </TableCell>
                                    <TableCell>{expense.paidBy}</TableCell>
                                    <TableCell>
                                        {isCredit ? (
                                            <Chip 
                                                size="small" 
                                                label="✅ Credit" 
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    borderRadius: 2,
                                                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                                                    color: '#14532d',
                                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                                    boxShadow: '0 2px 8px rgba(34, 197, 94, 0.2)'
                                                }}
                                            />
                                        ) : (
                                            <Chip
                                                size="small"
                                                label={expense.paymentMethod || '—'}
                                                sx={{
                                                    fontWeight: 600,
                                                    fontSize: '0.75rem',
                                                    borderRadius: 2,
                                                    ...(isCashExpense ? {
                                                        background: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)',
                                                        color: '#7f1d1d',
                                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)'
                                                    } : {
                                                        background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                                                        color: '#374151',
                                                        border: '1px solid rgba(156, 163, 175, 0.3)'
                                                    })
                                                }}
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
                                            <IconButton 
                                                size="small" 
                                                onClick={() => handleDeleteCredit(expense.rawRecord?._id)} 
                                                sx={{
                                                    color: '#dc2626',
                                                    transition: 'all 0.2s ease',
                                                    '&:hover': {
                                                        background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                                                        transform: 'scale(1.1)',
                                                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                                                    }
                                                }}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        ) : (
                                            <>
                                                <IconButton 
                                                    size="small" 
                                                    onClick={() => startEdit(expense)} 
                                                    sx={{
                                                        color: '#3b82f6',
                                                        transition: 'all 0.2s ease',
                                                        '&:hover': {
                                                            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                                                            transform: 'scale(1.1)',
                                                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                                                        }
                                                    }}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton 
                                                    size="small" 
                                                    onClick={() => handleDelete(expense._id)} 
                                                    sx={{
                                                        color: '#dc2626',
                                                        transition: 'all 0.2s ease',
                                                        '&:hover': {
                                                            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                                                            transform: 'scale(1.1)',
                                                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                                                        }
                                                    }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {paginatedExpenses.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} align="center">No expenses found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    {paginatedExpenses.length > 0 ? (
                        <TableFooter>
                            <TableRow 
                                sx={{ 
                                    background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                                    '& .MuiTableCell-root': {
                                        borderTop: '2px solid rgba(139, 92, 246, 0.3)',
                                        py: 2
                                    }
                                }}>
                                <TableCell
                                    sx={{
                                        fontWeight: 800,
                                        whiteSpace: 'nowrap',
                                        color: '#374151',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    📋 Page Total ({paginatedExpenses.length})
                                </TableCell>
                                <TableCell />
                                <TableCell />
                                <TableCell
                                    align="right"
                                    sx={{
                                        fontWeight: 900,
                                        color: '#dc2626',
                                        whiteSpace: 'nowrap',
                                        fontSize: '1rem'
                                    }}
                                >
                                    {formatInr(paginatedExpenses.filter(e => !e.isCredit).reduce((sum, e) => sum + (Number(e.amount) || 0), 0))}
                                </TableCell>
                                <TableCell colSpan={4} />
                            </TableRow>
                        </TableFooter>
                    ) : null}
                </Table>
            </TableContainer>

            {/* Pagination Controls for Desktop */}
            {displayedExpenses.length > 0 && totalPages > 1 && (
                <Paper
                    elevation={0}
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        mt: 3,
                        p: 2.5,
                        borderRadius: 3,
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 100%)',
                        border: '1px solid rgba(209, 213, 219, 0.5)',
                        boxShadow: '0 4px 16px rgba(107, 114, 128, 0.08)'
                    }}
                >
                    <Stack direction="row" justifyContent="center" alignItems="center" spacing={3}>
                        <FormControl sx={{ minWidth: 140 }} size="small">
                            <InputLabel>Rows per page</InputLabel>
                            <Select
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(e.target.value);
                                    setCurrentPage(1);
                                }}
                                label="Rows per page"
                            >
                                <MenuItem value={50}>50</MenuItem>
                                <MenuItem value={100}>100</MenuItem>
                                <MenuItem value={150}>150</MenuItem>
                            </Select>
                        </FormControl>
                        <Pagination
                            count={totalPages}
                            page={currentPage}
                            onChange={(e, value) => setCurrentPage(value)}
                            color="primary"
                            sx={{
                                '& .MuiPaginationItem-root': {
                                    fontWeight: 600,
                                    '&.Mui-selected': {
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: '#ffffff',
                                        boxShadow: '0 4px 12px rgba(118, 75, 162, 0.3)'
                                    }
                                }
                            }}
                        />
                        <Typography variant="body2" sx={{ minWidth: 180, fontWeight: 600, color: '#6b7280' }}>
                            Page {currentPage} of {totalPages} ({displayedExpenses.length} total)
                        </Typography>
                    </Stack>
                </Paper>
            )}

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
