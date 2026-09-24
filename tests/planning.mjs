import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {income,expenses,scheduleDates} from '../lib/finance.ts';
import {depositToday} from '../lib/deposit-interest.ts';
const source=ts.transpileModule(fs.readFileSync('lib/planning.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {upcomingPayments,goalProgress}=new Function('income','expenses','depositToday','scheduleDates',source+';return {upcomingPayments,goalProgress};')(income,expenses,depositToday,scheduleDates);
import {parseCSV,mapCSV,exportCSV,FINANCE_RECORD_CSV_COLUMNS} from '../lib/csv.ts';
import {categoryHue} from '../lib/category-colors.ts';
const r={id:'rent',name:'Rent',kind:'Rent expense',amount:10,date:'2026-01-31',frequency:'Monthly'};
test('recurring payment dates clip month ends without drifting and preserve overdue unpaid items',()=>{
 const items=upcomingPayments([r],[],'2026-03-01','2026-03-31');assert.deepEqual(items.map(i=>i.date),['2026-01-31','2026-02-28','2026-03-31']);assert.equal(items[0].overdue,true);assert.equal(items[2].overdue,false);
 assert.deepEqual(upcomingPayments([{...r,end_date:'2026-02-28'}],[{record_id:r.id,due_on:'2026-01-31'}],'2026-03-01','2026-03-31').map(i=>i.date),['2026-02-28']);
 const yearly=upcomingPayments([{...r,date:'2024-02-29',frequency:'Yearly'}],[],'2025-03-01','2026-03-01');assert.deepEqual(yearly.map(i=>i.date),['2024-02-29','2025-02-28','2026-02-28']);
 assert.equal(upcomingPayments([{...r,kind:'Loan',frequency:'Once',amount:0}],[],'2026-03-01').length,0);
});
test('goal projections reserve existing balances and handle expired deadlines',()=>{
 assert.deepEqual(goalProgress({target:1000,allocated:400,target_date:'2026-12-31'},'2026-09-17'),{remaining:600,percent:40,monthly:150});
 assert.equal(goalProgress({target:1000,allocated:400,target_date:'2026-08-31'},'2026-09-17').monthly,600);
 assert.equal(goalProgress({target:1000,allocated:1000,target_date:null}).monthly,null);
});
test('CSV handles quotes, newlines, locale amounts and rejects malformed input',()=>{
 const rows=parseCSV('Name;Date;Amount;Notes\r\n"Shop; market";17/09/2026;"-1.234,50";"line one\nline ""two"""',';');
 assert.deepEqual(mapCSV(rows,{name:0,date:1,amount:2,notes:3,dateFormat:'dmy',decimal:','}),[{name:'Shop; market',date:'2026-09-17',amount:-1234.5,notes:'line one\nline "two"'}]);
 assert.throws(()=>parseCSV('a,b\n"unclosed,b'),/quoting/);
 assert.throws(()=>parseCSV('a,b\nx,y,z'),/columns/);
 for(const amount of ['1,23.40','NaN','Infinity','0',''])assert.throws(()=>mapCSV([['name','date','amount'],['Shop','2026-02-01',amount]],{name:0,date:1,amount:2,notes:-1,dateFormat:'iso',decimal:'.'}));
 assert.throws(()=>mapCSV([['name','date','amount'],['Shop','2026-02-30','3']],{name:0,date:1,amount:2,notes:-1,dateFormat:'iso',decimal:'.'}),/date/);
 assert.match(exportCSV([{name:'=HYPERLINK("x")',amount:-12}],['name','amount']),/"'=HYPERLINK/);
 assert.equal(categoryHue('stable-id'),categoryHue('stable-id'));assert.notEqual(categoryHue('stable-id'),categoryHue('other-id'));
});
test('raw finance exports cannot silently turn expenses, assets and schedules into imported income',()=>{
 const rows=[{name:'Groceries',kind:'Other expense',currency:'USD',amount:42,date:'2026-09-18'},{name:'Savings',kind:'Cash',currency:'EUR',amount:100,date:'2026-09-18'}];
 for(const columns of [FINANCE_RECORD_CSV_COLUMNS,[...FINANCE_RECORD_CSV_COLUMNS].reverse()]){
  const parsed=parseCSV(exportCSV(rows,columns));
  assert.throws(()=>mapCSV(parsed,{name:columns.indexOf('name'),date:columns.indexOf('date'),amount:columns.indexOf('amount'),notes:-1,dateFormat:'iso',decimal:'.'}),/records export, not a bank statement/);
 }
 const statement=parseCSV('name,date,amount,notes\nGroceries,2026-09-18,-42,Food');
 assert.equal(mapCSV(statement,{name:0,date:1,amount:2,notes:3,dateFormat:'iso',decimal:'.'})[0].amount,-42);
});
