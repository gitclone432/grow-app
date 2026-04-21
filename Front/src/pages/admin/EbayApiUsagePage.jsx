import { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert,
    Chip, Button, LinearProgress, TextField, InputAdornment,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Accordion, AccordionSummary, AccordionDetails, Divider
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import api from '../../lib/api';

function getUsageColor(percent) {
    if (percent >= 90) return 'error';
    if (percent >= 70) return 'warning';
    return 'success';
}

function getUsageHex(percent) {
    if (percent >= 90) return '#d32f2f';
    if (percent >= 70) return '#ed6c02';
    return '#2e7d32';
}

function formatResetTime(resetStr) {
    if (!resetStr) return '—';
    const diffMs = new Date(resetStr) - Date.now();
    if (diffMs <= 0) return 'Soon';
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function EbayApiUsagePage() {
    const [rateLimits, setRateLimits] = useState([]);
    const [sellers, setSellers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [fetchedAt, setFetchedAt] = useState(null);
    const [cached, setCached] = useState(false);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async (forceRefresh = false) => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.get('/ebay/api-usage-stats/all', {
                params: forceRefresh ? { refresh: 'true' } : {}
            });
            if (res.data.success) {
                setRateLimits(res.data.rateLimits || []);
                setSellers(res.data.sellers || []);
                setFetchedAt(res.data.fetchedAt ? new Date(res.data.fetchedAt) : new Date());
                setCached(res.data.cached && !forceRefresh);
            }
        } catch (err) {
            setError('Failed to fetch API usage data.');
        } finally {
            setLoading(false);
        }
    };

    // Filter contexts and resources by search
    const filtered = rateLimits
        .map(ctx => {
            const matchCtx = ctx.apiContext.toLowerCase().includes(search.toLowerCase());
            const matchedResources = (ctx.resources || []).filter(r =>
                r.toLowerCase().includes(search.toLowerCase())
            );
            if (!search || matchCtx || matchedResources.length > 0) {
                return {
                    ...ctx,
                    // If searching by resource name, only show matched resources
                    resources: search && !matchCtx ? matchedResources : ctx.resources
                };
            }
            return null;
        })
        .filter(Boolean)
        .sort((a, b) => b.usagePercent - a.usagePercent);

    const critical = filtered.filter(r => r.usagePercent >= 90).length;
    const warning = filtered.filter(r => r.usagePercent >= 70 && r.usagePercent < 90).length;

    return (
        <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2} flexWrap="wrap" gap={2}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>eBay API Usage</Typography>
                    <Typography variant="body2" color="textSecondary">
                        {fetchedAt
                            ? `${cached ? '📦 Cached — ' : '🔄 Live — '}${fetchedAt.toLocaleTimeString()}`
                            : 'Loading...'}
                    </Typography>
                </Box>
                <Box display="flex" gap={1}>
                    <Button variant="outlined" size="small" startIcon={<RefreshIcon />}
                        onClick={() => fetchData(false)} disabled={loading}>
                        Use Cache
                    </Button>
                    <Button variant="contained"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                        onClick={() => fetchData(true)} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh Live'}
                    </Button>
                </Box>
            </Box>

            {/* Info */}
            <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                    eBay rate limits are per-app, not per-seller
                </Typography>
                <Typography variant="body2">
                    All {sellers.length} sellers share the same daily call pool per API category.
                    Every resource listed under a category (e.g. <em>GetMyeBaySelling</em>, <em>ReviseCompatibilityList</em>) draws from the same shared bucket — the used/limit numbers are the same for all of them.
                </Typography>
            </Alert>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {/* Summary chips */}
            {!loading && filtered.length > 0 && (
                <Box display="flex" gap={2} mb={2} flexWrap="wrap" alignItems="center">
                    <Chip label={`${filtered.length} API categories`} color="primary" variant="outlined" />
                    {critical > 0 && <Chip label={`${critical} Critical`} color="error" />}
                    {warning > 0 && <Chip label={`${warning} Warning`} color="warning" />}
                    {critical === 0 && warning === 0 && <Chip label="All healthy" color="success" />}
                </Box>
            )}

            {/* Search */}
            {!loading && filtered.length > 0 && (
                <TextField size="small" placeholder="Search category or resource name..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
                    sx={{ mb: 2, width: 360, bgcolor: 'white' }}
                />
            )}

            {/* Loading */}
            {loading && (
                <Box display="flex" flexDirection="column" alignItems="center" py={8}>
                    <CircularProgress size={48} sx={{ mb: 2 }} />
                    <Typography color="textSecondary">Fetching API usage from eBay...</Typography>
                </Box>
            )}

            {/* Accordions per category */}
            {!loading && filtered.map((ctx, i) => (
                <Accordion key={i} defaultExpanded={ctx.used > 0} disableGutters elevation={2}
                    sx={{
                        mb: 2, '&:before': { display: 'none' },
                        border: ctx.usagePercent >= 90 ? '1px solid #ffcdd2'
                            : ctx.usagePercent >= 70 ? '1px solid #ffe0b2'
                                : '1px solid #e0e0e0'
                    }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}
                        sx={{ bgcolor: ctx.usagePercent >= 90 ? '#fff8f8' : ctx.usagePercent >= 70 ? '#fffbf5' : '#fafafa' }}>
                        <Box display="flex" alignItems="center" gap={1.5} width="100%" pr={1}>
                            <Box flex={1}>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Typography fontWeight={700}>{ctx.apiContext}</Typography>
                                    <Chip label={`${(ctx.resources || []).length} resources`} size="small" variant="outlined"
                                        sx={{ fontSize: '0.65rem', height: 18 }} />
                                    {ctx.usagePercent >= 90 && <Chip label="Critical" color="error" size="small" />}
                                    {ctx.usagePercent >= 70 && ctx.usagePercent < 90 && <Chip label="Warning" color="warning" size="small" />}
                                </Box>
                                <Typography variant="caption" color="textSecondary">{ctx.apiName}</Typography>
                            </Box>
                            {/* Mini usage bar in header */}
                            <Box sx={{ width: 180, display: { xs: 'none', sm: 'block' } }}>
                                <Box display="flex" justifyContent="space-between" mb={0.3}>
                                    <Typography variant="caption" color="textSecondary">
                                        {ctx.used.toLocaleString()} / {ctx.limit.toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" fontWeight={700} sx={{ color: getUsageHex(ctx.usagePercent) }}>
                                        {ctx.usagePercent}%
                                    </Typography>
                                </Box>
                                <LinearProgress variant="determinate" value={Math.min(ctx.usagePercent, 100)}
                                    color={getUsageColor(ctx.usagePercent)}
                                    sx={{ height: 8, borderRadius: 4 }} />
                            </Box>
                            <Typography variant="caption" color="textSecondary" sx={{ minWidth: 60, textAlign: 'right' }}>
                                Resets {formatResetTime(ctx.reset)}
                            </Typography>
                        </Box>
                    </AccordionSummary>

                    <AccordionDetails sx={{ p: 0 }}>
                        {/* Category summary row */}
                        <Box sx={{ px: 2, py: 1.5, bgcolor: '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
                            <Typography variant="caption" color="textSecondary">
                                📌 All resources below share one pool: <strong>{ctx.used.toLocaleString()} used</strong> of{' '}
                                <strong>{ctx.limit.toLocaleString()} daily limit</strong> · <strong>{ctx.remaining.toLocaleString()} remaining</strong>
                            </Typography>
                        </Box>

                        {/* Resource list */}
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 700 }}>API Resource (Call Name)</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Shared Used</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Daily Limit</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Remaining</TableCell>
                                        <TableCell sx={{ fontWeight: 700, width: '25%' }}>Usage</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(ctx.resources || []).map((resourceName, j) => (
                                        <TableRow key={j} sx={{ '&:hover': { bgcolor: '#f5f5f5' } }}>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                    {resourceName}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" fontWeight={600} sx={{ color: getUsageHex(ctx.usagePercent) }}>
                                                    {ctx.used.toLocaleString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" color="textSecondary">
                                                    {ctx.limit.toLocaleString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2">{ctx.remaining.toLocaleString()}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <LinearProgress variant="determinate" value={Math.min(ctx.usagePercent, 100)}
                                                        color={getUsageColor(ctx.usagePercent)}
                                                        sx={{ flex: 1, height: 7, borderRadius: 4 }} />
                                                    <Typography variant="caption" sx={{ minWidth: 35, fontWeight: 700, color: getUsageHex(ctx.usagePercent) }}>
                                                        {ctx.usagePercent}%
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </AccordionDetails>
                </Accordion>
            ))}

            {/* No data */}
            {!loading && !error && filtered.length === 0 && (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                    <Typography variant="h6" color="textSecondary">No API usage data found</Typography>
                </Paper>
            )}

            {/* Connected sellers */}
            {!loading && sellers.length > 0 && (
                <Paper elevation={1} sx={{ mt: 3, p: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} mb={1}>
                        {sellers.length} sellers share this API limit pool
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap">
                        {sellers.map(s => (
                            <Chip key={s._id} label={s.name} size="small" variant="outlined" color="primary" />
                        ))}
                    </Box>
                </Paper>
            )}
        </Container>
    );
}
