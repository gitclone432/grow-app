import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Paper, Typography, Button, CircularProgress, TextField,
  FormControl, InputLabel, Select, MenuItem, Chip, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Collapse, IconButton, Tooltip, Grid, Divider, Autocomplete,
  InputAdornment, Checkbox, ToggleButton, ToggleButtonGroup, Card, CardContent, CardActions
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import BuildIcon from '@mui/icons-material/Build';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import api from '../../lib/api';

const STATUS_CONFIG = {
  success: { label: 'Success', color: 'success', icon: <CheckCircleIcon fontSize="small" />, bg: '#f0fdf4' },
  warning: { label: 'Sent w/ Notes', color: 'success', icon: <WarningIcon fontSize="small" />, bg: '#f0fdf4' }, // Sent to eBay but eBay returned a non-fatal warning
  needs_manual: { label: 'Needs Manual', color: 'info', icon: <BuildIcon fontSize="small" />, bg: '#eff6ff' },
  ebay_error: { label: 'eBay Error', color: 'error', icon: <ErrorIcon fontSize="small" />, bg: '#fef2f2' },
  ai_failed: { label: 'AI Failed', color: 'default', icon: <SmartToyIcon fontSize="small" />, bg: '#f5f5f5' },
};

const STEP_LABELS = {
  ai_suggest: '🤖 AI analyzing listing...',
  fetching_models: '📋 Fetching models from eBay...',
  fetching_years: '📅 Fetching years from eBay...',
  fetching_trims: '🔧 Fetching trims & engines...',
  sending_to_ebay: '📤 Sending to eBay...',
  done: '✅ Complete',
};

const MANUAL_REVIEW_FILTERS = ['all', 'success', 'warning', 'needs_manual', 'ebay_error', 'ai_failed'];

// Get today in IST (YYYY-MM-DD)
const getTodayIST = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
};

// ======= HELPER FUNCTIONS FOR AI SUGGEST =======

// Make alias resolution (Chevy → Chevrolet, etc.) - MATCHES SERVER LOGIC
const MAKE_ALIASES = {
  'chevy': 'Chevrolet',
  'chev': 'Chevrolet',
  'vw': 'Volkswagen',
  'volkswagon': 'Volkswagen',
  'merc': 'Mercury',
  'benz': 'Mercedes-Benz',
  'mercedes': 'Mercedes-Benz',
  'alfa': 'Alfa Romeo',
  'land rover': 'Land Rover',
  'landrover': 'Land Rover',
  'range rover': 'Land Rover'
};

const resolveMake = (aiMake) => {
  if (!aiMake) return null;
  const lower = aiMake.toLowerCase().trim();
  return MAKE_ALIASES[lower] || aiMake;
};

// Model normalization - MATCHES SERVER LOGIC
const resolveModel = (make, aiModel) => {
  if (!aiModel) return null;
  const makeLower = (make || '').toLowerCase();
  const modelLower = aiModel.toLowerCase().trim();
  
  // Honda models
  if (makeLower === 'honda' && modelLower.includes('prologue')) return 'Prologue';
  if (makeLower === 'honda' && modelLower.includes('fit')) return 'Fit';
  
  // Ram models
  if (makeLower === 'ram' && modelLower.includes('classic')) return 'Classic';
  
  // Tesla models
  if (makeLower === 'tesla') {
    if (/model\s*3/i.test(aiModel)) return '3';
    if (/model\s*y/i.test(aiModel)) return 'Y';
  }
  
  // Jeep Wrangler variants
  if (makeLower === 'jeep' && /wrangler\s+j[a-z]/i.test(aiModel)) return 'Wrangler';
  
  // Ford F-series (remove/add dashes)
  if (modelLower.includes('f150') || modelLower.includes('f-150')) return 'F-150';
  if (modelLower.includes('f250') || modelLower.includes('f-250')) return 'F-250';
  if (modelLower.includes('f350') || modelLower.includes('f-350')) return 'F-350';
  
  // Toyota Land Cruiser
  if (makeLower === 'toyota' && modelLower.includes('land cruiser')) return 'Land Cruiser';
  
  // Chevrolet Silverado (default to 1500 if no number)
  if (modelLower.includes('silverado') && !/\d{4}/.test(modelLower)) return 'Silverado 1500';
  
  // BMW 3 Series
  if (makeLower === 'bmw' && modelLower.includes('3 series')) return '330i';
  
  return aiModel;
};

