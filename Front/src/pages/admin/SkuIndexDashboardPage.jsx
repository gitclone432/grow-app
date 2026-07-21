import { useCallback, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Fade,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import api from '../../lib/api';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import { BRAND_DARK, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import {
    tableBodyCellSx,
    tableBodyRowSx,
    tableContainerSx,
    tableHeaderCellSx,
    tableIndexBadgeSx,
    yellowFilledButtonSx,
} from '../../theme/tableStyles.js';

const T = dashboardSignatureTokens;

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

function HeaderTooltip({ label, title, align = 'left' }) {
    return (
        <Tooltip title={title} arrow placement="top">
            <Box
                component="span"
                sx={{
                    display: 'inline-flex',
                    justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                    width: '100%',
                    cursor: 'help',
                    textDecoration: 'underline dotted',
                    textUnderlineOffset: 3,
                }}
            >
                {label}
            </Box>
        </Tooltip>
    );
}

export default function SkuIndexDashboardPage() {
    const [countrySummary, setCountrySummary] = useState(null);
    const [multiCurrencySkus, setMultiCurrencySkus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState(null);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [countryResponse, multiCurrencyResponse] = await Promise.all([
                api.get('/sellers/sku-duplicates-by-country'),
                api.get('/sellers/skus-in-multiple-currencies'),
            ]);
            setCountrySummary(countryResponse.data);
            setMultiCurrencySkus(multiCurrencyResponse.data);
            setHasLoaded(true);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load SKU index dashboard.');
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <Fade in timeout={500}>
            <AdminPageShell>
                <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3, background: T.surfaces.pageCard }}>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        gap={2}
                    >
                        <PageHeader
                            title="SKU Index Dashboard"
                            subtitle="Country-level SKU index counts and SKUs present in multiple currencies."
                            sx={{ pt: 0, pb: 0 }}
                        />
                        <Button
                            variant="outlined"
                            startIcon={loading ? <CircularProgress size={16} thickness={5} sx={{ color: BRAND_DARK }} /> : <SearchIcon />}
                            onClick={loadDashboard}
                            disabled={loading}
                            sx={yellowFilledButtonSx}
                        >
                            {loading ? 'Loading...' : hasLoaded ? 'Refresh Data' : 'Get Data'}
                        </Button>
                    </Stack>
                </SectionCard>

                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

                {!hasLoaded && !loading && (
                    <SectionCard sx={{ p: 5, textAlign: 'center', background: T.surfaces.emptyState }}>
                        <Typography fontWeight={800} sx={{ color: BRAND_DARK }}>
                            Click Get Data to load the SKU index dashboard.
                        </Typography>
                    </SectionCard>
                )}

                {countrySummary && (
                    <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3, background: T.surfaces.pageCard }}>
                        <Stack spacing={2.5}>
                            <Box>
                                <Typography variant="h6" fontWeight={800} sx={{ color: BRAND_DARK }}>
                                    SKU Index by Country
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Each SKU is counted once per currency country; repeated listings are shown as extra duplicate count.
                                </Typography>
                            </Box>

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                <Box sx={{ flex: 1, p: 1.6, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, bgcolor: T.surfaces.metricCard }}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>Unique SKUs</Typography>
                                    <Typography variant="h5" fontWeight={900} sx={{ color: BRAND_DARK }}>
                                        {Number(countrySummary.totals?.uniqueSkuCount || 0).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Box sx={{ flex: 1, p: 1.6, borderRadius: 2, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, bgcolor: T.surfaces.metricCard }}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>Total Listings</Typography>
                                    <Typography variant="h5" fontWeight={900} sx={{ color: BRAND_DARK }}>
                                        {Number(countrySummary.totals?.listingCount || 0).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Box sx={{ flex: 1, p: 1.6, borderRadius: 2, border: `1px solid ${T.tones.warning.border}`, bgcolor: T.tones.warning.background }}>
                                    <Typography variant="caption" sx={{ color: T.tones.warning.color }} fontWeight={700}>Duplicate SKU Names</Typography>
                                    <Typography variant="h5" fontWeight={900} sx={{ color: T.tones.warning.color }}>
                                        {Number(countrySummary.totals?.duplicateSkuCount || 0).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Box sx={{ flex: 1, p: 1.6, borderRadius: 2, border: `1px solid ${T.tones.danger.border}`, bgcolor: T.tones.danger.background }}>
                                    <Typography variant="caption" sx={{ color: T.tones.danger.color }} fontWeight={700}>Extra Count</Typography>
                                    <Typography variant="h5" fontWeight={900} sx={{ color: T.tones.danger.color }}>
                                        {Number(countrySummary.totals?.extraCount || 0).toLocaleString()}
                                    </Typography>
                                </Box>
                            </Stack>

                            <TableContainer sx={{ ...tableContainerSx, maxHeight: 430, overflow: 'auto' }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ ...tableHeaderCellSx, width: 58 }}>
                                                <HeaderTooltip label="#" title="Rank by highest extra duplicate count." />
                                            </TableCell>
                                            <TableCell sx={tableHeaderCellSx}>
                                                <HeaderTooltip label="Country" title="Country is derived from the SKU index currency." />
                                            </TableCell>
                                            <TableCell align="right" sx={tableHeaderCellSx}>
                                                <HeaderTooltip label="SKU Count" align="right" title="Unique SKU names in this country. A SKU appearing once or many times still counts as 1." />
                                            </TableCell>
                                            <TableCell align="right" sx={tableHeaderCellSx}>
                                                <HeaderTooltip label="Listings" align="right" title="Total SKU index listing rows in this country." />
                                            </TableCell>
                                            <TableCell align="right" sx={tableHeaderCellSx}>
                                                <HeaderTooltip label="Duplicate SKUs" align="right" title="Number of SKU names that appear on more than one listing." />
                                            </TableCell>
                                            <TableCell align="right" sx={tableHeaderCellSx}>
                                                <HeaderTooltip label="Extra Count" align="right" title="Extra duplicate listings after the first valid listing for each SKU. Example: 3 listings for ABC means extra count is 2." />
                                            </TableCell>
                                            <TableCell sx={tableHeaderCellSx}>
                                                <HeaderTooltip label="Top Extra SKUs" title="Highest duplicate SKUs in this country, shown as SKU plus extra duplicate count." />
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(countrySummary.countries || []).map((row, index) => (
                                            <TableRow key={row.country} sx={tableBodyRowSx}>
                                                <TableCell sx={{ ...tableBodyCellSx, width: 58 }}>
                                                    <Box sx={{ ...tableIndexBadgeSx, width: 28, height: 28, fontSize: '0.78rem' }}>{index + 1}</Box>
                                                </TableCell>
                                                <TableCell sx={tableBodyCellSx}>
                                                    <Typography fontWeight={800} sx={{ color: BRAND_DARK }}>
                                                        {row.country}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {(row.currencies || []).join(', ')}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right" sx={tableBodyCellSx}>{Number(row.uniqueSkuCount || 0).toLocaleString()}</TableCell>
                                                <TableCell align="right" sx={tableBodyCellSx}>{Number(row.listingCount || 0).toLocaleString()}</TableCell>
                                                <TableCell align="right" sx={tableBodyCellSx}>
                                                    <ToneChip label={Number(row.duplicateSkuCount || 0).toLocaleString()} tone={row.duplicateSkuCount > 0 ? 'warning' : 'success'} />
                                                </TableCell>
                                                <TableCell align="right" sx={tableBodyCellSx}>
                                                    <ToneChip label={Number(row.extraCount || 0).toLocaleString()} tone={row.extraCount > 0 ? 'danger' : 'success'} />
                                                </TableCell>
                                                <TableCell sx={tableBodyCellSx}>
                                                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                                        {(row.topDuplicates || []).slice(0, 5).map(item => (
                                                            <Tooltip key={item.sku} title={`${item.listingCount} listings, ${item.extraCount} extra`}>
                                                                <Chip
                                                                    size="small"
                                                                    label={`${item.sku}: +${item.extraCount}`}
                                                                    sx={{
                                                                        maxWidth: 180,
                                                                        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                                                                        fontWeight: 800,
                                                                        bgcolor: alpha(BRAND_DARK, 0.05),
                                                                        border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
                                                                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        ))}
                                                        {!row.topDuplicates?.length && (
                                                            <Typography variant="caption" color="text.secondary">No extras</Typography>
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Stack>
                    </SectionCard>
                )}

                {multiCurrencySkus && (
                    <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3, background: T.surfaces.pageCard }}>
                        <Stack spacing={2.5}>
                            <Box>
                                <Typography variant="h6" fontWeight={800} sx={{ color: BRAND_DARK }}>
                                    SKUs in Multiple Currencies
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    SKU names that appear in more than one currency group, such as USD and AUD.
                                </Typography>
                            </Box>

                            {multiCurrencySkus.skus?.length ? (
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                    <Box sx={{ flex: 1, p: 1.8, borderRadius: 2, border: `1px solid ${T.tones.warning.border}`, bgcolor: T.tones.warning.background }}>
                                        <Typography variant="caption" sx={{ color: T.tones.warning.color }} fontWeight={800}>
                                            SKU Count
                                        </Typography>
                                        <Typography variant="h4" fontWeight={900} sx={{ color: T.tones.warning.color }}>
                                            {Number(multiCurrencySkus.total || 0).toLocaleString()}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ flex: 1, p: 1.8, borderRadius: 2, border: `1px solid ${T.tones.danger.border}`, bgcolor: T.tones.danger.background }}>
                                        <Typography variant="caption" sx={{ color: T.tones.danger.color }} fontWeight={800}>
                                            Extra Count
                                        </Typography>
                                        <Typography variant="h4" fontWeight={900} sx={{ color: T.tones.danger.color }}>
                                            {Number(multiCurrencySkus.extraCount || 0).toLocaleString()}
                                        </Typography>
                                    </Box>
                                </Stack>
                            ) : (
                                <Box py={5} textAlign="center">
                                    <CheckCircleOutlineIcon sx={{ fontSize: 40, color: T.tones.success.color, mb: 1 }} />
                                    <Typography fontWeight={800} sx={{ color: T.tones.success.color }}>
                                        No SKUs found in multiple currencies.
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                    </SectionCard>
                )}
            </AdminPageShell>
        </Fade>
    );
}
