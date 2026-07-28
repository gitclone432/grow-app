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
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  Link,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
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
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';
import { generateSKUFromASIN } from '../../utils/skuGenerator';
import AsinReviewModal from '../../components/AsinReviewModal.jsx';
import { fetchDescriptionTemplateGallery } from '../../lib/descriptionTemplateGalleryApi.js';
import { fetchSellersAll } from '../../lib/sellersAllCache.js';
import { fetchListingTemplatesSummary } from '../../lib/listingTemplatesCache.js';
import {
  pickInitialSelection,
  readDirectListPrefs,
  writeDirectListPrefs,
} from '../../lib/directListPrefs.js';
import { useDirectListContext } from '../../hooks/useDirectListContext.js';

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
  const previewItems = batchResults.flatMap(
    (batch) => batch.previewItems
      || (batch.results || []).map((row) => row.reviewItem).filter(Boolean)
  );
  const customColumns = batchResults.find((batch) => Array.isArray(batch.customColumns) && batch.customColumns.length > 0)?.customColumns || [];
  const ready = results.filter((row) => row.status === 'ready').length;
  const failed = results.length - ready;
  return {
    success: failed === 0,
    total: results.length,
    ready,
    failed,
    results,
    previewItems,
    customColumns,
    batchCount: batchResults.length,
    message: `Prepared ${ready}/${results.length} listing(s) for review${batchResults.length > 1 ? ` (${batchResults.length} batches)` : ''}.`,
  };
}

function mergeBulkListResults(batchResults, { retriedCount = 0 } = {}) {
  const results = batchResults.flatMap((batch) => batch.results || []);
  const successful = results.filter((row) => row.status === 'success').length;
  const failed = results.length - successful;
  const retryNote = retriedCount > 0 ? ` · retried ${retriedCount} failed` : '';
  return {
    success: failed === 0,
    total: results.length,
    successful,
    failed,
    verifyOnly: false,
    results,
    batchCount: batchResults.length,
    retriedCount,
    message: `Published ${successful}/${results.length} listing(s) on eBay${batchResults.length > 1 ? ` (${batchResults.length} batches)` : ''}${retryNote}.`,
  };
}

function buildListingsByAsin(listings = []) {
  const listingsByAsin = {};
  for (const listing of listings) {
    const asin = String(listing?._asinReference || listing?.asin || '').trim().toUpperCase();
    if (!asin) continue;
    listingsByAsin[asin] = listingPayloadForApi(listing);
  }
  return listingsByAsin;
}

function createLoadingPreviewItems(asins = []) {
  return asins.map((asin) => ({
    id: `loading-${asin}`,
    asin,
    sku: generateSKUFromASIN(asin),
    status: 'loading',
    sourceData: null,
    generatedListing: null,
    pricingCalculation: null,
    warnings: [],
    errors: [],
  }));
}

function pickListingOverridesForAsins(listingOverrides, asins = []) {
  const picked = {};
  for (const asin of asins) {
    if (listingOverrides[asin]) {
      picked[asin] = listingOverrides[asin];
    }
  }
  return picked;
}

