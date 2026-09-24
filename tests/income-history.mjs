import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {monthly,income,duplicatesAssetEstimate} from '../lib/finance.ts';
import {convertAmount} from '../lib/market.ts';
import {depositInterest} from '../lib/deposit-interest.ts';
const source=ts.transpileModule(fs.readFileSync('lib/income-history.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const history=new Function('monthly','income','duplicatesAssetEstimate','convertAmount','depositInterest',source+';return incomeHistory;')(monthly,income,duplicatesAssetEstimate,convertAmount,depositInterest);
const event=(id,record_id,amount,type='income')=>({id,record_id,event_type:type,amount,occurred_on:'2026-09-10',balance:null});
const payment=(id,kind,amount,extra={})=>({id,kind,amount,currency:'USD',frequency:'Once',date:'2026-09-10',...extra});
test('income includes dividends, salaries, rent, business and interest without counting Tracker copies twice',()=>{
 const records=[{id:'stock',kind:'Stock',currency:'USD'},{id:'property',kind:'Property',currency:'USD',estimated_monthly_income:500},{id:'business',kind:'Business',currency:'USD',estimated_monthly_income:1000},{id:'deposit',kind:'Deposit',currency:'USD',rate:0}];
 const events=[event('dividend','stock',100),event('rent','property',500),event('profit','business',1000),event('interest','deposit',50),event('capital','stock',99999,'contribution')];
 const cash=[payment('salary','Salary',2000),payment('copy','Other income',100,{history_event_id:'dividend'}),payment('other','Other income',30)];
 const result=history(records,events,cash,'USD',undefined,'2026-09-17');
 assert.deepEqual(result.received,{salary:2000,dividends:100,rent:500,business:1000,interest:50,other:30});assert.equal(result.totalReceived,3680);assert.equal(result.estimatedTotal,1500);
});
test('recurring salary is forecast-only, ownership is not reapplied to personal income, and business forecasts are not duplicated',()=>{
 const records=[{id:'b',kind:'Business',currency:'USD',ownership_percentage:50,estimated_monthly_income:1000}];
 const cash=[payment('salary','Salary',24000,{frequency:'Yearly',business_id:'b',date:'2026-01-01'}),payment('distribution','Other income',1000,{frequency:'Monthly',business_id:'b'}),payment('ended','Salary',1000,{frequency:'Monthly',date:'2026-01-01',end_date:'2026-08-31'})];
 const result=history(records,[],cash,'USD',undefined,'2026-09-17');
 assert.equal(result.expected.salary,2000);assert.equal(result.expected.business,1000);assert.equal(result.estimatedTotal,3000);assert.equal(result.totalReceived,0);
 assert.ok(result.points.every(point=>point.estimate===3000));assert.equal(result.points[0].month,'2026-09');
});
test('dated deposit balances estimate interest but do not invent a received payment',()=>{
 const result=history([{id:'d',kind:'Deposit',currency:'USD',rate:12}],[{...event('base','d',0,'baseline'),balance:1000,occurred_on:'2026-09-01'}],[],'USD',undefined,'2026-09-17');
 assert.equal(result.expected.interest,10);assert.equal(result.received.interest,0);
});
test('date ranges, foreign income and missing rates are handled explicitly',()=>{
 const cash=[payment('foreign','Salary',12000000,{currency:'UZS'}),payment('future','Other income',999,{date:'2026-09-20'}),payment('old','Other income',888,{date:'2026-01-01'})];
 const result=history([],[],cash,'USD',{UZS:12000},'2026-09-17',3);assert.equal(result.totalReceived,1000);assert.equal(result.points.length,3);assert.equal(result.points[0].month,'2026-09');
 const missing=history([],[],cash,'USD',undefined,'2026-09-17',3);assert.equal(missing.missing,1);
});

test('empty history is replaced by future estimates with calendar year rollover',()=>{
 const result=history([],[],[payment('salary','Salary',1000,{frequency:'Monthly'})],'USD',undefined,'2026-09-17',6);
 assert.deepEqual(result.points.map(point=>point.month),['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02']);
 assert.ok(result.points.every(point=>point.estimate===1000 && point.salary===0));
 assert.equal(result.totalReceived,0);
});
test('first receipt anchors history and gaps remain chronologically accurate',()=>{
 const result=history([],[],[payment('old','Salary',123.456,{date:'2026-07-01'}),payment('now','Salary',200)],'USD',undefined,'2026-09-17',6);
 assert.deepEqual(result.points.map(point=>point.month),['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12']);
 assert.equal(result.points[1].salary,0);assert.equal(result.points[0].estimate,null);
 assert.equal(result.totalReceived,323.456);
});
test('future estimates respect source start and end dates and missing exchange rates',()=>{
 const cash=[payment('ends','Salary',1000,{frequency:'Monthly',end_date:'2026-09-30'}),payment('starts','Rent income',500,{frequency:'Monthly',date:'2026-11-01'}),payment('foreign','Salary',100,{frequency:'Monthly',date:'2026-11-01',currency:'EUR'})];
 const result=history([],[],cash,'USD',undefined,'2026-09-17',3);
 assert.deepEqual(result.points.map(point=>point.estimate),[1000,0,null]);
 assert.equal(result.estimatedTotal,1000);assert.equal(result.estimateMissing,0);assert.equal(result.forecastMissing,1);assert.equal(result.totalReceived,0);
});
test('unconvertible recorded receipts retain their month instead of being hidden',()=>{
 const result=history([],[],[payment('foreign','Salary',100,{date:'2026-08-01',currency:'EUR'})],'USD',undefined,'2026-09-17',3);
 assert.equal(result.points[0].month,'2026-08');assert.equal(result.missing,1);
});


test('income forecasts honor every deposit compounding mode in current and future months',()=>{
 const events=[{id:'opening',record_id:'deposit',event_type:'baseline',amount:0,balance:10000.12345678,occurred_on:'2025-01-01',created_at:'2025-01-01T00:00:00Z'}];
 for(const mode of ['none','daily','monthly']){
  const result=history([{id:'deposit',kind:'Deposit',currency:'USD',rate:24,deposit_compounding:mode}],events,[],'USD',undefined,'2026-09-24',3);
  for(const point of result.points)assert.equal(point.estimate,depositInterest(events,24,point.month,mode));
  assert.equal(result.expected.interest,depositInterest(events,24,'2026-09',mode));
  assert.equal(result.totalReceived,0);
 }
});
