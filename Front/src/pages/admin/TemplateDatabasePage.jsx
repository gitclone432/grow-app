import { useState, useEffect, useMemo } from 'react';
import { 
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, 
  TableRow, Typography, Chip, Stack, IconButton, Link as MuiLink, FormControl,
  InputLabel, Select, MenuItem, TextField, Collapse, Pagination, Alert,
  useMediaQuery, useTheme, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, Grid, Tabs, Tab, TableSortLabel
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../lib/api';

function formatListingPrice(value) {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : '—';
}

function formatListedDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveSupplierLink(listing) {
  const saved = String(listing?.amazonLink || '').trim();
  if (saved) return saved;
  const asin = String(listing?._asinReference || '').trim().toUpperCase();
  if (!asin) return '';
  return `https://www.amazon.com/dp/${asin}`;
}

/** Where the row was created: CSV Listings Lab vs Direct List to eBay */
function getListingSource(listing) {
  if (listing?.listingOrigin === 'direct_list') {
    return { key: 'direct_list', label: 'Direct List', color: 'secondary' };
  }
  // Legacy rows before listingOrigin: published via Direct List API
  if (!listing?.listingOrigin && listing?.ebayPublishedAt) {
    return { key: 'direct_list', label: 'Direct List', color: 'secondary' };
  }
  return { key: 'template_listings', label: 'CSV Listings', color: 'info' };
}

function getCustomFieldEntries(customFields) {
  if (!customFields) return [];
  if (customFields instanceof Map) {
    return Array.from(customFields.entries());
  }
  if (typeof customFields === 'object') {
    return Object.entries(customFields);
  }
  return [];
}

const SUMMARY_SORT_COLUMNS = [
  { id: 'sellerName', label: 'Seller', align: 'left', numeric: false },
  { id: 'csvActive', label: 'CSV Active', align: 'right', numeric: true },
  { id: 'csvDraft', label: 'CSV Draft', align: 'right', numeric: true },
  { id: 'csvTotal', label: 'CSV Total', align: 'right', numeric: true },
  { id: 'directTotal', label: 'Direct List', align: 'right', numeric: true },
  { id: 'directDraft', label: 'Direct Draft', align: 'right', numeric: true },
  { id: 'total', label: 'Total', align: 'right', numeric: true },
];

function compareSummaryRows(a, b, orderBy, order) {
  const direction = order === 'asc' ? 1 : -1;
  if (orderBy === 'sellerName') {
    const left = String(a.sellerName || '').toLowerCase();
    const right = String(b.sellerName || '').toLowerCase();
    return left.localeCompare(right, undefined, { sensitivity: 'base' }) * direction;
  }
  const left = Number(a[orderBy]) || 0;
  const right = Number(b[orderBy]) || 0;
  if (left === right) {
    return String(a.sellerName || '').localeCompare(String(b.sellerName || ''), undefined, { sensitivity: 'base' });
  }
  return (left - right) * direction;
}

export default function TemplateDatabasePage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Filter state
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data state
  const [listings, setListings] = useState([]);
  const [groupedListings, setGroupedListings] = useState({});
  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryTotals, setSummaryTotals] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summarySortBy, setSummarySortBy] = useState('total');
  const [summarySortOrder, setSummarySortOrder] = useState('desc');
  
  // UI state
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSellers, setExpandedSellers] = useState(new Set());
  
  // Details dialog state
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);

  const sortedSummaryRows = useMemo(() => {
    return [...summaryRows].sort((a, b) =>
      compareSummaryRows(a, b, summarySortBy, summarySortOrder)
    );
  }, [summaryRows, summarySortBy, summarySortOrder]);

  const handleSummarySort = (columnId) => {
    if (summarySortBy === columnId) {
      setSummarySortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSummarySortBy(columnId);
    setSummarySortOrder(columnId === 'sellerName' ? 'asc' : 'desc');
  };

  useEffect(() => {
    fetchSellers();
    fetchTemplates();
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 0) {
      fetchListings();
    }
  }, [selectedSeller, selectedTemplate, statusFilter, originFilter, searchQuery, pagination.page, activeTab]);

  useEffect(() => {
    if (activeTab === 1) {
      fetchSummary();
    }
  }, [activeTab]);

  useEffect(() => {
    // Group listings by seller
    const grouped = {};
    listings.forEach(listing => {
      const sellerName = listing.sellerId?.user?.username || listing.sellerId?.user?.email || 'Unassigned';
      if (!grouped[sellerName]) {
        grouped[sellerName] = [];
      }
      grouped[sellerName].push(listing);
    });
    setGroupedListings(grouped);
    
    // Auto-expand all sellers initially
    setExpandedSellers(new Set(Object.keys(grouped)));
  }, [listings]);

  const fetchSellers = async () => {
    try {
      const { data } = await api.get('/sellers/all');
      setSellers(data || []);
    } catch (err) {
      console.error('Error fetching sellers:', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/listing-templates');
      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/template-listings/database-stats');
      setStats(data || {});
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchSummary = async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const { data } = await api.get('/template-listings/database-summary');
      setSummaryRows(data.rows || []);
      setSummaryTotals(data.totals || null);
    } catch (err) {
      console.error('Error fetching summary:', err);
      setSummaryError('Failed to load summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchListings = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      
      if (selectedSeller) params.sellerId = selectedSeller;
      if (selectedTemplate) params.templateId = selectedTemplate;
      if (statusFilter) params.status = statusFilter;
      if (originFilter) params.listingOrigin = originFilter;
      if (searchQuery) params.search = searchQuery;
      
      const { data } = await api.get('/template-listings/database-view', { params });
      setListings(data.listings || []);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Error fetching listings:', err);
      setError('Failed to load listings');
    } finally {
      setLoading(false);
    }
  };

  const openSellerInListings = (sellerId, { origin = '', status = '' } = {}) => {
    setSelectedSeller(sellerId || '');
    setOriginFilter(origin);
    setStatusFilter(status);
    setSelectedTemplate('');
    setSearchQuery('');
    setPagination((prev) => ({ ...prev, page: 1 }));
    setActiveTab(0);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleViewDetails = (listing) => {
    setSelectedListing(listing);
    setDetailsDialogOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsDialogOpen(false);
    setSelectedListing(null);
  };

  const toggleSeller = (sellerName) => {
    setExpandedSellers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sellerName)) {
        newSet.delete(sellerName);
      } else {
        newSet.add(sellerName);
      }
      return newSet;
    });
  };

  const clearAllFilters = () => {
    setSelectedSeller('');
    setSelectedTemplate('');
    setStatusFilter('');
    setOriginFilter('');
    setSearchQuery('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = selectedSeller || selectedTemplate || statusFilter || originFilter || searchQuery;

  // Filter templates based on selected seller
  const filteredTemplates = selectedSeller
    ? templates.filter(t => 
        listings.some(l => l.templateId?._id === t._id && l.sellerId?._id === selectedSeller)
      )
    : templates;

  return (
    <Box>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Typography variant="h6">Template Listings Database</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={`Total: ${stats.total || 0}`} color="primary" variant="outlined" />
          <Chip label={`Sellers: ${stats.sellers || 0}`} variant="outlined" />
          <Chip label={`Templates: ${stats.templates || 0}`} variant="outlined" />
          {stats.csvListings > 0 && (
            <Chip label={`CSV Listings: ${stats.csvListings}`} size="small" color="info" variant="outlined" />
          )}
          {stats.directList > 0 && (
            <Chip label={`Direct List: ${stats.directList}`} size="small" color="secondary" variant="outlined" />
          )}
          {stats.draft > 0 && <Chip label={`Draft: ${stats.draft}`} size="small" />}
          {stats.active > 0 && <Chip label={`Active: ${stats.active}`} size="small" color="success" />}
        </Stack>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Listings" />
        <Tab label="Summary" />
      </Tabs>

      {activeTab === 1 && (
        <Box>
          {summaryError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSummaryError('')}>
              {summaryError}
            </Alert>
          )}
          {summaryLoading ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography>Loading summary...</Typography>
            </Paper>
          ) : summaryRows.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No listing data to summarize yet.</Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    {SUMMARY_SORT_COLUMNS.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.align}
                        sortDirection={summarySortBy === column.id ? summarySortOrder : false}
                        sx={{ fontWeight: 'bold' }}
                      >
                        <TableSortLabel
                          active={summarySortBy === column.id}
                          direction={summarySortBy === column.id ? summarySortOrder : 'asc'}
                          onClick={() => handleSummarySort(column.id)}
                          sx={{
                            justifyContent: column.align === 'right' ? 'flex-end' : 'flex-start',
                            width: column.align === 'right' ? '100%' : 'auto',
                            '& .MuiTableSortLabel-icon': {
                              opacity: summarySortBy === column.id ? 1 : 0.3,
                            },
                          }}
                        >
                          {column.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedSummaryRows.map((row) => (
                    <TableRow key={String(row.sellerId)} hover>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => openSellerInListings(row.sellerId)}
                          sx={{ textTransform: 'none', fontWeight: 600, px: 0 }}
                        >
                          {row.sellerName}
                        </Button>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="info"
                          disabled={!row.csvActive}
                          onClick={() => openSellerInListings(row.sellerId, { origin: 'template_listings', status: 'active' })}
                          sx={{ minWidth: 40 }}
                        >
                          {row.csvActive || 0}
                        </Button>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          disabled={!row.csvDraft}
                          onClick={() => openSellerInListings(row.sellerId, { origin: 'template_listings', status: 'draft' })}
                          sx={{ minWidth: 40 }}
                        >
                          {row.csvDraft || 0}
                        </Button>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          color="info"
                          variant="outlined"
                          label={row.csvTotal || 0}
                          onClick={row.csvTotal ? () => openSellerInListings(row.sellerId, { origin: 'template_listings' }) : undefined}
                          sx={{ cursor: row.csvTotal ? 'pointer' : 'default' }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          color="secondary"
                          variant="outlined"
                          label={row.directTotal || 0}
                          onClick={row.directTotal ? () => openSellerInListings(row.sellerId, { origin: 'direct_list' }) : undefined}
                          sx={{ cursor: row.directTotal ? 'pointer' : 'default' }}
                        />
                      </TableCell>
                      <TableCell align="right">{row.directDraft || 0}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold">{row.total || 0}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {summaryTotals && (
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>All sellers</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{summaryTotals.csvActive || 0}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{summaryTotals.csvDraft || 0}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{summaryTotals.csvTotal || 0}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{summaryTotals.directTotal || 0}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{summaryTotals.directDraft || 0}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{summaryTotals.total || 0}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {activeTab === 0 && (
      <>
      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          {/* Filter Controls */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Seller</InputLabel>
              <Select
                value={selectedSeller}
                onChange={(e) => {
                  setSelectedSeller(e.target.value);
                  setSelectedTemplate(''); // Reset template when seller changes
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                label="Seller"
              >
                <MenuItem value="">All Sellers</MenuItem>
                {sellers.map(seller => (
                  <MenuItem key={seller._id} value={seller._id}>
                    {seller.user?.username || seller.user?.email || 'Unknown'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Template</InputLabel>
              <Select
                value={selectedTemplate}
                onChange={(e) => {
                  setSelectedTemplate(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                label="Template"
              >
                <MenuItem value="">All Templates</MenuItem>
                {filteredTemplates.map(template => (
                  <MenuItem key={template._id} value={template._id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                label="Status"
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel>Source</InputLabel>
              <Select
                value={originFilter}
                onChange={(e) => {
                  setOriginFilter(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                label="Source"
              >
                <MenuItem value="">All Sources</MenuItem>
                <MenuItem value="template_listings">CSV Listings</MenuItem>
                <MenuItem value="direct_list">Direct List</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* Search Bar */}
          <TextField
            fullWidth
            placeholder="Search by ASIN, SKU, or Title..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />

          {/* Active Filters */}
          {hasActiveFilters && (
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
              <Typography variant="body2" color="text.secondary">Active filters:</Typography>
              {selectedSeller && (
                <Chip
                  label={`Seller: ${sellers.find(s => s._id === selectedSeller)?.user?.username || 'Unknown'}`}
                  onDelete={() => setSelectedSeller('')}
                  size="small"
                  color="primary"
                />
              )}
              {selectedTemplate && (
                <Chip
                  label={`Template: ${templates.find(t => t._id === selectedTemplate)?.name || 'Unknown'}`}
                  onDelete={() => setSelectedTemplate('')}
                  size="small"
                  color="primary"
                />
              )}
              {statusFilter && (
                <Chip
                  label={`Status: ${statusFilter}`}
                  onDelete={() => setStatusFilter('')}
                  size="small"
                  color="primary"
                />
              )}
              {originFilter && (
                <Chip
                  label={`Source: ${originFilter === 'direct_list' ? 'Direct List' : 'CSV Listings'}`}
                  onDelete={() => setOriginFilter('')}
                  size="small"
                  color="primary"
                />
              )}
              {searchQuery && (
                <Chip
                  label={`Search: "${searchQuery}"`}
                  onDelete={() => setSearchQuery('')}
                  size="small"
                  color="primary"
                />
              )}
              <Button size="small" onClick={clearAllFilters}>
                Clear All
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Loading listings...</Typography>
        </Paper>
      ) : Object.keys(groupedListings).length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {hasActiveFilters 
              ? 'No listings found matching your filters.' 
              : 'No listings found. Add listings from CSV Listings or Direct List to eBay.'}
          </Typography>
          {hasActiveFilters && (
            <Button onClick={clearAllFilters} sx={{ mt: 2 }}>
              Clear Filters
            </Button>
          )}
        </Paper>
      ) : (
        <Stack spacing={3}>
          {Object.entries(groupedListings).map(([sellerName, sellerListings]) => {
            const isExpanded = expandedSellers.has(sellerName);
            
            return (
              <Box key={sellerName}>
                {/* Seller Header */}
                <Paper 
                  sx={{ 
                    p: 2, 
                    mb: 1, 
                    bgcolor: 'primary.main', 
                    color: 'white',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'primary.dark' }
                  }}
                  onClick={() => toggleSeller(sellerName)}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={1}
                  >
                    <Typography variant="h6" fontWeight="bold">
                      {sellerName}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={`${sellerListings.length} listing${sellerListings.length !== 1 ? 's' : ''}`}
                        size="small"
                        sx={{ bgcolor: 'white', color: 'primary.main' }}
                      />
                      <IconButton size="small" sx={{ color: 'white' }}>
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Stack>
                  </Stack>
                </Paper>

                {/* Listings Content */}
                <Collapse in={isExpanded}>
                  {/* MOBILE: Card view */}
                  <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, mb: 2 }}>
                    {sellerListings.map((listing, index) => (
                      <Paper key={listing._id} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
                        <Stack spacing={1.5}>
                          {/* Row number */}
                          <Typography variant="caption" color="text.secondary" fontWeight="medium">
                            #{index + 1}
                          </Typography>

                          {/* ASIN */}
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                              ASIN:
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 'bold', color: 'primary.main' }}
                            >
                              {listing._asinReference || 'N/A'}
                            </Typography>
                            {listing._asinReference && (
                              <IconButton size="small" onClick={() => handleCopy(listing._asinReference)} title="Copy ASIN">
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            )}
                          </Stack>

                          {/* SKU */}
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                              SKU:
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                                bgcolor: 'grey.100',
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                fontWeight: 'medium'
                              }}
                            >
                              {listing.customLabel}
                            </Typography>
                            <IconButton size="small" onClick={() => handleCopy(listing.customLabel)} title="Copy SKU">
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>

                          {/* Amazon Link */}
                          {resolveSupplierLink(listing) && (
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                                Link:
                              </Typography>
                              <MuiLink
                                href={resolveSupplierLink(listing)}
                                target="_blank"
                                rel="noopener noreferrer"
                                underline="hover"
                                sx={{
                                  fontSize: '0.8rem',
                                  fontFamily: 'monospace',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '100%'
                                }}
                              >
                                {resolveSupplierLink(listing)}
                                <OpenInNewIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                              </MuiLink>
                              <IconButton size="small" onClick={() => handleCopy(resolveSupplierLink(listing))} title="Copy Link">
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                          )}

                          {/* Title */}
                          <Typography
                            variant="body2"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: 1.3,
                              fontSize: '0.85rem'
                            }}
                          >
                            {listing.title}
                          </Typography>

                          {/* Template, Source & Status */}
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                              label={listing.templateId?.name || 'N/A'}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.75rem' }}
                            />
                            {(() => {
                              const source = getListingSource(listing);
                              return (
                                <Chip
                                  label={source.label}
                                  size="small"
                                  color={source.color}
                                  variant="outlined"
                                  sx={{ fontSize: '0.75rem' }}
                                />
                              );
                            })()}
                            <Chip
                              label={listing.status || 'draft'}
                              size="small"
                              color={listing.status === 'active' ? 'success' : 'default'}
                              sx={{ fontSize: '0.75rem' }}
                            />
                          </Stack>

                          {/* Price & Quantity */}
                          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" color="text.secondary">
                              Amazon: <strong>{formatListingPrice(listing.amazonScrapedPrice)}</strong>
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              eBay: <strong>{formatListingPrice(listing.startPrice)}</strong>
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Qty: <strong>{listing.quantity || 0}</strong>
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Listed: <strong>{formatListedDate(listing.ebayPublishedAt)}</strong>
                            </Typography>
                          </Stack>

                          {/* Actions */}
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<VisibilityIcon />}
                            onClick={() => handleViewDetails(listing)}
                            fullWidth
                          >
                            View Details
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>

                  {/* DESKTOP: Table view */}
                  <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                    <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                          <TableCell sx={{ fontWeight: 'bold', width: 50 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 120 }}>ASIN</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 140 }}>SKU</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', minWidth: 300 }}>Link</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>Title</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Template</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Source</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Amazon</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 100 }}>eBay</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 80 }}>Qty</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', width: 150 }}>Listed</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', width: 100 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sellerListings.map((listing, index) => (
                          <TableRow key={listing._id} hover sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary" fontWeight="medium">
                                {index + 1}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.85rem',
                                  fontWeight: 'bold',
                                  color: 'primary.main'
                                }}
                              >
                                {listing._asinReference || 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem',
                                    bgcolor: 'grey.100',
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    fontWeight: 'medium'
                                  }}
                                >
                                  {listing.customLabel}
                                </Typography>
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(listing.customLabel)}
                                  title="Copy SKU"
                                >
                                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              {resolveSupplierLink(listing) ? (
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <MuiLink
                                    href={resolveSupplierLink(listing)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    underline="hover"
                                    sx={{
                                      fontSize: '0.8rem',
                                      fontFamily: 'monospace',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 0.5
                                    }}
                                  >
                                    {resolveSupplierLink(listing)}
                                    <OpenInNewIcon sx={{ fontSize: 14 }} />
                                  </MuiLink>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCopy(resolveSupplierLink(listing))}
                                    title="Copy Link"
                                  >
                                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Stack>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  lineHeight: 1.3,
                                  fontSize: '0.85rem'
                                }}
                              >
                                {listing.title}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={listing.templateId?.name || 'N/A'}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.75rem' }}
                              />
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const source = getListingSource(listing);
                                return (
                                  <Chip
                                    label={source.label}
                                    size="small"
                                    color={source.color}
                                    variant="outlined"
                                    sx={{ fontSize: '0.75rem' }}
                                  />
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium" color="text.secondary">
                                {formatListingPrice(listing.amazonScrapedPrice)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {formatListingPrice(listing.startPrice)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {listing.quantity || 0}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={listing.status || 'draft'}
                                size="small"
                                color={listing.status === 'active' ? 'success' : 'default'}
                                sx={{ fontSize: '0.75rem' }}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                {formatListedDate(listing.ebayPublishedAt)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <IconButton
                                  size="small"
                                  onClick={() => handleViewDetails(listing)}
                                  title="View Details"
                                  color="primary"
                                >
                                  <VisibilityIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                {listing._asinReference && (
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCopy(listing._asinReference)}
                                    title="Copy ASIN"
                                    color="primary"
                                  >
                                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={pagination.pages}
            page={pagination.page}
            onChange={(e, page) => setPagination(prev => ({ ...prev, page }))}
            color="primary"
          />
        </Box>
      )}
      </>
      )}

      {/* Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={handleCloseDetails}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="h6">Listing Details</Typography>
            <Stack direction="row" spacing={1}>
              {selectedListing && (() => {
                const source = getListingSource(selectedListing);
                return (
                  <Chip
                    label={source.label}
                    size="small"
                    color={source.color}
                    variant="outlined"
                  />
                );
              })()}
              <Chip 
                label={selectedListing?.status || 'draft'} 
                size="small" 
                color={selectedListing?.status === 'active' ? 'success' : 'default'}
              />
            </Stack>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          {selectedListing && (
            <Stack spacing={3}>
              {/* Basic Info */}
              <Box>
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                  Basic Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">ASIN</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {selectedListing._asinReference || 'N/A'}
                      </Typography>
                      {selectedListing._asinReference && (
                        <IconButton size="small" onClick={() => handleCopy(selectedListing._asinReference)}>
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                    </Stack>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">SKU (Custom Label)</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {selectedListing.customLabel}
                      </Typography>
                      <IconButton size="small" onClick={() => handleCopy(selectedListing.customLabel)}>
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Stack>
                  </Grid>
                  {resolveSupplierLink(selectedListing) && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Amazon Link</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <MuiLink 
                          href={resolveSupplierLink(selectedListing)} 
                          target="_blank" 
                          rel="noopener" 
                          variant="body2"
                          sx={{ wordBreak: 'break-all' }}
                        >
                          {resolveSupplierLink(selectedListing)}
                        </MuiLink>
                        <IconButton size="small" onClick={() => handleCopy(resolveSupplierLink(selectedListing))}>
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">Title</Typography>
                    <Typography variant="body2">{selectedListing.title}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Template</Typography>
                    <Typography variant="body2">{selectedListing.templateId?.name || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Seller</Typography>
                    <Typography variant="body2">
                      {selectedListing.sellerId?.user?.username || selectedListing.sellerId?.user?.email || 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Divider />

              {/* Product Details */}
              <Box>
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                  Product Details
                </Typography>
                <Grid container spacing={2}>
                  {selectedListing.conditionId && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Condition</Typography>
                      <Typography variant="body2">{selectedListing.conditionId}</Typography>
                    </Grid>
                  )}
                  {selectedListing.upc && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">UPC</Typography>
                      <Typography variant="body2">{selectedListing.upc}</Typography>
                    </Grid>
                  )}
                  {selectedListing.epid && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">EPID</Typography>
                      <Typography variant="body2">{selectedListing.epid}</Typography>
                    </Grid>
                  )}
                  {selectedListing.categoryName && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Category</Typography>
                      <Typography variant="body2">{selectedListing.categoryName}</Typography>
                    </Grid>
                  )}
                  {selectedListing.description && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Description</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          maxHeight: 150, 
                          overflowY: 'auto', 
                          p: 1, 
                          bgcolor: 'grey.50', 
                          borderRadius: 1,
                          fontSize: '0.8rem'
                        }}
                      >
                        {selectedListing.description.replace(/<[^>]*>/g, '')}
                      </Typography>
                    </Grid>
                  )}
                  {selectedListing.itemPhotoUrl && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Product Image</Typography>
                      <Box sx={{ mt: 1 }}>
                        <img 
                          src={selectedListing.itemPhotoUrl} 
                          alt="Product" 
                          style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4 }}
                        />
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>

              <Divider />

              {/* Pricing */}
              <Box>
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                  Pricing & Offers
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Amazon Price</Typography>
                    <Typography variant="body2" fontWeight="bold" color="text.secondary">
                      {formatListingPrice(selectedListing.amazonScrapedPrice)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">eBay Start Price</Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      {formatListingPrice(selectedListing.startPrice)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Quantity</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {selectedListing.quantity || 0}
                    </Typography>
                  </Grid>
                  {selectedListing.buyItNowPrice && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Buy It Now</Typography>
                      <Typography variant="body2">${selectedListing.buyItNowPrice.toFixed(2)}</Typography>
                    </Grid>
                  )}
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Format</Typography>
                    <Typography variant="body2">{selectedListing.format || 'FixedPrice'}</Typography>
                  </Grid>
                  {selectedListing.bestOfferEnabled && (
                    <>
                      <Grid item xs={12}>
                        <Chip label="Best Offer Enabled" size="small" color="info" />
                      </Grid>
                      {selectedListing.bestOfferAutoAcceptPrice && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Auto Accept Price</Typography>
                          <Typography variant="body2">${selectedListing.bestOfferAutoAcceptPrice.toFixed(2)}</Typography>
                        </Grid>
                      )}
                      {selectedListing.minimumBestOfferPrice && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Minimum Offer</Typography>
                          <Typography variant="body2">${selectedListing.minimumBestOfferPrice.toFixed(2)}</Typography>
                        </Grid>
                      )}
                    </>
                  )}
                </Grid>
              </Box>

              <Divider />

              {/* Shipping & Returns */}
              <Box>
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                  Shipping & Returns
                </Typography>
                <Grid container spacing={2}>
                  {selectedListing.location && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Location</Typography>
                      <Typography variant="body2">{selectedListing.location}</Typography>
                    </Grid>
                  )}
                  {selectedListing.maxDispatchTime && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Dispatch Time</Typography>
                      <Typography variant="body2">{selectedListing.maxDispatchTime} days</Typography>
                    </Grid>
                  )}
                  {selectedListing.shippingProfileName && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Shipping Profile</Typography>
                      <Typography variant="body2">{selectedListing.shippingProfileName}</Typography>
                    </Grid>
                  )}
                  {selectedListing.returnProfileName && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Return Profile</Typography>
                      <Typography variant="body2">{selectedListing.returnProfileName}</Typography>
                    </Grid>
                  )}
                  {selectedListing.returnsAcceptedOption && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Returns Accepted</Typography>
                      <Typography variant="body2">{selectedListing.returnsAcceptedOption}</Typography>
                    </Grid>
                  )}
                  {selectedListing.returnsWithinOption && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Return Within</Typography>
                      <Typography variant="body2">{selectedListing.returnsWithinOption}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Box>

              {/* Item Specifics */}
              {getCustomFieldEntries(selectedListing.customFields).length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                      Item Specifics
                    </Typography>
                    <Grid container spacing={2}>
                      {getCustomFieldEntries(selectedListing.customFields).map(([key, value]) => (
                        <Grid item xs={12} sm={6} key={key}>
                          <Typography variant="caption" color="text.secondary">
                            {key.replace('C:', '')}
                          </Typography>
                          <Typography variant="body2">{value}</Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </>
              )}

              {/* eBay Integration */}
              {(selectedListing.ebayItemId || selectedListing.ebayListingUrl) && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                      eBay Integration
                    </Typography>
                    <Grid container spacing={2}>
                      {selectedListing.ebayItemId && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">eBay Item ID</Typography>
                          <Typography variant="body2">{selectedListing.ebayItemId}</Typography>
                        </Grid>
                      )}
                      {selectedListing.ebayListingUrl && (
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary">eBay Listing URL</Typography>
                          <MuiLink href={selectedListing.ebayListingUrl} target="_blank" rel="noopener" variant="body2">
                            {selectedListing.ebayListingUrl}
                          </MuiLink>
                        </Grid>
                      )}
                      {selectedListing.ebayPublishedAt && (
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">Published At</Typography>
                          <Typography variant="body2">
                            {new Date(selectedListing.ebayPublishedAt).toLocaleString()}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                </>
              )}

              {/* Metadata */}
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                  Metadata
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Created At</Typography>
                    <Typography variant="body2" fontSize="0.85rem">
                      {new Date(selectedListing.createdAt).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Updated At</Typography>
                    <Typography variant="body2" fontSize="0.85rem">
                      {new Date(selectedListing.updatedAt).toLocaleString()}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseDetails} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
