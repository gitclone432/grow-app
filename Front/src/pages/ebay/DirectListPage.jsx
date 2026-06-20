import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../lib/api';
import { generateSKUFromASIN } from '../../utils/skuGenerator';

function countItemPhotoUrls(value) {
  if (!value) return 0;
  return String(value)
    .split(/\s*\|\s*|\s*,\s*|\n+/)
    .map((url) => url.trim())
    .filter(Boolean)
    .length;
}

function parseBulkAsins(text) {
  return [...new Set(
    String(text || '')
      .split(/[\s,;\n\r]+/)
      .map((asin) => asin.trim().toUpperCase())
      .filter((asin) => /^[A-Z0-9]{10}$/.test(asin))
  )];
}

/** Must match backend max per API call (templateListings direct-list-bulk routes). */
const BULK_BATCH_SIZE = 25;
const BULK_JOB_MAX_ASINS = 1000;
const BULK_JOB_DEFAULT_DELAY_MINUTES = 2;
const BULK_JOB_DEFAULT_DELAY_SECONDS = 5;
const BULK_JOB_MIN_DELAY_SECONDS = 3;
const BULK_JOB_MAX_DELAY_SECONDS = 60;

function defaultScheduleInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 5);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatJobScheduleEstimate(asinCount, gapMode, delayValue) {
  if (!asinCount) return 'Set ASINs to see timing estimate.';

  if (gapMode === 'listing') {
    const seconds = delayValue;
    if (asinCount <= 1) return 'One listing — no gap needed.';
    const waitSeconds = (asinCount - 1) * seconds;
    const mins = Math.floor(waitSeconds / 60);
    const secs = waitSeconds % 60;
    return `${asinCount} listings · ${seconds}s gap after each · ~${mins ? `${mins}m ` : ''}${secs}s total wait (plus listing time)`;
  }

  const batchCount = Math.ceil(asinCount / BULK_BATCH_SIZE);
  if (batchCount <= 1) return 'Runs in one batch.';
  const waitMinutes = (batchCount - 1) * delayValue;
  return `${batchCount} batches of ${BULK_BATCH_SIZE} · ${delayValue} min gap after each batch · ~${waitMinutes}m total wait`;
}

function chunkAsins(asins, size = BULK_BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < asins.length; i += size) {
    chunks.push(asins.slice(i, i + size));
  }
  return chunks;
}

function mergeBulkPreviewResults(batchResults) {
  const results = batchResults.flatMap((batch) => batch.results || []);
  const ready = results.filter((row) => row.status === 'ready').length;
  const failed = results.length - ready;
  return {
    success: failed === 0,
    total: results.length,
    ready,
    failed,
    results,
    batchCount: batchResults.length,
    message: `Prepared ${ready}/${results.length} listing(s) for review${batchResults.length > 1 ? ` (${batchResults.length} batches)` : ''}.`,
  };
}

function mergeBulkListResults(batchResults) {
  const results = batchResults.flatMap((batch) => batch.results || []);
  const successful = results.filter((row) => row.status === 'success').length;
  const failed = results.length - successful;
  return {
    success: failed === 0,
    total: results.length,
    successful,
    failed,
    verifyOnly: false,
    results,
    batchCount: batchResults.length,
    message: `Published ${successful}/${results.length} listing(s) on eBay${batchResults.length > 1 ? ` (${batchResults.length} batches)` : ''}.`,
  };
}

const BRAND_MODE_LABELS = {
  does_not_apply: 'Does Not Apply',
  from_scraper: 'From Amazon scraper',
};

const EMPTY_LISTING = {
  customLabel: '',
  title: '',
  startPrice: '',
  quantity: '1',
  categoryId: '',
  categoryName: '',
  itemPhotoUrl: '',
  description: '',
  customFields: {},
};

const STORE_CONTROLLED_FIELDS = new Set([
  'location',
  'country',
  'postalCode',
  'shippingProfileName',
  'returnProfileName',
  'paymentProfileName',
]);

