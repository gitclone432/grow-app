import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Typography,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import api from '../lib/api';

export default function BulkReactivateDialog({ open, onClose, onSuccess, templateId: propTemplateId, sellerId }) {
  const [skuInput, setSkuInput] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedListings, setSelectedListings] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(propTemplateId || '');
  
  useEffect(() => {
    if (open && !propTemplateId && sellerId) {
      fetchTemplates();
    }
    if (propTemplateId) {
      setSelectedTemplateId(propTemplateId);
    }
  }, [open, propTemplateId, sellerId]);
  
  const fetchTemplates = async () => {
    try {
      const response = await api.get('/listing-templates');
      setTemplates(response.data || []);
      if (response.data?.length > 0) {
        setSelectedTemplateId(response.data[0]._id);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const handleSearch = async () => {
    if (!skuInput.trim()) return;

    setLoading(true);
    try {
      const skus = skuInput
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);

      const response = await api.post('/template-listings/search-inactive-skus', { 
        templateId: selectedTemplateId, 
        sellerId, 
        skus 
      });
      setSearchResults(response.data);
      setSelectedListings(new Set());
    } catch (error) {
      console.error('Search failed:', error);
      alert(error.response?.data?.message || 'Failed to search for SKUs');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedListings(new Set(searchResults.found.map(l => l._id)));
    } else {
      setSelectedListings(new Set());
    }
  };

  const handleSelectListing = (listingId) => {
    const newSelected = new Set(selectedListings);
    if (newSelected.has(listingId)) {
      newSelected.delete(listingId);
    } else {
      newSelected.add(listingId);
    }
    setSelectedListings(newSelected);
  };

  const handleReactivate = async () => {
    if (selectedListings.size === 0) return;

    setReactivating(true);
    try {
      const response = await api.post('/template-listings/bulk-reactivate', {
        listingIds: Array.from(selectedListings)
      });

      alert(`Successfully reactivated ${response.data.count} listing(s)`);
      onSuccess?.();
      handleReset();
    } catch (error) {
      console.error('Reactivation failed:', error);
      alert(error.response?.data?.message || 'Failed to reactivate listings');
    } finally {
      setReactivating(false);
    }
  };

  const handleReset = () => {
    setSkuInput('');
    setSearchResults(null);
    setSelectedListings(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleReset} maxWidth="lg" fullWidth>
      <DialogTitle>Relist Inactive Listings by SKU</DialogTitle>
      <DialogContent>
        {!propTemplateId && templates.length > 0 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Template</InputLabel>
            <Select
              value={selectedTemplateId}
              label="Select Template"
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={loading || reactivating}
            >
              {templates.map((template) => (
                <MenuItem key={template._id} value={template._id}>
                  {template.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter SKUs (comma or newline separated) to search for inactive listings
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="e.g., GRW25ABCDE, GRW25FGHIJ&#10;or paste multiple SKUs"
            value={skuInput}
            onChange={(e) => setSkuInput(e.target.value)}
            disabled={loading}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading || !skuInput.trim()}
          >
            {loading ? <CircularProgress size={24} /> : 'Search Inactive SKUs'}
          </Button>
        </Box>

        {searchResults && (
          <>
            {/* Summary Chips */}
            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`Found: ${searchResults.found.length}`}
                color="success"
                variant="outlined"
              />
              {searchResults.alreadyActive.length > 0 && (
                <Chip
                  label={`Already Active: ${searchResults.alreadyActive.length}`}
                  color="info"
                  variant="outlined"
                />
              )}
              {searchResults.notFound.length > 0 && (
                <Chip
                  label={`Not Found: ${searchResults.notFound.length}`}
                  color="error"
                  variant="outlined"
                />
              )}
            </Box>

            {/* Already Active Warning */}
            {searchResults.alreadyActive.length > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2">Already Active SKUs:</Typography>
                <Typography variant="body2">
                  {searchResults.alreadyActive.join(', ')}
                </Typography>
              </Alert>
            )}

            {/* Not Found Warning */}
            {searchResults.notFound.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2">SKUs Not Found:</Typography>
                <Typography variant="body2">
                  {searchResults.notFound.join(', ')}
                </Typography>
              </Alert>
            )}

            {/* Found Listings Table */}
            {searchResults.found.length > 0 && (
              <>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Inactive Listings ({searchResults.found.length})
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={
                              searchResults.found.length > 0 &&
                              selectedListings.size === searchResults.found.length
                            }
                            indeterminate={
                              selectedListings.size > 0 &&
                              selectedListings.size < searchResults.found.length
                            }
                            onChange={handleSelectAll}
                          />
                        </TableCell>
                        <TableCell>SKU</TableCell>
                        <TableCell>ASIN</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell>Start Price</TableCell>
                        <TableCell>Image</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {searchResults.found.map((listing) => (
                        <TableRow
                          key={listing._id}
                          hover
                          onClick={() => handleSelectListing(listing._id)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedListings.has(listing._id)}
                              onChange={() => handleSelectListing(listing._id)}
                            />
                          </TableCell>
                          <TableCell>{listing.customLabel || 'N/A'}</TableCell>
                          <TableCell>{listing._asinReference || 'N/A'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                              {listing.title || 'No title'}
                            </Typography>
                          </TableCell>
                          <TableCell>${listing.startPrice?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>
                            {listing.imageUrl && (
                              <img
                                src={listing.imageUrl}
                                alt=""
                                style={{ width: 40, height: 40, objectFit: 'cover' }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {searchResults.found.length === 0 && (
              <Alert severity="info">
                No inactive listings found for the provided SKUs
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleReset}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleReactivate}
          disabled={selectedListings.size === 0 || reactivating}
        >
          {reactivating ? (
            <CircularProgress size={24} />
          ) : (
            `Reactivate ${selectedListings.size} Listing(s)`
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
