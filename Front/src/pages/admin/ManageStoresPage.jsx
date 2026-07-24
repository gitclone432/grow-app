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
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
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

export default function ManageStoresPage() {
  const [listingPlatforms, setListingPlatforms] = useState([]);
  const [platformId, setPlatformId] = useState('');
  const [name, setName] = useState('');
  const [stores, setStores] = useState([]);

  useEffect(() => {
    api.get('/platforms', { params: { type: 'listing' } }).then(({ data }) => setListingPlatforms(data));
  }, []);

  useEffect(() => {
    if (platformId) {
      api.get('/stores', { params: { platformId } }).then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [platformId]);

  const add = async (e) => {
    e.preventDefault();
    if (!platformId) return;
    await api.post('/stores', { name, platformId });
    setName('');
    const { data } = await api.get('/stores', { params: { platformId } });
    setStores(data);
  };

  const selectedPlatform = listingPlatforms.find((platform) => platform._id === platformId);

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
          <Box sx={{ position: 'absolute', bottom: -88, left: '24%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)' }} />
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          justifyContent="space-between"
          sx={{ position: 'relative', p: { xs: 3, md: 4 } }}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              label="Store Setup"
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
              Manage Stores
            </Typography>
            <Typography sx={{ color: 'rgba(255, 253, 240, 0.76)', maxWidth: 640 }}>
              Add and review stores for each listing platform using the newer admin dashboard styling and clearer platform context.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.25}>
            <Chip label={`${listingPlatforms.length} Platforms`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${stores.length} Stores`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={selectedPlatform?.name || 'No platform selected'} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700, maxWidth: 220 }} />
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
              border: `1px solid ${alpha('#10b981', 0.18)}`,
              background: `linear-gradient(135deg, ${alpha('#10b981', 0.12)} 0%, ${alpha('#2563eb', 0.04)} 100%)`,
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)', color: '#fff' }}>
                  <StorefrontRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    Add Store
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    Select a listing platform first, then attach the new store to that platform.
                  </Typography>
                </Box>
              </Stack>
              <Chip label={selectedPlatform ? `${selectedPlatform.name} selected` : 'Select a platform'} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(selectedPlatform ? '#10b981' : BRAND_DARK, 0.12), color: selectedPlatform ? '#10b981' : BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha(selectedPlatform ? '#10b981' : BRAND_DARK, 0.18)}` }} />
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} component="form" onSubmit={add}>
            <FormControl sx={{ minWidth: 240, ...inputSx }}>
              <InputLabel>Listing Platform</InputLabel>
              <Select label="Listing Platform" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                {listingPlatforms.map((platform) => (<MenuItem key={platform._id} value={platform._id}>{platform.name}</MenuItem>))}
              </Select>
            </FormControl>
            <TextField label="Store Name" value={name} onChange={(e) => setName(e.target.value)} required sx={{ flex: 1, ...inputSx }} />
            <Button type="submit" variant="contained" disabled={!platformId} sx={yellowFilledButtonSx}>Add Store</Button>
          </Stack>
        </SectionCard>

        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              mb: 2.5,
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              border: `1px solid ${alpha('#0f172a', 0.08)}`,
              background: 'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(16,185,129,0.04) 100%)',
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #31577d 100%)`, color: '#fff' }}>
                  <Inventory2RoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    Existing Stores
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    Review the stores assigned to the currently selected listing platform.
                  </Typography>
                </Box>
              </Stack>
              <Chip label={`${stores.length} visible`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(BRAND_DARK, 0.06), color: BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha(BRAND_DARK, 0.1)}` }} />
            </Stack>
          </Box>

          <TableContainer sx={tableContainerSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>Store</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Platform</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stores.length > 0 ? stores.map((store) => (
                  <TableRow key={store._id} sx={tableBodyRowSx}>
                    <TableCell sx={tableBodyCellSx}>{store.name}</TableCell>
                    <TableCell sx={tableBodyCellSx}>{store.platform?.name}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow sx={tableBodyRowSx}>
                    <TableCell colSpan={2} sx={{ ...tableBodyCellSx, py: 3, color: alpha(BRAND_DARK, 0.62) }}>
                      {platformId ? 'No stores found for the selected platform.' : 'Select a listing platform to view stores.'}
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


