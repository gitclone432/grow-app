import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TuneIcon from '@mui/icons-material/Tune';
import api from '../../lib/api';
import { PAGE_REGISTRY } from '../../constants/pages';

const DEFAULT_FILTERS = {
  targetUserId: '',
  actorUserId: '',
  pageId: '',
  eventType: 'all',
  effectiveChangesOnly: false,
  fromDate: '',
  toDate: '',
};

const EVENT_LABELS = {
  user_created: 'User Created',
  page_permissions_updated: 'Permissions Updated',
};

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function formatMode(snapshot) {
  if (!snapshot) {
    return 'Not set';
  }

  return snapshot.useCustomPermissions ? 'Custom' : 'Role Default';
}

function buildPageNameMap() {
  return PAGE_REGISTRY.reduce((accumulator, page) => {
    accumulator[page.id] = page.name;
    return accumulator;
  }, {});
}

function PageChipList({ pageIds, pageNameMap, color = 'default' }) {
  if (!pageIds?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        None
      </Typography>
    );
  }

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {pageIds.map((pageId) => (
        <Chip
          key={pageId}
          size="small"
          color={color}
          label={pageNameMap[pageId] || pageId}
          title={pageId}
        />
      ))}
    </Stack>
  );
}

export default function PageAccessAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const pageNameMap = useMemo(() => buildPageNameMap(), []);
  const pageOptions = useMemo(
    () => [...PAGE_REGISTRY].sort((left, right) => left.name.localeCompare(right.name)),
    []
  );
  const userOptions = useMemo(
    () => [...users].sort((left, right) => left.username.localeCompare(right.username)),
    [users]
  );

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const { data } = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load users for audit filters');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchLogs = async (page = 1, activeFilters = filters, limit = pagination.limit) => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page,
        limit,
        eventType: activeFilters.eventType,
      };

      if (activeFilters.targetUserId) params.targetUserId = activeFilters.targetUserId;
      if (activeFilters.actorUserId) params.actorUserId = activeFilters.actorUserId;
      if (activeFilters.pageId) params.pageId = activeFilters.pageId;
      if (activeFilters.fromDate) params.fromDate = activeFilters.fromDate;
      if (activeFilters.toDate) params.toDate = activeFilters.toDate;
      if (activeFilters.effectiveChangesOnly) params.effectiveChangesOnly = 'true';

      const { data } = await api.get('/users/page-access-audit-logs', { params });
      setLogs(data.logs || []);
      setPagination({
        total: data.pagination?.total || 0,
        page: data.pagination?.page || page,
        limit: data.pagination?.limit || limit,
        totalPages: data.pagination?.totalPages || 0,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load page access audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs(1, DEFAULT_FILTERS, 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
  };

  const handleApplyFilters = () => {
    fetchLogs(1, filters, pagination.limit);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    fetchLogs(1, DEFAULT_FILTERS, pagination.limit);
  };

  const handlePageChange = (event, newPage) => {
    fetchLogs(newPage + 1, filters, pagination.limit);
  };

  const handleRowsPerPageChange = (event) => {
    const nextLimit = parseInt(event.target.value, 10);
    fetchLogs(1, filters, nextLimit);
  };

  const renderChangeSummary = (log) => {
    if (log.eventType === 'user_created') {
      return <Chip size="small" color="success" label={`Initial access: ${log.diff.grantedEffectivePermissions.length}`} />;
    }

    if (!log.effectiveAccessChanged) {
      return <Chip size="small" variant="outlined" label="No effective access change" />;
    }

    return (
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {!!log.diff.grantedEffectivePermissions.length && (
          <Chip size="small" color="success" label={`+${log.diff.grantedEffectivePermissions.length} granted`} />
        )}
        {!!log.diff.revokedEffectivePermissions.length && (
          <Chip size="small" color="warning" label={`-${log.diff.revokedEffectivePermissions.length} revoked`} />
        )}
      </Stack>
    );
  };

  const renderConfigSummary = (log) => {
    if (log.eventType === 'user_created') {
      return 'Initial access from assigned role';
    }

    const parts = [];

    if (log.diff.useCustomPermissionsChanged) {
      parts.push(`${formatMode(log.before)} -> ${formatMode(log.after)}`);
    }
    if (log.diff.addedStoredPermissions.length) {
      parts.push(`+${log.diff.addedStoredPermissions.length} stored`);
    }
    if (log.diff.removedStoredPermissions.length) {
      parts.push(`-${log.diff.removedStoredPermissions.length} stored`);
    }

    return parts.length ? parts.join(' | ') : 'Saved without access delta';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <HistoryIcon sx={{ fontSize: 32, mr: 1.5, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" component="h1">
            Page Access Audit Log
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review who changed access, which user was affected, and the exact page-level grants and revokes.
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap" alignItems={{ xs: 'stretch', md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="target-user-label">Affected User</InputLabel>
            <Select
              labelId="target-user-label"
              value={filters.targetUserId}
              label="Affected User"
              onChange={(event) => handleFilterChange('targetUserId', event.target.value)}
              disabled={loadingUsers}
            >
              <MenuItem value="">All Users</MenuItem>
              {userOptions.map((user) => (
                <MenuItem key={`target-${user._id}`} value={user._id}>
                  {user.username} ({user.role})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="actor-user-label">Changed By</InputLabel>
            <Select
              labelId="actor-user-label"
              value={filters.actorUserId}
              label="Changed By"
              onChange={(event) => handleFilterChange('actorUserId', event.target.value)}
              disabled={loadingUsers}
            >
              <MenuItem value="">All Actors</MenuItem>
              {userOptions.map((user) => (
                <MenuItem key={`actor-${user._id}`} value={user._id}>
                  {user.username} ({user.role})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="page-filter-label">Page</InputLabel>
            <Select
              labelId="page-filter-label"
              value={filters.pageId}
              label="Page"
              onChange={(event) => handleFilterChange('pageId', event.target.value)}
            >
              <MenuItem value="">All Pages</MenuItem>
              {pageOptions.map((page) => (
                <MenuItem key={page.id} value={page.id}>
                  {page.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="event-type-label">Event Type</InputLabel>
            <Select
              labelId="event-type-label"
              value={filters.eventType}
              label="Event Type"
              onChange={(event) => handleFilterChange('eventType', event.target.value)}
            >
              <MenuItem value="all">All Events</MenuItem>
              <MenuItem value="page_permissions_updated">Permissions Updated</MenuItem>
              <MenuItem value="user_created">User Created</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="From"
            type="date"
            size="small"
            value={filters.fromDate}
            onChange={(event) => handleFilterChange('fromDate', event.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="To"
            type="date"
            size="small"
            value={filters.toDate}
            onChange={(event) => handleFilterChange('toDate', event.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, height: 40 }}>
            <FormControlLabel
              sx={{ m: 0, gap: 1.5 }}
              control={
                <Switch
                  checked={filters.effectiveChangesOnly}
                  onChange={(event) => handleFilterChange('effectiveChangesOnly', event.target.checked)}
                  color="primary"
                />
              }
              label="Effective changes only"
            />
          </Box>

          <Button variant="contained" startIcon={<TuneIcon />} onClick={handleApplyFilters} sx={{ height: 40 }}>
            Apply Filters
          </Button>
          <Button variant="outlined" onClick={handleClearFilters} sx={{ height: 40 }}>
            Clear
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Showing {pagination.total} audit event{pagination.total === 1 ? '' : 's'}.
        </Typography>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Affected User</TableCell>
              <TableCell>Changed By</TableCell>
              <TableCell>Event</TableCell>
              <TableCell>Effective Access</TableCell>
              <TableCell>Config Summary</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No audit entries found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log._id} hover>
                  <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{log.target.username}</Typography>
                    <Typography variant="caption" color="text.secondary">{log.target.role}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{log.actor.username}</Typography>
                    <Typography variant="caption" color="text.secondary">{log.actor.role}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={log.eventType === 'user_created' ? 'success' : 'primary'}
                      label={EVENT_LABELS[log.eventType] || log.eventType}
                    />
                  </TableCell>
                  <TableCell>{renderChangeSummary(log)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{renderConfigSummary(log)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => setSelectedLog(log)}
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={pagination.total}
          page={Math.max(pagination.page - 1, 0)}
          onPageChange={handlePageChange}
          rowsPerPage={pagination.limit}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>

      <Dialog open={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} maxWidth="md" fullWidth>
        <DialogTitle>Audit Entry Details</DialogTitle>
        <DialogContent dividers>
          {selectedLog && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label={EVENT_LABELS[selectedLog.eventType] || selectedLog.eventType} color="primary" size="small" />
                <Chip label={`Source: ${selectedLog.source}`} size="small" variant="outlined" />
                {selectedLog.sessionInvalidated && (
                  <Chip label="Session invalidated" size="small" color="warning" />
                )}
              </Stack>

              <Box>
                <Typography variant="subtitle2">Changed By</Typography>
                <Typography variant="body2">
                  {selectedLog.actor.username} ({selectedLog.actor.role})
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Affected User</Typography>
                <Typography variant="body2">
                  {selectedLog.target.username} ({selectedLog.target.role})
                </Typography>
              </Box>

              <Divider />

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Before</Typography>
                  {selectedLog.before ? (
                    <Stack spacing={0.75}>
                      <Typography variant="body2">Mode: {formatMode(selectedLog.before)}</Typography>
                      <Typography variant="body2">Role: {selectedLog.before.role}</Typography>
                      <Typography variant="body2">Version: {selectedLog.before.permissionsVersion}</Typography>
                      <Typography variant="body2">Stored pages: {selectedLog.before.pagePermissions.length}</Typography>
                      <Typography variant="body2">Effective pages: {selectedLog.before.effectivePagePermissions.length}</Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No previous state</Typography>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>After</Typography>
                  <Stack spacing={0.75}>
                    <Typography variant="body2">Mode: {formatMode(selectedLog.after)}</Typography>
                    <Typography variant="body2">Role: {selectedLog.after.role}</Typography>
                    <Typography variant="body2">Version: {selectedLog.after.permissionsVersion}</Typography>
                    <Typography variant="body2">Stored pages: {selectedLog.after.pagePermissions.length}</Typography>
                    <Typography variant="body2">Effective pages: {selectedLog.after.effectivePagePermissions.length}</Typography>
                  </Stack>
                </Paper>
              </Stack>

              <Divider />

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Granted Effective Access</Typography>
                <PageChipList pageIds={selectedLog.diff.grantedEffectivePermissions} pageNameMap={pageNameMap} color="success" />
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Revoked Effective Access</Typography>
                <PageChipList pageIds={selectedLog.diff.revokedEffectivePermissions} pageNameMap={pageNameMap} color="warning" />
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Added Stored Permissions</Typography>
                <PageChipList pageIds={selectedLog.diff.addedStoredPermissions} pageNameMap={pageNameMap} color="info" />
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Removed Stored Permissions</Typography>
                <PageChipList pageIds={selectedLog.diff.removedStoredPermissions} pageNameMap={pageNameMap} />
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Request Metadata</Typography>
                <Typography variant="body2">IP: {selectedLog.metadata?.ipAddress || 'Unknown'}</Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  User Agent: {selectedLog.metadata?.userAgent || 'Unknown'}
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedLog(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}