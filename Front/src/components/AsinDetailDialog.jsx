import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  Grid,
  Paper,
  TextField,
  Alert,
  CircularProgress,
  FormControl,
  Select,
  MenuItem
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  ErrorOutline as ErrorIcon,
  BrokenImage as BrokenImageIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  OpenInNew as OpenInNewIcon,
  WarningAmber as WarningAmberIcon,
  DriveFileRenameOutline as ManualEditIcon
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import api from '../lib/api.js';

const AMAZON_DOMAINS = {
  US: 'amazon.com',
  UK: 'amazon.co.uk',
  CA: 'amazon.ca',
  AU: 'amazon.com.au'
};

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: '🇺🇸 US' },
  { value: 'UK', label: '🇬🇧 UK' },
  { value: 'CA', label: '🇨🇦 CA' },
  { value: 'AU', label: '🇦🇺 AU' }
];

/** Renders a static label + value row; returns null if value is empty. */
function DetailRow({ label, value, mono }) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ mt: 0.25, fontFamily: mono ? 'monospace' : 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/** Always-visible row — shows a warning chip when value is empty. */
function RequiredDetailRow({ label, value, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
        {label}
      </Typography>
      {value ? (
        children || (
          <Typography variant="body2" sx={{ mt: 0.25 }}>
            {value}
          </Typography>
        )
      ) : (
        <Chip
          icon={<WarningAmberIcon fontSize="small" />}
          label="Missing"
          color="warning"
          size="small"
          sx={{ mt: 0.5 }}
        />
      )}
    </Box>
  );
}

