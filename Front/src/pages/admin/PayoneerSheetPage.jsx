import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    IconButton,
    Tooltip,
    Stack,
    Divider,
    useTheme,
    useMediaQuery,
    Pagination,
    CircularProgress,
    Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Close';
import api from '../../lib/api';
import {
    formatPaymentDateDisplayPt,
    formatYyyyMmDdPt,
    getTodayPtDateString,
    ptYyyyMmDdToIsoString,
} from '../../lib/pacificDate.js';
import { filterSellersLinkedToBankField } from '../../lib/bankAccountSellers.js';
import { bankAccountMenuLabel } from '../../lib/bankAccountLabel.js';

/** MUI menus default to a portal behind modal dialogs; keep them inside the dialog. */
const SELECT_MENU_IN_DIALOG = {
    disablePortal: true,
    PaperProps: { sx: { maxHeight: 360, zIndex: (theme) => theme.zIndex.modal + 2 } },
};

const EMPTY_PAYONEER_FORM = () => ({
    bankAccount: '',
    paymentDate: getTodayPtDateString(),
    amount: '',
    exchangeRate: '',
    store: '',
    periodStart: '',
    periodEnd: '',
    /** Finances payoutId from completed payouts feed / Save row */
    ebayPayoutId: ''
});

/** Max DB rows to merge with eBay feed (client-side sort + pagination). */
const MERGE_FETCH_LIMIT = 1500;

/** First-paint ?bankAccount= so the initial /payoneer request matches the URL (avoids a wasted fetch). */
function getInitialBankAccountQuery() {
    if (typeof window === 'undefined') return '';
    try {
        return new URLSearchParams(window.location.search).get('bankAccount') || '';
    } catch {
        return '';
    }
}

function dbRowDedupeKey(r) {
    const sid = String(r.store?._id || '');
    const d = formatYyyyMmDdPt(r.paymentDate);
    const amt = Number(r.amount);
    if (!sid || !d || Number.isNaN(amt)) return null;
    return `${sid}|${d}|${amt.toFixed(2)}`;
}

function feedRowDedupeKey(f) {
    const sid = String(f.sellerId);
    const d = formatYyyyMmDdPt(f.payoutDate);
    const amt = Number(f.amount);
    if (!sid || !d || Number.isNaN(amt)) return null;
    return `${sid}|${d}|${amt.toFixed(2)}`;
}

const formatUsd = (v) => (Number.isFinite(Number(v)) ? `$${Number(v).toFixed(2)}` : '—');
const formatInr = (v, digits = 2) => (Number.isFinite(Number(v)) ? `₹${Number(v).toFixed(digits)}` : '—');
/** Exchange rate is not currency — show up to 4 decimals (not ₹ with 2dp like bank deposit). */
const formatExchangeRateInr = (v) => formatInr(v, 4);

function buildPayoutFeedLookup(payoutFeedRows) {
    const byExactKey = new Map();
    const bySellerDay = new Map();
    for (const f of payoutFeedRows || []) {
        const k = feedRowDedupeKey(f);
        if (k) byExactKey.set(k, f);
        const sid = String(f.sellerId);
        const day = formatYyyyMmDdPt(f.payoutDate);
        if (sid && day) {
            const sk = `${sid}|${day}`;
            if (!bySellerDay.has(sk)) bySellerDay.set(sk, []);
            bySellerDay.get(sk).push(f);
        }
    }
    return { byExactKey, bySellerDay };
}

/**
 * Payout ID from DB, else match Recently completed feed (same store, local payment day, amount).
 * Handles legacy rows saved before ebayPayoutId existed.
 */
function resolvePayoutIdFromFeed(record, lookup) {
    if (!record || record._fromEbay || !lookup) return null;
    if (record.ebayPayoutId) return record.ebayPayoutId;

    const sid = String(record.store?._id || '');
    const day = formatYyyyMmDdPt(record.paymentDate);
    const amt = Number(record.amount);
    if (!sid || !day || Number.isNaN(amt)) return null;

    const exactKey = `${sid}|${day}|${amt.toFixed(2)}`;
    const exact = lookup.byExactKey.get(exactKey);
    if (exact) return String(exact.payoutId);

    const dayRows = lookup.bySellerDay.get(`${sid}|${day}`) || [];
    const tol = dayRows.filter((f) => Math.abs(Number(f.amount) - amt) < 0.02);
    if (tol.length === 1) return String(tol[0].payoutId);

    if (dayRows.length === 1) return String(dayRows[0].payoutId);
    if (dayRows.length > 1) {
        const best = dayRows.reduce((a, b) =>
            Math.abs(Number(a.amount) - amt) <= Math.abs(Number(b.amount) - amt) ? a : b
        );
        if (Math.abs(Number(best.amount) - amt) <= 1) return String(best.payoutId);
    }

    return null;
}

