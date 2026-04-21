import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import api from '../lib/api';

export default function BulkDeactivateDialog({ open, onClose, onSuccess, templateId: propTemplateId, sellerId }) {
  const [skuInput, setSkuInput] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(propTemplateId || '');
  
  useEffect(() => {
    if (open && !propTemplateId && sellerId) {
      fetchTemplates();
    }
    if (propTemplateId) {
      setSelectedTemplateId(propTemplateId);
    }
  }, [open, propTemplateId, sellerId]);
  
  const fetchTemplates = async () => {
    try {
      const response = await api.get('/listing-templates');
      setTemplates(response.data || []);
      if (response.data?.length > 0) {
        setSelectedTemplateId(response.data[0]._id);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setCsvFile(file);
      // Parse CSV and populate skuInput
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // Simple CSV parsing: join all non-empty values
        const skus = text
          .split(/[\n,]/)
          .map(s => s.trim())
          .filter(Boolean)
          .join('\n');
        setSkuInput(skus);
      };
      reader.readAsText(file);
    }
  };

  const handleDeactivate = async () => {
    if (!skuInput.trim()) return;

    setLoading(true);
    try {
      const skus = skuInput
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);

      const response = await api.post('/template-listings/bulk-deactivate', { 
        templateId: selectedTemplateId, 
        sellerId, 
        skus 
      });
      setResults(response.data);
    } catch (error) {
      console.error('Deactivation failed:', error);
      alert(error.response?.data?.message || 'Failed to deactivate listings');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSkuInput('');
    setCsvFile(null);
    setResults(null);
    onClose();
  };

  const handleComplete = () => {
    onSuccess?.();
    handleReset();
  };

  return (
    <Dialog open={open} onClose={handleReset} maxWidth="md" fullWidth>
      <DialogTitle>Deactivate Listings by SKU</DialogTitle>
      <DialogContent>
        {!results ? (
          <>
            {!propTemplateId && templates.length > 0 && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Select Template</InputLabel>
                <Select
                  value={selectedTemplateId}
                  label="Select Template"
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={loading}
                >
                  {templates.map((template) => (
                    <MenuItem key={template._id} value={template._id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter SKUs to deactivate (comma or newline separated), or upload a CSV file
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ mb: 1 }}
              >
                Upload CSV File
                <input
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
              {csvFile && (
                <Typography variant="caption" color="text.secondary">
                  Loaded: {csvFile.name}
                </Typography>
              )}
            </Box>

            <TextField
              fullWidth
              multiline
              rows={8}
              placeholder="e.g., GRW25ABCDE, GRW25FGHIJ&#10;or paste multiple SKUs"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              disabled={loading}
              sx={{ mb: 2 }}
            />

            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>Warning:</strong> This will change the status of active listings to 'inactive'.
              Inactive listings won't appear in active listings but can be reactivated later.
            </Alert>
          </>
        ) : (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              Deactivation Complete
            </Alert>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Summary
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Total SKUs Processed"
                    secondary={results.summary.totalProcessed}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Successfully Deactivated"
                    secondary={results.summary.deactivated}
                    secondaryTypographyProps={{ color: 'success.main' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Already Inactive"
                    secondary={results.summary.alreadyInactive}
                    secondaryTypographyProps={{ color: 'info.main' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Not Found"
                    secondary={results.summary.notFound}
                    secondaryTypographyProps={{ color: 'error.main' }}
                  />
                </ListItem>
              </List>
            </Box>

            {results.details.deactivated.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Deactivated SKUs ({results.details.deactivated.length})
                </Typography>
                <Box
                  sx={{
                    maxHeight: 150,
                    overflow: 'auto',
                    bgcolor: 'grey.50',
                    p: 1,
                    borderRadius: 1
                  }}
                >
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {results.details.deactivated.join(', ')}
                  </Typography>
                </Box>
              </>
            )}

            {results.details.alreadyInactive.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Already Inactive ({results.details.alreadyInactive.length})
                </Typography>
                <Box
                  sx={{
                    maxHeight: 100,
                    overflow: 'auto',
                    bgcolor: 'grey.50',
                    p: 1,
                    borderRadius: 1
                  }}
                >
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {results.details.alreadyInactive.join(', ')}
                  </Typography>
                </Box>
              </>
            )}

            {results.details.notFound.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom color="error">
                  Not Found ({results.details.notFound.length})
                </Typography>
                <Box
                  sx={{
                    maxHeight: 100,
                    overflow: 'auto',
                    bgcolor: 'grey.50',
                    p: 1,
                    borderRadius: 1
                  }}
                >
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {results.details.notFound.join(', ')}
                  </Typography>
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {!results ? (
          <>
            <Button onClick={handleReset}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeactivate}
              disabled={loading || !skuInput.trim()}
            >
              {loading ? <CircularProgress size={24} /> : 'Deactivate Listings'}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleComplete}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
