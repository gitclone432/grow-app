import { forwardRef } from 'react';
import { Box, useTheme } from '@mui/material';

const AdminPageShell = forwardRef(function AdminPageShell({ children, sx }, ref) {
  const theme = useTheme();

  return (
    <Box
      ref={ref}
      sx={{
        px: { xs: 2, md: 3 },
        pb: 4,
        backgroundColor: theme.palette.background.paper,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
});

export default AdminPageShell;
