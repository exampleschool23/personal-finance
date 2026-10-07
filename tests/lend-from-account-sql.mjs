import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`74000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/121_lend_from_account.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);return d;}
const lentDay=async d=>(await d.query("SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date-3)::text AS day")).rows[0].day;
const amount=async(d,n)=>{const row=(await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0];return row?Number(row.amount):null;};
// Abror borrows 600,000 UZS, paid out of the UZS wallet three days ago.
async function lend(d,extra={}){
 const lentOn=await lentDay(d);
 const record={id:id(20),name:'Abror',kind:'Money lent',currency:'UZS',amount:600000,quantity:1,cost:0,rate:0,date:null,lent_date:lentOn,frequency:'Once',notes:'',...extra};
 return d.query('SELECT lend_from_account($1::jsonb,$2) AS saved',[JSON.stringify(record),id(10)]);
}
async function workspace(d,wallet=1000000){
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'UZS wallet','Cash','UZS',$3,'2026-01-01','2026-01-01')",[id(10),id(1),wallet]);
 await d.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
}

test('migration 121 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 121');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('money lent from an account leaves it, once, and the loan starts on its lent date',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  const saved=(await lend(d)).rows[0].saved;
  assert.equal(Number(saved[0].amount),600000);
  assert.deepEqual([await amount(d,10),await amount(d,20)],[400000,600000]);
  const history=(await d.query("SELECT event_type,occurred_on::text AS day,amount,balance FROM investment_history WHERE record_id=$1 ORDER BY occurred_on,created_at",[id(20)])).rows.map(row=>[row.event_type,row.day,Number(row.amount),Number(row.balance)]);
  const lentOn=await lentDay(d);
  assert.deepEqual(history.at(-1),['contribution',lentOn,600000,600000]);
  assert.ok(history.every(([,day])=>day===lentOn));
  // A retry after a lost response moves no more cash.
  await lend(d);
  assert.deepEqual([await amount(d,10),await amount(d,20)],[400000,600000]);
  await assert.rejects(lend(d,{amount:700000}),/already saved with different details/);
 }finally{await d.close();}
});

test('a loan larger than the account balance is refused and nothing is saved',async()=>{
 const d=await db(setup);
 try{
  await workspace(d,500000);
  await assert.rejects(lend(d),/Not enough money in the selected cash account/);
  assert.deepEqual([await amount(d,10),await amount(d,20)],[500000,null]);
  await assert.rejects(lend(d,{currency:'USD'}),/Choose a cash account in the record currency/);
  assert.equal(await amount(d,20),null);
 }finally{await d.close();}
});
