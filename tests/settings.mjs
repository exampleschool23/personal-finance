import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { isCountry, countryCodes, countryOptions } from '../lib/countries.ts';
import { defaultPreferences, isCurrency, maxPreferredCurrencies } from '../lib/currencies.ts';
import { fontIds, resolveFont } from '../lib/fonts.ts';
import { loadTS } from './helpers/load-ts.mjs';
const { isLanguage, languageCodes } = loadTS('lib/i18n.ts');
const { onboardedOn } = loadTS('lib/onboarding.ts');
const { depositToday } = loadTS('lib/deposit-interest.ts');
const { isTimezone } = loadTS('lib/timezones.ts');
const source=fs.readFileSync(new URL('../app/api/settings/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true, calls=[], rows=[], databaseFailure=false, timezoneMissing=false;
const menuCalls=[];
const api=new Function('z','session','supa','sameOrigin','defaultPreferences','isCurrency','maxPreferredCurrencies','isCountry','fontIds','resolveFont','isLanguage','languageCodes','queueLanguageMenu','onboardedOn','isTimezone',js+';return {GET,PUT};')(z,async()=>authenticated?{user:{id:'owner'},token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});if(timezoneMissing&&init?.body?.includes('"timezone"'))return Response.json({code:'PGRST204'},{status:400});return databaseFailure ? new Response(null,{status:503}) : Response.json(rows);},req=>req.headers.get('origin')==='https://app.local',defaultPreferences,isCurrency,maxPreferredCurrencies,isCountry,fontIds,resolveFont,isLanguage,languageCodes,(auth,language)=>menuCalls.push({auth,language}),onboardedOn,isTimezone);
const request=body=>new Request('https://app.local/api/settings',{method:'PUT',headers:{origin:'https://app.local','Content-Type':'application/json'},body:JSON.stringify(body)});
test('persists validated preferences for the authenticated owner',async()=>{
 calls=[];const response=await api.PUT(request({language:'ru',currencies:['EUR','INR']}));
 assert.equal(response.status,200);assert.deepEqual(JSON.parse(calls.at(-1).init.body),{user_id:'owner',language:'ru',currencies:['EUR','INR'],font:'inter'});
 calls=[];assert.equal((await api.PUT(request({language:'en',currencies:['USD']}))).status,200);assert.deepEqual(JSON.parse(calls.at(-1).init.body).currencies,['USD']);
 assert.equal(calls.at(-1).token,'owner-token');
});
test('rejects empty, duplicate, non-fiat, and more than two currencies',async()=>{
 for(const currencies of [[],['EUR','EUR'],['BTC'],['USD','INR','UZS']]) assert.equal((await api.PUT(request({language:'en',currencies}))).status,400);
 assert.equal((await api.PUT(request({language:'xx',currencies:['USD']}))).status,400);
});
test('protects settings from anonymous and cross-origin writes',async()=>{
 authenticated=false;assert.equal((await api.GET()).status,401);assert.equal((await api.PUT(request(defaultPreferences))).status,401);authenticated=true;
 assert.equal((await api.PUT(new Request('https://app.local/api/settings',{method:'PUT',headers:{origin:'https://other.local'}}))).status,403);
 assert.deepEqual(await (await api.GET()).json(),{...defaultPreferences,onboarded:false});
});

