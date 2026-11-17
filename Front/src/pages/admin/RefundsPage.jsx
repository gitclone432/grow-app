import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';
import ResolutionOptionsModal from '../../components/ResolutionOptionsModal';
import RemarkTemplateManagerModal from '../../components/RemarkTemplateManagerModal';
import {
  fillRemarkTemplate,
  findRemarkTemplateText,
  loadRemarkTemplates,
  remarkOptionsFromTemplates,
  saveRemarkTemplates,
} from '../../constants/remarkTemplates';
import { sortSellersByName } from '../../lib/sellersSort.js';

const PAGE_SIZE = 50;
const MANAGE_VALUE = '__manage__';
const REFUND_ADD_FEATURE_ID = 'refunds.addFromFulfillment';

const EBAY_GROUP_SX = { backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold', textAlign: 'center' };
const AMAZON_GROUP_SX = { backgroundColor: '#e65100', color: 'white', fontWeight: 'bold', textAlign: 'center' };
const EBAY_HEADER_SX = { backgroundColor: '#1976d2', color: 'white', fontWeight: 'bold', whiteSpace: 'nowrap' };
const AMAZON_HEADER_SX = { backgroundColor: '#f57c00', color: 'white', fontWeight: 'bold', whiteSpace: 'nowrap' };

function formatDateSold(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// The refund date is a calendar day with no time, stored as UTC midnight.
function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

// Text / amount / date input that saves when the user leaves the field.
const InlineField = React.memo(function InlineField({
  value, onSave, type = 'text', multiline = false, placeholder = '', minWidth = 120,
}) {
  const [local, setLocal] = useState(value ?? '');

  useEffect(() => {
    setLocal(value ?? '');
  }, [value]);

  const commit = () => {
    const current = value ?? '';
    if (String(local) === String(current)) return;
    onSave(local);
  };

  return (
    <TextField
      size="small"
      type={type}
      value={local}
      placeholder={placeholder}
      multiline={multiline}
      maxRows={4}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) e.target.blur();
      }}
      inputProps={type === 'number' ? { min: 0, step: '0.01' } : undefined}
      sx={{ minWidth, '& input, & textarea': { fontSize: '0.85rem', py: 0.5 } }}
    />
  );
});

const OptionSelect = React.memo(function OptionSelect({ value, options, onSave, onManage, manageLabel }) {
  // A saved value can be renamed or deleted later; keep it selectable so it still displays.
  const names = useMemo(() => {
    const list = options.map((o) => o.name);
    return value && !list.includes(value) ? [...list, value] : list;
  }, [options, value]);

  return (
    <Select
      value={value || ''}
      displayEmpty
      size="small"
      onChange={(e) => {
        if (e.target.value === MANAGE_VALUE) {
          onManage();
          return;
        }
        onSave(e.target.value);
      }}
      sx={{ minWidth: 140, height: 32, fontSize: '0.85rem', backgroundColor: '#fff', '& .MuiSelect-select': { py: 0.5, px: 1 } }}
    >
      <MenuItem value="">
        <em style={{ color: '#aaa' }}>- Select -</em>
      </MenuItem>
      {names.map((name) => (
        <MenuItem key={name} value={name}>{name}</MenuItem>
      ))}
      <MenuItem value={MANAGE_VALUE} sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5 }}>
        {manageLabel}
      </MenuItem>
    </Select>
  );
});

