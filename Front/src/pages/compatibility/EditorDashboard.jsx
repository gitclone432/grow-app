import { useEffect, useState } from 'react';
import { 
  Box, Card, CardContent, Typography, Stack, TextField, Button, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Alert, IconButton, Autocomplete, AppBar, Toolbar, Grid, Divider, Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../lib/api.js';

export default function EditorDashboard({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [rangesByItem, setRangesByItem] = useState({});
  const [selectedRange, setSelectedRange] = useState({});
  const [qtyByItem, setQtyByItem] = useState({});
  const [saving, setSaving] = useState({});

  const load = async () => {
    const { data } = await api.get('/compatibility/mine');
    setItems(data || []);
    // Prefetch ranges for each item
    data?.forEach(item => {
      if (item?.task?.category?._id) {
        ensureRanges(item);
      }
    });
  };

  useEffect(() => { load(); }, []);

  const ensureRanges = async (item) => {
    if (rangesByItem[item._id]) return;
    const catId = item?.task?.category?._id || item?.task?.category;
    if (!catId) return;
    try {
      const { data } = await api.get('/ranges', { params: { categoryId: catId } });
      setRangesByItem(prev => ({ ...prev, [item._id]: data }));
    } catch (e) {
      console.error('Failed to load ranges', e);
    }
  };

  const addRangeQuantity = async (item) => {
    const rid = selectedRange[item._id];
    const q = Number(qtyByItem[item._id] || 0);
    if (!rid || q <= 0) return;
    
    setSaving(s => ({ ...s, [item._id]: true }));
    try {
      await api.post(`/compatibility/${item._id}/complete-range`, { rangeId: rid, quantity: q });
      setQtyByItem(prev => ({ ...prev, [item._id]: '' }));
      setSelectedRange(prev => ({ ...prev, [item._id]: '' }));
      await load();
    } catch (e) {
      console.error('Failed to save range quantity', e);
      alert('Failed to save range quantity. Please try again.');
    } finally {
      setSaving(s => ({ ...s, [item._id]: false }));
    }
  };

  const removeRangeQuantity = async (itemId, rangeId) => {
    setSaving(s => ({ ...s, [itemId]: true }));
    try {
      // Remove by setting quantity to 0
      await api.post(`/compatibility/${itemId}/complete-range`, { rangeId, quantity: 0 });
      await load();
    } catch (e) {
      console.error('Failed to remove range quantity', e);
      alert('Failed to remove range quantity. Please try again.');
    } finally {
      setSaving(s => ({ ...s, [itemId]: false }));
    }
  };

  const renderCard = (item) => {
    const t = item.task || {};
    const availableRanges = rangesByItem[item._id] || [];
    const selectedRangeId = selectedRange[item._id] || '';
    const selectedRangeObj = availableRanges.find(r => r._id === selectedRangeId) || null;
    const rangeQty = qtyByItem[item._id] || '';
    const isSaving = !!saving[item._id];

    // Assigned ranges from admin (what admin shared - never changes)
    const assignedRanges = (item.assignedRangeQuantities || []).map(rq => ({
      rangeId: rq.range?._id || rq.range,
      rangeName: rq.range?.name || '',
      quantity: rq.quantity || 0
    }));

    // Completed ranges by editor (what editor has filled so far)
    const completedRanges = (item.completedRangeQuantities || []).map(rq => ({
      rangeId: rq.range?._id || rq.range,
      rangeName: rq.range?.name || '',
      quantity: rq.quantity || 0
    }));

    const totalAssigned = item.quantity || 0;
    const totalCompleted = item.completedQuantity || 0;
    const remaining = Math.max(0, totalAssigned - totalCompleted);

    // Lazy load ranges if not ready
    if (t.category?._id && !rangesByItem[item._id]) {
      ensureRanges(item);
    }

    return (
      <Card key={item._id} sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>{t.productTitle}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Category: {t.category?.name || '-'} | Subcategory: {t.subcategory?.name || '-'}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Total Assigned: {totalAssigned} | Completed: {totalCompleted} | Remaining: {remaining}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Listing: {item.sourceAssignment?.listingPlatform?.name || '-'} / {item.sourceAssignment?.store?.name || '-'} / {item.sourceAssignment?.marketplace?.replace('EBAY_', 'eBay ')?.replace('_', ' ') || '-'}
          </Typography>
          {t.supplierLink ? (
            <Typography variant="body2" sx={{ mb: 2 }}>
              <a href={t.supplierLink} target="_blank" rel="noreferrer">Supplier Link</a>
            </Typography>
          ) : null}

          {item.notes && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2"><strong>Notes from Admin:</strong> {item.notes}</Typography>
            </Alert>
          )}

          {/* Show assigned ranges from admin */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Assigned Ranges & Quantities (from Admin):</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {assignedRanges.map((rq, i) => (
                <Chip 
                  key={i} 
                  label={`${rq.rangeName}: ${rq.quantity}`} 
                  color="primary" 
                  variant="outlined"
                  size="small" 
                />
              ))}
            </Stack>
          </Box>

          {item.completedAt ? (
            <Alert severity="success" sx={{ mb: 2 }}>Assignment Completed!</Alert>
          ) : null}

          {!item.completedAt && (
            <Stack spacing={2} sx={{ mb: 2 }}>
              <Autocomplete
                size="small"
                options={availableRanges}
                getOptionLabel={(option) => option.name}
                value={selectedRangeObj}
                onChange={(e, newValue) => setSelectedRange(prev => ({ ...prev, [item._id]: newValue?._id || '' }))}
                disabled={isSaving}
                renderInput={(params) => <TextField {...params} label="Select Range" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  type="number"
                  label="Quantity"
                  value={rangeQty}
                  onChange={(e) => setQtyByItem(prev => ({ ...prev, [item._id]: e.target.value }))}
                  inputProps={{ min: 0, max: remaining }}
                  disabled={isSaving || !selectedRangeId}
                  sx={{ flex: 1 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => addRangeQuantity(item)}
                  disabled={
                    isSaving ||
                    !selectedRangeId ||
                    !rangeQty ||
                    Number(rangeQty) <= 0 ||
                    Number(rangeQty) > remaining
                  }
                >
                  {isSaving ? 'Saving...' : 'Add'}
                </Button>
              </Stack>
            </Stack>
          )}

          {completedRanges.length > 0 && completedRanges.some(rq => rq.quantity > 0) && (
            <TableContainer component={Paper} sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Range</TableCell>
                    <TableCell>Completed Quantity</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {completedRanges.filter(rq => rq.quantity > 0).map((rq, idx) => {
                    const rangeName =
                      rangesByItem[item._id]?.find(r => r._id === rq.rangeId)?.name ||
                      rq.rangeName ||
                      'Unknown';
                    return (
                      <TableRow key={idx}>
                        <TableCell>{rangeName}</TableCell>
                        <TableCell>{rq.quantity}</TableCell>
                        <TableCell>
                          {!item.completedAt && (
                            <IconButton
                              size="small"
                              onClick={() => removeRangeQuantity(item._id, rq.rangeId)}
                              disabled={isSaving}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    );
  };

  // Separate items into categories
  const today = items.filter(i => {
    const createdToday = new Date(i.createdAt).toDateString() === new Date().toDateString();
    return createdToday && !i.completedAt;
  });
  const pending = items.filter(i => !i.completedAt && !today.includes(i));
  const completed = items.filter(i => i.completedAt);

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>My Compatibility Assignments</Typography>
          
        </Toolbar>
      </AppBar>

      <Box sx={{ mt: 3, px: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Today's Tasks</Typography>
        <Grid container spacing={2}>
          {today.map(item => (
            <Grid item xs={12} md={6} lg={4} key={item._id}>{renderCard(item)}</Grid>
          ))}
          {today.length === 0 && (
            <Grid item xs={12}><Typography variant="body2" color="text.secondary">No tasks assigned today.</Typography></Grid>
          )}
        </Grid>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ px: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Pending</Typography>
        <Grid container spacing={2}>
          {pending.map(item => (
            <Grid item xs={12} md={6} lg={4} key={item._id}>{renderCard(item)}</Grid>
          ))}
          {pending.length === 0 && (
            <Grid item xs={12}><Typography variant="body2" color="text.secondary">No pending assignments.</Typography></Grid>
          )}
        </Grid>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ px: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Completed</Typography>
        <Grid container spacing={2}>
          {completed.map(item => (
            <Grid item xs={12} md={6} lg={4} key={item._id}>{renderCard(item)}</Grid>
          ))}
          {completed.length === 0 && (
            <Grid item xs={12}><Typography variant="body2" color="text.secondary">No completed assignments yet.</Typography></Grid>
          )}
        </Grid>
      </Box>
    </Box>
  );
}
