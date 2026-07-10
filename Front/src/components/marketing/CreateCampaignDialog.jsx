import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';
import {
  AD_RATE_STRATEGY_OPTIONS,
  BIDDING_STRATEGY_OPTIONS,
  CAMPAIGN_CHANNEL_OPTIONS,
  FUNDING_OPTIONS,
} from '../../lib/marketingConstants.js';
import {
  buildCampaignCreatePayload,
  emptyCampaignForm,
  getCampaignDateRangeError,
  MARKETPLACES,
  parseCampaignApiError,
  validateCampaignForm,
} from '../../utils/campaignUtils.js';

const TARGETING_CREATE_OPTIONS = [
  { value: 'MANUAL', label: 'Manual targeting' },
  { value: 'SMART', label: 'Smart targeting' },
];

function resolveDefaultSellerId(defaultSellerId, sellers) {
  if (defaultSellerId && defaultSellerId !== '__all__') return defaultSellerId;
  if (sellers.length === 1) return sellers[0]._id;
  return '';
}

function FormSection({ title, description, children, first = false }) {
  return (
    <>
      {!first ? <Divider sx={{ my: 2 }} /> : null}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
      {description ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {description}
        </Typography>
      ) : null}
      <Grid container spacing={2}>
        {children}
      </Grid>
    </>
  );
}

export default function CreateCampaignDialog({
  open,
  onClose,
  sellers = [],
  defaultSellerId = '',
  defaultMarketplace = 'EBAY_US',
  onCreated,
}) {
  const [form, setForm] = useState(() => emptyCampaignForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(emptyCampaignForm(resolveDefaultSellerId(defaultSellerId, sellers)));
    setError('');
    setSuccess('');
  }, [open, defaultSellerId, sellers]);

  useEffect(() => {
    if (!open || !defaultMarketplace || defaultMarketplace === '__all__') return;
    setForm((prev) => ({ ...prev, marketplaceId: defaultMarketplace }));
  }, [open, defaultMarketplace]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const isCps = form.fundingModel === 'COST_PER_SALE';
  const isCpc = form.fundingModel === 'COST_PER_CLICK';
  const isSmart = isCpc && form.campaignTargetingType === 'SMART';
  const isOffsite = isCpc && form.channel === 'OFF_SITE';
  const dateRangeError = getCampaignDateRangeError(form.startDate, form.endDate);

  const handleFundingModelChange = (value) => {
    setForm((prev) => ({
      ...prev,
      fundingModel: value,
      campaignTargetingType: value === 'COST_PER_CLICK' ? prev.campaignTargetingType : 'MANUAL',
      channel: value === 'COST_PER_CLICK' ? prev.channel : 'ON_SITE',
    }));
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    const validationError = validateCampaignForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    const campaign = buildCampaignCreatePayload(form);
    setSubmitting(true);
    try {
      const { data } = await api.post('/ebay/marketing/campaigns/create', {
        sellerId: form.sellerId,
        campaign,
      });
      const id = data?.campaignId ? ` (ID: ${data.campaignId})` : '';
      setSuccess(`Campaign created successfully${id}.`);
      onCreated?.(data);
    } catch (err) {
      setError(parseCampaignApiError(err, 'Failed to create campaign'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { maxHeight: '92vh' } }}
    >
      <DialogTitle>Create campaign</DialogTitle>
      <DialogContent dividers>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {success ? <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert> : null}

        <FormSection
          title="Store & marketplace"
          description="Campaigns are created for one store and one marketplace."
          first
        >
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Store</InputLabel>
              <Select
                label="Store"
                value={form.sellerId}
                onChange={(e) => update('sellerId', e.target.value)}
              >
                {sellers.map((seller) => (
                  <MenuItem key={seller._id} value={seller._id}>
                    {seller.user?.username || seller._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required>
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

        <FormSection
          title="Campaign details"
          description="Name and schedule. End date is optional — omit it for open-ended campaigns."
        >
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              required
              label="Campaign name"
              value={form.campaignName}
              onChange={(e) => update('campaignName', e.target.value)}
              inputProps={{ maxLength: 80 }}
              helperText="Unique per seller. Max 80 characters."
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
              type="datetime-local"
              label="End date"
              value={form.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={Boolean(dateRangeError)}
              helperText={dateRangeError || 'Optional'}
            />
          </Grid>
        </FormSection>

        <FormSection
          title="Funding model"
          description="Cost per sale (general) uses an ad rate %. Cost per click (priority/offsite) uses a daily budget."
        >
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Funding model</InputLabel>
              <Select
                label="Funding model"
                value={form.fundingModel}
                onChange={(e) => handleFundingModelChange(e.target.value)}
              >
                {FUNDING_OPTIONS.filter((opt) => opt.value).map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {isCps ? (
            <>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  required
                  label="Bid percentage (ad rate)"
                  value={form.bidPercentage}
                  onChange={(e) => update('bidPercentage', e.target.value)}
                  helperText="2.0–100.0, one decimal max (e.g. 5.0)"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Ad rate strategy</InputLabel>
                  <Select
                    label="Ad rate strategy"
                    value={form.adRateStrategy}
                    onChange={(e) => update('adRateStrategy', e.target.value)}
                  >
                    {AD_RATE_STRATEGY_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          ) : null}

          {isCpc ? (
            <>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Channel</InputLabel>
                  <Select
                    label="Channel"
                    value={form.channel}
                    onChange={(e) => update('channel', e.target.value)}
                  >
                    {CAMPAIGN_CHANNEL_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  required
                  label="Daily budget"
                  value={form.dailyBudget}
                  onChange={(e) => update('dailyBudget', e.target.value)}
                  helperText={isOffsite ? 'Required for off-site CPC campaigns' : 'Required for CPC campaigns'}
                />
              </Grid>
              {!isOffsite ? (
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Targeting</InputLabel>
                    <Select
                      label="Targeting"
                      value={form.campaignTargetingType}
                      onChange={(e) => update('campaignTargetingType', e.target.value)}
                    >
                      {TARGETING_CREATE_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              ) : null}
              {isSmart && !isOffsite ? (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    required
                    label="Max CPC"
                    value={form.maxCpc}
                    onChange={(e) => update('maxCpc', e.target.value)}
                    helperText="0.02–100.00 — max you will pay per click"
                  />
                </Grid>
              ) : null}
              {!isSmart && !isOffsite ? (
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Bidding strategy</InputLabel>
                    <Select
                      label="Bidding strategy"
                      value={form.biddingStrategy}
                      onChange={(e) => update('biddingStrategy', e.target.value)}
                    >
                      {BIDDING_STRATEGY_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              ) : null}
            </>
          ) : null}
        </FormSection>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting || Boolean(success)}
        >
          {submitting ? 'Creating…' : 'Create campaign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
