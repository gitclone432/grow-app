import { TableContainer } from '@mui/material';

export const MARKETING_TABLE_CONTAINER_SX = {
  maxHeight: { xs: '55vh', sm: 'min(68vh, 720px)' },
  overflow: 'auto',
  '& .MuiTableCell-stickyHeader': {
    bgcolor: 'background.paper',
  },
};

export default function MarketingScrollableTableContainer({ children, sx, ...props }) {
  return (
    <TableContainer
      sx={{
        ...MARKETING_TABLE_CONTAINER_SX,
        ...sx,
      }}
      {...props}
    >
      {children}
    </TableContainer>
  );
}
