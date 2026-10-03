import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const owner='11111111-1111-4111-8111-111111111111';
let authenticated=true,rows=[],calls=[],ok=true;
const env={TELEGRAM_BOT_TOKEN:'TOKEN',TELEGRAM_WEBHOOK_SECRET:'SECRET',TELEGRAM_BOT_USERNAME:'hoggish_bot',SUPABASE_URL:'https://db.local',SUPABASE_SERVICE_ROLE_KEY:'SERVICE'};
Object.assign(process.env,env);
const supabase={session:async()=>authenticated?{user:{id:owner},token:'owner-token'}:null,sameOrigin:req=>req.headers.get('origin')==='https://app.local',supa:async(path,init={},token)=>{calls.push({path,init,token});return ok?Response.json(rows):new Response(null,{status:500});}};
const route=loadTS('app/api/telegram/route.ts',{'@/lib/supabase':supabase});
const request=body=>new Request('https://app.local/api/telegram',{method:'POST',headers:{origin:'https://app.local','Content-Type':'application/json'},body:JSON.stringify(body)});

test('status reads only the owner row',async()=>{
 calls=[];rows=[{user_id:owner,chat_id:5,digest_enabled:true,actions_enabled:false,linked_at:'x'}];
 const response=await route.GET();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{configured:true,linked:true,digest_enabled:true,actions_enabled:false,bot_username:'hoggish_bot'});
 assert.equal(calls[0].token,'owner-token');assert.match(calls[0].path,/user_id=eq\.11111111-1111-4111-8111-111111111111$/);
});

test('unlink and settings patch only the owner row and echo the new status',async()=>{
 calls=[];rows=[{user_id:owner,chat_id:null,digest_enabled:false,actions_enabled:true,linked_at:null}];
 const unlinked=await route.POST(request({action:'unlink'}));
 assert.equal(unlinked.status,200);assert.equal((await unlinked.json()).linked,false);
 assert.equal(calls[0].init.method,'PATCH');assert.match(calls[0].path,/user_id=eq\.11111111-1111-4111-8111-111111111111$/);
 assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)).sort(),['chat_id','linked_at','updated_at']);
 calls=[];
 const settings=await route.POST(request({action:'settings',digest_enabled:false,actions_enabled:true}));
 assert.equal(settings.status,200);
 const patch=JSON.parse(calls[0].init.body);assert.equal(patch.digest_enabled,false);assert.equal(patch.actions_enabled,true);assert.ok(!('chat_id' in patch));
});

test('rejects bad bodies, anonymous and cross-origin calls, and reports database failures',async()=>{
 calls=[];
 // No code is handed out any more: chats link through the bot's phone or web sign-in.
 for(const body of [{action:'link'},{action:'settings'},{action:'nope'},{action:'settings',digest_enabled:'yes',actions_enabled:true}])assert.equal((await route.POST(request(body))).status,400);
 assert.equal(calls.length,0);
 assert.equal((await route.POST(new Request('https://app.local/api/telegram',{method:'POST',headers:{origin:'https://evil.local'},body:'{}'}))).status,403);
 authenticated=false;assert.equal((await route.GET()).status,401);assert.equal((await route.POST(request({action:'unlink'}))).status,401);authenticated=true;
 ok=false;try{assert.equal((await route.GET()).status,503);assert.equal((await route.POST(request({action:'unlink'}))).status,503);}finally{ok=true;}
});

test('without bot configuration the panel is told to wait for server setup',async()=>{
 const bare=loadTS('app/api/telegram/route.ts',{'@/lib/supabase':supabase,'@/lib/telegram':{telegramConfig:()=>null}});
 rows=[];
 assert.equal((await (await bare.GET()).json()).configured,false);
 assert.equal((await bare.POST(request({action:'unlink'}))).status,503);
});

