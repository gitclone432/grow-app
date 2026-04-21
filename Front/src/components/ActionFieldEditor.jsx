import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Alert,
  Box
} from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import api from '../lib/api';

export default function ActionFieldEditor({ templateId, sellerId }) {
  const [open, setOpen] = useState(false);
  const [actionField, setActionField] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      fetchActionField();
    }
  }, [open, templateId]);

  const fetchActionField = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = sellerId 
        ? `/listing-templates/action-field/${templateId}?sellerId=${sellerId}`
        : `/listing-templates/action-field/${templateId}`;
      const response = await api.get(url);
      setActionField(response.data.actionField);
    } catch (err) {
      setError('Failed to load Action field');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await api.put(`/listing-templates/action-field/${templateId}`, {
        actionField,
        sellerId
      });
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save Action field');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Edit eBay Action Field">
        <IconButton onClick={() => setOpen(true)} size="small" color="primary">
          <EditIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit eBay Action Field</DialogTitle>
        
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>Action field saved successfully!</Alert>}
          
          <Alert severity="info" sx={{ mb: 2 }}>
            This text will appear as the first column header in your downloaded CSV.
            It tells eBay which marketplace, currency, and format to use.
          </Alert>
          
          <TextField
            label="Action Field"
            value={actionField}
            onChange={(e) => setActionField(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="*Action(SiteID=US|Country=US|Currency=USD|Version=1193)"
            helperText="Edit the Action field parameters as needed"
            disabled={loading}
          />
          
          <Box sx={{ mt: 2 }}>
            <Alert severity="warning" variant="outlined">
              <strong>Common Examples:</strong>
              <br />• <strong>US:</strong> *Action(SiteID=US|Country=US|Currency=USD|Version=1193)
              <br />• <strong>UK:</strong> *Action(SiteID=UK|Country=GB|Currency=GBP|Version=1193)
              <br />• <strong>AU:</strong> *Action(SiteID=AU|Country=AU|Currency=AUD|Version=1193)
              <br />• <strong>CA:</strong> *Action(SiteID=CA|Country=CA|Currency=CAD|Version=1193)
              <br />• <strong>DE:</strong> *Action(SiteID=DE|Country=DE|Currency=EUR|Version=1193)
            </Alert>
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            disabled={loading || !actionField.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
