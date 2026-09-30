import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as finance from '../lib/finance.ts';
import * as market from '../lib/market.ts';
import * as budgets from '../lib/expense-plans.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const dependencies={...finance,...market,...budgets};
const {projectGoal,goalFinancials}=new Function(...Object.keys(dependencies),compile('lib/goal-projection.ts')+';return {projectGoal,goalFinancials};')(...Object.values(dependencies));

test('million-dollar goal compounds new monthly surplus and required path hits exact deadline',()=>{
 const result=projectGoal(100000,1000000,'2026-09-17','2030-12-31',10000,8);
 assert.equal(result.months,51);assert.ok(result.projected>610000);assert.ok(result.required>10000);
 assert.ok(Math.abs(result.points.at(-1).required-1000000)<1e-8);
 assert.equal(result.points[0].projected,100000);assert.equal(result.points[0].required,100000);
 const withoutContributions=projectGoal(100000,1000000,'2026-09-17','2030-12-31',0,8);
 assert.equal(withoutContributions.projected,100000);
 const exact=projectGoal(100000,1000000,'2026-09-17','2030-12-31',result.required,8);
 assert.ok(Math.abs(exact.projected-1000000)<1e-8);
});
test('zero return, negative net worth, reached targets and short or expired deadlines',()=>{
 const result=projectGoal(-500,1000,'2026-01-31','2026-03-31',100,0);
 assert.deepEqual(result.points.map(point=>point.date),['2026-01-31','2026-02-28','2026-03-31']);
 assert.equal(result.required,750);assert.equal(result.projected,-300);
 assert.equal(projectGoal(1200,1000,'2026-01-31','2026-03-31',0,0).required,0);
 for(const deadline of ['2025-12-31','2026-01-31','2026-02-01'])assert.equal(projectGoal(0,1000,'2026-01-31',deadline,100,0).required,null);
 assert.equal(projectGoal(0,1000,'2026-01-31','2030-12-31',0,NaN),null);
 assert.equal(projectGoal(0,1000,'2026-01-31','9999-12-31',100,100),null);
});
const record=(kind,amount,extra={})=>({id:kind,name:kind,kind,amount,cost:0,quantity:0,currency:'USD',date:'2026-01-01',frequency:'Once',...extra});
test('goal baseline respects ownership, quantities, debt and complete FX coverage',()=>{
 const records=[record('Cash',100),record('Stock',10,{quantity:5}),record('Business',1000,{ownership_percentage:25}),record('Loan',200),record('Salary',500,{frequency:'Monthly'}),record('Living expense',100,{frequency:'Monthly'})];
 assert.deepEqual(goalFinancials(records,[{amount:50,currency:'USD',start_date:'2026-01-01'}],'2026-09','USD',null,true),{netWorth:200,surplus:350});
 assert.deepEqual(goalFinancials([...records,record('Property',100,{currency:'EUR'})],[],'2026-09','USD',null,true),{netWorth:null,surplus:null});
 assert.equal(goalFinancials(records,[],'2026-09','USD',null,false).surplus,null);
 assert.equal(goalFinancials(records,[{amount:50,currency:'EUR',start_date:'2026-01-01'}],'2026-09','USD',null,true).surplus,null);
 assert.equal(goalFinancials(records,[],'2026-09','EUR',{rates:{EUR:.9},quotes:{},fx:null},true).netWorth,180);
});
test('surplus excludes ended schedules and one-off income, and includes mortgage commitments',()=>{
 const records=[record('Salary',1000,{frequency:'Monthly',end_date:'2026-08-31'}),record('Other income',10000),record('Mortgage',500,{estimated_monthly_payment:100})];
 assert.equal(goalFinancials(records,[],'2026-09','USD',null,true).surplus,-100);
});

test('a deadline today has not passed; the required amount shown is a whole amount that meets the target',()=>{
 assert.equal(projectGoal(0,1000,'2026-09-29','2026-09-29',100,0).overdue,false);
 assert.equal(projectGoal(0,1000,'2026-09-29','2026-09-28',100,0).overdue,true);
 const plan=projectGoal(0,1000,'2026-09-29','2026-12-29',0,0);
 assert.ok(Math.abs(plan.required-1000/3)<1e-9);
 assert.ok(projectGoal(0,1000,'2026-09-29','2026-12-29',Math.ceil(plan.required),0).projected>=1000);
 assert.ok(projectGoal(0,1000,'2026-09-29','2026-12-29',Math.round(plan.required),0).projected<1000);
 const planner=fs.readFileSync('components/planning/goal-forecast.tsx','utf8');
 assert.match(planner,/\{t\('Monthly contribution needed'\)\}<\/span><strong>\{requiredContribution === null \? '—' : money\(requiredContribution\)\}/);
 assert.match(planner,/displayFractionDigits=\{monthly === null \? 0 : undefined\}/);
});
test('only Cash flow follows its month picker; other screens plan for the current month',()=>{
 const provider=fs.readFileSync('components/workspace/workspace-provider.tsx','utf8');
 assert.match(provider,/const planningMonth = section === 'Income & expenses' \? forecastMonth : expensePlanMonth\(\);/);
 assert.match(provider,/estimatedCashFlow\(current, planProjection, planningMonth\)/);
 assert.match(provider,/useExpensePlans\(user, demo, rows, reload, refreshRecords, planningMonth\)/);
});

test('milestones mark the months that receive an investment and show both monthly amounts',()=>{
 const plan=projectGoal(0,1000,'2026-01-31','2026-04-15',100,0);
 assert.deepEqual(plan.points.map(point=>[point.date,point.contributes]),[['2026-01-31',false],['2026-02-28',true],['2026-03-31',true],['2026-04-15',false]]);
 const skipped=projectGoal(0,1000,'2026-01-31','2026-03-31',100,0,'2026-02');
 assert.deepEqual(skipped.points.map(point=>point.contributes),[false,false,true]);
 const planner=fs.readFileSync('components/planning/goal-forecast.tsx','utf8');
 assert.match(planner,/<th scope="col">\{t\('Monthly investment'\)\}<\/th><th scope="col">\{t\('Your projected path'\)\}<\/th><th scope="col">\{t\('Monthly contribution needed'\)\}<\/th><th scope="col">\{t\('Path to your goal'\)\}<\/th>/);
 // Monthly rows name their month; the opening row is today and an off-cycle target date keeps its day.
 assert.match(planner,/\{index === 0 \? t\('Today'\) : point\.contributes \? formatMonthYear\(point\.date, locale\) : formatDate\(point\.date, locale\)\}/);
 // The needed amount is the same whole figure as the summary tile, never an exact calculation tail.
 assert.match(planner,/point\.contributes && requiredContribution !== null \? money\(requiredContribution\) : '—'/);
});
