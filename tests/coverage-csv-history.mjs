import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {parseCSV,guessColumnMapping,guessTableMapping,guessDelimiter,mapCSV,exportCSV,FINANCE_RECORD_CSV_COLUMNS}=loadTS('lib/csv.ts');
const history=loadTS('lib/investment-history.ts');
const mapping={name:1,date:0,amount:2,notes:3,dateFormat:'iso',decimal:'.'};

test('parseCSV follows RFC 4180 quoting and skips blank rows',()=>{
 assert.deepEqual(parseCSV('﻿a,b\r\n"x, y","say ""hi"""\n\n , \n"multi\nline",2'),[['a','b'],['x, y','say "hi"'],['multi\nline','2']]);
 assert.deepEqual(parseCSV('a;b\n1;2',';'),[['a','b'],['1','2']]);
 assert.deepEqual(parseCSV('a\tb\r\n1\t2\r\n','\t'),[['a','b'],['1','2']]);
 // A quote inside an unquoted field is kept as text; an empty quoted field is an empty value.
 assert.deepEqual(parseCSV('a,b\n5" pipe,""'),[['a','b'],['5" pipe','']]);
 assert.deepEqual(parseCSV(''),[]);
});

test('parseCSV refuses broken quoting, oversized files and ragged rows',()=>{
 assert.throws(()=>parseCSV('"a"b,c'),/Invalid CSV quoting/);
 assert.throws(()=>parseCSV('"open,c'),/Invalid CSV quoting/);
 assert.throws(()=>parseCSV('x'.repeat(2_000_001)),/File is too large/);
 assert.equal(parseCSV('h\n'+'1\n'.repeat(500)).length,501);
 assert.throws(()=>parseCSV('h\n'+'1\n'.repeat(501)),/Import limit exceeded/);
 assert.throws(()=>parseCSV('a,b\n1'),/same number of columns/);
});

test('header guessing maps common bank and language names and leaves unknown ones',()=>{
 assert.deepEqual(guessColumnMapping([' Posting Date ','Payee','Сумма','Memo','Reference'],{...mapping,sourceId:undefined}),{name:1,date:0,amount:2,notes:3,sourceId:4,dateFormat:'iso',decimal:'.'});
 assert.deepEqual(guessColumnMapping(['foo','bar'],mapping),mapping);
 assert.deepEqual(guessColumnMapping(['Sana','Tavsif','Summa','Izoh','Raqam'],mapping),{...mapping,sourceId:4});
});

test('table mapping detects ISO dates and dot decimals and never reuses old notes or IDs',()=>{
 const current={...mapping,notes:5,sourceId:6,dateFormat:'dmy',decimal:','};
 assert.deepEqual(guessTableMapping([['Date','Description','Amount'],['2026-09-01','Shop','-12.5'],['2026-09-02','Pay','100']],current),{name:1,date:0,amount:2,notes:-1,sourceId:-1,dateFormat:'iso',decimal:'.'});
 // Non-ISO dates or grouped amounts keep the chosen formats.
 assert.deepEqual(guessTableMapping([['Date','Description','Amount'],['01.09.2026','Shop','1,200.50']],current),{...current,notes:-1,sourceId:-1});
 // No data rows, or no header at all, keep the current formats too.
 assert.deepEqual(guessTableMapping([['Date','Description','Amount']],current),{...current,notes:-1,sourceId:-1});
 assert.deepEqual(guessTableMapping([],current),{...current,notes:-1,sourceId:-1});
 assert.deepEqual(guessTableMapping([['Date','Description','Amount'],['2026-09-01','Shop']],current),{...current,dateFormat:'iso',notes:-1,sourceId:-1});
});

test('delimiter guessing picks the most frequent separator in the header',()=>{
 assert.equal(guessDelimiter('a,b,c\n1;2;3;4;5'),',');
 assert.equal(guessDelimiter('﻿a;b;c\r\n1,2'),';');
 assert.equal(guessDelimiter('a\tb\tc'),'\t');
 assert.equal(guessDelimiter('single'),',');
 assert.equal(guessDelimiter(''),',');
});

