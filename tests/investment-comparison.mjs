import { portfolioAssets, portfolioAssetKey, portfolioAssetCurrency } from '../lib/diversified-portfolio.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {assets,liabilities,income,expenses} from '../lib/finance.ts';
import * as dates from '../lib/benchmark-data.ts';
const compile = path => ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deps={portfolioAssets,portfolioAssetKey,portfolioAssetCurrency,assets,liabilities,income,expenses,...dates};
const {compareInvestments,recordedCashFlows,monthlyCashFlows,netWorthHistory,firstCompleteDate}=new Function(...Object.keys(deps),compile('lib/investment-comparison.ts')+';return {compareInvestments,recordedCashFlows,monthlyCashFlows,netWorthHistory,firstCompleteDate};')(...Object.values(deps));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001,`${actual} != ${expected}`);
const fx=[{date:'2025-01-01',rates:{USD:1,UZS:10000,EUR:.9}},{date:'2026-01-01',rates:{USD:1,UZS:12100,EUR:.95}}];
const data=(start,end,prices={})=>({start,end,prices,fx,errors:{}});
test('deposit rates compound for elapsed days and UZS devaluation is not hidden',()=>{
 const result=compareInvestments(1000,[],[],data('2025-01-01','2026-01-01'),'USD');
 near(result.points.at(-1).depositUSD,1080);
 near(result.points.at(-1).depositUZS,1000);
 assert.equal(result.points[0].depositUZS,1000);
});
test('identical cash flows purchase at the closing price and additions are not gains',()=>{
 const prices={SPY:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200},{date:'2025-01-03',close:220}]};
 const result=compareInvestments(1000,[{date:'2025-01-02',amount:200},{date:'2025-01-03',amount:-100}],[],data('2025-01-01','2025-01-03',prices),'USD');
 near(result.points[1].SPY,2200);near(result.points[2].SPY,2320);
 assert.equal(result.netCashFlow,100);assert.equal(result.points.at(-1).contributed,1100);
});
test('cashflow dates before the start are excluded and same-day movements net exactly once',()=>{
 const records=[{kind:'Salary',currency:'USD',amount:100,frequency:'Once',date:'2025-01-02'},{kind:'Other expense',currency:'UZS',amount:200000,frequency:'Once',date:'2025-01-02'},{kind:'Salary',currency:'USD',amount:999,frequency:'Monthly',date:'2025-01-02'},{kind:'Other income',currency:'USD',amount:999,frequency:'Once',date:'2025-01-01'}];
 assert.deepEqual(recordedCashFlows(records,'USD',fx,'2025-01-01','2025-01-03'),{flows:[{date:'2025-01-02',amount:80}],missing:0});
 const unknown=recordedCashFlows([{...records[0],currency:'GBP'}],'USD',fx,'2025-01-01','2025-01-03');assert.equal(unknown.missing,1);assert.deepEqual(unknown.flows,[]);
});
test('monthly anniversaries clip February without drifting following months',()=>{
 assert.deepEqual(monthlyCashFlows('2025-01-31','2025-04-30',100),[{date:'2025-02-28',amount:100},{date:'2025-03-31',amount:100},{date:'2025-04-30',amount:100}]);
});
test('net worth includes every asset and debt, ownership, changing FX, and never invents a missing baseline',()=>{
 const records=[{id:'a',kind:'Business',currency:'USD'},{id:'d',kind:'Loan',currency:'UZS'}];
 const event=(record_id,date,balance,ownership_percentage=100)=>({id:record_id+date,record_id,occurred_on:date,created_at:date,balance,ownership_percentage});
 const events=[event('a','2025-01-01',1000,50),event('d','2025-01-02',1000000)];
 assert.equal(firstCompleteDate(records,events),'2025-01-02');
 const result=netWorthHistory(records,events,'USD',fx,['2025-01-01','2025-01-02','2026-01-01']);
 assert.equal(result[0].amount,null);assert.equal(result[1].amount,400);near(result[2].amount,500-1000000/12100);
 assert.equal(firstCompleteDate([...records,{id:'new',kind:'Cash'}],events),null);
 assert.equal(netWorthHistory([...records,{id:'new',kind:'Cash',currency:'USD'}],events,'USD',fx,['2026-01-01'])[0].amount,null);
});
test('missing FX, stale quotes and depleted investments create gaps instead of invented returns or leverage',()=>{
 const result=compareInvestments(100,[{date:'2025-01-02',amount:-200}],[],{...data('2025-01-01','2025-01-03',{SPY:[{date:'2025-01-01',close:10}]}),fx:[]},'USD');
 assert.equal(result.points[0].depositUZS,null);assert.equal(result.points[1].SPY,null);assert.equal(result.points[2].SPY,null);assert.equal(result.points[1].depositUSD,null);
 assert.ok(result.unavailable.includes('depositUZS'));
 const stale=compareInvestments(100,[],[],data('2025-01-01','2025-01-10',{SPY:[{date:'2025-01-01',close:10}]}),'USD');assert.equal(stale.points.at(-1).SPY,null);
});
test('period checkpoints include boundaries and stay bounded',()=>{
 const checkpoints=dates.checkpointDates('2025-01-01','2026-01-01');assert.equal(checkpoints[0],'2025-01-01');assert.equal(checkpoints.at(-1),'2026-01-01');assert.ok(checkpoints.length<=25);
 assert.equal(dates.validDay('2025-02-30'),false);assert.equal(dates.validDay('2024-02-29'),true);
});
test('cashflow-only investing can start at zero and earns nothing before the contribution',()=>{
 const result=compareInvestments(0,[{date:'2025-01-02',amount:100}],[],data('2025-01-01','2025-01-03',{BTC:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200},{date:'2025-01-03',close:220}]}),'USD');
 assert.equal(result.points[0].BTC,0);assert.equal(result.points[1].BTC,100);near(result.points[2].BTC,110);assert.equal(result.netCashFlow,100);
});
test('comparison UI translates literal messages and uses recorded investment dates instead of editable starting capital',()=>{
 const source=fs.readFileSync('components/investment-comparison.tsx','utf8');
 const messages=[...source.matchAll(/\bt\('([^']+)'/g)].map(match=>match[1]);
 for(const language of ['en','ru','uz']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));for(const message of messages)assert.ok(labels[message],`${language}: ${message}`);}
 assert.ok(!source.includes('DatePicker'));assert.ok(!source.includes('setRequestedStart'));assert.ok(!source.includes('setCapital'));assert.ok(!/<[Ii]nput\b[^>]*type="number"/.test(source));assert.ok(!source.includes('type="date"'));
});
test('valuation gaps recover when quotes return, without inventing a trade price',()=>{
 const prices={SPY:[{date:'2025-01-01',close:10},{date:'2025-01-10',close:12}]};
 const result=compareInvestments(100,[],[],data('2025-01-01','2025-01-10',prices),'USD');
 assert.equal(result.points[8].SPY,null);assert.equal(result.points[9].SPY,120);
 const missingTrade=compareInvestments(100,[{date:'2025-01-09',amount:20}],[],data('2025-01-01','2025-01-10',prices),'USD');
 assert.equal(missingTrade.points[9].SPY,null);
});
test('unfunded benchmarks wait for the first contribution without requiring earlier prices',()=>{
 const result=compareInvestments(0,[{date:'2025-01-03',amount:100}],[],data('2025-01-01','2025-01-03',{BTC:[{date:'2025-01-03',close:20}]}),'USD',true);
 assert.deepEqual(result.points.map(point=>point.BTC),[0,0,100]);
});
test('zero and nonfinite quotes cannot generate infinite benchmark balances',()=>{
 for(const close of [0,NaN,Infinity,-5]){
  const result=compareInvestments(100,[],[],data('2025-01-01','2025-01-01',{SPY:[{date:'2025-01-01',close}]}),'USD');
  assert.equal(result.points[0].SPY,null);
 }
});

