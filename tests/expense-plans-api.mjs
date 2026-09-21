import { apiFunction } from './helpers/api-function.mjs';
import {loadTS as loadCashAccountTS} from './helpers/load-ts.mjs';
const {requiresCashAccount}=loadCashAccountTS('lib/cash-account-required.ts');
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {expensePlanCategories,expensePlanMonth} from '../lib/expense-plans.ts';
import {isCurrency} from '../lib/currencies.ts';
import {kinds,income,expenses} from '../lib/finance.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let auth=true,calls=[];
const session=async()=>auth?{token:'owner-token',user:{id:'owner'}}:null;
const supa=async(path,init,token)=>{if(path.includes('account_exchange_rate'))return Response.json([{id:plan.id,kind:'Cash',currency:'EUR'}]);calls.push({path,init,token});return Response.json([]);};
const sameOrigin=req=>req.headers.get('origin')==='https://local';
const api=apiFunction('z','isCurrency','expensePlanCategories','expensePlanMonth','session','supa','sameOrigin',compile('app/api/expense-plans/route.ts')+';return {GET,POST,DELETE};')(z,isCurrency,expensePlanCategories,expensePlanMonth,session,supa,sameOrigin);
const plan={id:'10000000-0000-4000-8000-000000000001',name:'Mum',category:'Family support',currency:'EUR',amount:500,start_date:'2026-09-01',end_date:null};
const request=(data,method='POST')=>new Request('https://local',{method,headers:{origin:'https://local','Content-Type':'application/json'},body:JSON.stringify(data)});
test('saves the owner-scoped plan with full fiat support and stable id',async()=>{
 calls=[];assert.equal((await api.POST(request({...plan,user_id:'attacker'}))).status,200);
 assert.equal(calls[0].token,'owner-token');const body=JSON.parse(calls[0].init.body);assert.equal(body.user_id,'owner');assert.equal(body.id,plan.id);assert.equal(body.currency,'EUR');
});
test('validates dates, amounts, category, end date and identifiers before database access',async()=>{
 for(const patch of [{amount:0},{amount:-1},{amount:1e16},{currency:'ZZZ'},{category:'bad'},{start_date:'2026-02-30'},{end_date:'2026-08-01'},{id:'bad'}]){calls=[];assert.equal((await api.POST(request({...plan,...patch}))).status,400);assert.equal(calls.length,0);}
 assert.equal((await api.GET(new Request('https://local?month=2026-13'))).status,400);
 assert.equal((await api.DELETE(request({id:'bad'},'DELETE'))).status,400);
});
test('authentication, origin checks and month-scoped reads',async()=>{
 auth=false;assert.equal((await api.GET(new Request('https://local'))).status,401);auth=true;
 assert.equal((await api.POST(new Request('https://local',{method:'POST'}))).status,403);
 calls=[];assert.equal((await api.GET(new Request('https://local?month=2026-09'))).status,200);assert.equal(calls[0].path,'/rest/v1/rpc/expense_plan_month');assert.deepEqual(JSON.parse(calls[0].init.body),{p_month:'2026-09-01'});
});
test('record API preserves the expense plan link and rejects linked recurring or income entries',async()=>{
 const post=apiFunction('requiresCashAccount','z','isCurrency','kinds','income','expenses','session','supa','sameOrigin','depositForecasts',compile('app/api/records/route.ts')+';return POST;').bind(null,requiresCashAccount)(z,isCurrency,kinds,income,expenses,session,supa,sameOrigin,async()=>[]);
 const record={account_id:plan.id,id:plan.id,name:'Mum payment',kind:'Other expense',currency:'EUR',amount:100,quantity:1,cost:0,rate:0,date:'2026-09-10',frequency:'Once',notes:'',expense_plan_id:plan.id};
 calls=[];assert.equal((await post(request(record))).status,200);assert.equal(JSON.parse(calls[0].init.body).p_record.expense_plan_id,plan.id);
 for(const patch of [{frequency:'Monthly'},{kind:'Salary'},{business_id:plan.id},{expense_plan_id:'bad'}])assert.equal((await post(request({...record,...patch}))).status,400);
});

test('recurring stop date saves without deleting and rejects invalid intervals',async()=>{
 const post=apiFunction('requiresCashAccount','z','isCurrency','kinds','income','expenses','session','supa','sameOrigin','depositForecasts',compile('app/api/records/route.ts')+';return POST;').bind(null,requiresCashAccount)(z,isCurrency,kinds,income,expenses,session,supa,sameOrigin,async()=>[]);
 const record={id:plan.id,name:'Salary',kind:'Salary',currency:'EUR',amount:100,quantity:1,cost:0,rate:0,date:'2026-09-10',frequency:'Monthly',notes:'',end_date:'2026-09-30'};
 calls=[];assert.equal((await post(request(record))).status,200);assert.equal(calls[0].init.method,'POST');assert.equal(JSON.parse(calls[0].init.body).p_record.end_date,record.end_date);
 for(const patch of [{end_date:'2026-09-09'},{end_date:'2026-02-30'},{frequency:'Once'},{kind:'Cash'}]){calls=[];assert.equal((await post(request({...record,...patch}))).status,400);assert.equal(calls.length,0);}
 assert.equal((await post(request({...record,end_date:null}))).status,200);
});
test('delete endpoints require the recoverable deletion RPC',async()=>{
 calls=[];assert.equal((await api.DELETE(request({id:plan.id},'DELETE'))).status,200);
 assert.equal(calls[0].path,'/rest/v1/rpc/move_item_to_deleted');assert.deepEqual(JSON.parse(calls[0].init.body),{p_id:plan.id,p_source:'expense_plans'});
 const remove=apiFunction('requiresCashAccount','z','isCurrency','kinds','income','expenses','session','supa','sameOrigin','depositForecasts',compile('app/api/records/route.ts')+';return DELETE;').bind(null,requiresCashAccount)(z,isCurrency,kinds,income,expenses,session,supa,sameOrigin,async()=>[]);
 calls=[];assert.equal((await remove(request({id:plan.id},'DELETE'))).status,200);
 assert.equal(calls[0].path,'/rest/v1/rpc/move_item_to_deleted');assert.deepEqual(JSON.parse(calls[0].init.body),{p_id:plan.id,p_source:'finance_records'});
});
