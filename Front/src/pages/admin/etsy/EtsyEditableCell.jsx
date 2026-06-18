import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Box,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';

function normalizeDisplayValue(value) {
  if (value == null || value === '') return '';
  return String(value);
}

function parseUsdNumber(value) {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeUsdStorage(value) {
  const num = parseUsdNumber(value);
  if (num == null) return '';
  return num.toFixed(2);
}

function formatUsdCellDisplay(value) {
  const num = parseUsdNumber(value);
  if (num == null) return '';
  return `$${num.toFixed(2)}`;
}

function getDisplayLabel(value, column) {
  const text = normalizeDisplayValue(value);
  if (!text) {
    if (column.emptyLabel) return column.emptyLabel;
    return '-';
  }
  if (column.format === 'usd') {
    return formatUsdCellDisplay(text) || '-';
  }
  if (column.optionLabels?.[text]) return column.optionLabels[text];
  return text;
}

function SelectOptionPill({ label, style, compact = false, empty = false }) {
  if (!style) {
    return (
      <Typography
        component="span"
        sx={{
          fontSize: compact ? '0.75rem' : '0.8125rem',
          fontStyle: empty ? 'italic' : 'normal',
          color: 'text.secondary',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
    );
  }

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        px: compact ? 0.75 : 1,
        py: compact ? 0.15 : 0.25,
        borderRadius: '999px',
        fontSize: compact ? '0.6875rem' : '0.75rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        lineHeight: 1.2,
      }}
    >
      {label}
    </Box>
  );
}

const EtsyEditableCell = memo(function EtsyEditableCell({
  column,
  value,
  disabled = false,
  saving = false,
  compact = false,
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
    let normalized = normalizeDisplayValue(nextValue);
    if (column.format === 'usd') {
      normalized = normalizeUsdStorage(normalized);
    }
    const currentValue = column.format === 'usd'
      ? normalizeUsdStorage(value)
      : normalizeDisplayValue(value);
    if (normalized === currentValue) return;
    onSave(normalized);
  };

  const finishEditing = (nextValue = localValue) => {
    commitSave(nextValue);
    setEditing(false);
  };

  const commonSx = {
    '& .MuiInputBase-root': { fontSize: compact ? '0.75rem' : '0.8125rem' },
    '& .MuiInputBase-input': { py: compact ? 0.25 : 0.5, px: compact ? 0.5 : 0.75 },
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
  const displayLabel = column.getDisplayLabel
    ? column.getDisplayLabel(value)
    : getDisplayLabel(localValue, column);
  const isEmptySelect = column.inputType === 'select' && !normalizeDisplayValue(value) && column.emptyLabel;
  const cellAlign = column.align || 'left';
  const justifyContent = cellAlign === 'right' ? 'flex-end' : cellAlign === 'center' ? 'center' : 'flex-start';

  if (column.inputType === 'select' && column.alwaysEdit) {
    return (
      <Select
        fullWidth
        displayEmpty
        size="small"
        variant="standard"
        disableUnderline
        disabled={disabled || saving}
        value={localValue}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(next);
          commitSave(next);
        }}
        renderValue={(selected) => {
          const label = column.optionLabels?.[selected]
            ?? (selected || column.emptyLabel || 'Select status');
          return (
            <SelectOptionPill
              label={label}
              style={selected ? column.optionStyles?.[selected] : null}
              compact={compact}
              empty={!selected}
            />
          );
        }}
        sx={{
          fontSize: compact ? '0.75rem' : '0.8125rem',
          '& .MuiSelect-select': {
            py: compact ? 0.25 : 0.5,
            px: compact ? 0.5 : 0.75,
            minHeight: compact ? 24 : 32,
            display: 'flex',
            alignItems: 'center',
          },
        }}
        MenuProps={{
          PaperProps: { sx: { mt: 0.5 } },
        }}
      >
        {selectOptions.map((option) => {
          const label = column.optionLabels?.[option] ?? (option || column.emptyLabel || '-');
          return (
            <MenuItem key={option || 'empty'} value={option} sx={{ py: compact ? 0.5 : 0.75 }}>
              <SelectOptionPill
                label={label}
                style={option ? column.optionStyles?.[option] : null}
                compact={compact}
                empty={!option}
              />
            </MenuItem>
          );
        })}
      </Select>
    );
  }

  if (!editing) {
    const rawText = normalizeDisplayValue(value);
    const canCopy = column.copyable && rawText && onCopy;

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent,
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
            minHeight: compact ? 20 : 28,
            lineHeight: compact ? 1.2 : 1.4,
            fontSize: compact ? '0.75rem' : undefined,
            textAlign: cellAlign,
            width: cellAlign === 'center' || cellAlign === 'right' ? '100%' : 'auto',
            flex: cellAlign === 'left' ? 1 : undefined,
            cursor: disabled || saving || column.computed ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
            minWidth: 0,
            maxWidth: '100%',
            whiteSpace: compact || !column.multiline ? 'nowrap' : 'pre-wrap',
            overflow: 'hidden',
            textOverflow: compact || !column.multiline ? 'ellipsis' : 'clip',
            wordBreak: compact || !column.multiline ? 'normal' : 'break-word',
            overflowWrap: compact || !column.multiline ? 'normal' : 'anywhere',
            ...(column.computed
              ? { color: 'text.secondary', fontStyle: 'italic' }
              : {}),
            ...(pillStyle
              ? {
                display: 'inline-block',
                px: compact ? 0.75 : 1.25,
                py: compact ? 0.15 : 0.35,
                borderRadius: '999px',
                fontSize: compact ? '0.6875rem' : '0.75rem',
                fontWeight: 600,
                backgroundColor: pillStyle.bg,
                color: pillStyle.color,
              }
              : {
                color: isEmptySelect || displayLabel === '-'
                  ? 'text.secondary'
                  : 'text.primary',
                ...(isEmptySelect ? { fontStyle: 'italic' } : {}),
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
            sx={{ p: compact ? 0.125 : 0.25, flexShrink: 0 }}
          >
            <ContentCopyIcon sx={{ fontSize: compact ? 12 : 14 }} />
          </IconButton>
        )}
      </Box>
    );
  }

  if (column.inputType === 'select') {
    if (column.optionStyles) {
      return (
        <Select
          fullWidth
          displayEmpty
          size="small"
          variant="standard"
          disableUnderline
          disabled={disabled || saving}
          value={localValue}
          defaultOpen
          onChange={(e) => {
            const next = e.target.value;
            setLocalValue(next);
            finishEditing(next);
          }}
          onClose={() => setEditing(false)}
          renderValue={(selected) => {
            const label = column.optionLabels?.[selected] ?? (selected || '-');
            return (
              <SelectOptionPill
                label={label}
                style={selected ? column.optionStyles?.[selected] : null}
                compact={compact}
                empty={!selected}
              />
            );
          }}
          sx={{
            fontSize: compact ? '0.75rem' : '0.8125rem',
            '& .MuiSelect-select': {
              py: compact ? 0.25 : 0.5,
              px: compact ? 0.5 : 0.75,
              minHeight: compact ? 24 : 32,
            },
          }}
        >
          {selectOptions.map((option) => {
            const label = column.optionLabels?.[option] ?? (option || '-');
            return (
              <MenuItem key={option || 'empty'} value={option}>
                <SelectOptionPill
                  label={label}
                  style={option ? column.optionStyles?.[option] : null}
                  compact={compact}
                  empty={!option}
                />
              </MenuItem>
            );
          })}
        </Select>
      );
    }

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
          fontSize: compact ? '0.75rem' : '0.8125rem',
          minWidth: column.minWidth ? Math.min(column.minWidth, 280) : 140,
          '& .MuiNativeSelect-select': {
            py: compact ? 0.25 : 0.5,
            px: compact ? 0.75 : 1,
            minHeight: compact ? 24 : 32,
          },
        }}
      >
        {selectOptions.map((option) => (
          <option key={option || 'empty'} value={option}>
            {column.optionLabels?.[option] ?? (option || '-')}
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
      minRows={column.multiline ? 1 : 1}
      maxRows={column.multiline ? (compact ? 2 : 4) : 1}
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
      placeholder={column.format === 'usd' ? '$0.00' : '-'}
    />
  );
});

