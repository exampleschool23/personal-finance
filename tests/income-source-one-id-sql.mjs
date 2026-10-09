import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`13200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/132_income_source_one_id.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`;

test('migration 132 is in setup.sql',()=>{assert.ok(setup.includes(migration));});

test('an income source and its schedule share one id; payments and the bin follow it (migration 132)',{skip},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(auth);await db.exec(setup.slice(0,setup.indexOf(migration)));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const save=data=>db.query('SELECT save_income_source($1) AS data',[{kind:'Salary',currency:'USD',mode:'fixed',amount:1000,frequency:'Monthly',start_date:'2026-01-01',...data}]);
  const source=async n=>(await db.query('SELECT id,schedule_id FROM income_sources WHERE name=$1',[n])).rows[0];
  // Before: a source saved in the app gets a second id for its schedule, and so does a property's estimated rent.
  await save({id:id(10),name:'Job'});
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,earning_source_id,earning_due_on) VALUES($1,$2,'Job','Salary','USD',1000,'2026-02-01','Once',$3,'2026-02-01')",[id(11),id(1),id(10)]);
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES($1,$2,'Flat','Property','USD',90000,'2026-01-05','Once',700)",[id(20),id(1)]);
  const job=await source('Job'),flat=(await db.query('SELECT id,schedule_id FROM income_sources WHERE linked_record_id=$1',[id(20)])).rows[0];
  assert.notEqual(job.schedule_id,job.id);assert.notEqual(flat.schedule_id,flat.id);
  const occurrences=(await db.query('SELECT record_id,due_on::text,transaction_id FROM payment_occurrences')).rows;
  assert.deepEqual(occurrences,[{record_id:job.schedule_id,due_on:'2026-02-01',transaction_id:id(11)}]);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO deleted_items(id,user_id,source,data) VALUES($1,$2,'finance_records',$3)",[id(30),id(1),{id:id(31),name:'Job',kind:'Salary',currency:'USD',amount:1000,date:'2026-03-01',frequency:'Once',earning_source_id:id(10),earning_due_on:'2026-03-01'}]);
  const revision=(await db.query('SELECT revision FROM finance_records WHERE id=$1',[id(11)])).rows[0].revision;

  await db.exec(migration);await db.exec(migration);
  assert.deepEqual(await source('Job'),{id:job.schedule_id,schedule_id:job.schedule_id});
  assert.deepEqual((await db.query('SELECT id,schedule_id FROM income_sources WHERE linked_record_id=$1',[id(20)])).rows[0],{id:flat.schedule_id,schedule_id:flat.schedule_id});
  const payment=(await db.query('SELECT earning_source_id,revision FROM finance_records WHERE id=$1',[id(11)])).rows[0];
  assert.deepEqual(payment,{earning_source_id:job.schedule_id,revision},'the payment names the one id and is not counted as an edit');
  assert.deepEqual((await db.query('SELECT record_id,due_on::text,transaction_id FROM payment_occurrences')).rows,occurrences,'the schedule keeps its occurrences');
  assert.equal((await db.query('SELECT data FROM deleted_items WHERE id=$1',[id(30)])).rows[0].data.earning_source_id,job.schedule_id);

  // After: new sources and estimated rent are made with one id; a variable source keeps its own.
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  await save({id:id(40),name:'Bonus job'});
  assert.deepEqual(await source('Bonus job'),{id:id(40),schedule_id:id(40)});
  await save({id:id(41),name:'Tips',mode:'variable',amount:null,frequency:null,start_date:null});
  assert.deepEqual(await source('Tips'),{id:id(41),schedule_id:null});
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES($1,$2,'Shop','Property','USD',50000,'2026-01-05','Once',400)",[id(50),id(1)]);
  const shop=(await db.query('SELECT id,schedule_id FROM income_sources WHERE linked_record_id=$1',[id(50)])).rows[0];
  assert.equal(shop.id,shop.schedule_id);
  // A payment of the new source records its due date against that same id.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,earning_source_id,earning_due_on) VALUES($1,$2,'Bonus job','Salary','USD',1000,'2026-02-01','Once',$3,'2026-02-01')",[id(42),id(1),id(40)]);
  assert.equal((await db.query('SELECT record_id FROM payment_occurrences WHERE transaction_id=$1',[id(42)])).rows[0].record_id,id(40));
 }finally{await db.close();}
});
