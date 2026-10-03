import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`10400000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('a skipped scheduled payment keeps the note saying why, only for its owner',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/104_skipped_occurrence_notes.sql','utf8');
  assert.ok(setup.includes(migration),'the fresh setup includes the migration');
  await db.exec(setup);
  await db.exec(migration);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  await db.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({id:id(10),name:'Gym',kind:'Other expense',amount:40,currency:'USD',date:'2026-10-01',frequency:'Monthly',quantity:1,cost:0,rate:0,notes:''})]);
  const skip=(...args)=>db.query(`SELECT set_schedule_exception(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
  const note=async()=>(await db.query("SELECT notes FROM payment_occurrences WHERE record_id=$1 AND status='dismissed'",[id(10)])).rows[0]?.notes;
  // The plain skip still works, without a note.
  await skip(id(10),'2026-10-01',true);
  assert.equal(await note(),null);
  await skip(id(10),'2026-10-01',true,'  Did not get any money this month ');
  assert.equal(await note(),'Did not get any money this month');
  // Skipping again without a note keeps the first one; restoring clears it with the skip.
  await skip(id(10),'2026-10-01',true);
  assert.equal(await note(),'Did not get any money this month');
  await assert.rejects(skip(id(10),'2026-10-01',true,'x'.repeat(2001)),/Check the account fields/);
  await skip(id(10),'2026-10-01',false);
  assert.equal(await note(),undefined);
  await skip(id(10),'2026-10-01',true,'Closed for repairs');
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal(await note(),undefined,'another person cannot read the note');
  await assert.rejects(skip(id(10),'2026-10-01',true,'Not mine'),/Invalid scheduled/);
 }finally{await db.close();}
});
