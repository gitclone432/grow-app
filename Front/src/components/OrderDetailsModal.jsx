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
  Divider,
  IconButton,
  Stack,
  Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../lib/api';

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

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
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

  const DetailRow = ({ label, value, copyable = false }) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="body2" sx={{ fontFamily: copyable ? 'monospace' : 'inherit' }}>
          {value || '-'}
        </Typography>
        {copyable && value && value !== '-' && (
          <IconButton size="small" onClick={() => handleCopy(value)}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Stack>
    </Box>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '400px'
        }
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Order Details</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && order && (
          <Box>
            {/* Order Information */}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Order Information
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
              <DetailRow label="Order ID" value={order.orderId} copyable />
              <DetailRow label="Legacy Order ID" value={order.legacyOrderId} copyable />
              <DetailRow label="Marketplace" value={order.purchaseMarketplaceId} />
              <DetailRow label="Seller" value={order.seller?.user?.username} />
              <DetailRow label="Order Date" value={formatDate(order.creationDate)} />
              <DetailRow label="Last Modified" value={formatDate(order.lastModifiedDate)} />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Buyer Information */}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Buyer Information
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
              <DetailRow label="Buyer Name" value={order.buyer?.username || order.shippingFullName} />
              <DetailRow label="Email" value={order.buyer?.email} />
              <DetailRow label="Phone" value={order.shippingPhone} />
              <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                <DetailRow
                  label="Shipping Address"
                  value={order.buyerAddress || `${order.shippingAddressLine1}${order.shippingAddressLine2 ? ', ' + order.shippingAddressLine2 : ''}, ${order.shippingCity}, ${order.shippingState} ${order.shippingPostalCode}, ${order.shippingCountry}`}
                />
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Item Information */}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Item Information
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
              <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                <DetailRow label="Item Title" value={order.productName || order.lineItems?.[0]?.title} />
              </Box>
              <DetailRow label="Item Number" value={order.itemNumber || order.lineItems?.[0]?.legacyItemId} copyable />
              <DetailRow label="Quantity" value={order.quantity} />
              <DetailRow label="SKU" value={order.lineItems?.[0]?.sku} />
              <DetailRow label="Line Item ID" value={order.lineItems?.[0]?.lineItemId} copyable />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Pricing Information */}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Pricing
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
              <DetailRow label="Subtotal" value={formatCurrency(order.subtotalUSD || order.subtotal, order.purchaseMarketplaceId === 'EBAY_US' ? 'USD' : order.pricingSummary?.priceSubtotal?.currency)} />
              <DetailRow label="Shipping" value={formatCurrency(order.shippingUSD || order.shipping, 'USD')} />
              <DetailRow label="Sales Tax" value={formatCurrency(order.salesTaxUSD || order.salesTax, 'USD')} />
              <DetailRow label="Discount" value={formatCurrency(order.discountUSD || order.discount, 'USD')} />
              <DetailRow 
                label="Total" 
                value={formatCurrency(
                  order.pricingSummary?.total?.value || 
                  (parseFloat(order.subtotalUSD || order.subtotal || 0) + parseFloat(order.shippingUSD || order.shipping || 0) + parseFloat(order.salesTaxUSD || order.salesTax || 0) + parseFloat(order.discountUSD || order.discount || 0)),
                  'USD'
                )} 
              />
              <DetailRow label="Transaction Fees" value={formatCurrency(order.transactionFeesUSD || order.transactionFees, 'USD')} />
              <DetailRow label="Ad Fee" value={formatCurrency(order.adFeeGeneralUSD || order.adFeeGeneral, 'USD')} />
              {order.orderEarnings !== null && order.orderEarnings !== undefined && (
                <DetailRow 
                  label="Order Earnings" 
                  value={
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        color: order.orderEarnings >= 0 ? 'success.main' : 'error.main',
                        fontWeight: 'bold'
                      }}
                    >
                      {formatCurrency(order.orderEarnings, 'USD')}
                    </Typography>
                  } 
                />
              )}
            </Box>

            {/* Refund Information */}
            {order.refunds && order.refunds.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="error">
                  Refund Information
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
                  <DetailRow 
                    label="Total Refunded" 
                    value={formatCurrency(order.refundTotalUSD || order.refunds.reduce((sum, r) => sum + parseFloat(r.amount?.value || 0), 0), 'USD')} 
                  />
                  <DetailRow label="Number of Refunds" value={order.refunds.length} />
                  {order.refunds.map((refund, idx) => (
                    <Box key={idx} sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                      <DetailRow 
                        label={`Refund ${idx + 1}`}
                        value={`${formatCurrency(refund.amount?.value, refund.amount?.currency)} - ${refund.refundStatus || 'Unknown'} - ${formatDate(refund.refundDate)}`}
                      />
                    </Box>
                  ))}
                </Box>
              </>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Order Status */}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Status
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Payment Status
                </Typography>
                <Chip
                  label={order.orderPaymentStatus || 'Unknown'}
                  color={getStatusColor(order.orderPaymentStatus)}
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Fulfillment Status
                </Typography>
                <Chip
                  label={order.orderFulfillmentStatus || 'Unknown'}
                  color={getStatusColor(order.orderFulfillmentStatus)}
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Cancel State
                </Typography>
                <Chip
                  label={order.cancelState || order.cancelStatus?.cancelState || 'NONE_REQUESTED'}
                  color={order.cancelState?.includes('CANCEL') || order.cancelState?.includes('PROGRESS') ? 'error' : 'success'}
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              </Box>
              {order.itemStatus && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Item Status
                  </Typography>
                  <Chip
                    label={order.itemStatus}
                    color={getStatusColor(order.itemStatus)}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              )}
              {order.messagingStatus && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Messaging Status
                  </Typography>
                  <Chip
                    label={order.messagingStatus}
                    color={getStatusColor(order.messagingStatus)}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              )}
              {order.worksheetStatus && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Worksheet Status
                  </Typography>
                  <Chip
                    label={order.worksheetStatus}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              )}
              {order.trackingNumber && (
                <DetailRow label="Tracking Number" value={order.trackingNumber} copyable />
              )}
              {order.shipByDate && (
                <DetailRow label="Ship By Date" value={formatDate(order.shipByDate)} />
              )}
              {order.estimatedDelivery && (
                <DetailRow label="Estimated Delivery" value={formatDate(order.estimatedDelivery)} />
              )}
            </Box>

            {/* Amazon/Fulfillment Info */}
            {(order.amazonAccount || order.amazonOrderId || order.fulfillmentNotes) && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Fulfillment Information
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
                  {order.amazonAccount && (
                    <DetailRow label="Amazon Account" value={order.amazonAccount} />
                  )}
                  {order.amazonOrderId && (
                    <DetailRow label="Amazon Order ID" value={order.amazonOrderId} copyable />
                  )}
                  {order.beforeTaxUSD !== null && order.beforeTaxUSD !== undefined && (
                    <DetailRow label="Amazon Before Tax" value={formatCurrency(order.beforeTaxUSD, 'USD')} />
                  )}
                  {order.estimatedTaxUSD !== null && order.estimatedTaxUSD !== undefined && (
                    <DetailRow label="Amazon Estimated Tax" value={formatCurrency(order.estimatedTaxUSD, 'USD')} />
                  )}
                  {order.fulfillmentNotes && (
                    <Box sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Fulfillment Notes
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1, p: 2, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
                        {order.fulfillmentNotes}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </>
            )}

            {/* Buyer Notes */}
            {order.buyerCheckoutNotes && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Buyer Notes
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  {order.buyerCheckoutNotes}
                </Typography>
              </>
            )}

            {/* Internal Notes */}
            {order.notes && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Internal Notes
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, p: 2, bgcolor: 'info.50', borderRadius: 1, border: '1px solid', borderColor: 'info.200' }}>
                  {order.notes}
                </Typography>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
