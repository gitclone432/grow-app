import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Chip,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Select,
    MenuItem,
    Alert,
    Box,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import api from '../../lib/api';
import SectionCard from '../../components/SectionCard.jsx';
import { BRAND_DARK, BRAND_DARK_ALT, BRAND_YELLOW } from '../../constants/brandTheme.js';
import {
    tableBodyCellSx,
    tableBodyRowSx,
    tableContainerSx,
    tableHeaderCellSx,
} from '../../theme/tableStyles.js';

const chartColors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#06b6d4', '#ec4899', '#0f766e'];
const remarkOptions = ['', 'Good', 'Average', 'Need for improvement'];

function getCurrentDateString() {
    return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

const UserPerformancePage = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = user?.role || '';

    const [records, setRecords] = useState([]);
    const [error, setError] = useState('');
    const [viewMode, setViewMode] = useState('user');
    // Default to a recent range so stores/rows are visible (single-day default often looks empty)
    const [dateMode, setDateMode] = useState('range');
    const [selectedDate, setSelectedDate] = useState(() => getCurrentDateString());
    const [startDate, setStartDate] = useState(() => getDateDaysAgo(30));
    const [endDate, setEndDate] = useState(() => getCurrentDateString());
    const didAutoDateRef = useRef(false);

    const canManageRemarks = ['superadmin', 'hr', 'hradmin'].includes(userRole);

    useEffect(() => {
        fetchPerformance();
    }, []);

    const fetchPerformance = async () => {
        try {
            const { data } = await api.get('/user-sellers/performance');
            setRecords(data);
        } catch (err) {
            console.error('Failed to fetch performance records:', err);
            setError('Failed to load performance data');
        }
    };

    // If the selected filter has no rows but history exists, expand/jump to data (once).
    useEffect(() => {
        if (didAutoDateRef.current || !records.length) return;
        const dates = [...new Set(records.map((r) => r.dateString).filter(Boolean))].sort();
        if (!dates.length) return;

        if (dateMode === 'single') {
            const hasSelected = records.some((r) => r.dateString === selectedDate);
            if (!hasSelected) {
                setSelectedDate(dates[dates.length - 1]);
            }
        } else {
            const hasInRange = records.some((r) => {
                if (startDate && r.dateString < startDate) return false;
                if (endDate && r.dateString > endDate) return false;
                return true;
            });
            if (!hasInRange) {
                setStartDate(dates[0]);
                setEndDate(dates[dates.length - 1]);
            }
        }
        didAutoDateRef.current = true;
    }, [records, dateMode, selectedDate, startDate, endDate]);

    const handleRemarkChange = async (id, newRemark) => {
        try {
            await api.patch(`/user-sellers/performance/${id}/remarks`, { remarks: newRemark });
            setRecords((prev) =>
                prev.map((r) => (r._id === id ? { ...r, remarks: newRemark } : r))
            );
        } catch (err) {
            console.error('Failed to update remark:', err);
            alert('Failed to update remark');
        }
    };

    const filteredRecords = useMemo(() => {
        return records.filter((record) => {
            if (!record.dateString) return false;
            if (dateMode === 'single') {
                return record.dateString === selectedDate;
            }

            if (startDate && record.dateString < startDate) return false;
            if (endDate && record.dateString > endDate) return false;
            return true;
        });
    }, [records, dateMode, selectedDate, startDate, endDate]);

    const groupRowsByUser = (sourceRecords) => {
        const grouped = new Map();
        sourceRecords.forEach((record) => {
            const userId = record.user?._id || record.user?.username || 'unknown';
            const key = `${record.dateString}::${userId}`;
            const existing = grouped.get(key);

            if (existing) {
                existing.quantity += Number(record.quantity) || 0;
                existing.targetQuantity += Number(record.targetQuantity) || 0;
                existing.sellerNames.add(record.seller?.user?.username || record.seller?.storeName || record.seller?._id || 'Unknown');
            } else {
                grouped.set(key, {
                    _id: key,
                    dateString: record.dateString,
                    user: record.user,
                    sellerNames: new Set([record.seller?.user?.username || record.seller?.storeName || record.seller?._id || 'Unknown']),
                    quantity: Number(record.quantity) || 0,
                    targetQuantity: Number(record.targetQuantity) || 0,
                    remarks: '',
                });
            }
        });

        return Array.from(grouped.values())
            .map((row) => ({
                ...row,
                sellerDisplay: Array.from(row.sellerNames).join(', '),
            }))
            .sort((a, b) => b.dateString.localeCompare(a.dateString) || String(a.user?.username || '').localeCompare(String(b.user?.username || '')));
    };

    const displayRows = useMemo(() => {
        if (viewMode === 'seller') {
            return filteredRecords;
        }

        return groupRowsByUser(filteredRecords);
    }, [filteredRecords, viewMode]);

    const chartRows = useMemo(() => {
        if (viewMode === 'seller') {
            return records;
        }

        return groupRowsByUser(records);
    }, [records, viewMode]);

    const chartSeries = useMemo(() => {
        const seriesMap = {};
        chartRows.forEach((row) => {
            const key = row.dateString;
            if (!seriesMap[key]) {
                seriesMap[key] = { date: key };
            }

            const label = viewMode === 'seller'
                ? (row.seller?.user?.username || row.seller?.storeName || row.seller?._id || 'Unknown')
                : (row.user?.username || 'Unknown');

            if (!seriesMap[key][label]) {
                seriesMap[key][label] = 0;
            }
            seriesMap[key][label] += Number(row.quantity) || 0;
        });

        return Object.values(seriesMap).sort((a, b) => a.date.localeCompare(b.date));
    }, [chartRows, viewMode]);

    const chartKeys = useMemo(() => {
        const keys = new Set();
        chartRows.forEach((row) => {
            const label = viewMode === 'seller'
                ? (row.seller?.user?.username || row.seller?.storeName || row.seller?._id || 'Unknown')
                : (row.user?.username || 'Unknown');
            keys.add(label);
        });
        return Array.from(keys);
    }, [chartRows, viewMode]);

    const sellerCount = new Set(records.map((record) => record.seller?._id).filter(Boolean)).size;

    const getRemarkChipSx = (remark) => {
        if (remark === 'Good') {
            return {
                color: '#166534',
                bgcolor: alpha('#16a34a', 0.12),
                border: `1px solid ${alpha('#16a34a', 0.2)}`,
            };
        }
        if (remark === 'Average') {
            return {
                color: '#92400e',
                bgcolor: alpha('#f59e0b', 0.14),
                border: `1px solid ${alpha('#f59e0b', 0.22)}`,
            };
        }
        if (remark === 'Need for improvement') {
            return {
                color: '#b91c1c',
                bgcolor: alpha('#ef4444', 0.12),
                border: `1px solid ${alpha('#ef4444', 0.2)}`,
            };
        }

        return {
            color: alpha(BRAND_DARK, 0.76),
            bgcolor: alpha(BRAND_DARK, 0.05),
            border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
        };
    };

    return (
        <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
            <SectionCard
                emphasized
                sx={{
                    mb: 3,
                    overflow: 'hidden',
                    background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 55%, #31577d 100%)`,
                    border: `1px solid ${alpha(BRAND_YELLOW, 0.18)}`,
                    color: '#fffdf0',
                    position: 'relative',
                }}
            >
                <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                    <Box sx={{ position: 'absolute', top: -96, right: -68, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` }} />
                    <Box sx={{ position: 'absolute', bottom: -88, left: '24%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, transparent 70%)' }} />
                </Box>

                <Box sx={{ position: 'relative', p: { xs: 3, md: 4 }, display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between' }}>
                    <Box sx={{ maxWidth: 840 }}>
                        <Chip
                            label="Performance Analytics"
                            size="small"
                            sx={{
                                mb: 1.5,
                                bgcolor: alpha(BRAND_YELLOW, 0.14),
                                color: BRAND_YELLOW,
                                border: `1px solid ${alpha(BRAND_YELLOW, 0.24)}`,
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                            }}
                        />
                        <Typography variant="h4" component="h1" sx={{ fontWeight: 900, lineHeight: 1.1, mb: 1 }}>
                            User Daily Performance
                        </Typography>
                        <Typography sx={{ color: 'rgba(255, 253, 240, 0.76)', maxWidth: 720 }}>
                            Review completed quantities over time, compare contributor output, and manage performance remarks from the updated admin dashboard layout.
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1.25, flexDirection: { xs: 'row', md: 'column' }, flexWrap: 'wrap' }}>
                        <Chip label={`${displayRows.length} Visible Rows`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
                        <Chip label={`${chartKeys.length} ${viewMode === 'seller' ? 'Seller Accounts' : 'Users'}`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
                        <Chip label={`${sellerCount} Sellers`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
                    </Box>
                </Box>
            </SectionCard>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {!error && records.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    No performance rows yet. Stores appear here only after they are assigned under
                    {' '}<strong>User-Seller Assignments</strong> with a <strong>Daily Target &gt; 0</strong>.
                </Alert>
            )}

            <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, background: 'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)' }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK, mb: 0.5 }}>
                        View Controls
                    </Typography>
                    <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                        Switch between user and seller-account views, and filter the logs by a single date or a date range.
                    </Typography>
                </Box>

                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between">
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <Box>
                            <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: alpha(BRAND_DARK, 0.64), fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                Group By
                            </Typography>
                            <ToggleButtonGroup
                                exclusive
                                value={viewMode}
                                onChange={(_, nextValue) => nextValue && setViewMode(nextValue)}
                                size="small"
                            >
                                <ToggleButton value="user">User</ToggleButton>
                                <ToggleButton value="seller">Seller Account</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <Box>
                            <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: alpha(BRAND_DARK, 0.64), fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                Date Mode
                            </Typography>
                            <ToggleButtonGroup
                                exclusive
                                value={dateMode}
                                onChange={(_, nextValue) => nextValue && setDateMode(nextValue)}
                                size="small"
                            >
                                <ToggleButton value="single">Single Date</ToggleButton>
                                <ToggleButton value="range">Date Range</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        {dateMode === 'single' ? (
                            <TextField
                                label="Date"
                                type="date"
                                size="small"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { backgroundColor: '#fff' } }}
                            />
                        ) : (
                            <>
                                <TextField
                                    label="Start Date"
                                    type="date"
                                    size="small"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { backgroundColor: '#fff' } }}
                                />
                                <TextField
                                    label="End Date"
                                    type="date"
                                    size="small"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { backgroundColor: '#fff' } }}
                                />
                            </>
                        )}
                    </Stack>
                </Stack>
            </SectionCard>

            {chartSeries.length > 0 ? (
                <SectionCard sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                    <Box sx={{ mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha('#2563eb', 0.14)}`, background: `linear-gradient(135deg, ${alpha('#2563eb', 0.1)} 0%, ${alpha('#10b981', 0.04)} 100%)` }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK, mb: 0.5 }}>
                            Quantity Traced Over Time
                        </Typography>
                        <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                            Stacked bars show each {viewMode === 'seller' ? 'seller account' : 'user'}'s completed quantity contribution by day.
                        </Typography>
                    </Box>

                    <Box sx={{ height: 400 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartSeries} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={alpha(BRAND_DARK, 0.12)} vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: alpha(BRAND_DARK, 0.68), fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: alpha(BRAND_DARK, 0.68), fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 16, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, boxShadow: '0 18px 34px rgba(15, 23, 42, 0.14)' }}
                                    cursor={{ fill: alpha('#2563eb', 0.06) }}
                                />
                                <Legend />
                                {chartKeys.map((seriesKey, index) => (
                                    <Bar
                                        key={seriesKey}
                                        dataKey={seriesKey}
                                        stackId="a"
                                        fill={chartColors[index % chartColors.length]}
                                        radius={index === chartKeys.length - 1 ? [6, 6, 0, 0] : 0}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </Box>
                </SectionCard>
            ) : null}

            <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
                <Box sx={{ mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, background: 'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)' }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK, mb: 0.5 }}>
                        Performance Records
                    </Typography>
                    <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                        Review daily targets, completed quantities, sellers, and remarks for each {viewMode === 'seller' ? 'seller-account entry' : 'user summary'}.
                    </Typography>
                </Box>

                <TableContainer sx={tableContainerSx}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={tableHeaderCellSx}>Date</TableCell>
                                <TableCell sx={tableHeaderCellSx}>User</TableCell>
                                <TableCell sx={tableHeaderCellSx}>Seller</TableCell>
                                <TableCell align="center" sx={tableHeaderCellSx}>Target Quantity</TableCell>
                                <TableCell align="center" sx={tableHeaderCellSx}>Completed Quantity</TableCell>
                                <TableCell sx={tableHeaderCellSx}>Remarks</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {displayRows.length === 0 ? (
                                <TableRow sx={tableBodyRowSx}>
                                    <TableCell colSpan={6} align="center" sx={{ ...tableBodyCellSx, py: 3 }}>
                                        {records.length === 0
                                            ? 'No performance records found'
                                            : 'No records in the selected date filter — widen the date range or switch date mode'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                displayRows.map((r) => (
                                    <TableRow key={r._id} sx={tableBodyRowSx}>
                                        <TableCell sx={tableBodyCellSx}>{r.dateString}</TableCell>
                                        <TableCell sx={tableBodyCellSx}>{r.user?.username}</TableCell>
                                        <TableCell sx={tableBodyCellSx}>{viewMode === 'seller' ? (r.seller?.user?.username || r.seller?.storeName || r.seller?._id) : (r.sellerDisplay || 'Multiple')}</TableCell>
                                        <TableCell align="center" sx={tableBodyCellSx}>{r.targetQuantity || 0}</TableCell>
                                        <TableCell align="center" sx={tableBodyCellSx}>{r.quantity}</TableCell>
                                        <TableCell sx={tableBodyCellSx}>
                                            {canManageRemarks && viewMode === 'seller' ? (
                                                <Select
                                                    size="small"
                                                    value={r.remarks || ''}
                                                    onChange={(e) => handleRemarkChange(r._id, e.target.value)}
                                                    displayEmpty
                                                    sx={{
                                                        minWidth: 170,
                                                        '& .MuiOutlinedInput-notchedOutline': {
                                                            borderColor: alpha(BRAND_DARK, 0.14),
                                                        },
                                                        '& .MuiOutlinedInput-root': {
                                                            backgroundColor: '#fff',
                                                        },
                                                    }}
                                                >
                                                    {remarkOptions.map((option) => (
                                                        <MenuItem key={option || 'none'} value={option}>
                                                            {option || 'None'}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            ) : (
                                                <Chip label={r.remarks || 'None'} size="small" sx={getRemarkChipSx(r.remarks)} />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </SectionCard>
        </Box>
    );
};

export default UserPerformancePage;
