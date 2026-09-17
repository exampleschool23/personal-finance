import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('expense plan migration: ownership, spending links, month totals and updates', {skip:!process.env.PGLITE_MODULE}, async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const plan='20000000-0000-4000-8000-000000000001',otherPlan='20000000-0000-4000-8000-000000000002';
 const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  // Exercise the incremental migration against the previous fresh setup.
  const migration=fs.readFileSync('migrations/013_monthly_expense_plans.sql','utf8');
  const fullSetup=fs.readFileSync('database/setup.sql','utf8');
  const nextMigration=fs.readFileSync('migrations/014_recurring_stop_dates.sql','utf8');
  assert.ok(fullSetup.includes(nextMigration));
  const setup=fullSetup.slice(0,fullSetup.indexOf(nextMigration)).trimEnd()+'\n';assert.ok(setup.endsWith(migration));
  await db.exec(setup.slice(0,-migration.length));await db.exec(migration);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';INSERT INTO expense_plans(id,name,category,currency,amount,start_date) VALUES('${plan}','Mum','Family support','USD',500,'2026-09-01');`);
  const spend=(n,amount,date='2026-09-10',extra={})=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,expense_plan_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(n),owner,'Mum',extra.kind||'Other expense',extra.currency||'USD',amount,date,extra.frequency||'Once',extra.plan||plan]);
  await spend(1,100);await spend(2,200,'2026-09-30');await spend(3,50,'2026-10-01');
  const read=async month=>(await db.query('SELECT expense_plan_month($1) AS plans',[month])).rows[0].plans;
  assert.equal(Number((await read('2026-09-01'))[0].spent),300);assert.equal(Number((await read('2026-10-01'))[0].spent),50);
  await assert.rejects(spend(4,1,'2026-09-01',{frequency:'Monthly'}),/Check the expense plan/);
  await assert.rejects(spend(4,1,'2026-09-01',{currency:'UZS'}),/Check the expense plan/);
  await assert.rejects(spend(4,1,'2026-09-01',{kind:'Salary'}),/Check the expense plan/);
  await assert.rejects(spend(4,1,'2026-08-31'),/Check the expense plan/);
  await assert.rejects(db.query('UPDATE expense_plans SET end_date=$1 WHERE id=$2',['2026-09-30',plan]),/compatible/);
  await assert.rejects(db.query("UPDATE expense_plans SET currency='EUR' WHERE id=$1",[plan]),/compatible/);
  await assert.rejects(db.query('DELETE FROM expense_plans WHERE id=$1',[plan]),/foreign key/);
  await db.query('UPDATE finance_records SET amount=150 WHERE id=$1',[id(1)]);
  assert.equal(Number((await read('2026-09-01'))[0].spent),350);
  await db.query('DELETE FROM finance_records WHERE id=$1',[id(2)]);
  assert.equal(Number((await read('2026-09-01'))[0].spent),150);
  await db.exec(`SET request.jwt.claim.sub='${other}';INSERT INTO expense_plans(id,name,category,currency,amount,start_date) VALUES('${otherPlan}','Food','Groceries','EUR',200,'2026-09-01');`);
  assert.equal((await read('2026-09-01')).length,1);assert.equal((await read('2026-09-01'))[0].id,otherPlan);
  await assert.rejects(spend(4,10),/Check the expense plan|row-level security/);
  await db.exec(`SET request.jwt.claim.sub='${owner}';`);
  await assert.rejects(spend(4,10,'2026-09-01',{plan:otherPlan,currency:'EUR'}),/Check the expense plan/);
  // New-month totals start at zero; plans and spending do not create duplicate rows.
  assert.equal(Number((await read('2026-11-01'))[0].spent),0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_records')).rows[0].n,2);
 }finally{await db.close();}
});
