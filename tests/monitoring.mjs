import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const monitoring=loadTS('lib/monitoring.ts');
const {scrub,errorReport,sentryEnvelope,alertText,reportError,fingerprint,resetMonitoring}=monitoring;
const {hitLimit}=loadTS('lib/rate-limit.ts');
const now=new Date('2026-10-05T04:30:00Z');
const telegramEnv={TELEGRAM_BOT_TOKEN:'123456:bot-token',TELEGRAM_WEBHOOK_SECRET:'hook',TELEGRAM_BOT_USERNAME:'hoggish_bot',TELEGRAM_ALERT_CHAT_ID:'-1001234',SUPABASE_SERVICE_ROLE_KEY:'server-key',VERCEL_GIT_COMMIT_SHA:'abcdef1234567890'};
/** A stand-in for public.hit_rate_limit: a fixed window per bucket, as migration 106 counts. */
function limiterDb(){
 const hits=new Map(),calls=[];
 return {calls,hits,write:async(path,init)=>{const {bucket,max_hits}=JSON.parse(init.body);calls.push(bucket);const count=(hits.get(bucket)??0)+1;hits.set(bucket,count);return Response.json(count<=max_hits);}};
}
const recorder=()=>{const calls=[];const fetcher=async(url,init)=>{calls.push({url:String(url),init});return new Response('{}',{status:200});};return {calls,fetcher};};
const silent=()=>{};

test('scrubbing removes emails, phone numbers, amounts, ids, bearer tokens, JWTs, keys and query strings',()=>{
 const jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl';
 const text=scrub(`Failed for anna.k+test@example.co.uk / +998 90 123-45-67 paid 13,782.11 and 250000 on 2026-10-05, user 3f2a1b4c-1d2e-4f5a-9b8c-7d6e5f4a3b2c, Authorization: Bearer abc.def-ghi token ${jwt} key sb_secret_AbC123 bot987654:AAE-xyz GET https://x.supabase.co/rest/v1/finance_records?user_id=eq.42&select=* and /api/records?month=2026-10 raw abcdefghijklmnopqrstuvwxyz0123456789ABCD`);
 for(const leak of ['anna','example.co.uk','998','123-45','13,782','250000','2026-10-05','3f2a1b4c','abc.def-ghi',jwt,'sb_secret_AbC123','AAE-xyz','user_id=eq','month=','abcdefghijklmnopqrstuvwxyz0123'])assert.ok(!text.includes(leak),`${leak} in ${text}`);
 assert.match(text,/\[email\]/);assert.match(text,/Bearer \[redacted\]/);assert.match(text,/\[jwt\]/);assert.match(text,/\[id\]/);
 assert.match(text,/https:\/\/x\.supabase\.co\/rest\/v1\/finance_records\?\[query\]/);assert.match(text,/\/api\/records\?\[query\]/);
 // Stack positions and status codes stay, so a report can still be traced.
 assert.equal(scrub('TypeError: x is undefined\n    at load (/var/task/app/api/route.js:1234:56)\n    status 503'),'TypeError: x is undefined\n    at load (/var/task/app/api/route.js:1234:56)\n    status 503');
 assert.equal(scrub('word '.repeat(200)).length,501);
});

