import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {loadTS} from './helpers/load-ts.mjs';
import {botDb,ownerId} from './helpers/bot-db.mjs';
const {normalizePhone}=loadTS('lib/phone.ts');
const {verifyStandardWebhook}=loadTS('lib/standard-webhook.ts');
const {verifyInitData}=loadTS('lib/telegram-webapp.ts');
const {derivedPassword,adminAccounts,createTelegramAccount,createLoginToken,consumeLoginToken,loginTokenMinutes}=loadTS('lib/telegram-account.ts');
const now=new Date('2026-10-01T09:00:00Z');

test('phone numbers become international form, with or without the plus Telegram leaves out',()=>{
 assert.equal(normalizePhone('+998 90 123-45-67'),'+998901234567');
 assert.equal(normalizePhone('998901234567'),'+998901234567');
 assert.equal(normalizePhone('0099890 123 45 67'),'+998901234567');
 assert.equal(normalizePhone('(1) 555-123-4567'),'+15551234567');
 for(const bad of ['','abc','+0123456789','12345','+1234567890123456',null,undefined,42,'+998 90 123 45 6a'])assert.equal(normalizePhone(bad),null,String(bad));
});

const webhookSecret='v1,whsec_'+Buffer.from('a-long-random-signing-secret').toString('base64');
const sign=(id,timestamp,body,secret=webhookSecret)=>'v1,'+createHmac('sha256',Buffer.from(secret.replace(/^v1,whsec_/,''),'base64')).update(`${id}.${timestamp}.${body}`).digest('base64');
test('webhook signatures are checked against the exact body, the secret and the clock',()=>{
 const body='{"user":{"id":"u"},"sms":{"otp":"123456"}}',id='msg_1',timestamp=String(Math.floor(now.getTime()/1000));
 const check=(over={})=>verifyStandardWebhook({secret:webhookSecret,id,timestamp,signature:sign(id,timestamp,body),body,now:now.getTime(),...over});
 assert.equal(check(),true);
 assert.equal(check({signature:'v1,AAAA '+sign(id,timestamp,body)}),true,'any of several signatures may match');
 assert.equal(check({body:body.replace('123456','654321')}),false);
 assert.equal(check({secret:'v1,whsec_'+Buffer.from('another-secret').toString('base64')}),false);
 assert.equal(check({id:'msg_2'}),false);
 assert.equal(check({timestamp:String(Number(timestamp)-301),signature:sign(id,String(Number(timestamp)-301),body)}),false,'too old');
 assert.equal(check({timestamp:String(Number(timestamp)+301),signature:sign(id,String(Number(timestamp)+301),body)}),false,'too far ahead');
 for(const missing of [{id:null},{timestamp:null},{signature:null},{secret:''},{timestamp:'soon'},{signature:'v2,'+sign(id,timestamp,body).slice(3)},{signature:'v1,'}])assert.equal(check(missing),false,JSON.stringify(missing));
});

const botToken='123456:TEST-TOKEN';
function initData(fields,token=botToken){
 const params=new URLSearchParams(fields);
 const check=[...params.entries()].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
 return params.toString();
}
test('Mini App data is accepted only when Telegram signed it recently for a real user',()=>{
 const issued=Math.floor(now.getTime()/1000),user=JSON.stringify({id:777,first_name:'Aziz',language_code:'uz'});
 const good=initData({auth_date:String(issued-60),query_id:'q',user});
 assert.deepEqual(verifyInitData(good,botToken,now.getTime()),{id:777,firstName:'Aziz',languageCode:'uz'});
 assert.equal(verifyInitData(good,'999:OTHER',now.getTime()),null,'signed with a different bot token');
 assert.equal(verifyInitData(good.replace('Aziz','Evil'),botToken,now.getTime()),null,'edited after signing');
 assert.equal(verifyInitData(initData({auth_date:String(issued-7200),user}),botToken,now.getTime()),null,'older than an hour');
 assert.equal(verifyInitData(initData({auth_date:String(issued+3600),user}),botToken,now.getTime()),null,'dated in the future');
 assert.equal(verifyInitData(initData({auth_date:String(issued),user:'not json'}),botToken,now.getTime()),null);
 assert.equal(verifyInitData(initData({auth_date:String(issued),user:JSON.stringify({id:-4})}),botToken,now.getTime()),null);
 for(const bad of ['',null,undefined,42,'hash=zz','x'.repeat(5000)])assert.equal(verifyInitData(bad,botToken,now.getTime()),null);
 assert.equal(verifyInitData(good,'',now.getTime()),null);
});

test('the Telegram password is derived, stable for one person and different for everyone else',()=>{
 const a=derivedPassword('server-secret',777);
 assert.match(a,/^[0-9a-f]{64}$/);
 assert.equal(derivedPassword('server-secret',777),a);
 assert.notEqual(derivedPassword('server-secret',778),a);
 assert.notEqual(derivedPassword('another-secret',777),a);
});

