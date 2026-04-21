import React, { useState, useEffect } from 'react';
import {
    Container,
    Paper,
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
    Grid,
    Box
} from '@mui/material';
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

const UserPerformancePage = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = user?.role || '';

    const [records, setRecords] = useState([]);
    const [error, setError] = useState('');

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

    const handleRemarkChange = async (id, newRemark) => {
        try {
            await api.patch(`/user-sellers/performance/${id}/remarks`, { remarks: newRemark });
            // Update local state to avoid full re-fetch if preferred, or just re-fetch
            setRecords((prev) =>
                prev.map((r) => (r._id === id ? { ...r, remarks: newRemark } : r))
            );
        } catch (err) {
            console.error('Failed to update remark:', err);
            alert('Failed to update remark');
        }
    };

    // Group data for the chart: User -> Date -> Total Quantity
    // Or maybe a grouped bar chart by Date vs Quantity for users
    // Assuming a simple view: aggregate by Date across the user(s) you are viewing
    const chartDataMap = {};
    records.forEach((r) => {
        const key = r.dateString;
        if (!chartDataMap[key]) {
            chartDataMap[key] = { date: key };
        }
        const username = r.user?.username || 'Unknown';
        if (!chartDataMap[key][username]) {
            chartDataMap[key][username] = 0;
        }
        chartDataMap[key][username] += r.quantity;
    });

    // Sort by date ascending to show chronological order
    const chartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));

    // Extract all unique usernames to create Bar components dynamically
    const allUsernames = new Set();
    records.forEach((r) => {
        if (r.user?.username) allUsernames.add(r.user.username);
    });
    const usersArray = Array.from(allUsernames);
    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#0088FE', '#FFBB28', '#FF8042'];

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                User Daily Performance
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {chartData.length > 0 && (
                <Paper sx={{ p: 2, mb: 4, height: 400 }}>
                    <Typography variant="h6" gutterBottom>Quantity Traced Over Time</Typography>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            {usersArray.map((username, index) => (
                                <Bar
                                    key={username}
                                    dataKey={username}
                                    stackId="a"
                                    fill={colors[index % colors.length]}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </Paper>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>User</TableCell>
                            <TableCell>Seller</TableCell>
                            <TableCell align="center">Target Quantity</TableCell>
                            <TableCell align="center">Completed Quantity</TableCell>
                            <TableCell>Remarks</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {records.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center">No performance records found</TableCell>
                            </TableRow>
                        ) : (
                            records.map((r) => (
                                <TableRow key={r._id}>
                                    <TableCell>{r.dateString}</TableCell>
                                    <TableCell>{r.user?.username}</TableCell>
                                    <TableCell>{r.seller?.user?.username || r.seller?.storeName || r.seller?._id}</TableCell>
                                    <TableCell align="center">{r.targetQuantity || 0}</TableCell>
                                    <TableCell align="center">{r.quantity}</TableCell>
                                    <TableCell>
                                        {canManageRemarks ? (
                                            <Select
                                                size="small"
                                                value={r.remarks || ''}
                                                onChange={(e) => handleRemarkChange(r._id, e.target.value)}
                                                displayEmpty
                                                sx={{ minWidth: 150 }}
                                            >
                                                <MenuItem value=""><em>None</em></MenuItem>
                                                <MenuItem value="Good">Good</MenuItem>
                                                <MenuItem value="Average">Average</MenuItem>
                                                <MenuItem value="Need for improvement">Need for improvement</MenuItem>
                                            </Select>
                                        ) : (
                                            <Typography>{r.remarks || 'None'}</Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
};

export default UserPerformancePage;
