import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {getNetWorthComparison}=loadTS('lib/net-worth-comparison.ts');
const {incomeBenchmarkFunding}=loadTS('lib/income-benchmarks.ts');
const data={start:'2026-09-17',end:'2026-09-20',prices:{BTC:[{date:'2026-09-17',close:100},{date:'2026-09-18',close:200},{date:'2026-09-19',close:200},{date:'2026-09-20',close:300}],SPY:[{date:'2026-09-17',close:10},{date:'2026-09-18',close:20},{date:'2026-09-19',close:20},{date:'2026-09-20',close:30}]},fx:[{date:'2026-09-17',rates:{UZS:12000}}],errors:{}};
const event=(date,type,amount,balance)=>({id:date,record_id:'business',occurred_on:date,created_at:date,event_type:type,amount,balance,ownership_percentage:50,principal:0,interest:0});
const receipt=(id,kind,amount,date='2026-09-18',extra={})=>({id,name:id,kind,amount,date,currency:'USD',frequency:'Once',...extra});
const input={records:[{id:'business',name:'Cafe',kind:'Business',currency:'USD',amount:250,quantity:1,ownership_percentage:50},{id:'cash',kind:'Cash',currency:'USD',amount:9999,quantity:1}],events:[event('2026-09-17','income',100,null),event('2026-09-18','contribution',200,300),event('2026-09-19','withdrawal',100,200)],cashflows:[receipt('salary','Salary',200)],market:{rates:{USD:1,EUR:.9,UZS:13000},quotes:{},fx:null},currency:'USD',today:'2026-09-20'};
const points=[{date:'2026-09-17',net:10099},{date:'2026-09-18',net:10100},{date:'2026-09-19',net:10200},{date:'2026-09-20',net:10249}];
test('income receipts buy each benchmark once; spending, mortgage payoff and reinvestment do not fund it again',()=>{
 const result=getNetWorthComparison(points,data,input);
 // Personal business income buys 1 BTC, salary buys 1 BTC. No sale on withdrawal.
 assert.deepEqual(result.points.map(p=>p.BTC),[100,400,400,600]);
 assert.deepEqual(result.points.map(p=>p.SPY),[100,400,400,600]);
 assert.deepEqual(result.points.map(p=>p.contributed),[100,300,300,300]);
 assert.deepEqual(result.points.map(p=>p.actual),points.map(p=>p.net));
 const extra={...input,events:[...input.events,event('2026-09-20','mortgage_payment',1000,0)],cashflows:[...input.cashflows,receipt('watch','Other expense',500),receipt('car','Other expense',20000),receipt('mortgage','Other expense',1010,'2026-09-19',{mortgage_payment_id:'pay'})]};
 assert.deepEqual(getNetWorthComparison(points,data,extra),result);
});
test('all income sources, linked tracker copies and repeated rows reconcile without double counting',()=>{
 const rows=[receipt('salary','Salary',200),receipt('rent','Rent income',20),receipt('business','Business income',30),receipt('other','Other income',40),receipt('copy','Other income',100,'2026-09-17',{history_event_id:'2026-09-17'})];
 const funding=incomeBenchmarkFunding({...input,events:[...input.events,input.events[0]],cashflows:[...rows,...rows]},data);
 assert.equal(funding.flows.reduce((n,f)=>n+f.amount,0),390);
 assert.equal(funding.receipts.length,5);
});
test('recurring estimates and future receipts do not buy benchmarks; no receipts means zero funding',()=>{
 const empty={...input,events:input.events.filter(e=>e.event_type!=='income'),cashflows:[receipt('scheduled','Salary',999,'2026-09-17',{frequency:'Monthly'}),receipt('future','Salary',999,'2026-09-21')]};
 const result=getNetWorthComparison(points,data,empty);
 assert.equal(result.netCashFlow,0);assert.ok(result.points.every(p=>p.BTC===0));
});
test('zooming retains earlier purchased units and display currency does not change purchases',()=>{
 const all=getNetWorthComparison(points,data,input),zoom=getNetWorthComparison(points.slice(2),data,input);
 assert.deepEqual(zoom.points,all.points.slice(2));
 const eur=getNetWorthComparison(points.map(p=>({...p,net:p.net*.9})),data,{...input,currency:'EUR'});
 for(let i=0;i<points.length;i++)for(const key of ['actual','BTC','SPY','contributed'])assert.ok(Math.abs(eur.points[i][key]-all.points[i][key]*.9)<1e-8);
});
test('income uses receipt-date FX and preserves precision, with missing rates reported instead of silently dropping receipts',()=>{
 const foreign={...input,events:[],cashflows:[receipt('foreign','Salary',12000.12345678,'2026-09-17',{currency:'UZS'})]};
 const result=getNetWorthComparison(points,data,foreign);
 assert.ok(Math.abs(result.netCashFlow-12000.12345678/12000)<1e-12);
 assert.ok(Math.abs(result.points.at(-1).BTC-result.netCashFlow*3)<1e-12);
 assert.equal(getNetWorthComparison(points,{...data,fx:[]},foreign),null);
 assert.equal(getNetWorthComparison(points,data,{...input,currency:'GBP'}),null);
 assert.equal(getNetWorthComparison(points,{...data,start:'2026-09-18'},input),null);
});
test('missing market quotes stay unavailable and owner inputs remain isolated',()=>{
 const missing=getNetWorthComparison(points,{...data,prices:{BTC:[]}},input);
 assert.equal(missing.points.at(-1).BTC,null);assert.ok(missing.unavailable.includes('BTC'));
 assert.equal(getNetWorthComparison([],data,input),null);
 const other={...input,records:[],events:[],cashflows:[receipt('other-owner','Salary',10,'2026-09-17')]};
 assert.equal(getNetWorthComparison(points,data,other).netCashFlow,10);
 assert.equal(getNetWorthComparison(points,data,input).netCashFlow,300);
});

test('benchmarks show daily market history between sparse actual balance observations',()=>{
 const result=getNetWorthComparison([points[0],points[3]],data,input);
 assert.deepEqual(result.points.map(p=>p.BTC),[100,400,400,600]);
 assert.deepEqual(result.points.map(p=>p.actual),[10099,10099,10099,10249]);
});

test('opening net worth funds benchmarks once, then later income invests immediately without resetting on zoom',()=>{
 const seeded={...input,openingNetWorth:{date:'2026-09-17',amount:1000}};
 const result=getNetWorthComparison(points,data,seeded);
 // The same-day business receipt is already inside the opening balance.
 assert.deepEqual(result.points.map(p=>p.BTC),[1000,2200,2200,3300]);
 assert.deepEqual(result.points.map(p=>p.contributed),[1000,1200,1200,1200]);
 assert.deepEqual(getNetWorthComparison(points.slice(2),data,seeded).points,result.points.slice(2));
 const eur=getNetWorthComparison(points.map(p=>({...p,net:p.net*.9})),data,{...seeded,currency:'EUR',openingNetWorth:{date:'2026-09-17',amount:900}});
 assert.equal(eur.points[0].BTC,900);assert.equal(eur.points.at(-1).BTC,2970);
 assert.equal(getNetWorthComparison(points,data,{...seeded,openingNetWorth:{date:'2026-09-17',amount:-1}}),null);
});