test('mapCSV turns statement rows into import rows in every date and decimal style',()=>{
 assert.deepEqual(mapCSV([['date','name','amount','notes'],['2026-09-01',' Shop ','-1,234.50','paid'],['2026-09-02','Salary','+100','']],mapping),[{date:'2026-09-01',name:'Shop',amount:-1234.5,notes:'paid'},{date:'2026-09-02',name:'Salary',amount:100,notes:''}]);
 assert.deepEqual(mapCSV([['h'],['1/9/2026','Cafe','1 234,5']].map(row=>row.length===1?['d','n','a']:row),{...mapping,notes:-1,dateFormat:'dmy',decimal:','}),[{date:'2026-09-01',name:'Cafe',amount:1234.5,notes:''}]);
 assert.deepEqual(mapCSV([['d','n','a'],['9-30-2026','Rent','-1.200']],{...mapping,notes:-1,dateFormat:'mdy',decimal:','}),[{date:'2026-09-30',name:'Rent',amount:-1200,notes:''}]);
 // Source identifiers travel only when mapped.
 assert.deepEqual(mapCSV([['d','n','a','x','id'],['2026-09-01','Shop','5','','  T-1 ']],{...mapping,notes:-1,sourceId:4}),[{date:'2026-09-01',name:'Shop',amount:5,notes:'',sourceId:'T-1'}]);
 assert.deepEqual(mapCSV([['d','n','a','x','id'],['2026-09-01','Shop','5','','T-1']],{...mapping,sourceId:-1}),[{date:'2026-09-01',name:'Shop',amount:5,notes:''}]);
 assert.deepEqual(mapCSV([],mapping),[]);
});

test('mapCSV refuses records exports and rows with unreadable fields',()=>{
 assert.throws(()=>mapCSV([[...FINANCE_RECORD_CSV_COLUMNS].map(column=>column.toUpperCase())],mapping),/records export, not a bank statement/);
 const row=['2026-09-01','Shop','5','note'];
 const bad=(change,options=mapping)=>()=>mapCSV([['d','n','a','x'],Object.assign([...row],change)],options);
 assert.throws(bad({0:'2026-02-30'}),/Check the date format/);
 assert.throws(bad({0:'01/09'}),/Check the date format/);
 assert.throws(bad({0:'01/09'},{...mapping,dateFormat:'dmy'}),/Check the date format/);
 assert.throws(bad({0:'31/02/2026'},{...mapping,dateFormat:'dmy'}),/Check the date format/);
 assert.throws(bad({2:'1,23.4'}),/Check the amount format/);
 assert.throws(bad({2:'12.5'},{...mapping,decimal:','}),/Check the amount format/);
 assert.throws(bad({2:'abc'}),/Check the amount format/);
 assert.throws(bad({2:'0'}),/Check the import fields/);
 assert.throws(bad({2:'2000000000000000'}),/Check the import fields/);
 assert.throws(bad({1:'  '}),/Check the import fields/);
 assert.throws(bad({1:'x'.repeat(121)}),/Check the import fields/);
 assert.throws(bad({3:'n'.repeat(2001)}),/Check the import fields/);
 assert.throws(()=>mapCSV([['d','n','a'],['2026-09-01','Shop','5']],{...mapping,notes:-1,sourceId:3}),/source transaction identifiers/);
 assert.throws(()=>mapCSV([['d','n','a','id'],['2026-09-01','Shop','5','i'.repeat(201)]],{...mapping,notes:-1,sourceId:3}),/source transaction identifiers/);
 assert.throws(()=>mapCSV([['d','n','a'],['','Shop','5']],{...mapping,notes:-1}),/Check the date format/);
 assert.throws(()=>mapCSV([['d','n','a'],['2026-09-01','Shop']],{...mapping,notes:-1}),/Check the amount format/);
});

test('exportCSV quotes every cell and defuses spreadsheet formulas in text only',()=>{
 const csv=exportCSV([{name:'=SUM(A1)',amount:-5,notes:'say "hi"',kind:null},{name:' @cmd',amount:'-5',notes:'+1',kind:undefined}],['name','amount','notes','kind']);
 assert.equal(csv,'"name","amount","notes","kind"\r\n"\'=SUM(A1)","-5","say ""hi""",""\r\n"\' @cmd","\'-5","\'+1",""');
 assert.equal(exportCSV([],['a']),'"a"');
});

test('history cash movement follows the direction of money for each kind',()=>{
 const {historyCashDelta}=history;
 assert.equal(historyCashDelta('Stock','valuation',100),0);
 for(const kind of ['Debt','Loan','Mortgage']){assert.equal(historyCashDelta(kind,'contribution',50),50);assert.equal(historyCashDelta(kind,'withdrawal',50),-50);}
 assert.equal(historyCashDelta('Money lent','contribution',50),-50);
 assert.equal(historyCashDelta('Money lent','withdrawal',50),50);
 assert.equal(historyCashDelta('Property','income',20),20);
 assert.equal(historyCashDelta('Property','expense',20),-20);
});

