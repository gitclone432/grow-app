import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';
import api from '../../lib/api';

const pillTones = {
    neutral: { background: 'rgba(15, 23, 42, 0.05)', border: 'rgba(15, 23, 42, 0.08)', color: '#0f172a' },
    info: { background: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.18)', color: '#075985' },
    success: { background: 'rgba(22, 163, 74, 0.12)', border: 'rgba(22, 163, 74, 0.18)', color: '#166534' },
    warning: { background: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.2)', color: '#92400e' },
    danger: { background: 'rgba(220, 38, 38, 0.1)', border: 'rgba(220, 38, 38, 0.15)', color: '#b91c1c' },
    amazon: { background: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.18)', color: '#9a3412' },
    shipping: { background: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.18)', color: '#1d4ed8' }
};

const tableHeaderCellSx = {
    backgroundColor: '#123b63',
    color: '#ffffff',
    fontWeight: 700,
    py: 1.75,
    whiteSpace: 'nowrap',
    borderBottom: 'none'
};

const tableBodyCellSx = {
    py: 1.5,
    px: 2,
    borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
    whiteSpace: 'nowrap'
};

function SummaryCard({ label, value, tone = 'neutral' }) {
    const palette = pillTones[tone] || pillTones.neutral;

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                borderRadius: 3,
                borderColor: palette.border,
                background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,250,252,0.92) 100%)',
                minHeight: 108,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
            }}
        >
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {label}
            </Typography>
            <Box
                sx={{
                    mt: 1.5,
                    width: 'fit-content',
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 999,
                    backgroundColor: palette.background,
                    border: '1px solid',
                    borderColor: palette.border,
                    color: palette.color
                }}
            >
                <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                    {value}
                </Typography>
            </Box>
        </Paper>
    );
}

function MetricPill({ value, tone = 'neutral' }) {
    const palette = pillTones[tone] || pillTones.neutral;

    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 46,
                px: 1.2,
                py: 0.5,
                borderRadius: 999,
                border: '1px solid',
                borderColor: palette.border,
                backgroundColor: palette.background,
                color: palette.color,
                fontWeight: 700,
                fontSize: '0.875rem',
                lineHeight: 1
            }}
        >
            {value}
        </Box>
    );
}

function getMetricTone(value, type) {
    if (type === 'amazon') return value > 0 ? 'amazon' : 'neutral';
    if (type === 'upsUsps') return value > 0 ? 'shipping' : 'neutral';
    if (type === 'blank') return value > 0 ? 'danger' : 'success';
    if (type === 'trackingLeft') return value > 0 ? 'warning' : 'success';
    if (type === 'delivered') return value > 0 ? 'success' : 'neutral';
    if (type === 'inTransit') return value > 0 ? 'shipping' : 'neutral';
    if (type === 'notYetShipped') return value > 0 ? 'warning' : 'neutral';
    if (type === 'alreadyInUse') return value > 0 ? 'danger' : 'neutral';
    return value > 0 ? 'info' : 'neutral';
}

function getStatusMeta(row) {
    const isDone = row.blankCount === 0 && row.trackingIdCount > 0;
    return {
        isDone,
        label: isDone ? 'Done' : 'In Progress',
        color: isDone ? 'success' : 'warning',
        variant: isDone ? 'filled' : 'outlined'
    };
}

