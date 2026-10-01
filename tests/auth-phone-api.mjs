import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {loadTS} from './helpers/load-ts.mjs';
import {botDb,ownerId,subscription} from './helpers/bot-db.mjs';
const {derivedPassword,createLoginToken}=loadTS('lib/telegram-account.ts');
const config={token:'123456:TEST-TOKEN',webhookSecret:'server-secret',botUsername:'hoggish_bot'};
const hookSecret='v1,whsec_'+Buffer.from('hook-signing-secret').toString('base64');
const session={access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:ownerId}};
const sameOrigin=req=>req.headers.get('origin')==='https://app.local';
process.env.SEND_SMS_HOOK_SECRET=hookSecret;process.env.TELEGRAM_WEBHOOK_SECRET='server-secret';

// --- the Supabase hook
const sendSms=(db,sent)=>loadTS('app/api/auth/send-sms-hook/route.ts',{
 '@/lib/service-role':{serviceDatabase:()=>db},
 '@/lib/telegram':{telegramConfig:()=>config,sendTelegramMessage:async(message,used)=>{sent.push({message,used});return !sent.fail;}},
 '@/lib/telegram-bot':{ownerLanguage:async(_,id)=>db.tables.user_preferences.find(row=>row.user_id===id)?.language??'en'},
});
function hookRequest(body,{secret=hookSecret,id='msg_1',timestamp=String(Math.floor(Date.now()/1000))}={}){
 const raw=typeof body==='string'?body:JSON.stringify(body);
 const signature='v1,'+createHmac('sha256',Buffer.from(secret.replace(/^v1,whsec_/,''),'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');
 return new Request('https://app.local/api/auth/send-sms-hook',{method:'POST',headers:{'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':signature},body:raw});
}
const payload={user:{id:ownerId,phone:'+998901234567'},sms:{otp:'123456'}};
test('the SMS hook sends the code to the Telegram chat of the account, in its language, and nowhere else',async()=>{
 const db=botDb({telegram_subscriptions:[subscription({chat_id:777})],user_preferences:[{user_id:ownerId,language:'ru'}]}),sent=[];
 const response=await sendSms(db,sent).POST(hookRequest(payload));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{});
 assert.equal(sent.length,1);assert.equal(sent[0].message.chat_id,777);
 assert.match(sent[0].message.text,/<code>123456<\/code>/);assert.ok(!sent[0].message.text.includes('+998'));
 assert.equal(sent[0].used,config);
});
test('the SMS hook refuses unsigned, tampered, stale and malformed calls before touching anything',async()=>{
 const db=botDb({telegram_subscriptions:[subscription({chat_id:777})]}),sent=[],route=sendSms(db,sent);
 const bad=[
  new Request('https://app.local/api/auth/send-sms-hook',{method:'POST',body:JSON.stringify(payload)}),
  hookRequest(payload,{secret:'v1,whsec_'+Buffer.from('another-secret').toString('base64')}),
  hookRequest(payload,{timestamp:String(Math.floor(Date.now()/1000)-3600)}),
 ];
 const tampered=hookRequest(payload);bad.push(new Request(tampered.url,{method:'POST',headers:tampered.headers,body:JSON.stringify({...payload,sms:{otp:'999999'}})}));
 for(const request of bad)assert.equal((await route.POST(request)).status,401);
 for(const body of ['not json',{user:{id:'x'},sms:{otp:'123456'}},{user:{id:ownerId},sms:{otp:'abc'}},{user:{id:ownerId}},{}])assert.equal((await route.POST(hookRequest(body))).status,400,JSON.stringify(body));
 assert.equal(sent.length,0);
});
test('the SMS hook reports accounts without a chat, failed deliveries and missing setup with errors Supabase relays',async()=>{
 const sent=[];
 const none=await sendSms(botDb({telegram_subscriptions:[subscription({chat_id:null})]}),sent).POST(hookRequest(payload));
 assert.equal(none.status,400);assert.equal((await none.json()).error.http_code,400);
 const noRow=await sendSms(botDb(),sent).POST(hookRequest(payload));assert.equal(noRow.status,400);
 sent.fail=true;
 const failed=await sendSms(botDb({telegram_subscriptions:[subscription({chat_id:777})]}),sent).POST(hookRequest(payload));assert.equal(failed.status,502);
 sent.fail=false;
 const broken=botDb({telegram_subscriptions:[subscription({chat_id:777})],__fail:['telegram_subscriptions']});
 assert.equal((await sendSms(broken,sent).POST(hookRequest(payload))).status,503);
 const saved=process.env.SEND_SMS_HOOK_SECRET;delete process.env.SEND_SMS_HOOK_SECRET;
 try{assert.equal((await sendSms(botDb(),sent).POST(hookRequest(payload))).status,503);}finally{process.env.SEND_SMS_HOOK_SECRET=saved;}
});

