import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Stack, Typography, Alert, Box, Chip
} from '@mui/material';
import CoreFieldDefaultsForm from './CoreFieldDefaultsForm.jsx';

export default function CoreFieldDefaultsDialog({ open, onClose, templateId, currentDefaults = {}, onSave }) {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      console.log('📥 CoreFieldDefaultsDialog opened with currentDefaults:', currentDefaults);
      setFormData(currentDefaults || {});
      setError('');
    }
  }, [open, currentDefaults]);

  const handleChange = (newFormData) => {
    setFormData(newFormData);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    console.log('💾 Saving core field defaults:', formData);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all default values?')) {
      setFormData({});
    }
  };

  const countSetDefaults = () => {
    return Object.keys(formData).filter(key => formData[key] !== '' && formData[key] !== null && formData[key] !== undefined).length;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Set Core Field Defaults</Typography>
          <Chip 
            label={`${countSetDefaults()} defaults set`} 
            color="primary" 
            size="small"
          />
        </Stack>
      </DialogTitle>
      
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>How it works:</strong> Set default values for core fields. These will be applied when creating new listings.
            Auto-fill (AI/ASIN/Calculator) can still override these defaults.
          </Typography>
        </Alert>

        <CoreFieldDefaultsForm formData={formData} onChange={handleChange} />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClearAll} color="error" disabled={saving}>
          Clear All
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save Defaults'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
