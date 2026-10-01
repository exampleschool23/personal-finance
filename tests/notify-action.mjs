import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const config={token:'T',webhookSecret:'S',botUsername:'b'};
function harness({subscription=[{chat_id:77,actions_enabled:true}],language='en',records=[],goals=[],deleted=[],fail=''}={}){
 const reads=[],sent=[];
 const read=async(path,init,token)=>{
  reads.push({path,token});
  if(fail&&path.includes(fail))return new Response(null,{status:500});
  if(path.startsWith('/rest/v1/telegram_subscriptions'))return Response.json(subscription);
  if(path.startsWith('/rest/v1/user_preferences'))return Response.json([{language}]);
  if(path.startsWith('/rest/v1/finance_records'))return Response.json(records);
  if(path.startsWith('/rest/v1/savings_goals'))return Response.json(goals);
  if(path.startsWith('/rest/v1/deleted_items'))return Response.json(deleted);
  throw Error('unexpected '+path);
 };
 const send=async(message,used)=>{sent.push({message,used});return true;};
 return {reads,sent,deps:{config,read,send}};
}
const {sendActionNotification,queueActionNotification}=loadTS('lib/notify-action.ts');
const auth={token:'owner-token',user:{id:'owner'}};

test('sends the resolved message to the linked chat using only the owner token',async()=>{
 const h=harness({language:'ru',records:[{id:'a',name:'Wallet',kind:'Cash',currency:'UZS'},{id:'r',name:'Rent',kind:'Rent expense',currency:'UZS'}]});
 assert.equal(await sendActionNotification(auth,{type:'occurrence',account_id:'a',target_id:'r',amount:3000000,date:'2026-10-01'},h.deps),true);
 assert.equal(h.sent.length,1);assert.equal(h.sent[0].message.chat_id,77);assert.equal(h.sent[0].used,config);
 assert.match(h.sent[0].message.text,/^Платёж записан\n<b>Rent<\/b> · 3 000 000 UZS/);
 assert.ok(h.reads.every(read=>read.token==='owner-token'));
 assert.match(h.reads.find(read=>read.path.includes('finance_records')).path,/id=in\.\(a,r\)$/);
});

test('deleted records are named from the recycle bin copy',async()=>{
 const h=harness({deleted:[{data:{id:'x',name:'Old phone',kind:'Other expense',currency:'USD',amount:120}}]});
 await sendActionNotification(auth,{type:'record_deleted',id:'x'},h.deps);
 assert.equal(h.sent[0].message.text,'Deleted Other expense\n<b>Old phone</b> · $120');
 assert.match(h.reads.find(read=>read.path.includes('deleted_items')).path,/source=eq\.finance_records&data->>id=eq\.x/);
});

test('nothing is read or sent without bot configuration, a linked chat, or the actions toggle',async()=>{
 const off=harness();
 assert.equal(await sendActionNotification(auth,{type:'goal_deleted'},{...off.deps,config:null}),false);
 assert.equal(off.reads.length,0);
 const unlinked=harness({subscription:[]});
 assert.equal(await sendActionNotification(auth,{type:'goal_deleted'},unlinked.deps),false);
 assert.equal(unlinked.sent.length,0);
 const muted=harness({subscription:[{chat_id:77,actions_enabled:false}]});
 assert.equal(await sendActionNotification(auth,{type:'goal_deleted'},muted.deps),false);
 assert.equal(muted.sent.length,0);assert.equal(muted.reads.length,1);
});

test('a failed lookup rejects, and the queue swallows it so the save is unaffected',async()=>{
 const h=harness({fail:'finance_records'});
 await assert.rejects(sendActionNotification(auth,{type:'reconcile',account_id:'a',amount:1,date:'2026-10-01'},h.deps),/Notification lookup failed/);
 assert.equal(h.sent.length,0);
 // Outside a request scope the queue runs the task directly; without configuration it does nothing.
 assert.doesNotThrow(()=>queueActionNotification(auth,{type:'goal_deleted'}));
});

test('the write routes queue a notification only after a successful save',()=>{

 for(const route of ['records','planning','mortgage-payments','goal-tools','asset-movements','import']){
  const source=fs.readFileSync(`app/api/${route}/route.ts`,'utf8');
  assert.ok(source.includes("from '@/lib/notify-action'"),route);
  assert.ok(source.includes('queueActionNotification('),route);
 }
});

test('a new language replaces the bot keyboard in the linked chat, with no new text to translate',async()=>{
 const {sendLanguageMenu}=loadTS('lib/notify-action.ts');
 const h=harness({subscription:[{chat_id:77,actions_enabled:false}]});
 assert.equal(await sendLanguageMenu(auth,'ru',h.deps),true);
 assert.equal(h.sent.length,1);
 const {message,used}=h.sent[0];
 assert.equal(message.chat_id,77);
 assert.equal(message.text,'Выберите, что добавить.');
 assert.deepEqual(message.keyboard,{reply:[['Расход','Доходы'],['Перевод','Погасить кредит или долг'],['Ипотечный платёж','Предстоящие платежи'],['Добавить счёт','Добавить кредит или долг']]});
 assert.equal(used,config);
 // Only the owner's own token reads the chat, and the message is sent even when action messages are off.
 assert.deepEqual(h.reads.map(read=>read.token),['owner-token']);
 const ja=harness();await sendLanguageMenu(auth,'ja',ja.deps);
 assert.notEqual(ja.sent[0].message.text,'Choose what to add.');
 assert.notDeepEqual(ja.sent[0].message.keyboard,{reply:[['Expense','Income'],['Transfer','Pay loan or debt'],['Mortgage payment','Upcoming payments']]});
 const unlinked=harness({subscription:[{chat_id:null,actions_enabled:true}]});
 assert.equal(await sendLanguageMenu(auth,'ru',unlinked.deps),false);assert.equal(unlinked.sent.length,0);
 const none=harness({subscription:[]});assert.equal(await sendLanguageMenu(auth,'ru',none.deps),false);
 assert.equal(await sendLanguageMenu(auth,'ru',{...h.deps,config:null}),false);
 const failing=harness({fail:'telegram_subscriptions'});
 await assert.rejects(()=>sendLanguageMenu(auth,'ru',failing.deps),/lookup failed/);
});
test('queueing a language menu never throws',()=>{
 const {queueLanguageMenu}=loadTS('lib/notify-action.ts');
 assert.doesNotThrow(()=>queueLanguageMenu({token:'t'},'ru'));
});