const allocation={crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'ETH',stockSymbol:'QQQ',businessRate:10};
test('diversified portfolio weights dated purchases and withdrawals without rounding',()=>{
 const prices={portfolioCrypto:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200}],portfolioStock:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:110}]};
 const result=compareInvestments(0,[{date:'2025-01-01',amount:1000.123},{date:'2025-01-02',amount:-100.123}],[],data('2025-01-01','2025-01-02',prices),'USD',true,allocation);
 near(result.points[0].PORTFOLIO,1000.123);
 const last=result.points.at(-1);
 near(last.PORTFOLIO,(last.portfolioCrypto+last.portfolioStock+last.depositUZS+last.portfolioBusiness+last.portfolioCash)/5);
 near(last.PORTFOLIO,1000.123*(2+1.1+1.21**(1/365)+1.1**(1/365)+1)/5-100.123);
 near(last.portfolioCash,900);
 near(last.contributed,900);
});
test('missing active sleeve fails closed but zero-weight sleeves do not require data',()=>{
 let result=compareInvestments(1000,[],[],data('2025-01-01','2025-01-02'),'USD',false,allocation);
 assert.equal(result.points[0].PORTFOLIO,null);assert.ok(result.unavailable.includes('PORTFOLIO'));
 result=compareInvestments(1000,[],[],{...data('2025-01-01','2025-01-02'),fx:[]},'USD',false,{...allocation,crypto:0,stock:0,deposit:0,business:0,cash:100});
 near(result.points.at(-1).PORTFOLIO,1000);
});
test('modeled business compounds and impossible withdrawals invalidate the portfolio',()=>{
 const business={...allocation,crypto:0,stock:0,deposit:0,business:100,cash:0};
 const result=compareInvestments(1000,[],[],data('2025-01-01','2026-01-01'),'USD',false,business);
 near(result.points.at(-1).PORTFOLIO,1100);
 const withdrawn=compareInvestments(1000,[{date:'2025-01-02',amount:-2000}],[],data('2025-01-01','2025-01-03'),'USD',false,business);
 assert.equal(withdrawn.points.at(-1).PORTFOLIO,null);
});

