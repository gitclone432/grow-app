import { useEffect, useMemo, useState } from 'react';
import CalculateIcon from '@mui/icons-material/Calculate';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  calculateProfitFromSoldPrice,
  calculateSoldPriceFromTargetProfit,
  ETSY_SOLD_PRICE_DEFAULTS,
  formatInrAmount,
  formatUsdAmount,
  parseInr,
  parseUsd,
} from '../../../utils/etsyProductSoldPrice.js';

function BreakdownRow({ label, value, bold = false }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary" fontWeight={bold ? 700 : 400}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={bold ? 700 : 500}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function EtsySoldPriceCalculatorDialog({
  open,
  onClose,
  product,
  onApplyListedPrice,
  applying = false,
}) {
  const [mode, setMode] = useState('target');
  const [cost, setCost] = useState('');
  const [ship, setShip] = useState('0');
  const [coupon, setCoupon] = useState('0');
  const [targetProfit, setTargetProfit] = useState('');
  const [soldPrice, setSoldPrice] = useState('');
  const [supplierExRate, setSupplierExRate] = useState(String(ETSY_SOLD_PRICE_DEFAULTS.supplierExRate));
  const [etsyGrossExRate, setEtsyGrossExRate] = useState(String(ETSY_SOLD_PRICE_DEFAULTS.etsyGrossExRate));
  const [etsySoldExRate, setEtsySoldExRate] = useState(String(ETSY_SOLD_PRICE_DEFAULTS.etsySoldExRate));
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCost(String(product?.supplierPrice ?? '').replace(/[^\d.-]/g, '') || '');
    setSoldPrice(String(product?.listedPrice ?? '').replace(/[^\d.-]/g, '') || '');
    setShip('0');
    setCoupon('0');
    setTargetProfit('');
    setMode('target');
    setShowAdvanced(false);
  }, [open, product]);

  const config = useMemo(() => ({
    supplierExRate: parseUsd(supplierExRate) || ETSY_SOLD_PRICE_DEFAULTS.supplierExRate,
    etsyGrossExRate: parseUsd(etsyGrossExRate) || ETSY_SOLD_PRICE_DEFAULTS.etsyGrossExRate,
    etsySoldExRate: parseUsd(etsySoldExRate) || ETSY_SOLD_PRICE_DEFAULTS.etsySoldExRate,
  }), [supplierExRate, etsyGrossExRate, etsySoldExRate]);

  const result = useMemo(() => {
    const inputs = {
      cost: parseUsd(cost),
      ship: parseUsd(ship),
      coupon: parseInr(coupon),
      config,
    };

    if (mode === 'target') {
      return calculateSoldPriceFromTargetProfit({
        ...inputs,
        targetProfit: parseInr(targetProfit),
      });
    }

    return calculateProfitFromSoldPrice({
      ...inputs,
      soldPriceUsd: parseUsd(soldPrice),
    });
  }, [mode, cost, ship, coupon, targetProfit, soldPrice, config]);

  const canCalculate = mode === 'target'
    ? parseUsd(cost) > 0 && String(targetProfit).trim() !== ''
    : parseUsd(cost) > 0 && parseUsd(soldPrice) > 0;

  const suggestedListedPrice = result.soldPriceUsd > 0 ? result.soldPriceUsd.toFixed(2) : '';

  const handleApply = () => {
    if (!suggestedListedPrice || !onApplyListedPrice) return;
    onApplyListedPrice(suggestedListedPrice);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CalculateIcon color="primary" />
        Calculate Sold Price
      </DialogTitle>
      <DialogContent dividers>
        {product?.sku && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            SKU: {product.sku}
          </Typography>
        )}

        <Tabs
          value={mode}
          onChange={(_event, next) => setMode(next)}
          sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
        >
          <Tab value="target" label="Target profit → Sold price" />
          <Tab value="sold" label="Sold price → Profit" />
        </Tabs>

        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="Supplier cost (USD)"
              size="small"
              fullWidth
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="11.99"
            />
            <TextField
              label="Ship (USD)"
              size="small"
              fullWidth
              value={ship}
              onChange={(e) => setShip(e.target.value)}
              placeholder="0"
            />
          </Stack>

          {mode === 'target' ? (
            <TextField
              label="Target profit (INR)"
              size="small"
              fullWidth
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              placeholder="200"
            />
          ) : (
            <TextField
              label="Sold price (USD)"
              size="small"
              fullWidth
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              placeholder="24.97"
            />
          )}

          <TextField
            label="Coupon (INR)"
            size="small"
            fullWidth
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            placeholder="0"
          />

          <Button
            size="small"
            variant="text"
            onClick={() => setShowAdvanced((prev) => !prev)}
            sx={{ alignSelf: 'flex-start', px: 0 }}
          >
            {showAdvanced ? 'Hide' : 'Show'} exchange rates
          </Button>

          {showAdvanced && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Supplier FX"
                size="small"
                fullWidth
                value={supplierExRate}
                onChange={(e) => setSupplierExRate(e.target.value)}
              />
              <TextField
                label="Etsy gross FX"
                size="small"
                fullWidth
                value={etsyGrossExRate}
                onChange={(e) => setEtsyGrossExRate(e.target.value)}
              />
              <TextField
                label="Etsy sold FX"
                size="small"
                fullWidth
                value={etsySoldExRate}
                onChange={(e) => setEtsySoldExRate(e.target.value)}
              />
            </Stack>
          )}
        </Stack>

        {!canCalculate && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Enter supplier cost{mode === 'target' ? ' and target profit' : ' and sold price'} to calculate.
          </Alert>
        )}

        {result.error && (
          <Alert severity="error" sx={{ mt: 2 }}>{result.error}</Alert>
        )}

        {canCalculate && result.breakdown && !result.error && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Recommended sold price: {formatUsdAmount(result.soldPriceUsd)}
              </Typography>
              <Typography variant="body2">
                Estimated profit: {formatInrAmount(result.breakdown.profitInr)}
              </Typography>
            </Alert>

            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Supplier cost
            </Typography>
            <Stack spacing={0.75} sx={{ mb: 1.5 }}>
              <BreakdownRow label="Buying price (USD)" value={formatUsdAmount(result.supplier.buyingPrice)} />
              <BreakdownRow label="CC + IGST (USD)" value={formatUsdAmount(result.supplier.totalCc)} />
              <BreakdownRow label="Landed cost (INR)" value={formatInrAmount(result.supplier.inrCost)} bold />
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Etsy fees (INR)
            </Typography>
            <Stack spacing={0.75}>
              <BreakdownRow label="Tax on sale" value={formatInrAmount(result.breakdown.soldTax * config.etsyGrossExRate)} />
              <BreakdownRow label="Etsy fee" value={formatInrAmount(result.breakdown.etsyFee)} />
              <BreakdownRow label="Processing fee" value={formatInrAmount(result.breakdown.processingFee)} />
              <BreakdownRow label="Operating fee" value={formatInrAmount(result.breakdown.operatingFee)} />
              <BreakdownRow label="Relist" value={formatInrAmount(result.breakdown.relistFee)} />
              <BreakdownRow label="TDS + TCS" value={formatInrAmount(result.breakdown.tdsTcs)} />
              <BreakdownRow label="Offsite ads (15%)" value={formatInrAmount(result.breakdown.offsiteAds)} />
              <BreakdownRow label="Tracking ID" value={formatInrAmount(result.breakdown.trackingIdFee)} />
              <BreakdownRow label="Net (INR)" value={formatInrAmount(result.breakdown.netInr)} bold />
              <BreakdownRow label="Profit (INR)" value={formatInrAmount(result.breakdown.profitInr)} bold />
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Close</Button>
        {product && suggestedListedPrice && (
          <Button
            variant="contained"
            onClick={handleApply}
            disabled={applying}
          >
            Apply {formatUsdAmount(suggestedListedPrice)} to Listed
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
