import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';

const {readStatementFile}=loadTS('lib/statement-files.ts');
const {parseStatementAmount,statementTable,statementErrors}=loadTS('lib/statement-rows.ts');
const {parseOFX}=loadTS('lib/ofx.ts');
const {parseQIF}=loadTS('lib/qif.ts');
const {isDateFormat,serialDate,numberText}=loadTS('lib/spreadsheet.ts');
const {mapCSV,guessTableMapping:tableMapping}=loadTS('lib/csv.ts');
const fixture=name=>new Uint8Array(fs.readFileSync('tests/fixtures/statements/'+name));
const read=name=>readStatementFile(name,fixture(name));
const base={name:0,date:1,amount:2,notes:-1,sourceId:-1,dateFormat:'dmy',decimal:','};
// The same mapping step the import screen runs, so every format ends in the CSV review rows.
const review=sheet=>mapCSV(sheet.rows,tableMapping(sheet.rows,base));

test('statement amounts read in either notation, with negative forms and no silent guesses',()=>{
 const cases={'-12.50':-12.5,'-12,50':-12.5,'+1,234.56':1234.56,'-1.234,56':-1234.56,'1 234,5':1234.5,'1 234,50':1234.5,"1'234.50":1234.5,'(45.10)':-45.1,'45.10-':-45.1,'2500':2500,'1,234':1234,'1.234.567':1234567,'0,125':0.125,'0.125':0.125,'USD 9.99':9.99,'.5':0.5};
 for(const [text,value] of Object.entries(cases))assert.equal(parseStatementAmount(text),value,text);
 for(const text of ['','abc','1,23,4','12.5.6,7','--5','1.2.3'])assert.ok(Number.isNaN(parseStatementAmount(text)),text);
});

test('OFX (SGML, Windows-1252) reads every account, FITIDs, payees, memos, decimal commas and skips zero rows',async()=>{
 const file=await read('statement-sgml.ofx');
 assert.equal(file.format,'ofx');
 assert.deepEqual(file.sheets.map(sheet=>sheet.label),['CHECKING · ••8901 · EUR','CREDITCARD · ••9876 · EUR']);
 const checking=review(file.sheets[0]);
 assert.deepEqual(checking,[
  {date:'2026-01-03',name:'Café de la Gare',amount:-12.5,notes:'Card 1234 & contactless',sourceId:'2026010301'},
  {date:'2026-01-31',name:'ACME PAYROLL',amount:2500,notes:'',sourceId:'2026013101'},
  {date:'2026-01-15',name:'Plumber',amount:-80,notes:'#1042',sourceId:'2026011501'},
 ]);
 assert.deepEqual(review(file.sheets[1]),[{date:'2026-01-20',name:'Online books',amount:-45.99,notes:'',sourceId:'CC-1'}]);
});

test('QFX (XML) keeps the posted calendar day, decodes entities, reads PAYEE names and drops repeated FITIDs',async()=>{
 const file=await read('statement.qfx');
 assert.equal(file.format,'ofx');
 const rows=review(file.sheets[0]);
 assert.deepEqual(rows.map(row=>[row.date,row.name,row.amount,row.notes]),[['2026-01-31','Interest <January>',3.21,''],['2026-01-05','City Rentals',-1250,'January rent'],['2026-01-06','City Rentals',-1250,'']]);
 // Two rows share FITID "DUP": IDs would make the database reject the file, so these rows dedupe by content instead.
 assert.ok(rows.every(row=>row.sourceId===undefined));
});

