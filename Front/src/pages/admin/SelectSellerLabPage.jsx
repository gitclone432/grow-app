import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';

const TemplateListingsLabPage = lazy(() => import('./TemplateListingsLabPage.jsx'));

function sellerLabel(seller) {
  return seller?.user?.username || seller?.user?.email || seller?._id || 'Unknown Seller';
}

/**
 * Primary entry: seller + template + status filters control listing activity below.
 */
export default function SelectSellerLabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sellerId = searchParams.get('sellerId') || '';
  const templateId = searchParams.get('templateId') || '';
  const statusFilter = searchParams.get('status') === 'draft' ? 'draft' : 'active';

  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [sellersRes, templatesRes] = await Promise.all([
          api.get('/sellers/all'),
          api.get('/listing-templates'),
        ]);
        if (cancelled) return;
        setSellers(Array.isArray(sellersRes.data) ? sellersRes.data : []);
        setTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : []);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError('Failed to load sellers or templates');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedSellers = useMemo(
    () =>
      [...sellers].sort((a, b) =>
        sellerLabel(a).localeCompare(sellerLabel(b), undefined, { sensitivity: 'base' })
      ),
    [sellers]
  );

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      ),
    [templates]
  );

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const ready = Boolean(sellerId && templateId);
  const missing = [];
  if (!sellerId) missing.push('seller');
  if (!templateId) missing.push('template');

  // Remount only when seller/template change — status switch reuses the same instance
  const listingsKey = `${sellerId}-${templateId}`;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Typography variant="h5" sx={{ mb: 1.5, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Template listing
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{
          px: 2,
          py: 1.5,
          mb: 2,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
        }}
      >
        {loading ? (
          <Stack alignItems="center" py={1}>
            <CircularProgress size={24} />
          </Stack>
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
            <TextField
              select
              label="Seller"
              size="small"
              value={sellerId}
              onChange={(e) => setFilter('sellerId', e.target.value)}
              sx={{ minWidth: 200, flex: { sm: '1 1 200px' }, maxWidth: 320 }}
            >
              <MenuItem value="">
                <em>Select seller</em>
              </MenuItem>
              {sortedSellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {sellerLabel(s)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Template"
              size="small"
              value={templateId}
              onChange={(e) => setFilter('templateId', e.target.value)}
              sx={{ minWidth: 220, flex: { sm: '1 1 240px' }, maxWidth: 360 }}
              disabled={!sortedTemplates.length}
            >
              <MenuItem value="">
                <em>Select template</em>
              </MenuItem>
              {sortedTemplates.map((t) => (
                <MenuItem key={t._id} value={t._id}>
                  {t.name || t._id}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Status"
              size="small"
              value={statusFilter}
              onChange={(e) => setFilter('status', e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
            </TextField>
          </Stack>
        )}
      </Paper>

      {!ready ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            Select {missing.join(' and ')} to load listings.
          </Typography>
        </Paper>
      ) : (
        <Suspense
          fallback={
            <Stack alignItems="center" py={6}>
              <CircularProgress />
            </Stack>
          }
        >
          <TemplateListingsLabPage embedded key={listingsKey} />
        </Suspense>
      )}
    </Box>
  );
}
