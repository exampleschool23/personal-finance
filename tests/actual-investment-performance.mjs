import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {investmentKinds} from '../lib/comparison-profile.ts';
import * as dates from '../lib/benchmark-data.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deps={...dates};
const {convertHistorical,compareInvestments,percentagePerformance}=new Function(...Object.keys(deps),compile('lib/investment-comparison.ts')+';return {convertHistorical,compareInvestments,percentagePerformance};')(...Object.values(deps));
const performance=new Function('investmentKinds','convertHistorical','shiftDay',compile('lib/actual-investment-performance.ts')+';return actualInvestmentPerformance;')(investmentKinds,convertHistorical,dates.shiftDay);
const holding={id:'cafe',kind:'Business',currency:'USD',balance:400};
const records=[{id:'cafe',kind:'Business',currency:'USD'},{id:'cash',kind:'Cash',currency:'USD'},{id:'loan',kind:'Loan',currency:'USD'}];
const event=(type,date,amount,balance,id='cafe')=>({id:type+date,record_id:id,event_type:type,occurred_on:date,created_at:date+'T12:00:00Z',amount,balance,ownership_percentage:100});
const opening=event('contribution','2026-09-01',400,400);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('dated investment capital and income count, ordinary cash and debt do not',()=>{
 const result=performance(records,[opening,event('valuation','2026-09-02',0,450),event('income','2026-09-03',30,null),event('valuation','2026-09-03',0,9000,'cash'),event('valuation','2026-09-03',0,0,'loan')],[{...holding,balance:450}],[],'USD','2026-09-03');
 assert.equal(result.missing,false);assert.equal(result.points.at(-1).amount,480);assert.deepEqual(result.flows,[{date:'2026-09-01',amount:400}]);assert.deepEqual(result.observed,[]);
});
test('money added is capital and withdrawals preserve realized profit, including a full sale',()=>{
 const result=performance(records,[opening,event('contribution','2026-09-02',100,500),event('withdrawal','2026-09-03',600,0),event('expense','2026-09-03',10,null)],[{...holding,balance:0}],[],'USD','2026-09-03');
 const sim=compareInvestments(0,result.flows,result.points,{start:result.start,end:'2026-09-03',fx:[],prices:{},errors:{}},'USD',true);
 const last=percentagePerformance(sim.points,result.flows).at(-1);
 assert.equal(sim.points.at(-1).actual-sim.points.at(-1).contributed,90);
 assert.equal(last.invested,500);assert.equal(last.contributed,-100);assert.equal(last.actual,18);
});
test('two purchases buy BTC at their own prices and show monetary values and the shortfall',()=>{
 const result=performance(records,[event('contribution','2026-09-01',1000,1000),event('contribution','2026-09-02',500,1500),event('valuation','2026-09-03',0,1700)],[{...holding,balance:1700}],[],'USD','2026-09-03');
 const sim=compareInvestments(0,result.flows,result.points,{start:result.start,end:'2026-09-03',fx:[],prices:{BTC:[{date:'2026-09-01',close:100},{date:'2026-09-02',close:200},{date:'2026-09-03',close:220}]},errors:{}},'USD',true);
 const returns=percentagePerformance(sim.points,result.flows),last=returns.at(-1);
 const values=sim.points.at(-1);
 assert.equal(values.actual,1700);assert.equal(values.BTC,2750);assert.equal(values.actual-values.contributed,200);assert.equal(values.BTC-values.contributed,1250);assert.equal(values.actual-values.BTC,-1050);
 assert.equal(sim.points.at(-1).BTC,2750);assert.equal(last.invested,1500);near(last.actual,200/1500*100);near(last.BTC,1250/1500*100);near(last.actual-last.BTC,-70);
 assert.equal(returns[0].actual,0);assert.equal(returns[0].BTC,0);
});
test('opening observations are disclosed and backdated purchase history replaces assumed opening capital',()=>{
 const snapshot=event('baseline','2026-09-03',0,450);
 const observed=performance(records,[snapshot],[{...holding,balance:450}],[],'USD','2026-09-03');
 assert.deepEqual(observed.observed,['cafe']);assert.deepEqual(observed.flows,[{date:'2026-09-03',amount:450}]);
 const historical=performance(records,[snapshot,opening],[{...holding,balance:450}],[],'USD','2026-09-03');
 assert.deepEqual(historical.observed,[]);assert.deepEqual(historical.flows,[{date:'2026-09-01',amount:400}]);assert.equal(historical.points.at(-1).amount,450);
});
test('automatic snapshot plus same-day purchase never funds an investment twice',()=>{
 const result=performance(records,[{...event('baseline','2026-09-01',0,400),created_at:'2026-09-01T09:00:00Z'},opening],[holding],[],'USD','2026-09-01');
 assert.equal(result.flows.length,1);assert.equal(result.flows[0].amount,400);assert.deepEqual(result.observed,[]);assert.equal(result.points[0].amount,400);
});
test('ownership applies to values, while investment amounts already represent the user share',()=>{
 const result=performance(records,[{...opening,balance:800,ownership_percentage:50},{...event('valuation','2026-09-02',0,1000),ownership_percentage:50}],[{...holding,balance:500}],[],'USD','2026-09-02');
 assert.equal(result.points.at(-1).amount,500);assert.equal(result.flows[0].amount,400);
});
test('unknown holdings and missing FX pause the comparison instead of using partial totals',()=>{
 assert.equal(performance(records,[],[holding],[],'USD','2026-09-03').missing,true);
 assert.equal(performance(records,[opening],[],[],'USD','2026-09-03').missing,true);
 const missing=performance([{...records[0],currency:'EUR'}],[opening],[{...holding,currency:'EUR'}],[],'USD','2026-09-03');assert.equal(missing.points.at(-1).amount,null);assert.equal(missing.missing,true);
});
test('foreign contributions use rates on the investment date and zero capital has no percentage',()=>{
 const fx=[{date:'2026-09-01',rates:{USD:1,UZS:10000}},{date:'2026-09-02',rates:{USD:1,UZS:20000}}];
 const result=performance([{...records[0],currency:'UZS'}],[event('contribution','2026-09-01',1000000,1000000)],[{...holding,currency:'UZS',balance:1000000}],fx,'USD','2026-09-02');
 assert.equal(result.flows[0].amount,100);assert.equal(result.points.at(-1).amount,50);
 assert.equal(percentagePerformance([{date:'2026-09-01',actual:0,contributed:0,BTC:0}],[])[0].actual,null);
});
test('same-day sales and purchases preserve gross invested capital even when cash flow nets to zero',()=>{
 const flows=[{date:'2026-09-01',amount:100},{date:'2026-09-02',amount:-50},{date:'2026-09-02',amount:50}];
 const last=percentagePerformance([{date:'2026-09-01',actual:100,contributed:100},{date:'2026-09-02',actual:130,contributed:100}],flows).at(-1);
 assert.equal(last.invested,150);assert.equal(last.actual,20);
});

