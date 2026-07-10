import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import {
  MARKETPLACES,
  defaultEndLocal,
  defaultStartLocal,
  buildPromotionCreatePayload,
  buildSuggestedPromotionName,
  DEFAULT_PROMOTION_IMAGE_URL,
  extractPromotionImageUrl,
  isPromotionImageRequired,
  MAX_REDEMPTION_PER_BUYER_OPTIONS,
  NO_REDEMPTION_LIMIT_VALUE,
  parseApiError,
  parseListingIds,
  PROMOTION_IMAGE_HELPER,
  resolveSuggestedPromotionImageUrl,
  shouldShowPromotionImageField,
} from '../../utils/itemPromotionUtils';

const CREATE_TYPES = [
  { value: 'CODED_COUPON', label: 'Coded coupon' },
  { value: 'MARKDOWN_SALE', label: 'Markdown sale' },
  { value: 'ORDER_DISCOUNT', label: 'Order discount' },
  { value: 'VOLUME_DISCOUNT', label: 'Volume discount' },
];

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'DRAFT', label: 'Draft' },
];

const COUPON_TYPES = [
  { value: 'PUBLIC_SINGLE_SELLER_COUPON', label: 'Public coupon' },
  { value: 'PRIVATE_SINGLE_SELLER_COUPON', label: 'Private coupon' },
];

function emptyForm(sellerId = '') {
  return {
    sellerId,
    marketplaceId: 'EBAY_US',
    promotionType: 'CODED_COUPON',
    promotionStatus: 'SCHEDULED',
    name: '',
    description: '',
    startDate: defaultStartLocal(),
    endDate: defaultEndLocal(),
    inventoryType: 'INVENTORY_ANY',
    listingIds: '',
    thresholdType: 'minQuantity',
    minQuantity: '1',
    minAmount: '0',
    benefitType: 'percentageOffOrder',
    percentageOffOrder: '10',
    percentageOffItem: '10',
    amountOffOrder: '5',
    amountOffItem: '5',
    couponCode: '',
    couponType: 'PRIVATE_SINGLE_SELLER_COUPON',
    budget: '',
    maxDiscountAmount: '',
    maxCouponRedemptionPerUser: NO_REDEMPTION_LIMIT_VALUE,
    promotionImageUrl: DEFAULT_PROMOTION_IMAGE_URL,
    applyFreeShipping: false,
    autoSelectFutureInventory: true,
    blockPriceIncreaseInItemRevision: true,
    applyDiscountToSingleItemOnly: false,
    volumeTiers: [
      { minQuantity: '1', percentageOffOrder: '0' },
      { minQuantity: '2', percentageOffOrder: '5' },
      { minQuantity: '3', percentageOffOrder: '10' },
    ],
  };
}

function resolveDefaultSellerId(defaultSellerId, sellers) {
  if (defaultSellerId && defaultSellerId !== '__all__') return defaultSellerId;
  if (sellers.length === 1) return sellers[0]._id;
  return '';
}

function getDateRangeError(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  if (end <= start) return 'End date must be after start date.';
  return '';
}

function FormSection({ title, description, children, first = false }) {
  return (
    <Box sx={{ mt: first ? 0 : 2.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: description ? 0.25 : 1 }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {description}
        </Typography>
      ) : null}
      <Grid container spacing={2}>
        {children}
      </Grid>
    </Box>
  );
}