function mergeListResultsWithRetry(firstPass, retryPass) {
  const retryMap = Object.fromEntries(
    (retryPass.results || []).map((row) => [row.asin, row])
  );
  const results = (firstPass.results || []).map((row) => retryMap[row.asin] || row);
  const successful = results.filter((row) => row.status === 'success').length;
  const failed = results.length - successful;
  const retriedCount = (retryPass.results || []).length;
  return {
    ...firstPass,
    results,
    successful,
    failed,
    success: failed === 0,
    retriedCount,
    message: `Published ${successful}/${results.length} listing(s) on eBay · retried ${retriedCount} failed once.`,
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

function mergeStoreListerSummary(applied, sellerDefaults) {
  const base = sellerDefaults || {};
  const prep = applied || {};
  return {
    location: prep.location || base.location || '',
    country: prep.country || base.country || '',
    postalCode: prep.postalCode || base.postalCode || '',
    shippingProfileName: base.shippingProfileName || prep.shippingProfileName || '',
    returnProfileName: base.returnProfileName || prep.returnProfileName || '',
    paymentProfileName: base.paymentProfileName || prep.paymentProfileName || '',
    brandMode: prep.brandMode ?? base.brandMode,
    brand: prep.brand ?? base.brand,
  };
}

function StoreListerSummary({ storeListerApplied, storeListerDefaults }) {
  const summary = mergeStoreListerSummary(storeListerApplied, storeListerDefaults);
  const hasContent = summary.location
    || summary.shippingProfileName
    || summary.returnProfileName
    || summary.paymentProfileName
    || summary.brandMode;
  if (!hasContent) return null;
  return (
    <>
      <Typography variant="body2">
        <strong>Location:</strong>{' '}
        {summary.location || '—'}
        {summary.country ? ` · ${summary.country}` : ''}
        {summary.postalCode ? ` · ${summary.postalCode}` : ''}
      </Typography>
      <Typography variant="body2">
        <strong>Brand:</strong>{' '}
        {summary.brand
          || (summary.brandMode === 'does_not_apply' ? 'Does Not Apply' : '—')}
        {' '}
        ({BRAND_MODE_LABELS[summary.brandMode] || BRAND_MODE_LABELS.from_scraper})
      </Typography>
      {(summary.shippingProfileName || summary.returnProfileName || summary.paymentProfileName) && (
        <Typography variant="body2">
          <strong>Policies:</strong>{' '}
          {[
            summary.shippingProfileName && `Shipping: ${summary.shippingProfileName}`,
            summary.returnProfileName && `Returns: ${summary.returnProfileName}`,
            summary.paymentProfileName && `Payment: ${summary.paymentProfileName}`,
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
  storeListerDefaults,
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
          <StoreListerSummary
            storeListerApplied={storeListerApplied}
            storeListerDefaults={storeListerDefaults}
          />
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

function BulkListingReviewPanel({ bulkResult, bulkProcessing }) {
  const rows = bulkResult?.results || [];
  if (!rows.length) return null;

  return (
    <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" gutterBottom sx={{ mb: 0.5 }}>
            Bulk eBay result
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Submission complete — failed ASINs were retried once automatically.
          </Typography>
        </Box>
        {bulkProcessing && <CircularProgress size={24} />}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Chip label={`Total ${bulkResult.total}`} />
        <Chip color="success" icon={<CheckCircleIcon />} label={`OK ${bulkResult.successful}`} />
        <Chip
          color={bulkResult.failed ? 'error' : 'default'}
          icon={bulkResult.failed ? <ErrorIcon /> : undefined}
          label={`Failed ${bulkResult.failed}`}
        />
        {bulkResult.retriedCount > 0 && (
          <Chip size="small" variant="outlined" label={`Retried ${bulkResult.retriedCount}`} />
        )}
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={50}>Status</TableCell>
              <TableCell>ASIN</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>eBay ID</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.asin}>
                <TableCell>
                  {row.status === 'success' ? (
                    <CheckCircleIcon color="success" fontSize="small" />
                  ) : (
                    <ErrorIcon color="error" fontSize="small" />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">{row.asin}</Typography>
                </TableCell>
                <TableCell>{row.sku || row.listing?.customLabel || '—'}</TableCell>
                <TableCell sx={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.listing?.title || '—'}
                </TableCell>
                <TableCell>
                  {row.listingUrl ? (
                    <Link href={row.listingUrl} target="_blank" rel="noopener noreferrer">{row.itemId}</Link>
                  ) : row.itemId || '—'}
                </TableCell>
                <TableCell sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.error || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
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
  const [previewItems, setPreviewItems] = useState([]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [bulkPreviewCustomColumns, setBulkPreviewCustomColumns] = useState([]);
  const [galleryTemplates, setGalleryTemplates] = useState([]);
  const [galleryStoreMap, setGalleryStoreMap] = useState({});
  const [singlePreview, setSinglePreview] = useState(null);

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [listingNow, setListingNow] = useState(false);
  const [bulkPreviewing, setBulkPreviewing] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkBatchProgress, setBulkBatchProgress] = useState(null);
  const [bulkJobs, setBulkJobs] = useState([]);
  const [batchHistory, setBatchHistory] = useState([]);
  const [batchHistoryLoading, setBatchHistoryLoading] = useState(false);
  const [batchHistoryError, setBatchHistoryError] = useState('');
  const [historyStoreFilter, setHistoryStoreFilter] = useState('all'); // all | sellerId
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all'); // all | draft | publish | verify
  const [historyResultFilter, setHistoryResultFilter] = useState('all'); // all | ok | failed | mixed
  const [historyTemplateFilter, setHistoryTemplateFilter] = useState('all'); // all | template name
  const [expandedBatchId, setExpandedBatchId] = useState('');
  const [expandedBatchDetail, setExpandedBatchDetail] = useState(null);
  const [expandedBatchLoading, setExpandedBatchLoading] = useState(false);
  const [historyDetailsOpen, setHistoryDetailsOpen] = useState(false);
  const [historyDetailsBatch, setHistoryDetailsBatch] = useState(null);
  const [historyDetailsLoading, setHistoryDetailsLoading] = useState(false);
  const [historyDetailExpandedKey, setHistoryDetailExpandedKey] = useState('');
  const [historyListTarget, setHistoryListTarget] = useState(null);
  const [historyListing, setHistoryListing] = useState(false);
  const [bulkScheduleAt, setBulkScheduleAt] = useState(defaultScheduleInputValue);
  const [bulkDelayMinutes, setBulkDelayMinutes] = useState(BULK_JOB_DEFAULT_DELAY_MINUTES);
  const [bulkDelaySeconds, setBulkDelaySeconds] = useState(BULK_JOB_DEFAULT_DELAY_SECONDS);
  const [bulkGapMode, setBulkGapMode] = useState('listing');
  const [schedulingJob, setSchedulingJob] = useState(false);
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showListingPace, setShowListingPace] = useState(false);

  const {
    storeListerDefaults,
    ebayMarketplace,
    pricingConfig,
    effectiveTemplate,
  } = useDirectListContext(selectedSeller, selectedTemplate);

  useEffect(() => {
    if (!reviewModalOpen) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const gallery = await fetchDescriptionTemplateGallery();
        if (cancelled) return;
        setGalleryTemplates(Array.isArray(gallery.templates) ? gallery.templates : []);
        setGalleryStoreMap(
          gallery.storeTemplateMap && typeof gallery.storeTemplateMap === 'object'
            ? gallery.storeTemplateMap
            : {}
        );
      } catch {
        if (!cancelled) {
          setGalleryTemplates([]);
          setGalleryStoreMap({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewModalOpen]);

  const selectedStoreTemplate = useMemo(() => {
    if (!selectedSeller) return null;
    const assignedId = galleryStoreMap[selectedSeller] ?? galleryStoreMap[String(selectedSeller)];
    if (!assignedId) return null;
    return galleryTemplates.find((template) => String(template?.id) === String(assignedId)) || null;
  }, [selectedSeller, galleryTemplates, galleryStoreMap]);

  const reviewTemplateColumns = useMemo(() => {
    const customColumns = bulkPreviewCustomColumns.length > 0
      ? bulkPreviewCustomColumns
      : (effectiveTemplate?.customColumns || []);
    return [
      ...customColumns.map((col) => ({
        ...col,
        label: col.displayName || col.name,
        type: 'custom',
      })),
      { name: 'title', label: 'Title', type: 'core' },
      { name: 'description', label: 'Description', type: 'core' },
      { name: 'startPrice', label: 'Start Price', type: 'core' },
      { name: 'quantity', label: 'Quantity', type: 'core' },
      { name: 'categoryId', label: 'Category ID', type: 'core' },
      { name: 'categoryName', label: 'Category Name', type: 'core' },
    ];
  }, [bulkPreviewCustomColumns, effectiveTemplate]);

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
        params: { sellerId: selectedSeller, limit: 50 },
      });
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      setBulkJobs(jobs.filter((job) => (job.execution || 'queued') === 'queued'));
    } catch {
      // optional
    }
  }, [selectedSeller]);

  const loadBatchHistory = useCallback(async () => {
    setBatchHistoryLoading(true);
    setBatchHistoryError('');
    try {
      const params = { limit: 200 };
      if (historyStoreFilter && historyStoreFilter !== 'all') {
        params.sellerId = historyStoreFilter;
      }
      const { data } = await api.get('/template-listings/direct-list-history', { params });
      setBatchHistory(Array.isArray(data.batches) ? data.batches : []);
    } catch (err) {
      setBatchHistory([]);
      setBatchHistoryError(err?.response?.data?.error || err.message || 'Failed to load batch history');
    } finally {
      setBatchHistoryLoading(false);
    }
  }, [historyStoreFilter]);

  const historyStoresSorted = useMemo(() => {
    return [...sellers].sort((a, b) => {
      const left = String(a.user?.username || a.user?.email || '').toLowerCase();
      const right = String(b.user?.username || b.user?.email || '').toLowerCase();
      return left.localeCompare(right, undefined, { sensitivity: 'base' });
    });
  }, [sellers]);

  const historyTemplateOptions = useMemo(() => {
    const names = [...new Set(
      batchHistory
        .map((row) => String(row.templateName || '').trim())
        .filter((name) => name && name !== '—')
    )];
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [batchHistory]);

  const filteredBatchHistory = useMemo(() => {
    return batchHistory.filter((job) => {
      const runType = job.runType || 'publish';
      if (historyTypeFilter !== 'all' && runType !== historyTypeFilter) return false;

      if (historyTemplateFilter !== 'all') {
        if (String(job.templateName || '') !== historyTemplateFilter) return false;
      }

      const ok = Number(job.successfulCount) || 0;
      const failed = Number(job.failedCount) || 0;
      if (historyResultFilter === 'ok' && !(ok > 0 && failed === 0)) return false;
      if (historyResultFilter === 'failed' && !(failed > 0 && ok === 0)) return false;
      if (historyResultFilter === 'mixed' && !(ok > 0 && failed > 0)) return false;
      if (historyResultFilter === 'has_failed' && !(failed > 0)) return false;

      return true;
    });
  }, [batchHistory, historyTypeFilter, historyTemplateFilter, historyResultFilter]);

  useEffect(() => {
    if (tab !== 1) return undefined;
    void loadBulkJobs();
    const timer = setInterval(() => { void loadBulkJobs(); }, 15000);
    return () => clearInterval(timer);
  }, [tab, loadBulkJobs]);

  useEffect(() => {
    if (tab !== 2) return undefined;
    void loadBatchHistory();
    const timer = setInterval(() => { void loadBatchHistory(); }, 20000);
    return () => clearInterval(timer);
  }, [tab, loadBatchHistory]);

  const fetchHistoryBatchDetail = async (jobId) => {
    const { data } = await api.get(`/template-listings/direct-list-history/${encodeURIComponent(jobId)}`);
    return data.batch || null;
  };

  const openHistoryDetails = async (job) => {
    setHistoryDetailsOpen(true);
    setHistoryDetailsBatch(null);
    setHistoryDetailExpandedKey('');
    setHistoryDetailsLoading(true);
    try {
      const batch = await fetchHistoryBatchDetail(job._id);
      setHistoryDetailsBatch(batch);
    } catch {
      setHistoryDetailsBatch(null);
      setError('Failed to load batch details');
    } finally {
      setHistoryDetailsLoading(false);
    }
  };

  const openHistoryListConfirm = (job) => {
    if ((job.runType || 'publish') !== 'draft') return;
    setHistoryListTarget(job);
  };

  const confirmHistoryListToEbay = async () => {
    const target = historyListTarget;
    if (!target?.sellerId || !target?.templateId) {
      setError('This batch is missing store or template and cannot be listed.');
      setHistoryListTarget(null);
      return;
    }

    setHistoryListing(true);
    setError('');
    setSuccess('');
    setBulkBatchProgress(null);

    try {
      const detail = await fetchHistoryBatchDetail(target._id);
      const asins = [...new Set(
        (detail?.asins || detail?.results?.map((row) => row.asin) || [])
          .map((value) => String(value || '').trim().toUpperCase())
          .filter(Boolean)
      )];

      if (!asins.length) {
        setError('No ASINs found in this draft batch.');
        return;
      }

      setHistoryListTarget(null);
      let merged = await runBulkListBatches({
        asins,
        phase: 'list',
        templateId: target.templateId,
        sellerId: target.sellerId,
        region: detail?.region && detail.region !== '—' ? detail.region : region,
      });

      const failedAsins = merged.results
        .filter((row) => row.status === 'error')
        .map((row) => row.asin);

      if (failedAsins.length > 0) {
        const retryMerged = await runBulkListBatches({
          asins: failedAsins,
          phase: 'retry',
          templateId: target.templateId,
          sellerId: target.sellerId,
          region: detail?.region && detail.region !== '—' ? detail.region : region,
        });
        merged = mergeListResultsWithRetry(merged, retryMerged);
      }

      setBulkResult(merged);
      setSuccess(merged.message || `Listed ${merged.successful || 0}/${merged.total || asins.length} from draft batch.`);
      void loadBatchHistory();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to list draft batch on eBay');
    } finally {
      setHistoryListing(false);
      setBulkBatchProgress(null);
    }
  };

  const toggleBatchExpand = async (jobId) => {
    if (expandedBatchId === jobId) {
      setExpandedBatchId('');
      setExpandedBatchDetail(null);
      return;
    }
    setExpandedBatchId(jobId);
    setExpandedBatchDetail(null);
    setExpandedBatchLoading(true);
    try {
      const batch = await fetchHistoryBatchDetail(jobId);
      setExpandedBatchDetail(batch);
    } catch {
      setExpandedBatchDetail(null);
    } finally {
      setExpandedBatchLoading(false);
    }
  };

  useEffect(() => {
    const prefs = readDirectListPrefs();
    if (prefs.region) setRegion(prefs.region);

    let cancelled = false;
    void (async () => {
      setLoadingInit(true);
      setLoadingTemplates(true);
      try {
        const sellersPromise = fetchSellersAll(api);
        const templatesPromise = fetchListingTemplatesSummary(api);

        const nextSellers = await sellersPromise;
        if (cancelled) return;
        setSellers(nextSellers);
        setSelectedSeller(pickInitialSelection(nextSellers, prefs.sellerId));
        setLoadingInit(false);

        const nextTemplates = await templatesPromise;
        if (cancelled) return;
        setTemplates(nextTemplates);
        setSelectedTemplate(pickInitialSelection(nextTemplates, prefs.templateId));
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load sellers or templates');
        }
      } finally {
        if (!cancelled) {
          setLoadingInit(false);
          setLoadingTemplates(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSeller && !selectedTemplate) return;
    writeDirectListPrefs({
      sellerId: selectedSeller,
      templateId: selectedTemplate,
      region,
    });
  }, [selectedSeller, selectedTemplate, region]);

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
    setBulkResult(null);
    setBulkBatchProgress(null);
    setBulkPreviewCustomColumns([]);
    setPreviewItems(createLoadingPreviewItems(parsedBulkAsins));
    setReviewModalOpen(true);

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

        if (Array.isArray(data.customColumns) && data.customColumns.length > 0) {
          setBulkPreviewCustomColumns(data.customColumns);
        }

        const batchItems = data.previewItems
          || data.results?.map((row) => row.reviewItem).filter(Boolean)
          || [];
        if (batchItems.length > 0) {
          setPreviewItems((prev) => {
            const byAsin = Object.fromEntries(batchItems.map((item) => [item.asin, item]));
            return prev.map((item) => byAsin[item.asin] || item);
          });
        }
      }

      const merged = mergeBulkPreviewResults(batchResponses);
      setPreviewItems(merged.previewItems);
      if (merged.customColumns?.length) {
        setBulkPreviewCustomColumns(merged.customColumns);
      }
      setSuccess(merged.message);
      void loadBatchHistory();
    } catch (err) {
      if (batchResponses.length > 0) {
        const partial = mergeBulkPreviewResults(batchResponses);
        setPreviewItems(partial.previewItems);
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

  const runBulkListBatches = async ({
    asins,
    listingsByAsin = {},
    listingOverrides = {},
    phase = 'list',
    templateId: templateIdOverride,
    sellerId: sellerIdOverride,
    region: regionOverride,
  }) => {
    const batches = chunkAsins(asins);
    const batchResponses = [];
    const listTemplateId = templateIdOverride || selectedTemplate;
    const listSellerId = sellerIdOverride || selectedSeller;
    const listRegion = regionOverride || region;

    for (let i = 0; i < batches.length; i += 1) {
      setBulkBatchProgress({ current: i + 1, total: batches.length, phase });
      const batchAsins = batches[i];
      const batchListingsByAsin = {};
      for (const asin of batchAsins) {
        if (listingsByAsin[asin]) batchListingsByAsin[asin] = listingsByAsin[asin];
      }
      const { data } = await api.post('/template-listings/direct-list-bulk', {
        templateId: listTemplateId,
        sellerId: listSellerId,
        verifyOnly: false,
        region: listRegion,
        asins: batchAsins,
        listingsByAsin: batchListingsByAsin,
        listingOverrides: pickListingOverridesForAsins(listingOverrides, batchAsins),
      });
      batchResponses.push(data);
    }

    return mergeBulkListResults(batchResponses);
  };

  const handleListFromReview = async (listings) => {
    const validListings = (listings || []).filter((listing) => listing?.customLabel && listing?.title);
    if (!validListings.length) return;

    setReviewModalOpen(false);
    setBulkProcessing(true);
    setError('');
    setSuccess('');
    setBulkResult(null);
    setBulkBatchProgress(null);

    const asinsToList = validListings
      .map((listing) => String(listing._asinReference || listing.asin || '').trim().toUpperCase())
      .filter(Boolean);
    const listingsByAsin = buildListingsByAsin(validListings);

    try {
      let merged = await runBulkListBatches({
        asins: asinsToList,
        listingsByAsin,
        phase: 'list',
      });

      const failedAsins = merged.results
        .filter((row) => row.status === 'error')
        .map((row) => row.asin);

      if (failedAsins.length > 0) {
        const retryListingsByAsin = {};
        for (const asin of failedAsins) {
          if (listingsByAsin[asin]) retryListingsByAsin[asin] = listingsByAsin[asin];
        }
        const retryMerged = await runBulkListBatches({
          asins: failedAsins,
          listingsByAsin: retryListingsByAsin,
          phase: 'retry',
        });
        merged = mergeListResultsWithRetry(merged, retryMerged);
      }

      setBulkResult(merged);
      setPreviewItems([]);
      setSuccess(merged.message);
      void loadBatchHistory();
    } catch (err) {
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
      void loadBatchHistory();
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

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Typography variant="h4" gutterBottom>
        Direct List to eBay
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        List SKUs directly on eBay using the Trading API — no CSV or Feed Upload step.
      </Typography>

      {tab !== 2 && (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {loadingInit ? (
              <>
                <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
                <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
                <Skeleton variant="rounded" height={40} width={120} />
              </>
            ) : (
              <>
                <FormControl fullWidth size="small" disabled={!sellers.length}>
                  <InputLabel>Seller</InputLabel>
                  <Select value={selectedSeller} label="Seller" onChange={(e) => setSelectedSeller(e.target.value)}>
                    {sellers.map((seller) => (
                      <MenuItem key={seller._id} value={seller._id}>
                        {seller.storeName || seller.user?.username || seller._id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small" disabled={loadingTemplates || !templates.length}>
                  <InputLabel>Template{loadingTemplates ? ' (loading…)' : ''}</InputLabel>
                  <Select
                    value={selectedTemplate}
                    label={`Template${loadingTemplates ? ' (loading…)' : ''}`}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                  >
                    {templates.map((template) => (
                      <MenuItem key={template._id} value={template._id}>
                        {template.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Amazon region</InputLabel>
                  <Select value={region} label="Amazon region" onChange={(e) => setRegion(e.target.value)}>
                    <MenuItem value="US">US</MenuItem>
                    <MenuItem value="UK">UK</MenuItem>
                    <MenuItem value="AU">AU</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}
          </Stack>
          {ebayMarketplace?.marketplaceLabel && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                color={ebayMarketplace.isMotors ? 'secondary' : 'primary'}
                label={`eBay marketplace: ${ebayMarketplace.marketplaceLabel}`}
              />
              <Typography variant="caption" color="text.secondary">
                From template Action Field — used when listing on eBay
              </Typography>
            </Stack>
          )}
        </Stack>
      </Paper>
      )}

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="Single SKU" />
        <Tab label={`Bulk ASINs${parsedBulkAsins.length ? ` (${parsedBulkAsins.length})` : ''}`} />
        <Tab label={`Batch history${filteredBatchHistory.length ? ` (${filteredBatchHistory.length})` : ''}`} />
      </Tabs>

      <Box hidden={tab !== 0}>
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
            storeListerDefaults={storeListerDefaults}
          />
        </>
      </Box>

      <Box hidden={tab !== 1}>
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Bulk ASINs</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Paste ASINs below. Use <strong>Prepare</strong> to open the review modal (Amazon source vs generated listing), then <strong>List on eBay</strong> from there. Use <strong>Run in background / Schedule</strong> for large jobs (up to {BULK_JOB_MAX_ASINS}) without review.
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

            <Box sx={{ mb: 2 }}>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowListingPace((v) => !v)}
                sx={{ mb: showListingPace ? 1 : 0 }}
              >
                {showListingPace ? 'Hide listing pace options' : 'Listing pace (background / schedule)…'}
              </Button>
              <Collapse in={showListingPace}>
                <Paper variant="outlined" sx={{ p: 2 }}>
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
              </Collapse>
            </Box>

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
                disabled={!previewItems.length || reviewModalOpen || bulkProcessing}
                onClick={() => setReviewModalOpen(true)}
              >
                Review prepared ({previewItems.filter((item) => item.status === 'success').length})
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

          {bulkResult && (
            <BulkListingReviewPanel
              bulkResult={bulkResult}
              bulkProcessing={bulkProcessing}
            />
          )}
        </>
      </Box>

      <Box hidden={tab !== 2}>
        <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            <Box>
              <Typography variant="h6">Batch history</Typography>
              <Typography variant="body2" color="text.secondary">
                Shows saved jobs plus Direct List prepares/publishes grouped by day, store, and template (through today).
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Store</InputLabel>
                <Select
                  label="Store"
                  value={historyStoreFilter}
                  onChange={(e) => {
                    setHistoryStoreFilter(e.target.value);
                    setHistoryTemplateFilter('all');
                  }}
                >
                  <MenuItem value="all">All stores</MenuItem>
                  {historyStoresSorted.map((seller) => (
                    <MenuItem key={seller._id} value={String(seller._id)}>
                      {seller.user?.username || seller.user?.email || 'Unknown'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value)}
                >
                  <MenuItem value="all">All types</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="publish">Publish</MenuItem>
                  <MenuItem value="verify">Verify</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>OK / Failed</InputLabel>
                <Select
                  label="OK / Failed"
                  value={historyResultFilter}
                  onChange={(e) => setHistoryResultFilter(e.target.value)}
                >
                  <MenuItem value="all">All results</MenuItem>
                  <MenuItem value="ok">All OK</MenuItem>
                  <MenuItem value="failed">All failed</MenuItem>
                  <MenuItem value="mixed">Mixed</MenuItem>
                  <MenuItem value="has_failed">Has failures</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Template</InputLabel>
                <Select
                  label="Template"
                  value={historyTemplateFilter}
                  onChange={(e) => setHistoryTemplateFilter(e.target.value)}
                >
                  <MenuItem value="all">All templates</MenuItem>
                  {historyTemplateOptions.map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                size="small"
                startIcon={batchHistoryLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
                onClick={() => void loadBatchHistory()}
                disabled={batchHistoryLoading}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>

          {batchHistoryError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setBatchHistoryError('')}>
              {batchHistoryError}
            </Alert>
          )}

          {batchHistoryLoading && batchHistory.length === 0 ? (
            <Typography color="text.secondary">Loading history…</Typography>
          ) : filteredBatchHistory.length === 0 ? (
            <Alert severity="info">
              No batch history found for the current filters.
              Try All stores / All types, or clear OK/Failed and Template filters.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={40} />
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Store</TableCell>
                    <TableCell>Template</TableCell>
                    <TableCell>ASINs</TableCell>
                    <TableCell>OK / Failed</TableCell>
                    <TableCell>By</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredBatchHistory.map((job) => {
                    const runType = job.runType || 'publish';
                    const isExpanded = expandedBatchId === job._id;
                    return (
                      <React.Fragment key={job._id}>
                        <TableRow hover selected={isExpanded}>
                          <TableCell>
                            <IconButton size="small" onClick={() => void toggleBatchExpand(job._id)}>
                              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              <Chip
                                size="small"
                                label={runType === 'draft' ? 'Draft' : runType === 'verify' ? 'Verify' : 'Publish'}
                                color={runType === 'draft' ? 'default' : runType === 'verify' ? 'secondary' : 'primary'}
                                variant="outlined"
                              />
                              <Chip
                                size="small"
                                label={
                                  job.derived
                                    ? 'From listings'
                                    : (job.execution || 'queued') === 'sync'
                                      ? 'Immediate'
                                      : 'Background'
                                }
                                variant="outlined"
                              />
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={job.status}
                              color={
                                job.status === 'done' ? 'success'
                                  : job.status === 'failed' ? 'error'
                                    : job.status === 'processing' ? 'info'
                                      : 'default'
                              }
                            />
                          </TableCell>
                          <TableCell>{job.sellerName || '—'}</TableCell>
                          <TableCell>{job.templateName || '—'}</TableCell>
                          <TableCell>{job.totalAsins ?? job.asins?.length ?? 0}</TableCell>
                          <TableCell>{job.successfulCount ?? 0} / {job.failedCount ?? 0}</TableCell>
                          <TableCell>{job.createdByName || '—'}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => void openHistoryDetails(job)}
                                disabled={historyDetailsLoading || historyListing}
                              >
                                Details
                              </Button>
                              {runType === 'draft' && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => openHistoryListConfirm(job)}
                                  disabled={historyListing || !job.sellerId || !job.templateId}
                                >
                                  List
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={10} sx={{ py: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 1.5, px: 1 }}>
                                {expandedBatchLoading ? (
                                  <Typography variant="body2" color="text.secondary">Loading batch details…</Typography>
                                ) : !expandedBatchDetail ? (
                                  <Typography variant="body2" color="text.secondary">Could not load batch details.</Typography>
                                ) : (
                                  <Stack spacing={1.5}>
                                    <Typography variant="caption" color="text.secondary">
                                      Region: {expandedBatchDetail.region || '—'}
                                      {' · '}
                                      Scheduled: {expandedBatchDetail.scheduledAt
                                        ? new Date(expandedBatchDetail.scheduledAt).toLocaleString()
                                        : '—'}
                                      {expandedBatchDetail.completedAt
                                        ? ` · Completed: ${new Date(expandedBatchDetail.completedAt).toLocaleString()}`
                                        : ''}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                                      ASINs: {(expandedBatchDetail.asins || []).join(', ') || '—'}
                                    </Typography>
                                    {(expandedBatchDetail.results || []).length > 0 ? (
                                      <TableContainer>
                                        <Table size="small">
                                          <TableHead>
                                            <TableRow>
                                              <TableCell>ASIN</TableCell>
                                              <TableCell>SKU</TableCell>
                                              <TableCell>Result</TableCell>
                                              <TableCell>eBay Item</TableCell>
                                              <TableCell>Error</TableCell>
                                            </TableRow>
                                          </TableHead>
                                          <TableBody>
                                            {expandedBatchDetail.results.map((row, idx) => (
                                              <TableRow key={`${row.asin}-${idx}`}>
                                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.asin}</TableCell>
                                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.sku || '—'}</TableCell>
                                                <TableCell>
                                                  <Chip
                                                    size="small"
                                                    label={row.status}
                                                    color={
                                                      row.status === 'success' || row.status === 'ready'
                                                        ? 'success'
                                                        : 'error'
                                                    }
                                                    variant="outlined"
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  {row.listingUrl ? (
                                                    <Link href={row.listingUrl} target="_blank" rel="noopener noreferrer">
                                                      {row.itemId || 'View'}
                                                    </Link>
                                                  ) : (row.itemId || '—')}
                                                </TableCell>
                                                <TableCell sx={{ maxWidth: 240 }}>
                                                  <Typography variant="caption" color="error" noWrap title={row.error || ''}>
                                                    {row.error || '—'}
                                                  </Typography>
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </TableContainer>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        No per-ASIN results stored yet (job may still be pending).
                                      </Typography>
                                    )}
                                  </Stack>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>

      {bulkBatchProgress && (
        <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {bulkBatchProgress.phase === 'retry'
              ? 'Retrying failed ASINs'
              : bulkBatchProgress.phase === 'list'
                ? 'Listing'
                : 'Preparing'} batch {bulkBatchProgress.current} of {bulkBatchProgress.total}…
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(bulkBatchProgress.current / bulkBatchProgress.total) * 100}
          />
        </Paper>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Dialog
        open={historyDetailsOpen}
        onClose={() => {
          if (historyDetailsLoading) return;
          setHistoryDetailsOpen(false);
          setHistoryDetailsBatch(null);
          setHistoryDetailExpandedKey('');
        }}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>
          Batch details
          {historyDetailsBatch?.templateName ? ` — ${historyDetailsBatch.templateName}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          {historyDetailsLoading ? (
            <Typography color="text.secondary">Loading saved batch data…</Typography>
          ) : !historyDetailsBatch ? (
            <Typography color="text.secondary">Could not load batch details.</Typography>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Store: <strong>{historyDetailsBatch.sellerName || '—'}</strong>
                {' · '}
                Type: <strong>{historyDetailsBatch.runType || '—'}</strong>
                {' · '}
                By: <strong>{historyDetailsBatch.createdByName || '—'}</strong>
                {' · '}
                ASINs: <strong>{historyDetailsBatch.totalAsins ?? historyDetailsBatch.asins?.length ?? 0}</strong>
                {' · '}
                Expand a row for images, description, and item specifics.
              </Typography>
              {(historyDetailsBatch.results || []).length > 0 ? (
                <TableContainer sx={{ maxHeight: 620 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell width={40} />
                        <TableCell width={56}>Img</TableCell>
                        <TableCell>ASIN</TableCell>
                        <TableCell>SKU</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell>Price</TableCell>
                        <TableCell>Qty</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {historyDetailsBatch.results.map((row, idx) => {
                        const rowKey = `${row.asin}-${idx}`;
                        const isOpen = historyDetailExpandedKey === rowKey;
                        const thumb = Array.isArray(row.photoUrls) && row.photoUrls[0]
                          ? row.photoUrls[0]
                          : null;
                        const specEntries = row.specs && typeof row.specs === 'object'
                          ? Object.entries(row.specs).filter(([, value]) => value != null && String(value).trim() !== '')
                          : [];
                        return (
                          <React.Fragment key={rowKey}>
                            <TableRow hover selected={isOpen}>
                              <TableCell>
                                <IconButton
                                  size="small"
                                  onClick={() => setHistoryDetailExpandedKey(isOpen ? '' : rowKey)}
                                >
                                  {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                              </TableCell>
                              <TableCell>
                                {thumb ? (
                                  <Box
                                    component="img"
                                    src={thumb}
                                    alt=""
                                    sx={{
                                      width: 40,
                                      height: 40,
                                      objectFit: 'cover',
                                      borderRadius: 1,
                                      border: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  />
                                ) : (
                                  <Typography variant="caption" color="text.secondary">—</Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.asin}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.sku || '—'}</TableCell>
                              <TableCell sx={{ maxWidth: 280 }}>
                                <Typography variant="body2" noWrap title={row.title || ''}>{row.title || '—'}</Typography>
                              </TableCell>
                              <TableCell>{row.startPrice != null && row.startPrice !== '' ? row.startPrice : '—'}</TableCell>
                              <TableCell>{row.quantity != null && row.quantity !== '' ? row.quantity : '—'}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={row.listingStatus || row.status}
                                  color={row.status === 'success' || row.status === 'ready' ? 'success' : 'default'}
                                  variant="outlined"
                                />
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell colSpan={8} sx={{ py: 0, borderBottom: isOpen ? undefined : 'none' }}>
                                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                                  <Box sx={{ py: 1.5, px: 1, bgcolor: 'grey.50' }}>
                                    <Stack spacing={1.5}>
                                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                                        <Box sx={{ minWidth: 220 }}>
                                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                            Images ({(row.photoUrls || []).length})
                                          </Typography>
                                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                            {(row.photoUrls || []).length === 0 && (
                                              <Typography variant="body2" color="text.secondary">No images saved.</Typography>
                                            )}
                                            {(row.photoUrls || []).map((url) => (
                                              <Box
                                                key={url}
                                                component="a"
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                              >
                                                <Box
                                                  component="img"
                                                  src={url}
                                                  alt=""
                                                  sx={{
                                                    width: 64,
                                                    height: 64,
                                                    objectFit: 'cover',
                                                    borderRadius: 1,
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    display: 'block',
                                                  }}
                                                />
                                              </Box>
                                            ))}
                                          </Stack>
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                          <Typography variant="caption" color="text.secondary" display="block">Category</Typography>
                                          <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-word' }}>
                                            {row.categoryId || row.categoryName
                                              ? `${row.categoryId || ''}${row.categoryName ? ` / ${row.categoryName}` : ''}`
                                              : '—'}
                                          </Typography>
                                          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                            <Typography variant="body2">Amazon: {row.amazonLink ? (
                                              <Link href={row.amazonLink} target="_blank" rel="noopener noreferrer">
                                                {row.amazonPrice != null && row.amazonPrice !== '' ? `$${row.amazonPrice}` : 'Open'}
                                              </Link>
                                            ) : (row.amazonPrice != null && row.amazonPrice !== '' ? row.amazonPrice : '—')}</Typography>
                                            <Typography variant="body2">Condition: {row.conditionId || '—'}</Typography>
                                            <Typography variant="body2">UPC: {row.upc || '—'}</Typography>
                                            <Typography variant="body2">Location: {row.location || '—'}</Typography>
                                            <Typography variant="body2">
                                              eBay: {row.listingUrl ? (
                                                <Link href={row.listingUrl} target="_blank" rel="noopener noreferrer">{row.itemId || 'View'}</Link>
                                              ) : (row.itemId || '—')}
                                            </Typography>
                                          </Stack>
                                          <Typography variant="caption" color="text.secondary" display="block">Policies</Typography>
                                          <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-word' }}>
                                            Ship: {row.shippingProfileName || '—'} · Return: {row.returnProfileName || '—'} · Pay: {row.paymentProfileName || '—'}
                                          </Typography>
                                        </Box>
                                      </Stack>

                                      <Box>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                          Item specifics ({specEntries.length})
                                        </Typography>
                                        {specEntries.length === 0 ? (
                                          <Typography variant="body2" color="text.secondary">No item specifics saved.</Typography>
                                        ) : (
                                          <Box
                                            sx={{
                                              display: 'grid',
                                              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                                              gap: 1,
                                            }}
                                          >
                                            {specEntries.map(([key, value]) => (
                                              <Box
                                                key={key}
                                                sx={{
                                                  p: 1,
                                                  border: '1px solid',
                                                  borderColor: 'divider',
                                                  borderRadius: 1,
                                                  bgcolor: 'background.paper',
                                                }}
                                              >
                                                <Typography variant="caption" color="text.secondary">{key}</Typography>
                                                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                </Typography>
                                              </Box>
                                            ))}
                                          </Box>
                                        )}
                                      </Box>

                                      <Box>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                          Description
                                        </Typography>
                                        {row.description ? (
                                          <Box
                                            sx={{
                                              maxHeight: 220,
                                              overflow: 'auto',
                                              p: 1.5,
                                              border: '1px solid',
                                              borderColor: 'divider',
                                              borderRadius: 1,
                                              bgcolor: 'background.paper',
                                              '& img': { maxWidth: '100%', height: 'auto' },
                                            }}
                                            dangerouslySetInnerHTML={{ __html: row.description }}
                                          />
                                        ) : (
                                          <Typography variant="body2" color="text.secondary">No description saved.</Typography>
                                        )}
                                      </Box>
                                    </Stack>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">No per-ASIN rows saved for this batch.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setHistoryDetailsOpen(false);
            setHistoryDetailsBatch(null);
            setHistoryDetailExpandedKey('');
          }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(historyListTarget)}
        onClose={() => {
          if (historyListing) return;
          setHistoryListTarget(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>List draft batch on eBay?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Publish <strong>{historyListTarget?.totalAsins || 0}</strong> draft ASIN(s) for{' '}
            <strong>{historyListTarget?.sellerName || 'store'}</strong> using{' '}
            <strong>{historyListTarget?.templateName || 'template'}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This lists directly on eBay (not verify-only). Failed items will be retried once.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryListTarget(null)} disabled={historyListing}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void confirmHistoryListToEbay()}
            disabled={historyListing}
          >
            {historyListing ? 'Listing…' : 'List on eBay'}
          </Button>
        </DialogActions>
      </Dialog>

      <AsinReviewModal
        open={reviewModalOpen}
        marketplace={region}
        sellerId={selectedSeller}
        storeTemplateHtml={selectedStoreTemplate?.html || ''}
        pricingConfig={pricingConfig}
        previewItems={previewItems}
        hideSaveButton
        listDirectlyLabel="List on eBay"
        onListDirectly={handleListFromReview}
        onClose={() => {
          if (bulkProcessing) return;
          setReviewModalOpen(false);
          setPreviewItems([]);
        }}
        templateColumns={reviewTemplateColumns}
      />
    </Box>
  );
}
