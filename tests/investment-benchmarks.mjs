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

const {investmentComparisonCoverage:coverageOf,purchaseComparisonStart,accountRepaymentEvents,investmentActivity}=loadTS('lib/investment-benchmarks.ts');
test('a security moved between two holdings is neither sale proceeds nor a new purchase',()=>{
 // Today's point values each holding from its current record: all four units are now at the second broker.
 const stock=(id,quantity)=>({...record(id,'Stock',250),name:'SPY',quantity});
 const buy={id:'buy',kind:'buy',source_id:'cash',target_id:'broker-a',sent:1000,received:4,source_value:1000,target_value:1000,fee:0,notes:'',occurred_on:'2026-09-01',created_at:'2026-09-01T12:00:00Z'};
 const events=[event('a0','broker-a','2026-09-01','baseline',0,0,{created_at:'2026-09-01T08:00:00Z'}),event('b0','broker-b','2026-09-01','baseline',0,0,{created_at:'2026-09-01T08:00:00Z'}),event('out','cash','2026-09-01','withdrawal',1000,0),event('in','broker-a','2026-09-01','contribution',1000,1000),
  event('move-out','broker-a','2026-09-02','withdrawal',1000,0,{notes:'Security transfer. New broker'}),event('move-in','broker-b','2026-09-02','contribution',1000,1000,{notes:'Security transfer. New broker'})];
 const input={...base,records:[record('cash','Cash'),stock('broker-a',0),stock('broker-b',4)],events,movements:[buy],market:{quotes:{},rates:{USD:1}}};
 const result=investmentDecisionComparison(input,data);
 assert.deepEqual(result.result.points.map(p=>p.contributed),[1000,1000,1000,1000]);
 assert.deepEqual(result.result.points.map(p=>p.actual),[1000,1000,1000,1000]);
 assert.deepEqual(result.details.map(row=>row.id),['buy']);
 // A sale and an unrelated purchase on the same day are still a sale and a purchase.
 const unrelated=investmentDecisionComparison({...input,events:events.map(row=>row.id==='move-in'?{...row,notes:'Bought more'}:row)},data);
 assert.equal(unrelated.result.points.at(-1).contributed,2000);assert.equal(unrelated.result.points.at(-1).actual,2000);
});
test('recording the purchase of a holding that was added with a value keeps the comparison running',()=>{
 const older=[record('cash','Cash'),record('old','Business',700),record('asset','Business',5000)];
 const first=event('old-buy','old','2026-09-01','contribution',700,700);
 // The purchase is documented afterwards, dated before the first recorded value.
 const earlier={...base,records:older,events:[first,event('b','asset','2026-09-03','baseline',0,5000),event('p','asset','2026-09-02','contribution',4800,null,{account_link:{account_id:'cash',amount:-4800}})]};
 assert.deepEqual(coverageOf(earlier.records,earlier.events,earlier.today).missing,[]);
 const result=investmentDecisionComparison(earlier,data);
 assert.deepEqual(result.result.points.map(p=>p.contributed),[700,5500,5500,5500]);
 // Absent before the purchase, carried at cost until valued, then at its recorded value.
 assert.deepEqual(result.result.points.map(p=>p.actual),[700,5500,5700,5700]);
 const sameDay={...base,records:older,events:[first,event('b','asset','2026-09-03','baseline',0,5000,{created_at:'2026-09-03T08:00:00Z'}),event('p','asset','2026-09-03','contribution',5000,null,{account_link:{account_id:'cash',amount:-5000}})]};
 assert.deepEqual(investmentDecisionComparison(sameDay,data).result.points.map(p=>p.actual),[700,700,5700,5700]);
 });
