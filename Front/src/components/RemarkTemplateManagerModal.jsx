import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

export default function RemarkTemplateManagerModal({
  open,
  onClose,
  templates = [],
  onSaveTemplates
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setText('');
    setEditingIndex(null);
    setError('');
  }, [open]);

  const normalizedNames = useMemo(
    () => new Set(templates.map((template, index) => index !== editingIndex ? template.name.trim().toLowerCase() : null).filter(Boolean)),
    [templates, editingIndex]
  );

  const handleSaveTemplate = () => {
    const trimmedName = name.trim();
    const trimmedText = text.trim();

    if (!trimmedName || !trimmedText) {
      setError('Template name and message are required.');
      return;
    }
    if (normalizedNames.has(trimmedName.toLowerCase())) {
      setError('Template name already exists.');
      return;
    }

    const next = [...templates];
    const entry = {
      id: templates[editingIndex]?.id || `${trimmedName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: trimmedName,
      text: trimmedText
    };

    if (editingIndex === null) {
      next.push(entry);
    } else {
      next[editingIndex] = entry;
    }

    onSaveTemplates(next);
    setName('');
    setText('');
    setEditingIndex(null);
    setError('');
  };

  const handleEdit = (index) => {
    setEditingIndex(index);
    setName(templates[index]?.name || '');
    setText(templates[index]?.text || '');
    setError('');
  };

  const handleDelete = (index) => {
    const next = templates.filter((_, i) => i !== index);
    onSaveTemplates(next);
    if (editingIndex === index) {
      setEditingIndex(null);
      setName('');
      setText('');
      setError('');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Manage Remark Templates</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Message Template"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            minRows={5}
            fullWidth
          />
          {error ? (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleSaveTemplate}>
              {editingIndex === null ? 'Add Template' : 'Save Template'}
            </Button>
            {editingIndex !== null ? (
              <Button
                variant="outlined"
                onClick={() => {
                  setEditingIndex(null);
                  setName('');
                  setText('');
                  setError('');
                }}
              >
                Cancel Edit
              </Button>
            ) : null}
          </Stack>

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Existing Templates
            </Typography>
            <Stack spacing={1}>
              {templates.map((template, index) => (
                <Box
                  key={template.id || `${template.name}-${index}`}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1.25
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {template.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {template.text}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" onClick={() => handleEdit(index)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(index)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
