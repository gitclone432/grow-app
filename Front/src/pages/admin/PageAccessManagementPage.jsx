import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Container, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem as MuiMenuItem, Alert, IconButton, Grid, Box,
  CircularProgress, Chip, Switch, FormControlLabel, Checkbox, TextField,
  InputAdornment, Accordion, AccordionSummary, AccordionDetails, Divider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import api from '../../lib/api';
import { PAGE_REGISTRY, PAGE_CATEGORIES } from '../../constants/pages';

const PageAccessManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit state
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [selectedPages, setSelectedPages] = useState([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/users');
      // Filter out superadmin users (they always have full access)
      setUsers(data.filter(u => u.role !== 'superadmin'));
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setUseCustomPermissions(user.useCustomPermissions || false);
    setSelectedPages(user.pagePermissions || []);
    setError('');
    setSuccess('');
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.put(`/users/${selectedUser._id}/page-permissions`, {
        pagePermissions: selectedPages,
        useCustomPermissions
      });
      setSuccess(`Permissions updated for ${selectedUser.username}`);
      // Update local state
      setUsers(prev => prev.map(u =>
        u._id === selectedUser._id
          ? { ...u, pagePermissions: selectedPages, useCustomPermissions }
          : u
      ));
      setEditDialogOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const togglePage = (pageId) => {
    setSelectedPages(prev =>
      prev.includes(pageId)
        ? prev.filter(p => p !== pageId)
        : [...prev, pageId]
    );
  };

  const toggleCategory = (categoryId) => {
    const categoryPages = PAGE_REGISTRY.filter(p => p.category === categoryId);
    const categoryPageIds = categoryPages.map(p => p.id);
    const allSelected = categoryPageIds.every(id => selectedPages.includes(id));

    if (allSelected) {
      setSelectedPages(prev => prev.filter(id => !categoryPageIds.includes(id)));
    } else {
      setSelectedPages(prev => [...new Set([...prev, ...categoryPageIds])]);
    }
  };

  const selectAllPages = () => {
    setSelectedPages(PAGE_REGISTRY.map(p => p.id));
  };

  const deselectAllPages = () => {
    setSelectedPages([]);
  };

  // Get default pages for a role
  const getDefaultPagesForRole = (role) => {
    return PAGE_REGISTRY.filter(p => p.defaultRoles.includes(role)).map(p => p.id);
  };

  const applyRoleDefaults = () => {
    if (selectedUser) {
      setSelectedPages(getDefaultPagesForRole(selectedUser.role));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <SecurityIcon sx={{ fontSize: 32, mr: 1.5, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Page Access Management
          </Typography>
        </Box>
        <Button component={Link} to="/admin/page-access-audit-log" variant="outlined" startIcon={<HistoryIcon />}>
          View Audit Log
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage which pages each user can access. Users with "Custom" enabled will only see explicitly assigned pages.
        Users without custom permissions use their role's default page access.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Search Bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search users by username, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Department</TableCell>
              <TableCell align="center">Permission Mode</TableCell>
              <TableCell align="center">Pages Assigned</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">No users found</TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => (
                <TableRow key={u._id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonIcon color="action" fontSize="small" />
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{u.username}</Typography>
                        {u.email && (
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={u.role} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>{u.department || '-'}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={u.useCustomPermissions ? 'Custom' : 'Role Default'}
                      size="small"
                      color={u.useCustomPermissions ? 'warning' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {u.useCustomPermissions
                      ? `${(u.pagePermissions || []).length} pages`
                      : `${getDefaultPagesForRole(u.role).length} (default)`
                    }
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => handleEditUser(u)}
                    >
                      Manage Access
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon color="primary" />
            <span>
              Manage Page Access — {selectedUser?.username}
              <Chip label={selectedUser?.role} size="small" sx={{ ml: 1 }} />
            </span>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Custom permissions toggle */}
          <Paper sx={{ p: 2, mb: 3, bgcolor: useCustomPermissions ? 'warning.50' : 'grey.50' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={useCustomPermissions}
                  onChange={(e) => setUseCustomPermissions(e.target.checked)}
                  color="warning"
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle2">
                    Enable Custom Permissions
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {useCustomPermissions
                      ? '⚠️ Only the pages selected below will be accessible. Role defaults are OVERRIDDEN.'
                      : '✅ User has access based on their role. Select pages below to prepare custom permissions.'}
                  </Typography>
                </Box>
              }
            />
          </Paper>

          {/* Quick actions */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={selectAllPages}>Select All</Button>
            <Button size="small" variant="outlined" onClick={deselectAllPages}>Deselect All</Button>
            <Button size="small" variant="outlined" color="secondary" onClick={applyRoleDefaults}>
              Apply Role Defaults ({selectedUser?.role})
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            Selected: {selectedPages.length} / {PAGE_REGISTRY.length} pages
          </Typography>

          {/* Page categories with checkboxes */}
          {Object.entries(PAGE_CATEGORIES).map(([catId, cat]) => {
            const categoryPages = PAGE_REGISTRY.filter(p => p.category === catId);
            const selectedCount = categoryPages.filter(p => selectedPages.includes(p.id)).length;
            const allSelected = selectedCount === categoryPages.length;
            const someSelected = selectedCount > 0 && !allSelected;

            return (
              <Accordion key={catId} defaultExpanded={selectedCount > 0}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={() => toggleCategory(catId)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                    />
                    <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                      {cat.name}
                    </Typography>
                    <Chip
                      label={`${selectedCount}/${categoryPages.length}`}
                      size="small"
                      color={selectedCount > 0 ? 'primary' : 'default'}
                      sx={{ mr: 1 }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Grid container>
                    {categoryPages.map(page => {
                      const isDefault = page.defaultRoles.includes(selectedUser?.role);
                      return (
                        <Grid item xs={12} sm={6} key={page.id}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={selectedPages.includes(page.id)}
                                onChange={() => togglePage(page.id)}
                                size="small"
                              />
                            }
                            label={
                              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">{page.name}</Typography>
                                {isDefault && (
                                  <Chip label="default" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                                )}
                              </Box>
                            }
                          />
                        </Grid>
                      );
                    })}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save Permissions'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PageAccessManagementPage;
