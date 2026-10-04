import { apiFunction } from './helpers/api-function.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {loadTS} from './helpers/load-ts.mjs';
const {planningReadFilters,currentReviewMonth}=loadTS('lib/planning-reads.ts');
const {categoryNameTaken,duplicateCategoryMessage}=loadTS('lib/category-names.ts');
const {signBackup}=loadTS('lib/backup-signature.ts');
const {debtPaymentsFrom}=loadTS('lib/planning.ts');
import {instrumentFor} from '../lib/market.ts';
import {exportCSV,parseCSV,mapCSV,FINANCE_RECORD_CSV_COLUMNS} from '../lib/csv.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id='10000000-0000-4000-8000-000000000001';
const req=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('planning API rejects anonymous, cross-origin and malformed operations and ignores forged ownership',async()=>{
 let authenticated=true,calls=[];
 const api=apiFunction('instrumentFor','z','session','supa','sameOrigin','readOwnerRows','isCurrency','depositForecasts','planningReadFilters','currentReviewMonth','categoryNameTaken','duplicateCategoryMessage',compile('app/api/planning/route.ts')+';return {GET,POST};')(instrumentFor,z,async()=>authenticated?{token:'owner'}:null,async(path,init,token)=>{if(init.method!=='POST'){assert.equal(path,'/rest/v1/savings_goals?select=investment_targets&limit=0');return Response.json([]);}calls.push({path,body:JSON.parse(init.body),token});return Response.json({ok:true});},r=>r.headers.get('origin')==='https://local',async table=>table==='transaction_categories'?[{id:'10000000-0000-4000-8000-000000000009',name:'QA Coffee',direction:'expense'}]:[],code=>['USD','EUR','UZS'].includes(code),async()=>[],planningReadFilters,currentReviewMonth,categoryNameTaken,duplicateCategoryMessage);
 authenticated=false;assert.equal((await api.GET()).status,401);assert.equal((await api.POST(req({}))).status,401);authenticated=true;
 assert.equal((await api.POST(req({},'https://elsewhere'))).status,403);
 for(const body of [{action:'unknown',data:{}},{action:'transfer',data:{id}},{action:'goal',data:{id,name:'Goal',account_id:id,target:10,allocated:11,target_date:null}},{action:'category',data:{id,name:''}}])assert.equal((await api.POST(req(body))).status,400);
 const goal={id,name:'Million',kind:'net_worth',currency:'USD',account_id:null,target:1000000,allocated:0,target_date:'2030-12-31',monthly_contribution:2000,annual_return:5};
 for(const data of [{...goal,currency:'XXX'},{...goal,account_id:id},{...goal,target_date:null},{...goal,allocated:1},{...goal,annual_return:101},{...goal,monthly_contribution:-1}])assert.equal((await api.POST(req({action:'goal',data}))).status,400);
 assert.equal((await api.POST(req({action:'goal',data:goal}))).status,200);assert.equal(calls.pop().body.p_data.kind,'net_worth');
 const accumulation={id,name:'One BTC',kind:'investment',account_id:null,holding_account_id:id,asset_kind:'Crypto',asset_symbol:'BTC',target:1,allocated:0,target_date:null,monthly_contribution:.01,annual_return:0};
 for(const invalid of [{holding_account_id:null},{asset_symbol:null},{asset_symbol:'UNKNOWNCOIN'},{account_id:id},{allocated:.1},{annual_return:8},{target:1e13},{monthly_contribution:1e13}])assert.equal((await api.POST(req({action:'goal',data:{...accumulation,...invalid}}))).status,400);
 assert.equal((await api.POST(req({action:'goal',data:accumulation}))).status,200);assert.equal(calls.pop().body.p_data.asset_symbol,'BTC');
 assert.equal((await api.POST(req({action:'goal',data:{...accumulation,asset_kind:'Stock',asset_symbol:'DXYZ'}}))).status,200);assert.equal(calls.pop().body.p_data.asset_kind,'Stock');
 const target={holding_account_id:id,asset_kind:'Crypto',asset_symbol:'BTC',target:4,monthly_contribution:.1};
 const more={holding_account_id:'10000000-0000-4000-8000-000000000002',asset_kind:'Stock',asset_symbol:'AAPL',target:25,monthly_contribution:1};
 assert.equal((await api.POST(req({action:'goal',data:{...accumulation,investment_targets:[target,more]}}))).status,200);
 const multiCall=calls.pop();assert.equal(multiCall.path,'/rest/v1/rpc/planning_investment_goal');assert.equal(multiCall.body.p_action,undefined);const saved=multiCall.body.p_data;assert.equal(saved.target,4);assert.equal(saved.monthly_contribution,.1);assert.deepEqual(saved.investment_targets,[target,more]);
 for(const investment_targets of [[],[target,target],[target,{...more,target:0}],[target,{...more,monthly_contribution:-1}],[target,{...more,holding_account_id:'missing'}],[target,{...target,asset_symbol:'UNKNOWNCOIN'}],Array(51).fill(target)])assert.equal((await api.POST(req({action:'goal',data:{...accumulation,investment_targets}}))).status,400);
 assert.equal((await api.POST(req({action:'goal',data:{...goal,investment_targets:[target]}}))).status,400);
 assert.equal(calls.length,0);
 // Letter case alone never makes a new category, whether the match is an added or a built-in one.
 for(const name of ['qa coffee',' OTHER EXPENSE '])assert.equal((await api.POST(req({action:'category',data:{id,name,direction:'expense'}}))).status,409);
 assert.equal(calls.length,0);assert.equal((await api.POST(req({action:'category',data:{id,name:'QA coffee',direction:'income'}}))).status,200);calls.pop();
 assert.equal((await api.POST(req({action:'category',data:{id,name:'Travel',direction:'expense',user_id:'attacker'}}))).status,200);assert.deepEqual(calls[0].body,{p_action:'category',p_data:{id,name:'Travel',direction:'expense'}});assert.equal(calls[0].token,'owner');
});
test('statement import produces stable distinct duplicate keys and authenticates before any write',async()=>{
 let calls=[];
 const api=apiFunction('z','session','supa','sameOrigin',compile('app/api/import/route.ts')+';return POST;')(z,async()=>({token:'owner'}),async(path,init,token)=>{calls.push({body:JSON.parse(init.body),token});return Response.json({added:2,skipped:0});},r=>r.headers.get('origin')==='https://local');
 const row={name:'Shop',amount:-20,date:'2026-09-01',notes:''};const data={batch_id:id,account_id:id,rows:[row,row]};
 assert.equal((await api(req(data))).status,200);assert.equal((await api(req(data))).status,200);const keys=calls[0].body.p_rows.map(r=>r.key);assert.notEqual(keys[0],keys[1]);assert.deepEqual(keys,calls[1].body.p_rows.map(r=>r.key));assert.equal(calls[0].token,'owner');
 assert.equal((await api(req({...data,rows:[{...row,date:'2026-02-30'}]}))).status,400);
 assert.equal((await api(req(data,'https://elsewhere'))).status,403);
});
test('background capture refuses missing or invalid secret before accessing service credentials',async()=>{
 const before=process.env.CRON_SECRET;
 const {GET:api}=loadTS('app/api/cron/portfolio-snapshots/route.ts',{'@/lib/server-market':{loadMarket:()=>{throw Error('unexpected');}},'@/lib/service-role':{serviceKeyHeaders:()=>({})},'@/lib/market':{instrumentFor:()=>null},'@/lib/portfolio-snapshots':{snapshotTotals:()=>null},'@/lib/deposit-interest':{depositToday:()=>'2026-09-17'},'@/lib/telegram-milestones':{announceNetWorthHigh:async()=>false}});
 try{delete process.env.CRON_SECRET;assert.equal((await api(new Request('https://local'))).status,401);process.env.CRON_SECRET='test-only-secret';assert.equal((await api(new Request('https://local',{headers:{authorization:'Bearer nope'}}))).status,401);}finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;}
});
test('backup uses one owner-scoped database snapshot and fails closed on incomplete reads',async()=>{
 let fail=false,calls=[];
 const api=apiFunction('signBackup','session','supa','readOwnerRows','exportCSV',compile('app/api/backup/route.ts')+';return GET;')(signBackup,async()=>({token:'owner'}),async(path,init,token)=>{calls.push({path,token});return fail?Response.json({error:'offline'},{status:503}):Response.json({version:1,tables:{finance_records:[]}});},async()=>[],()=> 'csv');
 let response=await api(new Request('https://local'));assert.equal(response.status,200);assert.equal((await response.json()).version,1);assert.deepEqual(calls,[{path:'/rest/v1/rpc/export_finance_backup',token:'owner'}]);
 fail=true;response=await api(new Request('https://local'));assert.equal(response.status,503);assert.equal((await response.json()).tables,undefined);
});
test('CSV backup exports owner records and cannot be misread as a signed bank statement',async()=>{
 const api=apiFunction('session','supa','readOwnerRows','exportCSV','FINANCE_RECORD_CSV_COLUMNS',compile('app/api/backup/route.ts')+';return GET;')(async()=>({token:'owner'}),()=>{throw Error('unexpected');},async(table,token)=>{assert.equal(table,'finance_records');assert.equal(token,'owner');return [{name:'Groceries',kind:'Other expense',currency:'USD',amount:42,date:'2026-09-18'}];},exportCSV,FINANCE_RECORD_CSV_COLUMNS);
 const response=await api(new Request('https://local?format=csv'));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const rows=parseCSV(await response.text());assert.deepEqual(rows[0],[...FINANCE_RECORD_CSV_COLUMNS]);assert.equal(rows[1][4],'42');
 assert.throws(()=>mapCSV(rows,{name:1,date:8,amount:4,notes:11,dateFormat:'iso',decimal:'.'}),/records export, not a bank statement/);
});

