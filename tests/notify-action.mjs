import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const config={token:'T',webhookSecret:'S',botUsername:'b'};
function harness({subscription=[{chat_id:77,actions_enabled:true}],language='en',records=[],goals=[],deleted=[],categories=[],fail=''}={}){
 const reads=[],sent=[];
 const read=async(path,init,token)=>{
  reads.push({path,token});
  if(fail&&path.includes(fail))return new Response(null,{status:500});
  if(path.startsWith('/rest/v1/telegram_subscriptions'))return Response.json(subscription);
  if(path.startsWith('/rest/v1/user_preferences'))return Response.json([{language}]);
  if(path.startsWith('/rest/v1/finance_records'))return Response.json(records);
  if(path.startsWith('/rest/v1/savings_goals'))return Response.json(goals);
  if(path.startsWith('/rest/v1/deleted_items'))return Response.json(deleted);
  if(path.startsWith('/rest/v1/transaction_categories'))return Response.json(categories);
  throw Error('unexpected '+path);
 };
 const send=async(message,used)=>{sent.push({message,used});return true;};
 return {reads,sent,deps:{config,read,send}};
}
const {queueMilestoneCheck}=loadTS('lib/notify-action.ts');
const auth={token:'owner-token',user:{id:'owner'}};

test('saves in the app are never announced one by one in Telegram; only milestones are checked',()=>{
 const source=fs.readFileSync('lib/notify-action.ts','utf8');
 assert.ok(!source.includes('actionMessage'),'no per-save message is written');
 assert.ok(!/export (async )?function sendActionNotification/.test(source));
 // Outside a request scope the check runs directly; without configuration it does nothing.
 assert.doesNotThrow(()=>queueMilestoneCheck(auth,{type:'goal_deleted'}));
});

test('the write routes check milestones only after a successful save',()=>{

 for(const route of ['records','planning','mortgage-payments','goal-tools','asset-movements','import']){
  const source=fs.readFileSync(`app/api/${route}/route.ts`,'utf8');
  assert.ok(source.includes("from '@/lib/notify-action'"),route);
  assert.ok(source.includes('queueMilestoneCheck('),route);
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
 assert.deepEqual(message.keyboard,{reply:[['Расход','Доходы'],['Другие действия']]});
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