test('a report keeps only allowlisted context: a hashed user id, a bare route, small counts and the release',()=>{
 const error=new Error('Lookup failed for bob@example.com');error.stack='Error: Lookup failed for bob@example.com\n'+'    at frame (/x.js:1:2)\n'.repeat(200);
 const report=errorReport('cron:test',error,{route:'https://app.example/api/x/3f2a1b4c-1d2e-4f5a-9b8c-7d6e5f4a3b2c?token=secret#part',status:503,userId:'user-1',digest:'abc123',counts:{sent:3,failed:1,'bad key':2,amount:1.5},balance:900,email:'x@y.z'},telegramEnv,now);
 assert.deepEqual(Object.keys(report).sort(),['at','counts','digest','level','message','name','release','route','source','stack','status','userIdHash']);
 assert.equal(report.message,'Lookup failed for [email]');assert.equal(report.route,'/api/x/[id]');assert.equal(report.status,503);
 assert.deepEqual(report.counts,{sent:3,failed:1});assert.equal(report.release,'abcdef1234567890');assert.equal(report.at,'2026-10-05T04:30:00.000Z');
 assert.ok(report.stack.length<=2001);assert.ok(!report.stack.includes('bob'));
 assert.notEqual(report.userIdHash,'user-1');assert.equal(report.userIdHash.length,16);
 assert.equal(errorReport('s',new Error('x'),{userId:'user-1'},{SUPABASE_SERVICE_ROLE_KEY:'other'},now).userIdHash===report.userIdHash,false,'keyed hash');
 assert.equal(errorReport('s',new Error('x'),{userId:'user-1'},{},now).userIdHash,undefined,'no key, no hash');
 assert.equal(errorReport('s',new Error('x'),{digest:'bad digest!'},{},now).digest,undefined);
 assert.deepEqual([errorReport('s','plain words',{},{},now).message,errorReport('s',{amount:5},{},{},now).name],['plain words','NonError']);
 assert.equal(fingerprint(report),fingerprint(errorReport('cron:test',new Error('Lookup failed for carol@example.org'),{route:'/api/x/1f2a1b4c-1d2e-4f5a-9b8c-7d6e5f4a3b2c'},{},now)),'same failure, other person: one fingerprint');
});

test('each report is one JSON line, and Sentry receives a plain envelope without an SDK',async()=>{
 const lines=[],{calls,fetcher}=recorder();
 await reportError('assistant',new Error('Upstream 500 for anna@example.com'),{route:'/api/assistant',status:502},{env:{SENTRY_DSN:'https://publickey@o42.ingest.sentry.io/7',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'abc'},fetcher,log:line=>lines.push(line),now,db:null});
 assert.equal(lines.length,1);const logged=JSON.parse(lines[0]);
 assert.equal(logged.level,'error');assert.equal(logged.source,'assistant');assert.equal(logged.message,'Upstream 500 for [email]');assert.equal(logged.release,'abc');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://o42.ingest.sentry.io/api/7/envelope/');
 assert.equal(calls[0].init.headers['Content-Type'],'application/x-sentry-envelope');
 assert.match(calls[0].init.headers['X-Sentry-Auth'],/^Sentry sentry_version=7, sentry_key=publickey, sentry_client=hoggish-monitoring\/1\.0$/);
 const [header,item,event,...rest]=calls[0].init.body.split('\n').map(line=>JSON.parse(line));
 assert.equal(rest.length,0);assert.deepEqual(item,{type:'event'});
 assert.match(header.event_id,/^[0-9a-f]{32}$/);assert.equal(header.event_id,event.event_id);assert.equal(header.dsn,'https://publickey@o42.ingest.sentry.io/7');
 assert.equal(event.timestamp,now.getTime()/1000);assert.equal(event.level,'error');assert.equal(event.release,'abc');assert.equal(event.environment,'production');
 assert.deepEqual(event.exception.values,[{type:'Error',value:'Upstream 500 for [email]'}]);
 assert.deepEqual(event.tags,{source:'assistant',route:'/api/assistant',status:'502'});
 assert.ok(!calls[0].init.body.includes('anna'));
 // A self-hosted DSN with a path prefix, and DSNs that cannot be used.
 assert.equal(sentryEnvelope(logged,'https://k@sentry.example.com/base/12').url,'https://sentry.example.com/base/api/12/envelope/');
 for(const dsn of ['not a url','https://sentry.io/7','ftp://k@sentry.io/7'])assert.equal(sentryEnvelope(logged,dsn),null,dsn);
 // Sentry down, or fetch throwing outright, never reaches the caller.
 await reportError('x',new Error('y'),{},{env:{SENTRY_DSN:'https://k@o1.ingest.sentry.io/1'},fetcher:async()=>{throw Error('offline');},log:silent,db:null});
 await reportError('x',new Error('y'),{},{log:()=>{throw Error('stderr closed');}});
});