test('the webhook checks the secret header, hands updates to the bot and sends its replies',async()=>{
 const sent=[],handled=[];
 const webhook=loadTS('app/api/telegram/webhook/route.ts',{
  '@/lib/telegram':{telegramConfig:()=>({token:'TOKEN',webhookSecret:'SECRET',botUsername:'hoggish_bot'}),sendTelegramMessage:async message=>{sent.push(message);return true;},answerCallback:async id=>{sent.push({callback:id});return true;}},
  '@/lib/telegram-bot':{handleTelegramUpdate:async update=>{handled.push(update);if(update.fail)throw Error('Database request failed.');return {replies:[{chat_id:1,text:'ok'}],callbackId:update.callback_query?.id};}},
 });
 const post=(body,secret)=>webhook.POST(new Request('https://app.local/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'x-telegram-bot-api-secret-token':secret}:{})},body}));
 assert.equal((await post('{}','WRONG')).status,401);
 assert.equal((await post('{}')).status,401);
 assert.equal(handled.length,0);
 assert.equal((await post(JSON.stringify({message:{chat:{id:1},text:'hi'}}),'SECRET')).status,200);
 assert.deepEqual(sent,[{chat_id:1,text:'ok'}]);
 sent.length=0;
 assert.equal((await post(JSON.stringify({callback_query:{id:'cb'}}),'SECRET')).status,200);
 assert.deepEqual(sent[0],{callback:'cb'});
 assert.equal((await post('not json','SECRET')).status,200);
 assert.equal((await post(JSON.stringify({fail:true}),'SECRET')).status,503);
});

test('the webhook refuses to run without bot or database configuration',async()=>{
 const noBot=loadTS('app/api/telegram/webhook/route.ts',{'@/lib/telegram':{telegramConfig:()=>null,sendTelegramMessage:async()=>true,answerCallback:async()=>true}});
 assert.equal((await noBot.POST(new Request('https://app.local/api/telegram/webhook',{method:'POST',body:'{}'}))).status,503);
 const noDb=loadTS('app/api/telegram/webhook/route.ts',{'@/lib/telegram':{telegramConfig:()=>({token:'T',webhookSecret:'SECRET',botUsername:'b'}),sendTelegramMessage:async()=>true,answerCallback:async()=>true},'@/lib/service-role':{serviceDatabase:()=>null}});
 assert.equal((await noDb.POST(new Request('https://app.local/api/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'SECRET'},body:'{}'}))).status,503);
});

test('the server key is sent as apikey alone when it is a new sb_secret key, and with Bearer when it is a legacy JWT',async()=>{
 const {serviceKeyHeaders,serviceDatabase}=(await import('./helpers/load-ts.mjs')).loadTS('lib/service-role.ts');
 assert.deepEqual(serviceKeyHeaders('sb_secret_abc123'),{apikey:'sb_secret_abc123'});
 assert.deepEqual(serviceKeyHeaders('eyJhbGciOi.legacy.jwt'),{apikey:'eyJhbGciOi.legacy.jwt',Authorization:'Bearer eyJhbGciOi.legacy.jwt'});
 for(const [key,bearer] of [['sb_secret_abc123',false],['eyJhbGciOi.legacy.jwt',true]]){
  const seen=[];
  const db=serviceDatabase({SUPABASE_SERVICE_ROLE_KEY:key,SUPABASE_URL:'https://project.supabase.co'},async(url,init)=>{seen.push(init.headers);return Response.json([]);});
  await db.read('/rest/v1/x');
  assert.equal(seen[0].apikey,key);
  assert.equal('Authorization' in seen[0],bearer);
 }
 const fs=(await import('node:fs')).default;
 for(const file of ['app/api/account-access/route.ts','app/api/backup/route.ts','app/api/cron/portfolio-snapshots/route.ts','lib/service-role.ts'])assert.ok(!/Authorization:'Bearer '\+(?:key|serviceKey)\b/.test(fs.readFileSync(file,'utf8').replace(/export const serviceKeyHeaders[^\n]*/,'')),file);
});
