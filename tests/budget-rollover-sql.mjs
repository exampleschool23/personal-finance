import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setupSql=fs.readFileSync('database/setup.sql','utf8');

async function database(){
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(setupSql);
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
 return db;
}

test('migration 098 is mirrored into the fresh-database setup',()=>{
 assert.ok(setupSql.includes(fs.readFileSync('migrations/098_budget_rollover.sql','utf8').trim()));
});

test('rollover settings keep a starting balance with its currency and are private to their owner',{skip:!process.env.PGLITE_MODULE},async()=>{
 const db=await database();
 try{
  await db.exec(`INSERT INTO budget_categories(category_key,rollover,rollover_start,rollover_balance,rollover_currency,rollover_negative) VALUES('Charity',true,'2026-03-01',120.5,'EUR',false),('flex:flexible',true,'2026-01-01',0,NULL,true);`);
  const row=(await db.query("SELECT rollover_balance::text AS balance,rollover_currency,rollover_negative FROM budget_categories WHERE category_key='Charity'")).rows[0];
  assert.deepEqual(row,{balance:'120.5',rollover_currency:'EUR',rollover_negative:false});
  assert.equal((await db.query("SELECT rollover_negative FROM budget_categories WHERE category_key='flex:flexible'")).rows[0].rollover_negative,true,'overspending carries by default, as before');
  await assert.rejects(db.exec(`INSERT INTO budget_categories(category_key,rollover_balance) VALUES('Rent',-5)`),/check/i);
  await assert.rejects(db.exec(`INSERT INTO budget_categories(category_key,rollover_balance) VALUES('Rent',5)`),/rollover_currency/,'a balance needs its currency');
  await assert.rejects(db.exec(`INSERT INTO budget_categories(category_key,rollover_balance,rollover_currency) VALUES('Rent',5,'usd')`),/check/i);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM budget_categories')).rows[0].n,0);
  await db.exec(`UPDATE budget_categories SET rollover_balance=1,rollover_currency='USD' WHERE user_id='${id(1)}'`);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.equal((await db.query("SELECT rollover_balance::text AS b FROM budget_categories WHERE category_key='Charity'")).rows[0].b,'120.5','another owner changed nothing');
 }finally{await db.close();}
});

test('verified backups include budgets and rollover settings and restore them exactly',{skip:!process.env.PGLITE_MODULE},async()=>{
 const db=await database();
 try{
  await db.query('SELECT set_budget_amount($1,$2,$3,$4,$5)',['Charity','2026-03-01',300.25,'USD',true]);
  await db.exec(`INSERT INTO budget_categories(category_key,budget_type,rollover,rollover_start,rollover_balance,rollover_currency,rollover_negative) VALUES('Charity','flexible',true,'2026-03-01',40,'USD',false);INSERT INTO budget_settings(mode,apply_forward) VALUES('flex',true);`);
  const backup=(await db.query('SELECT export_finance_backup()::text AS backup')).rows[0].backup;
  const parsed=JSON.parse(backup);
  for(const table of ['budget_amounts','budget_categories','budget_settings'])assert.equal(parsed.tables[table].length,1,table);
  assert.equal(parsed.tables.budget_categories[0].rollover_balance,40);
  assert.equal(parsed.tables.budget_categories[0].rollover_negative,false);
  // Change everything, then restore the backup.
  await db.exec(`UPDATE budget_categories SET rollover=false,rollover_balance=0,rollover_negative=true;DELETE FROM budget_amounts;UPDATE budget_settings SET mode='category';INSERT INTO budget_categories(category_key) VALUES('Rent expense');`);
  const preview=(await db.query('SELECT preview_finance_restore($1) AS result',[backup])).rows[0].result;
  assert.equal(preview.counts.budget_categories,1);
  await db.query('SELECT restore_finance_backup($1,$2)',[backup,preview.expected_state]);
  const restored=(await db.query('SELECT export_finance_backup() AS backup')).rows[0].backup;
  for(const table of ['budget_amounts','budget_categories','budget_settings']){
   const strip=rows=>rows.map(row=>JSON.stringify(row)).sort();
   assert.deepEqual(strip(restored.tables[table]),strip(parsed.tables[table]),table);
  }
  assert.equal((await db.query("SELECT amount::text FROM budget_amounts")).rows[0].amount,'300.25','precision is kept');
  // Another owner cannot preview this owner's budget backup.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(db.query('SELECT preview_finance_restore($1)',[backup]),/unchanged verified/);
 }finally{await db.close();}
});

test('a backup made before budgets were included restores without emptying the current budget',{skip:!process.env.PGLITE_MODULE},async()=>{
 const db=await database();
 try{
  await db.exec(`INSERT INTO budget_categories(category_key,rollover,rollover_start) VALUES('Charity',true,'2026-03-01');`);
  // An older signed backup: the same payload without the budget tables, registered as the server does for a portable backup.
  const current=JSON.parse((await db.query('SELECT export_finance_backup()::text AS backup')).rows[0].backup);
  for(const table of ['budget_amounts','budget_categories','budget_settings'])delete current.tables[table];
  current.id=id(50);
  const older=JSON.stringify(current);
  await db.exec('RESET ROLE;');
  await db.query('SELECT register_verified_finance_backup($1,$2)',[older,id(1)]);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const preview=(await db.query('SELECT preview_finance_restore($1) AS result',[older])).rows[0].result;
  assert.equal(preview.counts.budget_categories,undefined);
  await db.query('SELECT restore_finance_backup($1,$2)',[older,preview.expected_state]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM budget_categories')).rows[0].n,1,'the budget is kept');
 }finally{await db.close();}
});
