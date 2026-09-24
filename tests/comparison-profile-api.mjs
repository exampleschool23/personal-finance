import { benchmarkSelectionSchema, stockBenchmarks } from '../lib/benchmark-selection.ts';
import { diversifiedPortfolioSchema, defaultDiversifiedPortfolio } from '../lib/diversified-portfolio.ts';
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
const deps={benchmarkSelectionSchema,stockBenchmarks,diversifiedPortfolioSchema,z,isCurrency,benchmarkKeys,investmentKinds,defaultComparisonPreferences,session:async()=>authenticated?{user:{id:'owner'},token:'owner-token'}:null,supa,sameOrigin:req=>req.headers.get('origin')==='https://local'};
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

test('diversified allocation validates totals and persists only for the authenticated owner',async()=>{
 calls=[];
 assert.equal((await api.PUT(req({benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio:defaultDiversifiedPortfolio,user_id:'other'}))).status,200);
 assert.deepEqual(JSON.parse(calls[0].init.body),{benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio:defaultDiversifiedPortfolio,user_id:'owner'});
 for(const portfolio of [null,{...defaultDiversifiedPortfolio,cash:19},{...defaultDiversifiedPortfolio,cash:-20,stock:60},{...defaultDiversifiedPortfolio,businessRate:-1},{...defaultDiversifiedPortfolio,stockSymbol:'bad/url'}]) {
  calls=[];assert.equal((await api.PUT(req({benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio}))).status,400);assert.equal(calls.length,0);
 }
});

test('multiple stock choices save only to the signed-in owner',async()=>{
 calls=[];
 assert.equal((await api.PUT(req({benchmarks:['STOCK:NVDA','STOCK:AAPL'],custom_symbol:'',user_id:'other'}))).status,200);
 assert.deepEqual(JSON.parse(calls[0].init.body),{benchmarks:['STOCK:NVDA','STOCK:AAPL'],custom_symbol:'',user_id:'owner'});
});

test('editable portfolio saves multiple assets and rejects invalid allocations and duplicate identities',async()=>{
 const assets=[{id:'a',kind:'stock',symbol:'NVDA',name:'',weight:60,rate:0},{id:'b',kind:'stock',symbol:'AAPL',name:'',weight:40,rate:0}];
 const portfolio={...defaultDiversifiedPortfolio,assets};
 calls=[];
 assert.equal((await api.PUT(req({benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio,user_id:'other'}))).status,200);
 assert.deepEqual(JSON.parse(calls[0].init.body).portfolio.assets,assets);
 assert.equal(JSON.parse(calls[0].init.body).user_id,'owner');
 for(const rows of [[],[assets[0]],[assets[0],{...assets[1],id:'a'}],[{...assets[0],weight:100,symbol:''}],[{...assets[0],weight:100,rate:-1}]]){
  calls=[];assert.equal((await api.PUT(req({benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio:{...portfolio,assets:rows}}))).status,400);assert.equal(calls.length,0);
 }
});

test('portfolio accepts catalogue currencies for property and custom assets and rejects invalid currency',async()=>{
 const portfolio={...defaultDiversifiedPortfolio,assets:[{id:'home',kind:'property',name:'Apartment',symbol:'',weight:70,rate:5,currency:'EUR'},{id:'other',kind:'custom',name:'Collectibles',symbol:'',weight:30,rate:2,currency:'GBP'}]};
 calls=[];assert.equal((await api.PUT(req({benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio}))).status,200);
 assert.deepEqual(JSON.parse(calls[0].init.body).portfolio.assets,portfolio.assets);
 for(const currency of ['XYZ','usd','']){
  calls=[];assert.equal((await api.PUT(req({benchmarks:['PORTFOLIO'],custom_symbol:'',portfolio:{...portfolio,assets:[{...portfolio.assets[0],weight:100,currency}]}}))).status,400);assert.equal(calls.length,0);
 }
});


test('UZS deposit is opt-in: absent from defaults and accepted when selected in Settings',async()=>{
 assert.deepEqual(defaultComparisonPreferences.benchmarks,['BTC','SPY','depositUSD']);
 calls=[];
 const response=await api.PUT(req({benchmarks:['BTC','SPY','depositUSD','depositUZS'],custom_symbol:''}));
 assert.equal(response.status,200);
 assert.ok(JSON.parse(calls[0].init.body).benchmarks.includes('depositUZS'));
 calls=[];
 const removed=await api.PUT(req({benchmarks:['BTC','SPY','depositUSD'],custom_symbol:''}));
 assert.equal(removed.status,200);
 assert.ok(!JSON.parse(calls[0].init.body).benchmarks.includes('depositUZS'));
});
