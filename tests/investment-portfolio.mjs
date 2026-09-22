import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {getInvestmentPortfolio,getInvestmentComparison,investmentValueChange}=loadTS('lib/investment-portfolio.ts');
const event=(id,record_id,date,balance,type='baseline',amount=0)=>({id,record_id,occurred_on:date,created_at:date,event_type:type,amount,balance,ownership_percentage:100,principal:0,interest:0});
const input={records:[{id:'asset',name:'Business',kind:'Business',amount:4000000,quantity:1,currency:'UZS',ownership_percentage:100},{id:'debt',name:'Loan',kind:'Loan',amount:500000,currency:'UZS'}],events:[event('a','asset','2026-09-17',4000000),event('p','debt','2026-09-18',500000,'withdrawal',100000)],market:{rates:{UZS:10000,EUR:.9},quotes:{},fx:null},currency:'USD',today:'2026-09-20'};
const data={start:'2026-09-17',end:'2026-09-20',prices:{BTC:[{date:'2026-09-17',close:100},{date:'2026-09-20',close:120}]},fx:[{date:'2026-09-17',rates:{UZS:9000,EUR:.8}},{date:'2026-09-19',rates:{UZS:12000,EUR:.95}}],errors:{}};
test('Overview and Benchmarks share actual values even when historical FX changes without activity',()=>{
 const portfolio=getInvestmentPortfolio(input),comparison=getInvestmentComparison(input,data);
 assert.deepEqual(portfolio.performance.points.map(p=>p.amount),[400,410,410,410]);
 assert.deepEqual(comparison.points.map(p=>p.actual),portfolio.performance.points.map(p=>p.amount));
 assert.equal(comparison.points.at(-1).contributed,portfolio.performance.breakdown.reduce((sum,row)=>sum+row.funding,0));
});
test('changing display currency rescales every series, not the hypothetical purchases',()=>{
 const usd=getInvestmentComparison(input,data),eur=getInvestmentComparison({...input,currency:'EUR'},data);
 for(let i=0;i<usd.points.length;i++)for(const key of ['actual','contributed','BTC','depositUZS','depositUSD']){
  assert.ok(Math.abs(eur.points[i][key]-usd.points[i][key]*.9)<1e-8,key);
 }
 const overview=getInvestmentPortfolio({...input,currency:'EUR'});
 assert.deepEqual(eur.points.map(p=>p.actual),overview.performance.points.map(p=>p.amount));
});
test('missing current conversion pauses comparison; excluded cash and deleted events stay excluded',()=>{
 assert.equal(getInvestmentComparison({...input,currency:'GBP'},data),null);
 const modified={...input,records:[...input.records,{id:'cash',kind:'Cash',amount:99999,currency:'USD'}],events:[...input.events,event('cash','cash','2026-09-17',99999),event('removed','deleted','2026-09-17',99999)]};
 assert.equal(getInvestmentPortfolio(modified).value,410);
});

test('portfolio growth is distinct from funding result, including mortgage interest',()=>{
 const mortgage={id:'mortgage',name:'Home',kind:'Mortgage',amount:9000,currency:'USD'};
 const scenario={...input,records:[{id:'asset',name:'Business',kind:'Business',amount:400000,quantity:1,currency:'USD',ownership_percentage:100},mortgage],events:[event('a','asset','2026-09-17',400000),{...event('p','mortgage','2026-09-18',9000,'mortgage_payment',1500),principal:400,interest:1100}]};
 const overview=getInvestmentPortfolio(scenario);
 const comparison=getInvestmentComparison(scenario,data);
 assert.equal(investmentValueChange(overview.points.map(p=>p.net)),400);
 assert.equal(investmentValueChange(comparison.points.map(p=>p.actual)),400);
 const last=comparison.points.at(-1);
 assert.equal(last.actual-last.contributed,-1100);
 assert.equal(investmentValueChange([]),null);
 assert.equal(investmentValueChange([400]),null);
 assert.equal(investmentValueChange([null,400]),null);
 assert.equal(investmentValueChange([400,399.75]),-.25);
});

test('cash-only sheep investment funds every benchmark on its date without increasing asset value',()=>{
 const addition=85.125;
 const scenario={...input,records:[{...input.records[0],name:'Sheep',ownership_percentage:50}],events:[{...input.events[0],ownership_percentage:50}]};
 const purchase={...event('sheep-purchase','asset','2026-09-19',null,'contribution',addition*10000),ownership_percentage:50};
 const funded={...scenario,events:[...scenario.events,purchase]};
 const prices={...data,prices:{...data.prices,SPY:[{date:'2026-09-17',close:200},{date:'2026-09-20',close:210}],CUSTOM:[{date:'2026-09-17',close:50},{date:'2026-09-20',close:60}]}};
 const before=getInvestmentComparison(scenario,prices),after=getInvestmentComparison(funded,prices);
 const portfolio=getInvestmentPortfolio(funded);
 const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
 assert.deepEqual(after.points.map(p=>p.actual),before.points.map(p=>p.actual));
 assert.equal(portfolio.value,200);
 near(portfolio.performance.invested,200+addition);
 assert.deepEqual(portfolio.performance.flows,[{date:'2026-09-17',amount:200},{date:'2026-09-19',amount:addition}]);
 for(let index=0;index<after.points.length;index++){
  const current=after.points[index],previous=before.points[index];
  near(current.contributed-previous.contributed,index<2?0:addition);
  if(index<=2)for(const key of ['BTC','SPY','CUSTOM','depositUSD','depositUZS'])near(current[key]-previous[key],index<2?0:addition);
 }
 const last=after.points.at(-1),oldLast=before.points.at(-1);
 for(const [key,factor] of [['BTC',1.2],['SPY',1.05],['CUSTOM',1.2],['depositUSD',1.08**(1/365)],['depositUZS',1.21**(1/365)]])near(last[key]-oldLast[key],addition*factor);
 near(last.actual-last.contributed,-addition);
 const eur=getInvestmentComparison({...funded,currency:'EUR'},prices);
 for(let index=0;index<after.points.length;index++)for(const key of ['actual','contributed','BTC','SPY','CUSTOM','depositUSD','depositUZS'])near(eur.points[index][key],after.points[index][key]*.9);
});

test('cash-only investment with a missing benchmark purchase price remains funded and reports the unavailable comparison',()=>{
 const funded={...input,events:[...input.events,event('purchase','asset','2026-09-19',null,'contribution',850000)]};
 const result=getInvestmentComparison(funded,{...data,prices:{BTC:[]}});
 assert.equal(result.points.at(-1).actual,410);
 assert.equal(result.points.at(-1).contributed,495);
 assert.equal(result.points.at(-1).BTC,null);
 assert.ok(result.unavailable.includes('BTC'));
 assert.ok(result.points.at(-1).depositUSD>495);
});

test('diversified portfolio uses shared cashflows and converts the whole result at current FX',()=>{
 const allocation={crypto:0,stock:0,deposit:20,business:20,cash:60,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:12};
 const usd=getInvestmentComparison(input,data,allocation),eur=getInvestmentComparison({...input,currency:'EUR'},data,allocation);
 assert.ok(usd.points.at(-1).PORTFOLIO>0);
 for(let i=0;i<usd.points.length;i++)assert.ok(Math.abs(eur.points[i].PORTFOLIO-usd.points[i].PORTFOLIO*.9)<1e-8);
});
