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
