import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {z} from 'zod';
import {loadTS} from './helpers/load-ts.mjs';
const {reply,signInAgain,sameOrigin,readJson,parseAction,postgrestFailure,tooManyAttempts}=loadTS('lib/api-route.ts');
const {readAllPages}=loadTS('lib/owner-rows.ts');
const {rateLimited,clientIp}=loadTS('lib/rate-limit.ts');

test('mutations from other sites are refused by Origin and by Sec-Fetch-Site; servers without either pass',()=>{
 const req=headers=>new Request('https://app.local/api/x',{method:'POST',headers});
 assert.equal(sameOrigin(req({origin:'https://app.local'})),true);
 assert.equal(sameOrigin(req({origin:'https://app.local','sec-fetch-site':'same-origin'})),true);
 assert.equal(sameOrigin(req({})),true,'cron, webhooks and server calls send no Origin');
 assert.equal(sameOrigin(req({origin:'https://evil.example'})),false);
 assert.equal(sameOrigin(req({origin:'null'})),false);
 assert.equal(sameOrigin(req({'sec-fetch-site':'cross-site'})),false,'a browser form post from another site without Origin');
 assert.equal(sameOrigin(req({origin:'https://app.local','sec-fetch-site':'cross-site'})),false);
});

test('bodies that are not JSON read as null, so routes answer 400 instead of 503',async()=>{
 const body=text=>new Request('https://app.local',{method:'POST',body:text});
 assert.equal(await readJson(body('{"a":')),null);
 assert.equal(await readJson(new Request('https://app.local',{method:'POST'})),null);
 assert.deepEqual(await readJson(body('{"a":1}')),{a:1});
});

test('action bodies are checked against the schema their action names, and nothing else',()=>{
 const schemas={save:z.object({id:z.string()}),remove:z.object({id:z.number()})};
 assert.deepEqual(parseAction({action:'save',data:{id:'x',extra:1}},schemas),{action:'save',data:{id:'x'}});
 for(const body of [null,'save',[],{},{action:'save',data:{id:1}},{action:'toString',data:{}},{action:'__proto__',data:{}},{data:{id:'x'}}])assert.equal(parseAction(body,schemas),null,JSON.stringify(body));
});

test('database refusals keep their own words, known codes their message and status, and everything else the fallback',async()=>{
 const failure=(body,status=400)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});
 const read=async response=>[response.status,(await response.json()).error];
 assert.deepEqual(await read(await postgrestFailure(failure({code:'P0001',message:'Choose a cash account.'}),'Could not save.')),[409,'Choose a cash account.']);
 assert.deepEqual(await read(await postgrestFailure(failure({code:'P0001'}),'Could not save.',{fallbackStatus:503})),[503,'Could not save.'],'a refusal without words falls back');
 assert.deepEqual(await read(await postgrestFailure(failure({code:'PGRST202'}),'Could not save.',{codes:{PGRST202:['Update the database.',503],'23505':'Already exists.'}})),[503,'Update the database.']);
 assert.deepEqual(await read(await postgrestFailure(failure({code:'23505'}),'Could not save.',{codes:{'23505':'Already exists.'}})),[409,'Already exists.']);
 assert.deepEqual(await read(await postgrestFailure(failure('<html>bad gateway</html>',502),'Could not save.',{fallbackStatus:503})),[503,'Could not save.']);
 assert.deepEqual(await read(await postgrestFailure(failure({code:'constructor'}),'Could not save.')),[409,'Could not save.']);
});

test('shared replies are never cached and keep their existing words',async()=>{
 assert.equal(reply({ok:true}).headers.get('cache-control'),'no-store');
 assert.equal(reply({},200,{noReferrer:true}).headers.get('referrer-policy'),'no-referrer');
 assert.deepEqual([signInAgain().status,await signInAgain().json()],[401,{error:'Please sign in again.'}]);
 assert.deepEqual([tooManyAttempts().status,await tooManyAttempts().json()],[429,{error:'Too many attempts. Please try again later.'}]);
 const en=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
 for(const message of ['Please sign in again.','Request rejected.','Too many attempts. Please try again later.'])assert.ok(en[message],message);
});

test('every page is read until a short page, and a failed page fails the whole read',async()=>{
 const ranges=[];
 const rows=await readAllPages(async range=>{ranges.push(range);return Response.json(range.endsWith('offset=0')?Array.from({length:500},(_,i)=>i):[500]);});
 assert.equal(rows.length,501);assert.deepEqual(ranges,['limit=500&offset=0','limit=500&offset=500']);
 assert.deepEqual(await readAllPages(async()=>[1,2]),[1,2],'readers that return rows directly');
 await assert.rejects(readAllPages(async range=>range.endsWith('offset=0')?Response.json(Array(500).fill(0)):new Response(null,{status:500}),'Could not load.'),/Could not load\./);
});

