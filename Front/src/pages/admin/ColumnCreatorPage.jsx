import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Alert,
  Stack,
  Chip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import api from '../../lib/api';

export default function ColumnCreatorPage() {
  // Mobile responsiveness (same approach as FulfillmentDashboard)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    prompt: '',
    dataType: 'text',
    description: ''
  });

  const [editDialog, setEditDialog] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);

  useEffect(() => {
    fetchColumns();
  }, []);

  const fetchColumns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/custom-columns');
      setColumns(response.data);
    } catch (err) {
      setError('Failed to fetch columns');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.prompt) {
      setError('Name and prompt are required');
      return;
    }

    try {
      setLoading(true);
      await api.post('/custom-columns', formData);
      setSuccess('Column created successfully!');
      setFormData({ name: '', prompt: '', dataType: 'text', description: '' });
      fetchColumns();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create column');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (column) => {
    setEditingColumn(column);
    setFormData({
      name: column.name,
      prompt: column.prompt,
      dataType: column.dataType,
      description: column.description || ''
    });
    setEditDialog(true);
  };

  const handleUpdate = async () => {
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      await api.put(`/custom-columns/${editingColumn._id}`, formData);
      setSuccess('Column updated successfully!');
      setEditDialog(false);
      setEditingColumn(null);
      setFormData({ name: '', prompt: '', dataType: 'text', description: '' });
      fetchColumns();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update column');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this column?')) return;

    try {
      setLoading(true);
      await api.delete(`/custom-columns/${id}`);
      setSuccess('Column deleted successfully!');
      fetchColumns();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete column');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Column Creator</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create custom columns with AI-generated content for Product Umbrellas
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Add New Column</Typography>
        <Stack component="form" onSubmit={handleSubmit} spacing={2}>
          <TextField
            label="Column Name"
            required
            fullWidth
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., eBay Title, Material, eBay Description"
          />

          <TextField
            label="Data Type"
            select
            fullWidth
            value={formData.dataType}
            onChange={(e) => setFormData({ ...formData, dataType: e.target.value })}
          >
            <MenuItem value="text">Text</MenuItem>
            <MenuItem value="number">Number</MenuItem>
            <MenuItem value="url">URL</MenuItem>
          </TextField>

          <TextField
            label="Description (Optional)"
            fullWidth
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of what this column contains"
          />

          <TextField
            label="Default Gemini Prompt"
            required
            fullWidth
            multiline
            rows={6}
            value={formData.prompt}
            onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
            placeholder="Enter the default prompt template. Use {title}, {brand}, {description}, {price} as placeholders"
            helperText="Available placeholders: {title}, {brand}, {description}, {price}, {asin}"
          />

          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{ alignSelf: 'flex-start' }}
          >
            Create Column
          </Button>
        </Stack>
      </Paper>

      <Paper>
        <Typography variant="h6" sx={{ p: 2, bgcolor: 'grey.100', borderBottom: 1, borderColor: 'divider' }}>
          Existing Columns ({columns.length})
        </Typography>

        {/* MOBILE: Card view */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, p: 2 }}>
          <Stack spacing={1.5}>
            {columns.length === 0 ? (
              <Paper sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
                No columns created yet. Add one above!
              </Paper>
            ) : (
              columns.map((column) => (
                <Paper key={column._id} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                          {column.name}
                        </Typography>
                        <Chip label={column.dataType} size="small" variant="outlined" sx={{ mt: 0.5 }} />
                      </Box>

                      <Stack direction="row" spacing={0.5} flexShrink={0}>
                        <IconButton size="small" onClick={() => handleEdit(column)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(column._id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      {column.description || '-'}
                    </Typography>

                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.4 }}
                    >
                      {column.prompt}
                    </Typography>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        </Box>

        {/* DESKTOP: Table view */}
        <TableContainer sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Data Type</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 300 }}>Prompt Preview</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {columns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No columns created yet. Add one above!
                  </TableCell>
                </TableRow>
              ) : (
                columns.map((column) => (
                  <TableRow key={column._id} hover>
                    <TableCell><strong>{column.name}</strong></TableCell>
                    <TableCell>
                      <Chip label={column.dataType} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{column.description || '-'}</TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          maxWidth: 400, 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'help',
                          fontSize: '0.85rem'
                        }}
                        title={column.prompt}
                      >
                        {column.prompt}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleEdit(column)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(column._id)}>
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
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Column</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Column Name"
              required
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />

            <TextField
              label="Data Type"
              select
              fullWidth
              value={formData.dataType}
              onChange={(e) => setFormData({ ...formData, dataType: e.target.value })}
            >
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="number">Number</MenuItem>
              <MenuItem value="url">URL</MenuItem>
            </TextField>

            <TextField
              label="Description (Optional)"
              fullWidth
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            <TextField
              label="Default Gemini Prompt"
              required
              fullWidth
              multiline
              rows={6}
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              helperText="Available placeholders: {title}, {brand}, {description}, {price}, {asin}"
            />
          </Stack>
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
