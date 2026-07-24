import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
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

const platformTypeStyles = {
  source: {
    label: 'Source',
    color: '#2563eb',
    background: alpha('#2563eb', 0.12),
    border: alpha('#2563eb', 0.2),
  },
  listing: {
    label: 'Listing',
    color: '#10b981',
    background: alpha('#10b981', 0.12),
    border: alpha('#10b981', 0.2),
  },
};

export default function ManagePlatformsPage() {
  const [name, setName] = useState('');
  const [type, setType] = useState('source');
  const [items, setItems] = useState([]);

  const load = async () => {
    const [{ data: sources }, { data: listings }] = await Promise.all([
      api.get('/platforms', { params: { type: 'source' } }),
      api.get('/platforms', { params: { type: 'listing' } })
    ]);
    setItems([...sources, ...listings]);
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/platforms', { name, type });
    setName('');
    setType('source');
    await load();
  };

  const sourceCount = items.filter((item) => item.type === 'source').length;
  const listingCount = items.filter((item) => item.type === 'listing').length;

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
          <Box sx={{ position: 'absolute', bottom: -88, left: '22%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, transparent 70%)' }} />
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          justifyContent="space-between"
          sx={{ position: 'relative', p: { xs: 3, md: 4 } }}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              label="Channel Setup"
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
              Manage Platforms
            </Typography>
            <Typography sx={{ color: 'rgba(255, 253, 240, 0.76)', maxWidth: 640 }}>
              Maintain source and listing platforms with the newer admin dashboard styling and clearer type separation.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.25}>
            <Chip label={`${items.length} Total`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${sourceCount} Sources`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${listingCount} Listings`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
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
              border: `1px solid ${alpha('#2563eb', 0.18)}`,
              background: `linear-gradient(135deg, ${alpha('#2563eb', 0.12)} 0%, ${alpha('#10b981', 0.04)} 100%)`,
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2563eb 0%, #10b981 100%)', color: '#fff' }}>
                  <LanguageRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    Add Platform
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    Create new source or listing endpoints for the product workflow.
                  </Typography>
                </Box>
              </Stack>
              <Chip label={`${type === 'source' ? 'Source' : 'Listing'} selected`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(type === 'source' ? '#2563eb' : '#10b981', 0.12), color: type === 'source' ? '#2563eb' : '#10b981', fontWeight: 700, border: `1px solid ${alpha(type === 'source' ? '#2563eb' : '#10b981', 0.18)}` }} />
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} component="form" onSubmit={add}>
            <TextField
              label="Platform Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              sx={{ flex: 1, ...inputSx }}
            />
            <FormControl sx={{ minWidth: 220, ...inputSx }}>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
                <MenuItem value="source">Source</MenuItem>
                <MenuItem value="listing">Listing</MenuItem>
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" sx={yellowFilledButtonSx}>
              Add Platform
            </Button>
          </Stack>
        </SectionCard>

        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              mb: 2.5,
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              border: `1px solid ${alpha('#0f172a', 0.08)}`,
              background: 'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)',
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #31577d 100%)`, color: '#fff' }}>
                  <CompareArrowsRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    Existing Platforms
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    Review all configured platforms grouped by their workflow role.
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
                  <TableCell sx={tableHeaderCellSx}>Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length > 0 ? items.map((platform) => {
                  const typeStyle = platformTypeStyles[platform.type] || {
                    label: platform.type,
                    color: BRAND_DARK,
                    background: alpha(BRAND_DARK, 0.08),
                    border: alpha(BRAND_DARK, 0.14),
                  };

                  return (
                    <TableRow key={platform._id} sx={tableBodyRowSx}>
                      <TableCell sx={tableBodyCellSx}>{platform.name}</TableCell>
                      <TableCell sx={tableBodyCellSx}>
                        <Chip
                          label={typeStyle.label}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            color: typeStyle.color,
                            bgcolor: typeStyle.background,
                            border: `1px solid ${typeStyle.border}`,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow sx={tableBodyRowSx}>
                    <TableCell colSpan={2} sx={{ ...tableBodyCellSx, py: 3, color: alpha(BRAND_DARK, 0.62) }}>
                      No platforms added yet.
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


