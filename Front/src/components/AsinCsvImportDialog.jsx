import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Box,
  Typography,
  Stack,
  Chip,
  LinearProgress,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { CloudUpload as UploadIcon, Download as DownloadIcon } from '@mui/icons-material';
import { readCsvFile, parseCsvContent, downloadCsv } from '../utils/asinDirectoryUtils.js';

const MARKETPLACE_OPTIONS = [
  { value: 'US', label: '🇺🇸 Amazon.com (US)' },
  { value: 'UK', label: '🇬🇧 Amazon.co.uk (UK)' },
  { value: 'CA', label: '🇨🇦 Amazon.ca (Canada)' },
  { value: 'AU', label: '🇦🇺 Amazon.com.au (Australia)' },
];

export default function AsinCsvImportDialog({ open, onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [region, setRegion] = useState('US');

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    // Validate file size (5MB limit)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit');
      return;
    }

    setFile(selectedFile);
    setError('');

    try {
      const content = await readCsvFile(selectedFile);
      const parsed = parseCsvContent(content);
      setPreview(parsed);
    } catch (err) {
      setError('Failed to read CSV file');
      console.error(err);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleImport = async () => {
    if (!preview || preview.asins.length === 0) {
      setError('No valid ASINs to import');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const content = await readCsvFile(file);
      await onImport(content, region);
      setFile(null);
      setPreview(null);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to import CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setError('');
    onClose();
  };

  const handleDownloadTemplate = () => {
    const template = 'ASIN\nB08N5WRWNW\nB07K2G8Z4Q\nB09H3TLQX5\n';
    downloadCsv(template, 'asin-template.csv');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import ASINs from CSV</DialogTitle>
      
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <Alert severity="info">
            <Typography variant="body2">
              Upload a CSV file with an ASIN column. The file should have ASINs in the first column or a column named "ASIN".
              Maximum file size: 5MB.
            </Typography>
          </Alert>

          <Button
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
            size="small"
            variant="outlined"
          >
            Download CSV Template
          </Button>

          <FormControl size="small" sx={{ maxWidth: 280 }}>
            <InputLabel>Marketplace</InputLabel>
            <Select
              value={region}
              label="Marketplace"
              onChange={(e) => setRegion(e.target.value)}
            >
              {MARKETPLACE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* File Upload Area */}
          <Paper
            variant="outlined"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            sx={{
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: dragOver ? 'action.hover' : 'background.paper',
              border: dragOver ? '2px dashed primary.main' : '2px dashed',
              borderColor: dragOver ? 'primary.main' : 'divider'
            }}
          >
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              style={{ display: 'none' }}
              id="csv-file-input"
            />
            <label htmlFor="csv-file-input" style={{ cursor: 'pointer' }}>
              <UploadIcon sx={{ fontSize: 48, color: 'action.active', mb: 1 }} />
              <Typography variant="body1" gutterBottom>
                {file ? file.name : 'Drag & drop CSV file here or click to browse'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supported format: .csv (Max 5MB)
              </Typography>
            </label>
          </Paper>

          {loading && <LinearProgress />}

          {preview && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Preview:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                <Chip
                  label={`${preview.asins.length} ASINs Found`}
                  color="success"
                  size="small"
                />
                {preview.errors.length > 0 && (
                  <Chip
                    label={`${preview.errors.length} Errors`}
                    color="error"
                    size="small"
                  />
                )}
              </Stack>

              {preview.asins.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    First 10 ASINs: {preview.asins.slice(0, 10).join(', ')}
                    {preview.asins.length > 10 && '...'}
                  </Typography>
                </Box>
              )}

              {preview.errors.length > 0 && preview.errors.length <= 5 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="error" component="div">
                    Errors:
                  </Typography>
                  {preview.errors.map((err, idx) => (
                    <Typography key={idx} variant="caption" color="error" display="block">
                      Row {err.row}: {err.asin} - {err.reason}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={loading || !preview || preview.asins.length === 0}
        >
          {loading ? 'Importing...' : `Import ${preview?.asins.length || 0} ASINs`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
