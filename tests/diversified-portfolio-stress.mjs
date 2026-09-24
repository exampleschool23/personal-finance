import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {compareInvestments}=loadTS('lib/investment-comparison.ts');
const {getInvestmentComparison,getInvestmentPortfolio}=loadTS('lib/investment-portfolio.ts');
const {defaultDiversifiedPortfolio,diversifiedPortfolioSchema}=loadTS('lib/diversified-portfolio.ts');
const {formatMoney}=loadTS('lib/format.ts');
const weights={...defaultDiversifiedPortfolio,businessRate:12};
const start='2025-01-01';
const day=index=>new Date(Date.UTC(2025,0,1+index)).toISOString().slice(0,10);
const near=(actual,expected,label='')=>{
 assert.equal(typeof actual,'number',label);
 assert.ok(Number.isFinite(actual),label);
 assert.ok(Math.abs(actual-expected)<=Math.max(1e-8,Math.abs(expected)*2e-10),`${label}: ${actual} != ${expected}`);
};
function feed(days=365,{crypto=index=>60000*(1+.5*index/days),stock=index=>600*(1+.1*index/days),fx=()=>12000}={}) {
 const indices=Array.from({length:days+1},(_,index)=>index);
 return {start,end:day(days),prices:{portfolioCrypto:indices.map(index=>({date:day(index),close:crypto(index)})),portfolioStock:indices.map(index=>({date:day(index),close:stock(index)}))},fx:indices.map(index=>({date:day(index),rates:{UZS:fx(index),EUR:.9}})),errors:{}};
}
function event(id,index,event_type,amount,balance) {
 return {id,record_id:'investment',occurred_on:day(index),created_at:day(index),event_type,amount,balance,ownership_percentage:100,principal:0,interest:0};
}
function scenario(days=365,events=[event('purchase',0,'contribution',9000,9000)],balance=9000) {
 return {records:[{id:'investment',name:'Other investment',kind:'Business',amount:balance,quantity:1,currency:'USD',ownership_percentage:100}],events,market:{rates:{UZS:12000,EUR:.9},quotes:{},fx:null},currency:'USD',today:day(days)};
}
// Independent oracle: value every dated purchase lot directly. No rolling balances,
// simulation helper, normalized full-capital benchmarks, or production date helpers.
function lotValues(flows,index,data,allocation) {
 const result={crypto:0,stock:0,deposit:0,business:0,cash:0};
 for(const flow of flows) {
  if(flow.index>index)continue;
  const age=index-flow.index;
  result.crypto+=flow.amount*allocation.crypto/100*data.prices.portfolioCrypto[index].close/data.prices.portfolioCrypto[flow.index].close;
  result.stock+=flow.amount*allocation.stock/100*data.prices.portfolioStock[index].close/data.prices.portfolioStock[flow.index].close;
  result.deposit+=flow.amount*allocation.deposit/100*data.fx[flow.index].rates.UZS*Math.pow(1.21,age/365)/data.fx[index].rates.UZS;
  result.business+=flow.amount*allocation.business/100*Math.pow(1+allocation.businessRate/100,age/365);
  result.cash+=flow.amount*allocation.cash/100;
 }
 return result;
}
const sum=values=>Object.values(values).reduce((total,amount)=>total+amount,0);

test('$9,000 real investment allocates $1,800 to each part and reaches $10,674 with specified returns',()=>{
 const data=feed(),input=scenario();
 const own=getInvestmentPortfolio(input),result=getInvestmentComparison(input,data,weights);
 assert.deepEqual(own.performance.flows,[{date:start,amount:9000}]);
 near(result.points[0].PORTFOLIO,9000);
 const opening=lotValues([{index:0,amount:9000}],0,data,weights);
 assert.deepEqual(opening,{crypto:1800,stock:1800,deposit:1800,business:1800,cash:1800});
 const closing=lotValues([{index:0,amount:9000}],365,data,weights);
 for(const [key,expected] of Object.entries({crypto:2700,stock:1980,deposit:2178,business:2016,cash:1800}))near(closing[key],expected,key);
 near(result.points.at(-1).PORTFOLIO,10674);
 near(result.points.at(-1).contributed,9000);
 near(result.points.at(-1).actual,9000);
 near(result.points.at(-1).PORTFOLIO-result.points.at(-1).contributed,1674);
 // Every chart date, not only the final total, matches independent purchase lots.
 result.points.forEach((point,index)=>near(point.PORTFOLIO,sum(lotValues([{index:0,amount:9000}],index,data,weights)),day(index)));
 for(const locale of ['en-US','ru-RU','uz-UZ'])assert.equal(formatMoney(result.points.at(-1).PORTFOLIO,'USD',locale),formatMoney(10674,'USD',locale));
});

test('one rising asset affects only its allocation; holdings drift rather than rebalance daily',()=>{
 const data=feed(2,{crypto:index=>[100,200,300][index],stock:()=>100});
 const allocation={...weights,deposit:0,business:0,cash:60};
 const result=getInvestmentComparison(scenario(2),data,allocation);
 assert.deepEqual(result.points.map(point=>point.PORTFOLIO),[9000,10800,12600]);
 // The original crypto purchase is still 18 units, not reset to 20% of yesterday's total.
 near(result.points[2].PORTFOLIO,18*300+1800+5400);
});