// --- MOBILE PAYONEER CARD COMPONENT ---
function MobilePayoneerCard({ record, isEditing, displayPayoutId, renderCell, onEdit, onDelete, onSave, onCancel }) {
    return (
        <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1.5}>
                {/* Header Row: Store + Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            STORE
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                            {isEditing ? 'Editing...' : (record.store?.user?.username || 'Unknown')}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={0.5}>
                        {isEditing ? (
                            <>
                                <Tooltip title="Save">
                                    <IconButton color="primary" onClick={onSave} size="small">
                                        <SaveIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Cancel">
                                    <IconButton color="error" onClick={onCancel} size="small">
                                        <CancelIcon />
                                    </IconButton>
                                </Tooltip>
                            </>
                        ) : (
                            <>
                                <Tooltip title="Edit">
                                    <IconButton color="primary" onClick={onEdit} size="small">
                                        <EditIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                    <IconButton color="error" onClick={onDelete} size="small">
                                        <DeleteIcon />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                    </Stack>
                </Stack>

                <Divider />

                {/* Details Grid */}
                <Stack spacing={1.25}>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            BANK ACCOUNT
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>{renderCell(record, 'bankAccount')}</Box>
                    </Box>

                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            PAYMENT DATE
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>{renderCell(record, 'paymentDate', 'date')}</Box>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                AMOUNT ($)
                            </Typography>
                            <Box sx={{ mt: 0.5 }}>{renderCell(record, 'amount', 'number')}</Box>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                EXCHANGE RATE (₹)
                            </Typography>
                            <Box sx={{ mt: 0.5 }}>{renderCell(record, 'exchangeRate', 'number')}</Box>
                        </Box>
                    </Stack>

                    {!isEditing && (
                        <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                                <Box>
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                                        Actual (+2%)
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {formatInr(record.actualExchangeRate, 4)}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                                        Deposit (₹)
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                        {formatInr(record.bankDeposit, 2)}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    )}

                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            PERIOD
                        </Typography>
                        {isEditing ? (
                            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }} value={editFormData?.periodStart || ''} onChange={(e) => handleEditChange('periodStart', e.target.value)} fullWidth />
                                <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }} value={editFormData?.periodEnd || ''} onChange={(e) => handleEditChange('periodEnd', e.target.value)} fullWidth />
                            </Stack>
                        ) : (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                                {record.periodStart ? formatPaymentDateDisplayPt(record.periodStart) : '-'} → {record.periodEnd ? formatPaymentDateDisplayPt(record.periodEnd) : '-'}
                            </Typography>
                        )}
                    </Box>

                    {!isEditing && displayPayoutId && (
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all', display: 'block' }}>
                            eBay payout ID: {displayPayoutId}
                        </Typography>
                    )}
                </Stack>
            </Stack>
        </Paper>
    );
}

