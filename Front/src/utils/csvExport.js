/**
 * CSV Export Utility
 * Converts array of objects to CSV and triggers download
 */

export function downloadCSV(data, filename) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        let value = row[header];
        
        // Handle null/undefined
        if (value === null || value === undefined) {
          return '';
        }
        
        // Convert objects/arrays to JSON string
        if (typeof value === 'object') {
          value = JSON.stringify(value);
        }
        
        // Convert to string
        value = String(value);
        
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        
        return value;
      }).join(',')
    )
  ].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format data for CSV export by selecting and transforming specific fields
 */
export function prepareCSVData(items, fieldMapping) {
  return items.map(item => {
    const row = {};
    Object.entries(fieldMapping).forEach(([csvHeader, accessor]) => {
      // accessor can be a string (field name) or function (custom transformation)
      row[csvHeader] = typeof accessor === 'function' 
        ? accessor(item) 
        : item[accessor];
    });
    return row;
  });
}
