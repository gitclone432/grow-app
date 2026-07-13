import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  IconButton,
  Stack,
  Chip,
  Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../lib/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
};

const formatCurrency = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined) return '-';
  return `${currency} ${parseFloat(amount).toFixed(2)}`;
};

const getOrderTotalForTds = (order = {}) => {
  const stored = parseFloat(order.orderTotal);
  if (Number.isFinite(stored)) return stored;
  const pricingTotal = parseFloat(order.pricingSummary?.total?.value);
  const salesTax = parseFloat(order.salesTaxUSD ?? order.salesTax);
  return (Number.isFinite(pricingTotal) ? pricingTotal : 0) + (Number.isFinite(salesTax) ? salesTax : 0);
};

const getOrderTds = (order = {}) => {
  if (order.tds != null && order.tds !== undefined) return parseFloat(order.tds);
  if (order.orderEarnings == null) return null;
  return Math.round(getOrderTotalForTds(order) * 0.01 * 100) / 100;
};

const getStatusColor = (status) => {
  if (!status) return 'default';
  const s = status.toUpperCase();
  if (s.includes('PAID')) return 'success';
  if (s.includes('PENDING')) return 'warning';
  if (s.includes('REFUND')) return 'error';
  if (s.includes('FULFILLED') || s.includes('SHIPPED')) return 'success';
  if (s.includes('PROGRESS') || s.includes('PROCESSING')) return 'info';
  return 'default';
};

function DetailCell({ label, value, copyable = false, onCopy, fullWidth = false }) {
  const display = value ?? '-';
  const isElement = React.isValidElement(display);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 0.4,
        gridColumn: fullWidth ? '1 / -1' : undefined
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 108, flexShrink: 0, lineHeight: 1.6 }}
      >
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
        {isElement ? display : (
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              fontFamily: copyable ? 'monospace' : 'inherit',
              wordBreak: fullWidth ? 'break-word' : 'normal'
            }}
          >
            {display}
          </Typography>
        )}
        {copyable && !isElement && display && display !== '-' && (
          <IconButton size="small" onClick={() => onCopy(display)} sx={{ p: 0.25 }}>
            <ContentCopyIcon sx={{ fontSize: 13 }} />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}

function Section({ title, children, titleColor }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, height: '100%' }}>
      <Typography
        variant="subtitle2"
        fontWeight={700}
        sx={{ mb: 0.5, color: titleColor || 'text.primary' }}
      >
        {title}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr' }}>
        {children}
      </Box>
    </Paper>
  );
}

