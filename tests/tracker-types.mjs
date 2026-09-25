import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {historyUpdateTypes,historyEventLabel,historySeries,trackedKinds} from '../lib/investment-history.ts';

test('every tracked category offers appropriate actions with translated labels',()=>{
 const expected={Cash:['valuation'],Stock:['valuation','income','expense'],Crypto:['valuation','income','expense'],Deposit:['valuation','income','expense'],Property:['valuation','contribution','withdrawal','income','expense'],Business:['valuation','contribution','withdrawal','income','expense'],'Money lent':['contribution','withdrawal'],Mortgage:['contribution'],Loan:['contribution','withdrawal'],Debt:['contribution','withdrawal']};
 const dictionaries=['en','ru','uz'].map(lang=>JSON.parse(fs.readFileSync(`lib/locales/${lang}.json`,'utf8')));
 for(const kind of trackedKinds){
  assert.deepEqual(historyUpdateTypes(kind),expected[kind],kind);
  for(const type of expected[kind])for(const dictionary of dictionaries)assert.ok(dictionary[historyEventLabel(kind,type)],`${kind}: ${historyEventLabel(kind,type)}`);
 }
 assert.equal(historyEventLabel('Debt','contribution'),'Add to debt');
 assert.equal(historyEventLabel('Loan','withdrawal'),'Repayment made');
 assert.equal(historyEventLabel('Money lent','withdrawal'),'Repayment received');
 assert.equal(historyEventLabel('Deposit','income'),'Interest received');
 assert.equal(historyEventLabel('Property','income'),'Rent income');
 assert.deepEqual(historyUpdateTypes('Salary'),[]);
});

test('principal additions and repayments remain separate from income and expense totals',()=>{
 const events=[['baseline',0,1000],['contribution',200,1200],['withdrawal',300,900]].map(([event_type,amount,balance],i)=>({id:String(i),record_id:'debt',event_type,amount,balance,occurred_on:'2026-01-01',created_at:`2026-01-01T00:00:0${i}Z`,ownership_percentage:100,principal:0,interest:0,notes:''}));
 const stats=historySeries(events);
 assert.equal(stats.balance,900);assert.equal(stats.additions,200);assert.equal(stats.repayments,300);
 assert.equal(stats.receipts,0);assert.equal(stats.expenses,0);
});

test('typed tracker SQL computes principal, rejects invalid actions, and preserves history on upgrade',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const migration=fs.readFileSync('migrations/028_typed_tracker_updates.sql','utf8');
 const setup=fs.readFileSync('database/setup.sql','utf8');
 assert.ok(setup.includes(migration));
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(setup.slice(0,setup.indexOf(migration)));
  const kinds=['Debt','Loan','Money lent','Mortgage','Cash','Property','Deposit','Stock','Crypto','Business'];
  for(const [i,kind] of kinds.entries())await db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,date) VALUES($1,$2,$3,$3,$4,1000,1,CURRENT_DATE)',[id(i),owner,kind,'USD']);
  const before=(await db.query('SELECT * FROM investment_history ORDER BY id')).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM investment_history ORDER BY id')).rows,before);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const save=(n,record,type,amount,balance=null,date=today)=>db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(n),id(record),type,date,amount,balance,'']);
  const balance=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  for(const record of [0,1,2]){
   const n=100+record*20;
   await save(n,record,'contribution',200.25);assert.equal(await balance(record),1200.25);
   await save(n+1,record,'withdrawal',300.1);assert.equal(await balance(record),900.15);
   // A retry after subsequent changes must not apply the addition again.
   await save(n,record,'contribution',200.25);assert.equal(await balance(record),900.15);
   await assert.rejects(save(n,record,'contribution',201),/different details/);
   await assert.rejects(save(n+2,record,'withdrawal',901),/cannot exceed/);
   await assert.rejects(save(n+2,record,'contribution',10,500),/balance override/);
   await assert.rejects(save(n+2,record,'contribution',10,null,'2000-01-01'),/latest balance date/);
   await assert.rejects(save(n+2,record,'contribution',1e15),/Check the tracker/);
   for(const type of ['income','expense','valuation'])await assert.rejects(save(n+2,record,type,type==='valuation'?0:10,type==='valuation'?10:null),/not available/);
   assert.equal(await balance(record),900.15);
   assert.equal((await db.query('SELECT * FROM investment_history WHERE id=$1',[id(n+2)])).rows.length,0);
   await save(n+3,record,'withdrawal',900.15);assert.equal(await balance(record),0);
   await assert.rejects(save(n+4,record,'withdrawal',0.01),/cannot exceed/);
   const entries=(await db.query('SELECT * FROM investment_history WHERE record_id=$1 ORDER BY created_at,id',[id(record)])).rows;
   assert.deepEqual(entries.map(e=>Number(e.balance)),[1000,1200.25,900.15,0]);
  }
  // Principal never produces fake income or expense records.
  assert.equal(Number((await db.query('SELECT count(*) FROM finance_records')).rows[0].count),kinds.length);
  await save(200,3,'contribution',100);assert.equal(await balance(3),1100);
  await assert.rejects(save(201,3,'withdrawal',100),/Record payment/);
  await assert.rejects(save(201,3,'valuation',0,100),/not available/);
  await db.query('SELECT record_mortgage_payment($1,$2,$3,$4,$5,$6)',[id(202),id(3),100,10,today,'']);assert.equal(await balance(3),1000);
  await save(203,4,'valuation',0,1200);assert.equal(await balance(4),1200);
  for(const type of ['income','expense','contribution','withdrawal'])await assert.rejects(save(204,4,type,10,['contribution','withdrawal'].includes(type)?100:null),/not available/);
  for(const record of [5,6,7,8,9]){
   await save(210+record,record,'valuation',0,2000);assert.equal(await balance(record),2000);
   await save(220+record,record,'income',10);assert.equal(await balance(record),2000);
  }
  await assert.rejects(save(240,5,'contribution',10),/Check the tracker/);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);
  await assert.rejects(save(250,0,'contribution',10),/Investment not found/);
  assert.equal((await db.query('SELECT * FROM investment_history')).rows.length,0);
 }finally{await db.close();}
});

test('automatic mortgage snapshots are balance updates, not manual corrections',()=>{
 assert.equal(historyEventLabel('Mortgage','valuation'),'Balance update');
 assert.equal(historyEventLabel('Mortgage','mortgage_payment'),'Mortgage payment');
 assert.equal(historyEventLabel('Loan','valuation'),'Balance correction');
});
