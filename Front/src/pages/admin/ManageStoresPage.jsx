import { useEffect, useState } from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import api from '../../lib/api.js';

export default function ManageStoresPage() {
  const [listingPlatforms, setListingPlatforms] = useState([]);
  const [platformId, setPlatformId] = useState('');
  const [name, setName] = useState('');
  const [stores, setStores] = useState([]);

  useEffect(() => {
    api.get('/platforms', { params: { type: 'listing' } }).then(({ data }) => setListingPlatforms(data));
  }, []);

  useEffect(() => {
    if (platformId) {
      api.get('/stores', { params: { platformId } }).then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [platformId]);

  const add = async (e) => {
    e.preventDefault();
    if (!platformId) return;
    await api.post('/stores', { name, platformId });
    setName('');
    const { data } = await api.get('/stores', { params: { platformId } });
    setStores(data);
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Manage Stores</Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={add}>
          <FormControl sx={{ minWidth: 240 }}>
            <InputLabel>Listing Platform</InputLabel>
            <Select label="Listing Platform" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              {listingPlatforms.map((p) => (<MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField label="Store Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit" variant="contained" disabled={!platformId}>Add</Button>
        </Stack>
      </Paper>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Store</TableCell>
              <TableCell>Platform</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stores.map((s) => (
              <TableRow key={s._id}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.platform?.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}


