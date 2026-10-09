import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
// Failure paths of the API routes: files that must not outlive their account, paid feeds and sign-ins behind limits,
// and error answers that never echo what a library or the request said.
const owner='a0000000-0000-4000-8000-000000000001',other='a0000000-0000-4000-8000-000000000002';
const post=(url,body,headers={})=>new Request('https://local'+url,{method:'POST',headers:{origin:'https://local',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
/** A rate limiter that counts every call and refuses the names in `over`. */
function limiter(over=new Set()){
 const calls=[];
 return {calls,module:{limits:loadTS('lib/rate-limit.ts').limits,rateLimited:async(req,name,limits,key,options)=>{calls.push({name,limits,key,options});return over.has(name);}}};
}
const withEnv=async(values,run)=>{
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
 Object.assign(process.env,values);
 try{return await run();}finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
};

test('account deletion keeps the account when its stored files cannot be removed',async context=>{
 const admin=[];context.mock.method(globalThis,'fetch',async(url,init)=>{admin.push({url,init});return Response.json({});});
 const jar={get:()=>undefined,set:()=>{},delete:()=>{}};
 let storage=500;
 const route=loadTS('app/api/account-access/route.ts',{'next/headers':{cookies:async()=>jar},'@/lib/rate-limit':limiter().module,'@/lib/supabase':{session:async()=>({user:{id:owner,phone:'+10000000000'},token:'owner'}),sameOrigin:()=>true,config:()=>({url:'https://supabase.invalid'}),saveSession:async()=>{},
  supa:async path=>path.startsWith('/rest/v1/record_attachments')?Response.json([{id:other,path:`${owner}/${other}/${other}.pdf`}]):path.startsWith('/storage/')?new Response('{}',{status:storage}):Response.json({})}});
 await withEnv({SUPABASE_SERVICE_ROLE_KEY:'test-admin-key'},async()=>{
  const failed=await route.POST(post('/api/account-access',{action:'delete_account',confirmation:'DELETE'}));
  assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'Could not delete the account. Please try again.'});
  assert.equal(admin.length,0,'the account is not deleted while its files remain');
  storage=200;
  assert.equal((await route.POST(post('/api/account-access',{action:'delete_account',confirmation:'DELETE'}))).status,200);
  assert.equal(admin.length,1);assert.match(admin[0].url,/\/auth\/v1\/admin\/users\//);
 });
});

test('removing an attachment deletes its row only after the file is gone',async()=>{
 const calls=[];let storage=500;
 const row={id:other,user_id:owner,record_id:other,path:`${owner}/${other}/${other}.pdf`};
 const route=loadTS('app/api/record-attachments/route.ts',{'@/lib/supabase':{config:()=>({url:'https://project.supabase.co'}),session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:()=>true,
  supa:async(path,init={})=>{calls.push({path,method:init.method??'GET'});return path.startsWith('/storage/')?new Response('{}',{status:storage}):Response.json(init.method==='DELETE'?null:[row]);}}});
 const remove=()=>route.POST(post('/api/record-attachments',{action:'delete',data:{id:other}}));
 assert.equal((await remove()).status,503);
 assert.ok(!calls.some(call=>call.method==='DELETE'&&call.path.startsWith('/rest/v1/record_attachments')),'the row stays for a retry');
 storage=200;calls.length=0;
 assert.equal((await remove()).status,200);
 const order=calls.filter(call=>call.method==='DELETE').map(call=>call.path.split('?')[0]);
 assert.deepEqual(order,['/storage/v1/object/attachments','/rest/v1/record_attachments']);
});

// Emptying the bin removes files before their rows (migration 130): a failed removal keeps the rows for the next purge.
function binRoute(storageOk){
 const reports=[],calls=[];
 const route=loadTS('app/api/deleted-items/route.ts',{'@/lib/monitoring':{reportError:async(source,error,context)=>{reports.push({source,context});}},'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:()=>true,
  supa:async(path,init)=>{calls.push({path,body:init?.body});return path.startsWith('/storage/')?new Response('{}',{status:storageOk?200:500}):path.endsWith('forget_attachments')?Response.json(1):Response.json({paths:[`${owner}/${other}/${other}.pdf`,`${other}/x/y.pdf`]});}}});
 const purge=()=>route.DELETE(new Request('https://local/api/deleted-items',{method:'DELETE',body:JSON.stringify({id:other})}));
 return {reports,calls,purge};
}

test('emptying the bin reports files storage would not remove and keeps their rows for the next purge',async()=>{
 const {reports,calls,purge}=binRoute(false);
 assert.equal((await purge()).status,200,'the item itself is gone for good');
 assert.equal(reports.length,1);assert.equal(reports[0].source,'attachment-removal');assert.equal(reports[0].context.userId,owner);
 assert.ok(!calls.some(call=>call.path.endsWith('forget_attachments')),'rows of files still stored are kept');
});

test('emptying the bin forgets attachment rows only after their files are removed, and only the owner\'s',async()=>{
 const {reports,calls,purge}=binRoute(true);
 assert.equal((await purge()).status,200);assert.equal(reports.length,0);
 const order=calls.map(call=>call.path.split('?')[0]).filter(path=>!path.endsWith('permanently_delete_item'));
 assert.deepEqual(order,['/storage/v1/object/attachments','/rest/v1/rpc/forget_attachments']);
 assert.deepEqual(JSON.parse(calls.at(-1).body),{p_paths:[`${owner}/${other}/${other}.pdf`]},'another folder is never touched');
});

test('signed-in market reads and portfolio saves are counted per person against the paid quote feed',async()=>{
 const {limits}=loadTS('lib/rate-limit.ts');
 assert.deepEqual(limits.market,[{max:60,seconds:60},{max:1000,seconds:86400}]);
 const limited=limiter(new Set(['market-user']));let auth={user:{id:owner},token:'owner'};const loads=[];
 const market=loadTS('app/api/market/route.ts',{'@/lib/rate-limit':limited.module,'@/lib/supabase':{session:async()=>auth},'@/lib/server-market':{loadMarket:async(...args)=>{loads.push(args);return {quotes:{}};}}});
 assert.equal((await market.GET(new Request('https://local/api/market?stocks=AAPL'))).status,429);
 assert.equal(loads.length,0);
 assert.deepEqual(limited.calls.at(-1),{name:'market-user',limits:limits.market,key:owner,options:{perIp:false}});
 // Anonymous visitors keep their per-address limit.
 auth=null;assert.equal((await market.GET(new Request('https://local/api/market?crypto=BTC'))).status,200);
 assert.equal(limited.calls.at(-1).name,'market');assert.equal(limited.calls.at(-1).key,undefined);
 loads.length=0;
 const snapshots=loadTS('app/api/portfolio-snapshots/route.ts',{'@/lib/rate-limit':limited.module,'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:()=>true,supa:async()=>Response.json([])},'@/lib/server-market':{loadMarket:async(...args)=>{loads.push(args);return {};}}});
 assert.equal((await snapshots.POST(post('/api/portfolio-snapshots',{}))).status,429);assert.equal(loads.length,0);
});

test('Telegram sign-in is rate limited per address and per Telegram user',async()=>{
 const limited=limiter(new Set(['telegram-signin']));
 const db={read:async()=>[],write:async()=>Response.json({})};
 const route=loadTS('app/api/auth/telegram/route.ts',{'@/lib/rate-limit':limited.module,'@/lib/service-role':{serviceDatabase:()=>db},'@/lib/telegram':{telegramConfig:()=>({token:'bot-token',botUsername:'bot'})},
  '@/lib/telegram-webapp':{verifyInitData:data=>data==='signed'?{id:4242}:null},'@/lib/telegram-account':{loginSecrets:()=>['secret'],consumeLoginToken:async()=>owner,adminAccounts:()=>({}),signInTelegramAccount:async()=>({ok:false})},'@/lib/supabase':{sameOrigin:()=>true,supa:async()=>Response.json({}),saveSession:async()=>{}}});
 const refused=await route.POST(post('/api/auth/telegram',{initData:'signed'}));
 assert.equal(refused.status,429);assert.equal(refused.headers.get('Referrer-Policy'),'no-referrer');
 assert.equal(limited.calls[0].key,'telegram:4242');assert.equal(limited.calls[0].options,undefined,'the address is counted too');
 assert.equal((await route.POST(post('/api/auth/telegram',{token:'link'}))).status,429);
 // Forged data is refused before anything is counted against the person it names.
 limited.calls.length=0;assert.equal((await route.POST(post('/api/auth/telegram',{initData:'forged'}))).status,401);assert.equal(limited.calls.length,0);
 assert.equal((await route.POST(post('/api/auth/telegram','not json'))).status,400);
});

test('statement imports are counted per person and refuse oversized bodies before reading them',async()=>{
 const {limits}=loadTS('lib/rate-limit.ts');
 assert.deepEqual(limits.import,[{max:20,seconds:3600},{max:100,seconds:86400}]);
 const over=new Set();const limited=limiter(over);const calls=[];
 const route=loadTS('app/api/import/route.ts',{'@/lib/rate-limit':limited.module,'@/lib/notify-action':{queueMilestoneCheck:()=>{}},'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:()=>true,supa:async path=>{calls.push(path);return Response.json({added:1,skipped:0});}}});
 // Declared too large: refused without touching the body.
 const declared=post('/api/import','{}',{'content-length':String(2_000_001)});
 assert.equal((await route.POST(declared)).status,413);assert.equal(declared.bodyUsed,false);
 // Undeclared and too large: cut off while reading.
 assert.equal((await route.POST(post('/api/import','x'.repeat(2_000_001)))).status,413);
 const body={batch_id:owner,account_id:other,rows:[{name:'Coffee',date:'2026-10-01',amount:-4,notes:''}]};
 assert.equal((await route.POST(post('/api/import',body))).status,200);assert.equal(calls.length,1);
 assert.deepEqual(limited.calls.at(-1),{name:'import',limits:limits.import,key:owner,options:{perIp:false}});
 over.add('import');assert.equal((await route.POST(post('/api/import',body))).status,429);assert.equal(calls.length,1);
});

test('readCapped returns the body under the cap and null over it',async()=>{
 const {readCapped}=loadTS('lib/api-route.ts');
 assert.equal(await readCapped(post('/x','hello'),5),'hello');
 assert.equal(await readCapped(post('/x','hello!'),5),null);
 assert.equal(await readCapped(new Request('https://local/x'),5),'');
});

test('Telegram settings answer a bad body with 400 and never echo a thrown message',async()=>{
 let answer=()=>Response.json([]);
 const route=loadTS('app/api/telegram/route.ts',{'@/lib/telegram':{telegramConfig:()=>({botUsername:'bot'})},'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:req=>req.headers.get('origin')==='https://local',supa:async()=>answer()}});
 assert.equal((await route.POST(post('/api/telegram','{broken'))).status,400);
 assert.equal((await route.POST(post('/api/telegram',{action:'unlink'},{origin:'https://evil.example'}))).status,403);
 answer=()=>{throw Error('connect ECONNREFUSED 10.0.0.5:5432');};
 assert.deepEqual(await (await route.GET()).json(),{error:'Telegram settings are unavailable. Check that migration 075 is installed.'});
 assert.deepEqual(await (await route.POST(post('/api/telegram',{action:'unlink'}))).json(),{error:'Could not save the Telegram settings. Try again.'});
 answer=()=>new Response('{}',{status:500});
 assert.deepEqual(await (await route.POST(post('/api/telegram',{action:'unlink'}))).json(),{error:'Could not save the Telegram settings. Try again.'});
 const signedOut=loadTS('app/api/telegram/route.ts',{'@/lib/supabase':{session:async()=>null,sameOrigin:()=>true,supa:async()=>answer()}});
 assert.equal((await signedOut.GET()).status,401);
});

test('a backup that is not JSON is called invalid without quoting the file',async()=>{
 const route=loadTS('app/api/backup/route.ts',{'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:()=>true,supa:async()=>Response.json({})}});
 const failed=await route.POST(post('/api/backup',{action:'preview',backup:'{"secret-value": oops'}));
 assert.equal(failed.status,400);assert.deepEqual(await failed.json(),{error:'Invalid backup.'});
 // verifyBackup's own refusals still say what is wrong.
 await withEnv({BACKUP_SIGNING_KEY:'k'.repeat(40)},async()=>{
  const forged=await route.POST(post('/api/backup',{action:'preview',backup:JSON.stringify({format:loadTS('lib/backup-envelope.ts').SIGNED_BACKUP_FORMAT,payload:'abc',signature:'0'.repeat(64)})}));
  assert.deepEqual(await forged.json(),{error:'The backup signature is invalid.'});
 });
});

test('a password sign-in the provider throttles answers 429',async()=>{
 const route=loadTS('app/api/auth/route.ts',{'next/headers':{cookies:async()=>({get:()=>undefined})},'@/lib/rate-limit':limiter().module,'@/lib/supabase':{sameOrigin:()=>true,saveSession:async()=>{},supa:async()=>Response.json({},{status:429})}});
 const response=await route.POST(post('/api/auth',{email:'me@example.com',password:'password1'}));
 assert.equal(response.status,429);assert.deepEqual(await response.json(),{error:'Too many attempts. Please try again later.'});
});

test('forecast assignments accept only known currencies, and month and date schemas are shared',async()=>{
 const calls=[];
 const route=loadTS('app/api/transaction-tools/route.ts',{'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner'}),sameOrigin:()=>true,supa:async path=>{calls.push(path);return Response.json({});}},'@/lib/server-records':{readOwnerRows:async()=>[]}});
 const forecast=currency=>route.POST(post('/api/transaction-tools',{action:'forecast',data:{record_id:owner,account_id:other,exchange_rate:2,from_currency:currency,to_currency:'USD'}}));
 assert.equal((await forecast('XXX-not-a-currency')).status,400);assert.equal(calls.length,0);
 assert.equal((await forecast('EUR')).status,200);assert.equal(calls.length,1);
 const {month}=loadTS('lib/api-validation.ts');
 assert.ok(month.safeParse('2026-10').success);assert.ok(!month.safeParse('2026-13').success);assert.ok(!month.safeParse('2026-10-01').success);
 const {earningSourceSchema}=loadTS('lib/earning-sources.ts');
 const source={id:owner,name:'Salary',kind:'Salary',currency:'EUR',mode:'fixed',amount:100,frequency:'Monthly',start_date:'2026-10-01',end_date:null};
 assert.ok(earningSourceSchema.safeParse(source).success);
 assert.ok(!earningSourceSchema.safeParse({...source,currency:'ZZZ'}).success);
 assert.ok(!earningSourceSchema.safeParse({...source,start_date:'2026-02-30'}).success);
});