test('a severe failure alerts the operator in Telegram once an hour per failure, with no user data and a formatted time',async()=>{
 resetMonitoring();
 const db=limiterDb(),{calls,fetcher}=recorder();
 const fail=()=>reportError('cron:telegram-digest','Some Telegram digests were not delivered.',{route:'/api/cron/telegram-digest',status:503,counts:{sent:1200,failed:3},userId:'owner-1'},{alert:true,env:telegramEnv,fetcher,db,now,log:silent});
 await fail();await fail();await fail();
 assert.equal(calls.length,1,'deduplicated');
 assert.equal(calls[0].url,'https://api.telegram.org/bot123456:bot-token/sendMessage');
 const message=JSON.parse(calls[0].init.body);
 assert.equal(message.chat_id,-1001234);assert.equal(message.parse_mode,'HTML');
 assert.equal(message.text,['🚨 <b>Hoggish alert</b> · cron:telegram-digest','Error: Some Telegram digests were not delivered.','/api/cron/telegram-digest · status 503','sent 1,200 · failed 3','abcdef1 · 5 October 2026 09:30'].join('\n'));
 assert.ok(!message.text.includes('owner-1'));
 assert.ok(db.calls.every(bucket=>/^monitor-(alert|seen):[0-9a-f]{16}$|^monitor-alert:all$/.test(bucket)),'buckets name no person');
 // A different failure alerts on its own.
 await reportError('telegram-webhook',new Error('boom'),{},{alert:true,env:telegramEnv,fetcher,db,now,log:silent});
 assert.equal(calls.length,2);
 assert.equal(alertText(errorReport('x',new Error('<b>bad</b> & co'),{},{},now)).split('\n')[1],'Error: &lt;b&gt;bad&lt;/b&gt; &amp; co');
});

test('repeated failures alert only once they keep happening, and every alert path survives Telegram and the database being down',async()=>{
 resetMonitoring();
 const db=limiterDb(),{calls,fetcher}=recorder();
 const fail=()=>reportError('database',new Error('Could not save (PostgREST 08006, HTTP 503)'),{status:503},{alert:'repeated',env:telegramEnv,fetcher,db,now,log:silent});
 for(let index=0;index<5;index++)await fail();
 assert.equal(calls.length,0,'five in ten minutes are not yet an alert');
 await fail();await fail();
 assert.equal(calls.length,1,'the sixth alerts, later ones are deduplicated');
 // The database cannot count: the instance's own memory deduplicates instead.
 resetMonitoring();calls.length=0;
 const down={write:async()=>{throw Error('database down');}};
 for(let index=0;index<3;index++)await reportError('cron:x',new Error('down'),{},{alert:true,env:telegramEnv,fetcher,db:down,now,log:silent});
 assert.equal(calls.length,1);
 const refusing={write:async()=>new Response('{}',{status:404})},warn=console.warn;console.warn=silent;
 try{await reportError('cron:y',new Error('down'),{},{alert:true,env:telegramEnv,fetcher,db:refusing,now,log:silent});}finally{console.warn=warn;}
 assert.equal(calls.length,2);
 // Telegram unreachable, no bot, no chat id or a malformed one: nothing throws and nothing is sent.
 await reportError('cron:z',new Error('x'),{},{alert:true,env:telegramEnv,fetcher:async()=>{throw Error('offline');},db:null,now,log:silent});
 const sends=recorder();
 for(const env of [{...telegramEnv,TELEGRAM_ALERT_CHAT_ID:''},{...telegramEnv,TELEGRAM_ALERT_CHAT_ID:'@me'},{TELEGRAM_ALERT_CHAT_ID:'42'}])await reportError('cron:w',new Error('x'),{},{alert:true,env,fetcher:sends.fetcher,db:null,now,log:silent});
 assert.equal(sends.calls.length,0);
 // Without an alert mode only the log line is written.
 await reportError('client:error',new Error('x'),{},{env:telegramEnv,fetcher:sends.fetcher,db:null,log:silent});
 assert.equal(sends.calls.length,0);
 // All alerts together are capped, so many different failures cannot flood the chat.
 resetMonitoring();calls.length=0;
 for(let index=0;index<25;index++)await reportError('cron:flood-'+String.fromCharCode(97+index),new Error('x'),{},{alert:true,env:telegramEnv,fetcher,db:null,now,log:silent});
 assert.equal(calls.length,20);
 resetMonitoring();
});

