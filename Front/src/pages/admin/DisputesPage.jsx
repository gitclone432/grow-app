import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Snackbar,
  Tabs,
  Tab,
  Fade,
  TablePagination,
  TableSortLabel,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ClearIcon from '@mui/icons-material/Clear';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PaymentIcon from '@mui/icons-material/Payment';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CancelIcon from '@mui/icons-material/Cancel';
import ListAltIcon from '@mui/icons-material/ListAlt';
import GavelIcon from '@mui/icons-material/Gavel';
import ChatIcon from '@mui/icons-material/Chat';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../lib/api';
import { downloadCSV, prepareCSVData } from '../../utils/csvExport';
import ReturnRequestedPage from './ReturnRequestedPage.jsx';
import ReturnPostOrderPage from './ReturnPostOrderPage.jsx';
import CancelledStatusPage from './CancelledStatusPage.jsx';
import CancellationSearchPage from './CancellationSearchPage.jsx';
import WorksheetPage from './WorksheetPage.jsx';
import InrApiPage from './InrApiPage.jsx';
import ColumnSelector from '../../components/ColumnSelector';
import OrderDetailsModal from '../../components/OrderDetailsModal';
import ChatModal from '../../components/ChatModal';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { dashboardSignatureTokens } from '../../theme/appTheme.js';
import {
  tableHeaderCellSx,
  tableBodyRowSx,
  tableContainerSx,
  yellowFilledButtonSx,
  yellowOutlinedButtonSx,
} from '../../theme/tableStyles.js';


function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

