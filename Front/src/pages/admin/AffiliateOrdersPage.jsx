import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Divider,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    Link,
    ListSubheader,
    MenuItem,
    Menu,
    Paper,
    Select,
    Snackbar,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    Tab,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import api from '../../lib/api';
import ColumnSelector from '../../components/ColumnSelector';
import TemplateManagementModal from '../../components/TemplateManagementModal';
import { CHAT_TEMPLATES, personalizeTemplate } from '../../constants/chatTemplates';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCING_STATUSES = ['Not Yet', 'Done', 'Added to cart', 'Cancelled order'];
const PURCHASERS = ['Ayushman', 'Debabrata', 'CEO Sir', 'Sakchi Ma\'am', 'Dev sir'];
const MESSAGE_STATUSES = [
    'Being Processed',
    'Late Message',
    'Cancellation Message',
    'Alternative Message',
    'Confirmation Message',
];
const AMAZON_ACCOUNT_DAILY_LIMIT = 9;
const AFFILIATE_MARKUP_RATE = 0.035;
const AFFILIATE_IGST_RATE = 0.18;

const SOURCING_STATUS_COLORS = {
    'Done': 'success',
    'Not Yet': 'default',
    'Added to cart': 'warning',
    'Cancelled order': 'error',
};

const MSG_STATUS_COLORS = {
    'Being Processed': '#ff9800',
    'Late Message': '#f4d03f',
    'Cancellation Message': '#42a5f5',
    'Alternative Message': '#ab47bc',
    'Confirmation Message': '#bdbdbd',
};

const DAILY_ORDER_ALL_COLUMNS = [
    { id: 'index', label: '#' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'productName', label: 'Product Name' },
    { id: 'seller', label: 'Seller' },
    { id: 'supplierLink', label: 'Supplier Link' },
    { id: 'affiliateLinks', label: 'Affiliate Links' },
    { id: 'priceUsd', label: 'Price (USD)' },
    { id: 'amazonAccount', label: 'Amazon Account' },
    { id: 'arriving', label: 'Arriving' },
    { id: 'beforeTax', label: 'Before Tax' },
    { id: 'estimatedTax', label: 'Estimated Tax' },
    { id: 'azOrderId', label: 'Az OrderID' },
    { id: 'status', label: 'Status' },
    { id: 'purchaser', label: 'Purchaser' },
    { id: 'messageStatus', label: 'Message Status' },
    { id: 'messaging', label: 'Messaging' },
    { id: 'notes', label: 'Notes' },
];

const DEFAULT_DAILY_VISIBLE_COLUMNS = DAILY_ORDER_ALL_COLUMNS.map((c) => c.id);

const AFFILIATE_EXPORT_COLUMNS = [
    ...DAILY_ORDER_ALL_COLUMNS,
    { id: 'carryOver', label: 'Carry Over' },
    { id: 'sourceDate', label: 'Source Date' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayStr() {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function fmt(val, digits = 2) {
    if (val == null || val === '') return '—';
    return Number(val).toFixed(digits);
}

function roundMoney(value) {
    return Number((Number(value) || 0).toFixed(2));
}

function calculateActualSpend(baseAmount) {
    const base = roundMoney(baseAmount);
    const markup = roundMoney(base * AFFILIATE_MARKUP_RATE);
    const igstOnMarkup = roundMoney(markup * AFFILIATE_IGST_RATE);
    const total = roundMoney(base + markup + igstOnMarkup);

    return {
        base,
        markup,
        igstOnMarkup,
        total,
    };
}

function getCarryOverLabel(carryOverDays) {
    if (carryOverDays <= 0) return '';
    if (carryOverDays === 1) return 'Yesterday';
    return `${carryOverDays} days ago`;
}

function getSellerGroupName(order) {
    return order?.sellerGroupName || order?.seller?.user?.username || order?.sellerId || 'Unknown Seller';
}

function hasAffiliateLinks(order) {
    return Boolean(String(order?.affiliateLinks || '').trim());
}

function normalizeAffiliateOrder(order) {
    const carryOverDays = Math.max(0, Number(order?.carryOverDays) || 0);
    const isCarryOver = order?.sourcingStatus === 'Not Yet' && (Boolean(order?.isCarryOver) || carryOverDays > 0);

    return {
        ...order,
        sellerGroupName: getSellerGroupName(order),
        carryOverDays,
        isCarryOver,
        carryOverLabel: order?.carryOverLabel || getCarryOverLabel(carryOverDays),
        sourceDate: order?.sourceDate || '',
    };
}

function getOrderSpendAmount(order) {
    return Number(order?.affiliatePrice) || 0;
}

function getOrderGiftCardBaseAmount(order) {
    const beforeTax = Number(order?.beforeTax) || 0;
    return beforeTax > 0 ? beforeTax : getOrderSpendAmount(order);
}

function getOrderCreditCardBaseAmount(order) {
    const beforeTax = Number(order?.beforeTax) || 0;
    const estimatedTax = Number(order?.estimatedTax) || 0;
    const combinedAmount = beforeTax + estimatedTax;

    return combinedAmount > 0 ? combinedAmount : getOrderSpendAmount(order);
}

function summarizeActualSpendRows(rowList) {
    return rowList.reduce((acc, row) => ({
        orderCount: acc.orderCount + 1,
        base: roundMoney(acc.base + row.base),
        markup: roundMoney(acc.markup + row.markup),
        igstOnMarkup: roundMoney(acc.igstOnMarkup + row.igstOnMarkup),
        total: roundMoney(acc.total + row.total),
    }), {
        orderCount: 0,
        base: 0,
        markup: 0,
        igstOnMarkup: 0,
        total: 0,
    });
}

function summarizeActualSpendByAccount(rowList) {
    return Object.values(rowList.reduce((acc, row) => {
        const accountName = row.amazonAccount || '(Unassigned)';

        if (!acc[accountName]) {
            acc[accountName] = {
                amazonAccount: accountName,
                orderCount: 0,
                base: 0,
                markup: 0,
                igstOnMarkup: 0,
                total: 0,
            };
        }

        acc[accountName].orderCount += 1;
        acc[accountName].base = roundMoney(acc[accountName].base + row.base);
        acc[accountName].markup = roundMoney(acc[accountName].markup + row.markup);
        acc[accountName].igstOnMarkup = roundMoney(acc[accountName].igstOnMarkup + row.igstOnMarkup);
        acc[accountName].total = roundMoney(acc[accountName].total + row.total);

        return acc;
    }, {})).sort((left, right) => left.amazonAccount.localeCompare(right.amazonAccount));
}

function sortAffiliateOrders(orderList) {
    return [...orderList].sort((leftOrder, rightOrder) => {
        const left = normalizeAffiliateOrder(leftOrder);
        const right = normalizeAffiliateOrder(rightOrder);

        const sellerCompare = left.sellerGroupName.localeCompare(right.sellerGroupName);
        if (sellerCompare !== 0) return sellerCompare;

        const leftDate = new Date(left.dateSold || left.creationDate || 0).getTime();
        const rightDate = new Date(right.dateSold || right.creationDate || 0).getTime();
        if (leftDate !== rightDate) return leftDate - rightDate;

        return String(left.orderId || '').localeCompare(String(right.orderId || ''));
    });
}

function buildOrderSections(orderList, showNotYetFirst) {
    if (!showNotYetFirst) {
        return [{ key: 'all', label: '', orders: orderList }];
    }

    const notYetOrders = orderList.filter((order) => order.sourcingStatus === 'Not Yet');
    const remainingOrders = orderList.filter((order) => order.sourcingStatus !== 'Not Yet');

    return [
        { key: 'not-yet', label: 'Not Yet Orders', orders: notYetOrders },
        { key: 'other-statuses', label: 'Other Statuses', orders: remainingOrders },
    ].filter((section) => section.orders.length > 0);
}

function getSellerGroupStats(orderList) {
    return orderList.reduce((acc, order) => {
        const sellerName = order.sellerGroupName || 'Unknown Seller';
        if (!acc[sellerName]) {
            acc[sellerName] = { total: 0, carryOver: 0 };
        }

        acc[sellerName].total += 1;
        if (order.isCarryOver) {
            acc[sellerName].carryOver += 1;
        }

        return acc;
    }, {});
}

// ─── Inline Select Cell ───────────────────────────────────────────────────────

function InlineSelect({ value, options, onChange, size = 'small', sx = {} }) {
    return (
        <Select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            size={size}
            displayEmpty
            sx={{ minWidth: 140, fontSize: '0.8rem', ...sx }}
        >
            <MenuItem value=""><em>—</em></MenuItem>
            {options.map((o) => (
                <MenuItem key={o} value={o} sx={{ fontSize: '0.8rem' }}>{o}</MenuItem>
            ))}
        </Select>
    );
}

// ─── Inline Text Cell (click-to-edit with save) ───────────────────────────────

function InlineText({ value, onSave, placeholder = '—', multiline = false }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value || '');
    const inputRef = useRef(null);

    useEffect(() => {
        if (!editing) setDraft(value || '');
    }, [value, editing]);

    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const commit = () => {
        setEditing(false);
        if (draft !== (value || '')) onSave(draft);
    };

    if (editing) {
        return (
            <TextField
                inputRef={inputRef}
                value={draft}
                size="small"
                multiline={multiline}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === 'Escape') { setEditing(false); setDraft(value || ''); } }}
                sx={{ minWidth: 180, fontSize: '0.8rem' }}
            />
        );
    }

    return (
        <Box
            onClick={() => setEditing(true)}
            sx={{
                cursor: 'text',
                minWidth: 120,
                minHeight: 24,
                px: 0.5,
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
                fontSize: '0.8rem',
                color: value ? 'text.primary' : 'text.disabled',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
            }}
        >
            {value || placeholder}
        </Box>
    );
}

