import { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  IconButton,
  Stack,
  Radio,
  RadioGroup,
  FormControlLabel,
  Alert,
  Divider,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

export default function ProfitTiersSection({ pricingConfig, onChange }) {
  const [mode, setMode] = useState(pricingConfig?.profitTiers?.enabled ? 'tiered' : 'fixed');
  const [tiers, setTiers] = useState(
    pricingConfig?.profitTiers?.tiers?.length > 0 
      ? pricingConfig.profitTiers.tiers 
      : [
          { minCost: 0, maxCost: 9, profit: 300 },
          { minCost: 9, maxCost: null, profit: 500 }
        ]
  );
  const [validationError, setValidationError] = useState('');

  // Update parent when mode or tiers change
  useEffect(() => {
    if (mode === 'tiered') {
      onChange({
        ...pricingConfig,
        profitTiers: {
          enabled: true,
          tiers: tiers
        }
      });
    } else {
      onChange({
        ...pricingConfig,
        profitTiers: {
          enabled: false,
          tiers: []
        }
      });
    }
  }, [mode, tiers]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setValidationError('');
  };

  const handleTierChange = (index, field, value) => {
    const newTiers = [...tiers];
    
    if (field === 'minCost' || field === 'maxCost') {
      newTiers[index][field] = value === '' ? null : parseFloat(value);
      
      // Cascade update: When maxCost changes, update next tier's minCost
      if (field === 'maxCost' && index < newTiers.length - 1) {
        const nextTier = newTiers[index + 1];
        if (nextTier && value !== '' && value !== null) {
          nextTier.minCost = parseFloat(value);
        }
      }
      
      // Cascade update: When minCost changes, update previous tier's maxCost
      if (field === 'minCost' && index > 0) {
        const prevTier = newTiers[index - 1];
        if (prevTier && value !== '' && value !== null) {
          prevTier.maxCost = parseFloat(value);
        }
      }
    } else if (field === 'profit') {
      newTiers[index][field] = value === '' ? 0 : parseFloat(value);
    }
    
    setTiers(newTiers);
    validateTiers(newTiers);
  };

  const handleAddTier = () => {
    const lastTier = tiers[tiers.length - 1];
    
    // Validate that last tier has a valid maxCost before adding new tier
    if (lastTier.maxCost === null || lastTier.maxCost === undefined) {
      setValidationError('Please set a Max Cost for the last tier before adding a new one');
      return;
    }
    
    const newMinCost = lastTier.maxCost;
    
    const newTiers = [...tiers];
    
    // Add new tier (no need to update last tier's maxCost, it's already set)
    newTiers.push({
      minCost: newMinCost,
      maxCost: null,
      profit: lastTier.profit
    });
    
    setTiers(newTiers);
    validateTiers(newTiers);
  };

  const handleRemoveTier = (index) => {
    if (tiers.length <= 1) {
      setValidationError('At least one tier is required');
      return;
    }
    
    const newTiers = tiers.filter((_, i) => i !== index);
    
    // Make sure last tier has maxCost = null
    if (newTiers.length > 0) {
      newTiers[newTiers.length - 1].maxCost = null;
    }
    
    setTiers(newTiers);
    validateTiers(newTiers);
  };

  const validateTiers = (tiersToValidate) => {
    setValidationError('');
    
    if (!tiersToValidate || tiersToValidate.length === 0) {
      setValidationError('At least one tier is required');
      return false;
    }
    
    for (let i = 0; i < tiersToValidate.length; i++) {
      const tier = tiersToValidate[i];
      
      if (tier.minCost === null || tier.minCost < 0) {
        setValidationError(`Tier ${i + 1}: Min cost must be >= 0`);
        return false;
      }
      
      if (tier.profit === null || tier.profit <= 0) {
        setValidationError(`Tier ${i + 1}: Profit must be > 0`);
        return false;
      }
      
      if (tier.maxCost !== null && tier.maxCost <= tier.minCost) {
        setValidationError(`Tier ${i + 1}: Max cost must be greater than min cost`);
        return false;
      }
      
      if (i < tiersToValidate.length - 1) {
        const nextTier = tiersToValidate[i + 1];
        
        if (tier.maxCost === null) {
          setValidationError(`Tier ${i + 1}: Only last tier can have unlimited max cost`);
          return false;
        }
        
        if (tier.maxCost !== nextTier.minCost) {
          setValidationError(`Tier ${i + 1} → ${i + 2}: Max cost ($${tier.maxCost}) must equal next tier's min cost ($${nextTier.minCost}). Tiers must be continuous.`);
          return false;
        }
      }
    }
    
    return true;
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        💰 Profit Configuration
      </Typography>

      <RadioGroup value={mode} onChange={(e) => handleModeChange(e.target.value)} sx={{ mb: 2 }}>
        <FormControlLabel value="fixed" control={<Radio />} label="Fixed Profit (same for all products)" />
        <FormControlLabel value="tiered" control={<Radio />} label="Tiered Profit (varies by product cost)" />
      </RadioGroup>

      {mode === 'fixed' && (
        <TextField
          label="Desired Profit (INR)"
          type="number"
          value={pricingConfig?.desiredProfit || ''}
          onChange={(e) => onChange({
            ...pricingConfig,
            desiredProfit: e.target.value === '' ? null : parseFloat(e.target.value)
          })}
          helperText="Fixed profit for all products regardless of cost"
          fullWidth
          inputProps={{ step: 1, min: 0 }}
        />
      )}

      {mode === 'tiered' && (
        <Box>
          {validationError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {validationError}
            </Alert>
          )}

          <Stack spacing={2} sx={{ mb: 2 }}>
            {tiers.map((tier, index) => (
              <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Tier {index + 1}
                  </Typography>
                  {tiers.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveTier(index)}
                      color="error"
                      title="Remove tier"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Min Cost (USD)"
                      type="number"
                      value={tier.minCost ?? ''}
                      onChange={(e) => handleTierChange(index, 'minCost', e.target.value)}
                      fullWidth
                      size="small"
                      inputProps={{ step: 0.01, min: 0 }}
                      helperText={index > 0 ? "Auto-syncs with previous tier's max" : undefined}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Max Cost (USD)"
                      type="number"
                      value={tier.maxCost ?? ''}
                      onChange={(e) => handleTierChange(index, 'maxCost', e.target.value)}
                      fullWidth
                      size="small"
                      inputProps={{ step: 0.01, min: tier.minCost }}
                      placeholder={index === tiers.length - 1 ? 'Leave empty for unlimited' : ''}
                      helperText={
                        index === tiers.length - 1 
                          ? "Set a value to add more tiers, or leave empty for unlimited" 
                          : "Auto-syncs with next tier's min"
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Profit (INR)"
                      type="number"
                      value={tier.profit ?? ''}
                      onChange={(e) => handleTierChange(index, 'profit', e.target.value)}
                      fullWidth
                      size="small"
                      inputProps={{ step: 1, min: 0 }}
                    />
                  </Grid>
                </Grid>

                <Box sx={{ mt: 1 }}>
                  <Chip
                    label={`$${tier.minCost} - ${tier.maxCost !== null ? `$${tier.maxCost}` : '∞'} → ${tier.profit} INR`}
                    size="small"
                    variant="outlined"
                    color="primary"
                  />
                </Box>
              </Paper>
            ))}
          </Stack>

          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddTier}
            fullWidth
          >
            Add Tier
          </Button>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2" component="div">
              <strong>How it works:</strong>
              <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                <li>Each tier applies to products within a specific cost range</li>
                <li>Ranges must be continuous with no gaps</li>
                <li>Last tier automatically covers all products above its min cost</li>
                <li>Example: A $5 product uses Tier 1 profit, a $15 product uses Tier 2 profit</li>
              </Box>
            </Typography>
          </Alert>
        </Box>
      )}
    </Paper>
  );
}
