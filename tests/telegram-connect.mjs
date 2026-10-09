import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {botDb,ownerId,subscription} from './helpers/bot-db.mjs';
const {createConnectRequest,findConnectRequest,consumeConnectRequest,cancelConnectRequest,linkChat,linkRefusal,unlinkChat,connectCookie,connectPage}=loadTS('lib/telegram-connect.ts');
const {unlinkedChat}=loadTS('lib/telegram-link.ts');
const {hashToken}=loadTS('lib/telegram-account.ts');
const now=new Date('2026-10-01T09:00:00Z'),later=minutes=>new Date(now.getTime()+minutes*60000);
const other='33333333-3333-4333-8333-333333333333';
const person={chatId:777,telegramUserId:777,firstName:'  Aziz  '};
const config={token:'123456:TEST-TOKEN',webhookSecret:'server-secret',botUsername:'hoggish_bot'};

test('connect requests are random, stored as hashes, one per chat, valid for fifteen minutes and spendable once',async()=>{
 const db=botDb({telegram_connect_requests:[{token_hash:'a'.repeat(64),chat_id:1,telegram_user_id:1,expires_at:'2026-09-01T00:00:00Z',used_at:'2026-09-01T00:00:00Z'}]});
 const token=await createConnectRequest(db,person,now);
 assert.match(token,/^[0-9a-f]{64}$/);
 assert.deepEqual(db.tables.telegram_connect_requests,[{token_hash:hashToken(token),chat_id:777,telegram_user_id:777,first_name:'Aziz',expires_at:later(15).toISOString()}],'old requests are swept and only the hash is kept');
 const second=await createConnectRequest(db,person,now);
 assert.notEqual(second,token);assert.equal(db.tables.telegram_connect_requests.length,1,'a new link replaces the open one');
 assert.equal(await findConnectRequest(db,token,now),null,'the replaced link no longer works');
 const found=await findConnectRequest(db,second,now);
 assert.deepEqual([found.chat_id,found.telegram_user_id,found.first_name],[777,777,'Aziz']);
 assert.equal(await findConnectRequest(db,second,later(16)),null,'expired');
 for(const bad of [undefined,'',second.toUpperCase(),second+'0','../x'])assert.equal(await findConnectRequest(db,bad,now),null,String(bad));
 assert.equal((await consumeConnectRequest(db,second,now)).chat_id,777);
 assert.equal(await consumeConnectRequest(db,second,now),null,'spent');
 assert.equal(await findConnectRequest(db,second,now),null);
 const third=await createConnectRequest(db,person,now);
 assert.equal(db.tables.telegram_connect_requests.length,2,'a spent request stays as a record; only open ones are replaced');
 await cancelConnectRequest(db,third);
 assert.equal(await findConnectRequest(db,third,now),null);
});

test('linking a chat signs out its earlier owner and records the Telegram user only when no other account holds it',async()=>{
 const fresh=botDb({});
 await linkChat(fresh,ownerId,person,now);
 assert.deepEqual(fresh.tables.telegram_subscriptions,[{user_id:ownerId,chat_id:777,linked_at:now.toISOString(),updated_at:now.toISOString(),telegram_user_id:777,first_name:'Aziz'}],'an account without a row gets one');
 // The chat served a phone account before: that account keeps its identity, so it can sign back in with its number, and this one does not take it.
 const held=botDb({telegram_subscriptions:[subscription({user_id:other,chat_id:777,telegram_user_id:777,phone:'+998901234567'}),subscription({chat_id:null,linked_at:null})]});
 await linkChat(held,ownerId,person,now);
 const [phone,mine]=held.tables.telegram_subscriptions;
 assert.equal(phone.chat_id,null);assert.equal(phone.telegram_user_id,777);
 assert.equal(mine.chat_id,777);assert.equal(mine.telegram_user_id,null);
 // An earlier owner linked from the app is released completely.
 const app=botDb({telegram_subscriptions:[subscription({user_id:other,chat_id:777,telegram_user_id:777})]});
 await linkChat(app,ownerId,person,now);
 assert.deepEqual([app.tables.telegram_subscriptions[0].chat_id,app.tables.telegram_subscriptions[0].telegram_user_id],[null,null]);
 // Reconnecting the same owner touches only its own row.
 const same=botDb({telegram_subscriptions:[subscription({chat_id:777,digest_enabled:false})]});
 await linkChat(same,ownerId,person,now);
 assert.equal(same.tables.telegram_subscriptions.length,1);assert.equal(same.tables.telegram_subscriptions[0].digest_enabled,false,'settings survive');
 const failing=botDb({__fail:['telegram_subscriptions']});
 await assert.rejects(linkChat(failing,ownerId,person,now));
});

