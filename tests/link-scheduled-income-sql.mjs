import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`73000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/119_link_scheduled_income.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);return d;}
const insert=(d,n,fields)=>{const keys=Object.keys(fields);return d.query(`INSERT INTO finance_records(id,user_id,${keys.join(',')}) VALUES($1,$2,${keys.map((_,i)=>'$'+(i+3)).join(',')})`,[id(n),id(1),...Object.values(fields)]);};
// The Pixel Game Club business pays out on the 1st of every month; EPAM pays a salary on the 5th; rent is due on the 10th.
async function workspace(d){
 await insert(d,10,{name:'Pixel Game Club',kind:'Business',currency:'USD',amount:20000,date:'2026-01-01'});
 await insert(d,11,{name:'Pixel Game Club',kind:'Business income',currency:'USD',amount:1000,date:'2026-01-01',frequency:'Monthly',business_id:id(10)});
 await insert(d,12,{name:'EPAM Systems',kind:'Salary',currency:'USD',amount:3450,date:'2026-01-05',frequency:'Monthly'});
 await insert(d,13,{name:'Flat rent',kind:'Rent expense',currency:'USD',amount:700,date:'2026-01-10',frequency:'Monthly'});
}
const pixel=(d,n,date,amount,extra={})=>insert(d,n,{name:'Pixel Game Club',kind:'Business income',currency:'USD',amount,date,frequency:'Once',business_id:id(10),...extra});
const occurrences=async d=>(await d.query('SELECT record_id,due_on::text AS due_on,status,transaction_id FROM payment_occurrences ORDER BY record_id,due_on')).rows.map(row=>[row.record_id,row.due_on,row.status,row.transaction_id]);
const named=async(d,n)=>{const row=(await d.query('SELECT occurrence_record_id,occurrence_due_on::text AS due FROM finance_records WHERE id=$1',[id(n)])).rows[0];return [row.occurrence_record_id,row.due];};

test('migration 119 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 119');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('a business payment from the bot takes its schedule id and settles the open payment of its month',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await pixel(d,20,'2026-10-06',425);
  assert.deepEqual(await named(d,20),[id(11),'2026-10-01']);
  assert.deepEqual(await occurrences(d),[[id(11),'2026-10-01','paid',id(20)]]);
 }finally{await d.close();}
});

test('own month first, then last month’s open payment, then it adds to this month’s',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await pixel(d,20,'2026-10-06',425);
  await pixel(d,21,'2026-10-25',1000);
  await pixel(d,22,'2026-10-26',575);
  assert.deepEqual([await named(d,20),await named(d,21),await named(d,22)],[[id(11),'2026-10-01'],[id(11),'2026-09-01'],[id(11),'2026-10-01']]);
  // The third payment adds to October: it settles nothing of its own.
  assert.deepEqual(await occurrences(d),[[id(11),'2026-09-01','paid',id(21)],[id(11),'2026-10-01','paid',id(20)]]);
 }finally{await d.close();}
});

test('salary and bills link only by the schedule id they name, never by name',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await insert(d,20,{name:'EPAM Systems',kind:'Salary',currency:'USD',amount:3450,date:'2026-10-06',frequency:'Once'});
  await insert(d,21,{name:'Salary',kind:'Salary',currency:'USD',amount:3450,date:'2026-10-06',frequency:'Once',occurrence_record_id:id(12)});
  await insert(d,22,{name:'Rent',kind:'Rent expense',currency:'USD',amount:700,date:'2026-10-09',frequency:'Once',occurrence_record_id:id(13)});
  assert.deepEqual([await named(d,20),await named(d,21),await named(d,22)],[[null,null],[id(12),'2026-10-05'],[id(13),'2026-10-10']]);
  assert.deepEqual(await occurrences(d),[[id(12),'2026-10-05','paid',id(21)],[id(13),'2026-10-10','paid',id(22)]]);
  await assert.rejects(insert(d,24,{name:'Gift',kind:'Other income',currency:'USD',amount:1,date:'2026-10-06',frequency:'Once',occurrence_record_id:id(13)}),/Choose a scheduled payment/);
  await assert.rejects(d.query('UPDATE finance_records SET occurrence_record_id=NULL WHERE id=$1',[id(21)]),/keeps its schedule/);
 }finally{await d.close();}
});

test('Record payment names its schedule and due date and settles it once',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await insert(d,30,{name:'Wallet',kind:'Cash',currency:'USD',amount:0,date:'2026-01-01',quantity:1});
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);
  await d.query("SELECT public.planning_action_with_actual_amount('occurrence',$1::jsonb)",[JSON.stringify({id:id(20),account_id:id(30),target_id:id(11),date:'2026-08-01',paid_on:'2026-10-06',amount:1000,notes:''})]);
  await d.exec('RESET ROLE;');
  assert.deepEqual(await named(d,20),[id(11),'2026-08-01']);
  assert.deepEqual(await occurrences(d),[[id(11),'2026-08-01','paid',id(20)]]);
 }finally{await d.close();}
});

test('nothing is linked without exactly one active schedule for the business',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await insert(d,14,{name:'Pixel weekend',kind:'Business income',currency:'USD',amount:200,date:'2026-01-03',frequency:'Monthly',business_id:id(10)});
  await pixel(d,21,'2026-10-06',425);
  assert.deepEqual(await occurrences(d),[]);
  await d.query('UPDATE finance_records SET archived=true WHERE id=$1',[id(14)]);
  await pixel(d,22,'2026-10-06',425);
  assert.deepEqual(await occurrences(d),[[id(11),'2026-10-01','paid',id(22)]]);
 }finally{await d.close();}
});

test('applying the migration settles this month’s business payments saved before it',async()=>{
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{
  const today=new Date(Date.now()+5*3600000).toISOString().slice(0,10);
  await workspace(d);
  await pixel(d,20,today,425);
  await pixel(d,21,'2025-01-15',300);
  await d.exec(migration);
  assert.deepEqual((await occurrences(d)).map(row=>[row[1],row[3]]),[[today.slice(0,8)+'01',id(20)]]);
 }finally{await d.close();}
});

const anyCurrency=fs.readFileSync('migrations/120_schedule_payments_any_currency.sql','utf8');
test('migration 120 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(anyCurrency),'setup.sql includes migration 120');
 const d=await db(setup.slice(0,setup.indexOf(anyCurrency)));
 try{await d.exec(anyCurrency);await d.exec(anyCurrency);}finally{await d.close();}
});

test('a payment in another currency settles its schedule and keeps its own amount and currency',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await pixel(d,20,'2026-10-06',5000000,{currency:'UZS'});
  await insert(d,21,{name:'Salary',kind:'Salary',currency:'UZS',amount:44000000,date:'2026-10-06',frequency:'Once',occurrence_record_id:id(12)});
  assert.deepEqual([await named(d,20),await named(d,21)],[[id(11),'2026-10-01'],[id(12),'2026-10-05']]);
  assert.deepEqual(await occurrences(d),[[id(11),'2026-10-01','paid',id(20)],[id(12),'2026-10-05','paid',id(21)]]);
  assert.deepEqual((await d.query('SELECT currency,amount::float AS amount FROM finance_records WHERE id=$1',[id(20)])).rows,[{currency:'UZS',amount:5000000}]);
 }finally{await d.close();}
});

test('applying migration 120 settles this month’s payments in another currency saved before it',async()=>{
 const d=await db(setup.slice(0,setup.indexOf(anyCurrency)));
 try{
  const today=new Date(Date.now()+5*3600000).toISOString().slice(0,10);
  await workspace(d);
  await pixel(d,20,today,5000000,{currency:'UZS'});
  assert.deepEqual(await occurrences(d),[]);
  await d.exec(anyCurrency);
  assert.deepEqual((await occurrences(d)).map(row=>[row[1],row[3]]),[[today.slice(0,8)+'01',id(20)]]);
 }finally{await d.close();}
});