test('planning reads include holding accounts and computed deposit income exactly once',async()=>{
 const deposit={id:'deposit',kind:'Deposit',amount:1000,estimated_monthly_income:999};
 let fail=false;
 const get=apiFunction('instrumentFor','z','session','supa','sameOrigin','readOwnerRows','isCurrency','depositForecasts','planningReadFilters','currentReviewMonth','debtPaymentsFrom',compile('app/api/planning/route.ts')+';return GET;')(instrumentFor,z,async()=>({token:'owner'}),()=>{},()=>true,async(table,token)=>{assert.equal(token,'owner');return table==='finance_records'?[deposit,{id:'cash',kind:'Cash',amount:20}]:table==='holding_accounts'?[{id:'broker',kind:'Stock'}]:table==='mortgage_payments'?[{mortgage_id:'flat',paid_on:'2026-10-01'}]:[];},()=>true,async token=>{assert.equal(token,'owner');if(fail)throw Error('missing history');return [{id:'deposit',estimated_monthly_income:10}];},planningReadFilters,currentReviewMonth,debtPaymentsFrom);
 const result=await (await get()).json();
 assert.deepEqual(result.debtPayments,[{record_id:'flat',date:'2026-10-01'}]);
 assert.equal(result.records.length,2);assert.equal(result.records[0].estimated_monthly_income,10);assert.equal(result.records[0].amount,1000);assert.equal(result.holdingAccounts.length,1);
 fail=true;assert.equal((await get()).status,503);
});