const PayoneerSheetPage = () => {
    // Responsive breakpoints
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [records, setRecords] = useState([]);
    const [sellers, setSellers] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [gmailSyncLoading, setGmailSyncLoading] = useState(false);

    const [searchParams, setSearchParams] = useSearchParams();

    // Advanced Filter State
    const [filters, setFilters] = useState(() => ({
        store: '',
        bankAccount: getInitialBankAccountQuery(),
        dateMode: 'none', // 'none', 'single', 'range'
        singleDate: '',
        dateRange: { start: '', end: '' }
    }));

    // Client-side pagination over merged (eBay feed + saved) rows
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50
    });

    const [formData, setFormData] = useState(() => EMPTY_PAYONEER_FORM());

    /** eBay Finances SUCCEEDED payouts (all available history) */
    const [payoutFeedRows, setPayoutFeedRows] = useState([]);
    const [payoutFeedLoading, setPayoutFeedLoading] = useState(false);
    const [payoutFeedError, setPayoutFeedError] = useState('');
    const [payoutFeedCachedAt, setPayoutFeedCachedAt] = useState(null);
    const [payoutFeedCacheEmpty, setPayoutFeedCacheEmpty] = useState(false);

    /** Hint after auto-fill from Bank Accounts + Seller Funds / eBay APIs */
    const [autoFillHint, setAutoFillHint] = useState('');

    // Calculated Preview for "Add New"
    const [preview, setPreview] = useState({
        actualExchangeRate: 0,
        bankDeposit: 0
    });

    // Editing State
    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // Fetch Reference Data on Mount
    useEffect(() => {
        fetchSellers();
        fetchBankAccounts();
    }, []);

    const loadPayoutFeed = useCallback(async (forceRefresh = false) => {
        setPayoutFeedLoading(true);
        setPayoutFeedError('');
        try {
            const { data } = await api.get('/ebay/payoneer-recent-completed-feed', {
                params: forceRefresh ? { forceRefresh: 'true' } : {},
            });
            setPayoutFeedRows(Array.isArray(data.rows) ? data.rows : []);
            setPayoutFeedCachedAt(data?.cache?.cachedAt || null);
            setPayoutFeedCacheEmpty(Boolean(data?.cache?.empty));
            if (forceRefresh && data?.cache?.savedToDatabase) {
                setAutoFillHint('eBay payouts fetched from eBay and saved to the database.');
            }
        } catch (e) {
            const msg =
                e.response?.status === 403
                    ? 'Cannot load eBay payout feed (check page access).'
                    : e.response?.data?.error || e.message;
            setPayoutFeedError(msg);
        } finally {
            setPayoutFeedLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPayoutFeed(false);
    }, [loadPayoutFeed]);

    const payoutFeedLookup = useMemo(() => buildPayoutFeedLookup(payoutFeedRows), [payoutFeedRows]);

    const filteredPayoutFeed = useMemo(() => {
        let rows = payoutFeedRows;
        if (filters.store) {
            rows = rows.filter((r) => String(r.sellerId) === String(filters.store));
        }
        if (filters.bankAccount) {
            rows = rows.filter((r) => String(r.suggestedBankAccountId || '') === String(filters.bankAccount));
        }
        if (filters.dateMode === 'single' && filters.singleDate) {
            const d = filters.singleDate;
            rows = rows.filter((r) => r.payoutDate && formatYyyyMmDdPt(r.payoutDate) === d);
        } else if (filters.dateMode === 'range' && (filters.dateRange.start || filters.dateRange.end)) {
            const startStr = String(filters.dateRange.start || '').trim();
            const endStr = String(filters.dateRange.end || '').trim();
            rows = rows.filter((r) => {
                if (!r.payoutDate) return false;
                const pdStr = formatYyyyMmDdPt(r.payoutDate);
                if (!pdStr) return false;
                if (startStr && pdStr < startStr) return false;
                if (endStr && pdStr > endStr) return false;
                return true;
            });
        }
        return rows;
    }, [payoutFeedRows, filters]);

    // Deep link from Bank Accounts: /admin/payoneer?bankAccount=<id> (keep filter in sync with URL).
    // Return same `filters` reference when ?bankAccount= unchanged so we do not re-fetch /payoneer twice on mount.
    useEffect(() => {
        const bid = searchParams.get('bankAccount') || '';
        setFilters((prev) => {
            if (prev.bankAccount === bid) return prev;
            return { ...prev, bankAccount: bid };
        });
    }, [searchParams]);

    // Fetch all matching saved rows (high limit) when filters change — merge with eBay feed is client-side
    useEffect(() => {
        setPagination((p) => ({ ...p, page: 1 }));
        fetchRecords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const params = {
                page: 1,
                limit: MERGE_FETCH_LIMIT
            };

            // Add Store Filter
            if (filters.store) params.store = filters.store;

            if (filters.bankAccount) params.bankAccount = filters.bankAccount;

            // Add Date Filter based on Mode
            if (filters.dateMode === 'single' && filters.singleDate) {
                params.startDate = filters.singleDate;
                params.endDate = filters.singleDate;
            } else if (filters.dateMode === 'range') {
                if (filters.dateRange.start) params.startDate = filters.dateRange.start;
                if (filters.dateRange.end) params.endDate = filters.dateRange.end;
            }

            const { data } = await api.get('/payoneer', { params });

            if (data.records) {
                setRecords(data.records);
            } else {
                setRecords(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Failed to fetch records:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncGmail = async () => {
        try {
            setGmailSyncLoading(true);
            const { data } = await api.post('/payoneer/import-gmail', { limit: 50 });
            await fetchRecords();
            alert(
                `Gmail sync complete. Updated: ${data?.updated || 0}, Matched: ${data?.matched || 0}, Scanned: ${data?.scanned || 0}, Skipped: ${data?.skipped || 0}`
            );
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to sync Gmail data');
        } finally {
            setGmailSyncLoading(false);
        }
    };

    const mergedRows = useMemo(() => {
        const savedKeys = new Set();
        const savedPayoutIds = new Set();
        for (const r of records) {
            const k = dbRowDedupeKey(r);
            if (k) savedKeys.add(k);
            if (r.ebayPayoutId) savedPayoutIds.add(String(r.ebayPayoutId));
        }

        const ebayMapped = filteredPayoutFeed
            .filter((f) => {
                if (f.payoutId && savedPayoutIds.has(String(f.payoutId))) return false;
                const k = feedRowDedupeKey(f);
                return k && !savedKeys.has(k);
            })
            .map((f) => ({
                _fromEbay: true,
                _feedSource: f,
                _id: `ebay-${f.payoutId}-${f.sellerId}`,
                bankAccount: f.suggestedBankAccountId
                    ? { _id: f.suggestedBankAccountId, name: f.suggestedBankName }
                    : null,
                paymentDate: f.payoutDate,
                store: { _id: f.sellerId, user: { username: f.sellerName } },
                amount: f.amount,
                exchangeRate: null,
                actualExchangeRate: null,
                bankDeposit: null,
                periodStart: null,
                periodEnd: null
            }));

        const combined = [...ebayMapped, ...records];
        combined.sort((a, b) => {
            const ta = new Date(a.paymentDate).getTime();
            const tb = new Date(b.paymentDate).getTime();
            const da = Number.isNaN(ta) ? 0 : ta;
            const dbn = Number.isNaN(tb) ? 0 : tb;
            return dbn - da;
        });
        return combined;
    }, [filteredPayoutFeed, records]);

    const mergedTotalPages = Math.max(1, Math.ceil(mergedRows.length / pagination.limit) || 1);

    const visibleRows = useMemo(() => {
        const start = (pagination.page - 1) * pagination.limit;
        return mergedRows.slice(start, start + pagination.limit);
    }, [mergedRows, pagination.page, pagination.limit]);

    const totals = useMemo(() => {
        return mergedRows.reduce(
            (acc, row) => {
                const amount = Number(row.amount);
                const bankDeposit = Number(row.bankDeposit);
                if (Number.isFinite(amount)) acc.amountUSD += amount;
                if (Number.isFinite(bankDeposit)) acc.bankDepositINR += bankDeposit;
                return acc;
            },
            { amountUSD: 0, bankDepositINR: 0 }
        );
    }, [mergedRows]);

    useEffect(() => {
        if (pagination.page > mergedTotalPages) {
            setPagination((p) => ({ ...p, page: mergedTotalPages }));
        }
    }, [mergedTotalPages, pagination.page]);

    const fetchSellers = async () => {
        try {
            const { data } = await api.get('/sellers/all');
            setSellers(data);
        } catch (error) {
            console.error('Failed to fetch sellers:', error);
        }
    };

    const fetchBankAccounts = async () => {
        try {
            const { data } = await api.get('/bank-accounts');
            setBankAccounts(data);
        } catch (error) {
            console.error('Failed to fetch bank accounts:', error);
        }
    };

    /**
     * Payment date + amount from eBay Finances (same sources as Seller Funds page):
     * 1) Upcoming / recent payouts for the store
     * 2) Else available balance from seller-funds-summary
     */
    /**
     * Same source as Seller Funds Overview → "Recently Completed Payouts (Last 30 Days)":
     * GET /ebay/upcoming-payouts/:sellerId → rows with payoutStatus === 'SUCCEEDED', newest payoutDate first.
     */
    const fillFromSellerFunds = useCallback(async (sellerId) => {
        if (!sellerId) return;
        setAutoFillHint('Loading Seller Funds Overview data…');
        try {
            const { data: summary } = await api.get('/ebay/seller-funds-summary');
            const summaryRow = (Array.isArray(summary) ? summary : []).find(
                (s) => String(s.sellerId) === String(sellerId)
            );
            const mp = summaryRow?.financesMarketplaceId;

            const { data: up } = await api.get(`/ebay/upcoming-payouts/${sellerId}`, {
                params: mp ? { marketplace: mp } : undefined
            });
            const payouts = up.payouts || [];

            const byNewest = (a, b) => new Date(b.payoutDate) - new Date(a.payoutDate);
            const completed = payouts
                .filter((p) => p.payoutStatus === 'SUCCEEDED')
                .sort(byNewest);
            const pickCompleted = completed[0];

            const bySoonestInitiated = (a, b) => new Date(a.payoutDate) - new Date(b.payoutDate);
            const initiated = payouts
                .filter((p) => p.payoutStatus === 'INITIATED')
                .sort(bySoonestInitiated);
            const pickInitiated = initiated[0];

            const pick = pickCompleted || pickInitiated;

            if (pick) {
                const payDate = pick.payoutDate ? formatYyyyMmDdPt(new Date(pick.payoutDate)) : '';
                const amt = pick.amount?.value != null ? String(parseFloat(pick.amount.value)) : '';
                const pid = pick.payoutId != null && pick.payoutId !== '' ? String(pick.payoutId) : '';
                setFormData((prev) => ({
                    ...prev,
                    paymentDate: payDate || prev.paymentDate,
                    amount: amt || prev.amount,
                    ...(pid ? { ebayPayoutId: pid } : {})
                }));
                if (pickCompleted) {
                    setAutoFillHint(
                        'Payment date and amount match Seller Funds Overview — top row of Recently Completed Payouts.'
                    );
                } else {
                    setAutoFillHint(
                        'No completed payout in window; using upcoming payout from Seller Funds (INITIATED). Adjust if needed.'
                    );
                }
                return;
            }

            if (summaryRow?.availableFunds?.value != null) {
                setFormData((prev) => ({
                    ...prev,
                    amount: String(parseFloat(summaryRow.availableFunds.value)),
                    ebayPayoutId: ''
                }));
                setAutoFillHint(
                    'No payouts in Seller Funds list; amount prefilled from available balance on Seller Funds Overview. Set payment date manually.'
                );
                return;
            }

            setAutoFillHint('No payout or balance row found in Seller Funds; enter amount and date manually.');
        } catch (e) {
            const msg =
                e.response?.status === 403
                    ? 'Cannot read Seller Funds APIs (need access). Enter payment date and amount manually.'
                    : 'Could not auto-fill from eBay. Enter values manually.';
            setAutoFillHint(msg);
        }
    }, []);

    const runBankAccountLinkedAutoFill = useCallback(
        async (bankId) => {
            if (!bankId || !sellers.length) return;
            const acc = bankAccounts.find((a) => String(a._id) === String(bankId));
            if (!acc) return;
            const matched = filterSellersLinkedToBankField(acc, sellers);
            if (matched.length === 1) {
                const sid = matched[0]._id;
                setFormData((prev) => ({ ...prev, store: sid }));
                await fillFromSellerFunds(sid);
            } else if (matched.length === 0 && acc.sellers?.trim()) {
                setAutoFillHint(
                    'Bank account "Sellers" text did not match any store username — pick Store manually to load amounts.'
                );
            } else if (matched.length > 1) {
                setAutoFillHint('Multiple stores match this bank account — choose Store to load payment date and amount.');
            }
        },
        [bankAccounts, sellers, fillFromSellerFunds]
    );

    const openAddDialog = useCallback(() => {
        const bid = searchParams.get('bankAccount') || filters.bankAccount || '';
        setAutoFillHint('');
        setFormData({
            ...EMPTY_PAYONEER_FORM(),
            bankAccount: bid,
            paymentDate: getTodayPtDateString()
        });
        setOpenDialog(true);
    }, [searchParams, filters.bankAccount]);

    const openAddFromFeedRow = useCallback((row) => {
        setAutoFillHint('Prefilled from eBay Recently completed payout. Enter exchange rate, then save.');
        setFormData({
            ...EMPTY_PAYONEER_FORM(),
            bankAccount: row.suggestedBankAccountId ? String(row.suggestedBankAccountId) : '',
            store: String(row.sellerId),
            paymentDate: row.payoutDate ? formatYyyyMmDdPt(new Date(row.payoutDate)) : '',
            amount: Number.isFinite(row.amount) ? String(row.amount) : '',
            ebayPayoutId: row.payoutId != null && row.payoutId !== '' ? String(row.payoutId) : ''
        });
        setOpenDialog(true);
    }, []);

    // After Add dialog opens: auto-match store from Bank Accounts "Sellers" + pull payout/amount from Seller Funds APIs
    useEffect(() => {
        if (!openDialog || !formData.bankAccount || !sellers.length) return;
        if (formData.ebayPayoutId) return;
        void runBankAccountLinkedAutoFill(formData.bankAccount);
    }, [openDialog, formData.bankAccount, formData.ebayPayoutId, sellers.length, runBankAccountLinkedAutoFill]);

    // Update calculations when Amount or Rate changes (for Add Dialog)
    useEffect(() => {
        const amount = parseFloat(formData.amount) || 0;
        const rate = parseFloat(formData.exchangeRate) || 0;
        const actualRate = rate + (rate * 0.02);
        const deposit = amount * rate;

        setPreview({
            actualExchangeRate: actualRate,
            bankDeposit: deposit
        });
    }, [formData.amount, formData.exchangeRate]);



    const handleCreate = async () => {
        try {
            setLoading(true);
            const payload = { ...formData };
            if (!payload.ebayPayoutId?.trim()) delete payload.ebayPayoutId;
            if (payload.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.paymentDate).trim())) {
                payload.paymentDate = ptYyyyMmDdToIsoString(payload.paymentDate.trim());
            }
            await api.post('/payoneer', payload);
            setOpenDialog(false);
            setAutoFillHint('');
            fetchRecords();
            setFormData(EMPTY_PAYONEER_FORM());
        } catch (error) {
            alert('Failed to create: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        try {
            await api.delete(`/payoneer/${id}`);
            await fetchRecords();
        } catch (error) {
            console.error(error);
        }
    };

    // --- EDITING LOGIC ---

    const startEditing = (record) => {
        if (record._fromEbay) return;
        setEditingId(record._id);
        setEditFormData({
            bankAccount: record.bankAccount?._id,
            paymentDate: record.paymentDate ? formatYyyyMmDdPt(record.paymentDate) : '',
            amount: record.amount,
            exchangeRate: record.exchangeRate,
            store: record.store?._id,
            periodStart: record.periodStart ? record.periodStart.split('T')[0] : '',
            periodEnd: record.periodEnd ? record.periodEnd.split('T')[0] : ''
        });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditFormData({});
    };

    const handleEditChange = (field, value) => {
        setEditFormData(prev => ({ ...prev, [field]: value }));
    };

    const saveEdit = async () => {
        try {
            const payload = { ...editFormData };
            if (payload.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.paymentDate).trim())) {
                payload.paymentDate = ptYyyyMmDdToIsoString(payload.paymentDate.trim());
            }
            await api.put(`/payoneer/${editingId}`, payload);
            setEditingId(null);
            fetchRecords();
        } catch (error) {
            alert('Failed to update: ' + (error.response?.data?.error || error.message));
        }
    };

    // Render a cell that is text normally, but an input when editing
    const renderCell = (record, field, type = 'text') => {
        if (record._fromEbay) {
            if (field === 'bankAccount') return record.bankAccount?.name || '—';
            if (field === 'store') return record.store?.user?.username || '—';
            if (field === 'amount') return formatUsd(record.amount);
            if (field === 'paymentDate') return record.paymentDate ? formatPaymentDateDisplayPt(record.paymentDate) : '—';
            if (field === 'exchangeRate') return '—';
            return '—';
        }
        const isEditing = editingId === record._id;
        let value = isEditing ? editFormData[field] : (field === 'store' ? (record.store?.user?.username || 'Unknown') : record[field]);

        if (!isEditing && field === 'bankAccount') {
            value = record.bankAccount?.name || 'Unknown';
        }

        if (!isEditing) {
            if (field === 'amount') return formatUsd(value);
            if (field === 'bankDeposit') return formatInr(value, 2);
            if (field === 'exchangeRate') return formatExchangeRateInr(value);
            if (field === 'actualExchangeRate') return formatInr(value, 4);
            if (field === 'paymentDate') return formatPaymentDateDisplayPt(value);
            if (field === 'periodStart' || field === 'periodEnd') return value ? formatPaymentDateDisplayPt(value) : '-';
            return value;
        }

        if (field === 'bankAccount') {
            return (
                <TextField
                    select
                    size="small"
                    value={editFormData.bankAccount || ''}
                    onChange={(e) => handleEditChange('bankAccount', e.target.value)}
                    sx={{ minWidth: 150 }}
                >
                    {bankAccounts.map((acc) => (
                        <MenuItem key={acc._id} value={acc._id}>
                            {bankAccountMenuLabel(acc)}
                        </MenuItem>
                    ))}
                </TextField>
            );
        }

        if (field === 'store') {
            return (
                <TextField
                    select
                    size="small"
                    value={editFormData.store || ''}
                    onChange={(e) => handleEditChange('store', e.target.value)}
                    sx={{ minWidth: 120 }}
                >
                    {sellers.map((seller) => (
                        <MenuItem key={seller._id} value={seller._id}>
                            {seller.user?.username || seller.user?.email}
                        </MenuItem>
                    ))}
                </TextField>
            );
        }

        const numberInputProps = field === 'exchangeRate'
            ? { step: 'any', inputMode: 'decimal' }
            : undefined;

        return (
            <TextField
                type={type}
                size="small"
                value={value}
                onChange={(e) => handleEditChange(field, e.target.value)}
                sx={{ maxWidth: field === 'exchangeRate' ? 120 : 100 }}
                inputProps={numberInputProps}
            />
        );
    };

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: { xs: 1, sm: 2 },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    mb: { xs: 2, sm: 3 }
                }}
            >
                <Typography variant={isSmallMobile ? 'h6' : 'h5'} sx={{ fontWeight: 'bold' }}>
                    Payoneer Sheet
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                        variant="outlined"
                        startIcon={payoutFeedLoading ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
                        onClick={() => loadPayoutFeed(true)}
                        disabled={payoutFeedLoading}
                        fullWidth={isSmallMobile}
                    >
                        {payoutFeedLoading ? 'Refreshing eBay…' : 'Refresh eBay payouts'}
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<SyncIcon />}
                        onClick={handleSyncGmail}
                        disabled={gmailSyncLoading}
                        fullWidth={isSmallMobile}
                    >
                        {gmailSyncLoading ? 'Syncing Gmail…' : 'Sync Gmail'}
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<AccountBalanceIcon />}
                        component={RouterLink}
                        to="/admin/bank-accounts"
                        fullWidth={isSmallMobile}
                    >
                        Bank accounts
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<ReceiptLongIcon />}
                        component={RouterLink}
                        to={
                            filters.bankAccount
                                ? `/admin/transactions?bankAccount=${filters.bankAccount}`
                                : '/admin/transactions'
                        }
                        fullWidth={isSmallMobile}
                    >
                        Transactions
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={openAddDialog}
                        fullWidth={isSmallMobile}
                    >
                        Add Record
                    </Button>
                </Stack>
            </Box>

            {/* ADVANCED FILTERS */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
                        {/* Store Filter */}
                        <TextField
                            select
                            label="Store"
                            size="small"
                            value={filters.store}
                            onChange={(e) => setFilters(prev => ({ ...prev, store: e.target.value }))}
                            sx={{ minWidth: 150 }}
                        >
                            <MenuItem value="">
                                <em>All Stores</em>
                            </MenuItem>
                            {sellers.map((s) => (
                                <MenuItem key={s._id} value={s._id}>
                                    {s.user?.username || s.user?.email || 'Unknown'}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            select
                            label="Bank account"
                            size="small"
                            value={filters.bankAccount}
                            onChange={(e) => {
                                const v = e.target.value;
                                setFilters((prev) => ({ ...prev, bankAccount: v }));
                                setPagination((prev) => ({ ...prev, page: 1 }));
                                const next = new URLSearchParams(searchParams);
                                if (v) next.set('bankAccount', v);
                                else next.delete('bankAccount');
                                setSearchParams(next, { replace: true });
                            }}
                            sx={{ minWidth: 180 }}
                        >
                            <MenuItem value="">
                                <em>All bank accounts</em>
                            </MenuItem>
                            {bankAccounts.map((acc) => (
                                <MenuItem key={acc._id} value={acc._id}>
                                    {bankAccountMenuLabel(acc)}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* Date Mode Selector */}
                        <TextField
                            select
                            label="Date Mode"
                            size="small"
                            value={filters.dateMode}
                            onChange={(e) => setFilters(prev => ({ ...prev, dateMode: e.target.value }))}
                            sx={{ minWidth: 120 }}
                        >
                            <MenuItem value="none">None</MenuItem>
                            <MenuItem value="single">Single Date</MenuItem>
                            <MenuItem value="range">Date Range</MenuItem>
                        </TextField>

                        {/* Conditional Date Inputs */}
                        {filters.dateMode === 'single' && (
                            <TextField
                                label="Date"
                                type="date"
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={filters.singleDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, singleDate: e.target.value }))}
                            />
                        )}

                        {filters.dateMode === 'range' && (
                            <>
                                <TextField
                                    label="From"
                                    type="date"
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    value={filters.dateRange.start}
                                    onChange={(e) => setFilters(prev => ({
                                        ...prev,
                                        dateRange: { ...prev.dateRange, start: e.target.value }
                                    }))}
                                />
                                <TextField
                                    label="To"
                                    type="date"
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    value={filters.dateRange.end}
                                    onChange={(e) => setFilters(prev => ({
                                        ...prev,
                                        dateRange: { ...prev.dateRange, end: e.target.value }
                                    }))}
                                />
                            </>
                        )}

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                                setFilters({
                                    store: '',
                                    bankAccount: '',
                                    dateMode: 'none',
                                    singleDate: '',
                                    dateRange: { start: '', end: '' }
                                });
                                setPagination(prev => ({ ...prev, page: 1 }));
                                setSearchParams({}, { replace: true });
                            }}
                        >
                            Clear Filters
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {loading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <CircularProgress size={22} />
                    <Typography variant="body2" color="text.secondary">
                        Loading saved Payoneer records…
                    </Typography>
                </Box>
            )}
            {payoutFeedLoading && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    {payoutFeedCacheEmpty
                        ? 'Fetching from eBay and saving to database (first time or refresh)…'
                        : 'Refreshing eBay payouts from eBay…'}
                </Alert>
            )}
            {payoutFeedError && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {payoutFeedError}
                </Alert>
            )}
            {payoutFeedCacheEmpty && !payoutFeedLoading && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    No eBay payout data in the database yet. Click <strong>Refresh eBay payouts</strong> once — results are saved to MongoDB and load instantly on future visits.
                </Alert>
            )}

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                eBay SUCCEEDED payouts appear here; use Save row to enter exchange rate and save to your book.
                {payoutFeedCachedAt && !payoutFeedCacheEmpty ? (
                    <>
                        {' '}
                        (Loaded from database
                        {payoutFeedCachedAt
                            ? ` · last saved ${formatPaymentDateDisplayPt(payoutFeedCachedAt)}`
                            : ''}
                        .)
                    </>
                ) : null}
            </Typography>

            {isMobile ? (
                // MOBILE CARD VIEW
                <Box sx={{ mt: { xs: 1.5, sm: 2 } }}>
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: 'action.hover' }}>
                        <Stack direction="row" justifyContent="space-between" spacing={2}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                TOTAL Amount (USD): ${totals.amountUSD.toFixed(2)}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                TOTAL Bank Deposit (INR): ₹{totals.bankDepositINR.toFixed(2)}
                            </Typography>
                        </Stack>
                    </Paper>
                    <Stack spacing={1.5}>
                        {visibleRows.map((record) => {
                            if (record._fromEbay) {
                                const f = record._feedSource;
                                return (
                                    <Paper
                                        key={record._id}
                                        elevation={2}
                                        sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            borderLeft: 4,
                                            borderColor: 'divider',
                                            bgcolor: 'action.hover'
                                        }}
                                    >
                                        <Stack spacing={1.25}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ minWidth: 0 }}>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                                                        {record.store?.user?.username || '—'}
                                                    </Typography>
                                                </Stack>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    startIcon={<AddIcon />}
                                                    onClick={() => openAddFromFeedRow(f)}
                                                >
                                                    Save row
                                                </Button>
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">
                                                Bank (suggested): {record.bankAccount?.name || '—'}
                                            </Typography>
                                            <Typography variant="body2">
                                                {record.paymentDate ? formatPaymentDateDisplayPt(record.paymentDate) : '—'} ·{' '}
                                                {formatUsd(record.amount)}{' '}
                                                {f?.currency || 'USD'}
                                            </Typography>
                                            <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                                                Payout ID: {f?.payoutId}
                                            </Typography>
                                        </Stack>
                                    </Paper>
                                );
                            }
                            const isEditing = editingId === record._id;
                            return (
                                <MobilePayoneerCard
                                    key={record._id}
                                    record={record}
                                    isEditing={isEditing}
                                    displayPayoutId={resolvePayoutIdFromFeed(record, payoutFeedLookup)}
                                    renderCell={renderCell}
                                    onEdit={() => startEditing(record)}
                                    onDelete={() => handleDelete(record._id)}
                                    onSave={saveEdit}
                                    onCancel={cancelEditing}
                                />
                            );
                        })}

                        {visibleRows.length === 0 && !loading && !payoutFeedLoading && (
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    {mergedRows.length === 0
                                        ? payoutFeedError
                                            ? 'No rows — fix the eBay feed warning above if needed.'
                                            : 'No records found.'
                                        : 'No rows on this page.'}
                                </Typography>
                            </Paper>
                        )}
                    </Stack>
                </Box>
            ) : (
                // DESKTOP TABLE VIEW
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Bank Account</TableCell>
                                <TableCell>Payment Date</TableCell>
                                <TableCell>Store</TableCell>
                                <TableCell>Amount (USD)</TableCell>
                                <TableCell>Exch. Rate</TableCell>
                                <TableCell>Actual Rate (+2%)</TableCell>
                                <TableCell>Bank Deposit (INR)</TableCell>
                                <TableCell>Period</TableCell>
                                <TableCell>Payout ID</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleRows.map((record) => {
                                if (record._fromEbay) {
                                    const f = record._feedSource;
                                    return (
                                        <TableRow key={record._id} sx={{ bgcolor: 'action.hover' }}>
                                            <TableCell>
                                                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                                                    <Typography variant="body2" component="span">
                                                        {record.bankAccount?.name || '—'}
                                                    </Typography>
                                                </Stack>
                                            </TableCell>
                                            <TableCell>{renderCell(record, 'paymentDate', 'date')}</TableCell>
                                            <TableCell>{record.store?.user?.username || '—'}</TableCell>
                                            <TableCell>{renderCell(record, 'amount', 'number')}</TableCell>
                                            <TableCell>—</TableCell>
                                            <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                            <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                            <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ wordBreak: 'break-all', display: 'block', fontFamily: 'ui-monospace, monospace' }}>
                                                    {f?.payoutId || '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Prefill Add Record — enter exchange rate to save">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        startIcon={<AddIcon />}
                                                        onClick={() => openAddFromFeedRow(f)}
                                                    >
                                                        Save row
                                                    </Button>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }
                                const isEditing = editingId === record._id;
                                return (
                                    <TableRow key={record._id}>
                                        <TableCell>{renderCell(record, 'bankAccount')}</TableCell>
                                        <TableCell>{renderCell(record, 'paymentDate', 'date')}</TableCell>
                                        <TableCell>{renderCell(record, 'store')}</TableCell>
                                        <TableCell>{renderCell(record, 'amount', 'number')}</TableCell>
                                        <TableCell>{renderCell(record, 'exchangeRate', 'number')}</TableCell>

                                        {/* Calculated fields are READ-ONLY even in edit mode (server calculates them) */}
                                        <TableCell sx={{ bgcolor: isEditing ? '#f8f9fa' : 'inherit', color: 'text.secondary' }}>
                                            {isEditing ? 'Auto-calc' : formatInr(record.actualExchangeRate, 4)}
                                        </TableCell>
                                        <TableCell sx={{ bgcolor: isEditing ? '#f8f9fa' : 'inherit', color: 'text.secondary', fontWeight: 'bold' }}>
                                            {isEditing ? 'Auto-calc' : formatInr(record.bankDeposit, 2)}
                                        </TableCell>

                                        {/* Period range */}
                                        <TableCell>
                                            {isEditing ? (
                                                <Stack spacing={0.5}>
                                                    <TextField
                                                        type="date"
                                                        size="small"
                                                        label="From"
                                                        InputLabelProps={{ shrink: true }}
                                                        value={editFormData.periodStart || ''}
                                                        onChange={(e) => handleEditChange('periodStart', e.target.value)}
                                                        sx={{ width: 150 }}
                                                    />
                                                    <TextField
                                                        type="date"
                                                        size="small"
                                                        label="To"
                                                        InputLabelProps={{ shrink: true }}
                                                        value={editFormData.periodEnd || ''}
                                                        onChange={(e) => handleEditChange('periodEnd', e.target.value)}
                                                        sx={{ width: 150 }}
                                                    />
                                                </Stack>
                                            ) : (
                                                <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                                                    {record.periodStart ? formatPaymentDateDisplayPt(record.periodStart) : '-'}
                                                    {' → '}
                                                    {record.periodEnd ? formatPaymentDateDisplayPt(record.periodEnd) : '-'}
                                                </Typography>
                                            )}
                                        </TableCell>

                                        <TableCell>
                                            {(() => {
                                                const displayPid = resolvePayoutIdFromFeed(record, payoutFeedLookup);
                                                const inner = (
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            wordBreak: 'break-all',
                                                            display: 'block',
                                                            fontFamily: 'ui-monospace, monospace'
                                                        }}
                                                    >
                                                        {displayPid}
                                                    </Typography>
                                                );
                                                if (!displayPid) {
                                                    return (
                                                        <Typography component="span" sx={{ color: 'text.secondary' }}>
                                                            —
                                                        </Typography>
                                                    );
                                                }
                                                if (record.ebayPayoutId) return inner;
                                                return (
                                                    <Tooltip title="Matched from eBay Recently completed payouts">
                                                        {inner}
                                                    </Tooltip>
                                                );
                                            })()}
                                        </TableCell>

                                        <TableCell align="right">
                                            {isEditing ? (
                                                <>
                                                    <Tooltip title="Save">
                                                        <IconButton color="primary" onClick={saveEdit}>
                                                            <SaveIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Cancel">
                                                        <IconButton color="error" onClick={cancelEditing}>
                                                            <CancelIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            ) : (
                                                <>
                                                    <Tooltip title="Edit">
                                                        <IconButton color="primary" size="small" onClick={() => startEditing(record)}>
                                                            <EditIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                        <IconButton color="error" size="small" onClick={() => handleDelete(record._id)}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {visibleRows.length === 0 && !loading && !payoutFeedLoading && (
                                <TableRow>
                                    <TableCell colSpan={10} align="center">
                                        {mergedRows.length === 0
                                            ? payoutFeedError
                                                ? 'No rows — fix the eBay feed warning above if needed.'
                                                : 'No records found.'
                                            : 'No rows on this page.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {mergedRows.length > 0 && (
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>
                                        TOTAL
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        {formatUsd(totals.amountUSD)}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        {formatInr(totals.bankDepositINR)}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* PAGINATION */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Pagination
                    count={mergedTotalPages}
                    page={pagination.page}
                    onChange={(e, value) => setPagination((prev) => ({ ...prev, page: value }))}
                    color="primary"
                    showFirstButton
                    showLastButton
                />
            </Box>

            {/* CREATE DIALOG */}
            <Dialog
                open={openDialog}
                onClose={() => {
                    setOpenDialog(false);
                    setAutoFillHint('');
                }}
                maxWidth="sm"
                fullWidth
                fullScreen={isSmallMobile}
                slotProps={{
                    paper: { sx: { overflow: 'visible' } },
                }}
            >
                <DialogTitle>Add Payoneer Record</DialogTitle>
                <DialogContent sx={{ overflow: 'visible' }}>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        {autoFillHint && (
                            <Alert severity="info" onClose={() => setAutoFillHint('')}>
                                {autoFillHint}
                            </Alert>
                        )}
                        <TextField
                            select
                            label="Bank Account"
                            fullWidth
                            SelectProps={{ MenuProps: SELECT_MENU_IN_DIALOG }}
                            value={formData.bankAccount}
                            onChange={(e) => {
                                const v = e.target.value;
                                setFormData((prev) => ({
                                    ...prev,
                                    bankAccount: v,
                                    store: '',
                                    amount: '',
                                    ebayPayoutId: ''
                                }));
                                setAutoFillHint('');
                            }}
                        >
                            {bankAccounts.map((acc) => (
                                <MenuItem key={acc._id} value={acc._id}>
                                    {bankAccountMenuLabel(acc)}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* Store Name Selection — filtered by Sellers field on Bank Accounts when set */}
                        <TextField
                            select
                            label="Store Name"
                            fullWidth
                            SelectProps={{ MenuProps: SELECT_MENU_IN_DIALOG }}
                            value={formData.store}
                            onChange={(e) => {
                                const v = e.target.value;
                                setFormData((prev) => ({ ...prev, store: v, ebayPayoutId: '' }));
                                setAutoFillHint('');
                                if (v) void fillFromSellerFunds(v);
                            }}
                        >
                            {(formData.bankAccount
                                ? (() => {
                                      const b = bankAccounts.find((a) => String(a._id) === String(formData.bankAccount));
                                      const filtered = b ? filterSellersLinkedToBankField(b, sellers) : sellers;
                                      return filtered.length ? filtered : sellers;
                                  })()
                                : sellers
                            ).map((seller) => (
                                <MenuItem key={seller._id} value={seller._id}>
                                    {seller.user?.username || seller.user?.email}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            label="Payment Date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={formData.paymentDate}
                            onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                            helperText="Calendar date is US Pacific (America/Los_Angeles)."
                        />

                        {formData.ebayPayoutId ? (
                            <TextField
                                label="eBay payout ID (Recently completed)"
                                fullWidth
                                value={formData.ebayPayoutId}
                                InputProps={{ readOnly: true }}
                                helperText="From eBay Finances; stored with this row."
                            />
                        ) : null}

                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                            <TextField
                                label="Amount ($)"
                                type="number"
                                fullWidth
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            />
                            <TextField
                                label="Exchange Rate (₹)"
                                type="number"
                                fullWidth
                                value={formData.exchangeRate}
                                onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })}
                                inputProps={{ step: 'any', inputMode: 'decimal' }}
                                helperText="Up to 4 decimal places (e.g. 85.1234)"
                            />
                        </Stack>

                        {/* PREVIEW OF CALCULATIONS */}
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                            <Typography variant="subtitle2" gutterBottom>Calculated Preview:</Typography>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2">Actual Rate (+2%): <b>{preview.actualExchangeRate?.toFixed(4)}</b></Typography>
                                <Typography variant="body2">Bank Deposit: <b>{preview.bankDeposit?.toFixed(2)}</b></Typography>
                            </Box>
                        </Paper>

                        {/* Period Range */}
                        <Typography variant="subtitle2" sx={{ mb: -1 }}>Period (optional)</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                            <TextField
                                label="From"
                                type="date"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={formData.periodStart}
                                onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                            />
                            <TextField
                                label="To"
                                type="date"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={formData.periodEnd}
                                onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                            />
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: { xs: 1, sm: 2 }, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' } }}>
                    <Button onClick={() => setOpenDialog(false)} fullWidth={isSmallMobile}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        variant="contained"
                        disabled={loading}
                        fullWidth={isSmallMobile}
                    >
                        {loading ? 'Saving...' : 'Save Record'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default PayoneerSheetPage;
