import { useState } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export default function MarketingCollapsibleFilters({
  children,
  defaultOpen = false,
  title = 'Filters',
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: 'grey.50' },
        }}
      >
        <FilterListIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {title}
        </Typography>
        <IconButton
          size="small"
          aria-label={open ? 'Hide filters' : 'Show filters'}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          sx={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ px: 2, pb: 2, pt: 0 }}>
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}
