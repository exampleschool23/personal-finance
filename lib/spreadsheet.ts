import { maxStatementRows, statementErrors, type StatementSheet } from './statement-rows';

// Shared by the .xlsx and .xls readers: dates, numbers and the table a sheet becomes.

// Built-in number formats that show dates or times.
const builtInDateFormats = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Whether a cell's number format shows a date, so its serial number is a day rather than an amount. */
export function isDateFormat(id: number, code?: string) {
 if (builtInDateFormats.has(id)) return true;
 if (!code) return false;
 // Ignore quoted text, escaped characters and [colour]/[locale] sections before looking for date parts.
 const plain = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').split(';')[0];
 return /[dy]/i.test(plain) || (/m/i.test(plain) && !/[0#?]/.test(plain));
}

/** The calendar day of a spreadsheet date serial. Workbooks count from 1899-12-30, or from 1904-01-01 in the 1904 system. */
export function serialDate(serial: number, date1904 = false) {
 if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
 const day = Math.floor(serial) + (date1904 ? 1462 : 0);
 return new Date(Date.UTC(1899, 11, 30) + day * 86_400_000).toISOString().slice(0, 10);
}

/** A number cell as plain text with `.` decimals, rounded to the 15 significant digits a spreadsheet shows. */
export function numberText(value: number) {
 const rounded = Number(value.toPrecision(15));
 return Math.abs(rounded) >= 1e-6 || rounded === 0 ? String(rounded) : '0';
}

/** A sheet's rows as an import table: blank rows and leading title lines dropped, every row the same width. */
export function sheetTable(label: string, cells: string[][]): StatementSheet {
 const rows = cells.map(row => row.map(cell => (cell ?? '').trim())).filter(row => row.some(Boolean));
 // Banks often put a title or an account line above the header row.
 const start = rows.findIndex(row => row.filter(Boolean).length >= 2);
 const table = start < 0 ? [] : rows.slice(start);
 if (table.length > maxStatementRows + 1) throw Error(statementErrors.tooMany);
 const width = Math.max(0, ...table.map(row => row.length));
 return { label, rows: table.map(row => Array.from({ length: width }, (_, index) => row[index] ?? '')) };
}

/** The non-empty sheets of a workbook, or the empty-file error. */
export function workbookSheets(sheets: StatementSheet[]) {
 const filled = sheets.filter(sheet => sheet.rows.length > 1);
 if (!filled.length) throw Error(statementErrors.empty);
 return filled;
}
