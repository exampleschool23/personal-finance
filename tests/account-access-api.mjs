import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const id='a0000000-0000-4000-8000-000000000001';
const verified={access_token:'verified-token',refresh_token:'refresh',expires_in:3600,user:{id}};
function api({auth=true,origin=true,provider,jarValues={},email='owner@example.com'}={}){
 const calls=[],saved=[],writes=[],deleted=[];const values=new Map(Object.entries(jarValues));
 const jar={get:name=>values.has(name)?{value:values.get(name)}:undefined,set:(name,value,options)=>{writes.push({name,value,options});values.set(name,value);},delete:name=>{deleted.push(name);values.delete(name);}};
 const route=loadTS('app/api/account-access/route.ts',{'@/lib/account-access':{...loadTS('lib/account-access.ts'),accountOrigin:()=> 'https://canonical.example'},'next/headers':{cookies:async()=>jar},'@/lib/supabase':{session:async()=>auth?{user:{id,email},token:'owner'}:null,sameOrigin:()=>origin,config:()=>({url:'https://supabase.invalid'}),saveSession:async data=>saved.push(data),supa:async(path,init,token)=>{calls.push({path,init,token});return provider?provider(path,init,token):Response.json(verified);}}});return {...route,calls,saved,writes,deleted};
}
const request=body=>new Request('https://local/api/account-access',{method:'POST',body:JSON.stringify(body)});
test('account access rejects cross-origin, anonymous changes, short passwords and destructive requests without confirmation',async()=>{
 const change={action:'change_password',current_password:'current',password:'new secure password'};
 for(const [options,status] of [[{origin:false},403],[{auth:false},401]]){const app=api(options);assert.equal((await app.POST(request(change))).status,status);assert.equal(app.calls.length,0);}
 for(const body of [{...change,password:'short'},{action:'delete_account',current_password:'current',confirmation:'delete'},{action:'verify',token_hash:'x'.repeat(30),type:'signup'}]){const app=api();assert.equal((await app.POST(request(body))).status,400);assert.equal(app.calls.length,0);}
});
test('registration defaults closed and successful registration never saves an unverified session',async()=>{
 const previous=process.env.PUBLIC_SIGNUP_ENABLED;try{delete process.env.PUBLIC_SIGNUP_ENABLED;const app=api();const body={action:'signup',email:'new@example.com',password:'new secure password'};assert.equal((await app.POST(request(body))).status,403);assert.equal(app.calls.length,0);process.env.PUBLIC_SIGNUP_ENABLED='true';assert.equal((await app.POST(request(body))).status,200);assert.equal(app.saved.length,0);assert.match(app.calls[0].path,/redirect_to=/);}finally{if(previous===undefined)delete process.env.PUBLIC_SIGNUP_ENABLED;else process.env.PUBLIC_SIGNUP_ENABLED=previous;}
});
test('recovery verification creates a restricted cookie, resets only its bearer, and clears sessions',async()=>{
 const app=api();const result=await app.POST(request({action:'verify',token_hash:'a'.repeat(32),type:'recovery'}));assert.equal((await result.json()).next,'reset');assert.equal(app.saved.length,0);assert.equal(app.writes[0].options.path,'/api/account-access');assert.equal(app.writes[0].options.httpOnly,true);
 assert.equal((await app.POST(request({action:'reset',password:'new secure password'}))).status,200);assert.equal(app.calls.find(call=>call.init.method==='PUT').token,'verified-token');assert.equal(app.writes.at(-1).options.maxAge,0);assert.deepEqual(app.deleted,['hf_access','hf_refresh']);
 const absent=api();assert.equal((await absent.POST(request({action:'reset',password:'new secure password'}))).status,401);assert.equal(absent.calls.length,0);
});
test('expired links and wrong current credentials do not issue sessions or alter accounts',async()=>{
 const app=api({provider:()=>Response.json({error:'invalid'},{status:400})});assert.equal((await app.POST(request({action:'verify',token_hash:'a'.repeat(32),type:'email'}))).status,400);assert.equal(app.saved.length,0);assert.equal((await app.POST(request({action:'change_password',current_password:'wrong',password:'new secure password'}))).status,403);assert.ok(app.calls.every(call=>call.init.method==='POST'));
 const mismatch=api({provider:()=>Response.json({...verified,user:{id:'b0000000-0000-4000-8000-000000000001'}})});assert.equal((await mismatch.POST(request({action:'change_password',current_password:'current',password:'new secure password'}))).status,403);assert.equal(mismatch.calls.length,1);
});
test('email verification saves session, recovery requests conceal account existence and retain rate-limit errors',async()=>{
 const app=api();assert.equal((await app.POST(request({action:'verify',token_hash:'a'.repeat(32),type:'email'}))).status,200);assert.equal(app.saved.length,1);
 for(const status of [200,400,404]){const recovery=api({provider:()=>Response.json({}, {status})});const result=await recovery.POST(request({action:'recover',email:'unknown@example.com'}));assert.equal(result.status,200);assert.match((await result.json()).message,/If this account exists/);}
 const limited=api({provider:()=>Response.json({}, {status:429})});assert.equal((await limited.POST(request({action:'recover',email:'known@example.com'}))).status,429);
});

