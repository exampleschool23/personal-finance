import { apiFunction } from './helpers/api-function.mjs';
import {loadTS as loadCashAccountTS} from './helpers/load-ts.mjs';
const {requiresCashAccount}=loadCashAccountTS('lib/cash-account-required.ts');
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('linked cashflow converts once, reverses edits and deletion, and rejects invalid links',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8').split('-- Convert linked income and expense amounts using the saved dated rate.')[0];
  await db.exec(setup);
  await db.exec(fs.readFileSync('migrations/034_cashflow_account_conversion.sql','utf8'));
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${id(1)}','USD cash','Cash','USD',1000,'2020-01-01','Once'),('${id(11)}','${id(2)}','Private','Cash','USD',1000,'2020-01-01','Once');`);
  const balance=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
  const insert=(record,account,rate,date='2020-01-02',currency='UZS',kind='Living expense',amount=1200000)=>db.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id,account_exchange_rate,account_rate_date,account_currency) VALUES($1,$2,'Spending',$3,$4,$5,'2020-01-02','Once',$6,$7,$8,'USD')`,[id(record),id(1),kind,currency,amount,id(account),rate,date]);
  await insert(20,10,12000);assert.equal(await balance(),900);
  await db.query('UPDATE finance_records SET amount=amount WHERE id=$1',[id(20)]);assert.equal(await balance(),900);
  await db.query('UPDATE finance_records SET amount=600000 WHERE id=$1',[id(20)]);assert.equal(await balance(),950);
  await db.query('DELETE FROM finance_records WHERE id=$1',[id(20)]);assert.equal(await balance(),1000);
  await insert(21,10,12000,'2020-01-02','UZS','Other income');assert.equal(await balance(),1100);
  for(const [record,account,rate,date,currency] of [[22,11,12000],[23,10,null],[24,10,0],[25,10,-1],[26,10,12000,'2020-01-03'],[27,10,2,'2020-01-02','USD']])await assert.rejects(insert(record,account,rate,date,currency));
  assert.equal(await balance(),1100);
  await assert.rejects(insert(28,10,12000,'2020-01-02','UZS','Living expense',120000000));assert.equal(await balance(),1100);
  // A plan retains its UZS amount while the USD cash account pays the converted amount.
  await db.exec(`INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES('${id(30)}','${id(1)}','Groceries','Groceries','UZS',9000000,'2020-01-01');`);
  await insert(31,10,12000);await db.query('UPDATE finance_records SET expense_plan_id=$1 WHERE id=$2',[id(30),id(31)]);assert.equal(await balance(),1000);
  const row=(await db.query('SELECT amount,currency FROM finance_records WHERE id=$1',[id(31)])).rows[0];assert.equal(Number(row.amount),1200000);assert.equal(row.currency,'UZS');
  // Scheduled payments use the same trigger and occurrence idempotency.
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(40)}','${id(1)}','Salary','Salary','UZS',1200000,'2020-01-02','Monthly');`);
  const payload={id:id(41),account_id:id(10),target_id:id(40),date:'2020-02-02',notes:'',account_exchange_rate:12000,account_rate_date:'2020-02-01',account_currency:'USD'};
  await db.query("SELECT planning_action('occurrence',$1)",[payload]);assert.equal(await balance(),1100);
  await db.query("SELECT planning_action('occurrence',$1)",[payload]);assert.equal(await balance(),1100);
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,opened_on) VALUES('${id(60)}','${id(1)}','Debt','Debt','UZS',2400000,'2020-02-02','Once','2020-01-01');`);
  const paymentDate=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const repayment={id:id(61),account_id:id(10),target_id:id(60),date:paymentDate,amount:1200000,fee:120000,notes:''};
  const pay=payload=>db.query("SELECT record_repayment_with_fx($1,12000,'2020-02-01','USD','UZS')",[payload]);
  await pay(repayment);assert.equal(await balance(),990);
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(60)])).rows[0].amount),1200000);
  await pay(repayment);assert.equal(await balance(),990);
  await assert.rejects(pay({...repayment,fee:240000}));assert.equal(await balance(),990);
 }finally{await db.close();}
});

import ts from 'typescript';
import {z} from 'zod';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('record API verifies dated rate, preserves saved conversions on retry, and rejects forged rates',async()=>{
 let signedIn=true,offline=false,calls=[],prior=[];
 const kinds=['Cash','Living expense','Other income'];
 const post=apiFunction('requiresCashAccount','loadDatedExchangeRate','depositForecasts','isCurrency','z','kinds','income','expenses','assetRecordKinds','session','supa','sameOrigin',compile('app/api/records/route.ts')+';return POST;').bind(null,requiresCashAccount)(
  async(from,to,date)=>{assert.equal(from,'USD');assert.equal(to,'UZS');assert.equal(date,'2020-01-02');if(offline)throw Error('offline');return {rate:12000,effective_date:'2020-01-01'};},()=>[],value=>['USD','UZS'].includes(value),z,kinds,['Other income'],['Living expense'],['Cash'],async()=>signedIn?{user:{id:id(1)},token:'owner'}:null,
  async(path,init,token)=>{assert.equal(token,'owner');if(path.includes('select='))return Response.json([{id:id(10),kind:'Cash',currency:'USD'},...prior]);calls.push(JSON.parse(init.body).p_record??JSON.parse(init.body));return Response.json([]);},req=>req.headers.get('origin')==='https://local');
 const body={id:id(50),name:'Groceries',kind:'Living expense',currency:'UZS',amount:1200000,quantity:1,cost:0,rate:0,date:'2020-01-02',frequency:'Once',notes:'',account_id:id(10),account_exchange_rate:12000};
 const req=(patch={},origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify({...body,...patch})});
 assert.equal((await post(req({},'https://other'))).status,403);
 signedIn=false;assert.equal((await post(req())).status,401);signedIn=true;
 assert.equal((await post(req({account_exchange_rate:99999}))).status,409);assert.equal(calls.length,0);
 assert.equal((await post(req())).status,200);assert.equal(calls[0].amount,1200000);assert.equal(calls[0].account_exchange_rate,12000);assert.equal(calls[0].account_currency,'USD');assert.equal(calls[0].account_rate_date,'2020-01-01');
 offline=true;assert.equal((await post(req())).status,422);
 prior=[{...body,account_currency:'USD',account_rate_date:'2020-01-01'}];assert.equal((await post(req())).status,200);assert.equal(calls.length,2);
 assert.equal((await post(req({currency:'USD',account_exchange_rate:99999}))).status,200);assert.equal(calls[2].account_exchange_rate,null);
});
