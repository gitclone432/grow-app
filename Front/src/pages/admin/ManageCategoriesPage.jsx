import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SegmentRoundedIcon from '@mui/icons-material/SegmentRounded';
import ViewAgendaRoundedIcon from '@mui/icons-material/ViewAgendaRounded';
import api from '../../lib/api.js';
import SectionCard from '../../components/SectionCard.jsx';
import { BRAND_DARK, BRAND_DARK_ALT, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import {
  tableBodyCellSx,
  tableBodyRowSx,
  tableContainerSx,
  tableHeaderCellSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';

const sectionConfigs = {
  categories: {
    title: 'Categories',
    subtitle: 'Core catalog groups used across subcategories and ranges.',
    accent: '#2563eb',
    icon: CategoryOutlinedIcon,
    createLabel: 'Category Name',
    searchLabel: 'Search Category',
    buttonLabel: 'Add Category',
    emptyMessage: 'No categories match the current search.',
  },
  subcategories: {
    title: 'Subcategories',
    subtitle: 'Organize products inside each category with faster lookup.',
    accent: '#10b981',
    icon: SegmentRoundedIcon,
    createLabel: 'Subcategory Name',
    searchLabel: 'Search Subcategory',
    buttonLabel: 'Add Subcategory',
    emptyMessage: 'Choose a category or adjust the search to see subcategories.',
  },
  ranges: {
    title: 'Ranges',
    subtitle: 'Keep range options aligned with the active category structure.',
    accent: '#f59e0b',
    icon: ViewAgendaRoundedIcon,
    createLabel: 'Range Name',
    searchLabel: 'Search Range',
    buttonLabel: 'Add Range',
    emptyMessage: 'Choose a category or adjust the search to see ranges.',
  },
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#fff',
  },
};

function buildSectionHeaderSx(accent) {
  return {
    mb: 2.5,
    p: { xs: 2, md: 2.5 },
    borderRadius: 3,
    border: `1px solid ${alpha(accent, 0.18)}`,
    background: `linear-gradient(135deg, ${alpha(accent, 0.12)} 0%, ${alpha(accent, 0.04)} 100%)`,
  };
}

function getHighlightRowSx(searchValue) {
  return searchValue
    ? {
      '& td': {
        backgroundColor: `${alpha(BRAND_YELLOW, 0.16)} !important`,
      },
    }
    : undefined;
}

export default function ManageCategoriesPage() {
  // Categories
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  // Subcategories
  const [subcategories, setSubcategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [subcategoryName, setSubcategoryName] = useState('');
  const [subcategorySearch, setSubcategorySearch] = useState('');

  // Ranges
  const [ranges, setRanges] = useState([]);
  const [selectedCategoryForRange, setSelectedCategoryForRange] = useState('');
  const [rangeName, setRangeName] = useState('');
  const [rangeSearch, setRangeSearch] = useState('');

  // Load categories
  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data));
  }, []);

  // Load subcategories when category is selected
  useEffect(() => {
    if (selectedCategoryId) {
      api.get('/subcategories', { params: { categoryId: selectedCategoryId } })
        .then(({ data }) => setSubcategories(data));
    } else {
      setSubcategories([]);
    }
  }, [selectedCategoryId]);

  // Load ranges when category is selected for ranges section
  useEffect(() => {
    if (selectedCategoryForRange) {
      api.get('/ranges', { params: { categoryId: selectedCategoryForRange } })
        .then(({ data }) => setRanges(data));
    } else {
      setRanges([]);
    }
  }, [selectedCategoryForRange]);

  const addCategory = async (e) => {
    e.preventDefault();
    await api.post('/categories', { name: categoryName });
    setCategoryName('');
    const { data } = await api.get('/categories');
    setCategories(data);
  };

  const addSubcategory = async (e) => {
    e.preventDefault();
    if (!selectedCategoryId) return;
    await api.post('/subcategories', { name: subcategoryName, categoryId: selectedCategoryId });
    setSubcategoryName('');
    const { data } = await api.get('/subcategories', { params: { categoryId: selectedCategoryId } });
    setSubcategories(data);
  };

  const addRange = async (e) => {
    e.preventDefault();
    if (!selectedCategoryForRange) return;
    await api.post('/ranges', { name: rangeName, categoryId: selectedCategoryForRange });
    setRangeName('');
    const { data } = await api.get('/ranges', { params: { categoryId: selectedCategoryForRange } });
    setRanges(data);
  };

  const filteredCategories = categories.filter((category) => (
    !categorySearch || category.name.toLowerCase().includes(categorySearch.toLowerCase())
  ));

  const filteredSubcategories = subcategories.filter((subcategory) => (
    !subcategorySearch || subcategory.name.toLowerCase().includes(subcategorySearch.toLowerCase())
  ));

  const filteredRanges = ranges.filter((range) => (
    !rangeSearch || range.name.toLowerCase().includes(rangeSearch.toLowerCase())
  ));

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <SectionCard
        emphasized
        sx={{
          mb: 3,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 55%, #314b74 100%)`,
          border: `1px solid ${alpha(BRAND_YELLOW, 0.18)}`,
          color: '#fffdf0',
          position: 'relative',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Box sx={{ position: 'absolute', top: -96, right: -72, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` }} />
          <Box sx={{ position: 'absolute', bottom: -88, left: '28%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)' }} />
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          justifyContent="space-between"
          sx={{ position: 'relative', p: { xs: 3, md: 4 } }}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              label="Catalog Controls"
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
              Manage Categories, Subcategories & Ranges
            </Typography>
            <Typography sx={{ color: 'rgba(255, 253, 240, 0.76)', maxWidth: 640 }}>
              Maintain the full catalog hierarchy from one place with the updated admin dashboard styling and faster visual scanning.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'row', sm: 'row', md: 'column' }} spacing={1.25}>
            <Chip label={`${categories.length} Categories`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${subcategories.length} Subcategories`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
            <Chip label={`${ranges.length} Ranges`} sx={{ bgcolor: alpha('#fff', 0.08), color: '#fffdf0', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
          </Stack>
        </Stack>
      </SectionCard>

      <Stack spacing={3}>
        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={buildSectionHeaderSx(sectionConfigs.categories.accent)}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${sectionConfigs.categories.accent} 0%, ${alpha(sectionConfigs.categories.accent, 0.72)} 100%)`, color: '#fff' }}>
                  <CategoryOutlinedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    {sectionConfigs.categories.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    {sectionConfigs.categories.subtitle}
                  </Typography>
                </Box>
              </Stack>
              <Chip label={`${filteredCategories.length} visible`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(sectionConfigs.categories.accent, 0.1), color: sectionConfigs.categories.accent, fontWeight: 700, border: `1px solid ${alpha(sectionConfigs.categories.accent, 0.18)}` }} />
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} component="form" onSubmit={addCategory} sx={{ mb: 1.5 }}>
            <TextField
              label={sectionConfigs.categories.createLabel}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
              sx={{ flex: 1, ...inputSx }}
            />
            <Button type="submit" variant="contained" sx={yellowFilledButtonSx}>
              {sectionConfigs.categories.buttonLabel}
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
            <TextField
              label={sectionConfigs.categories.searchLabel}
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              sx={{ flex: 1, ...inputSx }}
            />
            <Button variant="outlined" startIcon={<SearchRoundedIcon />} sx={yellowOutlinedButtonSx}>
              Search
            </Button>
          </Stack>

          <TableContainer sx={tableContainerSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>Category</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCategories.length > 0 ? filteredCategories.map((category) => (
                  <TableRow
                    key={category._id}
                    sx={{
                      ...tableBodyRowSx,
                      ...getHighlightRowSx(
                        categorySearch && category.name.toLowerCase() === categorySearch.toLowerCase(),
                      ),
                    }}
                  >
                    <TableCell sx={tableBodyCellSx}>{category.name}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow sx={tableBodyRowSx}>
                    <TableCell sx={{ ...tableBodyCellSx, py: 3, color: alpha(BRAND_DARK, 0.62) }}>
                      {sectionConfigs.categories.emptyMessage}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>

        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={buildSectionHeaderSx(sectionConfigs.subcategories.accent)}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${sectionConfigs.subcategories.accent} 0%, ${alpha(sectionConfigs.subcategories.accent, 0.72)} 100%)`, color: '#fff' }}>
                  <SegmentRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    {sectionConfigs.subcategories.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    {sectionConfigs.subcategories.subtitle}
                  </Typography>
                </Box>
              </Stack>
              <Chip label={`${filteredSubcategories.length} visible`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(sectionConfigs.subcategories.accent, 0.1), color: sectionConfigs.subcategories.accent, fontWeight: 700, border: `1px solid ${alpha(sectionConfigs.subcategories.accent, 0.18)}` }} />
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} component="form" onSubmit={addSubcategory} sx={{ mb: 1.5 }}>
            <FormControl sx={{ minWidth: 240, ...inputSx }}>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                required
              >
                {categories.map((category) => (
                  <MenuItem key={category._id} value={category._id}>{category.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={sectionConfigs.subcategories.createLabel}
              value={subcategoryName}
              onChange={(e) => setSubcategoryName(e.target.value)}
              required
              sx={{ flex: 1, ...inputSx }}
            />
            <Button type="submit" variant="contained" disabled={!selectedCategoryId} sx={yellowFilledButtonSx}>
              {sectionConfigs.subcategories.buttonLabel}
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
            <TextField
              label={sectionConfigs.subcategories.searchLabel}
              value={subcategorySearch}
              onChange={(e) => setSubcategorySearch(e.target.value)}
              sx={{ flex: 1, ...inputSx }}
            />
            <Button variant="outlined" startIcon={<SearchRoundedIcon />} sx={yellowOutlinedButtonSx}>
              Search
            </Button>
          </Stack>

          <TableContainer sx={tableContainerSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>Subcategory</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Category</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSubcategories.length > 0 ? filteredSubcategories.map((subcategory) => (
                  <TableRow
                    key={subcategory._id}
                    sx={{
                      ...tableBodyRowSx,
                      ...getHighlightRowSx(
                        subcategorySearch && subcategory.name.toLowerCase() === subcategorySearch.toLowerCase(),
                      ),
                    }}
                  >
                    <TableCell sx={tableBodyCellSx}>{subcategory.name}</TableCell>
                    <TableCell sx={tableBodyCellSx}>{subcategory.category?.name}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow sx={tableBodyRowSx}>
                    <TableCell colSpan={2} sx={{ ...tableBodyCellSx, py: 3, color: alpha(BRAND_DARK, 0.62) }}>
                      {sectionConfigs.subcategories.emptyMessage}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>

        <SectionCard sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={buildSectionHeaderSx(sectionConfigs.ranges.accent)}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${sectionConfigs.ranges.accent} 0%, ${alpha(sectionConfigs.ranges.accent, 0.72)} 100%)`, color: '#fff' }}>
                  <ViewAgendaRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND_DARK }}>
                    {sectionConfigs.ranges.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(BRAND_DARK, 0.64) }}>
                    {sectionConfigs.ranges.subtitle}
                  </Typography>
                </Box>
              </Stack>
              <Chip label={`${filteredRanges.length} visible`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: alpha(sectionConfigs.ranges.accent, 0.1), color: sectionConfigs.ranges.accent, fontWeight: 700, border: `1px solid ${alpha(sectionConfigs.ranges.accent, 0.18)}` }} />
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} component="form" onSubmit={addRange} sx={{ mb: 1.5 }}>
            <FormControl sx={{ minWidth: 240, ...inputSx }}>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={selectedCategoryForRange}
                onChange={(e) => setSelectedCategoryForRange(e.target.value)}
                required
              >
                {categories.map((category) => (
                  <MenuItem key={category._id} value={category._id}>{category.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={sectionConfigs.ranges.createLabel}
              value={rangeName}
              onChange={(e) => setRangeName(e.target.value)}
              required
              sx={{ flex: 1, ...inputSx }}
            />
            <Button type="submit" variant="contained" disabled={!selectedCategoryForRange} sx={yellowFilledButtonSx}>
              {sectionConfigs.ranges.buttonLabel}
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
            <TextField
              label={sectionConfigs.ranges.searchLabel}
              value={rangeSearch}
              onChange={(e) => setRangeSearch(e.target.value)}
              sx={{ flex: 1, ...inputSx }}
            />
            <Button variant="outlined" startIcon={<SearchRoundedIcon />} sx={yellowOutlinedButtonSx}>
              Search
            </Button>
          </Stack>

          <TableContainer sx={tableContainerSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeaderCellSx}>Range</TableCell>
                  <TableCell sx={tableHeaderCellSx}>Category</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRanges.length > 0 ? filteredRanges.map((range) => (
                  <TableRow
                    key={range._id}
                    sx={{
                      ...tableBodyRowSx,
                      ...getHighlightRowSx(
                        rangeSearch && range.name.toLowerCase() === rangeSearch.toLowerCase(),
                      ),
                    }}
                  >
                    <TableCell sx={tableBodyCellSx}>{range.name}</TableCell>
                    <TableCell sx={tableBodyCellSx}>{range.category?.name}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow sx={tableBodyRowSx}>
                    <TableCell colSpan={2} sx={{ ...tableBodyCellSx, py: 3, color: alpha(BRAND_DARK, 0.62) }}>
                      {sectionConfigs.ranges.emptyMessage}
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