test('email redirect origins reject Host fallback, credentials and insecure production URLs',()=>{
 const {accountOrigin}=loadTS('lib/account-access.ts');const origin=process.env.APP_ORIGIN,mode=process.env.NODE_ENV;
 try{process.env.NODE_ENV='production';delete process.env.APP_ORIGIN;assert.equal(accountOrigin(),null);for(const invalid of ['http://example.com','https://user:password@example.com','https://example.com/path','https://example.com?redirect=evil']){process.env.APP_ORIGIN=invalid;assert.equal(accountOrigin(),null);}process.env.APP_ORIGIN='https://canonical.example';assert.equal(accountOrigin(),'https://canonical.example');}finally{if(origin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=origin;if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode;}
});
test('account deletion uses the verified owner ID and server admin key, never a submitted target',async context=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-admin-key';const calls=[];context.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json({});});
 try{const app=api();const result=await app.POST(request({action:'delete_account',current_password:'current',confirmation:'DELETE',user_id:'other-owner'}));assert.equal(result.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://supabase.invalid/auth/v1/admin/users/'+id);assert.equal(calls[0].init.method,'DELETE');assert.equal(calls[0].init.headers.Authorization,'Bearer test-admin-key');assert.deepEqual(app.deleted,['hf_access','hf_refresh']);}finally{if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});

test('failed deletion preserves the session and never deletes an unverified account',async context=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;const calls=[];
 context.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json({},{status:500});});
 const body={action:'delete_account',current_password:'current',confirmation:'DELETE'};
 try{
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-admin-key';
  for(const options of [{auth:false},{origin:false},{provider:()=>Response.json({},{status:400})},{provider:()=>Response.json({...verified,user:{id:'b0000000-0000-4000-8000-000000000001'}})}]){
   const app=api(options);assert.ok((await app.POST(request(body))).status>=400);assert.equal(calls.length,0);assert.deepEqual(app.deleted,[]);
  }
  const failed=api();assert.equal((await failed.POST(request(body))).status,503);assert.equal(calls.length,1);assert.deepEqual(failed.deleted,[]);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const unavailable=api();assert.equal((await unavailable.POST(request(body))).status,503);assert.equal(calls.length,1);assert.deepEqual(unavailable.deleted,[]);
 }finally{if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});

test('passwords need at least six characters everywhere, and the messages say so in every language',async()=>{
 const {accountAccessSchema}=loadTS('lib/account-access.ts');
 const {minPasswordLength,maxPasswordLength}=loadTS('lib/password-policy.ts');
 assert.equal(minPasswordLength,6);
 const signup=password=>accountAccessSchema.safeParse({action:'signup',email:'new@example.com',password}).success;
 assert.equal(signup('abcde'),false);
 assert.equal(signup('abcdef'),true);
 assert.equal(signup('x'.repeat(maxPasswordLength)),true);
 assert.equal(signup('x'.repeat(maxPasswordLength+1)),false);
 for(const action of ['reset'])assert.equal(accountAccessSchema.safeParse({action,password:'abcde'}).success,false);
 assert.equal(accountAccessSchema.safeParse({action:'change_password',current_password:'old',password:'abcdef'}).success,true);
 const hint='Use a unique password with at least 6 characters.',failure='Check the account fields. Passwords need at least 6 characters.';
 assert.ok(fs.readFileSync('components/account-access-panel.tsx','utf8').includes(hint));
 assert.ok(fs.readFileSync('app/api/account-access/route.ts','utf8').includes(failure));
 for(const language of ['en','ru','uz']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));assert.ok(labels[hint],language);assert.ok(labels[failure],language);assert.ok(!/12/.test(labels[hint]+labels[failure]),language);}
});

test('an account made with a phone number can add an email and password, and nobody else can use that path',async()=>{
 const add={action:'add_email',email:'new@example.com',password:'secret1'};
 const phoneOnly=api({email:'',provider:()=>Response.json({})});
 const done=await phoneOnly.POST(request(add));
 assert.equal(done.status,200);assert.equal((await done.json()).message,'Check your email to confirm it.');
 assert.equal(phoneOnly.calls.length,1);
 assert.equal(phoneOnly.calls[0].path,'/auth/v1/user');assert.equal(phoneOnly.calls[0].init.method,'PUT');assert.equal(phoneOnly.calls[0].token,'owner');
 assert.deepEqual(JSON.parse(phoneOnly.calls[0].init.body),{email:'new@example.com',password:'secret1'});
 // An account that already has an email keeps using its password screens.
 const withEmail=api({provider:()=>Response.json({})});
 assert.equal((await withEmail.POST(request(add))).status,400);assert.equal(withEmail.calls.length,0);
 // Anonymous visitors, foreign sites and weak or malformed input never reach Supabase.
 const anonymous=api({auth:false,email:''});assert.equal((await anonymous.POST(request(add))).status,401);assert.equal(anonymous.calls.length,0);
 const foreign=api({origin:false,email:''});assert.equal((await foreign.POST(request(add))).status,403);
 const strict=api({email:''});
 for(const body of [{...add,password:'short'},{...add,email:'not an email'},{action:'add_email'},{...add,password:'x'.repeat(129)}])assert.equal((await strict.POST(request(body))).status,400,JSON.stringify(body));
 assert.equal(strict.calls.length,0);
 // Supabase may refuse the address, for example when it belongs to someone else.
 const refused=api({email:'',provider:()=>Response.json({error_code:'email_exists'},{status:422})});
 const failure=await refused.POST(request(add));assert.equal(failure.status,400);assert.equal((await failure.json()).error,'Could not add the email. Check the address and try another password.');
});
test('the account page reports whether the signed-in account has no email, so Settings offers the right form',async()=>{
 for(const [email,expected] of [['',true],['owner@example.com',false]]){
  const result=await api({email}).GET();
  assert.equal((await result.json()).phoneOnly,expected,email);
 }
 assert.equal((await (await api({auth:false}).GET()).json()).phoneOnly,false);
});
