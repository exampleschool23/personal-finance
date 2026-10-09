import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {sharedDayRate}=loadTS('lib/day-rates.ts');
const {debtPaymentsInLoanCurrency}=loadTS('lib/planning.ts');
const {planningReadFilters,planningReadPlan,planningScopes,insightColumns}=loadTS('lib/planning-reads.ts');
const {datedRateRevalidate,loadDatedExchangeRate}=loadTS('lib/dated-exchange-rate.ts');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('a shared day rate asks once per pair and day, keeps failures, and holds at most four requests at a time',async()=>{
 const calls=[],pending=[];
 const rate=sharedDayRate((from,to,date)=>{calls.push([from,to,date].join(' '));return new Promise((resolve,reject)=>pending.push(()=>date==='2026-01-09'?reject(Error('no rate')):resolve(2)));});
 const days=['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05','2026-01-09'];
 const answers=[...days,...days].map(day=>rate('UZS','USD',day).catch(error=>error.message));
 await tick();
 assert.equal(calls.length,4,'four under way, the rest wait');
 while(pending.length){pending.shift()();await tick();}
 assert.deepEqual(calls.length,6,'each day once');
 assert.deepEqual(await Promise.all(answers),[2,2,2,2,2,'no rate',2,2,2,2,2,'no rate']);
 assert.equal(await rate('UZS','USD','2026-01-01'),2);assert.equal(calls.length,6,'a later ask for the same day reuses it');
 const other=rate('USD','UZS','2026-01-01');await tick();assert.equal(calls.length,7,'another pair is another request');pending.shift()();assert.equal(await other,2);
});

test('loan payments on one day in one currency cost one rate request',async()=>{
 const calls=[];
 const payments=['2026-09-01','2026-09-01','2026-09-01','2026-08-01'].map((date,index)=>({record_id:index%2?'car':'loan',date,amount:1270000,currency:'UZS'}));
 const counted=await debtPaymentsInLoanCurrency(payments,new Map([['loan','USD'],['car','USD']]),async(...args)=>{calls.push(args.join(' '));return 1/12700;});
 assert.deepEqual(calls,['UZS USD 2026-09-01','UZS USD 2026-08-01']);
 assert.ok(counted.every(payment=>payment.currency==='USD'&&Math.abs(payment.amount-100)<1e-9));
});

test('the pattern finders read two years and a month of income and spending, with schedules, and only the columns they use',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-09T03:00:00Z')});
 const insights=planningReadFilters('insights','2026-10').records;
 assert.equal(insights.or,'(frequency.neq.Once,date.gte.2024-09-01)');
 assert.equal(insights.kind,'in.(Salary,Rent income,Business income,Other income,Rent expense,Living expense,Charity,Other expense)');
 assert.equal(insights.select,insightColumns);
 // What the detector, the plan draft and the goal income link read.
 for(const column of ['id','name','kind','amount','currency','date','frequency','custom_category_id','account_id','end_date','archived','source_paused','earning_source_id','operation_id','history_event_id','mortgage_payment_id','movement_id','notes','quantity','cost','rate'])
  assert.ok(insights.select.split(',').includes(column),column);
});

test('each scope reads only its tables',()=>{
 const plan=scope=>{const {tables,debtPayments,historyOnly}=planningReadPlan(scope);return [[...tables].join(','),debtPayments,historyOnly];};
 assert.deepEqual(plan('full'),['movements,holdingAccounts,records,categories,goals,occurrences,activity,investmentLinks',true,false]);
 assert.deepEqual(plan('accounts'),plan('full'),'Accounts keeps every operation and movement');
 assert.deepEqual(plan('workspace'),['holdingAccounts,records,categories,goals,occurrences',true,false]);
 assert.deepEqual(plan('review'),['holdingAccounts,records,categories,goals,occurrences,activity,investmentLinks',false,false]);
 assert.deepEqual(plan('budget'),plan('review'));
 assert.deepEqual(plan('insights'),['records',false,true]);
 assert.deepEqual(plan('account-activity'),['records',false,true]);
 assert.deepEqual([...planningScopes].sort(),['account-activity','accounts','budget','full','insights','review','workspace']);
});

test('a past day’s official rate is kept for a month, today’s for an hour',async()=>{
 assert.equal(datedRateRevalidate('2026-10-08','2026-10-09'),30*24*3600);
 assert.equal(datedRateRevalidate('2026-10-09','2026-10-09'),3600);
 assert.equal(datedRateRevalidate('2026-10-10','2026-10-09'),3600);
 const seen=[],original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{seen.push([String(url).split('/')[2],init.next.revalidate]);return Response.json({base:'EUR',date:'2025-03-03',rates:{USD:1.04}});};
 try{assert.equal((await loadDatedExchangeRate('EUR','USD','2025-03-03')).rate,1.04);}finally{globalThis.fetch=original;}
 assert.deepEqual(seen,[['api.frankfurter.dev',30*24*3600]]);
});

test('identical reads share one request while it is under way, and a save to the same address asks again',async()=>{
 const requests=[];
 const refreshRead=(url,options)=>new Promise(resolve=>requests.push({url,signal:options.signal,reply:data=>resolve(Response.json(data))}));
 const {sharedRead,saveOwnerResource}=loadTS('hooks/use-owner-resource.ts',{'@/lib/refresh-read':{refreshRead},'@/lib/feedback':{showSaved:()=>{}},'@/lib/api-client':{requestJson:async()=>({})},react:{useEffect:()=>{},useRef:()=>({}),useState:()=>[]}});
 const key='me:/api/planning?scope=review&month=2026-10:3:0',url='/api/planning?scope=review&month=2026-10';
 // Two Overview cards that mount a tick apart, for the same revision.
 const first=sharedRead(key,url,new AbortController().signal);
 await tick();
 const second=sharedRead(key,url,new AbortController().signal);
 assert.equal(requests.length,1);
 assert.equal(sharedRead('me:'+url+':4:0',url,new AbortController().signal)!==first,true);assert.equal(requests.length,2,'a new revision asks again');
 requests[0].reply({records:[]});requests[1].reply({records:[]});
 assert.deepEqual([JSON.parse((await first).text),JSON.parse((await second).text)],[{records:[]},{records:[]}]);
 await tick();
 sharedRead(key,url,new AbortController().signal).catch(()=>{});assert.equal(requests.length,3,'an answered read is not reused');
 await saveOwnerResource('/api/planning','save',{});
 sharedRead(key,url,new AbortController().signal).catch(()=>{});assert.equal(requests.length,4,'a read under way before a save is not joined');
});