test('a holding recorded without a purchase joins on its own date and leaves earlier history intact',()=>{
 const records=[record('cash','Cash'),record('old','Business',700),record('asset','Business',5000),{...record('lent','Money lent',300),currency:'USD'}];
 const events=[event('old-buy','old','2026-09-01','contribution',700,700),event('b','asset','2026-09-03','baseline',0,5000),event('l','lent','2026-09-04','baseline',0,300)];
 for(const method of [base.method,{mode:'date',date:'2026-09-01'}]){
  const result=investmentDecisionComparison({...base,records,events,method},data);
  assert.deepEqual(result.missingPurchases,['asset','lent']);
  // The recorded value is existing capital: benchmarks receive the same amount that day, so it is no gain.
  assert.deepEqual(result.result.points.map(p=>[p.date,p.actual,p.contributed]),[['2026-09-01',700,700],['2026-09-02',700,700],['2026-09-03',5700,5700],['2026-09-04',6000,6000]]);
  assert.deepEqual(result.details.filter(row=>row.source==='opening'),[{id:'opening:b',date:'2026-09-03',name:'asset',amount:5000,currency:'USD',reused:0,source:'opening'},{id:'opening:l',date:'2026-09-04',name:'lent',amount:300,currency:'USD',reused:0,source:'opening'}]);
  // 7 BTC at 100, 5000/300 at 300 and 300/400 at 400, valued at 400.
  assert.ok(Math.abs(result.result.points.at(-1).BTC-(7+5000/300+300/400)*400)<1e-9);
 }
 // A value recorded on or before a chosen start date is part of the opening value, counted once.
 const later=investmentDecisionComparison({...base,records,events,method:{mode:'date',date:'2026-09-03'}},{...data,start:'2026-09-03',prices:{BTC:data.prices.BTC.slice(2)}});
 assert.deepEqual(later.result.points.map(p=>[p.actual,p.contributed]),[[5700,5700],[6000,6000]]);
 // Your share of a part-owned business is what joins.
 const shared=investmentDecisionComparison({...base,records:[record('cash','Cash'),{...record('asset','Business',5000),ownership_percentage:40}],events:[event('b','asset','2026-09-02','baseline',0,5000,{ownership_percentage:40})]},data);
 assert.deepEqual(shared.result.points.map(p=>[p.actual,p.contributed]),[[2000,2000],[2000,2000],[2000,2000]]);
 // A holding with no history at all still cannot be valued.
 assert.equal(investmentDecisionComparison({...base,records,events:events.slice(0,2)},data),null);
});
test('the first value entered for a holding created empty is an observation, not a gain',()=>{
 const observed={...base,records:[record('cash','Cash'),record('asset','Business',10000)],events:[event('b','asset','2026-09-01','baseline',0,0),event('v','asset','2026-09-02','valuation',0,10000)]};
 assert.deepEqual(coverageOf(observed.records,observed.events,observed.today),{missing:['asset'],start:'2026-09-02'});
 const joined=investmentDecisionComparison(observed,data);
 assert.deepEqual(joined.missingPurchases,['asset']);
 assert.deepEqual(joined.result.points.map(p=>[p.date,p.actual,p.contributed]),[['2026-09-01',0,0],['2026-09-02',10000,10000],['2026-09-03',10000,10000],['2026-09-04',10000,10000]]);
 const seeded=investmentDecisionComparison({...observed,method:{mode:'date',date:'2026-09-02'}},{...data,start:'2026-09-02',prices:{BTC:data.prices.BTC.slice(1)}});
 assert.deepEqual(seeded.result.points.map(p=>[p.actual,p.contributed]),[[10000,10000],[10000,10000],[10000,10000]]);
 // Appreciation after a recorded purchase remains a gain and adds no funding.
 const grown=investmentDecisionComparison({...base,records:[record('cash','Cash'),record('asset','Business',1200)],events:[...base.events,event('v','asset','2026-09-03','valuation',0,1200)]},data);
 assert.deepEqual(grown.result.points.map(p=>[p.actual,p.contributed]),[[1000,1000],[1000,1000],[1200,1000],[1200,1000]]);
});
test('repayments saved from Accounts fund benchmarks and keep the money received',()=>{
 const records=[record('cash','Cash'),record('asset','Business',1000),record('loan','Loan',600),record('lent','Money lent',600)];
 const activity=[{id:'r1',action:'repayment',account_id:'cash',target_id:'loan',amount:400,occurred_on:'2026-09-02',notes:'',created_at:'2026-09-02T09:00:00Z'},{id:'r2',action:'repayment',account_id:'cash',target_id:'lent',amount:400,occurred_on:'2026-09-03',notes:'',created_at:'2026-09-03T09:00:00Z'},
  {id:'t',action:'transfer',account_id:'cash',target_id:'loan',amount:50,occurred_on:'2026-09-02',notes:''},{id:'z',action:'repayment',account_id:'cash',target_id:'loan',amount:0,occurred_on:'2026-09-02',notes:''},{id:'m',action:'repayment',account_id:'cash',target_id:'asset',amount:70,occurred_on:'2026-09-02',notes:''}];
 const repaid=accountRepaymentEvents(activity,records);
 assert.deepEqual(repaid.map(row=>[row.id,row.record_id,row.amount,row.balance,row.account_link.amount]),[['repayment:r1','loan',400,null,-400],['repayment:r2','lent',400,null,400]]);
 // The balances themselves arrive as the valuations written with each repayment.
 const events=[...base.events,event('loan0','loan','2026-09-01','baseline',0,1000),event('lent0','lent','2026-09-01','baseline',0,1000),event('loan1','loan','2026-09-02','valuation',0,600),event('lent1','lent','2026-09-03','valuation',0,600)];
 const method={mode:'date',date:'2026-09-01'};
 const without=investmentDecisionComparison({...base,records,events,method},data);
 assert.deepEqual(without.result.points.map(p=>[p.actual,p.contributed]),[[2000,2000],[2000,2000],[1600,2000],[1600,2000]]);
 const result=investmentDecisionComparison({...base,records,events:[...events,...repaid],method},data);
 assert.deepEqual(result.result.points.map(p=>[p.actual,p.contributed]),[[2000,2000],[2400,2400],[2400,2400],[2400,2400]]);
 assert.deepEqual(result.details.find(row=>row.id==='repayment:r1'),{id:'repayment:r1',date:'2026-09-02',name:'loan',amount:400,currency:'USD',reused:0,principal:400});
});
test('purchase-based comparisons open on the first investment activity, not on cash or debt history',()=>{
 const input={...base,records:[...base.records,record('mortgage','Mortgage',4000)],events:[event('cash0','cash','2026-08-20','baseline',0,9000),event('debt0','mortgage','2026-08-25','baseline',0,4000),event('p','asset','2026-09-02','contribution',1000,1000),event('pay','mortgage','2026-09-03','mortgage_payment',120,3900,{principal:100,interest:20})]};
 assert.equal(purchaseComparisonStart(input,'investments'),'2026-09-02');
 const result=investmentDecisionComparison(input,data);
 assert.equal(result.result.points[0].date,'2026-09-02');
 assert.deepEqual(result.result.points.map(p=>p.contributed),[1000,1100,1100]);
 // A repayment made before the first purchase is investment money and opens the comparison.
 const repaidFirst={...input,events:[...input.events,event('early','mortgage','2026-09-01','mortgage_payment',60,3950,{principal:50,interest:10})]};
 assert.equal(purchaseComparisonStart(repaidFirst,'investments'),'2026-09-01');
 assert.equal(purchaseComparisonStart({...input,cashflows:[spend('early','2026-09-01',5)]},'expenses'),'2026-09-01');
 assert.equal(purchaseComparisonStart({...input,cashflows:[spend('early','2026-09-01',5)]},'investments'),'2026-09-02');
 assert.equal(purchaseComparisonStart({...base,events:[]},'investments'),base.today);
});
test('cash marked for investments is never a holding, a funding source or proceeds',()=>{
 const broker={...record('broker','Cash',4000),is_investment:true};
 const input={...base,records:[broker,record('asset','Business',700)],events:[event('top','broker','2026-09-01','contribution',5000,5000),event('p','asset','2026-09-02','contribution',1000,1000,{account_link:{account_id:'broker',amount:-1000}}),event('sale','asset','2026-09-03','withdrawal',300,700,{account_link:{account_id:'broker',amount:300}})]};
 assert.deepEqual(investmentActivity(input.records,input.events,[],input.today).items.map(item=>[item.id,item.amount,item.reused,!!item.payout]),[['p',1000,0,false],['sale',300,0,true]]);
 const result=investmentDecisionComparison(input,data);
 assert.equal(result.result.points[0].date,'2026-09-02');
 assert.deepEqual(result.result.points.map(p=>[p.actual,p.contributed]),[[1000,1000],[1000,1000],[1000,1000]]);
});
const near=(actual,expected,label='')=>assert.ok(Math.abs(actual-expected)<1e-8,`${label} ${actual} != ${expected}`);
const dated={...data,fx:[{date:'2026-09-01',rates:{UZS:12000,EUR:.8}}]};
test('changing the display currency converts each day at that day\'s rate, never the hypothetical purchases',()=>{
 const market={quotes:{},rates:{USD:1,EUR:.9,UZS:12500}};
 const allocation={crypto:0,stock:0,deposit:20,business:20,cash:60,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:12};
 const usd=investmentDecisionComparison({...base,market},dated,allocation).result;
 assert.ok(usd.points.at(-1).PORTFOLIO>0);
 // Each day returns from USD at the rate it entered at (the feed's 12000 UZS, 0.8 EUR), not today's.
 for(const [currency,rate] of [['EUR',.8],['UZS',12000]]){
  const shown=investmentDecisionComparison({...base,market,currency},dated,allocation).result;
  assert.deepEqual(shown.points.map(point=>point.date),usd.points.map(point=>point.date));
  usd.points.forEach((point,index)=>{for(const key of ['actual','contributed','BTC','depositUZS','depositUSD','PORTFOLIO'])near(shown.points[index][key],point[key]*rate,currency+' '+key);});
 }
 // A display currency without a current rate pauses the comparison; no rate is inferred.
 assert.equal(investmentDecisionComparison({...base,market,currency:'GBP'},dated,allocation),null);
});
test('cash history and events of deleted records never change the comparison',()=>{
 const events=[...base.events,event('cash0','cash','2026-09-01','baseline',0,9000),event('removed','deleted','2026-09-01','baseline',0,99999),event('gone','deleted','2026-09-02','contribution',500,500)];
 assert.deepEqual(investmentDecisionComparison({...base,events},data),investmentDecisionComparison(base,data));
});
test('a purchase recorded without a new balance funds every benchmark on its date and leaves the recorded value unchanged',()=>{
 const share={ownership_percentage:50},addition=85.125;
 const records=[record('cash','Cash'),{...record('asset','Business',4000),...share}];
 const opening=event('open','asset','2026-09-01','contribution',2000,4000,share);
 const prices={...data.prices,SPY:[200,202,210,231].map((close,index)=>({date:'2026-09-0'+(index+1),close}))};
 const market={...dated,prices};
 const before=investmentDecisionComparison({...base,records,events:[opening]},market).result;
 const after=investmentDecisionComparison({...base,records,events:[opening,event('sheep','asset','2026-09-03','contribution',addition,null,share)]},market).result;
 // Your half of the recorded 4,000 is the value throughout.
 assert.deepEqual(after.points.map(point=>point.actual),[2000,2000,2000,2000]);
 assert.deepEqual(before.points.map(point=>point.actual),[2000,2000,2000,2000]);
 const added=key=>after.points.map((point,index)=>point[key]-before.points[index][key]);
 assert.deepEqual(added('contributed'),[0,0,addition,addition]);
 for(const [key,growth] of [['BTC',400/300],['SPY',231/210],['depositUSD',1.08**(1/365)],['depositUZS',1.21**(1/365)]]){
  const extra=added(key);
  near(extra[0],0,key);near(extra[1],0,key);near(extra[2],addition,key);near(extra[3],addition*growth,key);
 }
});
test('a benchmark without prices is unavailable while funding and the other benchmarks continue',()=>{
 const {result}=investmentDecisionComparison(base,{...data,prices:{BTC:[]}});
 assert.deepEqual(result.points.map(point=>point.BTC),[null,null,null,null]);
 assert.ok(result.unavailable.includes('BTC'));
 assert.deepEqual(result.points.map(point=>[point.actual,point.contributed]),[[1000,1000],[1000,1000],[1000,1000],[1000,1000]]);
 near(result.points.at(-1).depositUSD,1000*1.08**(3/365));
});
test('two purchases buy the benchmark at their own prices and the shortfall is a monetary amount',()=>{
 const events=[event('first','asset','2026-09-01','contribution',1000,1000),event('second','asset','2026-09-02','contribution',500,1500),event('value','asset','2026-09-03','valuation',0,1700)];
 const last=investmentDecisionComparison({...base,records:[record('cash','Cash'),record('asset','Business',1700)],events},data).result.points.at(-1);
 // 10 BTC at 100 plus 2.5 BTC at 200, valued at 400.
 assert.equal(last.BTC,5000);assert.equal(last.actual,1700);assert.equal(last.contributed,1500);
 assert.equal(last.actual-last.contributed,200);assert.equal(last.actual-last.BTC,-3300);
});
test('sale proceeds stay in the investment value, so a full sale keeps its realized profit',()=>{
 const events=[event('first','asset','2026-09-01','contribution',400,400),event('second','asset','2026-09-02','contribution',100,500),event('sale','asset','2026-09-03','withdrawal',600,0)];
 const {result}=investmentDecisionComparison({...base,records:[record('cash','Cash'),record('asset','Business',0)],events},data);
 assert.deepEqual(result.points.map(point=>[point.actual,point.contributed]),[[400,400],[500,500],[600,500],[600,500]]);
});
test('cash is an investment record only when explicitly marked for investments',()=>{
 const {isInvestmentRecord}=loadTS('lib/comparison-profile.ts');
 const cash=record('cash','Cash',123.456);
 assert.equal(isInvestmentRecord(cash),false);
 assert.equal(isInvestmentRecord({...cash,is_investment:false}),false);
 assert.equal(isInvestmentRecord({...cash,is_investment:true}),true);
 assert.equal(isInvestmentRecord(record('asset','Business')),true);
});
test('a UZS deposit benchmark shown in UZS only grows while the dollar rate swings',()=>{
 const fx=[['2026-09-01',12000],['2026-09-02',12600],['2026-09-03',11800],['2026-09-04',12300]].map(([date,uzs])=>({date,rates:{UZS:uzs}}));
 const uzs=(id,kind,amount)=>({...record(id,kind,amount),currency:'UZS'});
 const input={...base,records:[uzs('cash','Cash',0),uzs('asset','Business',12000000)],events:[event('p','asset','2026-09-01','contribution',12000000,12000000)],market:{quotes:{},rates:{USD:1,UZS:12300}},currency:'UZS'};
 const points=investmentDecisionComparison(input,{...data,fx}).result.points;
 const deposit=points.map(point=>point.depositUZS);
 for(let day=1;day<deposit.length;day++)assert.ok(deposit[day]>deposit[day-1],`day ${day}: ${deposit[day-1]} → ${deposit[day]}`);
 assert.ok(Math.abs(deposit.at(-1)-12000000*1.21**(3/365))<0.01);
 assert.ok(points.every(point=>Math.abs(point.actual-12000000)<0.01));
});
