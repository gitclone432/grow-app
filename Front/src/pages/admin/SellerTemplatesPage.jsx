import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link as MuiLink,
  Chip,
  Stack,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Search as SearchIcon,
  ViewList as ViewListIcon,
  Upload as UploadIcon,
  CheckCircle as ReactivateIcon,
  Cancel as DeactivateIcon
} from '@mui/icons-material';
import api from '../../lib/api';
import BulkImportASINsDialog from '../../components/BulkImportASINsDialog.jsx';
import BulkImportSKUsDialog from '../../components/BulkImportSKUsDialog.jsx';
import BulkReactivateDialog from '../../components/BulkReactivateDialog.jsx';
import BulkDeactivateDialog from '../../components/BulkDeactivateDialog.jsx';

export default function SellerTemplatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sellerId = searchParams.get('sellerId');

  const [seller, setSeller] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [listingCounts, setListingCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Bulk operation dialogs
  const [bulkImportASINsDialog, setBulkImportASINsDialog] = useState(false);
  const [bulkImportSKUsDialog, setBulkImportSKUsDialog] = useState(false);
  const [reactivateDialog, setReactivateDialog] = useState(false);
  const [deactivateDialog, setDeactivateDialog] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!sellerId) {
      navigate('/admin/select-seller');
      return;
    }
    fetchSellerAndTemplates();
  }, [sellerId]);

  useEffect(() => {
    // Filter templates based on search query
    if (searchQuery.trim() === '') {
      setFilteredTemplates(templates);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = templates.filter(template =>
        template.name?.toLowerCase().includes(query)
      );
      setFilteredTemplates(filtered);
    }
  }, [searchQuery, templates]);

  const fetchSellerAndTemplates = async () => {
    try {
      setLoading(true);

      // Fetch seller info and templates in parallel
      const [sellerRes, templatesRes] = await Promise.all([
        api.get('/sellers/all'),
        api.get('/listing-templates')
      ]);

      const sellerData = sellerRes.data.find(s => s._id === sellerId);
      if (!sellerData) {
        setError('Seller not found');
        setSeller(null);
        setTemplates([]);
        setFilteredTemplates([]);
        return;
      }

      setSeller(sellerData);
      setTemplates(templatesRes.data || []);
      setFilteredTemplates(templatesRes.data || []);

      // Fetch listing counts for each template
      fetchListingCounts(templatesRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchListingCounts = async (templatesList) => {
    const counts = {};
    
    // Fetch counts in parallel
    const countPromises = templatesList.map(async (template) => {
      try {
        const { data } = await api.get(
          `/template-listings?templateId=${template._id}&sellerId=${sellerId}&page=1&limit=1`
        );
        counts[template._id] = data.pagination?.total || 0;
      } catch (err) {
        console.error(`Error fetching count for template ${template._id}:`, err);
        counts[template._id] = 0;
      }
    });

    await Promise.all(countPromises);
    setListingCounts(counts);
  };

  const handleAddListings = (templateId) => {
    navigate(`/admin/template-listings?templateId=${templateId}&sellerId=${sellerId}`);
  };

  const getSellerDisplayName = () => {
    if (!seller) return 'Unknown';
    return seller.user?.username || seller.user?.email || 'Unknown Seller';
  };
  
  const handleOpenBulkDialog = (dialogType, templateId = null) => {
    setSelectedTemplateId(templateId);
    switch (dialogType) {
      case 'importASINs':
        setBulkImportASINsDialog(true);
        break;
      case 'importSKUs':
        setBulkImportSKUsDialog(true);
        break;
      case 'reactivate':
        setReactivateDialog(true);
        break;
      case 'deactivate':
        setDeactivateDialog(true);
        break;
    }
  };
  
  const handleDialogSuccess = (message) => {
    setSuccess(message);
    fetchListingCounts(templates);
    setTimeout(() => setSuccess(''), 3000);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Breadcrumb Navigation */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink
          component={Link}
          to="/admin/select-seller"
          underline="hover"
          color="inherit"
        >
          Select Seller
        </MuiLink>
        <Typography color="text.primary">{getSellerDisplayName()}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5">
          {getSellerDisplayName()}'s Templates
        </Typography>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/admin/select-seller')}
        >
          Back to Sellers
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      
      {/* Bulk Operation Buttons */}
      {templates.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => handleOpenBulkDialog('importASINs')}
            >
              Bulk Import ASINs
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => handleOpenBulkDialog('importSKUs')}
            >
              Bulk Import SKUs
            </Button>
            <Button
              variant="outlined"
              color="success"
              startIcon={<ReactivateIcon />}
              onClick={() => handleOpenBulkDialog('reactivate')}
            >
              Relist by SKU
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeactivateIcon />}
              onClick={() => handleOpenBulkDialog('deactivate')}
            >
              Delist by SKU
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Search Bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search templates by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* Templates Table */}
      {filteredTemplates.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ViewListIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchQuery ? 'No templates found matching your search' : 'No templates available'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {searchQuery ? 'Try a different search term' : 'Create a template first from the Manage Templates page'}
          </Typography>
          {searchQuery && (
            <Button onClick={() => setSearchQuery('')}>
              Clear Search
            </Button>
          )}
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Template Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Custom Columns</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Listings</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>ASIN Automation</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTemplates.map((template) => (
                <TableRow key={template._id} hover>
                  <TableCell>
                    <Typography variant="body1" fontWeight="medium">
                      {template.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${template.customColumns?.length || 0} columns`}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${listingCounts[template._id] || 0} listings`}
                      size="small"
                      color={listingCounts[template._id] > 0 ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={template.asinAutomation?.enabled ? 'Enabled' : 'Disabled'}
                      size="small"
                      color={template.asinAutomation?.enabled ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => handleAddListings(template._id)}
                    >
                      Add Listings
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Bulk Import ASINs Dialog */}
      <BulkImportASINsDialog
        open={bulkImportASINsDialog}
        onClose={() => setBulkImportASINsDialog(false)}
        templateId={selectedTemplateId}
        sellerId={sellerId}
        onImportComplete={() => handleDialogSuccess('ASINs imported successfully')}
      />
      
      {/* Bulk Import SKUs Dialog */}
      <BulkImportSKUsDialog
        open={bulkImportSKUsDialog}
        onClose={() => setBulkImportSKUsDialog(false)}
        templateId={selectedTemplateId}
        sellerId={sellerId}
        onImportComplete={() => handleDialogSuccess('SKUs imported successfully')}
      />
      
      {/* Bulk Reactivate Dialog */}
      <BulkReactivateDialog
        open={reactivateDialog}
        onClose={() => setReactivateDialog(false)}
        templateId={selectedTemplateId}
        sellerId={sellerId}
        onSuccess={() => handleDialogSuccess('Listings reactivated successfully')}
      />
      
      {/* Bulk Deactivate Dialog */}
      <BulkDeactivateDialog
        open={deactivateDialog}
        onClose={() => setDeactivateDialog(false)}
        templateId={selectedTemplateId}
        sellerId={sellerId}
        onSuccess={() => handleDialogSuccess('Listings deactivated successfully')}
      />
    </Box>
  );
}
