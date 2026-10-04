import { isOFX, ofxEncoding, parseOFX } from './ofx';
import { isQIF, parseQIF } from './qif';
import { sheetTable, workbookSheets } from './spreadsheet';
import { decodeEntities, statementErrors, type StatementSheet } from './statement-rows';
import { isCompoundFile, readXls } from './xls';
import { readXlsx } from './xlsx';
import { isZip } from './zip';

// The one entry point of the statement import: every supported file becomes either
// CSV text (mapped with a delimiter) or ready tables, which the CSV mapping then reads.
// The import screen loads this module only when a file is chosen.

export type StatementFormat = 'csv' | 'xlsx' | 'xls' | 'ofx' | 'qif';
export type StatementFile = { format: 'csv'; text: string } | { format: Exclude<StatementFormat, 'csv'>; sheets: StatementSheet[] };

export const maxStatementFileSize = 2_000_000;

const extension = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? '';

/** Many banks name an HTML table `.xls`; its first table reads like a sheet. */
function htmlTable(html: string): StatementSheet[] {
 const table = /<table\b[\s\S]*?<\/table>/i.exec(html)?.[0] ?? '';
 const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>)/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?=<t[dh]\b|<\/tr>|$)/gi)].map(cell => decodeEntities(cell[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()));
 return workbookSheets([sheetTable('', rows)]);
}

/** Reads a statement file by its contents, using the name only to tell text spreadsheets from other text. */
export async function readStatementFile(name: string, bytes: Uint8Array): Promise<StatementFile> {
 if (bytes.length > maxStatementFileSize) throw Error('File is too large.');
 const type = extension(name);
 if (isZip(bytes)) {
  if (!['xlsx', 'xlsm'].includes(type)) throw Error(statementErrors.unsupported);
  return { format: 'xlsx', sheets: await readXlsx(bytes) };
 }
 if (isCompoundFile(bytes)) {
  if (type !== 'xls') throw Error(statementErrors.unsupported);
  return { format: 'xls', sheets: readXls(bytes) };
 }
 // Text formats. Binary files that are none of the above are not statements.
 if (bytes.subarray(0, 4096).includes(0)) throw Error(statementErrors.unsupported);
 const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
 const text = new TextDecoder(isOFX(head) ? ofxEncoding(head) : 'utf-8').decode(bytes);
 if (isOFX(text)) return { format: 'ofx', sheets: parseOFX(text) };
 if (isQIF(text)) return { format: 'qif', sheets: parseQIF(text) };
 if (type === 'xls' && /<table\b/i.test(text)) return { format: 'xls', sheets: htmlTable(text) };
 if (['csv', 'tsv', 'txt', 'xls', ''].includes(type)) return { format: 'csv', text };
 throw Error(statementErrors.unsupported);
}
