import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Search as SearchIcon, Save as SaveIcon } from '@mui/icons-material';
import api from '../../lib/api.js';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import { yellowFilledButtonSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: 'Amazon.com (US)' },
  { value: 'UK', label: 'Amazon.co.uk (UK)' },
  { value: 'CA', label: 'Amazon.ca (Canada)' },
  { value: 'AU', label: 'Amazon.com.au (Australia)' }
];

// Sent along with the ASINs when handing off to /admin/asin-precheck, matching
// the filters requested for this flow (min rating 3.5, delivery within 8 days,
// in-stock, and surfacing inactive rows only).
const PRECHECK_HANDOFF_FILTERS = {
  minRating: '3.5',
  deliveryWithinDays: '8',
  stock: 'in_stock',
  active: 'inactive'
};

const ASIN_SOURCING_HANDOFF_KEY = 'asinSourcingHandoff';

const getSellerDisplayName = (seller) =>
  seller?.user?.username || seller?.user?.email || seller?.name || 'Unknown Seller';

export default function AsinSourcingPage() {
  const navigate = useNavigate();

  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [loadingSetup, setLoadingSetup] = useState(true);

  // Editable sourcing config for the selected template.
  const [searchKeyword, setSearchKeyword] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [region, setRegion] = useState('US');
  const [savingConfig, setSavingConfig] = useState(false);

  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedAsins, setSelectedAsins] = useState(new Set());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === templateId) || null,
    [templates, templateId]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingSetup(true);
        const [sellerRes, templateRes] = await Promise.all([
          api.get('/sellers/all'),
          api.get('/listing-templates')
        ]);
        if (!mounted) return;
        setSellers(sellerRes.data || []);
        setTemplates(templateRes.data || []);
      } catch (err) {
        console.error('Failed to load sourcing setup data:', err);
        if (mounted) setError('Failed to load sellers or templates');
      } finally {
        if (mounted) setLoadingSetup(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // When the template changes, load its saved sourcing config (or defaults)
  // into the editable fields, and default the account picker to it.
  useEffect(() => {
    if (!selectedTemplate) return;
    const sourcing = selectedTemplate.sourcing || {};
    setSearchKeyword(sourcing.searchKeyword || '');
    setPriceMin(sourcing.priceMin != null ? String(sourcing.priceMin) : '');
    setPriceMax(sourcing.priceMax != null ? String(sourcing.priceMax) : '');
    setRegion(sourcing.region || 'US');
    if (sourcing.defaultSellerId) {
      setSellerId(typeof sourcing.defaultSellerId === 'string' ? sourcing.defaultSellerId : sourcing.defaultSellerId._id);
    }
    setRows([]);
    setSelectedAsins(new Set());
  }, [selectedTemplate]);

  const saveTemplateSourcing = async () => {
    if (!templateId) return;
    setError('');
    setSuccess('');
    setSavingConfig(true);
    try {
      await api.patch(`/listing-templates/${templateId}/sourcing`, {
        enabled: true,
        searchKeyword,
        priceMin: priceMin === '' ? null : Number(priceMin),
        priceMax: priceMax === '' ? null : Number(priceMax),
        region,
        defaultSellerId: sellerId || null
      });
      setTemplates((prev) => prev.map((t) => (
        t._id === templateId
          ? { ...t, sourcing: { enabled: true, searchKeyword, priceMin: priceMin === '' ? null : Number(priceMin), priceMax: priceMax === '' ? null : Number(priceMax), region, defaultSellerId: sellerId || null } }
          : t
      )));
      setSuccess('Sourcing config saved for this template.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save sourcing config');
    } finally {
      setSavingConfig(false);
    }
  };

  const runSearch = async () => {
    setError('');
    setSuccess('');

    if (!templateId || !sellerId) {
      setError('Select a template and an account first.');
      return;
    }
    if (!searchKeyword.trim()) {
      setError('Enter a search keyword (or save one on the template).');
      return;
    }

    setSearching(true);
    try {
      const res = await api.post('/template-listings/amazon-search-scrape', {
        keyword: searchKeyword,
        region,
        priceMin: priceMin === '' ? null : Number(priceMin),
        priceMax: priceMax === '' ? null : Number(priceMax),
        pages: 2
      });
      const foundRows = res.data?.rows || [];

      // Accumulate across searches instead of replacing — each re-search (same or
      // tweaked keyword/price) adds only the ASINs not already in the review list.
      setRows((prevRows) => {
        const existingAsins = new Set(prevRows.map((r) => r.asin));
        const newRows = foundRows.filter((r) => !existingAsins.has(r.asin));
        const duplicateCount = foundRows.length - newRows.length;

        if (newRows.length === 0) {
          setSuccess(
            foundRows.length === 0
              ? 'Search completed — no ASINs matched the price range.'
              : `Search completed — all ${foundRows.length} ASIN${foundRows.length === 1 ? '' : 's'} were already in the list (skipped as duplicates).`
          );
          return prevRows;
        }

        setSelectedAsins((prevSelected) => {
          const next = new Set(prevSelected);
          newRows.forEach((r) => next.add(r.asin));
          return next;
        });

        setSuccess(
          `Found ${newRows.length} new ASIN${newRows.length === 1 ? '' : 's'}`
          + (duplicateCount > 0 ? ` (skipped ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} already in the list)` : '')
          + '. Review and send to Precheck.'
        );

        return [...prevRows, ...newRows];
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Amazon search scrape failed');
    } finally {
      setSearching(false);
    }
  };

  const toggleAsin = (asin) => {
    setSelectedAsins((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedAsins.size === rows.length) {
      setSelectedAsins(new Set());
    } else {
      setSelectedAsins(new Set(rows.map((r) => r.asin)));
    }
  };

  const sendToPrecheck = () => {
    const asins = rows.filter((r) => selectedAsins.has(r.asin)).map((r) => r.asin);
    if (asins.length === 0) {
      setError('Select at least one ASIN to send to Precheck.');
      return;
    }

    try {
      window.sessionStorage.setItem(ASIN_SOURCING_HANDOFF_KEY, JSON.stringify({
        sellerId,
        templateId,
        region,
        asins,
        filters: PRECHECK_HANDOFF_FILTERS,
        createdAt: Date.now()
      }));
    } catch {
      // sessionStorage unavailable — fall back to a manual paste on the precheck page.
    }

    navigate('/admin/asin-precheck');
  };

  if (loadingSetup) {
    return (
      <AdminPageShell title="ASIN Sourcing">
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="ASIN Sourcing" subtitle="Search Amazon by template, review ASINs, send to Precheck">
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>1. Choose Template + Account</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={templates}
                value={selectedTemplate}
                getOptionLabel={(t) => t?.name || ''}
                isOptionEqualToValue={(a, b) => a._id === b._id}
                onChange={(_, value) => setTemplateId(value?._id || '')}
                renderInput={(params) => <TextField {...params} label="Template" placeholder="Search template" />}
              />
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Account (Seller)</InputLabel>
                <Select
                  label="Account (Seller)"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                >
                  {sellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>
                      {getSellerDisplayName(seller)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>2. Sourcing Config</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                sx={{ flex: 2 }}
                label="Amazon Search Keyword"
                placeholder='e.g. "car screen protector"'
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                disabled={!templateId}
              />
              <TextField
                sx={{ flex: 1 }}
                label="Price From"
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                disabled={!templateId}
              />
              <TextField
                sx={{ flex: 1 }}
                label="Price To"
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                disabled={!templateId}
              />
              <FormControl sx={{ flex: 1 }} disabled={!templateId}>
                <InputLabel>Region</InputLabel>
                <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
                  {MARKETPLACE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={saveTemplateSourcing}
                disabled={!templateId || savingConfig}
                sx={yellowOutlinedButtonSx}
              >
                {savingConfig ? 'Saving…' : 'Save to Template'}
              </Button>
              <Button
                variant="contained"
                startIcon={searching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                onClick={runSearch}
                disabled={!templateId || !sellerId || searching}
                sx={yellowFilledButtonSx}
              >
                {searching ? 'Searching Amazon…' : 'Search Amazon'}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {rows.length > 0 && (
          <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  3. Review ASINs ({selectedAsins.size}/{rows.length} selected)
                </Typography>
                <Button
                  variant="contained"
                  onClick={sendToPrecheck}
                  disabled={selectedAsins.size === 0}
                  sx={yellowFilledButtonSx}
                >
                  Send {selectedAsins.size} to Precheck
                </Button>
              </Stack>
              <Divider />
              <TableContainer sx={{ maxHeight: 480 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={rows.length > 0 && selectedAsins.size === rows.length}
                          indeterminate={selectedAsins.size > 0 && selectedAsins.size < rows.length}
                          onChange={toggleAll}
                        />
                      </TableCell>
                      <TableCell>Image</TableCell>
                      <TableCell>ASIN</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Price</TableCell>
                      <TableCell>Rating</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.asin} hover>
                        <TableCell padding="checkbox">
                          <Checkbox checked={selectedAsins.has(row.asin)} onChange={() => toggleAsin(row.asin)} />
                        </TableCell>
                        <TableCell>
                          {row.image ? (
                            <Box component="img" src={row.image} alt={row.asin} sx={{ width: 40, height: 40, objectFit: 'contain' }} />
                          ) : null}
                        </TableCell>
                        <TableCell>{row.asin}</TableCell>
                        <TableCell sx={{ maxWidth: 420 }}>
                          <Typography variant="body2" noWrap title={row.title}>{row.title}</Typography>
                        </TableCell>
                        <TableCell>{row.price != null ? `$${row.price}` : '—'}</TableCell>
                        <TableCell>
                          {row.rating != null ? row.rating : '—'}
                          {row.sponsored && <Chip label="Sponsored" size="small" sx={{ ml: 1 }} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </Paper>
        )}
      </Stack>
    </AdminPageShell>
  );
}
