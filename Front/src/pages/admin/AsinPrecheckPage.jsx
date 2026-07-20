import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import api, { getAuthToken } from '../../lib/api.js';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import { tableHeaderCellSx, tableContainerSx, yellowFilledButtonSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';
import { parseAsins, getParsingStats } from '../../utils/asinParser.js';

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: 'Amazon.com (US)' },
  { value: 'UK', label: 'Amazon.co.uk (UK)' },
  { value: 'CA', label: 'Amazon.ca (Canada)' },
  { value: 'AU', label: 'Amazon.com.au (Australia)' }
];

const ASIN_PRECHECK_PREFERENCES_KEY = 'asinPrecheckPreferences';

const DEFAULT_FILTERS = {
  priceFrom: '',
  priceTo: '',
  minRating: '',
  deliveryWithinDays: '',
  keyword: '',
  stock: 'all',
  active: 'all',
  hideExcluded: true
};

const DEFAULT_PREFERENCES = {
  sellerId: '',
  templateId: '',
  region: 'US',
  ebayMotorsMode: false,
  filters: DEFAULT_FILTERS
};

const getSavedPrecheckPreferences = () => {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const saved = JSON.parse(window.localStorage.getItem(ASIN_PRECHECK_PREFERENCES_KEY) || '{}');
    return {
      sellerId: saved.sellerId || DEFAULT_PREFERENCES.sellerId,
      templateId: saved.templateId || DEFAULT_PREFERENCES.templateId,
      region: saved.region || DEFAULT_PREFERENCES.region,
      ebayMotorsMode: Boolean(saved.ebayMotorsMode),
      filters: {
        ...DEFAULT_FILTERS,
        ...(saved.filters || {})
      }
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const getSellerDisplayName = (seller) =>
  seller?.user?.username || seller?.user?.email || seller?.name || 'Unknown Seller';

const isRowComplete = (row) => row.status !== 'loading' && row.status !== 'error';

const formatDeliveryLabel = (row) => {
  if (row.status === 'loading') return 'Checking';
  if (row.deliveryDays == null) return 'Unknown';
  if (row.deliveryDays === 0) return 'Today';
  if (row.deliveryDays === 1) return '1 day';
  return `${row.deliveryDays} days`;
};

const getDeliveryTooltip = (row) => {
  if (row.status === 'loading') return 'Checking delivery date';
  if (row.deliveryDate) {
    return row.shippingTime ? `${row.deliveryDate} (${row.shippingTime})` : row.deliveryDate;
  }
  return row.shippingTime || row.shippingCondition || 'Delivery date unavailable';
};

const formatEbayMotorsTooltip = (row) => {
  const detected = row.ebayMotorsDetected || {};
  const signals = row.ebayMotorsSignals || {};
  const modelNames = Array.isArray(detected.modelNames) && detected.modelNames.length > 0
    ? detected.modelNames.join(', ')
    : 'None';
  const years = Array.isArray(detected.years) && detected.years.length > 0
    ? detected.years.join(', ')
    : 'None';
  const universalPhrase = detected.universalPhrase || 'None';

  return [
    row.ebayMotorsReason || 'eBay Motors title eligibility',
    `Model detected: ${signals.hasModel ? 'Yes' : 'No'} (${modelNames})`,
    `Year detected: ${signals.hasYear ? 'Yes' : 'No'} (${years})`,
    `Universal detected: ${signals.isUniversal ? 'Yes' : 'No'} (${universalPhrase})`
  ].join('\n');
};

export default function AsinPrecheckPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const dashboardTheme = theme.customTokens?.dashboardSignature || dashboardSignatureTokens;
  const savedPreferences = useMemo(() => getSavedPrecheckPreferences(), []);

  const [setupOpen, setSetupOpen] = useState(true);
  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [asinInput, setAsinInput] = useState('');
  const [region, setRegion] = useState(savedPreferences.region);
  const [ebayMotorsMode, setEbayMotorsMode] = useState(savedPreferences.ebayMotorsMode);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [imagePreview, setImagePreview] = useState(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [filters, setFilters] = useState(savedPreferences.filters);
  const [keywordDraft, setKeywordDraft] = useState(savedPreferences.filters.keyword || '');
  const [keywordIntent, setKeywordIntent] = useState('included');

  const surfaceSx = {
    borderRadius: `${dashboardTheme.radius.card}px`,
    border: '1px solid',
    borderColor: alpha(BRAND_DARK, 0.08),
    backgroundColor: theme.palette.background.paper,
    boxShadow: dashboardTheme.shadows.card
  };

  useEffect(() => {
    let mounted = true;

    const loadSetupData = async () => {
      try {
        setLoadingSetup(true);
        const [sellerRes, templateRes] = await Promise.all([
          api.get('/sellers/all'),
          api.get('/listing-templates')
        ]);

        if (!mounted) return;
        const sellerList = sellerRes.data || [];
        const templateList = templateRes.data || [];
        setSellers(sellerList);
        setTemplates(templateList);
        const savedSellerExists = sellerList.some(seller => seller._id === savedPreferences.sellerId);
        const savedTemplateExists = templateList.some(template => template._id === savedPreferences.templateId);
        setSellerId(savedSellerExists ? savedPreferences.sellerId : sellerList[0]?._id || '');
        setTemplateId(savedTemplateExists ? savedPreferences.templateId : templateList[0]?._id || '');
      } catch (err) {
        console.error('Failed to load ASIN precheck setup data:', err);
        if (mounted) setError('Failed to load sellers or templates');
      } finally {
        if (mounted) setLoadingSetup(false);
      }
    };

    loadSetupData();

    return () => {
      mounted = false;
      if (window._asinPrecheckEventSource) {
        window._asinPrecheckEventSource.close();
        window._asinPrecheckEventSource = null;
      }
    };
  }, [savedPreferences.sellerId, savedPreferences.templateId]);

  useEffect(() => {
    if (loadingSetup) return;

    try {
      window.localStorage.setItem(ASIN_PRECHECK_PREFERENCES_KEY, JSON.stringify({
        sellerId,
        templateId,
        region,
        ebayMotorsMode,
        filters
      }));
    } catch {
      // Local storage is a convenience only; the precheck flow can continue without it.
    }
  }, [sellerId, templateId, region, ebayMotorsMode, filters, loadingSetup]);

  const getFilteredRows = (sourceRows, options = {}) => {
    const keyword = (options.keyword ?? filters.keyword).trim().toLowerCase();
    const priceFrom = Number(options.priceFrom ?? filters.priceFrom);
    const priceTo = Number(options.priceTo ?? filters.priceTo);
    const minRating = Number(options.minRating ?? filters.minRating);
    const deliveryWithinDays = Number(options.deliveryWithinDays ?? filters.deliveryWithinDays);
    const stock = options.stock ?? filters.stock;
    const active = options.active ?? filters.active;
    const hideExcluded = options.hideExcluded ?? filters.hideExcluded;
    const focusIncluded = options.focusIncluded ?? true;
    const hasIncludedRows = focusIncluded && sourceRows.some(row => row.intent === 'included');

    return sourceRows.filter(row => {
      if (hideExcluded && row.intent === 'excluded') return false;
      if (hasIncludedRows && row.intent !== 'included') return false;
      if (keyword && !String(row.title || '').toLowerCase().includes(keyword)) return false;
      if (Number.isFinite(priceFrom) && String(options.priceFrom ?? filters.priceFrom) !== '' && !(Number(row.priceNumber) >= priceFrom)) return false;
      if (Number.isFinite(priceTo) && String(options.priceTo ?? filters.priceTo) !== '' && !(Number(row.priceNumber) <= priceTo)) return false;
      if (Number.isFinite(minRating) && String(options.minRating ?? filters.minRating) !== '' && !(Number(row.rating) >= minRating)) return false;
      if (Number.isFinite(deliveryWithinDays) && String(options.deliveryWithinDays ?? filters.deliveryWithinDays) !== '' && !(Number(row.deliveryDays) <= deliveryWithinDays)) return false;
      if (stock === 'in_stock' && row.inStock !== true) return false;
      if (stock === 'out_of_stock' && row.inStock !== false) return false;
      if (active === 'active' && row.active !== true) return false;
      if (active === 'inactive' && row.active !== false) return false;
      return true;
    });
  };

  const visibleRows = useMemo(
    () => getFilteredRows(rows),
    [rows, filters]
  );

  const keywordDraftMatchedRows = useMemo(() => {
    const keyword = keywordDraft.trim();
    if (!keyword) return [];
    return getFilteredRows(rows, { ...filters, keyword, focusIncluded: false }).filter(isRowComplete);
  }, [rows, filters, keywordDraft]);

  const selectedRows = useMemo(
    () => rows.filter(row => selectedIds.has(row.id)),
    [rows, selectedIds]
  );

  const completedRows = useMemo(
    () => rows.filter(row => row.status !== 'loading'),
    [rows]
  );

  const visibleInactiveRows = useMemo(
    () => visibleRows.filter(row => row.status !== 'loading' && !row.active),
    [visibleRows]
  );

  const visibleActiveCount = useMemo(
    () => visibleRows.filter(row => row.status !== 'loading' && row.active).length,
    [visibleRows]
  );

  const includedCount = useMemo(
    () => rows.filter(row => row.intent === 'included').length,
    [rows]
  );

  const excludedCount = useMemo(
    () => rows.filter(row => row.intent === 'excluded').length,
    [rows]
  );

  const finalRows = useMemo(
    () => rows.filter(row => (
      isRowComplete(row)
      && row.intent !== 'excluded'
      && !(row.ebayMotorsMode && row.ebayMotorsEligible === false)
      && (row.intent === 'included' || selectedIds.has(row.id))
    )),
    [rows, selectedIds]
  );

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const parseSetupAsins = () => parseAsins(asinInput);

  const updateRow = (incomingRow) => {
    setRows(prev => prev.map(row => (
      row.asin === incomingRow.asin
        ? {
            ...row,
            ...incomingRow,
            image: incomingRow.image || incomingRow.sourceData?.images?.[0] || ''
          }
        : row
    )));
  };

  const runPrecheck = () => {
    const asins = parseSetupAsins();
    const stats = getParsingStats(asinInput);

    setError('');
    setSuccess('');

    if (!sellerId || !templateId) {
      setError('Seller and template are required');
      return;
    }

    if (asins.length === 0) {
      setError('Please enter valid ASINs');
      return;
    }

    if (asins.length > 100) {
      setError('Maximum 100 ASINs allowed per batch');
      return;
    }

    if (stats.invalid > 0) {
      console.warn(`ASIN Precheck ignored ${stats.invalid} invalid ASIN(s)`);
    }

    const existingAsins = new Set(rows.map(row => row.asin));
    const asinsToCheck = asins.filter(asin => !existingAsins.has(asin));
    const skippedCount = asins.length - asinsToCheck.length;

    if (asinsToCheck.length === 0) {
      setError('All entered ASINs are already in this precheck.');
      return;
    }

    if (window._asinPrecheckEventSource) {
      window._asinPrecheckEventSource.close();
      window._asinPrecheckEventSource = null;
    }

    const initialRows = asinsToCheck.map(asin => ({
      id: `asin-precheck-${asin}`,
      asin,
      sku: '',
      active: false,
      title: '',
      image: '',
      price: '',
      priceNumber: null,
      rating: null,
      reviewCount: null,
      shippingTime: '',
      shippingCondition: '',
      marketplaceTimezone: '',
      scrapedAt: null,
      deliveryDate: null,
      deliveryDays: null,
      availabilityStatus: '',
      inStock: null,
      ebayMotorsMode,
      ebayMotorsEligible: null,
      ebayMotorsReason: '',
      ebayMotorsSignals: null,
      ebayMotorsDetected: null,
      intent: 'neutral',
      status: 'loading',
      progressStage: 'queued',
      errors: []
    }));

    setRows(prev => [...prev, ...initialRows]);
    setProgress({ current: 0, total: asinsToCheck.length });
    setRunning(true);
    setSetupOpen(false);
    setAsinInput('');
    if (skippedCount > 0) {
      setSuccess(`Skipped ${skippedCount} ASIN${skippedCount === 1 ? '' : 's'} already in this precheck.`);
    }

    const authToken = getAuthToken();
    const asinParam = asinsToCheck.join(',');
    const sseUrl = `/template-listings/asin-precheck-stream?templateId=${templateId}&sellerId=${sellerId}&asins=${encodeURIComponent(asinParam)}&region=${encodeURIComponent(region)}&ebayMotorsMode=${ebayMotorsMode ? 'true' : 'false'}&token=${encodeURIComponent(authToken)}`;
    const eventSource = new EventSource(api.defaults.baseURL + sseUrl);

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        if (window._asinPrecheckEventSource === eventSource) {
          window._asinPrecheckEventSource = null;
        }
        setRunning(false);
        return;
      }

      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'started':
            setProgress({ current: 0, total: message.total || asinsToCheck.length });
            break;
          case 'ping':
            break;
          case 'item_started':
            setRows(prev => prev.map(row => (
              row.asin === message.asin
                ? { ...row, progressStage: message.progressStage || 'fetching' }
                : row
            )));
            break;
          case 'item':
            updateRow(message.item);
            setProgress({ current: message.progress || 0, total: message.total || asinsToCheck.length });
            break;
          case 'complete':
            setProgress(prev => ({ ...prev, current: message.total || prev.current }));
            break;
          case 'error':
            setError(message.error || 'ASIN precheck failed');
            break;
          default:
            break;
        }
      } catch (parseError) {
        console.error('Failed to parse ASIN precheck stream event:', parseError);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (window._asinPrecheckEventSource === eventSource) {
        window._asinPrecheckEventSource = null;
      }
      setRunning(false);
      setError('Connection lost. Some ASINs may not have loaded.');
    };

    window._asinPrecheckEventSource = eventSource;
  };

  const toggleRow = (rowId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const selectRows = (nextRows) => {
    setSelectedIds(new Set(nextRows.map(row => row.id)));
  };

  const setRowIntent = (rowIds, intent) => {
    const idSet = new Set(rowIds);
    setRows(prev => prev.map(row => (
      idSet.has(row.id)
        ? {
            ...row,
            intent: row.ebayMotorsMode && row.ebayMotorsEligible === false && intent === 'included'
              ? 'excluded'
              : intent
          }
        : row
    )));
  };

  const applyKeywordIntent = (event) => {
    event.preventDefault();
    const keyword = keywordDraft.trim();
    if (!keyword) return;

    const matchedRowIds = keywordDraftMatchedRows.map(row => row.id);
    updateFilter('keyword', keyword);
    if (matchedRowIds.length > 0) {
      setRowIntent(matchedRowIds, keywordIntent);
    }
  };

  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setKeywordDraft('');
    setKeywordIntent('included');
  };

  const discardSelected = () => {
    if (selectedIds.size === 0) return;
    setRows(prev => prev.filter(row => !selectedIds.has(row.id)));
    setSelectedIds(new Set());
    setDiscardConfirmOpen(false);
  };

  const copySelectedAsins = async () => {
    const asins = selectedRows.map(row => row.asin);
    if (asins.length === 0) return;

    try {
      await navigator.clipboard.writeText(asins.join('\n'));
      setSuccess(`Copied ${asins.length} ASIN${asins.length === 1 ? '' : 's'}`);
    } catch {
      setError('Could not copy ASINs to clipboard');
    }
  };

  const continueToAddListings = () => {
    const asins = finalRows.map(row => row.asin);
    if (asins.length === 0) {
      setError('Select or include at least one non-excluded ASIN to continue');
      return;
    }

    const nonce = `${Date.now()}`;
    sessionStorage.setItem('asinPrecheckHandoff', JSON.stringify({
      sellerId,
      templateId,
      asins,
      region,
      nonce,
      createdAt: Date.now()
    }));

    setRows([]);
    setSelectedIds(new Set());
    setProgress({ current: 0, total: 0 });
    setAsinInput('');
    navigate(`/admin/select-seller-lab?templateId=${templateId}&sellerId=${sellerId}&fromAsinPrecheck=${nonce}`);
  };

  const visibleCompletedRows = visibleRows.filter(isRowComplete);
  const allVisibleSelected = visibleCompletedRows.length > 0 && visibleCompletedRows.every(row => selectedIds.has(row.id));

  return (
    <AdminPageShell
      title="ASIN Precheck"
      subtitle={rows.length > 0 ? `${completedRows.length}/${rows.length} checked` : undefined}
    >
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

        <Paper sx={{ ...surfaceSx, p: { xs: 1.5, md: 2 } }}>
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', lg: 'center' }}
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button
                  variant="outlined"
                  onClick={() => setSetupOpen(true)}
                  startIcon={<SearchIcon />}
                  sx={yellowOutlinedButtonSx}
                >
                  New Precheck
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => selectRows(visibleRows.filter(isRowComplete))}
                  disabled={visibleRows.filter(isRowComplete).length === 0}
                >
                  Select Visible
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => selectRows(visibleInactiveRows)}
                  disabled={visibleInactiveRows.length === 0}
                >
                  Select All Inactive
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setDiscardConfirmOpen(true)}
                  disabled={selectedIds.size === 0}
                  startIcon={<DeleteIcon />}
                >
                  Discard
                </Button>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ebayMotorsMode}
                      onChange={(event) => setEbayMotorsMode(event.target.checked)}
                      disabled={rows.length > 0 || running}
                    />
                  }
                  label="eBay Motors"
                  sx={{
                    ml: { md: 0.5 },
                    px: 1,
                    borderRadius: 1.5,
                    bgcolor: ebayMotorsMode ? alpha(BRAND_YELLOW, 0.2) : alpha(BRAND_DARK, 0.035),
                    '& .MuiFormControlLabel-label': {
                      ml: 0.75,
                      fontWeight: 700
                    }
                  }}
                />
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }} flexWrap="wrap" useFlexGap>
                <Button
                  variant="outlined"
                  onClick={copySelectedAsins}
                  disabled={selectedIds.size === 0}
                  startIcon={<CopyIcon />}
                >
                  Copy ASINs
                </Button>
                <Button
                  variant="contained"
                  onClick={continueToAddListings}
                  disabled={finalRows.length === 0}
                  startIcon={<PlayIcon />}
                  sx={yellowFilledButtonSx}
                >
                  Continue ({finalRows.length})
                </Button>
              </Stack>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{
                px: 1.25,
                py: 1,
                borderRadius: 1.5,
                bgcolor: alpha(BRAND_DARK, 0.035)
              }}
            >
              <Chip
                label={`Showing ASINs: ${visibleRows.length}/${rows.length}`}
                sx={{
                  bgcolor: alpha(BRAND_DARK, 0.08),
                  fontWeight: 800
                }}
              />
              <Chip label={`Active: ${visibleActiveCount}`} color="success" variant="outlined" />
              <Chip label={`Inactive: ${visibleInactiveRows.length}`} color="error" variant="outlined" />
              <Chip label={`Included: ${includedCount}`} color="primary" variant="outlined" />
              <Chip label={`Excluded: ${excludedCount}`} color="warning" variant="outlined" />
              <Chip label={`Selected: ${selectedIds.size}`} sx={{ bgcolor: alpha(BRAND_YELLOW, 0.24), fontWeight: 700 }} />
              <Chip label={`Final: ${finalRows.length}`} sx={{ bgcolor: alpha(BRAND_DARK, 0.08), fontWeight: 700 }} />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
              <TextField
                size="small"
                label="Price From"
                type="number"
                value={filters.priceFrom}
                onChange={(event) => updateFilter('priceFrom', event.target.value)}
                sx={{ width: { xs: '100%', md: 150 } }}
              />
              <TextField
                size="small"
                label="Price To"
                type="number"
                value={filters.priceTo}
                onChange={(event) => updateFilter('priceTo', event.target.value)}
                sx={{ width: { xs: '100%', md: 150 } }}
              />
              <TextField
                size="small"
                label="Min Rating"
                type="number"
                value={filters.minRating}
                onChange={(event) => updateFilter('minRating', event.target.value)}
                sx={{ width: { xs: '100%', md: 150 } }}
              />
              <TextField
                size="small"
                label="Delivery Within"
                type="number"
                value={filters.deliveryWithinDays}
                onChange={(event) => updateFilter('deliveryWithinDays', event.target.value)}
                sx={{ width: { xs: '100%', md: 220 } }}
                InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">days</Typography> }}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 170 } }}>
                <InputLabel>Stock</InputLabel>
                <Select
                  value={filters.stock}
                  label="Stock"
                  onChange={(event) => updateFilter('stock', event.target.value)}
                >
                  <MenuItem value="all">All Stock</MenuItem>
                  <MenuItem value="in_stock">In Stock</MenuItem>
                  <MenuItem value="out_of_stock">Out of Stock</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 170 } }}>
                <InputLabel>Active</InputLabel>
                <Select
                  value={filters.active}
                  label="Active"
                  onChange={(event) => updateFilter('active', event.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.hideExcluded}
                    onChange={(event) => updateFilter('hideExcluded', event.target.checked)}
                  />
                }
                label="Hide excluded"
                sx={{
                  ml: { md: 0.5 },
                  '& .MuiFormControlLabel-label': {
                    ml: 0.75,
                    fontWeight: 600
                  }
                }}
              />
              <Button variant="text" onClick={clearAllFilters}>
                Clear Filters
              </Button>
            </Stack>

            <Stack
              component="form"
              onSubmit={applyKeywordIntent}
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', lg: 'center' }}
              sx={{
                pt: 1.5,
                borderTop: `1px solid ${alpha(BRAND_DARK, 0.08)}`
              }}
            >
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
                <InputLabel>Action</InputLabel>
                <Select
                  value={keywordIntent}
                  label="Action"
                  onChange={(event) => setKeywordIntent(event.target.value)}
                >
                  <MenuItem value="included">Include</MenuItem>
                  <MenuItem value="excluded">Exclude</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Keyword in Title"
                value={keywordDraft}
                onChange={(event) => {
                  setKeywordDraft(event.target.value);
                  updateFilter('keyword', event.target.value);
                }}
                placeholder="e.g. mud flaps"
                sx={{ flex: 1, minWidth: { lg: 360 } }}
              />
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip label={`Keyword matches: ${keywordDraftMatchedRows.length}`} variant="outlined" />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!keywordDraft.trim()}
                  sx={yellowFilledButtonSx}
                >
                  Apply
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setRowIntent(rows.map(row => row.id), 'neutral');
                    setKeywordDraft('');
                    updateFilter('keyword', '');
                  }}
                  disabled={includedCount + excludedCount === 0 && !keywordDraft.trim() && !filters.keyword}
                >
                  Clear Include/Exclude
                </Button>
              </Stack>
            </Stack>
          </Stack>

          {running && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
                value={progress.total > 0 ? Math.min(100, (progress.current / progress.total) * 100) : undefined}
                sx={{ height: 8, borderRadius: 999 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                {progress.current}/{progress.total} checked
              </Typography>
            </Box>
          )}
        </Paper>

        <TableContainer component={Paper} sx={tableContainerSx}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={tableHeaderCellSx}>
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={visibleCompletedRows.some(row => selectedIds.has(row.id)) && !allVisibleSelected}
                    onChange={(event) => selectRows(event.target.checked ? visibleCompletedRows : [])}
                    disabled={visibleCompletedRows.length === 0}
                  />
                </TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 130 }}>ASIN</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 132 }}>Amazon Image</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: '38%' }}>Title</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 90 }}>Price</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 90 }}>Rating</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 120 }}>Stock</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 130 }}>Delivery</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 130 }}>SKU</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 110 }}>Active</TableCell>
                <TableCell sx={{ ...tableHeaderCellSx, width: 150 }}>Include/Exclude</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">Start a precheck to review ASINs.</Typography>
                  </TableCell>
                </TableRow>
              )}

              {rows.length > 0 && visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">No ASINs match the current filters.</Typography>
                  </TableCell>
                </TableRow>
              )}

              {visibleRows.map(row => (
                <TableRow
                  key={row.id}
                  hover
                  selected={selectedIds.has(row.id)}
                  sx={{
                    ...(row.intent === 'excluded' ? {
                      '& td': {
                        backgroundColor: `${alpha(theme.palette.warning.main, 0.08)} !important`
                      }
                    } : {}),
                    '&.Mui-selected td': {
                      backgroundColor: `${alpha(BRAND_YELLOW, 0.16)} !important`
                    }
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      disabled={row.status === 'loading'}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{row.asin}</TableCell>
                  <TableCell sx={{ width: 132 }}>
                    {row.status === 'loading' ? (
                      <CircularProgress size={22} />
                    ) : row.image ? (
                      <ButtonBase
                        onClick={() => setImagePreview({ src: row.image, asin: row.asin, title: row.title })}
                        sx={{
                          width: 96,
                          height: 96,
                          borderRadius: 1.5,
                          border: `1px solid ${alpha(BRAND_DARK, 0.1)}`,
                          bgcolor: '#fff',
                          overflow: 'hidden',
                          '&:hover': {
                            borderColor: BRAND_YELLOW_DARK,
                            boxShadow: `0 0 0 3px ${alpha(BRAND_YELLOW, 0.24)}`
                          }
                        }}
                      >
                        <Box
                          component="img"
                          src={row.image}
                          alt={row.asin}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                          }}
                        />
                      </ButtonBase>
                    ) : (
                      <Typography variant="caption" color="text.secondary">No image</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ width: '38%', minWidth: 240, maxWidth: 520 }}>
                    {row.status === 'loading' ? (
                      <Typography variant="body2" color="text.secondary">Fetching...</Typography>
                    ) : row.title ? (
                      <Stack spacing={0.75} alignItems="flex-start">
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
                          {row.title}
                        </Typography>
                        {row.ebayMotorsMode && (
                          <Tooltip
                            title={
                              <Box sx={{ whiteSpace: 'pre-line' }}>
                                {formatEbayMotorsTooltip(row)}
                              </Box>
                            }
                            arrow
                          >
                            <Chip
                              size="small"
                              label={row.ebayMotorsEligible ? 'eBay Motors Eligible' : 'Excluded: Missing Fitment'}
                              color={row.ebayMotorsEligible ? 'success' : 'warning'}
                              variant={row.ebayMotorsEligible ? 'filled' : 'outlined'}
                              sx={{ fontWeight: 700 }}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="error">
                        {row.errors?.[0] || 'No title'}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {row.price ? `$${row.price}` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {row.rating ? Number(row.rating).toFixed(1) : '-'}
                    </Typography>
                    {row.reviewCount && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {Number(row.reviewCount).toLocaleString()}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.status === 'loading' ? (
                      <Chip label="Checking" size="small" />
                    ) : row.inStock === true ? (
                      <Chip label="In Stock" size="small" color="success" />
                    ) : row.inStock === false ? (
                      <Chip label="Out of Stock" size="small" color="error" variant="outlined" />
                    ) : (
                      <Chip label="Unknown" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    {row.status === 'loading' ? (
                      <Tooltip title={getDeliveryTooltip(row)} arrow>
                        <Chip label="Checking" size="small" />
                      </Tooltip>
                    ) : row.deliveryDays != null ? (
                      <Tooltip title={getDeliveryTooltip(row)} arrow>
                        <Chip
                          label={formatDeliveryLabel(row)}
                          size="small"
                          color={row.deliveryDays <= 8 ? 'success' : 'warning'}
                          variant={row.deliveryDays <= 8 ? 'filled' : 'outlined'}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title={getDeliveryTooltip(row)} arrow>
                        <Chip label="Unknown" size="small" variant="outlined" />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {row.sku || '...'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {row.status === 'loading' ? (
                      <Chip label="Checking" size="small" />
                    ) : row.active ? (
                      <Chip icon={<CheckCircleIcon />} label="Active" size="small" color="success" />
                    ) : (
                      <Chip label="Inactive" size="small" color="error" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.75}>
                      <Chip
                        label={row.intent === 'included' ? 'Included' : row.intent === 'excluded' ? 'Excluded' : 'Neutral'}
                        size="small"
                        color={row.intent === 'included' ? 'primary' : row.intent === 'excluded' ? 'warning' : 'default'}
                        variant={row.intent === 'neutral' ? 'outlined' : 'filled'}
                      />
                      <Stack direction="row" spacing={0.5}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setRowIntent([row.id], row.intent === 'included' ? 'neutral' : 'included')}
                          disabled={!isRowComplete(row) || (row.ebayMotorsMode && row.ebayMotorsEligible === false)}
                        >
                          Include
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => setRowIntent([row.id], row.intent === 'excluded' ? 'neutral' : 'excluded')}
                          disabled={!isRowComplete(row)}
                        >
                          Exclude
                        </Button>
                      </Stack>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <Dialog open={setupOpen} onClose={() => !running && setSetupOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>ASIN Precheck</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {loadingSetup ? (
              <Stack alignItems="center" sx={{ py: 4 }}>
                <CircularProgress />
              </Stack>
            ) : (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <FormControl fullWidth>
                    <InputLabel>Seller</InputLabel>
                    <Select
                      value={sellerId}
                      label="Seller"
                      onChange={(event) => setSellerId(event.target.value)}
                    >
                      {sellers.map(seller => (
                        <MenuItem key={seller._id} value={seller._id}>
                          {getSellerDisplayName(seller)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Autocomplete
                    fullWidth
                    options={templates}
                    value={templates.find(template => template._id === templateId) || null}
                    getOptionLabel={(option) => option?.name || ''}
                    isOptionEqualToValue={(option, value) => option._id === value._id}
                    onChange={(_, value) => setTemplateId(value?._id || '')}
                    renderInput={(params) => (
                      <TextField {...params} label="Template" placeholder="Search template" />
                    )}
                  />
                  <FormControl sx={{ minWidth: 180 }}>
                    <InputLabel>Region</InputLabel>
                    <Select
                      value={region}
                      label="Region"
                      onChange={(event) => setRegion(event.target.value)}
                    >
                      {MARKETPLACE_OPTIONS.map(option => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <FormControlLabel
                  control={
                    <Switch
                      checked={ebayMotorsMode}
                      onChange={(event) => setEbayMotorsMode(event.target.checked)}
                      disabled={rows.length > 0 || running}
                    />
                  }
                  label="eBay Motors mode"
                  sx={{
                    alignSelf: 'flex-start',
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1.5,
                    bgcolor: ebayMotorsMode ? alpha(BRAND_YELLOW, 0.2) : alpha(BRAND_DARK, 0.035),
                    '& .MuiFormControlLabel-label': {
                      ml: 0.75,
                      fontWeight: 700
                    }
                  }}
                />

                <TextField
                  label="ASINs"
                  value={asinInput}
                  onChange={(event) => setAsinInput(event.target.value)}
                  multiline
                  minRows={8}
                  fullWidth
                  placeholder="Paste ASINs here"
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetupOpen(false)} disabled={running}>
            Close
          </Button>
          <Button
            onClick={runPrecheck}
            variant="contained"
            disabled={loadingSetup || running}
            startIcon={running ? <CircularProgress size={16} /> : <SearchIcon />}
            sx={{
              bgcolor: BRAND_YELLOW,
              color: BRAND_DARK,
              fontWeight: 800,
              '&:hover': { bgcolor: BRAND_YELLOW_DARK }
            }}
          >
            Run Precheck
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!imagePreview} onClose={() => setImagePreview(null)} maxWidth="md" fullWidth>
        <DialogTitle>{imagePreview?.asin || 'Amazon Image'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} alignItems="center">
            {imagePreview?.src && (
              <Box
                component="img"
                src={imagePreview.src}
                alt={imagePreview.asin || 'Amazon product'}
                sx={{
                  width: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  bgcolor: '#fff',
                  borderRadius: 1,
                  border: `1px solid ${alpha(BRAND_DARK, 0.1)}`
                }}
              />
            )}
            {imagePreview?.title && (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'stretch' }}>
                {imagePreview.title}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImagePreview(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={discardConfirmOpen} onClose={() => setDiscardConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard Selected ASINs?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Discard {selectedIds.size} selected ASIN{selectedIds.size === 1 ? '' : 's'} from this precheck?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={discardSelected}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </AdminPageShell>
  );
}
