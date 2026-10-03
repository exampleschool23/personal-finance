import { statementErrors, type StatementSheet } from './statement-rows';
import { isDateFormat, numberText, serialDate, sheetTable, workbookSheets } from './spreadsheet';

// A small reader for legacy Excel 97–2003 workbooks (.xls, BIFF8 inside an OLE
// compound file): cell values only, enough for bank statement exports.

/** Whether bytes start an OLE compound file, the container of `.xls` workbooks. */
export const isCompoundFile = (bytes: Uint8Array) => bytes.length >= 512 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);

const fail = () => { throw Error(statementErrors.unreadable); };
const END = 0xfffffffe;

/** The named stream of a compound file, or null when it has none. */
function compoundStream(bytes: Uint8Array, wanted: readonly string[]) {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 const sectorSize = 1 << view.getUint16(30, true), miniSize = 1 << view.getUint16(32, true);
 if (sectorSize !== 512 && sectorSize !== 4096) fail();
 const sector = (id: number) => { const start = (id + 1) * sectorSize; if (start + sectorSize > bytes.length) fail(); return start; };
 // The allocation table's own sectors: 109 in the header, the rest in a chain of DIFAT sectors.
 const fatSectors: number[] = [];
 for (let index = 0; index < 109; index++) fatSectors.push(view.getUint32(76 + index * 4, true));
 for (let id = view.getUint32(68, true), guard = 0; id < END && guard < 10_000; guard++) {
  const start = sector(id), per = sectorSize / 4 - 1;
  for (let index = 0; index < per; index++) fatSectors.push(view.getUint32(start + index * 4, true));
  id = view.getUint32(start + per * 4, true);
 }
 const fat: number[] = [];
 for (const id of fatSectors.slice(0, view.getUint32(44, true))) { const start = sector(id); for (let at = 0; at < sectorSize; at += 4) fat.push(view.getUint32(start + at, true)); }
 const chain = (first: number, table: number[]) => { const ids: number[] = []; for (let id = first; id < END; id = table[id] ?? fail()) { if (ids.length > table.length) fail(); ids.push(id); } return ids; };
 const readChain = (first: number) => { const ids = chain(first, fat); const out = new Uint8Array(ids.length * sectorSize); ids.forEach((id, index) => out.set(bytes.subarray(sector(id), sector(id) + sectorSize), index * sectorSize)); return out; };

 const directory = readChain(view.getUint32(48, true));
 const entries = Array.from({ length: directory.length / 128 }, (_, index) => {
  const entry = new DataView(directory.buffer, index * 128, 128);
  const nameLength = Math.min(64, entry.getUint16(64, true));
  const name = String.fromCharCode(...Array.from({ length: Math.max(0, nameLength / 2 - 1) }, (_, char) => entry.getUint16(char * 2, true)));
  return { name, type: entry.getUint8(66), start: entry.getUint32(116, true), size: entry.getUint32(120, true) };
 });
 const entry = entries.find(item => item.type === 2 && wanted.includes(item.name));
 if (!entry) return null;
 if (entry.size >= view.getUint32(56, true)) return readChain(entry.start).subarray(0, entry.size);
 // Small streams live in the mini stream, which the root entry holds.
 const root = entries.find(item => item.type === 5) ?? fail();
 const ministream = readChain(root.start);
 const miniFat: number[] = [];
 const miniFatBytes = view.getUint32(64, true) ? readChain(view.getUint32(60, true)) : new Uint8Array();
 for (let at = 0; at + 4 <= miniFatBytes.length; at += 4) miniFat.push(new DataView(miniFatBytes.buffer).getUint32(at, true));
 const ids = chain(entry.start, miniFat);
 const out = new Uint8Array(ids.length * miniSize);
 ids.forEach((id, index) => { if ((id + 1) * miniSize > ministream.length) fail(); out.set(ministream.subarray(id * miniSize, (id + 1) * miniSize), index * miniSize); });
 return out.subarray(0, entry.size);
}

type BiffRecord = { type: number; data: Uint8Array; offset: number };
function records(stream: Uint8Array) {
 const list: BiffRecord[] = [];
 for (let at = 0; at + 4 <= stream.length;) {
  const type = stream[at] | stream[at + 1] << 8, length = stream[at + 2] | stream[at + 3] << 8;
  if (at + 4 + length > stream.length) fail();
  list.push({ type, data: stream.subarray(at + 4, at + 4 + length), offset: at });
  at += 4 + length;
 }
 return list;
}

