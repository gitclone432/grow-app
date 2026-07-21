import { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert,
    Chip, Button, LinearProgress, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Tooltip, IconButton,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import api, { getAuthToken } from '../../lib/api';

// seller state shape: { status: 'idle'|'queued'|'running'|'completed'|'failed'|'dismissed', dbCount, syncedAt, progress }
// progress shape: { page, totalPages, totalEntries, count }

export default function SkuIndexSyncPage() {
    const [sellers, setSellers] = useState([]);
    const [sellerState, setSellerState] = useState({}); // sellerId → state
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [error, setError] = useState(null);
    const [runStatus, setRunStatus] = useState(null);
    const [stoppingRun, setStoppingRun] = useState(false);

    const readerRefs = useRef({}); // sellerId → ReadableStreamDefaultReader (for cleanup)

    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await api.get('/sellers/all');
                setSellers(data);
                await refreshStatuses(data);
                await fetchRunStatus();
            } catch {
                setError('Failed to load sellers.');
            } finally {
                setLoadingInitial(false);
            }
        };
        load();
        return () => {
            // Cancel any in-flight SSE readers on unmount
            Object.values(readerRefs.current).forEach(r => { try { r.cancel(); } catch {} });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (sellers.length === 0) return undefined;
        const id = window.setInterval(() => refreshStatuses(sellers), 120000);
        return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellers]);

    const mapStatus = (data) => {
        if (['queued', 'running', 'dismissed', 'failed'].includes(data.status)) return data.status;
        return data.dbCount > 0 ? 'completed' : 'idle';
    };

    const refreshStatuses = async (sellerList = sellers) => {
        await Promise.all(sellerList.map(s => fetchInitialStatus(s._id)));
        await fetchRunStatus();
    };

    const fetchRunStatus = async () => {
        try {
            const { data } = await api.get('/ebay/sync-sku-index/run-status');
            setRunStatus(data.run || null);
        } catch {
            // non-fatal
        }
    };

    const fetchInitialStatus = async (sellerId) => {
        try {
            const { data } = await api.get(`/ebay/sync-sku-index/status/${sellerId}`);
            setSellerState(prev => ({
                ...prev,
                [sellerId]: {
                    status: mapStatus(data),
                    dbCount: data.dbCount,
                    syncedAt: data.syncedAt || null,
                    completedAt: data.completedAt || null,
                    progress: data.progress || (prev[sellerId]?.status === 'running' ? prev[sellerId]?.progress || null : null),
                    errorMsg: data.error || null,
                    source: data.source || null,
                    runnerId: data.runnerId || null,
                },
            }));
        } catch {
            // non-fatal: leave as idle
        }
    };

    const handleSync = async (sellerId) => {
        setSellerState(prev => ({
            ...prev,
            [sellerId]: {
                status: 'running',
                dbCount: prev[sellerId]?.dbCount ?? 0,
                syncedAt: prev[sellerId]?.syncedAt ?? null,
                completedAt: prev[sellerId]?.completedAt ?? null,
                progress: null,
            },
        }));

        try {
            const baseURL = import.meta.env.VITE_API_URL;
            const token = getAuthToken();
            const response = await fetch(
                `${baseURL}/ebay/sync-sku-index/stream?sellerId=${sellerId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Request failed (${response.status})`);
            }

            const reader = response.body.getReader();
            readerRefs.current[sellerId] = reader;
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const evt = JSON.parse(line.slice(6));
                    if (evt.type === 'progress') {
                        setSellerState(prev => ({
                            ...prev,
                            [sellerId]: {
                                ...prev[sellerId],
                                status: 'running',
                                progress: { page: evt.page, totalPages: evt.totalPages, totalEntries: evt.totalEntries, count: evt.count },
                            },
                        }));
                    } else if (evt.type === 'done') {
                        setSellerState(prev => ({
                            ...prev,
                            [sellerId]: {
                                status: 'completed',
                                dbCount: evt.totalCount,
                                syncedAt: evt.syncedAt,
                                completedAt: new Date().toISOString(),
                                progress: null,
                            },
                        }));
                    } else if (evt.type === 'error') {
                        throw new Error(evt.error);
                    }
                }
            }
        } catch (err) {
            setSellerState(prev => ({
                ...prev,
                [sellerId]: { ...prev[sellerId], status: 'failed', errorMsg: err.message, progress: null },
            }));
        } finally {
            delete readerRefs.current[sellerId];
        }
    };

    const handleDismiss = async (sellerId) => {
        try {
            await api.post(`/ebay/sync-sku-index/dismiss/${sellerId}`);
            if (readerRefs.current[sellerId]) {
                try { await readerRefs.current[sellerId].cancel(); } catch {}
                delete readerRefs.current[sellerId];
            }
            setSellerState(prev => ({
                ...prev,
                [sellerId]: { ...prev[sellerId], status: 'dismissed', progress: null, errorMsg: null },
            }));
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Failed to dismiss sync.');
        }
    };

    const handleStopCronSync = async () => {
        setStoppingRun(true);
        try {
            await api.post('/ebay/sync-sku-index/cron/stop');
            await refreshStatuses(sellers);
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to stop cron sync.');
        } finally {
            setStoppingRun(false);
        }
    };

    const formatDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleString(undefined, {
            dateStyle: 'medium', timeStyle: 'short',
        });
    };

    const activeCronRun = runStatus && ['queued', 'running', 'stopping'].includes(runStatus.status);
    const runSellersDone = runStatus?.sellers?.filter(s => ['completed', 'failed', 'dismissed', 'interrupted'].includes(s.status)).length || 0;

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
            <Box mb={3}>
                <Typography variant="h4" fontWeight={700}>SKU Index Sync</Typography>
                <Typography variant="body2" color="textSecondary">
                    Sync each seller's active listings into the local DB so SKU checks are instant.
                    Press the sync button to refresh a seller's index.
                </Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {runStatus && (
                <Paper elevation={0} sx={{ mb: 2, p: 2, borderRadius: 2, border: '1px solid #e0e0e0' }}>
                    <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                        <Box>
                            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                <Typography variant="subtitle2" fontWeight={700}>Cron Sync Run</Typography>
                                <Chip
                                    label={runStatus.status}
                                    size="small"
                                    color={activeCronRun ? 'warning' : runStatus.status === 'completed' ? 'success' : runStatus.status === 'failed' ? 'error' : 'default'}
                                    variant="outlined"
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                {runSellersDone} / {runStatus.sellersTotal || runStatus.sellers?.length || 0} sellers handled
                                {runStatus.startedAt ? ` · Started ${formatDate(runStatus.startedAt)}` : ''}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                                Run ID: {runStatus._id}
                            </Typography>
                        </Box>
                        {activeCronRun && (
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                startIcon={stoppingRun ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
                                onClick={handleStopCronSync}
                                disabled={stoppingRun || runStatus.status === 'stopping'}
                            >
                                {runStatus.status === 'stopping' || stoppingRun ? 'Stopping...' : 'Stop Cron Sync'}
                            </Button>
                        )}
                    </Box>
                </Paper>
            )}

            <Paper elevation={1} sx={{ borderRadius: 2, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell sx={{ fontWeight: 700 }}>Seller</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Indexed Listings</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700 }}>Last Synced</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700 }}>Completed At</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loadingInitial ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                        <CircularProgress size={28} />
                                        <Typography variant="body2" sx={{ mt: 1 }}>Loading sellers…</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : sellers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 5 }}>No sellers found</TableCell>
                                </TableRow>
                            ) : (
                                sellers.map(seller => {
                                    const sid = seller._id;
                                    const s = sellerState[sid] || { status: 'idle', dbCount: 0, syncedAt: null, completedAt: null };
                                    const isRunning = s.status === 'running';
                                    const isQueued = s.status === 'queued';
                                    const prog = s.progress;
                                    const pct = prog?.totalPages > 0
                                        ? Math.round((prog.page / prog.totalPages) * 100)
                                        : 0;

                                    return (
                                        <TableRow key={sid} sx={{ '&:last-child td': { border: 0 } }}>
                                            <TableCell>
                                                <Typography fontWeight={600}>
                                                    {seller.user?.username || seller._id}
                                                </Typography>
                                            </TableCell>

                                            <TableCell align="right">
                                                <Typography variant="body2">
                                                    {s.dbCount > 0 ? s.dbCount.toLocaleString() : '—'}
                                                </Typography>
                                            </TableCell>

                                            <TableCell align="center">
                                                <Typography variant="body2" color={s.syncedAt ? 'text.primary' : 'text.disabled'}>
                                                    {formatDate(s.syncedAt)}
                                                </Typography>
                                            </TableCell>

                                            <TableCell align="center">
                                                <Typography variant="body2" color={s.completedAt ? 'text.primary' : 'text.disabled'}>
                                                    {formatDate(s.completedAt)}
                                                </Typography>
                                            </TableCell>

                                            <TableCell align="center" sx={{ minWidth: 200 }}>
                                                {isRunning ? (
                                                    <Box>
                                                        <Box display="flex" justifyContent="space-between" mb={0.5}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {prog
                                                                    ? `Page ${prog.page} / ${prog.totalPages} · ${prog.count.toLocaleString()} listings`
                                                                    : 'Connecting…'}
                                                            </Typography>
                                                            {prog && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {pct}%
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                        <LinearProgress
                                                            variant={prog ? 'determinate' : 'indeterminate'}
                                                            value={pct}
                                                            sx={{ height: 6, borderRadius: 3 }}
                                                        />
                                                    </Box>
                                                ) : isQueued ? (
                                                    <Chip label="Queued" color="warning" size="small" variant="outlined" />
                                                ) : s.status === 'completed' ? (
                                                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                                        <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                                        <Chip label="Synced" color="success" size="small" variant="outlined" />
                                                    </Box>
                                                ) : s.status === 'failed' ? (
                                                    <Box>
                                                        <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                                            <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />
                                                            <Chip label="Failed" color="error" size="small" variant="outlined" />
                                                        </Box>
                                                        <Typography variant="caption" color="error.main" display="block" textAlign="center" mt={0.5}>
                                                            {s.errorMsg || 'Unknown error'}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
                                                            Previously synced data intact — re-sync to retry.
                                                        </Typography>
                                                    </Box>
                                                ) : s.status === 'dismissed' ? (
                                                    <Chip label="Dismissed" color="default" size="small" variant="outlined" />
                                                ) : (
                                                    <Chip label="Not synced" size="small" variant="outlined" sx={{ color: 'text.disabled' }} />
                                                )}
                                            </TableCell>

                                            <TableCell align="center">
                                                <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    startIcon={isRunning ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                                                    onClick={() => handleSync(sid)}
                                                    disabled={isRunning || isQueued}
                                                    sx={{ minWidth: 100 }}
                                                >
                                                    {isRunning ? 'Syncing…' : 'Sync'}
                                                </Button>
                                                    {(isRunning || isQueued) && (
                                                        <Tooltip title="Dismiss sync">
                                                            <IconButton color="error" size="small" onClick={() => handleDismiss(sid)}>
                                                                <CancelIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Container>
    );
}
