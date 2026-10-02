import { decodeEntities, statementErrors, type StatementSheet } from './statement-rows';
import { isDateFormat, numberText, serialDate, sheetTable, workbookSheets } from './spreadsheet';
import { unzip } from './zip';

// A small reader for Excel workbooks (.xlsx): cell values only, no formulas or styles
// beyond telling dates from numbers. It needs no dependency, so it runs in any browser chunk.

const attributes = (text: string) => {
 const map: Record<string, string> = {};
 for (const match of text.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) map[match[1]] = decodeEntities(match[2]);
 return map;
};
// Text runs of a string item; phonetic guides (`rPh`) are not part of the value. `_x000D_` escapes control characters.
const textOf = (xml: string) => decodeEntities([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)].map(match => match[1] ?? '').join(''))
 .replace(/_x([0-9a-fA-F]{4})_/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
const columnIndex = (reference: string) => { let index = 0; for (const char of reference.replace(/\d+$/, '').toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64; return index - 1; };
const resolve = (target: string) => target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');

/** Every sheet of the workbook as an import table, in workbook order. */
export async function readXlsx(bytes: Uint8Array): Promise<StatementSheet[]> {
 const files = await unzip(bytes, name => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(name));
 const decoder = new TextDecoder();
 const read = (name: string) => { const file = files.get(name); return file ? decoder.decode(file) : ''; };
 const workbook = read('xl/workbook.xml');
 if (!workbook) throw Error(statementErrors.unreadable);
 const date1904 = /<workbookPr\b[^>]*\bdate1904\s*=\s*"(1|true)"/.test(workbook);
 const targets = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)].map(match => { const item = attributes(match[1]); return [item.Id, resolve(item.Target ?? '')]; }));
 const strings = [...read('xl/sharedStrings.xml').matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map(match => textOf(match[1] ?? ''));
 const styles = read('xl/styles.xml');
 const formats = new Map([...styles.matchAll(/<numFmt\b([^>]*)\/?>/g)].map(match => { const item = attributes(match[1]); return [Number(item.numFmtId), item.formatCode ?? '']; }));
 const cellStyles = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
 const dateStyles = [...cellStyles.matchAll(/<xf\b([^>]*)/g)].map(match => { const id = Number(attributes(match[1]).numFmtId ?? 0); return isDateFormat(id, formats.get(id)); });

 const sheets: StatementSheet[] = [];
 for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
  const item = attributes(match[1]);
  const xml = read(targets.get(item['r:id'] ?? '') ?? `xl/worksheets/sheet${sheets.length + 1}.xml`);
  if (!xml) continue;
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
   const cells: string[] = [];
   let next = 0;
   for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const info = attributes(cell[1]), body = cell[2] ?? '';
    const column = info.r ? columnIndex(info.r) : next;
    next = column + 1;
    const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let value = '';
    if (info.t === 's') value = strings[Number(raw)] ?? '';
    else if (info.t === 'inlineStr') value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
    else if (info.t === 'str' || info.t === 'e') value = decodeEntities(raw ?? '');
    else if (info.t === 'd') value = (raw ?? '').slice(0, 10);
    else if (info.t === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
    else if (raw !== undefined && raw !== '') {
     const number = Number(raw);
     value = dateStyles[Number(info.s ?? 0)] ? serialDate(number, date1904) ?? raw : Number.isFinite(number) ? numberText(number) : raw;
    }
    if (column >= 0 && column < 1000) cells[column] = value;
   }
   rows.push(Array.from(cells, cell => cell ?? ''));
  }
  sheets.push(sheetTable(item.name ?? '', rows));
 }
 return workbookSheets(sheets);
}
