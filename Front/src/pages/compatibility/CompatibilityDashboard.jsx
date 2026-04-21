import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Typography, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, TextField, Grid, Chip, Divider, FormControl,
  InputLabel, Select, MenuItem, Snackbar, Alert, Pagination, OutlinedInput, Checkbox, ListItemText,
  Autocomplete, InputAdornment, Tooltip, Switch, FormControlLabel, Collapse,
  ToggleButtonGroup, ToggleButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import api from '../../lib/api';

// --- YOUR PREFERRED HELPERS (Strict Matching) ---

// Helper: Group raw rows into readable text
const groupFitmentData = (compatibilityList) => {
  if (!compatibilityList || compatibilityList.length === 0) return [];
  const groups = {};

  compatibilityList.forEach(item => {
    const year = item.nameValueList.find(x => x.name === 'Year')?.value;
    const make = item.nameValueList.find(x => x.name === 'Make')?.value;
    const model = item.nameValueList.find(x => x.name === 'Model')?.value;

    if (year && make && model) {
      const key = `${make} ${model}`;
      if (!groups[key]) groups[key] = new Set();
      groups[key].add(year);
    }
  });

  return Object.entries(groups).map(([key, yearSet]) => {
    const sortedYears = Array.from(yearSet).sort((a, b) => b - a);
    return { title: key, years: sortedYears.join(', ') };
  });
};

// Helper: Format vehicle string for Modal List
const getVehicleString = (nameValueList) => {
  const year = nameValueList.find(x => x.name === 'Year')?.value || '';
  const make = nameValueList.find(x => x.name === 'Make')?.value || '';
  const model = nameValueList.find(x => x.name === 'Model')?.value || '';
  const extras = nameValueList.filter(x => !['Year', 'Make', 'Model'].includes(x.name)).map(x => `${x.name}: ${x.value}`).join(' | ');
  let mainString = `${year} ${make} ${model}`;
  if (extras) mainString += ` (${extras})`;
  return mainString.trim();
};

// Helper: Date to PST
const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(dateString));
};

