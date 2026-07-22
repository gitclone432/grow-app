import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import StorefrontIcon from '@mui/icons-material/Storefront';
import api from '../../lib/api.js';
import PricingConfigSection from '../../components/PricingConfigSection.jsx';
import {
  fetchDescriptionTemplateGallery,
} from '../../lib/descriptionTemplateGalleryApi.js';

const STORE_SETTINGS_REGION = 'US';

const COUNTRY_OPTIONS = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'IN', label: 'India' },
];

const EMPTY_LISTER = {
  defaultCountry: 'US',
  defaultPostalCode: '',
  defaultLocation: '',
  paymentProfileName: 'Payment Policy',
  shippingProfileName: 'Shipping Policy',
  returnProfileName: 'Return Policy',
  brandMode: 'from_scraper',
};

const EMPTY_GENERAL = {
  descriptionTemplateId: '',
  ebayUserId: '',
};

function truncateMessagePreview(text, max = 140) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function TabPanel({ active, children }) {
  if (!active) return null;
  return <Box sx={{ pt: 3 }}>{children}</Box>;
}

function SettingsSection({ title, description, children, action }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {children}
        {action ? (
          <Box sx={{ pt: 0.5, display: 'flex', justifyContent: 'flex-start' }}>
            {action}
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}

function SaveButton({ saving, disabled, onClick, label }) {
  return (
    <Button
      variant="contained"
      startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
      onClick={onClick}
      disabled={disabled || saving}
    >
      {label}
    </Button>
  );
}

export default function StoresPage() {
  const [sellers, setSellers] = useState([]);
  const [listingTemplates, setListingTemplates] = useState([]);
  const [descriptionTemplates, setDescriptionTemplates] = useState([]);

  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [tab, setTab] = useState(0);

  const [lister, setLister] = useState(EMPTY_LISTER);
  const [automaticMessages, setAutomaticMessages] = useState([]);
  const [general, setGeneral] = useState(EMPTY_GENERAL);
  const [pricingTemplateId, setPricingTemplateId] = useState('');
  const [pricingConfig, setPricingConfig] = useState(null);
  const [pricingIsCustom, setPricingIsCustom] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [editMessage, setEditMessage] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedSeller = useMemo(
    () => sellers.find((s) => String(s._id) === String(selectedSellerId)),
    [sellers, selectedSellerId]
  );

  const loadSellers = useCallback(async () => {
    const { data } = await api.get('/sellers/all');
    const list = Array.isArray(data) ? data : [];
    setSellers(list);
    setSelectedSellerId((prev) => prev || list[0]?._id || '');
    return list;
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const [listingRes, gallery] = await Promise.all([
        api.get('/listing-templates', { params: { summary: true }, timeout: 30000 }),
        fetchDescriptionTemplateGallery().catch(() => ({ templates: [] })),
      ]);
      setListingTemplates(Array.isArray(listingRes.data) ? listingRes.data : []);
      setDescriptionTemplates(Array.isArray(gallery.templates) ? gallery.templates : []);
    } catch (err) {
      console.error('Failed to load template lists for Stores page:', err);
      setError((prev) => prev || err.response?.data?.error || 'Failed to load listing templates');
    }
  }, []);

  const loadPricing = useCallback(async (sellerId, templateId) => {
    if (!sellerId || !templateId) {
      setPricingConfig(null);
      setPricingIsCustom(false);
      return;
    }
    const { data } = await api.get('/seller-pricing-config', {
      params: { sellerId, templateId },
    });
    setPricingConfig(data.pricingConfig || null);
    setPricingIsCustom(Boolean(data.isCustom));
  }, []);

  const loadStoreSettings = useCallback(async (sellerId) => {
    if (!sellerId) return;
    setLoadingSettings(true);
    setError('');
    try {
      const { data } = await api.get('/ebay-store-settings', {
        params: { sellerId, region: STORE_SETTINGS_REGION },
      });
      const nextLister = { ...EMPTY_LISTER, ...(data.settings?.lister || {}) };
      setLister(nextLister);
      setAutomaticMessages(Array.isArray(data.settings?.orders?.automaticMessages)
        ? data.settings.orders.automaticMessages
        : []);
      setGeneral({ ...EMPTY_GENERAL, ...(data.settings?.general || {}) });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load store settings');
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSellerId && pricingTemplateId) {
      void loadPricing(selectedSellerId, pricingTemplateId);
    } else {
      setPricingConfig(null);
      setPricingIsCustom(false);
    }
  }, [selectedSellerId, pricingTemplateId, loadPricing]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError('');
      try {
        await loadSellers();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load stores');
      } finally {
        setLoading(false);
      }
      void loadTemplates();
    };
    void init();
  }, [loadSellers, loadTemplates]);

  useEffect(() => {
    if (selectedSellerId) {
      void loadStoreSettings(selectedSellerId);
    }
  }, [selectedSellerId, loadStoreSettings]);

  const saveListerSettings = async () => {
    if (!selectedSellerId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        sellerId: selectedSellerId,
        region: STORE_SETTINGS_REGION,
        lister,
      };
      const { data } = await api.put('/ebay-store-settings', payload);
      setLister({ ...EMPTY_LISTER, ...data.settings.lister });
      setSuccess('Lister settings saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save lister settings');
    } finally {
      setSaving(false);
    }
  };

  const saveAutomaticMessages = async () => {
    if (!selectedSellerId) return;
    setSavingOrders(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put('/ebay-store-settings', {
        sellerId: selectedSellerId,
        region: STORE_SETTINGS_REGION,
        orders: { automaticMessages },
      });
      setAutomaticMessages(Array.isArray(data.settings?.orders?.automaticMessages)
        ? data.settings.orders.automaticMessages
        : []);
      setSuccess('Automatic message settings saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save automatic messages');
    } finally {
      setSavingOrders(false);
    }
  };

  const updateAutomaticMessage = (messageId, patch) => {
    setAutomaticMessages((prev) => prev.map((message) => (
      message.id === messageId ? { ...message, ...patch } : message
    )));
  };

  const saveEditedMessage = () => {
    if (!editMessage?.id) return;
    updateAutomaticMessage(editMessage.id, { body: editMessage.body });
    setEditMessage(null);
  };

  const saveGeneralSettings = async () => {
    if (!selectedSellerId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put('/ebay-store-settings', {
        sellerId: selectedSellerId,
        region: STORE_SETTINGS_REGION,
        general,
      });
      setGeneral({ ...EMPTY_GENERAL, ...data.settings.general });
      // Refresh sellers so Buyer Messages identity cache picks up ebayUserId
      try {
        const { invalidateSellersAllCache } = await import('../../lib/sellersAllCache.js');
        invalidateSellersAllCache();
      } catch (_) {
        /* optional */
      }
      await loadSellers();
      setSuccess('General settings saved. eBay UserID is used by Buyer Messages.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save general settings');
    } finally {
      setSaving(false);
    }
  };

  const savePricingSettings = async () => {
    if (!selectedSellerId || !pricingTemplateId || !pricingConfig) return;
    setSavingPricing(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/seller-pricing-config', {
        sellerId: selectedSellerId,
        templateId: pricingTemplateId,
        pricingConfig,
      });
      setPricingIsCustom(true);
      setSuccess('Pricing settings saved for this store + template.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save pricing settings');
    } finally {
      setSavingPricing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 920, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            eBay Stores
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Defaults for listing, pricing, messages, and descriptions per store.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 } }}>
            <InputLabel>Store</InputLabel>
            <Select
              label="Store"
              value={selectedSellerId}
              onChange={(e) => setSelectedSellerId(e.target.value)}
              displayEmpty
            >
              {sellers.length === 0 && (
                <MenuItem value="" disabled>No stores connected</MenuItem>
              )}
              {sellers.map((seller) => (
                <MenuItem key={seller._id} value={seller._id}>
                  {seller.user?.username || seller._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Reload settings">
            <span>
              <IconButton
                onClick={() => loadStoreSettings(selectedSellerId)}
                disabled={loadingSettings || !selectedSellerId}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      ) : null}

      <Paper
        elevation={0}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab label="Lister" />
          <Tab label="Pricing" />
          <Tab label="Orders" />
          <Tab label="General" />
        </Tabs>

        <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: 360 }}>
          {loadingSettings ? (
            <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : !selectedSellerId ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <StorefrontIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">Select a store to view settings.</Typography>
            </Box>
          ) : (
            <>
              <TabPanel active={tab === 0}>
                <Stack spacing={2.5}>
                  <SettingsSection
                    title="Item location"
                    description={`eBay item location fields for ${selectedSeller?.user?.username || 'this store'}. These map to Trading API Country, Location, and PostalCode.`}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <FormControl fullWidth size="small" required>
                        <InputLabel>eBay Country</InputLabel>
                        <Select
                          label="eBay Country *"
                          value={lister.defaultCountry}
                          onChange={(e) => setLister((p) => ({
                            ...p,
                            defaultCountry: e.target.value,
                            defaultLocation: '',
                          }))}
                        >
                          {COUNTRY_OPTIONS.map((opt) => (
                            <MenuItem key={opt.code} value={opt.code}>{opt.label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="eBay Postal / ZIP (optional)"
                        size="small"
                        value={lister.defaultPostalCode}
                        onChange={(e) => setLister((p) => ({ ...p, defaultPostalCode: e.target.value }))}
                        fullWidth
                      />
                    </Stack>
                    <TextField
                      label="eBay Location (city / region)"
                      size="small"
                      value={lister.defaultLocation}
                      onChange={(e) => setLister((p) => ({ ...p, defaultLocation: e.target.value }))}
                      fullWidth
                      required
                      placeholder="e.g. Casper, Wyoming or Balasore, Odisha"
                      helperText="City and state/region only — do not include country name. Use English/Latin text."
                    />
                  </SettingsSection>

                  <SettingsSection
                    title="Brand"
                    description="How the Brand item specific is set when listing on eBay via Direct List."
                  >
                    <FormControl fullWidth size="small">
                      <InputLabel>Brand source</InputLabel>
                      <Select
                        label="Brand source"
                        value={lister.brandMode || 'from_scraper'}
                        onChange={(e) => setLister((p) => ({ ...p, brandMode: e.target.value }))}
                      >
                        <MenuItem value="from_scraper">From Amazon scraper</MenuItem>
                        <MenuItem value="does_not_apply">Does Not Apply</MenuItem>
                      </Select>
                    </FormControl>
                  </SettingsSection>

                  <SettingsSection
                    title="Business policies"
                    description="Policy names must match your eBay Business Policies."
                  >
                    <Stack spacing={2}>
                      <TextField
                        label="Payment policy"
                        size="small"
                        value={lister.paymentProfileName}
                        onChange={(e) => setLister((p) => ({ ...p, paymentProfileName: e.target.value }))}
                        fullWidth
                      />
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          label="Shipping policy"
                          size="small"
                          value={lister.shippingProfileName}
                          onChange={(e) => setLister((p) => ({ ...p, shippingProfileName: e.target.value }))}
                          fullWidth
                        />
                        <TextField
                          label="Return policy"
                          size="small"
                          value={lister.returnProfileName}
                          onChange={(e) => setLister((p) => ({ ...p, returnProfileName: e.target.value }))}
                          fullWidth
                        />
                      </Stack>
                    </Stack>
                  </SettingsSection>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <SaveButton
                      saving={saving}
                      disabled={!selectedSellerId}
                      onClick={saveListerSettings}
                      label="Save lister settings"
                    />
                  </Box>
                </Stack>
              </TabPanel>

              <TabPanel active={tab === 1}>
                <Stack spacing={2.5}>
                  <SettingsSection
                    title="Template pricing"
                    description="Override pricing rules for a listing template on this store."
                    action={pricingTemplateId && pricingConfig ? (
                      <SaveButton
                        saving={savingPricing}
                        disabled={!pricingConfig}
                        onClick={savePricingSettings}
                        label="Save pricing settings"
                      />
                    ) : null}
                  >
                    <FormControl fullWidth size="small">
                      <InputLabel>Listing template</InputLabel>
                      <Select
                        label="Listing template"
                        value={pricingTemplateId}
                        onChange={(e) => setPricingTemplateId(e.target.value)}
                      >
                        <MenuItem value=""><em>Select template</em></MenuItem>
                        {listingTemplates.map((template) => (
                          <MenuItem key={template._id} value={template._id}>
                            {template.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {!pricingTemplateId ? (
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        Choose a listing template to edit store-specific pricing overrides.
                      </Alert>
                    ) : (
                      <>
                        <Alert severity="info" sx={{ borderRadius: 2 }}>
                          {selectedSeller?.user?.username} ·{' '}
                          <strong>{listingTemplates.find((t) => t._id === pricingTemplateId)?.name || pricingTemplateId}</strong>
                          {pricingIsCustom ? ' · custom override' : ' · template defaults until saved'}
                        </Alert>
                        {pricingConfig ? (
                          <PricingConfigSection
                            pricingConfig={pricingConfig}
                            onChange={setPricingConfig}
                          />
                        ) : null}
                      </>
                    )}
                  </SettingsSection>
                </Stack>
              </TabPanel>

              <TabPanel active={tab === 2}>
                <SettingsSection
                  title="Automatic messages"
                  description="Enable and edit customer message templates. Sending will be connected later."
                  action={(
                    <SaveButton
                      saving={savingOrders}
                      disabled={!selectedSellerId}
                      onClick={saveAutomaticMessages}
                      label="Save message settings"
                    />
                  )}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ display: { xs: 'none', sm: 'flex' }, px: 1.5, pb: 0.5 }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ width: 168, flexShrink: 0 }}>
                      Message
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                      Preview
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 120, textAlign: 'right' }}>
                      Status
                    </Typography>
                  </Stack>

                  <Stack spacing={1}>
                    {automaticMessages.map((message) => (
                      <Paper
                        key={message.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          transition: 'border-color 0.15s ease',
                          '&:hover': { borderColor: 'primary.light' },
                        }}
                      >
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          alignItems={{ xs: 'stretch', sm: 'center' }}
                          spacing={1.5}
                        >
                          <Typography
                            variant="body2"
                            sx={{ width: { sm: 168 }, fontWeight: 600, flexShrink: 0 }}
                          >
                            {message.label}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {truncateMessagePreview(message.body)}
                          </Typography>
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
                            spacing={1}
                            sx={{ width: { sm: 120 }, flexShrink: 0 }}
                          >
                            <Chip
                              label={message.enabled ? 'On' : 'Off'}
                              size="small"
                              color={message.enabled ? 'success' : 'default'}
                              variant={message.enabled ? 'filled' : 'outlined'}
                              sx={{ minWidth: 44 }}
                            />
                            <Tooltip title="Edit message">
                              <IconButton
                                size="small"
                                aria-label={`Edit ${message.label}`}
                                onClick={() => setEditMessage({ ...message })}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Switch
                              size="small"
                              checked={Boolean(message.enabled)}
                              onChange={(e) => updateAutomaticMessage(message.id, { enabled: e.target.checked })}
                              inputProps={{ 'aria-label': `Toggle ${message.label}` }}
                            />
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>

                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      Placeholders: {'{{ buyer_first_name }}'}, {'{{ shipping_carrier }}'}, {'{{ tracking_number }}'}, {'{{ feedback_url }}'}
                    </Typography>
                  </Stack>
                </SettingsSection>
              </TabPanel>

              <TabPanel active={tab === 3}>
                <Stack spacing={2.5}>
                  <SettingsSection
                    title="eBay UserID"
                    description="eBay account UserID for this store (used by Buyer Messages to tell seller vs buyer in conversations). Often differs from the Grow store login name."
                  >
                    <TextField
                      fullWidth
                      size="small"
                      label="eBay UserID"
                      value={general.ebayUserId || ''}
                      onChange={(e) => setGeneral((p) => ({ ...p, ebayUserId: e.target.value }))}
                      placeholder="e.g. techkey2025"
                      helperText="Enter the exact eBay UserID that appears in Message sender/recipient fields."
                    />
                  </SettingsSection>

                  <SettingsSection
                    title="Description template"
                    description="Used when building HTML descriptions for this store."
                    action={(
                      <SaveButton
                        saving={saving}
                        disabled={!selectedSellerId}
                        onClick={saveGeneralSettings}
                        label="Save general settings"
                      />
                    )}
                  >
                    <FormControl fullWidth size="small">
                      <InputLabel>Description template</InputLabel>
                      <Select
                        label="Description template"
                        value={general.descriptionTemplateId}
                        onChange={(e) => setGeneral((p) => ({ ...p, descriptionTemplateId: e.target.value }))}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {descriptionTemplates.map((template) => (
                          <MenuItem key={template.id} value={template.id}>
                            {template.title}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </SettingsSection>
                </Stack>
              </TabPanel>
            </>
          )}
        </Box>
      </Paper>

      <Dialog open={Boolean(editMessage)} onClose={() => setEditMessage(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 600 }}>
          Edit message — {editMessage?.label}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            label="Message body"
            value={editMessage?.body || ''}
            onChange={(e) => setEditMessage((prev) => ({ ...prev, body: e.target.value }))}
            fullWidth
            multiline
            minRows={10}
            margin="dense"
            helperText="Placeholders: {{ buyer_first_name }}, {{ shipping_carrier }}, {{ tracking_number }}, {{ feedback_url }}"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditMessage(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEditedMessage}>Apply</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
