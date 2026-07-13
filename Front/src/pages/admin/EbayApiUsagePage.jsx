import { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert,
    Chip, Button, LinearProgress, TextField, InputAdornment,
    Accordion, AccordionSummary, AccordionDetails, Stack
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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

const CHIP_DENSE = { height: 22, fontSize: '0.7rem' };

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

    const filtered = rateLimits
        .map(ctx => {
            const matchCtx = ctx.apiContext.toLowerCase().includes(search.toLowerCase());
            const matchedResources = (ctx.resources || []).filter(r =>
                r.toLowerCase().includes(search.toLowerCase())
            );
            if (!search || matchCtx || matchedResources.length > 0) {
                return {
                    ...ctx,
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
        <Container maxWidth="lg" sx={{ mt: 1.5, mb: 3 }}>
            {/* Header */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                spacing={1.5}
                sx={{ mb: 1.5 }}
            >
                <Box>
                    <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                        eBay API Usage
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                        {fetchedAt ? (
                            <>
                                <Chip
                                    label={cached ? 'Cached' : 'Live'}
                                    size="small"
                                    color={cached ? 'default' : 'primary'}
                                    variant={cached ? 'outlined' : 'filled'}
                                    sx={CHIP_DENSE}
                                />
                                <Typography variant="caption" color="text.secondary">
                                    {fetchedAt.toLocaleTimeString()}
                                </Typography>
                            </>
                        ) : (
                            <Typography variant="caption" color="text.secondary">Loading...</Typography>
                        )}
                    </Stack>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                        variant="outlined"
                        size="small"
                        color="inherit"
                        startIcon={<RefreshIcon />}
                        onClick={() => fetchData(false)}
                        disabled={loading}
                    >
                        Use Cache
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                        onClick={() => fetchData(true)}
                        disabled={loading}
                    >
                        {loading ? 'Loading...' : 'Refresh Live'}
                    </Button>
                </Stack>
            </Stack>

            {/* Info — one short line */}
            <Alert severity="info" sx={{ mb: 1.5, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                    Rate limits are per-app, not per-seller — all {sellers.length || '…'} sellers share one daily pool per category.
                </Typography>
            </Alert>

            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

            {/* Filters: chips + search */}
            {!loading && filtered.length > 0 && (
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    sx={{ mb: 1.5 }}
                >
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip label={`${filtered.length} categories`} size="small" variant="outlined" sx={CHIP_DENSE} />
                        {critical > 0 && <Chip label={`${critical} critical`} size="small" color="error" sx={CHIP_DENSE} />}
                        {warning > 0 && <Chip label={`${warning} warning`} size="small" color="warning" sx={CHIP_DENSE} />}
                        {critical === 0 && warning === 0 && (
                            <Chip label="All healthy" size="small" color="success" sx={CHIP_DENSE} />
                        )}
                    </Stack>
                    <TextField
                        size="small"
                        placeholder="Search category or resource..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 18 }} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ width: { xs: '100%', sm: 280 }, bgcolor: 'background.paper' }}
                    />
                </Stack>
            )}

            {loading && (
                <Box display="flex" flexDirection="column" alignItems="center" py={6}>
                    <CircularProgress size={36} sx={{ mb: 1.5 }} />
                    <Typography variant="body2" color="text.secondary">Fetching API usage from eBay...</Typography>
                </Box>
            )}

            {/* Category list */}
            {!loading && filtered.map((ctx, i) => {
                const borderColor = ctx.usagePercent >= 90
                    ? 'error.light'
                    : ctx.usagePercent >= 70
                        ? 'warning.light'
                        : 'divider';
                const summaryBg = ctx.usagePercent >= 90
                    ? 'rgba(211, 47, 47, 0.04)'
                    : ctx.usagePercent >= 70
                        ? 'rgba(237, 108, 2, 0.04)'
                        : 'action.hover';

                return (
                    <Accordion
                        key={`${ctx.apiContext}-${i}`}
                        defaultExpanded={ctx.used > 0}
                        disableGutters
                        elevation={0}
                        sx={{
                            mb: 1,
                            border: '1px solid',
                            borderColor,
                            borderRadius: '6px !important',
                            overflow: 'hidden',
                            '&:before': { display: 'none' },
                        }}
                    >
                        <AccordionSummary
                            expandIcon={<ExpandMoreIcon sx={{ fontSize: 20 }} />}
                            sx={{
                                minHeight: 48,
                                bgcolor: summaryBg,
                                px: 1.5,
                                '& .MuiAccordionSummary-content': { my: 1 },
                            }}
                        >
                            <Box display="flex" alignItems="center" gap={1.25} width="100%" pr={0.5}>
                                <Box flex={1} minWidth={0}>
                                    <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
                                        <Typography variant="body2" fontWeight={700} noWrap>
                                            {ctx.apiContext}
                                        </Typography>
                                        <Chip
                                            label={`${(ctx.resources || []).length}`}
                                            size="small"
                                            variant="outlined"
                                            sx={{ ...CHIP_DENSE, height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                        />
                                        {ctx.usagePercent >= 90 && (
                                            <Chip label="Critical" color="error" size="small" sx={CHIP_DENSE} />
                                        )}
                                        {ctx.usagePercent >= 70 && ctx.usagePercent < 90 && (
                                            <Chip label="Warning" color="warning" size="small" sx={CHIP_DENSE} />
                                        )}
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                                        {ctx.apiName}
                                    </Typography>
                                </Box>
                                <Box sx={{ width: 160, display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}>
                                    <Box display="flex" justifyContent="space-between" mb={0.25}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                            {ctx.used.toLocaleString()} / {ctx.limit.toLocaleString()}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            fontWeight={700}
                                            sx={{ fontSize: '0.7rem', color: getUsageHex(ctx.usagePercent) }}
                                        >
                                            {ctx.usagePercent}%
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(ctx.usagePercent, 100)}
                                        color={getUsageColor(ctx.usagePercent)}
                                        sx={{ height: 5, borderRadius: 2 }}
                                    />
                                </Box>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ minWidth: 72, textAlign: 'right', flexShrink: 0, fontSize: '0.7rem' }}
                                >
                                    Resets {formatResetTime(ctx.reset)}
                                </Typography>
                            </Box>
                        </AccordionSummary>

                        <AccordionDetails sx={{ p: 0 }}>
                            <Box
                                sx={{
                                    px: 1.5,
                                    py: 0.75,
                                    bgcolor: 'action.hover',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                }}
                            >
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                    Shared pool:{' '}
                                    <Box component="span" fontWeight={600} color="text.primary">
                                        {ctx.used.toLocaleString()} used
                                    </Box>
                                    {' / '}
                                    {ctx.limit.toLocaleString()} limit
                                    {' · '}
                                    {ctx.remaining.toLocaleString()} remaining
                                    {' · '}
                                    <Box component="span" fontWeight={700} sx={{ color: getUsageHex(ctx.usagePercent) }}>
                                        {ctx.usagePercent}%
                                    </Box>
                                </Typography>
                            </Box>

                            <Box
                                component="ul"
                                sx={{
                                    m: 0,
                                    px: 0,
                                    py: 0,
                                    listStyle: 'none',
                                    maxHeight: 280,
                                    overflow: 'auto',
                                }}
                            >
                                {(ctx.resources || []).map((resourceName, j) => (
                                    <Box
                                        component="li"
                                        key={`${resourceName}-${j}`}
                                        sx={{
                                            px: 1.5,
                                            py: 0.5,
                                            borderBottom: '1px solid',
                                            borderColor: 'divider',
                                            '&:last-child': { borderBottom: 0 },
                                            '&:hover': { bgcolor: 'action.hover' },
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                                fontSize: '0.75rem',
                                                lineHeight: 1.4,
                                            }}
                                        >
                                            {resourceName}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            {!loading && !error && filtered.length === 0 && (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">No API usage data found</Typography>
                </Paper>
            )}

            {/* Sellers footer */}
            {!loading && sellers.length > 0 && (
                <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                        {sellers.length} sellers share this API limit pool
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {sellers.map(s => (
                            <Chip
                                key={s._id}
                                label={s.name}
                                size="small"
                                variant="outlined"
                                sx={{ ...CHIP_DENSE, height: 20, fontSize: '0.65rem' }}
                            />
                        ))}
                    </Stack>
                </Box>
            )}
        </Container>
    );
}
