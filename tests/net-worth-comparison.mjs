import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {getNetWorthComparison}=loadTS('lib/net-worth-comparison.ts');
const {getInvestmentComparison}=loadTS('lib/investment-portfolio.ts');
const data={start:'2026-09-17',end:'2026-09-20',prices:{BTC:[{date:'2026-09-17',close:100},{date:'2026-09-18',close:200},{date:'2026-09-19',close:200},{date:'2026-09-20',close:300}],SPY:[{date:'2026-09-17',close:10},{date:'2026-09-18',close:20},{date:'2026-09-19',close:20},{date:'2026-09-20',close:30}]},fx:[{date:'2026-09-17',rates:{UZS:12000}}],errors:{}};
const event=(date,type,amount,balance)=>({id:date,record_id:'business',occurred_on:date,created_at:date,event_type:type,amount,balance,ownership_percentage:100,principal:0,interest:0});
const input={records:[{id:'business',name:'Cafe',kind:'Business',currency:'USD',amount:250,quantity:1,ownership_percentage:100},{id:'cash',kind:'Cash',currency:'USD',amount:9999,quantity:1}],events:[event('2026-09-17','contribution',100,100),event('2026-09-18','contribution',200,300),event('2026-09-19','withdrawal',100,200)],market:{rates:{USD:1,EUR:.9,UZS:13000},quotes:{},fx:null},currency:'USD',today:'2026-09-20'};
const points=[{date:'2026-09-17',net:10099},{date:'2026-09-18',net:10100},{date:'2026-09-19',net:10200},{date:'2026-09-20',net:10249}];
test('overview buys BTC and every benchmark with each dated investment, not starting net worth or BTC price',()=>{
 const result=getNetWorthComparison(points,data,input);
 // Buy 1 BTC, buy another BTC, sell 0.5 BTC, then value 1.5 BTC at 300.
 assert.deepEqual(result.points.map(p=>p.BTC),[100,400,300,450]);
 assert.deepEqual(result.points.map(p=>p.SPY),[100,400,300,450]);
 assert.deepEqual(result.points.map(p=>p.contributed),[100,300,200,200]);
 assert.deepEqual(result.points.map(p=>p.actual),points.map(p=>p.net));
 const shared=getInvestmentComparison(input,data);
 for(let i=0;i<points.length;i++)for(const key of ['BTC','SPY','depositUSD','depositUZS'])assert.equal(result.points[i][key],shared.points[i][key]);
});
test('zooming retains earlier purchased benchmark units',()=>{
 const all=getNetWorthComparison(points,data,input),zoom=getNetWorthComparison(points.slice(2),data,input);
 assert.deepEqual(zoom.points,all.points.slice(2));
 assert.equal(zoom.points.at(-1).BTC,450);
});
test('salary and personal spending do not fund hypothetical investments',()=>{
 const withCashflows={...input,cashflows:[{id:'pay',kind:'Salary',frequency:'Once',amount:5000,currency:'USD',date:'2026-09-18'},{id:'food',kind:'Living expense',frequency:'Once',amount:200,currency:'USD',date:'2026-09-18'}]};
 assert.deepEqual(getNetWorthComparison(points,data,withCashflows).points,getNetWorthComparison(points,data,input).points);
});
test('display currency rescales the investment outcome without changing purchases',()=>{
 const usd=getNetWorthComparison(points,data,input),eur=getNetWorthComparison(points.map(p=>({...p,net:p.net*.9})),data,{...input,currency:'EUR'});
 for(let i=0;i<points.length;i++)for(const key of ['actual','BTC','SPY','contributed'])assert.ok(Math.abs(eur.points[i][key]-usd.points[i][key]*.9)<1e-8);
});
test('missing quotes stay unavailable, and opening observations are counted once',()=>{
 const missing=getNetWorthComparison(points,{...data,prices:{BTC:[]}},input);
 assert.equal(missing.points.at(-1).BTC,null);assert.ok(missing.unavailable.includes('BTC'));
 const observed={...input,events:[{...input.events[0],event_type:'baseline',amount:0},...input.events.slice(1)]};
 assert.equal(getNetWorthComparison(points,data,observed).points.at(-1).BTC,450);
 assert.equal(getNetWorthComparison([],data,input),null);
 assert.equal(getNetWorthComparison(points,data,{...input,currency:'GBP'}),null);
});