test('actual investment valuation increases and same-day opening snapshots do not reinvest benchmark capital',()=>{
 const events=[event('a-opening',0,'baseline',0,9000),event('b-purchase',0,'contribution',9000,9000),event('valuation',100,'valuation',0,18000)];
 const input=scenario(365,events,18000),result=getInvestmentComparison(input,feed(),weights);
 assert.deepEqual(getInvestmentPortfolio(input).performance.flows,[{date:start,amount:9000}]);
 near(result.points.at(-1).actual,18000);
 near(result.points.at(-1).contributed,9000);
 near(result.points.at(-1).PORTFOLIO,10674);
});

test('later contributions buy at their own dates and prices, never at the original cheap price',()=>{
 const data=feed(365,{crypto:index=>index<180?100:200,stock:index=>index<180?100:120});
 const events=[event('first',0,'contribution',9000,9000),event('second',180,'contribution',4500,13500)];
 const result=getInvestmentComparison(scenario(365,events,13500),data,weights);
 const lots=[{index:0,amount:9000},{index:180,amount:4500}];
 result.points.forEach((point,index)=>near(point.PORTFOLIO,sum(lotValues(lots,index,data,weights)),day(index)));
 near(result.points[180].PORTFOLIO-sum(lotValues([lots[0]],180,data,weights)),4500);
 near(result.points.at(-1).contributed,13500);
});

test('a UZS deposit earns local interest while UZS depreciation reduces its USD value',()=>{
 const data=feed(365,{fx:index=>12000*(1+.2*index/365)});
 const result=getInvestmentComparison(scenario(),data,weights);
 // 1,800 USD -> 21,600,000 UZS -> 26,136,000 UZS / 14,400 = 1,815 USD.
 near(lotValues([{index:0,amount:9000}],365,data,weights).deposit,1815);
 near(result.points.at(-1).PORTFOLIO,10311);
});

test('losses, tiny crypto unit prices, and non-equal fractional weights retain full precision',()=>{
 const allocation={...weights,crypto:33.33,stock:16.67,deposit:12.5,business:12.5,cash:25};
 assert.equal(diversifiedPortfolioSchema.safeParse(allocation).success,true);
 const data=feed(365,{crypto:index=>.00000001*(1-.99*index/365),stock:index=>100*(1-.7*index/365)});
 const amount=9000.123456789;
 const result=getInvestmentComparison(scenario(365,[event('purchase',0,'contribution',amount,amount)],amount),data,allocation);
 result.points.forEach((point,index)=>near(point.PORTFOLIO,sum(lotValues([{index:0,amount}],index,data,allocation)),day(index)));
 assert.ok(result.points.at(-1).PORTFOLIO<amount);
 near(result.points[0].contributed,amount);
});

test('withdrawals are divided by configured weights and reduce value by exactly the withdrawn cash',()=>{
 const data=feed(365),events=[event('purchase',0,'contribution',9000,9000),event('sale',180,'withdrawal',1000,8000)];
 const result=getInvestmentComparison(scenario(365,events,8000),data,weights);
 const lots=[{index:0,amount:9000},{index:180,amount:-1000}];
 result.points.forEach((point,index)=>near(point.PORTFOLIO,sum(lotValues(lots,index,data,weights)),day(index)));
 near(result.points[180].PORTFOLIO-sum(lotValues([lots[0]],180,data,weights)),-1000);
 near(result.points.at(-1).contributed,8000);
});

test('a withdrawal that exhausts one allocation is unavailable instead of silently borrowing or rebalancing',()=>{
 const allocation={...weights,deposit:0,business:0,cash:60};
 const data=feed(2,{crypto:index=>index===0?100:1,stock:()=>100});
 const result=compareInvestments(9000,[{date:day(1),amount:-1000}],[],data,'USD',false,allocation);
 assert.equal(result.points[1].PORTFOLIO,null);assert.equal(result.points[2].PORTFOLIO,null);
 assert.ok(result.unavailable.includes('PORTFOLIO'));
});

test('a fully withdrawn portfolio stays zero until a fresh contribution',()=>{
 const allocation={...weights,deposit:0,business:0,cash:60};
 const data=feed(3,{crypto:()=>100,stock:()=>100});
 const result=compareInvestments(9000,[{date:day(1),amount:-9000},{date:day(3),amount:4500}],[],data,'USD',false,allocation);
 assert.deepEqual(result.points.map(point=>point.PORTFOLIO),[9000,0,0,4500]);
});

test('missing valuation quotes recover, but a missing purchase quote cannot invent units later',()=>{
 const data=feed(12);data.prices.portfolioCrypto=data.prices.portfolioCrypto.filter((_,index)=>index===0||index===12);
 const held=compareInvestments(9000,[],[],data,'USD',false,weights);
 assert.equal(held.points[8].PORTFOLIO,null);near(held.points[12].PORTFOLIO,sum(lotValues([{index:0,amount:9000}],12,feed(12),weights)));
 const bought=compareInvestments(9000,[{date:day(8),amount:100}],[],data,'USD',false,weights);
 assert.equal(bought.points[12].PORTFOLIO,null);
});

