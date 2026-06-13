import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
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

const LARGE_PASTE_CHARS = 50_000;

function parseCsvAsync(text) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(parseFulfillmentCsv(text));
    }, 0);
  });
}

export default function FulfillmentCsvImportDialog({ open, onClose, onImport }) {
  const rawCsvRef = useRef('');
  const pasteDebounceRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [pastePreview, setPastePreview] = useState('');
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [importLog, setImportLog] = useState([]);
  const [importSummary, setImportSummary] = useState(null);

  const resetState = useCallback(() => {
    rawCsvRef.current = '';
    setFileName('');
    setPastePreview('');
    setError('');
    setParsing(false);
    setParsed(null);
    setImportProgress(null);
    setImportLog([]);
    setImportSummary(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const loadCsvText = useCallback(async (text, sourceName) => {
    if (!text?.trim()) {
      setParsed(null);
      setFileName('');
      rawCsvRef.current = '';
      return;
    }

    setParsing(true);
    setError('');
    setFileName(sourceName);
    rawCsvRef.current = text;

    try {
      const result = await parseCsvAsync(text);
      setParsed(result);
    } catch (err) {
      setError('Failed to parse CSV');
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileSelect = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a CSV file');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('File must be under 25MB');
      return;
    }

    setPastePreview('');
    setShowPaste(false);

    try {
      const text = await readCsvFile(file);
      await loadCsvText(text, file.name);
    } catch (err) {
      setError('Failed to read CSV file');
    }
  };

  const handlePasteFieldPaste = (event) => {
    const pasted = event.clipboardData?.getData('text') || '';
    if (pasted.length < LARGE_PASTE_CHARS) return;

    event.preventDefault();
    setPastePreview(`${pasted.slice(0, 120).replace(/\s+/g, ' ')}… (${pasted.length.toLocaleString()} characters)`);
    loadCsvText(pasted, 'Pasted CSV');
  };

  const handlePasteFieldChange = (event) => {
    const value = event.target.value;
    setPastePreview(value.length > LARGE_PASTE_CHARS
      ? `${value.slice(0, 120).replace(/\s+/g, ' ')}… (${value.length.toLocaleString()} characters)`
      : value);

    if (!value.trim()) {
      resetState();
      return;
    }

    if (value.length >= LARGE_PASTE_CHARS) {
      loadCsvText(value, 'Pasted CSV');
      return;
    }

    window.clearTimeout(pasteDebounceRef.current);
    pasteDebounceRef.current = window.setTimeout(() => {
      loadCsvText(value, 'Pasted CSV');
    }, 500);
  };

  const handleImport = async () => {
    const rows = parsed?.rows || [];
    if (!rows.length) {
      setError('No valid rows to import. Upload a CSV file with an Order ID column.');
      return;
    }

    setLoading(true);
    setError('');
    setImportSummary(null);
    setImportLog([`Starting import of ${rows.length.toLocaleString()} rows…`]);
    setImportProgress({
      processed: 0,
      totalRows: rows.length,
      chunkIndex: 0,
      totalChunks: Math.ceil(rows.length / 100),
      updated: 0,
      skipped: 0,
      notFound: 0,
      phase: 'starting',
    });

    try {
      const totals = await onImport({
        rows,
        fillEmptyOnly,
        onProgress: (progress) => {
          setImportProgress(progress);
          if (progress.phase === 'sending') {
            setImportLog((prev) => [
              ...prev,
              `Sending batch ${progress.chunkIndex}/${progress.totalChunks} (${Math.min(100, progress.totalRows - progress.processed).toLocaleString()} rows)…`,
            ]);
            return;
          }
          setImportLog((prev) => [
            ...prev,
            `Batch ${progress.chunkIndex}/${progress.totalChunks}: ${progress.processed.toLocaleString()}/${progress.totalRows.toLocaleString()} rows — ${progress.updated.toLocaleString()} updated, ${progress.notFound.toLocaleString()} not found, ${progress.skipped.toLocaleString()} skipped`,
          ]);
        },
      });

      setImportSummary(totals);
      setImportLog((prev) => [
        ...prev,
        `Done — ${totals.updated.toLocaleString()} updated, ${totals.notFound.toLocaleString()} not found, ${totals.skipped.toLocaleString()} skipped.`,
      ]);
    } catch (err) {
      const message = err.code === 'ECONNABORTED'
        ? 'Import timed out — try again after deploying the latest backend, or use the CLI tool for very large files.'
        : (err.response?.data?.error || err.message || 'Import failed');
      setError(message);
      setImportLog((prev) => [...prev, `Failed: ${message}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleDoneAfterImport = () => {
    resetState();
    onClose();
  };

  const handleClose = () => {
    if (loading || parsing) return;
    resetState();
    onClose();
  };

  const detectedColumns = parsed ? getDetectedColumns(parsed.headerMap) : [];
  const previewRows = parsed?.rows?.slice(0, 5) || [];
  const readyCount = parsed?.rows?.length || 0;
  const progressPercent = importProgress?.totalRows
    ? Math.round((importProgress.processed / importProgress.totalRows) * 100)
    : 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Fulfillment CSV</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            <strong>Upload your CSV file</strong> (recommended for large exports). Rows are matched by
            Order ID and update Amazon Acc, Arriving, Before Tax, Estimated Tax, Az OrderID, and Amazon Refund.
            Orders must already exist in this app (use Poll New Orders first).
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              borderStyle: 'dashed',
              bgcolor: dragOver ? 'action.hover' : 'background.paper',
              cursor: parsing ? 'wait' : 'pointer',
              opacity: parsing ? 0.85 : 1,
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileSelect(e.dataTransfer.files[0]);
            }}
            onClick={() => !parsing && document.getElementById('fulfillment-csv-input')?.click()}
          >
            {parsing ? (
              <CircularProgress size={36} sx={{ mb: 1 }} />
            ) : (
              <UploadIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
            )}
            <Typography variant="body1">
              {parsing ? 'Parsing CSV…' : 'Drop CSV here or click to browse'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Fast for large files (10,000+ rows). Max 25MB.
            </Typography>
            {fileName && !parsing && (
              <Typography variant="caption" color="primary" display="block" sx={{ mt: 1, fontWeight: 600 }}>
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

          <Button
            size="small"
            variant="text"
            onClick={() => setShowPaste((prev) => !prev)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {showPaste ? 'Hide paste option' : 'Small file? Paste instead'}
          </Button>

          <Collapse in={showPaste}>
            <TextField
              label="Paste CSV (small files only)"
              multiline
              minRows={3}
              maxRows={8}
              value={pastePreview}
              onChange={handlePasteFieldChange}
              onPaste={handlePasteFieldPaste}
              placeholder="Paste a few rows only. For full exports, use file upload above."
              fullWidth
              helperText="Large pastes are handled in the background — the text box will not show all rows."
            />
          </Collapse>

          <FormControlLabel
            control={
              <Checkbox
                checked={fillEmptyOnly}
                onChange={(e) => setFillEmptyOnly(e.target.checked)}
              />
            }
            label="Only fill empty columns (do not overwrite existing values)"
          />

          {parsing && <LinearProgress />}

          {!parsing && detectedColumns.length > 0 && (
            <Alert severity="info">
              Detected columns: {detectedColumns.map((col) => col.label).join(', ')}
              {' · '}
              {readyCount.toLocaleString()} row{readyCount !== 1 ? 's' : ''} ready to import
            </Alert>
          )}

          {!parsing && (parsed?.errors?.length || 0) > 0 && (
            <Alert severity="warning">
              {(parsed.errors.length).toLocaleString()} row{parsed.errors.length !== 1 ? 's' : ''} skipped
              {parsed.errors[0]?.reason ? ` (e.g. row ${parsed.errors[0].row}: ${parsed.errors[0].reason})` : ''}
            </Alert>
          )}

          {!parsing && previewRows.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview (first 5 rows)</Typography>
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

          {(loading || importSummary) && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">
                  {importSummary ? 'Import complete' : 'Import progress'}
                </Typography>
                {importProgress && (
                  <Typography variant="caption" color="text.secondary">
                    {importProgress.processed.toLocaleString()} / {importProgress.totalRows.toLocaleString()} rows ({progressPercent}%)
                  </Typography>
                )}
              </Stack>
              <LinearProgress
                variant={loading && progressPercent === 0 && importProgress?.phase === 'sending' ? 'indeterminate' : 'determinate'}
                value={importSummary ? 100 : progressPercent}
                sx={{ mb: 1.5, height: 8, borderRadius: 1 }}
              />
              {importSummary && (
                <Alert severity={importSummary.updated > 0 ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
                  {importSummary.updated.toLocaleString()} updated ·{' '}
                  {importSummary.notFound.toLocaleString()} not found ·{' '}
                  {importSummary.skipped.toLocaleString()} skipped
                </Alert>
              )}
              {importLog.length > 0 && (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    maxHeight: 160,
                    overflowY: 'auto',
                    bgcolor: 'grey.50',
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {importLog.map((line, index) => (
                    <Box key={`${index}-${line}`} sx={{ color: index === importLog.length - 1 ? 'text.primary' : 'text.secondary' }}>
                      {line}
                    </Box>
                  ))}
                </Paper>
              )}
            </Box>
          )}

          {loading && !importProgress && <LinearProgress />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {importSummary ? (
          <Button variant="contained" onClick={handleDoneAfterImport}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={loading || parsing}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={loading || parsing || readyCount === 0}
            >
              {loading
                ? `Importing… ${progressPercent}%`
                : readyCount > 0
                  ? `Import ${readyCount.toLocaleString()} rows`
                  : 'Import'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
