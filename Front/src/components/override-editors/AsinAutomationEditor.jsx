import { useState, useEffect } from 'react';
import {
  Box,
  Stack,
  Button,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  Radio,
  FormLabel,
  Divider,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon,
  SmartToy as AiIcon,
  SwapHoriz as DirectIcon
} from '@mui/icons-material';

// Core eBay fields available for auto-fill
const CORE_EBAY_FIELDS = [
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'startPrice', label: 'Start Price' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'conditionId', label: 'Condition ID' },
  { value: 'conditionDescription', label: 'Condition Description' },
  { value: 'brand', label: 'Brand' },
  { value: 'mpn', label: 'MPN' },
  { value: 'upc', label: 'UPC' },
  { value: 'ean', label: 'EAN' },
  { value: 'categoryId', label: 'Category ID' }
];

// Amazon fields for direct mapping
const AMAZON_FIELDS = [
  { value: 'title', label: 'Title' },
  { value: 'brand', label: 'Brand' },
  { value: 'price', label: 'Price' },
  { value: 'description', label: 'Description (Features)' },
  { value: 'asin', label: 'ASIN' }
];

// Transform options
const TRANSFORM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'pipeSeparated', label: 'Pipe Separated (Array → String)' },
  { value: 'removeSymbol', label: 'Remove Currency Symbols' },
  { value: 'htmlFormat', label: 'HTML Format (Array → <ul>)' },
  { value: 'truncate80', label: 'Truncate to 80 characters' },
  { value: 'truncate60', label: 'Truncate to 60 characters' }
];

// Example prompts for common fields
const PROMPT_EXAMPLES = {
  title: 'Create a compelling eBay title for: {title}. Brand: {brand}. Keep under 80 characters.',
  description: 'Write an HTML product description for {title} by {brand}. Features: {description}. Price: {price}.',
  conditionDescription: 'Describe the condition as "New with tags" for this {title}.',
  brand: 'Extract and format the brand name from: {brand}'
};

