import { portfolioAssets, portfolioAssetKey, portfolioAssetCurrency } from '../lib/diversified-portfolio.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {expenses,liabilities} from '../lib/finance.ts';
import {historyEventLabel} from '../lib/investment-history.ts';
import {isInvestmentRecord} from '../lib/comparison-profile.ts';
import * as dates from '../lib/benchmark-data.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deps={portfolioAssets,portfolioAssetKey,portfolioAssetCurrency,...dates};
const {convertHistorical,compareInvestments,percentagePerformance}=new Function(...Object.keys(deps),compile('lib/investment-comparison.ts')+';return {convertHistorical,compareInvestments,percentagePerformance};')(...Object.values(deps));
const performance=new Function('historyEventLabel','expenses','liabilities','isInvestmentRecord','convertHistorical','shiftDay',compile('lib/actual-investment-performance.ts')+';return actualInvestmentPerformance;')(historyEventLabel,expenses,liabilities,isInvestmentRecord,convertHistorical,dates.shiftDay);
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
 assert.equal(last.invested,510);assert.equal(last.contributed,-90);near(last.actual,90/510*100);
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
 const chart=fs.readFileSync('components/investment-value-chart.tsx','utf8');
 assert.ok(chart.includes('tickFormatter={money}'));
 assert.ok(chart.includes('money(Number(amount))'));
 assert.ok(source.includes("t('Ahead / behind benchmark')"));
 assert.ok(source.includes('):start;'));
 assert.ok(!source.includes('percentagePerformance'));
 assert.ok(!source.includes('tickFormatter={percent}'));
 assert.ok(!source.includes('percentage points'));
});

test('only the 7500 mortgage payment funds alternatives; salary, leisure and charity are excluded',()=>{
 const mortgage={id:'mortgage',kind:'Mortgage',currency:'USD'};
 const payment={...event('mortgage_payment','2026-09-01',7500,92500,'mortgage'),principal:7000,interest:500};
 const personal=[{id:'pay',kind:'Salary',amount:10000},{id:'fun',kind:'Living expense',amount:2000},{id:'charity',kind:'Charity',amount:500}].map(row=>({...row,currency:'USD',date:'2026-09-01',frequency:'Once'}));
 const result=performance([mortgage],[event('baseline','2026-08-01',0,100000,'mortgage'),payment],[],[],'USD','2026-09-02',personal);
 assert.equal(result.start,'2026-09-01');assert.deepEqual(result.flows,[{date:'2026-09-01',amount:7500}]);assert.equal(result.points.at(-1).amount,7000);assert.equal(result.missing,false);
 const data={start:result.start,end:'2026-09-02',fx:[{date:'2026-09-01',rates:{USD:1,UZS:12000}}],prices:{BTC:[{date:'2026-09-01',close:100},{date:'2026-09-02',close:110}],SPY:[{date:'2026-09-01',close:200},{date:'2026-09-02',close:202}]},errors:{}};
 const last=compareInvestments(0,result.flows,result.points,data,'USD',true).points.at(-1);
 near(last.BTC,8250);near(last.SPY,7575);near(last.depositUSD,7500*1.08**(1/365));near(last.depositUZS,7500*1.21**(1/365));assert.equal(last.actual-last.contributed,-500);
});
test('6000 game club, 2000 solar and 2000 cafe share dated capital; later value increases are gains',()=>{
 const rs=['club','solar','cafe'].map(id=>({id,kind:'Business',currency:'USD'}));
 const ev=[event('contribution','2026-09-01',6000,6000,'club'),event('contribution','2026-09-02',2000,2000,'solar'),event('contribution','2026-09-03',2000,2000,'cafe'),event('valuation','2026-09-04',0,8000,'club')];
 const live=rs.map(row=>({...row,balance:row.id==='club'?8000:2000}));
 const result=performance(rs,ev,live,[],'USD','2026-09-05');
 assert.deepEqual(result.flows.map(row=>row.amount),[6000,2000,2000]);assert.equal(result.points[2].amount,10000);assert.equal(result.points[3].amount,12000);assert.equal(result.points[4].amount,12000);
 const subset=performance(rs.filter(row=>row.id==='solar'),ev,live,[],'USD','2026-09-05');assert.deepEqual(subset.flows,[{date:'2026-09-02',amount:2000}]);
});
test('business spending funds alternatives once, preserves currency and ownership, and excludes plans and unrelated owners',()=>{
 const rows=[{id:'pc',business_id:'cafe',kind:'Other expense',amount:150000000,currency:'UZS',date:'2026-09-02',frequency:'Once'},
 {id:'copy',business_id:'cafe',kind:'Other expense',amount:100,currency:'USD',date:'2026-09-02',frequency:'Once',history_event_id:'cost'},
 {id:'plan',business_id:'cafe',kind:'Other expense',amount:999,currency:'USD',date:'2026-09-02',frequency:'Monthly'},
 {id:'other',business_id:'other-owner',kind:'Other expense',amount:999,currency:'USD',date:'2026-09-02',frequency:'Once'},
 {id:'income',business_id:'cafe',kind:'Business income',amount:50,currency:'USD',date:'2026-09-03',frequency:'Once'}];
 const result=performance(records,[opening,event('expense','2026-09-02',100,null),{...event('valuation','2026-09-03',0,30800),ownership_percentage:50}],[{...holding,balance:15400}],[{date:'2026-09-01',rates:{USD:1,UZS:10000}}],'USD','2026-09-03',rows);
 assert.equal(result.flows.reduce((sum,row)=>sum+row.amount,0),15500);assert.equal(result.points.at(-1).amount,15450);assert.equal(result.distributed,50);
 const bad=performance(records,[opening],[holding],[],'USD','2026-09-03',rows);assert.equal(bad.missing,true);
});
test('debt repayments retain principal at dated FX, without counting borrowing or corrections as investment',()=>{
 const debt={id:'debt',kind:'Debt',currency:'UZS'};
 const ev=[event('contribution','2026-09-01',1000000,1000000,'debt'),event('withdrawal','2026-09-02',500000,500000,'debt'),event('valuation','2026-09-03',0,1,'debt')];
 const fx=[{date:'2026-09-01',rates:{USD:1,UZS:10000}},{date:'2026-09-03',rates:{USD:1,UZS:20000}}];
 const result=performance([debt],ev,[],fx,'USD','2026-09-03');assert.equal(result.start,'2026-09-02');assert.deepEqual(result.flows,[{date:'2026-09-02',amount:50}]);assert.equal(result.points.at(-1).amount,25);
 const malformed=performance([{...debt,kind:'Mortgage'}],[{...event('mortgage_payment','2026-09-02',100,null,'debt'),principal:200,interest:0}],[],fx,'USD','2026-09-03');assert.equal(malformed.missing,true);
});
test('cash-only purchase followed by a starting valuation does not duplicate opening capital',()=>{
 const result=performance(records,[event('contribution','2026-09-01',400,null),event('baseline','2026-09-02',0,450)],[{...holding,balance:450}],[],'USD','2026-09-03');
 assert.deepEqual(result.flows,[{date:'2026-09-01',amount:400}]);assert.equal(result.points.at(-1).amount,450);assert.equal(result.points[0].amount,null);assert.equal(result.missing,false);
});

