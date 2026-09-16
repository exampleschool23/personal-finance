import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { defaultPreferences, isCurrency, fiatCurrencies } from '../lib/currencies.ts';
const source=fs.readFileSync(new URL('../app/api/settings/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true, calls=[];
const api=new Function('z','session','supa','sameOrigin','defaultPreferences','isCurrency','fiatCurrencies',js+';return {GET,PUT};')(z,async()=>authenticated?{user:{id:'owner'},token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return Response.json([]);},req=>req.headers.get('origin')==='https://app.local',defaultPreferences,isCurrency,fiatCurrencies);
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
