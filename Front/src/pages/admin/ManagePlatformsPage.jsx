import { useEffect, useState } from 'react';
import { Box, Button, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import api from '../../lib/api.js';

export default function ManagePlatformsPage() {
  const [name, setName] = useState('');
  const [type, setType] = useState('source');
  const [items, setItems] = useState([]);

  const load = async () => {
    const [{ data: sources }, { data: listings }] = await Promise.all([
      api.get('/platforms', { params: { type: 'source' } }),
      api.get('/platforms', { params: { type: 'listing' } })
    ]);
    setItems([...sources, ...listings]);
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/platforms', { name, type });
    setName('');
    setType('source');
    await load();
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Manage Platforms</Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={add}>
          <TextField label="Platform Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Type</InputLabel>
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
              <MenuItem value="source">Source</MenuItem>
              <MenuItem value="listing">Listing</MenuItem>
            </Select>
          </FormControl>
          <Button type="submit" variant="contained">Add</Button>
        </Stack>
      </Paper>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p._id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.type}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}


