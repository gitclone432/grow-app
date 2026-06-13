import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { readCsvFile } from '../utils/asinDirectoryUtils';
import {
  FULFILLMENT_IMPORT_FIELDS,
  getDetectedColumns,
  parseFulfillmentCsv,
} from '../utils/fulfillmentCsvImport';

export default function FulfillmentCsvImportDialog({ open, onClose, onImport }) {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const parsed = useMemo(() => parseFulfillmentCsv(csvText), [csvText]);
  const detectedColumns = useMemo(() => getDetectedColumns(parsed.headerMap), [parsed.headerMap]);
  const previewRows = parsed.rows.slice(0, 5);

  const handleFileSelect = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a CSV file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be under 10MB');
      return;
    }

    try {
      const text = await readCsvFile(file);
      setCsvText(text);
      setFileName(file.name);
      setError('');
    } catch (err) {
      setError('Failed to read CSV file');
    }
  };

  const handleImport = async () => {
    if (!parsed.rows.length) {
      setError('No valid rows to import. Check that your CSV has an Order ID column.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onImport({
        rows: parsed.rows,
        fillEmptyOnly,
      });
      setCsvText('');
      setFileName('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setCsvText('');
    setFileName('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Fulfillment CSV</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Upload or paste a CSV from your old app. Rows are matched by <strong>Order ID</strong> and
            update Amazon Acc, Arriving, Before Tax, Estimated Tax, Az OrderID, and Amazon Refund.
            Orders must already exist in this app (use Poll New Orders first).
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              borderStyle: 'dashed',
              bgcolor: dragOver ? 'action.hover' : 'background.paper',
              cursor: 'pointer',
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileSelect(e.dataTransfer.files[0]);
            }}
            onClick={() => document.getElementById('fulfillment-csv-input')?.click()}
          >
            <UploadIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="body1">Drop CSV here or click to browse</Typography>
            {fileName && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                {fileName}
              </Typography>
            )}
            <input
              id="fulfillment-csv-input"
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
          </Paper>

          <TextField
            label="Or paste CSV text"
            multiline
            minRows={4}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setFileName('');
              setError('');
            }}
            placeholder={'Order ID,Amazon Acc,Before Tax,Estimated Tax,Az OrderID,Arriving,Amazon Refund\n07-14699-51927,Account1,12.50,1.02,123-4567890,2026-06-15,0'}
            fullWidth
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={fillEmptyOnly}
                onChange={(e) => setFillEmptyOnly(e.target.checked)}
              />
            }
            label="Only fill empty columns (do not overwrite existing values)"
          />

          {detectedColumns.length > 0 && (
            <Alert severity="info">
              Detected columns: {detectedColumns.map((col) => col.label).join(', ')}
              {' · '}
              {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''} ready to import
            </Alert>
          )}

          {parsed.errors.length > 0 && (
            <Alert severity="warning">
              {parsed.errors.length} row{parsed.errors.length !== 1 ? 's' : ''} skipped
              {parsed.errors[0]?.reason ? ` (e.g. row ${parsed.errors[0].row}: ${parsed.errors[0].reason})` : ''}
            </Alert>
          )}

          {previewRows.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {FULFILLMENT_IMPORT_FIELDS.filter((field) =>
                      field.key === 'orderId' || previewRows.some((row) => row[field.key] !== undefined)
                    ).map((field) => (
                      <TableCell key={field.key}>{field.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.orderId}>
                      {FULFILLMENT_IMPORT_FIELDS.filter((field) =>
                        field.key === 'orderId' || previewRows.some((preview) => preview[field.key] !== undefined)
                      ).map((field) => (
                        <TableCell key={field.key}>{row[field.key] ?? '—'}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}
          {loading && <LinearProgress />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={loading || parsed.rows.length === 0}
        >
          Import {parsed.rows.length > 0 ? `${parsed.rows.length} rows` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
