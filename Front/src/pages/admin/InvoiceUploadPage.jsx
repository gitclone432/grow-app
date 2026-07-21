import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  TextField,
  Alert,
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Chip,
  TablePagination,
  Tooltip,
  Snackbar,
  Link,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../lib/api';

const DEFAULT_CATEGORIES = [
  'OpenAI',
  'Proxy',
  'Claude',
  'GetIn',
  'Render',
  'MongoDB',
  'ScarperAPI',
  'Codex'
];

// Helper to construct proper file URL from invoice ID
const getFileUrl = (invoice) => {
  if (!invoice || !invoice._id) return '';
  
  // Get the base API URL from environment
  const apiUrl = import.meta.env.VITE_API_URL || '/api';
  
  // Remove /api suffix if present (we'll add the full path)
  const baseUrl = apiUrl.replace(/\/api\/?$/, '');
  
  // Include auth token in query param for iframe/img src compatibility
  const token = localStorage.getItem('auth_token');
  
  // Construct absolute URL for production, relative for dev
  return `${baseUrl}/api/invoices/${invoice._id}/file${token ? `?token=${token}` : ''}`;
};

export default function InvoiceUploadPage() {
  // Display state
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Upload dialog state
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadInvoiceDate, setUploadInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadNotes, setUploadNotes] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [uploading, setUploading] = useState(false);

  // View invoice dialog state
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Add new category dialog state
  const [openAddCategoryDialog, setOpenAddCategoryDialog] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState('');

  // Load categories
  useEffect(() => {
    fetchCategories();
  }, []);

  // Load invoices when filters change
  useEffect(() => {
    fetchInvoices();
  }, [selectedCategory, fromDate, toDate, page, rowsPerPage]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/invoices/categories');
      setCategories(response.data.categories || DEFAULT_CATEGORIES);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (selectedCategory && selectedCategory !== 'all') {
        params.category = selectedCategory;
      }

      if (fromDate) {
        params.startDate = fromDate;
      }

      if (toDate) {
        params.endDate = toDate;
      }

      const response = await api.get('/invoices', { params });
      setInvoices(response.data.invoices || []);
      setTotalCount(response.data.pagination.total);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError(err.response?.data?.error || 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadDialogOpen = () => {
    setUploadFile(null);
    setUploadCategory('');
    setUploadInvoiceDate(new Date().toISOString().split('T')[0]);
    setUploadNotes('');
    setNewCategory('');
    setOpenUploadDialog(true);
  };

  const handleUploadDialogClose = () => {
    setOpenUploadDialog(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  const handleAddNewCategory = async () => {
    if (!addCategoryName.trim()) {
      setError('Category name cannot be empty');
      return;
    }

    try {
      const trimmedCategory = addCategoryName.trim();
      await api.post('/invoices/categories', { category: trimmedCategory });
      
      // Add the new category to the list immediately (update state)
      setCategories(prev => {
        const updated = [...prev, trimmedCategory];
        return [...new Set(updated)].sort();
      });
      
      setUploadCategory(trimmedCategory);
      setNewCategory(trimmedCategory);
      setOpenAddCategoryDialog(false);
      setAddCategoryName('');
      setSuccess('Category created successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add category');
    }
  };

  const handleUploadInvoice = async () => {
    if (!uploadFile) {
      setError('Please select a file');
      return;
    }

    if (!uploadCategory && !newCategory) {
      setError('Please select or create a category');
      return;
    }

    if (!uploadInvoiceDate) {
      setError('Please select an invoice date');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('category', uploadCategory || newCategory);
      formData.append('invoiceDate', uploadInvoiceDate);
      formData.append('notes', uploadNotes);

      await api.post('/invoices', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSuccess('Invoice uploaded successfully');
      setOpenUploadDialog(false);
      await fetchInvoices();
      await fetchCategories(); // Refresh categories list
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload invoice');
    } finally {
      setUploading(false);
    }
  };

  const handleViewInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    setOpenViewDialog(true);
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) {
      return;
    }

    try {
      await api.delete(`/invoices/${invoiceId}`);
      setSuccess('Invoice deleted successfully');
      await fetchInvoices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete invoice');
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRefresh = () => {
    fetchInvoices();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link href="/" underline="hover" color="inherit">
          Home
        </Link>
        <Typography color="text.primary">Invoice Upload</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 1 }}>Invoice Management</Typography>
          <Typography color="text.secondary">Finance & Cash Flow</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleUploadDialogOpen}
          >
            Upload Invoice
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(0);
                }}
                label="Category"
              >
                <MenuItem value="all">All Categories</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="From Date"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="To Date"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setSelectedCategory('all');
                setFromDate('');
                setToDate('');
                setPage(0);
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Alerts */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}
      {success && (
        <Alert
          severity="success"
          onClose={() => setSuccess('')}
          sx={{ mb: 2 }}
        >
          {success}
        </Alert>
      )}

      {/* Invoices Table */}
      <TableContainer component={Paper}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && invoices.length === 0 && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No invoices found</Typography>
          </Box>
        )}

        {!loading && invoices.length > 0 && (
          <>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Invoice Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>File Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>File Size</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Upload Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice._id} hover>
                    <TableCell>
                      <Chip label={invoice.category} size="small" />
                    </TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Tooltip title={invoice.fileName}>
                        <span>{invoice.fileName}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatFileSize(invoice.fileSize)}</TableCell>
                    <TableCell>{formatDate(invoice.uploadDate)}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="View">
                          <IconButton
                            size="small"
                            onClick={() => handleViewInvoice(invoice)}
                            sx={{ color: 'primary.main' }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteInvoice(invoice._id)}
                            sx={{ color: 'error.main' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <TablePagination
              rowsPerPageOptions={[5, 10, 20, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </TableContainer>

      {/* Upload Dialog */}
      <Dialog
        open={openUploadDialog}
        onClose={handleUploadDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Upload Invoice
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {/* Category Selection */}
            <FormControl fullWidth>
              <InputLabel>Category *</InputLabel>
              <Select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                label="Category *"
                disabled={!!newCategory}
              >
                <MenuItem value="">Select Category</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Add New Category Button */}
            <Button
              variant="outlined"
              size="small"
              onClick={() => setOpenAddCategoryDialog(true)}
              disabled={!!newCategory}
            >
              + Add New Category
            </Button>

            {/* New Category Display */}
            {newCategory && (
              <Box sx={{
                p: 2,
                bgcolor: '#e8f5e9',
                borderRadius: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <Typography variant="body2">
                  New category: <strong>{newCategory}</strong>
                </Typography>
                <Button
                  size="small"
                  onClick={() => setNewCategory('')}
                >
                  Change
                </Button>
              </Box>
            )}

            {/* Invoice Date */}
            <TextField
              label="Invoice Date *"
              type="date"
              value={uploadInvoiceDate}
              onChange={(e) => setUploadInvoiceDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />

            {/* File Upload */}
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Upload File * (PDF, Image, Document)
              </Typography>
              <input
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                style={{
                  display: 'block',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />
              {uploadFile && (
                <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'green' }}>
                  ✓ {uploadFile.name} ({formatFileSize(uploadFile.size)})
                </Typography>
              )}
            </Box>

            {/* Notes */}
            <TextField
              label="Notes"
              multiline
              rows={3}
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder="Optional notes about this invoice"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleUploadDialogClose}>Cancel</Button>
          <Button
            onClick={handleUploadInvoice}
            variant="contained"
            disabled={uploading || !uploadFile || (!uploadCategory && !newCategory) || !uploadInvoiceDate}
          >
            {uploading ? <CircularProgress size={24} /> : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add New Category Dialog */}
      <Dialog
        open={openAddCategoryDialog}
        onClose={() => setOpenAddCategoryDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add New Category</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Category Name"
            fullWidth
            value={addCategoryName}
            onChange={(e) => setAddCategoryName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddNewCategory();
              }
            }}
            placeholder="e.g., AWS, Digital Ocean, etc."
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenAddCategoryDialog(false)}>Cancel</Button>
          <Button
            onClick={handleAddNewCategory}
            variant="contained"
            disabled={!addCategoryName.trim()}
          >
            Add Category
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Invoice Dialog - Full Preview */}
      <Dialog
        open={openViewDialog}
        onClose={() => setOpenViewDialog(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6">Invoice Preview</Typography>
            {selectedInvoice && (
              <Typography variant="caption" color="text.secondary">
                {selectedInvoice.fileName}
              </Typography>
            )}
          </Box>
          <IconButton onClick={() => setOpenViewDialog(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, overflow: 'auto' }}>
          {selectedInvoice && (
            <>
              {/* Invoice Details Section */}
              <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Category
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {selectedInvoice.category}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Invoice Date
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {formatDate(selectedInvoice.invoiceDate)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        File Size
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {formatFileSize(selectedInvoice.fileSize)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Upload Date
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {formatDate(selectedInvoice.uploadDate)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Uploaded By
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {selectedInvoice.createdBy?.firstName} {selectedInvoice.createdBy?.lastName}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        File Name
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {selectedInvoice.fileName}
                      </Typography>
                    </Box>
                  </Grid>

                  {selectedInvoice.notes && (
                    <Grid item xs={12}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Notes
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, p: 1, bgcolor: '#ffffff', borderRadius: 1, borderLeft: '3px solid #1976d2' }}>
                          {selectedInvoice.notes}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  href={getFileUrl(selectedInvoice)}
                  download
                  target="_blank"
                  sx={{ flex: 1 }}
                >
                  Download Invoice
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setOpenViewDialog(false)}
                  sx={{ flex: 1 }}
                >
                  Close
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess('')}
        message={success}
      />
    </Box>
  );
}