// Year-dependent model resolution
const resolveModelWithYear = (make, model, startYear, endYear) => {
  const makeLower = (make || '').toLowerCase();
  const modelNorm = (model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Ford F-250: before 1999 → "F-250", 1999+ → "F-250 Super Duty"
  if (makeLower === 'ford' && modelNorm === 'f250') {
    const end = Number(endYear);
    if (end && end < 1999) return 'F-250';
    return 'F-250 Super Duty';
  }
  return model;
};

// Fuzzy match model against eBay options (handles spacing differences)
const fuzzyMatchModel = (aiModel, ebayOptions) => {
  if (!aiModel) return null;
  const norm = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aiNorm = norm(aiModel);
  // Exact match first
  const exactMatch = ebayOptions.find(opt => norm(opt) === aiNorm);
  if (exactMatch) return exactMatch;
  // Partial match (e.g., "F150" matches "F-150")
  const partialMatch = ebayOptions.find(opt => norm(opt).includes(aiNorm) || aiNorm.includes(norm(opt)));
  return partialMatch || null;
};

// Clamp AI year ranges to known valid ranges
const clampYearRange = (make, model, startYear, endYear) => {
  if (!startYear || !endYear) return { startYear, endYear };
  const makeLower = (make || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();
  let start = Number(startYear);
  let end = Number(endYear);
  // Dodge Ram 1500 → 1994-2014
  if (makeLower === 'dodge' && /ram\s*1500/i.test(model)) {
    if (start < 1994) start = 1994;
    if (end > 2014) end = 2014;
    return { startYear: String(start), endYear: String(end) };
  }
  // Ram 1500/2500/3500 → 2011-2026
  if (makeLower === 'ram') {
    const numMatch = model.match(/(\d{4})/);
    if (numMatch && Number(numMatch[1]) >= 1500) {
      if (start < 2011) start = 2011;
      if (end > 2026) end = 2026;
      return { startYear: String(start), endYear: String(end) };
    }
  }
  return { startYear, endYear };
};

// Helper: Format vehicle string
const getVehicleString = (nameValueList) => {
  const year = nameValueList.find(x => x.name === 'Year')?.value || '';
  const make = nameValueList.find(x => x.name === 'Make')?.value || '';
  const model = nameValueList.find(x => x.name === 'Model')?.value || '';
  const extras = nameValueList.filter(x => !['Year', 'Make', 'Model'].includes(x.name)).map(x => `${x.name}: ${x.value}`).join(' | ');
  let mainString = `${year} ${make} ${model}`;
  if (extras) mainString += ` (${extras})`;
  return mainString.trim();
};

// Helper: trim key for uniqueness
const trimKey = (entry) => `${entry.trim}|||${entry.engine}`;

// Format a UTC timestamp for display in IST
const formatDateIST = (dateString) => {
  if (!dateString) return '\u2014';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(dateString));
};

export default function AutoCompatibilityPage() {
  const [sellers, setSellers] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]); // non-seller users for "By" filter
  const [sellerId, setSellerId] = useState('');
  const [targetDate, setTargetDate] = useState(getTodayIST());
  const [itemLimit, setItemLimit] = useState(''); // Empty = no limit
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Batch state
  const [batchId, setBatchId] = useState(null);
  const [batch, setBatch] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  // Results detail
  const [detailItem, setDetailItem] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  // Manual Review Mode
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewItem, setReviewItem] = useState(null);
  const [fullBatch, setFullBatch] = useState(null);
  const [editingCompat, setEditingCompat] = useState(false);
  
  // Compatibility Editor State
  const [makeOptions, setMakeOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [yearOptions, setYearOptions] = useState([]);
  const [trimsByYear, setTrimsByYear] = useState({});
  const [selectedMake, setSelectedMake] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedTrimsByYear, setSelectedTrimsByYear] = useState({});
  const [expandedYears, setExpandedYears] = useState({});
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingTrims, setLoadingTrims] = useState(false);
  const [sendingCompat, setSendingCompat] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [trimFilterKeyword, setTrimFilterKeyword] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // History
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilters, setHistoryFilters] = useState({
    listingDateMode: 'single',  // 'single' | 'range'
    listingDate: '',            // exact targetDate match (single mode)
    dateFrom: '',               // targetDate range start
    dateTo: '',                 // targetDate range end
    runOnMode: 'single',        // 'single' | 'range'
    runOnDate: '',              // exact createdAt day (single mode)
    runOnFrom: '',              // createdAt range start
    runOnTo: '',                // createdAt range end
    sellerFilter: '',
    triggeredByFilter: '',
    statusFilter: '',
    reviewedFilter: '', // '' | 'reviewed' | 'not_reviewed'
    page: 1,
    limit: 25,
  });

  // Bulk Review Summary
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  // End Listing confirmation dialog
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  // ── Current user role ────────────────────────────────────────────────────────
  const isSuperAdmin = (() => { try { return JSON.parse(localStorage.getItem('user'))?.role === 'superadmin'; } catch { return false; } })();

  // ── Run-All-Sellers mode ────────────────────────────────────────────────────
  const [runMode, setRunMode] = useState('all'); // 'single' | 'all'

  // allSellersRun: array of { sellerId, username, batchId, status, totalListings, reused? }
  const [allSellersRun, setAllSellersRun] = useState(null);
  // allBatchesData: { [batchId]: batch } — live-polled status for each batch in the run
  const [allBatchesData, setAllBatchesData] = useState({});
  const [allSellersRunning, setAllSellersRunning] = useState(false);
  const allBatchesPollRef = useRef(null);
  const [endingListing, setEndingListing] = useState(false);

  // Active (running) batches — fetched once on page open so users know what's in progress
  const [activeBatches, setActiveBatches] = useState([]);

  const fetchActiveBatches = async () => {
    try {
      const { data } = await api.get('/ebay/auto-compatibility-batches', {
        params: { status: 'running', limit: 50, page: 1 }
      });
      setActiveBatches(data.batches || []);
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data);
        if (data.length > 0) setSellerId(data[0]._id);
      } catch {
        try {
          const { data } = await api.get('/sellers/me');
          setSellers([data]);
          setSellerId(data._id);
        } catch (e) { console.error(e); }
      }
      // Fetch all non-seller users for the "By" filter
      try {
        const { data } = await api.get('/users');
        setStaffUsers((data || []).filter(u => u.role !== 'seller'));
      } catch { /* non-critical, ignore */ }
    };
    load();
    fetchActiveBatches();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (allBatchesPollRef.current) clearInterval(allBatchesPollRef.current);
    };
  }, []);

  // Load a specific batch from Review History page navigation
  useEffect(() => {
    const loadBatchId = sessionStorage.getItem('autoCompat_loadBatchId');
    if (loadBatchId) {
      sessionStorage.removeItem('autoCompat_loadBatchId');
      setBatchId(loadBatchId);
    }
  }, []);

  // Poll batch status
  useEffect(() => {
    if (!batchId) return;
    const poll = async () => {
      try {
        const { data } = await api.get(`/ebay/auto-compatibility-status/${batchId}`);
        setBatch(data);
        if (data.status !== 'running') {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) { console.error('Poll error:', e); }
    };
    poll(); // immediate first poll
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [batchId]);

  const handleStart = async () => {
    if (!sellerId || !targetDate) return;
    setStarting(true);
    setBatch(null);
    try {
      const { data } = await api.post('/ebay/auto-compatibility', {
        sellerId,
        targetDate,
        itemLimit: itemLimit === '' ? 0 : Number(itemLimit)
      });
      if (data.batchId) {
        setBatchId(data.batchId);
        setSnackbar({ open: true, message: `Started processing ${data.totalListings} listings`, severity: 'info' });
        fetchActiveBatches(); // refresh active batch list immediately
      } else {
        setSnackbar({ open: true, message: data.message || 'No listings found', severity: 'warning' });
      }
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed: ' + (e.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const loadHistory = async (overrides = {}) => {
    setHistoryLoading(true);
    try {
      const filters = { ...historyFilters, ...overrides };
      const params = { page: filters.page, limit: filters.limit };
      // Seller: use specific filter, or fall back to current seller in single mode
      if (filters.sellerFilter) params.sellerId = filters.sellerFilter;
      else if (runMode === 'single' && sellerId) params.sellerId = sellerId;
      // Triggered By
      if (filters.triggeredByFilter) params.triggeredBy = filters.triggeredByFilter;
      // Listing Date (targetDate)
      if (filters.listingDateMode === 'single') {
        if (filters.listingDate) params.listingDate = filters.listingDate;
      } else {
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
      }
      // Run On Date (createdAt)
      if (filters.runOnMode === 'single') {
        if (filters.runOnDate) params.runOnDate = filters.runOnDate;
      } else {
        if (filters.runOnFrom) params.runOnFrom = filters.runOnFrom;
        if (filters.runOnTo) params.runOnTo = filters.runOnTo;
      }
      // Status
      if (filters.statusFilter) params.status = filters.statusFilter;
      // Review
      if (filters.reviewedFilter === 'reviewed') params.manualReviewDone = 'true';
      const { data } = await api.get('/ebay/auto-compatibility-batches', { params });
      setHistory(data.batches || []);
      setHistoryTotal(data.total || 0);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const updateHistoryFilter = (key, value) => {
    const next = { ...historyFilters, [key]: value, page: 1 };
    setHistoryFilters(next);
    loadHistory({ ...next });
  };

  // Refresh a single batch's data in the single-seller state (used after bulk send)
  const fetchBatchData = async (id) => {
    try {
      const { data } = await api.get(`/ebay/auto-compatibility-status/${id}`);
      setBatch(data);
    } catch { /* ignore */ }
  };

  // ── Run-All-Sellers helpers ──────────────────────────────────────────────────

  const handleRunAllSellers = async () => {
    if (!targetDate) return;
    setAllSellersRunning(true);
    setAllSellersRun(null);
    setAllBatchesData({});
    if (allBatchesPollRef.current) clearInterval(allBatchesPollRef.current);

    try {
      const { data } = await api.post('/ebay/auto-compatibility/run-for-date', {
        targetDate,
        itemLimit: itemLimit === '' ? 0 : Number(itemLimit),
      });
      const runBatches = data.batches || [];
      setAllSellersRun(runBatches);
      // Seed with initial status
      const initial = {};
      runBatches.forEach(b => { if (b.batchId) initial[b.batchId] = { status: b.status, totalListings: b.totalListings }; });
      setAllBatchesData(initial);

      if (runBatches.length > 0) {
        setSnackbar({ open: true, message: `Processing ${runBatches.filter(b => b.status === 'running').length} seller(s) for ${targetDate}`, severity: 'info' });
        startAllBatchesPolling(runBatches.map(b => b.batchId).filter(Boolean));
      }
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed: ' + (e.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setAllSellersRunning(false);
    }
  };

  const startAllBatchesPolling = (batchIds) => {
    if (allBatchesPollRef.current) clearInterval(allBatchesPollRef.current);
    // Only poll batches that are still running — drop completed ones each cycle
    let pendingIds = [...batchIds];
    allBatchesPollRef.current = setInterval(async () => {
      if (pendingIds.length === 0) {
        clearInterval(allBatchesPollRef.current);
        allBatchesPollRef.current = null;
        return;
      }
      try {
        const { data } = await api.post('/ebay/auto-compatibility-status/bulk', { batchIds: pendingIds });
        const fresh = data.batches || {};
        // Merge into existing state (preserve completed batches already removed from pendingIds)
        setAllBatchesData(prev => ({ ...prev, ...fresh }));
        // Stop polling batches that finished this cycle
        pendingIds = pendingIds.filter(id => fresh[id]?.status === 'running');
        if (pendingIds.length === 0) {
          clearInterval(allBatchesPollRef.current);
          allBatchesPollRef.current = null;
        }
      } catch { /* ignore */ }
    }, 120000);
  };

  // Load the per-date batches when switching back to run-all mode for an existing date
  const reloadDateBatches = async (date) => {
    try {
      const { data } = await api.get('/ebay/auto-compatibility-batches-for-date', { params: { targetDate: date } });
      const batches = data.batches || [];
      if (batches.length === 0) return;
      const runRows = batches.map(b => ({
        sellerId: b.seller?._id,
        username: b.seller?.user?.username || b.seller?.user?.email,
        batchId: b._id,
        status: b.status,
        totalListings: b.totalListings,
        reused: true,
      }));
      setAllSellersRun(runRows);
      const initial = {};
      batches.forEach(b => { initial[b._id] = b; });
      setAllBatchesData(initial);
      const stillRunning = batches.some(b => b.status === 'running');
      if (stillRunning) startAllBatchesPolling(batches.map(b => b._id));
    } catch { /* ignore */ }
  };

  const handleViewHistoryBatch = async (id) => {
    setBatchId(id);
    setHistoryOpen(false);
  };

  // --- REVIEW MODE FUNCTIONS ---
  const startReviewMode = async (filter = statusFilter) => {
    if (!batchId || reviewLoading) return;
    setReviewLoading(true);
    setReviewMode(true);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewItem(null);
    try {
      const { data } = await api.get(`/ebay/auto-compatibility-batch/${batchId}`);
      setFullBatch(data);
      const needsReview = filter === 'all'
        ? data.items
        : data.items.filter(item => item.status === filter);
      
      if (needsReview.length === 0) {
        setReviewMode(false);
        setSnackbar({
          open: true,
          message: filter === 'all'
            ? 'No items in this batch'
            : `No ${STATUS_CONFIG[filter]?.label || filter} items in this batch`,
          severity: 'info'
        });
        return;
      }

      // Fetch full listing details for each item
      const enrichedItems = await Promise.all(
        needsReview.map(async (item) => {
          try {
            const { data: listing } = await api.get(`/ebay/listing/${item. itemId}`);
            return {
              ...item,
              ...listing, // Merge listing data (includes descriptionPreview, mainImageUrl, etc.)
              editCompatList: JSON.parse(JSON.stringify(item.compatibilityList || [])), // Working copy
              reviewStatus: 'pending' // Initialize review status
            };
          } catch (e) {
            console.error(`Failed to fetch listing ${item.itemId}:`, e);
            return {
              ...item,
              editCompatList: JSON.parse(JSON.stringify(item.compatibilityList || [])),
              reviewStatus: 'pending'
            };
          }
        })
      );

      setReviewItems(enrichedItems);
      setReviewIndex(0);
      setReviewItem(enrichedItems[0]);
      // Pre-load makes so the dropdown is ready immediately
      if (makeOptions.length === 0) fetchMakes();
    } catch (e) {
      setReviewMode(false);
      setSnackbar({ open: true, message: 'Failed to load batch: ' + (e.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReviewModeClose = (_, reason) => {
    if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
    setReviewMode(false);
  };

  const navigateReview = (direction) => {
    const newIndex = direction === 'next' ? reviewIndex + 1 : reviewIndex - 1;
    if (newIndex < 0 || newIndex >= reviewItems.length) return;

    // When moving forward, mark the current item as reviewed if still pending
    let currentItems = reviewItems;
    if (direction === 'next') {
      const currItem = reviewItems[reviewIndex];
      if (!currItem?.reviewStatus || currItem.reviewStatus === 'pending') {
        currentItems = [...reviewItems];
        currentItems[reviewIndex] = { ...currItem, reviewStatus: 'skipped' };
        setReviewItems(currentItems);
      }
    }

    const nextItem = currentItems[newIndex];
    setReviewIndex(newIndex);
    setReviewItem(nextItem);
    // Reset editor state
    setSelectedMake(null);
    setSelectedModel(null);
    setSelectedYears([]);
    setSelectedTrimsByYear({});
    setModelOptions([]);
    setYearOptions([]);
    setTrimsByYear({});
    setExpandedYears({});
    setTrimFilterKeyword('');
    setStartYear('');
    setEndYear('');
    setNewNotes('');
  };

  const removeExistingCompatibility = async () => {
    if (!reviewItem) return;
    const resolvedSellerId = fullBatch?.seller?._id || sellerId;
    if (!resolvedSellerId) {
      setSnackbar({ open: true, message: 'No seller selected', severity: 'error' });
      return;
    }

    try {
      // Delete from DB via eBay API
      await api.post('/ebay/update-compatibility', {
        sellerId: resolvedSellerId,
        itemId: reviewItem.itemId,
        sku: reviewItem.sku,
        compatibilityList: [],
        batchId: batchId || undefined
      });

      // Clear local state; reset reviewStatus to pending (not ended)
      const updated = { ...reviewItem, editCompatList: [], compatibilityList: [], reviewStatus: 'pending' };
      setReviewItem(updated);
      
      // Update in reviewItems array
      const updatedItems = [...reviewItems];
      updatedItems[reviewIndex] = updated;
      setReviewItems(updatedItems);
      
      setSnackbar({ open: true, message: 'Compatibility cleared from eBay. Item is back to pending.', severity: 'success' });
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to remove: ' + (e.response?.data?.error || e.message), severity: 'error' });
    }
  };

  // AI SUGGEST FITMENT
  const handleAiSuggest = async () => {
    if (!reviewItem || !sellerId) return;
    setAiLoading(true);
    setLoadingModels(true);
    try {
      const { data } = await api.post('/ai/suggest-fitment', {
        title: reviewItem.title || '',
        description: reviewItem.descriptionPreview || ''
      });
      if (!data.make) {
        setSnackbar({ open: true, message: 'AI could not extract fitment info from this listing', severity: 'warning' });
        setAiLoading(false);
        setLoadingModels(false);
        return;
      }

      // Step 1: Resolve Make alias (Chevy→Chevrolet etc.) then fetch models
      const resolvedMake = resolveMake(data.make);
      const resolvedModelStep1 = resolveModel(resolvedMake, data.model);
      const resolvedModelInput = resolveModelWithYear(resolvedMake, resolvedModelStep1, data.startYear, data.endYear);
      setSelectedMake(resolvedMake);
      setModelOptions([]);
      setSelectedModel(null);
      setYearOptions([]);
      setSelectedYears([]);
      setTrimsByYear({});
      setSelectedTrimsByYear({});
      setExpandedYears({});
      setStartYear('');
      setEndYear('');

      const modelsRes = await api.post('/ebay/compatibility/values', {
        sellerId,
        propertyName: 'Model',
        constraints: [{ name: 'Make', value: resolvedMake }]
      });
      const modelOpts = modelsRes.data.values || [];
      setModelOptions(modelOpts);
      setLoadingModels(false);

      // Fuzzy-match the AI model against eBay's list
      const resolvedModel = fuzzyMatchModel(resolvedModelInput, modelOpts);
      if (!resolvedModel) {
        setSnackbar({ open: true, message: `AI suggested model "${data.model}" not found in eBay DB for ${resolvedMake}. Please select manually.`, severity: 'warning' });
        setAiLoading(false);
        return;
      }

      // Step 2: Set resolved model and fetch years
      setSelectedModel(resolvedModel);
      setLoadingYears(true);
      setYearOptions([]);
      setSelectedYears([]);
      try {
        const yearsRes = await api.post('/ebay/compatibility/values', {
          sellerId,
          propertyName: 'Year',
          constraints: [
            { name: 'Make', value: resolvedMake },
            { name: 'Model', value: resolvedModel }
          ]
        });
        const yearList = (yearsRes.data.values || [])
          .map(y => String(y))
          .sort((a, b) => Number(b) - Number(a));
        setYearOptions(yearList);

        // Step 3: Apply year range
        if (data.startYear && data.endYear) {
          const clamped = clampYearRange(resolvedMake, resolvedModel, data.startYear, data.endYear);
          const startNum = Number(clamped.startYear);
          const endNum = Number(clamped.endYear);
          const min = Math.min(startNum, endNum);
          const max = Math.max(startNum, endNum);
          const range = yearList.filter(y => Number(y) >= min && Number(y) <= max);
          setSelectedYears(range);
          if (range.length > 0) {
            const rangeNums = range.map(Number);
            setStartYear(String(Math.min(...rangeNums)));
            setEndYear(String(Math.max(...rangeNums)));
          } else {
            setStartYear(data.startYear);
            setEndYear(data.endYear);
            setSnackbar({ open: true, message: `AI suggested ${data.make} ${resolvedModel} (${data.startYear}–${data.endYear}) but those years aren't in eBay's DB. Please select manually.`, severity: 'warning' });
            return;
          }
        }
      } finally {
        setLoadingYears(false);
      }
      setSnackbar({ open: true, message: `AI suggested: ${data.make} ${resolvedModel === data.model ? resolvedModel : `${resolvedModel} (matched from "${data.model}")`} — years verified in eBay DB`, severity: 'success' });
    } catch (e) {
      setSnackbar({ open: true, message: 'AI suggestion failed: ' + (e.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setLoadingModels(false);
      setAiLoading(false);
    }
  };

  // Handle Year Range Change
  const handleYearRangeChange = (start, end) => {
    if (!start || !end) {
      setSelectedYears([]);
      return;
    }
    const startNum = Number(start);
    const endNum = Number(end);
    const min = Math.min(startNum, endNum);
    const max = Math.max(startNum, endNum);
    const range = yearOptions.filter(y => Number(y) >= min && Number(y) <= max);
    setSelectedYears(range);
  };

  // Fetch Makes
  const fetchMakes = async () => {
    setLoadingMakes(true);
    try {
      const { data } = await api.post('/ebay/compatibility/values', { sellerId, propertyName: 'Make' });
      setMakeOptions(data.values || []);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load makes', severity: 'error' });
    } finally {
      setLoadingMakes(false);
    }
  };

  const selectMake = async (make) => {
    setSelectedMake(make);
    setSelectedModel(null);
    setSelectedYears([]);
    setModelOptions([]);
    setYearOptions([]);
    setTrimsByYear({});
    if (!make) return;

    setLoadingModels(true);
    try {
      const { data } = await api.post('/ebay/compatibility/values', {
        sellerId,
        propertyName: 'Model',
        constraints: [{ name: 'Make', value: make }]
      });
      setModelOptions(data.values || []);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load models', severity: 'error' });
    } finally {
      setLoadingModels(false);
    }
  };

  const selectModel = async (model) => {
    setSelectedModel(model);
    setSelectedYears([]);
    setYearOptions([]);
    setTrimsByYear({});
    if (!selectedMake || !model) return;

    setLoadingYears(true);
    try {
      const { data } = await api.post('/ebay/compatibility/values', {
        sellerId,
        propertyName: 'Year',
        constraints: [
          { name: 'Make', value: selectedMake },
          { name: 'Model', value: model }
        ]
      });
      setYearOptions(data.values || []);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load years', severity: 'error' });
    } finally {
      setLoadingYears(false);
    }
  };

  const toggleYear = (year) => {
    const isSelected = selectedYears.includes(year);
    if (isSelected) {
      setSelectedYears(selectedYears.filter(y => y !== year));
      const newTrims = { ...selectedTrimsByYear };
      delete newTrims[year];
      setSelectedTrimsByYear(newTrims);
    } else {
      setSelectedYears([...selectedYears, year]);
    }
  };

  // Auto-fetch trims when selected years change
  useEffect(() => {
    if (selectedMake && selectedModel && selectedYears.length > 0) {
      fetchTrims(selectedMake, selectedModel, selectedYears);
    } else {
      setTrimsByYear({});
      setSelectedTrimsByYear({});
    }
  }, [selectedYears, selectedMake, selectedModel]);

  const fetchTrims = async (makeVal, modelVal, years) => {
    if (!makeVal || !modelVal || !years || years.length === 0) {
      setTrimsByYear({});
      setSelectedTrimsByYear({});
      return;
    }
    setLoadingTrims(true);
    setTrimsByYear({});
    setSelectedTrimsByYear({});
    try {
      // Step 1: Fetch trim names for each year in parallel
      const trimPromises = years.map(year =>
        api.post('/ebay/compatibility/values', {
          sellerId,
          propertyName: 'Trim',
          constraints: [
            { name: 'Make', value: makeVal },
            { name: 'Model', value: modelVal },
            { name: 'Year', value: year }
          ]
        }).then(res => ({ year, trims: (res.data.values || []).sort() })).catch(() => ({ year, trims: [] }))
      );
      const trimResults = await Promise.all(trimPromises);

      // Step 2: For each (year, trim), fetch Engine values in parallel
      const enginePromises = [];
      trimResults.forEach(({ year, trims }) => {
        trims.forEach(trim => {
          enginePromises.push(
            api.post('/ebay/compatibility/values', {
              sellerId,
              propertyName: 'Engine',
              constraints: [
                { name: 'Make', value: makeVal },
                { name: 'Model', value: modelVal },
                { name: 'Year', value: year },
                { name: 'Trim', value: trim }
              ]
            }).then(res => ({ year, trim, engines: res.data.values || [] })).catch(() => ({ year, trim, engines: [] }))
          );
        });
      });
      const engineResults = await Promise.all(enginePromises);

      // Step 3: Build trimsByYear as { year: [{ trim, engine }, ...] }
      const byYear = {};
      engineResults.forEach(({ year, trim, engines }) => {
        if (!byYear[year]) byYear[year] = [];
        if (engines.length > 0) {
          engines.forEach(engine => byYear[year].push({ trim, engine }));
        } else {
          byYear[year].push({ trim, engine: '' });
        }
      });
      // Sort each year's entries by trim then engine
      Object.keys(byYear).forEach(y => {
        byYear[y].sort((a, b) => a.trim.localeCompare(b.trim) || a.engine.localeCompare(b.engine));
      });
      setTrimsByYear(byYear);
      // Auto-expand all years
      const expanded = {};
      Object.keys(byYear).forEach(y => { expanded[y] = true; });
      setExpandedYears(expanded);
    } catch (e) { console.error(e); }
    finally { setLoadingTrims(false); }
  };

  const fetchTrimsForYear = async (year) => {
    // Deprecated - now using fetchTrims for all years at once
    if (!selectedMake || !selectedModel) return;
    setLoadingTrims(true);
    try {
      const { data } = await api.post('/ebay/compatibility/values', {
        property: 'Trim',
        inputProperty: [
          { property: 'Make', value: selectedMake },
          { property: 'Model', value: selectedModel },
          { property: 'Year', value: year }
        ]
      });
      setTrimsByYear(prev => ({ ...prev, [year]: data.values || [] }));
    } catch (e) {
      console.error('Failed to load trims for year', year, e);
    } finally {
      setLoadingTrims(false);
    }
  };

  const toggleTrimForYear = (year, trim) => {
    const currentTrims = selectedTrimsByYear[year] || [];
    const isSelected = currentTrims.includes(trim);
    if (isSelected) {
      setSelectedTrimsByYear({
        ...selectedTrimsByYear,
        [year]: currentTrims.filter(t => t !== trim)
      });
    } else {
      setSelectedTrimsByYear({
        ...selectedTrimsByYear,
        [year]: [...currentTrims, trim]
      });
    }
  };

  const selectAllTrimsForYear = (year) => {
    const allTrims = trimsByYear[year] || [];
    setSelectedTrimsByYear({
      ...selectedTrimsByYear,
      [year]: [...allTrims]
    });
  };

  // Helper: Format vehicle string for modal list
  const getVehicleString = (nameValueList) => {
    const year = nameValueList.find(x => x.name === 'Year')?.value || '';
    const make = nameValueList.find(x => x.name === 'Make')?.value || '';
    const model = nameValueList.find(x => x.name === 'Model')?.value || '';
    const extras = nameValueList.filter(x => !['Year', 'Make', 'Model'].includes(x.name)).map(x => `${x.name}: ${x.value}`).join(' | ');
    let mainString = `${year} ${make} ${model}`;
    if (extras) mainString += ` (${extras})`;
    return mainString.trim();
  };

  const handleAddVehicle = () => {
    if (!selectedMake || !selectedModel || selectedYears.length === 0) {
      setSnackbar({ open: true, message: 'Please select Make, Model, and at least one Year', severity: 'warning' });
      return;
    }

    const newEntries = [];
    // Check if any trims are selected across any year
    const hasAnyTrimsSelected = Object.values(selectedTrimsByYear).some(arr => arr && arr.length > 0);
    
    for (const year of selectedYears) {
      const trimsForYear = selectedTrimsByYear[year];
      // If trims are selected somewhere but this specific year has none checked, skip it.
      // Only fall back to a generic (no-trim) entry when NO trims have been selected at all.
      const yearEntries = (hasAnyTrimsSelected && trimsForYear?.length > 0)
        ? trimsForYear
        : hasAnyTrimsSelected
          ? []      // trims selected elsewhere but not for this year → skip this year
          : [null]; // no trims selected anywhere → add year generically
      for (const entry of yearEntries) {
        const nameValueList = [
          { name: 'Year', value: year },
          { name: 'Make', value: selectedMake },
          { name: 'Model', value: selectedModel }
        ];
        if (entry) {
          // entry is {trim, engine}
          nameValueList.push({ name: 'Trim', value: entry.trim });
          if (entry.engine) nameValueList.push({ name: 'Engine', value: entry.engine });
        }
        newEntries.push({ notes: newNotes, nameValueList });
      }
    }

    const currentCompat = reviewItem?.editCompatList || [];
    const updatedCompat = [...currentCompat, ...newEntries];
    const updated = { ...reviewItem, editCompatList: updatedCompat };
    setReviewItem(updated);
    // Update in reviewItems array
    const updatedItems = [...reviewItems];
    updatedItems[reviewIndex] = updated;
    setReviewItems(updatedItems);
    setSnackbar({ open: true, message: `Added ${newEntries.length} vehicle(s)`, severity: 'success' });
    
    // Reset selections
    setNewNotes('');
    setSelectedTrimsByYear({});
    setSelectedYears([]);
    setSelectedTrimsByYear({});
    setModelOptions([]);
    setYearOptions([]);
    setTrimsByYear({});
  };

  const handleRemoveVehicle = (index) => {
    const updated = reviewItem.editCompatList.filter((_, i) => i !== index);
    const updatedItem = { ...reviewItem, editCompatList: updated };
    setReviewItem(updatedItem);
    // Update in reviewItems array
    const updatedItems = [...reviewItems];
    updatedItems[reviewIndex] = updatedItem;
    setReviewItems(updatedItems);
  };

  const sendNewCompatibility = async () => {
    if (!reviewItem) return;
    const resolvedSellerId = fullBatch?.seller?._id || sellerId;
    if (!resolvedSellerId) return;

    setSendingCompat(true);
    try {
      await api.post('/ebay/update-compatibility', {
        sellerId: resolvedSellerId,
        itemId: reviewItem.itemId,
        sku: reviewItem.sku,
        compatibilityList: reviewItem.editCompatList || [],
        batchId: batchId || undefined
      });

      setSnackbar({ open: true, message: 'Compatibility sent to eBay successfully!', severity: 'success' });
      // Update the item's actual compatibility after successful send
      const updated = { ...reviewItem, compatibilityList: reviewItem.editCompatList };
      setReviewItem(updated);
      const updatedItems = [...reviewItems];
      updatedItems[reviewIndex] = updated;
      setReviewItems(updatedItems);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to update: ' + (e.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setSendingCompat(false);
    }
  };

  // BULK REVIEW FUNCTIONS
  const markItemStatus = (status) => {
    if (!reviewItem) return;
    const updated = { ...reviewItem, reviewStatus: status };
    setReviewItem(updated);
    const updatedItems = [...reviewItems];
    updatedItems[reviewIndex] = updated;
    setReviewItems(updatedItems);
    
    const statusLabels = { correct: 'Marked as Correct', ended: 'Marked for End Listing' };
    setSnackbar({ open: true, message: statusLabels[status] || 'Status updated', severity: 'info' });
  };

  const handleSkip = () => {
    if (!reviewItem) return;
    // Mark current item as skipped
    const updatedItems = [...reviewItems];
    updatedItems[reviewIndex] = { ...reviewItem, reviewStatus: 'skipped' };
    setReviewItems(updatedItems);
    // Navigate to next inline (avoids stale closure issue)
    const newIndex = reviewIndex + 1;
    if (newIndex < reviewItems.length) {
      setReviewIndex(newIndex);
      const nextItem = updatedItems[newIndex];
      setReviewItem(nextItem);
      setSelectedMake(null); setSelectedModel(null); setSelectedYears([]);
      setSelectedTrimsByYear({}); setModelOptions([]); setYearOptions([]);
      setTrimsByYear({}); setExpandedYears({}); setTrimFilterKeyword('');
      setStartYear(''); setEndYear(''); setNewNotes('');
    } else {
      setReviewItem(updatedItems[reviewIndex]);
    }
  };

  const finishReview = () => {
    // Save manual review counts immediately (even if 0 correct)
    if (batchId) {
      const correctCount = reviewItems.filter(i => i.reviewStatus === 'correct').length;
      const skippedCount = reviewItems.filter(i => i.reviewStatus === 'skipped').length;
      const endedCount = reviewItems.filter(i => i.reviewStatus === 'ended').length;
      api.patch(`/ebay/auto-compatibility-batch/${batchId}/review-summary`, {
        correctCount, skippedCount, endedCount
      }).catch(() => {});
    }
    setSummaryOpen(true);
  };

  const handleEndListing = () => {
    if (!reviewItem) return;
    // Must know whose seller token to use — prefer the batch's own seller, fall back to state
    const resolvedSellerId = fullBatch?.seller?._id || sellerId;
    if (!resolvedSellerId) return;
    setConfirmEndOpen(true);
  };

  const confirmEndListing = async () => {
    setConfirmEndOpen(false);
    setEndingListing(true);
    // Use the batch's own seller record as source of truth to avoid token mismatch
    const resolvedSellerId = fullBatch?.seller?._id || sellerId;
    try {
      await api.post('/ebay/end-item', {
        sellerId: resolvedSellerId,
        itemId: reviewItem.itemId,
        endingReason: 'NotAvailable'
      });

      setSnackbar({ open: true, message: 'Listing ended successfully on eBay', severity: 'success' });

      // Mark as ended and move to next inline (avoids stale closure issue)
      const endedItems = [...reviewItems];
      endedItems[reviewIndex] = { ...reviewItem, reviewStatus: 'ended' };
      setReviewItems(endedItems);
      if (reviewIndex < reviewItems.length - 1) {
        const newIndex = reviewIndex + 1;
        setReviewIndex(newIndex);
        const nextItem = endedItems[newIndex];
        setReviewItem(nextItem);
        setSelectedMake(null); setSelectedModel(null); setSelectedYears([]);
        setSelectedTrimsByYear({}); setModelOptions([]); setYearOptions([]);
        setTrimsByYear({}); setExpandedYears({}); setTrimFilterKeyword('');
        setStartYear(''); setEndYear(''); setNewNotes('');
      } else {
        setReviewItem(endedItems[reviewIndex]);
      }
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to end listing: ' + (e.response?.data?.error || e.message), severity: 'error' });
    } finally {
      setEndingListing(false);
    }
  };

  const bulkSendToEbay = async () => {
    const itemsToSend = reviewItems.filter(item => item.reviewStatus === 'correct');
    if (itemsToSend.length === 0) {
      setSnackbar({ open: true, message: 'No items marked as correct to send', severity: 'warning' });
      return;
    }

    setBulkSending(true);
    let successCount = 0;
    let warningCount = 0;
    let failCount = 0;

    const resolvedSellerId = fullBatch?.seller?._id || sellerId;
    for (const item of itemsToSend) {
      try {
        const { data } = await api.post('/ebay/update-compatibility', {
          sellerId: resolvedSellerId,
          itemId: item.itemId,
          sku: item.sku,
          compatibilityList: item.editCompatList || [],
          batchId: batchId || undefined
        });
        
        // Check if eBay returned warnings (e.g., duplicate resolved, etc.)
        if (data.warning) {
          warningCount++;
          console.log(`Warning for ${item.itemId}: ${data.warning}`);
        } else {
          successCount++;
        }
      } catch (e) {
        console.error(`Failed to send ${item.itemId}:`, e);
        failCount++;
      }
    }

    // Save manual review action counts to the batch record
    if (batchId) {
      const correctCount = reviewItems.filter(i => i.reviewStatus === 'correct').length;
      const skippedCount = reviewItems.filter(i => i.reviewStatus === 'skipped').length;
      const endedCount = reviewItems.filter(i => i.reviewStatus === 'ended').length;
      api.patch(`/ebay/auto-compatibility-batch/${batchId}/review-summary`, {
        correctCount, skippedCount, endedCount
      }).catch(() => {});
    }

    setBulkSending(false);
    setSummaryOpen(false);
    setReviewMode(false);

    if (failCount === 0 && warningCount === 0) {
      setSnackbar({ 
        open: true, 
        message: `Successfully sent ${successCount} item${successCount > 1 ? 's' : ''} to eBay!`, 
        severity: 'success' 
      });
    } else if (failCount > 0) {
      setSnackbar({ 
        open: true, 
        message: `Sent ${successCount + warningCount} items (${warningCount} with warnings), ${failCount} failed`, 
        severity: 'warning' 
      });
    } else {
      // Only warnings, no failures
      setSnackbar({ 
        open: true, 
        message: `Sent ${successCount + warningCount} items successfully! ${warningCount} had eBay warnings (e.g., duplicate listings auto-resolved)`, 
        severity: 'info' 
      });
    }

    // Refresh batch data
    if (batchId) {
      fetchBatchData(batchId);
    }
  };

  const progress = batch ? (batch.processedCount / Math.max(batch.totalListings, 1)) * 100 : 0;
  const isRunning = batch?.status === 'running';
  const isComplete = batch?.status === 'completed' || batch?.status === 'failed';
  const selectedSeller = sellers.find(s => s._id === sellerId);
  const selectedSellerLabel = selectedSeller?.user?.username || selectedSeller?.user?.email || '—';
  const activeBatchSellerLabel = batch?.seller?.user?.username || batch?.seller?.user?.email || selectedSellerLabel;

  const filteredItems = (batch?.items || []).filter(item =>
    statusFilter === 'all' || item.status === statusFilter
  );
  const manualReviewCount = statusFilter === 'all' ? (batch?.items?.length || 0) : filteredItems.length;
  const manualReviewLabel = statusFilter === 'all' ? 'Manual Review All' : `Review ${STATUS_CONFIG[statusFilter]?.label || statusFilter}`;

  // Render trims section helper
  function renderTrimsSection() {
    if (!selectedModel || Object.keys(trimsByYear).length === 0) return null;

    const totalTrims = Object.values(trimsByYear).reduce((sum, arr) => sum + arr.length, 0);
    const totalSelected = Object.values(selectedTrimsByYear).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    const allSelected = totalSelected === totalTrims && totalTrims > 0;

    // Filter trims based on keyword
    const filterKeywordLower = trimFilterKeyword.toLowerCase().trim();
    const getFilteredTrims = (entries) => {
      if (!filterKeywordLower) return entries;
      return entries.filter(entry =>
        (entry.trim || '').toLowerCase().includes(filterKeywordLower) ||
        (entry.engine || '').toLowerCase().includes(filterKeywordLower)
      );
    };

    const filteredTrimsByYear = {};
    Object.entries(trimsByYear).forEach(([year, entries]) => {
      const filtered = getFilteredTrims(entries);
      if (filtered.length > 0) {
        filteredTrimsByYear[year] = filtered;
      }
    });

    const totalFilteredTrims = Object.values(filteredTrimsByYear).reduce((sum, arr) => sum + arr.length, 0);
    const allFilteredSelected = (() => {
      if (totalFilteredTrims === 0) return false;
      let selectedCount = 0;
      Object.entries(filteredTrimsByYear).forEach(([year, entries]) => {
        const yearSelected = selectedTrimsByYear[year] || [];
        const yearSelectedKeys = new Set(yearSelected.map(trimKey));
        entries.forEach(entry => {
          if (yearSelectedKeys.has(trimKey(entry))) selectedCount++;
        });
      });
      return selectedCount === totalFilteredTrims;
    })();

    return (
      <Grid item xs={12}>
        <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: '#fafafa' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={totalSelected > 0 && !allSelected}
                onChange={() => {
                  if (allSelected) {
                    setSelectedTrimsByYear({});
                  } else {
                    const all = {};
                    Object.entries(trimsByYear).forEach(([y, entries]) => { all[y] = [...entries]; });
                    setSelectedTrimsByYear(all);
                  }
                }}
              />
              <Typography variant="body2" fontWeight="bold">
                Select all {totalTrims} vehicle trims
              </Typography>
            </Box>
            <Typography variant="caption" color="textSecondary">
              {totalSelected} selected
            </Typography>
          </Box>
          {/* Filter Section */}
          <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', bgcolor: '#fff' }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Filter trims by keyword (e.g., Sport, Utility, HD)..."
                value={trimFilterKeyword}
                onChange={(e) => setTrimFilterKeyword(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: trimFilterKeyword && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setTrimFilterKeyword('')}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              {trimFilterKeyword && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (allFilteredSelected) {
                      const updated = { ...selectedTrimsByYear };
                      Object.entries(filteredTrimsByYear).forEach(([year, entries]) => {
                        const yearSelected = updated[year] || [];
                        const filteredKeys = new Set(entries.map(trimKey));
                        updated[year] = yearSelected.filter(e => !filteredKeys.has(trimKey(e)));
                      });
                      setSelectedTrimsByYear(updated);
                    } else {
                      const updated = { ...selectedTrimsByYear };
                      Object.entries(filteredTrimsByYear).forEach(([year, entries]) => {
                        const yearSelected = updated[year] || [];
                        const yearSelectedKeys = new Set(yearSelected.map(trimKey));
                        const toAdd = entries.filter(e => !yearSelectedKeys.has(trimKey(e)));
                        updated[year] = [...yearSelected, ...toAdd];
                      });
                      setSelectedTrimsByYear(updated);
                    }
                  }}
                  sx={{ whiteSpace: 'nowrap', minWidth: 'auto' }}
                >
                  {allFilteredSelected ? 'Deselect' : 'Select'} Filtered ({totalFilteredTrims})
                </Button>
              )}
            </Box>
            {trimFilterKeyword && (
              <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                Showing {totalFilteredTrims} of {totalTrims} trims
              </Typography>
            )}
          </Box>
          {/* Year rows */}
          <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
            {selectedYears
              .sort((a, b) => Number(b) - Number(a))
              .filter(year => trimFilterKeyword ? filteredTrimsByYear[year]?.length > 0 : (trimsByYear[year] && trimsByYear[year].length > 0))
              .map(year => {
                const yearEntries = trimFilterKeyword ? (filteredTrimsByYear[year] || []) : (trimsByYear[year] || []);
                const yearSelected = selectedTrimsByYear[year] || [];
                const yearSelectedKeys = new Set(yearSelected.map(trimKey));
                const isExpanded = expandedYears[year] || false;
                const allYearSelected = yearSelected.length === yearEntries.length && yearEntries.length > 0;
                return (
                  <Box key={year}>
                    <Box
                      sx={{
                        display: 'flex', alignItems: 'center', px: 1.5, py: 1,
                        borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                        '&:hover': { bgcolor: '#f5f5f5' },
                        bgcolor: isExpanded ? '#f0f0f0' : 'transparent'
                      }}
                      onClick={() => setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }))}
                    >
                      <IconButton size="small" sx={{ mr: 0.5 }}>
                        {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                      <Checkbox
                        size="small"
                        checked={allYearSelected}
                        indeterminate={yearSelected.length > 0 && !allYearSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => {
                          setSelectedTrimsByYear(prev => ({
                            ...prev,
                            [year]: allYearSelected ? [] : [...yearEntries]
                          }));
                        }}
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="body2" fontWeight="bold" sx={{ flex: 1 }}>
                        {selectedMake} {selectedModel} {year}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {yearEntries.length} available
                      </Typography>
                    </Box>
                    <Collapse in={isExpanded}>
                      <Box sx={{ pl: 5 }}>
                        <Box sx={{ display: 'flex', borderBottom: '2px solid #e0e0e0', py: 0.5, px: 1 }}>
                          <Box sx={{ width: 40 }} />
                          <Typography variant="caption" fontWeight="bold" sx={{ flex: 1, color: '#555' }}>Trim</Typography>
                          <Typography variant="caption" fontWeight="bold" sx={{ flex: 1, color: '#555' }}>Engine</Typography>
                        </Box>
                        {yearEntries.map((entry, idx) => {
                          const key = trimKey(entry);
                          const isChecked = yearSelectedKeys.has(key);
                          return (
                            <Box
                              key={`${year}-${key}-${idx}`}
                              sx={{
                                display: 'flex', alignItems: 'center', py: 0.5, px: 1,
                                borderBottom: '1px solid #f5f5f5',
                                '&:hover': { bgcolor: '#f5f5f5' }
                              }}
                            >
                              <Checkbox
                                size="small"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedTrimsByYear(prev => {
                                    const current = prev[year] || [];
                                    const currentKeys = new Set(current.map(trimKey));
                                    const updated = currentKeys.has(key)
                                      ? current.filter(e => trimKey(e) !== key)
                                      : [...current, entry];
                                    return { ...prev, [year]: updated };
                                  });
                                }}
                                sx={{ mr: 1, p: 0.25 }}
                              />
                              <Typography variant="body2" sx={{ flex: 1, fontSize: '0.85rem' }}>
                                {entry.trim}
                              </Typography>
                              <Typography variant="body2" sx={{ flex: 1, fontSize: '0.8rem', color: '#666' }}>
                                {entry.engine || '—'}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
          </Box>
        </Box>
      </Grid>
    );
  }

  // Disable the Run button if ANY batch is currently running (any seller, any date)
  const hasConflict = activeBatches.length > 0;

  return (
    <Box sx={{ p: 3 }}>
      {/* HEADER */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>⚡ Auto Compatibility</Typography>
          <Typography variant="body2" color="textSecondary">
            Automatically add fitment data to eBay Motors listings using AI
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <ToggleButtonGroup
            value={runMode}
            exclusive
            onChange={(_, val) => { if (val) setRunMode(val); }}
            size="small"
          >
            <ToggleButton value="single" sx={{ textTransform: 'none', px: 2 }}>Single Seller</ToggleButton>
            <ToggleButton value="all" sx={{ textTransform: 'none', px: 2 }}>All Sellers</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            size="small"
            onClick={() => { setHistoryOpen(true); loadHistory(); }}
          >
            View History
          </Button>
        </Box>
      </Box>

      {/* Active batches banner */}
      {activeBatches.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={fetchActiveBatches}>Refresh</Button>
          }
        >
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
            {activeBatches.length} batch{activeBatches.length !== 1 ? 'es' : ''} currently running
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            {activeBatches.map(b => (
              <Chip
                key={b._id}
                size="small"
                label={
                  `${b.seller?.user?.username || 'Unknown'} — ${b.targetDate}${
                    b.triggeredBy?.username ? ` (by ${b.triggeredBy.username})` : ''
                  }`
                }
                color="warning"
                variant="outlined"
                onClick={() => setBatchId(b._id)}
                sx={{ cursor: 'pointer', fontWeight: 600 }}
              />
            ))}
          </Box>
        </Alert>
      )}

      {/* CONTROLS */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        {runMode === 'single' ? (
          /* ─── SINGLE SELLER MODE ─────────────────────────────────────────── */
          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Seller</InputLabel>
              <Select value={sellerId} label="Seller" onChange={e => setSellerId(e.target.value)}>
                {sellers.map(s => (
                  <MenuItem key={s._id} value={s._id}>{s.user?.username || s.user?.email}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              type="date"
              label="Listing Date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              sx={{ minWidth: 160 }}
            />

            <TextField
              type="number"
              label="Item Limit"
              size="small"
              placeholder="All items"
              value={itemLimit}
              onChange={e => {
                const val = e.target.value;
                if (val === '') { setItemLimit(''); return; }
                const n = parseInt(val);
                if (!isNaN(n) && n >= 0) setItemLimit(n);
              }}
              inputProps={{ min: 1 }}
              sx={{ width: 130 }}
              helperText={itemLimit === '' || itemLimit === 0 ? 'All items' : `First ${itemLimit}`}
            />

            <Tooltip
              title={hasConflict ? `${activeBatches.length} batch${activeBatches.length !== 1 ? 'es are' : ' is'} currently running. Wait for ${activeBatches.length !== 1 ? 'them' : 'it'} to finish or click the chip above to monitor.` : ''}
              arrow
              disableHoverListener={!hasConflict}
            >
              <span>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={starting ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                  onClick={handleStart}
                  disabled={starting || isRunning || hasConflict || !sellerId || !targetDate}
                  sx={{
                    bgcolor: hasConflict ? '#d97706' : '#7c3aed',
                    '&:hover': { bgcolor: hasConflict ? '#b45309' : '#6d28d9' },
                    '&.Mui-disabled': { bgcolor: '#e5e7eb', color: '#9ca3af' },
                    fontWeight: 700, px: 4, borderRadius: 2,
                    textTransform: 'none', fontSize: '1rem'
                  }}
                >
                  {starting ? 'Starting...' : isRunning ? 'Running...' : hasConflict ? 'Already Running' : 'Run Auto-Compatibility'}
                </Button>
              </span>
            </Tooltip>
          </Box>
        ) : (
          /* ─── ALL SELLERS MODE ───────────────────────────────────────────── */
          <Box>
            <Box display="flex" gap={2} alignItems="flex-start" flexWrap="wrap" mb={2}>
              <TextField
                type="date"
                label="Listing Date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={targetDate}
                onChange={e => {
                  setTargetDate(e.target.value);
                  setAllSellersRun(null);
                  setAllBatchesData({});
                  if (allBatchesPollRef.current) { clearInterval(allBatchesPollRef.current); allBatchesPollRef.current = null; }
                }}
                sx={{ minWidth: 160 }}
              />

              <TextField
                type="number"
                label="Item Limit"
                size="small"
                placeholder="All items"
                value={itemLimit}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '') { setItemLimit(''); return; }
                  const n = parseInt(val);
                  if (!isNaN(n) && n >= 0) setItemLimit(n);
                }}
                inputProps={{ min: 1 }}
                sx={{ width: 130 }}
                helperText={itemLimit === '' || itemLimit === 0 ? 'All items' : `First ${itemLimit}`}
              />

              <Button
                variant="contained"
                size="large"
                startIcon={allSellersRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                onClick={handleRunAllSellers}
                disabled={allSellersRunning || !targetDate}
                sx={{
                  bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' },
                  fontWeight: 700, px: 4, borderRadius: 2,
                  textTransform: 'none', fontSize: '1rem'
                }}
              >
                {allSellersRunning ? 'Starting...' : 'Run All Sellers for Date'}
              </Button>

              {targetDate && !allSellersRun && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => reloadDateBatches(targetDate)}
                  sx={{ alignSelf: 'center' }}
                >
                  Load Existing Batches for Date
                </Button>
              )}
            </Box>


          </Box>
        )}
      </Paper>

      {/* ALL-SELLERS DASHBOARD */}
      {runMode === 'all' && allSellersRun && (
        <Box mb={3}>
          <Typography variant="h6" fontWeight={600} mb={2}>
            📋 Sellers — {targetDate}
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap">
            {allSellersRun.map((row) => {
              const bd = row.batchId ? allBatchesData[row.batchId] : null;
              const status = bd?.status || row.status;
              const total = bd?.totalListings ?? row.totalListings ?? 0;
              const processed = bd?.processedCount ?? 0;
              const needsManual = bd?.needsManualCount ?? 0;
              const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
              const isRunning = status === 'running';
              const isComplete = status === 'completed' || status === 'failed';
              const borderColor = isRunning ? '#7c3aed' : status === 'completed' ? '#22c55e' : status === 'failed' ? '#ef4444' : '#e0e0e0';

              return (
                <Card key={row.sellerId} sx={{ minWidth: 260, maxWidth: 320, border: `2px solid ${borderColor}`, borderRadius: 2 }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ maxWidth: 180 }}>
                        {row.username || '—'}
                      </Typography>
                      <Chip
                        label={status === 'skipped' ? 'No items' : status}
                        size="small"
                        color={status === 'completed' ? 'success' : status === 'running' ? 'warning' : status === 'failed' ? 'error' : 'default'}
                      />
                    </Box>
                    {row.reason === 'no_listings' ? (
                      <Typography variant="caption" color="textSecondary">No listings without compatibility on this date.</Typography>
                    ) : row.batchId ? (
                      <>
                        <LinearProgress
                          variant={isRunning ? 'indeterminate' : 'determinate'}
                          value={pct}
                          sx={{ height: 6, borderRadius: 3, mb: 1, '& .MuiLinearProgress-bar': { bgcolor: '#7c3aed' } }}
                        />
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          <Chip label={`${processed}/${total}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          {bd?.successCount > 0 && <Chip label={`✅ ${bd.successCount + (bd.warningCount || 0)}`} size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />}
                          {needsManual > 0 && <Chip label={`🔧 ${needsManual} manual`} size="small" color="info" sx={{ height: 20, fontSize: '0.7rem' }} />}
                          {bd?.ebayErrorCount > 0 && <Chip label={`❌ ${bd.ebayErrorCount}`} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />}
                          {bd?.manualReviewDone && <Chip label="✓ Reviewed" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />}
                        </Box>
                        {isRunning && bd?.currentItemTitle && (
                          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }} noWrap>
                            {bd.currentItemTitle}
                          </Typography>
                        )}
                      </>
                    ) : null}
                  </CardContent>
                  {row.batchId && isComplete && (
                    <CardActions sx={{ pt: 0, pb: 1, px: 2, gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setRunMode('single');
                          setSellerId(row.sellerId);
                          setBatchId(row.batchId);
                          setBatch(allBatchesData[row.batchId] || null);
                        }}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        View Results
                      </Button>
                      {needsManual > 0 && !bd?.manualReviewDone && (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => {
                            setRunMode('single');
                            setSellerId(row.sellerId);
                            setBatchId(row.batchId);
                            setBatch(allBatchesData[row.batchId] || null);
                            setStatusFilter('needs_manual');
                          }}
                          sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          Review ({needsManual})
                        </Button>
                      )}
                    </CardActions>
                  )}
                </Card>
              );
            })}
          </Box>

          {/* "Review Next" sequential helper */}
          {allSellersRun.some(r => {
            const bd = r.batchId ? allBatchesData[r.batchId] : null;
            return bd?.status === 'completed' && (bd?.needsManualCount || 0) > 0 && !bd?.manualReviewDone;
          }) && (
            <Box mt={2}>
              <Button
                variant="contained"
                startIcon={<BuildIcon />}
                onClick={() => {
                  const next = allSellersRun.find(r => {
                    const bd = r.batchId ? allBatchesData[r.batchId] : null;
                    return bd?.status === 'completed' && (bd?.needsManualCount || 0) > 0 && !bd?.manualReviewDone;
                  });
                  if (next) {
                    setRunMode('single');
                    setSellerId(next.sellerId);
                    setBatchId(next.batchId);
                    setBatch(allBatchesData[next.batchId] || null);
                    setStatusFilter('needs_manual');
                  }
                }}
                sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, textTransform: 'none' }}
              >
                Review Next Seller with Pending Manual
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* LIVE PROGRESS */}
      {batch && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: isRunning ? '2px solid #7c3aed' : '1px solid #e0e0e0' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              {isRunning && <CircularProgress size={18} sx={{ color: '#7c3aed' }} />}
              <Typography variant="h6" fontWeight={600}>
                {isRunning ? 'Processing...' : batch.status === 'completed' ? '✅ Completed' : '❌ Failed'}
              </Typography>
              <Chip
                label={`${batch.processedCount} / ${batch.totalListings}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Box>
            <Typography variant="caption" color="textSecondary">
              Date: {batch.targetDate} | {batch.itemLimit > 0 ? `Limit: ${batch.itemLimit}` : 'No limit'}
            </Typography>
          </Box>

          <Box display="flex" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label={`Seller: ${activeBatchSellerLabel}`} size="small" variant="outlined" />
            <Chip label={`Listing Date: ${batch.targetDate || targetDate}`} size="small" variant="outlined" />
          </Box>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 8, borderRadius: 4, mb: 2,
              '& .MuiLinearProgress-bar': { bgcolor: '#7c3aed', borderRadius: 4 }
            }}
          />

          {/* Current step */}
          {isRunning && batch.currentItemTitle && (
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2, fontStyle: 'italic' }}>
              {STEP_LABELS[batch.currentStep] || batch.currentStep} — {batch.currentItemTitle}
            </Typography>
          )}

          {/* Summary counters */}
          <Box display="flex" gap={1.5} flexWrap="wrap">
            <Chip
              icon={<CheckCircleIcon />}
              label={`${(batch.successCount || 0) + (batch.warningCount || 0)} Success`}
              color="success"
              size="small"
            />
            <Chip icon={<BuildIcon />} label={`${batch.needsManualCount || 0} Manual`} color="info" size="small" />
            <Chip icon={<ErrorIcon />} label={`${batch.ebayErrorCount || 0} eBay Error`} color="error" size="small" />
            <Chip icon={<SmartToyIcon />} label={`${batch.aiFailedCount || 0} AI Failed`} size="small" />
          </Box>
        </Paper>
      )}

      {/* RESULTS TABLE */}
      {isComplete && batch?.items?.length > 0 && (
        <Paper sx={{ borderRadius: 2 }}>
          {/* Filters */}
          <Box sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'center', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ mr: 1 }}>Filter:</Typography>
            {MANUAL_REVIEW_FILTERS.map(f => (
              <Chip
                key={f}
                label={f === 'all' ? `All (${batch.items.length})` : `${STATUS_CONFIG[f]?.label} (${batch.items.filter(i => i.status === f).length})`}
                size="small"
                variant={statusFilter === f ? 'filled' : 'outlined'}
                color={f === 'all' ? 'primary' : STATUS_CONFIG[f]?.color || 'default'}
                onClick={() => setStatusFilter(f)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
            <Chip label={`Seller: ${activeBatchSellerLabel}`} size="small" variant="outlined" />
            <Chip label={`Date: ${batch.targetDate || targetDate}`} size="small" variant="outlined" />
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              size="small"
              startIcon={reviewLoading ? <CircularProgress size={16} color="inherit" /> : <BuildIcon />}
              onClick={() => startReviewMode(statusFilter)}
              disabled={reviewLoading}
              sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
            >
              {reviewLoading ? 'Loading Review...' : `${manualReviewLabel} (${manualReviewCount})`}
            </Button>
          </Box>

          <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', minWidth: 300 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Item ID</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', minWidth: 200 }}>
                    AI Suggestion → eBay Match
                    <Typography variant="caption" display="block" sx={{ fontWeight: 'normal', color: 'text.secondary' }}>
                      (AI's suggestion vs. matched in eBay DB)
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Reason / Error / Notes</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item, idx) => {
                  const cfg = STATUS_CONFIG[item.status] || {};
                  return (
                    <TableRow key={item.itemId || idx} sx={{ bgcolor: cfg.bg || 'inherit' }} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <Chip
                          icon={cfg.icon}
                          label={cfg.label}
                          size="small"
                          color={cfg.color || 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{item.itemId}</Typography>
                      </TableCell>
                      <TableCell>
                        {item.aiSuggestion?.make && (
                          <Box>
                            <Typography variant="caption" display="block">
                              AI: {item.aiSuggestion.make} {item.aiSuggestion.model}
                              {item.aiSuggestion.startYear && ` (${item.aiSuggestion.startYear}–${item.aiSuggestion.endYear})`}
                            </Typography>
                            {item.resolvedMake && (
                              <Typography variant="caption" display="block" color="primary">
                                → {item.resolvedMake} {item.resolvedModel}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography 
                          variant="caption" 
                          color={
                            (item.status === 'success' || item.status === 'warning') && item.ebayWarning
                              ? 'warning.dark'
                              : item.status === 'success' || item.status === 'warning'
                              ? 'success.main'
                              : item.ebayWarning ? 'info.main' : 'error.main'
                          }
                          sx={{ maxWidth: 250, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {item.failureReason || item.ebayError || item.ebayWarning || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => setDetailItem(item)}>
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={!!detailItem} onClose={() => setDetailItem(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ borderBottom: '1px solid #eee' }}>
          <Typography variant="h6" fontWeight={600}>Item Details</Typography>
          <Typography variant="body2" color="textSecondary">{detailItem?.title}</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {detailItem && (
            <Box>
              <Box display="flex" gap={2} mb={2} flexWrap="wrap">
                <Chip label={`Status: ${STATUS_CONFIG[detailItem.status]?.label}`} color={STATUS_CONFIG[detailItem.status]?.color || 'default'} />
                <Chip label={`Item ID: ${detailItem.itemId}`} variant="outlined" />
                {detailItem.sku && <Chip label={`SKU: ${detailItem.sku}`} variant="outlined" />}
              </Box>

              {detailItem.aiSuggestion?.make && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>AI Suggestion</Typography>
                  <Typography variant="body2">
                    Make: <b>{detailItem.aiSuggestion.make}</b> | Model: <b>{detailItem.aiSuggestion.model}</b> |
                    Years: <b>{detailItem.aiSuggestion.startYear || '?'}–{detailItem.aiSuggestion.endYear || '?'}</b>
                  </Typography>
                  {detailItem.resolvedMake && (
                    <Typography variant="body2" color="primary" sx={{ mt: 0.5 }}>
                      Resolved → {detailItem.resolvedMake} {detailItem.resolvedModel}
                    </Typography>
                  )}
                  {detailItem.aiSuggestion.allFitments?.length > 1 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="textSecondary">All AI fitments found:</Typography>
                      {detailItem.aiSuggestion.allFitments.map((f, i) => (
                        <Typography key={i} variant="caption" display="block">
                          • {f.make} {f.model} {f.startYear && `(${f.startYear}–${f.endYear})`}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </Paper>
              )}

              {detailItem.failureReason && (
                <Alert severity="warning" sx={{ mb: 2 }}>{detailItem.failureReason}</Alert>
              )}
              {detailItem.ebayError && (
                <Alert severity="error" sx={{ mb: 2 }}>{detailItem.ebayError}</Alert>
              )}
              {detailItem.ebayWarning && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <strong>eBay Note:</strong> {detailItem.ebayWarning}
                </Alert>
              )}

              {detailItem.compatibilityList?.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Compatibility Sent ({detailItem.compatibilityList.length} entries)
                    {detailItem.strippedCount > 0 && (
                      <Chip label={`${detailItem.strippedCount} stripped`} size="small" color="warning" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {detailItem.compatibilityList.slice(0, 50).map((c, i) => (
                      <Typography key={i} variant="caption" display="block">
                        {c.nameValueList?.map(nv => nv.value).join(' | ')}
                      </Typography>
                    ))}
                    {detailItem.compatibilityList.length > 50 && (
                      <Typography variant="caption" color="textSecondary">...and {detailItem.compatibilityList.length - 50} more</Typography>
                    )}
                  </Box>
                </Paper>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailItem(null)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      {/* MANUAL REVIEW MODAL */}
      <Dialog 
        open={reviewMode} 
        onClose={handleReviewModeClose}
        disableEscapeKeyDown
        maxWidth="xl" 
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
          <Box>
            {reviewItem?.aiSuggestion?.make && (
              <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmartToyIcon sx={{ fontSize: 14, color: '#7c3aed' }} />
                <Typography variant="caption" fontWeight={700} sx={{ color: '#7c3aed' }}>
                  AI Suggestion: {reviewItem.aiSuggestion.make} {reviewItem.aiSuggestion.model} ({reviewItem.aiSuggestion.startYear || '?'}–{reviewItem.aiSuggestion.endYear || '?'})
                </Typography>
                {reviewItem.resolvedMake && (
                  <Chip label={`→ ${reviewItem.resolvedMake} ${reviewItem.resolvedModel}`} color="primary" size="small" sx={{ height: 20 }} />
                )}
              </Box>
            )}
            {reviewItem?.status && (
              <Box sx={{ mb: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip 
                  icon={STATUS_CONFIG[reviewItem.status]?.icon} 
                  label={STATUS_CONFIG[reviewItem.status]?.label} 
                  color={STATUS_CONFIG[reviewItem.status]?.color} 
                  size="small" 
                />
                {reviewItem.reviewStatus && reviewItem.reviewStatus !== 'pending' && (
                  <Chip
                    label={
                      reviewItem.reviewStatus === 'correct' ? '✓ Marked Correct' :
                      reviewItem.reviewStatus === 'skipped' ? '→ Reviewed/Skipped' :
                      reviewItem.reviewStatus === 'ended' ? '⨯ Ended' : reviewItem.reviewStatus
                    }
                    color={
                      reviewItem.reviewStatus === 'correct' ? 'success' :
                      reviewItem.reviewStatus === 'skipped' ? 'warning' : 'error'
                    }
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                {reviewItem.failureReason && (
                  <Typography variant="caption" color="error" sx={{ ml: 1 }}>
                    ⚠️ {reviewItem.failureReason}
                  </Typography>
                )}
                {reviewItem.ebayWarning && (
                  <Typography variant="caption" color="info.main" sx={{ ml: 1 }}>
                    ℹ️ {reviewItem.ebayWarning}
                  </Typography>
                )}
              </Box>
            )}
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '1.3rem' }}>
              {reviewItem?.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" color="textSecondary">ID: {reviewItem?.itemId}</Typography>
              {reviewItem?.sku && <Chip label={`SKU: ${reviewItem.sku}`} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', gap: 0.5, mr: 2 }}>
              <Chip 
                label={`✓ ${reviewItems.filter(i => i.reviewStatus === 'correct').length} correct`} 
                size="small" 
                color="success" 
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
              <Chip 
                label={`→ ${reviewItems.filter(i => i.reviewStatus === 'skipped').length} skip`} 
                size="small" 
                color="warning" 
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
              <Chip 
                label={`⨯ ${reviewItems.filter(i => i.reviewStatus === 'ended').length} end`} 
                size="small" 
                color="error" 
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
              <Chip 
                label={`⊘ ${reviewItems.filter(i => !i.reviewStatus || i.reviewStatus === 'pending').length} pending`} 
                size="small" 
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
            </Box>
            <Typography variant="caption" sx={{ mr: 1 }}>
              {reviewIndex + 1} / {reviewItems.length}
            </Typography>
            <IconButton size="small" onClick={() => navigateReview('prev')} disabled={reviewIndex === 0} title="Previous">
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton size="small" onClick={() => navigateReview('next')} disabled={reviewIndex >= reviewItems.length - 1} title="Next">
              <NavigateNextIcon />
            </IconButton>
            <IconButton size="small" onClick={() => setReviewMode(false)} title="Close" sx={{ ml: 1 }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={reviewLoading ? { p: 0, height: '75vh' } : { p: 0, display: 'flex', height: '75vh' }}>
          {reviewLoading ? (
            <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <CircularProgress size={32} sx={{ color: '#7c3aed' }} />
              <Typography variant="body2" color="textSecondary">
                Loading manual review items...
              </Typography>
            </Box>
          ) : (
            <>
          {/* LEFT PANEL: Description Preview */}
          <Box sx={{ flex: 1, borderRight: '1px solid #eee', p: 2, overflowY: 'auto', bgcolor: '#fafafa' }}>
            {/* Product Image */}
            {reviewItem?.mainImageUrl && (
              <Box sx={{ mb: 2, textAlign: 'center' }}>
                <img
                  src={reviewItem.mainImageUrl}
                  alt={reviewItem?.title || 'Product'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 200,
                    objectFit: 'contain',
                    borderRadius: 8,
                    border: '1px solid #ddd'
                  }}
                />
              </Box>
            )}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Item Description Preview</Typography>
            {reviewItem?.descriptionPreview ? (
              <div style={{ padding: 15, backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: 4 }} dangerouslySetInnerHTML={{ __html: reviewItem.descriptionPreview }} />
            ) : reviewItem?.title ? (
              <div style={{ padding: 15, backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: 4 }}>
                <strong>{reviewItem.title}</strong>
              </div>
            ) : (
              <Typography variant="body2" color="textSecondary">No preview available.</Typography>
            )}
            
            {/* AI Suggestion Box */}
            {reviewItem?.aiSuggestion?.make && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  <strong>AI Suggestion:</strong> {reviewItem.aiSuggestion.make} {reviewItem.aiSuggestion.model} 
                  {reviewItem.aiSuggestion.startYear && ` (${reviewItem.aiSuggestion.startYear}–${reviewItem.aiSuggestion.endYear})`}
                </Typography>
                {reviewItem.resolvedMake && (
                  <Typography variant="caption" display="block" color="primary.main" sx={{ mt: 0.5 }}>
                    → Resolved: {reviewItem.resolvedMake} {reviewItem.resolvedModel}
                  </Typography>
                )}
                {reviewItem.failureReason && (
                  <Typography variant="caption" display="block" color="error.main" sx={{ mt: 0.5 }}>
                    ⚠️ {reviewItem.failureReason}
                  </Typography>
                )}
                {reviewItem.ebayWarning && (
                  <Typography variant="caption" display="block" color="info.main" sx={{ mt: 0.5 }}>
                    ℹ️ eBay Note: {reviewItem.ebayWarning}
                  </Typography>
                )}
              </Alert>
            )}
          </Box>

          {/* RIGHT PANEL: Vehicle Editor */}
          <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Compatible Vehicles ({reviewItem?.editCompatList?.length || 0})
            </Typography>

            {/* AI SUGGEST BUTTON */}
            <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={aiLoading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                onClick={handleAiSuggest}
                disabled={aiLoading}
                sx={{
                  borderColor: '#7c3aed',
                  color: '#7c3aed',
                  '&:hover': { borderColor: '#6d28d9', bgcolor: '#f5f3ff' },
                  fontWeight: 600,
                  fontSize: '0.78rem'
                }}
              >
                {aiLoading ? 'Analyzing...' : '✨ AI Suggest'}
              </Button>
              <Typography variant="caption" color="textSecondary">
                Auto-fills Make, Model &amp; Year range from listing title/description
              </Typography>
            </Box>

            {/* Actions Bar */}
            {reviewItem?.editCompatList?.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={removeExistingCompatibility}
                >
                  Remove All ({reviewItem.editCompatList.length})
                </Button>
              </Box>
            )}

            <Grid container spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
              {/* MAKE */}
              <Grid item xs={3}>
                <Autocomplete
                  disablePortal
                  options={makeOptions}
                  value={selectedMake}
                  onChange={(e, val) => {
                    setSelectedMake(val);
                    if (val) {
                      selectMake(val);
                    } else {
                      setModelOptions([]);
                      setSelectedModel(null);
                      setYearOptions([]);
                      setSelectedYears([]);
                      setTrimsByYear({});
                      setSelectedTrimsByYear({});
                      setExpandedYears({});
                      setStartYear('');
                      setEndYear('');
                    }
                  }}
                  loading={loadingMakes}
                  renderInput={(params) => <TextField {...params} label="Make" size="small" />}
                />
              </Grid>

              {/* MODEL */}
              <Grid item xs={3}>
                <Autocomplete
                  disablePortal
                  options={modelOptions}
                  value={selectedModel}
                  onChange={(e, val) => {
                    setSelectedModel(val);
                    if (val) {
                      selectModel(val);
                    } else {
                      setYearOptions([]);
                      setSelectedYears([]);
                      setTrimsByYear({});
                      setSelectedTrimsByYear({});
                      setExpandedYears({});
                      setStartYear('');
                      setEndYear('');
                    }
                  }}
                  loading={loadingModels}
                  disabled={!selectedMake}
                  renderInput={(params) => <TextField {...params} label="Model" size="small" />}
                />
              </Grid>

              {/* YEAR RANGE SELECTOR */}
              <Grid item xs={6}>
                <Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Autocomplete
                      disablePortal
                      options={yearOptions}
                      value={startYear}
                      onChange={(e, newValue) => {
                        setStartYear(newValue || '');
                        handleYearRangeChange(newValue || '', endYear);
                      }}
                      loading={loadingYears}
                      disabled={!selectedModel}
                      getOptionLabel={(option) => String(option)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Start Year"
                          size="small"
                          placeholder="Type..."
                        />
                      )}
                      sx={{ flex: 1, minWidth: 100 }}
                    />
                    <Typography variant="body2" color="textSecondary">to</Typography>
                    <Autocomplete
                      disablePortal
                      options={yearOptions}
                      value={endYear}
                      onChange={(e, newValue) => {
                        setEndYear(newValue || '');
                        handleYearRangeChange(startYear, newValue || '');
                      }}
                      loading={loadingYears}
                      disabled={!selectedModel || !startYear}
                      getOptionLabel={(option) => String(option)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="End Year"
                          size="small"
                          placeholder="Type..."
                        />
                      )}
                      sx={{ flex: 1, minWidth: 100 }}
                    />
                  </Box>
                  {selectedYears.length > 0 && (
                    <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Typography variant="caption" color="textSecondary">Selected:</Typography>
                      {selectedYears.length <= 5 ? (
                        selectedYears.map(year => (
                          <Chip key={year} label={year} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                        ))
                      ) : (
                        <Chip
                          label={`${selectedYears.length} years (${selectedYears[selectedYears.length - 1]} - ${selectedYears[0]})`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  )}
                  {selectedModel && yearOptions.length > 0 && (
                    <Button
                      size="small"
                      onClick={() => {
                        if (selectedYears.length === yearOptions.length) {
                          setStartYear('');
                          setEndYear('');
                          setSelectedYears([]);
                        } else {
                          const firstYear = yearOptions[yearOptions.length - 1];
                          const lastYear = yearOptions[0];
                          setStartYear(firstYear);
                          setEndYear(lastYear);
                          setSelectedYears([...yearOptions]);
                        }
                      }}
                      sx={{ mt: 0.5, fontSize: '0.7rem', p: 0.5, minWidth: 'auto' }}
                    >
                      {selectedYears.length === yearOptions.length ? 'Clear All' : 'Select All Years'}
                    </Button>
                  )}
                </Box>
              </Grid>

              {/* TRIM + ENGINE PER-YEAR SECTIONS */}
              {selectedModel && Object.keys(trimsByYear).length > 0 && renderTrimsSection()}
              
              {loadingTrims && selectedModel && (
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="textSecondary">Loading trims...</Typography>
                  </Box>
                </Grid>
              )}
              <Grid item xs={2}><TextField label="Notes" size="small" value={newNotes} onChange={e => setNewNotes(e.target.value)} fullWidth /></Grid>
              <Grid item xs={1}>
                <Button
                  variant="contained"
                  onClick={handleAddVehicle}
                  disabled={!selectedMake || !selectedModel || selectedYears.length === 0}
                  sx={{ height: 40, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
                >
                  <AddIcon />
                </Button>
              </Grid>
            </Grid>

            <Divider sx={{ mb: 1 }} />

            {/* VEHICLE LIST TABLE */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Vehicle Details</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reviewItem?.editCompatList?.length > 0 ? (
                    reviewItem.editCompatList.map((compat, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{getVehicleString(compat.nameValueList)}</TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => handleRemoveVehicle(idx)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} align="center">
                        <Typography variant="body2" color="textSecondary">No vehicles added yet</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Box>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ borderTop: '1px solid #eee', p: 2, display: 'flex', gap: 1 }}>
          <Box sx={{ flex: 1 }} />
          
          {/* Navigation and Action Buttons */}
          <Button
            onClick={() => navigateReview('prev')}
            disabled={reviewLoading || reviewIndex === 0}
            startIcon={<NavigateBeforeIcon />}
            variant="outlined"
            size="small"
          >
            Previous
          </Button>
          
          <Button
            onClick={handleSkip}
            variant="outlined"
            color="warning"
            size="small"
            disabled={reviewLoading || !reviewItem}
          >
            Skip
          </Button>
          
          <Button
            onClick={handleEndListing}
            variant="outlined"
            color="error"
            size="small"
            disabled={reviewLoading || !reviewItem}
          >
            End Listing
          </Button>
          
          <Button
            onClick={() => {
              if (!reviewItem) return;
              // Mark current item as correct inline (avoids stale closure issue with setTimeout)
              const updatedItems = [...reviewItems];
              updatedItems[reviewIndex] = { ...reviewItem, reviewStatus: 'correct' };
              setReviewItems(updatedItems);
              setReviewItem(updatedItems[reviewIndex]);
              setSnackbar({ open: true, message: 'Marked as Correct', severity: 'success' });
              // Navigate to next inline
              if (reviewIndex < reviewItems.length - 1) {
                const newIndex = reviewIndex + 1;
                setReviewIndex(newIndex);
                const nextItem = updatedItems[newIndex];
                setReviewItem(nextItem);
                setSelectedMake(null); setSelectedModel(null); setSelectedYears([]);
                setSelectedTrimsByYear({}); setModelOptions([]); setYearOptions([]);
                setTrimsByYear({}); setExpandedYears({}); setTrimFilterKeyword('');
                setStartYear(''); setEndYear(''); setNewNotes('');
              }
            }}
            variant="contained"
            color="success"
            size="small"
            disabled={reviewLoading || !reviewItem}
          >
            ✓ Mark Correct
          </Button>
          
          <Button
            onClick={() => navigateReview('next')}
            disabled={reviewLoading || reviewIndex >= reviewItems.length - 1}
            endIcon={<NavigateNextIcon />}
            size="small"
          >
            Next
          </Button>
          
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          
          <Button
            onClick={finishReview}
            variant="contained"
            size="small"
            disabled={reviewLoading || reviewItems.length === 0}
            sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
          >
            Finish Review
          </Button>
        </DialogActions>
      </Dialog>

      {/* END LISTING CONFIRMATION DIALOG */}
      <Dialog open={confirmEndOpen} onClose={() => setConfirmEndOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>End Listing on eBay?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            This will permanently end the following listing on eBay. This action cannot be undone.
          </Typography>
          <Typography variant="body2" fontWeight="bold" sx={{ wordBreak: 'break-word' }}>
            {reviewItem?.title}
          </Typography>
          <Typography variant="caption" color="textSecondary">Item ID: {reviewItem?.itemId}</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setConfirmEndOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button
            onClick={confirmEndListing}
            variant="contained"
            color="error"
            size="small"
            disabled={endingListing}
            startIcon={endingListing ? <CircularProgress size={14} color="inherit" /> : null}
          >
            {endingListing ? 'Ending...' : 'Yes, End Listing'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* BULK REVIEW SUMMARY MODAL */}
      <Dialog open={summaryOpen} onClose={() => setSummaryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ borderBottom: '1px solid #eee' }}>Bulk Review Summary</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {/* Summary Cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mb: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center', border: '2px solid #e3e3e3' }}>
              <Typography variant="h3" color="primary" fontWeight="bold">
                {reviewItems.length}
              </Typography>
              <Typography variant="body2" color="textSecondary">Total Items</Typography>
            </Paper>
            
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f0fdf4', border: '2px solid #86efac' }}>
              <Typography variant="h3" color="success.main" fontWeight="bold">
                {reviewItems.filter(i => i.reviewStatus === 'correct').length}
              </Typography>
              <Typography variant="body2">Marked Correct</Typography>
            </Paper>

            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fff7ed', border: '2px solid #fdba74' }}>
              <Typography variant="h3" sx={{ color: '#f97316' }} fontWeight="bold">
                {reviewItems.filter(i => i.reviewStatus === 'skipped').length}
              </Typography>
              <Typography variant="body2">Reviewed / Skipped</Typography>
            </Paper>
            
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fffbeb', border: '2px solid #fde047' }}>
              <Typography variant="h3" sx={{ color: '#ea580c' }} fontWeight="bold">
                {reviewItems.filter(i => !i.reviewStatus || i.reviewStatus === 'pending').length}
              </Typography>
              <Typography variant="body2">Not Reviewed</Typography>
            </Paper>
            
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fef2f2', border: '2px solid #fca5a5' }}>
              <Typography variant="h3" color="error.main" fontWeight="bold">
                {reviewItems.filter(i => i.reviewStatus === 'ended').length}
              </Typography>
              <Typography variant="body2">Ended</Typography>
            </Paper>
          </Box>

          {/* Items to send table */}
          <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
            Items to send to eBay:
          </Typography>
          
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Item ID</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Vehicles</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reviewItems.map((item, idx) => {
                  const statusColor = 
                    item.reviewStatus === 'correct' ? 'success' :
                    item.reviewStatus === 'ended' ? 'error' :
                    item.reviewStatus === 'skipped' ? 'warning' : 'default';
                  const statusLabel = 
                    item.reviewStatus === 'correct' ? '✓ Correct' :
                    item.reviewStatus === 'ended' ? 'Ended' :
                    item.reviewStatus === 'skipped' ? '→ Reviewed/Skipped' : 'Not Reviewed';
                  
                  return (
                    <TableRow key={idx} hover sx={{ bgcolor: item.reviewStatus === 'correct' ? '#f0fdf4' : 'inherit' }}>
                      <TableCell>
                        <Chip label={statusLabel} size="small" color={statusColor} />
                      </TableCell>
                      <TableCell>{item.title?.substring(0, 60)}...</TableCell>
                      <TableCell>{item.itemId}</TableCell>
                      <TableCell align="center">{item.editCompatList?.length || 0}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, borderTop: '1px solid #eee' }}>
          <Button onClick={() => setSummaryOpen(false)} variant="outlined">Cancel</Button>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={bulkSendToEbay}
            variant="contained"
            disabled={bulkSending || reviewItems.filter(i => i.reviewStatus === 'correct').length === 0}
            startIcon={bulkSending ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            {bulkSending 
              ? 'Sending...' 
              : `SEND ${reviewItems.filter(i => i.reviewStatus === 'correct').length} ITEMS TO EBAY`
            }
          </Button>
        </DialogActions>
      </Dialog>

      {/* HISTORY DIALOG */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={700}>Auto-Compatibility History</Typography>
            {historyTotal > 0 && <Chip label={`${historyTotal} total`} size="small" variant="outlined" />}
          </Box>

          {/* ── Filter Rows ── */}
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Row 1: Date filters */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>

              {/* Listing Date (targetDate) */}
              <Box>
                <Typography variant="caption" color="textSecondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
                  Listing Date
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={historyFilters.listingDateMode}
                    onChange={(_, v) => {
                      if (!v) return;
                      const next = { ...historyFilters, listingDateMode: v, listingDate: '', dateFrom: '', dateTo: '', page: 1 };
                      setHistoryFilters(next);
                      loadHistory(next);
                    }}
                    sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
                  >
                    <ToggleButton value="single">Single</ToggleButton>
                    <ToggleButton value="range">Range</ToggleButton>
                  </ToggleButtonGroup>
                  {historyFilters.listingDateMode === 'single' ? (
                    <TextField
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={historyFilters.listingDate}
                      onChange={e => updateHistoryFilter('listingDate', e.target.value)}
                      sx={{ width: 150 }}
                    />
                  ) : (
                    <>
                      <TextField
                        label="From"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.dateFrom}
                        onChange={e => updateHistoryFilter('dateFrom', e.target.value)}
                        sx={{ width: 150 }}
                      />
                      <TextField
                        label="To"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.dateTo}
                        onChange={e => updateHistoryFilter('dateTo', e.target.value)}
                        sx={{ width: 150 }}
                      />
                    </>
                  )}
                </Box>
              </Box>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

              {/* Run On Date (createdAt) */}
              <Box>
                <Typography variant="caption" color="textSecondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
                  Run On (IST)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={historyFilters.runOnMode}
                    onChange={(_, v) => {
                      if (!v) return;
                      const next = { ...historyFilters, runOnMode: v, runOnDate: '', runOnFrom: '', runOnTo: '', page: 1 };
                      setHistoryFilters(next);
                      loadHistory(next);
                    }}
                    sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
                  >
                    <ToggleButton value="single">Single</ToggleButton>
                    <ToggleButton value="range">Range</ToggleButton>
                  </ToggleButtonGroup>
                  {historyFilters.runOnMode === 'single' ? (
                    <TextField
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={historyFilters.runOnDate}
                      onChange={e => updateHistoryFilter('runOnDate', e.target.value)}
                      sx={{ width: 150 }}
                    />
                  ) : (
                    <>
                      <TextField
                        label="From"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.runOnFrom}
                        onChange={e => updateHistoryFilter('runOnFrom', e.target.value)}
                        sx={{ width: 150 }}
                      />
                      <TextField
                        label="To"
                        type="date"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={historyFilters.runOnTo}
                        onChange={e => updateHistoryFilter('runOnTo', e.target.value)}
                        sx={{ width: 150 }}
                      />
                    </>
                  )}
                </Box>
              </Box>
            </Box>

            <Divider />

            {/* Row 2: Dropdown filters + Clear */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* By (Triggered By — non-seller staff only) */}
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>By</InputLabel>
                <Select
                  value={historyFilters.triggeredByFilter}
                  label="By"
                  onChange={e => updateHistoryFilter('triggeredByFilter', e.target.value)}
                >
                  <MenuItem value="">Anyone</MenuItem>
                  {staffUsers.map(u => (
                    <MenuItem key={u._id} value={u._id}>
                      {u.username || u.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 175 }}>
                <InputLabel>Seller</InputLabel>
                <Select
                  value={historyFilters.sellerFilter}
                  label="Seller"
                  onChange={e => updateHistoryFilter('sellerFilter', e.target.value)}
                >
                  <MenuItem value="">All Sellers</MenuItem>
                  {sellers.map(s => (
                    <MenuItem key={s._id} value={s._id}>{s.user?.username || s.user?.email}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 145 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={historyFilters.statusFilter}
                  label="Status"
                  onChange={e => updateHistoryFilter('statusFilter', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="running">Running</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 155 }}>
                <InputLabel>Review</InputLabel>
                <Select
                  value={historyFilters.reviewedFilter}
                  label="Review"
                  onChange={e => updateHistoryFilter('reviewedFilter', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="reviewed">Reviewed</MenuItem>
                </Select>
              </FormControl>

              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  const reset = {
                    listingDateMode: 'single', listingDate: '', dateFrom: '', dateTo: '',
                    runOnMode: 'single', runOnDate: '', runOnFrom: '', runOnTo: '',
                    sellerFilter: '', triggeredByFilter: '', statusFilter: '', reviewedFilter: '',
                    page: 1, limit: 25,
                  };
                  setHistoryFilters(reset);
                  loadHistory(reset);
                }}
              >
                Clear All
              </Button>
            </Box>

          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {historyLoading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : history.length === 0 ? (
            <Typography color="textSecondary" textAlign="center" p={4}>
              No batches found for the selected filters
            </Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 'calc(80vh - 200px)' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Listing Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Run On (IST)</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Seller</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>By</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Status</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>✅ Sent</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>🔧 Manual</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>❌ Errors</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Review</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map(b => (
                    <TableRow key={b._id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{b.targetDate}</TableCell>
                      <TableCell>
                        <Typography variant="caption">{formatDateIST(b.createdAt)}</Typography>
                      </TableCell>
                      <TableCell>{b.seller?.user?.username || '—'}</TableCell>
                      <TableCell>{b.triggeredBy?.username || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={b.status}
                          size="small"
                          color={b.status === 'completed' ? 'success' : b.status === 'running' ? 'warning' : 'error'}
                        />
                      </TableCell>
                      <TableCell align="center">{b.totalListings}</TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                          <Typography variant="caption" color="success.main" fontWeight={600}>{b.successCount || 0} ✓</Typography>
                          {(b.warningCount || 0) > 0 && <Typography variant="caption" color="warning.dark" sx={{ fontSize: '0.65rem' }}>{b.warningCount} w/notes</Typography>}
                        </Box>
                      </TableCell>
                      <TableCell align="center">{b.needsManualCount || 0}</TableCell>
                      <TableCell align="center">{(b.ebayErrorCount || 0) + (b.aiFailedCount || 0)}</TableCell>
                      <TableCell>
                        {b.manualReviewDone ? (
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            <Chip label={`✓${b.manualCorrectCount}`} size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                            <Chip label={`→${b.manualSkippedCount}`} size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                            <Chip label={`⨯${b.manualEndedCount}`} size="small" color="error" sx={{ height: 20, fontSize: '0.65rem' }} />
                          </Box>
                        ) : (
                          <Typography variant="caption" color="textSecondary">Pending</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => handleViewHistoryBatch(b._id)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions sx={{ borderTop: '1px solid #eee', p: 1.5, gap: 1 }}>
          {/* Pagination */}
          <Button
            size="small"
            disabled={historyFilters.page <= 1 || historyLoading}
            onClick={() => {
              const next = { ...historyFilters, page: historyFilters.page - 1 };
              setHistoryFilters(next);
              loadHistory(next);
            }}
          >
            ← Prev
          </Button>
          <Typography variant="caption" sx={{ mx: 1 }}>
            Page {historyFilters.page} · {history.length} of {historyTotal}
          </Typography>
          <Button
            size="small"
            disabled={historyFilters.page * historyFilters.limit >= historyTotal || historyLoading}
            onClick={() => {
              const next = { ...historyFilters, page: historyFilters.page + 1 };
              setHistoryFilters(next);
              loadHistory(next);
            }}
          >
            Next →
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setHistoryOpen(false)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      {/* SNACKBAR */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
