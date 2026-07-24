import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ViewAgendaRoundedIcon from '@mui/icons-material/ViewAgendaRounded';
import FormatListBulletedRoundedIcon from '@mui/icons-material/FormatListBulletedRounded';
import api from '../../lib/api.js';
import SectionCard from '../../components/SectionCard.jsx';
import { BRAND_DARK, BRAND_DARK_ALT, BRAND_YELLOW } from '../../constants/brandTheme.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
} from '../../theme/tableStyles.js';

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#fff',
  },
};

export default function ManageRangesPage() {
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data } = await api.get('/ranges');
    setItems(data);
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/ranges', { name });
    setName('');
    await load();
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <SectionCard
        emphasized
        sx={{
          mb: 3,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 55%, #31577d 100%)`,
          border: `1px solid ${alpha(BRAND_YELLOW, 0.18)}`,
          color: '#fffdf0',
          position: 'relative',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Box sx={{ position: 'absolute', top: -92, right: -74, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` }} />
          <Box sx={{ position: 'absolute', bottom: -88, left: '24%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%)' }} />
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          justifyContent="space-between"
          sx={{ position: 'relative', p: { xs: 3, md: 4 } }}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              label="Catalog Setup"
              size="small"
              sx={{
                mb: 1.5,
                bgcolor: alpha(BRAND_YELLOW, 0.14),
                color: BRAND_YELLOW,
                border: `1px solid ${alpha(BRAND_YELLOW, 0.24)}`,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            />
            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.1, mb: 1 }}>
              Manage Ranges
            </Typography>
            <Typography sx={{ color: 'rgba(255, 253, 240, 0.76)', maxWidth: 640 }}>
              Create and review range entries using the newer admin dashboard styling while keeping the current range management workflow intact.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.25}>
            <Chip label={`${items.length} Ranges`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={name ? 'Ready to add' : 'New range idle'} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
          </Stack>
        </Stack>
      </SectionCard>

      <Stack spacing={3}>
        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              mb: 2.5,
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              border: `1px solid ${alpha('#f59e0b', 0.18)}`,
              background: `linear-gradient(135deg, ${alpha('#f59e0b', 0.12)} 0%, ${alpha('#2563eb', 0.04)} 100%)`,
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f59e0b 0%, #2563eb 100%)', color: '#fff' }}>
                  <ViewAgendaRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    Add Range
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    Create a new range entry and refresh the current list automatically.
                  </Typography>
                </Box>
              </Stack>
              <Chip label={name || 'Awaiting input'} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(name ? '#f59e0b' : BRAND_DARK, 0.12), color: name ? '#b45309' : BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha(name ? '#f59e0b' : BRAND_DARK, 0.18)}`, maxWidth: 220 }} />
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} component="form" onSubmit={add}>
            <TextField label="Range Name" value={name} onChange={(e) => setName(e.target.value)} required sx={{ flex: 1, ...inputSx }} />
            <Button type="submit" variant="contained" sx={yellowFilledButtonSx}>Add Range</Button>
          </Stack>
        </SectionCard>

        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              mb: 2.5,
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              border: `1px solid ${alpha('#0f172a', 0.08)}`,
              background: 'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(245,158,11,0.04) 100%)',
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #31577d 100%)`, color: '#fff' }}>
                  <FormatListBulletedRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    Existing Ranges
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    Review all current ranges in the catalog setup list.
                  </Typography>
                </Box>
              </Stack>
              <Chip label={`${items.length} visible`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(BRAND_DARK, 0.06), color: BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }} />
            </Stack>
          </Box>

          <TableContainer sx={tableContainerSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>Name</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length > 0 ? items.map((range) => (
                  <TableRow key={range._id} sx={tableBodyRowSx}>
                    <TableCell sx={tableBodyCellSx}>{range.name}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow sx={tableBodyRowSx}>
                    <TableCell sx={{ ...tableBodyCellSx, py: 3, color: alpha(BRAND_DARK, 0.62) }}>
                      No ranges added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      </Stack>
    </Box>
  );
}
