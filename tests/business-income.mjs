import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {income,kinds,estimatedCashFlow} from '../lib/finance.ts';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`51000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('business income is income and does not duplicate business forecasts',()=>{
 assert.ok(income.includes('Business income'));assert.ok(kinds.includes('Business income'));
 const business={id:id(1),kind:'Business',estimated_monthly_income:1000};
 const payout={kind:'Business income',business_id:id(1),amount:1000,frequency:'Monthly'};
 assert.equal(estimatedCashFlow([business,payout]).plannedIncome,1000);
 assert.equal(estimatedCashFlow([payout]).plannedIncome,1000);
});
test('business income API requires a business and preserves the selected source and precision',async()=>{
 const calls=[];
 const {POST}=loadTS('app/api/records/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner',user:{id:id(1)}}),sameOrigin:()=>true,supa:async(path,init)=>{if(!init.body)return Response.json([{id:id(9),kind:'Cash',currency:'USD'}]);calls.push(JSON.parse(init.body));return Response.json([]);}}});
 const record={account_id:id(9),id:id(2),name:'Cafe payout',kind:'Business income',currency:'USD',amount:12.125,quantity:1,cost:0,rate:0,date:'2020-01-02',frequency:'Once',notes:''};
 const post=data=>POST(new Request('https://local/api/records',{method:'POST',body:JSON.stringify(data)}));
 assert.equal((await post(record)).status,400);assert.equal(calls.length,0);
 assert.equal((await post({...record,business_id:id(3)})).status,200);
 assert.equal(calls[0].business_id,id(3));assert.equal(calls[0].amount,12.125);assert.equal(calls[0].kind,'Business income');
 assert.equal((await post({...record,kind:'Rent income',business_id:id(3)})).status,200);
});
test('business income migration supports balances, schedules, lists and owner isolation',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8');
  await db.exec(setup.split('-- Explicit business income;')[0]);
  await db.exec(fs.readFileSync('migrations/041_business_income.sql','utf8'));
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${id(1)}','Cash','Cash','USD',1000,'2020-01-01','Once'),('${id(11)}','${id(1)}','Cafe','Business','USD',10000,'2020-01-01','Once'),('${id(12)}','${id(2)}','Private','Business','USD',10000,'2020-01-01','Once');SET ROLE authenticated;`);
  const balance=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
  const insert=(n,business,frequency='Once',kind='Business income')=>db.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,business_id,account_id) VALUES($1,$2,'Payout',$3,'USD',12.125,'2020-01-02',$4,$5,$6)`,[id(n),id(1),kind,frequency,business,frequency==='Once'?id(10):null]);
  await insert(20,id(11));assert.equal(await balance(),1012.125);
  await db.query('UPDATE finance_records SET amount=20.25 WHERE id=$1',[id(20)]);assert.equal(await balance(),1020.25);
  const page=(await db.query("SELECT finance_records_page(1,'cashflow',NULL,true) AS page")).rows[0].page;
  assert.ok(page.records.some(r=>r.kind==='Business income'&&r.business_id===id(11)));
  await db.query('DELETE FROM finance_records WHERE id=$1',[id(20)]);assert.equal(await balance(),1000);
  await assert.rejects(insert(21,null));await assert.rejects(insert(22,id(12)));await assert.rejects(insert(23,id(10)));assert.equal(await balance(),1000);
  await insert(24,id(11),'Monthly');
  await db.query("SELECT save_forecast_assignment($1,$2)",[id(24),id(10)]);
  const payload={id:id(25),target_id:id(24),account_id:id(10),date:'2020-02-02',notes:''};
  await db.query("SELECT planning_action('occurrence',$1)",[payload]);assert.equal(await balance(),1012.125);
  await db.query("SELECT planning_action('occurrence',$1)",[payload]);assert.equal(await balance(),1012.125);
  await insert(26,id(11),'Once','Rent income');assert.equal(await balance(),1024.25);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);
  assert.equal((await db.query("SELECT * FROM finance_records WHERE kind='Business income'")).rows.length,0);
 }finally{await db.close();}
});