function ImageDialog({ open, onClose, images }) {
    const theme = useTheme();
    const isMobileDialog = useMediaQuery(theme.breakpoints.down('sm'));
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (open) {
            setCurrentIndex(0);
        }
    }, [open]);

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobileDialog}>
            <DialogTitle sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        Images ({currentIndex + 1}/{images.length})
                    </Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
                {images.length > 0 ? (
                    <Box>
                        <Box
                            sx={{
                                width: '100%',
                                height: { xs: 'calc(100vh - 200px)', sm: 500 },
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: 'grey.100',
                                borderRadius: 1,
                                mb: 2,
                                position: 'relative'
                            }}
                        >
                            <img
                                src={images[currentIndex]}
                                alt={`Item ${currentIndex + 1}`}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain'
                                }}
                            />

                            {images.length > 1 && isMobileDialog && (
                                <>
                                    <IconButton
                                        onClick={handlePrev}
                                        sx={{
                                            position: 'absolute',
                                            left: 4,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            bgcolor: 'rgba(255,255,255,0.8)',
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                                        }}
                                    >
                                        <NavigateBeforeIcon />
                                    </IconButton>
                                    <IconButton
                                        onClick={handleNext}
                                        sx={{
                                            position: 'absolute',
                                            right: 4,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            bgcolor: 'rgba(255,255,255,0.8)',
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                                        }}
                                    >
                                        <NavigateNextIcon />
                                    </IconButton>
                                </>
                            )}
                        </Box>

                        {images.length > 1 && !isMobileDialog && (
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
                                <Button onClick={handlePrev} startIcon={<NavigateBeforeIcon />} variant="outlined">
                                    Previous
                                </Button>
                                <Button onClick={handleNext} endIcon={<NavigateNextIcon />} variant="outlined">
                                    Next
                                </Button>
                            </Stack>
                        )}

                        {images.length > 1 && (
                            <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{
                                    overflowX: 'auto',
                                    pb: 1,
                                    justifyContent: { xs: 'flex-start', sm: 'center' },
                                    flexWrap: { xs: 'nowrap', sm: 'wrap' }
                                }}
                            >
                                {images.map((img, idx) => (
                                    <Box
                                        key={idx}
                                        onClick={() => setCurrentIndex(idx)}
                                        sx={{
                                            width: { xs: 60, sm: 80 },
                                            height: { xs: 60, sm: 80 },
                                            cursor: 'pointer',
                                            border: idx === currentIndex ? '3px solid' : '1px solid',
                                            borderColor: idx === currentIndex ? 'primary.main' : 'grey.300',
                                            borderRadius: 1,
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            '&:hover': {
                                                borderColor: 'primary.main',
                                                opacity: 0.8
                                            }
                                        }}
                                    >
                                        <img
                                            src={img}
                                            alt={`Thumbnail ${idx + 1}`}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Box>
                ) : (
                    <Alert severity="info">No images available for this item</Alert>
                )}
            </DialogContent>
        </Dialog>
    );
}

