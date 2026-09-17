import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {kinds,income,expenses} from '../lib/finance.ts';
import {isCurrency} from '../lib/currencies.ts';
import {depositInterest,depositToday} from '../lib/deposit-interest.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const month=depositToday().slice(0,7);
const deposit={id:'d',name:'Savings',kind:'Deposit',currency:'UZS',amount:8000000,cost:0,rate:21,quantity:1,frequency:'Once',date:'2030-01-01',user_id:'private',notes:'private'};
const event={id:'e',record_id:'d',balance:8000000,occurred_on:month+'-01',created_at:month+'-01T00:00:00Z'};
test('forecast reader uses owner token, paginates history, and excludes private metadata',async()=>{
 const calls=[];
 const supa=async(path,init,token)=>{calls.push({path,token});if(path.includes('finance_records'))return Response.json([deposit]);return Response.json(path.includes('offset=0')?Array.from({length:500},(_,i)=>({...event,id:String(i).padStart(3,'0')})):[]);};
 const read=new Function('supa','depositInterest',compile('lib/deposit-forecasts.ts')+';return depositForecasts;')(supa,depositInterest);
 const records=await read('owner-token');
 assert.ok(Math.abs(records[0].estimated_monthly_income-140000)<1e-6);assert.equal(records[0].user_id,undefined);assert.equal(records[0].notes,'');
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.token==='owner-token'));assert.ok(calls[2].path.includes('offset=500'));
 assert.ok(calls[1].path.includes('record_id=in.(d)'));
});
test('failed history reads reject rather than reporting incomplete interest',async()=>{
 const read=new Function('supa','depositInterest',compile('lib/deposit-forecasts.ts')+';return depositForecasts;')(async path=>path.includes('finance_records')?Response.json([deposit]):new Response(null,{status:503}),depositInterest);
 await assert.rejects(read('owner'),/Could not load deposit/);
});
test('records summary replaces grouped deposits once and preserves other assets and pagination',async()=>{
 const data={records:[deposit],total:12,page:1,summary:[{kind:'Deposit',amount:99},{kind:'Cash',amount:50}]};
 const api=new Function('z','kinds','income','expenses','isCurrency','session','supa','sameOrigin','depositForecasts',compile('app/api/records/route.ts')+';return GET;')(z,kinds,income,expenses,isCurrency,async()=>({token:'owner'}),async()=>Response.json(data),()=>true,async token=>{assert.equal(token,'owner');return [{...deposit,estimated_monthly_income:140000}];});
 const result=await (await api(new Request('https://local/api/records?summary=1'))).json();
 assert.equal(result.summary.length,2);assert.equal(result.summary[0].kind,'Cash');assert.equal(result.summary[1].estimated_monthly_income,140000);assert.deepEqual(result.records,data.records);assert.equal(result.total,12);
});