export default EtsyEditableCell;

export function EtsyRowNumberCell({
  serialNumber,
  onDelete,
  onCalculate,
  deleting = false,
  compact = false,
  inlineActions = false,
}) {
  const removeButton = (
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
        fontSize: compact ? '0.625rem' : '0.75rem',
        lineHeight: 1.43,
        textDecoration: 'underline',
        opacity: deleting ? 0.5 : 1,
        textTransform: 'lowercase',
      }}
    >
      {deleting ? '...' : 'remove'}
    </Typography>
  );

  if (compact || inlineActions) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? 0.375 : 0.75,
          flexWrap: 'nowrap',
          lineHeight: 1.43,
          whiteSpace: 'nowrap',
        }}
      >
        <Typography
          variant="body2"
          component="span"
          sx={{ fontSize: compact ? '0.75rem' : undefined, lineHeight: 1.43 }}
        >
          {serialNumber}
        </Typography>
        {onCalculate && (
          <Typography
            component="button"
            type="button"
            variant="caption"
            onClick={onCalculate}
            sx={{
              border: 'none',
              background: 'none',
              color: 'primary.main',
              cursor: 'pointer',
              p: 0,
              fontSize: compact ? '0.625rem' : '0.75rem',
              lineHeight: 1.43,
              textDecoration: 'underline',
            }}
          >
            Calc
          </Typography>
        )}
        {removeButton}
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: compact ? 0.125 : 0.5,
      lineHeight: 1.1,
    }}
    >
      <Typography variant="body2" sx={{ fontSize: compact ? '0.75rem' : undefined, lineHeight: 1.1 }}>
        {serialNumber}
      </Typography>
      {onCalculate && (
        <Typography
          component="button"
          type="button"
          variant="caption"
          onClick={onCalculate}
          sx={{
            border: 'none',
            background: 'none',
            color: 'primary.main',
            cursor: 'pointer',
            p: 0,
            fontSize: compact ? '0.625rem' : '0.7rem',
            lineHeight: 1.1,
            textDecoration: 'underline',
          }}
        >
          Calc
        </Typography>
      )}
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
          fontSize: compact ? '0.625rem' : '0.7rem',
          lineHeight: 1.1,
          textDecoration: 'underline',
          opacity: deleting ? 0.5 : 1,
        }}
      >
        {deleting ? '...' : 'Remove'}
      </Typography>
    </Box>
  );
}
