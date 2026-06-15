export const MAX_XLSX_ROWS = 500;
export const MAX_XLSX_COLS = 80;

export function matrixValueToString(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
      return String(Math.round(value));
    }
    return String(value);
  }
  return String(value).trim();
}

export function xlsxCellToString(cell) {
  if (!cell) return '';
  if (cell.t === 'n' && Number.isFinite(cell.v)) {
    return matrixValueToString(cell.v);
  }
  if (cell.w != null && String(cell.w).trim()) {
    return String(cell.w).trim();
  }
  return String(cell.v ?? '').trim();
}

function trimMatrixRows(matrix) {
  let lastDataRow = -1;
  matrix.forEach((row, rowIndex) => {
    if (row.some((cell) => String(cell ?? '').trim() !== '')) {
      lastDataRow = rowIndex;
    }
  });
  if (lastDataRow < 0) return [];
  return matrix.slice(0, Math.min(lastDataRow + 1, MAX_XLSX_ROWS));
}

function trimMatrixColumns(matrix) {
  let lastDataCol = -1;
  matrix.forEach((row) => {
    row.forEach((cell, colIndex) => {
      if (String(cell ?? '').trim() !== '') {
        lastDataCol = Math.max(lastDataCol, colIndex);
      }
    });
  });
  if (lastDataCol < 0) return matrix.map(() => []);
  const colCount = Math.min(lastDataCol + 1, MAX_XLSX_COLS);
  return matrix.map((row) => {
    const next = row.slice(0, colCount);
    while (next.length < colCount) next.push('');
    return next.map(matrixValueToString);
  });
}

/** Build matrix from sparse sheet cells only (avoids scanning huge !ref ranges). */
export function xlsxSheetToMatrix(sheet, XLSX) {
  if (!sheet) return [];

  const cellKeys = Object.keys(sheet).filter((key) => /^[A-Z]+\d+$/i.test(key));
  if (!cellKeys.length) return [];

  let maxR = 0;
  let maxC = 0;
  const values = new Map();

  for (const key of cellKeys) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r >= MAX_XLSX_ROWS || c >= MAX_XLSX_COLS) continue;
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
    values.set(`${r},${c}`, xlsxCellToString(sheet[key]));
  }

  const matrix = [];
  for (let r = 0; r <= maxR; r += 1) {
    const row = [];
    for (let c = 0; c <= maxC; c += 1) {
      row.push(values.get(`${r},${c}`) ?? '');
    }
    matrix.push(row);
  }

  return trimMatrixColumns(trimMatrixRows(matrix));
}
