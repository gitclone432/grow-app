import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Stack,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    CircularProgress,
    Alert,
    Checkbox,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Pagination,
    IconButton,
    Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../lib/api';
import ScheduleUploadDialog from '../../components/ScheduleUploadDialog';

const statusColor = (status) => {
    switch (status) {
        case 'COMPLETED': return 'success';
        case 'COMPLETED_WITH_ERROR': return 'warning';
        case 'FAILURE': return 'error';
        default: return 'default';
    }
};

export default function CsvStoragePage() {
    const navigate = useNavigate();

    // Filters
    const [sellers, setSellers] = useState([]);
    const [selectedSeller, setSelectedSeller] = useState('');
    const [keyword, setKeyword] = useState('');
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);

    // CRP cascade filters
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [ranges, setRanges] = useState([]);
    const [selectedRange, setSelectedRange] = useState('');
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState('');

    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingRanges, setLoadingRanges] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Table data
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Selection
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Pagination
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    // Action states
    const [downloadingId, setDownloadingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [uploadingId, setUploadingId] = useState(null);
    const [scheduleDialog, setScheduleDialog] = useState({ open: false, record: null });

    // ── Initial data loads ──────────────────────────────────────────
    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const [sellersRes, categoriesRes] = await Promise.all([
                    api.get('/sellers/all'),
                    api.get('/asin-list-categories'),
                ]);
                setSellers(sellersRes.data);
                setCategories(categoriesRes.data);
            } catch {
                setError('Failed to load initial data.');
            }
        };
        fetchInitial();
    }, []);

    // ── CRP cascade ─────────────────────────────────────────────────
    useEffect(() => {
        setRanges([]);
        setSelectedRange('');
        setProducts([]);
        setSelectedProduct('');
        if (!selectedCategory) return;

        setLoadingRanges(true);
        api.get('/asin-list-ranges', { params: { categoryId: selectedCategory } })
            .then(({ data }) => setRanges(data))
            .catch(() => {})
            .finally(() => setLoadingRanges(false));
    }, [selectedCategory]);

    useEffect(() => {
        setProducts([]);
        setSelectedProduct('');
        if (!selectedRange) return;

        setLoadingProducts(true);
        api.get('/asin-list-products', { params: { rangeId: selectedRange } })
            .then(({ data }) => setProducts(data))
            .catch(() => {})
            .finally(() => setLoadingProducts(false));
    }, [selectedRange]);

    // ── Fetch records ────────────────────────────────────────────────
    const fetchRecords = useCallback(async (pg = page) => {
        setLoading(true);
        setError('');
        try {
            const params = {
                limit: rowsPerPage,
                offset: (pg - 1) * rowsPerPage,
            };
            if (selectedSeller) params.sellerId = selectedSeller;
            if (keyword.trim()) params.keyword = keyword.trim();
            if (dateFrom) params.dateFrom = dateFrom.toISOString();
            if (dateTo) params.dateTo = dateTo.toISOString();
            if (selectedCategory) params.categoryId = selectedCategory;
            if (selectedRange) params.rangeId = selectedRange;
            if (selectedProduct) params.productId = selectedProduct;

            const { data } = await api.get('/csv-storage', { params });
            setRecords(data.records || []);
            setTotal(data.total || 0);
        } catch {
            setError('Failed to fetch CSV records.');
        } finally {
            setLoading(false);
        }
    }, [page, selectedSeller, keyword, dateFrom, dateTo, selectedCategory, selectedRange, selectedProduct]);

    // Fetch on page change or filter deps
    useEffect(() => {
        setSelectedIds(new Set());
        fetchRecords(page);
    }, [page]);

    const handleSearch = () => {
        setPage(1);
        setSelectedIds(new Set());
        fetchRecords(1);
    };

    const handleClearFilters = () => {
        setSelectedSeller('');
        setKeyword('');
        setDateFrom(null);
        setDateTo(null);
        setSelectedCategory('');
        setSelectedRange('');
        setSelectedProduct('');
        setPage(1);
        setSelectedIds(new Set());
    };

    // ── Selection ────────────────────────────────────────────────────
    const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r._id));
    const isIndeterminate = records.some(r => selectedIds.has(r._id)) && !isAllSelected;

    const handleToggleAll = () => {
        if (isAllSelected) {
            const next = new Set(selectedIds);
            records.forEach(r => next.delete(r._id));
            setSelectedIds(next);
        } else {
            const next = new Set(selectedIds);
            records.forEach(r => next.add(r._id));
            setSelectedIds(next);
        }
    };

    const handleToggleOne = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    // ── Download single ──────────────────────────────────────────────
    const handleDownload = async (record) => {
        setDownloadingId(record._id);
        try {
            const response = await api.get(`/csv-storage/${record._id}/download`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = record.fileName || `${record.name}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setError(`Failed to download "${record.name}".`);
        } finally {
            setDownloadingId(null);
        }
    };

    // ── Download selected ────────────────────────────────────────────
    const handleDownloadSelected = async () => {
        const toDownload = records.filter(r => selectedIds.has(r._id));
        for (const record of toDownload) {
            await handleDownload(record);
        }
    };

    // ── Upload selected (single) ─────────────────────────────────────
    const handleUploadSelected = async () => {
        const toUpload = records.find(r => selectedIds.has(r._id));
        if (!toUpload) return;

        setUploadingId(toUpload._id);
        try {
            const response = await api.get(`/csv-storage/${toUpload._id}/download`, {
                responseType: 'blob',
            });
            const csvFile = new File([response.data], toUpload.fileName || `${toUpload.name}.csv`, {
                type: 'text/csv',
            });
            navigate('/admin/feed-upload', {
                state: {
                    sellerId: toUpload.seller?._id,
                    csvFile,
                    csvStorageId: toUpload._id,
                },
            });
        } catch {
            setError(`Failed to prepare "${toUpload.name}" for upload.`);
        } finally {
            setUploadingId(null);
        }
    };

    // ── Delete ───────────────────────────────────────────────────────
    const handleDelete = async (record) => {
        if (!window.confirm(`Delete "${record.name}"?`)) return;
        setDeletingId(record._id);
        try {
            await api.delete(`/csv-storage/${record._id}`);
            fetchRecords(page);
        } catch {
            setError(`Failed to delete "${record.name}".`);
        } finally {
            setDeletingId(null);
        }
    };

    // ── Helpers ──────────────────────────────────────────────────────
    const buildTaxonomyLabel = (record) => {
        const parts = [record.categoryName, record.rangeName, record.productName].filter(Boolean);
        return parts.length ? parts.join(' › ') : '—';
    };

    const selectedCount = selectedIds.size;
    const totalPages = Math.ceil(total / rowsPerPage) || 1;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
                CSV Storage
            </Typography>

            {error && (
                <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {/* ── Filters ── */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <Stack spacing={2}>
                        {/* Row 1 */}
                        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                            <DatePicker
                                label="From"
                                value={dateFrom}
                                onChange={setDateFrom}
                                slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                            />
                            <DatePicker
                                label="To"
                                value={dateTo}
                                onChange={setDateTo}
                                slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                            />
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                                <InputLabel>Store</InputLabel>
                                <Select
                                    value={selectedSeller}
                                    label="Store"
                                    onChange={(e) => setSelectedSeller(e.target.value)}
                                >
                                    <MenuItem value=""><em>All</em></MenuItem>
                                    {sellers.map((s) => (
                                        <MenuItem key={s._id} value={s._id}>
                                            {s.storeName || s.user?.username || s._id}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                size="small"
                                label="Keyword"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                sx={{ minWidth: 200 }}
                            />
                        </Stack>

                        {/* Row 2 */}
                        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    value={selectedCategory}
                                    label="Category"
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    disabled={loadingCategories}
                                >
                                    <MenuItem value=""><em>All</em></MenuItem>
                                    {categories.map((c) => (
                                        <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel>Range</InputLabel>
                                <Select
                                    value={selectedRange}
                                    label="Range"
                                    onChange={(e) => setSelectedRange(e.target.value)}
                                    disabled={!selectedCategory || loadingRanges}
                                >
                                    <MenuItem value=""><em>All</em></MenuItem>
                                    {ranges.map((r) => (
                                        <MenuItem key={r._id} value={r._id}>{r.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel>Product</InputLabel>
                                <Select
                                    value={selectedProduct}
                                    label="Product"
                                    onChange={(e) => setSelectedProduct(e.target.value)}
                                    disabled={!selectedRange || loadingProducts}
                                >
                                    <MenuItem value=""><em>All</em></MenuItem>
                                    {products.map((p) => (
                                        <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Box sx={{ ml: 'auto' }}>
                                <Stack direction="row" spacing={1}>
                                    <Button variant="outlined" size="small" onClick={handleClearFilters}>
                                        Clear
                                    </Button>
                                    <Button variant="contained" size="small" onClick={handleSearch}>
                                        Search
                                    </Button>
                                    <Tooltip title="Refresh">
                                        <IconButton size="small" onClick={() => fetchRecords(page)} disabled={loading}>
                                            <RefreshIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            </Box>
                        </Stack>
                    </Stack>
                </LocalizationProvider>
            </Paper>

            {/* ── Action bar ── */}
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    disabled={selectedCount === 0 || !!downloadingId}
                    onClick={handleDownloadSelected}
                >
                    Download{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </Button>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={uploadingId ? <CircularProgress size={14} color="inherit" /> : <CloudUploadIcon />}
                    disabled={selectedCount === 0 || !!uploadingId}
                    onClick={handleUploadSelected}
                >
                    Upload to eBay{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </Button>
            </Stack>

            {/* ── Table ── */}
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    size="small"
                                    checked={isAllSelected}
                                    indeterminate={isIndeterminate}
                                    onChange={handleToggleAll}
                                    disabled={records.length === 0}
                                />
                            </TableCell>
                            <TableCell sx={{ width: 200, maxWidth: 200 }}>Name</TableCell>
                            <TableCell sx={{ width: 130, whiteSpace: 'nowrap' }}>Source</TableCell>
                            <TableCell sx={{ width: 120, whiteSpace: 'nowrap' }}>Store</TableCell>
                            <TableCell>Date</TableCell>
                            <TableCell align="center">Listings</TableCell>
                            <TableCell>Category › Range › Product</TableCell>
                            <TableCell align="center">Listed / Failed</TableCell>
                            <TableCell align="center">Scheduled Upload</TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                                    <CircularProgress size={28} />
                                </TableCell>
                            </TableRow>
                        ) : records.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    No CSV records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            records.map((record) => {
                                const feedUpload = record.feedUploadId;
                                const isCompleted =
                                    feedUpload?.status === 'COMPLETED' ||
                                    feedUpload?.status === 'COMPLETED_WITH_ERROR';

                                return (
                                    <TableRow
                                        key={record._id}
                                        hover
                                        selected={selectedIds.has(record._id)}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                size="small"
                                                checked={selectedIds.has(record._id)}
                                                onChange={() => handleToggleOne(record._id)}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 500, width: 200, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <Tooltip title={record.name} placement="top-start" arrow>
                                                <span>{record.name}</span>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>
                                            {record.source === 'manual' ? (
                                                <Chip label="Manual Upload" size="small" color="primary" variant="outlined" />
                                            ) : record.source === 'asin_list' ? (
                                                <Chip label="ASIN List" size="small" color="secondary" variant="outlined" />
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {record.seller?.storeName || record.seller?.user?.username || '—'}
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            {record.createdAt
                                                ? new Date(record.createdAt).toLocaleDateString()
                                                : '—'}
                                        </TableCell>
                                        <TableCell align="center">
                                            {record.listingCount ?? '—'}
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 200 }}>
                                            {buildTaxonomyLabel(record)}
                                        </TableCell>
                                        <TableCell align="center">
                                            {!feedUpload ? (
                                                <Typography variant="caption" color="text.secondary">
                                                    Not uploaded
                                                </Typography>
                                            ) : isCompleted ? (
                                                <Stack direction="row" spacing={0.5} justifyContent="center">
                                                    <Chip
                                                        label={`${feedUpload.uploadSummary?.successCount ?? 0} listed`}
                                                        color="success"
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                    {(feedUpload.uploadSummary?.failureCount ?? 0) > 0 && (
                                                        <Chip
                                                            label={`${feedUpload.uploadSummary.failureCount} failed`}
                                                            color="error"
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    )}
                                                </Stack>
                                            ) : (
                                                <Chip
                                                    label={feedUpload.status}
                                                    color={statusColor(feedUpload.status)}
                                                    size="small"
                                                />
                                            )}
                                        </TableCell>
                                        {/* ── Scheduled Upload column ── */}
                                        <TableCell align="center">
                                            {record.scheduledUploadStatus === 'pending' && record.scheduledUploadAt ? (
                                                <Chip
                                                    icon={<ScheduleIcon />}
                                                    label={new Date(record.scheduledUploadAt).toLocaleString()}
                                                    color="warning"
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => setScheduleDialog({ open: true, record })}
                                                    sx={{ cursor: 'pointer' }}
                                                />
                                            ) : record.scheduledUploadStatus === 'processing' ? (
                                                <Chip icon={<CircularProgress size={12} />} label="Processing" size="small" color="info" />
                                            ) : record.scheduledUploadStatus === 'done' ? (
                                                <Chip label="Auto-uploaded" size="small" color="success" variant="outlined" />
                                            ) : record.scheduledUploadStatus === 'failed' ? (
                                                <Chip label="Auto-upload failed" size="small" color="error" variant="outlined" />
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Stack direction="row" spacing={0.5} justifyContent="center">
                                                <Tooltip title="Schedule Auto-Upload">
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            color={record.scheduledUploadStatus === 'pending' ? 'warning' : 'default'}
                                                            onClick={() => setScheduleDialog({ open: true, record })}
                                                            disabled={record.scheduledUploadStatus === 'processing'}
                                                        >
                                                            <ScheduleIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Download CSV">
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleDownload(record)}
                                                            disabled={downloadingId === record._id}
                                                        >
                                                            {downloadingId === record._id
                                                                ? <CircularProgress size={14} />
                                                                : <DownloadIcon fontSize="small" />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Upload to eBay">
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            onClick={async () => {
                                                                setUploadingId(record._id);
                                                                try {
                                                                    const resp = await api.get(
                                                                        `/csv-storage/${record._id}/download`,
                                                                        { responseType: 'blob' }
                                                                    );
                                                                    const csvFile = new File(
                                                                        [resp.data],
                                                                        record.fileName || `${record.name}.csv`,
                                                                        { type: 'text/csv' }
                                                                    );
                                                                    navigate('/admin/feed-upload', {
                                                                        state: {
                                                                            sellerId: record.seller?._id,
                                                                            csvFile,
                                                                            csvStorageId: record._id,
                                                                        },
                                                                    });
                                                                } catch {
                                                                    setError(`Failed to prepare "${record.name}" for upload.`);
                                                                    setUploadingId(null);
                                                                }
                                                            }}
                                                            disabled={uploadingId === record._id}
                                                        >
                                                            {uploadingId === record._id
                                                                ? <CircularProgress size={14} />
                                                                : <CloudUploadIcon fontSize="small" />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={() => handleDelete(record)}
                                                            disabled={deletingId === record._id}
                                                        >
                                                            {deletingId === record._id
                                                                ? <CircularProgress size={14} />
                                                                : <DeleteIcon fontSize="small" />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
                    <Pagination
                        count={totalPages}
                        page={page}
                        onChange={(_, val) => setPage(val)}
                        color="primary"
                        size="small"
                    />
                </Stack>
            )}
            {total > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
                    {total} record{total !== 1 ? 's' : ''} total
                </Typography>
            )}

            <ScheduleUploadDialog
                open={scheduleDialog.open}
                onClose={() => setScheduleDialog({ open: false, record: null })}
                record={scheduleDialog.record}
                sellers={sellers}
                onUpdated={(updatedRecord) => {
                    setRecords(prev => prev.map(r => r._id === updatedRecord._id ? updatedRecord : r));
                    setScheduleDialog({ open: false, record: null });
                }}
            />
        </Box>
    );
}
