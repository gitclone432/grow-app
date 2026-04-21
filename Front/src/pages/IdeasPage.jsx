import { useState, useEffect, useCallback, memo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Typography,
  Stack,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Alert,
  CircularProgress,
  Pagination,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import api from '../lib/api';

// Memoized NotesCell component to prevent unnecessary re-renders
const NotesCell = memo(({ ideaId, initialNotes, onSave }) => {
  const [localNotes, setLocalNotes] = useState(initialNotes || '');
  const [isEditing, setIsEditing] = useState(false);

  // Sync with parent when initialNotes changes (after optimistic update)
  useEffect(() => {
    setLocalNotes(initialNotes || '');
  }, [initialNotes]);

  const hasChanges = localNotes !== (initialNotes || '');

  const handleSave = useCallback(() => {
    if (hasChanges) {
      onSave(ideaId, localNotes);
      setIsEditing(false);
    }
  }, [ideaId, localNotes, hasChanges, onSave]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <TableCell sx={{ minWidth: 250, maxWidth: 300 }}>
      {!isEditing && localNotes ? (
        <Tooltip 
          title={localNotes}
          arrow 
          placement="top"
          componentsProps={{
            tooltip: {
              sx: {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
                fontSize: '0.875rem',
                maxWidth: 500,
                p: 1.5,
                whiteSpace: 'pre-wrap'
              }
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              fullWidth
              multiline
              maxRows={5}
              placeholder="Add progress notes..."
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              sx={{ fontSize: '0.875rem' }}
            />
            {hasChanges && (
              <IconButton
                size="small"
                color="primary"
                onClick={handleSave}
                title="Save notes"
              >
                <SaveIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Tooltip>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            multiline
            maxRows={5}
            placeholder="Add progress notes..."
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            sx={{ fontSize: '0.875rem' }}
          />
          {hasChanges && (
            <IconButton
              size="small"
              color="primary"
              onClick={handleSave}
              title="Save notes"
            >
              <SaveIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}
    </TableCell>
  );
});

export default function IdeasPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt'); // Default to recently updated
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'idea',
    priority: 'medium',
    createdBy: '',
    completeByDate: ''
  });

  useEffect(() => {
    fetchIdeas();
  }, [filterStatus, filterPriority, filterType, sortBy, page]);

  const fetchIdeas = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 50);
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      if (filterType) params.append('type', filterType);
      if (sortBy) params.append('sortBy', sortBy);
      
      const response = await api.get(`/ideas?${params.toString()}`);
      setIdeas(response.data.ideas);
      setTotalPages(response.data.totalPages);
      setTotal(response.data.total);
    } catch (err) {
      console.error('Error fetching ideas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.createdBy) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await api.post('/ideas', formData);
      alert('Idea submitted successfully!');
      setFormData({
        title: '',
        description: '',
        type: 'idea',
        priority: 'medium',
        createdBy: '',
        completeByDate: ''
      });
      setShowForm(false);
      setPage(1);
      fetchIdeas();
    } catch (err) {
      console.error('Error submitting idea:', err);
      alert('Failed to submit idea');
    }
  };

  const handleStatusChange = async (ideaId, newStatus) => {
    // Optimistic update: Update UI immediately
    setIdeas(prevIdeas => 
      prevIdeas.map(idea => 
        idea._id === ideaId ? { ...idea, status: newStatus } : idea
      )
    );

    try {
      await api.patch(`/ideas/${ideaId}`, { status: newStatus });
      // No need to refresh - already updated locally
    } catch (err) {
      console.error('Error updating status:', err);
      // Rollback: Refresh on error to restore correct state
      fetchIdeas();
      alert('Failed to update status');
    }
  };

  const handlePickedUpByChange = async (ideaId, newPickedUpBy) => {
    // Optimistic update: Update UI immediately
    setIdeas(prevIdeas => 
      prevIdeas.map(idea => 
        idea._id === ideaId ? { ...idea, pickedUpBy: newPickedUpBy } : idea
      )
    );

    try {
      await api.patch(`/ideas/${ideaId}`, { pickedUpBy: newPickedUpBy });
      // No need to refresh - already updated locally
    } catch (err) {
      console.error('Error updating picked up by:', err);
      // Rollback: Refresh on error to restore correct state
      fetchIdeas();
      alert('Failed to update picked up by');
    }
  };

  const handleNotesChange = useCallback(async (ideaId, notes) => {
    // Optimistic update: Update UI immediately
    setIdeas(prevIdeas => 
      prevIdeas.map(idea => 
        idea._id === ideaId ? { ...idea, notes } : idea
      )
    );

    try {
      await api.patch(`/ideas/${ideaId}`, { notes });
      // No need to refresh - already updated locally
    } catch (err) {
      console.error('Error updating notes:', err);
      // Rollback: Refresh on error to restore correct state
      fetchIdeas();
      alert('Failed to update notes');
    }
  }, []);

  const handleDelete = async (ideaId) => {
    if (!window.confirm('Are you sure you want to delete this idea?')) {
      return;
    }
    
    // Optimistic removal: Remove from UI immediately
    setIdeas(prevIdeas => prevIdeas.filter(idea => idea._id !== ideaId));
    setTotal(prevTotal => prevTotal - 1);

    try {
      await api.delete(`/ideas/${ideaId}`);
      // No need to refresh - already removed locally
    } catch (err) {
      console.error('Error deleting idea:', err);
      // Rollback: Refresh on error to restore correct state
      fetchIdeas();
      alert('Failed to delete idea');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'warning';
      case 'in-progress': return 'info';
      case 'completed': return 'success';
      default: return 'default';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={{ xs: 1.5, sm: 0 }} mb={{ xs: 2, sm: 3 }}>
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2.125rem' } }}>
          Ideas & Issues Board
        </Typography>
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={!isSmallMobile && <RefreshIcon />}
            onClick={fetchIdeas}
            size={isSmallMobile ? 'small' : 'medium'}
            fullWidth={isMobile}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={!isSmallMobile && <AddIcon />}
            onClick={() => setShowForm(true)}
            size={isSmallMobile ? 'small' : 'medium'}
            fullWidth={isMobile}
          >
            {isSmallMobile ? 'New' : 'New Idea/Issue'}
          </Button>
        </Stack>
      </Stack>

      {/* Filters */}
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ fontSize: { xs: '0.95rem', sm: '1rem' }, mb: { xs: 1.5, sm: 2 } }}>
          Search Filters
        </Typography>
        
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 2 }}>
            <FormControl size="small" sx={{ minWidth: { xs: 'auto', sm: 150 }, flex: { xs: 1, sm: 'none' } }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                label="Status"
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="in-progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: { xs: 'auto', sm: 150 }, flex: { xs: 1, sm: 'none' } }}>
              <InputLabel>Priority</InputLabel>
              <Select
                value={filterPriority}
                label="Priority"
                onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
              >
                <MenuItem value="">All Priorities</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: { xs: 'auto', sm: 150 }, flex: { xs: 1, sm: 'none' } }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={filterType}
                label="Type"
                onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              >
                <MenuItem value="">All Types</MenuItem>
                <MenuItem value="idea">Idea</MenuItem>
                <MenuItem value="issue">Issue</MenuItem>
                <MenuItem value="feature">Feature Request</MenuItem>
                <MenuItem value="bug">Bug</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: { xs: 'auto', sm: 150 }, flex: { xs: 1, sm: 'none' } }}>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortBy}
                label="Sort By"
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              >
                <MenuItem value="updatedAt">Recently Updated</MenuItem>
                <MenuItem value="createdAt">Recently Created</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

      {/* Ideas Table */}
      <TableContainer component={Paper} sx={{ overflowX: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : ideas.length === 0 ? (
          <Box p={4}>
            <Alert severity="info">
              No ideas or issues yet. Be the first to share!
            </Alert>
          </Box>
        ) : (
          <>
            {/* Total Count Header inside Table */}
            <Box px={{ xs: 1.5, sm: 2 }} pt={{ xs: 1.5, sm: 2 }} pb={1}>
              <Typography variant="body2" color="text.secondary" fontWeight="bold" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                Total: {total} idea(s)
              </Typography>
            </Box>
            <Table size={isSmallMobile ? 'small' : 'medium'} sx={{ tableLayout: 'auto', width: '100%' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  {!isSmallMobile && <TableCell sx={{ width: { xs: '80px', sm: '120px' } }}><strong>Date</strong></TableCell>}
                  <TableCell sx={{ width: 'auto', minWidth: { xs: '120px', sm: '200px' } }}><strong>Title</strong></TableCell>
                  {!isMobile && <TableCell sx={{ width: '80px' }}><strong>Type</strong></TableCell>}
                  <TableCell sx={{ width: { xs: '70px', sm: '90px' } }}><strong>Priority</strong></TableCell>
                  <TableCell sx={{ width: { xs: '85px', sm: '110px' } }}><strong>Status</strong></TableCell>
                  {!isMobile && <TableCell sx={{ width: '100px' }}><strong>Picked Up</strong></TableCell>}
                  {!isMobile && <TableCell sx={{ width: '120px' }}><strong>Notes</strong></TableCell>}
                  {!isSmallMobile && <TableCell sx={{ width: '100px' }}><strong>Complete By</strong></TableCell>}
                  {!isSmallMobile && <TableCell sx={{ width: '90px' }}><strong>Created By</strong></TableCell>}
                  <TableCell sx={{ width: { xs: '50px', sm: '60px' } }}><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
              {ideas.map((idea) => (
                <TableRow key={idea._id} hover>
                  {!isSmallMobile && (
                    <TableCell sx={{ minWidth: 80 }}>
                      <Typography variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                        {formatDate(idea.createdAt)}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell sx={{ maxWidth: { xs: 150, sm: 250 }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Typography 
                      variant="subtitle2" 
                      fontWeight="bold" 
                      sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' }, 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        cursor: isSmallMobile ? 'pointer' : 'default',
                        '&:hover': isSmallMobile ? { textDecoration: 'underline', color: 'primary.main' } : {}
                      }}
                      onClick={() => isSmallMobile && setSelectedIdea(idea)}
                    >
                      {idea.title}
                    </Typography>
                    {!isSmallMobile && (
                      <Tooltip 
                        title={idea.description} 
                        arrow 
                        placement="top"
                        componentsProps={{
                          tooltip: {
                            sx: {
                              bgcolor: 'rgba(0, 0, 0, 0.9)',
                              fontSize: '0.875rem',
                              maxWidth: 500,
                              p: 1.5
                            }
                          }
                        }}
                      >
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          sx={{ 
                            mt: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word',
                            cursor: 'help',
                            fontSize: { xs: '0.7rem', sm: '0.75rem' }
                          }}
                        >
                          {idea.description}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <Chip
                        label={idea.type.charAt(0).toUpperCase() + idea.type.slice(1)}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Chip
                      label={idea.priority.charAt(0).toUpperCase() + idea.priority.slice(1)}
                      size="small"
                      color={getPriorityColor(idea.priority)}
                      sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                    />
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" fullWidth sx={{ minWidth: { xs: 75, sm: 100 } }}>
                      <Select
                        value={idea.status}
                        onChange={(e) => handleStatusChange(idea._id, e.target.value)}
                        sx={{
                          bgcolor: idea.status === 'open' 
                            ? '#fff3cd' 
                            : idea.status === 'in-progress' 
                            ? '#cfe2ff' 
                            : '#d1e7dd',
                          color: idea.status === 'open'
                            ? '#856404'
                            : idea.status === 'in-progress'
                            ? '#084298'
                            : '#0a3622',
                          fontWeight: 'bold',
                          fontSize: { xs: '0.6rem', sm: '0.75rem' },
                          padding: { xs: '2px 4px', sm: '4px 8px' },
                          '& .MuiSelect-select': {
                            paddingRight: { xs: '20px !important', sm: '32px !important' },
                            paddingTop: { xs: '4px', sm: '8px' },
                            paddingBottom: { xs: '4px', sm: '8px' },
                          },
                          '& .MuiOutlinedInput-notchedOutline': { 
                            border: 'none' 
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            border: '1px solid rgba(0,0,0,0.23)'
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            border: '2px solid #1976d2'
                          }
                        }}
                      >
                        <MenuItem value="open">{isSmallMobile ? 'Open' : 'Open'}</MenuItem>
                        <MenuItem value="in-progress">{isSmallMobile ? 'In Prog.' : 'In Progress'}</MenuItem>
                        <MenuItem value="completed">{isSmallMobile ? 'Done' : 'Completed'}</MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <FormControl size="small" fullWidth sx={{ minWidth: 120 }}>
                        <Select
                          value={idea.pickedUpBy || ''}
                          onChange={(e) => handlePickedUpByChange(idea._id, e.target.value)}
                          displayEmpty
                          sx={{
                            fontSize: '0.875rem',
                          }}
                        >
                          <MenuItem value="">-</MenuItem>
                          <MenuItem value="aaryan">aaryan</MenuItem>
                          <MenuItem value="rajarshi">rajarshi</MenuItem>
                          <MenuItem value="prassanna">prassanna</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <NotesCell 
                      ideaId={idea._id}
                      initialNotes={idea.notes}
                      onSave={handleNotesChange}
                    />
                  )}
                  {!isSmallMobile && (
                    <TableCell sx={{ minWidth: 120 }}>
                      {idea.completeByDate ? (
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                          {new Date(idea.completeByDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                          -
                        </Typography>
                      )}
                    </TableCell>
                  )}
                  {!isSmallMobile && (
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                        {idea.createdBy}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell>
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => handleDelete(idea._id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={{ xs: 2, sm: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, value) => setPage(value)}
            color="primary"
            size={isSmallMobile ? 'small' : 'medium'}
            siblingCount={isMobile ? 0 : 1}
            boundaryCount={isMobile ? 1 : 2}
          />
        </Box>
      )}

      {/* Idea Detail Dialog for Mobile */}
      <Dialog 
        open={!!selectedIdea} 
        onClose={() => setSelectedIdea(null)} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isSmallMobile}
      >
        <DialogTitle sx={{ p: { xs: 2.5, sm: 3 }, pb: { xs: 2, sm: 2.5 } }}>
          <Typography variant="h6" fontWeight="bold" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' }, wordBreak: 'break-word' }}>
            {selectedIdea?.title}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, fontSize: { xs: '0.9rem', sm: '1rem' } }}>Description</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                {selectedIdea?.description}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, fontSize: { xs: '0.9rem', sm: '1rem' } }}>Details</Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>Type</Typography>
                  <Chip 
                    label={selectedIdea?.type?.charAt(0).toUpperCase() + selectedIdea?.type?.slice(1)}
                    size="small"
                    variant="outlined"
                    sx={{ mt: 0.75, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                  />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>Priority</Typography>
                  <Chip 
                    label={selectedIdea?.priority?.charAt(0).toUpperCase() + selectedIdea?.priority?.slice(1)}
                    size="small"
                    color={getPriorityColor(selectedIdea?.priority)}
                    sx={{ mt: 0.75, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                  />
                </Box>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: { xs: 2.5, sm: 3 }, pt: { xs: 1.5, sm: 2 } }}>
          <Button onClick={() => setSelectedIdea(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* New Idea Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} maxWidth="sm" fullWidth fullScreen={isSmallMobile}>
        <DialogTitle sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" fontWeight="bold" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
            Submit New Idea or Issue
          </Typography>
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={{ xs: 1.5, sm: 2 }}>
              <TextField
                label="Your Name"
                value={formData.createdBy}
                onChange={(e) => setFormData({ ...formData, createdBy: e.target.value })}
                required
                fullWidth
              />

              <TextField
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                fullWidth
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                multiline
                rows={4}
                required
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.type}
                  label="Type"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="idea">Idea</MenuItem>
                  <MenuItem value="issue">Issue</MenuItem>
                  <MenuItem value="feature">Feature Request</MenuItem>
                  <MenuItem value="bug">Bug</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={formData.priority}
                  label="Priority"
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Complete By Date (Optional)"
                type="date"
                value={formData.completeByDate}
                onChange={(e) => setFormData({ ...formData, completeByDate: e.target.value })}
                fullWidth
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: { xs: 2, sm: 3 }, gap: { xs: 1, sm: 0 } }}>
            <Button onClick={() => setShowForm(false)} fullWidth={isSmallMobile} size={isSmallMobile ? 'small' : 'medium'}>Cancel</Button>
            <Button type="submit" variant="contained" fullWidth={isSmallMobile} size={isSmallMobile ? 'small' : 'medium'}>Submit</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
