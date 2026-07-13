import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { Restore as RestoreIcon, Save as SaveIcon } from '@mui/icons-material';
import CoreFieldDefaultsForm from '../CoreFieldDefaultsForm.jsx';

export default function CoreFieldDefaultsEditor({
  baseDefaults = {},
  overrideDefaults,
  isOverridden,
  onSave,
  onReset,
}) {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const source = isOverridden && overrideDefaults != null ? overrideDefaults : (baseDefaults || {});
    setFormData(source && typeof source === 'object' ? { ...source } : {});
    setError('');
  }, [baseDefaults, overrideDefaults, isOverridden]);

  const countSetDefaults = () =>
    Object.keys(formData || {}).filter(
      (key) => formData[key] !== '' && formData[key] !== null && formData[key] !== undefined
    ).length;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const { description, ...payload } = formData || {};
    try {
      await onSave(payload);
    } catch (err) {
      setError(err?.message || 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all default values?')) {
      setFormData({});
    }
  };

  return (
    <Box>
      {isOverridden ? (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={onReset} startIcon={<RestoreIcon />}>
              Reset
            </Button>
          }
        >
          You have customized core field defaults for this seller.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          You&apos;re viewing the base template defaults. Edit and save to create your seller customization.
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>How it works:</strong> Set default values for core fields. These apply when creating new listings.
          Auto-fill (AI/ASIN/Calculator) can still override them.
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1">Set Core Field Defaults</Typography>
        <Chip label={`${countSetDefaults()} defaults set`} color="primary" size="small" />
      </Stack>

      <CoreFieldDefaultsForm formData={formData} onChange={setFormData} />

      <Stack direction="row" spacing={1} sx={{ mt: 3 }} alignItems="center">
        <Button onClick={handleClearAll} color="error" disabled={saving}>
          Clear All
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Defaults'}
        </Button>
      </Stack>
    </Box>
  );
}
