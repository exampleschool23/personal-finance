import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {buildFinancialReport,parseFinanceBackup}=loadTS('lib/financial-report.ts');
const entry=(id,kind,amount,currency='USD',extra={})=>({id,name:id,kind,amount,currency,quantity:1,cost:0,rate:0,ownership_percentage:100,frequency:'Once',date:'2026-09-01',notes:'',...extra});
export const reportFixture={version:1,exported_at:'2026-09-18T10:30:00Z',tables:{
 finance_records:[entry('Cash account','Cash',1000),entry('Business share','Business',10000,'USD',{ownership_percentage:25,estimated_monthly_income:125.55}),entry('Loan','Loan',300),entry('UZS bank','Cash',2000000,'UZS'),entry('Salary received','Salary',500),entry('Salary schedule','Salary',9000,'USD',{frequency:'Monthly'}),entry('Leisure','Other expense',25.123456789),entry('BTC','Crypto',100,'USD',{quantity:2,cost:80}),entry('Deposit','Deposit',1000,'USD',{rate:21,date:'2027-01-01'})],
 savings_goals:[{id:'goal',name:'Emergency fund',kind:'savings',target:3000.12345678,allocated:300.12345678,currency:'USD',target_date:'2027-01-01',notes:'PRIVATE NOTE'},{id:'net',name:'Millionaire Net Worth',kind:'net_worth',allocated:0,target:1000000,currency:'USD',target_date:'2030-12-01',annual_return:0}],
 account_activity:[],investment_history:[],transaction_splits:[],investment_account_links:[],
 deleted_items:[{id:'deleted',source:'finance_records',data:entry('SECRET DELETED','Cash',99000)}],user_preferences:[{language:'en',currencies:['USD','UZS']}],portfolio_snapshots:[],transaction_categories:[{id:'leisure',name:'Leisure custom',direction:'expense'}],
 expense_plans:[{id:'budget',name:'Leisure budget',category:'Other',currency:'USD',amount:20,start_date:'2026-01-01',end_date:null}]
 },income_sources:[{id:'source',name:'Freelance',kind:'Other income',mode:'variable',currency:'USD',amount:null,frequency:null}]};
