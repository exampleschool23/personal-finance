import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise hook state transitions with manually controlled network responses.
function harness(file,name,dependencies){
 const slots=[],pending=[];let cursor=0;
 const changed=(a,b)=>!a||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
 const hooks={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
  useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
  useCallback(callback,deps){const index=cursor++;if(changed(slots[index]?.deps,deps))slots[index]={deps,callback};return slots[index].callback;},
  useEffect(effect,deps){const index=cursor++;if(changed(slots[index]?.deps,deps)){const old=slots[index];slots[index]={deps};pending.push(()=>{old?.cleanup?.();slots[index].cleanup=effect();});}},
 };
 const bindings={...hooks,...dependencies};
 const source=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const hook=new Function(...Object.keys(bindings),js+`;return ${name};`)(...Object.values(bindings));
 return (...args)=>{cursor=0;const result=hook(...args);while(pending.length)pending.shift()();return result;};
}
function network(){const requests=[];return {requests,fetch:(url,options={})=>new Promise(resolve=>requests.push({url,options,reply:(data,status=200)=>resolve(Response.json(data,{status}))}))};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const emptyPlanning={records:[],occurrences:[],goals:[],categories:[],activity:[]};
const fixture={...emptyPlanning,records:[{id:'salary',amount:3450},{id:'cash',amount:100}],goals:[{id:'goal'}]};
function planning(){
 const net=network();let revision=0;
 const onSaved=()=>revision++;
 const run=harness('hooks/use-planning.ts','usePlanning',{fetch:net.fetch,emptyPlanning,normalizeEntry:r=>r});
 return {...net,render:(user='owner')=>run(user,false,[],revision,onSaved)};
}

test('recording a payment removes only its reminder after confirmation while keeping loaded data visible',async()=>{
 const app=planning();assert.equal(app.render().loading,true);
 app.requests[0].reply(fixture);await flush();
 let state=app.render();assert.equal(state.loading,false);
 const payload={id:'payment',target_id:'salary',date:'2026-09-05'};
 const saving=state.save('occurrence',payload);
 assert.deepEqual(app.render().data.occurrences,[]);
 app.requests[1].reply({ok:true});await saving;
 state=app.render();assert.equal(state.loading,false);assert.equal(state.refreshing,true);
 assert.deepEqual(state.data.occurrences,[{id:'payment',record_id:'salary',due_on:'2026-09-05',status:'paid'}]);
 assert.equal(state.data.records[1].amount,100); // Balances come from the server, never guessed.
 assert.deepEqual(state.data.goals,fixture.goals);
 app.requests[2].reply({...state.data,records:[fixture.records[0],{id:'cash',amount:3550}]});await flush();
 state=app.render();assert.equal(state.data.records[1].amount,3550);assert.equal(state.refreshing,false);assert.equal(state.loading,false);
});

test('failed writes preserve reminders; failed refreshes retain data and expose the error',async()=>{
 const app=planning();app.render();app.requests[0].reply(fixture);await flush();
 const save=app.render().save('dismiss',{id:'dismiss',target_id:'salary',date:'2026-09-05'});
 app.requests[1].reply({error:'Save failed'},409);await assert.rejects(save,/Save failed/);
 assert.deepEqual(app.render().data.occurrences,[]);assert.equal(app.requests.length,2);
 const retry=app.render().save('dismiss',{id:'dismiss',target_id:'salary',date:'2026-09-05'});
 app.requests[2].reply({ok:true});await retry;app.render();
 app.requests[3].reply({error:'Refresh unavailable'},503);await flush();
 const state=app.render();assert.equal(state.error,'Refresh unavailable');assert.equal(state.loading,false);
 assert.deepEqual(state.data.records,fixture.records);assert.equal(state.data.occurrences[0].status,'dismissed');
});

test('superseded reads cannot undo a confirmed payment and a different user never sees cached records',async()=>{
 const app=planning();app.render();app.requests[0].reply(fixture);await flush();
 const first=app.render().save('goal',{id:'goal'});app.requests[1].reply({ok:true});await first;app.render();
 const second=app.render().save('occurrence',{id:'payment',target_id:'salary',date:'2026-09-05'});
 app.requests[3].reply({ok:true});await second;
 assert.equal(app.requests[2].options.signal.aborted,true);
 app.requests[2].reply(fixture);await flush();
 assert.equal(app.render().data.occurrences.length,1);
 const other=app.render('other');assert.equal(other.loading,true);assert.deepEqual(other.data,emptyPlanning);
});

test('expense plans stay visible during same-month refreshes and isolate other months and users',async()=>{
 const net=network();
 const run=harness('hooks/use-expense-plans.ts','useExpensePlans',{fetch:net.fetch,expensePlanMonth:()=> '2026-09'});
 const render=(revision=0,month='2026-09',user='owner')=>run(user,false,[],revision,()=>{},month);
 assert.equal(render().loading,true);net.requests[0].reply([{id:'rent',amount:'100',spent:'20'}]);await flush();
 assert.equal(render().plans[0].amount,100);
 assert.equal(render(1).loading,false);assert.equal(render(1).plans.length,1);
 net.requests[1].reply({error:'Offline'},503);await flush();
 assert.equal(render(1).plans.length,1);assert.equal(render(1).error,'Offline');
 assert.equal(render(1,'2026-10').loading,true);assert.deepEqual(render(1,'2026-10').plans,[]);
 net.requests[2].reply({error:'Offline'},503);await flush();
 assert.deepEqual(render(1,'2026-10').plans,[]);
 assert.equal(render(1,'2026-10','other').loading,true);assert.deepEqual(render(1,'2026-10','other').plans,[]);
});
