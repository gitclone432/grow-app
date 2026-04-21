import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box, Paper, Table, TableHead, TableRow, TableCell, TableBody, Typography, Chip, Stack,
  LinearProgress, TextField, FormControl, InputLabel, Select, MenuItem, Grid, Button,
  Collapse, IconButton, Badge, Pagination, Autocomplete
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import api from '../../lib/api.js';

export default function ProgressTrackingPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const itemsPerPage = 50;
  
  // Filter options from database
  const [allSubcategories, setAllSubcategories] = useState([]);
  const [allListingPlatforms, setAllListingPlatforms] = useState([]);
  const [allStores, setAllStores] = useState([]);
  const [allMarketplaces, setAllMarketplaces] = useState([]);
  const [allEditors, setAllEditors] = useState([]);
  
  // Refs for proper filter/page handling
  const isFirstRender = useRef(true);
  const isFilterChange = useRef(false);
  
  // Filter state - now using full objects with _id
  const [filters, setFilters] = useState({
    date: { mode: 'none', single: '', from: '', to: '' },
    subcategory: null,
    listingPlatform: null,
    store: null,
    marketplace: '',
    editor: null,
    pending: { mode: 'none', value: '' },
  });

  
  const loadFilterOptions = async () => {
    try {
      const { data } = await api.get('/compatibility/filter-options');
      setAllSubcategories(data.subcategories || []);
      setAllListingPlatforms(data.listingPlatforms || []);
      setAllStores(data.stores || []);
      setAllMarketplaces(data.marketplaces || []);
      setAllEditors(data.editors || []);
    } catch (e) {
      console.error('Failed to load filter options', e);
    }
  };

  const load = async (pageOverride) => {
    const currentPage = pageOverride !== undefined ? pageOverride : page;
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        dateMode: filters.date.mode,
        dateSingle: filters.date.single,
        dateFrom: filters.date.from,
        dateTo: filters.date.to,
        subcategory: filters.subcategory?._id || '',
        listingPlatform: filters.listingPlatform?._id || '',
        store: filters.store?._id || '',
        marketplace: filters.marketplace,
        editor: filters.editor?._id || '',
        pendingMode: filters.pending.mode,
        pendingValue: filters.pending.value,
      };
      
      const { data } = await api.get('/compatibility/progress', { params });
      setItems(data.items || []);
      setTotalItems(data.totalItems || 0);
      setTotalPages(data.totalPages || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadFilterOptions();
  }, []);
  
  // Load data on mount
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      load(1);
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // When any filter changes, reset to page 1
  useEffect(() => {
    if (isFirstRender.current) return;
    isFilterChange.current = true;
    setPage(1);
    load(1);
  }, [
    filters.date.mode,
    filters.date.single,
    filters.date.from,
    filters.date.to,
    filters.subcategory,
    filters.listingPlatform,
    filters.store,
    filters.marketplace,
    filters.editor,
    filters.pending.mode,
    filters.pending.value
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // When page changes (but not due to filter change)
  useEffect(() => {
    if (isFirstRender.current) return;
    if (isFilterChange.current) {
      isFilterChange.current = false;
      return;
    }
    load();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingQty = (item) => {
    const q = item.quantity || 0;
    const c = item.completedQuantity || 0;
    return Math.max(0, q - c);
  };

  const progressPct = (item) => {
    const q = item.quantity || 0;
    if (!q || q <= 0) return 0;
    const c = Math.min(item.completedQuantity || 0, q);
    return Math.round((c / q) * 100);
  };

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.date.mode === 'single' && filters.date.single) count++;
    if (filters.date.mode === 'range' && (filters.date.from || filters.date.to)) count++;
    if (filters.subcategory) count++;
    if (filters.listingPlatform) count++;
    if (filters.store) count++;
    if (filters.marketplace) count++;
    if (filters.editor) count++;
    if (filters.pending.mode !== 'none' && filters.pending.value) count++;
    return count;
  }, [filters]);

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      date: { mode: 'none', single: '', from: '', to: '' },
      subcategory: null,
      listingPlatform: null,
      store: null,
      marketplace: '',
      editor: null,
      pending: { mode: 'none', value: '' },
    });
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Compatibility Progress Tracking</Typography>
        <Stack direction="row" spacing={1}>
          <Badge badgeContent={activeFilterCount} color="primary">
            <IconButton 
              size="small" 
              onClick={() => setOpenFilters(!openFilters)}
              color={openFilters ? 'primary' : 'default'}
            >
              <FilterListIcon />
            </IconButton>
          </Badge>
          {activeFilterCount > 0 && (
            <IconButton size="small" onClick={clearFilters} title="Clear all filters">
              <ClearAllIcon />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Filters Section */}
      <Collapse in={openFilters}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Filters</Typography>
          <Grid container spacing={2}>
            {/* Date Filter */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Date Filter</InputLabel>
                <Select
                  label="Date Filter"
                  value={filters.date.mode}
                  onChange={(e) => setFilters(f => ({ ...f, date: { ...f.date, mode: e.target.value } }))}
                >
                  <MenuItem value="none">No Date Filter</MenuItem>
                  <MenuItem value="single">Single Date</MenuItem>
                  <MenuItem value="range">Date Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {filters.date.mode === 'single' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Select Date"
                  InputLabelProps={{ shrink: true }}
                  value={filters.date.single}
                  onChange={(e) => setFilters(f => ({ ...f, date: { ...f.date, single: e.target.value } }))}
                />
              </Grid>
            )}

            {filters.date.mode === 'range' && (
              <>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="From Date"
                    InputLabelProps={{ shrink: true }}
                    value={filters.date.from}
                    onChange={(e) => setFilters(f => ({ ...f, date: { ...f.date, from: e.target.value } }))}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="To Date"
                    InputLabelProps={{ shrink: true }}
                    value={filters.date.to}
                    onChange={(e) => setFilters(f => ({ ...f, date: { ...f.date, to: e.target.value } }))}
                  />
                </Grid>
              </>
            )}

            {/* Subcategory Filter */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                size="small"
                options={allSubcategories}
                getOptionLabel={(option) => option.name || ''}
                value={filters.subcategory}
                onChange={(e, newValue) => setFilters(f => ({ ...f, subcategory: newValue }))}
                renderInput={(params) => <TextField {...params} label="Subcategory" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
              />
            </Grid>

            {/* Listing Platform Filter */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                size="small"
                options={allListingPlatforms}
                getOptionLabel={(option) => option.name || ''}
                value={filters.listingPlatform}
                onChange={(e, newValue) => setFilters(f => ({ ...f, listingPlatform: newValue }))}
                renderInput={(params) => <TextField {...params} label="Listing Platform" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
              />
            </Grid>

            {/* Store Filter */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                size="small"
                options={allStores}
                getOptionLabel={(option) => option.name || ''}
                value={filters.store}
                onChange={(e, newValue) => setFilters(f => ({ ...f, store: newValue }))}
                renderInput={(params) => <TextField {...params} label="Store" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
              />
            </Grid>

            {/* Marketplace Filter */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Marketplace</InputLabel>
                <Select
                  label="Marketplace"
                  value={filters.marketplace}
                  onChange={(e) => setFilters(f => ({ ...f, marketplace: e.target.value }))}
                >
                  <MenuItem value="">All Marketplaces</MenuItem>
                  {allMarketplaces.map(mp => (
                    <MenuItem key={mp} value={mp}>{mp.replace('EBAY_', 'eBay ').replace('_', ' ')}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Editor Filter */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                size="small"
                options={allEditors}
                getOptionLabel={(option) => option.username || ''}
                value={filters.editor}
                onChange={(e, newValue) => setFilters(f => ({ ...f, editor: newValue }))}
                renderInput={(params) => <TextField {...params} label="Editor" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
              />
            </Grid>

            {/* Pending Filter */}
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Pending Filter</InputLabel>
                <Select
                  label="Pending Filter"
                  value={filters.pending.mode}
                  onChange={(e) => setFilters(f => ({ ...f, pending: { ...f.pending, mode: e.target.value } }))}
                >
                  <MenuItem value="none">No Pending Filter</MenuItem>
                  <MenuItem value="equal">Equal to</MenuItem>
                  <MenuItem value="greater">Greater than</MenuItem>
                  <MenuItem value="less">Less than</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {filters.pending.mode !== 'none' && (
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Pending Value"
                  value={filters.pending.value}
                  onChange={(e) => setFilters(f => ({ ...f, pending: { ...f.pending, value: e.target.value } }))}
                  inputProps={{ min: 0 }}
                />
              </Grid>
            )}
          </Grid>
        </Paper>
      </Collapse>

      <Paper sx={{ width: '100%', overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              
              <TableCell>Category</TableCell>
              <TableCell>Subcategory</TableCell>
              <TableCell>Listing Platform</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Editor</TableCell>
              <TableCell>Assigned Ranges</TableCell>
              <TableCell>Completed Ranges</TableCell>
              <TableCell>Total Qty</TableCell>
              <TableCell>Completed</TableCell>
              <TableCell>Pending</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(item => (
              <TableRow key={item._id}>
                <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                
                <TableCell>{item.task?.category?.name || '-'}</TableCell>
                <TableCell>{item.task?.subcategory?.name || '-'}</TableCell>
                <TableCell>{item.sourceAssignment?.listingPlatform?.name || '-'}</TableCell>
                <TableCell>{item.sourceAssignment?.store?.name || '-'}</TableCell>
                <TableCell>{item.sourceAssignment?.marketplace?.replace('EBAY_', 'eBay ')?.replace('_', ' ') || '-'}</TableCell>
                <TableCell>{item.editor?.username || '-'}</TableCell>
                <TableCell>
                  <Stack direction="column" spacing={0.5}>
                    {(item.assignedRangeQuantities || []).map((rq, i) => (
                      <Chip key={i} label={`${rq.range?.name || '-'}: ${rq.quantity || 0}`} size="small" color="primary" variant="outlined" />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="column" spacing={0.5}>
                    {(item.completedRangeQuantities || []).filter(rq => rq.quantity > 0).map((rq, i) => (
                      <Chip key={i} label={`${rq.range?.name || '-'}: ${rq.quantity || 0}`} size="small"  />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>{item.quantity || 0}</TableCell>
                <TableCell>{item.completedQuantity || 0}</TableCell>
                <TableCell>{pendingQty(item)}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={progressPct(item)} 
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption">{progressPct(item)}%</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  {item.completedAt ? (
                    <Chip label="Completed" color="success" size="small" />
                  ) : (
                    <Chip label="In Progress" color="warning" size="small" />
                  )}
                </TableCell>
                <TableCell>{item.notes || '-'}</TableCell>
              </TableRow>
            ))}

            {items.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={15} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No items found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            
            {loading && (
              <TableRow>
                <TableCell colSpan={15} align="center">
                  <Typography variant="body2" color="text.secondary">
                    Loading...
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2, gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {items.length} of {totalItems} items
          </Typography>
          <Pagination 
            count={totalPages} 
            page={page} 
            onChange={(e, value) => setPage(value)}
            color="primary"
            showFirstButton 
            showLastButton
          />
        </Box>
      )}
    </Box>
  );
}