export default function OrderDetailsModal({ open, onClose, orderId }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && orderId) {
      fetchOrderDetails();
    }
  }, [open, orderId]);

  const fetchOrderDetails = async () => {
    setLoading(true);
    setError('');
    setOrder(null);
    try {
      const res = await api.get(`/ebay/order/${orderId}`);
      setOrder(res.data);
    } catch (err) {
      console.error('Failed to fetch order details:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text) => {
    if (text && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
  };

  const orderTotal = order
    ? formatCurrency(
        order.pricingSummary?.total?.value
          || (parseFloat(order.subtotalUSD || order.subtotal || 0)
            + parseFloat(order.shippingUSD || order.shipping || 0)
            + parseFloat(order.salesTaxUSD || order.salesTax || 0)
            + parseFloat(order.discountUSD || order.discount || 0)),
        'USD'
      )
    : '-';

  const shippingAddress = order
    ? (order.buyerAddress
      || [
        order.shippingAddressLine1,
        order.shippingAddressLine2,
        order.shippingCity,
        order.shippingState,
        order.shippingPostalCode,
        order.shippingCountry
      ].filter(Boolean).join(', '))
    : '-';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ py: 1.25, px: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={700}>Order Details</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ py: 1.5, px: 2 }}>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress size={28} />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

        {!loading && !error && order && (
          <Stack spacing={1.5}>
            {/* Summary strip */}
            <Stack
              direction="row"
              flexWrap="wrap"
              alignItems="center"
              gap={0.75}
              sx={{ pb: 1, borderBottom: 1, borderColor: 'divider' }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                {order.orderId}
              </Typography>
              <IconButton size="small" onClick={() => handleCopy(order.orderId)} sx={{ p: 0.25 }}>
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
              {order.purchaseMarketplaceId && (
                <Chip
                  label={order.purchaseMarketplaceId.replace('EBAY_', '')}
                  size="small"
                  sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                />
              )}
              {order.orderPaymentStatus && (
                <Chip
                  label={order.orderPaymentStatus}
                  size="small"
                  color={getStatusColor(order.orderPaymentStatus)}
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
              {order.orderFulfillmentStatus && (
                <Chip
                  label={order.orderFulfillmentStatus}
                  size="small"
                  color={getStatusColor(order.orderFulfillmentStatus)}
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
              <Box sx={{ flex: 1 }} />
              <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                {orderTotal}
              </Typography>
            </Stack>

            {/* Order + Buyer side by side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              <Section title="Order">
                <DetailCell label="Legacy ID" value={order.legacyOrderId} copyable onCopy={handleCopy} />
                <DetailCell label="Seller" value={order.seller?.user?.username} />
                <DetailCell label="Order Date" value={formatDate(order.creationDate)} />
                <DetailCell label="Modified" value={formatDate(order.lastModifiedDate)} />
                {order.trackingNumber && (
                  <DetailCell label="Tracking" value={order.trackingNumber} copyable onCopy={handleCopy} />
                )}
                {order.shipByDate && (
                  <DetailCell label="Ship By" value={formatDate(order.shipByDate)} />
                )}
                {order.estimatedDelivery && (
                  <DetailCell label="Est. Delivery" value={formatDate(order.estimatedDelivery)} />
                )}
              </Section>

              <Section title="Buyer">
                <DetailCell
                  label="Name"
                  value={order.buyer?.buyerRegistrationAddress?.fullName || order.shippingFullName || order.buyer?.username}
                />
                <DetailCell label="Username" value={order.buyer?.username} copyable onCopy={handleCopy} />
                <DetailCell label="Email" value={order.buyer?.email} />
                <DetailCell label="Phone" value={order.shippingPhone} />
                <DetailCell label="Address" value={shippingAddress} fullWidth />
              </Section>
            </Box>

            {/* Item */}
            <Section title="Item">
              <DetailCell
                label="Title"
                value={order.productName || order.lineItems?.[0]?.title}
                fullWidth
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}>
                <DetailCell
                  label="Item #"
                  value={order.itemNumber || order.lineItems?.[0]?.legacyItemId}
                  copyable
                  onCopy={handleCopy}
                />
                <DetailCell label="Qty" value={order.quantity ?? order.lineItems?.[0]?.quantity} />
                <DetailCell label="SKU" value={order.lineItems?.[0]?.sku} />
                <DetailCell
                  label="Line Item"
                  value={order.lineItems?.[0]?.lineItemId}
                  copyable
                  onCopy={handleCopy}
                />
              </Box>
            </Section>

            {/* Pricing + Status */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 1.5 }}>
              <Section title="Pricing">
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}>
                  <DetailCell
                    label="Subtotal"
                    value={formatCurrency(order.subtotalUSD || order.subtotal, 'USD')}
                  />
                  <DetailCell label="Shipping" value={formatCurrency(order.shippingUSD || order.shipping, 'USD')} />
                  <DetailCell label="Tax" value={formatCurrency(order.salesTaxUSD || order.salesTax, 'USD')} />
                  <DetailCell label="Discount" value={formatCurrency(order.discountUSD || order.discount, 'USD')} />
                  <DetailCell
                    label="Fees"
                    value={formatCurrency(order.transactionFeesUSD || order.transactionFees, 'USD')}
                  />
                  <DetailCell label="Ad Fee" value={formatCurrency(order.adFeeGeneralUSD || order.adFeeGeneral, 'USD')} />
                  <DetailCell label="TDS Fee" value={formatCurrency(getOrderTds(order), 'USD')} />
                  {order.orderEarnings != null && (
                    <DetailCell
                      label="Earnings"
                      value={
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{
                            fontSize: '0.8125rem',
                            color: order.orderEarnings >= 0 ? 'success.main' : 'error.main',
                            fontWeight: 700
                          }}
                        >
                          {formatCurrency(order.orderEarnings, 'USD')}
                        </Typography>
                      }
                    />
                  )}
                </Box>
              </Section>

              <Section title="Status">
                <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 0.5 }}>
                  {order.cancelState || order.cancelStatus?.cancelState ? (
                    <Chip
                      label={order.cancelState || order.cancelStatus?.cancelState}
                      size="small"
                      color={
                        (order.cancelState || '').includes('CANCEL') || (order.cancelState || '').includes('PROGRESS')
                          ? 'error'
                          : 'success'
                      }
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  ) : null}
                  {order.itemStatus && (
                    <Chip label={order.itemStatus} size="small" color={getStatusColor(order.itemStatus)} sx={{ height: 22, fontSize: '0.7rem' }} />
                  )}
                  {order.messagingStatus && (
                    <Chip label={order.messagingStatus} size="small" color={getStatusColor(order.messagingStatus)} sx={{ height: 22, fontSize: '0.7rem' }} />
                  )}
                  {order.worksheetStatus && (
                    <Chip label={order.worksheetStatus} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />
                  )}
                </Stack>
                {(order.amazonAccount || order.amazonOrderId) && (
                  <>
                    <DetailCell label="Amazon Acct" value={order.amazonAccount} />
                    <DetailCell label="Amazon ID" value={order.amazonOrderId} copyable onCopy={handleCopy} />
                  </>
                )}
              </Section>
            </Box>

            {/* Refunds */}
            {order.refunds?.length > 0 && (
              <Section title="Refunds" titleColor="error.main">
                <DetailCell
                  label="Total"
                  value={formatCurrency(
                    order.refundTotalUSD || order.refunds.reduce((sum, r) => sum + parseFloat(r.amount?.value || 0), 0),
                    'USD'
                  )}
                />
                {order.refunds.map((refund, idx) => (
                  <DetailCell
                    key={idx}
                    label={`#${idx + 1}`}
                    value={`${formatCurrency(refund.amount?.value, refund.amount?.currency)} · ${refund.refundStatus || 'Unknown'} · ${formatDate(refund.refundDate)}`}
                    fullWidth
                  />
                ))}
              </Section>
            )}

            {/* Notes */}
            {(order.fulfillmentNotes || order.buyerCheckoutNotes || order.notes) && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                {order.fulfillmentNotes && (
                  <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'warning.50' }}>
                    <Typography variant="caption" fontWeight={700} color="warning.dark" display="block" sx={{ mb: 0.5 }}>
                      Fulfillment Notes
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{order.fulfillmentNotes}</Typography>
                  </Paper>
                )}
                {order.buyerCheckoutNotes && (
                  <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'grey.50' }}>
                    <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 0.5 }}>
                      Buyer Notes
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{order.buyerCheckoutNotes}</Typography>
                  </Paper>
                )}
                {order.notes && (
                  <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'info.50', gridColumn: { md: order.fulfillmentNotes || order.buyerCheckoutNotes ? '1 / -1' : undefined } }}>
                    <Typography variant="caption" fontWeight={700} color="info.dark" display="block" sx={{ mb: 0.5 }}>
                      Internal Notes
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{order.notes}</Typography>
                  </Paper>
                )}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ py: 1, px: 2 }}>
        <Button onClick={onClose} variant="contained" size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