/** Reads strings that may run across CONTINUE records; each continuation restarts the 8- or 16-bit character flag. */
class Segments {
 private part = 0; private at = 0;
 constructor(private parts: Uint8Array[]) {}
 private ensure() { while (this.part < this.parts.length && this.at >= this.parts[this.part].length) { this.part++; this.at = 0; } if (this.part >= this.parts.length) fail(); }
 byte() { this.ensure(); return this.parts[this.part][this.at++]; }
 u16() { return this.byte() | this.byte() << 8; }
 u32() { return (this.u16() | this.u16() << 16) >>> 0; }
 skip(count: number) { for (let index = 0; index < count; index++) this.byte(); }
 string(length: number, flags: number) {
  let wide = flags & 1, text = '';
  for (let index = 0; index < length; index++) {
   if (this.at >= this.parts[this.part].length) { this.part++; this.at = 0; if (this.part >= this.parts.length) fail(); wide = this.byte() & 1; }
   text += String.fromCharCode(wide ? this.u16() : this.byte());
  }
  return text;
 }
 /** An XLUnicodeRichExtendedString, as the shared string table stores them; formatting runs and phonetic data are skipped. */
 richString(lengthBytes: 1 | 2 = 2) {
  const length = lengthBytes === 1 ? this.byte() : this.u16(), flags = this.byte();
  const runs = flags & 8 ? this.u16() : 0, extended = flags & 4 ? this.u32() : 0;
  const text = this.string(length, flags);
  this.skip(runs * 4 + extended);
  return text;
 }
}
/** An XLUnicodeString with a one- or two-byte character count, as cell, format and sheet names store them. */
const unicodeString = (data: Uint8Array, at: number, lengthBytes: 1 | 2) => {
 const reader = new Segments([data.subarray(at)]);
 return reader.richString(lengthBytes);
};
// RK numbers pack an integer or the top 30 bits of a double, optionally divided by 100.
const rkNumber = (view: DataView, at: number) => {
 const rk = view.getInt32(at, true);
 let value: number;
 if (rk & 2) value = rk >> 2;
 else { const buffer = new DataView(new ArrayBuffer(8)); buffer.setUint32(4, rk & ~3, true); value = buffer.getFloat64(0, true); }
 return rk & 1 ? value / 100 : value;
};

/** Every worksheet of the workbook as an import table, in workbook order. */
export function readXls(bytes: Uint8Array): StatementSheet[] {
 if (!isCompoundFile(bytes)) fail();
 const stream = compoundStream(bytes, ['Workbook', 'Book']) ?? fail();
 const list = records(stream);
 if (list[0]?.type !== 0x0809 || (list[0].data[0] | list[0].data[1] << 8) !== 0x0600) fail();
 let date1904 = false;
 const formats = new Map<number, string>(), xfFormats: number[] = [], strings: string[] = [];
 const sheets: Array<{ name: string; offset: number }> = [];
 for (let index = 1; index < list.length && list[index].type !== 0x000a; index++) {
  const { type, data } = list[index];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (type === 0x002f) fail(); // FILEPASS: the workbook is encrypted.
  else if (type === 0x0022) date1904 = view.getUint16(0, true) === 1;
  else if (type === 0x041e) formats.set(view.getUint16(0, true), unicodeString(data, 2, 2));
  else if (type === 0x00e0) xfFormats.push(view.getUint16(2, true));
  else if (type === 0x0085 && data[5] === 0) sheets.push({ offset: view.getUint32(0, true), name: unicodeString(data, 6, 1) });
  else if (type === 0x00fc) {
   const parts = [data.subarray(8)];
   for (let next = index + 1; list[next]?.type === 0x003c; next++) parts.push(list[next].data);
   const reader = new Segments(parts), unique = view.getUint32(4, true);
   for (let item = 0; item < unique; item++) strings.push(reader.richString());
  }
 }
 const dateStyle = (xf: number) => { const id = xfFormats[xf] ?? 0; return isDateFormat(id, formats.get(id)); };
 const numberCell = (value: number, xf: number) => dateStyle(xf) ? serialDate(value, date1904) ?? numberText(value) : numberText(value);

 return workbookSheets(sheets.map(sheet => {
  const rows: string[][] = [];
  const set = (row: number, column: number, value: string) => { if (row < 70_000 && column < 1000) (rows[row] ??= [])[column] = value; };
  const start = list.findIndex(item => item.offset === sheet.offset);
  if (start < 0) fail();
  let pendingFormula: { row: number; column: number } | null = null;
  for (let index = start + 1; index < list.length && list[index].type !== 0x000a; index++) {
   const { type, data } = list[index];
   const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
   const row = data.length >= 4 ? view.getUint16(0, true) : 0, column = data.length >= 4 ? view.getUint16(2, true) : 0;
   if (type === 0x00fd) set(row, column, strings[view.getUint32(6, true)] ?? '');
   else if (type === 0x0204) set(row, column, unicodeString(data, 6, 2));
   else if (type === 0x0203) set(row, column, numberCell(view.getFloat64(6, true), view.getUint16(4, true)));
   else if (type === 0x027e) set(row, column, numberCell(rkNumber(view, 6), view.getUint16(4, true)));
   else if (type === 0x00bd) for (let at = 4, col = column; at + 6 <= data.length - 2; at += 6, col++) set(row, col, numberCell(rkNumber(view, at + 2), view.getUint16(at, true)));
   else if (type === 0x0205) set(row, column, data[7] ? '' : data[6] ? 'TRUE' : 'FALSE');
   else if (type === 0x0006) {
    // A formula keeps its last result: a number, or a string in the STRING record that follows.
    if (view.getUint16(12, true) !== 0xffff) set(row, column, numberCell(view.getFloat64(6, true), view.getUint16(4, true)));
    else if (data[6] === 0) pendingFormula = { row, column };
    else if (data[6] === 1) set(row, column, data[8] ? 'TRUE' : 'FALSE');
   } else if (type === 0x0207 && pendingFormula) { set(pendingFormula.row, pendingFormula.column, unicodeString(data, 0, 2)); pendingFormula = null; }
  }
  return sheetTable(sheet.name, Array.from(rows, row => Array.from(row ?? [], cell => cell ?? '')));
 }));
}
