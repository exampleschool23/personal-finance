import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {getNetWorthComparison}=loadTS('lib/net-worth-comparison.ts');
const data={start:'2026-09-17',end:'2026-09-25',prices:{SPY:[{date:'2026-09-17',close:100},{date:'2026-09-25',close:110}],BTC:[{date:'2026-09-17',close:200},{date:'2026-09-25',close:180}]},fx:[{date:'2026-09-17',rates:{UZS:12000}}],errors:{}};
const points=[{date:'2026-09-17',net:296563.125},{date:'2026-09-25',net:304000}];
const market={rates:{EUR:.9,UZS:13000}};
test('Overview benchmarks start from precise net worth, not gross investment funding',()=>{
 const result=getNetWorthComparison(points,data,'USD',market);
 for(const key of ['SPY','BTC','depositUSD','depositUZS'])assert.ok(Math.abs(result.points[0][key]-points[0].net)<1e-8,key);
 assert.equal(result.points[1].actual,304000);
 assert.ok(Math.abs(result.points[1].SPY-points[0].net*1.1)<1e-8);
 assert.equal(result.points[1].contributed,points[0].net);
 assert.equal(result.netCashFlow,0);
});
test('selected period resets opening capital and price together',()=>{
 const result=getNetWorthComparison([points[1]],data,'USD',market);
 assert.equal(result.points[0].SPY,304000);
});
test('display currency rescales comparisons without changing purchases',()=>{
 const usd=getNetWorthComparison(points,data,'USD',market);
 const eur=getNetWorthComparison(points.map(p=>({...p,net:p.net*.9})),data,'EUR',market);
 for(let i=0;i<points.length;i++)for(const key of ['actual','SPY','BTC','depositUSD','depositUZS'])assert.ok(Math.abs(eur.points[i][key]-usd.points[i][key]*.9)<1e-8,key);
});
test('missing prices remain unavailable and invalid starting capital is not invested',()=>{
 const result=getNetWorthComparison(points,{...data,prices:{SPY:[]}},'USD',market);
 assert.equal(result.points[0].SPY,null);
 assert.ok(result.unavailable.includes('SPY'));
 assert.equal(getNetWorthComparison(points,data,'GBP',market),null);
 for(const net of [-1,NaN,Infinity])assert.equal(getNetWorthComparison([{...points[0],net}],data,'USD',market),null);
 assert.equal(getNetWorthComparison([],data,'USD',market),null);
 assert.equal(getNetWorthComparison([{...points[0],net:0}],data,'USD',market).points[0].SPY,0);
});
test('diversified portfolios also start at net worth',()=>{
 const allocation={crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0};
 const result=getNetWorthComparison(points,{...data,prices:{...data.prices,portfolioCrypto:data.prices.BTC,portfolioStock:data.prices.SPY}},'USD',market,allocation);
 assert.ok(Math.abs(result.points[0].PORTFOLIO-points[0].net)<1e-8);
});