test('monetary comparison retains small-price precision and unavailable benchmark gaps',()=>{
 const flows=[{date:'2026-09-01',amount:100.125},{date:'2026-09-02',amount:50.375}];
 const data={start:'2026-09-01',end:'2026-09-02',fx:[],prices:{BTC:[{date:'2026-09-01',close:.000001},{date:'2026-09-02',close:.000002}]},errors:{}};
 const result=compareInvestments(0,flows,[{date:'2026-09-01',amount:100.125},{date:'2026-09-02',amount:190.75}],data,'USD',true);
 near(result.points.at(-1).BTC,250.625);
 near(result.points.at(-1).actual-result.points.at(-1).BTC,-59.875);
 assert.equal(result.points.at(-1).depositUZS,null);
});
test('benchmark presentation uses monetary values throughout and includes original investment dates',()=>{
 const source=fs.readFileSync('components/investment-comparison.tsx','utf8');
 assert.ok(source.includes('const points=result?.points??[]'));
 assert.ok(source.includes('tickFormatter={money}'));
 assert.ok(source.includes('money(Number(amount))'));
 assert.ok(source.includes("t('Ahead / behind benchmark')"));
 assert.ok(source.includes('):start;'));
 assert.ok(!source.includes('percentagePerformance'));
 assert.ok(!source.includes('tickFormatter={percent}'));
 assert.ok(!source.includes('percentage points'));
});
