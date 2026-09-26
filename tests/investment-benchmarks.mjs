import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {investmentDecisionComparison}=loadTS('lib/investment-benchmarks.ts');
const record=(id,kind,amount=0)=>({id,name:id,kind,currency:'USD',amount,quantity:1,ownership_percentage:100,rate:0});
const event=(id,record_id,date,event_type,amount,balance,extra={})=>({id,record_id,occurred_on:date,created_at:date+'T12:00:01Z',event_type,amount,balance,ownership_percentage:100,notes:'',...extra});
const data={start:'2026-09-01',end:'2026-09-04',fx:[],prices:{BTC:[1,2,3,4].map((n)=>({date:'2026-09-0'+n,close:n*100}))},errors:{}};
const base={records:[record('cash','Cash',9000),record('asset','Business',1000)],events:[event('p','asset','2026-09-01','contribution',1000,1000,{account_link:{account_id:'cash',amount:-1000}})],cashflows:[],market:{quotes:{},rates:{USD:1}},currency:'USD',today:'2026-09-04',method:{mode:'purchases',date:'2026-09-01'}};
test('original purchase funds benchmark on its date; salaries, savings and household spending do not',()=>{
 const result=investmentDecisionComparison({...base,cashflows:[{id:'salary',kind:'Salary',frequency:'Once',date:'2026-09-02',amount:5000,currency:'USD',account_id:'cash'},{id:'food',kind:'Living expense',frequency:'Once',date:'2026-09-03',amount:200,currency:'USD',account_id:'cash'}]},data);
 assert.equal(result.result.points.at(-1).BTC,4000);assert.equal(result.result.points.at(-1).contributed,1000);assert.equal(result.result.points.at(-1).actual,1000);
});
test('an unrelated purchase from the same cash account is not assumed to reuse sale proceeds',()=>{
 const events=[...base.events,event('sale','asset','2026-09-02','withdrawal',1200,0,{account_link:{account_id:'cash',amount:1200}}),event('rebuy','asset','2026-09-03','contribution',1500,1500,{account_link:{account_id:'cash',amount:-1500}})];
 const result=investmentDecisionComparison({...base,records:[record('cash','Cash'),record('asset','Business',1500)],events},data);
 assert.deepEqual(result.result.points.map(p=>p.contributed),[1000,1000,2500,2500]);
 assert.equal(result.details.at(-1).reused,0);assert.equal(result.result.points.at(-1).actual,2700);
});
test('personal spending does not determine funding provenance',()=>{
 const events=[...base.events,event('sale','asset','2026-09-02','withdrawal',1000,0,{account_link:{account_id:'cash',amount:1000}}),event('rebuy','asset','2026-09-04','contribution',1000,1000,{account_link:{account_id:'cash',amount:-1000}})];
 const result=investmentDecisionComparison({...base,events,cashflows:[{id:'spend',kind:'Living expense',frequency:'Once',date:'2026-09-03',amount:400,currency:'USD',account_id:'cash'}]},data);
 assert.equal(result.result.points.at(-1).contributed,2000);assert.equal(result.details.at(-1).reused,0);
});
test('chosen date seeds recorded investment values once, excludes cash and ignores earlier income and purchase cost',()=>{
 const result=investmentDecisionComparison({...base,method:{mode:'date',date:'2026-09-02'}},{...data,start:'2026-09-02',prices:{BTC:data.prices.BTC.filter(point=>point.date>='2026-09-02')}});
 assert.equal(result.result.points[0].BTC,1000);assert.equal(result.result.points.at(-1).BTC,2000);
 assert.equal(result.details[0].name,'Starting investment value');assert.equal(result.result.points[0].actual,1000);
});
test('missing original costs and absent chosen-date valuations do not invent capital',()=>{
 const observed={...base,events:[event('b','asset','2026-09-01','baseline',0,1000)]};
 assert.deepEqual(investmentDecisionComparison(observed,data).missingPurchases,['asset']);
 assert.ok(investmentDecisionComparison({...observed,method:{mode:'date',date:'2026-09-02'}},data).result);
 assert.equal(investmentDecisionComparison({...base,events:[],method:{mode:'date',date:'2026-09-02'}},data),null);
});
test('linked deposit to crypto movement has zero new funding and each movement leg is excluded once',()=>{
 const move={id:'move',kind:'buy',source_id:'deposit',target_id:'crypto',sent:1000,received:1,source_value:1000,target_value:1000,fee:0,notes:'',occurred_on:'2026-09-02',created_at:'2026-09-02T12:00:00Z'};
 const input={...base,records:[record('cash','Cash'),record('deposit','Deposit',0),record('crypto','Crypto',1000)],events:[event('open','deposit','2026-09-01','contribution',1000,1000),event('empty','crypto','2026-09-01','baseline',0,0),event('out','deposit','2026-09-02','withdrawal',1000,0),event('in','crypto','2026-09-02','contribution',1000,1000)],movements:[move]};
 const result=investmentDecisionComparison(input,data);
 assert.equal(result.result.points.at(-1).contributed,1000);assert.equal(result.details.at(-1).reused,1000);
 assert.equal(investmentDecisionComparison({...input,events:input.events.slice(0,-1)},data),null);
});
test('mortgage principal counts at precise payment amount while interest does not fund benchmarks',()=>{
 const input={...base,records:[...base.records,record('mortgage','Mortgage',4000)],events:[...base.events,event('pay','mortgage','2026-09-02','mortgage_payment',125.75,4000,{principal:100.125,interest:25.625,account_link:{account_id:'cash',amount:-125.75}})]};
 const result=investmentDecisionComparison(input,data);
 assert.equal(result.result.points.at(-1).contributed,1100.125);
 assert.equal(result.result.points.at(-1).actual,1100.125);
});
test('buy fees are excluded from fresh capital without rounding purchase precision',()=>{
 const move={id:'m',kind:'buy',source_id:'cash',target_id:'asset',sent:100.125,received:1,source_value:100.125,target_value:100.125,fee:2.025,notes:'',occurred_on:'2026-09-01'};
 const input={...base,records:[record('cash','Cash'),record('asset','Stock',100.125)],events:[event('out','cash','2026-09-01','withdrawal',100.125,900),event('in','asset','2026-09-01','contribution',100.125,100.125)],movements:[move]};
 const result=investmentDecisionComparison(input,data);
 assert.ok(Math.abs(result.result.points.at(-1).contributed-98.1)<1e-10);
});
test('a foreign-currency purchase needs historical exchange rates and uses its dated rate',()=>{
 const input={...base,records:[record('cash','Cash'),{...record('asset','Business',1000),currency:'EUR'}]};
 assert.equal(investmentDecisionComparison(input,data),null);
 const fx=[{date:'2026-09-01',rates:{EUR:2}},{date:'2026-09-02',rates:{EUR:4}}];
 const result=investmentDecisionComparison(input,{...data,fx});
 assert.equal(result.result.points.at(-1).contributed,500);
 assert.equal(result.result.points.at(-1).BTC,2000);
});
test('foreign settlement accounts do not imply reuse for later purchases',()=>{
 const input={...base,records:[{...record('cash','Cash'),currency:'EUR'},record('asset','Business',1000)],events:[...base.events,event('sale','asset','2026-09-02','withdrawal',1000,0,{account_link:{account_id:'cash',amount:2000}}),event('rebuy','asset','2026-09-04','contribution',1000,1000,{account_link:{account_id:'cash',amount:-2000}})],cashflows:[{id:'spend',kind:'Living expense',frequency:'Once',date:'2026-09-03',amount:400,currency:'USD',account_id:'cash'}]};
 const result=investmentDecisionComparison(input,{...data,fx:[{date:'2026-09-01',rates:{EUR:2}}]});
 assert.equal(result.result.points.at(-1).actual,2000);
 assert.equal(result.result.points.at(-1).contributed,2000);
});
test('legacy observed holdings select a usable valuation start without fabricating purchases',()=>{
 const {investmentComparisonCoverage}=loadTS('lib/investment-benchmarks.ts');
 const observed={...base,events:[event('b','asset','2026-09-01','baseline',0,1000)]};
 const coverage=investmentComparisonCoverage(observed.records,observed.events,observed.today);
 assert.deepEqual(coverage,{missing:['asset'],start:'2026-09-01'});
 const comparison=investmentDecisionComparison({...observed,method:{mode:'date',date:coverage.start}},data);
 assert.equal(comparison.result.points.length,4);
 assert.equal(comparison.result.points[0].contributed,1000);
 assert.deepEqual(investmentComparisonCoverage(base.records,base.events,base.today),{missing:[],start:'2026-09-01'});
});
test('mortgage principal remains fresh funding after income or sale proceeds reach the same cash account',()=>{
 for(const mode of ['purchases','date'])for(const type of ['income','withdrawal']){
  const input={...base,method:{mode,date:'2026-09-01'},records:[...base.records,record('mortgage','Mortgage',4000)],events:[...base.events,event('receipt','asset','2026-09-02',type,1000,type==='withdrawal'?0:1000,{account_link:{account_id:'cash',amount:1000}}),event('pay','mortgage','2026-09-03','mortgage_payment',450,4000,{principal:428,interest:22,account_link:{account_id:'cash',amount:-450}})]};
  const result=investmentDecisionComparison(input,data);
  assert.equal(result.details.at(-1).amount,428);assert.equal(result.details.at(-1).principal,428);assert.equal(result.details.at(-1).reused,0);
  assert.equal(result.result.points.at(-1).contributed,1428);
 }
});
const {benchmarkExpenseFunding}=loadTS('lib/investment-benchmarks.ts');
const spend=(id,date,amount,extra={})=>({id,name:id,kind:'Living expense',frequency:'Once',date,amount,currency:'USD',account_id:'cash',...extra});
const including={...base.method,scope:'expenses'};
test('excluding expenses is the default and ignores every expense',()=>{
 for(const method of [base.method,{...base.method,scope:'investments'}]){
  const result=investmentDecisionComparison({...base,method,cashflows:[spend('watch','2026-09-03',200)]},data);
  assert.deepEqual(result.result.points.map(p=>p.contributed),[1000,1000,1000,1000]);
  assert.ok(result.details.every(row=>row.source!=='expense'));
 }
});
test('including expenses invests spending on its date without adding it to actual value',()=>{
 const result=investmentDecisionComparison({...base,method:including,cashflows:[spend('watch','2026-09-03',300),{...spend('salary','2026-09-02',5000),kind:'Salary'}]},data);
 assert.deepEqual(result.result.points.map(p=>p.contributed),[1000,1000,1300,1300]);
 assert.deepEqual(result.result.points.map(p=>p.actual),[1000,1000,1000,1000]);
 // 10 BTC at 100 plus 1 BTC at 300, valued at 400.
 assert.equal(result.result.points.at(-1).BTC,4400);
 assert.deepEqual(result.details.find(row=>row.source==='expense'),{id:'expense:watch',date:'2026-09-03',name:'watch',amount:300,currency:'USD',reused:0,source:'expense',kind:'Living expense'});
});
test('mortgage copies fund only interest while principal still funds once through the payment',()=>{
 const input={...base,method:including,records:[...base.records,record('mortgage','Mortgage',4000)],events:[...base.events,event('pay','mortgage','2026-09-02','mortgage_payment',350,4000,{principal:300,interest:50,account_link:{account_id:'cash',amount:-350}})],cashflows:[{...spend('copy','2026-09-02',350),kind:'Other expense',mortgage_payment_id:'pay',payment_principal:300,payment_interest:50}]};
 const result=investmentDecisionComparison(input,data);
 assert.equal(result.result.points.at(-1).contributed,1350);
 assert.equal(result.result.points.at(-1).actual,1300);
});
test('tracker, fee, interest, charity and business spending each count once; plans, future and zero rows do not',()=>{
 const rows=benchmarkExpenseFunding([
  {...spend('tracker','2026-09-02',40),kind:'Other expense',history_event_id:'tracker'},
  {...spend('fee','2026-09-02',2),kind:'Other expense',movement_id:'m'},
  {...spend('interest','2026-09-02',9),kind:'Other expense',operation_id:'op'},
  {...spend('gift','2026-09-02',5),kind:'Charity'},
  {...spend('supplies','2026-09-02',7),kind:'Rent expense',business_id:'asset'},
  {...spend('plan','2026-09-02',100),frequency:'Monthly'},
  spend('future','2026-09-05',100),spend('zero','2026-09-02',0),spend('undated','',10),
  {...spend('income','2026-09-02',100),kind:'Other income'},
 ],'2026-09-04');
 assert.deepEqual(rows.map(row=>row.id).sort(),['expense:fee','expense:gift','expense:interest','expense:supplies','expense:tracker']);
});
test('purchase-based start moves back to earlier spending; a chosen start date excludes earlier and same-day spending',()=>{
 const input={...base,events:[event('p','asset','2026-09-02','contribution',1000,1000)],cashflows:[spend('early','2026-09-01',100),spend('same','2026-09-02',50),spend('later','2026-09-03',25)]};
 const purchases=investmentDecisionComparison({...input,method:{mode:'purchases',date:'2026-09-02',scope:'expenses'}},data);
 assert.equal(purchases.result.points[0].date,'2026-09-01');
 assert.deepEqual(purchases.result.points.map(p=>p.contributed),[100,1150,1175,1175]);
 const dated=investmentDecisionComparison({...input,method:{mode:'date',date:'2026-09-02',scope:'expenses'}},{...data,start:'2026-09-02',prices:{BTC:data.prices.BTC.slice(1)}});
 assert.deepEqual(dated.result.points.map(p=>p.contributed),[1000,1025,1025]);
});
test('foreign-currency spending uses its dated exchange rate and missing rates pause the comparison',()=>{
 const input={...base,method:including,cashflows:[{...spend('trip','2026-09-02',400),currency:'EUR'}]};
 assert.equal(investmentDecisionComparison(input,data),null);
 const result=investmentDecisionComparison(input,{...data,fx:[{date:'2026-09-01',rates:{EUR:2}},{date:'2026-09-02',rates:{EUR:4}}]});
 assert.equal(result.result.points.at(-1).contributed,1100);
});
