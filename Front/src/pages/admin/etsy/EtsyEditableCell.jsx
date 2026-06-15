import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Box,
  IconButton,
  Select,
  TextField,
  Typography,
} from '@mui/material';

function normalizeDisplayValue(value) {
  if (value == null || value === '') return '';
  return String(value);
}

function getDisplayLabel(value, column) {
  const text = normalizeDisplayValue(value);
  if (!text) return '-';
  return text;
}

const EtsyEditableCell = memo(function EtsyEditableCell({
  column,
  value,
  disabled = false,
  saving = false,
  onSave,
  onCopy,
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(normalizeDisplayValue(value));
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setLocalValue(normalizeDisplayValue(value));
    }
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus?.();
      if (inputRef.current?.select) {
        inputRef.current.select();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editing]);

  const commitSave = (nextValue) => {
    const normalized = normalizeDisplayValue(nextValue);
    if (normalized === normalizeDisplayValue(value)) return;
    onSave(normalized);
  };

  const finishEditing = (nextValue = localValue) => {
    commitSave(nextValue);
    setEditing(false);
  };

  const commonSx = {
    '& .MuiInputBase-root': { fontSize: '0.8125rem' },
    '& .MuiInputBase-input': { py: 0.5, px: 0.75 },
  };

  const selectOptions = useMemo(() => {
    const base = column.options || [''];
    const trimmed = base.filter(Boolean);
    if (localValue && !trimmed.includes(localValue)) {
      return ['', localValue, ...trimmed];
    }
    return base;
  }, [column.options, localValue]);

  const pillStyle = column.optionStyles?.[localValue] || null;
  const displayLabel = getDisplayLabel(localValue, column);

  if (!editing) {
    const rawText = normalizeDisplayValue(value);
    const canCopy = column.copyable && rawText && onCopy;

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          minWidth: 0,
          width: '100%',
        }}
      >
        <Typography
          variant="body2"
          component="span"
          display="block"
          onClick={() => {
            if (!disabled && !saving && !column.computed) setEditing(true);
          }}
          sx={{
            minHeight: 28,
            lineHeight: 1.4,
            cursor: disabled || saving || column.computed ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
            flex: 1,
            minWidth: 0,
            maxWidth: '100%',
            whiteSpace: column.multiline ? 'pre-wrap' : 'nowrap',
            overflow: 'hidden',
            textOverflow: column.multiline ? 'clip' : 'ellipsis',
            wordBreak: column.multiline ? 'break-word' : 'normal',
            overflowWrap: column.multiline ? 'anywhere' : 'normal',
            ...(column.computed
              ? { color: 'text.secondary', fontStyle: 'italic' }
              : {}),
            ...(pillStyle
              ? {
                display: 'inline-block',
                px: 1.25,
                py: 0.35,
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: pillStyle.bg,
                color: pillStyle.color,
              }
              : {
                color: displayLabel === '-' ? 'text.secondary' : 'text.primary',
              }),
          }}
        >
          {displayLabel}
        </Typography>
        {canCopy && (
          <IconButton
            size="small"
            aria-label={`Copy ${column.label}`}
            disabled={disabled || saving}
            onClick={(e) => {
              e.stopPropagation();
              onCopy(rawText);
            }}
            sx={{ p: 0.25, flexShrink: 0 }}
          >
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
    );
  }

  if (column.inputType === 'select') {
    const activeStyle = localValue ? column.optionStyles?.[localValue] : null;

    return (
      <Select
        native
        fullWidth
        disabled={disabled || saving}
        value={localValue}
        inputProps={{ ref: inputRef }}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(next);
          finishEditing(next);
        }}
        onBlur={() => setEditing(false)}
        sx={{
          ...commonSx,
          fontSize: '0.8125rem',
          minWidth: column.minWidth ? Math.min(column.minWidth, 280) : 140,
          color: activeStyle?.color,
          backgroundColor: activeStyle?.bg || 'transparent',
          borderRadius: activeStyle ? '999px' : 1,
          '& .MuiNativeSelect-select': {
            py: 0.5,
            px: 1,
            fontWeight: activeStyle ? 600 : 400,
          },
        }}
      >
        {selectOptions.map((option) => (
          <option key={option || 'empty'} value={option}>
            {option || '-'}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <TextField
      inputRef={inputRef}
      size="small"
      fullWidth
      multiline={Boolean(column.multiline)}
      minRows={column.multiline ? 2 : 1}
      maxRows={column.multiline ? 4 : 1}
      type={column.inputType === 'date' ? 'date' : column.inputType === 'number' ? 'number' : 'text'}
      value={localValue}
      disabled={disabled || saving}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => finishEditing(localValue)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setLocalValue(normalizeDisplayValue(value));
          setEditing(false);
          return;
        }
        if (e.key === 'Enter' && !column.multiline) {
          e.preventDefault();
          finishEditing(localValue);
        }
      }}
      InputLabelProps={column.inputType === 'date' ? { shrink: true } : undefined}
      sx={commonSx}
      placeholder="-"
    />
  );
});

export default EtsyEditableCell;

export function EtsyRowNumberCell({ serialNumber, onDelete, deleting = false }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Typography variant="body2">{serialNumber}</Typography>
      <Typography
        component="button"
        type="button"
        variant="caption"
        disabled={deleting}
        onClick={onDelete}
        sx={{
          border: 'none',
          background: 'none',
          color: 'error.main',
          cursor: deleting ? 'default' : 'pointer',
          p: 0,
          fontSize: '0.7rem',
          textDecoration: 'underline',
          opacity: deleting ? 0.5 : 1,
        }}
      >
        {deleting ? '...' : 'Remove'}
      </Typography>
    </Box>
  );
}