test('OFX rejects bad dates, bad amounts and statements without bank transactions',()=>{
 const wrap=body=>`OFXHEADER:100\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKACCTFROM><ACCTID>1</BANKACCTFROM><BANKTRANLIST>${body}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
 assert.throws(()=>parseOFX(wrap('<STMTTRN><DTPOSTED>20260230<TRNAMT>-1<FITID>a</STMTTRN>')),/date format/);
 assert.throws(()=>parseOFX(wrap('<STMTTRN><DTPOSTED>20260210<TRNAMT>twelve<FITID>a</STMTTRN>')),/amount format/);
 assert.throws(()=>parseOFX(wrap('')),{message:statementErrors.empty});
 assert.throws(()=>parseOFX('OFXHEADER:100\n<OFX><INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS></INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1></OFX>'),{message:statementErrors.empty});
});

test('QIF reads each account, apostrophe and four-digit years, U/T amounts, splits as one total, and skips category lists',async()=>{
 const file=await read('statement.qif');
 assert.equal(file.format,'qif');
 assert.deepEqual(file.sheets.map(sheet=>sheet.label),['Everyday checking','Travel card']);
 assert.deepEqual(review(file.sheets[0]),[
  {date:'2025-12-31',name:'Landlord',amount:-1234.56,notes:'December rent'},
  {date:'2026-01-05',name:'Employer Inc',amount:2500,notes:''},
  {date:'2026-01-13',name:'Supermarket',amount:-60,notes:''},
 ]);
 assert.deepEqual(review(file.sheets[1]),[{date:'2026-01-20',name:'Hotel deposit',amount:-89.9,notes:''}]);
});

test('QIF day-first dates and decimal commas; ambiguous dates follow the file, invalid ones are rejected',async()=>{
 const file=await read('statement-dmy.qif');
 assert.deepEqual(review(file.sheets[0]).map(row=>[row.date,row.name,row.amount]),[['2026-02-03','Bäckerei Müller',-1234.5],['2026-02-25','Gehalt',3000]]);
 // 13/02 can only be day first, so 03/02 in the same file is 3 February.
 assert.deepEqual(parseQIF('!Type:Bank\nD03/02/2026\nT-1\nPA\n^\nD13/02/2026\nT-2\nPB\n^\n')[0].rows.slice(1).map(row=>row[0]),['2026-02-03','2026-02-13']);
 // Without a telling date, slashes are month first as Quicken writes them.
 assert.deepEqual(parseQIF('!Type:Bank\nD03/02/2026\nT-1\nPA\n^\n')[0].rows[1][0],'2026-03-02');
 assert.throws(()=>parseQIF('!Type:Bank\nD02/30/2026\nT-1\nPA\n^\n'),/date format/);
 assert.throws(()=>parseQIF('!Type:Bank\nD02/03/2026\nTabc\nPA\n^\n'),/amount format/);
 assert.throws(()=>parseQIF('!Type:Invst\nD02/03/2026\nT-1\nPA\n^\n'),{message:statementErrors.empty});
});

test('Excel .xlsx: every sheet with rows, title lines skipped, real dates as ISO days, numbers without float tails',async()=>{
 const file=await read('statement.xlsx');
 assert.equal(file.format,'xlsx');
 assert.deepEqual(file.sheets.map(sheet=>sheet.label),['Checking','Card']);
 assert.deepEqual(file.sheets[0].rows[0],['Date','Description','Amount','Reference']);
 assert.deepEqual(review(file.sheets[0]),[
  {date:'2026-01-05',name:'Coffee & Co <Main St>',amount:-4.5,notes:'',sourceId:'TX-1'},
  {date:'2026-01-31',name:'Salary',amount:2500,notes:'',sourceId:'TX-2'},
  {date:'2026-02-01',name:'Rent',amount:-1234.56,notes:'',sourceId:'TX-3'},
 ]);
 const card=tableMapping(file.sheets[1].rows,base);
 assert.deepEqual([card.date,card.name,card.amount,card.dateFormat,card.decimal],[0,1,2,'iso','.']);
 assert.deepEqual(mapCSV(file.sheets[1].rows,card),[{date:'2025-12-31',name:'Bookshop',amount:-19.99,notes:''}]);
});

test('Excel 97-2003 .xls: shared strings across CONTINUE records, dates, RK and floating amounts',async()=>{
 const file=await read('statement.xls');
 assert.equal(file.format,'xls');
 assert.deepEqual(file.sheets.map(sheet=>sheet.label),['Statement']);
 const rows=review(file.sheets[0]);
 assert.equal(rows.length,300);
 assert.deepEqual(rows[0],{date:'2026-01-01',name:'Покупка номер 000 в магазине с длинным названием для проверки',amount:100,notes:'',sourceId:'id-0'});
 assert.deepEqual(rows[1],{date:'2026-01-02',name:'Покупка номер 001 в магазине с длинным названием для проверки',amount:-2.5,notes:'',sourceId:'id-1'});
 assert.deepEqual(rows[299],{date:'2026-01-20',name:'Покупка номер 299 в магазине с длинным названием для проверки',amount:-375,notes:'',sourceId:'id-299'});
 assert.equal(new Set(rows.map(row=>row.name)).size,300);
});

test('spreadsheet helpers: date formats, both date systems and display precision',()=>{
 for(const [id,code] of [[14],[22],[164,'dd/mm/yyyy'],[165,'[$-409]mmmm d, yyyy;@'],[166,'mm:ss']])assert.ok(isDateFormat(id,code),String(code??id));
 for(const [id,code] of [[0],[2],[4],[164,'#,##0.00'],[165,'"Day "0'],[166,'0.00\\d']])assert.ok(!isDateFormat(id,code),String(code??id));
 assert.equal(serialDate(46027),'2026-01-05');assert.equal(serialDate(44565,true),'2026-01-05');assert.equal(serialDate(46027.75),'2026-01-05');assert.equal(serialDate(0),null);
 assert.equal(numberText(-12.550000000000001),'-12.55');assert.equal(numberText(0.1+0.2),'0.3');assert.equal(numberText(2500),'2500');
});

test('unsupported, damaged and oversized files are refused with a translated message',async()=>{
 const en=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
 for(const message of Object.values(statementErrors))assert.ok(en[message],message);
 await assert.rejects(readStatementFile('scan.pdf',new TextEncoder().encode('%PDF-1.7\n\0\0binary')),{message:statementErrors.unsupported});
 await assert.rejects(readStatementFile('notes.md',new TextEncoder().encode('# Notes')),{message:statementErrors.unsupported});
 await assert.rejects(readStatementFile('letter.docx',fixture('statement.xlsx')),{message:statementErrors.unsupported});
 const xlsx=fixture('statement.xlsx');
 await assert.rejects(readStatementFile('cut.xlsx',xlsx.subarray(0,xlsx.length-200)),{message:statementErrors.unreadable});
 const xls=fixture('statement.xls');
 await assert.rejects(readStatementFile('cut.xls',xls.subarray(0,1024)),{message:statementErrors.unreadable});
 await assert.rejects(readStatementFile('big.csv',new Uint8Array(2_000_001)),{message:'File is too large.'});
 // A plain text .xls (many banks export tab-separated text under that name) is read as CSV; an HTML .xls as its table.
 assert.deepEqual(await readStatementFile('export.csv',new TextEncoder().encode('Date,Description,Amount\n2026-01-02,Shop,-5\n')),{format:'csv',text:'Date,Description,Amount\n2026-01-02,Shop,-5\n'});
 const html=await readStatementFile('export.xls',new TextEncoder().encode('<html><body><p>Bank</p><table><tr><th>Date</th><th>Description</th><th>Amount</th></tr><tr><td>2026-01-02</td><td>Tea &amp; cake</td><td>-5.40</td></tr></table></body></html>'));
 assert.equal(html.format,'xls');
 assert.deepEqual(review(html.sheets[0]),[{date:'2026-01-02',name:'Tea & cake',amount:-5.4,notes:''}]);
});

test('the import screen reads every format through the CSV review and loads the readers only when a file is chosen',()=>{
 const source=fs.readFileSync('components/data-tools.tsx','utf8');
 assert.match(source,/await import\('@\/lib\/statement-files'\)/);
 assert.doesNotMatch(source,/^import (?!type)[^\n]*statement-files/m);
 assert.match(source,/accept="[^"]*\.xlsx[^"]*\.xls[^"]*\.ofx[^"]*\.qfx[^"]*\.qif"/);
 assert.match(source,/rows=mapCSV\(parsed,mapping\)/);
 // No spreadsheet dependency: the readers use the platform's DecompressionStream.
 const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
 for(const name of ['xlsx','exceljs','read-excel-file'])assert.ok(!manifest.dependencies[name]&&!manifest.devDependencies[name],name);
});

test('structured statements keep the import limit and only offer IDs when each row has its own',()=>{
 const row=n=>({date:'2026-01-01',name:'Row '+n,amount:-1,notes:'',sourceId:'id-'+n});
 assert.equal(statementTable(Array.from({length:500},(_,n)=>row(n))).length,501);
 assert.throws(()=>statementTable(Array.from({length:501},(_,n)=>row(n))),{message:statementErrors.tooMany});
 assert.deepEqual(statementTable([row(1),{...row(2),sourceId:undefined}])[0],['Date','Description','Amount','Notes']);
 assert.deepEqual(statementTable([{...row(1),name:'x'.repeat(130)}])[1][1].length,120);
});