test('several stock benchmarks follow their own prices with identical funding and isolated failures',()=>{
 const prices={'STOCK:NVDA':[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200}],'STOCK:AAPL':[{date:'2025-01-01',close:50},{date:'2025-01-02',close:40}],'STOCK:MISSING':[]};
 const result=compareInvestments(1000,[{date:'2025-01-02',amount:100}],[],data('2025-01-01','2025-01-02',prices),'USD');
 near(result.points.at(-1)['STOCK:NVDA'],2100);
 near(result.points.at(-1)['STOCK:AAPL'],900);
 assert.equal(result.points.at(-1)['STOCK:MISSING'],null);
 assert.deepEqual(result.unavailable,['STOCK:MISSING']);
});

test('editable portfolio weights independent stocks, named businesses and deposits; deleted assets are excluded',()=>{
 const portfolio={crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0,assets:[
  {id:'nvidia',kind:'stock',symbol:'NVDA',name:'',weight:30,rate:0},
  {id:'apple',kind:'stock',symbol:'AAPL',name:'',weight:20,rate:0},
  {id:'cafe',kind:'business',symbol:'',name:'Cafe',weight:20,rate:0},
  {id:'savings',kind:'deposit',symbol:'',name:'Savings',weight:30,rate:0},
 ]};
 const prices={portfolio_nvidia:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:200}],portfolio_apple:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:50}]};
 const calculate=p=>compareInvestments(1000,[],[],data('2025-01-01','2025-01-02',prices),'USD',false,p);
 near(calculate(portfolio).points.at(-1).PORTFOLIO,1200);
 near(calculate({...portfolio,assets:[{...portfolio.assets[1],weight:100}]}).points.at(-1).PORTFOLIO,500);
 const missing={...portfolio,assets:[{...portfolio.assets[0],id:'missing',weight:100}]};
 assert.equal(calculate(missing).points.at(-1).PORTFOLIO,null);
 near(calculate({...portfolio,assets:[{...missing.assets[0],weight:0},{...portfolio.assets[1],weight:100}]}).points.at(-1).PORTFOLIO,500);
});

test('portfolio currencies use dated exchange rates and preserve legacy UZS deposits',()=>{
 const base={crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0};
 const data={start:'2025-01-01',end:'2025-01-02',prices:{},errors:{},fx:[{date:'2025-01-01',rates:{USD:1,EUR:.8,UZS:10000}},{date:'2025-01-02',rates:{USD:1,EUR:1,UZS:12000}}]};
 const asset={id:'savings',kind:'deposit',name:'Savings',symbol:'',weight:100,rate:0};
 const run=asset=>compareInvestments(1000,[],[],data,'USD',false,{...base,assets:[asset]}).points.at(-1).PORTFOLIO;
 near(run({...asset,currency:'EUR'}),800);
 near(run({...asset,currency:'USD'}),1000);
 near(run(asset),1000*10000/12000);
 for(const kind of ['cash','business','property','custom'])near(run({...asset,kind,currency:'EUR'}),800);
 assert.equal(run({...asset,currency:'GBP'}),null);
});

test('real estate and custom assets compound assumed returns in their own currency',()=>{
 const base={crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0};
 for(const kind of ['property','custom']){
  const portfolio={...base,assets:[{id:'asset',kind,name:'Apartment',symbol:'',weight:100,rate:10,currency:'USD'}]};
  const result=compareInvestments(1000,[],[],data('2025-01-01','2026-01-01'),'USD',false,portfolio);
  near(result.points.at(-1).PORTFOLIO,1100);
 }
});
