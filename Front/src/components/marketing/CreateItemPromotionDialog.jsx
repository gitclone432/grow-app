import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  Link,
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
  buildItemPromotionPayload,
  parseApiError,
  parseListingIds,
} from '../../utils/itemPromotionUtils';

const CREATE_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/createItemPromotion';

const CREATE_TYPES = [
  { value: 'CODED_COUPON', label: 'Coded coupon' },
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
    amountOffOrder: '5',
    couponCode: '',
    couponType: 'PUBLIC_SINGLE_SELLER_COUPON',
    budget: '',
    maxDiscountAmount: '',
    maxCouponRedemptionPerUser: '',
    promotionImageUrl: '',
    applyDiscountToSingleItemOnly: false,
    volumeTiers: [
      { minQuantity: '1', percentageOffOrder: '0' },
      { minQuantity: '2', percentageOffOrder: '5' },
      { minQuantity: '3', percentageOffOrder: '10' },
    ],
  };
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

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(defaultSellerId && defaultSellerId !== '__all__' ? defaultSellerId : ''));
    setError('');
    setSuccess('');
  }, [open, defaultSellerId]);

  const payloadPreview = useMemo(() => {
    try {
      return buildItemPromotionPayload(form);
    } catch {
      return null;
    }
  }, [form]);

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
    if (form.promotionType === 'CODED_COUPON' && !form.couponCode.trim()) {
      setError('Coupon code is required for coded coupons.');
      return;
    }
    if (form.promotionType !== 'VOLUME_DISCOUNT' && !form.promotionImageUrl.trim()) {
      setError('Promotion image URL is required for this promotion type.');
      return;
    }
    if (form.inventoryType === 'INVENTORY_BY_VALUE' && parseListingIds(form.listingIds).length === 0) {
      setError('Enter at least one listing ID, or switch inventory scope to All inventory.');
      return;
    }

    const promotion = buildItemPromotionPayload(form);
    setSubmitting(true);
    try {
      const { data } = await api.post('/ebay/marketing/promotions/create', {
        sellerId: form.sellerId,
        promotion,
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

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Create item promotion</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Uses eBay <code>createItemPromotion</code> —{' '}
          <Link href={CREATE_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>.
          Requires OAuth scope <code>sell.marketing</code> (write).
        </Typography>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {success ? <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert> : null}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required>
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
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Promotion type</InputLabel>
              <Select
                label="Promotion type"
                value={form.promotionType}
                onChange={(e) => update('promotionType', e.target.value)}
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
              onChange={(e) => update('name', e.target.value)}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label="Description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              multiline
              minRows={2}
            />
          </Grid>
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
            />
          </Grid>
          <Grid item xs={12} sm={6}>
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
                label="Listing IDs"
                value={form.listingIds}
                onChange={(e) => update('listingIds', e.target.value)}
                placeholder="Comma-separated eBay listing IDs"
              />
            </Grid>
          ) : null}

          {isVolume ? (
            <>
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
                  <Stack spacing={1}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`Tier ${index + 1} min qty`}
                      value={tier.minQuantity}
                      onChange={(e) => updateTier(index, 'minQuantity', e.target.value)}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label={`Tier ${index + 1} % off`}
                      value={tier.percentageOffOrder}
                      onChange={(e) => updateTier(index, 'percentageOffOrder', e.target.value)}
                    />
                  </Stack>
                </Grid>
              ))}
            </>
          ) : (
            <>
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
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  required={!isVolume}
                  label="Promotion image URL"
                  value={form.promotionImageUrl}
                  onChange={(e) => update('promotionImageUrl', e.target.value)}
                  helperText="JPEG/PNG, min 500×500px (required for coupon & order discounts)"
                />
              </Grid>
            </>
          )}

          {isCodedCoupon ? (
            <>
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
                    onChange={(e) => update('couponType', e.target.value)}
                  >
                    {COUPON_TYPES.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Budget (optional)"
                  value={form.budget}
                  onChange={(e) => update('budget', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Max discount / buyer (optional)"
                  value={form.maxDiscountAmount}
                  onChange={(e) => update('maxDiscountAmount', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Max redemptions / user (optional)"
                  value={form.maxCouponRedemptionPerUser}
                  onChange={(e) => update('maxCouponRedemptionPerUser', e.target.value)}
                />
              </Grid>
            </>
          ) : null}
        </Grid>

        {payloadPreview ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Request preview</Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: 'grey.50',
                borderRadius: 1,
                fontSize: '0.72rem',
                overflow: 'auto',
                maxHeight: 220,
              }}
            >
              {JSON.stringify(payloadPreview, null, 2)}
            </Box>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={submitting || !form.sellerId}>
          {submitting ? 'Creating…' : 'Create promotion'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
