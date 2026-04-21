// src/pages/lister/ListerDashboard.jsx
import { useEffect, useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AppBar, Box, Button, Card, CardContent, Grid,
  Toolbar, Typography, Divider, TextField,
  Stack, Alert, IconButton, Autocomplete,
  Chip, LinearProgress, CardHeader, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Collapse
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ChatIcon from '@mui/icons-material/Chat';
import api from '../../lib/api.js';

// Simple helper to calculate completion percentage
const getProgress = (total, remaining) => {
  if (!total || total === 0) return 0;
  const completed = total - remaining;
  return Math.min(100, Math.max(0, (completed / total) * 100));
};

export default function ListerDashboard({ user, onLogout }) {
  const [today, setToday] = useState([]);
  const [pending, setPending] = useState([]);
  const [completed, setCompleted] = useState([]);

  // Per-assignment UI state
  const [selectedRanges, setSelectedRanges] = useState({});
  const [rangeQtys, setRangeQtys] = useState({});
  
  // Paste Modal State
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteAssignment, setPasteAssignment] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [unknownQty, setUnknownQty] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [expandedInModal, setExpandedInModal] = useState(false);
  const [selectedModels, setSelectedModels] = useState({}); // { modelName: count } - models selected for adding
  
  // Data Cache
  const [categoryRanges, setCategoryRanges] = useState({});
  const fetchingCategories = useRef(new Set());
  const [saving, setSaving] = useState({});

  // Combine for fetching logic
  const allAssignments = useMemo(() => [...today, ...pending, ...completed], [today, pending, completed]);

  // 1. Load Assignments
  const load = async () => {
    try {
      const { data } = await api.get('/assignments/mine/with-status');
      setToday(data?.todaysTasks ?? []);
      setPending(data?.pendingTasks ?? []);
      setCompleted(data?.completedTasks ?? []);
    } catch (e) {
      console.error("Failed to load dashboard", e);
    }
  };

  useEffect(() => { load(); }, []);

  // 2. Safe Range Fetching
  useEffect(() => {
    const fetchMissing = async () => {
      const neededCategoryIds = new Set();
      allAssignments.forEach(a => {
        const catId = a.task?.category?._id;
        if (catId && !categoryRanges[String(catId)] && !fetchingCategories.current.has(String(catId))) {
          neededCategoryIds.add(String(catId));
        }
      });

      if (neededCategoryIds.size === 0) return;

      neededCategoryIds.forEach(id => fetchingCategories.current.add(id));

      await Promise.all([...neededCategoryIds].map(async (catId) => {
        try {
          const { data } = await api.get('/ranges', { params: { categoryId: catId } });
          setCategoryRanges(prev => ({ ...prev, [String(catId)]: data }));
        } catch (e) {
          console.error(`Failed to load ranges for category ${catId}`, e);
        } finally {
          fetchingCategories.current.delete(catId);
        }
      }));
    };
    if (allAssignments.length > 0) fetchMissing();
  }, [allAssignments, categoryRanges]);

  // Open paste modal
  const openPasteModal = (assignment) => {
    setPasteAssignment(assignment);
    setPasteText('');
    setAnalyzeResult(null);
    setUnknownQty(0);
    setExpandedInModal(false);
    setPasteModalOpen(true);
  };

  // Close paste modal
  const closePasteModal = () => {
    setPasteModalOpen(false);
    setPasteAssignment(null);
    setPasteText('');
    setAnalyzeResult(null);
    setUnknownQty(0);
    setSelectedModels({});
  };

  // Helper: Detect search type based on category name
  const getSearchTypeForCategory = (categoryName) => {
    if (!categoryName) return 'vehicles';
    const lowerName = categoryName.toLowerCase();
    
    // Cell phones, tablets, accessories
    if (lowerName.includes('cell phone') || 
        lowerName.includes('cellphone') || 
        lowerName.includes('phone') ||
        lowerName.includes('tablet') ||
        lowerName.includes('mobile') ||
        lowerName.includes('smartphone')) {
      return 'devices'; // Search both phones and tablets
    }
    
    // Default to vehicles (eBay Motors)
    return 'vehicles';
  };

  // Analyze pasted text
  const handleAnalyze = async () => {
    if (!pasteText.trim() || !pasteAssignment) return;
    
    setAnalyzing(true);
    setAnalyzeResult(null);
    setSelectedModels({});
    
    try {
      // Detect search type based on category
      const categoryName = pasteAssignment.task?.category?.name || '';
      const categoryId = pasteAssignment.task?.category?._id;
      const searchType = getSearchTypeForCategory(categoryName);
      
      console.log(`[Analyze] Category: "${categoryName}" (${categoryId}) → Search Type: ${searchType}`);
      
      const { data } = await api.post('/range-analysis/analyze', { 
        textToAnalyze: pasteText,
        searchType: searchType,
        categoryId: categoryId  // Pass categoryId to also search existing ranges
      });
      
      setAnalyzeResult(data);
      
      // Initialize selectedModels with all detected models
      const initialSelected = {};
      (data.foundInDatabase || []).forEach(item => {
        initialSelected[item.modelName] = item.count;
      });
      setSelectedModels(initialSelected);
      
      // Calculate how many are unmatched
      const matchedCount = data.totalMatchCount || 0;
      const savedTotal = (pasteAssignment.rangeQuantities || []).reduce((sum, rq) => sum + (rq.quantity || 0), 0);
      const assignedQty = pasteAssignment.quantity || 0;
      const currentRemaining = assignedQty - savedTotal;
      
      // Unmatched = lines without a model
      const unmatchedFromPaste = data.unmatchedCount || 0;
      
      // Default unknown qty to unmatched count (but not more than remaining)
      setUnknownQty(Math.min(unmatchedFromPaste, Math.max(0, currentRemaining - matchedCount)));
      
    } catch (e) {
      console.error('Analysis failed:', e);
      alert('Failed to analyze text: ' + (e.response?.data?.error || e.message));
    } finally {
      setAnalyzing(false);
    }
  };

  // Submit detected ranges to assignment
  const handleSubmitRanges = async () => {
    if (!analyzeResult || !pasteAssignment) return;
    
    const catId = pasteAssignment.task?.category?._id;
    if (!catId) {
      alert('Category not found for this assignment');
      return;
    }
    
    setSubmitting(true);
    
    try {
      // Use selectedModels (user can remove models they don't want)
      const modelCounts = Object.entries(selectedModels)
        .filter(([_, count]) => count > 0)
        .map(([modelName, count]) => ({ modelName, count }));
      
      const { data } = await api.post('/range-analysis/save-bulk-ranges', {
        assignmentId: pasteAssignment._id,
        categoryId: catId,
        modelCounts: modelCounts,
        unknownQty: unknownQty > 0 ? unknownQty : 0
        // No remainingLimit - user controls what to add by removing chips
      });
      
      console.log(`[Bulk Save] Result:`, data);
      
      // Refresh and close
      await load();
      
      // Refresh category ranges cache
      const { data: refreshedRanges } = await api.get('/ranges', { params: { categoryId: catId } });
      setCategoryRanges(prev => ({ ...prev, [String(catId)]: refreshedRanges }));
      
      closePasteModal();
      
    } catch (e) {
      console.error('Submit failed:', e);
      alert('Failed to save ranges: ' + (e.response?.data?.error || e.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Manual add range (old method still available)
  const addRangeQuantity = async (assignmentId) => {
    const rangeId = selectedRanges[assignmentId];
    const qty = Number(rangeQtys[assignmentId] || 0);
    if (!rangeId || qty <= 0) return;

    setSaving(s => ({ ...s, [assignmentId]: true }));
    try {
      await api.post(`/assignments/${assignmentId}/complete-range`, { rangeId, quantity: qty });
      setRangeQtys(prev => ({ ...prev, [assignmentId]: '' }));
      setSelectedRanges(prev => ({ ...prev, [assignmentId]: '' }));
      await load();
    } catch (e) {
      alert('Error saving range.');
    } finally {
      setSaving(s => ({ ...s, [assignmentId]: false }));
    }
  };

  const removeRangeQuantity = async (assignmentId, rangeId) => {
    setSaving(s => ({ ...s, [assignmentId]: true }));
    try {
      await api.post(`/assignments/${assignmentId}/complete-range`, { rangeId, quantity: 0 });
      await load();
    } catch (e) {
      console.error('Failed to remove range', e);
    } finally {
      setSaving(s => ({ ...s, [assignmentId]: false }));
    }
  };

  // Submit assignment
  const handleSubmitAssignment = async (assignmentId) => {
    setSaving(s => ({ ...s, [assignmentId]: true }));
    try {
      await api.post(`/assignments/${assignmentId}/submit`);
      await load();
    } catch (e) {
      alert('Failed to submit: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(s => ({ ...s, [assignmentId]: false }));
    }
  };

  // --- CARD RENDERER ---
  const renderCard = (a) => {
    const t = a.task || {};
    const catId = t.category?._id ? String(t.category._id) : null;
    const availableRanges = (catId && categoryRanges[catId]) ? categoryRanges[catId] : [];
    
    const selectedRangeId = selectedRanges[a._id] || '';
    const selectedRangeObj = availableRanges.find(r => r._id === selectedRangeId) || null;
    const rangeQty = rangeQtys[a._id] || '';
    const isSaving = !!saving[a._id];

    const savedRqList = (a.rangeQuantities || []).map(rq => ({
      rangeId: rq.range?._id || rq.range,
      rangeName: rq.range?.name || '',
      quantity: rq.quantity || 0
    }));
    
    const savedTotal = savedRqList.reduce((sum, rq) => sum + (rq.quantity || 0), 0);
    const remaining = Math.max(0, a.quantity - savedTotal);
    const progress = getProgress(a.quantity, remaining);

    return (
      <Card key={a._id} elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardHeader
          avatar={<Avatar sx={{ bgcolor: remaining === 0 ? 'success.light' : 'primary.main' }}><AssignmentIcon /></Avatar>}
          subheader={new Date(a.createdAt).toLocaleDateString()}
          subheaderTypographyProps={{ fontWeight: 'bold', fontSize: '0.9rem' }}
          action={
             t.supplierLink && (
               <IconButton size="small" href={t.supplierLink} target="_blank" color="primary" title="Supplier Link">
                 <LinkIcon />
               </IconButton>
             )
          }
          sx={{ pb: 0 }}
        />
        
        <Divider />

        <CardContent sx={{ flexGrow: 1, pt: 2 }}>
          
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', lineHeight: 1.2 }}>
              Category: {t.category?.name || '-'} | Subcategory: {t.subcategory?.name || '-'}
            </Typography>

            <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>
              Total Qty: {a.quantity} | Remaining: <span style={{ color: remaining > 0 ? '#d32f2f' : 'green', fontWeight: 'bold' }}>{remaining}</span>
            </Typography>

            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', lineHeight: 1.2 }}>
              Listing: {a.listingPlatform?.name} / {a.store?.name}
            </Typography>

            <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>
              Marketplace: {a.marketplace?.replace('EBAY_', 'eBay ').replace('_', ' ') || '-'}
            </Typography>
          </Stack>

          {/* Progress Bar */}
          <Box sx={{ mb: 2 }}>
            <LinearProgress 
              variant="determinate" 
              value={progress} 
              color={remaining === 0 ? "success" : "primary"}
              sx={{ height: 8, borderRadius: 4, mb: 1 }}
            />
          </Box>

          {a.notes && (
            <Alert severity="info" sx={{ py: 0, px: 1, mb: 2, fontSize: '0.85rem' }}>
              <b>Note:</b> {a.notes}
            </Alert>
          )}

          {/* PASTE BUTTON - Primary Action */}
          {!a.completedAt && (
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              startIcon={<ContentPasteIcon />}
              onClick={() => openPasteModal(a)}
              sx={{ mb: 2 }}
            >
              Paste Listings to Detect Models
            </Button>
          )}

          {/* Manual Input Area (Collapsible) */}
          {!a.completedAt && (
            <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Or add manually:
              </Typography>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={7}>
                  <Autocomplete
                    size="small"
                    options={availableRanges || []} 
                    getOptionLabel={(option) => option?.name || ''}
                    value={selectedRangeObj}
                    onChange={(e, n) => setSelectedRanges(prev => ({ ...prev, [a._id]: n?._id || '' }))}
                    disabled={isSaving}
                    renderInput={(params) => <TextField {...params} label="Range" variant="outlined" />}
                    isOptionEqualToValue={(o, v) => o._id === v._id}
                  />
                </Grid>
                <Grid item xs={3}>
                  <TextField
                    size="small"
                    type="number"
                    label="Qty"
                    value={rangeQty}
                    onChange={(e) => setRangeQtys(prev => ({ ...prev, [a._id]: e.target.value }))}
                    inputProps={{ min: 0, max: remaining }}
                    disabled={isSaving || !selectedRangeId}
                  />
                </Grid>
                <Grid item xs={2}>
                  <IconButton 
                    color="primary" 
                    onClick={() => addRangeQuantity(a._id)}
                    disabled={isSaving || !selectedRangeId || !rangeQty || Number(rangeQty) <= 0 || Number(rangeQty) > remaining}
                    sx={{ border: '1px solid', borderRadius: 1 }}
                  >
                    <AddCircleOutlineIcon />
                  </IconButton>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Saved Chips Area */}
          {savedRqList.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
              {savedRqList.map((rq, idx) => {
                const rName = (catId && categoryRanges[catId]?.find(r => r._id === rq.rangeId)?.name) || rq.rangeName || '?';
                return (
                  <Chip
                    key={idx}
                    label={`${rName}: ${rq.quantity}`}
                    onDelete={!a.completedAt ? () => removeRangeQuantity(a._id, rq.rangeId) : undefined}
                    size="small"
                    color={rName === 'Unknown' ? 'warning' : 'default'}
                    variant="filled"
                  />
                );
              })}
            </Box>
          )}

          {/* Submit Button */}
          {!a.completedAt && savedTotal > 0 && (
            <Button
              variant="contained"
              color="success"
              fullWidth
              startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              onClick={() => handleSubmitAssignment(a._id)}
              disabled={isSaving}
            >
              Submit Assignment
            </Button>
          )}
          
          {a.completedAt && (
             <Typography variant="body2" color="success.main" align="center" sx={{ mt: 2, fontWeight: 'bold' }}>
               ✓ Completed
             </Typography>
          )}
        </CardContent>
      </Card>
    );
  };

  // Calculate modal stats based on user's selected models
  const getModalStats = () => {
    if (!analyzeResult || !pasteAssignment) return null;
    
    const savedTotal = (pasteAssignment.rangeQuantities || []).reduce((sum, rq) => sum + (rq.quantity || 0), 0);
    const assignedQty = pasteAssignment.quantity || 0;
    const currentRemaining = assignedQty - savedTotal;
    
    // Original detected counts
    const originalMatchedCount = analyzeResult.totalMatchCount || 0;
    const totalLines = analyzeResult.totalLinesAnalyzed || 0;
    const unmatchedCount = analyzeResult.unmatchedCount || 0;
    
    // User's selected counts (after removing chips)
    const selectedCount = Object.values(selectedModels).reduce((sum, count) => sum + count, 0);
    const removedCount = originalMatchedCount - selectedCount;
    
    // What will be added
    const totalToAdd = selectedCount + unknownQty;
    const exceeds = totalToAdd > currentRemaining;
    const newRemaining = currentRemaining - totalToAdd;
    
    return {
      assignedQty,
      savedTotal,
      currentRemaining,
      originalMatchedCount,
      selectedCount,
      removedCount,
      totalLines,
      unmatchedCount,
      totalToAdd,
      exceeds,
      newRemaining
    };
  };

  const modalStats = getModalStats();
  
  // Helper: Remove a model from selection
  const removeModel = (modelName) => {
    setSelectedModels(prev => {
      const updated = { ...prev };
      delete updated[modelName];
      return updated;
    });
  };

  return (
    <Box sx={{ pb: 4 }}>
      <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'white' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'primary.main', fontWeight: 'bold' }}>
            Lister Dashboard
          </Typography>
          {user && <Chip icon={<PersonIcon />} label={user.username} size="small" sx={{ mr: 1 }} />}
          <Button component={Link} to="/admin/select-seller" size="small" sx={{ mr: 1 }} startIcon={<AddCircleOutlineIcon />} variant="contained" color="primary">Template Listings</Button>
          <Button component={Link} to="/ideas" size="small" sx={{ mr: 1 }} startIcon={<LightbulbIcon />}>Ideas & Issues</Button>
          <Button component={Link} to="/about-me" size="small" sx={{ mr: 1 }} startIcon={<ChatIcon />}>Team Chat</Button>
          <Button component={Link} to="/about-me" size="small" sx={{ mr: 1 }}>About</Button>
          <Button onClick={onLogout} variant="outlined" size="small" color="error">Logout</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 1, md: 3 } }}>
        {/* Today Section */}
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
           Today's Tasks <Chip label={today.length} color="primary" size="small" />
        </Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {today.map(a => (
            <Grid item xs={12} sm={6} lg={4} xl={3} key={a._id}>{renderCard(a)}</Grid>
          ))}
          {today.length === 0 && <Grid item xs={12}><Typography color="text.secondary">No tasks for today.</Typography></Grid>}
        </Grid>

        <Divider sx={{ mb: 4 }} />

        {/* Pending Section */}
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
           Pending <Chip label={pending.length} color="warning" size="small" />
        </Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {pending.map(a => (
            <Grid item xs={12} sm={6} lg={4} xl={3} key={a._id}>{renderCard(a)}</Grid>
          ))}
          {pending.length === 0 && <Grid item xs={12}><Typography color="text.secondary">No pending tasks.</Typography></Grid>}
        </Grid>

        <Divider sx={{ mb: 4 }} />

        {/* Completed Section */}
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
           Completed <Chip label={completed.length} color="success" size="small" />
        </Typography>
        <Grid container spacing={2}>
          {completed.map(a => (
            <Grid item xs={12} sm={6} lg={4} xl={3} key={a._id}>{renderCard(a)}</Grid>
          ))}
          {completed.length === 0 && <Grid item xs={12}><Typography color="text.secondary">No completed tasks yet.</Typography></Grid>}
        </Grid>
      </Box>

      {/* PASTE MODAL */}
      <Dialog 
        open={pasteModalOpen} 
        onClose={closePasteModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {(() => {
            const categoryName = pasteAssignment?.task?.category?.name || '';
            const searchType = getSearchTypeForCategory(categoryName);
            if (searchType === 'devices') {
              return '📱 Paste Listings - Auto Detect Phone/Tablet Models';
            }
            return '🚗 Paste Listings - Auto Detect Car Models';
          })()}
        </DialogTitle>
        <DialogContent dividers>
          {/* Instructions */}
          <Alert severity="info" sx={{ mb: 2 }}>
            {(() => {
              const categoryName = pasteAssignment?.task?.category?.name || '';
              const searchType = getSearchTypeForCategory(categoryName);
              if (searchType === 'devices') {
                return 'Paste your listing titles (one per line). The system will detect phone and tablet models automatically.';
              }
              return 'Paste your listing titles (one per line). The system will detect car models automatically.';
            })()}
            <br />
            <Typography variant="caption" color="text.secondary">
              Category: {pasteAssignment?.task?.category?.name || '-'}
            </Typography>
          </Alert>
          
          {/* Text Area */}
          <TextField
            fullWidth
            multiline
            minRows={6}
            maxRows={12}
            label="Paste listing titles here (one per line)"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={(() => {
              const categoryName = pasteAssignment?.task?.category?.name || '';
              const searchType = getSearchTypeForCategory(categoryName);
              if (searchType === 'devices') {
                return "Screen Protector for iPhone 15 Pro Max\nCase for Samsung Galaxy S24 Ultra\nCharger for iPad Pro 12.9\n...";
              }
              return "Power Steering Pump for Honda CR-V 2005-2011 Accord 2006-2007\nBrake Pads for Toyota Camry 2018-2022\n...";
            })()}
            sx={{ mb: 2 }}
            disabled={analyzing}
          />
          
          {/* Analyze Button */}
          <Button
            variant="contained"
            onClick={handleAnalyze}
            disabled={!pasteText.trim() || analyzing}
            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
            sx={{ mb: 3 }}
          >
            {analyzing ? 'Analyzing...' : 'Detect Models'}
          </Button>
          
          {/* Results */}
          {analyzeResult && modalStats && (
            <Box>
              {/* Summary Stats */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={3}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                    <Typography variant="h5" color="primary">{modalStats.totalLines}</Typography>
                    <Typography variant="caption">Lines Pasted</Typography>
                  </Box>
                </Grid>
                <Grid item xs={3}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                    <Typography variant="h5" color="success.main">{modalStats.originalMatchedCount}</Typography>
                    <Typography variant="caption">Models Found</Typography>
                  </Box>
                </Grid>
                <Grid item xs={3}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#fff3e0', borderRadius: 1 }}>
                    <Typography variant="h5" color="warning.main">{modalStats.unmatchedCount}</Typography>
                    <Typography variant="caption">Not Matched</Typography>
                  </Box>
                </Grid>
                <Grid item xs={3}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Typography variant="h5">{modalStats.currentRemaining}</Typography>
                    <Typography variant="caption">Remaining Qty</Typography>
                  </Box>
                </Grid>
              </Grid>
              
              {/* Selected Models as Deletable Chips */}
              <Typography variant="subtitle2" gutterBottom>
                Selected Models ({Object.keys(selectedModels).length}) - Click ✕ to remove:
                {modalStats.removedCount > 0 && (
                  <Chip 
                    label={`${modalStats.removedCount} removed`} 
                    size="small" 
                    color="error" 
                    variant="outlined" 
                    sx={{ ml: 1 }}
                  />
                )}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2, maxHeight: 200, overflow: 'auto', p: 1, bgcolor: '#f9f9f9', borderRadius: 1, border: modalStats.exceeds ? '2px solid #f44336' : '1px solid #e0e0e0' }}>
                {Object.entries(selectedModels).map(([modelName, count], idx) => (
                  <Chip 
                    key={idx} 
                    label={`${modelName}: ${count}`}
                    size="small"
                    color="success"
                    variant="filled"
                    onDelete={() => removeModel(modelName)}
                  />
                ))}
                {Object.keys(selectedModels).length === 0 && (
                  <Typography variant="body2" color="text.secondary">No models selected (all removed)</Typography>
                )}
              </Box>
              
              {/* Warning if exceeds */}
              {modalStats.exceeds && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <strong>⚠️ Total ({modalStats.totalToAdd}) exceeds remaining qty ({modalStats.currentRemaining})!</strong>
                  <br />Remove {modalStats.totalToAdd - modalStats.currentRemaining} more items by clicking ✕ on the chips above.
                </Alert>
              )}
              
              {/* Unmatched Lines (Expandable) */}
              {modalStats.unmatchedCount > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Button 
                    size="small" 
                    onClick={() => setExpandedInModal(!expandedInModal)}
                    startIcon={expandedInModal ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  >
                    {expandedInModal ? 'Hide' : 'Show'} Unmatched Lines ({modalStats.unmatchedCount})
                  </Button>
                  <Collapse in={expandedInModal}>
                    <Box sx={{ maxHeight: 150, overflow: 'auto', p: 1, bgcolor: '#fff3e0', borderRadius: 1, mt: 1 }}>
                      {(analyzeResult.unmatchedLines || []).map((line, idx) => (
                        <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5 }}>
                          Line {line.lineNumber}: {line.text}
                        </Typography>
                      ))}
                    </Box>
                  </Collapse>
                </Box>
              )}
              
              {/* Unknown Quantity Input */}
              {modalStats.unmatchedCount > 0 && (
                <Box sx={{ bgcolor: '#fff3e0', p: 2, borderRadius: 1, mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    ⚠️ {modalStats.unmatchedCount} lines couldn't be matched to a car model.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    How many should be added as "Unknown" range?
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    label="Unknown Quantity"
                    value={unknownQty}
                    onChange={(e) => setUnknownQty(Math.max(0, Math.min(Number(e.target.value), Math.max(0, modalStats.currentRemaining - modalStats.matchedCount))))}
                    inputProps={{ min: 0, max: Math.max(0, modalStats.currentRemaining - modalStats.selectedCount) }}
                    sx={{ width: 150 }}
                  />
                </Box>
              )}
              
              {/* Final Summary */}
              <Alert severity={modalStats.exceeds ? 'error' : modalStats.newRemaining === 0 ? 'success' : 'warning'}>
                <strong>Summary:</strong> Selected {modalStats.selectedCount} models + {unknownQty} unknown = {modalStats.totalToAdd} total.
                {modalStats.removedCount > 0 && ` (${modalStats.removedCount} removed by you)`}
                {!modalStats.exceeds && modalStats.newRemaining > 0 && ` → ${modalStats.newRemaining} still remaining after this.`}
                {!modalStats.exceeds && modalStats.newRemaining === 0 && ` → Assignment will be complete!`}
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePasteModal} disabled={submitting}>Cancel</Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleSubmitRanges}
            disabled={!analyzeResult || submitting || (modalStats && modalStats.totalToAdd <= 0) || (modalStats && modalStats.exceeds)}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          >
            {submitting ? 'Saving...' : `Add ${modalStats?.totalToAdd || 0} Ranges`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}