function RefundTable({ type, sellers, statusOptions, onManageStatus, notify, remarkTemplates, onManageTemplates }) {
  const [remarkDialog, setRemarkDialog] = useState(null); // { entry, remark, message }
  const [csvDialog, setCsvDialog] = useState({ open: false, mode: 'single', from: '', to: '', busy: false, error: '' });
  const [remarkBusy, setRemarkBusy] = useState(false);
  const remarkOptions = useMemo(() => remarkOptionsFromTemplates(remarkTemplates), [remarkTemplates]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [sellerFilter, setSellerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [dateMode, setDateMode] = useState('all'); // 'all' | 'single' | 'range'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterValues, setFilterValues] = useState({ marketplaces: [], categories: [], reasons: [] });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);

  // A single day is sent as a range with the same start and end.
  const dateParams = useMemo(() => {
    if (dateMode === 'single') return dateFrom ? { dateFrom, dateTo: dateFrom } : {};
    if (dateMode === 'range') {
      return {
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      };
    }
    return {};
  }, [dateMode, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [sellerFilter, statusFilter, categoryFilter, reasonFilter, marketplaceFilter, dateParams, search]);

  useEffect(() => {
    api.get('/refunds/filter-values', { params: { type } })
      .then(({ data }) => setFilterValues({
        marketplaces: data.marketplaces || [],
        categories: data.categories || [],
        reasons: data.reasons || [],
      }))
      .catch(() => {});
  }, [type, reloadKey]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    api
      .get('/refunds', {
        params: {
          type,
          page,
          limit: PAGE_SIZE,
          ...(sellerFilter ? { sellerId: sellerFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(categoryFilter ? { category: categoryFilter } : {}),
          ...(reasonFilter ? { reason: reasonFilter } : {}),
          ...(marketplaceFilter ? { marketplace: marketplaceFilter } : {}),
          ...dateParams,
          ...(search ? { search } : {}),
        },
      })
      .then(({ data }) => {
        if (requestId !== requestRef.current) return;
        setEntries(data.entries || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalEntries(data.pagination?.totalEntries || 0);
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        setError(err?.response?.data?.error || 'Failed to load refunds');
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [type, page, sellerFilter, statusFilter, categoryFilter, reasonFilter, marketplaceFilter, dateParams, search, reloadKey]);

  const saveField = useCallback(async (entry, fields) => {
    try {
      const { data } = await api.patch(`/refunds/${entry._id}`, fields);
      setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, ...data } : e)));
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to save');
      // Re-sync so the field shows the stored value again.
      setReloadKey((k) => k + 1);
    }
  }, [notify]);

  const updateRemark = useCallback(async (entry, remark, messageSent) => {
    await api.patch(`/ebay/orders/${entry.orderMongoId}/manual-fields`, {
      remark: remark || null,
      remarkMessageSent: messageSent,
    });
    setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, category: remark || '' } : e)));
  }, []);

  // Picking a remark with a template opens a preview so the message can be edited before it is sent.
  const handleRemarkSelect = useCallback(async (entry, remark) => {
    const templateText = findRemarkTemplateText(remarkTemplates, remark);
    if (remark && templateText && entry.orderInfo) {
      setRemarkDialog({ entry, remark, message: fillRemarkTemplate(templateText, entry.orderInfo, remark) });
      return;
    }
    try {
      await updateRemark(entry, remark, false);
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to update remark');
    }
  }, [remarkTemplates, updateRemark, notify]);

  const closeRemarkDialog = () => {
    if (!remarkBusy) setRemarkDialog(null);
  };

  const submitRemark = async (sendMessage) => {
    const { entry, remark, message } = remarkDialog;
    const info = entry.orderInfo || {};
    setRemarkBusy(true);
    try {
      await updateRemark(entry, remark, sendMessage);
      if (sendMessage) {
        await api.post('/ebay/send-message', {
          orderId: info.orderId || entry.orderId,
          buyerUsername: info.buyer?.username || 'eBay Buyer',
          itemId: info.itemNumber || info.lineItems?.[0]?.legacyItemId,
          sellerId: info.sellerId || entry.seller?._id,
          conversationId: null,
          body: message,
          mediaUrls: [],
        });
        notify('success', `Remark updated to "${remark}" and message sent to buyer`);
      } else {
        notify('info', `Remark updated to "${remark}" (message not sent)`);
      }
      setRemarkDialog(null);
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to update remark or send message');
    } finally {
      setRemarkBusy(false);
    }
  };

  const removeEntry = useCallback(async (entry) => {
    if (!window.confirm(`Remove order ${entry.orderId || ''} from the ${type === 'inr' ? 'INR' : 'Return'} refund list?`)) return;
    try {
      await api.delete(`/refunds/${entry._id}`);
      notify('success', 'Removed from refund list');
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to remove');
    }
  }, [notify, type]);

  const openCsvDialog = () => {
    setCsvDialog({
      open: true,
      mode: dateMode === 'range' ? 'range' : 'single',
      from: dateFrom,
      to: dateMode === 'range' ? dateTo : '',
      busy: false,
      error: '',
    });
  };

  // Exports every matching refund (all pages) for the chosen date(s), honouring the other filters.
  const downloadCsv = async () => {
    const { mode, from, to } = csvDialog;
    if (!from || (mode === 'range' && !to)) {
      setCsvDialog((prev) => ({ ...prev, error: mode === 'range' ? 'Pick both From and To dates' : 'Pick a date' }));
      return;
    }
    setCsvDialog((prev) => ({ ...prev, busy: true, error: '' }));
    try {
      const all = [];
      let currentPage = 1;
      let pages = 1;
      do {
        const { data } = await api.get('/refunds', {
          params: {
            type,
            page: currentPage,
            limit: 200,
            ...(sellerFilter ? { sellerId: sellerFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(categoryFilter ? { category: categoryFilter } : {}),
            ...(reasonFilter ? { reason: reasonFilter } : {}),
            ...(marketplaceFilter ? { marketplace: marketplaceFilter } : {}),
            ...(search ? { search } : {}),
            dateFrom: from,
            dateTo: mode === 'range' ? to : from,
          },
        });
        all.push(...(data.entries || []));
        pages = data.pagination?.totalPages || 1;
        currentPage += 1;
      } while (currentPage <= pages);

      if (!all.length) {
        setCsvDialog((prev) => ({ ...prev, busy: false, error: 'No refunds found for these dates' }));
        return;
      }

      const rows = prepareCSVData(all, {
        'Date of Sold': (e) => formatDateSold(e.dateSold),
        'Order ID': 'orderId',
        Seller: (e) => e.seller?.user?.username || '',
        Marketplace: (e) => e.marketplace?.replace('EBAY_', '') || '',
        'Refund Date': (e) => toDateInputValue(e.refundDate),
        'Refund Amt': (e) => e.refundAmount ?? '',
        Status: 'status',
        Remark: 'category',
        Reason: 'reason',
        Notes: 'notes',
        'Amazon Acc': 'amazonAccount',
        'Amazon Order ID': 'azOrderId',
        'Amazon Refund Amount': (e) => e.amazonRefundAmount ?? '',
        'Amazon Notes': 'amazonNotes',
      });
      downloadCSV(rows, `Refunds_${type === 'inr' ? 'INR' : 'Return'}_${from}${mode === 'range' ? `_to_${to}` : ''}`);
      setCsvDialog((prev) => ({ ...prev, open: false, busy: false }));
    } catch (err) {
      setCsvDialog((prev) => ({ ...prev, busy: false, error: err?.response?.data?.error || 'Failed to download CSV' }));
    }
  };

  const clearFilters = () => {
    setSellerFilter('');
    setStatusFilter('');
    setCategoryFilter('');
    setReasonFilter('');
    setMarketplaceFilter('');
    setDateMode('all');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
  };

  const filterSelect = (label, value, onChange, items, minWidth = 150) => (
    <FormControl size="small" sx={{ minWidth }}>
      <InputLabel>{label}</InputLabel>
      <Select value={value} label={label} onChange={(e) => onChange(e.target.value)}>
        <MenuItem value="">All</MenuItem>
        {items.map((item) => (
          <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  const asItems = (list) => list.map((v) => ({ value: v, label: v }));

  return (
    <Box>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 2 }} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Date of Sold</InputLabel>
          <Select value={dateMode} label="Date of Sold" onChange={(e) => { setDateMode(e.target.value); setDateFrom(''); setDateTo(''); }}>
            <MenuItem value="all">All dates</MenuItem>
            <MenuItem value="single">Single date</MenuItem>
            <MenuItem value="range">Date range</MenuItem>
          </Select>
        </FormControl>
        {dateMode !== 'all' && (
          <TextField
            size="small"
            type="date"
            label={dateMode === 'range' ? 'From' : 'Date'}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        )}
        {dateMode === 'range' && (
          <TextField
            size="small"
            type="date"
            label="To"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: dateFrom || undefined }}
          />
        )}
        {filterSelect('Seller', sellerFilter, setSellerFilter, sellers.map((s) => ({
          value: s._id,
          label: s.user?.username || s.user?.email || s._id,
        })), 170)}
        {filterSelect('Marketplace', marketplaceFilter, setMarketplaceFilter,
          filterValues.marketplaces.map((m) => ({ value: m, label: m.replace('EBAY_', '') })), 140)}
        {filterSelect('Status', statusFilter, setStatusFilter, asItems(statusOptions.map((o) => o.name)), 150)}
        {filterSelect('Remark', categoryFilter, setCategoryFilter, asItems(filterValues.categories), 150)}
        {filterSelect('Reason', reasonFilter, setReasonFilter, asItems(filterValues.reasons), 150)}
        <TextField
          size="small"
          label="Search Order ID"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ minWidth: 190 }}
        />
        <Button size="small" onClick={clearFilters}>Clear filters</Button>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          Refresh
        </Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={openCsvDialog}>
          Download CSV
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ ml: { md: 'auto' } }}>
          {totalEntries} {totalEntries === 1 ? 'order' : 'orders'}
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: '70vh', overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell colSpan={11} sx={EBAY_GROUP_SX}>eBay</TableCell>
              <TableCell colSpan={4} sx={AMAZON_GROUP_SX}>Amazon</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={EBAY_HEADER_SX}>Date of Sold</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Order ID</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Seller</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Marketplace</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Refund Date</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Refund Amt</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Status</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Remark</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Reason</TableCell>
              <TableCell sx={EBAY_HEADER_SX}>Notes</TableCell>
              <TableCell sx={EBAY_HEADER_SX} />
              <TableCell sx={AMAZON_HEADER_SX}>Amazon Acc</TableCell>
              <TableCell sx={AMAZON_HEADER_SX}>Amazon Order ID</TableCell>
              <TableCell sx={AMAZON_HEADER_SX}>Refund Amount</TableCell>
              <TableCell sx={AMAZON_HEADER_SX}>Amazon Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={15} align="center"><CircularProgress size={28} /></TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                    No orders yet. Use the Refund button on the Fulfillment dashboard to add orders here.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry._id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateSold(entry.dateSold)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.orderId || '-'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.seller?.user?.username || '-'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.marketplace?.replace('EBAY_', '') || '-'}</TableCell>
                  <TableCell>
                    <InlineField
                      type="date"
                      value={toDateInputValue(entry.refundDate)}
                      onSave={(val) => saveField(entry, { refundDate: val || null })}
                      minWidth={150}
                    />
                  </TableCell>
                  <TableCell>
                    <InlineField
                      type="number"
                      value={entry.refundAmount ?? ''}
                      placeholder="0.00"
                      onSave={(val) => saveField(entry, { refundAmount: val === '' ? null : val })}
                      minWidth={110}
                    />
                  </TableCell>
                  <TableCell>
                    <OptionSelect
                      value={entry.status}
                      options={statusOptions}
                      onSave={(val) => saveField(entry, { status: val })}
                      onManage={onManageStatus}
                      manageLabel="Manage Status"
                    />
                  </TableCell>
                  <TableCell>
                    <OptionSelect
                      value={entry.category}
                      options={remarkOptions}
                      onSave={(val) => handleRemarkSelect(entry, val)}
                      onManage={onManageTemplates}
                      manageLabel="Manage Templates"
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>{entry.reason || '-'}</TableCell>
                  <TableCell>
                    <InlineField
                      value={entry.notes}
                      placeholder="Notes"
                      multiline
                      minWidth={200}
                      onSave={(val) => saveField(entry, { notes: val })}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Remove from refund list">
                      <IconButton size="small" color="error" onClick={() => removeEntry(entry)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.amazonAccount || '-'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.azOrderId || '-'}</TableCell>
                  <TableCell>
                    <InlineField
                      type="number"
                      value={entry.amazonRefundAmount ?? ''}
                      placeholder="0.00"
                      onSave={(val) => saveField(entry, { amazonRefundAmount: val === '' ? null : val })}
                      minWidth={110}
                    />
                  </TableCell>
                  <TableCell>
                    <InlineField
                      value={entry.amazonNotes}
                      placeholder="Amazon notes"
                      multiline
                      minWidth={200}
                      onSave={(val) => saveField(entry, { amazonNotes: val })}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination count={totalPages} page={page} onChange={(_e, value) => setPage(value)} color="primary" />
        </Box>
      )}

      <Dialog open={csvDialog.open} onClose={() => !csvDialog.busy && setCsvDialog((p) => ({ ...p, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle>Download CSV (by date sold)</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small">
              <InputLabel>Date option</InputLabel>
              <Select
                value={csvDialog.mode}
                label="Date option"
                onChange={(e) => setCsvDialog((p) => ({ ...p, mode: e.target.value, to: '', error: '' }))}
              >
                <MenuItem value="single">Single date</MenuItem>
                <MenuItem value="range">Date range</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="date"
              label={csvDialog.mode === 'range' ? 'From' : 'Date'}
              value={csvDialog.from}
              onChange={(e) => setCsvDialog((p) => ({ ...p, from: e.target.value, error: '' }))}
              InputLabelProps={{ shrink: true }}
            />
            {csvDialog.mode === 'range' && (
              <TextField
                size="small"
                type="date"
                label="To"
                value={csvDialog.to}
                onChange={(e) => setCsvDialog((p) => ({ ...p, to: e.target.value, error: '' }))}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: csvDialog.from || undefined }}
              />
            )}
            {csvDialog.error && <Alert severity="warning">{csvDialog.error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCsvDialog((p) => ({ ...p, open: false }))} disabled={csvDialog.busy}>Cancel</Button>
          <Button
            variant="contained"
            onClick={downloadCsv}
            disabled={csvDialog.busy}
            startIcon={csvDialog.busy ? <CircularProgress size={18} /> : <DownloadIcon />}
          >
            {csvDialog.busy ? 'Preparing...' : 'Download'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(remarkDialog)} onClose={closeRemarkDialog} maxWidth="md" fullWidth>
        <DialogTitle>Send Message to Buyer - Edit & Preview</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              You're updating the remark to <strong>"{remarkDialog?.remark}"</strong>
            </Alert>
            <TextField
              fullWidth
              multiline
              minRows={6}
              maxRows={12}
              value={remarkDialog?.message || ''}
              onChange={(e) => setRemarkDialog((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="Enter your message to the buyer..."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeRemarkDialog} disabled={remarkBusy} color="inherit">Cancel</Button>
          <Button onClick={() => submitRemark(false)} disabled={remarkBusy} color="inherit">Just Update Remark</Button>
          <Button
            variant="contained"
            onClick={() => submitRemark(true)}
            disabled={remarkBusy || !remarkDialog?.message?.trim()}
            startIcon={remarkBusy ? <CircularProgress size={20} /> : null}
          >
            {remarkBusy ? 'Sending...' : 'Send Message & Update Remark'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function RefundsPage() {
  const isSuperAdmin = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}').role === 'superadmin';
    } catch {
      return false;
    }
  }, []);

  const [tab, setTab] = useState(0);
  const [sellers, setSellers] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [manageStatusOpen, setManageStatusOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [accessOpen, setAccessOpen] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [allowedUsers, setAllowedUsers] = useState([]);

  const loadStatusOptions = useCallback(async () => {
    try {
      const { data } = await api.get('/refunds/options/status');
      setStatusOptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load status options', err);
    }
  }, []);

  useEffect(() => {
    api.get('/sellers/all')
      .then((res) => setSellers(sortSellersByName(res.data || [])))
      .catch(() => setSellers([]));
    loadStatusOptions();
  }, [loadStatusOptions]);

  const notify = useCallback((severity, message) => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const [remarkTemplates, setRemarkTemplates] = useState([]);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  useEffect(() => {
    loadRemarkTemplates().then(setRemarkTemplates);
  }, []);

  const handleSaveTemplates = async (nextTemplates) => {
    try {
      setRemarkTemplates(await saveRemarkTemplates(nextTemplates));
      notify('success', 'Remark templates saved');
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to save remark templates');
    }
  };

  const openAccessDialog = async () => {
    setAccessOpen(true);
    setAccessLoading(true);
    try {
      const [{ data: users }, { data: permission }] = await Promise.all([
        api.get('/users'),
        api.get(`/feature-permissions/${REFUND_ADD_FEATURE_ID}`),
      ]);
      setAllUsers(users || []);
      setAllowedUsers(permission?.allowedUserIds || []);
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to load access settings');
      setAccessOpen(false);
    } finally {
      setAccessLoading(false);
    }
  };

  const saveAccess = async () => {
    setAccessSaving(true);
    try {
      const { data } = await api.put(`/feature-permissions/${REFUND_ADD_FEATURE_ID}`, {
        allowedUserIds: allowedUsers.map((u) => u._id),
      });
      setAllowedUsers(data?.allowedUserIds || []);
      notify('success', 'Access list updated');
      setAccessOpen(false);
    } catch (err) {
      notify('error', err?.response?.data?.error || 'Failed to save access settings');
    } finally {
      setAccessSaving(false);
    }
  };

  const refundType = tab === 0 ? 'return' : 'inr';

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Refunds</Typography>
        {isSuperAdmin && (
          <Button variant="outlined" size="small" onClick={openAccessDialog}>
            Manage Refund Button Access
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Return" />
        <Tab label="INR" />
      </Tabs>

      <RefundTable
        key={refundType}
        type={refundType}
        sellers={sellers}
        statusOptions={statusOptions}
        onManageStatus={() => setManageStatusOpen(true)}
        notify={notify}
        remarkTemplates={remarkTemplates}
        onManageTemplates={() => setManageTemplatesOpen(true)}
      />

      <RemarkTemplateManagerModal
        open={manageTemplatesOpen}
        onClose={() => setManageTemplatesOpen(false)}
        templates={remarkTemplates}
        onSaveTemplates={handleSaveTemplates}
      />

      <ResolutionOptionsModal
        open={manageStatusOpen}
        onClose={() => setManageStatusOpen(false)}
        options={statusOptions}
        onReload={loadStatusOptions}
        endpoint="/refunds/options/status"
        title="Manage Status Options"
      />

      <Dialog open={accessOpen} onClose={() => setAccessOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Refund Button Access</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Superadmins always have access. Select who else sees the Refund (Return / INR) button on the Fulfillment dashboard.
            </Typography>
            {accessLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">Loading...</Typography>
              </Stack>
            ) : (
              <Autocomplete
                multiple
                options={allUsers}
                value={allowedUsers}
                onChange={(_e, value) => setAllowedUsers(value)}
                getOptionLabel={(option) => (option?.username ? `${option.username} (${option.role})` : '')}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                renderInput={(params) => <TextField {...params} label="Allowed users" placeholder="Select users" />}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccessOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveAccess} disabled={accessSaving || accessLoading}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