export default function CompatibilityDashboard() {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState([]);
  const [currentSellerId, setCurrentSellerId] = useState('');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // SEARCH STATE
  const [searchTerm, setSearchTerm] = useState('');

  // API USAGE STATE
  const [apiUsage, setApiUsage] = useState(null);

  const [openModal, setOpenModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentListingIndex, setCurrentListingIndex] = useState(-1);
  const [editCompatList, setEditCompatList] = useState([]);
  const [pendingNavigation, setPendingNavigation] = useState(null); // 'first' or 'last' after page change

  // Dropdown Data
  const [makeOptions, setMakeOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [yearOptions, setYearOptions] = useState([]); // Dynamic Years
  const [trimsByYear, setTrimsByYear] = useState({}); // { "2023": ["Trim1", "Trim2"], ... }

  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingTrims, setLoadingTrims] = useState(false);

  // Selection
  const [selectedMake, setSelectedMake] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedTrimsByYear, setSelectedTrimsByYear] = useState({}); // { "2023": ["Trim1"], ... }
  const [expandedYears, setExpandedYears] = useState({});
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [pageInputValue, setPageInputValue] = useState('');
  const [filterNoFitment, setFilterNoFitment] = useState(false);
  const [listedDateMode, setListedDateMode] = useState('range'); // 'single' | 'range'
  const [listedDate, setListedDate] = useState('');
  const [listedFrom, setListedFrom] = useState('');
  const [listedTo, setListedTo] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [trimFilterKeyword, setTrimFilterKeyword] = useState('');

  // BULK AI SUGGEST STATE
  const [selectedIds, setSelectedIds] = useState(new Set());
  // bulkQueue entries: { item, status: 'loading'|'ready'|'no-match'|'error',
  //   aiData, modelOptions, yearOptions, trimsByYear, selectedYears, modelExists, yearsExist, error,
  //   reviewStatus: 'pending'|'correct'|'skipped', finalCompatList: [] }
  const [bulkQueue, setBulkQueue] = useState([]);
  const [bulkQueueIdx, setBulkQueueIdx] = useState(0);
  const [bulkMode, setBulkMode] = useState(false);

  // BULK REVIEW SUMMARY STATE
  const [showBulkSummary, setShowBulkSummary] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkSendResults, setBulkSendResults] = useState(null); // { successCount, failureCount, results }

  // ---------------------------------------------------------------------------
  // Normalize a model string for fuzzy comparison:
  // strips dashes, spaces, dots and lowercases → "F-150" and "F150" both become "f150"
  // ---------------------------------------------------------------------------
  const normModel = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fuzzyMatchModel = (aiModel, options) => {
    if (!aiModel || !options?.length) return null;
    if (options.includes(aiModel)) return aiModel;
    const normAi = normModel(aiModel);
    return options.find(opt => normModel(opt) === normAi) || null;
  };

  // Common shorthand → eBay canonical Make names
  const MAKE_ALIASES = {
    'chevy': 'Chevrolet',
    'chev': 'Chevrolet',
    'vw': 'Volkswagen',
    'volkswagon': 'Volkswagen', // common misspelling
    'merc': 'Mercury',
    'benz': 'Mercedes-Benz',
    'mercedes': 'Mercedes-Benz',
    'alfa': 'Alfa Romeo',
    'land rover': 'Land Rover',
    'landrover': 'Land Rover',
    'range rover': 'Land Rover',
  };
  // Returns the canonical Make name — resolves aliases first, then falls back to raw AI value
  const resolveMake = (aiMake) => {
    if (!aiMake) return aiMake;
    const lower = aiMake.trim().toLowerCase();
    return MAKE_ALIASES[lower] || aiMake;
  };

  // ---------------------------------------------------------------------------
  // Normalize AI make and model values to match database conventions
  // ---------------------------------------------------------------------------
  const resolveModel = (aiMake, aiModel) => {
    if (!aiModel) return aiModel;
    const makeLower = (aiMake || '').toLowerCase();
    const modelLower = aiModel.toLowerCase();

    // Honda + Prologue EV → Prologue
    if (makeLower === 'honda' && modelLower.includes('prologue')) {
      return 'Prologue';
    }

    // Honda + Fit Jazz → Fit
    if (makeLower === 'honda' && modelLower.includes('fit')) {
      return 'Fit';
    }

    // Ram + Classic 1500 → Classic
    if (makeLower === 'ram' && modelLower.includes('classic')) {
      return 'Classic';
    }

    // Tesla + Model 3 → 3, Tesla + Model Y → Y
    if (makeLower === 'tesla') {
      if (/model\s*3/i.test(aiModel)) return '3';
      if (/model\s*y/i.test(aiModel)) return 'Y';
    }

    // Jeep + Wrangler JS → Wrangler
    if (makeLower === 'jeep' && /wrangler\s+j[a-z]/i.test(aiModel)) {
      return 'Wrangler';
    }

    // Toyota + Land Cruiser Prado 250 → Land Cruiser
    if (makeLower === 'toyota' && modelLower.includes('land cruiser')) {
      return 'Land Cruiser';
    }

    // Model normalization: silverado → silverado 1500 (only if no number like 2500, 3500 exists)
    if (modelLower.includes('silverado') && !/\d{4}/.test(modelLower)) {
      return 'Silverado 1500';
    }

    // Special case: BMW 3 Series → 330i
    if (makeLower === 'bmw' && modelLower.includes('3 series')) {
      return '330i';
    }

    return aiModel;
  };

  // ---------------------------------------------------------------------------
  // Year-dependent model resolution (must be called after resolveModel, before eBay lookup)
  // Uses the AI-suggested years to pick the correct model variant.
  // ---------------------------------------------------------------------------
  const resolveModelWithYear = (make, model, startYear, endYear) => {
    const makeLower = (make || '').toLowerCase();
    const modelNorm = (model || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Ford + F-250: before 1999 → "F-250", 1999 and after → "F-250 Super Duty"
    if (makeLower === 'ford' && modelNorm === 'f250') {
      const end = Number(endYear);
      if (end && end < 1999) return 'F-250';
      return 'F-250 Super Duty';
    }

    return model;
  };

  // ---------------------------------------------------------------------------
  // Clamp AI year ranges to known valid ranges for specific make/model combos
  // ---------------------------------------------------------------------------
  const clampYearRange = (make, model, startYear, endYear) => {
    if (!startYear || !endYear) return { startYear, endYear };
    const makeLower = (make || '').toLowerCase();
    const modelLower = (model || '').toLowerCase();
    let start = Number(startYear);
    let end = Number(endYear);

    // Dodge + Ram 1500 → restrict to 1994-2014
    if (makeLower === 'dodge' && /ram\s*1500/i.test(model)) {
      if (start < 1994) start = 1994;
      if (end > 2014) end = 2014;
      return { startYear: String(start), endYear: String(end) };
    }

    // Ram + 1500/2500/3500 → restrict to 2011-2026
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

  const displayedListings = filterNoFitment
    ? listings.filter(item => !item.compatibility || item.compatibility.length === 0)
    : listings;

  // Detect if a Poll All Sellers sync is already running when the page loads
  // (e.g., triggered by the scheduled cron job) and attach to its progress.
  const syncPollRef = useRef(null);
  useEffect(() => {
    const attachToRunningSyncIfNeeded = async () => {
      try {
        const { data: status } = await api.get('/ebay/sync-all-sellers-status');
        if (!status.running) return;
        const pageInfo = status.currentTotalPages > 0 ? ` (page ${status.currentPage}/${status.currentTotalPages})` : '';
        setSyncingAll(true);
        setSyncAllProgress(`${status.currentSeller}${pageInfo} — ${status.sellersComplete}/${status.sellersTotal} done`);
        syncPollRef.current = setInterval(async () => {
          try {
            const { data: s } = await api.get('/ebay/sync-all-sellers-status');
            if (s.running) {
              const pi = s.currentTotalPages > 0 ? ` (page ${s.currentPage}/${s.currentTotalPages})` : '';
              setSyncAllProgress(`${s.currentSeller}${pi} — ${s.sellersComplete}/${s.sellersTotal} done`);
            } else {
              clearInterval(syncPollRef.current);
              const summary = s.results?.map(r => `${r.sellerName}: ${r.processedCount}${r.error ? ' ❌' : ''}`).join(' | ') || 'Done';
              showSnackbar(`✅ ${summary}`, s.errors?.length ? 'warning' : 'success');
              setSyncingAll(false);
              setSyncAllProgress('');
            }
          } catch { /* ignore poll errors */ }
        }, 3000);
      } catch { /* non-critical */ }
    };
    attachToRunningSyncIfNeeded();
    return () => { if (syncPollRef.current) clearInterval(syncPollRef.current); };
  }, []);

  useEffect(() => {
    const initDashboard = async () => {
      try {
        const { data } = await api.get('/sellers/all');
        setSellers(data);
        if (data.length > 0) setCurrentSellerId(data[0]._id);
      } catch (adminError) {
        try {
          const { data } = await api.get('/sellers/me');
          setSellers([data]);
          setCurrentSellerId(data._id);
        } catch (e) { console.error(e); }
      }
    };
    initDashboard();
  }, []);

  useEffect(() => {
    if (currentSellerId) loadListings();
  }, [currentSellerId, page, listedDateMode, listedDate, listedFrom, listedTo]);

  useEffect(() => {
    if (currentSellerId) fetchApiUsage();
  }, [currentSellerId]);

  // Handle navigation after page load
  useEffect(() => {
    if (!loading && pendingNavigation && listings.length > 0) {
      if (pendingNavigation === 'first') {
        const firstItem = listings[0];
        setSelectedItem(firstItem);
        setCurrentListingIndex(0);
        setEditCompatList(JSON.parse(JSON.stringify(firstItem.compatibility || [])));
        setSelectedMake(null);
        setSelectedModel(null);
        setSelectedYears([]);
        setSelectedTrimsByYear({});
        setTrimsByYear({});
        setExpandedYears({});
        setStartYear('');
        setEndYear('');
        setNewNotes('');
      } else if (pendingNavigation === 'last') {
        const lastItem = listings[listings.length - 1];
        setSelectedItem(lastItem);
        setCurrentListingIndex(listings.length - 1);
        setEditCompatList(JSON.parse(JSON.stringify(lastItem.compatibility || [])));
        setSelectedMake(null);
        setSelectedModel(null);
        setSelectedYears([]);
        setSelectedTrimsByYear({});
        setTrimsByYear({});
        setExpandedYears({});
        setStartYear('');
        setEndYear('');
        setNewNotes('');
      }
      setPendingNavigation(null);
    }
  }, [loading, pendingNavigation, listings]);

  const fetchApiUsage = async () => {
    try {
      const { data } = await api.get('/ebay/api-usage-stats', {
        params: { sellerId: currentSellerId }
      });
      setApiUsage(data);
    } catch (e) {
      // Silent fail - not critical
      console.error('Failed to fetch API usage:', e);
    }
  };

  const loadListings = async (customSearch = null) => {
    setLoading(true);
    try {
      const searchToSend = customSearch !== null ? customSearch : searchTerm;
      const { data } = await api.get('/ebay/listings', {
        params: {
          sellerId: currentSellerId,
          page,
          limit: 100,
          search: searchToSend,
          ...(listedDateMode === 'single'
            ? (listedDate ? { listedFrom: listedDate, listedTo: listedDate } : {})
            : { ...(listedFrom ? { listedFrom } : {}), ...(listedTo ? { listedTo } : {}) }),
        }
      });
      setListings(data.listings);
      setTotalPages(data.pagination.pages);
      setTotalItems(data.pagination.total);
      // Clear selections when new page loads
      setSelectedIds(new Set());
    } catch (e) { showSnackbar('Failed to load listings', 'error'); }
    finally { setLoading(false); }
  };

  const handleSearch = () => {
    setPage(1);
    loadListings(searchTerm);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSync = async () => {
    if (!currentSellerId) return;
    setSyncing(true);
    try {
      const { data } = await api.post('/ebay/sync-listings', { sellerId: currentSellerId });
      showSnackbar(data.message, 'success');
      setPage(1);
      await loadListings();
    } catch (e) { showSnackbar('Sync Failed: ' + (e.response?.data?.error || e.message), 'error'); }
    finally { setSyncing(false); }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncAllProgress('Starting...');
    try {
      const { data } = await api.post('/ebay/sync-all-sellers-listings');
      if (!data.success) {
        showSnackbar(data.message || 'Sync failed to start', 'error');
        setSyncingAll(false);
        setSyncAllProgress('');
        return;
      }
      showSnackbar(`Sync started for ${data.sellersTotal} seller(s)...`, 'info');

      // Poll status every 3 seconds
      const pollInterval = setInterval(async () => {
        try {
          const { data: status } = await api.get('/ebay/sync-all-sellers-status');
          if (status.running) {
            const pageInfo = status.currentTotalPages > 0 ? ` (page ${status.currentPage}/${status.currentTotalPages})` : '';
            setSyncAllProgress(`${status.currentSeller}${pageInfo} — ${status.sellersComplete}/${status.sellersTotal} done`);
          } else {
            // Sync finished
            clearInterval(pollInterval);
            const summary = status.results?.map(r => `${r.sellerName}: ${r.processedCount}${r.error ? ' ❌' : ''}`).join(' | ') || 'Done';
            showSnackbar(`✅ ${summary}`, status.errors?.length ? 'warning' : 'success');
            setSyncingAll(false);
            setSyncAllProgress('');
            if (currentSellerId) {
              setPage(1);
              await loadListings();
            }
          }
        } catch (pollErr) {
          console.error('Status poll error:', pollErr);
        }
      }, 3000);
    } catch (e) {
      showSnackbar('Sync All Failed: ' + (e.response?.data?.message || e.response?.data?.error || e.message), 'error');
      setSyncingAll(false);
      setSyncAllProgress('');
    }
  };

  // --- API FETCHING ---

  const fetchMakes = async () => {
    if (makeOptions.length > 0) return;
    setLoadingMakes(true);
    try {
      const { data } = await api.post('/ebay/compatibility/values', { sellerId: currentSellerId, propertyName: 'Make' });
      setMakeOptions(data.values);
    } catch (e) { console.error(e); }
    finally { setLoadingMakes(false); }
  };

  const fetchModels = async (makeVal) => {
    setLoadingModels(true);
    setModelOptions([]);
    setSelectedModel(null);
    setYearOptions([]);
    setSelectedYears([]);
    setTrimsByYear({});
    setSelectedTrimsByYear({});
    setExpandedYears({});
    try {
      const { data } = await api.post('/ebay/compatibility/values', {
        sellerId: currentSellerId,
        propertyName: 'Model',
        constraints: [{ name: 'Make', value: makeVal }]
      });
      setModelOptions(data.values);
    } catch (e) { console.error(e); }
    finally { setLoadingModels(false); }
  };

  const fetchYears = async (makeVal, modelVal) => {
    setLoadingYears(true);
    setYearOptions([]);
    setSelectedYears([]);
    try {
      const { data } = await api.post('/ebay/compatibility/values', {
        sellerId: currentSellerId,
        propertyName: 'Year',
        constraints: [
          { name: 'Make', value: makeVal },
          { name: 'Model', value: modelVal }
        ]
      });
      // Normalize year values to strings for consistent Select behavior
      setYearOptions(
        (data.values || [])
          .map((y) => String(y))
          .sort((a, b) => Number(b) - Number(a))
      );
    } catch (e) { console.error(e); }
    finally { setLoadingYears(false); }
  };

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
          sellerId: currentSellerId,
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
              sellerId: currentSellerId,
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

  // --- AI SUGGEST FITMENT ---
  const handleAiSuggest = async () => {
    if (!selectedItem) return;
    setAiLoading(true);
    setLoadingModels(true);
    try {
      const { data } = await api.post('/ai/suggest-fitment', {
        title: selectedItem.title || '',
        description: selectedItem.descriptionPreview || ''
      });
      if (!data.make) {
        showSnackbar('AI could not extract fitment info from this listing', 'warning');
        return;
      }
      // Step 1: Resolve Make alias (Chevy→Chevrolet etc.) then fetch models
      const resolvedMake = resolveMake(data.make);
      const resolvedModelStep1 = resolveModel(resolvedMake, data.model); // Apply model normalization
      const resolvedModelInput = resolveModelWithYear(resolvedMake, resolvedModelStep1, data.startYear, data.endYear); // year-aware model fix
      setSelectedMake(resolvedMake);
      setModelOptions([]);
      setSelectedModel(null);
      setYearOptions([]);
      setSelectedYears([]);
      setTrimsByYear({});
      setSelectedTrimsByYear({});
      setExpandedYears({});

      const modelsRes = await api.post('/ebay/compatibility/values', {
        sellerId: currentSellerId,
        propertyName: 'Model',
        constraints: [{ name: 'Make', value: resolvedMake }]
      });
      const modelOpts = modelsRes.data.values || [];
      setModelOptions(modelOpts);
      setLoadingModels(false);

      // Fuzzy-match the AI model against eBay's list (handles F150 ↔ F-150 etc.)
      const resolvedModel = fuzzyMatchModel(resolvedModelInput, modelOpts);
      if (!resolvedModel) {
        showSnackbar(`AI suggested model "${data.model}" not found in eBay DB for ${resolvedMake}. Please select manually.`, 'warning');
        return;
      }

      // Step 2: Set resolved (canonical) model and fetch years
      setSelectedModel(resolvedModel);
      setLoadingYears(true);
      setYearOptions([]);
      setSelectedYears([]);
      try {
        const yearsRes = await api.post('/ebay/compatibility/values', {
          sellerId: currentSellerId,
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
        // Step 3: Apply year range — use eBay-validated subset, NOT raw AI years
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
            showSnackbar(`AI suggested ${data.make} ${resolvedModel} (${data.startYear}–${data.endYear}) but those years aren't in eBay's DB for this model. Please select years manually.`, 'warning');
            return;
          }
        }
      } finally {
        setLoadingYears(false);
      }
      showSnackbar(`AI suggested: ${data.make} ${resolvedModel === data.model ? resolvedModel : `${resolvedModel} (matched from "${data.model}")`} — years verified in eBay DB`, 'success');
    } catch (e) {
      showSnackbar('AI suggestion failed: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setLoadingModels(false);
      setAiLoading(false);
    }
  };
  // --- BULK AI SUGGEST ---

  const handleBulkAiSuggest = async () => {
    const selectedItems = displayedListings.filter(item => selectedIds.has(item.itemId));
    if (selectedItems.length === 0) return;

    // Build initial queue (all loading)
    const initial = selectedItems.map(item => ({
      item, status: 'loading', aiData: null,
      modelOptions: [], yearOptions: [], trimsByYear: {}, selectedYears: [],
      modelExists: true, yearsExist: true, error: null
    }));
    setBulkQueue(initial);
    setBulkQueueIdx(0);
    setBulkMode(true);
    setSelectedIds(new Set()); // deselect all checkboxes once queue is running

    // Open Edit modal immediately on first item (shows loading state)
    const firstItem = selectedItems[0];
    const firstIdx = listings.findIndex(l => l.itemId === firstItem.itemId);
    setSelectedItem(firstItem);
    setCurrentListingIndex(firstIdx >= 0 ? firstIdx : 0);
    setEditCompatList(JSON.parse(JSON.stringify(firstItem.compatibility || [])));
    setOpenModal(true);
    setSelectedMake(null); setSelectedModel(null);
    setSelectedYears([]); setSelectedTrimsByYear({});
    setTrimsByYear({}); setYearOptions([]); setModelOptions([]);
    setExpandedYears({}); setStartYear(''); setEndYear(''); setNewNotes('');
    fetchMakes();

    // Fire AI + full data fetch in throttled batches to avoid ERR_INSUFFICIENT_RESOURCES
    const CONCURRENCY_LIMIT = 20;
    const processItem = async (item, idx) => {
      try {
        const { data } = await api.post('/ai/suggest-fitment', {
          title: item.title || '',
          description: item.descriptionPreview || ''
        });

        if (!data.make) {
          setBulkQueue(prev => {
            const u = [...prev];
            u[idx] = { ...u[idx], status: 'no-match', error: 'AI could not extract fitment info' };
            return u;
          });
          return;
        }

        // Fetch models, years and trims all in background
        let modelOpts = [], yearOpts = [], resolvedYears = [], trimsByYearResult = {};
        let modelExists = true, yearsExist = true;
        const resolvedMake = resolveMake(data.make); // Chevy→Chevrolet etc.
        const resolvedModelStep1 = resolveModel(resolvedMake, data.model); // Apply model normalization
        const resolvedModelInput = resolveModelWithYear(resolvedMake, resolvedModelStep1, data.startYear, data.endYear); // year-aware model fix
        let canonicalModel = resolvedModelInput; // hoisted — updated inside try if fuzzy match succeeds
        try {
          // 1. Models — use resolved make (alias-corrected)
          const modelsRes = await api.post('/ebay/compatibility/values', {
            sellerId: currentSellerId,
            propertyName: 'Model',
            constraints: [{ name: 'Make', value: resolvedMake }]
          });
          modelOpts = modelsRes.data.values || [];
          const resolvedModel = fuzzyMatchModel(resolvedModelInput, modelOpts);
          modelExists = !!resolvedModel;
          canonicalModel = resolvedModel || resolvedModelInput;

          // 2. Years — use resolved make + canonical model
          const yearsRes = await api.post('/ebay/compatibility/values', {
            sellerId: currentSellerId,
            propertyName: 'Year',
            constraints: [{ name: 'Make', value: resolvedMake }, { name: 'Model', value: canonicalModel }]
          });
          yearOpts = (yearsRes.data.values || []).map(y => String(y)).sort((a, b) => Number(b) - Number(a));
          if (data.startYear && data.endYear) {
            const clamped = clampYearRange(resolvedMake, canonicalModel, data.startYear, data.endYear);
            const min = Math.min(Number(clamped.startYear), Number(clamped.endYear));
            const max = Math.max(Number(clamped.startYear), Number(clamped.endYear));
            resolvedYears = yearOpts.filter(y => Number(y) >= min && Number(y) <= max);
          }
          yearsExist = resolvedYears.length > 0;

          // 3. Trims for all resolved years (parallel) — use canonical model name
          if (resolvedYears.length > 0) {
            const trimPromises = resolvedYears.map(year =>
              api.post('/ebay/compatibility/values', {
                sellerId: currentSellerId, propertyName: 'Trim',
                constraints: [{ name: 'Make', value: resolvedMake }, { name: 'Model', value: canonicalModel }, { name: 'Year', value: year }]
              }).then(r => ({ year, trims: (r.data.values || []).sort() })).catch(() => ({ year, trims: [] }))
            );
            const trimResults = await Promise.all(trimPromises);

            // 4. Engines for each trim (parallel)
            const enginePromises = [];
            trimResults.forEach(({ year, trims }) => {
              trims.forEach(trim => {
                enginePromises.push(
                  api.post('/ebay/compatibility/values', {
                    sellerId: currentSellerId, propertyName: 'Engine',
                    constraints: [
                      { name: 'Make', value: resolvedMake }, { name: 'Model', value: canonicalModel },
                      { name: 'Year', value: year }, { name: 'Trim', value: trim }
                    ]
                  }).then(r => ({ year, trim, engines: r.data.values || [] })).catch(() => ({ year, trim, engines: [] }))
                );
              });
            });
            const engineResults = await Promise.all(enginePromises);

            const byYear = {};
            engineResults.forEach(({ year, trim, engines }) => {
              if (!byYear[year]) byYear[year] = [];
              if (engines.length > 0) engines.forEach(engine => byYear[year].push({ trim, engine }));
              else byYear[year].push({ trim, engine: '' });
            });
            Object.keys(byYear).forEach(y => {
              byYear[y].sort((a, b) => a.trim.localeCompare(b.trim) || a.engine.localeCompare(b.engine));
            });
            trimsByYearResult = byYear;
          }
        } catch (fetchErr) {
          console.error('[Bulk AI] Compat data fetch error:', fetchErr);
        }

        setBulkQueue(prev => {
          const u = [...prev];
          u[idx] = {
            ...u[idx], status: 'ready',
            aiData: { ...data, make: resolvedMake, model: canonicalModel }, // store canonical make+model
            modelOptions: modelOpts, yearOptions: yearOpts,
            trimsByYear: trimsByYearResult, selectedYears: resolvedYears,
            modelExists, yearsExist, error: null
          };
          return u;
        });
      } catch (err) {
        setBulkQueue(prev => {
          const u = [...prev];
          u[idx] = { ...u[idx], status: 'error', error: err.response?.data?.error || err.message || 'AI failed' };
          return u;
        });
      }
    };

    // Process items in batches of CONCURRENCY_LIMIT
    (async () => {
      for (let i = 0; i < selectedItems.length; i += CONCURRENCY_LIMIT) {
        const batch = selectedItems.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map((item, batchIdx) => processItem(item, i + batchIdx)));
      }
    })();
  };

  // Apply current bulk queue item data to modal state whenever it's ready
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!bulkMode || !openModal) return;
    const entry = bulkQueue[bulkQueueIdx];
    if (!entry) return;

    // Always update the modal's item
    setSelectedItem(entry.item);
    // If previously marked correct, restore the finalCompatList; otherwise use original
    if (entry.reviewStatus === 'correct' && entry.finalCompatList?.length > 0) {
      setEditCompatList(JSON.parse(JSON.stringify(entry.finalCompatList)));
    } else {
      setEditCompatList(JSON.parse(JSON.stringify(entry.item.compatibility || [])));
    }
    const newIdx = listings.findIndex(l => l.itemId === entry.item.itemId);
    setCurrentListingIndex(newIdx >= 0 ? newIdx : 0);

    if (entry.status === 'ready' && entry.aiData) {
      setSelectedMake(entry.aiData.make);
      setSelectedModel(entry.aiData.model);
      // Use eBay-validated year range (min/max of resolvedYears), NOT raw AI output.
      // e.g. AI says 2019-2025 but eBay only has [2025] → show 2025-2025, not 2019-2025.
      const resolvedYears = entry.selectedYears || [];
      if (resolvedYears.length > 0) {
        const nums = resolvedYears.map(Number);
        setStartYear(String(Math.min(...nums)));
        setEndYear(String(Math.max(...nums)));
      } else {
        setStartYear(entry.aiData.startYear || '');
        setEndYear(entry.aiData.endYear || '');
      }
      setModelOptions(entry.modelOptions || []);
      setYearOptions(entry.yearOptions || []);
      setSelectedYears(resolvedYears);
      setTrimsByYear(entry.trimsByYear || {});
      setSelectedTrimsByYear({});
      const expanded = {};
      Object.keys(entry.trimsByYear || {}).forEach(y => { expanded[y] = true; });
      setExpandedYears(expanded);
      setNewNotes('');
      setTrimFilterKeyword('');
    } else if (entry.status !== 'loading') {
      // no-match or error — reset fields so user can fill manually
      setSelectedMake(null); setSelectedModel(null);
      setSelectedYears([]); setSelectedTrimsByYear({});
      setTrimsByYear({}); setYearOptions([]); setModelOptions([]);
      setExpandedYears({}); setStartYear(''); setEndYear(''); setNewNotes('');
      setTrimFilterKeyword('');
    }
  }, [bulkQueueIdx, bulkQueue, bulkMode, openModal]);

  // Advance to next item in queue (or show summary)
  const handleBulkQueueNext = (skip = false) => {
    // Mark current item's review status
    setBulkQueue(prev => {
      const u = [...prev];
      if (skip) {
        // Only mark as skipped if it wasn't already marked ended
        if (u[bulkQueueIdx] && u[bulkQueueIdx].reviewStatus !== 'ended') {
          u[bulkQueueIdx] = { ...u[bulkQueueIdx], reviewStatus: 'skipped', finalCompatList: [] };
        }
      }
      // If not skip, it should already be marked as 'correct' by handleMarkCorrect
      return u;
    });

    const nextIdx = bulkQueueIdx + 1;
    if (nextIdx >= bulkQueue.length) {
      // All items reviewed — show summary
      setOpenModal(false);
      setShowBulkSummary(true);
    } else {
      setBulkQueueIdx(nextIdx);
    }
  };

  const handleEndListing = async () => {
    if (!bulkMode || bulkQueueIdx < 0 || bulkQueueIdx >= bulkQueue.length) return;
    const currentItem = bulkQueue[bulkQueueIdx].item;

    if (!window.confirm(`Are you sure you want to end listing ${currentItem.itemId} (${currentItem.title})?`)) {
      return;
    }

    try {
      setBulkQueue(prev => {
        const u = [...prev];
        u[bulkQueueIdx] = { ...u[bulkQueueIdx], endingLoading: true };
        return u;
      });

      const { data } = await api.post('/ebay/end-item', {
        sellerId: currentSellerId,
        itemId: currentItem.itemId,
        endingReason: 'NotAvailable'
      });

      if (data.success) {
        showSnackbar(`Successfully ended listing ${currentItem.itemId}`, 'success');
        setBulkQueue(prev => {
          const u = [...prev];
          u[bulkQueueIdx] = {
            ...u[bulkQueueIdx],
            endingLoading: false,
            reviewStatus: 'ended'
          };
          return u;
        });
        handleBulkQueueNext(false); // Advance without overwriting 'ended'
      }
    } catch (e) {
      showSnackbar('Failed to end listing: ' + (e.response?.data?.error || e.message), 'error');
      setBulkQueue(prev => {
        const u = [...prev];
        u[bulkQueueIdx] = { ...u[bulkQueueIdx], endingLoading: false };
        return u;
      });
    }
  };

  // Mark current item as "Correct" — capture the current editCompatList and advance
  const handleMarkCorrect = () => {
    setBulkQueue(prev => {
      const u = [...prev];
      u[bulkQueueIdx] = {
        ...u[bulkQueueIdx],
        reviewStatus: 'correct',
        finalCompatList: JSON.parse(JSON.stringify(editCompatList))
      };
      return u;
    });

    const nextIdx = bulkQueueIdx + 1;
    if (nextIdx >= bulkQueue.length) {
      setOpenModal(false);
      setShowBulkSummary(true);
    } else {
      setBulkQueueIdx(nextIdx);
    }
  };

  // Send all "correct" items to eBay in bulk
  const handleBulkSendToEbay = async () => {
    const correctItems = bulkQueue.filter(q => q.reviewStatus === 'correct');
    if (correctItems.length === 0) {
      showSnackbar('No items marked as correct to send', 'warning');
      return;
    }

    setBulkSending(true);
    try {
      const payload = correctItems.map(q => ({
        itemId: q.item.itemId,
        title: q.item.title,
        sku: q.item.sku,
        compatibilityList: q.finalCompatList
      }));

      const { data } = await api.post('/ebay/bulk-update-compatibility', {
        sellerId: currentSellerId,
        items: payload,
        totalItems: bulkQueue.length,
        skippedCount: bulkQueue.filter(q => q.reviewStatus !== 'correct').length
      });

      setBulkSendResults(data);

      // Update local listings state for successful items
      const successItemIds = new Set(data.results.filter(r => r.status === 'success').map(r => r.itemId));
      setListings(prevListings =>
        prevListings.map(item => {
          if (successItemIds.has(item.itemId)) {
            const correctEntry = correctItems.find(q => q.item.itemId === item.itemId);
            if (correctEntry) return { ...item, compatibility: correctEntry.finalCompatList };
          }
          return item;
        })
      );

      // Track usage
      api.post('/ai/track-save-next', { hadData: true }).catch(() => { });
      fetchApiUsage();

      showSnackbar(`Bulk send complete: ${data.successCount} success, ${data.failureCount} failed`, data.failureCount > 0 ? 'warning' : 'success');
    } catch (e) {
      showSnackbar('Bulk send failed: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setBulkSending(false);
    }
  };

  // Close bulk summary and reset
  const handleCloseBulkSummary = () => {
    setShowBulkSummary(false);
    setBulkSendResults(null);
    setBulkMode(false);
    setBulkQueue([]);
    setBulkQueueIdx(0);
  };

  // Go back to previous item in queue
  const handleBulkQueuePrevious = () => {
    if (bulkQueueIdx > 0) {
      setBulkQueueIdx(bulkQueueIdx - 1);
    }
  };

  // Open Edit modal pre-filled from a bulk result (kept for compatibility)
  const handleInspectItem = (result) => {
    const idx = listings.findIndex(l => l.itemId === result.item.itemId);
    handleEditClick(result.item, idx >= 0 ? idx : 0, result.aiData);
  };

  // --- HANDLERS ---

  // Auto-fetch trims when selected years change
  useEffect(() => {
    if (selectedMake && selectedModel && selectedYears.length > 0) {
      fetchTrims(selectedMake, selectedModel, selectedYears);
    } else {
      setTrimsByYear({});
      setSelectedTrimsByYear({});
    }
  }, [selectedYears, selectedMake, selectedModel]);

  const handleEditClick = (item, index, prefillAiData = null) => {
    setSelectedItem(item);
    setCurrentListingIndex(index);
    setEditCompatList(JSON.parse(JSON.stringify(item.compatibility || [])));
    setOpenModal(true);
    setTrimsByYear({});
    setExpandedYears({});
    setNewNotes('');
    setTrimFilterKeyword('');
    fetchMakes();
    // Reset bulk mode when opening manually
    setBulkMode(false);
    setBulkQueue([]);
    setBulkQueueIdx(0);

    if (prefillAiData && prefillAiData.make) {
      setSelectedMake(prefillAiData.make);
      setSelectedModel(prefillAiData.model || null);
      setStartYear(prefillAiData.startYear || '');
      setEndYear(prefillAiData.endYear || '');
      api.post('/ebay/compatibility/values', {
        sellerId: currentSellerId,
        propertyName: 'Model',
        constraints: [{ name: 'Make', value: prefillAiData.make }]
      }).then(r => setModelOptions(r.data.values || [])).catch(() => { });
      if (prefillAiData.model) {
        setLoadingYears(true);
        api.post('/ebay/compatibility/values', {
          sellerId: currentSellerId,
          propertyName: 'Year',
          constraints: [
            { name: 'Make', value: prefillAiData.make },
            { name: 'Model', value: prefillAiData.model }
          ]
        }).then(r => {
          const yearList = (r.data.values || []).map(y => String(y)).sort((a, b) => Number(b) - Number(a));
          setYearOptions(yearList);
          if (prefillAiData.startYear && prefillAiData.endYear) {
            const min = Math.min(Number(prefillAiData.startYear), Number(prefillAiData.endYear));
            const max = Math.max(Number(prefillAiData.startYear), Number(prefillAiData.endYear));
            setSelectedYears(yearList.filter(y => Number(y) >= min && Number(y) <= max));
          }
        }).catch(() => { }).finally(() => setLoadingYears(false));
      } else {
        setSelectedYears([]); setYearOptions([]);
      }
    } else {
      setSelectedMake(null); setSelectedModel(null);
      setSelectedYears([]); setSelectedTrimsByYear({});
      setYearOptions([]); setModelOptions([]);
      setStartYear(''); setEndYear('');
    }
  };

  // Helper to create a unique key for a trim+engine entry
  const trimKey = (entry) => `${entry.trim}|||${entry.engine}`;

  const handleAddVehicle = () => {
    if (!selectedMake || !selectedModel || selectedYears.length === 0) return;
    const newEntries = [];
    // Check if any trims are selected across any year
    const hasAnyTrimsSelected = Object.values(selectedTrimsByYear).some(arr => arr && arr.length > 0);
    for (const year of selectedYears) {
      const yearEntries = (hasAnyTrimsSelected && selectedTrimsByYear[year]?.length > 0) ? selectedTrimsByYear[year] : [null];
      for (const entry of yearEntries) {
        const nameValueList = [
          { name: 'Year', value: year },
          { name: 'Make', value: selectedMake },
          { name: 'Model', value: selectedModel }
        ];
        if (entry) {
          nameValueList.push({ name: 'Trim', value: entry.trim });
          if (entry.engine) nameValueList.push({ name: 'Engine', value: entry.engine });
        }
        newEntries.push({ notes: newNotes, nameValueList });
      }
    }
    setEditCompatList([...newEntries, ...editCompatList]);
    setSelectedYears([]);
    setSelectedTrimsByYear({});
    setStartYear('');
    setEndYear('');
    setNewNotes('');
  };

  // Toggle a single year selection reliably when clicking its checkbox
  const toggleYear = (year) => {
    const y = String(year);
    setSelectedYears((prev) =>
      prev.includes(y) ? prev.filter((v) => v !== y) : [...prev, y]
    );
  };

  const handleRemoveVehicle = (index) => {
    const updated = [...editCompatList];
    updated.splice(index, 1);
    setEditCompatList(updated);
  };

  const handleSaveCompatibility = async (closeModal = true) => {
    if (!selectedItem || !currentSellerId) return;
    try {
      const { data } = await api.post('/ebay/update-compatibility', {
        sellerId: currentSellerId,
        itemId: selectedItem.itemId,
        compatibilityList: editCompatList
      });

      if (closeModal) {
        setOpenModal(false);
      }

      if (data.warning) {
        showSnackbar(`Saved with eBay Warning: ${data.warning}`, 'warning');
      } else {
        showSnackbar('Changes saved to eBay successfully!', 'success');
      }

      setListings(prevListings =>
        prevListings.map(item =>
          item.itemId === selectedItem.itemId
            ? { ...item, compatibility: editCompatList }
            : item
        )
      );

      // Refresh API usage after successful save
      fetchApiUsage();

    } catch (e) {
      const errorMsg = e.response?.data?.error || e.message;
      const rateLimitInfo = e.response?.data?.rateLimitInfo;

      if (rateLimitInfo) {
        // Show rate limit specific message with stats
        const detailedMsg = `eBay API Limit Reached
Used: ${rateLimitInfo.used.toLocaleString()} / ${rateLimitInfo.limit.toLocaleString()} calls today
Remaining: ${rateLimitInfo.remaining.toLocaleString()} calls
Resets in: ${rateLimitInfo.hoursUntilReset} hour${rateLimitInfo.hoursUntilReset !== 1 ? 's' : ''}`;

        showSnackbar(detailedMsg, 'error');
        // Refresh usage stats to show updated count
        fetchApiUsage();
      } else {
        // Standard error handling
        showSnackbar(`Update failed: ${errorMsg}`, 'error');
      }
      throw e;
    }
  };

  const showSnackbar = (message, severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleGoToPage = () => {
    const pageNum = parseInt(pageInputValue);
    if (!pageInputValue || isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
      showSnackbar(`Please enter a valid page number (1-${totalPages})`, 'error');
      return;
    }
    setPage(pageNum);
    setPageInputValue('');
  };

  // Select All years toggle
  const toggleSelectAllYears = () => {
    setSelectedYears((prev) => (
      prev.length === yearOptions.length ? [] : [...yearOptions]
    ));
  };

  // Handle year range selection
  const handleYearRangeChange = (start, end) => {
    if (!start && !end) {
      setSelectedYears([]);
      return;
    }

    if (start && !end) {
      // Only start year selected
      setSelectedYears([start]);
      return;
    }

    if (start && end) {
      // Both selected - create range
      const startNum = Number(start);
      const endNum = Number(end);
      const min = Math.min(startNum, endNum);
      const max = Math.max(startNum, endNum);

      const range = [];
      for (let year = min; year <= max; year++) {
        const yearStr = String(year);
        if (yearOptions.includes(yearStr)) {
          range.push(yearStr);
        }
      }
      setSelectedYears(range);
    }
  };

  const handleSaveAndNext = async () => {
    try {
      // Save current item first without closing modal
      await handleSaveCompatibility(false);

      // Track save-and-next action (hadData = compatibility list is non-empty)
      api.post('/ai/track-save-next', { hadData: editCompatList.length > 0 }).catch(() => { });

      // Check if there's a next item on current page
      if (currentListingIndex < listings.length - 1) {
        const nextItem = listings[currentListingIndex + 1];
        setSelectedItem(nextItem);
        setCurrentListingIndex(currentListingIndex + 1);
        setEditCompatList(JSON.parse(JSON.stringify(nextItem.compatibility || [])));
        setSelectedMake(null);
        setSelectedModel(null);
        setSelectedYears([]);
        setSelectedTrimsByYear({});
        setTrimsByYear({});
        setExpandedYears({});
        setStartYear('');
        setEndYear('');
        setNewNotes('');
      } else if (page < totalPages) {
        // Load next page and open first item
        setPendingNavigation('first');
        setPage(page + 1);
      } else {
        // No more items anywhere, close modal
        showSnackbar('No more listings to edit', 'info');
        setOpenModal(false);
      }
    } catch (e) {
      // Error already shown by handleSaveCompatibility
      console.error('Save and next failed:', e);
    }
  };

  const handleNavigatePrevious = () => {
    if (currentListingIndex > 0) {
      const prevItem = listings[currentListingIndex - 1];
      setSelectedItem(prevItem);
      setCurrentListingIndex(currentListingIndex - 1);
      setEditCompatList(JSON.parse(JSON.stringify(prevItem.compatibility || [])));
      setSelectedMake(null);
      setSelectedModel(null);
      setSelectedYears([]);
      setSelectedTrimsByYear({});
      setTrimsByYear({});
      setExpandedYears({});
      setStartYear('');
      setEndYear('');
      setNewNotes('');
      setTrimFilterKeyword('');
    } else if (page > 1) {
      // Load previous page and open last item
      setPendingNavigation('last');
      setPage(page - 1);
    }
  };

  const handleNavigateNext = () => {
    if (currentListingIndex < listings.length - 1) {
      const nextItem = listings[currentListingIndex + 1];
      setSelectedItem(nextItem);
      setCurrentListingIndex(currentListingIndex + 1);
      setEditCompatList(JSON.parse(JSON.stringify(nextItem.compatibility || [])));
      setSelectedMake(null);
      setSelectedModel(null);
      setSelectedYears([]);
      setSelectedTrimsByYear({});
      setTrimsByYear({});
      setExpandedYears({});
      setStartYear('');
      setEndYear('');
      setNewNotes('');
      setTrimFilterKeyword('');
    } else if (page < totalPages) {
      // Load next page and open first item
      setPendingNavigation('first');
      setPage(page + 1);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* HEADER WITH SEARCH */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box>
            <Typography variant="h5">Compatibility Dashboard</Typography>
            <Typography variant="caption" color="textSecondary">Showing {displayedListings.length}{filterNoFitment ? ` (filtered)` : ` of ${totalItems}`} Active Listings</Typography>
          </Box>

          {/* API USAGE BADGE */}
          {apiUsage && apiUsage.success && (
            <Tooltip
              title={`${apiUsage.used.toLocaleString()} / ${apiUsage.limit.toLocaleString()} calls used today. Resets in ${apiUsage.hoursUntilReset}h`}
              arrow
            >
              <Chip
                size="small"
                label={`API: ${Math.round((apiUsage.used / apiUsage.limit) * 100)}%`}
                color={
                  apiUsage.used / apiUsage.limit > 0.9 ? 'error' :
                    apiUsage.used / apiUsage.limit > 0.7 ? 'warning' :
                      'success'
                }
                variant="outlined"
                sx={{ fontSize: '0.75rem' }}
              />
            </Tooltip>
          )}

          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate('/admin/compatibility-batch-history')}
            sx={{ fontSize: '0.75rem', textTransform: 'none' }}
          >
            Batch History
          </Button>
        </Box>

        <Box display="flex" gap={2} alignItems="center">
          {/* SEARCH BOX */}
          <TextField
            size="small"
            placeholder="Search SKU, ID, Title..."
            value={searchTerm}
            onChange={(e) => {
              const newValue = e.target.value;
              setSearchTerm(newValue);

              // FIX: If user deletes everything, reload the full list immediately
              if (newValue === '') {
                setPage(1);
                loadListings(''); // Pass empty string to fetch all
              }
            }}
            onKeyPress={handleKeyPress}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  {searchTerm && (
                    <IconButton
                      onClick={() => {
                        setSearchTerm('');
                        setPage(1);
                        loadListings('');
                      }}
                      edge="end"
                      size="small"
                      sx={{ mr: 1 }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton onClick={handleSearch} edge="end">
                    <SearchIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ width: 300, bgcolor: 'white' }}
          />

          {/* GO TO PAGE INPUT */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              type="number"
              placeholder="Go to page"
              size="small"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGoToPage()}
              inputProps={{ min: 1, max: totalPages }}
              sx={{ width: 180 }}
            />
            <Button variant="outlined" size="small" onClick={handleGoToPage}>
              Go
            </Button>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={filterNoFitment}
                onChange={(e) => setFilterNoFitment(e.target.checked)}
                size="small"
                color="warning"
              />
            }
            label={
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                No Fitment Only
              </Typography>
            }
            sx={{ mr: 0 }}
          />

          {/* Listed On date filter (IST) — single or range */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="textSecondary" fontWeight={600}>
              Listed On (IST)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small" exclusive value={listedDateMode}
                onChange={(_, v) => {
                  if (!v) return;
                  setListedDateMode(v);
                  setListedDate(''); setListedFrom(''); setListedTo('');
                  setPage(1);
                }}
                sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.7rem' } }}
              >
                <ToggleButton value="single">Single</ToggleButton>
                <ToggleButton value="range">Range</ToggleButton>
              </ToggleButtonGroup>
              {listedDateMode === 'single' ? (
                <TextField
                  type="date" size="small" InputLabelProps={{ shrink: true }}
                  value={listedDate}
                  onChange={e => { setListedDate(e.target.value); setPage(1); }}
                  sx={{ width: 150 }}
                />
              ) : (
                <>
                  <TextField
                    label="From" type="date" size="small" InputLabelProps={{ shrink: true }}
                    value={listedFrom}
                    onChange={e => { setListedFrom(e.target.value); setPage(1); }}
                    sx={{ width: 150 }}
                  />
                  <TextField
                    label="To" type="date" size="small" InputLabelProps={{ shrink: true }}
                    value={listedTo}
                    onChange={e => { setListedTo(e.target.value); setPage(1); }}
                    sx={{ width: 150 }}
                  />
                </>
              )}
              {(listedDate || listedFrom || listedTo) && (
                <Button size="small" variant="outlined" onClick={() => { setListedDate(''); setListedFrom(''); setListedTo(''); setPage(1); }}>Clear</Button>
              )}
            </Box>
          </Box>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Select Seller</InputLabel>
            <Select value={currentSellerId} label="Select Seller" onChange={(e) => setCurrentSellerId(e.target.value)}>
              {sellers.map((s) => (<MenuItem key={s._id} value={s._id}>{s.user?.username || s.user?.email}</MenuItem>))}
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />} onClick={handleSync} disabled={syncing || syncingAll || !currentSellerId}>
            {syncing ? 'Syncing...' : 'Poll eBay'}
          </Button>
          <Button variant="outlined" color="secondary" startIcon={syncingAll ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />} onClick={handleSyncAll} disabled={syncing || syncingAll}>
            {syncingAll ? (syncAllProgress || 'Syncing All...') : 'Poll All Sellers'}
          </Button>
        </Box>
      </Box>

      {/* POLL ALL SELLERS RUNNING BANNER */}
      {syncingAll && (
        <Alert
          severity="info"
          sx={{ mb: 2, borderRadius: 2 }}
          icon={<CircularProgress size={18} color="inherit" />}
        >
          <Typography variant="body2" fontWeight={700}>
            Poll All Sellers in progress
          </Typography>
          {syncAllProgress && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
              {syncAllProgress}
            </Typography>
          )}
        </Alert>
      )}

      {/* TABLE */}
      {loading ? <Box display="flex" justifyContent="center" mt={5}><CircularProgress /></Box> : (
        <>
          {/* Bulk select toolbar */}
          {selectedIds.size > 0 && (
            <Box sx={{
              mb: 1, display: 'flex', alignItems: 'center', gap: 2,
              p: 1.5, bgcolor: '#f0f4ff', borderRadius: 1, border: '1px solid #c7d7fd'
            }}>
              <Typography variant="body2" fontWeight={600}>
                {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                onClick={handleBulkAiSuggest}
                sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, fontWeight: 600 }}
              >
                ✨ AI Suggest Selected ({selectedIds.size})
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear Selection
              </Button>
            </Box>
          )}
          <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={displayedListings.length > 0 && displayedListings.every(l => selectedIds.has(l.itemId))}
                      indeterminate={selectedIds.size > 0 && !displayedListings.every(l => selectedIds.has(l.itemId))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(displayedListings.map(l => l.itemId)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      title="Select all on this page"
                    />
                  </TableCell>
                  <TableCell width="80">Image</TableCell>
                  <TableCell width="25%">Title & SKU</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Listed On</TableCell>
                  <TableCell width="40%">Fitment Summary</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedListings.map((item, index) => {
                  const fitmentSummary = groupFitmentData(item.compatibility);
                  const isSelected = selectedIds.has(item.itemId);
                  return (
                    <TableRow key={item.itemId} selected={isSelected} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={(e) => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(item.itemId);
                              else next.delete(item.itemId);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>{item.mainImageUrl && <img src={item.mainImageUrl} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }} />}</TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" sx={{ lineHeight: 1.2, mb: 0.5 }}>{item.title}</Typography>
                        <Chip label={item.sku || 'No SKU'} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                        <Typography variant="caption" display="block" color="textSecondary" mt={0.5}>ID: {item.itemId}</Typography>
                      </TableCell>
                      <TableCell>{item.currency} {item.currentPrice}</TableCell>
                      <TableCell><Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.startTime)}</Typography></TableCell>

                      <TableCell>
                        {fitmentSummary.length > 0 ? (
                          <Box sx={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #eee', borderRadius: 1, p: 1, bgcolor: '#fafafa' }}>
                            {fitmentSummary.map((grp, i) => (
                              <Typography key={i} variant="caption" display="block" sx={{ mb: 0.5, lineHeight: 1.3 }}>
                                <b>{grp.title}</b>: {grp.years}
                              </Typography>
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>No compatibility data</Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => handleEditClick(item, index)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="textSecondary">
              Showing {displayedListings.length}{filterNoFitment ? ' (filtered)' : ` of ${totalItems}`} listings
            </Typography>
            <Pagination count={totalPages} page={page} onChange={(e, v) => setPage(v)} color="primary" showFirstButton showLastButton />
          </Box>
        </>
      )}

      {/* EDIT MODAL */}
      <Dialog
        open={openModal}
        onClose={(event, reason) => {
          if (reason !== 'backdropClick') {
            setOpenModal(false);
          }
        }}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
          <Box>
            {bulkMode && (
              <Box sx={{ mb: 1 }}>
                {/* Queue progress bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 14, color: '#7c3aed' }} />
                  <Typography variant="caption" fontWeight={700} sx={{ color: '#7c3aed' }}>
                    Bulk AI Queue — Item {bulkQueueIdx + 1} of {bulkQueue.length}
                  </Typography>
                  <Chip label={`✓ ${bulkQueue.filter(q => q.reviewStatus === 'correct').length}`} size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  <Chip label={`⊘ ${bulkQueue.filter(q => q.reviewStatus === 'skipped').length}`} size="small" color="default" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  {bulkQueue[bulkQueueIdx]?.status === 'loading' && (
                    <><CircularProgress size={11} sx={{ color: '#7c3aed', ml: 0.5 }} />
                      <Typography variant="caption" color="textSecondary">AI analyzing...</Typography></>
                  )}
                  {bulkQueue[bulkQueueIdx]?.status === 'no-match' && (
                    <Chip label="⚠️ No fitment found — fill manually" color="warning" size="small" />
                  )}
                  {bulkQueue[bulkQueueIdx]?.status === 'error' && (
                    <Chip label={`❌ ${bulkQueue[bulkQueueIdx]?.error}`} color="error" size="small" />
                  )}
                </Box>
                {/* Validation warnings */}
                {bulkQueue[bulkQueueIdx]?.status === 'ready' && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {!bulkQueue[bulkQueueIdx]?.modelExists && (
                      <Chip label={`⚠️ Model "${bulkQueue[bulkQueueIdx]?.aiData?.model}" not in eBay DB`} color="warning" size="small" />
                    )}
                    {!bulkQueue[bulkQueueIdx]?.yearsExist && (
                      <Chip label={`⚠️ Years ${bulkQueue[bulkQueueIdx]?.aiData?.startYear}–${bulkQueue[bulkQueueIdx]?.aiData?.endYear} not in eBay DB`} color="warning" size="small" />
                    )}
                    {bulkQueue[bulkQueueIdx]?.modelExists && bulkQueue[bulkQueueIdx]?.yearsExist && (
                      <Chip label="✅ Make / Model / Years verified in eBay DB" color="success" size="small" />
                    )}
                  </Box>
                )}
              </Box>
            )}
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '1.3rem' }}>
              {selectedItem?.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" color="textSecondary">
                ID: {selectedItem?.itemId}
              </Typography>
              {selectedItem?.sku && (
                <Chip
                  label={`SKU: ${selectedItem.sku}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.75rem' }}
                />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ mr: 1 }}>
              {(page - 1) * 100 + currentListingIndex + 1} / {totalItems}
            </Typography>
            <IconButton
              size="small"
              onClick={handleNavigatePrevious}
              disabled={currentListingIndex <= 0 && page <= 1}
              title="Previous listing"
            >
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleNavigateNext}
              disabled={currentListingIndex >= listings.length - 1 && page >= totalPages}
              title="Next listing"
            >
              <NavigateNextIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setOpenModal(false)}
              title="Close"
              sx={{ ml: 1 }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', height: '75vh' }}>

          <Box sx={{ flex: 1, borderRight: '1px solid #eee', p: 2, overflowY: 'auto', bgcolor: '#fafafa' }}>
            {/* Product Image */}
            {selectedItem?.mainImageUrl && (
              <Box sx={{ mb: 2, textAlign: 'center' }}>
                <img
                  src={selectedItem.mainImageUrl}
                  alt={selectedItem?.title || 'Product'}
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
            {selectedItem?.descriptionPreview ? (
              <div style={{ padding: 15, backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: 4 }} dangerouslySetInnerHTML={{ __html: selectedItem.descriptionPreview }} />
            ) : <Typography variant="body2" color="textSecondary">No preview available.</Typography>}
          </Box>

          <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Compatible Vehicles ({editCompatList.length})
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

            <Grid container spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
              {/* MAKE */}
              <Grid item xs={3}>
                <Autocomplete
                  options={makeOptions}
                  value={selectedMake}
                  onChange={(e, val) => {
                    setSelectedMake(val);
                    if (val) {
                      fetchModels(val);
                    } else {
                      // Reset all dependent fields when make is cleared
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
                  options={modelOptions}
                  value={selectedModel}
                  onChange={(e, val) => {
                    setSelectedModel(val);
                    if (val) {
                      fetchYears(selectedMake, val);
                    } else {
                      // Reset all dependent fields when model is cleared
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
                          label={`${selectedYears.length} years (${selectedYears[0]} - ${selectedYears[selectedYears.length - 1]})`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  )}
                  {/* Select All Button */}
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
              {selectedModel && Object.keys(trimsByYear).length > 0 && (() => {
                const totalTrims = Object.values(trimsByYear).reduce((sum, arr) => sum + arr.length, 0);
                const totalSelected = Object.values(selectedTrimsByYear).reduce((sum, arr) => sum + (arr?.length || 0), 0);
                const allSelected = totalSelected === totalTrims && totalTrims > 0;

                // Filter trims based on keyword
                const filterKeywordLower = trimFilterKeyword.toLowerCase().trim();
                const getFilteredTrims = (entries) => {
                  if (!filterKeywordLower) return entries;
                  return entries.filter(entry =>
                    entry.trim?.toLowerCase().includes(filterKeywordLower) ||
                    entry.engine?.toLowerCase().includes(filterKeywordLower)
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
                                  // Deselect all filtered trims
                                  const updated = { ...selectedTrimsByYear };
                                  Object.entries(filteredTrimsByYear).forEach(([year, entries]) => {
                                    const yearSelected = updated[year] || [];
                                    const filteredKeys = new Set(entries.map(trimKey));
                                    updated[year] = yearSelected.filter(e => !filteredKeys.has(trimKey(e)));
                                  });
                                  setSelectedTrimsByYear(updated);
                                } else {
                                  // Select all filtered trims
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
                                {/* Year header row */}
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
                                {/* Expanded trim+engine table */}
                                <Collapse in={isExpanded}>
                                  <Box sx={{ pl: 5 }}>
                                    {/* Table header */}
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
              })()}
              {loadingTrims && selectedModel && (
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="textSecondary">Loading trims...</Typography>
                  </Box>
                </Grid>
              )}
              <Grid item xs={2}><TextField label="Notes" size="small" value={newNotes} onChange={e => setNewNotes(e.target.value)} fullWidth /></Grid>
              <Grid item xs={1}><Button variant="contained" onClick={handleAddVehicle} sx={{ height: 40 }}><AddIcon /></Button></Grid>
            </Grid>

            <Divider sx={{ mb: 2 }} />

            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>Vehicle Details</TableCell><TableCell>Notes</TableCell><TableCell>Action</TableCell></TableRow></TableHead>
                <TableBody>
                  {editCompatList.map((compat, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>{getVehicleString(compat.nameValueList)}</TableCell>
                      <TableCell>{compat.notes}</TableCell>
                      <TableCell><IconButton size="small" color="error" onClick={() => handleRemoveVehicle(idx)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setBulkMode(false); setBulkQueue([]); setOpenModal(false); }}>Cancel</Button>
          {bulkMode ? (
            <>
              <Button
                onClick={handleBulkQueuePrevious}
                variant="outlined"
                disabled={bulkQueueIdx === 0}
              >
                ← Previous
              </Button>
              <Button
                onClick={handleEndListing}
                variant="outlined"
                color="error"
                disabled={bulkQueue[bulkQueueIdx]?.status === 'loading' || bulkQueue[bulkQueueIdx]?.endingLoading}
                startIcon={bulkQueue[bulkQueueIdx]?.endingLoading ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {bulkQueue[bulkQueueIdx]?.endingLoading ? 'Ending...' : 'End Listing'}
              </Button>
              <Button
                onClick={() => handleBulkQueueNext(true)}
                variant="outlined"
                color="secondary"
              >
                Skip → ({bulkQueueIdx + 1}/{bulkQueue.length})
              </Button>
              <Button
                onClick={handleMarkCorrect}
                variant="contained"
                color="success"
                disabled={bulkQueue[bulkQueueIdx]?.status === 'loading' || bulkQueue[bulkQueueIdx]?.endingLoading || editCompatList.length === 0}
                sx={{ fontWeight: 700 }}
              >
                ✓ Correct ({bulkQueueIdx + 1}/{bulkQueue.length})
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => handleSaveCompatibility(true)} variant="outlined" color="primary">Save</Button>
              <Button
                onClick={handleSaveAndNext}
                variant="contained"
                color="primary"
                disabled={currentListingIndex >= listings.length - 1 && page >= totalPages}
              >
                Save and Go to Next
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* BULK REVIEW SUMMARY DIALOG */}
      <Dialog open={showBulkSummary} onClose={() => { if (!bulkSending) handleCloseBulkSummary(); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ borderBottom: '1px solid #eee' }}>
          <Typography variant="h6" fontWeight="bold">
            {bulkSendResults ? 'Bulk Send Results' : 'Bulk Review Summary'}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {!bulkSendResults ? (
            // PRE-SEND SUMMARY
            <>
              <Box sx={{ display: 'flex', gap: 3, mb: 3, mt: 1 }}>
                <Paper sx={{ flex: 1, p: 2, textAlign: 'center', bgcolor: '#f0f4ff', border: '1px solid #c7d7fd' }}>
                  <Typography variant="h4" fontWeight="bold" color="primary">{bulkQueue.length}</Typography>
                  <Typography variant="body2" color="textSecondary">Total Items</Typography>
                </Paper>
                <Paper sx={{ flex: 1, p: 2, textAlign: 'center', bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <Typography variant="h4" fontWeight="bold" color="success.main">{bulkQueue.filter(q => q.reviewStatus === 'correct').length}</Typography>
                  <Typography variant="body2" color="textSecondary">Marked Correct</Typography>
                </Paper>
                <Paper sx={{ flex: 1, p: 2, textAlign: 'center', bgcolor: '#fefce8', border: '1px solid #fef08a' }}>
                  <Typography variant="h4" fontWeight="bold" color="warning.main">{bulkQueue.filter(q => q.reviewStatus === 'skipped' || q.reviewStatus === 'pending' || !q.reviewStatus).length}</Typography>
                  <Typography variant="body2" color="textSecondary">Skipped</Typography>
                </Paper>
                <Paper sx={{ flex: 1, p: 2, textAlign: 'center', bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
                  <Typography variant="h4" fontWeight="bold" color="error.main">{bulkQueue.filter(q => q.reviewStatus === 'ended').length}</Typography>
                  <Typography variant="body2" color="textSecondary">Ended</Typography>
                </Paper>
              </Box>

              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>Items to send to eBay:</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, mb: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Status</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Item ID</TableCell>
                      <TableCell align="right">Vehicles</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkQueue.map((q, idx) => (
                      <TableRow key={idx} sx={{ bgcolor: q.reviewStatus === 'correct' ? '#f0fdf4' : '#fafafa' }}>
                        <TableCell>
                          <Chip
                            label={q.reviewStatus === 'correct' ? '✓ Correct' : q.reviewStatus === 'ended' ? 'Ended' : 'Skipped'}
                            size="small"
                            color={q.reviewStatus === 'correct' ? 'success' : q.reviewStatus === 'ended' ? 'error' : 'default'}
                            variant={q.reviewStatus === 'correct' ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.item.title}
                        </TableCell>
                        <TableCell><Typography variant="caption">{q.item.itemId}</Typography></TableCell>
                        <TableCell align="right">{q.reviewStatus === 'correct' ? q.finalCompatList?.length || 0 : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            // POST-SEND RESULTS
            <>
              <Box sx={{ display: 'flex', gap: 3, mb: 3, mt: 1 }}>
                <Paper sx={{ flex: 1, p: 2, textAlign: 'center', bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <Typography variant="h4" fontWeight="bold" color="success.main">{bulkSendResults.successCount}</Typography>
                  <Typography variant="body2" color="textSecondary">Successful</Typography>
                </Paper>
                <Paper sx={{ flex: 1, p: 2, textAlign: 'center', bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
                  <Typography variant="h4" fontWeight="bold" color="error.main">{bulkSendResults.failureCount}</Typography>
                  <Typography variant="body2" color="textSecondary">Failed</Typography>
                </Paper>
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Status</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Item ID</TableCell>
                      <TableCell>Vehicles</TableCell>
                      <TableCell>Error / Warning</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkSendResults.results.map((r, idx) => (
                      <TableRow key={idx} sx={{ bgcolor: r.status === 'success' ? '#f0fdf4' : '#fef2f2' }}>
                        <TableCell>
                          <Chip
                            label={r.status === 'success' ? '✓ Success' : '✗ Failed'}
                            size="small"
                            color={r.status === 'success' ? 'success' : 'error'}
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title}
                        </TableCell>
                        <TableCell><Typography variant="caption">{r.itemId}</Typography></TableCell>
                        <TableCell>{r.compatibilityCount}</TableCell>
                        <TableCell>
                          {r.error && (
                            <Typography variant="caption" color={r.status === 'success' ? 'warning.main' : 'error.main'}>
                              {r.error}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {!bulkSendResults ? (
            <>
              <Button onClick={handleCloseBulkSummary} disabled={bulkSending}>Cancel</Button>
              <Button
                onClick={handleBulkSendToEbay}
                variant="contained"
                color="primary"
                disabled={bulkSending || bulkQueue.filter(q => q.reviewStatus === 'correct').length === 0}
                startIcon={bulkSending ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ fontWeight: 700 }}
              >
                {bulkSending
                  ? `Sending ${bulkQueue.filter(q => q.reviewStatus === 'correct').length} items...`
                  : `Send ${bulkQueue.filter(q => q.reviewStatus === 'correct').length} Items to eBay`}
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseBulkSummary} variant="contained">Done</Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'error' ? 10000 : 6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            width: '100%',
            whiteSpace: 'pre-line' // Allow multi-line text
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}