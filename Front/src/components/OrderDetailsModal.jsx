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
  Paper,
  Tooltip,
  Collapse,
  TextField,
  InputAdornment,
  MenuItem
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChatIcon from '@mui/icons-material/Chat';
import InfoIcon from '@mui/icons-material/Info';
import SendIcon from '@mui/icons-material/Send';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../lib/api';
import {
  findRemarkTemplateText,
  loadRemarkTemplates,
  remarkOptionsFromTemplates
} from '../constants/remarkTemplates';

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

const getShippingAddressFields = (order = {}) => {
  const regAddress = order.buyer?.buyerRegistrationAddress || {};
  return {
    fullName: order.shippingFullName || regAddress.fullName || order.buyer?.username || '',
    line1: order.shippingAddressLine1 || order.buyerAddress || regAddress.contactAddress?.addressLine1 || '',
    line2: order.shippingAddressLine2 || regAddress.contactAddress?.addressLine2 || '',
    city: order.shippingCity || regAddress.contactAddress?.city || '',
    state: order.shippingState || regAddress.contactAddress?.stateOrProvince || '',
    postalCode: order.shippingPostalCode || regAddress.contactAddress?.postalCode || '',
    country: order.shippingCountry || regAddress.contactAddress?.country || '',
    phone: '0000000000'
  };
};

const formatFullShippingAddress = (order, options = {}) => {
  const { includePhone = true } = options;
  const fields = getShippingAddressFields(order);
  const lines = [
    fields.fullName,
    fields.line1,
    fields.line2,
    [
      [fields.city, fields.state].filter(Boolean).join(', '),
      fields.postalCode
    ].filter(Boolean).join(' '),
    fields.country
  ].filter((line) => Boolean(line && String(line).trim()));

  if (includePhone) {
    lines.push(`Phone: ${fields.phone}`);
  }

  return lines.join('\n');
};