function omitStoreControlledCustomFields(customFields = {}) {
  return Object.fromEntries(
    Object.entries(customFields).filter(
      ([key]) => key.replace(/^C:/i, '').trim().toLowerCase() !== 'brand'
    )
  );
}

function omitStoreControlledFields(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !STORE_CONTROLLED_FIELDS.has(key))
  );
}

function listingPayloadForApi(listing = {}) {
  return {
    ...omitStoreControlledFields(listing),
    customFields: omitStoreControlledCustomFields(listing.customFields || {}),
  };
}

function mergeListingFields(base, patch) {
  return {
    ...base,
    ...omitStoreControlledFields(patch),
    customFields: omitStoreControlledCustomFields({
      ...(base.customFields || {}),
      ...(patch.customFields || {}),
    }),
  };
}

function StoreListerSummary({ storeListerApplied }) {
  if (!storeListerApplied) return null;
  return (
    <>
      <Typography variant="body2">
        <strong>Location:</strong>{' '}
        {storeListerApplied.location || '—'}
        {storeListerApplied.country ? ` · ${storeListerApplied.country}` : ''}
        {storeListerApplied.postalCode ? ` · ${storeListerApplied.postalCode}` : ''}
      </Typography>
      <Typography variant="body2">
        <strong>Brand:</strong>{' '}
        {storeListerApplied.brand
          || (storeListerApplied.brandMode === 'does_not_apply' ? 'Does Not Apply' : '—')}
        {' '}
        ({BRAND_MODE_LABELS[storeListerApplied.brandMode] || BRAND_MODE_LABELS.from_scraper})
      </Typography>
      {(storeListerApplied.shippingProfileName || storeListerApplied.returnProfileName || storeListerApplied.paymentProfileName) && (
        <Typography variant="body2">
          <strong>Policies:</strong>{' '}
          {[
            storeListerApplied.shippingProfileName && `Shipping: ${storeListerApplied.shippingProfileName}`,
            storeListerApplied.returnProfileName && `Returns: ${storeListerApplied.returnProfileName}`,
            storeListerApplied.paymentProfileName && `Payment: ${storeListerApplied.paymentProfileName}`,
          ].filter(Boolean).join(' · ')}
        </Typography>
      )}
    </>
  );
}

