import { useState, useEffect, useCallback } from 'react';
import { alpha } from '@mui/material/styles';
import {
    Box, Typography, Stack, Chip, Table, Fade,
    TableBody, TableCell, TableContainer, TableHead, TableRow,
    Tooltip, Button, Collapse, IconButton, LinearProgress, CircularProgress,
    Checkbox, Dialog, DialogTitle, DialogContent, DialogActions,
    Snackbar, Alert, Pagination, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import {
    tableHeaderCellSx,
    tableBodyRowSx,
    tableBodyCellSx,
    tableContainerSx,
    tableIndexBadgeSx,
    yellowFilledButtonSx,
    yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

const T = dashboardSignatureTokens;

// ─── Time-left helpers ───────────────────────────────────────────────────────
function formatTimeLeft(endTime) {
    if (!endTime) return null;
    const ms = new Date(endTime).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const totalMins = Math.floor(ms / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    if (h < 24) return `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function timeLeftTone(endTime) {
    if (!endTime) return 'neutral';
    const h = (new Date(endTime).getTime() - Date.now()) / 3600000;
    if (h < 0)  return 'neutral';
    if (h < 1)  return 'danger';
    if (h < 24) return 'warning';
    return 'info';
}

// ─── Tone chip helper ────────────────────────────────────────────────────────
function ToneChip({ label, tone = 'neutral', size = 'small', sx = {} }) {
    const t = T.tones[tone] || T.tones.neutral;
    return (
        <Chip
            label={label}
            size={size}
            sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                bgcolor: t.background,
                color: t.color,
                border: `1px solid ${t.border}`,
                '& .MuiChip-label': { px: 1 },
                ...sx,
            }}
        />
    );
}

// ─── ItemRow ─────────────────────────────────────────────────────────────────
function ItemRow({ itemId, title, orderCount, endTime, loadingEndTimes, endTimesFetched, selected, onToggle }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(itemId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const hasOrders = orderCount > 0;
    return (
        <Box
            display="flex"
            alignItems="center"
            gap={1}
            py={0.4}
            px={1}
            borderRadius={1.5}
            onClick={() => onToggle(itemId)}
            sx={{
                cursor: 'pointer',
                transition: 'background 0.15s',
                bgcolor: selected ? alpha(BRAND_YELLOW, 0.14) : 'transparent',
                '&:hover': {
                    bgcolor: selected ? alpha(BRAND_YELLOW, 0.22) : alpha(BRAND_DARK, 0.04),
                },
            }}
        >
            <Checkbox
                size="small"
                checked={selected}
                onChange={() => onToggle(itemId)}
                onClick={e => e.stopPropagation()}
                sx={{
                    p: 0.3,
                    color: alpha(BRAND_DARK, 0.35),
                    '&.Mui-checked': { color: BRAND_DARK },
                }}
            />
            <Tooltip title={copied ? 'Copied!' : 'Copy Item ID'}>
                <IconButton size="small" onClick={handleCopy} sx={{ p: 0.4 }}>
                    <ContentCopyIcon sx={{ fontSize: 13, color: copied ? T.tones.success.color : alpha(BRAND_DARK, 0.35) }} />
                </IconButton>
            </Tooltip>
            <Typography
                variant="caption"
                fontFamily="'JetBrains Mono', 'Fira Mono', monospace"
                sx={{ minWidth: 124, color: BRAND_DARK, fontWeight: 600, letterSpacing: 0.3 }}
            >
                {itemId}
            </Typography>
            <ToneChip
                label={hasOrders ? `${orderCount} order${orderCount !== 1 ? 's' : ''}` : 'No orders'}
                tone={hasOrders ? 'success' : 'neutral'}
                sx={{ height: 20, fontSize: '0.65rem' }}
            />

            {/* Time left — spinner while fetching, bold badge once loaded */}
            {loadingEndTimes && !endTime ? (
                <Tooltip title="Fetching end time…">
                    <Box display="flex" alignItems="center" sx={{ ml: 0.5 }}>
                        <CircularProgress size={11} thickness={5} sx={{ color: alpha(BRAND_DARK, 0.3) }} />
                    </Box>
                </Tooltip>
            ) : endTime ? (
                <Tooltip title={`Ends: ${new Date(endTime).toLocaleString()}`}>
                    <Box
                        display="flex"
                        alignItems="center"
                        gap={0.4}
                        sx={{
                            ml: 0.5,
                            px: 0.9,
                            py: 0.15,
                            borderRadius: 99,
                            bgcolor: T.tones[timeLeftTone(endTime)]?.background ?? alpha(BRAND_DARK, 0.06),
                            border: `1px solid ${T.tones[timeLeftTone(endTime)]?.border ?? alpha(BRAND_DARK, 0.12)}`,
                        }}
                    >
                        <AccessTimeIcon sx={{ fontSize: 11, color: T.tones[timeLeftTone(endTime)]?.color ?? alpha(BRAND_DARK, 0.5) }} />
                        <Typography
                            sx={{
                                fontWeight: 900,
                                fontSize: '0.75rem',
                                lineHeight: 1,
                                letterSpacing: 0.2,
                                color: T.tones[timeLeftTone(endTime)]?.color ?? alpha(BRAND_DARK, 0.7),
                                fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                            }}
                        >
                            {formatTimeLeft(endTime)}
                        </Typography>
                    </Box>
                </Tooltip>
            ) : endTimesFetched ? (
                <Tooltip title="eBay returned no listing data — item is likely inactive or removed">
                    <Box
                        display="flex"
                        alignItems="center"
                        gap={0.4}
                        sx={{
                            ml: 0.5,
                            px: 0.9,
                            py: 0.15,
                            borderRadius: 99,
                            bgcolor: alpha(BRAND_DARK, 0.05),
                            border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
                        }}
                    >
                        <Typography
                            sx={{
                                fontWeight: 700,
                                fontSize: '0.68rem',
                                lineHeight: 1,
                                letterSpacing: 0.2,
                                color: alpha(BRAND_DARK, 0.35),
                                fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                            }}
                        >
                            Inactive
                        </Typography>
                    </Box>
                </Tooltip>
            ) : null}
            {title && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 360, ml: 0.5 }}>
                    — {title}
                </Typography>
            )}
        </Box>
    );
}

// ─── DuplicateRow ─────────────────────────────────────────────────────────────
function DuplicateRow({ row, index, selectedIds, onToggle, endTimeMap, loadingEndTimes, endTimesFetched }) {
    const [open, setOpen] = useState(false);

    const withOrders    = (row.orderCounts || []).filter(c => c > 0).length;
    const withoutOrders = (row.orderCounts || []).length - withOrders;
    const allSelected   = row.itemIds.length > 0 && row.itemIds.every(id => selectedIds.has(id));
    const someSelected  = row.itemIds.some(id => selectedIds.has(id));
    const countTone     = row.count >= 5 ? 'danger' : row.count >= 3 ? 'warning' : 'success';

    const handleSelectAll = (e) => {
        e.stopPropagation();
        if (allSelected) row.itemIds.forEach(id => onToggle(id, false));
        else             row.itemIds.forEach(id => onToggle(id, true));
    };

    return (
        <>
            <TableRow sx={tableBodyRowSx}>
                <TableCell sx={{ ...tableBodyCellSx, width: 56 }}>
                    <Box sx={{ ...tableIndexBadgeSx, width: 28, height: 28, fontSize: '0.78rem' }}>
                        {index + 1}
                    </Box>
                </TableCell>
                <TableCell sx={tableBodyCellSx}>
                    <Typography
                        variant="body2"
                        fontFamily="'JetBrains Mono', 'Fira Mono', monospace"
                        fontWeight={700}
                        sx={{ color: BRAND_DARK, letterSpacing: 0.2 }}
                    >
                        {row.sku}
                    </Typography>
                </TableCell>
                <TableCell align="center" sx={{ ...tableBodyCellSx, width: 100 }}>
                    <ToneChip label={row.count} tone={countTone} />
                </TableCell>
                <TableCell sx={{ ...tableBodyCellSx, width: 52, pr: 1 }} align="right">
                    <IconButton
                        size="small"
                        onClick={() => setOpen(o => !o)}
                        sx={{
                            color: open ? BRAND_DARK : alpha(BRAND_DARK, 0.45),
                            bgcolor: open ? alpha(BRAND_DARK, 0.07) : 'transparent',
                            '&:hover': { bgcolor: alpha(BRAND_DARK, 0.08) },
                            transition: 'all 0.18s',
                        }}
                    >
                        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                </TableCell>
            </TableRow>

            <TableRow>
                <TableCell
                    colSpan={4}
                    sx={{
                        py: 0, px: 0,
                        borderBottom: open ? `1px solid ${alpha(BRAND_DARK, 0.08)}` : 'none',
                    }}
                >
                    <Collapse in={open} unmountOnExit>
                        <Box sx={{ px: 3, py: 1.5, bgcolor: alpha(BRAND_DARK, 0.015), borderTop: `1px solid ${alpha(BRAND_DARK, 0.06)}` }}>
                            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.2}>
                                <Stack direction="row" spacing={1}>
                                    <ToneChip label={`${withOrders} with order${withOrders !== 1 ? 's' : ''}`} tone={withOrders > 0 ? 'success' : 'neutral'} />
                                    <ToneChip label={`${withoutOrders} without order${withoutOrders !== 1 ? 's' : ''}`} tone={withoutOrders > 0 ? 'danger' : 'neutral'} />
                                </Stack>
                                <Box display="flex" alignItems="center" gap={0.5} sx={{ cursor: 'pointer' }} onClick={handleSelectAll}>
                                    <Checkbox
                                        size="small"
                                        checked={allSelected}
                                        indeterminate={someSelected && !allSelected}
                                        onChange={handleSelectAll}
                                        onClick={e => e.stopPropagation()}
                                        sx={{ p: 0.3, color: alpha(BRAND_DARK, 0.35), '&.Mui-checked': { color: BRAND_DARK }, '&.MuiCheckbox-indeterminate': { color: BRAND_DARK } }}
                                    />
                                    <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.6), fontWeight: 500 }}>Select all</Typography>
                                </Box>
                            </Box>
                            <Stack spacing={0.1}>
                                {row.itemIds.map((id, i) => (
                                    <ItemRow
                                        key={id}
                                        itemId={id}
                                        title={row.titles?.[i]}
                                        orderCount={row.orderCounts?.[i] ?? 0}
                                        endTime={endTimeMap?.[id] ?? null}
                                        loadingEndTimes={loadingEndTimes}
                                        endTimesFetched={endTimesFetched}
                                        selected={selectedIds.has(id)}
                                        onToggle={(itemId) => onToggle(itemId)}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DuplicateSkusPage() {
    const [sellers, setSellers] = useState([]);
    const [sellerId, setSellerId] = useState('');
    const [result, setResult] = useState(null);
    const [loadingSellers, setLoadingSellers] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Selection (persists across page changes)
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Pagination
    const [page, setPage] = useState(1);

    // Live end times (fetched from eBay after each page load)
    const [endTimeMap, setEndTimeMap] = useState({});
    const [loadingEndTimes, setLoadingEndTimes] = useState(false);
    const [endTimesFetched, setEndTimesFetched] = useState(false);

    // End-listing
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [ending, setEnding] = useState(false);
    const [endProgress, setEndProgress] = useState({ done: 0, total: 0, errors: [] });
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    useEffect(() => {
        api.get('/sellers/all')
            .then(({ data }) => setSellers(data))
            .catch(() => setError('Failed to load sellers.'))
            .finally(() => setLoadingSellers(false));
    }, []);

    // Fetch live end times from eBay for the current page's item IDs.
    // AbortController ensures a stale response from a previous page never overwrites current data.
    useEffect(() => {
        if (!result?.duplicates?.length || !sellerId) return;
        const ids = result.duplicates.flatMap(d => d.itemIds);
        if (!ids.length) return;

        const controller = new AbortController();
        setLoadingEndTimes(true);
        setEndTimesFetched(false);
        api.get('/ebay/item-end-times', {
            params: { sellerId, itemIds: ids.join(',') },
            signal: controller.signal,
        })
            .then(({ data }) => setEndTimeMap(data))
            .catch(err => { if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') { /* ignore */ } })
            .finally(() => { setLoadingEndTimes(false); setEndTimesFetched(true); });

        return () => controller.abort(); // cancel if page changes before response arrives
    }, [result, sellerId]);

    const fetchPage = useCallback(async (p, sid) => {
        setLoading(true);
        setError(null);
        setEndTimeMap({});
        setEndTimesFetched(false);
        try {
            const { data } = await api.get('/sellers/sku-duplicates', {
                params: { sellerId: sid, page: p, limit: 25 },
            });
            setResult(data);
            setPage(p);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to fetch duplicate SKUs.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSearch = useCallback(() => {
        if (!sellerId) return;
        setResult(null);
        setSelectedIds(new Set());
        setEndTimeMap({});
        setPage(1);
        fetchPage(1, sellerId);
    }, [sellerId, fetchPage]);

    const handlePageChange = useCallback((_, value) => {
        fetchPage(value, sellerId);
    }, [sellerId, fetchPage]);

    const handleToggle = useCallback((itemId, forceValue) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const shouldSelect = forceValue !== undefined ? forceValue : !next.has(itemId);
            if (shouldSelect) next.add(itemId);
            else next.delete(itemId);
            return next;
        });
    }, []);

    const handleEndSelected = () => {
        if (selectedIds.size === 0) return;
        setConfirmOpen(true);
    };

    const confirmEndListing = async () => {
        setConfirmOpen(false);
        const ids = Array.from(selectedIds);
        setEnding(true);
        setEndProgress({ done: 0, total: ids.length, errors: [] });

        const errors = [];
        for (let i = 0; i < ids.length; i++) {
            try {
                await api.post('/ebay/end-item', {
                    sellerId,
                    itemId: ids[i],
                    endingReason: 'NotAvailable',
                    source: 'duplicate_sku',
                });
            } catch (e) {
                errors.push({ itemId: ids[i], msg: e?.response?.data?.error || e.message });
            }
            setEndProgress({ done: i + 1, total: ids.length, errors });
        }

        setEnding(false);
        // Remove successfully ended IDs from result
        const failedIds = new Set(errors.map(e => e.itemId));
        const succeeded = ids.filter(id => !failedIds.has(id));
        setSelectedIds(new Set());
        if (result) {
            setResult(prev => ({
                ...prev,
                duplicates: prev.duplicates
                    .map(row => {
                        const kept = row.itemIds.reduce((acc, id, i) => {
                            if (!succeeded.includes(id)) acc.push(i);
                            return acc;
                        }, []);
                        return {
                            ...row,
                            count: kept.length,
                            itemIds: kept.map(i => row.itemIds[i]),
                            titles: kept.map(i => row.titles?.[i]),
                            orderCounts: kept.map(i => row.orderCounts?.[i] ?? 0),
                        };
                    })
                    .filter(row => row.count > 1),
                total: prev.duplicates
                    .map(row => row.itemIds.filter(id => !succeeded.includes(id)).length)
                    .filter(c => c > 1).length,
            }));
        }

        if (errors.length === 0) {
            setSnackbar({ open: true, message: `Successfully ended ${succeeded.length} listing${succeeded.length !== 1 ? 's' : ''}.`, severity: 'success' });
        } else {
            setSnackbar({ open: true, message: `${succeeded.length} ended, ${errors.length} failed.`, severity: errors.length === ids.length ? 'error' : 'warning' });
        }
    };

    const selectedSeller = sellers.find(s => s._id === sellerId);
    const sellerLabel = selectedSeller
        ? (selectedSeller.user?.username || selectedSeller.user?.email || selectedSeller._id)
        : '';

    return (
        <Fade in timeout={500}>
            <AdminPageShell>
                {/* ── Header + Filter bar ───────────────────────────────── */}
                <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3, background: T.surfaces.pageCard }}>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        gap={2.5}
                    >
                        <PageHeader
                            title="Duplicate SKUs"
                            subtitle="Find SKUs appearing on more than one listing for a given seller."
                            sx={{ pt: 0, pb: 0 }}
                        />

                        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
                            <FormControl size="small" sx={{ minWidth: 240 }} disabled={loadingSellers}>
                                <InputLabel>Select Seller</InputLabel>
                                <Select
                                    value={sellerId}
                                    label="Select Seller"
                                    onChange={e => {
                                        setSellerId(e.target.value);
                                        setResult(null);
                                        setSelectedIds(new Set());
                                        setPage(1);
                                    }}
                                >
                                    {sellers.map(s => (
                                        <MenuItem key={s._id} value={s._id}>
                                            {s.user?.username || s.user?.email || s._id}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button
                                variant="outlined"
                                startIcon={<SearchIcon />}
                                onClick={handleSearch}
                                disabled={!sellerId || loading}
                                sx={yellowFilledButtonSx}
                            >
                                Check Duplicates
                            </Button>

                            {selectedIds.size > 0 && (
                                <Button
                                    variant="outlined"
                                    startIcon={<BlockIcon />}
                                    onClick={handleEndSelected}
                                    disabled={ending}
                                    sx={{
                                        ...yellowOutlinedButtonSx,
                                        color: T.tones.danger.color,
                                        borderColor: T.tones.danger.border,
                                        bgcolor: T.tones.danger.background,
                                        '&:hover': {
                                            bgcolor: alpha('#dc2626', 0.15),
                                            borderColor: '#dc2626',
                                            boxShadow: `0 8px 18px ${alpha('#dc2626', 0.18)}`,
                                        },
                                    }}
                                >
                                    End {selectedIds.size} Selected
                                </Button>
                            )}

                            {selectedIds.size > 0 && result?.totalPages > 1 && (
                                <ToneChip label={`${selectedIds.size} selected across pages`} tone="warning" />
                            )}
                        </Stack>
                    </Stack>

                    {ending && (
                        <Box mt={2.5}>
                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.6), fontWeight: 500 }}>
                                    Ending listings…
                                </Typography>
                                <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.6), fontWeight: 600 }}>
                                    {endProgress.done} / {endProgress.total}
                                </Typography>
                            </Stack>
                            <LinearProgress
                                variant="determinate"
                                value={(endProgress.done / endProgress.total) * 100}
                                sx={{
                                    borderRadius: 99, height: 6,
                                    bgcolor: alpha(BRAND_DARK, 0.08),
                                    '& .MuiLinearProgress-bar': { bgcolor: BRAND_YELLOW_DARK, borderRadius: 99 },
                                }}
                            />
                        </Box>
                    )}
                </SectionCard>

                {loading && (
                    <LinearProgress
                        sx={{
                            mb: 2, borderRadius: 99, height: 3,
                            bgcolor: alpha(BRAND_DARK, 0.07),
                            '& .MuiLinearProgress-bar': { bgcolor: BRAND_YELLOW_DARK },
                        }}
                    />
                )}
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

                {result && (
                    <SectionCard sx={{ overflow: 'hidden' }}>
                        {/* Result header */}
                        <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            px={3}
                            py={2}
                            sx={{ borderBottom: `1px solid ${alpha(BRAND_DARK, 0.08)}` }}
                        >
                            <Stack direction="row" spacing={1} alignItems="center">
                                <ReportProblemOutlinedIcon sx={{ fontSize: 18, color: alpha(BRAND_DARK, 0.45) }} />
                                <Typography variant="subtitle1" fontWeight={700} sx={{ color: BRAND_DARK }}>
                                    Results for&nbsp;
                                    <Box component="span" sx={{ color: '#2563eb' }}>{sellerLabel}</Box>
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center">
                                {result.total > 0 && (
                                    <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.45) }}>
                                        Page {page} of {result.totalPages}
                                    </Typography>
                                )}
                                {loadingEndTimes && (
                                    <Box display="flex" alignItems="center" gap={0.5}>
                                        <AccessTimeIcon sx={{ fontSize: 13, color: alpha(BRAND_DARK, 0.35) }} />
                                        <Typography variant="caption" sx={{ color: alpha(BRAND_DARK, 0.4), fontStyle: 'italic' }}>
                                            fetching end times…
                                        </Typography>
                                    </Box>
                                )}
                                <ToneChip
                                    label={result.total === 0 ? 'No duplicates found' : `${result.total} duplicate SKU${result.total !== 1 ? 's' : ''}`}
                                    tone={result.total === 0 ? 'success' : 'warning'}
                                />
                            </Stack>
                        </Box>

                        {result.total === 0 ? (
                            <Box py={8} textAlign="center">
                                <CheckCircleOutlineIcon sx={{ fontSize: 44, color: T.tones.success.color, mb: 1 }} />
                                <Typography fontWeight={700} variant="body1" sx={{ color: T.tones.success.color }}>
                                    No duplicate SKUs found for this seller.
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <TableContainer sx={{ ...tableContainerSx, maxHeight: 'calc(100vh - 370px)', overflow: 'auto' }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ ...tableHeaderCellSx, width: 56 }}>#</TableCell>
                                                <TableCell sx={tableHeaderCellSx}>SKU</TableCell>
                                                <TableCell align="center" sx={{ ...tableHeaderCellSx, width: 100 }}>Listings</TableCell>
                                                <TableCell sx={{ ...tableHeaderCellSx, width: 52 }} />
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {result.duplicates.map((row, i) => (
                                                <DuplicateRow
                                                    key={row.sku}
                                                    row={row}
                                                    index={(page - 1) * 25 + i}
                                                    selectedIds={selectedIds}
                                                    onToggle={handleToggle}
                                                    endTimeMap={endTimeMap}
                                                    loadingEndTimes={loadingEndTimes}
                                                    endTimesFetched={endTimesFetched}
                                                />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                {result.totalPages > 1 && (
                                    <Box
                                        display="flex"
                                        justifyContent="center"
                                        py={2.5}
                                        sx={{ borderTop: `1px solid ${alpha(BRAND_DARK, 0.07)}` }}
                                    >
                                        <Pagination
                                            count={result.totalPages}
                                            page={page}
                                            onChange={handlePageChange}
                                            shape="rounded"
                                            disabled={loading}
                                            sx={{
                                                '& .MuiPaginationItem-root': { fontWeight: 600, color: alpha(BRAND_DARK, 0.7) },
                                                '& .Mui-selected': { bgcolor: `${BRAND_DARK} !important`, color: '#fff' },
                                            }}
                                        />
                                    </Box>
                                )}
                            </>
                        )}
                    </SectionCard>
                )}

                {/* Confirm dialog */}
                <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle sx={{ fontWeight: 700, color: BRAND_DARK }}>
                        End {selectedIds.size} Listing{selectedIds.size !== 1 ? 's' : ''}?
                    </DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" color="text.secondary">
                            This will permanently end <strong>{selectedIds.size}</strong> listing{selectedIds.size !== 1 ? 's' : ''} on eBay with reason <em>NotAvailable</em>. This cannot be undone.
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                        <Button onClick={() => setConfirmOpen(false)} sx={{ ...yellowOutlinedButtonSx, px: 2 }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmEndListing}
                            sx={{
                                ...yellowOutlinedButtonSx, px: 2,
                                color: T.tones.danger.color,
                                borderColor: T.tones.danger.border,
                                bgcolor: T.tones.danger.background,
                                '&:hover': { bgcolor: alpha('#dc2626', 0.15), borderColor: '#dc2626' },
                            }}
                        >
                            Yes, End Listings
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* Snackbar */}
                <Snackbar
                    open={snackbar.open}
                    autoHideDuration={5000}
                    onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} sx={{ fontWeight: 600, borderRadius: 2 }}>
                        {snackbar.message}
                    </Alert>
                </Snackbar>
            </AdminPageShell>
        </Fade>
    );
}
