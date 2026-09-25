import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { isCountry, countryCodes, countryOptions } from '../lib/countries.ts';
import { defaultPreferences, isCurrency, fiatCurrencies } from '../lib/currencies.ts';
const source=fs.readFileSync(new URL('../app/api/settings/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true, calls=[], rows=[], databaseFailure=false;
const api=new Function('z','session','supa','sameOrigin','defaultPreferences','isCurrency','fiatCurrencies','isCountry',js+';return {GET,PUT};')(z,async()=>authenticated?{user:{id:'owner'},token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return databaseFailure ? new Response(null,{status:503}) : Response.json(rows);},req=>req.headers.get('origin')==='https://app.local',defaultPreferences,isCurrency,fiatCurrencies,isCountry);
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
 assert.match(calls.at(-1).path,/display_name,country&user_id=eq.owner$/);
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

test('country preference validates codes, persists only for the owner, loads and clears',async()=>{
 calls=[];
 const result=await api.PUT(request({...defaultPreferences,country:'UZ',user_id:'other'}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).country,'UZ');
 assert.equal(JSON.parse(calls[0].init.body).user_id,'owner');
 assert.equal(JSON.parse(calls[0].init.body).country,'UZ');
 rows=[{...defaultPreferences,country:'UZ'}];
 assert.equal((await (await api.GET()).json()).country,'UZ');
 rows=[{...defaultPreferences,country:null}];
 assert.equal((await (await api.GET()).json()).country,'');
 rows=[];
 assert.equal((await (await api.PUT(request({...defaultPreferences,country:''}))).json()).country,'');
 for(const country of ['XX','uz','Uzbekistan',42]){
  calls=[];assert.equal((await api.PUT(request({...defaultPreferences,country}))).status,400);assert.equal(calls.length,0);
 }
});
test('country names are localized and the migration validates the same catalogue',()=>{
 assert.equal(countryCodes.length,249);assert.equal(new Set(countryCodes).size,249);
 for(const [locale,name] of [['en-US','Uzbekistan'],['ru-RU','Узбекистан'],['uz-UZ','Oʻzbekiston']]){
  const options=countryOptions(locale);assert.equal(options.length,249);
  assert.equal(options.find(country=>country.code==='UZ').name,name);
 }
 const migration=fs.readFileSync('migrations/068_profile_country.sql','utf8');
 assert.deepEqual([...migration.matchAll(/'([A-Z]{2})'/g)].map(match=>match[1]),countryCodes);
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
});
