// src/pages/admin/StoreTaskDetailPage.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Pagination,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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

const toISTYMD = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const utc = dt.getTime() + dt.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 330 * 60000);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

export default function StoreTaskDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get('storeId');
  const date = searchParams.get('date');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFilters, setOpenFilters] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const isFilterChange = useRef(false); // Track if page change is due to filter
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    sourcePlatforms: [],
    categories: [],
    subcategories: [],
    listers: [],
    assigners: [],
    taskCreators: [],
    marketplaces: []
  });

  // Filter state
  const [filters, setFilters] = useState({
    productTitle: { contains: '' },
    sourcePlatform: { in: [] },
    category: { in: [] },
    subcategory: { in: [] },
    createdByTask: { in: [] },
    marketplace: { in: [] },
    lister: { in: [] },
    sharedBy: { in: [] },
  });

  const A = {
    productTitle: (r) => r.task?.productTitle,
    sourcePlatform: (r) => r.task?.sourcePlatform?.name,
    category: (r) => r.task?.category?.name,
    subcategory: (r) => r.task?.subcategory?.name,
    distributedQty: (r) => {
      const rqList = r.rangeQuantities || [];
      return rqList.reduce((sum, rq) => sum + (rq.quantity || 0), 0);
    },
    createdByTask: (r) => r.task?.createdBy?.username,
    marketplace: (r) => r.marketplace,
    quantity: (r) => Number(r.quantity),
    lister: (r) => r.lister?.username,
    sharedBy: (r) => r.createdBy?.username,
    completedQuantity: (r) => Number(r.completedQuantity || 0),
  };

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

  const loadItems = async (pageOverride) => {
    if (!storeId || !date) {
      alert('Missing storeId or date parameter');
      navigate('/admin/store-wise-tasks');
      return;
    }

    try {
      setLoading(true);
      
      const currentPage = pageOverride !== undefined ? pageOverride : page;
      const params = { storeId, date, page: currentPage, limit };

      // Add filter parameters
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
      if (filters.marketplace.in.length) {
        params.marketplace = filters.marketplace.in[0];
      }
      if (filters.lister.in.length) {
        params.listerUsername = filters.lister.in.join(',');
      }
      if (filters.sharedBy.in.length) {
        params.sharedBy = filters.sharedBy.in.join(',');
      }

      const { data } = await api.get('/store-wise-tasks/details', { params });
      
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / limit));
    } catch (e) {
      console.error('Failed to fetch store task details:', e);
      alert('Failed to load task details');
    } finally {
      setLoading(false);
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
    loadItems(); // Initial load
  }, []);

  // When filters change, reset to page 1 and reload
  useEffect(() => { 
    isFilterChange.current = true; // Mark as filter-triggered change
    setPage(1);
    loadItems(1); // Force load with page 1
  }, [filters]);

  // Load data when page or storeId/date changes
  useEffect(() => { 
    if (isFilterChange.current) {
      isFilterChange.current = false; // Reset flag
      return; // Skip loading, filter effect already loaded
    }
    loadItems();
  }, [storeId, date, page]);

  const handlePageChange = (event, value) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter predicates - not needed anymore, backend handles it
  // No more client-side filtering
  const filteredItems = items;

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.productTitle.contains) n++;
    ['sourcePlatform', 'category', 'subcategory', 'createdByTask', 'marketplace', 'lister', 'sharedBy']
      .forEach(k => { if (filters[k].in.length) n++; });
    return n;
  }, [filters]);

  const handleMultiChange = (key) => (event) => {
    const value = typeof event.target.value === 'string'
      ? event.target.value.split(',')
      : event.target.value;
    setFilters((f) => ({ ...f, [key]: { in: value } }));
  };

  const clearAll = () =>
    setFilters({
      productTitle: { contains: '' },
      sourcePlatform: { in: [] },
      category: { in: [] },
      subcategory: { in: [] },
      createdByTask: { in: [] },
      marketplace: { in: [] },
      lister: { in: [] },
      sharedBy: { in: [] },
    });

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading && page === 1) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={() => navigate('/admin/store-wise-tasks')}>
            <ArrowBackIcon />
          </IconButton>
          <Box flex={1}>
            <Typography variant="h5">Task Details</Typography>
            <Typography variant="body2" color="text.secondary">
              {items[0]?.store?.name} - {formatDate(date)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Filter Toolbar */}
      <Paper sx={{ p: 1, mb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Badge color={activeCount ? 'primary' : 'default'} badgeContent={activeCount} overlap="circular">
              <IconButton
                onClick={() => setOpenFilters(v => !v)}
                size="small"
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

          <Stack direction="row" gap={1}>
            <Tooltip title="Clear all filters">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ClearAllIcon />}
                  onClick={clearAll}
                  disabled={activeCount === 0}
                >
                  Clear
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Collapse in={openFilters} timeout="auto" unmountOnExit>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={1} alignItems="center">
            {/* Product Title */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Product Title"
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
                renderInput={(params) => <TextField {...params} label="Created By (Task)" />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} />
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

            {/* Assigned By Autocomplete */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={filterOptions.assigners.map(a => a.username)}
                value={filters.sharedBy.in}
                onChange={(e, newValue) => setFilters(f => ({ ...f, sharedBy: { in: newValue } }))}
                renderInput={(params) => <TextField {...params} label="Assigned By" />}
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

      {/* Table */}
      <TableContainer component={Paper}>
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
              <TableCell>Marketplace</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Distributed Qty</TableCell>
              <TableCell>Quantity Pending</TableCell>
              <TableCell>Lister</TableCell>
              <TableCell>Assigned By</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={14} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No assignments found matching the filters.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((it, idx) => {
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
                    </TableRow>
                    {rangeQuantities.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={14} sx={{ py: 0, borderBottom: 0 }}>
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
              })
            )}
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
    </Box>
  );
}