function SingleListingReviewPanel({
  preview,
  result,
  verifyOnly,
  listingNow,
  canList,
  onSubmit,
}) {
  const showPreview = Boolean(preview?.listing);
  const showResult = Boolean(result);
  if (!showPreview && !showResult) return null;

  const listing = preview?.listing || result?.listing;
  const storeListerApplied = preview?.storeListerApplied || result?.storeListerApplied;
  const amazonSource = preview?.amazonSource;
  const specificsEntries = Object.entries(listing?.itemSpecifics || {}).filter(([, value]) => String(value ?? '').trim());
  const isValidated = showResult && !result?.verifiedOnly && result?.itemId;
  const isDryRun = showResult && (result?.verifiedOnly || verifyOnly);

  return (
    <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" gutterBottom sx={{ mb: 0.5 }}>
            {showResult
              ? (isValidated ? 'Listed on eBay' : isDryRun ? 'Validated on eBay' : 'eBay result')
              : 'Prepared listing'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {showResult
              ? 'Store settings were applied server-side before submission.'
              : 'Review below, then validate or list when ready.'}
          </Typography>
        </Box>
        {showResult && (
          <Chip
            size="small"
            color={result.status === 'error' || result.ack === 'Failure' ? 'error' : 'success'}
            label={isValidated ? 'Published' : isDryRun ? 'Dry run OK' : (result.ack || 'Done')}
          />
        )}
      </Stack>

      {listing && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body2"><strong>SKU:</strong> {listing.customLabel || '—'}</Typography>
          <Typography variant="body2"><strong>Title:</strong> {listing.title || '—'}</Typography>
          <Typography variant="body2">
            <strong>Price:</strong> ${listing.startPrice || '—'}
            {listing.quantity ? ` · Qty ${listing.quantity}` : ''}
          </Typography>
          <Typography variant="body2">
            <strong>Category:</strong>{' '}
            {listing.categoryId || '—'}
            {listing.categoryName ? ` (${listing.categoryName})` : ''}
          </Typography>
          <Typography variant="body2"><strong>Photos:</strong> {listing.photoCount ?? 0}</Typography>
          {listing.asin && <Typography variant="body2"><strong>ASIN:</strong> {listing.asin}</Typography>}
          <StoreListerSummary storeListerApplied={storeListerApplied} />
        </Stack>
      )}

      {showResult && result.itemId != null && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <strong>eBay Item ID:</strong>{' '}
          {result.listingUrl ? (
            <Link href={result.listingUrl} target="_blank" rel="noopener noreferrer">{result.itemId}</Link>
          ) : result.itemId}
          {result.ack && <> · Ack: {result.ack}</>}
        </Alert>
      )}

      {showResult && !result.itemId && result.ack && (
        <Alert severity={result.ack === 'Failure' ? 'error' : 'success'} sx={{ mb: 2 }}>
          eBay ack: {result.ack}
        </Alert>
      )}

      {!showResult && amazonSource && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Amazon source: {amazonSource.title || '—'} · Brand: {amazonSource.brand || '—'} · Price: {amazonSource.price || '—'} · Images: {amazonSource.imageCount ?? 0}
        </Alert>
      )}

      {!showResult && specificsEntries.length > 0 && (
        <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">
              Item specifics ({specificsEntries.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {specificsEntries.map(([key, value]) => (
                <Chip key={key} size="small" label={`${key}: ${value}`} variant="outlined" />
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {!showResult && showPreview && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="contained"
            color={verifyOnly ? 'secondary' : 'primary'}
            size="large"
            startIcon={listingNow ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
            onClick={onSubmit}
            disabled={!canList || listingNow}
          >
            {listingNow ? 'Submitting…' : verifyOnly ? 'Validate on eBay' : 'List on eBay now'}
          </Button>
        </Stack>
      )}
    </Paper>
  );
}

function BulkListingReviewPanel({
  preview,
  bulkResult,
  bulkProcessing,
  canBulk,
  onSubmit,
}) {
  const rows = bulkResult?.results?.length
    ? bulkResult.results
    : preview?.results || [];
  if (!rows.length) return null;

  const isSubmitted = Boolean(bulkResult?.results?.length);
  const total = bulkResult?.total ?? preview?.total ?? rows.length;
  const readyCount = preview?.ready ?? rows.filter((row) => row.status === 'ready' || row.status === 'success').length;
  const failedCount = bulkResult?.failed ?? preview?.failed ?? rows.filter((row) => row.status === 'error').length;

  return (
    <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" gutterBottom sx={{ mb: 0.5 }}>
            {isSubmitted ? 'Bulk eBay result' : 'Prepared listings'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isSubmitted
              ? 'Submission complete — see status per ASIN below.'
              : 'Review prepared listings, then list on eBay.'}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip label={`Total ${total}`} />
        <Chip color="success" label={isSubmitted ? `OK ${bulkResult.successful}` : `Ready ${readyCount}`} />
        <Chip color={failedCount ? 'error' : 'default'} label={`Failed ${failedCount}`} />
      </Stack>

      <TableContainer sx={{ mb: isSubmitted ? 0 : 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ASIN</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Photos</TableCell>
              {!isSubmitted && <TableCell>Location</TableCell>}
              {!isSubmitted && <TableCell>Brand</TableCell>}
              {isSubmitted && <TableCell>eBay ID</TableCell>}
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.asin}>
                <TableCell>{row.asin}</TableCell>
                <TableCell>{row.sku || row.listing?.customLabel || '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={
                      row.status === 'ready' || row.status === 'success'
                        ? 'success'
                        : 'error'
                    }
                    label={row.status}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.listing?.title || '—'}
                </TableCell>
                <TableCell>{row.listing?.startPrice ? `$${row.listing.startPrice}` : '—'}</TableCell>
                <TableCell>{row.listing?.photoCount ?? '—'}</TableCell>
                {!isSubmitted && (
                  <TableCell sx={{ maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.storeListerApplied?.location || row.listing?.location || '—'}
                  </TableCell>
                )}
                {!isSubmitted && (
                  <TableCell sx={{ maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.storeListerApplied?.brand
                      || (row.storeListerApplied?.brandMode === 'does_not_apply' ? 'Does Not Apply' : '—')}
                  </TableCell>
                )}
                {isSubmitted && (
                  <TableCell>
                    {row.listingUrl ? (
                      <Link href={row.listingUrl} target="_blank" rel="noopener noreferrer">{row.itemId}</Link>
                    ) : row.itemId || '—'}
                  </TableCell>
                )}
                <TableCell sx={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.error || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!isSubmitted && preview?.ready > 0 && (
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={bulkProcessing ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
          onClick={onSubmit}
          disabled={!canBulk || bulkProcessing}
        >
          {bulkProcessing
            ? 'Listing…'
            : `List ${preview.ready} on eBay now`}
        </Button>
      )}
    </Paper>
  );
}

export default function DirectListPage() {
  const [tab, setTab] = useState(0);
  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [region, setRegion] = useState('US');
  const [verifyOnly, setVerifyOnly] = useState(true);

  const [asin, setAsin] = useState('');
  const [listing, setListing] = useState(EMPTY_LISTING);
  const [amazonPreview, setAmazonPreview] = useState(null);
  const [pricingInfo, setPricingInfo] = useState(null);
  const [result, setResult] = useState(null);

  const [bulkAsinsText, setBulkAsinsText] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [singlePreview, setSinglePreview] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);

  const [loadingInit, setLoadingInit] = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [listingNow, setListingNow] = useState(false);
  const [bulkPreviewing, setBulkPreviewing] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkBatchProgress, setBulkBatchProgress] = useState(null);
  const [bulkJobs, setBulkJobs] = useState([]);
  const [bulkScheduleAt, setBulkScheduleAt] = useState(defaultScheduleInputValue);
  const [bulkDelayMinutes, setBulkDelayMinutes] = useState(BULK_JOB_DEFAULT_DELAY_MINUTES);
  const [bulkDelaySeconds, setBulkDelaySeconds] = useState(BULK_JOB_DEFAULT_DELAY_SECONDS);
  const [bulkGapMode, setBulkGapMode] = useState('listing');
  const [schedulingJob, setSchedulingJob] = useState(false);
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const parsedBulkAsins = useMemo(() => parseBulkAsins(bulkAsinsText), [bulkAsinsText]);
  const bulkBatchCount = useMemo(
    () => Math.ceil(parsedBulkAsins.length / BULK_BATCH_SIZE) || 0,
    [parsedBulkAsins.length]
  );
  const bulkExceedsJobLimit = parsedBulkAsins.length > BULK_JOB_MAX_ASINS;

  const loadBulkJobs = useCallback(async () => {
    if (!selectedSeller) {
      setBulkJobs([]);
      return;
    }
    try {
      const { data } = await api.get('/template-listings/direct-list-jobs', {
        params: { sellerId: selectedSeller },
      });
      setBulkJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      // optional
    }
  }, [selectedSeller]);

  useEffect(() => {
    if (tab !== 1) return undefined;
    void loadBulkJobs();
    const timer = setInterval(() => { void loadBulkJobs(); }, 15000);
    return () => clearInterval(timer);
  }, [tab, loadBulkJobs]);

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
  const canPreviewSingle = Boolean(
    selectedSeller
    && selectedTemplate
    && (canList || (asin.trim() && selectedTemplate))
  );
  const canBulk = Boolean(selectedSeller && selectedTemplate && parsedBulkAsins.length > 0);

  const prepareSinglePreview = async ({ listingPayload, asinOverride } = {}) => {
    const { data } = await api.post('/template-listings/direct-list/preview', {
      templateId: selectedTemplate,
      sellerId: selectedSeller,
      region,
      listing: listingPayload
        ? {
            ...listingPayload,
            _asinReference: asinOverride || asin.trim() || undefined,
          }
        : undefined,
      asin: !listingPayload && (asinOverride || asin.trim())
        ? (asinOverride || asin.trim())
        : undefined,
    });
    setSinglePreview(data);
    setResult(null);
    return data;
  };

  const handlePrepareSingle = async () => {
    if (!canPreviewSingle) return;
    setPreviewing(true);
    setError('');
    setSuccess('');

    try {
      const data = await prepareSinglePreview({
        listingPayload: canList ? listingPayloadForApi(listing) : undefined,
      });
      setSuccess(data.message || 'Listing prepared for review.');
    } catch (err) {
      setSinglePreview(null);
      setError(err.response?.data?.error || 'Failed to prepare listing');
    } finally {
      setPreviewing(false);
    }
  };

  const handleReviewBulk = async () => {
    if (!canBulk) return;
    setBulkPreviewing(true);
    setError('');
    setSuccess('');
    setBulkPreview(null);
    setBulkResult(null);
    setBulkBatchProgress(null);

    const batches = chunkAsins(parsedBulkAsins);
    const batchResponses = [];

    try {
      for (let i = 0; i < batches.length; i += 1) {
        setBulkBatchProgress({ current: i + 1, total: batches.length, phase: 'prepare' });
        const { data } = await api.post('/template-listings/direct-list-bulk/preview', {
          templateId: selectedTemplate,
          sellerId: selectedSeller,
          region,
          asins: batches[i],
        });
        batchResponses.push(data);
      }

      const merged = mergeBulkPreviewResults(batchResponses);
      setBulkPreview(merged);
      setSuccess(merged.message);
    } catch (err) {
      if (batchResponses.length > 0) {
        const partial = mergeBulkPreviewResults(batchResponses);
        setBulkPreview(partial);
      }
      setError(err.response?.data?.error || 'Failed to prepare bulk preview');
    } finally {
      setBulkPreviewing(false);
      setBulkBatchProgress(null);
    }
  };

  const handleAutofill = async () => {
    if (!canAutofill) return;
    setAutofilling(true);
    setError('');
    setSuccess('');
    setResult(null);
    setSinglePreview(null);

    try {
      const { data } = await api.post('/template-listings/autofill-from-asin', {
        asin: asin.trim(),
        templateId: selectedTemplate,
        sellerId: selectedSeller,
        region,
      });

      const { coreFields, customFields } = data.autoFilledData;
      const nextListing = mergeListingFields(EMPTY_LISTING, {
        ...coreFields,
        customLabel: generateSKUFromASIN(asin.trim()),
        customFields,
      });
      setListing(nextListing);
      setAmazonPreview(data.amazonSource || null);
      setPricingInfo(data.pricingCalculation || null);

      if (selectedSeller) {
        setPreviewing(true);
        try {
          const previewData = await prepareSinglePreview({
            listingPayload: listingPayloadForApi(nextListing),
            asinOverride: asin.trim(),
          });
          setSuccess(previewData.message || 'Autofilled and ready to review.');
        } catch (previewErr) {
          setSuccess(`Autofilled (${Object.keys(coreFields).length} fields). Prepare failed: ${previewErr.response?.data?.error || previewErr.message}`);
        } finally {
          setPreviewing(false);
        }
      } else {
        setSuccess(`Autofilled from Amazon (${Object.keys(coreFields).length} core fields). Select a seller to prepare.`);
      }
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
          ...listingPayloadForApi(listing),
          _asinReference: asin.trim() || undefined,
        },
      });

      setResult(data);
      setSinglePreview(null);
      setSuccess(data.message || (verifyOnly ? 'Validation passed.' : 'Listed on eBay.'));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to list on eBay');
    } finally {
      setListingNow(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!canBulk) return;
    setBulkProcessing(true);
    setError('');
    setSuccess('');
    setBulkResult(null);
    setBulkBatchProgress(null);

    const batches = chunkAsins(parsedBulkAsins);
    const batchResponses = [];

    try {
      for (let i = 0; i < batches.length; i += 1) {
        setBulkBatchProgress({ current: i + 1, total: batches.length, phase: 'list' });
        const { data } = await api.post('/template-listings/direct-list-bulk', {
          templateId: selectedTemplate,
          sellerId: selectedSeller,
          verifyOnly: false,
          region,
          asins: batches[i],
        });
        batchResponses.push(data);
      }

      const merged = mergeBulkListResults(batchResponses);
      setBulkResult(merged);
      setBulkPreview(null);
      setSuccess(merged.message);
    } catch (err) {
      if (batchResponses.length > 0) {
        const partial = mergeBulkListResults(batchResponses);
        setBulkResult(partial);
      }
      setError(err.response?.data?.error || 'Bulk direct list failed');
    } finally {
      setBulkProcessing(false);
      setBulkBatchProgress(null);
    }
  };

  const handleScheduleBulk = async (runAt) => {
    if (!canBulk || bulkExceedsJobLimit) return;
    setSchedulingJob(true);
    setError('');
    setSuccess('');

    try {
      const scheduledAt = runAt === 'now'
        ? new Date().toISOString()
        : new Date(bulkScheduleAt).toISOString();

      const { data } = await api.post('/template-listings/direct-list-jobs', {
        templateId: selectedTemplate,
        sellerId: selectedSeller,
        region,
        asins: parsedBulkAsins,
        scheduledAt,
        delayMinutesBetweenBatches: bulkDelayMinutes,
        delaySecondsBetweenListings: Math.min(
          BULK_JOB_MAX_DELAY_SECONDS,
          Math.max(BULK_JOB_MIN_DELAY_SECONDS, bulkDelaySeconds)
        ),
        batchSize: bulkGapMode === 'listing' ? 1 : BULK_BATCH_SIZE,
      });

      setSuccess(data.message || 'Bulk list job queued.');
      void loadBulkJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to queue bulk job');
    } finally {
      setSchedulingJob(false);
    }
  };

  const handleCancelBulkJob = async (jobId) => {
    try {
      await api.delete(`/template-listings/direct-list-jobs/${jobId}`);
      setSuccess('Scheduled job cancelled.');
      void loadBulkJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel job');
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
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Typography variant="h4" gutterBottom>
        Direct List to eBay
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        List SKUs directly on eBay using the Trading API — no CSV or Feed Upload step.
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
        </Stack>
      </Paper>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="Single SKU" />
        <Tab label={`Bulk ASINs${parsedBulkAsins.length ? ` (${parsedBulkAsins.length})` : ''}`} />
      </Tabs>

      {tab === 0 && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Stack spacing={2.5}>
              <FormControlLabel
                control={<Switch checked={verifyOnly} onChange={(e) => setVerifyOnly(e.target.checked)} />}
                label="Verify only (dry run — does not publish on eBay)"
              />

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

              {amazonPreview && !singlePreview && !result && (
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

          <Accordion
            defaultExpanded={!singlePreview && !result}
            disableGutters
            elevation={0}
            sx={{ mb: 3, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">Listing fields</Typography>
                <Typography variant="caption" color="text.secondary">
                  Template: {selectedTemplateName || '—'}
                  {(singlePreview || result) ? ' · Edit fields, then update preview below' : ''}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
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
                  helperText={`${countItemPhotoUrls(listing.itemPhotoUrl)} photo(s) — separate with | (up to 12)`}
                />

                {(singlePreview || result) ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={handlePrepareSingle}
                    disabled={!canPreviewSingle || previewing || listingNow}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    {previewing ? 'Updating preview…' : 'Update preview after edits'}
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    onClick={handlePrepareSingle}
                    disabled={!canPreviewSingle || previewing || autofilling}
                    startIcon={previewing ? <CircularProgress size={18} /> : <AutoFixHighIcon />}
                  >
                    {previewing ? 'Preparing…' : 'Prepare listing'}
                  </Button>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>

          <SingleListingReviewPanel
            preview={singlePreview}
            result={result}
            verifyOnly={verifyOnly}
            listingNow={listingNow}
            canList={canList}
            onSubmit={handleListOnEbay}
          />
        </>
      )}

      {tab === 1 && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Bulk ASINs</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Paste ASINs below. Use <strong>Prepare</strong> to review in the browser, <strong>List now</strong> for immediate listing, or <strong>Run in background / Schedule</strong> for large jobs (up to {BULK_JOB_MAX_ASINS}) — server processes {BULK_BATCH_SIZE} ASINs per batch with pauses to avoid rate limits.
            </Typography>

            <TextField
              label="ASINs"
              value={bulkAsinsText}
              onChange={(e) => setBulkAsinsText(e.target.value.toUpperCase())}
              fullWidth
              multiline
              minRows={6}
              placeholder={'B0XXXXXXXX\nB0YYYYYYYY\nB0ZZZZZZZZ'}
              helperText={
                parsedBulkAsins.length > 0
                  ? `${parsedBulkAsins.length} valid ASIN(s)${bulkBatchCount > 1 ? ` · ${bulkBatchCount} batches of ${BULK_BATCH_SIZE}` : ''}`
                  : '0 valid ASIN(s)'
              }
              sx={{ mb: 2 }}
            />

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Listing pace (background / schedule)
              </Typography>
              <FormControl component="fieldset" sx={{ mb: 1.5 }}>
                <RadioGroup
                  value={bulkGapMode}
                  onChange={(e) => setBulkGapMode(e.target.value)}
                >
                  <FormControlLabel
                    value="listing"
                    control={<Radio size="small" />}
                    label="Gap after each listing (1 ASIN, then wait — safest for large runs)"
                  />
                  <FormControlLabel
                    value="batch"
                    control={<Radio size="small" />}
                    label={`Gap after each batch (${BULK_BATCH_SIZE} ASINs, then wait — faster)`}
                  />
                </RadioGroup>
              </FormControl>
              <TextField
                label={bulkGapMode === 'listing' ? 'Seconds between listings' : 'Minutes between batches'}
                type="number"
                size="small"
                value={bulkGapMode === 'listing' ? bulkDelaySeconds : bulkDelayMinutes}
                onChange={(e) => {
                  if (bulkGapMode === 'listing') {
                    setBulkDelaySeconds(Math.min(
                      BULK_JOB_MAX_DELAY_SECONDS,
                      Math.max(BULK_JOB_MIN_DELAY_SECONDS, Number(e.target.value) || BULK_JOB_DEFAULT_DELAY_SECONDS)
                    ));
                  } else {
                    setBulkDelayMinutes(Math.max(1, Number(e.target.value) || BULK_JOB_DEFAULT_DELAY_MINUTES));
                  }
                }}
                inputProps={bulkGapMode === 'listing'
                  ? { min: BULK_JOB_MIN_DELAY_SECONDS, max: BULK_JOB_MAX_DELAY_SECONDS }
                  : { min: 1, max: 60 }}
                helperText={formatJobScheduleEstimate(
                  parsedBulkAsins.length,
                  bulkGapMode,
                  bulkGapMode === 'listing' ? bulkDelaySeconds : bulkDelayMinutes
                )}
                sx={{ maxWidth: 320 }}
              />
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleReviewBulk}
                disabled={!canBulk || bulkPreviewing || bulkProcessing || schedulingJob}
                startIcon={bulkPreviewing ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
              >
                {bulkPreviewing
                  ? 'Preparing…'
                  : `Prepare ${parsedBulkAsins.length || 0} listing${parsedBulkAsins.length === 1 ? '' : 's'}`}
              </Button>
              <Button
                variant="outlined"
                startIcon={schedulingJob ? <CircularProgress size={18} /> : <CloudUploadIcon />}
                disabled={!canBulk || bulkPreviewing || bulkProcessing || schedulingJob || bulkExceedsJobLimit}
                onClick={() => handleScheduleBulk('now')}
              >
                Run in background
              </Button>
              <Button
                variant="outlined"
                startIcon={<ScheduleIcon />}
                disabled={!canBulk || bulkPreviewing || bulkProcessing || schedulingJob || bulkExceedsJobLimit}
                onClick={() => setShowScheduleOptions((v) => !v)}
              >
                Schedule…
              </Button>
            </Stack>

            {bulkExceedsJobLimit && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Maximum {BULK_JOB_MAX_ASINS} ASINs per scheduled job. Split into multiple jobs or use fewer ASINs.
              </Alert>
            )}

            {showScheduleOptions && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack spacing={2}>
                  <TextField
                    label="Start time"
                    type="datetime-local"
                    size="small"
                    value={bulkScheduleAt}
                    onChange={(e) => setBulkScheduleAt(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    startIcon={schedulingJob ? <CircularProgress size={18} color="inherit" /> : <ScheduleIcon />}
                    disabled={!canBulk || schedulingJob || bulkExceedsJobLimit}
                    onClick={() => handleScheduleBulk('scheduled')}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Schedule {parsedBulkAsins.length || 0} listing{parsedBulkAsins.length === 1 ? '' : 's'}
                  </Button>
                </Stack>
              </Paper>
            )}
          </Paper>

          {bulkJobs.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
              <Typography variant="h6" gutterBottom>Background jobs</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                Runs on the server — safe to close this page. Refreshes every 15s.
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Status</TableCell>
                      <TableCell>ASINs</TableCell>
                      <TableCell>Progress</TableCell>
                      <TableCell>Gap</TableCell>
                      <TableCell>Scheduled</TableCell>
                      <TableCell>OK / Failed</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkJobs.map((job) => (
                      <TableRow key={job._id}>
                        <TableCell>
                          <Chip size="small" label={job.status} color={
                            job.status === 'done' ? 'success'
                              : job.status === 'failed' ? 'error'
                                : job.status === 'processing' ? 'info'
                                  : 'default'
                          } />
                        </TableCell>
                        <TableCell>{job.totalAsins ?? job.asins?.length ?? '—'}</TableCell>
                        <TableCell>
                          {job.currentBatchIndex ?? 0}/{job.batchCount ?? '—'} batches
                        </TableCell>
                        <TableCell>
                          {job.batchSize === 1
                            ? `Per listing · ${job.delaySecondsBetweenListings ?? BULK_JOB_DEFAULT_DELAY_SECONDS}s`
                            : `Per ${job.batchSize || BULK_BATCH_SIZE} · ${job.delayMinutesBetweenBatches ?? BULK_JOB_DEFAULT_DELAY_MINUTES}m`}
                        </TableCell>
                        <TableCell>
                          {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>{job.successfulCount ?? 0} / {job.failedCount ?? 0}</TableCell>
                        <TableCell>
                          {job.status === 'pending' && (
                            <Button size="small" onClick={() => handleCancelBulkJob(job._id)}>Cancel</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          <BulkListingReviewPanel
            preview={bulkPreview}
            bulkResult={bulkResult}
            bulkProcessing={bulkProcessing}
            canBulk={canBulk}
            onSubmit={handleBulkSubmit}
          />
        </>
      )}

      {bulkBatchProgress && (
        <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {bulkBatchProgress.phase === 'list' ? 'Listing' : 'Preparing'} batch {bulkBatchProgress.current} of {bulkBatchProgress.total}…
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(bulkBatchProgress.current / bulkBatchProgress.total) * 100}
          />
        </Paper>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    </Box>
  );
}
