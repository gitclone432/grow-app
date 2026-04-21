// Validate ASIN format
export function validateAsin(asin) {
  const cleaned = asin.trim().toUpperCase();
  return /^B[0-9A-Z]{9}$/.test(cleaned) ? cleaned : null;
}

// Parse bulk ASIN input (textarea) - supports newline, comma, semicolon, space separation
export function parseBulkAsins(text) {
  const lines = text.split(/[\n,;\s]+/);
  const results = { valid: [], invalid: [], duplicates: [] };
  const seen = new Set();
  
  lines.forEach(line => {
    const asin = validateAsin(line);
    if (!asin) {
      if (line.trim()) results.invalid.push(line.trim());
    } else if (seen.has(asin)) {
      results.duplicates.push(asin);
    } else {
      results.valid.push(asin);
      seen.add(asin);
    }
  });
  
  return results;
}

// Parse CSV content - supports both single column and multi-column CSVs
export function parseCsvContent(csvText) {
  const lines = csvText.trim().split('\n');
  const results = { asins: [], errors: [] };
  
  if (lines.length === 0) {
    return results;
  }

  // Parse header to find ASIN column
  const header = lines[0].split(',').map(h => h.trim());
  let asinColumnIndex = header.findIndex(h => h.toUpperCase() === 'ASIN');
  
  // If no ASIN column found, assume first column
  if (asinColumnIndex === -1) {
    asinColumnIndex = 0;
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    const asinValue = row[asinColumnIndex]?.trim();

    if (!asinValue) {
      continue; // Skip empty rows
    }

    const cleanAsin = validateAsin(asinValue);
    if (!cleanAsin) {
      results.errors.push({
        row: i + 1,
        asin: asinValue,
        reason: 'Invalid ASIN format'
      });
    } else {
      results.asins.push(cleanAsin);
    }
  }

  return results;
}

// Generate CSV content for export
export function generateCsvContent(asins) {
  let csv = 'ASIN\n';
  asins.forEach(item => {
    csv += `${item.asin}\n`;
  });
  return csv;
}

// Download CSV file
export function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Read CSV file content
export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