const parseCurrencyInput = (value) => {
  if (value === null || value === undefined) return null;
  const normalizedValue = String(value).trim().replace(/[$,\s]/g, '');
  if (!normalizedValue) return null;
  const parsedValue = Number(normalizedValue);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const formatDateInputValue = (value) => {
  if (!value) return '';
  const stringValue = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(stringValue) ? stringValue.slice(0, 10) : '';
};

const replaceTemplateVariables = (template, order) => {
  if (!template || !order) return template;

  const buyerFullName = order.buyer?.buyerRegistrationAddress?.fullName || order.shippingFullName || 'Buyer';
  const buyerFirstName = buyerFullName.split(' ')[0];
  const itemTitle = order.lineItems?.[0]?.title || order.productName || `Item ${order.itemNumber || ''}`.trim() || 'item';
  const trackingNumber = order.trackingNumber || '[tracking number]';
  const shippingCarrier = order.shippingCarrier || 'the shipping carrier';
  const hasBuyerNameToken = /\{\{\s*buyer_(first_)?name\s*\}\}|\{BUYER_NAME\}/i.test(template);

  let personalizedTemplate = template
    .replace(/\{\{buyer_first_name\}\}/g, buyerFirstName)
    .replace(/\{\{buyer_name\}\}/gi, buyerFirstName)
    .replace(/\{BUYER_NAME\}/g, buyerFirstName)
    .replace(/\{\{item_title\}\}/g, itemTitle)
    .replace(/\{\{tracking_number\}\}/g, trackingNumber)
    .replace(/\{\{shipping_carrier\}\}/g, shippingCarrier);

  if (!hasBuyerNameToken) {
    personalizedTemplate = personalizedTemplate.replace(
      /^(\s*["']?\s*)(hi|hello|hey)([!,.:;]?)(\s*)/i,
      (match, leadingPrefix, greeting, punctuation, whitespaceAfterGreeting) => {
        const separator = punctuation || ',';
        const trailingWhitespace = whitespaceAfterGreeting || ' ';
        return `${leadingPrefix}${greeting} ${buyerFirstName}${separator}${trailingWhitespace}`;
      }
    );
  }

  return personalizedTemplate;
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

function ItemThumbnail({ order, itemId }) {
  const sellerId = order?.seller?._id || order?.seller;
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  useEffect(() => {
    let mounted = true;
    setThumbnailUrl('');

    if (!itemId || !sellerId) return () => {
      mounted = false;
    };

    api.get(`/ebay/item-images/${encodeURIComponent(itemId)}`, {
      params: { sellerId, thumbnail: true }
    })
      .then(({ data }) => {
        const firstImage = data?.images?.[0] || '';
        if (mounted) setThumbnailUrl(firstImage);
      })
      .catch(() => {
        if (mounted) setThumbnailUrl('');
      });

    return () => {
      mounted = false;
    };
  }, [itemId, sellerId]);

  if (!thumbnailUrl) return null;

  return (
    <Box
      sx={{
        width: 54,
        height: 54,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'grey.300',
        flexShrink: 0,
        bgcolor: 'grey.50'
      }}
    >
      <img
        src={thumbnailUrl}
        alt={order?.productName || order?.lineItems?.[0]?.title || 'Item'}
        loading="lazy"
        decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </Box>
  );
}

function ShippingAddressSection({ order, onCopy }) {
  const [expanded, setExpanded] = useState(true);
  const fields = getShippingAddressFields(order);
  const rows = [
    { key: 'fullName', value: fields.fullName, label: 'copy name', primary: true },
    { key: 'line1', value: fields.line1, label: 'copy address' },
    { key: 'line2', value: fields.line2 || '-', copyValue: fields.line2, label: 'copy address line 2' },
    { key: 'city', value: fields.city || '-', copyValue: fields.city, label: 'copy city' },
    { key: 'state', value: fields.state || '-', copyValue: fields.state, label: 'copy state' },
    { key: 'postalCode', value: fields.postalCode || '-', copyValue: fields.postalCode, label: 'copy postal code' },
    { key: 'country', value: fields.country || '-', copyValue: fields.country, label: 'copy country' },
    { key: 'phone', value: `Phone: ${fields.phone}`, copyValue: fields.phone, label: 'copy phone' },
  ];

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        overflow: 'hidden',
        bgcolor: '#eaf7f7',
        borderColor: '#d5eeee',
        height: '100%'
      }}
    >
      <Box
        onClick={() => setExpanded((prev) => !prev)}
        sx={{
          px: 1.25,
          py: 1,
          bgcolor: '#15152a',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1
        }}
      >
        <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#fff', fontSize: '0.78rem' }}>
          SHIPPING ADDRESS
        </Typography>
        <IconButton size="small" sx={{ color: '#fff', p: 0.25 }} aria-label={expanded ? 'collapse shipping address' : 'expand shipping address'}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>
      <Collapse in={expanded} timeout="auto">
        <Stack spacing={0.5} sx={{ p: 1.25 }}>
          {rows.map((row) => (
            (() => {
              const copyText = row.copyValue ?? row.value;
              return (
                <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 28 }}>
                  <Tooltip title={row.value || '-'} arrow>
                    <Typography
                      variant={row.primary ? 'body2' : 'caption'}
                      fontWeight={row.primary ? 500 : 400}
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        fontSize: row.primary ? '0.85rem' : '0.78rem'
                      }}
                    >
                      {row.value || '-'}
                    </Typography>
                  </Tooltip>
                  <IconButton
                    size="small"
                    onClick={() => onCopy(copyText)}
                    aria-label={row.label}
                    disabled={!String(copyText || '').trim() || row.value === '-'}
                    sx={{ p: 0.25 }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              );
            })()
          ))}
          <Button
            size="small"
            onClick={() => onCopy(formatFullShippingAddress(order))}
            startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
            sx={{ mt: 0.5, alignSelf: 'flex-start', textTransform: 'none' }}
          >
            Copy Full Address
          </Button>
          <Button
            size="small"
            onClick={() => setExpanded(false)}
            startIcon={<ExpandLessIcon sx={{ fontSize: 16 }} />}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            Collapse
          </Button>
        </Stack>
      </Collapse>
      {!expanded && (
        <Button
          size="small"
          onClick={() => setExpanded(true)}
          startIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
          sx={{ m: 1.25, textTransform: 'none' }}
        >
          Expand
        </Button>
      )}
    </Paper>
  );
}