test('multi-holding saves fail closed when the new save function is unavailable',async()=>{
 const calls=[];
 const api=apiFunction('instrumentFor','z','session','supa','sameOrigin','readOwnerRows','isCurrency','depositForecasts','planningReadFilters','currentReviewMonth',compile('app/api/planning/route.ts')+';return {POST};')(instrumentFor,z,async()=>({token:'owner'}),async(path)=>{calls.push(path);return path.includes('?select=')?Response.json([]):Response.json({code:'PGRST202'},{status:404});},()=>true,async()=>[],()=>true,async()=>[],planningReadFilters,currentReviewMonth);
 const target={holding_account_id:id,asset_kind:'Crypto',asset_symbol:'BTC',target:4};
 const data={id,name:'Portfolio',kind:'investment',account_id:null,target:4,allocated:0,target_date:null,investment_targets:[target,{...target,asset_symbol:'TON',target:100}]};
 const response=await api.POST(req({action:'goal',data}));assert.equal(response.status,409);assert.match((await response.json()).error,/migrations/);
 assert.deepEqual(calls,['/rest/v1/savings_goals?select=investment_targets&limit=0','/rest/v1/rpc/planning_investment_goal']);
});

test('a repayment above the outstanding balance names the reason before the database is asked',async()=>{
 // Live QA 2026-10-03: the database answered "Check the repayment and account currency." for two EUR records.
 const account='10000000-0000-4000-8000-0000000000a1',loan='10000000-0000-4000-8000-0000000000a2',calls=[];
 const rows=[{id:account,kind:'Cash',currency:'EUR',amount:900},{id:loan,kind:'Debt',currency:'EUR',amount:250}];
 const api=apiFunction('instrumentFor','z','session','supa','sameOrigin','readOwnerRows','isCurrency','depositForecasts','planningReadFilters','currentReviewMonth','categoryNameTaken','duplicateCategoryMessage',compile('app/api/planning/route.ts')+';return {GET,POST};')(instrumentFor,z,async()=>({token:'owner'}),async(path,init={})=>{if(!init.method)return Response.json(rows);calls.push(path);return Response.json({ok:true});},()=>true,async()=>[],()=>true,async()=>[],planningReadFilters,currentReviewMonth,categoryNameTaken,duplicateCategoryMessage);
 const repay=amount=>api.POST(req({action:'repayment',data:{id,account_id:account,target_id:loan,amount,received:0,fee:0,date:'2026-10-03',notes:''}}));
 const refused=await repay(300);
 assert.equal(refused.status,409);assert.equal((await refused.json()).error,'Repayment cannot exceed the outstanding balance.');assert.deepEqual(calls,[]);
 assert.equal((await repay(250)).status,200);assert.deepEqual(calls,['/rest/v1/rpc/planning_action']);
});

