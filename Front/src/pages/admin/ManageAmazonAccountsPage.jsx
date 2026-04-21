// pages/admin/ManageAmazonAccountsPage.jsx
import { useEffect, useState } from 'react';
import {
  Box, Button, Paper, Stack, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, TextField, Typography, 
  IconButton, Alert, Collapse, Grid
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import api from '../../lib/api.js';

export default function ManageAmazonAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    phoneNumber: '',
    notes: ''
  });

  const fetchAccounts = () => {
    api.get('/amazon-accounts').then(({ data }) => setAccounts(data)).catch(console.error);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const addAccount = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/amazon-accounts', { name });
      setName('');
      fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add account');
    }
  };

  const deleteAccount = async (id) => {
    if(!window.confirm("Are you sure?")) return;
    try {
        await api.delete(`/amazon-accounts/${id}`);
        fetchAccounts();
    } catch (err) {
        alert("Failed to delete");
    }
  };

  const handleExpandRow = (accountId) => {
    if (expandedId === accountId) {
      setExpandedId(null);
      setEditingId(null);
    } else {
      setExpandedId(accountId);
      const account = accounts.find(acc => acc._id === accountId);
      if (account) {
        setEditFormData({
          name: account.name || '',
          addressLine1: account.addressLine1 || '',
          addressLine2: account.addressLine2 || '',
          city: account.city || '',
          state: account.state || '',
          postalCode: account.postalCode || '',
          country: account.country || '',
          phoneNumber: account.phoneNumber || '',
          notes: account.notes || ''
        });
      }
    }
  };

  const handleEditClick = (accountId) => {
    setEditingId(accountId);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    const account = accounts.find(acc => acc._id === expandedId);
    if (account) {
      setEditFormData({
        name: account.name || '',
        addressLine1: account.addressLine1 || '',
        addressLine2: account.addressLine2 || '',
        city: account.city || '',
        state: account.state || '',
        postalCode: account.postalCode || '',
        country: account.country || '',
        phoneNumber: account.phoneNumber || '',
        notes: account.notes || ''
      });
    }
  };

  const handleUpdateAccount = async (accountId) => {
    setError('');
    try {
      await api.patch(`/amazon-accounts/${accountId}`, editFormData);
      setEditingId(null);
      fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update account');
    }
  };

  const handleFormChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Manage Amazon Accounts</Typography>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack direction="row" spacing={2} component="form" onSubmit={addAccount}>
          <TextField 
            label="Amazon Account Name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            required 
            sx={{ minWidth: 300 }}
          />
          <Button type="submit" variant="contained">Add Account</Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper} sx={{ maxWidth: 1000 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Account Name</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 100 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((acc) => (
              <>
                <TableRow 
                  key={acc._id} 
                  hover
                  onClick={() => handleExpandRow(acc._id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{acc.name}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" color="error" onClick={() => deleteAccount(acc._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
                
                <TableRow key={`${acc._id}-details`}>
                  <TableCell colSpan={2} sx={{ py: 0, borderBottom: expandedId === acc._id ? undefined : 'none' }}>
                    <Collapse in={expandedId === acc._id} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                          Address Information
                        </Typography>
                        
                        {editingId === acc._id ? (
                          <Grid container spacing={2}>
                            <Grid item xs={12}>
                              <TextField
                                label="Account Name"
                                size="small"
                                fullWidth
                                value={editFormData.name}
                                onChange={(e) => handleFormChange('name', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Address Line 1"
                                size="small"
                                fullWidth
                                value={editFormData.addressLine1}
                                onChange={(e) => handleFormChange('addressLine1', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Address Line 2"
                                size="small"
                                fullWidth
                                value={editFormData.addressLine2}
                                onChange={(e) => handleFormChange('addressLine2', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="City"
                                size="small"
                                fullWidth
                                value={editFormData.city}
                                onChange={(e) => handleFormChange('city', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="State"
                                size="small"
                                fullWidth
                                value={editFormData.state}
                                onChange={(e) => handleFormChange('state', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Postal Code"
                                size="small"
                                fullWidth
                                value={editFormData.postalCode}
                                onChange={(e) => handleFormChange('postalCode', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Country"
                                size="small"
                                fullWidth
                                value={editFormData.country}
                                onChange={(e) => handleFormChange('country', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Phone Number"
                                size="small"
                                fullWidth
                                value={editFormData.phoneNumber}
                                onChange={(e) => handleFormChange('phoneNumber', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <TextField
                                label="Notes"
                                size="small"
                                fullWidth
                                multiline
                                rows={2}
                                value={editFormData.notes}
                                onChange={(e) => handleFormChange('notes', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <Stack direction="row" spacing={1}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  startIcon={<SaveIcon />}
                                  onClick={() => handleUpdateAccount(acc._id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<CancelIcon />}
                                  onClick={handleCancelEdit}
                                >
                                  Cancel
                                </Button>
                              </Stack>
                            </Grid>
                          </Grid>
                        ) : (
                          <Box>
                            <Grid container spacing={1}>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">Address Line 1:</Typography>
                                <Typography variant="body2">{acc.addressLine1 || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">Address Line 2:</Typography>
                                <Typography variant="body2">{acc.addressLine2 || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">City:</Typography>
                                <Typography variant="body2">{acc.city || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">State:</Typography>
                                <Typography variant="body2">{acc.state || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">Postal Code:</Typography>
                                <Typography variant="body2">{acc.postalCode || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">Country:</Typography>
                                <Typography variant="body2">{acc.country || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary">Phone Number:</Typography>
                                <Typography variant="body2">{acc.phoneNumber || '-'}</Typography>
                              </Grid>
                              <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">Notes:</Typography>
                                <Typography variant="body2">{acc.notes || '-'}</Typography>
                              </Grid>
                            </Grid>
                            <Button
                              size="small"
                              variant="outlined"
                              sx={{ mt: 2 }}
                              onClick={() => handleEditClick(acc._id)}
                            >
                              Edit Address
                            </Button>
                          </Box>
                        )}
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </>
            ))}
            {accounts.length === 0 && (
                <TableRow>
                    <TableCell colSpan={2} align="center">No accounts found</TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}