test('the shared limiter counts a ready-made bucket: within, over, or unable to count',async()=>{
 const db=limiterDb();
 assert.equal(await hitLimit('b',{max:1,seconds:60},db),true);
 assert.equal(await hitLimit('b',{max:1,seconds:60},db),false);
 assert.equal(await hitLimit('b',{max:1,seconds:60},null),null);
 const warn=console.warn;console.warn=()=>{};
 try{assert.equal(await hitLimit('b',{max:1,seconds:60},{write:async()=>new Response('',{status:404})}),null);}finally{console.warn=warn;}
});

test('database failures that answer 5xx are reported by code only, and nothing else changes in the answer',async()=>{
 const reported=[];
 const {postgrestFailure}=loadTS('lib/api-route.ts',{'@/lib/monitoring':{reportError:async(...args)=>{reported.push(args);}}});
 const failed=(body,status=500)=>new Response(JSON.stringify(body),{status});
 let response=await postgrestFailure(failed({code:'08006',message:'connection to anna@example.com failed',details:'Key (name)=(Salary 5000)'}),'Could not save.',{status:409,fallbackStatus:503});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Could not save.'});
 assert.equal(reported.length,1);
 const [source,error,context,options]=reported[0];
 assert.equal(source,'database');assert.equal(error.message,'Could not save. (PostgREST 08006, HTTP 500)');assert.deepEqual(context,{status:503});assert.deepEqual(options,{alert:'repeated'});
 response=await postgrestFailure(failed({code:'PGRST202'}),'Could not check.',{status:503,codes:{PGRST202:'Update the database.'}});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Update the database.'});assert.equal(reported.length,2);
 assert.match(reported[1][1].message,/PostgREST PGRST202/);
 response=await postgrestFailure(new Response('not json',{status:502}),'Could not load.',{fallbackStatus:503});
 assert.match(reported[2][1].message,/PostgREST no code, HTTP 502/);
 // 4xx answers and the database's own refusals are not failures of the app.
 for(const [body,options] of [[{code:'23505'},{}],[{code:'P0001',message:'Name taken'},{status:409}],[{code:'X'},{codes:{X:['Gone',410]}}]])await postgrestFailure(failed(body),'Nope.',options);
 assert.equal(reported.length,3);
});

