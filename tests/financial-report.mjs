import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {buildFinancialReport,parseFinanceBackup}=loadTS('lib/financial-report.ts');
const entry=(id,kind,amount,currency='USD',extra={})=>({id,name:id,kind,amount,currency,quantity:1,cost:0,rate:0,ownership_percentage:100,frequency:'Once',date:'2026-09-01',notes:'',...extra});
export const reportFixture={version:1,exported_at:'2026-09-18T10:30:00Z',tables:{
 finance_records:[entry('cash','Cash',1000),entry('cafe','Business',10000,'USD',{ownership_percentage:25,estimated_monthly_income:125.55}),entry('debt','Loan',300),entry('uzs','Cash',2000000,'UZS'),entry('salary','Salary',500),entry('plan','Salary',9000,'USD',{frequency:'Monthly'}),entry('expense','Other expense',25.123456789),entry('coin','Crypto',.00000012,'USD',{quantity:100,cost:.00000008,notes:'Мои сбережения. O‘zbekcha yozuv.'})],
 savings_goals:[{id:'goal',name:'Emergency fund',target:3000.12345678,allocated:300.12345678,currency:'USD',target_date:'2027-01-01',notes:'Keep a cash reserve.'}],
 account_activity:[],investment_history:[],transaction_splits:[],investment_account_links:[],
 deleted_items:[{id:'deleted',source:'finance_records',data:entry('old','Cash',99000)}],
 user_preferences:[{language:'en',currencies:['USD','UZS']}],
 portfolio_snapshots:[{occurred_on:'2026-09-01',assets:3500,debt:300,rates:{USD:1,UZS:12000}}]
 },income_sources:[{id:'source',name:'Freelance',kind:'Other income',mode:'variable',currency:'USD',notes:'Design projects'}]};
test('summary preserves totals without exporting transaction or technical history',()=>{
 const before=JSON.stringify(reportFixture);
 const text=buildFinancialReport(reportFixture,'en','I prefer low risk and enjoy travel.').blocks.map(block=>block.text).join('\n');
 assert.match(text,/Net worth: \$3,200/);assert.match(text,/Income: \$500/);assert.match(text,/Expenses: \$25/);
 assert.match(text,/Emergency fund/);assert.match(text,/Freelance/);assert.match(text,/I prefer low risk/);
 for(const excluded of ['99,000','9,000','Design projects','Current price per unit','Recently deleted','Account preferences'])assert.ok(!text.includes(excluded));
 assert.equal(JSON.stringify(reportFixture),before);
 for(const value of [null,{}, {...reportFixture,tables:{finance_records:[]}}, {...reportFixture,tables:{...reportFixture.tables,broken:'not an array'}}])assert.throws(()=>parseFinanceBackup(value));
});
test('summary PDF stays within two readable pages for large accounts in every language',async()=>{
 const {renderFinancialReportPdf}=loadTS('lib/financial-report-pdf.ts');
 const {PDFDocument}=await import('pdf-lib');
 const fixture=structuredClone(reportFixture);
 const currencies=['USD','UZS','EUR','GBP','JPY','CAD','AUD'];
 fixture.tables.finance_records=Array.from({length:1000},(_,i)=>entry(`Very long account name ${'Long '.repeat(30)}${i}`,['Deposit','Mortgage','Loan'][i%3],1000,currencies[i%7],{rate:21}));
 fixture.tables.savings_goals=Array.from({length:100},(_,i)=>({id:String(i),name:'Savings goal '.repeat(20),target:10000,allocated:100,currency:'USD',target_date:'2027-01-01'}));
 fixture.income_sources=Array.from({length:100},()=>({name:'Income source '.repeat(20),amount:1000,currency:'USD',frequency:'Monthly'}));
 fixture.tables.expense_plans=Array.from({length:100},()=>({name:'Expense plan '.repeat(20),amount:1000,currency:'USD',start_date:'2026-01-01'}));
 for(const language of ['en','ru','uz']){
  const report=buildFinancialReport(fixture,language,'Мои интересы O‘zbekcha '.repeat(500));
  const bytes=await renderFinancialReportPdf(report,fs.readFileSync('public/fonts/NotoSans-Regular.ttf'));
  const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()<=2,`${language}: ${doc.getPageCount()} pages`);
  assert.ok(report.blocks.length<60);
  if(language==='en')assert.ok(report.blocks.some(block=>block.text.includes('more omitted')));
 }
});

test('summary omits empty fields and displays saved deposit and borrowing percentages',()=>{
 const fixture=structuredClone(reportFixture);
 fixture.tables.finance_records.push(entry('Deposit 21','Deposit',1000,'USD',{rate:21,account_rate_date:null,account_currency:'',end_date:null}));
 fixture.tables.finance_records.push(entry('Mortgage','Mortgage',5000,'USD',{rate:17.5}));
 fixture.tables.finance_records.push(entry('Interest free loan','Loan',50,'USD',{rate:0}));
 fixture.tables.deleted_items[0].data.account_rate_date=null;
 fixture.tables.deleted_items[0].splits=[];
 fixture.tables.deleted_items[0].empty={blank:' ',nothing:null};
 const before=JSON.stringify(fixture);
 for(const lang of ['en','ru','uz']){
  const report=buildFinancialReport(fixture,lang),text=report.blocks.map(block=>block.text).join('\n');
  assert.ok(!text.includes(': —'));assert.ok(!text.includes('Account rate date:'));assert.ok(!text.includes('Account currency:'));assert.ok(!text.includes('Empty:'));assert.ok(!text.includes('Splits:'));
  assert.ok(text.includes('21%'));assert.ok(text.includes(lang==='en'?'17.5%':'17,5%'));assert.ok(text.includes('0%'));
 }
 assert.equal(JSON.stringify(fixture),before);
});
