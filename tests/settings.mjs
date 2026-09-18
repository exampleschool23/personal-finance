import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { defaultPreferences, isCurrency, fiatCurrencies } from '../lib/currencies.ts';
const source=fs.readFileSync(new URL('../app/api/settings/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true, calls=[], rows=[], databaseFailure=false;
const api=new Function('z','session','supa','sameOrigin','defaultPreferences','isCurrency','fiatCurrencies',js+';return {GET,PUT};')(z,async()=>authenticated?{user:{id:'owner'},token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return databaseFailure ? new Response(null,{status:503}) : Response.json(rows);},req=>req.headers.get('origin')==='https://app.local',defaultPreferences,isCurrency,fiatCurrencies);
const request=body=>new Request('https://app.local/api/settings',{method:'PUT',headers:{origin:'https://app.local','Content-Type':'application/json'},body:JSON.stringify(body)});
test('persists validated preferences for the authenticated owner',async()=>{
 calls=[];const response=await api.PUT(request({language:'uz',currencies:['EUR','UZS','JPY']}));
 assert.equal(response.status,200);assert.deepEqual(JSON.parse(calls[0].init.body),{user_id:'owner',language:'uz',currencies:['EUR','UZS','JPY']});
 assert.equal(calls[0].token,'owner-token');
});
test('rejects empty, duplicate, and non-fiat currencies',async()=>{
 for(const currencies of [[],['EUR','EUR'],['BTC']]) assert.equal((await api.PUT(request({language:'en',currencies}))).status,400);
 assert.equal((await api.PUT(request({language:'fr',currencies:['USD']}))).status,400);
});
test('protects settings from anonymous and cross-origin writes',async()=>{
 authenticated=false;assert.equal((await api.GET()).status,401);assert.equal((await api.PUT(request(defaultPreferences))).status,401);authenticated=true;
 assert.equal((await api.PUT(new Request('https://app.local/api/settings',{method:'PUT',headers:{origin:'https://other.local'}}))).status,403);
 assert.deepEqual(await (await api.GET()).json(),defaultPreferences);
});

test('optional name is trimmed, persisted for the owner, loaded, and clearable',async()=>{
 calls=[];
 const response=await api.PUT(request({...defaultPreferences,display_name:'  Jasur  ',user_id:'someone-else'}));
 assert.equal(response.status,200);
 assert.equal((await response.json()).display_name,'Jasur');
 assert.deepEqual(JSON.parse(calls[0].init.body),{...defaultPreferences,display_name:'Jasur',user_id:'owner'});
 rows=[{...defaultPreferences,display_name:'Jasur'}];
 assert.equal((await (await api.GET()).json()).display_name,'Jasur');
 assert.match(calls.at(-1).path,/display_name&user_id=eq.owner$/);
 rows=[];
 assert.equal((await (await api.PUT(request({...defaultPreferences,display_name:'   '}))).json()).display_name,'');
});
test('rejects invalid names before writing and reports database failures',async()=>{
 for(const display_name of ['x'.repeat(81),123,null]){
  calls=[];
  assert.equal((await api.PUT(request({...defaultPreferences,display_name}))).status,400);
  assert.equal(calls.length,0);
 }
 databaseFailure=true;
 try {
  assert.equal((await api.PUT(request({...defaultPreferences,display_name:'Jasur'}))).status,503);
  assert.equal((await api.GET()).status,503);
 } finally { databaseFailure=false; }
});