test('cron runs report failures and partial runs as alerts with their tallies; the answers stay as they were',async()=>{
 process.env.CRON_SECRET='test-secret';
 const reported=[],monitor={'@/lib/monitoring':{reportError:async(...args)=>{reported.push(args);}}};
 const cron=new Request('https://local',{headers:{authorization:'Bearer test-secret'}});
 const telegram={telegramConfig:()=>({token:'T',webhookSecret:'S',botUsername:'b'}),sendTelegramMessage:async message=>message.chat_id!==2,escapeHtml:text=>text};
 const owner={'@/lib/telegram-owner':{deliverToSubscribers:async(db,delivery,send)=>{let sent=0,failed=0;for(const chat_id of [1,2]){if(await send({user_id:'u'+chat_id,chat_id}).catch(()=>false))sent++;else failed++;}return {sent,failed};},ownerProfile:async()=>{throw Error('profile unavailable');},recentSnapshots:async()=>[]}};
 const db={read:async()=>[],write:async()=>Response.json(true)};
 for(const name of ['telegram-digest','telegram-recap']){
  reported.length=0;
  const route=loadTS(`app/api/cron/${name}/route.ts`,{...monitor,...owner,'@/lib/telegram':telegram,'@/lib/service-role':{serviceDatabase:()=>db}});
  let response=await route.GET(cron);
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{sent:0,failed:2});
  assert.equal(reported.length,1);assert.equal(reported[0][0],'cron:'+name);assert.deepEqual(reported[0][2],{route:'/api/cron/'+name,status:503,counts:{sent:0,failed:2}});assert.deepEqual(reported[0][3],{alert:true});
  const broken=loadTS(`app/api/cron/${name}/route.ts`,{...monitor,'@/lib/telegram-owner':{...owner['@/lib/telegram-owner'],deliverToSubscribers:async()=>{throw Error('subscribers unavailable');}},'@/lib/telegram':telegram,'@/lib/service-role':{serviceDatabase:()=>db}});
  response=await broken.GET(cron);
  assert.equal(response.status,503);assert.equal((await response.json()).sent,0);
  assert.equal(reported.length,2);assert.equal(reported[1][1].message,'subscribers unavailable');assert.deepEqual(reported[1][3],{alert:true});
 }
 const snapshots=(overrides)=>loadTS('app/api/cron/portfolio-snapshots/route.ts',{...monitor,'@/lib/server-market':{loadMarket:async()=>({})},'@/lib/owner-rows':{readIdPages:async()=>[{user_id:'a'},{user_id:'b'}]},'@/lib/market':{instrumentFor:()=>null,marketSymbols:()=>({crypto:[],stocks:[],metals:[]})},'@/lib/deposit-interest':{depositToday:()=>'2026-10-05'},'@/lib/telegram-milestones':{announceNetWorthHigh:async()=>false},'@/lib/service-role':{serviceDatabase:()=>db},...overrides});
 reported.length=0;
 let response=await snapshots({'@/lib/portfolio-snapshots':{snapshotTotals:holdings=>holdings[0].user_id==='a'?{USD:1}:null}}).GET(cron);
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{captured:1,skipped:1,celebrated:0});
 assert.deepEqual(reported[0][2],{route:'/api/cron/portfolio-snapshots',status:503,counts:{captured:1,skipped:1}});
 response=await snapshots({'@/lib/portfolio-snapshots':{snapshotTotals:()=>({USD:1})}}).GET(cron);
 assert.equal(response.status,200);assert.equal(reported.length,1,'a full run reports nothing');
 response=await snapshots({'@/lib/owner-rows':{readIdPages:async()=>{throw Error('page failed');}},'@/lib/portfolio-snapshots':{snapshotTotals:()=>null}}).GET(cron);
 assert.equal(response.status,503);assert.equal(reported.length,2);assert.equal(reported[1][1].message,'page failed');assert.deepEqual(reported[1][3],{alert:true});
});

