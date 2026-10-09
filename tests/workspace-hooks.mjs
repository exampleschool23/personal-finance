import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/hooks.mjs';
import {loadTS} from './helpers/load-ts.mjs';
const {emptyRecordFilters}=loadTS('lib/record-filters.ts');
const {emptyTransactionTools}=loadTS('lib/transaction-tools.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('page filters persist per section and reset between owners and demo sessions',()=>{
 const render=harness('hooks/use-record-filters.ts','useRecordFilters',{emptyRecordFilters});
 render('cashflow','one').setFilters({...emptyRecordFilters,category:'Living expense',query:'shop'});
 assert.equal(render('debts','one').filters.category,'all');
 assert.equal(render('cashflow','one').filters.query,'shop');
 assert.equal(render('cashflow','two').filters.query,'');
 assert.equal(render('cashflow','one').filters.query,'');
 render('cashflow','demo').setFilters({...emptyRecordFilters,query:'demo'});render('cashflow',null);
 assert.equal(render('cashflow','demo').filters.query,'');
});
test('transaction tools retain loaded data on a failed refresh, retry, and isolate a new owner',async()=>{
 const requests=[];const fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,reply:(data,status=200)=>resolve(Response.json(data,{status}))}));
 const run=harness('hooks/use-transaction-tools.ts','useTransactionTools',{emptyTransactionTools,fetch});
 const render=(owner='one',revision=0)=>run(owner,false,revision,()=>{});
 assert.equal(render().loading,true);const fixture={...emptyTransactionTools,rules:[{id:'rule'}]};requests[0].reply(fixture);await flush();assert.equal(render().data.rules.length,1);
 render('one',1);requests[1].reply({error:'Offline'},503);await flush();assert.equal(render('one',1).error,'Offline');assert.equal(render('one',1).data.rules.length,1);
 render('one',1).retry();render('one',1);requests[2].reply(fixture);await flush();assert.equal(render('one',1).error,'');
 assert.deepEqual(render('two',1).data,emptyTransactionTools);assert.equal(render('two',1).loading,true);
});
test('confirmed forecast assignments replace stale reads immediately and failed saves keep the last assignment',async()=>{
 const requests=[];const fetch=(url,options={})=>new Promise(resolve=>requests.push({options,reply:(data,status=200)=>resolve(Response.json(data,{status}))}));
 const run=harness('hooks/use-transaction-tools.ts','useTransactionTools',{emptyTransactionTools,fetch});const render=()=>run('one',false,0,()=>{});
 render();requests[0].reply(emptyTransactionTools);await flush();
 render().retry();render();const oldRead=requests[1];
 const save=render().save('forecast',{record_id:'salary',account_id:'cash'});requests[2].reply({ok:true});await save;
 assert.equal(oldRead.options.signal.aborted,true);assert.equal(render().data.assignments[0].account_id,'cash');
 oldRead.reply(emptyTransactionTools);await flush();assert.equal(render().data.assignments[0].account_id,'cash');
 const failure=render().save('forecast',{record_id:'salary',account_id:'other'});requests.at(-1).reply({error:'Failed'},409);await assert.rejects(failure,/Failed/);assert.equal(render().data.assignments[0].account_id,'cash');
});
test('shared owner resource aborts superseded reads, keeps errors visible, and clears another owner’s view',async()=>{
 const requests=[];const fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,reply:(data,status=200)=>resolve(Response.json(data,{status}))}));
 const run=harness('hooks/use-owner-resource.ts','useOwnerResource',{fetch});const empty={items:[]};const render=(owner='one',revision=0,enabled=true)=>run('/api/example',owner,enabled,revision,empty);
 assert.equal(render().loading,true);requests[0].reply({items:['one']});await flush();assert.deepEqual(render().data.items,['one']);render('one',1);assert.equal(requests[0].options.signal.aborted,true);assert.equal(render('two',1).data,empty);assert.equal(requests[1].options.signal.aborted,true);
 requests[1].reply({items:['stale']});await flush();assert.equal(render('two',1).data,empty);requests[2].reply({error:'Failed'},503);await flush();assert.equal(render('two',1).error,'Failed');render('two',1).retry();assert.equal(render('two',1).loading,true);requests[3].reply({items:['two']});await flush();assert.deepEqual(render('two',1).data.items,['two']);assert.equal(render(null,1,false).data,empty);const returning=render('two',1);assert.equal(returning.loading,true);assert.deepEqual(returning.data,empty);
});