// --- phone sign-in
function phoneRoute(supa,saved=[]){
 return loadTS('app/api/auth/phone/route.ts',{'@/lib/supabase':{supa,sameOrigin,saveSession:async value=>saved.push(value)},'@/lib/telegram':{telegramConfig:()=>config}});
}
const phoneRequest=(body,origin='https://app.local')=>new Request('https://app.local/api/auth/phone',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('phone sign-in is advertised only when the hook is configured, with the bot to open',async()=>{
 const route=phoneRoute(async()=>Response.json({}));
 assert.deepEqual(await (await route.GET()).json(),{enabled:true,botUsername:'hoggish_bot'});
 const saved=process.env.SEND_SMS_HOOK_SECRET;delete process.env.SEND_SMS_HOOK_SECRET;
 try{assert.equal((await (await route.GET()).json()).enabled,false);}finally{process.env.SEND_SMS_HOOK_SECRET=saved;}
});
test('asking for a code never creates accounts and answers the same for known and unknown numbers',async()=>{
 const calls=[];
 const route=phoneRoute(async(path,init)=>{calls.push({path,body:JSON.parse(init.body)});return calls.length===2?Response.json({error_code:'otp_disabled'},{status:422}):Response.json({});});
 const known=await route.POST(phoneRequest({action:'send',phone:'+998 90 123 45 67'}));
 const unknown=await route.POST(phoneRequest({action:'send',phone:'998901234567'}));
 assert.equal(known.status,200);assert.equal(unknown.status,200);
 assert.deepEqual(await known.json(),await unknown.json());
 assert.deepEqual(calls.map(call=>call.path),['/auth/v1/otp','/auth/v1/otp']);
 assert.deepEqual(calls[0].body,{phone:'+998901234567',create_user:false});
});
test('code requests report rate limits and outages, and reject bad numbers and foreign sites',async()=>{
 const limited=phoneRoute(async()=>new Response(null,{status:429}));
 assert.equal((await limited.POST(phoneRequest({action:'send',phone:'+998901234567'}))).status,429);
 const down=phoneRoute(async()=>new Response(null,{status:500}));
 assert.equal((await down.POST(phoneRequest({action:'send',phone:'+998901234567'}))).status,503);
 const thrown=phoneRoute(async()=>{throw Error('network');});
 assert.equal((await thrown.POST(phoneRequest({action:'send',phone:'+998901234567'}))).status,503);
 const never=phoneRoute(async()=>{throw Error('must not be called');});
 for(const body of [{action:'send',phone:'abc'},{action:'send',phone:''},{action:'verify',phone:'+998901234567',code:'12'},{action:'verify',phone:'+998901234567',code:'abcdef'},{action:'other'},{}])assert.equal((await never.POST(phoneRequest(body))).status,400,JSON.stringify(body));
 assert.equal((await never.POST(phoneRequest({action:'send',phone:'+998901234567'},'https://evil.example'))).status,403);
 const crossSite=new Request('https://app.local/api/auth/phone',{method:'POST',headers:{origin:'https://app.local','sec-fetch-site':'cross-site'},body:'{}'});
 assert.equal((await never.POST(crossSite)).status,403);
});
test('a correct code signs the person in with a session cookie, a wrong one does not',async()=>{
 const saved=[],calls=[];
 const route=phoneRoute(async(path,init)=>{calls.push({path,body:JSON.parse(init.body)});return JSON.parse(init.body).token==='123456'?Response.json(session):Response.json({error_code:'otp_expired'},{status:403});},saved);
 const ok=await route.POST(phoneRequest({action:'verify',phone:'998901234567',code:'123456'}));
 assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{next:'signed_in'});
 assert.deepEqual(calls[0],{path:'/auth/v1/verify',body:{type:'sms',phone:'+998901234567',token:'123456'}});
 assert.deepEqual(saved,[session]);
 const wrong=await route.POST(phoneRequest({action:'verify',phone:'998901234567',code:'000000'}));
 assert.equal(wrong.status,400);assert.equal(saved.length,1);
 const limited=phoneRoute(async()=>new Response(null,{status:429}));assert.equal((await limited.POST(phoneRequest({action:'verify',phone:'+998901234567',code:'123456'}))).status,429);
 const odd=phoneRoute(async()=>Response.json({access_token:'only'}));assert.equal((await odd.POST(phoneRequest({action:'verify',phone:'+998901234567',code:'123456'}))).status,503);
});

