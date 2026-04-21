import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Paper, Alert,
  Checkbox, ListItemText, OutlinedInput, Chip, InputAdornment,
  Typography, useMediaQuery, useTheme, CircularProgress
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../lib/api.js';

export default function ProductResearchPage() {
  // Mobile responsiveness (same approach as FulfillmentDashboard)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sourcePlatforms, setSourcePlatforms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [form, setForm] = useState({ productTitle: '', supplierLink: '', sourcePlatformId: '', categoryId: '', subcategoryId: '', marketplace: '' });
  const [errors, setErrors] = useState({});

  // Filter states
  const [searchTitle, setSearchTitle] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }, []);

  // Filtered rows based on search and category filters
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Filter by product title (case-insensitive)
      const matchesTitle = !searchTitle || 
        row.productTitle?.toLowerCase().includes(searchTitle.toLowerCase());
      
      // Filter by selected categories (if any selected)
      const matchesCategory = selectedCategories.length === 0 || 
        selectedCategories.includes(row.category?._id);
      
      return matchesTitle && matchesCategory;
    });
  }, [rows, searchTitle, selectedCategories]);

  const marketplaces = [
    { value: 'EBAY_US', label: 'eBay US' },
    { value: 'EBAY_AUS', label: 'eBay Australia' },
    { value: 'EBAY_CANADA', label: 'eBay Canada' }
  ];

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: tasks }, { data: sp }, { data: c }] = await Promise.all([
        api.get('/tasks'),
        api.get('/platforms', { params: { type: 'source' } }),
        api.get('/categories')
      ]);
      setRows(tasks.tasks || tasks);
      setSourcePlatforms(sp);
      setCategories(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load subcategories when category is selected
  useEffect(() => {
    if (form.categoryId) {
      api.get('/subcategories', { params: { categoryId: form.categoryId } })
        .then(({ data }) => setSubcategories(data));
    } else {
      setSubcategories([]);
      setForm({ ...form, subcategoryId: '' });
    }
  }, [form.categoryId]);

  const validate = () => {
    const errs = {};
    if (!form.productTitle) errs.productTitle = 'Required';
    if (!form.supplierLink) errs.supplierLink = 'Required';
    if (!form.sourcePlatformId) errs.sourcePlatformId = 'Required';
    if (!form.categoryId) errs.categoryId = 'Required';
    if (!form.subcategoryId) errs.subcategoryId = 'Required';
    if (!form.marketplace) errs.marketplace = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    const payload = {
      productTitle: form.productTitle,
      supplierLink: form.supplierLink,
      
      sourcePlatformId: form.sourcePlatformId,
      categoryId: form.categoryId,
      subcategoryId: form.subcategoryId,
      marketplace: form.marketplace
    };
    await api.post('/tasks', payload);
    setOpen(false);
    setForm({ productTitle: '', supplierLink: '', sourcePlatformId: '', categoryId: '', subcategoryId: '', marketplace: '' });
    setErrors({});
    await load();
  };

  const openDelete = (row) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/tasks/${deleteTarget._id}`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" onClick={() => setOpen(true)} fullWidth={isMobile}>Create</Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
      <>
      {/* Filter Section */}
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
          {/* Product Title Search */}
          <TextField
            label="Search Product Title"
            size="small"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            fullWidth={isMobile}
            sx={{ minWidth: { xs: '100%', md: '100%', lg: 250 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          {/* Category Multi-Select */}
          <FormControl size="small" fullWidth={isMobile} sx={{ minWidth: { xs: '100%', md: '100%', lg: 300 } }}>
            <InputLabel>Filter by Category</InputLabel>
            <Select
              multiple
              value={selectedCategories}
              onChange={(e) => setSelectedCategories(e.target.value)}
              input={<OutlinedInput label="Filter by Category" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: '100%' }}>
                  {selected.map((id) => {
                    const cat = categories.find(c => c._id === id);
                    return <Chip key={id} label={cat?.name || id} size="small" />;
                  })}
                </Box>
              )}
            >
              {categories.map((cat) => (
                <MenuItem key={cat._id} value={cat._id}>
                  <Checkbox checked={selectedCategories.includes(cat._id)} />
                  <ListItemText primary={cat.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Clear Filters Button */}
          {(searchTitle || selectedCategories.length > 0) && (
            <Button 
              variant="outlined" 
              size="small"
              fullWidth={isMobile}
              onClick={() => {
                setSearchTitle('');
                setSelectedCategories([]);
              }}
            >
              Clear Filters
            </Button>
          )}
        </Stack>
      </Paper>

      {/* MOBILE: Card view */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Stack spacing={1.5}>
          {filteredRows.map((r, idx) => (
            <Paper key={r._id} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      #{idx + 1} • {r.date ? new Date(r.date).toLocaleDateString() : '-'}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                      {r.productTitle || '-'}
                    </Typography>
                  </Box>
                  <Button size="small" color="error" onClick={() => openDelete(r)}>Delete</Button>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={r.sourcePlatform?.name || 'Source: -'} />
                  <Chip size="small" label={r.marketplace?.replace('EBAY_', 'eBay ').replace('_', ' ') || 'Marketplace: -'} />
                  <Chip size="small" label={r.category?.name || 'Category: -'} />
                  <Chip size="small" label={r.subcategory?.name || 'Subcategory: -'} />
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                    Created by: {r.createdBy?.username || '-'}
                  </Typography>
                  {r.supplierLink ? (
                    <Button
                      size="small"
                      variant="outlined"
                      component="a"
                      href={r.supplierLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Supplier Link
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>

      {/* DESKTOP: Table view */}
      <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>SL No</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Product Title</TableCell>
              <TableCell>Supplier Link</TableCell>
              
              <TableCell>Source Platform</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Subcategory</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.map((r, idx) => (
              <TableRow key={r._id}>
                <TableCell>{idx + 1}</TableCell>
                <TableCell>{r.date ? new Date(r.date).toLocaleDateString() : '-'}</TableCell>
                <TableCell>{r.productTitle}</TableCell>
                <TableCell><a href={r.supplierLink} target="_blank" rel="noreferrer">Link</a></TableCell>
                
                <TableCell>{r.sourcePlatform?.name}</TableCell>
                <TableCell>{r.marketplace?.replace('EBAY_', 'eBay ').replace('_', ' ')}</TableCell>
                <TableCell>{r.category?.name || '-'}</TableCell>
                <TableCell>{r.subcategory?.name || '-'}</TableCell>
                <TableCell>{r.createdBy?.username || '-'}</TableCell>
                <TableCell>
                  <Button size="small" color="error" onClick={() => openDelete(r)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => { setOpen(false); setErrors({}); }} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>Create Product Research</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Date is set automatically by backend */}
            <TextField label="Product Title" value={form.productTitle} onChange={(e) => setForm({ ...form, productTitle: e.target.value })} error={!!errors.productTitle} helperText={errors.productTitle} required />
            <TextField label="Supplier Link" value={form.supplierLink} onChange={(e) => setForm({ ...form, supplierLink: e.target.value })} error={!!errors.supplierLink} helperText={errors.supplierLink} required />
            
            <FormControl fullWidth error={!!errors.sourcePlatformId}>
              <InputLabel>Source Platform</InputLabel>
              <Select label="Source Platform" value={form.sourcePlatformId} onChange={(e) => setForm({ ...form, sourcePlatformId: e.target.value })} required>
                {sourcePlatforms.map((p) => (<MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>))}
              </Select>
              {errors.sourcePlatformId ? <Alert severity="error" sx={{ mt: 0.5 }}>{errors.sourcePlatformId}</Alert> : null}
            </FormControl>
            <FormControl fullWidth error={!!errors.marketplace}>
              <InputLabel>Marketplace</InputLabel>
              <Select label="Marketplace" value={form.marketplace} onChange={(e) => setForm({ ...form, marketplace: e.target.value })} required>
                {marketplaces.map((m) => (<MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>))}
              </Select>
              {errors.marketplace ? <Alert severity="error" sx={{ mt: 0.5 }}>{errors.marketplace}</Alert> : null}
            </FormControl>
            <FormControl fullWidth error={!!errors.categoryId}>
              <InputLabel>Category</InputLabel>
              <Select label="Category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: '' })} required>
                {categories.map((c) => (<MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>))}
              </Select>
              {errors.categoryId ? <Alert severity="error" sx={{ mt: 0.5 }}>{errors.categoryId}</Alert> : null}
            </FormControl>
            <FormControl fullWidth error={!!errors.subcategoryId} disabled={!form.categoryId}>
              <InputLabel>Subcategory</InputLabel>
              <Select label="Subcategory" value={form.subcategoryId} onChange={(e) => setForm({ ...form, subcategoryId: e.target.value })} required>
                {subcategories.map((s) => (<MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>))}
              </Select>
              {errors.subcategoryId ? <Alert severity="error" sx={{ mt: 0.5 }}>{errors.subcategoryId}</Alert> : null}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setErrors({}); }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Are you sure you want to delete this task? This will also delete all related assignments and compatibility assignments. This action cannot be undone.
          </Alert>
          {deleteTarget && (
            <Box sx={{ mt: 2 }}>
              <strong>Product:</strong> {deleteTarget.productTitle}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
      </>
      )}
    </Box>
  );
}
