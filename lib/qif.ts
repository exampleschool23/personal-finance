import { isoDate, parseStatementAmount, statementErrors, statementTable, type StatementSheet, type StatementTransaction } from './statement-rows';

/** Whether text is a Quicken Interchange Format file. */
export const isQIF = (text: string) => /^﻿?\s*!(Type|Account|Option|Clear)\b/i.test(text);

// Sections that hold bank-style transactions; investment, category and memorized lists are skipped.
const transactionTypes = /^(bank|cash|ccard|oth a|oth l|invoice)$/i;

type DateParts = { first: number; second: number; year: number };
/** `12/31/2025`, `12/31'25`, ` 1/ 5'26`, `31.12.2025`, `2025-12-31`; which of day and month comes first is settled for the whole file. */
function dateParts(raw: string): DateParts | string {
 const text = raw.replace(/\s+/g, '');
 const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
 if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? 'invalid';
 const match = /^(\d{1,2})[/.-](\d{1,2})([/.\-'])(\d{2}|\d{4})$/.exec(text);
 if (!match) return 'invalid';
 const short = Number(match[4]);
 // Quicken writes years from 2000 with an apostrophe; other two-digit years read as the nearest century.
 const year = match[4].length === 4 ? short : match[3] === "'" ? 2000 + short : short >= 70 ? 1900 + short : 2000 + short;
 return { first: Number(match[1]), second: Number(match[2]), year };
}

/** Each account in the file with its transactions. Split lines are summarised by the transaction total. */
export function parseQIF(text: string): StatementSheet[] {
 if (!isQIF(text)) throw Error(statementErrors.unreadable);
 const accounts = new Map<string, Array<{ date: DateParts | string; name: string; amount: number; notes: string }>>();
 let account = 'QIF', section: 'transactions' | 'account' | 'skip' = 'skip', fields: Record<string, string> = {};
 const finish = () => {
  if (section === 'account' && fields.N) account = fields.N;
  if (section === 'transactions' && Object.keys(fields).length) {
   if (!fields.D) throw Error('Check the date format.');
   const amount = parseStatementAmount(fields.T ?? fields.U ?? '');
   if (!Number.isFinite(amount)) throw Error('Check the amount format.');
   const name = fields.P || fields.M || fields.L || (fields.N ? '#' + fields.N : '');
   const rows = accounts.get(account) ?? [];
   rows.push({ date: dateParts(fields.D), name, amount, notes: fields.P && fields.M ? fields.M : '' });
   accounts.set(account, rows);
  }
  fields = {};
 };
 for (const line of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
  if (!line.trim()) continue;
  if (line[0] === '!') {
   finish();
   const header = line.slice(1).trim();
   const type = /^Type:(.*)$/i.exec(header)?.[1].trim();
   if (/^Account$/i.test(header)) section = 'account';
   else if (type !== undefined) section = transactionTypes.test(type) ? 'transactions' : 'skip';
   continue;
  }
  if (line[0] === '^') { finish(); if (section === 'account') section = 'skip'; continue; }
  const code = line[0].toUpperCase(), value = line.slice(1).trim();
  // Split lines (S, E, $) repeat; the first value of each other field is the transaction's own.
  if (!(code in fields) && !'SE$'.includes(code)) fields[code] = value;
 }
 finish();
 const all = [...accounts.values()].flat();
 // A file is written in one date order: a first part above 12 means day first, a second part above 12 means month first.
 const parts = all.map(row => row.date).filter((date): date is DateParts => typeof date === 'object');
 const dayFirst = parts.some(date => date.first > 12) || (!parts.some(date => date.second > 12) && /^\s*D\s*\d{1,2}\.\d/m.test(text));
 const sheets: StatementSheet[] = [];
 for (const [label, rows] of accounts) {
  const transactions: StatementTransaction[] = rows.map(row => {
   const date = typeof row.date === 'string' ? (row.date === 'invalid' ? null : row.date) : dayFirst ? isoDate(row.date.year, row.date.second, row.date.first) : isoDate(row.date.year, row.date.first, row.date.second);
   if (!date) throw Error('Check the date format.');
   return { date, name: row.name, amount: row.amount, notes: row.notes };
  });
  const table = statementTable(transactions);
  if (table.length > 1) sheets.push({ label, rows: table });
 }
 if (!sheets.length) throw Error(statementErrors.empty);
 return sheets;
}
