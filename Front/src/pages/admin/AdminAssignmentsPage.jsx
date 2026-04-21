import { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Stack, Chip, useMediaQuery, useTheme } from '@mui/material';
import api from '../../lib/api.js';

export default function AdminAssignmentsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [rows, setRows] = useState([]);
  const [listers, setListers] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/assignments/analytics/admin-lister'),
      api.get('/users/listers')
    ]).then(([r, l]) => {
      setRows(r.data);
      setListers(l.data);
    });
  }, []);

  const perAdmin = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.adminId || 'unassigned';
      if (!map.has(key)) map.set(key, { adminName: r.adminName || 'Unassigned', tasksCount: 0, quantityTotal: 0, completedCount: 0, completedQty: 0 });
      const agg = map.get(key);
      agg.tasksCount += r.tasksCount;
      agg.quantityTotal += r.quantityTotal;
      agg.completedCount += r.completedCount;
      agg.completedQty += r.completedQty;
    }
    // Add pending fields
    return Array.from(map.values()).map(r => ({
      ...r,
      pendingTasks: r.tasksCount - r.completedCount,
      pendingQty: r.quantityTotal - r.completedQty
    }));
  }, [rows]);

  const perLister = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!r.listerId) continue;
      const key = r.listerId;
      if (!map.has(key)) map.set(key, { listerName: r.listerName || 'Unknown', tasksCount: 0, quantityTotal: 0, completedCount: 0, completedQty: 0 });
      const agg = map.get(key);
      agg.tasksCount += r.tasksCount;
      agg.quantityTotal += r.quantityTotal;
      agg.completedCount += r.completedCount;
      agg.completedQty += r.completedQty;
    }
    // Add pending fields
    return Array.from(map.values()).map(r => ({
      ...r,
      pendingTasks: r.tasksCount - r.completedCount,
      pendingQty: r.quantityTotal - r.completedQty
    }));
  }, [rows]);

  const SummaryCards = ({ items, kind }) => (
    <Stack spacing={1.5}>
      {items.map((r, idx) => (
        <Paper key={`${kind}-${idx}`} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {kind === 'admin' ? r.adminName : kind === 'lister' ? r.listerName : `${r.date || '-'} • ${r.adminName || 'Unassigned'} → ${r.listerName || '-'}`}
            </Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Tasks: ${r.tasksCount}`} />
              <Chip size="small" label={`Pending Tasks: ${r.pendingTasks}`} />
              <Chip size="small" label={`Qty: ${r.quantityTotal}`} />
              <Chip size="small" label={`Pending Qty: ${r.pendingQty}`} />
              <Chip size="small" label={`Completed Tasks: ${r.completedCount}`} />
              <Chip size="small" label={`Completed Qty: ${r.completedQty}`} />
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Assignments Summary</Typography>

      <Typography variant="subtitle1" sx={{ mb: 1 }}>Listing Admin Summary</Typography>

      {/* MOBILE */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
        <SummaryCards items={perAdmin} kind="admin" />
      </Box>

      {/* DESKTOP */}
      <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, mb: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Listing Admin</TableCell>
              <TableCell>Tasks Assigned</TableCell>
              <TableCell>Pending Tasks</TableCell>
              <TableCell>Total Quantity</TableCell>
              <TableCell>Pending Quantity</TableCell>
              <TableCell>Completed Tasks</TableCell>
              <TableCell>Completed Quantity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {perAdmin.map((r, idx) => (
              <TableRow key={idx}>
                <TableCell>{r.adminName}</TableCell>
                <TableCell>{r.tasksCount}</TableCell>
                <TableCell>{r.pendingTasks}</TableCell>
                <TableCell>{r.quantityTotal}</TableCell>
                <TableCell>{r.pendingQty}</TableCell>
                <TableCell>{r.completedCount}</TableCell>
                <TableCell>{r.completedQty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" sx={{ mb: 1 }}>Lister Summary</Typography>

      {/* MOBILE */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
        <SummaryCards items={perLister} kind="lister" />
      </Box>

      {/* DESKTOP */}
      <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, mb: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Lister</TableCell>
              <TableCell>Tasks Assigned</TableCell>
              <TableCell>Pending Tasks</TableCell>
              <TableCell>Total Quantity</TableCell>
              <TableCell>Pending Quantity</TableCell>
              <TableCell>Completed Tasks</TableCell>
              <TableCell>Completed Quantity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {perLister.map((r, idx) => (
              <TableRow key={idx}>
                <TableCell>{r.listerName}</TableCell>
                <TableCell>{r.tasksCount}</TableCell>
                <TableCell>{r.pendingTasks}</TableCell>
                <TableCell>{r.quantityTotal}</TableCell>
                <TableCell>{r.pendingQty}</TableCell>
                <TableCell>{r.completedCount}</TableCell>
                <TableCell>{r.completedQty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" sx={{ mb: 1 }}>Admin → Lister Detail (by Scheduled Date)</Typography>

      {/* MOBILE */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <SummaryCards
          items={rows.map(r => ({
            ...r,
            pendingTasks: r.tasksCount - r.completedCount,
            pendingQty: r.quantityTotal - r.completedQty
          }))}
          kind="detail"
        />
      </Box>

      {/* DESKTOP */}
      <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Scheduled Date</TableCell>
              <TableCell>Listing Admin</TableCell>
              <TableCell>Lister</TableCell>
              <TableCell>Tasks</TableCell>
              <TableCell>Pending Tasks</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Pending Quantity</TableCell>
              <TableCell>Completed Tasks</TableCell>
              <TableCell>Completed Quantity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={idx}>
                <TableCell>{r.date || '-'}</TableCell>
                <TableCell>{r.adminName || 'Unassigned'}</TableCell>
                <TableCell>{r.listerName || '-'}</TableCell>
                <TableCell>{r.tasksCount}</TableCell>
                <TableCell>{r.tasksCount - r.completedCount}</TableCell>
                <TableCell>{r.quantityTotal}</TableCell>
                <TableCell>{r.quantityTotal - r.completedQty}</TableCell>
                <TableCell>{r.completedCount}</TableCell>
                <TableCell>{r.completedQty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}