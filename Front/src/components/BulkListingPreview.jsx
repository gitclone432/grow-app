import { useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, IconButton, Chip, Button, Stack, TextField, Tooltip, Alert
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

export default function BulkListingPreview({ results, onEdit, onRemove, onRetry, onEditSKU }) {
  const [editingSKU, setEditingSKU] = useState(null);
  const [skuValue, setSkuValue] = useState('');

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon color="success" fontSize="small" />;
      case 'error':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'duplicate':
        return <WarningIcon color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'duplicate':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleStartSKUEdit = (asin, currentSKU) => {
    setEditingSKU(asin);
    setSkuValue(currentSKU || '');
  };

  const handleSaveSKU = (asin) => {
    if (skuValue.trim()) {
      onEditSKU(asin, skuValue.trim());
      setEditingSKU(null);
      setSkuValue('');
    }
  };

  const handleCancelSKUEdit = () => {
    setEditingSKU(null);
    setSkuValue('');
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const duplicateCount = results.filter(r => r.status === 'duplicate').length;

  if (results.length === 0) {
    return (
      <Alert severity="info">
        No results to preview. Enter ASINs and click "Bulk Auto-Fill" to get started.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Summary */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Chip 
          icon={<CheckCircleIcon />} 
          label={`${successCount} Success`} 
          color="success" 
          size="small" 
        />
        <Chip 
          icon={<ErrorIcon />} 
          label={`${errorCount} Failed`} 
          color="error" 
          size="small" 
        />
        {duplicateCount > 0 && (
          <Chip 
            icon={<WarningIcon />} 
            label={`${duplicateCount} Duplicates`} 
            color="warning" 
            size="small" 
          />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', alignSelf: 'center' }}>
          Total: {results.length}
        </Typography>
      </Stack>

      {/* Preview Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width="60">Status</TableCell>
              <TableCell width="120">ASIN</TableCell>
              <TableCell>Title</TableCell>
              <TableCell width="100">Price</TableCell>
              <TableCell width="150">SKU</TableCell>
              <TableCell width="120" align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((result) => (
              <TableRow 
                key={result.asin}
                sx={{ 
                  '&:hover': { bgcolor: 'action.hover' },
                  bgcolor: result.status === 'error' ? 'error.50' : 
                           result.status === 'duplicate' ? 'warning.50' : 'transparent'
                }}
              >
                {/* Status */}
                <TableCell>
                  <Tooltip title={result.status}>
                    {getStatusIcon(result.status)}
                  </Tooltip>
                </TableCell>
                
                {/* ASIN */}
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {result.asin}
                  </Typography>
                </TableCell>
                
                {/* Title */}
                <TableCell>
                  {result.status === 'success' ? (
                    <Typography variant="body2" noWrap>
                      {result.autoFilledData?.coreFields?.title || 'N/A'}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="error" noWrap>
                      {result.error || 'Error'}
                    </Typography>
                  )}
                </TableCell>
                
                {/* Price */}
                <TableCell>
                  {result.status === 'success' && result.autoFilledData?.coreFields?.startPrice ? (
                    <Typography variant="body2">
                      ${result.autoFilledData.coreFields.startPrice}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                  {result.pricingCalculation?.enabled && (
                    <Tooltip title="Auto-calculated price">
                      <Chip 
                        label="💰" 
                        size="small" 
                        sx={{ ml: 0.5, height: 18, fontSize: '0.7rem' }}
                      />
                    </Tooltip>
                  )}
                </TableCell>
                
                {/* SKU */}
                <TableCell>
                  {editingSKU === result.asin ? (
                    <Stack direction="row" spacing={0.5}>
                      <TextField
                        size="small"
                        value={skuValue}
                        onChange={(e) => setSkuValue(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleSaveSKU(result.asin);
                          if (e.key === 'Escape') handleCancelSKUEdit();
                        }}
                        sx={{ width: 100 }}
                        autoFocus
                      />
                      <Button size="small" onClick={() => handleSaveSKU(result.asin)}>
                        ✓
                      </Button>
                      <Button size="small" onClick={handleCancelSKUEdit}>
                        ✕
                      </Button>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="body2" fontFamily="monospace" noWrap>
                        {result.sku || `${result.asin}-AUTO`}
                      </Typography>
                      {result.status === 'success' && (
                        <IconButton 
                          size="small" 
                          onClick={() => handleStartSKUEdit(result.asin, result.sku)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  )}
                </TableCell>
                
                {/* Actions */}
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {result.status === 'success' && onEdit && (
                      <Tooltip title="Edit listing">
                        <IconButton 
                          size="small" 
                          onClick={() => onEdit(result)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    {result.status === 'error' && onRetry && (
                      <Tooltip title="Retry">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => onRetry(result.asin)}
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    {onRemove && (
                      <Tooltip title="Remove from batch">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => onRemove(result.asin)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Batch Actions */}
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {errorCount > 0 && onRetry && (
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => {
              const failedAsins = results
                .filter(r => r.status === 'error')
                .map(r => r.asin);
              failedAsins.forEach(asin => onRetry(asin));
            }}
          >
            Retry All Failed
          </Button>
        )}
        
        {(errorCount > 0 || duplicateCount > 0) && onRemove && (
          <Button
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => {
              const toRemove = results
                .filter(r => r.status === 'error' || r.status === 'duplicate')
                .map(r => r.asin);
              toRemove.forEach(asin => onRemove(asin));
            }}
          >
            Remove Failed/Duplicates
          </Button>
        )}
      </Stack>
    </Box>
  );
}
