import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box, Button, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Typography, TextField, Collapse, IconButton,
  Badge, Divider, Grid, Chip, Pagination, Autocomplete, FormControl, InputLabel, MenuItem, Select,
  useMediaQuery, useTheme
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import api from '../../lib/api.js';

const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

export default function ListingSheetPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [allRows, setAllRows] = useState([]); // Store all data
  const [platforms, setPlatforms] = useState([]);
  const [stores, setStores] = useState([]);
  const [openFilters, setOpenFilters] = useState(false);
  const isFirstRender = useRef(true);
  const isFilterChange = useRef(false); // Track if page change is due to filter
  
  // Filter options from database (ALL available options)
  const [allCategories, setAllCategories] = useState([]);
  const [allSubcategories, setAllSubcategories] = useState([]);
  const [allRanges, setAllRanges] = useState([]);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 100; // Increased from 50 to 100
  
  const [filters, setFilters] = useState({
    platformId: null, // Changed to store full object
    storeId: null, // Changed to store full object
    marketplace: '',
    dateMode: 'none', // 'none', 'single', 'range'
    singleDate: '',
    startDate: '',
    endDate: '',
    category: [],
    subcategory: [],
    range: []
  });

  const marketplaces = [
    { value: '', label: 'All' },
    { value: 'EBAY_US', label: 'eBay US' },
    { value: 'EBAY_AUS', label: 'eBay Australia' },
    { value: 'EBAY_CANADA', label: 'eBay Canada' }
  ];

  const load = async () => {
    const [{ data: lp }] = await Promise.all([
      api.get('/platforms', { params: { type: 'listing' } })
    ]);
    setPlatforms(lp);
  };

  const loadFilterOptions = async () => {
    try {
      // Fetch ALL categories, subcategories, and ranges from database
      const [categoriesRes, subcategoriesRes, rangesRes] = await Promise.all([
        api.get('/categories'),
        api.get('/subcategories'),
        api.get('/ranges')
      ]);
      
      setAllCategories(categoriesRes.data.map(c => c.name));
      setAllSubcategories(subcategoriesRes.data.map(s => s.name));
      setAllRanges(rangesRes.data.map(r => r.name));
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  const fetchAllData = async (pageOverride) => {
    try {
      const currentPage = pageOverride !== undefined ? pageOverride : page;
      const params = { page: currentPage, limit };
      
      // Add filter parameters
      if (filters.platformId?._id) params.platformId = filters.platformId._id;
      if (filters.storeId?._id) params.storeId = filters.storeId._id;
      if (filters.marketplace) params.marketplace = filters.marketplace;
      
      // Date filters - use ISO format (YYYY-MM-DD)
      if (filters.dateMode === 'single' && filters.singleDate) {
        params.startDate = filters.singleDate;
        params.endDate = filters.singleDate;
      } else if (filters.dateMode === 'range') {
        if (filters.startDate) params.startDate = filters.startDate;
        if (filters.endDate) params.endDate = filters.endDate;
      }
      
      // Category, subcategory, range filters
      if (filters.category.length) params.category = filters.category.join(',');
      if (filters.subcategory.length) params.subcategory = filters.subcategory.join(',');
      if (filters.range.length) params.range = filters.range.join(',');
      
      const { data } = await api.get('/listing-completions/sheet', { params });
      
      // Handle both paginated and non-paginated responses
      if (data.items) {
        setAllRows(data.items);
        setTotal(data.total || 0);
        setTotalPages(Math.ceil((data.total || 0) / limit));
      } else {
        // Fallback for non-paginated response
        setAllRows(data);
        setTotal(data.length);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Failed to fetch listing sheet data:', error);
    }
  };

  // Initial load
  useEffect(() => {
    load();
    loadFilterOptions();
    fetchAllData(1);
    isFirstRender.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // When filters change, reset to page 1 and reload
  useEffect(() => {
    if (isFirstRender.current) return;
    isFilterChange.current = true;
    setPage(1);
    fetchAllData(1);
  }, [
    filters.platformId,
    filters.storeId,
    filters.marketplace,
    filters.dateMode,
    filters.singleDate,
    filters.startDate,
    filters.endDate,
    JSON.stringify(filters.category),
    JSON.stringify(filters.subcategory),
    JSON.stringify(filters.range)
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Load data when page changes (skip if triggered by filter)
  useEffect(() => {
    if (isFirstRender.current) return;
    if (isFilterChange.current) {
      isFilterChange.current = false; // Reset flag
      return; // Skip loading, filter effect already loaded
    }
    fetchAllData();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filters.platformId?._id) {
      api
        .get('/stores', { params: { platformId: filters.platformId._id } })
        .then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [filters.platformId]);
  
  // Clear storeId when platform changes
  useEffect(() => {
    if (!filters.platformId && filters.storeId) {
      setFilters(prev => ({ ...prev, storeId: null }));
    }
  }, [filters.platformId, filters.storeId]);

  // No client-side filtering - backend handles it
  const filteredRows = allRows;

  // Calculate total quantity
  const totalQuantity = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + (row.quantity || 0), 0);
  }, [filteredRows]);

  // Active filter count
  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.platformId) n++;
    if (filters.storeId) n++;
    if (filters.marketplace) n++;
    if (filters.dateMode !== 'none') n++;
    if (filters.category.length) n++;
    if (filters.subcategory.length) n++;
    if (filters.range.length) n++;
    return n;
  }, [filters]);

  const handleReset = () => {
    setFilters({
      platformId: null,
      storeId: null,
      marketplace: '',
      dateMode: 'none',
      singleDate: '',
      startDate: '',
      endDate: '',
      category: [],
      subcategory: [],
      range: []
    });
    setPage(1); // Reset to first page
  };

  const handlePageChange = (event, value) => {
    setPage(value);
    fetchAllData(value); // Load immediately with new page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const ListingCards = () => (
    <Stack spacing={1.5}>
      {filteredRows.map((row, idx) => (
        <Paper key={idx} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={0.75}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '—'}
            </Typography>

            <Typography variant="body2">Platform: {row.platform || '—'}</Typography>
            <Typography variant="body2">Store: {row.store || '—'}</Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Marketplace: ${(row.marketplace || '—').replace('EBAY_', 'eBay ').replace('_', ' ')}`} />
              <Chip size="small" label={`Category: ${row.category || '—'}`} />
              <Chip size="small" label={`Subcategory: ${row.subcategory || '—'}`} />
              <Chip size="small" label={`Range: ${row.range || '—'}`} />
            </Stack>

            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Quantity: {row.quantity ?? 0}
            </Typography>
          </Stack>
        </Paper>
      ))}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Total: {totalQuantity}
        </Typography>
      </Paper>
    </Stack>
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Listing Sheet</Typography>

      <Paper sx={{ p: 1.5, mb: 1.5 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          alignItems={{ xs: 'stretch', lg: 'center' }}
          justifyContent="space-between"
          gap={1}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <Badge color={activeCount ? 'primary' : 'default'} badgeContent={activeCount} overlap="circular">
              <IconButton
                size="small"
                onClick={() => setOpenFilters(!openFilters)}
                sx={{
                  transform: openFilters ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s'
                }}
              >
                <ExpandMoreIcon />
              </IconButton>
            </Badge>
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterListIcon fontSize="small" /> Listing Sheet Filters
            </Typography>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ width: { xs: '100%', lg: 'auto' } }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ClearAllIcon />}
              onClick={handleReset}
              disabled={activeCount === 0}
              fullWidth={isSmallMobile}
            >
              Clear all
            </Button>
          </Stack>
        </Stack>

        <Collapse in={openFilters} timeout="auto">
          <Divider sx={{ my: 1.5 }} />
          <Grid container spacing={1.5} alignItems="center">
            {/* Platform */}
            <Grid item xs={12} md={3}>
              <Autocomplete
                size="small"
                options={platforms}
                getOptionLabel={(option) => option.name || ''}
                value={filters.platformId}
                onChange={(e, newValue) => setFilters({ ...filters, platformId: newValue })}
                renderInput={(params) => <TextField {...params} label="Platform" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
              />
            </Grid>

            {/* Store */}
            <Grid item xs={12} md={3}>
              <Autocomplete
                size="small"
                options={stores}
                getOptionLabel={(option) => option.name || ''}
                value={filters.storeId}
                onChange={(e, newValue) => setFilters({ ...filters, storeId: newValue })}
                renderInput={(params) => <TextField {...params} label="Store" />}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                disabled={!filters.platformId}
              />
            </Grid>

            {/* Marketplace */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Marketplace</InputLabel>
                <Select
                  label="Marketplace"
                  value={filters.marketplace}
                  onChange={(e) => setFilters({ ...filters, marketplace: e.target.value })}
                >
                  {marketplaces.map((m) => (
                    <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Date Mode */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Date Filter</InputLabel>
                <Select
                  label="Date Filter"
                  value={filters.dateMode}
                  onChange={(e) => setFilters({ ...filters, dateMode: e.target.value })}
                >
                  <MenuItem value="none">No Date Filter</MenuItem>
                  <MenuItem value="single">Single Date</MenuItem>
                  <MenuItem value="range">Date Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Single Date */}
            {filters.dateMode === 'single' && (
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Date"
                  type="date"
                  value={filters.singleDate}
                  onChange={(e) => setFilters({ ...filters, singleDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            )}

            {/* Date Range */}
            {filters.dateMode === 'range' && (
              <>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Start Date"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label="End Date"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </>
            )}

            {/* Category */}
            <Grid item xs={12} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={allCategories}
                value={filters.category}
                onChange={(e, newValue) => setFilters(f => ({ ...f, category: newValue }))}
                renderInput={(params) => <TextField {...params} label="Category" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Subcategory */}
            <Grid item xs={12} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={allSubcategories}
                value={filters.subcategory}
                onChange={(e, newValue) => setFilters(f => ({ ...f, subcategory: newValue }))}
                renderInput={(params) => <TextField {...params} label="Subcategory" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Range */}
            <Grid item xs={12} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={allRanges}
                value={filters.range}
                onChange={(e, newValue) => setFilters(f => ({ ...f, range: newValue }))}
                renderInput={(params) => <TextField {...params} label="Range" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>
          </Grid>
        </Collapse>
      </Paper>

      {filteredRows.length > 0 && (
        <>
          {/* MOBILE/TABLET: Cards */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <ListingCards />
          </Box>

          {/* DESKTOP: Table */}
          <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
            <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Platform</strong></TableCell>
                  <TableCell><strong>Store</strong></TableCell>
                  <TableCell><strong>Marketplace</strong></TableCell>
                  <TableCell><strong>Category</strong></TableCell>
                  <TableCell><strong>Subcategory</strong></TableCell>
                  <TableCell><strong>Range</strong></TableCell>
                  <TableCell align="right"><strong>Quantity</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{new Date(row.date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell>{row.platform}</TableCell>
                    <TableCell>{row.store}</TableCell>
                    <TableCell>{row.marketplace?.replace('EBAY_', 'eBay ').replace('_', ' ')}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.subcategory}</TableCell>
                    <TableCell>{row.range}</TableCell>
                    <TableCell align="right">{row.quantity}</TableCell>
                  </TableRow>
                ))}
                {/* Total Row */}
                <TableRow sx={{ backgroundColor: 'action.hover', fontWeight: 'bold' }}>
                  <TableCell colSpan={7} align="right"><strong>Total</strong></TableCell>
                  <TableCell align="right"><strong>{totalQuantity}</strong></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {filteredRows.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No data available.
          </Typography>
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Paper sx={{ p: 2, mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Paper>
      )}
    </Box>
  );
}
