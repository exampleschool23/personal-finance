import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// The planning route with its network-facing imports replaced; validation, schemas and filters stay real.
const ids=Array.from({length:9},(_,index)=>`10000000-0000-4000-8000-00000000000${index+1}`);
const [ACCOUNT,TARGET,TX,GOAL,OTHER]=ids;
function harness(){
 const state={auth:{token:'owner-token',user:{id:'owner'}},reads:[],calls:[],events:[],rateCalls:[],rows:{},forecasts:[],forecastCalls:0,readError:null,rate:{rate:12500,effective_date:'2026-09-29'},rateError:null,
  handler:()=>Response.json({ok:true})};
 const api=loadTS('app/api/planning/route.ts',{
  '@/lib/supabase':{session:async()=>state.auth,supa:async(path,init,token)=>{state.calls.push({path,init,token,body:init?.body?JSON.parse(init.body):undefined});return state.handler(path,init,token);},sameOrigin:loadTS('lib/api-route.ts').sameOrigin},
  '@/lib/server-records':{readOwnerRows:async(table,token,extra)=>{state.reads.push({table,token,extra});if(state.readError)throw state.readError;return state.rows[table]??[];}},
  '@/lib/deposit-forecasts':{depositForecasts:async token=>{state.forecastCalls++;assert.equal(token,'owner-token');return state.forecasts;}},
  '@/lib/dated-exchange-rate':{loadDatedExchangeRate:async(...args)=>{state.rateCalls.push(args);if(state.rateError)throw state.rateError;return state.rate;}},
  '@/lib/notify-action':{queueMilestoneCheck:(auth,event)=>{assert.equal(auth.token,'owner-token');state.events.push(event);}},
 });
 return {api,state};
}
const get=query=>new Request('https://app.local/api/planning'+query);
const post=(body,headers={origin:'https://app.local'})=>new Request('https://app.local/api/planning',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
const json=async response=>({status:response.status,body:await response.json()});
const tables=state=>state.reads.map(read=>read.table);

test('GET refuses anonymous callers and malformed scopes or months',async()=>{
 const {api,state}=harness();
 state.auth=null;
 assert.deepEqual(await json(await api.GET(get(''))),{status:401,body:{error:'Please sign in again.'}});
 state.auth={token:'owner-token'};
 assert.deepEqual(await json(await api.GET(get('?scope=everything'))),{status:400,body:{error:'Invalid planning scope.'}});
 for(const month of ['2026-13','2026-00','26-01','2026-1'])assert.deepEqual(await json(await api.GET(get('?month='+month))),{status:400,body:{error:'Invalid review month.'}});
 // A budget read needs a start month, no later than the end and at most two years earlier.
 for(const query of ['?scope=budget&month=2026-09','?scope=budget&month=2026-09&from=2026-9','?scope=budget&month=2026-09&from=2026-10','?scope=budget&month=2026-09&from=2024-09'])assert.equal((await api.GET(get(query))).status,400,query);
 assert.equal(state.reads.length,0);
});

test('GET full scope reads every table, adds debt payments and deposit estimates, and is never cached',async()=>{
 const {api,state}=harness();
 state.rows={finance_records:[{id:'d1',kind:'Deposit',amount:1000},{id:'d2',kind:'Treasury bill',amount:500},{id:'s1',kind:'Salary',amount:10}],
  account_activity:[{action:'repayment',target_id:'loan',occurred_on:'2026-09-05'},{action:'repayment',target_id:null,occurred_on:'2026-09-06'},{action:'transfer',target_id:'x',occurred_on:'2026-09-07'}],
  mortgage_payments:[{mortgage_id:'home',paid_on:'2026-09-10'}]};
 state.forecasts=[{id:'d1',estimated_monthly_income:42}];
 const response=await api.GET();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();
 assert.deepEqual(tables(state).slice(0,8),['asset_movements','holding_accounts','finance_records','transaction_categories','savings_goals','payment_occurrences','account_activity','investment_account_links']);
 assert.deepEqual(state.reads.slice(8).map(read=>[read.table,read.extra]),[['account_activity',{select:'action,target_id,occurred_on',action:'in.(repayment,mortgage)'}],['mortgage_payments',{select:'id,mortgage_id,paid_on'}]]);
 assert.ok(state.reads.every(read=>read.token==='owner-token'));
 assert.deepEqual(state.reads[2].extra,{},'a full read keeps every record');
 assert.deepEqual(body.debtPayments,[{record_id:'loan',date:'2026-09-05'},{record_id:'home',date:'2026-09-10'}]);
 // Interest-bearing holdings carry the forecast, or zero when none is known; other kinds stay untouched.
 assert.deepEqual(body.records,[{id:'d1',kind:'Deposit',amount:1000,estimated_monthly_income:42},{id:'d2',kind:'Treasury bill',amount:500,estimated_monthly_income:0},{id:'s1',kind:'Salary',amount:10}]);
 assert.equal(state.forecastCalls,1);
});

test('GET narrower scopes read only what they need',async()=>{
 let {api,state}=harness();
 let body=await (await api.GET(get('?scope=insights&month=2026-09'))).json();
 assert.deepEqual(tables(state),['finance_records']);assert.equal(state.forecastCalls,0);assert.equal(body.debtPayments,undefined);
 assert.deepEqual(body.goals,[]);assert.deepEqual(body.movements,[]);

 ({api,state}=harness());
 body=await (await api.GET(get('?scope=review&month=2026-09'))).json();
 assert.deepEqual(tables(state),['holding_accounts','finance_records','transaction_categories','savings_goals','payment_occurrences','account_activity','investment_account_links']);
 assert.equal(body.debtPayments,undefined);
 assert.match(state.reads[1].extra.or,/date\.gte\.2026-08-01,date\.lt\.2026-10-01/);
 assert.equal(state.reads[5].extra.and,'(occurred_on.gte.2026-08-01,occurred_on.lt.2026-10-01)');

 ({api,state}=harness());
 body=await (await api.GET(get('?scope=workspace&month=2026-09'))).json();
 assert.deepEqual(tables(state),['holding_accounts','finance_records','transaction_categories','savings_goals','payment_occurrences','account_activity','mortgage_payments']);
 assert.deepEqual(body.debtPayments,[]);assert.doesNotMatch(state.reads[1].extra.or,/date\.gte/);

 ({api,state}=harness());
 assert.equal((await api.GET(get('?scope=budget&month=2026-09&from=2024-10'))).status,200);
 assert.deepEqual(tables(state),['holding_accounts','finance_records','transaction_categories','savings_goals','payment_occurrences','account_activity','investment_account_links']);
 assert.match(state.reads[1].extra.or,/date\.gte\.2024-10-01,date\.lt\.2026-10-01/);
});

test('GET answers 503 when a read fails',async()=>{
 const {api,state}=harness();state.readError=Error('offline');
 assert.deepEqual(await json(await api.GET(get('?scope=full'))),{status:503,body:{error:'Could not load planning data. Check that the latest migrations are installed.'}});
});

test('POST refuses other sites, anonymous callers and malformed bodies before any write',async()=>{
 const {api,state}=harness();
 let response=await api.POST(post({action:'dismiss',data:{id:TX,target_id:TARGET,date:'2026-09-01'}},{origin:'https://evil.example'}));
 assert.equal(response.status,403);assert.equal(await response.text(),'');
 assert.equal((await api.POST(post({},{'sec-fetch-site':'cross-site'}))).status,403);
 state.auth=null;
 assert.equal((await api.POST(post({action:'dismiss',data:{id:TX,target_id:TARGET,date:'2026-09-01'}}))).status,401);
 state.auth={token:'owner-token'};
 for(const body of ['not json',{action:'nope',data:{}},{action:'dismiss',data:{id:'x',target_id:TARGET,date:'2026-09-01'}},{action:'dismiss',data:{id:TX,target_id:TARGET,date:'2026-02-30'}}])
  assert.deepEqual(await json(await api.POST(post(body))),{status:400,body:{error:'Check the account fields.'}});
 assert.equal(state.calls.length,0);assert.equal(state.events.length,0);
});

test('POST delete_goal moves the goal to Recently deleted and names database failures',async()=>{
 const {api,state}=harness();
 assert.deepEqual(await json(await api.POST(post({action:'delete_goal',data:{id:GOAL}}))),{status:200,body:{ok:true}});
 assert.deepEqual(state.calls.map(call=>[call.path,call.body,call.token]),[['/rest/v1/rpc/delete_savings_goal',{p_id:GOAL},'owner-token']]);
 assert.deepEqual(state.events,[{type:'goal_deleted'}]);
 state.handler=()=>Response.json({code:'PGRST202'},{status:404});
 assert.deepEqual(await json(await api.POST(post({action:'delete_goal',data:{id:GOAL}}))),{status:503,body:{error:'Goal deletion needs the latest database update.'}});
 state.handler=()=>Response.json({code:'XX000'},{status:500});
 assert.deepEqual(await json(await api.POST(post({action:'delete_goal',data:{id:GOAL}}))),{status:409,body:{error:'Could not delete the goal. Please try again.'}});
 assert.equal(state.events.length,1);
});

test('POST exception sends a trimmed note only with a skip',async()=>{
 const {api,state}=harness();
 assert.equal((await api.POST(post({action:'exception',data:{target_id:TARGET,date:'2026-09-15',skip:true,notes:'  Holiday  '}}))).status,200);
 assert.deepEqual(state.calls.pop().body,{p_record:TARGET,p_day:'2026-09-15',p_skip:true,p_notes:'Holiday'});
 assert.equal((await api.POST(post({action:'exception',data:{target_id:TARGET,date:'2026-09-15',skip:true,notes:'   '}}))).status,200);
 assert.deepEqual(state.calls.pop().body,{p_record:TARGET,p_day:'2026-09-15',p_skip:true});
 assert.equal((await api.POST(post({action:'exception',data:{target_id:TARGET,date:'2026-09-15',skip:false,notes:'ignored'}}))).status,200);
 const call=state.calls.pop();assert.equal(call.path,'/rest/v1/rpc/set_schedule_exception');assert.deepEqual(call.body,{p_record:TARGET,p_day:'2026-09-15',p_skip:false});
 assert.deepEqual(state.events.at(-1),{type:'exception',target_id:TARGET,date:'2026-09-15',skip:false});
 state.handler=()=>Response.json({code:'PGRST202'},{status:404});
 assert.equal((await api.POST(post({action:'exception',data:{target_id:TARGET,date:'2026-09-15',skip:true}}))).status,503);
 state.handler=()=>Response.json({code:'P0001',message:'Not a schedule.'},{status:400});
 assert.deepEqual(await json(await api.POST(post({action:'exception',data:{target_id:TARGET,date:'2026-09-15',skip:true}}))),{status:409,body:{error:'Not a schedule.'}});
});

test('POST category refuses a name taken in any letter case and saves others without forged fields',async()=>{
 const {api,state}=harness();
 state.rows.transaction_categories=[{id:OTHER,name:'Coffee',direction:'expense'}];
 assert.deepEqual(await json(await api.POST(post({action:'category',data:{id:GOAL,name:' coffee ',direction:'expense'}}))),{status:409,body:{error:'A category with this name already exists.'}});
 assert.equal(state.calls.length,0);
 // Renaming the same category to itself is allowed.
 assert.equal((await api.POST(post({action:'category',data:{id:OTHER,name:'COFFEE',direction:'expense',user_id:'attacker'}}))).status,200);
 assert.deepEqual(state.calls.pop().body,{p_action:'category',p_data:{id:OTHER,name:'COFFEE',direction:'expense'}});
 assert.equal(state.events.length,0,'categories send no milestone');
});

test('POST transfer, reconcile, dismiss and goal go through planning_action and queue their event',async()=>{
 const {api,state}=harness();
 state.handler=()=>Response.json({saved:true});
 const transfer={id:TX,account_id:ACCOUNT,target_id:TARGET,amount:100,received:90,date:'2026-09-02'};
 assert.deepEqual(await json(await api.POST(post({action:'transfer',data:transfer}))),{status:200,body:{saved:true}});
 const call=state.calls.pop();
 assert.deepEqual([call.path,call.init.method,call.token,call.body],['/rest/v1/rpc/planning_action','POST','owner-token',{p_action:'transfer',p_data:{...transfer,fee:0,notes:''}}]);
 assert.deepEqual(state.events.pop(),{type:'transfer',account_id:ACCOUNT,target_id:TARGET,amount:100,received:90,date:'2026-09-02'});
 assert.equal((await api.POST(post({action:'reconcile',data:{id:TX,account_id:ACCOUNT,amount:5,date:'2026-09-03'}}))).status,200);
 assert.deepEqual(state.events.pop(),{type:'reconcile',account_id:ACCOUNT,amount:5,date:'2026-09-03'});
 assert.equal((await api.POST(post({action:'dismiss',data:{id:TX,target_id:TARGET,date:'2026-09-04'}}))).status,200);
 assert.deepEqual(state.events.pop(),{type:'dismiss',target_id:TARGET,date:'2026-09-04'});
 assert.equal((await api.POST(post({action:'goal',data:{id:GOAL,name:'Car',account_id:ACCOUNT,target:5000,allocated:100,target_date:null}}))).status,200);
 assert.equal(state.calls.pop().path,'/rest/v1/rpc/planning_action');
 assert.deepEqual(state.events.pop(),{type:'goal',name:'Car',target:5000,currency:''});
 assert.equal((await api.POST(post({action:'goal',data:{id:GOAL,name:'Million',kind:'net_worth',currency:'EUR',account_id:null,target:1e6,allocated:0,target_date:'2030-12-31'}}))).status,200);
 assert.deepEqual(state.events.pop(),{type:'goal',name:'Million',target:1e6,currency:'EUR'});
});

test('POST maps planning_action database codes to readable refusals',async()=>{
 const {api,state}=harness();
 const transfer={action:'transfer',data:{id:TX,account_id:ACCOUNT,target_id:TARGET,amount:100,received:100,date:'2026-09-02'}};
 for(const [code,error] of [['23514','Insufficient balance or invalid amount.'],['23505','This name or payment already exists.'],['XX000','Could not save the operation. Please try again.']]){
  state.handler=()=>Response.json({code},{status:400});
  assert.deepEqual(await json(await api.POST(post(transfer))),{status:409,body:{error}});
 }
 // A thrown connection error is reported as unavailable rather than leaking.
 state.handler=()=>{throw TypeError('fetch failed');};
 assert.deepEqual(await json(await api.POST(post(transfer))),{status:503,body:{error:'Connection unavailable. Please try again.'}});
 assert.equal(state.events.length,0);
});

test('POST multi-holding goals check schema support and use their own function',async()=>{
 const {api,state}=harness();
 const target={holding_account_id:ACCOUNT,asset_kind:'Crypto',asset_symbol:'BTC',target:2,monthly_contribution:.1};
 const goal={id:GOAL,name:'Two BTC',kind:'investment',account_id:null,holding_account_id:ACCOUNT,asset_kind:'Crypto',asset_symbol:'BTC',target:2,allocated:0,target_date:null,investment_targets:[target]};
 state.handler=path=>path.startsWith('/rest/v1/savings_goals')?new Response('[]',{status:400}):Response.json({ok:true});
 assert.deepEqual(await json(await api.POST(post({action:'goal',data:goal}))),{status:503,body:{error:'Goal holdings could not be saved. Please try again after the app database is updated.'}});
 assert.deepEqual(state.calls.map(call=>call.path),['/rest/v1/savings_goals?select=investment_targets&limit=0']);
 state.handler=path=>path.startsWith('/rest/v1/savings_goals')?Response.json([]):Response.json({code:'PGRST202'},{status:404});
 assert.deepEqual(await json(await api.POST(post({action:'goal',data:goal}))),{status:409,body:{error:'Could not save the goal. Check that the latest migrations are installed.'}});
 state.handler=path=>path.startsWith('/rest/v1/savings_goals')?Response.json([]):Response.json({id:GOAL});
 assert.deepEqual(await json(await api.POST(post({action:'goal',data:goal}))),{status:200,body:{id:GOAL}});
 const call=state.calls.pop();assert.equal(call.path,'/rest/v1/rpc/planning_investment_goal');assert.deepEqual(Object.keys(call.body),['p_data']);
 assert.deepEqual(call.body.p_data.investment_targets,[target]);
 // A single-holding investment goal without the list still uses planning_action.
 const single={...goal};delete single.investment_targets;
 assert.equal((await api.POST(post({action:'goal',data:single}))).status,200);
 assert.equal(state.calls.pop().path,'/rest/v1/rpc/planning_action');
});

const recordsResponse=records=>Response.json(records);
function paymentHandler(state,{records,history=[],historyOk=true,occurrences=[],occurrencesOk=true,recordsOk=true,rpc=()=>Response.json({ok:true})}){
 state.handler=(path,init)=>{
  if(path.startsWith('/rest/v1/finance_records'))return recordsOk?recordsResponse(records):new Response('',{status:500});
  if(path.startsWith('/rest/v1/investment_account_links'))return historyOk?Response.json(history):new Response('',{status:500});
  if(path.startsWith('/rest/v1/payment_occurrences'))return occurrencesOk?Response.json(occurrences):new Response('',{status:500});
  return rpc(path,init);
 };
}
const usdAccount={id:ACCOUNT,kind:'Cash',currency:'USD',amount:1000};
const uzsAccount={id:ACCOUNT,kind:'Cash',currency:'UZS',amount:5e6};
const usdLoan={id:TARGET,kind:'Loan',currency:'USD',amount:300};

test('POST occurrence pays a same-currency schedule once and refuses a second transaction',async()=>{
 const {api,state}=harness();
 const data={id:TX,account_id:ACCOUNT,target_id:TARGET,amount:40,date:'2026-09-20'};
 paymentHandler(state,{records:[usdAccount,{id:TARGET,kind:'Living expense',currency:'USD',amount:40}],occurrences:[{transaction_id:TX}]});
 assert.equal((await api.POST(post({action:'occurrence',data}))).status,200);
 assert.equal(state.calls[0].path,`/rest/v1/finance_records?select=*&id=in.(${ACCOUNT},${TARGET},${TX})`);
 assert.equal(state.calls[1].path,`/rest/v1/payment_occurrences?select=transaction_id&status=eq.paid&record_id=eq.${TARGET}&due_on=eq.2026-09-20`);
 assert.equal(state.calls[2].path,'/rest/v1/rpc/planning_action_with_actual_amount');
 assert.deepEqual(state.calls[2].body,{p_action:'occurrence',p_data:{...data,notes:''}});
 assert.deepEqual(state.events.pop(),{type:'occurrence',account_id:ACCOUNT,target_id:TARGET,amount:40,date:'2026-09-20'});
 state.calls.length=0;
 paymentHandler(state,{records:[usdAccount,{id:TARGET,kind:'Living expense',currency:'USD',amount:40}],occurrences:[{transaction_id:OTHER}]});
 assert.deepEqual(await json(await api.POST(post({action:'occurrence',data}))),{status:409,body:{error:'This scheduled payment is already recorded. Keep its transaction.'}});
 paymentHandler(state,{records:[usdAccount,{id:TARGET,kind:'Living expense',currency:'USD',amount:40}],occurrencesOk:false});
 assert.deepEqual(await json(await api.POST(post({action:'occurrence',data}))),{status:503,body:{error:'Could not save the operation. Please try again.'}});
 paymentHandler(state,{records:[],recordsOk:false});
 assert.deepEqual(await json(await api.POST(post({action:'occurrence',data}))),{status:503,body:{error:'Could not load accounts or exchange history.'}});
 // The paying account must be one of the caller's cash accounts.
 paymentHandler(state,{records:[{...usdAccount,kind:'Stock'},usdLoan]});
 assert.deepEqual(await json(await api.POST(post({action:'occurrence',data}))),{status:400,body:{error:'Choose one of your cash accounts.'}});
 paymentHandler(state,{records:[usdAccount]});
 assert.equal((await api.POST(post({action:'occurrence',data}))).status,400);
});

test('POST occurrence across currencies checks the dated rate and stores it with the payment',async()=>{
 const {api,state}=harness();
 const target={id:TARGET,kind:'Living expense',currency:'USD',amount:40};
 const data={id:TX,account_id:ACCOUNT,target_id:TARGET,amount:40,date:'2026-09-20',exchange_rate:12500};
 paymentHandler(state,{records:[uzsAccount,target]});
 assert.equal((await api.POST(post({action:'occurrence',data}))).status,200);
 assert.deepEqual(state.rateCalls,[['UZS','USD','2026-09-20']]);
 assert.deepEqual(state.calls.at(-1).body.p_data,{...data,notes:'',account_exchange_rate:12500,account_rate_date:'2026-09-29',account_currency:'UZS'});
 assert.ok(!state.calls.some(call=>call.path.startsWith('/rest/v1/investment_account_links')),'occurrences never read investment links');
 // A retried payment keeps the rate it was first saved with, without a new lookup.
 state.rateCalls.length=0;
 const saved={id:TX,account_id:ACCOUNT,currency:'USD',date:'2026-09-20',account_currency:'UZS',account_exchange_rate:12000,account_rate_date:'2026-09-19'};
 paymentHandler(state,{records:[uzsAccount,target,saved]});
 assert.equal((await api.POST(post({action:'occurrence',data:{...data,exchange_rate:12000}}))).status,200);
 assert.equal(state.rateCalls.length,0);assert.equal(state.calls.at(-1).body.p_data.account_rate_date,'2026-09-19');
 paymentHandler(state,{records:[uzsAccount,target]});
 assert.deepEqual(await json(await api.POST(post({action:'occurrence',data:{...data,exchange_rate:12400}}))),{status:409,body:{error:'The exchange rate changed. Refresh the rate and review the amounts.'}});
 state.rateError=Error('no rate');
 assert.deepEqual(await json(await api.POST(post({action:'occurrence',data}))),{status:422,body:{error:'Historical exchange rates are unavailable.'}});
});

test('POST repayment refuses more than the balance and saves same-currency repayments',async()=>{
 const {api,state}=harness();
 const data={id:TX,account_id:ACCOUNT,target_id:TARGET,amount:301,date:'2026-09-21'};
 paymentHandler(state,{records:[usdAccount,usdLoan]});
 assert.deepEqual(await json(await api.POST(post({action:'repayment',data}))),{status:409,body:{error:'Repayment cannot exceed the outstanding balance.'}});
 assert.equal((await api.POST(post({action:'repayment',data:{...data,amount:300}}))).status,200);
 assert.equal(state.calls.at(-1).path,'/rest/v1/rpc/planning_action');
 assert.deepEqual(state.events.pop(),{type:'repayment',account_id:ACCOUNT,target_id:TARGET,amount:300,date:'2026-09-21'});
});

test('POST repayment across currencies uses the atomic FX function and guards against changed retries',async()=>{
 const {api,state}=harness();
 const data={id:TX,account_id:ACCOUNT,target_id:TARGET,amount:100,date:'2026-09-21',exchange_rate:12500};
 paymentHandler(state,{records:[uzsAccount,usdLoan],history:[],rpc:()=>Response.json({id:TX,saved:true})});
 assert.deepEqual(await json(await api.POST(post({action:'repayment',data}))),{status:200,body:{id:TX,saved:true}});
 assert.equal(state.calls[1].path,`/rest/v1/investment_account_links?select=*,investment_history(balance)&id=eq.${TX}`);
 const rpc=state.calls.at(-1);assert.equal(rpc.path,'/rest/v1/rpc/record_repayment_with_fx');
 assert.deepEqual(rpc.body,{p_data:{...data,received:0,fee:0,notes:''},p_rate:12500,p_rate_date:'2026-09-29',p_account_currency:'UZS',p_record_currency:'USD'});
 assert.deepEqual(state.events.pop(),{type:'repayment',account_id:ACCOUNT,target_id:TARGET,amount:100,date:'2026-09-21'});
 // A matching earlier payment keeps its own rate.
 state.rateCalls.length=0;
 const prior={exchange_rate:12100,rate_date:'2026-09-18',account_id:ACCOUNT,account_currency:'UZS',record_currency:'USD',investment_history:{balance:null}};
 paymentHandler(state,{records:[uzsAccount,usdLoan],history:[prior]});
 assert.equal((await api.POST(post({action:'repayment',data:{...data,exchange_rate:12100}}))).status,200);
 assert.equal(state.rateCalls.length,0);assert.equal(state.calls.at(-1).body.p_rate_date,'2026-09-18');
 for(const change of [{account_id:OTHER},{account_currency:'EUR'},{record_currency:'EUR'},{exchange_rate:0}]){
  paymentHandler(state,{records:[uzsAccount,usdLoan],history:[{...prior,...change}]});
  assert.deepEqual(await json(await api.POST(post({action:'repayment',data}))),{status:409,body:{error:'This update was already saved with different details.'}});
 }
 paymentHandler(state,{records:[uzsAccount,usdLoan],historyOk:false});
 assert.deepEqual(await json(await api.POST(post({action:'repayment',data}))),{status:503,body:{error:'Could not load accounts or exchange history.'}});
 paymentHandler(state,{records:[uzsAccount,usdLoan],rpc:()=>Response.json({code:'P0001',message:'Account balance is too low.'},{status:400})});
 assert.deepEqual(await json(await api.POST(post({action:'repayment',data}))),{status:409,body:{error:'Account balance is too low.'}});
 paymentHandler(state,{records:[uzsAccount,usdLoan],rpc:()=>Response.json({},{status:500})});
 assert.deepEqual(await json(await api.POST(post({action:'repayment',data}))),{status:409,body:{error:'Could not save the operation. Please try again.'}});
});

test('POST mortgage across currencies records principal and interest as one dated payment',async()=>{
 const {api,state}=harness();
 const mortgage={id:TARGET,kind:'Mortgage',currency:'USD',amount:90000};
 const data={id:TX,account_id:ACCOUNT,target_id:TARGET,amount:700,fee:300,notes:'September',date:'2026-09-25',exchange_rate:12500};
 paymentHandler(state,{records:[uzsAccount,mortgage],rpc:()=>Response.json({ok:true})});
 assert.equal((await api.POST(post({action:'mortgage',data}))).status,200);
 const rpc=state.calls.at(-1);assert.equal(rpc.path,'/rest/v1/rpc/record_investment_with_fx');
 assert.deepEqual(rpc.body,{p_id:TX,p_record_id:TARGET,p_type:'mortgage_payment',p_date:'2026-09-25',p_amount:1000,p_balance:null,p_notes:'September',p_account:ACCOUNT,p_rate:12500,p_rate_date:'2026-09-29',p_account_currency:'UZS',p_record_currency:'USD',p_principal:700,p_interest:300});
 assert.deepEqual(state.events.pop(),{type:'mortgage',account_id:ACCOUNT,target_id:TARGET,principal:700,interest:300,date:'2026-09-25'});
 // Same-currency mortgage payments use planning_action.
 paymentHandler(state,{records:[usdAccount,mortgage]});
 assert.equal((await api.POST(post({action:'mortgage',data:{...data,exchange_rate:undefined}}))).status,200);
 assert.equal(state.calls.at(-1).path,'/rest/v1/rpc/planning_action');
});