function adminHarness(responses){
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,init:{...init,body:init.body?JSON.parse(init.body):undefined}});return responses.shift();};
 return {calls,admin:adminAccounts({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_abc'},fetcher)};
}
test('the admin client creates confirmed phone users with the secret key in apikey alone, and reports taken numbers',async()=>{
 assert.equal(adminAccounts({SUPABASE_URL:'https://x'}),null);assert.equal(adminAccounts({SUPABASE_SERVICE_ROLE_KEY:'k'}),null);
 const created=adminHarness([Response.json({id:ownerId})]);
 assert.deepEqual(await created.admin.createPhoneUser({phone:'+998901234567',password:'pw',metadata:{telegram_user_id:777}}),{id:ownerId});
 assert.equal(created.calls[0].url,'https://project.supabase.co/auth/v1/admin/users');
 assert.equal(created.calls[0].init.method,'POST');
 assert.deepEqual(created.calls[0].init.body,{phone:'+998901234567',password:'pw',phone_confirm:true,user_metadata:{telegram_user_id:777}});
 assert.equal(created.calls[0].init.headers.apikey,'sb_secret_abc');assert.ok(!('Authorization' in created.calls[0].init.headers));
 const taken=adminHarness([Response.json({error_code:'phone_exists'},{status:422}),Response.json({error_code:'phone_exists'},{status:422})]);
 assert.deepEqual(await taken.admin.createPhoneUser({phone:'+1',password:'p',metadata:{}}),{exists:true});
 assert.equal(await taken.admin.setUserPhone(ownerId,'+998901234567'),false);
 const broken=adminHarness([new Response(null,{status:500}),Response.json({}),new Response(null,{status:500})]);
 await assert.rejects(broken.admin.createPhoneUser({phone:'+1',password:'p',metadata:{}}),/Account creation failed/);
 await assert.rejects(broken.admin.createPhoneUser({phone:'+1',password:'p',metadata:{}}),/Account creation failed/);
 await assert.rejects(broken.admin.setUserPhone(ownerId,'+1'),/Could not save/);
 const set=adminHarness([new Response(null,{status:200}),new Response(null,{status:200})]);
 assert.equal(await set.admin.setUserPhone(ownerId,'+998901234567'),true);
 assert.equal(set.calls[0].url,'https://project.supabase.co/auth/v1/admin/users/'+ownerId);assert.deepEqual(set.calls[0].init.body,{phone:'+998901234567',phone_confirm:true});
 await set.admin.deleteUser(ownerId);assert.equal(set.calls[1].init.method,'DELETE');
});

const person={chatId:777,telegramUserId:777,phone:'+998901234567',firstName:'  Aziz ',language:'en',now};
test('creating an account stores preferences and a linked chat with the consent time, and uses the derived password',async()=>{
 const db=botDb();const sent=[];
 const admin={createPhoneUser:async input=>{sent.push(input);return {id:ownerId};},setUserPhone:async()=>true,deleteUser:async()=>{}};
 assert.deepEqual(await createTelegramAccount({db,admin,secret:'s'},person),{userId:ownerId});
 assert.deepEqual(sent[0],{phone:'+998901234567',password:derivedPassword('s',777),metadata:{telegram_user_id:777,first_name:'  Aziz '.slice(0,80)}});
 assert.deepEqual(db.tables.user_preferences,[{user_id:ownerId,language:'en',currencies:['USD'],display_name:'Aziz'}]);
 const [row]=db.tables.telegram_subscriptions;
 assert.deepEqual({...row,linked_at:undefined,consented_at:undefined,updated_at:undefined},{user_id:ownerId,chat_id:777,telegram_user_id:777,phone:'+998901234567',first_name:'Aziz',digest_enabled:true,actions_enabled:true,linked_at:undefined,consented_at:undefined,updated_at:undefined});
 assert.equal(row.consented_at,now.toISOString());assert.equal(row.linked_at,now.toISOString());
});
test('a taken number creates nothing, and a failed write removes the new user again',async()=>{
 const db=botDb(),deleted=[];
 assert.deepEqual(await createTelegramAccount({db,admin:{createPhoneUser:async()=>({exists:true}),setUserPhone:async()=>true,deleteUser:async id=>deleted.push(id)},secret:'s'},person),{exists:true});
 assert.equal(db.writes.length,0);assert.equal(deleted.length,0);
 for(const failing of ['user_preferences','telegram_subscriptions']){
  const broken=botDb({__fail:[failing]});
  await assert.rejects(createTelegramAccount({db:broken,admin:{createPhoneUser:async()=>({id:ownerId}),setUserPhone:async()=>true,deleteUser:async id=>deleted.push(id)},secret:'s'},person),/Database request failed/);
 }
 assert.deepEqual(deleted,[ownerId,ownerId]);
});

test('login tokens are random, stored only as hashes, valid for minutes and spendable exactly once',async()=>{
 const db=botDb();
 const token=await createLoginToken(db,ownerId,now);
 assert.match(token,/^[0-9a-f]{64}$/);
 const [stored]=db.tables.telegram_login_tokens;
 assert.notEqual(stored.token_hash,token);assert.match(stored.token_hash,/^[0-9a-f]{64}$/);
 assert.equal(stored.expires_at,new Date(now.getTime()+loginTokenMinutes*60000).toISOString());assert.equal(loginTokenMinutes,5);
 assert.notEqual(await createLoginToken(db,ownerId,now),token);
 const later=new Date(now.getTime()+60000);
 assert.equal(await consumeLoginToken(db,token,later),ownerId);
 assert.equal(await consumeLoginToken(db,token,later),null,'a second use fails');
 const old=await createLoginToken(db,ownerId,now);
 assert.equal(await consumeLoginToken(db,old,new Date(now.getTime()+6*60000)),null,'expired');
 for(const bad of ['',null,undefined,'zz','A'.repeat(64),'0'.repeat(64),42])assert.equal(await consumeLoginToken(db,bad,later),null,String(bad));
 await assert.rejects(consumeLoginToken(botDb({__fail:['telegram_login_tokens']}),token,later),/Database request failed/);
 await assert.rejects(createLoginToken(botDb({__fail:['telegram_login_tokens']}),ownerId,now),/Database request failed/);
});
