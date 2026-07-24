import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Paper, Checkbox, Typography, Alert, Divider, Grid, CircularProgress,
  useMediaQuery, useTheme, Chip
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AssignmentIcon from '@mui/icons-material/Assignment';
import api from '../../lib/api.js';
import SectionCard from '../../components/SectionCard.jsx';
import { BRAND_DARK, BRAND_DARK_ALT, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#fff',
  },
};

const dialogPaperSx = {
  borderRadius: 4,
  border: `1px solid ${alpha(BRAND_DARK, 0.08)}`,
  boxShadow: '0 24px 48px rgba(15, 23, 42, 0.16)',
  overflow: 'hidden',
};

const compactChipSx = {
  fontWeight: 600,
  border: `1px solid ${alpha(BRAND_DARK, 0.08)}`,
  backgroundColor: alpha(BRAND_DARK, 0.04),
};

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
    if (field === 'storeId') {
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
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress sx={{ color: BRAND_YELLOW_DARK }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
      <SectionCard
        emphasized
        sx={{
          mb: 3,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 55%, #31577d 100%)`,
          border: `1px solid ${alpha(BRAND_YELLOW, 0.18)}`,
          color: '#fffdf0',
          position: 'relative',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Box sx={{ position: 'absolute', top: -96, right: -68, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` }} />
          <Box sx={{ position: 'absolute', bottom: -88, left: '24%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, transparent 70%)' }} />
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          justifyContent="space-between"
          sx={{ position: 'relative', p: { xs: 3, md: 4 } }}
        >
          <Box sx={{ maxWidth: 840 }}>
            <Chip
              label="Task Assignment"
              size="small"
              sx={{
                mb: 1.5,
                bgcolor: alpha(BRAND_YELLOW, 0.14),
                color: BRAND_YELLOW,
                border: `1px solid ${alpha(BRAND_YELLOW, 0.24)}`,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            />
            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.1, mb: 1 }}>
              Listing Management
            </Typography>
            <Typography sx={{ color: 'rgba(255, 253, 240, 0.76)', maxWidth: 700 }}>
              Review pending listing tasks, assign them individually or in bulk, and keep platform and store routing consistent inside the refreshed admin dashboard layout.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.25} flexWrap="wrap" useFlexGap>
            <Chip label={`${rows.length} Tasks`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${selectedTaskIds.length} Selected`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${listingPlatforms.length} Listing Platforms`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
          </Stack>
        </Stack>
      </SectionCard>

      <SectionCard sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', lg: 'center' }}
          spacing={1.5}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK, mb: 0.5 }}>
              Assignment Queue
            </Typography>
            <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
              Select one or more tasks to share with listers and assign the correct listing store.
            </Typography>
          </Box>

          {selectedTaskIds.length > 0 && (
            <Button
              variant="contained"
              startIcon={<AssignmentIcon />}
              onClick={openBulkAssign}
              fullWidth={isMobile}
              sx={yellowFilledButtonSx}
            >
              Assign {selectedTaskIds.length} Selected Tasks
            </Button>
          )}
        </Stack>
      </SectionCard>

      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Stack spacing={1.5}>
          {rows.map((r, idx) => {
            const checked = isSelected(r._id);
            return (
              <SectionCard
                key={r._id}
                sx={{
                  p: 2,
                  borderColor: checked ? alpha(BRAND_YELLOW_DARK, 0.3) : alpha(BRAND_DARK, 0.08),
                  boxShadow: checked ? '0 18px 32px rgba(245, 200, 66, 0.14)' : undefined,
                }}
              >
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
                            sx={{ mt: 1, ...yellowOutlinedButtonSx }}
                          >
                            Supplier Link
                          </Button>
                        ) : null}
                      </Box>
                    </Stack>

                    <Button size="small" variant="outlined" onClick={() => openAssign(r)} sx={{ flexShrink: 0, ...yellowOutlinedButtonSx }}>
                      Share
                    </Button>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`Source: ${r.sourcePlatform?.name || '-'}`} sx={compactChipSx} />
                    <Chip size="small" label={`Marketplace: ${formatMarketplace(r.marketplace)}`} sx={compactChipSx} />
                    <Chip
                      size="small"
                      label={`Category: ${r.category?.name || '-'}${r.subcategory ? ` / ${r.subcategory.name}` : ''}`}
                      sx={compactChipSx}
                    />
                    <Chip size="small" label={`Created: ${r.createdBy?.username || '-'}`} sx={compactChipSx} />
                  </Stack>
                </Stack>
              </SectionCard>
            );
          })}
        </Stack>
      </Box>

      <SectionCard sx={{ p: { xs: 2, md: 2.5 }, display: { xs: 'none', md: 'block' } }}>
        <Box sx={{ mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha(BRAND_DARK, 0.08)}`, background: 'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)' }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between">
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                Pending Tasks
              </Typography>
              <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                Review task details, supplier links, and listing metadata before sharing to a lister.
              </Typography>
            </Box>
            <Chip label={`${rows.length} visible`} sx={{ alignSelf: { xs: 'flex-start', lg: 'center' }, bgcolor: alpha(BRAND_DARK, 0.06), color: BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }} />
          </Stack>
        </Box>

        <TableContainer sx={{ ...tableContainerSx, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={tableHeaderCellSx}>
                  <Checkbox
                    color="default"
                    indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < rows.length}
                    checked={rows.length > 0 && selectedTaskIds.length === rows.length}
                    onChange={handleSelectAllClick}
                    sx={{ color: 'rgba(255,255,255,0.78)', '&.Mui-checked': { color: '#fff' }, '&.MuiCheckbox-indeterminate': { color: '#fff' } }}
                  />
                </TableCell>
                <TableCell sx={tableHeaderCellSx}>SL No</TableCell>
                <TableCell sx={tableHeaderCellSx}>Date</TableCell>
                <TableCell sx={tableHeaderCellSx}>Product</TableCell>
                <TableCell sx={tableHeaderCellSx}>Source Platform</TableCell>
                <TableCell sx={tableHeaderCellSx}>Marketplace</TableCell>
                <TableCell sx={tableHeaderCellSx}>Category</TableCell>
                <TableCell sx={tableHeaderCellSx}>Created By</TableCell>
                <TableCell sx={tableHeaderCellSx}>Actions</TableCell>
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
                    sx={tableBodyRowSx}
                  >
                    <TableCell padding="checkbox" sx={tableBodyCellSx}>
                      <Checkbox
                        color="primary"
                        checked={isItemSelected}
                        onChange={(event) => handleClick(event, r._id)}
                      />
                    </TableCell>
                    <TableCell sx={tableBodyCellSx}>{idx + 1}</TableCell>
                    <TableCell sx={tableBodyCellSx}>{r.date ? new Date(r.date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell sx={tableBodyCellSx}>
                      <Typography sx={{ fontWeight: 600, color: BRAND_DARK, mb: 0.5 }}>{r.productTitle || '-'}</Typography>
                      {r.supplierLink ? (
                        <Typography
                          variant="caption"
                          component="a"
                          href={r.supplierLink}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ color: '#2563eb', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                        >
                          Supplier Link
                        </Typography>
                      ) : '-'}
                    </TableCell>
                    <TableCell sx={tableBodyCellSx}>{r.sourcePlatform?.name || '-'}</TableCell>
                    <TableCell sx={tableBodyCellSx}>{formatMarketplace(r.marketplace)}</TableCell>
                    <TableCell sx={tableBodyCellSx}>
                      {r.category?.name || '-'}
                      {r.subcategory ? ` / ${r.subcategory.name}` : ''}
                    </TableCell>
                    <TableCell sx={tableBodyCellSx}>{r.createdBy?.username || '-'}</TableCell>
                    <TableCell sx={tableBodyCellSx}>
                      <Button size="small" variant="outlined" onClick={() => openAssign(r)} sx={yellowOutlinedButtonSx}>
                        Share
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile} PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={{ background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 100%)`, color: '#fffdf0', fontWeight: 800 }}>
          Share Task
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {assigning && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
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
              sx={inputSx}
            />

            <TextField
              label="Scheduled Date"
              type="date"
              size="small"
              value={assignForm.scheduledDate}
              onChange={(e) => setAssignForm({ ...assignForm, scheduledDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={inputSx}
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
              sx={inputSx}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setAssignOpen(false)} sx={yellowOutlinedButtonSx}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign} sx={yellowFilledButtonSx}>Share</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkAssignOpen} onClose={() => setBulkAssignOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile} PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={{ background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 100%)`, color: '#fffdf0', fontWeight: 800 }}>
          Bulk Assign Tasks
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
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
                  sx={inputSx}
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
                  sx={inputSx}
                />
              </Grid>
            </Grid>

            <Divider sx={{ color: alpha(BRAND_DARK, 0.54), fontWeight: 700 }}>TASK DETAILS</Divider>

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

            <TableContainer component={Paper} variant="outlined" sx={{ ...tableContainerSx, maxHeight: 300, overflowX: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeaderCellSx}>Product Title</TableCell>
                    <TableCell width={220} sx={tableHeaderCellSx}>Store</TableCell>
                    <TableCell width={120} sx={tableHeaderCellSx}>Quantity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedTaskIds.map(id => {
                    const task = rows.find(r => r._id === id);
                    const itemState = bulkItems[id] || {};

                    if (!task) return null;
                    return (
                      <TableRow key={id} sx={tableBodyRowSx}>
                        <TableCell sx={tableBodyCellSx}>{task.productTitle}</TableCell>
                        <TableCell sx={tableBodyCellSx}>
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
                        <TableCell sx={tableBodyCellSx}>
                          <TextField
                            size="small"
                            type="number"
                            value={itemState.quantity || ''}
                            onChange={(e) => handleBulkItemChange(id, 'quantity', e.target.value)}
                            placeholder="Qty"
                            sx={inputSx}
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
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setBulkAssignOpen(false)} sx={yellowOutlinedButtonSx}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkAssignSubmit} fullWidth={isSmallMobile} sx={yellowFilledButtonSx}>
            Assign All
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}