test('history update types and lending kinds match each holding',()=>{
 const {historyUpdateTypes,isLendingKind,trackedKinds}=history;
 assert.deepEqual(historyUpdateTypes('Mortgage'),['contribution']);
 for(const kind of ['Loan','Debt','Money lent'])assert.deepEqual(historyUpdateTypes(kind),['contribution','withdrawal']);
 assert.deepEqual(historyUpdateTypes('Cash'),['valuation']);
 for(const kind of ['Deposit','Treasury bill','Stock','Crypto'])assert.deepEqual(historyUpdateTypes(kind),['valuation','income','expense']);
 for(const kind of ['Property','Business','Valuables'])assert.deepEqual(historyUpdateTypes(kind),['valuation','contribution','withdrawal','income','expense']);
 assert.deepEqual(historyUpdateTypes('Salary'),[]);
 assert.equal(isLendingKind('Mortgage'),true);assert.equal(isLendingKind('Stock'),false);
 assert.equal(trackedKinds.length,12);assert.ok(trackedKinds.includes('Treasury bill'));
});

test('history event labels name each event in the words of its holding',()=>{
 const label=history.historyEventLabel;
 const cases=[
  ['Mortgage','valuation','Balance update'],['Loan','valuation','Balance correction'],
  ['Money lent','contribution','Lend more'],['Debt','contribution','Add to debt'],['Loan','contribution','Additional borrowing'],
  ['Money lent','withdrawal','Repayment received'],['Loan','withdrawal','Repayment made'],
  ['Money lent','income','Interest received'],['Mortgage','mortgage_payment','Mortgage payment'],
  ['Cash','valuation','Balance update'],['Deposit','valuation','Balance update'],['Treasury bill','valuation','Balance update'],['Stock','valuation','Value update'],
  ['Deposit','income','Interest received'],['Treasury bill','income','Interest received'],['Stock','income','Dividends / income'],['Property','income','Rent income'],['Business','income','Income received'],
  ['Deposit','contribution','Top-up'],['Cash','contribution','Top-up'],['Stock','contribution','Buy'],['Crypto','contribution','Buy'],['Treasury bill','contribution','Buy'],['Property','contribution','Money invested'],
  ['Treasury bill','withdrawal','Redeem'],['Deposit','withdrawal','Withdraw'],['Cash','withdrawal','Withdraw'],['Stock','withdrawal','Sell / convert'],['Crypto','withdrawal','Sell / convert'],['Valuables','withdrawal','Sale / withdrawal'],
  ['Property','expense','Expense paid'],['Stock','baseline','Starting snapshot'],
 ];
 for(const [kind,type,expected] of cases)assert.equal(label(kind,type),expected,`${kind} ${type}`);
});

test('history series sorts events and accumulates balances, contributions and payments per day',()=>{
 const event=(id,occurred_on,event_type,extra={})=>({id,record_id:'r',event_type,occurred_on,amount:0,balance:null,ownership_percentage:100,principal:0,interest:0,notes:'',created_at:'2026-01-01T00:00:00Z',...extra});
 const result=history.historySeries([
  event('e','2026-03-01','mortgage_payment',{principal:'70',interest:'30'}),
  event('b','2026-01-01','contribution',{amount:'1000',balance:2000,ownership_percentage:50}),
  event('a','2026-01-01','baseline',{balance:'1000',ownership_percentage:'50'}),
  event('c','2026-02-01','withdrawal',{amount:200,created_at:'2026-02-01T10:00:00Z'}),
  event('d','2026-02-01','income',{amount:15,created_at:'2026-02-01T09:00:00Z'}),
  event('f','2026-03-02','expense',{amount:5,balance:900}),
  event('g','2026-03-03','valuation',{balance:0}),
 ]);
 assert.deepEqual(result.points,[
  {date:'2026-01-01',timestamp:Date.UTC(2026,0,1),balance:1000,contributions:1000,receipts:0},
  {date:'2026-02-01',timestamp:Date.UTC(2026,1,1),balance:1000,contributions:800,receipts:15},
  {date:'2026-03-01',timestamp:Date.UTC(2026,2,1),balance:1000,contributions:800,receipts:15},
  {date:'2026-03-02',timestamp:Date.UTC(2026,2,2),balance:900,contributions:800,receipts:15},
  {date:'2026-03-03',timestamp:Date.UTC(2026,2,3),balance:0,contributions:800,receipts:15},
 ]);
 assert.deepEqual({...result,points:undefined},{points:undefined,balance:0,contributions:800,additions:1000,repayments:200,receipts:15,expenses:5,principal:70,interest:30});
 assert.deepEqual(history.historySeries([]),{points:[],balance:null,contributions:0,additions:0,repayments:0,receipts:0,expenses:0,principal:0,interest:0});
 // Same day and same creation time fall back to the id.
 const tie=history.historySeries([event('z','2026-01-01','valuation',{balance:2}),event('y','2026-01-01','valuation',{balance:1})]);
 assert.equal(tie.balance,2);
});

test('history chart dates convert back to stored date-only values',()=>{
 assert.equal(history.historyChartDate(Date.UTC(2026,8,30)),'2026-09-30');
 assert.equal(history.historyChartDate(Date.UTC(2026,8,30,23,59)),'2026-09-30');
});
