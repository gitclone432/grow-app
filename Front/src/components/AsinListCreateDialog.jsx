import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import api from '../lib/api.js';

const GROWMENTALITY_USERNAME = 'growmentality';

/**
 * Dialog that lets the user pick a Template before launching
 * the "Create Listing from Directory" flow on AsinListPage.
 * The seller is auto-assigned to growmentality.
 *
 * Props:
 *   open        – boolean
 *   onClose     – () => void
 *   asinCount   – number of selected ASINs (displayed only)
 *   onConfirm   – ({ sellerId, templateId, template }) => void
 */
export default function AsinListCreateDialog({ open, onClose, asinCount = 0, onConfirm }) {
  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  // Fetch sellers + templates when dialog opens
  useEffect(() => {
    if (!open) return;
    setSellerId('');
    setTemplateId('');
    setTemplateSearch('');
    fetchData();
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sellersRes, templatesRes] = await Promise.all([
        api.get('/sellers/all'),
        api.get('/listing-templates')
      ]);
      const fetchedSellers = sellersRes.data || [];
      setSellers(fetchedSellers);
      setTemplates(templatesRes.data || []);

      // Auto-assign growmentality seller
      const growSeller = fetchedSellers.find(
        s => s.user?.username === GROWMENTALITY_USERNAME
      );
      if (growSeller) setSellerId(growSeller._id);
    } catch (err) {
      console.error('Failed to load sellers/templates', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    const template = templates.find(t => t._id === templateId);
    onConfirm({ sellerId, templateId, template });
  };

  const growSeller = sellers.find(s => s.user?.username === GROWMENTALITY_USERNAME);
  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Listing from ASIN List</DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Creating listings for{' '}
          <strong>{asinCount} selected ASIN{asinCount !== 1 ? 's' : ''}</strong>.
          Choose the template to use.
        </Typography>

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Stack spacing={3}>
            {/* Seller — read-only, auto-assigned */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Seller
              </Typography>
              <Chip
                label={growSeller ? 'Grow Mentality' : (sellerId || 'Not found')}
                color={growSeller ? 'success' : 'default'}
                variant="outlined"
                size="medium"
              />
            </Box>

            {/* Template with search */}
            <FormControl fullWidth>
              <InputLabel>Template *</InputLabel>
              <Select
                value={templateId}
                label="Template *"
                onChange={e => setTemplateId(e.target.value)}
                onClose={() => setTemplateSearch('')}
                MenuProps={{ autoFocus: false }}
              >
                {/* Sticky search input */}
                <ListSubheader sx={{ p: 1, lineHeight: 'normal' }}>
                  <TextField
                    size="small"
                    placeholder="Search templates…"
                    fullWidth
                    autoFocus
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                    onKeyDown={e => e.stopPropagation()}
                    inputRef={searchRef}
                  />
                </ListSubheader>

                {filteredTemplates.length === 0 ? (
                  <MenuItem disabled>No templates match</MenuItem>
                ) : (
                  filteredTemplates.map(t => (
                    <MenuItem key={t._id} value={t._id}>
                      {t.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || !sellerId || !templateId}
        >
          Generate Listings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
