import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClearIcon from '@mui/icons-material/Clear';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import RedoIcon from '@mui/icons-material/Redo';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../../lib/api.js';
import { formatSheetDateDmy } from '../../../utils/etsySheetDate.js';
import {
  ETSY_PRODUCT_SHEET_SYNC_FIELDS,
  formatSheetPrice,
  getProductLinkHref,
  getProductLinkKey,
  isSheetRowEmpty,
  normalizeSheetCellValue,
  todayIsoDate,
} from '../../../utils/etsyProductSheet.js';
import {
  ETSY_LISTING_PROMPT,
  ETSY_MODEL_PHOTO_PROMPT,
  buildEtsyImageBackgroundPrompt,
  copyTextToClipboard,
} from '../../../utils/etsyListingPrompts.js';
import EtsyProductSheetGrid from './EtsyProductSheetGrid.jsx';

const SHEET_COLUMNS = [
  { key: 'date', label: 'Date', width: 120, placeholder: 'DD-MM-YYYY', picker: 'date' },
  { key: 'slNo', label: 'Sl. No', width: 72, align: 'center', readOnly: true },
  { key: 'productLink', label: 'Product Link', width: 340, flex: 1 },
  { key: 'sku', label: 'SKU', width: 140 },
  { key: 'amazonPrice', label: 'Amazon Price', width: 130, align: 'right' },
  { key: 'etsyPrice', label: 'Etsy Price', width: 120, align: 'right' },
  { key: 'altLink', label: 'Alternative Link', width: 260, flex: 0.5 },
];
// Only shown when every store is listed together; a single-store view assigns the store itself.
const STORE_COLUMN = { key: 'store', label: 'Store', width: 150, placeholder: 'Store name' };
const EDITABLE_FIELDS = new Set(ETSY_PRODUCT_SHEET_SYNC_FIELDS);
const ALL_STORES_VALUE = '';

const MIN_ROWS = 50;
const TRAILING_BLANK_ROWS = 30;
const SAVE_DEBOUNCE_MS = 350;
const SAVE_CHUNK_SIZE = 1000;
const MAX_HISTORY = 100;
const MAX_SYNC_ATTEMPTS = 4;
const MAX_ROWS_IN_MESSAGE = 8;

const DATE_FILTER_MODES = [
  { value: 'all', label: 'All dates' },
  { value: 'single', label: 'Single date' },
  { value: 'range', label: 'Date range' },
];
const EMPTY_FILTERS = { dateMode: 'all', date: null, from: null, to: null, sku: '' };
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILTER_DATE_FORMAT = 'dd-MM-yyyy';

function pickerDateToIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Row filter for the active store / date / SKU filters, or null when nothing is filtered.
 * `allowBlanks` is true when only the store filter is on, so empty rows stay available for new entries.
 */
function buildRowFilter(filters, storeId) {
  const sku = filters.sku.trim().toLowerCase();
  let from = '';
  let to = '';
  if (filters.dateMode === 'single') {
    from = pickerDateToIso(filters.date);
    to = from;
  } else if (filters.dateMode === 'range') {
    from = pickerDateToIso(filters.from);
    to = pickerDateToIso(filters.to);
    if (from && to && from > to) [from, to] = [to, from];
  }
  if (!from && !to && !sku && !storeId) return null;

  const test = (row) => {
    if (isSheetRowEmpty(row)) return false;
    if (storeId && row.store !== storeId) return false;
    if (from || to) {
      const date = String(row.date || '');
      if (!ISO_DATE_PATTERN.test(date)) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
    }
    return !sku || String(row.sku || '').toLowerCase().includes(sku);
  };
  return { test, allowBlanks: !from && !to && !sku };
}

let localRowSeq = 0;

function createBlankRow() {
  localRowSeq += 1;
  return { key: `local-${localRowSeq}`, id: null, store: '', date: '', productLink: '', sku: '', amazonPrice: '', etsyPrice: '', altLink: '' };
}

function fromServerRow(row, key) {
  const next = { key: key || row.id, id: row.id };
  for (const field of ETSY_PRODUCT_SHEET_SYNC_FIELDS) next[field] = row[field] || '';
  return next;
}

function pickFields(row) {
  return Object.fromEntries(ETSY_PRODUCT_SHEET_SYNC_FIELDS.map((field) => [field, row[field]]));
}

/** Keeps spare blank rows below the data so there is always room to type or paste. */
function withTrailingBlanks(rows) {
  let lastData = rows.length - 1;
  while (lastData >= 0 && isSheetRowEmpty(rows[lastData])) lastData -= 1;

  const needed = Math.max(MIN_ROWS, lastData + 1 + TRAILING_BLANK_ROWS);
  if (rows.length >= needed) return rows;

  const next = rows.slice();
  while (next.length < needed) next.push(createBlankRow());
  return next;
}

const linkKeyCache = new Map();

