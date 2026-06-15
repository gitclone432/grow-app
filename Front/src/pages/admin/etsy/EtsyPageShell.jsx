import { Box, Paper, Typography } from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';

export default function EtsyPageShell({ title, description }) {
  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 4, maxWidth: 720 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <StorefrontIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>
        </Box>
        <Typography color="text.secondary">
          {description}
        </Typography>
      </Paper>
    </Box>
  );
}
