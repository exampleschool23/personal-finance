import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import ts from 'typescript';
import * as days from '../lib/calendar-days.ts';
import * as finance from '../lib/finance.ts';
import * as market from '../lib/market.ts';
import {stylesheet} from './helpers/stylesheet.mjs';
import {workspaceSource} from './helpers/workspace-source.mjs';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const dependencies={...finance,...market,...days};
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
 assert.deepEqual(goalFinancials(records,'2026-09','USD',null),{netWorth:200,surplus:400});
 assert.deepEqual(goalFinancials([...records,record('Property',100,{currency:'EUR'})],'2026-09','USD',null),{netWorth:null,surplus:null});
 assert.equal(goalFinancials([...records,record('Living expense',50,{currency:'EUR',frequency:'Monthly'})],'2026-09','USD',null).surplus,null,'spending that cannot be converted leaves the surplus unknown');
 assert.equal(goalFinancials(records,'2026-09','EUR',{rates:{EUR:.9},quotes:{},fx:null}).netWorth,180);
});
test('surplus excludes ended schedules and one-off income, and includes mortgage commitments',()=>{
 const records=[record('Salary',1000,{frequency:'Monthly',end_date:'2026-08-31'}),record('Other income',10000),record('Mortgage',500,{estimated_monthly_payment:100})];
 assert.equal(goalFinancials(records,'2026-09','USD',null).surplus,-100);
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
 const provider=workspaceSource();
 assert.match(provider,/const planningMonth = section === 'Income & expenses' \? forecastMonth : depositMonth\(\);/);
 assert.match(provider,/estimatedCashFlow\(monthlyIncomeEntries, planningMonth\)/);
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

test('a goal without a target date shows the month it is reached at the amount typed',()=>{
 const {reachedIn}=loadTS('lib/goal-projection.ts');
 // Retirement 2: $22,874 target, $2,287 saved, $500 a month from October 2026 is 42 months: April 2030.
 assert.equal(reachedIn(22874-2287,500,'2026-10-04'),'2030-04');
 assert.equal(reachedIn(1200,100,'2026-12-15'),'2027-12','counts across the year end');
 assert.equal(reachedIn(1,100,'2026-10-04'),'2026-11');
 for(const [left,monthly] of [[0,100],[null,100],[500,0],[500,-5],[500,Number.NaN],[1e9,1]])assert.equal(reachedIn(left,monthly,'2026-10-04'),null,`${left} at ${monthly}`);
 const flow=fs.readFileSync('components/planning/goal-setup-flow.tsx','utf8');
 assert.match(flow,/t\('At this amount, reached in \{month\}', \{ month: formatMonthYear\(reached, locale\) \}\)/,'the month goes through the shared formatter');
 assert.doesNotMatch(flow,/Your goal allocations exceed the current account balance/,'already saved may exceed the account balance in setup');
 assert.doesNotMatch(fs.readFileSync('components/planning/goals-page.tsx','utf8'),/allocations exceed|overAllocated/,'goal rows never flag allocations over the balance');
});

test('the Goals page switches Overview, Goal planner and History from the top bar',()=>{
 const css=stylesheet(),page=fs.readFileSync('components/planning/goals-page.tsx','utf8'),panel=fs.readFileSync('components/planning/goal-funding-panel.tsx','utf8');
 assert.match(page,/<PageHeader title=\{t\('Goals'\)\} tabs=\{<Segmented className="page-tabs"[^\n]*value:'overview'[^\n]*value:'planner'[^\n]*value:'history'/);
 // Overview: the list, then the chosen goal beside what is free for goals; the other views stand alone.
 assert.match(page,/\{view==='overview'&&<>[\s\S]*goals-list[\s\S]*<div className="goals-split">[\s\S]*<GoalDetail[\s\S]*part="funding"\/>/);
 assert.match(page,/\{view==='planner'&&\(active\?/);assert.match(page,/\{view==='history'&&<GoalFundingPanel[^\n]*part="activity"\/>\}/);
 assert.match(panel,/part !== 'activity' && activeGoals\.length > 0/);assert.match(panel,/part !== 'funding' && savingsGoals\.length > 0/);
 assert.match(css,/\.goals-split\{[^}]*align-items:stretch/);
 assert.match(css,/\.segmented\.page-tabs>button\[aria-pressed=true\]\{[^}]*border-block-end-color:var\(--primary\)/);
});
