import { useState, useEffect } from 'react';
import {
  Box,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
  Paper
} from '@mui/material';
import { Restore as RestoreIcon } from '@mui/icons-material';

export default function ActionFieldEditor({ 
  baseActionField, 
  overrideActionField, 
  isOverridden,
  onSave,
  onReset
}) {
  const [actionField, setActionField] = useState('');
  
  useEffect(() => {
    const effective = isOverridden && overrideActionField 
      ? overrideActionField 
      : (baseActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)');
    setActionField(effective);
  }, [baseActionField, overrideActionField, isOverridden]);
  
  const handleSave = () => {
    if (!actionField.trim()) {
      alert('Action field cannot be empty');
      return;
    }
    onSave(actionField.trim());
  };
  
  const effectiveField = isOverridden && overrideActionField 
    ? overrideActionField 
    : (baseActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)');
    
  const hasChanges = actionField !== effectiveField;
  
  return (
    <Box>
      {isOverridden && (
        <Alert severity="success" sx={{ mb: 2 }} action={
          <Button size="small" onClick={onReset} startIcon={<RestoreIcon />}>
            Reset
          </Button>
        }>
          You have customized the Action field
        </Alert>
      )}
      
      {!isOverridden && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You're viewing the base template Action field. Edit and save to create your customization.
        </Alert>
      )}
      
      <TextField
        label="eBay Action Field"
        fullWidth
        multiline
        rows={3}
        value={actionField}
        onChange={(e) => setActionField(e.target.value)}
        placeholder="*Action(SiteID=US|Country=US|Currency=USD|Version=1193)"
        helperText="eBay File Exchange Action field configuration"
        sx={{ mb: 2 }}
      />
      
      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" gutterBottom>Common Examples:</Typography>
        <Stack spacing={0.5}>
          <Typography variant="caption" component="div">
            • US: *Action(SiteID=US|Country=US|Currency=USD|Version=1193)
          </Typography>
          <Typography variant="caption" component="div">
            • UK: *Action(SiteID=UK|Country=GB|Currency=GBP|Version=1193)
          </Typography>
          <Typography variant="caption" component="div">
            • AU: *Action(SiteID=AU|Country=AU|Currency=AUD|Version=1193)
          </Typography>
          <Typography variant="caption" component="div">
            • CA: *Action(SiteID=CA|Country=CA|Currency=CAD|Version=1193)
          </Typography>
        </Stack>
      </Paper>
      
      {hasChanges && (
        <Button
          fullWidth
          variant="contained"
          onClick={handleSave}
        >
          Save Action Field
        </Button>
      )}
    </Box>
  );
}
