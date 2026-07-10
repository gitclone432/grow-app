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
  InputAdornment,
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
import GrowMentalityLoader from '../GrowMentalityLoader.jsx';
import {
  MARKETPLACES,
  canEditPromotion,
  getPromotionLifecycleActions,
  getPromotionStatusOptionsForUpdate,
  isLimitedPromotionEdit,
  isMarkdownPromotionType,
  mergePromotionForUpdate,
  parseApiError,
  promotionApiToForm,
  toEbayUtcIso,
} from '../../utils/itemPromotionUtils';

const UPDATE_ITEM_PROMOTION_DOCS =
  'https://developer.ebay.com/api-docs/sell/marketing/resources/item_promotion/methods/updateItemPromotion';

const UPDATE_MARKDOWN_DOCS =
  'https://developer.ebay.com/develop/api/sell/marketing_api#sell-marketing_api-item_price_markdown-updateitempricemarkdownpromotion';

function getPromotionInventoryCriterion(promotion) {
  return promotion?.inventoryCriterion
    || promotion?.selectedInventoryDiscounts?.[0]?.inventoryCriterion
    || {};
}

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
        promotionType: target.promotionType,
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

  const originalStatus = rawPromotion?.promotionStatus || target?.promotionStatus;
  const limitedEdit = isLimitedPromotionEdit(originalStatus);
  const editable = canEditPromotion(originalStatus);
  const statusOptions = getPromotionStatusOptionsForUpdate(originalStatus);
  const isMarkdown = isMarkdownPromotionType(form?.promotionType || target?.promotionType || rawPromotion?.promotionType);
  const updateDocsUrl = isMarkdown ? UPDATE_MARKDOWN_DOCS : UPDATE_ITEM_PROMOTION_DOCS;
  const updateApiName = isMarkdown ? 'updateItemPriceMarkdownPromotion' : 'updateItemPromotion';
  const dialogTitle = isMarkdown ? 'Update markdown sale' : 'Update item promotion';

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

    const originalStatus = rawPromotion.promotionStatus;
    const lifecycle = getPromotionLifecycleActions(originalStatus, form.promotionStatus);
    const limited = isLimitedPromotionEdit(originalStatus);
    const merged = mergePromotionForUpdate(rawPromotion, form);
    const endDateChanged = merged.endDate !== String(rawPromotion.endDate || '');
    const rawInv = getPromotionInventoryCriterion(rawPromotion);
    const mergedInv = getPromotionInventoryCriterion(merged);
    const inventoryChanged = JSON.stringify(mergedInv) !== JSON.stringify(rawInv);

    setSubmitting(true);
    try {
      const promotionType = form.promotionType || target.promotionType;
      if (limited) {
        const needsUpdate = lifecycle.end || endDateChanged || inventoryChanged;
        if (needsUpdate) {
          await api.put('/ebay/marketing/promotions/update', {
            sellerId: target.sellerId,
            promotionId: target.promotionId,
            marketplaceId: target.marketplaceId,
            promotionType,
            promotion: merged,
          });
        }
        if (lifecycle.pause) {
          await api.post('/ebay/marketing/promotions/pause', {
            sellerId: target.sellerId,
            promotionId: target.promotionId,
            marketplaceId: target.marketplaceId,
          });
        }
        if (lifecycle.resume) {
          await api.post('/ebay/marketing/promotions/resume', {
            sellerId: target.sellerId,
            promotionId: target.promotionId,
            marketplaceId: target.marketplaceId,
          });
        }
      } else {
        const promotion = mergePromotionForUpdate(rawPromotion, form);
        await api.put('/ebay/marketing/promotions/update', {
          sellerId: target.sellerId,
          promotionId: target.promotionId,
          marketplaceId: target.marketplaceId,
          promotionType: form.promotionType || target.promotionType,
          promotion,
        });
      }

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
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Uses eBay <code>{updateApiName}</code> —{' '}
          <Link href={updateDocsUrl} target="_blank" rel="noopener noreferrer">API docs</Link>.
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
            Pause and resume use eBay lifecycle APIs. Ending sets the end date to now. End date and inventory still update via save.
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
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={form.promotionStatus}
                  onChange={(e) => update('promotionStatus', e.target.value)}
                >
                  {statusOptions.map((opt) => (
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
                {isMarkdown ? (
                  <>
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
                        onChange={(e) => update('promotionImageUrl', e.target.value)}
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
                  </>
                ) : (
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
                )}
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
