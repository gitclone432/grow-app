import { useEffect, useState } from 'react';
import {
  Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Divider
} from '@mui/material';
import api from '../../lib/api.js';

export default function ManageCategoriesPage() {
  // Categories
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  
  // Subcategories
  const [subcategories, setSubcategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [subcategoryName, setSubcategoryName] = useState('');
  const [subcategorySearch, setSubcategorySearch] = useState('');
  
  // Ranges
  const [ranges, setRanges] = useState([]);
  const [selectedCategoryForRange, setSelectedCategoryForRange] = useState('');
  const [rangeName, setRangeName] = useState('');
  const [rangeSearch, setRangeSearch] = useState('');

  // Load categories
  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data));
  }, []);

  // Load subcategories when category is selected
  useEffect(() => {
    if (selectedCategoryId) {
      api.get('/subcategories', { params: { categoryId: selectedCategoryId } })
        .then(({ data }) => setSubcategories(data));
    } else {
      setSubcategories([]);
    }
  }, [selectedCategoryId]);

  // Load ranges when category is selected for ranges section
  useEffect(() => {
    if (selectedCategoryForRange) {
      api.get('/ranges', { params: { categoryId: selectedCategoryForRange } })
        .then(({ data }) => setRanges(data));
    } else {
      setRanges([]);
    }
  }, [selectedCategoryForRange]);

  const addCategory = async (e) => {
    e.preventDefault();
    await api.post('/categories', { name: categoryName });
    setCategoryName('');
    const { data } = await api.get('/categories');
    setCategories(data);
  };

  const addSubcategory = async (e) => {
    e.preventDefault();
    if (!selectedCategoryId) return;
    await api.post('/subcategories', { name: subcategoryName, categoryId: selectedCategoryId });
    setSubcategoryName('');
    const { data } = await api.get('/subcategories', { params: { categoryId: selectedCategoryId } });
    setSubcategories(data);
  };

  const addRange = async (e) => {
    e.preventDefault();
    if (!selectedCategoryForRange) return;
    await api.post('/ranges', { name: rangeName, categoryId: selectedCategoryForRange });
    setRangeName('');
    const { data } = await api.get('/ranges', { params: { categoryId: selectedCategoryForRange } });
    setRanges(data);
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 3 }}>Manage Categories, Subcategories & Ranges</Typography>

      {/* Categories Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Categories</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={addCategory}>
          <TextField
            label="Category Name"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
            sx={{ flex: 1 }}
          />
          <Button type="submit" variant="contained">Add Category</Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Search Category"
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button variant="outlined" onClick={() => setCategorySearch(categorySearch)}>Search</Button>
        </Stack>
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase())).map((c) => (
                <TableRow key={c._id} sx={categorySearch && c.name.toLowerCase() === categorySearch.toLowerCase() ? { backgroundColor: 'action.selected' } : {}}>
                  <TableCell>{c.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Divider sx={{ my: 3 }} />

      {/* Subcategories Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Subcategories</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={addSubcategory}>
          <FormControl sx={{ minWidth: 240 }}>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              required
            >
              {categories.map((c) => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Subcategory Name"
            value={subcategoryName}
            onChange={(e) => setSubcategoryName(e.target.value)}
            required
            sx={{ flex: 1 }}
          />
          <Button type="submit" variant="contained" disabled={!selectedCategoryId}>
            Add Subcategory
          </Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Search Subcategory"
            value={subcategorySearch}
            onChange={e => setSubcategorySearch(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button variant="outlined" onClick={() => setSubcategorySearch(subcategorySearch)}>Search</Button>
        </Stack>
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Subcategory</TableCell>
                <TableCell>Category</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {subcategories.filter(s => !subcategorySearch || s.name.toLowerCase().includes(subcategorySearch.toLowerCase())).map((s) => (
                <TableRow key={s._id} sx={subcategorySearch && s.name.toLowerCase() === subcategorySearch.toLowerCase() ? { backgroundColor: 'action.selected' } : {}}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{s.category?.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Divider sx={{ my: 3 }} />

      {/* Ranges Section */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Ranges</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={addRange}>
          <FormControl sx={{ minWidth: 240 }}>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={selectedCategoryForRange}
              onChange={(e) => setSelectedCategoryForRange(e.target.value)}
              required
            >
              {categories.map((c) => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Range Name"
            value={rangeName}
            onChange={(e) => setRangeName(e.target.value)}
            required
            sx={{ flex: 1 }}
          />
          <Button type="submit" variant="contained" disabled={!selectedCategoryForRange}>
            Add Range
          </Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Search Range"
            value={rangeSearch}
            onChange={e => setRangeSearch(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button variant="outlined" onClick={() => setRangeSearch(rangeSearch)}>Search</Button>
        </Stack>
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Range</TableCell>
                <TableCell>Category</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranges.filter(r => !rangeSearch || r.name.toLowerCase().includes(rangeSearch.toLowerCase())).map((r) => (
                <TableRow key={r._id} sx={rangeSearch && r.name.toLowerCase() === rangeSearch.toLowerCase() ? { backgroundColor: 'action.selected' } : {}}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.category?.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
