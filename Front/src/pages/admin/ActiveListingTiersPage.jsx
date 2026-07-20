import { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert,
    Chip, Button, Divider, Grid, FormControl, InputLabel,
    Select, MenuItem, LinearProgress
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PublicIcon from '@mui/icons-material/Public';
import api, { getAuthToken } from '../../lib/api';

const TIERS = [
    { key: 'low',        label: 'Low Ticket',        range: '$0 – <$30',   color: '#2e7d32', bg: '#e8f5e9', icon: TrendingDownIcon },
    { key: 'mid',        label: 'Mid Ticket',        range: '$30 – <$60',  color: '#ed6c02', bg: '#fff3e0', icon: TrendingFlatIcon },
    { key: 'high',       label: 'High Ticket',       range: '$60 – <$100', color: '#1565c0', bg: '#e3f2fd', icon: TrendingUpIcon   },
    { key: 'extra_high', label: 'Extra High Ticket', range: '$100+',       color: '#6a1b9a', bg: '#f3e5f5', icon: EmojiEventsIcon  },
];

function TierCard({ tier, value, total }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const { label, range, color, bg, icon: Icon } = tier;
    return (
        <Paper
            elevation={2}
            sx={{
                p: 3, borderRadius: 3, textAlign: 'center',
                border: `2px solid ${color}33`,
                background: `linear-gradient(135deg, ${bg} 0%, #fff 100%)`,
            }}
        >
            <Box display="flex" justifyContent="center" mb={1}>
                <Box sx={{ bgcolor: bg, borderRadius: '50%', p: 1.2, border: `2px solid ${color}55` }}>
                    <Icon sx={{ fontSize: 28, color }} />
                </Box>
            </Box>
            <Typography variant="h3" fontWeight={800} sx={{ color }}>{value.toLocaleString()}</Typography>
            <Typography variant="subtitle1" fontWeight={700} mt={0.5}>{label}</Typography>
            <Typography variant="caption" color="textSecondary">{range} USD</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Chip
                label={`${pct}% of total`}
                size="small"
                sx={{ bgcolor: bg, color, fontWeight: 700, border: `1px solid ${color}44` }}
            />
        </Paper>
    );
}

const MP_TIERS = [
    { key: 'low',        label: 'Low',        color: '#2e7d32', bg: '#e8f5e9' },
    { key: 'mid',        label: 'Mid',        color: '#ed6c02', bg: '#fff3e0' },
    { key: 'high',       label: 'High',       color: '#1565c0', bg: '#e3f2fd' },
    { key: 'extra_high', label: 'Extra High', color: '#6a1b9a', bg: '#f3e5f5' },
];

function MarketplaceBreakdown({ data, total }) {
    return (
        <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #e0e0e0', mt: 3 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
                <PublicIcon sx={{ color: '#555' }} />
                <Typography variant="subtitle1" fontWeight={700}>Marketplace Breakdown</Typography>
                <Typography variant="caption" color="textSecondary">(based on listing currency)</Typography>
            </Box>
            <Box display="flex" flexDirection="column" gap={2.4}>
                {data.map(({ currency, total: mpTotal, label, flag, tiers: mpTiers }) => {
                    const pct = total > 0 ? Math.round((mpTotal / total) * 100) : 0;
                    return (
                        <Box key={currency}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Typography fontSize="1.1rem">{flag}</Typography>
                                    <Typography variant="body2" fontWeight={600}>{label}</Typography>
                                    <Typography variant="caption" color="textSecondary">({currency})</Typography>
                                </Box>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Typography variant="body2" fontWeight={700}>{mpTotal.toLocaleString()}</Typography>
                                    <Chip label={`${pct}%`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                </Box>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={pct}
                                sx={{
                                    height: 7, borderRadius: 4,
                                    bgcolor: '#f0f0f0',
                                    '& .MuiLinearProgress-bar': { borderRadius: 4 }
                                }}
                            />
                            {/* Per-marketplace tier chips */}
                            <Box display="flex" gap={0.8} mt={1} flexWrap="wrap">
                                {MP_TIERS.map(t => (
                                    <Chip
                                        key={t.key}
                                        size="small"
                                        label={`${t.label}: ${(mpTiers[t.key] ?? 0).toLocaleString()}`}
                                        sx={{
                                            height: 22, fontSize: '0.7rem', fontWeight: 700,
                                            bgcolor: t.bg, color: t.color,
                                            border: `1px solid ${t.color}44`,
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
}

export default function ActiveListingTiersPage() {
    const [sellers, setSellers]               = useState([]);
    const [sellersLoading, setSellersLoading] = useState(true);
    const [selectedSellerId, setSelectedSellerId] = useState('');

    const [result, setResult]   = useState(null);   // { tiers, sellerName, pagesFetched }
    const [fetching, setFetching] = useState(false);
    const [error, setError]     = useState(null);
    const [progress, setProgress] = useState(null); // { page, totalPages, count }

    // Load seller list on mount
    useEffect(() => {
        const loadSellers = async () => {
            setSellersLoading(true);
            try {
                const { data } = await api.get('/sellers/all');
                setSellers(data);
                if (data.length > 0) setSelectedSellerId(data[0]._id);
            } catch {
                try {
                    const { data } = await api.get('/sellers/me');
                    setSellers([data]);
                    setSelectedSellerId(data._id);
                } catch {
                    setError('Failed to load sellers.');
                }
            } finally {
                setSellersLoading(false);
            }
        };
        loadSellers();
    }, []);

    const handleFetch = async () => {
        if (!selectedSellerId) return;
        setFetching(true);
        setError(null);
        setResult(null);
        setProgress(null);
        try {
            const baseURL = import.meta.env.VITE_API_URL;
            const token = getAuthToken();
            const response = await fetch(
                `${baseURL}/ebay/active-listings/live-tiers?sellerId=${selectedSellerId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Request failed (${response.status})`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete line
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const evt = JSON.parse(line.slice(6));
                    if (evt.type === 'progress') {
                        setProgress({ page: evt.page, totalPages: evt.totalPages, count: evt.count });
                    } else if (evt.type === 'done') {
                        setResult(evt);
                    } else if (evt.type === 'error') {
                        throw new Error(evt.error);
                    }
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch listing data from eBay.');
        } finally {
            setFetching(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ mt: 2, mb: 6 }}>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="h4" fontWeight={700}>Active Listings by Price Tier</Typography>
                <Typography variant="body2" color="textSecondary">
                    Select a seller and fetch live counts from eBay, broken down by USD price range.
                </Typography>
            </Box>

            {/* Info banner */}
            <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="body2">
                    Prices are pulled in real-time from eBay&apos;s <strong>ConvertedCurrentPrice</strong> field (always in USD).
                    Low: <strong>$0 – &lt;$30</strong>&nbsp; · &nbsp;
                    Mid: <strong>$30 – &lt;$60</strong>&nbsp; · &nbsp;
                    High: <strong>$60 – &lt;$100</strong>&nbsp; · &nbsp;
                    Extra High: <strong>$100+</strong>
                </Typography>
            </Alert>

            {/* Seller selector + Fetch button */}
            <Paper elevation={1} sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid #e0e0e0' }}>
                <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                    <FormControl size="small" sx={{ minWidth: 260 }} disabled={sellersLoading}>
                        <InputLabel>Select Seller</InputLabel>
                        <Select
                            value={selectedSellerId}
                            label="Select Seller"
                            onChange={e => {
                                setSelectedSellerId(e.target.value);
                                setResult(null);
                                setError(null);
                            }}
                        >
                            {sellers.map(s => (
                                <MenuItem key={s._id} value={s._id}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <StorefrontIcon sx={{ fontSize: 16, color: '#666' }} />
                                        {s.user?.username || s._id}
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button
                        variant="contained"
                        size="medium"
                        startIcon={fetching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                        onClick={handleFetch}
                        disabled={fetching || !selectedSellerId}
                        sx={{ minWidth: 170 }}
                    >
                        {fetching ? 'Fetching from eBay…' : 'Fetch Live Data'}
                    </Button>
                </Box>

                {fetching && (
                    <Box mt={2}>
                        {progress ? (
                            <>
                                <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                                    <Typography variant="caption" color="textSecondary">
                                        Page <strong>{progress.page}</strong> of <strong>{progress.totalPages}</strong>
                                        &nbsp;·&nbsp;{progress.count.toLocaleString()} listings scanned so far
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">
                                        {progress.totalPages > 0 ? Math.round((progress.page / progress.totalPages) * 100) : 0}%
                                    </Typography>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={progress.totalPages > 0 ? (progress.page / progress.totalPages) * 100 : 0}
                                    sx={{ borderRadius: 2, height: 6 }}
                                />
                            </>
                        ) : (
                            <>
                                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 0.5 }}>
                                    Connecting to eBay…
                                </Typography>
                                <LinearProgress sx={{ borderRadius: 2, height: 6 }} />
                            </>
                        )}
                    </Box>
                )}
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {/* Results */}
            {result && (
                <>
                    <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
                        <StorefrontIcon sx={{ color: '#555' }} />
                        <Typography variant="h6" fontWeight={700}>{result.sellerName}</Typography>
                        <Chip label={`${result.tiers.total.toLocaleString()} active listings`} color="primary" />
                        <Typography variant="caption" color="textSecondary">
                            ({result.pagesFetched} page{result.pagesFetched !== 1 ? 's' : ''} fetched from eBay)
                        </Typography>
                    </Box>

                    {/* Price tier cards */}
                    <Grid container spacing={3}>
                        {TIERS.map(tier => (
                            <Grid item xs={12} sm={6} md={3} key={tier.key}>
                                <TierCard
                                    tier={tier}
                                    value={result.tiers[tier.key]}
                                    total={result.tiers.total}
                                />
                            </Grid>
                        ))}
                    </Grid>

                    {/* Marketplace breakdown */}
                    {result.marketplaceBreakdown?.length > 0 && (
                        <MarketplaceBreakdown
                            data={result.marketplaceBreakdown}
                            total={result.tiers.total}
                        />
                    )}
                </>
            )}

            {/* Empty state */}
            {!result && !fetching && !error && (
                <Box
                    display="flex" flexDirection="column"
                    alignItems="center" justifyContent="center"
                    py={10} color="text.secondary"
                >
                    <SearchIcon sx={{ fontSize: 56, mb: 2, opacity: 0.25 }} />
                    <Typography variant="body1">
                        Select a seller and click <strong>Fetch Live Data</strong>
                    </Typography>
                </Box>
            )}
        </Container>
    );
}
