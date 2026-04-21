import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Grid,
  Box,
  Divider,
  Paper,
  Stack,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalculateIcon from '@mui/icons-material/Calculate';

export default function BBECalculatorModal({ open, onClose, initialSales = 0, initialSnad = 0 }) {
  // Current State
  const [sales, setSales] = useState(initialSales);
  const [snad, setSnad] = useState(initialSnad);

  // Projection State
  const [addSales, setAddSales] = useState(0);
  const [addSnad, setAddSnad] = useState(0);

  // Target State
  const [targetRate, setTargetRate] = useState(1.0);

  useEffect(() => {
    if (open) {
      setSales(initialSales);
      setSnad(initialSnad);
      setAddSales(0);
      setAddSnad(0);
      setTargetRate(1.0);
    }
  }, [open, initialSales, initialSnad]);

  // Calculations
  const currentRate = sales > 0 ? (snad / sales) * 100 : 0;
  
  const projectedSales = Number(sales) + Number(addSales);
  const projectedSnad = Number(snad) + Number(addSnad);
  const projectedRate = projectedSales > 0 ? (projectedSnad / projectedSales) * 100 : 0;

  // Calculate sales needed for target
  // Rate = (SNAD / TotalSales) * 100
  // Target = (CurrentSNAD / (CurrentSales + NeededSales)) * 100
  // (CurrentSales + NeededSales) = (CurrentSNAD * 100) / Target
  // NeededSales = ((CurrentSNAD * 100) / Target) - CurrentSales
  let salesNeeded = 0;
  if (targetRate > 0 && snad > 0) {
    const totalSalesNeeded = (snad * 100) / targetRate;
    salesNeeded = Math.ceil(totalSalesNeeded - sales);
  }

  const getRateColor = (rate) => {
    if (rate > 1.5) return 'error.main';
    if (rate > 1.1) return 'warning.main';
    return 'success.main';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <CalculateIcon color="primary" />
            <Typography variant="h6">BBE Rate Calculator</Typography>
          </Stack>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      
      <DialogContent dividers>
        <Grid container spacing={3}>
          {/* Section 1: Current Status */}
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8f9fa' }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Current Status
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Current Total Sales"
                    type="number"
                    fullWidth
                    size="small"
                    value={sales}
                    onChange={(e) => setSales(Number(e.target.value))}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Current SNAD Count"
                    type="number"
                    fullWidth
                    size="small"
                    value={snad}
                    onChange={(e) => setSnad(Number(e.target.value))}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box display="flex" flexDirection="column" alignItems="center">
                    <Typography variant="caption" color="text.secondary">Current BBE Rate</Typography>
                    <Typography variant="h4" fontWeight="bold" color={getRateColor(currentRate)}>
                      {currentRate.toFixed(2)}%
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Section 2: Projection */}
          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="primary">
                Projection (What If?)
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                See how adding sales or SNADs affects your rate.
              </Typography>
              
              <Stack spacing={2}>
                <TextField
                  label="Add Hypothetical Sales"
                  type="number"
                  fullWidth
                  size="small"
                  value={addSales}
                  onChange={(e) => setAddSales(Number(e.target.value))}
                  helperText={`Total Projected Sales: ${projectedSales}`}
                />
                <TextField
                  label="Add Hypothetical SNADs"
                  type="number"
                  fullWidth
                  size="small"
                  value={addSnad}
                  onChange={(e) => setAddSnad(Number(e.target.value))}
                  helperText={`Total Projected SNADs: ${projectedSnad}`}
                />
                
                <Divider />
                
                <Box display="flex" justifyContent="space-between" alignItems="center" pt={1}>
                  <Typography variant="body1">Projected Rate:</Typography>
                  <Typography variant="h5" fontWeight="bold" color={getRateColor(projectedRate)}>
                    {projectedRate.toFixed(2)}%
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>

          {/* Section 3: Target Calculator */}
          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="secondary">
                Target Calculator
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                How many sales do I need to reach a target rate?
              </Typography>

              <Stack spacing={2}>
                <TextField
                  label="Target BBE Rate (%)"
                  type="number"
                  fullWidth
                  size="small"
                  value={targetRate}
                  onChange={(e) => setTargetRate(Number(e.target.value))}
                  inputProps={{ step: 0.1, min: 0.01 }}
                />

                <Divider />

                <Box pt={1}>
                  <Typography variant="body2" gutterBottom>
                    Additional Sales Needed (assuming 0 new SNADs):
                  </Typography>
                  {salesNeeded > 0 ? (
                     <Typography variant="h4" color="primary.main" fontWeight="bold">
                       {salesNeeded.toLocaleString()}
                     </Typography>
                  ) : (
                    <Typography variant="h6" color="success.main">
                      Target Reached!
                    </Typography>
                  )}
                  {salesNeeded > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Total sales required: {(sales + salesNeeded).toLocaleString()}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
