import { useState, useEffect } from 'react';
import {
  Box,
  Stack,
  Button,
  Paper,
  Typography,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon
} from '@mui/icons-material';

export default function CustomColumnsEditor({ 
  baseColumns = [], 
  overrideColumns, 
  isOverridden,
  onSave,
  onReset
}) {
  const [columns, setColumns] = useState([]);
  const [editDialog, setEditDialog] = useState(false);
  const [columnForm, setColumnForm] = useState({
    name: '',
    displayName: '',
    dataType: 'text',
    defaultValue: '',
    isRequired: false,
    placeholder: '',
    order: 0
  });
  const [editIndex, setEditIndex] = useState(null);
  
  useEffect(() => {
    // Use override if exists, otherwise use base
    setColumns(isOverridden && overrideColumns ? [...overrideColumns] : [...baseColumns]);
  }, [baseColumns, overrideColumns, isOverridden]);
  
  const handleAddColumn = () => {
    const maxOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) : 38;
    setColumnForm({
      name: '',
      displayName: '',
      dataType: 'text',
      defaultValue: '',
      isRequired: false,
      placeholder: '',
      order: maxOrder + 1
    });
    setEditIndex(null);
    setEditDialog(true);
  };
  
  const handleEditColumn = (index) => {
    setColumnForm({ ...columns[index] });
    setEditIndex(index);
    setEditDialog(true);
  };
  
  const handleSaveColumn = () => {
    if (!columnForm.name || !columnForm.displayName) {
      alert('Column name and display name are required');
      return;
    }
    
    const newColumns = [...columns];
    if (editIndex !== null) {
      newColumns[editIndex] = columnForm;
    } else {
      newColumns.push(columnForm);
    }
    
    setColumns(newColumns);
    setEditDialog(false);
  };
  
  const handleDeleteColumn = (index) => {
    if (!confirm('Delete this column? This will remove it from your customization.')) {
      return;
    }
    
    const newColumns = columns.filter((_, i) => i !== index);
    setColumns(newColumns);
  };
  
  const handleSave = () => {
    onSave(columns);
  };
  
  const effectiveColumns = isOverridden && overrideColumns ? overrideColumns : baseColumns;
  const hasChanges = JSON.stringify(columns) !== JSON.stringify(effectiveColumns);
  
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1">
          {isOverridden ? 'Your Custom Columns' : 'Base Template Columns'}
        </Typography>
        <Stack direction="row" spacing={1}>
          {isOverridden && (
            <Button 
              size="small" 
              onClick={onReset}
              startIcon={<RestoreIcon />}
            >
              Reset to Base
            </Button>
          )}
          <Button 
            size="small" 
            variant="outlined"
            onClick={handleAddColumn}
            startIcon={<AddIcon />}
          >
            Add Column
          </Button>
        </Stack>
      </Stack>
      
      {!isOverridden && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You're viewing the base template columns. Click "Add Column" or edit existing columns to create your customization.
        </Alert>
      )}
      
      {columns.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
          <Typography color="text.secondary">
            No custom columns defined. Click "Add Column" to create one.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {columns.map((col, index) => (
            <Paper key={index} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body1" fontWeight="bold">{col.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {col.displayName} • {col.dataType}
                    {col.isRequired && ' • Required'}
                    {col.defaultValue && ` • Default: ${col.defaultValue}`}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <IconButton size="small" onClick={() => handleEditColumn(index)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDeleteColumn(index)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
      
      {hasChanges && (
        <Button
          fullWidth
          variant="contained"
          onClick={handleSave}
          sx={{ mt: 2 }}
        >
          Save Custom Columns
        </Button>
      )}
      
      {/* Add/Edit Column Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editIndex !== null ? 'Edit Column' : 'Add Column'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Column Name (CSV Header)"
              required
              fullWidth
              value={columnForm.name}
              onChange={(e) => setColumnForm({ ...columnForm, name: e.target.value })}
              placeholder="e.g., C:Brand, C:Color"
              helperText="Exact column name as it will appear in CSV"
            />
            
            <TextField
              label="Display Name"
              required
              fullWidth
              value={columnForm.displayName}
              onChange={(e) => setColumnForm({ ...columnForm, displayName: e.target.value })}
              placeholder="e.g., Brand, Color"
              helperText="User-friendly name for the UI"
            />
            
            <FormControl fullWidth>
              <InputLabel>Data Type</InputLabel>
              <Select
                value={columnForm.dataType}
                label="Data Type"
                onChange={(e) => setColumnForm({ ...columnForm, dataType: e.target.value })}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="number">Number</MenuItem>
                <MenuItem value="multiselect">Multi-select</MenuItem>
                <MenuItem value="boolean">Boolean</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Default Value"
              fullWidth
              value={columnForm.defaultValue}
              onChange={(e) => setColumnForm({ ...columnForm, defaultValue: e.target.value })}
              placeholder="e.g., Does Not Apply"
            />
            
            <TextField
              label="Placeholder"
              fullWidth
              value={columnForm.placeholder}
              onChange={(e) => setColumnForm({ ...columnForm, placeholder: e.target.value })}
              placeholder="e.g., Enter brand name"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveColumn} variant="contained">
            {editIndex !== null ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