test('the Telegram webhook, the sign-in code hook and the assistant report their unexpected failures',async()=>{
 const reported=[],monitor={'@/lib/monitoring':{reportError:async(...args)=>{reported.push(args);}}};
 const telegram={telegramConfig:()=>({token:'T',webhookSecret:'SECRET',botUsername:'b'}),sendTelegramMessage:async()=>false,answerCallback:async()=>true,escapeHtml:text=>text};
 const webhook=loadTS('app/api/telegram/webhook/route.ts',{...monitor,'@/lib/telegram':telegram,'@/lib/service-role':{serviceDatabase:()=>({})},'@/lib/telegram-bot':{handleTelegramUpdate:async()=>{throw Error('update failed');}}});
 const response=await webhook.POST(new Request('https://local/api/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'SECRET'},body:'{}'}));
 assert.equal(response.status,503);
 assert.deepEqual(reported.map(([source,error,context,options])=>[source,error.message,context,options]),[['telegram-webhook','update failed',{route:'/api/telegram/webhook',status:503},{alert:true}]]);

 // The SMS hook: a signed call whose delivery fails, then one whose database read fails.
 const {createHmac}=await import('node:crypto');
 const secret='v1,whsec_'+Buffer.from('hook-secret').toString('base64'),userId='3f2a1b4c-1d2e-4f5a-9b8c-7d6e5f4a3b2c';
 process.env.SEND_SMS_HOOK_SECRET=secret;
 const signed=()=>{const body=JSON.stringify({user:{id:userId},sms:{otp:'123456'}}),id='msg',timestamp=String(Math.floor(Date.now()/1000));return new Request('https://local/api/auth/send-sms-hook',{method:'POST',headers:{'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+createHmac('sha256',Buffer.from('hook-secret')).update(`${id}.${timestamp}.${body}`).digest('base64')},body});};
 const sms=read=>loadTS('app/api/auth/send-sms-hook/route.ts',{...monitor,'@/lib/telegram':telegram,'@/lib/service-role':{serviceDatabase:()=>({read})},'@/lib/telegram-bot':{ownerLanguage:async()=>'en'}});
 reported.length=0;
 assert.equal((await sms(async()=>[{chat_id:5}]).POST(signed())).status,502);
 assert.equal((await sms(async()=>{throw Error('read failed');}).POST(signed())).status,503);
 assert.deepEqual(reported.map(([source,,context,options])=>[source,context,options]),[['send-sms-hook',{route:'/api/auth/send-sms-hook',status:502,userId},{alert:'repeated'}],['send-sms-hook',{route:'/api/auth/send-sms-hook',status:503,userId},{alert:true}]]);
 assert.ok(!JSON.stringify(reported).includes('123456'),'the code itself is never reported');

 // The assistant: records that cannot load, a rejected key and any other upstream error.
 class Fake{constructor(){this.beta={messages:{create:async()=>{throw next;}}};}}
 Fake.RateLimitError=class extends Error{};Fake.AuthenticationError=class extends Error{};
 let next=new Fake.AuthenticationError('invalid x-api-key'),records=async()=>[];
 const assistant=loadTS('app/api/assistant/route.ts',{...monitor,'@anthropic-ai/sdk':{__esModule:true,default:Fake},'@/lib/supabase':{session:async()=>({token:'t',user:{id:'u1'}}),sameOrigin:()=>true},'@/lib/server-records':{readOwnerRows:(...args)=>records(...args)},'@/lib/rate-limit':{limits:{assistant:[]},rateLimited:async()=>false}});
 const ask=()=>assistant.POST(new Request('https://local/api/assistant',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'Hi'}],currency:'USD',rates:{USD:1},language:'en'})}));
 const key=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='test-key';
 try{
  reported.length=0;
  assert.equal((await ask()).status,503);
  next=new Error('overloaded');assert.equal((await ask()).status,502);
  next=new Fake.RateLimitError('busy');assert.equal((await ask()).status,429);
  records=async()=>{throw Error('records failed');};assert.equal((await ask()).status,503);
 }finally{if(key===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=key;}
 assert.deepEqual(reported.map(([source,error,context,options])=>[source,error.message,context.status,context.userId,options.alert]),[['assistant','invalid x-api-key',503,'u1',true],['assistant','overloaded',502,'u1','repeated'],['assistant','records failed',503,'u1','repeated']]);
});

test('browser reports carry only the message, stack, page path and digest, and stop after five per page',()=>{
 const {clientError,clientErrorSender,clientErrorsPerPage,clientErrorSchema,listenForClientErrors}=loadTS('lib/client-errors.ts');
 const error=new Error('x'.repeat(1200));error.stack='s'.repeat(5000);
 const report=clientError('error',error,'/transactions?q=rent#top','digest-1');
 assert.equal(report.message.length,1000);assert.equal(report.stack.length,4000);assert.equal(report.path,'/transactions');assert.equal(report.digest,'digest-1');
 assert.ok(clientErrorSchema.safeParse(report).success);
 assert.deepEqual(clientError('unhandledrejection','plain','no-slash','bad digest'),{kind:'unhandledrejection',message:'plain'});
 assert.equal(clientError('error',undefined,'/').message,'Unknown error');
 const posted=[];
 const send=clientErrorSender(async(url,init)=>{posted.push([url,init]);return new Response(null,{status:204});});
 for(let index=0;index<8;index++)send({kind:'error',message:'m'+index});
 assert.equal(posted.length,clientErrorsPerPage);assert.equal(posted[0][0],'/api/client-errors');
 assert.equal(posted[0][1].keepalive,true);assert.deepEqual(JSON.parse(posted[0][1].body),{kind:'error',message:'m0'});
 assert.equal(clientErrorSender(()=>{throw Error('no fetch');})({kind:'error',message:'m'}),true,'a sender that throws is swallowed');
 clientErrorSender(async()=>{throw Error('offline');})({kind:'error',message:'m'});
 // The listener reports errors and rejections from the page it was given, skips opaque cross-origin errors and detaches.
 const handlers={},sent=[];
 const target={location:{pathname:'/budget'},addEventListener:(type,handler)=>{handlers[type]=handler;},removeEventListener:type=>{delete handlers[type];}};
 const stop=listenForClientErrors(target,report=>{sent.push(report);return true;});
 handlers.error({error:new Error('boom'),message:'boom'});handlers.error({error:null,message:'Script error.'});handlers.error({error:null,message:'ResizeObserver loop'});handlers.unhandledrejection({reason:new Error('rejected')});
 assert.deepEqual(sent.map(item=>[item.kind,item.message,item.path]),[['error','boom','/budget'],['error','ResizeObserver loop','/budget'],['unhandledrejection','rejected','/budget']]);
 stop();assert.deepEqual(Object.keys(handlers),[]);
});

test('the client error route checks origin, size, rate and shape before reporting',async()=>{
 const reported=[];let limited=false;
 const route=loadTS('app/api/client-errors/route.ts',{'@/lib/monitoring':{reportError:async(...args)=>{reported.push(args);}},'@/lib/rate-limit':{limits:{clientErrors:[]},rateLimited:async(req,name)=>{assert.equal(name,'client-errors');return limited;}}});
 const post=(body,headers={})=>route.POST(new Request('https://app.local/api/client-errors',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
 const valid={kind:'boundary',message:'Cannot read x of undefined (anna@example.com)',stack:'TypeError\n at a (/_next/static/chunk.js:1:2)',path:'/goals',digest:'123abc'};
 assert.equal((await post(valid,{origin:'https://evil.example'})).status,403);
 assert.equal((await post(valid,{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await post(valid,{'content-length':'9000'})).status,413);
 assert.equal((await post({...valid,stack:'é'.repeat(4100)})).status,413,'bytes, not characters');
 for(const bad of ['not json',{...valid,kind:'other'},{...valid,amount:5},{...valid,path:'/goals?id=1'},{...valid,message:''},{...valid,digest:'a b'}])assert.equal((await post(bad)).status,403,JSON.stringify(bad));
 limited=true;assert.equal((await post(valid)).status,429);limited=false;
 assert.equal(reported.length,0);
 const response=await post(valid);
 assert.equal(response.status,204);
 assert.equal(reported.length,1);
 const [source,error,context,options]=reported[0];
 assert.equal(source,'client:boundary');assert.equal(error.name,'ClientError');assert.equal(error.message,valid.message);assert.equal(error.stack,valid.stack);
 assert.deepEqual(context,{route:'/goals',digest:'123abc'});assert.equal(options,undefined,'browser reports never alert');
 // And the real reporter scrubs what a browser sent.
 assert.equal(errorReport(source,error,context,{},now).message,'Cannot read x of undefined ([email])');
});

test('the health check answers ok only while the database answers, without data, cache or sign-in',async()=>{
 let db=null;
 const route=loadTS('app/api/health/route.ts',{'@/lib/service-role':{serviceDatabase:()=>db}});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='server-key';
 const check=async()=>{const response=await route.GET(new Request('https://app.local/api/health',{headers:{'x-real-ip':'203.0.113.5'}}));return [response.status,response.status===429?null:await response.json(),response.headers.get('cache-control')];};
 const warn=console.warn;console.warn=()=>{};
 try{
  let answer=true;db={write:async()=>Response.json(answer)};
  assert.deepEqual(await check(),[200,{ok:true,db:true},'no-store']);
  db={write:async()=>new Response('{}',{status:404})};
  assert.deepEqual(await check(),[200,{ok:true,db:true},'no-store'],'reachable before migration 106: still up');
  db={write:async()=>new Response('{}',{status:503})};
  assert.deepEqual(await check(),[503,{ok:false,db:false},'no-store']);
  db={write:async()=>{throw Error('timeout');}};
  assert.deepEqual(await check(),[503,{ok:false,db:false},'no-store']);
  db=null;
  assert.deepEqual(await check(),[503,{ok:false,db:false},'no-store']);
  answer=false;db={write:async()=>Response.json(answer)};
  assert.equal((await check())[0],429);
 }finally{console.warn=warn;if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
});

test('error boundaries show a translated retry and a way back, and report the digest; the reporter is mounted once',()=>{
 const reports=[],effects=[];
 const reactWithEffects={...React,useEffect:effect=>{effects.push(effect);}};
 const clientErrors={...loadTS('lib/client-errors.ts'),reportClientError:report=>{reports.push(report);return true;}};
 // The real provider's own effects need a full browser; English text through the real translator stands in.
 const {translate}=loadTS('lib/i18n.ts');
 const language={LanguageProvider:({children})=>children,useLanguage:()=>({language:'en',locale:'en-US',t:(key,params)=>translate('en',key,params)})};
 const overrides={react:reactWithEffects,'@/components/language-provider':language,'@/lib/client-errors':clientErrors,'next/link':{__esModule:true,default:props=>React.createElement('a',props)},'./globals.css':{}};
 const {ErrorScreen}=loadTS('components/error-screen.tsx',overrides);
 const error=Object.assign(new Error('render failed'),{digest:'4242'});
 const html=renderToStaticMarkup(React.createElement(ErrorScreen,{error,reset:()=>{}}));
 assert.match(html,/<main class="auth-page">/);assert.match(html,/class="empty"/);assert.match(html,/role="alert"[^>]*>Please try again\. <button/);
 assert.match(html,/>Retry<\/button>/);assert.match(html,/<a[^>]*href="\/"[^>]*>Open app<\/a>/);assert.ok(!html.includes('render failed'),'the error text is never shown');
 const previous=globalThis.window;globalThis.window={location:{pathname:'/goals'}};
 try{effects.forEach(effect=>effect());}finally{globalThis.window=previous;}
 assert.deepEqual(reports.map(report=>[report.kind,report.message,report.path,report.digest]),[['boundary','render failed','/goals','4242']]);
 for(const [file,name] of [['app/error.tsx','ErrorBoundary'],['app/global-error.tsx','GlobalError']]){
  const page=loadTS(file,overrides).default;assert.equal(page.name,name);
  const markup=renderToStaticMarkup(React.createElement(page,{error,reset:()=>{}}));
  assert.match(markup,/Please try again\./,file);
 }
 assert.match(renderToStaticMarkup(React.createElement(loadTS('app/global-error.tsx',overrides).default,{error,reset:()=>{}})),/^<html lang="en"><head><\/head><body class="antialiased"><main class="auth-page">/);
 // The listener: one mount in the root layout, nothing rendered.
 const listened=[];
 const {ErrorReporter}=loadTS('components/error-reporter.tsx',{react:reactWithEffects,'@/lib/client-errors':{listenForClientErrors:target=>{listened.push(target);return ()=>{};}}});
 effects.length=0;assert.equal(renderToStaticMarkup(React.createElement(ErrorReporter)),'');
 globalThis.window={location:{pathname:'/'}};try{effects.forEach(effect=>effect());}finally{globalThis.window=previous;}
 assert.equal(listened.length,1);
 const layout=fs.readFileSync('app/layout.tsx','utf8');
 assert.equal(layout.split('<ErrorReporter/>').length,2);
 assert.ok(!fs.readFileSync('components/workspace/workspace-shell.tsx','utf8').includes('ErrorReporter'));
});

test('monitoring is documented and configured only through server-side variables',()=>{
 const env=fs.readFileSync('.env.example','utf8'),vercel=fs.readFileSync('VERCEL.md','utf8');
 for(const name of ['SENTRY_DSN=','TELEGRAM_ALERT_CHAT_ID='])assert.ok(env.includes(name),name);
 assert.match(env,/getUpdates/);
 assert.match(vercel,/## Monitoring and alerts/);assert.match(vercel,/\/api\/health/);assert.match(vercel,/UptimeRobot/);assert.match(vercel,/Cron Jobs/);
 for(const file of ['lib/monitoring.ts','lib/client-errors.ts','components/error-reporter.tsx'])assert.ok(!/NEXT_PUBLIC_/.test(fs.readFileSync(file,'utf8')),file);
 assert.ok(!/from ['"]@\/lib\/monitoring['"]/.test(fs.readFileSync('lib/client-errors.ts','utf8')),'the browser bundle never includes the server reporter');
});
