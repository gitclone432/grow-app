import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Alert, LinearProgress, Typography, Box, Stack, Chip, Paper,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Upload as UploadIcon } from '@mui/icons-material';
import api from '../lib/api.js';

export default function BulkImportASINsDialog({ open, onClose, templateId: propTemplateId, sellerId, onImportComplete }) {
  const [asinInput, setAsinInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(propTemplateId || '');
  
  // Fetch templates when dialog opens if no templateId provided
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
      setError('Failed to load templates');
    }
  };

  const parseASINs = () => {
    if (!asinInput.trim()) return [];
    
    // Split by newlines, commas, spaces, and filter out empty values
    const asins = asinInput
      .split(/[\n,\s]+/)
      .map(a => a.trim().toUpperCase())
      .filter(a => a.length > 0);
    
    // Remove duplicates
    return [...new Set(asins)];
  };

  const asinCount = parseASINs().length;

  const handleImport = async () => {
    const asins = parseASINs();
    
    if (asins.length === 0) {
      setError('Please enter at least one ASIN');
      return;
    }

    setImporting(true);
    setError('');
    setResults(null);
    setProgress({ current: 0, total: asins.length });

    try {
      const response = await api.post('/template-listings/bulk-import-asins', {
        templateId: selectedTemplateId,
        sellerId,
        asins
      });

      const data = response.data;

      setProgress({ current: data.imported, total: data.total });
      setResults(data);

      // Notify parent to refresh listings
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import ASINs');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (!importing) {
      setAsinInput('');
      setResults(null);
      setError('');
      setProgress(null);
      onClose();
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setAsinInput(text);
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Bulk Import ASINs</DialogTitle>
      <DialogContent>
        {!results ? (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Import existing ASINs from your previous database. Listings will be created with placeholder data and marked as "draft". You can enrich them with product data later.
            </Alert>
            
            {!propTemplateId && templates.length > 0 && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Select Template</InputLabel>
                <Select
                  value={selectedTemplateId}
                  label="Select Template"
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={importing}
                >
                  {templates.map((template) => (
                    <MenuItem key={template._id} value={template._id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              fullWidth
              multiline
              rows={10}
              label="Paste ASINs (one per line)"
              placeholder="B0ABC123&#10;B0DEF456&#10;B0GHI789&#10;..."
              value={asinInput}
              onChange={(e) => setAsinInput(e.target.value)}
              disabled={importing}
              sx={{ mb: 2 }}
            />

            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
                disabled={importing}
              >
                Upload CSV/TXT File
                <input
                  type="file"
                  hidden
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                />
              </Button>
              
              {asinCount > 0 && (
                <Chip 
                  label={`${asinCount} ASIN${asinCount !== 1 ? 's' : ''} ready to import`}
                  color="primary"
                />
              )}
            </Stack>

            {importing && progress && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Importing ASINs...
                </Typography>
                <LinearProgress />
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        ) : (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Import Complete!
            </Alert>

            <Paper sx={{ p: 2, mb: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h6">
                  Import Summary
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Chip 
                    label={`✅ Imported: ${results.imported}`}
                    color="success"
                    variant="outlined"
                  />
                  <Chip 
                    label={`⏭️ Skipped: ${results.skipped}`}
                    color="default"
                    variant="outlined"
                  />
                  <Chip 
                    label={`📊 Total: ${results.total}`}
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
              </Stack>
            </Paper>

            {results.skippedDetails && results.skippedDetails.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Skipped ASINs ({results.skippedDetails.length}):
                </Typography>
                <Paper 
                  sx={{ 
                    maxHeight: 200, 
                    overflow: 'auto', 
                    p: 1, 
                    backgroundColor: 'grey.50' 
                  }}
                >
                  {results.skippedDetails.map((item, idx) => (
                    <Typography key={idx} variant="caption" display="block">
                      {item.asin} {item.sku && `(${item.sku})`} - {item.reason}
                    </Typography>
                  ))}
                </Paper>
              </Box>
            )}

            {results.errors && results.errors.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {results.errors.length} error(s) occurred during import
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!results ? (
          <>
            <Button onClick={handleClose} disabled={importing}>
              Cancel
            </Button>
            <Button 
              onClick={handleImport} 
              variant="contained" 
              disabled={importing || asinCount === 0 || !selectedTemplateId}
            >
              {importing ? 'Importing...' : `Import ${asinCount} ASIN${asinCount !== 1 ? 's' : ''}`}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} variant="contained">
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