test('cash requires explicit investment opt-in and keeps exact values',()=>{
 const cash={id:'cash',kind:'Cash',currency:'USD'};
 const history=[event('baseline','2026-01-01',0,123.456,'cash')];
 const fx=[];
 assert.equal(isInvestmentRecord(cash),false);
 assert.equal(isInvestmentRecord({...cash,is_investment:false}),false);
 assert.equal(isInvestmentRecord({...cash,is_investment:true}),true);
 const result=performance([{...cash,is_investment:true}],history,[{...cash,balance:123.456}],fx,'USD','2026-01-01');
 assert.equal(result.flows[0].amount,123.456);
 assert.equal(performance([cash],history,[],fx,'USD','2026-01-01').flows.length,0);
});
test('principal repayment increases investment value but interest does not',()=>{
 const mortgage={id:'home-loan',kind:'Mortgage',currency:'USD'};
 const payment={...event('mortgage_payment','2026-09-02',500,9500,'home-loan'),principal:400,interest:100};
 const result=performance([...records,mortgage],[opening,payment],[holding],[],'USD','2026-09-03');
 assert.deepEqual(result.points.map(p=>p.amount),[400,800,800]);
 assert.equal(result.flows.at(-1).amount,500);
});
test('income credited to investment cash is not counted twice in value',()=>{
 const cash={id:'reserve',kind:'Cash',currency:'USD',is_investment:true};
 const receipt={...event('income','2026-09-02',50,null),account_link:{account_id:'reserve',amount:50}};
 const result=performance([...records,cash],[opening,event('baseline','2026-09-01',0,100,'reserve'),receipt,event('contribution','2026-09-02',50,150,'reserve')],[holding,{...cash,balance:150}],[],'USD','2026-09-02');
 assert.equal(result.points.at(-1).amount,550);assert.equal(result.distributed,0);assert.equal(result.invested,500);assert.equal(result.flows.reduce((sum,flow)=>sum+flow.amount,0),500);
});
test('repayment from included investment cash transfers value instead of creating profit',()=>{
 const cash={id:'reserve',kind:'Cash',currency:'USD',is_investment:true};
 const result=performance([...records,cash],[opening,event('baseline','2026-09-01',0,1000,'reserve'),event('withdrawal','2026-09-02',200,800,'reserve'),event('withdrawal','2026-09-02',200,300,'loan')],[holding,{...cash,balance:800}],[],'USD','2026-09-02');
 assert.deepEqual(result.points.map(point=>point.amount),[1400,1400]);
 assert.equal(result.flows.reduce((sum,flow)=>sum+flow.amount,0),1400);
});
test('early repayment cannot masquerade as a complete portfolio before existing asset history',()=>{
 const paid=event('withdrawal','2026-09-01',469,1000,'loan');
 const snapshot=event('baseline','2026-09-03',0,400);
 const result=performance(records,[paid,snapshot],[holding],[],'USD','2026-09-04');
 assert.deepEqual(result.points.map(p=>p.amount),[null,null,869,869]);
 assert.equal(result.missing,false);
});
test('explicit opening date puts the known starting balance before a repayment without mutating events',()=>{
 const snapshot=event('baseline','2026-09-03',0,400);
 const result=performance([{...records[0],opened_on:'2026-08-31'},records[2]],[event('withdrawal','2026-09-01',469,1000,'loan'),snapshot],[holding],[],'USD','2026-09-03');
 assert.deepEqual(result.points.map(p=>p.amount),[400,869,869,869]);
 assert.equal(snapshot.occurred_on,'2026-09-03');
});
test('known later purchase does not block earlier complete holdings',()=>{
 const later={id:'later',kind:'Stock',currency:'USD'};
 const result=performance([...records,later],[opening,event('contribution','2026-09-03',100,100,'later')],[holding,{...later,balance:100}],[],'USD','2026-09-03');
 assert.deepEqual(result.points.map(p=>p.amount),[400,400,500]);
});
test('a later top-up cannot turn unknown earlier asset history into a zero balance',()=>{
 const result=performance(records,[event('withdrawal','2026-09-01',50,100,'loan'),event('baseline','2026-09-02',0,400),event('contribution','2026-09-03',100,500)],[{...holding,balance:500}],[],'USD','2026-09-03');
 assert.deepEqual(result.points.map(point=>point.amount),[null,450,550]);
});
test('audit explains rising portfolio value alongside interest costs and reconciles every total',()=>{
 const mortgage={id:'mortgage',name:'Home mortgage',kind:'Mortgage',currency:'USD'};
 const result=performance([{...records[0],name:'Business'},mortgage],[opening,event('valuation','2026-09-02',0,450),{...event('mortgage_payment','2026-09-02',500,9000,'mortgage'),principal:400,interest:100}],[{...holding,balance:450}],[],'USD','2026-09-02');
 const sum=key=>result.breakdown.reduce((total,row)=>total+row[key],0);
 near(sum('value'),850);near(sum('funding'),900);near(sum('result'),-50);
 near(result.points.at(-1).amount-result.points[0].amount,450);
 const debt=result.breakdown.find(row=>row.id==='mortgage');
 assert.equal(debt.principalPaid,400);assert.equal(debt.interestPaid,100);assert.equal(debt.result,-100);
 assert.deepEqual(debt.transactions.map(row=>[row.date,row.original,row.currency,row.funding]),[['2026-09-02',500,'USD',500]]);
});
test('audit preserves historical FX and separates principal currency changes from interest',()=>{
 const mortgage={id:'mortgage',name:'Mortgage',kind:'Mortgage',currency:'UZS'};
 const payment={...event('mortgage_payment','2026-09-01',1000000,5000000,'mortgage'),principal:800000,interest:200000};
 const result=performance([mortgage],[payment],[],[{date:'2026-09-01',rates:{UZS:10000}},{date:'2026-09-02',rates:{UZS:20000}}],'USD','2026-09-02');
 const row=result.breakdown[0];
 assert.equal(row.funding,100);assert.equal(row.value,40);assert.equal(row.interestPaid,20);assert.equal(row.principalPaid,80);assert.equal(row.result,-60);
 assert.equal(row.transactions[0].original,1000000);assert.equal(row.transactions[0].currency,'UZS');
});
test('audit matches net funding when received income moves into included cash',()=>{
 const cash={id:'reserve',kind:'Cash',currency:'USD',is_investment:true};
 const receipt={...event('income','2026-09-02',50,null),account_link:{account_id:'reserve',amount:50}};
 const result=performance([...records,cash],[opening,event('baseline','2026-09-01',0,100,'reserve'),receipt,event('contribution','2026-09-02',50,150,'reserve')],[holding,{...cash,balance:150}],[],'USD','2026-09-02');
 near(result.breakdown.reduce((sum,row)=>sum+row.funding,0),500);
 near(result.breakdown.reduce((sum,row)=>sum+row.value,0),550);
 near(result.breakdown.reduce((sum,row)=>sum+row.result,0),50);
});
