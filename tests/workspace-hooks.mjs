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
