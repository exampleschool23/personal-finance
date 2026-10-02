// Shared pieces of the statement file readers (OFX, QIF, Excel). Each reader
// turns its file into the same header + rows table the CSV import maps, so every
// format goes through one review, dedupe and undo flow.

export const statementErrors = {
 unsupported: 'Choose a CSV, Excel, OFX, QFX or QIF file.',
 unreadable: 'Could not read this file. It may be damaged or protected with a password.',
 empty: 'This file has no transactions to import.',
 tooMany: 'Import limit exceeded. Split this file into smaller files.',
} as const;

/** The most transactions one import takes, as `app/api/import` accepts. */
export const maxStatementRows = 500;

/** One transaction read from a structured statement (OFX or QIF). */
export type StatementTransaction = { date: string; name: string; amount: number; notes: string; sourceId?: string };
/** One account in a file, or one sheet of a workbook: a header row and its data rows. */
export type StatementSheet = { label: string; rows: string[][] };

/** An ISO date from its parts, or null when the day does not exist. */
export function isoDate(year: number, month: number, day: number) {
 if (!Number.isInteger(year) || year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
 const date = new Date(Date.UTC(year, month - 1, day));
 if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
 return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A statement amount in either notation: `-1,234.56`, `-1.234,56`, `1 234,5`, `(12.50)` or `12.50-`. NaN when unreadable. */
export function parseStatementAmount(raw: string) {
 let text = raw.replace(/[\s\u00a0\u202f']/g, '');
 let negative = false;
 if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
 if (/^[^-+]*-$/.test(text)) { negative = true; text = text.slice(0, -1); }
 text = text.replace(/^[^\d+\-.,]+|[^\d.,]+$/g, '');
 if (/^[+-]/.test(text)) { negative = negative !== (text[0] === '-'); text = text.slice(1); }
 if (!/^[\d.,]*\d[\d.,]*$/.test(text)) return NaN;
 const separators = text.match(/[.,]/g) ?? [];
 const last = separators[separators.length - 1];
 // Mixed separators: the last one marks decimals. A lone separator does too, unless it
 // sets off exactly three digits after a non-zero whole part (`1,234`), which groups thousands.
 const decimal = !last ? null : separators.some(separator => separator !== last) ? last : separators.length === 1 && !/^[1-9]\d{0,2}[.,]\d{3}$/.test(text) ? last : null;
 const at = decimal ? text.lastIndexOf(decimal) : text.length;
 const whole = text.slice(0, at) || '0', fraction = text.slice(at + 1);
 if (decimal && (whole.includes(decimal) || !/^\d+$/.test(fraction))) return NaN;
 const groups = whole.split(/[.,]/);
 if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(group => !/^\d{3}$/.test(group)))) return NaN;
 if (!groups.every(group => /^\d+$/.test(group))) return NaN;
 const value = Number(groups.join('') + (fraction ? '.' + fraction : ''));
 return negative ? -value : value;
}

/** The header + rows table of a statement. IDs are included only when every row has a distinct one, so dedupe stays reliable. */
export function statementTable(transactions: readonly StatementTransaction[]): string[][] {
 const kept = transactions.filter(row => Number.isFinite(row.amount) && row.amount !== 0);
 if (kept.length > maxStatementRows) throw Error(statementErrors.tooMany);
 const ids = kept.map(row => row.sourceId ?? '');
 const withIds = kept.length > 0 && ids.every(id => id && id.length <= 200) && new Set(ids).size === ids.length;
 return [
  ['Date', 'Description', 'Amount', 'Notes', ...(withIds ? ['ID'] : [])],
  ...kept.map(row => [row.date, row.name.trim().slice(0, 120) || '—', String(row.amount), row.notes.slice(0, 2000), ...(withIds ? [row.sourceId!] : [])]),
 ];
}

/** Decodes XML and SGML character references. */
export function decodeEntities(text: string) {
 return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code: string) => {
  const lower = code.toLowerCase();
  if (lower[0] === '#') { const value = lower[1] === 'x' ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10); return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : ''; }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' } as Record<string, string>)[lower] ?? match;
 });
}
