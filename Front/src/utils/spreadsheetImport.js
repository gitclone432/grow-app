import { MAX_XLSX_ROWS, xlsxSheetToMatrix } from './spreadsheetMatrix.js';

function yieldToMainThread() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export async function readXlsxFile(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  await yieldToMainThread();

  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, {
    type: 'array',
    cellDates: false,
    sheetRows: MAX_XLSX_ROWS,
    cellStyles: false,
    cellNF: false,
    cellHTML: false,
  });

  await yieldToMainThread();

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return xlsxSheetToMatrix(workbook.Sheets[sheetName], XLSX);
}

export function readCsvFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read CSV file'));
    reader.readAsText(file);
  });
}

export async function readSpreadsheetFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const matrix = await readXlsxFile(file);
    return { matrix, fileType: 'xlsx' };
  }

  const text = await readCsvFileAsText(file);
  return { matrix: null, text, fileType: 'csv' };
}

export async function parseSpreadsheetFile(file, parseMatrix, parseCsv) {
  const lower = file.name.toLowerCase();
  const isExcel = lower.endsWith('.xlsx') || lower.endsWith('.xls');

  if (isExcel) {
    const { matrix } = await readSpreadsheetFile(file);
    await yieldToMainThread();
    return parseMatrix(matrix);
  }

  const { text } = await readSpreadsheetFile(file);
  await yieldToMainThread();
  return parseCsv(text);
}

export { xlsxSheetToMatrix };
