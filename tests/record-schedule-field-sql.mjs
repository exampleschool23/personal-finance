import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`10100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('saving a record accepts its schedule interval, as income from a source sends it',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/101_restore_record_schedule_field.sql','utf8');
  assert.ok(setup.includes(migration),'the fresh setup includes the migration');
  await db.exec(setup);
  await db.exec(migration);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const save=record=>db.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({quantity:1,cost:0,rate:0,notes:'',currency:'USD',date:'2026-10-03',...record})]);
  await save({id:id(10),name:'Cash',kind:'Cash',amount:98,frequency:'Once',recurrence_days:null});
  await save({id:id(11),name:'Salary',kind:'Salary',amount:5700,frequency:'Once',recurrence_days:null,account_id:id(10)});
  await save({id:id(12),name:'Cleaning',kind:'Other expense',amount:20,frequency:'Custom',recurrence_days:14});
  assert.equal((await db.query('SELECT recurrence_days FROM finance_records WHERE id=$1',[id(12)])).rows[0].recurrence_days,14);
  await assert.rejects(save({id:id(13),name:'Bad',kind:'Salary',amount:1,frequency:'Once',surprise:true}),/Check the record fields/);
 }finally{await db.close();}
});
