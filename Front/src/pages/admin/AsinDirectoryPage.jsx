import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Alert,
  Checkbox,
  TextField,
  InputAdornment,
  Chip,
  TablePagination,
  Tooltip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  FileUpload as UploadIcon,
  FileDownload as DownloadIcon,
  Search as SearchIcon,
  ContentCopy as CopyIcon,
  BrokenImage as BrokenImageIcon,
  ErrorOutline as ErrorOutlineIcon,
  AccountTree as AccountTreeIcon,
  Visibility as ViewIcon,
  WarningAmber as WarningAmberIcon
} from '@mui/icons-material';
import api from '../../lib/api.js';
import AsinBulkAddDialog from '../../components/AsinBulkAddDialog.jsx';
import AsinCsvImportDialog from '../../components/AsinCsvImportDialog.jsx';
import AsinExportDialog from '../../components/AsinExportDialog.jsx';
import AsinListManagerDialog from '../../components/AsinListManagerDialog.jsx';
import AsinDetailDialog from '../../components/AsinDetailDialog.jsx';
import { generateCsvContent, downloadCsv } from '../../utils/asinDirectoryUtils.js';

function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AsinDirectoryPage() {
  const currentUser = getStoredUser();
  const [asins, setAsins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState([]);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);

  const [bulkAddDialog, setBulkAddDialog] = useState(false);
  const [csvImportDialog, setCsvImportDialog] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);
  const [listManagerDialog, setListManagerDialog] = useState(false);
  const [viewAsin, setViewAsin] = useState(null);
  const [showMoved, setShowMoved] = useState(false);
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [addedByUserId, setAddedByUserId] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchAsins();
    fetchStats();
  }, [page, rowsPerPage, search, showMoved, marketplaceFilter, addedByUserId]);

  useEffect(() => {
    setSelected([]);
  }, [page, rowsPerPage, search, showMoved, marketplaceFilter, addedByUserId]);

  const fetchAsins = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/asin-directory', {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: search || undefined,
          showMoved: showMoved ? 'true' : undefined,
          region: marketplaceFilter || undefined,
          addedByUserId: addedByUserId || undefined
        }
      });
      setAsins(data.asins || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError('Failed to fetch ASINs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/asin-directory/stats', {
        params: {
          addedByUserId: addedByUserId || undefined
        }
      });
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      const sortedUsers = [...(data || [])].sort((left, right) => left.username.localeCompare(right.username));
      setUsers(sortedUsers);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  // Called by AsinBulkAddDialog with the completed result object (from SSE 'complete' event)
  const handleBulkAdd = (result) => {
    setSuccess(
      `Added ${result.added} ASINs successfully! ` +
      (result.duplicates > 0 ? `(${result.duplicates} duplicates skipped)` : '') +
      (result.errors?.length > 0 ? ` (${result.errors.length} errors)` : '')
    );
    fetchAsins();
    fetchStats();
    setSelected([]);
  };

  const handleCsvImport = async (csvData, region = 'US') => {
    try {
      const { data } = await api.post('/asin-directory/bulk-csv', { csvData, region });
      setSuccess(
        `Imported ${data.added} ASINs successfully! ` +
        (data.duplicates > 0 ? `(${data.duplicates} duplicates skipped)` : '') +
        (data.errors.length > 0 ? ` (${data.errors.length} errors)` : '')
      );
      fetchAsins();
      fetchStats();
      setSelected([]);
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to import CSV');
    }
  };

  const handleDelete = async (id, asin) => {
    if (!window.confirm(`Delete ASIN ${asin}?`)) return;

    try {
      await api.delete(`/asin-directory/${id}`);
      setSuccess('ASIN deleted successfully');
      fetchAsins();
      fetchStats();
      setSelected(selected.filter(s => s !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete ASIN');
    }
  };

  const handleBulkDelete = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} selected ASINs?`)) return;

    try {
      await api.post('/asin-directory/bulk-delete', { ids: selected });
      setSuccess(`${selected.length} ASINs deleted successfully`);
      fetchAsins();
      fetchStats();
      setSelected([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete ASINs');
    }
  };

  const handleBulkCopy = () => {
    const selectedAsins = asins
      .filter(a => selected.includes(a._id))
      .map(a => a.asin)
      .join('\n');
    navigator.clipboard.writeText(selectedAsins);
    setSuccess(`Copied ${selected.length} ASIN${selected.length > 1 ? 's' : ''} to clipboard`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const handleExport = async () => {
    try {
      const { data } = await api.get('/asin-directory', {
        params: {
          limit: 999999,
          showMoved: 'true',
          addedByUserId: addedByUserId || undefined
        }
      });
      const csv = generateCsvContent(data.asins);
      const date = new Date().toISOString().split('T')[0];
      downloadCsv(csv, `asin-directory-${date}.csv`);
      setSuccess('ASINs exported successfully');
    } catch (err) {
      setError('Failed to export ASINs');
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelected(asins.map(a => a._id));
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleCopyAsin = (asin) => {
    navigator.clipboard.writeText(asin);
    setSuccess(`Copied ${asin} to clipboard`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const handleToggleShowMoved = () => {
    setShowMoved(prev => !prev);
    setPage(0);
  };

  const MARKETPLACE_FLAGS = { US: '🇺🇸', UK: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺' };
  const MARKETPLACE_OPTIONS = [
    { value: '', label: 'All Marketplaces' },
    { value: 'US', label: '🇺🇸 US' },
    { value: 'UK', label: '🇬🇧 UK' },
    { value: 'CA', label: '🇨🇦 CA' },
    { value: 'AU', label: '🇦🇺 AU' },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">📁 ASIN Directory</Typography>
        {stats && (
          <Stack direction="row" spacing={1}>
            <Chip label={`Total: ${stats.total}`} color="primary" size="small" />
            <Chip label={`Unassigned: ${stats.unassigned ?? stats.total}`} color="success" size="small" />
            <Chip label={`In Lists: ${stats.assigned ?? 0}`} color="info" size="small" />
            <Chip label={`Today: ${stats.recentlyAdded.today}`} size="small" />
          </Stack>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => setBulkAddDialog(true)}
          >
            Add ASINs
          </Button>
          <Button
            startIcon={<UploadIcon />}
            variant="outlined"
            onClick={() => setCsvImportDialog(true)}
          >
            Import CSV
          </Button>
          <Button
            startIcon={<AccountTreeIcon />}
            variant="outlined"
            onClick={() => setListManagerDialog(true)}
          >
            Manage Lists
          </Button>
          <Button
            startIcon={<DownloadIcon />}
            variant="outlined"
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            startIcon={<DownloadIcon />}
            variant="contained"
            color="secondary"
            onClick={() => setExportDialog(true)}
            disabled={selected.length === 0}
          >
            Move to List
          </Button>

          {selected.length > 0 && (
            <Button
              startIcon={<CopyIcon />}
              variant="outlined"
              color="info"
              onClick={handleBulkCopy}
            >
              Copy ASINs ({selected.length})
            </Button>
          )}

          {selected.length > 0 && (
            <Button
              startIcon={<DeleteIcon />}
              variant="outlined"
              color="error"
              onClick={handleBulkDelete}
            >
              Delete Selected ({selected.length})
            </Button>
          )}

          <Chip
            label={showMoved ? 'Show All' : 'Unassigned Only'}
            onClick={handleToggleShowMoved}
            color={showMoved ? 'default' : 'warning'}
            variant={showMoved ? 'outlined' : 'filled'}
            size="small"
            sx={{ cursor: 'pointer' }}
          />

          <Box sx={{ flex: 1 }} />

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Added By</InputLabel>
            <Select
              value={addedByUserId}
              label="Added By"
              onChange={(e) => { setAddedByUserId(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All Users</MenuItem>
              {currentUser?.id && (
                <MenuItem value={currentUser.id}>My ASINs ({currentUser.username})</MenuItem>
              )}
              {users
                .filter((user) => user._id !== currentUser?.id)
                .map((user) => (
                  <MenuItem key={user._id} value={user._id}>{user.username}</MenuItem>
                ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              value={marketplaceFilter}
              label="Marketplace"
              onChange={(e) => { setMarketplaceFilter(e.target.value); setPage(0); }}
            >
              {MARKETPLACE_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Search ASIN or title..."
            value={search}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
            sx={{ minWidth: 250 }}
          />
        </Stack>
      </Paper>

      <Paper>
        <TableContainer>
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 60 }}>
                  <Checkbox
                    checked={asins.length > 0 && selected.length === asins.length}
                    indeterminate={selected.length > 0 && selected.length < asins.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 64, pl: 2 }}>Image</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 220 }}>ASIN</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 90 }}>Price</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Title</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: 90 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                      <CircularProgress size={18} />
                      <Typography variant="body2" color="text.secondary">Loading...</Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : asins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No ASINs yet. Add some to get started!
                  </TableCell>
                </TableRow>
              ) : (
                asins.map((item) => (
                  <TableRow key={item._id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(item._id)}
                        onChange={() => handleSelectOne(item._id)}
                      />
                    </TableCell>

                    {/* Image */}
                    <TableCell sx={{ py: 0.5, pl: 2 }}>
                      {item.images?.[0] ? (
                        <Box
                          component="img"
                          src={item.images[0]}
                          alt={item.asin}
                          sx={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider', display: 'block' }}
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <Box
                        sx={{
                          width: 50, height: 50, borderRadius: 1,
                          border: '1px solid', borderColor: 'divider',
                          display: item.images?.[0] ? 'none' : 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          bgcolor: 'grey.100'
                        }}
                      >
                        {item.scraped === false && item.scrapeError ? (
                          <Tooltip title={`Scrape failed: ${item.scrapeError}`}>
                            <ErrorOutlineIcon fontSize="small" sx={{ color: 'warning.main' }} />
                          </Tooltip>
                        ) : (
                          <BrokenImageIcon fontSize="small" sx={{ color: 'grey.400' }} />
                        )}
                      </Box>
                    </TableCell>

                    {/* ASIN */}
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" fontFamily="monospace" fontSize={13}>
                          {item.asin}
                        </Typography>
                        <Tooltip title="Copy to clipboard">
                          <IconButton size="small" onClick={() => handleCopyAsin(item.asin)}>
                            <CopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        {item.region && (
                          <Chip
                            label={`${MARKETPLACE_FLAGS[item.region] || ''}${item.region}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: 11, height: 18, '& .MuiChip-label': { px: 0.75 } }}
                          />
                        )}
                        {(!item.price || !item.description) && (
                          <Tooltip title={[
                            !item.price && 'Missing price',
                            !item.description && 'Missing description'
                          ].filter(Boolean).join(' · ')}>
                            <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main', cursor: 'default' }} />
                          </Tooltip>
                        )}
                      </Stack>
                      {item.brand && (
                        <Typography variant="caption" color="text.secondary">{item.brand}</Typography>
                      )}
                    </TableCell>

                    {/* Price */}
                    <TableCell>
                      {item.price ? (
                        <Typography variant="body2" fontWeight={500} color="success.main">
                          ${parseFloat(item.price).toFixed(2)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>

                    {/* Title */}
                    <TableCell>
                      {item.title ? (
                        <Tooltip title={item.title} placement="top-start">
                          <Typography
                            variant="body2"
                            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                          >
                            {item.title}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.disabled" fontStyle="italic">
                          {item.scraped === false ? 'Not scraped' : 'No title'}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Delete */}
                    <TableCell align="right">
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          onClick={() => setViewAsin(item)}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(item._id, item.asin)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>

      <AsinBulkAddDialog
        open={bulkAddDialog}
        onClose={() => setBulkAddDialog(false)}
        onAdd={handleBulkAdd}
      />

      <AsinCsvImportDialog
        open={csvImportDialog}
        onClose={() => setCsvImportDialog(false)}
        onImport={handleCsvImport}
      />

      <AsinExportDialog
        open={exportDialog}
        onClose={() => setExportDialog(false)}
        selectedIds={selected}
        onMoved={() => {
          setSelected([]);
          setSuccess('ASINs moved to list successfully');
          fetchAsins();
          setExportDialog(false);
        }}
      />

      <AsinListManagerDialog
        open={listManagerDialog}
        onClose={() => setListManagerDialog(false)}
      />

      <AsinDetailDialog
        open={!!viewAsin}
        onClose={() => setViewAsin(null)}
        asin={viewAsin}
        onUpdate={(updated) => {
          setViewAsin(updated);
          setAsins(prev => prev.map(a => a._id === updated._id ? updated : a));
        }}
      />
    </Box>
  );
}
