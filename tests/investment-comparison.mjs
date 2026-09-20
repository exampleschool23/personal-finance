import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {assets,liabilities,income,expenses} from '../lib/finance.ts';
import * as dates from '../lib/benchmark-data.ts';
const compile = path => ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deps={assets,liabilities,income,expenses,...dates};
const {compareInvestments,recordedCashFlows,monthlyCashFlows,netWorthHistory,firstCompleteDate}=new Function(...Object.keys(deps),compile('lib/investment-comparison.ts')+';return {compareInvestments,recordedCashFlows,monthlyCashFlows,netWorthHistory,firstCompleteDate};')(...Object.values(deps));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001,`${actual} != ${expected}`);
const fx=[{date:'2025-01-01',rates:{USD:1,UZS:10000,EUR:.9}},{date:'2026-01-01',rates:{USD:1,UZS:12100,EUR:.95}}];
const data=(start,end,prices={})=>({start,end,prices,fx,errors:{}});
test('deposit rates compound for elapsed days and UZS devaluation is not hidden',()=>{
 const result=compareInvestments(1000,[],[],data('2025-01-01','2026-01-01'),'USD');
 near(result.points.at(-1).depositUSD,1080);
 near(result.points.at(-1).depositUZS,1000);
 assert.equal(result.points[0].depositUZS,1000);
});
test('identical cash flows purchase at the closing price and additions are not gains',()=>{
 const prices={SPY:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200},{date:'2025-01-03',close:220}]};
 const result=compareInvestments(1000,[{date:'2025-01-02',amount:200},{date:'2025-01-03',amount:-100}],[],data('2025-01-01','2025-01-03',prices),'USD');
 near(result.points[1].SPY,2200);near(result.points[2].SPY,2320);
 assert.equal(result.netCashFlow,100);assert.equal(result.points.at(-1).contributed,1100);
});
test('cashflow dates before the start are excluded and same-day movements net exactly once',()=>{
 const records=[{kind:'Salary',currency:'USD',amount:100,frequency:'Once',date:'2025-01-02'},{kind:'Other expense',currency:'UZS',amount:200000,frequency:'Once',date:'2025-01-02'},{kind:'Salary',currency:'USD',amount:999,frequency:'Monthly',date:'2025-01-02'},{kind:'Other income',currency:'USD',amount:999,frequency:'Once',date:'2025-01-01'}];
 assert.deepEqual(recordedCashFlows(records,'USD',fx,'2025-01-01','2025-01-03'),{flows:[{date:'2025-01-02',amount:80}],missing:0});
 const unknown=recordedCashFlows([{...records[0],currency:'GBP'}],'USD',fx,'2025-01-01','2025-01-03');assert.equal(unknown.missing,1);assert.deepEqual(unknown.flows,[]);
});
test('monthly anniversaries clip February without drifting following months',()=>{
 assert.deepEqual(monthlyCashFlows('2025-01-31','2025-04-30',100),[{date:'2025-02-28',amount:100},{date:'2025-03-31',amount:100},{date:'2025-04-30',amount:100}]);
});
test('net worth includes every asset and debt, ownership, changing FX, and never invents a missing baseline',()=>{
 const records=[{id:'a',kind:'Business',currency:'USD'},{id:'d',kind:'Loan',currency:'UZS'}];
 const event=(record_id,date,balance,ownership_percentage=100)=>({id:record_id+date,record_id,occurred_on:date,created_at:date,balance,ownership_percentage});
 const events=[event('a','2025-01-01',1000,50),event('d','2025-01-02',1000000)];
 assert.equal(firstCompleteDate(records,events),'2025-01-02');
 const result=netWorthHistory(records,events,'USD',fx,['2025-01-01','2025-01-02','2026-01-01']);
 assert.equal(result[0].amount,null);assert.equal(result[1].amount,400);near(result[2].amount,500-1000000/12100);
 assert.equal(firstCompleteDate([...records,{id:'new',kind:'Cash'}],events),null);
 assert.equal(netWorthHistory([...records,{id:'new',kind:'Cash',currency:'USD'}],events,'USD',fx,['2026-01-01'])[0].amount,null);
});
test('missing FX, stale quotes and depleted investments create gaps instead of invented returns or leverage',()=>{
 const result=compareInvestments(100,[{date:'2025-01-02',amount:-200}],[],{...data('2025-01-01','2025-01-03',{SPY:[{date:'2025-01-01',close:10}]}),fx:[]},'USD');
 assert.equal(result.points[0].depositUZS,null);assert.equal(result.points[1].SPY,null);assert.equal(result.points[2].SPY,null);assert.equal(result.points[1].depositUSD,null);
 assert.ok(result.unavailable.includes('depositUZS'));
 const stale=compareInvestments(100,[],[],data('2025-01-01','2025-01-10',{SPY:[{date:'2025-01-01',close:10}]}),'USD');assert.equal(stale.points.at(-1).SPY,null);
});
test('period checkpoints include boundaries and stay bounded',()=>{
 const checkpoints=dates.checkpointDates('2025-01-01','2026-01-01');assert.equal(checkpoints[0],'2025-01-01');assert.equal(checkpoints.at(-1),'2026-01-01');assert.ok(checkpoints.length<=25);
 assert.equal(dates.validDay('2025-02-30'),false);assert.equal(dates.validDay('2024-02-29'),true);
});
test('cashflow-only investing can start at zero and earns nothing before the contribution',()=>{
 const result=compareInvestments(0,[{date:'2025-01-02',amount:100}],[],data('2025-01-01','2025-01-03',{BTC:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200},{date:'2025-01-03',close:220}]}),'USD');
 assert.equal(result.points[0].BTC,0);assert.equal(result.points[1].BTC,100);near(result.points[2].BTC,110);assert.equal(result.netCashFlow,100);
});
test('comparison UI translates literal messages and uses recorded investment dates instead of editable starting capital',()=>{
 const source=fs.readFileSync('components/investment-comparison.tsx','utf8');
 const messages=[...source.matchAll(/\bt\('([^']+)'/g)].map(match=>match[1]);
 for(const language of ['en','ru','uz']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));for(const message of messages)assert.ok(labels[message],`${language}: ${message}`);}
 assert.ok(!source.includes('DatePicker'));assert.ok(!source.includes('setRequestedStart'));assert.ok(!source.includes('setCapital'));assert.ok(!/<[Ii]nput\b[^>]*type="number"/.test(source));assert.ok(!source.includes('type="date"'));
});
test('valuation gaps recover when quotes return, without inventing a trade price',()=>{
 const prices={SPY:[{date:'2025-01-01',close:10},{date:'2025-01-10',close:12}]};
 const result=compareInvestments(100,[],[],data('2025-01-01','2025-01-10',prices),'USD');
 assert.equal(result.points[8].SPY,null);assert.equal(result.points[9].SPY,120);
 const missingTrade=compareInvestments(100,[{date:'2025-01-09',amount:20}],[],data('2025-01-01','2025-01-10',prices),'USD');
 assert.equal(missingTrade.points[9].SPY,null);
});
test('unfunded benchmarks wait for the first contribution without requiring earlier prices',()=>{
 const result=compareInvestments(0,[{date:'2025-01-03',amount:100}],[],data('2025-01-01','2025-01-03',{BTC:[{date:'2025-01-03',close:20}]}),'USD',true);
 assert.deepEqual(result.points.map(point=>point.BTC),[0,0,100]);
});
test('zero and nonfinite quotes cannot generate infinite benchmark balances',()=>{
 for(const close of [0,NaN,Infinity,-5]){
  const result=compareInvestments(100,[],[],data('2025-01-01','2025-01-01',{SPY:[{date:'2025-01-01',close}]}),'USD');
  assert.equal(result.points[0].SPY,null);
 }
});
