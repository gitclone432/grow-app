import { useCallback, useEffect, useRef, useState } from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/Image';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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

  const fileInputRef = useRef(null);

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
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      setSuccess('Settings saved. New ASIN scrapes will use this overlay when enabled.');
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
      setSuccess('Overlay image uploaded.');
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

  const runPreview = async () => {
    const sampleImageUrl = String(previewUrl || '').trim();
    if (!sampleImageUrl) {
      setError('Enter a sample product image URL to preview.');
      return;
    }
    setPreviewing(true);
    setError('');
    setPreviewResult(null);
    try {
      const { data } = await api.post('/image-overlay-settings/preview', {
        sampleImageUrl,
        badgeName: activeBadge,
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
        Upload a frame/template PNG with a transparent center. The Amazon product photo is placed
        inside that window; the overlay border and text sit on top. Processed images are hosted on
        ImgBB.
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
          Server <code>IMGBB_API_KEY</code> is not set. Upload overlays here, but watermarking on
          listings will not run until ImgBB is configured in the API <code>.env</code>.
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Apply on scraped images
        </Typography>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            }
            label="Enable overlay on fetched Amazon images (ASIN auto-fill)"
          />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="active-badge-label">Active overlay</InputLabel>
                <Select
                  labelId="active-badge-label"
                  label="Active overlay"
                  value={badges.some((b) => b.name === activeBadge) ? activeBadge : ''}
                  onChange={(e) => setActiveBadge(e.target.value)}
                  displayEmpty
                >
                  {badges.length === 0 ? (
                    <MenuItem value="" disabled>
                      Upload an overlay first
                    </MenuItem>
                  ) : (
                    badges.map((b) => (
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
                helperText="How many gallery images get the overlay (default 3)"
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
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Upload overlay image
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

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Saved overlays
        </Typography>
        {badges.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No overlays yet. Upload one above.
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
                {badges.map((b) => (
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

      <Paper sx={{ p: 2 }}>
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
          <Button
            variant="outlined"
            startIcon={<ImageIcon />}
            onClick={runPreview}
            disabled={previewing || !imgbbConfigured}
          >
            {previewing ? 'Processing…' : 'Preview with active overlay'}
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
    </Box>
  );
}
