import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Paper, Checkbox, Typography, Alert, Divider, Grid, CircularProgress,
  useMediaQuery, useTheme, Chip
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import api from '../../lib/api.js';

export default function ListingManagementPage() {
  // Mobile responsiveness (same approach as FulfillmentDashboard)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Single Assignment State
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(null);
  
  // Bulk Assignment State
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  // bulkItems structure: { [taskId]: { quantity: number, storeId: string } }
  const [bulkItems, setBulkItems] = useState({}); 
  
  // Common Data
  const [listers, setListers] = useState([]);
  const [listingPlatforms, setListingPlatforms] = useState([]);
  const [stores, setStores] = useState([]);
  
  // Assignment Form (Shared by Single & Bulk)
  const [assignForm, setAssignForm] = useState({
    listerId: '',
    quantity: '', // Used for Single only
    listingPlatformId: '',
    storeId: '', // Used for Single only, or as a "helper" for Bulk
    notes: '',
    scheduledDate: new Date().toISOString().split('T')[0] 
  });

  // Load Data
  const load = async () => {
    try {
      setLoading(true);
      const [{ data: tasks }, { data: l }, { data: lp }] = await Promise.all([
        api.get('/tasks'),
        api.get('/users/listers'),
        api.get('/platforms', { params: { type: 'listing' } })
      ]);
      setRows(tasks.tasks ?? tasks);
      setListers(l);
      setListingPlatforms(lp);
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Fetch stores when platform changes
  useEffect(() => {
    if (assignForm.listingPlatformId) {
      api
        .get('/stores', { params: { platformId: assignForm.listingPlatformId } })
        .then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [assignForm.listingPlatformId]);

  // --- SINGLE ASSIGNMENT HANDLERS ---
  const openAssign = (row) => {
    setAssigning(row);
    setAssignForm({ 
      listerId: '', 
      quantity: row.quantity || '', 
      listingPlatformId: '', 
      storeId: '', 
      notes: '',
      scheduledDate: new Date().toISOString().split('T')[0]
    });
    setAssignOpen(true);
  };

  const handleAssign = async () => {
    const { listerId, quantity, listingPlatformId, storeId, notes, scheduledDate } = assignForm;
    if (!listerId || !quantity || !listingPlatformId || !storeId) {
      alert('All fields are required');
      return;
    }

    try {
      await api.post('/assignments', {
        taskId: assigning._id,
        listerId,
        quantity: Number(quantity),
        listingPlatformId,
        storeId,
        notes,
        scheduledDate
      });

      setAssignOpen(false);
      setAssigning(null);
      alert('Task scheduled successfully!');
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.message || 'Failed to assign task');
    }
  };

  // --- BULK ASSIGNMENT HANDLERS ---
  
  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      const newSelected = rows.map((n) => n._id);
      setSelectedTaskIds(newSelected);
      return;
    }
    setSelectedTaskIds([]);
  };

  const handleClick = (event, id) => {
    const selectedIndex = selectedTaskIds.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedTaskIds, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedTaskIds.slice(1));
    } else if (selectedIndex === selectedTaskIds.length - 1) {
      newSelected = newSelected.concat(selectedTaskIds.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedTaskIds.slice(0, selectedIndex),
        selectedTaskIds.slice(selectedIndex + 1),
      );
    }
    setSelectedTaskIds(newSelected);
  };

  const openBulkAssign = () => {
    if (selectedTaskIds.length === 0) return;
    
    // Initialize state for selected tasks
    const initialItems = {};
    selectedTaskIds.forEach(id => {
      const task = rows.find(r => r._id === id);
      initialItems[id] = {
        quantity: task?.quantity || '',
        storeId: '' // Start empty, user selects store
      };
    });
    setBulkItems(initialItems);

    setAssignForm({ 
      listerId: '', 
      quantity: '', 
      listingPlatformId: '', 
      storeId: '', // Acts as "Set All Stores" helper
      notes: '',
      scheduledDate: new Date().toISOString().split('T')[0]
    });
    setBulkAssignOpen(true);
  };

  // Update specific field (storeId or quantity) for a specific task
  const handleBulkItemChange = (taskId, field, val) => {
    setBulkItems(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [field]: val
      }
    }));
  };

  // Helper to set a field for ALL selected tasks
  const applyToAll = (field, val) => {
    setBulkItems(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = { ...next[key], [field]: val };
      });
      return next;
    });
    
    // If applying store, update the main dropdown for visual consistency
    if(field === 'storeId') {
      setAssignForm(prev => ({ ...prev, storeId: val }));
    }
  };

  const handleBulkAssignSubmit = async () => {
    const { listerId, listingPlatformId, notes, scheduledDate } = assignForm;
    
    // 1. Validate Common Fields
    if (!listerId || !listingPlatformId) {
      alert('Please select a Lister and Listing Platform.');
      return;
    }

    // 2. Build Payload & Validate Per-Item Fields
    const assignmentsPayload = [];
    for (const id of selectedTaskIds) {
      const item = bulkItems[id];
      
      if (!item.quantity || Number(item.quantity) <= 0) {
        alert('Please ensure all tasks have a valid quantity greater than 0.');
        return;
      }
      if (!item.storeId) {
        alert('Please ensure all tasks have a Store assigned.');
        return;
      }

      assignmentsPayload.push({
        taskId: id,
        quantity: Number(item.quantity),
        storeId: item.storeId
      });
    }

    try {
      const res = await api.post('/assignments/bulk', {
        listerId,
        listingPlatformId,
        notes,
        scheduledDate,
        assignments: assignmentsPayload
      });

      if (res.data.success) {
        alert(`Successfully assigned ${res.data.count} tasks!`);
        if (res.data.errors) {
          alert('Some tasks failed: \n' + res.data.errors.join('\n'));
        }
        setBulkAssignOpen(false);
        setSelectedTaskIds([]);
        load(); // Refresh list
      }
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.message || 'Failed to process bulk assignments');
    }
  };

  const isSelected = (id) => selectedTaskIds.indexOf(id) !== -1;

  // Helper to format marketplace string
  const formatMarketplace = (m) => (m ? m.replace('EBAY_', 'eBay ').replace('_', ' ') : '-');

  if (loading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {/* Action Bar */}
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'center' }}
        spacing={1.5}
        sx={{ mb: 2, p: 1 }}
      >
        <Typography variant="h6">Listing Management</Typography>

        {selectedTaskIds.length > 0 && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AssignmentIcon />}
            onClick={openBulkAssign}
            fullWidth={isMobile}
          >
            Assign {selectedTaskIds.length} Selected Tasks
          </Button>
        )}
      </Stack>

      {/* MOBILE/TABLET: Card view */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Stack spacing={1.5}>
          {rows.map((r, idx) => {
            const checked = isSelected(r._id);
            return (
              <Paper key={r._id} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
                      <Checkbox
                        color="primary"
                        checked={checked}
                        onChange={(event) => handleClick(event, r._id)}
                        sx={{ p: 0, mt: 0.25 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">
                          #{idx + 1} • {r.date ? new Date(r.date).toLocaleDateString() : '-'}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                          {r.productTitle || '-'}
                        </Typography>

                        {r.supplierLink ? (
                          <Button
                            size="small"
                            variant="outlined"
                            component="a"
                            href={r.supplierLink}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ mt: 1 }}
                          >
                            Supplier Link
                          </Button>
                        ) : null}
                      </Box>
                    </Stack>

                    <Button size="small" variant="outlined" onClick={() => openAssign(r)} sx={{ flexShrink: 0 }}>
                      Share
                    </Button>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`Source: ${r.sourcePlatform?.name || '-'}`} />
                    <Chip size="small" label={`Marketplace: ${formatMarketplace(r.marketplace)}`} />
                    <Chip
                      size="small"
                      label={`Category: ${r.category?.name || '-'}${r.subcategory ? ` / ${r.subcategory.name}` : ''}`}
                    />
                    <Chip size="small" label={`Created: ${r.createdBy?.username || '-'}`} />
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {/* DESKTOP: Table view */}
      <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  color="primary"
                  indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < rows.length}
                  checked={rows.length > 0 && selectedTaskIds.length === rows.length}
                  onChange={handleSelectAllClick}
                />
              </TableCell>
              <TableCell>SL No</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Source Platform</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, idx) => {
              const isItemSelected = isSelected(r._id);
              return (
                <TableRow 
                  key={r._id}
                  hover
                  role="checkbox"
                  aria-checked={isItemSelected}
                  selected={isItemSelected}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      color="primary"
                      checked={isItemSelected}
                      onChange={(event) => handleClick(event, r._id)}
                    />
                  </TableCell>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {r.productTitle} <br/>
                    <Typography variant="caption" component="a" href={r.supplierLink} target="_blank">
                      Supplier Link
                    </Typography>
                  </TableCell>
                  <TableCell>{r.sourcePlatform?.name || '-'}</TableCell>
                  <TableCell>{r.marketplace?.replace('EBAY_', 'eBay ').replace('_', ' ') || '-'}</TableCell>
                  <TableCell>
                    {r.category?.name || '-'} 
                    {r.subcategory ? ` / ${r.subcategory.name}` : ''}
                  </TableCell>
                  <TableCell>{r.createdBy?.username || '-'}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => openAssign(r)}>
                      Share
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* --- SINGLE ASSIGN DIALOG --- */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Share Task</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {assigning && (
              <Alert severity="info">
                Assigning: <strong>{assigning.productTitle}</strong>
              </Alert>
            )}
            <FormControl fullWidth size="small">
              <InputLabel>Lister</InputLabel>
              <Select
                label="Lister"
                value={assignForm.listerId}
                onChange={(e) => setAssignForm({ ...assignForm, listerId: e.target.value })}
              >
                {listers.map((l) => (
                  <MenuItem key={l._id} value={l._id}>{l.username}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Quantity"
              type="number"
              size="small"
              value={assignForm.quantity}
              onChange={(e) => setAssignForm({ ...assignForm, quantity: Number(e.target.value) })}
            />

            <TextField
              label="Scheduled Date"
              type="date"
              size="small"
              value={assignForm.scheduledDate}
              onChange={(e) => setAssignForm({ ...assignForm, scheduledDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />

            <FormControl fullWidth size="small">
              <InputLabel>Listing Platform</InputLabel>
              <Select
                label="Listing Platform"
                value={assignForm.listingPlatformId}
                onChange={(e) => setAssignForm({ ...assignForm, listingPlatformId: e.target.value })}
              >
                {listingPlatforms.map((p) => (
                  <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" disabled={!assignForm.listingPlatformId}>
              <InputLabel>Store</InputLabel>
              <Select
                label="Store"
                value={assignForm.storeId}
                onChange={(e) => setAssignForm({ ...assignForm, storeId: e.target.value })}
              >
                {stores.map((s) => (
                  <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Notes (optional)"
              multiline
              rows={2}
              size="small"
              value={assignForm.notes}
              onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign}>Share</Button>
        </DialogActions>
      </Dialog>

      {/* --- BULK ASSIGN DIALOG --- */}
      <Dialog open={bulkAssignOpen} onClose={() => setBulkAssignOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>Bulk Assign Tasks</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              You are assigning <strong>{selectedTaskIds.length}</strong> tasks. 
              Set common details below, then specify quantities and stores for each task.
            </Alert>

            {/* Common Fields: stack on mobile, 2-col on desktop */}
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                 <FormControl fullWidth size="small">
                  <InputLabel>Lister</InputLabel>
                  <Select
                    label="Lister"
                    value={assignForm.listerId}
                    onChange={(e) => setAssignForm({ ...assignForm, listerId: e.target.value })}
                  >
                    {listers.map((l) => (
                      <MenuItem key={l._id} value={l._id}>{l.username}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Scheduled Date"
                  type="date"
                  size="small"
                  value={assignForm.scheduledDate}
                  onChange={(e) => setAssignForm({ ...assignForm, scheduledDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Listing Platform</InputLabel>
                  <Select
                    label="Listing Platform"
                    value={assignForm.listingPlatformId}
                    onChange={(e) => setAssignForm({ ...assignForm, listingPlatformId: e.target.value })}
                  >
                    {listingPlatforms.map((p) => (
                      <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                {/* This acts as a Helper to apply to all rows */}
                <FormControl fullWidth size="small" disabled={!assignForm.listingPlatformId}>
                  <InputLabel>Set All Stores</InputLabel>
                  <Select
                    label="Set All Stores"
                    value={assignForm.storeId} // Only used for display
                    onChange={(e) => applyToAll('storeId', e.target.value)}
                  >
                    {stores.map((s) => (
                      <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes (optional)"
                  multiline
                  rows={2}
                  size="small"
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                />
              </Grid>
            </Grid>

            <Divider>TASK DETAILS</Divider>

            {/* Helper for Quantity */}
            <Box display="flex" gap={2} alignItems="center" justifyContent="flex-end">
               <Typography variant="caption">Set all quantities:</Typography>
               <TextField 
                  size="small" 
                  type="number" 
                  sx={{ width: 80 }} 
                  onChange={(e) => applyToAll('quantity', e.target.value)}
                  placeholder="0"
               />
            </Box>

            {/* Task List Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflowX: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Product Title</TableCell>
                    <TableCell width={220}>Store</TableCell>
                    <TableCell width={120}>Quantity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedTaskIds.map(id => {
                    const task = rows.find(r => r._id === id);
                    const itemState = bulkItems[id] || {};
                    
                    if (!task) return null;
                    return (
                      <TableRow key={id}>
                        <TableCell>{task.productTitle}</TableCell>
                        <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={itemState.storeId || ''}
                                onChange={(e) => handleBulkItemChange(id, 'storeId', e.target.value)}
                                displayEmpty
                                disabled={!assignForm.listingPlatformId}
                              >
                                 <MenuItem value="" disabled><em>Select Store</em></MenuItem>
                                {stores.map((s) => (
                                  <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            type="number"
                            value={itemState.quantity || ''}
                            onChange={(e) => handleBulkItemChange(id, 'quantity', e.target.value)}
                            placeholder="Qty"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkAssignSubmit} fullWidth={isSmallMobile}>
            Assign All
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}