function EditableFulfillmentFields({ order, onOrderUpdate, editable = false }) {
  const orderMongoId = order?._id || order?.id;
  const [values, setValues] = useState({
    amazonAccount: '',
    arrivingDate: '',
    beforeTax: '',
    estimatedTax: '',
    azOrderId: '',
    remark: '',
    fulfillmentNotes: ''
  });
  const [amazonAccounts, setAmazonAccounts] = useState([]);
  const [remarkOptions, setRemarkOptions] = useState([]);
  const [savingField, setSavingField] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedField, setSavedField] = useState('');
  const [remarkTemplates, setRemarkTemplates] = useState([]);
  const [pendingRemarkUpdate, setPendingRemarkUpdate] = useState(null);
  const [sendingRemarkMessage, setSendingRemarkMessage] = useState(false);

  useEffect(() => {
    if (!order) return;
    setValues({
      amazonAccount: order.amazonAccount || '',
      arrivingDate: formatDateInputValue(order.arrivingDate),
      beforeTax: order.beforeTax ?? '',
      estimatedTax: order.estimatedTax ?? '',
      azOrderId: order.azOrderId || '',
      remark: order.remark || '',
      fulfillmentNotes: order.fulfillmentNotes || ''
    });
    setSaveError('');
    setSavedField('');
  }, [order]);

  useEffect(() => {
    let mounted = true;
    api.get('/amazon-accounts')
      .then(({ data }) => {
        if (mounted) setAmazonAccounts(data || []);
      })
      .catch(() => {
        if (mounted) setAmazonAccounts([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadRemarkTemplates()
      .then((templates) => {
        if (mounted) {
          setRemarkTemplates(templates);
          setRemarkOptions(remarkOptionsFromTemplates(templates));
        }
      })
      .catch(() => {
        if (mounted) {
          setRemarkTemplates([]);
          setRemarkOptions([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const normalizeValue = (field, value) => {
    if (field === 'beforeTax' || field === 'estimatedTax') return parseCurrencyInput(value);
    if (field === 'arrivingDate') return value || null;
    if (field === 'remark') {
      const normalized = String(value || '').trim();
      return normalized.toLowerCase() === 'select' ? '' : normalized;
    }
    return value || '';
  };

  const saveField = async (field, nextValue, extraFields = {}) => {
    if (!editable) return false;

    if (!orderMongoId) {
      setSaveError('Order id missing. Cannot save.');
      return false;
    }

    const currentValue = field === 'arrivingDate' ? formatDateInputValue(order[field]) : (order[field] ?? '');
    if (String(nextValue ?? '') === String(currentValue ?? '') && Object.keys(extraFields).length === 0) {
      return true;
    }

    setSavingField(field);
    setSaveError('');
    setSavedField('');
    try {
      const valueToSave = normalizeValue(field, nextValue);
      const payload = { [field]: valueToSave, ...extraFields };
      const { data } = await api.patch(`/ebay/orders/${orderMongoId}/manual-fields`, payload);
      if (data?.order) {
        onOrderUpdate(data.order);
      } else {
        onOrderUpdate({ ...order, [field]: valueToSave, ...payload });
      }
      setValues((prev) => ({ ...prev, [field]: nextValue ?? '' }));
      setSavedField(field);
      return true;
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Failed to update field');
      return false;
    } finally {
      setSavingField('');
    }
  };

  const sendAutoMessageForRemark = async (remarkValue) => {
    const template = findRemarkTemplateText(remarkTemplates, remarkValue);
    if (!template) return false;

    const messageBody = replaceTemplateVariables(template, order);
    await api.post('/ebay/send-message', {
      orderId: order.orderId,
      buyerUsername: order.buyer?.username,
      itemId: order.itemNumber || order.lineItems?.[0]?.legacyItemId,
      body: messageBody,
      subject: `Regarding Order #${order.orderId}`
    });
    return true;
  };

  const handleRemarkSelect = (remarkValue) => {
    handleLocalChange('remark', remarkValue);
    const template = findRemarkTemplateText(remarkTemplates, remarkValue);
    if (template) {
      setPendingRemarkUpdate({ remarkValue, order });
      return;
    }
    saveField('remark', remarkValue, { remarkMessageSent: false });
  };

  const handleSkipRemarkMessage = async () => {
    if (!pendingRemarkUpdate) return;
    const saved = await saveField('remark', pendingRemarkUpdate.remarkValue, { remarkMessageSent: false });
    if (saved) setPendingRemarkUpdate(null);
  };

  const handleConfirmRemarkMessage = async () => {
    if (!pendingRemarkUpdate) return;
    setSendingRemarkMessage(true);
    try {
      const saved = await saveField('remark', pendingRemarkUpdate.remarkValue, { remarkMessageSent: true });
      if (!saved) return;
      await sendAutoMessageForRemark(pendingRemarkUpdate.remarkValue);
      setPendingRemarkUpdate(null);
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Failed to update remark or send message');
    } finally {
      setSendingRemarkMessage(false);
    }
  };

  const handleLocalChange = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const fieldSx = {
    '& .MuiInputBase-root': { bgcolor: '#fff', fontSize: '0.82rem' },
    '& .MuiInputBase-input': { py: 0.75 },
    '& .MuiInputLabel-root': { fontSize: '0.78rem' }
  };

  const renderTextField = (field, label, props = {}) => (
    <TextField
      label={label}
      value={values[field]}
      onChange={(event) => handleLocalChange(field, event.target.value)}
      onBlur={() => saveField(field, values[field])}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !props.multiline) event.currentTarget.blur();
      }}
      size="small"
      fullWidth
      disabled={!editable || savingField === field}
      {...props}
      sx={{ ...fieldSx, ...(props.sx || {}) }}
    />
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        overflow: 'hidden',
        height: '100%',
        bgcolor: '#fbfcff',
        borderColor: '#dfe5ef'
      }}
    >
      <Box sx={{ px: 1.25, py: 1, bgcolor: '#15152a' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#fff', fontSize: '0.78rem' }}>
            FULFILLMENT FIELDS
          </Typography>
          {!editable && (
            <Chip
              label="Read only"
              size="small"
              sx={{ height: 20, bgcolor: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: '0.68rem' }}
            />
          )}
        </Stack>
      </Box>
      <Box sx={{ p: 1.25 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          <TextField
            select
            label="Amazon Acc"
            value={values.amazonAccount}
            onChange={(event) => {
              const nextValue = event.target.value;
              handleLocalChange('amazonAccount', nextValue);
              saveField('amazonAccount', nextValue);
            }}
            size="small"
            fullWidth
            disabled={!editable || savingField === 'amazonAccount'}
            sx={fieldSx}
          >
            <MenuItem value="">- Select -</MenuItem>
            {amazonAccounts.map((account) => (
              <MenuItem key={account._id || account.name} value={account.name}>
                {account.name}
              </MenuItem>
            ))}
          </TextField>
          {renderTextField('arrivingDate', 'Arriving', {
            type: 'date',
            InputLabelProps: { shrink: true }
          })}
          {renderTextField('beforeTax', 'Before Tax', {
            InputProps: { startAdornment: <InputAdornment position="start">$</InputAdornment> }
          })}
          {renderTextField('estimatedTax', 'Estimated Tax', {
            InputProps: { startAdornment: <InputAdornment position="start">$</InputAdornment> }
          })}
          {renderTextField('azOrderId', 'Az OrderID')}
          <TextField
            select
            label="Remark"
            value={values.remark}
            onChange={(event) => {
              handleRemarkSelect(event.target.value);
            }}
            size="small"
            fullWidth
            disabled={!editable || savingField === 'remark'}
            sx={fieldSx}
          >
            <MenuItem value="">- Select -</MenuItem>
            {remarkOptions.map((option) => (
              <MenuItem key={option._id || option.name} value={option.name}>
                {option.name}
              </MenuItem>
            ))}
          </TextField>
          {renderTextField('fulfillmentNotes', 'Notes', {
            multiline: true,
            minRows: 3,
            maxRows: 6,
            sx: {
              gridColumn: '1 / -1',
              ...fieldSx,
              '& .MuiInputBase-input': { py: 0.75 },
            },
          })}
        </Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 28, mt: 0.75 }}>
          {savingField && <CircularProgress size={14} />}
          {savingField && (
            <Typography variant="caption" color="text.secondary">
              Saving...
            </Typography>
          )}
          {!savingField && savedField && (
            <Typography variant="caption" color="success.main">
              Updated
            </Typography>
          )}
          {saveError && (
            <Typography variant="caption" color="error.main">
              {saveError}
            </Typography>
          )}
        </Stack>
      </Box>
      <Dialog
        open={Boolean(pendingRemarkUpdate)}
        onClose={() => {
          if (!sendingRemarkMessage) setPendingRemarkUpdate(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ChatIcon color="primary" />
            <Typography variant="h6">Send Message to Buyer?</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="info" icon={<InfoIcon />}>
              You're updating the remark to <strong>"{pendingRemarkUpdate?.remarkValue}"</strong>
            </Alert>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Would you like to automatically send this message to the buyer?
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  mt: 1.5,
                  p: 2,
                  bgcolor: 'grey.50',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {pendingRemarkUpdate
                    ? replaceTemplateVariables(
                        findRemarkTemplateText(remarkTemplates, pendingRemarkUpdate.remarkValue),
                        pendingRemarkUpdate.order
                      )
                    : ''}
                </Typography>
              </Paper>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Tip: The message will be sent through the eBay messaging system
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleSkipRemarkMessage} disabled={sendingRemarkMessage} color="inherit">
            No, Skip
          </Button>
          <Button
            onClick={handleConfirmRemarkMessage}
            variant="contained"
            disabled={sendingRemarkMessage}
            startIcon={sendingRemarkMessage ? <CircularProgress size={20} /> : <SendIcon />}
          >
            {sendingRemarkMessage ? 'Sending...' : 'Yes, Send Message'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default function OrderDetailsModal({ open, onClose, orderId, fulfillmentFieldsEditable = false }) {
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

  const openEbayItemPopup = (nextItemId) => {
    if (!nextItemId) return;
    const itemUrl = `https://www.ebay.com/itm/${encodeURIComponent(nextItemId)}`;
    const width = 1280;
    const height = 850;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    const popup = window.open(
      itemUrl,
      `ebay_item_${nextItemId}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      window.open(itemUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    popup.focus();
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
  const itemId = order?.itemNumber || order?.lineItems?.[0]?.legacyItemId || '';
  const itemTitle = order?.productName || order?.lineItems?.[0]?.title || '';

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
              </Section>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              <ShippingAddressSection order={order} onCopy={handleCopy} />
              <EditableFulfillmentFields
                order={order}
                onOrderUpdate={setOrder}
                editable={fulfillmentFieldsEditable}
              />
            </Box>

            {/* Item */}
            <Section title="Item">
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                <ItemThumbnail order={order} itemId={itemId} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <DetailCell
                    label="Title"
                    value={itemTitle}
                    fullWidth
                  />
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}>
                    <DetailCell
                      label="Item #"
                      value={
                        itemId ? (
                          <Stack direction="row" alignItems="center" spacing={0.25} sx={{ minWidth: 0 }}>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => openEbayItemPopup(itemId)}
                              endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                              sx={{
                                minWidth: 0,
                                p: 0,
                                fontSize: '0.8125rem',
                                fontFamily: 'monospace',
                                textTransform: 'none',
                                justifyContent: 'flex-start'
                              }}
                            >
                              {itemId}
                            </Button>
                            <IconButton size="small" onClick={() => handleCopy(itemId)} sx={{ p: 0.25 }}>
                              <ContentCopyIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Stack>
                        ) : '-'
                      }
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
                </Box>
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