function ChatDialog({ open, onClose, order }) {
    const theme = useTheme();
    const isMobileChat = useMediaQuery(theme.breakpoints.down('sm'));

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const pollingInterval = useRef(null);
    const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
    const [chatTemplates, setChatTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

    useEffect(() => {
        if (open && order) {
            loadMessages();
            startPolling();
        } else {
            stopPolling();
            setMessages([]);
            setNewMessage('');
        }
        return () => stopPolling();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, order]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        loadChatTemplates();
    }, []);

    const stopPolling = () => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
    };

    const startPolling = () => {
        stopPolling();
        pollingInterval.current = setInterval(() => {
            if (order) {
                const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
                api.post('/ebay/sync-thread', {
                    sellerId: order.seller?._id || order.seller,
                    buyerUsername: order.buyer?.username,
                    itemId
                }).then((res) => {
                    if (res.data.newMessagesFound) {
                        loadMessages(false);
                    }
                }).catch((err) => console.error('Polling error', err));
            }
        }, 10000);
    };

    async function loadMessages(showLoading = true) {
        if (showLoading) setLoading(true);
        try {
            const { data } = await api.get('/ebay/chat/messages', {
                params: { orderId: order.orderId }
            });
            setMessages(data || []);
        } catch (e) {
            console.error('Failed to load messages', e);
        } finally {
            if (showLoading) setLoading(false);
        }
    }

    async function handleSendMessage() {
        if (!newMessage.trim()) return;
        setSending(true);
        try {
            const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
            const { data } = await api.post('/ebay/send-message', {
                orderId: order.orderId,
                buyerUsername: order.buyer?.username,
                itemId,
                body: newMessage,
                subject: `Regarding Order #${order.orderId}`
            });

            setMessages([...messages, data.message]);
            setNewMessage('');
        } catch (e) {
            alert('Failed to send: ' + (e.response?.data?.error || e.message));
        } finally {
            setSending(false);
        }
    }

    async function loadChatTemplates() {
        setTemplatesLoading(true);
        try {
            const { data } = await api.get('/chat-templates');
            if (data.templates && data.templates.length > 0) {
                setChatTemplates(data.templates);
            }
        } catch (e) {
            console.error('Failed to load chat templates:', e);
            setChatTemplates(CHAT_TEMPLATES);
        } finally {
            setTemplatesLoading(false);
        }
    }

    const handleTemplateClick = (event) => {
        setTemplateAnchorEl(event.currentTarget);
    };

    const handleTemplateClose = () => {
        setTemplateAnchorEl(null);
    };

    const handleSelectTemplate = (templateText) => {
        const nameToUse = order.shippingFullName || order.buyer?.username || 'Buyer';
        const personalizedText = personalizeTemplate(templateText, nameToUse);

        setNewMessage(personalizedText);
        handleTemplateClose();
    };

    const sellerName = order?.seller?.user?.username || 'Seller';
    const buyerName = order?.buyer?.buyerRegistrationAddress?.fullName || '-';
    const buyerUsername = order?.buyer?.username || '-';
    const itemId = order?.itemNumber || order?.lineItems?.[0]?.legacyItemId || '';
    let itemTitle = order?.productName || order?.lineItems?.[0]?.title || '';
    const itemCount = order?.lineItems?.length || 0;
    if (itemCount > 1) {
        itemTitle = `${itemTitle} (+ ${itemCount - 1} other${itemCount - 1 > 1 ? 's' : ''})`;
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobileChat}>
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', position: 'relative' }}>
                <Stack
                    direction="column"
                    spacing={1}
                    alignItems="flex-end"
                    sx={{ position: 'absolute', top: { xs: 8, sm: 12 }, right: { xs: 8, sm: 12 }, zIndex: 10 }}
                >
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        {!isMobileChat && (
                            <Chip
                                label={sellerName}
                                size="small"
                                icon={<PersonIcon style={{ fontSize: 16 }} />}
                                sx={{
                                    bgcolor: '#e3f2fd',
                                    color: '#1565c0',
                                    fontWeight: 'bold',
                                    height: 24,
                                    fontSize: '0.75rem'
                                }}
                            />
                        )}
                        <IconButton onClick={onClose} size="small" sx={{ color: 'text.disabled' }}>
                            <CloseIcon />
                        </IconButton>
                    </Stack>

                    <Tooltip title="Choose a response template">
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleTemplateClick}
                            disabled={sending}
                            sx={{
                                minWidth: { xs: 'auto', sm: 100 },
                                px: { xs: 1, sm: 2 },
                                fontSize: { xs: '0.7rem', sm: '0.875rem' },
                                bgcolor: 'white'
                            }}
                            endIcon={<ExpandMoreIcon />}
                        >
                            Templates
                        </Button>
                    </Tooltip>
                </Stack>

                <Stack spacing={1} sx={{ pr: { xs: 6, sm: 12 } }}>
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        spacing={{ xs: 0.5, sm: 3 }}
                        sx={{ mt: 0.5 }}
                    >
                        <Box>
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Buyer
                            </Typography>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.1, fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                                {buyerName}
                            </Typography>
                        </Box>

                        {!isMobileChat && (
                            <Divider orientation="vertical" flexItem sx={{ height: 20, alignSelf: 'center', opacity: 0.5 }} />
                        )}

                        <Box>
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Username
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.05)', px: 0.5, borderRadius: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                {buyerUsername}
                            </Typography>
                        </Box>
                    </Stack>

                    <Box>
                        <Link
                            href={`https://www.ebay.com/itm/${itemId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}
                        >
                            <Typography
                                variant="subtitle2"
                                sx={{
                                    color: 'primary.main',
                                    fontWeight: 600,
                                    lineHeight: 1.3,
                                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                    display: '-webkit-box',
                                    WebkitLineClamp: isMobileChat ? 1 : 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}
                            >
                                {itemTitle || `Item ID: ${itemId}`}
                            </Typography>
                            <OpenInNewIcon sx={{ fontSize: 14, color: 'primary.main', mt: 0.3, flexShrink: 0 }} />
                        </Link>

                        <Chip
                            label={`Order: ${order?.orderId || order?.legacyOrderId || 'N/A'}`}
                            size="small"
                            variant="outlined"
                            sx={{
                                borderRadius: 1,
                                height: 20,
                                fontSize: '0.65rem',
                                color: 'text.secondary',
                                borderColor: 'divider',
                                bgcolor: '#fafafa'
                            }}
                        />
                    </Box>
                </Stack>
            </Box>

            <DialogContent sx={{ p: 0, bgcolor: '#f0f2f5', height: { xs: 'calc(100vh - 180px)', sm: '500px' }, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
                    {loading ? (
                        <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
                    ) : (
                        <Stack spacing={2}>
                            {messages.length === 0 && (
                                <Alert severity="info" sx={{ mx: 'auto', width: 'fit-content' }}>
                                    No messages yet. Start the conversation below!
                                </Alert>
                            )}

                            {messages.map((msg) => (
                                <Box
                                    key={msg._id}
                                    sx={{
                                        alignSelf: msg.sender === 'SELLER' ? 'flex-end' : 'flex-start',
                                        maxWidth: '70%'
                                    }}
                                >
                                    <Paper
                                        elevation={1}
                                        sx={{
                                            p: 1.5,
                                            bgcolor: msg.sender === 'SELLER' ? '#1976d2' : '#ffffff',
                                            color: msg.sender === 'SELLER' ? '#fff' : 'text.primary',
                                            borderRadius: 2,
                                            position: 'relative'
                                        }}
                                    >
                                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{msg.body}</Typography>

                                        {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                                            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                {msg.mediaUrls.map((url, idx) => (
                                                    <Box
                                                        key={idx}
                                                        component="img"
                                                        src={url}
                                                        alt="Attachment"
                                                        sx={{
                                                            width: 100,
                                                            height: 100,
                                                            objectFit: 'cover',
                                                            borderRadius: 1,
                                                            cursor: 'pointer',
                                                            border: '1px solid #ccc'
                                                        }}
                                                        onClick={() => window.open(url, '_blank')}
                                                    />
                                                ))}
                                            </Box>
                                        )}
                                    </Paper>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: msg.sender === 'SELLER' ? 'right' : 'left', fontSize: '0.7rem' }}>
                                        {new Date(msg.messageDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} PT
                                        {msg.sender === 'SELLER' && (msg.read ? ' • Read' : ' • Sent')}
                                    </Typography>
                                </Box>
                            ))}
                            <div ref={messagesEndRef} />
                        </Stack>
                    )}
                </Box>

                <Box sx={{ p: { xs: 1, sm: 2 }, bgcolor: '#fff', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        multiline
                        maxRows={3}
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        disabled={sending}
                        size="small"
                        sx={{
                            '& .MuiInputBase-input': {
                                fontSize: { xs: '0.875rem', sm: '1rem' }
                            }
                        }}
                    />
                    <Menu
                        anchorEl={templateAnchorEl}
                        open={Boolean(templateAnchorEl)}
                        onClose={handleTemplateClose}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                        }}
                        PaperProps={{
                            style: {
                                maxHeight: 400,
                                width: 320,
                            },
                        }}
                    >
                        <MenuItem
                            onClick={() => { handleTemplateClose(); setManageTemplatesOpen(true); }}
                            sx={{
                                borderBottom: '2px solid #e0e0e0',
                                bgcolor: '#f9f9ff',
                                py: 1.5
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <SettingsIcon fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="primary">Manage Templates</Typography>
                            </Stack>
                        </MenuItem>

                        {templatesLoading ? (
                            <Box sx={{ p: 2, textAlign: 'center' }}>
                                <CircularProgress size={20} />
                            </Box>
                        ) : chatTemplates.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                                No templates available. Click "Manage Templates" to add some.
                            </Typography>
                        ) : (
                            chatTemplates.map((group, index) => (
                                <Box key={index}>
                                    <ListSubheader
                                        sx={{
                                            bgcolor: '#f5f5f5',
                                            fontWeight: 'bold',
                                            lineHeight: '32px',
                                            color: 'primary.main',
                                            fontSize: '0.75rem'
                                        }}
                                    >
                                        {group.category}
                                    </ListSubheader>
                                    {group.items.map((item, idx) => (
                                        <MenuItem
                                            key={item._id || idx}
                                            onClick={() => handleSelectTemplate(item.text)}
                                            sx={{
                                                fontSize: '0.85rem',
                                                whiteSpace: 'normal',
                                                py: 1,
                                                borderBottom: '1px solid #f0f0f0',
                                                display: 'block'
                                            }}
                                        >
                                            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                {item.label}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                    fontSize: '0.75rem'
                                                }}
                                            >
                                                {item.text}
                                            </Typography>
                                        </MenuItem>
                                    ))}
                                </Box>
                            ))
                        )}
                    </Menu>
                    <Button
                        variant="contained"
                        sx={{ px: { xs: 2, sm: 3 }, minWidth: { xs: 'auto', sm: 80 } }}
                        endIcon={!isMobileChat && (sending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />)}
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                    >
                        {isMobileChat ? <SendIcon /> : 'Send'}
                    </Button>
                </Box>
            </DialogContent>

            <TemplateManagementModal
                open={manageTemplatesOpen}
                onClose={() => {
                    setManageTemplatesOpen(false);
                    loadChatTemplates();
                }}
            />
        </Dialog>
    );
}

// ─── Tab Panel Helper ─────────────────────────────────────────────────────────

function TabPanel({ children, value, index }) {
    return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function AffiliateOrdersPage() {
    const COLUMN_STORAGE_KEY = 'affiliate_orders_visible_columns';
    const [date, setDate] = useState(getTodayStr());
    const [tab, setTab] = useState(0);
    const [selectedSeller, setSelectedSeller] = useState('');
    const [excludeLowValue, setExcludeLowValue] = useState(false);
    const [showDoneEntries, setShowDoneEntries] = useState(false);
    const [showNotYetFirst, setShowNotYetFirst] = useState(true);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState(() => {
        try {
            const stored = JSON.parse(sessionStorage.getItem(COLUMN_STORAGE_KEY) || 'null');
            if (!Array.isArray(stored)) return DEFAULT_DAILY_VISIBLE_COLUMNS;
            const missing = DEFAULT_DAILY_VISIBLE_COLUMNS.filter((col) => !stored.includes(col));
            return [...stored, ...missing];
        } catch {
            return DEFAULT_DAILY_VISIBLE_COLUMNS;
        }
    });

    // Tab 1 state
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState('');
    const [sellerOptions, setSellerOptions] = useState([]);
    const [sellerOptionsLoading, setSellerOptionsLoading] = useState(false);
    const [amazonAccounts, setAmazonAccounts] = useState([]);

    // Tab 2 state
    const [balances, setBalances] = useState([]);
    const [balancesLoading, setBalancesLoading] = useState(false);
    const [balancesError, setBalancesError] = useState('');

    // Tab 3 state
    const [summary, setSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState('');

    // Tab 4 state
    const [spendOrders, setSpendOrders] = useState([]);
    const [spendOrdersLoading, setSpendOrdersLoading] = useState(false);
    const [spendOrdersError, setSpendOrdersError] = useState('');

    // Snackbar
    const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
    const notify = (severity, msg) => setSnack({ open: true, msg, severity });

    // Product images
    const [itemImages, setItemImages] = useState({});
    const [thumbnailImages, setThumbnailImages] = useState({});
    const [loadingImages, setLoadingImages] = useState({});
    const [imageDialogOpen, setImageDialogOpen] = useState(false);
    const [selectedImages, setSelectedImages] = useState([]);
    const [selectedExportColumns, setSelectedExportColumns] = useState(AFFILIATE_EXPORT_COLUMNS.map((column) => column.id));

    // Messaging modal
    const [messageModalOpen, setMessageModalOpen] = useState(false);
    const [selectedOrderForMessage, setSelectedOrderForMessage] = useState(null);

    const currentUser = useMemo(() => {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    }, []);
    const isSuperAdmin = currentUser?.role === 'superadmin';

    const amazonAssignedCounts = (summary?.byAmazonAccount || []).reduce((acc, row) => {
        if (!row?.name || row.name === '(Unassigned)') return acc;
        acc[row.name] = row.count || 0;
        return acc;
    }, {});

    useEffect(() => {
        sessionStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
    }, [visibleColumns]);

    useEffect(() => {
        if (sellerOptionsLoading) {
            return;
        }

        if (sellerOptions.length === 0) {
            if (selectedSeller) {
                setSelectedSeller('');
            }
            setOrders([]);
            return;
        }

        if (!selectedSeller || !sellerOptions.some((option) => option.value === selectedSeller)) {
            setSelectedSeller(sellerOptions[0].value);
        }
    }, [selectedSeller, sellerOptions, sellerOptionsLoading]);

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchSellerOptions = useCallback(async () => {
        setSellerOptionsLoading(true);
        setOrdersError('');
        try {
            const { data } = await api.get('/affiliate-orders/daily/sellers', {
                params: {
                    date,
                    excludeLowValue: excludeLowValue ? 'true' : 'false',
                    includeDone: showDoneEntries ? 'true' : 'false',
                }
            });
            setSellerOptions(data || []);
        } catch (err) {
            setSellerOptions([]);
            setOrders([]);
            setOrdersError(err?.response?.data?.error || 'Failed to load seller options');
        } finally {
            setSellerOptionsLoading(false);
        }
    }, [date, excludeLowValue, showDoneEntries]);

    const fetchOrders = useCallback(async () => {
        if (!selectedSeller) {
            setOrders([]);
            return;
        }

        setOrdersLoading(true);
        setOrdersError('');
        try {
            const { data } = await api.get('/affiliate-orders/daily', {
                params: {
                    date,
                    excludeLowValue: excludeLowValue ? 'true' : 'false',
                    includeDone: showDoneEntries ? 'true' : 'false',
                    sellerId: selectedSeller,
                }
            });
            setOrders((data || []).map(normalizeAffiliateOrder));
        } catch (err) {
            setOrdersError(err?.response?.data?.error || 'Failed to load orders');
        } finally {
            setOrdersLoading(false);
        }
    }, [date, excludeLowValue, selectedSeller, showDoneEntries]);

    const fetchAmazonAccounts = useCallback(async () => {
        try {
            const { data } = await api.get('/amazon-accounts');
            setAmazonAccounts(data.map((a) => a.name));
        } catch { /* silent */ }
    }, []);

    const fetchBalances = useCallback(async () => {
        setBalancesLoading(true);
        setBalancesError('');
        try {
            const { data } = await api.get('/affiliate-orders/balances', { params: { date, excludeLowValue: excludeLowValue ? 'true' : 'false' } });
            setBalances(data);
        } catch (err) {
            setBalancesError(err?.response?.data?.error || 'Failed to load balances');
        } finally {
            setBalancesLoading(false);
        }
    }, [date, excludeLowValue]);

    const fetchSummary = useCallback(async () => {
        setSummaryLoading(true);
        setSummaryError('');
        try {
            const { data } = await api.get('/affiliate-orders/summary', { params: { date, excludeLowValue: excludeLowValue ? 'true' : 'false' } });
            setSummary(data);
        } catch (err) {
            setSummaryError(err?.response?.data?.error || 'Failed to load summary');
        } finally {
            setSummaryLoading(false);
        }
    }, [date, excludeLowValue]);

    const fetchSpendOrders = useCallback(async () => {
        setSpendOrdersLoading(true);
        setSpendOrdersError('');
        try {
            const { data } = await api.get('/affiliate-orders/spend', { params: { date, excludeLowValue: excludeLowValue ? 'true' : 'false' } });
            setSpendOrders((data || []).map(normalizeAffiliateOrder));
        } catch (err) {
            setSpendOrdersError(err?.response?.data?.error || 'Failed to load spend orders');
        } finally {
            setSpendOrdersLoading(false);
        }
    }, [date, excludeLowValue]);

    useEffect(() => {
        fetchSellerOptions();
        fetchAmazonAccounts();
        fetchBalances();
        fetchSummary();
        fetchSpendOrders();
    }, [date, excludeLowValue, showDoneEntries, fetchSellerOptions, fetchAmazonAccounts, fetchBalances, fetchSummary, fetchSpendOrders]);

    useEffect(() => {
        if (sellerOptionsLoading || !selectedSeller) {
            return;
        }

        if (!sellerOptions.some((option) => option.value === selectedSeller)) {
            return;
        }

        fetchOrders();
    }, [fetchOrders, selectedSeller, sellerOptions, sellerOptionsLoading]);

    // ── Order field patch ──────────────────────────────────────────────────────

    const patchOrder = useCallback(async (orderId, field, value, options = {}) => {
        const { refreshAfter = true } = options;
        try {
            const { data } = await api.patch(`/affiliate-orders/${orderId}/sourcing`, { [field]: value });
            setOrders((prev) => prev
                .map((o) => (o._id === orderId ? normalizeAffiliateOrder({ ...o, ...data }) : o))
                .filter((o) => showDoneEntries || o.sourcingStatus !== 'Done'));
            if (refreshAfter) {
                // Refresh balances and summary when order values change.
                fetchBalances();
                fetchSummary();
            }
            return true;
        } catch (err) {
            notify('error', err?.response?.data?.error || `Failed to update ${field}`);
            return false;
        }
    }, [fetchBalances, fetchSummary, showDoneEntries]);

    // ── Balance field patch ────────────────────────────────────────────────────

    const patchBalance = useCallback(async (accountName, field, value) => {
        try {
            // Get current row to send full payload
            const current = balances.find((b) => b.amazonAccountName === accountName) || {};
            const payload = {
                amazonAccountName: accountName,
                date,
                availableBalance: current.availableBalance ?? 0,
                addedBalance: current.addedBalance ?? 0,
                note: current.note ?? '',
                [field]: value,
            };
            const { data: updated } = await api.put('/affiliate-orders/balances', payload);
            setBalances((prev) =>
                prev.map((b) => {
                    if (b.amazonAccountName !== accountName) return b;
                    const avail = Number(field === 'availableBalance' ? value : b.availableBalance) || 0;
                    const added = Number(field === 'addedBalance' ? value : b.addedBalance) || 0;
                    const totalExpense = Number(b.totalExpense) || 0;
                    const difference = avail + added - totalExpense;
                    return {
                        ...b,
                        ...updated,
                        availableBalance: avail,
                        addedBalance: added,
                        difference,
                        giftCardStatus: difference > 0,
                    };
                })
            );
            fetchSummary();
        } catch (err) {
            notify('error', err?.response?.data?.error || `Failed to update ${field}`);
        }
    }, [balances, date, fetchSummary]);

    const fetchThumbnail = async (order) => {
        const orderId = order._id;
        const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
        const sellerId = order.seller?._id || order.seller;

        if (!itemId || !sellerId || thumbnailImages[orderId]) {
            return;
        }

        try {
            const { data } = await api.get(`/ebay/item-images/${itemId}?sellerId=${sellerId}&thumbnail=true`);
            if (data.images && data.images.length > 0) {
                setThumbnailImages((prev) => ({ ...prev, [orderId]: data.images[0] }));
                if (data.total > 1) {
                    setItemImages((prev) => ({ ...prev, [orderId]: { count: data.total } }));
                }
            }
        } catch (error) {
            console.error('Error fetching thumbnail:', error);
        }
    };

    const fetchAllImages = async (order) => {
        const orderId = order._id;
        const itemId = order.itemNumber || order.lineItems?.[0]?.legacyItemId;
        const sellerId = order.seller?._id || order.seller;

        if (itemImages[orderId]?.images) {
            return itemImages[orderId].images;
        }

        setLoadingImages((prev) => ({ ...prev, [orderId]: true }));

        try {
            const { data } = await api.get(`/ebay/item-images/${itemId}?sellerId=${sellerId}`);
            const allImages = data.images || [];
            setItemImages((prev) => ({ ...prev, [orderId]: { images: allImages, count: allImages.length } }));
            return allImages;
        } catch (error) {
            console.error('Error fetching all images:', error);
            return [];
        } finally {
            setLoadingImages((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    useEffect(() => {
        if (orders.length > 0) {
            orders.forEach((order) => {
                fetchThumbnail(order);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orders]);

    const handleViewImages = async (order) => {
        const allImages = await fetchAllImages(order);
        if (allImages.length > 0) {
            setSelectedImages(allImages);
            setImageDialogOpen(true);
        }
    };

    const handleOpenMessageDialog = (order) => {
        setSelectedOrderForMessage(order);
        setMessageModalOpen(true);
    };

    const handleCloseMessageDialog = () => {
        setMessageModalOpen(false);
        setSelectedOrderForMessage(null);
    };

    const handleBulkAssignAmazonAccount = async (orderList, startIndex, accountName) => {
        if (!accountName) {
            notify('warning', 'Select an Amazon account first for this row');
            return;
        }

        const raw = window.prompt('Assign this account to next how many entries? (1-9)', '1');
        if (raw == null) return;

        const parsed = parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            notify('error', 'Please enter a valid number between 1 and 9');
            return;
        }

        const count = Math.min(parsed, AMAZON_ACCOUNT_DAILY_LIMIT);
        const targets = orderList.slice(startIndex + 1, startIndex + 1 + count);
        if (targets.length === 0) {
            notify('info', 'No next entries available');
            return;
        }

        let assignedCount = amazonAssignedCounts[accountName] || 0;
        let updated = 0;
        let blockedByLimit = false;

        for (const target of targets) {
            if (target.amazonAccount === accountName) continue;

            if (assignedCount >= AMAZON_ACCOUNT_DAILY_LIMIT) {
                blockedByLimit = true;
                break;
            }

            const ok = await patchOrder(target._id, 'amazonAccount', accountName, { refreshAfter: false });
            if (!ok) continue;

            assignedCount += 1;
            updated += 1;
        }

        fetchBalances();
        fetchSummary();

        if (blockedByLimit) {
            notify('warning', `Assigned ${updated} entr${updated === 1 ? 'y' : 'ies'}. Reached daily limit (${AMAZON_ACCOUNT_DAILY_LIMIT}) for ${accountName}.`);
            return;
        }

        notify('success', `Assigned ${updated} entr${updated === 1 ? 'y' : 'ies'} to ${accountName}`);
    };

    const isColVisible = (id) => visibleColumns.includes(id);
    const visibleColumnCount = DAILY_ORDER_ALL_COLUMNS.filter((c) => visibleColumns.includes(c.id)).length;
    const displayedOrders = useMemo(() => sortAffiliateOrders(orders), [orders]);
    const isDailyOrdersLoading = ordersLoading || sellerOptionsLoading;
    const orderSections = buildOrderSections(displayedOrders, showNotYetFirst);
    const exportOrders = orderSections.flatMap((section) => section.orders);
    const exportEligibleOrders = useMemo(() => (
        exportOrders.filter((order) => order.sourcingStatus === 'Not Yet' && hasAffiliateLinks(order))
    ), [exportOrders]);
    const notYetCount = displayedOrders.filter((order) => order.sourcingStatus === 'Not Yet').length;
    const carryOverCount = displayedOrders.filter((order) => order.isCarryOver).length;
    const sellerGroupStats = getSellerGroupStats(displayedOrders);
    const sellerGroupCount = sellerOptions.length;
    const balanceByAccountName = useMemo(() => balances.reduce((acc, row) => {
        acc[row.amazonAccountName] = row;
        return acc;
    }, {}), [balances]);
    const actualSpendRows = useMemo(() => (
        spendOrders.map((order, index) => {
            const balanceRow = balanceByAccountName[order.amazonAccount] || null;
            const paymentType = Number(balanceRow?.addedBalance) > 0 ? 'Gift Card' : 'Credit Card';
            const baseAmount = paymentType === 'Gift Card'
                ? getOrderGiftCardBaseAmount(order)
                : getOrderCreditCardBaseAmount(order);
            const amounts = calculateActualSpend(baseAmount);

            return {
                ...order,
                rowIndex: index + 1,
                paymentType,
                ...amounts,
            };
        })
    ), [balanceByAccountName, spendOrders]);
    const giftCardSpendRows = useMemo(() => actualSpendRows.filter((row) => row.paymentType === 'Gift Card'), [actualSpendRows]);
    const creditCardSpendRows = useMemo(() => actualSpendRows.filter((row) => row.paymentType === 'Credit Card'), [actualSpendRows]);
    const actualSpendSummary = useMemo(() => summarizeActualSpendRows(actualSpendRows), [actualSpendRows]);
    const giftCardSpendSummary = useMemo(() => summarizeActualSpendRows(giftCardSpendRows), [giftCardSpendRows]);
    const creditCardSpendSummary = useMemo(() => summarizeActualSpendRows(creditCardSpendRows), [creditCardSpendRows]);
    const actualSpendByAccount = useMemo(() => summarizeActualSpendByAccount(actualSpendRows), [actualSpendRows]);
    const giftCardSpendByAccount = useMemo(() => summarizeActualSpendByAccount(giftCardSpendRows), [giftCardSpendRows]);
    const creditCardSpendByAccount = useMemo(() => summarizeActualSpendByAccount(creditCardSpendRows), [creditCardSpendRows]);

    const handleOpenExportDialog = () => {
        setSelectedExportColumns(AFFILIATE_EXPORT_COLUMNS.map((column) => column.id));
        setExportDialogOpen(true);
    };

    const handleToggleExportColumn = (columnId) => {
        setSelectedExportColumns((prev) => {
            if (prev.includes(columnId)) {
                return prev.filter((id) => id !== columnId);
            }

            return [...prev, columnId];
        });
    };

    const handleToggleAllExportColumns = () => {
        if (selectedExportColumns.length === AFFILIATE_EXPORT_COLUMNS.length) {
            setSelectedExportColumns([]);
            return;
        }

        setSelectedExportColumns(AFFILIATE_EXPORT_COLUMNS.map((column) => column.id));
    };

    const handleExecuteExport = () => {
        if (exportEligibleOrders.length === 0) {
            notify('warning', 'No Not Yet orders with affiliate links available to export');
            return;
        }

        if (selectedExportColumns.length === 0) {
            notify('warning', 'Select at least one column to export');
            return;
        }

        const rowsWithIndex = exportEligibleOrders.map((order, index) => ({
            ...order,
            exportIndex: index + 1,
        }));

        const exportFieldMap = {
            index: 'exportIndex',
            orderId: 'orderId',
            productName: (order) => order.lineItems?.[0]?.title || order.productName || '',
            seller: (order) => order.sellerGroupName || '',
            supplierLink: 'affiliateLink',
            affiliateLinks: 'affiliateLinks',
            priceUsd: (order) => order.affiliatePrice ?? '',
            amazonAccount: 'amazonAccount',
            arriving: 'arrivingDate',
            beforeTax: 'beforeTax',
            estimatedTax: 'estimatedTax',
            azOrderId: 'azOrderId',
            status: 'sourcingStatus',
            purchaser: 'purchaser',
            messageStatus: 'sourcingMessageStatus',
            messaging: (order) => order.buyer?.username || '',
            notes: 'fulfillmentNotes',
            carryOver: (order) => order.isCarryOver ? (order.carryOverLabel || 'Yes') : 'No',
            sourceDate: (order) => order.sourceDate || '',
        };

        const selectedColumns = AFFILIATE_EXPORT_COLUMNS.filter((column) => selectedExportColumns.includes(column.id));
        const csvFieldMapping = selectedColumns.reduce((acc, column) => {
            const accessor = exportFieldMap[column.id];
            if (accessor) {
                acc[column.label] = accessor;
            }
            return acc;
        }, {});

        const csvData = prepareCSVData(rowsWithIndex, csvFieldMapping);
        downloadCSV(csvData, `Affiliate_Orders_${date}`);
        setExportDialogOpen(false);
        notify('success', `Exported ${rowsWithIndex.length} eligible affiliate orders`);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — Tab 1: Daily Orders
    // ─────────────────────────────────────────────────────────────────────────

    const renderTab1 = () => (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="subtitle2" color="text.secondary">
                        {isDailyOrdersLoading ? 'Loading…' : `${displayedOrders.length} order${displayedOrders.length !== 1 ? 's' : ''} in queue for ${date}`}
                    </Typography>
                    {!isDailyOrdersLoading && carryOverCount > 0 && (
                        <Chip
                            size="small"
                            color="warning"
                            label={`${carryOverCount} carried over`}
                            sx={{ fontWeight: 600 }}
                        />
                    )}
                    {!isDailyOrdersLoading && sellerGroupCount > 0 && (
                        <Chip
                            size="small"
                            variant="outlined"
                            label={`${sellerGroupCount} seller group${sellerGroupCount !== 1 ? 's' : ''}`}
                        />
                    )}
                    {!isDailyOrdersLoading && notYetCount > 0 && (
                        <Chip
                            size="small"
                            color="info"
                            variant="outlined"
                            label={`${notYetCount} not yet`}
                        />
                    )}
                    {!isDailyOrdersLoading && summary?.ordersDone > 0 && (
                        <Chip
                            size="small"
                            variant="outlined"
                            color={showDoneEntries ? 'success' : 'default'}
                            label={showDoneEntries ? `${summary.ordersDone} done shown` : `${summary.ordersDone} done hidden`}
                        />
                    )}
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel id="affiliate-seller-filter-label">Seller</InputLabel>
                        <Select
                            labelId="affiliate-seller-filter-label"
                            value={selectedSeller}
                            label="Seller"
                            onChange={(e) => setSelectedSeller(e.target.value)}
                        >
                            {sellerOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControlLabel
                        control={<Switch size="small" checked={showNotYetFirst} onChange={(e) => setShowNotYetFirst(e.target.checked)} />}
                        label="Not Yet first"
                        sx={{ mr: 0.5, '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={showDoneEntries} onChange={(e) => setShowDoneEntries(e.target.checked)} />}
                        label="Show Done"
                        sx={{ mr: 0.5, '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                    />
                    <Button size="small" variant="outlined" color="success" startIcon={<DownloadIcon />} onClick={handleOpenExportDialog}>
                        CSV
                    </Button>
                    <ColumnSelector
                        allColumns={DAILY_ORDER_ALL_COLUMNS}
                        visibleColumns={visibleColumns}
                        onColumnChange={setVisibleColumns}
                        onReset={() => setVisibleColumns(DEFAULT_DAILY_VISIBLE_COLUMNS)}
                        page="affiliate-orders"
                    />
                    <Button size="small" startIcon={<RefreshIcon />} onClick={fetchSellerOptions}>Refresh</Button>
                </Stack>
            </Stack>

            {ordersError && <Alert severity="error" sx={{ mb: 1 }}>{ordersError}</Alert>}

            {isDailyOrdersLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 1100 }}>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#fce4ec' }}>
                                {DAILY_ORDER_ALL_COLUMNS.filter((c) => visibleColumns.includes(c.id)).map((column) => (
                                    <TableCell key={column.id} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                                        {column.label}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {displayedOrders.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={visibleColumnCount || 1} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                                        No orders found for this date.
                                    </TableCell>
                                </TableRow>
                            )}
                            {orderSections.map((section) => {
                                const sectionSellerGroupStats = getSellerGroupStats(section.orders);

                                return section.orders.map((order, idx) => {
                                    const sellerName = order.sellerGroupName || '—';
                                    const itemId = order.lineItems?.[0]?.legacyItemId || order.itemNumber;
                                    const productTitle = order.lineItems?.[0]?.title || order.productName || '—';
                                    const previousSellerName = idx > 0 ? section.orders[idx - 1].sellerGroupName : null;
                                    const showSellerHeader = idx === 0 || sellerName !== previousSellerName;
                                    const showSectionHeader = idx === 0 && section.label;

                                    return (
                                        <React.Fragment key={`${section.key}-${order._id}`}>
                                            {showSectionHeader && (
                                                <TableRow>
                                                    <TableCell colSpan={visibleColumnCount || 1} sx={{ bgcolor: '#f3f4f6', py: 1 }}>
                                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                                {section.label}
                                                            </Typography>
                                                            <Chip size="small" variant="outlined" label={`${section.orders.length} order${section.orders.length !== 1 ? 's' : ''}`} />
                                                        </Stack>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {showSellerHeader && (
                                                <TableRow>
                                                    <TableCell colSpan={visibleColumnCount || 1} sx={{ bgcolor: '#eef6ff', py: 1.25 }}>
                                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0d47a1' }}>
                                                                {sellerName}
                                                            </Typography>
                                                            <Chip size="small" label={`${sectionSellerGroupStats[sellerName]?.total || 0} order${(sectionSellerGroupStats[sellerName]?.total || 0) !== 1 ? 's' : ''}`} variant="outlined" />
                                                            {(sectionSellerGroupStats[sellerName]?.carryOver || 0) > 0 && (
                                                                <Chip size="small" color="warning" label={`${sectionSellerGroupStats[sellerName].carryOver} carried over`} />
                                                            )}
                                                        </Stack>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            <TableRow hover sx={{ bgcolor: order.isCarryOver ? '#fffdf4' : undefined, '&:nth-of-type(even)': { bgcolor: order.isCarryOver ? '#fff8e1' : '#fafafa' } }}>
                                                {/* # */}
                                                {isColVisible('index') && <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{idx + 1}</TableCell>}

                                                {/* Order ID */}
                                                {isColVisible('orderId') && <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <span>{order.orderId}</span>
                                                        <Tooltip title="Copy">
                                                            <IconButton size="small" onClick={() => { navigator.clipboard.writeText(order.orderId); notify('info', 'Copied'); }}>
                                                                <ContentCopyIcon sx={{ fontSize: 12 }} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Stack>
                                                </TableCell>}

                                                {/* Product Name */}
                                                {isColVisible('productName') && <TableCell sx={{ minWidth: 300, maxWidth: 360 }}>
                                                    <Stack direction="row" spacing={1} alignItems="flex-start">
                                                        {thumbnailImages[order._id] && (
                                                            <Box
                                                                onClick={() => handleViewImages(order)}
                                                                sx={{
                                                                    width: 50,
                                                                    height: 50,
                                                                    cursor: 'pointer',
                                                                    border: '1px solid',
                                                                    borderColor: 'grey.300',
                                                                    borderRadius: 1,
                                                                    overflow: 'hidden',
                                                                    flexShrink: 0,
                                                                    position: 'relative',
                                                                    '&:hover': {
                                                                        borderColor: 'primary.main',
                                                                        boxShadow: 2
                                                                    }
                                                                }}
                                                            >
                                                                <img
                                                                    src={thumbnailImages[order._id]}
                                                                    alt="Product"
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                />
                                                                {itemImages[order._id]?.count > 1 && (
                                                                    <Chip
                                                                        label={`+${itemImages[order._id].count - 1}`}
                                                                        size="small"
                                                                        sx={{
                                                                            position: 'absolute',
                                                                            bottom: 2,
                                                                            right: 2,
                                                                            height: 18,
                                                                            fontSize: '0.65rem',
                                                                            bgcolor: 'rgba(0,0,0,0.7)',
                                                                            color: 'white',
                                                                            '& .MuiChip-label': { px: 0.5 }
                                                                        }}
                                                                    />
                                                                )}
                                                                {loadingImages[order._id] && (
                                                                    <Box
                                                                        sx={{
                                                                            position: 'absolute',
                                                                            inset: 0,
                                                                            bgcolor: 'rgba(255,255,255,0.8)',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center'
                                                                        }}
                                                                    >
                                                                        <CircularProgress size={18} />
                                                                    </Box>
                                                                )}
                                                            </Box>
                                                        )}

                                                        <Box sx={{ minWidth: 0 }}>
                                                            {order.isCarryOver && (
                                                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                                                                    <Chip
                                                                        label={order.carryOverLabel || 'Carry over'}
                                                                        size="small"
                                                                        color="warning"
                                                                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                                                                    />
                                                                    {order.sourceDate && (
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            From {order.sourceDate}
                                                                        </Typography>
                                                                    )}
                                                                </Stack>
                                                            )}
                                                            {itemId ? (
                                                                <Link
                                                                    href={`https://www.ebay.com/itm/${itemId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    underline="hover"
                                                                    sx={{ display: 'inline-flex', alignItems: 'flex-start', gap: 0.5 }}
                                                                >
                                                                    <Typography
                                                                        variant="body2"
                                                                        sx={{
                                                                            fontSize: '0.78rem',
                                                                            fontWeight: 600,
                                                                            color: 'primary.main',
                                                                            display: '-webkit-box',
                                                                            WebkitLineClamp: 2,
                                                                            WebkitBoxOrient: 'vertical',
                                                                            overflow: 'hidden'
                                                                        }}
                                                                    >
                                                                        {productTitle}
                                                                    </Typography>
                                                                    <OpenInNewIcon sx={{ fontSize: 13, mt: 0.2, flexShrink: 0 }} />
                                                                </Link>
                                                            ) : (
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: 600,
                                                                        display: '-webkit-box',
                                                                        WebkitLineClamp: 2,
                                                                        WebkitBoxOrient: 'vertical',
                                                                        overflow: 'hidden'
                                                                    }}
                                                                >
                                                                    {productTitle}
                                                                </Typography>
                                                            )}
                                                            {itemId && (
                                                                <Link
                                                                    href={`https://www.ebay.com/itm/${itemId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    sx={{ display: 'inline-block', mt: 0.25, fontSize: '0.72rem' }}
                                                                >
                                                                    ID: {itemId}
                                                                </Link>
                                                            )}
                                                        </Box>
                                                    </Stack>
                                                </TableCell>}

                                                {/* Seller */}
                                                {isColVisible('seller') && <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{sellerName}</TableCell>}

                                                {/* Supplier Link */}
                                                {isColVisible('supplierLink') && <TableCell sx={{ minWidth: 220 }}>
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <InlineText
                                                            value={order.affiliateLink}
                                                            placeholder="Paste supplier link…"
                                                            onSave={(v) => patchOrder(order._id, 'affiliateLink', v)}
                                                        />
                                                        {order.affiliateLink && (
                                                            <Tooltip title="Open link">
                                                                <IconButton size="small" component="a" href={order.affiliateLink} target="_blank" rel="noopener noreferrer">
                                                                    <OpenInNewIcon sx={{ fontSize: 12 }} />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Stack>
                                                </TableCell>}

                                                {/* Affiliate Links */}
                                                {isColVisible('affiliateLinks') && <TableCell sx={{ minWidth: 220 }}>
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <InlineText
                                                            value={order.affiliateLinks}
                                                            placeholder="Paste affiliate link…"
                                                            onSave={(v) => patchOrder(order._id, 'affiliateLinks', v)}
                                                        />
                                                        {order.affiliateLinks && (
                                                            <Tooltip title="Open link">
                                                                <IconButton size="small" component="a" href={order.affiliateLinks} target="_blank" rel="noopener noreferrer">
                                                                    <OpenInNewIcon sx={{ fontSize: 12 }} />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Stack>
                                                </TableCell>}

                                                {/* Price — editable */}
                                                {isColVisible('priceUsd') && <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                    <BalanceNumberCell
                                                        value={order.affiliatePrice ?? null}
                                                        onSave={(v) => patchOrder(order._id, 'affiliatePrice', v)}
                                                    />
                                                </TableCell>}

                                                {/* Amazon Account */}
                                                {isColVisible('amazonAccount') && <TableCell>
                                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                                        <InlineSelect
                                                            value={order.amazonAccount}
                                                            options={amazonAccounts}
                                                            onChange={(v) => {
                                                                if (v && v !== order.amazonAccount && (amazonAssignedCounts[v] || 0) >= AMAZON_ACCOUNT_DAILY_LIMIT) {
                                                                    notify('error', `Cannot assign more than ${AMAZON_ACCOUNT_DAILY_LIMIT} orders to ${v} in one day`);
                                                                    return;
                                                                }
                                                                patchOrder(order._id, 'amazonAccount', v);
                                                            }}
                                                        />
                                                        <Tooltip title="Assign same account to next entries">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleBulkAssignAmazonAccount(section.orders, idx, order.amazonAccount)}
                                                                    disabled={!order.amazonAccount}
                                                                >
                                                                    <PlaylistAddIcon sx={{ fontSize: 16 }} />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    </Stack>
                                                </TableCell>}

                                                {/* Arriving */}
                                                {isColVisible('arriving') && <TableCell sx={{ minWidth: 130 }}>
                                                    <InlineText
                                                        value={order.arrivingDate}
                                                        placeholder="YYYY-MM-DD"
                                                        onSave={(v) => patchOrder(order._id, 'arrivingDate', v)}
                                                    />
                                                </TableCell>}

                                                {/* Before Tax */}
                                                {isColVisible('beforeTax') && <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                    <BalanceNumberCell
                                                        value={order.beforeTax ?? null}
                                                        onSave={(v) => patchOrder(order._id, 'beforeTax', v)}
                                                    />
                                                </TableCell>}

                                                {/* Estimated Tax */}
                                                {isColVisible('estimatedTax') && <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                    <BalanceNumberCell
                                                        value={order.estimatedTax ?? null}
                                                        onSave={(v) => patchOrder(order._id, 'estimatedTax', v)}
                                                    />
                                                </TableCell>}

                                                {/* Az OrderID */}
                                                {isColVisible('azOrderId') && <TableCell sx={{ minWidth: 150 }}>
                                                    <InlineText
                                                        value={order.azOrderId}
                                                        placeholder="Amazon order ID"
                                                        onSave={(v) => patchOrder(order._id, 'azOrderId', v)}
                                                    />
                                                </TableCell>}

                                                {/* Status */}
                                                {isColVisible('status') && <TableCell>
                                                    <FormControl size="small">
                                                        <Select
                                                            value={order.sourcingStatus || 'Not Yet'}
                                                            onChange={(e) => patchOrder(order._id, 'sourcingStatus', e.target.value)}
                                                            size="small"
                                                            sx={{ minWidth: 130, fontSize: '0.8rem' }}
                                                            renderValue={(v) => (
                                                                <Chip
                                                                    label={v}
                                                                    size="small"
                                                                    color={SOURCING_STATUS_COLORS[v] || 'default'}
                                                                    sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                                                                />
                                                            )}
                                                        >
                                                            {SOURCING_STATUSES.map((s) => (
                                                                <MenuItem key={s} value={s} sx={{ fontSize: '0.8rem' }}>
                                                                    <Chip label={s} size="small" color={SOURCING_STATUS_COLORS[s] || 'default'} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }} />
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </TableCell>}

                                                {/* Purchaser */}
                                                {isColVisible('purchaser') && <TableCell>
                                                    <InlineSelect
                                                        value={order.purchaser}
                                                        options={PURCHASERS}
                                                        onChange={(v) => patchOrder(order._id, 'purchaser', v)}
                                                    />
                                                </TableCell>}

                                                {/* Message Status */}
                                                {isColVisible('messageStatus') && <TableCell>
                                                    <FormControl size="small">
                                                        <Select
                                                            value={order.sourcingMessageStatus || 'Being Processed'}
                                                            onChange={(e) => patchOrder(order._id, 'sourcingMessageStatus', e.target.value)}
                                                            size="small"
                                                            sx={{ minWidth: 160, fontSize: '0.8rem' }}
                                                            renderValue={(v) => (
                                                                <Chip
                                                                    label={v}
                                                                    size="small"
                                                                    sx={{
                                                                        fontWeight: 'bold',
                                                                        fontSize: '0.72rem',
                                                                        bgcolor: MSG_STATUS_COLORS[v] || '#e0e0e0',
                                                                        color: '#fff',
                                                                    }}
                                                                />
                                                            )}
                                                        >
                                                            {MESSAGE_STATUSES.map((s) => (
                                                                <MenuItem key={s} value={s} sx={{ fontSize: '0.8rem' }}>
                                                                    <Chip
                                                                        label={s}
                                                                        size="small"
                                                                        sx={{ bgcolor: MSG_STATUS_COLORS[s] || '#e0e0e0', color: '#fff', fontSize: '0.72rem' }}
                                                                    />
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </TableCell>}

                                                {/* Messaging */}
                                                {isColVisible('messaging') && <TableCell align="center">
                                                    <Tooltip title="Send message to buyer">
                                                        <IconButton
                                                            size="small"
                                                            color="primary"
                                                            onClick={() => handleOpenMessageDialog(order)}
                                                        >
                                                            <ChatIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>}

                                                {/* Notes */}
                                                {isColVisible('notes') && <TableCell sx={{ minWidth: 160 }}>
                                                    <InlineText
                                                        value={order.fulfillmentNotes}
                                                        placeholder="Add note…"
                                                        multiline
                                                        onSave={(v) => patchOrder(order._id, 'fulfillmentNotes', v)}
                                                    />
                                                </TableCell>}
                                            </TableRow>
                                        </React.Fragment>
                                    );
                                });
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — Tab 2: Gift Card Balances
    // ─────────────────────────────────────────────────────────────────────────

    const renderTab2 = () => (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    {balancesLoading ? 'Loading…' : `${balances.length} Amazon account${balances.length !== 1 ? 's' : ''}`}
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={fetchBalances}>Refresh</Button>
            </Stack>

            {balancesError && <Alert severity="error" sx={{ mb: 1 }}>{balancesError}</Alert>}

            {balancesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                {[
                                    'Account Name', 'Total Expense ($)', 'Gift Cards ✓',
                                    'Available Balance ($)', 'Difference ($)', 'Added Balance ($)', 'Note',
                                ].map((h) => (
                                    <TableCell key={h} sx={{ fontWeight: 'bold', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {balances.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                                        No Amazon accounts found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {balances.map((row) => {
                                const diff = (Number(row.availableBalance) || 0) + (Number(row.addedBalance) || 0) - (Number(row.totalExpense) || 0);
                                return (
                                    <TableRow key={row.amazonAccountName} hover sx={{ '&:nth-of-type(even)': { bgcolor: '#f9fbe7' } }}>
                                        {/* Account Name */}
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1565c0' }}>
                                            {row.amazonAccountName}
                                        </TableCell>

                                        {/* Total Expense — read-only, calculated from orders */}
                                        <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500 }}>
                                            {fmt(row.totalExpense)}
                                            {row.orderCount > 0 && (
                                                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                                    ({row.orderCount} order{row.orderCount !== 1 ? 's' : ''})
                                                </Typography>
                                            )}
                                        </TableCell>

                                        {/* Gift Card Status — checkbox */}
                                        <TableCell align="center">
                                            <Checkbox
                                                checked={diff > 0}
                                                disabled
                                                size="small"
                                                color="success"
                                            />
                                        </TableCell>

                                        {/* Available Balance — editable number */}
                                        <TableCell>
                                            <BalanceNumberCell
                                                value={row.availableBalance}
                                                onSave={(v) => patchBalance(row.amazonAccountName, 'availableBalance', v)}
                                            />
                                        </TableCell>

                                        {/* Difference — auto-calculated */}
                                        <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600, color: diff < 0 ? 'error.main' : 'success.dark' }}>
                                            {diff >= 0 ? '+' : ''}{fmt(diff)}
                                        </TableCell>

                                        {/* Added Balance — editable number */}
                                        <TableCell>
                                            <BalanceNumberCell
                                                value={row.addedBalance}
                                                onSave={(v) => patchBalance(row.amazonAccountName, 'addedBalance', v)}
                                            />
                                        </TableCell>

                                        {/* Note */}
                                        <TableCell sx={{ minWidth: 160 }}>
                                            <InlineText
                                                value={row.note}
                                                placeholder="Add note…"
                                                onSave={(v) => patchBalance(row.amazonAccountName, 'note', v)}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — Tab 3: Summary
    // ─────────────────────────────────────────────────────────────────────────

    const renderTab3 = () => (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    Summary for {date}
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={fetchSummary}>Refresh</Button>
            </Stack>

            {summaryError && <Alert severity="error" sx={{ mb: 1 }}>{summaryError}</Alert>}

            {summaryLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : summary ? (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start" flexWrap="wrap">

                    {/* Left: Per-Purchaser */}
                    <Paper variant="outlined" sx={{ p: 2, minWidth: 260 }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                            Assigned Orders by Purchaser
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#fff9c4' }}>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Name</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Assigned</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {summary.byPurchaser.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={2} align="center" sx={{ color: 'text.secondary' }}>No assignments yet</TableCell>
                                    </TableRow>
                                )}
                                {summary.byPurchaser.map((row) => (
                                    <TableRow key={row.name} hover>
                                        <TableCell sx={{ fontSize: '0.82rem', color: '#1565c0', fontWeight: 500 }}>{row.name}</TableCell>
                                        <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{row.count}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>

                    {/* Right: Overall Totals */}
                    <Paper variant="outlined" sx={{ p: 2, minWidth: 320 }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                            Day Totals
                        </Typography>
                        <Table size="small">
                            <TableBody>
                                {[
                                    { label: 'Orders →', value: summary.totalOrders, color: '#e65100' },
                                    { label: 'Total Order Amount (USD) →', value: `$${fmt(summary.totalUSD)}`, color: '#1b5e20' },
                                    { label: 'INR Amount →', value: `₹${fmt(summary.totalINR, 3)}`, color: '#b71c1c' },
                                    { label: 'Total Amount Added →', value: fmt(summary.totalAmountAdded), color: 'text.primary' },
                                    { label: 'Orders Done →', value: summary.ordersDone, color: '#2e7d32' },
                                    { label: 'Orders Not Done →', value: summary.ordersNotDone, color: '#c62828' },
                                ].map(({ label, value, color }) => (
                                    <TableRow key={label}>
                                        <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500, border: 'none', py: 0.5 }}>{label}</TableCell>
                                        <TableCell sx={{ fontSize: '0.88rem', fontWeight: 700, color, border: 'none', py: 0.5 }}>{value}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2, minWidth: 360 }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                            Amazon Account Assignments (Max {summary.maxOrdersPerAmazonAccount || AMAZON_ACCOUNT_DAILY_LIMIT})
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Account</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Assigned Today</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Carry Over</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Remaining</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="center">Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {!summary.byAmazonAccount || summary.byAmazonAccount.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>No account assignments yet</TableCell>
                                    </TableRow>
                                ) : (
                                    summary.byAmazonAccount.map((row) => (
                                        <TableRow key={row.name} hover>
                                            <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.name}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{row.count}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.82rem' }}>{row.carryOverCount || 0}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.82rem' }}>
                                                {row.remaining == null ? '—' : row.remaining}
                                            </TableCell>
                                            <TableCell align="center">
                                                {row.max == null ? (
                                                    <Chip size="small" label="N/A" variant="outlined" />
                                                ) : row.isFull ? (
                                                    <Chip size="small" label="Full" color="error" />
                                                ) : (
                                                    <Chip size="small" label="Available" color="success" variant="outlined" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </Paper>
                </Stack>
            ) : (
                <Typography color="text.secondary">No data available.</Typography>
            )}
        </>
    );

    const renderTab4 = () => (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1, gap: 1, flexWrap: 'wrap' }}>
                <Stack spacing={0.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                        Actual spend view for {date}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Gift Card uses before tax. Credit Card uses before tax + estimated tax. Markup and IGST apply to both.
                    </Typography>
                </Stack>
                <Button size="small" startIcon={<RefreshIcon />} onClick={fetchSpendOrders}>Refresh</Button>
            </Stack>

            {spendOrdersError && <Alert severity="error" sx={{ mb: 1 }}>{spendOrdersError}</Alert>}

            {spendOrdersLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : (
                <>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
                        <Paper variant="outlined" sx={{ p: 2, minWidth: 180, flex: 1 }}>
                            <Typography variant="caption" color="text.secondary">Overall Base Amount</Typography>
                            <Typography variant="h6" fontWeight={700}>${fmt(actualSpendSummary.base)}</Typography>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, minWidth: 180, flex: 1 }}>
                            <Typography variant="caption" color="text.secondary">Markup 3.5%</Typography>
                            <Typography variant="h6" fontWeight={700}>${fmt(actualSpendSummary.markup)}</Typography>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, minWidth: 180, flex: 1 }}>
                            <Typography variant="caption" color="text.secondary">IGST on Markup 18%</Typography>
                            <Typography variant="h6" fontWeight={700}>${fmt(actualSpendSummary.igstOnMarkup)}</Typography>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, minWidth: 220, flex: 1.2, bgcolor: '#f7fbff' }}>
                            <Typography variant="caption" color="text.secondary">Final Actual Spend</Typography>
                            <Typography variant="h5" fontWeight={800} color="primary.main">${fmt(actualSpendSummary.total)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {actualSpendSummary.orderCount} order{actualSpendSummary.orderCount !== 1 ? 's' : ''}
                            </Typography>
                        </Paper>
                    </Stack>

                    <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2} sx={{ mb: 2 }}>
                        <Paper variant="outlined" sx={{ p: 2, flex: 1, bgcolor: '#fff8e1' }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                                Gift Cards
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Orders</Typography>
                                    <Typography variant="h6" fontWeight={700}>{giftCardSpendSummary.orderCount}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Base</Typography>
                                    <Typography variant="h6" fontWeight={700}>${fmt(giftCardSpendSummary.base)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Markup + IGST</Typography>
                                    <Typography variant="h6" fontWeight={700}>${fmt(giftCardSpendSummary.markup + giftCardSpendSummary.igstOnMarkup)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Final</Typography>
                                    <Typography variant="h6" fontWeight={700} color="warning.dark">${fmt(giftCardSpendSummary.total)}</Typography>
                                </Box>
                            </Stack>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2, flex: 1, bgcolor: '#eef7ff' }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                                Credit Cards
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Orders</Typography>
                                    <Typography variant="h6" fontWeight={700}>{creditCardSpendSummary.orderCount}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Base</Typography>
                                    <Typography variant="h6" fontWeight={700}>${fmt(creditCardSpendSummary.base)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Markup + IGST</Typography>
                                    <Typography variant="h6" fontWeight={700}>${fmt(creditCardSpendSummary.markup + creditCardSpendSummary.igstOnMarkup)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Final</Typography>
                                    <Typography variant="h6" fontWeight={700} color="primary.main">${fmt(creditCardSpendSummary.total)}</Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    </Stack>

                    <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2} alignItems="flex-start">
                        <Paper variant="outlined" sx={{ p: 2, minWidth: 320, width: { xs: '100%', xl: 420 } }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                                By Amazon Account
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#e8f1ff' }}>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Account</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Type</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Orders</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Final</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {actualSpendByAccount.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                                                No orders available.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        actualSpendByAccount.map((row) => (
                                            <TableRow key={row.amazonAccount} hover>
                                                <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.amazonAccount}</TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem' }}>
                                                    <Chip
                                                        size="small"
                                                        label={(balanceByAccountName[row.amazonAccount]?.addedBalance || 0) > 0 ? 'Gift Card' : 'Credit Card'}
                                                        color={(balanceByAccountName[row.amazonAccount]?.addedBalance || 0) > 0 ? 'warning' : 'primary'}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontSize: '0.82rem' }}>{row.orderCount}</TableCell>
                                                <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 700 }}>${fmt(row.total)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2, minWidth: 320, width: { xs: '100%', xl: 380 } }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                                Gift Card Accounts
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#fff3cd' }}>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Account</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Orders</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Final</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {giftCardSpendByAccount.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>
                                                No gift card orders.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        giftCardSpendByAccount.map((row) => (
                                            <TableRow key={row.amazonAccount} hover>
                                                <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.amazonAccount}</TableCell>
                                                <TableCell align="right" sx={{ fontSize: '0.82rem' }}>{row.orderCount}</TableCell>
                                                <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 700 }}>${fmt(row.total)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2, minWidth: 320, width: { xs: '100%', xl: 380 } }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                                Credit Card Accounts
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#dceeff' }}>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }}>Account</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Orders</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.78rem' }} align="right">Final</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {creditCardSpendByAccount.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>
                                                No credit card orders.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        creditCardSpendByAccount.map((row) => (
                                            <TableRow key={row.amazonAccount} hover>
                                                <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.amazonAccount}</TableCell>
                                                <TableCell align="right" sx={{ fontSize: '0.82rem' }}>{row.orderCount}</TableCell>
                                                <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 700 }}>${fmt(row.total)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Paper>

                        <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, overflowX: 'auto' }}>
                            <Table size="small" sx={{ minWidth: 980 }}>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#edf7ed' }}>
                                        {['#', 'Order ID', 'Product', 'Seller', 'Amazon Account', 'Type', 'Base Amount', 'Markup 3.5%', 'IGST 18% on Markup', 'Final Actual Spend'].map((label) => (
                                            <TableCell key={label} sx={{ fontWeight: 'bold', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                {label}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {actualSpendRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                                                No orders found for this date.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        actualSpendRows.map((row) => {
                                            const itemId = row.lineItems?.[0]?.legacyItemId || row.itemNumber;
                                            const productTitle = row.lineItems?.[0]?.title || row.productName || '—';

                                            return (
                                                <TableRow key={row._id} hover sx={{ '&:nth-of-type(even)': { bgcolor: '#fafafa' } }}>
                                                    <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{row.rowIndex}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{row.orderId || '—'}</TableCell>
                                                    <TableCell sx={{ minWidth: 260 }}>
                                                        {itemId ? (
                                                            <Link
                                                                href={`https://www.ebay.com/itm/${itemId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                underline="hover"
                                                                sx={{ display: 'inline-flex', alignItems: 'flex-start', gap: 0.5 }}
                                                            >
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: 600,
                                                                        color: 'primary.main',
                                                                        display: '-webkit-box',
                                                                        WebkitLineClamp: 2,
                                                                        WebkitBoxOrient: 'vertical',
                                                                        overflow: 'hidden'
                                                                    }}
                                                                >
                                                                    {productTitle}
                                                                </Typography>
                                                                <OpenInNewIcon sx={{ fontSize: 13, mt: 0.2, flexShrink: 0 }} />
                                                            </Link>
                                                        ) : (
                                                            <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                                                                {productTitle}
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{row.sellerGroupName || '—'}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{row.amazonAccount || '—'}</TableCell>
                                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                        <Chip
                                                            size="small"
                                                            label={row.paymentType}
                                                            color={row.paymentType === 'Gift Card' ? 'warning' : 'primary'}
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>${fmt(row.base)}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>${fmt(row.markup)}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>${fmt(row.igstOnMarkup)}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'success.dark', whiteSpace: 'nowrap' }}>${fmt(row.total)}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                </>
            )}
        </>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <Box sx={{ p: 2 }}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, gap: 2 }}>
                <Typography variant="h5" fontWeight="bold">Affiliate Orders</Typography>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <FormControlLabel
                        control={<Switch checked={excludeLowValue} onChange={(e) => setExcludeLowValue(e.target.checked)} />}
                        label="Exclude < $3"
                        sx={{ m: 0 }}
                    />
                    <TextField
                        type="date"
                        size="small"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        label="Date"
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 170 }}
                    />
                </Stack>
            </Stack>

            {/* Tabs */}
            <Paper variant="outlined" sx={{ mb: 0 }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    textColor="primary"
                    indicatorColor="primary"
                    sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                    <Tab label="Daily Orders" />
                    <Tab label="Gift Card Balances" />
                    <Tab label="Summary" />
                    {isSuperAdmin && <Tab label="Actual Spend" />}
                </Tabs>
            </Paper>

            <Box sx={{ mt: 0 }}>
                <TabPanel value={tab} index={0}>{renderTab1()}</TabPanel>
                <TabPanel value={tab} index={1}>{renderTab2()}</TabPanel>
                <TabPanel value={tab} index={2}>{renderTab3()}</TabPanel>
                {isSuperAdmin && <TabPanel value={tab} index={3}>{renderTab4()}</TabPanel>}
            </Box>

            {/* Snackbar */}
            <Snackbar
                open={snack.open}
                autoHideDuration={2500}
                onClose={() => setSnack((s) => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
                    {snack.msg}
                </Alert>
            </Snackbar>

            <ChatDialog
                open={messageModalOpen}
                onClose={handleCloseMessageDialog}
                order={selectedOrderForMessage}
            />

            <ImageDialog
                open={imageDialogOpen}
                onClose={() => setImageDialogOpen(false)}
                images={selectedImages}
            />

            <Dialog
                open={exportDialogOpen}
                onClose={() => setExportDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Select Columns to Export</Typography>
                        <Button size="small" onClick={handleToggleAllExportColumns}>
                            {selectedExportColumns.length === AFFILIATE_EXPORT_COLUMNS.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 2, maxHeight: 420 }}>
                    <Stack spacing={1}>
                        {AFFILIATE_EXPORT_COLUMNS.map((column) => (
                            <Box key={column.id} sx={{ display: 'flex', alignItems: 'center' }}>
                                <Checkbox
                                    checked={selectedExportColumns.includes(column.id)}
                                    onChange={() => handleToggleExportColumn(column.id)}
                                    size="small"
                                />
                                <Typography variant="body2">{column.label}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setExportDialogOpen(false)} color="inherit">Cancel</Button>
                    <Button
                        onClick={handleExecuteExport}
                        variant="contained"
                        color="primary"
                        startIcon={<DownloadIcon />}
                        disabled={selectedExportColumns.length === 0}
                    >
                        Export CSV
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── Editable Number Cell ─────────────────────────────────────────────────────

function BalanceNumberCell({ value, onSave }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? 0);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!editing) setDraft(value ?? 0);
    }, [value, editing]);

    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const commit = () => {
        setEditing(false);
        const num = parseFloat(draft);
        if (!isNaN(num) && num !== (value ?? 0)) onSave(num);
    };

    if (editing) {
        return (
            <TextField
                inputRef={inputRef}
                value={draft}
                type="number"
                size="small"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value ?? 0); } }}
                sx={{ width: 100, fontSize: '0.8rem' }}
                inputProps={{ step: 'any' }}
            />
        );
    }

    return (
        <Box
            onClick={() => setEditing(true)}
            sx={{
                cursor: 'text',
                minWidth: 80,
                px: 0.5,
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
                fontSize: '0.82rem',
                fontWeight: 500,
            }}
        >
            {value != null ? value : 0}
        </Box>
    );
}
