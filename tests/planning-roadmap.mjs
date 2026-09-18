import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {xirr,timeWeightedEstimate,allocationDrift}=loadTS('lib/portfolio-performance.ts');
const {debtPayoff}=loadTS('lib/debt-payoff.ts');
const {watchlistSpending}=loadTS('lib/spending-watchlists.ts');
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
test('annualized returns match conventional reference cash flows, including a loss and grouped dates',()=>{
 const period=365/365.25;near(xirr([{date:'2025-01-01',amount:-1000},{date:'2026-01-01',amount:1100}]),Math.pow(1.1,1/period)-1);
 near(xirr([{date:'2025-01-01',amount:-500},{date:'2025-01-01',amount:-500},{date:'2026-01-01',amount:800}]),Math.pow(.8,1/period)-1);
 assert.equal(xirr([{date:'2025-02-30',amount:-1},{date:'2026-01-01',amount:2}]),null);
 assert.equal(xirr([{date:'2025-01-01',amount:-100},{date:'2025-03-01',amount:200},{date:'2025-06-01',amount:-100},{date:'2026-01-01',amount:20}]),null);
 assert.equal(xirr([{date:'2025-01-01',amount:-1}]),null);
});
test('time weighted estimate removes external cash, captures drawdown, and rejects incomplete histories',()=>{
 const result=timeWeightedEstimate([{date:'2026-01-01',amount:100},{date:'2026-01-02',amount:200},{date:'2026-01-03',amount:180}],[{date:'2026-01-02',amount:100}]);near(result.total,-.1);near(result.drawdown,.1);
 assert.equal(timeWeightedEstimate([{date:'2026-01-01',amount:0},{date:'2026-01-02',amount:100}],[]),null);
 assert.equal(timeWeightedEstimate([{date:'2026-01-01',amount:100},{date:'2026-01-02',amount:null}],[]),null);
 assert.equal(timeWeightedEstimate([{date:'2026-02-30',amount:100},{date:'2026-03-02',amount:200}],[]),null);
});
test('allocation cash contributions preserve total and never sell; incomplete values fail closed',()=>{
 const plan=allocationDrift({Stock:800,Cash:200},{Stock:50,Cash:50},200);assert.equal(plan.total,1000);assert.equal(plan.rows.find(r=>r.key==='Stock').contribution,0);assert.equal(plan.rows.find(r=>r.key==='Cash').contribution,200);near(plan.rows.reduce((n,r)=>n+r.delta,0),200);
 assert.equal(allocationDrift({Stock:null},{Stock:100}),null);assert.equal(allocationDrift({Stock:100},{Stock:99}),null);assert.equal(allocationDrift({Stock:100},{Stock:100},-1),null);
});
test('payoff rolls freed payments forward, handles zero interest, and shows non-amortizing debt',()=>{
 const result=debtPayoff([{id:'a',balance:100,annualRate:0,minimum:50},{id:'b',balance:500,annualRate:0,minimum:50}],0,'snowball');assert.equal(result.months,6);assert.equal(result.interest,0);assert.equal(result.debts[0].paidOn,2);assert.equal(result.budget,100);
 const growing=debtPayoff([{id:'a',balance:1000,annualRate:24,minimum:10}],0,'avalanche',12);assert.equal(growing.months,null);assert.ok(growing.remaining>1000);
 assert.equal(debtPayoff([{id:'a',balance:100,annualRate:0,minimum:10}],10,'avalanche').months,5);
 assert.equal(debtPayoff([{id:'a',balance:100,annualRate:NaN,minimum:10}],0,'avalanche'),null);
});
test('watchlists use actual split spending in original currency and exclude plans and future records',()=>{
 const list={query:'shop',category:'food',currency:'USD',target:20};const row={id:'1',name:'Shop',kind:'Living expense',frequency:'Once',currency:'USD',date:'2026-09-01',amount:100,custom_category_id:'food'};
 const records=[row,{...row,id:'2',frequency:'Monthly'},{...row,id:'3',date:'2026-09-30'},{...row,id:'4',currency:'UZS'},{...row,id:'5',kind:'Salary'}];
 const result=watchlistSpending(list,records,[{record_id:'1',category_id:'food',amount:25},{record_id:'1',category_id:'other',amount:75}],'2026-09-15');assert.equal(result.spent,25);assert.equal(result.projected,50);assert.equal(result.remaining,-5);assert.equal(result.count,1);
});
test('recurring detection requires three regularly spaced actuals and avoids existing plans and protected operations',()=>{
 const {recurringSuggestions,suspectedDuplicates}=loadTS('lib/recurring-insights.ts');
 const rows=['2026-06-15','2026-07-15','2026-08-15'].map((date,index)=>({id:String(index),name:'Internet',kind:'Other expense',currency:'USD',amount:index===2?25:20,date,frequency:'Once'}));
 const results=recurringSuggestions(rows,'2026-09-01');assert.equal(results.length,1);assert.equal(results[0].next,'2026-09-15');assert.equal(results[0].changed,true);assert.equal(recurringSuggestions(rows.slice(1),'2026-09-01').length,0);assert.equal(recurringSuggestions([...rows,{...rows[0],id:'plan',frequency:'Monthly'}],'2026-09-01').length,0);assert.equal(recurringSuggestions(rows.map(row=>({...row,operation_id:'protected'})),'2026-09-01').length,0);
 assert.equal(suspectedDuplicates([...rows,{...rows[0],id:'copy'}]).length,1);assert.equal(suspectedDuplicates([...rows,{...rows[0],id:'other',currency:'UZS'}]).length,0);
});
test('saved scenarios preserve purchasing power and model a missed month without inflating existing wealth',()=>{
 const {projectGoalScenario}=loadTS('lib/goal-projection.ts');const scenario={deadline:'2027-01-01',monthly:100,annual_return:0,inflation:10};
 const result=projectGoalScenario(1000,2000,'2026-01-01',scenario);near(result.projected,2200);near(result.inflatedTarget,2000*1.1**(365/365.25));near(result.realValue,result.projected/1.1**(365/365.25));
 const missed=projectGoalScenario(1000,2000,'2026-01-01',{...scenario,inflation:0,missed_date:'2026-02-15'});assert.equal(missed.contributed,1100);assert.equal(missed.projected,2100);near(missed.required,1000/11);assert.equal(missed.points.find(p=>p.date==='2026-02-01').projected,1000);
 assert.equal(projectGoalScenario(1000,2000,'2026-01-01',{...scenario,inflation:-1}),null);
});
