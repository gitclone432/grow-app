import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AddIcon from '@mui/icons-material/Add';
import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DateCalendar, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parseClipboardMatrix, serializeClipboardMatrix } from '../../../utils/etsyProductSheet.js';

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 34;
const GUTTER_WIDTH = 52;
const OVERSCAN_ROWS = 6;
const MAX_PASTE_ROWS = 5000;
const MAX_MENU_INSERT_ROWS = 100;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const stopEvent = (event) => event.stopPropagation();

function isoToDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateToIso(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function gridSx(theme) {
  const primary = theme.palette.primary;
  const line = theme.palette.divider;

  return {
    position: 'relative',
    isolation: 'isolate',
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    outline: 'none',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    bgcolor: 'background.paper',
    fontSize: '0.8125rem',
    lineHeight: 1.2,
    userSelect: 'none',
    cursor: 'cell',
    '& .ps-header': {
      position: 'sticky',
      top: 0,
      zIndex: 4,
      display: 'flex',
      height: HEADER_HEIGHT,
      backgroundColor: primary.main,
      color: primary.contrastText,
      fontWeight: 700,
      fontSize: '0.75rem',
    },
    '& .ps-corner': {
      position: 'sticky',
      left: 0,
      zIndex: 5,
      width: GUTTER_WIDTH,
      flexShrink: 0,
      boxSizing: 'border-box',
      backgroundColor: primary.dark,
      borderRight: '1px solid rgba(255,255,255,0.3)',
      cursor: 'pointer',
    },
    '& .ps-hcell': {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      boxSizing: 'border-box',
      borderRight: '1px solid rgba(255,255,255,0.25)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      cursor: 'pointer',
    },
    '& .ps-hcell.is-active': { backgroundColor: primary.dark },
    '& .ps-body': { position: 'relative' },
    '& .ps-row': { position: 'absolute', left: 0, display: 'flex', height: ROW_HEIGHT },
    '& .ps-gutter': {
      position: 'sticky',
      left: 0,
      zIndex: 3,
      width: GUTTER_WIDTH,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      backgroundColor: theme.palette.grey[100],
      color: theme.palette.text.secondary,
      fontSize: '0.7rem',
      borderRight: `1px solid ${line}`,
      borderBottom: `1px solid ${line}`,
      cursor: 'pointer',
    },
    '& .ps-gutter.is-active': {
      backgroundColor: theme.palette.grey[300],
      color: primary.dark,
      fontWeight: 700,
    },
    '& .ps-cell': {
      position: 'relative',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      boxSizing: 'border-box',
      borderRight: `1px solid ${line}`,
      borderBottom: `1px solid ${line}`,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      backgroundColor: theme.palette.background.paper,
    },
    '& .ps-cell.is-right': { justifyContent: 'flex-end' },
    '& .ps-cell.is-center': { justifyContent: 'center' },
    '& .ps-cell.is-readonly': {
      backgroundColor: theme.palette.grey[50],
      color: theme.palette.text.secondary,
    },
    '& .ps-cell.tone-duplicate': { backgroundColor: '#fde2e1', color: '#b42318', fontWeight: 600 },
    '& .ps-cell.tone-original': { backgroundColor: '#fff3d6' },
    // Inset shadow tints the cell without hiding its own (e.g. duplicate) background.
    '& .ps-cell.is-selected': { boxShadow: `inset 0 0 0 999px ${alpha(primary.main, 0.12)}` },
    '& .ps-text': { overflow: 'hidden', textOverflow: 'ellipsis' },
    '& .ps-text.is-link': { color: '#1155cc' },
    '& .ps-cell.tone-duplicate .ps-text.is-link': { color: 'inherit' },
    '& .ps-open': {
      position: 'absolute',
      right: 4,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      borderRadius: 4,
      color: primary.main,
      backgroundColor: theme.palette.background.paper,
      boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.12)',
      cursor: 'pointer',
    },
    '& .ps-cell:hover .ps-open': { display: 'inline-flex' },
    '& .ps-picker': {
      position: 'absolute',
      right: 4,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      borderRadius: 4,
      color: primary.main,
      cursor: 'pointer',
    },
    '& .ps-picker:hover': { backgroundColor: alpha(primary.main, 0.12) },
    '& .ps-cell:hover .ps-picker, & .ps-cell.is-active .ps-picker': { display: 'inline-flex' },
    '& .ps-outline': { position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box', zIndex: 2 },
    '& .ps-outline.is-range': { border: `1px solid ${primary.main}` },
    '& .ps-outline.is-active': { border: `2px solid ${primary.main}` },
    '& .ps-outline.is-copied': { border: `2px dashed ${primary.main}` },
    '& .ps-editor': {
      position: 'absolute',
      zIndex: 2,
      boxSizing: 'border-box',
      margin: 0,
      padding: '0 6px',
      border: `2px solid ${primary.main}`,
      outline: 'none',
      font: 'inherit',
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.background.paper,
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
      userSelect: 'text',
      cursor: 'text',
    },
  };
}

/**
 * Spreadsheet-style grid: range / row / column selection, keyboard navigation,
 * in-cell editing and clipboard copy, cut and paste (tab-separated, compatible with
 * Google Sheets and Excel). It owns no data — cell values are read through the
 * getters and every edit is reported through onChange as [{ r, key, value }].
 */
const EtsyProductSheetGrid = forwardRef(function EtsyProductSheetGrid({
  columns,
  rowCount,
  getCellText,
  getEditText,
  getCellMeta,
  getRowLabel,
  onChange,
  onInsertRows,
  onDeleteRows,
  onUndo,
  onRedo,
  onNotify,
}, ref) {
  const containerRef = useRef(null);
  const bodyRef = useRef(null);
  const editorRef = useRef(null);
  const dragRef = useRef(null);

  const [sel, setSel] = useState({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } });
  const selRef = useRef(sel);
  const [edit, setEdit] = useState(null);
  const editRef = useRef(null);
  const [copied, setCopied] = useState(null);
  const [menu, setMenu] = useState(null);
  const [datePicker, setDatePicker] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const lastRow = Math.max(0, rowCount - 1);
  const lastCol = columns.length - 1;

  const layout = useMemo(() => {
    const fixedWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const flexTotal = columns.reduce((sum, column) => sum + (column.flex || 0), 0);
    const extra = Math.max(0, viewport.width - GUTTER_WIDTH - fixedWidth);

    let left = GUTTER_WIDTH;
    const cols = columns.map((column) => {
      const width = column.width + (flexTotal ? Math.floor((extra * (column.flex || 0)) / flexTotal) : 0);
      const positioned = { ...column, left, width };
      left += width;
      return positioned;
    });

    return { cols, totalWidth: left };
  }, [columns, viewport.width]);

  const clampCell = useCallback(
    (cell) => ({ r: clamp(cell.r, 0, lastRow), c: clamp(cell.c, 0, lastCol) }),
    [lastRow, lastCol]
  );

  const active = clampCell(sel.anchor);
  const range = useMemo(() => {
    const a = clampCell(sel.anchor);
    const f = clampCell(sel.focus);
    return {
      r0: Math.min(a.r, f.r),
      r1: Math.max(a.r, f.r),
      c0: Math.min(a.c, f.c),
      c1: Math.max(a.c, f.c),
    };
  }, [sel, clampCell]);

  const updateSel = useCallback((next) => {
    selRef.current = next;
    setSel(next);
  }, []);

  const focusGrid = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  const ensureVisible = useCallback((r, c) => {
    const el = containerRef.current;
    const col = layout.cols[c];
    if (!el || !col) return;

    const top = r * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const visibleHeight = el.clientHeight - HEADER_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + visibleHeight) el.scrollTop = bottom - visibleHeight;

    const right = col.left + col.width;
    if (col.left - GUTTER_WIDTH < el.scrollLeft) el.scrollLeft = col.left - GUTTER_WIDTH;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  }, [layout]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pointToCell = useCallback((event) => {
    const rect = bodyRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const r = clamp(Math.floor((event.clientY - rect.top) / ROW_HEIGHT), 0, lastRow);
    let c = layout.cols.findIndex((col) => x < col.left + col.width);
    if (c === -1) c = lastCol;
    return { r, c };
  }, [layout, lastRow, lastCol]);

  // ---- editing -------------------------------------------------------------

  const readEditText = useCallback(
    (r, key) => (getEditText ? getEditText(r, key) : getCellText(r, key)),
    [getEditText, getCellText]
  );

  const startEdit = useCallback((cell, initialValue) => {
    const col = layout.cols[cell.c];
    if (!col || col.readOnly) return;

    const next = {
      r: cell.r,
      c: cell.c,
      value: initialValue !== undefined ? initialValue : readEditText(cell.r, col.key),
    };
    editRef.current = next;
    setEdit(next);
    setCopied(null);
    ensureVisible(cell.r, cell.c);
  }, [layout, readEditText, ensureVisible]);

  const commitEdit = useCallback(() => {
    const current = editRef.current;
    if (!current) return;

    editRef.current = null;
    setEdit(null);
    const col = layout.cols[current.c];
    if (col) onChange([{ r: current.r, key: col.key, value: current.value }], 'edit');
  }, [layout, onChange]);

  const cancelEdit = useCallback(() => {
    editRef.current = null;
    setEdit(null);
    focusGrid();
  }, [focusGrid]);

  const isEditing = Boolean(edit);
  useLayoutEffect(() => {
    const input = editorRef.current;
    if (!isEditing || !input) return;
    input.focus({ preventScroll: true });
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [isEditing, edit?.r, edit?.c]);

  // ---- date picker ---------------------------------------------------------

  /** Opens the calendar for a date cell; a pick fills every selected row of that column. */
  const openDatePicker = useCallback((cell) => {
    const col = layout.cols[cell.c];
    if (!col || col.picker !== 'date' || col.readOnly || !bodyRef.current) return;

    commitEdit();
    setCopied(null);
    ensureVisible(cell.r, cell.c);

    const current = selRef.current;
    const a = clampCell(current.anchor);
    const f = clampCell(current.focus);
    const r0 = Math.min(a.r, f.r);
    const r1 = Math.max(a.r, f.r);
    const inRange = cell.c >= Math.min(a.c, f.c) && cell.c <= Math.max(a.c, f.c) && cell.r >= r0 && cell.r <= r1;

    const rect = bodyRef.current.getBoundingClientRect();
    setDatePicker({
      r: cell.r,
      key: col.key,
      rows: inRange ? { r0, r1 } : { r0: cell.r, r1: cell.r },
      value: isoToDate(getCellMeta?.(cell.r, col.key)?.dateValue),
      top: rect.top + (cell.r + 1) * ROW_HEIGHT,
      left: rect.left + col.left,
    });
  }, [layout, commitEdit, ensureVisible, clampCell, getCellMeta]);

  const closeDatePicker = useCallback(() => {
    // Focus returns to the grid from the popover's onExited, once its focus trap is gone.
    setDatePicker(null);
  }, []);

  const applyPickedDate = useCallback((value) => {
    const picker = datePicker;
    if (!picker) return;

    const changes = [];
    for (let r = picker.rows.r0; r <= picker.rows.r1; r += 1) {
      changes.push({ r, key: picker.key, value });
    }
    onChange(changes, 'picker');
    closeDatePicker();
  }, [datePicker, onChange, closeDatePicker]);

  const handlePickerMouseDown = (event, r, c) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const current = selRef.current;
    const a = clampCell(current.anchor);
    const f = clampCell(current.focus);
    const inRange = r >= Math.min(a.r, f.r) && r <= Math.max(a.r, f.r)
      && c >= Math.min(a.c, f.c) && c <= Math.max(a.c, f.c);
    if (!inRange) updateSel({ anchor: { r, c }, focus: { r, c } });

    openDatePicker({ r, c });
  };

  // ---- navigation ----------------------------------------------------------

  const findJumpTarget = useCallback((cell, dr, dc) => {
    const inBounds = (r, c) => r >= 0 && r <= lastRow && c >= 0 && c <= lastCol;
    const filled = (r, c) => getCellText(r, layout.cols[c].key) !== '';

    let r = cell.r + dr;
    let c = cell.c + dc;
    if (!inBounds(r, c)) return cell;

    if (filled(cell.r, cell.c) && filled(r, c)) {
      while (inBounds(r + dr, c + dc) && filled(r + dr, c + dc)) {
        r += dr;
        c += dc;
      }
      return { r, c };
    }

    while (inBounds(r, c) && !filled(r, c)) {
      r += dr;
      c += dc;
    }
    return inBounds(r, c) ? { r, c } : { r: r - dr, c: c - dc };
  }, [getCellText, layout, lastRow, lastCol]);

  const moveActive = useCallback((dr, dc, { extend = false, jump = false } = {}) => {
    const current = selRef.current;
    const base = clampCell(extend ? current.focus : current.anchor);
    const cell = jump
      ? findJumpTarget(base, dr, dc)
      : clampCell({ r: base.r + dr, c: base.c + dc });

    updateSel(extend ? { anchor: clampCell(current.anchor), focus: cell } : { anchor: cell, focus: cell });
    ensureVisible(cell.r, cell.c);
  }, [clampCell, findJumpTarget, updateSel, ensureVisible]);

  // ---- clipboard / bulk edits ---------------------------------------------

  const buildCopyText = useCallback(() => {
    const matrix = [];
    for (let r = range.r0; r <= range.r1; r += 1) {
      const row = [];
      for (let c = range.c0; c <= range.c1; c += 1) {
        row.push(readEditText(r, layout.cols[c].key));
      }
      matrix.push(row);
    }
    // Whole-column selections reach into the blank rows below the data; leave those out.
    while (matrix.length > 1 && matrix[matrix.length - 1].every((value) => value === '')) {
      matrix.pop();
    }
    return serializeClipboardMatrix(matrix);
  }, [range, layout, readEditText]);

  const clearRange = useCallback(() => {
    const changes = [];
    for (let r = range.r0; r <= range.r1; r += 1) {
      for (let c = range.c0; c <= range.c1; c += 1) {
        const col = layout.cols[c];
        if (!col.readOnly && readEditText(r, col.key) !== '') {
          changes.push({ r, key: col.key, value: '' });
        }
      }
    }
    setCopied(null);
    if (changes.length > 0) onChange(changes, 'clear');
  }, [range, layout, readEditText, onChange]);

  const applyPaste = useCallback((text) => {
    const matrix = parseClipboardMatrix(text);
    if (matrix.length === 0 || matrix[0].length === 0) return;
    if (matrix.length > MAX_PASTE_ROWS) {
      onNotify?.(`Paste is limited to ${MAX_PASTE_ROWS} rows at a time.`, 'warning');
      return;
    }

    const srcRows = matrix.length;
    const srcCols = matrix[0].length;
    const selRows = range.r1 - range.r0 + 1;
    const selCols = range.c1 - range.c0 + 1;

    // A larger selection is filled by repeating the copied block (like Sheets), except
    // for whole-column selections, which would otherwise fill every blank row.
    const wholeColumn = rowCount > 1 && selRows >= rowCount;
    const fills = !wholeColumn && selRows % srcRows === 0 && selCols % srcCols === 0;
    const outRows = fills ? selRows : srcRows;
    const outCols = fills ? selCols : srcCols;

    const changes = [];
    for (let i = 0; i < outRows; i += 1) {
      for (let j = 0; j < outCols; j += 1) {
        const col = layout.cols[range.c0 + j];
        if (!col || col.readOnly) continue;
        changes.push({ r: range.r0 + i, key: col.key, value: matrix[i % srcRows][j % srcCols] });
      }
    }

    setCopied(null);
    if (changes.length > 0) onChange(changes, 'paste');
    updateSel({
      anchor: { r: range.r0, c: range.c0 },
      focus: { r: range.r0 + outRows - 1, c: Math.min(range.c0 + outCols - 1, lastCol) },
    });
  }, [range, layout, rowCount, lastCol, onChange, onNotify, updateSel]);

  const handleCopy = (event) => {
    if (editRef.current) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', buildCopyText());
    setCopied(range);
  };

  const handleCut = (event) => {
    if (editRef.current) return;
    handleCopy(event);
    clearRange();
  };

  const handlePaste = (event) => {
    if (editRef.current) return;
    event.preventDefault();
    applyPaste(event.clipboardData.getData('text/plain'));
  };

  // ---- keyboard ------------------------------------------------------------

  const handleKeyDown = (event) => {
    if (editRef.current) return;

    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

    if (event.altKey && key === 'ArrowDown' && layout.cols[active.c]?.picker === 'date') {
      event.preventDefault();
      openDatePicker(active);
      return;
    }

    if (arrows[key]) {
      event.preventDefault();
      moveActive(arrows[key][0], arrows[key][1], { extend: event.shiftKey, jump: ctrl });
      return;
    }

    if (ctrl) {
      const lower = key.toLowerCase();
      if (lower === 'a') {
        event.preventDefault();
        updateSel({ anchor: { r: 0, c: 0 }, focus: { r: lastRow, c: lastCol } });
      } else if (lower === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo?.();
        else onUndo?.();
      } else if (lower === 'y') {
        event.preventDefault();
        onRedo?.();
      } else if (key === 'Home') {
        event.preventDefault();
        updateSel({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } });
        ensureVisible(0, 0);
      }
      return;
    }

    switch (key) {
      case 'Tab':
        event.preventDefault();
        moveActive(0, event.shiftKey ? -1 : 1);
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        if (layout.cols[active.c]?.readOnly) moveActive(1, 0);
        else startEdit(active);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        clearRange();
        break;
      case 'Escape':
        setCopied(null);
        break;
      case 'Home':
        event.preventDefault();
        moveActive(0, -lastCol, { extend: event.shiftKey });
        break;
      case 'End':
        event.preventDefault();
        moveActive(0, lastCol, { extend: event.shiftKey });
        break;
      case 'PageUp':
      case 'PageDown': {
        event.preventDefault();
        const page = Math.max(1, Math.floor((viewport.height - HEADER_HEIGHT) / ROW_HEIGHT) - 1);
        moveActive(key === 'PageUp' ? -page : page, 0, { extend: event.shiftKey });
        break;
      }
      default:
        if (key.length === 1 && !event.altKey) {
          event.preventDefault();
          startEdit(active, key);
        }
    }
  };

  const handleEditorKeyDown = (event) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
      moveActive(event.shiftKey ? -1 : 1, 0);
      focusGrid();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit();
      moveActive(0, event.shiftKey ? -1 : 1);
      focusGrid();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  };

  // ---- mouse ---------------------------------------------------------------

  const beginSelection = (mode, anchor, focus) => {
    commitEdit();
    updateSel({ anchor, focus });
    dragRef.current = mode;
    focusGrid();
  };

  const handleBodyMouseDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const cell = pointToCell(event);
    beginSelection('cells', event.shiftKey ? clampCell(selRef.current.anchor) : cell, cell);
  };

  const handleBodyDoubleClick = (event) => {
    startEdit(pointToCell(event));
  };

  const handleGutterMouseDown = (event, r) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const anchorRow = event.shiftKey ? clampCell(selRef.current.anchor).r : r;
    beginSelection('rows', { r: anchorRow, c: 0 }, { r, c: lastCol });
  };

  const handleHeaderMouseDown = (event, c) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const anchorCol = event.shiftKey ? clampCell(selRef.current.anchor).c : c;
    beginSelection('cols', { r: 0, c: anchorCol }, { r: lastRow, c });
  };

  const handleCornerMouseDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    beginSelection(null, { r: 0, c: 0 }, { r: lastRow, c: lastCol });
  };

  useEffect(() => {
    const handleMove = (event) => {
      const mode = dragRef.current;
      if (!mode || !bodyRef.current) return;

      const cell = pointToCell(event);
      const current = selRef.current;
      let focus = cell;
      if (mode === 'rows') focus = { r: cell.r, c: lastCol };
      if (mode === 'cols') focus = { r: lastRow, c: cell.c };

      if (focus.r !== current.focus.r || focus.c !== current.focus.c) {
        updateSel({ anchor: current.anchor, focus });
      }
    };
    const handleUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [pointToCell, updateSel, lastRow, lastCol]);

  // ---- context menu --------------------------------------------------------

  const handleContextMenu = (event) => {
    if (editRef.current) return;
    event.preventDefault();

    const gutter = event.target.closest?.('[data-gutter-row]');
    const header = event.target.closest?.('.ps-header');

    if (gutter) {
      const r = Number(gutter.dataset.gutterRow);
      const fullRows = range.c0 === 0 && range.c1 === lastCol;
      if (!fullRows || r < range.r0 || r > range.r1) {
        updateSel({ anchor: { r, c: 0 }, focus: { r, c: lastCol } });
      }
    } else if (!header) {
      const cell = pointToCell(event);
      const inside = cell.r >= range.r0 && cell.r <= range.r1 && cell.c >= range.c0 && cell.c <= range.c1;
      if (!inside) updateSel({ anchor: cell, focus: cell });
    }

    focusGrid();
    setMenu({ top: event.clientY, left: event.clientX });
  };

  const closeMenu = () => setMenu(null);

  const runMenuAction = (action) => () => {
    closeMenu();
    action();
  };

  const copyFromMenu = async (cut) => {
    try {
      await navigator.clipboard.writeText(buildCopyText());
    } catch {
      onNotify?.(`Clipboard access was blocked — press Ctrl+${cut ? 'X' : 'C'} instead.`, 'info');
      return;
    }
    setCopied(range);
    if (cut) clearRange();
  };

  const pasteFromMenu = async () => {
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      onNotify?.('Clipboard access was blocked — press Ctrl+V to paste.', 'info');
      return;
    }
    applyPaste(text);
  };

  useImperativeHandle(ref, () => ({
    selectCell(r, c) {
      const cell = clampCell({ r, c });
      commitEdit();
      updateSel({ anchor: cell, focus: cell });
      ensureVisible(cell.r, cell.c);
      focusGrid();
    },
    /** Back to the top-left cell without taking focus (e.g. while typing in a filter box). */
    resetView() {
      editRef.current = null;
      setEdit(null);
      setCopied(null);
      updateSel({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } });
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        containerRef.current.scrollLeft = 0;
      }
    },
    focus: focusGrid,
  }), [clampCell, commitEdit, updateSel, ensureVisible, focusGrid]);

  // ---- render --------------------------------------------------------------

  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const lastVisible = Math.min(
    lastRow,
    Math.ceil((scrollTop + Math.max(0, viewport.height - HEADER_HEIGHT)) / ROW_HEIGHT) + OVERSCAN_ROWS
  );

  const outlineStyle = ({ r0, r1, c0, c1 }) => {
    const first = layout.cols[c0];
    const last = layout.cols[c1];
    return {
      left: first.left,
      top: r0 * ROW_HEIGHT,
      width: last.left + last.width - first.left,
      height: (r1 - r0 + 1) * ROW_HEIGHT,
    };
  };

  const isMultiCell = range.r0 !== range.r1 || range.c0 !== range.c1;
  const selectedRowCount = range.r1 - range.r0 + 1;
  const menuInsertCount = selectedRowCount > MAX_MENU_INSERT_ROWS ? 1 : selectedRowCount;
  const rowsLabel = (count) => (count === 1 ? '1 row' : `${count} rows`);
  const rowLabel = (r) => (getRowLabel ? getRowLabel(r) : r + 1);
  let deleteLabel = `row ${rowLabel(range.r0)}`;
  if (selectedRowCount > 1) {
    const first = rowLabel(range.r0);
    const last = rowLabel(range.r1);
    // A filtered view can select rows that are not next to each other in the sheet.
    deleteLabel = last - first === selectedRowCount - 1 ? `rows ${first}–${last}` : `${selectedRowCount} rows`;
  }

  const renderedRows = [];
  if (rowCount > 0) {
    for (let r = firstVisible; r <= lastVisible; r += 1) {
      const rowInRange = r >= range.r0 && r <= range.r1;

      renderedRows.push(
        <div key={r} className="ps-row" style={{ top: r * ROW_HEIGHT, width: layout.totalWidth }}>
          <div
            className={`ps-gutter${rowInRange ? ' is-active' : ''}`}
            data-gutter-row={r}
            onMouseDown={(event) => handleGutterMouseDown(event, r)}
            onDoubleClick={stopEvent}
          >
            {rowLabel(r)}
          </div>
          {layout.cols.map((col, c) => {
            const meta = getCellMeta?.(r, col.key);
            const isActive = r === active.r && c === active.c;
            const isSelected = rowInRange && c >= range.c0 && c <= range.c1 && isMultiCell && !isActive;

            let className = 'ps-cell';
            if (col.align === 'right') className += ' is-right';
            if (col.align === 'center') className += ' is-center';
            if (col.readOnly) className += ' is-readonly';
            if (isActive) className += ' is-active';
            if (meta?.tone) className += ` tone-${meta.tone}`;
            if (isSelected) className += ' is-selected';

            return (
              <div key={col.key} className={className} style={{ width: col.width }} title={meta?.title || undefined}>
                <span className={meta?.href ? 'ps-text is-link' : 'ps-text'}>{getCellText(r, col.key)}</span>
                {meta?.href && (
                  <a
                    className="ps-open"
                    href={meta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={-1}
                    aria-label="Open link in new tab"
                    onMouseDown={stopEvent}
                    onDoubleClick={stopEvent}
                  >
                    <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </a>
                )}
                {col.picker === 'date' && !col.readOnly && (
                  <span
                    className="ps-picker"
                    role="button"
                    title="Pick a date (Alt+↓)"
                    aria-label="Pick a date"
                    onMouseDown={(event) => handlePickerMouseDown(event, r, c)}
                    onDoubleClick={stopEvent}
                  >
                    <CalendarMonthOutlinedIcon sx={{ fontSize: 16 }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }
  }

  const editCol = edit ? layout.cols[edit.c] : null;

  return (
    <>
      <Box
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={rowCount}
        aria-colcount={columns.length}
        sx={gridSx}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onContextMenu={handleContextMenu}
      >
        <div className="ps-header" style={{ width: layout.totalWidth }}>
          <div className="ps-corner" title="Select all" onMouseDown={handleCornerMouseDown} />
          {layout.cols.map((col, c) => (
            <div
              key={col.key}
              className={`ps-hcell${c >= range.c0 && c <= range.c1 ? ' is-active' : ''}`}
              style={{
                width: col.width,
                justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
              }}
              onMouseDown={(event) => handleHeaderMouseDown(event, c)}
            >
              {col.label}
            </div>
          ))}
        </div>

        <div
          ref={bodyRef}
          className="ps-body"
          style={{ width: layout.totalWidth, height: rowCount * ROW_HEIGHT }}
          onMouseDown={handleBodyMouseDown}
          onDoubleClick={handleBodyDoubleClick}
        >
          {renderedRows}

          {rowCount > 0 && isMultiCell && <div className="ps-outline is-range" style={outlineStyle(range)} />}
          {rowCount > 0 && !edit && (
            <div
              className="ps-outline is-active"
              style={outlineStyle({ r0: active.r, r1: active.r, c0: active.c, c1: active.c })}
            />
          )}
          {copied && copied.r0 <= lastRow && (
            <div
              className="ps-outline is-copied"
              style={outlineStyle({ ...copied, r1: Math.min(copied.r1, lastRow) })}
            />
          )}

          {edit && editCol && (
            <input
              ref={editorRef}
              className="ps-editor"
              value={edit.value}
              placeholder={editCol.placeholder || ''}
              spellCheck={false}
              autoComplete="off"
              aria-label={`${editCol.label}, row ${rowLabel(edit.r)}`}
              style={{
                left: editCol.left,
                top: edit.r * ROW_HEIGHT,
                width: editCol.width,
                height: ROW_HEIGHT,
                textAlign: editCol.align === 'right' ? 'right' : 'left',
              }}
              onChange={(event) => {
                const next = { ...editRef.current, value: event.target.value };
                editRef.current = next;
                setEdit(next);
              }}
              onKeyDown={handleEditorKeyDown}
              onBlur={commitEdit}
              onMouseDown={stopEvent}
              onDoubleClick={stopEvent}
            />
          )}
        </div>
      </Box>

      <Menu
        open={Boolean(menu)}
        onClose={closeMenu}
        // A right-click outside the open menu lands on its backdrop; dismiss instead of showing the browser menu.
        onContextMenu={(event) => {
          event.preventDefault();
          closeMenu();
        }}
        anchorReference="anchorPosition"
        anchorPosition={menu || undefined}
        transitionDuration={{ enter: 150, exit: 0 }}
        slotProps={{ paper: { sx: { minWidth: 230 } } }}
      >
        <MenuItem dense onClick={runMenuAction(() => copyFromMenu(true))}>
          <ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Cut</ListItemText>
          <Typography variant="caption" color="text.secondary">Ctrl+X</Typography>
        </MenuItem>
        <MenuItem dense onClick={runMenuAction(() => copyFromMenu(false))}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Copy</ListItemText>
          <Typography variant="caption" color="text.secondary">Ctrl+C</Typography>
        </MenuItem>
        <MenuItem dense onClick={runMenuAction(pasteFromMenu)}>
          <ListItemIcon><ContentPasteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Paste</ListItemText>
          <Typography variant="caption" color="text.secondary">Ctrl+V</Typography>
        </MenuItem>
        {layout.cols[active.c]?.picker === 'date' && [
          <Divider key="date-divider" />,
          <MenuItem key="date-pick" dense onClick={runMenuAction(() => openDatePicker(active))}>
            <ListItemIcon><CalendarMonthOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Pick date</ListItemText>
            <Typography variant="caption" color="text.secondary">Alt+↓</Typography>
          </MenuItem>,
        ]}
        <Divider />
        {onInsertRows && [
          <MenuItem key="insert-above" dense onClick={runMenuAction(() => onInsertRows(range.r0, menuInsertCount, 'above'))}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Insert {rowsLabel(menuInsertCount)} above</ListItemText>
          </MenuItem>,
          <MenuItem key="insert-below" dense onClick={runMenuAction(() => onInsertRows(range.r1, menuInsertCount, 'below'))}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Insert {rowsLabel(menuInsertCount)} below</ListItemText>
          </MenuItem>,
        ]}
        <MenuItem dense onClick={runMenuAction(() => onDeleteRows?.(range.r0, range.r1))}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Delete {deleteLabel}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem dense onClick={runMenuAction(clearRange)}>
          <ListItemIcon><BackspaceOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Clear cells</ListItemText>
          <Typography variant="caption" color="text.secondary">Delete</Typography>
        </MenuItem>
      </Menu>

      <Popover
        open={Boolean(datePicker)}
        onClose={closeDatePicker}
        anchorReference="anchorPosition"
        anchorPosition={datePicker ? { top: datePicker.top, left: datePicker.left } : undefined}
        // An exit fade would leave the invisible backdrop up and swallow the next click on the sheet.
        transitionDuration={{ enter: 150, exit: 0 }}
        slotProps={{ transition: { onExited: focusGrid } }}
        disableRestoreFocus
      >
        {datePicker && (
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {datePicker.rows.r1 > datePicker.rows.r0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1.5 }}>
                Applies to rows {datePicker.rows.r0 + 1}–{datePicker.rows.r1 + 1}
              </Typography>
            )}
            <DateCalendar
              value={datePicker.value}
              onChange={(value, selectionState) => {
                if (selectionState === 'finish' && value && !Number.isNaN(value.getTime())) {
                  applyPickedDate(dateToIso(value));
                }
              }}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ px: 1.5, pb: 1.5, mt: -1 }}>
              <Button size="small" color="inherit" onClick={() => applyPickedDate('')}>
                Clear
              </Button>
              <Button size="small" onClick={() => applyPickedDate(dateToIso(new Date()))}>
                Today
              </Button>
            </Stack>
          </LocalizationProvider>
        )}
      </Popover>
    </>
  );
});

export default EtsyProductSheetGrid;