// LogsCell component for editable logs field with save functionality
function LogsCell({ value, onSave, id }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleSave = async () => {
    if (localValue === (value || '')) return; // No changes
    setSaving(true);
    try {
      await onSave(id, localValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save logs:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <TextField
      size="small"
      multiline
      maxRows={3}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      disabled={saving}
      placeholder="Add logs..."
      sx={{
        minWidth: 120,
        '& .MuiInputBase-input': { fontSize: '0.75rem' },
        '& .MuiOutlinedInput-root': {
          backgroundColor: saved ? '#e8f5e9' : 'transparent',
          transition: 'background-color 0.3s'
        }
      }}
    />
  );
}

export default function DisputesPage({ initialTab = 0 }) {
  const [tabValue, setTabValue] = useState(initialTab);
  useEffect(() => {
    setTabValue(initialTab);
  }, [initialTab]);
  
  // INR Cases state
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesFetching, setCasesFetching] = useState(false);
  
  // Payment Disputes state
  const [disputes, setDisputes] = useState([]);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputesFetching, setDisputesFetching] = useState(false);
  
  // Shared state
  const [sellers, setSellers] = useState([]);
  const [error, setError] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  
  // INR Filters
  const [inrStatusFilter, setInrStatusFilter] = useState('');
  const [inrSellerFilter, setInrSellerFilter] = useState('');
  const [inrTypeFilter, setInrTypeFilter] = useState('');
  
  // Payment Dispute Filters
  const [pdStatusFilter, setPdStatusFilter] = useState('');
  const [pdSellerFilter, setPdSellerFilter] = useState('');

  const [pdReasonFilter, setPdReasonFilter] = useState('');

  // Column Selectors
  const ALL_INR_COLUMNS = [
    { id: 'caseId', label: 'Case ID' },
    { id: 'orderId', label: 'Order ID' },
    { id: 'type', label: 'Type' },
    { id: 'seller', label: 'Seller' },
    { id: 'buyer', label: 'Buyer' },
    { id: 'item', label: 'Item' },
    { id: 'status', label: 'Status' },
    { id: 'claimAmount', label: 'Claim Amount' },
    { id: 'created', label: 'Created (PST)' },
    { id: 'responseDue', label: 'Response Due (PST)' },
    { id: 'logs', label: 'Logs' },
    { id: 'action', label: 'Action' },
  ];
  const [inrVisibleColumns, setInrVisibleColumns] = useState(ALL_INR_COLUMNS.map(c => c.id));

  const ALL_DISPUTE_COLUMNS = [
    { id: 'disputeId', label: 'Dispute ID' },
    { id: 'reason', label: 'Reason' },
    { id: 'seller', label: 'Seller' },
    { id: 'buyer', label: 'Buyer' },
    { id: 'amount', label: 'Amount' },
    { id: 'status', label: 'Status' },
    { id: 'created', label: 'Created (PST)' },
    { id: 'responseDue', label: 'Response Due (PST)' },
    { id: 'note', label: 'Note' },
    { id: 'logs', label: 'Logs' },
    { id: 'action', label: 'Action' },
  ];
  const [disputeVisibleColumns, setDisputeVisibleColumns] = useState(ALL_DISPUTE_COLUMNS.map(c => c.id));
  
  // Selected items for chat and order details modal
  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  
  // Date Filter
  const [dateFilter, setDateFilter] = useState({
    mode: 'all',
    single: '',
    from: '',
    to: ''
  });

  const ROWS_PER_PAGE = 25;
  const [inrPage, setInrPage] = useState(0);
  const [pdPage, setPdPage] = useState(0);
  const [inrSortBy, setInrSortBy] = useState('');
  const [inrSortDir, setInrSortDir] = useState('asc');
  
  const hasFetchedCases = useRef(false);
  const hasFetchedDisputes = useRef(false);

  // Fetch sellers on mount
  useEffect(() => {
    async function fetchSellers() {
      try {
        const res = await api.get('/sellers/all');
        setSellers(res.data || []);
      } catch (e) {
        console.error('Failed to fetch sellers:', e);
      }
    }
    fetchSellers();
  }, []);

  // Load INR cases when filters change
  useEffect(() => {
    if (!hasFetchedCases.current) {
      hasFetchedCases.current = true;
      loadStoredCases();
      return;
    }
    loadStoredCases();
  }, [inrStatusFilter, inrSellerFilter, inrTypeFilter, dateFilter]);

  // Load Payment Disputes when filters change
  useEffect(() => {
    if (!hasFetchedDisputes.current) {
      hasFetchedDisputes.current = true;
      loadStoredDisputes();
      return;
    }
    loadStoredDisputes();
  }, [pdStatusFilter, pdSellerFilter, pdReasonFilter, dateFilter]);

  // Reset table page when filters change
  useEffect(() => {
    setInrPage(0);
  }, [inrStatusFilter, inrSellerFilter, inrTypeFilter, dateFilter]);

  useEffect(() => {
    setPdPage(0);
  }, [pdStatusFilter, pdSellerFilter, pdReasonFilter, dateFilter]);

  async function loadStoredCases() {
    setCasesLoading(true);
    setError('');
    try {
      const params = {};
      if (inrStatusFilter) params.status = inrStatusFilter;
      if (inrSellerFilter) params.sellerId = inrSellerFilter;
      if (inrTypeFilter) params.caseType = inrTypeFilter;
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }
      // mode 'all' = no date params, shows all cases
      
      const res = await api.get('/ebay/stored-inr-cases', { params });
      const caseData = res.data.cases || [];
      console.log(`Loaded ${caseData.length} INR cases from database`);
      setCases(caseData);
    } catch (e) {
      console.error('Failed to load INR cases:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setCasesLoading(false);
    }
  }

  async function loadStoredDisputes() {
    setDisputesLoading(true);
    setError('');
    try {
      const params = {};
      if (pdStatusFilter) params.status = pdStatusFilter;
      if (pdSellerFilter) params.sellerId = pdSellerFilter;
      if (pdReasonFilter) params.reason = pdReasonFilter;
      if (dateFilter.mode === 'single' && dateFilter.single) {
        params.startDate = dateFilter.single;
        params.endDate = dateFilter.single;
      } else if (dateFilter.mode === 'range') {
        if (dateFilter.from) params.startDate = dateFilter.from;
        if (dateFilter.to) params.endDate = dateFilter.to;
      }
      // mode 'all' = no date params, shows all disputes
      
      const res = await api.get('/ebay/stored-payment-disputes', { params });
      const disputeData = res.data.disputes || [];
      console.log(`Loaded ${disputeData.length} payment disputes from database`);
      setDisputes(disputeData);
    } catch (e) {
      console.error('Failed to load payment disputes:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setDisputesLoading(false);
    }
  }

  async function fetchCasesFromEbay() {
    setCasesFetching(true);
    setError('');
    try {
      const res = await api.post('/ebay/fetch-inr-cases');
      const { totalNewCases, totalUpdatedCases, results, errors } = res.data;
      
      let msgParts = [];
      let updateDetailsParts = [];
      
      if (results && results.length > 0) {
        results.forEach(r => {
          if (r.newCases > 0 || r.updatedCases > 0) {
            let parts = [];
            if (r.newCases > 0) parts.push(`${r.newCases} new`);
            if (r.updatedCases > 0) parts.push(`${r.updatedCases} updated`);
            msgParts.push(`${r.sellerName}: ${parts.join(', ')}`);
            
            if (r.updateDetails && r.updateDetails.length > 0) {
              r.updateDetails.forEach(ud => {
                let changeDesc = [];
                if (ud.changes?.status) {
                  changeDesc.push(`Status: ${ud.changes.status.from} → ${ud.changes.status.to}`);
                }
                if (changeDesc.length > 0) {
                  updateDetailsParts.push(`• ${r.sellerName} | Case ${ud.caseId} | Order ${ud.orderId}: ${changeDesc.join(', ')}`);
                }
              });
            }
          }
        });
      }
      
      let finalMsg = '';
      if (msgParts.length > 0) {
        finalMsg = `✅ INR Cases: ${msgParts.join(' | ')}`;
        if (updateDetailsParts.length > 0) {
          finalMsg += `\n\n📝 Updates:\n${updateDetailsParts.join('\n')}`;
        }
      } else if (totalNewCases === 0 && totalUpdatedCases === 0) {
        finalMsg = '✅ No new or updated INR cases found';
      } else {
        finalMsg = `✅ ${totalNewCases} new, ${totalUpdatedCases} updated INR cases`;
      }
      
      setSnackbarMsg(finalMsg);
      setSnackbarOpen(true);
      
      if (errors && errors.length > 0) {
        setError(`⚠️ Errors: ${errors.join(', ')}`);
      }
      
      await loadStoredCases();
    } catch (e) {
      console.error('Failed to fetch INR cases:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setCasesFetching(false);
    }
  }

  async function fetchDisputesFromEbay() {
    setDisputesFetching(true);
    setError('');
    try {
      const res = await api.post('/ebay/fetch-payment-disputes');
      const { totalNewDisputes, totalUpdatedDisputes, results, errors } = res.data;
      
      let msgParts = [];
      let updateDetailsParts = [];
      
      if (results && results.length > 0) {
        results.forEach(r => {
          if (r.newDisputes > 0 || r.updatedDisputes > 0) {
            let parts = [];
            if (r.newDisputes > 0) parts.push(`${r.newDisputes} new`);
            if (r.updatedDisputes > 0) parts.push(`${r.updatedDisputes} updated`);
            msgParts.push(`${r.sellerName}: ${parts.join(', ')}`);
            
            if (r.updateDetails && r.updateDetails.length > 0) {
              r.updateDetails.forEach(ud => {
                let changeDesc = [];
                if (ud.changes?.status) {
                  changeDesc.push(`Status: ${ud.changes.status.from} → ${ud.changes.status.to}`);
                }
                if (changeDesc.length > 0) {
                  updateDetailsParts.push(`• ${r.sellerName} | Dispute ${ud.paymentDisputeId} | Order ${ud.orderId}: ${changeDesc.join(', ')}`);
                }
              });
            }
          }
        });
      }
      
      let finalMsg = '';
      if (msgParts.length > 0) {
        finalMsg = `✅ Payment Disputes: ${msgParts.join(' | ')}`;
        if (updateDetailsParts.length > 0) {
          finalMsg += `\n\n📝 Updates:\n${updateDetailsParts.join('\n')}`;
        }
      } else if (totalNewDisputes === 0 && totalUpdatedDisputes === 0) {
        finalMsg = '✅ No new or updated payment disputes found';
      } else {
        finalMsg = `✅ ${totalNewDisputes} new, ${totalUpdatedDisputes} updated payment disputes`;
      }
      
      setSnackbarMsg(finalMsg);
      setSnackbarOpen(true);
      
      if (errors && errors.length > 0) {
        setError(`⚠️ Errors: ${errors.join(', ')}`);
      }
      
      await loadStoredDisputes();
    } catch (e) {
      console.error('Failed to fetch payment disputes:', e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setDisputesFetching(false);
    }
  }

  const handleClearInrFilters = () => {
    setInrStatusFilter('');
    setInrSellerFilter('');
    setInrTypeFilter('');
  };

  const handleClearPdFilters = () => {
    setPdStatusFilter('');
    setPdSellerFilter('');
    setPdReasonFilter('');
  };

  const handleCopy = (text) => {
    const val = text || '-';
    if (val === '-') return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
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
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  const getCaseStatusColor = (status) => {
    if (!status) return 'default';
    const s = status.toUpperCase();
    // Seller action needed — distinct warm tones
    if (s === 'OPEN') return 'error';
    if (s === 'WAITING_FOR_SELLER' || s === 'WAITING_SELLER_RESPONSE') return 'warning';
    // Waiting on buyer / review — cool blue
    if (s === 'WAITING_BUYER_RESPONSE' || s === 'ON_HOLD' || s === 'UNDER_REVIEW') return 'info';
    // Closed outcomes — green / grey
    if (s === 'CLOSED' || s === 'CS_CLOSED') return 'success';
    if (s === 'CLOSED_WITH_ESCALATION') return 'default';
    return 'default';
  };

  const getDisputeStatusColor = (status) => {
    if (!status) return 'default';
    const s = status.toUpperCase();
    if (s === 'OPEN') return 'error';
    if (s === 'WAITING_FOR_SELLER_RESPONSE' || s === 'ACTION_NEEDED') return 'warning';
    if (s === 'UNDER_REVIEW') return 'info';
    if (s === 'RESOLVED_SELLER_FAVOUR' || s === 'CLOSED') return 'success';
    if (s === 'RESOLVED_BUYER_FAVOUR') return 'error';
    return 'default';
  };

  const getCaseTypeColor = (type) => {
    if (!type) return 'default';
    if (type === 'INR') return 'primary';
    if (type === 'SNAD') return 'secondary';
    return 'default';
  };

  // Check if response due date is within next 2 days (urgent)
  const isResponseUrgent = (responseDate) => {
    if (!responseDate) return false;
    const now = new Date();
    const dueDate = new Date(responseDate);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return dueDate <= twoDaysFromNow && dueDate >= now;
  };

  // Check if response due date has already passed
  const isResponseOverdue = (responseDate) => {
    if (!responseDate) return false;
    return new Date(responseDate) < new Date();
  };

  const hasActiveInrFilters = inrStatusFilter || inrSellerFilter || inrTypeFilter;
  const hasActivePdFilters = pdStatusFilter || pdSellerFilter || pdReasonFilter;

  const handleInrSort = (field) => {
    if (inrSortBy === field) {
      setInrSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setInrSortBy(field);
      setInrSortDir('asc');
    }
    setInrPage(0);
  };

  // Compute filtered INR cases
  const filteredCases = cases.filter(c => {
    if (inrSellerFilter && c.seller?._id !== inrSellerFilter) return false;
    if (inrStatusFilter && c.status !== inrStatusFilter) return false;
    if (inrTypeFilter && c.caseType !== inrTypeFilter) return false;
    
    // Date filter
    if (dateFilter.mode !== 'all') {
      const caseDate = c.creationDate ? new Date(c.creationDate) : null;
      if (!caseDate) return false;
      
      if (dateFilter.mode === 'single' && dateFilter.single) {
        const filterDate = new Date(dateFilter.single);
        // Compare only the date portion
        if (caseDate.toDateString() !== filterDate.toDateString()) return false;
      }
      
      if (dateFilter.mode === 'range') {
        if (dateFilter.from) {
          const fromDate = new Date(dateFilter.from);
          fromDate.setHours(0, 0, 0, 0);
          if (caseDate < fromDate) return false;
        }
        if (dateFilter.to) {
          const toDate = new Date(dateFilter.to);
          toDate.setHours(23, 59, 59, 999);
          if (caseDate > toDate) return false;
        }
      }
    }
    
    return true;
  });

  const sortedCases = !inrSortBy
    ? filteredCases
    : [...filteredCases].sort((a, b) => {
        const dir = inrSortDir === 'asc' ? 1 : -1;
        if (inrSortBy === 'status') {
          const aVal = (a.status || '').toUpperCase();
          const bVal = (b.status || '').toUpperCase();
          return dir * aVal.localeCompare(bVal);
        }
        return 0;
      });

  const paginatedCases = sortedCases.slice(
    inrPage * ROWS_PER_PAGE,
    inrPage * ROWS_PER_PAGE + ROWS_PER_PAGE
  );

  // Compute filtered payment disputes
  const filteredDisputes = disputes.filter(d => {
    if (pdSellerFilter && d.seller?._id !== pdSellerFilter) return false;
    if (pdStatusFilter && d.paymentDisputeStatus !== pdStatusFilter) return false;
    if (pdReasonFilter && d.buyerProvidedReason !== pdReasonFilter) return false;
    
    // Date filter
    if (dateFilter.mode !== 'all') {
      const disputeDate = d.openDate ? new Date(d.openDate) : null;
      if (!disputeDate) return false;
      
      if (dateFilter.mode === 'single' && dateFilter.single) {
        const filterDate = new Date(dateFilter.single);
        if (disputeDate.toDateString() !== filterDate.toDateString()) return false;
      }
      
      if (dateFilter.mode === 'range') {
        if (dateFilter.from) {
          const fromDate = new Date(dateFilter.from);
          fromDate.setHours(0, 0, 0, 0);
          if (disputeDate < fromDate) return false;
        }
        if (dateFilter.to) {
          const toDate = new Date(dateFilter.to);
          toDate.setHours(23, 59, 59, 999);
          if (disputeDate > toDate) return false;
        }
      }
    }
    
    return true;
  });

  const paginatedDisputes = filteredDisputes.slice(
    pdPage * ROWS_PER_PAGE,
    pdPage * ROWS_PER_PAGE + ROWS_PER_PAGE
  );

  // CSV Export Handlers
  const handleExportINRCases = () => {
    const csvData = prepareCSVData(filteredCases, {
      'Case ID': 'caseId',
      'Order ID': 'orderId',
      'Type': 'caseType',
      'Seller': (c) => c.seller?.user?.username || '',
      'Buyer': 'buyerUsername',
      'Item': 'itemTitle',
      'Status': 'status',
      'Claim Amount': (c) => c.claimAmount?.value ? `${c.claimAmount.currency || 'USD'} ${c.claimAmount.value}` : '',
      'Created Date': (c) => formatDate(c.creationDate),
      'Response Due': (c) => formatDate(c.sellerResponseDueDate),
      'Logs': 'logs',
    });
    downloadCSV(csvData, 'INR_Cases');
  };

  const handleExportPaymentDisputes = () => {
    const csvData = prepareCSVData(filteredDisputes, {
      'Dispute ID': 'paymentDisputeId',
      'Order ID': 'orderId',
      'Seller': (d) => d.seller?.user?.username || '',
      'Buyer': 'buyerUsername',
      'Reason': 'buyerProvidedReason',
      'Status': 'paymentDisputeStatus',
      'Opened Date': (d) => formatDate(d.openDate),
      'Response Due': (d) => formatDate(d.respondByDate),
      'Note': 'note',
    });
    downloadCSV(csvData, 'Payment_Disputes');
  };

  // Handler for saving case logs
  const handleSaveCaseLogs = async (caseId, logs) => {
    try {
      await api.patch(`/ebay/cases/${caseId}/logs`, { logs });
      // Update local state
      setCases(prevCases =>
        prevCases.map(c =>
          c.caseId === caseId ? { ...c, logs } : c
        )
      );
    } catch (err) {
      console.error('Failed to save case logs:', err);
      throw err;
    }
  };

  // Handler for saving dispute notes
  const handleSaveDisputeNote = async (disputeId, note) => {
    try {
      await api.patch(`/ebay/disputes/${disputeId}/note`, { note });
      // Update local state
      setDisputes(prevDisputes =>
        prevDisputes.map(d =>
          d.paymentDisputeId === disputeId ? { ...d, note } : d
        )
      );
    } catch (err) {
      console.error('Failed to save dispute note:', err);
      throw err;
    }
  };

  return (
    <Fade in timeout={500}>
      <AdminPageShell>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Snackbar
          open={snackbarOpen}
          autoHideDuration={10000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbarOpen(false)}
            severity="success"
            sx={{ whiteSpace: 'pre-line', maxWidth: 600 }}
          >
            {snackbarMsg}
          </Alert>
        </Snackbar>

        <SectionCard
          sx={{
            p: { xs: 1.25, md: 1.5 },
            mb: 1.5,
            background: dashboardSignatureTokens.surfaces.pageCard,
          }}
        >
          <PageHeader
            title="Issues and Resolutions"
            sx={{ pt: 0, pb: 1 }}
            actions={
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 110 }}>
                  <InputLabel>Date</InputLabel>
                  <Select
                    value={dateFilter.mode}
                    onChange={(e) => setDateFilter({ ...dateFilter, mode: e.target.value })}
                    label="Date"
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="single">Single Date</MenuItem>
                    <MenuItem value="range">Date Range</MenuItem>
                  </Select>
                </FormControl>
                {dateFilter.mode === 'single' && (
                  <TextField
                    type="date"
                    size="small"
                    value={dateFilter.single}
                    onChange={(e) => setDateFilter({ ...dateFilter, single: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                  />
                )}
                {dateFilter.mode === 'range' && (
                  <>
                    <TextField
                      type="date"
                      size="small"
                      value={dateFilter.from}
                      onChange={(e) => setDateFilter({ ...dateFilter, from: e.target.value })}
                      label="From"
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      type="date"
                      size="small"
                      value={dateFilter.to}
                      onChange={(e) => setDateFilter({ ...dateFilter, to: e.target.value })}
                      label="To"
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 150 }}
                    />
                  </>
                )}
              </Stack>
            }
          />

          <Tabs
            value={tabValue}
            onChange={(e, newValue) => setTabValue(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 36,
              mx: { xs: -1.25, md: -1.5 },
              px: { xs: 1.25, md: 1.5 },
              borderTop: '1px solid',
              borderColor: 'divider',
              '& .MuiTabs-indicator': { height: 2 },
              '& .MuiTab-root': {
                minHeight: 36,
                py: 0.5,
                px: 1.25,
                fontSize: '0.78rem',
                textTransform: 'none',
                minWidth: 'auto',
              },
            }}
          >
            <Tab
              icon={<LocalShippingIcon sx={{ fontSize: 16 }} />}
              label={`INR Cases (${cases.length})`}
              iconPosition="start"
            />
            <Tab
              icon={<PaymentIcon sx={{ fontSize: 16 }} />}
              label={`Payment Disputes (${disputes.length})`}
              iconPosition="start"
            />
            <Tab
              icon={<AssignmentReturnIcon sx={{ fontSize: 16 }} />}
              label="Return API"
              iconPosition="start"
            />
            {/* <Tab
              icon={<AssignmentReturnIcon sx={{ fontSize: 16 }} />}
              label="Return Search"
              iconPosition="start"
            /> */}
            <Tab
              icon={<CancelIcon sx={{ fontSize: 16 }} />}
              label="Cancelled Status"
              iconPosition="start"
            />
            <Tab
              icon={<CancelIcon sx={{ fontSize: 16 }} />}
              label="Cancellation Search"
              iconPosition="start"
            />
            <Tab
              icon={<ListAltIcon sx={{ fontSize: 16 }} />}
              label="Worksheet"
              iconPosition="start"
            />
            <Tab
              icon={<GavelIcon sx={{ fontSize: 16 }} />}
              label="INR API"
              iconPosition="start"
            />
          </Tabs>
        </SectionCard>

      {/* INR Cases Tab */}
      <TabPanel value={tabValue} index={0}>
        <Stack
          direction="row"
          spacing={1}
          mb={1.5}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tooltip title="Polls INR/SNAD cases from the last 30 days via eBay's Post-Order API">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  sx={yellowFilledButtonSx}
                  startIcon={casesFetching ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                  onClick={fetchCasesFromEbay}
                  disabled={casesFetching}
                >
                  {casesFetching ? 'Fetching...' : 'Fetch from eBay'}
                </Button>
              </span>
            </Tooltip>

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Seller</InputLabel>
              <Select
                value={inrSellerFilter}
                onChange={(e) => setInrSellerFilter(e.target.value)}
                label="Seller"
              >
                <MenuItem value="">All Sellers</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={inrStatusFilter}
                onChange={(e) => setInrStatusFilter(e.target.value)}
                label="Status"
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="OPEN">Open</MenuItem>
                <MenuItem value="WAITING_SELLER_RESPONSE">Waiting for Seller</MenuItem>
                <MenuItem value="WAITING_BUYER_RESPONSE">Waiting for Buyer</MenuItem>
                <MenuItem value="ON_HOLD">On Hold</MenuItem>
                <MenuItem value="CLOSED">Closed</MenuItem>
                <MenuItem value="CS_CLOSED">Closed by eBay Support</MenuItem>
                <MenuItem value="CLOSED_WITH_ESCALATION">Closed with Escalation</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Case Type</InputLabel>
              <Select
                value={inrTypeFilter}
                onChange={(e) => setInrTypeFilter(e.target.value)}
                label="Case Type"
              >
                <MenuItem value="">All Types</MenuItem>
                <MenuItem value="INR">INR</MenuItem>
                <MenuItem value="SNAD">SNAD</MenuItem>
                <MenuItem value="OTHER">Other</MenuItem>
              </Select>
            </FormControl>

            {hasActiveInrFilters && (
              <Button size="small" startIcon={<ClearIcon />} onClick={handleClearInrFilters} color="inherit">
                Clear
              </Button>
            )}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              sx={yellowOutlinedButtonSx}
              startIcon={<DownloadIcon />}
              onClick={handleExportINRCases}
              disabled={filteredCases.length === 0}
            >
              CSV ({filteredCases.length})
            </Button>
            <ColumnSelector
              allColumns={ALL_INR_COLUMNS}
              visibleColumns={inrVisibleColumns}
              onColumnChange={setInrVisibleColumns}
              onReset={() => setInrVisibleColumns(ALL_INR_COLUMNS.map(c => c.id))}
              page="disputes-inr"
            />
          </Stack>
        </Stack>

        {/* INR Cases Table */}
        {casesLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer
            sx={{
              ...tableContainerSx,
              maxWidth: '100%',
              overflowX: 'auto',
              '&::-webkit-scrollbar': {
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#f1f1f1',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: '#555',
                },
              },
            }}
          >
            <Table size="small" sx={{ minWidth: 1200 }} stickyHeader>
              <TableHead>
                <TableRow>
            {inrVisibleColumns.includes('caseId') && <TableCell sx={tableHeaderCellSx}>Case ID</TableCell>}
            {inrVisibleColumns.includes('orderId') && <TableCell sx={tableHeaderCellSx}>Order ID</TableCell>}
            {inrVisibleColumns.includes('type') && <TableCell sx={tableHeaderCellSx}>Type</TableCell>}
            {inrVisibleColumns.includes('seller') && <TableCell sx={tableHeaderCellSx}>Seller</TableCell>}
            {inrVisibleColumns.includes('buyer') && <TableCell sx={tableHeaderCellSx}>Buyer</TableCell>}
            {inrVisibleColumns.includes('item') && <TableCell sx={tableHeaderCellSx}>Item</TableCell>}
            {inrVisibleColumns.includes('status') && (
              <TableCell sx={tableHeaderCellSx} sortDirection={inrSortBy === 'status' ? inrSortDir : false}>
                <TableSortLabel
                  active={inrSortBy === 'status'}
                  direction={inrSortBy === 'status' ? inrSortDir : 'asc'}
                  onClick={() => handleInrSort('status')}
                >
                  Status
                </TableSortLabel>
              </TableCell>
            )}
            {inrVisibleColumns.includes('claimAmount') && <TableCell sx={tableHeaderCellSx}>Claim Amount</TableCell>}
            {inrVisibleColumns.includes('created') && <TableCell sx={tableHeaderCellSx}>Created (PST)</TableCell>}
            {inrVisibleColumns.includes('responseDue') && <TableCell sx={tableHeaderCellSx}>Response Due (PST)</TableCell>}
            {inrVisibleColumns.includes('logs') && <TableCell sx={tableHeaderCellSx}>Logs</TableCell>}
            {inrVisibleColumns.includes('action') && <TableCell align="center" sx={tableHeaderCellSx}>Action</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} align="center">
                      <Typography variant="body2" color="text.secondary" py={2}>
                        No INR cases found. Click "Fetch INR Cases from eBay" to load data.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCases.map((c) => (
                    <TableRow key={c._id} hover sx={tableBodyRowSx}>
                      {inrVisibleColumns.includes('caseId') && <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {c.caseId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(c.caseId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>}
                      {inrVisibleColumns.includes('orderId') && <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {c.orderId || '-'}
                          </Typography>
                          {c.orderId ? (
                            <IconButton size="small" onClick={() => handleCopy(c.orderId)}>
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          ) : null}
                        </Stack>
                      </TableCell>}
                      {inrVisibleColumns.includes('type') && <TableCell>
                        <Chip 
                          label={c.caseType || 'INR'} 
                          color={getCaseTypeColor(c.caseType)}
                          size="small"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </TableCell>}
                      {inrVisibleColumns.includes('seller') && <TableCell>
                        <Typography variant="body2">{c.seller?.user?.username || '-'}</Typography>
                      </TableCell>}
                      {inrVisibleColumns.includes('buyer') && <TableCell>
                        <Typography variant="body2">{c.buyerUsername || '-'}</Typography>
                      </TableCell>}
                      {inrVisibleColumns.includes('item') && <TableCell>
                        <Tooltip title={c.itemTitle || 'N/A'}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              maxWidth: 150, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {c.itemTitle || c.itemId || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>}
                      {inrVisibleColumns.includes('status') && <TableCell>
                        <Chip 
                          label={c.status || 'Unknown'} 
                          color={getCaseStatusColor(c.status)}
                          size="small"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </TableCell>}
                      {inrVisibleColumns.includes('claimAmount') && <TableCell>
                        <Typography variant="body2">
                          {c.claimAmount?.value 
                            ? `${c.claimAmount.currency || 'USD'} ${c.claimAmount.value}` 
                            : '-'}
                        </Typography>
                      </TableCell>}
                      {inrVisibleColumns.includes('created') && <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {formatDate(c.creationDate)}
                        </Typography>
                      </TableCell>}
                      {inrVisibleColumns.includes('responseDue') && <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography 
                            variant="body2" 
                            fontSize="0.75rem"
                            color={c.status !== 'CLOSED' && isResponseUrgent(c.sellerResponseDueDate) ? 'error' : 'inherit'}
                            fontWeight={c.status !== 'CLOSED' && isResponseUrgent(c.sellerResponseDueDate) ? 'bold' : 'normal'}
                          >
                            {formatDate(c.sellerResponseDueDate)}
                          </Typography>
                          {/* Only show urgent badge if case is NOT closed */}
                          {c.status !== 'CLOSED' && !isResponseOverdue(c.sellerResponseDueDate) && isResponseUrgent(c.sellerResponseDueDate) && (
                            <Chip 
                              label="URGENT" 
                              color="error" 
                              size="small" 
                              sx={{ fontSize: '0.6rem', height: 18 }} 
                            />
                          )}
                        </Stack>
                      </TableCell>}
                      {inrVisibleColumns.includes('logs') && <TableCell>
                        <LogsCell
                          value={c.logs}
                          id={c.caseId}
                          onSave={handleSaveCaseLogs}
                        />
                      </TableCell>}
                      {inrVisibleColumns.includes('action') && <TableCell align="center">
                        <Tooltip title="Open conversation">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ChatIcon fontSize="small" />}
                            onClick={() => setSelectedCase(c)}
                            sx={{ ...yellowOutlinedButtonSx, minHeight: 32, px: 1.25, fontSize: '0.75rem' }}
                          >
                            Open
                          </Button>
                        </Tooltip>
                      </TableCell>}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!casesLoading && filteredCases.length > 0 && (
          <TablePagination
            component="div"
            count={filteredCases.length}
            page={inrPage}
            onPageChange={(_, nextPage) => setInrPage(nextPage)}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            onRowsPerPageChange={() => {}}
            sx={{ mt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}
          />
        )}
      </TabPanel>

      {/* Payment Disputes Tab */}
      <TabPanel value={tabValue} index={1}>
        <Stack
          direction="row"
          spacing={1}
          mb={1.5}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tooltip title="Polls payment disputes via eBay's Fulfillment API">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  sx={yellowFilledButtonSx}
                  startIcon={disputesFetching ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                  onClick={fetchDisputesFromEbay}
                  disabled={disputesFetching}
                >
                  {disputesFetching ? 'Fetching...' : 'Fetch from eBay'}
                </Button>
              </span>
            </Tooltip>

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Seller</InputLabel>
              <Select
                value={pdSellerFilter}
                onChange={(e) => setPdSellerFilter(e.target.value)}
                label="Seller"
              >
                <MenuItem value="">All Sellers</MenuItem>
                {sellers.map((s) => (
                  <MenuItem key={s._id} value={s._id}>
                    {s.user?.username || s._id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={pdStatusFilter}
                onChange={(e) => setPdStatusFilter(e.target.value)}
                label="Status"
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="OPEN">Open</MenuItem>
                <MenuItem value="WAITING_FOR_SELLER_RESPONSE">Waiting for Seller Response</MenuItem>
                <MenuItem value="UNDER_REVIEW">Under Review</MenuItem>
                <MenuItem value="RESOLVED_BUYER_FAVOUR">Resolved - Buyer Favour</MenuItem>
                <MenuItem value="RESOLVED_SELLER_FAVOUR">Resolved - Seller Favour</MenuItem>
                <MenuItem value="CLOSED">Closed</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Reason</InputLabel>
              <Select
                value={pdReasonFilter}
                onChange={(e) => setPdReasonFilter(e.target.value)}
                label="Reason"
              >
                <MenuItem value="">All Reasons</MenuItem>
                <MenuItem value="ITEM_NOT_RECEIVED">Item Not Received</MenuItem>
                <MenuItem value="UNAUTHORIZED_PAYMENT">Unauthorized Payment</MenuItem>
                <MenuItem value="ITEM_NOT_AS_DESCRIBED">Item Not as Described</MenuItem>
                <MenuItem value="DUPLICATE_CHARGE">Duplicate Charge</MenuItem>
                <MenuItem value="MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED">Not as Described</MenuItem>
                <MenuItem value="MERCHANDISE_OR_SERVICE_NOT_RECEIVED">Not Received</MenuItem>
              </Select>
            </FormControl>

            {hasActivePdFilters && (
              <Button size="small" startIcon={<ClearIcon />} onClick={handleClearPdFilters} color="inherit">
                Clear
              </Button>
            )}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              sx={yellowOutlinedButtonSx}
              startIcon={<DownloadIcon />}
              onClick={handleExportPaymentDisputes}
              disabled={filteredDisputes.length === 0}
            >
              CSV ({filteredDisputes.length})
            </Button>
            <ColumnSelector
              allColumns={ALL_DISPUTE_COLUMNS}
              visibleColumns={disputeVisibleColumns}
              onColumnChange={setDisputeVisibleColumns}
              onReset={() => setDisputeVisibleColumns(ALL_DISPUTE_COLUMNS.map(c => c.id))}
              page="disputes-pd"
            />
          </Stack>
        </Stack>

        {/* Payment Disputes Table */}
        {disputesLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer
            sx={{
              ...tableContainerSx,
              maxWidth: '100%',
              overflowX: 'auto',
              '&::-webkit-scrollbar': {
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#f1f1f1',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: '#555',
                },
              },
            }}
          >
            <Table size="small" sx={{ minWidth: 1200 }} stickyHeader>
              <TableHead>
                <TableRow>
                  {disputeVisibleColumns.includes('disputeId') && <TableCell sx={tableHeaderCellSx}>Dispute ID</TableCell>}
                  {disputeVisibleColumns.includes('orderId') && <TableCell sx={tableHeaderCellSx}>Order ID</TableCell>}
                  {disputeVisibleColumns.includes('seller') && <TableCell sx={tableHeaderCellSx}>Seller</TableCell>}
                  {disputeVisibleColumns.includes('buyer') && <TableCell sx={tableHeaderCellSx}>Buyer</TableCell>}
                  {disputeVisibleColumns.includes('reason') && <TableCell sx={tableHeaderCellSx}>Reason</TableCell>}
                  {disputeVisibleColumns.includes('status') && <TableCell sx={tableHeaderCellSx}>Status</TableCell>}
                  {disputeVisibleColumns.includes('amount') && <TableCell sx={tableHeaderCellSx}>Amount</TableCell>}
                  {disputeVisibleColumns.includes('openedDate') && <TableCell sx={tableHeaderCellSx}>Open Date (PST)</TableCell>}
                  {disputeVisibleColumns.includes('responseDue') && <TableCell sx={tableHeaderCellSx}>Respond By (PST)</TableCell>}
                  {disputeVisibleColumns.includes('note') && <TableCell sx={tableHeaderCellSx}>Note</TableCell>}
                  {disputeVisibleColumns.includes('outcome') && <TableCell sx={tableHeaderCellSx}>Resolution</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDisputes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center">
                      <Typography variant="body2" color="text.secondary" py={2}>
                        No payment disputes found. Click "Fetch Payment Disputes from eBay" to load data.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDisputes.map((d) => (
                    <TableRow key={d._id} hover sx={tableBodyRowSx}>
                      {disputeVisibleColumns.includes('disputeId') && <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {d.paymentDisputeId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(d.paymentDisputeId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>}
                      {disputeVisibleColumns.includes('orderId') && <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {d.orderId || '-'}
                          </Typography>
                          <IconButton size="small" onClick={() => handleCopy(d.orderId)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </TableCell>}
                      {disputeVisibleColumns.includes('seller') && <TableCell>
                        <Typography variant="body2">{d.seller?.user?.username || '-'}</Typography>
                      </TableCell>}
                      {disputeVisibleColumns.includes('buyer') && <TableCell>
                        <Typography variant="body2">{d.buyerUsername || '-'}</Typography>
                      </TableCell>}
                      {disputeVisibleColumns.includes('reason') && <TableCell>
                        <Tooltip title={d.reason || 'N/A'}>
                          <Typography 
                            variant="body2" 
                            fontSize="0.7rem"
                            sx={{ 
                              maxWidth: 120, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {d.reason?.replace(/_/g, ' ') || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>}
                      {disputeVisibleColumns.includes('status') && <TableCell>
                        <Chip 
                          label={d.paymentDisputeStatus?.replace(/_/g, ' ') || 'Unknown'} 
                          color={getDisputeStatusColor(d.paymentDisputeStatus)}
                          size="small"
                          sx={{ fontSize: '0.65rem' }}
                        />
                      </TableCell>}
                      {disputeVisibleColumns.includes('amount') && <TableCell>
                        <Typography variant="body2">
                          {d.amount?.value 
                            ? `${d.amount.currency || 'USD'} ${d.amount.value}` 
                            : '-'}
                        </Typography>
                      </TableCell>}
                      {disputeVisibleColumns.includes('openedDate') && <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {formatDate(d.openDate)}
                        </Typography>
                      </TableCell>}
                      {disputeVisibleColumns.includes('responseDue') && <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography 
                            variant="body2" 
                            fontSize="0.75rem"
                            color={isResponseOverdue(d.respondByDate) ? 'error' : 'inherit'}
                            fontWeight={isResponseOverdue(d.respondByDate) || isResponseUrgent(d.respondByDate) ? 'bold' : 'normal'}
                          >
                            {formatDate(d.respondByDate)}
                          </Typography>
                          {isResponseOverdue(d.respondByDate) && (
                            <Chip 
                              label="OVERDUE" 
                              color="error" 
                              size="small" 
                              sx={{ fontSize: '0.6rem', height: 18 }} 
                            />
                          )}
                          {!isResponseOverdue(d.respondByDate) && isResponseUrgent(d.respondByDate) && (
                            <Chip 
                              label="URGENT" 
                              color="warning" 
                              size="small" 
                              sx={{ fontSize: '0.6rem', height: 18 }} 
                            />
                          )}
                        </Stack>
                      </TableCell>}
                      {disputeVisibleColumns.includes('note') && <TableCell>
                        <LogsCell
                          value={d.note}
                          id={d.paymentDisputeId}
                          onSave={handleSaveDisputeNote}
                        />
                      </TableCell>}
                      {disputeVisibleColumns.includes('outcome') && <TableCell>
                        <Typography variant="body2" fontSize="0.75rem">
                          {d.resolution || d.sellerProtectionDecision || '-'}
                        </Typography>
                      </TableCell>}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!disputesLoading && filteredDisputes.length > 0 && (
          <TablePagination
            component="div"
            count={filteredDisputes.length}
            page={pdPage}
            onPageChange={(_, nextPage) => setPdPage(nextPage)}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            onRowsPerPageChange={() => {}}
            sx={{ mt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}
          />
        )}
      </TabPanel>

      {/* Return API Tab (search + detail + tracking + files) */}
      <TabPanel value={tabValue} index={2}>
        <ReturnPostOrderPage dateFilter={dateFilter} hideDateFilter embedded />
      </TabPanel>

      {/* Return Search Tab (ops / worksheet) - TEMPORARILY DISABLED */}
      {/* <TabPanel value={tabValue} index={3}>
        <ReturnRequestedPage dateFilter={dateFilter} hideDateFilter embedded />
      </TabPanel> */}

      {/* Cancelled Status Tab */}
      <TabPanel value={tabValue} index={3}>
        <CancelledStatusPage dateFilter={dateFilter} hideDateFilter embedded />
      </TabPanel>

      {/* Cancellation Search (Post-Order API) Tab */}
      <TabPanel value={tabValue} index={4}>
        <CancellationSearchPage dateFilter={dateFilter} hideDateFilter embedded />
      </TabPanel>

      {/* Worksheet Tab */}
      <TabPanel value={tabValue} index={5}>
        <WorksheetPage dateFilter={dateFilter} hideDateFilter embedded />
      </TabPanel>

      {/* INR API Tab (Post-Order inquiry + casemanagement) */}
      <TabPanel value={tabValue} index={6}>
        <InrApiPage dateFilter={dateFilter} hideDateFilter embedded />
      </TabPanel>

      {/* Manage Case dialog for INR Cases */}
      {selectedCase && (
        <ChatModal
          open={Boolean(selectedCase)}
          onClose={() => setSelectedCase(null)}
          orderId={selectedCase.orderId}
          buyerUsername={selectedCase.buyerUsername}
          buyerName={selectedCase.buyerName || selectedCase.buyerFullName || ''}
          itemId={selectedCase.itemId}
          itemTitle={selectedCase.itemTitle || ''}
          sellerId={selectedCase.seller?._id || selectedCase.seller || null}
          sellerName={selectedCase.seller?.user?.username || ''}
          title="Manage Case"
          category={selectedCase.caseType || 'INR'}
          caseStatus={selectedCase.status || 'Open'}
          entityId={selectedCase.caseId || selectedCase._id}
          entityType="inr"
        />
      )}

      {/* Manage Case dialog for Payment Disputes */}
      {selectedDispute && (
        <ChatModal
          open={Boolean(selectedDispute)}
          onClose={() => setSelectedDispute(null)}
          orderId={selectedDispute.orderId}
          buyerUsername={selectedDispute.buyerUsername}
          buyerName={selectedDispute.buyerName || selectedDispute.buyerFullName || ''}
          sellerId={selectedDispute.seller?._id || selectedDispute.seller || null}
          sellerName={selectedDispute.seller?.user?.username || ''}
          title="Manage Case"
          category="Payment Dispute"
          caseStatus={selectedDispute.paymentDisputeStatus || 'Open'}
          entityId={selectedDispute.paymentDisputeId || selectedDispute._id}
          entityType="payment_dispute"
        />
      )}

      {/* Order Details Modal */}
      {selectedOrderId && (
        <OrderDetailsModal
          open={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          orderId={selectedOrderId}
        />
      )}
      </AdminPageShell>
    </Fade>
  );
}