export default function CreateItemPromotionDialog({
  open,
  onClose,
  sellers,
  defaultSellerId,
  onCreated,
}) {
  const [form, setForm] = useState(() => emptyForm(defaultSellerId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [imageTouched, setImageTouched] = useState(false);
  const [suggestedImageUrl, setSuggestedImageUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(resolveDefaultSellerId(defaultSellerId, sellers)));
    setError('');
    setSuccess('');
    setNameTouched(false);
    setDescriptionTouched(false);
    setImageTouched(false);
    setSuggestedImageUrl('');
  }, [open, defaultSellerId, sellers]);

  useEffect(() => {
    if (!open || !form.sellerId) {
      setSuggestedImageUrl('');
      return;
    }

    let cancelled = false;
    void api.get('/ebay/marketing/promotions', {
      params: {
        sellerId: form.sellerId,
        marketplace: form.marketplaceId,
        limit: 50,
        offset: 0,
      },
    })
      .then(({ data }) => {
        if (cancelled) return;
        const promotions = Array.isArray(data?.promotions) ? data.promotions : [];
        setSuggestedImageUrl(resolveSuggestedPromotionImageUrl(promotions));
      })
      .catch(() => {
        if (!cancelled) setSuggestedImageUrl('');
      });

    return () => { cancelled = true; };
  }, [open, form.sellerId, form.marketplaceId]);

  const suggestedName = useMemo(() => buildSuggestedPromotionName(form), [
    form.promotionType,
    form.benefitType,
    form.percentageOffOrder,
    form.percentageOffItem,
    form.amountOffOrder,
    form.amountOffItem,
    form.endDate,
    form.marketplaceId,
    form.volumeTiers,
  ]);

  useEffect(() => {
    if (!open || !suggestedName) return;
    setForm((prev) => {
      let next = prev;
      if (!nameTouched && prev.name !== suggestedName) {
        next = { ...next, name: suggestedName };
      }
      if (!descriptionTouched && prev.description !== suggestedName) {
        next = { ...next, description: suggestedName };
      }
      return next === prev ? prev : next;
    });
  }, [open, nameTouched, descriptionTouched, suggestedName]);

  const showPromotionImage = shouldShowPromotionImageField(form.promotionType, form.couponType);

  useEffect(() => {
    if (!open || imageTouched || !suggestedImageUrl || !showPromotionImage) return;
    setForm((prev) => (
      prev.promotionImageUrl === suggestedImageUrl
        ? prev
        : { ...prev, promotionImageUrl: suggestedImageUrl }
    ));
  }, [open, imageTouched, suggestedImageUrl, showPromotionImage]);

  useEffect(() => {
    setImageTouched(false);
  }, [form.sellerId, form.marketplaceId]);

  const dateRangeError = useMemo(
    () => getDateRangeError(form.startDate, form.endDate),
    [form.startDate, form.endDate],
  );

  const canSubmit = useMemo(() => {
    if (!form.sellerId || !form.name.trim() || !form.startDate || !form.endDate || dateRangeError) {
      return false;
    }
    if (form.promotionType === 'CODED_COUPON' && !form.couponCode.trim()) return false;
    if (isPromotionImageRequired(form.promotionType, form.couponType) && !form.promotionImageUrl.trim()) {
      return false;
    }
    if (form.inventoryType === 'INVENTORY_BY_VALUE' && parseListingIds(form.listingIds).length === 0) {
      return false;
    }
    try {
      buildPromotionCreatePayload(form);
      return true;
    } catch {
      return false;
    }
  }, [form, dateRangeError]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateTier = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      volumeTiers: prev.volumeTiers.map((tier, i) => (i === index ? { ...tier, [key]: value } : tier)),
    }));
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!form.sellerId) {
      setError('Select a store for this promotion.');
      return;
    }
    if (!form.name.trim()) {
      setError('Promotion name is required.');
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError('Start and end dates are required.');
      return;
    }
    if (dateRangeError) {
      setError(dateRangeError);
      return;
    }
    if (form.promotionType === 'CODED_COUPON' && !form.couponCode.trim()) {
      setError('Coupon code is required for coded coupons.');
      return;
    }
    if (isPromotionImageRequired(form.promotionType, form.couponType) && !form.promotionImageUrl.trim()) {
      setError('Promotion image URL is required for markdown sales, public coupons, and order discounts.');
      return;
    }
    if (form.inventoryType === 'INVENTORY_BY_VALUE' && parseListingIds(form.listingIds).length === 0) {
      setError('Enter at least one listing ID, or switch inventory scope to All inventory.');
      return;
    }

    const promotion = buildPromotionCreatePayload(form);
    setSubmitting(true);
    try {
      const { data } = await api.post('/ebay/marketing/promotions/create', {
        sellerId: form.sellerId,
        promotionType: form.promotionType,
        promotion: form.promotionType === 'MARKDOWN_SALE'
          ? promotion
          : { ...promotion, promotionType: form.promotionType },
      });
      const id = data?.promotionId ? ` (ID: ${data.promotionId})` : '';
      setSuccess(`Promotion created successfully${id}.`);
      onCreated?.(data);
    } catch (err) {
      setError(parseApiError(err, 'Failed to create promotion'));
    } finally {
      setSubmitting(false);
    }
  };

  const isCodedCoupon = form.promotionType === 'CODED_COUPON';
  const isVolume = form.promotionType === 'VOLUME_DISCOUNT';
  const isOrderDiscount = form.promotionType === 'ORDER_DISCOUNT';
  const isMarkdown = form.promotionType === 'MARKDOWN_SALE';
  const isPublicCoupon = isCodedCoupon && form.couponType === 'PUBLIC_SINGLE_SELLER_COUPON';

  const handlePromotionTypeChange = (value) => {
    setForm((prev) => {
      const next = { ...prev, promotionType: value };
      if (value === 'MARKDOWN_SALE' && !['percentageOffItem', 'amountOffItem'].includes(prev.benefitType)) {
        next.benefitType = 'percentageOffItem';
      }
      if (value !== 'MARKDOWN_SALE' && ['percentageOffItem', 'amountOffItem'].includes(prev.benefitType)) {
        next.benefitType = 'percentageOffOrder';
      }
      return next;
    });
    setImageTouched(false);
  };

  const handlePromotionImageChange = (value) => {
    setImageTouched(true);
    update('promotionImageUrl', value);
  };

  const promotionImageHelper = imageTouched
    ? PROMOTION_IMAGE_HELPER
    : suggestedImageUrl
      ? 'Auto-filled from this store’s previous promotions'
      : PROMOTION_IMAGE_HELPER;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { maxHeight: '92vh' } }}
    >
      <DialogTitle>Create promotion</DialogTitle>
      <DialogContent dividers sx={{ py: 2 }}>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {success ? <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert> : null}

        <FormSection title="Store & marketplace" first>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required error={!form.sellerId}>
              <InputLabel>Store</InputLabel>
              <Select
                label="Store"
                value={form.sellerId}
                onChange={(e) => update('sellerId', e.target.value)}
              >
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s.user?.email || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Marketplace</InputLabel>
              <Select
                label="Marketplace"
                value={form.marketplaceId}
                onChange={(e) => update('marketplaceId', e.target.value)}
              >
                {MARKETPLACES.map((mp) => (
                  <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </FormSection>

        <FormSection title="Promotion details">
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Promotion type</InputLabel>
              <Select
                label="Promotion type"
                value={form.promotionType}
                onChange={(e) => handlePromotionTypeChange(e.target.value)}
              >
                {CREATE_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={form.promotionStatus}
                onChange={(e) => update('promotionStatus', e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              required
              label="Promotion name"
              value={form.name}
              onChange={(e) => {
                setNameTouched(true);
                update('name', e.target.value);
              }}
              helperText={nameTouched ? 'Custom name' : 'Auto-filled from discount % and end date'}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label="Description"
              value={form.description}
              onChange={(e) => {
                setDescriptionTouched(true);
                update('description', e.target.value);
              }}
              helperText={descriptionTouched ? 'Custom description' : 'Auto-filled to match promotion name'}
              multiline
              minRows={2}
            />
          </Grid>
        </FormSection>

        <FormSection title="Schedule">
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              required
              type="datetime-local"
              label="Start date"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={Boolean(dateRangeError)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              required
              type="datetime-local"
              label="End date"
              value={form.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={Boolean(dateRangeError)}
              helperText={dateRangeError || 'Must be after the start date'}
            />
          </Grid>
        </FormSection>

        <FormSection
          title="Inventory"
          description="Choose whether the promotion applies to all listings or specific IDs."
        >
          <Grid item xs={12} sm={form.inventoryType === 'INVENTORY_BY_VALUE' ? 6 : 12}>
            <FormControl fullWidth size="small">
              <InputLabel>Inventory scope</InputLabel>
              <Select
                label="Inventory scope"
                value={form.inventoryType}
                onChange={(e) => update('inventoryType', e.target.value)}
              >
                <MenuItem value="INVENTORY_ANY">All inventory</MenuItem>
                <MenuItem value="INVENTORY_BY_VALUE">Specific listing IDs</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {form.inventoryType === 'INVENTORY_BY_VALUE' ? (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                required
                label="Listing IDs"
                value={form.listingIds}
                onChange={(e) => update('listingIds', e.target.value)}
                placeholder="Comma-separated eBay listing IDs"
                helperText="At least one valid listing ID is required"
              />
            </Grid>
          ) : null}
        </FormSection>

        {isVolume ? (
          <FormSection
            title="Volume discount tiers"
            description="Set quantity thresholds and the percentage off for each tier."
          >
            <Grid item xs={12}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={form.applyDiscountToSingleItemOnly}
                    onChange={(e) => update('applyDiscountToSingleItemOnly', e.target.checked)}
                  />
                )}
                label="Apply discount to single item only"
              />
            </Grid>
            {form.volumeTiers.map((tier, index) => (
              <Grid item xs={12} sm={4} key={`tier-${index}`}>
                <Stack
                  spacing={1}
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'grey.50',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    Tier {index + 1}
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    label="Min quantity"
                    value={tier.minQuantity}
                    onChange={(e) => updateTier(index, 'minQuantity', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="% off"
                    value={tier.percentageOffOrder}
                    onChange={(e) => updateTier(index, 'percentageOffOrder', e.target.value)}
                  />
                </Stack>
              </Grid>
            ))}
          </FormSection>
        ) : isMarkdown ? (
          <FormSection
            title="Markdown discount"
            description="Reduce the sale price on selected listings. Markdown sales require a promotion image."
          >
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Discount type</InputLabel>
                <Select
                  label="Discount type"
                  value={form.benefitType}
                  onChange={(e) => update('benefitType', e.target.value)}
                >
                  <MenuItem value="percentageOffItem">Percentage off item</MenuItem>
                  <MenuItem value="amountOffItem">Amount off item</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              {form.benefitType === 'amountOffItem' ? (
                <TextField
                  fullWidth
                  size="small"
                  label="Amount off item"
                  value={form.amountOffItem}
                  onChange={(e) => update('amountOffItem', e.target.value)}
                />
              ) : (
                <TextField
                  fullWidth
                  size="small"
                  label="Percentage off item"
                  value={form.percentageOffItem}
                  onChange={(e) => update('percentageOffItem', e.target.value)}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
              )}
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                required
                label="Promotion image URL"
                value={form.promotionImageUrl}
                onChange={(e) => handlePromotionImageChange(e.target.value)}
                helperText={promotionImageHelper}
              />
            </Grid>
            <Grid item xs={12}>
              <Stack spacing={0.5}>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={form.applyFreeShipping}
                      onChange={(e) => update('applyFreeShipping', e.target.checked)}
                    />
                  )}
                  label="Apply free shipping"
                />
                <FormControlLabel
                  control={(
                    <Switch
                      checked={form.autoSelectFutureInventory}
                      onChange={(e) => update('autoSelectFutureInventory', e.target.checked)}
                    />
                  )}
                  label="Auto-select future inventory"
                />
                <FormControlLabel
                  control={(
                    <Switch
                      checked={form.blockPriceIncreaseInItemRevision}
                      onChange={(e) => update('blockPriceIncreaseInItemRevision', e.target.checked)}
                    />
                  )}
                  label="Block price increase in item revision"
                />
              </Stack>
            </Grid>
          </FormSection>
        ) : (
          <FormSection
            title="Discount rules"
            description="Define the purchase threshold and the discount buyers receive."
          >
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Threshold type</InputLabel>
                <Select
                  label="Threshold type"
                  value={form.thresholdType}
                  onChange={(e) => update('thresholdType', e.target.value)}
                >
                  <MenuItem value="minQuantity">Minimum quantity</MenuItem>
                  <MenuItem value="minAmount">Minimum order amount</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              {form.thresholdType === 'minQuantity' ? (
                <TextField
                  fullWidth
                  size="small"
                  label="Minimum quantity"
                  value={form.minQuantity}
                  onChange={(e) => update('minQuantity', e.target.value)}
                />
              ) : (
                <TextField
                  fullWidth
                  size="small"
                  label="Minimum amount"
                  value={form.minAmount}
                  onChange={(e) => update('minAmount', e.target.value)}
                />
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Discount type</InputLabel>
                <Select
                  label="Discount type"
                  value={form.benefitType}
                  onChange={(e) => update('benefitType', e.target.value)}
                >
                  <MenuItem value="percentageOffOrder">Percentage off order</MenuItem>
                  <MenuItem value="amountOffOrder">Amount off order</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              {form.benefitType === 'percentageOffOrder' ? (
                <TextField
                  fullWidth
                  size="small"
                  label="Percentage off"
                  value={form.percentageOffOrder}
                  onChange={(e) => update('percentageOffOrder', e.target.value)}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
              ) : (
                <TextField
                  fullWidth
                  size="small"
                  label="Amount off"
                  value={form.amountOffOrder}
                  onChange={(e) => update('amountOffOrder', e.target.value)}
                />
              )}
            </Grid>
            {isOrderDiscount ? (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  required
                  label="Promotion image URL"
                  value={form.promotionImageUrl}
                  onChange={(e) => handlePromotionImageChange(e.target.value)}
                  helperText={promotionImageHelper}
                />
              </Grid>
            ) : null}
          </FormSection>
        )}

        {isCodedCoupon ? (
          <FormSection
            title="Coupon"
            description="Private coupons are not listed on eBay and do not need a promotion image. Public coupons require an image for the All Offers page."
          >
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                required
                label="Coupon code"
                value={form.couponCode}
                onChange={(e) => update('couponCode', e.target.value)}
                helperText="8–15 alphanumeric characters, max 2 dashes"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Coupon visibility</InputLabel>
                <Select
                  label="Coupon visibility"
                  value={form.couponType}
                  onChange={(e) => {
                    update('couponType', e.target.value);
                    setImageTouched(false);
                  }}
                >
                  {COUPON_TYPES.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {isPublicCoupon ? (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  required
                  label="Promotion image URL"
                  value={form.promotionImageUrl}
                  onChange={(e) => handlePromotionImageChange(e.target.value)}
                  helperText={promotionImageHelper}
                />
              </Grid>
            ) : null}
            <Grid item xs={12}>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5 }}>
                Optional limits
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Budget"
                value={form.budget}
                onChange={(e) => update('budget', e.target.value)}
                helperText="Total promotion budget"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Max discount per buyer"
                value={form.maxDiscountAmount}
                onChange={(e) => update('maxDiscountAmount', e.target.value)}
                helperText="Cap discount amount per buyer"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Max redemptions per buyer</InputLabel>
                <Select
                  label="Max redemptions per buyer"
                  value={form.maxCouponRedemptionPerUser || NO_REDEMPTION_LIMIT_VALUE}
                  onChange={(e) => update('maxCouponRedemptionPerUser', e.target.value)}
                >
                  {MAX_REDEMPTION_PER_BUYER_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </FormSection>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting || !canSubmit}
        >
          {submitting ? 'Creating…' : 'Create promotion'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
