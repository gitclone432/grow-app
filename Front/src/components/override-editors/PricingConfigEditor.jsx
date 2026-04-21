import { Box, Typography, Alert, Button } from '@mui/material';
import { Restore as RestoreIcon } from '@mui/icons-material';

export default function PricingConfigEditor({ 
  baseConfig, 
  overrideConfig, 
  isOverridden,
  onSave,
  onReset
}) {
  return (
    <Box>
      {isOverridden && (
        <Alert severity="success" sx={{ mb: 2 }} action={
          <Button size="small" onClick={onReset} startIcon={<RestoreIcon />}>
            Reset
          </Button>
        }>
          You have customized pricing configuration
        </Alert>
      )}
      
      <Alert severity="info">
        Pricing Config customization UI is coming soon. For now, you can use the base template settings or seller-specific pricing configs.
      </Alert>
      
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Base Config: {baseConfig?.enabled ? 'Enabled' : 'Disabled'}
        {baseConfig?.desiredProfit && ` • Desired profit: ${baseConfig.desiredProfit} INR`}
      </Typography>
    </Box>
  );
}
