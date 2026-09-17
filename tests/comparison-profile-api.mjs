import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {isCurrency} from '../lib/currencies.ts';
import {benchmarkKeys,investmentKinds,defaultComparisonPreferences} from '../lib/comparison-profile.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true,calls=[];
const supa=async(path,init,token)=>{calls.push({path,init,token});return Response.json(path.includes('mark_app_started')?{started_at:'2026-09-01T00:00:00Z',source:'first_visit'}:[]);};
const deps={z,isCurrency,benchmarkKeys,investmentKinds,defaultComparisonPreferences,session:async()=>authenticated?{user:{id:'owner'},token:'owner-token'}:null,supa,sameOrigin:req=>req.headers.get('origin')==='https://local'};
const api=new Function(...Object.keys(deps),compile('app/api/comparison-profile/route.ts')+';return {GET,PUT,POST};')(...Object.values(deps));
const req=body=>new Request('https://local',{method:'POST',headers:{origin:'https://local','Content-Type':'application/json'},body:JSON.stringify(body)});
test('owner-scoped settings default to Bitcoin and first-use timestamp comes from the database',async()=>{
 calls=[];const response=await api.GET();assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.preferences,defaultComparisonPreferences);assert.equal(data.activity.source,'first_visit');assert.equal(data.baseline,null);assert.ok(calls.every(call=>call.token==='owner-token'));assert.equal(response.headers.get('cache-control'),'no-store');
});
test('saving benchmark choices cannot change the immutable initial money',async()=>{
 calls=[];assert.equal((await api.PUT(req({benchmarks:['BTC','depositUZS'],custom_symbol:'',starting_amount:999,user_id:'other'}))).status,200);
 assert.deepEqual(JSON.parse(calls[0].init.body),{benchmarks:['BTC','depositUZS'],custom_symbol:'',user_id:'owner'});assert.ok(calls[0].path.includes('preferences'));
 calls=[];assert.equal((await api.POST(req({starting_amount:1000,currency:'EUR',holdings:[],capital_as_of:'2000-01-01',user_id:'other'}))).status,200);
 assert.equal(calls[0].init.headers.Prefer,'resolution=ignore-duplicates');assert.deepEqual(JSON.parse(calls[0].init.body),{starting_amount:1000,currency:'EUR',holdings:[],user_id:'owner'});
});
test('invalid choices, currencies, origins and unauthenticated requests are rejected',async()=>{
 for(const body of [{benchmarks:[],custom_symbol:''},{benchmarks:['BTC','BTC'],custom_symbol:''},{benchmarks:['CUSTOM'],custom_symbol:''},{benchmarks:['BAD'],custom_symbol:''}])assert.equal((await api.PUT(req(body))).status,400);
 assert.equal((await api.POST(req({starting_amount:-1,currency:'USD',holdings:[]}))).status,400);assert.equal((await api.POST(req({starting_amount:100,currency:'ZZZ',holdings:[]}))).status,400);
 authenticated=false;assert.equal((await api.GET()).status,401);authenticated=true;assert.equal((await api.PUT(new Request('https://local',{method:'PUT'}))).status,403);
});
test('migration prevents baseline updates and keeps owner RLS and first-use date immutable',()=>{
 const sql=fs.readFileSync('migrations/016_investment_comparison.sql','utf8');assert.ok(sql.includes('ON CONFLICT(user_id) DO NOTHING'));assert.ok(sql.includes('min(created_at)'));assert.ok(!sql.includes('GRANT UPDATE ON public.investment_comparison_baselines'));assert.ok(sql.includes('GRANT INSERT(user_id,starting_amount,currency,holdings)'));assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(sql));
});
