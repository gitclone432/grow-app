import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  History as HistoryIcon,
  OpenInNew as OpenInNewIcon,
  PlayArrow as PlayIcon
} from '@mui/icons-material';
import api from '../../lib/api.js';
import AdminPageShell from '../../components/AdminPageShell.jsx';
import { yellowFilledButtonSx, yellowOutlinedButtonSx } from '../../theme/tableStyles.js';

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: 'Amazon.com (US)' },
  { value: 'UK', label: 'Amazon.co.uk (UK)' },
  { value: 'CA', label: 'Amazon.ca (Canada)' },
  { value: 'AU', label: 'Amazon.com.au (Australia)' }
];

// Same defaults as the manual ASIN Sourcing -> Precheck handoff
// (PRECHECK_HANDOFF_FILTERS in AsinSourcingPage.jsx) — the "universal
// filtering logic" applied automatically by every sourcing rule.
const DEFAULT_FILTERS = {
  minRating: 3.5,
  deliveryWithinDays: 8,
  stock: 'in_stock',
  active: 'inactive',
  excludeKeywords: []
};

const EMPTY_FORM = {
  templateId: '',
  sellerId: '',
  searchKeyword: '',
  priceMin: '',
  priceMax: '',
  region: 'US',
  targetAsinCount: '',
  filters: { ...DEFAULT_FILTERS, excludeKeywords: '' },
  enabled: true,
  autoGenerateAndSave: false
};

const RUN_STAGE_LABELS = {
  collecting_asins: 'Collecting ASINs',
  prechecking_asins: 'Prechecking ASINs',
  generating_listings: 'Generating listings',
  saving_listings: 'Saving listings',
  feed_uploading: 'Feed uploading to eBay',
  completed: 'Completed'
};

const getSellerDisplayName = (seller) =>
  seller?.user?.username || seller?.user?.email || seller?.name || 'Unknown Seller';

const getTemplateName = (rule) => (typeof rule.template === 'object' ? rule.template?.name : '') || 'Unknown template';
const getRuleSellerName = (rule) => (typeof rule.seller === 'object' ? getSellerDisplayName(rule.seller) : 'Unknown seller');

