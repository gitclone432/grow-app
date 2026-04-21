import { useEffect, useState, useRef, useMemo } from 'react';
import {
  Box, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, FormControl, InputLabel, Select, MenuItem, TextField, Typography, Chip,
  IconButton, Checkbox, Pagination, Autocomplete, Grid, Collapse, Badge
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import api from '../../lib/api.js';

export default function AdminTaskList() {
  const [assignments, setAssignments] = useState([]);
  const [editors, setEditors] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [form, setForm] = useState({ editorId: '', rangeQuantities: [], notes: '' });
  const [loading, setLoading] = useState(false);
  const [sharedStatus, setSharedStatus] = useState({});
  
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
  const [openFilters, setOpenFilters] = useState(false);
  
  // Refs for proper filter/page handling
  const isFirstRender = useRef(true);
  const isFilterChange = useRef(false);
  
  // Filter state
  const [filters, setFilters] = useState({
    date: { mode: 'none', single: '', from: '', to: '' },
    subcategory: null,
    listingPlatform: null,
    store: null,
    marketplace: '',
    sharedStatus: '', // 'shared' | 'notShared' | ''
  });


  const loadFilterOptions = async () => {
    try {
      const { data } = await api.get('/compatibility/eligible-filter-options');
      setAllSubcategories(data.subcategories || []);
      setAllListingPlatforms(data.listingPlatforms || []);
      setAllStores(data.stores || []);
      setAllMarketplaces(data.marketplaces || []);
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
        sharedStatus: filters.sharedStatus,
      };
      
      const [{ data: eligible }, { data: editors }] = await Promise.all([
        api.get('/compatibility/eligible', { params }),
        api.get('/users/compatibility-editors')
      ]);
      
      setAssignments(eligible.items || []);
      setTotalItems(eligible.totalItems || 0);
      setTotalPages(eligible.totalPages || 0);
      setEditors(editors || []);
      setSharedStatus(eligible.sharedStatus || {});
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
    filters.sharedStatus
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

  const openShare = (assignment) => {
    setSharing(assignment);
    // Initialize rangeQuantities from the assignment's range breakdown
    // Auto-select all ranges with full quantities by default
    const rqList = (assignment.rangeQuantities || []).map(rq => ({
      rangeId: rq.range?._id || rq.range,
      rangeName: rq.range?.name || '',
      quantity: rq.quantity || 0,
      selected: true  // Auto-select all ranges by default
    }));
    setForm({ editorId: '', rangeQuantities: rqList, notes: '' });
    setShareOpen(true);
  };

  const handleToggleRange = (index) => {
    setForm(f => ({
      ...f,
      rangeQuantities: f.rangeQuantities.map((rq, i) => 
        i === index ? { ...rq, selected: !rq.selected } : rq
      )
    }));
  };

  const handleQuantityChange = (index, value) => {
    setForm(f => ({
      ...f,
      rangeQuantities: f.rangeQuantities.map((rq, i) => 
        i === index ? { ...rq, quantity: Number(value) || 0 } : rq
      )
    }));
  };

  const handleShare = async () => {
    const { editorId, rangeQuantities, notes } = form;
    const selectedRanges = rangeQuantities.filter(rq => rq.selected && rq.quantity > 0);
    
    if (!editorId || selectedRanges.length === 0) {
      alert('Please select an editor and at least one range with quantity > 0');
      return;
    }

    try {
      await api.post('/compatibility/assign', {
        sourceAssignmentId: sharing._id,
        editorId,
        rangeQuantities: selectedRanges.map(rq => ({ rangeId: rq.rangeId, quantity: rq.quantity })),
        notes
      });
      setShareOpen(false);
      setSharing(null);
      alert('Task shared successfully!');
      await load();
    } catch (e) {
      console.error(e);
      alert('Failed to assign compatibility task');
    }
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
    if (filters.sharedStatus) count++;
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
      sharedStatus: '',
    });
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Compatibility Admin - Ebay Motors</Typography>
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

            {/* Shared Status Filter */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Shared Status</InputLabel>
                <Select
                  label="Shared Status"
                  value={filters.sharedStatus}
                  onChange={(e) => setFilters(f => ({ ...f, sharedStatus: e.target.value }))}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="shared">Shared</MenuItem>
                  <MenuItem value="notShared">Not Shared</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>
      </Collapse>
      
      <Paper sx={{ width: '100%', overflow: 'auto', mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              
              <TableCell>Supplier Link</TableCell>
              
              <TableCell>Source Platform</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Subcategory</TableCell>
              <TableCell>Listing Platform</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Range Quantity Breakdown</TableCell>
              <TableCell>Shared</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {assignments.map(a => (
              <TableRow key={a._id}>
                <TableCell>{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                
                <TableCell>
                  {a.task?.supplierLink ? (
                    <a href={a.task.supplierLink} target="_blank" rel="noreferrer">Link</a>
                  ) : '-'}
                </TableCell>
                
                <TableCell>{a.task?.sourcePlatform?.name || '-'}</TableCell>
                <TableCell>{a.task?.category?.name || '-'}</TableCell>
                <TableCell>{a.task?.subcategory?.name || '-'}</TableCell>
                <TableCell>{a.listingPlatform?.name || '-'}</TableCell>
                <TableCell>{a.store?.name || '-'}</TableCell>
                <TableCell>{a.marketplace?.replace('EBAY_', 'eBay ').replace('_', ' ') || '-'}</TableCell>
                <TableCell>
                  <Stack direction="column" spacing={0.5}>
                    {(a.rangeQuantities || []).map((rq, i) => (
                      <Chip key={i} label={`${rq.range?.name || '-'}: ${rq.quantity || 0}`} size="small" />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  {sharedStatus[a._id] ? (
                    <Chip label="Shared" color="success" size="small" />
                  ) : (
                    <Chip label="Not Shared" color="default" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  <Button size="small" variant="contained" onClick={() => openShare(a)}>
                    Share
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {assignments.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={12} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No completed Ebay Motors tasks available
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={12} align="center">
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
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 2, gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {assignments.length} of {totalItems} items
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

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Share Task with Compatibility Editor</DialogTitle>
        <DialogContent>
          {sharing && (
            <Stack spacing={3} sx={{ mt: 1 }}>
              
              <Typography variant="body2"><strong>Category:</strong> {sharing.task?.category?.name}</Typography>
              <Typography variant="body2"><strong>Subcategory:</strong> {sharing.task?.subcategory?.name}</Typography>
              <Typography variant="body2"><strong>Listing:</strong> {sharing.listingPlatform?.name} / {sharing.store?.name}</Typography>
              
              <FormControl fullWidth>
                <InputLabel>Select Editor</InputLabel>
                <Select 
                  label="Select Editor" 
                  value={form.editorId} 
                  onChange={(e) => setForm(f => ({ ...f, editorId: e.target.value }))}
                >
                  {editors.map(ed => (
                    <MenuItem key={ed._id} value={ed._id}>{ed.username}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Ranges and Quantities to Share:
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                  All ranges are selected by default. You can modify quantities or unselect ranges if needed.
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">Select</TableCell>
                      <TableCell>Range</TableCell>
                      <TableCell>Original Quantity</TableCell>
                      <TableCell>Quantity to Share</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {form.rangeQuantities.map((rq, index) => (
                      <TableRow key={index}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={rq.selected}
                            onChange={() => handleToggleRange(index)}
                          />
                        </TableCell>
                        <TableCell>{rq.rangeName}</TableCell>
                        <TableCell>{rq.quantity}</TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={rq.selected ? rq.quantity : 0}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            disabled={!rq.selected}
                            inputProps={{ min: 0, max: rq.quantity }}
                            sx={{ width: 120 }}
                            helperText={rq.selected ? `Max: ${rq.quantity}` : ''}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              <TextField 
                label="Notes (Optional)" 
                multiline 
                rows={3} 
                value={form.notes} 
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} 
                fullWidth
                placeholder="Add any instructions or notes for the editor..."
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleShare} 
            disabled={!form.editorId || !form.rangeQuantities.some(rq => rq.selected && rq.quantity > 0)}
          >
            Share Task
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