// --- one-tap and Mini App sign-in
function telegramRoute(db,supa,saved=[]){
 return loadTS('app/api/auth/telegram/route.ts',{'@/lib/service-role':{serviceDatabase:()=>db},'@/lib/telegram':{telegramConfig:()=>config},'@/lib/supabase':{supa,sameOrigin,saveSession:async value=>saved.push(value)}});
}
const tgRequest=body=>new Request('https://app.local/api/auth/telegram',{method:'POST',headers:{origin:'https://app.local','Content-Type':'application/json'},body:JSON.stringify(body)});
const here=()=>subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'2026-10-01T00:00:00Z'});
const initData=(userId,issued=Math.floor(Date.now()/1000))=>{
 const params=new URLSearchParams({auth_date:String(issued),user:JSON.stringify({id:userId,first_name:'Aziz'})});
 const check=[...params.entries()].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');
 params.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(config.token).digest()).update(check).digest('hex'));
 return params.toString();
};
test('a one-tap link signs in with the derived password exactly once',async()=>{
 const db=botDb({telegram_subscriptions:[here()]}),saved=[],calls=[];
 const token=await createLoginToken(db,ownerId,new Date());
 const route=telegramRoute(db,async(path,init)=>{calls.push({path,body:JSON.parse(init.body)});return Response.json(session);},saved);
 const response=await route.POST(tgRequest({token}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{next:'signed_in'});
 assert.deepEqual(calls[0],{path:'/auth/v1/token?grant_type=password',body:{phone:'+998901234567',password:derivedPassword('server-secret',777)}});
 assert.deepEqual(saved,[session]);
 const again=await route.POST(tgRequest({token}));
 assert.equal(again.status,401);assert.equal(calls.length,1);assert.equal(saved.length,1);
});
test('Mini App data signs in only the Telegram user it names, and only when genuine',async()=>{
 const db=botDb({telegram_subscriptions:[here()]}),saved=[],calls=[];
 const route=telegramRoute(db,async(path,init)=>{calls.push(JSON.parse(init.body));return Response.json(session);},saved);
 assert.equal((await route.POST(tgRequest({initData:initData(777)}))).status,200);
 assert.equal(calls[0].password,derivedPassword('server-secret',777));
 assert.equal((await route.POST(tgRequest({initData:initData(888)}))).status,403,'a Telegram user with no account');
 assert.equal((await route.POST(tgRequest({initData:initData(777).replace('Aziz','Evil')}))).status,401);
 assert.equal((await route.POST(tgRequest({initData:initData(777,Math.floor(Date.now()/1000)-7200)}))).status,401);
 assert.equal(saved.length,1);assert.equal(calls.length,1);
});
test('one-tap sign-in refuses accounts that were not made in Telegram, wrong passwords, bad bodies and other sites',async()=>{
 const email=botDb({telegram_subscriptions:[subscription({chat_id:777})]});
 const token=await createLoginToken(email,ownerId,new Date());
 const calls=[];
 assert.equal((await telegramRoute(email,async()=>{calls.push(1);return Response.json(session);}).POST(tgRequest({token}))).status,403);
 assert.equal(calls.length,0);
 // The person set their own password, so the derived one no longer works.
 const changed=botDb({telegram_subscriptions:[here()]});const secondToken=await createLoginToken(changed,ownerId,new Date());
 assert.equal((await telegramRoute(changed,async()=>Response.json({},{status:400})).POST(tgRequest({token:secondToken}))).status,401);
 // With phone sign-in switched off in Supabase, the person is told it is not available yet, not sent to a code that cannot arrive.
 const off=botDb({telegram_subscriptions:[here()]});const offToken=await createLoginToken(off,ownerId,new Date());
 const disabled=await telegramRoute(off,async()=>Response.json({code:422,error_code:'phone_provider_disabled',msg:'Phone logins are disabled'},{status:422})).POST(tgRequest({token:offToken}));
 assert.equal(disabled.status,503);assert.deepEqual(await disabled.json(),{error:'Telegram sign-in is not available yet.'});
 const route=telegramRoute(botDb({telegram_subscriptions:[here()]}),async()=>Response.json(session));
 for(const body of [{},{token:'a',initData:'b'},{token:'x'.repeat(300)},null,'text'])assert.equal((await route.POST(tgRequest(body))).status,400,JSON.stringify(body));
 assert.equal((await route.POST(new Request('https://app.local/api/auth/telegram',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
 assert.equal((await telegramRoute(botDb(),async()=>Response.json(session)).POST(tgRequest({token:'0'.repeat(64)}))).status,401);
 const broken=telegramRoute(botDb({__fail:['telegram_login_tokens']}),async()=>Response.json(session));
 assert.equal((await broken.POST(tgRequest({token:'0'.repeat(64)}))).status,503);
});