export default function AsinAutomationEditor({ 
  baseConfig = { enabled: false, fieldConfigs: [] }, 
  overrideConfig, 
  isOverridden,
  customColumns = [],
  onSave,
  onReset
}) {
  const [config, setConfig] = useState({ enabled: false, fieldConfigs: [] });
  const [editDialog, setEditDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [fieldForm, setFieldForm] = useState({
    fieldType: 'core',
    ebayField: '',
    source: 'ai',
    promptTemplate: '',
    amazonField: '',
    transform: 'none',
    enabled: true,
    defaultValue: ''
  });
  
  useEffect(() => {
    // Always start with base template configs to ensure nothing is lost
    const baseFieldConfigs = baseConfig?.fieldConfigs || [];
    
    if (isOverridden && overrideConfig) {
      // Merge: Start with base configs, then apply override customizations
      const overrideFieldConfigs = overrideConfig.fieldConfigs || [];
      
      // Create a map of override configs by ebayField for quick lookup
      const overrideMap = new Map(
        overrideFieldConfigs.map(fc => [fc.ebayField, fc])
      );
      
      // Merge: Use override for matching fields, keep base for non-matching
      const mergedConfigs = baseFieldConfigs.map(baseConfig => {
        const override = overrideMap.get(baseConfig.ebayField);
        return override || baseConfig;
      });
      
      // Add any override configs that don't exist in base (seller-added custom fields)
      overrideFieldConfigs.forEach(overrideConfig => {
        if (!baseFieldConfigs.find(bc => bc.ebayField === overrideConfig.ebayField)) {
          mergedConfigs.push(overrideConfig);
        }
      });
      
      setConfig({
        enabled: overrideConfig.enabled !== undefined ? overrideConfig.enabled : baseConfig?.enabled || false,
        fieldConfigs: mergedConfigs
      });
    } else {
      // No override - use base config as-is
      setConfig(baseConfig || { enabled: false, fieldConfigs: [] });
    }
  }, [baseConfig, overrideConfig, isOverridden]);
  
  const handleToggleEnabled = (checked) => {
    setConfig({ ...config, enabled: checked });
  };
  
  const handleAddFieldConfig = () => {
    setFieldForm({
      fieldType: 'core',
      ebayField: '',
      source: 'ai',
      promptTemplate: '',
      amazonField: '',
      transform: 'none',
      enabled: true,
      defaultValue: ''
    });
    setEditingIndex(null);
    setEditDialog(true);
  };
  
  const handleEditFieldConfig = (index) => {
    setFieldForm({ ...config.fieldConfigs[index] });
    setEditingIndex(index);
    setEditDialog(true);
  };
  
  const handleDeleteFieldConfig = (index) => {
    if (!confirm('Delete this field configuration?')) {
      return;
    }
    
    const newConfigs = config.fieldConfigs.filter((_, i) => i !== index);
    setConfig({ ...config, fieldConfigs: newConfigs });
  };
  
  const handleSaveFieldConfig = () => {
    // Validation
    if (!fieldForm.ebayField) {
      alert('Please select a field');
      return;
    }
    
    if (fieldForm.source === 'ai' && !fieldForm.promptTemplate?.trim()) {
      alert('Please provide an AI prompt template');
      return;
    }
    
    if (fieldForm.source === 'direct' && !fieldForm.amazonField) {
      alert('Please select an Amazon field for direct mapping');
      return;
    }
    
    // Check for duplicates (same ebayField)
    const isDuplicate = config.fieldConfigs.some((fc, idx) => 
      fc.ebayField === fieldForm.ebayField && idx !== editingIndex
    );
    
    if (isDuplicate) {
      alert(`Field configuration for "${fieldForm.ebayField}" already exists`);
      return;
    }
    
    const newConfigs = [...config.fieldConfigs];
    if (editingIndex !== null) {
      newConfigs[editingIndex] = fieldForm;
    } else {
      newConfigs.push(fieldForm);
    }
    
    setConfig({ ...config, fieldConfigs: newConfigs });
    setEditDialog(false);
  };
  
  const handleToggleFieldEnabled = (index, enabled) => {
    const newConfigs = [...config.fieldConfigs];
    newConfigs[index] = { ...newConfigs[index], enabled };
    setConfig({ ...config, fieldConfigs: newConfigs });
  };
  
  const handleSave = () => {
    onSave(config);
  };
  
  const handleInsertPlaceholder = (placeholder) => {
    setFieldForm({
      ...fieldForm,
      promptTemplate: (fieldForm.promptTemplate || '') + placeholder
    });
  };
  
  const handleUseExample = (example) => {
    setFieldForm({
      ...fieldForm,
      promptTemplate: example
    });
  };
  
  const effectiveConfig = isOverridden && overrideConfig ? overrideConfig : baseConfig;
  const hasChanges = JSON.stringify(config) !== JSON.stringify(effectiveConfig);
  
  // Separate core and custom field configs
  const coreFieldConfigs = config.fieldConfigs.filter(fc => fc.fieldType === 'core');
  const customFieldConfigs = config.fieldConfigs.filter(fc => fc.fieldType === 'custom');
  
  // Get available fields for dropdown
  const getAvailableFields = () => {
    if (fieldForm.fieldType === 'core') {
      return CORE_EBAY_FIELDS;
    } else {
      return customColumns.map(col => ({
        value: col.name,
        label: col.displayName
      }));
    }
  };
  
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <FormControlLabel
          control={
            <Switch 
              checked={config.enabled}
              onChange={(e) => handleToggleEnabled(e.target.checked)}
            />
          }
          label={<Typography variant="subtitle1">Enable ASIN Automation</Typography>}
        />
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
        </Stack>
      </Stack>
      
      {!isOverridden && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You're viewing the base template configuration. Make changes to create your customization.
        </Alert>
      )}
      
      {isOverridden && (
        <Alert severity="success" sx={{ mb: 2 }}>
          You have customized ASIN automation settings
        </Alert>
      )}
      
      {!config.enabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          ASIN Automation is disabled. Enable it to auto-populate fields when entering ASINs.
        </Alert>
      )}
      
      {/* Core Fields Section */}
      {coreFieldConfigs.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>
            Core Fields ({coreFieldConfigs.length})
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {coreFieldConfigs.map((fc, index) => {
              const actualIndex = config.fieldConfigs.findIndex(c => c === fc);
              return (
                <Grid item xs={12} sm={6} key={actualIndex}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body1" fontWeight="bold">
                            {fc.ebayField}
                          </Typography>
                          <Chip 
                            icon={fc.source === 'ai' ? <AiIcon /> : <DirectIcon />}
                            label={fc.source === 'ai' ? 'AI' : 'Direct'}
                            size="small"
                            color={fc.source === 'ai' ? 'primary' : 'success'}
                          />
                        </Stack>
                        <Switch
                          size="small"
                          checked={fc.enabled}
                          onChange={(e) => handleToggleFieldEnabled(actualIndex, e.target.checked)}
                        />
                      </Stack>
                      
                      {fc.source === 'ai' ? (
                        <Typography variant="caption" color="text.secondary" sx={{ 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {fc.promptTemplate}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Maps from: {fc.amazonField} → {fc.transform !== 'none' ? `Transform: ${fc.transform}` : 'No transform'}
                        </Typography>
                      )}
                      
                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={() => handleEditFieldConfig(actualIndex)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteFieldConfig(actualIndex)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
      
      {/* Custom Fields Section */}
      {customFieldConfigs.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>
            Custom Fields ({customFieldConfigs.length})
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {customFieldConfigs.map((fc, index) => {
              const actualIndex = config.fieldConfigs.findIndex(c => c === fc);
              return (
                <Grid item xs={12} sm={6} key={actualIndex}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body1" fontWeight="bold">
                            {fc.ebayField}
                          </Typography>
                          <Chip 
                            icon={fc.source === 'ai' ? <AiIcon /> : <DirectIcon />}
                            label={fc.source === 'ai' ? 'AI' : 'Direct'}
                            size="small"
                            color={fc.source === 'ai' ? 'primary' : 'success'}
                          />
                        </Stack>
                        <Switch
                          size="small"
                          checked={fc.enabled}
                          onChange={(e) => handleToggleFieldEnabled(actualIndex, e.target.checked)}
                        />
                      </Stack>
                      
                      {fc.source === 'ai' ? (
                        <Typography variant="caption" color="text.secondary" sx={{ 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {fc.promptTemplate}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Maps from: {fc.amazonField} → {fc.transform !== 'none' ? `Transform: ${fc.transform}` : 'No transform'}
                        </Typography>
                      )}
                      
                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={() => handleEditFieldConfig(actualIndex)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteFieldConfig(actualIndex)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
      
      {config.fieldConfigs.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50', mb: 2 }}>
          <Typography color="text.secondary">
            No field configurations defined. Click "Add Field Configuration" to create one.
          </Typography>
        </Paper>
      )}
      
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={handleAddFieldConfig}
        fullWidth
        sx={{ mb: 2 }}
      >
        Add Field Configuration
      </Button>
      
      {hasChanges && (
        <Button
          fullWidth
          variant="contained"
          onClick={handleSave}
        >
          Save ASIN Automation Configuration
        </Button>
      )}
      
      {/* Add/Edit Field Config Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingIndex !== null ? 'Edit Field Configuration' : 'Add Field Configuration'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Field Type Selection */}
            <FormControl fullWidth>
              <FormLabel>Field Type</FormLabel>
              <RadioGroup
                row
                value={fieldForm.fieldType}
                onChange={(e) => setFieldForm({ ...fieldForm, fieldType: e.target.value, ebayField: '' })}
              >
                <FormControlLabel value="core" control={<Radio />} label="Core eBay Field" />
                <FormControlLabel value="custom" control={<Radio />} label="Custom Column" />
              </RadioGroup>
            </FormControl>
            
            {/* Field Selection */}
            <FormControl fullWidth>
              <InputLabel>Select Field</InputLabel>
              <Select
                value={fieldForm.ebayField}
                label="Select Field"
                onChange={(e) => setFieldForm({ ...fieldForm, ebayField: e.target.value })}
              >
                {getAvailableFields().map(field => (
                  <MenuItem key={field.value} value={field.value}>
                    {field.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {/* Source Selection */}
            <FormControl fullWidth>
              <FormLabel>Data Source</FormLabel>
              <RadioGroup
                row
                value={fieldForm.source}
                onChange={(e) => setFieldForm({ ...fieldForm, source: e.target.value })}
              >
                <FormControlLabel value="ai" control={<Radio />} label="AI Generation" />
                <FormControlLabel value="direct" control={<Radio />} label="Direct Mapping" />
              </RadioGroup>
            </FormControl>
            
            <Divider />
            
            {/* AI Prompt Template */}
            {fieldForm.source === 'ai' && (
              <>
                <TextField
                  label="AI Prompt Template"
                  required
                  fullWidth
                  multiline
                  rows={4}
                  value={fieldForm.promptTemplate}
                  onChange={(e) => setFieldForm({ ...fieldForm, promptTemplate: e.target.value })}
                  placeholder="Enter prompt template with placeholders"
                  helperText="Use placeholders: {title}, {brand}, {description}, {price}, {asin}"
                />
                
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                    Quick Insert Placeholders:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {['{title}', '{brand}', '{description}', '{price}', '{asin}'].map(ph => (
                      <Chip
                        key={ph}
                        label={ph}
                        size="small"
                        onClick={() => handleInsertPlaceholder(ph)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Stack>
                  
                  {PROMPT_EXAMPLES[fieldForm.ebayField] && (
                    <>
                      <Typography variant="caption" fontWeight="bold" display="block" sx={{ mt: 1 }}>
                        Example for {fieldForm.ebayField}:
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                        {PROMPT_EXAMPLES[fieldForm.ebayField]}
                      </Typography>
                      <Button 
                        size="small" 
                        onClick={() => handleUseExample(PROMPT_EXAMPLES[fieldForm.ebayField])}
                      >
                        Use This Example
                      </Button>
                    </>
                  )}
                </Paper>
              </>
            )}
            
            {/* Direct Mapping */}
            {fieldForm.source === 'direct' && (
              <>
                <FormControl fullWidth>
                  <InputLabel>Amazon Field</InputLabel>
                  <Select
                    value={fieldForm.amazonField}
                    label="Amazon Field"
                    onChange={(e) => setFieldForm({ ...fieldForm, amazonField: e.target.value })}
                  >
                    {AMAZON_FIELDS.map(field => (
                      <MenuItem key={field.value} value={field.value}>
                        {field.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <FormControl fullWidth>
                  <InputLabel>Transform</InputLabel>
                  <Select
                    value={fieldForm.transform}
                    label="Transform"
                    onChange={(e) => setFieldForm({ ...fieldForm, transform: e.target.value })}
                  >
                    {TRANSFORM_OPTIONS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}
            
            <TextField
              label="Default Value (Optional)"
              fullWidth
              value={fieldForm.defaultValue}
              onChange={(e) => setFieldForm({ ...fieldForm, defaultValue: e.target.value })}
              placeholder="Fallback value if auto-fill fails"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={fieldForm.enabled}
                  onChange={(e) => setFieldForm({ ...fieldForm, enabled: e.target.checked })}
                />
              }
              label="Enabled"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveFieldConfig} variant="contained">
            {editingIndex !== null ? 'Update' : 'Add'} Configuration
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
