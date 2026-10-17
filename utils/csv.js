// CSV cells are always quoted, embedded quotes doubled, and a leading formula
// character is neutralised so a spreadsheet treats untrusted text as text.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
