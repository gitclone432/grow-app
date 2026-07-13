import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { CloudUpload as UploadIcon, Download as DownloadIcon } from '@mui/icons-material';
import api from '../lib/api.js';
import {
  downloadEtsyProductImportTemplate,
  getEtsyProductDetectedColumns,
  parseEtsyProductCsv,
  parseEtsyProductMatrix,
} from '../utils/etsyProductCsvImport.js';
import { parseSpreadsheetFile } from '../utils/spreadsheetImport.js';

export default function EtsyProductsImportDialog({
  open,
  onClose,
  stores,
  selectedStoreId,
  onStoreChange,
  onImported,
}) {
  const rawCsvRef = useRef('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(null);
  const [importMode, setImportMode] = useState('append');
  const [dragOver, setDragOver] = useState(false);

  const resetState = useCallback(() => {
    rawCsvRef.current = '';
    setFileName('');
    setError('');
    setParsing(false);
    setImporting(false);
    setParsed(null);
    setImportMode('append');
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const loadSpreadsheet = useCallback(async (file) => {
    if (!file) return;

    setParsing(true);
    setError('');
    setFileName(file.name);
    rawCsvRef.current = '';

    try {
      const result = await parseSpreadsheetFile(
        file,
        (matrix) => parseEtsyProductMatrix(matrix),
        (text) => {
          rawCsvRef.current = text;
          return parseEtsyProductCsv(text);
        },
      );
      setParsed(result);
      if (result.errors?.length && !result.rows?.length) {
        setError(result.errors[0].reason);
      }
    } catch {
      setError(file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
        ? 'Failed to read Excel file'
        : 'Failed to parse file');
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileSelect = async (file) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.txt') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setError('Please choose a CSV, TXT, or Excel (.xlsx) file');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('File must be under 25MB');
      return;
    }

    await loadSpreadsheet(file);
  };

  const handleImport = async () => {
    if (!selectedStoreId) {
      setError('Select an Etsy store first (add stores in Settings → Etsy Stores)');
      return;
    }
    if (!parsed?.rows?.length) {
      setError('Upload a CSV with at least one data row');
      return;
    }

    setImporting(true);
    setError('');
    try {
      const { data } = await api.post('/etsy/products/bulk-import', {
        storeId: selectedStoreId,
        rows: parsed.rows,
        mode: importMode,
      }, { timeout: 120000 });

      onImported?.(data);
      onClose();
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Import API not found — restart/deploy the backend with the latest Etsy routes.');
      } else if (err.code === 'ECONNABORTED') {
        setError('Import timed out. Try splitting the CSV into smaller files.');
      } else {
        setError(err.response?.data?.error || err.message || 'Import failed');
      }
    } finally {
      setImporting(false);
    }
  };

  const previewRows = parsed?.rows?.slice(0, 5) || [];
  const detectedColumns = parsed ? getEtsyProductDetectedColumns(parsed.headerMap) : [];

  return (
    <Dialog open={open} onClose={importing ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Etsy Products</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Alert severity="info">
            Upload one file per Etsy store. Columns: <strong>Listed Date</strong>, <strong>SKU</strong>,{' '}
            <strong>Supplier</strong>, <strong>Listed</strong>, <strong>Region</strong>, <strong>Links</strong>,{' '}
            <strong>Listing Status</strong>. SKU auto-fills from Amazon links when empty.
          </Alert>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-end' }}>
            <TextField
              select
              label="Etsy Store"
              value={selectedStoreId || ''}
              onChange={(e) => onStoreChange?.(e.target.value)}
              size="small"
              fullWidth
              disabled={stores.length === 0}
              helperText={stores.length === 0 ? 'No stores yet' : undefined}
            >
              {stores.length === 0 ? (
                <MenuItem value="" disabled>
                  No stores — add in Settings
                </MenuItem>
              ) : (
                stores.map((store) => (
                  <MenuItem key={store._id} value={store._id}>
                    {store.name}
                  </MenuItem>
                ))
              )}
            </TextField>
          </Stack>

          {stores.length === 0 && (
            <Alert severity="info">
              Add Etsy stores in{' '}
              <Link component={RouterLink} to="/admin/etsy-stores" fontWeight={600}>
                Settings → Etsy Stores
              </Link>
              .
            </Alert>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={downloadEtsyProductImportTemplate}
            >
              Download template
            </Button>
          </Stack>

          <Box
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileSelect(e.dataTransfer.files?.[0]);
            }}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              bgcolor: dragOver ? 'action.hover' : 'background.default',
            }}
          >
            <UploadIcon color="action" sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="body2" gutterBottom>
              Drag & drop CSV or Excel here, or
            </Typography>
            <Button variant="contained" component="label" size="small" disabled={parsing}>
              Choose file
              <input
                type="file"
                hidden
                accept=".csv,.txt,.xlsx,.xls"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </Button>
            {fileName && (
              <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary">
                {fileName}
              </Typography>
            )}
          </Box>

          {parsing && <LinearProgress />}

          <FormControl>
            <Typography variant="subtitle2" gutterBottom>
              Import mode
            </Typography>
            <RadioGroup row value={importMode} onChange={(e) => setImportMode(e.target.value)}>
              <FormControlLabel value="append" control={<Radio size="small" />} label="Append to store" />
              <FormControlLabel value="replace" control={<Radio size="small" />} label="Replace all rows for this store" />
            </RadioGroup>
          </FormControl>

          {parsed && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Detected {detectedColumns.length} columns · {parsed.rows.length} row(s) ready to import
              </Typography>
              {detectedColumns.length > 0 && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  {detectedColumns.map((col) => col.label).join(', ')}
                </Typography>
              )}

              {previewRows.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 240 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {detectedColumns.slice(0, 6).map((col) => (
                          <TableCell key={col.key} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {col.label}
                          </TableCell>
                        ))}
                        {detectedColumns.length > 6 && (
                          <TableCell sx={{ fontWeight: 700 }}>…</TableCell>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {previewRows.map((row, idx) => (
                        <TableRow key={idx}>
                          {detectedColumns.slice(0, 6).map((col) => (
                            <TableCell key={col.key} sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row[col.key] || '-'}
                            </TableCell>
                          ))}
                          {detectedColumns.length > 6 && <TableCell>…</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}
          {parsed?.errors?.length > 0 && parsed.rows.length > 0 && (
            <Alert severity="warning">
              {parsed.errors.map((item) => item.reason).join(' ')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={importing}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={importing || parsing || !parsed?.rows?.length || !selectedStoreId}
          startIcon={importing ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {importing ? 'Importing...' : `Import ${parsed?.rows?.length || 0} rows`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