function route({db,signedIn=true,cookie,sent=[]}){
 const store=new Map(cookie?[[connectCookie,cookie]]:[]),sets=[];
 const jar={get:name=>store.has(name)?{value:store.get(name)}:undefined,set:(name,value,options)=>{store.set(name,value);sets.push({name,value,options});},delete:name=>store.delete(name)};
 const user={id:ownerId,email:'me@example.com'};
 const api=loadTS('app/api/telegram/connect/route.ts',{
  'next/headers':{cookies:async()=>jar},
  '@/lib/service-role':{serviceDatabase:()=>db},
  '@/lib/supabase':{sameOrigin:req=>req.headers.get('sec-fetch-site')!=='cross-site'&&(!req.headers.get('origin')||req.headers.get('origin')==='https://app.local'),session:async()=>signedIn?{token:'access',user}:null},
  '@/lib/telegram':{telegramConfig:()=>config,sendTelegramMessage:async(message,used)=>{sent.push({message,used});return true;}},
  '@/lib/telegram-bot':{connectedReply:async(_,owner,chat)=>({chat_id:chat,text:'connected '+owner})},
 });
 const post=(action,headers={})=>api.POST(new Request('https://app.local/api/telegram/connect',{method:'POST',headers:{origin:'https://app.local',...headers},body:JSON.stringify({action})}));
 return {api,post,store,sets,sent};
}

test('the bot link keeps a valid token in a short-lived cookie and always opens the confirmation page',async()=>{
 const token='b'.repeat(64);
 const ok=route({db:botDb()});
 const response=await ok.api.GET(new Request('https://app.local/api/telegram/connect?c='+token));
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://app.local'+connectPage);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.deepEqual(ok.sets,[{name:connectCookie,value:token,options:{httpOnly:true,secure:false,sameSite:'lax',path:'/',maxAge:900}}]);
 const bad=route({db:botDb()});
 assert.equal((await bad.api.GET(new Request('https://app.local/api/telegram/connect?c=nope'))).status,303);
 assert.equal(bad.sets.length,0,'anything but a token is ignored');
});