export default function AwaitingSheetPage() {
    const [date, setDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [marketplace, setMarketplace] = useState('');
    const [excludeClient, setExcludeClient] = useState(true);

    useEffect(() => {
        if (date) {
            fetchSummary();
        }
    }, [date, marketplace, excludeClient]);

    async function fetchSummary() {
        setLoading(true);
        setError('');
        try {
            const params = { date };
            if (marketplace) params.marketplace = marketplace;
            params.excludeClient = excludeClient;
            const { data: result } = await api.get('/ebay/awaiting-sheet-summary', {
                params
            });
            setData(result);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load summary');
            setData(null);
        } finally {
            setLoading(false);
        }
    }

    const summaryCards = useMemo(() => {
        if (!data) return [];

        const totals = data.totals || {};
        return [
            { label: 'Upload Tracking', value: totals.uploadTracking || 0, tone: 'info' },
            { label: 'Tracking Left', value: totals.trackingId || 0, tone: (totals.trackingId || 0) > 0 ? 'warning' : 'success' },
            { label: 'Uploaded', value: (totals.uploadTracking || 0) - (totals.trackingId || 0), tone: 'success' },
            { label: 'Delivered', value: totals.delivered || 0, tone: 'success' },
            { label: 'In Transit', value: totals.inTransit || 0, tone: 'shipping' },
            { label: 'Not Yet Shipped', value: totals.notYetShipped || 0, tone: 'warning' },
            { label: 'Already in Use', value: totals.alreadyInUse || 0, tone: 'danger' },
            { label: 'Amazon', value: totals.amazon || 0, tone: 'amazon' },
            { label: 'UPS / USPS', value: totals.upsUsps || 0, tone: 'shipping' },
            { label: 'Blank', value: totals.blank || 0, tone: (totals.blank || 0) > 0 ? 'danger' : 'success' },
            { label: 'Sellers', value: data.totalSellers || 0, tone: 'neutral' }
        ];
    }, [data]);

    return (
        <Box sx={{ p: 3 }}>
            <Paper
                sx={{
                    p: { xs: 2, md: 3 },
                    mb: 3,
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: 'divider',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
                    boxShadow: '0 14px 36px rgba(15, 23, 42, 0.06)'
                }}
            >
                <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }} gap={2.5}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '1.9rem' } }}>
                            Awaiting Sheet
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                            Ship-by summary grouped by store, with cleaner status cues and easier scanability.
                        </Typography>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" sx={{ width: { xs: '100%', lg: 'auto' } }}>
                        <TextField
                            type="date"
                            label="Ship By Date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                            sx={{ minWidth: 180 }}
                        />
                        <FormControl size="small" sx={{ minWidth: 170 }}>
                            <InputLabel>Marketplace</InputLabel>
                            <Select
                                value={marketplace}
                                label="Marketplace"
                                onChange={(e) => setMarketplace(e.target.value)}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                <MenuItem value="EBAY_US">EBAY_US</MenuItem>
                                <MenuItem value="EBAY_AU">EBAY_AU</MenuItem>
                                <MenuItem value="EBAY_CA">EBAY_CA</MenuItem>
                                <MenuItem value="EBAY_GB">EBAY_GB</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={excludeClient}
                                    onChange={(e) => setExcludeClient(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label="Exclude Client"
                            sx={{ m: 0, px: 1.5, minHeight: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                        />
                    </Stack>
                </Stack>

                {summaryCards.length > 0 && (
                    <Box
                        sx={{
                            mt: 3,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: 1.5
                        }}
                    >
                        {summaryCards.map((card) => (
                            <SummaryCard
                                key={card.label}
                                label={card.label}
                                value={card.value}
                                tone={card.tone}
                            />
                        ))}
                    </Box>
                )}
            </Paper>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : data && data.summary.length > 0 ? (
                <TableContainer
                    component={Paper}
                    sx={{
                        borderRadius: 4,
                        border: '1px solid',
                        borderColor: 'divider',
                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.06)',
                        overflow: 'hidden'
                    }}
                >
                    <Table stickyHeader size="small" sx={{ minWidth: 1280 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={tableHeaderCellSx} align="center">#</TableCell>
                                <TableCell sx={tableHeaderCellSx}>Store Name</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Upload Tracking</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Tracking Left</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Tracking Uploaded</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Delivered</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">In Transit</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Not Yet Shipped</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Already in Use</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Amazon</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">UPS / USPS</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Blank</TableCell>
                                <TableCell sx={tableHeaderCellSx} align="center">Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.summary.map((row, index) => {
                                const uploadedCount = row.uploadTrackingCount - row.trackingIdCount;
                                const statusMeta = getStatusMeta(row);

                                return (
                                    <TableRow
                                        key={row.sellerId}
                                        hover
                                        sx={{
                                            transition: 'background-color 0.2s ease',
                                            '&:nth-of-type(odd)': {
                                                backgroundColor: 'rgba(248, 250, 252, 0.7)'
                                            },
                                            '&:hover': {
                                                backgroundColor: 'rgba(37, 99, 235, 0.04)'
                                            },
                                            '&:last-child td': {
                                                borderBottom: 'none'
                                            }
                                        }}
                                    >
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <Box
                                                component="span"
                                                sx={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    minWidth: 32,
                                                    height: 32,
                                                    borderRadius: '50%',
                                                    backgroundColor: 'rgba(18, 59, 99, 0.08)',
                                                    color: '#123b63',
                                                    fontWeight: 700,
                                                    fontSize: '0.875rem'
                                                }}
                                            >
                                                {index + 1}
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                {row.sellerName}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {uploadedCount > 0 ? `${uploadedCount} tracking IDs uploaded` : 'No tracking uploaded yet'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.uploadTrackingCount} tone={getMetricTone(row.uploadTrackingCount, 'uploadTracking')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.trackingIdCount} tone={getMetricTone(row.trackingIdCount, 'trackingLeft')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={uploadedCount} tone={uploadedCount > 0 ? 'success' : 'neutral'} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.deliveredCount} tone={getMetricTone(row.deliveredCount, 'delivered')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.inTransitCount} tone={getMetricTone(row.inTransitCount, 'inTransit')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.notYetShippedCount} tone={getMetricTone(row.notYetShippedCount, 'notYetShipped')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.alreadyInUseCount} tone={getMetricTone(row.alreadyInUseCount, 'alreadyInUse')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.amazonCount} tone={getMetricTone(row.amazonCount, 'amazon')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.upsUspsCount} tone={getMetricTone(row.upsUspsCount, 'upsUsps')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <MetricPill value={row.blankCount} tone={getMetricTone(row.blankCount, 'blank')} />
                                        </TableCell>
                                        <TableCell sx={tableBodyCellSx} align="center">
                                            <Chip
                                                label={statusMeta.label}
                                                color={statusMeta.color}
                                                variant={statusMeta.variant}
                                                size="small"
                                                sx={{ minWidth: 94, fontWeight: 700 }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : data && data.summary.length === 0 ? (
                <Paper
                    sx={{
                        p: 5,
                        textAlign: 'center',
                        borderRadius: 4,
                        border: '1px solid',
                        borderColor: 'divider',
                        background: 'linear-gradient(180deg, #ffffff 0%, #fafcff 100%)'
                    }}
                >
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                        No orders found
                    </Typography>
                    <Typography color="text.secondary">
                        There are no awaiting-sheet rows for the selected ship-by date and marketplace.
                    </Typography>
                </Paper>
            ) : null}
        </Box>
    );
}
