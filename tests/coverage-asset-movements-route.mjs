import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// The asset movement route with its network-facing imports replaced; validation and the rate checks stay real.
const SOURCE='10000000-0000-4000-8000-000000000001',TARGET='10000000-0000-4000-8000-000000000002',MOVE='10000000-0000-4000-8000-000000000003';
function harness(){
 const state={auth:{token:'owner-token',user:{id:'owner'}},calls:[],events:[],rateCalls:[],reports:[],
  accounts:[{id:SOURCE,currency:'USD'},{id:TARGET,currency:'USD'}],prior:[],rate:{rate:12500,effective_date:'2026-09-29'},rateError:null,
  failAccounts:false,failPrior:false,rpc:()=>new Response('null',{status:200}),throws:false};
 const api=loadTS('app/api/asset-movements/route.ts',{
  '@/lib/supabase':{session:async()=>state.auth,sameOrigin:loadTS('lib/api-route.ts',{'@/lib/monitoring':{reportError:async()=>{}}}).sameOrigin,supa:async(path,init,token)=>{
   if(state.throws)throw Error('offline');
   state.calls.push({path,token,body:init?.body?JSON.parse(init.body):undefined});
   if(path.startsWith('/rest/v1/finance_records'))return state.failAccounts?new Response('{}',{status:500}):Response.json(state.accounts);
   if(path.startsWith('/rest/v1/asset_movements'))return state.failPrior?new Response('{}',{status:500}):Response.json(state.prior);
   return state.rpc(path);
  }},
  '@/lib/dated-exchange-rate':{loadDatedExchangeRate:async(...args)=>{state.rateCalls.push(args);if(state.rateError)throw state.rateError;return state.rate;}},
  '@/lib/notify-action':{queueMilestoneCheck:(auth,event)=>{assert.equal(auth.token,'owner-token');state.events.push(event);}},
  '@/lib/monitoring':{reportError:async(...args)=>{state.reports.push(args);}},
 });
 return {api,state};
}
const movement=(changes={})=>({id:MOVE,kind:'transfer',source_id:SOURCE,target_id:TARGET,sent:100,received:100,source_value:100,target_value:100,fee:0,date:'2026-09-30',notes:'',...changes});
const post=(body,headers={origin:'https://app.local'})=>new Request('https://app.local/api/asset-movements',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
const json=async response=>({status:response.status,body:await response.json()});
const rpcCalls=state=>state.calls.filter(call=>call.path.startsWith('/rest/v1/rpc/'));
const usdToUzs=state=>{state.accounts=[{id:SOURCE,currency:'USD'},{id:TARGET,currency:'UZS'}];};

test('POST refuses cross-site requests, anonymous callers and malformed movements',async()=>{
 const {api,state}=harness();
 assert.equal((await api.POST(post(movement(),{origin:'https://evil.example'}))).status,403);
 state.auth=null;
 assert.deepEqual(await json(await api.POST(post(movement()))),{status:401,body:{error:'Please sign in again.'}});
 state.auth={token:'owner-token',user:{id:'owner'}};
 const invalid=[
  'not json',
  movement({kind:'gift'}),
  movement({source_id:TARGET}),// a transfer needs two different accounts
  movement({sent:0}),// and money leaving the source
  movement({received:0}),
  movement({kind:'interest'}),// interest stays inside one account and sends nothing
  movement({exchange_rate:0}),
  movement({date:'2026-02-30'}),
  movement({sent:-5}),
 ];
 for(const body of invalid)assert.deepEqual(await json(await api.POST(post(body))),{status:400,body:{error:'Check the movement fields.'}},JSON.stringify(body));
 assert.equal(state.calls.length,0);
});

test('POST saves buys, sells and interest through record_asset_movement without reading accounts',async()=>{
 const {api,state}=harness();
 assert.deepEqual(await json(await api.POST(post(movement({kind:'buy'})))),{status:200,body:{ok:true}});
 assert.deepEqual(await json(await api.POST(post(movement({kind:'interest',target_id:SOURCE,sent:0,received:12})))),{status:200,body:{ok:true}});
 assert.deepEqual(state.calls.map(call=>call.path),['/rest/v1/rpc/record_asset_movement','/rest/v1/rpc/record_asset_movement']);
 assert.equal(state.calls[0].token,'owner-token');
 assert.deepEqual(state.calls[0].body,{p_data:movement({kind:'buy'})});
 assert.deepEqual(state.events,[
  {type:'movement',kind:'buy',source_id:SOURCE,target_id:TARGET,sent:100,received:100,date:'2026-09-30'},
  {type:'movement',kind:'interest',source_id:SOURCE,target_id:SOURCE,sent:0,received:12,date:'2026-09-30'},
 ]);
});

test('POST transfers between accounts in one currency without an exchange rate',async()=>{
 const {api,state}=harness();
 assert.equal((await api.POST(post(movement()))).status,200);
 assert.equal(state.calls[0].path,`/rest/v1/finance_records?select=id,currency&id=in.(${SOURCE},${TARGET})`);
 assert.deepEqual(rpcCalls(state).map(call=>[call.path,call.body]),[['/rest/v1/rpc/record_asset_movement',{p_data:movement()}]]);
 assert.equal(state.rateCalls.length,0);
});

test('POST refuses a transfer whose accounts cannot be read or are not the caller\'s',async()=>{
 let {api,state}=harness();
 state.failAccounts=true;
 assert.deepEqual(await json(await api.POST(post(movement()))),{status:503,body:{error:'Could not load accounts or exchange history.'}});
 ({api,state}=harness());
 state.accounts=[{id:SOURCE,currency:'USD'}];// the destination belongs to someone else, so RLS hides it
 assert.deepEqual(await json(await api.POST(post(movement()))),{status:400,body:{error:'Choose your own source and destination.'}});
 assert.equal(rpcCalls(state).length,0);assert.equal(state.events.length,0);
});

test('POST checks a new cross-currency transfer against the dated rate of its day',async()=>{
 let {api,state}=harness();usdToUzs(state);
 assert.deepEqual(await json(await api.POST(post(movement({received:1250000})))),{status:400,body:{error:'Check the dated exchange rate.'}});
 assert.equal(state.calls.length,1,'no rate is inferred when the client sends none');

 ({api,state}=harness());usdToUzs(state);
 const body=movement({received:1250000,target_value:1250000,exchange_rate:12500});
 assert.deepEqual(await json(await api.POST(post(body))),{status:200,body:{ok:true}});
 assert.equal(state.calls[1].path,`/rest/v1/asset_movements?select=exchange_rate,rate_date&id=eq.${MOVE}`);
 assert.deepEqual(state.rateCalls,[['USD','UZS','2026-09-30']]);
 assert.deepEqual(rpcCalls(state).map(call=>[call.path,call.body]),[['/rest/v1/rpc/record_transfer_with_fx',{p_data:body,p_rate:12500,p_rate_date:'2026-09-29',p_source_currency:'USD',p_target_currency:'UZS'}]]);
 assert.equal(state.events.length,1);

 ({api,state}=harness());usdToUzs(state);
 state.rate={rate:12600,effective_date:'2026-09-30'};
 assert.deepEqual(await json(await api.POST(post(body))),{status:409,body:{error:'The exchange rate changed. Refresh the rate and review the amounts.'}});
 assert.equal(rpcCalls(state).length,0);

 ({api,state}=harness());usdToUzs(state);
 state.rateError=Error('no rate');
 assert.deepEqual(await json(await api.POST(post(body))),{status:422,body:{error:'Historical exchange rates are unavailable.'}});
 assert.equal(rpcCalls(state).length,0);

 ({api,state}=harness());usdToUzs(state);
 state.failPrior=true;
 assert.deepEqual(await json(await api.POST(post(body))),{status:503,body:{error:'Could not load accounts or exchange history.'}});
 assert.equal(state.rateCalls.length,0);
});

test('POST replays a saved cross-currency transfer through its stored rate, never a fresh quote',async()=>{
 let {api,state}=harness();usdToUzs(state);
 state.prior=[{exchange_rate:'12400.5',rate_date:'2026-09-28'}];
 const body=movement({received:1240050,target_value:1240050,exchange_rate:12400.5});
 assert.deepEqual(await json(await api.POST(post(body))),{status:200,body:{ok:true}});
 assert.equal(state.rateCalls.length,0,'the replay does not ask for today\'s rate');
 assert.deepEqual(rpcCalls(state)[0].body,{p_data:body,p_rate:12400.5,p_rate_date:'2026-09-28',p_source_currency:'USD',p_target_currency:'UZS'});

 // A retry with another rate than the one saved is refused before reaching the database.
 ({api,state}=harness());usdToUzs(state);
 state.prior=[{exchange_rate:12400.5,rate_date:'2026-09-28'}];
 assert.deepEqual(await json(await api.POST(post({...body,exchange_rate:12500}))),{status:409,body:{error:'The exchange rate changed. Refresh the rate and review the amounts.'}});
 assert.equal(rpcCalls(state).length,0);

 // The id was used by an operation saved without a rate: this request is not a replay of it.
 ({api,state}=harness());usdToUzs(state);
 state.prior=[{exchange_rate:null,rate_date:'2026-09-28'}];
 assert.deepEqual(await json(await api.POST(post(body))),{status:409,body:{error:'This operation was already saved with different details.'}});
 assert.equal(rpcCalls(state).length,0);assert.equal(state.rateCalls.length,0);
});

test('POST passes on the database\'s refusals and answers 503 when the connection fails',async()=>{
 let {api,state}=harness();
 state.rpc=()=>Response.json({code:'P0001',message:'Not enough money in the source account.'},{status:400});
 assert.deepEqual(await json(await api.POST(post(movement({kind:'buy'})))),{status:409,body:{error:'Not enough money in the source account.'}});
 assert.equal(state.events.length,0);

 ({api,state}=harness());
 state.rpc=()=>Response.json({code:'PGRST202',message:'secret detail'},{status:404});
 assert.deepEqual(await json(await api.POST(post(movement({kind:'sell'})))),{status:409,body:{error:'Could not save the movement. Check that the latest migrations are installed.'}});

 ({api,state}=harness());
 state.throws=true;
 assert.deepEqual(await json(await api.POST(post(movement()))),{status:503,body:{error:'Connection unavailable. Please try again.'}});
});
