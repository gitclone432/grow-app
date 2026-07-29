import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/Image';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api.js';

const DEFAULT_TEXT_OVERLAY = {
  enabled: false,
  sourceField: 'custom',
  customText: '',
  position: 'bottom',
  fontSize: 0,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.55,
};

export default function ImageOverlaySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [activeBadge, setActiveBadge] = useState('usa-seller');
  const [maxImages, setMaxImages] = useState(3);
  const [framePaddingPercent, setFramePaddingPercent] = useState(0);
  const [outputMaxPx, setOutputMaxPx] = useState(1600);
  const [badges, setBadges] = useState([]);
  const [imgbbConfigured, setImgbbConfigured] = useState(false);

  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [previewBadgeName, setPreviewBadgeName] = useState('');

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateOverlayFile, setTemplateOverlayFile] = useState(null);
  const [templateUploading, setTemplateUploading] = useState(false);
  const [templateSavingId, setTemplateSavingId] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [textOverlayForm, setTextOverlayForm] = useState({ ...DEFAULT_TEXT_OVERLAY });
  const [textSaving, setTextSaving] = useState(false);
  const [textPreviewing, setTextPreviewing] = useState(false);
  const [textPreviewUrl, setTextPreviewUrl] = useState('');
  const [textPreviewSample, setTextPreviewSample] = useState('USA Seller');
  const [textPreviewResult, setTextPreviewResult] = useState(null);

  const fileInputRef = useRef(null);
  const templateFileRef = useRef(null);

  const globalBadges = useMemo(
    () => badges.filter((b) => !String(b.name || '').startsWith('tpl-')),
    [badges]
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t._id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );

  const loadTemplates = useCallback(async () => {
    const { data } = await api.get('/image-overlay-settings/templates');
    const rows = Array.isArray(data?.templates) ? data.templates : [];
    setTemplates(rows);
    setSelectedTemplateId((prev) => {
      if (prev && rows.some((t) => String(t._id) === String(prev))) return prev;
      return rows[0]?._id ? String(rows[0]._id) : '';
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/image-overlay-settings');
      const s = data?.settings || {};
      setEnabled(Boolean(s.enabled));
      setActiveBadge(s.activeBadge || 'usa-seller');
      setMaxImages(Number(s.maxImages) || 3);
      setFramePaddingPercent(
        Number.isFinite(Number(s.framePaddingPercent)) ? Number(s.framePaddingPercent) : 0
      );
      setOutputMaxPx(Number(s.outputMaxPx) || 1600);
      setBadges(Array.isArray(data?.badges) ? data.badges : []);
      setImgbbConfigured(Boolean(data?.imgbbConfigured));
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [loadTemplates]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedTemplate?.imageOverlay?.badgeName) {
      setPreviewBadgeName(selectedTemplate.imageOverlay.badgeName);
    }
  }, [selectedTemplateId, selectedTemplate?.imageOverlay?.badgeName]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTextOverlayForm({ ...DEFAULT_TEXT_OVERLAY });
      return;
    }
    const t = selectedTemplate.textOverlay || {};
    setTextOverlayForm({
      enabled: Boolean(t.enabled),
      sourceField: t.sourceField || 'custom',
      customText: t.customText || '',
      position: t.position || 'bottom',
      fontSize: Number(t.fontSize) || 0,
      textColor: t.textColor || '#FFFFFF',
      backgroundColor: t.backgroundColor || '#000000',
      backgroundOpacity: Number.isFinite(Number(t.backgroundOpacity))
        ? Number(t.backgroundOpacity)
        : 0.55,
    });
    if (t.customText) {
      setTextPreviewSample(t.customText);
    }
  }, [selectedTemplateId, selectedTemplate]);

  const saveTextOverlay = async () => {
    if (!selectedTemplateId) {
      setError('Select a template first.');
      return;
    }
    setTextSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.put(`/image-overlay-settings/templates/${selectedTemplateId}/text-overlay`, textOverlayForm);
      setSuccess('Text overlay settings saved for this template.');
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to save text overlay');
    } finally {
      setTextSaving(false);
    }
  };

  const runTextPreview = async () => {
    const sampleImageUrl = String(textPreviewUrl || '').trim();
    const text = String(textPreviewSample || '').trim();
    if (!sampleImageUrl) {
      setError('Enter a sample product image URL to preview text overlay.');
      return;
    }
    if (!text) {
      setError('Enter sample text to draw on the image.');
      return;
    }
    setTextPreviewing(true);
    setError('');
    setTextPreviewResult(null);
    try {
      const { data } = await api.post('/image-overlay-settings/preview-text', {
        sampleImageUrl,
        text,
        ...textOverlayForm,
        enabled: true,
      });
      setTextPreviewResult(data);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Text preview failed');
    } finally {
      setTextPreviewing(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.put('/image-overlay-settings', {
        enabled,
        activeBadge,
        maxImages: Number(maxImages) || 3,
        overlayMode: 'frame',
        framePaddingPercent: Number(framePaddingPercent) || 0,
        outputMaxPx: Number(outputMaxPx) || 1600,
      });
      setSuccess('Global settings saved. Used only when a template has no overlay of its own.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const uploadBadge = async () => {
    if (!uploadFile) {
      setError('Choose a PNG, JPG, or WebP file to upload.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      if (uploadName.trim()) form.append('name', uploadName.trim());
      await api.post('/image-overlay-settings/badges', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Global overlay image uploaded.');
      setUploadFile(null);
      setUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteBadge = async (name) => {
    if (!window.confirm(`Delete overlay "${name}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/image-overlay-settings/badges/${encodeURIComponent(name)}`);
      setSuccess(`Deleted overlay "${name}".`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Delete failed');
    }
  };

  const uploadTemplateOverlay = async () => {
    if (!selectedTemplateId) {
      setError('Select a template first.');
      return;
    }
    if (!templateOverlayFile) {
      setError('Choose a PNG with a transparent center for this template.');
      return;
    }
    setTemplateUploading(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData();
      form.append('file', templateOverlayFile);
      const { data } = await api.post(
        `/image-overlay-settings/templates/${selectedTemplateId}/overlay`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setSuccess(
        `Overlay set for "${data?.template?.name || 'template'}". Applied to the 1st scraped image.`
      );
      setTemplateOverlayFile(null);
      if (templateFileRef.current) templateFileRef.current.value = '';
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Template overlay upload failed');
    } finally {
      setTemplateUploading(false);
    }
  };

  const toggleTemplateOverlay = async (templateId, enabledValue) => {
    setTemplateSavingId(String(templateId));
    setError('');
    setSuccess('');
    try {
      await api.put(`/image-overlay-settings/templates/${templateId}`, {
        enabled: enabledValue,
      });
      setSuccess(enabledValue ? 'Template overlay enabled.' : 'Template overlay disabled.');
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to update template overlay');
    } finally {
      setTemplateSavingId('');
    }
  };

  const removeTemplateOverlay = async (templateId, templateName) => {
    if (!window.confirm(`Remove overlay from "${templateName}"?`)) return;
    setTemplateSavingId(String(templateId));
    setError('');
    setSuccess('');
    try {
      await api.delete(`/image-overlay-settings/templates/${templateId}/overlay`);
      setSuccess(`Removed overlay from "${templateName}".`);
      setTemplateOverlayFile(null);
      if (templateFileRef.current) templateFileRef.current.value = '';
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to remove template overlay');
    } finally {
      setTemplateSavingId('');
    }
  };

  const runPreview = async () => {
    const sampleImageUrl = String(previewUrl || '').trim();
    if (!sampleImageUrl) {
      setError('Enter a sample product image URL to preview.');
      return;
    }
    const badgeName =
      previewBadgeName
      || selectedTemplate?.imageOverlay?.badgeName
      || activeBadge;
    if (!badgeName) {
      setError('Select an overlay (template or global) to preview.');
      return;
    }
    setPreviewing(true);
    setError('');
    setPreviewResult(null);
    try {
      const { data } = await api.post('/image-overlay-settings/preview', {
        sampleImageUrl,
        badgeName,
      });
      setPreviewResult(data);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        Image overlay
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <strong>Frame overlay</strong> stamps a PNG frame on the first scraped image.
        <strong> Text overlay</strong> draws scraped Amazon text (brand, title, price) on that image.
        Both are configured per listing template and saved with the listing via ImgBB.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      ) : null}

      {!imgbbConfigured ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <code>IMGBB_API_KEY</code> is missing on the <strong>API server</strong> (e.g. Render →
          Environment), not Vercel. Add the key from{' '}
          <a href="https://api.imgbb.com/" target="_blank" rel="noreferrer">
            api.imgbb.com
          </a>
          , redeploy/restart the API, then refresh this page.
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Frame overlay" />
        <Tab label="Text overlay" />
      </Tabs>

      {activeTab === 1 && (
        <Stack spacing={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Custom / scraped text on 1st image
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Type custom text to stamp on the first scraped image, or pull brand / title / price from
              Amazon. Text is drawn after any frame overlay and saved with the listing via ImgBB.
            </Typography>

            {templates.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No listing templates found.
              </Typography>
            ) : (
              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel id="text-template-label">Template</InputLabel>
                  <Select
                    labelId="text-template-label"
                    label="Template"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <MenuItem key={t._id} value={String(t._id)}>
                        {t.name}
                        {t.textOverlay?.enabled ? ' · ON' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(textOverlayForm.enabled)}
                      onChange={(e) =>
                        setTextOverlayForm((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                    />
                  }
                  label="Enable text overlay on 1st scraped image"
                />

                <TextField
                  fullWidth
                  size="small"
                  label="Custom text to overlay"
                  placeholder="e.g. USA SELLER · Fast Shipping"
                  value={textOverlayForm.customText}
                  onChange={(e) => {
                    const customText = e.target.value;
                    setTextOverlayForm((prev) => ({
                      ...prev,
                      customText,
                      sourceField: 'custom',
                    }));
                    setTextPreviewSample(customText || 'USA Seller');
                  }}
                  helperText="This text is stamped on the 1st image for every listing using this template."
                  multiline
                  minRows={2}
                  inputProps={{ maxLength: 500 }}
                />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="text-source-label">Text source</InputLabel>
                      <Select
                        labelId="text-source-label"
                        label="Text source"
                        value={textOverlayForm.sourceField}
                        onChange={(e) =>
                          setTextOverlayForm((prev) => ({ ...prev, sourceField: e.target.value }))
                        }
                      >
                        <MenuItem value="custom">Custom text (above)</MenuItem>
                        <MenuItem value="brand">Scraped brand</MenuItem>
                        <MenuItem value="title">Scraped title</MenuItem>
                        <MenuItem value="price">Scraped price</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="text-position-label">Position</InputLabel>
                      <Select
                        labelId="text-position-label"
                        label="Position"
                        value={textOverlayForm.position}
                        onChange={(e) =>
                          setTextOverlayForm((prev) => ({ ...prev, position: e.target.value }))
                        }
                      >
                        <MenuItem value="top">Top banner</MenuItem>
                        <MenuItem value="bottom">Bottom banner</MenuItem>
                        <MenuItem value="center">Center banner</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Font size (0 = auto)"
                      inputProps={{ min: 0, max: 120 }}
                      value={textOverlayForm.fontSize}
                      onChange={(e) =>
                        setTextOverlayForm((prev) => ({
                          ...prev,
                          fontSize: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Text color"
                      value={textOverlayForm.textColor}
                      onChange={(e) =>
                        setTextOverlayForm((prev) => ({ ...prev, textColor: e.target.value }))
                      }
                      helperText="e.g. #FFFFFF"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Banner color"
                      value={textOverlayForm.backgroundColor}
                      onChange={(e) =>
                        setTextOverlayForm((prev) => ({
                          ...prev,
                          backgroundColor: e.target.value,
                        }))
                      }
                      helperText="e.g. #000000"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Banner opacity"
                      inputProps={{ min: 0, max: 1, step: 0.05 }}
                      value={textOverlayForm.backgroundOpacity}
                      onChange={(e) =>
                        setTextOverlayForm((prev) => ({
                          ...prev,
                          backgroundOpacity: Number(e.target.value),
                        }))
                      }
                      helperText="0 = transparent, 1 = solid"
                    />
                  </Grid>
                </Grid>

                <Button
                  variant="contained"
                  onClick={saveTextOverlay}
                  disabled={
                    textSaving
                    || !selectedTemplateId
                    || (textOverlayForm.enabled
                      && textOverlayForm.sourceField === 'custom'
                      && !String(textOverlayForm.customText || '').trim())
                  }
                >
                  {textSaving ? 'Saving…' : 'Save text overlay'}
                </Button>
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Test text preview
            </Typography>
            <Stack spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Sample product image URL"
                placeholder="https://m.media-amazon.com/images/..."
                value={textPreviewUrl}
                onChange={(e) => setTextPreviewUrl(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Sample text to draw"
                value={textPreviewSample}
                onChange={(e) => setTextPreviewSample(e.target.value)}
                helperText="Use this to simulate scraped brand/title before a real scrape"
              />
              <Button
                variant="outlined"
                startIcon={<ImageIcon />}
                onClick={runTextPreview}
                disabled={textPreviewing || !imgbbConfigured}
              >
                {textPreviewing ? 'Processing…' : 'Preview text on image'}
              </Button>
              {textPreviewResult ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          Original
                        </Typography>
                        <Box
                          component="img"
                          src={textPreviewResult.originalUrl}
                          alt="Original"
                          sx={{ width: '100%', maxHeight: 320, objectFit: 'contain' }}
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          With text ({textPreviewResult.text})
                        </Typography>
                        <Box
                          component="img"
                          src={textPreviewResult.processedUrl}
                          alt="Processed"
                          sx={{ width: '100%', maxHeight: 320, objectFit: 'contain' }}
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      )}

      {activeTab === 0 && (
      <>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Template overlays
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a template, upload its frame, enable it, and test with a sample image URL below.
        </Typography>

        {templates.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No listing templates found.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="template-overlay-label">Template</InputLabel>
              <Select
                labelId="template-overlay-label"
                label="Template"
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  setTemplateOverlayFile(null);
                  if (templateFileRef.current) templateFileRef.current.value = '';
                }}
              >
                {templates.map((t) => (
                  <MenuItem key={t._id} value={String(t._id)}>
                    {t.name}
                    {t.imageOverlay?.enabled ? ' · ON' : t.imageOverlay?.badgeName ? ' · uploaded' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedTemplate ? (
              <>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(selectedTemplate.imageOverlay?.enabled)}
                      disabled={
                        !selectedTemplate.imageOverlay?.badgeName
                        || templateSavingId === String(selectedTemplate._id)
                      }
                      onChange={(e) =>
                        toggleTemplateOverlay(selectedTemplate._id, e.target.checked)
                      }
                    />
                  }
                  label="Enable overlay on 1st scraped image for this template"
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                  <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                    Choose file
                    <input
                      ref={templateFileRef}
                      type="file"
                      hidden
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      onChange={(e) => setTemplateOverlayFile(e.target.files?.[0] || null)}
                    />
                  </Button>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    {templateOverlayFile
                      ? templateOverlayFile.name
                      : selectedTemplate.imageOverlay?.originalFilename
                        || 'PNG with transparency recommended'}
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={uploadTemplateOverlay}
                    disabled={templateUploading || !templateOverlayFile}
                  >
                    {templateUploading ? 'Uploading…' : 'Upload / replace'}
                  </Button>
                  {selectedTemplate.imageOverlay?.badgeName ? (
                    <Button
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      disabled={templateSavingId === String(selectedTemplate._id)}
                      onClick={() =>
                        removeTemplateOverlay(selectedTemplate._id, selectedTemplate.name)
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </Stack>

                {selectedTemplate.imageOverlay?.previewUrl ? (
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                      component="img"
                      src={selectedTemplate.imageOverlay.previewUrl}
                      alt={selectedTemplate.name}
                      sx={{
                        width: 96,
                        height: 96,
                        objectFit: 'contain',
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                      }}
                    />
                    <Box>
                      <Chip
                        size="small"
                        color={selectedTemplate.imageOverlay.enabled ? 'success' : 'default'}
                        label={selectedTemplate.imageOverlay.enabled ? 'Enabled' : 'Disabled'}
                        sx={{ mb: 0.5 }}
                      />
                      <Typography variant="body2">
                        {selectedTemplate.imageOverlay.originalFilename
                          || selectedTemplate.imageOverlay.badgeName}
                      </Typography>
                    </Box>
                  </Stack>
                ) : null}
              </>
            ) : null}

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Template</TableCell>
                    <TableCell>Preview</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.map((t) => {
                    const overlay = t.imageOverlay || {};
                    const selected = String(t._id) === String(selectedTemplateId);
                    return (
                      <TableRow
                        key={t._id}
                        hover
                        selected={selected}
                        onClick={() => setSelectedTemplateId(String(t._id))}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{t.name}</TableCell>
                        <TableCell>
                          {overlay.previewUrl ? (
                            <Box
                              component="img"
                              src={overlay.previewUrl}
                              alt=""
                              sx={{
                                width: 48,
                                height: 48,
                                objectFit: 'contain',
                                bgcolor: 'grey.100',
                                borderRadius: 1,
                              }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {overlay.enabled ? (
                            <Chip size="small" color="success" label="ON" />
                          ) : overlay.badgeName ? (
                            <Chip size="small" label="Uploaded" variant="outlined" />
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              None
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          {overlay.badgeName ? (
                            <Button
                              size="small"
                              color="error"
                              disabled={templateSavingId === String(t._id)}
                              onClick={() => removeTemplateOverlay(t._id, t.name)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Test preview
        </Typography>
        <Stack spacing={2}>
          <TextField
            fullWidth
            size="small"
            label="Sample product image URL"
            placeholder="https://m.media-amazon.com/images/..."
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
          />
          <FormControl fullWidth size="small">
            <InputLabel id="preview-badge-label">Overlay to test</InputLabel>
            <Select
              labelId="preview-badge-label"
              label="Overlay to test"
              value={previewBadgeName || ''}
              onChange={(e) => setPreviewBadgeName(e.target.value)}
            >
              {selectedTemplate?.imageOverlay?.badgeName ? (
                <MenuItem value={selectedTemplate.imageOverlay.badgeName}>
                  Template: {selectedTemplate.name}
                </MenuItem>
              ) : null}
              {globalBadges.map((b) => (
                <MenuItem key={b.name} value={b.name}>
                  Global: {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<ImageIcon />}
            onClick={runPreview}
            disabled={previewing || !imgbbConfigured}
          >
            {previewing ? 'Processing…' : 'Preview overlay'}
          </Button>
          {previewResult ? (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      Original
                    </Typography>
                    <Box
                      component="img"
                      src={previewResult.originalUrl}
                      alt="Original"
                      sx={{ width: '100%', maxHeight: 320, objectFit: 'contain' }}
                    />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      With overlay ({previewResult.badgeName})
                    </Typography>
                    <Box
                      component="img"
                      src={previewResult.processedUrl}
                      alt="Processed"
                      sx={{ width: '100%', maxHeight: 320, objectFit: 'contain' }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Global fallback (optional)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Used only when the selected listing template does not have its own overlay enabled.
        </Typography>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            }
            label="Enable global overlay on fetched Amazon images"
          />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="active-badge-label">Active global overlay</InputLabel>
                <Select
                  labelId="active-badge-label"
                  label="Active global overlay"
                  value={globalBadges.some((b) => b.name === activeBadge) ? activeBadge : ''}
                  onChange={(e) => setActiveBadge(e.target.value)}
                  displayEmpty
                >
                  {globalBadges.length === 0 ? (
                    <MenuItem value="" disabled>
                      Upload an overlay first
                    </MenuItem>
                  ) : (
                    globalBadges.map((b) => (
                      <MenuItem key={b.name} value={b.name}>
                        {b.name}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Max images per product"
                inputProps={{ min: 1, max: 12 }}
                value={maxImages}
                onChange={(e) => setMaxImages(e.target.value)}
                helperText="Global only — template overlays always use the 1st image"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Frame inset (% per edge)"
                inputProps={{ min: 0, max: 40 }}
                value={framePaddingPercent}
                onChange={(e) => setFramePaddingPercent(e.target.value)}
                helperText="0 = product fills the frame with no margin (recommended)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Output max resolution (px)"
                inputProps={{ min: 400, max: 2400 }}
                value={outputMaxPx}
                onChange={(e) => setOutputMaxPx(e.target.value)}
                helperText="Uses higher-res Amazon URL when available (up to 1500px)"
              />
            </Grid>
          </Grid>
          <Button variant="contained" onClick={saveSettings} disabled={saving || !activeBadge}>
            {saving ? 'Saving…' : 'Save global settings'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Upload global overlay image
        </Typography>
        <Stack spacing={2}>
          <TextField
            size="small"
            label="Badge name (optional)"
            placeholder="usa-seller"
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            helperText="Letters, numbers, hyphens. Defaults to the file name."
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
              Choose file
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {uploadFile ? uploadFile.name : 'PNG with transparency recommended'}
            </Typography>
            <Button
              variant="contained"
              onClick={uploadBadge}
              disabled={uploading || !uploadFile}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Saved global overlays
        </Typography>
        {globalBadges.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No global overlays yet. Upload one above (optional).
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Preview</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {globalBadges.map((b) => (
                  <TableRow key={b.name} selected={b.name === activeBadge}>
                    <TableCell>
                      <Box
                        component="img"
                        src={b.previewUrl}
                        alt={b.name}
                        sx={{
                          width: 72,
                          height: 72,
                          objectFit: 'contain',
                          bgcolor: 'grey.100',
                          borderRadius: 1,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {b.name}
                      {b.name === activeBadge ? (
                        <Typography component="span" variant="caption" color="primary" sx={{ ml: 1 }}>
                          (active)
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{b.filename}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteOutlineIcon />}
                        onClick={() => deleteBadge(b.name)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      </>
      )}
    </Box>
  );
}
