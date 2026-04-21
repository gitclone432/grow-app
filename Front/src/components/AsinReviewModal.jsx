import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  LinearProgress,
  Chip,
  TextField,
  Grid,
  Paper,
  Divider,
  Alert,
  Stack,
  Skeleton,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip
} from '@mui/material';
import { DESCRIPTION_FOOTER_TEMPLATES, FOOTER_SENTINEL_START, FOOTER_SENTINEL_END } from '../constants/descriptionFooterTemplates';
import {
  Close as CloseIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as LoadingIcon,
  Delete as DeleteIcon,
  Code as CodeIcon,
  Visibility as VisibilityIcon,
  Update as UpdateIcon,
  Autorenew as AutorenewIcon
} from '@mui/icons-material';
import api from '../lib/api.js';

const MARKETPLACE_DOMAINS = {
  US: 'www.amazon.com',
  UK: 'www.amazon.co.uk',
  CA: 'www.amazon.ca',
  AU: 'www.amazon.com.au',
};

/**
 * Calculates "Actual Profit" (INR) for a US marketplace listing.
 * @param {number} buyingPrice - Amazon price in USD
 * @param {number} sold - eBay Start Price in USD
 * @returns {object} All intermediate values + actualProfit, all rounded to 2dp
 */
function calcActualProfit(buyingPrice, sold) {
  const A            = parseFloat((sold * 1.1).toFixed(2));
  const eBay         = parseFloat((A * 0.1395 + 0.4).toFixed(2));
  const ADS          = parseFloat((A * 0.15).toFixed(2));
  const TDS          = parseFloat((A * 0.01).toFixed(2));
  const TCont        = 0.24;
  const Net          = parseFloat((sold - eBay - ADS - TDS - TCont).toFixed(2));
  const AmazonWithTax = parseFloat((buyingPrice * 1.1).toFixed(2));
  const Payoneer     = parseFloat((Net * 90).toFixed(2));
  const AmazonExpense = parseFloat((AmazonWithTax * 95).toFixed(2));
  const actualProfit = parseFloat((Payoneer - AmazonExpense).toFixed(2));
  return { A, eBay, ADS, TDS, TCont, Net, AmazonWithTax, Payoneer, AmazonExpense, actualProfit };
}