export default function AsinDetailDialog({ open, onClose, asin, onUpdate }) {
  const [copiedAsin, setCopiedAsin] = useState(false);
  const [imgErrors, setImgErrors] = useState({});

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Amazon link region — defaults to the marketplace the ASIN was scraped from
  const [amazonRegion, setAmazonRegion] = useState('US');

  useEffect(() => {
    if (open && asin?.region) {
      setAmazonRegion(asin.region);
    }
  }, [open, asin?.region]);

  if (!asin) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(asin.asin);
    setCopiedAsin(true);
    setTimeout(() => setCopiedAsin(false), 1500);
  };

  const handleImgError = (idx) => setImgErrors(prev => ({ ...prev, [idx]: true }));

  const handleOpenAmazon = () => {
    const domain = AMAZON_DOMAINS[amazonRegion] || 'amazon.com';
    window.open(`https://www.${domain}/dp/${asin.asin}`, '_blank', 'noopener,noreferrer');
  };

  const handleEnterEdit = () => {
    setEditPrice(asin.price || '');
    setEditDescription(asin.description || '');
    setSaveError('');
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setSaveError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.patch(`/asin-directory/${asin._id}`, {
        price: editPrice,
        description: editDescription
      });
      setEditMode(false);
      if (onUpdate) onUpdate(data);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const scrapeDate = asin.scrapedAt ? new Date(asin.scrapedAt).toLocaleString() : null;
  const addedDate = asin.addedAt ? new Date(asin.addedAt).toLocaleString() : null;
  const editedDate = asin.manuallyEditedAt ? new Date(asin.manuallyEditedAt).toLocaleString() : null;

  const displayPrice = editMode ? editPrice : (asin.price || '');
  const displayDescription = editMode ? editDescription : (asin.description || '');

  return (
    <Dialog open={open} onClose={editMode ? undefined : onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          {/* Scrape status */}
          {asin.scraped ? (
            <Chip icon={<CheckIcon />} label="Scraped" color="success" size="small" />
          ) : (
            <Chip icon={<ErrorIcon />} label="Not Scraped" color="warning" size="small" />
          )}
          {asin.manuallyEdited && (
            <Chip icon={<ManualEditIcon />} label="Manually Edited" color="info" size="small" />
          )}

          <Typography variant="h6" fontWeight={700} component="span">
            {asin.asin}
          </Typography>

          <Tooltip title={copiedAsin ? 'Copied!' : 'Copy ASIN'}>
            <IconButton size="small" onClick={handleCopy}>
              {copiedAsin ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Open on Amazon — compact region picker + link button */}
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 'auto' }}>
            <FormControl size="small">
              <Select
                value={amazonRegion}
                onChange={(e) => setAmazonRegion(e.target.value)}
                variant="outlined"
                size="small"
                sx={{ fontSize: '0.75rem', '& .MuiSelect-select': { py: 0.5, px: 1 } }}
              >
                {MARKETPLACE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.85rem' }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Open on Amazon">
              <IconButton size="small" onClick={handleOpenAmazon} color="primary">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <IconButton
          size="small"
          onClick={editMode ? undefined : onClose}
          disabled={editMode}
          sx={{ position: 'absolute', top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent>
        <Stack spacing={3}>

          {/* ── Images ─────────────────────────────────────────────────── */}
          {asin.images?.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Images ({asin.images.length})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {asin.images.map((url, idx) => (
                  <Box key={idx}>
                    {!imgErrors[idx] ? (
                      <Box
                        component="img"
                        src={url}
                        alt={`${asin.asin}-${idx}`}
                        onError={() => handleImgError(idx)}
                        sx={{
                          width: 96, height: 96, objectFit: 'contain',
                          border: '1px solid', borderColor: 'divider',
                          borderRadius: 1, bgcolor: 'white'
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 96, height: 96, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', border: '1px solid', borderColor: 'divider',
                          borderRadius: 1, bgcolor: 'grey.100'
                        }}
                      >
                        <BrokenImageIcon sx={{ color: 'grey.400' }} />
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {/* ── Core product info ───────────────────────────────────────── */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Product Information
              </Typography>
              {!editMode && (
                <Tooltip title="Edit price & description">
                  <IconButton size="small" onClick={handleEnterEdit}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <DetailRow label="Title" value={asin.title} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <DetailRow label="Brand" value={asin.brand} />
                </Grid>

                {/* Price — always visible, editable */}
                <Grid item xs={6} sm={4}>
                  {editMode ? (
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                        Price (USD)
                      </Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        placeholder="e.g. 29.99"
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ mt: 0.5 }}
                        fullWidth
                      />
                    </Box>
                  ) : (
                    <RequiredDetailRow label="Price" value={displayPrice}>
                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                        ${parseFloat(displayPrice).toFixed(2)}
                      </Typography>
                    </RequiredDetailRow>
                  )}
                </Grid>

                <Grid item xs={6} sm={4}>
                  <DetailRow label="Model" value={asin.model} mono />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <DetailRow label="Color" value={asin.color} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <DetailRow label="Size" value={asin.size} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <DetailRow label="Material" value={asin.material} />
                </Grid>
                {asin.specialFeatures && (
                  <Grid item xs={12}>
                    <DetailRow label="Special Features" value={asin.specialFeatures} />
                  </Grid>
                )}
                {asin.compatibility && (
                  <Grid item xs={12}>
                    <DetailRow label="Compatibility" value={asin.compatibility} />
                  </Grid>
                )}
              </Grid>
            </Paper>
          </Box>

          {/* ── Description — always visible, editable ──────────────────── */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Description / Feature Bullets
            </Typography>
            {editMode ? (
              <TextField
                multiline
                rows={8}
                fullWidth
                label="Description / Feature Bullets"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter each bullet on a new line"
                helperText="Each line becomes a bullet point. Paste from Amazon or type manually."
              />
            ) : displayDescription ? (
              <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
                {displayDescription.split('\n').filter(Boolean).map((line, i) => (
                  <Stack key={i} direction="row" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>•</Typography>
                    <Typography variant="body2">{line}</Typography>
                  </Stack>
                ))}
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip
                    icon={<WarningAmberIcon fontSize="small" />}
                    label="Missing"
                    color="warning"
                    size="small"
                  />
                  <Typography variant="body2" color="text.secondary">
                    No description was scraped. Click the edit button above to add one manually.
                  </Typography>
                </Stack>
              </Paper>
            )}
          </Box>

          {/* ── Save error ─────────────────────────────────────────────── */}
          {saveError && (
            <Alert severity="error" onClose={() => setSaveError('')}>
              {saveError}
            </Alert>
          )}

          {/* ── Meta / scrape info ──────────────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Record Info
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <DetailRow label="ASIN" value={asin.asin} mono />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <DetailRow label="Added At" value={addedDate} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <DetailRow label="Scraped At" value={scrapeDate || '—'} />
                </Grid>
                {editedDate && (
                  <Grid item xs={6} sm={3}>
                    <DetailRow label="Manually Edited At" value={editedDate} />
                  </Grid>
                )}
                {asin.scrapeError && (
                  <Grid item xs={12} sm={6}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                        Scrape Error
                      </Typography>
                      <Typography variant="body2" color="error.main" sx={{ mt: 0.25 }}>
                        {asin.scrapeError}
                      </Typography>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </Paper>
          </Box>

        </Stack>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {editMode ? (
          <>
            <Button
              onClick={handleCancelEdit}
              disabled={saving}
              startIcon={<CancelIcon />}
              color="inherit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose} variant="outlined">Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