test('portfolio history is discarded on logout even when the next account uses the same email identifier',async()=>{
 const requests=[];const fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,reply:data=>resolve(Response.json(data))}));
 const run=harness('hooks/use-portfolio-snapshots.ts','usePortfolioSnapshots',{fetch});const render=owner=>run(owner,null,false,0);
 render('same@example.com');requests[0].reply({snapshots:[{occurred_on:'2026-09-18',assets:100,debt:0,rates:{USD:1},updated_at:'2026-09-18T00:00:00Z'}]});await flush();assert.equal(render('same@example.com').snapshots.length,1);assert.deepEqual(render(null).snapshots,[]);assert.deepEqual(render('same@example.com').snapshots,[]);
});
test('the JSON client sends the body, returns the reply and shapes failures with their translation key',async()=>{
 const original=globalThis.fetch,calls=[];let reply=()=>Response.json({ok:true});
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return reply();};
 try{
  const {requestJson}=loadTS('lib/api-client.ts');
  assert.deepEqual(await requestJson('/api/example',{body:{action:'save',data:{id:1}}}),{ok:true});
  assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(calls[0].options.body),{action:'save',data:{id:1}});
  await requestJson('/api/example',{method:'DELETE',body:{id:2}});assert.equal(calls[1].options.method,'DELETE');
  reply=()=>Response.json({error:'Name is taken.'},{status:409});
  await assert.rejects(requestJson('/api/example',{body:{},fallback:'Could not save changes.'}),error=>error.message==='Name is taken.'&&error.confirmedFailure===true&&error.status===409);
  reply=()=>new Response('Bad gateway',{status:502});
  await assert.rejects(requestJson('/api/example',{body:{},fallback:'Could not save changes.'}),error=>error.message==='Could not save changes.'&&error.confirmedFailure===false,'a reply without JSON uses the fallback, and a server failure may have saved');
 }finally{globalThis.fetch=original;}
});
test('the Telegram link shows a load failure, retries, and keeps a later answer from a save',async()=>{
 const requests=[];const fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,reply:(data,status=200)=>resolve(Response.json(data,{status}))}));
 const run=harness('hooks/use-telegram-link.ts','useTelegramLink',{fetch,telegramBotUrl:name=>'https://t.me/'+name});
 assert.equal(run(false).status,null);requests[0].reply({error:'Could not load data.'},503);await flush();
 assert.equal(run(false).loadError,'Could not load data.');run(false).retry();assert.equal(run(false).loadError,'');
 const linked={configured:true,linked:true,digest_enabled:true,actions_enabled:true,bot_username:'bot'};
 requests[1].reply(linked);await flush();assert.deepEqual(run(false).status,linked);
 const saving=run(false).setToggles(false,true);requests[2].reply({...linked,digest_enabled:false});await saving;
 assert.equal(JSON.parse(requests[2].options.body).action,'settings');assert.equal(run(false).status.digest_enabled,false);
 assert.equal(run(true).status.configured,false,'the sample workspace shows the sample status');
});
test('waiting for the Telegram link checks one request at a time and a late answer after Stop waiting changes nothing',async()=>{
 const requests=[],timers=[];let saved=0;
 const fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,reply:(data,status=200)=>resolve(Response.json(data,{status}))}));
 const run=harness('hooks/use-telegram-link.ts','useTelegramLink',{fetch,telegramBotUrl:name=>'https://t.me/'+name,window:{open:()=>{}},showSaved:()=>{saved++;},
  setInterval:callback=>{timers.push({callback,cleared:false});return timers.length-1;},clearInterval:index=>{timers[index].cleared=true;}});
 const waiting={configured:true,linked:false,digest_enabled:true,actions_enabled:true,bot_username:'bot'};
 run(false);requests[0].reply(waiting);await flush();
 run(false).connect();assert.equal(run(false).waiting,true);
 const [timer]=timers;
 timer.callback();timer.callback();
 assert.equal(requests.length,2,'a tick while a check is under way is skipped');
 requests[1].reply(waiting);await flush();
 timer.callback();assert.equal(requests.length,3,'the next tick checks again');
 run(false).stopWaiting();run(false);
 assert.equal(timer.cleared,true);assert.equal(requests[2].options.signal.aborted,true,'stopping cancels the check under way');
 requests[2].reply({...waiting,linked:true});await flush();
 assert.equal(run(false).status.linked,false);assert.equal(run(false).waiting,false);assert.equal(saved,0,'no toast after stopping');
 // A new wait that sees the link reports it once.
 run(false).connect();run(false);
 timers[1].callback();requests[3].reply({...waiting,linked:true});await flush();
 assert.equal(run(false).status.linked,true);assert.equal(run(false).waiting,false);assert.equal(saved,1);
});
test('identical reads that start together share one request, each with its own copy, and later reads ask again',async()=>{
 const requests=[];
 const refreshRead=(url,options)=>new Promise(resolve=>requests.push({url,signal:options.signal,reply:(data,status=200)=>resolve(Response.json(data,{status}))}));
 const {sharedRead}=loadTS('hooks/use-owner-resource.ts',{'@/lib/refresh-read':{refreshRead},'@/lib/feedback':{showSaved:()=>{}},'@/lib/api-client':{requestJson:async()=>({})},react:{useEffect:()=>{},useRef:()=>({}),useState:()=>[]}});
 const reader=()=>new AbortController();
 // Two cards of one screen asking for the same month: one request, two separate copies.
 const [a,b]=[reader(),reader()];
 const first=sharedRead('one:/api/planning?scope=review',`/api/planning?scope=review`,a.signal),second=sharedRead('one:/api/planning?scope=review','/api/planning?scope=review',b.signal);
 const other=sharedRead('two:/api/planning?scope=review','/api/planning?scope=review',reader().signal);
 assert.equal(requests.length,2,'another owner never shares a read');
 requests[0].reply({records:[{id:'r'}]});
 const [one,two]=await Promise.all([first,second]);
 const parsed=[JSON.parse(one.text),JSON.parse(two.text)];parsed[0].records.push({id:'changed'});
 assert.deepEqual(parsed[1].records,[{id:'r'}]);assert.equal(one.ok,true);
 requests[1].reply({error:'Offline'},503);assert.equal((await other).ok,false);
 // A read that is already under way is not joined later: it may have started before a save.
 await new Promise(resolve=>setTimeout(resolve,0));
 const later=sharedRead('one:/api/planning?scope=review','/api/planning?scope=review',reader().signal);
 assert.equal(requests.length,3);requests[2].reply({records:[]});assert.deepEqual(JSON.parse((await later).text),{records:[]});
 // The request is cancelled only when every reader has let go of it.
 const [c,d]=[reader(),reader()];
 const kept=sharedRead('one:/api/x','/api/x',c.signal);sharedRead('one:/api/x','/api/x',d.signal).catch(()=>{});
 d.abort();assert.equal(requests[3].signal.aborted,false);requests[3].reply({ok:1});assert.deepEqual(JSON.parse((await kept).text),{ok:1});
 const [e,f]=[reader(),reader()];
 sharedRead('one:/api/y','/api/y',e.signal).catch(()=>{});sharedRead('one:/api/y','/api/y',f.signal).catch(()=>{});
 e.abort();f.abort();assert.equal(requests[4].signal.aborted,true);
 // Once cancelled, a reader starting in the same task (a remount) asks again rather than joining the cancelled one.
 sharedRead('one:/api/y','/api/y',reader().signal).catch(()=>{});assert.equal(requests.length,6);
});
