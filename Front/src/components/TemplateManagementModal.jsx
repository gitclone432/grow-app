import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Stack, TextField, Button, Paper,
  CircularProgress, IconButton, Accordion, AccordionSummary, AccordionDetails,
  List, ListItem, ListItemText, ListItemSecondaryAction,
  Snackbar, Alert, Divider, Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CancelIcon from '@mui/icons-material/Cancel';
import api from '../lib/api';

/**
 * Template Management Modal
 * Allows users to add, edit, and delete chat templates
 */
export default function TemplateManagementModal({ open, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ category: '', label: '', text: '' });
  const [addForm, setAddForm] = useState({ category: '', label: '', text: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [existingCategories, setExistingCategories] = useState([]);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const { data } = await api.get('/chat-templates');
      setTemplates(data.templates || []);
      // Extract unique categories
      const cats = [...new Set((data.templates || []).map(g => g.category))];
      setExistingCategories(cats);
    } catch (e) {
      console.error('Failed to load templates:', e);
      showSnackbar('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showSnackbar(message, severity = 'success') {
    setSnackbar({ open: true, message, severity });
  }

  async function handleAddTemplate() {
    if (!addForm.category.trim() || !addForm.label.trim() || !addForm.text.trim()) {
      showSnackbar('All fields are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/chat-templates', addForm);
      showSnackbar('Template added successfully');
      setAddForm({ category: '', label: '', text: '' });
      setShowAddForm(false);
      await loadTemplates();
    } catch (e) {
      console.error('Failed to add template:', e);
      showSnackbar('Failed to add template: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSaving(false);
    }
  }

  function startEditing(item) {
    setEditingId(item._id);
    setEditForm({ 
      category: item.category || '', 
      label: item.label, 
      text: item.text 
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm({ category: '', label: '', text: '' });
  }

  async function handleSaveEdit(templateId) {
    if (!editForm.label.trim() || !editForm.text.trim()) {
      showSnackbar('Label and text are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/chat-templates/${templateId}`, {
        label: editForm.label,
        text: editForm.text
      });
      showSnackbar('Template updated successfully');
      setEditingId(null);
      setEditForm({ category: '', label: '', text: '' });
      await loadTemplates();
    } catch (e) {
      console.error('Failed to update template:', e);
      showSnackbar('Failed to update template: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(templateId) {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }
    setSaving(true);
    try {
      await api.delete(`/chat-templates/${templateId}`);
      showSnackbar('Template deleted successfully');
      await loadTemplates();
    } catch (e) {
      console.error('Failed to delete template:', e);
      showSnackbar('Failed to delete template: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedTemplates() {
    if (!window.confirm('This will seed the database with default templates. Continue?')) {
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/chat-templates/seed');
      if (data.success) {
        showSnackbar(data.message);
        await loadTemplates();
      } else {
        showSnackbar(data.message, 'warning');
      }
    } catch (e) {
      console.error('Failed to seed templates:', e);
      showSnackbar('Failed to seed templates: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Manage Chat Templates</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Add New Template Section */}
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f9ff' }}>
              {showAddForm ? (
                <Stack spacing={2}>
                  <Typography variant="subtitle1" fontWeight="bold">Add New Template</Typography>
                  <TextField
                    label="Category"
                    size="small"
                    fullWidth
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    helperText="Enter existing category or create new one"
                    placeholder="e.g., ORDER / INVENTORY ISSUES"
                  />
                  {existingCategories.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Typography variant="caption" color="text.secondary">Quick select:</Typography>
                      {existingCategories.map(cat => (
                        <Chip 
                          key={cat} 
                          label={cat} 
                          size="small" 
                          variant="outlined"
                          onClick={() => setAddForm({ ...addForm, category: cat })}
                          sx={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Stack>
                  )}
                  <TextField
                    label="Template Label"
                    size="small"
                    fullWidth
                    value={addForm.label}
                    onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                    placeholder="e.g., Out of Stock"
                  />
                  <TextField
                    label="Message Text"
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                    value={addForm.text}
                    onChange={(e) => setAddForm({ ...addForm, text: e.target.value })}
                    placeholder="Hi, ..."
                    helperText="Start with 'Hi,' for automatic personalization"
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button 
                      variant="outlined" 
                      onClick={() => { setShowAddForm(false); setAddForm({ category: '', label: '', text: '' }); }}
                      startIcon={<CancelIcon />}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="contained" 
                      onClick={handleAddTemplate}
                      disabled={saving}
                      startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                    >
                      Add Template
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                  <Button 
                    variant="contained" 
                    startIcon={<AddIcon />}
                    onClick={() => setShowAddForm(true)}
                  >
                    Add New Template
                  </Button>
                  {templates.length === 0 && (
                    <Button 
                      variant="outlined"
                      color="secondary"
                      onClick={handleSeedTemplates}
                      disabled={saving}
                    >
                      Seed Default Templates
                    </Button>
                  )}
                </Stack>
              )}
            </Paper>

            {/* Templates by Category */}
            {templates.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                No templates found. Add a new template or seed default templates.
              </Typography>
            ) : (
              templates.map((group, groupIdx) => (
                <Accordion key={groupIdx} defaultExpanded={groupIdx === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight="bold">{group.category}</Typography>
                    <Chip 
                      label={`${group.items.length} templates`} 
                      size="small" 
                      sx={{ ml: 2 }}
                    />
                  </AccordionSummary>
                  <AccordionDetails>
                    <List dense>
                      {group.items.map((item, idx) => (
                        <React.Fragment key={item._id || idx}>
                          <ListItem 
                            sx={{ 
                              bgcolor: editingId === item._id ? '#f0f7ff' : 'transparent',
                              borderRadius: 1,
                              flexDirection: 'column',
                              alignItems: 'stretch'
                            }}
                          >
                            {editingId === item._id ? (
                              <Stack spacing={2} sx={{ width: '100%', py: 1 }}>
                                <TextField
                                  label="Label"
                                  size="small"
                                  fullWidth
                                  value={editForm.label}
                                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                                />
                                <TextField
                                  label="Message Text"
                                  size="small"
                                  fullWidth
                                  multiline
                                  rows={3}
                                  value={editForm.text}
                                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                                />
                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  <Button 
                                    size="small" 
                                    variant="outlined"
                                    onClick={cancelEditing}
                                    startIcon={<CancelIcon />}
                                  >
                                    Cancel
                                  </Button>
                                  <Button 
                                    size="small" 
                                    variant="contained"
                                    onClick={() => handleSaveEdit(item._id)}
                                    disabled={saving}
                                    startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
                                  >
                                    Save
                                  </Button>
                                </Stack>
                              </Stack>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                                <ListItemText
                                  primary={
                                    <Typography variant="subtitle2" fontWeight="bold">
                                      {item.label}
                                    </Typography>
                                  }
                                  secondary={
                                    <Typography 
                                      variant="body2" 
                                      color="text.secondary"
                                      sx={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                      }}
                                    >
                                      {item.text}
                                    </Typography>
                                  }
                                />
                                <Stack direction="row" spacing={0.5}>
                                  <IconButton 
                                    size="small" 
                                    onClick={() => startEditing({ ...item, category: group.category })}
                                    color="primary"
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton 
                                    size="small" 
                                    onClick={() => handleDeleteTemplate(item._id)}
                                    color="error"
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </Box>
                            )}
                          </ListItem>
                          {idx < group.items.length - 1 && <Divider />}
                        </React.Fragment>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              ))
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