test('a second payment for an occurrence that is already paid is refused, while a retry of the same payment succeeds',async()=>{
 // Live QA 2026-10-03: the database answered {ok:true} for a second payment and silently dropped it.
 const account='10000000-0000-4000-8000-0000000000b1',schedule='10000000-0000-4000-8000-0000000000b2',paid='10000000-0000-4000-8000-0000000000b3',calls=[];
 const rows=[{id:account,kind:'Cash',currency:'USD',amount:900},{id:schedule,kind:'Living expense',currency:'USD',amount:45,frequency:'Monthly'}];
 const api=apiFunction('instrumentFor','z','session','supa','sameOrigin','readOwnerRows','isCurrency','depositForecasts','planningReadFilters','currentReviewMonth','categoryNameTaken','duplicateCategoryMessage',compile('app/api/planning/route.ts')+';return {GET,POST};')(instrumentFor,z,async()=>({token:'owner'}),async(path,init={})=>{
  if(path.startsWith('/rest/v1/payment_occurrences'))return Response.json(path.includes('due_on=eq.2026-09-05')?[{transaction_id:paid}]:[]);
  if(!init.method)return Response.json(rows);calls.push(path);return Response.json({ok:true});
 },()=>true,async()=>[],()=>true,async()=>[],planningReadFilters,currentReviewMonth,categoryNameTaken,duplicateCategoryMessage);
 const pay=(id,date)=>api.POST(req({action:'occurrence',data:{id,account_id:account,target_id:schedule,amount:30,date,notes:''}}));
 const refused=await pay(id,'2026-09-05');
 assert.equal(refused.status,409);assert.equal((await refused.json()).error,'This scheduled payment is already recorded. Keep its transaction.');assert.deepEqual(calls,[]);
 assert.equal((await pay(paid,'2026-09-05')).status,200);
 assert.equal((await pay(id,'2026-08-05')).status,200);
 assert.deepEqual(calls,['/rest/v1/rpc/planning_action_with_actual_amount','/rest/v1/rpc/planning_action_with_actual_amount']);
});
