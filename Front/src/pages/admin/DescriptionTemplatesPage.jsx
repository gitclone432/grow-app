import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  fetchDescriptionTemplateGallery,
  LEGACY_DESCRIPTION_TEMPLATES_KEY,
  saveDescriptionTemplates,
} from '../../lib/descriptionTemplateGalleryApi.js';

export default function DescriptionTemplatesPage() {
  const [title, setTitle] = useState('');
  const [htmlInput, setHtmlInput] = useState('');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hydratedOnce, setHydratedOnce] = useState(false);

  /** @type {{ id: string, title: string, html: string } | null} Editing payload; null = dialog closed. */
  const [editDialog, setEditDialog] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setSaveError('');
      try {
        let { templates: serverTemplates } = await fetchDescriptionTemplateGallery();

        if (!cancelled && (!serverTemplates?.length)) {
          try {
            const raw = localStorage.getItem(LEGACY_DESCRIPTION_TEMPLATES_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed) && parsed.length) {
              await saveDescriptionTemplates(parsed);
              ({ templates: serverTemplates } = await fetchDescriptionTemplateGallery());
              localStorage.removeItem(LEGACY_DESCRIPTION_TEMPLATES_KEY);
            }
          } catch (e) {
            console.warn('Legacy description template migrate skipped:', e?.message || e);
          }
        }

        if (!cancelled) {
          setTemplates(Array.isArray(serverTemplates) ? serverTemplates : []);
        }
      } catch (e) {
        console.error('Failed to load description templates', e);
        if (!cancelled) {
          setSaveError(e?.response?.data?.error || 'Failed to load templates from server');
          setTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHydratedOnce(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistTemplates = async (next) => {
    if (!hydratedOnce) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveDescriptionTemplates(next);
      setTemplates(next);
    } catch (e) {
      console.error(e);
      setSaveError(e?.response?.data?.error || 'Failed to save templates');
      try {
        const { templates: refreshed } = await fetchDescriptionTemplateGallery();
        setTemplates(Array.isArray(refreshed) ? refreshed : []);
      } catch (_) {
        /* ignore */
      }
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = async () => {
    if (!htmlInput.trim()) return;
    const template = {
      id: `${Date.now()}`,
      title: title.trim() || `Template ${templates.length + 1}`,
      html: htmlInput,
    };
    const next = [template, ...templates];
    setTitle('');
    setHtmlInput('');
    await persistTemplates(next);
  };

  const clearAll = async () => {
    if (!templates.length && !hydratedOnce) return;
    const ok = window.confirm('Remove all templates from the server? This affects every user.');
    if (!ok) return;
    await persistTemplates([]);
  };

  const openEditDialog = (template) => {
    setEditDialog({
      id: String(template?.id ?? ''),
      title: String(template?.title ?? ''),
      html: String(template?.html ?? ''),
    });
  };

  const closeEditDialog = () => setEditDialog(null);

  const saveEditedTemplate = async () => {
    if (!editDialog?.id.trim()) return;
    if (!editDialog.html.trim()) {
      setSaveError('HTML cannot be empty');
      return;
    }
    setSaveError('');
    const name = editDialog.title.trim() || editDialog.id;
    const next = templates.map((t) =>
      String(t.id) === String(editDialog.id) ? { ...t, title: name, html: editDialog.html } : t
    );
    setSaving(true);
    try {
      await saveDescriptionTemplates(next);
      setTemplates(next);
      closeEditDialog();
    } catch (e) {
      console.error(e);
      setSaveError(e?.response?.data?.error || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template) => {
    const id = String(template?.id ?? '');
    if (!id) return;
    const ok = window.confirm(
      `Delete template "${template?.title || id}"? Stores using this template will need a new assignment.`
    );
    if (!ok) return;
    const next = templates.filter((t) => String(t.id) !== id);
    await persistTemplates(next);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Description Templates
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
        Templates are saved to the database and shared across the team. Stores assign a template under
        Settings → Stores → Edit store (Description Template).
      </Typography>

      {saveError ? <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert> : null}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
          <CircularProgress size={22} />
          <Typography variant="body2">Loading templates…</Typography>
        </Box>
      ) : null}

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2, opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
        <Stack spacing={1.5}>
          <TextField
            label="Template Name (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            disabled={saving || loading}
          />
          <TextField
            label="HTML Code"
            value={htmlInput}
            onChange={(e) => setHtmlInput(e.target.value)}
            multiline
            minRows={8}
            fullWidth
            placeholder="<div>Paste your template HTML here...</div>"
            disabled={saving || loading}
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={() => void addTemplate()} disabled={saving || loading}>
              Add Template
            </Button>
            <Button variant="outlined" color="error" onClick={() => void clearAll()} disabled={saving || loading}>
              Clear All
            </Button>
            {saving ? <CircularProgress size={22} /> : null}
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        {templates.map((template) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={template.id}>
            <Card sx={{ borderRadius: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <CardMedia sx={{ height: 190, borderBottom: '1px solid #eee' }}>
                <iframe
                  title={`preview-${template.id}`}
                  srcDoc={template.html}
                  style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
                  sandbox=""
                />
              </CardMedia>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {template.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  English
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                  ID: {template.id}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-end', pt: 0, px: 1, pb: 1 }}>
                <Tooltip title="Edit template">
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => openEditDialog(template)}
                    disabled={saving || loading}
                    aria-label="Edit template"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete template">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => void deleteTemplate(template)}
                    disabled={saving || loading}
                    aria-label="Delete template"
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={Boolean(editDialog)} onClose={closeEditDialog} fullWidth maxWidth="md">
        <DialogTitle>Edit description template</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Template ID (read-only)"
              value={editDialog?.id || ''}
              fullWidth
              size="small"
              disabled
              helperText="Store assignments use this ID; it does not change when you save."
            />
            <TextField
              label="Template name"
              value={editDialog?.title || ''}
              onChange={(e) => setEditDialog((d) => (d ? { ...d, title: e.target.value } : d))}
              fullWidth
              disabled={saving}
            />
            <TextField
              label="HTML"
              value={editDialog?.html || ''}
              onChange={(e) => setEditDialog((d) => (d ? { ...d, html: e.target.value } : d))}
              multiline
              minRows={12}
              fullWidth
              disabled={saving}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEditDialog} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveEditedTemplate()} disabled={saving}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