function cachedLinkKey(link) {
  if (!link) return '';
  let key = linkKeyCache.get(link);
  if (key === undefined) {
    if (linkKeyCache.size > 20000) linkKeyCache.clear();
    key = getProductLinkKey(link);
    linkKeyCache.set(link, key);
  }
  return key;
}

/** Duplicate-detection key: the link's ASIN key, scoped to the row's store. */
function rowLinkKey(row) {
  const key = cachedLinkKey(row?.productLink);
  return key ? `${row.store || ''}|${key}` : '';
}

function describeLinkKey(scopedKey) {
  const key = scopedKey.slice(scopedKey.indexOf('|') + 1);
  return key.startsWith('asin:') ? `ASIN ${key.slice(5)}` : 'this link';
}

function formatRowList(indices) {
  const shown = indices.slice(0, MAX_ROWS_IN_MESSAGE).map((index) => index + 1).join(', ');
  return indices.length > MAX_ROWS_IN_MESSAGE ? `${shown}…` : shown;
}

function getErrorMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

export default function EtsyProductSheetPage() {
  const gridRef = useRef(null);
  const [rows, setRowsState] = useState(() => withTrailingBlanks([]));
  const rowsRef = useRef(rows);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [saveState, setSaveState] = useState('saved');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState(ALL_STORES_VALUE);
  const [promptMenuAnchor, setPromptMenuAnchor] = useState(null);
  // Rows edited while filtered stay visible until the filters change, so they don't vanish mid-edit.
  const [pinnedKeys, setPinnedKeys] = useState(() => new Set());

  const storeNameById = useMemo(
    () => Object.fromEntries(stores.map((store) => [String(store._id), store.name])),
    [stores]
  );
  const storeIdByName = useMemo(
    () => new Map(stores.map((store) => [String(store.name).trim().toLowerCase(), String(store._id)])),
    [stores]
  );
  const selectedStore = useMemo(
    () => stores.find((store) => String(store._id) === selectedStoreId) || null,
    [stores, selectedStoreId]
  );
  const selectedStoreIdRef = useRef(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;

  const rowFilter = useMemo(() => buildRowFilter(filters, selectedStoreId), [filters, selectedStoreId]);
  const filterActiveRef = useRef(false);
  filterActiveRef.current = Boolean(rowFilter);

  const columns = useMemo(
    () => (selectedStoreId ? SHEET_COLUMNS : [SHEET_COLUMNS[0], SHEET_COLUMNS[1], STORE_COLUMN, ...SHEET_COLUMNS.slice(2)]),
    [selectedStoreId]
  );
  const linkColumnIndex = columns.findIndex((column) => column.key === 'productLink');

  // rowKey -> Set(field) of edits on saved rows that have not reached the server yet.
  const dirtyRef = useRef(new Map());
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  // Every server call runs through this chain so saves, inserts and deletes never overlap.
  const queueRef = useRef(Promise.resolve());
  const saveTimerRef = useRef(null);
  const duplicateCursorRef = useRef(-1);

  const setRows = useCallback((next) => {
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  const notify = useCallback((message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const syncHistory = useCallback(() => {
    setHistory({ canUndo: undoRef.current.length > 0, canRedo: redoRef.current.length > 0 });
  }, []);

  const markDirty = useCallback((rowKey, field) => {
    const dirty = dirtyRef.current;
    if (!dirty.has(rowKey)) dirty.set(rowKey, new Set());
    dirty.get(rowKey).add(field);
  }, []);

  const hasPendingWork = useCallback(() => {
    const dirty = dirtyRef.current;
    return rowsRef.current.some((row) => (row.id ? dirty.has(row.key) : !isSheetRowEmpty(row)));
  }, []);

  const enqueue = useCallback((task) => {
    const run = queueRef.current.then(task);
    queueRef.current = run.catch(() => {});
    return run;
  }, []);

  // ---- persistence ---------------------------------------------------------

  const applySaveResponse = useCallback(async (chunk, data) => {
    const saved = Array.isArray(data?.rows) ? data.rows : [];
    const byKey = new Map();
    chunk.forEach((item, index) => {
      if (saved[index]) byKey.set(item.snapshot.key, { snapshot: item.snapshot, saved: saved[index] });
    });

    const applied = new Set();
    const next = rowsRef.current.map((row) => {
      const hit = byKey.get(row.key);
      if (!hit) return row;
      applied.add(row.key);

      let updated = row.id ? row : { ...row, id: hit.saved.id };
      for (const field of ETSY_PRODUCT_SHEET_SYNC_FIELDS) {
        const serverValue = hit.saved[field] || '';
        // Take the server's value (auto SKU, normalized text) unless the cell was edited again meanwhile.
        if (row[field] === hit.snapshot[field] && serverValue !== row[field]) {
          if (updated === row) updated = { ...row };
          updated[field] = serverValue;
        }
      }
      return updated;
    });
    setRows(next);

    // Rows deleted locally while their create request was in flight.
    const orphanIds = [];
    chunk.forEach((item, index) => {
      if (!item.fields && saved[index] && !applied.has(item.snapshot.key)) orphanIds.push(saved[index].id);
    });

    let needsReload = false;

    if (orphanIds.length > 0) {
      try {
        await api.post('/etsy/product-sheet/delete', { ids: orphanIds });
      } catch {
        // The rows still exist on the server; reloading shows them instead of hiding the mismatch.
        needsReload = true;
      }
    }

    if (Array.isArray(data?.missingIds) && data.missingIds.length > 0) {
      needsReload = true;
      notify('Some rows were deleted by another user. The sheet has been refreshed.', 'warning');
    }

    const knownIds = new Set(next.map((row) => row.id).filter(Boolean));
    const unseen = (Array.isArray(data?.duplicates) ? data.duplicates : [])
      .flatMap((entry) => entry.matches || [])
      .find((match) => !knownIds.has(match.id));
    if (unseen) {
      needsReload = true;
      notify(
        `Duplicate link — this product was already added by another user${unseen.sku ? ` (SKU ${unseen.sku})` : ''}. The sheet has been refreshed to show it.`,
        'warning'
      );
    }

    return needsReload;
  }, [notify, setRows]);

  const flushOnce = useCallback(async () => {
    const rowsNow = rowsRef.current;
    const dirty = dirtyRef.current;
    dirtyRef.current = new Map();

    // Unsaved rows only exist at the bottom of the sheet; creating every one up to the
    // last row with data keeps the saved order identical to what is on screen.
    let lastCreate = -1;
    rowsNow.forEach((row, index) => {
      if (!row.id && !isSheetRowEmpty(row)) lastCreate = index;
    });

    const items = [];
    rowsNow.forEach((row, index) => {
      if (row.id) {
        const fields = dirty.get(row.key);
        if (!fields || fields.size === 0) return;
        const payload = { id: row.id };
        fields.forEach((field) => {
          payload[field] = row[field];
        });
        items.push({ snapshot: row, payload, fields });
      } else if (index <= lastCreate) {
        items.push({ snapshot: row, payload: { key: row.key, ...pickFields(row) }, fields: null });
      }
    });

    let needsReload = false;
    for (let start = 0; start < items.length; start += SAVE_CHUNK_SIZE) {
      const chunk = items.slice(start, start + SAVE_CHUNK_SIZE);
      let data;
      try {
        ({ data } = await api.post('/etsy/product-sheet/save', { rows: chunk.map((item) => item.payload) }));
      } catch (err) {
        // Put the unsent edits back so the next attempt retries them.
        items.slice(start).forEach((item) => {
          item.fields?.forEach((field) => markDirty(item.snapshot.key, field));
        });
        throw err;
      }
      needsReload = (await applySaveResponse(chunk, data)) || needsReload;
    }
    return needsReload;
  }, [applySaveResponse, markDirty]);

  /** Saves everything pending, then reloads the sheet when asked to (or when the server says it is stale). */
  const syncSheet = useCallback(async ({ forceReload = false } = {}) => {
    let reload = forceReload;

    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
      for (let pass = 0; pass < MAX_SYNC_ATTEMPTS && hasPendingWork(); pass += 1) {
        reload = (await flushOnce()) || reload;
      }
      if (!reload) return;

      const { data } = await api.get('/etsy/product-sheet');
      // Edits made while the sheet was loading must be saved before it is replaced.
      if (hasPendingWork()) continue;

      const keyById = new Map();
      rowsRef.current.forEach((row) => {
        if (row.id) keyById.set(row.id, row.key);
      });
      const loaded = (Array.isArray(data?.rows) ? data.rows : []).map((row) => fromServerRow(row, keyById.get(row.id)));
      dirtyRef.current = new Map();
      setRows(withTrailingBlanks(loaded));
      return;
    }
  }, [flushOnce, hasPendingWork, setRows]);

  const scheduleSaveRef = useRef(() => {});

  const runQueued = useCallback((task, errorFallback) => {
    setSaveState('saving');
    return enqueue(task).then(
      () => {
        if (saveTimerRef.current) return true;
        if (hasPendingWork()) scheduleSaveRef.current();
        else setSaveState('saved');
        return true;
      },
      (err) => {
        setSaveState('error');
        notify(getErrorMessage(err, errorFallback), 'error');
        return false;
      }
    );
  }, [enqueue, hasPendingWork, notify]);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return runQueued(() => syncSheet(), 'Failed to save changes');
  }, [runQueued, syncSheet]);

  const scheduleSave = useCallback(() => {
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveNow();
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);
  scheduleSaveRef.current = scheduleSave;

  const loadSheet = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setLoading(true);
    setLoadError('');
    try {
      await enqueue(() => syncSheet({ forceReload: true }));
      readyRef.current = true;
      setReady(true);
      setSaveState('saved');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load the product sheet');
      if (readyRef.current) {
        setSaveState(hasPendingWork() ? 'error' : 'saved');
        notify(message, 'error');
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [enqueue, hasPendingWork, notify, syncSheet]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  // Save a pending edit instead of dropping it when the user navigates away.
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      enqueue(() => syncSheet()).catch(() => {});
    }
  }, [enqueue, syncSheet]);

  useEffect(() => {
    if (saveState === 'saved') return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ---- editing -------------------------------------------------------------

  const announceDuplicates = useCallback((rowsNow, changedRows) => {
    const keyByRow = new Map();
    changedRows.forEach((index) => {
      const key = rowLinkKey(rowsNow[index]);
      if (key) keyByRow.set(index, key);
    });
    if (keyByRow.size === 0) return;

    const wantedKeys = new Set(keyByRow.values());
    const rowsByKey = new Map();
    rowsNow.forEach((row, index) => {
      const key = rowLinkKey(row);
      if (!wantedKeys.has(key)) return;
      if (!rowsByKey.has(key)) rowsByKey.set(key, []);
      rowsByKey.get(key).push(index);
    });

    // A changed row is a duplicate of a row that was already there, or of an earlier row in the same paste.
    const found = [];
    keyByRow.forEach((key, index) => {
      const original = rowsByKey.get(key).find((other) => other !== index && (!keyByRow.has(other) || other < index));
      if (original !== undefined) found.push({ index, original, key });
    });
    if (found.length === 0) return;

    found.sort((a, b) => a.index - b.index);
    if (found.length === 1) {
      const [{ index, original, key }] = found;
      const sku = rowsNow[original].sku;
      notify(
        `Duplicate link in row ${index + 1} — ${describeLinkKey(key)} is already in row ${original + 1}${sku ? ` (SKU ${sku})` : ''}.`,
        'warning'
      );
    } else {
      notify(
        `${found.length} duplicate links in rows ${formatRowList(found.map((entry) => entry.index))} — these products are already in the sheet (highlighted in red).`,
        'warning'
      );
    }
  }, [notify]);

  const applyChanges = useCallback((changes, { recordHistory = true, autoFill = true } = {}) => {
    const next = rowsRef.current.slice();
    const applied = [];
    const linkRows = new Set();
    const storeRows = new Set();

    const setField = (index, field, value) => {
      const row = next[index];
      if (row[field] === value) return false;
      applied.push({ key: row.key, field, prev: row[field], value });
      next[index] = { ...row, [field]: value };
      markDirty(row.key, field);
      return true;
    };

    for (const change of changes) {
      if (!EDITABLE_FIELDS.has(change.key)) continue;
      const value = normalizeSheetCellValue(change.key, change.value);

      if (change.r >= next.length) {
        if (!value) continue;
        while (next.length <= change.r) next.push(createBlankRow());
      }
      if (!setField(change.r, change.key, value)) continue;
      if (change.key === 'productLink' && value) linkRows.add(change.r);
      if (change.key === 'store') storeRows.add(change.r);
    }
    if (applied.length === 0) return;

    if (autoFill) {
      const today = todayIsoDate();
      linkRows.forEach((index) => {
        if (!next[index].date) setField(index, 'date', today);
      });
    }

    setRows(withTrailingBlanks(next));

    if (filterActiveRef.current) {
      setPinnedKeys((prev) => {
        const pinned = new Set(prev);
        applied.forEach((step) => pinned.add(step.key));
        return pinned;
      });
    }

    if (recordHistory) {
      undoRef.current.push(applied);
      if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
      redoRef.current = [];
      syncHistory();
    }
    if (autoFill) announceDuplicates(next, new Set([...linkRows, ...storeRows]));
    scheduleSave();
  }, [announceDuplicates, markDirty, scheduleSave, setRows, syncHistory]);

  // ---- filtering -----------------------------------------------------------

  // Sheet row index for each visible grid row, or null when unfiltered (grid row = sheet row).
  const viewIndex = useMemo(() => {
    if (!rowFilter) return null;
    let lastData = -1;
    rows.forEach((row, index) => {
      if (!isSheetRowEmpty(row)) lastData = index;
    });

    const visible = [];
    rows.forEach((row, index) => {
      if (
        pinnedKeys.has(row.key)
        || rowFilter.test(row)
        || (rowFilter.allowBlanks && index > lastData)
      ) {
        visible.push(index);
      }
    });
    return visible;
  }, [rows, rowFilter, pinnedKeys]);

  const toSheetRow = useCallback((r) => (viewIndex ? viewIndex[r] : r), [viewIndex]);

  useEffect(() => {
    setPinnedKeys(new Set());
    duplicateCursorRef.current = -1;
    gridRef.current?.resetView();
  }, [rowFilter]);

  const updateFilters = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const handleGridChange = useCallback((changes) => {
    const mapped = [];
    let skipped = false;
    let unknownStore = '';

    // In a store-only view the grid ends with the sheet's trailing blank rows, so a paste that
    // runs past the last visible row continues onto new rows appended to the end of the sheet
    // (instead of silently dropping everything beyond the ~30 visible blanks).
    const appendBase = rowsRef.current.length;
    const canAppend = Boolean(viewIndex && rowFilter?.allowBlanks);

    for (const change of changes) {
      let r = viewIndex ? viewIndex[change.r] : change.r;
      if (r === undefined && canAppend && change.r >= viewIndex.length) {
        r = appendBase + (change.r - viewIndex.length);
      }
      if (r === undefined) {
        if (String(change.value ?? '').trim()) skipped = true;
        continue;
      }

      if (change.key === 'store') {
        // The store column holds names; rows store the matching id.
        const name = String(change.value ?? '').trim();
        const id = name ? storeIdByName.get(name.toLowerCase()) : '';
        if (id === undefined) unknownStore = name;
        else mapped.push({ ...change, r, value: id });
        continue;
      }
      mapped.push({ ...change, r });
    }

    // In a single-store view, a blank row that receives data joins that store.
    const storeId = selectedStoreIdRef.current;
    if (storeId) {
      const rowsNow = rowsRef.current;
      const claimed = new Set();
      mapped.forEach((change) => {
        if (change.key !== 'store' && String(change.value ?? '').trim() && rowsNow[change.r]?.store !== storeId) {
          claimed.add(change.r);
        }
      });
      claimed.forEach((r) => mapped.push({ r, key: 'store', value: storeId }));
    }

    if (unknownStore) {
      notify(`"${unknownStore}" is not an Etsy store — use a store name from Settings → Etsy Stores.`, 'warning');
    }
    if (skipped) {
      notify('Rows past the end of the filtered results were skipped — clear the filters to add new rows.', 'info');
    }
    if (mapped.length > 0) applyChanges(mapped);
  }, [applyChanges, notify, rowFilter, storeIdByName, viewIndex]);

  const replayHistory = useCallback((entry, direction) => {
    const indexByKey = new Map(rowsRef.current.map((row, index) => [row.key, index]));
    const ordered = direction === 'undo' ? entry.slice().reverse() : entry;
    const changes = [];
    for (const step of ordered) {
      const r = indexByKey.get(step.key);
      if (r !== undefined) {
        changes.push({ r, key: step.field, value: direction === 'undo' ? step.prev : step.value });
      }
    }
    applyChanges(changes, { recordHistory: false, autoFill: false });
  }, [applyChanges]);

  const handleUndo = useCallback(() => {
    const entry = undoRef.current.pop();
    if (!entry) return;
    redoRef.current.push(entry);
    replayHistory(entry, 'undo');
    syncHistory();
  }, [replayHistory, syncHistory]);

  const handleRedo = useCallback(() => {
    const entry = redoRef.current.pop();
    if (!entry) return;
    undoRef.current.push(entry);
    replayHistory(entry, 'redo');
    syncHistory();
  }, [replayHistory, syncHistory]);

  // ---- rows ----------------------------------------------------------------

  const handleInsertRows = useCallback((rowIndex, count, position) => {
    const reference = rowsRef.current[rowIndex];
    if (!reference) return;
    const referenceKey = reference.key;

    runQueued(async () => {
      // Pending rows are saved first so the row being inserted next to has an id.
      await syncSheet();

      const rowsNow = rowsRef.current;
      const referenceIndex = rowsNow.findIndex((row) => row.key === referenceKey);
      if (referenceIndex === -1) return;
      const target = rowsNow[position === 'below' ? referenceIndex + 1 : referenceIndex];

      let inserted;
      if (target?.id) {
        const { data } = await api.post('/etsy/product-sheet/insert', { beforeId: target.id, count });
        inserted = (data.rows || []).map((row) => fromServerRow(row));
      } else {
        inserted = Array.from({ length: count }, createBlankRow);
      }

      const latest = rowsRef.current.slice();
      const at = target ? latest.findIndex((row) => row.key === target.key) : latest.length;
      if (at === -1) {
        // The neighbouring row vanished while inserting — take the server's order.
        await syncSheet({ forceReload: true });
        return;
      }
      latest.splice(at, 0, ...inserted);
      setRows(withTrailingBlanks(latest));
    }, 'Failed to insert rows');
  }, [runQueued, setRows, syncSheet]);

  const performDelete = useCallback((keys) => {
    const keySet = new Set(keys);
    const removedIds = [];
    const remaining = rowsRef.current.filter((row) => {
      if (!keySet.has(row.key)) return true;
      if (row.id) removedIds.push(row.id);
      return false;
    });

    keys.forEach((key) => dirtyRef.current.delete(key));
    setRows(withTrailingBlanks(remaining));
    if (removedIds.length === 0) return;

    runQueued(
      () => api.post('/etsy/product-sheet/delete', { ids: removedIds }),
      'Failed to delete rows'
    ).then((ok) => {
      if (!ok) loadSheet();
    });
  }, [loadSheet, runQueued, setRows]);

  const handleDeleteRows = useCallback((firstRow, lastRow) => {
    const indices = [];
    for (let r = firstRow; r <= lastRow; r += 1) {
      const index = viewIndex ? viewIndex[r] : r;
      if (index !== undefined && rowsRef.current[index]) indices.push(index);
    }
    if (indices.length === 0) return;

    const targets = indices.map((index) => rowsRef.current[index]);
    const first = indices[0] + 1;
    const last = indices[indices.length - 1] + 1;
    let title = `Delete row ${first}?`;
    if (indices.length > 1) {
      title = last - first === indices.length - 1 ? `Delete rows ${first}–${last}?` : `Delete ${indices.length} rows?`;
    }

    const request = {
      keys: targets.map((row) => row.key),
      title,
      filled: targets.filter((row) => !isSheetRowEmpty(row)).length,
    };
    if (request.filled > 0) setDeleteRequest(request);
    else performDelete(request.keys);
  }, [performDelete, viewIndex]);

  const confirmDelete = () => {
    if (deleteRequest) performDelete(deleteRequest.keys);
    setDeleteRequest(null);
  };

  // ---- derived view data ---------------------------------------------------

  const derived = useMemo(() => {
    const serials = new Array(rows.length).fill('');
    const rowsByKey = new Map();
    let count = 0;

    rows.forEach((row, index) => {
      // A single-store view numbers and checks only that store's products.
      if (selectedStoreId && row.store !== selectedStoreId) return;

      if (!isSheetRowEmpty(row)) {
        count += 1;
        serials[index] = String(count);
      }

      const key = rowLinkKey(row);
      if (key) {
        if (!rowsByKey.has(key)) rowsByKey.set(key, []);
        rowsByKey.get(key).push(index);
      }
    });

    const duplicates = new Map();
    const duplicateRows = [];
    rowsByKey.forEach((indices, key) => {
      if (indices.length < 2) return;
      indices.forEach((index, position) => {
        duplicates.set(index, { key, indices, isOriginal: position === 0 });
        if (position > 0) duplicateRows.push(index);
      });
    });
    duplicateRows.sort((a, b) => a - b);

    return { serials, duplicates, duplicateRows, productCount: count };
  }, [rows, selectedStoreId]);

  const getCellText = useCallback((r, key) => {
    const index = toSheetRow(r);
    const row = rows[index];
    if (!row) return '';
    if (key === 'slNo') return derived.serials[index] || '';
    if (key === 'store') return storeNameById[row.store] || '';
    if (key === 'date') return formatSheetDateDmy(row.date);
    if (key === 'amazonPrice' || key === 'etsyPrice') return formatSheetPrice(row[key]);
    return row[key] || '';
  }, [rows, derived, toSheetRow, storeNameById]);

  const getEditText = useCallback((r, key) => {
    const index = toSheetRow(r);
    const row = rows[index];
    if (!row) return '';
    if (key === 'slNo') return derived.serials[index] || '';
    if (key === 'store') return storeNameById[row.store] || '';
    if (key === 'date') return formatSheetDateDmy(row.date);
    return row[key] || '';
  }, [rows, derived, toSheetRow, storeNameById]);

  const getRowLabel = useCallback((r) => {
    const index = toSheetRow(r);
    return index === undefined ? r + 1 : index + 1;
  }, [toSheetRow]);

  const getCellMeta = useCallback((r, key) => {
    const index = toSheetRow(r);
    if (key === 'date') return { dateValue: rows[index]?.date || '' };
    if (key === 'altLink') {
      const altLink = rows[index]?.altLink;
      return altLink ? { href: getProductLinkHref(altLink), title: altLink } : undefined;
    }
    if (key !== 'productLink') return undefined;
    const link = rows[index]?.productLink;
    if (!link) return undefined;

    const meta = { href: getProductLinkHref(link), title: link };
    const duplicate = derived.duplicates.get(index);
    if (duplicate) {
      const label = describeLinkKey(duplicate.key);
      if (duplicate.isOriginal) {
        meta.tone = 'original';
        const repeats = duplicate.indices.slice(1);
        meta.title = `${label} is repeated in row${repeats.length === 1 ? '' : 's'} ${formatRowList(repeats)}`;
      } else {
        meta.tone = 'duplicate';
        meta.title = `Duplicate — ${label} is already in row ${duplicate.indices[0] + 1}`;
      }
    }
    return meta;
  }, [rows, derived, toSheetRow]);

  const jumpToNextDuplicate = () => {
    let targets = derived.duplicateRows;
    if (viewIndex) {
      const position = new Map(viewIndex.map((index, r) => [index, r]));
      targets = targets.filter((index) => position.has(index)).map((index) => position.get(index));
      if (targets.length === 0) {
        notify('The duplicate links are hidden by the current filters.', 'info');
        return;
      }
    }
    if (targets.length === 0) return;
    duplicateCursorRef.current = (duplicateCursorRef.current + 1) % targets.length;
    gridRef.current?.selectCell(targets[duplicateCursorRef.current], linkColumnIndex);
  };

  const duplicateCount = derived.duplicateRows.length;
  const matchCount = viewIndex ? viewIndex.filter((index) => !isSheetRowEmpty(rows[index])).length : 0;
  const pluralProducts = derived.productCount === 1 ? 'product' : 'products';
  const productsLabel = viewIndex && matchCount !== derived.productCount
    ? `${matchCount} of ${derived.productCount} ${pluralProducts}`
    : `${derived.productCount} ${pluralProducts}`;
  const hasDateOrSkuFilter = filters.dateMode !== 'all' || Boolean(filters.sku.trim());

  // ---- prompts -------------------------------------------------------------

  const copyPrompt = useCallback(async (label, text) => {
    const copied = await copyTextToClipboard(text);
    notify(copied ? `${label} copied to the clipboard.` : `Could not copy the ${label.toLowerCase()} — copy it manually.`, copied ? 'success' : 'error');
  }, [notify]);

  const copyImagePrompt = (store) => {
    setPromptMenuAnchor(null);
    copyPrompt(`Image prompt for ${store.name}`, buildEtsyImageBackgroundPrompt(store.name));
  };

  const handleImagePromptClick = (event) => {
    if (selectedStore) {
      copyImagePrompt(selectedStore);
    } else if (stores.length === 1) {
      copyImagePrompt(stores[0]);
    } else if (stores.length === 0) {
      notify('Add Etsy stores in Settings → Etsy Stores to use the store name in this prompt.', 'warning');
    } else {
      setPromptMenuAnchor(event.currentTarget);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/etsy/stores');
        if (!cancelled) setStores(Array.isArray(data.stores) ? data.stores : []);
      } catch (err) {
        if (!cancelled) notify(getErrorMessage(err, 'Failed to load Etsy stores'), 'error');
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  return (
    <Box
      sx={{
        height: { xs: 'calc(100vh - 104px)', sm: 'calc(100vh - 112px)' },
        minHeight: 420,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 1.5, flexShrink: 0 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          spacing={1.5}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" fontWeight={700}>
              Product Sheet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Paste Amazon links to build the product list. SKUs are assigned automatically and a link
              whose ASIN is already in the sheet is flagged as a duplicate.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {ready && (
              <Chip
                size="small"
                color="primary"
                label={productsLabel}
              />
            )}
            {duplicateCount > 0 && (
              <Tooltip title="Jump to the next duplicate link">
                <Chip
                  size="small"
                  color="error"
                  icon={<WarningAmberIcon />}
                  label={`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`}
                  onClick={jumpToNextDuplicate}
                />
              </Tooltip>
            )}
            {ready && saveState === 'saving' && (
              <Chip size="small" variant="outlined" icon={<CircularProgress size={12} />} label="Saving…" />
            )}
            {ready && saveState === 'saved' && (
              <Chip size="small" variant="outlined" color="success" icon={<CloudDoneOutlinedIcon />} label="All changes saved" />
            )}
            {ready && saveState === 'error' && (
              <Chip
                size="small"
                color="error"
                icon={<ErrorOutlineIcon />}
                label="Not saved — click to retry"
                onClick={saveNow}
              />
            )}
            <Tooltip title="Undo (Ctrl+Z)">
              <span>
                <IconButton size="small" onClick={handleUndo} disabled={!history.canUndo} aria-label="Undo">
                  <UndoIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Redo (Ctrl+Y)">
              <span>
                <IconButton size="small" onClick={handleRedo} disabled={!history.canRedo} aria-label="Redo">
                  <RedoIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={loadSheet}
              disabled={loading}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 1.5 }}
        >
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
            Copy prompt
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={() => copyPrompt('Master Etsy Listing Prompt', ETSY_LISTING_PROMPT)}
          >
            Master Etsy Listing Prompt
          </Button>
          <Tooltip title={selectedStore ? `Uses the store name "${selectedStore.name}"` : 'Choose which store name goes into the prompt'}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleImagePromptClick}
                disabled={storesLoading}
              >
                Background + Store Name Prompt{selectedStore ? ` · ${selectedStore.name}` : ''}
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={() => copyPrompt('Model Photo Prompt', ETSY_MODEL_PHOTO_PROMPT)}
          >
            Model Photo Prompt
          </Button>
          <Menu
            open={Boolean(promptMenuAnchor)}
            anchorEl={promptMenuAnchor}
            onClose={() => setPromptMenuAnchor(null)}
            transitionDuration={{ enter: 150, exit: 0 }}
          >
            <MenuItem dense disabled>Use which store name?</MenuItem>
            {stores.map((store) => (
              <MenuItem key={store._id} dense onClick={() => copyImagePrompt(store)}>
                {store.name}
              </MenuItem>
            ))}
          </Menu>
        </Stack>

        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}
          >
            <TextField
              select
              size="small"
              label="Etsy Store"
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              disabled={storesLoading}
              sx={{ minWidth: 180 }}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value={ALL_STORES_VALUE}>All Stores</MenuItem>
              {stores.map((store) => (
                <MenuItem key={store._id} value={String(store._id)}>{store.name}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Date filter"
              value={filters.dateMode}
              onChange={(event) => updateFilters({ dateMode: event.target.value })}
              sx={{ width: 150 }}
            >
              {DATE_FILTER_MODES.map((mode) => (
                <MenuItem key={mode.value} value={mode.value}>{mode.label}</MenuItem>
              ))}
            </TextField>

            {filters.dateMode === 'single' && (
              <DatePicker
                label="Date"
                value={filters.date}
                onChange={(value) => updateFilters({ date: value })}
                format={FILTER_DATE_FORMAT}
                slotProps={{ textField: { size: 'small', sx: { width: 170 } }, field: { clearable: true } }}
              />
            )}

            {filters.dateMode === 'range' && (
              <>
                <DatePicker
                  label="From"
                  value={filters.from}
                  onChange={(value) => updateFilters({ from: value })}
                  maxDate={pickerDateToIso(filters.to) ? filters.to : undefined}
                  format={FILTER_DATE_FORMAT}
                  slotProps={{ textField: { size: 'small', sx: { width: 170 } }, field: { clearable: true } }}
                />
                <DatePicker
                  label="To"
                  value={filters.to}
                  onChange={(value) => updateFilters({ to: value })}
                  minDate={pickerDateToIso(filters.from) ? filters.from : undefined}
                  format={FILTER_DATE_FORMAT}
                  slotProps={{ textField: { size: 'small', sx: { width: 170 } }, field: { clearable: true } }}
                />
              </>
            )}

            <TextField
              size="small"
              label="Search SKU"
              placeholder="e.g. UKVLAU012"
              value={filters.sku}
              onChange={(event) => updateFilters({ sku: event.target.value })}
              sx={{ width: 220 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: filters.sku ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Clear SKU search" onClick={() => updateFilters({ sku: '' })}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />

            {hasDateOrSkuFilter && (
              <Button
                size="small"
                startIcon={<FilterAltOffOutlinedIcon />}
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            )}
          </Stack>
        </LocalizationProvider>
      </Paper>

      {!ready ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
          {loadError ? (
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" onClick={loadSheet}>Retry</Button>}
            >
              {loadError}
            </Alert>
          ) : (
            <>
              <CircularProgress size={32} sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">Loading product sheet…</Typography>
            </>
          )}
        </Paper>
      ) : viewIndex && viewIndex.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', flexShrink: 0 }}>
          <Typography color="text.secondary" gutterBottom>
            No products match the current filters.
          </Typography>
          <Button size="small" variant="outlined" startIcon={<FilterAltOffOutlinedIcon />} onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        </Paper>
      ) : (
        <>
          <EtsyProductSheetGrid
            ref={gridRef}
            columns={columns}
            rowCount={viewIndex ? viewIndex.length : rows.length}
            getCellText={getCellText}
            getEditText={getEditText}
            getCellMeta={getCellMeta}
            getRowLabel={getRowLabel}
            onChange={handleGridChange}
            onInsertRows={viewIndex ? undefined : handleInsertRows}
            onDeleteRows={handleDeleteRows}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onNotify={notify}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, flexShrink: 0 }}>
            {viewIndex && rowFilter?.allowBlanks
              ? `Showing ${selectedStore?.name || 'the selected store'} — type or paste below the last product to add more. `
                + 'Row numbers are the rows in the full sheet.'
              : viewIndex
                ? 'Filtered view — row numbers are the rows in the full sheet. Clear the date / SKU filters to add new rows.'
                : 'Click a row number or column header to select it · Ctrl+C / Ctrl+X / Ctrl+V to copy, cut and paste · '
                  + 'Calendar icon or Alt+↓ on a date to pick it · Right-click to insert or delete rows'}
          </Typography>
        </>
      )}

      <Dialog open={Boolean(deleteRequest)} onClose={() => setDeleteRequest(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{deleteRequest?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteRequest?.filled === 1
              ? '1 row with product data will be removed.'
              : `${deleteRequest?.filled} rows with product data will be removed.`}
            {' '}This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRequest(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'warning' || snackbar.severity === 'error' ? 8000 : 4000}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') setSnackbar((prev) => ({ ...prev, open: false }));
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