export default function AsinReviewModal({ 
  open, 
  onClose, 
  previewItems = [], 
  onSave,
  onListDirectly = null,
  templateColumns = [],
  marketplace = 'US'
}) {
  const amazonDomain = MARKETPLACE_DOMAINS[marketplace] || MARKETPLACE_DOMAINS.US;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedItems, setEditedItems] = useState({});
  const [dismissedItems, setDismissedItems] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [descriptionViewMode, setDescriptionViewMode] = useState('preview'); // 'code' | 'preview'
  const [amazonWindowRef, setAmazonWindowRef] = useState(null);
  const [showAmazonPreview, setShowAmazonPreview] = useState(false);
  const [appliedDescTemplates, setAppliedDescTemplates] = useState({}); // { [itemId]: templateKey | '' }
  const [rephrasing, setRephrasing] = useState({}); // { [itemId]: true|false }
  const [startPriceEditMode, setStartPriceEditMode] = useState({}); // { [itemId]: true|false }

  // Filter out dismissed items
  const activeItems = previewItems.filter(item => !dismissedItems.has(item.id));
  const currentItem = activeItems[currentIndex];
  const itemData = editedItems[currentItem?.id] || currentItem?.generatedListing || {};
  const isStartPriceEditing = !!(currentItem?.id && startPriceEditMode[currentItem.id]);
  const startPriceValue = itemData.startPrice ?? '';
  const actualProfitBuyingPrice = parseFloat(currentItem?.sourceData?.price);
  const actualProfitSoldPrice = parseFloat(startPriceValue);
  const showActualProfit = marketplace === 'US'
    && !isNaN(actualProfitBuyingPrice) && actualProfitBuyingPrice > 0
    && !isNaN(actualProfitSoldPrice) && actualProfitSoldPrice > 0;
  const actualProfit = showActualProfit ? calcActualProfit(actualProfitBuyingPrice, actualProfitSoldPrice) : null;
  const actualProfitColor = actualProfit && actualProfit.actualProfit < 300 ? 'error' : 'success';

  // Initialize edited items from preview data
  useEffect(() => {
    if (previewItems.length > 0) {
      const initial = {};
      previewItems.forEach(item => {
        if (item.generatedListing) {
          initial[item.id] = { ...item.generatedListing };
        }
      });
      setEditedItems(initial);
      setStartPriceEditMode({});
    }
  }, [previewItems]);

  // Sync Amazon preview window when navigating
  useEffect(() => {
    if (showAmazonPreview && amazonWindowRef && !amazonWindowRef.closed && currentItem?.asin) {
      const asin = currentItem.asin;
      const amazonUrl = `https://${amazonDomain}/dp/${asin}`;
      try {
        amazonWindowRef.location.href = amazonUrl;
      } catch (error) {
        // Window might be closed or blocked
        console.warn('Could not update Amazon preview window:', error);
        setShowAmazonPreview(false);
        setAmazonWindowRef(null);
      }
    }
  }, [currentIndex, currentItem?.asin, showAmazonPreview, amazonWindowRef]);

  // Check if Amazon preview window was closed manually
  useEffect(() => {
    if (!showAmazonPreview || !amazonWindowRef) return;
    
    const checkWindowClosed = setInterval(() => {
      if (amazonWindowRef.closed) {
        setShowAmazonPreview(false);
        setAmazonWindowRef(null);
      }
    }, 500);
    
    return () => clearInterval(checkWindowClosed);
  }, [showAmazonPreview, amazonWindowRef]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, activeItems.length, hasUnsavedChanges]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < activeItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleDismiss = () => {
    if (!currentItem) return;
    
    // Add to dismissed set
    setDismissedItems(prev => new Set([...prev, currentItem.id]));
    
    // Navigate to next item, or previous if we're at the end
    if (currentIndex >= activeItems.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    // If this was the last item, currentIndex stays the same but will show next remaining item
  };

  const handleFieldChange = (field, value, isCustomField = false) => {
    const updatedItem = { ...itemData };
    
    if (isCustomField) {
      updatedItem.customFields = { ...updatedItem.customFields, [field]: value };
    } else {
      updatedItem[field] = value;
    }
    
    setEditedItems(prev => ({
      ...prev,
      [currentItem.id]: updatedItem
    }));
    
    setHasUnsavedChanges(true);
  };

  const handleStartPriceEdit = () => {
    if (!currentItem) return;
    setStartPriceEditMode(prev => ({
      ...prev,
      [currentItem.id]: true
    }));
  };

  const handleStartPriceSave = () => {
    if (!currentItem) return;
    setStartPriceEditMode(prev => ({
      ...prev,
      [currentItem.id]: false
    }));
  };

  const applyDescTemplate = (itemId, templateKey) => {
    const currentDesc = (editedItems[itemId] || currentItem?.generatedListing || {}).description || '';
    // Strip any existing footer using sentinel comments
    const baseDesc = currentDesc.includes(FOOTER_SENTINEL_START)
      ? currentDesc.slice(0, currentDesc.indexOf(FOOTER_SENTINEL_START)).trimEnd()
      : currentDesc;

    let newDesc;
    if (!templateKey) {
      newDesc = baseDesc;
    } else {
      const template = DESCRIPTION_FOOTER_TEMPLATES.find(t => t.key === templateKey);
      newDesc = baseDesc + '\n' + FOOTER_SENTINEL_START + '\n' + template.html + '\n' + FOOTER_SENTINEL_END;
    }

    setEditedItems(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || currentItem?.generatedListing || {}), description: newDesc }
    }));
    setAppliedDescTemplates(prev => ({ ...prev, [itemId]: templateKey }));
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Convert edited items to array format (exclude errors, loading, blocked, and dismissed items)
      const listingsToSave = activeItems
        .filter(item => !['error', 'loading', 'blocked'].includes(item.status))
        .map(item => {
          const listingData = editedItems[item.id] || item.generatedListing;
          
          // Mark duplicates for update
          if (item.status === 'duplicate_updateable') {
            return {
              ...listingData,
              _isDuplicateUpdate: true,
              _existingListingId: item.generatedListing?._existingListingId || listingData._existingListingId
            };
          }
          
          return listingData;
        });
      
      await onSave(listingsToSave);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRephrase = async () => {
    if (!currentItem || !itemData.title) return;
    setRephrasing(prev => ({ ...prev, [currentItem.id]: true }));
    try {
      const { data } = await api.post('/ai/rephrase-title', {
        currentTitle: itemData.title,
        sourceTitle: currentItem.sourceData?.title || '',
        brand: currentItem.sourceData?.brand || '',
        color: currentItem.sourceData?.color || '',
        compatibility: currentItem.sourceData?.compatibility || ''
      });
      handleFieldChange('title', data.rephrasedTitle, false);
    } catch (error) {
      console.error('[Rephrase Title] Error:', error);
    } finally {
      setRephrasing(prev => ({ ...prev, [currentItem.id]: false }));
    }
  };

  const openAmazonPreview = () => {
    if (!currentItem?.asin) return;
    
    const asin = currentItem.asin;
    const amazonUrl = `https://${amazonDomain}/dp/${asin}`;
    
    const halfWidth = Math.floor(window.screen.width / 2);
    const screenHeight = window.screen.height;

    // Move the main browser window to the right half
    try {
      window.moveTo(halfWidth, 0);
      window.resizeTo(halfWidth, screenHeight);
    } catch (e) {
      // Silently ignore — not permitted for regular browser tabs
    }
    
    // Open Amazon popup on the left half
    const windowRef = window.open(
      amazonUrl,
      'AmazonPreview',
      `width=${halfWidth},height=${screenHeight},left=0,top=0,resizable=yes,scrollbars=yes,location=yes`
    );
    
    if (windowRef) {
      setAmazonWindowRef(windowRef);
      setShowAmazonPreview(true);
    } else {
      alert('Please allow popups to view Amazon preview side-by-side');
    }
  };

  const closeAmazonPreview = () => {
    if (amazonWindowRef && !amazonWindowRef.closed) {
      amazonWindowRef.close();
    }
    setAmazonWindowRef(null);
    setShowAmazonPreview(false);

    // Restore main window to full screen
    try {
      window.moveTo(0, 0);
      window.resizeTo(window.screen.width, window.screen.height);
    } catch (e) {
      // Silently ignore
    }
  };

  const toggleAmazonPreview = () => {
    if (showAmazonPreview) {
      closeAmazonPreview();
    } else {
      openAmazonPreview();
    }
  };

  const handleClose = () => {
    // Close Amazon preview window if open
    closeAmazonPreview();
    
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    setStartPriceEditMode({});
    onClose();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'loading':
        return <CircularProgress size={20} />;
      case 'ready':
      case 'success':
        return <CheckIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'duplicate_updateable':
        return <UpdateIcon color="warning" />;
      case 'blocked':
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'loading':
        return 'info';
      case 'ready':
      case 'success':
        return 'success';
      case 'warning':
      case 'duplicate_updateable':
        return 'warning';
      case 'blocked':
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  if (!currentItem) {
    return null;
  }


  const actualProfitTooltipContent = actualProfit ? (
    <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: 1.8, p: 0.5 }}>
      <Box>Bought (Amazon):&nbsp; ${actualProfitBuyingPrice.toFixed(2)}</Box>
      <Box>Sold (Start):&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfitSoldPrice.toFixed(2)}</Box>
      <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
      <Box>A (eBay+Tax):&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfit.A.toFixed(2)}&nbsp; (Sold × 1.1)</Box>
      <Box>eBay Fee:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfit.eBay.toFixed(2)}&nbsp; (A × 13.95% + $0.40)</Box>
      <Box>ADS:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfit.ADS.toFixed(2)}&nbsp; (A × 15%)</Box>
      <Box>TDS:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfit.TDS.toFixed(2)}&nbsp; (A × 1%)</Box>
      <Box>T.Cont:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfit.TCont.toFixed(2)}</Box>
      <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
      <Box>Net (USD):&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${actualProfit.Net.toFixed(2)}&nbsp; (Sold − eBay − ADS − TDS − T.Cont)</Box>
      <Box>Amazon + Tax:&nbsp;&nbsp; ${actualProfit.AmazonWithTax.toFixed(2)}&nbsp; (Bought + 10% of Bought)</Box>
      <Box>Payoneer (INR):&nbsp;&nbsp; ₹{actualProfit.Payoneer.toFixed(2)}&nbsp; (Net × 90)</Box>
      <Box>Amazon Spend:&nbsp;&nbsp;&nbsp;&nbsp; ₹{actualProfit.AmazonExpense.toFixed(2)}&nbsp; ((Amazon + Tax) × 95)</Box>
      <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
      <Box sx={{ fontWeight: 700, color: actualProfit.actualProfit < 300 ? '#e57373' : '#81c784' }}>
        Actual Profit:&nbsp;&nbsp;&nbsp;&nbsp; ₹{actualProfit.actualProfit.toFixed(2)}
      </Box>
    </Box>
  ) : '';
  // Separate core fields and custom fields from template columns
  const coreFieldColumns = templateColumns.filter(col => col.type === 'core');
  const customFieldColumns = templateColumns.filter(col => col.type === 'custom');

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth={false}
      fullScreen={!showAmazonPreview}
      PaperProps={{
        sx: showAmazonPreview
          ? {
              position: 'fixed',
              right: 0,
              top: 0,
              width: '50vw',
              height: '100vh',
              maxHeight: '100vh',
              m: 0,
              borderRadius: 0,
              bgcolor: '#f5f5f5'
            }
          : {
              bgcolor: '#f5f5f5',
              height: '100vh'
            }
      }}
    >
      <DialogContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ 
          bgcolor: 'white', 
          p: showAmazonPreview ? 1 : 2, 
          borderBottom: 1, 
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: showAmazonPreview ? 'wrap' : 'nowrap',
          gap: showAmazonPreview ? 0.5 : 0
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: showAmazonPreview ? 0.5 : 2, flexWrap: 'wrap' }}>
            {!showAmazonPreview && (
              <Typography variant="h6">
                Review Generated Listings
              </Typography>
            )}
            <Chip 
              label={`${currentIndex + 1} / ${activeItems.length}`}
              color="primary"
              size="small"
            />
            {dismissedItems.size > 0 && (
              <Chip 
                label={`${dismissedItems.size} dismissed`}
                color="default"
                size="small"
                variant="outlined"
              />
            )}
            <Chip
              icon={getStatusIcon(currentItem?.status)}
              label={currentItem?.status || 'N/A'}
              color={getStatusColor(currentItem?.status)}
              size="small"
            />
          </Box>
          
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant={showAmazonPreview ? "contained" : "outlined"}
              onClick={toggleAmazonPreview}
              size="small"
              sx={{ whiteSpace: 'nowrap', fontSize: showAmazonPreview ? '0.7rem' : undefined }}
            >
              {showAmazonPreview ? '✓ Split' : 'Split View Amazon'}
            </Button>

            {showAmazonPreview && (
              <Button
                variant="outlined"
                size="small"
                sx={{ whiteSpace: 'nowrap', fontSize: '0.7rem' }}
                onClick={() => {
                  if (amazonWindowRef && !amazonWindowRef.closed) {
                    amazonWindowRef.focus();
                  }
                }}
              >
                ↗ Amazon
              </Button>
            )}
            
            {showAmazonPreview ? (
              <IconButton
                color="error"
                size="small"
                onClick={handleDismiss}
                disabled={!currentItem || activeItems.length === 0}
                title="Dismiss"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            ) : (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDismiss}
                disabled={!currentItem || activeItems.length === 0}
                size="small"
              >
                Dismiss
              </Button>
            )}
            {onListDirectly && (
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={() => {
                  const listingsToSave = activeItems
                    .filter(item => !['error', 'loading', 'blocked'].includes(item.status))
                    .map(item => {
                      const listingData = editedItems[item.id] || item.generatedListing;
                      if (item.status === 'duplicate_updateable') {
                        return {
                          ...listingData,
                          _isDuplicateUpdate: true,
                          _existingListingId: item.generatedListing?._existingListingId || listingData._existingListingId
                        };
                      }
                      return listingData;
                    });
                  onListDirectly(listingsToSave);
                }}
                disabled={saving || activeItems.every(i => ['error', 'loading', 'blocked'].includes(i.status))}
                sx={{ fontSize: showAmazonPreview ? '0.7rem' : undefined, whiteSpace: 'nowrap' }}
              >
                List Directly
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={showAmazonPreview ? null : <SaveIcon />}
              onClick={handleSaveAll}
              size="small"
              disabled={saving || activeItems.every(i => ['error', 'loading', 'blocked'].includes(i.status))}
              sx={{ fontSize: showAmazonPreview ? '0.7rem' : undefined, whiteSpace: 'nowrap' }}
            >
              {saving ? 'Saving...' : `Save All (${activeItems.filter(i => !['error', 'loading', 'blocked'].includes(i.status)).length})`}
            </Button>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon fontSize={showAmazonPreview ? 'small' : 'medium'} />
            </IconButton>
          </Box>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ bgcolor: 'white', px: showAmazonPreview ? 1 : 2, pb: 1 }}>
          <LinearProgress 
            variant="determinate" 
            value={activeItems.length > 0 ? ((currentIndex + 1) / activeItems.length) * 100 : 0}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        {/* Duplicate Notification */}
        {currentItem?.status === 'duplicate_updateable' && (
          <Box sx={{ px: showAmazonPreview ? 1 : 2, pt: showAmazonPreview ? 1 : 2 }}>
            <Alert severity="info" sx={{ mb: 1 }}>
              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight="bold">
                  📝 Editing Existing Listing
                </Typography>
                <Typography variant="caption">
                  You are editing an existing ASIN. Make any changes needed and click Save to update.
                </Typography>
                {currentItem.warnings?.map((warning, idx) => (
                  <Typography key={idx} variant="caption" color="text.secondary">
                    • {warning}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          </Box>
        )}

        {/* Warnings/Errors (exclude duplicate_updateable warnings since shown above) */}
        {(currentItem.warnings?.length > 0 || currentItem.errors?.length > 0) && currentItem?.status !== 'duplicate_updateable' && (
          <Box sx={{ px: showAmazonPreview ? 1 : 2, pt: showAmazonPreview ? 1 : 2 }}>
            {currentItem.errors?.map((error, idx) => (
              <Alert key={idx} severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            ))}
            {currentItem.warnings?.map((warning, idx) => (
              <Alert key={idx} severity="warning" sx={{ mb: 1 }}>
                {warning}
              </Alert>
            ))}
          </Box>
        )}

        {/* Main Content - Split Panel */}
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          gap: showAmazonPreview ? 0 : 2, 
          p: showAmazonPreview ? 0.5 : 2, 
          overflow: 'hidden'
        }}>
          {/* Left Panel - Amazon Source Data (hidden in split view mode) */}
          <Paper sx={{ 
            width: '40%', 
            p: 2, 
            overflow: 'auto',
            bgcolor: '#fafafa',
            display: showAmazonPreview ? 'none' : undefined
          }}>
            <Typography variant="h6" gutterBottom>
              Amazon Product Data
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {currentItem.status === 'loading' ? (
              // Loading skeleton for source data
              <Stack spacing={2}>
                <Box>
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" width="60%" />
                </Box>
                <Box>
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rectangular" height={40} />
                </Box>
                <Box>
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" width="50%" />
                </Box>
                <Box>
                  <Skeleton variant="text" width="25%" />
                  <Skeleton variant="text" width="40%" />
                </Box>
                <Box>
                  <Skeleton variant="rectangular" height={150} />
                </Box>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Skeleton variant="rectangular" height={120} />
                  </Grid>
                  <Grid item xs={6}>
                    <Skeleton variant="rectangular" height={120} />
                  </Grid>
                </Grid>
              </Stack>
            ) : currentItem.status === 'duplicate_updateable' ? (
              // Show metadata for existing listings
              <Stack spacing={2}>
                <Alert severity="info" variant="outlined">
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Existing Listing
                  </Typography>
                  <Typography variant="caption">
                    This ASIN already exists in your listings. Edit the fields on the right to update it.
                  </Typography>
                </Alert>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    ASIN
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {currentItem.asin}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    SKU
                  </Typography>
                  <Typography variant="body2">
                    {currentItem.sku}
                  </Typography>
                </Box>

                {currentItem.warnings?.map((warning, idx) => (
                  <Box key={idx}>
                    <Typography variant="caption" color="text.secondary">
                      {idx === 0 ? 'Status' : ''}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {warning}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : currentItem.sourceData ? (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    ASIN
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {currentItem.asin}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Original Title
                  </Typography>
                  <Typography variant="body2">
                    {currentItem.sourceData.title}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Brand
                  </Typography>
                  <Typography variant="body2">
                    {currentItem.sourceData.brand}
                  </Typography>
                </Box>

                {currentItem.sourceData?.color && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Color
                    </Typography>
                    <Typography variant="body2">
                      {currentItem.sourceData.color}
                    </Typography>
                  </Box>
                )}

                {currentItem.sourceData?.compatibility && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Compatibility
                    </Typography>
                    <Typography variant="body2">
                      {currentItem.sourceData.compatibility}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Price
                  </Typography>
                  <Typography variant="body2">
                    ${currentItem.sourceData.price}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      fontSize: '0.875rem',
                      lineHeight: 1.6
                    }}
                  >
                    {currentItem.sourceData.description}
                  </Typography>
                </Box>

                {currentItem.sourceData?.images?.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Images ({currentItem.sourceData.images.length})
                    </Typography>
                    <Grid container spacing={1} sx={{ mt: 0.5 }}>
                      {currentItem.sourceData.images.map((img, idx) => (
                        <Grid item xs={6} key={idx}>
                          <Box
                            component="img"
                            src={img}
                            sx={{
                              width: '100%',
                              height: 120,
                              objectFit: 'contain',
                              border: 1,
                              borderColor: 'divider',
                              borderRadius: 1,
                              bgcolor: 'white'
                            }}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </Stack>
            ) : !currentItem.sourceData ? (
              <Stack spacing={2}>
                <Alert severity="info" variant="outlined">
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Existing Listing
                  </Typography>
                  <Typography variant="caption">
                    This is an existing listing from the directory. Edit any fields on the right, then click <strong>Save All</strong> to update or <strong>List Directly</strong> to proceed to listing.
                  </Typography>
                </Alert>
                {currentItem.asin && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">ASIN</Typography>
                    <Typography variant="body2" fontWeight="bold">{currentItem.asin}</Typography>
                  </Box>
                )}
                {currentItem.sku && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">SKU</Typography>
                    <Typography variant="body2">{currentItem.sku}</Typography>
                  </Box>
                )}
              </Stack>
            ) : (
              <Alert severity="error">
                Failed to load Amazon product data
              </Alert>
            )}
          </Paper>

          {/* Right Panel - Generated Listing (Editable) */}
          <Paper sx={{ 
            width: showAmazonPreview ? '100%' : '60%', 
            p: showAmazonPreview ? 1.5 : 2, 
            overflow: 'auto'
          }}>
            <Typography variant="h6" gutterBottom>
              Generated Listing
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {currentItem.status === 'loading' ? (
              // Loading skeleton for generated listing
              <Stack spacing={2}>
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={120} />
                <Skeleton variant="rectangular" height={56} />
                <Skeleton variant="rectangular" height={56} />
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Generating listing for ASIN: {currentItem.asin}
                  </Typography>
                </Box>
              </Stack>
            ) : currentItem.generatedListing ? (
              <Stack spacing={2}>
                {/* SKU */}
                <TextField
                  label="SKU (Custom Label)"
                  value={itemData.customLabel || ''}
                  size="small"
                  fullWidth
                  disabled
                  helperText="Auto-generated from ASIN"
                />

                {/* Core Fields */}
                {coreFieldColumns.map(col => {
                  // Special handling for description field with HTML preview
                  if (col.name === 'description') {
                    return (
                      <Box key={col.name}>
                        {/* Toggle Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight="500">
                            {col.label || 'Description'}
                          </Typography>
                          <ToggleButtonGroup
                            value={descriptionViewMode}
                            exclusive
                            onChange={(e, newMode) => newMode && setDescriptionViewMode(newMode)}
                            size="small"
                          >
                            <ToggleButton value="code">
                              <CodeIcon sx={{ fontSize: 16, mr: 0.5 }} />
                              Code
                            </ToggleButton>
                            <ToggleButton value="preview">
                              <VisibilityIcon sx={{ fontSize: 16, mr: 0.5 }} />
                              Preview
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        {/* Footer Template Dropdown */}
                        <Stack
                          direction="row"
                          alignItems="flex-start"
                          justifyContent="space-between"
                          spacing={1.5}
                          sx={{ mb: 1.5, flexWrap: 'wrap' }}
                          useFlexGap
                        >
                          <FormControl size="small" sx={{ width: 280 }}>
                            <InputLabel>Append Footer Template</InputLabel>
                            <Select
                              value={appliedDescTemplates[currentItem?.id] || ''}
                              label="Append Footer Template"
                              onChange={(e) => applyDescTemplate(currentItem.id, e.target.value)}
                            >
                              <MenuItem value=""><em>— No Footer —</em></MenuItem>
                              {DESCRIPTION_FOOTER_TEMPLATES.map(t => (
                                <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          {showActualProfit && (
                            <Tooltip
                              title={actualProfitTooltipContent}
                              placement="bottom-end"
                              arrow
                              componentsProps={{
                                tooltip: { sx: { maxWidth: 380, bgcolor: '#1a1a2e', color: '#fff' } },
                                arrow: { sx: { color: '#1a1a2e' } }
                              }}
                            >
                              <Chip
                                label={`Actual Profit: ₹${actualProfit.actualProfit.toFixed(2)}`}
                                size="small"
                                variant="outlined"
                                color={actualProfitColor}
                                sx={{ mt: 0.5, cursor: 'default' }}
                              />
                            </Tooltip>
                          )}
                        </Stack>

                        {/* Content Area */}
                        {descriptionViewMode === 'code' ? (
                          <TextField
                            value={itemData.description || ''}
                            onChange={(e) => handleFieldChange('description', e.target.value, false)}
                            multiline
                            rows={8}
                            size="small"
                            fullWidth
                            placeholder="<html>...</html>"
                            helperText={`HTML allowed • ${(itemData.description || '').length} characters`}
                          />
                        ) : (
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2,
                              minHeight: 200,
                              maxHeight: 400,
                              overflow: 'auto',
                              bgcolor: 'white',
                              border: '1px solid',
                              borderColor: 'divider',
                              '& img': { maxWidth: '100%', height: 'auto' },
                              '& table': { width: '100%', borderCollapse: 'collapse' },
                              '& td, & th': { border: '1px solid #ddd', padding: '8px' },
                              '& p': { margin: '0 0 8px 0' },
                              '& ul, & ol': { marginLeft: '20px' }
                            }}
                          >
                            {itemData.description ? (
                              <Box dangerouslySetInnerHTML={{ __html: itemData.description }} />
                            ) : (
                              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                No description generated
                              </Typography>
                            )}
                          </Paper>
                        )}
                      </Box>
                    );
                  }

                  // Title field — with rephrase button
                  if (col.name === 'title') {
                    return (
                      <Stack key="title" direction="row" alignItems="flex-start" spacing={1}>
                        <TextField
                          label={col.label || col.name}
                          value={itemData.title || ''}
                          onChange={(e) => handleFieldChange('title', e.target.value, false)}
                          size="small"
                          fullWidth
                          required
                          helperText={`${(itemData.title || '').length}/80`}
                          sx={{ flex: 1 }}
                        />
                        <Tooltip title="Rephrase title">
                          <span>
                            <IconButton
                              onClick={handleRephrase}
                              disabled={!itemData.title || !!rephrasing[currentItem.id]}
                              size="small"
                              sx={{ mt: 0.5 }}
                            >
                              {rephrasing[currentItem.id]
                                ? <CircularProgress size={18} />
                                : <AutorenewIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    );
                  }

                  // Start Price field — with Actual Profit chip
                  if (col.name === 'startPrice') {
                    return (
                      <Box key="startPrice">
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <TextField
                            label={col.label || col.name}
                            value={startPriceValue}
                            onChange={(e) => handleFieldChange('startPrice', e.target.value, false)}
                            size="small"
                            fullWidth
                            required
                            type="number"
                            disabled={!isStartPriceEditing}
                            sx={{
                              '& input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                              '& input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                              '& input[type=number]': { MozAppearance: 'textfield' },
                            }}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={isStartPriceEditing ? handleStartPriceSave : handleStartPriceEdit}
                            startIcon={isStartPriceEditing ? <SaveIcon fontSize="small" /> : <EditIcon fontSize="small" />}
                            sx={{ minWidth: 86, height: 40, flexShrink: 0 }}
                          >
                            {isStartPriceEditing ? 'Save' : 'Edit'}
                          </Button>
                        </Stack>
                      </Box>
                    );
                  }

                  // Regular fields
                  return (
                    <TextField
                      key={col.name}
                      label={col.label || col.name}
                      value={itemData[col.name] || ''}
                      onChange={(e) => handleFieldChange(col.name, e.target.value, false)}
                      size="small"
                      fullWidth
                      required={col.name === 'startPrice'}
                      type={col.name === 'startPrice' || col.name === 'quantity' ? 'number' : 'text'}
                      helperText={
                        col.name !== 'startPrice' && col.name !== 'quantity' ? `${(itemData[col.name] || '').length}/60` :
                        ''
                      }
                      {...(col.name === 'startPrice' && {
                        sx: {
                          '& input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
                          '& input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                          '& input[type=number]': { MozAppearance: 'textfield' },
                        },
                      })}
                    />
                  );
                })}

                {/* Custom Fields */}
                {customFieldColumns.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }}>
                      <Chip label="Custom Fields" size="small" />
                    </Divider>

                    {customFieldColumns.map(col => (
                      <TextField
                        key={col.name}
                        label={col.label || col.name}
                        value={itemData.customFields?.[col.name] || ''}
                        onChange={(e) => handleFieldChange(col.name, e.target.value, true)}
                        multiline={col.name.toLowerCase().includes('description')}
                        rows={col.name.toLowerCase().includes('description') ? 4 : 1}
                        size="small"
                        fullWidth
                        helperText={`${(itemData.customFields?.[col.name] || '').length}/60`}
                      />
                    ))}
                  </>
                )}

                {/* Pricing Calculation Info */}
                {currentItem.pricingCalculation?.enabled && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                      Pricing Breakdown
                    </Typography>
                    <Typography variant="caption" display="block">
                      Amazon Cost: {currentItem.pricingCalculation.amazonCost}
                    </Typography>
                    {currentItem.pricingCalculation.breakdown?.profitTier?.enabled ? (
                      <Typography variant="caption" display="block" sx={{ color: 'success.main', fontWeight: 600 }}>
                        Profit (Tier): {currentItem.pricingCalculation.breakdown.profitTier.profit} INR
                        {currentItem.pricingCalculation.breakdown.profitTier.costRange && 
                          ` (${currentItem.pricingCalculation.breakdown.profitTier.costRange})`
                        }
                      </Typography>
                    ) : (
                      <Typography variant="caption" display="block">
                        Profit: {currentItem.pricingCalculation.breakdown?.desiredProfit || currentItem.pricingCalculation.breakdown?.applicableProfit} INR
                      </Typography>
                    )}
                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mt: 0.5 }}>
                      Calculated Start Price: ${currentItem.pricingCalculation.calculatedStartPrice}
                    </Typography>
                  </Alert>
                )}
              </Stack>
            ) : (
              <Alert severity="error">
                Failed to generate listing data
              </Alert>
            )}
          </Paper>
        </Box>

        {/* Footer - Navigation */}
        <Box sx={{ 
          bgcolor: 'white', 
          p: showAmazonPreview ? 1 : 2, 
          borderTop: 1, 
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Button
            startIcon={<PrevIcon />}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            size={showAmazonPreview ? 'small' : 'medium'}
          >
            {showAmazonPreview ? 'Prev' : 'Previous'}
          </Button>
          
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: showAmazonPreview ? '0.7rem' : undefined }}>
            {showAmazonPreview ? '← →' : 'Use arrow keys to navigate'}
          </Typography>
          
          <Button
            endIcon={<NextIcon />}
            onClick={handleNext}
            disabled={currentIndex === activeItems.length - 1}
            size={showAmazonPreview ? 'small' : 'medium'}
          >
            Next
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
