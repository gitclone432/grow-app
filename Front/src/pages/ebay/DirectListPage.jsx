import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import api from '../../lib/api';
import { generateSKUFromASIN } from '../../utils/skuGenerator';

const EMPTY_LISTING = {
  customLabel: '',
  title: '',
  startPrice: '',
  quantity: '1',
  categoryId: '',
  categoryName: '',
  itemPhotoUrl: '',
  description: '',
  shippingProfileName: 'Shipping Policy',
  returnProfileName: 'Return Policy',
  paymentProfileName: 'Payment Policy',
  location: 'United States',
  country: 'US',
  postalCode: '',
  customFields: {},
};

function mergeListingFields(base, patch) {
  return {
    ...base,
    ...patch,
    customFields: {
      ...(base.customFields || {}),
      ...(patch.customFields || {}),
    },
  };
}

function findCustomFieldKey(customFields = {}, aspectName) {
  const target = String(aspectName || '').trim().toLowerCase();
  const match = Object.keys(customFields).find(
    (key) => key.replace(/^C:/i, '').trim().toLowerCase() === target
  );
  return match || `C:${aspectName}`;
}

function getCustomFieldValue(customFields = {}, aspectName) {
  const key = findCustomFieldKey(customFields, aspectName);
  return String(customFields[key] ?? '').trim();
}

function setCustomFieldValue(customFields = {}, aspectName, value) {
  const key = findCustomFieldKey(customFields, aspectName);
  return { ...customFields, [key]: value };
}

