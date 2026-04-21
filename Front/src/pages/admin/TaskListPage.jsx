// src/pages/admin/TaskListPage.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Chip,
  Checkbox,
  ListItemText,
  TextField,
  Button,
  Typography,
  Grid,
  Collapse,
  Badge,
  Divider,
  Stack,
  IconButton,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Alert,
  Pagination,
  Autocomplete,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import api from '../../lib/api.js';

const ITEM_HEIGHT = 44;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 6 + ITEM_PADDING_TOP,
      width: 280,
    },
  },
};

// --- IST-safe YYYY-MM-DD ---
const toISTYMD = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const utc = dt.getTime() + dt.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 330 * 60000); // +05:30
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

export default function TaskListPage() {
  // Mobile responsiveness (same approach as FulfillmentDashboard)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [items, setItems] = useState([]);
  const [openFilters, setOpenFilters] = useState(false); // start collapsed for a cleaner look
  const [expandedRows, setExpandedRows] = useState({}); // { [assignmentId]: true/false }
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const isFirstRender = useRef(true);
  const isFilterChange = useRef(false); // Track if page change is due to filter
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    sourcePlatforms: [],
    listingPlatforms: [],
    stores: [],
    categories: [],
    subcategories: [],
    listers: [],
    assigners: [],
    taskCreators: [],
    marketplaces: []
  });

  // ====== FILTER STATE (trimmed to only requested ones) ======
  const [filters, setFilters] = useState({
    date: { mode: 'none', single: '', from: '', to: '' }, // 'none' | 'single' | 'range' (created date)
    scheduledDate: { mode: 'none', single: '', from: '', to: '' }, // 'none' | 'single' | 'range' (scheduled date)
    productTitle: { contains: '' },
    sourcePlatform: { in: [] },   // task.sourcePlatform.name
    category: { in: [] },
    subcategory: { in: [] },
    createdByTask: { in: [] },    // task.createdBy.username
    listingPlatform: { in: [] },  // listingPlatform.name
    store: { in: [] },            // store.name
    marketplace: { in: [] },      // marketplace enum
    lister: { in: [] },           // lister.username
    sharedBy: { in: [] },         // createdBy.username (assigner)
  });

  // ====== FIELD ACCESSORS (align with your render) ======
  const A = {
    date: (r) => r.createdAt,
    productTitle: (r) => r.task?.productTitle,
    sourcePlatform: (r) => r.task?.sourcePlatform?.name,
    category: (r) => r.task?.category?.name,
    subcategory: (r) => r.task?.subcategory?.name,
    distributedQty: (r) => {
      const rqList = r.rangeQuantities || [];
      return rqList.reduce((sum, rq) => sum + (rq.quantity || 0), 0);
    },
    createdByTask: (r) => r.task?.createdBy?.username,
    listingPlatform: (r) => r.listingPlatform?.name,
    store: (r) => r.store?.name,
    marketplace: (r) => r.marketplace,
    quantity: (r) => Number(r.quantity),
    lister: (r) => r.lister?.username,
    sharedBy: (r) => r.createdBy?.username,
    completedQuantity: (r) => Number(r.completedQuantity || 0),
  };

  // Quick helpers for pending & progress (per assignment row)
  const pendingQty = (r) => {
    const q = A.quantity(r);
    const c = A.completedQuantity(r);
    return Math.max(0, q - (Number.isFinite(c) ? c : 0));
  };
  const progressPct = (r) => {
    const q = A.quantity(r);
    if (!q || q <= 0) return 0;
    const c = Math.min(A.completedQuantity(r), q);
    return Math.round((c / q) * 100);
  };

  // ====== PREDICATES (trimmed) ======
  const matchesText = (val, contains) =>
    !contains || String(val ?? '').toLowerCase().includes(String(contains).toLowerCase());

  const matchesEnum = (val, arr) => !arr?.length || arr.includes(val);

  const matchesDate = (createdAt, dateFilter) => {
    const ymd = toISTYMD(createdAt);
    if (dateFilter.mode === 'none') return true;
    if (dateFilter.mode === 'single') return dateFilter.single ? ymd === dateFilter.single : true;
    // range
    const { from, to } = dateFilter;
    if (!from && !to) return true;
    if (from && ymd < from) return false;
    if (to && ymd > to) return false;
    return true;
  };

  // ====== DATA FETCH ======
  const loadItems = async (pageOverride) => {
    try {
      const currentPage = pageOverride !== undefined ? pageOverride : page;
      const params = { 
        sortBy: 'createdAt', 
        sortOrder: 'desc',
        page: currentPage,
        limit
      };

      // Add filter parameters
      if (filters.date.mode === 'single' && filters.date.single) {
        params.dateMode = 'single';
        params.dateSingle = filters.date.single;
      } else if (filters.date.mode === 'range') {
        params.dateMode = 'range';
        if (filters.date.from) params.dateFrom = filters.date.from;
        if (filters.date.to) params.dateTo = filters.date.to;
      }

      // Add scheduled date filter parameters
      if (filters.scheduledDate.mode === 'single' && filters.scheduledDate.single) {
        params.scheduledDateMode = 'single';
        params.scheduledDateSingle = filters.scheduledDate.single;
      } else if (filters.scheduledDate.mode === 'range') {
        params.scheduledDateMode = 'range';
        if (filters.scheduledDate.from) params.scheduledDateFrom = filters.scheduledDate.from;
        if (filters.scheduledDate.to) params.scheduledDateTo = filters.scheduledDate.to;
      }

      if (filters.productTitle.contains) {
        params.productTitle = filters.productTitle.contains;
      }

      if (filters.sourcePlatform.in.length) {
        params.sourcePlatform = filters.sourcePlatform.in.join(',');
      }

      if (filters.category.in.length) {
        params.category = filters.category.in.join(',');
      }

      if (filters.subcategory.in.length) {
        params.subcategory = filters.subcategory.in.join(',');
      }

      if (filters.createdByTask.in.length) {
        params.createdByTask = filters.createdByTask.in.join(',');
      }

      if (filters.listingPlatform.in.length) {
        params.platformId = filters.listingPlatform.in[0]._id || filters.listingPlatform.in[0]; // Extract ID from object
      }

      if (filters.store.in.length) {
        params.storeId = filters.store.in[0]._id || filters.store.in[0]; // Extract ID from object
      }

      if (filters.marketplace.in.length) {
        params.marketplace = filters.marketplace.in[0]; // Single marketplace for now
      }

      if (filters.lister.in.length) {
        params.listerUsername = filters.lister.in.join(',');
      }

      if (filters.sharedBy.in.length) {
        params.sharedBy = filters.sharedBy.in.join(',');
      }

      const { data } = await api.get('/assignments', { params });
      
      // Check if the response is paginated
      if (data.items) {
        setItems(data.items);
        setTotal(data.total || 0);
        setTotalPages(Math.ceil((data.total || 0) / limit));
      } else {
        // Fallback for non-paginated response
        const list = Array.isArray(data) ? data : (data.assignments || []);
        setItems(list);
        setTotal(list.length);
        setTotalPages(1);
      }
    } catch (e) {
      alert('Failed to fetch tasks.');
    }
  };

  const loadFilterOptions = async () => {
    try {
      const { data } = await api.get('/assignments/filter-options');
      setFilterOptions(data);
    } catch (e) {
      console.error('Failed to fetch filter options:', e);
    }
  };

  useEffect(() => { 
    loadFilterOptions();
    loadItems(1); // Initial load
    isFirstRender.current = false; // Mark first render complete
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When filters change, reset to page 1 and reload (skip on first render)
  useEffect(() => {
    if (isFirstRender.current) return;
    isFilterChange.current = true; // Mark as filter-triggered change
    setPage(1);
    loadItems(1); // Force load with page 1
  }, [
    filters.date.mode,
    filters.date.single,
    filters.date.from,
    filters.date.to,
    filters.scheduledDate.mode,
    filters.scheduledDate.single,
    filters.scheduledDate.from,
    filters.scheduledDate.to,
    filters.productTitle.contains,
    JSON.stringify(filters.sourcePlatform.in),
    JSON.stringify(filters.category.in),
    JSON.stringify(filters.subcategory.in),
    JSON.stringify(filters.createdByTask.in),
    JSON.stringify(filters.listingPlatform.in),
    JSON.stringify(filters.store.in),
    JSON.stringify(filters.marketplace.in),
    JSON.stringify(filters.lister.in),
    JSON.stringify(filters.sharedBy.in)
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data when page changes
  useEffect(() => { 
    if (isFilterChange.current) {
      isFilterChange.current = false; // Reset flag
      return; // Skip loading, filter effect already loaded
    }
    loadItems();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDelete = (row) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget?._id) return;
    try {
      await api.delete(`/assignments/${deleteTarget._id}`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadItems();
    } catch (e) {
      console.error('Failed to delete assignment:', e);
      alert('Failed to delete assignment');
    }
  };

  const handlePageChange = (event, value) => {
    setPage(value);
    loadItems(value); // Load immediately with new page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // No more client-side filtering - backend handles it all
  const filteredItems = items;

  // ====== ACTIVE FILTER COUNT (for badge) ======
  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.date.mode === 'single' && filters.date.single) n++;
    if (filters.date.mode === 'range' && (filters.date.from || filters.date.to)) n++;
    if (filters.scheduledDate.mode === 'single' && filters.scheduledDate.single) n++;
    if (filters.scheduledDate.mode === 'range' && (filters.scheduledDate.from || filters.scheduledDate.to)) n++;
    if (filters.productTitle.contains) n++;
    ['sourcePlatform','category','subcategory','createdByTask','listingPlatform','store','marketplace','lister','sharedBy']
      .forEach(k => { if (filters[k].in.length) n++; });
    return n;
  }, [filters]);

  // ====== HANDLERS ======
  const handleMultiChange = (key) => (event) => {
    const value = typeof event.target.value === 'string'
      ? event.target.value.split(',')
      : event.target.value;
    setFilters((f) => ({ ...f, [key]: { in: value } }));
  };

  const clearAll = () =>
    setFilters({
      date: { mode: 'none', single: '', from: '', to: '' },
      scheduledDate: { mode: 'none', single: '', from: '', to: '' },
      productTitle: { contains: '' },
      sourcePlatform: { in: [] },
      category: { in: [] },
      subcategory: { in: [] },
      createdByTask: { in: [] },
      listingPlatform: { in: [] },
      store: { in: [] },
      marketplace: { in: [] },
      lister: { in: [] },
      sharedBy: { in: [] },
    });

  // ====== RENDER ======
  return (
    <Box>
      {/* FILTER TOOLBAR (compact, starts collapsed) */}
      <Paper sx={{ p: 1, mb: 1 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          gap={1}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            gap={1}
          >
            <Badge color={activeCount ? 'primary' : 'default'} badgeContent={activeCount} overlap="circular">
              <IconButton
                onClick={() => setOpenFilters(v => !v)}
                size="small"
                aria-label="Toggle filters"
                sx={{
                  transform: openFilters ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform .2s',
                }}
              >
                <ExpandMoreIcon fontSize="small" />
              </IconButton>
            </Badge>
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterListIcon fontSize="small" /> Filters
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Showing <b>{items.length}</b> of {total} total
            </Typography>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Tooltip title="Clear all filters">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ClearAllIcon />}
                  onClick={clearAll}
                  disabled={activeCount === 0}
                  fullWidth={isSmallMobile}
                >
                  Clear
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Collapse in={openFilters} timeout="auto" unmountOnExit>
          <Divider sx={{ my: 1 }} />
          {/* FILTER GRID (only requested filters) */}
          <Grid container spacing={1} alignItems="center">
            {/* Date mode & pickers (Created Date) */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="date-mode-label">Created Date mode</InputLabel>
                <Select
                  labelId="date-mode-label"
                  value={filters.date.mode}
                  label="Created Date mode"
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, date: { ...f.date, mode: e.target.value } }))
                  }
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="single">Single day</MenuItem>
                  <MenuItem value="range">Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {filters.date.mode === 'single' && (
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  size="small"
                  type="date"
                  label="Created Date"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  value={filters.date.single}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, date: { ...f.date, single: e.target.value } }))
                  }
                />
              </Grid>
            )}

            {filters.date.mode === 'range' && (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    size="small"
                    type="date"
                    label="Created From"
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    value={filters.date.from}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, date: { ...f.date, from: e.target.value } }))
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    size="small"
                    type="date"
                    label="Created To"
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    value={filters.date.to}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, date: { ...f.date, to: e.target.value } }))
                    }
                  />
                </Grid>
              </>
            )}

            {/* Scheduled Date mode & pickers */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="scheduled-date-mode-label">Scheduled Date mode</InputLabel>
                <Select
                  labelId="scheduled-date-mode-label"
                  value={filters.scheduledDate.mode}
                  label="Scheduled Date mode"
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, scheduledDate: { ...f.scheduledDate, mode: e.target.value } }))
                  }
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="single">Single day</MenuItem>
                  <MenuItem value="range">Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {filters.scheduledDate.mode === 'single' && (
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  size="small"
                  type="date"
                  label="Scheduled Date"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  value={filters.scheduledDate.single}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, scheduledDate: { ...f.scheduledDate, single: e.target.value } }))
                  }
                />
              </Grid>
            )}

            {filters.scheduledDate.mode === 'range' && (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    size="small"
                    type="date"
                    label="Scheduled From"
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    value={filters.scheduledDate.from}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, scheduledDate: { ...f.scheduledDate, from: e.target.value } }))
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    size="small"
                    type="date"
                    label="Scheduled To"
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    value={filters.scheduledDate.to}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, scheduledDate: { ...f.scheduledDate, to: e.target.value } }))
                    }
                  />
                </Grid>
              </>
            )}

            {/* Product Title contains */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                size="small"
                label="Title contains"
                fullWidth
                value={filters.productTitle.contains}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, productTitle: { contains: e.target.value } }))
                }
              />
            </Grid>

            {/* Source Platform Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.sourcePlatforms.map(p => p.name)}
                value={filters.sourcePlatform.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, sourcePlatform: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Source Platform" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Category Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.categories.map(c => c.name)}
                value={filters.category.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, category: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Category" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Subcategory Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.subcategories.map(s => s.name)}
                value={filters.subcategory.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, subcategory: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Subcategory" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Created By (Task) Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.taskCreators.map(t => t.username)}
                value={filters.createdByTask.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, createdByTask: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Created By" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Listing Platform Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.listingPlatforms}
                value={filters.listingPlatform.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, listingPlatform: { in: newValue } }))}
                getOptionLabel={(option) => option?.name || option}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                renderInput={(params) => <TextField {...params} label="Listing Platform" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option?.name || option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Store Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.stores}
                value={filters.store.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, store: { in: newValue } }))}
                getOptionLabel={(option) => option?.name || option}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                renderInput={(params) => <TextField {...params} label="Store" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option?.name || option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Marketplace Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.marketplaces}
                value={filters.marketplace.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, marketplace: { in: newValue } }))}
                getOptionLabel={(option) => option?.replace('EBAY_', 'eBay ')?.replace('_', ' ') || option}
                renderInput={(params) => <TextField {...params} label="Marketplace" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option?.replace('EBAY_', 'eBay ')?.replace('_', ' ')} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Lister Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.listers.map(l => l.username)}
                value={filters.lister.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, lister: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Lister" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
                  ))
                }
              />
            </Grid>

            {/* Shared By Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.assigners.map(a => a.username)}
                value={filters.sharedBy.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, sharedBy: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Shared By" />}
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

      {/* MOBILE/TABLET: Card view */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Stack spacing={1.5}>
          {filteredItems.map((it, idx) => {
            const t = it.task || {};
            const q = A.quantity(it);
            const p = pendingQty(it);
            const pct = progressPct(it);
            const distributedQty = A.distributedQty(it);
            const rangeQuantities = it.rangeQuantities || [];
            const isExpanded = expandedRows[it._id] || false;

            return (
              <Paper key={it._id || idx} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        #{(page - 1) * limit + idx + 1} • Scheduled: {toISTYMD(it.scheduledDate)} • Created: {toISTYMD(it.createdAt)}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                        {t.productTitle || '-'}
                      </Typography>

                      {t.supplierLink ? (
                        <Button
                          size="small"
                          variant="outlined"
                          component="a"
                          href={t.supplierLink}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ mt: 1 }}
                        >
                          Supplier Link
                        </Button>
                      ) : null}
                    </Box>

                    <Button size="small" color="error" onClick={() => openDelete(it)} sx={{ flexShrink: 0 }}>
                      Delete
                    </Button>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`Source: ${t.sourcePlatform?.name || '-'}`} />
                    <Chip size="small" label={`Category: ${t.category?.name || '-'}`} />
                    <Chip size="small" label={`Subcategory: ${t.subcategory?.name || '-'}`} />
                    <Chip size="small" label={`Created By: ${t.createdBy?.username || '-'}`} />
                    <Chip size="small" label={`Platform: ${it.listingPlatform?.name || '-'}`} />
                    <Chip size="small" label={`Store: ${it.store?.name || '-'}`} />
                    <Chip size="small" label={`Marketplace: ${it.marketplace?.replace('EBAY_', 'eBay ')?.replace('_', ' ') || '-'}`} />
                    <Chip size="small" label={`Lister: ${it.lister?.username || '-'}`} />
                    <Chip size="small" label={`Assigned By: ${it.createdBy?.username || '-'}`} />
                  </Stack>

                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      Qty: {q ?? '-'} • Distributed: {distributedQty} • Pending: {p}
                    </Typography>
                    <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {Math.min(A.completedQuantity(it), q || 0)} / {q || 0} ({pct}%)
                    </Typography>
                  </Stack>

                  {rangeQuantities.length > 0 && (
                    <Box>
                      <Button
                        size="small"
                        onClick={() => setExpandedRows(prev => ({ ...prev, [it._id]: !isExpanded }))}
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      >
                        Range Breakdown
                      </Button>

                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
                          {rangeQuantities.map((rq, rIdx) => (
                            <Stack key={rIdx} direction="row" justifyContent="space-between">
                              <Typography variant="body2">{rq.range?.name || rq.range || '-'}</Typography>
                              <Typography variant="body2">{rq.quantity || 0}</Typography>
                            </Stack>
                          ))}
                          <Divider sx={{ my: 1 }} />
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" fontWeight="bold">Total</Typography>
                            <Typography variant="body2" fontWeight="bold">{distributedQty}</Typography>
                          </Stack>
                        </Paper>
                      </Collapse>
                    </Box>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {/* DESKTOP: Table view */}
      <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
        <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow>
              <TableCell>SL No</TableCell>
              <TableCell>Scheduled Date</TableCell>
              <TableCell>Created Date</TableCell>
              
              <TableCell>Supplier Link</TableCell>
              
              <TableCell>Source Platform</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Subcategory</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Listing Platform</TableCell>
              <TableCell>Store</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Distributed Qty</TableCell>
              <TableCell>Quantity Pending</TableCell>
              <TableCell>Lister</TableCell>
              <TableCell>Assigned By</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredItems.map((it, idx) => {
              const t = it.task || {};
              const q = A.quantity(it);
              const p = pendingQty(it);
              const pct = progressPct(it);
              const distributedQty = A.distributedQty(it);
              const rangeQuantities = it.rangeQuantities || [];
              const isExpanded = expandedRows[it._id] || false;
              
              return (
                <>
                  <TableRow key={it._id || idx} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
                    <TableCell>{(page - 1) * limit + idx + 1}</TableCell>
                    <TableCell>{toISTYMD(it.scheduledDate)}</TableCell>
                    <TableCell>{toISTYMD(it.createdAt)}</TableCell>
                    
                    <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.supplierLink ? (
                        <a href={t.supplierLink} target="_blank" rel="noreferrer">Link</a>
                      ) : '-'}
                    </TableCell>
                    
                    <TableCell>{t.sourcePlatform?.name || '-'}</TableCell>
                    <TableCell>{t.category?.name || '-'}</TableCell>
                    <TableCell>{t.subcategory?.name || '-'}</TableCell>
                    <TableCell>{t.createdBy?.username || '-'}</TableCell>
                    <TableCell>{it.listingPlatform?.name || '-'}</TableCell>
                    <TableCell>{it.store?.name || '-'}</TableCell>
                    <TableCell>{it.marketplace?.replace('EBAY_', 'eBay ')?.replace('_', ' ') || '-'}</TableCell>
                    <TableCell>{q ?? '-'}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <span>{distributedQty}</span>
                        {rangeQuantities.length > 0 && (
                          <IconButton
                            size="small"
                            onClick={() => setExpandedRows(prev => ({ ...prev, [it._id]: !isExpanded }))}
                          >
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                        <Typography variant="body2">{p} pending</Typography>
                        <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {Math.min(A.completedQuantity(it), q || 0)} / {q || 0} ({pct}%)
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{it.lister?.username || '-'}</TableCell>
                    <TableCell>{it.createdBy?.username || '-'}</TableCell>
                    <TableCell>
                      <Button size="small" color="error" onClick={() => openDelete(it)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                  {rangeQuantities.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={18} sx={{ py: 0, borderBottom: 0 }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ margin: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Range Quantity Breakdown:</Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Range</TableCell>
                                  <TableCell align="right">Quantity</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {rangeQuantities.map((rq, rIdx) => (
                                  <TableRow key={rIdx}>
                                    <TableCell>{rq.range?.name || rq.range || '-'}</TableCell>
                                    <TableCell align="right">{rq.quantity || 0}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell><strong>Total</strong></TableCell>
                                  <TableCell align="right"><strong>{distributedQty}</strong></TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Delete Assignment</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Deleting this assignment will remove it from the lister dashboard and delete any related compatibility assignments. This action cannot be undone.
          </Alert>
          {deleteTarget && (
            <Box sx={{ mt: 2 }}>
              <strong>Product:</strong> {deleteTarget.task?.productTitle || '-'}
              <br />
              <strong>Lister:</strong> {deleteTarget.lister?.username || '-'}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