test('zero allocations do not require market or FX data and no asset is funded before its first purchase',()=>{
 const allocation={...weights,crypto:0,stock:0,deposit:0,business:0,cash:100};
 const data={start,end:day(10),prices:{},fx:[],errors:{}};
 const result=compareInvestments(0,[{date:day(5),amount:9000}],[],data,'USD',true,allocation);
 assert.deepEqual(result.points.map(point=>point.PORTFOLIO),[0,0,0,0,0,9000,9000,9000,9000,9000,9000]);
 const activeMissing=compareInvestments(9000,[],[],data,'USD',false,weights);
 assert.equal(activeMissing.points.at(-1).PORTFOLIO,null);
});

test('changing display currency cannot change purchases or allocation; unrelated personal spending is excluded',()=>{
 const data=feed(),input=scenario();
 input.records.push({id:'cash',kind:'Cash',amount:100000,currency:'USD',is_investment:false});
 input.cashflows=[{id:'food',kind:'Food',amount:1000,currency:'USD',frequency:'Once',date:day(50)}];
 const usd=getInvestmentComparison(input,data,weights),eur=getInvestmentComparison({...input,currency:'EUR'},data,weights),uzs=getInvestmentComparison({...input,currency:'UZS'},data,weights);
 usd.points.forEach((point,index)=>{near(eur.points[index].PORTFOLIO,point.PORTFOLIO*.9);near(uzs.points[index].PORTFOLIO,point.PORTFOLIO*12000);});
 near(usd.points.at(-1).contributed,9000);near(usd.points.at(-1).PORTFOLIO,10674);
});

test('250 deterministic volatile paths match an independent lot ledger on every day (45,250 points)',()=>{
 let seed=0x91a700;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let trial=0;trial<250;trial++) {
  const cuts=[0,...Array.from({length:4},()=>Math.floor(random()*10001)),10000].sort((a,b)=>a-b);
  const allocation={...weights,businessRate:random()*100};
  ['crypto','stock','deposit','business','cash'].forEach((key,index)=>{allocation[key]=(cuts[index+1]-cuts[index])/100;});
  assert.equal(diversifiedPortfolioSchema.safeParse(allocation).success,true);
  let coin=trial%2===0?1e-8:60000,stock=600,fx=12000;
  const data=feed(180,{crypto:()=>coin*=.85+random()*.3,stock:()=>stock*=.94+random()*.12,fx:()=>fx*=.98+random()*.04});
  const scale=[.001,9000,1e6,1e12][trial%4];
  const lots=[{index:0,amount:scale*(1+random())}];
  for(let index=10;index<=180;index+=10) {
   // Fixed-weight sales must fit every allocation, as the product does not rebalance.
   const values=lotValues(lots,index,data,allocation);
   const limit=Math.min(...Object.keys(values).filter(key=>allocation[key]>0).map(key=>values[key]/(allocation[key]/100)));
   lots.push({index,amount:random()<.3?-limit*.1:scale*random()*.2});
  }
  const result=compareInvestments(lots[0].amount,lots.slice(1).map(lot=>({date:day(lot.index),amount:lot.amount})),[],data,'USD',false,allocation);
  result.points.forEach((point,index)=>near(point.PORTFOLIO,sum(lotValues(lots,index,data,allocation)),`path ${trial}, day ${index}`));
  near(result.points.at(-1).contributed,lots.reduce((total,lot)=>total+lot.amount,0));
 }
});

test('each asset can receive the entire allocation independently, including the default zero-return business',()=>{
 const data=feed();
 for(const [key,expected] of Object.entries({crypto:13500,stock:9900,deposit:10890,business:10080,cash:9000})) {
  const allocation={...weights,crypto:0,stock:0,deposit:0,business:0,cash:0,[key]:100};
  const result=getInvestmentComparison(scenario(),data,allocation);
  near(result.points[0].PORTFOLIO,9000,key);near(result.points.at(-1).PORTFOLIO,expected,key);
 }
 const defaultBusiness={...weights,crypto:0,stock:0,deposit:0,business:100,cash:0,businessRate:0};
 near(getInvestmentComparison(scenario(),data,defaultBusiness).points.at(-1).PORTFOLIO,9000);
});

test('ten years of history and 366 dated investments stay finite and match the lot ledger',()=>{
 const data=feed(3650,{crypto:index=>.00000001*2**(index/365),stock:index=>600*1.1**(index/365),fx:index=>12000*1.08**(index/365)});
 const lots=Array.from({length:366},(_,index)=>({index:index*10,amount:index===0?9000:123.456789}));
 const result=compareInvestments(9000,lots.slice(1).map(lot=>({date:day(lot.index),amount:lot.amount})),[],data,'USD',false,weights);
 assert.equal(result.points.length,3651);
 result.points.forEach((point,index)=>near(point.PORTFOLIO,sum(lotValues(lots,index,data,weights)),`ten-year day ${index}`));
 assert.equal(result.unavailable.includes('PORTFOLIO'),false);
});
