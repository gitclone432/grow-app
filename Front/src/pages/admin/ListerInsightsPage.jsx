import { useEffect, useState } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import api from '../../lib/api.js';

export default function ListerInsightsPage() {
  const [listers, setListers] = useState([]);
  const [listerId, setListerId] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => { api.get('/users/listers').then(({ data }) => setListers(data)); }, []);
  useEffect(() => {
    if (!listerId) { setRows([]); return; }
    api.get('/tasks', { params: { listerId } }).then(({ data }) => setRows(data));
  }, [listerId]);

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Lister Insights</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 260 }}>
          <InputLabel>Lister</InputLabel>
          <Select label="Lister" value={listerId} onChange={(e) => setListerId(e.target.value)}>
            {listers.map((l) => (<MenuItem key={l._id} value={l._id}>{l.username}</MenuItem>))}
          </Select>
        </FormControl>
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r._id}>
                <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                <TableCell>{r.productTitle}</TableCell>
                <TableCell>{r.listingPlatform?.name}</TableCell>
                <TableCell>{r.store?.name}</TableCell>
                <TableCell>{r.quantity}</TableCell>
                <TableCell>{r.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}