test('the web page connects the chat only after a signed-in person confirms, then tells the chat',async()=>{
 const db=botDb({user_preferences:[{user_id:ownerId,language:'en'}]});
 const token=await createConnectRequest(db,person,new Date());
 // Signed out: the page asks for sign-in and keeps the cookie for the way back.
 const out=route({db,signedIn:false,cookie:token});
 assert.deepEqual(await (await out.post('preview')).json(),{state:'sign_in',telegram:'Aziz',bot:'hoggish_bot'});
 assert.deepEqual(await (await out.post('confirm')).json(),{state:'sign_in',telegram:'Aziz',bot:'hoggish_bot'});
 assert.ok(out.store.has(connectCookie));assert.equal(db.tables.telegram_subscriptions.length,0);
 // Signed in: preview shows both sides and changes nothing.
 const signed=route({db,cookie:token});
 assert.deepEqual(await (await signed.post('preview')).json(),{state:'confirm',telegram:'Aziz',account:'me@example.com',bot:'hoggish_bot'});
 assert.equal(db.tables.telegram_subscriptions.length,0);assert.equal(signed.sent.length,0);
 // Requests from other sites are refused before anything happens.
 assert.equal((await signed.post('confirm',{origin:'https://evil.example'})).status,403);
 assert.equal((await signed.post('confirm',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal(db.tables.telegram_subscriptions.length,0);
 assert.deepEqual(await (await signed.post('confirm')).json(),{state:'connected',bot:'hoggish_bot'});
 assert.equal(db.tables.telegram_subscriptions[0].chat_id,777);assert.equal(db.tables.telegram_subscriptions[0].telegram_user_id,777);
 assert.deepEqual(signed.sent.map(item=>[item.message,item.used]),[[{chat_id:777,text:'connected '+ownerId},config]]);
 assert.ok(!signed.store.has(connectCookie),'the cookie is spent with the request');
 // The same link cannot be used twice, even with the cookie copied.
 const again=route({db,cookie:token});
 assert.deepEqual(await (await again.post('confirm')).json(),{state:'expired',bot:'hoggish_bot'});
 assert.equal(again.sent.length,0);
});

test('missing, expired and cancelled links connect nothing, and failures are reported without detail',async()=>{
 const db=botDb();
 const none=route({db});
 assert.deepEqual(await (await none.post('preview')).json(),{state:'expired',bot:'hoggish_bot'});
 const token=await createConnectRequest(db,person,new Date());
 const cancelled=route({db,cookie:token});
 assert.deepEqual(await (await cancelled.post('cancel')).json(),{state:'cancelled',bot:'hoggish_bot'});
 assert.ok(!cancelled.store.has(connectCookie));assert.equal(db.tables.telegram_connect_requests.length,0);
 assert.deepEqual(await (await route({db,cookie:token}).post('confirm')).json(),{state:'expired',bot:'hoggish_bot'});
 assert.equal((await route({db}).post('delete')).status,400);
 const broken=botDb({__fail:['telegram_connect_requests']});
 const failed=await route({db:broken,cookie:token}).post('preview');
 assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'Could not connect Telegram. Please try again.'});
 assert.equal(db.tables.telegram_subscriptions.length,0);
});

test('signing in with any method returns to a waiting Telegram connection',async()=>{
 const cookie='c'.repeat(64);
 const auth=(store,signedIn)=>loadTS('app/api/auth/route.ts',{
  'next/headers':{cookies:async()=>({get:name=>store.has(name)?{value:store.get(name)}:undefined})},
  '@/lib/supabase':{config:()=>({}),session:async()=>signedIn?{token:'access',user:{id:ownerId,email:'me@example.com'}}:null,supa:async()=>new Response('{}'),saveSession:async()=>{},sameOrigin:()=>true},
 });
 assert.deepEqual(await (await auth(new Map([[connectCookie,cookie]]),true).GET()).json(),{configured:true,user:{email:'me@example.com'},next:connectPage});
 assert.deepEqual(await (await auth(new Map([[connectCookie,cookie]]),false).GET()).json(),{configured:true,user:null},'signed out stays on the sign-in page');
 assert.deepEqual(await (await auth(new Map(),true).GET()).json(),{configured:true,user:{email:'me@example.com'}});
 assert.deepEqual(await (await auth(new Map([[connectCookie,'junk']]),true).GET()).json(),{configured:true,user:{email:'me@example.com'}});
});

test('an account created in Telegram is never linked to another Telegram user\'s chat, and a stale identity is cleared on linking',async()=>{
 const made=()=>subscription({chat_id:null,linked_at:null,telegram_user_id:555,phone:'+998901234567',consented_at:'x'});
 const db=botDb({telegram_subscriptions:[made()]});
 assert.equal(await linkRefusal(db,ownerId,person),'other_telegram');
 assert.equal(await linkChat(db,ownerId,person,now),'other_telegram');
 assert.equal(db.tables.telegram_subscriptions[0].chat_id,null);assert.equal(db.tables.telegram_subscriptions[0].telegram_user_id,555,'its sign-in codes keep going to its own chat');
 assert.equal(db.writes.length,0);
 // Its own Telegram user may link it again, and a web account may link any chat.
 assert.equal(await linkChat(db,ownerId,{...person,telegramUserId:555},now),'linked');
 assert.equal(db.tables.telegram_subscriptions[0].chat_id,777);
 assert.equal(await linkRefusal(botDb({telegram_subscriptions:[subscription({telegram_user_id:555})]}),ownerId,person),null);
 // A web account that kept an identity from an earlier chat drops it when a person whose identity is held elsewhere links it.
 const stale=botDb({telegram_subscriptions:[subscription({chat_id:null,linked_at:null,telegram_user_id:555}),subscription({user_id:other,chat_id:null,telegram_user_id:777,phone:'+998900000000',consented_at:'x'})]});
 assert.equal(await linkChat(stale,ownerId,person,now),'linked');
 assert.deepEqual([stale.tables.telegram_subscriptions[0].chat_id,stale.tables.telegram_subscriptions[0].telegram_user_id],[777,null]);
});

test('unlinking a chat is one change shared by Sign out, linking and Disconnect',async()=>{
 assert.deepEqual(unlinkedChat('t',false),{chat_id:null,linked_at:null,updated_at:'t'});
 assert.deepEqual(unlinkedChat('t',true),{chat_id:null,linked_at:null,updated_at:'t',telegram_user_id:null,first_name:null});
 const db=botDb({telegram_subscriptions:[subscription({telegram_user_id:777,phone:'+998901234567'})]});
 await unlinkChat(db,db.tables.telegram_subscriptions[0],now);
 assert.deepEqual(db.writes[0].body,unlinkedChat(now.toISOString(),false),'an account with a number keeps its identity');
 await assert.rejects(unlinkChat(botDb({__fail:['telegram_subscriptions']}),subscription(),now),/Database request failed/);
});

test('the confirmation page refuses to hand an account made in Telegram to another Telegram user, before and after Connect',async()=>{
 const db=botDb({telegram_subscriptions:[subscription({chat_id:555,telegram_user_id:555,phone:'+998901234567',consented_at:'x'})]});
 const token=await createConnectRequest(db,person,new Date());
 const page=route({db,cookie:token});
 assert.deepEqual(await (await page.post('preview')).json(),{state:'other_telegram',bot:'hoggish_bot'});
 assert.deepEqual(await (await page.post('confirm')).json(),{state:'other_telegram',bot:'hoggish_bot'});
 assert.equal(db.tables.telegram_subscriptions[0].chat_id,555);assert.equal(page.sent.length,0);
 // The page explains the refusal and warns before every Connect that the chat gets the whole account and the name proves nothing.
 const source=fs.readFileSync('app/connect/telegram/page.tsx','utf8');
 assert.match(source,/view\.state === 'other_telegram'/);
 assert.match(source,/Connecting lets this Telegram chat see and change everything in this account\. Only connect if you pressed Sign in in your own Telegram just now/);
 assert.match(source,/<bdi>\{view\.telegram/);
});
