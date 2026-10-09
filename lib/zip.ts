import { statementErrors } from './statement-rows';

/** Whether bytes start a ZIP archive, as `.xlsx` workbooks do. */
export const isZip = (bytes: Uint8Array) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

// Stop decompression bombs: a statement workbook is far smaller than this, per entry and across the wanted entries.
const maxEntrySize = 40_000_000;
const maxTotalSize = 80_000_000;

async function inflate(data: Uint8Array, limit: number) {
 const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 const reader = stream.getReader();
 const parts: Uint8Array[] = [];
 let size = 0;
 for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  size += value.byteLength;
  if (size > limit) { await reader.cancel(); throw Error(statementErrors.unreadable); }
  parts.push(value);
 }
 const out = new Uint8Array(size);
 let offset = 0;
 for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
 return out;
}

/** The named entries of a ZIP archive, decompressed with the platform's own `DecompressionStream`. Missing names are left out. */
export async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean) {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 let end = -1;
 for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
 if (end < 0) throw Error(statementErrors.unreadable);
 const count = view.getUint16(end + 10, true);
 let at = view.getUint32(end + 16, true);
 const files = new Map<string, Uint8Array>();
 let total = 0;
 const decoder = new TextDecoder();
 for (let index = 0; index < count; index++) {
  if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw Error(statementErrors.unreadable);
  const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), compressed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
  const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
  const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
  at += 46 + nameLength + extraLength + commentLength;
  if (!wanted(name)) continue;
  const limit = Math.min(maxEntrySize, maxTotalSize - total);
  if (flags & 1 || size > limit || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw Error(statementErrors.unreadable);
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + compressed);
  if (data.length !== compressed) throw Error(statementErrors.unreadable);
  const file = method === 0 && data.length <= limit ? data : method === 8 ? await inflate(data, limit).catch(() => { throw Error(statementErrors.unreadable); }) : null;
  if (!file) throw Error(statementErrors.unreadable);
  total += file.byteLength;
  files.set(name, file);
 }
 return files;
}
