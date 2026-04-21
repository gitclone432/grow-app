import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  Alert,
  Chip,
  Typography,
  CircularProgress,
  Stack
} from '@mui/material';
import { 
  Settings as SettingsIcon,
  RestartAlt as RestartIcon
} from '@mui/icons-material';
import api from '../lib/api';
import CustomColumnsEditor from './override-editors/CustomColumnsEditor';
import AsinAutomationEditor from './override-editors/AsinAutomationEditor';
import PricingConfigEditor from './override-editors/PricingConfigEditor';
import ActionFieldEditor from './override-editors/ActionFieldEditor';

export default function TemplateCustomizationDialog({ 
  open, 
  onClose, 
  templateId, 
  sellerId,
  templateName,
  readOnly = false
}) {
  const [currentTab, setCurrentTab] = useState(0);
  const [baseTemplate, setBaseTemplate] = useState(null);
  const [override, setOverride] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  useEffect(() => {
    if (open && templateId && sellerId) {
      fetchTemplateData();
    }
  }, [open, templateId, sellerId]);
  
  const fetchTemplateData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch base template and override
      const [baseRes, overrideRes] = await Promise.all([
        api.get(`/listing-templates/${templateId}`),
        api.get(`/template-overrides/${templateId}/override?sellerId=${sellerId}`)
      ]);
      
      setBaseTemplate(baseRes.data);
      setOverride(overrideRes.data);
    } catch (err) {
      setError('Failed to load template data');
      console.error('Error fetching template data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveSection = async (section, data) => {
    try {
      setError('');
      await api.patch(`/template-overrides/${templateId}/override/${section}`, {
        sellerId,
        data
      });
      
      setSuccess(`${section} customization saved!`);
      setTimeout(() => setSuccess(''), 3000);
      
      // Refresh data
      await fetchTemplateData();
    } catch (err) {
      setError(`Failed to save ${section} customization`);
      console.error(`Error saving ${section}:`, err);
    }
  };
  
  const handleResetSection = async (section) => {
    if (!confirm(`Reset ${section} to base template configuration?`)) {
      return;
    }
    
    try {
      setError('');
      await api.delete(`/template-overrides/${templateId}/override/${section}?sellerId=${sellerId}`);
      
      setSuccess(`${section} reset to base template!`);
      setTimeout(() => setSuccess(''), 3000);
      
      // Refresh data
      await fetchTemplateData();
    } catch (err) {
      setError(`Failed to reset ${section}`);
      console.error(`Error resetting ${section}:`, err);
    }
  };
  
  const handleResetAll = async () => {
    if (!confirm('Reset ALL customizations and revert to base template? This cannot be undone.')) {
      return;
    }
    
    try {
      setError('');
      await api.delete(`/template-overrides/${templateId}/override?sellerId=${sellerId}`);
      
      setSuccess('All customizations reset to base template!');
      setTimeout(() => setSuccess(''), 3000);
      
      // Refresh data
      await fetchTemplateData();
    } catch (err) {
      setError('Failed to reset all customizations');
      console.error('Error resetting all:', err);
    }
  };
  
  const hasAnyOverride = override && Object.values(override.overrides || {}).some(v => v === true);
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <SettingsIcon />
            <Typography variant="h6">Customize Template: {templateName}</Typography>
            {readOnly && (
              <Chip label="View only mode" color="default" size="small" />
            )}
            {!readOnly && hasAnyOverride && (
              <Chip 
                label="Customized" 
                color="primary" 
                size="small"
              />
            )}
          </Stack>
        </Stack>
      </DialogTitle>
      
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
        
        {readOnly ? (
          <Alert severity="info" sx={{ mb: 2 }}>View only mode — changes cannot be saved from this context.</Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            Your changes will only affect your listings. The base template remains unchanged for other sellers.
          </Alert>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab label="Custom Columns" />
              <Tab label="ASIN Auto-Fill" />
              <Tab label="Pricing Config" />
              <Tab label="Action Field" />
            </Tabs>

            <Box sx={{ mt: 2, minHeight: 400, pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.85 : 1 }}>
              {currentTab === 0 && (
                <CustomColumnsEditor 
                  baseColumns={baseTemplate?.customColumns}
                  overrideColumns={override?.customColumns}
                  isOverridden={override?.overrides?.customColumns}
                  onSave={(data) => handleSaveSection('customColumns', data)}
                  onReset={() => handleResetSection('customColumns')}
                />
              )}
              
              {currentTab === 1 && (
                <AsinAutomationEditor 
                  baseConfig={baseTemplate?.asinAutomation}
                  overrideConfig={override?.asinAutomation}
                  isOverridden={override?.overrides?.asinAutomation}
                  customColumns={baseTemplate?.customColumns}
                  onSave={(data) => handleSaveSection('asinAutomation', data)}
                  onReset={() => handleResetSection('asinAutomation')}
                />
              )}
              
              {currentTab === 2 && (
                <PricingConfigEditor 
                  baseConfig={baseTemplate?.pricingConfig}
                  overrideConfig={override?.pricingConfig}
                  isOverridden={override?.overrides?.pricingConfig}
                  onSave={(data) => handleSaveSection('pricingConfig', data)}
                  onReset={() => handleResetSection('pricingConfig')}
                />
              )}
              
              {currentTab === 3 && (
                <ActionFieldEditor 
                  baseActionField={baseTemplate?.customActionField}
                  overrideActionField={override?.customActionField}
                  isOverridden={override?.overrides?.customActionField}
                  onSave={(data) => handleSaveSection('customActionField', data)}
                  onReset={() => handleResetSection('customActionField')}
                />
              )}
            </Box>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        {!readOnly && hasAnyOverride && (
          <Button 
            onClick={handleResetAll} 
            color="warning"
            startIcon={<RestartIcon />}
          >
            Reset All to Base
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
