import { useEffect, useState } from 'react';
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import api from '../../lib/api.js';

export default function ManageRangesPage() {
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data } = await api.get('/ranges');
    setItems(data);
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/ranges', { name });
    setName('');
    await load();
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Manage Ranges</Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={add}>
          <TextField label="Range Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit" variant="contained">Add</Button>
        </Stack>
      </Paper>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r._id}>
                <TableCell>{r.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