export const reportMarket={rates:{USD:1,UZS:10000},ratesDate:'2026-09-18',fx:{rate:10000,date:'2026-09-18',source:'CBU'},quotes:{'Crypto:BTC':{usd:150,source:'Test market',fetchedAt:'2026-09-18T10:00:00Z'}},errors:{},stocksConfigured:false};
const text=r=>r.blocks.map(b=>b.kind==='table'?[b.headers.join(' | '),...b.rows.map(r=>r.join(' | '))].join('\n'):b.text).join('\n');
const tables=(r,header)=>r.blocks.filter(b=>b.kind==='table'&&b.headers.includes(header));
test('report reconciles native and consolidated wealth, preserves precision, and excludes private technical/deleted fields',()=>{
 const before=JSON.stringify(reportFixture),r=buildFinancialReport(reportFixture,'en','Enjoy travel',reportMarket,{currency:'USD'}),s=text(r);
 assert.match(s,/USD \| \$4,800 \| \$300 \| \$4,500/);
 assert.deepEqual(tables(r,'Total assets').at(-1).rows,[['$5,000','$300','$4,700']]);
 assert.ok(s.includes('$4,700 / $1,000,000'));assert.ok(s.includes('$300 / $3,000'));assert.ok(s.includes('21%'));
 for(const hidden of ['SECRET DELETED','PRIVATE NOTE','user_id','more omitted'])assert.ok(!s.includes(hidden));
 assert.ok(s.includes('Month to date'));assert.ok(s.includes('Enjoy travel'));assert.ok(s.includes('Market quote · Test market'));assert.ok(s.includes('Saved/manual value'));assert.ok(!s.includes('25.123456789'));
 assert.equal(JSON.stringify(reportFixture),before);
});
test('actual cash flow excludes plans, deduplicates linked debt payments, and separates principal from interest',()=>{
 const f=structuredClone(reportFixture);
 f.tables.finance_records.push(entry('Mortgage','Mortgage',10000),entry('Mortgage payment','Other expense',110,'USD',{mortgage_payment_id:'m',payment_principal:100,payment_interest:10}),entry('Loan interest','Other expense',5,'USD',{operation_id:'l'}));
 f.tables.account_activity=[{id:'m',action:'mortgage',account_id:'Cash account',target_id:'Mortgage',amount:100,fee:10,occurred_on:'2026-09-05'},{id:'l',action:'repayment',account_id:'Cash account',target_id:'Loan',amount:20,fee:5,occurred_on:'2026-09-06'}];
 const r=buildFinancialReport(f,'en');
 assert.deepEqual(tables(r,'Debt principal paid')[0].rows[0],['USD','$500','$40','$120','$340']);
 // Cash expenses $25.123... + $10 mortgage interest + $5 loan interest.
 assert.equal(tables(r,'Expense category')[0].rows.find(row=>row[0]==='Other expense')[1],'$40');
 assert.equal(tables(r,'Expected monthly equivalent')[0].rows[0][1],'Not available'); // variable source
});
test('budget uses actual linked receipts through today, current plan version and carryover, never future or recurring plans',()=>{
 const f=structuredClone(reportFixture);
 f.tables.finance_records.push(entry('Purchase','Other expense',30,'USD',{expense_plan_id:'budget'}),entry('Future purchase','Other expense',999,'USD',{expense_plan_id:'budget',date:'2026-09-30'}),entry('Recurring commitment','Other expense',888,'USD',{expense_plan_id:'budget',frequency:'Monthly'}));
 const plans=[{...f.tables.expense_plans[0],amount:20,carryover:5,spent:99999}];
 const r=buildFinancialReport(f,'en','',null,{plans});
 assert.deepEqual(tables(r,'Budget plan / category')[0].rows,[['Leisure budget\nOther','$25','$30','-$5']]);
 assert.ok(text(r).includes('Budget overspend $5'));
});
test('missing rates or values never produce partial consolidated totals or fake zero goal progress',()=>{
 const f=structuredClone(reportFixture);
 let r=buildFinancialReport(f,'en');
 assert.equal(tables(r,'Total assets').at(-1).rows[0][2],'Not available');
 assert.ok(text(r).includes('Not available / $1,000,000'));
 f.tables.finance_records[0].amount=null;f.tables.finance_records.find(r=>r.kind==='Deposit').rate=null;
 r=buildFinancialReport(f,'en','',reportMarket);
 assert.equal(tables(r,'Total assets')[0].rows[0][1],'Not available');
 assert.equal(tables(r,'Deposit')[0].rows[0][2],'Not available');
 assert.ok(!text(r).includes('—'));
 for(const value of [null,{}, {...f,tables:{finance_records:[]}}, {...f,tables:{...f.tables,broken:'bad'}}])assert.throws(()=>parseFinanceBackup(value));
});
test('previous periods are shown only with historical evidence and full month is explicit',()=>{
 const f=structuredClone(reportFixture);assert.ok(text(buildFinancialReport(f,'en')).includes('no recorded history'));
 f.tables.finance_records.push(entry('Previous salary','Salary',100,'USD',{date:'2026-08-01'}));
 f.exported_at='2026-09-30T10:30:00Z';
 const s=text(buildFinancialReport(f,'en'));assert.ok(s.includes('Full month'));assert.ok(s.includes('Previous recorded period'));assert.ok(s.includes('$100'));
});
test('investment goals use owned quantities rather than treating units as money',()=>{
 const f=structuredClone(reportFixture);f.tables.finance_records.find(r=>r.kind==='Crypto').holding_account_id='wallet';
 f.tables.holding_accounts=[{id:'wallet',name:'Wallet',kind:'Crypto',currency:'USD'}];
 f.tables.savings_goals.push({id:'units',name:'BTC target',kind:'investment',holding_account_id:'wallet',asset_kind:'Crypto',asset_symbol:'BTC',target:4,allocated:0,target_date:'2027-01-01'});
 const r=buildFinancialReport(f,'en');assert.deepEqual(tables(r,'Investment target')[0].rows[0].slice(0,3),['BTC','2 / 4','50%']);
});
test('all relevant records and long names remain present in readable multipage PDFs in EN RU UZ',async()=>{
 const {renderFinancialReportPdf}=loadTS('lib/financial-report-pdf.ts'),{PDFDocument}=await import('pdf-lib');
 const f=structuredClone(reportFixture);
 f.tables.finance_records.push(...Array.from({length:35},(_,i)=>entry(`Asset ${i} Мои сбережения O‘zbekcha ${'long '.repeat(i===0?300:3)}`,'Property',1000)));
 for(const language of ['en','ru','uz']){
  const r=buildFinancialReport(f,language,'Interests and priorities',reportMarket);
  const assetRows=r.blocks.filter(b=>b.kind==='table'&&b.headers.length===3).flatMap(b=>b.rows).filter(row=>row[0].startsWith('Asset '));assert.equal(assetRows.length,35);
  const bytes=await renderFinancialReportPdf(r,fs.readFileSync('public/fonts/NotoSans-Regular.ttf'));
  const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>3);assert.ok(doc.getPageCount()<30);
 }
});

test('selected reporting currency converts even a single foreign currency and attributes mixed FX sources',()=>{
 const f=structuredClone(reportFixture);f.tables.finance_records=f.tables.finance_records.filter(r=>r.currency==='UZS');
 f.income_sources=[];f.tables.expense_plans=[];
 const market={...reportMarket,rates:{USD:1,UZS:10000,EUR:.9}};
 const r=buildFinancialReport(f,'en','',market,{currency:'EUR'});
 assert.deepEqual(tables(r,'Total assets').at(-1).rows,[['€180','€0','€180']]);
 assert.equal(tables(r,'Conversion')[0].rows[0][2],'CBU + ExchangeRate-API');
 const s=text(r);assert.ok(s.includes('0.00009'));assert.ok(!s.includes('more omitted'));
});
