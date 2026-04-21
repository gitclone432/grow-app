import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box,
    Typography,
    Paper,
    CircularProgress,
    TextField,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Snackbar,
    Alert,
    Button,
    IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Subcomponent to handle individual row logic and prevent excessive re-renders
const SalaryRow = React.memo(({ row, year, onRowUpdated, onRowDeleted }) => {
    // We use local state for the inputs to allow fast typing
    const [localRow, setLocalRow] = useState(row);
    const [saving, setSaving] = useState(false);

    // Sync local state if parent row changes
    useEffect(() => {
        setLocalRow(row);
    }, [row]);

    const handleDelete = async () => {
        if (!row._id) {
            // Unsaved row, just remove it from UI
            onRowDeleted(row);
            return;
        }

        if (window.confirm(`Are you absolutely sure you want to delete ${localRow.name || 'this employee'}'s salary record? This action cannot be undone.`)) {
            setSaving(true);
            try {
                await api.delete(`/salary/${row._id}`);
                onRowDeleted(row);
            } catch (err) {
                console.error('Failed to delete salary', err);
                alert('Failed to delete record');
                setSaving(false);
            }
        }
    };

    const handleBlur = async (month, field, value) => {
        let isMetaField = field === 'name' || field === 'designation';

        const numValue = isMetaField ? value : (parseFloat(value) || 0);
        const currentVal = isMetaField ? (localRow[field] || '') : (localRow[`${month}${field}`] || 0);

        if (numValue === currentVal) return; // No change

        let updatedRow = { ...localRow };

        if (isMetaField) {
            updatedRow[field] = numValue;
        } else {
            updatedRow[`${month}${field}`] = numValue;

            const monthIndex = MONTHS.indexOf(month);

            // CASCADE LOGIC:
            // 1. If Appraisal changes -> only affects the VERY NEXT month's amount (based on current month amount).
            //    It does NOT recursively cascade down the rest of the year automatically unless those months also have appraisals.
            // 2. If Amount changes -> we don't cascade amounts unless there's an appraisal in the current month that needs to update the next month.

            if (field === 'Appri' && monthIndex < MONTHS.length - 1) {
                const nextMonth = MONTHS[monthIndex + 1];
                const currentAmount = parseFloat(updatedRow[`${month}Amount`]) || 0;
                const currentAppri = numValue; // The new appraisal percentage

                updatedRow[`${nextMonth}Amount`] = currentAmount + (currentAmount * currentAppri / 100);
            } else if (field === 'Amount' && monthIndex < MONTHS.length - 1) {
                const nextMonth = MONTHS[monthIndex + 1];
                const currentAmount = numValue;
                const currentAppri = parseFloat(updatedRow[`${month}Appri`]) || 0;

                // If there's an appraisal on this month, we must update the next month's amount because the base amount changed.
                if (currentAppri > 0) {
                    updatedRow[`${nextMonth}Amount`] = currentAmount + (currentAmount * currentAppri / 100);
                }
            }

            // Recalculate Row Total
            let newTotal = 0;
            MONTHS.forEach(m => {
                newTotal += parseFloat(updatedRow[`${m}Amount`]) || 0;
            });
            updatedRow.total = newTotal;
        }

        setLocalRow(updatedRow);

        // Don't save if it's a new row without a name
        if (!updatedRow._id && (!updatedRow.name || updatedRow.name.trim() === '')) {
            return;
        }

        setSaving(true);
        try {
            let savedData;

            if (!updatedRow._id) {
                // It's a new row, we need to POST to create it first
                const { data } = await api.post('/salary', {
                    year,
                    name: updatedRow.name,
                    designation: updatedRow.designation
                });
                updatedRow._id = data._id; // Get the real Mongo ID
                savedData = data;
            }

            // Now PUT the full data (including amounts)
            const updateData = {
                name: updatedRow.name,
                designation: updatedRow.designation
            };

            MONTHS.forEach(m => {
                updateData[m] = {
                    amount: parseFloat(updatedRow[`${m}Amount`]) || 0,
                    appraisal: parseFloat(updatedRow[`${m}Appri`]) || 0,
                };
            });

            const { data } = await api.put(`/salary/${updatedRow._id}`, updateData);

            // Merge response back (important for getting default values if it was a new record)
            updatedRow = { ...updatedRow, ...data };
            onRowUpdated(updatedRow);

        } catch (err) {
            console.error('Failed to update salary', err);
            // Revert on failure
            setLocalRow(row);
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (month, field, value) => {
        if (field === 'name' || field === 'designation') {
            setLocalRow(prev => ({ ...prev, [field]: value }));
        } else {
            setLocalRow(prev => ({ ...prev, [`${month}${field}`]: value }));
        }
    };

    return (
        <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 }, bgcolor: saving ? 'rgba(0,0,0,0.02)' : 'inherit' }}>
            <TableCell component="th" scope="row" sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1, minWidth: 200 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <TextField
                        placeholder="Employee Name"
                        value={localRow.name || ''}
                        onChange={(e) => handleChange(null, 'name', e.target.value)}
                        onBlur={(e) => handleBlur(null, 'name', e.target.value)}
                        size="small"
                        variant="standard"
                        InputProps={{ disableUnderline: true, sx: { fontSize: '0.875rem', fontWeight: 'bold' } }}
                    />
                    <TextField
                        placeholder="Designation"
                        value={localRow.designation || ''}
                        onChange={(e) => handleChange(null, 'designation', e.target.value)}
                        onBlur={(e) => handleBlur(null, 'designation', e.target.value)}
                        size="small"
                        variant="standard"
                        InputProps={{ disableUnderline: true, sx: { fontSize: '0.75rem', color: 'text.secondary' } }}
                    />
                </Box>
            </TableCell>
            {MONTHS.map(m => (
                <React.Fragment key={m}>
                    <TableCell sx={{ minWidth: 140, p: 1 }}>
                        <TextField
                            value={localRow[`${m}Amount`] === 0 && !localRow[`${m}Amount`] ? '' : localRow[`${m}Amount`]}
                            onChange={(e) => handleChange(m, 'Amount', e.target.value)}
                            onBlur={(e) => handleBlur(m, 'Amount', e.target.value)}
                            size="small"
                            type="number"
                            variant="outlined"
                            inputProps={{ step: "100", style: { padding: '8px 10px' } }}
                        />
                    </TableCell>
                    {m !== 'dec' && (
                        <TableCell sx={{ minWidth: 80, p: 1, borderRight: '1px solid #e0e0e0' }}>
                            <TextField
                                value={localRow[`${m}Appri`] === 0 && !localRow[`${m}Appri`] ? '' : localRow[`${m}Appri`]}
                                onChange={(e) => handleChange(m, 'Appri', e.target.value)}
                                onBlur={(e) => handleBlur(m, 'Appri', e.target.value)}
                                size="small"
                                type="number"
                                variant="outlined"
                                inputProps={{ step: "1", style: { padding: '8px 10px' } }}
                            />
                        </TableCell>
                    )}
                </React.Fragment>
            ))}
            <TableCell sx={{ position: 'sticky', right: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 80 }}>
                    <Typography fontWeight="bold">₹{(localRow.total || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Typography>
                    <IconButton onClick={handleDelete} size="small" color="error" title="Delete record">
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Box>
            </TableCell>
        </TableRow>
    );
});

export default function SalaryPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const fetchSalaries = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/salary?year=${year}`);

            if (data.salaries) {
                const formattedRows = data.salaries.map((item) => {
                    const row = {
                        _id: item._id, // Real Mongo ID
                        name: item.name,
                        designation: item.designation,
                    };
                    let rowTotal = 0;
                    MONTHS.forEach(m => {
                        row[`${m}Amount`] = item[m]?.amount || 0;
                        row[`${m}Appri`] = item[m]?.appraisal || 0;
                        rowTotal += item[m]?.amount || 0;
                    });
                    row.total = rowTotal;
                    return row;
                });
                setRows(formattedRows);
            }
        } catch (err) {
            console.error('Failed to fetch salaries', err);
            setSnackbar({ open: true, message: 'Failed to load data', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSalaries();
    }, [year]);

    const handleRowUpdated = useCallback((updatedRow) => {
        setRows(prevRows => {
            // If it was a new row (didn't have _id before but does now), update it in place
            const index = prevRows.findIndex(r => r._id === updatedRow._id || (r.isNew && r.tempId === updatedRow.tempId));
            if (index !== -1) {
                const newRows = [...prevRows];
                newRows[index] = updatedRow;
                return newRows;
            }
            return prevRows;
        });
        setSnackbar({ open: true, message: 'Saved successfully', severity: 'success' });
    }, []);

    const handleRowDeleted = useCallback((deletedRow) => {
        setRows(prevRows => prevRows.filter(r => r._id !== deletedRow._id && r.tempId !== deletedRow.tempId));
        setSnackbar({ open: true, message: 'Record deleted', severity: 'info' });
    }, []);

    const handleAddNewRow = () => {
        const newRow = {
            isNew: true,
            tempId: Date.now(), // Temporary ID for React key until saved
            name: '',
            designation: '',
            total: 0
        };

        MONTHS.forEach(m => {
            newRow[`${m}Amount`] = 0;
            newRow[`${m}Appri`] = 0;
        });

        setRows(prev => [...prev, newRow]);
    };

    // Calculate Column Totals
    const totalsRow = useMemo(() => {
        if (rows.length === 0) return null;

        const tr = {
            id: 'TOTAL_ROW',
            name: 'TOTAL',
            designation: '',
            total: 0
        };

        MONTHS.forEach(m => {
            tr[`${m}Amount`] = 0;
        });

        rows.forEach(r => {
            tr.total += (r.total || 0);
            MONTHS.forEach(m => {
                tr[`${m}Amount`] += (parseFloat(r[`${m}Amount`]) || 0);
            });
        });

        return tr;
    }, [rows]);

    // Years for dropdown
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    return (
        <Box sx={{ width: '100%', mb: 4 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>Salary Page</Typography>

            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                    select
                    label="Year"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    size="small"
                >
                    {years.map((y) => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                </TextField>

                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAddNewRow}
                    sx={{ textTransform: 'none' }}
                >
                    Add Employee
                </Button>
            </Box>

            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 'calc(100vh - 200px)' }}>
                    <Table stickyHeader aria-label="sticky table" size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 2, minWidth: 200 }}>
                                    Name / Designation
                                </TableCell>
                                {MONTHS.map(m => (
                                    <React.Fragment key={m}>
                                        <TableCell align="center" sx={{ minWidth: 100, bgcolor: 'background.paper', pt: 2, pb: 2 }}>
                                            {m.charAt(0).toUpperCase() + m.slice(1)}
                                        </TableCell>
                                        {m !== 'dec' && (
                                            <TableCell align="center" sx={{ minWidth: 80, bgcolor: 'background.paper', borderRight: '1px solid #e0e0e0', pt: 2, pb: 2 }}>
                                                appri (%)
                                            </TableCell>
                                        )}
                                    </React.Fragment>
                                ))}
                                <TableCell sx={{ position: 'sticky', right: 0, bgcolor: 'background.paper', zIndex: 2 }}>
                                    Total
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={MONTHS.length * 2 + 1} align="center" sx={{ py: 10 }}>
                                        <CircularProgress />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={MONTHS.length * 2 + 1} align="center" sx={{ py: 10 }}>
                                        <Typography variant="body1" color="text.secondary">No salaries logged. Click "Add Employee" to start.</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                <>
                                    {rows.map((row) => (
                                        <SalaryRow key={row._id || row.tempId} row={row} year={year} onRowUpdated={handleRowUpdated} onRowDeleted={handleRowDeleted} />
                                    ))}

                                    {totalsRow && (
                                        <TableRow sx={{ bgcolor: 'rgba(0, 0, 0, 0.04)', fontWeight: 'bold' }}>
                                            <TableCell sx={{ position: 'sticky', left: 0, bgcolor: '#f5f5f5', zIndex: 1 }}>
                                                <Typography fontWeight="bold">TOTAL</Typography>
                                            </TableCell>
                                            {MONTHS.map(m => (
                                                <React.Fragment key={m}>
                                                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                                                        ₹{totalsRow[`${m}Amount`].toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </TableCell>
                                                    {m !== 'dec' && (
                                                        <TableCell align="center" sx={{ borderRight: '1px solid #e0e0e0' }}>
                                                            -
                                                        </TableCell>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                            <TableCell sx={{ position: 'sticky', right: 0, bgcolor: '#f5f5f5', zIndex: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 80 }}>
                                                    <Typography fontWeight="bold">₹{totalsRow.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Typography>
                                                    <Box sx={{ width: 26 }} /> {/* Spacer to align with delete button */}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
