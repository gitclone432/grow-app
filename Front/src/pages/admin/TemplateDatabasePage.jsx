import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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

function splitListingPhotoUrls(value) {
  return String(value || '')
    .split(/\s*\|\s*|\s*,\s*|\n+/)
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Prefer eBay publish time; fall back to when the row was created in DB. */
function listingListedAt(listing) {
  return listing?.ebayPublishedAt || listing?.createdAt || null;
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
  { id: 'directTotal', label: 'Direct List', align: 'right', numeric: true },
  { id: 'directDraft', label: 'Direct Draft', align: 'right', numeric: true },
  { id: 'total', label: 'Total', align: 'right', numeric: true },
];

const STORE_LISTINGS_PAGE_SIZE = 25;

function listingCreatorName(listing) {
  return listing?.createdBy?.username || listing?.createdBy?.email || '—';
}

function listingStoreName(listing) {
  return listing?.sellerId?.user?.username || listing?.sellerId?.user?.email || 'Unassigned';
}

/** Normalize Mongo ids that may arrive as string, ObjectId-like, or `{ _id }`. */
function normalizeEntityId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    if (value._id != null) return normalizeEntityId(value._id);
    if (value.$oid != null) return String(value.$oid);
  }
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null' || text === '[object Object]') return '';
  return text;
}

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
  const [dateMode, setDateMode] = useState('none'); // none | single | range
  const [dateSingle, setDateSingle] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [byUserSeller, setByUserSeller] = useState('');
  const [byUserTemplate, setByUserTemplate] = useState('');
  
  // Data state
  const [listings, setListings] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [creators, setCreators] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryTotals, setSummaryTotals] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summarySortBy, setSummarySortBy] = useState('total');
  const [summarySortOrder, setSummarySortOrder] = useState('desc');
  const [userSummaryRows, setUserSummaryRows] = useState([]);
  const [userSummaryTotals, setUserSummaryTotals] = useState(null);
  const [userSummaryLoading, setUserSummaryLoading] = useState(false);
  const [userSummaryError, setUserSummaryError] = useState('');
  const [userStoreRows, setUserStoreRows] = useState([]);
  const [userStoresLoading, setUserStoresLoading] = useState(false);
  const [userListingsTotal, setUserListingsTotal] = useState(0);
  const [userStoreListings, setUserStoreListings] = useState({}); // sellerId -> listings[]
  const [userStoreLoading, setUserStoreLoading] = useState({}); // sellerId -> bool
  const [userStorePageById, setUserStorePageById] = useState({}); // sellerId -> page (1-based)
  const [expandedUserStores, setExpandedUserStores] = useState(() => new Set());
  const [userListingCreatedSort, setUserListingCreatedSort] = useState('desc'); // desc = newest first
  
  // UI state
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Details dialog state
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [deletingListingId, setDeletingListingId] = useState('');
  const storeListingsRequestIdRef = useRef({});

  const sortedSummaryRows = useMemo(() => {
    return [...summaryRows].sort((a, b) =>
      compareSummaryRows(a, b, summarySortBy, summarySortOrder)
    );
  }, [summaryRows, summarySortBy, summarySortOrder]);

  const sortedUserSummaryRows = useMemo(() => {
    return [...userSummaryRows].sort((a, b) =>
      compareSummaryRows(a, b, summarySortBy, summarySortOrder)
    );
  }, [userSummaryRows, summarySortBy, summarySortOrder]);

  const sortedSellers = useMemo(() => {
    return [...sellers].sort((a, b) => {
      const left = String(a.user?.username || a.user?.email || '').toLowerCase();
      const right = String(b.user?.username || b.user?.email || '').toLowerCase();
      return left.localeCompare(right, undefined, { sensitivity: 'base' });
    });
  }, [sellers]);

  const summaryColumns = useMemo(
    () => SUMMARY_SORT_COLUMNS.map((col) => (col.id === 'sellerName' ? { ...col, label: 'Seller' } : col)),
    []
  );

  const userSummaryColumns = useMemo(
    () => SUMMARY_SORT_COLUMNS.map((col) => (col.id === 'sellerName' ? { ...col, label: 'User' } : col)),
    []
  );

  const sortedUserStoreListings = useMemo(() => {
    const direction = userListingCreatedSort === 'asc' ? 1 : -1;
    const sorted = {};
    Object.entries(userStoreListings).forEach(([sellerId, listings]) => {
      sorted[sellerId] = [...(listings || [])].sort((a, b) => {
        const left = new Date(a.createdAt || 0).getTime();
        const right = new Date(b.createdAt || 0).getTime();
        if (left === right) return String(a._id || '').localeCompare(String(b._id || ''));
        return (left - right) * direction;
      });
    });
    return sorted;
  }, [userStoreListings, userListingCreatedSort]);

  const selectedUserLabel = useMemo(() => {
    if (!selectedUser) return '';
    return (
      creators.find((u) => String(u._id) === String(selectedUser))?.username
      || creators.find((u) => String(u._id) === String(selectedUser))?.email
      || userSummaryRows.find((r) => String(r.userId) === String(selectedUser))?.sellerName
      || 'user'
    );
  }, [selectedUser, creators, userSummaryRows]);

  const selectedUserStats = useMemo(() => {
    if (!selectedUser) return null;
    const row = userSummaryRows.find((r) => String(r.userId) === String(selectedUser));
    if (row) return row;
    if (userSummaryTotals && userSummaryRows.length <= 1) return userSummaryTotals;
    return null;
  }, [selectedUser, userSummaryRows, userSummaryTotals]);

  const storeKey = (row) => {
    const id = normalizeEntityId(row?.sellerId);
    return id || 'unassigned';
  };

  const dateFilterParams = useMemo(() => {
    if (dateMode === 'single' && dateSingle) {
      return { startDate: dateSingle, endDate: dateSingle };
    }
    if (dateMode === 'range' && (dateFrom || dateTo)) {
      const params = {};
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      return params;
    }
    return {};
  }, [dateMode, dateSingle, dateFrom, dateTo]);

  const hasDateFilter = Boolean(dateFilterParams.startDate || dateFilterParams.endDate);

  const fetchStoreListings = useCallback(async (sellerId) => {
    if (!selectedUser) return;
    const key = normalizeEntityId(sellerId) || String(sellerId || 'unassigned');

    const requestId = (storeListingsRequestIdRef.current[key] || 0) + 1;
    storeListingsRequestIdRef.current[key] = requestId;
    setUserStoreLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const pageSize = 1000;
      const baseParams = {
        ...dateFilterParams,
        createdBy: selectedUser,
        sellerId: key,
        limit: pageSize,
        light: 1,
      };
      if (byUserTemplate) baseParams.templateId = byUserTemplate;

      const first = await api.get('/template-listings/database-view', {
        params: { ...baseParams, page: 1 },
      });
      if (storeListingsRequestIdRef.current[key] !== requestId) return;

      const total = first.data?.pagination?.total ?? (first.data?.listings || []).length;
      const pages = Math.max(1, first.data?.pagination?.pages || Math.ceil(total / pageSize) || 1);
      let all = [...(first.data?.listings || [])];

      if (pages > 1) {
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) =>
            api.get('/template-listings/database-view', {
              params: { ...baseParams, page: i + 2 },
            })
          )
        );
        if (storeListingsRequestIdRef.current[key] !== requestId) return;
        rest.forEach(({ data }) => {
          all = all.concat(data?.listings || []);
        });
      }

      setUserStoreListings((prev) => ({
        ...prev,
        [key]: all.map((listing) => ({ ...listing, _light: true })),
      }));
    } catch (err) {
      console.error('Error fetching store listings:', err);
      if (storeListingsRequestIdRef.current[key] !== requestId) return;
      setUserStoreListings((prev) => ({ ...prev, [key]: [] }));
      setError(err?.response?.data?.error || err.message || 'Failed to load store listings');
    } finally {
      if (storeListingsRequestIdRef.current[key] === requestId) {
        setUserStoreLoading((prev) => ({ ...prev, [key]: false }));
      }
    }
  }, [selectedUser, dateFilterParams, byUserTemplate]);

  const toggleUserStore = (key, expectedTotal = 0) => {
    const storeId = normalizeEntityId(key) || String(key || 'unassigned');
    const willExpand = !expandedUserStores.has(storeId);
    setExpandedUserStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
    if (!willExpand) return;

    setUserStorePageById((prev) => ({ ...prev, [storeId]: 1 }));
    const cached = userStoreListings[storeId];
    // Refetch when never loaded, or when badge says there are rows but cache is empty.
    if (!Array.isArray(cached) || (cached.length === 0 && Number(expectedTotal) > 0)) {
      void fetchStoreListings(storeId);
    }
  };

  const expandAllUserStores = () => {
    const keys = userStoreRows.map((row) => storeKey(row));
    setExpandedUserStores(new Set(keys));
    userStoreRows.forEach((row) => {
      const key = storeKey(row);
      const cached = userStoreListings[key];
      if (!Array.isArray(cached) || (cached.length === 0 && Number(row.total) > 0)) {
        void fetchStoreListings(key);
      }
    });
  };

  const collapseAllUserStores = () => {
    setExpandedUserStores(new Set());
  };

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
    fetchCreators();
  }, []);

  useEffect(() => {
    fetchStats();
  }, [dateFilterParams]);

  useEffect(() => {
    if (activeTab === 0) {
      fetchSummary();
    }
  }, [activeTab, dateFilterParams]);

  useEffect(() => {
    if (activeTab === 1) {
      fetchListings();
    }
  }, [selectedSeller, selectedTemplate, statusFilter, originFilter, searchQuery, pagination.page, activeTab, dateFilterParams]);

  useEffect(() => {
    if (activeTab === 2) {
      fetchUserSummary();
      if (selectedUser) {
        fetchUserStores();
      } else {
        setUserStoreRows([]);
        setUserListingsTotal(0);
        setUserStoreListings({});
        setUserStoreLoading({});
        setUserStorePageById({});
        setExpandedUserStores(new Set());
      }
    }
  }, [activeTab, dateFilterParams, selectedUser, byUserSeller, byUserTemplate]);

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

  const fetchCreators = async () => {
    try {
      const { data } = await api.get('/template-listings/database-creators');
      setCreators(data || []);
    } catch (err) {
      console.error('Error fetching creators:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/template-listings/database-stats', {
        params: dateFilterParams,
      });
      setStats(data || {});
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchSummary = async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const { data } = await api.get('/template-listings/database-summary', {
        params: { ...dateFilterParams, groupBy: 'seller' },
      });
      setSummaryRows(data.rows || []);
      setSummaryTotals(data.totals || null);
    } catch (err) {
      console.error('Error fetching summary:', err);
      setSummaryError('Failed to load summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchUserSummary = async () => {
    setUserSummaryLoading(true);
    setUserSummaryError('');
    try {
      const params = { ...dateFilterParams, groupBy: 'user' };
      if (selectedUser) params.createdBy = selectedUser;
      if (byUserSeller) params.sellerId = byUserSeller;
      if (byUserTemplate) params.templateId = byUserTemplate;
      const { data } = await api.get('/template-listings/database-summary', { params });
      setUserSummaryRows(data.rows || []);
      setUserSummaryTotals(data.totals || null);
    } catch (err) {
      console.error('Error fetching user summary:', err);
      setUserSummaryError('Failed to load user activity');
    } finally {
      setUserSummaryLoading(false);
    }
  };

  const fetchUserStores = async () => {
    if (!selectedUser) {
      setUserStoreRows([]);
      setUserListingsTotal(0);
      setUserStoreListings({});
      setUserStoreLoading({});
      setUserStorePageById({});
      setExpandedUserStores(new Set());
      return;
    }
    setUserStoresLoading(true);
    try {
      const params = {
        ...dateFilterParams,
        groupBy: 'seller',
        createdBy: selectedUser,
      };
      if (byUserSeller) params.sellerId = byUserSeller;
      if (byUserTemplate) params.templateId = byUserTemplate;
      const { data } = await api.get('/template-listings/database-summary', { params });
      const rows = data.rows || [];
      setUserStoreRows(rows);
      setUserListingsTotal(data.totals?.total || 0);
      // Invalidate in-flight store listing fetches from a previous selection/filter.
      storeListingsRequestIdRef.current = {};
      setUserStoreListings({});
      setUserStoreLoading({});
      setUserStorePageById({});
      setExpandedUserStores(new Set());
      // Single-store filter: open it immediately so the table appears without an extra click
      if (rows.length === 1) {
        const key = normalizeEntityId(rows[0]?.sellerId) || 'unassigned';
        setExpandedUserStores(new Set([key]));
        void fetchStoreListings(key);
      }
    } catch (err) {
      console.error('Error fetching user stores:', err);
      setUserStoreRows([]);
      setUserListingsTotal(0);
    } finally {
      setUserStoresLoading(false);
    }
  };

  const fetchListings = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...dateFilterParams,
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
    setSelectedUser('');
    setPagination((prev) => ({ ...prev, page: 1 }));
    setActiveTab(1);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleViewDetails = async (listing) => {
    setSelectedListing(listing);
    setDetailsDialogOpen(true);
    if (!listing?._id || !listing._light) return;
    try {
      const { data } = await api.get(`/template-listings/${listing._id}`);
      setSelectedListing(data);
    } catch (err) {
      console.error('Error loading listing details:', err);
    }
  };

  const handleCloseDetails = () => {
    setDetailsDialogOpen(false);
    setSelectedListing(null);
  };

  const handleDeleteListing = async (listing) => {
    if (!listing?._id) return;
    const label = [
      listing.customLabel || listing._asinReference || '',
      listing.title ? String(listing.title).slice(0, 80) : '',
    ].filter(Boolean).join(' · ') || String(listing._id);

    if (!window.confirm(`Delete this listing from the database?\n\n${label}\n\nThis cannot be undone.`)) {
      return;
    }

    const id = String(listing._id);
    setDeletingListingId(id);
    setError('');
    try {
      await api.delete(`/template-listings/${encodeURIComponent(id)}`);
      setListings((prev) => prev.filter((row) => String(row._id) !== id));
      setUserStoreListings((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          next[key] = (next[key] || []).filter((row) => String(row._id) !== id);
        });
        return next;
      });
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, (prev.total || 0) - 1),
      }));
      if (selectedListing && String(selectedListing._id) === id) {
        handleCloseDetails();
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to delete listing');
    } finally {
      setDeletingListingId('');
    }
  };

  const clearAllFilters = () => {
    setSelectedSeller('');
    setSelectedTemplate('');
    setStatusFilter('');
    setOriginFilter('');
    setSearchQuery('');
    setSelectedUser('');
    setByUserSeller('');
    setByUserTemplate('');
    setDateMode('none');
    setDateSingle('');
    setDateFrom('');
    setDateTo('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = selectedSeller || selectedTemplate || statusFilter || originFilter || searchQuery || hasDateFilter;

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
        sx={{ mb: 1.5 }}
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

      {/* Compact shared filters — date for both tabs; listing filters when Listings is active */}
      <Paper sx={{ px: 1.5, py: 1, mb: 1.5 }}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Created</InputLabel>
            <Select
              value={dateMode}
              label="Created"
              onChange={(e) => {
                const mode = e.target.value;
                setDateMode(mode);
                setDateSingle('');
                setDateFrom('');
                setDateTo('');
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            >
              <MenuItem value="none">All dates</MenuItem>
              <MenuItem value="single">Single day</MenuItem>
              <MenuItem value="range">Date range</MenuItem>
            </Select>
          </FormControl>

          {dateMode === 'single' && (
            <TextField
              size="small"
              type="date"
              label="Date"
              value={dateSingle}
              onChange={(e) => {
                setDateSingle(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
          )}

          {dateMode === 'range' && (
            <>
              <TextField
                size="small"
                type="date"
                label="From"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              <TextField
                size="small"
                type="date"
                label="To"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
            </>
          )}

          {activeTab === 2 && (
            <>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>User</InputLabel>
                <Select
                  value={selectedUser}
                  label="User"
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <MenuItem value="">All listers</MenuItem>
                  {creators.map((user) => (
                    <MenuItem key={user._id} value={String(user._id)}>
                      {user.username || user.email || 'Unknown'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Store</InputLabel>
                <Select
                  value={byUserSeller}
                  label="Store"
                  onChange={(e) => {
                    setByUserSeller(e.target.value);
                    setByUserTemplate('');
                  }}
                >
                  <MenuItem value="">All stores</MenuItem>
                  {sortedSellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {seller.user?.username || seller.user?.email || 'Unknown'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Template</InputLabel>
                <Select
                  value={byUserTemplate}
                  label="Template"
                  onChange={(e) => setByUserTemplate(e.target.value)}
                >
                  <MenuItem value="">All templates</MenuItem>
                  {templates.map((template) => (
                    <MenuItem key={template._id} value={template._id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {activeTab === 1 && (
            <>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Seller</InputLabel>
                <Select
                  value={selectedSeller}
                  onChange={(e) => {
                    setSelectedSeller(e.target.value);
                    setSelectedTemplate('');
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  label="Seller"
                >
                  <MenuItem value="">All Sellers</MenuItem>
                  {sortedSellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {seller.user?.username || seller.user?.email || 'Unknown'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Template</InputLabel>
                <Select
                  value={selectedTemplate}
                  onChange={(e) => {
                    setSelectedTemplate(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  label="Template"
                >
                  <MenuItem value="">All Templates</MenuItem>
                  {filteredTemplates.map((template) => (
                    <MenuItem key={template._id} value={template._id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  label="Status"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Source</InputLabel>
                <Select
                  value={originFilter}
                  onChange={(e) => {
                    setOriginFilter(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  label="Source"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="template_listings">CSV Listings</MenuItem>
                  <MenuItem value="direct_list">Direct List</MenuItem>
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="ASIN, SKU, or Title…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} />,
                }}
                sx={{ flex: '1 1 180px', minWidth: 160, maxWidth: 320 }}
              />
            </>
          )}

          {hasActiveFilters && (
            <Button size="small" onClick={clearAllFilters} sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
              Clear
            </Button>
          )}
        </Stack>
      </Paper>

      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        sx={{ mb: 1.5, minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, py: 0 } }}
      >
        <Tab label="Summary" />
        <Tab label="Listings" />
        <Tab label="By User" />
      </Tabs>

      {activeTab === 0 && (
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
                    {summaryColumns.map((column) => (
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

      {activeTab === 2 && (
        <Box>
          {userSummaryError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUserSummaryError('')}>
              {userSummaryError}
            </Alert>
          )}

          {!selectedUser ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Select a lister from the table or User filter to see store-level listings.
              </Typography>
              {userSummaryLoading ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography>Loading user activity...</Typography>
                </Paper>
              ) : userSummaryRows.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography color="text.secondary">No user listing activity for this filter.</Typography>
                </Paper>
              ) : (
                <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        {userSummaryColumns.map((column) => (
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
                            >
                              {column.label}
                            </TableSortLabel>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedUserSummaryRows.map((row) => (
                        <TableRow
                          key={String(row.userId)}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => setSelectedUser(String(row.userId || ''))}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{row.sellerName}</Typography>
                          </TableCell>
                          <TableCell align="right">{row.csvActive || 0}</TableCell>
                          <TableCell align="right">{row.csvDraft || 0}</TableCell>
                          <TableCell align="right">{row.directTotal || 0}</TableCell>
                          <TableCell align="right">{row.directDraft || 0}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold">{row.total || 0}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                      {userSummaryTotals && (
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 'bold' }}>All listers</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{userSummaryTotals.csvActive || 0}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{userSummaryTotals.csvDraft || 0}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{userSummaryTotals.directTotal || 0}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{userSummaryTotals.directDraft || 0}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{userSummaryTotals.total || 0}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          ) : (
            <Box>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => setSelectedUser('')}
                  >
                    All listers
                  </Button>
                  <Typography variant="h6" component="h2" sx={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    {selectedUserLabel}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${userListingsTotal} listings · ${userStoreRows.length} stores`}
                    variant="outlined"
                  />
                </Stack>
                {userStoreRows.length > 0 && (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={expandAllUserStores}>Expand all</Button>
                    <Button size="small" onClick={collapseAllUserStores}>Collapse all</Button>
                  </Stack>
                )}
              </Stack>

              {selectedUserStats && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  <Chip size="small" label={`Total: ${selectedUserStats.total || 0}`} />
                  <Chip size="small" label={`CSV: ${selectedUserStats.csvTotal || 0}`} variant="outlined" />
                  <Chip size="small" label={`Direct: ${selectedUserStats.directTotal || 0}`} variant="outlined" />
                  <Chip
                    size="small"
                    label={`Draft: ${
                      selectedUserStats.draft
                      ?? ((selectedUserStats.csvDraft || 0) + (selectedUserStats.directDraft || 0))
                    }`}
                  />
                  <Chip
                    size="small"
                    color="success"
                    label={`Active: ${
                      selectedUserStats.active
                      ?? ((selectedUserStats.csvActive || 0) + (selectedUserStats.directActive || 0))
                    }`}
                  />
                </Stack>
              )}

              {userSummaryLoading || userStoresLoading ? (
                <Paper sx={{ p: 2.5, textAlign: 'center' }}>
                  <Typography>Loading stores for {selectedUserLabel}...</Typography>
                </Paper>
              ) : userStoreRows.length === 0 ? (
                <Paper sx={{ p: 2.5, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    No listings for this user with the current filters.
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={0}>
                  {userStoreRows.map((row) => {
                    const key = storeKey(row);
                    const sellerName = row.sellerName || 'Unassigned';
                    const isExpanded = expandedUserStores.has(key);
                    const sellerListings = sortedUserStoreListings[key];
                    const isLoadingStore = Boolean(userStoreLoading[key]);
                    const storePage = Math.max(1, Number(userStorePageById[key]) || 1);
                    const storePageCount = sellerListings?.length
                      ? Math.max(1, Math.ceil(sellerListings.length / STORE_LISTINGS_PAGE_SIZE))
                      : 1;
                    const safeStorePage = Math.min(storePage, storePageCount);
                    const pagedSellerListings = Array.isArray(sellerListings)
                      ? sellerListings.slice(
                          (safeStorePage - 1) * STORE_LISTINGS_PAGE_SIZE,
                          safeStorePage * STORE_LISTINGS_PAGE_SIZE
                        )
                      : [];
                    return (
                      <Paper
                        key={key}
                        variant="outlined"
                        square
                        sx={{
                          borderRadius: 0,
                          borderBottom: 'none',
                          '&:first-of-type': { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
                          '&:last-of-type': {
                            borderBottom: (t) => `1px solid ${t.palette.divider}`,
                            borderBottomLeftRadius: 8,
                            borderBottomRightRadius: 8,
                          },
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          onClick={() => toggleUserStore(key, row.total || 0)}
                          sx={{
                            px: 1.5,
                            py: 1.25,
                            cursor: 'pointer',
                            userSelect: 'none',
                            bgcolor: isExpanded ? 'action.selected' : 'transparent',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle2" fontWeight={700}>
                              {sellerName}
                            </Typography>
                            <Chip size="small" label={row.total || 0} sx={{ height: 22, fontWeight: 600 }} />
                          </Stack>
                          <IconButton size="small" aria-label={isExpanded ? 'Collapse store' : 'Expand store'}>
                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Stack>
                        <Collapse in={isExpanded}>
                          {isLoadingStore || !sellerListings ? (
                            <Box sx={{ p: 2, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
                              <Typography variant="body2" color="text.secondary">
                                Loading listings…
                              </Typography>
                            </Box>
                          ) : sellerListings.length === 0 ? (
                            <Box sx={{ p: 2, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: Number(row.total) > 0 ? 1 : 0 }}>
                                {Number(row.total) > 0
                                  ? `No listings loaded for this store (expected ${row.total}).`
                                  : 'No listings in this store.'}
                              </Typography>
                              {Number(row.total) > 0 && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void fetchStoreListings(key);
                                  }}
                                >
                                  Retry load
                                </Button>
                              )}
                            </Box>
                          ) : (
                          <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
                          <TableContainer sx={{ overflowX: 'auto' }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.50' }}>
                                  <TableCell>ASIN</TableCell>
                                  <TableCell>SKU</TableCell>
                                  <TableCell>Title</TableCell>
                                  <TableCell>Template</TableCell>
                                  <TableCell>Source</TableCell>
                                  <TableCell>Status</TableCell>
                                  <TableCell sortDirection={userListingCreatedSort}>
                                    <TableSortLabel
                                      active
                                      direction={userListingCreatedSort}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setUserListingCreatedSort((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                                      }}
                                    >
                                      Created
                                    </TableSortLabel>
                                  </TableCell>
                                  <TableCell align="right">Actions</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {pagedSellerListings.map((listing) => (
                                  <TableRow key={listing._id} hover>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                      {listing._asinReference || '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                      {listing.customLabel}
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 280 }}>
                                      <Typography variant="body2" noWrap title={listing.title}>
                                        {listing.title}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        size="small"
                                        label={listing.templateId?.name || 'N/A'}
                                        variant="outlined"
                                        sx={{ fontSize: '0.75rem' }}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        size="small"
                                        label={getListingSource(listing).label}
                                        color={getListingSource(listing).color}
                                        variant="outlined"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Chip size="small" label={listing.status || '—'} />
                                    </TableCell>
                                    <TableCell>{formatListedDate(listing.createdAt)}</TableCell>
                                    <TableCell align="right">
                                      <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewDetails(listing);
                                          }}
                                          title="View Details"
                                          color="primary"
                                        >
                                          <VisibilityIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                          size="small"
                                          color="error"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDeleteListing(listing);
                                          }}
                                          title="Delete listing"
                                          disabled={deletingListingId === String(listing._id)}
                                        >
                                          <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                      </Stack>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          {sellerListings.length > STORE_LISTINGS_PAGE_SIZE && (
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 1,
                                py: 1.25,
                                borderTop: 1,
                                borderColor: 'divider',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Typography variant="caption" color="text.secondary">
                                {(safeStorePage - 1) * STORE_LISTINGS_PAGE_SIZE + 1}
                                –
                                {Math.min(safeStorePage * STORE_LISTINGS_PAGE_SIZE, sellerListings.length)}
                                {' of '}
                                {sellerListings.length}
                              </Typography>
                              <Pagination
                                size="small"
                                color="primary"
                                count={storePageCount}
                                page={safeStorePage}
                                onChange={(_, page) => {
                                  setUserStorePageById((prev) => ({ ...prev, [key]: page }));
                                }}
                              />
                            </Box>
                          )}
                          </Box>
                          )}
                        </Collapse>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}
        </Box>
      )}

      {activeTab === 1 && (
      <>
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
      ) : listings.length === 0 ? (
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
        <>
          {/* MOBILE: Card view */}
          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, mb: 2 }}>
            {listings.map((listing, index) => (
              <Paper key={listing._id} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
                <Stack spacing={1.5}>
                  <Typography variant="caption" color="text.secondary" fontWeight="medium">
                    #{(pagination.page - 1) * pagination.limit + index + 1}
                  </Typography>

                  <Typography variant="body2">
                    <Typography component="span" variant="caption" color="text.secondary">Store: </Typography>
                    <strong>{listingStoreName(listing)}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Listed: <strong>{formatListedDate(listingListedAt(listing))}</strong>
                  </Typography>

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
                      label={`User: ${listingCreatorName(listing)}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.75rem' }}
                    />
                    <Chip
                      label={listing.status || 'draft'}
                      size="small"
                      color={listing.status === 'active' ? 'success' : 'default'}
                      sx={{ fontSize: '0.75rem' }}
                    />
                  </Stack>

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
                  </Stack>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<VisibilityIcon />}
                      onClick={() => handleViewDetails(listing)}
                      fullWidth
                    >
                      View
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => void handleDeleteListing(listing)}
                      disabled={deletingListingId === String(listing._id)}
                      fullWidth
                    >
                      {deletingListingId === String(listing._id) ? 'Deleting…' : 'Delete'}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>

          {/* DESKTOP: Flat table */}
          <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
            <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold', width: 50 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Store</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 150 }}>Listed</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 120 }}>ASIN</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 140 }}>SKU</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 300 }}>Link</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Template</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 120 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Amazon</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 100 }}>eBay</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 80 }}>Qty</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', width: 120 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {listings.map((listing, index) => (
                  <TableRow key={listing._id} hover sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontWeight="medium">
                        {(pagination.page - 1) * pagination.limit + index + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                        {listingStoreName(listing)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formatListedDate(listingListedAt(listing))}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
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
                        {listing._asinReference && (
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(listing._asinReference)}
                            title="Copy ASIN"
                          >
                            <ContentCopyIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        )}
                      </Stack>
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
                      <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                        {listingCreatorName(listing)}
                      </Typography>
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
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                        <IconButton
                          size="small"
                          onClick={() => handleViewDetails(listing)}
                          title="View Details"
                          color="primary"
                        >
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void handleDeleteListing(listing)}
                          title="Delete listing"
                          disabled={deletingListingId === String(listing._id)}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
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
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Created by</Typography>
                    <Typography variant="body2">{listingCreatorName(selectedListing)}</Typography>
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
                  {selectedListing.itemPhotoUrl && (() => {
                    const photoUrls = splitListingPhotoUrls(selectedListing.itemPhotoUrl);
                    if (!photoUrls.length) return null;
                    return (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary">
                          Product Images ({photoUrls.length})
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ mt: 1 }}
                        >
                          {photoUrls.map((url, idx) => (
                            <Box
                              key={`${url}-${idx}`}
                              component="a"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                display: 'block',
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 1,
                                overflow: 'hidden',
                                bgcolor: 'grey.50',
                              }}
                            >
                              <Box
                                component="img"
                                src={url}
                                alt={`Product ${idx + 1}`}
                                sx={{
                                  width: 140,
                                  height: 140,
                                  objectFit: 'contain',
                                  display: 'block',
                                }}
                              />
                            </Box>
                          ))}
                        </Stack>
                      </Grid>
                    );
                  })()}
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
          {selectedListing?._id && (
            <Button
              color="error"
              variant="outlined"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => void handleDeleteListing(selectedListing)}
              disabled={deletingListingId === String(selectedListing._id)}
              sx={{ mr: 'auto' }}
            >
              {deletingListingId === String(selectedListing._id) ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button onClick={handleCloseDetails} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
