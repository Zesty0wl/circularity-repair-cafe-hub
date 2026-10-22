/**
 * One CSV cell, safe to open in a spreadsheet.
 *
 * Quotes the value when it holds a comma, a quote or a line break. A
 * spreadsheet also runs a cell that starts with = + - or @ as a formula, and
 * some of these cells hold text a visitor typed at check-in. So text that
 * starts that way gets an apostrophe in front, which spreadsheets show as plain
 * text. Numbers, including negative ones, are left as they are.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