test('optional name is trimmed, persisted for the owner, loaded, and clearable',async()=>{
 calls=[];
 const response=await api.PUT(request({...defaultPreferences,display_name:'  Jasur  ',user_id:'someone-else'}));
 assert.equal(response.status,200);
 assert.equal((await response.json()).display_name,'Jasur');
 assert.deepEqual(JSON.parse(calls.at(-1).init.body),{...defaultPreferences,display_name:'Jasur',user_id:'owner'});
 rows=[{...defaultPreferences,display_name:'Jasur'}];
 assert.equal((await (await api.GET()).json()).display_name,'Jasur');
 assert.match(calls.at(-1).path,/select=\*&user_id=eq.owner$/);
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
 assert.equal(JSON.parse(calls.at(-1).init.body).user_id,'owner');
 assert.equal(JSON.parse(calls.at(-1).init.body).country,'UZ');
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
test('preferences saved before the two-currency limit load with their first two, primary first',async()=>{
 rows=[{language:'en',currencies:['EUR','UZS','JPY']}];
 assert.deepEqual((await (await api.GET()).json()).currencies,['EUR','UZS']);
 rows=[];
});
test('the migration keeps the first two preferred currencies and rejects longer lists',async()=>{
 const { PGlite }=await import('@electric-sql/pglite');
 const db=new PGlite();
 const owner='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  const original=fs.readFileSync('migrations/004_settings_and_fiat_currencies.sql','utf8');
  await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.user_preferences'),original.indexOf('-- Run after the lending-date')));
  await db.exec(`INSERT INTO user_preferences(user_id,currencies) VALUES('${owner}',ARRAY['EUR','UZS','JPY']),('${other}',ARRAY['INR']);`);
  await db.exec(fs.readFileSync('migrations/074_two_preferred_currencies.sql','utf8'));
  assert.deepEqual((await db.query('SELECT currencies FROM user_preferences ORDER BY user_id')).rows.map(row=>row.currencies),[['EUR','UZS'],['INR']]);
  await assert.rejects(db.exec(`UPDATE user_preferences SET currencies=ARRAY['USD','INR','UZS'] WHERE user_id='${other}'`),/check constraint/);
  await db.exec(`UPDATE user_preferences SET currencies=ARRAY['USD','INR'] WHERE user_id='${other}'`);
  assert.equal(maxPreferredCurrencies,2);
  assert.ok(fs.readFileSync('database/setup.sql','utf8').includes('CONSTRAINT user_preferences_currencies_limit CHECK (cardinality(currencies) <= 2)'));
 }finally{await db.close();}
});

test('font preference validates the catalogue, persists for the owner, loads and falls back to Inter',async()=>{
 calls=[];
 const result=await api.PUT(request({...defaultPreferences,font:'onest',user_id:'other'}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).font,'onest');
 assert.deepEqual(JSON.parse(calls.at(-1).init.body),{...defaultPreferences,font:'onest',user_id:'owner'});
 rows=[{...defaultPreferences,font:'onest'}];
 assert.equal((await (await api.GET()).json()).font,'onest');
 assert.match(calls.at(-1).path,/select=\*&/);
 // Rows saved before the font column, and clients that omit it, keep the current font.
 for(const row of [{language:'en',currencies:['USD']},{...defaultPreferences,font:null}]){rows=[row];assert.equal((await (await api.GET()).json()).font,'inter');}
 rows=[];
 assert.equal((await (await api.PUT(request({language:'en',currencies:['USD']}))).json()).font,'inter');
 for(const font of ['Onest','comic-sans','',42,['onest']]){
  calls=[];assert.equal((await api.PUT(request({...defaultPreferences,font}))).status,400);assert.equal(calls.length,0);
 }
});

test('the welcome setup is recorded once, cleared on request, and left alone by ordinary saves',async()=>{
 rows=[];
 assert.equal((await (await api.GET()).json()).onboarded,false);
 rows=[{...defaultPreferences,onboarded_at:'2026-09-30T10:00:00Z'}];
 assert.equal((await (await api.GET()).json()).onboarded,true);
 rows=[{...defaultPreferences,onboarded_at:null}];
 assert.equal((await (await api.GET()).json()).onboarded,false);
 // Before migration 078 the column is absent; existing owners are not asked.
 rows=[{...defaultPreferences}];
 assert.equal((await (await api.GET()).json()).onboarded,true);
 calls=[];
 const finished=await api.PUT(request({...defaultPreferences,onboarded:true}));
 assert.equal(finished.status,200);
 assert.equal((await finished.json()).onboarded,true);
 let body=JSON.parse(calls.at(-1).init.body);
 assert.ok(!('onboarded' in body));
 assert.match(body.onboarded_at,/^\d{4}-\d{2}-\d{2}T/);
 calls=[];
 await api.PUT(request({...defaultPreferences,onboarded:false}));
 assert.equal(JSON.parse(calls.at(-1).init.body).onboarded_at,null);
 calls=[];
 await api.PUT(request(defaultPreferences));
 body=JSON.parse(calls.at(-1).init.body);
 assert.ok(!('onboarded_at' in body)&&!('onboarded' in body));
 assert.equal((await api.PUT(request({...defaultPreferences,onboarded:'yes'}))).status,400);
});

test('settings report the Tashkent calendar day the welcome setup was finished, for the first-visit greeting',async()=>{
 rows=[{...defaultPreferences,onboarded_at:'2026-09-30T20:00:00Z'}];
 assert.equal((await (await api.GET()).json()).onboarded_on,'2026-10-01','20:00 UTC is already the next day in Tashkent');
 rows=[{...defaultPreferences,onboarded_at:null}];
 assert.equal((await (await api.GET()).json()).onboarded_on,undefined);
 rows=[];
 assert.equal((await (await api.PUT(request({...defaultPreferences,onboarded:true}))).json()).onboarded_on,depositToday());
 // An ordinary Settings save keeps the day the setup was finished.
 rows=[{...defaultPreferences,onboarded_at:'2026-09-30T10:00:00Z'}];
 assert.equal((await (await api.PUT(request(defaultPreferences))).json()).onboarded_on,'2026-09-30');
 assert.equal((await (await api.PUT(request({...defaultPreferences,onboarded:false}))).json()).onboarded_on,undefined);
 // The day is read-only: a client cannot write it.
 rows=[];calls=[];
 await api.PUT(request({...defaultPreferences,onboarded_on:'2020-01-01'}));
 assert.ok(!('onboarded_on' in JSON.parse(calls.at(-1).init.body)));
});

test('every offered language can be saved, unknown ones are refused, and an unknown saved language loads as English',async()=>{
 for(const language of languageCodes){
  calls=[];
  assert.equal((await api.PUT(request({...defaultPreferences,language}))).status,200,language);
  assert.equal(JSON.parse(calls.at(-1).init.body).language,language);
 }
 assert.equal(languageCodes.length,30);
 calls=[];
 for(const language of ['xx','EN','es_MX','',null,42])assert.equal((await api.PUT(request({...defaultPreferences,language}))).status,400,String(language));
 assert.equal(calls.length,0);
 rows=[{...defaultPreferences,language:'xx',currencies:['EUR'],onboarded_at:'2026-09-30T10:00:00Z'}];
 const loaded=await (await api.GET()).json();
 assert.equal(loaded.language,'en');
 assert.deepEqual(loaded.currencies,['EUR']);
 rows=[{...defaultPreferences,language:'ar',onboarded_at:'2026-09-30T10:00:00Z'}];
 assert.equal((await (await api.GET()).json()).language,'ar');
 rows=[];
});

test('a saved language change refreshes the Telegram menu once, and nothing else does',async()=>{
 const save=async(language,previous)=>{menuCalls.length=0;rows=previous===undefined?[]:[{...defaultPreferences,language:previous}];const response=await api.PUT(request({...defaultPreferences,language}));rows=[];return response;};
 assert.equal((await save('ru','en')).status,200);
 assert.deepEqual(menuCalls.map(call=>[call.language,call.auth.token]),[['ru','owner-token']]);
 await save('en','en');assert.equal(menuCalls.length,0);
 await save('ru','ru');assert.equal(menuCalls.length,0);
 await save('ja','ru');assert.deepEqual(menuCalls.map(call=>call.language),['ja']);
 // A first save with no earlier row counts from English; a failed save sends nothing.
 await save('en',undefined);assert.equal(menuCalls.length,0);
 await save('fr',undefined);assert.deepEqual(menuCalls.map(call=>call.language),['fr']);
 menuCalls.length=0;databaseFailure=true;
 try{assert.equal((await api.PUT(request({...defaultPreferences,language:'ru'}))).status,503);}finally{databaseFailure=false;}
 assert.equal(menuCalls.length,0);
 assert.equal((await api.PUT(request({...defaultPreferences,language:'xx'}))).status,400);
 assert.equal(menuCalls.length,0);
});

test('the time zone is an IANA name saved for the owner; before its migration the rest still saves',async()=>{
 calls=[];
 const saved=await api.PUT(request({...defaultPreferences,timezone:'Asia/Tashkent'}));
 assert.equal(saved.status,200);assert.equal((await saved.json()).timezone,'Asia/Tashkent');
 assert.equal(JSON.parse(calls.at(-1).init.body).timezone,'Asia/Tashkent');
 for(const timezone of ['Mars/Olympus','Asia/Tashkent; drop','',42]){calls=[];assert.equal((await api.PUT(request({...defaultPreferences,timezone}))).status,400,String(timezone));assert.equal(calls.length,0);}
 // An empty saved zone loads as none, so Settings fills it from the browser.
 rows=[{...defaultPreferences,timezone:null}];
 assert.equal((await (await api.GET()).json()).timezone,undefined);
 rows=[{...defaultPreferences,timezone:'Europe/Paris'}];
 assert.equal((await (await api.GET()).json()).timezone,'Europe/Paris');
 rows=[];timezoneMissing=true;calls=[];
 try{
  assert.equal((await api.PUT(request({...defaultPreferences,language:'ru',timezone:'Asia/Tashkent'}))).status,200);
  const upserts=calls.filter(call=>call.init?.method==='POST');
  assert.equal(upserts.length,2);assert.equal(JSON.parse(upserts[1].init.body).timezone,undefined);assert.equal(JSON.parse(upserts[1].init.body).language,'ru');
 }finally{timezoneMissing=false;}
});
