import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {assets,assetRecordKinds,interestKinds,interestCompounding,estimatedCashFlow}=loadTS('lib/finance.ts');
const {changeRecordKind}=loadTS('lib/record-kind.ts');
const {upcomingPayments}=loadTS('lib/planning.ts');
const {historyUpdateTypes,historyEventLabel,trackedKinds}=loadTS('lib/investment-history.ts');
const {isInvestmentRecord}=loadTS('lib/comparison-profile.ts');
const {benchmarkSelectionSchema}=loadTS('lib/benchmark-selection.ts');
const {compareInvestments}=loadTS('lib/investment-comparison.ts');
const {paymentsSection}=loadTS('lib/digest-message.ts');
const {categoryHues}=loadTS('lib/category-colors.ts');
const {demoRecords,demoBenchmarkKeys}=loadTS('lib/demo-finance.ts');
const today='2026-10-01';
const bill=(extra={})=>({id:'t',name:'6-month bill',kind:'Treasury bill',currency:'USD',amount:4000,quantity:1,cost:0,rate:4.3,date:'2026-12-15',frequency:'Once',notes:'',deposit_compounding:'none',...extra});

test('a Treasury bill is an asset that earns interest without compounding and is counted as an investment',()=>{
 assert.ok(assets.includes('Treasury bill'));assert.ok(assetRecordKinds.includes('Treasury bill'));
 assert.ok(interestKinds.includes('Treasury bill'));assert.ok(trackedKinds.includes('Treasury bill'));
 assert.equal(interestCompounding(bill({deposit_compounding:'monthly'})),'none','a bill never compounds, whatever was stored');
 assert.equal(interestCompounding({kind:'Deposit',deposit_compounding:'daily'}),'daily');
 assert.ok(isInvestmentRecord(bill()));
 assert.equal(typeof categoryHues['Treasury bill'],'number');
 // Its monthly interest estimate counts towards the cash-flow forecast like a deposit's.
 assert.ok(Math.abs(estimatedCashFlow([bill({estimated_monthly_income:14.33})]).forecast-14.33)<1e-9);
});

test('switching a record to Treasury bill keeps the rate and purchase date and fixes compounding to none',()=>{
 const cash={...bill(),kind:'Cash',rate:0,deposit_compounding:'monthly',opened_on:null};
 const changed=changeRecordKind({...cash,kind:'Deposit',rate:5,deposit_compounding:'daily',opened_on:'2026-09-01'},'Treasury bill',today);
 assert.equal(changed.rate,5);assert.equal(changed.opened_on,'2026-09-01');assert.equal(changed.deposit_compounding,'none');
 assert.equal(changeRecordKind(cash,'Treasury bill',today).opened_on,today);
 assert.equal(changeRecordKind(bill(),'Property',today).rate,0,'a property has no rate');
});

test('a Treasury bill matures on its date, with its own label in the Telegram digest in every checked language',()=>{
 const [due]=upcomingPayments([bill({date:'2026-10-05'})],[],today);
 assert.equal(due.type,'maturity');assert.equal(due.date,'2026-10-05');
 assert.equal(upcomingPayments([bill({amount:0,date:'2026-10-05'})],[],today).length,0,'a redeemed bill has no reminder');
 for(const language of ['en','ru','uz'])assert.match(paymentsSection([due],language,today),new RegExp(JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'))['Treasury bill maturity']));
 assert.doesNotMatch(paymentsSection([due],'en',today),/deposit maturity/);
});

test('the tracker offers balance, interest and costs, and labels buying and redeeming a bill',()=>{
 assert.deepEqual(historyUpdateTypes('Treasury bill'),['valuation','income','expense']);
 assert.equal(historyEventLabel('Treasury bill','valuation'),'Balance update');
 assert.equal(historyEventLabel('Treasury bill','income'),'Interest received');
 assert.equal(historyEventLabel('Treasury bill','contribution'),'Buy');
 assert.equal(historyEventLabel('Treasury bill','withdrawal'),'Redeem');
});

test('the US Treasury bill benchmark is a selectable priced series that grows with BIL total return',()=>{
 assert.ok(benchmarkSelectionSchema.safeParse(['BIL']).success);
 assert.ok(benchmarkSelectionSchema.safeParse(['SPY','BIL','depositUSD']).success);
 assert.ok(!benchmarkSelectionSchema.safeParse(['BIL','BIL']).success,'no duplicates');
 const fx=[{date:'2025-01-01',rates:{USD:1,UZS:12000}}];
 const prices={BIL:[{date:'2025-01-01',close:100},{date:'2026-01-01',close:104.3}]};
 const result=compareInvestments(1000,[],[],{start:'2025-01-01',end:'2026-01-01',prices,fx,errors:{}},'USD');
 assert.ok(Math.abs(result.points.at(-1).BIL-1043)<1e-6);
 const uzs=compareInvestments(1000,[],[],{start:'2025-01-01',end:'2026-01-01',prices,fx,errors:{}},'UZS');
 assert.ok(Math.abs(uzs.points.at(-1).BIL-1043)<1e-6,'a USD benchmark in UZS uses the dated rate, not an invented one');
});

test('the sample workspace holds a Treasury bill and shows the BIL benchmark',()=>{
 const record=demoRecords(today).find(row=>row.kind==='Treasury bill');
 assert.ok(record);assert.equal(record.deposit_compounding,'none');assert.ok(record.date>today,'it matures in the future');
 assert.ok(demoBenchmarkKeys.includes('BIL'));
});

test('every interface language names Treasury bills and the BIL benchmark',()=>{
 for(const file of fs.readdirSync('lib/locales')){
  const labels=JSON.parse(fs.readFileSync('lib/locales/'+file,'utf8'));
  for(const key of ['Treasury bill','US Treasury bills · BIL','Annual yield (%)','Purchase date','Amount invested','Redeem','Treasury bill maturity'])assert.ok(labels[key],`${file}: ${key}`);
  assert.match(labels['US Treasury bills · BIL'],/BIL$/,file);
 }
});