export default function DirectListPage() {
  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [asin, setAsin] = useState('');
  const [region, setRegion] = useState('US');
  const [verifyOnly, setVerifyOnly] = useState(true);
  const [listing, setListing] = useState(EMPTY_LISTING);
  const [amazonPreview, setAmazonPreview] = useState(null);
  const [pricingInfo, setPricingInfo] = useState(null);

  const [loadingInit, setLoadingInit] = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [listingNow, setListingNow] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoadingInit(true);
      try {
        const [sellersRes, templatesRes] = await Promise.all([
          api.get('/sellers/all'),
          api.get('/listing-templates'),
        ]);
        const nextSellers = sellersRes.data || [];
        const nextTemplates = templatesRes.data || [];
        setSellers(nextSellers);
        setTemplates(nextTemplates);
        if (nextSellers.length > 0) setSelectedSeller(nextSellers[0]._id);
        if (nextTemplates.length > 0) setSelectedTemplate(nextTemplates[0]._id);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load sellers or templates');
      } finally {
        setLoadingInit(false);
      }
    };
    load();
  }, []);

  const canAutofill = Boolean(asin.trim() && selectedTemplate);
  const canList = Boolean(
    selectedSeller
    && selectedTemplate
    && listing.customLabel
    && listing.title
    && listing.startPrice
    && listing.categoryId
    && listing.itemPhotoUrl
  );

  const handleAutofill = async () => {
    if (!canAutofill) return;
    setAutofilling(true);
    setError('');
    setSuccess('');
    setResult(null);

    try {
      const { data } = await api.post('/template-listings/autofill-from-asin', {
        asin: asin.trim(),
        templateId: selectedTemplate,
        sellerId: selectedSeller,
        region,
      });

      const { coreFields, customFields } = data.autoFilledData;
      const generatedSKU = generateSKUFromASIN(asin.trim());

      setListing((prev) => mergeListingFields(prev, {
        ...coreFields,
        customLabel: generatedSKU,
        customFields,
      }));
      setAmazonPreview(data.amazonSource || null);
      setPricingInfo(data.pricingCalculation || null);
      setSuccess(`Autofilled from Amazon (${Object.keys(coreFields).length} core fields, ${Object.keys(customFields).length} custom fields).`);
    } catch (err) {
      setError(err.response?.data?.error || 'Autofill failed');
    } finally {
      setAutofilling(false);
    }
  };

  const handleListOnEbay = async () => {
    if (!canList) return;
    setListingNow(true);
    setError('');
    setSuccess('');
    setResult(null);

    try {
      const { data } = await api.post('/template-listings/direct-list', {
        templateId: selectedTemplate,
        sellerId: selectedSeller,
        verifyOnly,
        region,
        listing: {
          ...listing,
          _asinReference: asin.trim() || undefined,
        },
      });

      setResult(data);
      setSuccess(data.message || (verifyOnly ? 'Validation passed.' : 'Listed on eBay.'));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to list on eBay');
    } finally {
      setListingNow(false);
    }
  };

  const selectedTemplateName = useMemo(
    () => templates.find((t) => t._id === selectedTemplate)?.name || '',
    [templates, selectedTemplate]
  );

  if (loadingInit) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 960 }}>
      <Typography variant="h4" gutterBottom>
        Direct List to eBay
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        List a single SKU directly on eBay using the Trading API (<code>AddFixedPriceItem</code>).
        No CSV file and no Feed Upload step — the listing goes live immediately when you publish.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Seller</InputLabel>
              <Select value={selectedSeller} label="Seller" onChange={(e) => setSelectedSeller(e.target.value)}>
                {sellers.map((seller) => (
                  <MenuItem key={seller._id} value={seller._id}>
                    {seller.storeName || seller.user?.username || seller._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Template</InputLabel>
              <Select value={selectedTemplate} label="Template" onChange={(e) => setSelectedTemplate(e.target.value)}>
                {templates.map((template) => (
                  <MenuItem key={template._id} value={template._id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Region</InputLabel>
              <Select value={region} label="Region" onChange={(e) => setRegion(e.target.value)}>
                <MenuItem value="US">US</MenuItem>
                <MenuItem value="UK">UK</MenuItem>
                <MenuItem value="AU">AU</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField
              label="Amazon ASIN"
              size="small"
              value={asin}
              onChange={(e) => setAsin(e.target.value.toUpperCase())}
              placeholder="B0XXXXXXXX"
              fullWidth
            />
            <Button
              variant="outlined"
              startIcon={autofilling ? <CircularProgress size={18} /> : <AutoFixHighIcon />}
              onClick={handleAutofill}
              disabled={!canAutofill || autofilling}
              sx={{ whiteSpace: 'nowrap', minWidth: 160 }}
            >
              {autofilling ? 'Autofilling…' : 'Autofill from ASIN'}
            </Button>
          </Stack>

          {amazonPreview && (
            <Alert severity="info">
              Amazon: {amazonPreview.title || '—'} · Brand: {amazonPreview.brand || '—'} · Price: {amazonPreview.price || '—'} · Images: {amazonPreview.imageCount ?? 0}
            </Alert>
          )}

          {pricingInfo?.enabled && !pricingInfo?.error && (
            <Alert severity="success">
              Calculated start price: ${pricingInfo.calculatedStartPrice} (Amazon cost: {pricingInfo.amazonCost})
            </Alert>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Listing fields</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Template: {selectedTemplateName || '—'}
        </Typography>

        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="SKU" size="small" value={listing.customLabel} onChange={(e) => setListing((p) => ({ ...p, customLabel: e.target.value }))} fullWidth required />
            <TextField label="Start price" size="small" value={listing.startPrice} onChange={(e) => setListing((p) => ({ ...p, startPrice: e.target.value }))} fullWidth required />
            <TextField label="Quantity" size="small" value={listing.quantity} onChange={(e) => setListing((p) => ({ ...p, quantity: e.target.value }))} sx={{ minWidth: 100 }} />
          </Stack>

          <TextField
            label="Title"
            size="small"
            value={listing.title}
            onChange={(e) => setListing((p) => ({ ...p, title: e.target.value }))}
            fullWidth
            required
            inputProps={{ maxLength: 80 }}
            helperText={`${listing.title.length}/80 characters`}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Category ID" size="small" value={listing.categoryId} onChange={(e) => setListing((p) => ({ ...p, categoryId: e.target.value }))} fullWidth required />
            <TextField label="Category name" size="small" value={listing.categoryName} onChange={(e) => setListing((p) => ({ ...p, categoryName: e.target.value }))} fullWidth />
          </Stack>

          <TextField
            label="Item photo URLs (pipe-separated, required)"
            size="small"
            value={listing.itemPhotoUrl}
            onChange={(e) => setListing((p) => ({ ...p, itemPhotoUrl: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
            required
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Item location"
              size="small"
              value={listing.location}
              onChange={(e) => setListing((p) => ({ ...p, location: e.target.value }))}
              fullWidth
              required
              placeholder="e.g. New York, NY"
              helperText="Shown on the eBay listing (city/region or country)"
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Country</InputLabel>
              <Select
                value={listing.country}
                label="Country"
                onChange={(e) => setListing((p) => ({ ...p, country: e.target.value }))}
              >
                <MenuItem value="US">US</MenuItem>
                <MenuItem value="GB">GB</MenuItem>
                <MenuItem value="CA">CA</MenuItem>
                <MenuItem value="AU">AU</MenuItem>
                <MenuItem value="DE">DE</MenuItem>
                <MenuItem value="IN">IN</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Postal / ZIP code"
              size="small"
              value={listing.postalCode}
              onChange={(e) => setListing((p) => ({ ...p, postalCode: e.target.value }))}
              sx={{ minWidth: 160 }}
              placeholder="Optional"
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Brand (item specific)"
              size="small"
              value={getCustomFieldValue(listing.customFields, 'Brand')}
              onChange={(e) => setListing((p) => ({
                ...p,
                customFields: setCustomFieldValue(p.customFields, 'Brand', e.target.value),
              }))}
              fullWidth
              required
              helperText="Required by many eBay categories"
            />
            <TextField
              label="Storage Capacity (item specific)"
              size="small"
              value={getCustomFieldValue(listing.customFields, 'Storage Capacity')}
              onChange={(e) => setListing((p) => ({
                ...p,
                customFields: setCustomFieldValue(p.customFields, 'Storage Capacity', e.target.value),
              }))}
              fullWidth
              helperText="Filled from Amazon product info when available"
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Return policy name" size="small" value={listing.returnProfileName} onChange={(e) => setListing((p) => ({ ...p, returnProfileName: e.target.value }))} fullWidth />
            <TextField label="Payment policy name" size="small" value={listing.paymentProfileName} onChange={(e) => setListing((p) => ({ ...p, paymentProfileName: e.target.value }))} fullWidth />
          </Stack>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
        <FormControlLabel
          control={<Switch checked={verifyOnly} onChange={(e) => setVerifyOnly(e.target.checked)} />}
          label="Verify only (dry run — does not publish)"
        />
        <Button
          variant="contained"
          color={verifyOnly ? 'secondary' : 'primary'}
          size="large"
          startIcon={listingNow ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
          onClick={handleListOnEbay}
          disabled={!canList || listingNow}
        >
          {listingNow ? 'Submitting…' : verifyOnly ? 'Validate on eBay' : 'List on eBay now'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {result && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Result</Typography>
          <Stack spacing={1}>
            {result.itemId && (
              <Typography variant="body2">
                <strong>eBay Item ID:</strong>{' '}
                {result.listingUrl ? (
                  <Link href={result.listingUrl} target="_blank" rel="noopener noreferrer">{result.itemId}</Link>
                ) : result.itemId}
              </Typography>
            )}
            <Typography variant="body2"><strong>SKU:</strong> {result.listing?.customLabel}</Typography>
            <Typography variant="body2"><strong>Title:</strong> {result.listing?.title}</Typography>
            <Typography variant="body2"><strong>Ack:</strong> {result.ack}</Typography>
            {result.warnings?.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {result.warnings.join('; ')}
              </Alert>
            )}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
