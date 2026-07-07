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
  Grid,
  InputLabel,
  Link,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import GrowMentalityLoader from '../GrowMentalityLoader.jsx';
import {
  MARKETPLACES,
  canEditPromotion,
  isLimitedPromotionEdit,
  mergePromotionForUpdate,
  parseApiError,
  promotionApiToForm,
  toEbayUtcIso,
} from '../../utils/itemPromotionUtils';

const UPDATE_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/updateItemPromotion';

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'ENDED', label: 'Ended' },
];

export default function UpdateItemPromotionDialog({
  open,
  onClose,
  target,
  onUpdated,
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rawPromotion, setRawPromotion] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open || !target?.sellerId || !target?.promotionId || !target?.marketplaceId) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setSuccess('');
    setRawPromotion(null);
    setForm(null);

    api.get('/ebay/marketing/promotions/item', {
      params: {
        sellerId: target.sellerId,
        promotionId: target.promotionId,
        marketplaceId: target.marketplaceId,
      },
    })
      .then(({ data }) => {
        if (cancelled) return;
        const promotion = data?.promotion || {};
        setRawPromotion(promotion);
        setForm(promotionApiToForm(promotion, target.sellerId));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(parseApiError(err, 'Failed to load promotion details'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, target]);

  const limitedEdit = isLimitedPromotionEdit(form?.promotionStatus || target?.promotionStatus);
  const editable = canEditPromotion(form?.promotionStatus || target?.promotionStatus);

  const payloadPreview = useMemo(() => {
    if (!rawPromotion || !form) return null;
    try {
      return mergePromotionForUpdate(rawPromotion, form);
    } catch {
      return null;
    }
  }, [rawPromotion, form]);

  const update = (key, value) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = async () => {
    if (!target || !form || !rawPromotion) return;
    setError('');
    setSuccess('');

    if (!form.endDate) {
      setError('End date is required.');
      return;
    }

    const promotion = mergePromotionForUpdate(rawPromotion, form);
    setSubmitting(true);
    try {
      await api.put('/ebay/marketing/promotions/update', {
        sellerId: target.sellerId,
        promotionId: target.promotionId,
        marketplaceId: target.marketplaceId,
        promotion,
      });
      setSuccess('Promotion updated successfully.');
      onUpdated?.();
    } catch (err) {
      setError(parseApiError(err, 'Failed to update promotion'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Update item promotion</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Uses eBay <code>updateItemPromotion</code> —{' '}
          <Link href={UPDATE_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>.
          eBay requires the full promotion body on update.
        </Typography>

        {target ? (
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>{target.promotionName || target.promotionId}</strong>
            {' · '}
            {target.marketplaceId}
            {' · '}
            {form?.promotionStatus || target.promotionStatus || '—'}
          </Typography>
        ) : null}

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {success ? <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert> : null}

        {loading ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <GrowMentalityLoader />
          </Box>
        ) : null}

        {!loading && !editable ? (
          <Alert severity="warning">Ended promotions cannot be updated.</Alert>
        ) : null}

        {!loading && editable && limitedEdit ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Running or paused promotions can only change end date and inventory listings.
          </Alert>
        ) : null}

        {!loading && form && editable ? (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Promotion name"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                disabled={limitedEdit}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" disabled={limitedEdit}>
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
                label="Description"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                multiline
                minRows={2}
                disabled={limitedEdit}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="datetime-local"
                label="Start date"
                value={form.startDate}
                onChange={(e) => update('startDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
                disabled={limitedEdit}
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
                <InputLabel>Marketplace</InputLabel>
                <Select label="Marketplace" value={form.marketplaceId} disabled>
                  {MARKETPLACES.map((mp) => (
                    <MenuItem key={mp} value={mp}>{mp}</MenuItem>
                  ))}
                </Select>
              </FormControl>
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
              <Grid item xs={12}>
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
            {!limitedEdit ? (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Coupon code"
                    value={form.couponCode}
                    onChange={(e) => update('couponCode', e.target.value)}
                    disabled={form.promotionType !== 'CODED_COUPON'}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Promotion image URL"
                    value={form.promotionImageUrl}
                    onChange={(e) => update('promotionImageUrl', e.target.value)}
                  />
                </Grid>
              </>
            ) : null}
          </Grid>
        ) : null}

        {payloadPreview ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Update payload preview</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              End date UTC: {toEbayUtcIso(form?.endDate) || '—'}
            </Typography>
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
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting || loading || !editable || !form}
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
