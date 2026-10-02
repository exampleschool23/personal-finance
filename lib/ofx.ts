import { decodeEntities, isoDate, parseStatementAmount, statementErrors, statementTable, type StatementSheet, type StatementTransaction } from './statement-rows';

/** Whether text is an OFX or QFX statement, in either the SGML (1.x) or the XML (2.x) form. */
export const isOFX = (text: string) => /^\s*(OFXHEADER\s*:|<\?xml[^>]*>\s*<\?OFX\b|<OFX>)/i.test(text) || /<OFX>[\s\S]*<\/OFX>/i.test(text.slice(0, 2_000_000));

/** OFX 1.x files declare a Windows code page in their header; XML files and the rest are UTF-8. */
export function ofxEncoding(head: string) {
 const charset = /^\s*CHARSET\s*:\s*(\S+)/im.exec(head)?.[1];
 return charset === '1252' ? 'windows-1252' : charset && /^8859-?1$/.test(charset) ? 'iso-8859-1' : 'utf-8';
}

// A leaf element's value. SGML leaves have no closing tag, so the value runs to the next tag.
const leaf = (block: string, tag: string) => {
 const match = new RegExp('<' + tag + '>([^<]*)', 'i').exec(block);
 return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
};
const blocks = (text: string, tag: string) => text.split(new RegExp('<' + tag + '>', 'i')).slice(1).map(part => part.split(new RegExp('</' + tag + '>', 'i'))[0]);

/** `YYYYMMDD[HHMMSS[.XXX]][[offset:TZ]]`: the calendar day as written, without converting time zones. */
function ofxDate(value: string) {
 const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
 const date = match && isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
 if (!date) throw Error('Check the date format.');
 return date;
}

/** Each bank or credit card statement in the file: its account and its transactions. Investment statements are not read. */
export function parseOFX(text: string): StatementSheet[] {
 if (!isOFX(text)) throw Error(statementErrors.unreadable);
 const body = text.slice(text.search(/<OFX>/i));
 const statements = [...blocks(body, 'STMTRS'), ...blocks(body, 'CCSTMTRS')];
 const sheets: StatementSheet[] = [];
 for (const statement of statements) {
  const account = leaf(statement, 'ACCTID'), type = leaf(statement, 'ACCTTYPE') || (/<CCACCTFROM>/i.test(statement) ? 'CREDITCARD' : ''), currency = leaf(statement, 'CURDEF');
  const transactions: StatementTransaction[] = blocks(statement, 'STMTTRN').map(item => {
   const amount = parseStatementAmount(leaf(item, 'TRNAMT'));
   if (!Number.isFinite(amount)) throw Error('Check the amount format.');
   const memo = leaf(item, 'MEMO'), payee = leaf(item, 'NAME') || memo || leaf(item, 'TRNTYPE');
   const check = leaf(item, 'CHECKNUM');
   return { date: ofxDate(leaf(item, 'DTPOSTED') || leaf(item, 'DTUSER')), name: payee, amount, notes: [memo !== payee ? memo : '', check ? '#' + check : ''].filter(Boolean).join(' · '), sourceId: leaf(item, 'FITID') || undefined };
  });
  const masked = account.length > 4 ? '••' + account.slice(-4) : account;
  sheets.push({ label: [type, masked, currency].filter(Boolean).join(' · ') || 'OFX', rows: statementTable(transactions) });
 }
 const withRows = sheets.filter(sheet => sheet.rows.length > 1);
 if (!withRows.length) throw Error(statementErrors.empty);
 return withRows;
}