test('rate limits count hashed addresses and identifiers, refuse over the limit and let requests through when they cannot count',async()=>{
 const req=(headers={})=>new Request('https://app.local/api/auth',{method:'POST',headers});
 assert.equal(clientIp(req({'x-real-ip':'203.0.113.9','x-forwarded-for':'198.51.100.1'})),'203.0.113.9');
 assert.equal(clientIp(req({'x-vercel-forwarded-for':'203.0.113.7, 10.0.0.1'})),'203.0.113.7');
 assert.equal(clientIp(req({'x-forwarded-for':'198.51.100.1, 10.0.0.2'})),'198.51.100.1');
 assert.equal(clientIp(req()),'unknown');
 const calls=[];let answer=true,status=200;
 const db={write:async(path,init)=>{calls.push({path,body:JSON.parse(init.body)});return status===200?Response.json(answer):new Response(null,{status});}};
 const limits=[{max:5,seconds:60},{max:20,seconds:3600}];
 assert.equal(await rateLimited(req({'x-real-ip':'203.0.113.9'}),'signin',limits,'Person@Example.com',{db,secret:'server-secret'}),false);
 assert.equal(calls.length,4,'two limits, per address and per email');
 assert.ok(calls.every(call=>call.path==='/rest/v1/rpc/hit_rate_limit'));
 assert.deepEqual(calls.map(call=>[call.body.max_hits,call.body.window_seconds]),[[5,60],[20,3600],[5,60],[20,3600]]);
 const text=JSON.stringify(calls);
 assert.ok(!text.includes('203.0.113.9')&&!/person@example\.com/i.test(text),'raw addresses and emails never reach the database');
 assert.ok(calls.every(call=>/^signin:[A-Za-z0-9_-]{32}$/.test(call.body.bucket)));
 calls.length=0;await rateLimited(req({'x-real-ip':'203.0.113.10'}),'signin',limits,'person@example.com ',{db,secret:'server-secret'});
 assert.equal(calls[2].body.bucket,JSON.parse(text)[2].body.bucket,'the same email counts together whatever its case');
 answer=false;assert.equal(await rateLimited(req(),'signin',limits,null,{db,secret:'server-secret'}),true);
 calls.length=0;assert.equal(await rateLimited(req(),'signin',limits,'victim@example.com',{db,secret:'server-secret'}),true);
 assert.equal(calls.length,2,'an address over its limit never uses up the email\'s own allowance');
 calls.length=0;await rateLimited(req(),'assistant',limits,'user-1',{db,secret:'server-secret',perIp:false});
 assert.equal(calls.length,2,'per person only');
 status=404;assert.equal(await rateLimited(req(),'signin',limits,null,{db,secret:'server-secret'}),false,'migration 106 missing: let through');
 assert.equal(await rateLimited(req(),'signin',limits,null,{db:{write:async()=>{throw Error('offline');}},secret:'server-secret'}),false,'database unreachable: let through');
 assert.equal(await rateLimited(req(),'signin',limits,null,{db:null,secret:'server-secret'}),false,'no server key: let through');
});

test('production adds HSTS and the report-only policy allows uploads to the Supabase project',async()=>{
 const before={url:process.env.SUPABASE_URL,env:process.env.NODE_ENV};
 try{
  process.env.SUPABASE_URL='https://project.supabase.co';process.env.NODE_ENV='production';
  const headers=Object.fromEntries((await loadTS('next.config.ts').default.headers())[0].headers.map(header=>[header.key,header.value]));
  assert.equal(headers['Strict-Transport-Security'],'max-age=63072000; includeSubDomains');
  assert.match(headers['Content-Security-Policy-Report-Only'],/connect-src 'self' https:\/\/project\.supabase\.co;/);
  assert.equal(headers['Content-Security-Policy'],undefined,'still report-only');
  assert.equal(headers['X-Frame-Options'],'SAMEORIGIN');
  process.env.NODE_ENV='development';delete process.env.SUPABASE_URL;
  const local=Object.fromEntries((await loadTS('next.config.ts').default.headers())[0].headers.map(header=>[header.key,header.value]));
  assert.equal(local['Strict-Transport-Security'],undefined);assert.match(local['Content-Security-Policy-Report-Only'],/connect-src 'self';/);
 }finally{for(const [key,value] of [['SUPABASE_URL',before.url],['NODE_ENV',before.env]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
