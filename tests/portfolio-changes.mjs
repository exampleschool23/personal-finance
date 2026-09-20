import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {assets,liabilities,income,expenses} from '../lib/finance.ts';
import {historyEventLabel} from '../lib/investment-history.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'' ).replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const convertAmount=new Function(compile('lib/market.ts')+';return convertAmount;')();
const portfolioChanges=new Function('assets','liabilities','income','expenses','historyEventLabel','convertAmount',compile('lib/portfolio-changes.ts')+';return portfolioChanges;')(assets,liabilities,income,expenses,historyEventLabel,convertAmount);
const record=(id,kind,currency='USD')=>({id,name:id,kind,currency});
const event=(id,record_id,occurred_on,balance,event_type='valuation',amount=0)=>({id,record_id,occurred_on,balance,event_type,amount,ownership_percentage:100,created_at:occurred_on});
const points=[{date:'2026-09-01',assets:1500,debt:500,net:1000},{date:'2026-09-03',assets:1300,debt:300,net:1000}];
test('repayment explains both cash and debt without inventing profit and excludes deleted records',()=>{
 const details=portfolioChanges(points,[record('cash','Cash'),record('loan','Loan')],[event('c1','cash','2026-09-01',1500),event('l1','loan','2026-09-01',500),event('c2','cash','2026-09-02',1300),event('l2','loan','2026-09-02',300,'withdrawal',200),event('removed','deleted','2026-09-02',9000)],[],'USD');
 const result=details.get('2026-09-03');
 assert.equal(result.change,0);assert.equal(result.remainder,0);
 assert.deepEqual(result.changes.map(r=>r.amount),[-200,200]);
 assert.deepEqual(result.activity.map(r=>[r.label,r.amount]),[['Balance update',-200],['Repayment made',200]]);
 assert.equal(details.get('2026-09-01').change,null);
});
test('deduplicates linked receipts, excludes recurring forecasts, and reports missing FX honestly',()=>{
 const events=[event('receipt','asset','2026-09-02',null,'income',100)];
 const cashflows=[{...record('linked','Other income'),frequency:'Once',date:'2026-09-02',amount:100,history_event_id:'receipt'}, {...record('rent','Living expense'),frequency:'Once',date:'2026-09-02',amount:50}, {...record('future','Salary'),frequency:'Monthly',date:'2026-09-02',amount:500}, {...record('fx','Salary','EUR'),frequency:'Once',date:'2026-09-02',amount:200}];
 const result=portfolioChanges(points,[record('asset','Business')],events,cashflows,'USD').get('2026-09-03');
 assert.deepEqual(result.activity.map(r=>r.amount),[100,-50,null]);
});
test('preserves ownership and FX precision; unexplained live quote changes stay separate',()=>{
 const history=[{...event('a','asset','2026-09-01',100),ownership_percentage:50},{...event('b','asset','2026-09-02',120.123456),ownership_percentage:50}];
 const dates=[{date:'2026-09-01',net:25},{date:'2026-09-03',net:40}];
 const result=portfolioChanges(dates,[record('asset','Business','EUR')],history,[],'USD',{EUR:2}).get('2026-09-03');
 assert.ok(Math.abs(result.changes[0].amount-5.030864)<1e-8);
 assert.ok(Math.abs(result.remainder-9.969136)<1e-8);
});
test('missing baselines and future events are not fabricated as gains',()=>{
 const result=portfolioChanges(points,[record('asset','Stock')],[event('a','asset','2026-09-02',100),event('b','asset','2026-10-01',500,'contribution',400)],[],'USD').get('2026-09-03');
 assert.deepEqual(result.changes,[]);assert.deepEqual(result.activity,[]);
});

test('cash withdrawal is negative and corrections use balance differences, not replacement totals',()=>{
 const history=[event('a','cash','2026-09-01',10000),event('b','cash','2026-09-02',3239,'withdrawal',6761),event('c','cash','2026-09-03',3634)];
 const result=portfolioChanges(points,[record('cash','Cash')],history,[],'USD').get('2026-09-03');
 assert.deepEqual(result.activity.map(r=>r.amount),[-6761,395]);
 assert.equal(result.activity[1].record.id,'cash');
});
