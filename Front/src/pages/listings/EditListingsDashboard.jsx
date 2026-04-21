import React, { useEffect, useState, useCallback } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    TablePagination,
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    CircularProgress,
    Snackbar,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    InputAdornment,
    LinearProgress,
    Tooltip,
    Chip
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import api from '../../lib/api';

export default function EditListingsDashboard() {
    // State
    const [sellers, setSellers] = useState([]);
    const [selectedSellerId, setSelectedSellerId] = useState('');
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [totalListings, setTotalListings] = useState(0);

    // Modal state
    const [openModal, setOpenModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPrice, setEditPrice] = useState('');

    // Snackbar
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // Image preview modal
    const [imagePreview, setImagePreview] = useState({ open: false, url: '', title: '' });

    // API usage stats
    const [usageStats, setUsageStats] = useState(null);

    // Load sellers on mount
    useEffect(() => {
        const loadSellers = async () => {
            try {
                // Try admin endpoint first
                const { data } = await api.get('/sellers/all');
                setSellers(data);
                if (data.length > 0) {
                    setSelectedSellerId(data[0]._id);
                }
            } catch (adminError) {
                // Fallback to current user's seller
                try {
                    const { data } = await api.get('/sellers/me');
                    setSellers([data]);
                    setSelectedSellerId(data._id);
                } catch (e) {
                    console.error('Failed to load sellers:', e);
                    showSnackbar('Failed to load sellers', 'error');
                }
            }
        };
        loadSellers();
    }, []);

    // Load listings when seller changes or pagination changes
    useEffect(() => {
        if (selectedSellerId) {
            loadListings();
        }
    }, [selectedSellerId, page, rowsPerPage]);

    const loadListings = useCallback(async () => {
        if (!selectedSellerId) return;

        setLoading(true);
        try {
            const res = await api.get('/ebay/all-listings', {
                params: {
                    sellerId: selectedSellerId,
                    page: page + 1,
                    limit: rowsPerPage,
                    search: searchQuery || undefined
                }
            });
            setListings(res.data.listings || []);
            setTotalListings(res.data.pagination?.total || 0);
        } catch (err) {
            console.error('Failed to load listings:', err);
            showSnackbar('Failed to load listings', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedSellerId, page, rowsPerPage, searchQuery]);

    // Fetch API usage stats
    const fetchUsageStats = async () => {
        if (!selectedSellerId) return;
        try {
            const res = await api.get('/ebay/api-usage-stats', {
                params: { sellerId: selectedSellerId }
            });
            setUsageStats(res.data);
        } catch (err) {
            console.error('Failed to fetch usage stats:', err);
        }
    };

    // Load usage stats when seller changes
    useEffect(() => {
        if (selectedSellerId) {
            fetchUsageStats();
        }
    }, [selectedSellerId]);

    const handleSync = async () => {
        if (!selectedSellerId) return;

        setSyncing(true);
        try {
            const res = await api.post('/ebay/sync-all-listings', {
                sellerId: selectedSellerId
            });
            showSnackbar(res.data.message || 'Sync complete!', 'success');
            await loadListings();
            await fetchUsageStats();
        } catch (err) {
            console.error('Sync failed:', err);
            showSnackbar(err.response?.data?.error || 'Sync failed', 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleSearch = () => {
        setPage(0);
        loadListings();
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setPage(0);
        loadListings();
    };

    const handleEditClick = (item) => {
        setSelectedItem(item);
        setEditTitle(item.title || '');
        setEditDescription(item.descriptionPreview || '');
        setEditPrice(item.currentPrice?.toString() || '');
        setOpenModal(true);
    };

    const handleSave = async () => {
        if (!selectedItem || !selectedSellerId) return;

        // Validation
        if (!editTitle.trim()) {
            showSnackbar('Title cannot be empty', 'error');
            return;
        }

        if (editTitle.length > 80) {
            showSnackbar('Title cannot exceed 80 characters', 'error');
            return;
        }

        if (editPrice && isNaN(parseFloat(editPrice))) {
            showSnackbar('Price must be a valid number', 'error');
            return;
        }

        setSaving(true);
        try {
            const res = await api.post('/ebay/update-listing', {
                sellerId: selectedSellerId,
                itemId: selectedItem.itemId,
                title: editTitle,
                description: editDescription,
                price: editPrice ? parseFloat(editPrice) : undefined
            });

            if (res.data.warning) {
                showSnackbar(`Saved with warning: ${res.data.warning}`, 'warning');
            } else {
                showSnackbar('Listing updated successfully!', 'success');
            }

            setOpenModal(false);
            await loadListings();
            await fetchUsageStats();
        } catch (err) {
            console.error('Save failed:', err);
            const errorMessage = err.response?.data?.error || 'Failed to save changes';
            showSnackbar(errorMessage, 'error');
        } finally {
            setSaving(false);
        }
    };

    const showSnackbar = (message, severity = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const usagePercentage = usageStats ? (usageStats.used / usageStats.limit) * 100 : 0;

    return (
        <Box>
            <Typography variant="h4" gutterBottom>Edit Active Listings</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Edit title, description, and price for all active eBay listings.
            </Typography>

            {/* Controls Row */}
            <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Seller Dropdown */}
                <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel>Seller</InputLabel>
                    <Select
                        value={selectedSellerId}
                        label="Seller"
                        onChange={(e) => {
                            setSelectedSellerId(e.target.value);
                            setPage(0);
                        }}
                    >
                        {sellers.map((s) => (
                            <MenuItem key={s._id} value={s._id}>
                                {s.user?.username || s._id}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Sync Button */}
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
                    onClick={handleSync}
                    disabled={syncing || !selectedSellerId}
                >
                    {syncing ? 'Syncing...' : 'Sync Listings'}
                </Button>

                {/* Search */}
                <TextField
                    placeholder="Search by Title, SKU, or Item ID"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    sx={{ minWidth: 300 }}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                {searchQuery && (
                                    <IconButton size="small" onClick={handleClearSearch}>
                                        <ClearIcon />
                                    </IconButton>
                                )}
                                <IconButton size="small" onClick={handleSearch}>
                                    <SearchIcon />
                                </IconButton>
                            </InputAdornment>
                        )
                    }}
                />

                {/* API Usage Stats */}
                {usageStats && (
                    <Box sx={{ ml: 'auto', minWidth: 200 }}>
                        <Typography variant="caption" color="text.secondary">
                            API Calls: {usageStats.used} / {usageStats.limit}
                        </Typography>
                        <LinearProgress
                            variant="determinate"
                            value={usagePercentage}
                            color={usagePercentage > 80 ? 'error' : usagePercentage > 50 ? 'warning' : 'primary'}
                            sx={{ height: 6, borderRadius: 1 }}
                        />
                    </Box>
                )}
            </Paper>

            {/* Listings Table */}
            <TableContainer component={Paper}>
                {loading && <LinearProgress />}
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                            <TableCell width={80}>Image</TableCell>
                            <TableCell>Title</TableCell>
                            <TableCell width={120}>SKU</TableCell>
                            <TableCell width={140}>Item ID</TableCell>
                            <TableCell width={100}>Price</TableCell>
                            <TableCell width={150}>Category</TableCell>
                            <TableCell width={140}>Start Date</TableCell>
                            <TableCell width={80} align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {listings.length === 0 && !loading ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">
                                        {selectedSellerId ? 'No listings found. Click "Sync Listings" to fetch from eBay.' : 'Select a seller to view listings.'}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            listings.map((item) => (
                                <TableRow key={item._id} hover>
                                    <TableCell>
                                        {item.mainImageUrl ? (
                                            <Box
                                                component="img"
                                                src={item.mainImageUrl}
                                                alt={item.title}
                                                onClick={() => setImagePreview({ open: true, url: item.mainImageUrl, title: item.title })}
                                                sx={{
                                                    width: 60,
                                                    height: 60,
                                                    objectFit: 'cover',
                                                    borderRadius: 1,
                                                    cursor: 'pointer',
                                                    transition: 'transform 0.2s',
                                                    '&:hover': { transform: 'scale(1.1)', boxShadow: 2 }
                                                }}
                                            />
                                        ) : (
                                            <Box sx={{ width: 60, height: 60, bgcolor: '#eee', borderRadius: 1 }} />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {item.title}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color="text.secondary">
                                            {item.sku || '-'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {item.itemId}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="medium">
                                            ${item.currentPrice?.toFixed(2)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title={item.categoryName || 'Unknown'}>
                                            <Chip
                                                label={item.categoryName?.split(':')[0] || 'Unknown'}
                                                size="small"
                                                variant="outlined"
                                                sx={{ maxWidth: 140 }}
                                            />
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color="text.secondary">
                                            {item.startTime ? new Date(item.startTime).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            }) : '-'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton
                                            color="primary"
                                            size="small"
                                            onClick={() => handleEditClick(item)}
                                        >
                                            <EditIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={totalListings}
                    page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                />
            </TableContainer>

            {/* Edit Modal */}
            <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Edit Listing
                    {selectedItem && (
                        <Typography variant="caption" display="block" color="text.secondary">
                            Item ID: {selectedItem.itemId}
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
                        {/* Title */}
                        <TextField
                            label="Title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            fullWidth
                            required
                            inputProps={{ maxLength: 80 }}
                            helperText={`${editTitle.length}/80 characters`}
                            error={editTitle.length > 80}
                        />

                        {/* Price */}
                        <TextField
                            label="Price"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            type="number"
                            InputProps={{
                                startAdornment: <InputAdornment position="start">$</InputAdornment>
                            }}
                            sx={{ maxWidth: 200 }}
                        />

                        {/* Description */}
                        <TextField
                            label="Description (HTML)"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            multiline
                            rows={10}
                            fullWidth
                            placeholder="Enter the listing description in HTML format..."
                            helperText="This field supports HTML formatting."
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenModal(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving}
                        startIcon={saving && <CircularProgress size={16} />}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Image Preview Modal */}
            <Dialog
                open={imagePreview.open}
                onClose={() => setImagePreview({ open: false, url: '', title: '' })}
                maxWidth="lg"
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {imagePreview.title}
                    </Typography>
                    <IconButton onClick={() => setImagePreview({ open: false, url: '', title: '' })}>
                        <ClearIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', backgroundColor: '#000' }}>
                    <Box
                        component="img"
                        src={imagePreview.url}
                        alt={imagePreview.title}
                        sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                    />
                </DialogContent>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
