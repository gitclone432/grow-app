import { useEffect, useState, useMemo } from 'react';
import { 
  Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, 
  DialogContent, DialogActions, Alert, Chip, FormControl, InputLabel, Select, MenuItem,
  Tabs, Tab, Switch, FormControlLabel, Divider, CircularProgress, InputAdornment
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  Edit as EditIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  ContentCopy as CopyIcon,
  Publish as PublishIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api.js';
import FieldConfigList from '../../components/FieldConfigList.jsx';
import CoreFieldDefaultsForm from '../../components/CoreFieldDefaultsForm.jsx';
import PricingConfigSection from '../../components/PricingConfigSection.jsx';
import { createDefaultCoreFieldDefaults } from '../../constants/defaultDescriptionTemplate.js';

// ── Marketplace helpers (derived from customActionField) ─────────────────
function extractMarketplace(customActionField) {
  if (!customActionField) return 'US';
  if (customActionField.includes('SiteID=eBayMotors'))  return 'Motors';
  if (customActionField.includes('SiteID=Australia'))   return 'Australia';
  if (customActionField.includes('SiteID=Canada'))      return 'Canada';
  if (customActionField.includes('SiteID=UK'))          return 'UK';
  return 'US';
}

const MARKETPLACE_LABELS = {
  US:        'eBay US',
  Motors:    'eBay Motors',
  Australia: 'eBay AU',
  Canada:    'eBay CA',
  UK:        'eBay UK',
};

export default function ManageTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    customColumns: [],
    asinAutomation: {
      enabled: false,
      fieldConfigs: []
    },
    coreFieldDefaults: createDefaultCoreFieldDefaults(),
    customActionField: '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
    rangeId: null,
    listProductId: null,
    pricingConfig: {
      enabled: false,
      spentRate: null,
      payoutRate: null,
      desiredProfit: null,
      fixedFee: 0,
      saleTax: 0,
      ebayFee: 12.9,
      adsFee: 3,
      tdsFee: 1,
      shippingCost: 0,
      taxRate: 10
    }
  });
  
  const [currentTab, setCurrentTab] = useState(0);

  const [editDialog, setEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [columnDialog, setColumnDialog] = useState(false);
  const [editingColumnIndex, setEditingColumnIndex] = useState(null);
  const [columnFormData, setColumnFormData] = useState({
    name: '',
    displayName: '',
    dataType: 'text',
    defaultValue: '',
    isRequired: false,
    placeholder: ''
  });

  // Bulk reset state
  const [bulkResetDialog, setBulkResetDialog] = useState(false);
  const [bulkResetTarget, setBulkResetTarget] = useState(null);
  const [affectedSellersCount, setAffectedSellersCount] = useState(0);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [bulkResetLoading, setBulkResetLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  // Filter state
  const [marketplaceFilter, setMarketplaceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter]       = useState('all');
  const [asinFilter, setAsinFilter]               = useState('all');
  const [pricingFilter, setPricingFilter]         = useState('all');
  const [colsFilter, setColsFilter]               = useState('all');

  // Directory assignment cascade
  const [formCategories, setFormCategories] = useState([]);
  const [allRanges, setAllRanges] = useState([]);    // all ranges, used for reverse lookup
  const [formRanges, setFormRanges] = useState([]);  // filtered to selected category
  const [formProducts, setFormProducts] = useState([]);
  const [formCategoryId, setFormCategoryId] = useState(''); // UI-only, not saved

  useEffect(() => {
    fetchTemplates();
    // Load categories and all ranges for the assignment cascade
    Promise.all([
      api.get('/asin-list-categories'),
      api.get('/asin-list-ranges', { params: { all: true } }),
    ]).then(([catRes, rangeRes]) => {
      setFormCategories(catRes.data || []);
      setAllRanges(rangeRes.data || []);
    }).catch(() => {});
  }, []);

  // Filter ranges when formCategoryId changes
  useEffect(() => {
    if (!formCategoryId) {
      setFormRanges([]);
      return;
    }
    setFormRanges(
      allRanges.filter(r => String(r.categoryId?._id || r.categoryId) === String(formCategoryId))
    );
  }, [formCategoryId, allRanges]);

  // Load products when rangeId changes in the form
  useEffect(() => {
    const rid = formData.rangeId;
    if (!rid) { setFormProducts([]); return; }
    api.get('/asin-list-products', { params: { rangeId: String(rid._id || rid) } })
      .then(r => setFormProducts(r.data || []))
      .catch(() => setFormProducts([]));
  }, [formData.rangeId]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/listing-templates');
      setTemplates(data || []);
    } catch (err) {
      setError('Failed to fetch templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived filter values ────────────────────────────────────────────────
  const availableMarketplaces = useMemo(() => {
    const mp = templates.map(t => extractMarketplace(t.customActionField));
    return [...new Set(mp)];
  }, [templates]);

  const availableCategories = useMemo(() => {
    const cats = templates.map(t => t.category).filter(c => c && c.trim() !== '');
    return [...new Set(cats)].sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      if (templateSearch && !t.name.toLowerCase().includes(templateSearch.toLowerCase())) return false;
      if (marketplaceFilter !== 'all' && extractMarketplace(t.customActionField) !== marketplaceFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (asinFilter === 'enabled'  && !t.asinAutomation?.enabled) return false;
      if (asinFilter === 'disabled' &&  t.asinAutomation?.enabled) return false;
      if (pricingFilter === 'enabled'  && !t.pricingConfig?.enabled) return false;
      if (pricingFilter === 'disabled' &&  t.pricingConfig?.enabled) return false;
      if (colsFilter === 'yes' && !(t.customColumns?.length > 0)) return false;
      if (colsFilter === 'no'  &&   t.customColumns?.length > 0)  return false;
      return true;
    });
  }, [templates, templateSearch, marketplaceFilter, categoryFilter, asinFilter, pricingFilter, colsFilter]);

  const hasActiveFilters = templateSearch || marketplaceFilter !== 'all' || categoryFilter !== 'all'
    || asinFilter !== 'all' || pricingFilter !== 'all' || colsFilter !== 'all';

  const clearAllFilters = () => {
    setTemplateSearch('');
    setMarketplaceFilter('all');
    setCategoryFilter('all');
    setAsinFilter('all');
    setPricingFilter('all');
    setColsFilter('all');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name) {
      setError('Template name is required');
      return;
    }

    try {
      setLoading(true);
      await api.post('/listing-templates', formData);
      setSuccess('Template created successfully!');
      setFormData({
        name: '',
        customColumns: [],
        asinAutomation: {
          enabled: false,
          fieldConfigs: []
        },
        coreFieldDefaults: createDefaultCoreFieldDefaults(),
        pricingConfig: {
          enabled: false,
          spentRate: null,
          payoutRate: null,
          desiredProfit: null,
          fixedFee: 0,
          saleTax: 0,
          ebayFee: 12.9,
          adsFee: 3,
          tdsFee: 1,
          shippingCost: 0,
          taxRate: 10
        }
      });
      fetchTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create template');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    // Pre-populate cascade for the assignment section
    if (template.rangeId) {
      const rangeIdStr = String(template.rangeId?._id || template.rangeId);
      const matchingRange = allRanges.find(r => String(r._id) === rangeIdStr);
      if (matchingRange) {
        setFormCategoryId(String(matchingRange.categoryId?._id || matchingRange.categoryId));
      }
      api.get('/asin-list-products', { params: { rangeId: rangeIdStr } })
        .then(r => setFormProducts(r.data || []))
        .catch(() => {});
    } else {
      setFormCategoryId('');
      setFormRanges([]);
      setFormProducts([]);
    }
    setFormData({
      name: template.name,
      customColumns: template.customColumns || [],
      asinAutomation: template.asinAutomation || {
        enabled: false,
        fieldConfigs: []
      },
      coreFieldDefaults: {
        ...createDefaultCoreFieldDefaults(),
        ...(template.coreFieldDefaults || {})
      },
      customActionField: template.customActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
      rangeId: template.rangeId || null,
      listProductId: template.listProductId || null,
      pricingConfig: template.pricingConfig || {
        enabled: false,
        spentRate: null,
        payoutRate: null,
        desiredProfit: null,
        fixedFee: 0,
        saleTax: 0,
        ebayFee: 12.9,
        adsFee: 3,
        tdsFee: 1,
        shippingCost: 0,
        taxRate: 10
      }
    });
    setEditDialog(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialog(false);
    setEditingTemplate(null);
    setCurrentTab(0);
    setFormCategoryId('');
    setFormRanges([]);
    setFormProducts([]);
    setFormData({
      name: '',
      customColumns: [],
      asinAutomation: {
        enabled: false,
        fieldConfigs: []
      },
      coreFieldDefaults: createDefaultCoreFieldDefaults(),
      customActionField: '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
      rangeId: null,
      listProductId: null,
      pricingConfig: {
        enabled: false,
        spentRate: null,
        payoutRate: null,
        desiredProfit: null,
        fixedFee: 0,
        saleTax: 0,
        ebayFee: 12.9,
        adsFee: 3,
        tdsFee: 1,
        shippingCost: 0,
        taxRate: 10
      }
    });
  };

  const handleUpdate = async () => {
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      await api.put(`/listing-templates/${editingTemplate._id}`, formData);
      setSuccess('Template updated successfully!');
      setEditDialog(false);
      setEditingTemplate(null);
      setFormCategoryId('');
      setFormRanges([]);
      setFormProducts([]);
      setFormData({
        name: '',
        customColumns: [],
        asinAutomation: {
          enabled: false,
          fieldConfigs: []
        },
        coreFieldDefaults: createDefaultCoreFieldDefaults(),
        customActionField: '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
        rangeId: null,
        listProductId: null,
        pricingConfig: {
          enabled: false,
          spentRate: null,
          payoutRate: null,
          desiredProfit: null,
          fixedFee: 0,
          saleTax: 0,
          ebayFee: 12.9,
          adsFee: 3,
          tdsFee: 1,
          shippingCost: 0,
          taxRate: 10
        }
      });
      fetchTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update template');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will NOT delete associated listings.`)) return;

    try {
      setLoading(true);
      await api.delete(`/listing-templates/${id}`);
      setSuccess('Template deleted successfully!');
      fetchTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete template');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (templateId, templateName) => {
    if (!window.confirm(`Create a copy of "${templateName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const { data } = await api.post(`/listing-templates/${templateId}/duplicate`);
      
      setSuccess(`Template duplicated successfully as "${data.name}"!`);
      await fetchTemplates();
      
      // Highlight the new template
      setHighlightedId(data._id);
      
      // Auto-scroll to top where new template will appear
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
      
      // Auto-open edit dialog for immediate customization
      setTimeout(() => {
        handleEdit(data);
      }, 300);
      
      // Clear highlight after 3 seconds
      setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to duplicate template');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBulkReset = async (template) => {
    try {
      setBulkResetLoading(true);
      setError('');
      
      // Fetch the count of affected sellers
      const { data } = await api.get(`/template-overrides/${template._id}/count`);
      
      setAffectedSellersCount(data.count);
      setBulkResetTarget(template);
      setConfirmationInput('');
      setBulkResetDialog(true);
    } catch (err) {
      setError('Failed to fetch affected sellers count');
      console.error(err);
    } finally {
      setBulkResetLoading(false);
    }
  };

  const handleBulkReset = async () => {
    if (!bulkResetTarget) return;

    try {
      setBulkResetLoading(true);
      setError('');

      const { data } = await api.delete(`/listing-templates/${bulkResetTarget._id}/bulk-reset-overrides`);
      
      setSuccess(data.message || `Successfully reset ${data.deletedCount} seller customizations!`);
      setBulkResetDialog(false);
      setBulkResetTarget(null);
      setConfirmationInput('');
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset overrides');
      console.error(err);
    } finally {
      setBulkResetLoading(false);
    }
  };

  const handleCloseBulkResetDialog = () => {
    if (!bulkResetLoading) {
      setBulkResetDialog(false);
      setBulkResetTarget(null);
      setConfirmationInput('');
      setAffectedSellersCount(0);
    }
  };

  const handleAddColumn = () => {
    setEditingColumnIndex(null);
    setColumnFormData({
      name: '',
      displayName: '',
      dataType: 'text',
      defaultValue: '',
      isRequired: false,
      placeholder: ''
    });
    setColumnDialog(true);
  };

  const handleEditColumn = (columnIndex) => {
    const column = formData.customColumns[columnIndex];
    setEditingColumnIndex(columnIndex);
    setColumnFormData({
      name: column.name,
      displayName: column.displayName,
      dataType: column.dataType,
      defaultValue: column.defaultValue || '',
      isRequired: column.isRequired || false,
      placeholder: column.placeholder || ''
    });
    setColumnDialog(true);
  };

  const handleSaveColumn = () => {
    if (!columnFormData.name || !columnFormData.displayName) {
      setError('Column name and display name are required');
      return;
    }

    if (editingColumnIndex !== null) {
      // Edit existing column
      const updatedColumns = [...formData.customColumns];
      updatedColumns[editingColumnIndex] = {
        ...updatedColumns[editingColumnIndex],
        ...columnFormData
      };
      
      setFormData({
        ...formData,
        customColumns: updatedColumns
      });
    } else {
      // Add new column
      const maxOrder = formData.customColumns.length > 0 
        ? Math.max(...formData.customColumns.map(col => col.order))
        : 38;

      setFormData({
        ...formData,
        customColumns: [
          ...formData.customColumns,
          {
            ...columnFormData,
            order: maxOrder + 1
          }
        ]
      });
    }

    setColumnDialog(false);
    setEditingColumnIndex(null);
  };

  const handleRemoveColumn = (columnName) => {
    setFormData({
      ...formData,
      customColumns: formData.customColumns.filter(col => col.name !== columnName)
    });
  };
  
  const handleAddFieldConfig = () => {
    setFormData({
      ...formData,
      asinAutomation: {
        ...formData.asinAutomation,
        fieldConfigs: [
          ...formData.asinAutomation.fieldConfigs,
          {
            fieldType: 'core',
            ebayField: 'title',
            source: 'ai',
            promptTemplate: '',
            amazonField: '',
            transform: 'none',
            enabled: true,
            defaultValue: ''
          }
        ]
      }
    });
  };

  const handleViewListings = (templateId) => {
    // Navigate to seller selection page with returnTo parameter for direct template access
    navigate(`/admin/select-seller?returnTo=/admin/template-listings?templateId=${templateId}`);
  };

  const countCoreDefaults = () => {
    return Object.keys(formData.coreFieldDefaults || {}).filter(
      key => formData.coreFieldDefaults[key] !== '' && 
             formData.coreFieldDefaults[key] !== null && 
             formData.coreFieldDefaults[key] !== undefined
    ).length;
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Manage Listing Templates</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
          Create New Template
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Template Name"
              required
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Phone Case Template"
              helperText="All 38 core eBay columns will be automatically included. You can add custom columns below."
            />

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Custom Columns</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={handleAddColumn}>
                  Add Column
                </Button>
              </Stack>

              {formData.customColumns.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No custom columns added yet. Click "Add Column" to create template-specific fields.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {formData.customColumns.map((col) => (
                    <Paper key={col.name} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="body2" fontWeight="bold">{col.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {col.displayName} • {col.dataType}
                            {col.isRequired && ' • Required'}
                            {col.defaultValue && ` • Default: ${col.defaultValue}`}
                          </Typography>
                        </Box>
                        <IconButton size="small" color="error" onClick={() => handleRemoveColumn(col.name)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>

            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ mt: 2 }}
            >
              Create Template
            </Button>
          </Stack>
        </Box>
      </Paper>

      <Paper>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2, bgcolor: 'grey.100', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Existing Templates ({filteredTemplates.length}{hasActiveFilters ? ` of ${templates.length}` : ''})
          </Typography>
          <TextField
            size="small"
            placeholder="Search by name…"
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            sx={{ width: 320, bgcolor: 'background.paper', borderRadius: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        {/* ── Filter Bar ── */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
          <Stack spacing={1.5}>

            {/* Marketplace chips — only shown when more than one marketplace exists */}
            {availableMarketplaces.length > 1 && (
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, fontWeight: 600 }}>
                  Marketplace
                </Typography>
                {[{ v: 'all', label: 'All' }, ...availableMarketplaces.map(mp => ({ v: mp, label: MARKETPLACE_LABELS[mp] }))].map(({ v, label }) => (
                  <Chip
                    key={v}
                    label={label}
                    size="small"
                    variant={marketplaceFilter === v ? 'filled' : 'outlined'}
                    color={marketplaceFilter === v ? 'primary' : 'default'}
                    onClick={() => setMarketplaceFilter(v)}
                    clickable
                  />
                ))}
              </Stack>
            )}

            {/* Category dropdown — only shown when templates have category values */}
            {availableCategories.length > 0 && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, fontWeight: 600 }}>
                  Category
                </Typography>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <Select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="all"><em>All Categories</em></MenuItem>
                    {availableCategories.map(c => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            )}

            {/* Quick toggle chips */}
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, fontWeight: 600 }}>
                Quick
              </Typography>

              {[{ v: 'all', label: 'All ASIN' }, { v: 'enabled', label: 'ASIN ✓' }, { v: 'disabled', label: 'ASIN ✗' }].map(({ v, label }) => (
                <Chip key={v} label={label} size="small"
                  variant={asinFilter === v ? 'filled' : 'outlined'}
                  color={asinFilter === v ? 'primary' : 'default'}
                  onClick={() => setAsinFilter(v)} clickable />
              ))}

              {[{ v: 'all', label: 'All Pricing' }, { v: 'enabled', label: 'Pricing ✓' }, { v: 'disabled', label: 'Pricing ✗' }].map(({ v, label }) => (
                <Chip key={v} label={label} size="small"
                  variant={pricingFilter === v ? 'filled' : 'outlined'}
                  color={pricingFilter === v ? 'primary' : 'default'}
                  onClick={() => setPricingFilter(v)} clickable />
              ))}

              {[{ v: 'all', label: 'All Cols' }, { v: 'yes', label: 'Has Cols' }, { v: 'no', label: 'No Cols' }].map(({ v, label }) => (
                <Chip key={v} label={label} size="small"
                  variant={colsFilter === v ? 'filled' : 'outlined'}
                  color={colsFilter === v ? 'primary' : 'default'}
                  onClick={() => setColsFilter(v)} clickable />
              ))}
            </Stack>

            {/* Clear all filters */}
            {hasActiveFilters && (
              <Box>
                <Button size="small" onClick={clearAllFilters}>Clear all filters</Button>
              </Box>
            )}
          </Stack>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Marketplace</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Custom Columns</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No templates found. Create one above!
                  </TableCell>
                </TableRow>
              ) : filteredTemplates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No templates match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTemplates.map((template) => (
                  <TableRow 
                    key={template._id} 
                    hover
                    sx={{
                      bgcolor: highlightedId === template._id ? 'success.50' : 'transparent',
                      transition: 'background-color 0.3s ease'
                    }}
                  >
                    <TableCell><strong>{template.name}</strong></TableCell>
                    <TableCell>
                      <Chip
                        label={MARKETPLACE_LABELS[extractMarketplace(template.customActionField)] || 'eBay US'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {template.customColumns?.length > 0 ? (
                        <Chip label={`${template.customColumns.length} columns`} size="small" color="primary" variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">None</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(template.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleViewListings(template._id)} title="View Listings">
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDuplicate(template._id, template.name)} title="Duplicate Template">
                        <CopyIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="success" onClick={() => handleOpenBulkReset(template)} title="Apply Base Template to All Sellers">
                        <PublishIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleEdit(template)} title="Edit Template">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(template._id, template.name)} title="Delete Template">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Edit Template Dialog */}
      <Dialog open={editDialog} onClose={handleCloseEditDialog} maxWidth="md" fullWidth>
        <DialogTitle>Edit Template</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Tabs 
              value={currentTab} 
              onChange={(e, v) => setCurrentTab(v)} 
              sx={{ mb: 3 }}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Basic Info" />
              <Tab label="Custom Columns" />
              <Tab label="ASIN Auto-Fill" />
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Core Defaults
                    {countCoreDefaults() > 0 && (
                      <Chip label={countCoreDefaults()} size="small" color="primary" sx={{ height: 18, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                } 
              />
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Pricing Calc
                    {formData.pricingConfig?.enabled && (
                      <Chip label="✓" size="small" color="success" sx={{ height: 18, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                } 
              />
            </Tabs>
            
            <Box sx={{ minHeight: 300 }}>
              {/* Tab 0: Basic Info */}
              {currentTab === 0 && (
                <Stack spacing={2}>
                  <TextField
                    label="Template Name"
                    required
                    fullWidth
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />

                  {/* Directory Assignment */}
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                    Listing Directory Assignment
                  </Typography>

                  <FormControl size="small" fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      label="Category"
                      value={formCategoryId}
                      onChange={e => {
                        setFormCategoryId(e.target.value);
                        setFormData({ ...formData, rangeId: null, listProductId: null });
                      }}
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {formCategories.map(c => (
                        <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth disabled={!formCategoryId}>
                    <InputLabel>Range</InputLabel>
                    <Select
                      label="Range"
                      value={formData.rangeId ? String(formData.rangeId?._id || formData.rangeId) : ''}
                      onChange={e => setFormData({ ...formData, rangeId: e.target.value || null, listProductId: null })}
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {formRanges.map(r => (
                        <MenuItem key={r._id} value={r._id}>{r.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth disabled={!formData.rangeId}>
                    <InputLabel>Product (optional)</InputLabel>
                    <Select
                      label="Product (optional)"
                      value={formData.listProductId ? String(formData.listProductId?._id || formData.listProductId) : ''}
                      onChange={e => setFormData({ ...formData, listProductId: e.target.value || null })}
                    >
                      <MenuItem value=""><em>None — Range level</em></MenuItem>
                      {formProducts.map(p => (
                        <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              )}
              
              {/* Tab 1: Custom Columns */}
              {currentTab === 1 && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">Custom Columns</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={handleAddColumn}>
                      Add Column
                    </Button>
                  </Stack>

                  {formData.customColumns.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No custom columns
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {formData.customColumns.map((col, index) => (
                        <Paper key={col.name} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography variant="body2" fontWeight="bold">{col.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {col.displayName} • {col.dataType}
                                {col.isRequired && ' • Required'}
                                {col.defaultValue && ` • Default: ${col.defaultValue}`}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              <IconButton size="small" onClick={() => handleEditColumn(index)} title="Edit Column">
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleRemoveColumn(col.name)} title="Delete Column">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Box>
              )}
              
              {/* Tab 2: ASIN Auto-Fill */}
              {currentTab === 2 && (
                <Stack spacing={3}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.asinAutomation?.enabled || false}
                        onChange={(e) => setFormData({
                          ...formData,
                          asinAutomation: {
                            ...formData.asinAutomation,
                            enabled: e.target.checked
                          }
                        })}
                      />
                    }
                    label="Enable ASIN Auto-Fill for Listings"
                  />
                  
                  {formData.asinAutomation?.enabled && (
                    <>
                      <Alert severity="info">
                        Configure which eBay fields should auto-populate when users enter an ASIN while creating listings. The system will fetch Amazon data and use AI to generate field values.
                      </Alert>
                      
                      <Typography variant="subtitle2">
                        Auto-Fill Field Configurations
                      </Typography>
                      
                      <FieldConfigList
                        configs={formData.asinAutomation.fieldConfigs}
                        customColumns={formData.customColumns}
                        onChange={(configs) => setFormData({
                          ...formData,
                          asinAutomation: {
                            ...formData.asinAutomation,
                            fieldConfigs: configs
                          }
                        })}
                      />
                      
                      <Button
                        startIcon={<AddIcon />}
                        onClick={handleAddFieldConfig}
                      >
                        Add Field Configuration
                      </Button>
                    </>
                  )}
                </Stack>
              )}
              
              {/* Tab 3: Core Field Defaults */}
              {currentTab === 3 && (
                <Box>
                  {/* eBay Action Field dropdown */}
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    eBay Action Field
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <FormControl fullWidth size="small" sx={{ mb: 4 }}>
                    <InputLabel>eBay Platform</InputLabel>
                    <Select
                      value={formData.customActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)'}
                      label="eBay Platform"
                      onChange={(e) => setFormData({ ...formData, customActionField: e.target.value })}
                    >
                      <MenuItem value="*Action(SiteID=US|Country=US|Currency=USD|Version=1193)">
                        eBay US &nbsp;—&nbsp; *Action(SiteID=US|Country=US|Currency=USD|Version=1193)
                      </MenuItem>
                      <MenuItem value="*Action(SiteID=eBayMotors|Country=US|Currency=USD|Version=1193)">
                        eBay Motors &nbsp;—&nbsp; *Action(SiteID=eBayMotors|Country=US|Currency=USD|Version=1193)
                      </MenuItem>
                      <MenuItem value="*Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)">
                        eBay Australia &nbsp;—&nbsp; *Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)
                      </MenuItem>
                      <MenuItem value="*Action(SiteID=Canada|Country=CA|Currency=CAD|Version=1193)">
                        eBay Canada &nbsp;—&nbsp; *Action(SiteID=Canada|Country=CA|Currency=CAD|Version=1193)
                      </MenuItem>
                      <MenuItem value="*Action(SiteID=UK|Country=GB|Currency=GBP|Version=1193)">
                        eBay UK &nbsp;—&nbsp; *Action(SiteID=UK|Country=GB|Currency=GBP|Version=1193)
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                      <strong>How it works:</strong> Set default values for core eBay fields at the template level. 
                      These defaults will apply to all sellers using this template unless they set seller-specific overrides.
                      Auto-fill (AI/ASIN/Calculator) can still override these defaults.
                    </Typography>
                  </Alert>
                  
                  <CoreFieldDefaultsForm
                    formData={formData.coreFieldDefaults || {}}
                    onChange={(newDefaults) => setFormData({
                      ...formData,
                      coreFieldDefaults: newDefaults
                    })}
                  />
                </Box>
              )}
              
              {/* Tab 4: Pricing Calculator */}
              {currentTab === 4 && (
                <Box>
                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                      <strong>How it works:</strong> Configure the pricing calculator at the template level.
                      When enabled, the calculator will automatically compute the Start Price based on Amazon ASIN data,
                      exchange rates, fees, and desired profit margins. Sellers can override these settings if needed.
                    </Typography>
                  </Alert>
                  
                  <PricingConfigSection
                    pricingConfig={formData.pricingConfig || {}}
                    onChange={(newPricingConfig) => setFormData({
                      ...formData,
                      pricingConfig: newPricingConfig
                    })}
                  />
                </Box>
              )}


            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained" disabled={loading}>
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Column Dialog */}
      <Dialog open={columnDialog} onClose={() => { setColumnDialog(false); setEditingColumnIndex(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingColumnIndex !== null ? 'Edit Custom Column' : 'Add Custom Column'}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Stack spacing={2}>
              <TextField
                label="Column Name (CSV Header)"
                required
                fullWidth
                value={columnFormData.name}
                onChange={(e) => setColumnFormData({ ...columnFormData, name: e.target.value })}
                placeholder="e.g., C:Brand, C:Color, C:Material"
                helperText="Exact column name as it will appear in CSV"
              />

              <TextField
                label="Display Name"
                required
                fullWidth
                value={columnFormData.displayName}
                onChange={(e) => setColumnFormData({ ...columnFormData, displayName: e.target.value })}
                placeholder="e.g., Brand, Color, Material"
                helperText="User-friendly name for the UI"
              />

              <FormControl fullWidth>
                <InputLabel>Data Type</InputLabel>
                <Select
                  value={columnFormData.dataType}
                  label="Data Type"
                  onChange={(e) => setColumnFormData({ ...columnFormData, dataType: e.target.value })}
                >
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="number">Number</MenuItem>
                  <MenuItem value="multiselect">Multi-select</MenuItem>
                  <MenuItem value="boolean">Boolean</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Default Value"
                fullWidth
                value={columnFormData.defaultValue}
                onChange={(e) => setColumnFormData({ ...columnFormData, defaultValue: e.target.value })}
                placeholder="e.g., Does Not Apply"
              />

              <TextField
                label="Placeholder"
                fullWidth
                value={columnFormData.placeholder}
                onChange={(e) => setColumnFormData({ ...columnFormData, placeholder: e.target.value })}
                placeholder="e.g., Enter brand name"
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setColumnDialog(false); setEditingColumnIndex(null); }}>Cancel</Button>
          <Button onClick={handleSaveColumn} variant="contained">
            {editingColumnIndex !== null ? 'Update Column' : 'Add Column'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Reset Confirmation Dialog */}
      <Dialog 
        open={bulkResetDialog} 
        onClose={handleCloseBulkResetDialog}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main' }}>
          <PublishIcon />
          Apply Base Template to All Sellers
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Alert severity="warning" variant="outlined">
              <strong>⚠️ Warning:</strong> This action is irreversible!
            </Alert>

            <Box>
              <Typography variant="body1" gutterBottom>
                This will:
              </Typography>
              <Box component="ul" sx={{ mt: 1, pl: 3 }}>
                <li>Delete all seller-specific customizations for this template</li>
                <li>Force all sellers to use the current base template settings</li>
                <li>Apply immediately to <strong>{affectedSellersCount}</strong> seller{affectedSellersCount !== 1 ? 's' : ''} who have customized this template</li>
              </Box>
            </Box>

            {affectedSellersCount === 0 && (
              <Alert severity="info">
                No sellers have customized this template yet. No changes will be made.
              </Alert>
            )}

            {affectedSellersCount > 0 && (
              <>
                <Alert severity="warning">
                  <strong>{affectedSellersCount}</strong> seller{affectedSellersCount !== 1 ? 's' : ''} will be affected.
                  Their customizations will be permanently deleted.
                </Alert>

                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    To confirm, type the template name: <strong>{bulkResetTarget?.name}</strong>
                  </Typography>
                  <TextField
                    fullWidth
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    placeholder="Enter template name exactly"
                    autoFocus
                    sx={{ mt: 1 }}
                  />
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBulkResetDialog} disabled={bulkResetLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleBulkReset} 
            variant="contained"
            color="warning"
            disabled={
              bulkResetLoading || 
              affectedSellersCount === 0 ||
              confirmationInput !== bulkResetTarget?.name
            }
          >
            {bulkResetLoading ? 'Applying...' : `Apply to ${affectedSellersCount} Seller${affectedSellersCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
