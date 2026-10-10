import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`f1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/139_budget_amount_once.sql','utf8');
async function db(sql=setup){
 const {PGlite}=await import(process.env.PGLITE_MODULE);const d=new PGlite();
 await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await d.exec(sql);
 await d.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
 return d;
}
const rows=async d=>(await d.query("SELECT category_key,month::text,amount::numeric AS amount,applies_forward FROM budget_amounts ORDER BY category_key,month")).rows.map(r=>[r.category_key,r.month,Number(r.amount),r.applies_forward]);

test('migration 139 is in setup.sql and safe to re-run',{skip:!process.env.PGLITE_MODULE},async()=>{
 assert.ok(setup.includes(migration));
 assert.match(migration,/DECLARE owner uuid:=public\.active_owner\(\);/,'budget amounts are a shared table: the household owner, never auth.uid()');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,139);}finally{await d.close();}
});

test('set_budget_amount_once: this month only and nothing planned after, in one call (SOLID-001, CONC-008)',{skip:!process.env.PGLITE_MODULE},async()=>{
 const d=await db();
 try{
  const set=(key,month,amount,forward)=>d.query('SELECT set_budget_amount($1,$2,$3,$4,$5)',[key,month,amount,'USD',forward]);
  const once=(key,month,amount)=>d.query('SELECT set_budget_amount_once($1,$2,$3,$4)',[key,month,amount,'USD']);
  await set('Groceries','2026-03-01',400,true);
  await set('Groceries','2026-09-01',999,true);
  await once('Groceries','2026-06-01',300);
  assert.deepEqual(await rows(d),[['Groceries','2026-03-01',400,true],['Groceries','2026-06-01',300,false],['Groceries','2026-07-01',0,true]],'June is its own; from July nothing is planned and later months are replaced, as repeatBudgetAmount lays it out');
  // Taking the tick off a forward amount of the same month moves nothing on: next month plans nothing.
  await set('Groceries','2026-06-01',500,true);
  await once('Groceries','2026-06-01',450);
  assert.deepEqual(await rows(d),[['Groceries','2026-03-01',400,true],['Groceries','2026-06-01',450,false],['Groceries','2026-07-01',0,true]]);
  await assert.rejects(once('Groceries','2026-06-15',1),/whole months/);
  // Another owner sees none of it and cannot change it.
  await d.exec(`SET request.jwt.claim.sub='${id(2)}'`);
  assert.deepEqual(await rows(d),[]);
  await once('Groceries','2026-06-01',10);
  assert.deepEqual(await rows(d),[['Groceries','2026-06-01',10,false],['Groceries','2026-07-01',0,true]]);
  await d.exec(`SET request.jwt.claim.sub='${id(1)}'`);
  assert.equal((await rows(d)).length,3,'the first owner\'s budget is untouched');
  // Signed out, nothing is saved.
  await d.exec('RESET ROLE;SET request.jwt.claim.sub=\'\';SET ROLE anon');
  await assert.rejects(once('Groceries','2026-06-01',1),/permission denied|sign in/i);
 }finally{await d.close();}
});
