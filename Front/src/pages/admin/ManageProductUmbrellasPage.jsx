import { useEffect, useState } from 'react';
import { 
  Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, 
  DialogContent, DialogActions, Alert, Chip, FormControl, FormLabel, Checkbox, 
  FormControlLabel, Accordion, AccordionSummary, AccordionDetails 
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon 
} from '@mui/icons-material';
import api from '../../lib/api.js';

export default function ManageProductUmbrellasPage() {
  const [umbrellas, setUmbrellas] = useState([]);
  const [availableColumns, setAvailableColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    customColumns: [] // { columnId, columnName, prompt, defaultPrompt }
  });

  const [editFormData, setEditFormData] = useState({
    name: '',
    customColumns: []
  });

  const [editDialog, setEditDialog] = useState(false);
  const [editingUmbrella, setEditingUmbrella] = useState(null);

  useEffect(() => {
    fetchUmbrellas();
    fetchAvailableColumns();
  }, []);

  const fetchUmbrellas = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/product-umbrellas');
      setUmbrellas(data || []);
    } catch (err) {
      setError('Failed to fetch product umbrellas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableColumns = async () => {
    try {
      const { data } = await api.get('/custom-columns');
      setAvailableColumns(data || []);
    } catch (err) {
      console.error('Failed to fetch columns:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name) {
      setError('Umbrella name is required');
      return;
    }

    try {
      setLoading(true);
      
      const dataToSend = {
        name: formData.name,
        customColumns: formData.customColumns.map(col => ({
          columnId: col.columnId,
          prompt: col.prompt
        }))
      };

      await api.post('/product-umbrellas', dataToSend);
      setSuccess('Product umbrella created successfully!');
      setFormData({ name: '', customColumns: [] });
      fetchUmbrellas();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create umbrella');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (umbrella) => {
    setEditingUmbrella(umbrella);
    
    const columnsWithDetails = (umbrella.customColumns || []).map(col => ({
      columnId: col.columnId._id,
      columnName: col.columnId.name,
      prompt: col.prompt,
      defaultPrompt: col.columnId.prompt
    }));

    setEditFormData({
      name: umbrella.name,
      customColumns: columnsWithDetails
    });
    setEditDialog(true);
  };

  const handleUpdate = async () => {
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      
      const dataToSend = {
        name: editFormData.name,
        customColumns: editFormData.customColumns.map(col => ({
          columnId: col.columnId,
          prompt: col.prompt
        }))
      };

      await api.put(`/product-umbrellas/${editingUmbrella._id}`, dataToSend);
      setSuccess('Product umbrella updated successfully!');
      setEditDialog(false);
      setEditingUmbrella(null);
      setEditFormData({ name: '', customColumns: [] });
      fetchUmbrellas();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update umbrella');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      setLoading(true);
      await api.delete(`/product-umbrellas/${id}`);
      setSuccess('Product umbrella deleted successfully!');
      fetchUmbrellas();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete umbrella');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (column) => {
    const exists = formData.customColumns.find(c => c.columnId === column._id);
    
    if (exists) {
      setFormData({
        ...formData,
        customColumns: formData.customColumns.filter(c => c.columnId !== column._id)
      });
    } else {
      setFormData({
        ...formData,
        customColumns: [
          ...formData.customColumns,
          {
            columnId: column._id,
            columnName: column.name,
            prompt: column.prompt,
            defaultPrompt: column.prompt
          }
        ]
      });
    }
  };

  const toggleEditColumn = (column) => {
    const exists = editFormData.customColumns.find(c => c.columnId === column._id);
    
    if (exists) {
      setEditFormData({
        ...editFormData,
        customColumns: editFormData.customColumns.filter(c => c.columnId !== column._id)
      });
    } else {
      setEditFormData({
        ...editFormData,
        customColumns: [
          ...editFormData.customColumns,
          {
            columnId: column._id,
            columnName: column.name,
            prompt: column.prompt,
            defaultPrompt: column.prompt
          }
        ]
      });
    }
  };

  const updateColumnPrompt = (columnId, newPrompt) => {
    setFormData({
      ...formData,
      customColumns: formData.customColumns.map(col =>
        col.columnId === columnId ? { ...col, prompt: newPrompt } : col
      )
    });
  };

  const updateEditColumnPrompt = (columnId, newPrompt) => {
    setEditFormData({
      ...editFormData,
      customColumns: editFormData.customColumns.map(col =>
        col.columnId === columnId ? { ...col, prompt: newPrompt } : col
      )
    });
  };

  // Form content - recreated on each render but React reconciliation handles it properly
  const formContent = (
    <Stack spacing={3}>
      <TextField
        label="Product Umbrella Name"
        required
        fullWidth
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="e.g., Rear Light, Phone Cases"
      />

      <FormControl component="fieldset">
        <FormLabel component="legend">Custom Columns (Optional)</FormLabel>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
          Select columns and customize their prompts for this umbrella
        </Typography>

        {availableColumns.map((column) => {
          const isSelected = formData.customColumns.some(c => c.columnId === column._id);
          const selectedColumn = formData.customColumns.find(c => c.columnId === column._id);

          return (
            <Accordion key={column._id} expanded={isSelected}>
              <AccordionSummary expandIcon={isSelected && <ExpandMoreIcon />}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleColumn(column)}
                    />
                  }
                  label={<strong>{column.name}</strong>}
                />
              </AccordionSummary>
              {isSelected && (
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Typography variant="caption" color="text.secondary">
                      Available placeholders: {'{title}'}, {'{brand}'}, {'{description}'}, {'{price}'}, {'{asin}'}
                    </Typography>
                    <TextField
                      label="Custom Prompt for this Umbrella"
                      multiline
                      rows={4}
                      fullWidth
                      value={selectedColumn?.prompt || ''}
                      onChange={(e) => updateColumnPrompt(column._id, e.target.value)}
                      helperText="Customize the prompt specifically for this product umbrella"
                    />
                    <Button
                      size="small"
                      onClick={() => updateColumnPrompt(column._id, column.prompt)}
                    >
                      Reset to Default Prompt
                    </Button>
                  </Stack>
                </AccordionDetails>
              )}
            </Accordion>
          );
        })}

        {availableColumns.length === 0 && (
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            No custom columns available. Create them in the Column Creator page first.
          </Typography>
        )}
      </FormControl>
    </Stack>
  );

  const editFormContent = (
    <Stack spacing={3}>
      <TextField
        label="Product Umbrella Name"
        required
        fullWidth
        value={editFormData.name}
        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
        placeholder="e.g., Rear Light, Phone Cases"
      />

      <FormControl component="fieldset">
        <FormLabel component="legend">Custom Columns (Optional)</FormLabel>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
          Select columns and customize their prompts for this umbrella
        </Typography>

        {availableColumns.map((column) => {
          const isSelected = editFormData.customColumns.some(c => c.columnId === column._id);
          const selectedColumn = editFormData.customColumns.find(c => c.columnId === column._id);

          return (
            <Accordion key={column._id} expanded={isSelected}>
              <AccordionSummary expandIcon={isSelected && <ExpandMoreIcon />}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleEditColumn(column)}
                    />
                  }
                  label={<strong>{column.name}</strong>}
                />
              </AccordionSummary>
              {isSelected && (
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Typography variant="caption" color="text.secondary">
                      Available placeholders: {'{title}'}, {'{brand}'}, {'{description}'}, {'{price}'}, {'{asin}'}
                    </Typography>
                    <TextField
                      label="Custom Prompt for this Umbrella"
                      multiline
                      rows={4}
                      fullWidth
                      value={selectedColumn?.prompt || ''}
                      onChange={(e) => updateEditColumnPrompt(column._id, e.target.value)}
                      helperText="Customize the prompt specifically for this product umbrella"
                    />
                    <Button
                      size="small"
                      onClick={() => updateEditColumnPrompt(column._id, column.prompt)}
                    >
                      Reset to Default Prompt
                    </Button>
                  </Stack>
                </AccordionDetails>
              )}
            </Accordion>
          );
        })}

        {availableColumns.length === 0 && (
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            No custom columns available. Create them in the Column Creator page first.
          </Typography>
        )}
      </FormControl>
    </Stack>
  );

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Manage Product Umbrellas</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
          Add New Product Umbrella
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          {formContent}
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{ mt: 2 }}
          >
            Add Product Umbrella
          </Button>
        </Box>
      </Paper>

      <Paper>
        <Typography variant="h6" sx={{ p: 2, bgcolor: 'grey.100', borderBottom: 1, borderColor: 'divider' }}>
          Existing Product Umbrellas ({umbrellas.length})
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Custom Columns</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {umbrellas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No product umbrellas found. Add one above!
                  </TableCell>
                </TableRow>
              ) : (
                umbrellas.map((umbrella) => (
                  <TableRow key={umbrella._id} hover>
                    <TableCell><strong>{umbrella.name}</strong></TableCell>
                    <TableCell>
                      {umbrella.customColumns?.length > 0 ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {umbrella.customColumns.map((col, idx) => (
                            <Chip
                              key={idx}
                              label={col.columnId?.name || 'Unknown'}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No custom columns
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(umbrella.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleEdit(umbrella)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(umbrella._id, umbrella.name)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Product Umbrella</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {editFormContent}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained" disabled={loading}>
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