export default function SourcingRulesPage() {
  const navigate = useNavigate();

  const [sellers, setSellers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [rules, setRules] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [queueingId, setQueueingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [historyRule, setHistoryRule] = useState(null);
  const [historyRuns, setHistoryRuns] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const pollTimerRef = useRef(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === form.templateId) || null,
    [templates, form.templateId]
  );

  const loadAll = async () => {
    setError('');
    try {
      const [sellerRes, templateRes, ruleRes, batchRes] = await Promise.all([
        api.get('/sellers/all'),
        api.get('/listing-templates'),
        api.get('/sourcing-rules'),
        api.get('/sourcing-rules/batches')
      ]);
      setSellers(sellerRes.data || []);
      setTemplates(templateRes.data || []);
      setRules(ruleRes.data || []);
      setBatches(batchRes.data || []);
    } catch (err) {
      console.error('Failed to load sourcing rules setup:', err);
      setError('Failed to load sourcing rules');
    } finally {
      setLoading(false);
    }
  };

  // Lighter refresh used by the live-progress poll below — skips
  // sellers/templates (rarely change) so a 3s poll stays cheap.
  const refreshRulesAndBatches = async () => {
    try {
      const [ruleRes, batchRes] = await Promise.all([
        api.get('/sourcing-rules'),
        api.get('/sourcing-rules/batches')
      ]);
      setRules(ruleRes.data || []);
      setBatches(batchRes.data || []);
    } catch (err) {
      console.error('Failed to refresh sourcing rules:', err);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Poll while any rule has a live (queued/processing) run — so "Run Now"
  // state and stage progress survive a refresh/reopen and stay live without
  // the user doing anything, but idle screens don't poll at all.
  useEffect(() => {
    const hasActiveRun = rules.some((r) => r.activeRun);
    if (!hasActiveRun) return undefined;

    pollTimerRef.current = setTimeout(refreshRulesAndBatches, 3000);
    return () => clearTimeout(pollTimerRef.current);
  }, [rules]);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (rule) => {
    setEditingId(rule._id);
    setForm({
      templateId: typeof rule.template === 'object' ? rule.template?._id : rule.template,
      sellerId: typeof rule.seller === 'object' ? rule.seller?._id : rule.seller,
      searchKeyword: rule.searchKeyword || '',
      priceMin: rule.priceMin != null ? String(rule.priceMin) : '',
      priceMax: rule.priceMax != null ? String(rule.priceMax) : '',
      region: rule.region || 'US',
      targetAsinCount: rule.targetAsinCount != null ? String(rule.targetAsinCount) : '',
      filters: {
        ...DEFAULT_FILTERS,
        ...(rule.filters || {}),
        excludeKeywords: (rule.filters?.excludeKeywords || []).join(', ')
      },
      enabled: rule.enabled !== false,
      autoGenerateAndSave: Boolean(rule.autoGenerateAndSave)
    });
    setDialogOpen(true);
  };

  const updateFilter = (key, value) => {
    setForm((prev) => ({ ...prev, filters: { ...prev.filters, [key]: value } }));
  };

  const saveRule = async () => {
    setError('');
    setSuccess('');

    if (!form.templateId || !form.sellerId) {
      setError('Select a template and an account.');
      return;
    }
    if (!form.searchKeyword.trim()) {
      setError('Enter a search keyword.');
      return;
    }
    if (!form.targetAsinCount || Number(form.targetAsinCount) < 1) {
      setError('Enter a valid target ASIN count.');
      return;
    }

    const payload = {
      templateId: form.templateId,
      sellerId: form.sellerId,
      searchKeyword: form.searchKeyword,
      priceMin: form.priceMin === '' ? null : Number(form.priceMin),
      priceMax: form.priceMax === '' ? null : Number(form.priceMax),
      region: form.region,
      targetAsinCount: Number(form.targetAsinCount),
      filters: {
        ...form.filters,
        excludeKeywords: String(form.filters.excludeKeywords || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      },
      enabled: form.enabled,
      autoGenerateAndSave: form.autoGenerateAndSave
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/sourcing-rules/${editingId}`, payload);
        setSuccess('Sourcing rule updated.');
      } else {
        await api.post('/sourcing-rules', payload);
        setSuccess('Sourcing rule created.');
      }
      setDialogOpen(false);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save sourcing rule');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule) => {
    try {
      await api.patch(`/sourcing-rules/${rule._id}`, { enabled: !rule.enabled });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update sourcing rule');
    }
  };

  const runNow = async (rule) => {
    setError('');
    setSuccess('');
    if (rule.activeRun) {
      setSuccess('Already running/queued for this rule.');
      return;
    }
    setQueueingId(rule._id);
    try {
      const res = await api.post(`/sourcing-rules/${rule._id}/run-now`);
      setSuccess(res.data?.status === 'queued' ? 'Run queued — it will start as soon as a slot frees up.' : 'Run started.');
      await refreshRulesAndBatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to queue sourcing run');
    } finally {
      setQueueingId(null);
    }
  };

  const openHistory = async (rule) => {
    setHistoryRule(rule);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/sourcing-rules/${rule._id}/runs`);
      setHistoryRuns(res.data?.runs || []);
    } catch (err) {
      console.error('Failed to load run history:', err);
      setHistoryRuns([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/sourcing-rules/${deleteTarget._id}`);
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete sourcing rule');
    }
  };

  const openBatchInLab = (batch) => {
    const sellerId = typeof batch.seller === 'object' ? batch.seller?._id : batch.seller;
    const templateId = typeof batch.template === 'object' ? batch.template?._id : batch.template;
    navigate(`/admin/select-seller-lab?templateId=${templateId}&sellerId=${sellerId}&fromSourcingBatch=${batch._id}`);
  };

  if (loading) {
    return (
      <AdminPageShell title="Sourcing Rules">
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Sourcing Rules"
      subtitle="Automate ASIN Sourcing -> Precheck per template/account, on a schedule"
    >
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>Rules</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} sx={yellowFilledButtonSx}>
              New Rule
            </Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Account</TableCell>
                  <TableCell>Template</TableCell>
                  <TableCell>Keyword</TableCell>
                  <TableCell>Price Range</TableCell>
                  <TableCell>Target</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell>Last Run</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No sourcing rules yet. Click "New Rule" to add one.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {rules.map((rule) => (
                  <TableRow key={rule._id} hover>
                    <TableCell>{getRuleSellerName(rule)}</TableCell>
                    <TableCell>{getTemplateName(rule)}</TableCell>
                    <TableCell>{rule.searchKeyword}</TableCell>
                    <TableCell>
                      {rule.priceMin != null || rule.priceMax != null
                        ? `$${rule.priceMin ?? '—'} – $${rule.priceMax ?? '—'}`
                        : 'Any'}
                    </TableCell>
                    <TableCell>{rule.targetAsinCount}</TableCell>
                    <TableCell>
                      <Switch checked={rule.enabled} onChange={() => toggleEnabled(rule)} size="small" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      {rule.activeRun ? (
                        <Stack spacing={0.25}>
                          <Chip
                            size="small"
                            icon={<CircularProgress size={12} sx={{ color: 'inherit', ml: 0.5 }} />}
                            label={rule.activeRun.status === 'queued' ? 'Queued' : (RUN_STAGE_LABELS[rule.activeRun.stage] || 'Running')}
                            color="info"
                          />
                          <Typography variant="caption" color="text.secondary" noWrap title={rule.activeRun.stageDetail}>
                            {rule.activeRun.stageDetail || (rule.activeRun.status === 'queued' ? 'Waiting for a free slot…' : 'Working…')}
                          </Typography>
                        </Stack>
                      ) : rule.lastRunAt ? (
                        <Stack spacing={0.25}>
                          <Chip
                            size="small"
                            label={rule.lastRunStatus || 'unknown'}
                            color={rule.lastRunStatus === 'success' ? 'success' : rule.lastRunStatus === 'partial' ? 'warning' : rule.lastRunStatus === 'error' ? 'error' : 'default'}
                          />
                          <Typography variant="caption" color="text.secondary" noWrap title={rule.lastRunSummary}>
                            {rule.lastRunSummary}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">Never run</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={rule.activeRun ? 'Already running/queued' : 'Run now'}>
                        <span>
                          <IconButton size="small" onClick={() => runNow(rule)} disabled={queueingId === rule._id || Boolean(rule.activeRun)}>
                            {queueingId === rule._id ? <CircularProgress size={18} /> : <PlayIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Run history">
                        <IconButton size="small" onClick={() => openHistory(rule)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEditDialog(rule)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(rule)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Recent Batches</Typography>
            <Button size="small" onClick={() => navigate('/admin/feed-upload')}>
              View Feed Uploads →
            </Button>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Account</TableCell>
                  <TableCell>Template</TableCell>
                  <TableCell>ASINs</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No batches yet.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {batches.map((batch) => (
                  <TableRow key={batch._id} hover>
                    <TableCell>{typeof batch.seller === 'object' ? getSellerDisplayName(batch.seller) : 'Unknown'}</TableCell>
                    <TableCell>{typeof batch.template === 'object' ? batch.template?.name : 'Unknown'}</TableCell>
                    <TableCell>
                      {batch.foundCount}/{batch.targetCount}
                      {batch.shortfall && <Chip size="small" label="Shortfall" color="warning" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Chip
                          size="small"
                          label={batch.status}
                          color={batch.status === 'ready' ? 'primary' : batch.status === 'generated' ? 'success' : 'default'}
                          variant={batch.status === 'consumed' ? 'outlined' : 'filled'}
                        />
                        {batch.generation?.attempted && (
                          batch.generation.error ? (
                            <Tooltip title={batch.generation.error}>
                              <Chip size="small" label="Auto-save failed" color="error" variant="outlined" />
                            </Tooltip>
                          ) : batch.generation.saveSummary ? (
                            <Stack spacing={0.25}>
                              <Tooltip title={`bulk-preview: ${JSON.stringify(batch.generation.statusBreakdown || {})}`}>
                                <Typography variant="caption" color="text.secondary">
                                  Saved: {batch.generation.saveSummary.created} created, {batch.generation.saveSummary.updated} updated,{' '}
                                  {batch.generation.saveSummary.reactivated} reactivated, {batch.generation.saveSummary.failed} failed,{' '}
                                  {batch.generation.saveSummary.skipped} skipped
                                </Typography>
                              </Tooltip>
                              {batch.generation.feedUpload?.blockedByDailyLimit ? (
                                <Tooltip title="CSV was saved to CSV Storage but not uploaded — this seller hit its daily eBay upload limit.">
                                  <Chip size="small" label="Saved to CSV — daily limit reached" color="warning" variant="outlined" />
                                </Tooltip>
                              ) : batch.generation.feedUpload?.taskId ? (
                                <Tooltip title={`Feed task ${batch.generation.feedUpload.taskId} — check Feed Upload page for final created/failed counts`}>
                                  <Chip
                                    size="small"
                                    label={`Fed to eBay: ${batch.generation.feedUpload.listingCount} row(s) (task ${batch.generation.feedUpload.taskId.slice(-6)})`}
                                    color="success"
                                    variant="outlined"
                                  />
                                </Tooltip>
                              ) : batch.generation.feedUpload?.error ? (
                                <Tooltip title={batch.generation.feedUpload.error}>
                                  <Chip size="small" label="CSV export/feed upload failed" color="error" variant="outlined" />
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">Not fed to eBay (nothing saved)</Typography>
                              )}
                            </Stack>
                          ) : (
                            <Tooltip title={`bulk-preview: ${JSON.stringify(batch.generation.statusBreakdown || {})}`}>
                              <Typography variant="caption" color="text.secondary">Nothing qualified to auto-save</Typography>
                            </Tooltip>
                          )
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{new Date(batch.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Tooltip title={batch.status === 'generated' ? 'Already generated & saved — nothing to hand off' : 'Open in Template Listings Lab'}>
                        <span>
                          <IconButton size="small" onClick={() => openBatchInLab(batch)} disabled={batch.foundCount === 0 || batch.status === 'generated'}>
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? 'Edit Sourcing Rule' : 'New Sourcing Rule'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={templates}
                value={selectedTemplate}
                getOptionLabel={(t) => t?.name || ''}
                isOptionEqualToValue={(a, b) => a._id === b._id}
                onChange={(_, value) => setForm((prev) => ({ ...prev, templateId: value?._id || '' }))}
                renderInput={(params) => <TextField {...params} label="Template" placeholder="Search template" />}
              />
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Account (Seller)</InputLabel>
                <Select
                  label="Account (Seller)"
                  value={form.sellerId}
                  onChange={(e) => setForm((prev) => ({ ...prev, sellerId: e.target.value }))}
                >
                  {sellers.map((seller) => (
                    <MenuItem key={seller._id} value={seller._id}>{getSellerDisplayName(seller)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                sx={{ flex: 2 }}
                label="Amazon Search Keyword"
                value={form.searchKeyword}
                onChange={(e) => setForm((prev) => ({ ...prev, searchKeyword: e.target.value }))}
              />
              <TextField
                sx={{ flex: 1 }}
                label="Price From"
                type="number"
                value={form.priceMin}
                onChange={(e) => setForm((prev) => ({ ...prev, priceMin: e.target.value }))}
              />
              <TextField
                sx={{ flex: 1 }}
                label="Price To"
                type="number"
                value={form.priceMax}
                onChange={(e) => setForm((prev) => ({ ...prev, priceMax: e.target.value }))}
              />
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Region</InputLabel>
                <Select label="Region" value={form.region} onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}>
                  {MARKETPLACE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <TextField
              label="Target ASIN Count"
              type="number"
              value={form.targetAsinCount}
              onChange={(e) => setForm((prev) => ({ ...prev, targetAsinCount: e.target.value }))}
              helperText="How many qualifying ASINs each run should collect for this template/account"
            />

            <Typography variant="subtitle2" fontWeight={700}>Universal Filters</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                sx={{ flex: 1 }}
                label="Min Rating"
                type="number"
                value={form.filters.minRating}
                onChange={(e) => updateFilter('minRating', e.target.value)}
              />
              <TextField
                sx={{ flex: 1 }}
                label="Delivery Within (days)"
                type="number"
                value={form.filters.deliveryWithinDays}
                onChange={(e) => updateFilter('deliveryWithinDays', e.target.value)}
              />
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Stock</InputLabel>
                <Select label="Stock" value={form.filters.stock} onChange={(e) => updateFilter('stock', e.target.value)}>
                  <MenuItem value="all">All Stock</MenuItem>
                  <MenuItem value="in_stock">In Stock</MenuItem>
                  <MenuItem value="out_of_stock">Out of Stock</MenuItem>
                </Select>
              </FormControl>
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Active</InputLabel>
                <Select label="Active" value={form.filters.active} onChange={(e) => updateFilter('active', e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <TextField
              label="Exclude Keywords in Title"
              value={form.filters.excludeKeywords}
              onChange={(e) => updateFilter('excludeKeywords', e.target.value)}
              placeholder="e.g. universal, replacement, motorcycle"
              helperText="Comma-separated. Any ASIN whose title contains one of these (case-insensitive) is skipped — the run keeps searching further results to still hit the target count."
              fullWidth
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
              }
              label="Enabled (runs on the shared sourcing automation schedule)"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.autoGenerateAndSave}
                  onChange={(e) => setForm((prev) => ({ ...prev, autoGenerateAndSave: e.target.checked }))}
                  color="warning"
                />
              }
              label="Auto-generate, save (Active) & feed-upload to eBay — no human review"
            />
            {form.autoGenerateAndSave && (
              <Alert severity="warning" sx={{ mt: -1 }}>
                Generated listings are saved as <strong>Active</strong>, exported to CSV, saved to CSV Storage, and
                uploaded to eBay's Feed API immediately — same pipeline as the CSV Listings page's Download CSV
                button, with zero review. Check the Feed Upload page for final created/failed counts once eBay
                finishes processing. Only items that failed outright or were blocked (e.g. duplicate ASIN in
                another template) are skipped; items with minor warnings (e.g. missing description) are still
                saved and uploaded.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={saveRule} disabled={saving} sx={yellowFilledButtonSx}>
            {saving ? 'Saving…' : 'Save Rule'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Sourcing Rule?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will stop automated sourcing for {deleteTarget ? getTemplateName(deleteTarget) : ''}. Existing batches are kept.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} sx={yellowOutlinedButtonSx}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!historyRule} onClose={() => setHistoryRule(null)} maxWidth="md" fullWidth>
        <DialogTitle>Run History{historyRule ? ` — ${getTemplateName(historyRule)}` : ''}</DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <Stack alignItems="center" py={4}><CircularProgress /></Stack>
          ) : historyRuns.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No runs yet for this rule.</Typography>
          ) : (
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Stage / Outcome</TableCell>
                    <TableCell>ASINs</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyRuns.map((run) => (
                    <TableRow key={run._id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(run.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip size="small" label={run.trigger} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={run.status}
                          color={run.status === 'done' ? 'success' : run.status === 'failed' ? 'error' : run.status === 'processing' ? 'info' : 'default'}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography variant="body2" noWrap title={run.summary || run.error || run.stageDetail}>
                          {run.status === 'failed'
                            ? (run.error || 'Failed')
                            : run.summary || RUN_STAGE_LABELS[run.stage] || run.stageDetail || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {run.foundCount != null ? `${run.foundCount}/${run.targetCount ?? '—'}` : '—'}
                        {run.shortfall && <Chip size="small" label="Shortfall" color="warning" sx={{ ml: 1 }} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryRule(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </AdminPageShell>
  );
}
