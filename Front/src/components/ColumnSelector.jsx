import React, { useState, useEffect } from 'react';
import {
  Box, IconButton, Tooltip, Popover, Typography, Stack, Button, 
  Divider, TextField, List, ListItem, FormControlLabel, Checkbox, 
  Alert, CircularProgress
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../lib/api';

/**
 * Reusable Column Selector Component
 * 
 * @param {Object} props
 * @param {Array<{id: string, label: string}>} props.allColumns - Array of all available columns
 * @param {Array<string>} props.visibleColumns - Array of currently visible column IDs
 * @param {Function} props.onColumnChange - Callback when column visibility changes
 * @param {Function} props.onReset - Callback to reset columns to default
 * @param {string} props.page - Page identifier for scoped presets (e.g., 'dashboard', 'disputes')
 * @param {boolean} props.disabled - Whether the selector is disabled
 */
export default function ColumnSelector({ 
  allColumns, 
  visibleColumns, 
  onColumnChange, 
  onReset,
  page = 'dashboard',
  disabled = false
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [columnPresets, setColumnPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch presets when popover opens
  useEffect(() => {
    if (Boolean(anchorEl)) {
      fetchPresets();
    }
  }, [anchorEl, page]);

  const fetchPresets = async () => {
    try {
      const { data } = await api.get('/column-presets', { params: { page } });
      setColumnPresets(data);
    } catch (e) {
      console.error('Error fetching column presets:', e);
      setError('Failed to load presets');
    }
  };

  const saveColumnPreset = async () => {
    if (!newPresetName.trim()) return;
    setPresetsLoading(true);
    setError('');
    try {
      const { data } = await api.post('/column-presets', {
        name: newPresetName.trim(),
        columns: visibleColumns,
        page
      });
      setColumnPresets([...columnPresets, data]);
      setNewPresetName('');
    } catch (e) {
      console.error('Error saving preset:', e);
      setError(e.response?.data?.error || 'Failed to save preset');
    } finally {
      setPresetsLoading(false);
    }
  };

  const loadColumnPreset = (preset) => {
    onColumnChange(preset.columns);
  };

  const deleteColumnPreset = async (presetId) => {
    try {
      await api.delete(`/column-presets/${presetId}`);
      setColumnPresets(columnPresets.filter(p => p._id !== presetId));
    } catch (e) {
      console.error('Error deleting preset:', e);
      setError('Failed to delete preset');
    }
  };

  const handleToggleColumn = (colId) => {
    if (visibleColumns.includes(colId)) {
      onColumnChange(visibleColumns.filter(id => id !== colId));
    } else {
      // Maintain order based on allColumns array? 
      // Or just append? Appending is easier, but might mess up order if parent respects visibleColumns order.
      // Better to adhere to allColumns order.
      const newVisible = [...visibleColumns, colId];
      // Sort based on index in allColumns
      newVisible.sort((a, b) => {
        const indexA = allColumns.findIndex(c => c.id === a);
        const indexB = allColumns.findIndex(c => c.id === b);
        return indexA - indexB;
      });
      onColumnChange(newVisible);
    }
  };

  return (
    <>
      <Tooltip title="Select Columns">
        <span>
            <IconButton
            color="primary"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            size="small"
            disabled={disabled}
            >
            <ViewColumnIcon />
            </IconButton>
        </span>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, minWidth: 280, maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Presets Section */}
          {columnPresets.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                Saved Presets
              </Typography>
              <Stack spacing={0.5}>
                {columnPresets.map((preset) => (
                  <Stack key={preset._id} direction="row" alignItems="center" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => loadColumnPreset(preset)}
                      sx={{ flex: 1, justifyContent: 'flex-start', textTransform: 'none', fontSize: '0.8rem' }}
                    >
                      {preset.name}
                    </Button>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteColumnPreset(preset._id)}
                      sx={{ p: 0.5 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              <Divider sx={{ mt: 1.5 }} />
            </Box>
          )}

          {/* Save New Preset */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
              Save Current as Preset
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                placeholder="Preset name"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveColumnPreset()}
                sx={{ flex: 1, '& input': { fontSize: '0.85rem', py: 0.5 } }}
              />
              <IconButton
                size="small"
                color="primary"
                onClick={saveColumnPreset}
                disabled={!newPresetName.trim() || presetsLoading}
              >
                {presetsLoading ? <CircularProgress size={20} /> : <SaveIcon fontSize="small" />}
              </IconButton>
            </Stack>
            <Divider sx={{ mt: 1.5 }} />
          </Box>

          {/* Column Selection */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Select Columns to Display
          </Typography>
          <List dense>
            {allColumns.map((col) => (
              <ListItem key={col.id} disablePadding>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={visibleColumns.includes(col.id)}
                      onChange={() => handleToggleColumn(col.id)}
                      size="small"
                    />
                  }
                  label={col.label}
                />
              </ListItem>
            ))}
          </List>
          
          <Stack direction="row" spacing={1} mt={1}>
             <Button
                fullWidth
                variant="outlined"
                size="small"
                onClick={onReset}
                color="inherit"
             >
                Reset Default
             </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
        </Box>
      </Popover>
    </>
  );
}
