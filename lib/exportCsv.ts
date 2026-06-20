export function downloadCsv(rows: (string | number | null | undefined)[][], filename: string) {
  const csv = rows.map(row =>
    row.map(cell => {
      const str = cell == null ? '' : String(cell);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  ).join('\r\n');

  // BOM ensures Excel opens with correct UTF-8 encoding
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
